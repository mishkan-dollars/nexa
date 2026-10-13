// a_breakout_free: побег из блока содержания (миссия 7), свободная камера (инструмент съёмки): кран над залом без потолка, дверь-плита,
// погоня переборки, взрыв бочки на безопасной дистанции, силуэт в пустом коридоре. «Игрока» в кадре изображает пассивный силуэт-мишень с пистолетом.
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

  const nearest = (S, x, z) => AK.nearest(S, x, z);
  const hidePlayer = (S, x, z) => { const p = S.r.p; p.x = x; p.z = z; p.moving = 0; };
  const barrelAt = (S, x, z) => S.r.cb.shoot.find((s) => s.barrel && s.alive && Math.hypot(s.x - x, s.z - z) < 0.3);

  const acts = AK.plan([
    // 1. кран над залом: потолка нет, охрана лезёт в дверь, герой за колонной снимает их по одному
    { id: 'crane_hall', beats: 8, pre: 0.9,
      start(S) {
        const r = S.r; AK.purge(S); r.openNow(r.d1); AK.ceil(S, false);
        S.A.h = AK.hero(S, 0.9, 21.0, Math.PI);
        AK.en(S, 'grunt', -1.2, 5.0, { yaw: 0, pers: 'pro' }); AK.en(S, 'grunt', 1.4, 2.6, { yaw: 0, pers: 'pro' }); AK.en(S, 'rusher', 0.0, 0.0, { yaw: 0, pers: 'zealot' });
        hidePlayer(S, 0.9, 21.0); this.cam(S, 0, 0);
      },
      tick(S, t, dt, A) {
        const r = S.r; hidePlayer(S, A.h.x, A.h.z);
        const kills = [1.35, 1.9, 2.55, 3.1];
        while (A.n === undefined || (A.n < kills.length && t >= kills[A.n])) {
          A.n = (A.n || 0);
          if (t < kills[A.n]) break;
          const e = nearest(S, A.h.x, A.h.z); if (e) { AK.shoot(S, A.h, e, A.n !== 1, 80); AK.log(S, 'hero-shot', e.type); }
          A.n += 1;
        }
        if (t > 2.4 && t < 3.0) r.timeScale = 0.35; else r.timeScale = 1;
      },
      cam(S, k, t) {
        const u = AK.u(S, k, 0.55);
        AK.cam(S, t, [-2.4 - 5.6 * u, 1.35 + 10.4 * u, 25.2 + 6.3 * u], [0.0 + 0.6 * u, 1.3 - 1.0 * u, 12.5 + 2.0 * u], 66 - 12 * u, { roll: 0.02 * (1 - u) });
      } },
    // 2. дверь-плита поднимается, за ней в коридоре стоит силуэт против света
    { id: 'door_rise', beats: 6, pre: 0.2,
      start(S) {
        const r = S.r; AK.purge(S); AK.ceil(S, true); r.openNow(r.d1); r.openNow(r.d2); r.closeDoor(r.d3);
        const e = r.enemy('target', 0.2, -37.5, { yaw: 0, exact: true, drop: false, gun: null }); e.hp = 1e9; e.purge = true; S.A.e = e;
        hidePlayer(S, 0, 30); this.cam(S, 0, 0);
      },
      tick(S, t, dt, A) { if (!A.o && t >= 0.2) { A.o = true; S.r.openDoor(S.r.d3, 1.5); } hidePlayer(S, 0, 30); },
      cam(S, k, t) {
        const u = AK.u(S, k, 0.4);
        AK.cam(S, t, [1.7 - 0.5 * u, 0.5 + 0.55 * u, -22.5 - 5.3 * u], [-0.1, 1.55 - 0.1 * u, -34.5 - 2 * u], 63 + 8 * u, { amp: 0.008 });
      } },
    // 3. погоня переборки: герой бежит по коридору, за ним ползёт полосатая стена; камера идёт впереди и смотрит назад
    { id: 'bulkhead_chase', beats: 6, pre: 0.7,
      start(S) {
        const r = S.r; AK.purge(S); AK.ceil(S, true); r.openNow(r.d3);
        S.A.h = AK.hero(S, 0.0, -33.0, Math.PI, null);
        S.A.b = r.bulkhead(-28.3, -3.4, 3.4, 4.65);
        hidePlayer(S, 0, -88); this.cam(S, 0, 0);
      },
      tick(S, t, dt, A) { hidePlayer(S, 0, -88); AK.go(A.h, 0.0, -90, 4.7); },
      end(S) { S.A.b && S.A.b.stop(); },
      cam(S, k, t) {
        const h = S.A.h, u = AK.u(S, k, 0.4);
        AK.cam(S, t, [2.3 - 4.0 * u, 2.3 - 0.8 * u, h.z - 4.4 - 1.2 * u], [h.x * 0.5, 0.95, h.z + 1.8], 70 - 8 * u, { amp: 0.014 });
      } },
    // 4. бочка: герой стреляет, охрана рядом с ней взлетает; камера далеко, после взрыва несколько долей на дым
    { id: 'barrel_blast', beats: 6, pre: 0.9,
      start(S) {
        const r = S.r; AK.purge(S); AK.ceil(S, true); r.openNow(r.d2); r.openNow(r.d3);
        S.A.h = AK.hero(S, 3.4, 7.0, Math.PI); S.A.h.n.armT = 1; AK.face(S.A.h, -5.2, -10);
        [[-3.5, -8.4], [-4.0, -11.6], [-2.7, -10.0]].forEach((q, i) => AK.en(S, 'grunt', q[0], q[1], { yaw: 0.6 + i, pers: 'lazy' }));
        hidePlayer(S, 3.4, 7.0); this.cam(S, 0, 0);
      },
      tick(S, t, dt, A) {
        const r = S.r; hidePlayer(S, 3.4, 7.0);
        if (!A.s && t >= 1.45) {
          A.s = true; const b = barrelAt(S, -5.2, -10);
          if (b) {
            const T = THREE, h = A.h, dx = -5.2 - h.x, dy = 0.6 - 1.35, dz = -10 - h.z, l = Math.hypot(dx, dy, dz);
            h.muz = 0.06; h.n.kick = 1;
            r.tracerFrom(r.rg, r.wp, { t: l }, dx / l, dy / l, dz / l, { x: h.x + dx / l * 0.5, y: 1.35, z: h.z + dz / l * 0.5 }, new T.Vector3(h.x + dx / l * 0.5, 1.35, h.z + dz / l * 0.5));
            AK.log(S, 'barrel');
            b.damage(99);
          }
        }
        r.timeScale = (t > 1.5 && t < 2.35) ? 0.28 : 1;
      },
      cam(S, k, t) {
        const u = AK.u(S, k, 0.5);
        AK.cam(S, t, [5.6 + 1.6 * u, 1.45 + 0.5 * u, 2.5 - 5.0 * u], [-4.6, 1.3, -10.2], 54 + 6 * u, { amp: 0.01 });
      } },
    // 5. пустой коридор: силуэт идёт на камеру из глубины, камера у пола едет ему навстречу
    { id: 'hero_corridor', beats: 6, pre: 0.2,
      start(S) {
        const r = S.r; AK.purge(S); AK.ceil(S, true); r.openNow(r.d3);
        S.A.h = AK.hero(S, 0.0, -90.3, 0.0, null);
        hidePlayer(S, 0, -88); this.cam(S, 0, 0);
      },
      tick(S, t, dt, A) { hidePlayer(S, 0, -60); AK.go(A.h, 0.0, -50, 3.0); },
      cam(S, k, t) {
        const u = AK.u(S, k, 0.55);
        AK.cam(S, t, [0.25 - 0.3 * u, 0.3 - 0.05 * u, -61.5 - 11.0 * u], [0.0, 1.4 + 0.5 * u, -90.0], 62 - 14 * u, { amp: 0.008, roll: 0.01 });
      } }
  ], 0.4);

  Trl.scene('a_breakout_free', {
    mission: 7, seed: 21, acts,
    setup(S) {
      const r = S.r;
      AK.init(S); S.act = null;
      r.giveWeapon('glock', { equip: true });
      r.openNow(r.d1); r.openNow(r.d2); r.openNow(r.d3);
    },
    tick(S, t, dt) { AK.run(S, acts, t, dt); },
    cuts: AK.cuts(acts)
  });
})();
