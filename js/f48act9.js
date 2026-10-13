// NEXA: миссия 48 — акт 9: ЗАРЯДЫ. После развязки с человеком в маске: три этажа (кабинет → хранилище → главный зал), на каждом нужно
// поставить ДВА огромных заряда (E + удержание рядом). Первый заряд поднимает тревогу — охрана валит волной, союзники прикрывают огнём.
// Этаж закрыт, когда оба заряда стоят и волна снята. Дальше — чёрный экран и PH.exit. Весь текст — английский.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.PH || !C.f48.PH.exit || !C.f48.K || !C.f48.K.allyFire || !C.f48.K.suitMode || !C.f48.Mk || !C.f48.npcMinigun) return;
  const F = C.f48, K = F.K, PH = F.PH, PI = Math.PI;
  const DIC = 'DICTOR';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const put = (n, x, z, yaw) => { n.g.position.set(x, 0, z); n.yaw = yaw || 0; n.g.rotation.y = n.yaw; n.goal = null; K.ally.stop(n); };

  // ------------------------------------------------------------------ этажи: где ставить, откуда лезет охрана, сколько
  // sites: [x, z, yaw] — заряд лицом (+Z модели) к центру прохода; face — куда смотрит заряд
  const FLOORS = [
    {
      key: 'head', big: 'FLOOR 3', small: 'DIRECTOR\'S OFFICE', at: [0, 12.6, 0], amb: 'head', lim: 14, cap: 7, heavy: 0.1, rush: 0.2, minD: 8,
      sites: [[-9.0, -0.5, PI / 2], [9.0, -0.5, -PI / 2]], team: [[-1.7, 13.9], [1.7, 14.1]],
      pts: () => [[-1.2, 12.4], [0, 12.55], [1.2, 12.4]],
      say: ['Floor three. One charge each side of the desk.', 'Armed. That tripped the alarm. Here they come!', 'Both set. Down to the vault level.']
    },
    {
      key: 'vault', big: 'FLOOR 2', small: 'VAULT LEVEL', at: [0, 21, 0], amb: 'vault', lim: 20, cap: 9, heavy: 0.18, rush: 0.24, minD: 11,
      sites: [[-4.4, 7.8, PI / 2], [4.4, -13.8, -PI / 2]], team: [[-2.0, 22.4], [2.0, 22.8]],
      pts: () => { const o = []; [-24.6, -13.8, -3.0, 7.8, 18.6].forEach((z) => { [-16.5, 16.5, -29.5, 29.5].forEach((x) => o.push([x, z])); }); return o; },
      say: ['The vault level. Charges on the pillars. They carry the whole floor.', 'Armed. Guards are pouring out of the vault rooms!', 'Both set. One floor left. The main hall.']
    },
    {
      key: 'hall', big: 'FLOOR 1', small: 'MAIN HALL', at: [0, 12.4, 0], amb: 'hall', lim: 28, cap: 11, heavy: 0.22, rush: 0.26, minD: 13,
      sites: [[-11.2, -22.0, PI / 2], [11.2, -4.0, -PI / 2]], team: [[-2.0, 13.8], [2.0, 14.2]],
      pts: (B) => { const s = B.R.spawns; return s ? [].concat(s.north || [], s.south || [], s.rooms || []) : [[-20, -30], [20, -30], [-20, 18], [20, 18]]; },
      say: ['The main hall. Two on the columns. Then we walk out the front door.', 'Armed. The whole building is coming. Hold the line!', 'Six charges. Everyone out. Now.']
    }
  ];

  // ------------------------------------------------------------------ звук
  function beep(r, f, d, g) {
    const s = r.snd, c = s && s.ctx; if (!c || !s.tone) return;
    s.tone({ t: c.currentTime + 0.003, type: 'square', f0: f, dur: d || 0.09, g: g || 0.09, a: 0.002, lp: 3600 });
  }
  function clunk(r) {
    const s = r.snd, c = s && s.ctx; if (!c || !s.tone || !s.noise) return;
    const t = c.currentTime + 0.002;
    s.tone({ t, type: 'sine', f0: 140, f1: 52, dur: 0.22, g: 0.3, a: 0.002 });
    s.noise({ t, type: 'lowpass', f0: 1800, f1: 300, dur: 0.18, g: 0.2, a: 0.002 });
    s.tone({ t: t + 0.04, type: 'triangle', f0: 880, f1: 600, dur: 0.12, g: 0.07, a: 0.001 });
  }

  // ------------------------------------------------------------------ модель заряда: стальные салазки, три баллона со взрывчаткой, брикеты, блок подрыва с дисплеем
  function mkCharge(withDisplay) {
    const M = new F.Mk();
    const OL = 0x4b5433, YE = 0xd2ac1c, BR = 0xd9d2bb, DK = 0x1b1c20, ST = 0x2a2c31;
    M.b(2.1, 0.08, 1.9, 0, 0.04, 0, ST);                                                      // салазки
    for (const sx of [-0.92, 0.92]) M.b(0.1, 0.12, 1.9, sx, 0.12, 0, 0x34373d);
    M.b(2.0, 0.05, 0.1, 0, 0.1, -0.6, 0x3a3d44); M.b(2.0, 0.05, 0.1, 0, 0.1, 0.6, 0x3a3d44);
    const can = (z, y) => {
      M.x(0.3, 1.74, 0, y, z, OL, 16);
      for (const bx of [-0.62, 0.62]) M.x(0.309, 0.1, bx, y, z, YE, 16);                    // жёлтые бандажи
      for (const sx of [-1, 1]) { M.x(0.21, 0.08, sx * 0.9, y, z, DK, 12); M.x(0.09, 0.07, sx * 0.97, y, z, 0x8d9097, 8); }
    };
    can(-0.31, 0.45); can(0.31, 0.45); can(0, 0.987);
    for (const bx of [-0.62, 0.62]) M.tor(0.668, 0.022, bx, 0.63, 0, 0x7d8088, 0, PI / 2, 0, 24);   // стальные хомуты
    for (const bx of [-0.62, 0.62]) M.b(0.1, 0.1, 0.08, bx, 1.29, 0, 0x8d9097);                    // замки хомутов
    M.pl(0.7, 0.2, 0.02, 0.45, 0.616, 0xcfc9b4, 0, 0, 0);                                      // трафарет на баллоне
    // брикеты пластита по бокам блока подрыва
    for (const sx of [-0.66, 0.66]) {
      for (let i = 0; i < 3; i += 1) {
        M.b(0.4, 0.17, 0.3, sx, 0.17 + i * 0.18, 0.82, i % 2 ? BR : 0xcdc6b0);
        M.b(0.06, 0.18, 0.31, sx, 0.17 + i * 0.18, 0.82, 0x3a4228);
      }
    }
    // блок подрыва
    M.b(0.92, 0.52, 0.24, 0, 0.42, 0.82, 0x20232a); M.b(0.96, 0.05, 0.28, 0, 0.7, 0.82, 0x3a3d44); M.b(0.96, 0.05, 0.28, 0, 0.16, 0.82, 0x3a3d44);
    M.b(0.03, 0.6, 0.03, 0.38, 1.02, 0.82, DK);                                                   // антенна
    // жгут проводов от блока к верхнему баллону
    M.b(0.03, 0.55, 0.03, -0.3, 0.98, 0.7, 0xd02a1a, 0.4, 0, 0); M.b(0.03, 0.55, 0.03, -0.24, 0.98, 0.72, 0x2a4fd0, 0.4, 0, 0); M.b(0.03, 0.55, 0.03, -0.18, 0.98, 0.7, 0xd8b020, 0.4, 0, 0);
    M.glow((q) => { q.b(0.07, 0.07, 0.03, -0.36, 0.3, 0.95, 0xff2a1a); q.b(0.07, 0.07, 0.03, 0.36, 0.3, 0.95, 0xffa020); q.b(0.06, 0.06, 0.06, 0.38, 1.34, 0.82, 0xff2a1a); });
    const grp = M.build({ cull: false });
    if (withDisplay) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
      const cx = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv);
      let last = '';
      grp.setText = (a, b, on) => {
        const key = a + '|' + b + '|' + on; if (key === last) return; last = key;
        cx.fillStyle = '#0b0404'; cx.fillRect(0, 0, 256, 96);
        cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.fillStyle = on ? '#ff3020' : '#7a1a10'; cx.font = 'bold 50px monospace'; cx.fillText(a, 128, 36);
        cx.fillStyle = '#c8a020'; cx.font = 'bold 22px monospace'; cx.fillText(b, 128, 74);
        tex.needsUpdate = true;
      };
      grp.setText('--', 'NO LINK', false);
      const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.27), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
      disp.position.set(0, 0.44, 0.945); grp.add(disp);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false }));
      led.position.set(0.38, 1.34, 0.82); grp.add(led); grp.led = led;
    }
    return grp;
  }
  const ghostify = (g) => {
    const gm = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.3, depthWrite: false, wireframe: true });
    if (g.solid) g.solid.material = gm;
    if (g.glowMesh) g.glowMesh.material = gm;
    g.ghostMat = gm; return g;
  };

  // ------------------------------------------------------------------ состояние этажа: точки, модели, свет, режиссёр охраны
  function makeFloor(r, W, f, team) {
    const R = W.R[f.key], T = THREE;
    const B = {
      r, W, f, R, team, sites: [], planted: 0, spawned: 0, lim: 0, cap: 0, wave: false, t: 0, sT: 0, alT: 0, offs: [], allies: [], dead: false, reset: null
    };
    const mq = r.q.maxEnemies;
    const sc = mq <= 6 ? 0.6 : mq <= 9 ? 0.8 : 1;
    B.lim = Math.max(6, Math.round(f.lim * sc));
    B.cap = Math.max(4, Math.min(f.cap, mq));
    const root = new T.Group(); r.scene.add(root); B.root = root;
    f.sites.forEach((s, i) => {
      const site = { i, x: s[0], z: s[1], yaw: s[2], done: false, k: 0 };
      const ok = (x, z) => !r.blocked(x, z);
      if (!ok(site.x, site.z)) {                                           // страховка: сместить точку на свободное место
        const q = K.ally.nearFree(r, site.x, site.z, 0.9, 4); if (q) { site.x = q[0]; site.z = q[1]; }
      }
      site.bomb = mkCharge(true); site.bomb.position.set(site.x, 0, site.z); site.bomb.rotation.y = site.yaw; site.bomb.visible = false; root.add(site.bomb);
      site.ghost = ghostify(mkCharge(false)); site.ghost.position.set(site.x, 0, site.z); site.ghost.rotation.y = site.yaw; root.add(site.ghost);
      const ring = new T.Mesh(new T.RingGeometry(1.05, 1.22, 40), new T.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.5, depthWrite: false, side: T.DoubleSide, fog: false }));
      ring.rotation.x = -PI / 2; ring.position.set(site.x, 0.03, site.z); root.add(ring); site.ring = ring;
      site.col = { x0: site.x - (Math.abs(Math.sin(site.yaw)) > 0.5 ? 0.95 : 1.05), x1: site.x + (Math.abs(Math.sin(site.yaw)) > 0.5 ? 0.95 : 1.05), z0: site.z - (Math.abs(Math.sin(site.yaw)) > 0.5 ? 1.05 : 0.95), z1: site.z + (Math.abs(Math.sin(site.yaw)) > 0.5 ? 1.05 : 0.95), y0: 0, y1: 1.35, off: true };
      if (R && R.cols) R.cols.push(site.col);
      site.light = new T.PointLight(0xff2a1a, 0, 7, 1.8); site.light.position.set(site.x, 1.5, site.z); root.add(site.light);   // сразу на сцене: шейдеры не перекомпилируются при установке
      B.sites.push(site);
    });
    const paint = (s, on) => {
      s.bomb.setText && s.bomb.setText(s.done ? 'ARMED' : '--', s.done ? 'REMOTE LINK' : 'NO LINK', on);
    };
    B.paint = paint;
    B.unplantAll = () => {
      B.planted = 0;
      B.sites.forEach((s) => { s.done = false; s.k = 0; s.bomb.visible = false; s.ghost.visible = true; s.ring.visible = true; s.light.intensity = 0; s.col.off = true; paint(s, false); });
    };
    B.plantAll = () => {                                                   // «пропуск сектора»: оба заряда уже стоят
      B.planted = B.sites.length;
      B.sites.forEach((s) => { s.done = true; s.k = 1; s.bomb.visible = true; s.ghost.visible = false; s.ring.visible = false; s.col.off = false; paint(s, true); });
    };
    B.dispose = () => {
      B.dead = true; B.offs.forEach((o) => { try { o(); } catch (e) { /* уже снят */ } }); B.offs = [];
      B.allies.forEach((a) => { a.n.armT = 0; if (a.n.flashM) a.n.flashM.visible = false; });
      B.sites.forEach((s) => { const i = R && R.cols ? R.cols.indexOf(s.col) : -1; if (i >= 0) R.cols.splice(i, 1); });
      try { r.scene.remove(root); } catch (e) { /* убран */ }
      root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    };
    return B;
  }

  function spawnOne(B) {
    const r = B.r, p = r.p, f = B.f, pool = f.pts(B);
    if (!pool.length) return null;
    for (let t = 0; t < 10; t += 1) {
      const q = pool[(Math.random() * pool.length) | 0];
      const x = q[0] + rnd(-0.6, 0.6), z = q[1] + rnd(-0.6, 0.6);
      if (Math.hypot(x - p.x, z - p.z) < f.minD || r.blockedE(x, z)) continue;
      if (t < 6 && r.hasLOS(x, 1.5, z, p.x, 1.6, p.z)) continue;             // сначала точки, где игрок не видит появления
      const roll = Math.random();
      const type = roll < f.heavy ? 'heavy' : roll < f.heavy + f.rush ? 'rusher' : 'grunt';
      const e = r.enemy(type, x, z, { drop: false, yaw: Math.atan2(p.x - x, p.z - z), speed: rnd(0.95, 1.2), hp: type === 'heavy' ? 2.2 : 1.7 });   // живучие: стрелять приходится долго
      e.tag = 'bombguard'; B.spawned += 1;
      return e;
    }
    return null;
  }

  // игрок оказался внутри коллайдера заряда (blocked() проверяет только новую точку: изнутри не выйти ни одним шагом) — выталкиваем наружу
  function pushOut(r, B) {
    const p = r.p;
    if (!r.blocked(p.x, p.z)) return false;
    let best = null, bd = 1e9;
    B.sites.forEach((s) => { if (s.done) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; best = s; } } });
    if (!best) return false;
    let dx = p.x - best.x, dz = p.z - best.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    for (let d = Math.min(l, 0.6); d < 5; d += 0.1) {
      for (const a of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4, PI]) {
        const c = Math.cos(a), sn = Math.sin(a), x = best.x + (dx * c - dz * sn) * d, z = best.z + (dx * sn + dz * c) * d;
        if (!r.blocked(x, z)) { p.x = x; p.z = z; return true; }
      }
    }
    return false;
  }

  function tick(B, dt) {
    const r = B.r;
    if (B.dead || r.disposed) return;
    B.t += dt;
    if (!r.locked && !r.dead && r.cineDepth <= 0 && B.planted > 0) pushOut(r, B);
    const near = B.sites.filter((s) => !s.done);
    // подсветка: призраки и кольца мигают, установленные заряды тикают красным
    B.sites.forEach((s) => {
      if (!s.done) {
        const u = 0.5 + 0.5 * Math.sin(B.t * 3.2 + s.i * 1.7);
        s.ghost.ghostMat.opacity = 0.1 + 0.26 * u; s.ring.material.opacity = 0.25 + 0.4 * u; s.ring.scale.setScalar(1 + 0.05 * u);
      } else {
        const on = ((B.t * 2.4 + s.i * 0.37) % 1) < 0.5;
        if (s.bomb.led) s.bomb.led.visible = on;
        s.light.intensity = on ? 1.4 : 0.35;
        B.paint(s, on);
      }
    });
    if (near.length && B.t - (B.wpT || -9) > 0.25) {                         // метка — на ближайший ещё не поставленный заряд
      B.wpT = B.t;
      let best = near[0], bd = 1e9;
      near.forEach((s) => { const d = Math.hypot(s.x - r.p.x, s.z - r.p.z); if (d < bd) { bd = d; best = s; } });
      if (B.wpS !== best) { B.wpS = best; r.waypoint && r.waypoint([best.x, 1.6, best.z], 'CHARGE ' + (best.i + 1)); }
    } else if (!near.length && B.wpS) { B.wpS = null; r.waypoint && r.waypoint(null); }
    if (r.dead || r.locked) return;
    K.allyFire(B, dt);
    if (!B.wave) return;
    if (B.t - B.alT > 6.5) { B.alT = B.t; try { K.amb.pulse(r, 'alarm', 0.6); } catch (e) { /* без звука */ } }
    B.sT -= dt;
    if (B.sT <= 0 && B.spawned < B.lim && r.enemiesAlive() < B.cap) {
      const e = spawnOne(B);
      B.sT = e ? rnd(0.7, 1.5) : 0.5;
    }
  }

  // ------------------------------------------------------------------ один этаж: ставим два заряда, держим оборону
  async function floorRun(r, B, i) {
    const f = B.f, d = B.team.d, g = B.team.g;
    B.unplantAll(); B.wave = false; B.spawned = 0; B.t = 0; B.sT = 0; B.wpS = null; B.alT = 0;
    B.offs.forEach((o) => { try { o(); } catch (e) { /* уже снят */ } }); B.offs = [];
    r.redPulse && r.redPulse(false);
    await r.clearEnemies();
    K.unlock(r);
    B.offs.push(K.hook(r, (dt) => { try { tick(B, dt); } catch (e) { if (!B.err) { B.err = 1; console.error('[f48 bombs]', e); } } }));
    K.ally.follow(r, [d], { side: -1, back: 2.6 });
    K.ally.follow(r, [g], { side: 1, back: 3.2 });
    r.objective('PLANT THE CHARGES  0 / 2');
    let sayN = 0;
    const plant = (s) => r.holdUse([s.x, 1.0, s.z], 'PLANT CHARGE', 3.4, {
      meter: 'SETTING CHARGE', reach: 2.5,
      onStart: () => {
        s.bomb.visible = true; s.ghost.visible = false; s.ring.visible = false; clunk(r);
        r.tween(0.4, (k) => { s.bomb.scale.setScalar(0.4 + 0.6 * (1 - (1 - k) * (1 - k))); }); r.kick && r.kick(0, 0, 0, 0.004);
      },
      onProgress: (k) => {
        if (s.done) return;
        const q = Math.floor(k * 5); if (q !== s.q) { s.q = q; beep(r, 700 + q * 140, 0.07); }
        s.bomb.setText(Math.round(k * 100) + '%', 'ARMING', true);
      }
    }).then(() => {
      s.done = true; s.k = 1; s.col.off = false; B.planted += 1;
      beep(r, 1500, 0.2, 0.12); setTimeout(() => beep(r, 1800, 0.25, 0.12), 150);
      r.objective(B.planted >= 2 ? 'CLEAR THE FLOOR' : 'PLANT THE CHARGES  ' + B.planted + ' / 2');
      if (B.planted === 1) {
        B.wave = true; B.alT = B.t - 9;
        r.say(DIC, f.say[1], 3.2);
        r.hint && r.hint('THE WHOLE FLOOR IS COMING  —  HOLD THE LINE', 4);
        r.redPulse && r.redPulse(true, { period: 1.3, min: 0.05, max: 0.55 });
      }
    });
    r.say(DIC, f.say[0], 3.6); sayN += 1;
    await Promise.all(B.sites.map(plant));
    // оба заряда стоят: добиваем волну (запас по времени — на случай застрявшего охранника)
    const t0 = r.time;
    await r.until(() => B.dead || (B.spawned >= B.lim && r.enemiesAlive() === 0) || (B.spawned >= B.lim && r.time - t0 > 28));
    B.wave = false;
    r.redPulse && r.redPulse(false);
    await r.clearEnemies();
    r.waypoint && r.waypoint(null);
    r.objective(i < 2 ? 'FLOOR ARMED  —  GO DOWN' : 'ALL CHARGES SET  —  LEAVE THE BUILDING');
    r.say(DIC, f.say[2], 3.4);
    void sayN;
    await r.wait(2.6);
  }

  // ================================================================== ФАЗА BOMBS
  PH.bombs = async function (r, ctx) {
    const W = ctx.W, st = K.st(r);
    K.css();
    K.lock(r);
    K.black(r, 1, 0); K.cutFade(r, 1);
    await r.clearEnemies();
    K.hall && K.hall.dispose(r);
    r.noFight = true;
    const TM = st.team || await K.makeTeam(r, { D: [0, 12.0, 0], G: [2, 12.4, 0] });
    const d = TM.d, g = TM.g;
    // человек в маске и тело игрока из кабинета больше не нужны
    (st.headObjs || []).forEach((n) => { try { F.rm(r, n); } catch (e) { /* уже снят */ } }); st.headObjs = null;
    [d, g].forEach((n) => { if (!n.suitMeshes) F.suit(r, n); n.g.visible = true; K.ally.stop(n); n.goal = null; n.armT = 0; if (n.gunKind !== 'minigun') F.npcMinigun(r, n); });
    const fov0 = r.baseFov;
    K.suitMode(r, true); K.suitFov(r, 102, 0.6);
    K.stress && K.stress(r, 0.25, 1);

    for (let i = 0; i < FLOORS.length; i += 1) {
      const f = FLOORS[i];
      K.lock(r);
      K.cutFade(r, 0); K.black(r, 1, 0);
      if (r.f48bomb) { r.f48bomb.dispose(); r.f48bomb = null; }
      W.enter(f.key, f.at[0], f.at[1], f.at[2]);
      if (f.key === 'head' && W.R.head.door) W.R.head.door.set(1);
      if (f.key === 'hall') { const L = W.R.hall.lift; if (L) { L.set(0); L.setFloor && L.setFloor('1', 0); } W.R.hall.alarm = true; }
      if (f.key === 'vault') { const R = W.R.vault; if (R.shutters) R.shutters.forEach((s) => { s.open = true; s.set(1); }); }
      K.amb.set(r, f.amb, { fade: 0.6 });
      r.p.x = f.at[0]; r.p.z = f.at[1]; r.p.yaw = f.at[2]; r.p.pitch = 0; r.spawnPt = [f.at[0], f.at[1], f.at[2]];
      put(d, f.team[0][0], f.team[0][1], 0); put(g, f.team[1][0], f.team[1][1], 0);
      const B = r.f48bomb = makeFloor(r, W, f, TM);
      const ally = (n, rate, dmg, acc) => B.allies.push({ n, cd: rnd(0.2, 0.8), rate, dmg, acc, flash: 0, snd: 'elmg', spin: 0 });
      ally(d, 0.085, 17, 0.58); ally(g, 0.1, 14, 0.5);
      K.black(r, 0, 0.9);
      K.title(r, f.big, f.small, 2.4);
      await r.phase('bombs' + i, () => floorRun(r, B, i), { pos: [f.at[0], f.at[1], f.at[2]], weapons: ['minigun'], set: () => { B.plantAll(); } });
      K.lock(r);
      B.dispose(); r.f48bomb = null;
      r.redPulse && r.redPulse(false);
      K.ally.stop(d); K.ally.stop(g);
      await K.black(r, 1, 1.0);
      await r.wait(0.4);
    }
    r.baseFov = fov0;
    K.stress && K.stress(r, 0, 0.5);
    st.bombsDone = true;
  };
}());
