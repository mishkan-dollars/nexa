// NEXA: миссия 48 — сценарный эмбиент. Стандартный фон миссий (assets/amb*.mp3) нужен только в самом начале (склад, генераторы);
// после фальшивой концовки и мешка весь фон ведёт этот файл: K.amb.set(r, 'basement') — плавный переход между пресетами, всё синтезом WebAudio.
// Пресеты: office, cabin, yard, garage, hall, vault, gas, corridor, red, head, none. K.amb.level(r, k) — общий множитель, K.amb.pulse(r, 'bump'|'boom'|...) — разовые акценты.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.K) return;
  const F = C.f48, K = F.K, PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ------------------------------------------------------------------ узлы
  function noiseBuf(ctx, sec, pink) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i += 1) {
      const w = Math.random() * 2 - 1;
      if (pink) { b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; } else d[i] = w;
    }
    // стык цикла: короткое перекрёстное затухание
    const x = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < x; i += 1) { const k = i / x; d[n - x + i] = d[n - x + i] * (1 - k) + d[i] * k; }
    return b;
  }

  class Amb {
    constructor(r) {
      this.r = r; const snd = r.snd; this.snd = snd; this.ctx = snd && snd.ctx;
      this.cur = null; this.k = 1; this.dead = false; this.name = 'none';
      if (!this.ctx) return;
      const ctx = this.ctx;
      this.bus = ctx.createGain(); this.bus.gain.value = 0;
      this.an = ctx.createAnalyser(); this.an.fftSize = 512; this.bus.connect(this.an);
      this.bus.connect(snd.master || snd.dest || ctx.destination);
      this.nb = noiseBuf(ctx, 4, false); this.pb = noiseBuf(ctx, 6, true);
      this.timer = setInterval(() => this.tick(), 60);
    }
    tick() {
      if (this.dead || !this.ctx) return;
      const r = this.r, held = r.paused || r.disposed;
      const v = held ? 0 : clamp(this.k, 0, 3) * 0.9;
      this.bus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.12);
    }
    // ---- слои пресета (каждый возвращает функцию остановки)
    bed(g, o) { // шум через фильтр; lfo — медленная модуляция громкости/частоты
      const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = o.pink ? this.pb : this.nb; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = o.type || 'lowpass'; f.frequency.value = o.f || 400; f.Q.value = o.q || 0.7;
      const gn = ctx.createGain(); gn.gain.value = o.g || 0.1;
      s.connect(f); f.connect(gn); gn.connect(g);
      const stops = [];
      const lfo = (rate, depth, target, base) => {
        const l = ctx.createOscillator(), d = ctx.createGain(); l.frequency.value = rate; d.gain.value = depth; l.connect(d); d.connect(target); l.start(); stops.push(() => { try { l.stop(); l.disconnect(); } catch (e) {} });
      };
      if (o.gust) lfo(o.gust[0], o.gust[1], gn.gain);
      if (o.sweep) lfo(o.sweep[0], o.sweep[1], f.frequency);
      s.start(0, Math.random() * 3);
      stops.push(() => { try { s.stop(); s.disconnect(); f.disconnect(); gn.disconnect(); } catch (e) {} });
      return () => stops.forEach((fn) => fn());
    }
    hum(g, o) { // стопка гармоник
      const ctx = this.ctx, gn = ctx.createGain(), lp = ctx.createBiquadFilter(), os = [];
      lp.type = 'lowpass'; lp.frequency.value = o.lp || 600; lp.Q.value = 0.5; gn.gain.value = o.g || 0.05;
      (o.f || [50]).forEach((fr, i) => {
        const x = ctx.createOscillator(), a = ctx.createGain(); x.type = o.type || 'sine'; x.frequency.value = fr * (1 + (o.det || 0) * (i % 2 ? 1 : -1)); a.gain.value = 1 / (1 + i * (o.roll === undefined ? 0.7 : o.roll));
        x.connect(a); a.connect(lp); x.start(); os.push(x, a);
      });
      let lf = null, ld = null;
      if (o.wob) { lf = ctx.createOscillator(); ld = ctx.createGain(); lf.frequency.value = o.wob[0]; ld.gain.value = o.wob[1]; lf.connect(ld); ld.connect(gn.gain); lf.start(); }
      lp.connect(gn); gn.connect(g);
      return () => { os.forEach((x) => { try { if (x.stop) x.stop(); x.disconnect(); } catch (e) {} }); try { lf && lf.stop(); lf && lf.disconnect(); ld && ld.disconnect(); lp.disconnect(); gn.disconnect(); } catch (e) {} };
    }
    // случайные события: fn(t) вызывается с интервалом [a,b] секунд, пока слой жив
    ev(a, b, fn) {
      let on = true, h = 0;
      const dest = this.cg;                                           // события уходят в шину своего пресета (затухают вместе с ним)
      const go = () => {
        if (!on || this.dead) return;
        if (!this.r.paused && !this.r.disposed) { this.cg = dest; try { fn(this.ctx.currentTime + 0.02); } catch (e) { /* звук не критичен */ } this.cg = null; }
        h = setTimeout(go, rnd(a, b) * 1000);
      };
      h = setTimeout(go, rnd(a * 0.3, b) * 1000);
      return () => { on = false; clearTimeout(h); };
    }
    // ---- синтез разовых звуков (через общий noise/tone движка, в нашу шину)
    nz(o) { this.snd.noise(Object.assign({ dest: this.cg || this.bus }, o)); }
    tn(o) { this.snd.tone(Object.assign({ dest: this.cg || this.bus }, o)); }
    set(name, o) {
      o = o || {};
      if (!this.ctx || this.dead) return;
      if (name === this.name && !o.force) return;
      this.name = name;
      const ctx = this.ctx, fade = o.fade === undefined ? 2.2 : o.fade, old = this.cur;
      if (old) { old.g.gain.cancelScheduledValues(ctx.currentTime); old.g.gain.setTargetAtTime(0, ctx.currentTime, Math.max(0.05, fade / 3)); setTimeout(() => { old.stops.forEach((fn) => { try { fn(); } catch (e) {} }); try { old.g.disconnect(); } catch (e) {} }, fade * 1000 + 400); }
      this.cur = null;
      const P = PRESETS[name]; if (!P) return;
      const g = ctx.createGain(); g.gain.value = 0; g.connect(this.bus); g.gain.setTargetAtTime(P.vol === undefined ? 1 : P.vol, ctx.currentTime, Math.max(0.05, fade / 3));
      const cur = this.cur = { name, g, stops: [] };
      this.cg = g;
      const stops = P.build(this, g, o) || [];
      cur.stops = stops;
      this.cg = null;
      cur.g2 = g;
    }
    level(k, fade) { this.k = k; }
    // разовые акценты: используют текущий пресет как приёмник
    pulse(name, k) {
      if (!this.ctx || this.dead) return;
      const t = this.ctx.currentTime + 0.01, d = (this.cur && this.cur.g) || this.bus;
      const n = (o) => this.snd.noise(Object.assign({ dest: d }, o)), tn = (o) => this.snd.tone(Object.assign({ dest: d }, o));
      k = k || 1;
      if (name === 'bump') { tn({ t, type: 'sine', f0: 70, f1: 38, dur: 0.22, g: 0.5 * k, a: 0.004 }); n({ t, type: 'lowpass', f0: 380, f1: 90, q: 0.6, dur: 0.18, g: 0.35 * k }); }
      else if (name === 'boom') { tn({ t, type: 'sine', f0: 62, f1: 24, dur: 1.4, g: 0.9 * k, a: 0.006 }); n({ t, type: 'lowpass', f0: 900, f1: 60, q: 0.5, dur: 1.8, g: 0.7 * k }); }
      else if (name === 'ding') { tn({ t, type: 'sine', f0: 1320, dur: 1.6, g: 0.14 * k, a: 0.004 }); tn({ t, type: 'sine', f0: 1980, dur: 1.1, g: 0.05 * k, a: 0.004 }); }
      else if (name === 'clank') { n({ t, type: 'bandpass', f0: 1900, q: 9, dur: 0.5, g: 0.2 * k, a: 0.001 }); tn({ t, type: 'triangle', f0: 640, f1: 410, dur: 0.4, g: 0.1 * k, lp: 2400 }); }
      else if (name === 'beep') { tn({ t, type: 'square', f0: 1040, dur: 0.12, g: 0.05 * k, lp: 3200 }); }
      else if (name === 'hit') { tn({ t, type: 'sine', f0: 90, f1: 40, dur: 0.3, g: 0.7 * k, a: 0.003 }); n({ t, type: 'bandpass', f0: 600, q: 0.8, dur: 0.12, g: 0.4 * k }); }
      else if (name === 'pass') { // встречная/обгоняемая машина проносится мимо: свист ветра и ломаный гул
        n({ t, type: 'bandpass', f0: 2600, f1: 380, q: 1.1, dur: 0.55, g: 0.34 * k, a: 0.05 }); n({ t: t + 0.04, type: 'lowpass', f0: 900, f1: 140, q: 0.6, dur: 0.5, g: 0.26 * k, a: 0.06 });
        tn({ t, type: 'sawtooth', f0: 190, f1: 118, dur: 0.5, g: 0.05 * k, a: 0.07, lp: 700 });
      }
      else if (name === 'squeal') { n({ t, type: 'bandpass', f0: 2900, f1: 2300, q: 7, dur: 0.7, g: 0.12 * k, a: 0.08 }); tn({ t, type: 'sawtooth', f0: 1180, f1: 940, dur: 0.7, g: 0.03 * k, a: 0.1, lp: 3200 }); }
      else if (name === 'honk') { // чужой клаксон с эффектом Доплера: частота падает
        tn({ t, type: 'sawtooth', f0: 520, f1: 410, dur: 1.0, g: 0.07 * k, a: 0.03, lp: 2200 }); tn({ t, type: 'sawtooth', f0: 655, f1: 515, dur: 1.0, g: 0.06 * k, a: 0.03, lp: 2200 });
      }
      else if (name === 'thunk') { tn({ t, type: 'sine', f0: 58, f1: 30, dur: 0.3, g: 0.55 * k, a: 0.003 }); n({ t, type: 'lowpass', f0: 240, f1: 70, q: 0.6, dur: 0.22, g: 0.3 * k }); }
      else if (name === 'rumble') { n({ t, type: 'lowpass', f0: 220, f1: 50, q: 0.5, dur: 3.2, g: 0.6 * k, a: 0.6 }); tn({ t, type: 'sine', f0: 44, f1: 28, dur: 3.2, g: 0.5 * k, a: 0.5 }); }
      else if (name === 'scream') { // женский крик: два слегка расстроенных голоса + хрип; высота случайная, к концу срывается
        const f = rnd(780, 1080), dur = rnd(0.7, 1.15);
        tn({ t, type: 'sawtooth', f0: f * 0.88, f1: f * 1.12, dur, g: 0.05 * k, a: 0.05, lp: 3400 }); tn({ t, type: 'sawtooth', f0: f * 0.9, f1: f * 1.06, dur, g: 0.04 * k, a: 0.06, lp: 3000 });
        tn({ t: t + dur * 0.55, type: 'sawtooth', f0: f * 1.12, f1: f * 0.7, dur: dur * 0.5, g: 0.035 * k, a: 0.02, lp: 2800 });
        n({ t, type: 'bandpass', f0: rnd(2200, 3000), q: 1.6, dur, g: 0.06 * k, a: 0.05 });
      }
      else if (name === 'shout') { // мужской вопль/приказ: ниже и грубее
        const f = rnd(190, 260), dur = rnd(0.45, 0.8);
        tn({ t, type: 'sawtooth', f0: f * 1.1, f1: f * 0.8, dur, g: 0.06 * k, a: 0.03, lp: 1700 }); tn({ t, type: 'square', f0: f * 1.1 * 1.01, f1: f * 0.8, dur, g: 0.025 * k, a: 0.03, lp: 1400 });
        n({ t, type: 'bandpass', f0: rnd(900, 1300), q: 1.2, dur, g: 0.07 * k, a: 0.03 });
      }
      else if (name === 'heart') { // удар сердца (двойной): ощущение стресса игрока
        tn({ t, type: 'sine', f0: 62, f1: 38, dur: 0.2, g: 0.55 * k, a: 0.004 }); tn({ t: t + 0.2, type: 'sine', f0: 52, f1: 34, dur: 0.24, g: 0.42 * k, a: 0.004 });
        n({ t, type: 'lowpass', f0: 240, f1: 70, q: 0.6, dur: 0.18, g: 0.18 * k }); n({ t: t + 0.2, type: 'lowpass', f0: 200, f1: 60, q: 0.6, dur: 0.2, g: 0.12 * k });
      }
      else if (name === 'spinup') { // раскрутка стволов миниганa в тишине: низкий гул растёт в визг, 2.9 с
        tn({ t, type: 'sawtooth', f0: 22, f1: 200, dur: 2.9, g: 0.09 * k, a: 0.5, lp: 900 }); tn({ t, type: 'triangle', f0: 44, f1: 400, dur: 2.9, g: 0.05 * k, a: 0.5, lp: 1500 });
        n({ t, type: 'bandpass', f0: 300, f1: 1900, q: 0.9, dur: 2.9, g: 0.05 * k, a: 0.8 });
        for (let i = 0; i < 6; i += 1) n({ t: t + i * 0.42, type: 'bandpass', f0: 1800, q: 6, dur: 0.12, g: 0.03 * k, a: 0.001 });          // щелчки подшипников
      }
      else if (name === 'alarm') { // сирена охраны: две ноты
        for (let i = 0; i < 3; i += 1) { tn({ t: t + i * 0.7, type: 'sawtooth', f0: 740, f1: 740, dur: 0.34, g: 0.035 * k, a: 0.01, lp: 2600 }); tn({ t: t + i * 0.7 + 0.35, type: 'sawtooth', f0: 560, f1: 560, dur: 0.34, g: 0.035 * k, a: 0.01, lp: 2600 }); }
      }
    }
    stop(fade) { this.set('none', { fade: fade === undefined ? 1 : fade }); }
    dispose() {
      this.dead = true; clearInterval(this.timer);
      if (this.cur) { this.cur.stops.forEach((fn) => { try { fn(); } catch (e) {} }); try { this.cur.g.disconnect(); } catch (e) {} this.cur = null; }
      try { this.bus && this.bus.disconnect(); } catch (e) {}
    }
  }

  // ------------------------------------------------------------------ пресеты
  const PRESETS = {
    none: { build: () => [] },
    // кабинет: кондиционер, тихий город за стеклом, часы, редкий скрип
    office: { vol: 1, build(A, g) {
      return [
        A.bed(g, { type: 'lowpass', f: 140, q: 0.6, g: 0.08, pink: true, gust: [0.07, 0.015] }),
        A.bed(g, { type: 'bandpass', f: 620, q: 0.5, g: 0.012, pink: true, gust: [0.11, 0.004] }),                 // дальний город
        A.hum(g, { f: [120, 240], g: 0.012, lp: 500 }),
        A.ev(1, 1, (t) => { A.tn({ t, type: 'square', f0: 2200, f1: 1500, dur: 0.012, g: 0.012, lp: 3500 }); }),     // часы
        A.ev(9, 18, (t) => { A.nz({ t, type: 'lowpass', f0: 1100, f1: 160, q: 4, dur: 0.6, g: 0.05 }); }),            // скрип
        A.ev(14, 30, (t) => { A.nz({ t, type: 'bandpass', f0: 500, q: 0.7, dur: 2.2, g: 0.02, a: 1.0 }); })           // проезд внизу
      ];
    } },
    // салон: мотор, шины, ветер; громкость мотора привязана к o.speed() (0..1)
    cabin: { vol: 1, build(A, g, o) {
      const ctx = A.ctx, eng = ctx.createOscillator(), e2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), eg = ctx.createGain();
      eng.type = 'sawtooth'; e2.type = 'triangle'; eng.frequency.value = 52; e2.frequency.value = 104; lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 1.1; eg.gain.value = 0.05;
      eng.connect(lp); e2.connect(lp); lp.connect(eg); eg.connect(g); eng.start(); e2.start();
      const road = A.bed(g, { type: 'bandpass', f: 380, q: 0.6, g: 0.05, pink: true, gust: [0.4, 0.01] });
      const wind = A.bed(g, { type: 'highpass', f: 1500, q: 0.4, g: 0.006, pink: true, gust: [0.17, 0.004] });
      const hv = setInterval(() => {
        if (A.dead) return;
        const sp = clamp(o && o.speed ? o.speed() : 0.5, 0, 1.4), t = ctx.currentTime;
        eng.frequency.setTargetAtTime(48 + sp * 56, t, 0.2); e2.frequency.setTargetAtTime(96 + sp * 112, t, 0.2); lp.frequency.setTargetAtTime(200 + sp * 260, t, 0.2);
        eg.gain.setTargetAtTime(0.03 + sp * 0.04, t, 0.3);
      }, 120);
      return [() => { try { eng.stop(); e2.stop(); eng.disconnect(); e2.disconnect(); lp.disconnect(); eg.disconnect(); } catch (e) {} clearInterval(hv); }, road, wind,
        A.ev(2.5, 6, (t) => { A.tn({ t, type: 'sine', f0: 66, f1: 40, dur: 0.18, g: 0.18, a: 0.004 }); A.nz({ t, type: 'lowpass', f0: 420, f1: 100, q: 0.5, dur: 0.14, g: 0.12 }); })];   // стыки дороги
    } },
    // ночной двор: ветер, далёкий город, сверчки, вентилятор, редкая сирена
    yard: { vol: 1, build(A, g) {
      const ctx = A.ctx, cr = ctx.createOscillator(), cg = ctx.createGain(), am = ctx.createOscillator(), ad = ctx.createGain();
      cr.type = 'sine'; cr.frequency.value = 4300; cg.gain.value = 0; am.type = 'square'; am.frequency.value = 17; ad.gain.value = 0.0045; am.connect(ad); ad.connect(cg.gain);
      const amp = ctx.createGain(); amp.gain.value = 0.0045; cr.connect(cg); cg.connect(amp); amp.connect(g); cr.start(); am.start();
      return [
        () => { try { cr.stop(); am.stop(); cr.disconnect(); am.disconnect(); cg.disconnect(); amp.disconnect(); ad.disconnect(); } catch (e) {} },
        A.bed(g, { type: 'bandpass', f: 320, q: 0.35, g: 0.08, pink: true, gust: [0.09, 0.05], sweep: [0.06, 120] }),
        A.bed(g, { type: 'lowpass', f: 180, q: 0.5, g: 0.1, pink: true }),
        A.hum(g, { f: [96, 192, 288], g: 0.02, lp: 700, type: 'triangle' }),
        A.ev(18, 40, (t) => { A.tn({ t, type: 'sawtooth', f0: 560, f1: 760, dur: 2.4, g: 0.012, a: 0.9, lp: 1400 }); A.tn({ t: t + 2.4, type: 'sawtooth', f0: 760, f1: 560, dur: 2.4, g: 0.012, a: 0.5, lp: 1400 }); }),
        A.ev(7, 16, (t) => { A.nz({ t, type: 'bandpass', f0: 900, q: 1.2, dur: 1.6, g: 0.03, a: 0.5 }); })
      ];
    } },
    // подвал/гараж: гул сети, дрожащий люминесцентный звон, капли, далёкий металл
    garage: { vol: 1, build(A, g) {
      return [
        A.hum(g, { f: [50, 100, 150], g: 0.05, lp: 420, roll: 0.5 }),
        A.hum(g, { f: [100, 7800], g: 0.003, lp: 9000, type: 'sine', wob: [7, 0.0012] }),
        A.bed(g, { type: 'lowpass', f: 120, q: 0.5, g: 0.09, pink: true, gust: [0.05, 0.03] }),
        A.bed(g, { type: 'highpass', f: 4200, q: 0.4, g: 0.004, pink: true }),
        A.ev(2.5, 7, (t) => { const f = rnd(900, 1900); A.tn({ t, type: 'sine', f0: f, f1: f * 0.7, dur: 0.18, g: 0.04, a: 0.002 }); A.tn({ t: t + 0.16, type: 'sine', f0: f * 0.6, dur: 0.1, g: 0.012 }); }),   // капля + эхо
        A.ev(10, 24, (t) => { A.nz({ t, type: 'bandpass', f0: 1500, q: 8, dur: 0.7, g: 0.04, a: 0.001 }); A.tn({ t, type: 'triangle', f0: 420, f1: 300, dur: 0.6, g: 0.025, lp: 1800 }); }),             // далёкий лязг
        A.ev(20, 45, (t) => { A.tn({ t, type: 'sine', f0: 55, f1: 40, dur: 1.2, g: 0.09, a: 0.3 }); })                                                                                      // лифт где-то за стеной
      ];
    } },
    // холл 1 этажа: вентиляция, гул толпы (формантный шум), эхо большого зала
    hall: { vol: 1, build(A, g, o) {
      const q = o && o.k !== undefined ? o.k : 1;
      return [
        A.bed(g, { type: 'lowpass', f: 110, q: 0.5, g: 0.08 * q, pink: true, gust: [0.06, 0.02] }),
        A.bed(g, { type: 'bandpass', f: 520, q: 1.4, g: 0.03 * q, pink: true, gust: [0.27, 0.014] }),
        A.bed(g, { type: 'bandpass', f: 1250, q: 1.8, g: 0.014 * q, pink: true, gust: [0.4, 0.008] }),
        A.hum(g, { f: [60, 120], g: 0.02 * q, lp: 300 }),
        A.ev(5, 11, (t) => { A.tn({ t, type: 'sine', f0: 880, dur: 1.2, g: 0.02 * q, a: 0.01 }); A.tn({ t: t + 0.4, type: 'sine', f0: 660, dur: 1.4, g: 0.02 * q, a: 0.01 }); }),   // объявления
        A.ev(6, 14, (t) => { A.nz({ t, type: 'highpass', f0: 3000, q: 0.5, dur: 0.12, g: 0.03 * q }); })
      ];
    } },
    // хранилище и верхний этаж: глубокий гул, слабые писки сигнализации
    vault: { vol: 1, build(A, g) {
      return [
        A.hum(g, { f: [38, 57, 76], g: 0.09, lp: 260, roll: 0.5, wob: [0.12, 0.03] }),
        A.bed(g, { type: 'lowpass', f: 90, q: 0.5, g: 0.07, pink: true }),
        A.ev(5, 11, (t) => { A.tn({ t, type: 'square', f0: 1040, dur: 0.1, g: 0.02, lp: 3000 }); A.tn({ t: t + 0.2, type: 'square', f0: 1040, dur: 0.1, g: 0.02, lp: 3000 }); }),
        A.ev(12, 28, (t) => { A.tn({ t, type: 'sine', f0: 140, f1: 96, dur: 2.6, g: 0.07, a: 1.0 }); })
      ];
    } },
    // газ: шипение трубопровода, сирена вдали, учащённое дыхание
    gas: { vol: 1, build(A, g) {
      return [
        A.bed(g, { type: 'highpass', f: 2600, q: 0.5, g: 0.035, pink: true, gust: [0.45, 0.015] }),
        A.bed(g, { type: 'lowpass', f: 160, q: 0.6, g: 0.08, pink: true }),
        A.hum(g, { f: [50, 100], g: 0.025, lp: 380 }),
        A.ev(1.2, 1.2, (t) => { A.tn({ t, type: 'square', f0: 520, dur: 0.55, g: 0.02, lp: 1100 }); A.tn({ t: t + 0.6, type: 'square', f0: 390, dur: 0.55, g: 0.02, lp: 1100 }); }),
        A.ev(4, 9, (t) => { A.nz({ t, type: 'bandpass', f0: 1400, q: 1.0, dur: 1.1, g: 0.05, a: 0.1 }); })
      ];
    } },
    // длинный коридор подвала: сквозняк, низкое пульсирующее сердцебиение, эхо шагов
    corridor: { vol: 1, build(A, g) {
      return [
        A.bed(g, { type: 'lowpass', f: 95, q: 0.7, g: 0.12, pink: true, gust: [0.07, 0.04] }),
        A.hum(g, { f: [31, 62], g: 0.09, lp: 180, roll: 0.4 }),
        A.hum(g, { f: [100], g: 0.012, lp: 380, wob: [6.5, 0.004] }),
        A.ev(0.95, 0.95, (t) => { A.tn({ t, type: 'sine', f0: 56, f1: 34, dur: 0.24, g: 0.2, a: 0.01 }); A.tn({ t: t + 0.27, type: 'sine', f0: 50, f1: 32, dur: 0.2, g: 0.14, a: 0.01 }); }),
        A.ev(6, 14, (t) => { for (let i = 0; i < 4; i += 1) A.nz({ t: t + i * 0.52, type: 'bandpass', f0: 280, q: 1.2, dur: 0.1, g: 0.03 * (1 - i * 0.2), a: 0.003 }); }),
        A.ev(9, 19, (t) => { A.nz({ t, type: 'lowpass', f0: 900, f1: 140, q: 5, dur: 1.4, g: 0.05, a: 0.1 }); })
      ];
    } },
    // красная комната: давящий низкий пульс и скрежет
    red: { vol: 1, build(A, g) {
      return [
        A.hum(g, { f: [40, 80, 120], g: 0.12, lp: 300, roll: 0.4, wob: [1.6, 0.05], type: 'sawtooth' }),
        A.bed(g, { type: 'bandpass', f: 900, q: 0.8, g: 0.04, pink: true, gust: [0.9, 0.03] }),
        A.ev(2, 5, (t) => { A.tn({ t, type: 'sawtooth', f0: rnd(300, 900), f1: rnd(80, 200), dur: 1.0, g: 0.04, a: 0.2, lp: 2200 }); })
      ];
    } },
    // комната мониторов: электрический зуд, статика, щелчки реле
    head: { vol: 1, build(A, g) {
      return [
        A.hum(g, { f: [60, 120, 180], g: 0.04, lp: 700, roll: 0.5 }),
        A.hum(g, { f: [15700, 8000], g: 0.0016, lp: 16000, roll: 0.3 }),
        A.bed(g, { type: 'highpass', f: 2000, q: 0.5, g: 0.008, pink: true, gust: [0.3, 0.004] }),
        A.bed(g, { type: 'lowpass', f: 120, q: 0.5, g: 0.06, pink: true }),
        A.ev(2, 6, (t) => { A.nz({ t, type: 'highpass', f0: 2500, q: 1, dur: 0.03, g: 0.08, a: 0.0006 }); A.nz({ t: t + 0.09, type: 'highpass', f0: 2500, q: 1, dur: 0.02, g: 0.05 }); })
      ];
    } }
  };

  // ------------------------------------------------------------------ интерфейс
  const get = (r) => r.f48amb || (r.f48amb = new Amb(r));
  K.amb = {
    set: (r, name, o) => { if (r.snd && r.snd.ambient) { try { r.snd.ambient.set(null); } catch (e) {} } get(r).set(name, o); },   // стандартный фон — выключен навсегда
    level: (r, k) => get(r).level(k),
    pulse: (r, n, k) => get(r).pulse(n, k),
    stop: (r, fade) => { if (r.f48amb) r.f48amb.stop(fade); },
    get
  };
  // стандартный фон миссий (assets/amb*.mp3) — только пока игра идёт «как обычно»
  K.ambStd = (r, theme) => { try { r.snd && r.snd.ambient.set(theme); } catch (e) {} };

  const dc0 = C.Run.prototype.disposeCombat;
  C.Run.prototype.disposeCombat = function () {
    try { this.f48amb && this.f48amb.dispose(); this.f48amb = null; } catch (e) {}
    return dc0.call(this);
  };
}());
