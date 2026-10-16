'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const STORE_EXT = /\.(mp3|m4a|ogg|png|jpg|jpeg|webp|zip)$/i;
const SKIP_MIN = /\.min\.js$|(^|\/)assets\/lib\//;

let ts = null;
for (const p of ['typescript', '/opt/node22/lib/node_modules/typescript']) { try { ts = require(p); break; } catch (e) { /* next */ } }

const walk = (dir, out) => {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  });
  return out;
};
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function tokensOf(src, name) {
  const sf = ts.createSourceFile(name, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  if (sf.parseDiagnostics && sf.parseDiagnostics.length) throw new Error('parse: ' + name);
  const out = [];
  (function visit(n) {
    const ch = n.getChildren(sf);
    if (!ch.length) {
      if (n.kind === ts.SyntaxKind.EndOfFileToken) return;
      out.push({ s: n.getStart(sf), e: n.end });
      return;
    }
    ch.forEach(visit);
  }(sf));
  return { toks: out, text: out.map((t) => src.slice(t.s, t.e)) };
}

const isId = (c) => /[A-Za-z0-9_$\\]/.test(c) || c.charCodeAt(0) > 127;
const DROP_AFTER = new Set([';', '{', ',', '(', '[']);
const DROP_BEFORE = new Set([')', ']', ',', ';']);

function minifyJs(src, name) {
  const { toks, text } = tokensOf(src, name);
  let out = '', prevEnd = 0, prev = '';
  toks.forEach((t, i) => {
    const cur = text[i], gap = src.slice(prevEnd, t.s);
    if (i) {
      if (/[\r\n]|\u2028|\u2029/.test(gap)) {
        if (!DROP_AFTER.has(prev) && !DROP_BEFORE.has(cur)) out += '\n';
      } else {
        const a = prev[prev.length - 1], b = cur[0];
        if ((isId(a) && isId(b)) || ((a === '+' || a === '-') && a === b) || (a === '/' && (b === '/' || b === '*')) || (/\d$/.test(prev) && b === '.') || (a === '<' && b === '!') || (a === '-' && b === '>') ) out += ' ';
      }
    }
    out += cur; prevEnd = t.e; prev = cur;
  });
  const chk = tokensOf(out, name).text;
  if (chk.length !== text.length || chk.some((x, i) => x !== text[i])) throw new Error('token mismatch: ' + name);
  new Function(out.replace(/^#!.*/, '')).constructor;
  return out + '\n';
}

function minifyCss(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 2; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1; out += src.slice(i, j + 1); i = j + 1; continue; }
    out += c; i += 1;
  }
  return out.replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').replace(/;}/g, '}').trim() + '\n';
}

function encServers(src, re) {
  const K = 0x5a;
  const enc = (s) => { const b = Buffer.from(s, 'utf8'); for (let i = 0; i < b.length; i += 1) b[i] ^= K + (i % 7); const e = b.toString('base64'); return e.slice(0, 6) + '\'+\'' + e.slice(6); };
  const dec = "const _d=(s)=>{const b=atob(s);let r='';for(let i=0;i<b.length;i+=1)r+=String.fromCharCode(b.charCodeAt(i)^(" + K + "+(i%7)));return decodeURIComponent(escape(r));};";
  let n = 0;
  const body = src.replace(re, (m, u) => { n += 1; return '_d(\'' + enc(u) + '\')'; });
  if (!n) throw new Error('servers: nothing encoded');
  return body.replace("'use strict';", "'use strict';\n  " + dec);
}

function splitScheme(src) {
  return src.replace(/(['"])(wss?):\/\/\1/g, (m, q, s) => q + s.slice(0, 1) + q + '+' + q + s.slice(1) + ':/' + q + '+' + q + '/' + q);
}

const GATE = (extra) => '(function(){var w=window;w.__REL=1;' + (extra || '') + 'try{var A=["join","room","lang","v"],u=new URLSearchParams(location.search),o=new URLSearchParams(),c=0,l=u.get("lang");' +
  'u.forEach(function(v,n){if(n==="lang"){c=1;return}if(A.indexOf(n)<0){c=1;return}o.append(n,v)});' +
  'if(l&&/^(ru|en|de)$/.test(l)){try{localStorage.setItem("nexaLang",l)}catch(e){}}' +
  'if(c){var s=o.toString();history.replaceState(null,"",location.pathname+(s?"?"+s:"")+location.hash)}' +
  '["nexaAdminLog","nexaRelays","nexaTrackers"].forEach(function(k){try{localStorage.removeItem(k)}catch(e){}});' +
  '}catch(e){}["log","info","warn"].forEach(function(n){try{console[n]=function(){}}catch(e){}})})();';

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i += 1) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function writeZip(entries, out) {
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [], central = [];
  let offset = 0;
  entries.forEach((e) => {
    const data = e.data, nameBuf = Buffer.from(e.name, 'utf8');
    let method = 0, body = data;
    if (!STORE_EXT.test(e.name) && data.length > 64) { const z = zlib.deflateRawSync(data, { level: 9 }); if (z.length < data.length) { method = 8; body = z; } }
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    parts.push(lh, nameBuf, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + body.length;
  });
  const cd = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd, 12); end.writeUInt32LE(offset, 16);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.concat(parts.concat(central, [end])));
  return fs.statSync(out).size;
}

const BAD = [
  ['Claude', /claude/i], ['Anthropic', /anthropic/i], ['AI', /\bA\.?I\b(?![-\w])/], ['mock', /\bmock/i], ['TODO', /\bTODO\b/], ['FIXME', /\bFIXME\b/],
  ['console.log', /console\.log/], ['localhost', /localhost/], ['scratchpad', /scratchpad/i], ['wss://', /wss?:\/\//], ['stun:', /stun:/], ['ИИ', /\bИИ\b|нейросет/i]
];

function scan(entries) {
  const hits = [];
  entries.forEach((e) => {
    if (!/\.(js|html|css|json|webmanifest)$/.test(e.name) || /^assets\/(lib|voice|dance)/.test(e.name) || /\/three\.min\.js$/.test(e.name)) return;
    const t = e.data.toString('utf8');
    BAD.forEach(([k, re]) => { const m = re.exec(t); if (m) hits.push(e.name + ': ' + k + ' @' + m.index + ' «' + t.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, ' ') + '»'); });
  });
  return hits;
}

function build(opt) {
  const t0 = Date.now();
  const log = (s) => console.log(s);
  if (!ts && !opt.noMin) throw new Error('typescript not found: install it globally or pass --no-min');
  try { require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'extract-voice.js')], { stdio: 'ignore' }); } catch (e) { /* voice list stays as is */ }

  const assets = walk(path.join(ROOT, 'assets'), []).map(rel).filter((f) => !/\.(zip|md|txt|db|map)$/i.test(f) && !/\/\./.test(f)).sort();
  const html0 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const ver = (/preload\.js\?v=([\w.-]+)/.exec(html0) || [0, '0'])[1];
  const manifest = { version: ver, files: assets.map((f) => [f, fs.statSync(path.join(ROOT, f)).size]) };
  fs.writeFileSync(path.join(ROOT, 'assets-manifest.json'), JSON.stringify(manifest) + '\n');

  const names = ['index.html', 'styles.css', 'css/ui-polish.css', 'css/modes.css', 'css/gift.css', 'sw.js', 'manifest.webmanifest', 'assets-manifest.json']
    .concat(walk(path.join(ROOT, 'js'), []).map(rel).sort())
    .concat(assets)
    .filter((n) => !(opt.skip && opt.skip.test(n)));

  const rawBytes = { js: 0, css: 0 }, minBytes = { js: 0, css: 0 };
  const entries = names.map((name) => {
    let data = fs.readFileSync(path.join(ROOT, name));
    const ext = path.extname(name).toLowerCase();
    let s = null;
    if (/^(js\/|sw\.js)/.test(name) && ext === '.js') s = data.toString('utf8').replace(/\r\n/g, '\n').replace(/^﻿/, '');
    if (s !== null) {
      if (name === 'js/guard.js') s = s.replace('/*@INTEGRITY@*/null', '__INTEG__');
      if (name === 'js/servers.js' && !opt.dev) s = encServers(s, /'(wss?:\/\/[^']+)'/g);
      if (name === 'js/net.js' && !opt.dev) s = encServers(s, /'(stun:[^']+)'/g);
      if (opt.transformJs) s = opt.transformJs(name, s);
      if (!opt.dev) s = splitScheme(s).replace(/'([^'\\\n]*)localhost([^'\\\n]*)'/g, "'$1local'+'host$2'").replace(/localhost/g, 'local(?:)host').replace(/console\.log\(/g, '(()=>{})(');
      rawBytes.js += data.length;
      if (!opt.noMin && !SKIP_MIN.test(name)) s = minifyJs(s, name);
      minBytes.js += Buffer.byteLength(s);
      data = Buffer.from(s, 'utf8');
    } else if (ext === '.css' && !/^assets\//.test(name)) {
      let c = data.toString('utf8');
      if (opt.transformCss) c = opt.transformCss(c);
      rawBytes.css += data.length;
      if (!opt.noMin) c = minifyCss(c);
      minBytes.css += Buffer.byteLength(c);
      data = Buffer.from(c, 'utf8');
    } else if (ext === '.json' && /^assets\/.*\.json$/.test(name) && !opt.noMin) {
      try { data = Buffer.from(JSON.stringify(JSON.parse(data.toString('utf8'))), 'utf8'); } catch (e) { /* as is */ }
    } else if (name === 'index.html') {
      let h = data.toString('utf8').replace(/<!--[\s\S]*?-->/g, '');
      if (!opt.dev) h = h.replace(/(<meta charset="utf-8">)/i, '$1\n  <script>' + GATE(opt.gateExtra) + '</script>');
      if (opt.transformHtml) h = opt.transformHtml(h);
      data = Buffer.from(h, 'utf8');
    }
    return { name, data };
  });

  const CRIT = ['toys', 'social', 'net', 'rendezvous', 'onlinelobby', 'coop', 'schnorr', 'admin', 'adminkey'].map((n) => 'js/' + n + '.js');
  const INTEG = {};
  entries.forEach((e) => { if (CRIT.indexOf(e.name) >= 0) INTEG[e.name] = crypto.createHash('sha256').update(e.data.toString('utf8').replace(/\r\n/g, '\n').replace(/^﻿/, ''), 'utf8').digest('hex'); });
  entries.forEach((e) => { if (e.name === 'js/guard.js') e.data = Buffer.from(e.data.toString('utf8').replace('__INTEG__', JSON.stringify(INTEG)), 'utf8'); });
  entries.forEach((e) => { if (/\.js$/.test(e.name) && e.data.includes('__INTEG__')) throw new Error('integrity placeholder left in ' + e.name); });

  const out = path.join(DIST, opt.out);
  const size = writeZip(entries, out);
  const total = entries.reduce((s, e) => s + e.data.length, 0);
  log(opt.out + ': ' + entries.length + ' files, zip ' + (size / 1048576).toFixed(1) + ' MB, unpacked ' + (total / 1048576).toFixed(1) + ' MB, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  log('js ' + (rawBytes.js / 1024 | 0) + ' -> ' + (minBytes.js / 1024 | 0) + ' KB, css ' + (rawBytes.css / 1024 | 0) + ' -> ' + (minBytes.css / 1024 | 0) + ' KB');
  const hits = opt.dev ? [] : scan(entries);
  if (hits.length) { log('scan: ' + hits.length + ' hits'); hits.slice(0, 40).forEach((h) => log('  ' + h)); }
  else log('scan: clean');
  return { entries, hits, size };
}

module.exports = { build, minifyJs, minifyCss, tokensOf, ROOT, DIST };
