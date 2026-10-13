#!/usr/bin/env node
// NEXA: локальный сервер игры + прокси для встроенного браузера (js/desktop.js).
//   node tools/serve.js [порт]      (по умолчанию 8765, только 127.0.0.1)
// 1) Отдаёт файлы игры (как python -m http.server, плюс Range и 304).
// 2) Любой сайт открывается во фрейме игры: страница https://example.com/a?b=1 доступна по http://example.com.px.localhost:ПОРТ/a?b=1
//    (http-сайты — .pxh.localhost, нестандартный порт — example.com.p8080.px.localhost). *.localhost браузер сам ведёт на 127.0.0.1, так что работает без настроек.
//    Прокси забирает страницу с настоящего сайта, снимает запреты на показ во фрейме (X-Frame-Options, CSP frame-ancestors, COOP/COEP...), подменяет в тексте
//    страниц, скриптов и стилей абсолютные ссылки на адреса прокси (ссылки, формы, редиректы, fetch/XHR — всё остаётся внутри игры), переписывает cookie и CORS.
//    В каждую HTML-страницу вставляется маленький скрипт (js/px-shim.js-текст ниже): ловит ссылки и window.open, сообщает игре адрес и заголовок страницы.
// Безопасность: слушает только 127.0.0.1; в прокси закрыты локальные и частные адреса (защита от обращения страниц к вашей сети); каждый сайт — своя origin,
// отдельная от origin игры. Без внешних зависимостей, только встроенные модули Node.
'use strict';
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path'), zlib = require('zlib'), dns = require('dns'), net = require('net');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8765;
const BIND = process.env.BIND || '127.0.0.1';
const MAX_REWRITE = 30 * 1024 * 1024;
const DEBUG = process.argv.indexOf('--debug') >= 0;
const HOST_RE = /^(.+?)(?:\.p(\d{2,5}))?\.(px|pxh)\.localhost$/i;

// ------------------------------------------------------------------ адреса
// «чужие» пространства имён и служебные хосты, которые нельзя менять в тексте страниц
const SKIP_HOST = /^(?:(?:www\.)?w3\.org|purl\.org|(?:www\.)?schema\.org|ns\.adobe\.com|(?:www\.)?sitemaps\.org|xmlns\.com|(?:www\.)?opengis\.net|localhost|(?:\d{1,3}\.){3}\d{1,3}|.*\.px\.localhost|.*\.pxh\.localhost|.*\.local|.*\.internal|[^.]+)$/i;
function pxLabel(host, port, isHttps) { // реальный хост → имя хоста прокси
  host = host.toLowerCase();
  const std = isHttps ? 443 : 80, p = port && Number(port) !== std ? '.p' + Number(port) : '';
  return host + p + (isHttps ? '.px' : '.pxh') + '.localhost';
}
function pxOrigin(host, port, isHttps) { return 'http://' + pxLabel(host, port, isHttps) + ':' + PORT; }
function parseHost(h) { // Host: www.x.com.px.localhost:8765 → { host, port, https } или null
  const m = HOST_RE.exec(String(h || '').replace(/:\d+$/, '')); if (!m) return null;
  const https = m[3].toLowerCase() === 'px';
  return { host: m[1].toLowerCase(), port: m[2] ? Number(m[2]) : (https ? 443 : 80), https };
}
function realOrigin(pxo) { // http://x.px.localhost:8765 → https://x
  try { const u = new URL(pxo), t = parseHost(u.hostname); if (!t) return null; return (t.https ? 'https://' : 'http://') + t.host + ((t.https && t.port === 443) || (!t.https && t.port === 80) ? '' : ':' + t.port); } catch (e) { return null; }
}
function mapUrl(u) { // абсолютный http(s) URL → адрес в прокси; иначе без изменений
  try {
    const o = new URL(u); if (o.protocol !== 'https:' && o.protocol !== 'http:') return u;
    if (SKIP_HOST.test(o.hostname)) return u;
    return pxOrigin(o.hostname, o.port, o.protocol === 'https:') + o.pathname + o.search + o.hash;
  } catch (e) { return u; }
}
function mapBack(u) { // адрес в прокси → настоящий (для Referer)
  try { const o = new URL(u), t = parseHost(o.hostname); if (!t) return u; return realOrigin(o.origin) + o.pathname + o.search; } catch (e) { return u; }
}

// замена ссылок в тексте: https://host/… , https:\/\/host , https:\u002F\u002Fhost , «//host/…» в кавычках/скобках/после «=»
const ABS_RE = /(https?):((?:\\u002[fF]|\\?\/){2})([a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?)(?::(\d{1,5}))?(?![A-Za-z0-9-])/g;
const REL_RE = /([("'=,\s])\/\/((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(?::(\d{1,5}))?(?=[\/"'?)#\s:\\]|$)/g;
function rewriteText(s) {
  s = s.replace(ABS_RE, (m, sch, sep, host, port) => {
    if (SKIP_HOST.test(host)) return m;
    return 'http:' + sep + pxLabel(host, port, sch.toLowerCase() === 'https') + ':' + PORT;
  });
  s = s.replace(REL_RE, (m, pre, host, port) => {
    if (SKIP_HOST.test(host)) return m;
    return pre + '//' + pxLabel(host, port, true) + ':' + PORT;
  });
  return s;
}

// обратная подмена в запросах: http://x.px.localhost:ПОРТ → https://x (в пути, в теле формы/JSON, в том числе в виде http%3A%2F%2F…)
const LBL = String.raw`([a-zA-Z0-9][a-zA-Z0-9.-]*?)(?:\.p(\d{2,5}))?\.(px|pxh)\.localhost`;
const BACK_PLAIN = new RegExp(String.raw`http:((?:\\?/){2}|(?:\\u002[fF]){2})` + LBL + ':' + PORT + '(?![0-9])', 'g');
const BACK_ENC = new RegExp(String.raw`http%3[aA]%2[fF]%2[fF]` + LBL + '%3[aA]' + PORT + '(?![0-9])', 'g');
function unmapText(s) {
  if (s.indexOf('.localhost') < 0) return s;
  return s.replace(BACK_PLAIN, (m, sep, host, port, k) => (k.toLowerCase() === 'px' ? 'https:' : 'http:') + sep + host + (port ? ':' + port : ''))
    .replace(BACK_ENC, (m, host, port, k) => (k.toLowerCase() === 'px' ? 'https' : 'http') + '%3A%2F%2F' + host + (port ? '%3A' + port : ''));
}

// ------------------------------------------------------------------ защита от SSRF
function isPrivateIp(a) {
  if (net.isIPv4(a)) {
    const p = a.split('.').map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || (p[0] === 192 && p[1] === 0 && p[2] === 0) || (p[0] === 198 && (p[1] === 18 || p[1] === 19));
  }
  if (net.isIPv6(a)) {
    const l = a.toLowerCase();
    if (l === '::1' || l === '::') return true;
    const m4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l); if (m4) return isPrivateIp(m4[1]);
    return /^f[cd]/.test(l) || /^fe[89ab]/.test(l);
  }
  return true;
}
function safeLookup(host, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  dns.lookup(host, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    const ok = addrs.filter((x) => !isPrivateIp(x.address));
    if (!ok.length) return cb(new Error('blocked address'));
    ok.sort((x, y) => x.family - y.family);   // IPv4 первым: IPv6-адрес пользователя Google быстро помечает как «подозрительный»
    if (opts && opts.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  });
}
const agentS = new https.Agent({ keepAlive: true, maxSockets: 64, lookup: safeLookup });
const agentP = new http.Agent({ keepAlive: true, maxSockets: 64, lookup: safeLookup });

// ------------------------------------------------------------------ скрипт, который вставляется в каждую HTML-страницу
const SHIM_FN = function (PORT, LIGHT) {
  'use strict';
  try {
    var L = location, RE = /^(.+?)(?:\.p(\d{2,5}))?\.(px|pxh)\.localhost$/i;
    var SK = /^(?:(?:www\.)?w3\.org|purl\.org|(?:www\.)?schema\.org|localhost|(?:\d{1,3}\.){3}\d{1,3}|.*\.px\.localhost|.*\.pxh\.localhost|[^.]+)$/i;
    var m0 = RE.exec(L.hostname); if (!m0) return;
    function map(u) {
      try {
        var o = new URL(String(u), L.href);
        if (o.protocol !== 'http:' && o.protocol !== 'https:') return u;
        if (SK.test(o.hostname)) return String(u);
        var s = o.protocol === 'https:', pt = o.port && o.port !== (s ? '443' : '80') ? '.p' + o.port : '';
        return 'http://' + o.hostname.toLowerCase() + pt + (s ? '.px' : '.pxh') + '.localhost:' + PORT + o.pathname + o.search + o.hash;
      } catch (e) { return u; }
    }
    function real() {
      var m = RE.exec(L.hostname); if (!m) return L.href;
      var s = m[3].toLowerCase() === 'px';
      return (s ? 'https://' : 'http://') + m[1] + (m[2] ? ':' + m[2] : '') + L.pathname + L.search + L.hash;
    }
    var last = '';
    function report(force) {
      try {
        var u = real(), t = document.title || '';
        if (!force && u + '\n' + t === last) return;
        last = u + '\n' + t;
        if (window.parent && window.parent !== window) window.parent.postMessage({ nxpx: 1, url: u, title: t }, '*');
      } catch (e) { /* ignore */ }
    }
    // LIGHT (домены Google): ничего нативного не подменяем — антибот Google проверяет целостность окружения
    if (!LIGHT) {
    // сервис-воркеры сайтов не нужны: они бы перехватывали запросы мимо прокси
    try { delete Navigator.prototype.serviceWorker; } catch (e) { /* ignore */ }
    // fetch / XHR / sendBeacon / WebSocket-адреса
    var f0 = window.fetch;
    if (f0) window.fetch = function (i, o) { try { if (typeof i === 'string' || i instanceof URL) i = map(i); else if (i && i.url) { var u2 = map(i.url); if (u2 !== i.url) i = new Request(u2, i); } } catch (e) { /* ignore */ } return f0.call(this, i, o); };
    var x0 = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (mt, u) { var a = Array.prototype.slice.call(arguments); a[1] = map(u); return x0.apply(this, a); };
    if (navigator.sendBeacon) { var b0 = navigator.sendBeacon; navigator.sendBeacon = function (u, d) { return b0.call(this, map(u), d); }; }
    // присваивание адресов элементам (img.src = 'https://…', script.src, link.href …)
    function hookProp(C, p) {
      try { var d = Object.getOwnPropertyDescriptor(C.prototype, p); if (!d || !d.set) return; Object.defineProperty(C.prototype, p, { configurable: true, enumerable: d.enumerable, get: d.get, set: function (v) { d.set.call(this, map(v)); } }); } catch (e) { /* ignore */ }
    }
    [[HTMLImageElement, 'src'], [HTMLScriptElement, 'src'], [HTMLLinkElement, 'href'], [HTMLIFrameElement, 'src'], [HTMLAnchorElement, 'href'], [HTMLSourceElement, 'src'], [HTMLMediaElement, 'src'], [HTMLFormElement, 'action'], [HTMLEmbedElement, 'src'], [HTMLObjectElement, 'data'], [HTMLInputElement, 'src']].forEach(function (a) { hookProp(a[0], a[1]); });
    var sa0 = Element.prototype.setAttribute, ATTR = { src: 1, href: 1, action: 1, poster: 1, data: 1 };
    Element.prototype.setAttribute = function (n, v) { if (ATTR[String(n).toLowerCase()] === 1 && typeof v === 'string' && /^(https?:)?\/\//i.test(v)) v = map(v.charAt(0) === '/' ? 'https:' + v : v); return sa0.call(this, n, v); };
    // переходы: window.open → в этом же фрейме (попапов в песочнице нет); history.pushState с настоящим адресом → адрес прокси
    window.open = function (u) { if (u) L.href = map(u); return null; };
    ['pushState', 'replaceState'].forEach(function (k) {
      var h0 = history[k];
      history[k] = function (s, t, u) { var r = h0.call(this, s, t, u == null ? u : map(u)); setTimeout(report, 0); return r; };
    });
    // cookie: Domain=.site.com → .site.com.px.localhost, чтобы cookie действовала на все поддомены сайта, как в настоящем браузере
    try {
      var cd = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
      if (cd && cd.set) Object.defineProperty(Document.prototype, 'cookie', {
        configurable: true, get: cd.get, set: function (v) {
          v = String(v);
          var suf = m0[3].toLowerCase() === 'px' ? '.px.localhost' : '.pxh.localhost';
          v = v.replace(/;\s*domain=\.?([^;]*)/i, function (a, d) { return '; Domain=' + d.toLowerCase() + suf; });
          v = v.replace(/;\s*(samesite|secure|partitioned)(=[^;]*)?/ig, '') + '; SameSite=None; Secure; Partitioned';
          cd.set.call(this, v);
        }
      });
    } catch (e) { /* ignore */ }
    }
    // клики по ссылкам и отправка форм: _blank → этот же фрейм, настоящий адрес → прокси
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href],area[href]') : null; if (!a || e.defaultPrevented) return;
      var t = a.getAttribute('target'); if (t && t !== '_self') a.setAttribute('target', '_self');
      var h = a.getAttribute('href'); if (h && /^(https?:)?\/\//i.test(h)) { var u = map(h.charAt(0) === '/' ? 'https:' + h : h); if (u !== h) a.setAttribute('href', u); }
    }, true);
    document.addEventListener('submit', function (e) {
      var f = e.target; if (!f || !f.getAttribute) return;
      var t = f.getAttribute('target'); if (t && t !== '_self') f.setAttribute('target', '_self');
      var h = f.getAttribute('action'); if (h && /^(https?:)?\/\//i.test(h)) f.setAttribute('action', map(h.charAt(0) === '/' ? 'https:' + h : h));
    }, true);
    // команды игры: назад / вперёд / вверх
    window.addEventListener('message', function (e) {
      if (e.source !== window.parent || !e.data || !e.data.nxpx) return;
      if (e.data.nxpx === 'back') history.back(); else if (e.data.nxpx === 'fwd') history.forward(); else if (e.data.nxpx === 'reload') L.reload();
    });
    // адрес и заголовок — в игру (адресная строка)
    window.addEventListener('popstate', function () { setTimeout(report, 0); });
    window.addEventListener('hashchange', function () { setTimeout(report, 0); });
    document.addEventListener('DOMContentLoaded', function () {
      report(true);
      try { var t = document.querySelector('title'); if (t) new MutationObserver(function () { report(); }).observe(t, { childList: true, characterData: true, subtree: true }); } catch (e) { /* ignore */ }
    });
    window.addEventListener('load', function () { report(true); });
    if (LIGHT) setInterval(report, 500);
    report(true);
  } catch (err) { /* shim не должен ломать страницу */ }
};
const SHIM_TAG = '<script>(' + SHIM_FN.toString() + ')(' + PORT + ',false);</script>';
const SHIM_TAG_LITE = '<script>(' + SHIM_FN.toString() + ')(' + PORT + ',true);</script>';
const LIGHT_HOST = /^(?:[a-z0-9-]+\.)*google\.(?:com|[a-z]{2}|com?\.[a-z]{2})$/i;

// ------------------------------------------------------------------ прокси
const DROP_RES = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'x-frame-options', 'content-security-policy',
  'content-security-policy-report-only', 'cross-origin-opener-policy', 'cross-origin-embedder-policy', 'cross-origin-resource-policy', 'strict-transport-security', 'report-to', 'nel',
  'permissions-policy', 'feature-policy', 'alt-svc', 'clear-site-data', 'expect-ct', 'public-key-pins', 'origin-agent-cluster', 'x-content-security-policy', 'x-webkit-csp', 'document-policy']);
const DROP_REQ = new Set(['host', 'connection', 'keep-alive', 'proxy-connection', 'te', 'upgrade', 'accept-encoding', 'content-length', 'transfer-encoding', 'origin', 'referer', 'x-forwarded-for']);
const TEXT_RE = /^(text\/(html|css|javascript|xml)|application\/(javascript|x-javascript|ecmascript|json|manifest\+json|x-mpegurl|vnd\.apple\.mpegurl|dash\+xml|xhtml\+xml|x-ndjson)|image\/svg\+xml)/i;

function setCookieOut(c, suf) { // Set-Cookie от сайта → cookie для хоста прокси
  const parts = c.split(';'), head = parts.shift(), keep = [];
  let hasPath = false;
  parts.forEach((p) => {
    const k = p.split('=')[0].trim().toLowerCase(), v = p.slice(p.indexOf('=') + 1).trim();
    if (k === 'domain') { keep.push('Domain=' + v.replace(/^\./, '').toLowerCase() + suf); return; }
    if (k === 'samesite' || k === 'secure' || k === 'partitioned') return;
    if (k === 'path') hasPath = true;
    keep.push(p.trim());
  });
  if (!hasPath) keep.push('Path=/');
  return head + '; ' + keep.join('; ') + '; SameSite=None; Secure; Partitioned';
}
function decode(buf, enc) {
  return new Promise((res, rej) => {
    enc = (enc || '').toLowerCase();
    if (!enc || enc === 'identity') return res(buf);
    const cb = (e, d) => (e ? rej(e) : res(d));
    if (enc === 'gzip' || enc === 'x-gzip') zlib.gunzip(buf, cb); else if (enc === 'deflate') zlib.inflate(buf, (e, d) => (e ? zlib.inflateRaw(buf, cb) : res(d)));
    else if (enc === 'br') zlib.brotliDecompress(buf, cb); else res(buf);
  });
}
function charsetOf(ct, head) {
  let m = /charset=["']?([\w-]+)/i.exec(ct || ''); if (m) return m[1].toLowerCase();
  m = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head || ''); return m ? m[1].toLowerCase() : 'utf-8';
}
function fail(res, code, msg) {
  if (res.headersSent) { try { res.end(); } catch (e) { /* ignore */ } return; }
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('<!doctype html><meta charset="utf-8"><body style="font:15px system-ui;padding:40px;color:#444;background:#fff"><h3 style="margin:0 0 8px">' + msg + '</h3><p style="color:#888">NEXA proxy</p>');
}

function proxy(req, res, T) {
  if (T.host.indexOf('.') < 0 || SKIP_HOST.test(T.host)) return fail(res, 403, 'Blocked address');
  const origin = req.headers.origin, suf = T.https ? '.px.localhost' : '.pxh.localhost';
  const cors = (h) => { if (origin) { h['access-control-allow-origin'] = origin; h['access-control-allow-credentials'] = 'true'; h['access-control-expose-headers'] = '*'; } return h; };
  if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) { // предзапрос CORS отвечаем сами
    res.writeHead(204, cors({ 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS', 'access-control-allow-headers': req.headers['access-control-request-headers'] || '*', 'access-control-max-age': '600', 'content-length': '0' }));
    return res.end();
  }
  const chunks = []; let size = 0;
  req.on('data', (d) => { size += d.length; if (size > 64 * 1024 * 1024) { req.destroy(); return; } chunks.push(d); });
  req.on('error', () => { /* клиент ушёл */ });
  req.on('end', () => {
    let body = Buffer.concat(chunks);
    const rct = String(req.headers['content-type'] || '');
    if (body.length && body.length < 4 * 1024 * 1024 && /^(application\/x-www-form-urlencoded|application\/json|text\/)/i.test(rct)) body = Buffer.from(unmapText(body.toString('utf8')), 'utf8');
    const h = {};
    Object.keys(req.headers).forEach((k) => { if (!DROP_REQ.has(k)) h[k] = req.headers[k]; });
    h.host = T.host + ((T.https && T.port === 443) || (!T.https && T.port === 80) ? '' : ':' + T.port);
    h['accept-encoding'] = 'gzip, deflate, br';
    if (origin) h.origin = realOrigin(origin) || origin;
    if (req.headers.referer) h.referer = mapBack(req.headers.referer);
    if (body.length || ['POST', 'PUT', 'PATCH'].indexOf(req.method) >= 0) h['content-length'] = String(body.length);
    const lib = T.https ? https : http;
    if (DEBUG) console.log('[px>]', req.method, T.host + unmapText(req.url), JSON.stringify(h));
    const up = lib.request({ host: T.host, port: T.port, method: req.method, path: unmapText(req.url), headers: h, agent: T.https ? agentS : agentP, servername: T.host, timeout: 30000 }, (ur) => {
      try { reply(req, res, ur, T, suf, cors); } catch (e) { fail(res, 502, 'Proxy error'); }
    });
    up.on('timeout', () => up.destroy(new Error('timeout')));
    up.on('error', (e) => fail(res, 502, /blocked/.test(e.message) ? 'Blocked address' : 'Cannot reach ' + T.host + ' (' + (e.code || e.message) + ')'));
    res.on('close', () => { if (!res.writableEnded) up.destroy(); });
    if (body.length) up.write(body);
    up.end();
  });
}

function reply(req, res, ur, T, suf, cors) {
  if (DEBUG) console.log('[px<]', ur.statusCode, T.host + req.url.slice(0, 80), ur.headers['content-type'] || '', ur.headers.location ? '-> ' + String(ur.headers.location).slice(0, 100) : '');
  const out = {};
  const ct = String(ur.headers['content-type'] || ''), enc = String(ur.headers['content-encoding'] || '').toLowerCase();
  const light = LIGHT_HOST.test(T.host);   // Google: JS не трогаем, иначе его антибот отвечает «unusual traffic»
  const rewritable = TEXT_RE.test(ct) && ur.statusCode !== 204 && ur.statusCode !== 304 && req.method !== 'HEAD' && !(light && /javascript/i.test(ct));
  const len = Number(ur.headers['content-length'] || 0);
  const doRw = rewritable && len <= MAX_REWRITE && ur.statusCode !== 206;
  Object.keys(ur.headers).forEach((k) => {
    if (DROP_RES.has(k)) return;
    if (k === 'set-cookie') { out[k] = ur.headers[k].map((c) => setCookieOut(c, suf)); return; }
    if (k === 'location' || k === 'content-location') { out[k] = mapUrl(new URL(ur.headers[k], (T.https ? 'https://' : 'http://') + T.host + (T.port === 443 || T.port === 80 ? '' : ':' + T.port) + req.url).href); return; }
    if (k === 'link') { out[k] = rewriteText(ur.headers[k]); return; }
    if (k === 'refresh') { out[k] = rewriteText(ur.headers[k]); return; }
    if (k.indexOf('access-control-') === 0) return;
    if (doRw && (k === 'content-length' || k === 'content-encoding' || k === 'etag' || k === 'content-md5')) return;
    out[k] = ur.headers[k];
  });
  cors(out);
  if (!doRw) { res.writeHead(ur.statusCode, out); ur.pipe(res); ur.on('error', () => res.destroy()); return; }
  const parts = []; let n = 0;
  ur.on('data', (d) => { n += d.length; parts.push(d); });
  ur.on('error', () => res.destroy());
  ur.on('end', () => {
    decode(Buffer.concat(parts), enc).then((raw) => {
      const isHtml = /^text\/html|xhtml/i.test(ct);
      const cs = charsetOf(ct, raw.slice(0, 2048).toString('latin1'));
      let txt;
      try { txt = new TextDecoder(/^utf-?8$/.test(cs) ? 'utf-8' : cs).decode(raw); } catch (e) { txt = raw.toString('utf8'); }
      txt = rewriteText(txt);
      if (isHtml) {
        const SH = light ? SHIM_TAG_LITE : SHIM_TAG;
        txt = txt.replace(/<meta[^>]+http-equiv=["']?(content-security-policy|x-frame-options)[^>]*>/gi, '').replace(/\s(integrity|nonce)=("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
        const hm = /<head[^>]*>/i.exec(txt);
        if (hm) txt = txt.slice(0, hm.index + hm[0].length) + SH + txt.slice(hm.index + hm[0].length);
        else { const dm = /<!doctype[^>]*>/i.exec(txt); txt = dm ? txt.slice(0, dm.index + dm[0].length) + SH + txt.slice(dm.index + dm[0].length) : SH + txt; }
      }
      const buf = Buffer.from(txt, 'utf8');
      out['content-type'] = ct.replace(/;\s*charset=[^;]*/i, '') + '; charset=utf-8';
      out['content-length'] = String(buf.length);
      out['cache-control'] = out['cache-control'] && /no-store/i.test(out['cache-control']) ? out['cache-control'] : 'no-cache';
      res.writeHead(ur.statusCode, out); res.end(buf);
    }).catch(() => fail(res, 502, 'Bad response from ' + T.host));
  });
}

// ------------------------------------------------------------------ статика
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.webmanifest': 'application/manifest+json' };
function serveStatic(req, res) {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end('Bad request'); }
  if (p === '/__px/ping') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); return res.end('nexa-px ' + PORT); }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.resolve(ROOT, '.' + path.sep + p.replace(/^\/+/, ''));
  if (f !== ROOT && f.indexOf(ROOT + path.sep) !== 0) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const h = { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Last-Modified': st.mtime.toUTCString(), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    const ims = req.headers['if-modified-since'];
    if (ims && !req.headers.range && new Date(ims).getTime() >= Math.floor(st.mtimeMs / 1000) * 1000) { res.writeHead(304, h); return res.end(); }
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
    let s = 0, en = st.size - 1, code = 200;
    if (m && (m[1] || m[2])) {
      s = m[1] === '' ? Math.max(0, st.size - Number(m[2])) : Number(m[1]); en = m[1] === '' || m[2] === '' ? st.size - 1 : Math.min(Number(m[2]), st.size - 1);
      if (s > en || s >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      code = 206; h['Content-Range'] = 'bytes ' + s + '-' + en + '/' + st.size;
    }
    h['Content-Length'] = String(en - s + 1);
    res.writeHead(code, h);
    if (req.method === 'HEAD') return res.end();
    const rs = fs.createReadStream(f, { start: s, end: en });
    rs.on('error', () => res.destroy()); rs.pipe(res);
  });
}

const srv = http.createServer((req, res) => {
  const T = parseHost(req.headers.host);
  if (T) return proxy(req, res, T);
  const hn = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
  if (hn !== 'localhost' && hn !== '127.0.0.1' && hn !== '[::1]') { res.writeHead(421); return res.end('Misdirected request'); }   // защита от DNS rebinding
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res);
});
srv.on('clientError', (e, sock) => { try { sock.destroy(); } catch (er) { /* ignore */ } });
srv.listen(PORT, BIND, () => { console.log('NEXA server: http://localhost:' + PORT + '/  (browser proxy: *.px.localhost:' + PORT + ')'); });
srv.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? 'Port ' + PORT + ' is busy — close the other server or run: node tools/serve.js <port>' : e.message); process.exit(1); });
