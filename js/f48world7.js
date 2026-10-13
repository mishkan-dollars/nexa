// NEXA: миссия 48 — разрушаемое здание комплекса NEXA для финала (регион 'plaza' = двор f48world2.js без фасада).
// Фасад = 54 панели (18 пролётов × 3 этажа) + парапет + вход с раздвижными дверями + вывеска; за ним три уровня интерьера
// (колонны, перекрытия, столы с мониторами, потолочные лампы), крыша с оборудованием. Взрыв и обрушение — js/f48blast.js (R.tw).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.Mk || !C.f48.w2 || !C.f48.vcMat || !C.f48.rng) return;
  const F = C.f48, PI = Math.PI, { hex } = F.w2;
  const FLOORS = [0, 5.6, 11.0], TOP = 16.0, ZF = -29.55, ZB = -52, XW = 31, NB = 18, BW = 62 / NB;
  F.TOWER = { floors: FLOORS, top: TOP, zf: ZF, zb: ZB, xw: XW, nb: NB, bw: BW };
  const WIN = [[3.6, 2.2], [8.2, 2.1], [13.3, 2.0]];                                // центр и высота окон по этажам
  const WARM = [0xffd9a0, 0xffc880, 0xfff0cc, 0xbfe1ff, 0x9ecbff];

  // уровень интерьера k: пол (перекрытие), колонны, столы с мониторами, перегородки, потолочные лампы, боковые и задняя стены; уровень 2 ещё и с крышей
  function buildLevel(k, rand) {
    const M = new F.Mk(), H = (k < 2 ? FLOORS[k + 1] : TOP) - FLOORS[k], cz = (ZF + ZB) / 2 - 0.2, dz = ZF - ZB - 0.2;
    M.b(2 * XW + 0.6, 0.5, dz + 0.4, 0, k === 0 ? 0.0 : -0.25, cz, 0x3a3b40);                // перекрытие под уровнем
    [-1, 1].forEach((s) => M.b(0.5, H + (k === 2 ? 0.5 : 0), dz + 0.4, s * (XW + 0.05), (H + (k === 2 ? 0.5 : 0)) / 2, cz, 0x4a3a34));   // боковые стены
    M.b(2 * XW + 0.6, H + (k === 2 ? 0.5 : 0), 0.5, 0, (H + (k === 2 ? 0.5 : 0)) / 2, ZB - 0.2, 0x4a3a34);                                  // задняя стена
    for (let x = -27; x <= 27; x += 9) for (let z = -34; z >= -48; z -= 7) {
      M.b(0.7, H, 0.7, x, H / 2, z, 0x5a5b60); M.b(0.9, 0.3, 0.9, x, H - 0.15, z, 0x4a4b50); M.b(0.84, 0.5, 0.84, x, 0.25, z, 0x3a3b40);
    }
    // потолочные лампы
    for (let x = -26; x <= 26; x += 8.667) for (let z = -33; z >= -49; z -= 4) {
      M.b(2.4, 0.08, 0.3, x, H - 0.1, z, 0x2a2b2e);
      M.glow((q) => q.b(2.2, 0.02, 0.22, x, H - 0.15, z, rand() < 0.15 ? 0x6a6050 : 0xfff0d0));
    }
    // столы: ряды, мониторы со свечением, стулья
    for (let z = -36; z >= -48; z -= 3.6) for (let x = -28; x <= 28; x += 4.2) {
      if (rand() < 0.1) continue;
      M.b(1.7, 0.06, 0.8, x, 0.74, z, 0x8a6a40); M.b(0.06, 0.72, 0.7, x - 0.8, 0.36, z, 0x2a2b2e); M.b(0.06, 0.72, 0.7, x + 0.8, 0.36, z, 0x2a2b2e);
      M.b(0.5, 0.34, 0.04, x, 1.05, z - 0.18, 0x15161a); M.b(0.1, 0.18, 0.1, x, 0.86, z - 0.18, 0x15161a);
      M.glow((q) => q.b(0.44, 0.28, 0.01, x, 1.06, z - 0.15, rand() < 0.5 ? 0x6aa0d0 : 0x88c0a0));
      M.b(0.5, 0.06, 0.5, x + rand() * 0.2 - 0.1, 0.5, z + 0.7, 0x1c1d20); M.b(0.46, 0.5, 0.06, x, 0.78, z + 0.94, 0x1c1d20);
    }
    // перегородки между зонами
    for (let i = 0; i < 6; i += 1) {
      const len = 5 + rand() * 8, x = -26 + rand() * 52, z = -34 - rand() * 14;
      M.b(len, Math.min(H, 3.2), 0.18, x, Math.min(H, 3.2) / 2, z, 0x8a8a90); M.glass((q) => q.b(len, 1.2, 0.04, x, 2.4, z + 0.1, 0xaec2d4));
    }
    // шахта лифта и лестница в центре
    M.b(5.2, H, 0.4, 0, H / 2, -50.6, 0x6a6c72);
    if (k === 2) {                                                                          // крыша: оборудование, мачта с красным огнём
      M.b(2 * XW + 0.6, 0.5, dz + 0.4, 0, H + 0.25, cz, 0x2e2f33);
      [[-20, -38, 4.2, 1.6, 3.2], [8, -36, 3.6, 1.4, 2.6], [22, -42, 5.2, 1.8, 3.8], [-6, -46, 3, 1.2, 2.2]].forEach((u) => { M.b(u[2], u[3], u[4], u[0], H + 0.5 + u[3] / 2, u[1], 0x6a6c72); M.b(u[2] - 0.2, 0.08, u[4] - 0.2, u[0], H + 0.5 + u[3] + 0.04, u[1], 0x4a4c52); M.y(0.5, 0.5, 0.2, u[0], H + 0.5 + u[3] + 0.18, u[1], 0x2a2b2e, 12); });
      M.y(0.06, 0.1, 9, 12, H + 0.5 + 4.5, -44, 0x3a3c40, 8);
      M.glow((q) => q.b(0.3, 0.3, 0.3, 12, H + 0.5 + 9.1, -44, 0xff2a1a));
    }
    const grp = M.build({ cull: false });
    grp.position.set(0, FLOORS[k], 0);
    grp.userData.H = H;
    return grp;
  }

  F.buildTower = function (R, g) {
    const r = R.world.r, T = THREE, rand = F.rng(91);
    // перемычка над «проёмом» на всю ширину северной стены двора (F.shell с gap) — здесь не нужна
    g.children.slice().forEach((o) => { if (o.isMesh && Math.abs(o.position.z + 30) < 0.01 && o.scale.x > 50 && o.position.y > 3) g.remove(o); });
    R.cols.push({ x0: -XW - 0.3, x1: XW + 0.3, z0: ZB - 0.3, z1: ZF + 0.25, y0: 0, y1: TOP + 1 });                        // корпус здания непроходим (внутрь не заходим)
    const TW = R.tw = { g: new T.Group(), panels: [], levels: [], extras: [], R };
    TW.g.name = 'tower'; g.add(TW.g);
    const heightOf = (fi) => (fi < 2 ? FLOORS[fi + 1] : TOP) - FLOORS[fi];
    const addPanel = (grp, o) => {
      grp.position.set(o.x, o.y, o.z); grp.userData.base = { x: o.x, y: o.y, z: o.z };
      TW.g.add(grp);
      const p = Object.assign({ g: grp, base: grp.position.clone(), v: new T.Vector3(), w: new T.Vector3(), fly: false, rest: false, scorch: 0 }, o);
      TW.panels.push(p);
      return p;
    };
    // ---- панели фасада
    for (let fi = 0; fi < 3; fi += 1) {
      const fh = heightOf(fi), cy = FLOORS[fi] + fh / 2;
      for (let bi = 0; bi < NB; bi += 1) {
        if (fi === 0 && (bi === 8 || bi === 9)) continue;                                   // здесь вход
        const cx = -XW + (bi + 0.5) * BW, M = new F.Mk();
        M.b(BW - 0.01, fh, 0.5, 0, 0, 0, hex(0x4a3a34, 0.88 + rand() * 0.2));
        M.b(BW + 0.02, 0.34, 0.62, 0, fh / 2 - 0.17, 0.06, 0x3a3c42);
        if (fi === 0) M.b(BW - 0.01, 1.3, 0.56, 0, -fh / 2 + 0.65, 0.03, 0x5c5e64);
        if (bi % 2 === 0) M.b(0.8, fh, 0.62, -BW / 2 + 0.4, 0, 0.06, 0x44464c);
        if (bi === NB - 1) M.b(0.8, fh, 0.62, BW / 2 - 0.4, 0, 0.06, 0x44464c);
        const wy = WIN[fi][0], wh = WIN[fi][1], ly = wy - cy;
        M.b(2.5, wh, 0.1, 0, ly, 0.22, 0x0e1014);
        M.b(0.06, wh, 0.05, 0, ly, 0.29, 0x15161a);
        M.b(2.62, 0.06, 0.12, 0, ly - wh / 2 - 0.03, 0.3, 0x2a2b2e);
        if (fi === 0) for (let b = 0; b < 4; b += 1) M.b(0.03, wh, 0.03, -0.9 + b * 0.6, ly, 0.31, 0x1a1a1c);
        const grp = M.build({ cull: false });
        const on = rand() < (fi === 0 ? 0.35 : 0.5), wc = WARM[Math.floor(rand() * WARM.length)], kk = 0.35 + rand() * 0.5;
        const colr = on ? hex(wc, kk) : 0x1c2430;
        const glass = new T.Mesh(r.g.box, new T.MeshBasicMaterial({ color: colr }));
        glass.scale.set(2.34, wh - 0.14, 0.02); glass.position.set(0, ly, 0.275); grp.add(glass);
        const p = addPanel(grp, { x: cx, y: cy, z: ZF - 0.25, fi, bi, hw: BW / 2, hh: fh / 2, hd: 0.25, glass, win: { on, color: colr, wy: ly } });
        p.solid = grp.solid;
      }
    }
    // ---- парапет
    for (let bi = 0; bi < NB; bi += 1) {
      const cx = -XW + (bi + 0.5) * BW, M = new F.Mk();
      M.b(BW - 0.01, 1.0, 0.5, 0, 0, 0, 0x3a3c42); M.b(BW + 0.02, 0.14, 0.7, 0, 0.5, 0.06, 0x2a2b30);
      const p = addPanel(M.build({ cull: false }), { x: cx, y: TOP + 0.5, z: ZF - 0.25, fi: 3, bi, hw: BW / 2, hh: 0.5, hd: 0.25 });
      p.solid = p.g.solid;
    }
    // ---- вход: простенки, перемычка, козырёк с лампами, лобби за стеклом, две створки раздвижных дверей
    {
      const M = new F.Mk(), H0 = heightOf(0), DW = 4.9, DH = 3.9;
      [-1, 1].forEach((s) => { M.b((2 * BW - DW) / 2, H0, 0.5, s * (DW / 2 + (2 * BW - DW) / 4), 0, 0, 0x4a3a34); M.b(0.9, H0, 0.62, s * (BW - 0.45), 0, 0.06, 0x44464c); });
      M.b(2 * BW, H0 - DH, 0.5, 0, DH / 2 + 0.0 + (H0 - DH) / 2 - H0 / 2 + 0.0, 0, 0x4a3a34);
      M.b(2 * BW + 0.02, 0.34, 0.62, 0, H0 / 2 - 0.17, 0.06, 0x3a3c42);
      M.b(DW + 0.3, 0.2, 0.34, 0, -H0 / 2 + DH + 0.1, 0.12, 0x1c1d20);                      // рама над дверями
      M.b(DW + 0.3, 0.1, 0.34, 0, -H0 / 2 + 0.05, 0.12, 0x1c1d20);                           // порог
      M.b(6.8, 0.22, 2.6, 0, -H0 / 2 + DH + 0.62, 1.4, 0x2a2b30);                            // козырёк
      M.b(6.8, 0.1, 0.1, 0, -H0 / 2 + DH + 0.45, 2.6, 0x15161a);
      M.glow((q) => { for (let i = 0; i < 4; i += 1) q.b(0.5, 0.03, 0.5, -2.4 + i * 1.6, -H0 / 2 + DH + 0.5, 1.5, 0xfff0d0); });
      M.glow((q) => q.b(DW, DH, 0.02, 0, -H0 / 2 + DH / 2, -0.15, 0xffe2b0));              // лобби: светящаяся стена за дверями
      const grp = M.build({ cull: false });
      const gm = new T.MeshBasicMaterial({ color: 0x1a2a3a, transparent: true, opacity: 0.38, depthWrite: false });
      const leaves = [-1, 1].map((s) => { const m = new T.Mesh(r.g.box, gm); m.scale.set(DW / 2 - 0.02, DH - 0.12, 0.03); m.position.set(s * DW / 4, -H0 / 2 + DH / 2 + 0.05, 0.27); grp.add(m); m.userData.x0 = s * DW / 4; m.userData.s = s; return m; });
      const p = addPanel(grp, { x: 0, y: H0 / 2, z: ZF - 0.25, fi: 0, bi: 8.5, hw: BW, hh: H0 / 2, hd: 0.25, door: leaves, entrance: true });
      p.solid = grp.solid; TW.door = { leaves, k: 0, DW };
      TW.door.set = (k) => { TW.door.k = k; leaves.forEach((m) => { m.position.x = m.userData.x0 + m.userData.s * k * (DW / 2 - 0.02) * 0.92; }); };
    }
    // ---- вывеска и её ореол
    {
      const sg = F.sign('NEXA  INDUSTRIES', 14, 1.5, { bg: '#0d0f12', fg: '#eceef2', edge: '#cf3030' });
      sg.position.set(0, 14.95, ZF + 0.08); TW.g.add(sg);
      const hs = new T.Sprite(new T.SpriteMaterial({ map: F.glowTex(), color: 0xff4a3a, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.5, fog: false }));
      hs.position.set(0, 14.95, ZF + 1.2); hs.scale.set(20, 6, 1); TW.g.add(hs);
      TW.sign = { m: sg, halo: hs, base: sg.position.clone(), v: new T.Vector3(), w: new T.Vector3(), fly: false, hw: 7, hh: 0.75, hd: 0.03 };
    }
    // ---- интерьер: три уровня
    for (let k = 0; k < 3; k += 1) { const L = buildLevel(k, rand); TW.g.add(L); TW.levels.push(L); L.userData.y0 = FLOORS[k]; }
    // ---- светящийся «проём» неба за зданием не нужен: интерьер ограничен задней стеной
    TW.interior = (v) => { TW.levels.forEach((L) => { L.visible = v; }); };
    TW.interior(false);
    // ---- освещение сверху фасада: прожектор на карнизе
    const spot = (x) => { const m = new T.Mesh(r.g.box, r.basic(0xdfeaff)); m.scale.set(0.5, 0.04, 0.3); m.position.set(x, 5.0, ZF + 0.65); TW.g.add(m); };
    [-4, 8].forEach(spot);
    TW.reset = function () {
      TW.panels.forEach((p) => { p.g.position.copy(p.base); p.g.rotation.set(0, 0, 0); p.g.visible = true; p.fly = false; p.rest = false; p.v.set(0, 0, 0); p.scorch = 0; if (p.solid) p.solid.material.color.setScalar(1); if (p.glass) { p.glass.material.color.setHex(p.win.color); p.glass.visible = true; } });
      TW.levels.forEach((L) => { L.position.set(0, L.userData.y0, 0); L.rotation.set(0, 0, 0); L.scale.set(1, 1, 1); });
      TW.interior(false);
      TW.sign.m.position.copy(TW.sign.base); TW.sign.m.rotation.set(0, 0, 0); TW.sign.m.visible = true; TW.sign.halo.visible = true; TW.sign.fly = false;
      TW.door.set(0);
    };
  };
}());
