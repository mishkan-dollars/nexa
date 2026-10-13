// NEXA: миссия 48 — регионы 2: ночной двор NEXA (стелс, вход в подвал) и подвал B0 (гараж, арсенал, грузовой лифт).
// Общий построитель лифта F.lift(R, x, z, o): двери, кабина, табло этажа, звонок — используется в подвале и в холле.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.World || !C.f48.shell || !C.f48.Mk || !C.f48.sign) return;
  const F = C.f48, PI = Math.PI, TAU = PI * 2;
  const world = (R) => R.world;
  const hex = (c, k) => ((((c >> 16) & 255) * k | 0) << 16) | ((((c >> 8) & 255) * k | 0) << 8) | ((c & 255) * k | 0);
  const solid = (R, x, z, w, d, h, y0) => world(R).col(R, x, z, w, d, h, y0);

  // ------------------------------------------------------------------ реквизит
  // контейнер: ось по Z (торец с дверями на +Z), 2.44 × 2.6 × len
  function container(M, col, len) {
    const L = len || 6.05, hw = 1.22, dk = hex(col, 0.5);
    M.b(2.44, 0.14, L, 0, 0.1, 0, dk); M.b(2.44, 0.1, L, 0, 2.55, 0, dk);
    [-1, 1].forEach((s) => {
      M.b(0.06, 2.4, L - 0.1, s * (hw - 0.03), 1.3, 0, col);
      for (let k = 0; k < L / 0.22 - 1; k += 1) M.b(0.05, 2.3, 0.11, s * (hw + 0.005), 1.3, -L / 2 + 0.25 + k * 0.22, k % 2 ? col : hex(col, 0.8));
      M.b(0.1, 0.12, L, s * hw, 0.2, 0, dk); M.b(0.1, 0.12, L, s * hw, 2.5, 0, dk);
      M.b(0.2, 0.2, 0.2, s * hw, 0.14, L / 2 - 0.05, 0x1a1a1c); M.b(0.2, 0.2, 0.2, s * hw, 2.5, L / 2 - 0.05, 0x1a1a1c);
    });
    M.b(2.44, 2.4, 0.08, 0, 1.3, -L / 2 + 0.04, hex(col, 0.9));
    [-1, 1].forEach((s) => {
      M.b(1.14, 2.3, 0.05, s * 0.58, 1.3, L / 2 - 0.02, hex(col, 0.95));
      for (let k = 0; k < 6; k += 1) M.b(0.04, 2.25, 0.03, s * (0.12 + k * 0.19), 1.3, L / 2 + 0.01, hex(col, 0.78));
      [0.2, 0.6].forEach((o) => M.y(0.018, 0.018, 2.3, s * (0.2 + o * 0.55), 1.3, L / 2 + 0.05, 0x8a8c92, 6));
    });
    M.b(1.0, 0.4, 0.012, -hw - 0.012, 1.7, 0.4, 0xdcdcdc, 0, PI / 2); M.b(0.8, 0.16, 0.014, -hw - 0.014, 1.7, 0.4, hex(col, 0.4), 0, PI / 2);
  }
  function dumpster(M, c) { // начало — центр, крышка к −Z
    M.b(1.9, 0.95, 1.1, 0, 0.74, 0, c); M.b(1.96, 0.07, 1.16, 0, 1.24, 0, hex(c, 0.45));
    M.b(1.92, 0.05, 0.58, 0, 1.36, -0.32, hex(c, 0.6), -0.55);
    [-0.82, 0.82].forEach((x) => [-0.45, 0.45].forEach((z) => { M.y(0.07, 0.07, 0.06, x, 0.1, z, 0x0e0e10, 8); M.b(0.05, 0.3, 0.05, x, 0.25, z, 0x1a1a1c); }));
    M.b(1.4, 0.1, 0.012, 0, 0.95, 0.56, 0xd8d8d0); M.b(0.04, 0.5, 0.04, -0.94, 0.9, 0.5, 0x2a2a2c); M.b(0.04, 0.5, 0.04, 0.94, 0.9, 0.5, 0x2a2a2c);
    M.b(0.3, 0.2, 0.22, 0.3, 1.45, 0.1, 0x6a6a5a, 0, 0.4); M.b(0.22, 0.14, 0.18, -0.4, 1.4, 0.05, 0xb8b4a8, 0, -0.5);   // мусор сверху
  }
  function barrel(M, c) { M.y(0.29, 0.29, 0.88, 0, 0.44, 0, c, 14); [0.12, 0.44, 0.76].forEach((y) => M.y(0.3, 0.3, 0.035, 0, y, 0, hex(c, 0.55), 14)); M.y(0.22, 0.22, 0.02, 0, 0.89, 0, hex(c, 0.4), 12); M.y(0.04, 0.04, 0.03, 0.1, 0.9, 0.08, 0x151515, 6); }
  function lampPost(M, R, x, z, h, col) { // фонарь на мачте: плафон, свет, конус
    M.y(0.07, 0.1, h, x, h / 2, z, 0x2a2c30, 8); M.y(0.16, 0.16, 0.12, x, 0.06, z, 0x1a1b1e, 8);
    M.b(0.08, 0.08, 1.1, x, h + 0.02, z - 0.5, 0x2a2c30, 0.2); M.b(0.5, 0.1, 0.22, x, h - 0.1, z - 1.05, 0x1c1d20);
    M.glow((g) => { g.b(0.44, 0.04, 0.17, x, h - 0.17, z - 1.05, col || 0xffd9a0); });
    R.lampPos.push([x, h - 0.5, z - 1.05]);
    R.halos.push([x, h - 0.2, z - 1.05, col || 0xffcf90, 4.4]);
    solid(R, x, z, 0.5, 0.5, h);
  }
  function fenceBar(M, x0, z0, x1, z1, h) { // решётка/забор: стойки, верхняя колючая проволока
    const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.35), a = Math.atan2(x1 - x0, z1 - z0);
    M.row(n, x0, z0, x1, z1, (x, z) => M.b(0.03, h, 0.03, x, h / 2, z, 0x1c1d20));
    M.push((x0 + x1) / 2, 0, (z0 + z1) / 2, a); const L = Math.hypot(x1 - x0, z1 - z0); M.b(0.05, 0.05, L, 0, h, 0, 0x2a2c30); M.b(0.05, 0.05, L, 0, 0.1, 0, 0x2a2c30); M.pop();
  }
  function crateBox(M, x, z, s, c, ry) { M.push(x, 0, z, ry || 0); M.b(s, s, s, 0, s / 2, 0, c); M.b(s + 0.02, 0.05, s + 0.02, 0, 0.05, 0, hex(c, 0.6)); M.b(s + 0.02, 0.05, s + 0.02, 0, s - 0.05, 0, hex(c, 0.6)); M.b(s * 0.5, s * 0.3, 0.01, 0, s * 0.55, s / 2 + 0.01, 0xdcdcd0); M.pop(); }

  // ------------------------------------------------------------------ лифт (двери смотрят на +Z, кабина уходит в −Z)
  // L = F.lift(R, x, z, { floor: 'B0', cab: 3.0 }) → { open(k), close(k), setFloor(s, dir), door: {col}, cab:{x,z0,z1} }
  F.lift = function (R, x, z, o) {
    o = o || {};
    const r = R.world.r, T = THREE, M = R.D, depth = o.cab || 3.0, hw = 1.9;
    const L = { x, z, k: 0, depth };
    // шахта-кабина: пол, потолок, стенки
    r.box(x, -0.04, z - depth / 2, hw * 2, 0.08, depth, 0x8a8c92, false);
    r.box(x, 2.9, z - depth / 2, hw * 2, 0.1, depth, 0x5a5c62, false);
    r.box(x, 1.45, z - depth - 0.05, hw * 2 + 0.2, 2.9, 0.1, 0x7a7d84, true);
    r.box(x - hw - 0.05, 1.45, z - depth / 2, 0.1, 2.9, depth, 0x7a7d84, true);
    r.box(x + hw + 0.05, 1.45, z - depth / 2, 0.1, 2.9, depth, 0x7a7d84, true);
    // отделка кабины
    M.b(hw * 2 - 0.1, 0.9, 0.04, x, 0.45, z - depth + 0.02, 0x3a3d44); M.b(hw * 2 - 0.1, 1.3, 0.03, x, 1.55, z - depth + 0.02, 0xb4b8c0); M.b(hw * 2 - 0.1, 0.08, 0.06, x, 0.92, z - depth + 0.03, 0x1a1b1e);
    [-1, 1].forEach((s) => { M.b(0.04, 0.9, depth - 0.1, x + s * (hw - 0.02), 0.45, z - depth / 2, 0x3a3d44); M.b(0.03, 1.3, depth - 0.1, x + s * (hw - 0.02), 1.55, z - depth / 2, 0xb4b8c0); M.y(0.025, 0.025, depth - 0.3, x + s * (hw - 0.09), 0.98, z - depth / 2, 0xcfd2d8, 8, PI / 2, 0); });
    for (let i = 0; i < 6; i += 1) { M.b(0.012, 1.3, 0.016, x - 1.6 + i * 0.64, 1.55, z - depth + 0.04, 0x8f939b); }
    M.b(hw * 2 - 0.1, 0.12, depth - 0.1, x, 2.82, z - depth / 2, 0x2a2c30); M.glow((g) => g.b(hw * 2 - 0.6, 0.02, depth - 0.7, x, 2.75, z - depth / 2, 0xeef2ff));
    for (let i = 0; i < 3; i += 1) M.b(hw * 2 - 0.1, 0.018, 0.02, x, 0.04, z - 0.5 - i * 0.9, 0x6a6c72);       // полозья пола
    // кнопочная панель справа внутри
    M.b(0.34, 0.9, 0.04, x + hw - 0.3, 1.25, z - depth + 0.82, 0x15161a, 0, PI / 2); M.glow((g) => { for (let i = 0; i < 3; i += 1) g.b(0.07, 0.07, 0.015, x + hw - 0.27, 1.5 - i * 0.16, z - depth + 0.82, i === 0 ? 0xff5a3a : 0xffe4a0, 0, PI / 2); });
    // двери: две створки на уровне стены; в закрытом состоянии перекрывают проём
    const mat = new T.MeshLambertMaterial({ color: 0xa9adb6 });
    const mk = () => { const g = new T.Group(); const m = new T.Mesh(r.g.box, mat); m.scale.set(1.7, 2.6, 0.1); m.position.y = 1.3; g.add(m); for (let i = 0; i < 4; i += 1) { const gr = new T.Mesh(r.g.box, r.mat(0x5a5d65)); gr.scale.set(0.025, 2.5, 0.12); gr.position.set(-0.6 + i * 0.4, 1.3, 0); g.add(gr); } const st = new T.Mesh(r.g.box, r.basic(0xf2c230)); st.scale.set(1.7, 0.1, 0.12); st.position.y = 0.3; g.add(st); R.g.add(g); return g; };
    L.dl = mk(); L.dr = mk(); L.dl.position.set(x - 0.85, 0, z); L.dr.position.set(x + 0.85, 0, z);
    L.col = solid(R, x, z, hw * 1.8, 0.3, 2.7);
    // рама проёма с внешней стороны + знаки
    M.b(0.18, 2.75, 0.4, x - hw + 0.05, 1.37, z + 0.1, 0x4a4d54); M.b(0.18, 2.75, 0.4, x + hw - 0.05, 1.37, z + 0.1, 0x4a4d54); M.b(hw * 2 + 0.3, 0.3, 0.4, x, 2.72, z + 0.1, 0x4a4d54);
    M.b(0.12, 0.28, 0.06, x + hw + 0.5, 1.2, z + 0.2, 0x15161a); M.glow((g) => { g.b(0.05, 0.05, 0.02, x + hw + 0.5, 1.26, z + 0.24, 0xff6a2a); g.b(0.05, 0.05, 0.02, x + hw + 0.5, 1.14, z + 0.24, 0xff6a2a); });
    // табло этажа над дверями: канвас, перерисовывается
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const g2 = cv.getContext('2d'), tex = new T.CanvasTexture(cv);
    L.setFloor = (s, dir) => {
      g2.fillStyle = '#080808'; g2.fillRect(0, 0, 256, 96); g2.strokeStyle = '#2a2a2a'; g2.lineWidth = 4; g2.strokeRect(2, 2, 252, 92);
      g2.fillStyle = '#ff8a2a'; g2.font = 'bold 66px "Arial Black", Impact, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(String(s), 128, 52);
      if (dir) { g2.beginPath(); if (dir > 0) { g2.moveTo(30, 62); g2.lineTo(52, 28); g2.lineTo(74, 62); } else { g2.moveTo(30, 34); g2.lineTo(52, 68); g2.lineTo(74, 34); } g2.closePath(); g2.fill(); }
      tex.needsUpdate = true;
    };
    L.setFloor(o.floor || 'B0', 0);
    const ind = new T.Mesh(new T.PlaneGeometry(0.9, 0.34), new T.MeshBasicMaterial({ map: tex })); ind.position.set(x, 2.5, z + 0.32); R.g.add(ind); L.ind = ind;
    L.k = 0;
    L.set = (k) => {
      L.k = k; const w = 1.55 * k;
      L.dl.position.x = x - 0.85 - w; L.dr.position.x = x + 0.85 + w;
      L.col.off = k > 0.3;
    };
    L.open = async (r2, dur) => { await r2.tween(dur || 1.8, (k) => L.set(k), (k) => k * k * (3 - 2 * k)); };
    L.close = async (r2, dur) => { await r2.tween(dur || 1.8, (k) => L.set(1 - k), (k) => k * k * (3 - 2 * k)); };
    L.cabPoint = (dx, dz) => [x + dx, z - depth / 2 + dz];
    R.halos.push([x, 2.7, z - depth / 2, 0xeef2ff, 3.4]);
    R.lampPos.push([x, 2.7, z - depth / 2]);
    return L;
  };

  // ------------------------------------------------------------------ ДВОР NEXA (ночь)
  // x ∈ [−30, 30], z ∈ [−30, 16] (+дорога за воротами до z=28). Север — фасад комплекса; персональная дверь в подвал — x=−8.5.
  const Y = { x0: -30, x1: 30, z0: -30, z1: 16, h: 4.4 };
  function buildYard(R, g, opt) {
    opt = opt || {};
    const r = R.world.r, M = R.D, rand = R.rand, T = THREE, pick = (a) => a[Math.floor(rand() * a.length)];
    R.lampPos = []; R.halos = [];
    F.shell(r, Y.x0, Y.x1, Y.z0, Y.z1, Y.h, 0x5a5a60, { n: opt.plaza ? [[-31, 31]] : [[-9.3, -7.7]] }, { floor: 0x4a4a4e, open: true });
    // фасад: высокая стена комплекса вместо низкой (поверх стены z0)
    if (!opt.plaza) r.box(0, 8, Y.z0 - 0.4, 62, 16, 0.5, 0x4a3a34, false);
    r.box(0, -0.05, 22, 24, 0.1, 12, 0x3a3a3e, false);                                   // дорога за воротами
    // ---- забор по периметру: пилястры, парапет, колючая проволока, прожекторы
    for (let z = -28; z <= 14; z += 6) [Y.x0, Y.x1].forEach((x) => { M.b(0.7, Y.h + 0.4, 0.7, x + (x < 0 ? 0.15 : -0.15), (Y.h + 0.4) / 2, z, 0x3e3f44); M.b(0.8, 0.12, 0.8, x + (x < 0 ? 0.15 : -0.15), Y.h + 0.46, z, 0x2a2b2e); });
    for (let x = -28; x <= 28; x += 6) if (Math.abs(x) > 6) { M.b(0.7, Y.h + 0.4, 0.7, x, (Y.h + 0.4) / 2, Y.z1 - 0.15, 0x3e3f44); M.b(0.8, 0.12, 0.8, x, Y.h + 0.46, Y.z1 - 0.15, 0x2a2b2e); }
    for (let i = 0; i < 28; i += 1) { M.b(0.02, 0.5, 0.02, Y.x0 + 0.15, Y.h + 0.7, -29 + i * 1.6, 0x1a1a1c, 0.5); M.b(0.02, 0.5, 0.02, Y.x1 - 0.15, Y.h + 0.7, -29 + i * 1.6, 0x1a1a1c, -0.5); }
    // ---- ворота: опорные столбы, откатная створка с рейками, будка охраны, сигнал
    [-5.1, 5.1].forEach((x) => { M.b(0.8, 3.6, 0.8, x, 1.8, Y.z1 - 0.1, 0x3e3f44); M.b(0.95, 0.14, 0.95, x, 3.67, Y.z1 - 0.1, 0x2a2b2e); });
    M.b(10.5, 0.5, 0.5, 0, 4.1, Y.z1 - 0.1, 0x3a3b40);
    const gs = F.sign('NEXA  INDUSTRIES\nSERVICE ENTRANCE — NO ADMITTANCE', 7.2, 0.9, { bg: '#111316', fg: '#e8e8e8', edge: '#cf3030' }); gs.position.set(0, 4.1, Y.z1 - 0.37); g.add(gs);
    M.push(0, 0, Y.z1 - 0.2, 0); for (let i = 0; i < 20; i += 1) M.b(0.04, 1.9, 0.04, -4.3 + i * 0.45, 1.1, 0, 0x2a2c30); M.b(9.4, 0.06, 0.06, 0, 2.1, 0, 0x3a3d44); M.b(9.4, 0.06, 0.06, 0, 0.25, 0, 0x3a3d44); M.pop();
    
    M.glow((q) => { q.y(0.1, 0.1, 0.12, -5.1, 3.9, Y.z1 - 0.1, 0xff3a2a, 8); q.y(0.1, 0.1, 0.12, 5.1, 3.9, Y.z1 - 0.1, 0xff3a2a, 8); });
    // будка охраны у ворот (с тёплым окном; пустая)
    M.push(-11, 0, 12, 0);
    M.b(3.0, 0.12, 2.4, 0, 0.06, 0, 0x4a4a50); M.b(3.0, 2.2, 0.1, 0, 1.2, -1.2, 0x6a6c72); M.b(0.1, 2.2, 2.4, -1.5, 1.2, 0, 0x6a6c72); M.b(0.1, 2.2, 2.4, 1.5, 1.2, 0, 0x6a6c72); M.b(3.3, 0.12, 2.7, 0, 2.36, 0, 0x2a2b2e);
    M.glass((q) => { q.b(3.0, 1.3, 0.05, 0, 1.45, 1.2, 0xaec2d4); q.b(0.05, 1.3, 2.4, 1.5, 1.45, 0, 0xaec2d4); });
    M.b(1.6, 0.06, 0.6, 0, 0.82, -0.8, 0x3a3328); M.b(0.5, 0.46, 0.5, 0.2, 0.5, -0.3, 0x15151a); M.glow((q) => { q.b(0.44, 0.3, 0.02, -0.5, 1.05, -1.1, 0x6aa0d0); q.b(0.36, 0.01, 0.2, 0, 0.855, -0.8, 0xffe8b0); });
    M.pop(); solid(R, -11, 12, 3.1, 2.5, 2.4);
    R.lampPos.push([-11, 2.4, 12]);
    // ---- асфальт: разметка, парковка справа, дренаж, лужи
    const mk = (x, z, w, d, c) => M.b(w, 0.012, d, x, 0.006, z, c);
    for (let i = 0; i < 6; i += 1) mk(13 + i * 3.4, 1, 0.14, 6, 0xc8c8c0);
    mk(21, -2.2, 17, 0.14, 0xc8c8c0); mk(0, 4, 0.2, 24, 0xcfb23a); mk(-6, 4, 0.2, 24, 0xcfb23a);
    for (let z = -26; z < 14; z += 3) mk(-24.5, z, 0.12, 1.4, 0xd8d8d0);
    for (let i = 0; i < 3; i += 1) mk(0, -22 + i * 3, 3.0, 0.5, 0xc9a82a);                            // «ёлочка» у входа
    M.glass((q) => { [[-4, 6, 3.4, 2.2], [9, -12, 4.2, 3], [-21, -14, 3, 2], [3, -26, 5, 2.4], [17, 12, 2.6, 1.8]].forEach((p) => q.b(p[2], 0.012, p[3], p[0], 0.014, p[1], 0x5a7a9a)); });
    [[-17, 4], [2, -9], [14, -17], [24, 10]].forEach((p) => { M.y(0.35, 0.35, 0.02, p[0], 0.012, p[1], 0x151517, 10); for (let k = 0; k < 4; k += 1) M.b(0.5, 0.012, 0.04, p[0], 0.024, p[1] - 0.18 + k * 0.12, 0x2a2b2e); });
    // ---- фасад NEXA: цоколь, карнизы, окна, вывеска, водостоки
    const FZ = Y.z0 + 0.45;
    if (!opt.plaza) {
    M.b(62, 1.3, 0.16, 0, 0.65, FZ, 0x5c5e64); M.b(62, 0.28, 0.4, 0, 1.4, FZ - 0.02, 0x3a3c42);
    [5.6, 11.0, 15.7].forEach((y) => { M.b(62, 0.32, 0.52, 0, y, FZ - 0.04, 0x3a3c42); M.b(62, 0.1, 0.62, 0, y + 0.2, FZ - 0.06, 0x2a2b30); });
    for (let x = -28; x <= 28; x += 7) { M.b(0.8, 16, 0.5, x, 8, FZ - 0.05, 0x44464c); M.b(0.9, 0.3, 0.6, x, 15.9, FZ - 0.07, 0x34363a); }
    const warm = [0xffd9a0, 0xffc880, 0xfff0cc, 0xbfe1ff, 0x9ecbff];
    [[3.6, 3.2], [8.0, 2.6], [13.0, 2.4]].forEach((fl, fi) => {
      for (let x = -26; x <= 26; x += 3.5) {
        if (Math.abs(((x + 28) % 7) - 0) < 0.4 || ((x + 28) % 7) > 6.6) continue;
        M.b(2.5, fl[1] * 0.6, 0.12, x, fl[0], FZ + 0.0, 0x0e1014);                                   // тёмный проём
        const on = rand() < (fi === 0 ? 0.35 : 0.5), wc = pick(warm), kk = 0.35 + rand() * 0.5;
        if (on) M.glow((q) => q.b(2.3, fl[1] * 0.52, 0.02, x, fl[0], FZ + 0.07, hex(wc, kk)));
        else M.glass((q) => q.b(2.4, fl[1] * 0.55, 0.02, x, fl[0], FZ + 0.07, 0x1c2430));
        M.b(0.05, fl[1] * 0.6, 0.06, x, fl[0], FZ + 0.1, 0x15161a); M.b(2.6, 0.05, 0.1, x, fl[0] - fl[1] * 0.32, FZ + 0.1, 0x2a2b2e);
        if (fi === 0) for (let b = 0; b < 4; b += 1) M.b(0.03, fl[1] * 0.6, 0.03, x - 0.9 + b * 0.6, fl[0], FZ + 0.12, 0x1a1a1c);   // решётки первого этажа
      }
    });
    const big = F.sign('NEXA  INDUSTRIES', 14, 1.7, { bg: '#0d0f12', fg: '#eceef2', edge: '#cf3030' }); big.position.set(0, 14.4, FZ + 0.12); g.add(big);
    R.halos.push([0, 14.4, FZ + 1, 0xff4a3a, 5]);
    for (let x = -24; x <= 24; x += 12) { M.y(0.06, 0.06, 15, x + 3.4, 7.5, FZ + 0.25, 0x3a3c40, 8); }        // водостоки
    // ---- пожарная лестница слева
    M.push(-24, 0, FZ + 0.4, 0);
    [2.2, 5.0, 8.0].forEach((y, i) => { M.b(3.2, 0.1, 1.2, 0, y, 0, 0x2a2c30); for (let k = 0; k < 12; k += 1) M.b(0.04, 0.03, 1.1, -1.5 + k * 0.28, y + 0.07, 0, 0x4a4d54); M.b(3.2, 0.9, 0.04, 0, y + 0.45, 0.58, 0x1a1b1e); M.b(0.05, 0.9, 1.2, -1.6, y + 0.45, 0, 0x1a1b1e); M.b(0.05, 0.9, 1.2, 1.6, y + 0.45, 0, 0x1a1b1e); });
    for (let i = 0; i < 2; i += 1) M.b(0.8, 0.06, 3.6, 1.0, 3.6 + i * 3.1, 1.8, 0x2a2c30, 0.85);
    M.pop();
    // ---- погрузочная платформа справа, откатные ворота, грузовик у рампы
    M.b(14, 1.1, 5.2, 17, 0.55, Y.z0 + 3.1, 0x4a4c52); M.b(14, 0.12, 5.2, 17, 1.14, Y.z0 + 3.1, 0x3a3c42);
    for (let k = 0; k < 9; k += 1) M.b(14, 0.05, 0.1, 17, 0.04, Y.z0 + 5.8 + k * 0.0, 0x2a2b2e);
    solid(R, 17, Y.z0 + 3.1, 14, 5.2, 1.2);
    [12.5, 21.5].forEach((x, i) => {
      for (let k = 0; k < 9; k += 1) M.b(4.6, 0.05, 0.05, x, 1.5 + k * 0.38, Y.z0 + 0.7, 0x2a2b30);
      M.b(5.0, 3.6, 0.18, x, 3.2, Y.z0 + 0.62, 0x1a1b1f); M.b(4.5, 3.4, 0.08, x, 3.2, Y.z0 + 0.74, 0x3a3c44);
      M.glow((q) => { q.b(0.16, 0.16, 0.05, x - 2.6, 5.1, Y.z0 + 0.74, i ? 0x44ff77 : 0xff3a2a); q.b(0.16, 0.16, 0.05, x + 2.6, 5.1, Y.z0 + 0.74, i ? 0x44ff77 : 0xff3a2a); });
    });
    M.push(17, 1.2, -22.6, 0); M.b(2.5, 2.6, 7.8, 0, 1.9, 0, 0xa0a4ac); M.b(2.4, 1.9, 2.0, 0, 1.0, 4.6, 0x23272e); M.b(2.2, 0.8, 0.08, 0, 1.8, 5.65, 0x1a2230); M.b(2.6, 0.18, 7.8, 0, 0.55, 0, 0x1a1c20); [-1, 1].forEach((s) => { M.x(0.5, 0.28, s * 1.2, 0.5, -2.4, 0x0b0b0c, 14); M.x(0.5, 0.28, s * 1.2, 0.5, 3.8, 0x0b0b0c, 14); M.x(0.28, 0.3, s * 1.2, 0.5, 3.8, 0x8a8d94, 10); });
    M.glow((q) => { q.b(0.3, 0.16, 0.03, -0.8, 1.2, 5.75, 0xffe6b0); q.b(0.3, 0.16, 0.03, 0.8, 1.2, 5.75, 0xffe6b0); }); M.pop();
    solid(R, 17, -22.4, 2.7, 8.4, 3.6);
    // ---- вход в подвал: гаражные ворота (закрыты) и персональная дверь с лампой
    M.b(5.2, 4.2, 0.4, -15, 2.1, Y.z0 + 0.22, 0x2a2b30);
    for (let k = 0; k < 11; k += 1) M.b(4.6, 0.12, 0.08, -15, 0.4 + k * 0.32, Y.z0 + 0.5, k % 2 ? 0x4a4d54 : 0x3e4046);
    for (let k = 0; k < 7; k += 1) M.b(4.6, 0.3, 0.02, -15, 0.35 + k * 0.5, Y.z0 + 0.55, 0x8c7418);
    M.b(5.2, 0.36, 0.5, -15, 3.9, Y.z0 + 0.35, 0x1c1d20);
    M.glow((q) => { q.y(0.12, 0.12, 0.16, -17.9, 3.5, Y.z0 + 0.7, 0xff9a2a, 8); q.y(0.12, 0.12, 0.16, -12.1, 3.5, Y.z0 + 0.7, 0xff9a2a, 8); });
    R.halos.push([-17.9, 3.5, Y.z0 + 1.2, 0xff8a2a, 2.4], [-12.1, 3.5, Y.z0 + 1.2, 0xff8a2a, 2.4]);
    const gsn = F.sign('B0  —  VEHICLES ONLY\nPERSONNEL: DOOR B', 3.4, 0.6, { bg: '#d6c042', fg: '#101010', edge: '#101010' }); gsn.position.set(-15, 4.6, Y.z0 + 0.62); g.add(gsn);
    solid(R, -15, Y.z0 + 0.4, 5.2, 0.6, 4.2);
    const PX = -8.5;
    R.door = r.door(PX, Y.z0, 1.6, 2.5); R.door.userData.h = 2.5; r.closeDoor(R.door);
    [-1, 1].forEach((sd) => M.b(0.22, 2.8, 0.5, PX + sd * 0.91, 1.4, Y.z0 + 0.15, 0x2a2c30)); M.b(2.04, 0.34, 0.5, PX, 2.65, Y.z0 + 0.15, 0x2a2c30);
    R.door.material = r.mat(0x3a3d44);
    { const st = new T.Mesh(r.g.box, r.basic(0xd2ae26)); st.scale.set(1.0, 0.1, 1.5); st.position.y = 0.3; R.door.add(st); const hd = new T.Mesh(r.g.box, r.mat(0xa0a3aa)); hd.scale.set(0.08, 0.05, 1.8); hd.position.set(0.38, -0.05, 0); R.door.add(hd); }
    M.b(2.4, 0.2, 0.9, PX, 2.9, Y.z0 + 0.55, 0x1c1d20);
    M.b(1.6, 2.55, 0.02, PX, 1.27, Y.z0 - 0.13, 0x030304);
    for (let k = 0; k < 5; k += 1) M.b(1.5, 0.05, 0.22, PX, 0.02 - k * 0.0, Y.z0 + 0.0 - 0.0 + k * 0.0, 0x07080a);
    M.glow((q) => q.b(1.4, 0.05, 0.02, PX, 0.12, Y.z0 - 0.12, 0x2a0a08));
    M.glow((q) => { q.b(0.28, 0.1, 0.03, PX, 2.75, Y.z0 + 1.02, 0xff3a2a); q.b(0.3, 0.14, 0.03, PX + 1.35, 1.35, Y.z0 + 0.66, 0xff3a2a); });
    M.b(0.34, 0.5, 0.1, PX + 1.35, 1.3, Y.z0 + 0.58, 0x15161a);
        R.doorLamp = [PX + 1.35, 1.35, Y.z0 + 0.66];
    R.halos.push([PX, 2.75, Y.z0 + 1.2, 0xff5a3a, 2.2]);
    R.lampPos.push([PX, 3.2, Y.z0 + 2.2]);
    const dsn = F.sign('B0\nSTAFF ONLY', 1.2, 0.5, { bg: '#d6d6d0', fg: '#101010', edge: '#101010' }); dsn.position.set(PX - 1.35, 2.0, Y.z0 + 0.62); g.add(dsn);
    }
    // ---- прожектор на карнизе: холодный конус вниз
    [[-4, 4.4], [8, 4.4]].forEach((p) => { M.b(0.6, 0.35, 0.4, p[0], 5.2, FZ + 0.6, 0x1c1d20); M.glow((q) => q.b(0.5, 0.04, 0.3, p[0], 5.0, FZ + 0.65, 0xdfeaff)); R.lampPos.push([p[0], 5.0, FZ + 1.5]); R.halos.push([p[0], 5.0, FZ + 0.9, 0xcfe2ff, 3.6]); });
    // ---- фонари двора
    lampPost(M, R, -6, 5, 5.6); lampPost(M, R, 11, -6, 5.6); lampPost(M, R, -23, 4, 5.6, 0xfff0c8); lampPost(M, R, 24, 12, 5.6); lampPost(M, R, -20, -18, 5.6, 0xe0f0ff);
    // ---- укрытия на пути стелса
    // два контейнера = коридор патруля x ≈ [−17.5, −13.5] (охранник 1)
    M.push(-19.4, 0, -10, 0); container(M, 0x7a2a22, 11.6); M.pop(); solid(R, -19.4, -10, 2.5, 11.7, 2.6);
    M.push(-11.5, 0, -11, 0); container(M, 0x2a4a6a, 11.6); M.pop(); solid(R, -11.5, -11, 2.5, 11.7, 2.6);
    M.push(-4.5, 0, -21.5, PI / 2); container(M, 0x2f5a3c, 6.05); M.pop(); solid(R, -4.5, -21.5, 6.1, 2.5, 2.6);
    M.push(-26.2, 0, -6, 0.04); container(M, 0x6a5a2a, 6.05); M.pop(); solid(R, -26.2, -6, 2.6, 6.2, 2.6);
    // рабочие прожекторы на кронштейнах контейнеров: свет в проходе патруля
    [-4.5, -10.5, -16.0].forEach((z) => { M.b(0.1, 0.9, 0.1, -17.96, 3.05, z, 0x1c1d20); M.b(0.5, 0.2, 0.3, -17.55, 3.5, z, 0x1c1d20); M.glow((q) => q.b(0.4, 0.04, 0.22, -17.55, 3.38, z, 0xfff0d0)); R.halos.push([-17.5, 3.3, z, 0xfff0d0, 3.4]); R.lampPos.push([-16.2, 3.2, z]); });
    // мусорные баки у входа в подвал (крытая точка подкрадывания к охраннику 2)
    [[-12.6, -27.2, 0.1], [-4.4, -27.3, -0.15], [-21.5, -25.5, 0.2]].forEach((p, i) => { M.push(p[0], 0, p[1], p[2]); dumpster(M, i === 1 ? 0x2f5a3c : 0x34383e); M.pop(); solid(R, p[0], p[1], 2.0, 1.2, 1.4); });
    for (let i = 0; i < 4; i += 1) { const x = -22 + (i % 2) * 0.7, z = -22 + Math.floor(i / 2) * 0.7; M.push(x, 0, z, 0); barrel(M, [0x6a2a22, 0x2a4a6a, 0x4a5a2a, 0x6a6a30][i]); M.pop(); }
    solid(R, -21.65, -21.65, 1.7, 1.7, 0.9);
    F.palletStack(M, rand, -1, -4, 0.3, 2); solid(R, -1, -4, 1.25, 1.05, 1.1);
    F.palletStack(M, rand, 5, -14, -0.4, 3); solid(R, 5, -14, 1.25, 1.05, 1.5);
    F.palletStack(M, rand, 8.5, 7, 0.2, 2); solid(R, 8.5, 7, 1.25, 1.05, 1.1);
    F.palletStack(M, rand, -16, 8, 0.1, 2); solid(R, -16, 8, 1.25, 1.05, 1.1);
    // наша машина у ворот (приехали): чёрный седан
    { const car = F.trafficCar('sedan', 0x15161a); car.position.set(4.0, 0, 9.8); car.rotation.y = 0.06; g.add(car); solid(R, 4.0, 9.8, 2.1, 4.5, 1.5); }
    F.palletStack(M, rand, 24.5, -9, 0.5, 3); solid(R, 24.5, -9, 1.25, 1.05, 1.5);
    crateBox(M, -2, -22, 1.0, 0x5c6168, 0.2); crateBox(M, 0.6, -22.4, 0.8, 0x6c5e42, -0.3); solid(R, -0.7, -22.2, 2.8, 1.2, 1.0);
    crateBox(M, 12, 2, 1.1, 0x4a5662, 0.1); solid(R, 12, 2, 1.1, 1.1, 1.1);
    // припаркованные машины (справа): седан и фургон; наша — у ворот
    const parked = [['sedan', 0x2a2a30, 14.2, 4.5, 0.02], ['van', 0xb8b8bc, 19.2, 4.5, -0.03], ['hatch', 0x6a2020, 24.3, 4.2, 0.06]];
    parked.forEach((p) => { const c = F.trafficCar(p[0], p[1]); c.position.set(p[2], 0, p[3]); c.rotation.y = p[4]; g.add(c); solid(R, p[2], p[3], 2.1, F.trafficLen[p[0]], 1.5); });
    // трансформатор и щиты
    M.push(22, 0, -4, 0); M.b(2.2, 2.0, 1.4, 0, 1.0, 0, 0x5a5c62); M.b(2.3, 0.1, 1.5, 0, 2.02, 0, 0x2a2b2e); M.b(0.9, 1.4, 0.04, 0, 1.0, 0.72, 0x3a3d44); for (let i = 0; i < 3; i += 1) M.y(0.08, 0.1, 0.4, -0.7 + i * 0.7, 2.25, 0, 0xcfcfd2, 8); M.b(0.4, 0.5, 0.02, 0.0, 1.0, 0.76, 0xe6c84a); M.pop(); solid(R, 22, -4, 2.3, 1.5, 2.0);
    // ночное небо: луна над стеной
    const moon = new T.Sprite(new T.SpriteMaterial({ map: F.glowTex(), color: 0xaebfe0, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.8, fog: false }));
    moon.position.set(26, 38, -40); moon.scale.set(22, 22, 1); g.add(moon);
    // ореолы фонарей (аддитивные спрайты)
    R.halos.forEach((h) => { const s = new T.Sprite(new T.SpriteMaterial({ map: F.glowTex(), color: h[3], transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.55, fog: false })); s.position.set(h[0], h[1], h[2]); s.scale.set(h[4], h[4], 1); g.add(s); });
    // роаминг-освещение: холодный лунный свет
    R.guardPaths = { A: [[-15.5, -3.2], [-15.5, -17.5]], B: [[-11.0, -28.2], [-6.0, -28.2]] };
    R.onEnter = (Rg, w) => { w.r.scene.background = new T.Color(0x070a12); };
    R.bounds = { cx: 0, cz: -7, w: 60, d: 46, h: 16 };
    if (opt.plaza && F.buildTower) F.buildTower(R, g);
  }

  // ------------------------------------------------------------------ ПОДВАЛ B0 (гараж, арсенал, лифт)
  // x ∈ [−24, 24], z ∈ [−24, 12], h 4.4; лифт в центре северной стены (x=0), арсенал в северо-западном углу, лестница во двор — юго-запад.
  const B = { x0: -24, x1: 24, z0: -24, z1: 12, h: 4.4 };
  function buildBase(R, g) {
    const r = R.world.r, M = R.D, rand = R.rand, T = THREE;
    R.lampPos = []; R.halos = [];
    F.shell(r, B.x0, B.x1, B.z0, B.z1, B.h, 0x6a6c70, { n: [[-1.9, 1.9]] }, { floor: 0x4a4a4e, ceil: 0x2a2a2e });
    // лестница во двор (юго-запад): дверь, лестничная клетка
    R.stairDoor = [-8.5, B.z1];
    M.b(2.4, 3.0, 0.5, -8.5, 1.5, B.z1 - 0.1, 0x2a2c30); M.b(1.7, 2.55, 0.1, -8.5, 1.27, B.z1 - 0.3, 0x3a3d44);
    M.glow((q) => { q.b(0.9, 0.18, 0.02, -8.5, 3.2, B.z1 - 0.4, 0x44ff77); });
    const ss = F.sign('STAIRS ↑ YARD', 1.6, 0.4, { bg: '#0f5a2a', fg: '#e8f6ec', edge: '#e8f6ec' }); ss.position.set(-8.5, 3.2, B.z1 - 0.43); ss.rotation.y = PI; g.add(ss);
    // колонны (сетка), разметка, номера мест
    const cols = [];
    for (let x = -18; x <= 18; x += 9) for (let z = -12; z <= 6; z += 9) cols.push([x, z]);
    cols.forEach((c) => {
      M.b(0.9, B.h, 0.9, c[0], B.h / 2, c[1], 0x6b6c70); M.b(0.96, 0.3, 0.96, c[0], 0.15, c[1], 0x2a2b2f); M.b(0.96, 0.8, 0.96, c[0], 0.9, c[1], 0x3a3c40);
      for (let k = 0; k < 4; k += 1) M.b(0.98, 0.14, 0.98, c[0], 0.5 + k * 0.4, c[1], k % 2 ? 0xc9a82a : 0x232427);
      M.b(1.0, 0.4, 1.0, c[0], B.h - 0.2, c[1], 0x55575c);
      solid(R, c[0], c[1], 0.9, 0.9, B.h);
    });
    const mk = (x, z, w, d, c) => M.b(w, 0.012, d, x, 0.007, z, c);
    for (let i = 0; i < 10; i += 1) { mk(-21 + i * 2.7, 4, 0.12, 6.0, 0xd8d8d0); }
    mk(0, 9.8, 46, 0.12, 0xd8d8d0); mk(0, -9, 46, 0.2, 0xcf3030);
    for (let i = 0; i < 10; i += 1) { const sg = F.sign(String(31 + i), 0.5, 0.34, { bg: '#101214', fg: '#e8e8e8' }); sg.position.set(-19.7 + i * 2.7, 0.02, 7.2); sg.rotation.x = -PI / 2; g.add(sg); }
    // стрелки на полу и пятна масла
    for (let i = 0; i < 6; i += 1) { mk(-18 + i * 7, -3, 1.4, 0.18, 0xe6e6e0); mk(-18 + i * 7 + 0.5, -3.3, 0.5, 0.14, 0xe6e6e0); }
    [[-14, 0.5], [6, 2], [16, -6], [-3, -13]].forEach((p) => M.y(0.8, 0.8, 0.012, p[0], 0.011, p[1], 0x0d0d10, 12));
    // потолок: балки, трубы, воздуховоды, люминесцентные светильники
    for (let z = -20; z <= 10; z += 6) { M.b(48, 0.4, 0.4, 0, B.h - 0.25, z, 0x3a3c40); }
    M.y(0.25, 0.25, 48, 0, B.h - 0.7, -17, 0x50535a, 12, 0, PI / 2); M.y(0.14, 0.14, 48, 0, B.h - 0.55, -15.6, 0x6a3b30, 10, 0, PI / 2); M.y(0.1, 0.1, 48, 0, B.h - 0.5, -14.6, 0x2f4a6a, 8, 0, PI / 2);
    M.b(48, 0.5, 1.0, 0, B.h - 0.55, 8.2, 0x4a4d54);
    for (let x = -21; x <= 21; x += 6) for (let z = -18; z <= 8; z += 8) {
      M.b(1.3, 0.08, 0.3, x, B.h - 0.2, z, 0x2a2b2e); M.glow((q) => q.b(1.2, 0.02, 0.22, x, B.h - 0.25, z, 0xe8f2ff)); if ((x + z) % 12 === 0) R.lampPos.push([x, B.h - 0.7, z]);
    }
    // машины: служебные фургоны и чёрные седаны у южной стены, один раскрытый в ремонте
    [['van', 0x2a2a30, -14.9], ['sedan', 0x1c1c20, -12.1], ['sedan', 0x2f2f35, -5.9], ['van', 0x6a6a70, -3.1], ['sedan', 0x1c1c20, 3.1], ['van', 0x2a2a30, 5.9], ['sedan', 0x34363c, 12.1], ['sedan', 0x1c1c20, 14.9], ['sedan', 0x2f2f35, 22.4]].forEach((p) => {
      const L = F.trafficLen[p[0]], zc = B.z1 - 0.7 - L / 2, c = F.trafficCar(p[0], p[1]); c.position.set(p[2], 0, zc); c.rotation.y = PI; g.add(c); solid(R, p[2], zc, 2.1, L, 1.6);
    });
    const c2 = F.trafficCar('sedan', 0x34363c); c2.position.set(-3, 0, -6); c2.rotation.y = PI / 2; g.add(c2); solid(R, -3, -6, F.trafficLen.sedan, 2.0, 1.5);
    // ящики и стойки с шинами
    F.palletStack(M, rand, 20, -14, 0.1, 3); solid(R, 20, -14, 1.25, 1.05, 1.5); F.palletStack(M, rand, 18.3, -14.3, -0.2, 2); solid(R, 18.3, -14.3, 1.25, 1.05, 1.1); F.palletStack(M, rand, 20.5, -18, 0.3, 2); solid(R, 20.5, -18, 1.25, 1.05, 1.1);
    for (let i = 0; i < 5; i += 1) M.x(0.35, 0.22, 11 + i * 0.5, 0.18 + (i % 2) * 0.36, -21, 0x0e0e10, 14);
    M.b(2.8, 1.8, 0.4, 14, 0.9, -23.5, 0x3a3c42); M.b(2.8, 0.06, 0.5, 14, 1.8, -23.5, 0x2a2b2e); for (let k = 0; k < 3; k += 1) M.b(2.6, 0.04, 0.3, 14, 0.4 + k * 0.5, -23.3, 0x6a6c72);
    // шкафы-щитки, огнетушители, пожарные шкафы по стенам
    const wallDet = (x, z, ry) => { M.push(x, 0, z, ry); M.b(0.6, 0.8, 0.14, 0, 1.4, 0.08, 0x2a2c30); M.b(0.56, 0.74, 0.02, 0, 1.4, 0.16, 0x3a3d44); M.b(0.4, 0.04, 0.03, 0, 1.62, 0.17, 0xcc3333); M.y(0.08, 0.08, 0.38, 0.65, 0.9, 0.12, 0xb02222, 8); M.b(0.5, 0.5, 0.08, -0.8, 1.3, 0.08, 0xaa2020); M.b(0.4, 0.4, 0.02, -0.8, 1.3, 0.13, 0x7a1a1a); M.pop(); };
    for (let x = -20; x <= 20; x += 8) { wallDet(x, B.z1 - 0.15, PI); }
    wallDet(-5, B.z0 + 0.15, 0); wallDet(7, B.z0 + 0.15, 0);
    // ---- лифт у северной стены
    R.lift = F.lift(R, 0, B.z0, { floor: 'B0', cab: 3.0 });
    const ls = F.sign('FREIGHT  ELEVATOR  3\nB0 — 1 — 2', 3.4, 0.55, { bg: '#111316', fg: '#e8e8e8', edge: '#cf3030' }); ls.position.set(0, 3.5, B.z0 + 0.3); g.add(ls);
    M.b(3.6, 0.14, 1.2, 0, 0.07, B.z0 + 0.9, 0xc9a82a); for (let k = 0; k < 8; k += 1) M.b(0.2, 0.15, 1.2, -1.6 + k * 0.45, 0.075, B.z0 + 0.9, 0x1c1c1e, 0, 0.5);
    // ---- арсенал (северо-запад): комната со стеклянным фронтом, 3 стенда, шкафы, стойки
    const AR = { x0: -23.2, x1: -12.4, z0: -23.2, z1: -13.4 };
    r.wallV(AR.x1, AR.z0, AR.z1, B.h, 0x5a5c62, [[-19.6, -17.0]]); r.wallH(AR.z1, AR.x0, AR.x1, B.h, 0x5a5c62);
    M.b(AR.x1 - AR.x0, 0.012, AR.z1 - AR.z0, (AR.x0 + AR.x1) / 2, 0.008, (AR.z0 + AR.z1) / 2, 0x26282c);
    [-1, 1].forEach((sd) => M.b(0.34, 2.7, 0.34, AR.x1, 1.35, -18.3 + sd * 1.45, 0xc9a82a));
    const asn = F.sign('HEAVY  ASSAULT  UNIT\nARMOURY — AUTHORISED ONLY', 4.2, 0.7, { bg: '#17181b', fg: '#e8e8e8', edge: '#cf3030' }); asn.position.set(AR.x1 + 0.2, 3.5, -18.3); asn.rotation.y = PI / 2; g.add(asn);
    R.stands = [[-20.4, -20.6], [-18.0, -20.6], [-15.6, -20.6]];
    R.stands.forEach((s) => { M.y(0.7, 0.75, 0.1, s[0], 0.05, s[1], 0x2a2b2f, 16); M.glow((q) => q.y(0.55, 0.55, 0.014, s[0], 0.11, s[1], 0x2a4a6a, 16)); M.b(0.06, 2.3, 0.06, s[0], 1.2, s[1] - 0.45, 0x1a1b1e); M.b(0.6, 0.06, 0.06, s[0], 2.35, s[1] - 0.45, 0x1a1b1e); R.lampPos.push([s[0], 3.2, s[1] + 0.6]); });
    for (let i = 0; i < 7; i += 1) { M.b(0.8, 2.2, 0.55, -22.9 + i * 0.0, 1.1, AR.z0 + 0.5, 0x2c3036); }
    M.b(0.001, 0.001, 0.001, 0, 0, 0, 0);
    for (let i = 0; i < 6; i += 1) { M.b(0.8, 2.2, 0.5, -22.8 + i * 0.82, 1.1, -23.0, 0x31353c); M.b(0.74, 0.5, 0.02, -22.8 + i * 0.82, 1.8, -22.72, 0x1c1e22); M.b(0.74, 0.5, 0.02, -22.8 + i * 0.82, 0.9, -22.72, 0x1c1e22); M.b(0.08, 0.2, 0.03, -22.5 + i * 0.82, 1.2, -22.7, 0xa0a3aa); }
    solid(R, -20.4, -22.9, 5.2, 0.7, 2.2);
    M.b(0.5, 1.5, 3.6, -23.0, 1.2, -17.9, 0x2a2c30);                                          // стойка с оружием на западной стене
    for (let i = 0; i < 5; i += 1) { M.b(0.1, 0.12, 0.9, -22.7, 1.2 + (i % 2) * 0.35, -19.4 + i * 0.7, 0x1c1c1e); M.b(0.14, 0.04, 0.1, -22.7, 1.2 + (i % 2) * 0.35, -19.1 + i * 0.7, 0x4a4d54); }
    solid(R, -23.0, -17.9, 0.5, 3.6, 1.8);
    M.b(2.6, 0.5, 0.6, -17.4, 0.25, -15.2, 0x3a3328); M.b(2.6, 0.06, 0.6, -17.4, 0.52, -15.2, 0x2a2018); solid(R, -17.4, -15.2, 2.6, 0.6, 0.5);     // скамья
    M.glow((q) => { q.y(0.12, 0.12, 0.1, -22.8, 3.8, -14.0, 0xff3a2a, 8); q.y(0.12, 0.12, 0.1, -12.8, 3.8, -22.8, 0xff3a2a, 8); });
    R.halos.push([-22.8, 3.8, -14.0, 0xff3a2a, 2.8], [-12.8, 3.8, -22.8, 0xff3a2a, 2.8], [-18, 3.9, -18, 0xaac4ff, 3.4]);
    R.lampPos.push([-18, 3.8, -18]);
    // ---- пост охраны (северо-восток): пустой, с мониторами
    r.wallV(13.2, -23.2, -14, B.h, 0x5a5c62, [[-20, -17]]);
    M.b(2.4, 0.9, 0.7, 18, 0.45, -22.8, 0x3a3d44); M.b(2.5, 0.06, 0.8, 18, 0.92, -22.8, 0x15161a);
    M.glow((q) => { for (let i = 0; i < 4; i += 1) q.b(0.5, 0.34, 0.02, 16.9 + i * 0.7, 1.45, -23.0, hex(0x6aa0d0, 0.5 + (i % 2) * 0.4)); });
    for (let i = 0; i < 4; i += 1) M.b(0.56, 0.4, 0.06, 16.9 + i * 0.7, 1.45, -23.05, 0x15161a);
    solid(R, 18, -22.8, 2.5, 0.8, 1.0);
    // знаки
    const s1 = F.sign('B0  —  SERVICE  LEVEL\nGARAGE / ARMOURY / FREIGHT', 5, 0.8, { bg: '#17181b', fg: '#e8e8e8', edge: '#e6c84a' }); s1.position.set(4.5, 3.6, B.z0 + 0.3); g.add(s1);
    R.bounds = { cx: 0, cz: -6, w: 48, d: 43, h: B.h };
    R.onEnter = (Rg, w) => { w.r.scene.background = new T.Color(0x0a0c10); };
  }

  // ------------------------------------------------------------------ регистрация
  F.regions2 = function (w) {
    const A = w.def('yard', { build: buildYard, surf: ['asphalt', 'brick', 'concrete_dark'], amb: 0.62, fogK: 0.55, fogC: 0x080d16, lampCol: 0xffd9a0, lampI: 1.1, lampD: 17, seed: 21 });
    const Bb = w.def('base', { build: buildBase, surf: ['concrete_dark', 'concrete', 'steel'], amb: 0.7, fogK: 0.25, fogC: 0x0a0c10, lampCol: 0xeef2ff, lampI: 1.0, lampD: 15, seed: 31 });
    const Pz = w.def('plaza', { build: (R, g) => buildYard(R, g, { plaza: true }), surf: ['asphalt', 'brick', 'concrete_dark'], amb: 0.62, fogK: 0.4, fogC: 0x080d16, lampCol: 0xffd9a0, lampI: 1.1, lampD: 17, seed: 21 });
    [A, Bb, Pz].forEach((R) => { R.world = w; });
  };
  F.YARD = Y; F.BASE = B;
  F.w2 = { container, dumpster, barrel, lampPost, crateBox, solid, hex };
}());
