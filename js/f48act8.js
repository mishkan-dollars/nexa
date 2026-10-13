// NEXA: миссия 48 — акт 8: ВЫХОД. Трое выходят от здания спиной к нему → снимают костюмы (детали падают в кучу, миниганы летят туда же) →
// Диктор поджигает кучу зажигалкой → отдаёт игроку пульт с красной кнопкой под крышкой → вид от первого лица: крышка, кнопка (два нажатия игрока) →
// камера снаружи: они идут прочь, здание взрывается позади (F.blast из f48blast.js) → затемнение → PH.end.
// Все кадры идут по общим часам S.t (ручной монтаж: поза каждого актёра — функция времени); весь текст — английский.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.PH || !C.f48.PH.end || !C.f48.blast || !C.f48.K || !C.f48.TOWER || !C.f48.mgMesh || !C.f48.K.pbody) return;
  const F = C.f48, K = F.K, PH = F.PH, PI = Math.PI;
  const DIC = 'DICTOR';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const sm = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ------------------------------------------------------------------ места и хронометраж (секунды общих часов S.t)
  const PILE = [0, -10.2];                                                   // куча костюмов
  const SP = { p: [0.2, -12.7, 0], d: [-2.4, -10.1, PI / 2], g: [2.4, -10.1, -PI / 2] };   // x, z, yaw каждого у кучи (игрок — с севера, лицом к зрителю)
  const START = { p: [0.1, -24.3], d: [-1.9, -22.0], g: [1.9, -22.4] };
  const T = { arrive: 9.0, wdur: 5.2, s: { d: 10.4, p: 11.2, g: 12.0 }, lit0: 17.5, flick: 18.5, toss: 19.5, ign: 19.9, remote: 22.3, show: 23.0, ext: 23.4, take: 25.2, endA: 26.0 };
  const WALK = (a, b, tArr, tau) => {                                         // ходьба с плавной остановкой: скорость без скачка
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), v = L / (tArr - tau / 2), f = v * (tArr - tau) / L;
    return [[0, a[0], a[1]], [tArr - tau, lerp(a[0], b[0], f), lerp(a[1], b[1], f)], [tArr, b[0], b[1], 'o']];
  };
  function trk(pts, t) {
    if (t <= pts[0][0]) return { x: pts[0][1], z: pts[0][2], dx: pts[1][1] - pts[0][1], dz: pts[1][2] - pts[0][2] };
    for (let i = 1; i < pts.length; i += 1) {
      if (t <= pts[i][0]) {
        const a = pts[i - 1], b = pts[i], u = (t - a[0]) / (b[0] - a[0]);
        const e = b[3] === 'o' ? 1 - (1 - u) * (1 - u) : b[3] === 'i' ? u * u : b[3] === 's' ? u * u * (3 - 2 * u) : u;
        return { x: lerp(a[1], b[1], e), z: lerp(a[2], b[2], e), dx: b[1] - a[1], dz: b[2] - a[2] };
      }
    }
    const l = pts[pts.length - 1], q = pts[pts.length - 2];
    return { x: l[1], z: l[2], dx: l[1] - q[1], dz: l[2] - q[2] };
  }
  const groundY = (x, z) => 0.3 * Math.exp(-((x - PILE[0]) * (x - PILE[0]) + (z - PILE[1]) * (z - PILE[1])) / 0.85);

  // ------------------------------------------------------------------ звук
  function clank(r, k, f) {                                                   // металлический лязг брони о землю
    const s = r.snd, c = s && s.ctx; if (!c || !s.tone || !s.noise) return;
    const t = c.currentTime + 0.002; f = f || (520 + Math.random() * 900); k = k || 1;
    s.tone({ t, type: 'triangle', f0: f, f1: f * 0.86, dur: 0.24, g: 0.18 * k, a: 0.001 });
    s.tone({ t, type: 'sine', f0: f * 2.31, f1: f * 2.1, dur: 0.12, g: 0.08 * k, a: 0.001 });
    s.noise({ t, type: 'highpass', f0: 2600, dur: 0.05, g: 0.14 * k, a: 0.001 });
    s.tone({ t, type: 'sine', f0: 120, f1: 58, dur: 0.14, g: 0.2 * k, a: 0.002 });
  }
  function whoomp(r) {                                                        // вспышка поджига
    const s = r.snd, c = s && s.ctx; if (!c || !s.noise || !s.tone) return;
    const t = c.currentTime + 0.01;
    s.noise({ t, type: 'lowpass', f0: 1400, f1: 180, q: 0.8, dur: 0.9, g: 0.34, a: 0.03 });
    s.tone({ t, type: 'sine', f0: 90, f1: 38, dur: 0.7, g: 0.3, a: 0.02 });
    s.noise({ t: t + 0.05, type: 'bandpass', f0: 900, q: 0.6, dur: 1.4, g: 0.12, a: 0.2 });
  }
  function crackle(r, k) {
    const s = r.snd, c = s && s.ctx; if (!c || !s.noise) return;
    s.noise({ t: c.currentTime + 0.001, type: 'highpass', f0: 2400 + Math.random() * 2600, dur: 0.012 + Math.random() * 0.03, g: (0.05 + Math.random() * 0.09) * k, a: 0.0006 });
    if (Math.random() < 0.25) s.noise({ t: c.currentTime + 0.001, type: 'lowpass', f0: 500, dur: 0.12, g: 0.06 * k, a: 0.004 });
  }
  function beep(r, f, d, g) {
    const s = r.snd, c = s && s.ctx; if (!c || !s.tone) return;
    s.tone({ t: c.currentTime + 0.003, type: 'square', f0: f, dur: d || 0.09, g: g || 0.1, a: 0.002, lp: 3600 });
  }

  // ------------------------------------------------------------------ экранные слои
  function css8() {
    if (document.getElementById('f48-css8')) return;
    const st = document.createElement('style'); st.id = 'f48-css8';
    st.textContent = '.f48-rem{position:absolute;inset:0;z-index:11;display:flex;align-items:flex-end;justify-content:center;padding-bottom:12vh;pointer-events:none;opacity:0;transition:opacity 1.0s}' +
      '.f48-rem.on{opacity:1}.f48-rem button{pointer-events:auto;font:600 clamp(16px,2vw,30px) Teko,Oswald,sans-serif;letter-spacing:.24em;color:#e8e8e8;background:rgba(6,6,8,.66);border:1px solid rgba(232,232,232,.55);padding:7px 34px;cursor:pointer;text-transform:uppercase;transition:background .25s,color .25s,border-color .25s}' +
      '.f48-rem button b{opacity:.55;margin-right:.7em;font-weight:500}.f48-rem button:hover,.f48-rem button:focus{background:#e8e8e8;color:#0a0a0c;outline:none}' +
      '.f48-rem button.red{border-color:#c01818;color:#ff6a5a;animation:f48remp 0.9s ease-in-out infinite alternate}.f48-rem button.red:hover,.f48-rem button.red:focus{background:#c01818;border-color:#c01818;color:#fff}' +
      '@keyframes f48remp{from{box-shadow:0 0 0 rgba(192,24,24,0)}to{box-shadow:0 0 26px rgba(192,24,24,.7)}}';
    document.head.appendChild(st);
  }

  // ------------------------------------------------------------------ реквизит: пульт с красной кнопкой под откидной крышкой, зажигалка
  function buildRemote() {
    const T3 = THREE, g = new T3.Group();
    const lam = (c, e) => new T3.MeshLambertMaterial({ color: c, emissive: e === undefined ? 0x070708 : e });
    const add = (parent, geo, mat, x, y, z) => { const m = new T3.Mesh(geo, mat); m.position.set(x, y, z); m.frustumCulled = false; parent.add(m); return m; };
    add(g, new T3.BoxGeometry(0.09, 0.034, 0.21), lam(0x34363c, 0x101114), 0, 0, 0);
    add(g, new T3.BoxGeometry(0.08, 0.006, 0.19), lam(0x4a4d55, 0x16171b), 0, 0.019, 0);
    [-1, 1].forEach((s) => add(g, new T3.BoxGeometry(0.008, 0.03, 0.18), lam(0x0c0d0f), s * 0.049, 0, 0));
    const ant = add(g, new T3.CylinderGeometry(0.0045, 0.0045, 0.15, 6), lam(0x0c0d0f), 0.034, 0.02, 0.19); ant.rotation.x = PI / 2 - 0.28;
    add(g, new T3.SphereGeometry(0.008, 8, 6), lam(0x0c0d0f), 0.034, 0.03, 0.262);
    const scr = add(g, new T3.BoxGeometry(0.052, 0.002, 0.024), new T3.MeshBasicMaterial({ color: 0x1fa84a }), 0, 0.0225, 0.075);
    for (let i = 0; i < 3; i += 1) add(g, new T3.BoxGeometry(0.018, 0.004, 0.012), lam(0x3a3d44), -0.024 + i * 0.024, 0.022, 0.035);
    const bz = -0.05;
    add(g, new T3.CylinderGeometry(0.031, 0.031, 0.007, 20), lam(0xd9a400, 0x3a2a00), 0, 0.0215, bz);
    const btn = add(g, new T3.CylinderGeometry(0.019, 0.021, 0.016, 18), new T3.MeshBasicMaterial({ color: 0xc8100c }), 0, 0.028, bz);
    const cover = new T3.Group(); cover.position.set(0, 0.032, bz - 0.036);
    add(cover, new T3.BoxGeometry(0.068, 0.005, 0.072), new T3.MeshLambertMaterial({ color: 0xe6b800, emissive: 0x4a3a00, transparent: true, opacity: 0.62 }), 0, 0, 0.036);
    for (let i = 0; i < 4; i += 1) add(cover, new T3.BoxGeometry(0.068, 0.0058, 0.009), lam(0x151515), 0, 0.0005, 0.011 + i * 0.019);
    add(cover, new T3.BoxGeometry(0.03, 0.01, 0.01), lam(0xd0d0d0), 0, 0.004, 0.074);
    g.add(cover);
    const led = add(g, new T3.SphereGeometry(0.0062, 8, 6), new T3.MeshBasicMaterial({ color: 0x33ff55 }), 0.03, 0.023, 0.1);
    g.visible = false;
    return { g, btn, cover, led, scr };
  }
  function buildLighter() {
    const T3 = THREE, g = new T3.Group();
    const body = new T3.Mesh(new T3.BoxGeometry(0.026, 0.05, 0.011), new T3.MeshLambertMaterial({ color: 0xb0b4ba, emissive: 0x303236 }));
    const top = new T3.Mesh(new T3.BoxGeometry(0.027, 0.014, 0.012), new T3.MeshLambertMaterial({ color: 0x8a8d92, emissive: 0x202224 })); top.position.y = 0.032;
    body.frustumCulled = top.frustumCulled = false; g.add(body, top);
    g.visible = false;
    return g;
  }

  // ------------------------------------------------------------------ детали костюма → куча
  function groupPieces(n) {
    const G = { head: [], chest: [], waist: [], armL: [], armR: [], legL: [], legR: [] };
    (n.suitMeshes || []).forEach((m) => {
      const p = m.parent;
      if (p === n.head) G.head.push(m); else if (p === n.spine) G.chest.push(m); else if (p === n.hips) G.waist.push(m);
      else if (p === n.armL || p === n.elbL) G.armL.push(m); else if (p === n.armR || p === n.elbR) G.armR.push(m);
      else if (p === n.legL || p === n.kneeL || p === n.footL) G.legL.push(m); else G.legR.push(m);
    });
    return G;
  }
  function showHead(n) { if (n.glasses) n.glasses.visible = true; if (n.hairG) n.hairG.visible = true; if (n.hair) n.hair.visible = true; }

  // ================================================================== ФАЗА EXIT
  PH.exit = async function (r, ctx) {
    const W = ctx.W, st = K.st(r);
    css8(); K.css();
    K.lock(r);
    K.black(r, 1, 0); K.cutFade(r, 1);
    await r.clearEnemies();
    r.noFight = true;
    K.suitMode(r, false);
    const TM = st.team || await K.makeTeam(r, { D: [START.d[0], START.d[1], 0], G: [START.g[0], START.g[1], 0] });
    const d = TM.d, g = TM.g;
    W.enter('plaza', 0, -12, PI);
    const RP = W.R.plaza, TW = RP && RP.tw;
    K.amb.set(r, 'yard', { fade: 2.5 });
    if (TW && TW.door) TW.door.set(0.0);
    const p = K.pbody(r, START.p[0], START.p[1], 0);
    [d, g, p].forEach((n) => { if (!n.suitMeshes) F.suit(r, n); n.g.visible = true; K.ally.stop(n); n.goal = null; n.armT = 0; });
    [d, g, p].forEach((n) => { if (n.gunKind !== 'minigun') F.npcMinigun(r, n); });
    p.head.visible = true;
    st.exitP = p;

    // свет костра и пятно гари — до B.begin, чтобы шейдеры скомпилировались сразу со всеми источниками
    const T3 = THREE, V = (x, y, z) => new T3.Vector3(x, y, z);
    const fl = new T3.PointLight(0xff8a3a, 0, 20, 1.7); fl.position.set(PILE[0], 1.1, PILE[1]); r.scene.add(fl);
    const scorch = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 4, 64, 64, 62);
      gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(0.55, 'rgba(8,6,4,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      const m = new T3.Mesh(new T3.PlaneGeometry(3.6, 3.6), new T3.MeshBasicMaterial({ map: new T3.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0 }));
      m.rotation.x = -PI / 2; m.position.set(PILE[0], 0.03, PILE[1]); r.scene.add(m); return m;
    })();
    const B = F.blast.begin(r, RP);
    if (!B) { r.finish(true); return; }
    B.lpos = [PILE[0], 2.0, PILE[1] - 6];
    B.run();
    const rem = buildRemote(), lit = buildLighter();
    r.scene.add(rem.g);
    d.elbL.add(lit); lit.position.set(0, -0.3, 0.02);

    const S = {
      r, W, B, d, g, p, t: 0, tb: 0, run: true, mode: 'A', ev: [], pieces: [], mats: [], fire: [], fk: 0, live: 0, ign: false, coverK: 0, press: 0, stage: 0,
      walk: { p: WALK(START.p, SP.p, T.arrive, 1.0), d: WALK(START.d, SP.d, T.arrive, 1.0), g: WALK(START.g, SP.g, T.arrive, 1.0) },
      grp: { d: groupPieces(d), g: groupPieces(g), p: groupPieces(p) }, done: {}, dead: false, yawV: 0, pitV: 0.55, rp: null
    };
    S.fire = [[0, 0, 0.55, 0.6], [0.6, 0.3, 0.38, 0.4], [-0.55, -0.3, 0.38, 0.4], [0.2, -0.65, 0.34, 0.35], [-0.25, 0.6, 0.34, 0.35]].map((q) => B.burn(PILE[0] + q[0], PILE[1] + q[1], { s: q[3], y: q[2], camp: true, w: q[3] }));

    // ---- реквизит как «куски» с баллистикой
    const addPiece = (m, o) => {
      const e = { m, v: V(0, 0, 0), w: V(0, 0, 0), ext: o.ext || 0.06, on: true, rest: false, k: o.k || 1, burn: 0, snd: o.snd !== false };
      m.rotation.order = 'YXZ';
      S.pieces.push(e);
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      m.traverse && m.traverse((q) => { if (q.isMesh && q.material) { (Array.isArray(q.material) ? q.material : [q.material]).forEach((mm) => { if (S.mats.indexOf(mm) < 0) S.mats.push(mm); }); } });
      mats.forEach((mm) => { if (mm && S.mats.indexOf(mm) < 0) S.mats.push(mm); });
      return e;
    };
    const launch = (e, vy0, tx, tz, spin) => {                                   // баллистика в точку (tx,tz): время полёта из высоты и vy0
      const y0 = e.m.position.y, gy = groundY(tx, tz) + e.ext, dy = y0 - gy, g0 = 9.8;
      const tt = Math.max(0.25, (vy0 + Math.sqrt(Math.max(0, vy0 * vy0 + 2 * g0 * dy))) / g0);
      e.v.set((tx - e.m.position.x) / tt, vy0, (tz - e.m.position.z) / tt);
      const sp = spin === undefined ? 5 : spin;
      e.w.set(rnd(-sp, sp), rnd(-sp, sp), rnd(-sp, sp));
    };
    const toPile = (rad) => { const a = rnd(0, 6.283), q = Math.sqrt(Math.random()) * (rad || 1.0); return [PILE[0] + Math.cos(a) * q, PILE[1] + Math.sin(a) * q]; };
    const detach = (m, vy0, rad, spin, vol) => {
      const gm = m.geometry; gm.computeBoundingBox();
      const bb = gm.boundingBox, c = bb.getCenter(V(0, 0, 0)), sz = bb.getSize(V(0, 0, 0));
      gm.translate(-c.x, -c.y, -c.z); gm.boundingBox = null; gm.computeBoundingSphere();
      m.position.add(c); m.updateMatrix();
      r.scene.attach(m);
      const e = addPiece(m, { ext: clamp(Math.min(sz.x, sz.y, sz.z) * 0.5, 0.02, 0.2), k: vol === undefined ? 1 : vol });
      const t2 = toPile(rad); launch(e, vy0, t2[0], t2[1], spin);
      return e;
    };
    const handW = (n, side, out) => { n.g.updateMatrixWorld(true); return (side < 0 ? n.elbL : n.elbR).localToWorld(out.set(0, -0.27, 0)); };
    const tossGun = (n) => {
      const held = n.gm && n.gm.minigun; if (!held || n.gunKind !== 'minigun') return;
      held.updateWorldMatrix(true, false);
      const m = F.mgMesh(); held.getWorldPosition(m.position); held.getWorldQuaternion(m.quaternion);
      r.scene.add(m);
      const e = addPiece(m, { ext: 0.09, k: 1.4 });
      const t2 = toPile(0.6); launch(e, 2.2, t2[0], t2[1], 2.5);
      r.setGun(n, null);
      K.snd(r, 'throw', { k: 0.7 });
    };
    const strip = (n, key, vy0, rad, spin, vol) => {
      const list = S.grp[n === d ? 'd' : n === g ? 'g' : 'p'][key];
      list.forEach((m, i) => { if (m.parent && m.parent !== r.scene) { if (key === 'head') showHead(n); detach(m, vy0 + rnd(-0.3, 0.5), rad, spin, vol); } });
      if (key === 'legR') { n.suitMeshes = null; showHead(n); }
    };

    // ---- события (звук, реплики, действия-состояния): [время, fn(quiet), состояние?]
    const on = (t, fn, state) => S.ev.push([t, fn, !!state]);
    ['d', 'p', 'g'].forEach((k) => {
      const n = S[k], s = T.s[k], at = (u) => s + T.wdur * u;
      on(s - 0.45, () => tossGun(n), true);
      on(at(0.12), () => strip(n, 'head', 2.3, 0.9, 6, 1), true);
      on(at(0.34), () => strip(n, 'chest', 1.5, 0.9, 3, 1.3), true);
      on(at(0.5), () => strip(n, 'waist', 1.3, 0.9, 4, 0.9), true);
      on(at(0.62), () => strip(n, 'armL', 1.1, 1.0, 5, 0.9), true);
      on(at(0.72), () => strip(n, 'armR', 1.1, 1.0, 5, 0.9), true);
      on(at(0.86), () => strip(n, 'legL', 0.9, 1.1, 5, 0.9), true);
      on(at(0.96), () => strip(n, 'legR', 0.9, 1.1, 5, 0.9), true);
      on(at(0.28), () => K.snd(r, 'rustle', { k: 0.6 }));
      on(at(0.52), () => K.snd(r, 'rustle', { k: 0.5 }));
    });
    on(9.5, () => r.say(DIC, 'Everything NEXA gave us stays here.', 2.8));
    on(T.lit0, () => { lit.visible = true; K.snd(r, 'click', { k: 0.5 }); });
    on(T.flick, () => { S.flame = true; K.snd(r, 'click', { k: 0.9 }); K.snd(r, 'tick', { k: 0.5 }); });
    on(T.toss, () => {                                                          // зажигалка летит в кучу
      S.flame = false; lit.visible = false; K.snd(r, 'throw', { k: 0.4 });
      const m = lit.clone(); handW(d, -1, m.position); m.visible = true; r.scene.add(m);
      const e = addPiece(m, { ext: 0.02, snd: false }); launch(e, 1.4, PILE[0] + 0.1, PILE[1] + 0.05, 8); S.lighter = e;
    }, true);
    on(T.ign, () => ignite(true), true);
    on(20.4, () => r.say(DIC, 'No suits. No names. Nothing left to follow.', 3.0));
    on(T.show, () => { rem.g.visible = true; d.elbR.add(rem.g); rem.g.position.set(0, -0.31, 0.0); rem.g.rotation.set(PI / 2, 0, 0); rem.g.scale.setScalar(1); K.snd(r, 'rustle', { k: 0.6 }); }, true);
    on(23.6, () => r.say(DIC, 'Six charges. Three floors. One button.', 2.6));
    on(T.take, () => { giveRemote(); K.snd(r, 'rustle', { k: 0.5 }); }, true);
    S.ev.sort((a, b) => a[0] - b[0]);

    const ignite = (burst) => {
      if (S.ign) return; S.ign = true; S.igT = Math.max(S.t, T.ign);
      if (burst) {
        whoomp(r);
        const x = PILE[0], z = PILE[1];
        for (let i = 0; i < 12; i += 1) B.fire_({ x: x + rnd(-0.5, 0.5), y: 0.2, z: z + rnd(-0.5, 0.5), vx: rnd(-1, 1), vy: rnd(1.6, 4.4), vz: rnd(-1, 1), s0: rnd(0.5, 0.9), s1: rnd(1.6, 2.6), dur: rnd(0.55, 1.0), op: rnd(0.8, 1), c0: 1, c1: 0.14, drag: 1.5, rise: 1.2, spin: rnd(-1.4, 1.4) });
        for (let i = 0; i < 6; i += 1) B.smoke_({ x: x + rnd(-0.4, 0.4), y: 0.6, z: z + rnd(-0.4, 0.4), vx: rnd(-0.6, 0.6), vy: rnd(1.5, 3), vz: rnd(-0.6, 0.6), s0: 0.7, s1: rnd(2.4, 3.6), dur: rnd(3, 5), op: 0.5, c0: 0.3, c1: 0.1, drag: 0.6, rise: 0.4, spin: rnd(-0.3, 0.3), warm: 1 });
        B.pulse(x, 1.2, z, 5, 3.5);
      }
    };
    const giveRemote = () => {                                                  // пульт переходит к игроку
      rem.g.visible = true; S.rem = 'p'; if (rem.g.parent) rem.g.parent.remove(rem.g); r.scene.add(rem.g);
    };

    // ---------------------------------------------------------- позы по времени
    const wrapA = (a) => { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; };
    const _w = V(0, 0, 0), _w2 = V(0, 0, 0);
    const bp = (n, x, y, z, out) => { n.g.updateMatrixWorld(true); return n.g.localToWorld(out.set(x, y, z)); };
    function actorPlace(n, x, z, yaw, snap) { n.g.position.set(x, 0, z); n.yaw = yaw; if (snap) n.g.rotation.y = yaw; }

    function undress(n, s, t, key) {
      const u = (t - s) / T.wdur; if (u < -0.02 || u > 1.06) return;
      const Wn = (a, b) => sm(seg(u, a - 0.0001, a + 0.04)) * (1 - sm(seg(u, b - 0.04, b)));
      const wh = Wn(0, 0.2), wc = Wn(0.2, 0.42), ww = Wn(0.42, 0.55), wa = Wn(0.55, 0.75), wl = Wn(0.75, 1.0);
      const br = Math.sin(t * 5.2) * 0.012;
      // голова: обе руки к шлему, голова запрокинута, потом опускается
      if (wh > 0.01) {
        K.armMix(r, n, -1, wh, () => K.armLocal(r, n, -1, -0.16, 0.64, 0.05)); K.armMix(r, n, 1, wh, () => K.armLocal(r, n, 1, 0.16, 0.64, 0.05));
        n.head.rotation.x += -0.22 * wh * (1 - sm(seg(u, 0.1, 0.2))) + 0.18 * sm(seg(u, 0.13, 0.2)) * wh;
      }
      // нагрудник: застёжки спереди
      if (wc > 0.01) {
        K.armMix(r, n, -1, wc, () => K.armLocal(r, n, -1, -0.1, 0.27 + br, 0.22)); K.armMix(r, n, 1, wc, () => K.armLocal(r, n, 1, 0.1, 0.3 - br, 0.22));
        n.spine.rotation.x += 0.12 * wc; n.head.rotation.x += 0.2 * wc;
      }
      // пояс
      if (ww > 0.01) {
        K.armMix(r, n, -1, ww, () => K.armLocal(r, n, -1, -0.15, 0.04, 0.22)); K.armMix(r, n, 1, ww, () => K.armLocal(r, n, 1, 0.15, 0.04, 0.22));
        n.spine.rotation.x += 0.24 * ww; n.head.rotation.x += 0.1 * ww;
      }
      // руки-накладки: рука через грудь к противоположному плечу
      if (wa > 0.01) {
        const ph = u < 0.65 ? 0 : 1;
        K.armMix(r, n, 1, wa, () => K.armLocal(r, n, 1, ph ? 0.1 : -0.25, 0.46, 0.13)); K.armMix(r, n, -1, wa, () => K.armLocal(r, n, -1, ph ? 0.25 : 0.1, ph ? 0.46 : 0.34, 0.14));
        n.spine.rotation.x += 0.12 * wa; n.spine.rotation.y += (ph ? -0.18 : 0.18) * wa;
      }
      // ноги: наклон, руки к голеням, колени согнуты
      if (wl > 0.01) {
        const kl = (side) => { bp(n, side * 0.13, 0.34, 0.22, _w); K.armBlend(r, n, side, wl * 0.9, _w.x, _w.y, _w.z); };
        n.spine.rotation.x += 0.86 * wl; n.head.rotation.x -= 0.5 * wl; n.hips.position.y -= 0.1 * wl;
        n.kneeL.rotation.x += 0.35 * wl; n.kneeR.rotation.x += 0.35 * wl; n.legL.rotation.x -= 0.25 * wl; n.legR.rotation.x -= 0.25 * wl;
        kl(-1); kl(1);
      }
      void key;
    }
    function tossPose(n, s, t) {                                                 // бросок миниганом: откат корпуса назад и толчок вперёд
      const u = (t - (s - 0.95)) / 0.9; if (u < 0 || u > 1) return;
      const w = Math.sin(clamp(u, 0, 1) * PI);
      n.spine.rotation.x += (u < 0.45 ? -0.2 * sm(u / 0.45) : -0.2 * (1 - sm((u - 0.45) / 0.15)) + 0.18 * sm((u - 0.45) / 0.2) * (1 - sm((u - 0.7) / 0.3)));
      void w;
    }

    function poseA(t, dt) {
      ['p', 'd', 'g'].forEach((k) => {
        const n = S[k]; const q = trk(S.walk[k], t);
        let x = q.x, z = q.z, yaw = t < T.arrive - 0.35 ? Math.atan2(q.dx, q.dz) : SP[k][2];
        // Диктор подходит к игроку с пультом
        if (k === 'd' && t > 21.2) {
          const e = trk([[21.2, SP.d[0], SP.d[1]], [22.9, -0.95, -11.5, 's']], t);
          x = e.x; z = e.z; yaw = t < 21.9 ? Math.atan2(e.dx, e.dz) : Math.atan2(SP.p[0] - e.x, SP.p[1] - e.z);
        }
        if (k === 'p' && t > 22.6) yaw = lerp(0, -0.76, sm(seg(t, 22.6, 23.6)));
        actorPlace(n, x, z, yaw, t <= 0.001);
        n.armT = 0;
        undress(n, T.s[k], t, k);
        tossPose(n, T.s[k], t);
      });
      // Диктор: зажигалка — рука с зажигалкой вперёд-вниз к куче, затем бросок
      if (t > T.lit0 - 0.7 && t < T.toss + 0.9) {
        const wLit = sm(seg(t, T.lit0 - 0.6, T.lit0 + 0.5)) * (1 - sm(seg(t, T.toss, T.toss + 0.5)));
        if (wLit > 0.01) {
          const wk = sm(seg(t, T.flick + 0.25, T.toss - 0.05));
          K.armMix(r, d, -1, wLit, () => K.armLocal(r, d, -1, lerp(-0.1, -0.06, wk), lerp(0.36, 0.1, wk), lerp(0.36, 0.5, wk)));
          d.spine.rotation.x += 0.05 * wLit + 0.22 * wk * wLit;
          d.head.rotation.x += 0.2 * wLit;
        }
        // бросок: рука отводится и выбрасывает вперёд
        const th = sm(seg(t, T.toss - 0.12, T.toss + 0.08));
        if (th > 0.01) K.armMix(r, d, -1, th * (1 - sm(seg(t, T.toss + 0.1, T.toss + 0.6))), () => K.armLocal(r, d, -1, -0.06, 0.22, 0.58));
      }
      // зажигалка в руке: пламя
      if (S.flame && lit.visible) {
        lit.getWorldPosition(_w); _w.y += 0.04;
        B.fire_({ x: _w.x, y: _w.y, z: _w.z, vx: 0, vy: 0.5, vz: 0, s0: 0.05, s1: 0.11, dur: 0.2, op: 0.95, c0: 1, c1: 0.45, drag: 3, rise: 1.1 });
      }
      // пульт: Диктор достаёт из-за пазухи и протягивает; игрок берёт
      if (t > T.remote - 0.6) {
        const wp = sm(seg(t, T.remote, T.show)) * (1 - sm(seg(t, T.ext - 0.05, T.ext + 0.4)));
        if (wp > 0.01) K.armMix(r, d, 1, wp, () => K.armLocal(r, d, 1, -0.1, 0.3, 0.2));
        const wx = sm(seg(t, T.ext - 0.05, T.ext + 0.55)) * (1 - sm(seg(t, T.take + 0.1, T.take + 0.7)));
        if (wx > 0.01) {
          bp(p, 0.0, 1.22, 0.55, _w);
          K.armBlend(r, d, 1, wx, _w.x, _w.y - 0.02 + 0.03 * Math.sin(t * 5), _w.z);
          K.armMix(r, d, -1, wx * 0.6, () => K.armLocal(r, d, -1, -0.16, 0.18, 0.22));
        }
        const wt = sm(seg(t, T.ext + 0.5, T.take - 0.1)) * (1 - sm(seg(t, T.take + 0.4, T.take + 0.9)));
        if (wt > 0.01) {
          d.g.updateMatrixWorld(true); rem.g.getWorldPosition(_w2);
          K.armBlend(r, p, 1, wt, _w2.x, _w2.y, _w2.z); K.armBlend(r, p, -1, wt * 0.8, _w2.x - 0.07, _w2.y - 0.01, _w2.z);
          p.head.rotation.x += 0.22 * wt;
        }
      }
    }

    // после нажатия — идут прочь; здание взрывается позади
    function poseC(tb, dt) {
      const X = { p: 0.3, d: -2.0, g: 2.0 }, V0 = 1.36;
      ['p', 'd', 'g'].forEach((k) => {
        const n = S[k], dl = k === 'p' ? 0.35 : k === 'd' ? 0.1 : 0.2;
        const s = sm(seg(tb, dl, dl + 1.1)) * 0.5 + 0.5 * sm(seg(tb, dl + 0.6, dl + 1.4));                  // разгон
        const dist = V0 * Math.max(0, (tb - dl)) * (0.35 + 0.65 * sm(seg(tb, dl, dl + 1.4))) - V0 * 0.35 * Math.max(0, 1.4 - (tb - dl) > 0 ? 0 : 0);
        void s;
        const z0 = SP[k][1], x0 = SP[k][0], x1 = X[k];
        const zz = z0 + Math.max(0, dist), xx = lerp(x0, x1, sm(seg(tb, dl, dl + 5)));
        actorPlace(n, xx, zz, 0, false);
        n.armT = 0;
        // ударная волна: корпус вздрагивает и пригибается, потом выпрямляется
        const ts = B.mainAt - B.t0 + 0.28, kk = tb > ts ? Math.exp(-(tb - ts) * 2.6) : 0;
        if (kk > 0.01) { n.spine.rotation.x += (k === 'g' ? 0.2 : 0.14) * kk; n.head.rotation.x += 0.12 * kk; n.hips.position.y -= 0.025 * kk; }
      });
      // девушка один раз оглядывается через плечо
      const gl = sm(seg(tb, 3.6, 4.2)) * (1 - sm(seg(tb, 5.0, 5.6)));
      if (gl > 0.01) { g.head.rotation.y += 0.9 * gl; g.head.rotation.x -= 0.05 * gl; }
    }

    const breath = (dt) => {                                                    // пока ждём решения игрока
      const q = Math.sin(S.live * 1.3) * 0.012;
      p.spine.rotation.x += q;
    };

    // ---------------------------------------------------------- физика кусков, огонь, свет
    const hotCol = [0, 0, 0];
    function pieces(dt) {
      let landed = 0;
      for (let i = 0; i < S.pieces.length; i += 1) {
        const e = S.pieces[i], m = e.m; if (!e.on) continue;
        if (!e.rest) {
          e.v.y -= 9.8 * dt; m.position.addScaledVector(e.v, dt);
          m.rotation.x += e.w.x * dt; m.rotation.y += e.w.y * dt; m.rotation.z += e.w.z * dt;
          const gy = groundY(m.position.x, m.position.z) + e.ext;
          if (m.position.y < gy) {
            m.position.y = gy;
            if (e.v.y < -1.6) {
              if (e.snd && S.t - (S.lastClank || 0) > 0.03) { S.lastClank = S.t; clank(r, clamp(-e.v.y / 5, 0.3, 1) * e.k, e.k > 1.2 ? 260 + Math.random() * 120 : 0); }
              e.v.y *= -0.26; e.v.x *= 0.5; e.v.z *= 0.5; e.w.multiplyScalar(0.45);
            } else {
              e.v.y = 0; const f = Math.exp(-dt * 6); e.v.x *= f; e.v.z *= f; e.w.multiplyScalar(Math.exp(-dt * 8));
              m.rotation.x += (Math.round(m.rotation.x / (PI / 2)) * (PI / 2) - m.rotation.x) * Math.min(1, dt * 9);
              m.rotation.z += (Math.round(m.rotation.z / (PI / 2)) * (PI / 2) - m.rotation.z) * Math.min(1, dt * 9);
              if (Math.abs(e.v.x) + Math.abs(e.v.z) < 0.12) { e.rest = true; }
            }
          }
        }
        landed += 1;
      }
      void landed;
    }
    function fireFx(dt) {
      const igt = S.ign ? Math.max(0, S.t - S.igT) + (S.mode !== 'A' ? 99 : 0) : 0;
      const k = S.ign ? sm(seg(igt, 0, 4.5)) : 0; S.fk = k;
      const fl2 = 0.8 + 0.2 * Math.sin(S.live * 17) * Math.sin(S.live * 9.1) + rnd(-0.06, 0.06);
      S.fire.forEach((e, i) => { e.rate = k * (i === 0 ? 40 : 24) * fl2; });
      S.fire.forEach((e) => { e.s = e.w * 1.2 * (0.45 + 0.55 * k); });
      fl.intensity = (S.ign ? 0.3 + 1.3 * k : 0) * fl2 + (S.ign && igt < 0.6 ? 2.0 * (1 - igt / 0.6) : 0);
      fl.position.y = 1.0 + 0.25 * Math.sin(S.live * 5);
      scorch.material.opacity = k * 0.95;
      // жар: куски темнеют и тлеют
      const hot = clamp(igt / 6, 0, 1);
      for (let i = 0; i < S.mats.length; i += 1) {
        const m = S.mats[i];
        if (m.emissive) { m.color.setScalar(lerp(1, 0.34, hot)); m.emissive.setRGB(0.16 * hot * fl2, 0.04 * hot * fl2, 0); }
        else if (m.color && m.color.r !== undefined && !m.map) { m.color.setScalar(lerp(1, 0.4, hot)); }
      }
      if (k > 0.05 && Math.random() < dt * 22 * k) crackle(r, 0.9);
      void hotCol;
    }
    const removePieces = () => { S.pieces.forEach((e) => { try { r.scene.remove(e.m); } catch (er) { /* уже убран */ } }); };

    // ---------------------------------------------------------- главный хук: часы, события, позы
    let fired = 0;
    const off = K.hook(r, (dt) => {
      if (r.disposed || S.dead) return;
      dt = Math.min(dt, 0.05);
      S.live += dt;
      if (S.mode === 'A') {
        if (S.run) S.t = Math.min(T.endA + 0.001, S.t + dt);
        if (S.run && !r.cineSkip) while (fired < S.ev.length && S.ev[fired][0] <= S.t) { const e = S.ev[fired]; fired += 1; try { e[1](false); } catch (err) { console.error(err); } }
        poseA(S.t, dt);
      } else if (S.mode === 'B') {
        poseB(dt);
      } else {
        S.tb = Math.max(0, B.t - (B.t0 || 0));
        poseC(S.tb, dt);
      }
      pieces(dt);
      fireFx(dt);
    });
    S.off = off;

    // ---- поза в режиме B (пульт в руках): тело следует за камерой, руки у пульта
    function poseB(dt) {
      actorPlace(d, -0.95, -11.5, Math.atan2(SP.p[0] + 0.95, SP.p[1] + 11.5));
      actorPlace(g, SP.g[0], SP.g[1], SP.g[2]);
      actorPlace(p, SP.p[0], SP.p[1], S.yawV);
      p.armT = 0; p.head.visible = false;
      const q = S.rp;
      if (q) {
        const pr = Math.sin(clamp(S.press, 0, 1) * PI) * 0.03 + S.press * 0.006;
        K.armBlend(r, p, -1, 1, q.px - q.rx * 0.075 + q.fx * 0.02, q.py - q.ux * 0 - 0.02, q.pz - q.rz * 0.075 + q.fz * 0.02);
        // правая кисть над кнопкой: поднимается при открытии крышки, нажимает
        const lift = 0.05 * sm(S.coverK) * (1 - S.press);
        K.armBlend(r, p, 1, 1, q.px + q.rx * 0.075 + q.fx * 0.02, q.py - 0.02 + lift - pr, q.pz + q.rz * 0.075 + q.fz * 0.02);
      }
      p.head.rotation.x = 0.3;
    }
    // световой сигнал пульта и крышка
    const remoteFx = (dt) => {
      rem.cover.rotation.x = -2.35 * sm(S.coverK);
      const bl = 0.55 + 0.45 * Math.sin(S.live * (S.stage >= 1 ? 9 : 3));
      rem.led.material.color.setRGB(S.stage >= 1 ? 1 : 0.2, S.stage >= 1 ? 0.12 * bl : 1, S.stage >= 1 ? 0.1 : 0.33);
      rem.btn.position.y = 0.028 - 0.011 * S.press;
      rem.btn.material.color.setRGB(0.78 + 0.22 * (S.stage >= 1 ? bl : 0), 0.06, 0.05);
    };

    // ---------------------------------------------------------- кадры
    const sh = (o) => K.shot(o);
    const at = (t0, t1, o) => sh(Object.assign({ dur: t1 - t0, sync: () => S.t - t0 }, o));
    const midTrio = (y) => { const a = d.g.position, b = g.g.position, c = p.g.position; return [(a.x + b.x + c.x) / 3, y, (a.z + b.z + c.z) / 3]; };
    const shotsA = [
      // 1. широкий низкий кадр: трое идут от светящегося здания к нам
      at(0, 6.5, {
        at: [7.5, 1.2, -2.0], to: [6.2, 1.3, -3.2], look: [0.4, 3.0, -22], lookTo: [0.2, 2.2, -17], fov: 46, fovTo: 42, hand: 0.5, tense: 0.25,
        run: () => { K.black(r, 0, 1.8); K.cutFade(r, 0); }
      }),
      // 2. боковой план: подходят и останавливаются
      at(6.5, 10.2, {
        at: [-4.4, 1.5, -6.5], to: [-3.6, 1.45, -7.3], look: [0.1, 1.3, -14], fov: 42, fovTo: 38, hand: 0.6, tense: 0.35,
        tick: (rr) => { const m = midTrio(1.3), cf = rr.camFree; cf.look.set(lerp(cf.look.x, m[0], 0.5), 1.35, m[2]); }
      }),
      // 3. крупно: игрок снимает шлем
      at(10.2, 12.9, {
        at: [1.45, 1.78, -9.4], to: [1.1, 1.74, -10.0], look: [0.2, 1.55, -12.7], lookTo: [0.2, 1.45, -12.7], fov: 34, fovTo: 30, hand: 0.5, tense: 0.5
      }),
      // 4. общий с юга: все трое раздеваются вокруг кучи
      at(12.9, 17.2, {
        at: [0.4, 1.4, -4.3], to: [1.0, 1.5, -5.0], look: [0.1, 1.1, -10.6], lookTo: [0.0, 1.0, -10.6], fov: 52, fovTo: 48, hand: 0.5, tense: 0.5
      }),
      // 5. низкий кадр у кучи: миниганы, броня, зажигалка
      at(17.2, 19.9, {
        at: [-1.3, 0.55, -7.4], to: [-0.9, 0.6, -7.9], look: [0.0, 0.5, -10.2], lookTo: [0.0, 0.7, -10.2], fov: 46, fovTo: 42, hand: 0.5, tense: 0.7
      }),
      // 6. костёр разгорается: лица в оранжевом свете
      at(19.9, 22.4, {
        at: [2.0, 0.75, -7.4], to: [1.2, 0.85, -7.9], look: [0.0, 0.6, -10.2], lookTo: [0.0, 0.8, -10.3], fov: 44, fovTo: 38, hand: 0.55, tense: 0.5
      }),
      // 7. Диктор протягивает пульт
      at(22.4, T.endA, {
        at: [1.5, 1.45, -8.1], to: [1.1, 1.5, -8.7], look: [-0.5, 1.3, -11.8], lookTo: [-0.3, 1.35, -12.0], fov: 42, fovTo: 35, hand: 0.5, tense: 0.7
      })
    ];

    // ---------------------------------------------------------- часть A (монтаж)
    r.fade(0, 0.01);
    actorPlace(p, START.p[0], START.p[1], 0, true); actorPlace(d, START.d[0], START.d[1], 0, true); actorPlace(g, START.g[0], START.g[1], 0, true);
    poseA(0, 0);
    try { await r.cinematic(shotsA); } finally { /* пропуск: ниже ставим конечное состояние */ }
    S.run = false; S.t = T.endA;
    while (fired < S.ev.length) { const e = S.ev[fired]; fired += 1; if (e[2]) { try { e[1](true); } catch (err) { console.error(err); } } }
    if (!S.ign) ignite(false);
    S.pieces.forEach((e) => { if (e.on && !e.rest) { const t2 = toPile(1.1); e.m.position.set(t2[0], groundY(t2[0], t2[1]) + e.ext, t2[1]); e.rest = true; e.v.set(0, 0, 0); } });
    poseA(T.endA, 0);
    if (S.rem !== 'p') giveRemote();
    K.black(r, 0, 0.01);
    r.sayId = (r.sayId || 0) + 1; try { r.sub.classList.remove('on'); } catch (e) { /* нет субтитров */ }

    // ---------------------------------------------------------- часть B: пульт в руках от первого лица (держим кадр, пока игрок не нажмёт)
    S.mode = 'B';
    st.exitS = S;
    const EYE = [SP.p[0], 1.6, SP.p[1]];
    const povTick = (rr, e, tt) => {
      const sway = Math.sin(S.live * 0.9) * 0.012, yawV = S.yawV;
      const pit = lerp(0.58, -0.07, sm(S.coverK)) + sway;
      const fx = Math.sin(yawV) * Math.cos(pit), fy = -Math.sin(pit), fz = Math.cos(yawV) * Math.cos(pit);
      const px = EYE[0] + Math.sin(yawV) * 0.06, py = EYE[1] - 0.04 + Math.sin(S.live * 1.6) * 0.004, pz = EYE[2] + Math.cos(yawV) * 0.06;
      const cf = rr.camFree; cf.pos.set(px, py, pz); cf.look.set(px + fx * 6, py + fy * 6, pz + fz * 6);
      // базис камеры: right = f × up
      const f = V(fx, fy, fz).normalize(), rgt = V(0, 1, 0).cross(f).normalize().negate(), up = V().crossVectors(rgt, f).normalize();
      void up;
      const right = V().crossVectors(f, V(0, 1, 0)).normalize(), u2 = V().crossVectors(right, f).normalize();
      const drop = lerp(0.07, 0.11, sm(S.coverK)), dist = lerp(0.5, 0.48, sm(S.coverK));
      const pos = V(px, py, pz).addScaledVector(f, dist).addScaledVector(u2, -drop);
      const m4 = new T3.Matrix4().makeBasis(right, u2, f), q = new T3.Quaternion().setFromRotationMatrix(m4);
      q.multiply(new T3.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.55));
      rem.g.position.copy(pos); rem.g.quaternion.copy(q);
      S.rp = { px: pos.x, py: pos.y, pz: pos.z, rx: right.x, rz: right.z, fx: f.x, fz: f.z, ux: u2.x };
    };
    const skipHint = r.qs('.m-skip'); if (skipHint) skipHint.style.display = 'none';
    const holdOff = K.hook(r, (dt) => {
      if (r.disposed) return;
      dt = Math.min(dt, 0.05);
      S.yawV += ((S.coverK > 0.01 ? PI : 0) - S.yawV) * (1 - Math.exp(-2.4 * dt));
      if (S.coverArm) { S.coverK = Math.min(1, S.coverK + dt / 0.5); }
      if (S.pressing) { S.press = Math.min(1, S.press + dt / 0.18); }
      remoteFx(dt);
    });
    const jShot = () => sh({ at: [EYE[0], EYE[1], EYE[2]], to: [EYE[0], EYE[1], EYE[2]], look: [EYE[0], 1.0, EYE[2] + 1], fov: 54, dur: 3600, hand: 0.3, tense: 0.4, frame: 0, tick: povTick });
    S.holdStop = false;
    r.fade(0, 0.01);
    const holdLoop = (async () => { while (!S.holdStop && !r.disposed) { await r.cinematic([jShot()]); if (!S.holdStop) await r.wait(0.01); } })();
    S.holdEnd = () => { S.holdStop = true; if (r.shotState && r.shotState.done) r.shotState.done(); };
    await r.wait(0.5);
    r.say(DIC, 'Do it, 083.', 1.8);
    await r.wait(1.4);

    // два нажатия: поднять крышку, нажать кнопку (кнопки на экране, клавиши E / Enter / Space, клик мыши)
    await new Promise((res) => {
      const el = document.createElement('div'); el.className = 'f48-rem';
      const bt = document.createElement('button'); bt.type = 'button'; bt.innerHTML = '<b>E</b>LIFT THE COVER'; el.appendChild(bt);
      r.layer.appendChild(el);
      try { document.exitPointerLock && document.pointerLockElement && document.exitPointerLock(); } catch (e) { /* не критично */ }
      let done = false, lastAct = 0;
      const clean = () => { document.removeEventListener('keydown', onKey, true); };
      const act = () => {
        const now = performance.now(); if (now - lastAct < 350) return; lastAct = now;
        if (S.stage === 0) {
          S.stage = 1; S.coverArm = true; K.snd(r, 'click', { k: 0.8 }); K.snd(r, 'slide', { k: 0.5 }); beep(r, 1900, 0.05, 0.08);
          bt.classList.remove('on'); setTimeout(() => { bt.innerHTML = '<b>E</b>PRESS'; bt.classList.add('red'); }, 400);
        } else if (S.stage === 1 && S.coverK > 0.9 && !done) {
          done = true; S.stage = 2; S.pressing = true; K.snd(r, 'click', { k: 1 }); beep(r, 1200, 0.18, 0.14);
          clean(); el.classList.remove('on'); setTimeout(() => { el.remove(); res(); }, 600);
        }
      };
      const onKey = (e) => { if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); act(); } };
      document.addEventListener('keydown', onKey, true);
      bt.addEventListener('click', act);
      void el.offsetWidth; el.classList.add('on');
    });
    await r.wait(0.55);
    beep(r, 880, 0.1, 0.1);

    // ---------------------------------------------------------- часть C: взрыв позади идущих
    S.holdEnd(); await holdLoop; holdOff();
    p.head.visible = true;
    S.mode = 'C'; S.tb = 0;
    rem.g.visible = false;
    B.go();
    K.snd(r, 'click', { k: 0.5 });
    p.armT = 0;
    const atB = (t0, t1, o) => sh(Object.assign({ dur: t1 - t0, sync: () => S.tb - t0 }, o));
    const shotsC = [
      // 1. низкий кадр с юга: они уходят, позади вспыхивают окна
      atB(0, 6.5, {
        at: [3.6, 0.9, 6.5], to: [3.0, 1.0, 5.4], look: [0, 6.0, -26], lookTo: [0, 5.5, -28], fov: 52, fovTo: 46, hand: 0.45, tense: 0.4,
        tick: (rr, e, tt) => { const cf = rr.camFree, m = midTrio(2.2); cf.look.set(lerp(cf.look.x, m[0], 0.12), lerp(cf.look.y, 4.2, 0.4), lerp(cf.look.z, -27, 0.9)); }
      }),
      // 2. боковой общий план справа: фасад, обрушение, облако пыли
      atB(6.5, 10.8, {
        at: [23, 2.6, 5.5], to: [21, 2.9, 3.0], look: [-6, 4.5, -20], lookTo: [-6, 4.8, -25], fov: 52, fovTo: 56, hand: 0.5, tense: 0.5
      }),
      // 3. близко спереди: идут к камере, за ними пыль и огонь
      atB(10.8, 16.2, {
        at: [-0.6, 0.9, 11.8], to: [0.2, 1.05, 11.0], look: [0, 1.5, 4], lookTo: [0, 1.7, 5.5], fov: 40, fovTo: 36, hand: 0.5, tense: 0.4,
        tick: (rr) => {
          const m = midTrio(1.5), cf = rr.camFree; cf.look.set(lerp(cf.look.x, m[0], 0.2), 1.55, m[2]);
          if (S.tb > 15.0 && !S.fadeOut) { S.fadeOut = true; K.black(r, 1, 1.1); }   // затемнение ещё внутри кинематографа (без вспышки HUD)
        }
      })
    ];
    r.sayId = (r.sayId || 0) + 1;
    try { await r.cinematic(shotsC); } finally { /* пропуск — сразу к чёрному */ }
    K.black(r, 1, 1.0);
    await r.wait(1.1);
    // уборка (здание остаётся на заднем плане до конца миссии — PH.end на чёрном)
    S.dead = true;
    try { off(); } catch (e) { /* уже снят */ }
    try { r.scene.remove(fl); r.scene.remove(scorch); } catch (e) { /* уже убраны */ }
    removePieces();
    try { r.scene.remove(rem.g); } catch (e) { /* уже убран */ }
    try { B.dispose(); } catch (e) { /* уже убран */ }
    st.exitP = null; F.rm(r, p);
  };
}());
