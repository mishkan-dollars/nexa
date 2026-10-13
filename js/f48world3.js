// NEXA: миссия 48 — регионы 3: холл 1 этажа NEXA Industries (10 окон с очередями, колонны, монумент, досмотр, главная лестница на этаж хранилища, четыре боковые комнаты).
// Дальше сюда же дописываются хранилище (этаж 2), длинный коридор подвала и комната HEAD.
// Все координаты локальные: x ∈ [−36, 36], z ∈ [−46, 24]; лифт в центре северной стены, лестница к хранилищу — у южной.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.World || !C.f48.shell || !C.f48.Mk || !C.f48.sign || !C.f48.lift) return;
  const F = C.f48, PI = Math.PI, TAU = PI * 2;
  const hex = (c, k) => ((((c >> 16) & 255) * k | 0) << 16) | ((((c >> 8) & 255) * k | 0) << 8) | ((c & 255) * k | 0);
  const solid = (R, x, z, w, d, h, y0) => R.world.col(R, x, z, w, d, h, y0);

  const H = { x0: -36, x1: 36, z0: -46, z1: 24, h: 11 };
  const CZ = [-28, -19, -10, -1, 8];                         // оси окон по Z (по пять с каждой стороны)
  const PIL = [-31, -22, -13, -4, 5];                        // колонны вдоль прохода (x = ±13)
  const STONE = 0xa9a396, STONE_D = 0x716b60, WOOD = 0x3a2b22, BRASS = 0xb08a3a, RED = 0xb8282c, STEEL = 0x8a8f98, DARK = 0x1a1b1e;

  // ------------------------------------------------------------------ реквизит
  function pillar(M, R, x, z) {
    M.b(1.5, 0.5, 1.5, x, 0.25, z, STONE_D); M.b(1.25, 0.25, 1.25, x, 0.62, z, STONE);
    M.b(1.0, H.h, 1.0, x, H.h / 2, z, STONE);
    [-1, 1].forEach((s) => { M.b(0.05, H.h - 1.4, 0.2, x + s * 0.5, H.h / 2, z, hex(STONE, 0.86)); M.b(0.2, H.h - 1.4, 0.05, x, H.h / 2, z + s * 0.5, hex(STONE, 0.86)); });
    [1.3, 4.6, 9.4].forEach((y) => M.b(1.08, 0.12, 1.08, x, y, z, BRASS));
    M.b(1.35, 0.5, 1.35, x, H.h - 0.9, z, STONE); M.b(1.6, 0.3, 1.6, x, H.h - 0.55, z, STONE_D);
    solid(R, x, z, 1.0, 1.0, H.h);
  }
  function planter(M, R, x, z, s) {
    s = s || 1.3;
    M.b(s, 0.8, s, x, 0.4, z, 0x4a4a4e); M.b(s + 0.1, 0.08, s + 0.1, x, 0.82, z, STEEL); M.b(s - 0.1, 0.06, s - 0.1, x, 0.84, z, 0x1c130d);
    const leaf = [0x1f4d28, 0x24592f, 0x2c6b38, 0x1a4222];
    for (let i = 0; i < 12; i += 1) { const a = i * 2.4, rr = 0.1 + (i % 4) * 0.1, hh = 1.35 + (i % 5) * 0.16 + (i > 8 ? 0.2 : 0); M.s(0.2 + (i % 3) * 0.04, x + Math.cos(a) * rr, hh, z + Math.sin(a) * rr, leaf[i % 4], 1, 0.8, 1, 6); }
    M.y(0.03, 0.05, 0.9, x, 1.25, z, 0x3a2a1a, 6);
    solid(R, x, z, s, s, 2.0);
  }
  function bench(M, R, x, z, ry) {
    M.push(x, 0, z, ry || 0);
    M.b(2.8, 0.1, 0.7, 0, 0.5, 0, WOOD); M.b(2.8, 0.55, 0.08, 0, 0.82, -0.3, WOOD, -0.12);
    [-1.2, 1.2].forEach((dx) => M.b(0.1, 0.5, 0.64, dx, 0.25, 0, STEEL));
    M.pop();
    const c = Math.abs(Math.cos(ry || 0)) > 0.7;
    solid(R, x, z, c ? 2.8 : 0.8, c ? 0.8 : 2.8, 0.55);
  }
  function stanchion(M, x, z) { M.y(0.17, 0.19, 0.03, x, 0.015, z, BRASS, 10); M.y(0.025, 0.03, 0.95, x, 0.5, z, BRASS, 8); M.s(0.045, x, 0.99, z, BRASS, 1, 1, 1, 6); }
  function lane(M, s, z) {                         // очередь у окна: стойки с лентой и жёлтые линии на полу
    const xs = []; for (let i = 0; i < 6; i += 1) xs.push(s * (31.2 - i * 2.4));
    [-1.1, 1.1].forEach((dz) => {
      xs.forEach((x, i) => { stanchion(M, x, z + dz); if (i) M.b(Math.abs(xs[i] - xs[i - 1]), 0.03, 0.025, (xs[i] + xs[i - 1]) / 2, 0.84, z + dz, RED); });
      M.b(Math.abs(xs[5] - xs[0]), 0.012, 0.07, (xs[0] + xs[5]) / 2, 0.008, z + dz, 0xe8c030);
    });
    M.b(0.07, 0.012, 2.2, xs[0] + s * 0.7, 0.008, z, 0xe8c030);
  }
  function counter(M, R, g, s, z, idx) {           // окно: стойка, стекло, кабина кассира. s=−1 запад, +1 восток; лицом к центру
    const cx = s * 32.8, f = -s;                   // f — направление «к залу»
    M.b(1.2, 1.05, 5.4, cx, 0.525, z, WOOD); M.b(1.5, 0.07, 5.7, cx + f * 0.1, 1.07, z, 0xd8d4cc);
    M.b(0.04, 0.5, 5.0, cx + f * 0.62, 0.55, z, hex(WOOD, 1.3)); M.b(0.03, 0.06, 5.0, cx + f * 0.64, 0.95, z, BRASS); M.b(0.03, 0.06, 5.0, cx + f * 0.64, 0.2, z, BRASS);
    M.b(0.03, 0.32, 0.9, cx + f * 0.64, 0.58, z, RED);
    // стекло с тремя окошками для документов
    M.glass((q) => q.b(0.04, 1.25, 5.3, cx - f * 0.05, 1.72, z, 0xb4d8ee));
    for (let i = 0; i < 4; i += 1) M.b(0.07, 1.3, 0.07, cx - f * 0.05, 1.72, z - 2.6 + i * 1.73, STEEL);
    M.b(0.08, 0.06, 5.35, cx - f * 0.05, 2.38, z, STEEL); M.b(0.08, 0.06, 5.35, cx - f * 0.05, 1.1, z, STEEL);
    [-1.73, 0, 1.73].forEach((dz) => M.b(0.5, 0.05, 0.9, cx + f * 0.1, 1.12, z + dz, 0x15161a));    // лоток
    // кабина кассира: боковые стенки, компьютеры, полки, кресла
    [-1, 1].forEach((d) => { M.b(2.4, 2.6, 0.12, s * 34.6, 1.3, z + d * 2.75, 0x6d6a62); solid(R, s * 34.6, z + d * 2.75, 2.4, 0.12, 2.6); });
    solid(R, cx, z, 1.2, 5.4, 1.1);
    [-1.73, 0, 1.73].forEach((dz) => {
      M.b(0.5, 0.36, 0.05, s * 33.45, 1.42, z + dz, 0x101114, 0, f * PI / 2); M.glow((q) => q.b(0.44, 0.28, 0.02, s * 33.45 + f * 0.04, 1.42, z + dz, 0x4a86c8, 0, f * PI / 2));
      M.b(0.35, 0.02, 0.14, s * 33.7, 1.1, z + dz, 0x2a2b2e); M.y(0.2, 0.2, 0.06, s * 34.7, 0.55, z + dz, DARK, 10); M.b(0.4, 0.5, 0.06, s * 34.9, 0.9, z + dz, DARK);
    });
    M.b(0.4, 2.2, 5.2, s * 35.8, 1.1, z, 0x4a4338);
    for (let k = 0; k < 4; k += 1) { M.b(0.3, 0.04, 5.0, s * 35.55, 0.8 + k * 0.5, z, 0x2a2420); for (let j = 0; j < 8; j += 1) M.b(0.22, 0.32, 0.5, s * 35.5, 0.98 + k * 0.5, z - 2.2 + j * 0.62, [0x6a5a40, 0x7a6a4c, 0x4a5a6a][(j + k) % 3]); }
    // номер окна над стеклом (на задней стене), светящаяся полоса
    const sg = F.sign('WINDOW  ' + String(idx).padStart(2, '0'), 2.4, 0.5, { bg: '#13161a', fg: '#ffd27a', edge: '#b08a3a' });
    sg.position.set(s * 35.93, 3.5, z); sg.rotation.y = f > 0 ? PI / 2 : -PI / 2; g.add(sg);
    M.glow((q) => q.b(0.05, 0.05, 5.2, s * 35.9, 2.9, z, 0xffe0a0));
    lane(M, s, z);
    // табло «следующий» на подставке в начале очереди
    const x2 = s * 18.6;
    M.b(0.12, 2.4, 0.12, x2, 1.2, z + 1.55, DARK); M.b(0.3, 0.1, 0.3, x2, 0.05, z + 1.55, DARK);
    const bd = F.sign('NOW SERVING\n' + String(40 + idx * 3).padStart(3, '0'), 1.1, 0.7, { bg: '#0a0c0f', fg: '#ff7a2a', edge: '#444' });
    bd.position.set(x2 + f * 0.08, 2.5, z + 1.55); bd.rotation.y = f > 0 ? PI / 2 : -PI / 2; g.add(bd);
    solid(R, x2, z + 1.55, 0.3, 0.3, 2.6);
  }
  function chandelier(M, R, x, y, z, rr) {
    M.y(0.04, 0.04, H.h - y, x, (H.h + y) / 2, z, STEEL, 6);
    M.tor(rr, 0.06, x, y, z, BRASS, PI / 2, 0, 0, 24); M.tor(rr * 0.6, 0.05, x, y + 0.2, z, BRASS, PI / 2, 0, 0, 20);
    for (let i = 0; i < 4; i += 1) { const a = i * PI / 2; M.b(0.04, 0.04, rr, x + Math.sin(a) * rr / 2, y + 0.08, z + Math.cos(a) * rr / 2, BRASS, 0, a); }
    M.glow((q) => { for (let i = 0; i < 16; i += 1) { const a = i / 16 * TAU; q.s(0.11, x + Math.sin(a) * rr, y + 0.12, z + Math.cos(a) * rr, 0xfff0cc, 1, 1.2, 1, 6); } for (let i = 0; i < 8; i += 1) { const a = i / 8 * TAU; q.s(0.09, x + Math.sin(a) * rr * 0.6, y + 0.3, z + Math.cos(a) * rr * 0.6, 0xfff0cc, 1, 1.2, 1, 6); } q.s(0.2, x, y + 0.3, z, 0xfff6e0, 1, 1, 1, 6); });
    R.lampPos.push([x, y - 0.6, z]); R.halos.push([x, y + 0.2, z, 0xffe6b8, rr * 3.2]);
  }
  function gateArch(M, R, x) {                      // арка металлодетектора между двумя стойками
    M.b(4.0, 0.34, 0.6, x, 2.45, 12.5, 0x2a2c30); M.b(3.6, 0.1, 0.62, x, 2.62, 12.5, 0x15161a);
    M.glow((q) => { q.b(0.9, 0.09, 0.02, x, 2.46, 12.18, 0x33ff66); q.b(0.9, 0.09, 0.02, x, 2.46, 12.82, 0x33ff66); });
  }
  function gatePost(M, R, x) { M.b(0.46, 2.5, 0.6, x, 1.25, 12.5, 0x34373d); M.b(0.5, 0.15, 0.64, x, 0.08, 12.5, DARK); M.b(0.36, 0.02, 0.62, x, 2.2, 12.5, 0xcf3030); solid(R, x, 12.5, 0.5, 0.64, 2.6); }
  function xray(M, R, x, z) {
    M.b(3.2, 1.5, 1.3, x, 0.95, z, 0x40444c); M.b(3.0, 0.06, 1.1, x, 1.72, z, 0x15161a);
    M.b(1.0, 1.0, 1.1, x - 1.0, 1.0, z, 0x2a2c30); M.b(1.0, 1.0, 1.1, x + 1.0, 1.0, z, 0x2a2c30);
    M.b(0.9, 0.66, 0.06, x, 1.3, z + 0.67, 0x07080a); M.glow((q) => q.b(0.8, 0.56, 0.02, x, 1.3, z + 0.7, 0x3a8a58));
    M.b(1.2, 0.08, 1.0, x - 2.2, 0.8, z, 0x2a2c30); M.b(1.2, 0.08, 1.0, x + 2.2, 0.8, z, 0x2a2c30);
    solid(R, x, z, 5.6, 1.4, 1.8);
  }
  function kiosk(M, R, x, z, ry) {
    M.push(x, 0, z, ry);
    M.b(1.0, 1.7, 0.6, 0, 0.85, 0, 0x2a2c32); M.b(0.8, 0.56, 0.05, 0, 1.3, 0.31, 0x07080a); M.glow((q) => q.b(0.72, 0.48, 0.02, 0, 1.3, 0.34, 0x3a78c8));
    M.b(0.7, 0.3, 0.1, 0, 0.9, 0.34, 0x1c1d21); M.b(0.5, 0.05, 0.02, 0, 0.8, 0.4, RED);
    M.pop();
    solid(R, x, z, 1.1, 0.8, 1.8);
  }
  function stairs(M, R, g) {
    const z0 = 15.0, n = 14, run = 0.5, rise = 3.2 / n;
    for (let i = 0; i < n; i += 1) {
      const h = (i + 1) * rise, zc = z0 + i * run + run / 2;
      M.b(12.4, h, run, 0, h / 2, zc, i % 2 ? hex(STONE, 0.62) : hex(STONE, 0.7)); M.b(12.4, 0.03, 0.04, 0, h + 0.002, zc - run / 2 + 0.02, hex(STONE, 0.4));
      M.b(3.4, 0.015, run, 0, h + 0.01, zc, 0x6a1a20);                                     // красная дорожка
      M.b(3.5, 0.02, 0.05, 0, h + 0.012, zc - run / 2 + 0.03, BRASS);
    }
    M.b(12.4, 3.4, 2.0, 0, 1.7, 23.0, hex(STONE, 0.66)); M.b(3.4, 0.015, 2.0, 0, 3.21, 23.0, 0x6a1a20);        // площадка
    [-1, 1].forEach((s) => {
      for (let i = 0; i < n; i += 1) { const h = (i + 1) * rise; M.b(0.14, 0.9, run + 0.02, s * 6.5, h + 0.45, z0 + i * run + run / 2, STONE_D); }
      M.b(0.5, 3.7, 8.4, s * 6.7, 1.85, 18.9, STONE_D);
      M.b(0.5, 0.35, 8.6, s * 6.7, 4.1, 18.8, STONE, 0.43 * s * 0, 0, 0);
      M.glass((q) => q.b(0.04, 0.8, 7.2, s * 6.5, 2.7, 18.9, 0xb4d8ee, -0.4 * 0, 0, 0));
    });
    // двери на площадке и вывеска
    [-1, 1].forEach((s) => { M.b(2.2, 3.4, 0.2, s * 1.15, 4.9, 23.9, 0x2a2c30); M.b(1.9, 3.1, 0.06, s * 1.15, 4.9, 23.76, 0x6a5a34); M.b(0.08, 1.2, 0.1, s * 0.2, 4.9, 23.7, BRASS); });
    M.b(5.2, 0.4, 0.4, 0, 6.8, 23.8, STEEL);
    const sg = F.sign('LEVEL 2  —  VAULT & ARCHIVE', 6.2, 0.9, { bg: '#17181b', fg: '#e8e8e8', edge: '#cf3030' }); sg.position.set(0, 7.6, 23.9); sg.rotation.y = PI; g.add(sg);
    // сплошной коллайдер на всю лестницу — игрок останавливается у подножия
    solid(R, 0, 19.0, 13.2, 8.2, 3.4);
    R.stairFoot = [0, 14.3];
  }
  function vestibule(M, R, g, x, zNear, zFar, w) {  // тамбур: служебный коридор (север) или вход с улицы (юг); дальняя стенка закрыта
    const r = R.world.r, len = Math.abs(zFar - zNear), zc = (zFar + zNear) / 2, sg = zFar > zNear ? 1 : -1;
    r.box(x, -0.05, zc, w, 0.1, len, 0x3a3a3e, false); r.box(x, 3.55, zc, w + 0.4, 0.1, len, 0x2a2a2e, false);
    r.box(x - w / 2 - 0.1, 1.75, zc, 0.2, 3.5, len, hex(STONE, 0.7), true); r.box(x + w / 2 + 0.1, 1.75, zc, 0.2, 3.5, len, hex(STONE, 0.7), true);
    r.box(x, 1.75, zFar + sg * 0.1, w + 0.4, 3.5, 0.2, 0x15161a, true);
  }

  // ------------------------------------------------------------------ комнаты по углам
  function wall(R, M, vertical, pos, a, b, h, col, gaps) {
    const r = R.world.r; if (vertical) r.wallV(pos, a, b, h, col, gaps); else r.wallH(pos, a, b, h, col, gaps);
  }
  function roomShell(R, M, g, x0, x1, z0, z1, hr, floorCol) {
    const r = R.world.r; r.box((x0 + x1) / 2, hr + 0.05, (z0 + z1) / 2, x1 - x0, 0.1, z1 - z0, 0x6a655c, false);
    M.b(x1 - x0 - 0.2, 0.012, z1 - z0 - 0.2, (x0 + x1) / 2, 0.012, (z0 + z1) / 2, floorCol);
    M.glow((q) => { q.b(1.4, 0.03, 0.4, (x0 + x1) / 2 - 2.2, hr - 0.06, (z0 + z1) / 2, 0xfff0d6); q.b(1.4, 0.03, 0.4, (x0 + x1) / 2 + 2.2, hr - 0.06, (z0 + z1) / 2, 0xfff0d6); });
    R.lampPos.push([(x0 + x1) / 2, hr - 0.6, (z0 + z1) / 2]);
  }
  function deskPc(M, R, x, z, ry, solidIt) {
    M.push(x, 0, z, ry);
    M.b(1.6, 0.06, 0.8, 0, 0.74, 0, 0x5a4a38); M.b(0.06, 0.72, 0.7, -0.74, 0.36, 0, 0x2a2c30); M.b(0.06, 0.72, 0.7, 0.74, 0.36, 0, 0x2a2c30); M.b(1.5, 0.5, 0.04, 0, 0.5, -0.32, 0x34373d);
    M.b(0.5, 0.34, 0.04, 0, 1.02, -0.2, 0x0a0a0c); M.glow((q) => q.b(0.44, 0.28, 0.02, 0, 1.02, -0.17, 0x4a86c8)); M.b(0.05, 0.2, 0.05, 0, 0.87, -0.2, 0x1c1d21);
    M.b(0.4, 0.015, 0.14, 0, 0.78, 0.15, 0x15161a);
    M.pop();
    if (solidIt !== false) { const c = Math.abs(Math.cos(ry || 0)) > 0.7; solid(R, x, z, c ? 1.7 : 0.9, c ? 0.9 : 1.7, 0.8); }
  }
  function chair(M, x, z, ry) { M.push(x, 0, z, ry || 0); M.b(0.5, 0.06, 0.5, 0, 0.5, 0, 0x1c1d21); M.b(0.5, 0.55, 0.06, 0, 0.82, 0.24, 0x1c1d21); M.y(0.03, 0.03, 0.4, 0, 0.27, 0, STEEL, 6); M.b(0.5, 0.04, 0.5, 0, 0.05, 0, STEEL); M.pop(); }

  function buildRooms(R, M, g) {
    const r = R.world.r, rh = 3.5, wc = 0x77736a;
    // ---- NW: охрана (мониторная стена, пульты)
    wall(R, M, true, -24, -46, -35, rh, wc, [[-41.6, -38.4]]); wall(R, M, false, -35, -36, -24, rh, wc);
    roomShell(R, M, g, -36, -24, -46, -35, rh, 0x1c2026);
    M.b(10.5, 2.4, 0.2, -30, 1.6, -45.8, 0x15161a);
    M.glow((q) => { for (let i = 0; i < 4; i += 1) for (let j = 0; j < 2; j += 1) q.b(2.4, 1.0, 0.03, -33.7 + i * 2.55, 1.2 + j * 1.1, -45.65, [0x3a78c8, 0x3a8a58, 0x6a4a9a, 0x8a7a30][(i + j * 2) % 4]); });
    for (let i = 0; i < 3; i += 1) { deskPc(M, R, -32 + i * 3.2, -41.8, 0); chair(M, -32 + i * 3.2, -40.7, PI); }
    M.b(0.8, 2.0, 0.8, -35.2, 1.0, -37.0, 0x20232a); M.glow((q) => { for (let k = 0; k < 6; k += 1) q.b(0.5, 0.03, 0.02, -35.2, 0.5 + k * 0.28, -36.58, k % 2 ? 0x33ff66 : 0xffaa33); }); solid(R, -35.2, -37.0, 0.8, 0.8, 2.0);
    const s1 = F.sign('SECURITY CONTROL', 2.6, 0.4, { bg: '#17181b', fg: '#e8e8e8', edge: '#cf3030' }); s1.position.set(-23.88, 2.9, -40.0); s1.rotation.y = PI / 2; g.add(s1);
    // ---- NE: администрация (столы, шкафы, диван)
    wall(R, M, true, 24, -46, -35, rh, wc, [[-41.6, -38.4]]); wall(R, M, false, -35, 24, 36, rh, wc);
    roomShell(R, M, g, 24, 36, -46, -35, rh, 0x3a2a24);
    for (let i = 0; i < 2; i += 1) { deskPc(M, R, 28 + i * 4.6, -43.2, 0); chair(M, 28 + i * 4.6, -42.1, PI); }
    for (let i = 0; i < 4; i += 1) { M.b(0.9, 2.1, 0.5, 31.5 + i * 1.0, 1.05, -45.6, 0x4a3a2a); M.b(0.82, 0.04, 0.02, 31.5 + i * 1.0, 1.2, -45.34, BRASS); }
    solid(R, 33, -45.6, 4.0, 0.5, 2.1);
    M.b(2.6, 0.5, 0.9, 34.5, 0.25, -38.5, 0x4a2a2a, 0, PI / 2); M.b(0.4, 0.5, 0.9, 35.5, 0.7, -38.5, 0x4a2a2a); M.b(0.9, 0.5, 2.6, 34.5, 0.25, -38.5, 0x4a2a2a); solid(R, 34.8, -38.5, 1.3, 2.7, 0.8);
    planter(M, R, 25.2, -36.2, 0.9);
    const s2 = F.sign('ADMINISTRATION', 2.4, 0.4, { bg: '#17181b', fg: '#e8e8e8', edge: '#b08a3a' }); s2.position.set(23.88, 2.9, -40.0); s2.rotation.y = -PI / 2; g.add(s2);
    // ---- SW: архив (стеллажи)
    wall(R, M, true, -24, 13, 24, rh, wc, [[17.2, 19.8]]); wall(R, M, false, 13, -36, -24, rh, wc);
    roomShell(R, M, g, -36, -24, 13, 24, rh, 0x24262a);
    for (let i = 0; i < 4; i += 1) {
      const z = 15.2 + i * 2.2;
      M.b(8.0, 2.4, 0.5, -30.4, 1.2, z, 0x4a4d54); for (let k = 0; k < 5; k += 1) M.b(7.8, 0.04, 0.48, -30.4, 0.5 + k * 0.5, z, 0x6a6d74);
      for (let j = 0; j < 12; j += 1) M.b(0.5, 0.36, 0.34, -33.9 + j * 0.62, 0.7 + (j % 4) * 0.5, z, [0x7a6a4c, 0x5a6a7a, 0x8a8478][j % 3]);
      solid(R, -30.4, z, 8.0, 0.5, 2.4);
    }
    const s3 = F.sign('ARCHIVE', 1.8, 0.4, { bg: '#17181b', fg: '#e8e8e8', edge: '#6a6d74' }); s3.position.set(-23.88, 2.9, 18.5); s3.rotation.y = PI / 2; g.add(s3);
    // ---- SE: кафе (стойка, столы, кофемашина)
    wall(R, M, true, 24, 13, 24, rh, wc, [[17.2, 19.8]]); wall(R, M, false, 13, 24, 36, rh, wc);
    roomShell(R, M, g, 24, 36, 13, 24, rh, 0x4a3a2c);
    M.b(0.9, 1.05, 6.0, 35.2, 0.525, 18.6, WOOD); M.b(1.1, 0.06, 6.2, 35.15, 1.08, 18.6, 0xd8d4cc); solid(R, 35.2, 18.6, 1.2, 6.2, 1.1);
    M.b(0.5, 0.5, 0.5, 35.3, 1.35, 17.0, 0x15161a); M.glow((q) => q.b(0.3, 0.12, 0.02, 35.04, 1.46, 17.0, 0xff7a2a, 0, PI / 2)); M.b(0.4, 0.4, 0.4, 35.3, 1.33, 20.2, 0x8a8f98);
    [[28, 16.2], [28, 20.6], [31.6, 16.2], [31.6, 20.6]].forEach((p) => { M.y(0.5, 0.5, 0.05, p[0], 0.76, p[1], 0xd8d4cc, 14); M.y(0.05, 0.08, 0.74, p[0], 0.38, p[1], STEEL, 8); M.y(0.3, 0.3, 0.03, p[0], 0.03, p[1], DARK, 10); [[-0.75, 0], [0.75, 0], [0, -0.75], [0, 0.75]].forEach((o) => chair(M, p[0] + o[0], p[1] + o[1], Math.atan2(-o[0], -o[1]))); solid(R, p[0], p[1], 1.1, 1.1, 0.8); });
    const s4 = F.sign('CAFÉ', 1.6, 0.4, { bg: '#17181b', fg: '#ffd27a', edge: '#b08a3a' }); s4.position.set(23.88, 2.9, 18.5); s4.rotation.y = -PI / 2; g.add(s4);
    R.rooms = { nw: [-30, -40], ne: [30, -40], sw: [-30, 18.5], se: [30, 18.5] };
  }

  // ------------------------------------------------------------------ ХОЛЛ
  function buildHall(R, g) {
    const r = R.world.r, M = R.D, T = THREE;
    R.lampPos = []; R.halos = [];
    F.shell(r, H.x0, H.x1, H.z0, H.z1, H.h, 0x9d978a, { n: [[-1.9, 1.9], [-15.6, -12.4], [12.4, 15.6]], s: [[-24.5, -19.5], [19.5, 24.5]] }, { floor: 0x8f8a80, ceil: 0x3a3a3e });
    // ---- пол: ковровая дорожка от лифта до лестницы, золотая окантовка, эмблема
    M.b(6.4, 0.012, 58, 0, 0.007, -16, 0x4a1519); [-1, 1].forEach((s) => M.b(0.14, 0.014, 58, s * 3.3, 0.009, -16, BRASS));
    M.b(12, 0.012, 7, 0, 0.007, -41.5, 0x1c2026); M.tor(3.6, 0.05, 0, 0.012, -2, BRASS, PI / 2, 0, 0, 40); M.tor(4.4, 0.04, 0, 0.012, -2, BRASS, PI / 2, 0, 0, 40);
    const em = F.sign('N E X A', 5.4, 1.1, { bg: '#4a1519', fg: '#d9b25a', edge: '#b08a3a' }); em.position.set(0, 0.016, -37.5); em.rotation.x = -PI / 2; em.rotation.z = PI; g.add(em);
    for (let i = 0; i < 6; i += 1) { M.b(72, 0.012, 0.08, 0, 0.007, -42 + i * 12, hex(0x8f8a80, 0.72)); }                          // швы плитки
    for (let i = 0; i < 7; i += 1) { M.b(0.08, 0.012, 70, -36 + i * 12, 0.007, -11, hex(0x8f8a80, 0.72)); }
    // ---- стены: панели, пилястры, окна второго света
    [-1, 1].forEach((s) => {
      for (let z = -44; z <= 22; z += 6) { M.b(0.5, H.h, 0.7, s * 35.75, H.h / 2, z, STONE); M.b(0.7, 0.4, 0.9, s * 35.7, 0.2, z, STONE_D); M.b(0.7, 0.5, 0.9, s * 35.7, H.h - 0.25, z, STONE_D); }
      M.b(0.14, 1.5, 68, s * 35.9, 0.75, -11, hex(WOOD, 0.9));
      M.b(0.2, 0.14, 68, s * 35.85, 1.55, -11, BRASS);
      M.glow((q) => { for (let z = -41; z <= 19; z += 6) q.b(0.03, 3.6, 3.6, s * 35.93, 7.9, z, 0x0e1830); });                 // ночное небо в окнах
      M.glass((q) => { for (let z = -41; z <= 19; z += 6) q.b(0.05, 3.6, 3.7, s * 35.88, 7.9, z, 0x9fc3e0); });
      for (let z = -41; z <= 19; z += 6) { M.b(0.1, 3.8, 0.1, s * 35.88, 7.9, z, 0x1c1d21); M.b(0.1, 0.1, 3.8, s * 35.88, 7.9, z, 0x1c1d21); M.b(0.1, 0.12, 3.9, s * 35.86, 9.78, z, 0x1c1d21); M.b(0.1, 0.12, 3.9, s * 35.86, 6.0, z, 0x1c1d21); }
      // верхний ярус (мезонин): балкон с перилами над окнами
      M.b(2.4, 0.3, 66, s * 34.8, 5.1, -11, hex(STONE, 0.85)); M.glass((q) => q.b(0.04, 1.0, 66, s * 33.7, 5.8, -11, 0xb4d8ee)); M.b(0.08, 0.06, 66, s * 33.7, 6.3, -11, BRASS);
      for (let z = -42; z <= 20; z += 6) M.b(0.1, 0.9, 0.1, s * 33.7, 5.75, z, STEEL);
    });
    // ---- север: логотип над лифтом, декоративные лифты, служебные двери
    const lg = F.sign('NEXA  INDUSTRIES', 11.5, 1.5, { bg: '#17181b', fg: '#d9b25a', edge: '#b08a3a' }); lg.position.set(0, 8.3, H.z0 + 0.34); g.add(lg);
    R.lift = F.lift(R, 0, H.z0, { floor: '1', cab: 3.0 });
    M.b(14, 0.4, 0.6, 0, 6.4, H.z0 + 0.3, STONE_D); M.b(3.8, 7.6, 0.5, 0, 3.8, H.z0 + 0.18, hex(STONE, 0.9));
    [-1, 1].forEach((s) => {
      M.b(5.4, 3.4, 0.4, s * 8.0, 1.7, H.z0 + 0.2, 0x4a4d54); M.b(2.1, 2.7, 0.1, s * 7.1, 1.35, H.z0 + 0.4, 0xa9adb6); M.b(2.1, 2.7, 0.1, s * 8.9, 1.35, H.z0 + 0.4, 0xa9adb6); M.b(0.04, 2.7, 0.12, s * 8.0, 1.35, H.z0 + 0.42, 0x15161a);
      const nn = F.sign('FLOOR ' + (s < 0 ? '2' : '3') + ' ONLY\nSTAFF', 1.0, 0.4, { bg: '#0a0c0f', fg: '#ff7a2a', edge: '#444' }); nn.position.set(s * 8.0, 3.05, H.z0 + 0.43); g.add(nn);
      // служебная дверь: рамка и красная лампа над ней
      M.b(0.4, 3.2, 0.5, s * 15.8, 1.6, H.z0 + 0.2, 0x34373d); M.b(0.4, 3.2, 0.5, s * 12.2, 1.6, H.z0 + 0.2, 0x34373d); M.b(3.6, 0.5, 0.5, s * 14, 3.4, H.z0 + 0.2, 0x34373d);
      M.glow((q) => q.b(0.6, 0.14, 0.04, s * 14, 3.8, H.z0 + 0.4, 0xff3a2a)); R.halos.push([s * 14, 3.8, H.z0 + 0.6, 0xff3a2a, 2.6]);
      const st = F.sign('STAFF ONLY', 1.6, 0.36, { bg: '#17181b', fg: '#e8e8e8', edge: '#cf3030' }); st.position.set(s * 14, 4.3, H.z0 + 0.32); g.add(st);
      bench(M, R, s * 4.5, -41.5, 0); planter(M, R, s * 3.2, -44.6); planter(M, R, s * 19, -44.4);
    });
    // служебные коридоры (север) и входы с улицы (юг)
    [-14, 14].forEach((x) => vestibule(M, R, g, x, -46, -50.4, 3.2));
    [-22, 22].forEach((x) => {
      vestibule(M, R, g, x, 24, 28.4, 5.0);
      M.glow((q) => { q.b(4.6, 3.2, 0.03, x, 1.7, 28.2, 0x1a2a4a); for (let k = 0; k < 5; k += 1) q.b(0.18, 0.18, 0.03, x - 1.8 + k * 0.9, 2.2 + (k % 2) * 0.5, 28.18, 0xffe6a0); });
      M.glass((q) => q.b(4.8, 3.3, 0.04, x, 1.7, 24.3, 0xb4d8ee)); M.b(0.14, 3.4, 0.14, x, 1.7, 24.3, STEEL); M.b(5.0, 0.16, 0.16, x, 3.4, 24.3, STEEL);
      M.glow((q) => q.b(0.6, 0.12, 0.03, x, 3.75, 23.8, 0x33ff66));
      const ex = F.sign('MAIN ENTRANCE', 2.2, 0.36, { bg: '#17181b', fg: '#e8e8e8', edge: '#b08a3a' }); ex.position.set(x, 4.3, 23.9); ex.rotation.y = PI; g.add(ex);
      R.lampPos.push([x, 3.0, 25.5]);
    });
    // ---- потолок: балки, светопанели, люстры
    for (let z = -43; z <= 22; z += 6.5) M.b(72, 0.9, 0.5, 0, H.h - 0.5, z, 0x4a4a4e);
    for (let x = -30; x <= 30; x += 12) M.b(0.5, 0.9, 70, x, H.h - 0.5, -11, 0x4a4a4e);
    M.glow((q) => { for (let x = -24; x <= 24; x += 12) for (let z = -39.75; z <= 19; z += 6.5) q.b(5.2, 0.04, 4.6, x, H.h - 0.04, z, 0xdfe8ff); });
    [-36, -24, -12, 0, 8].forEach((z) => chandelier(M, R, 0, H.h - 3.4, z, 1.6));
    CZ.forEach((z) => [-1, 1].forEach((s) => { M.glow((q) => q.b(1.2, 0.05, 4.4, s * 26, H.h - 2.4, z, 0xfff0d6)); M.b(1.4, 0.12, 4.6, s * 26, H.h - 2.3, z, 0x2a2b2e); if (z % 2 === 0) R.lampPos.push([s * 26, H.h - 3.0, z]); }));
    // ---- колонны и светильники на них
    PIL.forEach((z) => [-1, 1].forEach((s) => {
      pillar(M, R, s * 13, z);
      M.b(0.2, 0.5, 0.2, s * 13 - s * 0.62, 3.6, z, BRASS); M.glow((q) => q.s(0.17, s * 13 - s * 0.62, 3.9, z, 0xffe6b0, 1, 1.4, 1, 6)); R.halos.push([s * 13 - s * 0.62, 3.9, z, 0xffe0a0, 2.4]);
      M.b(0.3, 0.2, 0.3, s * 13, 9.8, z, DARK);                                                     // камера слежения
    }));
    // ---- 10 окон
    CZ.forEach((z, i) => { counter(M, R, g, -1, z, i + 1); counter(M, R, g, 1, z, i + 6); });
    // ---- центр: стойка информации, монумент NEXA, зелень, скамьи
    {
      const cx = 0, cz = -19;
      for (let i = 0; i < 8; i += 1) { const a = i / 8 * TAU + PI / 8; M.push(cx + Math.sin(a) * 2.1, 0, cz + Math.cos(a) * 2.1, a); M.b(1.75, 1.05, 0.7, 0, 0.525, 0, WOOD); M.b(1.85, 0.06, 0.82, 0, 1.07, 0, 0xd8d4cc); M.b(1.6, 0.04, 0.02, 0, 0.9, 0.36, BRASS); M.pop(); }
      M.y(0.5, 0.5, 0.08, cx, 0.04, cz, DARK, 16); M.tor(2.6, 0.06, cx, 3.6, cz, BRASS, PI / 2, 0, 0, 36);
      M.glow((q) => q.tor(2.6, 0.03, cx, 3.5, cz, 0xfff0cc, PI / 2, 0, 0, 36));
      for (let i = 0; i < 4; i += 1) { const a = i * PI / 2 + PI / 4; M.y(0.04, 0.04, 2.6, cx + Math.sin(a) * 2.6, 2.3, cz + Math.cos(a) * 2.6, STEEL, 6); }
      M.b(0.6, 0.5, 0.5, cx, 1.35, cz, 0x15161a); M.glow((q) => q.b(0.5, 0.36, 0.03, cx, 1.4, cz + 0.27, 0x3a78c8));
      const ii = F.sign('INFORMATION', 1.9, 0.32, { bg: '#17181b', fg: '#e8e8e8', edge: '#b08a3a' }); ii.position.set(cx, 3.95, cz + 2.7); g.add(ii);
      R.lampPos.push([cx, 3.2, cz]);
      solid(R, cx, cz, 4.3, 4.3, 1.1);
    }
    {
      const mx = 0, mz = -2;
      M.b(4.2, 0.35, 4.2, mx, 0.18, mz, hex(STONE_D, 0.8)); M.b(3.4, 0.35, 3.4, mx, 0.52, mz, hex(STONE_D, 0.9)); M.b(2.6, 0.4, 2.6, mx, 0.9, mz, STONE_D);
      M.glass((q) => q.y(0.55, 0.6, 8.0, mx, 5.2, mz, 0x9fc3e0, 12)); M.glow((q) => { q.y(0.13, 0.13, 7.6, mx, 5.2, mz, 0x66aaff, 8); q.tor(1.25, 0.05, mx, 4.1, mz, 0xff4a3a, PI / 2, 0, 0, 30); q.tor(0.95, 0.04, mx, 6.3, mz, 0xff4a3a, PI / 2, 0, 0, 28); });
      M.b(2.4, 0.7, 0.04, mx, 1.35, mz + 1.32, 0x15161a);
      const nm = F.sign('NEXA', 1.6, 0.5, { bg: '#15161a', fg: '#d9b25a', edge: '#b08a3a' }); nm.position.set(mx, 1.35, mz + 1.36); g.add(nm);
      R.halos.push([mx, 5.2, mz, 0x66aaff, 7]);
      solid(R, mx, mz, 3.6, 3.6, 9);
    }
    [[-7.5, -28.5], [7.5, -28.5], [-7.5, -11], [7.5, -11], [-8, 3.5], [8, 3.5]].forEach((p) => planter(M, R, p[0], p[1]));
    [[-9.5, -33], [9.5, -33], [-9.5, 8.5], [9.5, 8.5]].forEach((p) => bench(M, R, p[0], p[1], 0));
    kiosk(M, R, -17.5, 21.5, PI); kiosk(M, R, 17.5, 21.5, PI);
    // ---- досмотр перед лестницей
    [-10, -6, -2, 2, 6, 10].forEach((x) => gatePost(M, R, x)); [-8, -4, 0, 4, 8].forEach((x) => gateArch(M, R, x));
    xray(M, R, -15.5, 12.5); xray(M, R, 15.5, 12.5);
    const sc = F.sign('SECURITY  CHECK\nALL VISITORS', 5.4, 0.9, { bg: '#17181b', fg: '#e8e8e8', edge: '#cf3030' }); sc.position.set(0, 5.0, 12.0); sc.rotation.y = PI; g.add(sc);
    M.b(0.08, 2.2, 0.08, -2.7, 3.9, 12.5, STEEL); M.b(0.08, 2.2, 0.08, 2.7, 3.9, 12.5, STEEL);
    stairs(M, R, g);
    buildRooms(R, M, g);
    // ---- плакаты и знаки по стенам
    [-1, 1].forEach((s) => { [-33, -14, 3].forEach((z, k) => { const pb = F.sign(['SAFETY FIRST', 'NEXA — BUILDING TOMORROW', 'EVERYONE IS WATCHED'][k], 3.0, 0.6, { bg: '#15161a', fg: ['#e8c84a', '#d9b25a', '#e84a3a'][k], edge: '#444' }); pb.position.set(s * 35.93, 3.5, z + 4.5 * (k === 1 ? 0 : 0) + (k === 2 ? 0 : 0) + 4.5); pb.rotation.y = s < 0 ? PI / 2 : -PI / 2; g.add(pb); }); });
    // ---- ореолы
    R.halos.forEach((h) => { const sp = new T.Sprite(new T.SpriteMaterial({ map: F.glowTex(), color: h[3], transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.5, fog: false })); sp.position.set(h[0], h[1], h[2]); sp.scale.set(h[4], h[4], 1); g.add(sp); });
    // ---- данные для сценария
    R.exits = [[-22, 26.6], [22, 26.6], [-14, -48.6], [14, -48.6]];                         // двери наружу: гражданские исчезают
    R.hide = [[-30, -41], [30, -41], [-30, 19], [30, 19]];                                  // комнаты: прячутся внутри
    R.spawns = { north: [[-14, -48.4], [14, -48.4]], south: [[-22, 26.4], [22, 26.4]], rooms: [[-30, -40], [30, -40], [-30, 18.5], [30, 18.5]] };
    R.queues = CZ.map((z, i) => [{ s: -1, z, n: i + 1 }, { s: 1, z, n: i + 6 }]).flat();
    R.bounds = { cx: 0, cz: -11, w: 73, d: 80, h: H.h + 0.5 };
    R.onEnter = (Rg, w) => { w.r.scene.background = new T.Color(0x0a0c12); };
  }

  // ------------------------------------------------------------------ регистрация
  F.regions3 = function (w) {
    const A = w.def('hall', { build: buildHall, surf: ['tile', 'plaster', 'concrete'], amb: 0.82, fogK: 0.14, fogC: 0x0e1018, lampCol: 0xfff1da, lampI: 0.95, lampD: 24, seed: 41 });
    [A].forEach((R) => { R.world = w; });
  };
  F.HALL = H; F.HALL_CZ = CZ;
}());
