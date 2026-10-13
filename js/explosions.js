// NEXA: взрывы (C4, граната, бочка, бомба). Заменяет Run.explode из combat.js целиком (kit.js-обёртка с breakAt/alertAt тоже перекрыта — всё делается здесь).
//   • картинка: вспышка + световой импульс на сцену, огненный шар из спрайтов, ударная волна по полу, пылевое кольцо, расходящийся дым (прижимается к потолку),
//     обломки с физикой, искры-угольки, копоть на полу, догорающие бочки/бомбы; линза-рябь и «контузия» в постобработке (missions.js initPost: uShk/uCon/uAsp)
//   • камера: толчок, дрожь, крен, засвет — по расстоянию до камеры (в катсцене — до оператора; r.cineJolt в cinema.js)
//   • урон: крутой спад, смертельное ядро, укрытие (hasLOS), отброс игрока и врагов, труп летит от центра взрыва, цепная реакция бочек
//   • звук: snd.blast (sound.js) — удар, треск, хвост, дальность, звон в ушах
// Палитра — настоящее пламя: белое ядро → жёлтый → оранжевый → тёмно-красный → сажа (пятна сажи внутри огня), дым подсвечен огнём. Старая чёрно-белая — r.xfMono = true.
//   Добавлено (задача B): ударный купол-«гало», столб пыли, вторичные подрывы, пепел, дымные следы обломков, мерцающий свет, засвет экспозиции и марево над огнём (post-шейдер missions.js: uExp, uHaz).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.Run) return;
  const P = C.Run.prototype; // THREE подгружается позже скриптов — обращаемся к нему только внутри функций
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, k) => a + (b - a) * k;
  const sm = (a, b, v) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  const sgn = () => (Math.random() < 0.5 ? -1 : 1);

  // ------------------------------------------------------------ процедурные текстуры (один раз за страницу; CanvasTexture — свой на каждый прогон)
  const hs = (x, y, s) => { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
  const vn = (x, y, s) => { const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v); return lerp(lerp(hs(xi, yi, s), hs(xi + 1, yi, s), a), lerp(hs(xi, yi + 1, s), hs(xi + 1, yi + 1, s), a), b); };
  const fbm = (x, y, s) => vn(x, y, s) * 0.5 + vn(x * 2, y * 2, s + 3) * 0.28 + vn(x * 4, y * 4, s + 7) * 0.15 + vn(x * 8, y * 8, s + 11) * 0.07;
  const N = 128;
  const paint = (fn) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const cx = cv.getContext('2d'), im = cx.createImageData(N, N), d = im.data;
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1, o = (y * N + x) * 4, c = fn(u, v, Math.hypot(u, v), x / N, y / N);
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3];
      }
    }
    cx.putImageData(im, 0, 0);
    return cv;
  };
  const radial = (size, stops) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const cx = cv.getContext('2d'), h = size / 2, g = cx.createRadialGradient(h, h, 0, h, h, h);
    stops.forEach((s) => g.addColorStop(s[0], s[1]));
    cx.fillStyle = g; cx.fillRect(0, 0, size, size);
    return cv;
  };
  const smokeCv = (s) => paint((u, v, r, fx, fy) => {
    const n = fbm(fx * 3.4, fy * 3.4, s), w = fbm(fx * 6 + 5, fy * 6 + 9, s + 20);
    const e = 1 - sm(0.28, 0.96, r + (n - 0.5) * 0.95);
    const a = clamp(e * (0.62 + w * 0.7), 0, 1) * (1 - sm(0.82, 1, r));
    const g = Math.round(255 * clamp(0.62 - u * 0.17 - v * 0.22 + (n - 0.5) * 0.7, 0.18, 1)); // свет сверху-слева
    return [g, g, g, Math.round(a * 255)];
  });
  const fireCv = (s) => paint((u, v, r, fx, fy) => {
    const n = fbm(fx * 3.8, fy * 3.8, s), w = fbm(fx * 7 + 3, fy * 7 + 1, s + 9), rr = r + (n - 0.5) * 0.7;
    const hot = 1 - sm(0, 0.8, rr), a = clamp((1 - sm(0.22, 0.98, rr)) * (0.55 + w * 0.8), 0, 1) * (1 - sm(0.84, 1, r));
    const g = Math.round(255 * clamp(0.28 + hot * 0.9 + w * 0.15, 0, 1));
    return [g, g, g, Math.round(a * 255)];
  });
  const scorchCv = (s) => paint((u, v, r, fx, fy) => {
    const n = fbm(fx * 4, fy * 4, s), ray = vn(Math.atan2(v, u) * 3 + 20, r * 2.5, s + 5);
    const e = 1 - sm(0.25, 1, r + (n - 0.5) * 0.8 + (ray - 0.5) * 0.35 * r);
    return [0, 0, 0, Math.round(clamp(e * (0.5 + n * 0.8), 0, 1) * (1 - sm(0.9, 1, r)) * 255)];
  });
  // цвет пламени запечён в текстуру: h (жар) 0..1 → белое ядро / жёлтый / оранжевый / тёмно-красный / сажа
  const HEAT = [[0, [26, 6, 4]], [0.16, [88, 14, 6]], [0.34, [200, 50, 12]], [0.55, [255, 122, 24]], [0.74, [255, 196, 80]], [0.9, [255, 238, 178]], [1, [255, 252, 240]]];
  const heatRGB = (h) => {
    for (let i = 1; i < HEAT.length; i += 1) {
      if (h <= HEAT[i][0]) { const a = HEAT[i - 1], b = HEAT[i], k = (h - a[0]) / (b[0] - a[0]); return [a[1][0] + (b[1][0] - a[1][0]) * k, a[1][1] + (b[1][1] - a[1][1]) * k, a[1][2] + (b[1][2] - a[1][2]) * k]; }
    }
    return HEAT[HEAT.length - 1][1];
  };
  const fireWCv = (s) => paint((u, v, r, fx, fy) => {
    const n = fbm(fx * 3.8, fy * 3.8, s), w = fbm(fx * 7 + 3, fy * 7 + 1, s + 9), rr = r + (n - 0.5) * 0.7;
    const hot = 1 - sm(0, 0.8, rr), a = clamp((1 - sm(0.22, 0.98, rr)) * (0.55 + w * 0.8), 0, 1) * (1 - sm(0.84, 1, r));
    const soot = sm(0.58, 0.8, fbm(fx * 5.2 + 11, fy * 5.2 + 4, s + 31)) * sm(0.15, 0.55, r);   // тёмные «карманы» сажи в огне
    const c = heatRGB(clamp((0.2 + hot * 0.95 + w * 0.2) * (1 - soot * 0.8), 0, 1));
    return [c[0], c[1], c[2], Math.round(a * 255)];
  });
  let TX = null;
  const texs = () => TX || (TX = {
    fireW: [fireWCv(3), fireWCv(29), fireWCv(57)],
    halo: radial(128, [[0, 'rgba(255,255,255,0)'], [0.55, 'rgba(255,255,255,0)'], [0.8, 'rgba(255,236,214,0.3)'], [0.92, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]),
    smoke: [smokeCv(1), smokeCv(17), smokeCv(41)], fire: [fireCv(3), fireCv(29)], scorch: [scorchCv(2), scorchCv(13)],
    flash: radial(64, [[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,0.95)'], [0.4, 'rgba(255,255,255,0.32)'], [1, 'rgba(255,255,255,0)']]),
    dot: radial(32, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]),
    ring: radial(128, [[0, 'rgba(255,255,255,0)'], [0.62, 'rgba(255,255,255,0)'], [0.86, 'rgba(255,255,255,0.85)'], [0.95, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']])
  });

  // ------------------------------------------------------------ пулы объектов (создаются при инициализации боя: PointLight должен быть в сцене с самого начала, иначе все материалы перекомпилируются в момент взрыва)
  function xfInit(r) {
    if (r.xf) return r.xf;
    const sc = r.scene; if (!sc) return null;
    if (!v1) { v1 = new THREE.Vector3(); v2 = new THREE.Vector3(); }
    const k = clamp(((r.q && r.q.parts) || 12) / 20, 0.3, 1), tx = texs(), mk = (cv) => new THREE.CanvasTexture(cv);
    const fireT = (r.xfMono ? tx.fire : tx.fireW).map(mk), smokeT = tx.smoke.map(mk), flashT = mk(tx.flash), dotT = mk(tx.dot), ringT = mk(tx.ring), scT = tx.scorch.map(mk), haloT = mk(tx.halo);
    const X = r.xf = {
      k, t: 0, act: false, fire: [], smoke: [], deb: [], rings: [], decals: [], dcN: 0, burn: [], corp: [], last: null, dm: {}, halo: [], sec: [], exp: 0, hz: { x: 0, y: 1, z: 0, t: 99, R: 3 }, smokeLoad: 0, ash: null,
      lt: { t: 99, pk: 0, x: 0, y: 1, z: 0, d: 20 }, con: 0, shk: 0, sw: null, pv: { x: 0, z: 0 }, fl: { age: 9, dur: 0.17 }
    };
    const add = (o) => { o.visible = false; sc.add(o); return o; };
    const nF = Math.round(16 + 58 * k), nS = Math.round(24 + 104 * k), nD = Math.round(10 + 44 * k), nE = Math.round(20 + 140 * k);
    for (let i = 0; i < nF; i += 1) {
      const s = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: fireT[i % fireT.length], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 })));
      s.u = { on: false, v: new THREE.Vector3() }; X.fire.push(s);
    }
    for (let i = 0; i < nS; i += 1) {
      const s = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeT[i % smokeT.length], transparent: true, depthWrite: false, opacity: 0 })));
      s.u = { on: false, v: new THREE.Vector3() }; X.smoke.push(s);
    }
    X.flash = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: flashT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 })));
    for (let i = 0; i < 3; i += 1) {   // ударный купол (гало): расширяющаяся светлая оболочка
      const h = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: haloT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 })));
      h.u = { on: false }; X.halo.push(h);
    }
    X.light = new THREE.PointLight(0xffffff, 0, 24, 1.6); sc.add(X.light);
    const bg = new THREE.BoxGeometry(1, 1, 1);
    X.dmat = [0x2e2e2e, 0x5a5a5a, 0x8a8a8a].map((c) => (r.mat ? r.mat(c) : new THREE.MeshLambertMaterial({ color: c })));
    for (let i = 0; i < nD; i += 1) {
      const m = add(new THREE.Mesh(bg, X.dmat[i % 3]));
      m.u = { on: false, v: new THREE.Vector3(), w: new THREE.Vector3() }; X.deb.push(m);
    }
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(nE * 3), col = new Float32Array(nE * 3);
    for (let i = 0; i < nE; i += 1) pos[i * 3 + 1] = -100;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.11, map: dotT, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false }));
    pts.frustumCulled = false; sc.add(pts);
    X.emb = { pts, geo, pos, col, n: nE, v: new Float32Array(nE * 3), age: new Float32Array(nE), dur: new Float32Array(nE), live: 0 };
    { // пепел: серые хлопья, медленно оседают (обычное смешивание — тёмные на светлом)
      const nA = Math.round(24 + 96 * k), ag = new THREE.BufferGeometry(), ap = new Float32Array(nA * 3), ac = new Float32Array(nA * 3);
      for (let i = 0; i < nA; i += 1) ap[i * 3 + 1] = -100;
      ag.setAttribute('position', new THREE.BufferAttribute(ap, 3)); ag.setAttribute('color', new THREE.BufferAttribute(ac, 3));
      const apts = new THREE.Points(ag, new THREE.PointsMaterial({ size: 0.075, map: dotT, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, fog: false }));
      apts.frustumCulled = false; sc.add(apts);
      X.ash = { pts: apts, geo: ag, pos: ap, col: ac, n: nA, v: new Float32Array(nA * 3), age: new Float32Array(nA), dur: new Float32Array(nA), live: 0 };
    }
    const rg = new THREE.PlaneGeometry(1, 1); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i += 1) {
      const m = add(new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: ringT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, opacity: 0 })));
      m.u = { on: false }; X.rings.push(m);
    }
    const dg = new THREE.PlaneGeometry(1, 1); dg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i += 1) {
      const m = add(new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ map: scT[i % 2], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, opacity: 0 })));
      m.u = { on: false }; X.decals.push(m);
    }
    // шейдеры спрайтов/точек/колец и текстуры загружаются в GPU заранее, а не в момент первого взрыва
    setTimeout(() => {
      try {
        if (r.disposed || !r.renderer || !r.camera) return;
        r.renderer.compile(sc, r.camera);
        if (r.renderer.initTexture) [...fireT, ...smokeT, flashT, dotT, ringT, ...scT].forEach((t) => r.renderer.initTexture(t));
      } catch (e) {}
    }, 400);
    return X;
  }

  const free = (arr) => { for (let i = 0; i < arr.length; i += 1) if (!arr[i].u.on) return arr[i]; return null; };
  function puff(arr, o) {
    const s = free(arr); if (!s) return null;
    const u = s.u, m = s.material;
    u.on = true; u.age = -(o.delay || 0); u.dur = o.dur; u.v.set(o.vx || 0, o.vy || 0, o.vz || 0);
    u.s0 = o.s0; u.s1 = o.s1; u.op = o.op; u.c0 = o.c0; u.c1 = o.c1; u.drag = o.drag; u.rise = o.rise || 0; u.spin = o.spin || 0; u.fl = o.fl || 0; u.fi = o.fi || 0.18; u.fire = !!o.fire; u.dark = !!o.dark;
    s.position.set(o.x, o.y, o.z); s.scale.set(o.s0, o.s0, 1); s.visible = false;
    m.opacity = 0; m.rotation = rnd(0, 6.283); m.color.setScalar(o.c0);
    return s;
  }
  function chunk(X, o) {
    const m = free(X.deb); if (!m) return;
    const u = m.u, sz = o.size;
    u.trail = o.trail ? 0 : -1;   // дымный след (только у части обломков)
    u.on = true; u.age = 0; u.dur = o.dur; u.rest = false; u.v.set(o.vx, o.vy, o.vz); u.w.set(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12));
    u.sx = sz * rnd(0.6, 1.5); u.sy = sz * rnd(0.5, 1.2); u.sz = sz * rnd(0.6, 1.5); u.h = Math.min(u.sx, u.sy, u.sz) * 0.5;
    if (o.mat) m.material = o.mat; else m.material = X.dmat[Math.floor(Math.random() * 3)];
    m.position.set(o.x, o.y, o.z); m.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); m.scale.set(u.sx, u.sy, u.sz); m.visible = true;
  }
  function ember(X, x, y, z, sp, up) {
    const E = X.emb; let i = -1;
    for (let j = 0; j < E.n; j += 1) if (E.age[j] >= E.dur[j]) { i = j; break; }
    if (i < 0) return;
    const a = rnd(0, 6.283), c = rnd(-0.35, 1), h = Math.sqrt(1 - c * c) * sp;
    E.pos[i * 3] = x; E.pos[i * 3 + 1] = y; E.pos[i * 3 + 2] = z;
    E.v[i * 3] = Math.cos(a) * h; E.v[i * 3 + 1] = c * sp * up + 1; E.v[i * 3 + 2] = Math.sin(a) * h;
    E.age[i] = 0; E.dur[i] = rnd(0.7, 2.2); E.live += 1;
  }

  function ash(X, x, y, z, sp) {
    const A = X.ash; if (!A) return; let i = -1;
    for (let j = 0; j < A.n; j += 1) if (A.age[j] >= A.dur[j]) { i = j; break; }
    if (i < 0) return;
    const a = rnd(0, 6.283), c = rnd(-0.1, 1), h = Math.sqrt(1 - c * c) * sp;
    A.pos[i * 3] = x; A.pos[i * 3 + 1] = y; A.pos[i * 3 + 2] = z;
    A.v[i * 3] = Math.cos(a) * h * 0.6; A.v[i * 3 + 1] = c * sp * 0.7 + 1.2; A.v[i * 3 + 2] = Math.sin(a) * h * 0.6;
    A.age[i] = 0; A.dur[i] = rnd(2.4, 5.2); A.live += 1;
    const g = rnd(0.16, 0.5); A.col[i * 3] = g; A.col[i * 3 + 1] = g; A.col[i * 3 + 2] = g;
  }

  // ------------------------------------------------------------ картинка взрыва
  let v1 = null, v2 = null;
  P.blastFx = function (x, y, z, R, kind) {
    const X = xfInit(this); if (!X) return;
    const k = X.k, Rv = Math.min(R, 7.5), s = Rv / 4.8, rs = Math.sqrt(s), big = kind === 'bomb', cam = this.camera.position;
    const gy = clamp(y, 0.3, 1.3), ground = y < 2.2;
    X.act = true; X.last = { x, y, z, t: X.t };
    // вспышка и свет сцены
    const warm = !this.xfMono;
    X.light.color.setHex(warm ? 0xffb066 : 0xffffff); X.flash.material.color.setHex(warm ? 0xffecc8 : 0xffffff);
    X.fl.age = 0; X.fl.dur = 0.17 + 0.05 * rs; X.flash.position.set(x, gy, z); X.flash.scale.set(Rv * 3.3, Rv * 3.3, 1); X.flash.visible = true; X.flash.material.opacity = 1;
    const L = X.lt; L.pk = Math.max(L.t < 6 ? L.pk * (0.7 * Math.exp(-L.t * 10) + 0.3 * Math.exp(-L.t * 1.8)) : 0, 4.5 + 2.2 * rs); L.t = 0; L.x = x; L.y = Math.max(gy, 0.9) + 0.3; L.z = z; L.d = Rv * 5;
    // огненный шар
    const nf = clamp(Math.round((9 + Rv * 2.4) * k), 5, 30);
    for (let i = 0; i < nf; i += 1) {
      const a = rnd(0, 6.283), rr = Rv * rnd(0.02, 0.2), sp = rnd(0.4, 2.2) * rs;
      puff(X.fire, { x: x + Math.cos(a) * rr, y: gy + rnd(-0.15, 0.55) * Rv * 0.3, z: z + Math.sin(a) * rr, vx: Math.cos(a) * sp, vy: rnd(0.9, 3.4) * rs, vz: Math.sin(a) * sp,
        s0: Rv * rnd(0.28, 0.45), s1: Rv * rnd(0.95, 1.55), dur: rnd(0.6, 1.1) * (big ? 1.35 : 1), op: rnd(0.7, 1), c0: 1, c1: 0.16, drag: 1.6, rise: 0.8, spin: rnd(-1.2, 1.2), fl: 0.22, fire: true });
    }
    if (warm) { // сажа внутри огня: тёмные клубы проступают, пока пламя ещё горит
      for (let i = 0, n = clamp(Math.round((4 + Rv * 1.2) * k), 2, 14); i < n; i += 1) {
        const a = rnd(0, 6.283), rr = Rv * rnd(0.05, 0.4), sp = rnd(0.3, 1.4) * rs;
        puff(X.smoke, { x: x + Math.cos(a) * rr, y: gy + rnd(0.1, 0.9) * Rv * 0.5, z: z + Math.sin(a) * rr, vx: Math.cos(a) * sp, vy: rnd(1.4, 3.6) * rs, vz: Math.sin(a) * sp, delay: rnd(0.06, 0.28),
          s0: Rv * rnd(0.25, 0.4), s1: Rv * rnd(0.8, 1.3), dur: rnd(1.4, 2.6) * (big ? 1.4 : 1), op: rnd(0.55, 0.85), c0: 0.07, c1: 0.1, drag: 1.3, rise: 0.4, spin: rnd(-0.5, 0.5), fl: 0.3, fi: 0.1, dark: true });
      }
    }
    { const h = free(X.halo); if (h) { h.u.on = true; h.u.age = 0; h.u.dur = 0.3 + 0.1 * rs; h.u.r0 = Rv * 0.9; h.u.r1 = Rv * (big ? 4.2 : 3.2); h.position.set(x, gy + 0.2, z); h.visible = true; h.material.opacity = 0; } }
    if (ground) {
      for (let i = 0, n = clamp(Math.round(3 * k), 1, 4); i < n; i += 1) { // столб пыли и дыма, увлечённый огненным шаром
        puff(X.smoke, { x: x + rnd(-0.3, 0.3) * Rv * 0.4, y: 0.3, z: z + rnd(-0.3, 0.3) * Rv * 0.4, vx: rnd(-1, 1) * rs, vy: rnd(4, 7) * rs, vz: rnd(-1, 1) * rs, delay: rnd(0, 0.12),
          s0: Rv * 0.28, s1: Rv * rnd(0.9, 1.4), dur: rnd(1.6, 2.8), op: 0.45, c0: 0.46, c1: 0.2, drag: 1.4, rise: 0.15, spin: rnd(-0.4, 0.4), fl: 0.2, fi: 0.08 });
      }
    }
    if (ground) {
      for (let i = 0, n = Math.round(5 * k); i < n; i += 1) { // языки пламени по полу
        const a = rnd(0, 6.283), sp = rnd(5, 10) * rs;
        puff(X.fire, { x, y: 0.35, z, vx: Math.cos(a) * sp, vy: rnd(0.2, 1), vz: Math.sin(a) * sp, s0: Rv * 0.2, s1: Rv * rnd(0.45, 0.7), dur: rnd(0.3, 0.55), op: 0.8, c0: 0.95, c1: 0.2, drag: 3.2, rise: 0.5, spin: rnd(-2, 2), fl: 0.3, fire: true });
      }
    }
    // дым: растёт и поднимается, под потолком расползается
    const ns = clamp(Math.round((8 + Rv * 2.2) * k), 4, 26);
    for (let i = 0; i < ns; i += 1) {
      const a = rnd(0, 6.283), rr = Rv * rnd(0.03, 0.3), sp = rnd(0.3, 1.6) * rs;
      puff(X.smoke, { x: x + Math.cos(a) * rr, y: gy + rnd(0, 0.6) * Rv * 0.3, z: z + Math.sin(a) * rr, vx: Math.cos(a) * sp, vy: rnd(1, 3) * rs, vz: Math.sin(a) * sp, delay: rnd(0.03, 0.32),
        s0: Rv * rnd(0.35, 0.55), s1: Rv * rnd(1.2, 2), dur: rnd(2.8, 5.2) * (big ? 1.5 : 1), op: rnd(0.5, 0.75), c0: 0.62, c1: 0.13, drag: 1.1, rise: 0.25, spin: rnd(-0.25, 0.25), fl: 0.3, fi: 0.2 });
    }
    // пылевое кольцо и ударная волна
    if (ground) {
      for (let i = 0, n = clamp(Math.round(11 * k), 4, 12); i < n; i += 1) {
        const a = (i / n) * 6.283 + rnd(-0.25, 0.25), sp = rnd(4.5, 9) * rs;
        puff(X.smoke, { x: x + Math.cos(a) * Rv * 0.2, y: 0.25, z: z + Math.sin(a) * Rv * 0.2, vx: Math.cos(a) * sp, vy: rnd(0, 0.5), vz: Math.sin(a) * sp,
          s0: 0.6 * rs, s1: rnd(1.8, 3) * rs, dur: rnd(0.9, 1.6), op: 0.34, c0: 0.5, c1: 0.3, drag: 2.6, rise: 0.1, spin: rnd(-0.4, 0.4), fl: 0.45, fi: 0.06 });
      }
      [[0, 0.55, Rv * 2, 0.55], [0.07, 0.5, Rv * 1.35, 0.3]].forEach((q) => {
        const m = free(X.rings); if (!m) return;
        m.u.on = true; m.u.age = -q[0]; m.u.dur = q[1]; m.u.r1 = q[2]; m.u.op = q[3]; m.position.set(x, 0.05, z); m.visible = false;
      });
    }
    // обломки и угольки
    const nb = clamp(Math.round((6 + Rv * 2.6) * k), 3, 36);
    for (let i = 0; i < nb; i += 1) {
      const a = rnd(0, 6.283), sp = rnd(2, 8.5) * rs;
      chunk(X, { x: x + rnd(-0.3, 0.3), y: gy, z: z + rnd(-0.3, 0.3), vx: Math.cos(a) * sp, vy: rnd(2.5, 8) * rs, vz: Math.sin(a) * sp, size: rnd(0.05, 0.2) * (0.7 + 0.3 * rs), dur: rnd(1.8, 3.2) });
    }
    for (let i = 0, n = clamp(Math.round((10 + Rv * 5) * k), 6, 60); i < n; i += 1) ember(X, x + rnd(-0.3, 0.3), gy, z + rnd(-0.3, 0.3), rnd(2.5, 11) * rs, 0.9);
    // дымный след у быстрых обломков, пепел, вторичные подрывы, марево
    { const ntr = k > 0.5 ? clamp(Math.round(nb * 0.3), 2, 10) : 0; for (let i = 0; i < ntr; i += 1) { const m = X.deb.find((o) => o.u.on && o.u.age < 0.05 && o.u.trail < 0); if (m) m.u.trail = 0; } }
    for (let i = 0, n = clamp(Math.round((8 + Rv * 6) * k), 5, 90); i < n; i += 1) ash(X, x + rnd(-0.4, 0.4), gy + 0.3, z + rnd(-0.4, 0.4), rnd(2, 8) * rs);
    if (Rv >= 5.4) {
      for (let i = 0, n = big ? 3 : 1; i < n; i += 1) X.sec.push({ at: X.t + rnd(0.14, 0.5) + i * 0.13, x: x + rnd(-0.35, 0.35) * Rv, y: gy + rnd(0, 0.5), z: z + rnd(-0.35, 0.35) * Rv, R: Rv * rnd(0.34, 0.5) });
    }
    X.hz.x = x; X.hz.y = gy + Rv * 0.6; X.hz.z = z; X.hz.t = 0; X.hz.R = Rv;
    // копоть на полу
    if (y < 1.8) {
      const m = X.decals[X.dcN % X.decals.length]; X.dcN += 1;
      m.u.on = true; m.u.age = 0; m.position.set(x, 0.012 + (X.dcN % 6) * 0.0009, z); m.rotation.y = rnd(0, 6.283); m.scale.set(Rv * rnd(1, 1.25), 1, Rv * rnd(1, 1.25)); m.material.opacity = 0; m.visible = true;
    }
    // догорающая бочка / бомба
    if ((kind === 'barrel' || big) && ground && !X.burn.some((b) => Math.hypot(b.x - x, b.z - z) < 1.2)) {
      X.burn.push({ x, z, t: 0, dur: big ? 18 : 11, sc: big ? 2 : 1, a: 0.2, b: 0.4 }); if (X.burn.length > 3) X.burn.shift();
    }
    // на игрока / оператора: расстояние до камеры
    const dL = Math.hypot(cam.x - x, (cam.y - y) * 0.6, cam.z - z), pk = clamp(1 - dL / (R * 2.6), 0, 1);
    if (pk > 0) {
      this.camera.getWorldDirection(v1); v2.set(x - cam.x, y - cam.y, z - cam.z).normalize();
      const wf = pk * (0.55 + 0.45 * Math.max(0, v1.dot(v2))), amp = pk * Math.min(1.5, rs * 1.1);
      this.kick(sgn() * 0.07 * amp + 0.03 * amp, sgn() * 0.05 * amp, sgn() * 0.07 * amp, 0.05 + 0.2 * amp);
      X.shk = Math.max(X.shk, 0.02 + 0.13 * amp); X.con = Math.max(X.con, Math.min(1, pk * 1.15));
      X.exp = Math.max(X.exp, Math.min(1, 0.25 + wf * 0.95));
      this.cineJolt && this.cineJolt(amp * 1.3);
      if (pk > 0.12) { this.rumble(Math.min(1, pk * 1.3), Math.min(1, pk), 160 + 420 * pk); if (wf > 0.1) this.flash(0.14 + 1.15 * wf).catch(() => {}); }
      if (pk > 0.5 && this.p) this.stress = Math.min(1, (this.stress || 0) + 0.25 * pk);
    }
    X.sw = { x, y: gy, z, t0: X.t, dur: 0.95, R: Rv, big: rs };
    if (this.snd) { if (this.snd.blast) this.snd.blast({ dist: dL, R, kind, near: pk, at: [x, Math.max(0.3, y), z] }); else this.snd.play('boom'); }
  };

  // вторичный подрыв (топливо, боеприпасы, баллон): короткая вспышка, комок огня, искры и свет
  P.blastSub = function (x, y, z, Rv) {
    const X = this.xf; if (!X) return;
    const k = X.k, rs = Math.sqrt(Rv / 4.8), warm = !this.xfMono;
    for (let i = 0, n = clamp(Math.round(7 * k), 3, 9); i < n; i += 1) {
      const a = rnd(0, 6.283), sp = rnd(0.6, 2.6) * rs;
      puff(X.fire, { x: x + Math.cos(a) * Rv * 0.1, y: y + rnd(0, 0.3), z: z + Math.sin(a) * Rv * 0.1, vx: Math.cos(a) * sp, vy: rnd(1.2, 3.4) * rs, vz: Math.sin(a) * sp, s0: Rv * rnd(0.5, 0.8), s1: Rv * rnd(1.4, 2.1), dur: rnd(0.4, 0.8), op: rnd(0.75, 1), c0: 1, c1: 0.15, drag: 1.7, rise: 0.8, spin: rnd(-1.2, 1.2), fl: 0.2, fire: true });
    }
    for (let i = 0, n = clamp(Math.round(3 * k), 1, 4); i < n; i += 1) {
      puff(X.smoke, { x: x + rnd(-0.2, 0.2), y: y + 0.2, z: z + rnd(-0.2, 0.2), vx: rnd(-0.8, 0.8), vy: rnd(1.4, 3), vz: rnd(-0.8, 0.8), delay: rnd(0.05, 0.2), s0: Rv * 0.6, s1: Rv * rnd(1.4, 2.2), dur: rnd(2, 3.4), op: 0.55, c0: 0.1, c1: 0.12, drag: 1.2, rise: 0.35, spin: rnd(-0.3, 0.3), fl: 0.3, fi: 0.12, dark: warm });
    }
    const h = free(X.halo); if (h) { h.u.on = true; h.u.age = 0; h.u.dur = 0.26; h.u.r0 = Rv * 0.8; h.u.r1 = Rv * 3; h.position.set(x, y + 0.2, z); h.visible = true; h.material.opacity = 0; }
    for (let i = 0, n = clamp(Math.round(14 * k), 5, 24); i < n; i += 1) ember(X, x, y, z, rnd(3, 10) * rs, 0.9);
    const L = X.lt, cur = L.t < 6 ? L.pk * (0.7 * Math.exp(-L.t * 10) + 0.3 * Math.exp(-L.t * 1.8)) : 0;
    L.pk = Math.max(cur, 2.8 + 2 * rs); L.t = 0; L.x = x; L.y = y + 0.5; L.z = z; L.d = Math.max(L.d, Rv * 7);
    this.sparks(x, y, z, 0, 1, 0, 8);
    X.act = true;
    const cam = this.camera.position, d = Math.hypot(cam.x - x, cam.z - z);
    if (d < 14) { X.shk = Math.max(X.shk, 0.02 + 0.04 * (1 - d / 14)); X.exp = Math.max(X.exp, 0.12 * (1 - d / 14)); }
    if (this.snd) { try { this.snd.play('boom', { k: 0.5, delay: d / 340 }); } catch (e) { /* звук необязателен */ } }
  };

  // обломки разрушаемой стены (shatter из kit.js): летят от последнего взрыва, плюс облако пыли
  P.debrisBurst = function (b) {
    const X = xfInit(this); if (!X) return;
    const k = X.k, lst = X.last && X.t - X.last.t < 0.6 ? X.last : null;
    const mat = X.dm[b.col] || (X.dm[b.col] = this.mat ? this.mat(b.col) : null);
    X.act = true;
    for (let i = 0, n = clamp(Math.round((8 + b.w * b.d * 0.9 + b.h * 3) * k), 5, 44); i < n; i += 1) {
      const px = b.x + rnd(-0.5, 0.5) * b.w, py = rnd(0.15, Math.max(0.3, b.h - 0.1)), pz = b.z + rnd(-0.5, 0.5) * b.d;
      let dx = lst ? px - lst.x : rnd(-1, 1), dz = lst ? pz - lst.z : rnd(-1, 1); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const sp = rnd(1.5, 7);
      chunk(X, { x: px, y: py, z: pz, vx: dx * sp + rnd(-1, 1), vy: rnd(1, 6), vz: dz * sp + rnd(-1, 1), size: rnd(0.08, 0.34), dur: rnd(2.2, 4), mat });
    }
    const Rw = Math.max(b.w, b.d, 2);
    for (let i = 0, n = clamp(Math.round(7 * k), 3, 8); i < n; i += 1) {
      puff(X.smoke, { x: b.x + rnd(-0.5, 0.5) * b.w, y: rnd(0.4, Math.max(0.6, b.h * 0.7)), z: b.z + rnd(-0.5, 0.5) * b.d, vx: rnd(-1, 1) * 1.2, vy: rnd(0.3, 1.2), vz: rnd(-1, 1) * 1.2, delay: rnd(0, 0.3),
        s0: Rw * 0.3, s1: Rw * rnd(0.8, 1.4), dur: rnd(3.5, 6), op: 0.55, c0: 0.5, c1: 0.2, drag: 1.4, rise: 0.15, spin: rnd(-0.2, 0.2), fl: 0.3, fi: 0.25 });
    }
  };
  const shatter0 = P.shatter;
  if (shatter0) {
    P.shatter = function (b) {
      const was = b.broken;
      shatter0.call(this, b);
      if (!was && b.broken) { try { this.debrisBurst(b); } catch (e) { console.error('[explosions]', e); } }
    };
  }

  // ------------------------------------------------------------ сам взрыв: картинка + урон
  P.explode = function (x, y, z, R, dmg, kind) {
    const cb = this.cb; if (!cb || this.disposed) return;
    kind = kind || (R >= 8 ? 'bomb' : 'frag');
    const X = xfInit(this), list = cb.enemies.slice();
    this.blastFx(x, y, z, R, kind);
    this.breakAt && this.breakAt(x, z, R); // стена рушится первой — волна проходит в пролом
    this.alertAt && this.alertAt(x, z, R * 5);
    const oy = clamp(y, 0.45, 1.4), p = this.p, d = Math.hypot(p.x - x, p.z - z);
    const fall = (dd) => (dd < R * 0.22 ? 1.6 : 1 - dd / R); // у самого заряда — смертельное ядро
    if (d < R) {
      const los = this.hasLOS(x, oy, z, p.x, 1.2, p.z), f = fall(d) * (los ? 1 : 0.35);
      this.hurt(dmg * 0.6 * f, x, z);
      if (X && !this.inCinema && !(this.cineDepth > 0)) { // отброс от центра
        const l = d || 1, ux = d > 0.2 ? (p.x - x) / l : sgn(), uz = d > 0.2 ? (p.z - z) / l : sgn(), kn = Math.min(7, 7 * clamp(1 - d / R, 0, 1) * (los ? 1 : 0.4));
        X.pv.x += ux * kn; X.pv.z += uz * kn;
      }
    }
    list.forEach((e) => {
      if (e.dead || !e.n) return;
      const ed = Math.hypot(e.x - x, e.z - z);
      if (ed >= R * 1.15) return;
      const los = this.hasLOS(x, oy, z, e.x, 1.1, e.z);
      if (ed >= R) { if (los) e.stagger = Math.max(e.stagger || 0, 0.5); return; }
      const f = fall(ed), l = ed || 1, ux = ed > 0.2 ? (e.x - x) / l : sgn(), uz = ed > 0.2 ? (e.z - z) / l : sgn();
      e.n.blast = { x, z, f, t: performance.now() }; // рэгдолл (ragdoll.js) бросает тело по радиусу от заряда
      this.damageEnemy(e, (dmg * 2.2 * f + 20) * (los ? 1 : 0.4), false);
      if (!X) return;
      if (e.dead) {
        if (e.n.death && e.n.death.rag) { /* тело уже летит физикой рэгдолла */ } else if (f > 0.3) { // труп падает от центра взрыва и летит
          e.n.death = null; this.actorKill(e.n, false, { x, z });
          const sp = 3 + 8 * Math.min(1, f);
          X.corp.push({ e, vx: ux * sp, vz: uz * sp, vy: 2.5 + 4.5 * Math.min(1, f), y: 0, t: 0, dur: 1.4, air: true }); X.act = true;
        }
      } else {
        e.stagger = Math.max(e.stagger || 0, 0.6 + 0.9 * Math.min(1, f));
        X.corp.push({ e, vx: ux * 4.5 * Math.min(1, f), vz: uz * 4.5 * Math.min(1, f), vy: 0, y: 0, t: 0, dur: 0.4, air: false }); X.act = true;
      }
    });
    cb.shoot.slice().forEach((s) => {
      if (!s.barrel || !s.alive) return;
      const bd = Math.hypot(s.x - x, s.z - z);
      if (bd < R) setTimeout(() => { if (!this.disposed) s.damage(99); }, 110 + bd * 35 + rnd(0, 60)); // цепная реакция бочек
    });
  };

  // ------------------------------------------------------------ покадровое обновление
  function stepPuff(r, X, s, dt, cam, ceilY) {
    const u = s.u; if (!u.on) return;
    u.age += dt;
    if (u.age < 0) return;
    const k = u.age / u.dur;
    if (k >= 1) { u.on = false; s.visible = false; return; }
    s.visible = true;
    u.v.multiplyScalar(Math.exp(-u.drag * dt)); u.v.y += u.rise * dt;
    s.position.addScaledVector(u.v, dt);
    const sz = lerp(u.s0, u.s1, 1 - (1 - k) * (1 - k));
    if (s.position.y > ceilY) { s.position.y = ceilY; if (u.v.y > 0) { u.v.x *= 1 + dt * 2; u.v.z *= 1 + dt * 2; u.v.y = 0; } } // дым ложится под потолок
    const fl = sz * u.fl; if (s.position.y < fl) s.position.y = fl;
    s.scale.set(sz, sz, 1);
    const m = s.material;
    m.rotation += u.spin * dt;
    let a = u.fire ? Math.min(1, u.age / 0.04) * Math.pow(1 - k, 1.3) : Math.min(1, u.age / u.fi) * (1 - sm(0.45, 1, k));
    a *= clamp((s.position.distanceTo(cam) - 0.35) / (0.8 + sz * 0.3), 0, 1); // вплотную к камере — растворяется
    m.opacity = a * u.op;
    const cc = lerp(u.c0, u.c1, Math.pow(k, 0.6));
    if (r.xfMono || u.dark) m.color.setScalar(cc);                                      // чёрно-белая палитра (r.xfMono) и сажа
    else if (u.fire) m.color.setRGB(Math.min(1, cc * 1.4), Math.pow(cc, 1.15), Math.pow(cc, 1.9));   // остывание: белый → жёлтый → оранжевый → тёмно-красный
    else { const w = (1 - k) * (1 - k); m.color.setRGB(cc * (1 + 0.22 * w), cc * (1 + 0.04 * w), cc * (1 - 0.16 * w)); } // дым, подсвеченный огнём
  }

  function xfUpdate(r, dt) {
    const X = r.xf; if (!X) return;
    const cam = r.camera, camp = cam.position;
    X.t += dt;
    // ударная волна / контузия — затухают сами, даже когда пулы пусты
    X.con = Math.max(0, X.con - dt / 2.6); X.exp = Math.max(0, X.exp - dt * 2.4); X.hz.t += dt; X.shk = Math.max(0, X.shk * Math.exp(-dt * 3.2) - dt * 0.002);
    { // вклад взрыва в тряску камеры прибавляется и снимается сам (раньше брался максимум и пик оставался в r.shakeAmp навсегда → экран трясся до конца миссии)
      const out = X.shk > 0.004 ? X.shk : 0, prev = X.shkOut || 0;
      X.shkOut = out;
      if (out !== prev) r.shakeAmp = Math.max(0, (r.shakeAmp || 0) - prev + out);
    }
    if (X.sw && X.t - X.sw.t0 > X.sw.dur) X.sw = null;
    // отброс игрока
    const pv = X.pv, p = r.p;
    if (pv.x || pv.z) {
      if (r.inCinema || r.cineDepth > 0 || r.dead) { pv.x = pv.z = 0; } else {
        const nx = p.x + pv.x * dt, nz = p.z + pv.z * dt;
        if (!r.blocked(nx, p.z)) p.x = nx; else pv.x = 0;
        if (!r.blocked(p.x, nz)) p.z = nz; else pv.z = 0;
        const f = Math.exp(-dt * 5.5); pv.x *= f; pv.z *= f;
        if (Math.hypot(pv.x, pv.z) < 0.15) pv.x = pv.z = 0;
      }
    }
    // трупы и отброшенные враги (после updateEnemies — позиция тела перезаписывается поверх позы падения)
    for (let i = X.corp.length - 1; i >= 0; i -= 1) {
      const c = X.corp[i], e = c.e, g = e.n && e.n.g; c.t += dt;
      if (!g || c.t > c.dur) { X.corp.splice(i, 1); continue; }
      if (c.air) {
        c.vy -= 9.8 * dt; c.y += c.vy * dt;
        if (c.y < 0) { c.y = 0; c.vy = c.vy < -2.5 ? -c.vy * 0.22 : 0; c.vx *= 0.7; c.vz *= 0.7; }
        if (c.y <= 0.001) { const f = Math.exp(-dt * 5); c.vx *= f; c.vz *= f; }
      } else { const f = Math.exp(-dt * 7); c.vx *= f; c.vz *= f; }
      const ps = g.position, nx = ps.x + c.vx * dt, nz = ps.z + c.vz * dt; // e.x/e.z у врага — только чтение (геттеры от позиции тела)
      if (!r.blockedE(nx, ps.z)) ps.x = nx; else c.vx *= -0.2;
      if (!r.blockedE(ps.x, nz)) ps.z = nz; else c.vz *= -0.2;
      if (c.air) g.position.y = Math.max(g.position.y, c.y + 0.11);
    }
    // световой импульс (+ свет догорающих бочек)
    const L = X.lt; L.t += dt;
    const bi = L.t < 6 ? L.pk * (0.7 * Math.exp(-L.t * 10) + 0.3 * Math.exp(-L.t * 1.8)) : 0;
    let gi = 0, gb = null;
    X.burn.forEach((b) => { const g = 1.1 * b.sc * (1 - sm(0.6, 1, b.t / b.dur)) * (0.8 + 0.2 * Math.sin(X.t * 23 + b.x) * Math.sin(X.t * 11 + b.z) + rnd(-0.1, 0.1)); if (g > gi) { gi = g; gb = b; } });
    if (bi >= gi) {
      X.light.position.set(L.x, L.y, L.z); X.light.distance = L.d;
      X.light.intensity = bi * (0.86 + 0.14 * Math.sin(X.t * 47 + 1.3) * Math.sin(X.t * 29 + 0.4) + rnd(-0.05, 0.05));
      if (!r.xfMono) { const e = clamp(L.t / 3, 0, 1); X.light.color.setRGB(1, lerp(0.76, 0.36, e), lerp(0.46, 0.14, e)); }
    } else { X.light.position.set(gb.x, 0.9, gb.z); X.light.distance = 7 * gb.sc; X.light.intensity = gi; }
    if (L.t > 6 && !X.burn.length) X.light.intensity = 0;
    if (!X.act && !X.burn.length) return;
    const ceilY = r.bounds ? r.bounds.h - 0.15 : 99;
    // вспышка
    const F = X.fl; F.age += dt;
    if (F.age < F.dur) { const k = 1 - F.age / F.dur; X.flash.material.opacity = k * k; } else if (X.flash.visible) { X.flash.visible = false; }
    for (const s of X.fire) stepPuff(r, X, s, dt, camp, ceilY);
    { let used = 0; for (const s of X.smoke) { stepPuff(r, X, s, dt, camp, ceilY); if (s.u.on) used += 1; } X.smokeLoad = used / X.smoke.length; }
    for (const h of X.halo) {   // ударный купол: быстро расширяется и гаснет
      const u = h.u; if (!u.on) continue;
      u.age += dt; const k = u.age / u.dur;
      if (k >= 1) { u.on = false; h.visible = false; continue; }
      const sz = lerp(u.r0, u.r1, 1 - Math.pow(1 - k, 2.4)) * 2;
      h.scale.set(sz, sz, 1); h.material.opacity = 0.5 * Math.pow(1 - k, 1.7) * Math.min(1, u.age / 0.03);
    }
    for (let i = X.sec.length - 1; i >= 0; i -= 1) {   // вторичные подрывы по расписанию
      const q = X.sec[i];
      if (X.t >= q.at) { X.sec.splice(i, 1); try { r.blastSub(q.x, q.y, q.z, q.R); } catch (e) { console.error('[explosions]', e); } }
    }
    const A = X.ash;
    if (A && A.live > 0) {   // пепел
      let live = 0;
      for (let i = 0; i < A.n; i += 1) {
        if (A.age[i] >= A.dur[i]) { A.col[i * 3] = A.col[i * 3 + 1] = A.col[i * 3 + 2] = 0; A.pos[i * 3 + 1] = -100; continue; }
        A.age[i] += dt; live += 1;
        const f = Math.exp(-dt * 1.4), j = i * 3;
        A.v[j] = A.v[j] * f + Math.sin(X.t * 2.3 + i) * 0.25 * dt; A.v[j + 1] = A.v[j + 1] * f - 0.55 * dt; A.v[j + 2] = A.v[j + 2] * f + Math.cos(X.t * 1.9 + i * 1.3) * 0.25 * dt;
        A.pos[j] += A.v[j] * dt; A.pos[j + 1] = Math.max(0.02, A.pos[j + 1] + A.v[j + 1] * dt); A.pos[j + 2] += A.v[j + 2] * dt;
        if (A.pos[j + 1] <= 0.02) { A.v[j] *= 0.5; A.v[j + 2] *= 0.5; A.v[j + 1] = 0; }
      }
      A.live = live;
      A.geo.attributes.position.needsUpdate = true; A.geo.attributes.color.needsUpdate = true;
    }
    // догорание
    for (let i = X.burn.length - 1; i >= 0; i -= 1) {
      const b = X.burn[i]; b.t += dt;
      if (b.t > b.dur) { X.burn.splice(i, 1); continue; }
      const fade = 1 - sm(0.65, 1, b.t / b.dur);
      b.a -= dt; b.b -= dt;
      if (b.a <= 0) {
        b.a = rnd(0.07, 0.14) / Math.max(0.3, fade);
        if (Math.random() < fade) puff(X.fire, { x: b.x + rnd(-0.2, 0.2) * b.sc, y: 0.25, z: b.z + rnd(-0.2, 0.2) * b.sc, vx: rnd(-0.2, 0.2), vy: rnd(1.1, 2), vz: rnd(-0.2, 0.2), s0: 0.55 * b.sc, s1: 0.15 * b.sc, dur: rnd(0.35, 0.6), op: 0.75, c0: 0.9, c1: 0.3, drag: 0.8, rise: 0.4, spin: rnd(-2, 2), fl: 0.1, fire: true });
      }
      if (b.b <= 0) {
        b.b = rnd(0.25, 0.45);
        puff(X.smoke, { x: b.x + rnd(-0.15, 0.15), y: 0.7 * b.sc, z: b.z + rnd(-0.15, 0.15), vx: rnd(-0.2, 0.2), vy: rnd(0.9, 1.5), vz: rnd(-0.2, 0.2), s0: 0.4 * b.sc, s1: 1.7 * b.sc, dur: rnd(2.4, 3.6), op: 0.42 * (0.4 + 0.6 * fade), c0: 0.34, c1: 0.12, drag: 0.5, rise: 0.1, spin: rnd(-0.2, 0.2), fl: 0.3, fi: 0.3 });
      }
    }
    // обломки
    for (const m of X.deb) {
      const u = m.u; if (!u.on) continue;
      u.age += dt;
      if (u.age >= u.dur) { u.on = false; m.visible = false; continue; }
      if (!u.rest) {
        if (u.trail >= 0 && X.smokeLoad < 0.7) { u.trail -= dt; if (u.trail <= 0 && u.v.lengthSq() > 12) { u.trail = 0.055; puff(X.smoke, { x: m.position.x, y: m.position.y, z: m.position.z, vx: rnd(-0.2, 0.2), vy: rnd(0.1, 0.5), vz: rnd(-0.2, 0.2), s0: 0.14, s1: 0.55, dur: rnd(0.7, 1.1), op: 0.38, c0: 0.42, c1: 0.16, drag: 1.5, rise: 0.2, spin: rnd(-0.4, 0.4), fl: 0.1, fi: 0.05 }); } }
        u.v.y -= 9.8 * dt;
        const ps = m.position, inside = r.blocked(ps.x, ps.z), nx = ps.x + u.v.x * dt, nz = ps.z + u.v.z * dt;
        if (!inside && r.blocked(nx, ps.z)) u.v.x *= -0.35; else ps.x = nx;
        if (!inside && r.blocked(ps.x, nz)) u.v.z *= -0.35; else ps.z = nz;
        ps.y += u.v.y * dt;
        if (ps.y > ceilY) { ps.y = ceilY; u.v.y *= -0.3; }
        if (ps.y < u.h) { ps.y = u.h; if (Math.abs(u.v.y) < 1.2) { u.rest = true; u.v.set(0, 0, 0); } else { u.v.y *= -0.38; u.v.x *= 0.62; u.v.z *= 0.62; u.w.multiplyScalar(0.6); } }
        m.rotation.x += u.w.x * dt; m.rotation.y += u.w.y * dt; m.rotation.z += u.w.z * dt;
      }
      const sc = u.age > u.dur - 0.5 ? (u.dur - u.age) / 0.5 : 1;
      m.scale.set(u.sx * sc, u.sy * sc, u.sz * sc);
    }
    // угольки
    const E = X.emb;
    if (E.live > 0) {
      let live = 0;
      for (let i = 0; i < E.n; i += 1) {
        if (E.age[i] >= E.dur[i]) { E.col[i * 3] = E.col[i * 3 + 1] = E.col[i * 3 + 2] = 0; continue; }
        E.age[i] += dt; live += 1;
        const f = Math.exp(-dt * 0.7), j = i * 3;
        E.v[j] *= f; E.v[j + 1] = E.v[j + 1] * f - 2.2 * dt; E.v[j + 2] *= f;
        E.pos[j] += E.v[j] * dt; E.pos[j + 1] += E.v[j + 1] * dt; E.pos[j + 2] += E.v[j + 2] * dt;
        if (E.pos[j + 1] < 0.03) { E.pos[j + 1] = 0.03; E.v[j + 1] *= -0.3; E.v[j] *= 0.6; E.v[j + 2] *= 0.6; }
        const k = E.age[i] / E.dur[i], b = (1 - k) * (0.65 + 0.35 * Math.sin(X.t * 40 + i * 3.1));
        if (!r.xfMono) { const bb = Math.max(0, b); E.col[j] = bb; E.col[j + 1] = bb * (0.78 - 0.5 * k); E.col[j + 2] = bb * (0.4 - 0.36 * k); } else E.col[j] = E.col[j + 1] = E.col[j + 2] = Math.max(0, b);
      }
      E.live = live;
      E.geo.attributes.position.needsUpdate = true; E.geo.attributes.color.needsUpdate = true;
    }
    // ударные кольца и копоть
    for (const m of X.rings) {
      const u = m.u; if (!u.on) continue;
      u.age += dt;
      if (u.age < 0) continue;
      const k = u.age / u.dur;
      if (k >= 1) { u.on = false; m.visible = false; continue; }
      m.visible = true; const sz = lerp(0.6, u.r1, 1 - Math.pow(1 - k, 2.2)) * 2; m.scale.set(sz, 1, sz); m.material.opacity = u.op * Math.pow(1 - k, 1.4);
    }
    for (const m of X.decals) {
      const u = m.u; if (!u.on) continue;
      u.age += dt; m.material.opacity = 0.78 * Math.min(1, u.age / 0.15);
    }
    // пулы пусты — выключаем цикл до следующего взрыва
    let any = X.burn.length > 0 || E.live > 0 || F.age < F.dur || X.corp.length > 0 || X.sec.length > 0 || X.exp > 0.01 || (X.ash && X.ash.live > 0);
    if (!any) for (const a of [X.fire, X.smoke, X.deb, X.rings, X.halo]) { if (a.some((o) => o.u.on)) { any = true; break; } }
    X.act = any;
  }

  const updateFx0 = P.updateFx;
  P.updateFx = function (dt) {
    updateFx0.call(this, dt);
    if (this.xf) { try { xfUpdate(this, dt); } catch (e) { console.error('[explosions]', e); this.xf.act = false; } }
  };
  const combat0 = P.combat;
  P.combat = function (o) {
    const had = !!this.cb, r = combat0.call(this, o);
    if (!had && this.cb) { try { xfInit(this); } catch (e) { console.error('[explosions]', e); } }
    return r;
  };

  // постобработка (missions.js render): кольцо линзы от ударной волны + контузия. Вызывается каждый кадр перед рендером.
  P.xfPost = function () {
    const U = this.fxU; if (!U || !U.uShk) return;
    const X = this.xf, cam = this.camera;
    let st = 0;
    U.uAsp.value = this.w && this.h ? this.w / this.h : 1.78;
    if (X) {
      U.uCon.value = Math.min(1, X.con) * Math.min(1, X.con) * 0.5 + Math.min(1, X.con) * 0.5;
      const w = X.sw;
      if (w) {
        cam.updateMatrixWorld();
        v1.set(w.x, w.y, w.z).applyMatrix4(cam.matrixWorldInverse);
        const depth = -v1.z, age = X.t - w.t0;
        if (depth > 0.5 && age >= 0) {
          v2.set(w.x, w.y, w.z).project(cam);
          const k = age / w.dur, rw = Math.min(w.R * 2.1, age * w.R * 4.4), tan = Math.tan(cam.fov * Math.PI / 360);
          st = Math.pow(1 - k, 1.6) * clamp(2.4 - depth / (w.R * 1.4), 0.25, 1.2);
          U.uShk.value.set(v2.x * 0.5 + 0.5, v2.y * 0.5 + 0.5, rw / (2 * depth * tan), st);
        }
      }
    } else U.uCon.value = 0;
    if (st <= 0) U.uShk.value.w = 0;
    U.uExp.value = X ? Math.min(1, X.exp) : 0;   // засвет экспозиции: камера «ослеплена» вспышкой и быстро привыкает
    // марево над огнём (только качества с постобработкой): точка у верхушки огненного шара, радиус и сила затухают за ≈5 с
    if (X && this.q && this.q.fx !== 'none' && X.hz.t < 5.5) {
      cam.updateMatrixWorld();
      v1.set(X.hz.x, X.hz.y, X.hz.z).applyMatrix4(cam.matrixWorldInverse);
      if (-v1.z > 0.6) {
        v2.set(X.hz.x, X.hz.y, X.hz.z).project(cam);
        const tan = Math.tan(cam.fov * Math.PI / 360), rad = clamp(X.hz.R * 1.3 / (2 * -v1.z * tan), 0.04, 0.5), a = clamp(1 - X.hz.t / 5.2, 0, 1);
        U.uHaz.value.set(v2.x * 0.5 + 0.5, v2.y * 0.5 + 0.5, rad, a * a * clamp(1.6 - -v1.z / (X.hz.R * 6), 0.15, 1));
      } else U.uHaz.value.w = 0;
    } else if (U.uHaz) U.uHaz.value.w = 0;
  };
}());
