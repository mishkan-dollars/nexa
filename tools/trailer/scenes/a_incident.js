// a_incident: «Инцидент 1103» (миссия 4) — тёмный объект, фонарь, безликие свидетели. FP-проход с фонарём и свободные облёты круга силуэтов.
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

  // круг свидетелей вокруг точки: n силуэтов на радиусе rad (свободные места: не в стене)
  const ringAt = (S, cx, cz, rad, a0) => {
    const r = S.r, ring = r.ring;
    ring.forEach((n, i) => {
      const a = a0 + (i / ring.length) * TAU;
      let x = cx + Math.sin(a) * rad, z = cz + Math.cos(a) * rad;
      for (let k = 0; k < 6 && r.blockedE(x, z); k += 1) { x = cx + Math.sin(a) * (rad - 0.4 * (k + 1)); z = cz + Math.cos(a) * (rad - 0.4 * (k + 1)); }
      r.placeNpc(n, x, z); n.g.visible = true; n.watch = true; n.goal = null;
    });
  };
  const hideRing = (S) => S.r.ring.forEach((n) => { n.g.visible = false; n.watch = false; n.goal = null; });

  const acts = AK.plan([
    // 1. проход с фонарём: впереди зигзаг перегородок, на ходу вокруг из темноты возникает круг силуэтов; луч медленно ведёт по ним
    { id: 'torch_walk', beats: 8, pre: 0.4,
      start(S) {
        const r = S.r; AK.fpStart(S, 3.4, 10.5, 0.0); r.setAmbient(0.2); r.torch.intensity = 1.9; hideRing(S); S.A.set = false;
      },
      tick(S, t, dt, A) {
        const r = S.r, p = r.p;
        if (t < 1.9) { S.fp.walkTo(3.4, 1.8, false); S.fp.look(0.0, -0.02, dt, 0.4, 2); }
        else { S.fp.stop(); }
        if (!A.set && t >= 1.45) { A.set = true; ringAt(S, p.x, p.z, 3.6, 0.5); AK.log(S, 'ring'); }
        if (t >= 1.9) S.fp.look(0.0 + Math.min(1, (t - 1.9) / 1.4) * -2.4 + 0.7, -0.03, dt, 0.5, 1.3);
      },
      cam(S) { AK.ensureFP(S); } },
    // 2. круг свидетелей и один в центре: облёт на высоте глаз, камера поднимается
    { id: 'ring_orbit', beats: 8, pre: 0.4,
      start(S) {
        const r = S.r; AK.purge(S); r.setAmbient(0.3); r.torch.intensity = 2.4;
        S.A.h = AK.hero(S, 3.4, 7.6, Math.PI, null);
        r.p.x = 3.4; r.p.z = 7.6; ringAt(S, 3.4, 7.6, 3.6, 0.2); this.cam(S, 0, 0);
      },
      tick(S, t, dt, A) { S.r.p.x = 3.4; S.r.p.z = 7.6; S.r.p.moving = 0; },
      cam(S, k, t) {
        const u = AK.u(S, k, 0.55), a = 0.35 + 1.9 * u, R = 8.2 - 1.2 * u;
        AK.cam(S, t, [3.4 + Math.sin(a) * R, 1.25 + 1.5 * u, 7.6 + Math.cos(a) * R], [3.4, 1.25, 7.6], 62 - 6 * u, { amp: 0.012 });
      } },
    // 3. круг сжимается: потолка нет, камера высоко над центром
    { id: 'ring_close', beats: 6, pre: 0.3,
      start(S) {
        const r = S.r; AK.purge(S); AK.ceil(S, false); r.setAmbient(0.55); r.torch.intensity = 1.2;
        S.A.h = AK.hero(S, 3.4, 7.6, Math.PI, null);
        r.p.x = 3.4; r.p.z = 7.6; ringAt(S, 3.4, 7.6, 4.6, 0.9); this.cam(S, 0, 0);
      },
      tick(S, t, dt, A) {
        const r = S.r; r.p.x = 3.4; r.p.z = 7.6; r.p.moving = 0;
        r.ring.forEach((n, i) => { const a = 0.9 + (i / r.ring.length) * TAU; n.goal = { x: 3.4 + Math.sin(a) * 2.0, z: 7.6 + Math.cos(a) * 2.0, speed: 1.1, res: null }; });
      },
      end(S) { AK.ceil(S, true); },
      cam(S, k, t) {
        const u = AK.u(S, k, 0.5);
        AK.cam(S, t, [3.4 + 1.4 * Math.sin(0.5 + u), 6.2 - 2.2 * u, 7.6 + 8.0 * Math.cos(0.5 + u) - 3.0 * u], [3.4, 0.7, 7.6], 58 - 6 * u, { amp: 0.01 });
      } }
  ], 0.4);

  Trl.scene('a_incident', {
    mission: 4, seed: 41, acts,
    setup(S) {
      const r = S.r;
      AK.init(S); S.act = null;
      // как в игре: в этой миссии у игрока пустые руки
    },
    tick(S, t, dt) { AK.run(S, acts, t, dt); },
    cuts: AK.cuts(acts)
  });
})();
