// NEXA: миссия 48 — процедурные модели (цвет вершин, один-два draw call на модель): машина с салоном, трафик, дорожные блоки, склад, мебель, лифт, хранилище, мониторы.
// Только добавляет: C.f48.Mk (сборщик деталей со стеком преобразований) и фабрики C.f48.mk*; существующие функции не меняются.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.geo || !C.f48 || !C.f48.cmerge) return;
  const F = C.f48, G = C.geo, PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ------------------------------------------------------------------ сборщик: детали складываются в три корзины (твёрдое / свечение / стекло) со стеком преобразований
  class Mk {
    constructor() { this.a = []; this.g = []; this.q = []; this.T = new THREE.Matrix4(); this.st = []; this.bk = 'a'; }
    push(x, y, z, ry, rx, rz, s) { this.st.push(this.T.clone()); this.T.multiply(G.m4(x, y, z, rx, ry, rz, s || 1, s || 1, s || 1)); return this; }
    pop() { this.T = this.st.pop(); return this; }
    in(bk, fn) { const o = this.bk; this.bk = bk; fn(this); this.bk = o; return this; }
    glow(fn) { return this.in('g', fn); }
    glass(fn) { return this.in('q', fn); }
    put(p, c) { p.m = this.T.clone().multiply(p.m); p.c = c; this[this.bk].push(p); return this; }
    b(w, h, d, x, y, z, c, rx, ry, rz) { return this.put(G.box(w, h, d, x, y, z, rx, ry, rz), c); }
    // вертикальный цилиндр (ось Y): радиусы верх/низ, высота; rx/rz наклон; sx/sz растяжение сечения
    y(rt, rb, h, x, y, z, c, seg, rx, rz, sx, sz) { return this.put(G.cylY(rt, rb, h, x, y, z, sx, sz, seg || 10, rx, rz), c); }
    // цилиндр вдоль X (колёса, динамики)
    x(r, len, x, y, z, c, seg, rb) { return this.put(G.cylY(r, rb === undefined ? r : rb, len, x, y, z, 1, 1, seg || 12, 0, PI / 2), c); }
    // цилиндр вдоль Z
    z(r, len, x, y, z, c, seg, rb) { return this.put(G.cylY(r, rb === undefined ? r : rb, len, x, y, z, 1, 1, seg || 12, PI / 2, 0), c); }
    s(r, x, y, z, c, sx, sy, sz, seg) { return this.put(G.sph(r, x, y, z, sx, sy, sz, seg || 8), c); }
    // плоскость лицом к +Z (rx/ry/rz — поворот)
    pl(w, h, x, y, z, c, rx, ry, rz) { return this.put({ g: new THREE.PlaneGeometry(w, h), m: G.m4(x, y, z, rx, ry, rz) }, c); }
    tor(R, r, x, y, z, c, rx, ry, rz, seg) { return this.put({ g: new THREE.TorusGeometry(R, r, 6, seg || 18), m: G.m4(x, y, z, rx, ry, rz) }, c); }
    // сглаженный параллелепипед: основной блок + фаски (дёшево имитирует скругление)
    rb(w, h, d, x, y, z, c, k) {
      k = k || 0.04;
      this.b(w, h - 2 * k, d, x, y, z, c); this.b(w - 2 * k, h, d, x, y, z, c); this.b(w, h, d - 2 * k, x, y, z, c);
      return this;
    }
    // забор по линии: n одинаковых деталей от (x0,z0) до (x1,z1)
    row(n, x0, z0, x1, z1, fn) { for (let i = 0; i < n; i += 1) { const k = n === 1 ? 0.5 : i / (n - 1); fn(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k, i); } return this; }
    // сборка: Group { solid, glowMesh, glassMesh }
    build(o) {
      o = o || {};
      const T = THREE, grp = new T.Group();
      if (this.a.length) { const m = new T.Mesh(F.cmerge(this.a), F.vcMat(o.em)); m.frustumCulled = o.cull === true; grp.add(m); grp.solid = m; }
      if (this.g.length) { const m = new T.Mesh(F.cmerge(this.g), new T.MeshBasicMaterial({ vertexColors: true })); m.frustumCulled = o.cull === true; grp.add(m); grp.glowMesh = m; }
      if (this.q.length) {
        const m = new T.Mesh(F.cmerge(this.q), new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: o.glassOp === undefined ? 0.16 : o.glassOp, depthWrite: false, side: T.DoubleSide }));
        m.renderOrder = 2; m.frustumCulled = o.cull === true; grp.add(m); grp.glassMesh = m;
      }
      this.a = []; this.g = []; this.q = [];
      return grp;
    }
    // только геометрии (для общих мешей: дорожные блоки, трафик)
    geos() { const o = { a: this.a.length ? F.cmerge(this.a) : null, g: this.g.length ? F.cmerge(this.g) : null, q: this.q.length ? F.cmerge(this.q) : null }; this.a = []; this.g = []; this.q = []; return o; }
  }
  F.Mk = Mk;

  // ------------------------------------------------------------------ общие текстуры: ореолы, лучи фар, надписи
  F.glowTex = function () {
    if (F._glowT) return F._glowT;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 1, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (F._glowT = new THREE.CanvasTexture(c));
  };
  F.beamTex = function () { // пятно света фар на асфальте: вытянутый конус, яркий у капота
    if (F._beamT) return F._beamT;
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 256, 0, 0);
    gr.addColorStop(0, 'rgba(255,244,214,0.85)'); gr.addColorStop(0.35, 'rgba(255,244,214,0.3)'); gr.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(24, 256); g.lineTo(40, 256); g.lineTo(64, 0); g.lineTo(0, 0); g.closePath(); g.fill();
    const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; return (F._beamT = t);
  };
  F.labelTex = function (w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  };
  F.FONT = (px) => 'bold ' + px + 'px "Arial Black", Impact, "Helvetica Neue", sans-serif';
  // вывеска/табличка: плоскость с текстом (английский: миссия 48 вся на английском)
  F.sign = function (text, w, h, o) {
    o = o || {};
    const T = THREE, px = o.px || Math.round(h * 120), cw = Math.round(w * 128), ch = Math.round(h * 128);
    const tex = F.labelTex(cw, ch, (g) => {
      g.fillStyle = o.bg || '#101214'; g.fillRect(0, 0, cw, ch);
      if (o.edge) { g.strokeStyle = o.edge; g.lineWidth = Math.max(2, ch * 0.06); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, cw - g.lineWidth, ch - g.lineWidth); }
      g.font = F.FONT(px); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = o.fg || '#e8e8e8';
      const lines = String(text).split('\n');
      let fs = px; while (fs > 10 && lines.some((l) => g.measureText(l).width > cw * 0.92)) { fs -= 4; g.font = F.FONT(fs); }
      lines.forEach((l, i) => g.fillText(l, cw / 2, ch / 2 + (i - (lines.length - 1) / 2) * fs * 1.05));
    });
    const m = new T.Mesh(new T.PlaneGeometry(w, h), o.lit === false ? new T.MeshLambertMaterial({ map: tex }) : new T.MeshBasicMaterial({ map: tex }));
    return m;
  };

  // ================================================================== МАШИНА (седан, салон виден целиком)
  // Система: нос в −Z, водитель слева (−X), пассажир справа (+X), задний диван z≈1.0. Возвращает Group с полями:
  //   wheels[4] (крутить rotation.x), steer (руль, rotation.z), spk[] (динамики: масштаб/яркость в такт басам), lights, glowMesh
  const BODY = 0x33363c, TRIM = 0x131417, DARK = 0x0a0a0c, CHROME = 0x9a9da4, LEATHER = 0x1c1d21, STITCH = 0x3d3f46, PLASTIC = 0x16171a;
  function wheelMk(m) {
    m.x(0.345, 0.24, 0, 0, 0, 0x0a0a0b, 18); m.x(0.33, 0.256, 0, 0, 0, 0x1b1c1f, 18, 0.34); // шина и боковина
    m.x(0.225, 0.262, 0, 0, 0, 0x8b8e95, 16); m.x(0.17, 0.27, 0, 0, 0, 0x2a2b2f, 14);          // диск и его впадина
    for (let i = 0; i < 5; i += 1) { const a = i / 5 * TAU; m.b(0.272, 0.05, 0.07, 0, Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0xb4b7bd, a); }
    for (let i = 0; i < 5; i += 1) { const a = (i + 0.5) / 5 * TAU; m.x(0.014, 0.285, 0, Math.cos(a) * 0.065, Math.sin(a) * 0.065, 0xd6d8dc, 6); }
    m.x(0.05, 0.285, 0, 0, 0, 0x55575d, 8);
  }
  F.mkCar = function (o) {
    o = o || {};
    const T = THREE, M = new Mk(), body = o.color === undefined ? BODY : o.color;
    // --- шасси, пол
    M.b(1.7, 0.08, 4.1, 0, 0.34, 0, DARK); M.b(1.5, 0.12, 3.6, 0, 0.25, 0, 0x050506);
    M.b(1.64, 0.02, 3.2, 0, 0.386, 0.05, 0x131418);              // коврик
    M.b(0.3, 0.13, 1.7, 0, 0.44, -0.05, 0x101114);               // тоннель КПП
    // --- нижняя часть кузова с арками: перед, межарочные перемычки, дверь, зад
    [-1, 1].forEach((s) => {
      M.b(0.06, 0.46, 0.62, s * 0.93, 0.62, -2.04, body);                           // передний свес
      M.b(0.06, 0.15, 0.78, s * 0.93, 0.79, -1.45, body);                           // над передней аркой
      M.b(0.06, 0.48, 2.5, s * 0.93, 0.62, -0.02, body);                            // дверная часть
      M.b(0.06, 0.15, 0.9, s * 0.93, 0.79, 1.4, body);                              // над задней аркой
      M.b(0.06, 0.46, 0.58, s * 0.93, 0.62, 2.04, body);                            // задний свес
      M.b(0.04, 0.12, 2.3, s * 0.945, 0.43, 0.0, TRIM);                             // порог
      M.b(0.02, 0.012, 2.4, s * 0.96, 0.69, -0.02, 0x6c7078);                       // молдинг
      M.b(0.012, 0.4, 0.014, s * 0.96, 0.7, -0.62, 0x07070a); M.b(0.012, 0.4, 0.014, s * 0.96, 0.7, 0.58, 0x07070a); M.b(0.012, 0.4, 0.014, s * 0.96, 0.7, 1.12, 0x07070a);
      M.b(0.014, 0.025, 0.17, s * 0.962, 0.74, -0.5, CHROME); M.b(0.014, 0.025, 0.17, s * 0.962, 0.74, 0.7, CHROME); // ручки
      // арки: чёрные вкладыши и «потолок» арки
      [[-1.45, 0.78], [1.4, 0.9]].forEach((a) => {
        M.b(0.04, 0.4, a[1], s * 0.74, 0.55, a[0], DARK); M.b(0.22, 0.04, a[1], s * 0.84, 0.74, a[0], DARK);
        M.x(0.43, 0.012, s * 0.934, 0.34, a[0], 0x050506, 16);                       // тёмный диск арки
      });
      // стойки
      M.b(0.07, 0.96, 0.07, s * 0.86, 1.19, -0.54, body, 0.5);                      // A (наклон назад)
      M.b(0.075, 0.54, 0.1, s * 0.89, 1.14, 0.22, TRIM);                            // B
      M.b(0.07, 0.74, 0.1, s * 0.86, 1.2, 1.28, body, -0.55);                       // C
      M.b(0.05, 0.05, 2.0, s * 0.88, 0.97, 0.55, 0x0c0c0e);                         // нижняя окантовка окон
      // зеркала
      M.b(0.16, 0.1, 0.09, s * 1.03, 1.02, -0.66, body); M.b(0.03, 0.06, 0.14, s * 0.97, 1.0, -0.62, TRIM);
      M.b(0.13, 0.07, 0.015, s * 1.03, 1.02, -0.605, 0x20252c);
    });
    // --- капот, передок, багажник, крыша
    M.b(1.78, 0.05, 1.3, 0, 0.93, -1.58, body, 0.045); M.b(1.78, 0.2, 0.1, 0, 0.82, -2.3, body);
    M.b(0.7, 0.012, 1.2, 0, 0.958, -1.58, 0x464a52, 0.045);                       // блик/рёбра капота
    M.b(1.84, 0.22, 0.2, 0, 0.45, -2.27, TRIM); M.b(1.7, 0.05, 0.26, 0, 0.34, -2.3, DARK);   // бампер, губа
    M.b(1.2, 0.16, 0.05, 0, 0.7, -2.36, DARK); for (let i = 0; i < 4; i += 1) M.b(1.12, 0.012, 0.012, 0, 0.65 + i * 0.04, -2.39, CHROME);
    M.b(0.34, 0.07, 0.015, 0, 0.74, -2.395, CHROME); M.b(0.05, 0.05, 0.012, 0, 0.74, -2.4, 0x2a2c32);  // шильдик
    M.b(1.78, 0.05, 0.96, 0, 0.97, 1.82, body); M.b(1.8, 0.28, 0.1, 0, 0.82, 2.31, body);
    M.b(1.84, 0.22, 0.2, 0, 0.45, 2.28, TRIM); M.b(0.54, 0.13, 0.016, 0, 0.62, 2.395, 0xd8d8d6); M.b(0.46, 0.08, 0.018, 0, 0.62, 2.405, 0x181818); // бампер, номер
    M.b(1.76, 0.05, 1.14, 0, 1.45, 0.49, body, 0.0); M.b(1.7, 0.07, 0.14, 0, 1.43, -0.14, body); M.b(1.7, 0.07, 0.16, 0, 1.43, 1.1, body);
    M.b(1.64, 0.02, 1.2, 0, 1.41, 0.5, 0x28292d);                                // потолок изнутри
    M.b(0.18, 0.03, 0.12, 0, 1.395, 0.3, 0x35363b);                              // плафон
    // --- фары (свечение), стопы, противотуманки
    M.glow((g) => {
      [-1, 1].forEach((s) => {
        g.b(0.42, 0.1, 0.05, s * 0.6, 0.77, -2.37, 0xfff1cf); g.b(0.2, 0.05, 0.05, s * 0.78, 0.72, -2.37, 0xffd68a); g.b(0.14, 0.04, 0.05, s * 0.5, 0.57, -2.31, 0xfff6e6);
        g.b(0.44, 0.1, 0.05, s * 0.66, 0.86, 2.36, 0xff1b1b); g.b(0.2, 0.05, 0.05, s * 0.8, 0.8, 2.36, 0xff7a3a); g.b(0.09, 0.07, 0.05, s * 0.45, 0.58, 2.31, 0xe8e8e8);
      });
      g.b(0.34, 0.2, 0.012, 0, 0.9, -0.5, 0x1f2d3f);                           // экран мультимедиа
      g.b(0.5, 0.15, 0.012, -0.45, 0.99, -0.58, 0x1b2c44);                       // приборка
      g.b(0.16, 0.012, 0.012, -0.45, 1.01, -0.575, 0x60a4ff);
    });
    // --- приборка: стрелки/шкалы (свет)
    M.glow((g) => { g.b(0.012, 0.07, 0.01, -0.5, 0.985, -0.572, 0xff4a2a, 0, 0, 0.7); g.b(0.012, 0.07, 0.01, -0.37, 0.985, -0.572, 0xe9f3ff, 0, 0, -0.5); });
    // --- панель, консоль, руль-колонка, педали
    M.b(1.72, 0.1, 0.42, 0, 0.97, -0.8, PLASTIC); M.b(1.72, 0.3, 0.34, 0, 0.77, -0.8, 0x0e0f11); M.b(1.7, 0.06, 0.1, 0, 0.93, -0.55, 0x1d1e22);
    M.b(0.56, 0.17, 0.3, -0.45, 1.06, -0.76, PLASTIC); M.b(0.5, 0.012, 0.3, 0, 1.025, -0.84, 0x25272c);
    M.b(0.36, 0.52, 0.34, 0, 0.7, -0.68, 0x111214); M.b(0.34, 0.22, 0.02, 0, 0.9, -0.5, 0x0a0b0d);
    for (let i = 0; i < 3; i += 1) M.x(0.022, 0.03, -0.1 + i * 0.1, 0.74, -0.5, CHROME, 8);   // ручки климата
    M.b(0.32, 0.1, 0.02, 0, 0.82, -0.505, 0x1b1c20);
    [-0.15, 0.15].forEach((x) => { M.b(0.07, 0.07, 0.02, x, 0.95, -0.49, 0x08090a); for (let i = 0; i < 3; i += 1) M.b(0.06, 0.008, 0.012, x, 0.94 + i * 0.02, -0.482, 0x2c2e33); });
    [-0.85, 0.85].forEach((x) => { for (let i = 0; i < 3; i += 1) M.b(0.1, 0.008, 0.012, x * 0.9 + (x < 0 ? 0.05 : -0.05), 0.95 + i * 0.015, -0.6, 0x2c2e33); });
    M.b(0.56, 0.22, 0.02, 0.45, 0.77, -0.63, 0x191a1e); M.b(0.5, 0.018, 0.02, 0.45, 0.86, -0.62, 0x24262b);   // бардачок
    M.b(0.065, 0.065, 0.46, -0.45, 0.9, -0.47, 0x0c0c0e, 0.4);                  // колонка
    M.b(0.3, 0.015, 0.2, 0, 0.51, 0.14, 0x131418);                              // подлокотник центральный, основание
    M.b(0.26, 0.12, 0.42, 0, 0.52, 0.34, 0x141519); M.b(0.24, 0.02, 0.4, 0, 0.585, 0.34, 0x1f2024);       // подлокотник
    M.y(0.014, 0.014, 0.18, 0, 0.58, -0.1, 0x8a8c92, 8); M.s(0.032, 0, 0.67, -0.1, 0x16171a, 1, 1, 1, 8);  // рычаг КПП
    M.b(0.06, 0.04, 0.2, -0.16, 0.54, 0.1, 0x16171a, 0.05); M.b(0.012, 0.02, 0.1, -0.16, 0.57, 0.1, 0xcc2c2c); // ручник
    [[-0.45, -0.72], [-0.32, -0.74], [-0.57, -0.7]].forEach((p, i) => M.b(i ? 0.05 : 0.09, 0.015, i ? 0.14 : 0.09, p[0], 0.5 - i * 0.02, p[1], i ? 0x2a2b2f : 0x1a1b1f, -0.5)); // педали
    // --- зеркало заднего вида
    M.b(0.3, 0.075, 0.04, 0, 1.31, -0.19, 0x0c0c0e); M.b(0.27, 0.06, 0.01, 0, 1.31, -0.168, 0x384450); M.b(0.02, 0.1, 0.02, 0, 1.38, -0.17, TRIM);
    // --- сиденья
    const seat = (x, z, hr, belt) => {
      M.rb(0.5, 0.12, 0.54, x, 0.51, z, LEATHER, 0.03);                                      // подушка
      [-1, 1].forEach((s) => M.b(0.07, 0.15, 0.5, x + s * 0.235, 0.56, z, 0x232429, 0, 0, s * 0.15));
      M.b(0.4, 0.008, 0.46, x, 0.575, z, STITCH); M.b(0.008, 0.01, 0.46, x - 0.1, 0.578, z, 0x2e3036); M.b(0.008, 0.01, 0.46, x + 0.1, 0.578, z, 0x2e3036);
      M.push(x, 0.56, z + 0.27, 0, 0.18);                                                    // спинка с наклоном назад
      M.rb(0.5, 0.64, 0.13, 0, 0.32, 0, LEATHER, 0.03);
      [-1, 1].forEach((s) => M.b(0.07, 0.6, 0.15, s * 0.235, 0.32, -0.02, 0x232429, 0, 0, s * 0.05));
      M.b(0.38, 0.5, 0.01, 0, 0.32, -0.075, STITCH); for (let i = 0; i < 4; i += 1) M.b(0.38, 0.008, 0.012, 0, 0.12 + i * 0.12, -0.08, 0x2e3036);
      if (hr) { M.b(0.22, 0.17, 0.1, 0, 0.74, 0.02, LEATHER); M.y(0.01, 0.01, 0.12, -0.06, 0.66, 0.02, 0x8a8c92, 6); M.y(0.01, 0.01, 0.12, 0.06, 0.66, 0.02, 0x8a8c92, 6); }
      M.pop();
      if (belt) { M.b(0.05, 0.72, 0.012, x + belt * 0.12, 0.93, z + 0.2, 0x0b0b0d, 0.18, 0, -belt * 0.5); M.b(0.07, 0.05, 0.03, x - belt * 0.22, 0.58, z + 0.22, 0x55575d); }
    };
    seat(-0.45, 0.05, true, 1); seat(0.45, 0.05, true, -1);
    // задний диван
    M.rb(1.5, 0.14, 0.56, 0, 0.5, 1.0, LEATHER, 0.03);
    M.push(0, 0.56, 1.32, 0, 0.1); M.rb(1.5, 0.62, 0.14, 0, 0.31, 0, LEATHER, 0.03); M.b(1.3, 0.5, 0.01, 0, 0.31, -0.076, STITCH);
    [-0.5, 0, 0.5].forEach((x) => { M.b(0.22, 0.16, 0.1, x, 0.72, 0.02, LEATHER); });
    [-0.25, 0.25].forEach((x) => M.b(0.008, 0.6, 0.012, x, 0.31, -0.08, 0x0e0e10));
    M.pop();
    M.b(0.04, 0.5, 0.1, 0, 0.55, 1.27, 0x1b1c20);                                            // подлокотник вдоль
    // --- двери изнутри: карты, подлокотники, ручки, динамики (решётка статична; конус — отдельным мешем)
    [-1, 1].forEach((s) => {
      M.b(0.05, 0.54, 2.2, s * 0.865, 0.7, 0.08, 0x17181c); M.b(0.05, 0.1, 2.2, s * 0.86, 0.96, 0.08, 0x1e1f24);
      M.b(0.09, 0.055, 0.7, s * 0.82, 0.88, -0.38, 0x1b1c20); M.b(0.09, 0.055, 0.6, s * 0.82, 0.88, 0.8, 0x1b1c20);
      M.b(0.025, 0.03, 0.18, s * 0.835, 0.93, -0.55, CHROME); M.b(0.025, 0.03, 0.18, s * 0.835, 0.93, 0.7, CHROME);
      M.b(0.02, 0.05, 0.14, s * 0.84, 0.88, -0.2, 0x0a0a0c); for (let i = 0; i < 3; i += 1) M.b(0.012, 0.012, 0.03, s * 0.846, 0.9, -0.28 + i * 0.05, 0x3a3c42);
      M.b(0.01, 0.18, 2.0, s * 0.842, 0.62, 0.08, 0x202127);                                  // накладка двери
      M.x(0.135, 0.02, s * 0.838, 0.56, -0.45, 0x2b2c30, 16); M.x(0.115, 0.024, s * 0.835, 0.56, -0.45, 0x0f1012, 16);   // динамик передний
      M.x(0.135, 0.02, s * 0.838, 0.56, 0.86, 0x2b2c30, 16); M.x(0.115, 0.024, s * 0.835, 0.56, 0.86, 0x0f1012, 16);     // задний
      for (let i = 0; i < 5; i += 1) { M.b(0.012, 0.012, 0.22, s * 0.828, 0.5 + i * 0.03, -0.45, 0x30323a); M.b(0.012, 0.012, 0.22, s * 0.828, 0.5 + i * 0.03, 0.86, 0x30323a); }
      M.b(0.012, 0.1, 0.5, s * 0.84, 0.66, -0.88, 0x0d0d0f);                                  // сумка двери
    });
    M.b(1.5, 0.04, 0.5, 0, 0.98, 1.58, 0x131417);                                            // полка под задним стеклом
    // --- стёкла
    M.glass((q) => {
      const gc = 0x9fb4c8;
      q.pl(1.68, 0.98, 0, 1.19, -0.54, gc, -0.5);                                           // лобовое (наклон назад)
      q.pl(1.66, 0.86, 0, 1.19, 1.28, gc, 0.55, PI);                                        // заднее
      [-1, 1].forEach((s) => {
        q.pl(0.98, 0.44, s * 0.905, 1.21, -0.22, gc, 0, s * PI / 2); q.pl(0.88, 0.44, s * 0.905, 1.21, 0.76, gc, 0, s * PI / 2);   // боковые
      });
    });
    const grp = M.build({ glassOp: 0.14 });
    // --- динамики: отдельные меши (пульсируют); бас-конус и «уши» подсветки
    const spk = [], spkMat = new T.MeshBasicMaterial({ color: 0x3a3d46 });
    [[-1, -0.45], [-1, 0.86], [1, -0.45], [1, 0.86]].forEach((a) => {
      const cone = new T.Mesh(new T.CylinderGeometry(0.075, 0.03, 0.03, 12, 1, true), spkMat.clone()); // конус
      cone.rotation.z = PI / 2; cone.position.set(a[0] * 0.8, 0.56, a[1]);
      const cap = new T.Mesh(new T.SphereGeometry(0.03, 8, 6), new T.MeshBasicMaterial({ color: 0x6a6e78 })); cap.position.set(a[0] * 0.8, 0.56, a[1]);
      grp.add(cone, cap); spk.push({ cone, cap, base: a[0] * 0.8, side: a[0] });
    });
    // --- руль (отдельная группа: крутится вокруг своей оси)
    const sw = new Mk();
    sw.tor(0.185, 0.022, 0, 0, 0, 0x101113, 0, 0, 0, 22); sw.tor(0.185, 0.0235, 0, 0, 0, 0x16171a, 0, 0, 0, 22);
    sw.z(0.05, 0.05, 0, 0, 0.008, 0x1a1b1e, 12); sw.b(0.34, 0.034, 0.03, 0, 0, 0, 0x111214); sw.b(0.034, 0.17, 0.03, 0, -0.09, 0, 0x111214);
    sw.b(0.07, 0.02, 0.02, -0.11, 0.0, 0.02, CHROME); sw.b(0.07, 0.02, 0.02, 0.11, 0.0, 0.02, CHROME); sw.s(0.014, 0, 0.0, 0.022, 0xaaaeb5, 1, 1, 0.5, 6);
    const steer = sw.build();
    steer.position.set(-0.45, 1.0, -0.4); steer.rotation.x = -0.9; steer.rotation.order = 'ZXY';
    grp.add(steer);
    // --- колёса
    const wheels = [], WP = [[-0.83, -1.45], [0.83, -1.45], [-0.83, 1.4], [0.83, 1.4]];
    WP.forEach((p) => {
      const wm = new Mk(); wheelMk(wm);
      const w = wm.build({ cull: false });
      const holder = new T.Group(); holder.position.set(p[0], 0.345, p[1]);
      if (p[0] > 0) w.rotation.y = PI; // чтобы спицы смотрели одинаково с обеих сторон
      holder.add(w); grp.add(holder); wheels.push(holder);
    });
    // --- свет фар на асфальте (аддитивные «пятна»)
    const bt = F.beamTex(), beams = [];
    [-0.6, 0.6].forEach((x) => {
      const m = new T.Mesh(new T.PlaneGeometry(2.6, 20), new T.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.55, fog: false }));
      m.rotation.x = -PI / 2; m.position.set(x, 0.05, -12.4); m.renderOrder = 1; grp.add(m); beams.push(m);
    });
    const halo = [-0.6, 0.6].map((x) => { // ореол фар
      const sp = new T.Sprite(new T.SpriteMaterial({ map: F.glowTex(), color: 0xfff2d0, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.8 }));
      sp.position.set(x, 0.78, -2.5); sp.scale.setScalar(1.5); grp.add(sp); return sp;
    });
    grp.wheels = wheels; grp.steer = steer; grp.spk = spk; grp.beams = beams; grp.halo = halo;
    return grp;
  };

  // ================================================================== ТРАФИК (простые склеенные модели + свечение)
  // kind: sedan | hatch | van | truck | bus | taxi. Нос в −Z. Цвет задаётся материалом (multiplier), окраска вершин нейтрально-светлая.
  const trafGeo = {};
  function vehicle(kind) {
    const M = new Mk(), B = 0xdddddd, K = 0x101012, W = 0x8fa0b2;
    const wheel = (x, z, r) => { M.x(r, 0.24, x, r, z, 0x09090a, 10); M.x(r * 0.6, 0.25, x, r, z, 0x70737a, 8); };
    const lights = (w, yh, zf, zb, hy, tail) => {
      M.glow((g) => {
        [-1, 1].forEach((s) => { g.b(0.36, 0.1, 0.05, s * w * 0.32, yh, zf, 0xfff0cc); g.b(0.34, tail || 0.12, 0.05, s * w * 0.34, hy, zb, 0xff1c1c); });
      });
    };
    if (kind === 'van' || kind === 'truck' || kind === 'bus') {
      const L = kind === 'bus' ? 11 : kind === 'van' ? 5.2 : 7.4, W2 = kind === 'bus' ? 2.5 : 2.1, H = kind === 'bus' ? 3.1 : kind === 'van' ? 2.2 : 3.0;
      const z0 = -L / 2;
      if (kind === 'truck') {
        M.b(W2 * 0.95, 1.5, 2.2, 0, 1.05, z0 + 1.2, B); M.b(W2 * 0.9, 0.6, 1.0, 0, 1.55, z0 + 0.4, B);                      // кабина
        M.b(W2 * 0.92, 0.55, 0.04, 0, 1.75, z0 + 0.02, K); M.b(W2, 0.5, 0.15, 0, 0.62, z0 + 0.05, 0x333336);
        M.b(W2, 2.3, 4.7, 0, 1.15 + 0.75, z0 + 3.0 + 1.6, 0xb8b8bc); M.b(W2 + 0.02, 0.1, 4.8, 0, 0.55, z0 + 4.55, K);       // кузов-фургон
        wheel(-W2 / 2, z0 + 1.2, 0.5); wheel(W2 / 2, z0 + 1.2, 0.5); wheel(-W2 / 2, L / 2 - 1.5, 0.5); wheel(W2 / 2, L / 2 - 1.5, 0.5); wheel(-W2 / 2, L / 2 - 0.5, 0.5); wheel(W2 / 2, L / 2 - 0.5, 0.5);
        lights(W2, 0.85, z0 - 0.02, L / 2 + 0.02, 0.9);
      } else {
        M.b(W2, H - 0.7, L, 0, 0.7 + (H - 0.7) / 2, 0, B); M.b(W2 + 0.02, 0.55, L - 0.05, 0, 0.45, 0, K);
        M.b(W2 * 0.96, 0.85, 0.04, 0, 1.75 - (kind === 'van' ? 0 : -0.2), z0 + 0.02, K);                                     // лобовое
        if (kind === 'bus') { for (let i = 0; i < 8; i += 1) [-1, 1].forEach((s) => M.b(0.03, 0.9, 1.1, s * W2 / 2, 2.05, z0 + 1.2 + i * 1.2, K)); M.glow((g) => g.b(1.2, 0.2, 0.05, 0, 3.0, z0 - 0.01, 0xffc86a)); }
        else for (let i = 0; i < 2; i += 1) [-1, 1].forEach((s) => M.b(0.03, 0.7, 1.2, s * W2 / 2, 1.7, z0 + 1.0 + i * 1.5, K));
        const ax = kind === 'bus' ? [z0 + 1.6, L / 2 - 2.2] : [z0 + 1.0, L / 2 - 1.0];
        ax.forEach((z) => { wheel(-W2 / 2, z, 0.44); wheel(W2 / 2, z, 0.44); });
        lights(W2, 0.8, z0 - 0.02, L / 2 + 0.02, 1.0);
      }
    } else {
      const hatch = kind === 'hatch', taxi = kind === 'taxi', L = hatch ? 3.9 : 4.5, z0 = -L / 2;
      M.b(1.78, 0.5, L, 0, 0.6, 0, B); M.b(1.74, 0.2, L - 0.1, 0, 0.35, 0, K);                                              // кузов
      M.b(1.78, 0.05, 1.2, 0, 0.88, z0 + 0.8, B, 0.04);                                                                      // капот
      M.b(1.6, 0.5, hatch ? 2.1 : 1.8, 0, 1.12, hatch ? 0.15 : 0.1, B);                                                      // кабина
      M.b(1.62, 0.02, 0.04, 0, 0.92, z0 + 1.62, 0x0b0b0c);
      M.glass((q) => { q.b(1.62, 0.34, 0.04, 0, 1.12, hatch ? z0 + 1.6 : z0 + 1.55, 0x151a20); q.b(1.64, 0.36, hatch ? 0.05 : 0.04, 0, 1.13, hatch ? 1.2 : 1.0, 0x151a20); });
      M.b(1.64, 0.3, 1.7, 0, 1.13, 0.1, 0x16191e); M.b(1.62, 0.34, 1.0, 0, 1.12, hatch ? 0.5 : 0.1, 0x0d0f12);              // стёкла салона тёмные
      M.b(1.8, 0.2, 0.15, 0, 0.45, z0 + 0.03, K); M.b(1.8, 0.2, 0.15, 0, 0.45, L / 2 - 0.03, K);                           // бамперы
      [-0.82, 0.82].forEach((x) => { wheel(x, z0 + 0.85, 0.32); wheel(x, L / 2 - 0.85, 0.32); });
      lights(1.78, 0.74, z0 - 0.01, L / 2 + 0.01, 0.8, 0.1);
      if (taxi) { M.glow((g) => g.b(0.5, 0.14, 0.2, 0, 1.46, 0.1, 0xffe27a)); M.b(0.5, 0.04, 0.2, 0, 1.4, 0.1, K); M.b(1.78, 0.05, 0.1, 0, 0.62, 0, 0xe8c84a); }
    }
    return M.geos();
  }
  const TRAF_MAT = {};
  F.trafficCar = function (kind, color) {
    const T = THREE, g = trafGeo[kind] || (trafGeo[kind] = vehicle(kind)), grp = new T.Group();
    const key = kind + color, mat = TRAF_MAT[key] || (TRAF_MAT[key] = new T.MeshLambertMaterial({ vertexColors: true, color, emissive: 0x08080a }));
    if (g.a) { const m = new T.Mesh(g.a, mat); m.frustumCulled = false; grp.add(m); }
    if (g.g) { const m = new T.Mesh(g.g, F._trafGlow || (F._trafGlow = new T.MeshBasicMaterial({ vertexColors: true }))); m.frustumCulled = false; grp.add(m); }
    if (g.q) { const m = new T.Mesh(g.q, F._trafGlass || (F._trafGlass = new T.MeshLambertMaterial({ vertexColors: true, color: 0x222831 }))); m.frustumCulled = false; grp.add(m); }
    grp.kind = kind;
    return grp;
  };
  F.trafficLen = { sedan: 4.5, hatch: 3.9, taxi: 4.5, van: 5.2, truck: 7.4, bus: 11 };
}());
