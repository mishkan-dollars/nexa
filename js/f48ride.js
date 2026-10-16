// NEXA: миссия 48 — фаза car: ночная поездка к комплексу NEXA (100.8 с под assets/car.m4a).
// Диктор за рулём, девушка рядом, игрок сзади с мешком на голове. Дорога едет вокруг машины (f48road.js), машина стоит в начале координат.
// Единые часы поездки S.rt (секунды трека): дорога, кузов, актёры, камеры, реплики и звук — всё считается от них.
// Весь текст — английский. Отладка: ?m48=car&rt=<сек> (старт с середины), window.__ride (freeze/seek).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.K || !C.f48.PH || !C.f48.mkCar || !C.f48.World || !C.f48.road || !C.f48.woman) return;
  const F = C.f48, K = F.K, PH = F.PH, RD = F.road, { lerp, smooth } = C, PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DIC = 'DICTOR', DUR = RD.DUR;

  // ------------------------------------------------------------------ посадка (система машины: нос −Z, водитель −X)
  const SC = 0.88, HY = 0.55;                                        // масштаб актёров и высота таза в собственной системе
  const HIP = { D: [-0.45, 0.64, 0.19], G: [0.45, 0.64, 0.19], P: [0, 0.65, 1.0] };
  const A1 = 0.42, A2 = 0.4;                                         // бедро, голень

  // нога тянется к точке стопы (система машины); side −1 = legL, 1 = legR; toe — наклон стопы
  function legIK(n, side, tx, ty, tz, toe) {
    const g = n.g, s = g.scale.x, th = side < 0 ? n.legL : n.legR, kn = side < 0 ? n.kneeL : n.kneeR, ft = side < 0 ? n.footL : n.footR;
    const lx = -(tx - g.position.x) / s, ly = (ty - g.position.y) / s, lz = -(tz - g.position.z) / s;
    const dx = lx - side * 0.095, dy = ly - (n.hips.position.y - 0.02), dz = lz;
    let L = Math.hypot(dy, dz); const Lm = A1 + A2 - 0.012; if (L > Lm) L = Lm; if (L < 0.2) L = 0.2;
    const kf = PI - Math.acos(clamp((A1 * A1 + A2 * A2 - L * L) / (2 * A1 * A2), -1, 1));
    const al = Math.acos(clamp((A1 * A1 + L * L - A2 * A2) / (2 * A1 * L), -1, 1)), ph = Math.atan2(dz, -dy), ta = ph + al;
    th.rotation.set(-ta, 0, clamp(dx / Math.max(0.3, L), -0.5, 0.5)); kn.rotation.set(kf, 0, 0); ft.rotation.set(ta - kf + (toe || 0), 0, 0);
  }

  // ------------------------------------------------------------------ реплики поездки: [время, текст, показ, кто]
  const LINES = [
    [4.8, 'Wake up, 083. You slept through the whole city.', 3.2],
    [9.3, 'Do not mind the driving. I like to arrive before I leave.', 3.4],
    [15.45, 'Tonight you are not a man. You are a message.', 3.0],
    [18.6, 'NEXA believes it owns every door in this town.', 2.8],
    [22.75, 'Tonight we open all of them.', 2.0],
    [24.7, 'Red light? Red is a colour for people who have time.', 3.0],
    [30.0, 'Hold on, darling.', 1.8],
    [34.6, 'Rule one: nobody leaves that building calm.', 3.0],
    [38.55, 'Not the guards. Not the clerks. Not the cleaning ladies.', 3.2],
    [41.9, 'Rule two: they remember us. Every face. Every name.', 3.2],
    [48.2, 'Listen to the tunnel, 083. It loves the bass.', 2.6],
    [53.2, 'Look at them. Hundreds of people driving home, believing tomorrow is a promise.', 4.4],
    [59.35, 'We are going to punish them. Slowly. And then all at once.', 3.6],
    [64.6, 'And whatever you hear in there...', 2.2],
    [67.6, 'Whatever they scream at you...', 2.2],
    [70.6, 'Remember.', 1.4],
    [80.8, 'There it is. NEXA Industries.', 2.4],
    [84.2, 'Three floors up. Three down. A vault in the sky.', 3.2],
    [88.75, 'And a man in the basement who owes us an answer.', 3.4],
    [92.4, 'Belt on, 083. Last turn.', 2.0],
    [96.4, 'Not a word of Russian. Not one.', 2.6]
  ];

  PH.car = async function (r, ctx) {
    const W = ctx.W, st = K.st(r), T3 = THREE;
    const Q = new URLSearchParams(location.search), RT0 = clamp(parseFloat(Q.get('rt')) || 0, 0, DUR - 3);
    K.lock(r);
    K.cutFade(r, 1);
    await K.sackFx(r, true, 0.02); K.sackLevel(r, 1);              // мешок на голове — как в конце кабинета
    try { await r.clearEnemies(); } catch (e) { /* нет врагов */ }
    W.enter('road');
    const R = W.R.road, ctl = R.ctl;
    ctl.warm();
    const V = new T3.Vector3(), V2 = new T3.Vector3(), V3 = new T3.Vector3();

    // ---------------------------------------------------------- машина и ворота в конце подъезда
    const car = F.mkCar(); car.name = 'ride-car'; R.g.add(car);
    const gate = (() => {
      const M = new RD.Mk(), g = new T3.Group();
      [-1, 1].forEach((s) => {
        M.b(1.0, 5.2, 1.0, s * 6.6, 2.6, 0, 0x2a2d33); M.b(1.2, 0.3, 1.2, s * 6.6, 5.3, 0, 0x1a1c20);
        M.glow((q) => { q.b(0.5, 0.18, 0.1, s * 6.6, 5.0, 0.56, 0xff3b2a); q.b(0.5, 0.18, 0.1, s * 6.6, 1.2, 0.56, 0xfff2cf); });
        for (let i = 0; i < 4; i += 1) M.b(0.1, 2.6, 0.1, s * (0.6 + i * 1.4), 1.3, 0.1, 0x1b1d22);                                    // створки (пока закрыты)
      });
      M.b(13.4, 0.35, 0.5, 0, 5.3, 0, 0x24272d);                                                                                       // верхняя балка
      for (let i = -6; i <= 6; i += 1) M.b(0.12, 2.6, 0.1, i * 0.9, 1.3, 0.1, 0x16181c);
      M.b(12.4, 0.16, 0.14, 0, 2.62, 0.1, 0x30333a); M.b(12.4, 0.16, 0.14, 0, 0.2, 0.1, 0x30333a);
      for (let i = 0; i < 12; i += 1) M.b(0.55, 0.3, 0.06, -6 + i * 1.1, 2.0, 0.17, i % 2 ? 0xe0b81c : 0x141414, 0, 0, 0.7);     // жёлто-чёрные полосы
      M.b(2.6, 2.4, 2.2, 8.0, 1.2, 0.6, 0x23262c); M.b(2.7, 0.2, 2.3, 8.0, 2.5, 0.6, 0x15171b);                                    // будка охраны
      M.glow((q) => { q.b(1.6, 0.9, 0.05, 8.0, 1.5, -0.52, 0xffd9a0); });
      const grp = M.build({ cull: false }); g.add(grp);
      const sg = RD.signMesh('NEXA INDUSTRIES\nSERVICE ENTRANCE — NO ADMITTANCE', 5.6, 1.2, { bg: '#161719', fg: '#e8c21c', edge: '#e8c21c', px: 80 });
      sg.position.set(0, 4.35, 0.32); g.add(sg);
      [-1, 1].forEach((s) => { const h = RD.halo(0xfff2d0, 5.0, 0.8, true); h.position.set(s * 6.6, 5.5, 0.9); g.add(h); });
      g.position.set(0, 0, -(RD.D_END + 9.5));
      ctl.RG.add(g);
      return g;
    })();

    // ---------------------------------------------------------- актёры
    const d = F.dictor(r, 0, 0, PI);
    const g = await F.woman(r, 0, 0, PI);
    const p = F.playerBody(r, 0, 0, PI);
    await d.ready;
    [d, g, p].forEach((n) => { car.add(n.g); n.g.scale.setScalar(SC); n.g.rotation.y = PI; n.yaw = PI; });
    p.g.visible = false;
    const cab = new T3.PointLight(0xa8bce8, 0.85, 3.4, r.lamps && r.lamps[0] ? r.lamps[0].decay : 2); cab.position.set(0, 1.3, 0.25); car.add(cab);
    const lap = F.mgMesh(); lap.scale.setScalar(0.95); lap.position.set(0.04, 0.78, 0.5); lap.rotation.y = PI; car.add(lap);

    // ---------------------------------------------------------- состояние
    const S = {
      rt: RT0, dead: false, frozen: false, p: null, T: null, ei: 0, car, d, g, p3: p, lat: 0, lon: 0, lag: 0, bump: { x: 0, v: 0 }, hand: 0,
      sh: 0, hd: {}, hg: {}, hp: {}, ph: 0, pull: 0, look: null, dLook: null, gLook: null, pLook: null, glance: 0, t: 0, err: null, rollK: 1, steerA: 0, thr: 0,
      lampDash: null, eyeC: null, viewC: null, watchD: 0, watchG: 0, cdD: 0, cdG: 0, glanceD: 0, glanceG: 0, leanK: 0
    };
    window.__ride = S; st.ride = S;
    // свободный обзор от первого лица (середина поездки): ввод читаем сами, т.к. движок в катсцене глушит мышь
    const FL = S.fl = { on: false, yaw: 0, pitch: 0, cy: 0, cp: 0 };
    const sens = () => { try { return Missions.getSens(); } catch (e) { return 1; } };
    const onMouse = (e) => {
      if (!FL.on || r.paused) return;
      if (document.pointerLockElement !== r.canvas && !(e.buttons & 1)) return;
      let mx = e.movementX || 0, my = e.movementY || 0;
      if (Math.abs(mx) > 450 || Math.abs(my) > 450) return;
      mx = clamp(mx, -160, 160); my = clamp(my, -160, 160);
      FL.yaw -= mx * 0.0022 * sens(); FL.pitch -= my * 0.0022 * sens();
    };
    let tid = null, tlx = 0, tly = 0;
    const onPd = (e) => { if (!FL.on || e.pointerType !== 'touch' || tid !== null) return; tid = e.pointerId; tlx = e.clientX; tly = e.clientY; };
    const onPm = (e) => { if (e.pointerId !== tid || !FL.on) return; FL.yaw -= (e.clientX - tlx) * 0.0045 * sens(); FL.pitch -= (e.clientY - tly) * 0.0045 * sens(); tlx = e.clientX; tly = e.clientY; };
    const onPu = (e) => { if (e.pointerId === tid) tid = null; };
    document.addEventListener('mousemove', onMouse);
    r.layer.addEventListener('pointerdown', onPd); r.layer.addEventListener('pointermove', onPm); r.layer.addEventListener('pointerup', onPu); r.layer.addEventListener('pointercancel', onPu);
    const flOff = () => { document.removeEventListener('mousemove', onMouse); r.layer.removeEventListener('pointerdown', onPd); r.layer.removeEventListener('pointermove', onPm); r.layer.removeEventListener('pointerup', onPu); r.layer.removeEventListener('pointercancel', onPu); };
    S.seek = (t) => { S.rt = clamp(t, 0, DUR); S.ei = EVT.findIndex((e) => e.t > S.rt); if (S.ei < 0) S.ei = EVT.length; };
    S.cond = () => RD.pose(S.rt);

    // ---------------------------------------------------------- звук: ambience салона + трек car.m4a (из динамиков)
    K.amb.set(r, 'cabin', { fade: 0.8, speed: () => RD.vel(S.rt) / 40 });
    const T = S.T = K.track(r, 'car.m4a', { spk: true, dur: DUR, vol: 1.0 });
    T.muffle(RT0 < 5 ? 420 : 7600, 0.05);
    T.play(RT0);

    // ---------------------------------------------------------- события по часам поездки
    const EVT = [];
    const at = (t, fn) => EVT.push({ t, fn });
    LINES.forEach((l) => at(l[0], () => r.say(l[3] || DIC, l[1], l[2])));
    const jolt = (a) => { try { r.cineJolt(a); } catch (e) { /* вне катсцены */ } };
    const kick = (a) => { S.bump.v += a * 3.2; jolt(a * 0.7); };
    at(4.5, () => { S.sackOff = true; T.muffle(7600, 0.18); K.snd(r, 'rustle'); K.sackFx(r, false, 0.7, { rot: -10 }); });                                               // мешок срывают — открывается звук динамиков
    RD.EV.forEach((e) => {
      if (e.junc) return;
      at(e.a, () => { K.amb.pulse(r, 'squeal', 0.4); kick(0.35); });                           // уходим на встречную
      at(e.tp - 1.5, () => K.horn(r, 380 + Math.random() * 60, 0.22, 0.05));                    // Диктор жмёт на клаксон
      at(e.tp - 0.12, () => { K.amb.pulse(r, 'pass', 0.55); kick(0.25); });
      at(e.c, () => { K.amb.pulse(r, 'squeal', 0.35); kick(0.35); });                           // возвращаемся
      if (e.o) {
        at(e.tm - 1.2, () => K.horn(r, 290 + Math.random() * 40, 0.8, 0.09));                  // встречная трубит
        at(e.tm - 0.1, () => { K.amb.pulse(r, 'pass', 1.0); kick(0.7); });
      }
    });
    ctl.traffic.forEach((o) => {
      if (o.cross) { at(o.tm - 0.7, () => K.horn(r, 330 + Math.random() * 90, 0.55, 0.08)); at(o.tm - 0.1, () => { K.amb.pulse(r, 'pass', 0.9); kick(0.45); }); }
      else if (o.onc && !o.des) at(o.tm - 0.08, () => K.amb.pulse(r, 'pass', 0.35));
    });
    at(RD.T_J - 3.2, () => { K.horn(r, 410, 1.1, 0.1); K.amb.pulse(r, 'squeal', 0.5); });
    at(RD.T_J - 0.1, () => { K.amb.pulse(r, 'honk', 0.9); kick(0.9); });
    at(50.3, () => { K.amb.pulse(r, 'boom', 0.8); kick(0.5); });                              // въезд в тоннель
    at(57.5, () => { K.amb.pulse(r, 'boom', 0.6); kick(0.4); });
    for (let t = 69.6; t < 80.2; t += 1.08) at(t, () => { K.amb.pulse(r, 'thunk', 0.6); kick(0.3); });   // стыки моста
    for (let t = 74.9; t < 79.6; t += 0.62) at(t, () => { K.amb.pulse(r, 'squeal', 0.3); jolt(0.4); });    // заносы на мосту
    at(88.0, () => K.amb.pulse(r, 'squeal', 0.5));
    at(93.5, () => { K.amb.pulse(r, 'squeal', 0.8); kick(0.5); });
    at(97.3, () => { K.amb.pulse(r, 'squeal', 1.0); kick(0.6); });
    at(100.2, () => { K.amb.pulse(r, 'thunk', 1.0); kick(1.0); });
    at(71.0, () => { K.title(r, 'REMEMBER', 'NOT A WORD OF RUSSIAN', 3.2); });
    EVT.sort((a, b) => a.t - b.t);
    S.ei = Math.max(0, EVT.findIndex((e) => e.t > RT0)); if (RT0 <= 0) S.ei = 0;
    if (EVT.findIndex((e) => e.t > RT0) < 0) S.ei = EVT.length;

    // ---------------------------------------------------------- кадр: дорога, кузов, колёса, звук, свет, позы
    const spkMats = car.spk.map((q) => q.cone.material);
    const stepWorld = (dt) => {
      const p0 = ctl.update(r, S.rt);
      S.p = p0;
      const spd = clamp(p0.v / 42, 0, 1), lvl = T.on ? T.level() : 0;
      // боковая и продольная перегрузки (сглажены), пружина подпрыгивания
      const lat = clamp(p0.v * p0.om / 9.8, -1.4, 1.4), lon = clamp(p0.a / 9.8, -1, 1);
      S.lat = lerp(S.lat, lat, 1 - Math.exp(-dt * 7)); S.lon = lerp(S.lon, lon, 1 - Math.exp(-dt * 6));
      const b = S.bump; b.v += (-95 * b.x - 11 * b.v) * dt; b.x += b.v * dt; b.x = clamp(b.x, -0.35, 0.35);
      const rough = spd * (Math.sin(S.rt * 41) * 0.0035 + Math.sin(S.rt * 27.3 + 1.2) * 0.003 + Math.sin(S.rt * 13.1) * 0.002) + lvl * lvl * 0.012 * Math.sin(S.rt * 35);
      car.rotation.set(p0.pitch + spd * Math.sin(S.rt * 23.1) * 0.0025 + b.x * 0.05, 0, p0.roll + spd * Math.sin(S.rt * 31.7 + 2) * 0.0022);
      car.position.set(-S.lat * 0.025, rough + b.x * 0.03, 0);
      car.updateMatrixWorld(true);
      // колёса: вращение от скорости, передние поворачивают
      const wa = p0.v * dt / 0.345;
      car.wheels.forEach((h, i) => { h.rotation.order = 'YXZ'; h.rotation.x -= wa; if (i < 2) h.rotation.y = p0.steer * 0.55; });
      car.steer.rotation.order = 'XYZ'; S.steerA = lerp(S.steerA, p0.steer * 4.2, 1 - Math.exp(-dt * 12)); car.steer.rotation.z = S.steerA;
      // динамики: конусы подпрыгивают в такт басу
      car.spk.forEach((q, i) => { q.cone.position.x = q.base - q.side * lvl * 0.014; q.cone.scale.set(1 + lvl * 0.35, 1, 1 + lvl * 0.35); spkMats[i].color.setHex(lvl > 0.45 ? 0x8a8fa0 : 0x3a3d46); });
      S.lvl = lvl;
    };

    // свет: уличный фонарь пролетает вдоль кузова, фары встречных, подсветка приборки
    const lampsUpd = (p0) => {
      const L = r.lamps; if (!L || !L.length) return;
      const dd = RD.dist(S.rt), kind = F.roadKind(Math.floor(dd / RD.LEN));
      const sp = ({ city: 30, junction: 24, industrial: 36, tunIn: 12, tunnel: 12, tunOut: 12, highway: 36, bridge: 20, approach: 30 })[kind] || 30;
      const col = ({ city: 0xffb060, junction: 0xffb060, industrial: 0xffa040, tunIn: 0xffc880, tunnel: 0xffc880, tunOut: 0xffc880, highway: 0xd8e4ff, bridge: 0xd8e4ff, approach: 0xdde8ff })[kind] || 0xffb060;
      const k = Math.round(dd / sp), zr = dd - k * sp;
      L[0].color.setHex(col); L[0].distance = 13; L[0].position.set((k % 2 ? 3.6 : -3.6), 3.6, zr); L[0].intensity = 1.5 * clamp(1 - Math.abs(zr) / (sp * 0.5), 0, 1) + 0.05; L[0].visible = true;
      if (L[1]) { // ближайшая встречная машина
        let best = null, bd = 30;
        for (let i = 0; i < ctl.traffic.length; i += 1) {
          const o = ctl.traffic[i]; if (!(o.onc || o.cross) || !o.g.visible) continue;
          o.g.getWorldPosition(V);
          const dz = Math.abs(V.z + 0.5);
          if (dz < bd && Math.abs(V.x) < 12) { bd = dz; best = V3.copy(V); }
        }
        if (best) { L[1].color.setHex(0xfff0cf); L[1].distance = 11; L[1].position.set(best.x, 1.1, best.z + 1.2); L[1].intensity = 2.2 * clamp(1 - bd / 22, 0, 1); L[1].visible = true; } else L[1].visible = false;
      }
      if (L[2]) { L[2].color.setHex(0x6fa6ff); L[2].distance = 2.6; L[2].position.set(-0.25, 1.06, -0.2); L[2].intensity = 0.55; L[2].visible = true; }
    };

    // ---------------------------------------------------------- позы актёров (после updateNpc)
    const sitBase = (n, hp, bx) => {
      n.g.position.set(hp[0], hp[1] - HY * SC + S.bump.x * 0.018, hp[2]); n.g.rotation.y = PI; n.yaw = PI;
      n.hips.position.y = HY; n.hips.rotation.set(0, 0, 0);
      n.spine.rotation.set((bx || 0) - S.lon * 0.13 + S.bump.x * 0.25, 0, S.lat * 0.2 + S.bump.x * 0.04);
    };
    const poseAll = (dt) => {
      const p0 = S.p, t = S.t, lat = S.lat;
      // -------- Диктор: руки на руле, правая нога на газу, взгляд на дорогу и в зеркало
      const dl = S.glanceD > 0 && S.eyeC ? S.eyeC : (S.dLook || [-0.45, 1.2, -6]);
      sitBase(d, HIP.D, 0.1);
      const thr = clamp(0.55 + p0.a * 0.05, 0.2, 1);
      legIK(d, 1, -0.45, 0.52, -0.55 - thr * 0.03, 0.55 - thr * 0.2); legIK(d, -1, -0.62, 0.47, -0.4, 0.1);
      car.steer.updateWorldMatrix(true, false);
      const rim = (phi, w) => { V.set(Math.cos(phi) * 0.185, Math.sin(phi) * 0.185, 0.02); car.steer.localToWorld(V); return V; };
      let h1 = rim(0.35); F.armTo(r, d, -1, h1.x, h1.y, h1.z); h1 = rim(PI - 0.4); F.armTo(r, d, 1, h1.x, h1.y, h1.z);
      K.headLook(d, dl[0], dl[2], 1, S.hd, dt, -0.03 + S.bump.x * 0.4);
      d.head.rotation.z = -S.lat * 0.1;
      // -------- девушка: вжалась в сиденье, одной рукой упёрлась в панель, другой держится за дверь
      sitBase(g, HIP.G, -0.04);
      legIK(g, 1, 0.38, 0.48, -0.42, 0.3); legIK(g, -1, 0.58, 0.48, -0.4, 0.3);
      F.armTo(r, g, 1, 0.22, 1.0, -0.62 + 0.02 * Math.sin(t * 9.0) * clamp(Math.abs(S.lat), 0, 1)); F.armTo(r, g, -1, 0.84, 0.92, -0.18);
      const gl = S.glanceG > 0 && S.eyeC ? S.eyeC : (S.gLook || [0.45, 1.2, -6]);
      K.headLook(g, gl[0], gl[2], 1, S.hg, dt, -0.02 + S.bump.x * 0.3);
      // -------- игрок: сидит сзади, руки за спиной, голова мотается
      sitBase(p, [HIP.P[0], HIP.P[1], HIP.P[2] - 0.16 * S.leanK], 0.52 * S.leanK);
      legIK(p, 1, 0.3, 0.47, 0.18, 0.2); legIK(p, -1, -0.3, 0.47, 0.18, 0.2);
      p.armL.rotation.set(0.5, 0, -0.28); p.elbL.rotation.set(-0.15, 0, 0); p.armR.rotation.set(0.5, 0, 0.28); p.elbR.rotation.set(-0.15, 0, 0);
      const pl = S.pLook || [0, 1.2, -6];
      K.headLook(p, pl[0], pl[2], 1, S.hp, dt, 0.06 + S.bump.x * 0.5);
      p.head.rotation.z = -S.lat * 0.12; p.head.rotation.x += Math.sin(t * 1.3) * 0.01;
    };

    // ---------------------------------------------------------- главный хук
    const upd = (dt) => {
      if (S.dead || !(dt > 0)) return;
      dt = Math.min(dt, 0.05); S.t += dt;
      try {
        if (!S.frozen) {
          S.rt = Math.min(DUR, S.rt + dt);
          const el = T.el;
          if (T.on && el && !el.paused && !el.ended && el.currentTime > 0.05) { // мягкая привязка к треку
            const er = el.currentTime - S.rt;
            if (Math.abs(er) > 0.5) S.rt = el.currentTime; else S.rt += er * Math.min(1, dt * 2.5);
          }
        }
        stepWorld(dt);
        if (FL.on) {
          try { const pads = navigator.getGamepads ? navigator.getGamepads() : []; for (let i = 0; i < pads.length; i += 1) { const pd = pads[i]; if (!pd || !pd.axes || pd.axes.length < 4) continue; const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v), cv = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.7); FL.yaw -= cv(dz(pd.axes[2])) * 2.4 * dt * sens(); FL.pitch -= cv(dz(pd.axes[3])) * 1.9 * dt * sens(); break; } } catch (e) { /* без геймпада */ }
          FL.yaw = clamp(FL.yaw, -2.3, 2.3); FL.pitch = clamp(FL.pitch, -0.85, 0.9);
          const kk = 1 - Math.exp(-dt * 22); FL.cy = lerp(FL.cy, FL.yaw, kk); FL.cp = lerp(FL.cp, FL.pitch, kk);
          if (S.eyeC && S.viewC) {
            const e0 = S.eyeC, v0 = S.viewC;
            const seen = (hx, hy, hz) => { const dx = hx - e0[0], dy = hy - e0[1], dz = hz - e0[2], L = Math.hypot(dx, dy, dz) || 1; return (dx * v0[0] + dy * v0[1] + dz * v0[2]) / L; };
            S.cdD = Math.max(0, S.cdD - dt); S.cdG = Math.max(0, S.cdG - dt);
            S.watchD = seen(-0.45, 1.22, 0.19) > 0.93 ? S.watchD + dt : Math.max(0, S.watchD - dt * 2);
            S.watchG = seen(0.45, 1.22, 0.19) > 0.93 ? S.watchG + dt : Math.max(0, S.watchG - dt * 2);
            if (S.watchD > 1.3 && S.cdD <= 0) { S.glanceD = 1.4; S.cdD = 5; S.watchD = 0; }
            if (S.watchG > 2.0 && S.cdG <= 0) { S.glanceG = 1.7; S.cdG = 7; S.watchG = 0; }
          }
        }
        S.leanK = lerp(S.leanK, FL.on ? 1 : 0, 1 - Math.exp(-dt * 2.6));
        S.glanceD = Math.max(0, S.glanceD - dt); S.glanceG = Math.max(0, S.glanceG - dt);
        poseAll(dt);
        lampsUpd(S.p);
        while (S.ei < EVT.length && EVT[S.ei].t <= S.rt) { const e = EVT[S.ei]; S.ei += 1; try { e.fn(); } catch (er) { console.error('[f48 ride evt]', er); } }
        S.lag = lerp(S.lag, clamp(S.p.om * 0.5, -0.5, 0.5), 1 - Math.exp(-dt * 3.5));
      } catch (e) { if (!S.err) { S.err = e; console.error('[f48 ride]', e); } }
    };
    const unhook = K.hook(r, upd);
    ctl.update(r, S.rt); stepWorld(0.016); poseAll(0.016); lampsUpd(S.p);

    // ---------------------------------------------------------- камеры
    const shots = [];
    const mk = (t0, dur, o) => {
      if (t0 + dur <= RT0) return;
      const s = K.shot(Object.assign({ push: 0, hand: 0.5, tense: 0.5, dur, to: o.at }, o));
      s.sync = () => Math.max(0, S.rt - t0);
      s.tick = (rr, e, tt) => {
        const cf = rr.camFree;
        if (o.fn) o.fn(rr, cf, e, tt, s);
        if (o.car) { car.localToWorld(cf.pos); car.localToWorld(cf.look); s.roll = car.rotation.z * (o.rollK === undefined ? 1 : o.rollK); }
      };
      shots.push(s);
    };
    // POV игрока: камера в голове (поворот и качка головы — те же, что у актёра)
    const povFn = (rr, cf) => {
      p.head.updateWorldMatrix(true, false);
      V.set(0, 0.16, 0.09); p.head.localToWorld(V); cf.pos.copy(V);
      V2.set(0, 0.16, 3.0); p.head.localToWorld(V2); cf.look.copy(V2);
      rr.shotState.s.roll = -S.lat * 0.04 + car.rotation.z * 0.6;
    };
    const chase = (h, dist, ly, ox) => (rr, cf, e) => {
      const lg = S.lag;
      cf.pos.set(Math.sin(lg) * dist + (ox || 0), h, Math.cos(lg) * dist); cf.look.set(-Math.sin(lg) * 0.6, ly, -1.4);
      rr.shotState.s.roll = lg * 0.25;
    };
    // 1: мешок и пробуждение (0 — 6.3)
    mk(0, 6.3, {
      at: [0, 1.2, 1.0], look: [0, 1.2, -3], fov: 74, hand: 0.4, tense: 0.9, fn: povFn,
      run: () => {
        p.g.visible = false; r.fade(0, RT0 > 0 ? 0.2 : 1.4);
        S.pLook = null;
        if (S.sackOff) { K.sackHide(r); return; }
        K.sackLevel(r, 1);
        const iv = setInterval(() => { if (S.dead || S.sackOff || S.rt > 4.4) { clearInterval(iv); return; } K.sackLevel(r, 0.9 + 0.1 * Math.abs(Math.sin(S.rt * 2.3))); }, 60);
      },
      end: () => { p.g.visible = true; }
    });
    // 2: взгляд с торпеды на лица (6.3 — 10.7)
    mk(6.3, 4.4, { at: [0.04, 1.14, -0.56], to: [-0.02, 1.13, -0.6], look: [0.0, 1.1, 0.6], fov: 80, car: true, hand: 0.5, run: () => { p.g.visible = true; S.dLook = [0.1, 1.2, 1.6]; S.gLook = [-0.45, 1.2, 0.2]; } });
    // 3: погоня сзади-сверху, обгон (10.7 — 15.3)
    mk(10.7, 4.6, { at: [0, 2.3, 7.5], look: [0, 1.0, -2], fov: 56, fn: chase(2.2, 7.8, 0.9, -0.8), hand: 0.7, run: () => { S.dLook = [-0.45, 1.2, -6]; S.gLook = null; } });
    // 4: Диктор крупно с пассажирской стороны (15.3 — 19.0)
    mk(15.3, 3.7, { at: [-0.28, 1.27, -0.62], to: [-0.4, 1.26, -0.56], look: [-0.45, 1.2, 0.2], fov: 38, car: true, hand: 0.6 });
    // 5: низкий передний ракурс, машина летит на камеру (19.0 — 22.6)
    mk(19.0, 3.6, { at: [1.0, 0.7, -6.5], to: [1.4, 0.8, -5.5], look: [0, 0.95, -2], fov: 62, hand: 0.9, tense: 0.9 });
    // 6: девушка (22.6 — 26.0)
    mk(22.6, 3.4, { at: [0.3, 1.27, -0.6], to: [0.4, 1.26, -0.54], look: [0.45, 1.22, 0.2], fov: 40, car: true, hand: 0.7, run: () => { S.gLook = [-0.45, 1.2, -0.3]; } });
    // 7: перекрёсток — широкий вид сзади (26.0 — 29.6)
    mk(26.0, 3.6, { at: [0, 1.8, 6.4], look: [0, 1.0, -4], fov: 62, fn: chase(1.7, 6.6, 1.0, 0), hand: 1.0, tense: 1.0 });
    // 8: вид из салона назад на всех троих (29.6 — 34.4)
    mk(29.6, 4.8, { at: [0.04, 1.12, -0.58], to: [0.0, 1.14, -0.6], look: [0, 1.1, 0.6], fov: 84, car: true, hand: 0.6, run: () => { S.gLook = [-0.45, 1.2, 0.2]; S.dLook = [-0.45, 1.2, -6]; } });
    // 9: колесо и порог сбоку (34.4 — 37.8)
    mk(34.4, 3.4, { at: [3.0, 3.6, 4.4], to: [2.6, 3.4, 3.4], look: [-0.2, 0.9, -1.8], fov: 56, hand: 1.0, tense: 1.0 });
    // 10: Диктор в профиль (37.8 — 41.6)
    mk(37.8, 3.8, { at: [0.12, 1.22, 0.3], to: [0.02, 1.22, 0.16], look: [-0.45, 1.2, 0.04], fov: 58, car: true, hand: 0.6 });
    // 11: вдоль капота (41.6 — 46.0)
    mk(41.6, 4.4, { at: [-1.1, 1.0, -1.6], to: [-0.5, 1.05, -2.4], look: [0, 0.95, -6], fov: 66, car: true, hand: 0.9 });
    // 12: погоня сбоку-сзади (46.0 — 50.6)
    mk(46.0, 4.4, { at: [-3.0, 1.5, 5.2], look: [0, 0.9, -1.5], fov: 52, fn: chase(1.5, 5.4, 0.9, -3.0), hand: 0.9 });
    // 13–16: СВОБОДНЫЙ ОБЗОР от первого лица (50.4 — 70.4): игрок сидит сзади и сам смотрит по сторонам, трек продолжает играть
    mk(50.4, 20, {
      at: [0, 1.2, 1.0], look: [0, 1.2, -3], fov: 76, hand: 0, tense: 0,
      fn: (rr, cf) => {
        p.head.updateWorldMatrix(true, false);
        V.set(0, 0.16, 0.09); p.head.localToWorld(V); cf.pos.copy(V);
        car.worldToLocal(V3.copy(V)); S.eyeC = [V3.x, V3.y, V3.z];
        const cy = FL.cy, cp = FL.cp, cc = Math.cos(cp), dx = -Math.sin(cy) * cc, dy = Math.sin(cp), dz = -Math.cos(cy) * cc;
        S.viewC = [dx, dy, dz];
        V2.set(dx, dy, dz).applyQuaternion(car.quaternion); cf.look.copy(cf.pos).addScaledVector(V2, 6);
        const sh = rr.shotState.s; sh.roll = car.rotation.z * 0.9; sh.fov = 76 + clamp(S.p.v / 42, 0, 1) * 6;
      },
      run: () => { FL.yaw = FL.pitch = FL.cy = FL.cp = 0; FL.on = true; p.g.visible = false; S.eyeC = null; S.viewC = null; try { r.toast('LOOK AROUND', 4.5); } catch (e) { /* без подсказки */ } },
      end: () => { FL.on = false; S.eyeC = null; p.g.visible = true; }
    });
    // 17: мост — низкий передний (69.4 — 73.6)
    mk(70.4, 3.2, { at: [0.0, 0.62, -6.5], to: [0.4, 0.7, -5.8], look: [0, 0.95, -2], fov: 64, hand: 1.0, tense: 1.0 });
    // 18: Диктор крупно, руки на руле (73.6 — 77.4)
    mk(73.6, 3.8, { at: [-0.18, 1.2, -0.66], to: [-0.3, 1.2, -0.6], look: [-0.45, 1.16, 0.2], fov: 44, car: true, hand: 0.9, tense: 1.0 });
    // 19: занос на мосту — сзади (77.4 — 81.0)
    mk(77.4, 3.6, { at: [0, 1.7, 6.0], look: [0, 1.0, -3], fov: 60, fn: chase(1.7, 6.2, 1.0, 0), hand: 1.2, tense: 1.2 });
    // 20: подъезд — вид вперёд из салона (81.0 — 85.6)
    mk(81.0, 4.6, { at: [0.0, 1.17, 0.85], to: [0.0, 1.18, 0.7], look: [0, 1.12, -6], fov: 66, car: true, hand: 0.6 });
    // 21: машина тормозит — сбоку (85.6 — 90.0)
    mk(85.6, 4.4, { at: [3.8, 1.2, -1.0], to: [3.6, 1.2, 1.6], look: [0, 0.95, 0.0], fov: 50, hand: 0.8 });
    // 22: лица на торможении (90.0 — 94.6)
    mk(90.0, 4.6, { at: [0.0, 1.2, -0.62], to: [0.04, 1.2, -0.58], look: [0.0, 1.2, 0.5], fov: 62, car: true, hand: 0.7, tense: 0.9 });
    // 23: ворота (94.6 — 98.4)
    mk(94.6, 3.8, { at: [-1.6, 1.1, -3.8], to: [-1.4, 1.2, -3.0], look: [0, 1.4, -14], fov: 60, car: true, hand: 0.6 });
    // 24: финал — игрок, мешок опускается (98.4 — 100.8)
    mk(98.4, DUR - 98.4 - 0.12, { at: [0.0, 1.2, 1.0], look: [0, 1.2, -3], fov: 66, fn: povFn, hand: 0.6, tense: 0.9, run: () => { p.g.visible = false; K.sackFx(r, true, 1.4); } });

    // ---------------------------------------------------------- сама катсцена
    if (RT0 > 0) { const el = T.el; for (let i = 0; i < 40 && !(el && !el.paused && el.currentTime > RT0 + 0.02); i += 1) await r.wait(0.05); }
    else { const el = T.el; for (let i = 0; i < 50 && !(el && !el.paused && el.currentTime > 0.05); i += 1) await r.wait(0.05); }
    S.rt = Math.max(RT0, T.on && T.el && T.el.currentTime > 0.02 ? T.el.currentTime : RT0);
    if (RT0 > 0) { if (RT0 >= 4.5) { S.sackOff = true; K.sackHide(r); } K.cutFade(r, 0); p.g.visible = RT0 >= 6.3; }
    await r.cinematic(shots);

    // ---------------------------------------------------------- итог (и при пропуске)
    S.dead = true;
    FL.on = false; flOff();
    unhook();
    K.sackLevel(r, 1);
    await r.fade(1, 0.01);
    T.stop(0.2);
    K.amb.set(r, 'none', { fade: 0.4 });
    K.removeAll(r, [d, g, p]);
    try { car.parent && car.parent.remove(car); gate.parent && gate.parent.remove(gate); } catch (e) { /* уже убраны */ }
    r.sub && r.sub.classList.remove('on');
    K.sackHide(r);
    r.lamps.forEach((L) => { L.visible = false; });
    car.remove(cab);
    st.ride = null;
    K.unlock(r);
  };
}());
