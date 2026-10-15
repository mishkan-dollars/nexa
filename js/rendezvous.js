// NEXA/OS: «почтовый ящик» для автоматического рукопожатия WebRTC — публичные открытые WebSocket-трекеры протокола WebTorrent (без аккаунтов, ключей и оплаты).
// Через трекер ходят ТОЛЬКО служебные SDP offer/answer; игра, чат и голос идут напрямую (P2P, RTCDataChannel/медиа). Без трекеров игра работает через ручные коды (net.js).
//   • Rendezvous(theme, opts) — announce-протокол JSON поверх WebSocket (минимальная реализация, без библиотек); транспорт заменяемый (MultiTransport = трекеры + Nostr-релеи).
//     info_hash = SHA-1('nexa-hl-v1/' + тема) (20-байтная binary string), peer_id = 20 случайных байт. announce {action:'announce', info_hash, peer_id, numwant, offers:[…],
//     uploaded:0, downloaded:0, left:1, event:'started'}; входящий offer -> answer {…, to_peer_id, offer_id, answer}; входящий answer -> завершить соединение.
//   • NexaRoom: комната по ссылке ?room=<id> (хост отвечает, гость предлагает), приватная комната по имени, публичные комнаты (gossip-рой 'lobby': пиры
//     обмениваются списком открытых комнат по DataChannel), «Быстрая игра» (очередь 'quick/<режим>': меньший peer_id — хост).
// ДВА независимых транспорта сигналинга параллельно: WebTorrent-трекеры и Nostr-релеи (NIP-01, эфемерные события, подпись BIP-340 — js/schnorr.js). Список серверов —
// js/servers.js; конфигурация: ?tracker=ws://127.0.0.1:PORT и ?relay=ws://127.0.0.1:PORT (через запятую) либо localStorage 'nexaTrackers'/'nexaRelays'. Одновременно живых
// соединений до LIVE_MAX (6), остальные в резерве; сбойный сервер помечается «мёртвым» на несколько минут (экспоненциально дольше при повторах), берётся запасной;
// дубли offer_id отбрасываются. Серверы могут быть недоступны или отключать клиентов по своим правилам — ручной режим (коды) от них не зависит и работает всегда.
// ПРИВАТНОСТЬ: трекеры и незнакомые игроки технически видят сетевой адрес (WebRTC); IP нигде не показывается в интерфейсе/журнале (scrub); все данные из сети
// валидируются и санитайзятся; публичный чат не модерируется (заглушить/пожаловаться — локально).
(function () {
  'use strict';
  const NN = window.NexaNet;
  if (!NN) return;
  const SALT = 'nexa-hl-v1/';
  const MAXP = NN.MAX_PLAYERS;
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* без хранилища */ } };
  const scrub = NN.util.scrub;
  const now = () => Date.now();

  Object.assign(NN.MSG, {
    NO_TRACKER: 'The meeting servers (public WebTorrent trackers) are not reachable. Use the manual connection with codes — it works without them.',
    TRACKER_TIMEOUT: 'No answer from your friend yet. Check that the host keeps the game open, or use the manual connection with codes.',
    ROOM_BAD: 'This room link is not valid.',
    ROOM_NAME_BAD: 'Use 3–24 letters, digits, - or _ for the room name.',
    SERVERS_OFF: 'Signaling servers are switched off. Use the manual connection with codes.',
    ROOM_GONE: 'The room is no longer available.',
    QUICK_TIMEOUT: 'No players found right now. Create a public room and wait for others.',
    PUBLIC_OFF: 'Public rooms need your consent first.',
    TRADE_GONE: 'That player is no longer in your room.',
    TRADE_AMT: 'Enter a whole amount from 1 to 1000000.',
    TRADE_FUNDS: 'Not enough KP.'
  });

  // ------------------------------------------------------------------ SHA-1 (запасной вариант без crypto.subtle: file://, старые браузеры)
  function sha1js(u8) {
    const H = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0], rol = (x, n) => (x << n) | (x >>> (32 - n));
    const l = u8.length, nb = ((l + 9 + 63) >> 6) << 6, b = new Uint8Array(nb);
    b.set(u8); b[l] = 0x80;
    const dv = new DataView(b.buffer); dv.setUint32(nb - 4, (l * 8) >>> 0); dv.setUint32(nb - 8, Math.floor(l / 0x20000000));
    const w = new Uint32Array(80);
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i += 1) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 80; i += 1) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
      let [a, bb, c, d, e] = H;
      for (let i = 0; i < 80; i += 1) {
        const f = i < 20 ? (bb & c) | (~bb & d) : i < 40 ? bb ^ c ^ d : i < 60 ? (bb & c) | (bb & d) | (c & d) : bb ^ c ^ d;
        const k = i < 20 ? 0x5A827999 : i < 40 ? 0x6ED9EBA1 : i < 60 ? 0x8F1BBCDC : 0xCA62C1D6;
        const t = (rol(a, 5) + f + e + k + w[i]) >>> 0; e = d; d = c; c = rol(bb, 30) >>> 0; bb = a; a = t;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + bb) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0; H[4] = (H[4] + e) >>> 0;
    }
    const out = new Uint8Array(20), ov = new DataView(out.buffer); H.forEach((h, i) => ov.setUint32(i * 4, h));
    return out;
  }
  async function infoHash(theme) {
    const data = new TextEncoder().encode(SALT + theme);
    let u8;
    try { u8 = window.crypto && crypto.subtle ? new Uint8Array(await crypto.subtle.digest('SHA-1', data)) : sha1js(data); } catch (e) { u8 = sha1js(data); }
    return String.fromCharCode.apply(null, u8);
  }
  function randBin(n) {
    const a = new Uint8Array(n);
    try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < n; i += 1) a[i] = Math.floor(Math.random() * 256); }
    return String.fromCharCode.apply(null, a);
  }
  const toHex = (bin) => Array.from(bin, (c) => (c.charCodeAt(0) + 256).toString(16).slice(1)).join('');

  // ------------------------------------------------------------------ список серверов (js/servers.js) и их здоровье
  const SV = window.NexaServers || { TRACKERS: [], NOSTR_RELAYS: [], LIVE_MAX: 6, DEAD_MS: 180000, KIND: 27777 };
  const LIVE_MAX = () => SV.LIVE_MAX || 6;
  const loopback = (u) => { try { return /^(127\.0\.0\.1|localhost|\[::1\])$/.test(new URL(u).hostname); } catch (e) { return false; } };
  function validServer(u) {
    let url; try { url = new URL(u); } catch (e) { return false; }
    if (url.protocol === 'wss:') return true;
    return url.protocol === 'ws:' && loopback(u);     // ws:// — только петля (тесты); публичные — только wss://
  }
  const validTracker = validServer;
  const lbl = (u) => (loopback(u) ? u.replace(/^wss?:\/\//, '') : hostLabel(u));
  const hostLabel = (u) => { try { const h = new URL(u); return loopback(u) ? 'localhost (test)' : h.hostname + (h.port && h.port !== '443' ? ':' + h.port : ''); } catch (e) { return 'server'; } };
  function paramList(name) {
    try { const q = new URLSearchParams(location.search).getAll(name).join(','); return q ? q.split(',') : null; } catch (e) { return null; }
  }
  const cleanList = (l) => Array.from(new Set((l || []).map((x) => String(x).trim()).filter((x) => x && validServer(x)))).slice(0, 5000);
  // ---- обнаружение релеев во время работы (NIP-66 kind 30166, NIP-65 kind 10002): адреса не вшиты, а берутся у проверенных релеев
  const DISC_TTL = 14 * 86400000, DISC_MAX = 6000, DISC_USE = 5000;
  const BAD_HOST = /(^|\.)(workers\.dev|onrender\.com|fly\.dev|trycloudflare\.com|ts\.net|duckdns\.org|onion|local|localhost|internal|example\.\w+)$/;
  function cleanRelay(u) {
    let x; try { x = new URL(String(u).trim()); } catch (e) { return ''; }
    if (x.protocol !== 'wss:' || x.username || x.password || x.search || x.hash || (x.pathname && x.pathname !== '/')) return '';
    const h = x.hostname.toLowerCase();
    if (h.length > 40 || h.indexOf('.') < 1 || /^[\d.]+$/.test(h) || h.indexOf(':') >= 0 || h.indexOf('[') >= 0 || BAD_HOST.test(h) || /(^|[.-])(test|dev|staging|stage|demo|tmp)([.-]|\d|$)/.test(h) || !/^[a-z0-9.-]+$/.test(h)) return '';
    return 'wss://' + h + (x.port && x.port !== '443' ? ':' + x.port : '');
  }
  let DISC = { list: {}, t: 0 };
  try { const j = JSON.parse(lsGet('nexaDiscovered') || '{}'); if (j && typeof j.list === 'object' && j.list) { DISC.list = j.list; DISC.t = +j.t || 0; } } catch (e) { DISC = { list: {}, t: 0 }; }
  const saveDisc = () => {
    try {
      const t = Date.now(); let k = Object.keys(DISC.list).filter((u) => t - DISC.list[u] < DISC_TTL);
      if (k.length > DISC_MAX) k = k.sort((a, b) => DISC.list[b] - DISC.list[a]).slice(0, DISC_MAX);
      const o = {}; k.forEach((u) => { o[u] = DISC.list[u]; }); DISC.list = o;
      lsSet('nexaDiscovered', JSON.stringify({ v: 1, t: DISC.t, list: o }));
    } catch (e) { /* не критично */ }
  };
  const discUrls = () => { const t = Date.now(); return Object.keys(DISC.list).filter((u) => t - DISC.list[u] < DISC_TTL).slice(0, DISC_USE); };
  function discEvent(ev, add) {
    if (!ev || typeof ev !== 'object' || !Array.isArray(ev.tags)) return;
    if (ev.kind === 30166) {
      const tags = ev.tags, d = tags.find((x) => x[0] === 'd'); if (!d) return;
      const req = tags.filter((x) => x[0] === 'R').map((x) => String(x[1]));
      if (req.some((x) => x === 'auth' || x === 'payment' || x === 'pow')) return;
      if (tags.some((x) => x[0] === 'n' && x[1] && x[1] !== 'clearnet')) return;
      if (!tags.some((x) => x[0] === 'rtt-open')) return;
      add(d[1]);
    } else if (ev.kind === 10002) {
      ev.tags.forEach((x) => { if (x[0] === 'r' && x[1]) add(x[1]); });
    }
  }
  const rdv = (msg) => { try { console.info('[rdv] ' + msg); } catch (e) { /* ok */ } };
  const DS = { running: false, rounds: 0, last: 0, rep: [] };
  // один релей: по каждому виду событий листаем назад по времени (until), пока приходят новые страницы
  function pageRelay(url, add, budget, rp) {
    return new Promise((res) => {
      let ws, done = false, total = 0;
      rp = rp || {};
      const fin = () => { if (done) return; done = true; rp.ev = total; if (!rp.open && !rp.err) rp.err = 'timeout'; clearTimeout(tm); try { ws && ws.close(); } catch (e) { /* ok */ } res(); };
      const tm = setTimeout(fin, budget || 20000);
      try { ws = new WebSocket(url); } catch (e) { rp.err = String(e && e.message || e).slice(0, 60); fin(); return; }
      const plan = []; [30166, 10002].forEach((k) => plan.push({ kind: k, until: 0, page: 0 }));
      let cur = null, n = 0, oldest = 0, pend = 0;
      const next = () => {
        cur = plan.shift(); if (!cur) { fin(); return; }
        n = 0; oldest = 0; pend = 1;
        const f = { kinds: [cur.kind], limit: 700 }; if (cur.until) f.until = cur.until;
        try { ws.send(JSON.stringify(['REQ', 'nxd', f])); } catch (e) { fin(); }
      };
      ws.onopen = () => { rp.open = true; next(); };
      ws.onmessage = (m) => {
        let j; try { j = JSON.parse(m.data); } catch (e) { return; }
        if (!Array.isArray(j)) return;
        if (j[0] === 'NOTICE' && !rp.note) rp.note = String(j[1] || '').slice(0, 60);
        if (j[0] === 'EVENT' && j[2] && total < 12000) { n += 1; total += 1; const t = j[2].created_at | 0; if (t && (!oldest || t < oldest)) oldest = t; discEvent(j[2], add); }
        else if (j[0] === 'EOSE' || j[0] === 'CLOSED') {
          try { ws.send(JSON.stringify(['CLOSE', 'nxd'])); } catch (e) { /* ok */ }
          if (n >= 200 && oldest && cur.page < 5 && total < 12000 && (!cur.until || oldest < cur.until)) plan.unshift({ kind: cur.kind, until: oldest - 1, page: cur.page + 1 });
          next();
        }
      };
      ws.onerror = () => { if (!rp.open) rp.err = 'ws error'; fin(); }; ws.onclose = () => { if (!rp.open && !rp.err) rp.err = 'closed'; fin(); };
    });
  }
  // раунды: сначала проверенные релеи, затем найденные и ответившие; повторяем, пока приток новых адресов не иссякнет (потолок 4 раунда)
  function discover(force) {
    if (DS.running || !serversOn()) return Promise.resolve(0);
    const few = summary().online < 15;
    if (!force && !few && Date.now() - DISC.t < 6 * 3600000 && Object.keys(DISC.list).length > 50) return Promise.resolve(0);
    if (!force && Date.now() - DS.last < (Object.keys(DISC.list).length ? 120000 : 180000)) return Promise.resolve(0);
    DS.running = true; DS.rounds = 0; DS.last = Date.now(); DS.rep = [];
    const used = new Set();
    let added = 0;
    const add = (u) => { const c = cleanRelay(u); if (!c) return; if (!DISC.list[c]) { added += 1; roundNew += 1; } DISC.list[c] = Date.now(); };
    let roundNew = 0;
    const pickSrc = (first) => {
      let list;
      if (first) {
        list = paramList('discrelay') || paramList('relay') || (SV.NOSTR_VERIFIED || []).filter((u) => { const r = store[u]; return !r || r.ok || !fresh(r); });
        if (!list.length) list = Object.keys(store).filter((u) => store[u].ok && fresh(store[u])).sort((a, b) => store[a].ms - store[b].ms);
        if (!list.length) list = (SV.NOSTR_VERIFIED || []).concat(SV.NOSTR_CANDIDATES || []);
        list = list.slice(0, 6);
      } else list = Object.keys(DISC.list).filter((u) => !used.has(u) && store[u] && store[u].ok && fresh(store[u])).slice(0, 6);
      return list.filter((u) => !used.has(u));
    };
    const round = async (first) => {
      const src = pickSrc(first); if (!src.length) return;
      src.forEach((u) => used.add(u)); roundNew = 0; DS.rounds += 1;
      await Promise.all(src.map((u) => { const rp = {}; DS.rep.push({ u, rp }); return pageRelay(u, add, 0, rp); }));
      saveDisc(); seAt = 0; emitServers();
    };
    return (async () => {
      try {
        await round(true);
        for (let i = 0; i < 3 && roundNew >= 20; i += 1) { await probe(false, 48); await round(false); }
      } catch (e) { rdv('discover: ' + (e && e.message || e)); }
      DS.running = false; if (Object.keys(DISC.list).length) DISC.t = Date.now(); saveDisc(); seAt = 0; emitServers();
      const okN = DS.rep.filter((x) => x.rp.open).length;
      rdv('discover: +' + added + ', всего ' + discUrls().length + ', релеев опрошено ' + DS.rep.length + ', открылось ' + okN + (okN ? '' : ' (' + DS.rep.slice(0, 4).map((x) => x.rp.err || '?').join(', ') + ')') + (added || !okN ? '' : ', события: ' + DS.rep.reduce((a, x) => a + (x.rp.ev || 0), 0)));
      return added;
    })();
  }
  // [{url, type:'tracker'|'nostr'}]: параметры ?tracker= / ?relay= (через запятую) или localStorage 'nexaTrackers' / 'nexaRelays' заменяют списки по умолчанию
  let seCache = null, seAt = 0;
  function serverEntries() {
    if (seCache && now() - seAt < 2000) return seCache;
    seCache = serverEntriesRaw(); seAt = now();
    return seCache;
  }
  function serverEntriesRaw() {
    let tr = paramList('tracker'), rl = paramList('relay');
    const custom = !!(tr || rl);
    if (!tr) { const s = lsGet('nexaTrackers'); if (s) { try { const j = JSON.parse(s); tr = Array.isArray(j) ? j : String(s).split(','); } catch (e) { tr = String(s).split(','); } } }
    if (!rl) { const s = lsGet('nexaRelays'); if (s) { try { const j = JSON.parse(s); rl = Array.isArray(j) ? j : String(s).split(','); } catch (e) { rl = String(s).split(','); } } }
    if (custom) { tr = tr || []; rl = rl || []; } else { tr = tr || SV.TRACKERS; rl = rl || SV.NOSTR_RELAYS; }
    const ver = new Set((custom ? [] : (SV.NOSTR_VERIFIED || []).concat(SV.TRACKERS_VERIFIED || []))), low = new Set(custom ? [] : (SV.NOSTR_LOW || []));
    const out = cleanList(tr).slice(0, 8).map((u) => ({ url: u, type: 'tracker', verified: ver.has(u) }));
    const seen = new Set();
    cleanList(rl).forEach((u) => { seen.add(u); out.push({ url: u, type: 'nostr', verified: ver.has(u), low: low.has(u) }); });
    if ((!custom || paramList('discrelay')) && serversOn()) discUrls().forEach((u) => { if (!seen.has(u) && validServer(u)) { seen.add(u); out.push({ url: u, type: 'nostr', verified: false, low: false, disc: true }); } });
    return out;
  }
  let srvT = 0;
  const emitServers = () => { if (srvT) return; srvT = setTimeout(() => { srvT = 0; emit('servers'); }, 500); };
  const trackerList = () => serverEntries().filter((e) => e.type === 'tracker').map((e) => e.url);
  const serversOn = () => lsGet('nexaServersOn') !== '0';
  // здоровье по адресу: состояние, число подряд сбоев, «мёртв до»
  const HEALTH = new Map();
  const hl = (url, type) => { let h = HEALTH.get(url); if (!h) HEALTH.set(url, h = { url, type: type || 'tracker', state: 'idle', fails: 0, deadUntil: 0, lastOk: 0, why: '' }); return h; };
  const deadBase = () => (SV.DEAD_MS || 180000);
  // результаты проверок (кто ответил и за сколько мс) хранятся в localStorage с временем; свежими считаются 30 минут
  const FRESH = 30 * 60000;
  let store = {};
  try { const j = JSON.parse(lsGet('nexaSrvHealth') || '{}'); if (j && typeof j === 'object') store = j; } catch (e) { store = {}; }
  const saveStore0 = () => { try { const k = Object.keys(store); if (k.length > 3000) k.slice(0, k.length - 3000).forEach((x) => { delete store[x]; }); lsSet('nexaSrvHealth', JSON.stringify(store)); } catch (e) { /* без хранилища */ } };
  let ssT = 0;
  const saveStore = () => { if (ssT) return; ssT = setTimeout(() => { ssT = 0; saveStore0(); }, 1500); };
  const fresh = (r) => !!r && now() - r.t < FRESH;
  function markDead(url, type, why, hard) {
    const h = hl(url, type);
    h.fails += 1; h.state = 'down'; h.why = why || ''; h.checked = now();
    h.deadUntil = now() + (hard ? 30 * 60000 : Math.min(30 * 60000, deadBase() * Math.pow(2, Math.min(4, h.fails - 1))));
    store[url] = { ok: false, ms: 0, t: now(), n: why || '' }; saveStore();
    emitServers();
  }
  function markOk(url, type, ms, note) {
    const h = hl(url, type); h.state = 'online'; h.fails = 0; h.deadUntil = 0; h.lastOk = now(); h.checked = now(); h.why = ''; if (ms >= 0) h.ms = ms; if (note !== undefined) h.note = note;
    store[url] = { ok: true, ms: Math.round(h.ms || 0), t: now(), n: h.note || '' }; saveStore();
    emitServers();
  }
  // приоритет при выборе: свежо ответившие по задержке, затем непроверенные, свежо упавшие — в конец
  // проверенные пользователем (VERIFIED) идут раньше непроверенных, неработавшие (LOW) — в самом конце
  let lastGood = []; try { lastGood = JSON.parse(lsGet('nexaLastGood') || '[]').filter((x) => typeof x === 'string').slice(0, 12); } catch (e) { lastGood = []; }
  if (Date.now() - (+lsGet('nexaLastGoodT') || 0) > 86400000) lastGood = [];   // TTL кэша рабочих серверов — 24 ч
  const rankOf = (e) => { const r = store[e.url], h = HEALTH.get(e.url); if (lastGood.indexOf(e.url) >= 0) return 0.5; if (h && h.state === 'online') return h.ms || 1; if (fresh(r)) return r.ok ? r.ms || 1 : 1e9; return (e.low ? 8000 : e.verified ? 2000 : 5000) + Math.random() * 1000; };
  const ranked = (entries) => entries.map((e) => ({ e, k: rankOf(e) })).sort((a, b) => a.k - b.k).map((x) => x.e);
  for (const u of Object.keys(store)) { const r = store[u]; if (fresh(r) && r.ok) { const h = hl(u, 'nostr'); h.state = 'online'; h.ms = r.ms; h.lastOk = r.t; h.checked = r.t; } }
  const isDead = (url) => { const h = HEALTH.get(url); return !!(h && h.state === 'down' && h.deadUntil > now()); };
  function serverList() {
    const on = serversOn(), act = activeSet();
    return serverEntries().map((e) => {
      const h = HEALTH.get(e.url) || { state: 'idle', fails: 0 }, r = store[e.url];
      let st = 'idle';
      if (!on) st = 'off';
      else if (h.state === 'connecting') st = 'connecting';
      else if (h.state === 'online' && (act.has(e.url) || fresh(r) || (h.lastOk && now() - h.lastOk < FRESH))) st = act.has(e.url) ? 'active' : 'online';
      else if (h.state === 'down') st = 'down';
      else if (fresh(r)) st = r.ok ? 'online' : 'down';
      if (st === 'idle' && act.has(e.url)) st = 'connecting';
      const why = st === 'down' ? (h.why || (r && r.n) || '') : (st === 'online' || st === 'active' ? (h.note || (r && r.ok && r.n) || '') : '');
      return { url: e.url, host: hostLabel(e.url), type: e.type, state: st, fails: h.fails || 0, ms: Math.round(h.ms || (r && r.ms) || 0), why, checked: st === 'active' || st === 'online' || st === 'down' };
    });
  }
  // честная сводка: всё считается по фактическим проверкам и соединениям
  function summary() {
    const l = serverList();
    return { found: discUrls().length, total: l.length, checked: l.filter((x) => x.checked).length, online: l.filter((x) => x.state === 'online' || x.state === 'active').length, active: l.filter((x) => x.state === 'active' || x.state === 'connecting').length, down: l.filter((x) => x.state === 'down').length };
  }
  const transports = new Set();
  function activeSet() { const s = new Set(); transports.forEach((t) => t.adapters.forEach((a) => { if (a.state === 'connecting' || a.state === 'open') s.add(a.url); })); return s; }

  // ------------------------------------------------------------------ адаптеры серверов
  // Трекер WebTorrent: announce JSON поверх WebSocket
  class TrackerAdapter {
    constructor(mt, e) { this.mt = mt; this.url = e.url; this.type = 'tracker'; this.state = 'connecting'; this.ws = null; this.got = false; }
    connect() {
      let ws; const mt = this.mt;
      try { ws = new WebSocket(this.url); } catch (e) { mt.fail(this, 'ws'); return; }
      this.ws = ws; this.t0 = now();
      this.timer = setTimeout(() => { if (this.state === 'connecting') mt.fail(this, 'timeout'); }, 6000);
      ws.onopen = () => { clearTimeout(this.timer); this.state = 'open'; this.mt.fc.delete(this.url); markOk(this.url, 'tracker', now() - this.t0); mt.h.status(); mt.h.open(this);
        this.silent = setTimeout(() => { if (this.state === 'open' && !this.got) mt.fail(this, 'silent'); }, 15000); };
      ws.onerror = () => { if (this.state === 'connecting') mt.fail(this, 'error'); };
      ws.onclose = () => { if (this.state !== 'closed' && this.state !== 'failed') mt.fail(this, 'closed'); };
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string' || e.data.length > 64 * 1024) return;
        let m; try { m = JSON.parse(e.data); } catch (er) { return; }
        if (!m || typeof m !== 'object') return;
        this.got = true; this.lastRx = now();
        if (m['failure reason']) { mt.fail(this, 'refused', /unsupported|not allowed|forbidden|banned|blocked|blacklist|unknown|invalid/i.test(String(m['failure reason'])) || (this.refused = (this.refused || 0) + 1) > 2); return; }
        if (m.action !== 'announce' || typeof m.info_hash !== 'string') return;
        this.rx = (this.rx || 0) + 1; mt.h.message(m, this);
      };
    }
    announce(obj) { this.pubs = (this.pubs || 0) + 1; return this.raw(obj); }
    answer(obj) { this.pubs = (this.pubs || 0) + 1; return this.raw(obj); }
    raw(obj) { if (this.ws && this.state === 'open') { try { this.ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; } } return false; }
    close() { clearTimeout(this.timer); clearTimeout(this.silent); this.state = 'closed'; try { this.ws && this.ws.close(); } catch (e) { /* ok */ } }
  }
  // Nostr-релей (NIP-01): REQ с подпиской по теме, публикация эфемерных событий, подписанных одноразовым ключом сессии (BIP-340).
  // Релей не считается мёртвым по ошибке: если соединение открылось, отказ на наш kind -> пробуем другой эфемерный kind (2xxxx), только потом «только чтение»;
  // отказ REQ с тегом -> повтор без тега (теги проверяем сами); rate-limit -> пауза; мёртвым без повтора — только PoW/оплата/AUTH/whitelist.
  let nostrKey = null;
  const getKey = () => nostrKey || (nostrKey = window.NexaSchnorr.newKey());
  const kinds = () => (Array.isArray(SV.KINDS) && SV.KINDS.length ? SV.KINDS : [SV.KIND || 27777]);
  const REJ = { pow: /pow|proof.of.work|difficulty/i, paid: /pay|paid|subscri|whitelist|allowlist|admission|invite|restricted: ?(pubkey|not)/i, auth: /auth/i, kind: /kind|blocked|not accepted|unsupported|disallow|not allowed|ephemeral|invalid: .*event/i, rate: /rate|too (fast|many)|slow down|limit|throttl/i };
  class NostrAdapter {
    constructor(mt, e) { this.mt = mt; this.url = e.url; this.type = 'nostr'; this.state = 'connecting'; this.ws = null; this.got = false; this.q = []; this.sub = 'nx' + NN.util.rndHex(4); this.ki = 0; this.sent = new Map(); this.rej = 0; this.noTag = false; this.pauseUntil = 0; this.pubs = 0; this.oks = 0; this.rx = 0; this.eose = false; this.lastRx = now(); this.rl = 0; }
    req() {
      const f = { kinds: kinds(), since: Math.floor(Date.now() / 1000) - 600, limit: 30 };
      if (!this.noTag) f['#t'] = [this.mt.hashHex];
      this.raw(['REQ', this.sub, f]);
    }
    connect() {
      const mt = this.mt; let ws;
      if (!window.NexaSchnorr) { mt.fail(this, 'nocrypto', true); return; }
      try { ws = new WebSocket(this.url); } catch (e) { mt.fail(this, 'ws'); return; }
      this.ws = ws; this.t0 = now();
      this.timer = setTimeout(() => { if (this.state === 'connecting') mt.fail(this, 'timeout'); }, 7000);
      ws.onopen = () => {                                                  // соединение открылось — сервер достижим: сразу рабочий
        clearTimeout(this.timer); this.state = 'open'; mt.fc.delete(this.url); markOk(this.url, 'nostr', now() - this.t0); mt.h.status(); mt.h.open(this);
        this.req(); this.lastRx = now();
        this.beat = setInterval(() => this.heartbeat(), 8000);
        this.silent = setTimeout(() => { if (this.state === 'open' && this.pubs > 3 && !this.oks && !this.got) mt.fail(this, 'silent'); }, 15000);   // молчит и на публикации, и на REQ
      };
      ws.onerror = () => { if (this.state === 'connecting') mt.fail(this, 'error'); };
      ws.onclose = () => { if (this.state !== 'closed' && this.state !== 'failed') mt.fail(this, this.state === 'connecting' ? 'error' : 'closed'); };
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string' || e.data.length > 96 * 1024) return;
        let m; try { m = JSON.parse(e.data); } catch (er) { return; }
        if (!Array.isArray(m) || typeof m[0] !== 'string') return;
        this.got = true; this.lastRx = now();
        const t = m[0];
        if (t === 'EVENT' && m[1] === this.sub) this.onEvent(m[2]);
        else if (t === 'EOSE') { if (m[1] === this.sub) this.eose = true; else if (m[1] === this.hb) { this.hb = ''; this.raw(['CLOSE', m[1]]); } }
        else if (t === 'OK') this.onOk(m);
        else if (t === 'NOTICE') {
          const msg = String(m[1] || '');
          if (REJ.pow.test(msg)) mt.fail(this, 'pow', true);
          else if (REJ.paid.test(msg)) mt.fail(this, 'paid', true);
          else if (REJ.rate.test(msg)) this.backoff();                       // лимит частоты — не смертельно: пауза растёт 3→24 с, соединение не бросаем
        } else if (t === 'AUTH') mt.fail(this, 'auth', true);
        else if (t === 'CLOSED' && m[1] === this.sub) {
          const msg = String(m[2] || '');
          if (REJ.auth.test(msg)) mt.fail(this, 'auth', true);
          else if (REJ.pow.test(msg)) mt.fail(this, 'pow', true);
          else if (REJ.paid.test(msg)) mt.fail(this, 'paid', true);
          else if (!this.noTag) { this.noTag = true; setTimeout(() => this.req(), 300); }     // повтор без тег-фильтра
          else if (REJ.rate.test(msg)) setTimeout(() => this.req(), 5000);
          else mt.fail(this, 'closedreq', false);
        }
      };
    }
    onOk(m) {
      const id = m[1], ok = m[2] !== false, why = String(m[3] || ''), c = this.sent.get(id);
      if (ok) { this.oks += 1; this.rej = 0; this.rl = 0; this.sent.delete(id); return; }
      this.sent.delete(id);
      const mt = this.mt;
      if (REJ.pow.test(why)) return mt.fail(this, 'pow', true);
      if (REJ.paid.test(why)) return mt.fail(this, 'paid', true);
      if (REJ.auth.test(why)) return mt.fail(this, 'auth', true);
      if (REJ.rate.test(why)) { this.backoff(); if (c && c.retry < 1) { c.retry += 1; this.q.unshift(c.content); this.pump(); } return; }
      this.rej += 1;
      if (this.ki + 1 < kinds().length) { this.ki += 1; if (c) this.q.unshift(c.content); this.pump(); return; }     // другой эфемерный kind
      if (this.rej >= 3) mt.fail(this, 'readonly', true);                       // принимает соединение, но отвергает наши события
    }
    backoff() { this.rl = Math.min(3, this.rl + 1); this.pauseUntil = now() + 3000 * Math.pow(2, this.rl - 1) + Math.random() * 800; }
    // полуоткрытый сокет без onclose: если релей молчит дольше 16 с — REQ-проба, нет ответа за 7 с — соединение считается мёртвым
    heartbeat() {
      if (this.state !== 'open' || now() - this.lastRx < 16000 || this.hb) return;
      const sub = this.hb = 'nxh' + NN.util.rndHex(3), t0 = now();
      if (!this.raw(['REQ', sub, { kinds: kinds(), since: Math.floor(Date.now() / 1000), limit: 1 }])) { this.mt.fail(this, 'stale'); return; }
      setTimeout(() => { if (this.state === 'open' && this.lastRx < t0) this.mt.fail(this, 'stale'); else this.hb = ''; }, 7000);
    }
    onEvent(ev) {
      if (!ev || typeof ev !== 'object' || typeof ev.content !== 'string' || ev.content.length > 40000) return;
      if (!Array.isArray(ev.tags) || !ev.tags.some((t) => Array.isArray(t) && t[0] === 't' && t[1] === this.mt.hashHex)) return;
      let c; try { c = JSON.parse(ev.content); } catch (e) { return; }
      if (!c || typeof c !== 'object' || typeof c.pid !== 'string' || !/^[0-9a-f]{40}$/.test(c.pid) || c.pid === this.mt.ctx.peerHex) return;
      this.rx += 1;
      if (typeof c.oid !== 'string' || c.oid.length > 64 || typeof c.sdp !== 'string' || c.sdp.length > 24000) return;
      const pb = String.fromCharCode.apply(null, NexaSchnorr.unhex(c.pid));
      if (c.a === 'o') this.mt.h.message({ action: 'announce', info_hash: this.mt.ctx.hash, peer_id: pb, offer_id: c.oid, offer: { type: 'offer', sdp: c.sdp } }, this);
      else if (c.a === 'a' && c.to === this.mt.ctx.peerHex) this.mt.h.message({ action: 'announce', info_hash: this.mt.ctx.hash, peer_id: pb, offer_id: c.oid, answer: { type: 'answer', sdp: c.sdp } }, this);
    }
    raw(arr) { if (this.ws && this.ws.readyState === 1) { try { this.ws.send(JSON.stringify(arr)); return true; } catch (e) { return false; } } return false; }
    publish(content) {
      if (this.q.length >= 10) this.q.shift();                       // не копим очередь: свежее важнее
      this.q.push(content); this.pump();
    }
    pump() {
      if (this.state !== 'open' || this.pumping || !this.q.length) return;
      const wait = Math.max(0, 600 - (now() - (this.lastPub || 0)), this.pauseUntil - now());         // не чаще ~1.6 событий в секунду на реле (не спамим), пауза после лимита
      this.pumping = setTimeout(() => {
        this.pumping = 0;
        const c = this.q.shift(); if (!c || this.state !== 'open') return;
        try {
          const ev = NexaSchnorr.makeEvent(getKey(), kinds()[this.ki] || 27777, [['t', this.mt.hashHex]], c);
          this.lastPub = now(); this.pubs += 1;
          this.sent.set(ev.id, { content: c, retry: 0 }); if (this.sent.size > 20) this.sent.delete(this.sent.keys().next().value);
          this.raw(['EVENT', ev]);
        } catch (e) { /* ok */ }
        this.pump();
      }, wait);
    }
    announce(obj) {
      if (!obj.offers || !obj.offers.length) return this.state === 'open';
      obj.offers.forEach((o) => this.publish(JSON.stringify({ a: 'o', pid: this.mt.ctx.peerHex, oid: o.offer_id, sdp: o.offer.sdp })));
      return this.state === 'open';
    }
    answer(obj) {
      this.publish(JSON.stringify({ a: 'a', pid: this.mt.ctx.peerHex, to: toHex(obj.to_peer_id), oid: obj.offer_id, sdp: obj.answer.sdp }));
      return this.state === 'open';
    }
    close() { clearTimeout(this.timer); clearTimeout(this.silent); clearTimeout(this.pumping); clearInterval(this.beat); this.state = 'closed'; if (this.ws) { try { this.raw(['CLOSE', this.sub]); this.ws.close(); } catch (e) { /* ok */ } } }
  }

  // ------------------------------------------------------------------ MultiTransport: все серверы параллельно (до LIVE_MAX живых, остальные в резерве)
  // Интерфейс транспорта (заменяемый): open(), announce(obj) -> число серверов, answer(obj, offerId) -> bool, states(), status(), close();
  // hooks: status(), open(adapter), message(msg, adapter) — msg в формате announce WebTorrent.
  class MultiTransport {
    constructor(entries, hooks, ctx) {
      this.entries = entries; this.h = hooks; this.ctx = ctx; this.adapters = []; this.closed = false; this.fillT = 0; this.ctx.peerHex = toHex(ctx.peerId); this.hashHex = toHex(ctx.hash);
      this.offerFrom = new Map(); this.cool = new Map(); this.hardDead = new Set(); this.fc = new Map();
    }
    open() { transports.add(this); this.fill(); this.fillT = setInterval(() => this.fill(), 4000); }
    fill() {
      if (this.closed) return;
      const act = this.adapters.filter((a) => a.state === 'connecting' || a.state === 'open').length;
      let free = (this.ctx.liveMax || LIVE_MAX()) - act;
      const core = this.entries.filter((e) => e.core);
      for (const e of core.concat(ranked(this.entries.filter((x) => !x.core)))) {
        if (free <= 0) break;
        if (this.adapters.some((a) => a.url === e.url && (a.state === 'connecting' || a.state === 'open'))) continue;
        if (e.core ? (this.hardDead.has(e.url) || (this.cool.get(e.url) || 0) > now()) : isDead(e.url)) continue;
        const a = e.type === 'nostr' ? new NostrAdapter(this, e) : new TrackerAdapter(this, e);
        a.core = !!e.core;
        this.adapters = this.adapters.filter((x) => x.url !== e.url);
        this.adapters.push(a); hl(e.url, e.type).state = 'connecting'; free -= 1;
        a.connect();
      }
      this.h.status();
      emitServers();
    }
    fail(a, why, hard) {
      if (a.state === 'failed' || a.state === 'closed') return;
      const wasOpen = a.state === 'open';
      a.state = 'failed'; a.close(); a.state = 'failed'; if (a.core === undefined) a.core = false;
      markDead(a.url, a.type, why, hard);
      if (wasOpen && !hard) { const h = hl(a.url); h.deadUntil = now() + 15000; }       // оборвалось после работы — короткий отдых, потом снова
      a.why = why;
      if (a.core) {                                                                     // ядро комнаты не бросаем: переподключение с нарастающей паузой и джиттером (1→2→4→8→15 с)
        if (hard) this.hardDead.add(a.url);
        else { const n = (this.fc.get(a.url) || 0) + 1; this.fc.set(a.url, n); this.cool.set(a.url, now() + Math.min(15000, 900 * Math.pow(2, n - 1)) + Math.random() * 500); }
      }
      this.h.status();
      setTimeout(() => this.fill(), 600);                                               // взять запасной из списка
    }
    announce(obj) { let n = 0; this.adapters.forEach((a) => { if (a.state === 'open' && a.announce(obj)) n += 1; }); return n; }
    answer(obj, offerId) { let n = 0; this.adapters.forEach((a) => { if (a.state === 'open' && a.answer(obj, offerId)) n += 1; }); return n > 0; }
    states() { return this.adapters.map((a) => (a.state === 'open' ? 'open' : a.state === 'connecting' ? 'connecting' : 'error')); }
    status() {
      const up = this.adapters.filter((a) => a.state === 'open').length, connecting = this.adapters.filter((a) => a.state === 'connecting').length;
      const usable = this.entries.filter((e) => !isDead(e.url) && !this.adapters.some((a) => a.url === e.url && (a.state === 'open' || a.state === 'connecting'))).length;
      const core = this.entries.filter((e) => e.core);
      return { up, connecting, total: this.entries.length, reserve: usable, core: core.length, coreUp: core.filter((e) => this.adapters.some((a) => a.url === e.url && a.state === 'open')).length };
    }
    setEntries(entries, liveMax) { this.entries = entries; if (liveMax) this.ctx.liveMax = liveMax; this.fill(); }
    close() { this.closed = true; clearInterval(this.fillT); this.adapters.forEach((a) => { a.close(); }); this.adapters = []; transports.delete(this); emitServers(); }
  }

  // проверка здоровья всех серверов списка (кнопка «Проверить»): короткое соединение, не больше LIVE_MAX одновременно
  let probing = null;
  // проверка живости: короткое соединение пачками по 8, таймаут 4 с; force — всех, иначе только тех, у кого нет свежего результата (limit — не больше N лучших кандидатов)
  function probe(force, limit) {
    if (probing) return probing;
    const act = activeSet();
    let list = serverEntries().filter((e) => !act.has(e.url) && (force || !fresh(store[e.url])));
    if (limit) list = ranked(list).slice(0, limit);
    list.forEach((e) => { const h = hl(e.url, e.type); h.state = 'connecting'; h.deadUntil = 0; });
    emitServers();
    let i = 0;
    // сервер «онлайн», если WebSocket открылся (измеренная задержка); ответ на пробный REQ только уточняет примечание (требует вход / не отвечает), мёртвым не делает
    const one = (e) => new Promise((res) => {
      let ws, done = false, opened = false, t1 = 0; const t0 = now();
      const fin = (ok, why, note) => { if (done) return; done = true; clearTimeout(tm); try { ws && ws.close(); } catch (er) { /* ok */ } if (ok) markOk(e.url, e.type, t1 || now() - t0, note || ''); else markDead(e.url, e.type, why || 'probe'); res(); };
      try { ws = new WebSocket(e.url); } catch (er) { fin(false, 'ws'); return; }
      let tm = setTimeout(() => fin(false, 'timeout'), 4000);
      ws.onopen = () => {
        opened = true; t1 = now() - t0; clearTimeout(tm);
        if (e.type === 'tracker') { fin(true); return; }
        tm = setTimeout(() => fin(true, '', 'noreq'), 2000);
        try { ws.send(JSON.stringify(['REQ', 'nxp' + NN.util.rndHex(3), { kinds: [SV.KIND || 27777], limit: 1 }])); } catch (er) { fin(true, '', 'noreq'); }
      };
      ws.onmessage = (ev) => { let m = null; try { m = JSON.parse(ev.data); } catch (er) { /* ok */ } const t = Array.isArray(m) ? m[0] : ''; fin(true, '', t === 'AUTH' ? 'auth' : t === 'CLOSED' ? (/auth/i.test(String(m[2])) ? 'auth' : 'closedreq') : ''); };
      ws.onerror = () => { if (!opened) fin(false, 'error'); };
      ws.onclose = () => { if (!opened) fin(false, 'closed'); else fin(true, '', 'closed'); };
    });
    const worker = async () => { while (i < list.length) { const e = list[i]; i += 1; await one(e); } };
    probing = Promise.all(Array.from({ length: Math.min(8, list.length) }, worker)).then(() => { probing = null; MON.last = now(); emitServers(); return serverList(); });
    return probing;
  }
  // фоновый монитор: сразу и раз в 4 минуты. Работает только если игрок согласился на публичный режим или комнаты уже используются (до этого сторонних серверов не трогаем)
  const MON = { t: 0, last: 0, use: false };
  const inUse = () => !!(hostR || joinR || quickR || G.on);
  const monitorOk = () => serversOn() && (consented() || inUse() || MON.use);
  function monitorTick() {
    if (!monitorOk()) return;
    discover(false);
    const pending = Object.keys(DISC.list).filter((u) => !fresh(store[u])).length;
    probe(false, pending > 24 ? 64 : consented() ? 24 : 12);
  }   // без согласия, только при использовании комнат: не больше 12 серверов
  const monitor = {
    start(use) { if (use) MON.use = true; if (MON.t || !monitorOk()) return; monitorTick(); MON.t = setInterval(monitorTick, 40000); },       // каждый заход — до 24 непроверенных (по приоритету), проверенные живут 30 минут
    stop() { clearInterval(MON.t); MON.t = 0; MON.use = false; },
    get running() { return !!MON.t; }
  };

  // ------------------------------------------------------------------ Rendezvous: один «рой» (тема) на трекерах
  // opts.mode: 'answerer' (хост: только отвечает), 'offerer' (гость: только предлагает), 'both' (рой/очередь). Обработчики:
  //   onOffer(sdp, peerId, meta) -> Promise<{sdp, token}|null>   — на входящий offer создать ответ
  //   makeOffer() -> Promise<{sdp, token}|null>                 — создать offer (token — что угодно, вернётся в onAnswer)
  //   onAnswer(token, sdp, peerId)                              — пришёл ответ на наш offer
  //   offerCount() -> сколько offer'ов нужно сейчас (0 — не слать)
  //   onStatus(info), onBeacon(peerId) для очереди
  class Rendezvous {
    constructor(theme, opts) {
      opts = opts || {};
      this.theme = theme; this.mode = opts.mode || 'both'; this.o = opts; this.peerId = opts.peerId || randBin(20); this.hash = ''; this.running = false;
      this.pend = new Map(); this.seen = new Map(); this.timer = 0; this.pollT = 0; this.tr = null; this.busy = false; this.lastAns = 0; this.stat = { offers: 0 };
      this.transportFactory = opts.transport || ((entries, hooks, ctx) => new MultiTransport(entries, hooks, ctx));
      this.entries = opts.entries || serverEntries();
    }
    async start() {
      this.running = true;
      this.hash = await infoHash(this.theme);
      if (!this.running) return;
      this.tr = this.transportFactory(this.entries, {
        status: () => this.status(),
        open: (a) => this.onOpen(a),
        message: (m, t) => this.onMessage(m, t)
      }, { hash: this.hash, peerId: this.peerId, liveMax: this.o.liveMax });
      this.tr.open();
      this.startedAt = this.roundAt = now();
      this.timer = setInterval(() => this.tick(), this.mode === 'offerer' ? 2000 : 3500);
      this.status();
    }
    status() {
      if (!this.tr) return;
      const s = this.tr.status();
      this.up = s.up;
      try { this.o.onStatus && this.o.onStatus(Object.assign({ ms: now() - (this.roundAt || this.startedAt || now()) }, s)); } catch (e) { /* ok */ }
    }
    // новый сервер открылся: отдать ему уже опубликованные offer'ы и дослать недостающие
    onOpen(a) {
      const offers = [];
      this.pend.forEach((p, id) => { if (p.wire) offers.push(p.wire); });
      if (offers.length && a.announce) a.announce({ action: 'announce', info_hash: this.hash, peer_id: this.peerId, numwant: 5, uploaded: 0, downloaded: 0, left: 1, offers });
      this.announce(true);
    }
    async announce(first) {
      if (!this.running || !this.tr || this.busy) return;
      this.busy = true;
      try {
        const msg = { action: 'announce', info_hash: this.hash, peer_id: this.peerId, numwant: this.mode === 'answerer' ? 10 : 5, uploaded: 0, downloaded: 0, left: this.mode === 'answerer' ? 0 : 1 };
        if (first || !this.sentFirst) { msg.event = 'started'; }
        const want = this.mode === 'answerer' ? 0 : Math.max(0, Math.min(5, this.o.offerCount ? this.o.offerCount() : 0) - this.pend.size);
        const offers = [];
        const made = await Promise.all(Array.from({ length: want }, () => this.o.makeOffer()));       // offer'ы создаются параллельно, без последовательных ожиданий
        made.forEach((r) => {
          if (!r) return;
          if (!this.running) { try { this.o.dropToken && this.o.dropToken(r.token); } catch (e) { /* ok */ } return; }
          const id = toHex(randBin(10));          // 20 hex-символов (binary string)
          const wire = { offer_id: id, offer: { type: 'offer', sdp: r.sdp } };
          this.pend.set(id, { token: r.token, t: now(), wire });
          offers.push(wire);
        });
        msg.offers = Array.from(this.pend.values()).map((p) => p.wire);       // неотвеченные offer'ы шлём снова: хост мог появиться в рое позже
        if (this.tr && this.tr.announce(msg) > 0) this.sentFirst = true;
        else offers.forEach((o) => { const p = this.pend.get(o.offer_id); this.pend.delete(o.offer_id); try { this.o.dropToken && this.o.dropToken(p.token); } catch (e) { /* ok */ } });
      } finally { this.busy = false; }
    }
    tick() {
      if (!this.running) return;
      // устаревшие offer'ы (на них не ответили за 45 с)
      this.pend.forEach((p, id) => { if (now() - p.t > 45000) { this.pend.delete(id); try { this.o.dropToken && this.o.dropToken(p.token); } catch (e) { /* ok */ } } });
      this.status();
      if (this.mode !== 'answerer' || (this.ticks = (this.ticks || 0) + 1) % 5 === 0) this.announce(false);
    }
    async onMessage(m, t) {
      if (!this.running || m.info_hash !== this.hash) return;
      const pid = typeof m.peer_id === 'string' ? m.peer_id : '';
      if (pid.length !== 20 || pid === this.peerId) return;
      if (m.offer && typeof m.offer_id === 'string' && m.offer_id.length <= 64) {
        const o = m.offer;
        if (this.mode === 'offerer' || !o || o.type !== 'offer' || typeof o.sdp !== 'string' || o.sdp.length > 24000) return;
        const dup = this.seen.get(m.offer_id);
        if (dup) {                                  // гость повторяет offer, пока не получил ответ: ответ мог потеряться (эфемерные события не хранятся) — шлём его снова, с паузой и не более 6 раз
          if (dup.ans && dup.n < 6 && now() - dup.at > 1500 && this.tr) { dup.n += 1; dup.at = now(); this.tr.answer(dup.ans, m.offer_id); }
          return;
        }
        if (this.mode === 'both' && this.o.beacon && o.sdp.indexOf('a=nexa-quick') >= 0) { this.seen.set(m.offer_id, { n: 9 }); try { this.o.onBeacon && this.o.onBeacon(pid); } catch (e) { /* ok */ } return; }
        if (this.o.accept && !this.o.accept(pid)) return;
        if (now() - this.lastAns < 400) return;       // не больше ~2 ответов в секунду (антиспам: чужие offer'ы дорого обрабатывать); не «просмотрен» — гость повторит
        this.lastAns = now();
        const ent = { ans: null, n: 0, at: now() };
        this.seen.set(m.offer_id, ent); if (this.seen.size > 400) { this.seen.clear(); this.seen.set(m.offer_id, ent); }
        this.stat.offers += 1; if (!this.stat.firstOffer) this.stat.firstOffer = { host: lbl(t.url), ms: now() - this.roundAt };
        let r = null;
        try { r = await this.o.onOffer(o.sdp, pid, m); } catch (e) { r = null; }
        if (!r || !this.running) { if (r && this.o.dropToken) this.o.dropToken(r.token); return; }
        ent.ans = { action: 'announce', info_hash: this.hash, peer_id: this.peerId, to_peer_id: pid, offer_id: m.offer_id, answer: { type: 'answer', sdp: r.sdp } }; ent.at = now();
        this.tr.answer(ent.ans, m.offer_id);
      } else if (m.answer && typeof m.offer_id === 'string') {
        const p = this.pend.get(m.offer_id), a = m.answer;
        if (!p || !a || a.type !== 'answer' || typeof a.sdp !== 'string' || a.sdp.length > 24000) return;
        this.pend.delete(m.offer_id);
        if (!this.stat.firstAns) this.stat.firstAns = { host: lbl(t.url), ms: now() - this.roundAt };
        try { await this.o.onAnswer(p.token, a.sdp, pid); } catch (e) { /* ok */ }
      }
    }
    report() {
      const ad = this.tr ? this.tr.adapters : [];
      return { ms: now() - (this.startedAt || now()), round: now() - (this.roundAt || now()), up: ad.filter((a) => a.state === 'open').length, total: this.entries.length, offers: this.stat.offers, firstOffer: this.stat.firstOffer || null, firstAns: this.stat.firstAns || null,
        servers: ad.map((a) => ({ host: lbl(a.url), type: a.type, core: !!a.core, state: a.state, why: a.why || '', pubs: a.pubs | 0, oks: a.oks | 0, rx: a.rx | 0, eose: !!a.eose })) };
    }
    // новый раунд на том же транспорте: старые offer'ы отменяем, новые (новый ICE) уходят и на уже открытые серверы, и на добавленные; соединения с серверами не рвём
    newRound(entries, liveMax) {
      this.pend.forEach((p) => { try { this.o.dropToken && this.o.dropToken(p.token); } catch (e) { /* ok */ } }); this.pend.clear();
      this.roundAt = now(); this.stat = { offers: 0 };
      this.entries = entries; if (this.tr) this.tr.setEntries(entries, liveMax);
      this.announce(true);
    }
    setEntries(entries, liveMax) { this.entries = entries; if (this.tr) this.tr.setEntries(entries, liveMax); }
    stop() {
      this.running = false; clearInterval(this.timer); this.timer = 0;
      this.pend.forEach((p) => { try { this.o.dropToken && this.o.dropToken(p.token); } catch (e) { /* ok */ } }); this.pend.clear();
      if (this.tr) { this.tr.close(); this.tr = null; }
    }
  }

  // ------------------------------------------------------------------ комнаты
  const E = {};                                   // события NexaRoom
  const on = (t, f) => { (E[t] || (E[t] = [])).push(f); return () => { E[t] = (E[t] || []).filter((x) => x !== f); }; };
  const emit = (t, a) => { (E[t] || []).slice().forEach((f) => { try { f(a); } catch (e) { console.warn('[room]', t, e); } }); };
  const ROOM_RE = /^[a-z0-9][a-z0-9_-]{2,23}$/;
  const newRoomId = () => { const al = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; try { const a = new Uint8Array(10); crypto.getRandomValues(a); a.forEach((b) => { s += al[b % al.length]; }); } catch (e) { for (let i = 0; i < 10; i += 1) s += al[Math.floor(Math.random() * al.length)]; } return s; };
  const roomName = (s) => { const t = String(s || '').trim().toLowerCase().replace(/\s+/g, '-'); return ROOM_RE.test(t) ? t : ''; };

  let hostR = null, joinR = null, quickR = null;   // активные рои
  const H = { id: '', pub: false, title: '', mode: 'sandbox', mission: 1, startedAt: 0 };
  const J = { id: '', t0: 0, stage: '', timer: 0, attempt: 0, of: 3, roundMs: 9000, got: false, tier: 0, pid: '' };

  function roomLink(id) {
    let base = '';
    try { base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : String(location.href).split(/[?#]/)[0]; } catch (e) { base = ''; }
    return (base || '') + '?room=' + id;
  }
  function pendingRoom() {
    try {
      const m = /[?&#]room=([A-Za-z0-9_-]{3,24})(?![A-Za-z0-9_-])/.exec(String(location.search || '') + '&' + String(location.hash || '').replace(/^#/, '#'));
      return m ? roomName(m[1]) : '';
    } catch (e) { return ''; }
  }
  function clearRoomFromUrl() {
    try { const u = new URL(location.href); u.searchParams.delete('room'); u.hash = u.hash.replace(/^#/, '').split('&').filter((x) => x.indexOf('room=') !== 0).join('&'); history.replaceState(null, '', u.pathname + u.search + (u.hash && u.hash !== '#' ? u.hash : '')); } catch (e) { /* адресная строка недоступна */ }
  }

  // «Ядро» комнаты: из стабильного списка (проверенные; если их мало — весь список) по хешу кода комнаты (rendezvous-hash) выбираются одни и те же серверы у обоих игроков:
  // ядро (ближайшие по хешу релеи и трекеры) -> ядро2 (следующие) -> остальные. Порядок не зависит от локальных «мёртвых» и пингов — иначе окна у хоста и гостя разъедутся.
  // Хост слушает все три уровня, гость начинает с ядра и расширяется (ядро не бросает), плюс по два лучших по пингу, если они есть.
  const fnv = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return h >>> 0; };
  const winSize = () => Math.max(1, Math.min(12, NN.config.win | 0 || 6));
  function roomTiers(id) {
    const W = winSize(), all = serverEntries().filter((e) => !e.low);
    const stable = all.filter((e) => e.verified), pool = stable.length >= W ? stable : all;
    const by = (type) => pool.filter((e) => e.type === type).map((e) => ({ e, k: fnv(id + '|' + e.url) })).sort((a, b) => a.k - b.k).map((x) => x.e);
    const ns = by('nostr'), ts = by('tracker'), kn = Math.max(1, W - 1), kt = Math.max(1, Math.round(W / 3));
    const t0 = ns.slice(0, kn).concat(ts.slice(0, kt)), t1 = ns.slice(kn, 2 * kn).concat(ts.slice(kt, kt + Math.max(1, kt - 1)));
    const used = new Set(t0.concat(t1).map((e) => e.url));
    const t2 = all.filter((e) => !used.has(e.url)).map((e) => ({ e, k: (e.verified ? 0 : e.type === 'tracker' ? 1 : 2) * 4294967296 + fnv(id + '|' + e.url) })).sort((a, b) => a.k - b.k).map((x) => x.e).slice(0, Math.max(0, W * 3 - t0.length - t1.length));
    return [t0, t1, t2];
  }
  function bestLive(skip, n) {
    return serverEntries().filter((e) => !e.low && !skip.has(e.url) && !isDead(e.url) && fresh(store[e.url]) && store[e.url].ok && store[e.url].ms).sort((a, b) => store[a.url].ms - store[b.url].ms).slice(0, n);
  }
  function roomEntries(id, round, host) {
    const T = roomTiers(id), upto = host ? 2 : Math.max(0, Math.min(2, round | 0));
    const out = []; T.slice(0, upto + 1).forEach((t, i) => t.forEach((e) => out.push(i === 0 ? Object.assign({}, e, { core: true }) : e)));
    const have = new Set(out.map((e) => e.url));
    bestLive(have, 2).forEach((e) => out.push(e));
    return out;
  }

  // ---- Хост: комната (ссылка / по имени / публичная). Хост — только отвечает на offer'ы гостей.
  async function hostRoom(opts) {
    opts = opts || {};
    { const bg = NN.banGate(); if (bg) return bg; }
    stopHost();
    const id = opts.id ? roomName(opts.id) : newRoomId();
    if (!id) return { ok: false, err: 'ROOM_NAME_BAD' };
    if (!serversOn()) return { ok: false, err: 'SERVERS_OFF' };
    if (typeof RTCPeerConnection !== 'function') return { ok: false, err: 'UNSUPPORTED' };
    NN.begin('host'); NN.setMax(opts.max || NN.MAX_PLAYERS); monitor.start(true);
    Object.assign(H, { id, pub: !!opts.pub, title: String(opts.title || '').slice(0, 24), mode: opts.mode === 'mission' ? 'mission' : opts.mode === 'br' ? 'br' : 'sandbox', mission: Math.max(1, Math.min(48, opts.mission | 0 || 1)) });
    H.startedAt = now();
    const byPid = new Map();
    const r = hostR = new Rendezvous('room/' + id, {
      mode: 'answerer', entries: roomEntries(id, 0, true), liveMax: winSize() * 3 + 2,
      onStatus: (s) => emit('status', Object.assign({ kind: 'host' }, s)),
      accept: () => NN.rtc.free() > 0 && pendingLinks() < 3 && !NN.config.testNoAccept,
      onOffer: async (sdp, pid) => {
        const prev = byPid.get(pid); if (prev && !prev.opened) { NN.rtc.drop(prev); byPid.delete(pid); }      // тот же гость начал новый раунд: его прошлая неудавшаяся попытка не занимает место
        if (NN.rtc.free() <= 0) return null;
        const a = await NN.rtc.newAnswer('host', sdp);
        if (!a) return null;
        if (!NN.rtc.attach(a.link)) { NN.rtc.drop(a.link); return null; }
        byPid.set(pid, a.link); if (byPid.size > 40) byPid.delete(byPid.keys().next().value);
        NN.rtc.connecting(a.link);
        emit('incoming', {});
        return { sdp: a.sdp, token: a.link };
      },
      dropToken: () => { /* ответившие соединения живут своим таймером (net.js) */ }
    });
    await r.start();
    if (H.pub) Gossip.advertise(adOf());
    emit('host', { id, pub: H.pub });
    return { ok: true, id, link: roomLink(id) };
  }
  const pendingLinks = () => NN.pendingLinks || 0;
  // нет ни одного живого сервера и взять запасной неоткуда (или слишком долго ничего не открылось)
  const noServers = (s) => s.up === 0 && ((s.connecting === 0 && s.reserve === 0 && s.ms > 2500) || s.ms > 12000);
  function stopHost() { if (hostR) { hostR.stop(); hostR = null; } Gossip.advertise(null); H.id = ''; H.pub = false; }
  function adOf() {
    const me = NN.localInfo();
    const max = NN.config.maxPlayers;
    return { rid: H.id, title: H.title || me.name, host: me.name, lv: me.level, col: me.color, mode: H.mode, mission: H.mission, n: Math.min(max, NN.count || 1), max };
  }

  // ---- Гость: подключение к комнате по ссылке/имени/публичной. Гость предлагает offer'ы; хост отвечает.
  // Один транспорт на все раунды: серверы ядра остаются подключёнными, раунд = новые offer'ы (новый ICE) + расширение набора серверов (ядро -> ядро2 -> все).
  const JOIN_TRIES = 3;
  const LAST = { role: '', id: '', ok: null, rounds: 0, ms: 0, via: '', up: 0, total: 0, why: '', log: [] };
  async function joinRoom(id, opts) {
    opts = opts || {};
    { const bg = NN.banGate(); if (bg) { emit('join', { stage: 'error', err: 'BANNED' }); return bg; } }
    stopJoin();
    id = roomName(id);
    if (!id) { emit('join', { stage: 'error', err: 'ROOM_BAD' }); return { ok: false, err: 'ROOM_BAD' }; }
    if (!serversOn()) { emit('join', { stage: 'error', err: 'SERVERS_OFF' }); return { ok: false, err: 'SERVERS_OFF' }; }
    if (typeof RTCPeerConnection !== 'function') { emit('join', { stage: 'error', err: 'UNSUPPORTED' }); return { ok: false, err: 'UNSUPPORTED' }; }
    NN.begin('guest'); monitor.start(true);
    Object.assign(J, { id, t0: now(), stage: 'searching', got: false, attempt: 1, tier: 0, pid: randBin(20), of: opts.tries || JOIN_TRIES, roundMs: opts.roundMs || (opts.timeoutMs ? Math.floor(opts.timeoutMs / (opts.tries || JOIN_TRIES)) : (NN.config.roundMs || 9000)) });
    Object.assign(LAST, { role: 'guest', id, ok: null, rounds: 1, ms: 0, via: '', up: 0, total: 0, why: '', log: [] });
    await joinRound();
    return { ok: true, id };
  }
  const fire = (stage, extra) => { J.stage = stage; emit('join', Object.assign({ stage, id: J.id, ms: now() - J.t0, up: joinR && joinR.up, attempt: J.attempt, of: J.of }, extra || {})); };
  const joinLiveMax = (n) => Math.min(winSize() * 3 + 2, Math.max(winSize(), n + 2));
  function roundLine(r, why) {
    const rp = r.report(), bad = rp.servers.filter((x) => x.state === 'failed').map((x) => x.host + '(' + (x.why || '?') + ')').join(' ');
    const line = 'round ' + J.attempt + '/' + J.of + ' tier ' + J.tier + ' ' + why + ': up ' + rp.up + '/' + rp.servers.length + ', core ' + (r.tr ? r.tr.status().coreUp + '/' + r.tr.status().core : '-') + ', published ' + rp.servers.reduce((a, x) => a + x.pubs, 0) + ' acked ' + rp.servers.reduce((a, x) => a + x.oks, 0) +
      ', answer ' + (rp.firstAns ? 'from ' + rp.firstAns.host + ' after ' + rp.firstAns.ms + ' ms' : 'none') + (bad ? ', failed: ' + bad : '') + ' | ' + rp.servers.filter((x) => x.state === 'open').map((x) => x.host + ' pub' + x.pubs + '/ok' + x.oks + '/rx' + x.rx + (x.eose || x.type === 'tracker' ? '' : '/noEOSE')).join(' ');
    rdv(line); LAST.log.push(line); if (LAST.log.length > 6) LAST.log.shift();
    return rp;
  }
  async function joinRound() {
    const id = J.id, ents = roomEntries(id, J.tier, false), lm = joinLiveMax(ents.length);
    if (joinR) { joinR.newRound(ents, lm); armRound(joinR); fire('searching'); return; }
    const r = joinR = new Rendezvous('room/' + id, {
      mode: 'offerer', entries: ents, liveMax: lm, peerId: J.pid,
      onStatus: (s) => {
        emit('status', Object.assign({ kind: 'join' }, s));
        if (joinR !== r || J.stage !== 'searching') return;
        if (noServers(s)) { nextAttempt('unavailable'); return; }
        if (s.coreUp < 3 && s.ms > 2500 + J.tier * 3000 && J.tier < 2 && now() - (r.roundAt || 0) > 2500) { J.tier += 1; r.setEntries(roomEntries(id, J.tier, false), joinLiveMax(99)); rdv('core weak (' + s.coreUp + '/' + s.core + ' up), widening to tier ' + J.tier); }     // ядро не достучалось — расширяем набор, не дожидаясь конца раунда
      },
      offerCount: () => (J.got ? 0 : 2),
      makeOffer: async () => { const o = await NN.rtc.newOffer('guest', J.attempt); return o ? { sdp: o.sdp, token: o.link } : null; },
      dropToken: (link) => { if (link && !link.attached) NN.rtc.drop(link); },
      onAnswer: async (link, sdp) => {
        if (J.got || !link || joinR !== r) { NN.rtc.drop(link); return; }
        if (!NN.rtc.attach(link)) { NN.rtc.drop(link); return; }
        J.got = true;
        r.pend.forEach((p) => { if (p.token !== link) { try { NN.rtc.drop(p.token); } catch (e) { /* ok */ } } }); r.pend.clear();     // ранний выход: остальные offer'ы отменяем
        fire('connecting');
        const rp = roundLine(r, 'answered'); LAST.via = rp.firstAns ? rp.firstAns.host : '';
        const ok = await NN.rtc.applyAnswer(link, sdp);
        if (!ok) { J.got = false; NN.rtc.drop(link); NN.begin('guest'); fire('searching'); return; }
        NN.rtc.connecting(link, J.attempt < J.of ? 12000 : 25000);       // ICE обычно занимает секунды: не ждём 25 с, а пробуем новый раунд; в последнем раунде даём больше времени
      }
    });
    await r.start();
    armRound(r);
    fire('searching');
  }
  function armRound(r) {
    clearTimeout(J.timer);
    J.timer = setTimeout(() => { if (joinR === r && NN.state !== 'open' && !J.got && J.stage !== 'unavailable') nextAttempt('timeout'); }, J.roundMs);
  }
  // повтор: те же серверы ядра, плюс следующий уровень (ядро2, затем все), новые offer'ы и ICE; число попыток ограничено
  function nextAttempt(why) {
    clearTimeout(J.timer);
    const r = joinR; if (r) { const rp = roundLine(r, why); LAST.up = rp.up; LAST.total = rp.total; }
    if (J.attempt >= J.of) {
      Object.assign(LAST, { ok: false, rounds: J.attempt, ms: now() - J.t0, why: why === 'unavailable' ? 'servers' : why === 'connect' ? 'ice' : 'nohost' });
      fire(why === 'unavailable' ? 'unavailable' : 'timeout', { err: why === 'unavailable' ? 'NO_TRACKER' : 'TRACKER_TIMEOUT' }); return;
    }
    J.attempt += 1; J.got = false; J.tier = Math.max(J.tier, Math.min(2, J.attempt - 1)); LAST.rounds = J.attempt;
    NN.begin('guest');
    fire('retry', { why });
    joinRound();
  }
  function stopJoin() { clearTimeout(J.timer); if (joinR) { joinR.stop(); joinR = null; } J.stage = ''; J.attempt = 0; }
  // peer-relay: уже подключённый гость тоже отвечает на offer'ы этой комнаты (после паузы, чтобы Хост успел первым) и пересылает трафик тем, кто не достучался до Хоста напрямую
  let relayR = null;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function relayStart(id) {
    stopRelay();
    if (!id || !serversOn() || typeof RTCPeerConnection !== 'function') return;
    const r = relayR = new Rendezvous('room/' + id, {
      mode: 'answerer', entries: roomEntries(id, 1, false), liveMax: winSize() * 2 + 2,
      accept: () => NN.rtc.childFree() > 0,
      onOffer: async (sdp) => {
        await wait(NN.config.relayDelay === undefined ? 8000 : NN.config.relayDelay);
        if (relayR !== r || !NN.connected || NN.isHost || NN.rtc.childFree() <= 0) return null;
        const a = await NN.rtc.newAnswer('child', sdp);
        if (!a) return null;
        if (!NN.rtc.attachChild(a.link)) { NN.rtc.drop(a.link); return null; }
        return { sdp: a.sdp, token: a.link };
      },
      dropToken: () => { /* ребёнок живёт своим таймером */ }
    });
    r.start();
  }
  function stopRelay() { if (relayR) { relayR.stop(); relayR = null; } }
  NN.on('net:open', () => {
    const live = []; transports.forEach((t) => t.adapters.forEach((a) => { if (a.state === 'open' && live.indexOf(a.url) < 0) live.push(a.url); }));
    if (live.length) { lastGood = live.slice(0, 12); lsSet('nexaLastGood', JSON.stringify(lastGood)); lsSet('nexaLastGoodT', String(Date.now())); }       // кэш рабочих серверов для быстрого старта
  });
  NN.on('net:open', () => { if (joinR) { const id = J.id; if (J.t0) { const rp = joinR.report(); Object.assign(LAST, { ok: true, rounds: J.attempt, ms: now() - J.t0, up: rp.up, total: rp.total, why: '' }); rdv('connected in ' + (LAST.ms / 1000).toFixed(1) + ' s, round ' + J.attempt + ', via ' + (LAST.via || '?') + ', servers up ' + rp.up + '/' + rp.total); } stopJoin(); emit('join', { stage: 'open', id: J.id }); relayStart(id); } });
  NN.on('net:error', (e) => {
    if (!joinR || !e || !e.code) return;
    if (J.attempt < J.of && (e.code === 'CONNECT_TIMEOUT' || e.code === 'ICE_FAILED')) { nextAttempt('connect'); return; }      // соединение не состоялось — другая попытка через другие серверы
    Object.assign(LAST, { ok: false, rounds: J.attempt, ms: now() - J.t0, why: 'ice' }); rdv('failed: ' + e.code + ' after ' + J.attempt + ' rounds');
    stopJoin(); emit('join', { stage: 'error', err: e.code });
  });
  NN.on('net:close', () => { stopRelay(); if (joinR) { stopJoin(); } });

  // ---- Быстрая игра: очередь 'quick/<режим>' (маяки), меньший peer_id — хост; дальше — обычная комната по общему id
  async function quickPlay(mode, opts) {
    opts = opts || {};
    { const bg = NN.banGate(); if (bg) return bg; }
    stopQuick();
    if (typeof RTCPeerConnection !== 'function') return { ok: false, err: 'UNSUPPORTED' };
    if (!serversOn()) return { ok: false, err: 'SERVERS_OFF' };
    mode = mode === 'mission' ? 'mission' + Math.max(1, Math.min(48, opts.mission | 0 || 1)) : 'sandbox';
    const beacon = 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=nexa-quick\r\n';
    let paired = false;
    const q = quickR = new Rendezvous('quick/' + mode, {
      mode: 'both', beacon: true, entries: roomEntries('quick/' + mode, 1, false), liveMax: winSize() * 2 + 2,
      onStatus: (s) => { emit('status', Object.assign({ kind: 'quick' }, s)); if (noServers(s) && !paired) { stopQuick(); emit('quick', { stage: 'unavailable', err: 'NO_TRACKER' }); } },
      offerCount: () => 3,                       // несколько маяков: трекер рассылает каждый offer своему случайному пиру, так шансов попасть к настоящему игроку (а не к «призраку» в рое) больше
      makeOffer: async () => ({ sdp: beacon, token: null }),
      onBeacon: (pid) => {
        if (paired || !quickR) return;
        paired = true;
        const mine = q.peerId, host = mine < pid, a = host ? mine : pid, b = host ? pid : mine;
        const id = 'q' + toHex(a).slice(0, 8) + toHex(b).slice(0, 8);
        clearTimeout(q.qt); quickR = null; setTimeout(() => q.stop(), 9000);       // маяк ещё девять секунд: второй игрок мог не успеть нас увидеть
        emit('quick', { stage: 'paired', host, id });
        if (host) hostRoom({ id, pub: false, mode: opts.mission ? 'mission' : 'sandbox', mission: opts.mission || 1 }).then(() => emit('quick', { stage: 'hosting', id }));
        else joinRoom(id, { timeoutMs: 20000 });
      }
    });
    await q.start();
    q.qt = setTimeout(() => { if (quickR === q && !paired) { stopQuick(); emit('quick', { stage: 'timeout', err: 'QUICK_TIMEOUT' }); } }, 20000);
    emit('quick', { stage: 'searching' });
    return { ok: true };
  }
  function stopQuick() { if (quickR) { clearTimeout(quickR.qt); quickR.stop(); quickR = null; } }

  // ------------------------------------------------------------------ gossip-рой публичных комнат ('lobby')
  // Пиры (до 6) соединены по DataChannel и обмениваются списком открытых публичных комнат. Всё входящее валидируется; комнаты живут TTL 90 с.
  const G = { rz: null, peers: [], ads: new Map(), mine: null, myId: '', timer: 0, on: false, listeners: 0, spam: 0, reqSeen: new Set(), profiles: new Map(), lastPub: 0 };
  const TTL = 90000, MAX_PEERS = 6, MAX_ADS = 40;
  const cleanText = (s, n) => Array.from(String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿<>]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, n).join('');
  function cleanAd(a) {
    if (!a || typeof a !== 'object') return null;
    const rid = roomName(a.rid); if (!rid) return null;
    const mode = a.mode === 'mission' ? 'mission' : a.mode === 'br' ? 'br' : 'sandbox';
    const mission = mode === 'mission' ? (a.mission | 0) : 0;
    if (mode === 'mission' && (mission < 1 || mission > 48)) return null;
    const max = Math.max(2, Math.min(10, a.max | 0 || MAXP)), n = Math.max(1, Math.min(max, a.n | 0 || 1));
    let age = Number(a.age); if (!isFinite(age)) age = 0; age = Math.max(0, Math.min(120, age));
    const title = cleanText(a.title, 24) || 'ROOM';
    const host = NN.util.cleanName(a.host, 'PLAYER');
    return { rid, title, host, lv: Math.max(1, Math.min(999, a.lv | 0 || 1)), col: NN.util.cleanColor(a.col), mode, mission, n, max, age };
  }
  function adsOut(limit) {
    const t = now(), out = [];
    if (G.mine) out.push(Object.assign({}, G.mine, { age: 0 }));
    G.ads.forEach((a) => { const age = (t - a.seen) / 1000; if (age < TTL / 1000 - 2 && out.length < limit) out.push({ rid: a.rid, title: a.title, host: a.host, lv: a.lv, col: a.col, mode: a.mode, mission: a.mission, n: a.n, max: a.max, age: Math.round(age + 1) }); });
    return out.slice(0, limit);
  }
  function gcAds() { const t = now(); G.ads.forEach((a, k) => { if (t - a.seen > TTL) G.ads.delete(k); }); }
  function listRooms() {
    gcAds();
    const t = now(), out = [];
    G.ads.forEach((a) => { if (!NN.isBlockedName(a.host) && !(G.mine && G.mine.rid === a.rid)) out.push(Object.assign({}, a, { age: Math.round((t - a.seen) / 1000) })); });
    return out.sort((x, y) => x.age - y.age).slice(0, 30);
  }
  function peerSend(p, o) { if (p.ch && p.ch.readyState === 'open') { try { const s = JSON.stringify(o); if (s.length < 6000) p.ch.send(s); } catch (e) { /* ok */ } } }
  function broadcast(o, except) { G.peers.forEach((p) => { if (p !== except && p.open) peerSend(p, o); }); }
  function onGossip(p, raw) {
    if (typeof raw !== 'string' || raw.length > 6000) { p.bad += 1; return; }
    const t = now();
    if (t - p.rt > 1000) { p.rt = t; p.rn = 0; }
    if (++p.rn > 6) { p.bad += 1; if (p.bad > 20) closePeer(p); return; }           // антиспам: не больше 6 сообщений в секунду
    let m; try { m = JSON.parse(raw); } catch (e) { p.bad += 1; return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'rooms' && Array.isArray(m.rooms)) {
      let added = 0;
      m.rooms.slice(0, 20).forEach((raw0) => {
        const a = cleanAd(raw0); if (!a || a.age >= TTL / 1000) return;
        if (G.mine && G.mine.rid === a.rid) return;
        const cur = G.ads.get(a.rid), seen = t - a.age * 1000;
        if (cur && cur.seen >= seen) return;
        if (!cur && G.ads.size >= MAX_ADS) return;
        a.seen = seen; G.ads.set(a.rid, a); added += 1;
      });
      if (added) emit('rooms', listRooms());
    } else if (m.t === 'rooms?') {
      peerSend(p, { t: 'rooms', rooms: adsOut(20) });
    } else if (m.t === 'hi') {
      p.pid = typeof m.pid === 'string' && m.pid.length === 20 ? m.pid : '';
      dedupePeers(p);
      if (Array.isArray(m.rooms)) onGossip(p, JSON.stringify({ t: 'rooms', rooms: m.rooms }));
    } else if (m.t === 'pf?') {                                                    // запрос полного профиля хозяина комнаты (с ограниченной пересылкой)
      const rid = roomName(m.rid), q = String(m.q || '').slice(0, 24);
      if (!rid || !q || G.reqSeen.has(q)) return;
      G.reqSeen.add(q); if (G.reqSeen.size > 100) G.reqSeen.clear();
      if (G.mine && G.mine.rid === rid && window.NexaProfile && NexaProfile.shareable) broadcastTo(p, { t: 'pf', q, rid, pf: NexaProfile.shareable(), ttl: 3 });
      else if ((m.ttl | 0) > 0) broadcast({ t: 'pf?', rid, q, ttl: (m.ttl | 0) - 1 }, p);
    } else if (m.t === 'pf') {
      const q = String(m.q || '').slice(0, 24), rid = roomName(m.rid), key = 'a' + q;
      if (!q || !rid) return;
      if (G.waits && G.waits[q]) { const pr = window.NexaProfile && NexaProfile.cleanShared ? NexaProfile.cleanShared(m.pf) : null; if (pr) { G.profiles.set(rid, pr); G.waits[q](pr); delete G.waits[q]; } }
      else if ((m.ttl | 0) > 0 && !G.reqSeen.has(key)) { G.reqSeen.add(key); broadcast({ t: 'pf', q, rid, pf: m.pf, ttl: (m.ttl | 0) - 1 }, p); }
    }
  }
  const broadcastTo = (p, o) => peerSend(p, o);
  function requestProfile(rid) {
    return new Promise((resolve) => {
      rid = roomName(rid); if (!rid) { resolve(null); return; }
      const q = NN.util.rndHex(6); G.waits = G.waits || {};
      G.waits[q] = resolve;
      G.reqSeen.add(q);
      broadcast({ t: 'pf?', rid, q, ttl: 3 });
      setTimeout(() => { if (G.waits[q]) { delete G.waits[q]; resolve(G.profiles.get(rid) || null); } }, 4000);
    });
  }
  function dedupePeers(p) {
    if (!p.pid) return;
    const dup = G.peers.find((x) => x !== p && x.pid === p.pid && x.open);
    if (!dup) return;
    const myId = G.rz ? G.rz.peerId : '';
    const keep = (x) => { const off = x.offerer === 'me' ? myId : x.pid; return off; };
    closePeer(keep(p) <= keep(dup) ? dup : p);         // оставляем соединение, где предлагающий — с меньшим peer_id (одинаково у обеих сторон)
  }
  function closePeer(p) {
    const i = G.peers.indexOf(p); if (i >= 0) G.peers.splice(i, 1);
    try { p.pc && p.pc.close(); } catch (e) { /* ok */ }
    p.open = false;
    emit('swarm', { peers: G.peers.filter((x) => x.open).length });
  }
  // создание gossip-соединения (WebRTC с одним DataChannel; не игровое)
  function mkPeer(offerer) {
    const pc = new RTCPeerConnection({ iceServers: NN.config.iceServers, iceCandidatePoolSize: 0 });
    const p = { pc, ch: null, open: false, pid: '', bad: 0, rt: 0, rn: 0, offerer, born: now() };
    p.ch = pc.createDataChannel('g', { negotiated: true, id: 5, ordered: true });
    p.ch.addEventListener('open', () => { p.open = true; peerSend(p, { t: 'hi', pid: G.rz ? G.rz.peerId : '', rooms: adsOut(10) }); emit('swarm', { peers: G.peers.filter((x) => x.open).length }); });
    p.ch.addEventListener('message', (e) => onGossip(p, e.data));
    p.ch.addEventListener('close', () => closePeer(p));
    pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') closePeer(p); });
    return p;
  }
  function gatherPc(pc) {
    return new Promise((res) => {
      let done = false; const t0 = now();
      const fin = () => { if (done) return; done = true; res(pc.localDescription ? pc.localDescription.sdp : ''); };
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') fin(); });
      setTimeout(fin, Math.max(0, NN.config.forceMs - (now() - t0)));
      if (pc.iceGatheringState === 'complete') fin();
    });
  }
  async function gossipStart() {
    if (!serversOn()) return;
    monitor.start();
    if (G.on) { G.listeners += 1; return; }
    G.on = true; G.listeners = 1;
    const rz = G.rz = new Rendezvous('lobby', {
      mode: 'both',
      onStatus: (s) => emit('status', Object.assign({ kind: 'lobby' }, s)),
      offerCount: () => (G.peers.length + G.pending() < 4 ? 2 : 0),
      accept: () => G.peers.length < MAX_PEERS,
      makeOffer: async () => {
        if (G.peers.length >= MAX_PEERS) return null;
        const p = mkPeer('me');
        try { await p.pc.setLocalDescription(await p.pc.createOffer()); const sdp = await gatherPc(p.pc); G.peers.push(p); return { sdp, token: p }; } catch (e) { closePeer(p); return null; }
      },
      dropToken: (p) => { if (p && !p.open) closePeer(p); },
      onAnswer: async (p, sdp) => { try { await p.pc.setRemoteDescription({ type: 'answer', sdp }); } catch (e) { closePeer(p); } },
      onOffer: async (sdp, pid) => {
        if (G.peers.length >= MAX_PEERS || G.peers.some((x) => x.pid === pid)) return null;
        const p = mkPeer('them'); p.pid = pid;
        try { await p.pc.setRemoteDescription({ type: 'offer', sdp }); await p.pc.setLocalDescription(await p.pc.createAnswer()); const a = await gatherPc(p.pc); G.peers.push(p); return { sdp: a, token: p }; } catch (e) { closePeer(p); return null; }
      }
    });
    G.pending = () => G.peers.filter((x) => !x.open && now() - x.born < 40000).length;
    await rz.start();
    G.timer = setInterval(() => {
      gcAds();
      G.peers.slice().forEach((p) => { if (!p.open && now() - p.born > 40000) closePeer(p); });
      if (G.mine) { G.mine.n = Math.min(NN.config.maxPlayers, NN.count || 1); G.mine.max = NN.config.maxPlayers; }
      broadcast({ t: 'rooms', rooms: adsOut(20) });
      emit('rooms', listRooms());
    }, 15000);
  }
  function gossipStop(force) {
    if (!G.on) return;
    G.listeners = Math.max(0, G.listeners - 1);
    if (G.listeners > 0 && !force) return;
    if (G.mine && !force) return;                 // пока хостим публичную комнату — рой нужен для объявления
    G.on = false; G.listeners = 0; clearInterval(G.timer);
    G.peers.slice().forEach(closePeer);
    if (G.rz) { G.rz.stop(); G.rz = null; }
    G.ads.clear();
  }
  const Gossip = {
    advertise(ad) {
      if (!ad) { const had = !!G.mine; G.mine = null; if (had && G.listeners === 0) gossipStop(true); return; }
      G.mine = ad;
      if (!G.on) { gossipStart().then(() => { G.listeners = Math.max(0, G.listeners - 1); }); G.listeners += 1; }
      broadcast({ t: 'rooms', rooms: adsOut(20) });
    }
  };

  // ------------------------------------------------------------------ согласие на публичный режим
  const CONSENT_KEY = 'nexaPublicOk';
  const consented = () => lsGet(CONSENT_KEY) === '1';
  const consent = (v) => { lsSet(CONSENT_KEY, v ? '1' : '0'); };

  if (window.NexaSingle) window.NexaSingle.on('change', () => { if (!window.NexaSingle.owner()) { stopHost(); stopJoin(); stopQuick(); if (NN.connected) NN.close(); } });
  window.NexaRoom = {
    DEFAULT_TRACKERS: SV.TRACKERS, trackers: trackerList, validTracker, Rendezvous, MultiTransport, infoHash, sha1js,
    servers: {
      list: serverList, summary, probe, monitor, discover, discovered: () => discUrls().length, entries: serverEntries, health: HEALTH, get on() { return serversOn(); },
      setOn(v) { lsSet('nexaServersOn', v ? '1' : '0'); if (!v) { stopHost(); stopJoin(); stopQuick(); gossipStop(true); } emitServers(); },
      get live() { return summary().online; }
    },
    roomEntries, hostRoom, joinRoom, stopHost, stopJoin, quickPlay, stopQuick, roomLink, pendingRoom, clearRoomFromUrl, roomName, newRoomId,
    gossip: {
      start: gossipStart, stop: gossipStop, rooms: listRooms, refresh() { broadcast({ t: 'rooms?' }); emit('rooms', listRooms()); }, requestProfile,
      get peers() { return G.peers.filter((p) => p.open).length; }, get on() { return G.on; }, _G: G
    },
    lastAttempt: () => Object.assign({}, LAST, { log: LAST.log.slice() }),
    diag: () => ({ last: LAST, join: joinR ? joinR.report() : null, host: hostR ? hostR.report() : null, quick: quickR ? quickR.report() : null, tier: J.tier }),
    adOf, setMeta(o) { Object.assign(H, o || {}); if (G.mine) { Object.assign(G.mine, { mode: H.mode, mission: H.mission }); } },
    get hosting() { return H.id ? { id: H.id, pub: H.pub, mode: H.mode, mission: H.mission } : null; },
    get joining() { return joinR ? { id: J.id, stage: J.stage } : null; },
    consented, consent, on, text: (c) => NN.text(c), cleanAd, scrub
  };
}());
