// NEXA/OS: сетевое ядро онлайн-режима — Serverless WebRTC (без сигнального сервера, без бэкенда).
// Рукопожатие вручную: Хост создаёт ПРИГЛАШЕНИЕ (Offer) -> ссылка ?join=<код>, друг присылает ОТВЕТ (Answer) -> Хост вставляет его и соединяется.
//   • Код — компактный Base64url: «NX1O.<данные>» (O — Offer, A — Answer; версия протокола 1). Данные = [флаги][JSON {sid, sdp}][CRC16], JSON сжат deflate-raw
//     (CompressionStream), если браузер умеет; иначе — обычный Base64 без сжатия. Из SDP убраны лишние строки и адреса (см. shrinkSdp).
//   • Публичные STUN Google; страховка setTimeout 2.5 с: если сбор ICE затянулся, код выдаётся из того, что уже собрано.
//   • Каналы: 'act' (быстрые состояния, unordered, maxRetransmits 0: позиции) и 'rel' (надёжный: выстрелы, эмоции, чат, лобби, профиль, переговоры SDP).
//   • sendAction(data) — единая точка отправки JSON-пакета {type, n, ts, ...}; приём — NexaNet.on(type, fn).
//   • Голос: микрофон -> addTrack (согласование по каналу 'rel', поэтому код приглашения остаётся коротким); текстовый чат с санитайзингом и антифлудом.
// ПРИВАТНОСТЬ: IP-адреса нигде не показываются и не пишутся в журнал (scrub); в код приглашения попадают только srflx/relay-кандидаты (host/mDNS — только в
// режиме LAN). Но при прямом P2P браузер собеседника технически видит ваш сетевой адрес — это свойство WebRTC; скрыть его без TURN-сервера нельзя.
(function () {
  'use strict';

  const VERSION = 1;
  const TELEGRAM = 'https://t.me/nexaindustries';
  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  const FAST = { pos: 1, ping: 1, pong: 1, snap: 1, aim: 1 };            // типы пакетов по ненадёжному каналу 'act' (остальные — по 'rel')
  const MAX_ACT = 8 * 1024, MAX_REL = 96 * 1024, CHAT_MAX = 200;
  const cfg = { forceMs: 2500, connectMs: 25000, guestWaitMs: 180000, silentMs: 7000, pingMs: 2000, iceServers: ICE_SERVERS };

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
    CHAT_FLOOD: 'Slow down — too many messages.',
    CHAT_EMPTY: 'Type a message first.',
    CHAT_OFFLINE: 'Connect to a friend to chat.'
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
  function shrinkSdp(sdp, keepLocal) {
    const lines = sdp.split(/\r?\n/).filter(Boolean);
    const wantLocal = keepLocal || localMode();
    const pub = lines.filter((l) => { const c = candParts(l); return c && c.proto === 'udp' && (c.typ === 'srflx' || c.typ === 'relay'); }).length;
    const useLocal = wantLocal || pub === 0;
    let kept = 0;
    const out = [];
    lines.forEach((l) => {
      if (/^a=(extmap-allow-mixed|msid-semantic)/.test(l)) return;
      if (l.indexOf('a=candidate:') === 0) {
        const c = candParts(l);
        if (!c || c.proto !== 'udp') return;
        if (c.typ === 'srflx' || c.typ === 'relay' || (useLocal && c.typ === 'host')) { kept += 1; out.push(l); }
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

  // ------------------------------------------------------------------ состояние соединения
  // idle -> creating -> waiting-answer | answering -> connecting -> open <-> lost -> closed | failed
  const S = {
    state: 'idle', role: null, sid: '', pc: null, act: null, rel: null, seq: 0, lastN: {}, lastRx: 0, openAt: 0, rtt: 0, rttMin: 0,
    polite: false, making: false, ignoreOffer: false, ready: false, pingT: 0, watchT: 0, connT: 0, restartT: 0, peer: null, tx: 0, rx: 0, txB: 0, rxB: 0,
    rate: { t: 0, n: 0 }, info: null, intentional: false, offerCode: '', answerCode: ''
  };
  function setState(st, code) {
    if (S.state === st && !code) return;
    const prev = S.state;
    S.state = st;
    log('state ' + prev + ' -> ' + st + (code ? ' (' + code + ')' : ''));
    emit('net:state', { state: st, prev, code: code || null, text: code ? MSG[code] || '' : '' });
  }
  const isOpen = () => S.state === 'open' || S.state === 'lost';

  function newPC() {
    const pc = new RTCPeerConnection({ iceServers: cfg.iceServers, bundlePolicy: 'max-bundle', iceCandidatePoolSize: 0 });
    pc.addEventListener('connectionstatechange', () => onPcState(pc));
    pc.addEventListener('iceconnectionstatechange', () => onPcState(pc));
    pc.addEventListener('negotiationneeded', () => negotiate(pc));
    pc.addEventListener('track', (e) => onTrack(pc, e));
    return pc;
  }
  function mkChannels(pc) {
    const act = pc.createDataChannel('act', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
    const rel = pc.createDataChannel('rel', { negotiated: true, id: 2, ordered: true });
    [act, rel].forEach((ch) => {
      ch.addEventListener('open', () => { if (S.pc === pc) checkOpen(); });
      ch.addEventListener('close', () => { if (S.pc === pc) onChannelClose(); });
      ch.addEventListener('message', (e) => { if (S.pc === pc) onMessage(e.data, ch === act); });
    });
    S.act = act; S.rel = rel;
  }
  function checkOpen() {
    if (!S.act || !S.rel || S.act.readyState !== 'open' || S.rel.readyState !== 'open' || S.ready) return;
    S.ready = true; S.openAt = Date.now(); S.lastRx = now();
    clearTimeout(S.connT);
    setState('open');
    sendAction({ type: 'hello', info: localInfo() });
    S.pingT = setInterval(pingTick, cfg.pingMs);
    S.watchT = setInterval(watchTick, 1000);
    pingTick();
    emit('net:open', { role: S.role, slot: slot() });
  }
  const slot = () => (S.role === 'host' ? 1 : S.role === 'guest' ? 2 : 0);
  function onPcState(pc) {
    if (S.pc !== pc) return;
    const cs = pc.connectionState || '', ic = pc.iceConnectionState || '';
    if (cs === 'failed' || ic === 'failed') {
      if (S.ready) { if (S.role === 'host' && !S.restartT) tryRestart(); else if (!S.restartT) markLost(); }
      // до открытия каналов 'failed' не окончателен: у гостя проверки ICE начинаются раньше, чем Хост вставит ответ; решает таймер соединения
    } else if (cs === 'disconnected' || ic === 'disconnected') {
      if (S.ready) { markLost(); if (S.role === 'host' && !S.restartT) S.restartT = setTimeout(tryRestart, 3500); }
    } else if ((cs === 'connected' || ic === 'connected' || ic === 'completed') && S.ready && S.state === 'lost') {
      clearTimeout(S.restartT); S.restartT = 0; S.lastRx = now(); setState('open');
    } else if (cs === 'closed' && !S.intentional && S.state !== 'idle' && S.state !== 'closed') {
      finishClose('CLOSED');
    }
  }
  function markLost() { if (S.state === 'open') setState('lost', 'PEER_SILENT'); }
  function tryRestart() {
    S.restartT = 0;
    const pc = S.pc; if (!pc || !S.ready || S.state === 'closed') return;
    if (pc.connectionState === 'connected' && S.state === 'open') return;
    try { pc.restartIce(); log('ice restart'); } catch (e) { /* старый браузер */ }
    setTimeout(() => { if (S.pc === pc && S.state === 'lost' && (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed')) finishClose('ICE_FAILED'); }, 12000);
  }
  function onChannelClose() {
    if (!S.ready || S.intentional || S.state === 'closed') return;
    setTimeout(() => { if (S.ready && S.rel && S.rel.readyState !== 'open' && S.state !== 'closed' && !S.intentional) finishClose(S.peerBye ? 'PEER_LEFT' : 'CLOSED'); }, 1500);
  }
  function fail(code) {
    cleanup();
    setState('failed', code);
    emit('net:error', { code, text: MSG[code] || '' });
  }
  function finishClose(code) {
    cleanup();
    setState('closed', code);
    emit('net:close', { code, text: MSG[code] || '' });
  }
  function cleanup() {
    clearInterval(S.pingT); clearInterval(S.watchT); clearTimeout(S.connT); clearTimeout(S.restartT);
    S.pingT = S.watchT = S.connT = S.restartT = 0;
    voiceStop();
    const pc = S.pc;
    S.pc = null;
    if (pc) { try { pc.close(); } catch (e) { /* уже закрыто */ } }
    [S.act, S.rel].forEach((ch) => { try { ch && ch.close(); } catch (e) { /* уже закрыто */ } });
    S.act = S.rel = null; S.ready = false; S.making = false; S.lastN = {}; S.rtt = 0;
  }

  // ------------------------------------------------------------------ рукопожатие вручную
  function gather(pc, t0) {
    return new Promise((resolve) => {
      let done = false, t = 0;
      const fin = (forced) => {
        if (done) return;
        done = true; clearTimeout(t);
        pc.removeEventListener('icegatheringstatechange', chk); pc.removeEventListener('icecandidate', onc);
        resolve({ sdp: (pc.localDescription && pc.localDescription.sdp) || '', forced });
      };
      const chk = () => { if (pc.iceGatheringState === 'complete') fin(false); };
      const onc = (e) => { if (!e.candidate) fin(false); };
      pc.addEventListener('icegatheringstatechange', chk); pc.addEventListener('icecandidate', onc);
      t = setTimeout(() => fin(true), Math.max(0, cfg.forceMs - (Date.now() - t0)));   // страховка 2.5 с (от начала создания кода): затянувшийся сбор ICE не должен блокировать выдачу
      chk();
    });
  }
  function linkFor(code) {
    let base = '';
    try { base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : String(location.href).split(/[?#]/)[0]; } catch (e) { base = ''; }
    return base ? base + '?join=' + code : code;
  }
  function begin(role) {
    close(true);
    S.role = role; S.polite = role === 'guest'; S.intentional = false; S.peerBye = false; S.info = null; S.peer = null; S.seq = 0;
    S.pc = newPC(); mkChannels(S.pc);
    return S.pc;
  }
  function armConnectTimer(ms) {
    clearTimeout(S.connT);
    S.connT = setTimeout(() => { if (!S.ready && (S.state === 'answering' || S.state === 'connecting')) fail('CONNECT_TIMEOUT'); }, ms);
  }

  async function createOffer() {
    if (typeof RTCPeerConnection !== 'function') { setState('failed', 'UNSUPPORTED'); return { ok: false, err: 'UNSUPPORTED' }; }
    const pc = begin('host');
    S.sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    setState('creating');
    const t0 = Date.now();
    try {
      await pc.setLocalDescription(await pc.createOffer());
      const g = await gather(pc, t0);
      if (S.pc !== pc) return { ok: false, err: 'CLOSED' };
      const sh = shrinkSdp(g.sdp);
      const code = await packCode('O', { s: S.sid, d: sh.sdp });
      S.offerCode = code; S.info = { forced: g.forced, onlyLocal: sh.onlyLocal, cands: sh.cands };
      setState('waiting-answer', g.forced ? 'GATHER_FORCED' : (sh.onlyLocal ? 'NO_PUBLIC' : null));
      return { ok: true, code, link: linkFor(code), forced: g.forced, onlyLocal: sh.onlyLocal, chars: code.length };
    } catch (e) { log('offer error ' + (e && e.name)); fail('ICE_FAILED'); return { ok: false, err: 'ICE_FAILED' }; }
  }

  async function acceptAnswer(text) {
    const p = await parseInput(text);
    if (!p.ok) return p;
    if (p.kind !== 'A') return { ok: false, err: 'WRONG_KIND_A' };
    if (S.role !== 'host' || !S.pc || S.state !== 'waiting-answer') return { ok: false, err: 'NOT_WAITING' };
    if (p.sid !== S.sid) return { ok: false, err: 'WRONG_SESSION' };
    try {
      await S.pc.setRemoteDescription({ type: 'answer', sdp: p.sdp });
      setState('connecting'); armConnectTimer(cfg.connectMs);
      return { ok: true };
    } catch (e) { log('answer error ' + (e && e.name)); return { ok: false, err: 'BAD_DATA' }; }
  }

  async function createAnswer(text) {
    if (typeof RTCPeerConnection !== 'function') { setState('failed', 'UNSUPPORTED'); return { ok: false, err: 'UNSUPPORTED' }; }
    const p = await parseInput(text);
    if (!p.ok) return p;
    if (p.kind !== 'O') return { ok: false, err: 'WRONG_KIND_O' };
    const pc = begin('guest');
    S.sid = p.sid;
    setState('answering');
    const t0 = Date.now();
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      const g = await gather(pc, t0);
      if (S.pc !== pc) return { ok: false, err: 'CLOSED' };
      const sh = shrinkSdp(g.sdp);
      const code = await packCode('A', { s: S.sid, d: sh.sdp });
      S.answerCode = code; S.info = { forced: g.forced, onlyLocal: sh.onlyLocal, cands: sh.cands };
      armConnectTimer(cfg.guestWaitMs);
      emit('net:answer', { code });
      if (g.forced) log('answer: gather forced');
      return { ok: true, code, forced: g.forced, onlyLocal: sh.onlyLocal, chars: code.length };
    } catch (e) { log('answer gen error ' + (e && e.name)); fail('BAD_DATA'); return { ok: false, err: 'BAD_DATA' }; }
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

  // ------------------------------------------------------------------ перегооворы по каналу 'rel' (голос, перезапуск ICE): «perfect negotiation»
  async function negotiate(pc) {
    if (S.pc !== pc || !S.ready || S.making) return;
    try {
      S.making = true;
      await pc.setLocalDescription();
      sendAction({ type: 'sdp', desc: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
    } catch (e) { log('negotiate error ' + (e && e.name)); } finally { S.making = false; }
  }
  async function onSdp(p) {
    const pc = S.pc, d = p && p.desc;
    if (!pc || !d || (d.type !== 'offer' && d.type !== 'answer') || typeof d.sdp !== 'string') return;
    try {
      const collision = d.type === 'offer' && (S.making || pc.signalingState !== 'stable');
      S.ignoreOffer = !S.polite && collision;
      if (S.ignoreOffer) return;
      await pc.setRemoteDescription({ type: d.type, sdp: d.sdp });
      if (d.type === 'offer') {
        await pc.setLocalDescription();
        sendAction({ type: 'sdp', desc: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      }
    } catch (e) { log('sdp error ' + (e && e.name)); }
  }

  // ------------------------------------------------------------------ отправка / приём
  function localInfo() {
    let i = null;
    try { i = window.NexaProfile && NexaProfile.publicInfo ? NexaProfile.publicInfo() : null; } catch (e) { i = null; }
    i = i || { name: 'PLAYER', color: '#ff3b30', level: 1 };
    return { name: cleanName(i.name), color: cleanColor(i.color), level: Math.max(1, Math.min(999, i.level | 0 || 1)), v: VERSION, lang: (window.I18N && I18N.lang) || 'en' };
  }
  // единая точка отправки: {type, n (номер), ts (время), ...поля}. Быстрые типы идут по 'act' (без повторов), остальные — по 'rel'.
  function sendAction(data, opts) {
    if (!data || typeof data.type !== 'string') return false;
    const fast = opts && opts.fast !== undefined ? !!opts.fast : !!FAST[data.type];
    const ch = fast ? S.act : S.rel;
    if (!ch || ch.readyState !== 'open') return false;
    if (fast && ch.bufferedAmount > 64 * 1024) return false;   // канал забит: свежее состояние важнее старого
    const pkt = Object.assign({}, data);
    pkt.n = ++S.seq; pkt.ts = Date.now();
    let s;
    try { s = JSON.stringify(pkt); ch.send(s); } catch (e) { return false; }
    S.tx += 1; S.txB += s.length;
    return true;
  }
  function onMessage(raw, fast) {
    if (typeof raw !== 'string' || raw.length > (fast ? MAX_ACT : MAX_REL)) return;
    const t = now();
    if (t - S.rate.t > 1000) { S.rate.t = t; S.rate.n = 0; }
    if (++S.rate.n > 400) return;                              // защита от залпа пакетов от чужого клиента
    let p;
    try { p = JSON.parse(raw); } catch (e) { return; }
    if (!p || typeof p.type !== 'string' || p.type.length > 24 || typeof p.n !== 'number') return;
    if (fast) { if (p.n <= (S.lastN[p.type] || 0)) return; S.lastN[p.type] = p.n; }
    S.lastRx = t; S.rx += 1; S.rxB += raw.length;
    if (S.state === 'lost') setState('open');
    switch (p.type) {
      case 'ping': sendAction({ type: 'pong', t: p.t }); return;
      case 'pong': if (typeof p.t === 'number') { const r = Math.max(0, now() - p.t); S.rtt = S.rtt ? S.rtt * 0.7 + r * 0.3 : r; S.rttMin = S.rttMin ? Math.min(S.rttMin, r) : r; emit('net:rtt', Math.round(S.rtt)); } return;
      case 'sdp': onSdp(p); return;
      case 'bye': S.peerBye = true; finishClose('PEER_LEFT'); return;
      case 'hello': onHello(p); return;
      case 'chat': onChat(p); return;
      case 'vox': remoteSpeaking(!!p.on, !!p.muted); return;
      default: emit(p.type, p);
    }
  }
  function onHello(p) {
    const i = p.info || {};
    S.peer = { name: cleanName(i.name, 'PLAYER 2'), color: cleanColor(i.color), level: Math.max(1, Math.min(999, i.level | 0 || 1)), v: i.v | 0, lang: String(i.lang || '').slice(0, 2) };
    chatSys(S.role === 'host' ? 'FRIEND_JOINED' : 'HOST_READY', S.peer.name);
    emit('net:peer', S.peer);
  }
  function pingTick() { sendAction({ type: 'ping', t: now() }); }
  function watchTick() {
    if (!S.ready) return;
    if (now() - S.lastRx > cfg.silentMs) markLost();
    if (S.openAt) emit('net:tick', { up: Math.round((Date.now() - S.openAt) / 1000) });
  }

  // ------------------------------------------------------------------ текстовый чат
  const chat = { history: [], seen: 0, sent: [], got: [] };
  function pushChat(m) { chat.history.push(m); if (chat.history.length > 120) chat.history.shift(); emit('net:chat', m); return m; }
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
    pushChat({ id: 'm' + n + Math.random(), from: 'me', name: me.name, color: me.color, text: t, ts: n });
    try { window.NexaProfile && NexaProfile.count('msgSent'); } catch (e) { /* профиль не обязателен */ }
    return { ok: true, text: t };
  }
  function onChat(p) {
    const t = cleanChat(p.text), n = Date.now();
    if (!t) return;
    chat.got = chat.got.filter((x) => n - x < 10000);
    if (chat.got.length >= 10) return;                         // антифлуд на приёме
    chat.got.push(n);
    const pr = S.peer || { name: 'PLAYER 2', color: '#ffffff' };
    pushChat({ id: 'p' + n + Math.random(), from: 'peer', name: pr.name, color: pr.color, text: t, ts: n });
    try { window.NexaProfile && NexaProfile.count('msgGot'); } catch (e) { /* профиль не обязателен */ }
  }

  // ------------------------------------------------------------------ голос (микрофон -> addTrack, приём -> <audio>)
  const V = { mic: false, muted: false, volume: 1, speaking: false, peerSpeaking: false, peerMuted: false, blocked: false, err: null, stream: null, track: null, sender: null,
    actx: null, an: null, buf: null, remote: null, el: null, meterT: 0, level: 0, remoteSrc: null, loud: 0, quiet: 0 };
  function voiceEvt() { emit('net:voice', voiceState()); }
  function voiceState() { return { mic: V.mic, muted: V.muted, volume: V.volume, speaking: V.speaking, peerSpeaking: V.peerSpeaking, peerMuted: V.peerMuted, hasRemote: !!V.remote, blocked: V.blocked, err: V.err, level: V.level }; }
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
      const src = ac.createMediaStreamSource(V.stream);
      V.an = ac.createAnalyser(); V.an.fftSize = 512; V.buf = new Uint8Array(V.an.fftSize);
      src.connect(V.an);                                          // к выходу НЕ подключаем: собственный голос в динамики не идёт
      V.meterT = setInterval(meterTick, 100);
    } catch (e) { V.an = null; }
  }
  async function voiceEnable() {
    V.err = null;
    if (!isOpen() || !S.pc) { V.err = 'NOT_CONNECTED'; voiceEvt(); return { ok: false, err: 'NOT_CONNECTED' }; }
    if (V.mic) return { ok: true };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { V.err = 'MIC_UNSUPPORTED'; voiceEvt(); return { ok: false, err: V.err }; }
    try {
      V.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (e) {
      const n = e && e.name;
      V.err = n === 'NotAllowedError' || n === 'SecurityError' ? 'MIC_DENIED' : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'MIC_NONE' : 'MIC_FAIL';
      voiceEvt(); return { ok: false, err: V.err };
    }
    if (!S.pc) { V.stream.getTracks().forEach((t) => t.stop()); V.stream = null; V.err = 'NOT_CONNECTED'; voiceEvt(); return { ok: false, err: V.err }; }
    V.track = V.stream.getAudioTracks()[0];
    if (!V.track) { V.err = 'MIC_NONE'; voiceEvt(); return { ok: false, err: V.err }; }
    V.track.enabled = !V.muted;
    V.sender = S.pc.addTrack(V.track, V.stream);                  // согласование уйдёт по каналу 'rel' (negotiationneeded)
    V.mic = true;
    startMeter();
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
  function voiceSetVolume(v) {
    V.volume = Math.max(0, Math.min(1, +v || 0));
    if (V.el) V.el.volume = V.volume;
    voiceEvt();
  }
  function voiceDisable() {
    if (V.sender && S.pc) { try { S.pc.removeTrack(V.sender); } catch (e) { /* уже удалён */ } }
    if (V.stream) V.stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* ignore */ } });
    clearInterval(V.meterT); V.meterT = 0; V.an = null;
    V.stream = V.track = V.sender = null; V.mic = false; V.speaking = false; V.level = 0;
    sendAction({ type: 'vox', on: false, muted: true });
    voiceEvt();
  }
  function voiceStop() {
    voiceDisable();
    if (V.el) { try { V.el.pause(); V.el.srcObject = null; } catch (e) { /* ignore */ } }
    V.remote = null; V.peerSpeaking = false; V.blocked = false; V.err = null;
    if (V.actx) { try { V.actx.close(); } catch (e) { /* ignore */ } V.actx = null; }
    voiceEvt();
  }
  function remoteSpeaking(on, muted) { if (V.peerSpeaking !== on || V.peerMuted !== muted) { V.peerSpeaking = on && !muted; V.peerMuted = muted; voiceEvt(); } }
  function playRemote() {
    if (!V.el) return;
    let pr;
    try { pr = V.el.play(); } catch (e) { pr = null; }
    if (pr && pr.then) pr.then(() => { if (V.blocked) { V.blocked = false; voiceEvt(); } }, () => { V.blocked = true; voiceEvt(); });
  }
  function onTrack(pc, e) {
    if (S.pc !== pc || e.track.kind !== 'audio') return;
    V.remote = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
    if (!V.el) {
      V.el = document.createElement('audio');
      V.el.autoplay = true; V.el.setAttribute('playsinline', ''); V.el.hidden = true; V.el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(V.el);
    }
    V.el.srcObject = V.remote; V.el.volume = V.volume;
    playRemote();
    voiceEvt();
  }
  // любой жест игрока разблокирует автоплей голоса друга
  ['pointerdown', 'keydown'].forEach((n) => document.addEventListener(n, () => { if (V.blocked) playRemote(); if (V.actx && V.actx.state === 'suspended') { try { V.actx.resume(); } catch (e) { /* ignore */ } } }, true));

  // ------------------------------------------------------------------ завершение
  function close(silent) {
    const had = S.pc || S.ready;
    if (S.ready && !silent) sendAction({ type: 'bye' });
    S.intentional = true;
    cleanup();
    S.role = null; S.offerCode = S.answerCode = '';
    if (had || S.state !== 'idle') { if (!silent) { setState('idle'); } else S.state = 'idle'; }
  }
  window.addEventListener('pagehide', () => { if (S.ready) sendAction({ type: 'bye' }); });

  window.NexaNet = {
    VERSION, TELEGRAM, ICE_SERVERS, MSG, config: cfg, FAST,
    supported: () => typeof RTCPeerConnection === 'function',
    canDeflate,
    get state() { return S.state; }, get role() { return S.role; }, get slot() { return slot(); }, get peer() { return S.peer; },
    get isHost() { return S.role === 'host'; }, get isOpen() { return S.state === 'open'; }, get connected() { return isOpen(); },
    get rtt() { return Math.round(S.rtt); }, get info() { return S.info; },
    get offerCode() { return S.offerCode; }, get answerCode() { return S.answerCode; },
    stats: () => ({ tx: S.tx, rx: S.rx, txB: S.txB, rxB: S.rxB, rtt: Math.round(S.rtt), up: S.openAt ? Math.round((Date.now() - S.openAt) / 1000) : 0 }),
    createOffer, acceptAnswer, createAnswer, parse: parseInput, linkFor, pendingJoin, clearJoinFromUrl,
    sendAction, on, off, close, reset: () => close(false), localInfo,
    setLan(v) { lsSet('nexaNetLan', v ? '1' : '0'); }, get lan() { return localMode(); },
    text: (code) => MSG[code] || String(code || ''),
    chat: { send: chatSend, get history() { return chat.history; }, sys: chatSys, clean: cleanChat, clear() { chat.history.length = 0; } },
    voice: { enable: voiceEnable, disable: voiceDisable, setMuted: voiceSetMuted, setVolume: voiceSetVolume, get state() { return voiceState(); }, unlock: playRemote },
    util: { scrub, cleanName, cleanChat, cleanColor, shrinkSdp, packCode, crc16 },
    log: () => logBuf.slice()
  };
}());
