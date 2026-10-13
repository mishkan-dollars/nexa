// NEXA: кинематографичная система катсцен (стиль GTA V, ручная камера Франклина): камера в руках живого оператора, а не дрон.
// Шот: { at:[x,y,z], to:[x,y,z] (оператор идёт шагом), look:цель|[x,y,z]|npc|fn, lookTo:[...] (панорама), orbit:{c:[x,z],r,a0,a1,h,ly},
//        fov, fovTo, roll, rollTo, dur, ease:'linear'|'smooth'|'out'|'in', slow (замедление), cut:'glitch' (все остальные склейки — жёсткие, без затуханий),
//        hand (сила шума, 1 по умолчанию, 0 — штатив), tense 0..1 (напряжение: сильнее тряска), frame (смещение кадра от центра в долях ширины, ±0.1 по умолчанию),
//        push (° FOV за шот: «дыхание» наезда/отъезда), dock/dockIn (шот стыкуется с видом игрока: тряска гаснет, путь не сокращается),
//        say:[кто,текст] | says:[[..],[..]], caption:'строка\nстрока', sound, run(r) (старт), end(r) (конец / пропуск) }
// Оператор-человек (ограничитель, применяется к каждому шоту автоматически): камера на высоте груди–глаз (0.7–1.8 м), ход шагом (≤0.85 м/с, до 3.2 м за шот),
//   «облёт» по кругу сжимается до шага вокруг объекта, камера не заходит в стены и реквизит. Выключить: free:true.
// Резкие повороты (whip pan) с направленным размытием: на каждой склейке (конец шота «срывается» в сторону, следующий «прилетает» с той же стороны),
//   в середине длинных шотов (оператор цепляет звук сбоку и возвращает кадр) и в панорамах look→lookTo (pan:[с,по] — окно в долях шота).
//   whip:false — выключить всё, whip:{in,out,mid:false} — по отдельности. jolt:[t,сила] — толчок камеры (взрыв).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C) return;
  const { Run, CINEMA, lerp, smooth, EYE, wrap } = C;
  const EASE = { linear: (k) => k, smooth, out: (k) => 1 - Math.pow(1 - k, 3), in: (k) => k * k * k };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // время реплики в шоте; с озвучкой (assets/voice) шот длится не меньше голоса (множитель 0.9 в runShot компенсируется делением)
  const sayTime = (l, r) => { const d = C.voice ? C.voice.dur(r, l[1]) : 0; return Math.max(0.35 + Math.max(1.8, String(l[1]).length * 0.055) + 0.4, d ? (d + 0.9) / 0.9 : 0); };

  Run.prototype.cinematic = async function (shots, o) {
    o = o || {};
    if (this.disposed || !shots || !shots.length) return;
    if (this.inCinema && this.cineInsert) await this.cineIdle(); // короткая вставка (подрыв, килкам, дверь) не должна съедать следующую катсцену
    if (this.disposed || this.inCinema) return;
    const T = THREE;
    this.inCinema = true; this.cineSkip = false; this.whipDir = 0;
    this.cineDepth += 1; this.syncLock();
    this.layer.classList.add('cinema', 'bars');
    const cf = (this.camFree = { pos: this.camera.position.clone(), look: new T.Vector3(), fov: this.camera.fov, roll: 0 });
    const fwd = new T.Vector3(); this.camera.getWorldDirection(fwd); cf.look.copy(cf.pos).add(fwd);
    try {
      for (let i = 0; i < shots.length; i += 1) {
        if (this.disposed) return;
        const s = shots[i];
        if (this.cineSkip) { s.run && s.run(this); s.end && s.end(this); continue; } // пропуск: побочные эффекты всё равно применяются
        await this.runShot(s, { first: i === 0, last: i === shots.length - 1, card: o.title && i === shots.length - 1 ? o : null, outro: o.outro });
      }
    } finally {
      this.shotState = null;
      this.inCinema = false;
      if (!this.disposed) {
        this.camFree = null; this.timeScale = 1; this.prevYaw = undefined; this.blurX = this.blurY = 0;
        this.cineDepth = Math.max(0, this.cineDepth - 1);
        this.sayId = (this.sayId || 0) + 1; C.voice && C.voice.stop(this);
        this.sub.classList.remove('on');
        this.qs('.m-card').classList.remove('on'); this.qs('.m-cap').classList.remove('on');
        this.layer.classList.remove('cinema');
        if (!this.ending) this.layer.classList.remove('bars');
        this.syncLock();
        this.fovLocked = false;
      }
    }
  };
  // дождаться конца идущей катсцены (вставки по событиям — килкам, подрыв, дверь — не должны глотать следующие шоты)
  Run.prototype.cineIdle = async function () {
    for (let i = 0; i < 400 && this.inCinema && !this.disposed; i += 1) await this.wait(0.05);
  };

  Run.prototype.runShot = async function (s, ctx) {
    const say = s.says || (s.say ? [s.say] : null);
    let dur = s.dur || 2.5;
    if (say) dur = Math.max(dur, say.reduce((a, l) => a + sayTime(l, this), 0) * 0.9);
    if (ctx.card) dur = Math.max(dur, 3.4);
    // склейки жёсткие (ритм диалога, как в GTA V): никаких затуханий и вспышек между ракурсами; только глитч-врезка NEXA
    if (s.cut === 'glitch') { this.glitch(0.28); this.sfx('error'); }
    if (this.disposed) return;
    this.timeScale = s.slow || 1;
    s.sound && this.sfx(s.sound);
    s.run && s.run(this);
    const cap = this.qs('.m-cap');
    if (s.caption) { cap.textContent = s.caption; cap.classList.add('on'); } else cap.classList.remove('on');
    if (ctx.card) {
      const card = this.qs('.m-card');
      card.querySelector('small').textContent = 'TASK ' + String(ctx.card.task).padStart(2, '0') + ' — NEXA INDUSTRIES';
      card.querySelector('h1').textContent = ctx.card.title;
      card.querySelector('p').textContent = 'SUBJECT 083';
      card.classList.add('on');
    }
    const blackIn = ctx.first && !this.cineFaded; // самый первый кадр миссии выходит из чёрного — без свайпа
    const seed = (this.shotSeq = (this.shotSeq || 0) + 1);
    const wh = whipPlan(this, s, dur, { blackIn, last: ctx.last, prevDir: this.whipDir }, seed);
    this.whipDir = wh.dir || 0;
    let st;
    const done = new Promise((res) => { st = { s, t: 0, dur, ease: EASE[s.ease || 'linear'] || EASE.linear, seed, hard: !ctx.first, dead: false, fresh: true, pl: plan(this, s, dur), wh, done: () => { st.dead = true; this.shotState = null; res(); } }; });
    this.shotState = st;
    this.applyFreeCam(0);
    if (blackIn) { this.cineFaded = true; this.fade(0, 1.1); } // выход из чёрного в первом кадре
    if (say) (async () => { for (const l of say) { if (st.dead || this.disposed) break; await this.say(l[0], l[1], l[2]); } })();
    await done;
    s.end && s.end(this);
    if (ctx.card) this.qs('.m-card').classList.remove('on');
  };

  // ------------------------------------------------------------ оператор: ограничитель пути (камера — человек, а не дрон)
  const OP = { yMin: 0.7, yMax: 1.8, speed: 0.85, move: 3.2, arc: 2.2 };
  const cy = (y) => clamp(y, OP.yMin, OP.yMax);
  // камера внутри стены/ящика на своей высоте? (колонны и стены до потолка блокируют всегда, низкие ящики — только ниже своей кромки)
  function camBlocked(r, x, y, z) {
    for (const c of r.colliders) {
      if (c.off || c.glass) continue;
      if (x > c.x0 - 0.3 && x < c.x1 + 0.3 && z > c.z0 - 0.3 && z < c.z1 + 0.3 && (c.y0 === undefined || (y > c.y0 - 0.1 && y < c.y1 + 0.1))) return true;
    }
    return false;
  }
  function nudge(r, x, y, z) {
    for (let rad = 0.4; rad <= 2.4; rad += 0.4) {
      for (let i = 0; i < 12; i += 1) {
        const a = i / 12 * Math.PI * 2, px = x + Math.sin(a) * rad, pz = z + Math.cos(a) * rad;
        if (!camBlocked(r, px, y, pz)) return [px, pz];
      }
    }
    return null;
  }
  // нормализованный шот: { a, b } (точки хода) или { orbit }; spd — скорость хода, м/с (для походки)
  function plan(r, s, dur) {
    const free = !!s.free, dock = !!(s.dock || s.dockIn);
    if (s.orbit) {
      const o = Object.assign({}, s.orbit), h0 = o.h;
      if (free) return { orbit: o, spd: 0 };
      o.h = cy(o.h);
      const at = (e, h) => { const a = lerp(o.a0, o.a1, e), rad = o.rTo !== undefined ? lerp(o.r, o.rTo, e) : o.r; return [o.c[0] + Math.sin(a) * rad, h, o.c[1] + Math.cos(a) * rad]; };
      if (camBlocked(r, ...at(0, o.h)) && !camBlocked(r, ...at(0, h0))) o.h = h0; // старт упёрся в реквизит после снижения — оставляем авторскую высоту
      const rr = (o.r + (o.rTo !== undefined ? o.rTo : o.r)) / 2, span = Math.abs(o.a1 - o.a0) * rr, lim = Math.min(OP.arc, OP.speed * dur * 1.4);
      if (span > lim) o.a1 = o.a0 + (o.a1 - o.a0) * lim / span;
      const a1 = o.a1;
      for (let i = 1; i <= 10; i += 1) { // дуга обрывается перед первой помехой
        const e = i / 10;
        if (camBlocked(r, ...at(e, o.h)) && !camBlocked(r, ...at(e, h0))) { o.a1 = lerp(o.a0, a1, Math.max(0, (i - 1) / 10)); break; }
      }
      return { orbit: o, spd: Math.abs(o.a1 - o.a0) * rr / Math.max(0.1, dur) };
    }
    const A0 = s.at, B0 = s.to || s.at;
    if (free) return { a: A0, b: B0, spd: 0 };
    let A = [A0[0], cy(A0[1]), A0[2]], B = [B0[0], cy(B0[1]), B0[2]];
    if (!dock && camBlocked(r, A[0], A[1], A[2]) && !camBlocked(r, A0[0], A0[1], A0[2])) { // после снижения камера оказалась внутри ящика — шаг в сторону
      const n = nudge(r, A[0], A[1], A[2]);
      if (n) { B[0] += n[0] - A[0]; B[2] += n[1] - A[2]; A[0] = n[0]; A[2] = n[1]; }
    }
    if (!dock) {
      const len = Math.hypot(B[0] - A[0], B[2] - A[2]), lim = Math.min(OP.move, OP.speed * dur);
      let f = len > lim ? lim / len : 1;
      if (len > 0.01) {
        for (let i = 1; i <= 12; i += 1) {
          const u = i / 12 * f, x = A[0] + (B[0] - A[0]) * u, y = A[1] + (B[1] - A[1]) * u, z = A[2] + (B[2] - A[2]) * u, yo = A0[1] + (B0[1] - A0[1]) * u;
          if (camBlocked(r, x, y, z) && !camBlocked(r, x, yo, z)) { f = Math.max(0, (i - 1) / 12 * f); break; }
        }
      }
      B = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
    }
    return { a: A, b: B, spd: Math.hypot(B[0] - A[0], B[2] - A[2]) / Math.max(0.1, dur) };
  }

  // ------------------------------------------------------------ резкие повороты (whip pan) с размытием
  const hash = (sd, n) => { const v = Math.sin(sd * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); };
  function whipPlan(r, s, dur, ctx, sd) {
    const W = { ev: [], pan: null, dir: 0 };
    if (s.whip === false) return W;
    const o = typeof s.whip === 'object' ? s.whip : {}, h = (n) => hash(sd, n), sg = (n) => (h(n) < 0.5 ? -1 : 1);
    const q = s.slow || 1, rd = dur / q; // длительность шота идёт в игровом времени: свайпы считаем в реальных секундах, чтобы в замедлении они не «тянулись»
    // вход: после склейки кадр «прилетает» с той же стороны, куда сорвался предыдущий шот (направление поворота не ломается)
    if (o.in !== false && !ctx.blackIn) {
      const a = ctx.prevDir ? -ctx.prevDir : sg(2);
      W.ev.push({ k: 'in', d: (0.3 + 0.06 * h(3)) * q, a: a * (0.95 + 0.5 * h(4)), p: (h(5) - 0.5) * 0.14, r: a * 0.05 });
    }
    // выход: в последние 0.2 с шот «срывается» в сторону (на склейке максимальное размытие)
    if (o.out !== false && !ctx.last && rd > 0.9) {
      const dir = sg(6);
      W.ev.push({ k: 'out', d: (0.2 + 0.05 * h(7)) * q, a: dir * (0.9 + 0.5 * h(8)), p: (h(9) - 0.5) * 0.12, r: dir * 0.05 });
      W.dir = dir;
    }
    // панорама look→lookTo: держим первую цель и резко «перебрасываем» кадр на вторую
    if (s.lookTo && s.pan !== false && !s.orbit) {
      const a = s.at, L0 = r.lookVec(s.look), L1 = r.lookVec(s.lookTo);
      const y0 = Math.atan2(L0.x - a[0], L0.z - a[2]), y1 = Math.atan2(L1.x - a[0], L1.z - a[2]);
      if (s.pan || Math.abs(wrap(y1 - y0)) > 0.4) { const w0 = s.pan ? s.pan[0] : 0.32 + 0.18 * h(10); W.pan = s.pan || [w0, Math.min(0.98, w0 + 0.36 / rd)]; }
    }
    // середина длинного шота: оператор цепляет звук сбоку и возвращает кадр
    if (o.mid !== false && !W.pan && rd >= 2.7 && !s.dock && !s.dockIn && !s.orbit) {
      const d1 = 0.2 * q, hold = (0.35 + 0.3 * h(11)) * q, d2 = 0.3 * q, t0 = dur * (0.34 + 0.2 * h(12)), a = sg(13);
      if (t0 + d1 + hold + d2 < dur - 0.75 * q) W.ev.push({ k: 'glance', t0, d1, h: hold, d2, a: a * (0.42 + 0.3 * h(14)), p: (h(15) - 0.5) * 0.12, r: a * 0.04 });
    }
    return W;
  }
  // добавки к повороту камеры от свайпов в момент t шота
  function whipOff(W, t, dur) {
    let yaw = 0, pitch = 0, roll = 0;
    for (const v of W.ev) {
      let k = 0;
      if (v.k === 'in') { if (t < v.d) k = Math.pow(1 - t / v.d, 2.6); }
      else if (v.k === 'out') { const t1 = dur - v.d; if (t > t1) k = Math.pow(Math.min(1, (t - t1) / v.d), 2.4); }
      else {
        const u = t - v.t0;
        if (u >= 0 && u < v.d1) k = smooth(u / v.d1);
        else if (u >= v.d1 && u < v.d1 + v.h) k = 1 + (u - v.d1) * 0.04;
        else if (u >= v.d1 + v.h && u < v.d1 + v.h + v.d2) k = (1 + v.h * 0.04) * (1 - smooth((u - v.d1 - v.h) / v.d2));
      }
      if (k) { yaw += v.a * k; pitch += v.p * k; roll += v.r * k; }
    }
    return { yaw, pitch, roll };
  }

  // ------------------------------------------------------------ ручная камера (стиль Франклина из GTA V)
  // Гладкий шум вместо синусов: плавные, но непредсказуемые «дышащие» колебания рук оператора + микродрожь. Сила растёт с напряжением сцены;
  // после жёсткой склейки оператор на долю секунды «ловит» кадр. На ходу — походка (покачивание в такт шагам). Смещает позицию камеры (cf.pos)
  // и возвращает добавки к повороту, FOV и крену.
  const HASH = (() => { const a = []; let q = 20251; for (let i = 0; i < 256; i += 1) { q = (Math.imul(q, 1664525) + 1013904223) >>> 0; a.push((q / 4294967296) * 2 - 1); } return a; })();
  const nz = (x, sd) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), o = sd * 37; const a = HASH[(i + o) & 255], b = HASH[(i + 1 + o) & 255]; return a + (b - a) * u; };
  const fbm = (x, sd) => nz(x, sd) * 0.68 + nz(x * 2.37 + 11.3, sd + 5) * 0.32;
  function handheld(r, st, e) {
    const s = st.s, cf = r.camFree, t = r.time, sd = st.seed, say = s.says || s.say;
    const hand = s.hand === undefined ? 1 : s.hand;
    const dockOut = s.dock ? 1 - e * e : 1;                       // вид стыкуется с игроком: к концу шота камера успокаивается
    const dockIn = s.dockIn ? Math.min(1, st.t / 0.9) : 1;        // эпилог стартует из вида игрока без скачка
    const tense = s.tense !== undefined ? s.tense : (s.cut === 'glitch' ? 0.9 : say ? 0.6 : 0.35);
    const amp = hand * dockOut * dockIn * (0.75 + tense);
    const settle = st.hard ? Math.exp(-st.t * 4.2) * dockOut : 0; // после склейки оператор довёл кадр: затухающий «поиск»
    const sg = sd % 2 ? 1 : -1;
    if (amp > 0) {
      cf.pos.x += fbm(t * 0.55, sd) * 0.06 * amp; cf.pos.y += fbm(t * 0.7 + 31, sd + 1) * 0.05 * amp; cf.pos.z += fbm(t * 0.5 + 57, sd + 2) * 0.06 * amp;
    }
    const walk = Math.min(1, (st.pl.spd || 0) / 0.5) * dockOut * dockIn, stp = t * 10.8; // походка: ~1.7 шага/с
    if (walk > 0) cf.pos.y += Math.sin(stp) * 0.02 * walk;
    const tremor = nz(t * 7.5, sd + 3) * 0.0022 * amp;
    const aspect = r.camera.aspect || 1.78, f = cf.fov;
    const hfov = 2 * Math.atan(Math.tan(f * Math.PI / 360) * aspect);
    const frame = (s.frame !== undefined ? s.frame : (sd % 3 === 0 ? 0 : 0.13 * sg)) * dockOut * dockIn; // правило третей: объект не по центру
    const push = s.push !== undefined ? s.push : (s.fovTo !== undefined || s.dock ? 0 : (sd % 3 === 1 ? 2.2 : -2.0)); // едва заметный наезд / отъезд
    const o = {
      yaw: fbm(t * 0.8 + 3, sd + 6) * 0.021 * amp + tremor + settle * 0.028 * sg + frame * hfov,
      pitch: fbm(t * 0.9 + 9, sd + 7) * 0.017 * amp + Math.sin(t * 1.25) * 0.0016 * amp + nz(t * 8.1, sd + 4) * 0.0014 * amp - settle * 0.012 + Math.sin(stp) * 0.004 * walk,
      roll: fbm(t * 0.6 + 17, sd + 8) * 0.012 * amp + Math.sin(stp * 0.5) * 0.007 * walk,
      fov: fbm(t * 0.35 + 5, sd + 9) * 0.9 * amp + push * e
    };
    if (s.jolt) { // толчок (взрыв): затухающая тряска всех осей
      const jt = st.t - s.jolt[0];
      if (jt >= 0) {
        const jk = Math.exp(-jt * 4.2) * s.jolt[1];
        o.yaw += nz(t * 19, sd + 10) * 0.05 * jk; o.pitch += nz(t * 21 + 7, sd + 11) * 0.05 * jk; o.roll += nz(t * 17 + 3, sd + 12) * 0.07 * jk; cf.pos.y += nz(t * 25, sd + 13) * 0.05 * jk;
      }
    }
    if (st.xj) { // внешний толчок (r.cineJolt: взрыв рядом с оператором)
      const jt = st.t - st.xj.t;
      if (jt >= 0 && jt < 2) {
        const jk = Math.exp(-jt * 4.2) * st.xj.a;
        o.yaw += nz(t * 19, sd + 10) * 0.05 * jk; o.pitch += nz(t * 21 + 7, sd + 11) * 0.05 * jk; o.roll += nz(t * 17 + 3, sd + 12) * 0.07 * jk; cf.pos.y += nz(t * 25, sd + 13) * 0.05 * jk;
      }
    }
    return o;
  }

  Run.prototype.cineJolt = function (a) { if (this.inCinema && this.shotState) this.shotState.xj = { t: this.shotState.t, a }; };

  Run.prototype.applyFreeCam = function (dt) {
    const st = this.shotState, cf = this.camFree, cam = this.camera;
    if (!cf || !cam) return;
    let hh = null;
    if (st) {
      st.t += dt;
      if (st.s.sync) st.t = st.s.sync(this, st.t); // шот может брать время у внешних часов (ограбление: аудиотрек)
      const s = st.s, pl = st.pl, wh = st.wh, k = st.dur > 0 ? Math.min(1, st.t / st.dur) : 1, e = st.ease(k);
      let eL = e;
      if (wh.pan) { const u = clamp((k - wh.pan[0]) / (wh.pan[1] - wh.pan[0]), 0, 1); eL = u * u * (3 - 2 * u); } // резкий «перебрасыватель» кадра
      if (pl.orbit) {
        const o = pl.orbit, a = lerp(o.a0, o.a1, e), r = o.rTo !== undefined ? lerp(o.r, o.rTo, e) : o.r;
        cf.pos.set(o.c[0] + Math.sin(a) * r, o.h, o.c[1] + Math.cos(a) * r);
        cf.look.set(o.c[0], o.ly || 1.3, o.c[1]);
      } else {
        const a = pl.a, b = pl.b;
        cf.pos.set(lerp(a[0], b[0], e), lerp(a[1], b[1], e), lerp(a[2], b[2], e));
        const L0 = this.lookVec(s.look);
        if (s.lookTo) { const L1 = this.lookVec(s.lookTo); cf.look.set(lerp(L0.x, L1.x, eL), lerp(L0.y, L1.y, eL), lerp(L0.z, L1.z, eL)); } else cf.look.copy(L0);
      }
      s.tick && s.tick(this, e, st.t, st.dur); // необязательный колбэк кадра: анимация сцены синхронно с шотом
      cf.fov = lerp(s.fov || 60, s.fovTo !== undefined ? s.fovTo : (s.fov || 60), e);
      cf.roll = lerp(s.roll || 0, s.rollTo !== undefined ? s.rollTo : (s.roll || 0), e);
      hh = handheld(this, st, e);
      if (wh.ev.length) { const w = whipOff(wh, st.t, st.dur); hh.yaw += w.yaw; hh.pitch += w.pitch; hh.roll += w.roll; }
      if (k >= 1 || this.cineSkip) st.done();
    }
    cam.position.copy(cf.pos); cam.up.set(0, 1, 0); cam.lookAt(cf.look);
    if (hh) { cam.rotateY(hh.yaw); cam.rotateX(hh.pitch); cf.roll += hh.roll; cf.fov = Math.max(18, cf.fov + hh.fov); }
    if (cf.roll) cam.rotateZ(cf.roll);
    if (Math.abs(cam.fov - cf.fov) > 0.01) { cam.fov = cf.fov; cam.updateProjectionMatrix(); }
    if (this.body) this.body.visible = false;
    this.setRigVisible && this.setRigVisible(false);
    // направленное размытие по реальной угловой скорости кадра (свайпы дают сильный смаз, дрожь рук — нет); скорость считаем по реальному, а не замедленному времени
    if (dt > 0) {
      const v = this.cinV || (this.cinV = new THREE.Vector3()); cam.getWorldDirection(v);
      const yaw = Math.atan2(-v.x, -v.z), pit = Math.asin(clamp(v.y, -1, 1)), rdt = dt / (this.timeScale || 1);
      if (cf.py !== undefined && !(st && st.fresh)) {
        const vy = wrap(yaw - cf.py) / rdt, vp = (pit - cf.pp) / rdt;
        const tx = -Math.sign(vy) * clamp((Math.abs(vy) - 0.8) * 0.022, 0, 0.2), ty = Math.sign(vp) * clamp((Math.abs(vp) - 0.8) * 0.014, 0, 0.1);
        this.blurX = lerp(this.blurX || 0, tx, 0.7); this.blurY = lerp(this.blurY || 0, ty, 0.7);
      }
      cf.py = yaw; cf.pp = pit;
      if (st) st.fresh = false;
    }
  };

  // ------------------------------------------------------------ готовые шоты
  // Свободная дистанция «назад» от точки до стены/коллайдера (камера не должна уходить за стену).
  function clearBack(r, x, z, dx, dz, max) {
    let d = 0;
    const b = r.bounds;
    // границы комнаты учитываем, только если точка старта внутри них (в проходе за платформой они не действуют)
    const inside = b && Math.abs(x - b.cx) <= b.w / 2 && Math.abs(z - b.cz) <= b.d / 2;
    for (; d < max; d += 0.15) {
      const px = x + dx * (d + 0.15), pz = z + dz * (d + 0.15);
      if (r.blocked(px, pz) || (inside && (Math.abs(px - b.cx) > b.w / 2 - 0.3 || Math.abs(pz - b.cz) > b.d / 2 - 0.3))) break;
    }
    return d;
  }
  // глаза игрока и точка прямо по его взгляду (для шотов «повернул голову»: стартуют и заканчиваются точно в игровом виде)
  const eyeAt = (r) => [r.p.x, EYE, r.p.z];
  const ahead = (r, dist) => { const p = r.p, c = Math.cos(p.pitch); return [p.x - Math.sin(p.yaw) * dist * c, EYE + Math.sin(p.pitch) * dist, p.z - Math.cos(p.yaw) * dist * c]; };
  // последний шот интро: оператор идёт сзади и стыкуется с обзором игрока (FOV сходится к baseFov)
  function pov(r, dur, o) {
    o = o || {};
    const p = r.p, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const back = clearBack(r, p.x, p.z, -fx, -fz, o.back || 2.8);
    return Object.assign({
      at: [p.x - fx * back, EYE + 0.45, p.z - fz * back], to: [p.x, EYE, p.z], look: [p.x + fx * 6, EYE, p.z + fz * 6],
      fov: 52, fovTo: r.baseFov, dur: dur || 2.2, ease: 'out', hand: 0.6, dock: true
    }, o.extra || {});
  }
  // эпилог: камера медленно отъезжает от игрока, время замедляется
  function pull(r, caption, dur) {
    const p = r.p, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const back = clearBack(r, p.x, p.z, -fx, -fz, 3);
    return {
      at: [p.x, EYE, p.z], to: [p.x - fx * back, EYE + 0.2, p.z - fz * back], look: [p.x + fx * 6, EYE + 0.1, p.z + fz * 6],
      fov: r.baseFov, fovTo: 56, dur: dur || 2.8, slow: 0.55, ease: 'out', caption, dockIn: true
    };
  }
  const mix = (a, b) => Object.assign({}, a, b);
  // эпилог, шот 1: камера отъезжает от лица игрока, мир чуть заваливается (dutch) и выравнивается
  const back = (r, k) => mix(pull(r, null, 2.4), { roll: 0.06 * (k || 1), rollTo: 0, fovTo: 64 });
  // эпилог, шот 2: жёсткая склейка на «плечевую» камеру — оператор отошёл за спину игрока и снимает то, куда тот пришёл (без подъёма в воздух)
  function crane(r, caption, o) {
    const p = r.p, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = -fz, rz = fx;
    r.craneN = (r.craneN || 0) + 1;
    let sd = r.craneN % 2 ? 1 : -1;
    const b = Math.max(1.4, clearBack(r, p.x, p.z, -fx, -fz, 4.4) - 0.2);
    const free = (m) => !r.blocked(p.x - fx * b + rx * sd * m, p.z - fz * b + rz * sd * m);
    let k = 0.9; while (k > 0.1 && !free(k)) k -= 0.3;
    if (k <= 0.1) { sd = -sd; k = 0.9; while (k > 0.1 && !free(k)) k -= 0.3; if (k <= 0.1) k = 0; }
    return mix({
      at: [p.x - fx * b + rx * sd * k, 1.25, p.z - fz * b + rz * sd * k], to: [p.x - fx * b * 0.55 + rx * sd * k * 1.3, 1.45, p.z - fz * b * 0.55 + rz * sd * k * 1.3],
      look: [p.x + fx * 2.5, 1.25, p.z + fz * 2.5], lookTo: [p.x + fx * 3.5, 1.1, p.z + fz * 3.5],
      fov: 58, fovTo: 48, dur: 3.4, ease: 'smooth', caption, roll: 0.03 * sd, rollTo: -0.01 * sd, tense: 0.35
    }, o || {});
  }
  // «осмотр участка»: оператор идёт сбоку-сзади от игрока вдоль его взгляда, резко перебрасывает кадр на дальнюю цель, потом стыкуется с обзором игрока.
  // Все точки проверены на коллизии, так что работает в любой миссии без ручных координат. Возвращает массив шотов.
  function reveal(r, o) {
    o = o || {};
    const p = r.p, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = -fz, rz = fx;
    r.revealN = (r.revealN || 0) + 1;
    let sd = r.revealN % 2 ? 1 : -1, k = 1.7;
    const bad = (m) => r.blocked(p.x + rx * sd * m, p.z + rz * sd * m) || r.blocked(p.x + rx * sd * m - fx * 1.4, p.z + rz * sd * m - fz * 1.4) || r.blocked(p.x + rx * sd * m + fx * 1.6, p.z + rz * sd * m + fz * 1.6);
    while (k > 0.2 && bad(k)) k -= 0.4;
    if (k <= 0.2) { sd = -sd; k = 1.7; while (k > 0.2 && bad(k)) k -= 0.4; }
    if (k <= 0.2) k = 0;
    const bk = Math.min(1.8, clearBack(r, p.x, p.z, -fx, -fz, 1.8)), ah = Math.min(1.6, clearBack(r, p.x, p.z, fx, fz, 1.6));
    const x0 = p.x - fx * bk + rx * sd * k, z0 = p.z - fz * bk + rz * sd * k, x1 = p.x + fx * ah + rx * sd * k * 0.5, z1 = p.z + fz * ah + rz * sd * k * 0.5;
    const far = o.far || 14;
    return [
      mix({
        at: [x0, 1.3, z0], to: [x1, 1.5, z1], look: [p.x + fx * far - rx * sd * 4.2, 1.3, p.z + fz * far - rz * sd * 4.2], lookTo: [p.x + fx * far + rx * sd * 3.4, 1.4, p.z + fz * far + rz * sd * 3.4],
        fov: 66, fovTo: 56, dur: 2.9, ease: 'smooth', caption: o.caption, tense: 0.4, roll: 0.025 * sd, rollTo: 0
      }, o.extra || {}),
      pov(r, 1.5, { back: 2.2 })
    ];
  }
  // выход босса: оператор присел и снимает снизу на голову цели, затем жёсткая склейка за спину игрока
  function bossIntro(r, head, caption, o) {
    o = o || {};
    const p = r.p, h = head(), dx = h.x - p.x, dz = h.z - p.z, d = Math.max(0.01, Math.hypot(dx, dz)), ux = dx / d, uz = dz / d;
    const sx = -uz, sz = ux, dist = Math.min(d * 0.6, 7.5);
    const side = r.blocked(h.x - ux * dist + sx * 1.8, h.z - uz * dist + sz * 1.8) ? -1 : 1;
    return [
      mix({
        at: [h.x - ux * dist + sx * 1.8 * side, 0.7, h.z - uz * dist + sz * 1.8 * side], to: [h.x - ux * (dist - 1.2) + sx * 1.1 * side, 0.85, h.z - uz * (dist - 1.2) + sz * 1.1 * side],
        look: () => { const q = head(); return [q.x, q.y, q.z]; }, fov: 56, fovTo: 46, dur: 2.6, ease: 'smooth', caption, tense: 0.85, roll: -0.05 * side, rollTo: 0.015 * side
      }, o.extra || {}),
      pov(r, 1.3, { back: 2.2 })
    ];
  }
  // ближайшая свободная точка для камеры (в реквизит/стену оператор не лезет): [x, y, z]
  const spot = (r, x, y, z) => { if (!camBlocked(r, x, y, z)) return [x, y, z]; const n = nudge(r, x, y, z); return n ? [n[0], y, n[1]] : [x, y, z]; };
  C.cin = { pov, pull, clearBack, back, crane, reveal, bossIntro, eyeAt, ahead, camBlocked, mix, spot };

  const CAP = (n, place) => place + '\nNEXA INDUSTRIES — 03.11.1992';
  const DONE = (n) => 'TASK ' + String(n).padStart(2, '0') + ' COMPLETE\nSUBJECT 083 — RECORD UPDATED';

  // ------------------------------------------------------------ миссии 1–6: интро и эпилоги
  CINEMA[1] = {
    intro: (r) => [
      { at: [5.4, 1.7, 7.4], to: [5.4, 1.7, 4.8], look: [0, 1.3, -3], fov: 72, dur: 4.2, caption: CAP(1, 'TEST CHAMBER 01') },
      { orbit: { c: [-3, -1.5], r: 2.6, a0: 2.4, a1: 3.5, h: 0.65, ly: 1.35 }, fov: 38, dur: 3.4, cut: 'dip' },
      { at: [2.6, 1.5, -4.2], to: [3.8, 1.35, -5.6], look: [4.5, 1.15, -7.2], fov: 50, dur: 2.6, cut: 'flash', say: ['SYSTEM', 'СУБЪЕКТ 083 ЗАРЕГИСТРИРОВАН. НАЧАЛО КАЛИБРОВКИ.'] },
      pov(r, 2.2, { extra: { cut: 'dip' } })
    ],
    outro: (r) => [back(r), crane(r, DONE(1))]
  };
  CINEMA[2] = {
    intro: (r) => [
      { at: [4.5, 1.7, 6.5], to: [2.2, 1.7, 6.5], look: [0, 1.2, -2], lookTo: [-3.2, 1.3, -1], fov: 70, dur: 4, caption: CAP(2, 'OBSERVATION ROOM 02') },
      { at: [-3.5, 1.5, 0.4], to: [-1.5, 1.5, 0.2], look: [0, 1.45, -5], fov: 48, dur: 3, cut: 'dip', say: ['SYSTEM', 'СУБЪЕКТ 024 В ЗОНЕ НАБЛЮДЕНИЯ.'] },
      { orbit: { c: [0, -5], r: 3.2, a0: -0.9, a1: 0.9, h: 0.7, ly: 1.45 }, fov: 40, dur: 3.2, cut: 'flash' },
      pov(r, 2.2, { extra: { cut: 'dip' } })
    ],
    outro: (r) => [back(r), crane(r, DONE(2))]
  };
  CINEMA[3] = {
    intro: (r) => [
      { at: [-3.2, 1.7, 12.5], to: [-1.6, 1.7, 10.2], look: [0, 1.3, -8], lookTo: [4.5, 1.6, -9], fov: 75, dur: 5, caption: CAP(3, 'SECTOR 03 — ANOMALY CORRIDOR') },
      { at: [3.5, 1.7, -8], to: [5.2, 1.5, -10.5], look: [6.8, 1.4, -12], fov: 45, dur: 2.8, cut: 'glitch', say: ['SYSTEM', 'ОБНАРУЖЕНО ОТКЛОНЕНИЕ.'] },
      pov(r, 2.2, { extra: { cut: 'dip' } })
    ],
    outro: (r) => [back(r), crane(r, DONE(3))]
  };
  CINEMA[4] = {
    intro: (r) => [
      { at: [4, 1.7, 10], to: [2.4, 1.7, 7.8], look: [0, 1.4, -11], lookTo: [-3, 1.3, -10], fov: 68, dur: 5, caption: CAP(4, 'RESTRICTED FACILITY — POWER OFFLINE') },
      { at: [-2, 1.2, -6], to: [-0.6, 1.3, -8.4], look: [0, 1.3, -11.2], fov: 45, dur: 2.6, cut: 'dip', say: ['SYSTEM', 'ДОСТУП К ЗАКРЫТОМУ ОБЪЕКТУ. ПИТАНИЕ ОТКЛЮЧЕНО.'] },
      pov(r, 2.2, { extra: { cut: 'dip' } })
    ],
    outro: (r) => [back(r), crane(r, DONE(4))]
  };
  CINEMA[5] = {
    intro: (r) => [
      { at: [-10, 1.7, 10], to: [-10, 1.7, 7.4], look: [10, 1.2, 0], lookTo: [9.4, 1.4, -9.4], fov: 72, dur: 5, caption: CAP(5, 'SERVER HALL 05 — UNKNOWN PROCESS') },
      { at: [5.5, 1.2, 3.5], to: [5.5, 1.5, 5.2], look: () => r.headPos(r.s), fov: 40, dur: 3, cut: 'glitch', say: ['SYSTEM', 'НЕ ОТВОДИТЕ ОТ НЕГО ВЗГЛЯД.'] },
      pov(r, 2.2, { extra: { cut: 'dip' } })
    ],
    outro: (r) => [back(r), crane(r, DONE(5))]
  };
  CINEMA[6] = {
    intro: (r) => [
      { at: [-6.3, 1.7, 6.3], to: [-4, 1.7, 6.3], look: [0, 1.0, -4], lookTo: [4, 1.2, -3], fov: 70, dur: 4, caption: CAP(6, 'FINAL EXPERIMENT — NUMBERS 1 — 7') },
      { orbit: { c: [0, -6], r: 2.6, a0: -0.7, a1: 0.7, h: 0.8, ly: 1.45 }, fov: 38, dur: 3.2, cut: 'dip', say: ['SYSTEM', 'ФИНАЛЬНЫЙ ЭКСПЕРИМЕНТ. СУБЪЕКТ 083.'] },
      pov(r, 2.2, { extra: { cut: 'dip' } })
    ],
    outro: (r) => [back(r), crane(r, DONE(6))]
  };

  // ------------------------------------------------------------ осмотр участка перед выбранными фазами
  // Миссии 1–16: по именам фаз (один раз за прохождение, не после смерти). Миссии 17–46 и любая другая задают CINEMA[id].reveal(r, имя) -> шоты | null.
  const REVEAL = { cellblock: 1, bulkhead: 1, live: 1, lift: 1, hall: 1, engine: 1, boss: 1, exit: 1, terminal: 1, escape: 1, operator: 1 };
  const phase0 = Run.prototype.phase;
  Run.prototype.phase = function (name, fn, skip) {
    const self = this; let first = true;
    return phase0.call(this, name, async function (r) {
      if (first) {
        first = false;
        const id = self.taskId, cin = CINEMA[id];
        let shots = null;
        try { shots = cin && cin.reveal ? cin.reveal(self, name) : (Number(id) >= 1 && Number(id) <= 16 && REVEAL[name] ? reveal(self) : null); } catch (e) { console.error('[cinema reveal]', e); }
        if (shots && shots.length && self.cinematic && !self.disposed && !self.dead && !self.ending) {
          if (self.inCinema) await self.cineIdle(); // перед осмотром могла идти вставка (килкам, подрыв)
          if (!self.inCinema && !self.disposed && !self.dead) await self.cinematic(shots);
        }
      }
      return fn(r);
    }, skip);
  };

  // ------------------------------------------------------------ ввод: пропуск катсцены
  const bindInput = Run.prototype.bindInput;
  Run.prototype.bindInput = function () {
    bindInput.call(this);
    const skip = () => { if (this.inCinema) this.cineSkip = true; };
    this.on(document, 'keydown', (e) => { if (this.inCinema && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); skip(); } });
    const sk = this.qs('.m-skip');
    if (this.touch && sk) sk.textContent = '[TAP] SKIP';
    this.on(sk, 'pointerdown', (e) => { e.preventDefault(); skip(); });
  };
}());
