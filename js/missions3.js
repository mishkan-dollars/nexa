// NEXA: миссии 11–16 (затемнение, поезд, арена, штурм, скрытность, финал). Продолжение missions2.js.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.M2) return;
  const { Run, MISSIONS } = C;
  const { rnd, clamp, SYS } = C.M2;
  const P = Run.prototype;

  // ------------------------------------------------------------ общие хелперы
  // маяк, который гаснет и по условию cond (а не только по радиусу) — не «залипает» после обхода
  P.goTo = function (x, z, label, rad, cond) {
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
    return this.until(() => !this.locked && (Math.hypot(this.p.x - x, this.p.z - z) < (rad || 1.8) || (cond && cond()))).then(() => { g.visible = false; this.waypoint(null); });
  };
  // удержание у объекта, пока идут волны; sched: [[сек после нажатия, типы | () => список], ...]
  P.holdFight = async function (pos, label, secs, sched, o) {
    o = o || {};
    let done = false;
    const wave = (w) => this.spawnWave(typeof w[1] === 'function' ? w[1]() : this.around(w[1], o.rmin || 9, o.rmax || 18), { gap: 0.45 });
    const start = () => {
      (async () => {
        let prev = 0;
        for (const w of sched) {
          await this.wait(Math.max(0.2, w[0] - prev)); prev = w[0];
          if (done || this.disposed) return;
          wave(w);
        }
      })();
      o.onStart && o.onStart();
    };
    await this.holdUse(pos, label, secs, Object.assign({}, o, { onStart: start }));
    done = true;
  };

  // «Тень»: двигается, только пока на неё не смотрят (камера и фонарь не дают ей подойти)
  const hunterAI = () => {
    let hit = 0.6;
    return (q, dt, run, dist) => {
      const n = q.n, g = n.g, p = run.p;
      if (q.stagger > 0) { q.stagger -= dt; n.creeping = false; return true; }
      const dx = p.x - g.position.x, dz = p.z - g.position.z, d = dist || 0.001;
      n.yaw = Math.atan2(dx, dz);
      const seen = (dx * -Math.sin(p.yaw) + dz * -Math.cos(p.yaw)) / d > 0.6 && q.los;
      if (seen) { n.creeping = false; n.armT = 0; return true; }
      if (d > 1.3) {
        const sp = 5.2 * (run.slowEnemies || 1), nx = g.position.x + dx / d * sp * dt, nz = g.position.z + dz / d * sp * dt;
        if (!run.blockedE(nx, g.position.z)) g.position.x = nx;
        if (!run.blockedE(g.position.x, nz)) g.position.z = nz;
        n.creeping = true; n.armT = 0;
      } else {
        n.creeping = false; n.armT = 1; n.armAng = 1.7;
        hit -= dt;
        if (hit <= 0) { hit = 0.85; run.hurt(16, g.position.x, g.position.z); }
      }
      return true;
    };
  };
  const hunterWave = (r, n) => () => r.around(new Array(n).fill('rusher'), 10, 16).map((a) => ['rusher', a[1], a[2], { hp: 2.2, drop: false, ai: hunterAI() }]);

  // ================================================================ 11 BLACKOUT
  MISSIONS[11] = {
    title: 'BLACKOUT',
    build(r) {
      const W = 0x9a9a9a;
      r.room(0, -24, 22, 76, 3.4, W); r.bound(0, -24, 22, 76, 3.4);
      r.mood(0.6, 0.45, 0x2a2a2a); r.combat(); r.giveWeapon('glock');
      r.baseLight = 0.3; r.lightsLevel(0.3);
      r.torchKeep = 1.2; r.torch.intensity = 1.2;
      [8, -2, -14, -24, -36, -44, -54].forEach((z) => { r.lamp(-5, 3.3, z, 0.9); r.lamp(5, 3.3, z, 0.9); });
      [-8, -30, -48].forEach((z) => r.wallH(z, -11, 11, 3.4, W, [[-1.8, 1.8]]));
      [[-5, 6], [5, 2], [-6, -4], [6, -5], [0, -14], [-6, -18], [6, -24], [-5, -35], [5, -38], [0, -42], [-5, -55], [5, -55]].forEach((p) => r.pillar(p[0], p[1], 1.2, 1.2));
      [[3, 10, 2.4], [-3, -12, 2.4], [3, -34, 2.4], [-3, -26, 2], [-2, -52, 2.4]].forEach((p) => r.crate(p[0], p[1], p[2], 1.1, 1.1, 0x606060));
      r.barrel(8.5, 6); r.barrel(-8.5, -12); r.barrel(8.5, -44); r.barrel(-8.5, -58);
      r.fuses = [[-10.4, -1], [10.4, -20], [-10.4, -40]].map((p) => {
        r.box(p[0], 1.3, p[1], 0.6, 1.5, 1.4, 0x474747, true);
        const s = p[0] < 0 ? 1 : -1;
        return { x: p[0], z: p[1], sx: p[0] + s * 2, lamp: r.strip(p[0] + s * 0.33, 1.6, p[1], 0.04, 0.35, 0.8, 0x3a3a3a) };
      });
      r.strip(0, 1.4, -61.85, 3, 2.8, 0.06);
      r.spawn(0, 11, 0);
    },
    async play(r) {
      const M = r.snd && r.snd.music;
      await r.fade(0, 0.8);
      r.say(SYS, 'ПИТАНИЕ ОТКЛЮЧЕНО. НАЙДИТЕ ТРИ ПРЕДОХРАНИТЕЛЯ.', 2.8);
      r.hint(r.ctl(), 4);
      M && M.start('drone');
      const LV = [0.5, 0.72, 1];
      const FUSE = [
        [[1.5, ['rusher', 'rusher']], [5, ['rusher', 'rusher', 'grunt']]],
        [[1.5, ['grunt', 'grunt']], [4, hunterWave(r, 1)], [8, ['rusher', 'rusher']]],
        [[1, ['grunt', 'grunt', 'rusher']], [4, hunterWave(r, 2)], [9, ['rusher', 'rusher', 'rusher']], [13, ['grunt', 'grunt']]]
      ];
      for (let i = 0; i < 3; i += 1) {
        await r.phase('fuse' + (i + 1), async () => {
          r.banner(null);
          const f = r.fuses[i];
          f.lamp.material = r.basic(0x3a3a3a);
          r.objective('RESTORE POWER — FUSE BOX ' + (i + 1) + ' OF 3');
          r.pickup(f.x + (f.x < 0 ? 3 : -3), f.z + 3, 'ammo', { id: 'glock', amount: 30 });
          r.pickup(f.x + (f.x < 0 ? 3 : -3), f.z - 3, 'health', { amount: 40 });
          await r.goTo(f.sx, f.z, 'FUSE BOX ' + (i + 1), 2.6);
          if (i === 1) r.say(SYS, 'ОНО ДВИЖЕТСЯ, КОГДА ВЫ НЕ СМОТРИТЕ.', 2.6);
          r.hint('LOOK AT THE BOX — [E] / TAP TO RESTORE', 3);
          await r.holdFight([f.x, 1.3, f.z], 'RESTORE FUSE', 8, FUSE[i], { meter: 'FUSE', reach: 3.2 });
          r.sfx('notification'); f.lamp.material = r.basic(0xffffff);
          r.hint('FUSE ' + (i + 1) + ' RESTORED', 2.2);
          r.baseLight = LV[i];
          r.lights(LV[i], 0.8);
          await r.waitClear(0);
          if (i < 2) { r.say(SYS, 'ЧАСТИЧНОЕ ПИТАНИЕ. СЛЕДУЮЩИЙ ПРЕДОХРАНИТЕЛЬ.', 2); await r.wait(1.2); }
        }, {
          pos: [r.fuses[i].sx, r.fuses[i].z, 0],
          set: () => { r.fuses[i].lamp.material = r.basic(0xffffff); r.baseLight = LV[i]; r.lights(LV[i], 0.8); }
        });
      }
      await r.phase('hall', async () => {
        r.banner(null);
        r.objective('REACH THE EXIT — THE HALL IS LIT');
        r.say(SYS, 'ПИТАНИЕ ВОССТАНОВЛЕНО. ОХРАНА ПЕРЕБРАСЫВАЕТСЯ.', 2.4);
        r.pickup(4, -45, 'ammo', { id: 'glock', amount: 30 }); r.pickup(-4, -50, 'health', { amount: 40 });
        const trig = [[-44, [['grunt', -6, -58], ['grunt', 6, -58], ['rusher', 0, -60]]], [-51, [['rusher', -5, -60], ['rusher', 5, -60], ['grunt', 0, -60]]]];
        const off = r.addHook(() => { while (trig.length && r.p.z < trig[0][0]) r.spawnWave(trig.shift()[1], { gap: 0.4 }); });
        await r.goTo(0, -59.5, 'EXIT', 2.4);
        await r.waitClear(0);
        off();
      }, { pos: [0, -59, 0] });
      M && M.stop(1.2);
      await r.cine([{ flash: 0.6, sound: 'succesfully' }]);
      await r.complete();
    }
  };

  // ================================================================ 12 NIGHT TRAIN
  MISSIONS[12] = {
    title: 'NIGHT TRAIN',
    build(r) {
      const W = 0x8c8c8c;
      r.room(0, -30, 5.6, 86, 3.2, W); r.bound(0, -30, 5.6, 86, 3.2);
      r.mood(0.9, 0.3, 0x2c2c2c); r.combat(); r.giveWeapon('glock');
      [8, 0, -10, -18, -26, -34, -44, -50, -60, -68].forEach((z) => r.lamp(0, 3.1, z, 0.9));
      r.tdoors = [-4, -20, -36, -52].map((z) => { r.wallH(z, -2.8, 2.8, 3.2, W, [[-0.95, 0.95]]); return r.door(0, z, 1.9, 2.6); });
      [[13, -4], [-4, -20], [-20, -36], [-36, -52]].forEach((rg, k) => [3, 7, 11].forEach((d) => {
        if (k === 0 && d === 3) return;
        [-1, 1].forEach((s) => r.crate(s * 2.2, rg[0] - d - (k ? 1 : 0), 0.8, 1.5, 0.85, 0x5a5a5a));
      }));
      r.barrel(-1.3, -27); r.barrel(1.3, -30); r.barrel(-1.3, -33);
      // окна: яркие полосы, бегущие вдоль стен — ощущение скорости
      r.win = [];
      for (let i = 0; i < 17; i += 1) [-1, 1].forEach((s) => r.win.push(r.strip(s * 2.74, 1.75, 13 - i * 5.1, 0.05, 0.9, 1.7, 0x8a8a8a)));
      // кабина машиниста
      r.box(0, 0.7, -70.5, 3, 1.4, 1.2, 0x474747, true);
      r.strip(0, 1.55, -71, 2.2, 0.3, 0.05, 0xffffff);
      r.strip(0, 1.4, -72.7, 2.4, 2.4, 0.05);
      r.spawn(0, 10, 0);
    },
    async play(r) {
      const M = r.snd && r.snd.music;
      const T = { V: 24 };
      await r.fade(0, 0.8);
      // качка вагона и бегущие окна живут до конца миссии
      r.addHook((dt) => {
        const L = 86;
        r.win.forEach((m) => { m.position.z = (((m.position.z - T.V * dt + 73) % L) + L) % L - 73; });
        const k = T.V / 24;
        r.extraRoll = (Math.sin(r.time * 1.9) * 0.006 + Math.sin(r.time * 0.73) * 0.004) * k;
        r.extraShake = 0.0016 * k;
      });
      const tunnel = (on) => r.win.forEach((m) => { m.visible = !on; });
      M && M.start('arena'); M && M.level(0.35);
      r.say(SYS, 'ПОЕЗД 083. НОЧНОЙ РЕЙС. ПРОБЕЙТЕСЬ К ЛОКОМОТИВУ.', 3);
      r.hint(r.ctl(), 4);
      await r.phase('car1', async () => {
        r.banner(null); tunnel(false);
        r.objective('TAKE THE AK-47 FROM THE RACK');
        r.pickup(1.3, 4.5, 'ammo', { id: 'glock', amount: 30 });
        r.pickup(-1.3, 6.5, 'weapon', { id: 'ak' });
        const g = r.goTo(-1.3, 6.5, 'AK-47', 1.6);
        await r.until(() => r.inv.some((w) => w.id === 'ak'));
        await g;
        r.objective('CLEAR THE NEXT CAR');
        r.snd && r.snd.play('slam'); r.openDoor(r.tdoors[0], 0.5);
        await r.wait(0.4);
        r.spawnWave([['grunt', 0.7, -9], ['grunt', -0.7, -11], ['grunt', 0, -13]], { gap: 0.7 });
        r.pickup(1.3, 1, 'ammo', { id: 'ak', amount: 30 });
        await r.waitClear(0);
        r.goTo(0, -6, 'NEXT CAR', 2, () => r.p.z < -4.8).then(() => {});
        await r.until(() => r.p.z < -4.8);
      }, { pos: [0, -6, 0], weapons: ['ak'], set: () => r.openNow(r.tdoors[0]) });
      await r.phase('car2', async () => {
        r.banner(null); tunnel(false); r.closeDoor(r.tdoors[1]);
        r.objective('HOLD YOUR GROUND');
        r.pickup(1.2, -6, 'ammo', { id: 'ak', amount: 30 }); r.pickup(-1.2, -9, 'health', { amount: 35 });
        await r.wait(1.2);
        r.say(SYS, 'ТУННЕЛЬ. ОСВЕЩЕНИЕ ОТКЛЮЧЕНО.', 2);
        tunnel(true); r.snd && r.snd.play('train'); await r.lights(0.16, 0.25);
        r.openDoor(r.tdoors[1], 0.4);
        r.spawnWave([['rusher', 0.5, -23], ['rusher', -0.5, -24], ['rusher', 0.6, -26], ['rusher', -0.6, -27], ['rusher', 0, -29]], { gap: 0.55 });
        await r.waitClear(0);
        tunnel(false); r.lights(0.95, 0.6);
        r.goTo(0, -22, 'NEXT CAR', 2, () => r.p.z < -20.8).then(() => {});
        await r.until(() => r.p.z < -20.8);
      }, { pos: [0, -22, 0], set: () => { r.openNow(r.tdoors[1]); tunnel(false); r.lights(0.95, 0.6); } });
      await r.phase('car3', async () => {
        r.banner(null); tunnel(false); r.closeDoor(r.tdoors[2]);
        r.objective('TAKE THE SHOTGUN — BARRELS EXPLODE');
        r.pickup(1.2, -23, 'weapon', { id: 'shotgun' });
        r.pickup(-1.2, -24, 'ammo', { id: 'ak', amount: 30 }); r.pickup(1.2, -34, 'health', { amount: 35 });
        await r.wait(1);
        r.snd && r.snd.play('slam'); r.openDoor(r.tdoors[2], 0.5);
        r.spawnWave([['heavy', 0, -40, { hp: 0.9 }], ['grunt', 0.9, -42], ['grunt', -0.9, -44]], { gap: 0.7 });
        await r.waitClear(0);
        r.goTo(0, -38, 'NEXT CAR', 2, () => r.p.z < -36.8).then(() => {});
        await r.until(() => r.p.z < -36.8);
      }, { pos: [0, -38, 0], weapons: ['ak', 'shotgun'], set: () => r.openNow(r.tdoors[2]) });
      await r.phase('car4', async () => {
        r.banner(null); tunnel(false); r.closeDoor(r.tdoors[3]);
        r.objective('SURVIVE THE FLANK');
        r.pickup(1.2, -38, 'ammo', { id: 'ak', amount: 30 }); r.pickup(-1.2, -39, 'ammo', { id: 'shotgun', amount: 12 }); r.pickup(1.2, -41, 'health', { amount: 40 });
        await r.wait(1.5);
        r.say(SYS, 'ОНИ ВРЫВАЮТСЯ ЧЕРЕЗ ОКНА.', 1.8);
        r.snd && r.snd.play('glass'); r.flash(0.2);
        r.spawnWave([['rusher', 1.2, -44], ['rusher', -1.2, -46], ['grunt', 1.2, -48], ['grunt', -1.2, -49]], { gap: 0.4 });
        await r.wait(5);
        r.snd && r.snd.play('glass');
        r.spawnWave([['rusher', 0, -33], ['rusher', 1, -34], ['grunt', 0, -35, { hp: 0.8 }]], { gap: 0.4 });
        await r.waitClear(0);
        r.snd && r.snd.play('slam'); r.openDoor(r.tdoors[3], 0.5);
        r.goTo(0, -54, 'LOCOMOTIVE', 2, () => r.p.z < -52.8).then(() => {});
        await r.until(() => r.p.z < -52.8);
      }, { pos: [0, -54, 0], set: () => r.openNow(r.tdoors[3]) });
      await r.phase('engine', async () => {
        r.banner(null); tunnel(false); T.V = 24;
        r.objective('STOP THE TRAIN — PULL THE BRAKE');
        r.pickup(-1.3, -56, 'ammo', { id: 'ak', amount: 30 }); r.pickup(1.3, -58, 'ammo', { id: 'shotgun', amount: 12 }); r.pickup(-1.3, -60, 'health', { amount: 40 });
        await r.goTo(0, -67.5, 'BRAKE', 2.6);
        r.hint('LOOK AT THE CONSOLE — [E] / TAP', 3);
        await r.holdFight([0, 1.4, -70.5], 'PULL THE BRAKE', 10, [
          [1, ['grunt', 'grunt', 'rusher']], [5, ['rusher', 'rusher', 'rusher']], [8, ['grunt', ['heavy', { hp: 0.8 }]]]
        ], { meter: 'BRAKE', reach: 3.2, rmin: 8, rmax: 14, onProgress: (p) => { T.V = 24 * (1 - p); } });
        await r.waitClear(0);
      }, { pos: [0, -67.5, 0], set: () => { T.V = 0; } });
      r.snd && r.snd.play('train');
      await r.tween(2.2, (k) => { T.V = 24 * (1 - k) * 0.2; });
      T.V = 0; M && M.stop(1.5);
      await r.cine([{ flash: 0.5, shake: 0.03, sound: 'succesfully' }, { say: [SYS, 'ПОЕЗД ОСТАНОВЛЕН.'], hold: 1.4 }]);
      await r.complete();
    }
  };

  // ================================================================ 13 OPEN FIRE
  MISSIONS[13] = {
    title: 'OPEN FIRE',
    build(r) {
      const W = 0xa8a8a8;
      r.room(0, -10, 34, 36, 5.2, W); r.bound(0, -10, 34, 36, 5.2);
      r.mood(0.95, 0.3, 0x707070); r.combat(); r.giveWeapon('glock');
      [[-10, 5], [10, 5], [-10, -8], [10, -8], [-10, -22], [10, -22], [0, -14]].forEach((p) => r.lamp(p[0], 5.1, p[1], 0.9));
      [[-9, -1], [9, -1], [-9, -19], [9, -19], [0, -10], [-14, -10], [14, -10]].forEach((p) => r.pillar(p[0], p[1], 1.3, 1.3));
      [[-5, -5], [5, -5], [-5, -15], [5, -15]].forEach((p) => r.crate(p[0], p[1], 2.4, 1.0, 1.0, 0x646464));
      [[-15, -3], [15, -3], [-15, -17], [15, -17]].forEach((p) => r.barrel(p[0], p[1]));
      r.markFloor(0, 2, 34, 0.15, 0xbbbbbb); r.markFloor(0, -22, 34, 0.15, 0xbbbbbb);
      r.markFloor(-16.5, -10, 0.15, 24, 0xbbbbbb); r.markFloor(16.5, -10, 0.15, 24, 0xbbbbbb);
      r.spawn(0, 4.5, 0);
    },
    async play(r) {
      const M = r.snd && r.snd.music, AN = 'ANNOUNCER';
      await r.fade(0, 0.8);
      r.say(AN, 'ДОБРО ПОЖАЛОВАТЬ НА АРЕНУ. ПЯТЬ РАУНДОВ. ВЫЖИВИТЕ.', 3.2);
      r.hint(r.ctl(), 4);
      M && M.start('arena');
      const ROUNDS = [
        { gift: null, list: [['grunt', -12, -24], ['grunt', 12, -24], ['grunt', 0, -26], ['grunt', -6, -26]] },
        { gift: 'ak', list: [['grunt', -12, -24], ['grunt', 12, -24], ['rusher', 0, -26], ['rusher', -6, -26], ['rusher', 6, -26]] },
        { gift: null, list: [['heavy', -8, -26, { hp: 0.8 }], ['heavy', 8, -26, { hp: 0.8 }], ['grunt', 0, -26], ['grunt', -14, -22], ['grunt', 14, -22]] },
        { gift: 'shotgun', list: [['rusher', -12, -24], ['rusher', 12, -24], ['rusher', 0, -26], ['rusher', -6, -26], ['rusher', 6, -26], ['grunt', -14, -22], ['grunt', 14, -22], ['grunt', 0, -28], ['rusher', -3, -28], ['rusher', 3, -28]] }
      ];
      const supplies = (extra) => {
        r.inv.forEach((w, k) => r.pickup(-9 + k * 3, 4.5, 'ammo', { id: w.id, amount: w.def.mag * 2 }));
        r.pickup(11, 4.5, 'health', { amount: 50 });
        extra && extra();
      };
      const countdown = async (label, n) => { for (let s = n; s > 0; s -= 1) { r.banner(label + '  —  STARTS IN ' + s, false); await r.wait(1); } };
      for (let i = 0; i < ROUNDS.length; i += 1) {
        await r.phase('round' + (i + 1), async () => {
          r.banner(null);
          const R = ROUNDS[i];
          r.objective('ROUND ' + (i + 1) + ' OF 5 — GET READY');
          supplies(() => { if (R.gift) { r.pickup(R.gift === 'ak' ? -2 : 2, 2.5, 'weapon', { id: R.gift }); r.hint((R.gift === 'ak' ? 'AK-47' : 'SHOTGUN') + ' ON THE FLOOR — TAKE IT', 3.5); } });
          await countdown('ROUND ' + (i + 1) + ' / 5', i ? 5 : 6);
          r.banner('ROUND ' + (i + 1) + ' / 5', true); r.objective('ELIMINATE ALL HOSTILES');
          r.snd && r.snd.play('alarm');
          r.spawnWave(R.list, { gap: 0.45 });
          await r.waitClear(0);
          r.banner('ROUND ' + (i + 1) + ' CLEAR', false);
          r.hint('ROUND CLEAR', 2);
          await r.wait(1.4);
        }, { pos: [0, 4.5, 0], weapons: ROUNDS[i].gift ? [ROUNDS[i].gift] : [] });
      }
      await r.phase('boss', async () => {
        r.banner(null);
        r.objective('ROUND 5 OF 5 — THE WARDEN');
        supplies(() => { r.pickup(-11, 2, 'health', { amount: 50 }); r.pickup(0, 4.5, 'ammo', { id: 'ak', amount: 60 }); });
        await countdown('FINAL ROUND', 5);
        r.say(AN, 'ФИНАЛЬНЫЙ РАУНД. ВЫХОДИТ СМОТРИТЕЛЬ.', 2.4);
        M && M.start('stress');
        r.snd && r.snd.play('alarm');
        const b = r.enemy('boss', 0, -24, { hp: 0.5, drop: false, yaw: 0 });
        r.banner('THE WARDEN', true);
        let stage = 0;
        const off = r.addHook(() => {
          if (b.dead) return;
          const f = b.hp / b.max;
          r.meter('THE WARDEN', f);
          if (stage === 0 && f < 0.72) { stage = 1; r.spawnWave(r.around(['rusher', 'rusher', 'rusher', 'grunt'], 10, 16), { gap: 0.5 }); r.hint('REINFORCEMENTS', 2); }
          if (stage === 1 && f < 0.45) {
            stage = 2; r.spawnWave(r.around(['grunt', 'grunt', 'grunt', 'heavy'], 10, 16), { gap: 0.5 }); r.hint('REINFORCEMENTS', 2);
            r.inv.forEach((w, k) => r.pickup(-6 + k * 6, 3, 'ammo', { id: w.id, amount: w.def.mag * 2 })); r.pickup(0, 1, 'health', { amount: 50 });
          }
          if (stage === 2 && f < 0.2) { stage = 3; r.spawnWave(r.around(['rusher', 'rusher', 'rusher', 'rusher'], 10, 16), { gap: 0.4 }); r.hint('LAST WAVE', 2); }
        });
        await r.until(() => b.dead);
        off(); r.meter(null); r.banner(null);
        const ec = r.endCombat();
        r.slowmo(0.22, 2); r.flash(0.5);
        await r.wait(2.2);
        await ec;
      }, { pos: [0, 4.5, 0] });
      M && M.stop(1.5);
      r.say(AN, 'СМОТРИТЕЛЬ ПАЛ. АРЕНА ЗАКРЫТА.', 2.4);
      await r.wait(1.4);
      await r.complete();
    }
  };

  // ================================================================ 14 CLOSE QUARTERS
  const RM14 = [
    { s: -1, z: 6, foes: [['grunt', 9, 3], ['grunt', 9, -3.5], ['rusher', 6, 1]], hostage: null, amb: [['grunt', 0.8, -12], ['grunt', -0.8, -14]] },
    { s: 1, z: -10, foes: [['grunt', 9, -3], ['rusher', 6, 3], ['grunt', 9, 3]], hostage: [8, 0], amb: [['grunt', 0.8, -28], ['rusher', -0.8, -30]] },
    { s: -1, z: -26, foes: [['grunt', 9, -3], ['grunt', 9, 3], ['rusher', 5, 0], ['rusher', 7, -2]], hostage: null, amb: [['grunt', 0.8, -44], ['grunt', -0.8, -46], ['rusher', 0, -48]] },
    { s: 1, z: -42, foes: [['heavy', 9, 0, { hp: 0.8 }], ['grunt', 9, -3], ['rusher', 5, 3]], hostage: [8, 3.5], amb: [['grunt', 0.8, -60], ['grunt', -0.8, -62]] },
    { s: -1, z: -58, foes: [['heavy', 9, -2, { hp: 0.9 }], ['heavy', 9, 3, { hp: 0.9 }], ['grunt', 6, 0], ['rusher', 5, 2], ['rusher', 5, -2]], hostage: [8, 0], amb: null }
  ];
  MISSIONS[14] = {
    title: 'CLOSE QUARTERS',
    build(r) {
      const H = 3.2, W = 0x9a9a9a;
      r.room(0, -27, 24, 90, H, W); r.bound(0, -27, 24, 90, H);
      r.mood(0.95, 0.3, 0x707070); r.combat(); r.giveWeapon('glock'); r.giveWeapon('shotgun', { equip: true });
      [14, 2, -10, -22, -34, -46, -58, -68].forEach((z) => r.lamp(0, 3.1, z, 0.9));
      const L = RM14.filter((q) => q.s < 0).map((q) => [q.z - 0.8, q.z + 0.8]), Rg = RM14.filter((q) => q.s > 0).map((q) => [q.z - 0.8, q.z + 0.8]);
      r.wallV(-2, -72, 18, H, W, L); r.wallV(2, -72, 18, H, W, Rg);
      r.rdoors = RM14.map((q) => {
        r.wallH(q.z - 5, q.s < 0 ? -12 : 2, q.s < 0 ? -2 : 12, H, W); r.wallH(q.z + 5, q.s < 0 ? -12 : 2, q.s < 0 ? -2 : 12, H, W);
        r.lamp(q.s * 7, 3.0, q.z, 0.9);
        r.pillar(q.s * 7, q.z - 2.2, 0.9, 0.9); r.crate(q.s * 10.5, q.z + 2.5, 1.6, 1.6, 1.1, 0x5c5c5c);
        return r.door(q.s * 2, q.z, 1.6, 2.6, true);
      });
      r.strip(0, 1.4, -71.85, 3.4, 2.8, 0.06);
      r.spawn(0, 14, 0);
    },
    async play(r) {
      await r.fade(0, 0.8);
      r.say(SYS, 'ЗАЛОЖНИКИ В БЛОКЕ D. БЕЛЫЙ ЖИЛЕТ — НЕ СТРЕЛЯТЬ.', 3);
      r.hint(r.ctl(), 4);
      for (let k = 0; k < RM14.length; k += 1) {
        const R = RM14[k], s = R.s, zc = R.z;
        await r.phase('room' + (k + 1), async () => {
          r.banner(null);
          const door = r.rdoors[k];
          r.closeDoor(door);
          r.objective('BREACH ROOM ' + (k + 1) + ' OF 5');
          r.pickup(-s * 1.1, zc + 3, 'ammo', { id: 'shotgun', amount: 12 }); r.pickup(s * 1.1, zc + 4, 'health', { amount: 35 });
          await r.goTo(s * 1.0, zc, 'STACK UP', 1.2);
          r.hint('FACE THE DOOR — KICK IT IN', 3);
          await r.useOnce([s * 1.9, 1.2, zc], 'KICK DOOR', { reach: 2.4 });
          r.snd && r.snd.play('slam'); r.openDoor(door, 0.2);
          r.slowmo(0.3, 2.4);
          let lost = false;
          const wave = R.foes.map((f) => [f[0], s * f[1], zc + f[2], Object.assign({ yaw: s * Math.PI / 2 }, f[3] || {})]);
          if (R.hostage) {
            r.enemy('grunt', s * R.hostage[0], zc + R.hostage[1], { friendly: true, drop: false, yaw: s * Math.PI / 2, onDeath: () => { lost = true; r.fail('HOSTAGE LOST'); } });
            r.hint('HOSTAGE — WHITE VEST', 2.6);
          }
          r.spawnWave(wave, { gap: 0.12, opts: { speed: 1 } });
          await r.waitClear(0);
          if (lost) return;
          if (R.hostage) { r.sfx('notification'); r.hint('HOSTAGE SECURED', 2.2); r.clearEnemies(); }
          r.hint('ROOM CLEAR', 1.6);
          if (R.amb) { await r.wait(0.8); r.spawnWave(R.amb.map((a) => [a[0], a[1], a[2]]), { gap: 0.5 }); r.say(SYS, 'КОНТАКТ В КОРИДОРЕ.', 1.4); await r.waitClear(0); }
          r.objective(k < 4 ? 'MOVE TO THE NEXT DOOR' : 'GET TO THE EXIT');
          await r.wait(0.4);
        }, { pos: [0, zc - 3, 0], set: () => r.openNow(r.rdoors[k]) });
      }
      await r.phase('exit', async () => {
        r.banner(null);
        r.objective('REACH THE EXIT');
        await r.goTo(0, -69.5, 'EXIT', 2);
      }, { pos: [0, -69.5, 0] });
      await r.cine([{ flash: 0.6, sound: 'succesfully' }]);
      await r.complete();
    }
  };

  // ================================================================ 15 CONTROL ROOM
  MISSIONS[15] = {
    title: 'CONTROL ROOM',
    build(r) {
      const W = 0x9c9c9c;
      r.room(0, -24, 28, 84, 3.8, W); r.bound(0, -24, 28, 84, 3.8);
      r.mood(0.9, 0.4, 0x606060); r.combat(); r.giveWeapon('glock'); r.suppressed = true;
      [14, 4, -10, -20, -34, -44, -58].forEach((z) => { r.lamp(-6, 3.7, z, 0.9); r.lamp(6, 3.7, z, 0.9); });
      r.wallH(-6, -14, 14, 3.8, W, [[-10, -5], [5, 10]]);
      r.wallH(-28, -14, 14, 3.8, W, [[-3, 3]]);
      r.wallH(-52, -14, 14, 3.8, W, [[-1.5, 1.5]]);
      r.sdoor = r.door(0, -52, 3, 2.6);
      [[-8, 12, 3], [8, 6, 3], [0, 14, 2.4]].forEach((p) => r.crate(p[0], p[1], p[2], 1.1, 1.1, 0x606060));
      [[-3, -1], [3, -1], [-4, 4], [5, 9], [-5, 10]].forEach((p) => r.pillar(p[0], p[1], 1.2, 1.2));
      [[0, -12], [-8, -22], [8, -22], [-6, -9], [6, -9]].forEach((p) => r.pillar(p[0], p[1], 1.2, 1.2));
      [[4, -9, 2.4], [-4, -25, 2.4]].forEach((p) => r.crate(p[0], p[1], p[2], 1.1, 1.1, 0x606060));
      [[-9, -38], [9, -38], [-5, -43], [5, -43]].forEach((p) => r.pillar(p[0], p[1], 1.2, 1.2));
      r.box(0, 0.55, -47, 4, 1.1, 1.2, 0x474747, true);
      r.strip(0, 1.6, -47.5, 2.6, 0.9, 0.05);
      r.strip(0, 1.4, -65.85, 3, 2.8, 0.06);
      r.spawn(0, 15.5, 0);
    },
    async play(r) {
      const M = r.snd && r.snd.music;
      const S = { det: 0, alarm: false };
      await r.fade(0, 0.8);
      r.suppressed = true;
      const guards = () => r.cb.enemies.filter((e) => e.guard && !e.dead);
      const alarm = (why) => {
        if (S.alarm) return;
        S.alarm = true;
        r.banner('ALARM — GUARDS ALERTED', true);
        r.snd && r.snd.play('alarm'); r.flash(0.3);
        guards().forEach((q) => { q.n.armT = 1; });
        r.objective('ALARM! FIGHT YOUR WAY THROUGH');
        r.spawnWave(r.around(['grunt', 'grunt', 'rusher'], 12, 20), { gap: 0.5 });
        M && M.start('stress');
      };
      const guardAI = (q, dt, run, dist) => {
        if (S.alarm) { q.n.armT = 1; return false; }
        const n = q.n, g = n.g;
        if (q.stagger > 0) { q.stagger -= dt; n.creeping = false; return true; }
        q.hold -= dt;
        let tx, tz, spd = 1.35;
        if (q.inv) {
          tx = q.inv[0]; tz = q.inv[1]; spd = 2.3; q.invT -= dt;
          if (q.invT <= 0 || Math.hypot(tx - g.position.x, tz - g.position.z) < 1) { q.inv = null; q.hold = 1.8; }
        } else {
          const w = q.path[q.pi]; tx = w[0]; tz = w[1];
          if (Math.hypot(tx - g.position.x, tz - g.position.z) < 0.5) { q.pi = (q.pi + 1) % q.path.length; q.hold = 1.1; }
        }
        if (q.hold > 0) { n.creeping = false; n.yaw += Math.sin(run.time * 1.4 + q.ph) * dt * 0.9; return true; }
        const dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz) || 1;
        n.yaw = Math.atan2(dx, dz);
        const nx = g.position.x + dx / d * spd * dt, nz = g.position.z + dz / d * spd * dt;
        if (!run.blockedE(nx, g.position.z)) g.position.x = nx;
        if (!run.blockedE(g.position.x, nz)) g.position.z = nz;
        n.creeping = true;
        return true;
      };
      const mkGuard = (path) => {
        const q = r.enemy('grunt', path[0][0], path[0][1], { hp: 0.5, drop: false, ai: guardAI, yaw: Math.atan2(path[1][0] - path[0][0], path[1][1] - path[0][1]) });
        q.guard = true; q.path = path; q.pi = 1; q.hold = rnd(0, 1); q.ph = rnd(0, 6);
        q.hear = () => { if (S.alarm || q.dead) return; q.inv = [r.p.x, r.p.z]; q.invT = 4; q.hold = 0; S.det = Math.min(1, S.det + 0.15); };
        return q;
      };
      const detect = (dt) => {
        if (r.locked || S.alarm) return;
        const p = r.p;
        let rate = 0;
        if (r.time < S.t0 + 4) return;
        guards().forEach((q) => {
          const g = q.n.g, dx = p.x - g.position.x, dz = p.z - g.position.z, d = Math.hypot(dx, dz) || 0.001;
          if (d > 15 || !q.los) return;
          const cosA = (dx * Math.sin(q.n.yaw) + dz * Math.cos(q.n.yaw)) / d;
          if (cosA > 0.55 || d < 2) rate += 0.3 + (1 - d / 15) * 1.5;
        });
        S.det = clamp(S.det + (rate ? rate * dt : -0.18 * dt), 0, 1);
        if (S.det > 0.02) r.banner('DETECTION  ' + Math.round(S.det * 100) + '%', S.det > 0.6); else r.banner(null);
        if (S.det >= 1) alarm();
      };
      const begin = (carry) => { S.det = 0; S.t0 = r.time; S.alarm = !!carry; r.suppressed = true; r.banner(carry ? 'ALARM — GUARDS ALERTED' : null, !!carry); S.off && S.off(); S.off = r.addHook(detect); };
      r.say(SYS, 'ОХРАНА НА ОБХОДЕ. ГЛУШИТЕЛЬ УСТАНОВЛЕН. НЕ ПОПАДАЙТЕСЬ НА ГЛАЗА.', 3.2);
      r.hint(r.ctl(), 4);
      await r.phase('zones', async () => {
        S.carry = false;
        begin(false);
        r.objective('REACH THE CONTROL ROOM — STAY UNSEEN');
        r.hint('GUARDS SEE IN FRONT OF THEM — ONE HEADSHOT KILLS SILENTLY', 5);
        r.pickup(-12, 12, 'ammo', { id: 'glock', amount: 30 }); r.pickup(12, -14, 'ammo', { id: 'glock', amount: 30 }); r.pickup(-12, -20, 'health', { amount: 40 });
        [[[-12, 9], [-4, 9]], [[12, 2], [4, 2]], [[-12, -12], [-12, -24]], [[12, -24], [12, -12]], [[-6, -18], [6, -18]]].forEach(mkGuard);
        const g = r.goTo(0, -30, 'CONTROL ROOM', 0.01, () => r.p.z < -29.5);
        await r.until(() => r.p.z < -29.5);
        await g;
        S.carry = S.alarm; r.banner(null);
      }, { pos: [0, -30.5, 0], set: () => { S.carry = false; S.alarm = false; } });
      await r.phase('terminal', async () => {
        begin(S.carry);
        r.objective('HACK THE TERMINAL');
        r.pickup(12, -34, 'ammo', { id: 'glock', amount: 30 }); r.pickup(-12, -34, 'health', { amount: 40 });
        [[[-9, -34], [9, -34]], [[10, -49], [-10, -49]], [[-6, -41], [6, -41]]].forEach(mkGuard);
        await r.goTo(0, -44.4, 'TERMINAL', 2.2);
        r.hint('LOOK AT THE TERMINAL — [E] / TAP', 3);
        await r.holdUse([0, 1.4, -46.6], 'DOWNLOAD DATA', 8, { meter: 'DOWNLOAD', reach: 3.2 });
        r.banner(null);
      }, { pos: [0, -44.4, 0] });
      S.off && S.off();
      await r.phase('escape', async () => {
        S.alarm = true; r.suppressed = false; r.banner('DATA STOLEN — ALARM', true);
        r.objective('RUN TO THE EXIT');
        r.say(SYS, 'ДАННЫЕ СКОПИРОВАНЫ. ТРЕВОГА. К ВЫХОДУ.', 2.4);
        r.snd && r.snd.play('alarm'); M && M.start('stress');
        r.openDoor(r.sdoor, 0.8);
        r.pickup(1.5, -55, 'ammo', { id: 'glock', amount: 30 }); r.pickup(-1.5, -60, 'health', { amount: 40 });
        r.spawnWave([['rusher', -4, -30], ['rusher', 4, -30], ['grunt', 0, -31], ['rusher', -2, -32], ['rusher', 2, -32], ['grunt', 0, -34]], { gap: 0.6 });
        await r.goTo(0, -64.2, 'EXIT', 2);
        r.banner(null);
      }, { pos: [0, -64.2, 0] });
      M && M.stop(1.2);
      await r.endCombat();
      await r.cine([{ flash: 0.6, sound: 'succesfully' }]);
      await r.complete();
    }
  };

  // ================================================================ 16 NEXA PROTOCOL
  MISSIONS[16] = {
    title: 'NEXA PROTOCOL',
    build(r) {
      const W = 0xb0b0b0;
      r.room(0, -10, 40, 44, 5.4, W); r.bound(0, -10, 40, 44, 5.4);
      r.mood(0.95, 0.28, 0x707070); r.combat(); r.giveWeapon('glock'); r.giveWeapon('shotgun'); r.giveWeapon('ak', { equip: true });
      [[-12, 8], [12, 8], [-12, -6], [12, -6], [-12, -20], [12, -20], [0, -26], [0, 2]].forEach((p) => r.lamp(p[0], 5.3, p[1], 0.9));
      [[-9, -2], [9, -2], [-9, -18], [9, -18], [-16, -10], [16, -10]].forEach((p) => r.pillar(p[0], p[1], 1.3, 1.3));
      [[-5, -7], [5, -7], [0, -14]].forEach((p) => r.crate(p[0], p[1], 2.4, 1.0, 1.0, 0x646464));
      r.markFloor(0, -10, 14, 0.2, 0xe0e0e0); r.markFloor(0, -10, 0.2, 14, 0xe0e0e0);
      r.markFloor(0, -3, 14, 0.2, 0xe0e0e0); r.markFloor(0, -17, 14, 0.2, 0xe0e0e0);
      r.markFloor(-7, -10, 0.2, 14, 0xe0e0e0); r.markFloor(7, -10, 0.2, 14, 0xe0e0e0);
      r.strip(0, 3.2, -31.85, 12, 0.5, 0.05); // табличка NEXA на дальней стене
      r.spawn(0, 9, 0);
    },
    async play(r) {
      const M = r.snd && r.snd.music, OP = 'OPERATOR';
      await r.fade(0, 0.8);
      r.say(OP, 'СУБЪЕКТ 083. ВЫ ПРОШЛИ ВСЕ ТЕСТЫ. ОСТАЛСЯ ПРОТОКОЛ.', 3.2);
      r.hint(r.ctl(), 4);
      M && M.start('drone');
      let boss = null;
      await r.phase('operator', async () => {
        r.banner(null);
        r.objective('DEFEAT THE OPERATOR');
        r.inv.forEach((w, k) => r.pickup(-9 + k * 9, 8, 'ammo', { id: w.id, amount: w.def.mag * 2 })); r.pickup(0, 6, 'health', { amount: 60 });
        await r.wait(3.2);
        M && M.start('stress');
        r.glitch(0.4); r.sfx('error');
        const bossAI = () => {
          let tp = 5, stage = 0, lastSummon = 0;
          const blink = (e) => {
            for (let i = 0; i < 14; i += 1) {
              const a = Math.random() * Math.PI * 2, d = rnd(8, 15), x = r.p.x + Math.sin(a) * d, z = r.p.z + Math.cos(a) * d;
              if (Math.abs(x) > 18 || z > 10 || z < -30 || r.blockedE(x, z)) continue;
              e.n.g.position.x = x; e.n.g.position.z = z; e.n.yaw = Math.atan2(r.p.x - x, r.p.z - z);
              r.glitch(0.22); r.sfx('error'); r.snd && r.snd.play('beep');
              return;
            }
          };
          return (e, dt) => {
            if (e.dead) return true;
            const f = e.hp / e.max;
            if (stage < 1 && f < 0.66) { stage = 1; r.lights(0.55, 0.3); r.hint('PHASE 2', 2); r.spawnWave(r.around(['grunt', 'grunt', 'rusher', 'rusher'], 10, 16), { gap: 0.5 }); }
            if (stage < 2 && f < 0.33) {
              stage = 2; r.hint('PHASE 3 — PROTOCOL OVERRIDE', 2.4); r.flash(0.4); r.snd && r.snd.play('boom', { k: 0.7 });
              e.t = Object.assign({}, e.t, { rate: 0.09, burst: [7, 10], cd: [0.8, 1.3] });
              r.spawnWave(r.around(['rusher', 'rusher', 'rusher', 'rusher', 'grunt'], 10, 16), { gap: 0.4 });
              r.inv.forEach((w, k) => r.pickup(-9 + k * 9, 4, 'ammo', { id: w.id, amount: w.def.mag * 2 })); r.pickup(0, 2, 'health', { amount: 60 });
            }
            lastSummon += dt;
            if (stage >= 1 && lastSummon > (stage >= 2 ? 11 : 15)) { lastSummon = 0; r.spawnWave(r.around([stage >= 2 ? 'rusher' : 'grunt', 'rusher', 'grunt'], 10, 16), { gap: 0.5 }); }
            tp -= dt;
            if (tp <= 0) { blink(e); tp = rnd(5, 7) / (1 + stage * 0.35); }
            return false;
          };
        };
        boss = r.enemy('boss', 0, -26, { hp: 0.65, drop: false, yaw: 0, ai: bossAI() });
        r.banner('THE OPERATOR', true);
        const off = r.addHook(() => { if (!boss.dead) r.meter('THE OPERATOR', boss.hp / boss.max); });
        let supply = 0;
        const off2 = r.addHook((dt) => {
          if (boss.dead || r.locked) return;
          supply += dt;
          if (supply > 16) { supply = 0; r.pickup(rnd(-14, 14), rnd(-24, 4), r.hp < 60 ? 'health' : 'ammo', { id: r.wp ? r.wp.id : 'glock', amount: 30 }); }
        });
        await r.until(() => boss.dead);
        off(); off2(); r.meter(null); r.banner(null);
        const ec = r.endCombat();
        r.slowmo(0.2, 2.2); r.flash(0.6);
        await r.wait(2.4);
        await ec;
      }, { pos: [0, 9, 0] });
      M && M.stop(1.2);
      r.stage('operator');
      r.lightsLevel(0.9);
      await r.cine([
        { flash: 0.5 },
        { say: [OP, 'ПРОТОКОЛ ЗАВЕРШЁН. ОСТАЛСЯ ОДИН СУБЪЕКТ.'], hold: 2.2 },
        { say: [OP, 'СУБЪЕКТ 084. УСТРАНИТЕ ЕГО — И ЭКСПЕРИМЕНТ ОКОНЧЕН.'], hold: 2.6 }
      ]);
      // финальный выбор: выстрелить в безоружного или опустить оружие
      let choice = null;
      r.objective('FIRE — OR LOWER THE WEAPON');
      r.enemy('target', 0, -14, { friendly: true, drop: false, yaw: 0, onDeath: () => { if (!choice) choice = 'shoot'; } });
      const it = r.interact({ pos: [0, 1.4, -14], label: 'LOWER THE WEAPON', reach: 10, enabled: () => !choice, use: () => { if (!choice) choice = 'spare'; } });
      r.goTo(0, -10.5, 'SUBJECT 084', 2.4).then(() => {});
      await r.until(() => choice);
      r.interactables.splice(r.interactables.indexOf(it), 1);
      r.waypoint(null);
      r.choice = choice;
      if (choice === 'shoot') {
        r.flash(0.6);
        await r.cine([{ glitch: 0.5 }, { say: [OP, 'ВЫ ВЫПОЛНИЛИ ПРОТОКОЛ. СУБЪЕКТ 083 ПРИНЯТ.'], hold: 2.4 }]);
      } else {
        r.sfx('notification');
        await r.cine([{ say: [OP, 'ОШИБКА. СУБЪЕКТ 083 НЕ ВЫПОЛНИЛ ПРОТОКОЛ.'], hold: 2.4 }, { glitch: 0.5 }, { say: [OP, 'ЭТО... НОВЫЙ РЕЗУЛЬТАТ.'], hold: 2.2 }]);
      }
      await r.complete();
    }
  };
}());
