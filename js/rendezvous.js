// NEXA/OS: «почтовый ящик» для автоматического рукопожатия WebRTC — публичные открытые WebSocket-трекеры протокола WebTorrent (без аккаунтов, ключей и оплаты).
// Через трекер ходят ТОЛЬКО служебные SDP offer/answer; игра, чат и голос идут напрямую (P2P, RTCDataChannel/медиа). Без трекеров игра работает через ручные коды (net.js).
//   • Rendezvous(theme, opts) — announce-протокол JSON поверх WebSocket (минимальная реализация, без библиотек); транспорт заменяемый (WebTorrentTransport).
//     info_hash = SHA-1('nexa-hl-v1/' + тема) (20-байтная binary string), peer_id = 20 случайных байт. announce {action:'announce', info_hash, peer_id, numwant, offers:[…],
//     uploaded:0, downloaded:0, left:1, event:'started'}; входящий offer -> answer {…, to_peer_id, offer_id, answer}; входящий answer -> завершить соединение.
//   • NexaRoom: комната по ссылке ?room=<id> (хост отвечает, гость предлагает), приватная комната по имени, публичные комнаты (gossip-рой 'lobby': пиры
//     обмениваются списком открытых комнат по DataChannel), «Быстрая игра» (очередь 'quick/<режим>': меньший peer_id — хост).
// Список трекеров настраивается: ?tracker=ws://127.0.0.1:PORT (можно через запятую) или localStorage 'nexaTrackers'; по умолчанию — только заведомо бесплатные открытые
// трекеры без планов и квот. Трекеры могут быть недоступны или отключать клиентов по своим правилам — ручной режим (коды) от них не зависит и работает всегда.
// ПРИВАТНОСТЬ: трекеры и незнакомые игроки технически видят сетевой адрес (WebRTC); IP нигде не показывается в интерфейсе/журнале (scrub); все данные из сети
// валидируются и санитайзятся; публичный чат не модерируется (заглушить/пожаловаться — локально).
(function () {
  'use strict';
  const NN = window.NexaNet;
  if (!NN) return;
  const DEFAULT_TRACKERS = ['wss://tracker.openwebtorrent.com', 'wss://tracker.webtorrent.dev'];
  const OPTIONAL_TRACKERS = ['wss://tracker.files.fm:7073/announce'];   // НЕ по умолчанию: у сервиса есть тарифы — включайте сами через ?tracker=/localStorage, если согласны
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
    ROOM_GONE: 'The room is no longer available.',
    QUICK_TIMEOUT: 'No players found right now. Create a public room and wait for others.',
    PUBLIC_OFF: 'Public rooms need your consent first.'
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

  // ------------------------------------------------------------------ список трекеров
  function validTracker(u) {
    let url; try { url = new URL(u); } catch (e) { return false; }
    if (url.protocol === 'wss:') return true;
    return url.protocol === 'ws:' && /^(127\.0\.0\.1|localhost|\[::1\])$/.test(url.hostname);   // ws:// — только петля (тесты); публичные — только wss://
  }
  function trackerList() {
    let list = null;
    try {
      const q = new URLSearchParams(location.search).getAll('tracker').join(',');
      if (q) list = q.split(',');
    } catch (e) { list = null; }
    if (!list) {
      const s = lsGet('nexaTrackers');
      if (s) { try { const j = JSON.parse(s); list = Array.isArray(j) ? j : String(s).split(','); } catch (e) { list = String(s).split(','); } }
    }
    list = (list || DEFAULT_TRACKERS).map((x) => String(x).trim()).filter((x) => x && validTracker(x));
    return Array.from(new Set(list)).slice(0, 6);
  }

  // ------------------------------------------------------------------ транспорт WebTorrent-трекеров (заменяемый: достаточно тех же методов)
  class WebTorrentTransport {
    constructor(urls, hooks) { this.urls = urls; this.h = hooks; this.socks = []; this.closed = false; this.q = []; this.offerSock = new Map(); }
    open() { this.urls.forEach((u) => this.connect({ url: u, state: 'connecting', ws: null, tries: 0 })); }
    connect(t) {
      if (this.closed) return;
      if (!this.socks.includes(t)) this.socks.push(t);
      let ws;
      try { ws = new WebSocket(t.url); } catch (e) { t.state = 'error'; this.h.status(); return; }
      t.ws = ws; t.state = 'connecting'; t.tries += 1;
      const timer = setTimeout(() => { if (t.state === 'connecting') { t.state = 'error'; try { ws.close(); } catch (e) { /* ok */ } this.h.status(); } }, 6000);
      ws.onopen = () => { clearTimeout(timer); t.state = 'open'; this.h.status(); this.h.open(t); };
      ws.onerror = () => { clearTimeout(timer); if (t.state !== 'open') { t.state = 'error'; this.h.status(); } };
      ws.onclose = () => {
        clearTimeout(timer);
        const was = t.state; t.state = was === 'open' ? 'closed' : 'error'; this.h.status();
        if (!this.closed && t.tries < 3) setTimeout(() => { if (!this.closed && t.state !== 'open') this.connect(t); }, 3000 * t.tries);   // мягкое переподключение, потом отваливаемся
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string' || e.data.length > 64 * 1024) return;
        let m; try { m = JSON.parse(e.data); } catch (er) { return; }
        if (!m || typeof m !== 'object') return;
        if (m['failure reason']) { t.state = 'error'; this.h.status(); return; }
        if (m.action !== 'announce' || typeof m.info_hash !== 'string') return;
        if (m.offer && typeof m.offer_id === 'string') this.offerSock.set(m.offer_id, t);
        this.h.message(m, t);
      };
    }
    send(t, obj) { if (t.ws && t.state === 'open') { try { t.ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; } } return false; }
    announce(obj) { let n = 0; this.socks.forEach((t) => { if (this.send(t, obj)) n += 1; }); return n; }
    answer(obj, offerId) {
      const t = this.offerSock.get(offerId);
      if (t && this.send(t, obj)) return true;
      return this.announce(obj) > 0;
    }
    states() { return this.socks.map((t) => t.state); }
    close() { this.closed = true; this.socks.forEach((t) => { try { t.ws && t.ws.close(); } catch (e) { /* ok */ } }); this.socks = []; }
  }

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
      this.theme = theme; this.mode = opts.mode || 'both'; this.o = opts; this.peerId = randBin(20); this.hash = ''; this.running = false;
      this.pend = new Map(); this.seen = new Set(); this.timer = 0; this.pollT = 0; this.tr = null; this.busy = false; this.lastAns = 0;
      this.transportFactory = opts.transport || ((urls, hooks) => new WebTorrentTransport(urls, hooks));
      this.trackers = opts.trackers || trackerList();
    }
    async start() {
      this.running = true;
      this.hash = await infoHash(this.theme);
      if (!this.running) return;
      this.tr = this.transportFactory(this.trackers, {
        status: () => this.status(),
        open: () => { this.announce(true); },
        message: (m, t) => this.onMessage(m, t)
      });
      this.tr.open();
      this.startedAt = now();
      this.timer = setInterval(() => this.tick(), 3500);
      this.status();
    }
    status() {
      if (!this.tr) return;
      const st = this.tr.states(), up = st.filter((s) => s === 'open').length;
      this.up = up;
      try { this.o.onStatus && this.o.onStatus({ up, total: st.length, states: st, ms: now() - (this.startedAt || now()) }); } catch (e) { /* ok */ }
    }
    async announce(first) {
      if (!this.running || !this.tr || this.busy) return;
      this.busy = true;
      try {
        const msg = { action: 'announce', info_hash: this.hash, peer_id: this.peerId, numwant: this.mode === 'answerer' ? 10 : 5, uploaded: 0, downloaded: 0, left: this.mode === 'answerer' ? 0 : 1 };
        if (first || !this.sentFirst) { msg.event = 'started'; }
        const want = this.mode === 'answerer' ? 0 : Math.max(0, Math.min(5, this.o.offerCount ? this.o.offerCount() : 0) - this.pend.size);
        const offers = [];
        for (let i = 0; i < want; i += 1) {
          const r = await this.o.makeOffer();
          if (!r || !this.running) break;
          const id = toHex(randBin(10));          // 20 hex-символов (binary string)
          this.pend.set(id, { token: r.token, t: now() });
          offers.push({ offer_id: id, offer: { type: 'offer', sdp: r.sdp } });
        }
        msg.offers = offers;
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
        if (this.seen.has(m.offer_id)) return;
        this.seen.add(m.offer_id); if (this.seen.size > 400) this.seen.clear();
        if (this.mode === 'both' && this.o.beacon && o.sdp.indexOf('a=nexa-quick') >= 0) { try { this.o.onBeacon && this.o.onBeacon(pid); } catch (e) { /* ok */ } return; }
        if (this.o.accept && !this.o.accept(pid)) return;
        if (now() - this.lastAns < 400) return;       // не больше ~2 ответов в секунду (антиспам: чужие offer'ы дорого обрабатывать)
        this.lastAns = now();
        let r = null;
        try { r = await this.o.onOffer(o.sdp, pid, m); } catch (e) { r = null; }
        if (!r || !this.running) { if (r && this.o.dropToken) this.o.dropToken(r.token); return; }
        this.tr.answer({ action: 'announce', info_hash: this.hash, peer_id: this.peerId, to_peer_id: pid, offer_id: m.offer_id, answer: { type: 'answer', sdp: r.sdp } }, m.offer_id);
      } else if (m.answer && typeof m.offer_id === 'string') {
        const p = this.pend.get(m.offer_id), a = m.answer;
        if (!p || !a || a.type !== 'answer' || typeof a.sdp !== 'string' || a.sdp.length > 24000) return;
        this.pend.delete(m.offer_id);
        try { await this.o.onAnswer(p.token, a.sdp, pid); } catch (e) { /* ok */ }
      }
    }
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
  const J = { id: '', t0: 0, stage: '', timer: 0 };

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

  // ---- Хост: комната (ссылка / по имени / публичная). Хост — только отвечает на offer'ы гостей.
  async function hostRoom(opts) {
    opts = opts || {};
    stopHost();
    const id = opts.id ? roomName(opts.id) : newRoomId();
    if (!id) return { ok: false, err: 'ROOM_NAME_BAD' };
    if (typeof RTCPeerConnection !== 'function') return { ok: false, err: 'UNSUPPORTED' };
    NN.begin('host');
    Object.assign(H, { id, pub: !!opts.pub, title: String(opts.title || '').slice(0, 24), mode: opts.mode === 'mission' ? 'mission' : 'sandbox', mission: Math.max(1, Math.min(47, opts.mission | 0 || 1)) });
    H.startedAt = now();
    const r = hostR = new Rendezvous('room/' + id, {
      mode: 'answerer',
      onStatus: (s) => emit('status', Object.assign({ kind: 'host' }, s)),
      accept: () => NN.rtc.free() > 0 && pendingLinks() < 3,
      onOffer: async (sdp) => {
        if (NN.rtc.free() <= 0) return null;
        const a = await NN.rtc.newAnswer('host', sdp);
        if (!a) return null;
        if (!NN.rtc.attach(a.link)) { NN.rtc.drop(a.link); return null; }
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
  const pendingLinks = () => { try { return NN.players.length ? Math.max(0, (NN.count || 1) - 1 - NN.players.length) : 0; } catch (e) { return 0; } };
  function stopHost() { if (hostR) { hostR.stop(); hostR = null; } Gossip.advertise(null); H.id = ''; H.pub = false; }
  function adOf() {
    const me = NN.localInfo();
    return { rid: H.id, title: H.title || me.name, host: me.name, lv: me.level, col: me.color, mode: H.mode, mission: H.mission, n: Math.min(MAXP, NN.count || 1), max: MAXP };
  }

  // ---- Гость: подключение к комнате по ссылке/имени/публичной. Гость предлагает offer'ы; хост отвечает.
  async function joinRoom(id, opts) {
    opts = opts || {};
    stopJoin();
    id = roomName(id);
    if (!id) { emit('join', { stage: 'error', err: 'ROOM_BAD' }); return { ok: false, err: 'ROOM_BAD' }; }
    if (typeof RTCPeerConnection !== 'function') { emit('join', { stage: 'error', err: 'UNSUPPORTED' }); return { ok: false, err: 'UNSUPPORTED' }; }
    NN.begin('guest');
    J.id = id; J.t0 = now(); J.stage = 'searching'; J.got = false;
    const to = (opts.timeoutMs || 20000);
    const fire = (stage, extra) => { J.stage = stage; emit('join', Object.assign({ stage, id, ms: now() - J.t0, up: joinR && joinR.up }, extra || {})); };
    const r = joinR = new Rendezvous('room/' + id, {
      mode: 'offerer',
      onStatus: (s) => { emit('status', Object.assign({ kind: 'join' }, s)); if (s.up === 0 && s.ms > 7000 && J.stage === 'searching') { fire('unavailable', { err: 'NO_TRACKER' }); } },
      offerCount: () => (J.got ? 0 : 2),
      makeOffer: async () => { const o = await NN.rtc.newOffer('guest'); return o ? { sdp: o.sdp, token: o.link } : null; },
      dropToken: (link) => { if (link && !link.attached) NN.rtc.drop(link); },
      onAnswer: async (link, sdp) => {
        if (J.got || !link) { NN.rtc.drop(link); return; }
        if (!NN.rtc.attach(link)) { NN.rtc.drop(link); return; }
        J.got = true;
        fire('connecting');
        const ok = await NN.rtc.applyAnswer(link, sdp);
        if (!ok) { J.got = false; NN.rtc.drop(link); NN.begin('guest'); fire('searching'); return; }
        NN.rtc.connecting(link, 25000);
      }
    });
    await r.start();
    clearTimeout(J.timer);
    J.timer = setTimeout(() => { if (joinR === r && NN.state !== 'open' && J.stage !== 'unavailable') fire('timeout', { err: 'TRACKER_TIMEOUT' }); }, to);
    fire('searching');
    return { ok: true, id };
  }
  function stopJoin() { clearTimeout(J.timer); if (joinR) { joinR.stop(); joinR = null; } J.stage = ''; }
  NN.on('net:open', () => { if (joinR) { stopJoin(); emit('join', { stage: 'open', id: J.id }); } });
  NN.on('net:error', (e) => { if (joinR && e && e.code) { const r = joinR; stopJoin(); emit('join', { stage: 'error', err: e.code }); void r; } });
  NN.on('net:close', () => { if (joinR) { stopJoin(); } });

  // ---- Быстрая игра: очередь 'quick/<режим>' (маяки), меньший peer_id — хост; дальше — обычная комната по общему id
  async function quickPlay(mode, opts) {
    opts = opts || {};
    stopQuick();
    if (typeof RTCPeerConnection !== 'function') return { ok: false, err: 'UNSUPPORTED' };
    mode = mode === 'mission' ? 'mission' + Math.max(1, Math.min(47, opts.mission | 0 || 1)) : 'sandbox';
    const beacon = 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=nexa-quick\r\n';
    let paired = false;
    const q = quickR = new Rendezvous('quick/' + mode, {
      mode: 'both', beacon: true,
      onStatus: (s) => { emit('status', Object.assign({ kind: 'quick' }, s)); if (s.up === 0 && s.ms > 7000 && !paired) { stopQuick(); emit('quick', { stage: 'unavailable', err: 'NO_TRACKER' }); } },
      offerCount: () => 1,
      makeOffer: async () => ({ sdp: beacon, token: null }),
      onBeacon: (pid) => {
        if (paired || !quickR) return;
        paired = true;
        const mine = q.peerId, host = mine < pid, a = host ? mine : pid, b = host ? pid : mine;
        const id = 'q' + toHex(a).slice(0, 8) + toHex(b).slice(0, 8);
        stopQuick();
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
    const mode = a.mode === 'mission' ? 'mission' : 'sandbox';
    const mission = mode === 'mission' ? (a.mission | 0) : 0;
    if (mode === 'mission' && (mission < 1 || mission > 47)) return null;     // миссия 48 и выше недоступна
    const max = Math.max(2, Math.min(8, a.max | 0 || MAXP)), n = Math.max(1, Math.min(max, a.n | 0 || 1));
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
      if (G.mine) { G.mine.n = Math.min(MAXP, NN.count || 1); }
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

  window.NexaRoom = {
    DEFAULT_TRACKERS, OPTIONAL_TRACKERS, trackers: trackerList, validTracker, Rendezvous, WebTorrentTransport, infoHash, sha1js,
    hostRoom, joinRoom, stopHost, stopJoin, quickPlay, stopQuick, roomLink, pendingRoom, clearRoomFromUrl, roomName, newRoomId,
    gossip: {
      start: gossipStart, stop: gossipStop, rooms: listRooms, refresh() { broadcast({ t: 'rooms?' }); emit('rooms', listRooms()); }, requestProfile,
      get peers() { return G.peers.filter((p) => p.open).length; }, get on() { return G.on; }, _G: G
    },
    adOf, setMeta(o) { Object.assign(H, o || {}); if (G.mine) { Object.assign(G.mine, { mode: H.mode, mission: H.mission }); } },
    get hosting() { return H.id ? { id: H.id, pub: H.pub, mode: H.mode, mission: H.mission } : null; },
    get joining() { return joinR ? { id: J.id, stage: J.stage } : null; },
    consented, consent, on, text: (c) => NN.text(c), cleanAd, scrub
  };
}());
