// a_breakout_fp: побег из блока содержания (миссия 7), кадры от первого лица.
// Пять «актов» — каждый заканчивается своим кадром: рывок из камеры, перестрелка за колонной, пинок, подкат, бег по карантинному коридору.
// Между актами мир переставляется (сцена идёт по времени симуляции, кадры — только внутри нарезок).
(() => {
  const B = 0.41371;
  const TAU = Math.PI * 2;

  // <KIT>
  // ------------------------------------------------------------------ набор помощников (общий для сцен a_*)
  const AK = {
    // сценарий миссии (play) замораживаем: съёмкой управляет сцена; свет возвращаем (мигание не доигрывается)
    init(S, o) {
      const r = S.r; o = o || {};
      r.tw = []; r.waiters = [];
      r.lightsLevel(o.light === undefined ? 1 : o.light);
      AK.purge(S);
      const h = r.bounds.h;
      S.ceil = r.scene.children.filter((m) => m.isMesh && Math.abs(m.position.y - (h + 0.05)) < 0.01 && Math.abs(m.scale.y - 0.1) < 0.001);
    },
    // убрать всех живых и мёртвых врагов (бочки и мишени остаются)
    purge(S) {
      const r = S.r, cb = r.cb;
      for (let i = cb.enemies.length - 1; i >= 0; i -= 1) {
        const e = cb.enemies[i];
        if (e.t.passive && !e.purge) continue;
        e.dead = true; e.alive = false; e.n.free = true; e.n.g.visible = false; if (e.n.laser) e.n.laser.visible = false;
        cb.enemies.splice(i, 1);
        const k = cb.shoot.indexOf(e); if (k >= 0) cb.shoot.splice(k, 1);
      }
    },
    // игрок: позиция/взгляд, сброс пружин взгляда, оружие заряжено, режим FP
    fpStart(S, x, z, yaw, pitch, o) {
      const r = S.r, p = r.p; o = o || {};
      AK.purge(S);
      p.x = x; p.z = z; p.yaw = yaw || 0; p.pitch = pitch || 0; p.moving = 0; r.prevYaw = undefined;
      const F = S.fpState; F.yaw = p.yaw; F.pitch = p.pitch; F.yv = F.pv = F.mx = F.mz = 0;
      S.fp.stop(); S._eng = null; S._wp = {};
      r.aimWant = false; r.aimK = 0; r.fireHeld = false; r.rl = null; r.swapTo = null; r.fireCd = 0;
      r.inv.forEach((w) => { w.mag = w.def.mag; w.reserve = w.def.reserve; });
      if (r.pm) { r.pm.crouch = false; r.pm.sl = null; r.pm.drop = 0; r.pm.dv = 0; r.pm.slCd = 0; }
      r.timeScale = 1; r.camFree && S.camFP();
      r.cb.flashK = 0;
    },
    ensureFP(S) { if (S.r.camFree) S.camFP(); },
    key(code) { AK.log(Trl, 'key', code); document.dispatchEvent(new KeyboardEvent('keydown', { code, key: code })); document.dispatchEvent(new KeyboardEvent('keyup', { code, key: code })); },
    // свободная камера с лёгкой «рукой оператора»: P/L — [x,y,z]
    cam(S, t, P, L, fov, o) {
      o = o || {};
      const h = S.hand(t, o.amp === undefined ? 0.012 : o.amp, o.seed || 1);
      S.camFree(P[0] + h[0], P[1] + h[1], P[2] + h[0] * 0.6, L[0] + h[1] * 2.5, L[1] + h[0] * 2, L[2], fov, (o.roll || 0) + h[0] * 0.01);
    },
    // плавный путь: ease на концах не нулевой (первый кадр уже в движении)
    u(S, k, e) { return S.lerp(k, S.smoother(k), e === undefined ? 0.5 : e); },
    // силуэт-«герой» для Free-кадров (игрока в свободной камере не видно): пассивная мишень с пистолетом
    hero(S, x, z, yaw, gun) {
      const r = S.r, e = r.enemy('target', x, z, { gun: gun === undefined ? 'pistol' : gun, exact: true, drop: false, yaw: yaw || 0 });
      e.hp = 1e9; e.purge = true; e.n.armT = 0;
      return e;
    },
    go(e, x, z, speed) { e.n.goal = { x, z, speed, res: null }; },
    face(e, x, z) { e.n.yaw = Math.atan2(x - e.x, z - e.z); },
    // выстрел героя по врагу: вспышка, трасса, урон
    shoot(S, h, e, head, dmg) {
      const r = S.r, T = THREE; if (e.dead) return;
      const hx = h.x, hz = h.z, ty = (head ? 1.58 : 1.2) * (e.t.scale || 1);
      AK.face(h, e.x, e.z); h.n.armT = 1; h.muz = 0.06; h.n.kick = 1;
      const dx = e.x - hx, dy = ty - 1.35, dz = e.z - hz, l = Math.hypot(dx, dy, dz);
      r.tracerFrom(r.rg, r.wp, { t: l }, dx / l, dy / l, dz / l, { x: hx + dx / l * 0.5, y: 1.35, z: hz + dz / l * 0.5 }, new T.Vector3(hx + dx / l * 0.5, 1.35, hz + dz / l * 0.5));
      r.damageEnemy(e, dmg || 80, !!head, { x: e.x, y: ty, z: e.z });
    },
    ceil(S, on) { S.ceil.forEach((m) => { m.visible = on; }); },
    // расписание актов → нарезки
    plan(acts, T0) {
      let T = T0 || 0.4;
      acts.forEach((a) => { a.T0 = T; a.t0 = T + (a.pre || 0); a.dur = a.beats * B; a.T1 = a.t0 + a.dur + (a.tail === undefined ? 0.35 : a.tail); T = a.T1; });
      return acts;
    },
    cuts(acts) { const c = {}; acts.forEach((a) => { c[a.id] = { t0: a.t0, dur: a.dur, cam: (S, k, t) => a.cam(S, k, t) }; }); return c; },
    log(S, ...a) { if (S.S_ev) S.S_ev.push([+(S.now || 0).toFixed(2), ...a]); },
    run(S, acts, t, dt) {
      S.now = t;
      const w = S.r.wp; if (w) { if (S._mag !== undefined && w.mag < S._mag) AK.log(S, 'shot'); S._mag = w.mag; }
      for (let i = 0; i < acts.length; i += 1) {
        const a = acts[i];
        if (t < a.T0 || t >= a.T1) continue;
        if (S.act !== a) { if (S.act && S.act.end) S.act.end(S); S.act = a; S.A = {}; a.start(S); AK.log(S, 'act', a.id); }
        a.tick(S, t - a.T0, dt, S.A);
        return;
      }
    }
  };

  // </KIT>

  // ------------------------------------------------------------------ акты
  const acts = AK.plan([
    // 1. рывок из камеры: дверь поднимается, в конце зала — силуэты охраны; первый выстрел из поднятого пистолета
    { id: 'cell_dash', beats: 6, pre: 0.4,
      start(S) {
        const r = S.r; AK.fpStart(S, 0.5, 35.0, 0.0); r.closeDoor(r.d1);
        r.enemy('grunt', -1.0, 4.5, { yaw: 0, pers: 'pro' }); r.enemy('grunt', 1.6, 2.0, { yaw: 0, pers: 'panic' });
      },
      tick(S, t, dt, A) {
        const r = S.r, p = r.p;
        if (!A.o && t >= 0.7) { A.o = true; r.openDoor(r.d1, 0.45); }
        if (p.z > 28.4 && !A.aim) { S.fp.walkTo(0.2, 22, true); S.fp.look(0, 0, dt, 0.4, 3); }
        else { A.aim = true; S.fp.stop(); r.aimWant = true; S.engage(dt, { tau: 0.2, vmax: 3.2, head: false, delay: 0.25, range: 50 }); }
      },
      cam(S) { AK.ensureFP(S); } },
    // 2. перестрелка в зале: за ящиком, присев; охрана лезет в дверь
    { id: 'crate_fight', beats: 6, pre: 0.3,
      start(S) {
        const r = S.r; AK.fpStart(S, 3.2, 21.5, 0.0); r.openNow(r.d1);
        r.enemy('grunt', -1.2, 6.5, { yaw: 0, pers: 'pro' }); r.enemy('grunt', 1.5, 4.0, { yaw: 0, pers: 'pro' }); r.enemy('rusher', 0.0, 0.0, { yaw: 0, pers: 'zealot' });
      },
      tick(S, t, dt, A) {
        const r = S.r, p = r.p;
        if (t < 0.5) { S.fp.walkTo(4.9, 17.6, false); S.fp.look(0.15, 0, dt, 0.4, 3); }
        else {
          S.fp.stop();
          if (!A.cr) { A.cr = true; AK.key('KeyC'); }
          r.aimWant = true; S.engage(dt, { tau: 0.2, vmax: 3.6, head: t > 1.4, delay: 0.15, range: 40 });
        }
      },
      cam(S) { AK.ensureFP(S); } },
    // 3. пинок: рашер вплотную
    { id: 'kick', beats: 4, pre: 0.3,
      start(S) {
        const r = S.r; AK.fpStart(S, 0.0, 14.0, 0.0);
        A_rusher = r.enemy('rusher', 0.0, 3.0, { yaw: 0, pers: 'zealot' });
      },
      tick(S, t, dt, A) {
        const r = S.r, e = A_rusher;
        r.aimWant = false;
        if (!e || e.dead) { S.engage(dt, { tau: 0.2, vmax: 3, head: true, tol: 0.06 }); return; }
        const d = Math.hypot(e.x - r.p.x, e.z - r.p.z);
        S.fp.lookAt(e.x, 1.1, e.z, dt, 0.2, 3.5);
        if (!A.k && d < 2.1) { A.k = true; A.kt = t; AK.key('KeyV'); }
        if (A.k && t > A.kt + 0.62) S.engage(dt, { tau: 0.2, vmax: 3.5, head: true, tol: 0.07 });
      },
      cam(S) { AK.ensureFP(S); } },
    // 4. подкат: бег в охранника, сбить с ног
    { id: 'slide', beats: 4, pre: 0.45,
      start(S) {
        const r = S.r; AK.fpStart(S, 0.0, 12.0, 0.0);
        A_grunt = r.enemy('grunt', 0.0, -2.5, { yaw: 0, pers: 'zealot' });
      },
      tick(S, t, dt, A) {
        const r = S.r, e = A_grunt, d = e ? Math.hypot(e.x - r.p.x, e.z - r.p.z) : 99;
        if (!A.s) {
          S.fp.walkTo(0, -6, true); S.fp.lookAt(e.x, 1.0, e.z, dt, 0.3, 3);
          if (d < 3.0 && r.p.moving > 0.3 && t > 0.5) { A.s = true; A.st = t; AK.key('KeyC'); }
        } else if (t > A.st + 1.0) { r.aimWant = true; S.engage(dt, { tau: 0.2, vmax: 3.5, head: true, tol: 0.07 }); }
      },
      cam(S) { AK.ensureFP(S); } },
    // 5. карантинный коридор: бег, из тьмы навстречу рашеры
    { id: 'corridor_run', beats: 6, pre: 0.4,
      start(S) {
        const r = S.r; AK.fpStart(S, 0.0, -36.0, 0.0); r.openNow(r.d3);
        r.enemy('rusher', -1.0, -62.0, { yaw: Math.PI, pers: 'zealot' }); r.enemy('rusher', 1.0, -66.0, { yaw: Math.PI, pers: 'zealot' });
      },
      tick(S, t, dt, A) {
        const r = S.r;
        if (t < 1.5) { S.fp.walkTo(0, -60, true); S.fp.look(0, 0, dt, 0.4, 3); }
        else { S.fp.stop(); r.aimWant = true; S.engage(dt, { tau: 0.18, vmax: 4, head: true, delay: 0.1, tol: 0.06, range: 60 }); }
      },
      cam(S) { AK.ensureFP(S); } }
  ], 0.4);

  let A_rusher = null, A_grunt = null;

  Trl.scene('a_breakout_fp', {
    mission: 7, seed: 11, acts,
    setup(S) {
      const r = S.r;
      AK.init(S); S.act = null;
      r.cb.killHooks.push((e, head) => AK.log(S, 'kill', e.type, head ? 'head' : 'body'));
      r.giveWeapon('glock', { equip: true });
      r.openNow(r.d2); r.openNow(r.d3);
    },
    tick(S, t, dt) { AK.run(S, acts, t, dt); },
    cuts: AK.cuts(acts)
  });
})();
