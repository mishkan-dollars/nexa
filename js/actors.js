// NEXA: стикмены — скелет из капсул, походка/бег/целиться/отшатнуться/упасть, оружие в руках (IK), кровь, выпавшее оружие, гильзы.
// Подключается после combat.js: заменяет Run.prototype.npc / updateNpc (интерфейс n.g, n.yaw, n.goal, n.armT, n.armAng, n.creeping сохранён).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.geo) return;
  const { Run, wrap, lerp, smooth } = C;
  const { merge, m4, sph, cylY } = C.geo;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sgn = () => (Math.random() < 0.5 ? -1 : 1);

  let V = null; // векторы создаются лениво: THREE подгружается позже скрипта
  const tv = () => V || (V = {
    down: new THREE.Vector3(0, -1, 0), a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), u: new THREE.Vector3(), w: new THREE.Vector3(),
    S: new THREE.Vector3(), T: new THREE.Vector3(), E: new THREE.Vector3(), p: new THREE.Vector3(),
    q1: new THREE.Quaternion(), q2: new THREE.Quaternion(), q3: new THREE.Quaternion(), eu: new THREE.Euler()
  });

  // двухзвенный IK: возвращает локоть E. Длины масштабируются, если цель дальше, чем достаёт рука (резиновая рука — без разрывов)
  function ik2(S, T, L1, L2, pole, E) {
    const v = tv(), u = v.u, w = v.w;
    u.subVectors(T, S);
    const d0 = u.length() || 1e-4; u.multiplyScalar(1 / d0);
    const k = Math.max(1, d0 / ((L1 + L2) * 0.995)), l1 = L1 * k, l2 = L2 * k, d = Math.min(d0, (l1 + l2) * 0.995);
    const ca = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
    w.copy(pole).addScaledVector(u, -pole.dot(u));
    if (w.lengthSq() < 1e-6) w.set(0, 0, 1);
    w.normalize();
    E.copy(S).addScaledVector(u, l1 * ca).addScaledVector(w, l1 * sa);
    return k;
  }
  C.ik2 = ik2;

  // ------------------------------------------------------------------ геометрия
  function capsule(r0, r1, len, seg) {
    const T = THREE, hs = Math.max(3, seg >> 1);
    return merge([
      { g: new T.CylinderGeometry(r0, r1, len, seg, 1, true), m: m4(0, -len / 2, 0) },
      { g: new T.SphereGeometry(r0, seg, hs, 0, Math.PI * 2, 0, Math.PI / 2), m: m4(0, 0, 0) },
      { g: new T.SphereGeometry(r1, seg, hs, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m: m4(0, -len, 0) }
    ]);
  }

  function actorGeo(run) {
    if (run.ag) return run.ag;
    const T = THREE, seg = run.q.parts >= 12 ? 8 : 6;
    const chest = merge([cylY(0.17, 0.135, 0.34, 0, 0.25, 0, 1, 0.66, seg), sph(0.17, 0, 0.42, 0, 1, 0.55, 0.66, seg), sph(0.135, 0, 0.08, 0, 1, 0.6, 0.66, seg)]);
    const foot = merge([{ g: new T.BoxGeometry(0.085, 0.06, 0.22), m: m4(0, -0.035, 0.06) }, { g: new T.SphereGeometry(0.045, 6, 4), m: m4(0, -0.035, 0.17, 0, 0, 0, 1.0, 0.7, 0.9) }]);
    run.ag = {
      pelvis: merge([sph(0.15, 0, 0, 0, 1, 0.72, 0.72, seg)]), chest,
      neck: merge([cylY(0.045, 0.052, 0.12, 0, 0.06, 0, 1, 1, 6)]),
      head: merge([sph(0.125, 0, 0.14, 0.005, 1, 1.12, 1.06, seg)]),
      upper: capsule(0.043, 0.034, 0.27, seg), fore: capsule(0.034, 0.027, 0.25, seg), hand: merge([sph(0.046, 0, -0.27, 0.01, 0.82, 1, 1.15, 6)]),
      thigh: capsule(0.068, 0.05, 0.42, seg), shin: capsule(0.05, 0.036, 0.4, seg), foot,
      plate: merge([{ g: new T.BoxGeometry(0.4, 0.34, 0.27), m: m4(0, 0.25, 0.0) }, { g: new T.BoxGeometry(0.1, 0.08, 0.3), m: m4(0.22, 0.46, 0) }, { g: new T.BoxGeometry(0.1, 0.08, 0.3), m: m4(-0.22, 0.46, 0) }]),
      helmet: merge([sph(0.15, 0, 0.17, 0, 1, 0.95, 1.1, seg)]),
      flash: merge([{ g: new T.BoxGeometry(0.16, 0.025, 0.025), m: m4() }, { g: new T.BoxGeometry(0.025, 0.16, 0.025), m: m4() }, { g: new T.BoxGeometry(0.025, 0.025, 0.28), m: m4(0, 0, 0.1) }])
    };
    run.agm = { body: new T.MeshLambertMaterial({ color: 0x050505, emissive: 0x0a0a0a }), gear: new T.MeshLambertMaterial({ color: 0x2c2c2c, emissive: 0x050505 }), gun: new T.MeshLambertMaterial({ color: 0x2e2e2e, emissive: 0x060606 }), flash: new T.MeshBasicMaterial({ color: 0xffffff }) };
    return run.ag;
  }

  const SHOULDER = [[-0.2, 0.46, 0], [0.2, 0.46, 0]];
  const L_UP = 0.27, L_FO = 0.27;
  // руки/оружие врага: позиция хвата и цели кистей в системе оружия (ствол +Z, начало — хват)
  const GK = {
    pistol: { rH: [0, -0.035, -0.005], lH: [-0.03, -0.065, 0.0], muz: [0, 0.02, 0.2] },
    rifle: { rH: [0, -0.05, -0.01], lH: [0, -0.04, 0.34], muz: [0, 0.03, 0.72] },
    shotgun: { rH: [0, -0.05, -0.01], lH: [0, -0.04, 0.4], muz: [0, 0.03, 0.84] },
    lmg: { rH: [0, -0.05, -0.01], lH: [0, -0.04, 0.36], muz: [0, 0.035, 0.8] }
  };
  C.actorGK = { GK, SHOULDER }; // deathcam.js: охранники прижимают ствол к голове игрока — свои позы рук поверх штатных

  // ------------------------------------------------------------------ стиль тела личностей (personas.js кладёт n.ps; без него — PS0, поведение прежнее)
  const PS0 = { lean: 0, gait: 1, rate: 1, bob: 1, sway: 1, twitch: 0, head: 0, flinch: 1, wobble: 0, limp: 0, hip: 0, oneHand: false, idle: null, stomp: 0 };
  const ID = { sx: 0, sy: 0, sz: 0, hx: 0, hy: 0, hz: 0, gx: 0, gy: 0, gz: 0, grx: 0, gry: 0, grz: 0, aw: 0, ax: 0, az: 0, ae: 0 };
  // микро-позы в покое / на патруле: каждая личность по-своему «стоит» (w — насколько враг сейчас в покое и не целится)
  function idlePose(ps, t, w) {
    const I = ID;
    I.sx = I.sy = I.sz = I.hx = I.hy = I.hz = I.gx = I.gy = I.gz = I.grx = I.gry = I.grz = I.aw = I.ax = I.az = I.ae = 0;
    if (!ps.idle || w < 0.02) return I;
    switch (ps.idle) {
      case 'scan': I.hy = Math.sin(t * 0.9) * 0.75 * w; I.hx = Math.sin(t * 0.6) * 0.05 * w; I.sy = Math.sin(t * 0.9) * 0.12 * w; I.gy = Math.sin(t * 0.45) * 0.01 * w; break;
      case 'yawn': { // ленивец: сутулится, раз в 9 с зевает и потягивается, раз в 9 с чешет затылок
        const c = (t % 9) / 9, y = c > 0.78 && c < 0.9 ? Math.sin(Math.PI * (c - 0.78) / 0.12) : 0, sc = c > 0.3 && c < 0.42 ? Math.sin(Math.PI * (c - 0.3) / 0.12) : 0;
        I.sx = -0.14 * y * w; I.hx = (0.18 - 0.4 * y) * w;
        if (y > 0) { I.aw = y * w; I.ax = -2.8; I.az = -0.7; I.ae = -0.3; } else if (sc > 0) { I.aw = sc * w; I.ax = -2.5; I.az = -0.2; I.ae = -1.9; }
        break;
      }
      case 'twirl': I.hz = Math.sin(t * 0.7) * 0.3 * w; I.hx = (0.1 + Math.sin(t * 0.5) * 0.1) * w; I.sy = Math.sin(t * 0.4) * 0.1 * w; I.grz = Math.sin(t * 1.6) * 0.35 * w; I.gy = Math.sin(t * 1.6) * 0.02 * w; break;
      case 'jitter': I.hy = Math.sin(t * 3.1) * Math.sin(t * 1.3) * 0.9 * w; I.hx = Math.sin(t * 4.1) * 0.12 * w; I.sz = Math.sin(t * 2.7) * 0.08 * w; I.sx = Math.sin(t * 5.2) * 0.04 * w; I.gy = Math.sin(t * 6) * 0.015 * w; break;
      case 'rigid': I.sx = 0.05 * w; I.sz = Math.sin(t * 23) * 0.01 * w; break;
      case 'sway': I.sz = Math.sin(t * 0.8) * 0.12 * w; I.hx = (0.2 + Math.sin(t * 0.6) * 0.2) * w; I.hz = Math.sin(t * 0.7) * 0.2 * w; I.sx = Math.sin(t * 0.5) * 0.06 * w; break;
      case 'still': I.hy = Math.sin(t * 0.35) * 0.3 * w; I.hx = Math.sin(t * 0.25) * 0.03 * w; break;
      case 'point': { // офицер: раз в 8 с указывает рукой, куда идти
        const c = (t % 8) / 8, p = c > 0.6 && c < 0.8 ? Math.sin(Math.PI * (c - 0.6) / 0.2) : 0;
        I.hy = Math.sin(t * 0.5) * 0.4 * w + p * 0.3 * w; I.sy = p * 0.1 * w; I.aw = p * w; I.ax = -1.5; I.az = -0.2; I.ae = -0.1;
        break;
      }
      case 'stomp': I.sx = Math.sin(t * 0.9) * 0.04 * w; I.sz = Math.sin(t * 0.45) * 0.05 * w; I.hy = Math.sin(t * 0.3) * 0.25 * w; break;
      case 'tinker': I.hx = 0.32 * w; I.hy = Math.sin(t * 0.6) * 0.2 * w; I.aw = 0.8 * w; I.ax = -1.0 + Math.sin(t * 9) * 0.12; I.az = -0.2; I.ae = -1.2 + Math.sin(t * 9) * 0.1; break;
      default: break;
    }
    return I;
  }

  Run.prototype.npc = function (x, z, yaw) {
    const T = THREE, A = actorGeo(this), M = this.agm.body;
    const g = new T.Group(), mk = (geo, mat, parent, px, py, pz) => { const m = new T.Mesh(geo, mat || M); m.position.set(px || 0, py || 0, pz || 0); (parent || g).add(m); return m; };
    const piv = (parent, px, py, pz) => { const p = new T.Group(); p.position.set(px || 0, py || 0, pz || 0); parent.add(p); return p; };
    const hips = piv(g, 0, 0.95, 0); mk(A.pelvis, M, hips);
    const spine = piv(hips, 0, 0.06, 0); mk(A.chest, M, spine);
    const head = piv(spine, 0, 0.5, 0); mk(A.neck, M, head); mk(A.head, M, head);
    const arm = (s) => {
      const sh = piv(spine, SHOULDER[s][0], SHOULDER[s][1], 0); mk(A.upper, M, sh);
      const el = piv(sh, 0, -L_UP, 0); mk(A.fore, M, el); mk(A.hand, M, el);
      return [sh, el];
    };
    const leg = (s) => {
      const th = piv(hips, s * 0.095, -0.02, 0); mk(A.thigh, M, th);
      const kn = piv(th, 0, -0.42, 0); mk(A.shin, M, kn);
      const ft = piv(kn, 0, -0.4, 0); mk(A.foot, M, ft);
      return [th, kn, ft];
    };
    const [armL, elbL] = arm(0), [armR, elbR] = arm(1), [legL, kneeL, footL] = leg(-1), [legR, kneeR, footR] = leg(1);
    // броня тяжёлых: пластина и шлем
    const gear = piv(spine, 0, 0, 0); gear.visible = false; mk(A.plate, this.agm.gear, gear);
    const helmet = mk(A.helmet, this.agm.gear, head); helmet.visible = false;
    // оружие в руках (создаётся при первом enemy())
    const gunG = piv(spine, 0, 0, 0); gunG.visible = false; gunG.rotation.order = 'XYZ';
    g.position.set(x, 0, z); g.rotation.order = 'YXZ'; g.rotation.y = yaw || 0;
    if (this.q.shadows) g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
    const n = {
      g, head, hips, spine, armL, armR, elbL, elbR, legL, legR, kneeL, kneeR, footL, footR, gear, helmet, gunG, gm: {}, gunKind: null, gunCur: null,
      yaw: yaw || 0, swing: 0, phase: Math.random() * 6, goal: null, tilt: 0, tiltT: 0, arm: 0, armT: 0, watch: false, speedMul: 1, creeping: false,
      vel: 0, lx: x, lz: z, seed: Math.random() * 100, flinch: 0, flinchS: 1, kick: 0, death: null, lean: 0, aimK: 0, charge: false, ik: null
    };
    this.npcs.push(n);
    return n;
  };

  // ------------------------------------------------------------------ оружие в руках врага
  Run.prototype.setGun = function (n, kind) {
    const T = THREE;
    n.gunKind = kind || null;
    n.gunG.visible = !!kind;
    Object.keys(n.gm).forEach((k) => { n.gm[k].visible = k === kind; });
    n.gunCur = null;
    if (!kind) return;
    if (!n.gm[kind]) {
      const eg = this.egeo || (this.egeo = {});
      const geo = eg[kind] || (eg[kind] = C.enemyGunGeo(kind));
      const m = new T.Mesh(geo, this.agm.gun); m.rotation.y = Math.PI; n.gunG.add(m); n.gm[kind] = m;
      if (this.q.shadows) m.castShadow = true;
    }
    n.gm[kind].visible = true; n.gunCur = n.gm[kind];
    if (!n.flashM) {
      n.flashM = new T.Mesh(this.ag.flash, this.agm.flash); n.flashM.visible = false; n.flashM.frustumCulled = false; n.gunG.add(n.flashM);
    }
    const mz = GK[kind].muz; n.flashM.position.set(mz[0], mz[1], mz[2]);
  };
  Run.prototype.actorStyle = function (n, type, gun) {
    const heavy = type === 'heavy' || type === 'boss';
    n.gear.visible = heavy; n.helmet.visible = heavy;
    n.lean = type === 'rusher' ? 0.3 : 0;
    n.charge = type === 'rusher';
    const kind = gun === undefined ? (type === 'heavy' ? 'lmg' : type === 'boss' ? 'rifle' : type === 'grunt' ? (Math.random() < 0.45 ? 'pistol' : 'rifle') : null) : gun;
    this.setGun(n, kind);
    n.speedAnim = 1;
  };
  Run.prototype.actorReset = function (n) {
    n.death = null; n.flinch = 0; n.kick = 0; n.aimK = 0; n.vel = 0; n.swing = 0; n.yr = n.ai = n.ex = n.br = n.mvx = n.mvz = 0; n.pv = undefined; n.lx = n.g.position.x; n.lz = n.g.position.z;
    n.act = null; n.ps = null; n.cv = n.cvT = 0; n.bash = n.rel = n.work = n.gest = n.taunt = n.daze = 0; n.bashKind = null; n.holster = false; n.stk = undefined; if (n.laser) n.laser.visible = false; if (n.helmet) n.helmet.visible = false;
    const g = n.g; g.rotation.x = 0; g.rotation.z = 0; g.position.y = 0;
    n.hips.position.y = 0.95; n.hips.rotation.set(0, 0, 0); n.spine.rotation.set(0, 0, 0); n.head.rotation.set(0, 0, 0);
    [n.armL, n.armR, n.elbL, n.elbR, n.legL, n.legR, n.kneeL, n.kneeR, n.footL, n.footR].forEach((p) => { p.rotation.set(0, 0, 0); });
  };

  // попадание: рывок корпуса, голова назад
  Run.prototype.actorHit = function (n, head, amt) {
    if (n.death) return;
    n.flinch = Math.min(1.4, (head ? 1.3 : 0.7) + (amt || 0) / 120); n.flinchS = sgn();
  };
  // смерть: падение назад / вперёд / набок / с колен. from — точка, откуда пришёл выстрел
  Run.prototype.actorKill = function (n, head, from) {
    if (n.death) return n.death;
    const g = n.g, f = { x: Math.sin(g.rotation.y), z: Math.cos(g.rotation.y) };
    let dot = -1, side = sgn();
    if (from) {
      const dx = g.position.x - from.x, dz = g.position.z - from.z, l = Math.hypot(dx, dz) || 1;
      dot = (dx * f.x + dz * f.z) / l; side = (dx * f.z - dz * f.x) / l > 0 ? 1 : -1;
    }
    let kind = dot < -0.35 ? 'back' : dot > 0.35 ? 'fwd' : 'side';
    if (!head && kind === 'back' && Math.random() < 0.3) kind = 'knees';
    if (head) kind = 'back';
    n.death = { t: 0, kind, head: !!head, side, a1: rnd(0.3, 1), a2: rnd(0.3, 1), k1: rnd(0.2, 0.9), k2: rnd(0.2, 0.9), tilt: rnd(-0.5, 0.5), done: false };
    n.armT = 0; n.creeping = false; n.goal = null; n.flashM && (n.flashM.visible = false);
    return n.death;
  };
  // труп без анимации падения (декорации миссий)
  Run.prototype.actorLay = function (n, kind) {
    const D = this.actorKill(n, false, null);
    D.kind = kind || 'back'; D.t = 2; return D;
  };

  function deathPose(n, D, t) {
    const g = n.g, ph = D.kind;
    const kb = smooth(clamp(t / 0.32, 0, 1));
    const kf = smooth(clamp((t - (ph === 'knees' ? 0.5 : 0.1)) / (ph === 'knees' ? 0.7 : 0.8), 0, 1)), fall = Math.pow(kf, 1.5);
    const settle = smooth(clamp((t - 0.7) / 0.5, 0, 1));
    n.hips.position.y = 0.95 - (ph === 'knees' ? 0.4 : 0.34) * kb * (1 - kf);
    n.spine.rotation.x = (ph === 'back' ? -0.5 : 0.35) * kb * (1 - kf * 0.8);
    n.spine.rotation.z = D.side * 0.2 * kb;
    n.head.rotation.x = (ph === 'back' ? -(D.head ? 0.75 : 0.45) * kb : 0.25 * kb) * (1 - 0.4 * kf);
    n.head.rotation.z = D.tilt * kf;
    g.rotation.x = ph === 'back' ? -Math.PI / 2 * fall : ph === 'fwd' || ph === 'knees' ? Math.PI / 2 * fall : 0;
    g.rotation.z = ph === 'side' ? D.side * Math.PI / 2 * fall : 0;
    g.position.y = 0.11 * kf;
    const kn = ph === 'knees' ? 2.2 : 1.25;
    n.legL.rotation.x = lerp(ph === 'knees' ? 0.1 : -0.55 * kb, D.k1 * 0.3 - 0.1, kf);
    n.legR.rotation.x = lerp(ph === 'knees' ? 0.1 : -0.3 * kb, D.k2 * 0.3 - 0.1, kf);
    n.kneeL.rotation.x = kn * kb * (1 - 0.75 * settle) + D.k1 * 0.4 * kf;
    n.kneeR.rotation.x = kn * kb * (1 - 0.75 * settle) * 0.9 + D.k2 * 0.4 * kf;
    n.legL.rotation.z = -0.1 - 0.18 * D.k1 * kf; n.legR.rotation.z = 0.1 + 0.18 * D.k2 * kf;
    n.footL.rotation.x = n.footR.rotation.x = 0.3 * kf;
    // руки взлетают при попадании, потом раскидываются
    const up = (ph === 'back' ? -1.2 : -0.5) * kb * (1 - kf);
    n.armL.rotation.x = up - 0.2 * kf; n.armR.rotation.x = up * 0.8 - 0.1 * kf;
    n.armL.rotation.z = -(0.25 + 0.95 * D.a1 * kf); n.armR.rotation.z = 0.25 + 0.95 * D.a2 * kf;
    n.elbL.rotation.x = -0.6 * kb * (1 - kf) - 0.3 * D.a1 * kf; n.elbR.rotation.x = -0.6 * kb * (1 - kf) - 0.3 * D.a2 * kf;
    if (t > 0.7 && t < 1.7) { const j = (1.7 - t) * 0.06; n.armL.rotation.x += Math.sin(t * 38) * j; n.armR.rotation.x += Math.sin(t * 33 + 1) * j; n.legL.rotation.x += Math.sin(t * 29) * j * 0.6; }
  }

  function kneeOf(phi, K, s) { // сгибание колена: пик в начале маха + приём веса сразу после касания пяткой
    const c = Math.cos(phi + 0.2);
    return K * (c > 0 ? Math.pow(c, 1.2) : 0) + (Math.sin(phi) > 0 ? 0.22 * s * Math.max(0, -Math.sin(2 * phi)) : 0);
  }
  // ------------------------------------------------------------------ анимация
  Run.prototype.updateNpc = function (n, dt) {
    const g = n.g, v = tv();
    if (n.watch && g.visible && !n.death) n.yaw = this.faceTarget(n, 'player');
    if (n.goal && !n.death) {
      const dx = n.goal.x - g.position.x, dz = n.goal.z - g.position.z, dist = Math.hypot(dx, dz);
      if (dist < 0.06) { const r = n.goal.res; n.goal = null; r && r(); }
      else {
        n.yaw = Math.atan2(dx, dz);
        if (Math.abs(wrap(n.yaw - g.rotation.y)) < 0.9) {
          const st = Math.min(dist, n.goal.speed * dt);
          g.position.x += dx / dist * st; g.position.z += dz / dist * st;
        }
      }
    }
    if (!g.visible) { n.lx = g.position.x; n.lz = g.position.z; return; }
    if (n.death) {
      const D = n.death;
      if (D.done) return;
      D.t += dt; deathPose(n, D, D.t);
      if (D.t >= 1.8) D.done = true;
      return;
    }
    const ddx = g.position.x - n.lx, ddz = g.position.z - n.lz; n.lx = g.position.x; n.lz = g.position.z;
    const spd = dt > 0 ? Math.min(8, Math.hypot(ddx, ddz) / dt) : 0;
    n.vel = lerp(n.vel, spd, 1 - Math.exp(-dt * 10));
    const yaw0 = g.rotation.y;
    g.rotation.y += wrap(n.yaw - g.rotation.y) * (1 - Math.exp(-dt * 7));
    if (dt > 0) {
      n.yr = lerp(n.yr || 0, clamp(wrap(g.rotation.y - yaw0) / dt, -4, 4), 1 - Math.exp(-dt * 6));
      n.ai = lerp(n.ai || 0, n.pv === undefined ? 0 : clamp((n.vel - n.pv) / dt, -6, 6), 1 - Math.exp(-dt * 5)); n.pv = n.vel;
      const km = 1 - Math.exp(-dt * 12); n.mvx = lerp(n.mvx || 0, ddx / dt, km); n.mvz = lerp(n.mvz || 0, ddz / dt, km);
    }
    const ry = g.rotation.y, vf = (ddx * Math.sin(ry) + ddz * Math.cos(ry)) / Math.max(dt, 1e-4);
    const dir = n.vel > 0.5 && vf < -0.35 * n.vel ? -1 : 1;
    n.swing = lerp(n.swing, n.vel > 0.12 ? 1 : 0, 1 - Math.exp(-dt * 9));
    const ps = n.ps || PS0; // стиль тела личности (personas.js); без личности — прежняя походка
    n.phase += dt * n.vel * 4.3 * dir * ps.rate;
    const s = n.swing, ph = n.phase, t = this.time + n.seed;
    const cv = n.cv = lerp(n.cv || 0, n.cvT || 0, 1 - Math.exp(-dt * 9)); // присед в укрытии / на колено
    const lk = clamp((n.vel - 1.8) / 2.6, 0, 1), A = lerp(0.42, 0.85, lk) * clamp(n.vel / 1.3, 0.55, 1) * s * ps.gait * (1 - 0.45 * cv);
    const sl = Math.sin(ph), sr = Math.sin(ph + Math.PI), K = lerp(0.95, 1.7, lk) * s * (1 - 0.5 * cv);
    n.legL.rotation.x = -(sl + 0.1 * Math.sin(2 * ph)) * A * (1 - ps.limp) - 1.05 * cv; n.legR.rotation.x = -(sr + 0.1 * Math.sin(2 * ph)) * A - 0.75 * cv;
    n.kneeL.rotation.x = 0.06 + kneeOf(ph, K, s * (0.4 + 0.6 * lk)) * (1 - ps.limp * 0.4) + 1.95 * cv; n.kneeR.rotation.x = 0.06 + kneeOf(ph + Math.PI, K, s * (0.4 + 0.6 * lk)) + 1.5 * cv;
    n.footL.rotation.x = clamp(-(n.legL.rotation.x + n.kneeL.rotation.x) * 0.6, -0.5 - 0.1 * cv, 0.5); n.footR.rotation.x = clamp(-(n.legR.rotation.x + n.kneeR.rotation.x) * 0.6, -0.5 - 0.1 * cv, 0.5);
    n.legL.rotation.z = n.legR.rotation.z = 0;
    if (ps.stomp && n.vel > 0.6) { // тяжёлая поступь: при каждом шаге камера вздрагивает
      const st = Math.floor(ph / Math.PI);
      if (st !== n.stk) { if (n.stk !== undefined && this.cb && this.p) this.kick(0, 0, 0, ps.stomp * 0.03 * clamp(1 - Math.hypot(g.position.x - this.p.x, g.position.z - this.p.z) / 9, 0, 1)); n.stk = st; }
    }
    // корпус: качка бёдер, наклон вперёд, дыхание в стойке, микро-позы личности в покое
    const id = idlePose(ps, t, (1 - s) * (1 - n.aimK));
    const ex = n.ex = lerp(n.ex || 0, lk * s, 1 - Math.exp(-dt * (lk * s > (n.ex || 0) ? 1.2 : 0.3)));
    n.br = (n.br || 0) + dt * (1.6 + 2.6 * ex);
    const bsn = Math.sin(n.br), breathe = bsn * (0.02 * (1 - s) + 0.03 * ex), sway = Math.sin(t * 0.6) * 0.03 * (1 - s);
    const yr = n.yr || 0, turn = clamp(yr, -3, 3) * clamp(n.vel / 2, 0, 1);
    n.hips.position.y = 0.95 - 0.03 * s * ps.bob + 0.026 * s * ps.bob * Math.cos(2 * ph) - 0.02 * lk * s - (n.crouch || 0) * 0.14 - 0.32 * cv;
    n.hips.position.x = Math.cos(ph) * 0.02 * s * ps.sway + Math.sin(t * 0.45) * 0.008 * (1 - s);
    n.hips.rotation.y = Math.sin(ph) * 0.1 * s; n.hips.rotation.z = Math.cos(ph) * 0.04 * s * ps.sway + sway * 0.4 + ps.wobble * Math.sin(t * 1.9) * 0.08 + ps.limp * Math.sin(ph) * 0.06 * s - turn * 0.04;
    const fl0 = n.flinch; n.flinch = Math.max(0, fl0 - dt * (1.2 + 3.3 * fl0)); const fl = fl0 * ps.flinch;
    n.aimK = lerp(n.aimK, n.armT, 1 - Math.exp(-dt * 7));
    n.arm = n.aimK;
    n.kick = n.kick > 0.003 ? n.kick * Math.exp(-dt * 10) : 0;
    const bs = n.bash > 0 ? Math.sin(Math.PI * n.bash) : 0, kd = n.bashKind, ram = kd === 'ram' ? bs : kd === 'jab' ? bs * 0.3 : 0;
    const sx = n.lean + ps.lean + 0.04 * s + 0.28 * lk * s + clamp((n.ai || 0) * 0.025, -0.1, 0.14) * s + breathe + (n.crouch || 0) * 0.3 + cv * 0.25 - fl * 0.34 - n.kick * 0.1 + id.sx + ram * 0.55 + bs * 0.1;
    n.spine.rotation.set(sx, -Math.sin(ph) * 0.16 * s + (n.gunKind ? -0.18 * n.aimK : 0) + id.sy + turn * 0.05, n.flinchS * fl * 0.12 + ps.wobble * Math.sin(t * 1.3) * 0.1 + id.sz - Math.cos(ph) * 0.02 * s - turn * 0.02);
    if (bs > 0 && kd === 'kick') { n.legR.rotation.x = -1.35 * bs; n.kneeR.rotation.x = 0.06 + 0.25 * bs; n.footR.rotation.x = 0.3 * bs; n.spine.rotation.x -= 0.15 * bs; }
    // голова: микро-повороты в стойке, рывок назад при попадании, тик/тремор личности
    n.tilt = lerp(n.tilt, n.tiltT, 1 - Math.exp(-dt * 4));
    const tw = ps.twitch * Math.sin(t * 27) * Math.sin(t * 5.1);
    n.head.rotation.set(-fl * 0.5 + Math.sin(t * 1.3) * 0.02 - cv * 0.2 + id.hx + tw - sx * 0.35 + bsn * 0.01 * (1 + 2 * ex) + 0.012 * s * Math.cos(2 * ph), Math.sin(t * 0.5) * 0.18 * (1 - n.aimK) * (1 - s) + (n.gunKind ? 0.18 * n.aimK : 0) + id.hy + tw * 0.8 - Math.sin(ph) * 0.05 * s + turn * 0.08, n.tilt + ps.head * (1 - 0.5 * n.aimK) + id.hz - turn * 0.03);
    if (n.gunKind && !n.holster) this.actorArmsGun(n, s, ph, lk, dt, ps, id, t);
    else this.actorArmsFree(n, s, sl, sr, lk, t, fl, ps, id);
    if (n.act) this.actPose(n, dt, t); // interiors.js: поза жильца комнаты (сидит / спит / сдаётся) поверх базовой
  };

  // левая рука без оружия: жесты личностей (указание, дразнение, хватается за голову, потягивание, удар-толчок)
  Run.prototype.leftFree = function (n, id, t, bs) {
    let x = -0.12 + Math.sin(t * 1.1) * 0.03, z = -0.1, e = -0.3;
    const mix = (w, ax, az, ae) => { if (w > 0.01) { x = lerp(x, ax, w); z = lerp(z, az, w); e = lerp(e, ae, w); } };
    mix(id.aw, id.ax, id.az, id.ae);
    mix(n.gest || 0, -1.5, -0.22, -0.08);
    mix(n.taunt || 0, -1.1 + Math.sin(t * 10) * 0.15, -0.55, -1.5 + Math.sin(t * 10) * 0.5);
    mix(n.daze || 0, -2.5, -0.3, -1.9);
    if (bs > 0 && n.bashKind === 'shove') mix(bs, -1.55, 0, -0.2);
    n.armL.rotation.set(x, 0, z); n.elbL.rotation.set(e, 0, 0);
  };

  // свободные руки: размах при ходьбе, поднятие по armT/armAng
  Run.prototype.actorArmsFree = function (n, s, sl, sr, lk, t, fl, ps, id) {
    const A = lerp(0.7, 1.1, lk) * clamp(n.vel / 1.3, 0.5, 1) * s, a = n.aimK, ang = n.armAng || 2.7;
    const idle = 1 - s;
    n.armL.rotation.set(-A * sr * 0.9 + Math.sin(t * 1.1) * 0.03 * idle - (n.charge ? 0.9 * s : 0) + fl * 0.3, 0, -0.07 - 0.03 * idle + Math.sin(t * 0.9) * 0.02 * idle);
    n.armR.rotation.set(-A * sl * 0.9 * (1 - a) - ang * a + Math.sin(t * 1.3 + 2) * 0.03 * idle - (n.charge ? 0.9 * s * (1 - a) : 0) + fl * 0.3, 0, 0.07 + 0.03 * idle - Math.sin(t * 0.7) * 0.02 * idle);
    n.elbL.rotation.set(-(0.18 + 0.2 * s + (0.95 + (n.charge ? 0.4 : 0)) * lk * s) - (n.charge ? 0.5 * s : 0) - 0.22 * Math.max(0, sr) * (0.3 + lk) * s, 0, 0);
    n.elbR.rotation.set(-(0.18 + 0.2 * s + (0.95 + (n.charge ? 0.4 : 0)) * lk * s) * (1 - a) - 0.3 * a - (n.charge ? 0.5 * s * (1 - a) : 0) - 0.22 * Math.max(0, sl) * (0.3 + lk) * s * (1 - a), 0, 0);
    if (n.work > 0) { // техник чинит: обе руки у груди, быстрые мелкие движения
      const w = n.work, k = Math.sin(t * 13);
      n.armR.rotation.set(lerp(n.armR.rotation.x, -1.1, w), 0, 0.1); n.elbR.rotation.set(-1.3 * w + k * 0.25 * w, 0, 0);
      n.armL.rotation.set(lerp(n.armL.rotation.x, -0.9, w), 0, -0.2); n.elbL.rotation.set(-1.2 * w - k * 0.2 * w, 0, 0);
    } else if (id && (n.gest > 0.02 || n.taunt > 0.02 || n.daze > 0.02 || id.aw > 0.02)) this.leftFree(n, id, t, 0);
    n.armL.quaternion.setFromEuler(n.armL.rotation); n.armR.quaternion.setFromEuler(n.armR.rotation);
  };

  // руки с оружием: оружие крепится к корпусу, обе кисти тянутся к хвату и цевью (IK)
  Run.prototype.actorArmsGun = function (n, s, ph, lk, dt, ps, id, t) {
    const v = tv(), gk = GK[n.gunKind], G = n.gunG, pistol = n.gunKind === 'pistol';
    const bs = n.bash > 0 ? Math.sin(Math.PI * n.bash) : 0, kd = n.bashKind;
    let a = smooth(n.aimK) * (1 - (n.daze || 0));
    if (bs > 0 && kd !== 'shove' && kd !== 'kick' && kd !== 'ram') a = Math.max(a, bs * 0.9);
    const bob = Math.sin(2 * ph) * 0.012 * s, kick = n.kick, hp = ps.hip;
    // позиция в корпусе: у бедра («готов») -> у плеча (прицеливание) или у бедра (стрельба от бедра, hip)
    const ty = lerp(pistol ? 0.45 : 0.42, 0.27, hp), tz = lerp(pistol ? 0.42 : 0.34, 0.38, hp), tx = pistol ? 0.06 : 0.1, trx = lerp(-0.04, 0.1, hp);
    G.position.set(lerp(0.15, tx, a) + id.gx, lerp(0.14, ty, a) + bob + id.gy, lerp(0.3, tz, a) - kick * 0.07 + id.gz);
    G.rotation.set(lerp(0.95, trx, a) - kick * 0.16 + id.grx + clamp(n.ai || 0, -4, 4) * 0.012, lerp(0.0, -0.1, a) + id.gry - clamp(n.yr || 0, -3, 3) * 0.035 * (0.5 + a), id.grz);
    if (bs > 0) { // удар оружием: приклад по дуге / тычок стволом
      if (kd === 'bash' || kd === 'wild') { G.rotation.y -= bs * 1.2 * (kd === 'wild' ? Math.sin(t * 40) : 1); G.rotation.x += bs * 0.5; G.position.x -= bs * 0.15; G.position.z += bs * 0.2; }
      else if (kd === 'jab') { G.position.z += bs * 0.45; G.position.y -= bs * 0.04; G.rotation.x -= bs * 0.12; }
    }
    const rel = n.rel > 0;
    if (rel) G.rotation.x += 0.5 * smooth(Math.min(1, n.rel * 4)); // перезарядка: ствол вверх-вбок, левая рука к поясу за магазином
    G.updateMatrix();
    const R = v.T.set(gk.rH[0], gk.rH[1], gk.rH[2]).applyMatrix4(G.matrix), L = v.p.set(gk.lH[0], gk.lH[1], gk.lH[2]).applyMatrix4(G.matrix);
    if (rel) { const w = smooth(Math.min(1, n.rel * 5) * Math.min(1, (1 - n.rel) * 5)); L.set(lerp(L.x, -0.1, w), lerp(L.y, 0.1 + Math.sin(n.rel * 18) * 0.04, w), lerp(L.z, 0.26, w)); }
    this.solveArm(n.armR, n.elbR, SHOULDER[1], R, 1);
    const free = !rel && ((ps.oneHand && (pistol || a < 0.5)) || n.daze > 0.02 || n.gest > 0.02 || n.taunt > 0.02 || (bs > 0 && kd === 'shove'));
    if (free) this.leftFree(n, id, t, bs); else this.solveArm(n.armL, n.elbL, SHOULDER[0], L, -1);
  };
  Run.prototype.solveArm = function (sh, el, S, T, side) {
    const v = tv(), E = v.E;
    v.S.set(S[0], S[1], S[2]);
    v.d.set(side * 0.55, -1, -0.25);
    ik2(v.S, T, L_UP, L_FO, v.d, E);
    v.a.subVectors(E, v.S).normalize();
    sh.quaternion.setFromUnitVectors(v.down, v.a);
    v.b.subVectors(T, E).normalize().applyQuaternion(v.q1.copy(sh.quaternion).invert());
    el.quaternion.setFromUnitVectors(v.down, v.b);
  };

  // ------------------------------------------------------------------ выпавшее оружие
  Run.prototype.dropGun = function (n, from) {
    if (!n.gunCur || !n.gunKind || !this.cb) return;
    const T = THREE, cb = this.cb, v = tv(), gm = n.gunCur;
    cb.drops = cb.drops || [];
    let d = cb.drops.find((q) => !q.live);
    if (!d) { if (cb.drops.length >= 6) return; d = { m: new T.Mesh(gm.geometry, this.agm.gun), v: new T.Vector3(), w: new T.Vector3(), live: false, t: 0 }; this.scene.add(d.m); cb.drops.push(d); }
    d.m.geometry = gm.geometry;
    n.gunG.updateWorldMatrix(true, false); gm.updateWorldMatrix(true, false);
    gm.getWorldPosition(d.m.position); gm.getWorldQuaternion(d.m.quaternion);
    d.m.scale.setScalar(n.g.scale.x);
    d.m.visible = true; d.live = true; d.t = 0; d.rest = false;
    d.v.set(rnd(-1, 1), rnd(1.2, 2.2), rnd(-1, 1)); d.w.set(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6));
    n.gunG.visible = false; n.gunCur = null;
  };
  Run.prototype.updateDrops = function (dt) {
    const cb = this.cb; if (!cb.drops) return;
    for (const d of cb.drops) {
      if (!d.live) continue;
      d.t += dt;
      if (!d.rest) {
        d.v.y -= 9.8 * dt; d.m.position.addScaledVector(d.v, dt);
        d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt; d.m.rotation.z += d.w.z * dt;
        if (d.m.position.y < 0.05) {
          d.m.position.y = 0.05; d.rest = true; d.m.rotation.set(0, d.m.rotation.y, Math.PI / 2 * sgn());
          this.snd && this.snd.play('gundrop', { k: 0.6 });
        }
      }
      if (d.t > 25) { d.live = false; d.m.visible = false; }
    }
  };

  // ------------------------------------------------------------------ кровь
  const BLOOD = { red: { part: 0xa01212, pool: 0x6a0a0a }, dark: { part: 0x161616, pool: 0x0a0a0a } };
  Run.prototype.ensureBlood = function () { if (this.bl === undefined) this.bloodInit(); };
  Run.prototype.bloodInit = function () {
    if (this.bl !== undefined) return; // один раз на миссию (трупы-декорации могли создать слой раньше боя)
    const mode = C.getBlood ? C.getBlood() : 'off';
    this.bloodMode = mode;
    this.layer.classList.remove('blood-red', 'blood-dark', 'blood-off');
    this.layer.classList.add('blood-' + mode);
    if (mode === 'off' || !BLOOD[mode]) { this.bl = null; return; }
    const T = THREE, col = BLOOD[mode], P = this.q.parts;
    const B = this.bl = { parts: [], decals: [], di: 0, gore: -1 };
    const pg = new T.BoxGeometry(0.035, 0.035, 0.035), pm = new T.MeshBasicMaterial({ color: col.part });
    for (let i = 0; i < P * 5; i += 1) { const m = new T.Mesh(pg, pm); m.visible = false; this.scene.add(m); B.parts.push({ m, v: new T.Vector3(), life: 0 }); }
    const dg = new T.CircleGeometry(0.5, 9).rotateX(-Math.PI / 2);
    const dm = new T.MeshBasicMaterial({ color: col.pool, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (let i = 0; i < P * 6; i += 1) { const m = new T.Mesh(dg, dm); m.visible = false; m.renderOrder = 1; this.scene.add(m); B.decals.push({ m, grow: 0, tgt: 0, t: 0 }); }
    B.gore = this.qs('.m-gore');
  };
  Run.prototype.decal = function (x, z, r, grow) {
    const B = this.bl; if (!B) return null;
    const d = B.decals[B.di]; B.di = (B.di + 1) % B.decals.length;
    d.m.visible = true; d.m.position.set(x, 0.018 + (B.di % 6) * 0.0006, z); d.m.rotation.y = Math.random() * 6.28;
    d.tgt = r; d.t = 0; d.grow = grow || 0;
    const e = rnd(0.7, 1.3); d.sx = e; d.sz = 1 / e;
    d.m.scale.set(d.grow ? 0.05 : r * d.sx, 1, d.grow ? 0.05 : r * d.sz);
    return d;
  };
  // брызги в точке попадания
  Run.prototype.bloodHit = function (pt, head, amt, dir) {
    const B = this.bl; if (!B || !pt) return;
    const n = clamp(Math.round(3 + (amt || 20) / 7 + (head ? 6 : 0)), 3, 16), dx = dir ? dir.x : 0, dy = dir ? dir.y : 0, dz = dir ? dir.z : 0;
    let c = 0;
    for (let i = 0; i < B.parts.length && c < n; i += 1) {
      const p = B.parts[i]; if (p.life > 0) continue;
      const fw = Math.random() < 0.6 ? 1 : -0.5, sp = rnd(1.2, 4.2) * (head ? 1.3 : 1);
      p.m.visible = true; p.m.position.set(pt.x + rnd(-0.04, 0.04), pt.y + rnd(-0.04, 0.04), pt.z + rnd(-0.04, 0.04));
      p.v.set(dx * fw * sp + rnd(-1.1, 1.1), dy * fw * sp + rnd(0.3, 2.2), dz * fw * sp + rnd(-1.1, 1.1));
      p.life = rnd(0.5, 1.2); const sc = rnd(0.6, 1.8); p.m.scale.set(sc, sc * rnd(0.7, 1.2), sc);
      c += 1;
    }
    // на ближний пол — капли сразу
    if (pt.y < 1.2 && Math.random() < 0.6) this.decal(pt.x + dx * rnd(0.3, 1.2), pt.z + dz * rnd(0.3, 1.2), rnd(0.07, 0.16));
  };
  // лужа под упавшим телом
  Run.prototype.bloodPool = function (n, head, instant) {
    const B = this.bl; if (!B) return;
    const g = n.g, ry = g.rotation.y, D = n.death, back = D && D.kind === 'back' ? -0.7 : D && D.kind === 'side' ? 0.1 : 0.6;
    const s = g.scale.x, x = g.position.x + Math.sin(ry) * back * s, z = g.position.z + Math.cos(ry) * back * s;
    const gr = instant ? 0 : 1, d = this.decal(x, z, rnd(0.55, 0.85) * s * (head ? 1.15 : 1), gr);
    if (d) { d.delay = 0.7; const d2 = this.decal(x + rnd(-0.3, 0.3), z + rnd(-0.3, 0.3), rnd(0.2, 0.4) * s, gr); if (d2) d2.delay = 1.0; }
    for (let i = 0; i < 4; i += 1) this.decal(g.position.x + rnd(-1, 1), g.position.z + rnd(-1, 1), rnd(0.05, 0.14));
  };
  Run.prototype.updateBlood = function (dt) {
    const B = this.bl, cb = this.cb;
    if (B) {
      for (const p of B.parts) {
        if (p.life <= 0) continue;
        p.life -= dt; p.v.y -= 9.8 * dt; p.m.position.addScaledVector(p.v, dt);
        if (p.m.position.y <= 0.03) { if (Math.random() < 0.5) this.decal(p.m.position.x, p.m.position.z, rnd(0.04, 0.12)); p.life = 0; }
        if (p.life <= 0) p.m.visible = false;
      }
      for (const d of B.decals) {
        if (!d.grow || !d.m.visible) continue;
        d.t += dt; const k = smooth(clamp((d.t - (d.delay || 0)) / (d.dur || 5), 0, 1)), r = 0.05 + (d.tgt - 0.05) * k;
        d.m.scale.set(r * d.sx, 1, r * d.sz);
        if (k >= 1) d.grow = 0;
      }
    }
    if (B && B.gore) { // красные края экрана при ранении
      const low = clamp((0.55 - this.hp / this.maxHp) / 0.4, 0, 1) * 0.7, op = Math.round(Math.max(cb.hurtK * 0.75, low) * 100) / 100;
      if (op !== B.goreOp) { B.goreOp = op; B.gore.style.opacity = String(op); }
    }
  };
  Run.prototype.clearBlood = function () {
    const B = this.bl; if (!B) return;
    B.parts.forEach((p) => { p.life = 0; p.m.visible = false; }); B.decals.forEach((d) => { d.m.visible = false; d.grow = 0; });
  };

  // ------------------------------------------------------------------ гильзы игрока
  Run.prototype.casing = function (shell) {
    const cb = this.cb, rg = this.rg, T = THREE;
    if (!cb || !rg || !this.wp) return;
    cb.casings = cb.casings || [];
    let c = cb.casings.find((q) => !q.live);
    if (!c) {
      if (cb.casings.length >= 10) return;
      c = { m: new T.Mesh(new T.BoxGeometry(0.012, 0.012, 0.035), new T.MeshBasicMaterial({ color: 0xbdbdbd })), v: new T.Vector3(), live: false };
      this.scene.add(c.m); cb.casings.push(c);
    }
    const mdl = rg.models[this.wp.id]; if (!mdl) return;
    const p = rg.v3.set(0.03, 0.03, -0.1); rg.root.localToWorld(p);
    c.m.position.copy(p); c.m.visible = true; c.live = true; c.t = 0; c.snd = false;
    if (shell) c.m.scale.set(2.2, 2.2, 2.2); else c.m.scale.set(1, 1, 1);
    const right = rg.v2.set(1, 0.6, 0.2).applyQuaternion(this.camera.quaternion);
    c.v.copy(right).multiplyScalar(rnd(1.3, 2.4)); c.v.y += rnd(0.8, 1.6);
  };
  Run.prototype.updateCasings = function (dt) {
    const cb = this.cb; if (!cb.casings) return;
    for (const c of cb.casings) {
      if (!c.live) continue;
      c.t += dt; c.v.y -= 9.8 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += dt * 12; c.m.rotation.y += dt * 9;
      if (c.m.position.y < 0.02) {
        c.m.position.y = 0.02;
        if (Math.abs(c.v.y) > 0.8) { c.v.y *= -0.35; c.v.x *= 0.5; c.v.z *= 0.5; if (!c.snd && this.snd) { c.snd = true; this.snd.play('casing', { k: 0.7 }); } } else { c.v.set(0, 0, 0); c.m.rotation.set(0, c.m.rotation.y, Math.PI / 2); }
      }
      if (c.t > 14) { c.live = false; c.m.visible = false; }
    }
  };

  C.actors = { ik2, PS0 };
}());
