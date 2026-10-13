// NEXA: миссия 48 — мир. Менеджер регионов (каждая локация — своя Group со своими коллайдерами и границами, строится при первом входе) и первые регионы:
// склад (перестрелка), кабинет Диктора. Остальные регионы — f48world2.js / f48world3.js.
// Все регионы используют локальные перекрывающиеся координаты: активен один, остальные скрыты.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.Mk || !C.Run) return;
  const F = C.f48, { Run } = C, Mk = F.Mk, PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  // детерминированный генератор для декора (одинаковый вид при пересборке)
  const rng = (seed) => { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  F.rng = rng; F.pick = pick;

  // ------------------------------------------------------------------ текстуры поверхностей (assets/tex/*.jpg): наборы пол/стена/блок на регион
  const TX = { brick: 0.8, carpet: 1.0, concrete: 0.35, concrete_dark: 0.35, rough: 0.7, metal: 0.6, plaster: 0.3, paving: 0.5, planks: 0.5, checker: 0.45, tile: 0.5, asphalt: 0.5, concrete_wet: 0.3, steel: 0.6 };
  const imgs = {};
  F.preloadTex = function () {
    return Promise.race([
      Promise.all(Object.keys(TX).map((n) => new Promise((res) => {
        if (imgs[n]) return res();
        const i = new Image(); i.onload = () => { imgs[n] = i; res(); }; i.onerror = () => res(); i.src = 'assets/tex/' + n + '.jpg';
      }))),
      new Promise((res) => setTimeout(res, 9000))
    ]);
  };
  const ls0 = C.loadSurfaces;
  C.loadSurfaces = async function (taskId) {
    const o = ls0 ? await ls0.apply(this, arguments) : null;
    if (String(taskId) === '48') await F.preloadTex();
    return o;
  };
  function surfSet(r, f, w, b) {
    const e = (n) => (imgs[n] ? { img: imgs[n], url: 'assets/tex/' + n + '.jpg', tile: TX[n] } : null);
    r.initSurfaces({ floor: e(f), wall: e(w), block: e(b) });
  }

  // ------------------------------------------------------------------ менеджер регионов
  class World {
    constructor(r) { this.r = r; this.R = {}; this.cur = null; this.lt = 0; this.lights = []; }
    def(name, o) { o.name = name; this.R[name] = o; return o; }
    // свет: q.lamps точечных источников, переезжающих к ближайшим лампам региона
    initLights() {
      const r = this.r, T = THREE;
      for (let i = 0; i < r.q.lamps; i += 1) {
        const L = new T.PointLight(0xffffff, 0.8, 14, 2); L.base = 0.8; L.position.set(0, 3, 0);
        r.scene.add(L); r.lamps.push(L);
      }
    }
    build(R) {
      const r = this.r, sc = r.scene, cl = r.colliders, T = THREE;
      const g = new T.Group(); g.name = 'reg-' + R.name;
      R.cols = []; R.g = g; R.D = new Mk(); R.rand = rng(R.seed || 1);
      r.scene = g; r.colliders = R.cols;
      try {
        surfSet(r, R.surf ? R.surf[0] : 'concrete_dark', R.surf ? R.surf[1] : 'concrete', R.surf ? R.surf[2] : 'concrete');
        R.build(R, g);
        if (R.D.a.length || R.D.g.length || R.D.q.length) { const d = R.D.build({ cull: false }); g.add(d); R.deco = d; }
      } finally { r.scene = sc; r.colliders = cl; }
      sc.add(g);
      R.built = true;
    }
    // коллайдер без меша (декор рисуется в R.D)
    col(R, x, z, w, d, h, y0) { const c = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: y0 || 0, y1: (y0 || 0) + (h || 1) }; R.cols.push(c); return c; }
    enter(name, x, z, yaw, keepFx) {
      const r = this.r, R = this.R[name]; if (!R) throw new Error('no region ' + name);
      if (!R.built) this.build(R);
      Object.keys(this.R).forEach((k) => { const o = this.R[k]; if (o.g) o.g.visible = (o === R); });
      this.cur = R;
      r.colliders = R.cols; r.bounds = R.bounds || null;
      r.setAmbient(R.amb === undefined ? 0.8 : R.amb);
      r.setFog(r.q.fog * (R.fogK === undefined ? 1 : R.fogK), R.fogC === undefined ? 0x1c1c1c : R.fogC);
      r.lamps.forEach((L, i) => { L.color.setHex(R.lampCol || 0xffffff); L.base = R.lampI || 0.8; L.distance = R.lampD || 14; L.visible = !!(R.lampPos && R.lampPos.length); });
      r.lightsLevel(R.light === undefined ? 1 : R.light);
      this.lt = 0; this.tick(0, true);
      if (R.onEnter) R.onEnter(R, this);
      if (x !== undefined) r.spawn(x, z, yaw || 0);
      return R;
    }
    // лампы следуют за камерой (мало источников — большие помещения)
    tick(dt, force) {
      const r = this.r, R = this.cur;
      if (R && R.tick) R.tick(r.time || 0, !!R.alarm);                // пульсация ореолов региона (золото, мигалки); R.alarm включает аварийные огни
      if (!R || !R.lampPos || !R.lampPos.length) return;
      this.lt -= dt; if (this.lt > 0 && !force) return;
      this.lt = 0.35;
      const c = r.camera.position, n = r.lamps.length;
      const near = R.lampPos.map((p) => ({ p, d: Math.hypot(p[0] - c.x, p[2] - c.z) + Math.abs(p[1] - c.y) * 0.2 })).sort((a, b) => a.d - b.d).slice(0, n);
      r.lamps.forEach((L, i) => { const q = near[i]; if (!q) { L.visible = false; return; } L.visible = true; if (Math.abs(L.position.x - q.p[0]) + Math.abs(L.position.z - q.p[2]) > 0.01) L.position.set(q.p[0], q.p[1], q.p[2]); });
    }
  }
  F.World = World;

  // ------------------------------------------------------------------ помощники построения региона
  // стены прямоугольной зоны: gaps = { n:[[x0,x1]], s:[…], w:[[z0,z1]], e:[…] }; n = z0 (север, −Z), s = z1
  F.shell = function (r, x0, x1, z0, z1, h, col, gaps, o) {
    o = o || {}; gaps = gaps || {};
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    r.box(cx, -0.05, cz, w + 0.6, 0.1, d + 0.6, o.floor || 0x6a6a6a, false);
    if (!o.open) r.box(cx, h + 0.05, cz, w + 0.6, 0.1, d + 0.6, o.ceil || 0x4a4a4a, false);
    r.wallH(z0, x0 - 0.15, x1 + 0.15, h, col, gaps.n);
    r.wallH(z1, x0 - 0.15, x1 + 0.15, h, col, gaps.s);
    r.wallV(x0, z0, z1, h, col, gaps.w);
    r.wallV(x1, z0, z1, h, col, gaps.e);
  };
  F.lampShade = function (M, x, y, z, c, glowc, big) { // потолочный светильник: плафон и светящаяся трубка
    M.y(big ? 0.38 : 0.22, big ? 0.14 : 0.09, big ? 0.3 : 0.2, x, y, z, c || 0x2a2b2e, 14);
    M.glow((g) => g.y(big ? 0.3 : 0.16, big ? 0.3 : 0.16, 0.02, x, y - (big ? 0.15 : 0.1), z, glowc || 0xfff0d0, 14));
    M.y(0.01, 0.01, 1.0, x, y + 0.6, z, 0x1a1a1c, 4);
  };
  F.cardboard = [0x8a7550, 0x7a6a48, 0x9a8560, 0x6c5e42, 0x857558];

  // ================================================================== СКЛАД (перестрелка в начале миссии)
  // x ∈ [−20, 20], z ∈ [−28, 18], высота 7. Игрок входит с юга (z≈15), охрана — с севера, из боковых проходов и сверху.
  function rackBays(M, rand, len, d, h, bays) {
    const col = 0x8a4a22, beam = 0x3a4a5c, mod = len / bays;
    for (let i = 0; i <= bays; i += 1) {
      [-1, 1].forEach((s) => { M.b(0.07, h, 0.07, s * (d / 2 - 0.04), h / 2, -len / 2 + i * mod, col); M.b(0.03, h, 0.012, s * (d / 2 - 0.04), h / 2, -len / 2 + i * mod + 0.04, 0x6a3418); });
      M.b(d, 0.04, 0.06, 0, h - 0.02, -len / 2 + i * mod, 0x6a3418);          // поперечные связи
      M.b(d - 0.2, 0.05, 0.05, 0, 1.6, -len / 2 + i * mod + 0.0, 0x555a62, 0, 0, 0.5); // диагональные
    }
    const levels = [0.18, 1.55, 2.92, 4.29].filter((y) => y < h - 0.8);
    levels.forEach((y, li) => {
      [-1, 1].forEach((s) => M.b(0.05, 0.14, len, s * (d / 2 - 0.04), y, 0, beam));
      for (let b = 0; b < bays; b += 1) {
        const zc = -len / 2 + (b + 0.5) * mod;
        if (rand() < 0.14) continue;                                           // пустая ячейка
        M.b(d - 0.16, 0.04, mod - 0.3, 0, y + 0.1, zc, 0x6a5a40);               // поддон
        [-0.28, 0, 0.28].forEach((dz) => M.b(d - 0.18, 0.1, 0.1, 0, y + 0.05, zc + dz * mod * 0.9, 0x544530));
        const n = 1 + Math.floor(rand() * 3);
        for (let k = 0; k < n; k += 1) {
          const bw = d - 0.3 - rand() * 0.15, bd = (mod - 0.45) / n, bh = 0.4 + rand() * 0.55, cc = F.cardboard[Math.floor(rand() * 5)];
          const tall = rand() < 0.18;
          M.b(bw, tall ? bh + 0.35 : bh, bd - 0.03, (rand() - 0.5) * 0.06, y + 0.12 + (tall ? bh + 0.35 : bh) / 2, zc - (mod - 0.45) / 2 + bd * (k + 0.5), tall ? 0x4a5662 : cc);
          M.b(bw + 0.004, 0.03, bd - 0.01, 0, y + 0.12 + bh * 0.7, zc - (mod - 0.45) / 2 + bd * (k + 0.5), 0x2a2420);   // лента
          if (rand() < 0.3) M.b(bw * 0.4, bh * 0.4, 0.004, 0, y + 0.12 + bh * 0.5, zc - (mod - 0.45) / 2 + bd * (k + 0.5) + bd / 2 - 0.012, 0xdadada); // этикетка
        }
      }
    });
  }
  function forklift(M) { // нос в −Z, начало — центр базы
    const Y = 0x8c7a2c, K = 0x1a1a1c, S = 0x4b4e55;
    M.b(1.1, 0.46, 1.9, 0, 0.55, 0.45, Y); M.b(1.14, 0.18, 0.5, 0, 0.5, 1.3, 0x222326);             // корпус, противовес
    M.b(1.1, 0.12, 1.5, 0, 0.3, 0.3, K); M.b(1.0, 0.06, 0.6, 0, 0.84, -0.05, Y, 0.0);               // днище, капот
    M.b(0.5, 0.3, 0.5, 0, 0.98, 0.78, 0x1c1d20); M.b(0.46, 0.46, 0.1, 0, 1.2, 1.0, 0x1c1d20);         // сиденье
    M.b(0.04, 0.04, 0.3, 0, 1.05, 0.12, 0x101012, 0.7); M.tor(0.12, 0.014, 0, 1.18, 0.0, 0x151517, -0.9);   // руль
    [-1, 1].forEach((s) => { M.b(0.05, 1.05, 0.05, s * 0.5, 1.45, 0.05, S); M.b(0.05, 1.05, 0.05, s * 0.5, 1.45, 1.1, S, 0.0); });
    M.b(1.1, 0.05, 1.12, 0, 1.97, 0.55, S); for (let i = 0; i < 5; i += 1) M.b(1.1, 0.03, 0.03, 0, 2.0, 0.1 + i * 0.22, 0x1a1b1d);   // крыша-решётка
    [-1, 1].forEach((s) => { M.b(0.06, 3.0, 0.08, s * 0.3, 1.5, -0.62, 0x3a3d43); M.b(0.05, 3.0, 0.06, s * 0.3, 1.5, -0.7, 0x2a2c31); }); // мачта
    M.b(0.8, 0.08, 0.1, 0, 0.55, -0.7, 0x3a3d43); M.b(0.8, 0.5, 0.06, 0, 0.75, -0.74, 0x2a2c31);
    [-1, 1].forEach((s) => { M.b(0.1, 0.05, 1.1, s * 0.3, 0.12, -1.28, 0x3a3d43); M.b(0.1, 0.45, 0.05, s * 0.3, 0.32, -0.72, 0x3a3d43); });   // вилы
    [-1, 1].forEach((s) => { M.x(0.36, 0.22, s * 0.48, 0.36, -0.1, 0x0c0c0d, 14); M.x(0.2, 0.23, s * 0.48, 0.36, -0.1, 0x6a6d74, 10); M.x(0.27, 0.2, s * 0.46, 0.27, 1.2, 0x0c0c0d, 12); M.x(0.15, 0.21, s * 0.46, 0.27, 1.2, 0x6a6d74, 8); });
    M.glow((g) => g.y(0.07, 0.07, 0.12, 0.45, 2.08, 1.0, 0xff9a2a, 8));
    M.b(0.5, 0.02, 0.01, 0, 0.98, -0.43, 0xf0f0f0);
  }
  function palletStack(M, rand, x, z, ry, layers) {
    M.push(x, 0, z, ry);
    M.b(1.2, 0.12, 1.0, 0, 0.06, 0, 0x6a5a40); [-0.45, 0, 0.45].forEach((dx) => M.b(0.14, 0.1, 0.96, dx, 0.17, 0, 0x544530));
    M.b(1.2, 0.04, 1.0, 0, 0.24, 0, 0x6a5a40);
    for (let l = 0; l < layers; l += 1) for (let i = 0; i < 2; i += 1) for (let j = 0; j < 2; j += 1) {
      const cc = F.cardboard[Math.floor(rand() * 5)], hh = 0.38;
      M.b(0.56, hh, 0.46, -0.29 + i * 0.58, 0.26 + hh / 2 + l * hh, -0.24 + j * 0.5, cc, 0, rand() * 0.05 - 0.025);
      M.b(0.57, 0.025, 0.47, -0.29 + i * 0.58, 0.26 + hh / 2 + l * hh, -0.24 + j * 0.5, 0x2b2620);
    }
    M.glass((q) => q.b(1.24, layers * 0.38 + 0.02, 1.04, 0, 0.26 + layers * 0.19, 0, 0xcfd6dd));  // стрейч-плёнка
    M.pop();
  }
  // дизель-генератор на раме: панель управления, радиатор, выхлоп, бак, кабели. Лицо (панель) — к +Z; размер ≈ 2.6 × 1.7 × 1.2
  function genset(M, rand) {
    const Y = 0xa87a1c, YD = 0x7c5a14, D = 0x1c1d20, S = 0x3a3d44, L = 0x6a6e76;
    M.b(2.7, 0.14, 1.3, 0, 0.1, 0, D); M.b(2.5, 0.06, 1.15, 0, 0.2, 0, S);                                   // рама-салазки и поддон
    [-1.2, 1.2].forEach((x) => { M.b(0.1, 0.1, 1.4, x, 0.06, 0, 0x101012); M.b(0.14, 0.04, 1.3, x, 0.14, 0, 0x2a2c31); });
    M.b(1.55, 1.0, 1.0, 0.25, 0.77, 0, Y); M.b(1.5, 0.05, 1.04, 0.25, 1.3, 0, YD);                           // кожух двигателя
    for (let i = 0; i < 9; i += 1) M.b(1.3, 0.035, 0.012, 0.25, 0.46 + i * 0.075, 0.506, YD);                    // жалюзи
    M.b(0.5, 0.9, 0.96, -1.0, 0.7, 0, 0x8c8f96); M.b(0.46, 0.84, 0.02, -1.0, 0.7, 0.49, 0x1a1b1e);            // генераторная часть
    for (let i = 0; i < 6; i += 1) M.b(0.4, 0.02, 0.012, -1.0, 0.45 + i * 0.1, 0.5, 0x555860);
    M.x(0.42, 0.3, -1.38, 0.78, 0, 0x4a4d54, 20); M.x(0.34, 0.31, -1.38, 0.78, 0, 0x1a1b1e, 16);              // радиатор-вентилятор (торец)
    for (let i = 0; i < 4; i += 1) M.b(0.012, 0.6, 0.06, -1.54, 0.78, 0, 0x2a2c31, i * 0.78);
    // выхлоп: глушитель на крыше
    M.y(0.14, 0.14, 0.6, 0.7, 1.7, -0.2, 0x4a3a32, 14); M.y(0.06, 0.06, 0.5, 0.7, 2.15, -0.2, 0x2a2420, 10); M.y(0.075, 0.075, 0.04, 0.7, 2.42, -0.2, 0x151515, 10);
    M.y(0.04, 0.04, 0.44, 0.7, 1.45, -0.2, 0x2a2420, 8);
    // панель управления на лицевой стороне
    M.b(0.74, 0.62, 0.1, 0.4, 0.82, 0.57, 0x2a2c31); M.b(0.7, 0.58, 0.02, 0.4, 0.82, 0.625, 0x1a1b1e);
    M.glow((g) => { g.b(0.34, 0.2, 0.012, 0.28, 0.98, 0.64, 0x2a5a3a); g.b(0.1, 0.012, 0.012, 0.28, 1.03, 0.65, 0x9affb0); g.b(0.18, 0.012, 0.012, 0.28, 0.99, 0.65, 0x6ac07a); });
    [[0.58, 1.02], [0.58, 0.92], [0.48, 0.62], [0.28, 0.62]].forEach((p, i) => { M.x(0.03, 0.03, p[0], p[1], 0.64, i < 2 ? 0x8a2a2a : 0xcfcfd2, 8); });
    M.b(0.16, 0.1, 0.03, 0.62, 0.7, 0.64, 0xb02020); M.b(0.14, 0.02, 0.012, 0.62, 0.7, 0.66, 0xffffff);          // красная кнопка стоп
    M.b(0.7, 0.02, 0.02, 0.4, 0.5, 0.64, 0xc9a82a);                                                           // жёлтая планка
    // бак, шланги, кабели
    M.b(1.4, 0.36, 0.9, 0.2, 0.38, 0, 0x2a2c31); M.b(1.36, 0.02, 0.86, 0.2, 0.57, 0, 0x3a3d44);
    M.y(0.05, 0.05, 0.12, 0.9, 0.62, 0.25, 0x555860, 8);
    for (let i = 0; i < 5; i += 1) M.tor(0.22 - i * 0.02, 0.025, -1.55, 0.06 + i * 0.015, 0.7, 0x141416, PI / 2, 0, 0, 12);   // бухта кабеля
    M.b(0.04, 0.03, 0.8, -1.4, 0.04, 0.9, 0x141416, 0, 0.3);                                                  // кабель на пол
    M.b(0.34, 0.2, 0.012, 1.0, 0.95, 0.51, 0xe6c84a); M.b(0.3, 0.16, 0.014, 1.0, 0.95, 0.514, 0x151515);     // предупреждающая табличка
    for (let i = 0; i < 3; i += 1) M.b(0.04, 0.2, 0.014, 0.9 + i * 0.1, 0.95, 0.52, 0xe6c84a, 0, 0, 0.6);
    M.b(0.05, 0.4, 0.05, -1.45, 1.1, 0.4, 0x2a2c31); M.b(0.4, 0.04, 0.05, -1.45, 1.3, 0.4, 0x2a2c31);        // кран-балка-крюк
    M.b(0.07, 0.09, 0.05, 1.2, 1.34, 0.3, 0xcfcfcf);                                                          // шильдик
  }
  const WH = { x0: -20, x1: 20, z0: -28, z1: 18, h: 7 };
  function buildWarehouse(R) {
    const r = R.world.r, M = R.D, rand = R.rand, W = 0x77777a;
    F.shell(r, WH.x0, WH.x1, WH.z0, WH.z1, WH.h, W, { n: [], s: [[-4, 4]] }, { floor: 0x5c5c5e, ceil: 0x2a2b2e });
    // южные ворота (за спиной игрока): закрыты
    R.gateS = r.door(0, WH.z1, 8, 4.4); R.gateS.userData.h = 4.4; r.closeDoor(R.gateS);
    // рёбра ворот и рама
    for (let i = 0; i < 8; i += 1) M.b(8, 0.05, 0.04, 0, 0.3 + i * 0.5, WH.z1 - 0.12, 0x1c1c1e);
    M.b(0.3, 4.6, 0.4, -4.15, 2.3, WH.z1, 0x2e2f33); M.b(0.3, 4.6, 0.4, 4.15, 2.3, WH.z1, 0x2e2f33); M.b(8.6, 0.3, 0.4, 0, 4.6, WH.z1, 0x2e2f33);
    M.glow((g) => { g.b(0.12, 0.12, 0.05, -4.15, 4.9, WH.z1 - 0.2, 0xff2a2a); g.b(0.12, 0.12, 0.05, 4.15, 4.9, WH.z1 - 0.2, 0xff2a2a); });
    // северные погрузочные ворота ×3 (рёбра, рама, огни, номера)
    [-12, 0, 12].forEach((x, i) => {
      for (let k = 0; k < 8; k += 1) M.b(5, 0.05, 0.05, x, 0.3 + k * 0.4, WH.z0 + 0.2, 0x303136);
      M.b(5.4, 3.5, 0.16, x, 1.75, WH.z0 + 0.16, 0x1e1f22); M.b(5.0, 3.3, 0.06, x, 1.75, WH.z0 + 0.25, 0x484a52);
      for (let k = 0; k < 8; k += 1) M.b(4.9, 0.02, 0.02, x, 0.25 + k * 0.4, WH.z0 + 0.3, 0x2c2d31);
      M.b(0.5, 0.5, 0.35, x - 2.9, 0.25, WH.z0 + 0.4, 0x15151a); M.b(0.5, 0.5, 0.35, x + 2.9, 0.25, WH.z0 + 0.4, 0x15151a);          // отбойники
      M.glow((g) => { g.b(0.14, 0.14, 0.05, x - 3.0, 3.8, WH.z0 + 0.25, i === 1 ? 0x44ff77 : 0xff3a2a); g.b(0.14, 0.14, 0.05, x + 3.0, 3.8, WH.z0 + 0.25, i === 1 ? 0x44ff77 : 0xff3a2a); });
      const sg = F.sign('DOCK ' + (i + 1), 1.4, 0.45, { bg: '#d6c042', fg: '#101010', edge: '#101010' }); sg.position.set(x, 4.25, WH.z0 + 0.34); R.g.add(sg);
      M.b(5.2, 0.12, 1.4, x, 0.06, WH.z0 + 0.9, 0x2e2f33);       // платформа-уравнитель
      for (let k = 0; k < 6; k += 1) M.b(5.0, 0.02, 0.06, x, 0.13, WH.z0 + 0.4 + k * 0.2, 0xd2ae26);
    });
    // служебная дверь справа (север)
    M.b(1.4, 2.3, 0.1, 16.5, 1.15, WH.z0 + 0.2, 0x3a3d44); M.b(1.5, 0.1, 0.12, 16.5, 2.35, WH.z0 + 0.2, 0x202226); M.glow((g) => g.b(0.5, 0.18, 0.04, 16.5, 2.65, WH.z0 + 0.22, 0x44ff77));
    // потолочные фермы, кран-балка, трубы, вентиляторы
    for (let z = WH.z0 + 3; z <= WH.z1 - 2; z += 6) {
      M.b(40, 0.28, 0.2, 0, WH.h - 0.2, z, 0x2c2d31); M.b(40, 0.1, 0.5, 0, WH.h - 0.45, z, 0x25262a);
      for (let x = -18; x <= 18; x += 3) M.b(0.1, 0.9, 0.1, x, WH.h - 0.7, z, 0x303136, 0, 0, x % 6 ? 0.6 : -0.6);
    }
    M.b(0.5, 0.6, 46, -8, WH.h - 0.9, -5, 0x36383d); M.b(0.3, 0.4, 46, 9, WH.h - 0.7, -5, 0x2f3136);
    for (let i = 0; i < 9; i += 1) { M.b(0.32, 0.5, 0.06, -8, WH.h - 0.9, -26 + i * 5, 0x1e1f22); M.b(0.32, 0.5, 0.06, 9, WH.h - 0.7, -26 + i * 5, 0x1e1f22); }
    M.y(0.25, 0.25, 41, 0, WH.h - 1.4, -5, 0x4a4d54, 10, PI / 2, 0); M.y(0.16, 0.16, 41, 3, WH.h - 1.1, -5, 0x6a3b30, 10, PI / 2, 0);
    // стены: цоколь, жёлтые отбойные полосы, колонны, огнетушители, щитки, указатели
    const wallDet = (x, z, ry) => {
      M.push(x, 0, z, ry);
      M.b(0.5, 0.7, 0.14, 0, 1.3, 0.08, 0x2a2c30); M.b(0.46, 0.66, 0.02, 0, 1.3, 0.16, 0x3a3d44); M.b(0.36, 0.04, 0.03, 0, 1.5, 0.17, 0xcc3333);       // щиток
      M.y(0.08, 0.08, 0.38, 0.55, 0.9, 0.12, 0xb02222, 8); M.y(0.04, 0.04, 0.1, 0.55, 1.15, 0.12, 0x1a1a1a, 6); M.b(0.2, 0.2, 0.02, 0.55, 1.2, 0.06, 0xdddddd);   // огнетушитель
      M.pop();
    };
    for (let x = -16; x <= 16; x += 8) { wallDet(x, WH.z0 + 0.15, 0); wallDet(x + 3, WH.z1 - 0.15, PI); }
    for (let i = 0; i < 6; i += 1) { M.b(0.9, 5.2, 0.9, -19.5, 2.6, WH.z0 + 4 + i * 7.5, 0x6b6c70); M.b(0.9, 5.2, 0.9, 19.5, 2.6, WH.z0 + 4 + i * 7.5, 0x6b6c70); M.b(0.95, 0.3, 0.95, -19.5, 0.15, WH.z0 + 4 + i * 7.5, 0x2a2b2f); M.b(0.95, 0.3, 0.95, 19.5, 0.15, WH.z0 + 4 + i * 7.5, 0x2a2b2f); for (let k = 0; k < 5; k += 1) { M.b(0.92, 0.18, 0.92, -19.5, 0.7 + k * 0.8, WH.z0 + 4 + i * 7.5, k % 2 ? 0xc9a82a : 0x232427); M.b(0.92, 0.18, 0.92, 19.5, 0.7 + k * 0.8, WH.z0 + 4 + i * 7.5, k % 2 ? 0xc9a82a : 0x232427); } }
    // разметка пола: проходы, зоны, стрелки
    const mark = (x, z, w, d, c) => M.b(w, 0.012, d, x, 0.008, z, c);
    mark(0, -5, 0.14, 44, 0xc9a82a); mark(-14, -5, 0.14, 44, 0xc9a82a); mark(14, -5, 0.14, 44, 0xc9a82a);
    for (let z = -26; z < 16; z += 2) { mark(-6, z, 0.1, 1.0, 0xd6d6d6); mark(6, z, 0.1, 1.0, 0xd6d6d6); }
    [-12, 0, 12].forEach((x) => { mark(x, WH.z0 + 3.0, 5.4, 0.14, 0xc9a82a); mark(x, WH.z0 + 6.2, 5.4, 0.14, 0xc9a82a); });
    mark(0, 14, 8, 0.2, 0xcf3030); mark(0, 15.3, 8, 0.2, 0xcf3030);
    // стеллажи: два ряда по бокам (проходы между ними — линии огня)
    [[-16, 2], [-10.5, 2], [10.5, 2], [16, 2]].forEach((a, i) => {
      const len = 16.2, z = -10 + (i % 2 ? 3 : 0), x = a[0];
      M.push(x, 0, z, 0); rackBays(M, rand, len, 1.2, 5.3, 6); M.pop();
      world(R).col(R, x, z, 1.3, len, 5.3);
    });
    [[-16, -22.5, 4], [-10.5, -22.5, 4], [10.5, -22.5, 4], [16, -22.5, 4]].forEach((a) => { M.push(a[0], 0, a[1] + 1.5, 0); rackBays(M, rand, 5.4, 1.2, 5.3, 2); M.pop(); world(R).col(R, a[0], a[1] + 1.5, 1.3, 5.4, 5.3); });
    // центр: паллеты, ящики, вилочный погрузчик, тележки — укрытия
    palletStack(M, rand, -3, -2, 0.2, 3); world(R).col(R, -3, -2, 1.25, 1.05, 1.5);
    palletStack(M, rand, 3.6, -9, -0.3, 2); world(R).col(R, 3.6, -9, 1.25, 1.05, 1.1);
    palletStack(M, rand, -2.4, -14, 0.1, 3); world(R).col(R, -2.4, -14, 1.25, 1.05, 1.5);
    palletStack(M, rand, 2.6, 4, 0.5, 2); world(R).col(R, 2.6, 4, 1.25, 1.05, 1.1);
    palletStack(M, rand, 0, -20, 0, 3); world(R).col(R, 0, -20, 1.25, 1.05, 1.5);
    palletStack(M, rand, -13, 12, 0.3, 2); world(R).col(R, -13, 12, 1.25, 1.05, 1.1);
    palletStack(M, rand, 13, 13, -0.2, 3); world(R).col(R, 13, 13, 1.25, 1.05, 1.5);
    M.push(5.5, 0, 0.5, 2.4); forklift(M); M.pop(); world(R).col(R, 5.5, 0.5, 1.5, 2.6, 2.1);
    M.push(-6.4, 0, -6.5, 0.4); forklift(M); M.pop(); world(R).col(R, -6.4, -6.5, 1.5, 2.6, 2.1);
    // ряды ящиков у дальней стены (заграждения)
    for (let i = 0; i < 3; i += 1) { const x = -6 + i * 6; M.b(1.3, 1.1, 1.3, x, 0.55, -17 + (i % 2) * 1.2, 0x5c6168); M.b(1.34, 0.08, 1.34, x, 1.12, -17 + (i % 2) * 1.2, 0x3a3d43); world(R).col(R, x, -17 + (i % 2) * 1.2, 1.3, 1.3, 1.1); }
    // контейнер справа в углу и бочки
    M.b(2.5, 2.6, 6, 17.4, 1.3, 10.5, 0x6b3e2a); for (let k = 0; k < 12; k += 1) M.b(0.04, 2.5, 5.9, 16.2 + k * 0.2, 1.3, 10.5, 0x5a3322);
    M.b(0.1, 2.5, 0.1, 16.2, 1.3, 7.55, 0x333); world(R).col(R, 17.4, 10.5, 2.5, 6, 2.6);
    // офис-пристройка слева в юго-западном углу: стеклянная будка
    M.b(5, 0.1, 4.4, -16.5, 2.9, 14, 0x2d2e32); M.b(5, 0.5, 0.15, -16.5, 0.25, 11.8, 0x5c6168); M.b(0.15, 0.5, 4.4, -14, 0.25, 14, 0x5c6168);
    M.glass((q) => { q.b(5, 2.4, 0.06, -16.5, 1.7, 11.8, 0xaec2d4); q.b(0.06, 2.4, 4.4, -14, 1.7, 14, 0xaec2d4); });
    world(R).col(R, -16.5, 11.8, 5, 0.3, 2.9); world(R).col(R, -14, 14, 0.3, 4.4, 2.9);
    M.b(1.6, 0.06, 0.7, -17.5, 0.76, 15.4, 0x4a4e57); M.b(0.05, 0.75, 0.6, -18.2, 0.38, 15.4, 0x2a2c30); M.b(0.05, 0.75, 0.6, -16.8, 0.38, 15.4, 0x2a2c30);    // стол в будке
    M.b(0.45, 0.04, 0.45, -17.5, 0.5, 14.5, 0x15151a); M.b(0.45, 0.45, 0.04, -17.5, 0.75, 14.28, 0x15151a);
    M.glow((g) => g.b(0.5, 0.3, 0.02, -17.6, 1.08, 15.6, 0x3a6a9a));
    // три генератора: «обычная» часть миссии — их нужно запустить (мигающая лампа панели → зелёная)
    R.gens = [[-13, 6, PI / 2], [12.5, 6, -PI / 2], [1, -11, 0]].map((a, i) => {
      M.push(a[0], 0, a[1], a[2]); genset(M, rand); M.pop();
      world(R).col(R, a[0], a[1], Math.abs(Math.sin(a[2])) > 0.5 ? 1.5 : 2.8, Math.abs(Math.sin(a[2])) > 0.5 ? 2.8 : 1.5, 1.8);
      const s = Math.sin(a[2]), c = Math.cos(a[2]), lx = 0.28, lz = 0.66;                         // позиция лампы статуса на панели в мире
      const wx = a[0] + lx * c + lz * s, wz = a[1] - lx * s + lz * c;
      const lamp = r.strip(wx, 1.2, wz, Math.abs(s) > 0.5 ? 0.05 : 0.34, 0.12, Math.abs(s) > 0.5 ? 0.34 : 0.05, 0x5a1a1a);
      return { x: a[0], z: a[1], yaw: a[2], lamp, wx, wz, hx: a[0] + Math.sin(a[2]) * 2.1, hz: a[1] + Math.cos(a[2]) * 2.1 };
    });
    // светильники: плафоны + источники
    R.lampPos = [];
    for (let x = -14; x <= 14; x += 7) for (let z = -22; z <= 14; z += 9) {
      F.lampShade(M, x, WH.h - 1.2, z, 0x2b2c30, 0xfff1d6, true); R.lampPos.push([x, WH.h - 1.8, z]);
    }
    // верхние окна-фонари (холодный лунный свет)
    for (let i = 0; i < 6; i += 1) M.glow((g) => g.b(2.4, 0.04, 4, -17.5 + i * 7, WH.h - 0.1, -22, 0x2a3646));
    // мусор и мелочь на полу: обрывки плёнки, коробки, бочка
    for (let i = 0; i < 26; i += 1) { const x = rnd(-17, 17), z = rnd(-25, 15); if (R.cols.some((c) => x > c.x0 - 0.5 && x < c.x1 + 0.5 && z > c.z0 - 0.5 && z < c.z1 + 0.5)) continue; M.b(rnd(0.2, 0.5), 0.04 + rnd(0, 0.2), rnd(0.2, 0.5), x, 0.04, z, pick(F.cardboard), 0, rnd(0, 3)); }
    // знак «NEXA LOGISTICS» на северной стене
    const lg = F.sign('NEXA  LOGISTICS', 7, 0.9, { bg: '#17181b', fg: '#e8e8e8', edge: '#cf3030' }); lg.position.set(-6, 5.6, WH.z0 + 0.2); R.g.add(lg);
    const lg2 = F.sign('HIGH / LOW', 5, 0.8, { bg: '#17181b', fg: '#cfcfcf' }); lg2.position.set(8, 5.6, WH.z0 + 0.2); R.g.add(lg2);
    R.bounds = { cx: 0, cz: -5, w: 40, d: 46, h: WH.h };
  }
  const world = (R) => R.world;

  // ================================================================== КАБИНЕТ ДИКТОРА
  // x ∈ [−6.5, 6.5], z ∈ [−6.5, 5.5], h 3.6. Окно во всю северную стену (город), стол Диктора у окна, стойка с миниганом у восточной стены.
  const OF = { x0: -6.5, x1: 6.5, z0: -6.5, z1: 5.5, h: 3.6 };
  function skyline(M, rand, zf, x0, x1) {
    // ночной город за окном: три слоя башен (основание на -45 м — кабинет высоко), окна сеткой, красные огни на крышах, подсвеченные вывески
    const L = [{ z: zf - 22, h0: 28, h1: 58, w0: 8, w1: 16, on: 0.42, c: 0x0f1218 }, { z: zf - 42, h0: 50, h1: 90, w0: 11, w1: 22, on: 0.38, c: 0x0b0d12 }, { z: zf - 62, h0: 70, h1: 120, w0: 14, w1: 28, on: 0.34, c: 0x090a0e }];
    const warm = [0xffd9a0, 0xffc880, 0xfff0cc, 0xbfe1ff, 0x9ecbff, 0xffe8b0, 0xffb870];
    const tint = (wc, k) => (((wc >> 16 & 255) * k) << 16) | (((wc >> 8 & 255) * k) << 8) | ((wc & 255) * k | 0);
    L.forEach((ly) => {
      for (let x = x0 - 10; x < x1 + 10; x += ly.w0 * 0.8 + rand() * ly.w1 * 0.5) {
        const w = ly.w0 + rand() * (ly.w1 - ly.w0), d = 8 + rand() * 12, h = ly.h0 + rand() * (ly.h1 - ly.h0), zc = ly.z - rand() * 6;
        M.b(w, h, d, x, h / 2 - 45, zc - d / 2, ly.c);
        if (rand() < 0.5) M.b(w * 0.6, 3 + rand() * 6, d * 0.6, x, h - 45 + 2, zc - d / 2, ly.c);                                  // надстройка
        const cs = 1.25, rs = 1.9, cols = Math.max(1, Math.floor(w / cs)), rows = Math.floor((h - 3) / rs), cw = w / cols;
        M.glow((g) => {
          for (let ri = 0; ri < rows; ri += 1) {
            const strip = rand() < 0.1, sc = warm[Math.floor(rand() * warm.length)];                                                     // целиком освещённый этаж-офис
            for (let ci = 0; ci < cols; ci += 1) {
              if (!strip && rand() > ly.on) continue;
              const wc = strip ? sc : warm[Math.floor(rand() * warm.length)], k = (strip ? 0.5 : 0.35) + rand() * 0.5;
              g.pl(cw * 0.58, 0.95, x - w / 2 + (ci + 0.5) * cw, -45 + 1.8 + ri * rs, zc + 0.03, tint(wc, k), 0, 0);
            }
          }
        });
        if (h > 60 && rand() < 0.6) M.glow((g) => { g.y(0.18, 0.18, 0.5, x, h - 45 + 3.2, zc - d / 2, 0xff2a2a, 6); if (rand() < 0.5) g.y(0.18, 0.18, 0.5, x + w * 0.35, h - 45 + 3.2, zc - d / 2, 0xff2a2a, 6); });
      }
    });
    // мост-эстакада и дорога далеко внизу: цепочка фар и фонарей
    M.glow((g) => { for (let i = 0; i < 90; i += 1) g.b(0.5, 0.5, 0.5, x0 + i * ((x1 - x0) / 90), -44.5, zf - 12 - (i % 2) * 2, i % 3 ? 0xffe2a8 : 0xff4a3a); });
  }
  function desk(M) { // стол Диктора: тёмное дерево, кожаная вставка, тумбы; начало — центр, лицо (стул Диктора) — за −Z
    M.b(3.0, 0.07, 1.3, 0, 0.78, 0, 0x2a2018); M.b(2.9, 0.012, 1.2, 0, 0.82, 0, 0x131415);                       // столешница, кожа
    M.b(3.04, 0.03, 1.34, 0, 0.745, 0, 0x1c150f);
    M.b(0.9, 0.68, 1.2, -1.0, 0.4, 0, 0x231a13); M.b(0.9, 0.68, 1.2, 1.0, 0.4, 0, 0x231a13);                       // тумбы
    for (let i = 0; i < 3; i += 1) { M.b(0.8, 0.18, 0.02, -1.0, 0.18 + i * 0.22, 0.61, 0x2e2318); M.b(0.18, 0.025, 0.03, -1.0, 0.24 + i * 0.22, 0.63, 0x9a9da4); M.b(0.8, 0.18, 0.02, 1.0, 0.18 + i * 0.22, 0.61, 0x2e2318); M.b(0.18, 0.025, 0.03, 1.0, 0.24 + i * 0.22, 0.63, 0x9a9da4); }
    M.b(2.0, 0.55, 0.04, 0, 0.5, -0.56, 0x1c150f);
    M.b(2.9, 0.1, 0.06, 0, 0.84, 0.64, 0x1c150f);                                                                 // царга
    // содержимое: настольная лампа, телефон, папки, пепельница, нож для писем, табличка
    M.y(0.12, 0.14, 0.03, 1.2, 0.85, -0.3, 0x2a2b2e, 14); M.y(0.012, 0.012, 0.4, 1.2, 1.05, -0.3, 0x3a3d43, 6); M.b(0.34, 0.05, 0.2, 1.2, 1.28, -0.3, 0x1f4a3a, 0, 0, 0.0);
    M.glow((g) => g.b(0.3, 0.012, 0.16, 1.2, 1.255, -0.3, 0xfff0c0));
    M.b(0.28, 0.07, 0.22, -1.1, 0.88, -0.2, 0x151517); M.b(0.14, 0.03, 0.05, -1.1, 0.93, -0.2, 0x0e0e10, 0, 0.3); M.s(0.03, -1.1, 0.935, -0.2, 0x0e0e10, 1, 0.5, 1, 6);
    M.b(0.34, 0.02, 0.26, -0.3, 0.84, 0.0, 0xd6d2c4); M.b(0.34, 0.02, 0.26, -0.28, 0.865, 0.03, 0x9c9886, 0, 0.12); M.b(0.34, 0.02, 0.26, -0.3, 0.89, -0.02, 0xcfcab8, 0, -0.08);
    M.y(0.07, 0.07, 0.03, 0.6, 0.86, 0.1, 0x3a3d43, 14); M.y(0.06, 0.06, 0.012, 0.6, 0.875, 0.1, 0x151517, 14);
    M.b(0.5, 0.1, 0.1, 0, 0.88, 0.32, 0x121214); M.b(0.46, 0.06, 0.012, 0, 0.88, 0.375, 0xb9b9bd);               // табличка
    M.b(0.24, 0.012, 0.012, 0.0, 0.7, 0.0, 0);                                                                  // (пустышка)
    M.b(0.04, 0.012, 0.22, 0.7, 0.847, 0.2, 0xb2b5bc, 0, 0.5);                                                    // нож
    // монитор-ноутбук
    M.b(0.4, 0.02, 0.28, -0.7, 0.85, -0.25, 0x2b2c30); M.b(0.4, 0.26, 0.015, -0.7, 0.98, -0.4, 0x151517, -0.15);
  }
  function chairExec(M, hi) { // кресло руководителя: нос (лицо сидящего) — к +Z
    M.y(0.04, 0.04, 0.38, 0, 0.3, 0, 0x2a2b2e, 8); for (let i = 0; i < 5; i += 1) { const a = i / 5 * TAU; M.b(0.04, 0.03, 0.3, Math.sin(a) * 0.15, 0.1, Math.cos(a) * 0.15, 0x2a2b2e, 0, a); M.x(0.03, 0.035, Math.sin(a) * 0.3, 0.05, Math.cos(a) * 0.3, 0x0e0e10, 8); }
    M.rb(0.56, 0.12, 0.54, 0, 0.5, 0.02, 0x1c1a19, 0.04);
    M.push(0, 0.54, -0.25, 0, -0.12); M.rb(0.56, hi ? 0.95 : 0.62, 0.13, 0, hi ? 0.47 : 0.31, 0, 0x1c1a19, 0.04); M.b(0.4, hi ? 0.78 : 0.45, 0.01, 0, hi ? 0.47 : 0.31, 0.075, 0x2a2625); M.pop();
    [-1, 1].forEach((s) => { M.b(0.06, 0.04, 0.4, s * 0.31, 0.74, 0.0, 0x151515); M.b(0.04, 0.2, 0.04, s * 0.31, 0.65, 0.0, 0x2a2b2e); });
  }
  function visitorChair(M) { // деревянный стул с кожаной подушкой; лицо — к −Z
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => M.b(0.05, 0.46, 0.05, sx * 0.24, 0.23, sz * 0.22, 0x1c150f)));
    M.rb(0.54, 0.09, 0.5, 0, 0.5, 0, 0x1d1d20, 0.025); M.b(0.5, 0.012, 0.46, 0, 0.55, 0, 0x2c2c30);
    M.push(0, 0.52, 0.24, 0, 0.1); M.rb(0.54, 0.62, 0.07, 0, 0.34, 0, 0x1d1d20, 0.025); M.b(0.04, 0.56, 0.04, -0.24, 0.3, 0.0, 0x1c150f); M.b(0.04, 0.56, 0.04, 0.24, 0.3, 0.0, 0x1c150f); M.pop();
    [-1, 1].forEach((s) => M.b(0.04, 0.04, 0.4, s * 0.25, 0.7, 0.0, 0x1c150f));
  }
  function bookshelf(M, rand, w, h, d) { // книжный шкаф; лицо — к +Z
    M.b(w, h, d, 0, h / 2, 0, 0x221a13); M.b(w - 0.1, h - 0.12, d - 0.03, 0, h / 2, 0.02, 0x0e0b08);
    const rows = Math.floor(h / 0.38);
    for (let i = 0; i < rows; i += 1) {
      M.b(w - 0.08, 0.025, d - 0.04, 0, 0.1 + i * 0.38, 0.0, 0x2c2218);
      let x = -w / 2 + 0.08;
      while (x < w / 2 - 0.12) { const bw = 0.03 + rand() * 0.05, bh = 0.22 + rand() * 0.12; M.b(bw, bh, d * 0.62, x + bw / 2, 0.115 + i * 0.38 + bh / 2, 0.02, pick([0x4a2c28, 0x2c3a4a, 0x3a3326, 0x27312a, 0x5a4a30, 0x2a2a30, 0x6a5a40]), 0, 0, rand() < 0.07 ? 0.2 : 0); x += bw + 0.004; if (rand() < 0.06) x += 0.12; }
    }
  }
  function buildOffice(R) {
    const r = R.world.r, M = R.D, rand = R.rand, g = R.g, wc = 0x3a3128;
    // стены: тёмная вставка панели, плинтус; северная стена — окна
    F.shell(r, OF.x0, OF.x1, OF.z0, OF.z1, OF.h, 0x6a5a48, { s: [[-1, 1]], n: [[-5.7, 5.7]] }, { floor: 0x6a6258, ceil: 0x3a3028 });
    R.door = r.door(0, OF.z1, 2, 2.5); r.closeDoor(R.door);
    M.b(2.2, 2.6, 0.08, 0, 1.3, OF.z1 - 0.05, 0x1f1812); M.b(2.0, 2.4, 0.04, 0, 1.25, OF.z1 - 0.1, 0x2c2218); M.b(0.08, 0.2, 0.05, 0.75, 1.1, OF.z1 - 0.14, 0xa0a3aa);   // дверь
    // панели по периметру: вертикальные рейки до 1.3 м, молдинг
    [[OF.x0 + 0.2, 0, PI / 2, 11.6], [OF.x1 - 0.2, 0, -PI / 2, 11.6]].forEach((a) => {
      M.push(a[0], 0, -0.5, a[2]);
      M.b(11.9, 1.3, 0.05, 0, 0.65, 0, 0x2a2018); for (let i = 0; i < 24; i += 1) M.b(0.04, 1.26, 0.07, -5.8 + i * 0.5, 0.65, 0.01, 0x241b14); M.b(11.9, 0.08, 0.1, 0, 1.32, 0.02, 0x3a2c20); M.b(11.9, 0.14, 0.08, 0, 0.07, 0.02, 0x1a140f);
      M.pop();
    });
    M.push(0, 0, OF.z1 - 0.2, PI); M.b(12.8, 1.3, 0.05, 0, 0.65, 0, 0x2a2018); for (let i = 0; i < 25; i += 1) M.b(0.04, 1.26, 0.07, -6.0 + i * 0.5, 0.65, 0.01, 0x241b14); M.b(12.8, 0.08, 0.1, 0, 1.32, 0.02, 0x3a2c20); M.pop();
    // потолок: балки, карниз, люстра-панели
    for (let i = 0; i < 5; i += 1) { M.b(13.2, 0.22, 0.28, 0, OF.h - 0.12, -5.2 + i * 2.5, 0x2c231a); }
    M.b(13.1, 0.12, 0.2, 0, OF.h - 0.06, OF.z0 + 0.2, 0x1c150f);
    // северная стена: окно во всю ширину (подоконник 0.9 — верх 2.6), импосты, жалюзи под самым верхом
    r.box(0, 0.45, OF.z0, 11.4, 0.9, 0.3, 0x6a5a48, true);
    r.glass(0, 1.75, OF.z0, 11.4, 1.7, 0.1);
    M.b(0.3, OF.h, 0.34, -5.85, OF.h / 2, OF.z0, 0x2a2018); M.b(0.3, OF.h, 0.34, 5.85, OF.h / 2, OF.z0, 0x2a2018);
    for (let i = -2; i <= 2; i += 1) M.b(0.09, 1.7, 0.16, i * 2.28, 1.75, OF.z0 + 0.02, 0x15161a);
    M.b(11.5, 0.1, 0.24, 0, 0.92, OF.z0 + 0.03, 0x1c150f); M.b(11.5, 0.12, 0.2, 0, 2.62, OF.z0 + 0.02, 0x15161a);
    for (let i = 0; i < 14; i += 1) M.b(11.2, 0.016, 0.1, 0, 2.55 - i * 0.045, OF.z0 + 0.2, 0x8a7f6e, 0.45 - i * 0.015);
    M.b(11.2, 0.05, 0.08, 0, 2.58, OF.z0 + 0.22, 0x2a2b2e);
    M.b(11.0, 0.18, 0.16, 0, 0.6, OF.z0 + 0.3, 0x2a2b2e); for (let i = 0; i < 40; i += 1) M.b(0.02, 0.22, 0.12, -5.4 + i * 0.277, 0.6, OF.z0 + 0.32, 0x3a3d43);   // батарея под окном
    // город за окном
    const sky = new Mk(); skyline(sky, rand, OF.z0, -70, 70);
    const sk = sky.build({ cull: false }); g.add(sk);
    // луна
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: F.glowTex(), color: 0x9fb4d6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9, fog: false }));
    moon.position.set(-26, 28, -70); moon.scale.set(24, 24, 1); g.add(moon);
    // стол Диктора
    M.push(0, 0, -3.1, 0); desk(M); M.pop();
    world(R).col(R, 0, -3.1, 3.1, 1.4, 0.85);
    M.push(0, 0, -4.4, 0); chairExec(M, true); M.pop(); R.chairPos = [0, -4.4];
    // кресло игрока и второй стул перед столом
    M.push(0, 0, 0.6, 0); visitorChair(M); M.pop(); R.playerChair = [0, 0.6];
    M.push(-2.2, 0, 0.3, -0.3); visitorChair(M); M.pop();
    M.push(2.2, 0, 0.3, 0.3); visitorChair(M); M.pop();
    // ковёр с узором
    const rug = F.labelTex(512, 384, (c, w, h) => {
      c.fillStyle = '#2a1c18'; c.fillRect(0, 0, w, h); c.strokeStyle = '#6a5a3c'; c.lineWidth = 6; c.strokeRect(10, 10, w - 20, h - 20); c.lineWidth = 2; c.strokeRect(26, 26, w - 52, h - 52);
      c.fillStyle = '#4a2a24'; for (let x = 0; x < 9; x += 1) for (let y = 0; y < 7; y += 1) { c.save(); c.translate(52 + x * 51, 52 + y * 47); c.rotate(PI / 4); c.fillRect(-12, -12, 24, 24); c.restore(); }
      c.strokeStyle = '#7a6a48'; c.lineWidth = 2; for (let x = 0; x < 9; x += 1) for (let y = 0; y < 7; y += 1) { c.save(); c.translate(52 + x * 51, 52 + y * 47); c.rotate(PI / 4); c.strokeRect(-12, -12, 24, 24); c.restore(); }
    });
    const rm = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 4.8), new THREE.MeshLambertMaterial({ map: rug })); rm.rotation.x = -PI / 2; rm.position.set(0, 0.012, -0.8); g.add(rm);
    // стойка с оружием у восточной стены: рамы, миниган на кронштейнах, ленты, ящики с патронами
    const rx = OF.x1 - 0.5, rz = -1.2;
    M.push(rx, 0, rz, -PI / 2);
    M.b(2.6, 1.9, 0.12, 0, 0.95, 0, 0x232428); M.b(2.5, 1.8, 0.02, 0, 0.95, 0.07, 0x15161a);
    for (let i = 0; i < 4; i += 1) M.b(2.4, 0.04, 0.2, 0, 0.45 + i * 0.4, 0.14, 0x3a3d44);
    M.b(0.08, 1.9, 0.3, -1.3, 0.95, 0.08, 0x2e3036); M.b(0.08, 1.9, 0.3, 1.3, 0.95, 0.08, 0x2e3036);
    [-0.7, 0.7].forEach((x) => { M.b(0.1, 0.16, 0.22, x, 1.12, 0.2, 0x3a3d44); M.b(0.14, 0.04, 0.22, x, 1.03, 0.2, 0x15161a); });
    M.b(0.44, 0.34, 0.22, -0.9, 0.2, 0.3, 0x3d4538); M.b(0.46, 0.04, 0.24, -0.9, 0.39, 0.3, 0x2a3024); M.b(0.44, 0.34, 0.22, -0.35, 0.2, 0.3, 0x3d4538); M.b(0.44, 0.34, 0.22, 0.9, 0.2, 0.3, 0x3d4538);
    M.b(0.1, 0.05, 0.02, -0.9, 0.2, 0.42, 0xd8c178);
    M.pop();
    world(R).col(R, rx, rz, 0.9, 2.7, 1.9);
    R.mgMount = [rx - 0.3, 1.2, rz];
    const mg = R.mg = F.mgMesh(); mg.position.set(R.mgMount[0], R.mgMount[1], R.mgMount[2]); mg.scale.setScalar(1.15); mg.rotation.set(0, 0, 0); g.add(mg);
    // табло плана: чертёж комплекса (три этажа), фото с нитями
    const plan = F.labelTex(768, 480, (c, w, h) => {
      c.fillStyle = '#0c1a2a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#2f6f9f'; c.lineWidth = 1;
      for (let x = 0; x < w; x += 24) { c.globalAlpha = 0.25; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y < h; y += 24) { c.globalAlpha = 0.25; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } c.globalAlpha = 1;
      c.strokeStyle = '#7fc4f0'; c.lineWidth = 2; c.fillStyle = '#7fc4f0'; c.font = 'bold 20px monospace';
      const fl = (y, name, rooms) => { c.strokeRect(40, y, 680, 100); c.fillText(name, 52, y + 24); rooms.forEach((rr) => { c.strokeRect(rr[0], y + 34, rr[1], 56); if (rr[2]) c.fillText(rr[2], rr[0] + 6, y + 70); }); };
      fl(16, 'FLOOR 2  /  VAULT', [[90, 120, ''], [230, 60, ''], [310, 150, 'VAULT'], [480, 120, ''], [620, 80, 'STAIR']]);
      fl(140, 'FLOOR 1  /  HALL', [[90, 70, 'LIFT'], [180, 330, 'PUBLIC HALL'], [530, 90, ''], [640, 60, 'STAIR']]);
      fl(264, 'BASEMENT  /  B0', [[56, 120, 'GARAGE'], [190, 330, 'LONG CORRIDOR'], [540, 70, '083'], [620, 90, 'HEAD']]);
      c.strokeStyle = '#ff5050'; c.lineWidth = 3; c.setLineDash([8, 6]); c.beginPath(); c.moveTo(80, 430); c.lineTo(110, 380); c.lineTo(110, 200); c.lineTo(380, 180); c.lineTo(390, 70); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#ff5050'; c.font = 'bold 26px monospace'; c.fillText('NEXA INDUSTRIES  /  TARGET', 160, 450);
    });
    M.push(-OF.x1 + 0.55, 0, -1.5, PI / 2); M.b(4.2, 2.1, 0.06, 0, 1.75, 0, 0x2a2018); M.pop();
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 1.85), new THREE.MeshBasicMaterial({ map: plan })); pm.position.set(OF.x0 + 0.62, 1.78, -1.5); pm.rotation.y = PI / 2; g.add(pm);
    // фото и нити (красная нить к «маске»)
    for (let i = 0; i < 6; i += 1) { const py = 1.2 + (i % 2) * 0.55, pz = -3.2 + i * 0.9; M.push(OF.x0 + 0.62, 0, pz, PI / 2); M.b(0.34, 0.42, 0.01, 0, py, 0, 0xd8d6cc, 0, 0, rand() * 0.2 - 0.1); M.b(0.28, 0.32, 0.012, 0, py + 0.02, 0.0, 0x3a3a3e); M.pop(); }
    // шкаф, бар, глобус, торшер
    M.push(OF.x0 + 0.5, 0, 3.4, PI / 2); bookshelf(M, rand, 3.0, 2.8, 0.45); M.pop(); world(R).col(R, OF.x0 + 0.5, 3.4, 0.5, 3.0, 2.8);
    M.push(OF.x1 - 0.4, 0, 3.6, -PI / 2); M.b(1.6, 0.9, 0.5, 0, 0.45, 0, 0x2a2018); M.b(1.7, 0.05, 0.56, 0, 0.92, 0, 0x151517);
    [0, 0.35, 0.7].forEach((x, i) => { M.y(0.05, 0.07, 0.24, -0.5 + x, 1.06, 0, i === 1 ? 0x6a4a1a : 0x2f4a40, 10); M.y(0.018, 0.02, 0.1, -0.5 + x, 1.23, 0, 0x6a4a1a, 6); });
    M.b(0.04, 0.2, 0.04, 0.5, 1.02, 0.05, 0xd6d6d6); M.y(0.04, 0.04, 0.1, 0.62, 0.98, 0, 0xcfcfcf, 8); M.y(0.04, 0.04, 0.1, 0.7, 0.98, 0, 0xcfcfcf, 8);
    M.pop(); world(R).col(R, OF.x1 - 0.4, 3.6, 0.6, 1.7, 0.95);
    M.push(5.2, 0, -5.6, 0); M.y(0.18, 0.2, 0.04, 0, 0.02, 0, 0x2a2018, 12); M.b(0.04, 0.9, 0.04, 0, 0.5, 0, 0x2a2018); M.s(0.3, 0, 1.3, 0, 0x2a5a7a, 1, 1, 1, 14); M.tor(0.33, 0.012, 0, 1.3, 0, 0x9a8a60, 0.3, 0, 0.4, 20); M.pop();
    M.push(-5.2, 0, 1.6, 0); M.y(0.2, 0.22, 0.03, 0, 0.015, 0, 0x1a1a1c, 12); M.y(0.016, 0.016, 1.6, 0, 0.8, 0, 0x2a2b2e, 6); M.y(0.2, 0.34, 0.3, 0, 1.7, 0, 0x6a5a40, 12); M.pop();
    M.glow((gg) => gg.y(0.17, 0.17, 0.02, -5.2, 1.56, 1.6, 0xffd89a, 12));
    // бра на стенах (тёплый свет)
    [[-6.3, 3.0], [-6.3, -4.4], [6.3, 3.4], [6.3, -4.4]].forEach((a) => {
      M.b(0.1, 0.3, 0.14, a[0], 2.1, a[1], 0x6a5a40); M.glow((gg) => gg.b(0.1, 0.22, 0.12, a[0] + (a[0] < 0 ? 0.05 : -0.05), 2.12, a[1], 0xffe0a6));
    });
    // настольная лампа и потолочные светильники
    R.lampPos = [[0, 3.0, -3], [-3, 3.1, 1.5], [3, 3.1, 1.5], [0, 2.0, -3]];
    [[0, -3], [-3, 1.5], [3, 1.5]].forEach((a) => F.lampShade(M, a[0], OF.h - 0.55, a[1], 0x2c231a, 0xffe4b0, true));
    // дым-зона: пепельница на подставке у окна (левая сторона, где курит девушка)
    M.push(-3.6, 0, -1.3, 0); M.y(0.04, 0.04, 0.78, 0, 0.39, 0, 0x2a2b2e, 6); M.y(0.13, 0.12, 0.05, 0, 0.8, 0, 0x4a4d54, 12); M.y(0.1, 0.1, 0.02, 0, 0.83, 0, 0x151517, 12); M.y(0.006, 0.006, 0.07, 0.03, 0.85, 0.02, 0xcfcfcf, 5, 0, 1.2); M.y(0.006, 0.006, 0.06, -0.04, 0.85, 0.0, 0xcfcfcf, 5, 0, -1.0); M.pop();
    R.bounds = { cx: 0, cz: -0.5, w: 13, d: 12, h: OF.h };
  }

  // регистрация регионов ------------------------------------------------
  F.regions = function (w) {
    const R1 = w.def('wh', { build: buildWarehouse, surf: ['concrete_dark', 'metal', 'steel'], amb: 0.78, fogK: 0.65, fogC: 0x15171c, lampCol: 0xfff0d8, lampI: 0.9, lampD: 16, seed: 11 });
    const R2 = w.def('office', { build: buildOffice, surf: ['carpet', 'concrete', 'planks'], amb: 0.78, fogK: 0.3, fogC: 0x0b0e15, lampCol: 0xffd9a2, lampI: 0.85, lampD: 12, seed: 5 });
    [R1, R2].forEach((R) => { R.world = w; });
    if (F.regions2) F.regions2(w);
    if (F.regions3) F.regions3(w);
    if (F.regions4) F.regions4(w);
    if (F.regions5) F.regions5(w);
    if (F.regions6) F.regions6(w);
  };
  F.WH = WH; F.OF = OF;
  F.bookshelf = bookshelf; F.chairExec = chairExec; F.visitorChair = visitorChair; F.desk = desk; F.forklift = forklift; F.palletStack = palletStack; F.rackBays = rackBays; F.skyline = skyline;
}());
