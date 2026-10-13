// Сцена b_range — миссия 8 «PROFICIENCY TEST»: стрельбище, чёрные мишени, «белый жилет — не стрелять», штурм двери караулки.
// Всё снято по настоящему сценарию игры: игрок берёт Glock со стойки (миссия сама выпускает мишени), дальше — наши мини-сцены между нарезками.
(() => {
  const B = Trl.B, clamp = Trl.clamp, lerp = Trl.lerp, wrap = Trl.wrap;
  const LOG = (window.__bh = window.__bh || []);
  const ev = (id, name, lt) => LOG.push([id, name, +lt.toFixed(3)]);

  // ------------------------------------------------------------------ помощники (локальные)
  const lin2 = (k) => k + 0.25 * k * (1 - k);                       // ход с начальной скоростью (первый кадр уже в движении)
  const leaveFree = (S) => { const r = S.r; if (r.camFree) { r.camFree = null; r.prevYaw = undefined; r.blurX = 0; r.blurY = 0; } };
  const place = (S, x, z, yaw, pitch) => {
    const r = S.r, p = r.p, f = Trl.fpState;
    p.x = x; p.z = z; p.yaw = yaw; p.pitch = pitch || 0; f.yv = 0; f.pv = 0; f.mx = 0; f.mz = 0;
    S.fp.stop(); r.prevYaw = undefined; r.aimWant = false; r.timeScale = 1;
  };
  const refill = (S) => { const w = S.r.wp; if (w) { w.mag = w.def.mag; w.reserve = Math.max(w.reserve, w.def.mag * 3); } };
  // чистая линия огня до врага: от глаз игрока до точки цели ближе всего стоит именно он
  const clear = (S, e, ty) => {
    const r = S.r, p = r.p, ox = p.x, oy = 1.35, oz = p.z, dx = e.x - ox, dy = ty - oy, dz = e.z - oz, l = Math.hypot(dx, dy, dz);
    const h = r.castRay(ox, oy, oz, dx / l, dy / l, dz / l, l + 1);
    return h.kind === 'obj' && h.obj === e;
  };
  // навестись и выстрелить: o {head, y, tau, vmax, tol, lead, ads}
  const aim = (S, dt, e, o) => {
    o = o || {};
    const r = S.r, p = r.p, sc = e.t.scale || 1, ty = (o.y !== undefined ? o.y : (o.head ? 1.58 : 1.15)) * sc;
    const lead = o.lead || 0, ex = e.x + (e.vx || 0) * lead, ez = e.z + (e.vz || 0) * lead;
    S.fp.lookAt(ex, ty, ez, dt, o.tau || 0.2, o.vmax || 4);
    r.aimWant = o.ads !== false;
    const ey = Math.abs(wrap(S.yawTo(p.x, p.z, ex, ez) - p.yaw)), ep = Math.abs(S.pitchTo(p.x, 1.35, p.z, ex, ty, ez) - p.pitch), tol = o.tol || 0.025;
    if (o.fire !== false && ey < tol && ep < tol * 1.4 && r.fireCd <= 0 && r.aimK > (o.ads === false ? -1 : 0.5)) return r.tryFire();
    return false;
  };
  const near = (S, x, z, type, friendly, rad) => {
    let best = null, bd = rad || 0.8;
    for (const e of S.r.cb.enemies) { if (e.dead || e.type !== type || !!e.friendly !== !!friendly) continue; const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; best = e; } }
    return best;
  };
  const drop = (S, e) => { const r = S.r; if (!e) return; e.dead = true; e.alive = false; e.n.free = true; e.n.g.visible = false; if (e.n.laser) e.n.laser.visible = false; let i = r.cb.enemies.indexOf(e); if (i >= 0) r.cb.enemies.splice(i, 1); i = r.cb.shoot.indexOf(e); if (i >= 0) r.cb.shoot.splice(i, 1); };
  const spawnMoving = (S, x, z, vx, friend) => {
    const r = S.r, e = r.enemy(friend ? 'grunt' : 'target', x, z, { drop: false, friendly: friend, yaw: vx > 0 ? Math.PI / 2 : -Math.PI / 2, ai: null, exact: true, pers: false });
    e.vx = vx; e.mine = true;
    e.ai = (q, dt) => { const g = q.n.g; if (q.dead) return true; g.position.x += q.vx * dt; if (Math.abs(g.position.x) > 9.5) q.vx = -q.vx; q.n.yaw = q.vx > 0 ? Math.PI / 2 : -Math.PI / 2; q.n.creeping = true; return true; };
    return e;
  };
  const sh = (S, t, a, seed) => S.hand(t, a, seed);
  const look = (S, p, l, fov, roll) => S.camFree(p[0], p[1], p[2], l[0], l[1], l[2], fov, roll || 0);

  // ------------------------------------------------------------------ сценарий (мини-сцены между нарезками)
  const SEQ = [];
  const cut = (id, o) => { o.id = id; o.dur = o.beats * B; o.lead = o.lead === undefined ? 0.8 : o.lead; SEQ.push(o); return o; };

  // 1. FP: бежим к стойке, берём Glock — миссия выпускает мишени — первые выстрелы
  cut('fp_pickup', {
    t0: 0.0, beats: 6, mode: 'fp', lead: 0,
    prep(S) { place(S, 0, 17.0, 0, -0.05); },
    tick(S, lt, dt) {
      const r = S.r, ST = S._b;
      if (!r.inv.length) { S.fp.walkTo(0, 13.3, true); S.fp.look(0, -0.1, dt, 0.25, 3); return; }
      if (ST.pk === undefined) { ST.pk = lt; ev('fp_pickup', 'pickup', lt); }
      S.fp.walkTo(0, 11.2, false);
      const order = [[-3, -9], [3, -6]];
      let e = null;
      for (const q of order) { const c = near(S, q[0], q[1], 'target', false, 0.8); if (c && !c.dead && clear(S, c, 1.58)) { e = c; break; } }
      if (e && lt - ST.pk > 0.35) { if (aim(S, dt, e, { head: true, tau: 0.17, tol: 0.012 })) ST.shots = (ST.shots || 0) + 1; }
      else S.fp.look(0, 0, dt, 0.3, 2);
      if (e && e.dead && !ST['k' + e.z]) { ST['k' + e.z] = 1; ev('fp_pickup', 'kill', lt); }
    }
  });

  // 2. FP: серия точных выстрелов по чёрным мишеням (Glock, прицел)
  cut('fp_static', {
    t0: 4.4, beats: 6, mode: 'fp', lead: 1.0,
    prep(S) { place(S, -2.5, 10.8, 0.0, 0); refill(S); S._b.eng = { list: [[-8, -4], [8, -12], [-6, -17], [0, -20], [6, -25]], i: 0, wait: 0 }; },
    tick(S, lt, dt) {
      const r = S.r, E = S._b.eng;
      S.fp.walkTo(-2.0, 8.6, false);
      let e = E.cur;
      if (e && e.dead) { E.cur = e = null; E.wait = 0.28; ev('fp_static', 'kill', lt); }
      if (E.wait > 0) E.wait -= dt;
      if (!e && E.wait <= 0) {
        while (E.i < E.list.length) { const q = E.list[E.i]; const c = near(S, q[0], q[1], 'target', false, 0.8); E.i += 1; if (c && !c.dead && clear(S, c, 1.15)) { E.cur = e = c; break; } }
      }
      if (e) { const d = Math.hypot(e.x - r.p.x, e.z - r.p.z); aim(S, dt, e, { head: d < 22, tau: 0.17, vmax: 4.2, tol: d < 22 ? 0.011 : 0.016 }); }
      else S.fp.look(0, 0, dt, 0.3, 2);
    }
  });

  // 3. Free: низкий героический ракурс — на линию огня несётся живой «ломовик», выстрел в голову, пулевое время
  cut('free_low', {
    t0: 7.9, beats: 4, mode: 'free', lead: 0.7, hit: 1.05,
    prep(S) {
      const r = S.r; place(S, 0.4, 9.0, 0, 0); r.timeScale = 1;
      const e = r.enemy('rusher', -1.0, -4.2, { yaw: 0, pers: 'zealot', drop: false, exact: true }); e.mine = true; S._b.rusher = e;
    },
    tick(S, lt, dt) {
      const r = S.r, e = S._b.rusher;
      if (!e) return;
      if (lt > 0.78 && lt < 1.65 && !e.dead) r.timeScale = 0.3;
      if (lt >= 1.05 && !e.dead) { r.damageEnemy(e, 999, true, { x: e.x, y: 1.6, z: e.z }); ev('free_low', 'kill', lt); }
      if (lt > 1.65) r.timeScale = 1;
    },
    cam(S, k, t) {
      const e = S._b.rusher, u = lin2(k), h = sh(S, t, 0.012, 1);
      const px = lerp(-2.4, 0.3, u) + h[0], py = lerp(0.4, 0.9, u) + h[1], pz = lerp(10.9, 8.2, u);
      const tx = e ? e.x : 0, tz = e ? e.z : -6;
      look(S, [px, py, pz], [lerp(0, tx, 0.85), 1.2, lerp(-6, tz, 0.85)], lerp(60, 78, k), lerp(0.05, -0.03, k));
    }
  });

  // 4. Free: облёт — чёрную мишень сбивают, а «белый жилет» рядом стоит и не тронут
  cut('free_vest', {
    t0: 11.0, beats: 4, mode: 'free', lead: 0.8, hit: 1.0,
    prep(S) {
      const r = S.r; place(S, 0.4, 11.2, 0, 0);
      const a = r.enemy('target', 2.4, -2.0, { drop: false, yaw: 0.6, pers: false, exact: true }); a.mine = true;
      const f = r.enemy('grunt', 0.5, -2.4, { drop: false, friendly: true, yaw: -0.4, ai: null, pers: false, exact: true }); f.mine = true; f.ai = () => true;
      S._b.tg = a; S._b.fr = f;
    },
    tick(S, lt, dt) {
      const r = S.r, a = S._b.tg;
      if (a && lt >= 1.0 && !a.dead) { r.damageEnemy(a, 999, true, { x: a.x, y: 1.6, z: a.z }); ev('free_vest', 'kill', lt); }
    },
    cam(S, k, t) {
      const u = lin2(k), h = sh(S, t, 0.01, 2), cx = 1.45, cz = -2.2, ang = lerp(2.5, 0.8, u), R = lerp(4.6, 3.2, u);
      look(S, [cx + Math.cos(ang) * R + h[0], lerp(0.9, 1.45, u) + h[1], cz + Math.sin(ang) * R], [cx, 1.35, cz], lerp(56, 66, k), lerp(-0.04, 0.03, k));
    }
  });

  // 5. FP: движущиеся мишени пролетают поперёк полигона, среди них «белый жилет»
  cut('fp_moving', {
    t0: 14.5, beats: 6, mode: 'fp', lead: 1.0,
    prep(S) {
      const r = S.r; place(S, 0, 9.8, 0, 0); refill(S);
      const ST = S._b; ST.mv = [spawnMoving(S, -9, -10, 2.3, false), spawnMoving(S, 9, -14, -2.9, false), spawnMoving(S, -9, -18, 2.0, true), spawnMoving(S, 9, -7, -2.0, false), spawnMoving(S, -9, -13, 2.6, false)];
      ST.mvK = 0;
    },
    tick(S, lt, dt) {
      const r = S.r, ST = S._b;
      S.fp.walkTo(0, 8.8, false);
      let best = null, bd = 1e9;
      for (const e of ST.mv) {
        if (e.dead || e.friendly) continue;
        if (!clear(S, e, 1.15)) continue;
        const d = Math.hypot(e.x - r.p.x, e.z - r.p.z), dy = Math.abs(wrap(S.yawTo(r.p.x, r.p.z, e.x, e.z) - r.p.yaw)), sc = d + dy * 7;
        if (sc < bd) { bd = sc; best = e; }
      }
      if (best) { if (aim(S, dt, best, { y: 1.05, lead: 0.22, tau: 0.16, vmax: 4.5, tol: 0.03 })) ev('fp_moving', 'shot', lt); }
      else S.fp.look(0, 0, dt, 0.3, 2);
      ST.mv.forEach((e) => { if (e.dead && !e.cnt) { e.cnt = 1; ev('fp_moving', 'kill', lt); } });
    }
  });

  // 6. FP: Калаш против вооружённых мишеней, «жилет» пересекает линию огня
  cut('fp_ak', {
    t0: 18.4, beats: 4, mode: 'fp', lead: 0.9,
    prep(S) {
      const r = S.r;
      S._b.mv.forEach((e) => drop(S, e));
      r.giveWeapon('ak', { equip: true }); refill(S); place(S, 0, 4.0, 0, 0);
      S._b.ak = [['grunt', -2.5, -13], ['grunt', 3, -14.5], ['grunt', 0.5, -20], ['rusher', -3, -22]].map((a) => { const e = r.enemy(a[0], a[1], a[2], { yaw: 0, drop: false, pers: a[0] === 'grunt' ? 'pro' : 'zealot', exact: true }); e.mine = true; return e; });
      const v = spawnMoving(S, -9, -3.5, 1.5, true); S._b.vest = v;
    },
    tick(S, lt, dt) {
      const r = S.r, ST = S._b;
      let best = null, bd = 1e9;
      for (const e of ST.ak) { if (e.dead) continue; const d = Math.hypot(e.x - r.p.x, e.z - r.p.z); if (d < bd && clear(S, e, 1.15)) { bd = d; best = e; } }
      if (best) { if (aim(S, dt, best, { y: 1.2, tau: 0.16, vmax: 4.5, tol: 0.045, ads: false })) ev('fp_ak', 'shot', lt); }
      else S.fp.look(0, 0, dt, 0.3, 2);
      ST.ak.forEach((e) => { if (e.dead && !e.cnt) { e.cnt = 1; ev('fp_ak', 'kill', lt); } });
    }
  });

  // 7. Free: кран вверх над полигоном (потолок убран только для этого кадра), строй вооружённых мишеней, бочка взрывается
  cut('free_crane', {
    t0: 22.6, beats: 6, mode: 'free', lead: 0.8, hit: 1.25, noCeil: true,
    prep(S) {
      const r = S.r; S._b.ak.forEach((e) => drop(S, e)); drop(S, S._b.vest);
      place(S, 0.0, 12.2, 0, 0);
      const bar = r.barrel(0.8, -6.5); S._b.bar = bar;
      S._b.cr = [['grunt', -2.0, -15.5], ['grunt', 3.2, -17], ['grunt', 0.4, -19.5], ['rusher', 1.8, -12.5]].map((a) => { const e = r.enemy(a[0], a[1], a[2], { yaw: 0, drop: false, pers: a[0] === 'grunt' ? 'pro' : 'zealot', exact: true }); e.mine = true; return e; });
    },
    tick(S, lt, dt) {
      const r = S.r, ST = S._b;
      if (lt >= 1.25 && ST.bar.alive) { ST.bar.damage(99); ev('free_crane', 'boom', lt); }
      if (lt >= 0.3 && !ST.cr[1].dead) r.damageEnemy(ST.cr[1], 999, true, { x: ST.cr[1].x, y: 1.6, z: ST.cr[1].z });
    },
    cam(S, k, t) {
      const u = lin2(k), h = sh(S, t, 0.02, 3);
      look(S, [lerp(-3.4, -2.2, u) + h[0], lerp(1.4, 8.4, S.smooth(k)) + h[1], lerp(14.2, 19.2, u)], [0.6, lerp(0.9, -0.2, k), lerp(-8, -11, k)], lerp(60, 52, k), lerp(0.06, -0.04, k));
    }
  });

  // 8. FP: штурм двери караулки — разбег, удар ногой, дверь влетает внутрь (настоящая катсцена игры от первого лица)
  cut('fp_breach', {
    t0: 27.0, beats: 8, mode: 'fp', lead: 0.6, hit: 2.56,
    prep(S) {
      const r = S.r; S._b.cr.forEach((e) => drop(S, e));
      r.timeScale = 1; r.clearWeapons(); r.giveWeapon('glock', { equip: true }); refill(S);
      place(S, -6.1, -13.82, Math.PI / 2, 0);
    },
    tick(S, lt, dt) {
      const r = S.r, ST = S._b;
      if (lt >= 0 && !ST.br) { ST.br = 1; const room = r.int.rooms[0]; r.breach(room, { variant: 'A' }); ev('fp_breach', 'start', lt); }
    }
  });

  // ------------------------------------------------------------------ сцена
  const cuts = {};
  SEQ.forEach((c) => { cuts[c.id] = { t0: c.t0, dur: c.dur, cam: c.cam || ((S) => { S.camFP(); }) }; });
  Trl.scene('b_range', {
    mission: 8, seed: 8,
    setup(S) {
      const r = S.r, ST = S._b = {}, H = r.bounds.h;
      r.killCamAt = 1e15; r.alarmCamAt = 1e15;   // вставные катсцены игры (добивание последнего врага) отключены на время съёмки: камеру ведёт оператор
      ST.ceil = r.scene.children.filter((c) => c.isMesh && Math.abs(c.position.y - (H + 0.05)) < 0.02 && Math.abs(c.scale.y - 0.1) < 0.01);
      SEQ.forEach((c) => { c._prep = false; });
    },
    tick(S, t, dt) {
      const r = S.r, ST = S._b;
      if (r.beacons) Object.keys(r.beacons).forEach((k) => { r.beacons[k].visible = false; });
      if (window.__bhDbg && Math.round(t * 60) % 30 === 0) LOG.push(['dbg', +t.toFixed(1), +r.p.x.toFixed(2), +r.p.z.toFixed(2), +r.p.yaw.toFixed(2), 'ts', r.timeScale, 'free', !!r.camFree, 'lock', !!r.locked, 'cin', r.inCinema, r.cineDepth, 'en', r.cb.enemies.filter((e) => !e.dead).length, 'ph', r.phaseName, 'mt', +r.time.toFixed(1)]);
      let noCeil = false;
      for (const c of SEQ) {
        if (c.noCeil && t > c.t0 - 0.2 && t < c.t0 + c.dur + 0.3) noCeil = true;
        if (t < c.t0 - c.lead || t >= c.t0 + c.dur + 0.3) continue;
        if (!c._prep) { c._prep = true; if (c.mode === 'fp') leaveFree(S); c.prep && c.prep(S); }
        c.tick && c.tick(S, t - c.t0, dt);
      }
      ST.ceil.forEach((m) => { m.visible = !noCeil; });
    },
    cuts
  });
})();
