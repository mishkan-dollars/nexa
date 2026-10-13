// NEXA: штурм комнаты — бесшовная катсцена от первого лица. Игрок у двери жмёт [E]: подходит вплотную, резко оглядывается назад,
// отступает на 1–2 шага, берёт разбег и сокрушающим ударом ноги выбивает дверь. Два случайных варианта:
//   A — удар одной ногой пяткой: дверь срывается с петель и летит в комнату (кувыркается, скользит по полу, сбивает жильца на пути);
//   B — прыжок двумя ногами: дверь распахивается и бьётся на петлях, игрок влетает следом и приземляется на обе ноги.
// Щепки, вырванный замок, пыль, тряска камеры, хит-стоп и замедление, оглушающий хлопок со звоном в ушах (звук — sound.js).
// Жильцов комнаты (interiors.js) на время катсцены ведёт roomsUpdate (бой заморожен cineDepth), реакции начинаются на ударе.
// Управление возвращается сразу после приземления / отдачи, замедление ещё ~1 с — время успеть прицелиться. Озвучки нет.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.Run || !window.Interiors) return;
  const P = C.Run.prototype, PI = Math.PI, I = window.Interiors;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const sm = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const eo = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const ei = (k) => { k = clamp(k, 0, 1); return k * k; };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const hyp = Math.hypot;
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const lerpA = (a, b, k) => a + wrapA(b - a) * k;
  const aimYaw = (dx, dz) => Math.atan2(-dx, -dz);                 // взгляд игрока: вперёд = (−sin yaw, −cos yaw)
  const DW = 1.5, DH = 2.15, RW = 7.0;
  const CFG = { splA: 32, splB: 24, fovRun: 13, slow: 0.3, hitStop: 0.05, jump: 0.42 };

  // ------------------------------------------------------------------ эффекты: щепки, пыль, летящая дверь (пулы создаются заранее, при постройке комнат)
  function fxInit(r) {
    if (r.bkfx) { if (r.hooks.indexOf(r.bkfx.h) < 0) r.hooks.push(r.bkfx.h); return r.bkfx; }
    if (!r.scene || !window.THREE || !r.mat || !r.g) return null;
    const T = THREE, sc = r.scene;
    const F = r.bkfx = { spl: [], dust: [], fly: null, room: null, tx: null, thudT: 0 };
    const mats = [r.mat(0x6a5a46), r.mat(0x3a3a3a), r.mat(0x8a7a64), r.mat(0x2b2b2b)];
    for (let i = 0; i < 46; i += 1) {
      const m = new T.Mesh(r.g.box, mats[i % mats.length]);
      m.visible = false; sc.add(m);
      m.u = { on: false, v: new T.Vector3(), w: new T.Vector3(), s: new T.Vector3(), age: 0, dur: 1, rest: false, hh: 0.03, lock: false };
      F.spl.push(m);
    }
    F.lockMat = r.mat(0x9aa0a8);
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    F.tx = new T.CanvasTexture(cv);
    for (let i = 0; i < 16; i += 1) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: F.tx, transparent: true, depthWrite: false, opacity: 0, color: 0x8d877c, fog: false }));
      s.visible = false; s.u = { on: false, v: new T.Vector3(), age: 0, dur: 1, s0: 1, s1: 2, op: 0.5 }; sc.add(s); F.dust.push(s);
    }
    F.h = (dt) => fxTick(r, F, dt);
    r.hooks.push(F.h);
    setTimeout(() => { try { if (!r.disposed && r.renderer && r.camera) r.renderer.compile(sc, r.camera); } catch (e) { /* не критично */ } }, 500);
    return F;
  }
  const freeOf = (arr) => { for (let i = 0; i < arr.length; i += 1) if (!arr[i].u.on) return arr[i]; return null; };
  function puff(F, x, y, z, vx, vy, vz, s0, s1, dur, op) {
    const s = freeOf(F.dust); if (!s) return;
    const u = s.u; u.on = true; u.age = 0; u.dur = dur; u.s0 = s0; u.s1 = s1; u.op = op; u.v.set(vx, vy, vz);
    s.position.set(x, y, z); s.scale.set(s0, s0, 1); s.material.opacity = 0; s.visible = true;
  }
  function spl(F, x, y, z, vx, vy, vz, sx, sy, sz, dur, mi, lock) {
    const m = freeOf(F.spl); if (!m) return null;
    const u = m.u; u.on = true; u.age = 0; u.dur = dur; u.rest = false; u.lock = !!lock; u.hh = Math.min(sx, sy, sz) * 0.5 + 0.005;
    u.v.set(vx, vy, vz); u.w.set(rnd(-14, 14), rnd(-14, 14), rnd(-14, 14)); u.s.set(sx, sy, sz);
    m.material = lock ? F.lockMat : m.material;
    m.position.set(x, y, z); m.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); m.scale.set(sx, sy, sz); m.visible = true;
    return m;
  }
  function clampRoom(room, pos, v, hx, hz) {                         // стены комнаты: x в глубине, z вдоль зала; hx / hz — полуразмеры предмета
    const u = room.side * (pos.x - room.x0), maxU = room.RD - 0.15 - hx;
    if (u > maxU) { pos.x = room.x0 + room.side * maxU; v.x *= -0.3; }
    const dz = pos.z - room.z, maxZ = RW / 2 - 0.15 - hz;
    if (Math.abs(dz) > maxZ) { pos.z = room.z + Math.sign(dz) * maxZ; v.z *= -0.3; }
  }
  function fxTick(r, F, dt) {
    const room = F.room;
    for (const m of F.spl) {
      const u = m.u; if (!u.on) continue;
      u.age += dt;
      if (u.age >= u.dur) { u.on = false; m.visible = false; continue; }
      if (!u.rest) {
        u.v.y -= 9.8 * dt; m.position.addScaledVector(u.v, dt);
        m.rotation.x += u.w.x * dt; m.rotation.y += u.w.y * dt; m.rotation.z += u.w.z * dt;
        if (m.position.y < u.hh) {
          m.position.y = u.hh;
          if (u.lock && Math.abs(u.v.y) > 1.5 && r.snd) r.snd.play('click', { k: 0.55 });
          u.v.y = -u.v.y * 0.3; u.v.x *= 0.6; u.v.z *= 0.6; u.w.multiplyScalar(0.5);
          if (Math.abs(u.v.y) < 0.7) { u.rest = true; m.rotation.set(0, m.rotation.y, 0); }
        }
        if (room) clampRoom(room, m.position, u.v, 0.05, 0.05);
      }
      const left = u.dur - u.age; if (left < 0.6) m.scale.copy(u.s).multiplyScalar(Math.max(0.001, left / 0.6));
    }
    for (const s of F.dust) {
      const u = s.u; if (!u.on) continue;
      u.age += dt; const k = u.age / u.dur;
      if (k >= 1) { u.on = false; s.visible = false; continue; }
      s.position.addScaledVector(u.v, dt); u.v.multiplyScalar(Math.exp(-dt * 1.4)); u.v.y += dt * 0.12;
      const sz = lerp(u.s0, u.s1, eo(k)); s.scale.set(sz, sz, 1);
      s.material.opacity = u.op * (k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88);
    }
    if (F.fly && F.fly.g.parent) flyStep(r, F, F.fly, dt);
    if (room && room.door && room.door.sw) swingStep(r, F, room, dt);
  }

  // дверь, сорванная с петель: клон панели летит, кувыркается, бьётся об пол и стену, скользит и ложится плашмя
  function makeFly(r, room, D2) {
    const T = THREE, g = new T.Group();
    D2.parts.forEach((m) => { const c = m.clone(); c.position.set(m.position.x, m.position.y - DH / 2, m.position.z - DW / 2); g.add(c); });
    g.position.set(room.x0, DH / 2, room.z); g.rotation.order = 'YXZ';
    r.scene.add(g);
    return g;
  }
  function flyStep(r, F, fl, dt) {
    const g = fl.g, u = g.u, room = fl.room, side = room.side; if (u.rest) return;
    u.t += dt;
    u.v.y -= 9.8 * dt;
    const dr = Math.exp(-dt * 0.7); u.v.x *= dr; u.v.z *= dr;
    g.position.addScaledVector(u.v, dt);
    g.rotation.x = clamp(g.rotation.x + u.w.x * dt, -0.45, 0.45); g.rotation.y += u.w.y * dt; g.rotation.z += u.w.z * dt;
    const cz = Math.abs(Math.cos(g.rotation.z)), sz = Math.abs(Math.sin(g.rotation.z)), hh = cz * DH / 2 + sz * 0.04;
    let ground = false;
    if (g.position.y < hh) {
      g.position.y = hh; ground = true;
      if (Math.abs(u.v.y) > 1.3) {
        if (r.snd && F.thudT <= 0) { r.snd.play('slam', { k: clamp(Math.abs(u.v.y) / 6, 0.25, 0.8) }); F.thudT = 0.18; }
        puff(F, g.position.x, 0.25, g.position.z, rnd(-0.5, 0.5), 0.3, rnd(-0.5, 0.5), 0.6, rnd(1.6, 2.6), rnd(1.2, 2), 0.38);
        r.kick(0.012, 0, 0.01, 0.02);
      }
      u.v.y = -u.v.y * 0.25; u.v.x *= 0.62; u.v.z *= 0.62; u.w.multiplyScalar(0.55);
    }
    if (F.thudT > 0) F.thudT -= dt;
    if (ground && Math.abs(u.v.y) < 1.4) {                          // доезжает и ложится плашмя
      const k = 1 - Math.exp(-dt * 9), tz = Math.round(g.rotation.z / (PI / 2)) * (PI / 2);
      g.rotation.z = lerp(g.rotation.z, tz, k); g.rotation.x = lerp(g.rotation.x, 0, k);
      u.v.x *= Math.exp(-dt * 3.2); u.v.z *= Math.exp(-dt * 3.2);
      if (hyp(u.v.x, u.v.z) < 0.15 && Math.abs(g.rotation.z - tz) < 0.02) { u.rest = true; g.position.y = Math.abs(Math.cos(tz)) * DH / 2 + Math.abs(Math.sin(tz)) * 0.04; }
    }
    clampRoom(room, g.position, u.v, sz * DH / 2 + cz * 0.04, 0.75 * cz + 0.05);
    // сбивает жильца на пути
    if (hyp(u.v.x, u.v.z) > 2.2) {
      for (const e of room.occ) {
        if (e.dead || !e.occ || e.occ.doorHit || e.occ.st === 'fight') continue;
        const dx = e.x - g.position.x, dz = e.z - g.position.z, ext = DH / 2 * cz;
        if (Math.abs(dx) < 0.35 + sz * DH / 2 && Math.abs(dz) < 0.95 && g.position.y - ext < 1.7 && g.position.y + ext > 0.1) { doorHit(r, room, e, u); break; }
      }
    }
  }
  function doorHit(r, room, e, u) {
    const o = e.occ, n = e.n, g = n.g;
    o.doorHit = true;
    if (o.st === 'idle' || o.st === 'alert') I.toShock(r, e, 'door');
    const nx = g.position.x + room.side * 0.6, nz = g.position.z + clamp(u.v.z * 0.12, -0.5, 0.5);
    if (!r.blockedE(nx, g.position.z)) g.position.x = nx;
    if (!r.blockedE(g.position.x, nz)) g.position.z = nz;
    I.setAct(n, 'face', { fear: 1 }); o.t -= 1.1;                   // оглушён ударом дверью: реакция позже
    if (r.snd) { r.snd.play('bodyhit', { k: 1.1 }); r.snd.play('thud', { k: 1.2 }); }
    r.hitmark && r.hitmark(false);
    I.award(r, room, 'door');
    u.v.multiplyScalar(0.4);
  }
  // дверь на петлях (вариант B): распахивается пружиной, бьётся, качается; верхняя петля сорвана — панель слегка завалена
  function swingStep(r, F, room, dt) {
    const D2 = room.door, sw = D2.sw;
    sw.t += dt;
    sw.w += (-92 * (sw.ang - 1.25) - 7.5 * sw.w) * dt;
    sw.ang = clamp(sw.ang + sw.w * dt, 0, 1.78);
    D2.pivot.rotation.y = room.side * sw.ang;
    D2.pivot.rotation.z = room.side * 0.1 * clamp(sw.ang / 1.25, 0, 1.2);
    if (sw.t > 2.4 && Math.abs(sw.w) < 0.05) D2.sw = null;
  }

  // щепки, замок, пыль на ударе
  function burst(r, room, v) {
    const F = fxInit(r); if (!F) return;
    const side = room.side, x0 = room.x0, rz = room.z, n = v === 'A' ? CFG.splA : CFG.splB;
    for (let i = 0; i < n; i += 1) {
      const nearLock = Math.random() < 0.62, zc = nearLock ? rz + 0.62 + rnd(-0.3, 0.3) : rz + rnd(-0.74, 0.74), back = Math.random() < 0.18;
      spl(F, x0 - side * 0.05, rnd(0.25, 2.0), zc, side * (back ? -rnd(1.2, 3.6) : rnd(2.5, 9)), rnd(0.5, 5.5), rnd(-3.2, 3.2),
        rnd(0.02, 0.05), rnd(0.02, 0.05), rnd(0.14, 0.55), rnd(2.8, 4.6), i, false);
    }
    spl(F, x0 - side * 0.05, 1.0, rz + 0.62, side * rnd(7.5, 10), rnd(2.5, 4.5), rnd(-1.2, 1.2), 0.1, 0.16, 0.07, 5, 0, true);   // вырванный замок
    for (let i = 0; i < 9; i += 1) puff(F, x0 + side * rnd(-0.2, 0.7), rnd(0.2, 2.0), rz + rnd(-0.8, 0.8), side * rnd(0.4, 2.6), rnd(-0.1, 0.4), rnd(-0.8, 0.8), 0.5, rnd(1.8, 3.2), rnd(1.6, 2.6), 0.5);
    for (let i = 0; i < 5; i += 1) puff(F, x0 + side * rnd(-1.0, 0.8), 0.2, rz + rnd(-0.9, 0.9), side * rnd(-0.5, 2.2), 0.1, rnd(-1.5, 1.5), 0.5, rnd(1.4, 2.4), rnd(1.0, 1.8), 0.4);
  }

  // ------------------------------------------------------------------ звук
  function sfxImpact(r) {
    const snd = r.snd; if (!snd) return;
    snd.play('kick', { k: 1.25 }); snd.play('slam', { k: 1.15 });
    if (!snd.ctx || !snd.noise || !snd.tone) return;
    const t = snd.ctx.currentTime + 0.004, rd = Math.random;
    snd.noise({ t, type: 'bandpass', f0: 2600, f1: 320, q: 0.9, dur: 0.16, g: 1.0, a: 0.001 });            // треск дерева
    snd.noise({ t: t + 0.02, type: 'highpass', f0: 3600, dur: 0.07, g: 0.55, a: 0.001 });                  // щепа
    snd.tone({ t, type: 'sine', f0: 84, f1: 28, dur: 0.7, g: 1.5, a: 0.004 });                              // удар в грудь
    snd.noise({ t: t + 0.05, type: 'lowpass', f0: 700, f1: 70, q: 0.7, dur: 0.9, g: 0.9, a: 0.01 });
    for (let i = 0; i < 7; i += 1) snd.noise({ t: t + 0.14 + rd() * 0.8, type: 'bandpass', f0: 900 + rd() * 3000, q: 2, dur: 0.04 + rd() * 0.05, g: 0.12 + rd() * 0.16 });
    snd.tone({ t: t + 0.06, type: 'sine', f0: 5200, dur: 1.6, g: 0.045, a: 0.08 });                         // звон в ушах
    if (snd.duck) { snd.duck(true, 0.05); setTimeout(() => { if (!r.disposed) snd.duck(false, 1.0); }, 460); }  // оглушило: мир глохнет и возвращается
  }
  function sfxRun(r) {
    const snd = r.snd; if (!snd || !snd.ctx || !snd.noise) return;
    const t = snd.ctx.currentTime;
    snd.noise({ t, type: 'bandpass', f0: 500, f1: 1800, q: 0.8, dur: 0.4, g: 0.1, a: 0.3 });               // рывок воздуха при разбеге
  }
  const step = (r, k) => { if (r.snd) r.snd.play('footstep', { k }); };

  // ------------------------------------------------------------------ катсцена
  P.breach = function (room, opts) {
    const r = this; opts = opts || {};
    if (!room || r.breaching || r.dead || r.disposed || room.state !== 'closed' || !r.p) return Promise.resolve(false);
    return new Promise((done) => start(r, room, opts, done));
  };
  function start(r, room, opts, done) {
    const side = room.side, x0 = room.x0, rz = room.z, p = r.p;
    const F = fxInit(r);
    const v = opts.variant || (Math.random() < 0.5 ? 'A' : 'B');
    const zS = rz + 0.38;
    const B = [x0 - side * 0.98, zS], Cp = [x0 - side * 2.55, zS], K = [x0 - side * 1.04, zS], L = [x0 + side * 1.3, rz];
    const d0 = hyp(p.x - B[0], p.z - B[1]);
    const T = { a: clamp(0.3 + d0 * 0.28, 0.4, 0.9) }; T.b = T.a + 0.2; T.c = T.b + 0.44; T.d = T.c + 0.5; T.e = T.d + 0.12; T.f = T.e + 0.4;
    const pm = r.pm; if (pm) { pm.crouch = false; pm.sl = null; pm.atk = null; pm.chg = 0; pm.blk = false; }
    r.aimWant = false; r.fireHeld = false; r.rl = null;
    const bk = r.bk = {
      room, side, v, t: 0, T, rig: true, lock: true, kv: 0, kv2: 0, dy: 0, dp: 0, dr: 0, fov: 0, imp: false, ti: 0, landed: false, fl: {},
      p0: { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch }, lb: (Math.random() < 0.5 ? -1 : 1) * rnd(2.2, 2.8), B, Cp, K, L, zS, lockZ: rz + 0.62, barsWas: r.layer.classList.contains('bars'), done, F
    };
    r.breaching = true; room.breaching = true;
    r.cineDepth += 1; r.syncLock(); r.layer.classList.add('bars');
    bk.h = (dt) => bkTick(r, bk, dt);
    r.hooks.push(bk.h);
  }
  function setPos(r, x, z) { const p = r.p; if (!r.blocked(x, p.z)) p.x = x; if (!r.blocked(p.x, z)) p.z = z; }
  function walk(r, x, z, mv) {                                       // шаг с учётом стен; покачивание камеры идёт от p.phase / p.moving
    const p = r.p, ox = p.x, oz = p.z;
    setPos(r, x, z);
    p.phase += hyp(p.x - ox, p.z - oz) * 2.6; p.moving = mv;
  }
  function bkTick(r, bk, dt0) {
    const ts = Math.max(0.01, r.timeScale || 1), dt = Math.min(0.05, dt0 / ts);
    bk.t += dt;
    const t = bk.t, T = bk.T, p = r.p, room = bk.room, side = bk.side, fl = bk.fl, face = () => aimYaw(room.x0 - p.x, bk.lockZ - p.z);
    if (bk.lock && !bk.imp) {
      if (t < T.a) {                                                   // подходит к двери
        const k = t / T.a, e = sm(k);
        walk(r, lerp(bk.p0.x, bk.B[0], e), lerp(bk.p0.z, bk.B[1], e), 0.65 * (1 - k * 0.5));
        p.yaw = lerpA(bk.p0.yaw, face(), sm(Math.min(1, k * 1.35))); p.pitch = lerp(bk.p0.pitch, 0.03, e);
      } else if (t < T.b) {                                            // замер у двери, вдох
        p.moving = 0; p.yaw = face(); p.pitch = 0.03; bk.dy = -0.025 * Math.sin(PI * (t - T.a) / (T.b - T.a));
        if (!fl.in) { fl.in = 1; r.snd && r.snd.play('rustle', { k: 1 }); }
      } else if (t < T.c) {                                            // резко оглядывается: рывок, пауза, обратно
        const q = t - T.b; p.moving = 0;
        const ofs = q < 0.15 ? bk.lb * eo(q / 0.15) : q < 0.29 ? bk.lb : bk.lb * (1 - sm((q - 0.29) / 0.15));
        const bump = q < 0.15 ? eo(q / 0.15) : q < 0.29 ? 1 : 1 - sm((q - 0.29) / 0.15);
        p.yaw = face() + ofs; p.pitch = 0.03 - 0.06 * bump; bk.dr = -Math.sign(bk.lb) * 0.07 * bump; bk.dy = 0;
        if (!fl.lb) { fl.lb = 1; r.snd && r.snd.play('rustle', { k: 1.4 }); r.kick(0, 0, 0, 0.012); }
      } else if (t < T.d) {                                            // два шага назад, взгляд на дверь
        const k = (t - T.c) / (T.d - T.c);
        bk.dr = 0; walk(r, lerp(bk.B[0], bk.Cp[0], sm(k)), bk.zS, 0.85); p.yaw = face(); p.pitch = 0.02; bk.dy = -0.03 * Math.sin(PI * k);
        if (!fl.s1 && k > 0.12) { fl.s1 = 1; step(r, 0.8); }
        if (!fl.s2 && k > 0.6) { fl.s2 = 1; step(r, 0.8); }
      } else if (t < T.e) {                                            // собирается: пауза и сердце
        const k = (t - T.d) / (T.e - T.d);
        p.moving = 0; p.yaw = face(); bk.dy = -0.06 * sm(k);
        if (!fl.hb) { fl.hb = 1; r.snd && r.snd.play('heartbeat', { k: 0.9 }); }
      } else if (t < T.f) {                                            // разбег и замах ногой
        const k = (t - T.e) / (T.f - T.e), s = k * k;
        walk(r, lerp(bk.Cp[0], bk.K[0], s), bk.zS, 1); p.phase += 0.12; p.yaw = face(); p.pitch = lerp(0.02, -0.01, k);
        bk.fov = CFG.fovRun * s; bk.dy = lerp(-0.06, 0, sm(k * 1.6)) - 0.03 * Math.sin(p.phase * 2);
        bk.kv = sm((k - 0.38) / 0.62); bk.kv2 = bk.v === 'B' ? bk.kv : 0;
        if (bk.v === 'B' && k > 0.5) bk.dy += CFG.jump * Math.sin(PI * (t - (T.f - 0.2)) / 0.77);
        if (!fl.r0) { fl.r0 = 1; sfxRun(r); }
        if (!fl.r1 && k > 0.1) { fl.r1 = 1; step(r, 1.1); }
        if (!fl.r2 && k > 0.38) { fl.r2 = 1; step(r, 1.3); }
      } else impact(r, bk);
    }
    if (bk.imp) post(r, bk, t - bk.ti, dt);
  }

  function impact(r, bk) {
    const room = bk.room, D2 = room.door, side = bk.side, x0 = room.x0, rz = room.z, v = bk.v, F = bk.F;
    bk.imp = true; bk.ti = bk.t; bk.dr = 0; bk.kv = 1; bk.kv2 = v === 'B' ? 1 : 0;
    room.state = 'open'; D2.col.off = true;
    room.occ.forEach((e) => { if (!e.dead && e.occ && (e.occ.st === 'idle' || e.occ.st === 'alert')) I.toShock(r, e, 'door'); });   // шок раньше, чем noise() поднимет «засаду»
    if (F) {
      F.room = room;
      if (v === 'A') {
        D2.pivot.visible = false;
        const g = makeFly(r, room, D2); D2.fly = g;
        g.u = { v: new THREE.Vector3(side * rnd(6.4, 7.8), rnd(1.8, 3.0), rnd(-0.9, 0.9)), w: new THREE.Vector3(rnd(-1.2, 1.2), rnd(-1.8, 1.8), -side * rnd(2.6, 4.2)), rest: false, t: 0 };
        F.fly = { room, g };
      } else D2.sw = { ang: 0, w: 13, t: 0 };
      burst(r, room, v);
    }
    r.kick(0.08, bk.lb > 0 ? 0.015 : -0.015, 0.04 * Math.sign(bk.lb), 0.1);
    r.rumble && r.rumble(1, 1, 420);
    r.sparks && r.sparks(x0 - side * 0.1, 1.0, rz + 0.62, -side, 0.3, 0, 7);
    sfxImpact(r);
    r.noise && r.noise(15);
    r.stress = Math.min(1, (r.stress || 0) + 0.05);
  }

  function post(r, bk, tau, dt) {
    const p = r.p, side = bk.side, A = bk.v === 'A';
    // замедление: хит-стоп → бег в замедлении → плавный возврат (ts пишем каждый кадр, пока идёт)
    r.timeScale = tau < CFG.hitStop ? 0.05 : tau < 1.1 ? CFG.slow : tau < 1.7 ? lerp(CFG.slow, 1, sm((tau - 1.1) / 0.6)) : 1;
    if (bk.lock) {
      if (A) {
        const back = 0.1 * Math.sin(PI * clamp(tau / 0.45, 0, 1));
        setPos(r, bk.K[0] - side * back, bk.zS); p.moving = 0;
        bk.kv = tau < 0.08 ? 1 : 1 - sm((tau - 0.08) / 0.45);
        bk.fov = lerp(CFG.fovRun, 0, sm(tau / 0.7)) + 3 * Math.exp(-tau * 7);
        bk.dp = 0.05 * Math.exp(-tau * 9); bk.dy = -0.04 * Math.exp(-tau * 6);
        if (tau >= 0.55) release(r, bk);
      } else {
        const s = clamp(tau / 0.55, 0, 1);
        walk(r, lerp(bk.K[0], bk.L[0], s), lerp(bk.zS, bk.room.z, clamp(s * 2.2, 0, 1)), 0.3);
        bk.dy = tau <= 0.55 ? CFG.jump * Math.sin(PI * (tau + 0.2) / 0.77) : -0.3 * Math.sin(PI * clamp((tau - 0.55) / 0.35, 0, 1));
        bk.kv = bk.kv2 = tau < 0.4 ? 1 : 1 - sm((tau - 0.4) / 0.3);
        bk.dp = tau <= 0.55 ? 0.06 * Math.sin(PI * s) : -0.05 * Math.sin(PI * clamp((tau - 0.55) / 0.35, 0, 1));
        bk.fov = lerp(CFG.fovRun, 0, sm(tau / 0.9));
        if (!bk.landed && tau >= 0.55) {                             // приземление на обе ноги
          bk.landed = true; p.moving = 0;
          if (r.snd) { r.snd.play('thud', { k: 1.4 }); r.snd.play('footstep', { k: 1.7 }); }
          r.kick(0.06, 0, 0.02, 0.05); r.rumble && r.rumble(0.7, 0.5, 200);
          const F = bk.F; if (F) for (let i = 0; i < 4; i += 1) puff(F, p.x + rnd(-0.4, 0.4), 0.2, p.z + rnd(-0.4, 0.4), rnd(-1, 1), 0.2, rnd(-1, 1), 0.5, rnd(1.2, 2), rnd(0.9, 1.5), 0.35);
        }
        if (tau >= 0.92) release(r, bk);
      }
    }
    if (tau >= 1.7) finish(r, bk);
  }
  function release(r, bk) {                                          // управление возвращается (замедление ещё идёт)
    if (!bk.lock) return;
    bk.lock = false; bk.rig = false; bk.kv = bk.kv2 = bk.dy = bk.dp = bk.dr = bk.fov = 0;
    bk.room.breaching = false; r.breaching = false;
    r.p.pitch = 0; r.p.moving = 0;
    r.cineDepth = Math.max(0, r.cineDepth - 1); r.syncLock();
    if (!bk.barsWas) r.layer.classList.remove('bars');
  }
  function finish(r, bk) {
    release(r, bk);
    r.timeScale = 1;
    const i = r.hooks.indexOf(bk.h); if (i >= 0) r.hooks.splice(i, 1);
    if (r.bk === bk) r.bk = null;
    bk.done(true);
  }

  // ------------------------------------------------------------------ обёртки камеры и тела (самый внешний слой: загружаемся после pmove.js)
  const pc1 = P.pmCam;
  P.pmCam = function (cam, dt) {
    if (pc1) pc1.call(this, cam, dt);
    const bk = this.bk; if (!bk || !bk.rig) return;
    cam.position.y += bk.dy; cam.rotation.x += bk.dp; cam.rotation.z += bk.dr;
  };
  const fov1 = P.fovNow;
  P.fovNow = function () {
    const f = fov1 ? fov1.call(this) : this.baseFov, bk = this.bk;
    return bk && bk.rig ? f + bk.fov : f;
  };
  const rig1 = P.updateRig;
  P.updateRig = function (dt, vel) {
    const bk = this.bk, s = this.pm;
    if (bk && bk.rig && s) s.kv = Math.max(s.kv || 0, bk.kv, bk.kv2);   // pmove.js: нога правого удара и опускание оружия идут от s.kv
    const res = rig1.call(this, dt, vel);
    if (bk && bk.rig && this.legs && bk.kv2 > 0.01) {                  // прыжок: обе ноги вперёд, чуть врозь
      const b = clamp(bk.kv2, 0, 1);
      for (let i = 0; i < 2; i += 1) {
        const g = this.legs[i];
        g.rotation.x = lerp(g.rotation.x, 1.38 + i * 0.07, b); g.rotation.z = (i ? 1 : -1) * 0.07 * b;
        g.position.y = lerp(g.position.y, -0.42, b); g.scale.y = lerp(g.scale.y, 0.74, b);
      }
    }
    return res;
  };

  // пулы эффектов создаём при постройке первой комнаты (шейдеры спрайтов компилируются заранее, а не на ударе)
  const ib1 = P.intBuild;
  if (ib1) {
    P.intBuild = function () {
      const res = ib1.apply(this, arguments);
      if (this.int && this.int.rooms.length) fxInit(this);
      return res;
    };
  }

  window.Breach = { CFG, fxInit, start: (r, room, o) => r.breach(room, o) };
}());
