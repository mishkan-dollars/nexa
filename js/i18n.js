// NEXA: локализация RU / EN / DE.
// Словарь «исходная строка → переводы» + живой перевод DOM (MutationObserver): остальной код игры пишет текст как раньше,
// а перевод подставляется на лету. Исходные тексты хранятся в узлах, поэтому смена языка работает мгновенно, без перезагрузки.
// Формат данных (js/i18n-*.js):  I18N.add('en', { 'SETTINGS': ['НАСТРОЙКИ', 'EINSTELLUNGEN'] })
//   первый аргумент — язык ИСХОДНОЙ строки; массив — переводы на остальные языки в порядке en, ru, de без исходного.
//   '{0}','{1}' — числа, '{s0}','{s1}' — произвольный текст (переводится отдельно).  '@ctx:TEXT' — перевод только внутри [data-i18n="ctx"].
(function () {
  'use strict';

  const KEY = 'nexaLang';
  const LANGS = ['en', 'ru', 'de'];
  const NAMES = { en: 'English', ru: 'Русский', de: 'Deutsch' };
  const exact = new Map();
  const lower = new Map();
  const pats = [];
  const missing = new Set();
  const listeners = [];
  let cache = new Map();
  let lang = 'en';
  let obs = null;
  let started = false;
  let hasCtx = false;

  const NUM = '(\\d+(?:[.,]\\d+)?)';
  const SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1 };
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  const norm = (k) => k.replace(/\s+/g, ' ').trim();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function detect() {
    let l = '';
    try { l = localStorage.getItem(KEY) || ''; } catch (e) { /* ignore */ }
    if (LANGS.indexOf(l) >= 0) return l;
    const n = String((navigator.languages && navigator.languages[0]) || navigator.language || 'en').toLowerCase();
    if (n.indexOf('ru') === 0 || n.indexOf('uk') === 0 || n.indexOf('be') === 0) return 'ru';
    if (n.indexOf('de') === 0) return 'de';
    return 'en';
  }

  function compile(e) {
    const names = [];
    let re = '';
    let last = 0;
    const tok = /\{(s?)(\d+)\}/g;
    let m;
    while ((m = tok.exec(e.k))) {
      re += esc(e.k.slice(last, m.index));
      re += m[1] ? '(.+?)' : NUM;
      names.push((m[1] ? 's' : 'n') + m[2]);
      last = m.index + m[0].length;
    }
    re += esc(e.k.slice(last));
    e.re = new RegExp('^' + re + '$');
    e.names = names;
    e.prefix = e.k.slice(0, e.k.indexOf('{'));
    e.lit = e.k.replace(/\{s?\d+\}/g, '').length;
    return e;
  }

  function add(src, table) {
    const oth = LANGS.filter((l) => l !== src);
    for (const k0 in table) {
      const arr = table[k0];
      let k = norm(k0);
      let ctx = '';
      const cm = /^@([\w-]+):/.exec(k);
      if (cm) { ctx = cm[1]; k = k.slice(cm[0].length); hasCtx = true; }
      const e = { src, k, v: {} };
      oth.forEach((l, i) => { if (arr[i] != null && arr[i] !== '') e.v[l] = arr[i]; });
      e.v[src] = k;
      if (/\{s?\d+\}/.test(k)) { e.ctx = ctx; pats.push(compile(e)); continue; }
      const key = ctx ? '@' + ctx + ':' + k : k;
      exact.set(key, e);
      const lk = key.toLowerCase();
      if (!lower.has(lk)) lower.set(lk, e);
    }
    pats.sort((a, b) => b.lit - a.lit); // конкретные шаблоны раньше общих (сортировка устойчивая)
    cache = new Map();
  }

  function recase(core, out) {
    if (core === core.toUpperCase() && core !== core.toLowerCase()) return out.toUpperCase();
    if (core === core.toLowerCase() && core !== core.toUpperCase()) return out.toLowerCase();
    return out;
  }

  function fillPattern(e, m, core) {
    if (e.src === lang) return core; // исходный язык строки — текст остаётся как есть (в т.ч. переносы строк)
    const out = e.v[lang];
    if (out == null) return null;
    return out.replace(/\{(s?\d+)\}/g, (all, id) => {
      const gi = e.names.indexOf(id[0] === 's' ? id : 'n' + id);
      if (gi < 0) return all;
      const val = m[gi + 1];
      return id[0] === 's' ? tr(val) : val;
    });
  }

  const QUOTES = { en: ['"', '"'], ru: ['«', '»'], de: ['„', '“'] };
  const QRE = /^(["«„“])([\s\S]+?)(["»“”])$/;

  function pick(e, core) {
    if (e.src === lang) return core;
    return e.v[lang] == null ? null : e.v[lang];
  }

  function lookup(core, ctx, noQuote) {
    let e;
    if (ctx) {
      e = exact.get('@' + ctx + ':' + core);
      if (e) return pick(e, core);
    }
    e = exact.get(core);
    if (e) return pick(e, core);
    e = lower.get(core.toLowerCase());
    if (e) return e.src === lang ? core : (e.v[lang] == null ? null : recase(core, e.v[lang]));
    for (let i = 0; i < pats.length; i += 1) {
      const p = pats[i];
      if (p.prefix && core.indexOf(p.prefix) !== 0) continue;
      const m = p.re.exec(core);
      if (m) { const r = fillPattern(p, m, core); if (r != null) return r; }
    }
    // реплика в кавычках: переводим содержимое, кавычки подгоняем под язык
    const q = !noQuote && QRE.exec(core);
    if (q) {
      const inner = lookup(q[2], ctx, true);
      if (inner != null) { const qq = QUOTES[lang]; return qq[0] + inner + qq[1]; }
    }
    return null;
  }

  const LETTER = /[A-Za-zА-Яа-яЁёÄÖÜäöüß]{2}/;

  // нужно ли считать строку «непереведённой»: исходные тексты на своём языке переводить не надо
  function needsTr(core) {
    if (lang === 'en') return /[А-Яа-яЁё]/.test(core);
    if (lang === 'ru') return /[A-Za-z]{2}/.test(core);
    return /[А-Яа-яЁё]/.test(core) || /\b(the|and|you|your|to|is|of|for|with|in|on)\b/i.test(core); // de: кириллица или английские служебные слова
  }

  // перевод строки; неизвестное возвращается без изменений
  function tr(s, ctx) {
    if (typeof s !== 'string' || s.length < 2 || !LETTER.test(s)) return s;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    const core = m[2].replace(/\s+/g, ' ');
    if (!core) return s;
    const ck = ctx ? ctx + '\u0001' + core : core;
    let out = cache.get(ck);
    if (out === undefined) {
      out = lookup(core, ctx);
      if (cache.size > 6000) cache = new Map();
      cache.set(ck, out);
    }
    if (out === null) {
      if (missing.size < 5000 && needsTr(core)) missing.add(core);
      return s;
    }
    if (out === core) return s;
    return m[1] + out + m[3];
  }

  function ctxOf(n) {
    if (!hasCtx) return '';
    const el = n.nodeType === 1 ? n : n.parentNode;
    const c = el && el.closest ? el.closest('[data-i18n]') : null;
    return c ? c.getAttribute('data-i18n') : '';
  }

  function doText(n) {
    const p = n.parentNode;
    if (p && (SKIP[p.tagName] || (p.closest && p.closest('[translate="no"]')))) return; // translate="no" — не переводить (названия языков)
    const v = n.nodeValue;
    const r = n.__i;
    if (r && r.out === v && r.lang === lang) return;
    const src = r && r.out === v ? r.src : v;
    const out = tr(src, ctxOf(n));
    if (out !== src) { n.__i = { src, out, lang }; if (v !== out) n.nodeValue = out; }
    else { n.__i = null; if (v !== src) n.nodeValue = src; }
    // эффект «печати» (.typed) берёт ширину из --n: подогнать под длину перевода
    if (p && p.className === 'typed' && out.trim().length) p.style.setProperty('--n', String(out.trim().length));
  }

  function doAttr(el, a) {
    const v = el.getAttribute(a);
    if (v == null) return;
    const store = el.__ia || (el.__ia = {});
    const r = store[a];
    if (r && r.out === v && r.lang === lang) return;
    const src = r && r.out === v ? r.src : v;
    const out = tr(src, ctxOf(el));
    if (out !== src) { store[a] = { src, out, lang }; if (v !== out) el.setAttribute(a, out); }
    else { store[a] = null; if (v !== src) el.setAttribute(a, src); }
  }

  function doAttrs(el) {
    for (let i = 0; i < ATTRS.length; i += 1) if (el.hasAttribute(ATTRS[i])) doAttr(el, ATTRS[i]);
  }

  function walk(root) {
    const t = root.nodeType;
    if (t === 3) { doText(root); return; }
    if (t !== 1 && t !== 9 && t !== 11) return;
    if (t === 1) { if (SKIP[root.tagName]) return; doAttrs(root); }
    const tw = document.createTreeWalker(root, 1 | 4);
    let n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) doText(n);
      else if (!SKIP[n.tagName]) doAttrs(n);
    }
  }

  function onMut(recs) {
    for (let i = 0; i < recs.length; i += 1) {
      const r = recs[i];
      if (r.type === 'characterData') doText(r.target);
      else if (r.type === 'attributes') doAttr(r.target, r.attributeName);
      else for (let j = 0; j < r.addedNodes.length; j += 1) walk(r.addedNodes[j]);
    }
    if (obs) obs.takeRecords();
  }

  function start() {
    if (started) return;
    started = true;
    document.documentElement.lang = lang;
    walk(document.documentElement);
    obs = new MutationObserver(onMut);
    obs.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    obs.takeRecords();
    syncSelect();
  }

  function syncSelect() {
    const sel = document.getElementById('lang');
    if (sel && sel.value !== lang) sel.value = lang;
  }

  function setLang(l) {
    if (LANGS.indexOf(l) < 0 || l === lang) { syncSelect(); return; }
    lang = l;
    cache = new Map();
    try { localStorage.setItem(KEY, l); } catch (e) { /* ignore */ }
    document.documentElement.lang = l;
    if (started) { walk(document.documentElement); if (obs) obs.takeRecords(); }
    syncSelect();
    listeners.slice().forEach((f) => { try { f(l); } catch (e) { console.warn('[i18n]', e); } });
    document.dispatchEvent(new CustomEvent('i18nchange', { detail: l }));
  }

  // для вставки в текст/canvas: I18N.t('SETTINGS')
  const t = (s, ctx) => tr(s, ctx);

  // цитаты и другие массивы: I18N.setList('quotes', 'en', [...]); I18N.list('quotes', i, ruText)
  const lists = {};
  function setList(name, l, arr) { (lists[name] || (lists[name] = {}))[l] = arr; }
  function list(name, i, fallback) {
    const a = lists[name] && lists[name][lang];
    return (a && a[i] != null && a[i] !== '') ? a[i] : fallback;
  }

  window.I18N = {
    LANGS, NAMES, add, t, setLang, setList, list, walk,
    get lang() { return lang; },
    onChange(f) { listeners.push(f); },
    missing: () => Array.from(missing),
    clearMissing() { missing.clear(); },
    size: () => exact.size + pats.length
  };

  lang = detect();
  // defer-скрипты выполняются до DOMContentLoaded: к этому моменту все словари уже добавлены
  if (document.readyState === 'complete') start();
  else document.addEventListener('DOMContentLoaded', start);
}());
