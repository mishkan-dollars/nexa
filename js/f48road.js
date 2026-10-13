// NEXA: миссия 48 — ночная дорога для поездки на машине (фаза car, js/f48ride.js).
// Машина стоит в начале координат, а «дорожная» группа едет под ней: матрица группы = обратная к позе машины на дороге.
// Всё детерминировано часами поездки T (секунды трека car.m4a): скорость v(T), путь d(T), боковое положение x(T), список обгонов и встречных машин.
// Дорога: полоса на сторону (x = ±1.75), обочины-парковки, тротуары; сегменты по 60 м клонируются из шаблонов (город, перекрёсток, промзона, тоннель,
// трасса, мост, подъезд к NEXA). Весь текст на табличках — английский.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.Mk || !C.f48.World || !C.f48.trafficCar || !C.f48.rng) return;
  const F = C.f48, Mk = F.Mk, PI = Math.PI, TAU = PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const LEN = 60, DUR = 100.808, LANE = 1.75;

  // ------------------------------------------------------------------ скорость, путь
  // монотонный кубический сплайн по ключам [t, v] (без «перелётов» в минус)
  function monoCubic(P) {
    const n = P.length, xs = P.map((p) => p[0]), ys = P.map((p) => p[1]), d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i += 1) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i += 1) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i += 1) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return (x) => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0; while (x > xs[i + 1]) i += 1;
      const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  }
  const SPD = [[0, 0], [1.0, 1.2], [3.5, 7], [6, 15], [9, 21], [13, 25], [18, 28], [23, 30], [27, 33], [31, 35], [37, 37], [43, 38.5], [46, 31], [48, 40], [57, 41.5], [66, 42], [76, 42], [82, 37], [87, 29], [92, 19], [95.5, 8.5], [98.3, 1.6], [100.808, 0]];
  const speed = monoCubic(SPD);
  const vel = (T) => Math.max(0, speed(clamp(T, 0, DUR)));
  const HS = 0.01, NS = Math.ceil(DUR / HS) + 2, DT = new Float64Array(NS);
  for (let i = 1; i < NS; i += 1) DT[i] = DT[i - 1] + (vel((i - 1) * HS) + vel(i * HS)) * 0.5 * HS;
  const dist = (T) => { const f = clamp(T, 0, DUR) / HS, i = Math.min(NS - 2, Math.floor(f)); return DT[i] + (DT[i + 1] - DT[i]) * (f - i); };
  const tAtDist = (d) => { let a = 0, b = DUR; for (let k = 0; k < 40; k += 1) { const m = (a + b) / 2; if (dist(m) < d) a = m; else b = m; } return (a + b) / 2; };
  const D_END = dist(DUR);

  // ------------------------------------------------------------------ раскладка: какие сегменты чем являются
  const I = {};
  I.junc = Math.round(dist(27.0) / LEN - 0.5);
  I.ind0 = Math.ceil(dist(41.6) / LEN);
  I.tun0 = Math.max(I.ind0 + 1, Math.ceil(dist(49.2) / LEN));
  I.tun1 = Math.max(I.tun0 + 2, Math.floor(dist(57.0) / LEN));
  I.hwy1 = Math.max(I.tun1 + 3, Math.ceil(dist(68.2) / LEN) - 1);
  I.brg1 = Math.max(I.hwy1 + 3, Math.ceil(dist(79.6) / LEN) - 1);
  I.last = Math.floor(D_END / LEN);
  const T_J = tAtDist(I.junc * LEN + 30);                      // ехали через центр перекрёстка
  F.roadKind = function (i) {
    if (i === I.junc) return 'junction';
    if (i < I.ind0) return 'city';
    if (i < I.tun0) return 'industrial';
    if (i === I.tun0) return 'tunIn';
    if (i < I.tun1) return 'tunnel';
    if (i === I.tun1) return 'tunOut';
    if (i <= I.hwy1) return 'highway';
    if (i <= I.brg1) return 'bridge';
    return 'approach';
  };
  const NVAR = { city: 3, junction: 1, industrial: 2, tunIn: 1, tunnel: 1, tunOut: 1, highway: 2, bridge: 1, approach: 2 };

  // ------------------------------------------------------------------ обгоны и встречные
  // tp — момент, когда мы поравнялись с медленной машиной; vv — её скорость; o — встречная после обгона
  const EV = [
    { tp: 9.6, k: 'taxi', c: 0xe0b83a, vv: 7 },
    { tp: 14.6, k: 'van', c: 0x56606c, vv: 10, o: { k: 'bus', c: 0xaeb0b8, v: 11 } },
    { tp: 19.4, k: 'sedan', c: 0x8a2222, vv: 11, o: { k: 'sedan', c: 0x2c3856, v: 13 } },
    // очередь на красный: стоят три машины перед перекрёстком, обходим их по встречной и летим сквозь перекрёсток
    { zl: -17.2, seg: 'junc', k: 'sedan', c: 0x3a3d44, vv: 0, junc: true },
    { zl: -11.6, seg: 'junc', k: 'hatch', c: 0x7a6a4a, vv: 0, junc: true },
    { zl: -6.0, seg: 'junc', k: 'van', c: 0x606a74, vv: 0, junc: true },
    { tp: 33.6, k: 'truck', c: 0x9a9ca2, vv: 13, o: { k: 'taxi', c: 0xe0b83a, v: 13 } },
    { tp: 37.4, k: 'hatch', c: 0x2f6d8a, vv: 12 },
    { tp: 41.0, k: 'bus', c: 0xc2a04a, vv: 12, o: { k: 'truck', c: 0x7a8088, v: 12 } },
    { tp: 52.6, k: 'truck', c: 0xa6a8ae, vv: 15, o: { k: 'sedan', c: 0x5a1f1f, v: 15 } },
    { tp: 60.0, k: 'truck', c: 0x8d9096, vv: 17 },
    { tp: 64.2, k: 'van', c: 0xb0b2b8, vv: 19, o: { k: 'truck', c: 0x6a7078, v: 17 } },
    { tp: 72.2, k: 'sedan', c: 0x1f2a44, vv: 21, long: 1.0, o: { k: 'truck', c: 0x88898e, v: 16 } }
  ];
  const PUL = [];                                                  // [a, b, c, d] — окна «едем по встречной»
  EV.forEach((e) => {
    e.len = F.trafficLen[e.k];
    if (e.zl !== undefined) { e.zp = -I.junc * LEN + e.zl; e.tp = tAtDist(-e.zp); } else e.zp = -dist(e.tp);
    const vrel = Math.max(6, vel(e.tp) - e.vv), s = (e.len + 4.6) / 2 + 1.3;
    e.b = e.tp - s / vrel; e.a = e.b - 0.95; e.c = e.tp + s / vrel + (e.long || 0); e.d = e.c + 1.0;
    if (!e.junc) PUL.push([e.a, e.b, e.c, e.d]);
    if (e.o) { e.tm = e.d + 0.25; e.zm = -dist(e.tm); }
  });
  { // очередь на красный — одно окно: уходим на встречную перед последней машиной очереди и возвращаемся уже за перекрёстком
    const q = EV.filter((e) => e.junc), rear = q.reduce((a, b) => (a.zl > b.zl ? a : b));
    PUL.push([rear.a, rear.b, T_J + 0.45, T_J + 1.45]);
  }
  function egoX(T) {
    let k = 0;
    for (let i = 0; i < PUL.length; i += 1) { const p = PUL[i]; k += sm((T - p[0]) / (p[1] - p[0])) - sm((T - p[2]) / (p[3] - p[2])); }
    k = clamp(k, 0, 1);
    const w = Math.min(1, vel(T) / 12) * 0.13, wob = 0.55 * Math.exp(-Math.pow((T - 77.5) / 2.2, 2)) * Math.sin((T - 74.6) * 5.0);
    return LANE - 2 * LANE * k + Math.sin(T * 0.83) * w + Math.sin(T * 1.9 + 1.3) * w * 0.5 + wob;
  }
  const slip = (T) => 0.1 * Math.exp(-Math.pow((T - 77.5) / 2.4, 2)) * Math.sin((T - 74.6) * 5.0 + 1.1);
  function psiAt(T) { const h = 0.04, x1 = (egoX(T + h) - egoX(T - h)) / (2 * h); return -Math.atan2(x1, Math.max(vel(T), 4)) + slip(T); }
  // поза машины на дороге и динамика кузова
  const _P = { T: -1 };
  function pose(T) {
    if (_P.T === T) return _P;
    const h = 0.05, x = egoX(T), v = vel(T), psi = psiAt(T), psiP = psiAt(T + h), psiM = psiAt(T - h), om = (psiP - psiM) / (2 * h);
    const a = (vel(T + h) - vel(T - h)) / (2 * h);
    _P.T = T; _P.x = x; _P.z = -dist(T); _P.psi = psi; _P.v = v; _P.om = om; _P.a = a;
    _P.roll = clamp(-0.011 * v * om, -0.09, 0.09);
    _P.pitch = clamp(0.0055 * a, -0.05, 0.035);
    _P.steer = clamp(2.7 * om / Math.max(v, 5), -0.6, 0.6);
    return _P;
  }

  // ------------------------------------------------------------------ окружение: цвета, текстуры
  const WALLS = [0x1c212c, 0x232834, 0x181c26, 0x2a2f3c, 0x201f2b, 0x262b2e, 0x2e2522, 0x1d2622];
  const LITC = [0xffd39a, 0xffc27a, 0xfff0cf, 0xffe1a0, 0xbfe0ff, 0x9fd0ff, 0xffb27a, 0xffd9ae];
  const PARK = [0x1b1d22, 0x2a2d34, 0x3a2020, 0x20303a, 0x4a4a4e, 0x1d2a1f, 0x55524a];
  const shade = (c, k) => ((((c >> 16) & 255) * k) << 16) | ((((c >> 8) & 255) * k) << 8) | ((c & 255) * k);
  const pick = (rand, a) => a[Math.floor(rand() * a.length) % a.length];

  const _tex = {};
  function roadTex(type) {
    if (_tex[type]) return _tex[type];
    const T = THREE, W = type === 'cross' ? 512 : 256, H = type === 'cross' ? 512 : 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), px = W / 12, yc = (z) => (1 + z / LEN) * H;      // 12 м по ширине, 60 м по длине; z локальный (0..−60)
    const rnd = F.rng(type.length * 97 + 5);
    g.fillStyle = type === 'tunnel' ? '#24262b' : type === 'cross' ? '#15171c' : '#16181d'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i += 1) { const v = Math.floor(rnd() * 40); g.fillStyle = 'rgba(' + (30 + v) + ',' + (32 + v) + ',' + (38 + v) + ',' + (0.1 + rnd() * 0.3) + ')'; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }
    for (let i = 0; i < 9; i += 1) { g.fillStyle = 'rgba(0,0,0,' + (0.08 + rnd() * 0.12) + ')'; g.fillRect(rnd() * W, rnd() * H, 8 + rnd() * 30, 20 + rnd() * 110); }   // заплатки
    if (type !== 'cross') {
      g.fillStyle = 'rgba(0,0,0,0.22)'; [-1.75, 1.75].forEach((x) => g.fillRect((6 + x - 0.55) * px, 0, 1.1 * px, H));             // колея
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1;
      for (let i = 0; i < 6; i += 1) { g.beginPath(); let x = rnd() * W, y = rnd() * H; g.moveTo(x, y); for (let k = 0; k < 8; k += 1) { x += (rnd() - 0.5) * 26; y += rnd() * 22; g.lineTo(x, y); } g.stroke(); }   // трещины
      const yl = '#c9a62a', wh = '#c8c8c0';
      if (type === 'highway') { g.fillStyle = yl; for (let z = 0; z > -LEN; z -= 12) g.fillRect(6 * px - 2, yc(z), 4, 6 * 17.07); }          // прерывистая осевая
      else { g.fillStyle = yl; g.fillRect((6 - 0.14) * px - 2, 0, 2.4, H); g.fillRect((6 + 0.14) * px, 0, 2.4, H); }                    // двойная сплошная
      g.fillStyle = wh; g.fillRect((6 - 3.62) * px, 0, 2.6, H); g.fillRect((6 + 3.55) * px, 0, 2.6, H);                                  // краевые
      if (type === 'junction') {
        const zebra = (z0, z1) => { for (let x = -3.3; x < 3.4; x += 0.9) g.fillRect((6 + x) * px, yc(z0), 0.5 * px, yc(z1) - yc(z0)); };
        g.fillStyle = wh; zebra(-20.4, -23.6); zebra(-36.4, -39.6);
        g.fillRect(6 * px, yc(-19.3), 3.5 * px, 7); g.fillRect(2.5 * px, yc(-40.7), 3.5 * px, 7);                                         // стоп-линии
        g.fillStyle = '#16181d'; g.fillRect(0, yc(-24), W, yc(-36) - yc(-24));                                                             // проезжая часть пересечения без разметки
      }
    } else {
      g.fillStyle = '#c8c8c0'; for (let x = 0; x < W; x += W / 4) g.fillRect(x + 8, H / 2 - 1.5, W / 8, 3);                             // пунктир по оси
      g.fillRect(0, 10, W, 3); g.fillRect(0, H - 13, W, 3);
    }
    const t = new T.CanvasTexture(c); t.wrapS = type === 'cross' ? T.RepeatWrapping : T.ClampToEdgeWrapping; t.wrapT = T.ClampToEdgeWrapping; t.anisotropy = 8;
    if (type === 'cross') t.repeat.set(4.5, 1);
    return (_tex[type] = t);
  }
  const _mat = {};
  const basic = (key, o) => _mat[key] || (_mat[key] = new THREE.MeshBasicMaterial(o));
  function sprMat(c, op) { const key = 'spr' + c + op; return _mat[key] || (_mat[key] = new THREE.SpriteMaterial({ map: F.glowTex(), color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op, fog: false })); }
  function halo(c, s, op, fog) {
    const sp = new THREE.Sprite(fog ? new THREE.SpriteMaterial({ map: F.glowTex(), color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op }) : sprMat(c, op));
    sp.scale.setScalar(s); sp.renderOrder = 5; return sp;
  }
  const _sg = {};
  function signMesh(text, w, h, o) {
    const key = text + '|' + w + '|' + h + (o && o.fg || '');
    if (!_sg[key]) _sg[key] = F.sign(text, w, h, o);
    return _sg[key].clone();
  }

  // ------------------------------------------------------------------ детали улиц
  function plane(w, d, tex, y, x, z) {
    const T = THREE, m = new T.Mesh(new T.PlaneGeometry(w, d), tex ? basic('rd' + tex.uuid, { map: tex }) : basic('dark', { color: 0x090b10 }));
    m.rotation.x = -PI / 2; m.position.set(x || 0, y, z === undefined ? -LEN / 2 : z); m.frustumCulled = false; return m;
  }
  function sidewalks(M, edge, segs) {
    (segs || [[0, -LEN]]).forEach((sg) => {
      const zc = (sg[0] + sg[1]) / 2, ln = sg[0] - sg[1];
      [-1, 1].forEach((s) => {
        M.b(4.6, 0.16, ln, s * 8.4, 0.08, zc, 0x23262c);
        M.b(0.28, 0.2, ln, s * 6.1, 0.1, zc, 0x3a3e46);
        for (let z = sg[0] - 1.2; z > sg[1]; z -= 2.4) M.b(4.6, 0.006, 0.035, s * 8.4, 0.165, z, 0x16181c);
        if (edge) M.b(0.1, 0.01, ln, s * 6.0, 0.19, zc, 0xb8b020);
      });
    });
  }
  function lampPost(M, P, g, side, z, o) {
    o = o || {};
    const x = side * 6.45, hy = o.h || 6.8, arm = o.arm || 1.9, col = o.col || 0xffc983, lx = x - side * arm;
    M.y(0.07, 0.11, hy, x, hy / 2, z, 0x25282e, 8); M.y(0.17, 0.17, 0.26, x, 0.13, z, 0x1c1e22, 8);
    M.b(arm, 0.08, 0.09, x - side * arm / 2, hy - 0.05, z, 0x25282e); M.b(0.95, 0.1, 0.38, lx, hy - 0.12, z, 0x1a1c20);
    M.glow((q) => q.b(0.82, 0.04, 0.3, lx, hy - 0.19, z, col));
    P.pool(lx, z, (o.rad || 6.4), o.pool || 0x3a2410);
    const h = halo(col, 3.0, 0.7, true); h.position.set(lx, hy - 0.3, z); g.add(h);
  }
  function parkedCars(g, rand, prob, zs) {
    [-1, 1].forEach((s) => {
      for (let z = -4; z > -LEN + 3; z -= 6.9) {
        if (zs && zs(s, z)) continue;
        if (rand() > prob) continue;
        const c = F.trafficCar(pick(rand, ['sedan', 'hatch', 'van', 'taxi', 'sedan', 'hatch']), pick(rand, PARK));
        c.position.set(s * (4.95 + rand() * 0.2), 0, z - rand() * 0.7); c.rotation.y = rand() < 0.5 ? 0 : PI; g.add(c);
      }
    });
  }
  function steamVent(g, x, z, rand) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: F.glowTex(), color: 0xb4bcc8, transparent: true, depthWrite: false, opacity: 0.14 + rand() * 0.08 }));
    sp.scale.set(2.4, 5.2, 1); sp.position.set(x, 2.5, z); g.add(sp);
    const sp2 = sp.clone(); sp2.scale.set(1.5, 3.4, 1); sp2.position.set(x + 0.2, 1.6, z + 0.2); g.add(sp2);
  }
  // здание: лицо на расстоянии face от оси, занимает z ∈ [z1, z0]. Окна и вывески — на лицевой стороне
  function building(M, g, rand, side, face, z0, z1, h, o) {
    o = o || {};
    const w = z0 - z1, cz = (z0 + z1) / 2, d = o.d || 16, wall = o.wall || pick(rand, WALLS), lit = o.lit === undefined ? 0.18 + rand() * 0.3 : o.lit;
    const cx = side * (face + d / 2), fx = side * (face - 0.03), ry = side < 0 ? PI / 2 : -PI / 2;
    M.b(d, h, w, cx, h / 2, cz, wall);
    M.b(d + 0.1, 0.9, w + 0.1, cx, 0.45, cz, shade(wall, 0.65));
    M.b(d + 0.3, 0.45, w + 0.3, cx, h + 0.22, cz, shade(wall, 1.35));                                  // карниз
    M.b(d - 0.6, 0.5, w - 0.6, cx, h + 0.7, cz, shade(wall, 0.7));
    const nf = Math.max(1, Math.floor((h - 5.3) / 3.2)), nb = Math.max(1, Math.floor((w - 1.6) / 3.1)), pitch = (w - 1.6) / nb;
    for (let f = 0; f < nf; f += 1) {
      const y = 5.9 + f * 3.2;
      M.b(0.2, 0.2, w + 0.05, fx - side * 0.05, y - 1.15, cz, shade(wall, 1.5));                       // пояс этажа
      for (let b = 0; b < nb; b += 1) {
        const z = z0 - 0.8 - pitch * (b + 0.5), on = rand() < lit;
        if (on) {
          const col = pick(rand, LITC), ww = 1.45, wh = 1.75;
          M.glow((q) => { q.pl(ww, wh, fx, y, z, col, 0, ry); });
          M.b(0.05, 1.8, 0.05, fx - side * 0.02, y, z, 0x0b0c10); M.b(0.05, 0.05, 1.5, fx - side * 0.02, y + 0.2, z, 0x0b0c10);   // переплёт
          if (rand() < 0.3) M.b(0.04, wh * 0.6, ww, fx - side * 0.03, y + wh * 0.2, z, shade(col, 0.4));      // штора
        } else M.pl(1.45, 1.75, fx, y, z, 0x0c1019, 0, ry);
        if (rand() < 0.07) M.b(0.55, 0.45, 0.6, fx - side * 0.3, y - 0.95, z, 0x4a4e56);                  // кондиционер
      }
    }
    // первый этаж: витрины, вывески, роллеты
    const nbs = Math.max(1, Math.floor(w / 3.6)), bp = w / nbs;
    for (let b = 0; b < nbs; b += 1) {
      const z = z0 - bp * (b + 0.5), kind = rand();
      if (kind < 0.5) {
        const col = pick(rand, [0xffe0a8, 0xaadfff, 0xffb4d8, 0xfff2cf, 0xbfffd8]);
        M.glow((q) => { q.pl(bp - 0.5, 2.5, fx, 2.0, z, col, 0, ry); });
        M.b(0.12, 2.6, 0.12, fx - side * 0.02, 1.9, z - bp / 2 + 0.08, 0x0b0c10); M.b(0.12, 2.6, 0.12, fx - side * 0.02, 1.9, z + bp / 2 - 0.08, 0x0b0c10);
        const sc = pick(rand, [0xff3a5c, 0x38e0ff, 0xffd23a, 0x5aff8a, 0xff8a2a, 0xff52d9]);
        M.glow((q) => { q.b(0.1, 0.34, bp - 0.7, fx - side * 0.1, 3.7, z, sc); });
        M.b(0.8, 0.1, bp - 0.3, fx - side * 0.45, 3.35, z, shade(wall, 0.5), 0, 0, side * 0.3);          // козырёк
      } else if (kind < 0.8) { M.b(0.1, 2.6, bp - 0.3, fx - side * 0.04, 1.4, z, 0x34383f); for (let i = 0; i < 10; i += 1) M.b(0.12, 0.02, bp - 0.3, fx - side * 0.05, 0.3 + i * 0.25, z, 0x1f2227); }
      else { M.b(0.1, 2.3, 1.2, fx - side * 0.04, 1.2, z, 0x15171b); M.glow((q) => { q.pl(0.34, 0.2, fx - side * 0.1, 2.5, z, 0xffd9a0, 0, ry); }); }
    }
    // крыша
    if (rand() < 0.5) { M.y(0.9, 0.9, 1.5, cx - side * 1.5, h + 1.75, cz + rand() * 3 - 1.5, 0x2a2520, 12); M.y(0.95, 0.95, 0.12, cx - side * 1.5, h + 2.55, cz, 0x201c18, 12); }
    if (rand() < 0.5) { const ax = cx + side * (rand() * 3), az = cz + (rand() - 0.5) * 4; M.y(0.03, 0.04, 6, ax, h + 3.7, az, 0x1d1f23, 5); M.glow((q) => q.s(0.12, ax, h + 6.7, az, 0xff2a1a, 1, 1, 1, 6)); }
    if (o.sign !== false && rand() < 0.3) {
      const txt = pick(rand, ['HOTEL', 'CASINO', 'PHARMACY', '24H', 'BANK', 'CINEMA', 'TAXI', 'BAR', 'NEXA']), colr = pick(rand, ['#ff3a5c', '#38e0ff', '#ffd23a', '#5aff8a', '#ff52d9']);
      const s = signMesh(txt, 5.2, 1.5, { bg: '#06070b', fg: colr, edge: colr, px: 120 });
      s.position.set(fx - side * 0.4, h + 2.6, cz); s.rotation.y = ry; g.add(s);
      M.b(0.1, 1.8, 0.1, fx - side * 0.3, h + 0.9, cz - 2.3, 0x1c1e22); M.b(0.1, 1.8, 0.1, fx - side * 0.3, h + 0.9, cz + 2.3, 0x1c1e22);
    }
  }
  function streetBlocks(M, g, rand, o) {
    o = o || {};
    [-1, 1].forEach((side) => {
      let z = 0;
      while (z > -LEN + 8) {
        const w = Math.min(10 + rand() * 12, LEN + z), gap = rand() < 0.3 ? 2 + rand() * 3 : 0.35;
        if (w < 6) break;
        const zz = z - w;
        if (!(o.skip && o.skip(z, zz))) building(M, g, rand, side, 10.5 + (rand() < 0.2 ? 1.5 : 0), z, zz, (o.h0 || 12) + rand() * (o.h1 || 26), { lit: o.lit });
        z = zz - gap;
      }
    });
  }
  function trafficLight(M, x, z, face, onIdx) {
    const ry = face === 'n' ? 0 : face === 'e' ? PI / 2 : -PI / 2, ox = face === 'e' ? 0.17 : face === 'w' ? -0.17 : 0, oz = face === 'n' ? 0.17 : 0;
    M.y(0.06, 0.07, 4.4, x, 2.2, z, 0x1f2227, 8); M.b(0.36, 1.05, 0.3, x, 4.4, z, 0x0a0a0c, 0, ry);
    const COL = [0xff2a1a, 0xffb020, 0x22ff6a];
    for (let i = 0; i < 3; i += 1) {
      const y = 4.72 - i * 0.34;
      if (i === onIdx) M.glow((q) => { q.pl(0.22, 0.22, x + ox, y, z + oz, COL[i], 0, ry); }); else M.pl(0.22, 0.22, x + ox, y, z + oz, shade(COL[i], 0.12), 0, ry);
    }
  }

  // ------------------------------------------------------------------ шаблоны сегментов
  const BUILD = {};
  BUILD.city = function (M, P, g, rand, v) {
    sidewalks(M, true);
    streetBlocks(M, g, rand, { lit: 0.2 + v * 0.12 });
    [-1, 1].forEach((s, k) => { for (let z = -7 - k * 15 - v * 2; z > -LEN; z -= 30) lampPost(M, P, g, s, z); });
    parkedCars(g, rand, 0.42);
    for (let i = 0; i < 3; i += 1) { const s = rand() < 0.5 ? -1 : 1, z = -6 - rand() * 48; M.y(0.12, 0.12, 0.6, s * 6.7, 0.5, z, 0x22262c, 8); }
    if (rand() < 0.6) { const s = rand() < 0.5 ? -1 : 1, z = -10 - rand() * 40; M.y(0.5, 0.5, 0.01, s * 3.4, 0.01, z, 0x090a0c, 10); steamVent(g, s * 3.4, z, rand); }
    // остановка с рекламой
    if (v === 1) { const s = 1, z = -35; M.b(0.08, 2.6, 3.4, s * 8.6, 1.4, z, 0x1b1d22); M.b(2.0, 0.08, 3.6, s * 7.6, 2.7, z, 0x1b1d22); M.glow((q) => q.pl(1.8, 2.3, s * 8.53, 1.5, z, 0x9fc8ff, 0, -PI / 2)); }
    if (v === 2) { const s = -1, z = -20; M.b(0.9, 2.3, 0.9, s * 6.9, 1.15, z, 0x15191f); M.glow((q) => { q.pl(0.7, 1.9, s * 6.43, 1.3, z, 0x6af0ff, 0, PI / 2); }); }     // телефонная будка
  };
  BUILD.junction = function (M, P, g, rand) {
    sidewalks(M, false, [[0, -24], [-36, -60]]);
    [-1, 1].forEach((side) => {
      [[0, -24], [-36, -60]].forEach((r) => building(M, g, rand, side, 10.5, r[0], r[1], 14 + rand() * 24, { lit: 0.35 }));
    });
    // поперечная улица слева и справа от пересечения (само пересечение — основная текстура без разметки)
    [-1, 1].forEach((s) => { const m = plane(54, 12, roadTex('cross'), 0, s * 33, -30); g.add(m); });
    [-1, 1].forEach((s) => { for (const z of [-23, -37]) lampPost(M, P, g, s, z, { h: 7.2 }); });
    // фонари на фасадах над поперечной улицей
    [-1, 1].forEach((s) => {
      for (const x of [s * 14, s * 24]) {
        M.b(0.9, 0.08, 0.08, x, 6.0, -24.1, 0x25282e); M.glow((q) => q.b(0.5, 0.04, 0.3, x, 5.93, -24.5, 0xffc983)); P.pool(x, -28, 6, 0x3a2410);
        const h = halo(0xffc983, 2.8, 0.65, true); h.position.set(x, 5.8, -24.6); g.add(h);
      }
    });
    trafficLight(M, 6.9, -20.5, 'n', 0); trafficLight(M, -6.9, -39.5, 'n', 0);
    trafficLight(M, -6.9, -20.5, 'e', 2); trafficLight(M, 6.9, -39.5, 'w', 2);
    [[6.9, -20.3], [-6.9, -39.3]].forEach((p) => { const h = halo(0xff2a1a, 3.2, 0.95, true); h.position.set(p[0], 4.72, p[1]); g.add(h); });
    [[-6.9, -20.3], [6.9, -39.3]].forEach((p) => { const h = halo(0x22ff6a, 3.0, 0.8, true); h.position.set(p[0], 4.05, p[1]); g.add(h); });
    P.pool(0, -14, 7, 0x3a0a08);                                                                                  // красный отсвет на очереди
    steamVent(g, -3.2, -14, rand);
  };
  BUILD.industrial = function (M, P, g, rand, v) {
    sidewalks(M, false);
    [-1, 1].forEach((side) => {
      let z = 0;
      while (z > -LEN + 8) {
        const w = Math.min(14 + rand() * 12, LEN + z); if (w < 8) break;
        const zz = z - w, h = 6 + rand() * 8, face = 11 + rand() * 3;
        const cz = (z + zz) / 2, cx = side * (face + 9), wall = pick(rand, [0x2a2d33, 0x33302c, 0x252a2e, 0x2e2a26]);
        M.b(18, h, w, cx, h / 2, cz, wall); M.b(18.3, 0.5, w + 0.3, cx, h + 0.1, cz, shade(wall, 0.6));
        for (let i = 0; i < Math.floor(w / 2.2); i += 1) M.b(0.1, h - 1.5, 0.18, side * (face - 0.05), h / 2 + 0.2, z - 1.1 - i * 2.2, shade(wall, 1.3));       // гофра
        const lz = z - w * 0.3; M.b(0.3, 0.25, 0.5, side * (face - 0.2), 4.2, lz, 0x222428); M.glow((q) => q.b(0.2, 0.12, 0.34, side * (face - 0.35), 4.1, lz, 0xffa24a));
        P.pool(side * (face - 2.2), lz, 4.4, 0x2a1608);
        const dz = z - w * 0.72; M.b(0.12, 3.2, 4.2, side * (face - 0.06), 1.6, dz, 0x2c2f35); for (let i = 0; i < 10; i += 1) M.b(0.14, 0.03, 4.1, side * (face - 0.08), 0.3 + i * 0.3, dz, 0x1d2025);
        if (rand() < 0.5) { const tx = side * (face + 4), tz = zz + 3; M.y(0.5, 0.6, h + 14, tx, (h + 14) / 2, tz, 0x3a3631, 10); M.glow((q) => q.s(0.2, tx, h + 14.2, tz, 0xff2a1a, 1, 1, 1, 6)); }
        z = zz - 0.5 - rand() * 3;
      }
      // штабели контейнеров и бочки вдоль забора
      for (let i = 0; i < 3; i += 1) { const z = -6 - i * 18 - rand() * 6, cc = pick(rand, [0x7a2c24, 0x2a4f6a, 0x3d6a3c, 0x8a6a2a]); M.b(2.5, 2.6, 6, side * 8.2, 1.3, z, cc); M.b(2.5, 2.6, 6, side * 8.2, 3.95, z + 0.4, shade(cc, 0.7)); for (let k = 0; k < 6; k += 1) M.b(0.04, 5, 0.06, side * 6.9, 2.5, z - 2.6 + k, shade(cc, 0.5)); }
    });
    for (let z = -10; z > -LEN; z -= 25) [-1, 1].forEach((s, k) => lampPost(M, P, g, s, z - k * 10, { col: 0xffa14a, h: 7.4, pool: 0x3c1c08 }));
    const pz = -30 - v * 6; M.b(0.5, 0.5, 20, 0, 7.4, pz, 0x3a3d44); M.b(0.4, 0.4, 20, 0.7, 7.0, pz, 0x4a4d54); [-1, 1].forEach((s) => M.b(0.6, 7.6, 0.6, s * 9.5, 3.8, pz, 0x2a2c30));   // эстакада с трубами
    M.glow((q) => { q.b(0.1, 0.1, 0.1, 0, 7.0, pz + 0.3, 0xff2a1a); });
    steamVent(g, 5.6, -16, rand);
  };
  const tunnelShell = (M, P, g, rand) => {
    M.b(1.0, 6.2, LEN, -7.0, 3.1, -LEN / 2, 0x3b3f46); M.b(1.0, 6.2, LEN, 7.0, 3.1, -LEN / 2, 0x3b3f46);
    M.b(15.4, 0.8, LEN, 0, 6.2, -LEN / 2, 0x2c2f35);
    [-1, 1].forEach((s) => { M.b(0.4, 0.5, LEN, s * 6.4, 0.25, -LEN / 2, 0x4a4d54); for (let z = -1; z > -LEN; z -= 2) M.b(0.42, 0.52, 0.9, s * 6.38, 0.26, z, 0xb8a020); });
    for (let z = -2; z > -LEN; z -= 10) { M.b(15.4, 0.5, 0.7, 0, 5.8, z, 0x23262b); [-1, 1].forEach((s) => M.b(0.5, 5.8, 0.7, s * 6.5, 2.9, z, 0x23262b)); }
    for (let z = -1.5; z > -LEN; z -= 3) [-2.9, 2.9].forEach((x) => M.glow((q) => q.b(0.5, 0.06, 1.7, x, 5.72, z, 0xfff0d0)));
    for (let z = -3; z > -LEN; z -= 6) [-1, 1].forEach((s) => M.glow((q) => q.b(0.08, 0.14, 0.8, s * 6.44, 1.0, z, 0xffa040)));
    for (let z = -15; z > -LEN; z -= 30) [-1, 1].forEach((s) => { M.b(0.1, 2.2, 1.1, s * 6.46, 1.2, z, 0x1a3a22); M.glow((q) => q.pl(0.9, 0.35, s * 6.4, 2.65, z, 0x20ff70, 0, s > 0 ? -PI / 2 : PI / 2)); });
    // лёгкий дымок от фонарей: плафоны дают отсвет на потолок
    for (let z = -1.5; z > -LEN; z -= 3) { P.pool(-2.9, z, 3.4, 0x3a3220); P.pool(2.9, z, 3.4, 0x3a3220); }
  };
  BUILD.tunnel = function (M, P, g, rand) { tunnelShell(M, P, g, rand); };
  const portal = (M, g, z, far) => {
    const s = far ? -1 : 1;
    M.b(16, 3.8, 1.4, 0, 8.2, z, 0x4a4e56); M.b(11, 7, 1.4, -13.5, 3.5, z, 0x4a4e56); M.b(11, 7, 1.4, 13.5, 3.5, z, 0x4a4e56);
    M.b(40, 8, 12, 0, 10.5, z - s * 6, 0x10140f); M.b(18, 14, 70, -26, 5, z - s * 30, 0x0e130e); M.b(18, 14, 70, 26, 5, z - s * 30, 0x0e130e);
    M.glow((q) => { q.b(15.0, 0.18, 0.1, 0, 6.4, z + s * 0.78, 0xfff0d0); });
    const sg = signMesh(far ? 'NEXA INDUSTRIES\nTUNNEL EXIT' : 'KM 41 TUNNEL\nHEADLIGHTS ON', 6, 1.6, { bg: '#0b3a22', fg: '#f2f2f2', edge: '#f2f2f2', px: 100 });
    sg.position.set(0, 8.4, z + s * 0.76); if (far) sg.rotation.y = PI; g.add(sg);
  };
  BUILD.tunIn = function (M, P, g, rand) { tunnelShell(M, P, g, rand); portal(M, g, -0.4, false); };
  BUILD.tunOut = function (M, P, g, rand) { tunnelShell(M, P, g, rand); portal(M, g, -LEN + 0.4, true); };
  BUILD.highway = function (M, P, g, rand, v) {
    [-1, 1].forEach((s) => {
      M.b(0.55, 0.45, LEN, s * 4.7, 0.22, -LEN / 2, 0x6a6c72); M.b(0.3, 0.55, LEN, s * 4.7, 0.72, -LEN / 2, 0x6a6c72);                 // отбойник
      M.b(10, 0.1, LEN, s * 10, 0.0, -LEN / 2, 0x14161a);
      for (let z = -4; z > -LEN; z -= 8) { M.b(0.06, 0.7, 0.06, s * 5.2, 0.35, z, 0x9a9a9a); M.glow((q) => q.b(0.07, 0.14, 0.07, s * 5.2, 0.75, z, s < 0 ? 0xff3030 : 0xe8e8ff)); }
      for (let z = -9; z > -LEN; z -= 40) lampPost(M, P, g, s, z - (s > 0 ? 20 : 0), { h: 10.5, arm: 2.6, col: 0xffb86a, pool: 0x40220c, rad: 9 });
    });
    const zg = -30 - v * 12;                                                                                                              // портал с указателем
    M.b(0.6, 8.2, 0.6, -8.3, 4.1, zg, 0x3a3d44); M.b(0.6, 8.2, 0.6, 8.3, 4.1, zg, 0x3a3d44); M.b(17.2, 0.5, 0.6, 0, 7.9, zg, 0x3a3d44);
    const txt = v === 0 ? 'NEXA INDUSTRIES\nNEXT EXIT  2 km  →' : 'AIRPORT 22 km\nCITY CENTRE  ←';
    const sg = signMesh(txt, 7.2, 2.4, { bg: '#0a4a2c', fg: '#f4f4f0', edge: '#f4f4f0', px: 110 }); sg.position.set(0, 6.3, zg + 0.32); g.add(sg);
    const sg2 = sg.clone(); sg2.position.set(-8, 0.1, 0); sg2.visible = false;
    // далёкие промышленные огни и ветряки
    for (let i = 0; i < 7; i += 1) { const s = rand() < 0.5 ? -1 : 1, x = s * (22 + rand() * 40), z = -rand() * LEN, hh = 8 + rand() * 30; M.b(6 + rand() * 8, hh, 6 + rand() * 6, x, hh / 2, z, 0x12151b); for (let k = 0; k < 8; k += 1) if (rand() < 0.5) M.glow((q) => q.pl(0.8, 1, x - s * 3.2, 2 + k * 3.2, z, pick(rand, LITC), 0, s < 0 ? PI / 2 : -PI / 2)); M.glow((q) => q.s(0.25, x, hh + 0.5, z, 0xff2a1a, 1, 1, 1, 6)); }
  };
  BUILD.bridge = function (M, P, g, rand) {
    M.b(15, 0.5, LEN, 0, -0.27, -LEN / 2, 0x2a2d32);                                                                                          // настил
    [-1, 1].forEach((s) => {
      M.b(0.45, 1.0, LEN, s * 7.0, 0.5, -LEN / 2, 0x2f3338); M.b(0.2, 0.15, LEN, s * 7.0, 1.12, -LEN / 2, 0x7a7d84);
      for (let z = -2; z > -LEN; z -= 6) {
        M.b(0.35, 7.4, 0.35, s * 7.2, 3.7, z, 0x36443f);                                                                                     // стойка фермы
        const dg = Math.hypot(6, 7.4), an = Math.atan2(6, 7.4);
        M.b(0.26, dg, 0.26, s * 7.2, 3.7, z - 3, 0x2f3b37, an, 0, 0);
        M.b(0.26, dg, 0.26, s * 7.2, 3.7, z - 3, 0x2f3b37, -an, 0, 0);
        M.b(0.5, 0.5, 6.4, s * 7.2, 7.3, z - 3, 0x3d4c46);
      }
      for (let z = -4; z > -LEN; z -= 12) { M.y(0.04, 0.04, 1.6, s * 4.8, 7.0, z, 0x222428, 5); M.glow((q) => q.b(0.1, 0.06, 0.9, s * 4.8, 6.1, z, 0xffd9a0)); }
      for (let z = -2; z > -LEN; z -= 12) M.b(14.8, 0.3, 0.3, 0, 7.15, z, 0x3d4c46);                                                     // верхние связи
    });
    // тёмная вода внизу с отражёнными огнями
    const w = plane(300, LEN, null, -14, 0, -LEN / 2); w.material = basic('water', { color: 0x070a12 }); g.add(w);
    for (let i = 0; i < 40; i += 1) { const x = (rand() - 0.5) * 120, z = -rand() * LEN, ln = 2 + rand() * 10; P.b(0.35, 0.02, ln, x, -13.9, z, pick(rand, [0x2a1e0e, 0x0e1a2a, 0x2a0e1c, 0x1c2a0e])); }
    // дальний берег: небоскрёбы на правой стороне и порт — на левой
    for (let i = 0; i < 9; i += 1) { const x = 42 + rand() * 30, z = -i * 6.8, hh = 20 + rand() * 50; M.b(5 + rand() * 4, hh, 5 + rand() * 3, x, hh / 2 - 14, z, 0x10131a); for (let k = 0; k < 16; k += 1) if (rand() < 0.42) M.glow((q) => q.pl(0.8, 1.1, x - 3, -12 + k * 4, z + (rand() - 0.5) * 3, pick(rand, LITC), 0, -PI / 2)); }
    for (let i = 0; i < 3; i += 1) { const x = -38 - rand() * 12, z = -10 - i * 20; M.b(1.2, 36, 1.2, x, 4, z, 0x23282e); M.b(14, 1.0, 1.0, x + 6, 21, z, 0x23282e); M.glow((q) => q.s(0.3, x, 22.4, z, 0xff2a1a, 1, 1, 1, 6)); }
  };
  BUILD.approach = function (M, P, g, rand, v) {
    sidewalks(M, false);
    [-1, 1].forEach((s) => {
      M.b(0.5, 3.2, LEN, s * 9.6, 1.6, -LEN / 2, 0x25282d);                                                                                // бетонный забор
      for (let z = -2; z > -LEN; z -= 4) { M.b(0.7, 3.4, 0.5, s * 9.6, 1.7, z, 0x2f3238); M.b(0.08, 0.7, 0.08, s * 9.4, 3.8, z, 0x1a1c20, 0, 0, s * 0.6); }
      for (let k = 0; k < 3; k += 1) M.b(0.05, 0.05, LEN, s * 9.4, 3.5 + k * 0.18, -LEN / 2, 0x4a4d54);                                       // колючка
      for (let z = -12; z > -LEN; z -= 36) { M.b(1.2, 14, 1.2, s * 11.5, 7, z, 0x1f2227); M.b(3.4, 0.5, 0.4, s * 11.5, 14.1, z, 0x1f2227); for (let i = 0; i < 4; i += 1) M.glow((q) => q.b(0.5, 0.3, 0.14, s * 11.5 - 1.3 + i * 0.85, 13.7, z + 0.3, 0xe8f0ff)); P.pool(s * 5.2, z, 9, 0x222c3c); }
      for (let z = -20; z > -LEN; z -= 30) lampPost(M, P, g, s, z, { col: 0xdde8ff, pool: 0x26324a, h: 7.2 });
    });
    const sg = signMesh('NEXA INDUSTRIES\nPRIVATE PROPERTY — AUTHORISED ONLY', 5.4, 1.5, { bg: '#d9b21a', fg: '#101010', edge: '#101010', px: 90 });
    sg.position.set(6.2, 2.6, -24 - v * 10); sg.rotation.y = -0.15; g.add(sg);
    // глыба комплекса в глубине
    const bx = v === 0 ? -34 : 34, bz = -34; M.b(30, 38 + v * 10, 24, bx, 19 + v * 5, bz, 0x14171d);
    for (let f = 0; f < 11 + v * 3; f += 1) for (let b = 0; b < 7; b += 1) if (rand() < 0.5) M.glow((q) => q.pl(1.5, 1.6, bx + (v === 0 ? 15.02 : -15.02), 3 + f * 3.4, bz - 10 + b * 3.4, pick(rand, LITC), 0, v === 0 ? PI / 2 : -PI / 2));
  };

  // ------------------------------------------------------------------ шаблоны: кэш
  // световые пятна: веер треугольников, в центре цвет, по краю чёрный (аддитивно = мягкая граница)
  function mkPools() {
    const P = new Mk(); P.pp = { pos: [], col: [] };
    P.pool = function (x, z, rad, c, y) {
      const n = 22, yy = y === undefined ? 0.03 : y, r = ((c >> 16) & 255) / 255, gg = ((c >> 8) & 255) / 255, b = (c & 255) / 255, pp = this.pp;
      for (let i = 0; i < n; i += 1) {
        const a0 = i / n * TAU, a1 = (i + 1) / n * TAU;
        pp.pos.push(x, yy, z, x + Math.cos(a0) * rad, yy, z + Math.sin(a0) * rad, x + Math.cos(a1) * rad, yy, z + Math.sin(a1) * rad);
        pp.col.push(r, gg, b, 0, 0, 0, 0, 0, 0);
      }
    };
    return P;
  }
  const TPL = {}, ASPH = { city: 'city', junction: 'junction', industrial: 'city', tunIn: 'tunnel', tunnel: 'tunnel', tunOut: 'tunnel', highway: 'highway', bridge: 'highway', approach: 'city' };
  const KSEED = { city: 1, junction: 2, industrial: 3, tunIn: 4, tunnel: 5, tunOut: 6, highway: 7, bridge: 8, approach: 9 };
  function template(kind, v) {
    const key = kind + v; if (TPL[key]) return TPL[key];
    const T = THREE, g = new T.Group(), M = new Mk(), P = mkPools(), rand = F.rng(7000 + KSEED[kind] * 131 + v * 977);
    const tun = kind === 'tunIn' || kind === 'tunnel' || kind === 'tunOut', br = kind === 'bridge';
    if (!br) g.add(plane(160, LEN, null, -0.03));
    g.add(plane(12, LEN, roadTex(ASPH[kind]), 0));
    BUILD[kind](M, P, g, rand, v);
    const sol = M.build({ cull: false }); g.add(sol);
    const pmat = basic('pool', { vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
    if (P.a.length) { const pm = new T.Mesh(F.cmerge(P.a), pmat); pm.frustumCulled = false; pm.renderOrder = 1; g.add(pm); }
    if (P.pp.pos.length) {
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(P.pp.pos, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(P.pp.col, 3));
      const pm = new T.Mesh(geo, pmat); pm.frustumCulled = false; pm.renderOrder = 1; g.add(pm);
    }
    TPL[key] = g; return g;
  }

  // ------------------------------------------------------------------ транспорт
  function vehicle(kind, color, o) {
    o = o || {};
    const T = THREE, G = new T.Group(), car = F.trafficCar(kind, color), L = F.trafficLen[kind], w = F.trafficLen[kind] > 5 ? 2.1 : 1.78;
    G.add(car);
    [-1, 1].forEach((s) => {
      if (o.beam || o.head) { const h = halo(0xfff0cf, o.big || 2.0, 0.85, false); h.position.set(s * w * 0.32, 0.78, -L / 2 - 0.12); G.add(h); }
      const t = halo(0xff2a1a, 1.0, 0.7, false); t.position.set(s * w * 0.34, 0.8, L / 2 + 0.1); G.add(t);
    });
    if (o.beam) {
      const bm = new T.Mesh(new T.PlaneGeometry(3.4, 24), basic('beam', { map: F.beamTex(), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.5 }));
      bm.rotation.x = -PI / 2; bm.position.set(0, 0.05, -L / 2 - 12.5); bm.renderOrder = 1; G.add(bm);
    }
    G.visible = false; G.userData.len = L; G.userData.wid = w;
    return G;
  }
  // список движущихся машин: каждая — {g, fn(T) → [x, z, ry] | null, hw, hl}
  function makeTraffic(RG) {
    const list = [], rand = F.rng(4242), ONC = [];
    const add = (g, fn, ext) => { RG.add(g); const o = { g, fn, hw: g.userData.wid / 2, hl: g.userData.len / 2, ext: ext || 1 }; list.push(o); return o; };
    EV.forEach((e) => {
      const q0 = add(vehicle(e.k, e.c), (T) => [LANE, e.zp - e.vv * (T - e.tp), 0]); q0.tm = e.tp; q0.slow = true;
      if (e.o) { const zm = e.zm, tm = e.tm, vo = e.o.v; ONC.push(tm); const q = add(vehicle(e.o.k, e.o.c, { beam: true, big: 2.6 }), (T) => [-LANE, zm + vo * (T - tm), PI]); q.tm = tm; q.onc = true; q.des = true; }
    });
    // случайные встречные огни, пока мы в своей полосе
    let tries = 0;
    while (ONC.length < 34 && tries < 400) {
      tries += 1;
      const tm = 3.5 + rand() * 93, vo = 11 + rand() * 7;
      if (ONC.some((t) => Math.abs(t - tm) < 2.0)) continue;
      if (egoX(tm - 0.8) < 1.1 || egoX(tm + 0.8) < 1.1 || egoX(tm - 0.3) < 1.1 || egoX(tm + 0.3) < 1.1) continue;
      if (Math.abs(tm - T_J) < 4.5) continue;
      const zm = -dist(tm), kk = pick(rand, ['sedan', 'hatch', 'sedan', 'taxi', 'van']);
      ONC.push(tm); const q = add(vehicle(kk, pick(rand, PARK.concat([0x8a8a90, 0x2f4a6a])), { beam: true, big: 2.3 }), (T) => [-LANE, zm + vo * (T - tm), PI]); q.tm = tm; q.onc = true;
    }
    // перекрёсток: поперечные машины идут на зелёный. Центр машины пересекает нашу линию движения в момент th
    const cz = -I.junc * LEN - 30, cross = (th, dir, v0, kind, col, lane) => {
      const X0 = egoX(th);
      const q = add(vehicle(kind, col, { head: true, beam: true, big: 2.2 }), (T) => [X0 + dir * v0 * (T - th), cz + lane * LANE, dir > 0 ? -PI / 2 : PI / 2]); q.tm = th; q.cross = true;
    };
    cross(T_J + 0.57, +1, 14, 'sedan', 0x6a1f1f, +1);                 // проносится в нескольких метрах за кормой
    cross(T_J - 0.56, -1, 13, 'van', 0x8a8c92, -1);                   // успела проскочить прямо перед капотом
    cross(T_J - 3.4, -1, 12, 'taxi', 0xe0b83a, -1); cross(T_J - 2.7, +1, 11, 'sedan', 0x2a3a56, +1); cross(T_J - 1.9, -1, 12, 'truck', 0x9a9ca2, -1);
    cross(T_J + 1.5, -1, 12, 'hatch', 0x55624a, -1); cross(T_J + 2.2, +1, 13, 'bus', 0xc2a04a, +1); cross(T_J + 3.4, -1, 11, 'sedan', 0x3a3d44, -1);
    return list;
  }

  // ------------------------------------------------------------------ регион «дорога»
  function buildRoad(R, g) {
    const T = THREE, RG = R.rg = new T.Group();
    g.add(RG);
    R.ctl = null;
    // небо: вертикальный градиент по цилиндру вокруг начала координат (не едет вместе с дорогой), звёзды и луна
    const c = document.createElement('canvas'); c.width = 8; c.height = 256; const q = c.getContext('2d'), gr = q.createLinearGradient(0, 256, 0, 0);
    gr.addColorStop(0, '#5a3a24'); gr.addColorStop(0.1, '#2e2230'); gr.addColorStop(0.32, '#10142a'); gr.addColorStop(0.7, '#070a18'); gr.addColorStop(1, '#04060e');
    q.fillStyle = gr; q.fillRect(0, 0, 8, 256);
    const sky = new T.Mesh(new T.CylinderGeometry(72, 72, 70, 24, 1, true), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), side: T.BackSide, fog: false, depthWrite: false }));
    sky.position.y = 12; sky.renderOrder = -2; g.add(sky);
    const st = [], rnd = F.rng(9);
    for (let i = 0; i < 380; i += 1) { const a = rnd() * TAU, e = 0.12 + rnd() * 1.3, r = 68; st.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r * 0.9 + 4, Math.sin(a) * Math.cos(e) * r); }
    const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(st, 3));
    const stars = new T.Points(sg, new T.PointsMaterial({ color: 0xcfd8ff, size: 1.4, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7, depthWrite: false })); stars.renderOrder = -1; g.add(stars);
    const moon = halo(0xdfe6ff, 16, 0.85, false); moon.position.set(-30, 38, -58); moon.renderOrder = -1; g.add(moon);
    const traffic = makeTraffic(RG);
    const segs = new Map();
    const ctl = R.ctl = {
      RG, segs, traffic, I,
      warm() { Object.keys(NVAR).forEach((k) => { for (let v = 0; v < NVAR[k]; v += 1) template(k, v); }); },
      seg(i) { const k = F.roadKind(i), v = ((i % NVAR[k]) + NVAR[k]) % NVAR[k]; return template(k, v).clone(true); },
      // позиция дороги по времени поездки: возвращает позу
      update(r, T0, lamps) {
        const p = pose(T0);
        RG.rotation.set(0, -p.psi, 0);
        const dx = -p.x, dz = -p.z, cs = Math.cos(p.psi), sn = Math.sin(p.psi);
        RG.position.set(dx * cs - dz * sn, 0, dx * sn + dz * cs);
        const i0 = Math.floor(dist(T0) / LEN);
        for (let i = i0 - 1; i <= Math.min(I.last + 1, i0 + 2); i += 1) if (!segs.has(i)) { const s = ctl.seg(i); s.position.set(0, 0, -i * LEN); RG.add(s); segs.set(i, s); }
        segs.forEach((s, i) => { if (i < i0 - 1 || i > i0 + 2) { RG.remove(s); segs.delete(i); } });
        for (let k = 0; k < traffic.length; k += 1) {
          const o = traffic[k], q = o.fn(T0), dz = q ? q[1] - p.z : 0, ok = q && dz > -118 && dz < 42;
          if (!ok) { o.g.visible = false; continue; }
          o.g.visible = true; o.g.position.set(q[0], 0, q[1]); o.g.rotation.y = q[2];
        }
        return p;
      }
    };
    // стартовый запуск шаблонов — отдельным вызовом (чёрный экран)
  }

  // проверка отсутствия столкновений (отладка): минимальный зазор между нашей машиной и любой другой
  function validate() {
    const R = window.__m48 && window.__m48.W && window.__m48.W.R.road; if (!R || !R.ctl) return 'no road';
    const out = []; let best = 99, at = 0, who = '';
    const tr = R.ctl.traffic;
    for (let T = 0; T < DUR - 0.5; T += 0.02) {
      const ex = egoX(T), ez = -dist(T);
      for (let k = 0; k < tr.length; k += 1) {
        const o = tr[k], q = o.fn(T); if (!q) continue;
        const rot = Math.abs(Math.sin(q[2])) > 0.7, hw = rot ? o.hl : o.hw, hl = rot ? o.hw : o.hl;
        const gx = Math.abs(q[0] - ex) - (hw + 0.95), gz = Math.abs(q[1] - ez) - (hl + 2.35), gap = Math.max(gx, gz);
        if (gap < best) { best = gap; at = T; who = k + ':' + o.g.userData.len; }
        if (gap < 0.15 && !out.some((z) => Math.abs(z.T - T) < 0.5 && z.k === k)) out.push({ T: +T.toFixed(2), k, gap: +gap.toFixed(2) });
      }
    }
    return { min: +best.toFixed(2), at: +at.toFixed(2), who, bad: out };
  }

  // ------------------------------------------------------------------ регистрация региона
  const prev = F.regions;
  F.regions = function (w) {
    prev(w);
    const R = w.def('road', { build: buildRoad, surf: ['asphalt', 'concrete', 'concrete'], amb: 0.5, fogK: 0.5, fogC: 0x0b0f1a, lampCol: 0xffb060, lampI: 1.0, lampD: 14, seed: 31, light: 0.8 });
    R.world = w;
  };
  F.road = { Mk, LEN, DUR, LANE, D_END, I, T_J, EV, PUL, vel, dist, tAtDist, egoX, pose, template, validate, vehicle, halo, signMesh, lampPost, building, plane, sidewalks, roadTex, WALLS, LITC, PARK, shade, pick, basic };
}());
