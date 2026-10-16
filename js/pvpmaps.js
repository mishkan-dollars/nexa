// NEXA: карты PvP (js/pvp.js) из примитивов движка (r.box / r.room / r.wallH / r.crate …, коллайдеры как у миссий). Всё детерминировано — без Math.random, чтобы у всех клиентов мир совпал.
// depot — склад: контейнеры, ящики, мостки (визуальные, пройти под ними можно); lab — лаборатория: комнаты 3×3 с дверными проёмами; roof — крыша: далёкие дистанции, вентблоки, парапет;
// hall — зал песочницы; yard — первый участок миссии 20. sp — точки спауна, it — предметы [x, z, тип] (0 патроны, 1 аптечка, 2 оружие + id), b — границы.
// PvpMaps.load(r, имя) строит карту и запоминает всё созданное, PvpMaps.unload(r, h) убирает (реванш на другой карте в том же матче). Мало материалов (кэш по цвету), без постобработки.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.Run) return;
  const MIS = C.MISSIONS, RED = 0xef4b45, DRED = 0x8a2a27;
  const M = {};

  M.depot = {
    n: 'DEPOT', b: { x0: -18.5, x1: 18.5, z0: -13.5, z1: 13.5 },
    build(r) {
      r.room(0, 0, 40, 30, 7.5, 0x4a4a4a); r.bound(0, 0, 40, 30, 7.5); r.mood(0.8, 0.5, 0x1c1c1c);
      [-14, -5, 5, 14].forEach((x) => [-8, 8].forEach((z) => r.lamp(x, 7.3, z, 0.85)));
      r.markFloor(-10, 0, 0.25, 28, 0xc8c8c8); r.markFloor(10, 0, 0.25, 28, 0xc8c8c8); r.markFloor(0, 0, 18, 0.25, DRED);
      const box = (x, z, w, d, c, y) => r.box(x, 1.3 + (y || 0), z, w, 2.6, d, c, true);
      box(-12, -6, 6, 2.4, 0x5a1f1d); box(-12, -10.5, 6, 2.4, 0x3a3a3a); box(12, -6, 6, 2.4, 0x3a3a3a); box(12, -10.5, 6, 2.4, 0x5a1f1d);
      box(-12, -6, 6, 2.4, 0x6a2a28, 2.6); box(12, -10.5, 6, 2.4, 0x6a2a28, 2.6);
      box(-12, 7, 2.4, 6, 0x4a4a4a); box(12, 7, 2.4, 6, 0x5a1f1d);
      r.crate(0, -3, 2, 2, 1.2, 0x6a5a3a); r.crate(1.8, -3, 1.4, 1.4, 0.9, 0x5a4a2a); r.crate(-1.5, 3.2, 2, 1.4, 1.2, 0x6a5a3a);
      r.pillar(-7, 2, 1, 1, 0x6a6a6a); r.pillar(7, -2, 1, 1, 0x6a6a6a); r.pillar(0, 10, 1.2, 1.2, 0x6a6a6a);
      [-12.6, 12.6].forEach((z) => {
        r.box(0, 3.6, z, 32, 0.2, 1.8, 0x333333, false); r.box(0, 4.3, z + (z < 0 ? 0.85 : -0.85), 32, 0.08, 0.08, RED, false, true);
        for (let x = -16; x <= 16; x += 8) r.box(x, 1.8, z, 0.3, 3.6, 0.3, 0x2a2a2a, false);
      });
      for (let i = 0; i < 6; i += 1) r.box(17.6, 0.3 + i * 0.6, -8.5 - i * 0.6, 1.6, 0.6, 0.6, 0x3a3a3a, false);
      r.strip(0, 6.9, -14.6, 38, 0.2, 0.1, DRED); r.strip(0, 6.9, 14.6, 38, 0.2, 0.1, DRED);
    },
    sp: [[-17, -12], [0, -12.5], [17, -12], [-17, 1], [17, 1], [-17, 12], [0, 12.5], [17, 12], [-4, -1], [4, 6]],
    it: [[-3, -8.5, 0], [3, 8.5, 0], [-17, -6, 0], [17, 6, 0], [0, 0.5, 1], [-9, 0, 1], [9, 0, 1], [-8, 8, 2, 'shotgun'], [8, -8, 2, 'sniper']]
  };

  M.lab = {
    n: 'LAB', b: { x0: -17, x1: 17, z0: -17, z1: 17 },
    build(r) {
      r.room(0, 0, 36, 36, 3.4, 0xb4b4b4); r.bound(0, 0, 36, 36, 3.4); r.mood(0.95, 0.35, 0x20262a);
      const g = [[-14, -10], [-2, 2], [10, 14]], W = 0x9a9a9a;
      r.wallH(-6, -18, 18, 3.4, W, g); r.wallH(6, -18, 18, 3.4, W, g); r.wallV(-6, -18, 18, 3.4, W, g); r.wallV(6, -18, 18, 3.4, W, g);
      [-12, 0, 12].forEach((x) => [-12, 0, 12].forEach((z) => r.lamp(x, 3.3, z, 0.8)));
      r.crate(-15, -9, 3, 1.2, 0.9, 0x555555); r.crate(15, -9, 3, 1.2, 0.9, 0x555555); r.crate(-9, 15, 1.2, 3, 0.9, 0x555555); r.crate(9, -15, 1.2, 3, 0.9, 0x555555);
      r.crate(-15, 9, 3, 1.2, 0.9, 0x666666); r.crate(15, 9, 3, 1.2, 0.9, 0x666666);
      [[-9, -14], [9, 14], [-14, 9], [14, -9], [-16, -16], [16, 16]].forEach((p) => { r.box(p[0], 1.2, p[1], 0.8, 2.4, 0.8, 0x3a3a3a, true); r.strip(p[0], 2.45, p[1], 0.8, 0.08, 0.8, RED); });
      r.pillar(0, 0, 1.6, 1.6, 0xa0a0a0);
      [[0, -6, 4, 0.3], [0, 6, 4, 0.3], [-6, 0, 0.3, 4], [6, 0, 0.3, 4]].forEach((m) => r.markFloor(m[0], m[1], m[2], m[3], RED));
      [-12, 12].forEach((x) => [-12, 12].forEach((z) => r.markFloor(x, z, 5, 0.12, 0xdddddd)));
    },
    sp: [[-12, -12], [12, -12], [-12, 12], [12, 12], [0, -13], [0, 13], [-14, 0], [14, 0], [-3.5, 3.5], [3.5, -3.5]],
    it: [[-9, -3, 0], [9, 3, 0], [-3, -10, 0], [3, 10, 0], [-12, 1, 1], [12, -1, 1], [0, 3, 1], [-16, -12, 2, 'shotgun'], [16, 12, 2, 'ak']]
  };

  M.roof = {
    n: 'ROOF', b: { x0: -20.5, x1: 20.5, z0: -15, z1: 15 },
    build(r) {
      r.slab(0, 0, 44, 32, 0, 0x4a4a4a, { open: true }); r.bound(0, 0, 44, 32, 10); r.mood(0.95, 0.5, 0x3a3a3a);
      [[0, -16.2, 44.8, 0.4], [0, 16.2, 44.8, 0.4], [-22.2, 0, 0.4, 32.8], [22.2, 0, 0.4, 32.8]].forEach((p) => {
        r.box(p[0], 0.55, p[1], p[2], 1.1, p[3], 0x6a6a6a, true);
        const w = r.box(p[0] * 1.03, 4, p[1] * 1.03, p[2], 8, p[3], 0x000000, true); w.visible = false;
      });
      const hv = (x, z, w, d) => { r.box(x, 1, z, w, 2, d, 0x707070, true); r.strip(x, 2.05, z, w * 0.45, 0.05, d * 0.45, 0x222222); };
      hv(-8, -6, 4, 2.6); hv(10, 6, 4, 2.6); hv(-14, 8, 2.6, 4); hv(14, -8, 2.6, 4);
      r.crate(0, -9, 6, 0.6, 0.7, 0x555555); r.crate(0, 9, 6, 0.6, 0.7, 0x555555);
      r.box(18, 1.8, 0, 4, 3.6, 6, 0x5a5a5a, true); r.strip(15.95, 1.2, 0, 0.05, 2.2, 1.2, RED);
      r.box(-17, 2.2, -1, 4, 4.4, 4, 0x6a6a6a, true);
      r.pillar(-2, 0, 0.5, 0.5, 0x333333); r.strip(-2, 3.2, 0, 0.4, 0.4, 0.4, RED);
      r.crate(-4, 5, 3, 0.5, 1.1, 0x777777); r.crate(5, -4, 3, 0.5, 1.1, 0x777777); r.crate(6, 10, 0.5, 3, 1.1, 0x777777); r.crate(-6, -11, 0.5, 3, 1.1, 0x777777);
      r.markFloor(0, 0, 8, 5, 0x303030); r.markFloor(0, 0, 8.4, 0.12, 0xdddddd);
      [[-10, 5], [10, -5], [0, -13], [0, 13]].forEach((p) => { r.box(p[0], 2, p[1], 0.2, 4, 0.2, 0x2a2a2a, false); r.lamp(p[0], 4.2, p[1], 0.9); });
      for (let i = 0; i < 16; i += 1) { const a = i / 16 * Math.PI * 2, x = Math.cos(a) * 38, z = Math.sin(a) * 30, h = 8 + (i * 7 % 5) * 5; r.box(x, h / 2 - 6, z, 7 + i % 3 * 2, h + 12, 7, 0x0e0e0e, false, true); if (i % 4 === 0) r.strip(x, h - 2, z - 3.6, 3, 0.2, 0.05, RED); }
    },
    sp: [[-19, -13], [19, -13], [-19, 13], [19, 13], [0, -12.5], [0, 12.5], [-12, 1], [12, -1], [-5, -8], [5, 8]],
    it: [[-6, 3, 0], [6, -3, 0], [-11, -11, 0], [11, 11, 0], [0, -6, 1], [0, 6, 1], [-20, -6, 2, 'sniper'], [20, 7, 2, 'ak']]
  };

  M.hall = { n: 'HALL', b: { x0: -9.5, x1: 9.5, z0: -45, z1: 18 }, build(r) { MIS.sandbox.build(r); } };
  M.yard = {
    n: 'YARD', build(r) { MIS[20].build(r); },
    bf(r) { const s = r.mm && r.mm.secs && r.mm.secs[0]; if (!s) return { x0: -9.5, x1: 9.5, z0: -45, z1: 18 }; const hw = s.W / 2 - 1.6; return { x0: -hw, x1: hw, z0: s.zB + 1.6, z1: s.zA - 1.6 }; }
  };

  const POOL = ['depot', 'lab', 'roof', 'hall'];
  function load(r, name) {
    const m = M[name] || M.hall, n0 = r.scene.children.length, c0 = r.colliders.length, l0 = r.lamps.length, had = !!r.cb;
    const comb = r.combat; if (had) r.combat = function () { return this; };
    try { if (!had && name !== 'hall' && name !== 'yard') r.combat(); m.build(r); } finally { if (had) delete r.combat; }
    return { name, n0, c0, l0, ch: r.scene.children.slice(n0), cols: r.colliders.slice(c0), lamps: r.lamps.slice(l0), b: m.bf ? m.bf(r) : m.b, sp: m.sp, it: m.it };
  }
  function unload(r, h) {
    if (!h) return;
    h.ch.forEach((o) => { if (o.parent) o.parent.remove(o); });
    h.cols.forEach((c) => { const i = r.colliders.indexOf(c); if (i >= 0) r.colliders.splice(i, 1); });
    h.lamps.forEach((l) => { const i = r.lamps.indexOf(l); if (i >= 0) r.lamps.splice(i, 1); });
  }
  window.PvpMaps = { M, POOL, load, unload, names: Object.keys(M) };
}());
