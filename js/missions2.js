// NEXA: миссии 7–16 (оружие, динамика, без запоминания). Подключаются к Missions._core.MISSIONS.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.WEAPONS) return;
  const { Run, MISSIONS, CINEMA, EYE, lerp, smooth } = C;
  const cin = C.cin;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rsel = (a) => a[Math.floor(Math.random() * a.length)];
  const P = Run.prototype;
  const SYS = 'SYSTEM';
  const CAP = (place) => place + '\nNEXA INDUSTRIES — 03.11.1992';
  const DONE = (n) => 'TASK ' + String(n).padStart(2, '0') + ' COMPLETE\nSUBJECT 083 — RECORD UPDATED';

  // ------------------------------------------------------------ строительные хелперы
  // стена вдоль X на z (проёмы gaps=[[x0,x1],...]); надпроёмная балка не имеет коллайдера — игрок проходит свободно
  P.wallH = function (z, x0, x1, h, col, gaps) {
    let a = x0;
    (gaps || []).slice().sort((p, q) => p[0] - q[0]).forEach((g) => { if (g[0] > a) this.box((a + g[0]) / 2, h / 2, z, g[0] - a, h, 0.3, col, true); a = g[1]; });
    if (a < x1) this.box((a + x1) / 2, h / 2, z, x1 - a, h, 0.3, col, true);
    if (h > 2.7) (gaps || []).forEach((g) => this.box((g[0] + g[1]) / 2, (h + 2.6) / 2, z, g[1] - g[0], h - 2.6, 0.3, col, false));
  };
  P.wallV = function (x, z0, z1, h, col, gaps) {
    let a = z0;
    (gaps || []).slice().sort((p, q) => p[0] - q[0]).forEach((g) => { if (g[0] > a) this.box(x, h / 2, (a + g[0]) / 2, 0.3, h, g[0] - a, col, true); a = g[1]; });
    if (a < z1) this.box(x, h / 2, (a + z1) / 2, 0.3, h, z1 - a, col, true);
    if (h > 2.7) (gaps || []).forEach((g) => this.box(x, (h + 2.6) / 2, (g[0] + g[1]) / 2, 0.3, h - 2.6, g[1] - g[0], col, false));
  };
  // пол + потолок + сетка на прямоугольник; границы мира для камеры катсцен
  P.slab = function (cx, cz, w, d, h, floorCol, o) {
    o = o || {};
    this.box(cx, -0.05, cz, w, 0.1, d, floorCol || 0x6a6a6a, false);
    if (!o.open) this.box(cx, h + 0.05, cz, w, 0.1, d, o.ceil || 0x3e3e3e, false);
    if (this.surf) return;
    const g = new THREE.GridHelper(Math.max(w, d), Math.round(Math.max(w, d) / 2), 0x4a4a4a, 0x4a4a4a);
    g.position.set(cx, 0.012, cz); g.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); this.scene.add(g);
  };
  // колонна-укрытие (блокирует линию огня на уровне глаз) и низкий ящик (мешает ходить, но через него стреляют)
  P.pillar = function (x, z, w, d, col) { return this.box(x, 1.5, z, w || 1.2, 3, d || 1.2, col || 0x7a7a7a, true); };
  P.crate = function (x, z, w, d, h, col) { return this.box(x, (h || 1) / 2, z, w || 1, h || 1, d || 1, col || 0x606060, true); };
  // светящаяся полоса / табличка (не освещается, всегда читается)
  P.strip = function (x, y, z, w, h, d, col) { return this.box(x, y, z, w, h, d, col === undefined ? 0xf0f0f0 : col, false, true); };
  P.markFloor = function (x, z, w, d, col) { return this.box(x, 0.02, z, w, 0.03, d, col === undefined ? 0xdddddd : col, false, true); };
  P.fog = function (k, color) { this.setFog(this.q.fog * (k || 0.6), color === undefined ? 0x6a6a6a : color); };
  P.bound = function (cx, cz, w, d, h) { this.bounds = { cx, cz, w, d, h }; };

  // ------------------------------------------------------------ павшие
  P.corpse = function (x, z, yaw) {
    const n = this.npc(x, z, yaw || 0);
    n.yaw = yaw || 0; n.g.rotation.y = n.yaw;
    this.actorLay(n, 'back');
    this.ensureBlood(); this.bloodPool(n, false, true);
    return n;
  };

  // ------------------------------------------------------------ волны и маяки
  // list: [[type, x, z, opts], ...]; врагов одновременно не больше q.maxEnemies (слабые телефоны не страдают)
  P.spawnWave = async function (list, o) {
    o = o || {};
    this.spawning = (this.spawning || 0) + 1;
    try {
      for (const it of list) {
        if (this.disposed || this.ceasefire) return;
        while (this.enemiesAlive() >= this.q.maxEnemies && !this.disposed && !this.ceasefire) await this.wait(0.35);
        if (this.disposed || this.ceasefire) return;
        const e = this.enemy(it[0], it[1], it[2], Object.assign({ yaw: Math.atan2(this.p.x - it[1], this.p.z - it[2]) }, o.opts || {}, it[3] || {}));
        o.each && o.each(e);
        if (o.gap) await this.wait(o.gap);
      }
    } finally { this.spawning = Math.max(0, (this.spawning || 1) - 1); }
  };
  // конец боя: убрать всех и не дать уже запущенным волнам дозаспавнить врагов после победы
  P.endCombat = async function () {
    this.ceasefire = true;
    this.clearEnemies();
    await this.until(() => !this.spawning || this.disposed);
    this.ceasefire = false;
    this.clearEnemies();
  };
  P.waitClear = function (n) { return this.until(() => !this.spawning && this.enemiesAlive() <= (n || 0)); };

  // маяк: световой столб + ромб с дистанцией; завершается, когда игрок подходит
  P.beacon = function (x, z, label, rad) {
    const T = THREE;
    this.beacons = this.beacons || {};
    const key = x + ',' + z;
    let g = this.beacons[key];
    if (!g) {
      g = this.beacons[key] = new T.Mesh(this.g.box, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false }));
      g.scale.set(0.45, 7, 0.45); g.position.set(x, 3.5, z); g.renderOrder = 5; this.scene.add(g);
    }
    g.visible = true;
    this.waypoint([x, 1.5, z], label || '');
    return this.until(() => !this.locked && Math.hypot(this.p.x - x, this.p.z - z) < (rad || 1.8)).then(() => { g.visible = false; this.waypoint(null); });
  };

  // удержание «E»: игрок активирует точку и должен остаться рядом; прогресс убывает, если отойти (не нужно держать кнопку — удобно на тачскрине)
  P.holdUse = function (pos, label, secs, o) {
    o = o || {};
    return new Promise((res) => {
      let progress = 0, active = false;
      const it = this.interact({ pos, label, reach: o.reach || 2.6, enabled: () => !active, use: () => { active = true; this.sfx('notification'); o.onStart && o.onStart(); } });
      const rad = (o.reach || 2.6) + 0.4;
      const hook = (dt) => {
        if (!active || this.locked) return;
        const near = Math.hypot(this.p.x - pos[0], this.p.z - pos[2]) < rad;
        progress = clamp(progress + (near ? dt / secs : -dt / (secs * 2.5)), 0, 1);
        this.meter((o.meter || 'PROGRESS') + ' ' + Math.round(progress * 100) + '%', progress);
        o.onProgress && o.onProgress(progress);
        if (progress >= 1) {
          this.meter(null); this.hooks.splice(this.hooks.indexOf(hook), 1);
          this.interactables.splice(this.interactables.indexOf(it), 1);
          res();
        }
      };
      this.hooks.push(hook);
    });
  };

  // разовое «нажми E»: ждём, пока игрок использует объект
  P.useOnce = function (pos, label, o) {
    o = o || {};
    return new Promise((res) => {
      const it = this.interact({ pos, label, reach: o.reach || 2.4, enabled: () => !it.used, use: () => { it.used = true; this.interactables.splice(this.interactables.indexOf(it), 1); res(); } });
    });
  };

  // выстрел по «сферической» мишени (глиняные диски, узлы охлаждения)
  P.target = function (x, y, z, r, o) {
    o = o || {};
    const T = THREE, cb = this.combat().cb;
    const m = new T.Mesh(o.geo || new T.SphereGeometry(r, 10, 8), new T.MeshBasicMaterial({ color: o.color === undefined ? 0xffffff : o.color }));
    m.position.set(x, y, z); this.scene.add(m);
    const s = { shape: 'sph', alive: true, x, y, z, r, m, hp: o.hp || 1, max: o.hp || 1, vx: 0, vy: 0, vz: 0, onHit: o.onHit, onDeath: o.onDeath };
    s.damage = (amt, head, pt) => {
      if (!s.alive) return;
      s.hp -= amt; s.onHit && s.onHit(s, amt);
      if (s.hp <= 0) { s.alive = false; m.visible = false; const i = cb.shoot.indexOf(s); if (i >= 0) cb.shoot.splice(i, 1); this.sparks(s.x, s.y, s.z, 0, 1, 0, 6); s.onDeath && s.onDeath(s); }
    };
    s.move = (x2, y2, z2) => { s.x = x2; s.y = y2; s.z = z2; m.position.set(x2, y2, z2); };
    s.remove = () => { s.alive = false; m.visible = false; const i = cb.shoot.indexOf(s); if (i >= 0) cb.shoot.splice(i, 1); };
    cb.shoot.push(s);
    return s;
  };

  // «смерть» вне боя (удар, перегрузка, поимка): откат к последней контрольной точке phase()
  P.fail = function (why) { if (!this.locked) this.die(why); };

  // хук в игровой цикл с возможностью снять его (хуки фазы чистятся при смерти, но не после успешного завершения)
  P.addHook = function (fn) { this.hooks.push(fn); return () => { const i = this.hooks.indexOf(fn); if (i >= 0) this.hooks.splice(i, 1); }; };
  P.closeDoor = function (d) { const c = d.userData.col; if (c) c.off = false; d.position.y = (d.userData.h || 2.5) / 2; };
  // верхняя строка-баннер (таймеры, раунды); null — скрыть
  P.banner = function (text, hot) {
    let el = this.banEl;
    if (!el) { el = this.banEl = document.createElement('div'); el.className = 'm-ban'; this.layer.appendChild(el); }
    if (text === null) { el.classList.remove('on', 'hot'); return; }
    el.textContent = text; el.classList.add('on'); el.classList.toggle('hot', !!hot);
  };
  P.hint = function (text, sec) { this.toast(text, sec || 3.2); };
  P.ctl = function () { return this.touch ? 'FIRE / AIM / R — buttons on screen' : 'LMB — FIRE  |  RMB — AIM  |  R — RELOAD'; };
  P.mood = function (amb, fog, fogColor) { this.setAmbient(amb); this.fog(fog, fogColor); };
  // стена-пресс: едет по -Z; настигла игрока — «смерть» (откат на чекпоинт фазы)
  P.bulkhead = function (z0, x0, x1, speed) {
    const T = THREE;
    if (this.bulk) this.bulk.stop();
    const g = new T.Group(), w = x1 - x0, cx = (x0 + x1) / 2;
    const add = (sx, sy, sz, px, py, pz, col) => { const m = new T.Mesh(this.g.box, this.basic(col)); m.scale.set(sx, sy, sz); m.position.set(px, py, pz); g.add(m); };
    add(w, 3.6, 0.5, cx, 1.8, 0, 0x0a0a0a);
    for (let i = 0; i < 6; i += 1) add(w / 12, 3.6, 0.52, cx - w / 2 + (i * 2 + 1) * w / 12, 1.8, 0, 0xeeeeee);
    g.position.z = z0; this.scene.add(g);
    const b = { g, z: z0, speed, on: true, tick: 0 };
    let fn;
    b.stop = () => { b.on = false; g.visible = false; const i = this.hooks.indexOf(fn); if (i >= 0) this.hooks.splice(i, 1); };
    fn = (dt) => {
      if (!b.on || this.locked) return;
      b.z -= b.speed * dt; g.position.z = b.z;
      const gap = this.p.z - b.z; // насколько игрок впереди (в -Z) — gap < 0
      b.tick -= dt;
      if (b.tick <= 0) { b.tick = clamp(1.4 + gap * 0.18, 0.5, 2.6); this.snd && this.snd.play('beep', { k: 0.7 }); }
      this.banner('BULKHEAD  ' + Math.max(0, Math.round(b.z - this.p.z)) + ' M', b.z - this.p.z < 6);
      if (this.p.z > b.z - 0.6) { b.stop(); this.banner(null); this.fail('CRUSHED BY BULKHEAD'); }
    };
    this.hooks.push(fn);
    this.bulk = b;
    return b;
  };

  // безопасная зона под навесом: пол с рамкой; set(on) — подсветка перед импульсом
  P.bay = function (x, z) {
    const s = 4.4, m = [];
    [[0, -s / 2, s, 0.12], [0, s / 2, s, 0.12], [-s / 2, 0, 0.12, s], [s / 2, 0, 0.12, s]].forEach((p) => m.push(this.box(x + p[0], 0.03, z + p[1], p[2], 0.04, p[3], 0x9a9a9a, false, true)));
    this.box(x, 3.0, z, s, 0.18, s, 0x555555, false);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((c) => this.box(x + c[0] * s / 2, 1.5, z + c[1] * s / 2, 0.16, 3, 0.16, 0x555555, false));
    return { x, z, set: (on) => m.forEach((q) => { q.material = this.basic(on ? 0xffffff : 0x9a9a9a); }) };
  };
  // точки появления врагов вокруг игрока (предпочтительно вне поля зрения). types: 'grunt' | ['grunt', {opts}]
  P.around = function (types, rmin, rmax) {
    const out = [], b = this.bounds, fx = -Math.sin(this.p.yaw), fz = -Math.cos(this.p.yaw);
    types.forEach((t) => {
      let best = null;
      for (let i = 0; i < 16; i += 1) {
        const a = Math.random() * Math.PI * 2, d = rnd(rmin, rmax), x = this.p.x + Math.sin(a) * d, z = this.p.z + Math.cos(a) * d;
        if (b && (Math.abs(x - b.cx) > b.w / 2 - 1 || Math.abs(z - b.cz) > b.d / 2 - 1)) continue;
        if (this.blockedE(x, z)) continue;
        const facing = (x - this.p.x) * fx + (z - this.p.z) * fz;
        if (!best || facing < best.f) best = { x, z, f: facing };
        if (facing < 0) break;
      }
      if (best) out.push([Array.isArray(t) ? t[0] : t, best.x, best.z, Array.isArray(t) ? t[1] : undefined]);
    });
    return out;
  };
  // периодический импульс: вне безопасных зон бьёт игрока и врагов
  P.surge = function (bays, o) {
    o = o || {};
    const S = { t: o.first || 7, warn: false }, inBay = (x, z) => bays.some((b) => Math.abs(x - b.x) < 2.3 && Math.abs(z - b.z) < 2.3);
    const off = this.addHook((dt) => {
      if (this.locked) return;
      S.t -= dt;
      if (!S.warn && S.t < 3) { S.warn = true; this.snd && this.snd.play('alarm'); bays.forEach((b) => b.set(true)); }
      if (S.warn) { this.lightsLevel((this.baseLight || 1) * (0.55 + 0.45 * Math.abs(Math.sin(S.t * 14)))); this.banner((o.label || 'SURGE') + ' IN ' + Math.max(1, Math.ceil(S.t)) + ' — GET UNDER COVER', true); }
      else this.banner('NEXT ' + (o.label || 'SURGE') + '  ' + Math.ceil(S.t), false);
      if (S.t <= 0) {
        S.warn = false; S.t = o.every || 11;
        bays.forEach((b) => b.set(false)); this.lightsLevel(this.baseLight || 1);
        this.flash(0.45); this.shake(0.05, 0.6); this.snd && this.snd.play('boom', { k: 0.6 });
        if (!inBay(this.p.x, this.p.z)) this.hurt(o.dmg || 30);
        this.cb.enemies.slice().forEach((e) => { if (!e.dead && !e.friendly && !inBay(e.x, e.z)) this.damageEnemy(e, o.edmg || 45, false); });
      }
    });
    return { stop: () => { off(); bays.forEach((b) => b.set(false)); this.lightsLevel(this.baseLight || 1); this.banner(null); } };
  };

  // ============================================================ миссии
  // ---------------------------------------------------------------- 07 BREAKOUT
  MISSIONS[7] = {
    title: 'BREAKOUT',
    build(r) {
      const W = 0x9a9a9a;
      r.room(0, -26, 16, 132, 3.6, W); r.bound(0, -26, 16, 132, 3.6);
      r.mood(0.9, 0.45); r.combat();
      [36, 22, 4, -14, -30, -50, -70, -88].forEach((z) => r.lamp(0, 3.5, z, 0.9));
      r.wallH(30, -8, 8, 3.6, W, [[-1.3, 1.3]]);
      r.wallH(8, -8, 8, 3.6, W, [[-1.5, 1.5]]);
      r.wallH(-30, -8, 8, 3.6, W, [[-1.5, 1.5]]);
      r.wallV(-3.5, -91.9, -30.15, 3.6, W); r.wallV(3.5, -91.9, -30.15, 3.6, W);
      r.d1 = r.door(0, 30, 2.6, 2.6); r.d2 = r.door(0, 8, 3, 2.6); r.d3 = r.door(0, -30, 3, 2.6);
      // камера: нары, столы, колонны
      [[-6, 37], [6, 37], [-6, 33], [6, 33]].forEach((b) => r.crate(b[0], b[1], 1.6, 2.6, 0.7, 0x707070));
      r.crate(-5.5, 21, 3, 1.2, 0.9, 0x666666); r.crate(5.5, 15, 3, 1.2, 0.9, 0x666666); r.crate(-5, 12, 2, 1, 1, 0x606060);
      [[-4, 19], [4, 19], [-4, 12], [4, 25]].forEach((p) => r.pillar(p[0], p[1]));
      [[-4.2, -4], [4.2, -8], [-4.2, -14], [4.2, -18], [-4.2, -24], [4.2, -26]].forEach((p) => r.pillar(p[0], p[1]));
      r.crate(0, -11, 2.6, 1, 1.0, 0x666666); r.crate(0, -20, 2.6, 1, 1.0, 0x666666);
      [[-6.5, -6], [6.5, -12], [-6.5, -22]].forEach((p) => r.crate(p[0], p[1], 1.4, 1.4, 1.2, 0x5c5c5c));
      r.barrel(-5.2, -10); r.barrel(5.2, -15); r.barrel(0, -26);
      r.strip(0, 1.5, -91.7, 4.5, 2.8, 0.05);
      r.markFloor(0, -31, 3, 0.4); r.markFloor(0, 7, 3, 0.4); r.markFloor(0, 29, 2.6, 0.4);
      r.spawn(0, 37.5, 0);
    },
    async play(r) {
      const M = r.snd && r.snd.music;
      await r.fade(0, 0.8);
      r.closeDoor(r.d1); r.closeDoor(r.d2); r.closeDoor(r.d3);
      r.snd && r.snd.play('alarm');
      M && M.start('stress');
      r.objective('GET OUT OF THE CELL');
      r.say(SYS, 'ПЕРИМЕТР НАРУШЕН. БЛОК C ЗАПЕЧАТАН.', 2.6);
      r.flicker(8);
      await r.wait(2.4);
      r.openDoor(r.d1, 0.6); r.snd && r.snd.play('slam');
      r.fade(0, 0.1); r.shake(0.03, 0.5);
      // --- фаза 1: добыть пистолет и отбить охрану
      await r.phase('guards', async () => {
        r.closeDoor(r.d2); r.d1.position.y = 5; r.d1.userData.col.off = true;
        r.objective('FIND A WEAPON');
        r.pickup(-5.5, 19.4, 'weapon', { id: 'glock' });
        r.beacon(-5.5, 19.4, 'WEAPON', 1.6);
        await r.until(() => r.inv && r.inv.length > 0);
        r.waypoint(null);
        r.hint(r.ctl(), 4.5);
        r.objective('DEFEND YOURSELF');
        r.snd && r.snd.play('slam'); r.openDoor(r.d2, 0.5);
        await r.wait(0.5);
        r.spawnWave([['grunt', -3, -2], ['grunt', 3, -4], ['rusher', 0, -8, { speed: 0.85 }]], { gap: 1.0 });
        r.pickup(4.6, 14, 'ammo', { id: 'glock', amount: 15 });
        await r.waitClear(0);
        r.hint('AREA CLEAR — MOVE', 2);
      }, { pos: [0, 12, 0], weapons: ['glock'], set: () => r.openNow(r.d2) });
      // --- фаза 2: тюремный зал
      await r.phase('cellblock', async () => {
        r.d2.position.y = 5; r.d2.userData.col.off = true; r.closeDoor(r.d3);
        r.objective('FIGHT THROUGH THE CELL BLOCK');
        r.pickup(-5.8, 3, 'ammo', { id: 'glock', amount: 20 });
        r.pickup(5.8, 4, 'health', { amount: 40 });
        r.beacon(0, -29, 'EXIT', 2.4).then(() => {});
        await r.until(() => r.p.z < 3);
        r.spawnWave([['grunt', -6, -26], ['grunt', 6, -26], ['grunt', 0, -28]], { gap: 0.6 });
        await r.until(() => r.p.z < -8);
        r.spawnWave([['rusher', -6, -28], ['rusher', 6, -28]], { gap: 0.4 });
        r.pickup(-6.5, -8, 'ammo', { id: 'glock', amount: 20 });
        await r.until(() => r.p.z < -16 && r.enemiesAlive() <= 1);
        r.spawnWave([['grunt', -5, -29], ['rusher', 5, -29], ['grunt', 5, -29]], { gap: 0.5 });
        r.pickup(6.5, -18, 'health', { amount: 30 });
        await r.waitClear(0);
        r.snd && r.snd.play('alarm');
        r.hint('DOOR UNLOCKED', 2);
        r.openDoor(r.d3, 0.8);
        await r.goTo(0, -34, 'GO', 1.4, () => r.p.z < -31.5);
      }, { pos: [0, -33.5, 0], set: () => r.openNow(r.d3) });
      // --- фаза 3: забег от переборки
      await r.phase('bulkhead', async () => {
        r.d3.position.y = 5; r.d3.userData.col.off = true;
        r.objective('RUN — DO NOT STOP MOVING');
        r.say(SYS, 'КАРАНТИННАЯ ПЕРЕБОРКА ЗАКРЫВАЕТСЯ.', 2.2);
        r.pickup(1.8, -36, 'ammo', { id: 'glock', amount: 20 });
        r.pickup(-1.8, -52, 'health', { amount: 35 });
        r.pickup(1.5, -66, 'ammo', { id: 'glock', amount: 15 });
        const bh = r.bulkhead(-22, -3.4, 3.4, 1.65);
        const trig = [[-40, [['rusher', -1.5, -54], ['rusher', 1.5, -56]]], [-52, [['grunt', 0, -70], ['rusher', 0, -68]]], [-62, [['rusher', -1.5, -78], ['rusher', 1.5, -78], ['grunt', 0, -80]]], [-74, [['rusher', 0, -88], ['rusher', -1.2, -88]]]];
        const off = r.addHook(() => { while (trig.length && r.p.z < trig[0][0]) r.spawnWave(trig.shift()[1], { gap: 0.4 }); });
        r.beacon(0, -90, 'EXIT', 2.2).then(() => {});
        await r.until(() => r.p.z < -88);
        off(); bh.stop(); r.banner(null);
        r.stage('breakout');
      }, { pos: [0, -89, 0], set: () => r.stage('breakout') });
      r.clearEnemies(); M && M.stop(1.5);
      await r.cine([{ flash: 0.6, sound: 'succesfully' }]);
      await r.complete();
    }
  };

  // ---------------------------------------------------------------- 08 PROFICIENCY TEST
  MISSIONS[8] = {
    title: 'PROFICIENCY TEST',
    build(r) {
      const W = 0xa0a0a0;
      r.room(0, -14, 24, 70, 3.8, W); r.bound(0, -14, 24, 70, 3.8);
      r.mood(0.95, 0.4); r.combat();
      [14, 0, -14, -28].forEach((z) => { r.lamp(-5, 3.7, z, 0.9); r.lamp(5, 3.7, z, 0.9); });
      r.box(0, 0.5, 12, 22, 1.0, 0.6, 0x555555, false); // барьер у стрелковой линии (визуальный — можно выйти на полигон)
      r.pillar(-6, 8); r.pillar(6, 8);
      for (let z = 6; z >= -30; z -= 6) { r.markFloor(-11.2, z, 0.8, 0.12); r.markFloor(11.2, z, 0.8, 0.12); r.markFloor(0, z, 10, 0.05, 0x888888); }
      r.pillar(-5, -8); r.pillar(5, -8); r.pillar(0, -15); r.pillar(-7, -21); r.pillar(7, -21);
      r.strip(0, 3, -48.8, 8, 0.4, 0.05); r.markFloor(0, 13, 6, 0.1);
      r.spawn(0, 17, 0);
    },
    async play(r) {
      const INS = 'INSTRUCTOR';
      await r.fade(0, 0.8);
      await r.phase('issue', async () => {
        r.objective('TAKE THE SIDEARM FROM THE COUNTER');
        r.say(INS, 'Субъект 083. Оружие на стойке. Берите.', 2.2);
        r.pickup(0, 13.3, 'weapon', { id: 'glock' });
        r.beacon(0, 13.3, 'GLOCK', 1.6).then(() => {});
        await r.until(() => r.inv && r.inv.length > 0);
        r.waypoint(null); r.hint(r.ctl(), 4.5);
      });
      // ---- этап 1: неподвижные мишени (чёрные), «белый жилет» — не стрелять
      const runStage = (name, need, maxMiss, timeLimit, populate) => new Promise((res) => {
        let score = 0, miss = 0, tl = timeLimit;
        const st = { add: () => { score += 1; r.sfx('notification'); }, bad: () => { miss += 1; r.hint('FRIENDLY HIT  ' + miss + '/' + maxMiss, 1.4); r.flash(0.3); r.snd && r.snd.play('hurt', { k: 0.6 }); }, el: () => timeLimit - tl };
        populate(st, true);
        const off = r.addHook((dt) => {
          if (r.locked) return;
          if (timeLimit) tl -= dt;
          r.meter(name + '  ' + score + '/' + need + (timeLimit ? '   ' + Math.max(0, Math.ceil(tl)) + 'S' : ''), score / need);
          if (st.tick) st.tick(dt, score);
          if (score >= need) { off(); r.meter(null); res(true); }
          else if (miss >= maxMiss || (timeLimit && tl <= 0)) { off(); r.meter(null); res(false); }
        });
      });
      const mkT = (st, x, z, friend, o) => r.enemy('target', x, z, Object.assign({ drop: false, friendly: friend, yaw: 0, onDeath: () => (friend ? st.bad() : st.add()) }, o || {}));
      const retry = async () => { r.clearEnemies(); r.sfx('error'); r.hint('ATTEMPT FAILED — AGAIN', 2.4); r.say(INS, 'Ещё раз. Не торопитесь.', 1.6); await r.wait(2); };
      await r.phase('static', async () => {
        r.objective('HIT THE BLACK TARGETS — NOT THE WHITE');
        r.say(INS, 'Бейте только чёрные. Белый жилет — свои.', 2.4);
        for (;;) {
          const ok = await runStage('STATIC TARGETS', 8, 3, 0, (st) => {
            [[-8, -4], [-3, -9], [3, -6], [8, -12], [-6, -17], [0, -20], [6, -25], [-9, -26]].forEach((p) => mkT(st, p[0], p[1], false));
            [[-6, -8], [5, -17], [-2, -14]].forEach((p) => mkT(st, p[0], p[1], true));
          });
          if (ok) break; await retry();
        }
        r.clearEnemies(); r.hint('STAGE 1 COMPLETE', 2);
      });
      // ---- этап 2: движущиеся мишени
      await r.phase('moving', async () => {
        r.objective('MOVING TARGETS — 45 SECONDS');
        r.say(INS, 'Теперь они движутся. Время пошло.', 1.8);
        r.pickup(-9, 11, 'ammo', { id: 'glock', amount: 30 });
        for (;;) {
          const ok = await runStage('MOVING TARGETS', 14, 3, 45, (st) => {
            const spawnOne = (friend) => {
              const dir = Math.random() < 0.5 ? -1 : 1;
              const e = mkT(st, -9.5 * dir, rnd(-22, -6), friend, { ai: null });
              e.vx = dir * rnd(1.6, 3.2);
              e.ai = (q, dt) => { const g = q.n.g; g.position.x += q.vx * dt; q.n.yaw = q.vx > 0 ? Math.PI / 2 : -Math.PI / 2; q.n.creeping = true; if (Math.abs(g.position.x) > 10) { q.dead = true; q.alive = false; g.visible = false; q.n.free = true; const i = r.cb.enemies.indexOf(q); if (i >= 0) r.cb.enemies.splice(i, 1); const j = r.cb.shoot.indexOf(q); if (j >= 0) r.cb.shoot.splice(j, 1); } return true; };
              return e;
            };
            st.tick = () => {
              const blk = r.cb.enemies.filter((q) => !q.friendly && !q.dead).length, fr = r.cb.enemies.filter((q) => q.friendly && !q.dead).length;
              if (blk < 4 && Math.random() < 0.08) spawnOne(false);
              if (fr < 2 && Math.random() < 0.03) spawnOne(true);
            };
          });
          if (ok) break; await retry();
        }
        r.clearEnemies(); r.hint('STAGE 2 COMPLETE', 2);
      });
      // ---- этап 3: вооружённые мишени, АК
      await r.phase('live', async () => {
        r.objective('TAKE THE AK-47 — LIVE-FIRE ASSESSMENT');
        r.say(INS, 'Последний этап. Мишени стреляют. Берите АК.', 2.6);
        r.pickup(3, 13.3, 'weapon', { id: 'ak' });
        r.pickup(-3, 13.3, 'ammo', { id: 'ak', amount: 60 });
        r.beacon(3, 13.3, 'AK-47', 1.6).then(() => {});
        await r.until(() => r.inv.some((w) => w.id === 'ak'));
        r.waypoint(null);
        r.objective('DESTROY ALL ARMED TARGETS — WHITE VEST = FRIENDLY');
        await r.wait(1.2);
        for (;;) {
          let mistakes = 0;
          const friends = [[-4, -14], [4, -20]].map((p, i) => {
            const e = r.enemy('grunt', p[0], p[1], { friendly: true, drop: false, yaw: 0, ai: null });
            e.vx = i ? -1.2 : 1.2;
            e.ai = (q, dt) => { const g = q.n.g; g.position.x += q.vx * dt; if (Math.abs(g.position.x) > 9) q.vx = -q.vx; q.n.yaw = q.vx > 0 ? Math.PI / 2 : -Math.PI / 2; q.n.creeping = true; return true; };
            e.onDeath = () => { mistakes += 1; r.hint('FRIENDLY HIT', 1.4); r.flash(0.3); };
            return e;
          });
          r.spawnWave([['grunt', -8, -30], ['grunt', 8, -30], ['grunt', 0, -34, { hp: 1.3 }], ['rusher', -4, -34], ['rusher', 4, -34], ['grunt', -2, -38]], { gap: 0.9 });
          r.pickup(-10, 8, 'ammo', { id: 'ak', amount: 30 }); r.pickup(10, 8, 'health', { amount: 40 });
          await Promise.race([r.waitClear(0), r.until(() => mistakes >= 2)]);
          if (mistakes < 2) break;
          r.clearEnemies(); r.sfx('error'); r.hint('TOO MANY FRIENDLY HITS — AGAIN', 2.4); await r.wait(2);
        }
        r.clearEnemies();
      }, { pos: [0, 12, 0], weapons: ['ak'] });
      r.say(INS, 'Тест пройден. Субъект 083 допущен.', 2.6);
      await r.wait(1.2);
      await r.complete();
    }
  };

  // ---------------------------------------------------------------- 09 POWER SURGE
  MISSIONS[9] = {
    title: 'POWER SURGE',
    build(r) {
      const W = 0xa4a4a4;
      r.room(0, -16, 30, 84, 4.2, W); r.bound(0, -16, 30, 84, 4.2);
      r.mood(0.95, 0.4); r.combat(); r.baseLight = 0.6; r.lightsLevel(0.6);
      r.giveWeapon('glock'); r.giveWeapon('ak');
      [20, 6, -8, -22, -36, -50].forEach((z) => { r.lamp(-6, 4.1, z, 0.9); r.lamp(6, 4.1, z, 0.9); });
      r.box(0, 1.8, -18, 6, 3.6, 6, 0x555555, true);
      [-3.05, 3.05].forEach((x) => r.strip(x, 2.2, -18, 0.08, 2.4, 3.2)); [-3.05, 3.05].forEach((z) => r.strip(0, 2.2, -18 + z, 3.2, 2.4, 0.08));
      r.strip(0, 3.65, -18, 4.4, 0.1, 4.4);
      [[-5, 10], [5, 10], [-5, -3], [5, -3], [0, -32], [-5, -44], [5, -44], [-12, -18], [12, -18]].forEach((p) => r.pillar(p[0], p[1]));
      [[0, 16], [-8, -12], [8, -34]].forEach((p) => r.crate(p[0], p[1], 3, 1.2, 1.1, 0x606060));
      r.bays = [[-10, 18], [10, 14], [-10, 2], [10, -6], [10, -26], [-10, -26], [10, -46], [-10, -48]].map((p) => r.bay(p[0], p[1]));
      r.gens = [[-12, 8], [12, -14], [-12, -38]].map((p) => {
        r.box(p[0], 1.2, p[1], 2.4, 2.4, 2.4, 0x474747, true);
        return { x: p[0], z: p[1], lamp: r.strip(p[0], 2.5, p[1], 1.8, 0.2, 1.8, 0x3a3a3a) };
      });
      [-9, 0, 9].forEach((x) => r.box(x, 1.4, -57.8, 3, 2.8, 0.1, 0x151515, false));
      r.spawn(0, 22, 0);
    },
    async play(r) {
      await r.fade(0, 0.8);
      r.say(SYS, 'РЕАКТОРНОЕ КРЫЛО ОБЕСТОЧЕНО. ЗАПУСТИТЕ ТРИ ГЕНЕРАТОРА.', 3);
      r.hint(r.ctl(), 4);
      const WAVES = [
        [[0, ['grunt', 'grunt', 'grunt']], [6, ['rusher', 'rusher']]],
        [[0, ['grunt', 'grunt', ['heavy', { hp: 0.8 }]]], [5, ['rusher', 'rusher', 'rusher']], [12, ['grunt', 'grunt']]],
        [[0, ['grunt', 'grunt', 'grunt', ['heavy', { hp: 0.8 }]]], [5, ['rusher', 'rusher', 'rusher', 'rusher']], [11, ['grunt', 'grunt', ['heavy', { hp: 0.8 }]]]]
      ];
      for (let i = 0; i < 3; i += 1) {
        await r.phase('gen' + (i + 1), async () => {
          const g = r.gens[i];
          r.baseLight = 0.6 + 0.13 * i; r.lightsLevel(r.baseLight);
          g.lamp.material = r.basic(0x3a3a3a);
          r.objective('RESTORE GENERATOR ' + (i + 1) + ' OF 3');
          const sg = r.surge(r.bays, { first: 8, every: 11 });
          r.pickup(g.x + (g.x < 0 ? 3.2 : -3.2), g.z + 2, 'ammo', { id: 'ak', amount: 30 });
          r.pickup(g.x + (g.x < 0 ? 3.4 : -3.4), g.z - 2, 'health', { amount: 40 });
          await r.beacon(g.x + (g.x < 0 ? 2 : -2), g.z, 'GENERATOR ' + (i + 1), 3);
          let done = false;
          const hold = r.holdUse([g.x, 1.4, g.z], 'START GENERATOR', 9, { meter: 'GENERATOR', reach: 3.4 });
          (async () => {
            let prev = 0;
            for (const w of WAVES[i]) { await r.wait(Math.max(0.2, w[0] - prev)); prev = w[0]; if (done || r.disposed) return; r.spawnWave(r.around(w[1], 10, 20), { gap: 0.45 }); }
          })();
          await hold; done = true;
          r.sfx('notification'); g.lamp.material = r.basic(0xffffff);
          r.baseLight = 0.6 + 0.13 * (i + 1); r.lightsLevel(r.baseLight);
          r.hint('GENERATOR ' + (i + 1) + ' ONLINE', 2.4);
          await r.waitClear(0);
          sg.stop();
          if (i < 2) { r.say(SYS, 'ГЕНЕРАТОР ' + (i + 1) + ' ЗАПУЩЕН. СЛЕДУЮЩИЙ — ПО МАРКЕРУ.', 2.2); await r.wait(1.5); }
        }, {
          pos: [r.gens[i].x + (r.gens[i].x < 0 ? 2 : -2), r.gens[i].z, 0],
          set: () => { r.gens[i].lamp.material = r.basic(0xffffff); r.bays.forEach((b) => b.set(false)); r.baseLight = 0.6 + 0.13 * (i + 1); r.lightsLevel(r.baseLight); }
        });
      }
      r.baseLight = 1; r.lightsLevel(1);
      r.stage('power');
      await r.cine([{ flash: 0.8, sound: 'succesfully' }, { say: [SYS, 'ПИТАНИЕ ВОССТАНОВЛЕНО.'], hold: 1.6 }]);
      await r.complete();
    }
  };

  // ---------------------------------------------------------------- 10 LIFT SHAFT
  MISSIONS[10] = {
    title: 'LIFT SHAFT',
    build(r) {
      const W = 0x9c9c9c, H = 3.8;
      r.slab(0, 0, 16, 16, H, 0x707070); r.bound(0, 0, 16, 16, H);
      r.wallV(-8, -8, 8, H, W, [[-2.2, 2.2]]); r.wallV(8, -8, 8, H, W, [[-2.2, 2.2]]);
      r.wallH(-8, -8, 8, H, W, [[-2.2, 2.2]]); r.wallH(8, -8, 8, H, W, [[-2.2, 2.2]]);
      r.mood(0.95, 0.35); r.combat(); r.giveWeapon('glock');
      [[-4, -4], [4, -4], [-4, 4], [4, 4]].forEach((p) => r.lamp(p[0], 3.7, p[1], 0.9));
      // тоннели (откуда лезут враги): стены, торцевая стена и полосы «бегущих этажей»
      r.tun = [];
      [[0, -1, 0], [-1, 0, 1], [1, 0, 1]].forEach((d, i) => {
        const bx = d[0] * 8, bz = d[1] * 8, len = 8;
        const cx = d[0] * (8 + len / 2), cz = d[1] * (8 + len / 2);
        // стены тоннеля
        if (d[2]) { r.box(cx, H / 2, -2.45, len, H, 0.3, W, true); r.box(cx, H / 2, 2.45, len, H, 0.3, W, true); r.box(d[0] * (8 + len), H / 2, 0, 0.3, H, 5, 0x555555, true); }
        else { r.box(-2.45, H / 2, cz, 0.3, H, len, W, true); r.box(2.45, H / 2, cz, 0.3, H, len, W, true); r.box(0, H / 2, bz - len, 5, H, 0.3, 0x555555, true); }
        r.slab(cx, cz, d[2] ? len : 5, d[2] ? 5 : len, H, 0x6a6a6a);
        const bars = [];
        for (let k = 0; k < 4; k += 1) bars.push(r.strip(d[2] ? d[0] * (8 + len - 0.2) : 0, 0.5 + k, d[2] ? 0 : bz - len + 0.2, d[2] ? 0.05 : 4.6, 0.12, d[2] ? 4.6 : 0.05));
        r.tun.push({ x: d[0] * (8 + len - 2), z: d[1] * (8 + len - 2), bars });
      });
      // колонны, ящики, бочки
      [[-3.5, -3], [3.5, -3], [-3.5, 3], [3.5, 3]].forEach((p) => r.pillar(p[0], p[1], 1, 1));
      r.crate(0, 1.2, 2, 1, 0.9, 0x606060);
      r.barrel(-6.5, -6.5); r.barrel(6.5, -6.5); r.barrel(-6.5, 6.5); r.barrel(6.5, 6.5);
      // южный выход (откроется на поверхности)
      r.ds = r.door(0, 8, 4.4, 2.6); r.strip(0, 1.4, 14.9, 4.4, 2.8, 0.05);
      r.box(-2.45, H / 2, 11.5, 0.3, H, 7, W, true); r.box(2.45, H / 2, 11.5, 0.3, H, 7, W, true); r.box(0, H / 2, 15.1, 5, H, 0.3, 0x555555, true); r.slab(0, 11.5, 5, 7, H, 0x6a6a6a);
      r.spawn(0, 5.5, 0);
    },
    async play(r) {
      const M = r.snd && r.snd.music;
      await r.fade(0, 0.8);
      r.closeDoor(r.ds);
      r.objective('HOLD THE LIFT UNTIL IT REACHES THE SURFACE');
      r.say(SYS, 'ПОДЪЁМ НА ПОВЕРХНОСТЬ. ДЕРЖИТЕ ПЛАТФОРМУ.', 2.6);
      await r.wait(2);
      let prog = 0;
      const TOTAL = 150;
      await r.phase('lift', async () => {
        prog = 0;
        M && M.start('arena');
        r.closeDoor(r.ds);
        const off = r.addHook((dt) => {
          if (r.locked) return;
          prog = Math.min(TOTAL, prog + dt);
          r.meter('ASCENT  ' + Math.round(prog / TOTAL * 100) + '%', prog / TOTAL);
          r.extraShake = 0.003;
          // бегущие полосы этажей
          r.tun.forEach((t) => t.bars.forEach((b, k) => { b.position.y = ((b.position.y - dt * 3.2 + 4) % 4); }));
        });
        // враги появляются прямо в тоннеле (exact: за границами комнаты), с разбросом поперёк тоннеля, чтобы не слипались
        const T = r.tun, side = (i, list) => list.map((t, k) => { const j = (k % 3 - 1) * 1.3, vx = i === 0; return [t, T[i].x + (vx ? j : 0), T[i].z + (vx ? 0 : j), { yaw: Math.atan2(-T[i].x, -T[i].z), exact: true }]; });
        const sched = [
          [2, () => side(0, ['grunt', 'grunt', 'grunt'])],
          [16, () => side(1, ['rusher', 'rusher']).concat(side(2, ['rusher', 'rusher']))],
          [32, () => side(0, ['grunt', 'grunt']).concat(side(1, ['grunt']), side(2, ['grunt']))],
          [52, () => side(1, ['grunt', 'grunt']).concat(side(2, ['rusher', 'rusher', 'rusher']))],
          [74, () => side(0, ['heavy']).concat(side(1, ['rusher', 'rusher']), side(2, ['grunt', 'grunt']))],
          [98, () => side(0, ['grunt', 'grunt']).concat(side(1, ['rusher', 'rusher', 'rusher']), side(2, ['rusher', 'rusher', 'rusher']))],
          [122, () => side(0, ['heavy', 'grunt']).concat(side(1, ['heavy']), side(2, ['rusher', 'rusher', 'grunt']))]
        ];
        let akDone = false, sgDone = false, si = 0;
        const sup = [18, 40, 60, 80, 104, 126];
        const sch = r.addHook(() => {
          if (r.locked) return;
          while (sched.length && prog >= sched[0][0]) { const w = sched.shift(); r.spawnWave(w[1](), { gap: 0.5 }); r.hint('SHAFT BREACHED', 1.4); }
          if (!akDone && prog > 30) { akDone = true; r.pickup(0, -0.3, 'weapon', { id: 'ak' }); r.say(SYS, 'ДОСТАВЛЕН АК-47. ЗАБЕРИТЕ.', 1.8); }
          if (!sgDone && prog > 85) { sgDone = true; r.pickup(0, -0.3, 'weapon', { id: 'shotgun' }); r.hint('SHOTGUN DROPPED', 2); }
          while (si < sup.length && prog >= sup[si]) { // припасы по ходу подъёма
            r.pickup(si % 2 ? 2.4 : -2.4, 2.4, 'ammo', { id: r.wp ? r.wp.id : 'glock', amount: 30 });
            if (si % 2) r.pickup(-2.4, 2.4, 'health', { amount: 35 });
            si += 1;
          }
        });
        await r.until(() => prog >= TOTAL);
        off(); sch();
        r.extraShake = 0; r.meter(null);
        r.hint('ARRIVING — CLEAR THE PLATFORM', 2.4);
        await r.waitClear(0);
      }, { pos: [0, 5.5, 0], weapons: ['ak', 'shotgun'], set: () => { r.extraShake = 0; } });
      M && M.stop(1.2);
      r.stage('surface');
      r.openDoor(r.ds, 1.6); r.snd && r.snd.play('slam');
      r.objective('GET OFF THE LIFT');
      await r.beacon(0, 13.5, 'SURFACE', 1.8);
      await r.cine([{ flash: 0.7, sound: 'succesfully' }]);
      await r.complete();
    }
  };

  // ============================================================ миссии добавляются ниже
  C.M2 = { CAP, DONE, rnd, rsel, clamp, SYS };
}());
