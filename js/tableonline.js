// NEXA: HIGH / LOW онлайн за общим 3D-столом (table.js). 2–6 игроков, свободные места занимают субъекты-боты.
// Правила исходной игры: каждый втайне загадывает число 1…N, затем по кругу угадывают число следующего за собой; ответ ВЫШЕ / НИЖЕ / ВЕРНО сужает диапазон;
// угаданный выбывает, остаётся один. Здесь число хранит только владелец; всем рассылается хеш-обязательство SHA-256(раунд|место|число|соль), число раскрывается
// при выбытии или в конце раунда. Хост ведёт очерёдность и таймеры, вердикт даёт владелец числа (у ботов — хост), любая ложь вскрывается при раскрытии.
(function () {
  'use strict';
  const NN = window.NexaNet, HLT = window.HLTable, HL = window.HighLow, SCR = window.HLScreen;
  if (!NN || !HLT || !HL || !SCR) return;
  const PH = HL.PHASES, RANGES = HL.RANGES, POOL = ['014', '027', '031', '044', '056', '068'];
  const CFG = { pick: 15000, turn: 20000, ans: 8000, rounds: 3, gap: 9000, rm: 0, bot: [1300, 2700], botPick: [1200, 9000], lobby: [15000, 8000] };
  const GRACE = 3000, EMO = ['e0', 'e1', 'e2', 'e3', 'e4'];
  const TX = (k, v) => (window.NexaHLText ? window.NexaHLText(k, v) : k);
  const now = () => Date.now();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const hex = (u) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');
  const rnd = (n) => { const a = new Uint8Array(n); try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < n; i += 1) a[i] = Math.floor(Math.random() * 256); } return hex(a); };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const H64 = /^[0-9a-f]{64}$/;
  let Z = null;

  async function sha(str) {
    const u = new TextEncoder().encode(str);
    try { if (crypto && crypto.subtle) return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', u))); } catch (e) { /* ниже запасной путь */ }
    const S = window.NexaSchnorr; if (S && S.sha256) return hex(S.sha256(u));
    return '';
  }
  const cm = (rid, g, n, s) => sha(rid + '|' + g + '|' + n + '|' + s);
  const ok = (hist, n) => hist.every((e) => (e.r === 'H' ? e.v < n : e.r === 'L' ? e.v > n : e.v === n));
  const NAMES = { H: 'HIGH', L: 'LOW', C: 'CORRECT' };

  // ------------------------------------------------------------------ сеть
  function toHost(m) { if (Z.host) hHandle(m, 1); else NN.sendAction(Object.assign({ type: 'hlx' }, m)); }
  function bc(m, to) {
    if (!Z.host) return;
    if (NN.connected && NN.players.length) NN.sendAction(Object.assign({ type: 'hlx' }, m), to ? { to } : undefined);
    if (!to || to === 1) cHandle(m);
  }
  NN.on('hlx', (p) => {
    if (!Z || !p || typeof p.k !== 'string') return;
    if (Z.host) { if ((p.from | 0) >= 2) hHandle(p, p.from | 0); } else if ((p.from | 0) === 1) cHandle(p);
  });
  NN.on('net:left', (p) => { if (Z && Z.host && p) hLeave(p.slot | 0, true); });
  NN.on('net:roster', () => {
    if (!Z || !Z.host || !NN.connected) return;
    NN.players.forEach((q) => {
      if (Z.H.known.has(q.slot)) return;
      Z.H.known.add(q.slot);
      NN.sendAction({ type: 'start', mode: 'hl', mission: 1, seed: 1, late: 1 }, { to: q.slot });
    });
  });

  // ------------------------------------------------------------------ места, имена, локальные идентификаторы
  const seatOf = (g) => Z.seats.find((s) => s.g === g);
  const lid = (g) => (g === Z.myG ? '083' : (Z.myG === null && Z.idx >= 0 && Z.seats[Z.idx] && g === Z.seats[Z.idx].g) ? 'SPC' : g.charAt(0) === 'b' ? g.slice(1) : g);
  const gid = (l) => (l === '083' ? Z.myG : l === 'SPC' ? (Z.seats[Z.idx] || {}).g : /^\d{3}$/.test(l) ? 'b' + l : l);
  function label(l) {
    if (!Z || !Z.seats) return null;
    if (l === 'NONE') return '—';
    const s = seatOf(gid(l)); if (!s || s.bot) return null;
    return String(s.n || 'PLAYER').slice(0, 14);
  }
  const mkBot = (k) => ({ g: 'b' + POOL[k % POOL.length], bot: 1, slot: 0, n: 'SUBJECT ' + POOL[k % POOL.length], c: '#7c898c', p: '' });
  function human(slot) {
    const q = slot === 1 ? NN.localInfo() : NN.players.find((x) => x.slot === slot) || null;
    return { g: 'h' + slot, bot: 0, slot, n: q ? q.name : 'PLAYER ' + slot, c: q ? q.color : '#ff3b30', p: q ? (q.pid || '') : '' };
  }

  // ------------------------------------------------------------------ адаптер игры для table.js (тот же интерфейс, что у HighLow.GameManager)
  function mkGame() {
    const st = {
      phase: PH.PARTICIPANTS, experiment: 'HIGH', participantCount: 0, sessionId: null, rangeMax: 50, pickStartedAt: null, pickDeadline: null, pickRemaining: 15, pickLocked: false, pickSubmitting: false,
      autoSelecting: false, autoSelectedNumber: null, selectionLocked: false, lockedValue: null, pickStage: 'INPUT', matchEnding: false, players: [], currentActorId: null, targetId: null, turnToken: null,
      targetBounds: Object.create(null), targetHistory: Object.create(null), lastResult: null, winnerId: null, userEliminated: false, message: ''
    };
    const G = {
      state: st, held: false, heldQueue: [], now, secrets: {},
      hold(on) { G.held = !!on; },
      emit(ev, d) { try { HLT.onEvent(ev, d || {}); HLT.onUpdate(st); } catch (e) { console.error('[hl]', e); } },
      publicTarget() { const b = st.targetId ? st.targetBounds[st.targetId] : null; return b ? { min: b.min, max: b.max } : null; },
      beginRound() { if (st.phase !== PH.PARTICIPANTS) return false; if (Z.host) { if (Z.H.ph === 'lobby') Z.H.startAt = Math.min(Z.H.startAt, now()); } else tip(TX('hostOnly')); return true; },
      lockNumber(l, v) {
        if (st.phase !== PH.PICKING || l !== '083' || !Z.myG || !Z.act[Z.myG]) return { ok: false, reason: 'CLOSED' };
        if (Z.sec) return { ok: false, reason: 'ALREADY_LOCKED' };
        if (now() >= Z.pickEnd) return { ok: false, reason: 'CLOSED' };
        const p = HL.parseNumber(v, 1, Z.rm); if (!p.ok) return { ok: false, reason: p.reason };
        lockLocal(p.value); return { ok: true, value: p.value };
      },
      submitGuess(a, t, v, token) {
        if (st.phase !== PH.GUESSING || st.matchEnding || !Z.cur || a !== '083' || st.currentActorId !== '083' || token !== st.turnToken) return { ok: false, reason: 'STALE_TURN' };
        const b = st.targetBounds[st.targetId], p = HL.parseNumber(v, b.min, b.max);
        if (!p.ok) return { ok: false, reason: 'OUT_OF_RANGE' };
        st.currentActorId = null; Z.cur.sent = true; HLT.onUpdate(st);
        toHost({ k: 'gu', tn: Z.cur.tn, v: p.value });
        return { ok: true };
      }
    };
    return G;
  }
  function syncPlayers() {
    const st = Z.G.state, N = Z.seats.length;
    st.participantCount = N; st.sessionId = 'NEXA-' + String(Z.rd || 0).padStart(4, '0');
    for (let i = 0; i < N; i += 1) {
      const s = Z.seats[(Math.max(0, Z.idx) + i) % N], p = st.players[i] || (st.players[i] = { id: '', isUser: false, active: true, status: 'READY' });
      p.id = lid(s.g); p.isUser = i === 0;
      const on = !!Z.act[s.g];
      p.active = Z.ph === 'lobby' || Z.ph === 'wait' ? true : on;
      p.status = Z.ph === 'pick' ? (!on ? 'REMOVED' : Z.lock[s.g] ? 'LOCKED' : 'THINKING') : Z.ph === 'guess' || Z.ph === 'over' ? (on ? 'ACTIVE' : 'REMOVED') : 'READY';
    }
    st.players.length = N;
  }

  // ------------------------------------------------------------------ клиент: обработка сообщений хоста
  function cHandle(m) {
    if (!Z) return;
    const f = CH[m.k]; if (f) { try { f(m); } catch (e) { console.error('[hl:' + m.k + ']', e); } }
  }
  function setSeats(arr) {
    const old = Z.seats;
    Z.seats = arr.map((s) => ({ g: String(s.g), bot: s.b ? 1 : 0, slot: s.b ? 0 : (parseInt(String(s.g).slice(1), 10) || 0), n: String(s.n || '').slice(0, 24), c: /^#[0-9a-fA-F]{3,8}$/.test(s.c) ? s.c : '#ff3b30', p: String(s.p || '').slice(0, 64) }));
    const k = Z.seats.findIndex((s) => s.g === 'h' + Z.mySlot);
    if (k >= 0) { Z.myG = 'h' + Z.mySlot; Z.idx = k; } else Z.myG = null;
    if (Z.idx < 0) Z.idx = 0;
    void old;
  }
  const CH = {
    ro(m) {
      setSeats(m.seats);
      if (typeof m.you === 'number' && m.you >= 0 && !Z.myG) Z.idx = m.you | 0;
      Z.rounds = clamp(m.rounds | 0 || CFG.rounds, 1, 9);
      if (!Z.tableOn) { Z.tableOn = true; openTable(); } else { syncPlayers(); relabel(); }
    },
    sn(m) {
      if (!Z.tableOn) return;
      Z.rd = m.rd | 0; Z.rid = String(m.rid || ''); Z.rm = m.rm | 0 || 50; Z.tot = m.tot || {}; Z.act = {}; (m.pl || []).forEach((g) => { Z.act[g] = true; }); Z.lock = {}; (m.lk || []).forEach((g) => { Z.lock[g] = 1; });
      Z.commits = m.c || {}; Z.hist = {}; Z.bounds = {};
      const st = Z.G.state; st.rangeMax = Z.rm;
      Z.ph = m.ph === 'guess' ? 'guess' : m.ph === 'pick' ? 'pick' : 'wait';
      Z.pickEnd = now() + (m.left | 0);
      st.phase = Z.ph === 'guess' ? PH.GUESSING : Z.ph === 'pick' ? PH.PICKING : PH.PARTICIPANTS;
      st.pickStage = Z.ph === 'pick' ? 'LOCKED' : 'DONE'; st.pickLocked = true; st.selectionLocked = true;
      st.targetBounds = Object.create(null); st.targetHistory = Object.create(null);
      if (m.cur) {
        Z.cur = { tn: m.cur.tn, a: m.cur.a, t: m.cur.t, dl: now() + (m.cur.left | 0) };
        st.currentActorId = lid(m.cur.a); st.targetId = lid(m.cur.t); st.turnToken = Z.rid + ':' + m.cur.tn;
        st.targetBounds[lid(m.cur.t)] = { min: m.cur.mn, max: m.cur.mx };
        st.targetHistory[lid(m.cur.t)] = (m.hist || []).map((e) => ({ actorId: lid(e.a), guess: e.v, result: NAMES[e.r] }));
      }
      syncPlayers(); Z.G.emit('picking-started'); hud(); tip(TX('spec'), 5);
    },
    rs(m) {
      setSeats(m.seats);
      Z.rd = m.rd | 0; Z.rid = String(m.rid); Z.rm = m.rm | 0; Z.tot = m.tot || {}; Z.rounds = clamp(m.rounds | 0 || CFG.rounds, 1, 9);
      Z.act = {}; m.pl.forEach((g) => { Z.act[g] = true; }); Z.lock = {}; Z.commits = {}; Z.sec = null; Z.hist = {}; Z.bounds = {}; Z.cur = null; Z.pend = null; Z.ans = {}; Z.rv = {}; Z.rpts = null; Z.flags = [];
      Z.ph = 'pick'; Z.pickEnd = now() + CFG.pick;
      const st = Z.G.state;
      Object.assign(st, { phase: PH.PICKING, rangeMax: Z.rm, pickRemaining: 15, pickLocked: false, selectionLocked: false, lockedValue: null, pickStage: 'INPUT', autoSelecting: false, matchEnding: false, lastResult: null, winnerId: null,
        currentActorId: null, targetId: null, turnToken: null, userEliminated: false, pickDeadline: Z.pickEnd, pickStartedAt: now() });
      st.targetBounds = Object.create(null); st.targetHistory = Object.create(null);
      if (!Z.myG) { st.pickLocked = true; st.selectionLocked = true; st.pickStage = 'LOCKED'; }
      syncPlayers(); Z.G.emit('restart'); Z.G.emit('picking-started'); relabel(); hud();
    },
    pk(m) { Z.lock[m.g] = 1; syncPlayers(); Z.G.emit('number-locked', { playerId: lid(m.g), user: false }); hud(); },
    go(m) {
      Z.commits = m.c || {}; Z.act = {}; m.pl.forEach((g) => { Z.act[g] = true; }); Z.ph = 'guess';
      const st = Z.G.state; st.phase = PH.GUESSING; st.pickStage = 'DONE'; st.pickRemaining = 0; st.matchEnding = false;
      m.pl.forEach((g) => { Z.bounds[g] = { min: 1, max: Z.rm }; Z.hist[g] = []; st.targetBounds[lid(g)] = { min: 1, max: Z.rm }; st.targetHistory[lid(g)] = []; });
      if (Z.sec && Z.myG && Z.act[Z.myG] && Z.commits[Z.myG] !== Z.mycm) warn(TX('altered'));
      syncPlayers(); Z.G.emit('picking-complete'); hud();
    },
    tn(m) {
      const st = Z.G.state; if (st.phase !== PH.GUESSING) return;
      Z.cur = { tn: m.tn, a: m.a, t: m.t, dl: m.d ? now() + m.d : 0 }; Z.pend = null;
      st.currentActorId = lid(m.a); st.targetId = lid(m.t); st.turnToken = Z.rid + ':' + m.tn;
      Z.bounds[m.t] = { min: m.mn, max: m.mx }; st.targetBounds[lid(m.t)] = { min: m.mn, max: m.mx };
      syncPlayers(); st.players.forEach((p) => { if (p.active) p.status = 'ACTIVE'; }); Z.G.emit('turn', { actorId: st.currentActorId }); hud();
    },
    gs(m) {
      Z.pend = { a: m.a, t: m.t, v: m.v, tn: m.tn }; hud();
      if (m.t === Z.myG && Z.sec) {
        const r = m.v < Z.sec.n ? 'H' : m.v > Z.sec.n ? 'L' : 'C'; Z.ans[m.tn] = r;
        toHost(r === 'C' ? { k: 'an', tn: m.tn, r, n: Z.sec.n, s: Z.sec.s } : { k: 'an', tn: m.tn, r });
      }
    },
    vr(m) {
      const st = Z.G.state; if (st.phase !== PH.GUESSING) return;
      const a = lid(m.a), t = lid(m.t), res = NAMES[m.r]; Z.pend = null;
      if (m.t === Z.myG && Z.ans[m.tn] && Z.ans[m.tn] !== m.r) warn(TX('altered'));
      (Z.hist[m.t] = Z.hist[m.t] || []).push({ a: m.a, v: m.v, r: m.r });
      Z.bounds[m.t] = { min: m.mn, max: m.mx }; st.targetBounds[t] = { min: m.mn, max: m.mx };
      (st.targetHistory[t] = st.targetHistory[t] || []).push({ actorId: a, guess: m.v, result: res });
      st.lastResult = { actorId: a, targetId: t, guess: m.v, result: res, range: { min: m.mn, max: m.mx } };
      if (m.r === 'C') {
        Z.act[m.t] = false; Z.rv[m.t] = m.rv || null; checkReveal(m.t, m.rv);
        if (m.t === Z.myG) st.userEliminated = true;
      }
      if (m.ov !== undefined) { st.matchEnding = true; st.currentActorId = null; st.winnerId = m.ov ? lid(m.ov) : 'NONE'; Z.ph = 'over'; }
      Z.cur = null;
      syncPlayers(); Z.G.emit('guess-result', JSON.parse(JSON.stringify(st.lastResult))); hud();
    },
    ov(m) {
      const st = Z.G.state; st.matchEnding = true; st.currentActorId = null; st.winnerId = m.w ? lid(m.w) : 'NONE'; Z.ph = 'over'; Z.cur = null; syncPlayers(); Z.G.emit('turn', {}); hud();
    },
    sk(m) { tip(TX('skipped', { n: nm(m.a) })); const st = Z.G.state; if (st.currentActorId === lid(m.a)) { st.currentActorId = null; } hud(); },
    ou(m) {
      Z.act[m.g] = false; if (Z.cur && (Z.cur.a === m.g || Z.cur.t === m.g)) { Z.cur = null; Z.pend = null; }
      tip(m.why === 'left' ? TX('left', { n: nm(m.g) }) : TX('out', { n: nm(m.g) }));
      const st = Z.G.state; if (m.g === Z.myG) st.userEliminated = true;
      if (st.phase === PH.GUESSING) { if (st.currentActorId === lid(m.g) || st.targetId === lid(m.g)) st.currentActorId = null; }
      syncPlayers(); if (Z.tableOn) killSeat(lid(m.g), true); hud();
    },
    rq(m) {
      if (m.w === Z.myG && Z.sec) toHost({ k: 'rv', n: Z.sec.n, s: Z.sec.s });
    },
    en(m) {
      const st = Z.G.state; Z.ph = 'wait'; Z.tot = m.tot || {}; Z.rpts = m.rp || {}; Z.flags = m.fl || []; Z.gapAt = now() + (m.gap | 0);
      Object.keys(m.rv || {}).forEach((g) => { Z.rv[g] = m.rv[g]; checkReveal(g, m.rv[g]); });
      st.phase = PH.RESULT; st.matchEnding = true; st.winnerId = m.w ? lid(m.w) : 'NONE'; st.targetId = null; st.currentActorId = null;
      Z.flags.forEach((g) => warn(TX('cheat', { n: nm(g) })));
      if (!Z.flags.length) tip(TX('verified'), 4);
      syncPlayers(); Z.G.emit('match-complete'); hud();
    },
    fi(m) { Z.ph = 'fin'; Z.tot = m.tot || Z.tot; Z.win = m.win || []; finalBoard(m); },
    ex(m) { emote(m.g, m.e | 0); },
    cl() { tip(TX('hostLeft'), 4); setTimeout(() => leave(), 1200); },
    no() { tip(TX('full'), 4); setTimeout(() => leave(), 1800); }
  };
  function nm(g) { const s = Z.seats && seatOf(g); return s ? String(s.n || g).slice(0, 14) : String(g); }
  async function checkReveal(g, rv) {
    if (!rv || typeof rv.n !== 'number' || typeof rv.s !== 'string') return;
    const rid = Z.rid, c = Z.commits[g];
    const good = c && (await cm(rid, g, rv.n, rv.s)) === c && ok(Z.hist[g] || [], rv.n);
    if (Z && Z.rid === rid && !good && Z.flags.indexOf(g) < 0) { Z.flags.push(g); warn(TX('cheat', { n: nm(g) })); }
  }
  function lockLocal(n) {
    const st = Z.G.state, rid = Z.rid, g = Z.myG, s = rnd(8);
    Z.sec = { n, s }; st.pickLocked = true; st.selectionLocked = true; st.lockedValue = n; st.pickStage = 'LOCKED'; Z.lock[g] = 1;
    cm(rid, g, n, s).then((c) => {
      if (!Z || Z.rid !== rid) return;
      Z.mycm = c; Z.commits[g] = c; toHost({ k: 'lk', rid, c });
      syncPlayers(); Z.G.emit('number-locked', { playerId: '083', user: true, value: n });
      Z.hash = c.slice(0, 8); hud();
    });
  }

  // ------------------------------------------------------------------ хост: ведущий очерёдность, таймеры, подсчёт очков
  const act = (g) => !!Z.H.act[g];
  function hOrder() { return Z.seats.map((s) => s.g); }
  function nextAct(g) {
    const o = hOrder(), k = o.indexOf(g);
    for (let i = 1; i <= o.length; i += 1) { const c = o[(k + i) % o.length]; if (act(c)) return c; }
    return null;
  }
  const slotOf = (g) => { const s = seatOf(g); return s && !s.bot ? s.slot : 0; };
  const here = (slot) => slot === 1 || (NN.connected && NN.players.some((q) => q.slot === slot) && !Z.H.left[slot]);
  const seatInfo = () => Z.seats.map((s) => ({ g: s.g, n: s.n, c: s.c, p: s.p, b: s.bot }));
  function hInit(spec) {
    const hs = [human(1)];
    if (NN.connected) NN.players.forEach((q) => hs.push(human(q.slot)));
    const N = clamp(Math.max(4, hs.length), 4, 6);
    const seats = hs.slice(0, N).map((s) => ({ g: s.g, bot: 0, slot: s.slot, n: s.n, c: s.c, p: s.p }));
    while (seats.length < N) seats.push(mkBot(seats.length));
    Z.seats = seats; Z.idx = 0; Z.myG = 'h1';
    Z.H = { known: new Set([1].concat(NN.connected ? NN.players.map((q) => q.slot) : [])), joined: {}, left: {}, rsv: {}, ph: 'lobby', startAt: now() + CFG.lobby[0], rd: 0, nonce: rnd(4), act: {}, commits: {}, bsec: {}, bcom: {}, botAt: {}, bounds: {}, hist: {}, ev: [], tot: {}, cur: null, tn: 0, last: null, tmr: setInterval(hTick, 200), emoAt: {} };
    seats.forEach((s) => { Z.H.tot[s.g] = 0; });
  }
  function hRoster() {
    const H = Z.H;
    Z.seats.forEach((s, k) => {
      if (!s.bot && !here(s.slot)) Z.seats[k] = mkBot(k);
      const rs = H.rsv[k];
      if (Z.seats[k].bot && rs && here(rs)) { Z.seats[k] = human(rs); delete H.rsv[k]; }
    });
    Z.seats.forEach((s) => { if (H.tot[s.g] === undefined) H.tot[s.g] = 0; });
  }
  function hRound() {
    const H = Z.H; H.rd += 1; H.rid = H.nonce + ':' + H.rd; H.rm = CFG.rm || RANGES[rint(0, RANGES.length - 1)];
    hRoster();
    H.commits = {}; H.bsec = {}; H.bcom = {}; H.botAt = {}; H.bounds = {}; H.hist = {}; H.ev = []; H.act = {}; H.cur = null; H.last = null; H.w = null; H.out = {}; H.flag = {}; H.rev = {}; H.wrv = null; H.revDl = 0; H.turnAt = 0; H.overAt = 0;
    const pl = hOrder(); pl.forEach((g) => { H.act[g] = true; });
    Z.seats.forEach((s) => {
      if (!s.bot) return;
      const n = rint(1, H.rm), sl = rnd(8); H.bsec[s.g] = { n, s: sl }; H.botAt[s.g] = now() + rint(CFG.botPick[0], CFG.botPick[1]);
      cm(H.rid, s.g, n, sl).then((c) => { H.bcom[s.g] = c; });
    });
    H.ph = 'pick'; H.pickEnd = now() + CFG.pick + GRACE; H.goAt = 0;
    bc({ k: 'rs', rid: H.rid, rd: H.rd, rounds: CFG.rounds, rm: H.rm, seats: seatInfo(), pl, tot: H.tot });
  }
  function hLock(g, c) { const H = Z.H; if (H.commits[g] || !H.act[g]) return; H.commits[g] = c; bc({ k: 'pk', g }); }
  function hGo() {
    const H = Z.H, pl = hOrder().filter((g) => act(g) && H.commits[g]);
    hOrder().forEach((g) => { if (act(g) && !H.commits[g]) hOut(g, 'afk'); });
    if (pl.length < 2) { H.w = pl[0] || null; H.ph = 'over'; H.overAt = now() + 600; bc({ k: 'go', c: H.commits, pl }); return; }
    pl.forEach((g) => { H.bounds[g] = { min: 1, max: H.rm }; H.hist[g] = []; });
    H.ph = 'guess'; bc({ k: 'go', c: H.commits, pl });
    const o = hOrder(); let k = (H.rd - 1) % o.length;
    for (let i = 0; i < o.length; i += 1) { const g = o[(k + i) % o.length]; if (act(g)) { k = (k + i) % o.length; break; } }
    H.turnAt = now() + 1500; H.nextA = o[k];
  }
  function hTurn(a) {
    const H = Z.H, t = nextAct(a); H.tn += 1;
    const bot = seatOf(a).bot, b = H.bounds[t];
    H.cur = { tn: H.tn, a, t, wait: 'guess', dl: bot ? 0 : now() + CFG.turn + 500, botAt: bot ? now() + rint(CFG.bot[0], CFG.bot[1]) : 0 };
    bc({ k: 'tn', tn: H.tn, a, t, mn: b.min, mx: b.max, d: bot ? 0 : CFG.turn });
    if (!bot && !here(seatOf(a).slot)) hSkip('left');
  }
  function hSkip(why) {
    const H = Z.H, c = H.cur; if (!c) return;
    bc({ k: 'sk', tn: c.tn, a: c.a, why }); H.cur = null; H.nextA = nextAct(c.a); H.turnAt = now() + 700;
  }
  function hGuess(v) {
    const H = Z.H, c = H.cur; c.v = v; c.wait = 'ans'; c.ansDl = now() + CFG.ans; c.botAns = seatOf(c.t).bot ? now() + 600 : 0;
    bc({ k: 'gs', tn: c.tn, a: c.a, t: c.t, v });
  }
  async function hAnswer(r, rv) {
    const H = Z.H, c = H.cur; if (!c || c.wait !== 'ans') return;
    c.wait = 'proc'; const tn = c.tn, b = H.bounds[c.t];
    if (r === 'C') {
      const good = rv && rv.n === c.v && typeof rv.s === 'string' && (await cm(H.rid, c.t, rv.n, rv.s)) === H.commits[c.t];
      if (!H.cur || H.cur.tn !== tn) return;
      if (!good) { hCheat(c.t, 'bad-reveal'); return; }
    }
    if (r === 'H') b.min = c.v + 1; else if (r === 'L') b.max = c.v - 1;
    if (b.min > b.max) { hCheat(c.t, 'impossible'); return; }
    H.hist[c.t].push({ a: c.a, v: c.v, r });
    let ov;
    if (r === 'C') { H.act[c.t] = false; H.ev.push({ a: c.a, t: c.t, len: H.hist[c.t].length }); H.rev = H.rev || {}; H.rev[c.t] = rv; }
    const left = hOrder().filter(act);
    if (left.length <= 1) { ov = left[0] || ''; H.w = left[0] || null; }
    const m = { k: 'vr', tn, a: c.a, t: c.t, v: c.v, r, mn: b.min, mx: b.max };
    if (r === 'C') m.rv = { n: rv.n, s: rv.s };
    if (ov !== undefined) m.ov = ov;
    H.cur = null; H.last = m; bc(m);
    if (ov !== undefined) { H.ph = 'over'; H.overAt = now() + 2600; } else { H.nextA = nextAct(c.a); H.turnAt = now() + 1000; }
  }
  function hCheat(g, why) { Z.H.flag = Z.H.flag || {}; Z.H.flag[g] = why; hOut(g, 'cheat'); }
  function hOut(g, why) {
    const H = Z.H; if (!H.act[g]) return;
    H.act[g] = false; H.out[g] = why;
    bc({ k: 'ou', g, why });
    if (H.ph !== 'guess') return;
    const c = H.cur;
    if (c && (c.a === g || c.t === g)) { H.cur = null; H.nextA = c.a === g ? nextAct(g) : (act(c.a) ? c.a : nextAct(c.a)); H.turnAt = now() + 800; }
    const left = hOrder().filter(act);
    if (left.length <= 1) { H.w = left[0] || null; H.ph = 'over'; H.overAt = now() + 1200; H.cur = null; bc({ k: 'ov', w: left[0] || '' }); }
  }
  function hLeave(slot, gone) {
    const H = Z.H; if (!H || slot < 2) return;
    if (gone) H.left[slot] = true;
    const s = Z.seats.find((x) => !x.bot && x.slot === slot); if (!s) return;
    if (H.act[s.g]) hOut(s.g, 'left');
    Object.keys(H.rsv).forEach((k) => { if (H.rsv[k] === slot) delete H.rsv[k]; });
  }
  function hFinish() {
    const H = Z.H, rp = {};
    Z.seats.forEach((s) => { rp[s.g] = 0; });
    H.ev.forEach((e) => { rp[e.a] += clamp(10 - e.len, 1, 8); });
    if (H.w) rp[H.w] += 5;
    Object.keys(H.flag).forEach((g) => { rp[g] = 0; });
    Object.keys(rp).forEach((g) => { H.tot[g] = (H.tot[g] || 0) + rp[g]; });
    Object.keys(H.rev).forEach((g) => { if (H.rev[g] && !ok(H.hist[g] || [], H.rev[g].n)) { H.flag[g] = 'lie'; rp[g] = 0; } });
    const rv = {}; if (H.w && H.wrv) rv[H.w] = H.wrv;
    const fl = Object.keys(H.flag);
    H.ph = 'gap'; H.gapAt = now() + CFG.gap;
    bc({ k: 'en', rd: H.rd, w: H.w || '', rp, tot: H.tot, fl, rv, gap: CFG.gap });
  }
  function hFinal() {
    const H = Z.H, top = Math.max.apply(null, Object.keys(H.tot).map((g) => H.tot[g])), win = Object.keys(H.tot).filter((g) => H.tot[g] === top && top > 0);
    H.ph = 'fin'; bc({ k: 'fi', tot: H.tot, win, seats: seatInfo() });
  }
  function hTick() {
    const H = Z && Z.H; if (!H) return;
    const t = now();
    if (H.ph === 'lobby') {
      const need = NN.connected ? NN.players.filter((q) => !H.left[q.slot]).every((q) => H.joined[q.slot]) : true;
      if (t >= H.startAt || (need && t >= H.startAt - (CFG.lobby[0] - CFG.lobby[1]))) hRound();
    } else if (H.ph === 'pick') {
      Z.seats.forEach((s) => { if (s.bot && H.act[s.g] && !H.commits[s.g] && H.bcom[s.g] && t >= H.botAt[s.g]) hLock(s.g, H.bcom[s.g]); });
      const all = hOrder().every((g) => !act(g) || H.commits[g]);
      if (all && !H.goAt) H.goAt = t + 1200;
      if ((H.goAt && t >= H.goAt) || t >= H.pickEnd) hGo();
    } else if (H.ph === 'guess') {
      const c = H.cur;
      if (!c) { if (H.turnAt && t >= H.turnAt) { H.turnAt = 0; hTurn(act(H.nextA) ? H.nextA : nextAct(H.nextA)); } return; }
      if (c.wait === 'guess') {
        if (c.botAt) { if (t >= c.botAt) { const b = H.bounds[c.t]; hGuess(HL.GameManager.prototype.chooseAiGuess.call({ random: Math.random }, { style: ['midpoint', 'risky', 'chaotic', 'cautious'][c.a.charCodeAt(2) % 4] }, b, H.hist[c.t].map((e) => ({ guess: e.v })))); } }
        else if (t >= c.dl) hSkip('timeout');
      } else if (c.wait === 'ans') {
        if (c.botAns) { if (t >= c.botAns) { c.botAns = 0; const s = H.bsec[c.t]; hAnswer(c.v < s.n ? 'H' : c.v > s.n ? 'L' : 'C', s); } }
        else if (t >= c.ansDl) { hCheat(c.t, 'silent'); }
      }
    } else if (H.ph === 'over') {
      if (H.overAt && t >= H.overAt) {
        H.overAt = 0;
        const w = H.w && seatOf(H.w);
        if (w && w.bot) { H.wrv = H.bsec[H.w]; hFinish(); } else if (w) { H.revDl = t + 3000; bc({ k: 'rq', w: H.w }); } else hFinish();
      } else if (H.revDl) {
        if (H.wrv || t >= H.revDl) { H.revDl = 0; hFinish(); }
      }
    } else if (H.ph === 'gap') {
      if (t >= H.gapAt) { if (H.rd >= CFG.rounds) hFinal(); else hRound(); }
    }
  }
  function hHandle(m, slot) {
    const H = Z.H; if (!H) return;
    const s = Z.seats.find((x) => !x.bot && x.slot === slot), g = s ? s.g : null;
    switch (m.k) {
      case 'jn': {
        H.joined[slot] = true; H.known.add(slot);
        if (!s) {
          let k = Z.seats.findIndex((x, i) => x.bot && !H.rsv[i]);
          const rk = Object.keys(H.rsv).find((i) => H.rsv[i] === slot);
          if (rk !== undefined) k = +rk;
          if (k < 0) { bc({ k: 'no' }, slot); return; }
          H.rsv[k] = slot;
          bc({ k: 'ro', seats: seatInfo(), you: k, rounds: CFG.rounds }, slot);
          const cur = H.cur;
          bc({ k: 'sn', rid: H.rid || '', rd: H.rd, rm: H.rm || 50, ph: H.ph === 'guess' ? 'guess' : H.ph === 'pick' ? 'pick' : 'wait', tot: H.tot, pl: hOrder().filter(act), lk: Object.keys(H.commits), c: H.ph === 'guess' ? H.commits : {},
            left: Math.max(0, (H.pickEnd || 0) - now() - GRACE), cur: cur ? { tn: cur.tn, a: cur.a, t: cur.t, mn: H.bounds[cur.t].min, mx: H.bounds[cur.t].max, left: Math.max(0, (cur.dl || 0) - now()) } : null, hist: cur ? H.hist[cur.t] : [] }, slot);
          return;
        }
        bc({ k: 'ro', seats: seatInfo(), you: Z.seats.indexOf(s), rounds: CFG.rounds }, slot);
        return;
      }
      case 'lk': if (g && H.ph === 'pick' && m.rid === H.rid && H64.test(m.c)) hLock(g, m.c); return;
      case 'gu': {
        const c = H.cur; if (!g || !c || c.wait !== 'guess' || c.tn !== m.tn || c.a !== g) return;
        const b = H.bounds[c.t], v = m.v; if (!Number.isInteger(v) || v < b.min || v > b.max) return;
        hGuess(v); return;
      }
      case 'an': {
        const c = H.cur; if (!g || !c || c.wait !== 'ans' || c.tn !== m.tn || c.t !== g || (m.r !== 'H' && m.r !== 'L' && m.r !== 'C')) return;
        hAnswer(m.r, m.r === 'C' ? { n: m.n, s: m.s } : null); return;
      }
      case 'rv': {
        if (!g || H.ph !== 'over' || g !== H.w || !H.revDl || typeof m.n !== 'number' || typeof m.s !== 'string') return;
        cm(H.rid, g, m.n, m.s).then((c) => {
          if (c === H.commits[g] && ok(H.hist[g] || [], m.n)) H.wrv = { n: m.n, s: m.s }; else { H.flag = H.flag || {}; H.flag[g] = 'bad-reveal'; H.wrv = { n: m.n, s: m.s }; }
        });
        return;
      }
      case 'em': if (g && m.e >= 0 && m.e < EMO.length && now() - (H.emoAt[slot] || 0) > 1200) { H.emoAt[slot] = now(); bc({ k: 'ex', g, e: m.e | 0 }); } return;
      case 'lv': hLeave(slot, false); return;
      default:
    }
  }

  // ------------------------------------------------------------------ вид: стол, метки игроков, табло, эмоции
  const CSS = '.hlo{position:absolute;inset:0;pointer-events:none;font-family:"Space Mono","Courier New",monospace;color:#e6e9e6;z-index:30}.hlo *{box-sizing:border-box}' +
    '.hlo-chip{position:absolute;top:8px;left:50%;transform:translateX(-50%);padding:5px 12px;background:rgba(5,6,6,.82);border:1px solid #2b3132;font-size:12px;letter-spacing:.08em;text-align:center;white-space:nowrap;max-width:70vw;overflow:hidden;text-overflow:ellipsis}' +
    '.hlo-chip.me{border-color:#ef4b45;color:#ef4b45}.hlo-sb{position:absolute;top:8px;right:8px;width:min(210px,34vw);background:rgba(5,6,6,.82);border:1px solid #2b3132;padding:6px 8px;font-size:11px}' +
    '.hlo-sb h4{margin:0 0 4px;font-size:10px;letter-spacing:.15em;color:#7c898c;font-weight:400}.hlo-r{display:flex;align-items:center;gap:6px;padding:2px 0;border-top:1px solid #1a1e1f}.hlo-r.off{opacity:.38}.hlo-r.cur{color:#ef4b45}.hlo-r.tgt b{color:#ddb56b}' +
    '.hlo-r span.n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hlo-r em{font-style:normal;color:#79c19a;font-size:10px}.hlo-r b{min-width:22px;text-align:right}.hlo-r .pf-av{flex:none}' +
    '.hlo-em{position:absolute;left:8px;bottom:8px;display:flex;gap:4px;pointer-events:auto}.hlo-em button,.hlo-lv,.hlo-fin button{pointer-events:auto;background:rgba(5,6,6,.82);border:1px solid #3b4446;color:#e6e9e6;font:inherit;font-size:11px;padding:6px 8px;cursor:pointer;letter-spacing:.06em}' +
    '.hlo-em button:hover,.hlo-lv:hover,.hlo-fin button:hover{border-color:#e6e9e6}.hlo-lv{position:absolute;left:8px;top:8px}.hlo-lv.arm{border-color:#ef4b45;color:#ef4b45}' +
    '.hlo-tag{position:absolute;left:0;top:0;display:flex;align-items:center;gap:5px;background:rgba(5,6,6,.78);border:1px solid #2b3132;padding:2px 6px 2px 2px;font-size:11px;white-space:nowrap;will-change:transform}.hlo-tag.cur{border-color:#ef4b45}.hlo-tag.off{opacity:.45}' +
    '.hlo-tag .bub{position:absolute;left:50%;bottom:100%;transform:translateX(-50%);margin-bottom:4px;background:#e6e9e6;color:#050606;padding:2px 7px;font-weight:700;font-size:12px;animation:hlob 2.2s forwards}@keyframes hlob{0%{opacity:0;transform:translate(-50%,6px)}10%,80%{opacity:1;transform:translate(-50%,0)}100%{opacity:0}}' +
    '.hlo-tip{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);background:rgba(5,6,6,.88);border:1px solid #5b1514;padding:6px 12px;font-size:12px;letter-spacing:.06em;max-width:80vw;text-align:center}.hlo-tip.w{border-color:#ef4b45;color:#ef4b45}' +
    '.hlo-fin{position:absolute;inset:0;background:rgba(3,4,4,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;pointer-events:auto;padding:16px;text-align:center}.hlo-fin[hidden]{display:none}.hlo-fin h2{margin:0;font-size:22px;letter-spacing:.15em}' +
    '.hlo-fin .row{display:flex;gap:10px;align-items:center;min-width:min(340px,80vw);border-top:1px solid #1a1e1f;padding:3px 0}.hlo-fin .row.w{color:#79c19a}.hlo-fin .row .n{flex:1;text-align:left}.hlo-fin .kp{color:#ddb56b;font-size:14px}' +
    '.pk-sb[data-v="hl"]{background-image:linear-gradient(100deg,rgba(91,21,20,.55),rgba(5,6,6,0) 70%),repeating-linear-gradient(0deg,rgba(255,255,255,.04) 0 1px,transparent 1px 4px)}';
  function hud() {
    if (!Z || !Z.ui) return;
    const U = Z.ui, st = Z.G.state, c = Z.cur;
    let txt = '';
    const sec = (ms) => Math.max(0, Math.ceil(ms / 1000));
    if (Z.ph === 'pick') txt = TX('round', { a: Z.rd, b: Z.rounds }) + ' // ' + TX('picking') + ' ' + sec(Z.pickEnd - now());
    else if (Z.ph === 'guess' && c) txt = TX('round', { a: Z.rd, b: Z.rounds }) + ' // ' + (c.a === Z.myG ? TX('yourTurn') : nm(c.a)) + (Z.pend ? ' → ' + Z.pend.v + ' ?' : c.dl ? ' ' + sec(c.dl - now()) : '');
    else if (Z.ph === 'guess') txt = TX('round', { a: Z.rd, b: Z.rounds });
    else if (Z.ph === 'wait' && Z.gapAt) txt = TX('nextRound', { n: sec(Z.gapAt - now()) });
    else if (Z.ph === 'lobby' || !Z.ph) txt = TX('waiting');
    const me = (Z.ph === 'guess' && c && c.a === Z.myG && !c.sent) || (Z.ph === 'pick' && !Z.sec && Z.myG && Z.act[Z.myG]);
    if (U.chipT !== txt) { U.chipT = txt; U.chip.textContent = txt; }
    U.chip.classList.toggle('me', !!me);
    const key = JSON.stringify([Z.seats.map((s) => s.g + s.n), Z.act, Z.tot, Z.rpts, Z.lock, c && c.a, c && c.t, Z.ph, Z.flags]);
    if (key !== U.sbKey) {
      U.sbKey = key;
      U.sb.innerHTML = '<h4>' + esc(TX('scores')) + '</h4>' + Z.seats.map((s) => {
        const on = Z.ph === 'lobby' || Z.ph === 'wait' || Z.act[s.g], pt = Z.rpts && Z.rpts[s.g] ? '<em>' + esc(TX('pts', { n: Z.rpts[s.g] })) + '</em>' : '';
        const av = window.NexaProfile && NexaProfile.avatar && !s.bot ? NexaProfile.avatar(s.n, s.c, 16, s.p) : '';
        return '<div class="hlo-r' + (on ? '' : ' off') + (c && c.a === s.g && Z.ph === 'guess' ? ' cur' : '') + (c && c.t === s.g && Z.ph === 'guess' ? ' tgt' : '') + '">' + av + '<span class="n" translate="no">' + esc(s.bot ? TX('bot', { n: s.g.slice(1) }) : s.n) + (s.g === Z.myG ? ' *' : '') + (Z.flags && Z.flags.indexOf(s.g) >= 0 ? ' !' : '') + '</span>' + pt + '<b>' + (Z.tot[s.g] || 0) + '</b></div>';
      }).join('');
    }
    st.sessionId = 'NEXA-' + String(Z.rd || 0).padStart(4, '0');
  }
  function tip(t, secs, bad) {
    if (!Z || !Z.ui) return;
    const e = Z.ui.tip; e.textContent = t; e.hidden = false; e.classList.toggle('w', !!bad);
    clearTimeout(Z.tipT); Z.tipT = setTimeout(() => { if (e) e.hidden = true; }, (secs || 3) * 1000);
  }
  const warn = (t) => tip(t, 6, true);
  function relabel() { try { HLT.relabel(); } catch (e) { /* стол ещё строится */ } if (Z && Z.ui) Z.ui.tagsKey = ''; }
  function mkTags() {
    const U = Z.ui; U.tags = [];
    const N = Z.seats.length;
    for (let i = 0; i < N; i += 1) { const e = document.createElement('div'); e.className = 'hlo-tag'; e.hidden = true; U.root.appendChild(e); U.tags.push({ e, key: '' }); }
  }
  function updTags() {
    const U = Z.ui, T = HLT.state; if (!T || !T.ready || !U.tags) return;
    const r = T.r, N = Z.seats.length, cam = r.camera, v = U.v3 || (U.v3 = new THREE.Vector3());
    for (let i = 0; i < N; i += 1) {
      const seat = T.seats[i], tg = U.tags[i], s = Z.seats[(Math.max(0, Z.idx) + i) % N];
      if (!seat || !tg || !s) continue;
      if (i === 0 || !cam) { tg.e.hidden = true; continue; }
      const key = s.g + s.n + s.c + s.p + s.bot;
      if (tg.key !== key) { tg.key = key; const av = !s.bot && window.NexaProfile && NexaProfile.avatar ? NexaProfile.avatar(s.n, s.c, 22, s.p) : ''; tg.e.innerHTML = av + '<span translate="no" style="color:' + (s.bot ? '#9aa3a5' : esc(s.c)) + '">' + esc(s.bot ? TX('bot', { n: s.g.slice(1) }) : s.n) + '</span>'; }
      const on = Z.ph === 'lobby' || Z.ph === 'wait' || !!Z.act[s.g];
      tg.e.classList.toggle('off', !on); tg.e.classList.toggle('cur', !!(Z.cur && Z.cur.a === s.g && Z.ph === 'guess'));
      seat.n.head.getWorldPosition(v); v.y += 0.34; v.project(cam);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.2) { tg.e.hidden = true; continue; }
      tg.e.hidden = false;
      const x = Math.round((v.x * 0.5 + 0.5) * r.w), y = Math.round((-v.y * 0.5 + 0.5) * r.h);
      if (tg.x !== x || tg.y !== y) { tg.x = x; tg.y = y; tg.e.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-100%)'; }
    }
  }
  function emote(g, e) {
    const T = HLT.state, U = Z.ui; if (!T || !T.ready || !U) return;
    const N = Z.seats.length, k = Z.seats.findIndex((s) => s.g === g); if (k < 0) return;
    const i = (k - Math.max(0, Z.idx) + N) % N, tg = U.tags[i], seat = T.seats[i];
    const b = document.createElement('div'); b.className = 'bub'; b.textContent = TX(EMO[e]);
    if (i === 0) { tip(TX(EMO[e]), 1.5); } else if (tg) { tg.e.appendChild(b); setTimeout(() => b.remove(), 2300); }
    if (e === 4 && seat && !seat.dead) { seat.fearT = 1; setTimeout(() => { if (seat && !seat.dead) seat.fearT = 0; }, 1600); }
  }
  function killSeat(l, quiet) {
    const T = HLT.state; if (!T || !T.ready || !T.seats) return;
    const seat = T.seats.find((s) => s.id === l); if (!seat || seat.dead) return;
    const r = T.r, me = seat.isUser;
    if (me) { T.crash = 2; r.sfx && r.sfx('error'); }
    else { seat.fearT = 1; seat.gt = 99; }
    setTimeout(() => {
      if (!Z || !T.r || T.r.disposed) return;
      if (!quiet && r.snd && r.snd.shot) r.snd.shot('epistol', {});
      if (me) T.crash = 0;
      seat.dead = true; seat.recoil = 1; seat.fearT = 0;
      if (r.shake) r.shake(0.012, 0.25);
      if (r.tween) r.tween(1.0, (k) => { seat.slump = k * k * (3 - 2 * k); });
      if (seat.pool) { seat.pool.visible = true; seat.poolK = 0; }
    }, me ? 1400 : 900);
  }
  function finalBoard(m) {
    const U = Z.ui; if (!U) return;
    const rows = Z.seats.map((s) => ({ s, t: Z.tot[s.g] || 0 })).sort((a, b) => b.t - a.t);
    const wins = (m.win || []).map(nm).join(', ') || TX('draw');
    let kp = 0;
    const iWin = Z.myG && (m.win || []).indexOf(Z.myG) >= 0 && !(Z.flags || []).includes(Z.myG);
    const humans = Z.seats.filter((s) => !s.bot).length;
    if (iWin && humans >= 2) kp = payKp();
    U.fin.innerHTML = '<h2>' + esc(TX('final')) + '</h2><div>' + esc(TX('winner')) + ': <b translate="no">' + esc(wins) + '</b></div>' +
      rows.map((x) => '<div class="row' + ((m.win || []).indexOf(x.s.g) >= 0 ? ' w' : '') + '"><span class="n" translate="no">' + esc(x.s.bot ? TX('bot', { n: x.s.g.slice(1) }) : x.s.n) + (x.s.g === Z.myG ? ' *' : '') + '</span><b>' + x.t + '</b></div>').join('') +
      (kp ? '<div class="kp">' + esc(TX('kp', { n: kp })) + '</div>' : '') + '<button type="button" data-a="back">' + esc(TX('back')) + '</button>';
    U.fin.hidden = false;
    U.fin.querySelector('button').onclick = () => leave();
  }
  function payKp() {
    try {
      if (!window.Toys || !Toys.reward || !window.NexaProfile) return 0;
      const done = (NexaProfile.get().doneIds || []);
      return done.indexOf(1) >= 0 ? (Toys.reward(1) | 0) : 0;
    } catch (e) { return 0; }
  }
  function initUi() {
    const T = HLT.state, r = T.r;
    if (!document.getElementById('hlo-css')) { const st = document.createElement('style'); st.id = 'hlo-css'; st.textContent = CSS; document.head.appendChild(st); }
    const root = document.createElement('div'); root.className = 'hlo';
    root.innerHTML = '<div class="hlo-chip"></div><div class="hlo-sb"></div><button type="button" class="hlo-lv"></button><div class="hlo-em"></div><div class="hlo-tip" hidden></div><div class="hlo-fin" hidden></div>';
    r.layer.appendChild(root);
    ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach((ev) => root.addEventListener(ev, (e) => e.stopPropagation()));
    const U = Z.ui = { root, chip: root.querySelector('.hlo-chip'), sb: root.querySelector('.hlo-sb'), tip: root.querySelector('.hlo-tip'), fin: root.querySelector('.hlo-fin'), lv: root.querySelector('.hlo-lv'), tags: [] };
    U.lv.textContent = TX('leave');
    U.lv.onclick = () => { if (U.lv.classList.contains('arm')) leave(); else { U.lv.classList.add('arm'); U.lv.textContent = TX('sure'); setTimeout(() => { U.lv.classList.remove('arm'); U.lv.textContent = TX('leave'); }, 3000); } };
    const eb = root.querySelector('.hlo-em');
    EMO.forEach((k, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = TX(k); b.title = TX('emotes') + ' [' + 'ZXCVB'[i] + ']'; b.onclick = () => sendEmote(i); eb.appendChild(b); });
    mkTags();
    r.on(document, 'keydown', (e) => {
      if (e.repeat || !Z || T.ui.typing) return;
      const i = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB'].indexOf(e.code);
      if (i >= 0) sendEmote(i);
      else if (e.code === 'KeyQ') { if (now() - (Z.qAt || 0) < 3000) leave(); else { Z.qAt = now(); tip(TX('sure'), 3); } }
    });
    r.hooks.push(() => { if (!Z || !Z.ui) return; updTags(); });
    r.noPause = true; try { if (r.pausedUser) r.setPause(false); } catch (e) { /* ok */ }
    Z.timers.push(setInterval(uiTick, 250));
    relabel(); syncPlayers(); hud();
  }
  function sendEmote(i) { if (!Z || !Z.myG || !Z.act) return; toHost({ k: 'em', e: i }); }
  function uiTick() {
    if (!Z) return;
    const st = Z.G.state;
    if (Z.ph === 'pick') {
      const left = Math.max(0, Math.ceil((Z.pickEnd - now()) / 1000));
      if (st.pickRemaining !== left && st.phase === PH.PICKING) { st.pickRemaining = left; HLT.onUpdate(st); }
      if (Z.myG && Z.act[Z.myG] && !Z.sec && now() >= Z.pickEnd - 150) {
        const T = HLT.state; if (T && T.ui) { T.ui.typing = false; T.ui.buf = ''; }
        lockLocal(rint(1, Z.rm));
      }
    }
    if (!Z.host && !NN.connected) { tip(TX('lost'), 3, true); setTimeout(() => { if (Z && !NN.connected) leave(); }, 2500); }
    if (Z.host && !NN.connected && Z.H && Z.H.known.size > 1 && Z.H.ph !== 'fin') { Z.H.known.forEach((s) => { if (s > 1) hLeave(s, true); }); Z.H.known = new Set([1]); }
    hud();
  }

  // ------------------------------------------------------------------ запуск и выход
  function openTable() {
    syncPlayers();
    SCR.label = label;
    const hk = Z.hooks;
    const okS = HLT.start(Z.G, {
      audio: hk.audio, playSfx: hk.playSfx, stopMusic: hk.stopMusic, restart: () => tip(TX('noRestart'), 3),
      kill: (l) => killSeat(l, false), onEnd: onTableEnd
    });
    if (!okS) { finish('fail'); return; }
    let tries = 0;
    Z.timers.push(setInterval(() => {
      if (!Z) return;
      const T = HLT.state;
      if (T && T.ready && !Z.ui) { initUi(); if (!Z.host) toHost({ k: 'jn' }); }
      else if (!T && ++tries > 3) finish('fail');
    }, 150));
  }
  function onTableEnd(reason) { if (Z) finish(reason === 'fail' ? 'fail' : 'menu'); }
  function leave() {
    if (!Z || Z.leaving) return; Z.leaving = true;
    try { if (Z.host) bc({ k: 'cl' }); else if (NN.connected) toHost({ k: 'lv' }); } catch (e) { /* ok */ }
    try { HLT.stop(); } catch (e) { finish('menu'); }
    const z = Z; setTimeout(() => { if (Z === z) finish('menu'); }, 1500);
  }
  function finish(reason) {
    const z = Z; if (!z) return;
    Z = null;
    if (!z.leaving) { try { NN.sendAction({ type: 'hlx', k: z.host ? 'cl' : 'lv' }); } catch (e) { /* ok */ } }
    (z.timers || []).forEach(clearInterval); if (z.H) clearInterval(z.H.tmr);
    clearTimeout(z.tipT);
    if (SCR.label === label) SCR.label = null;
    try { z.hooks.onEnd && z.hooks.onEnd(reason); } catch (e) { console.error(e); }
  }
  function start(spec, hooks) {
    if (Z || !HLT || (window.Missions && window.Missions.current)) return false;
    const host = !spec || spec.role !== 'guest';
    Z = { host, solo: !!(spec && spec.solo), hooks: hooks || {}, G: null, seats: null, idx: 0, myG: null, mySlot: NN.connected ? NN.slot : 1, act: {}, lock: {}, commits: {}, hist: {}, bounds: {}, tot: {}, ans: {}, rv: {}, flags: [], timers: [],
      rd: 0, rounds: CFG.rounds, rid: '', rm: 50, ph: 'lobby', cur: null, sec: null, tableOn: false, ui: null };
    Z.G = mkGame();
    if (host) {
      Z.mySlot = 1; hInit(spec); Z.tableOn = true; Z.rounds = CFG.rounds; openTable();
    } else {
      Z.myG = null; Z.idx = -1;
      let n = 0;
      Z.timers.push(setInterval(() => {
        if (!Z || Z.tableOn) return;
        if (++n > 40) { finish('fail'); return; }
        NN.sendAction({ type: 'hlx', k: 'jn' });
      }, 600));
      NN.sendAction({ type: 'hlx', k: 'jn' });
    }
    return true;
  }
  window.TableOnline = {
    start, stop() { leave(); },
    get active() { return !!Z; },
    get session() { return Z; },
    cfg: CFG, debug: { sha, ok, cm }
  };
  const regCover = () => { const C = window.ModeCovers; if (C && C.MODES && !C.MODES.hl) C.MODES.hl = { t: 'HIGH / LOW', s: 'ONLINE · THE TABLE', m: C.M && C.M.hl ? 'hl' : 'story' }; };
  regCover(); document.addEventListener('DOMContentLoaded', regCover);
  try { const st = document.createElement('style'); st.id = 'hlo-css'; st.textContent = CSS; document.head.appendChild(st); } catch (e) { /* ok */ }
}());
