// NEXA: миссия 48 — регионы 5: подвал B4. 'deep' — лифт-лобби, очень длинный коридор (6 секций по 34 м: боковые комнаты, поперечные проходы, шлюзы)
// и предбанник с дверью «083»; 'dark' — тёмный коридор за дверью до двери «HEAD». Красная комната и кабинет HEAD — в f48world6.js.
// Координаты локальные: ось коридора — +Z (лифт на z=0, кабина уходит в −Z; игрок идёт на юг, yaw = π).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.World || !C.f48.shell || !C.f48.Mk || !C.f48.sign || !C.f48.lift) return;
  const F = C.f48, PI = Math.PI, TAU = PI * 2;
  const hex = (c, k) => ((((c >> 16) & 255) * k | 0) << 16) | ((((c >> 8) & 255) * k | 0) << 8) | ((c & 255) * k | 0);
  const solid = (R, x, z, w, d, h, y0) => R.world.col(R, x, z, w, d, h, y0);

  const D = { hw: 3.1, h: 3.9, z0: 16, seg: 34, n: 6, ze: 220, ah: 5.2, ahw: 9, zd: 246 };
  const WALL = 0x6c7074, WALL_D = 0x3a3d42, STEEL = 0x8a8f98, DARK = 0x16171a, YEL = 0xd8a418, RED = 0xcf3030, CONC = 0x55585c;
  const LAMPC = [0xfff0d0, 0xd8f0ff, 0xfff0d0, 0xffd7a0, 0xff9a80, 0xcfe0ff];       // оттенок света по секциям
  const KINDS = [['office', 'control'], ['server', 'server'], ['barracks', 'storage'], ['armory', 'barracks'], ['storage', 'server'], ['control', 'armory']];

  // ------------------------------------------------------------------ мелочи
  const wv = (R, x, a, b, h, gaps) => R.world.r.wallV(x, a, b, h, WALL, gaps);
  const wh = (R, z, a, b, h, gaps) => R.world.r.wallH(z, a, b, h, WALL, gaps);
  function lamp(M, R, x, z, y, col, big, reg) {                    // каркасный светильник: плафон, стекло, трубки
    M.b(big ? 1.5 : 1.1, 0.07, 0.34, x, y, z, 0x2a2c30); M.b(big ? 1.4 : 1.0, 0.03, 0.26, x, y - 0.04, z, 0x15161a);
    M.glow((q) => { q.b(big ? 1.32 : 0.92, 0.03, 0.08, x - 0.06, y - 0.065, z - 0.06, col); q.b(big ? 1.32 : 0.92, 0.03, 0.08, x + 0.06, y - 0.065, z + 0.06, col); });
    M.y(0.008, 0.008, 0.3, x - 0.55, y + 0.17, z, 0x1a1a1c, 4); M.y(0.008, 0.008, 0.3, x + 0.55, y + 0.17, z, 0x1a1a1c, 4);
    if (reg) { R.lampPos.push([x, y - 0.5, z]); }
    R.halos.push([x, y - 0.15, z, col, 3.6]);
  }
  function pipeRun(M, x, y, z0, z1, r, col) {
    const L = z1 - z0, zc = (z0 + z1) / 2;
    M.z(r, L, x, y, zc, col, 8);
    for (let z = z0 + 1.2; z < z1; z += 3.0) { M.b(r * 2.6, 0.04, 0.06, x, y, z, 0x2a2c30); M.b(0.04, 0.3, 0.05, x, y + r + 0.15, z, 0x2a2c30); }
    for (let z = z0 + 5; z < z1 - 2; z += 8.5) M.y(r * 1.4, r * 1.4, 0.16, x, y, z, 0x4a4d54, 8, PI / 2, 0);        // фланец
  }
  function barrier(M, R, x, z, w, ry) {                             // бетонный блок-укрытие
    M.push(x, 0, z, ry || 0);
    M.b(w, 0.55, 0.62, 0, 0.275, 0, 0x7d8085); M.b(w, 0.5, 0.36, 0, 0.8, 0, 0x7d8085); M.b(w * 0.97, 0.06, 0.3, 0, 1.08, 0, 0x6d7075);
    M.b(w, 0.06, 0.5, 0, 0.5, 0, 0xd8a418); M.b(w, 0.05, 0.5, 0, 0.62, 0, 0x15161a);
    M.pop();
    const c = Math.abs(Math.cos(ry || 0)) > 0.7; solid(R, x, z, c ? w : 0.7, c ? 0.7 : w, 1.1);
  }
  function crate(M, R, x, z, s, c, ry) { M.push(x, 0, z, ry || 0); M.b(s, s, s, 0, s / 2, 0, c); M.b(s + 0.02, 0.05, s + 0.02, 0, 0.06, 0, hex(c, 0.6)); M.b(s + 0.02, 0.05, s + 0.02, 0, s - 0.06, 0, hex(c, 0.6)); M.b(s * 0.5, s * 0.25, 0.01, 0, s * 0.55, s / 2 + 0.01, 0xdcdcd0); M.pop(); solid(R, x, z, s + 0.05, s + 0.05, s); }
  function sacks(M, R, x, z, w, d) {                                // мешки с песком
    for (let k = 0; k < 3; k += 1) for (let i = 0; i < Math.round(w / 0.5); i += 1) M.b(0.46, 0.18, d - 0.1 - k * 0.04, x - w / 2 + 0.25 + i * 0.5 + (k % 2) * 0.2, 0.1 + k * 0.17, z, k % 2 ? 0x8a7d5c : 0x7a6e50, 0, (i % 3) * 0.04);
    solid(R, x, z, w, d, 0.6);
  }
  function stairDoor(M, R, g, x, z, s) {                            // торец поперечного прохода: аварийная лестница
    M.b(0.3, 3.0, 2.6, x, 1.5, z, 0x2a2c30); M.b(0.1, 2.6, 1.8, x - s * 0.18, 1.3, z, 0x5a5d64); M.b(0.08, 0.1, 1.9, x - s * 0.2, 2.65, z, YEL);
    M.glow((q) => q.b(0.05, 0.3, 0.3, x - s * 0.2, 2.9, z, 0xff3a2a));
    const sg = F.sign('STAIRWELL  B', 1.6, 0.3, { bg: '#17181b', fg: '#e8e8e8', edge: '#cf3030' }); sg.position.set(x - s * 0.17, 2.4, z + 0.0); sg.rotation.y = s > 0 ? -PI / 2 : PI / 2; sg.position.y = 3.25; g.add(sg);
    R.halos.push([x - s * 0.6, 2.9, z, 0xff3a2a, 2.4]);
  }
  function doorFrame(M, g, x, z, s, label) {                        // проём комнаты в стене коридора: рама, номер, приоткрытая створка
    const fx = x - s * 0.15;
    M.b(0.34, 2.7, 0.14, fx, 1.35, z - 1.15, 0x3a3d44); M.b(0.34, 2.7, 0.14, fx, 1.35, z + 1.15, 0x3a3d44); M.b(0.34, 0.14, 2.44, fx, 2.7, z, 0x3a3d44);
    M.b(0.96, 2.5, 0.06, x - s * 0.6, 1.25, z + 1.0, 0x4a4d54); M.b(0.9, 0.12, 0.08, x - s * 0.6, 1.9, z + 1.0, 0x2a2c30);
    const sg = F.sign(label, 0.9, 0.22, { bg: '#17181b', fg: '#e8e8e8', edge: '#555' }); sg.position.set(x - s * 0.34, 2.95, z); sg.rotation.y = s > 0 ? -PI / 2 : PI / 2; g.add(sg);
  }

  // ------------------------------------------------------------------ комнаты по сторонам коридора (внутренности по видам)
  function roomInside(M, R, kind, s, zc, k) {
    const X = (d) => s * (D.hw + d);                                 // d — глубина от стены коридора
    const lampc = kind === 'server' ? 0x66aaff : kind === 'armory' ? 0xff8a5a : 0xfff0d0;
    M.glow((q) => q.b(1.6, 0.03, 0.36, X(3), D.h - 0.07, zc, lampc));
    R.lampPos.push([X(3), D.h - 0.6, zc]);
    if (kind === 'barracks') {
      for (let i = 0; i < 3; i += 1) {                               // двухъярусные кровати вдоль задней стены
        const z = zc - 1.9 + i * 1.9;
        M.b(2.0, 0.08, 0.9, X(5.4), 0.45, z, 0x3a3d44); M.b(2.0, 0.08, 0.9, X(5.4), 1.4, z, 0x3a3d44);
        [-1, 1].forEach((a) => [-1, 1].forEach((b) => M.b(0.06, 1.7, 0.06, X(5.4) + a * 0.98, 0.85, z + b * 0.43, 0x2a2c30)));
        M.b(1.7, 0.1, 0.8, X(5.4) + s * 0.05, 0.54, z, 0x4a5a3a); M.b(1.7, 0.1, 0.8, X(5.4) + s * 0.05, 1.49, z, 0x5a4a3a); M.b(0.5, 0.08, 0.5, X(5.4) - s * 0.7, 0.6, z, 0xd8d4cc);
        solid(R, X(5.4), z, 2.0, 0.9, 1.6);
      }
      // шкафы двумя блоками по краям с проходом по оси двери (раньше один коллайдер на всю ширину запирал охрану в глубине комнаты)
      [-2.4, -1.4, 1.4, 2.4].forEach((dz) => { M.b(0.5, 2.0, 0.5, X(2.4), 1.0, zc + dz, 0x4a5058); M.b(0.02, 1.8, 0.02, X(2.1), 1.0, zc + dz, 0x1a1b1d); solid(R, X(2.4), zc + dz, 0.5, 0.5, 2.0); });
    } else if (kind === 'server') {
      for (let row = 0; row < 2; row += 1) for (let i = 0; i < 4; i += 1) {
        const x = X(3.2 + row * 2.4), z = zc + [-2.3, -1.2, 1.2, 2.3][i];   // проход 1.5 м по оси двери: шеренга стоек не запирает комнату
        M.b(0.9, 2.2, 0.8, x, 1.1, z, 0x1b1d21); M.b(0.84, 2.14, 0.02, x - s * 0.0, 1.1, z + 0.41, 0x0e0f12);
        M.glow((q) => { for (let j = 0; j < 9; j += 1) q.b(0.5, 0.025, 0.02, x, 0.35 + j * 0.2, z + 0.43, [0x33ff66, 0x3a8cff, 0xffaa33][(i + j + row) % 3]); });
        solid(R, x, z, 0.95, 0.85, 2.2);
      }
      M.glow((q) => q.b(0.04, 1.6, 5.2, X(5.85), 1.6, zc, 0x2a60c8));
    } else if (kind === 'storage') {
      for (let i = 0; i < 3; i += 1) {
        const z = zc - 2 + i * 2.0;
        M.b(0.5, 2.3, 1.8, X(5.7), 1.15, z, 0x4a4d54); for (let q = 0; q < 5; q += 1) M.b(0.46, 0.04, 1.76, X(5.6), 0.35 + q * 0.5, z, 0x6a6d74);
        for (let q = 0; q < 4; q += 1) M.b(0.4, 0.36, 0.7, X(5.6), 0.55 + q * 0.5, z + (q % 2) * 0.4 - 0.2, [0x7a6a4c, 0x5a6a7a, 0x8a8478][(i + q) % 3]);
        solid(R, X(5.7), z, 0.55, 1.8, 2.3);
      }
      crate(M, R, X(2.6), zc - 1.6, 0.9, 0x6a5a40, 0.2); crate(M, R, X(2.4), zc + 1.0, 0.75, 0x4a5662, -0.3); crate(M, R, X(3.6), zc + 1.8, 0.9, 0x6a5a40, 0.1);
    } else if (kind === 'armory') {
      M.b(0.2, 2.4, 5.6, X(5.9), 1.3, zc, 0x2a2c31);
      for (let q = 0; q < 3; q += 1) for (let i = 0; i < 6; i += 1) { M.b(0.12, 0.08, 0.7, X(5.7), 0.8 + q * 0.55, zc - 2.3 + i * 0.9, 0x15161a); M.b(0.1, 0.1, 0.12, X(5.7), 0.88 + q * 0.55, zc - 2.55 + i * 0.9, 0x3a3d44); }
      M.b(1.2, 0.7, 0.8, X(3.4), 0.35, zc - 1.2, 0x4a5a3a); M.b(1.2, 0.04, 0.8, X(3.4), 0.72, zc - 1.2, 0x2a3220); M.b(1.0, 0.5, 0.8, X(3.6), 0.25, zc + 1.4, 0x4a5a3a);
      solid(R, X(3.4), zc - 1.2, 1.2, 0.8, 0.75); solid(R, X(3.6), zc + 1.4, 1.0, 0.8, 0.5); solid(R, X(5.9), zc, 0.3, 5.6, 2.4);
    } else {                                                          // office / control
      for (let i = 0; i < 2; i += 1) {
        const z = zc - 1.3 + i * 2.6, x = X(4.2);
        M.b(1.7, 0.06, 0.85, x, 0.74, z, 0x5a4a38); M.b(0.06, 0.72, 0.8, x - 0.8, 0.36, z, 0x2a2c30); M.b(0.06, 0.72, 0.8, x + 0.8, 0.36, z, 0x2a2c30);
        M.b(0.52, 0.34, 0.04, x - s * 0.1, 1.02, z, 0x0a0a0c, 0, s * PI / 2); M.glow((q) => q.b(0.46, 0.28, 0.02, x - s * 0.13, 1.02, z, [0x4a86c8, 0x3a8a58][i], 0, s * PI / 2));
        M.b(0.5, 0.06, 0.5, x - s * 0.9, 0.5, z, 0x1c1d21); M.b(0.06, 0.55, 0.5, x - s * 1.1, 0.8, z, 0x1c1d21);
        solid(R, x, z, 1.8, 0.9, 0.8);
      }
      M.b(0.2, 2.0, 3.8, X(5.9), 1.1, zc, 0x4a3a2a); M.b(0.3, 0.02, 3.6, X(5.8), 1.4, zc, 0xb08a3a);
    }
  }
  function buildRoom(R, M, g, s, zc, k, kind, idx) {
    const r = R.world.r, xa = s * D.hw, xb = s * (D.hw + 6), xm = (xa + xb) / 2;
    r.box(xm, -0.05, zc, 6.4, 0.1, 6.4, 0x484a4e, false); r.box(xm, D.h + 0.05, zc, 6.4, 0.1, 6.4, 0x2e3034, false);
    wh(R, zc - 3, Math.min(xa, xb), Math.max(xa, xb), D.h); wh(R, zc + 3, Math.min(xa, xb), Math.max(xa, xb), D.h); wv(R, xb, zc - 3, zc + 3, D.h);
    roomInside(M, R, kind, s, zc, k);
    doorFrame(M, g, xa, zc, s, 'B4-' + String(k * 4 + idx + 1).padStart(2, '0'));
    R.rooms.push({ x: xm, z: zc, cx: xm, cz: zc, seg: k, side: s, kind });
  }

  // ------------------------------------------------------------------ шлюз секции (роликовая решётка)
  function gate(R, g, z, label) {
    const M = new F.Mk();
    M.b(D.hw * 2 + 0.7, 0.5, 0.7, 0, D.h - 0.1, 0, STEEL); M.b(0.7, D.h, 0.7, -D.hw - 0.05, D.h / 2, 0, STEEL); M.b(0.7, D.h, 0.7, D.hw + 0.05, D.h / 2, 0, STEEL);
    M.b(D.hw * 2, 0.2, 0.3, 0, D.h - 0.45, 0.3, DARK);
    M.glow((q) => { for (let i = 0; i < 4; i += 1) q.b(0.4, 0.14, 0.04, -2.1 + i * 1.4, D.h - 0.45, 0.46, i % 2 ? 0xff3a2a : 0xffaa33); });
    const fr = M.build({ cull: false }); fr.position.set(0, 0, z); g.add(fr);
    const S = new F.Mk();
    for (let i = 0; i < 16; i += 1) S.b(D.hw * 2 - 0.3, 0.2, 0.18, 0, 0.11 + i * 0.2, 0, i % 2 ? hex(0x6a6d74, 0.9) : 0x6a6d74);
    S.b(0.2, 3.3, 0.24, -D.hw + 0.25, 1.65, 0, DARK); S.b(0.2, 3.3, 0.24, D.hw - 0.25, 1.65, 0, DARK);
    const sh = S.build({ cull: false }); sh.position.set(0, 0, z); g.add(sh);
    const mk = (zz, ry) => { const sg = F.sign(label, 3.4, 0.4, { bg: '#17181b', fg: '#ff5a3a', edge: '#cf3030' }); sg.position.set(0, 2.5, zz); sg.rotation.y = ry; sh.add(sg); };
    mk(0.12, 0); mk(-0.12, PI);
    const col = solid(R, 0, z, D.hw * 2, 0.5, 3.6);
    const o = { z, m: sh, col, open: false, y: 0 };
    o.set = (k) => { sh.position.y = k * 3.6; o.y = k; col.off = k > 0.5; };
    o.reset = () => { o.open = false; o.set(0); };
    o.slide = async (r, dur) => { o.open = true; await r.tween(dur || 2.0, (k) => o.set(k), (k) => k * k * (3 - 2 * k)); o.set(1); };
    return o;
  }

  // ------------------------------------------------------------------ дверь «083»: массивная створка на петле, красные цифры, ряды болтов
  function bigDoor(R, g, z, hw, hh, num, o) {
    o = o || {};
    const frm = new F.Mk(), colr = o.col || 0x2a2d33;
    frm.b(1.0, hh + 0.6, 1.1, -hw - 0.5, (hh + 0.6) / 2, 0, colr); frm.b(1.0, hh + 0.6, 1.1, hw + 0.5, (hh + 0.6) / 2, 0, colr); frm.b(hw * 2 + 2, 0.7, 1.1, 0, hh + 0.35, 0, colr);
    for (let i = 0; i < 14; i += 1) { frm.s(0.07, -hw - 0.5, 0.4 + i * (hh / 14), 0.57, 0x6c7078, 1, 1, 0.6, 6); frm.s(0.07, hw + 0.5, 0.4 + i * (hh / 14), 0.57, 0x6c7078, 1, 1, 0.6, 6); }
    for (let i = 0; i < 8; i += 1) frm.b(0.25, 0.7, 0.04, -hw - 0.5 + (i / 7) * (hw * 2 + 1), hh + 0.35, 0.57, i % 2 ? 0xd8a418 : 0x15161a, 0, 0, 0.5);
    const fg = frm.build({ cull: false }); fg.position.set(0, 0, z); g.add(fg);
    const D2 = new F.Mk(), W2 = hw * 2;
    D2.b(W2, hh, 0.5, hw, hh / 2, 0, 0x3c4048); D2.b(W2 - 0.3, hh - 0.3, 0.1, hw, hh / 2, -0.28, 0x4c5058);
    for (let i = 0; i < 5; i += 1) D2.b(W2 - 0.4, 0.14, 0.12, hw, 0.5 + i * (hh - 1) / 4, -0.34, 0x24272b);
    for (let i = 0; i < 6; i += 1) { D2.y(0.1, 0.1, 0.18, 0.5 + i * (W2 - 1) / 5, 0.0 + 0, 0, 0x6c7078, 8, PI / 2, 0); D2.y(0.1, 0.1, 0.18, 0.5 + i * (W2 - 1) / 5, hh - 0.0, 0, 0x6c7078, 8, PI / 2, 0); }
    D2.b(0.14, 0.9, 0.2, W2 - 0.3, hh * 0.45, -0.38, 0x8a8f98); D2.y(0.05, 0.05, 0.3, W2 - 0.3, hh * 0.45, -0.5, 0x15161a, 8, PI / 2, 0);
    D2.b(W2 - 0.2, 0.3, 0.02, hw, 0.34, -0.34, 0xd8a418);
    for (let i = 0; i < 10; i += 1) D2.b(0.3, 0.3, 0.025, 0.4 + i * (W2 - 0.8) / 9, 0.34, -0.352, 0x15161a, 0, 0, 0.6);
    const leaf = D2.build({ cull: false }); const pivot = new THREE.Group(); pivot.position.set(-hw, 0, z - 0.4); leaf.position.set(0, 0, 0.0); pivot.add(leaf); g.add(pivot);
    const sg = F.sign(num, 2.8, 1.1, { bg: '#0a0405', fg: '#ff2a1a', edge: '#6a1410' }); sg.position.set(hw, hh * 0.74, -0.35); leaf.add(sg); sg.rotation.y = PI;
    const lampL = new THREE.Sprite(new THREE.SpriteMaterial({ map: F.glowTex(), color: 0xff2a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6, fog: false }));
    lampL.scale.set(5, 5, 1); lampL.position.set(0, hh * 0.74, z - 0.9); g.add(lampL);
    const col = solid(R, 0, z - 0.4, W2, 0.5, hh);
    const d = { pivot, leaf, col, k: 0, lamp: lampL };
    d.set = (k) => { d.k = k; pivot.rotation.y = -k * 1.95; col.off = k > 0.35; };
    d.num = sg;
    return d;
  }

  // ------------------------------------------------------------------ ПОДВАЛ B4
  function buildDeep(R, g) {
    const r = R.world.r, M = R.D, hw = D.hw, h = D.h;
    R.lampPos = []; R.halos = []; R.pulse = []; R.rooms = []; R.cross = []; R.gates = [];
    // ---- лифтовое лобби (x ±6, z 0..16): лифт на севере, коридор на юге
    r.box(0, -0.05, 8, 12.6, 0.1, 16.6, 0x44464a, false); r.box(0, h + 0.05, 8, 12.6, 0.1, 16.6, 0x2a2c30, false);
    wv(R, -6, 0, 16, h); wv(R, 6, 0, 16, h); wh(R, 0, -6, 6, h, [[-1.9, 1.9]]); wh(R, 16, -6, 6, h, [[-hw, hw]]);
    R.lift = F.lift(R, 0, 0, { floor: 'B4', cab: 3.0 });
    M.b(14, 0.4, 0.6, 0, 3.6, 0.3, 0x3a3d44);
    const lb = F.sign('SUBLEVEL  B4\nRESTRICTED — SECURITY CLEARANCE ONLY', 5.4, 0.8, { bg: '#17181b', fg: '#e8e8e8', edge: '#cf3030' }); lb.position.set(0, 3.3, 0.36); g.add(lb);
    [-1, 1].forEach((s) => {                                         // турникеты и пост охраны
      M.b(1.6, 1.0, 0.9, s * 4.4, 0.5, 6.0, 0x2a2c30); M.b(1.7, 0.06, 1.0, s * 4.4, 1.03, 6.0, 0x15161a); M.b(0.44, 0.3, 0.04, s * 4.4, 1.3, 6.2, 0x0a0a0c);
      M.glow((q) => q.b(0.38, 0.24, 0.02, s * 4.4, 1.3, 6.18, 0x3a78c8)); solid(R, s * 4.4, 6.0, 1.7, 1.0, 1.1);
      M.b(0.06, 1.0, 1.4, s * 5.7, 0.5, 11.0, 0x3a3d44); M.b(1.2, 0.5, 0.06, s * 5.1, 0.75, 11.7, 0x2a2c30);
    });
    [-2, 0, 2].forEach((x) => { M.b(0.1, 0.9, 0.9, x, 0.45, 9.0, 0x4a4d54); M.b(0.8, 0.08, 0.08, x, 0.9, 9.0, 0xd8a418); solid(R, x, 9.0, 0.2, 0.9, 0.9); });
    lamp(M, R, -3, 3, h - 0.05, LAMPC[0], true, true); lamp(M, R, 3, 3, h - 0.05, LAMPC[0], true, false); lamp(M, R, 0, 10, h - 0.05, LAMPC[0], true, true);
    M.b(11.9, 0.012, 0.9, 0, 0.01, 12.5, YEL); for (let i = 0; i < 10; i += 1) M.b(0.6, 0.014, 0.9, -5.4 + i * 1.2, 0.012, 12.5, 0x15161a, 0, 0, 0.0);
    // ---- главный коридор
    const zA = D.z0, zB = D.ze, L = zB - zA, zm = (zA + zB) / 2;
    r.box(0, -0.05, zm, hw * 2 + 0.6, 0.1, L + 0.6, 0x4a4c50, false); r.box(0, h + 0.05, zm, hw * 2 + 0.6, 0.1, L + 0.6, 0x2a2c30, false);
    const gapsL = [], gapsR = [];
    for (let k = 0; k < D.n; k += 1) {
      const s0 = D.z0 + D.seg * k, zc = s0 + 17;
      [s0 + 7, s0 + 26].forEach((z) => { gapsL.push([z - 1.2, z + 1.2]); gapsR.push([z - 1.2, z + 1.2]); });
      gapsL.push([zc - 2.5, zc + 2.5]); gapsR.push([zc - 2.5, zc + 2.5]);
    }
    wv(R, -hw, zA, zB, h, gapsL); wv(R, hw, zA, zB, h, gapsR);
    for (let k = 0; k < D.n; k += 1) {
      const s0 = D.z0 + D.seg * k, s1 = s0 + D.seg, zc = s0 + 17, kinds = KINDS[k], lc = LAMPC[k];
      // свет: светильники каждые 5.6 м (часть — мерцает)
      for (let j = 0; j < 6; j += 1) {
        const z = s0 + 2.8 + j * 5.6;
        if (k === 4 && j % 2 === 1) { M.b(1.1, 0.05, 0.3, 0, h - 0.04, z, 0x15161a); continue; }       // выбитые плафоны в 5-й секции
        lamp(M, R, 0, z, h - 0.05, lc, false, j % 2 === 0);
        if (j % 3 === 1) { const sp = R.halos[R.halos.length - 1]; R.pulse.push({ h: sp, f: 5 + j + k * 1.7, ph: k * 2.3 + j, fl: true }); }
      }
      if (k >= 3) [-1, 1].forEach((s) => { M.glow((q) => q.b(0.3, 0.3, 0.3, s * (hw - 0.3), h - 0.7, zc, 0xff3a2a)); R.halos.push([s * (hw - 0.5), h - 0.7, zc, 0xff3a2a, 3.2]); R.pulse.push({ h: R.halos[R.halos.length - 1], f: 2.2, ph: k, alarm: true }); });
      // трубы и лотки под потолком, плинтус и разметка пола
      const segs = []; { let a = s0; [[s0 + 7 - 1.2, s0 + 7 + 1.2], [zc - 2.5, zc + 2.5], [s0 + 26 - 1.2, s0 + 26 + 1.2]].forEach((q) => { segs.push([a, q[0]]); a = q[1]; }); segs.push([a, s1]); }
      pipeRun(M, -2.55, 3.3, s0, s1, 0.1, k % 2 ? 0x4a5a6a : 0x6a4a3a); pipeRun(M, -2.2, 3.55, s0, s1, 0.05, 0x8a8f98); pipeRun(M, 2.6, 3.4, s0, s1, 0.07, 0x3a5a3a);
      M.b(0.9, 0.08, D.seg, 1.0, 3.76, (s0 + s1) / 2, 0x2a2c30); for (let z = s0 + 1; z < s1; z += 2.2) M.b(0.9, 0.07, 0.03, 1.0, 3.74, z, 0x15161a);
      [-1, 1].forEach((s) => {
        segs.forEach((q) => { const L2 = q[1] - q[0], zz = (q[0] + q[1]) / 2; M.b(0.05, 1.05, L2, s * (hw - 0.02), 0.53, zz, 0x34373c); M.b(0.06, 0.05, L2, s * (hw - 0.03), 1.07, zz, YEL); });
        M.b(0.14, 0.012, D.seg, s * (hw - 0.4), 0.008, (s0 + s1) / 2, YEL);
        for (let z = s0 + 4; z < s1; z += 8.5) { M.b(0.06, 0.4, 0.5, s * (hw - 0.04), 1.9, z, 0x17181b); M.glow((q) => q.b(0.02, 0.26, 0.36, s * (hw - 0.075), 1.9, z, 0x3a78c8)); }
        const num = F.sign('B4  —  SECTION ' + (k + 1), 1.8, 0.3, { bg: '#17181b', fg: '#e8c84a', edge: '#555' }); num.position.set(s * (hw - 0.17), 2.7, s0 + 1.8); num.rotation.y = s > 0 ? -PI / 2 : PI / 2; g.add(num);
      });
      for (let i = 0; i < 5; i += 1) M.b(0.5, 0.012, 0.18, 0, 0.009, s0 + 3 + i * 0.9, 0xe8e8e8, 0, 0, 0);             // стрелки на пол: к двери
      M.b(0.5, 0.012, 3.0, 0, 0.009, s0 + 5.0, 0xe8e8e8); for (let i = 0; i < 2; i += 1) M.b(1.0, 0.012, 0.22, i ? 0.35 : -0.35, 0.009, s0 + 6.6, 0xe8e8e8, 0, i ? 0.7 : -0.7);
      // комнаты
      [[s0 + 7, -1, 0], [s0 + 7, 1, 1], [s0 + 26, -1, 2], [s0 + 26, 1, 3]].forEach((q) => buildRoom(R, M, g, q[1], q[0], k, kinds[(q[2] >> 1) % 2], q[2]));
      // поперечный проход с лестницами на торцах
      const ex = 26, xa = hw, midx = (xa + ex) / 2, wd = ex - xa;
      [-1, 1].forEach((s) => {
        r.box(s * midx, -0.05, zc, wd + 0.2, 0.1, 5.4, 0x484a4e, false); r.box(s * midx, h + 0.05, zc, wd + 0.2, 0.1, 5.4, 0x2e3034, false);
        wh(R, zc - 2.5, Math.min(s * xa, s * ex), Math.max(s * xa, s * ex), h); wh(R, zc + 2.5, Math.min(s * xa, s * ex), Math.max(s * xa, s * ex), h); wv(R, s * ex, zc - 2.5, zc + 2.5, h);
        stairDoor(M, R, g, s * ex, zc, s);
        for (let x = 8; x < ex - 2; x += 6) lamp(M, R, s * x, zc, h - 0.05, k >= 3 ? 0xff9a80 : lc, false, false);
        R.lampPos.push([s * 14, h - 0.6, zc]);
        crate(M, R, s * (ex - 2.2), zc - 1.4, 0.9, 0x6a5a40, s * 0.2); crate(M, R, s * (ex - 3.2), zc + 1.6, 0.8, 0x4a5662);
        pipeRun(M, s * midx, 3.4, 0, 0.01, 0.05, 0x8a8f98);
        R.cross.push({ x: s * (ex - 2.5), z: zc, seg: k, side: s });
      });
      M.b(hw * 2 - 0.3, 0.012, 5.0, 0, 0.008, zc, 0x3a3c40);
      // укрытия: блоки-«ёлочка» вдоль коридора, чередуются по сторонам
      if (k >= 1) {
        [[s0 + 3.4, -1.55], [s0 + 12.2, 1.55], [s0 + 21.4, -1.55], [s0 + 30.6, 1.55]].forEach((q, i) => {
          if (k === 2 && i === 1) { sacks(M, R, q[1], q[0], 2.0, 0.6); return; }
          barrier(M, R, q[1], q[0], 2.2, i % 2 ? 0.05 : -0.05);
        });
      }
      // шлюз в конце секции
      const gz = s1;
      R.gates.push(gate(R, g, gz, k === D.n - 1 ? 'FINAL  LOCK' : 'SECTION  LOCK  ' + (k + 1)));
    }
    // ---- предбанник перед дверью 083
    const az0 = D.ze, az1 = D.zd, azc = (az0 + az1) / 2, ah = D.ah, aw = D.ahw;
    r.box(0, -0.05, azc, aw * 2 + 0.6, 0.1, az1 - az0 + 0.6, 0x3a3c40, false); r.box(0, ah + 0.05, azc, aw * 2 + 0.6, 0.1, az1 - az0 + 0.6, 0x22242a, false);
    wv(R, -aw, az0, az1, ah); wv(R, aw, az0, az1, ah); wh(R, az1, -aw, aw, ah, [[-2.1, 2.1]]); wh(R, az0, -aw, aw, ah, [[-hw, hw]]);
    for (let z = az0 + 4; z < az1 - 2; z += 5) [-1, 1].forEach((s) => {
      M.b(0.9, ah, 0.9, s * 6.2, ah / 2, z, 0x4a4d52); M.b(1.1, 0.3, 1.1, s * 6.2, 0.15, z, 0x34373c); M.b(1.1, 0.3, 1.1, s * 6.2, ah - 0.15, z, 0x34373c); solid(R, s * 6.2, z, 0.9, 0.9, ah);
      M.glow((q) => q.b(0.04, ah - 1.2, 0.16, s * 5.73, ah / 2, z, 0xff3a2a)); R.halos.push([s * 5.5, ah / 2, z, 0xff3a2a, 2.8]);
    });
    for (let z = az0 + 2; z < az1 - 1; z += 4.5) { lamp(M, R, 0, z, ah - 0.05, 0xffb08a, true, z < az1 - 4); R.pulse.push({ h: R.halos[R.halos.length - 1], f: 3.1, ph: z, fl: true }); }
    M.b(aw * 2 - 0.4, 0.014, 0.5, 0, 0.009, az0 + 1.2, YEL);
    for (let i = 0; i < 9; i += 1) M.b(0.26, 0.016, 0.5, -aw + 0.5 + i * (aw * 2 - 1) / 8, 0.011, az0 + 1.2, 0x15161a, 0, 0, 0.6);
    // стрелки к двери и надпись на полу
    for (let i = 0; i < 6; i += 1) { const zz = az0 + 3 + i * 3.4; M.b(0.16, 0.014, 1.0, 0, 0.009, zz, 0xa81414); M.b(0.16, 0.014, 0.55, -0.22, 0.009, zz + 0.38, 0xa81414, 0, 0.8); M.b(0.16, 0.014, 0.55, 0.22, 0.009, zz + 0.38, 0xa81414, 0, -0.8); }
    const fl = F.sign('SUBJECT', 4.4, 0.9, { bg: '#3a3c40', fg: '#a81414', edge: '#3a3c40' }); fl.position.set(0, 0.016, az1 - 4.2); fl.rotation.x = -PI / 2; fl.rotation.z = PI; g.add(fl);
    // кресло с ремнями, капельница, тележка: намёк на «объект»
    M.push(-6.8, 0, 235.0, PI / 2);
    M.b(0.9, 0.1, 0.9, 0, 0.5, 0, 0x2a2c30); M.b(0.9, 1.0, 0.1, 0, 1.05, -0.4, 0x2a2c30, -0.15); [-1, 1].forEach((a) => { M.b(0.1, 0.05, 0.7, a * 0.5, 0.82, 0.05, 0x3a3d44); M.b(0.14, 0.04, 0.12, a * 0.5, 0.86, 0.05, 0x8a2a2a); });
    M.b(0.5, 0.05, 0.5, 0, 0.1, 0.1, 0x15161a); M.pop();
    solid(R, -6.8, 235.0, 1.0, 1.0, 1.0);
    M.y(0.015, 0.015, 1.9, 6.9, 0.95, 233.0, 0x8a8f98, 6); M.b(0.5, 0.03, 0.03, 6.9, 1.9, 233.0, 0x8a8f98); M.glass((q) => q.b(0.12, 0.2, 0.06, 6.9, 1.7, 233.2, 0xcfe0ee));
    M.b(1.0, 0.8, 0.6, 6.5, 0.45, 237.0, 0x6a6d74); M.b(1.05, 0.04, 0.65, 6.5, 0.87, 237.0, 0x8a8f98); [-1, 1].forEach((a) => [-1, 1].forEach((b) => M.y(0.04, 0.04, 0.1, 6.5 + a * 0.45, 0.05, 237.0 + b * 0.25, 0x15161a, 6)));
    solid(R, 6.5, 237.0, 1.05, 0.65, 0.9);
    // дверь 083 (на z = zd) и тёмная каморка за ней
    R.door = bigDoor(R, g, az1, 2.1, 3.5, '083', { col: 0x24272c });
    R.door.set(0);
    r.box(0, -0.05, az1 + 4, 5.2, 0.1, 8, 0x2a2c30, false); r.box(0, 3.9, az1 + 4, 5.2, 0.1, 8, 0x15161a, false);
    wv(R, -2.5, az1, az1 + 8, 3.8); wv(R, 2.5, az1, az1 + 8, 3.8); wh(R, az1 + 8, -2.5, 2.5, 3.8);
    M.glow((q) => q.b(0.3, 0.1, 0.06, 0, 3.6, az1 + 7.8, 0xff2a1a));
    // ---- данные для сценария
    R.arrive = [0, -1.6, PI];
    R.doorAt = [0, az1 - 1.0];
    R.beaconAt = [0, az1 - 4.6];
    R.secOf = (z) => Math.max(0, Math.min(D.n - 1, Math.floor((z - D.z0) / D.seg)));
    R.bounds = { cx: 0, cz: 125, w: 56, d: 262, h: 6 };
    R.onEnter = (Rg, w) => { w.r.scene.background = new THREE.Color(0x07080a); };
    R.halos.forEach((hh) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: F.glowTex(), color: hh[3], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45, fog: false })); sp.position.set(hh[0], hh[1], hh[2]); sp.scale.setScalar(hh[4]); g.add(sp); hh.sp = sp; });
    R.tick = (t, alarm) => {
      R.pulse.forEach((p) => {
        const sp = p.h && p.h.sp; if (!sp) return;
        if (p.alarm) { sp.material.opacity = alarm || R.siren ? 0.2 + 0.7 * (0.5 + 0.5 * Math.sin(t * 6 + p.ph)) : 0.15; return; }
        if (p.fl) { const f = Math.sin(t * p.f + p.ph) * Math.sin(t * p.f * 2.7 + p.ph * 1.3); sp.material.opacity = f > 0.55 ? 0.08 : 0.45; return; }
      });
      if (R.door && R.door.lamp) R.door.lamp.material.opacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.4));
    };
  }

  // ------------------------------------------------------------------ ТЁМНЫЙ КОРИДОР за дверью 083: до двери «HEAD»
  const DK = { z0: 246, z1: 300, hw: 2.1, h: 3.5 };
  function buildDark(R, g) {
    const r = R.world.r, M = R.D, hw = DK.hw, h = DK.h, zc = (DK.z0 + DK.z1) / 2, L = DK.z1 - DK.z0;
    R.lampPos = []; R.halos = []; R.pulse = [];
    r.box(0, -0.05, zc, hw * 2 + 0.6, 0.1, L + 0.6, 0x2c2e32, false); r.box(0, h + 0.05, zc, hw * 2 + 0.6, 0.1, L + 0.6, 0x181a1e, false);
    wv(R, -hw, DK.z0, DK.z1, h); wv(R, hw, DK.z0, DK.z1, h); wh(R, DK.z1, -hw, hw, h, [[-1.7, 1.7]]); wh(R, DK.z0, -hw, hw, h, [[-2.1, 2.1]]);
    // выломанная дверь 083 у входа (створка лежит на полу)
    M.b(1.0, 3.5, 1.1, -2.6, 1.75, DK.z0 - 0.1, 0x24272c); M.b(1.0, 3.5, 1.1, 2.6, 1.75, DK.z0 - 0.1, 0x24272c); M.b(5.2, 0.7, 1.1, 0, 3.85, DK.z0 - 0.1, 0x24272c);
    M.b(3.9, 0.3, 4.0, 0.6, 0.18, DK.z0 + 2.2, 0x3c4048, 0.06, 0.4, 0.22);   // без коллайдера: игрок встаёт прямо на створке, а blocked() не знает про высоту — стоял бы заперт внутри
    // камеры-«клетки» объектов: двери по сторонам с номерами и узкими окошками
    for (let i = 0; i < 6; i += 1) [-1, 1].forEach((s) => {
      const z = DK.z0 + 8 + i * 7.3 + (s > 0 ? 3.6 : 0), num = (s < 0 ? 80 - i : 84 + i);
      M.b(0.2, 2.5, 1.5, s * (hw - 0.1), 1.25, z, 0x3a3d44); M.b(0.06, 0.34, 0.5, s * (hw - 0.22), 1.9, z, 0x0a0a0c);
      M.glow((q) => q.b(0.02, 0.26, 0.4, s * (hw - 0.26), 1.9, z, i % 3 === 0 ? 0xff2a1a : 0x1a2230));
      const sg = F.sign(String(num).padStart(3, '0'), 0.7, 0.26, { bg: '#0e0f12', fg: '#c8c8c8', edge: '#333' }); sg.position.set(s * (hw - 0.27), 2.45, z); sg.rotation.y = s > 0 ? -PI / 2 : PI / 2; g.add(sg);
    });
    // трубы, висящие панели, кабели
    pipeRun(M, -1.5, 3.1, DK.z0, DK.z1, 0.09, 0x3a3d42); pipeRun(M, 1.6, 3.2, DK.z0, DK.z1, 0.06, 0x4a3a32);
    for (let i = 0; i < 9; i += 1) { const z = DK.z0 + 4 + i * 5.7; M.b(1.0, 0.04, 1.2, (i % 3 - 1) * 0.6, 3.3 - (i % 2) * 0.15, z, 0x34363a, 0.3 * (i % 2 ? 1 : -1), 0, 0.2); M.y(0.01, 0.01, 0.8, (i % 3 - 1) * 0.5, 3.1, z + 0.4, 0x15161a, 4); }
    M.glass((q) => { for (let i = 0; i < 6; i += 1) q.b(1.2 + (i % 3) * 0.4, 0.012, 1.8, (i % 3 - 1) * 0.7, 0.014, DK.z0 + 9 + i * 8.3, 0x4a6a8a); });   // лужи
    // редкие красные аварийные лампы
    for (let i = 0; i < 5; i += 1) {
      const z = DK.z0 + 6 + i * 11; M.b(0.3, 0.3, 0.3, 0, h - 0.15, z, 0x15161a); M.glow((q) => q.b(0.2, 0.2, 0.2, 0, h - 0.3, z, 0xff2a1a));
      R.halos.push([0, h - 0.4, z, 0xff2a1a, 4.6]); R.lampPos.push([0, h - 0.8, z]);
    }
    // дверь «HEAD»: чёрная створка, золотые буквы, две красные лампы, рамка
    const zh = DK.z1;
    M.b(0.7, 3.6, 0.9, -1.95, 1.8, zh, 0x1a1a1e); M.b(0.7, 3.6, 0.9, 1.95, 1.8, zh, 0x1a1a1e); M.b(4.6, 0.7, 0.9, 0, 3.6, zh, 0x1a1a1e);
    M.b(3.4, 3.1, 0.2, 0, 1.55, zh + 0.2, 0x0e0e10); M.b(3.1, 2.8, 0.06, 0, 1.55, zh - 0.05, 0x17171a);
    for (let i = 0; i < 4; i += 1) M.b(3.0, 0.06, 0.07, 0, 0.5 + i * 0.7, zh - 0.1, 0x6a5624);
    M.b(0.2, 0.8, 0.12, 1.3, 1.5, zh - 0.18, 0xb08a3a);
    M.glow((q) => { q.b(0.3, 0.3, 0.06, -1.4, 3.35, zh - 0.5, 0xff2a1a); q.b(0.3, 0.3, 0.06, 1.4, 3.35, zh - 0.5, 0xff2a1a); });
    R.halos.push([-1.4, 3.35, zh - 0.9, 0xff2a1a, 3], [1.4, 3.35, zh - 0.9, 0xff2a1a, 3]);
    const hd = F.sign('HEAD', 2.6, 0.9, { bg: '#0c0c0e', fg: '#d9b25a', edge: '#b08a3a' }); hd.position.set(0, 2.9, zh - 0.12); hd.rotation.y = PI; g.add(hd);
    R.headDoor = solid(R, 0, zh, 3.6, 0.5, 3.4);
    R.headAt = [0, zh - 1.4];
    R.arrive = [0, DK.z0 + 1.6, PI];
    R.bounds = { cx: 0, cz: zc, w: 8, d: L + 4, h: 4 };
    R.onEnter = (Rg, w) => { w.r.scene.background = new THREE.Color(0x030305); };
    R.halos.forEach((hh) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: F.glowTex(), color: hh[3], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, fog: false })); sp.position.set(hh[0], hh[1], hh[2]); sp.scale.setScalar(hh[4]); g.add(sp); hh.sp = sp; });
    R.tick = (t) => { R.halos.forEach((hh, i) => { if (hh.sp && i < 5) { const f = Math.sin(t * (3 + i) + i * 2) * Math.sin(t * 8.3 + i); hh.sp.material.opacity = f > 0.6 ? 0.1 : 0.5; } }); };
  }

  F.regions5 = function (w) {
    const A = w.def('deep', { build: buildDeep, surf: ['concrete', 'concrete', 'concrete_dark'], amb: 0.7, fogK: 0.55, fogC: 0x0a0c10, lampCol: 0xfff0d6, lampI: 0.85, lampD: 16, seed: 91 });
    const B = w.def('dark', { build: buildDark, surf: ['concrete_wet', 'concrete_dark', 'concrete_dark'], amb: 0.22, fogK: 1.1, fogC: 0x050507, lampCol: 0xff4a30, lampI: 0.7, lampD: 11, seed: 92 });
    [A, B].forEach((R) => { R.world = w; });
  };
  F.DEEP = D; F.DARK = DK;
}());
