// a_process: «Неизвестный процесс» (миссия 5) — сервер 4, зал колонн. Силуэт двигается, только пока на него не смотрят.
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
      S.ceil = S.ceil.concat(r.scene.children.filter((m) => m.isMesh && m.material === r.lampMat));   // светильники висят на потолке: без него они парят в воздухе
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

  // убрать хук игры «процесс ползёт к игроку» (в свободной камере им управляет сцена)
  const dropCreep = (S) => { const r = S.r; for (let i = r.hooks.length - 1; i >= 0; i -= 1) if (/PROCESS DISTANCE/.test(String(r.hooks[i]))) r.hooks.splice(i, 1); };

  const acts = AK.plan([
    // 1. FP: идём между колоннами к светящемуся терминалу, отвернувшись; процесс ползёт; на секунду оглядываемся — он замер ближе
    { id: 'creep_walk', beats: 8, pre: 0.4,
      start(S) {
        const r = S.r; AK.fpStart(S, -8.4, 7.4, -0.55); r.setAmbient(0.34); r.placeNpc(r.s, 4.0, 8.2); r.s.creeping = false; r.s.yaw = 0;
        S.A.p = [[-5.5, 4.0], [-2.0, 1.2], [1.0, -1.5]];
      },
      tick(S, t, dt, A) {
        const r = S.r;
        if (t < 2.1) { S.fp.walkPath('w', A.p, false); S.fp.lookAt(8.5, 1.3, -8.5, dt, 0.5, 1.5); }
        else if (t < 3.3) { S.fp.stop(); S.fp.lookAt(r.s.g.position.x, 1.35, r.s.g.position.z, dt, 0.28, 3.2); }
        else { S.fp.walkPath('w', A.p, false); S.fp.lookAt(8.5, 1.3, -8.5, dt, 0.5, 1.8); }
      },
      cam(S) { AK.ensureFP(S); } },
    // 2. колонны, силуэт между ними: низкий проезд навстречу; он замирает, когда камера смотрит на него, и сдвигается между кадрами
    { id: 'pillar_stalk', beats: 6, pre: 0.3,
      start(S) {
        const r = S.r; AK.purge(S); dropCreep(S); r.setAmbient(0.34); r.p.x = -9; r.p.z = 9; r.p.moving = 0; r.placeNpc(r.s, 2.5, -3.0); r.faceNow(r.s, -3, 6); r.s.creeping = false; this.cam(S, 0, 0);
      },
      tick(S, t, dt, A) { const r = S.r; r.p.x = -9; r.p.z = 9; r.p.moving = 0; const g = r.s.g.position; const d = Math.hypot(-3 - g.x, 6 - g.z); if (d > 0.3) { g.x += (-3 - g.x) / d * 0.75 * dt; g.z += (6 - g.z) / d * 0.75 * dt; r.s.creeping = true; } },
      cam(S, k, t) {
        const u = AK.u(S, k, 0.55);
        AK.cam(S, t, [-8.5 + 4.2 * u, 0.9 + 0.1 * u, 8.5 - 1.5 * u], [2.0 - 0.8 * u, 1.35, -2.0 + 0.8 * u], 60 - 6 * u, { amp: 0.01 });
      } },
    // 3. терминал: герой подходит к светящемуся блоку, процесс стоит позади в тени; камера у пола, подъём
    { id: 'terminal_reveal', beats: 6, pre: 0.3,
      start(S) {
        const r = S.r; AK.purge(S); dropCreep(S); r.setAmbient(0.34); r.p.x = -9; r.p.z = 9; r.p.moving = 0;
        S.A.h = AK.hero(S, 5.8, -4.8, 0.4 * Math.PI * 0 + Math.PI * 1.25, null);
        r.placeNpc(r.s, 3.0, 2.0); r.faceNow(r.s, 8, -9); r.s.creeping = false; this.cam(S, 0, 0);
      },
      tick(S, t, dt, A) { S.r.p.x = -9; S.r.p.z = 9; S.r.p.moving = 0; AK.go(A.h, 8.2, -8.0, 1.6); },
      cam(S, k, t) {
        const u = AK.u(S, k, 0.5);
        AK.cam(S, t, [3.8 + 0.8 * u, 0.3 + 1.1 * u, -2.2 - 2.4 * u], [8.6, 1.05 + 0.2 * u, -8.6], 62 - 8 * u, { amp: 0.008, roll: 0.02 * (1 - u) });
      } }
  ], 0.4);

  Trl.scene('a_process', {
    mission: 5, seed: 51, acts,
    setup(S) { AK.init(S); S.act = null; },
    tick(S, t, dt) { AK.run(S, acts, t, dt); },
    cuts: AK.cuts(acts)
  });
})();
