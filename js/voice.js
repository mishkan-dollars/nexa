// NEXA: озвучка реплик. Субтитры r.say() остаются; если в assets/voice/ (или assets/voicelines/) лежит mp3 этой реплики — он играет вместе с ними.
// Какие файлы есть, в какой папке и сколько они длятся, знает assets/voice/list.json (его собирает `node tools/extract-voice.js`, он же запускается из build-itch.js).
// Озвучка одна на все языки интерфейса (английский голос), громкость и выключатель — как у звуковых эффектов (audio.sfxVolume/sfxEnabled × masterVolume).
// Поиск клипа: русские реплики (миссии 1–47) — по нормализованному русскому тексту (list.map); финал (миссия 48, английский текст) — по точному английскому тексту
// (list.en, пробелы схлопнуты, регистр важен) и только для миссии 48. Обработка голоса (list.fx): muffle — из-под мешка, radio — системное оповещение (WebAudio).
// Ducking: если у миссии задано run.duckOnVoice (0..1), пока говорит голос, run.vDuck плавно падает до этого значения — музыка и эмбиент миссии умножают громкость на run.vDuck.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C) return;
  const DIR = 'assets/voice/';
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toUpperCase();
  const enKey = (s) => String(s).replace(/\s+/g, ' ').trim(); // так же считает tools/extract-voice.js
  const num = (v, d) => (typeof v === 'number' ? v : d);
  let data = { files: {}, map: {}, en: {}, fx: {} }, loading = null;

  const load = () => loading || (loading = fetch(DIR + 'list.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j && j.files && j.map) data = Object.assign({ en: {}, fx: {} }, j); return data; })
    .catch(() => data));

  // реплика -> { code, dur } или null, если озвучки нет
  const find = (run, text) => {
    const hit = data.map[norm(text)];
    if (hit) {
      const m = hit.find((h) => h[0] === run.taskId) || hit[0];
      return data.files[m[1]] ? { code: m[1], dur: data.files[m[1]] } : null;
    }
    const ek = enKey(text), eh = data.en && Object.prototype.hasOwnProperty.call(data.en, ek) ? data.en[ek] : null; // английский текст: только своя миссия (48) — чужая миссия случайно не подхватит этот клип
    const e = eh && eh.find((h) => String(h[0]) === String(run.taskId));
    return e && data.files[e[1]] ? { code: e[1], dur: data.files[e[1]] } : null;
  };
  const urlOf = (code) => 'assets/' + ((data.dirs && data.dirs[code]) || 'voice') + '/' + code + '.mp3';
  const warmed = new Set();
  const LOUD = 2.2;
  const vol = (run) => {
    const A = (run.opts && run.opts.audio) || {};
    return A.sfxEnabled === false ? 0 : Math.min(1, num(A.sfxVolume, 1) * num(A.masterVolume, 0.55) * 1.8);
  };

  // ------------------------------------------------------------ обработка голоса (WebAudio): цепочка фильтров между элементом и выходом игры
  const softClip = (ctx, drive) => {
    const sh = ctx.createWaveShaper(), n = 256, c = new Float32Array(n), k = Math.tanh(drive);
    for (let i = 0; i < n; i += 1) c[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * drive) / k;
    sh.curve = c; return sh;
  };
  const bq = (ctx, type, f, q, g) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; if (g !== undefined) b.gain.value = g; return b; };
  const FX = {
    // голос из-под мешка: срезан верх (две ступени ФНЧ) и самый низ, тише обычного
    muffle: (ctx) => ({ nodes: [bq(ctx, 'highpass', 90, 0.7), bq(ctx, 'lowpass', 760, 0.6), bq(ctx, 'lowpass', 1150, 0.5)], k: 0.9 }),
    // системное оповещение: «громкоговоритель» — узкая полоса, прищепка на середине, мягкая перегрузка
    plain: () => ({ nodes: [], k: 1 }),
    radio: (ctx) => ({ nodes: [bq(ctx, 'highpass', 420, 0.8), bq(ctx, 'peaking', 1500, 1.0, 5), bq(ctx, 'lowpass', 3300, 0.7), softClip(ctx, 2.2)], k: 0.85 })
  };
  // возвращает { gain, nodes, k } или null (нет WebAudio / file:// — там элемент через MediaElementSource обнуляется; играет без обработки)
  const route = (run, el, kind) => {
    const snd = run.snd, ctx = snd && snd.ctx, make = FX[kind] || FX.plain;
    if (!ctx || !make || location.protocol === 'file:') return null;
    let src = null;
    try {
      src = ctx.createMediaElementSource(el);
      const fx = make(ctx), g = ctx.createGain();
      g.gain.value = 0;
      let node = src;
      fx.nodes.forEach((n) => { node.connect(n); node = n; });
      const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -14; lim.knee.value = 8; lim.ratio.value = 6; lim.attack.value = 0.003; lim.release.value = 0.2;
      node.connect(g); g.connect(lim); lim.connect(snd.dest || ctx.destination);
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return { src, gain: g, nodes: fx.nodes.concat([g, lim]), k: fx.k };
    } catch (e) {
      if (src) { try { src.disconnect(); src.connect(snd.dest || ctx.destination); } catch (e2) {} }   // элемент уже привязан к контексту: без обработки, но слышно (громкость — el.volume)
      return null;
    }
  };
  // громкость: у обычной реплики — el.volume; у обработанной громкость элемента 1 (volume/muted применяются ДО узла), громкость ведёт GainNode
  const setVol = (run, el) => {
    const v = vol(run), r = el.__fx;
    if (r) { r.gain.gain.value = Math.min(3, v * r.k * LOUD); } else el.volume = v;
  };
  const drop = (el) => {
    const r = el && el.__fx; if (!r) return;
    el.__fx = null;
    try { r.src.disconnect(); } catch (e) {}
    r.nodes.forEach((n) => { try { n.disconnect(); } catch (e) {} });
  };

  // ------------------------------------------------------------ ducking музыки и эмбиента под голосом
  const duckTick = (run) => {
    const el = run.voiceEl;
    const live = !!el && !run.paused && !run.disposed && vol(run) > 0 && (run.time || 0) < (run.voiceUntil || 0) + 0.5; // хвост 0.5 с: в паузах между репликами диалога музыка не успевает «выныривать»
    const to = live ? run.duckOnVoice : 1, cur = run.vDuck === undefined ? 1 : run.vDuck;
    let n = cur + (to - cur) * (to < cur ? 0.4 : 0.07); // вниз быстро (≈0.1 с), обратно плавно (≈0.7 с); шаг таймера 50 мс
    if (Math.abs(n - to) < 0.004) n = to;
    run.vDuck = n;
    if (!live && n === 1) { clearInterval(run.vDuckT); run.vDuckT = 0; }
  };
  const duckStart = (run) => {
    if (!(run.duckOnVoice < 1) || run.vDuckT) return;
    run.vDuckT = setInterval(() => { if (run.disposed) { clearInterval(run.vDuckT); run.vDuckT = 0; run.vDuck = 1; return; } duckTick(run); }, 50);
  };

  // ------------------------------------------------------------ предзагрузка клипов миссии
  // обычные миссии (≤ 7 реплик) качаются сразу; финал (130 клипов, ≈ 7 минут речи, ≈ 8 МБ) — партиями по 8 клипов в порядке кодов (D48_001 …), следующая партия через 0,6 с после предыдущей
  const BATCH = 8, GAP = 600;
  const warmBatches = (codes) => {
    let i = 0;
    const next = () => {
      if (i >= codes.length) return;
      const part = codes.slice(i, i + BATCH); i += BATCH;
      Promise.all(part.map((c) => fetch(urlOf(c)).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null))).then(() => { if (i < codes.length) setTimeout(next, GAP); });
    };
    next();
  };

  const V = C.voice = {
    load, find,
    // при старте миссии: тихо подгрузить её озвученные реплики в кеш браузера, чтобы первая реплика не ждала сеть (на itch)
    prefetch(taskId) {
      load().then(() => {
        const codes = [];
        const add = (map) => Object.keys(map || {}).forEach((k) => map[k].forEach((h) => { if (String(h[0]) === String(taskId) && data.files[h[1]] && !warmed.has(h[1])) { warmed.add(h[1]); codes.push(h[1]); } }));
        add(data.map); add(data.en);
        codes.sort();
        warmBatches(codes);
      });
    },
    reload() { loading = null; return load(); }, // перечитать list.json (например, после добавления файлов без перезагрузки страницы)
    // длительность озвучки реплики (0, если файла нет) — чтобы субтитры и шот катсцены не обрывали голос
    dur(run, text) { const v = find(run, text); return v ? v.dur : 0; },
    // голос ещё говорит (по игровым часам; пауза игры часы останавливает)
    busy(run) { return !!run.voiceEl && (run.time || 0) < (run.voiceUntil || 0); },
    // дождаться конца текущей реплики, но не дольше maxSec игровых секунд (очередь реплик: следующая не обрывает предыдущую)
    idle(run, maxSec) {
      if (!V.busy(run)) return Promise.resolve();
      const t0 = run.time || 0;
      return run.until(() => !V.busy(run) || (run.time || 0) - t0 > maxSec);
    },
    play(run, text) {
      V.stop(run);
      const v = find(run, text);
      if (!v) return null;
      const el = new Audio(urlOf(v.code));
      const fx = data.fx && data.fx[v.code];
      el.__fx = route(run, el, fx || 'plain');
      run.voiceEl = el; run.voiceUntil = (run.time || 0) + v.dur; run.voiceCode = v.code;
      setVol(run, el);
      duckStart(run);
      const p = el.play(); if (p && p.catch) p.catch(() => {});
      return v;
    },
    stop(run) {
      const el = run && run.voiceEl;
      if (!el) return;
      run.voiceEl = null; run.voiceUntil = 0; run.voiceCode = null;
      try { el.pause(); } catch (e) {}
      drop(el);
    },
    // каждый кадр, пока играет реплика: пауза вместе с игрой и живая громкость
    sync(run) {
      const el = run.voiceEl;
      if (!el) return;
      if (el.ended) { run.voiceEl = null; drop(el); return; }
      setVol(run, el);
      if (run.paused || run.disposed) { if (!el.paused) el.pause(); } else if (el.paused) { const p = el.play(); if (p && p.catch) p.catch(() => {}); }
    }
  };
  load();
}());
