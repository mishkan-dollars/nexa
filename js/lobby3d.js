// NEXA/OS: динамический 3D-фон лобби. Три кадра:
//   0 — охрана стоит по бокам на фоне лобби;  1 — охрана маршируют слева направо в слоу-мо;  2 — человек в маске из «Ограбления», сидит на чёрном плане и медленно дышит.
// Камера всегда статична. Головы всех персонажей поворачиваются к курсору, интерфейс лобби смещается за мышью.
// Случайные «лаги» (глитчи из app.js scheduleGlitch) переключают кадр на случайный другой — Lobby3D.glitch().
// THREE подгружается лениво (Missions._core.loadThree); при уходе из лобби (миссия, стол, игра) всё освобождается. ?nolobby3d — выключить.
(function () {
  'use strict';
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrap = (a) => ((a + PI) % TAU + TAU) % TAU - PI;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const QL = {
    LOW:    { pr: 1,    seg: 8,  dust: 36,  aa: false, half: true },
    MEDIUM: { pr: 1.25, seg: 10, dust: 64,  aa: true,  half: false },
    HIGH:   { pr: 1.5,  seg: 14, dust: 100, aa: true,  half: false }
  };
  const CAM_Z = 7.5, CAM_Y = 1.5, LOOK_Y = 1.25;
  const SH = [[-0.2, 0.46, 0], [0.2, 0.46, 0]], L_UP = 0.27, L_FO = 0.27;
  // хват оружия в системе оружия (ствол +Z, начало — хват): правая кисть, левая кисть, дульный срез
  const GK = {
    pistol: { rH: [0, -0.035, -0.005], lH: [-0.03, -0.065, 0.0] },
    rifle:  { rH: [0, -0.05, -0.01],   lH: [0, -0.04, 0.34] },
    lmg:    { rH: [0, -0.05, -0.01],   lH: [0, -0.04, 0.36] }
  };
  const ROWS = [{ z: 2.2, k: 0.8 }, { z: 0.2, k: 0.72 }, { z: -1.8, k: 0.64 }, { z: -3.8, k: 0.56 }]; // охрана по бокам: глубина и доля половины ширины кадра

  const api = { sync() {}, glitch() { return false; }, ready: false, mode: -1 };
  window.Lobby3D = api;

  let want = false, S = null, building = 0, raf = 0, lastT = 0, dispTimer = 0, buildTok = 0, swayEl = null, swayX = 1e9, swayY = 1e9;
  const ptr = { x: 0, y: 0, sx: 0, sy: 0, t: 0 }; // мышь: цель и сглаженное значение (-1..1, y вверх)
  const SWAY = { x: 26, y: 15 };                  // на сколько пикселей уезжает интерфейс при курсоре у края экрана

  const onPtr = (e) => {
    if (e.isPrimary === false) return;
    ptr.x = clamp(e.clientX / Math.max(1, innerWidth) * 2 - 1, -1, 1);
    ptr.y = -clamp(e.clientY / Math.max(1, innerHeight) * 2 - 1, -1, 1);
    ptr.t = performance.now();
  };
  window.addEventListener('pointermove', onPtr, { passive: true });
  window.addEventListener('pointerdown', onPtr, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { ptr.x = 0; ptr.y = 0; });

  // ------------------------------------------------------------------ маска босса (та же, что в heist.js)
  let maskP = null;
  function loadMask() {
    if (maskP) return maskP;
    maskP = (async () => {
      try {
        const C = window.Missions._core, rs = await fetch('assets/models/mask.nxm');
        if (!rs.ok || !C.decodeNXM) return null;
        const parts = C.decodeNXM(await rs.arrayBuffer()), img = await C.loadImage('assets/models/mask.jpg');
        return parts && parts.body && img ? { part: parts.body, img } : null;
      } catch (e) { return null; }
    })();
    return maskP;
  }

  // ------------------------------------------------------------------ служебные: IK руки, холсты-текстуры
  let V = null;
  function vecs(T) {
    return V || (V = { down: new T.Vector3(0, -1, 0), S: new T.Vector3(), E: new T.Vector3(), T: new T.Vector3(), P: new T.Vector3(), d: new T.Vector3(), a: new T.Vector3(), b: new T.Vector3(), q: new T.Quaternion(), q2: new T.Quaternion(), e: new T.Euler() });
  }
  function solveArm(T, a, side, target) {
    const v = vecs(T), sh = side ? a.armR : a.armL, el = side ? a.elbR : a.elbL, sg = side ? 1 : -1, C = window.Missions._core;
    v.S.set(SH[side][0], SH[side][1], SH[side][2]);
    v.d.set(sg * 0.55, -1, -0.25);
    C.ik2(v.S, target, L_UP, L_FO, v.d, v.E);
    v.a.subVectors(v.E, v.S).normalize();
    sh.quaternion.setFromUnitVectors(v.down, v.a);
    v.b.subVectors(target, v.E).normalize().applyQuaternion(v.q.copy(sh.quaternion).invert());
    el.quaternion.setFromUnitVectors(v.down, v.b);
  }
  function canvasTex(T, w, h, draw, rep, aniso) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tx = new T.CanvasTexture(c);
    if (rep) { tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.repeat.set(rep[0], rep[1]); }
    if (aniso) tx.anisotropy = aniso;
    return tx;
  }

  // ------------------------------------------------------------------ сцена
  function createStage(T, qn, mask) {
    const C = window.Missions._core, { merge, m4, sph, cylY } = C.geo;
    const q = QL[qn] || (qn === 'ULTRA' ? QL.HIGH : QL.MEDIUM), seg = q.seg;
    const canvas = document.createElement('canvas');
    const renderer = new T.WebGLRenderer({ canvas, antialias: q.aa, alpha: false });
    renderer.setClearColor(0x000000, 1);
    const maxAn = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(36, 1, 0.1, 90);
    camera.position.set(0, CAM_Y, CAM_Z); camera.lookAt(0, LOOK_Y, 0);
    const disposables = [];
    const keep = (o) => { disposables.push(o); return o; };

    // --- геометрия стикмена (та же форма, что в actors.js)
    const hs = Math.max(3, seg >> 1);
    const capsule = (r0, r1, len) => merge([
      { g: new T.CylinderGeometry(r0, r1, len, seg, 1, true), m: m4(0, -len / 2, 0) },
      { g: new T.SphereGeometry(r0, seg, hs, 0, TAU, 0, PI / 2), m: m4(0, 0, 0) },
      { g: new T.SphereGeometry(r1, seg, hs, 0, TAU, PI / 2, PI / 2), m: m4(0, -len, 0) }
    ]);
    const A = {
      pelvis: merge([sph(0.15, 0, 0, 0, 1, 0.72, 0.72, seg)]),
      chest: merge([cylY(0.17, 0.135, 0.34, 0, 0.25, 0, 1, 0.66, seg), sph(0.17, 0, 0.42, 0, 1, 0.55, 0.66, seg), sph(0.135, 0, 0.08, 0, 1, 0.6, 0.66, seg)]),
      neck: merge([cylY(0.045, 0.052, 0.12, 0, 0.06, 0, 1, 1, 6)]),
      head: merge([sph(0.125, 0, 0.14, 0.005, 1, 1.12, 1.06, seg)]),
      upper: capsule(0.043, 0.034, 0.27), fore: capsule(0.034, 0.027, 0.25), hand: merge([sph(0.046, 0, -0.27, 0.01, 0.82, 1, 1.15, 6)]),
      thigh: capsule(0.068, 0.05, 0.42), shin: capsule(0.05, 0.036, 0.4),
      foot: merge([{ g: new T.BoxGeometry(0.085, 0.06, 0.22), m: m4(0, -0.035, 0.06) }, { g: new T.SphereGeometry(0.045, 6, 4), m: m4(0, -0.035, 0.17, 0, 0, 0, 1.0, 0.7, 0.9) }]),
      plate: merge([{ g: new T.BoxGeometry(0.4, 0.34, 0.27), m: m4(0, 0.25, 0.0) }, { g: new T.BoxGeometry(0.1, 0.08, 0.3), m: m4(0.22, 0.46, 0) }, { g: new T.BoxGeometry(0.1, 0.08, 0.3), m: m4(-0.22, 0.46, 0) }]),
      helmet: merge([sph(0.15, 0, 0.17, 0, 1, 0.95, 1.1, seg)])
    };
    Object.keys(A).forEach((k) => keep(A[k]));
    const gunGeo = {};
    ['rifle', 'lmg', 'pistol'].forEach((k) => { gunGeo[k] = keep(C.enemyGunGeo(k)); });
    const MAT = {
      body: keep(new T.MeshLambertMaterial({ color: 0x050505, emissive: 0x0a0a0a })),
      gear: keep(new T.MeshLambertMaterial({ color: 0x2c2c2c, emissive: 0x050505 })),
      gun: keep(new T.MeshLambertMaterial({ color: 0x2e2e2e, emissive: 0x060606 })),
      chair: keep(new T.MeshLambertMaterial({ color: 0x2a2a2a, emissive: 0x070707 }))
    };

    function makeActor() {
      const g = new T.Group(); g.rotation.order = 'YXZ';
      const mk = (geo, mat, parent, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); (parent || g).add(m); return m; };
      const piv = (parent, x, y, z) => { const p = new T.Group(); p.position.set(x || 0, y || 0, z || 0); parent.add(p); return p; };
      const hips = piv(g, 0, 0.95, 0); mk(A.pelvis, MAT.body, hips);
      const spine = piv(hips, 0, 0.06, 0), chest = mk(A.chest, MAT.body, spine);
      const head = piv(spine, 0, 0.5, 0); mk(A.neck, MAT.body, head); mk(A.head, MAT.body, head);
      const arm = (s) => { const sh = piv(spine, SH[s][0], SH[s][1], 0); mk(A.upper, MAT.body, sh); const el = piv(sh, 0, -L_UP, 0); mk(A.fore, MAT.body, el); mk(A.hand, MAT.body, el); return [sh, el]; };
      const leg = (s) => { const th = piv(hips, s * 0.095, -0.02, 0); mk(A.thigh, MAT.body, th); const kn = piv(th, 0, -0.42, 0); mk(A.shin, MAT.body, kn); const ft = piv(kn, 0, -0.4, 0); mk(A.foot, MAT.body, ft); return [th, kn, ft]; };
      const [armL, elbL] = arm(0), [armR, elbR] = arm(1), [legL, kneeL, footL] = leg(-1), [legR, kneeR, footR] = leg(1);
      const gear = piv(spine, 0, 0, 0); gear.visible = false; mk(A.plate, MAT.gear, gear);
      const helmet = mk(A.helmet, MAT.gear, head); helmet.visible = false;
      const gunG = piv(spine, 0, 0, 0); gunG.rotation.order = 'XYZ';
      const guns = {};
      Object.keys(gunGeo).forEach((k) => { const m = new T.Mesh(gunGeo[k], MAT.gun); m.rotation.y = PI; m.visible = false; gunG.add(m); guns[k] = m; });
      return { g, hips, spine, chest, head, armL, armR, elbL, elbR, legL, legR, kneeL, kneeR, footL, footR, gear, helmet, gunG, guns, kind: 'rifle',
        seed: Math.random() * 100, rate: rnd(3, 6), ly: 0, lp: 0, stance: rnd(0.035, 0.07), yaw: 0, ox: 0, oz: 0, eyeY: 1.65 };
    }
    function setKind(a, kind, heavy) {
      a.kind = kind;
      Object.keys(a.guns).forEach((k) => { a.guns[k].visible = k === kind; });
      a.gear.visible = a.helmet.visible = !!heavy;
    }

    // --- поза: оружие в руках (IK обеих кистей) / оружие в одной руке
    function gunHold(a, px, py, pz, rx, hand) {
      const v = vecs(T), G = a.gunG, gk = GK[a.kind];
      G.position.set(px, py, pz); G.rotation.set(rx, 0, 0); G.updateMatrix();
      if (hand === 'L') { solveArm(T, a, 0, v.T.set(gk.rH[0], gk.rH[1], gk.rH[2]).applyMatrix4(G.matrix)); return; }
      solveArm(T, a, 1, v.T.set(gk.rH[0], gk.rH[1], gk.rH[2]).applyMatrix4(G.matrix));
      solveArm(T, a, 0, v.T.set(gk.lH[0], gk.lH[1], gk.lH[2]).applyMatrix4(G.matrix));
    }
    function poseStand(a, t) {
      const b = Math.sin(t * 1.5 + a.seed), s = Math.sin(t * 0.45 + a.seed * 2);
      a.hips.position.set(s * 0.012, 0.95 + b * 0.003, 0);
      a.hips.rotation.set(0, 0, s * 0.02);
      a.legL.rotation.set(0, 0, -a.stance); a.legR.rotation.set(0, 0, a.stance);
      a.kneeL.rotation.set(0.05, 0, 0); a.kneeR.rotation.set(0.05, 0, 0); a.footL.rotation.set(-0.025, 0, 0); a.footR.rotation.set(-0.025, 0, 0);
      a.spine.rotation.set(0.03 + b * 0.012, a.ly * 0.22, -s * 0.012);
      a.head.rotation.set(-a.lp + Math.sin(t * 1.3 + a.seed) * 0.012, a.ly * 0.72, 0);
      a.chest.scale.set(1 + b * 0.01, 1, 1 + b * 0.015);
      a.spine.updateMatrix();
      gunHold(a, 0.15, 0.14, 0.3, a.kind === 'pistol' ? 0.95 : 0.8);
    }
    function poseMarch(a, ph) {
      const sl = Math.sin(ph), sr = Math.sin(ph + PI), AM = 0.5, K = 1.15;
      a.legL.rotation.set(-sl * AM, 0, 0); a.legR.rotation.set(-sr * AM, 0, 0);
      a.kneeL.rotation.set(0.06 + K * Math.max(0, Math.cos(ph)), 0, 0); a.kneeR.rotation.set(0.06 + K * Math.max(0, -Math.cos(ph)), 0, 0);
      a.footL.rotation.set(clamp(-(a.legL.rotation.x + a.kneeL.rotation.x) * 0.6, -0.5, 0.5), 0, 0);
      a.footR.rotation.set(clamp(-(a.legR.rotation.x + a.kneeR.rotation.x) * 0.6, -0.5, 0.5), 0, 0);
      a.hips.position.set(0, 0.95 - 0.03 + 0.026 * Math.cos(2 * ph), 0);
      a.hips.rotation.set(0, sl * 0.1, sl * 0.04);
      a.spine.rotation.set(0.04, -sl * 0.16 + a.ly * 0.2, 0);
      a.head.rotation.set(-a.lp, a.ly * 0.72, 0);
      a.chest.scale.set(1, 1, 1);
      a.armR.rotation.set(-0.8 * sl * 0.9, 0, 0.07); a.elbR.rotation.set(-0.2, 0, 0);
      gunHold(a, -0.24, 0.14, 0.24, -1.5, 'L'); // винтовка стволом вверх у ближнего (к камере) плеча
    }

    // --- босс на стуле: поза сидя, руки сцеплены между коленями, дыхание
    const boss = makeActor();
    boss.eyeY = 1.1; boss.rate = 3.2;
    setKind(boss, 'rifle', false); boss.guns.rifle.visible = false; boss.gunG.visible = false;
    function poseSit(a, t) {
      const v = vecs(T), br = Math.sin(t * 1.15) * 0.5 + 0.5, lean = 0.34 + br * 0.012;
      a.hips.position.set(0, 0.5, -0.02); a.hips.rotation.set(0, 0, 0);
      a.legL.rotation.set(-1.52, 0, -0.1); a.legR.rotation.set(-1.52, 0, 0.1);
      a.kneeL.rotation.set(1.52, 0, 0); a.kneeR.rotation.set(1.52, 0, 0);
      a.footL.rotation.set(0, -0.12, 0); a.footR.rotation.set(0, 0.12, 0);
      a.spine.rotation.set(lean, a.ly * 0.18, 0);
      a.head.rotation.set(-lean * 0.85 + 0.07 - a.lp, a.ly * 0.75, 0);
      a.head.position.y = 0.5 + br * 0.006;
      a.chest.scale.set(1 + br * 0.05, 1 + br * 0.022, 1 + br * 0.07);
      a.armL.position.y = a.armR.position.y = 0.46 + br * 0.008;
      v.q2.setFromEuler(v.e.set(lean, a.ly * 0.18, 0)).invert();
      [-1, 1].forEach((sg) => {
        v.P.set(sg * 0.035, 0.1, 0.4).sub(v.d.set(0, 0.06, 0)).applyQuaternion(v.q2);
        solveArm(T, a, sg > 0 ? 1 : 0, v.P);
      });
    }

    // --- декорации лобби
    const lobby = new T.Group(); scene.add(lobby);
    const wallTex = keep(canvasTex(T, 256, 256, (c, w, h) => {
      c.fillStyle = '#1a1a1a'; c.fillRect(0, 0, w, h);
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.04)'); gr.addColorStop(1, 'rgba(0,0,0,.25)'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, 3, h); c.fillRect(w / 2, 0, 2, h);
      c.fillStyle = '#101010'; c.fillRect(0, h * 0.72, w, 5);
    }, [30, 1], maxAn));
    const wall = new T.Mesh(new T.PlaneGeometry(60, 4.8), keep(new T.MeshLambertMaterial({ map: wallTex, color: 0xffffff }))); keep(wall.geometry);
    wall.position.set(0, 2.4, -10); lobby.add(wall);
    const floorTex = keep(canvasTex(T, 256, 256, (c, w, h) => {
      c.fillStyle = '#0c0c0c'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2; i += 1) for (let j = 0; j < 2; j += 1) { const g = 20 + ((i * 7 + j * 13) % 3) * 5; c.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')'; c.fillRect(i * 128 + 3, j * 128 + 3, 122, 122); }
      for (let n = 0; n < 700; n += 1) { c.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.05).toFixed(3) + ')'; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    }, [14, 9], maxAn));
    const floor = new T.Mesh(new T.PlaneGeometry(60, 40).rotateX(-PI / 2), keep(new T.MeshLambertMaterial({ map: floorTex, color: 0xffffff }))); keep(floor.geometry);
    floor.position.set(0, 0, -10 + 20); lobby.add(floor);
    const ceil = new T.Mesh(new T.PlaneGeometry(60, 40).rotateX(PI / 2), keep(new T.MeshLambertMaterial({ color: 0x0b0b0b }))); keep(ceil.geometry);
    ceil.position.set(0, 4.8, 10); lobby.add(ceil);
    const glowTex = keep(canvasTex(T, 128, 128, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }));
    const blindsTex = keep(canvasTex(T, 128, 256, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f2f2f2'); g.addColorStop(1, '#8c8c8c'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(40,40,40,.55)'; for (let y = 4; y < h; y += 9) c.fillRect(0, y, w, 2);
      c.fillStyle = '#2a2a2a'; c.fillRect(w / 2 - 2, 0, 4, h); c.fillRect(0, 0, w, 5); c.fillRect(0, h - 5, w, 5);
    }));
    const basic = (color, extra) => keep(new T.MeshBasicMaterial(Object.assign({ color }, extra || {})));
    const winGeo = keep(new T.PlaneGeometry(1, 4.1)), wins = [];
    [-1, 1].forEach((sg) => {
      const w = new T.Mesh(winGeo, keep(new T.MeshBasicMaterial({ map: blindsTex, color: new T.Color(0.78, 0.78, 0.78) }))); w.position.set(sg * 6, 2.45, -9.94); w.userData.sg = sg; lobby.add(w); wins.push(w);
    });
    const box = keep(new T.BoxGeometry(1, 1, 1)), cols = [];
    const colMat = keep(new T.MeshLambertMaterial({ color: 0x242424, emissive: 0x050505 })), stripMat = basic(new T.Color(0.62, 0.62, 0.62));
    [-1, 1].forEach((sg) => [0.36, 0.97].forEach((f) => {
      const c = new T.Mesh(box, colMat); c.scale.set(0.85, 4.8, 0.85); c.position.set(sg * 3, 2.4, -8.6); c.userData = { sg, f };
      const st = new T.Mesh(box, stripMat); st.scale.set(0.05, 4.2, 0.02); st.position.set(0, 0, 0.44); c.add(st);
      lobby.add(c); cols.push(c);
    }));
    const desk = new T.Mesh(box, keep(new T.MeshLambertMaterial({ color: 0x151515, emissive: 0x040404 }))); desk.scale.set(6.4, 1.1, 1.2); desk.position.set(0, 0.55, -7.4); lobby.add(desk);
    const deskTop = new T.Mesh(box, stripMat); deskTop.scale.set(6.4, 0.04, 0.08); deskTop.position.set(0, 1.12, -6.84); lobby.add(deskTop);
    const signTex = keep(canvasTex(T, 1024, 256, (c, w, h) => {
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '700 150px "Space Mono","Courier New",monospace'; c.fillStyle = '#e4e4e4'; c.fillText('N E X A', w / 2, h * 0.42);
      c.font = '400 38px "Space Mono","Courier New",monospace'; c.fillStyle = '#9a9a9a'; c.fillText('I N D U S T R I E S', w / 2, h * 0.82);
    }));
    const sign = new T.Mesh(keep(new T.PlaneGeometry(5.6, 1.4)), keep(new T.MeshBasicMaterial({ map: signTex, transparent: true, color: new T.Color(0.26, 0.26, 0.26), depthWrite: false })));
    sign.position.set(0, 3.7, -9.9); sign.scale.setScalar(0.8); lobby.add(sign);
    const lampMat = basic(new T.Color(1, 1, 1)), poolMat = keep(new T.MeshBasicMaterial({ map: glowTex, color: 0x6a6a6a, transparent: true, blending: T.AdditiveBlending, depthWrite: false })), poolGeo = keep(new T.PlaneGeometry(5, 5).rotateX(-PI / 2));
    [-1, 0, 1].forEach((sx) => [-8.4, -5.2, -2.0].forEach((z) => {
      const l = new T.Mesh(box, lampMat); l.scale.set(1.3, 0.04, 2.4); l.position.set(sx * 3.4, 4.77, z); lobby.add(l);
      const p = new T.Mesh(poolGeo, poolMat); p.position.set(sx * 3.4, 0.012, z); lobby.add(p);
    }));

    // --- кадр 2: чёрный план, стул, свет сверху (колонна света + пятно на полу + мягкое свечение сзади)
    const bossG = new T.Group(); bossG.scale.setScalar(1.25); scene.add(bossG); bossG.add(boss.g);
    const seat = new T.Mesh(box, MAT.chair); seat.scale.set(0.58, 0.07, 0.58); seat.position.set(0, 0.425, 0.02); bossG.add(seat);
    const back = new T.Mesh(box, MAT.chair); back.scale.set(0.58, 0.82, 0.07); back.position.set(0, 0.86, -0.3); back.rotation.x = -0.1; bossG.add(back);
    [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.28], [0.26, 0.28]].forEach((p) => { const l = new T.Mesh(box, MAT.chair); l.scale.set(0.045, 0.4, 0.045); l.position.set(p[0], 0.2, p[1]); bossG.add(l); });
    [-1, 1].forEach((sg) => { const r = new T.Mesh(box, MAT.chair); r.scale.set(0.05, 0.05, 0.5); r.position.set(sg * 0.31, 0.72, 0.02); bossG.add(r); const rl = new T.Mesh(box, MAT.chair); rl.scale.set(0.045, 0.3, 0.045); rl.position.set(sg * 0.31, 0.56, -0.12); bossG.add(rl); });
    const backGlow = new T.Mesh(keep(new T.PlaneGeometry(9, 9)), keep(new T.MeshBasicMaterial({ map: glowTex, color: 0x4a4a4a, transparent: true, depthWrite: false }))); backGlow.position.set(0, 1.5, -2.4); bossG.add(backGlow);
    const pool = new T.Mesh(keep(new T.PlaneGeometry(4.6, 4.6).rotateX(-PI / 2)), keep(new T.MeshBasicMaterial({ map: glowTex, color: 0x8a8a8a, transparent: true, blending: T.AdditiveBlending, depthWrite: false }))); pool.position.set(0, 0.012, 0.1); bossG.add(pool);
    const coneTex = keep(canvasTex(T, 4, 128, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }));
    const cone = new T.Mesh(keep(new T.CylinderGeometry(0.25, 1.5, 5.4, 28, 1, true)), keep(new T.MeshBasicMaterial({ map: coneTex, color: 0x777777, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }))); cone.position.set(0, 2.7, 0.1); bossG.add(cone);
    // маска: тот же меш, что у босса в «Ограблении»
    {
      const mat = keep(new T.MeshBasicMaterial({ color: new T.Color(2.3, 2.3, 2.3), side: T.DoubleSide }));
      let mesh;
      if (mask) {
        const p = mask.part, geo = keep(new T.BufferGeometry()), tex = keep(new T.Texture(mask.img));
        tex.needsUpdate = true; mat.map = tex;
        geo.setAttribute('position', new T.BufferAttribute(p.pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(p.nor, 3));
        geo.setAttribute('uv', new T.BufferAttribute(p.uv, 2)); geo.setIndex(new T.BufferAttribute(p.idx, 1));
        mesh = new T.Mesh(geo, mat); mesh.scale.setScalar(1.2); mesh.position.set(0, 0.14, 0.075);
      } else {
        mat.color.setRGB(0.78, 0.78, 0.78);
        mesh = new T.Mesh(box, mat); mesh.scale.set(0.2, 0.27, 0.05); mesh.position.set(0, 0.14, 0.135);
      }
      mesh.frustumCulled = false; boss.head.add(mesh);
    }

    // --- экипаж: 8 стикменов, в кадрах 0 и 1 стоят/идут
    const crew = [];
    for (let i = 0; i < 8; i += 1) { const a = makeActor(); scene.add(a.g); crew.push(a); }

    // --- пыль в воздухе
    const dn = q.dust, dpos = new Float32Array(dn * 3), dvy = new Float32Array(dn), dph = new Float32Array(dn);
    for (let i = 0; i < dn; i += 1) { dpos[i * 3] = rnd(-7, 7); dpos[i * 3 + 1] = rnd(0, 4.6); dpos[i * 3 + 2] = rnd(-5, 5); dvy[i] = rnd(0.02, 0.07); dph[i] = rnd(0, TAU); }
    const dgeo = keep(new T.BufferGeometry()); dgeo.setAttribute('position', new T.BufferAttribute(dpos, 3));
    const dust = new T.Points(dgeo, keep(new T.PointsMaterial({ size: 0.045, color: 0xbbbbbb, transparent: true, opacity: 0.4, depthWrite: false }))); dust.frustumCulled = false; scene.add(dust);

    // --- свет: число источников постоянно (иначе пересборка шейдеров при смене кадра), меняется только сила
    const amb = new T.AmbientLight(0x262626, 1), key = new T.DirectionalLight(0xffffff, 0.5), rim = new T.DirectionalLight(0xbfc8d0, 0.4);
    key.position.set(-3, 5, 6); rim.position.set(2, 3, -6);
    scene.add(amb, key, rim, key.target, rim.target);
    scene.fog = new T.FogExp2(0x050505, 0.03);

    // --- пост-проход: глитч-переход (рендер в текстуру → блоки, RGB-сдвиг, шум)
    const rt = new T.WebGLRenderTarget(4, 4, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: true });
    const pm = new T.ShaderMaterial({
      uniforms: { tDiffuse: { value: rt.texture }, uAmt: { value: 0 }, uTime: { value: 0 }, uSeed: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float uAmt, uTime, uSeed; varying vec2 vUv;\n' +
        'float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
        'void main(){\n' +
        '  vec2 uv = vUv; float st = floor(uTime * 18.0);\n' +
        '  float bands = 14.0 + 22.0 * h(vec2(st, uSeed)); float by = floor(uv.y * bands);\n' +
        '  float on = step(1.0 - 0.55 * uAmt, h(vec2(by, st + uSeed)));\n' +
        '  uv.x += on * (h(vec2(by + 3.1, st)) - 0.5) * 0.28 * uAmt;\n' +
        '  vec2 bl = floor(uv * vec2(8.0, 6.0));\n' +
        '  uv.x += step(1.0 - 0.18 * uAmt, h(bl + st)) * (h(bl + 7.7) - 0.5) * 0.2 * uAmt;\n' +
        '  float sp = 0.012 * uAmt * (0.5 + h(vec2(st, 2.0)));\n' +
        '  vec3 col = vec3(texture2D(tDiffuse, uv + vec2(sp, 0.0)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - vec2(sp, 0.0)).b);\n' +
        '  col += (h(uv * vec2(900.0, 520.0) + st) - 0.5) * 0.24 * uAmt;\n' +
        '  float ln = step(1.0 - 0.08 * uAmt, h(vec2(floor(uv.y * 240.0), st)));\n' +
        '  col = mix(col, vec3(dot(col, vec3(0.33)) + 0.25), ln * 0.8);\n' +
        '  col += uAmt * uAmt * 0.06;\n' +
        '  gl_FragColor = vec4(col, 1.0);\n}',
      depthTest: false, depthWrite: false
    });
    const postScene = new T.Scene(), postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const postMesh = new T.Mesh(keep(new T.PlaneGeometry(2, 2)), pm); postMesh.frustumCulled = false; postScene.add(postMesh);
    keep(pm); keep(rt);

    // ------------------------------------------------------------ состояние и раскладка
    const st = { mode: 0, t: 0, travel: 0, ph: 0, gl: null, again: 0, w: 2, h: 2, asp: 1, tanV: 0.325, side: 1, acc: 0, frame: 0, tgt: new T.Vector3(0, 1.5, 4.3), alive: true };
    const hwAt = (z) => st.tanV * st.asp * (CAM_Z - z);
    const modeSet = [
      { amb: 1.0, key: 0.5, rim: 0.4, fog: 0.03, fogc: 0x050505 },
      { amb: 1.0, key: 0.5, rim: 0.4, fog: 0.03, fogc: 0x050505 },
      { amb: 0.35, key: 1.0, rim: 0.55, fog: 0.012, fogc: 0x000000 }
    ];

    function resize() {
      const w = Math.max(2, innerWidth), h = Math.max(2, innerHeight), pr = Math.min(window.devicePixelRatio || 1, q.pr);
      st.w = w; st.h = h; st.asp = w / h;
      st.tanV = st.asp >= 1.2 ? Math.tan(18 * PI / 180) : Math.tan(18 * PI / 180) * 1.2 / st.asp; // по горизонтали кадр не уже, чем 1.2:1
      camera.fov = 2 * Math.atan(st.tanV) * 180 / PI; camera.aspect = st.asp; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
      renderer.setPixelRatio(pr); renderer.setSize(w, h, false); rt.setSize(Math.round(w * pr), Math.round(h * pr));
      layout();
    }
    function layout() {
      const hw = hwAt(-10);
      wins.forEach((w) => { w.scale.x = Math.max(2.4, hw * 0.3); w.position.x = w.userData.sg * hw * 0.66; });
      cols.forEach((c) => { c.position.x = c.userData.sg * hw * c.userData.f; });
      if (st.mode === 0) crew.forEach((a) => { if (a.slot) { a.g.position.set(a.slot.side * hwAt(a.slot.z) * a.slot.k, 0, a.slot.z); a.g.rotation.y = a.yaw; } });
      bossG.position.set(st.side * hwAt(1.0) * 0.56, 0, 1.0); bossG.rotation.y = -st.side * 0.22;
      boss.ox = bossG.position.x; boss.oz = bossG.position.z; boss.eyeY = 1.12 * bossG.scale.y;
    }

    function enter(m) {
      st.mode = m; api.mode = m;
      const ms = modeSet[m];
      amb.intensity = ms.amb; key.intensity = ms.key; rim.intensity = ms.rim; scene.fog.density = ms.fog; scene.fog.color.setHex(ms.fogc);
      lobby.visible = m < 2; bossG.visible = m === 2;
      crew.forEach((a) => { a.g.visible = false; a.slot = null; a.g.scale.setScalar(1); });
      if (m === 0) {
        const nL = 2 + (Math.random() < 0.55 ? 1 : 0) + (Math.random() < 0.3 ? 1 : 0), nR = 2 + (Math.random() < 0.55 ? 1 : 0) + (Math.random() < 0.3 ? 1 : 0);
        let idx = 0;
        [[-1, nL], [1, nR]].forEach((p) => {
          for (let r = 0; r < p[1]; r += 1) {
            const a = crew[idx], row = ROWS[r]; idx += 1;
            a.slot = { side: p[0], z: row.z + rnd(-0.2, 0.2), k: row.k + rnd(-0.03, 0.03) };
            a.yaw = -p[0] * (0.45 + rnd(-0.1, 0.1));
            a.g.scale.setScalar(rnd(0.97, 1.04)); a.g.visible = true;
            const heavy = Math.random() < 0.3;
            setKind(a, heavy ? 'lmg' : pick(['rifle', 'rifle', 'pistol']), heavy);
          }
        });
      } else if (m === 1) {
        const n = pick([6, 7, 8]), sp = 1.55;
        for (let i = 0; i < n; i += 1) {
          const a = crew[i], lane = i % 2, col = Math.floor(i / 2);
          a.slot = { mx: col * sp + (lane ? sp * 0.5 : 0), z: lane ? -1.0 : 0.9 };
          a.yaw = PI / 2; a.g.rotation.y = a.yaw; a.g.visible = true;
          a.phj = rnd(-0.06, 0.06);
          setKind(a, 'rifle', Math.random() < 0.2);
        }
        st.travel = 0; st.ph = rnd(0, TAU);
      } else {
        st.side = Math.random() < 0.5 ? -1 : 1; boss.ly = boss.lp = 0;
      }
      layout();
      dust.position.x = m === 2 ? bossG.position.x : 0;
      if (m === 0) crew.forEach((a) => { a.ly = a.lp = 0; });
    }

    function look(a, dt) {
      const tg = st.tgt, dx = tg.x - (a.g.position.x + a.ox), dz = tg.z - (a.g.position.z + a.oz), dy = tg.y - a.eyeY;
      const ry = clamp(wrap(Math.atan2(dx, dz) - a.g.rotation.y - (a === boss ? bossG.rotation.y : 0)), -1.2, 1.2);
      const rp = clamp(Math.atan2(dy, Math.hypot(dx, dz)) * 1.6, -0.45, 0.45), k = 1 - Math.exp(-dt * a.rate);
      a.ly += (ry - a.ly) * k; a.lp += (rp - a.lp) * k;
    }

    function update(dt, now) {
      st.t += dt;
      const g = st.gl;
      let sdt = dt;
      if (g) {
        g.t += dt;
        if (!g.swapped && g.t >= g.swapAt) { g.swapped = true; enter(g.next); if (g.again) st.again = rnd(0.35, 0.8); }
        if (g.t >= g.dur) st.gl = null;
        else if (g.t > 0.07 && g.t < g.swapAt) sdt = 0;   // «лаг»: кадр на миг замирает
      } else if (st.again > 0) { st.again -= dt; if (st.again <= 0) { st.again = 0; glitch(); } }
      // точка, на которую смотрят головы: луч через курсор → плоскость в 3.2 м перед камерой; в покое — медленный дрейф взгляда
      const idle = clamp((now - ptr.t - 6000) / 2500, 0, 1), lx = lerp(ptr.sx, 0.55 * Math.sin(st.t * 0.37), idle), ly = lerp(ptr.sy, 0.2 * Math.sin(st.t * 0.29 + 1), idle);
      const tn = st.tanV;
      st.tgt.set(lx * tn * st.asp * 3.2, CAM_Y + ly * tn * 3.2 - 0.12, CAM_Z - 3.2);
      const m = st.mode;
      if (m === 0) {
        crew.forEach((a) => { if (!a.g.visible) return; look(a, dt); poseStand(a, st.t); });
      } else if (m === 1) {
        st.travel += sdt * 0.55; st.ph += sdt * 2.2;
        const lim = hwAt(-1) + 1.6, per = lim * 2, x0 = -hwAt(0) * 0.95;
        crew.forEach((a) => {
          if (!a.g.visible) return;
          const x = -lim + ((((x0 + a.slot.mx + st.travel + lim) % per) + per) % per);
          a.g.position.set(x, 0, a.slot.z); look(a, dt); poseMarch(a, st.ph + a.phj);
        });
      } else {
        look(boss, dt); poseSit(boss, st.t);
      }
      // пыль: в кадре 1 (слоу-мо) ещё медленнее
      const dk = m === 1 ? 0.4 : 1, arr = dpos;
      for (let i = 0; i < dn; i += 1) {
        arr[i * 3 + 1] += dvy[i] * dt * dk; arr[i * 3] += Math.sin(st.t * 0.3 + dph[i]) * 0.08 * dt * dk;
        if (arr[i * 3 + 1] > 4.6) arr[i * 3 + 1] = 0.1;
      }
      dgeo.attributes.position.needsUpdate = true;
    }

    function render() {
      const g = st.gl;
      if (!g) { renderer.render(scene, camera); return; }
      const u = g.t < g.swapAt ? g.t / g.swapAt : 1 - (g.t - g.swapAt) / (g.dur - g.swapAt), a = clamp(u, 0, 1);
      pm.uniforms.uAmt.value = a * a * (3 - 2 * a); pm.uniforms.uTime.value = st.t; pm.uniforms.uSeed.value = g.seed;
      renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    }
    function glitch(to) {
      if (st.gl || !st.alive) return false;
      const next = to !== undefined ? to : pick([0, 1, 2].filter((i) => i !== st.mode));
      st.gl = { t: 0, dur: 0.8, swapAt: 0.24, next, swapped: false, seed: Math.random() * 50, again: to === undefined && Math.random() < 0.2 };
      return true;
    }
    function frame(dt, now) {
      if (q.half) { st.acc += dt; st.frame += 1; if (st.frame & 1) return; dt = st.acc; st.acc = 0; }
      update(Math.min(dt, 0.1), now); render();
    }
    function dispose() {
      st.alive = false;
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      disposables.forEach((o) => { try { if (o.map && o.map.dispose) o.map.dispose(); o.dispose(); } catch (e) { /* ignore */ } });
      try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* ignore */ }
    }

    resize();
    const first = /[?&]lobbyscene=([012])/.exec(location.search);
    // прогрев: каждый кадр рисуется один раз (шейдеры и текстуры загружаются до показа), включая глитч-проход
    [2, 1, 0].forEach((m) => { enter(m); update(0, 0); renderer.render(scene, camera); });
    st.gl = { t: 0.1, dur: 0.8, swapAt: 0.24, next: 0, swapped: true, seed: 1, again: false }; render(); st.gl = null;
    enter(first ? +first[1] : 0); update(0, 0); render();
    return { canvas, st, glitch, frame, resize, dispose, enter, crew, boss, camera, renderer, scene, update, render, q };
  }

  // ------------------------------------------------------------------ жизненный цикл
  let wrapEl = null;
  function qualityName() { try { return window.Missions.getQuality(); } catch (e) { return 'MEDIUM'; } }

  async function build() {
    const tok = ++buildTok;
    building = 1;
    let ok = false;
    try {
      const C = window.Missions && window.Missions._core;
      if (!C || !C.loadThree || !C.geo || !C.enemyGunGeo || !C.ik2 || /[?&]nolobby3d(?![A-Za-z0-9_])/.test(location.search)) return;
      await C.loadThree();
      const mask = await loadMask();
      if (tok !== buildTok || !want || !window.THREE) return;
      const qn = qualityName(), st = createStage(window.THREE, qn, mask);
      if (tok !== buildTok || !want) { st.dispose(); return; }
      wrapEl = document.getElementById('lobby3d');
      if (!wrapEl) {
        wrapEl = document.createElement('div'); wrapEl.id = 'lobby3d'; wrapEl.setAttribute('aria-hidden', 'true');
        const vig = document.createElement('div'); vig.className = 'lobby3d-vig';
        wrapEl.appendChild(vig);
        document.body.insertBefore(wrapEl, document.body.firstChild);
      }
      wrapEl.insertBefore(st.canvas, wrapEl.firstChild);
      st.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); destroy(); if (want) setTimeout(start, 400); });
      S = st; S.qn = qn; api.ready = true;
      show();
      ok = true;
    } catch (err) {
      console.warn('[lobby3d]', err);
    } finally {
      building = 0;
      if (!ok) api.ready = false;
    }
  }
  function show() {
    if (!S || !wrapEl) return;
    wrapEl.classList.remove('off'); wrapEl.classList.add('on');
    document.body.classList.add('lobby3d-on');
  }
  function hide() {
    if (wrapEl) { wrapEl.classList.add('off'); wrapEl.classList.remove('on'); }
    document.body.classList.remove('lobby3d-on');
  }
  function destroy() {
    buildTok += 1;
    if (S) { const c = S.canvas; S.dispose(); if (c.parentNode) c.parentNode.removeChild(c); }
    S = null; api.ready = false; api.mode = -1;
    hide();
  }
  function start() {
    if (S) { show(); return; }
    if (!building) build();
  }

  function applySway(on) {
    if (!swayEl) swayEl = document.querySelector('.terminal');
    if (!swayEl) return;
    const x = on ? Math.round(ptr.sx * SWAY.x * 10) / 10 : 0, y = on ? Math.round(-ptr.sy * SWAY.y * 10) / 10 : 0;
    if (x === swayX && y === swayY) return;
    swayX = x; swayY = y;
    swayEl.style.translate = on ? x + 'px ' + y + 'px' : '';
  }

  function tick(now) {
    raf = 0;
    if (!want) return;
    if (document.hidden || now - lastT < 46) { raf = requestAnimationFrame(tick); return; }
    const dt = Math.min(0.1, (now - lastT) / 1000 || 0.016); lastT = now;
    step(dt, now);
    raf = requestAnimationFrame(tick);
  }
  function step(dt, now) {
    const k = 1 - Math.exp(-dt * 5);
    ptr.sx += (ptr.x - ptr.sx) * k; ptr.sy += (ptr.y - ptr.sy) * k;
    applySway(true);
    if (S) { if (S.resizeFlag) { S.resizeFlag = false; S.resize(); } S.frame(dt, now); }
  }
  window.addEventListener('resize', () => { if (S) S.resizeFlag = true; });
  window.addEventListener('DOMContentLoaded', () => {
    const sel = document.getElementById('quality');
    if (sel) sel.addEventListener('change', () => { if (S && want && S.qn !== qualityName()) { destroy(); start(); } });
  });

  api.sync = function (on) {
    on = !!on;
    if (on === want) return;
    want = on;
    if (on) {
      clearTimeout(dispTimer);
      start();
      lastT = performance.now();
      if (!raf) raf = requestAnimationFrame(tick);
    } else {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      applySway(false);
      swayX = swayY = 1e9;
      hide();
      clearTimeout(dispTimer);
      dispTimer = setTimeout(() => { if (!want) destroy(); }, 600);
    }
  };
  // случайный «лаг»: кадр меняется на случайный другой; to — принудительно (для проверок)
  api.glitch = function (to) { return !!(want && S && S.glitch(to)); };
  api._step = function (dt, n) { const now = performance.now(); for (let i = 0; i < (n || 1); i += 1) step(dt, now); };
  api._get = function () { return S; };
}());
