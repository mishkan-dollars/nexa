// NEXA: миссия 48 — акт 6 (часть 1): флэшбек у двери 083. Общие помощники (потолок здоровья, трассеры, поиск площадки), монтаж воспоминаний —
// короткие перестрелки охранников в разных зонах (статисты r.npc: настоящие враги в катсцене замирают, поэтому всё ведётся руками),
// сцена у двери (число 083), «реальность» от первого лица: Диктор машет рукой, толчок, падение, удар ногой по двери, подъём с пола.
// Весь текст — английский. Продолжение — f48act6b.js (тёмный коридор, красная комната, пробуждение, PH.flash).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.PH || !C.f48.K || !C.f48.K.flashOn || !C.f48.K.track || !C.f48.K.pbody || !C.f48.K.amb || !C.f48.K.hall || !C.f48.DEEP || !C.f48.DARK || !C.f48.RED || !C.f48.HEAD) return;
  const F = C.f48, K = F.K, PI = Math.PI, EYE = C.EYE || 1.35, { lerp, smooth } = C;
  const FL = F.FL = F.FL || {};
  const DIC = 'DICTOR';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const sh = (x) => K.shot(Object.assign({ dur: 3 }, x));
  const lerpYaw = (a, b, k) => { let d = b - a; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI; return a + d * k; };
  const put = (n, x, z, yaw) => { n.g.position.set(x, 0, z); n.yaw = yaw; n.g.rotation.y = yaw; n.goal = null; K.ally.stop(n); };
  FL.put = put; FL.sh = sh; FL.rnd = rnd; FL.pick = pick; FL.lerpYaw = lerpYaw; FL.EYE = EYE;

  // ------------------------------------------------------------------ потолок урона: охрана может снять игроку здоровье максимум до floor (1)
  K.hpFloor = function (r, floor) {
    const S = r.f48floor || (r.f48floor = { v: 0 });
    S.v = floor || 0;
    if (S.on) return S;
    S.on = true;
    const h0 = r.hurt;
    r.hurt = function (amt, fx, fz) {
      if (S.v > 0 && !this.dead) { const m = (this.armorK || 1) * (this.mercy || 1); amt = Math.min(amt, Math.max(0, (this.hp - S.v) / m)); }
      return h0.call(this, amt, fx, fz);
    };
    r.f48floorOff = () => { S.v = 0; };
    return S;
  };

  // ------------------------------------------------------------------ трассеры (общий пул на 40 штук)
  function trc(r) {
    let S = r.f48trc; if (S) return S;
    const T = THREE, geo = new T.BoxGeometry(0.022, 0.022, 1), mat = new T.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0.95, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    S = r.f48trc = { list: [], i: 0 };
    for (let i = 0; i < 40; i += 1) { const m = new T.Mesh(geo, mat); m.visible = false; m.frustumCulled = false; r.scene.add(m); S.list.push({ m, life: 0 }); }
    S.fire = (ax, ay, az, bx, by, bz) => {
      const q = S.list[S.i = (S.i + 1) % S.list.length], len = Math.hypot(bx - ax, by - ay, bz - az); if (len < 0.2) return;
      q.m.visible = true; q.m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); q.m.scale.set(1, 1, len); q.m.lookAt(bx, by, bz); q.life = 0.09;
    };
    S.tick = (dt) => { for (const q of S.list) if (q.life > 0) { q.life -= dt; if (q.life <= 0) q.m.visible = false; } };
    return S;
  }
  FL.trc = trc;

  // ------------------------------------------------------------------ площадка для монтажа: свободный прямоугольник в текущем регионе
  // вперёд (yaw): f = (sin y, cos y), вбок: l = (cos y, −sin y); область: a ∈ [−back, run], l ∈ [−lat, lat]
  function findStage(r, R, o) {
    const b = R.bounds || { cx: 0, cz: 0, w: 20, d: 20 };
    const hx = b.w / 2 - 1.6, hz = b.d / 2 - 1.6;
    if (hx < 1 || hz < 1) return null;
    for (let kl = 0; kl < 4; kl += 1) {
      const lat = o.lat * [1, 0.72, 0.5, 0.34][kl];
      for (let t = 0; t < 260; t += 1) {
        const cx = b.cx + rnd(-hx, hx), cz = b.cz + rnd(-hz, hz), yaw = Math.floor(rnd(0, 8)) * PI / 4 + (Math.random() < 0.5 ? 0 : PI / 8 * 0);
        const s = Math.sin(yaw), c = Math.cos(yaw);
        let ok = true;
        for (let a = -o.back; a <= o.run && ok; a += 2.4) {
          for (let l = -lat; l <= lat && ok; l += Math.max(1.2, lat / 2)) {
            const x = cx + s * a + c * l, z = cz + c * a - s * l;
            if (Math.abs(x - b.cx) > b.w / 2 - 0.9 || Math.abs(z - b.cz) > b.d / 2 - 0.9 || !K.ally.free(r, x, z, 0.32)) ok = false;
          }
        }
        if (ok) {
          const st = { cx, cz, yaw, lat, run: o.run, back: o.back, s, c };
          st.P = (a, l) => [cx + s * a + c * (l || 0), cz + c * a - s * (l || 0)];
          st.clear = (ax, az, bx, bz) => K.ally.lineFree(r, ax, az, bx, bz, 0.12);
          return st;
        }
      }
    }
    return null;
  }
  FL.findStage = findStage;

  // ================================================================== МОНТАЖ ВОСПОМИНАНИЙ
  // вид клипа → требуемая площадка и сборка кадра. S — площадка, M — состояние монтажа, c — описание клипа
  const NEED = {
    fp: { back: 1.5, run: 16, lat: 5 }, back: { back: 3, run: 14, lat: 4 }, side: { back: 1.5, run: 14, lat: 6.5 }, low: { back: 1.5, run: 13, lat: 4 },
    wide: { back: 5, run: 14, lat: 7 }, run: { back: 3, run: 22, lat: 3 }, die: { back: 4, run: 12, lat: 4 }
  };
  const CLIPS = [
    { reg: 'wh', kind: 'fp', dur: 4.4, n: 6, fx: 'acid', cap: 'TASK 05 · RECORD 083-05' },
    { reg: 'office', kind: 'back', dur: 4.2, n: 5, fx: 'sepia', cap: 'TASK 11 · RECORD 083-11' },
    { reg: 'yard', kind: 'wide', dur: 5.2, n: 9, fx: 'acid', cap: 'TASK 17 · RECORD 083-17' },
    { reg: 'hall', kind: 'low', dur: 4.2, n: 6, fx: 'red', cap: 'TASK 23 · RECORD 083-23' },
    { reg: 'base', kind: 'side', dur: 4.4, n: 6, fx: 'sepia', cap: 'TASK 29 · RECORD 083-29' },
    { reg: 'vault', kind: 'fp', dur: 4.4, n: 8, fx: 'acid', cap: 'TASK 31 · RECORD 083-31' },
    { reg: 'deep', kind: 'run', dur: 4.8, n: 7, fx: 'red', cap: 'TASK 36 · RECORD 083-36' },
    { reg: 'wh', kind: 'die', dur: 4.0, n: 4, fx: 'dull', slow: 0.5, cap: 'TASK 02 · RECORD 083-02' },
    { reg: 'hall', kind: 'wide', dur: 5.4, n: 11, fx: 'acid', cap: 'TASK 38 · RECORD 083-38' },
    { reg: 'office', kind: 'fp', dur: 4.2, n: 5, fx: 'sepia', cap: 'TASK 14 · RECORD 083-14' },
    { reg: 'yard', kind: 'back', dur: 4.4, n: 7, fx: 'acid', cap: 'TASK 41 · RECORD 083-41' },
    { reg: 'deep', kind: 'side', dur: 4.4, n: 6, fx: 'red', cap: 'TASK 44 · RECORD 083-44' },
    { reg: 'base', kind: 'low', dur: 4.2, n: 6, fx: 'dull', cap: 'TASK 19 · RECORD 083-19' },
    { reg: 'vault', kind: 'wide', dur: 5.2, n: 10, fx: 'acid', cap: 'TASK 46 · RECORD 083-46' },
    { reg: 'hall', kind: 'fp', dur: 4.2, n: 10, fx: 'red', cap: 'TASK 47 · RECORD 083-47' },
    { reg: 'yard', kind: 'low', dur: 5.0, n: 8, fx: 'sepia', cap: 'TASK 08 · RECORD 083-08' }
  ];
  FL.CLIPS = CLIPS;

  function montage(r, W) {
    const M = { r, W, g: [], body: null, t: 0, hz: 0, src: null, cam: null, snd: 0, on: true, off: null };
    const tr = trc(r);
    // пока клип идёт: охранники целятся / стреляют / бегут / падают по сценарию; стрелок (игрок) отвечает и снимает цели
    M.tick = (dt) => {
      if (!M.on || !(dt > 0) || r.disposed) return;
      dt = Math.min(dt, 0.05); M.t += dt; M.snd = Math.max(0, M.snd - dt * 16);
      tr.tick(dt);
      const src = M.src; if (!src) return;
      for (const n of M.g) {
        const s = n.sg, p = n.g.position;
        if (n.flashM && n.flashM.visible && (s.fl -= dt) <= 0) n.flashM.visible = false;
        if (n.death) continue;
        s.t += dt;
        const dx = s.tx - p.x, dz = s.tz - p.z, dist = Math.hypot(dx, dz);
        if (s.mode === 'run') {
          if (dist > s.stop) { n.goal = { x: s.tx, z: s.tz, speed: s.run }; n.armT = dist < s.stop + 4 ? 1 : 0.15; n.yaw = Math.atan2(dx, dz); } else { n.goal = null; s.mode = 'fire'; n.armT = 1; }
        } else n.yaw = Math.atan2(dx, dz);
        if (s.mode === 'fire' || (s.mode === 'run' && dist < s.stop + 7)) {
          s.cd -= dt;
          if (s.cd <= 0 && n.aimK > 0.5) {
            s.cd = s.rate * rnd(0.6, 1.6);
            n.kick = 1; if (n.flashM) { n.flashM.visible = true; s.fl = 0.05; }
            const ax = p.x + Math.sin(n.g.rotation.y) * 0.55, az = p.z + Math.cos(n.g.rotation.y) * 0.55;
            const ex = s.tx + rnd(-0.9, 0.9), ey = rnd(0.9, 1.9), ez = s.tz + rnd(-0.9, 0.9), k = 1 + 5 / Math.max(2, dist);
            tr.fire(ax, 1.42, az, ax + (ex - ax) * k, 1.42 + (ey - 1.42) * k, az + (ez - az) * k);
            if (M.snd < 5) { M.snd += 1; r.snd && r.snd.shot('erifle', { dist: Math.max(4, dist), at: [p.x, 1.4, p.z] }); }
          }
        }
        if (s.die !== undefined && s.t >= s.die) M.kill(n);
      }
      // стрелок (тело игрока) целится в ближайшую живую цель и стреляет
      const b = M.body;
      if (b) {
        let best = null, bd = 1e9;
        for (const n of M.g) if (!n.death) { const d = Math.hypot(n.g.position.x - b.g.position.x, n.g.position.z - b.g.position.z); if (d < bd) { bd = d; best = n; } }
        if (best) {
          b.yaw = Math.atan2(best.g.position.x - b.g.position.x, best.g.position.z - b.g.position.z); b.armT = 1;
          M.bcd -= dt;
          if (M.bcd <= 0 && b.aimK > 0.5) {
            M.bcd = rnd(0.09, 0.2); b.kick = 1; if (b.flashM) { b.flashM.visible = true; M.bfl = 0.05; }
            const ax = b.g.position.x + Math.sin(b.g.rotation.y) * 0.55, az = b.g.position.z + Math.cos(b.g.rotation.y) * 0.55;
            tr.fire(ax, 1.4, az, best.g.position.x + rnd(-0.2, 0.2), 1.3 + rnd(-0.3, 0.3), best.g.position.z + rnd(-0.2, 0.2));
            if (M.snd < 5) { M.snd += 1; r.snd && r.snd.shot('rifle', { dist: 6, at: [b.g.position.x, 1.4, b.g.position.z] }); }
            r.actorHit && r.actorHit(best, false, 20);
          }
        } else b.armT = 0.3;
        if (b.flashM && b.flashM.visible && (M.bfl -= dt) <= 0) b.flashM.visible = false;
      } else if (M.fpv) {                                                        // от первого лица: трассеры из нижнего угла кадра в цель
        M.bcd -= dt;
        if (M.bcd <= 0) {
          const live = M.g.filter((n) => !n.death);
          if (live.length) {
            M.bcd = rnd(0.1, 0.22);
            const t = pick(live), cm = r.camera.position, fw = new THREE.Vector3(); r.camera.getWorldDirection(fw);
            const rx = fw.z, rz = -fw.x;
            tr.fire(cm.x + fw.x * 0.5 + rx * 0.22, cm.y - 0.22, cm.z + fw.z * 0.5 + rz * 0.22, t.g.position.x + rnd(-0.2, 0.2), 1.3 + rnd(-0.3, 0.3), t.g.position.z + rnd(-0.2, 0.2));
            r.cineJolt && r.cineJolt(0.22);
            if (M.snd < 5) { M.snd += 1; r.snd && r.snd.shot('rifle', { dist: 1, at: [cm.x, cm.y, cm.z] }); }
            r.actorHit && r.actorHit(t, false, 20);
          }
        }
      }
    };
    M.kill = (n) => {
      if (n.death) return;
      const p = n.g.position, src = M.src || [p.x, p.z - 5], head = Math.random() < 0.3;
      n.lastHit = { t: performance.now(), pt: { x: p.x, y: head ? 1.62 : 1.2, z: p.z }, head, amt: 40, dmg: 40, o: { x: src[0], y: 1.4, z: src[1] } };
      try { r.bloodHit({ x: p.x, y: head ? 1.6 : 1.2, z: p.z }, head, 40, { x: p.x - src[0], y: 0.2, z: p.z - src[1] }); } catch (e) { /* кровь не критична */ }
      r.actorKill(n, head, { x: src[0], z: src[1] });
      n.goal = null; n.armT = 0;
    };
    M.clear = () => {
      M.g.forEach((n) => F.rm(r, n)); M.g.length = 0;
      if (M.body) { F.rm(r, M.body); M.body = null; }
      M.src = null; M.fpv = false;
      tr.list.forEach((q) => { q.life = 0; q.m.visible = false; });
    };
    M.dispose = () => { M.clear(); M.on = false; M.off && M.off(); };
    M.off = K.hook(r, (dt) => M.tick(dt));
    M.bcd = 0.2; M.bfl = 0;
    return M;
  }

  // готовим один клип: возвращает поля шота (позиции камеры), создаёт охрану и стрелка
  function stageClip(r, W, M, c) {
    M.clear();
    const need = NEED[c.kind];
    let R = null, S = null;
    for (const reg of [c.reg, 'hall', 'yard', 'wh', 'base']) {
      R = W.enter(reg);
      if (reg === 'deep') { R.door.set(0); R.alarm = true; }
      S = findStage(r, R, need);
      if (S) break;
    }
    if (!S) return null;
    const P = S.P, run = S.run, lat = S.lat;
    const ys = Math.min(2.9, (R.bounds && R.bounds.h ? R.bounds.h - 0.5 : 2.9));
    const g = [];
    const spread = lat * 0.85;
    // охрана: два ряда на дальней половине, у кого-то есть «время смерти»
    const n = c.n;
    for (let i = 0; i < n; i += 1) {
      const rank = i % 2, a = run * (0.62 + 0.38 * Math.random()) - rank * 2.2, l = (n === 1 ? 0 : (i / (n - 1) * 2 - 1)) * spread + rnd(-0.6, 0.6);
      let pt = P(a, l);
      if (!K.ally.free(r, pt[0], pt[1], 0.3)) pt = P(a * 0.8, l * 0.5);
      g.push(pt);
    }
    const o = P(0, 0), fwx = Math.sin(S.yaw), fwz = Math.cos(S.yaw);
    M.src = [o[0], o[1]]; M.fpv = c.kind === 'fp';
    const guards = g.map((pt, i) => {
      const type = i % 5 === 4 ? 'heavy' : 'grunt';
      const run0 = c.kind === 'wide' || c.kind === 'run' ? i % 2 === 0 : i % 4 === 3;
      const yaw = Math.atan2(o[0] - pt[0], o[1] - pt[1]);
      const nn = r.npc(pt[0], pt[1], yaw);
      r.actorStyle(nn, type, type === 'heavy' ? 'lmg' : (Math.random() < 0.3 ? 'pistol' : 'rifle'));
      if (!nn.gunKind) r.setGun(nn, 'rifle');
      nn.armT = 1; nn.aimK = 0.6;
      nn.sg = { mode: run0 ? 'run' : 'fire', t: 0, cd: rnd(0.05, 0.7), rate: rnd(0.14, 0.3), fl: 0, tx: o[0], tz: o[1], run: rnd(2.6, 4.2), stop: rnd(5, 8), die: undefined };
      nn.g.scale.setScalar(type === 'heavy' ? 1.08 : rnd(0.97, 1.03));
      return nn;
    });
    // смерти распределены по клипу (последний умирает ближе к концу, пара выживших)
    const live = guards.slice().sort(() => Math.random() - 0.5), kills = Math.max(1, live.length - (live.length > 4 ? 2 : 0));
    for (let i = 0; i < kills; i += 1) live[i].sg.die = 0.7 + (c.dur / (c.slow || 1) - 1.6) * (i + Math.random() * 0.6) / kills;
    M.g = guards;
    // тело стрелка (кроме вида от первого лица)
    if (!M.fpv) {
      const b = M.body = F.playerBody(r, o[0], o[1], S.yaw);
      r.setGun(b, 'rifle'); b.armT = 1; b.aimK = 0.8;
      if (c.kind === 'run') { b.goal = { x: P(7, 0)[0], z: P(7, 0)[1], speed: 3.3 }; M.src = [P(-1, 0)[0], P(-1, 0)[1]]; guards.forEach((q) => { q.sg.tx = o[0] + fwx * 3; q.sg.tz = o[1] + fwz * 3; }); }
    }
    // камера: shot-поля для каждого вида
    const y = (h) => Math.min(h, ys);
    const cam = (a, l, h) => { const p = P(a, l); return [p[0], y(h), p[1]]; };
    let s;
    switch (c.kind) {
      case 'fp': s = { at: cam(-0.4, 0, 1.55), to: cam(0.7, 0.15, 1.6), look: cam(run * 0.8, 0, 1.45), lookTo: cam(run * 0.8, lat * 0.45, 1.4), fov: 74 }; break;
      case 'back': s = { at: cam(-2.6, -1.1, 1.75), to: cam(-1.7, -0.8, 1.7), look: cam(run * 0.6, 0, 1.3), fov: 58 }; break;
      case 'side': s = { at: cam(run * 0.42, lat * 0.95, 1.5), to: cam(run * 0.5, lat * 0.85, 1.45), look: cam(run * 0.38, 0, 1.3), fov: 54 }; break;
      case 'low': s = { at: cam(-1.2, 0.6, 0.38), to: cam(0.3, 0.45, 0.5), look: cam(run * 0.75, 0, 1.55), fov: 68 }; break;
      case 'wide': s = { at: cam(-4.2, lat * 0.5, 2.9), to: cam(-3.0, lat * 0.35, 2.7), look: cam(run * 0.55, 0, 0.9), fov: 62 }; break;
      case 'run': s = { at: cam(-2.4, 0.3, 1.7), to: cam(5.2, 0.15, 1.7), look: cam(run, 0, 1.4), fov: 66 }; break;
      default: { // die: тесно на одной жертве
        const v = guards[0].g.position; s = { at: [v.x - fwx * 3.2 + fwz * 0.9, y(1.55), v.z - fwz * 3.2 - fwx * 0.9], to: [v.x - fwx * 2.3 + fwz * 0.7, y(1.5), v.z - fwz * 2.3 - fwx * 0.7], look: [v.x, 1.45, v.z], fov: 40 };
        guards.forEach((q, i) => { q.sg.die = i === 0 ? 1.4 : undefined; q.sg.mode = 'fire'; });
      }
    }
    return s;
  }

  // сам монтаж: список шотов на r.cinematic; M снимается после
  FL.montageShots = function (r, W, o) {
    o = o || {};
    const M = FL.M = montage(r, W), FX = K.flash(r);
    const clips = CLIPS.slice(0, o.count || CLIPS.length);
    const shots = clips.map((c, i) => {
      const s = sh({ dur: c.dur, hand: 1.15, tense: 1, frame: 0, slow: c.slow, caption: c.cap, cut: i ? 'dip' : undefined });
      s.run = () => {
        if (r.cineSkip) return;
        const f = stageClip(r, W, M, c);
        FX.to(c.fx, 0.1); FX.cut(0.65);
        K.amb.pulse(r, i % 3 === 0 ? 'heart' : 'squeal', 0.5);
        if (!f) { s.at = [0, 1.6, 0]; s.look = [0, 1.6, 5]; s.fov = 60; return; }
        Object.assign(s, f);
        M.t = 0;
      };
      return s;
    });
    return { shots, M, FX };
  };

  // ================================================================== РЕАЛЬНОСТЬ: Диктор у двери (первое лицо)
  // Диктор машет рукой перед глазами → игрок вздрагивает → резкий толчок → падение на пол → удар ногой по двери. Затем (в f48act6b) тёмный коридор.
  FL.realityShots = function (r, W, T, o) {
    o = o || {};
    const R = W.R.deep, d = T.d, g = T.g, st = K.st(r), FX = K.flash(r);
    const Q = { wave: 0, shove: 0, ph: 0 };
    const px = 0, pz = 241.2;
    const off = K.hook(r, (dt) => {
      if (r.disposed) return;
      Q.ph += dt;
      const eye = [px, EYE, pz];
      if (Q.wave > 0.01) {                                                          // правая рука Диктора качается перед лицом игрока
        const sw = Math.sin(Q.ph * 9.5) * 0.2;
        K.armBlend(r, d, 1, Q.wave, eye[0] + sw - 0.04, EYE + 0.08 + Math.cos(Q.ph * 9.5) * 0.04, pz + 0.72);
        K.armBlend(r, d, -1, Q.wave * 0.5, -0.25, 1.1, d.g.position.z - 0.15);
      }
      if (Q.shove > 0.01) {                                                         // обе ладони в грудь игроку
        K.armBlend(r, d, 1, Q.shove, -0.18, EYE - 0.25, d.g.position.z - 0.52);
        K.armBlend(r, d, -1, Q.shove, 0.18, EYE - 0.25, d.g.position.z - 0.52);
      }
    });
    const turn = (n, to, dur) => { const y0 = n.yaw; return r.tween(dur, (k) => { n.yaw = lerpYaw(y0, to, k); n.g.rotation.y = n.yaw; }); };
    let started = false, shoved = false, kicked = false, opened = false, faded = false;
    const door = R.door;
    const shots = [
      // 1. лицо Диктора, рука качается перед камерой
      sh({ at: [px, EYE, pz], to: [px, EYE - 0.02, pz + 0.12], look: [px, EYE + 0.12, 243.3], fov: 56, dur: 4.4, hand: 1.0, tense: 0.8,
        run: () => {
          if (r.cineSkip) return;
          W.enter('deep'); R.alarm = false; door.set(0); K.amb.set(r, 'none', { fade: 0.2 });
          put(d, px + 0.02, 243.15, PI); put(g, 1.5, 242.0, PI + 0.5);
          d.g.visible = g.g.visible = true; d.armT = 0; g.armT = 0;
          r.p.x = px; r.p.z = pz; r.p.yaw = 0; r.p.pitch = 0;
          FX.cut(0.9); FX.to('dull', 0.2); FX.off(2.2);
          r.fade(0, 0.2);
        },
        tick: (rr, e, tt) => {
          if (tt > 0.7 && !started) { started = true; r.tween(0.5, (k) => { Q.wave = k; }); }
          if (tt > 3.4) Q.wave = Math.max(0, Q.wave - 0.05);
        },
        says: [[DIC, 'Hey. Hey! Look at me.', 2.6]] }),
      // 2. вздрагивает: кадр дёрнулся назад, FOV скакнул
      sh({ at: [px, EYE, pz], to: [px, EYE - 0.1, pz - 0.28], look: [px, EYE + 0.15, 243.3], lookTo: [px - 0.1, EYE + 0.55, 243], fov: 56, fovTo: 66, dur: 0.7, hand: 1.6, tense: 1.2, jolt: [0.02, 1.0],
        run: () => { K.amb.pulse(r, 'hit', 0.7); FX.pulse(0.8); r.cineJolt && r.cineJolt(0.9); Q.wave = 0; } }),
      // 3. толчок: Диктор шагает и обеими руками бьёт в грудь, камеру откидывает назад и вверх
      sh({ at: [px, EYE - 0.1, pz - 0.28], to: [px, EYE - 0.35, pz - 1.5], look: [px, EYE, 243], lookTo: [px, 3.2, 241.3], fov: 62, fovTo: 76, roll: 0, rollTo: 0.22, dur: 1.15, hand: 1.4, tense: 1.4, ease: 'in',
        run: () => {
          if (r.cineSkip) return;
          shoved = true; K.amb.pulse(r, 'thunk', 1);
          const z0 = d.g.position.z; r.tween(0.22, (k) => { d.g.position.z = z0 - 0.5 * k; Q.shove = k; });
          setTimeout(() => { K.amb.pulse(r, 'hit', 1); FX.pulse(1); FX.cut(0.45); }, 220);
        } }),
      // 4. падение: пол, потолок, лампы
      sh({ at: [px, EYE - 0.35, pz - 1.5], to: [px, 0.3, pz - 1.9], look: [px, 3.2, 241.3], lookTo: [px - 0.4, 3.4, 242.6], fov: 76, fovTo: 70, roll: 0.22, rollTo: 0.12, dur: 1.2, hand: 1.0, tense: 1.0,
        run: () => { setTimeout(() => { K.amb.pulse(r, 'thunk', 1.3); r.cineJolt && r.cineJolt(1.2); FX.pulse(1); }, 520); Q.shove = 0; } }),
      // 5. снизу: Диктор разворачивается к двери и бьёт ногой; створка срывается
      sh({ at: [0.35, 0.3, 239.3], to: [0.45, 0.34, 239.6], look: [0, 1.5, 242.8], lookTo: [0, 1.7, 243.6], fov: 66, roll: 0.1, dur: 4.0, hand: 1.0, tense: 1.0,
        run: () => { if (r.cineSkip) return; turn(d, 0, 0.45); Q.shove = 0; Q.wave = 0; },
        tick: (rr, e, tt, dur) => {
          if (tt > 0.9 && !kicked) {
            kicked = true; d.bashKind = 'kick';
            r.tween(0.55, (k) => { d.bash = k; }).then(() => { d.bash = 0; d.bashKind = null; });
          }
          if (tt > 1.28 && !opened) {
            opened = true; K.amb.pulse(r, 'boom', 1.2); K.amb.pulse(r, 'clank', 1); r.cineJolt && r.cineJolt(1.4); FX.pulse(1);
            r.tween(0.36, (k) => door.set(k * k)); R.alarm = true;
          }
          if (tt > dur - 0.45 && !faded) { faded = true; r.fade(1, 0.4); }
        } })
    ];
    return { shots, off };
  };
}());
