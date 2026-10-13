// NEXA: миссия 48 — регион 4: этаж 2 (ХРАНИЛИЩЕ И АРХИВ). Центральная галерея 20×54 м с колоннами и двумя бронешторками, по бокам 20 комнат (две колонки на крыло),
// на севере — внешние ворота хранилища, предбанник, главный зал с золотом, казармы и оружейная. Все координаты локальные: x ∈ [−36, 36], z ∈ [−46, 24].
// Лестница с первого этажа приходит с юга (z = 24 → тамбур 24…28.4). Весь текст — английский.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.World || !C.f48.shell || !C.f48.Mk || !C.f48.sign || !C.f48.desk || !C.f48.palletStack) return;
  const F = C.f48, PI = Math.PI, TAU = PI * 2;
  const hex = (c, k) => ((((c >> 16) & 255) * k | 0) << 16) | ((((c >> 8) & 255) * k | 0) << 8) | ((c & 255) * k | 0);
  const solid = (R, x, z, w, d, h, y0) => R.world.col(R, x, z, w, d, h, y0);
  const V = { x0: -36, x1: 36, z0: -46, z1: 24, h: 7.5, rh: 4.2 };
  const ROW = [-30, -19.2, -8.4, 2.4, 13.2, 24];                         // границы рядов комнат (5 рядов по 10.8 м)
  const ROWC = [-24.6, -13.8, -3.0, 7.8, 18.6];                          // центры рядов (оси дверей)
  const WALL = 0xa9a69d, WALL_D = 0x6d6a64, NAVY = 0x1b2638, GOLD = 0xb08a3a, STEEL = 0x8a8f98, DARK = 0x1a1b1e, RED = 0xb8282c, MARB = 0x2b2c31, WOOD = 0x3a2b22;
  const NAMES = [['SECURITY', 'ARMORY', 'ARCHIVE A', 'CONTROL ROOM'], ['SERVERS', 'LAB 2', 'RECORDS', 'STORAGE'], ['LEGAL', 'CONFERENCE', 'EXECUTIVE', 'BREAK ROOM'], ['FINANCE', 'ACCOUNTS', 'MAIL ROOM', 'AUDIT'], ['LOBBY DESK', 'ARCHIVE B', 'SUPPLY', 'STAFF']];

  function plantPot(M, u, v, k) {
    M.y(0.22 * k, 0.18 * k, 0.5 * k, u, 0.25 * k, v, 0x3a3d43, 10); M.y(0.2 * k, 0.2 * k, 0.03, u, 0.5 * k + 0.01, v, 0x1c130d, 10);
    const leaf = [0x1f4d28, 0x24592f, 0x2c6b38, 0x1a4222];
    for (let i = 0; i < 9; i += 1) { const a = i * 2.4, rr = (0.05 + (i % 3) * 0.07) * k; M.s((0.15 + (i % 3) * 0.03) * k, u + Math.cos(a) * rr, (0.75 + (i % 4) * 0.18) * k, v + Math.sin(a) * rr, leaf[i % 4], 1, 0.8, 1, 6); }
  }
  // ------------------------------------------------------------------ мебель (локальные оси комнаты: u — вдоль стены с дверью, v — вглубь; v = −6.5 — дверь, v = +6.5 — задняя стена)
  function local(R, M, rm) {
    const s = rm.s, th = s * PI / 2;
    const L = {
      M, R, rm, rand: R.rand,
      in(fn) { M.push(rm.cx, 0, rm.cz, th); fn(L); M.pop(); },
      sol(u, v, w, d, h) { solid(R, rm.cx + s * v, rm.cz - s * u, d, w, h); },
      desk(u, v, face, o) {                                                    // стол с монитором и креслом; face = +1/−1 — монитор смотрит в +v / −v
        o = o || {};
        M.push(u, 0, v, face > 0 ? 0 : PI);
        M.b(1.7, 0.06, 0.82, 0, 0.74, 0, o.top || 0x5a4a38); M.b(0.06, 0.72, 0.76, -0.78, 0.36, 0, 0x2a2c30); M.b(0.06, 0.72, 0.76, 0.78, 0.36, 0, 0x2a2c30); M.b(1.6, 0.5, 0.04, 0, 0.5, 0.34, 0x34373d);
        M.b(0.56, 0.36, 0.04, 0, 1.04, 0.2, 0x0a0a0c); M.glow((q) => q.b(0.5, 0.3, 0.02, 0, 1.04, 0.17, o.scr || 0x4a86c8)); M.b(0.05, 0.22, 0.05, 0, 0.88, 0.2, 0x1c1d21); M.b(0.42, 0.016, 0.15, 0, 0.78, -0.15, 0x15161a); M.b(0.08, 0.02, 0.1, 0.38, 0.78, -0.12, 0x15161a);
        if (o.paper !== false) { M.b(0.22, 0.012, 0.3, -0.55, 0.775, 0.0, 0xe4e0d4, 0, 0.3); M.b(0.18, 0.012, 0.26, -0.6, 0.79, 0.04, 0xd9d4c4, 0, -0.2); }
        M.pop();
        if (o.chair !== false) L.chair(u, v - face * 0.95, face > 0 ? 0 : PI);
        L.sol(u, v, 1.8, 0.9, 0.8);
      },
      chair(u, v, ry) { M.push(u, 0, v, ry || 0); M.b(0.5, 0.06, 0.5, 0, 0.5, 0, 0x1c1d21); M.b(0.5, 0.55, 0.06, 0, 0.82, -0.24, 0x1c1d21); M.y(0.03, 0.03, 0.4, 0, 0.27, 0, STEEL, 6); M.b(0.5, 0.04, 0.5, 0, 0.05, 0, STEEL); M.pop(); },
      cabinet(u, v, ry, h) { M.push(u, 0, v, ry || 0); h = h || 1.5; M.b(0.9, h, 0.5, 0, h / 2, 0, 0x5b5e66); for (let k = 0; k < Math.floor(h / 0.37); k += 1) { M.b(0.82, 0.01, 0.02, 0, 0.3 + k * 0.37, 0.26, 0x2a2c30); M.b(0.2, 0.025, 0.03, 0, 0.18 + k * 0.37, 0.27, 0xc8cbd2); } M.pop(); },
      sign(text, w, h, u, y, v, o) { const sg = F.sign(text, w, h, o); sg.position.set(rm.cx + s * v, y, rm.cz - s * u); sg.rotation.y = th + PI; R.g.add(sg); return sg; },
      plant(u, v, s) { plantPot(M, u, v, s || 1); },
      lamp(u, v) { M.b(1.5, 0.04, 0.5, u, V.rh - 0.04, v, 0x2a2b2e); M.glow((q) => q.b(1.4, 0.03, 0.4, u, V.rh - 0.07, v, 0xfff0d6)); },
      shelf(u, v, ry, w, h, filled) {
        M.push(u, 0, v, ry || 0); w = w || 3; h = h || 2.2;
        M.b(w, h, 0.4, 0, h / 2, 0, 0x4a4d54); for (let k = 0; k < Math.floor(h / 0.42); k += 1) {
          M.b(w - 0.1, 0.03, 0.42, 0, 0.35 + k * 0.42, 0, 0x6a6d74);
          if (filled !== false) for (let j = 0; j < Math.floor(w / 0.42); j += 1) if (R.rand() > 0.12) { const bh = 0.24 + R.rand() * 0.12; M.b(0.34, bh, 0.3, -w / 2 + 0.3 + j * 0.42, 0.37 + k * 0.42 + bh / 2, 0.02, [0x7a6a4c, 0x5a6a7a, 0x8a8478, 0x6a4a3a][(j + k) % 4]); }
        }
        M.pop();
      }
    };
    return L;
  }
  const T = {
    office(L) {
      const M = L.M;
      [-2.7, 2.7].forEach((u) => [-2.2, 2.4].forEach((v, k) => L.desk(u, v, k ? -1 : 1, { top: [0x5a4a38, 0x4a4a4e][(u > 0 ? 1 : 0) ^ k] })));
      L.cabinet(-4.9, 5.9, PI, 1.7); L.cabinet(-3.9, 5.9, PI, 1.7); L.cabinet(4.9, 5.9, PI, 1.2); L.sol(-4.4, 5.9, 2, 0.6, 1.7); L.sol(4.9, 5.9, 0.9, 0.6, 1.2);
      L.plant(5.0, -5.6); L.plant(-5.0, -5.6, 0.9);
      M.b(0.5, 1.2, 0.5, 3.3, 0.6, 6.0, 0x4a5a6a); M.b(0.42, 0.4, 0.42, 3.3, 1.4, 6.0, 0xbcd6ec); L.sol(3.3, 6.0, 0.5, 0.5, 1.6);        // кулер
      M.b(2.4, 1.3, 0.06, -2.9, 1.6, 6.3, 0xeeeeee); M.b(2.5, 0.04, 0.08, -2.9, 0.95, 6.28, STEEL);                                       // доска
      [0, 1, 2].forEach((k) => { M.b(0.5, 0.35, 0.01, -3.6 + k * 0.7, 1.9 + (k % 2) * 0.1, 6.26, [0xe8c84a, 0xe8786a, 0x6ab0e8][k]); });
    },
    server(L) {
      const M = L.M;
      for (let row = 0; row < 3; row += 1) {
        const v = -2.6 + row * 3.4;
        for (let k = 0; k < 7; k += 1) {
          const u = -3.6 + k * 1.2;
          if (k === 3) continue;
          M.b(0.9, 2.2, 1.0, u, 1.1, v, 0x16181c); M.b(0.82, 2.1, 0.02, u, 1.1, v - 0.51, 0x23262b);
          for (let j = 0; j < 10; j += 1) { M.b(0.74, 0.1, 0.02, u, 0.35 + j * 0.19, v - 0.52, 0x0c0d0f); M.glow((q) => { q.b(0.05, 0.03, 0.02, u - 0.3, 0.35 + j * 0.19, v - 0.535, L.rand() < 0.5 ? 0x33ff66 : 0xffaa33); q.b(0.05, 0.03, 0.02, u - 0.2, 0.35 + j * 0.19, v - 0.535, L.rand() < 0.2 ? 0xff3a2a : 0x3a78c8); }); }
          L.sol(u, v, 0.95, 1.05, 2.2);
        }
        M.b(8.6, 0.06, 0.4, 0, 2.38, v, 0x2a2c30);                                                       // кабель-лоток
        M.glow((q) => q.b(8.6, 0.02, 0.06, 0, 0.012, v - 0.9, 0x3a78c8));                                // подсветка холодного коридора
      }
      [-3.2, 3.2].forEach((u) => { M.b(1.6, 1.0, 0.9, u, 0.5, 6.0, 0x44484f); M.b(1.5, 0.5, 0.02, u, 0.6, 5.54, 0x1a1c20); L.sol(u, 6.0, 1.6, 0.9, 1.1); });   // кондиционеры
      M.b(0.5, 0.36, 0.05, -5.2, 2.0, -6.2, 0x111214); M.glow((q) => q.b(0.44, 0.28, 0.02, -5.2, 2.0, -6.2, 0xe03030));                // табло «температура»
    },
    conf(L) {
      const M = L.M;
      M.b(2.0, 0.08, 7.0, 0, 0.76, 0.5, 0x3a2b22); M.b(1.9, 0.01, 6.8, 0, 0.805, 0.5, 0x151617); M.b(0.5, 0.74, 5.0, 0, 0.37, 0.5, 0x2a2018); L.sol(0, 0.5, 2.2, 7.2, 0.8);
      for (let k = 0; k < 5; k += 1) [-1, 1].forEach((s) => { L.chair(s * 1.3, -2.0 + k * 1.4, s > 0 ? PI / 2 : -PI / 2); });
      M.b(4.0, 2.2, 0.01, 0, 2.0, 6.32, 0x0a0a0c); M.glow((q) => q.b(3.7, 1.9, 0.01, 0, 2.0, 6.3, 0x3a6ab8));
      M.b(4.2, 0.9, 0.3, 0, 0.45, 6.2, 0x3a2b22); L.sol(0, 6.2, 4.2, 0.4, 0.9);
      [-1, 1].forEach((s) => { M.y(0.02, 0.02, 2.4, s * 3.0, 1.2, 6.1, STEEL, 6); M.b(0.9, 0.6, 0.02, s * 3.0, 2.0, 6.1, s > 0 ? 0x9a1a22 : NAVY); });
      M.glow((q) => { q.b(3.6, 0.03, 0.6, 0, V.rh - 0.05, -1, 0xfff0d6); q.b(3.6, 0.03, 0.6, 0, V.rh - 0.05, 3, 0xfff0d6); });
    },
    lab(L) {
      const M = L.M;
      for (let k = 0; k < 3; k += 1) {
        const v = -3.2 + k * 3.2;
        M.b(5.6, 0.9, 0.9, 0, 0.45, v, 0xcfd2d6); M.b(5.7, 0.05, 1.0, 0, 0.92, v, 0x2a2c30); L.sol(0, v, 5.7, 1.0, 0.95);
        for (let j = 0; j < 6; j += 1) { const col = [0x66ff99, 0x66c8ff, 0xffd866, 0xff6a8a][(j + k) % 4]; M.glass((q) => q.y(0.07, 0.07, 0.26, -2.2 + j * 0.9, 1.12, v, 0xbfe0f0, 10)); M.glow((q) => q.y(0.05, 0.05, 0.12 + (j % 3) * 0.04, -2.2 + j * 0.9, 1.03, v, col, 8)); }
        M.b(0.5, 0.36, 0.5, 2.2, 1.18, v + 0.1, 0x3a3d43); M.y(0.05, 0.05, 0.3, 2.2, 1.45, v + 0.1, STEEL, 8);
      }
      M.b(4.6, 2.4, 0.5, 0, 1.2, 6.2, 0x2a2c30); M.glass((q) => q.b(4.4, 2.0, 0.2, 0, 1.3, 5.9, 0xb4e8c8)); M.glow((q) => q.b(4.2, 1.8, 0.04, 0, 1.3, 5.93, 0x2aff88)); L.sol(0, 6.2, 4.8, 0.7, 2.4);
      [-4.8, 4.8].forEach((u) => { M.b(0.9, 2.1, 0.5, u, 1.05, 6.0, 0x8a8f98); M.b(0.8, 0.02, 0.02, u, 1.4, 5.74, 0x222); L.sol(u, 6.0, 1.0, 0.6, 2.1); });
      L.sign('BIOHAZARD', 1.4, 0.4, 0, 2.9, 6.32, { bg: '#d8a418', fg: '#111', edge: '#111' });
    },
    brk(L) {
      const M = L.M;
      M.b(0.9, 0.95, 5.4, -5.0, 0.475, 1.5, 0x4a3a2c); M.b(1.0, 0.05, 5.5, -5.0, 0.97, 1.5, 0xd8d4cc); L.sol(-5.0, 1.5, 1.0, 5.5, 1.0);
      M.b(0.5, 0.5, 0.4, -5.1, 1.25, 0.2, 0x15161a); M.y(0.18, 0.18, 0.05, -5.0, 1.0, 3.2, 0x8a8f98, 10); M.b(0.5, 1.8, 0.7, -5.4, 0.9, 4.9, 0xd8d8dc); L.sol(-5.4, 4.9, 0.7, 0.8, 1.8);
      for (let k = 0; k < 2; k += 1) { const u = -1 + k * 3.2; M.y(0.6, 0.6, 0.05, u, 0.76, -1.5, 0xd8d4cc, 16); M.y(0.05, 0.08, 0.74, u, 0.38, -1.5, STEEL, 8); [0, 1, 2, 3].forEach((q) => L.chair(u + Math.sin(q * PI / 2) * 0.9, -1.5 + Math.cos(q * PI / 2) * 0.9, q * PI / 2 + PI)); L.sol(u, -1.5, 1.4, 1.4, 0.8); }
      [-1, 1].forEach((s) => { M.b(0.9, 1.9, 0.8, 1.2 + s * 0.5 + 2.2, 0.95, 6.0, s > 0 ? 0x9a1a22 : 0x1a4a9a); M.glow((q) => q.b(0.6, 0.9, 0.02, 1.2 + s * 0.5 + 2.2, 1.3, 5.58, 0xfff0cc)); L.sol(3.4 + s * 0.5, 6.0, 0.95, 0.85, 1.9); });
      M.b(2.6, 0.5, 0.95, 4.6, 0.25, 2.6, 0x3a3f4a); M.b(2.6, 0.55, 0.3, 4.6, 0.55, 3.0, 0x3a3f4a); L.sol(4.6, 2.6, 2.6, 1.0, 0.7);
      L.plant(5.0, 5.6, 1.2);
    },
    rec(L) {
      for (let row = 0; row < 4; row += 1) [-1, 1].forEach((sg) => { L.shelf(sg * 2.7, -3.6 + row * 2.6, 0, 3.4, 2.4); L.sol(sg * 2.7, -3.6 + row * 2.6, 3.4, 0.5, 2.4); });
      const M = L.M; M.b(0.05, 2.6, 0.05, 5.0, 1.3, 0.8, 0x8a6a3a); M.b(0.05, 2.6, 0.05, 5.2, 1.3, 0.8, 0x8a6a3a);                // стремянка
      for (let k = 0; k < 6; k += 1) M.b(0.25, 0.03, 0.1, 5.1, 0.4 + k * 0.4, 0.8, 0x8a6a3a);
    },
    arm(L) {
      const M = L.M;
      for (let k = 0; k < 4; k += 1) {
        const u = -4.2 + k * 2.8;
        M.b(2.2, 2.3, 0.3, u, 1.15, 6.3, 0x2a2e26); M.b(2.0, 0.04, 0.34, u, 1.55, 6.3, 0x14160f);
        for (let j = 0; j < 4; j += 1) { M.b(0.06, 0.06, 0.9, u - 0.7 + j * 0.46, 1.2 + (j % 2) * 0.35, 6.1, 0x0e0f10, 0.0, 0.0, 1.45); M.b(0.14, 0.18, 0.1, u - 0.7 + j * 0.46, 1.2 + (j % 2) * 0.35, 6.4, 0x2a2a2d); }
        L.sol(u, 6.3, 2.2, 0.4, 2.3);
      }
      for (let k = 0; k < 3; k += 1) { M.b(1.0, 0.7, 0.6, -3 + k * 3, 0.35, -1.5, 0x3a4630); M.b(0.9, 0.02, 0.5, -3 + k * 3, 0.71, -1.5, 0x4a5a3a); M.b(0.24, 0.04, 0.16, -3 + k * 3, 0.74, -1.5, 0xd8c030); L.sol(-3 + k * 3, -1.5, 1.0, 0.6, 0.72); }
      M.b(4.4, 0.08, 1.0, 0, 0.9, 1.6, 0x2a2c30); M.b(4.2, 0.9, 0.9, 0, 0.45, 1.6, 0x3a3d43); L.sol(0, 1.6, 4.4, 1.0, 0.95);
      for (let k = 0; k < 6; k += 1) M.b(0.14, 0.07, 0.62, -1.9 + k * 0.76, 0.98, 1.6, [0x1a1a1d, 0x8a7a30][k % 2], 0, (k % 3) * 0.2 - 0.2);
      [-1, 1].forEach((s) => { M.b(0.9, 2.0, 0.5, s * 5, 1.0, -3.8, 0x44484f); M.b(0.8, 0.02, 0.02, s * 5, 1.4, -4.06, 0x111); L.sol(s * 5, -3.8, 1.0, 0.6, 2.0); });
    },
    ctrl(L) {
      const M = L.M;
      [-1, 1].forEach((sg) => M.b(3.5, 3.0, 0.2, sg * 3.45, 1.9, 6.35, 0x15161a));
      M.glow((q) => { for (let i = 0; i < 6; i += 1) for (let j = 0; j < 3; j += 1) if (i !== 2 && i !== 3) q.b(1.6, 0.86, 0.03, -4.3 + i * 1.72, 0.9 + j * 0.95, 6.22, [0x3a78c8, 0x3a8a58, 0x6a4a9a, 0x8a7a30, 0xc83a3a][(i * 2 + j) % 5]); });
      for (let k = 0; k < 3; k += 1) { if (k === 1) continue; const u = -3.2 + k * 3.2; M.b(2.4, 0.76, 1.1, u, 0.38, 2.2, 0x23262b); M.b(2.2, 0.05, 1.0, u, 0.8, 2.2, 0x15161a); M.b(0.7, 0.4, 0.04, u - 0.6, 1.05, 2.45, 0x0a0a0c); M.glow((q) => q.b(0.64, 0.34, 0.02, u - 0.6, 1.05, 2.42, 0x3a78c8)); M.b(0.7, 0.4, 0.04, u + 0.6, 1.05, 2.45, 0x0a0a0c); M.glow((q) => q.b(0.64, 0.34, 0.02, u + 0.6, 1.05, 2.42, 0x33ff66)); L.sol(u, 2.2, 2.4, 1.1, 0.8); L.chair(u, 1.1, 0); }
      M.glow((q) => q.b(10.0, 0.02, 0.06, 0, 0.012, 5.4, 0xc83a3a));
    },
    exec(L) {
      const M = L.M;
      M.push(2.7, 0, 3.6, PI); F.desk(M); M.pop(); L.sol(2.7, 3.6, 3.1, 1.4, 0.9);
      M.push(2.7, 0, 4.7, PI); F.chairExec(M, true); M.pop();
      [-1, 1].forEach((sg) => { M.push(2.7 + sg * 1.0, 0, 1.5, sg > 0 ? PI - 0.4 : PI + 0.4); F.visitorChair(M); M.pop(); });
      M.b(0.5, 0.8, 4.2, -5.2, 0.4, -1.0, 0x1a1514); L.sol(-5.2, -1.0, 0.5, 4.2, 0.8);
      M.b(2.5, 0.5, 0.95, -4.2, 0.25, -4.0, 0x3a2420); M.b(2.5, 0.55, 0.3, -4.2, 0.6, -4.4, 0x3a2420); L.sol(-4.2, -4.0, 2.6, 1.0, 0.7);
      M.push(-3.2, 0, 6.2, PI); F.bookshelf(M, L.rand, 3.0, 2.8, 0.45); M.pop(); L.sol(-3.2, 6.2, 3.0, 0.5, 2.8);
      M.push(4.4, 0, 6.2, PI); F.bookshelf(M, L.rand, 2.0, 2.4, 0.45); M.pop(); L.sol(4.4, 6.2, 2.0, 0.5, 2.4);
      M.b(3.4, 0.01, 2.6, 2.7, 0.013, 1.9, 0x5a1a20);                                                      // ковёр
    },
    store(L) {
      const M = L.M, rand = L.rand;
      for (let k = 0; k < 6; k += 1) { if (k % 3 === 1) continue; const u = -3.6 + (k % 3) * 3.6, v = -2.0 + Math.floor(k / 3) * 4.2; F.palletStack(M, rand, u, v, rand() * 0.3, 2 + (k % 3)); L.sol(u, v, 1.3, 1.1, 1.8); }
      M.push(4.0, 0, -5.0, PI / 2); F.forklift(M); M.pop(); L.sol(4.0, -5.0, 3.0, 1.3, 2.1);
      for (let k = 0; k < 4; k += 1) { M.b(0.9, 0.8, 0.9, -5.0, 0.4, 4.2 - k * 1.0, 0x4a5662); M.b(0.9, 0.02, 0.9, -5.0, 0.81, 4.2 - k * 1.0, 0x2a323a); }
      L.sol(-5.0, 2.7, 1.0, 4.0, 0.9);
    },
    bar(L) {
      const M = L.M;
      for (let k = 0; k < 5; k += 1) [-1, 1].forEach((s) => {
        const u = s * 4.0, v = -4.6 + k * 2.4;
        M.push(u, 0, v, 0); M.b(1.9, 0.22, 0.85, 0, 0.5, 0, 0x3a3d43); M.b(1.9, 0.12, 0.9, 0, 0.3, 0, 0x2a2c31); M.b(1.9, 0.5, 0.2, 0, 0.8, s > 0 ? 0.35 : -0.35, 0x3a3d43); M.b(0.12, 0.3, 0.7, -0.95, 0.65, 0, 0x2a2c31); M.b(0.12, 0.3, 0.7, 0.95, 0.65, 0, 0x2a2c31);
        M.b(0.9, 0.24, 0.5, -0.5, 0.3, 0, 0x22262c); M.b(0.9, 0.24, 0.5, 0.5, 0.3, 0, 0x22262c); M.pop(); L.sol(u, v, 1.9, 0.95, 0.9);
      });
      M.b(0.6, 0.04, 0.6, 0, 0.008, 1.0, 0x6a1a20);
      M.b(2.6, 0.8, 0.5, -3.4, 0.4, 6.0, 0x2a2c31); L.sol(-3.4, 6.0, 2.6, 0.5, 0.8);
      M.glow((q) => { for (let k = 0; k < 6; k += 1) q.b(0.3, 0.02, 0.02, -4.4 + k * 0.4, 3.9, 6.3, [0xff7a2a, 0xffd27a][k % 2]); });
    },
    barracks(L) {
      const M = L.M;
      for (let k = 0; k < 5; k += 1) {
        const v = -4.0 + k * 2.2;
        [-1, 1].forEach((s) => {
          const u = s * 4.6;
          M.push(u, 0, v, 0); [0, 1].forEach((lv) => { M.b(2.0, 0.12, 0.9, 0, 0.5 + lv * 1.2, 0, 0x2a323a); M.b(1.9, 0.14, 0.82, 0, 0.64 + lv * 1.2, 0, [0x4a5a3a, 0x3a4a5a, 0x5a4a3a][(k + lv) % 3]); M.b(0.5, 0.1, 0.5, s > 0 ? 0.7 : -0.7, 0.74 + lv * 1.2, 0, 0xd8d4c8); });
          [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => M.b(0.06, 2.1, 0.06, sx * 0.97, 1.05, sz * 0.42, 0x1a1d22))); M.pop();
          L.sol(u, v, 2.1, 1.0, 2.2);
        });
      }
      for (let k = 0; k < 6; k += 1) { M.b(0.6, 2.0, 0.5, -3.6 + k * 1.4, 1.0, 6.2, 0x44484f); M.b(0.02, 1.8, 0.02, -3.6 + k * 1.4, 1.0, 5.94, 0x111); L.sol(-3.6 + k * 1.4, 6.2, 0.62, 0.52, 2.0); }
      M.y(0.9, 0.9, 0.06, 0, 0.74, 1.0, 0x3a2b22, 16); M.y(0.07, 0.1, 0.72, 0, 0.36, 1.0, STEEL, 8); L.sol(0, 1.0, 1.8, 1.8, 0.8);
    }
  };
  // тип комнаты для каждой ячейки [ряд][позиция: 0 внутр-запад, 1 внешн-запад, 2 внутр-восток, 3 внешн-восток]
  const KIND = [['ctrl', 'arm', 'rec', 'ctrl'], ['server', 'lab', 'rec', 'store'], ['office', 'conf', 'exec', 'brk'], ['office', 'office', 'store', 'conf'], ['bar', 'rec', 'store', 'office']];

  // ------------------------------------------------------------------ галерея
  function pillar(M, R, x, z) {
    M.b(1.3, 0.4, 1.3, x, 0.2, z, WALL_D); M.b(1.0, 0.2, 1.0, x, 0.5, z, 0xa9a396); M.b(0.8, V.h, 0.8, x, V.h / 2, z, 0xa9a396);
    [-1, 1].forEach((s) => { M.b(0.05, V.h - 1.2, 0.16, x + s * 0.4, V.h / 2, z, hex(0xa9a396, 0.84)); M.b(0.16, V.h - 1.2, 0.05, x, V.h / 2, z + s * 0.4, hex(0xa9a396, 0.84)); });
    [1.2, 3.6].forEach((y) => M.b(0.88, 0.1, 0.88, x, y, z, GOLD)); M.b(1.2, 0.4, 1.2, x, V.h - 0.7, z, 0xa9a396); M.b(1.5, 0.24, 1.5, x, V.h - 0.4, z, WALL_D);
    solid(R, x, z, 0.85, 0.85, V.h);
  }
  function frame(M, x, z, vert, big) {
    const hw = big ? 2.1 : 1.65;
    if (vert) { M.b(0.4, 2.8, 0.16, x, 1.4, z - hw, STEEL); M.b(0.4, 2.8, 0.16, x, 1.4, z + hw, STEEL); M.b(0.4, 0.2, hw * 2 + 0.16, x, 2.78, z, STEEL); M.b(0.08, 0.04, hw * 2, x, 2.7, z, GOLD); }
    else { M.b(0.16, 2.8, 0.4, x - hw, 1.4, z, STEEL); M.b(0.16, 2.8, 0.4, x + hw, 1.4, z, STEEL); M.b(hw * 2 + 0.16, 0.2, 0.4, x, 2.78, z, STEEL); M.b(hw * 2, 0.04, 0.08, x, 2.7, z, GOLD); }
  }
  function hazard(M, x, y, z, w, h, d, n) {                                    // полосы «опасно» (жёлто-чёрные) на плите
    M.b(w, h, d, x, y, z, 0xd8a418);
    for (let i = 0; i < n; i += 1) { const t = (i + 0.5) / n; M.b(w / n * 0.5, h + 0.01, d + 0.01, x - w / 2 + w * t, y, z, 0x15161a, 0, 0, 0.0); }
  }

  function buildShutter(R, g, z, label) {
    const T3 = THREE, M = new F.Mk();
    M.b(20.2, 0.5, 0.7, 0, 5.1, 0, STEEL); M.b(20.2, 2.1, 0.5, 0, 6.45, 0, hex(STEEL, 0.75)); M.b(20.2, 0.3, 0.7, 0, 7.35, 0, STEEL); M.b(0.7, 4.8, 0.7, -10.1, 2.4, 0, STEEL); M.b(0.7, 4.8, 0.7, 10.1, 2.4, 0, STEEL);
    M.b(19.4, 0.2, 0.3, 0, 4.7, 0.25, DARK); M.glow((q) => { for (let i = 0; i < 6; i += 1) q.b(0.5, 0.2, 0.04, -7.5 + i * 3, 4.9, 0.4, i % 2 ? 0xff3a2a : 0xffaa33); });
    const frameG = M.build({ cull: false }); frameG.position.set(0, 0, z); g.add(frameG);
    const S = new F.Mk();
    for (let i = 0; i < 20; i += 1) S.b(19.8, 0.22, 0.2, 0, 0.12 + i * 0.226, 0, i % 2 ? hex(0x6a6d74, 0.9) : 0x6a6d74);
    S.b(0.3, 4.6, 0.26, -9.8, 2.3, 0, DARK); S.b(0.3, 4.6, 0.26, 9.8, 2.3, 0, DARK);
    const sh = S.build({ cull: false }); sh.position.set(0, 0, z); g.add(sh);
    const sg = F.sign(label || 'SECURITY SHUTTER', 5.0, 0.5, { bg: '#17181b', fg: '#ff5a3a', edge: '#cf3030' }); sg.position.set(0, 3.6, 0.14); sh.add(sg);
    const sg2 = F.sign(label || 'SECURITY SHUTTER', 5.0, 0.5, { bg: '#17181b', fg: '#ff5a3a', edge: '#cf3030' }); sg2.position.set(0, 3.6, -0.14); sg2.rotation.y = PI; sh.add(sg2);
    const col = solid(R, 0, z, 20, 0.5, 5.0);
    const o = { z, m: sh, col, open: false, y: 0 };
    o.set = (k) => { sh.position.y = k * 4.5; o.y = k; if (k > 0.5) col.off = true; else col.off = false; };
    o.reset = () => { o.open = false; o.set(0); };
    o.slide = async (r, dur) => { o.open = true; await r.tween(dur || 2.2, (k) => o.set(k), (k) => k * k * (3 - 2 * k)); o.set(1); };
    return o;
  }

  // внешние ворота хранилища: две створки + рамка; разбиваются бомбой
  function buildGate(R, g, z) {
    const frm = new F.Mk();
    frm.b(1.8, 5.6, 1.2, -5.0, 2.8, 0, hex(STEEL, 0.7)); frm.b(1.8, 5.6, 1.2, 5.0, 2.8, 0, hex(STEEL, 0.7)); frm.b(11.8, 1.6, 1.2, 0, 6.4, 0, hex(STEEL, 0.7));
    hazard(frm, 0, 5.7, 0.62, 8.6, 0.3, 0.04, 14);
    frm.glow((q) => { q.b(0.3, 0.3, 0.06, -4.2, 5.2, 0.64, 0xff3a2a); q.b(0.3, 0.3, 0.06, 4.2, 5.2, 0.64, 0xff3a2a); });
    const frameG = frm.build({ cull: false }); frameG.position.set(0, 0, z); g.add(frameG);
    const wreck = new F.Mk();
    wreck.b(1.6, 5.6, 1.2, -5.1, 2.8, 0, hex(STEEL, 0.5)); wreck.b(1.8, 0.4, 1.2, 0, 5.7, 0, hex(STEEL, 0.5));
    const leaf = new F.Mk(), leafR = new F.Mk();
    [leaf, leafR].forEach((M, i) => {
      const s = i ? 1 : -1;
      M.b(3.9, 5.0, 0.7, s * 2.0, 2.5, 0, 0x4a4d54); M.b(3.5, 4.6, 0.1, s * 2.0, 2.5, 0.38, 0x5a5d64);
      for (let k = 0; k < 5; k += 1) M.b(3.5, 0.12, 0.14, s * 2.0, 0.8 + k * 0.9, 0.46, 0x2a2c31);
      hazard(M, s * 2.0, 0.5, 0.45, 3.6, 0.5, 0.04, 8);
      M.y(0.12, 0.12, 4.2, s * 3.7, 2.5, 0.55, 0x8a8f98, 8);
      M.glow((q) => q.b(0.18, 0.18, 0.04, s * 3.3, 4.6, 0.44, 0xff3a2a));
    });
    const lg = leaf.build({ cull: false }), rg = leafR.build({ cull: false }); lg.position.set(0, 0, z); rg.position.set(0, 0, z); g.add(lg); g.add(rg);
    const wg = wreck.build({ cull: false }); wg.position.set(0, 0, z); wg.visible = false; g.add(wg);
    const sg = F.sign('VAULT ACCESS - AUTHORISED ONLY', 7.2, 0.7, { bg: '#17181b', fg: '#ff5a3a', edge: '#cf3030' }); sg.position.set(0, 6.7, z + 0.62); g.add(sg);
    const col = solid(R, 0, z, 8.2, 0.9, 5.4);
    const o = { z, lg, rg, wg, frameG, col, blown: false };
    o.reset = () => { o.blown = false; lg.visible = rg.visible = true; lg.position.set(0, 0, z); rg.position.set(0, 0, z); lg.rotation.set(0, 0, 0); rg.rotation.set(0, 0, 0); wg.visible = false; col.off = false; };
    o.blow = () => { o.blown = true; col.off = true; lg.visible = rg.visible = false; wg.visible = true; };
    return o;
  }

  // главная круглая дверь хранилища: рама, воротник, 16 засовов, штурвал; распахивается внутрь (к северу)
  function buildVaultDoor(R, g, z) {
    const zf = z + 0.55;
    const frm = new F.Mk();
    frm.b(2.6, 6.4, 1.4, -4.1, 3.2, 0, 0x2a2d33); frm.b(2.6, 6.4, 1.4, 4.1, 3.2, 0, 0x2a2d33); frm.b(10.8, 2.0, 1.4, 0, 6.0, 0, 0x2a2d33);
    frm.tor(2.78, 0.2, 0, 2.4, 0.72, 0x4a4d54, 0, 0, 0, 40);
    for (let i = 0; i < 24; i += 1) { const a = i / 24 * TAU; frm.z(0.12, 0.2, Math.sin(a) * 2.95, 2.4 + Math.cos(a) * 2.95, 0.72, 0x5c6068, 8); }
    const fg = frm.build({ cull: false }); fg.position.set(0, 0, zf); g.add(fg);
    const D = new F.Mk();
    D.z(2.55, 0.8, 0, 0, 0, 0x464a52, 48); D.z(2.3, 0.84, 0, 0, 0, 0x3a3e46, 48); D.z(1.7, 0.9, 0, 0, 0, 0x4c5058, 40);
    for (let i = 0; i < 16; i += 1) { const a = i / 16 * TAU; D.z(0.16, 1.0, Math.sin(a) * 2.2, Math.cos(a) * 2.2, 0, 0x2a2c31, 10); D.z(0.2, 1.04, Math.sin(a) * 2.2, Math.cos(a) * 2.2, 0.02, 0x6c7078, 10); }
    D.z(0.45, 1.0, 0, 0, 0.4, 0x2a2c31, 16);
    for (let i = 0; i < 6; i += 1) { const a = i / 6 * TAU; D.b(0.16, 1.6, 0.14, Math.sin(a) * 0.8, Math.cos(a) * 0.8, 0.62, 0x5c6068, 0, 0, -a); D.s(0.16, Math.sin(a) * 1.55, Math.cos(a) * 1.55, 0.62, 0x6c7078, 1, 1, 1, 8); }
    D.tor(1.6, 0.07, 0, 0, 0.62, 0x6c7078, 0, 0, 0, 36);
    D.glow((q) => { q.z(0.14, 0.04, 0, 0, 0.64, 0xff3a2a, 12); });
    const door = D.build({ cull: false });
    const pivot = new THREE.Group(); pivot.position.set(-2.55, 2.4, zf + 0.1); g.add(pivot);
    door.position.set(2.55, 0, 0); pivot.add(door);
    const sg = F.sign('VAULT  01', 3.0, 0.5, { bg: '#0f1013', fg: '#d9b25a', edge: GOLD }); sg.position.set(0, 5.5, zf + 0.72); g.add(sg);
    const col = solid(R, 0, z + 0.4, 4.8, 0.8, 2.6);
    const o = { z, pivot, door, col, open: false };
    o.set = (k) => { pivot.rotation.y = k * 1.9; col.off = k > 0.55; };
    o.reset = () => { o.open = false; door.rotation.z = 0; o.set(0); };
    o.run = async (r, dur) => {
      o.open = true;
      await r.tween(dur || 4.0, (k) => { o.set(k < 0.3 ? 0 : (k - 0.3) / 0.7); door.rotation.z = Math.min(k / 0.3, 1) * TAU * 0.8; });
      o.set(1);
    };
    return o;
  }

  // ------------------------------------------------------------------ добыча
  function goldStack(R, g, x, z, ry, k) {
    const M = new F.Mk(), rand = R.rand;
    M.b(1.3, 0.14, 1.1, 0, 0.07, 0, 0x6a5a40); [-0.5, 0, 0.5].forEach((dx) => M.b(0.14, 0.1, 1.06, dx, 0.19, 0, 0x544530)); M.b(1.3, 0.04, 1.1, 0, 0.26, 0, 0x6a5a40);
    const rows = [[4, 3], [4, 3], [3, 2], [3, 2], [2, 1]];
    rows.forEach((rw, l) => {
      for (let i = 0; i < rw[0]; i += 1) for (let j = 0; j < rw[1]; j += 1) {
        const bx = (i - (rw[0] - 1) / 2) * 0.27, bz = (j - (rw[1] - 1) / 2) * 0.3;
        M.b(0.25, 0.1, 0.28, bx, 0.33 + l * 0.11, bz, [0xe2b52c, 0xd6a622, 0xeec23a][(i + j + l) % 3], 0, ((i * 7 + j * 3 + l) % 5 - 2) * 0.012);
        M.b(0.2, 0.01, 0.2, bx, 0.385 + l * 0.11, bz, 0xf8dc7a);
      }
    });
    const grp = M.build({ cull: false }); grp.position.set(x, 0, z); grp.rotation.y = ry || 0; g.add(grp);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: F.glowTex(), color: 0xffd36a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, fog: false }));
    sp.scale.set(2.4, 1.6, 1); sp.position.set(x, 0.85, z); g.add(sp);
    R.pulse.push({ m: sp.material, a: 0.35, b: 0.7, f: 1.3 + k * 0.17, ph: k });
    return { kind: 'gold', x, z, y: 0.7, grp, sp, label: 'TAKE GOLD' };
  }
  function lootCase(R, g, x, z, y0) {
    const M = new F.Mk();
    M.b(0.9, 0.04, 0.6, 0, 0.0, 0, 0x8a8f98); M.b(0.9, 0.2, 0.04, 0, 0.1, -0.3, 0x9a9ea6); M.b(0.9, 0.2, 0.04, 0, 0.1, 0.3, 0x9a9ea6); M.b(0.04, 0.2, 0.6, -0.45, 0.1, 0, 0x9a9ea6); M.b(0.04, 0.2, 0.6, 0.45, 0.1, 0, 0x9a9ea6);
    for (let i = 0; i < 6; i += 1) M.b(0.5, 0.012, 0.36, -0.1 + i * 0.012, 0.03 + i * 0.012, 0, i % 2 ? 0xe6e2d4 : 0xd8d2bf, 0, i * 0.04);
    M.b(0.3, 0.02, 0.26, 0.28, 0.08, 0.0, 0x15161a); M.glow((q) => { q.b(0.04, 0.03, 0.02, 0.28, 0.1, 0.0, 0x3aff88); q.b(0.04, 0.03, 0.02, 0.2, 0.1, 0.0, 0x3aff88); });
    M.push(0, 0.2, -0.3, 0, -1.1); M.b(0.9, 0.04, 0.6, 0, 0, 0.3, 0x9a9ea6); M.pop();
    const grp = M.build({ cull: false }); grp.position.set(x, y0, z); g.add(grp);
    return { kind: 'case', x, z, y: y0 + 0.2, grp, label: 'TAKE EVIDENCE CASE', comp: true };
  }
  function lootLedger(R, g, x, z, y0) {
    const M = new F.Mk();
    M.b(0.36, 0.06, 0.5, 0, 0.03, 0, 0x14100d); M.b(0.34, 0.02, 0.48, 0, 0.07, 0, 0xe4dcc8); M.b(0.36, 0.05, 0.5, 0, 0.1, 0, 0x14100d); M.b(0.34, 0.01, 0.44, 0, 0.125, 0, 0x5a1a20);
    M.glow((q) => { q.b(0.2, 0.01, 0.04, 0, 0.133, -0.05, 0xd9b25a); q.b(0.14, 0.01, 0.03, 0, 0.133, 0.03, 0xd9b25a); });
    const grp = M.build({ cull: false }); grp.position.set(x, y0, z); g.add(grp);
    return { kind: 'ledger', x, z, y: y0 + 0.15, grp, label: 'TAKE THE BLACK LEDGER', comp: true };
  }
  function lootDrives(R, g, x, z, y0) {
    const M = new F.Mk();
    M.b(0.9, 0.1, 0.5, 0, 0.05, 0, 0x23262b);
    for (let i = 0; i < 4; i += 1) { M.b(0.18, 0.24, 0.4, -0.33 + i * 0.22, 0.22, 0, 0x15171a); M.glow((q) => q.b(0.14, 0.02, 0.02, -0.33 + i * 0.22, 0.3, -0.21, [0x3a78c8, 0x33ff66][i % 2])); }
    M.b(0.9, 0.04, 0.5, 0, 0.36, 0, 0x2a2c31);
    const grp = M.build({ cull: false }); grp.position.set(x, y0, z); g.add(grp);
    return { kind: 'drives', x, z, y: y0 + 0.2, grp, label: 'TAKE THE ARCHIVE DRIVES', comp: true };
  }

  // ------------------------------------------------------------------ сборка этажа
  function build(R, g) {
    const r = R.world.r, M = R.D, rand = R.rand;
    R.lampPos = []; R.halos = []; R.pulse = []; R.loot = [];
    F.shell(r, V.x0, V.x1, V.z0, V.z1, V.h, WALL, { s: [[-2.5, 2.5]] }, { floor: 0x55555a, ceil: 0x2e2e32 });
    const wv = (x, a, b, gaps) => r.wallV(x, a, b, V.h, WALL, gaps), wh = (z, a, b, gaps) => r.wallH(z, a, b, V.h, WALL, gaps);
    // ---- стены комнат: спина (x = ±10) и разделитель (x = ±23) с дверями на осях рядов, поперечные стены рядов
    const dg = ROWC.map((c) => [c - 1.5, c + 1.5]);
    [-1, 1].forEach((s) => { wv(s * 10, ROW[0], ROW[5], dg); wv(s * 23, ROW[0], ROW[5], dg); });
    for (let i = 1; i < 5; i += 1) { wh(ROW[i], -36, -10); wh(ROW[i], 10, 36); }
    // ---- север: стена z = −30 с воротами и дверями в казармы, антикамера, главный зал
    wh(-30, -36, 36, [[-4, 4], [-27, -24], [24, 27]]);
    wv(-16, -46, -30, [[-35, -33]]); wv(16, -46, -30, [[-35, -33]]);
    wh(-38, -16, 16, [[-2.4, 2.4]]);
    wv(-8, -46, -38, [[-44.2, -40.2]]); wv(8, -46, -38, [[-44.2, -40.2]]);
    // ---- полы и потолки
    M.b(20, 0.012, 54, 0, 0.007, -3, MARB); M.b(7, 0.014, 54, 0, 0.009, -3, 0x1c2a44);
    [-1, 1].forEach((s) => { M.b(0.16, 0.016, 54, s * 3.6, 0.01, -3, GOLD); M.b(0.06, 0.016, 54, s * 3.9, 0.01, -3, GOLD); });
    for (let i = 0; i < 9; i += 1) M.b(20, 0.014, 0.06, 0, 0.008, -26 + i * 6, hex(MARB, 1.6));
    const em = F.sign('N E X A', 5.0, 1.0, { bg: '#1c2a44', fg: '#d9b25a', edge: GOLD }); em.position.set(0, 0.018, 8.0); em.rotation.x = -PI / 2; g.add(em);
    for (let z = -28; z <= 22; z += 6) M.b(20, 0.7, 0.45, 0, V.h - 0.35, z, 0x4a4a4e);
    M.glow((q) => { for (let z = -25; z <= 21; z += 6) { q.b(7.5, 0.04, 0.5, -5.5, V.h - 0.07, z, 0xdfe8ff); q.b(7.5, 0.04, 0.5, 5.5, V.h - 0.07, z, 0xdfe8ff); } });
    for (let z = -25; z <= 21; z += 6) R.lampPos.push([0, V.h - 1.2, z]);
    // ---- колонны и пилястры
    ROWC.forEach((z) => [-1, 1].forEach((s) => pillar(M, R, s * 6, z)));
    ROW.slice(0, 5).forEach((z) => [-1, 1].forEach((s) => {
      M.b(0.5, V.h, 0.9, s * 9.75, V.h / 2, z, 0xa9a396); M.b(0.7, 0.4, 1.1, s * 9.7, 0.2, z, WALL_D); M.b(0.7, 0.4, 1.1, s * 9.7, V.h - 0.2, z, WALL_D);
      M.glow((q) => q.b(0.16, 0.5, 0.16, s * 9.5, 3.3, z, 0xffe6b8)); R.halos.push([s * 9.5, 3.3, z, 0xffe0a0, 2.4]);
      const bn = F.sign('NEXA', 0.9, 2.8, { bg: '#7a1a22', fg: '#d9b25a', edge: GOLD, px: 70 }); bn.position.set(s * 9.46, 4.6, z + 0.0); bn.rotation.y = s < 0 ? PI / 2 : -PI / 2; g.add(bn);
    }));
    // ---- двери комнат (в стене спины и в разделителе), таблички, номера
    ROWC.forEach((zc, i) => [-1, 1].forEach((s) => {
      frame(M, s * 10, zc, true); frame(M, s * 23, zc, true);
      const nm = NAMES[i][s < 0 ? 0 : 2], nm2 = NAMES[i][s < 0 ? 1 : 3];
      const p1 = F.sign(nm, 1.5, 0.32, { bg: '#17181b', fg: '#e8e8e8', edge: GOLD }); p1.position.set(s * 9.83, 3.05, zc); p1.rotation.y = s < 0 ? PI / 2 : -PI / 2; g.add(p1);
      const p2 = F.sign(nm2, 1.5, 0.32, { bg: '#17181b', fg: '#e8e8e8', edge: GOLD }); p2.position.set(s * (23 - 0.14), 3.05, zc); p2.rotation.y = s < 0 ? PI / 2 : -PI / 2; g.add(p2);
    }));
    // ---- комнаты
    R.rooms = [];
    ROWC.forEach((zc, i) => [0, 1, 2, 3].forEach((k) => {
      const s = k < 2 ? -1 : 1, inner = k % 2 === 0;
      const x0 = inner ? (s < 0 ? -23 : 10) : (s < 0 ? -36 : 23), x1 = x0 + 13;
      const rm = { i, k, s, kind: KIND[i][k], inner, x0, x1, z0: ROW[i], z1: ROW[i + 1], cx: (x0 + x1) / 2, cz: zc };
      R.rooms.push(rm);
      const fl = [0x3a3d44, 0x4a3f36, 0x2a3036, 0x3c4048, 0x4a4a46][(i + k) % 5];
      M.b(12.6, 0.012, 10.4, rm.cx, 0.007, rm.cz, fl);
      r.box(rm.cx, V.rh + 0.05, rm.cz, 13, 0.1, 10.8, 0x5c5a56, false);
      R.lampPos.push([rm.cx, V.rh - 0.7, rm.cz]);
      const L = local(R, M, rm);
      L.in(() => { L.lamp(0, -2.4); L.lamp(0, 2.4); T[rm.kind](L); });
    }));
    // ---- вестибюль у лестницы (юг): стойка охраны и турникеты
    M.b(7.0, 1.1, 1.2, 0, 0.55, 19.4, 0x2b2c31); M.b(7.2, 0.06, 1.4, 0, 1.13, 19.4, 0xd8d4cc); M.b(6.8, 0.5, 0.06, 0, 0.55, 18.76, NAVY); solid(R, 0, 19.4, 7.2, 1.4, 1.2);
    [-2.4, 0, 2.4].forEach((x) => { M.b(0.5, 0.36, 0.04, x, 1.5, 19.7, 0x0a0a0c); M.glow((q) => q.b(0.44, 0.3, 0.02, x, 1.5, 19.67, 0x4a86c8)); });
    [-5.2, -3.2, 3.2, 5.2].forEach((x) => { M.b(0.16, 1.0, 1.2, x, 0.5, 14.2, 0x2a2c30); M.b(0.9, 0.04, 0.04, x + (x < 0 ? 0.45 : -0.45), 0.95, 14.2, 0xd83a2a); solid(R, x, 14.2, 0.2, 1.2, 1.0); });
    const lg = F.sign('NEXA  VAULT & ARCHIVE', 8.0, 1.0, { bg: '#17181b', fg: '#d9b25a', edge: GOLD }); lg.position.set(0, 5.2, 23.8); lg.rotation.y = PI; g.add(lg);
    // ---- тамбур со ступенями вниз
    {
      const bz = 26.2;
      r.box(0, -0.05, 26.2, 5.4, 0.1, 4.4, 0x3a3a3e, false); r.box(0, 3.55, 26.2, 5.8, 0.1, 4.4, 0x2a2a2e, false);
      r.box(-2.8, 1.75, 26.2, 0.2, 3.5, 4.4, hex(WALL, 0.7), true); r.box(2.8, 1.75, 26.2, 0.2, 3.5, 4.4, hex(WALL, 0.7), true); r.box(0, 1.75, 28.5, 5.8, 3.5, 0.2, 0x15161a, true);
      for (let k = 0; k < 6; k += 1) M.b(5.0, 0.1, 0.5, 0, -0.1 - k * 0.22, 26.9 + k * 0.5, hex(0x6a655c, 0.8 - k * 0.1));
      void bz;
      const ds = F.sign('TO LEVEL 1', 2.0, 0.34, { bg: '#17181b', fg: '#e8e8e8', edge: GOLD }); ds.position.set(0, 2.8, 28.38); ds.rotation.y = PI; g.add(ds);
      M.glow((q) => q.b(0.8, 0.04, 0.2, 0, 3.45, 26.2, 0xfff0d6)); R.lampPos.push([0, 3.0, 26.2]);
    }
    // ---- бронешторки в галерее
    R.shutters = [buildShutter(R, g, ROW[3], 'SECURITY SHUTTER  A'), buildShutter(R, g, ROW[1], 'SECURITY SHUTTER  B')];
    // ---- север: подход к воротам
    [-1, 1].forEach((s) => {
      M.b(5.2, V.h, 1.2, s * 7.4, V.h / 2, -29.4, hex(WALL, 0.8));
      hazard(M, s * 6.6, 0.3, -28.7, 3.6, 0.6, 0.04, 8);
    });
    R.gate = buildGate(R, g, -30);
    const spot = F.sign('DANGER - BLAST DOORS', 4.0, 0.5, { bg: '#d8a418', fg: '#111', edge: '#111' }); spot.position.set(0, 3.2, -28.7); g.add(spot);
    M.glow((q) => { q.b(0.4, 0.4, 0.06, -3.2, 4.4, -29.3, 0xff3a2a); q.b(0.4, 0.4, 0.06, 3.2, 4.4, -29.3, 0xff3a2a); });
    R.halos.push([-3.2, 4.4, -29, 0xff3a2a, 3], [3.2, 4.4, -29, 0xff3a2a, 3]);
    // ---- предбанник за воротами (z −38…−30)
    r.box(0, -0.05, -34, 32.6, 0.1, 8.6, 0x5a5a5e, false); r.box(0, 5.55, -34, 32.6, 0.1, 8.6, 0x2e2e32, false);
    M.b(31, 0.012, 7.8, 0, 0.007, -34, 0x2a2c31);
    for (let i = 0; i < 4; i += 1) { M.b(0.1, 4.2, 0.1, -12 + i * 8, 2.1, -37.6, STEEL); }
    [-1, 1].forEach((s) => {
      M.b(5.0, 0.9, 1.2, s * 11, 0.45, -35, 0x2b2c31); M.b(5.2, 0.06, 1.3, s * 11, 0.93, -35, 0xd8d4cc); solid(R, s * 11, -35, 5.2, 1.3, 1.0);   // стойки охраны у стен
      M.glow((q) => q.b(1.0, 0.03, 0.5, s * 11, 5.4, -34, 0xfff0d6)); R.lampPos.push([s * 11, 4.8, -34]);
    });
    M.glow((q) => { q.b(1.4, 0.03, 0.5, 0, 5.4, -33, 0xfff0d6); q.b(1.4, 0.03, 0.5, 0, 5.4, -36, 0xfff0d6); }); R.lampPos.push([0, 4.8, -34]);
    frame(M, -16, -34, true); frame(M, 16, -34, true);
    // ---- главная дверь хранилища
    R.vdoor = buildVaultDoor(R, g, -38);
    // ---- главный зал хранилища (z −46…−38): стеллажи депозитных ящиков, постамент, три отсека
    r.box(0, -0.05, -42, 32.6, 0.1, 8.6, 0x2a2b30, false); r.box(0, 5.55, -42, 32.6, 0.1, 8.6, 0x1c1d20, false);
    M.b(31, 0.012, 7.8, 0, 0.007, -42, 0x14151a); M.b(14, 0.014, 7.0, 0, 0.009, -42, 0x1a2640);
    for (let i = 0; i < 3; i += 1) R.lampPos.push([-11 + i * 11, 5.0, -42]);
    M.glow((q) => { [-12, -4, 4, 12].forEach((x) => { q.b(2.4, 0.03, 0.5, x, 5.45, -42, 0xfff0cc); }); });
    // депозитные ящики по задней стене и в боковых отсеках
    for (let i = 0; i < 28; i += 1) for (let j = 0; j < 6; j += 1) {
      const x = -15.4 + i * 1.1, y = 0.4 + j * 0.62;
      if (Math.abs(x) < 8 && j > 3) continue;
      M.b(1.0, 0.56, 0.3, x, y, -45.7, (i + j) % 2 ? 0x7a7e86 : 0x6a6e76); M.b(0.1, 0.1, 0.04, x, y + 0.05, -45.5, GOLD); M.b(0.5, 0.012, 0.01, x, y - 0.12, -45.52, 0x3a3d43);
    }
    solid(R, 0, -45.7, 31.6, 0.5, 4.0);
    // постамент для улик по центру
    M.y(0.9, 1.0, 0.8, 0, 0.4, -42, 0x3a3d43, 24); M.y(1.0, 1.0, 0.06, 0, 0.83, -42, GOLD, 24); M.glass((q) => q.y(0.8, 0.8, 0.6, 0, 1.15, -42, 0xbfe0f0, 20)); solid(R, 0, -42, 2.0, 2.0, 1.4);
    R.halos.push([0, 1.4, -42, 0xffd89a, 5]);
    // золото: 12 паллет в трёх отсеках и вдоль стен
    const gs = [[-6, -44.2, 0], [-2.2, -44.4, 0.1], [2.2, -44.4, -0.1], [6, -44.2, 0], [-13, -40.4, PI / 2], [-13, -43.0, PI / 2], [-10.4, -44.6, 0], [-10.6, -40.8, 0], [13, -40.4, -PI / 2], [13, -43.0, -PI / 2], [10.4, -44.6, 0], [10.6, -40.8, 0]];
    gs.forEach((p, i) => { const it = goldStack(R, g, p[0], p[1], p[2], i); it.col = solid(R, p[0], p[1], 1.3, 1.1, 0.9); R.loot.push(it); });   // коллайдер снимается, когда паллету забрали
    R.loot.push(lootCase(R, g, 0, -42, 0.87));
    R.loot.push(lootLedger(R, g, -14.6, -45.0, 1.25)); M.b(0.8, 1.2, 0.6, -14.6, 0.6, -45.0, 0x2a1c14); M.b(0.9, 0.06, 0.7, -14.6, 1.22, -45.0, 0x14100d);
    R.loot.push(lootDrives(R, g, 14.6, -45.0, 1.25)); M.b(0.8, 1.2, 0.6, 14.6, 0.6, -45.0, 0x2a2c31); M.b(0.9, 0.06, 0.7, 14.6, 1.22, -45.0, 0x15161a);
    solid(R, -14.6, -45.0, 0.9, 0.7, 1.2); solid(R, 14.6, -45.0, 0.9, 0.7, 1.2);
    // ---- казармы и оружейная (севернее галереи, по бокам предбанника)
    [-1, 1].forEach((s, idx) => {
      const rm = { i: 5, k: idx, s, kind: idx ? 'arm' : 'barracks', inner: false, x0: s < 0 ? -36 : 16, x1: s < 0 ? -16 : 36, z0: -46, z1: -30, cx: s * 26, cz: -38 };
      R.rooms.push(rm);
      r.box(rm.cx, V.rh + 0.05, rm.cz, 20, 0.1, 16, 0x5c5a56, false); M.b(19.6, 0.012, 15.6, rm.cx, 0.007, rm.cz, idx ? 0x2a3026 : 0x3a3d44);
      R.lampPos.push([rm.cx - 4, V.rh - 0.7, rm.cz], [rm.cx + 4, V.rh - 0.7, rm.cz]);
      M.glow((q) => { q.b(1.6, 0.03, 0.5, rm.cx - 4, V.rh - 0.07, rm.cz, 0xfff0d6); q.b(1.6, 0.03, 0.5, rm.cx + 4, V.rh - 0.07, rm.cz, 0xfff0d6); });
      // комната повёрнута так, чтобы дверь (в сторону предбанника) была на v = −6.5 → двигаем центр локальной системы
      const L = local(R, M, Object.assign({}, rm, { cx: s * 29.5, cz: -38, s }));
      L.in(() => {
        if (idx) T.arm(L); else T.barracks(L);
        [-1, 1].forEach((sg) => { M.b(3.2, 0.5, 0.6, sg * 3.6, 0.25, -8.8, 0x2a323a); M.b(3.2, 0.05, 0.64, sg * 3.6, 0.52, -8.8, 0x4a4d54); L.sol(sg * 3.6, -8.8, 3.2, 0.6, 0.55); });
      });
      frame(M, s * 16, -34, true);
      const sg = F.sign(idx ? 'ARMORY' : 'BARRACKS', 1.8, 0.34, { bg: '#17181b', fg: '#e8e8e8', edge: GOLD }); sg.position.set(s * 15.84, 3.05, -34); sg.rotation.y = s < 0 ? -PI / 2 : PI / 2; g.add(sg);
    });
    // ---- аварийные мигалки в галерее (пульсируют при тревоге)
    [-22, -6, 10, 20].forEach((z, i) => [-1, 1].forEach((s) => {
      M.b(0.3, 0.3, 0.3, s * 9.6, 6.3, z, DARK); M.glow((q) => q.b(0.2, 0.2, 0.2, s * 9.5, 6.3, z, 0xff3a2a));
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: F.glowTex(), color: 0xff3a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }));
      sp.scale.set(5, 5, 1); sp.position.set(s * 9.2, 6.2, z); g.add(sp);
      R.pulse.push({ m: sp.material, a: 0, b: 0.8, f: 2.2, ph: i * 0.7 + (s > 0 ? PI : 0), alarm: true });
    }));
    // ---- ореолы
    R.halos.forEach((h) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: F.glowTex(), color: h[3], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, fog: false })); sp.position.set(h[0], h[1], h[2]); sp.scale.setScalar(h[4]); g.add(sp); });
    // ---- данные для сценария
    R.arrive = [0, 21.0, 0];
    R.bombAt = [0, -27.6];
    R.spawn = R.rooms.map((rm) => [rm.cx, rm.cz]);
    R.bounds = { cx: 0, cz: -11, w: 74, d: 80, h: V.h + 0.5 };
    R.onEnter = (Rg, w) => { w.r.scene.background = new THREE.Color(0x07080c); };
    R.tick = (t, alarm) => { R.pulse.forEach((p) => { const k = 0.5 + 0.5 * Math.sin(t * p.f * (p.alarm ? 3.4 : 1) + p.ph); p.m.opacity = p.alarm ? (alarm ? p.b * k : 0) : p.a + (p.b - p.a) * k; }); };
  }

  F.regions4 = function (w) {
    const A = w.def('vault', { build, surf: ['tile', 'plaster', 'concrete'], amb: 0.68, fogK: 0.12, fogC: 0x0a0c12, lampCol: 0xfff1da, lampI: 0.72, lampD: 20, seed: 77 });
    [A].forEach((R) => { R.world = w; });
  };
  F.VAULT = V; F.VAULT_ROWC = ROWC;
}());
