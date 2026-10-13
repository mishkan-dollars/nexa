// a_experiment: «Финальный эксперимент» (миссия 6) — семь пронумерованных постаментов HIGH/LOW, безликие свидетели, субъект 024 за стойкой.
(() => {
  const B = 0.41371;
  const TAU = Math.PI * 2;

  // <KIT>
  // ------------------------------------------------------------------ набор помощников (общий для сцен a_*)
  const AK = {
    // сценарий миссии (play) замораживаем: съёмкой управляет сцена; свет возвращаем (мигание не доигрывается)
    init(S, o) {
      const r = S.r; o = o || {};
      r.combat();                                       // враги, трассы, кровь — для любой миссии
      r.tw = []; r.waiters = [];
      r.lightsLevel(o.light === undefined ? 1 : o.light);
      AK.purge(S);
      const h = r.bounds.h;
      S.ceil = r.scene.children.filter((m) => m.isMesh && Math.abs(m.position.y - (h + 0.05)) < 0.01 && Math.abs(m.scale.y - 0.1) < 0.001);
    },
    // враг этой сцены (помечен: чужих обитателей комнат мира не трогаем — ими управляет сам мир)
    en(S, type, x, z, o) { const e = S.r.enemy(type, x, z, o); e.mine = true; return e; },
    live(S) { return S.r.cb.enemies.filter((e) => e.mine && !e.dead && !e.t.passive); },
    nearest(S, x, z) { let b = null, bd = 1e9; AK.live(S).forEach((e) => { const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; b = e; } }); return b; },
    // убрать своих врагов (живых и павших) и силуэты-герои
    purge(S) {
      const r = S.r, cb = r.cb;
      for (let i = cb.enemies.length - 1; i >= 0; i -= 1) {
        const e = cb.enemies[i];
        if (!e.mine && !e.purge) continue;
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
      e.hp = 1e9; e.purge = true; e.mine = true; e.n.armT = 0;
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

  const dim = (S, from, to) => { const r = S.r; r.pads.forEach((q) => { if (q.i >= from && q.i <= to) q.box.material = r.mat(0x151515); }); };

  const acts = AK.plan([
    // 1. боковой проезд вдоль ряда постаментов на уровне груди: цифры плывут слева направо, за четвёркой стоит 024
    { id: 'plinth_dolly', beats: 8, pre: 0.3,
      start(S) { const r = S.r; AK.purge(S); r.p.x = 0; r.p.z = 6.5; r.others.forEach((n) => { n.watch = true; }); r.s.watch = true; this.cam(S, 0, 0); },
      tick(S, t) { S.r.p.x = 0; S.r.p.z = 6.5; S.r.p.moving = 0; },
      cam(S, k, t) {
        const u = AK.u(S, k, 0.6);
        AK.cam(S, t, [-4.6 + 7.4 * u, 0.95 + 0.25 * u, 0.2 - 0.3 * u], [-1.5 + 3.0 * u, 1.15, -3.4], 56 + 4 * u, { amp: 0.008 });
      } },
    // 2. кран над рядом: потолка нет; после каждого ответа HIGH/LOW часть постаментов гаснет
    { id: 'crane_plinths', beats: 8, pre: 0.3,
      start(S) {
        const r = S.r; AK.purge(S); AK.ceil(S, false); r.setAmbient(0.85); r.p.x = 0; r.p.z = 6.5;
        r.pads.forEach((q) => { q.box.material = r.mat(0x2a2a2a); }); this.cam(S, 0, 0);
      },
      tick(S, t, dt, A) {
        const r = S.r; r.p.x = 0; r.p.z = 6.5; r.p.moving = 0;
        if (!A.a && t >= 1.2) { A.a = true; dim(S, 1, 4); AK.log(S, 'dim 1-4'); }
        if (!A.b && t >= 2.3) { A.b = true; dim(S, 6, 7); AK.log(S, 'dim 6-7'); }
      },
      end(S) { AK.ceil(S, true); S.r.pads.forEach((q) => { q.box.material = S.r.mat(0x2a2a2a); }); },
      cam(S, k, t) {
        const u = AK.u(S, k, 0.5);
        AK.cam(S, t, [3.8 - 4.6 * u, 1.3 + 8.2 * u, 7.0 - 0.5 * u], [0.0, 0.6, -3.6 + 0.3 * u], 62 - 10 * u, { amp: 0.008 });
      } },
    // 3. наезд на 024 между постаментами: голова склоняется набок
    { id: 'push_024', beats: 6, pre: 0.3,
      start(S) { const r = S.r; AK.purge(S); r.p.x = 0; r.p.z = 6.5; r.s.watch = true; r.tilt(r.s, 0.0); this.cam(S, 0, 0); },
      tick(S, t, dt, A) { const r = S.r; r.p.x = 0.75; r.p.z = 1.5; r.p.moving = 0; if (!A.t && t >= 0.8) { A.t = true; r.tilt(r.s, 0.5); } },
      end(S) { S.r.tilt(S.r.s, 0); },
      cam(S, k, t) {
        const u = AK.u(S, k, 0.5);
        AK.cam(S, t, [0.8 - 0.1 * u, 1.45 - 0.15 * u, 2.2 - 4.3 * u], [0.0, 1.5, -6.0], 58 - 9 * u, { amp: 0.006 });
      } },
    // 4. FP: идём к ряду, свидетели поворачивают головы за нами; взгляд скользит по цифрам
    { id: 'walk_numbers', beats: 6, pre: 0.3,
      start(S) {
        const r = S.r; AK.fpStart(S, 0.8, 6.2, 0.0); r.setAmbient(0.7); r.others.forEach((n) => { n.watch = true; }); r.s.watch = true;
        S.A.tgt = [[-3.0, 1.2, -3.0], [0.0, 1.2, -3.0], [3.0, 1.2, -3.0]];
      },
      tick(S, t, dt, A) {
        const q = A.tgt, i = Math.min(2, Math.floor(t / 0.95));
        S.fp.walkTo(0.4, 0.5, false);
        S.fp.lookAt(q[i][0] + Math.sin(t * 1.0) * 0.2, 1.1, q[i][2], dt, 0.5, 1.6);
      },
      cam(S) { AK.ensureFP(S); } },
    // 5. низкий ракурс снизу вверх: силуэт 024 выше цифры 4, сзади свет ламп
    { id: 'low_024', beats: 4, pre: 0.2,
      start(S) { const r = S.r; AK.purge(S); r.p.x = 0; r.p.z = 6.5; r.s.watch = true; r.arm(r.s, true); this.cam(S, 0, 0); },
      tick(S) { S.r.p.x = 0; S.r.p.z = 6.5; S.r.p.moving = 0; },
      end(S) { S.r.arm(S.r.s, false); },
      cam(S, k, t) {
        const u = AK.u(S, k, 0.55);
        AK.cam(S, t, [-2.4 + 1.6 * u, 0.22, -1.2 - 0.6 * u], [0.1, 1.55, -6.0], 64 - 6 * u, { amp: 0.006, roll: 0.03 * (1 - u) });
      } }
  ], 0.4);

  Trl.scene('a_experiment', {
    mission: 6, seed: 61, acts,
    setup(S) { AK.init(S); S.act = null; },
    tick(S, t, dt) { AK.run(S, acts, t, dt); },
    cuts: AK.cuts(acts)
  });
})();
