// NEXA: эмоции — танцы по реальному захвату позы из видео. Каждый танец — РОВНО 500 ключевых кадров; весь массив лежит во внешнем JSON (assets/dance_*.json) и грузится асинхронно через fetch(), в коде цифр нет.
//  • ядро (window.EmoteCore): каталог танцев, загрузчик, интерполяция между кадрами через Math.lerp (Catmull-Rom → кубический Безье, схема де Кастельжо), ведущие часы танца (экран 60 Гц, плавно подтягиваются к треку),
//    3D-стикмен с ЖЁСТКИМИ ограничениями суставов (js/emote-ik.js: колени и локти — шарниры, назад и вбок не вывернуть), шлейфы рук, Beat Bump (бас → пульс), музыка и звуки, пружины;
//  • миссия: колесо эмоций на ЗАЖАТОЙ «B» (короткое нажатие остаётся подрывом из kit.js), отъезд камеры в 3-е лицо со свободным облётом вокруг неподвижного стикмена,
//    приглушение игрового звука (sound.js duck) и усиленная музыка танца, пружины/тряска/сжатие тела, мерцание света;
//  • отмена: движение, выстрел, любая клавиша, урон, пауза, катсцена, смерть. Обычный танец играется один раз; зацикленный (loop) повторяется, пока игрок не прервёт его; вход и выход — плавные.
// Данные собирает tools/build-dance500.js. Предпросмотр в лобби («чёрная комната с лампой») — js/emote-room.js; покупка и колесо — js/toys.js.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  const IK = window.EmoteIK;
  if (!IK) { console.warn('[emote] js/emote-ik.js не загружен'); return; }

  const NF = 500, RENDER_FPS = 60, EYE = 1.35;
  const JOINTS = ['PEL', 'NECK', 'HEAD', 'SL', 'SR', 'EL', 'ER', 'HL', 'HR', 'PL', 'PR', 'KL', 'KR', 'AL', 'AR'];
  const PEL = 0, NECK = 1, HEAD = 2, SL = 3, SR = 4, EL = 5, ER = 6, HL = 7, HR = 8, PL = 9, PR = 10, KL = 11, KR = 12, AL = 13, AR = 14;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  if (typeof Math.lerp !== 'function') Math.lerp = function (a, b, t) { return a + (b - a) * t; };   // линейная интерполяция — основа всего сглаживания ниже
  const lerp = Math.lerp;
  const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };

  // ------------------------------------------------------------------ каталог танцев
  // dur — длительность трека/круга в секундах: кадр i стоит в i·dur/500 (≈33 ключевых кадра в секунду), экран рисует 60 раз в секунду, позы между ключами даёт Math.lerp.
  // loop — зацикленный танец (кадр 500 = кадр 0): в миссии повторяется, пока игрок не выстрелит или не побежит; в предпросмотре играет без конца.
  const DEFS = [
    { id: 'emote_beat', file: 'assets/dance_500.json', music: 'assets/dance1.mp3', dur: 448 / 30, loop: false, name: 'BEAT DROP', short: 'BEAT', iconFrame: 167 },
    { id: 'emote_look', file: 'assets/dance2_500.json', music: 'assets/dance2.mp3', dur: 9.256, loop: true, name: 'LOOK WHAT I CAN DO', short: 'LOOK', iconFrame: 70 },
    { id: 'emote_comeon', file: 'assets/dance3_500.json', music: 'assets/dance3.mp3', dur: 9.808, loop: true, name: 'COME ON, STEP UP!', short: 'COME ON', iconFrame: 270 }
  ];
  const TR = {};

  // кадр = 15 суставов × XYZ, метры; лицо к +Z, Y вверх, начало под тазом. До загрузки везде лежит поза покоя: миниатюры и «пустые» вызовы не ломаются.
  const STAND = [0, 0.902, 0, 0.016, 1.361, -0.012, 0.025, 1.55, -0.033, -0.146, 1.33, -0.011, 0.174, 1.319, -0.011, -0.2838, 1.1213, -0.1767, 0.2722, 1.0843, -0.1698,
    -0.159, 1.102, 0.139, 0.168, 1.145, 0.148, -0.1, 0.905, 0, 0.1, 0.898, 0, -0.119, 0.463, -0.0825, 0.1113, 0.6074, 0.3435, -0.171, 0.067, -0.267, 0.217, 0.207, 0.195];

  function makeTrack(def) {
    const tr = Object.assign({}, def, {
      fps: NF / def.dur, dance: new Float32Array(NF * 45),
      env: new Float32Array(2),              // запечённая огибающая баса трека (60 значений/с) — запасной источник Beat Bump, когда живой AnalyserNode недоступен
      impacts: [],                           // удары ступни об пол (тряска, пыль, сжатие тела) находятся прямо в данных
      pvy: new Float32Array(NF),             // вертикальная скорость таза по кадрам (м/с): растяжение в полёте, сжатие при приземлении
      state: 'idle', promise: null, error: null
    });
    for (let f = 0; f < NF; f += 1) tr.dance.set(STAND, f * 45);
    tr.ready = () => tr.state === 'ready';
    tr.load = () => load(tr);
    derive(tr);
    return tr;
  }
  function addTrack(def) {
    if (TR[def.id]) return TR[def.id];
    DEFS.push(def); TR[def.id] = makeTrack(def);
    return TR[def.id];
  }
  const track = (id) => TR[id] || null;
  const tracks = () => DEFS.map((d) => TR[d.id]);

  // удары ступней и вертикальная скорость таза — прямо из данных (у зацикленного танца кадры замкнуты по кругу)
  function derive(tr) {
    const D = tr.dance, fps = tr.fps, loop = tr.loop, out = tr.impacts;
    const at = (f) => (loop ? (f + NF) % NF : f);
    const y = (f, j) => D[at(f) * 45 + j * 3 + 1];
    out.length = 0;
    for (let f = loop ? 0 : 2; f < (loop ? NF : NF - 1); f += 1) for (const j of [AL, AR]) {
      const v0 = (y(f - 1, j) - y(f - 2, j)) * fps, v1 = (y(f, j) - y(f - 1, j)) * fps;
      if (y(f, j) < 0.14 && v0 < -0.55 && v1 > -0.3) {
        const t = f / fps, last = out[out.length - 1], s = clamp(-v0 / 1.1, 0.3, 1);
        if (last && t - last.t < 0.12) { last.s = Math.max(last.s, s); continue; }
        out.push({ t, s, x: D[at(f) * 45 + j * 3], z: D[at(f) * 45 + j * 3 + 2] });
      }
    }
    for (let f = 1; f < NF; f += 1) tr.pvy[f] = (D[f * 45 + 1] - D[(f - 1) * 45 + 1]) * fps;
    tr.pvy[0] = loop ? (D[1] - D[(NF - 1) * 45 + 1]) * fps : tr.pvy[1];
  }

  // ------------------------------------------------------------------ загрузка из assets/dance_*.json (асинхронно)
  // fetch → строгая проверка структуры (500 кадров × 45 чисел) → данные заменяют позу покоя на месте (ссылки на массивы трека остаются теми же)
  function ingest(tr, J) {
    const bad = (m) => { throw new Error(tr.file + ': ' + m); };
    if (!J || J.format !== 'nexa-dance') bad('unknown format');
    if (J.frames !== NF) bad('frames ' + J.frames + ' (need ' + NF + ')');
    if (!Array.isArray(J.order) || J.order.join() !== JOINTS.join()) bad('joint order');
    if (!(Math.abs(J.duration - tr.dur) < 0.01)) bad('duration ' + J.duration + ' (need ' + tr.dur.toFixed(4) + ')');
    if (!!J.loop !== !!tr.loop) bad('loop flag');
    if (!Array.isArray(J.dance) || J.dance.length !== NF) bad('dance rows');
    if (!Array.isArray(J.env) || J.env.length < 60) bad('env');
    const tmp = new Float32Array(NF * 45), env = new Float32Array(J.env.length);
    for (let f = 0; f < NF; f += 1) {
      const row = J.dance[f];
      if (!Array.isArray(row) || row.length !== 45) bad('row ' + f);
      for (let k = 0; k < 45; k += 1) { const v = row[k]; if (typeof v !== 'number' || !isFinite(v)) bad('row ' + f + ' value ' + k); tmp[f * 45 + k] = v; }
    }
    for (let i = 0; i < env.length; i += 1) { const v = J.env[i]; if (typeof v !== 'number' || !isFinite(v)) bad('env ' + i); env[i] = v / 255; }
    tr.dance.set(tmp); tr.env = env; derive(tr);
  }
  function load(tr) {
    if (tr.state === 'ready') return Promise.resolve(true);
    if (tr.promise) return tr.promise;
    tr.state = 'loading'; tr.error = null;
    tr.promise = fetch(tr.file, { cache: 'no-cache' })
      .then((res) => { if (!res.ok) throw new Error(tr.file + ': HTTP ' + res.status); return res.json(); })
      .then((J) => { ingest(tr, J); tr.state = 'ready'; return true; })
      .catch((e) => { tr.state = 'error'; tr.error = e; console.warn('[emote]', e); return false; })
      .then((ok) => { tr.promise = null; return ok; });   // после сбоя следующий load() пробует снова
    return tr.promise;
  }
  DEFS.forEach((d) => { TR[d.id] = makeTrack(d); });
  const ID = DEFS[0].id, DEF0 = TR[ID];
  tracks().forEach((tr) => { tr.load(); });
  const isReady = (id) => { const tr = TR[id || ID]; return !!tr && tr.state === 'ready'; };

  // ------------------------------------------------------------------ интерполяция между ключевыми кадрами: Math.lerp
  // Catmull-Rom как кубический Безье (c1 = p1 + (p2 − p0)/6, c2 = p2 − (p3 − p1)/6), схема де Кастельжо из Math.lerp: скорость непрерывна, «лесенки» 33 к/с на экране 60 Гц нет
  function cubic(p0, p1, p2, p3, u) {
    const c1 = p1 + (p2 - p0) / 6, c2 = p2 - (p3 - p1) / 6;
    const a = Math.lerp(p1, c1, u), b = Math.lerp(c1, c2, u), c = Math.lerp(c2, p2, u);
    return Math.lerp(Math.lerp(a, b, u), Math.lerp(b, c, u), u);
  }
  // дробный номер кадра для времени t: у зацикленного танца — по кругу, у обычного — с упором в крайние кадры
  const frameAt = (tr, t) => { const f = t * tr.fps; return tr.loop ? ((f % NF) + NF) % NF : clamp(f, 0, NF - 1); };
  const IDX = [0, 0, 0, 0];
  function around(tr, f) {   // 4 соседних кадра для кубической интерполяции; возвращает долю u внутри кадра
    const i1 = Math.floor(f);
    if (tr.loop) { IDX[0] = (i1 + NF - 1) % NF; IDX[1] = i1 % NF; IDX[2] = (i1 + 1) % NF; IDX[3] = (i1 + 2) % NF; }
    else { IDX[0] = Math.max(0, i1 - 1); IDX[1] = i1; IDX[2] = Math.min(NF - 1, i1 + 1); IDX[3] = Math.min(NF - 1, i1 + 2); }
    return f - i1;
  }
  function sampleDance(t, out, tr) {
    tr = tr || DEF0;
    const D = tr.dance, u = around(tr, frameAt(tr, t)), i0 = IDX[0] * 45, i1 = IDX[1] * 45, i2 = IDX[2] * 45, i3 = IDX[3] * 45;
    for (let k = 0; k < 45; k += 1) out[k] = cubic(D[i0 + k], D[i1 + k], D[i2 + k], D[i3 + k], u);
    return out;
  }
  function sampleJoint(t, j, o, tr) {
    tr = tr || DEF0;
    const D = tr.dance, u = around(tr, frameAt(tr, t)), i0 = IDX[0] * 45 + j * 3, i1 = IDX[1] * 45 + j * 3, i2 = IDX[2] * 45 + j * 3, i3 = IDX[3] * 45 + j * 3;
    for (let k = 0; k < 3; k += 1) o[k] = cubic(D[i0 + k], D[i1 + k], D[i2 + k], D[i3 + k], u);
    return o;
  }
  function envAt(t, tr) {
    tr = tr || DEF0;
    const E = tr.env; if (tr.loop) t = ((t % tr.dur) + tr.dur) % tr.dur;
    const f = clamp(t * 60, 0, E.length - 1.001), i = f | 0;
    return Math.lerp(E[i], E[i + 1], f - i);
  }
  function pvyAt(t, tr) {
    tr = tr || DEF0;
    const f = frameAt(tr, t), i = Math.floor(f), j = tr.loop ? (i + 1) % NF : Math.min(NF - 1, i + 1);
    return Math.lerp(tr.pvy[i], tr.pvy[j], f - i);
  }
  // удары ступни со временем в (a, b]; окно не шире 0.3 с (после скачка часов не «стреляет» пачкой); у зацикленного танца — по кругу
  function impactsIn(tr, a, b, fn) {
    const L = tr.impacts; if (!L.length || !(b > a)) return;
    if (b - a > 0.3) a = b - 0.3;
    if (!tr.loop) { for (let i = 0; i < L.length; i += 1) if (L[i].t > a && L[i].t <= b) fn(L[i]); return; }
    const d = tr.dur, a0 = ((a % d) + d) % d, b0 = a0 + (b - a);
    for (let i = 0; i < L.length; i += 1) { const t = L[i].t; if ((t > a0 && t <= b0) || (t + d > a0 && t + d <= b0)) fn(L[i]); }
  }
  // смешивание двух поз (45 чисел) через Math.lerp: плавный вход в танец и выход из него
  function mixPose(a, b, k, out) { for (let i = 0; i < 45; i += 1) out[i] = Math.lerp(a[i], b[i], k); return out; }
  // поза покоя = стартовая поза танца + дыхание
  function idlePose(t, out, tr) {
    sampleDance(0, out, tr);
    const b = Math.sin(t * 1.9) * 0.007;
    out[NECK * 3 + 1] += b; out[HEAD * 3 + 1] += b; out[SL * 3 + 1] += b; out[SR * 3 + 1] += b;
    return out;
  }
  // Ведущие часы танца. <audio>.currentTime обновляется ступеньками (по 20–50 мс), и поза «дёргалась» бы вместе с ним, поэтому время идёт по кадрам экрана,
  // а к позиции трека подтягивается плавно (при рассинхроне больше 0.25 с — сразу). S.t — секунды танца; у зацикленного танца S.t растёт без предела, трек сверяется по кругу.
  function danceClock(S, M, dt, tr) {
    tr = tr || DEF0;
    S.t += dt;
    if (M && M.running()) {
      let err = M.time() - (tr.loop ? S.t % tr.dur : S.t);
      if (tr.loop) err -= tr.dur * Math.round(err / tr.dur);
      if (Math.abs(err) > 0.25) S.t += err; else S.t += err * Math.min(1, dt * 4);
    }
    return S.t;
  }

  // ------------------------------------------------------------------ пружины
  const spr = (x) => ({ x: x || 0, v: 0 });
  function sprStep(s, target, k, d, dt) { // полунеявный Эйлер с под-шагами: устойчив при любом dt
    const n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
    for (let i = 0; i < n; i += 1) { s.v += ((target - s.x) * k - s.v * d) * h; s.x += s.v * h; }
  }

  // ------------------------------------------------------------------ Beat Bump: бас трека → пульс FOV и света
  function makeBeat() {
    const B = { k: 0, str: 0, drop: 0, avg: 0, slow: 0, peak: 0.1, prev: 0, last: -9, b: 0, fired: 0 };
    // b — текущая громкость баса 0..1; now — время в секундах; возвращает силу сработавшего удара (или 0)
    B.update = function (dt, b, on, now) {
      B.fired = 0; B.k *= Math.exp(-dt * 7);
      if (!on) { B.b = 0; B.prev = 0; return 0; }
      B.b = b;
      B.avg += (b - B.avg) * Math.min(1, dt / 0.45); B.slow += (b - B.slow) * Math.min(1, dt / 2.5);
      B.peak = Math.max(b, B.peak - dt * 0.06);   // медленно оседающий пик → адаптивный порог
      const rise = b - B.prev; B.prev = b;
      if (b > B.peak * 0.22 && b > B.avg * 1.22 + 0.045 && rise > 0 && now - B.last > 0.16) { // в тихих местах (бас < 22 % пика) пульса нет
        B.last = now;
        const rel = (b - B.avg) / Math.max(0.12, B.peak - B.avg);
        B.drop = clamp(b / (B.slow + 0.06) - 1, 0, 2);   // «дроп»: бас резко выше долгой средней → удар сильнее
        B.str = clamp(0.35 + 0.5 * rel + 0.35 * B.drop, 0.2, 1.3);
        B.k = Math.max(B.k, B.str); B.fired = B.str;
      }
      return B.fired;
    };
    return B;
  }

  // ------------------------------------------------------------------ музыка танца
  // Обычный <audio>; если страница по http(s) — ещё и узел WebAudio с анализатором (бас → Beat Bump). Громкость: при узле — gain (анализатор стоит ДО него и видит полный сигнал
  // даже в тишине), без узла — volume элемента. По file:// узел глушит CORS, поэтому там бит берётся из запечённой огибающей.
  function makeMusic(ctx, lvlFn, tr) {
    tr = tr || DEF0;
    const M = { el: new Audio(), live: false, an: null, buf: null, g: null, src: null, level: 0, target: 0, fast: false, playing: false, failed: false, blocked: false, ended: false, stopped: false, loop: !!tr.loop, dur: tr.dur };
    const el = M.el;
    el.preload = 'auto'; el.src = tr.music; el.volume = 1;
    if (ctx && ctx.state !== 'closed' && /^https?:$/.test(location.protocol)) {
      try {
        M.src = ctx.createMediaElementSource(el); M.an = ctx.createAnalyser(); M.an.fftSize = 2048; M.an.smoothingTimeConstant = 0.55;
        M.g = ctx.createGain(); M.g.gain.value = 0; M.src.connect(M.an); M.an.connect(M.g); M.g.connect(ctx.destination);
        M.buf = new Uint8Array(M.an.frequencyBinCount); M.live = true;
      } catch (e) { M.live = false; el.volume = 0; }
    } else el.volume = 0;
    el.addEventListener('playing', () => { M.playing = true; });
    el.addEventListener('pause', () => { M.playing = false; });
    // зацикленный трек перематывается в начало ровно на длине танца (а не файла): музыка и танец идут по одному кругу
    const restart = () => { try { el.currentTime = 0; const p = el.play(); if (p && p.catch) p.catch(() => { /* ignore */ }); } catch (e) { /* ignore */ } };
    el.addEventListener('ended', () => { if (M.loop && !M.stopped) { restart(); return; } M.playing = false; M.ended = true; });
    el.addEventListener('error', () => { M.failed = true; });
    M.play = function (from) {
      M.failed = M.blocked = false;
      try { el.currentTime = from || 0; const p = el.play(); if (p && p.catch) p.catch((err) => { if (err && err.name === 'NotAllowedError') M.blocked = true; else M.failed = true; }); } catch (e) { M.failed = true; }
    };
    M.time = () => el.currentTime;
    M.running = () => M.playing && !el.paused && el.currentTime > 0.02;
    // бины 1..7 ≈ 20–150 Гц при fft 2048 / 44.1 кГц; степень растягивает контраст dB-шкалы анализатора
    M.bass = function () {
      if (!M.live) return -1;
      M.an.getByteFrequencyData(M.buf);
      let s = 0; for (let i = 1; i <= 7; i += 1) s += M.buf[i];
      return Math.pow(s / 7 / 255, 3.5);
    };
    M.tick = function (dt) {
      if (M.loop && M.playing && !M.stopped && el.currentTime >= M.dur - 0.02) restart();
      M.level += clamp(M.target - M.level, -(M.fast ? 9 : 3.2) * dt, 3.2 * dt);
      const v = clamp(M.level * lvlFn(), 0, 1);
      if (M.live) M.g.gain.value = v; else el.volume = M.live ? 1 : v;
    };
    M.stop = function () {
      M.stopped = true;
      try { el.pause(); } catch (e) { /* ignore */ }
      M.playing = false;
      [M.src, M.an, M.g].forEach((n) => { try { n && n.disconnect(); } catch (e) { /* ignore */ } });
      try { el.removeAttribute('src'); el.load(); } catch (e) { /* ignore */ }
    };
    return M;
  }

  // ------------------------------------------------------------------ звуки эмоции (синтез; идут мимо приглушения игрового звука, прямо в ctx.destination)
  function makeFx(ctx, lvlFn) {
    const bus = ctx.createGain(); bus.connect(ctx.destination);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i += 1) nd[i] = Math.random() * 2 - 1;
    const lv = () => { bus.gain.value = Math.min(1.2, lvlFn()) * 0.9; };
    function noise(dur, f, q, vol, type, delay) {
      if (ctx.state === 'closed') return; lv();
      const t = ctx.currentTime + (delay || 0), s = ctx.createBufferSource(); s.buffer = nb;
      const fl = ctx.createBiquadFilter(); fl.type = type || 'lowpass'; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.setValueAtTime(Math.max(0.001, vol), t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, Math.random() * 1.4, dur + 0.05);
    }
    function tone(f0, f1, dur, vol, delay) {
      if (ctx.state === 'closed') return; lv();
      const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
      g.gain.setValueAtTime(Math.max(0.001, vol), t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
    }
    return {
      bus,
      tick() { noise(0.02, 3400, 2.5, 0.07, 'highpass'); tone(210, 95, 0.04, 0.05); },                       // сухой щелчок + короткий низкий стук (смена сектора)
      whoosh(k) { noise(0.45, 1700, 1.1, 0.28 * (k || 1), 'bandpass'); },
      pull(k) { k = k || 1; tone(112, 28, 0.7, 0.62 * k); noise(0.5, 170, 0.8, 0.5 * k, 'lowpass'); noise(0.5, 2200, 1.1, 0.2 * k, 'bandpass'); }, // резкий отъезд: суб-бас-удар + «вуш»
      heart(v) { tone(66, 38, 0.17, v); noise(0.08, 130, 0.7, v * 0.7, 'lowpass'); tone(56, 34, 0.15, v * 0.7, 0.2); }, // «туп-тум»
      stomp(s) { tone(90, 34, 0.22, 0.2 * s); noise(0.1, 220, 0.8, 0.12 * s, 'lowpass'); },
      bear() { noise(0.55, 240, 0.9, 0.38, 'lowpass'); tone(96, 42, 0.45, 0.32); },                          // низкий «вуш» медведя
      open() { noise(0.3, 900, 0.9, 0.16, 'bandpass'); tone(150, 320, 0.12, 0.05); }
    };
  }

  // ------------------------------------------------------------------ 3D-стикмен со «скином игрока»
  // Игрок и противник — одно тело (скелет и пропорции), различаются экипировкой: игрок светлый, с мятными перчатками и повязкой,
  // оранжевым «X» на груди и белыми наплечниками; противник тёмный с красным «визором». Здесь — игрок.
  const COL = { body: 0xe4e6f0, bodyE: 0x16171c, hand: 0x5ef0b4, handE: 0x0c3a2a, foot: 0xff6e34, footE: 0x4a1c0a, pad: 0xfafaff, head: 0x181b23 };
  function makeFigureLegacy(T, o) {
    o = o || {};
    const g = new T.Group(), geos = [], mats = [], parts = [];
    const M = (c, e) => { const m = new T.MeshLambertMaterial({ color: c, emissive: e || 0 }); mats.push(m); return m; };
    const mBody = M(COL.body, COL.bodyE), mHand = M(COL.hand, COL.handE), mFoot = M(COL.foot, COL.footE), mPad = M(COL.pad, 0x1c1c1e), mHead = M(COL.head, 0x040405);
    const cyl = new T.CylinderGeometry(1, 1, 1, 10, 1), sph = new T.SphereGeometry(1, 14, 10);
    const ring = new T.TorusGeometry(1, 0.12, 6, 28);
    geos.push(cyl, sph, ring);
    const mk = (geo, mat) => { const m = new T.Mesh(geo, mat); if (o.cast) m.castShadow = true; if (o.receive) m.receiveShadow = true; g.add(m); parts.push(m); return m; };
    const BONES = [[PEL, NECK, 0.072, mBody], [SL, SR, 0.045, mBody], [PL, PR, 0.05, mBody], [SL, EL, 0.04, mBody], [EL, HL, 0.034, mBody], [SR, ER, 0.04, mBody], [ER, HR, 0.034, mBody],
      [PL, KL, 0.054, mBody], [KL, AL, 0.045, mBody], [PR, KR, 0.054, mBody], [KR, AR, 0.045, mBody], [NECK, HEAD, 0.04, mBody]].map((b) => ({ a: b[0], b: b[1], r: b[2], m: mk(cyl, b[3]) }));
    const BALLS = [[PEL, 0.074, mBody], [NECK, 0.05, mBody], [EL, 0.04, mBody], [ER, 0.04, mBody], [KL, 0.053, mBody], [KR, 0.053, mBody], [AL, 0.046, mBody], [AR, 0.046, mBody], [PL, 0.052, mBody], [PR, 0.052, mBody]]
      .map((b) => ({ j: b[0], r: b[1], m: mk(sph, b[2]) }));
    const GLOVES = [HL, HR].map((j) => ({ j, m: mk(sph, mHand) }));
    const PADS = [SL, SR].map((j) => ({ j, m: mk(sph, mPad) }));
    const FEET = [[AL, -1], [AR, 1]].map((f) => ({ j: f[0], sg: f[1], m: mk(cyl, mFoot), t: mk(sph, mFoot) }));
    const STRAPS = [mk(cyl, mFoot), mk(cyl, mFoot)];
    const headM = mk(sph, mHead), band = mk(ring, mHand), frame = mk(ring, mBody), nose = mk(sph, mFoot);
    const P = new Float32Array(45);   // локальная поза после сжатия/растяжения
    const UP = new T.Vector3(0, 1, 0), d = new T.Vector3();
    function seg(m, ax, ay, az, bx, by, bz, r) {
      d.set(bx - ax, by - ay, bz - az); const len = d.length();
      if (len < 1e-5) { m.visible = false; return; }
      m.visible = true; m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); m.scale.set(r, len, r); m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / len));
    }
    const ball = (m, x, y, z, r, sx, sy, sz) => { m.position.set(x, y, z); m.scale.set(r * (sx || 1), r * (sy || 1), r * (sz || 1)); };
    const fig = {
      group: g, P, ox: 0, oz: 0, h: 0,
      // sq = {y, xz}: пружинное сжатие/растяжение (масштаб по высоте от пола и по XZ вокруг таза)
      update(local, sq) {
        const sy = sq ? sq.y : 1, sxz = sq ? sq.xz : 1, px = local[0], pz = local[2];
        for (let j = 0; j < 15; j += 1) { P[j * 3] = px + (local[j * 3] - px) * sxz; P[j * 3 + 1] = local[j * 3 + 1] * sy; P[j * 3 + 2] = pz + (local[j * 3 + 2] - pz) * sxz; }
        const q = (j, k) => P[j * 3 + k];
        for (const b of BONES) seg(b.m, q(b.a, 0), q(b.a, 1), q(b.a, 2), q(b.b, 0), q(b.b, 1), q(b.b, 2), b.r);
        for (const b of BALLS) ball(b.m, q(b.j, 0), q(b.j, 1), q(b.j, 2), b.r);
        for (const b of GLOVES) ball(b.m, q(b.j, 0), q(b.j, 1), q(b.j, 2), 0.056);
        for (const b of PADS) ball(b.m, q(b.j, 0), q(b.j, 1) + 0.01, q(b.j, 2), 0.066, 1.15, 0.8, 1.1);
        for (const f of FEET) { // стопа: носок вперёд по направлению тела
          const ax = q(f.j, 0), ay = q(f.j, 1), az = q(f.j, 2), tx = ax + f.sg * 0.02, ty = ay - 0.06, tz = az + 0.17;
          seg(f.m, ax, ay, az, tx, ty, tz, 0.04); ball(f.t, tx, ty, tz, 0.042);
        }
        // оранжевый «X» ремней на груди: с отступом вперёд от тела
        const lp = (a, b, t, k) => q(a, k) + (q(b, k) - q(a, k)) * t;
        seg(STRAPS[0], lp(SL, PR, 0.08, 0), lp(SL, PR, 0.08, 1), lp(SL, PR, 0.08, 2) + 0.075, lp(SL, PR, 0.78, 0), lp(SL, PR, 0.78, 1), lp(SL, PR, 0.78, 2) + 0.075, 0.017);
        seg(STRAPS[1], lp(SR, PL, 0.08, 0), lp(SR, PL, 0.08, 1), lp(SR, PL, 0.08, 2) + 0.075, lp(SR, PL, 0.78, 0), lp(SR, PL, 0.78, 1), lp(SR, PL, 0.78, 2) + 0.075, 0.017);
        // голова: тёмный шар, светлое кольцо-«рамка», мятная повязка, оранжевый «нос» по взгляду
        const hx = q(HEAD, 0), hy = q(HEAD, 1), hz = q(HEAD, 2);
        ball(headM, hx, hy, hz, 0.105); ball(nose, hx, hy - 0.005, hz + 0.105, 0.02);
        band.position.set(hx, hy + 0.04, hz); band.scale.set(0.098, 0.098, 0.098); band.rotation.set(Math.PI / 2, 0, 0);
        frame.position.set(hx, hy, hz + 0.004); frame.scale.set(0.108, 0.108, 0.108);
      },
      // положение сустава в мире (после сжатия): для камеры, пыли и шлейфов
      toWorld(j, out) {
        const c = Math.cos(fig.h), s = Math.sin(fig.h), x = P[j * 3], z = P[j * 3 + 2];
        return out.set(fig.ox + x * c + z * s, P[j * 3 + 1], fig.oz - x * s + z * c);
      },
      place(ox, oz, h) { fig.ox = ox; fig.oz = oz; fig.h = h; g.position.set(ox, 0, oz); g.rotation.y = h; },
      dispose() { geos.forEach((x) => x.dispose()); mats.forEach((x) => x.dispose()); if (g.parent) g.parent.remove(g); }
    };
    return fig;
  }

  // ------------------------------------------------------------------ танцор на настоящем риге стикмена (тот же скелет и «скин игрока», что у игрока и врагов)
  // Поза из данных (15 суставов) переносится на риг: торс, таз и голова — по осям плеч и бёдер; руки и ноги — двузвенным ШАРНИРНЫМ IK (js/emote-ik.js, жёсткие ограничения):
  //  • локоть и колено — шарниры: единственная ось сгиба — локальная X, угол сгиба не меньше 3.4° → кватернион сустава поворачивает только вокруг X и только в анатомическую сторону
  //    (колено — голень назад, локоть — предплечье вперёд); вывернуть сустав «наоборот» физически нельзя, что бы ни пришло из данных, пружин или смешивания поз;
  //  • плоскость сгиба держится в конусе вокруг естественной, бедро — в конусе вокруг корпуса; слишком прямую или слишком сложенную конечность IK не ломает, а сдвигает цель вдоль луча;
  //  • длины костей рига короче/длиннее данных → цели масштабируются, корень по высоте подгоняется так, чтобы нижняя стопа стояла на уровне данных.
  // Интерфейс тот же, что у makeFigureLegacy: group, P, ox/oz/h, update(local, sq), toWorld, place, dispose; fig.rig — узлы рига (для проверок).
  const KARM = 0.85, KLEG = 0.92;   // отношение длин конечностей рига к данным (рука 0.54/0.64, нога 0.82/0.89)
  function makeFigure(T, o) {
    o = o || {};
    const RN = C && C.Run && C.Run.prototype.npc, SK = C && C.playerSkin;
    if (!RN || !SK || !T.Group) return makeFigureLegacy(T, o);
    let host, n, skin;
    try {
      host = { q: { parts: 14, shadows: !!o.cast }, scene: new T.Group(), npcs: [] };
      n = RN.call(host, 0, 0, 0);
      skin = SK(host, n);
    } catch (e) { console.warn('[emote] rig', e); return makeFigureLegacy(T, o); }
    const g = host.scene;
    if (o.receive) n.g.traverse((m) => { if (m.isMesh) m.receiveShadow = true; });
    const LIM = IK.LIM, V3 = () => [0, 0, 0], B3 = () => ({ X: V3(), Y: V3(), Z: V3() });
    const sub = (a, b, out) => { out[0] = a[0] - b[0]; out[1] = a[1] - b[1]; out[2] = a[2] - b[2]; return out; };
    const P = new Float32Array(45);
    const v = []; for (let i = 0; i < 15; i += 1) v.push(V3());   // суставы из данных (обычные массивы: математика IK работает без three.js)
    const Bp = B3(), Bc = B3(), Bh = B3();
    const dirS = V3(), up = V3(), xv = V3(), nat = V3(), pole = V3(), tt = V3(), tgt = V3(), ed = V3(), tmp = V3(), hx = V3(), hy = V3(), hz = V3();
    const hp = V3(), sp = V3(), sh = [V3(), V3()], hj = [V3(), V3()], ank = [V3(), V3()];
    const res = {};   // результат solve: один объект на все вызовы, читается сразу
    const M4 = new T.Matrix4();
    const qH = new T.Quaternion(), qC = new T.Quaternion(), qHd = new T.Quaternion(), qHi = new T.Quaternion(), qCi = new T.Quaternion(), qQ = new T.Quaternion(), qK = new T.Quaternion(), qd = new T.Quaternion();
    const shinQ = [new T.Quaternion(), new T.Quaternion()];
    const Ry = new T.Quaternion(), Rx = new T.Quaternion(), AX = new T.Vector3(1, 0, 0), AY = new T.Vector3(0, 1, 0);
    // кватернион по осям-столбцам X, Y, Z
    const axes = (X, Y, Z, q) => { M4.set(X[0], Y[0], Z[0], 0, X[1], Y[1], Z[1], 0, X[2], Y[2], Z[2], 0, 0, 0, 0, 1); return q.setFromRotationMatrix(M4); };
    // Мировой кватернион верхнего звена по шарниру: X = −s·(u × w), Y = −u (звено смотрит по −Y), Z = s·w; s = +1 у рук, −1 у ног.
    // u — направление верхнего звена, w — куда от него уходит нижнее. Тогда нижнее звено в системе верхнего = (0, −cos f, s·sin f), т.е. поворот вокруг X ровно на ∓f.
    const hingeQ = (s, u, w, q) => {
      IK.cross(u, w, hx);
      for (let k = 0; k < 3; k += 1) { hx[k] *= -s; hy[k] = -u[k]; hz[k] = s * w[k]; }
      return axes(hx, hy, hz, q);
    };
    const arms = [{ ar: n.armL, el: n.elbL, S: SL, E: EL, H: HL, sd: -1 }, { ar: n.armR, el: n.elbR, S: SR, E: ER, H: HR, sd: 1 }];
    const legs = [{ th: n.legL, kn: n.kneeL, ft: n.footL, H: PL, K: KL, A: AL, sd: -1 }, { th: n.legR, kn: n.kneeR, ft: n.footR, H: PR, K: KR, A: AR, sd: 1 }];
    const fig = {
      group: g, P, ox: 0, oz: 0, h: 0, rig: n,
      update(local, sq) {
        const sy = sq ? sq.y : 1, sxz = sq ? sq.xz : 1, px = local[0], pz = local[2];
        for (let j = 0; j < 15; j += 1) {
          const a = local[j * 3], b = local[j * 3 + 1], c = local[j * 3 + 2];
          P[j * 3] = px + (a - px) * sxz; P[j * 3 + 1] = b * sy; P[j * 3 + 2] = pz + (c - pz) * sxz;
          v[j][0] = a; v[j][1] = b; v[j][2] = c;
        }
        // таз: ось по линии бёдер, «верх» — наполовину от торса, наполовину вертикаль (таз наклоняется меньше груди)
        IK.norm(sub(v[NECK], v[PEL], tmp), dirS);
        IK.norm(sub(v[PR], v[PL], tmp), xv);
        up[0] = dirS[0] * 0.45; up[1] = dirS[1] * 0.45 + 0.55; up[2] = dirS[2] * 0.45; IK.norm(up, up);
        IK.basis(xv, up, Bp); axes(Bp.X, Bp.Y, Bp.Z, qH);
        // грудь: ось по плечам, «верх» — позвоночник; голова: ось та же, «верх» — шея → голова
        IK.norm(sub(v[SR], v[SL], tmp), xv); IK.basis(xv, dirS, Bc); axes(Bc.X, Bc.Y, Bc.Z, qC);
        IK.norm(sub(v[HEAD], v[NECK], tmp), up); IK.basis(xv, up, Bh); axes(Bh.X, Bh.Y, Bh.Z, qHd);
        qHi.copy(qH).invert(); qCi.copy(qC).invert();
        n.hips.quaternion.copy(qH); n.spine.quaternion.copy(qHi).multiply(qC); n.head.quaternion.copy(qCi).multiply(qHd);
        // положения в системе рига при условной высоте таза 0.95 (нужны только для направлений; реальная высота — ниже)
        const y0 = 0.95;
        hp[0] = px; hp[1] = y0; hp[2] = pz;
        for (let k = 0; k < 3; k += 1) sp[k] = hp[k] + Bp.Y[k] * 0.06;
        for (let i = 0; i < 2; i += 1) {
          const sd = arms[i].sd;
          for (let k = 0; k < 3; k += 1) { sh[i][k] = sp[k] + Bc.X[k] * 0.2 * sd + Bc.Y[k] * 0.46; hj[i][k] = hp[k] + Bp.X[k] * 0.095 * sd - Bp.Y[k] * 0.02; }
        }
        // руки: цель кисти = плечо рига + вектор плечо→кисть из данных (масштабированный); локоть — шарнир [0.06, 2.7] рад, плоскость сгиба в конусе вокруг «назад-вниз-наружу»
        for (let i = 0; i < 2; i += 1) {
          const a = arms[i], S = v[a.S], E = v[a.E], H = v[a.H];
          IK.norm(sub(H, S, tmp), tt);
          IK.armNat(Bc.X, Bc.Y, Bc.Z, a.sd, nat);
          IK.clampPole(tt, sub(E, S, ed), nat, LIM.elbowPole, 1, pole, LIM.fade[0], LIM.fade[1]);
          for (let k = 0; k < 3; k += 1) tgt[k] = sh[i][k] + (H[k] - S[k]) * KARM;
          IK.solve(sh[i], tgt, 0.27, 0.27, pole, LIM.elbow[0], LIM.elbow[1], res);
          hingeQ(1, res.u, res.w, qQ);
          a.ar.quaternion.copy(qCi).multiply(qQ);
          a.el.quaternion.setFromAxisAngle(AX, -res.flex);   // предплечье вперёд: только вращение вокруг X, только в одну сторону
        }
        // ноги: то же; бедро зажато конусом вокруг корпуса, колено — шарнир [0.06, 2.45] рад, плоскость сгиба «колено вперёд»
        for (let i = 0; i < 2; i += 1) {
          const l = legs[i], H = v[l.H], K = v[l.K], A = v[l.A];
          sub(A, H, ed); const L = Math.hypot(ed[0], ed[1], ed[2]);
          IK.norm(ed, tmp);
          IK.limitDir(tmp, Bp.X, Bp.Y, Bp.Z, l.sd, LIM.hipBack, LIM.hipOut, LIM.hipIn, tt);
          IK.legNat(tt, Bp.X, l.sd, nat);
          IK.clampPole(tt, sub(K, H, ed), nat, LIM.kneePole, 1, pole);
          for (let k = 0; k < 3; k += 1) tgt[k] = hj[i][k] + tt[k] * L * KLEG;
          IK.solve(hj[i], tgt, 0.42, 0.4, pole, LIM.knee[0], LIM.knee[1], res);
          hingeQ(-1, res.u, res.w, qQ);
          l.th.quaternion.copy(qHi).multiply(qQ);
          qK.setFromAxisAngle(AX, res.flex);                  // голень назад: только вращение вокруг X, только в одну сторону
          l.kn.quaternion.copy(qK);
          shinQ[i].copy(qQ).multiply(qK);                     // мировой поворот голени
          ank[i][0] = res.T[0]; ank[i][1] = res.T[1]; ank[i][2] = res.T[2];
        }
        // корень по высоте: нижняя лодыжка рига — на уровне нижней лодыжки данных (+ запас под толщину стопы), прыжки сохраняются
        n.hips.position.set(px, y0 + Math.min(v[AL][1], v[AR][1]) + 0.012 - Math.min(ank[0][1], ank[1][1]), pz);
        // стопы: носок по направлению таза (поворот вокруг вертикали), в воздухе — носок вниз
        Ry.setFromAxisAngle(AY, Math.atan2(Bp.Z[0], Bp.Z[2]));
        for (let i = 0; i < 2; i += 1) {
          Rx.setFromAxisAngle(AX, clamp((v[legs[i].A][1] - 0.1) * 2.5, 0, 0.75));
          qd.copy(Ry).multiply(Rx);
          legs[i].ft.quaternion.copy(shinQ[i]).invert().multiply(qd);
        }
        // сжатие/растяжение (пружины): масштаб по высоте от пола и по XZ вокруг таза
        n.g.scale.set(sxz, sy, sxz); n.g.position.set(px * (1 - sxz), 0, pz * (1 - sxz));
      },
      toWorld(j, out) {
        const c = Math.cos(fig.h), s = Math.sin(fig.h), x = P[j * 3], z = P[j * 3 + 2];
        return out.set(fig.ox + x * c + z * s, P[j * 3 + 1], fig.oz - x * s + z * c);
      },
      place(ox, oz, h) { fig.ox = ox; fig.oz = oz; fig.h = h; g.position.set(ox, 0, oz); g.rotation.y = h; },
      dispose() {
        skin.dispose();
        Object.keys(host.ag || {}).forEach((k) => { host.ag[k].dispose && host.ag[k].dispose(); });
        Object.keys(host.agm || {}).forEach((k) => { host.agm[k].dispose && host.agm[k].dispose(); });
        if (g.parent) g.parent.remove(g);
      }
    };
    return fig;
  }

  // мягкая «клякса» тени под ногами (в миссиях нет теней от лампы)
  function makeBlob(T) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(0.55, 'rgba(0,0,0,.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const tex = new T.CanvasTexture(cv), mat = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const geo = new T.PlaneGeometry(1, 1), m = new T.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2; m.renderOrder = 2;
    m.dispose = () => { tex.dispose(); mat.dispose(); geo.dispose(); if (m.parent) m.parent.remove(m); };
    return m;
  }

  // ------------------------------------------------------------------ шлейфы кистей: 11 точек за последние 0.2 с; видны только при быстром движении, сужаются и гаснут к хвосту
  function makeTrails(T) {
    const N = 11, STEP = 0.02, grp = new T.Group(), items = [], tmp = [0, 0, 0];
    for (let h = 0; h < 2; h += 1) {
      const geo = new T.BufferGeometry(), pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 3), idx = [];
      for (let i = 0; i < N - 1; i += 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3)); geo.setIndex(idx);
      const mat = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
      const mesh = new T.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 3; grp.add(mesh);
      items.push({ geo, mat, mesh, pos, col, wp: new Float32Array(N * 3), j: h ? HR : HL });
    }
    const dir = new T.Vector3(), tc = new T.Vector3(), sd = new T.Vector3();
    return {
      group: grp,
      // t — время танца, fig — фигура (ox, oz, h), cam — позиция камеры, flick — яркость света
      update(t, fig, cam, flick, tr) {
        const c = Math.cos(fig.h), s = Math.sin(fig.h);
        for (const it of items) {
          const wp = it.wp;
          for (let i = 0; i < N; i += 1) {
            sampleJoint(Math.max(0, t - i * STEP), it.j, tmp, tr);
            wp[i * 3] = fig.ox + tmp[0] * c + tmp[2] * s; wp[i * 3 + 1] = tmp[1]; wp[i * 3 + 2] = fig.oz - tmp[0] * s + tmp[2] * c;
          }
          const sp = Math.hypot(wp[0] - wp[12], wp[1] - wp[13], wp[2] - wp[14]) / (4 * STEP);   // скорость кисти, м/с
          const a = clamp((sp - 1.1) / 2.4, 0, 1) * 0.85 * clamp(flick == null ? 1 : flick, 0.3, 1.2);
          it.mesh.visible = a >= 0.02 && t > 0.05;
          if (!it.mesh.visible) continue;
          for (let i = 0; i < N; i += 1) {
            const k = 1 - i / (N - 1), n = Math.min(N - 1, i + 1), m = Math.max(0, i - 1);
            dir.set(wp[n * 3] - wp[m * 3], wp[n * 3 + 1] - wp[m * 3 + 1], wp[n * 3 + 2] - wp[m * 3 + 2]);
            tc.set(cam.x - wp[i * 3], cam.y - wp[i * 3 + 1], cam.z - wp[i * 3 + 2]);
            sd.crossVectors(dir, tc); if (sd.lengthSq() < 1e-9) sd.set(0, 1, 0); sd.normalize().multiplyScalar(0.035 * k);
            const o = i * 6, br = a * k * k;
            it.pos[o] = wp[i * 3] + sd.x; it.pos[o + 1] = wp[i * 3 + 1] + sd.y; it.pos[o + 2] = wp[i * 3 + 2] + sd.z;
            it.pos[o + 3] = wp[i * 3] - sd.x; it.pos[o + 4] = wp[i * 3 + 1] - sd.y; it.pos[o + 5] = wp[i * 3 + 2] - sd.z;
            it.col[o] = it.col[o + 3] = 0.37 * br; it.col[o + 1] = it.col[o + 4] = 0.94 * br; it.col[o + 2] = it.col[o + 5] = 0.71 * br;
          }
          it.geo.attributes.position.needsUpdate = true; it.geo.attributes.color.needsUpdate = true;
        }
      },
      dispose() { items.forEach((it) => { it.geo.dispose(); it.mat.dispose(); }); if (grp.parent) grp.parent.remove(grp); }
    };
  }

  // миниатюра стикмена из реальных данных танца (SVG-фрагмент)
  const BONES2D = [[PEL, NECK], [SL, SR], [SL, EL], [EL, HL], [SR, ER], [ER, HR], [PL, PR], [PL, KL], [KL, AL], [PR, KR], [KR, AR]];
  function thumbLines(frame, s, ox, oy, tr) {
    const DANCE = (tr || DEF0).dance, cx = DANCE[frame * 45];   // по тазу: фигура всегда по центру миниатюры
    const X = (j) => (DANCE[frame * 45 + j * 3] - cx) * s + ox, Y = (j) => -DANCE[frame * 45 + j * 3 + 1] * s + oy;
    return { lines: BONES2D.map((p) => [X(p[0]), Y(p[0]), X(p[1]), Y(p[1])]), head: [X(HEAD), Y(HEAD)] };
  }

  window.EmoteCore = { NF, RENDER_FPS, ID, EYE, DUR: DEF0.dur, FPS: DEF0.fps, tracks, track, addTrack, isReady, load: (id) => { const x = TR[id || ID]; return x ? x.load() : Promise.resolve(false); },
    envAt, pvyAt, sampleDance, sampleJoint, impactsIn, mixPose, idlePose, danceClock, cubic, spr, sprStep, makeBeat, makeMusic, makeFx, makeFigure, makeBlob, makeTrails, thumbLines, clamp, lerp, smooth };

  const toys = () => window.Toys;
  const owned = (id) => !!(toys() && toys().owned && toys().owned(id || ID));
  const slots = () => { const w = toys() && toys().emoteWheel ? toys().emoteWheel() : null; return Array.isArray(w) && w.length === 8 ? w : new Array(8).fill(null); };
  const hasWheel = () => !(window.NexaIntro && window.NexaIntro.locked()) && slots().some((s) => !!s && !!TR[s] && owned(s));

  // ================================================================== МИССИЯ
  if (!C || !C.Run) { window.Emote = { id: ID, def: DEF0, DUR: DEF0.dur, tracks, track, owned, slots, hasWheel }; return; }
  const Run = C.Run, P = Run.prototype;
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const IN_T = 0.55, OUT_T = 0.5, EM_FOV = 60, DIST = 3.2, BLEND_IN = 0.4;   // BLEND_IN — секунды плавного перехода из стойки в танец

  // ---------------------------------------------------------------- колесо эмоций (зажатая B)
  function buildWheel(r, em) {
    const root = document.createElement('div'); root.className = 'em-wheel';
    const svg = svgEl('svg', { viewBox: '-260 -260 520 520', class: 'em-wsvg' }, root);
    const defs = svgEl('defs', {}, svg), gr = svgEl('radialGradient', { id: 'emSel', cx: '50%', cy: '50%', r: '75%' }, defs);   // выбранный сектор: оранжевый → кроваво-красный
    svgEl('stop', { offset: '0', 'stop-color': '#ff7a3a', 'stop-opacity': '.93' }, gr); svgEl('stop', { offset: '1', 'stop-color': '#b3122a', 'stop-opacity': '.93' }, gr);
    const R = 232, rr = 96, gap = 0.035, W = em.W;
    W.secs = [];
    for (let i = 0; i < 8; i += 1) {
      const mid = -Math.PI / 2 + i * Math.PI / 4, a0 = mid - Math.PI / 8 + gap, a1 = mid + Math.PI / 8 - gap;
      const Pt = (a, rad) => (Math.cos(a) * rad).toFixed(1) + ' ' + (Math.sin(a) * rad).toFixed(1);
      const d = 'M' + Pt(a0, R) + ' A' + R + ' ' + R + ' 0 0 1 ' + Pt(a1, R) + ' L' + Pt(a1, rr) + ' A' + rr + ' ' + rr + ' 0 0 0 ' + Pt(a0, rr) + ' Z';
      const sg = svgEl('g', { class: 'sg' }, svg), path = svgEl('path', { d, class: 'sec' }, sg);
      const cx = Math.cos(mid) * 164, cy = Math.sin(mid) * 164;
      const g = svgEl('g', { transform: 'translate(' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')' }, sg);
      W.secs.push({ sg, path, g, id: null, cx, cy, mid, sc: spr(1), mx: spr(0), my: spr(0), delay: 0 });
    }
    svgEl('circle', { r: 86, class: 'em-core' }, svg);
    W.name = svgEl('text', { class: 'em-name', y: -2 }, svg); W.sub = svgEl('text', { class: 'em-sub', y: 22 }, svg);
    W.cur = svgEl('circle', { class: 'em-cur', r: 6, cx: 0, cy: 0, visibility: 'hidden' }, svg);
    r.layer.appendChild(root); W.el = root;
  }
  function wheelIcon(g, tr) {
    const t = thumbLines(tr.iconFrame, 46, 0, 26, tr), ic = svgEl('g', { class: 'ic' }, g);
    t.lines.forEach((l) => svgEl('line', { x1: l[0].toFixed(1), y1: l[1].toFixed(1), x2: l[2].toFixed(1), y2: l[3].toFixed(1) }, ic));
    svgEl('circle', { cx: t.head[0].toFixed(1), cy: t.head[1].toFixed(1), r: 5.5 }, ic);
  }
  function refreshWheel(em) {
    const W = em.W; W.slots = slots();
    W.secs.forEach((s, i) => {
      const id = W.slots[i] && TR[W.slots[i]] ? W.slots[i] : null; s.id = id; s.g.innerHTML = '';
      s.path.setAttribute('class', 'sec' + (id ? ' has' : '') + (i === W.sel ? ' sel' : ''));
      if (id) { wheelIcon(s.g, TR[id]); const t = svgEl('text', { class: 'sec-t', y: 50 }, s.g); t.textContent = TR[id].short; }
      else { const t = svgEl('text', { class: 'sec-e' }, s.g); t.textContent = '+'; }
    });
    wheelCenter(em);
  }
  // имя в центре колеса: длинное (в любом языке) — в две строки по пробелу ближе к середине и мельче, чтобы влезть в круг ядра (≈150 px)
  function wheelName(W, key, size) {
    const s = window.I18N && window.I18N.t ? window.I18N.t(key) : key, el = W.name;
    let lines = [s];
    if (s.length > 11) {
      let cut = -1; for (let i = 1; i < s.length - 1; i += 1) if (s[i] === ' ' && (cut < 0 || Math.abs(i - s.length / 2) < Math.abs(cut - s.length / 2))) cut = i;
      if (cut > 0) lines = [s.slice(0, cut), s.slice(cut + 1)];
    }
    el.textContent = '';
    lines.forEach((l, i) => { const ts = svgEl('tspan', { x: 0, dy: i ? '1.2em' : lines.length > 1 ? '-0.9em' : '0' }, el); ts.textContent = l; });
    const longest = Math.max.apply(null, lines.map((l) => l.length));
    el.style.fontSize = Math.max(11, Math.min(size, 142 / (longest * 0.85))).toFixed(1) + 'px';   // ≈0.79 em на символ с разрядкой
    return lines.length;
  }
  function wheelCenter(em) {
    const W = em.W, id = W.sel >= 0 ? W.secs[W.sel].id : null;
    const rows = wheelName(W, id ? TR[id].name : 'EMOTES', id ? 18 : 20);
    W.sub.setAttribute('y', rows > 1 ? 32 : 22);   // две строки имени — подпись ниже, чтобы не наползала
    W.sub.textContent = id ? 'RELEASE B' : (W.sel >= 0 ? 'EMPTY SLOT' : 'HOVER THE MOUSE');
  }
  function wheelGlitch(W, len) { W.gOn = len; W.ox = (Math.random() - 0.5) * 10; W.oy = (Math.random() - 0.5) * 5; W.sk = (Math.random() - 0.5) * 7; }
  function setSel(em, i) {
    const W = em.W;
    if (i === W.sel) return;
    W.sel = i; em.fx && em.fx.tick(); wheelGlitch(W, 0.05);
    if (i >= 0) W.secs[i].sc.v += 2.2;                       // «щелчок» сектора: упругий толчок масштаба
    W.secs.forEach((s, k) => s.path.setAttribute('class', 'sec' + (s.id ? ' has' : '') + (k === i ? ' sel' : '')));
    wheelCenter(em);
  }
  function wheelMove(em, dx, dy) {
    const W = em.W;
    W.vx += dx; W.vy += dy;
    const L = Math.hypot(W.vx, W.vy), M = 150;
    if (L > M) { W.vx *= M / L; W.vy *= M / L; }
    W.cur.setAttribute('cx', W.vx * 0.9); W.cur.setAttribute('cy', W.vy * 0.9); W.cur.setAttribute('visibility', 'visible');
    if (Math.hypot(W.vx, W.vy) > 34) {
      let a = Math.atan2(W.vy, W.vx) + Math.PI / 2; a = ((a % 6.2832) + 6.2832) % 6.2832;
      setSel(em, Math.floor((a + Math.PI / 8) / (Math.PI / 4)) % 8);
    }
  }
  // пружинная динамика колеса: появление с перелётом, «желе» за мышью, магнит выбранного сектора, глитч-дрожание
  function wheelFX(em, dt) {
    const W = em.W; if (!W.open) return;
    W.t += dt;
    sprStep(W.s, 1, 230, 13, dt); sprStep(W.jx, W.vx / 150, 120, 8, dt); sprStep(W.jy, W.vy / 150, 120, 8, dt);
    W.gT -= dt; if (W.gT <= 0) { wheelGlitch(W, 0.06 + Math.random() * 0.09); W.gT = 0.8 + Math.random() * 2.4; }
    if (W.gOn > 0) W.gOn = Math.max(0, W.gOn - dt);
    const g = W.gOn > 0, jx = W.jx.x, jy = W.jy.x;
    W.el.classList.toggle('glitch', g);
    const sx = W.s.x * (1 + Math.abs(jx) * 0.05 - Math.abs(jy) * 0.02), sy = W.s.x * (1 + Math.abs(jy) * 0.05 - Math.abs(jx) * 0.02);
    W.el.style.transform = 'translate(' + (jx * 12 + (g ? W.ox : 0)).toFixed(2) + 'px,' + (jy * 12 + (g ? W.oy : 0)).toFixed(2) + 'px) scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ') rotate(' + (jx * 1.4).toFixed(2) + 'deg)' + (g ? ' skewX(' + W.sk.toFixed(2) + 'deg)' : '');
    W.secs.forEach((s, i) => {
      const started = W.t >= s.delay, sel = i === W.sel;
      sprStep(s.sc, started ? (sel ? 1.07 : 1) : 0.2, 240, 17, dt);
      sprStep(s.mx, sel ? Math.cos(s.mid) * 9 + W.vx * 0.06 : 0, 200, 11, dt);       // магнит: выбранный сектор тянется к курсору
      sprStep(s.my, sel ? Math.sin(s.mid) * 9 + W.vy * 0.06 : 0, 200, 11, dt);
      s.sg.style.opacity = started ? 1 : 0;
      s.sg.setAttribute('transform', 'translate(' + s.mx.x.toFixed(2) + ' ' + s.my.x.toFixed(2) + ') translate(' + s.cx.toFixed(1) + ' ' + s.cy.toFixed(1) + ') scale(' + s.sc.x.toFixed(4) + ') translate(' + (-s.cx).toFixed(1) + ' ' + (-s.cy).toFixed(1) + ')');
    });
  }
  function openWheel(r, em) {
    const W = em.W;
    if (W.open || em.ses) return;
    if (!W.el) { buildWheel(r, em); }
    ensureAudio(r, em);
    W.open = true; W.vx = W.vy = 0; W.sel = -1; refreshWheel(em);
    W.cur.setAttribute('visibility', 'hidden');
    // появление: колесо «выпрыгивает» с перелётом (back-out), секторы вылетают по очереди упругой пружиной
    W.s.x = 0.55; W.s.v = 0; W.jx.x = W.jx.v = W.jy.x = W.jy.v = 0; W.t = 0; W.gT = 0.5 + Math.random() * 0.8; W.gOn = 0;
    W.secs.forEach((s, i) => { s.sc.x = 0.2; s.sc.v = 0; s.mx.x = s.mx.v = s.my.x = s.my.v = 0; s.delay = i * 0.03; });
    wheelFX(em, 0);
    W.el.classList.add('on'); r.layer.classList.add('em-wheel-on'); wheelGlitch(W, 0.09);
    em.fx && em.fx.open();
  }
  function closeWheel(r, em, activate) {
    const W = em.W; if (!W.open) return;
    W.open = false; W.el.classList.remove('on', 'glitch'); r.layer.classList.remove('em-wheel-on');
    const id = W.sel >= 0 ? W.secs[W.sel].id : null;
    W.sel = -1;
    if (activate && id) startSession(r, em, id);
  }

  // ---------------------------------------------------------------- звук сессии
  function ensureAudio(r, em) {
    // в заданиях без боя звукового движка ещё нет (r.snd создаёт r.combat()) — заводим его сами, как это делают игрушки
    if ((!r.snd || !r.snd.ctx || r.snd.ctx.state === 'closed') && r.ensureSnd) { r.snd = null; r.ensureSnd(); }
    const snd = r.snd; if (!snd || !snd.ctx || snd.ctx.state === 'closed') return false;
    snd.resume && snd.resume();
    if (!em.fx) em.fx = makeFx(snd.ctx, () => snd.sfxVol());
    return true;
  }

  // ---------------------------------------------------------------- сессия эмоции
  function canStart(r) {
    return !!(r.entered && !r.locked && !r.paused && !r.disposed && !r.camFree && !r.hacking && !r.choice && r.camera && window.THREE);
  }
  // плашка-подсказка поверх миссии (та же, что «HOLD B: EMOTES»)
  function notice(r, text, ms) {
    const c = document.createElement('div'); c.className = 'em-chip'; c.textContent = text; r.layer.appendChild(c);
    setTimeout(() => { c.classList.add('hide'); setTimeout(() => c.remove(), 900); }, ms || 3200);
  }
  function startSession(r, em, id) {
    if (em.ses || !canStart(r)) return;
    const tr = TR[id || ID];
    if (!tr) return;
    // данные танца ещё грузятся (или загрузка не удалась): дожидаемся fetch и стартуем; при ошибке — плашка вместо тихого провала
    if (!tr.ready()) { tr.load().then((ok) => { if (r.disposed) return; if (ok) startSession(r, em, tr.id); else notice(r, 'EMOTE DATA UNAVAILABLE'); }); return; }
    const T = THREE, p = r.p, cam = r.camera;
    ensureAudio(r, em);
    const snd = r.snd;
    const S = em.ses = { id: tr.id, tr, ph: 'in', pt: 0, t: 0, tp: 0, bl: 0, wait: 0, rt: 0, cancelled: false, music: null, beat: makeBeat(), bt: 0, hb: 0.2, conShk: 0 };
    S.fig = makeFigure(T, { cast: false });
    S.fig.place(p.x, p.z, p.yaw + Math.PI);
    S.pose = new Float32Array(45); S.tmp = new Float32Array(45); S.outPose = new Float32Array(45);
    idlePose(0, S.pose, tr); S.fig.update(S.pose, null);
    S.trails = makeTrails(T); S.blob = makeBlob(T);
    S.light = new T.PointLight(0xffe2b8, 0, 8, 2); S.light.position.set(p.x, 2.7, p.z);
    r.scene.add(S.fig.group, S.trails.group, S.blob, S.light);
    // камера: стартует с позиции взгляда игрока и откатывается к точке ПЕРЕД персонажем; дальше облёт вокруг него по пружинам (инерция)
    const fwd = new T.Vector3(); cam.getWorldDirection(fwd);
    S.from = { pos: cam.position.clone(), look: cam.position.clone().add(fwd), fov: cam.fov };
    S.cf = r.camFree = { pos: cam.position.clone(), look: S.from.look.clone(), fov: cam.fov, roll: 0 };
    S.yaw = p.yaw + Math.PI; S.pit = -0.1; S.dist = DIST; S.dS = 0.6;
    S.sy = spr(S.yaw + (Math.random() < 0.5 ? -1 : 1) * 0.24); S.sp = spr(S.pit + 0.17);   // «память взгляда»: камера сначала смотрит мимо и по пружине докатывается до танцора
    S.fovS = spr(S.from.fov); S.sq = spr(0); S.sqo = { y: 1, xz: 1 };
    S.lk = { x: spr(p.x), y: spr(EYE), z: spr(p.z) };
    S.sh = 1.3; S.roll = (Math.random() < 0.5 ? -1 : 1) * 0.07; S.zoom = 1; S.flick = 1; S.fnext = 1.5; S.fseq = null;
    const U = r.fxU; S.base = U ? { ca: U.uCA.value, gain: U.uGain.value } : null;
    // музыка
    if (snd && snd.ctx && snd.ctx.state !== 'closed') {
      S.music = makeMusic(snd.ctx, () => Math.min(1, snd.musVol() * 1.35), tr);
      S.music.target = 1; S.music.play(0);
      snd.duck(true); em.fx && (em.fx.pull(1), em.fx.heart(0.3));
    }
    r.layer.classList.add('em-on'); r.layer.classList.remove('em-wheel-on');
    r.rumble && r.rumble(0.7, 0.5, 220);
    const fl = em.flash; if (fl) { fl.style.transition = 'none'; fl.style.opacity = '0.55'; void fl.offsetWidth; fl.style.transition = 'opacity .3s ease-out'; fl.style.opacity = '0'; }
    em.hold = 0;
  }
  function releaseCam(r, S) {
    if (r.camFree === S.cf) { r.camFree = null; r.prevYaw = undefined; r.blurX = r.blurY = 0; }
  }
  function endSession(r, em, hard) {
    const S = em.ses; if (!S) return;
    em.ses = null;
    const U = r.fxU;
    if (U && S.base) { U.uCA.value = S.base.ca; U.uGain.value = S.base.gain; }
    S.fig.dispose(); S.trails.dispose(); S.blob.dispose(); r.scene.remove(S.light); S.light.dispose && S.light.dispose();
    if (S.music) S.music.stop();
    if (r.snd && r.snd.duck) r.snd.duck(false, hard ? 0.2 : 0.6);
    r.layer.classList.remove('em-on');
    releaseCam(r, S);
  }
  // начать выход из эмоции (cancel — игрок прервал: быстрее и без доигрывания)
  function leave(r, em, cancel) {
    const S = em.ses; if (!S || S.ph === 'out') return;
    S.cancelled = !!cancel; S.ph = 'out'; S.pt = 0; S.outT = cancel ? 0.32 : OUT_T; S.outPose.set(S.pose);   // из этой позы плавно уходим в стойку
    S.outFrom = { pos: S.cf.pos.clone(), look: S.cf.look.clone(), fov: S.cf.fov };
    if (S.music) { S.music.target = 0; S.music.fast = !!cancel; }
    if (r.snd && r.snd.duck) r.snd.duck(false, cancel ? 0.3 : 0.7);
    em.fx && (em.fx.whoosh(0.9), em.fx.pull(0.5));
    S.zoom = 1; S.sh = Math.max(S.sh, 0.8);
  }

  // помощник: плавная кривая
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const easeIO = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  function frameSession(r, em, dtr) {
    const S = em.ses, cam = r.camera, p = r.p, cf = S.cf, fig = S.fig;
    // нас сменил кто-то другой (катсцена, смерть): уходим без вмешательства в камеру
    if (r.camFree !== cf || r.dead || r.ending || r.disposed) { endSession(r, em, true); return; }
    // управление игрока: движение стиком/геймпадом прерывает эмоцию
    const pad = r.padMove || { x: 0, y: 0 }, K = r.keys || {};
    if (S.rt > 0.2 && (K.KeyW || K.KeyA || K.KeyS || K.KeyD || K.ArrowUp || K.ArrowDown) && S.ph !== 'out') leave(r, em, true);
    if ((Math.abs(r.stick.x) + Math.abs(r.stick.y) + Math.abs(pad.x) + Math.abs(pad.y)) > 0.35) leave(r, em, true);
    if (r.padFire || r.padRun) leave(r, em, true);   // геймпад: курок или бег тоже прерывают (мышь и Shift ловятся событиями выше)
    S.rt += dtr; S.pt += dtr;
    const snd = r.snd, U = r.fxU, M = S.music, tr = S.tr;
    if (M) M.tick(dtr);

    // ---- фазы
    if (S.ph === 'in') {
      S.wait += dtr;
      if (S.pt >= IN_T && (!M || M.running() || M.failed || M.blocked || S.wait > 1.4)) { S.ph = 'play'; S.pt = 0; S.t = M && M.running() ? M.time() : 0; S.tp = S.t; S.bl = 0; S.zoom = 0.3; }
    } else if (S.ph === 'play') {
      danceClock(S, M, dtr, tr); S.bl += dtr;
      if (!tr.loop) {   // обычный танец доигрывается и выходит сам; зацикленный идёт по кругу, пока игрок не прервёт
        if (S.t >= tr.dur + 0.45) leave(r, em, false);
        else if (M && S.t > tr.dur - 0.5) M.target = clamp((tr.dur + 0.05 - S.t) / 0.55, 0, 1);
      }
    }
    const playing = S.ph === 'play';

    // ---- Beat Bump: живой бас (http) или запечённая огибающая
    let b = 0;
    if (playing) { const lb = M ? M.bass() : -1; b = lb >= 0 && M.running() ? lb : envAt(S.t, tr); }
    const fired = S.beat.update(dtr, b, playing, S.rt);
    if (fired > 1.0 && Math.random() < 0.55) { S.fseq = [{ d: 0.03, lv: 0.4 }, { d: 0.035, lv: 1.0 }]; S.fi = 0; S.fT = S.fseq[0].d; }

    // ---- удары ступней: тряска, сжатие тела, глухой стук
    if (playing) {
      impactsIn(tr, S.tp, S.t, (im) => { S.sh = Math.min(1.8, S.sh + im.s * 1.1); S.sq.v += 1.4 * im.s; em.fx && em.fx.stomp(im.s); r.rumble && r.rumble(0.25 * im.s, 0.1, 60); });
      S.tp = S.t;
    }
    S.sh *= Math.exp(-dtr * 8); S.zoom *= Math.exp(-dtr * 5);
    const vy = playing ? pvyAt(S.t, tr) : 0;
    sprStep(S.sq, -Math.min(0.045, Math.abs(vy) * 0.035), 230, 14, dtr);   // на скорости тело слегка вытягивается; удар ногой сжимает
    const q = clamp(S.sq.x, -0.08, 0.12); S.sqo.y = 1 - q * 0.9; S.sqo.xz = 1 + q * 0.5;

    // ---- поза и фигура
    if (S.ph === 'in') idlePose(S.rt, S.pose, tr);
    else if (S.ph === 'play') {
      sampleDance(S.t, S.pose, tr);
      if (S.bl < BLEND_IN) mixPose(idlePose(S.rt, S.tmp, tr), S.pose, smooth(S.bl / BLEND_IN), S.pose);   // плавный вход: из стойки в танец
    } else mixPose(S.outPose, idlePose(S.rt, S.tmp, tr), smooth(S.pt / (S.cancelled ? 0.3 : 0.45)), S.pose);   // плавный выход: из танца в стойку
    fig.update(S.pose, S.sqo);
    S.blob.position.set(fig.ox + S.pose[0] * Math.cos(fig.h) + S.pose[2] * Math.sin(fig.h), 0.015, fig.oz - S.pose[0] * Math.sin(fig.h) + S.pose[2] * Math.cos(fig.h));
    const hy = S.pose[1], bs = 0.62 + 0.32 * clamp(1 - (hy - 0.7) * 0.9, 0, 1) + q * 0.5;
    S.blob.scale.set(bs, bs, 1); S.blob.material.opacity = 0.75 * clamp(1.05 - (hy - 0.7) * 0.6, 0.35, 1);
    // свет: мерцание — случайные микро-вспышки, сильный бит «дёргает» лампу
    S.fnext -= dtr;
    if (S.fnext <= 0 && !S.fseq) { const n = 2 + (Math.random() * 4 | 0), s = []; for (let i = 0; i < n; i += 1) s.push({ d: 0.025 + Math.random() * 0.06, lv: i % 2 ? 0.85 + Math.random() * 0.25 : 0.25 + Math.random() * 0.5 }); S.fseq = s; S.fi = 0; S.fT = s[0].d; S.fnext = 1.2 + Math.random() * 3.8; }
    let lv = 1;
    if (S.fseq) { lv = S.fseq[S.fi].lv; S.fT -= dtr; if (S.fT <= 0) { S.fi += 1; if (S.fi >= S.fseq.length) S.fseq = null; else S.fT = S.fseq[S.fi].d; } }
    S.flick = clamp((0.93 + 0.035 * Math.sin(S.rt * 7.3) + 0.025 * Math.sin(S.rt * 2.1 + 1)) * lv + S.beat.k * 0.22, 0.12, 1.5);
    const lamp = clamp(S.ph === 'out' ? 1 - S.pt / S.outT : Math.min(1, S.rt / 0.4), 0, 1);
    S.light.intensity = 1.55 * S.flick * lamp;
    S.light.position.set(fig.ox, 2.7, fig.oz);
    fig.group.visible = true;

    // ---- сердцебиение и «стена»: в начале эмоции, затухает
    S.hb -= dtr;
    if (em.fx && S.hb <= 0 && S.ph !== 'out') { em.fx.heart(0.42 * Math.exp(-S.rt / 5)); S.hb = 0.82; }

    // ---- камера: орбита вокруг фигуры, инерция, память взгляда
    sprStep(S.sy, S.yaw, 70, 9.5, dtr); sprStep(S.sp, S.pit, 70, 9.5, dtr);
    const pelx = fig.ox + S.pose[0] * Math.cos(fig.h) + S.pose[2] * Math.sin(fig.h), pelz = fig.oz - S.pose[0] * Math.sin(fig.h) + S.pose[2] * Math.cos(fig.h);
    sprStep(S.lk.x, pelx, 26, 6.5, dtr); sprStep(S.lk.y, S.pose[1] + 0.4, 26, 6.5, dtr); sprStep(S.lk.z, pelz, 26, 6.5, dtr);
    const cp = Math.cos(S.sp.x), sp = Math.sin(S.sp.x), v = S.sy.x;
    const cx = S.lk.x.x, cy = S.lk.y.x, cz = S.lk.z.x;
    // дистанция: не дальше свободного места до стены/ящика; приближение — сразу, удаление — плавно
    let free = S.dist;
    for (let d = 0.5; d <= S.dist + 0.001; d += 0.25) {
      const x = cx + Math.sin(v) * cp * d, z = cz + Math.cos(v) * cp * d;
      if (r.blocked(x, z) || cy - sp * d < 0.14) { free = Math.max(0.7, d - 0.3); break; }
    }
    S.dS = free < S.dS ? free : lerp(S.dS, free, 1 - Math.exp(-3 * dtr));
    let px = cx + Math.sin(v) * cp * S.dS, py = Math.max(0.16, cy - sp * S.dS), pz = cz + Math.cos(v) * cp * S.dS;
    let lx = cx, ly = cy, lz = cz;
    const sa = S.sh, tt = S.rt;
    // тряска от ударов: смещение камеры и лёгкий дёрг взгляда
    px += sa * 0.03 * (Math.sin(tt * 61) + Math.sin(tt * 37.3 + 1.3)) * 0.5; py += sa * 0.03 * (Math.sin(tt * 53 + 2) + Math.sin(tt * 29.1)) * 0.5;
    lx += sa * 0.01 * Math.sin(tt * 47 + 0.7); ly += sa * 0.01 * Math.sin(tt * 43 + 2.2);
    // FOV: пружина с перелётом (удар отъезда), Beat Bump сжимает кадр на басе
    sprStep(S.fovS, S.ph === 'out' ? S.outFrom.fov : EM_FOV, 60, 10, dtr);
    let fov = S.fovS.x - 2.4 * S.beat.k;
    if (S.ph === 'in') {
      const k = easeOut(clamp(S.pt / IN_T, 0, 1));
      cf.pos.set(lerp(S.from.pos.x, px, k), lerp(S.from.pos.y, py, k), lerp(S.from.pos.z, pz, k));
      cf.look.set(lerp(S.from.look.x, lx, k), lerp(S.from.look.y, ly, k), lerp(S.from.look.z, lz, k));
      cf.roll = S.roll * (1 - k);
    } else if (S.ph === 'out') {
      const k = easeIO(clamp(S.pt / S.outT, 0, 1)), ey = EYE, fy = p.yaw, fp = p.pitch;
      const ex = p.x, ez = p.z, elx = ex - Math.sin(fy) * Math.cos(fp), ely = ey + Math.sin(fp), elz = ez - Math.cos(fy) * Math.cos(fp);
      cf.pos.set(lerp(S.outFrom.pos.x, ex, k), lerp(S.outFrom.pos.y, ey, k), lerp(S.outFrom.pos.z, ez, k));
      cf.look.set(lerp(S.outFrom.look.x, elx, k), lerp(S.outFrom.look.y, ely, k), lerp(S.outFrom.look.z, elz, k));
      cf.roll = 0;
      const f1 = r.fovNow ? r.fovNow() : r.baseFov;
      fov = lerp(S.outFrom.fov, f1, k);
      if (S.pt >= S.outT) { endSession(r, em, S.cancelled); return; }
    } else { cf.pos.set(px, py, pz); cf.look.set(lx, ly, lz); cf.roll = 0; }
    cf.fov = Math.max(20, fov);
    // тело не рисуем, пока камера «в нём» (старт и возврат — камера проходит сквозь место игрока)
    const dxc = cf.pos.x - fig.ox, dzc = cf.pos.z - fig.oz;
    fig.group.visible = S.trails.group.visible = Math.hypot(dxc, dzc) > 0.5;
    S.trails.update(S.ph === 'play' && S.bl >= BLEND_IN ? S.t : 0, fig, cf.pos, S.flick, tr);
    S.blob.visible = fig.group.visible;
  }

  // пост-эффекты поверх штатных: хроматика и яркость на басе, радиальный «зум» при отъезде
  const post0 = P.xfPost;
  P.xfPost = function () {
    if (post0) post0.call(this);
    const em = this.em, S = em && em.ses, U = this.fxU;
    if (!S || !U) return;
    const k = S.beat.k, z = S.zoom || 0;
    if (S.base) { U.uCA.value = S.base.ca + 0.0016 * clamp(k, 0, 1.2) + 0.002 * z; U.uGain.value = S.base.gain + 0.07 * clamp(k, 0, 1.2) + 0.1 * z; }
    U.uCon.value = Math.max(U.uCon.value, 0.2 * z);
  };

  // ---------------------------------------------------------------- подключение к миссии
  function attach(r) {
    if (r.em || r.touch) return;
    const em = r.em = { W: { open: false, vx: 0, vy: 0, sel: -1, secs: [], s: spr(1), jx: spr(0), jy: spr(0), gT: 1, gOn: 0, ox: 0, oy: 0, sk: 0, t: 0, el: null, slots: [] }, ses: null, fx: null, hold: 0, keyDown: false, timer: 0, chipShown: false };
    em.flash = document.createElement('div'); em.flash.className = 'em-flash'; r.layer.appendChild(em.flash);
    const cancelAny = () => { if (em.ses && em.ses.ph !== 'out') leave(r, em, true); };
    // B: короткое нажатие — подрыв (как раньше), удержание — колесо эмоций. Перехват в фазе capture, чтобы kit.js не сработал по нажатию
    r.on(window, 'keydown', (e) => {
      if (r.disposed) return;
      if (e.code === 'KeyB') {
        if (!hasWheel() || r.locked || r.paused || r.dead || r.hacking || r.choice) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.repeat) return;
        if (em.ses) { cancelAny(); return; }
        em.keyDown = true; clearTimeout(em.timer);
        em.timer = setTimeout(() => { if (em.keyDown) openWheel(r, em); }, 190);
        return;
      }
      // любая клавиша прерывает эмоцию (Shift — только зацикленную: бег = выход из бесконечного танца; у одноразового танца Shift без движения ничего не значит)
      if (em.ses && e.code !== 'Escape' && e.code !== 'Tab' && !/^F\d/.test(e.code) && (!/^(Shift|Control|Alt|Meta)/.test(e.code) || (em.ses.tr.loop && /^Shift/.test(e.code)))) cancelAny();
    }, true);
    r.on(window, 'keyup', (e) => {
      if (e.code !== 'KeyB' || !em.keyDown) return;
      em.keyDown = false; clearTimeout(em.timer);
      if (em.W.open) { closeWheel(r, em, true); return; }
      if (hasWheel() && !r.locked && !r.paused && !r.dead && !r.hacking && !r.choice && r.cb && r.detonate) r.detonate();   // короткое нажатие B — подрыв
    }, true);
    r.on(window, 'blur', () => { em.keyDown = false; clearTimeout(em.timer); if (em.W.open) closeWheel(r, em, false); });
    // мышь: клик во время колеса не стреляет; клик во время эмоции прерывает её и тоже не стреляет
    r.on(document, 'mousedown', (e) => {
      if (em.W.open || em.ses) { e.stopImmediatePropagation(); e.preventDefault(); if (em.ses && em.ses.ph !== 'out') leave(r, em, true); }
    }, true);
    r.hooks.push((dt) => {
      const dtr = dt / (r.timeScale || 1);
      if (em.W.open) { if (r.locked || r.paused || r.dead) closeWheel(r, em, false); else wheelFX(em, dtr); }
      if (em.ses) frameSession(r, em, dtr);
      // подсказка один раз за миссию (после входа в миссию)
      if (!em.chipShown && r.entered && !r.locked && hasWheel()) {
        em.chipShown = true;
        const c = document.createElement('div'); c.className = 'em-chip'; c.textContent = 'HOLD B: EMOTES'; r.layer.appendChild(c);
        setTimeout(() => { c.classList.add('hide'); setTimeout(() => c.remove(), 900); }, 5200);
      }
    });
    em.cancel = cancelAny;
  }
  const bind0 = P.bindInput;
  P.bindInput = function () { const res = bind0.apply(this, arguments); try { attach(this); } catch (e) { console.warn('[emote]', e); } return res; };
  // в режиме колеса и эмоции мышь управляет колесом / орбитой камеры, а не взглядом игрока
  const turn0 = P.turnBy;
  P.turnBy = function (dx, dy) {
    const em = this.em;
    if (em) {
      if (em.W.open) { wheelMove(em, dx / 0.0022, dy / 0.0022); return undefined; }
      if (em.ses && em.ses.ph !== 'out') {
        const S = em.ses; S.yaw -= clamp(dx, -0.4, 0.4); S.pit = clamp(S.pit - clamp(dy, -0.4, 0.4) * 0.9, -0.95, 0.55);
        return undefined;
      }
    }
    return turn0.apply(this, arguments);
  };
  const pause0 = P.setPause;
  P.setPause = function (on) {
    if (on && this.em) { if (this.em.W.open) closeWheel(this, this.em, false); if (this.em.ses) endSession(this, this.em, true); }
    return pause0.apply(this, arguments);
  };
  const hurt0 = P.hurt;
  P.hurt = function () { const em = this.em; if (em && em.ses && em.ses.ph !== 'out') leave(this, em, true); return hurt0.apply(this, arguments); };
  const disp0 = P.dispose;
  P.dispose = function () {
    const em = this.em;
    if (em) { clearTimeout(em.timer); if (em.ses) { try { endSession(this, em, true); } catch (e) { /* сцена уже уничтожается */ } } }
    return disp0.apply(this, arguments);
  };

  window.Emote = {
    id: ID, def: DEF0, DUR: DEF0.dur, tracks, track, owned, slots, hasWheel, thumb: thumbLines,
    _dbg(r) { return r && r.em ? { ses: r.em.ses && { ph: r.em.ses.ph, t: r.em.ses.t, rt: r.em.ses.rt, beat: r.em.ses.beat.k, dS: r.em.ses.dS }, wheel: { open: r.em.W.open, sel: r.em.W.sel } } : null; },
    open(r, id) { const em = r && r.em; if (em) { em.W.slots = slots(); startSession(r, em, id || ID); return !!em.ses; } return false; },
    cancel(r) { r && r.em && r.em.cancel(); }
  };
}());
