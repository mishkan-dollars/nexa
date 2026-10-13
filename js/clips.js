// NEXA: запись лучших моментов миссий для титров финала (миссия 48).
// Канвас миссии → копия 854×480 → MediaRecorder (VP8) сегментами по ~7 с → IndexedDB «nexa-clips».
// Оценка сегмента: убийства, взрывы, полученный урон, стресс, катсцены. Хранятся лучшие (≤2 на миссию, ≤48 шт., ≤80 МБ).
// Всё локально, наружу ничего не уходит. ?clips=0 — выключено, ?clips=clear — стереть записи, ?clips=1 — писать и на LOW.
// API: window.NexaClips { ok, flush(), hold(on), pick(n), revoke(list), count(), clear() }. Без поддержки браузера — безопасные заглушки.
(function () {
  'use strict';
  const API = window.NexaClips = {
    ok: false, hold() {}, revoke() {},
    flush() { return Promise.resolve(); }, pick() { return Promise.resolve([]); }, count() { return Promise.resolve(0); }, clear() { return Promise.resolve(); }
  };
  const QS = location.search;
  if (/[?&]clips=0\b/.test(QS)) return;
  if (!window.MediaRecorder || !window.indexedDB || !HTMLCanvasElement.prototype.captureStream) return;
  let MIME = '';
  ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4'].some((m) => { try { if (MediaRecorder.isTypeSupported(m)) { MIME = m; return true; } } catch (e) { /* дальше */ } return false; });
  if (!MIME) return;

  const W = 854, H = 480, FPS = 20, BPS = 1400000, SEG = 7000, PER = 2, KEEP = 48, MAXB = 80 * 1048576, MINB = 30000;
  const FORCE = /[?&]clips=1\b/.test(QS);
  const DBN = 'nexa-clips', ST = 'clips';

  // ------------------------------------------------------------------ IndexedDB
  let dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise((res, rej) => {
      let q;
      try { q = indexedDB.open(DBN, 1); } catch (e) { rej(e); return; }
      q.onupgradeneeded = () => { q.result.createObjectStore(ST, { keyPath: 'id', autoIncrement: true }); };
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
      q.onblocked = () => rej(new Error('blocked'));
    });
    dbP.catch(() => { dbP = null; });
    return dbP;
  }
  // fn(store) → IDBRequest | undefined; промис выполняется по завершении транзакции
  function tx(mode, fn) {
    return db().then((d) => new Promise((res, rej) => {
      let t, out;
      try { t = d.transaction(ST, mode); out = fn(t.objectStore(ST)); } catch (e) { rej(e); return; }
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined);
      t.onerror = t.onabort = () => rej(t.error);
    }));
  }
  const all = () => tx('readonly', (s) => s.getAll()).then((a) => a || []);
  const put = (rec) => tx('readwrite', (s) => s.add(rec));

  // оставляем ≤PER лучших на миссию, затем общий лимит по числу и размеру (сначала слабые и старые)
  async function prune() {
    let a = await all();
    const del = [], by = {};
    a.forEach((c) => { (by[c.mission] || (by[c.mission] = [])).push(c); });
    Object.keys(by).forEach((k) => { by[k].sort((x, y) => y.score - x.score).slice(PER).forEach((c) => del.push(c)); });
    a = a.filter((c) => del.indexOf(c) < 0).sort((x, y) => (x.score - y.score) || (x.ts - y.ts));
    let bytes = a.reduce((s, c) => s + (c.size || 0), 0);
    while (a.length && (a.length > KEEP || bytes > MAXB)) { const c = a.shift(); bytes -= c.size || 0; del.push(c); }
    if (del.length) await tx('readwrite', (s) => { del.forEach((c) => s.delete(c.id)); });
  }

  // ------------------------------------------------------------------ копия кадра и сегменты
  const S = { r: null, seg: null, hold: false, lastGrab: 0, blasts: 0, k0: 0, hp0: 0, lf: 0, ema: 0, slowN: 0, off: null, q: Promise.resolve() };
  let cv = null, cx = null, stream = null, rf = null;
  function ensureStream() {
    if (stream) return true;
    try {
      cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      cx = cv.getContext('2d', { alpha: false });
      cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H);
      stream = cv.captureStream(0);
      const tr = stream.getVideoTracks()[0];
      if (tr && tr.requestFrame) rf = () => tr.requestFrame();
      else if (stream.requestFrame) rf = () => stream.requestFrame();
      else { stream.getTracks().forEach((t) => t.stop()); stream = cv.captureStream(FPS); rf = null; }
      return true;
    } catch (e) { stream = null; return false; }
  }
  function grab(src) {
    const t = performance.now();
    if (t - S.lastGrab < 1000 / FPS - 2) return;
    const sw = src.width, sh = src.height;
    if (!sw || !sh) return;
    S.lastGrab = t;
    const k = Math.max(W / sw, H / sh), dw = sw * k, dh = sh * k;
    try { cx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh); } catch (e) { return; }
    if (rf) rf();
  }

  async function saveSeg(seg) {
    if (!seg.chunks.length) return;
    const blob = new Blob(seg.chunks, { type: MIME.split(';')[0] });
    const dur = Math.round(performance.now() - seg.t0);
    if (blob.size < MINB || dur < 2500) return;
    await put({ ts: Date.now(), mission: seg.mission, score: Math.round(seg.score * 10) / 10, dur, size: blob.size, mime: blob.type, blob });
    await prune();
  }
  function startSeg(r) {
    if (!ensureStream()) return;
    const chunks = [];
    let rec;
    try { rec = new MediaRecorder(stream, { mimeType: MIME, videoBitsPerSecond: BPS }); } catch (e) { return; }
    const seg = { rec, chunks, t0: performance.now(), mission: r.taskId, score: 0, done: null, resolve: null };
    seg.done = new Promise((res) => { seg.resolve = res; });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => { S.q = S.q.then(() => saveSeg(seg)).catch(() => {}).then(() => seg.resolve()); };
    rec.onerror = () => seg.resolve();
    try { rec.start(); } catch (e) { return; }
    S.seg = seg;
  }
  function endSeg() {
    const seg = S.seg; S.seg = null;
    if (!seg) return S.q;
    try { if (seg.rec.state !== 'inactive') seg.rec.stop(); else seg.resolve(); } catch (e) { seg.resolve(); }
    return seg.done;
  }

  // ------------------------------------------------------------------ подключение к текущей миссии
  function attach(r) {
    S.r = r; S.blasts = 0; S.k0 = r.cb ? r.cb.kills : 0; S.hp0 = r.hp;
    const rd = r.renderer;
    if (rd && !rd.__nexaClips) {
      rd.__nexaClips = true;
      const o = rd.render;
      rd.render = function (a, b) {
        o.call(this, a, b);
        try {
          if (S.r === r && S.seg && this.getRenderTarget() === null) {
            const n = performance.now();
            if (S.lf) { const d = n - S.lf; S.ema = S.ema ? S.ema * 0.95 + d * 0.05 : d; }
            S.lf = n;
            grab(this.domElement);
          }
        } catch (e) { /* запись не должна ломать кадр */ }
      };
    }
    const sn = r.snd;
    if (sn && !sn.__nexaClips) {
      sn.__nexaClips = true;
      if (sn.blast) { const ob = sn.blast; sn.blast = function () { if (S.r === r) S.blasts += 1; return ob.apply(this, arguments); }; }
      if (sn.play) { const op = sn.play; sn.play = function (n) { if (S.r === r && (n === 'boom' || n === 'explosion')) S.blasts += 0.5; return op.apply(this, arguments); }; }
    }
    startSeg(r);
  }
  function detach() {
    S.r = null;
    return endSeg();
  }
  function score(r) {
    const seg = S.seg; if (!seg) return;
    const k = r.cb ? r.cb.kills : S.k0;
    seg.score += Math.max(0, k - S.k0) * 3; S.k0 = k;
    if (typeof r.hp === 'number') { if (r.hp < S.hp0) seg.score += (S.hp0 - r.hp) / 12; S.hp0 = r.hp; }
    seg.score += S.blasts * 6; S.blasts = 0;
    seg.score += (r.stress || 0) * 0.1;
    if (r.cineDepth > 0 || r.inCinema) seg.score += 0.08;
    if (r.enemiesAlive) { try { seg.score += Math.min(r.enemiesAlive(), 8) * 0.03; } catch (e) { /* нет боя */ } }
  }
  function tick() {
    const M = window.Missions, r = M && M.current;
    if (S.hold) { if (r !== S.holdR) S.hold = false; else return; }   // стоп действует до конца этой миссии
    const live = r && r !== S.off && !r.disposed && r.raf && r.renderer && (FORCE || !r.q || r.q.maxEnemies > 6);
    if (!live) { if (S.r) detach(); return; }
    if (r !== S.r) { detach(); attach(r); }
    if (document.hidden || r.paused) { S.lf = 0; return; }
    // слабое железо: если кадр стабильно дольше ~38 мс — запись только мешает, выключаем её до конца миссии
    S.slowN = (S.seg && S.ema > 38 && !r.cineDepth) ? S.slowN + 1 : 0;
    if (S.slowN > 24) { S.off = r; S.slowN = 0; S.ema = 0; detach(); return; }
    score(r);
    if (S.seg && performance.now() - S.seg.t0 >= SEG) { endSeg(); startSeg(r); }
  }
  setInterval(tick, 250);

  // ------------------------------------------------------------------ API
  Object.assign(API, {
    ok: true,
    // завершить текущий сегмент и дождаться записи (перед показом титров)
    flush() { return endSeg().then(() => { const r = S.r; if (r && !S.hold && !r.disposed) startSeg(r); }).catch(() => {}); },
    // hold(true) — остановить запись до конца этой миссии (титры не записываем), hold(false) — снова
    hold(on) { S.hold = !!on; if (on) { S.holdR = window.Missions && window.Missions.current; S.r = null; return endSeg(); } return Promise.resolve(); },
    count() { return all().then((a) => a.length).catch(() => 0); },
    clear() { return tx('readwrite', (s) => s.clear()).catch(() => {}); },
    // n лучших клипов (≤3 на миссию), в порядке прохождения: [{url, mission, score, dur}]
    async pick(n) {
      let a;
      try { a = await all(); } catch (e) { return []; }
      const cnt = {};
      a = a.filter((c) => c && c.blob && c.size > 0).sort((x, y) => y.score - x.score).filter((c) => { cnt[c.mission] = (cnt[c.mission] || 0) + 1; return cnt[c.mission] <= 3; });
      return a.slice(0, n || 16).sort((x, y) => x.ts - y.ts).map((c) => ({ url: URL.createObjectURL(c.blob), mission: c.mission, score: c.score, dur: c.dur }));
    },
    revoke(list) { (list || []).forEach((c) => { try { URL.revokeObjectURL(c.url); } catch (e) { /* уже */ } }); }
  });
  if (/[?&]clips=clear\b/.test(QS)) API.clear();
}());
