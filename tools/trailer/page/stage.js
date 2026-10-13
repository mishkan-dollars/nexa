// NEXA: съёмка широкоэкранного трейлера (16:9) прямо из игры. Работает в headless Chromium (tools/trailer/lib/*.js).
// Игра «держится»: реальный цикл остановлен, каждый кадр ролика = шаг симуляции + render + композит + титры.
// Миссию 48 не трогаем: миры берём только из миссий 1–47 (Trl.boot отказывается запускать 48).
(() => {
  'use strict';
  if (window.Trl && window.Trl.__v === 1) return;
  const Trl = window.Trl = { __v: 1, FPS: 30, scenes: {}, B: 60 / 145.03 };   // B — длина доли трека (с)
  const T = () => window.THREE;
  const REAL = { setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window), setInterval: window.setInterval.bind(window), clearInterval: window.clearInterval.bind(window), now: performance.now.bind(performance), dateNow: Date.now.bind(Date) };
  const sleep = (ms) => new Promise((res) => REAL.setTimeout(res, ms));
  Trl.realNow = REAL.now;   // настоящее время (performance.now в съёмке виртуальный) — для профилирования
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => k * k * (3 - 2 * k);
  const smoother = (k) => k * k * k * (k * (k * 6 - 15) + 10);
  const easeOut = (k) => 1 - (1 - k) * (1 - k) * (1 - k);
  const wrap = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  Trl.clamp = clamp; Trl.lerp = lerp; Trl.smooth = smooth; Trl.smoother = smoother; Trl.easeOut = easeOut; Trl.wrap = wrap; Trl.sleep = sleep;

  // ================================================================== детерминированный random
  // Math.random игры (разброс пуль, кровь, искры) идёт из одного генератора: один и тот же сид → один и тот же кадр.
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Trl.rng = mulberry;
  // Math.random игры берёт числа из сида только внутри Trl.sim (сборка мира, tick, шаг симуляции, кадр) и не в колбэках таймеров/rAF самой страницы
  // (глитч интерфейса и т. п. — их оборачивает browser.js и увеличивает window.__trlCb): иначе реальное время сдвигало бы последовательность.
  const nativeRandom = Math.random.bind(Math);
  let gen = null, simDepth = 0;
  Math.random = () => (simDepth > 0 && gen && !window.__trlCb ? gen() : nativeRandom());
  Trl.seed = (n) => { gen = mulberry(n >>> 0); return n; };
  Trl.sim = (fn) => { simDepth += 1; try { return fn(); } finally { simDepth -= 1; } };

  // ================================================================== виртуальные часы
  // Игра местами смотрит на реальное время (setTimeout, performance.now: цепной взрыв бочек, отлёт тел рэгдоллом ≤ 250 мс, гильзы).
  // В медленном программном GL результат зависел бы от скорости рендера, поэтому на время съёмки время — виртуальное и идёт только в Trl.step.
  const CLK = Trl.clock = { on: false, ms: 0, timers: [], nextId: 1000000, dateBase: 0, base: 0 };
  Trl.virtualize = (live) => {
    if (CLK.on) return;
    CLK.on = true; CLK.base = REAL.now(); CLK.ms = CLK.base; CLK.dateBase = REAL.dateNow(); CLK.timers = [];
    if (live) { CLK.last = REAL.now(); CLK.drv = REAL.setInterval(() => { const n = REAL.now(); Trl.tickClock(n - CLK.last); CLK.last = n; }, 16); }   // пока мир грузится, часы идут вместе с реальными
    performance.now = () => CLK.ms;
    Date.now = () => Math.round(CLK.dateBase + (CLK.ms - CLK.base));
    window.setTimeout = (fn, ms, ...a) => { const id = CLK.nextId++; CLK.timers.push({ id, at: CLK.ms + Math.max(0, +ms || 0), fn, a, iv: 0 }); return id; };
    window.setInterval = (fn, ms, ...a) => { const id = CLK.nextId++, iv = Math.max(4, +ms || 0); CLK.timers.push({ id, at: CLK.ms + iv, fn, a, iv }); return id; };
    window.clearTimeout = window.clearInterval = (id) => { const i = CLK.timers.findIndex((t) => t.id === id); if (i >= 0) CLK.timers.splice(i, 1); else REAL.clearTimeout(id); };
  };
  // с этого момента время идёт только в Trl.tickClock (то есть в Trl.step)
  Trl.freezeClock = () => { if (CLK.drv) { REAL.clearInterval(CLK.drv); CLK.drv = 0; } };
  Trl.devirtualize = () => {
    if (!CLK.on) return;
    Trl.freezeClock();
    CLK.on = false; CLK.timers = [];
    window.setTimeout = REAL.setTimeout; window.clearTimeout = REAL.clearTimeout; window.setInterval = REAL.setInterval; window.clearInterval = REAL.clearInterval;
    performance.now = REAL.now; Date.now = REAL.dateNow;
  };
  // продвинуть время на ms и выполнить сработавшие таймеры в порядке срока
  Trl.tickClock = (ms) => {
    if (!CLK.on) return;
    CLK.ms += ms;
    for (let guard = 0; guard < 500; guard += 1) {
      let k = -1;
      for (let i = 0; i < CLK.timers.length; i += 1) if (CLK.timers[i].at <= CLK.ms && (k < 0 || CLK.timers[i].at < CLK.timers[k].at)) k = i;
      if (k < 0) break;
      const t = CLK.timers[k];
      if (t.iv) t.at += t.iv; else CLK.timers.splice(k, 1);
      try { typeof t.fn === 'function' && t.fn.apply(null, t.a); } catch (e) { console.error('virtual timer', e && e.message); }
    }
  };

  // ================================================================== запуск мира миссии
  // Миссия запускается как в .claude/tour.js (звук выключен), вступление пропускается, реальный цикл и интерфейс отключаются.
  Trl.boot = async (id, o) => {
    o = o || {};
    if (Number(id) === 48) throw new Error('mission 48 is not allowed in the trailer');
    if (Trl.r && !Trl.r.disposed) { try { Trl.r.finish(false); } catch (e) { /* уже закрыта */ } await sleep(300); }
    Trl.devirtualize();
    document.body.style.display = '';
    Trl.virtualize(true);
    simDepth += 1;
    try {
      Trl.seed(o.seed || 1);
      const r = window.__r = Trl.r = window.Missions.start(id, { audio: { masterVolume: 0, musicVolume: 0, sfxVolume: 0, musicEnabled: false, sfxEnabled: false }, playSfx() {}, onComplete() {}, onExit() {}, onStage() {}, onCutscene() {} });
      if (!r) throw new Error('mission ' + id + ' refused');
      r.render = function () {};   // пока мир грузится и вступление пропускается, кадры не рисуем (в программном GL они дорогие)
      for (let i = 0; i < 600; i += 1) { await sleep(100); const b = document.querySelector('.m-enter'); if (b && !b.hidden) break; }
      const enter = document.querySelector('.m-enter'); if (!enter || enter.hidden) throw new Error('mission ' + id + ': no ENTER button');
      // реальный цикл игры (rAF) стартует только в ENTER — не даём ему стартовать вовсе: дальше симуляцию ведём сами, фиксированным шагом
      r.frame = function () {};
      Trl.freezeClock();
      enter.click();
      for (let i = 0; i < 2400; i += 1) {   // вступление пропускаем детерминированно (шаг 1/60 с, Space раз в 20 шагов), до 40 с симуляции
        if (i % 20 === 0) document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
        Trl.step(1 / 60);
        await null;   // даём продолжиться цепочкам промисов игры (tween/wait/cinematic)
        if (i > 90 && !r.inCinema && r.cineDepth === 0) break;
      }
      r.hurt = () => {}; r.hp = r.maxHp || 100;
      r.pr = o.pr || r.q.pr; r.resize();
      r.blurX = 0; r.blurY = 0; r.timeScale = 1;
      try { r.snd && r.snd.ambient && r.snd.ambient.set(null); } catch (e) { /* звука нет */ }
      delete r.render;
      // интерфейс скрыт (display:none, не visibility): иначе компоситор Chromium (SwiftShader) копит очередь кадров и каждый кадр тормозит в разы
      document.body.style.display = 'none';
      Trl.present();   // прогрев: компиляция шейдеров и сброс очереди
      Trl.fpState = { yaw: r.p.yaw, pitch: r.p.pitch, yv: 0, pv: 0, mx: 0, mz: 0 };
      return { id, quality: r.qName, canvas: [r.renderer.domElement.width, r.renderer.domElement.height], p: { x: r.p.x, z: r.p.z }, bounds: r.bounds || null, t: r.time };
    } finally { simDepth -= 1; }
  };

  // ================================================================== симуляция
  Trl.step = (dt) => {
    const r = Trl.r, n = Math.max(1, Math.ceil(dt * 60 - 1e-6)), h = dt / n;
    for (let i = 0; i < n; i += 1) { r.time += h; r.update(h * (r.timeScale || 1)); Trl.tickClock(h * 1000); }
  };

  // ================================================================== камера
  // свободная камера: позиция, точка взгляда, fov, крен (как Scn.cam из tools/shorts)
  Trl.camFree = (px, py, pz, lx, ly, lz, fov, roll) => {
    const r = Trl.r;
    if (!r.camFree) r.camFree = { pos: new (T().Vector3)(), look: new (T().Vector3)(), fov: 60, roll: 0 };
    const cf = r.camFree;
    cf.pos.set(px, py, pz); cf.look.set(lx, ly, lz); cf.fov = fov || 60; cf.roll = roll || 0;
    r.inCinema = false; r.shotState = null;
    r.applyFreeCam(0);
  };
  // вид от первого лица: камеру ведёт сама игра по r.p (yaw, pitch), покачивание и руки с оружием — настоящие
  Trl.camFP = () => {
    const r = Trl.r;
    if (r.camFree) { r.camFree = null; r.prevYaw = undefined; r.blurX = 0; r.blurY = 0; r.setRigVisible && r.setRigVisible(true); }
    r.placeCamera(1e-4);
  };
  // Catmull-Rom по точкам [[x,y,z],...]; u 0..1 по всей кривой
  Trl.spline = (pts, u) => {
    const n = pts.length - 1; if (n < 1) return pts[0].slice();
    const f = clamp(u, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
    return p1.map((_, c) => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t * t * t));
  };
  // ручная камера: низкочастотная «дрожь оператора» (сумма синусов), a — амплитуда, зависит от времени, а не от кадра
  Trl.hand = (t, a, seed) => {
    const s = (seed || 0) * 12.9898;
    return [Math.sin(t * 1.3 + s) * 0.6 + Math.sin(t * 2.9 + s * 2) * 0.3 + Math.sin(t * 5.1 + s * 3) * 0.1, Math.sin(t * 1.1 + s * 4) * 0.6 + Math.sin(t * 3.3 + s * 5) * 0.3 + Math.sin(t * 4.7 + s * 6) * 0.1].map((v) => v * (a === undefined ? 1 : a));
  };
  // направление взгляда игры: yaw 0 смотрит в −Z; pitch > 0 — вверх
  Trl.yawTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));
  Trl.pitchTo = (fx, fy, fz, tx, ty, tz) => Math.atan2(ty - fy, Math.hypot(tx - fx, tz - fz));

  // ================================================================== игрок «по сценарию» (вид от первого лица)
  // Движение — через аналоговый стик игры (настоящие шаги, покачивание, коллизии); взгляд — пружина без рывков.
  Trl.fp = {
    // идём в мировую точку (x,z); run — бег. Возвращает расстояние до точки.
    walkTo(x, z, run) {
      const r = Trl.r, p = r.p, S = Trl.fpState, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.15) { Trl.fp.stop(); return d; }
      const ux = dx / d, uz = dz / d, s = Math.sin(p.yaw), c = Math.cos(p.yaw);
      // мировое направление → оси игрока (вперёд = (−sin, −cos), вправо = (cos, −sin)); плавный разгон стика
      S.mz = lerp(S.mz, -s * ux - c * uz, 0.25); S.mx = lerp(S.mx, c * ux - s * uz, 0.25);
      r.stick.y = -S.mz; r.stick.x = S.mx; r.padRun = !!run;
      return d;
    },
    stop() { const r = Trl.r, S = Trl.fpState; r.stick.x = 0; r.stick.y = 0; r.padRun = false; S.mx = 0; S.mz = 0; },
    // плавный взгляд на yaw/pitch (рад): critically damped пружина, tau — время отклика (с), vmax — потолок угловой скорости (рад/с)
    look(yaw, pitch, dt, tau, vmax) {
      const r = Trl.r, S = Trl.fpState, w = 2 / Math.max(0.05, tau || 0.22), vm = vmax || 4.5;
      const ey = wrap(r.p.yaw - yaw), ep = r.p.pitch - pitch;
      S.yv = clamp(S.yv + (-w * w * ey - 2 * w * S.yv) * dt, -vm, vm);
      S.pv = clamp(S.pv + (-w * w * ep - 2 * w * S.pv) * dt, -vm, vm);
      r.p.yaw += S.yv * dt; r.p.pitch = clamp(r.p.pitch + S.pv * dt, -1.2, 1.2);
    },
    lookAt(x, y, z, dt, tau, vmax) {
      const p = Trl.r.p;
      Trl.fp.look(Trl.yawTo(p.x, p.z, x, z), Trl.pitchTo(p.x, 1.35, p.z, x, y, z), dt, tau, vmax);
    }
  };

  // идём по ломаной [[x,z],...]: id — имя пути (хранит текущую точку), run — бег; возвращает true, когда дошли до конца
  Trl._wp = {};
  Trl.fp.walkPath = (id, pts, run) => {
    const i = Trl._wp[id] || 0;
    if (i >= pts.length) { Trl.fp.stop(); return true; }
    const d = Trl.fp.walkTo(pts[i][0], pts[i][1], run);
    if (d < 0.35) Trl._wp[id] = i + 1;
    return false;
  };
  // «автоприцел» игрока для сценариев: берёт ближайшего живого врага (или мишень при o.passive), плавно наводится и стреляет.
  // o: {tau (отклик взгляда, 0.2), vmax (рад/с, 4), tol (допуск наводки, рад, 0.05), head (метить в голову), delay (пауза после убийства, с), passive, range (м, 40), fire (false — только целиться)}
  Trl.engage = (dt, o) => {
    o = o || {};
    const r = Trl.r, p = r.p, S = Trl._eng || (Trl._eng = { tgt: null, wait: 0 });
    if (S.tgt && S.tgt.dead) { S.tgt = null; S.wait = o.delay === undefined ? 0.25 : o.delay; }
    if (S.wait > 0) S.wait -= dt;
    if (!S.tgt && S.wait <= 0) {
      let best = null, bd = 1e9;
      for (const e of r.cb.enemies) {
        if (e.dead || e.friendly || (e.t.passive && !o.passive)) continue;
        const d = Math.hypot(e.x - p.x, e.z - p.z); if (d > (o.range || 40)) continue;
        const dy = Math.abs(wrap(Trl.yawTo(p.x, p.z, e.x, e.z) - p.yaw)), score = d + dy * 4;   // ближе и ближе к направлению взгляда
        if (score < bd) { bd = score; best = e; }
      }
      S.tgt = best;
    }
    const e = S.tgt; if (!e) return null;
    const sc = e.t.scale || 1, ty = (o.head ? 1.58 : 1.15) * sc;
    Trl.fp.lookAt(e.x, ty, e.z, dt, o.tau || 0.2, o.vmax || 4);
    const ey = Math.abs(wrap(Trl.yawTo(p.x, p.z, e.x, e.z) - p.yaw)), ep = Math.abs(Trl.pitchTo(p.x, 1.35, p.z, e.x, ty, e.z) - p.pitch);
    if (o.fire !== false && ey < (o.tol || 0.05) && ep < (o.tol || 0.05) * 1.5 && r.fireCd <= 0) r.tryFire();
    return e;
  };

  // ================================================================== музыка / такт
  Trl.music = null;
  Trl.setMusic = (m) => { Trl.music = m; Trl.B = m.beat; };
  // t (с трейлера) → { i: номер доли, since: с от начала доли, frac: 0..1 внутри доли }
  Trl.beat = (t) => {
    const m = Trl.music, per = m.beat, k = (t - m.offset) / per, i = Math.floor(k);
    return { i, since: (k - i) * per, frac: k - i };
  };
  // «удар баса»: 1 в момент удара и затухание e^(−since·rate); hits — массив моментов (с трейлера)
  Trl.punch = (t, hits, rate) => {
    let best = 0;
    for (let i = 0; i < hits.length; i += 1) { const s = t - hits[i]; if (s >= 0 && s < 1.2) best = Math.max(best, Math.exp(-s * (rate || 9))); }
    return best;
  };

  // ================================================================== выходной холст
  Trl.out = (w, h) => {
    if (!Trl._out || Trl._out.w !== w || Trl._out.h !== h) {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      Trl._out = { w, h, cv, ctx: cv.getContext('2d') };
    }
    return Trl._out;
  };
  // кадр игры → выходной холст (cover по центру)
  Trl.present = (o) => {
    const r = Trl.r, c = r.renderer.domElement, O = Trl.out(c.width, c.height);
    r.render();
    O.ctx.drawImage(c, 0, 0, O.w, O.h);
    return O;
  };
  Trl.jpeg = (q) => Trl._out.cv.toDataURL('image/jpeg', q || 0.93);

  // ================================================================== сцены и нарезки
  // сцена: { mission, seed, setup(S), tick(S,t,dt), cuts: { id: { t0, dur, cam(S,k,t), over(ctx,k,t,S) } } }
  // S — Trl. Сцена идёт по времени симуляции с шагом 1/FPS; кадр рисуется только когда в этот момент идёт нарезка.
  Trl.scene = (name, spec) => { Trl.scenes[name] = spec; return spec; };
  // Симуляция идёт с фиксированным шагом 1/60 с (tick вызывается на каждом шаге), кадры рисуются на каждом (60 fps) или на каждом втором (30 fps) шаге —
  // поэтому превью 30 fps и финал 60 fps показывают одну и ту же симуляцию. Нарезка стартует на ближайшем кадре сетки после t0.
  // o: {cuts:[id], fps: 30|60, pr, jpegQ, send(id, i, dataUrl), place: {id: {frames, g0}} — точное число кадров и время (с трейлера) первого кадра}
  Trl.runScene = async (name, o) => {
    o = o || {};
    const spec = Trl.scenes[name]; if (!spec) throw new Error('no scene ' + name);
    const SIM = 60, fps = o.fps || Trl.FPS, every = Math.round(SIM / fps), q = o.jpegQ || 0.93, place = o.place || null;
    if (every < 1 || Math.abs(every * fps - SIM) > 1e-6) throw new Error('fps must divide 60');
    const ids = (o.cuts && o.cuts.length ? o.cuts : Object.keys(spec.cuts)).filter((id) => spec.cuts[id] && (!place || place[id]));
    const info = await Trl.boot(spec.mission, { seed: spec.seed, pr: o.pr });
    Trl.seed(spec.seed || 1);
    if (spec.setup) await Trl.sim(() => spec.setup(Trl, info));   // setup должен быть синхронным (после await сид уже не действует)
    const win = {};
    ids.forEach((id) => { const c = spec.cuts[id], s0 = Math.ceil(c.t0 * SIM / every - 1e-9) * every, n = place ? place[id].frames : Math.max(1, Math.ceil(c.dur * fps - 1e-6)); win[id] = { s0, n }; });
    const lastStep = Math.max.apply(null, ids.map((id) => win[id].s0 + (win[id].n - 1) * every)), counts = {}, camlog = {}, dir = new (T().Vector3)();
    const sent = o.send || (async () => {});
    const t0 = REAL.now();
    for (let step = 0; step <= lastStep; step += 1) {
      Trl.sim(() => { spec.tick && spec.tick(Trl, step / SIM, 1 / SIM); Trl.step(1 / SIM); });
      if (step % every) continue;
      for (const id of ids) {
        const w = win[id], j = (step - w.s0) / every;
        if (j < 0 || j >= w.n) continue;
        const c = spec.cuts[id], k = j / w.n, tl = j / fps;
        Trl.sim(() => {
          if (c.cam) c.cam(Trl, k, tl);
          const O = Trl.present();
          if (c.over) c.over(O.ctx, k, tl, Trl, O);
          if (place && Trl.postFx) Trl.postFx(O.ctx, place[id].g0 + tl, j, O, id);
        });
        counts[id] = j;
        const cam = Trl.r.camera; cam.getWorldDirection(dir);   // журнал камеры: по нему check-clips считает плавность (скорость/ускорение поворота и хода)
        (camlog[id] || (camlog[id] = [])).push([cam.position.x, cam.position.y, cam.position.z, dir.x, dir.y, dir.z, cam.fov].map((v) => Math.round(v * 10000) / 10000));
        await sent(id, j, Trl.jpeg(q));
      }
      if (step % 30 === 0) await sleep(0);
    }
    return { ms: Math.round(REAL.now() - t0), frames: counts, cam: camlog };
  };
})();
