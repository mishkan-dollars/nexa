// NEXA/OS: сетевое ядро онлайн-режима — чистый P2P (WebRTC), без игрового сервера. Комната на несколько игроков: топология «звезда» — Хост (игрок 1, авторитет)
// принимает до MAX_PLAYERS-1 гостей, каждый гость соединён только с Хостом; Хост ретранслирует позиции, выстрелы, эмоции и чат остальным.
//   • Рукопожатие вручную (запасной режим, работает всегда и без трекеров): Хост создаёт ПРИГЛАШЕНИЕ (Offer) -> ссылка ?join=<код>, друг присылает ОТВЕТ (Answer).
//     Код — компактный Base64url «NX1O.<данные>» / «NX1A.<данные>» ([флаги][JSON {s, d}][CRC16], deflate-raw, если есть CompressionStream; из SDP убраны лишние
//     строки и адреса). На каждого гостя — своя пара кодов; Хост может приглашать следующих, не отключая уже подключённых.
//   • Автоматическое рукопожатие через публичные трекеры WebTorrent — js/rendezvous.js; он использует низкоуровневый NexaNet.rtc (newOffer/newAnswer/attach).
//   • Публичные STUN Google; страховка setTimeout 2.5 с: если сбор ICE затянулся, SDP выдаётся из того, что уже собрано.
//   • Каналы на каждое соединение: 'act' (быстрые состояния, unordered, maxRetransmits 0: позиции) и 'rel' (надёжный: выстрелы, эмоции, чат, лобби, профиль, SDP).
//   • sendAction(data[, {to, fast}]) — единая точка отправки JSON-пакета {type, n, ts, ...}; приём — NexaNet.on(type, fn); у принятого пакета p.from = слот отправителя
//     (Хост = 1, гости 2..N). Гость -> Хост -> остальные: типы RELAY (pos, shot, cev, boom, aim) и адресные DIRECT (profile?, profile с полем to).
//   • Голос: микрофон -> addTrack (согласование по каналу 'rel'). Гость слышит только Хоста, но Хост сводит голоса «микс минус сам» (WebAudio) и отправляет каждому
//     гостю смесь остальных; одновременно говорят до MAX_VOICE микрофонов (остальные — только текст).
// ПРИВАТНОСТЬ: IP-адреса нигде не показываются и не пишутся в журнал (scrub); в код приглашения попадают только srflx/relay-кандидаты (host/mDNS — только в
// режиме LAN). Но при прямом P2P браузер собеседника технически видит ваш сетевой адрес — это свойство WebRTC; скрыть его без TURN-сервера нельзя.
(function () {
  'use strict';

  const VERSION = 1;
  const TELEGRAM = 'https://t.me/nexaindustries';
  // только общедоступные STUN без аккаунтов и платы; TURN нет. Основной набор — раунд 1, расширенный — со 2-го раунда (Chrome замедляется при большом числе серверов, поэтому ≤8)
  const STUN_BASE = ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478', 'stun:stun.nextcloud.com:443', 'stun:stun.sipnet.ru:3478'];
  const STUN_EXT = STUN_BASE.concat(['stun:stun1.l.google.com:19302', 'stun:stun.stunprotocol.org:3478', 'stun:stun.freeswitch.org:3478']);
  const ICE_SERVERS = STUN_BASE.map((u) => ({ urls: u })), ICE_SERVERS_EXT = STUN_EXT.map((u) => ({ urls: u }));
  const MAX_PLAYERS = 6, MAX_BR = 10, MAX_VOICE = 4;                                   // см. ONLINE.md: 6 проверено по расчёту трафика Хоста; константу можно поднять до 8 на свой риск
  const FAST = { pos: 1, ping: 1, pong: 1, snap: 1, aim: 1, shot: 1, hit: 1 };
  const DUPE = { shot: 1, hit: 1 };
  let dupFlag = false;            // типы пакетов по ненадёжному каналу 'act' (остальные — по 'rel')
  const RELAY = { pos: 1, shot: 1, cev: 1, boom: 1, aim: 1, bl: 1, gr: 1, av: 1 };            // гость -> Хост -> все остальные
  const DIRECT = { 'profile?': 1, profile: 1, 'av?': 1, avd: 1 };                          // адресные (поле to = слот получателя)
  const POS_MIN = 21;
  function encPos(p, from) {
    const w = typeof p.w === 'string' ? p.w.slice(0, 12) : '', b = new ArrayBuffer(POS_MIN + w.length), v = new DataView(b);
    let a = +p.a || 0; a -= Math.round(a / 6.283185307) * 6.283185307;
    v.setUint8(0, 1); v.setUint8(1, from & 255); v.setUint16(2, Math.round(performance.now()) & 65535, true);
    v.setInt32(4, Math.round((+p.x || 0) * 50), true); v.setInt32(8, Math.round((+p.z || 0) * 50), true); v.setInt16(12, Math.round(a * 5000), true);
    v.setUint8(14, (p.c ? 1 : 0) | (p.d ? 2 : 0) | (p.r ? 4 : 0)); v.setUint8(15, Math.max(0, Math.min(100, Math.round(+p.h))) || 0); v.setUint8(16, Math.round(Math.max(0, Math.min(1, +p.q || 0)) * 255)); v.setUint8(17, p.it & 255); v.setUint8(18, p.ia & 255); v.setUint8(19, p.ip & 255); v.setUint8(20, w.length);
    for (let i = 0; i < w.length; i += 1) v.setUint8(POS_MIN + i, w.charCodeAt(i) & 127);
    return b;
  }
  function decPos(b) {
    if (!(b instanceof ArrayBuffer) || b.byteLength < POS_MIN || b.byteLength > 40) return null;
    const v = new DataView(b); if (v.getUint8(0) !== 1) return null;
    const n = v.getUint8(20); if (b.byteLength < POS_MIN + n || n > 12) return null;
    let w = ''; for (let i = 0; i < n; i += 1) w += String.fromCharCode(v.getUint8(POS_MIN + i));
    const f = v.getUint8(14);
    return { type: 'pos', fb: v.getUint8(1), t16: v.getUint16(2, true), x: v.getInt32(4, true) / 50, z: v.getInt32(8, true) / 50, a: v.getInt16(12, true) / 5000, c: f & 1, d: (f >> 1) & 1, r: (f >> 2) & 1, h: v.getUint8(15), q: v.getUint8(16) / 255, it: v.getUint8(17), ia: v.getUint8(18), ip: v.getUint8(19), w };
  }
  const MAX_ACT = 8 * 1024, MAX_REL = 96 * 1024, CHAT_MAX = 200;
  const cfg = { forceMs: 2500, connectMs: 20000, guestWaitMs: 180000, silentMs: 7000, pingMs: 250, restartOnRtt: false, iceServers: ICE_SERVERS, iceServersExt: ICE_SERVERS_EXT, maxPlayers: MAX_PLAYERS };
  try { if (localStorage.getItem('nexaIce') === 'none') cfg.iceServers = cfg.iceServersExt = []; } catch (e) { /* без хранилища */ }   // тесты/сети без STUN: только локальные кандидаты

  // ------------------------------------------------------------------ сообщения (английские исходники; переводы — js/i18n-net.js)
  const MSG = {
    UNSUPPORTED: 'This browser has no WebRTC. Use a current Chrome, Edge, Firefox or Safari.',
    EMPTY: 'Paste the link or the code first.',
    NO_CODE: 'No invitation code found in the text. Paste the whole link or the code that starts with NX1.',
    BAD_VERSION: 'This code is from another game version. Both players need the same version.',
    BAD_CRC: 'The code is damaged or cut off. Copy it again completely.',
    BAD_DATA: 'The code cannot be read. Copy it again completely.',
    NO_INFLATE: 'This browser cannot read compressed codes. Update the browser.',
    WRONG_KIND_O: 'This is a friend\'s answer code. Paste the host\'s invitation here instead.',
    WRONG_KIND_A: 'This is the host\'s invitation. Paste your friend\'s answer code here.',
    WRONG_SESSION: 'This answer belongs to another invitation. Ask the friend to use your latest link.',
    NOT_WAITING: 'Create an invitation first.',
    GATHER_FORCED: 'ICE gathering took too long — code issued with what was found.',
    NO_PUBLIC: 'No public address found (STUN blocked?). The code will only work inside one network.',
    NAT_SYM: 'Your network uses a strict (symmetric) NAT, so direct connections may fail. Ask a friend with an open network to host, or try another network or a mobile hotspot.',
    NAT_BLOCKED: 'UDP looks blocked on this network, so direct connections are unlikely. Try another network or a mobile hotspot.',
    CONNECT_TIMEOUT: 'Could not connect. A strict NAT or firewall may block direct connections (no relay server). Try another network, a VPN or a mobile hotspot.',
    ICE_FAILED: 'Connection failed. A strict NAT or firewall may block direct connections (no relay server). Try another network or a mobile hotspot.',
    PEER_LEFT: 'The other player left.',
    PEER_SILENT: 'No signal from the other player — connection unstable.',
    CLOSED: 'Connection closed.',
    NOT_CONNECTED: 'Not connected to a friend yet.',
    MIC_UNSUPPORTED: 'This browser cannot use a microphone here (needs HTTPS).',
    MIC_DENIED: 'Microphone access denied. Allow it in the browser address bar. On itch.io the game frame needs allow="microphone".',
    MIC_NONE: 'No microphone found.',
    MIC_FAIL: 'The microphone could not be started.',
    VOICE_BLOCKED: 'Click anywhere to let the browser play the friend\'s voice.',
    VOICE_FULL: 'Voice is full (4 microphones at once). You can still use the text chat.',
    CHAT_FLOOD: 'Slow down — too many messages.',
    CHAT_EMPTY: 'Type a message first.',
    CHAT_OFFLINE: 'Connect to a friend to chat.',
    ROOM_FULL: 'The room is full.',
    VOICE_LOCAL: 'Voice does not work in "this computer" mode (no network link). Use a normal connection for voice.',
    LOCAL_NO: 'This browser cannot link tabs (no BroadcastChannel).',
    LOCAL_NONE: 'No room found in the other tabs. Open a room in one tab first (both tabs must be in the same, non-private browser window set).',
    DIAG_MDNS: 'Both browsers hide local addresses (mDNS) and no public address was found — two windows on one PC often cannot reach each other this way. Use "THIS COMPUTER" mode, another network or a mobile hotspot.',
    DIAG_NO_STUN: 'STUN does not respond — no public address was found, so the browsers cannot find a path. Try another network or a VPN.',
    DIAG_ONE_SIDE: 'Only one side found a public address — the other network may block the STUN server or strictly filter UDP. Try another network or a mobile hotspot.',
    DIAG_NAT: 'Public addresses were found but the link still failed — strict NAT or carrier-grade NAT (CGNAT). Share internet from a phone or try another provider.'
  };

  // ------------------------------------------------------------------ утилиты
  const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g, COLONS = /[0-9a-f:.]{3,60}(?:%\w+)?/gi, MDNS = /[0-9a-f-]{8,}\.local\b/gi;
  // IPv6 ищем как «цепочку hex и двоеточий минимум с двумя двоеточиями» — так не остаются обрывки адреса; время вида 12:30 не задевается
  const scrub = (s) => String(s == null ? '' : s).replace(MDNS, '•••').replace(COLONS, (m) => ((m.match(/:/g) || []).length >= 2 ? '•••' : m)).replace(IPV4, '•••');
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* без хранилища */ } };
  const logBuf = [];
  function log(m) { logBuf.push({ t: Date.now(), m: scrub(m) }); if (logBuf.length > 80) logBuf.shift(); }

  // имя игрока из сети: те же правила, что в профиле (2–16 символов, буквы/цифры/_/-/пробел)
  function cleanName(s, fb) {
    let n = String(s == null ? '' : s).normalize ? String(s == null ? '' : s).normalize('NFC') : String(s);
    try { n = n.replace(/[^\p{L}\p{N}_ -]/gu, ''); } catch (e) { n = n.replace(/[^A-Za-z0-9_ -]/g, ''); }
    n = n.replace(/\s+/g, ' ').trim().slice(0, 16);
    return n.length >= 2 ? n : (fb || 'PLAYER');
  }
  // текст чата: без управляющих и невидимых символов, схлопнутые пробелы, не длиннее 200
  function cleanChat(s) {
    let t = String(s == null ? '' : s);
    t = t.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g, ' ').replace(/\s+/g, ' ').trim();
    return Array.from(t).slice(0, CHAT_MAX).join('');
  }
  const cleanColor = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#ff3b30');
  const cleanPid = (s) => (typeof s === 'string' && /^[0-9a-f]{6,16}$/.test(s) ? s : '');
  const rndHex = (n) => { try { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, (b) => (b + 256).toString(16).slice(1)).join(''); } catch (e) { let s = ''; for (let i = 0; i < n * 2; i += 1) s += Math.floor(Math.random() * 16).toString(16); return s; } };
  const MYPID = rndHex(6);                                               // случайный идентификатор этой вкладки (для заглушения/жалоб в сессии)

  // ------------------------------------------------------------------ Base64url + CRC16 + deflate
  const b64e = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const b64d = (s) => {
    const t = s.replace(/-/g, '+').replace(/_/g, '/'), p = t + '==='.slice((t.length + 3) % 4);
    const b = atob(p), u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i += 1) u[i] = b.charCodeAt(i);
    return u;
  };
  function crc16(u8, n) {
    let c = 0xffff;
    for (let i = 0; i < n; i += 1) { c ^= u8[i] << 8; for (let k = 0; k < 8; k += 1) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; }
    return c;
  }
  async function pipe(u8, Stream, fmt) {
    const st = new Stream(fmt), w = st.writable.getWriter();
    w.write(u8); w.close();
    return new Uint8Array(await new Response(st.readable).arrayBuffer());
  }
  const canDeflate = () => typeof CompressionStream === 'function';
  const canInflate = () => typeof DecompressionStream === 'function';

  // упаковка: [флаги][тело][CRC16 big-endian]
  async function packCode(kind, obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    let body = raw, flag = 0;
    if (canDeflate()) {
      try { const z = await pipe(raw, CompressionStream, 'deflate-raw'); if (z.length < raw.length) { body = z; flag = 1; } } catch (e) { /* без сжатия */ }
    }
    const out = new Uint8Array(body.length + 3);
    out[0] = flag; out.set(body, 1);
    const c = crc16(out, body.length + 1);
    out[body.length + 1] = c >> 8; out[body.length + 2] = c & 255;
    return 'NX' + VERSION + kind + '.' + b64e(out);
  }
  // разбор: принимает ссылку целиком, фрагмент со ссылкой или чистый код (с пробелами/переносами)
  async function parseInput(text) {
    let t = String(text == null ? '' : text).trim();
    if (!t) return { ok: false, err: 'EMPTY' };
    try { t = decodeURIComponent(t); } catch (e) { /* уже не закодировано */ }
    // сначала ищем код как отдельное «слово» среди текста (ссылка в предложении), затем — склеив переносы строк (код, разбитый на строки)
    const RE = /NX(\d+)([OA])\.([A-Za-z0-9_-]{8,})/;
    let res = null;
    for (const cand of [t, t.replace(/\s+/g, '')]) {
      const m = RE.exec(cand);
      if (!m) continue;
      res = await parseToken(m);
      if (res.ok || res.err === 'BAD_VERSION') return res;
    }
    return res || { ok: false, err: 'NO_CODE' };
  }
  async function parseToken(m) {
    if (Number(m[1]) !== VERSION) return { ok: false, err: 'BAD_VERSION' };
    let u8;
    try { u8 = b64d(m[3]); } catch (e) { return { ok: false, err: 'BAD_DATA' }; }
    if (u8.length < 4) return { ok: false, err: 'BAD_DATA' };
    const n = u8.length - 2;
    if (crc16(u8, n) !== ((u8[n] << 8) | u8[n + 1])) return { ok: false, err: 'BAD_CRC' };
    let body = u8.subarray(1, n);
    try {
      if (u8[0] & 1) { if (!canInflate()) return { ok: false, err: 'NO_INFLATE' }; body = await pipe(body, DecompressionStream, 'deflate-raw'); }
      const obj = JSON.parse(new TextDecoder().decode(body));
      if (!obj || typeof obj.s !== 'string' || typeof obj.d !== 'string' || obj.d.length < 50 || obj.d.indexOf('v=0') < 0) return { ok: false, err: 'BAD_DATA' };
      return { ok: true, kind: m[2], sid: obj.s, sdp: obj.d.replace(/\r?\n/g, '\r\n').replace(/(\r\n)?$/, '\r\n'), code: 'NX' + m[1] + m[2] + '.' + m[3] };
    } catch (e) { return { ok: false, err: 'BAD_DATA' }; }
  }

  // ------------------------------------------------------------------ SDP: убрать лишнее и адреса
  // Оставляем кандидаты srflx/relay (UDP). host и mDNS — только если нет ничего другого или включён режим LAN. TCP-кандидаты не нужны.
  function candParts(line) {
    const m = /^a=candidate:\S+ \d+ (\S+) \d+ (\S+) \d+ typ (\w+)/i.exec(line);
    return m ? { proto: m[1].toLowerCase(), addr: m[2], typ: m[3].toLowerCase() } : null;
  }
  // публичный (глобальный) IPv6 host-кандидат не фильтруем: он работает без NAT; link-local fe80 и ULA fc/fd — не публичные
  const globalV6 = (c) => c.typ === 'host' && c.addr.indexOf(':') > 0 && !/^(fe[89ab]|f[cd])/i.test(c.addr) && !/\.local$/i.test(c.addr);
  function shrinkSdp(sdp, keepLocal) {
    const lines = sdp.split(/\r?\n/).filter(Boolean);
    const wantLocal = keepLocal || localMode();
    const pub = lines.filter((l) => { const c = candParts(l); return c && c.proto === 'udp' && (c.typ === 'srflx' || c.typ === 'relay' || globalV6(c)); }).length;
    const useLocal = wantLocal || pub === 0;
    let kept = 0;
    const out = [];
    lines.forEach((l) => {
      if (/^a=(extmap-allow-mixed|msid-semantic)/.test(l)) return;
      if (l.indexOf('a=candidate:') === 0) {
        const c = candParts(l);
        if (!c || c.proto !== 'udp') return;
        if (c.typ === 'srflx' || c.typ === 'relay' || globalV6(c) || (useLocal && c.typ === 'host')) { kept += 1; out.push(l); }
        return;
      }
      if (/^c=IN IP[46] /.test(l)) { out.push('c=IN IP4 0.0.0.0'); return; }
      if (/^a=rtcp:\d+ IN IP[46] /.test(l)) { out.push('a=rtcp:9 IN IP4 0.0.0.0'); return; }
      if (/^o=/.test(l)) { out.push(l.replace(/ IN IP[46] \S+$/, ' IN IP4 127.0.0.1')); return; }
      out.push(l);
    });
    return { sdp: out.join('\r\n') + '\r\n', cands: kept, onlyLocal: pub === 0 && !wantLocal, pub };
  }
  const localMode = () => lsGet('nexaNetLan') === '1';

  // ------------------------------------------------------------------ события
  const subs = {};
  function on(type, fn) { (subs[type] || (subs[type] = [])).push(fn); return () => off(type, fn); }
  function off(type, fn) { const a = subs[type]; if (!a) return; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  function emit(type, a, b) {
    const arr = subs[type]; if (!arr) return;
    arr.slice().forEach((f) => { try { f(a, b); } catch (e) { console.warn('[net]', type, e); } });
  }

  // ------------------------------------------------------------------ состояние сессии
  // R.role: 'host' | 'guest' | null. R.links — подключённые (attached) соединения: у Хоста по одному на гостя, у гостя одно (к Хосту).
  // Состояние сессии вычисляется из соединений: idle -> creating -> waiting-answer | answering -> connecting -> open <-> lost -> closed | failed
  const R = { role: null, links: [], mySlot: 0, sticky: 'idle', stickyCode: null, players: [], rate: { t: 0, n: 0 }, hosting: false, speak: {}, children: [] };
  let state = 'idle';
  const isOpen = () => state === 'open' || state === 'lost';
  function computeState() {
    const ls = R.links;
    if (!R.role || !ls.length) return R.sticky;
    if (R.role === 'guest') return ls[0].state;
    if (ls.some((l) => l.state === 'open')) return 'open';
    if (ls.some((l) => l.state === 'lost')) return 'lost';
    for (const s of ['connecting', 'answering', 'waiting-answer', 'creating']) if (ls.some((l) => l.state === s)) return s;
    return R.sticky;
  }
  function refreshState(code) {
    const st = computeState();
    if (st === state && !code) return;
    const prev = state;
    state = st;
    log('state ' + prev + ' -> ' + st + (code ? ' (' + code + ')' : ''));
    emit('net:state', { state: st, prev, code: code || null, text: code ? MSG[code] || '' : '' });
  }
  const openLinks = () => R.links.filter((l) => l.ready && l.state !== 'closed');
  const slot = () => (R.role === 'host' ? 1 : R.role === 'guest' ? R.mySlot : 0);
  const findSlot = (s) => R.links.find((l) => l.slot === s && l.ready) || null;
  const hostLink = () => (R.role === 'guest' ? R.links[0] || null : null);

  // ------------------------------------------------------------------ соединение (Link)
  let linkSeq = 0;
  function fakeChan(label) {
    const ls = { open: [], close: [], message: [] };
    const c = { label, readyState: 'connecting', bufferedAmount: 0, out: () => {},
      addEventListener(t, fn) { (ls[t] || (ls[t] = [])).push(fn); },
      dispatch(t, ev) { (ls[t] || []).slice().forEach((fn) => { try { fn(ev || {}); } catch (e) { /* ok */ } }); },
      send(x) { if (c.readyState !== 'open') throw new Error('closed'); c.out(x); },
      open() { if (c.readyState === 'connecting') { c.readyState = 'open'; c.dispatch('open'); } },
      close() { if (c.readyState === 'closed') return; c.readyState = 'closed'; c.dispatch('close'); } };
    return c;
  }
  function newLink(gameRole, local, pool, round) {
    const L = { id: ++linkSeq, gr: gameRole, slot: gameRole === 'guest' ? 1 : 0, state: 'creating', pc: null, act: null, rel: null, sid: '', polite: gameRole === 'guest', making: false,
      ready: false, attached: false, lastN: {}, lastRx: 0, openAt: 0, rtt: 0, rttMin: 0, pingT: 0, watchT: 0, connT: 0, restartT: 0, intentional: false, peerBye: false,
      rate: { t: 0, n: 0 }, peer: null, info: null, offerCode: '', answerCode: '', tx: 0, rx: 0, txB: 0, rxB: 0, chatGot: [], sender: null, remote: null, el: null, dest: null, rsrc: null,
      mixIn: null, speaking: false, mutedRemote: true, blocked: false, capped: false, pid: '' };
    let act, rel;
    if (local) { L.local = true; act = fakeChan('act'); rel = fakeChan('rel'); }
    else {
      const srv = round >= 2 && cfg.iceServers.length ? cfg.iceServersExt : cfg.iceServers;
      const pc = L.pc = new RTCPeerConnection({ iceServers: srv, bundlePolicy: 'max-bundle', iceCandidatePoolSize: (pool == null ? 2 : pool) | 0 });      // pool > 0: кандидаты собираются заранее (быстрее offer/answer)
      pc.addEventListener('connectionstatechange', () => onPcState(L));
      pc.addEventListener('iceconnectionstatechange', () => onPcState(L));
      pc.addEventListener('negotiationneeded', () => negotiate(L));
      dgTrack(L, pc, srv, round);
      pc.addEventListener('track', (e) => onTrack(L, e));
      act = pc.createDataChannel('act', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
      act.binaryType = 'arraybuffer';
      rel = pc.createDataChannel('rel', { negotiated: true, id: 2, ordered: true });
    }
    [act, rel].forEach((ch) => {
      ch.addEventListener('open', () => checkOpen(L));
      ch.addEventListener('close', () => onChannelClose(L));
      ch.addEventListener('message', (e) => (L.gr === 'child' ? childUp(L, e.data, ch === act) : onMessage(L, e.data, ch === act)));
    });
    L.act = act; L.rel = rel;
    return L;
  }
  // ---- peer-relay: если у игрока нет прямой связи с Хостом, но есть с другим гостем (носителем), тот пересылает его трафик по уже открытым каналам.
  // Носитель держит «детей» (gr 'child', реальное WebRTC-соединение с отрезанным игроком) и заворачивает их пакеты в {type:'rl', c, d}; Хост разворачивает пакеты в виртуальное соединение
  // с обычным слотом. Для остальных игроков и для самого игрока это обычный гость (голос через ретранслятор не передаётся).
  const MAX_KIDS = 2;
  function tunnel(carrier, cid, fast) { return (x) => { sendLink(carrier, { type: 'rl', c: cid, d: x, f: fast ? 1 : 0 }, fast); }; }
  function virtualLink(carrier, cid) {
    const V = newLink('host', true); V.local = false; V.virtual = true; V.carrier = carrier; V.cid = cid;
    V.act.out = tunnel(carrier, cid, true); V.rel.out = tunnel(carrier, cid, false);
    if (!attach(V)) return null;
    carrier.kids = carrier.kids || {}; carrier.kids[cid] = V;
    V.state = 'connecting'; V.act.open(); V.rel.open();
    return V;
  }
  function childUp(L, raw, fast) {
    const c = R.links[0];
    if (raw instanceof ArrayBuffer) { const q = decPos(raw); if (!q) return; q.n = ++seq; q.ts = Date.now(); delete q.fb; delete q.t16; raw = JSON.stringify(q); }
    if (typeof raw !== 'string' || raw.length > (fast ? MAX_ACT : MAX_REL) || !c || !c.opened) return;
    sendLink(c, { type: 'rl', c: L.id, d: raw, f: fast ? 1 : 0 }, fast);
  }
  function childGone(L) {
    const i = R.children.indexOf(L); if (i >= 0) R.children.splice(i, 1);
    const c = R.links[0]; if (L.opened && c && c.opened) sendLink(c, { type: 'rl', c: L.id, k: 'bye' });
    destroyLink(L);
  }
  function attachChild(L) {
    const c = R.links[0];
    if (!L || R.role !== 'guest' || !c || !c.opened || R.children.length >= MAX_KIDS) return false;
    L.child = true; R.children.push(L); L.state = 'connecting'; armConnectTimer(L, cfg.connectMs);
    return true;
  }
  function onTunnel(L, p) {
    if (L.gr === 'host') {                                          // Хост (или носитель-промежуточный) получил пакет от «ребёнка» через носителя L
      const cid = p.c | 0; if (cid < 1) return;
      let V = L.kids && L.kids[cid];
      if (p.k === 'bye') { if (V) linkGone(V, 'PEER_LEFT'); return; }
      if (typeof p.d !== 'string') return;
      if (!V) { if (R.role !== 'host' || Object.keys(L.kids || {}).length >= MAX_KIDS || R.links.length >= cfg.maxPlayers - 1) return; V = virtualLink(L, cid); if (!V) return; }
      onMessage(V, p.d, !!p.f);
    } else if (L.gr === 'guest') {                                  // ответ Хоста для нашего «ребёнка»
      const ch = R.children.find((x) => x.id === (p.c | 0)); if (!ch || !ch.opened || typeof p.d !== 'string') return;
      const chn = p.f ? ch.act : ch.rel;
      if (chn && chn.readyState === 'open' && !(p.f && chn.bufferedAmount > 64 * 1024)) { try { chn.send(p.d); } catch (e) { /* ok */ } }
    }
  }
  function checkOpen(L) {
    if (!L.act || !L.rel || L.act.readyState !== 'open' || L.rel.readyState !== 'open' || L.ready || L.state === 'closed') return;
    L.ready = true; L.openAt = Date.now(); L.lastRx = now();
    clearTimeout(L.connT);
    if (L.gr === 'child') { L.opened = true; L.state = 'open'; return; }
    if (L.attached) linkOpened(L);
  }
  function linkOpened(L) {
    if (L.opened) return;
    L.opened = true;
    L.state = 'open';
    if (L.dg) { L.dg.ok = true; L.dg.okAt = Date.now() - L.dg.t0; LA = L.dg; }
    if (R.role === 'host') { L.peerAt = Date.now(); }
    L.pingT = setInterval(() => pingTick(L), cfg.pingMs);
    L.statT = setInterval(() => { if (!document.hidden) pathTick(L); }, 20000);
    setTimeout(() => pathTick(L), 3000);
    L.watchT = setInterval(() => watchTick(L), 1000);
    sendLink(L, { type: 'hello', info: localInfo() });
    if (R.role === 'host') sendLink(L, { type: 'welcome', slot: L.slot, max: cfg.maxPlayers });
    pingTick(L);
    refreshState();
    emit('net:open', { role: R.role, slot: slot(), link: L.slot });
    if (R.role === 'host') hostSync();
    if (R.role === 'host' && V.actx) hostMixSync();
  }
  function onPcState(L) {
    if (L.state === 'closed') return;
    if (L.gr === 'child') { const pc0 = L.pc; if (pc0 && (pc0.connectionState === 'failed' || pc0.connectionState === 'closed' || pc0.iceConnectionState === 'failed')) childGone(L); return; }
    const pc = L.pc; if (!pc) return;
    const cs = pc.connectionState || '', ic = pc.iceConnectionState || '';
    if (cs === 'failed' || ic === 'failed') {
      if (L.ready) { if (L.gr === 'guest' ? false : !L.restartT) tryRestart(L); else if (!L.restartT) markLost(L); }
      else if (L.state === 'connecting' || (L.answerAt && Date.now() - L.answerAt > 15000)) fail(L, 'ICE_FAILED');   // быстрый отказ с диагностикой, не ждём таймер
      // до открытия каналов у гостя 'failed' раньше ответа Хоста не окончателен: решает таймер соединения
    } else if (cs === 'disconnected' || ic === 'disconnected') {
      if (L.ready) { markLost(L); if (L.gr === 'host' && !L.restartT) L.restartT = setTimeout(() => tryRestart(L), 3500); }
    } else if ((cs === 'connected' || ic === 'connected' || ic === 'completed') && L.ready && L.state === 'lost') {
      clearTimeout(L.restartT); L.restartT = 0; L.lastRx = now(); L.state = 'open'; refreshState();
    } else if (cs === 'closed' && !L.intentional && L.state !== 'closed') {
      linkGone(L, 'CLOSED');
    }
  }
  function markLost(L) { if (L.state === 'open') { L.state = 'lost'; refreshState('PEER_SILENT'); } }
  function tryRestart(L) {
    L.restartT = 0;
    const pc = L.pc; if (!pc || !L.ready || L.state === 'closed') return;
    if (pc.connectionState === 'connected' && L.state === 'open') return;
    try { pc.restartIce(); log('ice restart'); } catch (e) { /* старый браузер */ }
    setTimeout(() => { if (L.pc === pc && L.state === 'lost' && (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed')) linkGone(L, 'ICE_FAILED'); }, 12000);
  }
  function onChannelClose(L) {
    if (L.gr === 'child') { if (L.state !== 'closed') setTimeout(() => { if (L.state !== 'closed' && L.rel && L.rel.readyState !== 'open') childGone(L); }, 800); return; }
    if (!L.ready || L.intentional || L.state === 'closed') return;
    setTimeout(() => { if (L.ready && L.rel && L.rel.readyState !== 'open' && L.state !== 'closed' && !L.intentional) linkGone(L, L.peerBye ? 'PEER_LEFT' : 'CLOSED'); }, 1500);
  }
  // уничтожить соединение (ресурсы), без событий
  function destroyLink(L) {
    L.intentional = true;
    clearInterval(L.statT); clearInterval(L.pingT); clearInterval(L.watchT); clearTimeout(L.connT); clearTimeout(L.restartT);
    L.pingT = L.watchT = L.connT = L.restartT = 0;
    voiceLinkStop(L);
    if (L.bc) { try { L.bc.postMessage({ k: 'bye' }); L.bc.close(); } catch (e) { /* ok */ } L.bc = null; clearInterval(L.hiT); }
    const pc = L.pc; L.pc = null;
    if (pc) { try { pc.close(); } catch (e) { /* уже закрыто */ } }
    [L.act, L.rel].forEach((ch) => { try { ch && ch.close(); } catch (e) { /* уже закрыто */ } });
    L.act = L.rel = null; L.ready = false; L.making = false; L.lastN = {}; L.state = 'closed';
  }
  // соединение пропало (штатно или нет)
  function linkGone(L, code) {
    if (L.state === 'closed' && !L.attached) return;
    if (L.kids) Object.keys(L.kids).forEach((k) => { const v = L.kids[k]; delete L.kids[k]; linkGone(v, 'PEER_LEFT'); });
    if (L.virtual && L.carrier && L.carrier.kids) delete L.carrier.kids[L.cid];
    if (R.role === 'guest' && R.links[0] === L) { R.children.slice().forEach((ch) => childGone(ch)); }
    const was = L.attached, wasOpen = L.opened;
    destroyLink(L);
    if (!was) return;
    const i = R.links.indexOf(L); if (i >= 0) R.links.splice(i, 1);
    L.attached = false;
    if (R.role === 'guest') {
      R.sticky = 'closed'; R.players = []; R.mySlot = 0;
      voiceStop();
      refreshState(code);
      emit('net:close', { code, text: MSG[code] || '' });
    } else {
      if (wasOpen) { emit('net:left', { slot: L.slot, name: L.peer ? L.peer.name : 'PLAYER', pid: L.pid, code }); hostSync(); if (V.actx) hostMixSync(); }
      if (!R.links.length) { R.sticky = wasOpen ? 'closed' : 'failed'; refreshState(wasOpen ? code : code); if (wasOpen) emit('net:close', { code, text: MSG[code] || '' }); else emit('net:error', { code, text: MSG[code] || '' }); voiceStop(); }
      else refreshState();
    }
  }
  function fail(L, code) {
    if (L.dg && !L.dg.fail && !L.dg.ok) L.dg.fail = code;
    const was = L.attached;
    destroyLink(L);
    const i = R.links.indexOf(L); if (i >= 0) R.links.splice(i, 1);
    L.attached = false;
    if (!was) return;
    if (!R.links.length || R.role === 'guest') { voiceStop(); R.sticky = 'failed'; R.stickyCode = code; refreshState(code); emit('net:error', { code, text: MSG[code] || '', diag: DG }); }
    else { refreshState(); emit('net:linkfail', { code }); }
  }

  // ------------------------------------------------------------------ комната: роли, слоты, список игроков
  function allocSlot() {
    for (let s = 2; s <= cfg.maxPlayers; s += 1) if (!R.links.some((l) => l.slot === s)) return s;
    return 0;
  }
  // присоединить соединение к сессии (Хост: выдать слот; гость: единственное соединение с Хостом)
  function attach(L) {
    if (!L || L.attached) return !!L;
    if (L.gr === 'host') {
      if (R.role !== 'host') { closeAll(true); R.role = 'host'; R.mySlot = 1; }
      const s = allocSlot(); if (!s) return false;
      L.slot = s;
    } else {
      if (R.role === 'guest' && R.links.length) return false;
      if (R.role !== 'guest') { closeAll(true); R.role = 'guest'; }
      L.slot = 1; R.mySlot = 0;
    }
    L.attached = true; R.links.push(L); R.sticky = 'idle';
    if (L.ready) linkOpened(L);
    return true;
  }
  let natType = 'unknown', natAt = 0;
  function probeNat() {
    if (natAt && Date.now() - natAt < 300000 || typeof RTCPeerConnection !== 'function') return Promise.resolve(natType);
    natAt = Date.now();
    return new Promise((res) => {
      let pc; const pub = new Set(); let loc = 0, fin = false;
      const done = () => { if (fin) return; fin = true; try { pc.close(); } catch (e) { /* ok */ } natType = !loc ? 'blocked' : pub.size > 1 ? 'symmetric' : 'cone'; log('nat ' + natType + ' (' + pub.size + ' mappings)'); emit('net:nat', natType); res(natType); };
      try {
        pc = new RTCPeerConnection({ iceServers: ICE_SERVERS.slice(0, 3) }); pc.createDataChannel('n');
        pc.onicecandidate = (e) => { if (!e.candidate) { done(); return; } const m = / (\d+) typ srflx .*rport (\d+)/.exec(e.candidate.candidate); if (m) { loc = 1; pub.add(m[1] + '>' + m[2]); } };
        pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(done);
        setTimeout(done, 4000);
      } catch (e) { done(); }
    });
  }
  function begin(role) {
    probeNat();
    if (role === 'host') { if (R.role !== 'host') { closeAll(true); R.role = 'host'; R.mySlot = 1; R.sticky = 'idle'; } }
    else { closeAll(true); R.role = 'guest'; R.mySlot = 0; R.sticky = 'idle'; }
  }
  const infoOf = (L) => (L && L.peer ? { slot: L.slot, name: L.peer.name, color: L.peer.color, level: L.peer.level, v: L.peer.v, lang: L.peer.lang, pid: L.pid } : null);
  function others() {
    if (R.role === 'host') return R.links.filter((l) => l.opened && l.peer).sort((a, b) => a.slot - b.slot).map(infoOf);
    if (R.role === 'guest') return R.players.filter((p) => p.slot !== R.mySlot).map((p) => Object.assign({}, p));
    return [];
  }
  // Хост: пересобрать список игроков и разослать всем гостям
  function hostSync() {
    if (R.role !== 'host') return;
    const me = localInfo(), list = [{ s: 1, name: me.name, color: me.color, level: me.level, pid: MYPID, lang: me.lang, v: VERSION }];
    R.links.filter((l) => l.opened && l.peer).sort((a, b) => a.slot - b.slot).forEach((l) => list.push({ s: l.slot, name: l.peer.name, color: l.peer.color, level: l.peer.level, pid: l.pid, lang: l.peer.lang, v: l.peer.v }));
    R.players = list.map((p) => ({ slot: p.s, name: p.name, color: p.color, level: p.level, pid: p.pid, lang: p.lang, v: p.v }));
    sendAction({ type: 'roster', players: list });
    emit('net:roster', others());
  }
  function onRoster(p) {
    if (!Array.isArray(p.players)) return;
    const out = [];
    p.players.slice(0, cfg.maxPlayers + 1).forEach((q) => {
      if (!q || typeof q !== 'object') return;
      const s = q.s | 0; if (s < 1 || s > cfg.maxPlayers || out.some((o) => o.slot === s)) return;
      out.push({ slot: s, name: cleanName(q.name, 'PLAYER ' + s), color: cleanColor(q.color), level: Math.max(1, Math.min(999, q.level | 0 || 1)), pid: cleanPid(q.pid), lang: String(q.lang || '').slice(0, 2), v: q.v | 0 });
    });
    const before = R.players.map((q) => q.slot).join();
    R.players = out;
    const hl = R.links[0]; if (hl) { const h = out.find((q) => q.slot === 1); if (h) hl.peer = { name: h.name, color: h.color, level: h.level, v: h.v, lang: h.lang }; }
    out.forEach((q) => applyBlock(q));
    emit('net:roster', others());
    if (before !== out.map((q) => q.slot).join()) emit('net:peers', others());
  }

  // ------------------------------------------------------------------ диагностика кандидатов: только счётчики по типам (адреса не читаются и не показываются)
  const zeroC = () => ({ host: 0, mdns: 0, srflx: 0, relay: 0 });
  let DG = null;
  function candStats(sdp) {
    const c = zeroC();
    String(sdp || '').split(/\r?\n/).forEach((l) => {
      const m = /^a=candidate:\S+ \d+ \S+ \d+ (\S+) \d+ typ (\w+)/i.exec(l); if (!m) return;
      const t = m[2].toLowerCase();
      if (t === 'host') { if (/\.local$/i.test(m[1])) c.mdns += 1; else c.host += 1; } else if (t === 'srflx' || t === 'prflx') c.srflx += 1; else if (t === 'relay') c.relay += 1;
    });
    return c;
  }
  function diagSet(side, sdp) { DG = DG || { local: zeroC(), remote: zeroC() }; DG[side] = candStats(sdp); }
  // итог попытки соединения (LA живёт после закрытия связи): счётчики кандидатов по типам, ответы STUN, события ICE с метками времени. Адреса не сохраняются и не показываются
  const zeroT = () => ({ host: 0, mdns: 0, srflx: 0, prflx: 0, relay: 0, v6: 0 });
  const STUNAGG = {};
  let LA = null;
  function candTypes(sdp) {
    const c = zeroT();
    String(sdp || '').split(/\r?\n/).forEach((l) => {
      const m = /^a=candidate:\S+ \d+ \S+ \d+ (\S+) \d+ typ (\w+)/i.exec(l); if (!m) return;
      const t = m[2].toLowerCase();
      if (m[1].indexOf(':') >= 0) c.v6 += 1;
      if (t === 'host') { if (/\.local$/i.test(m[1])) c.mdns += 1; else c.host += 1; } else if (c[t] !== undefined) c[t] += 1;
    });
    return c;
  }
  function dgTrack(L, pc, srv, round) {
    const d = L.dg = { role: L.gr === 'host' ? 'answerer' : 'offerer', round: round | 0, t0: Date.now(), ev: [], loc: zeroT(), rem: null, urls: srv.map((x) => x.urls), noUrl: false, firstPub: -1, fail: '', ok: false, conn: 0, okAt: 0 };
    const ev = (k, v) => { if (d.ev.length < 40) d.ev.push([Date.now() - d.t0, k + ':' + v]); };
    pc.addEventListener('icegatheringstatechange', () => ev('gather', pc.iceGatheringState));
    pc.addEventListener('iceconnectionstatechange', () => ev('ice', pc.iceConnectionState));
    pc.addEventListener('icecandidate', (e) => {
      const c = e.candidate; if (!c) return;
      const str = c.candidate || '', m = /candidate:\S+ \d+ \S+ \d+ (\S+) \d+ typ (\w+)/.exec(str);
      const t = (c.type || (m && m[2]) || '').toLowerCase(), ad = c.address || (m && m[1]) || '';
      if (ad.indexOf(':') >= 0) d.loc.v6 += 1;
      if (t === 'host') { if (/\.local$/i.test(ad)) d.loc.mdns += 1; else d.loc.host += 1; } else if (d.loc[t] !== undefined) d.loc[t] += 1;
      if (t === 'srflx' || t === 'prflx' || t === 'relay') {
        const ms = Date.now() - d.t0; if (d.firstPub < 0) { d.firstPub = ms; ev('first-public', t); }
        const u = e.url || c.url || ''; if (!u) d.noUrl = true;
        else { const a = STUNAGG[u] = STUNAGG[u] || { ok: 0, ms: -1, err: 0, code: 0 }; a.ok += 1; if (a.ms < 0 || ms < a.ms) a.ms = ms; }
      }
    });
    pc.addEventListener('icecandidateerror', (e) => {
      const u = e.url || ''; if (!u || String(u).indexOf('stun') !== 0) return;
      const a = STUNAGG[u] = STUNAGG[u] || { ok: 0, ms: -1, err: 0, code: 0 }; a.err += 1; a.code = e.errorCode | 0;
      ev('stun-error', (e.errorCode | 0));
    });
  }
  function dgGathered(L) { const d = L.dg; if (d && !(LA && LA.conn && !LA.fail && !LA.ok)) LA = d; }
  function dgRemote(L, sdp) { if (L.dg) L.dg.rem = candTypes(sdp); }
  function dgConn(L) { const d = L.dg; if (d) { d.conn = Date.now() - d.t0; LA = d; } }
  function dgWhy(d) {
    if (!d.fail) return '';
    if (d.loc.srflx + d.loc.prflx + d.loc.relay === 0) return 'no-srflx';
    if (d.rem && d.rem.srflx + d.rem.prflx + d.rem.relay === 0) return 'remote-no-srflx';
    const last = d.ev.filter((x) => x[1].indexOf('ice:') === 0).map((x) => x[1].slice(4));
    if (last.indexOf('checking') < 0) return 'no-pairs';
    if (last[last.length - 1] === 'disconnected') return 'disconnected';
    return last.indexOf('failed') >= 0 ? 'checking-failed' : 'timeout';
  }
  function lastAttempt() {
    const d = LA; if (!d) return null;
    const stun = d.urls.map((u) => { const a = STUNAGG[u]; return { u, ok: a ? a.ok : 0, ms: a && a.ms >= 0 ? a.ms : -1, err: a ? a.err : 0, code: a ? a.code : 0 }; });
    return { role: d.role, round: d.round, ok: d.ok, okAt: d.okAt, fail: d.fail, why: dgWhy(d), firstPub: d.firstPub, loc: Object.assign({}, d.loc), rem: d.rem ? Object.assign({}, d.rem) : null, noUrl: d.noUrl, stun, ev: d.ev.map((x) => x.slice()) };
  }
  function diagLast() {
    if (DG) return JSON.parse(JSON.stringify(DG));
    const a = LA; if (!a) return null;
    const f = (t) => { const o = zeroC(); if (t) { o.host = t.host; o.mdns = t.mdns; o.srflx = t.srflx + t.prflx; o.relay = t.relay; } return o; };
    return { local: f(a.loc), remote: f(a.rem) };
  }

  // ------------------------------------------------------------------ рукопожатие: низкоуровневые операции (используют и ручной режим, и js/rendezvous.js)
  function gather(pc, t0) {
    return new Promise((resolve) => {
      let done = false, t = 0;
      const fin = (forced) => {
        if (done) return;
        done = true; clearTimeout(t); clearTimeout(early);
        pc.removeEventListener('icegatheringstatechange', chk); pc.removeEventListener('icecandidate', onc);
        resolve({ sdp: (pc.localDescription && pc.localDescription.sdp) || '', forced });
      };
      const chk = () => { if (pc.iceGatheringState === 'complete') fin(false); };
      let early = 0;
      const onc = (e) => {
        if (!e.candidate) { fin(false); return; }
        if (!early && /typ (srflx|relay)/.test(e.candidate.candidate || '')) early = setTimeout(() => fin(false), 220);     // публичный кандидат есть — ждём не весь сбор, а ещё 0,2 с
      };
      pc.addEventListener('icegatheringstatechange', chk); pc.addEventListener('icecandidate', onc);
      t = setTimeout(() => fin(true), Math.max(0, cfg.forceMs - (Date.now() - t0)));   // страховка 2.5 с (от начала создания): затянувшийся сбор ICE не должен блокировать выдачу
      chk();
    });
  }
  function linkFor(code) {
    let base = '';
    try { base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : String(location.href).split(/[?#]/)[0]; } catch (e) { base = ''; }
    return base ? base + '?join=' + code : code;
  }
  function armConnectTimer(L, ms) {
    clearTimeout(L.connT);
    if (natType === 'symmetric') ms = Math.min(ms, 10000);
    L.connT = setTimeout(() => { if (!L.ready && (L.state === 'answering' || L.state === 'connecting')) { if (L.gr === 'child') childGone(L); else fail(L, 'CONNECT_TIMEOUT'); } }, ms);
  }
  // свободное (не присоединённое) соединение-оферент: SDP с полным набором кандидатов (для трекера). Возвращает {link, sdp, forced}
  async function newOffer(gameRole, round) {
    DG = null;
    const L = newLink(gameRole, false, 2, round), t0 = Date.now();
    try {
      await L.pc.setLocalDescription(await L.pc.createOffer());
      const g = await gather(L.pc, t0);
      dgGathered(L);
      return { link: L, sdp: cfg.shrinkRz === false ? g.sdp : shrinkSdp(g.sdp).sdp, forced: g.forced };
    } catch (e) { destroyLink(L); return null; }
  }
  async function newAnswer(gameRole, offerSdp, round) {
    DG = null;
    const L = newLink(gameRole, false, 2, round), t0 = Date.now();
    try {
      dgRemote(L, offerSdp);
      await L.pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
      await L.pc.setLocalDescription(await L.pc.createAnswer());
      const g = await gather(L.pc, t0);
      dgGathered(L);
      L.state = 'answering';
      return { link: L, sdp: cfg.shrinkRz === false ? g.sdp : shrinkSdp(g.sdp).sdp, forced: g.forced };
    } catch (e) { destroyLink(L); return null; }
  }
  async function applyAnswer(L, sdp) {
    try { dgRemote(L, sdp); await L.pc.setRemoteDescription({ type: 'answer', sdp }); return true; } catch (e) { return false; }
  }
  function startConnecting(L, ms) { dgConn(L); if (L.state !== 'closed') { L.state = 'connecting'; refreshState(); armConnectTimer(L, ms || cfg.connectMs); } }
  function dropLink(L) { if (!L) return; if (L.attached) { const i = R.links.indexOf(L); if (i >= 0) R.links.splice(i, 1); L.attached = false; } destroyLink(L); refreshState(); }

  // ---- ручной режим (запасной, всегда доступен): ссылка ?join=NX1O…, ответ NX1A…
  let manual = null;   // ожидающее приглашение Хоста
  async function createOffer() {
    { const bg = banGate(); if (bg) return bg; }
    if (typeof RTCPeerConnection !== 'function') { R.sticky = 'failed'; refreshState('UNSUPPORTED'); return { ok: false, err: 'UNSUPPORTED' }; }
    if (manual) { dropLink(manual); manual = null; }
    begin('host');
    const L = newLink('host'), t0 = Date.now();
    L.sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    L.state = 'creating'; manual = L;
    if (!attach(L)) { dropLink(L); manual = null; return { ok: false, err: 'ROOM_FULL' }; }
    refreshState();
    try {
      await L.pc.setLocalDescription(await L.pc.createOffer());
      const g = await gather(L.pc, t0);
      dgGathered(L);
      if (manual !== L || L.state === 'closed') return { ok: false, err: 'CLOSED' };
      const sh = shrinkSdp(g.sdp);
      DG = null; diagSet('local', g.sdp);
      const code = await packCode('O', { s: L.sid, d: sh.sdp });
      L.offerCode = code; L.info = { forced: g.forced, onlyLocal: sh.onlyLocal, cands: sh.cands };
      L.state = 'waiting-answer'; refreshState(g.forced ? 'GATHER_FORCED' : (sh.onlyLocal ? 'NO_PUBLIC' : null));
      return { ok: true, code, link: linkFor(code), forced: g.forced, onlyLocal: sh.onlyLocal, chars: code.length };
    } catch (e) { log('offer error ' + (e && e.name)); fail(L, 'ICE_FAILED'); manual = null; return { ok: false, err: 'ICE_FAILED' }; }
  }
  async function acceptAnswer(text) {
    const p = await parseInput(text);
    if (!p.ok) return p;
    if (p.kind !== 'A') return { ok: false, err: 'WRONG_KIND_A' };
    const L = manual;
    if (R.role !== 'host' || !L || !L.pc || L.state !== 'waiting-answer') return { ok: false, err: 'NOT_WAITING' };
    if (p.sid !== L.sid) return { ok: false, err: 'WRONG_SESSION' };
    try {
      await L.pc.setRemoteDescription({ type: 'answer', sdp: p.sdp });
      diagSet('remote', p.sdp); dgRemote(L, p.sdp);
      manual = null;
      startConnecting(L);
      return { ok: true };
    } catch (e) { log('answer error ' + (e && e.name)); return { ok: false, err: 'BAD_DATA' }; }
  }
  async function createAnswer(text) {
    { const bg = banGate(); if (bg) return bg; }
    if (typeof RTCPeerConnection !== 'function') { R.sticky = 'failed'; refreshState('UNSUPPORTED'); return { ok: false, err: 'UNSUPPORTED' }; }
    const p = await parseInput(text);
    if (!p.ok) return p;
    if (p.kind !== 'O') return { ok: false, err: 'WRONG_KIND_O' };
    manual = null;
    begin('guest');
    const L = newLink('guest'), t0 = Date.now();
    L.sid = p.sid; L.state = 'answering'; DG = null; diagSet('remote', p.sdp); dgRemote(L, p.sdp);
    attach(L); refreshState();
    try {
      await L.pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
      await L.pc.setLocalDescription(await L.pc.createAnswer());
      const g = await gather(L.pc, t0);
      dgGathered(L);
      if (L.state === 'closed') return { ok: false, err: 'CLOSED' };
      const sh = shrinkSdp(g.sdp);
      diagSet('local', g.sdp); L.answerAt = Date.now();
      const code = await packCode('A', { s: L.sid, d: sh.sdp });
      L.answerCode = code; L.info = { forced: g.forced, onlyLocal: sh.onlyLocal, cands: sh.cands };
      armConnectTimer(L, cfg.guestWaitMs);
      emit('net:answer', { code });
      if (g.forced) log('answer: gather forced');
      return { ok: true, code, forced: g.forced, onlyLocal: sh.onlyLocal, chars: code.length };
    } catch (e) { log('answer gen error ' + (e && e.name)); fail(L, 'BAD_DATA'); return { ok: false, err: 'BAD_DATA' }; }
  }

  // код из адресной строки: ?join=… или #join=… (в iframe itch.io чтение может быть запрещено — тогда остаётся ручная вставка)
  let urlCache;
  function pendingJoin() {
    if (urlCache !== undefined) return urlCache;
    urlCache = null;
    try {
      const m = /[?&#]join=([^&#\s]+)/.exec(String(location.search || '') + '&' + String(location.hash || '').replace(/^#/, '#'));
      if (m) urlCache = decodeURIComponent(m[1]);
    } catch (e) { urlCache = null; }
    return urlCache;
  }
  function clearJoinFromUrl() {
    urlCache = null;
    try {
      const u = new URL(location.href);
      u.searchParams.delete('join');
      let h = u.hash.replace(/^#/, '').split('&').filter((x) => x.indexOf('join=') !== 0).join('&');
      u.hash = h ? '#' + h : '';
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { /* адресная строка недоступна */ }
  }

  // ------------------------------------------------------------------ переговоры по каналу 'rel' (голос, перезапуск ICE): «perfect negotiation»
  async function negotiate(L) {
    if (!L.pc || !L.ready || L.making) return;
    try {
      L.making = true;
      await L.pc.setLocalDescription();
      sendLink(L, { type: 'sdp', desc: { type: L.pc.localDescription.type, sdp: L.pc.localDescription.sdp } });
    } catch (e) { log('negotiate error ' + (e && e.name)); } finally { L.making = false; }
  }
  async function onSdp(L, p) {
    const pc = L.pc, d = p && p.desc;
    if (!pc || !d || (d.type !== 'offer' && d.type !== 'answer') || typeof d.sdp !== 'string') return;
    try {
      const collision = d.type === 'offer' && (L.making || pc.signalingState !== 'stable');
      if (!L.polite && collision) return;
      await pc.setRemoteDescription({ type: d.type, sdp: d.sdp });
      if (d.type === 'offer') {
        await pc.setLocalDescription();
        sendLink(L, { type: 'sdp', desc: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      }
    } catch (e) { log('sdp error ' + (e && e.name)); }
  }

  // ------------------------------------------------------------------ отправка / приём
  function localInfo() {
    let i = null;
    try { i = window.NexaProfile && NexaProfile.publicInfo ? NexaProfile.publicInfo() : null; } catch (e) { i = null; }
    i = i || { name: 'PLAYER', color: '#ff3b30', level: 1 };
    return { name: cleanName(i.name), color: cleanColor(i.color), level: Math.max(1, Math.min(999, i.level | 0 || 1)), v: VERSION, lang: (window.I18N && I18N.lang) || 'en', pid: MYPID, k: (window.Toys && Toys.ident && Toys.ident.pk) || '' };
  }
  // отправка в одно соединение; вернёт true, если ушло. Быстрые типы идут по 'act' (без повторов; при забитом буфере свежее важнее старого), остальные — по 'rel'
  function sendLink(L, data, fastOpt, raw) {
    const fast = fastOpt !== undefined ? !!fastOpt : !!FAST[data.type];
    const ch = fast ? L.act : L.rel;
    if (!ch || ch.readyState !== 'open') return false;
    const bin = typeof raw === 'object' && raw !== null;
    if (fast && ch.bufferedAmount > (bin ? 4096 : 64 * 1024)) { STAT.dropBuf += 1; return false; }
    let s = raw;
    if (!s) { const pkt = Object.assign({}, data); pkt.n = ++seq; pkt.ts = Date.now(); try { s = JSON.stringify(pkt); } catch (e) { return false; } }
    try { ch.send(s); } catch (e) { return false; }
    if (fast && dupFlag) setTimeout(() => { if (ch.readyState === 'open') { try { ch.send(s); } catch (e) { /* ok */ } } }, 12);
    L.tx += 1; L.txB += bin ? s.byteLength : s.length;
    return true;
  }
  let seq = 0;
  const STAT = { dropBuf: 0 };
  // единая точка отправки: {type, n, ts, ...поля}. Хост — всем гостям (или opts.to = слот), гость — Хосту (DIRECT-пакеты уходят адресату через Хоста)
  function sendAction(data, opts) {
    if (!data || typeof data.type !== 'string') return false;
    const fast = opts && opts.fast !== undefined ? !!opts.fast : !!FAST[data.type];
    let ok = false;
    dupFlag = !!DUPE[data.type] && fast;
    const isPos = data.type === 'pos' && typeof data.x === 'number';
    if (R.role === 'host') {
      const to = opts && opts.to;
      let s = '', bin = null;
      R.links.forEach((l) => {
        if (!l.ready || !l.opened || (to && l.slot !== to)) return;
        if (isPos && !l.virtual && !l.local) { if (!bin) bin = encPos(data, 1); (l.pb || (l.pb = new Map())).set(1, { b: bin, x: data.x, z: data.z }); if (!posTm) posTm = setInterval(flushPos, 33); ok = true; return; }
        if (!s) { const pkt = Object.assign({}, data); pkt.n = ++seq; pkt.ts = Date.now(); try { s = JSON.stringify(pkt); } catch (e) { s = '!'; } }
        if (s !== '!' && sendLink(l, null, fast, s)) ok = true;                 // сериализуем один раз на всех получателей
      });
    } else if (R.role === 'guest') {
      const l = R.links[0];
      if (isPos && l && l.ready && l.opened && !l.local) ok = sendLink(l, null, true, encPos(data, 0));
      else if (l && l.ready && l.opened) { const d = opts && opts.to ? Object.assign({}, data, { to: opts.to | 0 }) : data; ok = sendLink(l, d, fast); }
    }
    dupFlag = false;
    return ok;
  }
  function sendAt(L, t16) {
    if (typeof L.off !== 'number') return 0;
    const n = now(), rn = n + L.off, d = ((((t16 - (Math.round(rn) & 65535)) + 98304) % 65536) - 32768), at = rn + d - L.off;
    return at > n - 1500 && at <= n + 20 ? Math.min(at, n) : 0;
  }
  let posTm = 0, posFl = 0;
  function flushPos() {           // хост: одна пачка pos на получателя вместо пакета на каждого отправителя; дальних (>40 м) — каждый третий такт
    if (R.role !== 'host' || !R.links.length) { clearInterval(posTm); posTm = 0; return; }
    posFl += 1;
    R.links.forEach((l) => {
      const m = l.pb; if (!m || !m.size) return;
      const out = [];
      m.forEach((e, slot) => {
        if (l.px !== undefined && posFl % 3 && Math.hypot(e.x - l.px, e.z - l.pz) > 40) return;
        out.push(e.b); m.delete(slot);
      });
      if (!out.length) return;
      if (out.length === 1) { sendLink(l, null, true, out[0]); return; }
      let n = 2; out.forEach((b) => { n += 1 + b.byteLength; });
      const buf = new ArrayBuffer(n), u = new Uint8Array(buf); u[0] = 2; u[1] = out.length;
      let o = 2; out.forEach((b) => { u[o] = b.byteLength; u.set(new Uint8Array(b), o + 1); o += 1 + b.byteLength; });
      sendLink(l, null, true, buf);
    });
  }
  function onBinary(L, raw) {
    if (new Uint8Array(raw)[0] === 2) {       // пачка pos от хоста
      const u = new Uint8Array(raw), c = u[1]; let o = 2;
      for (let i = 0; i < c && o < u.length; i += 1) { const ln = u[o]; if (o + 1 + ln > u.length) break; onBinary(L, raw.slice(o + 1, o + 1 + ln)); o += 1 + ln; }
      return;
    }
    const t = now();
    if (t - L.rate.t > 1000) { L.rate.t = t; L.rate.n = 0; }
    if (++L.rate.n > 400) return;
    const p = decPos(raw); if (!p) return;
    p.from = L.gr === 'host' ? L.slot : (p.fb >= 1 && p.fb <= cfg.maxPlayers ? p.fb : 1);
    const k = 'pos:' + p.from, last = L.lastT && L.lastT[k];
    if (last !== undefined) { const dd = (p.t16 - last) & 65535; if (dd === 0 || dd >= 32768) return; }
    (L.lastT || (L.lastT = {}))[k] = p.t16;
    L.lastRx = t; L.rx += 1; L.rxB += raw.byteLength;
    if (L.state === 'lost') { L.state = 'open'; refreshState(); }
    p.at = sendAt(L, p.t16);
    if (L.gr === 'host') {
      let cp = null, js = null;
      R.links.forEach((l) => {
        if (l === L || !l.opened || !l.ready) return;
        if (l.virtual || l.local) { if (!js) { const q = Object.assign({}, p); q.from = L.slot; q.n = ++seq; q.ts = Date.now(); delete q.fb; delete q.t16; js = JSON.stringify(q); } sendLink(l, null, true, js); return; }
        if (!cp) { cp = raw.slice(0); new Uint8Array(cp)[1] = L.slot; if (p.at) new DataView(cp).setUint16(2, Math.round(p.at) & 65535, true); }
        (l.pb || (l.pb = new Map())).set(L.slot, { b: cp, x: p.x, z: p.z });
        if (!posTm) posTm = setInterval(flushPos, 33);
      });
      L.px = p.x; L.pz = p.z;
    }
    p.now = t;
    emit('pos', p);
  }
  function onMessage(L, raw, fast) {
    if (raw instanceof ArrayBuffer) { onBinary(L, raw); return; }
    if (typeof raw !== 'string' || raw.length > (fast ? MAX_ACT : MAX_REL)) return;
    const t = now();
    if (t - L.rate.t > 1000) { L.rate.t = t; L.rate.n = 0; }
    if (++L.rate.n > 400) return;                              // защита от залпа пакетов от чужого клиента
    let p;
    try { p = JSON.parse(raw); } catch (e) { return; }
    if (!p || typeof p.type !== 'string' || p.type.length > 24 || typeof p.n !== 'number') return;
    // от гостя поле from не доверяем: ставим слот соединения; от Хоста from — слот реального отправителя (ретрансляция) или 1
    if (L.gr === 'host') p.from = L.slot; else p.from = (p.from | 0) >= 1 && (p.from | 0) <= cfg.maxPlayers ? p.from | 0 : 1;
    if (fast && DUPE[p.type]) { const k = p.from + ':' + p.n, ds = L.dset || (L.dset = new Set()); if (ds.has(k)) return; ds.add(k); if (ds.size > 128) ds.delete(ds.values().next().value); }
    else if (fast) { const k = p.type + ':' + p.from; if (p.n <= (L.lastN[k] || 0)) return; L.lastN[k] = p.n; }
    L.lastRx = t; L.rx += 1; L.rxB += raw.length;
    if (L.state === 'lost') { L.state = 'open'; refreshState(); }
    switch (p.type) {
      case 'ping': if (p.h) L.peerHid = now(); sendLink(L, { type: 'pong', t: p.t, u: Math.round(now() * 10) / 10 }); return;
      case 'pong': if (typeof p.t === 'number') { const r = Math.max(0, now() - p.t); L.rtt = L.rtt ? L.rtt * 0.7 + r * 0.3 : r; L.rttMin = L.rttMin ? Math.min(L.rttMin, r) : r; const tn = now(); (L.rs || (L.rs = [])).push([tn, r, typeof p.u === 'number' ? p.u - (p.t + r / 2) : null]); while (L.rs.length && tn - L.rs[0][0] > 10000) L.rs.shift(); { let bm = 1e9; L.rs.forEach((x) => { if (x[2] !== null && x[1] < bm) { bm = x[1]; L.off = x[2]; } }); } const rm = Math.round(rttMain()); if (Math.abs(rm - rttEm) > 5) { rttEm = rm; emit('net:rtt', rm); } } return;
      case 'sdp': onSdp(L, p); return;
      case 'bye': L.peerBye = true; linkGone(L, 'PEER_LEFT'); return;
      case 'rl': onTunnel(L, p); return;
      case 'hello': onHello(L, p); return;
      case 'welcome': if (L.gr === 'guest') { cfg.maxPlayers = Math.max(2, Math.min(MAX_BR, p.max | 0 || MAX_PLAYERS)); R.mySlot = Math.max(2, Math.min(cfg.maxPlayers, p.slot | 0 || 2)); emit('net:welcome', { slot: R.mySlot }); } return;
      case 'roster': if (L.gr === 'guest') onRoster(p); return;
      case 'vcap': if (L.gr === 'guest') { voiceDisable(); V.err = 'VOICE_FULL'; voiceEvt(); } return;
      case 'chat': onChat(L, p); return;
      case 'vox': R.speak[p.from] = !!p.on && !p.muted; voiceEvt(); if (L.gr === 'host') relayOthers(L, p, raw, false); return;
      default: break;
    }
    if (L.gr === 'host') {                                      // Хост принимает от гостя
      if (RELAY[p.type]) { relayOthers(L, p, raw, fast); emit(p.type, p); return; }
      if (DIRECT[p.type] && (p.to | 0) > 1) { const dst = findSlot(p.to | 0); if (dst) { const q = Object.assign({}, p); delete q.to; q.from = L.slot; sendLink(dst, q, undefined); } return; }
      emit(p.type, p);
    } else {
      if (DIRECT[p.type] && (p.to | 0) > 0 && (p.to | 0) !== R.mySlot) return;
      emit(p.type, p);
    }
  }
  // Хост: переслать пакет гостя остальным гостям (с проставленным from)
  function relayOthers(from, p, raw, fast) {
    const f = fast === undefined ? !!FAST[p.type] : !!fast;
    let s;
    if (typeof raw === 'string' && raw.charCodeAt(raw.length - 1) === 125) s = raw.slice(0, -1) + ',"from":' + from.slot + '}';       // без повторного разбора и JSON.stringify (последний from побеждает)
    else { const q = Object.assign({}, p); q.from = from.slot; s = JSON.stringify(q); }
    R.links.forEach((l) => { if (l !== from && l.opened && l.ready) sendLink(l, null, f, s); });
  }
  function rttMain() {
    if (R.role === 'guest') return R.links[0] ? R.links[0].rtt : 0;
    let m = 0; R.links.forEach((l) => { if (l.rtt > m) m = l.rtt; });
    return m;
  }
  const JOINS = {}, JOIN_MAX = 6;
  function onHello(L, p) {
    const i = p.info || {};
    L.peer = { name: cleanName(i.name, L.gr === 'host' ? 'PLAYER ' + L.slot : 'HOST'), color: cleanColor(i.color), level: Math.max(1, Math.min(999, i.level | 0 || 1)), v: i.v | 0, lang: String(i.lang || '').slice(0, 2) };
    const first = !L.helloGot; L.helloGot = true;
    L.pid = cleanPid(i.pid);
    if (R.role === 'host') {
      const ad = window.NexaAdmin; L.pk = /^[0-9a-f]{64}$/.test(i.k) ? i.k : '';
      const deny = () => { sendLink(L, { type: 'bye' }); linkGone(L, 'PEER_LEFT'); };
      if (ad && ad.active && (!L.pk || ad.banned(L.pk))) { deny(); return; }
      if (L.pk) {
        if (first) {
          const w = (JOINS[L.pk] || []).filter((t) => now() - t < 60000);
          if (L.pk === (window.Toys && Toys.ident.pk) || w.length >= JOIN_MAX) { JOINS[L.pk] = w; deny(); return; }
          w.push(now()); JOINS[L.pk] = w;
        }
        R.links.slice().forEach((o) => { if (o !== L && o.helloGot && o.pk === L.pk) { sendLink(o, { type: 'bye' }); linkGone(o, 'PEER_LEFT'); } });
      }
    }
    applyBlock({ name: L.peer.name, pid: L.pid, slot: L.slot });
    if (first) chatSys(R.role === 'host' ? 'FRIEND_JOINED' : 'HOST_READY', L.peer.name);
    if (R.role === 'host') hostSync();
    else if (!R.players.some((q) => q.slot === 1)) R.players.push({ slot: 1, name: L.peer.name, color: L.peer.color, level: L.peer.level, pid: L.pid, lang: L.peer.lang, v: L.peer.v });
    else { const h = R.players.find((q) => q.slot === 1); Object.assign(h, { name: L.peer.name, color: L.peer.color, level: L.peer.level, pid: L.pid }); }
    emit('net:peer', Object.assign({ slot: L.slot, pid: L.pid }, L.peer));
  }
  function rttStats(L) {
    const a = (L.rs || []).map((x) => x[1]).sort((x, y) => x - y);
    if (!a.length) return { n: 0, min: 0, avg: 0, p95: 0, max: 0 };
    return { n: a.length, min: Math.round(a[0]), avg: Math.round(a.reduce((x, y) => x + y, 0) / a.length), p95: Math.round(a[Math.min(a.length - 1, Math.floor(a.length * 0.95))]), max: Math.round(a[a.length - 1]) };
  }
  async function pathTick(L) {
    if (!L.pc || L.local || L.virtual || L.state === 'closed') return;
    try {
      const rep = await L.pc.getStats(), by = {}; let pair = null;
      rep.forEach((r) => { by[r.id] = r; });
      rep.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId && by[r.selectedCandidatePairId]) pair = by[r.selectedCandidatePairId]; });
      if (!pair) rep.forEach((r) => { if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) pair = r; });
      if (!pair) return;
      const lc = by[pair.localCandidateId], rc = by[pair.remoteCandidateId];
      L.ct = (lc && lc.candidateType) || ''; L.rct = (rc && rc.candidateType) || '';
      L.path = L.ct === 'relay' || L.rct === 'relay' ? 'relay' : 'direct';
      L.ice = pair.currentRoundTripTime ? Math.round(pair.currentRoundTripTime * 1000) : 0;
      const s = rttStats(L);
      console.log('[net] slot ' + L.slot + ' path=' + L.path + ' (' + L.ct + '/' + L.rct + ') ice-rtt=' + L.ice + 'ms ping min/avg/p95/max=' + s.min + '/' + s.avg + '/' + s.p95 + '/' + s.max + ' dropBuf=' + STAT.dropBuf + (L.off !== undefined ? ' clockOff=' + Math.round(L.off) : '') + (window.NexaCoop && NexaCoop.puppetStats ? NexaCoop.puppetStats() : ''));
      emit('net:path', L.path);
    } catch (e) { /* ok */ }
  }
  function diag() {
    return { dropBuf: STAT.dropBuf, rttMain: Math.round(rttMain()), links: R.links.filter((l) => l.opened).map((l) => Object.assign({ slot: l.slot, path: l.path || '', ct: l.ct || '', ice: l.ice || 0 }, rttStats(l))) };
  }
  function pingText(slot) {
    const d = diag(); if (!d.links.length) return '';
    let w = slot && R.role === 'host' ? d.links.find((l) => l.slot === slot) : null;
    if (!w) w = d.links.reduce((m, l) => (l.avg >= m.avg ? l : m), d.links[0]);
    return w.avg ? w.avg + ' ms (p95 ' + w.p95 + ')' : '';
  }
  let rttEm = -99;
  function pingTick(L, force) {
    const t = now(), hid = document.hidden, gap = hid ? 2000 : Date.now() - L.openAt < 5000 ? 250 : 1000;
    if (!force && t - (L.pingAt || 0) < gap - 30) return;
    L.pingAt = t; sendLink(L, hid ? { type: 'ping', t, h: 1 } : { type: 'ping', t });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) return; R.links.forEach((l) => { if (l.ready) { l.lastRx = now(); pingTick(l, true); } }); });
  function watchTick(L) {
    if (!L.ready) return;
    const lim = document.hidden || now() - (L.peerHid || -1e9) < 6000 ? Math.max(cfg.silentMs, 20000) : cfg.silentMs;
    if (now() - L.lastRx > lim) markLost(L);
    if (cfg.restartOnRtt && L.pc && L.rttMin > 0) {
      L.hi = L.rtt > L.rttMin * 2 && L.rtt > 80 ? (L.hi || 0) + 1 : 0;
      if (L.hi >= 3 && Date.now() - (L.rsAt || 0) > 30000) { L.rsAt = Date.now(); L.hi = 0; try { L.pc.restartIce(); } catch (e) { /* ok */ } }
    }
    if (L.openAt && L === (R.links[0] || L)) emit('net:tick', { up: Math.round((Date.now() - L.openAt) / 1000) });
  }

  // ------------------------------------------------------------------ заглушение и жалобы (локально): незнакомые игроки
  const muted = {};                                              // pid -> true (сессия)
  const blockedNames = (function () { try { return JSON.parse(lsGet('nexaBlocked') || '[]').filter((x) => typeof x === 'string').slice(0, 200); } catch (e) { return []; } }());
  function applyBlock(q) { if (!q) return; if (q.name && blockedNames.indexOf(String(q.name).toLowerCase()) >= 0 && q.pid) muted[q.pid] = true; }
  function pidOfSlot(s) { if (R.role === 'host') { const l = findSlot(s); return l ? l.pid : ''; } const q = R.players.find((x) => x.slot === s); return q ? q.pid : ''; }
  function setMuted(s, on) { const pid = pidOfSlot(s); if (!pid) return false; if (on) muted[pid] = true; else delete muted[pid]; voiceApplyMute(); emit('net:mute', { slot: s, on: !!on }); return true; }
  const isMuted = (s) => { const pid = pidOfSlot(s); return !!(pid && muted[pid]); };
  function report(s, name) {          // «пожаловаться»: локально скрыть и заблокировать (имя запоминается в браузере)
    const q = others().find((x) => x.slot === s); const n = String(name || (q && q.name) || '').toLowerCase();
    setMuted(s, true);
    if (n && blockedNames.indexOf(n) < 0) { blockedNames.push(n); lsSet('nexaBlocked', JSON.stringify(blockedNames.slice(-200))); }
    return true;
  }
  const isBlockedName = (n) => blockedNames.indexOf(String(n || '').toLowerCase()) >= 0;
  const banGate = () => {
    const a = window.NexaAdmin, g = window.NexaSingle;
    if (a && a.me()) return { ok: false, err: 'BANNED' };
    if (g && !g.owner()) { MSG.DUP_TAB = window.NexaAdminText ? window.NexaAdminText('dup') : 'The game is already open in another tab.'; return { ok: false, err: 'DUP_TAB' }; }
    return null;
  };
  function kickWhere(f) { if (R.role !== 'host') return; R.links.slice().forEach((l) => { if (l.helloGot && f(l.pk)) { sendLink(l, { type: 'bye' }); linkGone(l, 'PEER_LEFT'); } }); }
  function kick(s) { const l = findSlot(s); if (R.role === 'host' && l) { sendLink(l, { type: 'bye' }); linkGone(l, 'PEER_LEFT'); } }

  // ------------------------------------------------------------------ текстовый чат
  const chat = { history: [], seen: 0, sent: [] };
  function pushChat(m) {
    if (m.from === 'peer' && m.slot && isMuted(m.slot)) return null;     // заглушённый игрок: сообщения скрыты
    chat.history.push(m); if (chat.history.length > 120) chat.history.shift(); emit('net:chat', m); return m;
  }
  function chatSys(key, name) { return pushChat({ id: 's' + Date.now() + Math.random(), from: 'sys', key, name: name || '', text: '', ts: Date.now() }); }
  function chatSend(text) {
    const t = cleanChat(text);
    if (!t) return { ok: false, err: 'CHAT_EMPTY' };
    if (!isOpen()) return { ok: false, err: 'CHAT_OFFLINE' };
    const n = Date.now();
    chat.sent = chat.sent.filter((x) => n - x < 10000);
    if (chat.sent.length >= 6 || (chat.sent.length && n - chat.sent[chat.sent.length - 1] < 350)) return { ok: false, err: 'CHAT_FLOOD' };
    if (!sendAction({ type: 'chat', text: t })) return { ok: false, err: 'CHAT_OFFLINE' };
    chat.sent.push(n);
    const me = localInfo();
    pushChat({ id: 'm' + n + Math.random(), from: 'me', name: me.name, color: me.color, text: t, ts: n, slot: slot() });
    try { window.NexaProfile && NexaProfile.count('msgSent'); } catch (e) { /* профиль не обязателен */ }
    return { ok: true, text: t };
  }
  function onChat(L, p) {
    const t = cleanChat(p.text), n = Date.now();
    if (!t) return;
    L.chatGot = L.chatGot.filter((x) => n - x < 10000);
    if (L.chatGot.length >= 10) return;                        // антифлуд на приёме (на каждого отправителя)
    L.chatGot.push(n);
    let who;
    if (L.gr === 'host') who = L.peer || { name: 'PLAYER ' + L.slot, color: '#ffffff' };
    else { if (p.from === R.mySlot) return; who = R.players.find((q) => q.slot === p.from) || L.peer || { name: 'PLAYER', color: '#ffffff' }; }
    const msg = pushChat({ id: 'p' + n + Math.random(), from: 'peer', name: who.name, color: who.color, text: t, ts: n, slot: p.from });
    if (!msg) return;
    if (L.gr === 'host') relayOthers(L, { type: 'chat', text: t, n: p.n }, null, false);   // Хост: показать остальным гостям (санитайзинг уже сделан)
    try { window.NexaProfile && NexaProfile.count('msgGot'); } catch (e) { /* профиль не обязателен */ }
  }

  // ------------------------------------------------------------------ голос (микрофон -> addTrack, приём -> <audio>; Хост сводит голоса «микс минус сам»)
  const V = { mic: false, muted: false, volume: 1, speaking: false, blocked: false, err: null, stream: null, track: null, actx: null, an: null, buf: null, meterT: 0, level: 0, micSrc: null, loud: 0, quiet: 0, inOn: true };
  function voiceEvt() { emit('net:voice', voiceState()); }
  function voiceState() {
    const ls = R.links.filter((l) => l.opened), ps = Object.keys(R.speak).some((k) => R.speak[k] && !isMuted(k | 0));
    return { mic: V.mic, muted: V.muted, volume: V.volume, speaking: V.speaking, peerSpeaking: ps, peerMuted: !ps,
      hasRemote: ls.some((l) => !!l.remote), blocked: V.blocked, err: V.err, level: V.level, max: MAX_VOICE };
  }
  function audioCtx() {
    if (V.actx) return V.actx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { V.actx = new AC(); } catch (e) { V.actx = null; }
    return V.actx;
  }
  function meterTick() {
    if (!V.an) return;
    V.an.getByteTimeDomainData(V.buf);
    let s = 0;
    for (let i = 0; i < V.buf.length; i += 1) { const d = (V.buf[i] - 128) / 128; s += d * d; }
    const lv = Math.sqrt(s / V.buf.length); V.level = lv;
    const loud = lv > 0.035 && V.mic && !V.muted;
    V.loud = loud ? Math.min(6, V.loud + 1) : 0; V.quiet = loud ? 0 : Math.min(8, V.quiet + 1);
    const sp = V.speaking ? V.quiet < 6 : V.loud >= 2;
    if (sp !== V.speaking) { V.speaking = sp; sendAction({ type: 'vox', on: sp, muted: V.muted }); voiceEvt(); }
  }
  function startMeter() {
    clearInterval(V.meterT); V.meterT = 0;
    const ac = audioCtx();
    if (!ac || !V.stream) return;
    try {
      const src = V.micSrc = ac.createMediaStreamSource(V.stream);
      V.an = ac.createAnalyser(); V.an.fftSize = 512; V.buf = new Uint8Array(V.an.fftSize);
      src.connect(V.an);                                          // к выходу НЕ подключаем: собственный голос в динамики не идёт
      V.meterT = setInterval(meterTick, 100);
    } catch (e) { V.an = null; }
  }
  async function voiceEnable() {
    V.err = null;
    if (!isOpen() || !R.links.length) { V.err = 'NOT_CONNECTED'; voiceEvt(); return { ok: false, err: 'NOT_CONNECTED' }; }
    if (V.mic) return { ok: true };
    if (R.links.every((l) => !l.pc)) { V.err = 'VOICE_LOCAL'; voiceEvt(); return { ok: false, err: 'VOICE_LOCAL' }; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { V.err = 'MIC_UNSUPPORTED'; voiceEvt(); return { ok: false, err: V.err }; }
    try {
      V.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (e) {
      const n = e && e.name;
      V.err = n === 'NotAllowedError' || n === 'SecurityError' ? 'MIC_DENIED' : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'MIC_NONE' : 'MIC_FAIL';
      voiceEvt(); return { ok: false, err: V.err };
    }
    if (!R.links.length) { V.stream.getTracks().forEach((t) => t.stop()); V.stream = null; V.err = 'NOT_CONNECTED'; voiceEvt(); return { ok: false, err: V.err }; }
    if (R.links.every((l) => !l.pc)) { V.stream.getTracks().forEach((t) => t.stop()); V.stream = null; V.err = 'VOICE_LOCAL'; voiceEvt(); return { ok: false, err: V.err }; }
    V.track = V.stream.getAudioTracks()[0];
    if (!V.track) { V.err = 'MIC_NONE'; voiceEvt(); return { ok: false, err: V.err }; }
    V.track.enabled = !V.muted;
    V.mic = true;
    startMeter();
    if (R.role === 'guest') { const L = R.links[0]; if (L && L.pc && !L.sender) L.sender = L.pc.addTrack(V.track, V.stream); }   // согласование уйдёт по каналу 'rel'
    else hostMixSync();
    sendAction({ type: 'vox', on: false, muted: V.muted });
    voiceEvt();
    return { ok: true };
  }
  function voiceSetMuted(m) {
    V.muted = !!m;
    if (V.track) V.track.enabled = !V.muted;
    if (V.muted && V.speaking) V.speaking = false;
    sendAction({ type: 'vox', on: V.speaking, muted: V.muted });
    voiceEvt();
  }
  function voiceApplyMute() {
    R.links.forEach((l) => { if (l.el) l.el.volume = (l.pid && muted[l.pid]) || !V.inOn ? 0 : V.volume; });
    if (R.role === 'host') hostMixSync();
  }
  function voiceSetVolume(v) { V.volume = Math.max(0, Math.min(1, +v || 0)); voiceApplyMute(); voiceEvt(); }
  // «входящий голос»: для незнакомых в публичных комнатах по умолчанию выключен (включается кнопкой)
  function voiceIncoming(on) { V.inOn = !!on; voiceApplyMute(); voiceEvt(); }
  function voiceDisable() {
    if (R.role === 'guest') { const L = R.links[0]; if (L && L.sender && L.pc) { try { L.pc.removeTrack(L.sender); } catch (e) { /* уже удалён */ } L.sender = null; } }
    if (V.stream) V.stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* ignore */ } });
    clearInterval(V.meterT); V.meterT = 0; V.an = null;
    try { V.micSrc && V.micSrc.disconnect(); } catch (e) { /* ignore */ }
    V.micSrc = null; V.stream = V.track = null; V.mic = false; V.speaking = false; V.level = 0;
    sendAction({ type: 'vox', on: false, muted: true });
    if (R.role === 'host') hostMixSync();
    voiceEvt();
  }
  function voiceLinkStop(L) {
    if (L.el) { try { L.el.pause(); L.el.srcObject = null; L.el.remove(); } catch (e) { /* ignore */ } L.el = null; }
    try { L.rsrc && L.rsrc.disconnect(); } catch (e) { /* ignore */ }
    try { L.dest && L.dest.disconnect(); } catch (e) { /* ignore */ }
    L.rsrc = L.dest = L.remote = L.sender = null; L.mixIn = null;
  }
  function voiceStop() {
    voiceDisable();
    R.links.forEach(voiceLinkStop);
    V.blocked = false; V.err = null;
    if (V.actx) { try { V.actx.close(); } catch (e) { /* ignore */ } V.actx = null; }
    voiceEvt();
  }
  function playRemote() {
    R.links.forEach((l) => {
      if (!l.el) return;
      let pr; try { pr = l.el.play(); } catch (e) { pr = null; }
      if (pr && pr.then) pr.then(() => { if (V.blocked) { V.blocked = false; voiceEvt(); } }, () => { V.blocked = true; voiceEvt(); });
    });
  }
  function onTrack(L, e) {
    if (L.state === 'closed' || e.track.kind !== 'audio') return;
    L.remote = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
    if (!L.el) {
      L.el = document.createElement('audio');
      L.el.autoplay = true; L.el.setAttribute('playsinline', ''); L.el.hidden = true; L.el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(L.el);
    }
    L.el.srcObject = L.remote; L.el.volume = (L.pid && muted[L.pid]) || !V.inOn ? 0 : V.volume;
    playRemote();
    if (R.role === 'host') { const ac = audioCtx(); if (ac) { try { L.rsrc = ac.createMediaStreamSource(L.remote); } catch (er) { L.rsrc = null; } } hostMixSync(); }
    voiceEvt();
  }
  // Хост: для каждого гостя своя смесь «все остальные голоса» (свой голос гость не получает). До MAX_VOICE источников одновременно (включая Хоста)
  function hostMixSync() {
    if (R.role !== 'host') return;
    const ac = V.actx; if (!ac) return;
    const links = R.links.filter((l) => l.opened && l.pc);
    // источники: микрофон Хоста + удалённые голоса гостей (не заглушённые Хостом), не больше MAX_VOICE
    const srcs = [];
    if (V.mic && V.micSrc) srcs.push({ key: 'host', node: V.micSrc, link: null });
    links.forEach((l) => { if (l.rsrc && !(l.pid && muted[l.pid]) && srcs.length < MAX_VOICE) srcs.push({ key: 'l' + l.id, node: l.rsrc, link: l }); else if (l.rsrc && !l.capped && srcs.length >= MAX_VOICE) { l.capped = true; sendLink(l, { type: 'vcap' }); } });
    links.forEach((M) => {
      const want = srcs.filter((s) => s.link !== M);
      if (want.length && !M.dest) { try { M.dest = ac.createMediaStreamDestination(); } catch (e) { M.dest = null; } }
      if (!M.dest) return;
      if (!M.mixIn) M.mixIn = new Map();
      M.mixIn.forEach((node, k) => { if (!want.some((s) => s.key === k)) { try { node.disconnect(M.dest); } catch (e) { /* ok */ } M.mixIn.delete(k); } });
      want.forEach((s) => { if (!M.mixIn.has(s.key)) { try { s.node.connect(M.dest); M.mixIn.set(s.key, s.node); } catch (e) { /* ok */ } } });
      if (want.length && !M.sender) { const tr = M.dest.stream.getAudioTracks()[0]; if (tr) { try { M.sender = M.pc.addTrack(tr, M.dest.stream); } catch (e) { /* ok */ } } }
    });
  }
  // любой жест игрока разблокирует автоплей голоса друга
  ['pointerdown', 'keydown'].forEach((n) => document.addEventListener(n, () => { if (V.blocked) playRemote(); if (V.actx && V.actx.state === 'suspended') { try { V.actx.resume(); } catch (e) { /* ignore */ } } }, true));

  // ------------------------------------------------------------------ режим «этот компьютер»: вкладки одного браузера соединяются через BroadcastChannel (без WebRTC и кодов)
  // Данные идут теми же каналами 'act'/'rel' (поддельные каналы поверх BroadcastChannel). Работает между вкладками/окнами ОДНОГО профиля (не в режиме инкогнито); голос недоступен.
  const LC = { disc: null, rid: '', presT: 0, joinTO: 0 };
  function localWire(L, name) {
    const bc = L.bc = new BroadcastChannel(name); let opened = false;
    const out = (c) => (x) => bc.postMessage({ k: 'd', c, s: x });
    L.act.out = out('act'); L.rel.out = out('rel');
    const open = () => { if (opened) return; opened = true; clearInterval(L.hiT); L.act.open(); L.rel.open(); };
    bc.onmessage = (e) => {
      const m = e.data; if (!m || typeof m !== 'object') return;
      if (m.k === 'hi') { bc.postMessage({ k: 'ho' }); open(); }
      else if (m.k === 'ho') open();
      else if (m.k === 'd' && opened && typeof m.s === 'string') (m.c === 'act' ? L.act : L.rel).dispatch('message', { data: m.s });
      else if (m.k === 'bye') { L.peerBye = true; L.act.close(); L.rel.close(); }
    };
    let n = 0; L.hiT = setInterval(() => { try { bc.postMessage({ k: 'hi' }); } catch (e) { /* ok */ } if (++n > 40) clearInterval(L.hiT); }, 200);
  }
  function localStop() { clearInterval(LC.presT); LC.presT = 0; clearTimeout(LC.joinTO); if (LC.disc) { try { LC.disc.close(); } catch (e) { /* ok */ } LC.disc = null; } LC.rid = ''; }
  const localApi = typeof BroadcastChannel === 'function' ? {
    host() {
      if (banGate()) return '';
      localStop(); begin('host');
      LC.rid = rndHex(4); const rid = LC.rid, d = LC.disc = new BroadcastChannel('nexa-local-v1');
      const present = () => { if (R.role === 'host' && R.links.length < cfg.maxPlayers - 1) { try { d.postMessage({ t: 'host', rid }); } catch (e) { /* ok */ } } };
      d.onmessage = (e) => {
        const m = e.data; if (!m || m.t !== 'join' || m.rid !== rid || typeof m.gid !== 'string' || !/^[0-9a-f]{8}$/.test(m.gid)) return;
        if (R.role !== 'host' || R.links.length >= cfg.maxPlayers - 1) return;
        const L = newLink('host', true);
        if (!attach(L)) { destroyLink(L); return; }
        localWire(L, 'nexa-lk-' + rid + '-' + m.gid); L.state = 'connecting'; startConnecting(L, 8000);
      };
      LC.presT = setInterval(present, 600); present();
      return rid;
    },
    join() {
      if (banGate()) return Promise.resolve(false);
      localStop(); begin('guest');
      return new Promise((resolve) => {
        const d = LC.disc = new BroadcastChannel('nexa-local-v1'); let done = false;
        const fin = (ok) => { if (done) return; done = true; clearTimeout(LC.joinTO); try { d.close(); } catch (e) { /* ok */ } if (LC.disc === d) LC.disc = null; if (!ok) closeAll(true); resolve(ok); };
        d.onmessage = (e) => {
          const m = e.data; if (done || !m || m.t !== 'host' || typeof m.rid !== 'string' || !/^[0-9a-f]{8}$/.test(m.rid)) return;
          const gid = rndHex(4), L = newLink('guest', true);
          if (!attach(L)) { destroyLink(L); fin(false); return; }
          localWire(L, 'nexa-lk-' + m.rid + '-' + gid); L.state = 'connecting'; startConnecting(L, 8000);
          try { d.postMessage({ t: 'join', rid: m.rid, gid }); } catch (er) { /* ok */ }
          fin(true);
        };
        LC.joinTO = setTimeout(() => fin(false), 5000);
      });
    },
    stop: localStop
  } : null;

  // ------------------------------------------------------------------ завершение
  function closeAll(silent) {
    localStop();
    const had = R.links.length > 0;
    R.links.slice().forEach((l) => { if (l.ready && !silent) sendLink(l, { type: 'bye' }); });
    R.links.slice().forEach((l) => { l.attached = false; destroyLink(l); });
    R.children.slice().forEach((ch) => { R.children.splice(R.children.indexOf(ch), 1); destroyLink(ch); });
    R.links = []; manual = null;
    voiceStop();
    R.role = null; R.mySlot = 0; R.players = []; R.speak = {}; cfg.maxPlayers = MAX_PLAYERS;
    if (had || state !== 'idle') { R.sticky = 'idle'; if (!silent) refreshState(); else state = 'idle'; }
  }
  const close = closeAll;
  window.addEventListener('pagehide', () => { R.links.forEach((l) => { if (l.ready) sendLink(l, { type: 'bye' }); }); });

  window.NexaNet = {
    probeNat, get natType() { return natType; }, VERSION, TELEGRAM, ICE_SERVERS, ICE_SERVERS_EXT, MSG, config: cfg, FAST, MAX_PLAYERS, MAX_BR, MAX_VOICE, setMax(n) { if (R.role !== 'guest') cfg.maxPlayers = Math.max(2, Math.min(MAX_BR, n | 0 || MAX_PLAYERS)); }, RELAY, DIRECT, PID: MYPID,
    supported: () => typeof RTCPeerConnection === 'function',
    canDeflate,
    get state() { return state; }, get role() { return R.role; }, get slot() { return slot(); }, get peer() { return others()[0] || null; }, get players() { return others(); },
    get isHost() { return R.role === 'host'; }, get isOpen() { return state === 'open'; }, get connected() { return isOpen(); },
    get count() { return R.role ? 1 + R.links.filter((l) => l.opened).length : 1; },
    get rtt() { return Math.round(rttMain()); }, linkStats: diag, pingText, get info() { const l = manual || R.links[0]; return l ? l.info : null; },
    get offerCode() { return manual ? manual.offerCode : ''; }, get answerCode() { return R.role === 'guest' && R.links[0] ? R.links[0].answerCode : ''; },
    get pending() { return !!manual; }, get pendingLinks() { return R.links.filter((l) => !l.opened).length; },
    stats: () => { let tx = 0, rx = 0, txB = 0, rxB = 0, up = 0; R.links.forEach((l) => { tx += l.tx; rx += l.rx; txB += l.txB; rxB += l.rxB; if (l.openAt) up = Math.max(up, Math.round((Date.now() - l.openAt) / 1000)); }); return { tx, rx, txB, rxB, rtt: Math.round(rttMain()), up }; },
    local: localApi, diag: diagLast, lastAttempt, candStats,
    createOffer, acceptAnswer, createAnswer, parse: parseInput, linkFor, pendingJoin, clearJoinFromUrl,
    sendAction, on, off, close, reset: () => closeAll(false), localInfo,
    kick, kickWhere, banGate, setMuted, isMuted, report, isBlockedName, begin,
    setLan(v) { lsSet('nexaNetLan', v ? '1' : '0'); }, get lan() { return localMode(); },
    text: (code) => MSG[code] || String(code || ''),
    chat: { send: chatSend, get history() { return chat.history; }, sys: chatSys, clean: cleanChat, clear() { chat.history.length = 0; } },
    voice: { enable: voiceEnable, disable: voiceDisable, setMuted: voiceSetMuted, setVolume: voiceSetVolume, incoming: voiceIncoming, get state() { return voiceState(); }, unlock: playRemote },
    // низкоуровневый доступ для js/rendezvous.js: соединения без ручных кодов
    rtc: { newOffer, newAnswer, applyAnswer, attach, attachChild, childFree: () => (R.role === 'guest' && R.links[0] && R.links[0].opened ? Math.max(0, MAX_KIDS - R.children.length) : 0), drop: dropLink, connecting: startConnecting, fullSdp: true, free: () => (R.role === 'guest' ? (R.links.length ? 0 : 1) : Math.max(0, cfg.maxPlayers - 1 - R.links.length)) },
    util: { scrub, cleanName, cleanChat, cleanColor, cleanPid, shrinkSdp, packCode, crc16, rndHex },
    log: () => logBuf.slice()
  };
}());
