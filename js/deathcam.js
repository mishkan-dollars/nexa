// NEXA: кинематика смерти игрока («реалистичная смерть»).
// Что происходит от момента смертельного удара до кнопки «Возродиться» (≈5,3 с):
//  • тело игрока (тот же рэгдолл, что у врагов, но «ноги подкашиваются»: ragdoll.js, режим collapse) тяжело рушится; об пол оно сплющивается и пружинит (squash & stretch);
//  • тяжёлая тряска камеры в момент удара + короткое замедление времени;
//  • камера — один из трёх вариантов (чередуются): А — падает вместе с головой и заваливается на бок на 60°; Б — медленно взлетает по вертикали и смотрит на тело сверху;
//    В — «казнь в упор»: игрок падает на колени, 2–4 охранника сбегаются и вжимают стволы в голову; камера смотрит снизу вверх, выстрел, тело рушится рэгдоллом, добивающие в упор;
//  • звук (sound.js deathStart): всё резко обрывается «зажёванной плёнкой» (тормозящий трек + царапанье иглы), тишина, нарастающий звон и затухающее сердце;
//  • сильное размытие и обесцвечивание (пост-обработка), чёрная круговая виньетка сжимается к центру — «закрываются глаза»; потом чёрный экран и кнопка «Возродиться».
// Подключается после ragdoll.js. Вызывается из Run.prototype.recover (combat.js); без этого файла работает старый экран смерти.
// Тест: ?dc=a / ?dc=b / ?dc=c фиксирует вариант камеры.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.ragdoll || !C.Run) return;
  const { Run, lerp, smooth, wrap } = C;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const EYE = 1.35;                         // как в missions.js: камера на уровне груди
  const T_IRIS0 = 2.6, T_IRIS1 = 5.3;       // с момента смерти: начало и конец закрытия «глаз»
  const FORCE = (location.search.match(/[?&]dc=([abc])/) || [])[1] || '';

  // откуда пришёл последний удар — тело упадёт от стрелка, а камера повернётся к нему
  const hurt0 = Run.prototype.hurt;
  Run.prototype.hurt = function (amt, fx, fz) {
    if (fx !== undefined && !this.dead) this.lastHurtSrc = { x: fx, z: fz };
    return hurt0.apply(this, arguments);
  };

  // ------------------------------------------------------------------ тело игрока: просто чёрный стикмен без деталей и аксессуаров — тот же скелет и материал, что у врагов
  // C.playerSkin оставлен как единая точка для тела при смерти (ниже) и танцора в эмоциях (emote.js): ничего не добавляет, только возвращает dispose.
  C.playerSkin = function (r, n) { return { dispose() {} }; };
  // поза «оружие в руках»: рэгдолл подхватывает позу как стартовую
  function weaponPose(n) {
    n.armL.rotation.x = -1.2; n.armR.rotation.x = -1.35; n.elbL.rotation.x = -0.55; n.elbR.rotation.x = -0.4;
    n.legL.rotation.x = 0.12; n.legR.rotation.x = -0.1;
  }
  function makeBody(r, yaw) {
    const p = r.p, n = r.npc(p.x, p.z, yaw + Math.PI), skin = C.playerSkin(r, n);
    weaponPose(n);
    n.dcFree = () => {
      r.scene.remove(n.g);
      const i = r.npcs.indexOf(n); if (i >= 0) r.npcs.splice(i, 1);
      skin.dispose();
    };
    return n;
  }

  // только меши сцены: Sprite/Points в Raycaster без камеры бросают исключение — раньше оно глоталось и высота потолка/свободное место считались «по умолчанию»
  function sceneMeshes(r) {
    const a = [];
    r.scene.traverseVisible((o) => { if (o.isMesh) a.push(o); });
    return a;
  }
  // сколько места над головой (для варианта Б): один луч вверх, раз за смерть
  function ceilingY(r, x, z) {
    try {
      const rc = new THREE.Raycaster(new THREE.Vector3(x, 1.8, z), new THREE.Vector3(0, 1, 0), 0, 7);
      const hit = rc.intersectObjects(sceneMeshes(r), false).find((h) => h.object.visible && !h.object.userData.dcSkip);
      if (hit) return clamp(hit.point.y - 0.3, 2.3, 5.2);
    } catch (e) {}
    return 4.6;
  }

  // свободное место по горизонтали от головы в направлении yaw (лучи по сцене, тело игрока не считается)
  function freeDist(r, S, x, y, z, yaw, meshes) {
    try {
      const rc = new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), 0, 7);
      const hit = rc.intersectObjects(meshes || sceneMeshes(r), false).find((h) => {
        if (h.object.userData.dcSkip) return false;
        for (let o = h.object; o; o = o.parent) { if (o === S.n.g || !o.visible) return false; }
        return true;
      });
      return hit ? hit.distance : 7;
    } catch (e) { return 4; }
  }
  // куда смотреть лёжа: на стрелка (если путь свободен), иначе вбок/от тела — туда, где больше воздуха; прямо на собственное тело — никогда
  function pickLook(r, S, ykill) {
    const hx = S.h.x - S.ps.x, hz = S.h.z - S.ps.z;
    const away = Math.hypot(hx, hz) > 0.2 ? Math.atan2(-hx, -hz) : S.yaw0;
    const body = away + Math.PI;
    let best = away, bs = -1;
    [[ykill, 1.6], [away, 0], [away + Math.PI / 2, 0.3], [away - Math.PI / 2, 0.3]].forEach((c) => {
      if (Math.abs(wrap(c[0] - body)) < 1.1) return;
      const sc = Math.min(freeDist(r, S, S.h.x, S.h.y + 0.15, S.h.z, c[0]), 6) + c[1];
      if (sc > bs) { bs = sc; best = c[0]; }
    });
    return best;
  }

  // ------------------------------------------------------------------ вариант В: «казнь в упор»
  // Игрок на коленях (тело скрыто до выстрела: камера — его глаза), 2–4 охранника выбегают из свободных направлений и в упор вжимают стволы в голову.
  // Позы охранников: штатный updateNpc (бег) + свой хват поверх (ствол лежит на точке черепа со стороны охранника, руки — IK actors.js).
  // Выстрел главного → actorKill(голова) → рэгдолл (ragdoll.js, режим collapse с повышенным импульсом); остальные добивают в упор, камера летит вместе с головой.
  const HEADR = 0.12;                                   // ствол упирается в череп: расстояние от центра головы
  const GUARDS = [                                      // ang — угол от главного направления; hg/fg — высота хвата над полом и вынос вперёд от ног; lean — наклон корпуса
    { ang: 0, kind: 'pistol', type: 'grunt', lean: 0.55, hg: 1.3, fg: 0.5, side: 0.06, t0: 0 },
    { ang: -0.72, kind: 'rifle', type: 'grunt', lean: 0.34, hg: 1.37, fg: 0.5, side: 0.07, t0: 0.1 },
    { ang: 0.68, kind: 'shotgun', type: 'grunt', lean: 0.34, hg: 1.37, fg: 0.5, side: 0.07, t0: 0.18 },
    { ang: -1.28, kind: 'lmg', type: 'heavy', lean: 0.22, hg: 1.38, fg: 0.5, side: 0.07, t0: 0.26 }
  ];
  const SHOTS = [                                       // dt — от выстрела главного; gi — номер охранника; p — сила
    { dt: 0, gi: 0, p: 1, kill: true }, { dt: 0.1, gi: 1, p: 0.8 }, { dt: 0.19, gi: 2, p: 0.8 }, { dt: 0.27, gi: 3, p: 0.7 },
    { dt: 0.52, gi: 3, p: 0.6 }, { dt: 0.6, gi: 3, p: 0.6 }, { dt: 0.68, gi: 3, p: 0.6 }, { dt: 0.76, gi: 3, p: 0.6 },
    { dt: 1.05, gi: 0, p: 0.9 }                          // добивающий в лежащего
  ];
  function kneelPose(n) {
    n.hips.position.y = 0.55; n.hips.rotation.set(0, 0, 0);
    n.spine.rotation.set(0.5, 0, 0); n.head.rotation.set(-0.38, 0, 0);
    n.armL.rotation.set(0.25, 0, -0.18); n.armR.rotation.set(0.2, 0, 0.18); n.elbL.rotation.x = -0.5; n.elbR.rotation.x = -0.45;
    n.legL.rotation.set(0.1, 0, -0.06); n.legR.rotation.set(0.05, 0, 0.06);
    n.kneeL.rotation.x = n.kneeR.rotation.x = 2.2; n.footL.rotation.x = n.footR.rotation.x = 0.6;
  }
  // false — места мало, вызывающий откатывается к варианту А
  function planExecution(r, S, p, yaw0, yawKill, hasSrc) {
    const T = THREE, A = C.actorGK, n = S.n;
    if (!A || !r.actorStyle || !r.solveArm || !r.npc) return false;
    const meshes = sceneMeshes(r);
    // главное направление: на стрелка, иначе где просторнее
    let by = yaw0, bf = -1;
    const cands = (hasSrc ? [yawKill] : []).concat([0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, Math.PI].map((a) => yaw0 + a));
    for (const y of cands) {
      const f = freeDist(r, S, p.x, 1.2, p.z, y, meshes);
      if (f > bf) { bf = f; by = y; }
      if (f >= 3.4) break;
    }
    if (bf < 2.0) return false;
    // на колени лицом к главному охраннику; голова — точка, куда упрутся стволы
    n.g.rotation.y = by + Math.PI; kneelPose(n); n.g.updateMatrixWorld(true);
    const H = n.head.localToWorld(new T.Vector3(0, 0.13, 0.01));
    const gl = [];
    for (let i = 0; i < GUARDS.length; i += 1) {
      const cfg = GUARDS[i], L = A.GK[cfg.kind].muz[2], y = by + cfg.ang, dx = -Math.sin(y), dz = -Math.cos(y);
      const phi = Math.asin(clamp((cfg.hg - (H.y + 0.02)) / L, -0.9, 0.9)), Dd = HEADR + cfg.fg + L * Math.cos(phi);
      const f = freeDist(r, S, H.x, 1.2, H.z, y, meshes), ex = H.x + dx * Dd, ez = H.z + dz * Dd;
      if (f < Dd + 0.9 || (r.blockedE && r.blockedE(ex, ez))) {
        if (i === 0) { n.g.rotation.y = yaw0 + Math.PI; r.actorReset(n); weaponPose(n); return false; }
        continue;
      }
      const run = clamp(f - Dd - 0.3, 0.6, 2.9);
      gl.push({ cfg, kind: cfg.kind, type: cfg.type, dx, dz, ex, ez, sx: ex + dx * run, sz: ez + dz * run, dur: clamp(run / 4.8, 0.36, 0.62), t0: cfg.t0, fg: cfg.fg, hg: cfg.hg, side: cfg.side, lean: cfg.lean, ry: Math.atan2(-dx, -dz), fireT: -9, arrived: false, n: null });
    }
    gl.forEach((gd) => {
      const gn = r.npc(gd.sx, gd.sz, gd.ry);
      r.actorStyle(gn, gd.type, gd.kind); gn.armT = 1; gn.g.visible = false; gd.n = gn;
      gd.dcFree = () => { r.scene.remove(gn.g); const k = r.npcs.indexOf(gn); if (k >= 0) r.npcs.splice(k, 1); };
    });
    S.T0 = H; S.gyaw = by; S.fdx = -Math.sin(by); S.fdz = -Math.cos(by);
    S.guards = gl; S.mg = gl[0]; S.tShot = 1.7; S.gt = 0; S.jolt = 0; S.flashA = 0; S.killed = false;
    S.q = SHOTS.map((s) => Object.assign({}, s));
    S.v = { p: new T.Vector3(), d: new T.Vector3(), t: new T.Vector3(), h: new T.Vector3(), gh: new T.Vector3(), lk: new T.Vector3(), rh: new T.Vector3(), lh: new T.Vector3(), q: new T.Quaternion(), qs: new T.Quaternion(), m: new T.Matrix4(), zero: new T.Vector3(), up: new T.Vector3(0, 1, 0) };
    S.cam1 = new T.Vector3(H.x - S.fdx * 0.09, H.y, H.z - S.fdz * 0.09);
    S.fl = document.createElement('div');                // белая вспышка выстрелов
    S.fl.style.cssText = 'position:absolute;inset:0;z-index:9;pointer-events:none;background:#fff;opacity:0';
    r.layer.appendChild(S.fl);
    return true;
  }
  // хват: ствол лежит на точке (tx,ty,tz), руки по IK. fk — отдача после выстрела
  function holdGun(r, S, gd, tx, ty, tz, fk) {
    const v = S.v, n = gd.n, g = n.g, G = n.gunG, gk = C.actorGK.GK[gd.kind], SH = C.actorGK.SHOULDER, ry = g.rotation.y, fx = Math.sin(ry), fz = Math.cos(ry);
    n.spine.rotation.x = gd.leanNow - 0.1 * fk; n.head.rotation.x = 0.28;
    n.spine.updateWorldMatrix(true, false);
    v.p.set(g.position.x + fx * gd.fg + fz * gd.side, gd.hg, g.position.z + fz * gd.fg - fx * gd.side);
    v.d.set(tx - v.p.x, ty - v.p.y, tz - v.p.z).normalize();
    if (fk > 0.01) { v.p.addScaledVector(v.d, -0.07 * fk); v.d.y += 0.22 * fk; v.d.normalize(); }
    v.m.lookAt(v.d, v.zero, v.up); v.q.setFromRotationMatrix(v.m);
    G.position.copy(n.spine.worldToLocal(v.p));
    n.spine.getWorldQuaternion(v.qs).invert(); G.quaternion.copy(v.qs).multiply(v.q);
    G.updateMatrix();
    const R = v.rh.set(gk.rH[0], gk.rH[1], gk.rH[2]).applyMatrix4(G.matrix), L = v.lh.set(gk.lH[0], gk.lH[1], gk.lH[2]).applyMatrix4(G.matrix);
    r.solveArm(n.armR, n.elbR, SH[1], R, 1); r.solveArm(n.armL, n.elbL, SH[0], L, -1);
  }
  function guardsFrame(r, S, t) {
    const v = S.v;
    S.guards.forEach((gd) => {
      const n = gd.n, g = n.g;
      if (!g.visible && t >= 0.1) g.visible = true;       // появляются под глитчем первых кадров
      if (!g.visible) return;
      const u = clamp((S.gt - gd.t0) / gd.dur, 0, 1), e = 1 - Math.pow(1 - u, 1.8);
      g.position.set(lerp(gd.sx, gd.ex, e), 0, lerp(gd.sz, gd.ez, e));
      gd.leanNow = lerp(0.2, gd.lean, smooth(u));
      if (u >= 1 && !gd.arrived) {                          // ствол упёрся в череп: клик (у главного — ещё и затвор), толчок камеры
        gd.arrived = true;
        if (gd === S.mg) { r.snd && r.snd.deathClick && r.snd.deathClick(2); S.jolt = Math.max(S.jolt, 0.5); } else if (gd === S.guards[1]) r.snd && r.snd.deathClick && r.snd.deathClick(1);
      }
      // цель ствола: череп со стороны охранника; после выстрела — падающая голова
      v.t.set(S.T0.x + gd.dx * HEADR, S.T0.y + 0.02, S.T0.z + gd.dz * HEADR);
      if (S.killed) { v.h.set(S.h.x + gd.dx * 0.1, S.h.y, S.h.z + gd.dz * 0.1); v.t.lerp(v.h, smooth(clamp((t - S.tKill) / 0.12, 0, 1))); }
      const fk = Math.exp(-(t - gd.fireT) / 0.1);
      holdGun(r, S, gd, v.t.x, v.t.y, v.t.z, t - gd.fireT < 0.5 ? fk : 0);
      if (n.flashM) n.flashM.visible = gd !== S.mg && t - gd.fireT < 0.06; // у главного вспышка у самого объектива — вместо крестика белая вспышка на весь экран
    });
  }
  // красные/тёмные брызги на «объективе»: по режиму крови игры, при «выкл» — не рисуем
  function splat(r, S) {
    r.ensureBlood && r.ensureBlood();
    const mode = r.bloodMode; if (mode !== 'red' && mode !== 'dark') return;
    const col = mode === 'red' ? '118,6,6' : '8,8,8', bl = [], P = (v) => v.toFixed(1);
    const blob = (x, y, w, h, a) => 'radial-gradient(closest-side, rgba(' + col + ',' + a + ') 0 64%, rgba(' + col + ',0) 100%) ' + P(x - w / 2) + '% ' + P(y - h / 2) + '% / ' + P(w) + '% ' + P(h) + '% no-repeat';
    for (let i = 0; i < 5; i += 1) {                      // кляксы: большое пятно + брызги-спутники вокруг и подтёки вниз
      const x = 10 + Math.random() * 80, y = 8 + Math.random() * 62, s = 7 + Math.random() * 9;
      bl.push(blob(x, y, s, s * 1.2, 0.95));
      for (let k = 0; k < 5; k += 1) { const a = Math.random() * 6.28, d = s * (0.6 + Math.random() * 0.9), q = 1 + Math.random() * 3; bl.push(blob(x + Math.cos(a) * d, y + Math.sin(a) * d * 1.1, q, q * 1.2, 0.9)); }
      const dl = 10 + Math.random() * 16, dw = 0.5 + Math.random() * 0.7;
      bl.push('linear-gradient(rgba(' + col + ',.92), rgba(' + col + ',.92)) ' + P(x - dw / 2) + '% ' + P(y) + '% / ' + P(dw) + '% ' + P(dl) + '% no-repeat');
    }
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;inset:0;z-index:7;pointer-events:none;opacity:0;transition:opacity .05s linear, transform 3.2s cubic-bezier(.4,0,1,1);background:' + bl.join(',');
    r.layer.appendChild(d); S.splat = d; void d.offsetWidth;
    d.style.opacity = '1'; d.style.transform = 'translateY(5%)';
  }
  function fire(r, S, sh, t) {
    const gd = S.guards[sh.gi % S.guards.length];
    gd.fireT = t;
    S.jolt = Math.min(1.3, Math.max(S.jolt, sh.p * 0.8)); S.flashA = Math.max(S.flashA, sh.kill ? 0.95 : 0.5 * sh.p);
    r.snd && r.snd.deathShot && r.snd.deathShot(sh.p);
    r.rumble && r.rumble(1, 1, sh.kill ? 220 : 100);
    if (sh.kill) {
      const n = S.n; n.g.visible = true; n.pForce.imp = 6.6;
      r.actorKill(n, true, { x: S.mg.ex, z: S.mg.ez });
      S.D = n.death; S.R = S.D && S.D.rag; S.killed = true; S.tKill = t;
      headPos(S, S.h); S.hs.copy(S.h);
      r.bloodSpray && r.bloodSpray(S.h, { x: -S.fdx, y: 0.15, z: -S.fdz }, 24, 7, true);
      r.layer.classList.add('glitch'); setTimeout(() => r.layer && r.layer.classList.remove('glitch'), 260);
      splat(r, S);
    } else if (S.killed && r.bloodSpray) {
      pelvis(S, S.ps); r.bloodSpray({ x: S.ps.x, y: S.ps.y + 0.1, z: S.ps.z }, { x: -gd.dx, y: 0.5, z: -gd.dz }, 7, 3.5, false);
    }
  }
  function tsC(S, t) {                                    // замедление: бег охранников → тягучая пауза перед выстрелом → выстрел → разгон
    if (t < S.tShot) return lerp(lerp(0.35, 0.85, smooth(clamp(t / 1.0, 0, 1))), 0.16, smooth(clamp((t - (S.tShot - 0.4)) / 0.3, 0, 1)));
    return lerp(0.2, 1, smooth(clamp((t - S.tShot) / 1.9, 0, 1)));
  }
  function frameC(r, S, rdt, dt, t) {
    const v = S.v, cf = S.cf;
    S.gt += dt; S.jolt *= Math.exp(-rdt / 0.12); S.flashA *= Math.exp(-rdt / 0.07);
    while (S.q.length && t >= S.tShot + S.q[0].dt) fire(r, S, S.q.shift(), t);
    guardsFrame(r, S, t);
    S.fl.style.opacity = Math.min(1, S.flashA).toFixed(3);
    const sh = Math.exp(-t / 0.5) * 0.7 + S.jolt, jx = (Math.random() - 0.5) * sh, jy = (Math.random() - 0.5) * sh, jz = (Math.random() - 0.5) * sh;
    S.mg.n.head.getWorldPosition(v.gh); v.gh.y += 0.09;   // лицо главного охранника
    if (!S.killed) {
      // колени: глаза падают с оверкиллом (удар коленями об пол) и замирают на охраннике
      const kk = smooth(clamp(t / 0.45, 0, 1)), tr = 0.004 * smooth(clamp((t - 0.5) / 1, 0, 1));
      cf.pos.set(lerp(S.eye0.x, S.cam1.x, kk), lerp(S.eye0.y, S.cam1.y, kk) - 0.07 * Math.sin(Math.PI * clamp(t / 0.5, 0, 1)), lerp(S.eye0.z, S.cam1.z, kk));
      cf.pos.x += jx * 0.1 + (Math.random() - 0.5) * tr; cf.pos.y += jy * 0.08 + (Math.random() - 0.5) * tr; cf.pos.z += jz * 0.1 + (Math.random() - 0.5) * tr;
      v.t.set(S.T0.x + S.mg.dx * HEADR, S.T0.y + 0.02, S.T0.z + S.mg.dz * HEADR); v.lk.copy(v.gh).lerp(v.t, 0.55); // взгляд между лицом и стволом: видно и ствол у лба, и того, кто держит
      cf.look.copy(S.look0).lerp(v.lk, smooth(clamp(t / 0.55, 0, 1)));
      cf.look.y += Math.sin(t * 1.7) * 0.012 + jy * 0.05;
      cf.roll = S.side * 0.1 * Math.exp(-t / 0.5) + jz * 0.12 + 0.025 * Math.sin(t * 1.1);
      cf.fov = lerp(S.fov0, S.fov0 - 9, smooth(clamp((t - 0.4) / 1.2, 0, 1))) + 5 * S.jolt;
    } else {
      // выстрел: голову швыряет назад (камера на ней), взгляд рывком вверх-вбок и дальше — снизу вверх на охранников
      const tp = t - S.tKill;
      S.hs.lerp(S.h, 1 - Math.exp(-16 * rdt));
      cf.pos.set(S.hs.x - S.fdx * 0.09 + jx * 0.16, Math.max(0.12, S.hs.y + 0.02 + jy * 0.12), S.hs.z - S.fdz * 0.09 + jz * 0.16);
      cf.look.copy(v.gh);
      const wh = Math.exp(-tp / 0.14), wl = Math.exp(-tp / 0.16) * S.side * 0.8;
      cf.look.y += 1.0 * wh; cf.look.x += -S.fdz * wl; cf.look.z += S.fdx * wl;
      cf.roll = S.side * 0.62 * easeOutBack(clamp(tp / 0.9, 0, 1)) + jz * 0.2 + 0.04 * Math.sin(t * 0.8) * smooth(clamp((tp - 1.2) / 1, 0, 1));
      cf.fov = S.fov0 - 9 + 15 * Math.exp(-tp / 0.15) + 5 * smooth(clamp(tp / 1.5, 0, 1));
    }
  }

  // ------------------------------------------------------------------ сцена смерти
  function start(r) {
    const T = THREE, p = r.p, cam = r.camera, S = { t: 0, ended: false, finished: false, res: null };
    const yaw0 = p.yaw, pitch0 = p.pitch;
    const fwd = { x: -Math.sin(yaw0), z: -Math.cos(yaw0) };
    const src = r.lastHurtSrc && Math.hypot(r.lastHurtSrc.x - p.x, r.lastHurtSrc.z - p.z) > 0.3 ? r.lastHurtSrc : null;
    r.lastHurtSrc = null;
    const from = src || { x: p.x + fwd.x * 2, z: p.z + fwd.z * 2 };       // нет источника — упадёт на спину
    const yawKill = src ? Math.atan2(-(src.x - p.x), -(src.z - p.z)) : yaw0;
    const deaths = (r.cb && r.cb.deaths) || 1;
    S.variant = FORCE || ['a', 'b', 'c'][((deaths - 1) % 3 + 3) % 3];
    // направление падения относительно взгляда → сторона крена
    const dx = p.x - from.x, dz = p.z - from.z, dl = Math.hypot(dx, dz) || 1;
    S.side = ((dx / dl) * (-fwd.z) + (dz / dl) * fwd.x) >= 0 ? 1 : -1;
    S.base = { vig: r.fxU ? r.fxU.uVig.value : 0.7 };
    S.n = makeBody(r, yaw0);
    S.n.pForce = { side: S.side };
    if (S.variant === 'c' && !planExecution(r, S, p, yaw0, yawKill, !!src)) S.variant = 'a'; // тесно: охранникам негде встать — обычное падение
    if (S.variant === 'c') { S.n.g.visible = false; S.D = null; S.R = null; }             // тело появится в момент выстрела
    else { r.actorKill(S.n, false, from); S.D = S.n.death; S.R = S.D && S.D.rag; }
    S.i0 = S.variant === 'c' ? 3.2 : T_IRIS0; S.i1 = S.i0 + (T_IRIS1 - T_IRIS0);
    S.cf = r.camFree = { pos: cam.position.clone(), look: new T.Vector3(), fov: cam.fov, roll: 0 };
    const v0 = new T.Vector3(); cam.getWorldDirection(v0); S.cf.look.copy(S.cf.pos).add(v0);
    S.eye0 = S.cf.pos.clone(); S.look0 = S.cf.look.clone();
    S.fov0 = cam.fov; S.ceil = S.variant === 'b' ? ceilingY(r, p.x, p.z) : 0;
    S.h = new T.Vector3(); S.hs = new T.Vector3(); S.ps = new T.Vector3(); S.off0 = new T.Vector3();
    headPos(S, S.h); S.off0.copy(S.cf.pos).sub(S.h); S.hs.copy(S.h); pelvis(S, S.ps);
    S.yawKill = yawKill; S.yaw0 = yaw0; S.pitch0 = pitch0; S.orbit = yaw0 + Math.PI;
    // слой «закрывающихся глаз»
    S.iris = document.createElement('div'); S.iris.className = 'dc-iris'; S.iris.style.setProperty('--r', '130'); r.layer.appendChild(S.iris);
    r.layer.classList.add('dc-on', 'glitch');
    setTimeout(() => r.layer && r.layer.classList.remove('glitch'), 420);
    r.timeScale = 0.35; r.rumble && r.rumble(1, 1, 420);
    // звук: обрыв «плёнкой», тишина, звон, сердце; реплика и треки ограбления тоже обрываются
    C.voice && C.voice.stop(r);
    r.snd && r.snd.deathStart(Object.keys(r.kitTracks || {}).map((k) => r.kitTracks[k].el));
    S.hook = (dt) => frame(r, S, dt);
    r.hooks.push(S.hook);
    return S;
  }
  function headPos(S, out) {
    const R = S.R;
    if (R && R.p) { const o = C.ragdoll.IDX.HD * 3; return out.set(R.p[o], R.p[o + 1], R.p[o + 2]); }
    return S.n.head.getWorldPosition(out);
  }
  function pelvis(S, out) {
    const R = S.R;
    if (R && R.p) return out.set(R.p[0], R.p[1], R.p[2]);
    return S.n.hips.getWorldPosition(out);
  }
  const easeOutBack = (k) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

  // кадр сцены: S.t — реальное время (dt приходит замедленным timeScale, поэтому делим обратно)
  function frame(r, S, dt) {
    if (S.finished) return;
    const rdt = dt / (r.timeScale || 1);
    S.t += rdt; const t = S.t, cf = S.cf, cam = r.camera;
    r.timeScale = S.variant === 'c' ? tsC(S, t) : lerp(0.35, 1, smooth(clamp(t / 0.9, 0, 1)));
    // удар тела об пол: толчок камеры и глухой удар
    if (S.R && S.R.sqHit && !S.hit) { S.hit = t; S.shk2 = clamp((S.R.hitV || 3) / 5, 0.35, 0.8); r.snd && r.snd.deathThud && r.snd.deathThud(); r.rumble && r.rumble(0.9, 0.3, 200); }
    // тряска: затухающий удар в момент смерти + отдельный толчок при падении на пол
    const sh = Math.exp(-t / 0.5) + (S.hit ? S.shk2 * Math.exp(-(t - S.hit) / 0.22) : 0), jerk = Math.exp(-t / 0.1);
    const jx = (Math.random() - 0.5) * sh, jy = (Math.random() - 0.5) * sh, jz = (Math.random() - 0.5) * sh;
    headPos(S, S.h); pelvis(S, S.ps);
    const k = 1 - Math.exp(-16 * rdt);
    if (S.variant === 'c') frameC(r, S, rdt, dt, t);
    else if (S.variant === 'a') {
      // А: камера привязана к голове, начиная ровно с позиции взгляда игрока, и падает вместе с ней
      const off = S.off0.clone().multiplyScalar(1 - smooth(clamp(t / 0.55, 0, 1)));
      let ya = S.yaw0 + wrap(S.yawKill - S.yaw0) * 0.75 * smooth(clamp((t - 0.1) / 1.5, 0, 1));
      // когда тело улеглось (≈0,9 с), взгляд переходит туда, где свободно и нет собственной груди — иначе кадр забит белым
      if (S.lookYaw === undefined && t >= 0.9) S.lookYaw = pickLook(r, S, S.yaw0 + wrap(S.yawKill - S.yaw0) * 0.75);
      if (S.lookYaw !== undefined) ya += wrap(S.lookYaw - ya) * smooth(clamp((t - 0.9) / 1.2, 0, 1));
      const pa = lerp(S.pitch0, 0.06, smooth(clamp((t - 0.05) / 1.2, 0, 1))) + 0.22 * jerk;
      S.hs.lerp(S.h, k);
      cf.pos.set(S.hs.x + off.x - Math.sin(ya) * 0.09, Math.max(0.12, S.hs.y + off.y + 0.02), S.hs.z + off.z - Math.cos(ya) * 0.09);
      cf.pos.x += jx * 0.16; cf.pos.y += jy * 0.12; cf.pos.z += jz * 0.16;
      cf.look.set(cf.pos.x - Math.sin(ya) * Math.cos(pa), cf.pos.y + Math.sin(pa), cf.pos.z - Math.cos(ya) * Math.cos(pa));
      cf.roll = S.side * 1.047 * easeOutBack(clamp((t - 0.12) / 1.15, 0, 1)) + jz * 0.22 + 0.05 * Math.sin(t * 0.9) * smooth(clamp((t - 1.5) / 1, 0, 1));
      cf.fov = lerp(S.fov0, S.fov0 - 6, smooth(clamp(t / 2.5, 0, 1)));
    } else {
      // Б: медленно взлетает вертикально и смотрит на тело сверху, чуть вращаясь вокруг него
      const e = smooth(clamp((t - 0.25) / 4.2, 0, 1)), e2 = e * e * (3 - 2 * e), a = S.orbit + 0.28 * t, rad = 0.25 + 1.5 * e;
      S.hs.lerp(S.ps, 1 - Math.exp(-5 * rdt));
      const px = S.hs.x, pz = S.hs.z;
      cf.pos.set(px + Math.sin(a) * rad + jx * 0.14, lerp(EYE, S.ceil, e2) + jy * 0.1, pz + Math.cos(a) * rad + jz * 0.14);
      cf.look.set(S.ps.x, S.ps.y * 0.5, S.ps.z);
      cf.roll = jz * 0.12 + 0.2 * jerk * S.side + 0.04 * Math.sin(t * 0.8);
      cf.fov = lerp(S.fov0, S.fov0 + 12, e2);
    }
    // сознание гаснет: размытие и обесцвечивание растут, виньетка сжимается кругом
    if (S.variant === 'c') {                                            // до выстрела — резкость (ствол в кадре), после — сознание гаснет
      const tp = clamp((t - S.tShot) / 1.8, 0, 1);
      S.con = Math.max(0.28 * smooth(clamp((t - 0.25) / 1.4, 0, 1)), smooth(tp));
      S.blur = 0.004 + 0.012 * smooth(clamp(t / 1.2, 0, 1)) + 0.03 * smooth(clamp((t - S.tShot) / 1.2, 0, 1)) + 0.05 * S.jolt * 0.5;
    } else {
      S.con = smooth(clamp((t - 0.5) / 3.6, 0, 1));
      S.blur = 0.006 + 0.03 * smooth(clamp((t - 0.15) / 1.3, 0, 1)) + 0.05 * sh * 0.5;
    }
    const kk = clamp((t - S.i0) / (S.i1 - S.i0), 0, 1), ee = kk * kk * (3 - 2 * kk);
    let rr = 130;                                                       // до S.i0 круг шире экрана
    if (kk > 0) rr = lerp(115, -16, ee) + 7 * Math.sin(kk * Math.PI * 5) * (1 - kk); // два-три «моргания» по пути
    S.iris.style.setProperty('--r', rr.toFixed(2));
    if (kk >= 1) S.iris.style.background = '#000';
    if (t >= S.i1 + 0.15 && !S.ended) { S.ended = true; S.res && S.res(); }
  }

  // пост-эффекты: поверх штатных (explosions.js xfPost выставляет uCon/uBlur-по-умолчанию каждый кадр до нас)
  const post0 = Run.prototype.xfPost;
  Run.prototype.xfPost = function () {
    if (post0) post0.call(this);
    const S = this.dcS, U = this.fxU;
    if (!S || !U || S.finished) return;
    U.uCon.value = Math.max(U.uCon.value, S.con || 0);
    U.uVig.value = lerp(S.base.vig, 1.3, S.con || 0);
    const a = this.time * 1.9, m = S.blur || 0;                           // «плывущее» направленное размытие, как при потере сознания
    U.uBlur.value.x += Math.cos(a) * m; U.uBlur.value.y += Math.sin(a * 1.3) * m * 0.6;
  };

  function finish(r, S) {
    S.finished = true;
    const i = r.hooks.indexOf(S.hook); if (i >= 0) r.hooks.splice(i, 1);
    r.dcS = null;
    r.camFree = null; r.prevYaw = undefined; r.blurX = r.blurY = 0; r.timeScale = 1;
    if (r.fxU) { r.fxU.uVig.value = S.base.vig; r.fxU.uCon.value = 0; }
    S.n && S.n.dcFree && S.n.dcFree();
    S.iris && S.iris.remove(); S.fl && S.fl.remove(); S.splat && S.splat.remove();
    S.guards && S.guards.forEach((gd) => gd.dcFree && gd.dcFree());
    r.layer.classList.remove('dc-on', 'glitch');
    r.snd && r.snd.deathStop();
  }

  // ------------------------------------------------------------------ точка входа для combat.js: показывает смерть и возвращает выбор ('retry' | 'skip')
  C.deathcam = {
    // общий хват «ствол в упор» для других сцен (table.js): v — набор векторов из vecs(), gd = { n, kind, fg, hg, side, leanNow }
    vecs() { const T = THREE; return { p: new T.Vector3(), d: new T.Vector3(), t: new T.Vector3(), h: new T.Vector3(), gh: new T.Vector3(), lk: new T.Vector3(), rh: new T.Vector3(), lh: new T.Vector3(), q: new T.Quaternion(), qs: new T.Quaternion(), m: new T.Matrix4(), zero: new T.Vector3(), up: new T.Vector3(0, 1, 0) }; },
    hold(r, v, gd, tx, ty, tz, fk) { holdGun(r, { v }, gd, tx, ty, tz, fk || 0); },
    lensSplat(r) { const o = {}; splat(r, o); return o.splat || null; },
    ok(r) { return !!(r && r.cb && r.camera && r.fxU && window.THREE && !r.disposed); },
    async play(r, offer) {
      let S;
      try { S = start(r); } catch (e) { console.warn('[deathcam]', e); return null; }
      r.dcS = S;
      await new Promise((res) => { S.res = res; S.poll = setInterval(() => { if (r.disposed) res(); }, 250); });
      clearInterval(S.poll);
      if (r.disposed) { finish(r, S); return 'retry'; }
      // чёрный экран + кнопка «Возродиться»
      const end = r.qs('.m-end'), h2 = end.querySelector('h2'), pp = end.querySelector('p');
      h2.textContent = r.deathReason || 'SIGNAL LOST';
      pp.innerHTML = offer ? 'SUBJECT 083<br>SECTOR FAILED ' + offer.fails + ' TIMES IN A ROW<br>SKIP IT?' : 'SUBJECT 083';
      end.classList.add('on');
      const ask = r.askSkip(), pad = !!r.padObj;
      r.qs('.m-retry').textContent = r.touch ? '[RESPAWN]' : pad ? '[A] RESPAWN' : '[ENTER] RESPAWN';
      r.qs('.m-skipsec').style.display = offer ? '' : 'none';
      let pick = await ask;
      r.qs('.m-skipsec').style.display = '';
      if (!offer) pick = 'retry';
      // экран уже чёрный (.m-end непрозрачный): под ним спокойно убираем сцену и готовим плавное появление мира
      const f = r.qs('.m-fade'); f.style.transition = 'none'; f.style.opacity = '1'; void f.offsetWidth;
      finish(r, S);
      pp.innerHTML = 'SUBJECT 083<br>' + (pick === 'skip' ? 'SKIPPING SECTOR...' : 'RECONNECTING TO LAST CHECKPOINT...');
      await r.wait(0.7);
      return pick;
    }
  };
}());
