// NEXA: 3D-реквизит миссий (assets/models/props/*.glb, собраны tools/pipeline). Модуль необязательный: нет файлов — игра работает как раньше.
// Что делает: грузит модели нужной темы, подменяет визуал ламп / бочек / предметов (коллайдеры и логика остаются прежними)
// и расставляет мебель/оборудование вдоль стен после построения мира (dress), не перегораживая проходы.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C) return;
  const { Run, MISSIONS } = C;
  const P = Run.prototype;
  const BASE = 'assets/models/props/';
  const PI = Math.PI;
  const ALARM_YAW = 0; // перед моделей — +Z (проверено tools/pipeline/orient.html)

  // ---------------------------------------------------------------- темы
  const FIXED = { 7: 'bunker', 8: 'bunker', 9: 'industrial', 10: 'bunker', 11: 'office', 12: 'metro', 13: 'industrial', 14: 'office', 15: 'lab', 16: 'lab', 47: 'vault' };
  const themeOf = (id) => FIXED[id] || (MISSIONS[id] && MISSIONS[id].theme) || null;

  const W = (n, w, o) => Object.assign({ n, w }, o || {});
  const DESK = W('office_desk', 4, { extras: [['office_chair', 0, 0.12, PI, false]], on: [['crt_monitor', -0.28, 0.777, 0, 1], ['computer_tower', 0.34, 0.777, 0, 1]], reserve: 0.7 });
  const AMMO = (w) => W('ammo_crate', w, { on: [['smoke', 0, 0.55, 0.5, 1]] });
  const LABT = (w) => W('lab_table', w, { rot: 1, on: [['centrifuge', -0.28, 1.04, 0, 0.8], ['specimen_jar', 0.3, 1.04, 0, 0.8]] });
  const SAND = W('sandpile', 2);
  const PACKS = {
    office:     { lamp: 'ceiling_lamp', cam: 0.5, alarm: 1, wall: [W('filing_cabinet', 3), W('copier', 1), W('water_cooler', 1), W('server_rack', 1), W('bookshelf', 1.5), W('cubicle', 1.2), DESK, DESK] },
    lab:        { lamp: 'ceiling_lamp', cam: 0.5, alarm: 1, wall: [LABT(4), W('cryo_chamber', 1.5), W('gas_cylinder', 1.5), W('biohazard_barrel', 1.2), W('server_rack', 1), W('hazmat_suit', 0.6)] },
    bunker:     { lamp: 'industrial_lamp', cam: 0.4, duct: 1, alarm: 1, wall: [W('generator', 2), AMMO(2), W('barrel', 2), W('gas_cylinder', 1), W('scrap_pile', 1), SAND] },
    industrial: { lamp: 'industrial_lamp', cam: 0.4, duct: 1, alarm: 1, wall: [W('generator', 3), W('gas_cylinder', 2), W('barrel', 2), W('scrap_pile', 1.5), W('server_rack', 1), AMMO(1)] },
    yard:       { lamp: 'industrial_lamp', wall: [W('barrel', 3), W('scrap_pile', 2), W('generator', 1), W('gas_cylinder', 1), SAND, AMMO(1)] },
    dock:       { lamp: 'industrial_lamp', alarm: 1, wall: [W('barrel', 3), W('gas_cylinder', 1), W('generator', 1), W('scrap_pile', 1), AMMO(2), SAND] },
    alley:      { lamp: 'industrial_lamp', wall: [W('barrel', 3), W('scrap_pile', 2), W('gas_cylinder', 1), AMMO(1)] },
    day:        { lamp: 'industrial_lamp', wall: [W('barrel', 2), AMMO(1), SAND, W('gas_cylinder', 1)] },
    roof:       { lamp: 'industrial_lamp', wall: [W('generator', 2), W('gas_cylinder', 1), W('barrel', 1), AMMO(1)] },
    bridge:     { lamp: 'industrial_lamp', wall: [SAND, W('barrel', 2), W('scrap_pile', 1)] },
    garage:     { lamp: 'industrial_lamp', cam: 0.5, duct: 1, alarm: 1, wall: [W('barrel', 2), W('gas_cylinder', 2), W('generator', 1), W('scrap_pile', 1), AMMO(1)] },
    metro:      { lamp: 'industrial_lamp', cam: 0.4, duct: 1, wall: [W('scrap_pile', 1), W('barrel', 1), W('generator', 1), SAND, AMMO(1)] },
    sewer:      { lamp: 'industrial_lamp', duct: 1, wall: [W('barrel', 2), W('scrap_pile', 2), W('gas_cylinder', 1)] },
    mansion:    { lamp: 'chandelier', wall: [W('bookshelf', 3), W('sofa', 2, { rot: 1 }), W('armchair', 2), DESK] },
    vault:      { lamp: 'ceiling_lamp', cam: 0.8, alarm: 1, wall:[W('server_rack', 3), W('filing_cabinet', 2), LABT(1), W('cryo_chamber', 0.6)] }
  };
  const COMMON = ['medkit', 'c4', 'frag', 'flashbang', 'ammo_crate', 'barrel_red', 'camera', 'office_chair', 'sandbag', 'duct',
    'hack_terminal', 'usb', 'hard_drive', 'keycard', 'lockpick', 'fingerprint', 'fire_alarm', 'gold_bar', 'dollars', 'duffel'];
  const namesFor = (th) => {
    const pk = PACKS[th], out = new Set(COMMON);
    out.add(pk.lamp);
    pk.wall.forEach((s) => { out.add(s.n === 'sandpile' ? 'sandbag' : s.n); (s.on || []).forEach((o) => out.add(o[0])); (s.extras || []).forEach((o) => out.add(o[0])); });
    (C.extraProps || []).forEach((n) => out.add(n)); // interiors.js: мебель комнат
    return Array.from(out);
  };

  // ---------------------------------------------------------------- загрузка
  const PROPS = {};      // name -> { scene, size }
  let idxP = null, gltfP = null;
  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
  function toLambert(root, T) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material, map = m.map || null;
      if (map) map.encoding = T.LinearEncoding; // как и остальные текстуры игры: без sRGB-декодирования
      o.material = new T.MeshLambertMaterial({ color: m.color ? m.color.clone() : 0xffffff, map, side: m.side, transparent: !!m.transparent, opacity: m.opacity === undefined ? 1 : m.opacity, alphaTest: m.alphaTest || 0 });
      m.dispose && m.dispose();
    });
  }
  C.loadProps = async function (taskId) {
    const th = themeOf(taskId), pk = th && PACKS[th];
    const names = pk ? namesFor(th) : (C.extraProps || []);           // без темы — только мебель комнат (interiors.js)
    if (!names.length) return null;
    try {
      await C.loadThree();
      const T = window.THREE;
      if (!T.GLTFLoader) await (gltfP || (gltfP = loadScript('assets/lib/GLTFLoader.js')));
      const idx = await (idxP || (idxP = fetch(BASE + 'index.json').then((r) => r.json())));
      const L = new T.GLTFLoader();
      await Promise.all(names.filter((n) => idx[n] && !PROPS[n]).map((n) => new Promise((res) => {
        L.load(BASE + n + '.glb', (g) => { toLambert(g.scene, T); PROPS[n] = { scene: g.scene, size: idx[n].size }; res(); }, undefined, () => res());
      })));
      return pk ? th : null;
    } catch (e) { console.warn('[props]', e); return null; }
  };

  // ---------------------------------------------------------------- Run.prop
  const hash = (a) => { a = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b); a ^= a >>> 13; return Math.imul(a, 0xc2b2ae35) >>> 0; };
  function mul(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  P.initProps = function (th) { this.propTheme = th && PACKS[th] ? th : null; this.propN = 0; };

  // Поставить модель name в (x, z). o: yaw, y, s (или sx/sy/sz), solid (коллайдер по габаритам), parent (Group). Возвращает Group.
  P.prop = function (name, x, z, o) {
    const tpl = PROPS[name]; if (!tpl || !this.scene) return null;
    o = o || {};
    const T = window.THREE, g = new T.Group(), inst = tpl.scene.clone(true);
    g.add(inst);
    const sx = o.sx || o.s || 1, sy = o.sy || o.s || 1, sz = o.sz || o.s || 1;
    g.scale.set(sx, sy, sz);
    if (o.rx) g.rotation.order = 'YXZ', g.rotation.x = o.rx;
    g.rotation.y = o.yaw || 0;
    g.position.set(x, o.y || 0, z);
    if (this.q && this.q.shadows && tpl.size[1] * sy > 0.35) inst.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    (o.parent || this.scene).add(g);
    if (o.solid) {
      const w = tpl.size[0] * sx, d = tpl.size[2] * sz, c = Math.abs(Math.cos(o.yaw || 0)), s = Math.abs(Math.sin(o.yaw || 0));
      const hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
      const col = { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, y0: o.y || 0, y1: (o.y || 0) + tpl.size[1] * sy, prop: true };
      this.colliders.push(col); g.userData.col = col;
    }
    return g;
  };

  // ---------------------------------------------------------------- лампы
  P.dressLamp = function (m) {
    const th = this.propTheme; if (!th) return;
    const kind = PACKS[th].lamp, tpl = PROPS[kind]; if (!tpl) return;
    const y = m.position.y, x = m.position.x, z = m.position.z;
    let top = y + 0.06, glow = null;
    if (kind === 'ceiling_lamp') { m.scale.set(0.9, 0.02, 0.1); m.position.y = y + 0.01; top = y + 0.05; }
    else if (kind === 'industrial_lamp') { top = y + 0.12; glow = [0.3, 0.04, 0.3, top - 0.47]; }
    else { top = y + 0.1; glow = [0.26, 0.26, 0.26, top - 0.5]; }
    if (glow) { m.scale.set(glow[0], glow[1], glow[2]); m.position.y = glow[3]; }
    this.prop(kind, x, z, { y: top, s: kind === 'ceiling_lamp' ? 0.85 : 1 });
  };

  // ---------------------------------------------------------------- бочки, предметы
  P.barrelModel = function (m, band) {
    if (!this.propTheme || !PROPS.barrel_red) return;
    if (band) band.visible = false;
    if (!this.matHidden) this.matHidden = new THREE.MeshBasicMaterial({ visible: false });
    m.material = this.matHidden;
    const g = this.prop('barrel_red', 0, 0, { sx: 0.9, sy: 1.05, sz: 0.9, parent: m, yaw: (m.position.x * 7 + m.position.z * 3) % 6.28 });
    if (g) g.position.y = -0.5; // цилиндр-«пустышка» центрирован на 0.5 м
  };
  const PICK = { health: ['medkit', 1.0], ammo: ['ammo_crate', 1.0], c4: ['c4', 1.6], frag: ['frag', 2.2], flash: ['flashbang', 2.0] };
  P.pickupModel = function (pk) {
    if (!this.propTheme) return;
    const e = PICK[pk.kind === 'gadget' ? pk.o.id : pk.kind], tpl = e && PROPS[e[0]]; if (!tpl) return;
    const grp = new THREE.Group();
    const inst = this.prop(e[0], 0, 0, { s: e[1], parent: grp });
    inst.position.y = -tpl.size[1] * e[1] / 2;
    grp.position.y = 0.9;
    pk.g.remove(pk.box); pk.g.add(grp); pk.box = grp;
  };

  // ---------------------------------------------------------------- терминалы взлома: консоль-модель на стойке + мелкая техника рядом
  // ax/sg — как в term()/termProp(): стойка 1×1×0.7 м, экран-полоска на стороне (ax ? x : z) * sg
  // [модель, боковой сдвиг от центра стойки, подъём над крышкой, масштаб, наклон rx]: техника на боковой полосе крышки (стойка шире консоли)
  const TERM_ACC = [['usb', 0.41, 0.041, 1, -PI / 2], ['hard_drive', 0.4, 0, 1.1, 0], ['keycard', 0.4, 0.004, 1, 0], ['lockpick', 0.41, 0.01, 1.2, 0], ['fingerprint', 0.4, 0, 0.45, 0]];
  P.termDress = function (x, z, ax, sg) {
    if (!this.propTheme || !PROPS.hack_terminal) return;
    const fx = ax ? sg : 0, fz = ax ? 0 : sg, yaw = Math.atan2(fx, fz);
    this.prop('hack_terminal', x, z, { yaw, y: 1.0 });
    const h = hash(Math.round(x * 10) * 131 + Math.round(z * 10)), a = TERM_ACC[h % TERM_ACC.length];
    if (!PROPS[a[0]]) return;
    const side = h & 8 ? 1 : -1, lx = -fz * side, lz = fx * side;               // сторона стойки зависит от позиции
    this.prop(a[0], x + lx * a[1], z + lz * a[1], { yaw: yaw + 0.35, y: 1.0 + a[2], s: a[3], rx: a[4] });
  };

  // ---------------------------------------------------------------- добыча ограбления: слитки / пачки денег / сумка вместо белых плашек
  // strips — 3 исходных меша (видимость переключает heist.js); возвращает массив групп с тем же интерфейсом (.visible)
  P.lootModels = function (strips) {
    if (!this.propTheme || !PROPS.gold_bar || !PROPS.dollars || !PROPS.duffel) return strips;
    const T = window.THREE, top = 0.9, z0 = -60;
    const mk = (x, fill) => { const g = new T.Group(); g.position.set(x, top, z0); g.scale.setScalar(1.7); this.scene.add(g); fill(g); g.visible = false; return g; };
    const put = (g, n, px, py, pz, yaw) => this.prop(n, px, pz, { y: py, yaw: yaw || 0, parent: g });
    strips.forEach((m) => { if (m && m.parent) m.parent.remove(m); });
    return [
      mk(-1.6, (g) => { for (let L = 0; L < 3; L += 1) for (let i = 0; i < 3 - L; i += 1) for (const k of [-1, 1]) put(g, 'gold_bar', (i - (2 - L) / 2) * 0.16, L * 0.068, k * 0.15); }),
      mk(0, (g) => { put(g, 'duffel', 0, 0, 0.05, 0.25); for (let i = 0; i < 4; i += 1) put(g, 'dollars', -0.22 + (i % 2) * 0.24, 0.347 + Math.floor(i / 2) * 0.018 * 3, -0.28, (i % 2 ? 0.2 : -0.15)); }),
      mk(1.6, (g) => { for (let c = 0; c < 3; c += 1) for (let r = 0; r < 2; r += 1) for (let h = 0; h < 7; h += 1) put(g, 'dollars', (c - 1) * 0.26, h * 0.018, (r - 0.5) * 0.15, (h % 2) * 0.06); })
    ];
  };

  // ---------------------------------------------------------------- расстановка вдоль стен
  const isWall = (c) => !c.off && !c.door && !c.nodress && (c.y1 - c.y0) >= 2.2 && Math.min(c.x1 - c.x0, c.z1 - c.z0) <= 0.7 && Math.max(c.x1 - c.x0, c.z1 - c.z0) >= 2.4;
  const hit = (a, b, pad) => a[0] < b[1] + pad && a[1] > b[0] - pad && a[2] < b[3] + pad && a[3] > b[2] - pad;

  P.dress = function () {
    const th = this.propTheme; if (!th || !this.bounds) return;
    const pk = PACKS[th], bd = this.bounds, rng = mul(hash((this.taskId | 0) * 977 + 5));
    const maxN = this.q.shadows ? 24 : this.q.lamps >= 3 ? 16 : 10;
    const ins = (x, z, m) => Math.abs(x - bd.cx) < bd.w / 2 - m && Math.abs(z - bd.cz) < bd.d / 2 - m;
    const cols = this.colliders.filter((c) => !c.off);
    const walls = cols.filter(isWall);
    const door = cols.filter((c) => !isWall(c) && (c.door || ((c.y1 - c.y0) >= 2 && Math.max(c.x1 - c.x0, c.z1 - c.z0) <= 5)));
    const poi = [[this.p.x, this.p.z, 3.2]];
    (this.interactables || []).forEach((i) => poi.push([i.pos.x, i.pos.z, 2.2]));
    ((this.cb && this.cb.pickups) || []).forEach((k) => poi.push([k.x, k.z, 1.8]));
    const occ = [];
    const wt = pk.wall.reduce((s, e) => s + e.w, 0);
    const pick = () => { let r = rng() * wt; for (const e of pk.wall) { r -= e.w; if (r <= 0) return e; } return pk.wall[0]; };
    let n = 0;
    const order = walls.map((c, i) => [rng(), c]).sort((a, b) => a[0] - b[0]).map((e) => e[1]);

    const fits = (box, self, lane) => {
      for (const c of cols) { if (c === self) continue; if (hit(box, [c.x0, c.x1, c.z0, c.z1], door.indexOf(c) >= 0 ? 0.9 : 0.12)) return false; }
      for (const o of occ) if (hit(box, o, 0.35)) return false;
      for (const q of poi) if (Math.hypot((box[0] + box[1]) / 2 - q[0], (box[2] + box[3]) / 2 - q[1]) < q[2] + Math.max(box[1] - box[0], box[3] - box[2]) / 2) return false;
      for (const l of lane) if (!ins(l[0], l[1], 0.2) || this.blocked(l[0], l[1])) return false;
      return true;
    };

    order.forEach((wc) => {
      if (n >= maxN) return;
      const alongX = (wc.x1 - wc.x0) >= (wc.z1 - wc.z0);
      const len = alongX ? wc.x1 - wc.x0 : wc.z1 - wc.z0, a0 = alongX ? wc.x0 : wc.z0;
      [-1, 1].forEach((sg) => {
        if (n >= maxN) return;
        const nx = alongX ? 0 : sg, nz = alongX ? sg : 0;                       // нормаль в комнату
        const face = alongX ? (sg > 0 ? wc.z1 : wc.z0) : (sg > 0 ? wc.x1 : wc.x0);
        const yaw0 = Math.atan2(nx, nz);
        let a = 1.3 + rng() * 1.5;
        while (a < len - 1.3 && n < maxN) {
          const spec = pick();
          if (rng() > 0.62) { a += 2 + rng() * 2.5; continue; }
          // ---- габариты
          let name = spec.n, size, rot = spec.rot ? 1 : 0, bagPile = name === 'sandpile';
          if (bagPile) { name = 'sandbag'; rot = 1; }
          const tpl = PROPS[name]; if (!tpl) { a += 2; continue; }
          size = tpl.size;
          let al = rot ? size[2] : size[0], dp = rot ? size[0] : size[2];
          if (bagPile) { al = 2.1; dp = 0.5; }
          const s = 1;
          const pos = a0 + a + al / 2;
          if (pos + al / 2 > a0 + len - 1.2) break;
          const out = 0.05 + dp / 2;
          const cxw = alongX ? pos : face + nx * out, czw = alongX ? face + nz * out : pos;
          const box = alongX ? [cxw - al / 2, cxw + al / 2, czw - dp / 2, czw + dp / 2] : [cxw - dp / 2, cxw + dp / 2, czw - al / 2, czw + al / 2];
          const res = spec.reserve || 0;
          const lp = 0.05 + dp + 0.95 + res, lanes = [-al / 2, 0, al / 2].map((k) => (alongX ? [pos + k, face + nz * lp] : [face + nx * lp, pos + k]));
          if (!fits(box, wc, lanes)) { a += 1.2 + rng() * 1.2; continue; }
          // ---- ставим
          const yaw = yaw0 + (rot ? PI / 2 : 0);
          const solid = spec.solid !== false;
          if (bagPile) {
            [[-0.72, 0, 0], [0, 0, 0], [0.72, 0, 0], [-0.36, 0.196, 0], [0.36, 0.196, 0], [0, 0.392, 0]].forEach((b) => {
              const bx = alongX ? pos + b[0] : cxw, bz = alongX ? czw : pos + b[0];
              this.prop('sandbag', bx, bz, { yaw, y: b[1] });
            });
            const col = { x0: box[0], x1: box[1], z0: box[2], z1: box[3], y0: 0, y1: 0.6, prop: true }; this.colliders.push(col);
          } else {
            this.prop(name, cxw, czw, { yaw, solid, s });
            (spec.on || []).forEach((o) => { const oa = alongX ? pos + o[1] * al : cxw, ob = alongX ? czw : pos + o[1] * al; this.prop(o[0], oa, ob, { yaw: yaw + (o[3] || 0), y: o[2], s: o[4] || 1 }); });
            (spec.extras || []).forEach((o) => { const ob = 0.05 + dp + o[2]; const ex = alongX ? pos + o[1] * al : face + nx * ob, ez = alongX ? face + nz * ob : pos + o[1] * al; this.prop(o[0], ex, ez, { yaw: yaw0 + (o[3] || 0), solid: !!o[4] }); });
          }
          occ.push(box);
          if (res) occ.push(alongX ? [box[0], box[1], box[2] - (nz < 0 ? res : 0), box[3] + (nz > 0 ? res : 0)] : [box[0] - (nx < 0 ? res : 0), box[1] + (nx > 0 ? res : 0), box[2], box[3]]);
          n += 1;
          a += al + 1.2 + rng() * 2.6;
        }
      });
    });
    this.propN = n;

    // ---- декор у потолка: вентиляция вдоль стен и камеры наблюдения
    const H = bd.h || 3.5;
    if (pk.duct && PROPS.duct && H >= 3.2) {
      let k = 0;
      order.slice(0, 4).forEach((wc) => {
        if (k >= 2) return;
        const alongX = (wc.x1 - wc.x0) >= (wc.z1 - wc.z0), len = alongX ? wc.x1 - wc.x0 : wc.z1 - wc.z0, a0 = alongX ? wc.x0 : wc.z0;
        if (len < 7) return;
        const sg = rng() < 0.5 ? -1 : 1, face = alongX ? (sg > 0 ? wc.z1 : wc.z0) : (sg > 0 ? wc.x1 : wc.x0);
        const cnt = Math.min(5, Math.floor((len - 2) / 2)), st = a0 + 1 + rng() * Math.max(0, len - 2 - cnt * 2);
        for (let i = 0; i < cnt; i += 1) {
          const pos = st + i * 2 + 1, out = 0.05 + 0.35;
          const x = alongX ? pos : face + sg * out, z = alongX ? face + sg * out : pos;
          if (!ins(x, z, 0.3)) continue;
          this.prop('duct', x, z, { yaw: alongX ? PI / 2 : 0, y: H - 0.78 });
        }
        k += 1;
      });
    }
    if (pk.cam && PROPS.camera && rng() < pk.cam + 0.4) {
      let k = 0;
      order.slice(0, 5).forEach((wc) => {
        if (k >= 2) return;
        const alongX = (wc.x1 - wc.x0) >= (wc.z1 - wc.z0), len = alongX ? wc.x1 - wc.x0 : wc.z1 - wc.z0, a0 = alongX ? wc.x0 : wc.z0;
        if (len < 5) return;
        const sg = rng() < 0.5 ? -1 : 1, face = alongX ? (sg > 0 ? wc.z1 : wc.z0) : (sg > 0 ? wc.x1 : wc.x0);
        const pos = a0 + 1.5 + rng() * (len - 3), out = 0.05 + 0.2;
        const x = alongX ? pos : face + sg * out, z = alongX ? face + sg * out : pos;
        if (!ins(x, z, 0.3)) return;
        this.prop('camera', x, z, { yaw: Math.atan2(alongX ? 0 : sg, alongX ? sg : 0), y: Math.min(H - 0.6, 2.9) });
        k += 1;
      });
    }
    // ---- пожарная сирена на стене (только декор, без коллайдера)
    if (pk.alarm && PROPS.fire_alarm) {
      let k = 0;
      order.slice(0, 6).forEach((wc) => {
        if (k >= 2) return;
        const alongX = (wc.x1 - wc.x0) >= (wc.z1 - wc.z0), len = alongX ? wc.x1 - wc.x0 : wc.z1 - wc.z0, a0 = alongX ? wc.x0 : wc.z0;
        if (len < 4) return;
        const sg = rng() < 0.5 ? -1 : 1, face = alongX ? (sg > 0 ? wc.z1 : wc.z0) : (sg > 0 ? wc.x1 : wc.x0);
        const pos = a0 + 1 + rng() * (len - 2), out = 0.05 + 0.06;
        const x = alongX ? pos : face + sg * out, z = alongX ? face + sg * out : pos;
        if (!ins(x, z, 0.3)) return;
        this.prop('fire_alarm', x, z, { yaw: Math.atan2(alongX ? 0 : sg, alongX ? sg : 0) + ALARM_YAW, y: 1.85 });
        k += 1;
      });
    }
  };

  // экспорт для отладки / bot
  C.props = { PROPS, PACKS, themeOf };
}());
