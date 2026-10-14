// NEXA: бой от первого лица. Оружие всегда опущено внизу, руки видны только когда игрок смотрит вниз.
// Скрытый уровень стресса (не показывается) влияет на скорость перезарядки, разброс, дрожание камеры.
// Подключается к Run.prototype из missions.js; миссии используют r.combat(), r.giveWeapon(), r.enemy(), r.wave(), r.phase().
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C) return;
  const { Run, PLAYER_R, EYE, wrap, smooth, lerp } = C;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sgn = () => (Math.random() < 0.5 ? -1 : 1);
  const easeOut = (k) => 1 - Math.pow(1 - k, 3); // резкий старт, мягкий финиш — «профессиональные» дёрганые движения
  const easeOut4 = (k) => 1 - Math.pow(1 - k, 4);
  const easeBack = (k, c) => { const m = k - 1; return 1 + (c + 1) * m * m * m + c * m * m; }; // рывок с лёгким перелётом
  // профили перезарядки: amp — размах позы, yank — первый рывок оружия вниз-вбок, jolt — отдача в руках от событий, back — перелёт, cam — тряска камеры
  const RLP = {
    glock: { amp: 1.3, yank: 1.0, jolt: 0.8, back: 1.1, cam: 1 },
    ak: { amp: 1.2, yank: 1.0, jolt: 1.1, back: 0.9, cam: 1.15 },
    shotgun: { amp: 1.1, yank: 0.6, jolt: 1.2, back: 0.8, cam: 1.2 },
    sniper: { amp: 1.1, yank: 0.8, jolt: 1.5, back: 0.7, cam: 1.3, bolt: 1.7 },
    minigun: { amp: 0.8, yank: 0.5, jolt: 2, back: 0.5, cam: 1.5 }
  };
  const rlp = (id) => RLP[id] || RLP.ak;

  // ------------------------------------------------------------------ оружие
  // low — поза у бедра (x,y,z в системе тела, rx,ry); sprint — поза бега; relief — расстояние от глаза до целика в прицеливании
  // rl — ключевые кадры перезарядки: [t, x,y,z, rx,ry,rz, левая рука к поясу, руки видны]; ev — события перезарядки
  const WEAPONS = {
    glock: {
      name: 'GLOCK 17', tag: ['9MM', 'SEMI'], mag: 15, reserve: 60, maxReserve: 90, dmg: 26, rate: 0.13, auto: false, pellets: 1, chamber: true,
      hip: 0.045, ads: 0.0022, bloom: 0.012, recoil: 0.02, recoilY: 0.007, climb: 0.006, back: 0.035, up: 0.14, shake: 0.0035,
      adsFov: 70, adsTime: 0.13, relief: 0.27, reload: 1.45, sound: 'pistol', range: 90,
      low: [0.1, -0.27, -0.42, -0.1, 0.1], sprint: [0.2, -0.55, -0.2, -0.9, 0.35, 0.3],
      anch: { grip: [0, -0.05, -0.02], sup: [-0.03, -0.075, -0.03], muzzle: [0, 0.012, -0.205], rearZ: -0.012, sightY: 0.037 },
      // rl: [t, x,y,z, rx,ry,rz, цель левой руки, руки видны, в левой руке магазин/патрон, ход затвора]; цели: sup (хват), belt (пояс), mag (шахта магазина), charge (затвор/рукоять), port (окно заряжания)
      rl: [[0, 0, 0, 0, 0, 0, 0, 'sup', 0, 0, 0],
        [0.07, -0.03, 0.11, 0.07, 0.38, 0.1, 0.55, 'sup', 1, 0, 0],       // пистолет к груди, кант вправо — видна шахта
        [0.16, -0.03, 0.11, 0.07, 0.46, 0.12, 0.62, 'mag', 1, 0, 0],      // левая ладонь снизу, магазин вылетает
        [0.3, -0.04, 0.09, 0.05, 0.42, 0.1, 0.52, 'belt', 1, 0, 0],       // рука к поясу
        [0.38, -0.04, 0.09, 0.05, 0.42, 0.1, 0.52, 'belt', 1, 1, 0],      // новый магазин взят
        [0.54, -0.03, 0.1, 0.06, 0.46, 0.12, 0.6, 'mag', 1, 1, 0],        // поднесла к рукоятке
        [0.6, -0.03, 0.08, 0.04, 0.3, 0.08, 0.45, 'mag', 1, 0, 0],        // хлопок ладонью: магазин встал
        [0.68, -0.03, 0.1, 0.04, 0.35, 0.06, 0.4, 'charge', 1, 0, 0],     // пальцы на затворе
        [0.76, -0.03, 0.1, 0.05, 0.35, 0.06, 0.4, 'charge', 1, 0, 1],     // оттянула
        [0.8, -0.03, 0.1, 0.04, 0.34, 0.06, 0.4, 'charge', 1, 0, 0],      // отпустила — затвор вперёд
        [1, 0, 0, 0, 0, 0, 0, 'sup', 0, 0, 0]],
      ev: [['magout', 0.16], ['magin', 0.6], ['rack', 0.8]],
      lt: { mag: [-0.005, -0.085, -0.02], magC: [0, -0.03, -0.02], chg: [-0.03, 0.035, -0.03], travel: 0.03 }, magBox: [0.026, 0.1, 0.04]
    },
    ak: {
      name: 'AK-47', tag: ['7.62', 'AUTO'], mag: 30, reserve: 120, maxReserve: 180, dmg: 34, rate: 0.1, auto: true, pellets: 1, chamber: true,
      hip: 0.065, ads: 0.0038, bloom: 0.011, recoil: 0.026, recoilY: 0.012, climb: 0.012, back: 0.05, up: 0.1, shake: 0.0055,
      adsFov: 62, adsTime: 0.22, relief: 0.4, reload: 2.3, sound: 'ak', range: 120,
      low: [0.16, -0.24, -0.28, -0.1, 0.14], sprint: [0.24, -0.58, -0.12, -0.8, 0.45, 0.35],
      anch: { grip: [0, -0.08, -0.01], sup: [0, -0.03, -0.38], muzzle: [0, 0.013, -0.63], rearZ: -0.235, sightY: 0.074 },
      rl: [[0, 0, 0, 0, 0, 0, 0, 'sup', 0, 0, 0],
        [0.07, -0.06, 0.1, 0.08, 0.2, 0.12, 0.5, 'sup', 1, 0, 0],         // автомат набок, взгляд на магазин
        [0.16, -0.07, 0.12, 0.09, 0.26, 0.16, 0.62, 'mag', 1, 0, 0],      // ладонь на магазине, большой палец на защёлке — магазин падает
        [0.36, -0.06, 0.1, 0.07, 0.22, 0.1, 0.5, 'belt', 1, 0, 0],
        [0.44, -0.06, 0.1, 0.07, 0.22, 0.1, 0.5, 'belt', 1, 1, 0],        // новый магазин из разгрузки
        [0.58, -0.07, 0.11, 0.08, 0.3, 0.14, 0.58, 'mag', 1, 1, 0],       // зацеп спереди, поворот назад
        [0.62, -0.07, 0.09, 0.06, 0.18, 0.1, 0.45, 'mag', 1, 0, 0],       // хлопок — защёлка щёлкнула
        [0.72, -0.05, 0.1, 0.07, 0.15, 0.05, 0.35, 'charge', 1, 0, 0],    // рука к рукояти затвора
        [0.8, -0.05, 0.1, 0.07, 0.15, 0.05, 0.35, 'charge', 1, 0, 1],     // затвор на себя
        [0.83, -0.05, 0.1, 0.07, 0.14, 0.05, 0.34, 'charge', 1, 0, 0],    // отпустила
        [1, 0, 0, 0, 0, 0, 0, 'sup', 0, 0, 0]],
      ev: [['magout', 0.16], ['magin', 0.62], ['rack', 0.83]],
      lt: { mag: [0, -0.085, -0.2], magC: [0, -0.05, -0.2], chg: [0.02, 0.06, -0.12], travel: 0.1 }, magBox: [0.036, 0.16, 0.07]
    },
    shotgun: {
      name: 'SHOTGUN', tag: ['12GA', 'PUMP'], mag: 6, reserve: 36, maxReserve: 48, dmg: 13, rate: 0.85, auto: false, pellets: 8, shell: true,
      hip: 0.075, ads: 0.04, bloom: 0, recoil: 0.07, recoilY: 0.018, climb: 0.03, back: 0.09, up: 0.2, shake: 0.012,
      adsFov: 74, adsTime: 0.18, relief: 0.3, reload: 0.6, sound: 'shotgun', range: 40,
      low: [0.15, -0.24, -0.28, -0.1, 0.12], sprint: [0.24, -0.58, -0.14, -0.8, 0.45, 0.35],
      anch: { grip: [0, -0.075, -0.01], sup: [0, -0.012, -0.36], muzzle: [0, 0.024, -0.749], rearZ: -0.075, sightY: 0.06 },
      // цикл одного патрона (cyc 0..1): окно заряжания -> пояс -> патрон в пальцах -> окно (патрон вставлен на стыке циклов); стойка (канта ружья) постоянна
      rl: [[0, -0.06, 0.1, 0.06, 0.55, 0.05, 0.7, 'port', 1, 0, 0],
        [0.34, -0.06, 0.1, 0.06, 0.55, 0.05, 0.7, 'belt', 1, 0, 0],
        [0.44, -0.06, 0.1, 0.06, 0.55, 0.05, 0.7, 'belt', 1, 1, 0],
        [0.86, -0.06, 0.1, 0.06, 0.55, 0.05, 0.7, 'port', 1, 1, 0],
        [1, -0.06, 0.1, 0.05, 0.57, 0.05, 0.72, 'port', 1, 1, 0]], ev: [],
      lt: { port: [0.0, -0.075, -0.1], travel: 0.1 }
    }
  };

  // типы врагов
  const ETYPES = {
    grunt:  { hp: 60,  speed: 2.2, rmin: 6, rmax: 14, dmg: 6, burst: [2, 3], rate: 0.2,  cd: [1.0, 2.0], acc: 0.42, scale: 1,    gun: true },
    rusher: { hp: 45,  speed: 4.6, melee: true, dmg: 11, reach: 1.3, cd: 0.9, scale: 1, lean: 0.28 },
    heavy:  { hp: 180, speed: 1.5, rmin: 6, rmax: 13, dmg: 7, burst: [4, 6], rate: 0.11, cd: [1.4, 2.2], acc: 0.46, scale: 1.25, gun: true, armor: 0.7 },
    target: { hp: 1,   speed: 0, passive: true, scale: 1 },
    boss:   { hp: 1500, speed: 1.3, rmin: 8, rmax: 16, dmg: 8, burst: [5, 7], rate: 0.13, cd: [1.2, 1.8], acc: 0.5, scale: 2.2, gun: true, armor: 0.8 }
  };

  // ------------------------------------------------------------------ геометрия лучей
  let _ax = 0;
  function rayBox(ox, oy, oz, dx, dy, dz, c) {
    const y0 = c.y0 === undefined ? 0 : c.y0, y1 = c.y1 === undefined ? 3.6 : c.y1;
    let tmin = -Infinity, tmax = Infinity, ax = 0, a, b, s;
    if (Math.abs(dx) < 1e-9) { if (ox < c.x0 || ox > c.x1) return Infinity; } else { a = (c.x0 - ox) / dx; b = (c.x1 - ox) / dx; if (a > b) { s = a; a = b; b = s; } if (a > tmin) { tmin = a; ax = 1; } if (b < tmax) tmax = b; }
    if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return Infinity; } else { a = (y0 - oy) / dy; b = (y1 - oy) / dy; if (a > b) { s = a; a = b; b = s; } if (a > tmin) { tmin = a; ax = 2; } if (b < tmax) tmax = b; }
    if (Math.abs(dz) < 1e-9) { if (oz < c.z0 || oz > c.z1) return Infinity; } else { a = (c.z0 - oz) / dz; b = (c.z1 - oz) / dz; if (a > b) { s = a; a = b; b = s; } if (a > tmin) { tmin = a; ax = 3; } if (b < tmax) tmax = b; }
    if (tmin > tmax || tmax < 0 || tmin < 0) return Infinity;
    _ax = ax;
    return tmin;
  }
  function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    const lx = cx - ox, ly = cy - oy, lz = cz - oz, tc = lx * dx + ly * dy + lz * dz;
    if (tc < 0) return Infinity;
    const d2 = lx * lx + ly * ly + lz * lz - tc * tc, r2 = r * r;
    if (d2 > r2) return Infinity;
    return tc - Math.sqrt(r2 - d2);
  }
  function rayCyl(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1) {
    const rx = ox - cx, rz = oz - cz, a = dx * dx + dz * dz;
    if (a < 1e-9) return Infinity;
    const b = rx * dx + rz * dz, c = rx * rx + rz * rz - r * r, disc = b * b - a * c;
    if (disc < 0) return Infinity;
    const s = Math.sqrt(disc);
    let t = (-b - s) / a;
    if (t < 0) t = (-b + s) / a;
    if (t < 0) return Infinity;
    const y = oy + dy * t;
    return y >= y0 && y <= y1 ? t : Infinity;
  }

  // ------------------------------------------------------------------ руки и оружие (rig)
  // Чёрные руки стикмена: плечо -> локоть -> запястье (IK), кисти с пальцами. Материалы прозрачные, порядок отрисовки — по renderOrder.
  Run.prototype.buildRig = function () {
    const T = THREE, mats = {};
    const M = (c) => mats[c] || (mats[c] = new T.MeshLambertMaterial({ color: c, fog: false, depthTest: false, depthWrite: false, transparent: true }));
    const mk = (geo, mt, order) => { const m = new T.Mesh(geo, mt); m.renderOrder = order; m.frustumCulled = false; return m; };
    const root = new T.Group(); root.visible = false; this.scene.add(root);
    const skinMat = new T.MeshLambertMaterial({ color: 0x070707, emissive: 0x0d0d0d, fog: false, depthTest: false, depthWrite: false, transparent: true });
    const armMat = skinMat.clone(); // руки без оружия плавно проявляются, когда игрок смотрит вниз
    const rg = {
      root, M, mk, skinMat, armMat, arms: [], handMag: null, flash: null, models: {}, hv: 0, rec: { back: 0, up: 0 }, flashT: 0, slide: 0, pump: 0,
      v1: new T.Vector3(), v2: new T.Vector3(), v3: new T.Vector3(), v4: new T.Vector3(), q1: new T.Quaternion(), q2: new T.Quaternion(), e: new T.Euler(0, 0, 0, 'YXZ'),
      sh: [new T.Vector3(), new T.Vector3()], hp: [new T.Vector3(), new T.Vector3()], el: [new T.Vector3(), new T.Vector3()], wr: [new T.Vector3(), new T.Vector3()]
    };
    this.rg = rg;
    const gu = C.limbGeo(0.034, 0.046), gf = C.limbGeo(0.025, 0.035), gj = new T.SphereGeometry(0.036, 8, 6);
    for (let i = 0; i < 2; i += 1) {
      const up = mk(gu, armMat, 995), fo = mk(gf, armMat, 996), el = mk(gj, armMat, 996), hand = C.buildRestHand(i ? 1 : -1, rg);
      hand.children.forEach((c) => { c.material = armMat; });
      [up, fo, el, hand].forEach((o) => { o.visible = false; this.scene.add(o); });
      rg.arms.push({ up, fo, el, hand });
    }
    rg.handMag = mk(new T.BoxGeometry(0.035, 0.1, 0.05), M(0x1c1c1c), 1012); rg.handMag.visible = false; this.scene.add(rg.handMag);
    rg.handShell = mk(new T.BoxGeometry(1, 1, 1), M(0xd8d8d8), 1012); rg.handShell.scale.set(0.02, 0.02, 0.07); rg.handShell.visible = false; this.scene.add(rg.handShell); // патрон в пальцах
    rg.lq = new T.Quaternion(); // ориентация левой кисти (на оружии — как оружие, у пояса — как тело)
    const dmat = new T.MeshLambertMaterial({ color: 0x151515 });
    const dgeo = new T.BoxGeometry(1, 1, 1);
    rg.drops = [0, 1, 2].map(() => { const m = new T.Mesh(dgeo, dmat); m.visible = false; this.scene.add(m); return { m, v: new T.Vector3(), w: new T.Vector3(), t: 0, on: false }; }); // сброшенные магазины
    const flash = new T.Group(); flash.visible = false;
    const fm = new T.MeshBasicMaterial({ color: 0xffffff, depthTest: false, fog: false, transparent: true, depthWrite: false });
    [[0.17, 0.02, 0.02], [0.02, 0.17, 0.02], [0.02, 0.02, 0.22], [0.11, 0.11, 0.015]].forEach((s) => { const m = mk(new T.BoxGeometry(s[0], s[1], s[2]), fm, 1020); flash.add(m); });
    root.add(flash); rg.flash = flash;
    C.fpsHands && C.fpsHands.attach(this); // риггнутые руки (js/fpshands.js) подгружаются в фоне и заменяют процедурные
  };

  // модели оружия (js/models.js): ориентированы в -Z, начало координат — хват правой руки
  Run.prototype.rigModel = function (id) {
    const rg = this.rg, T = THREE;
    if (rg.models[id]) return rg.models[id];
    const d = WEAPONS[id], A = d.anch;
    const mdl = C.buildWeapon(id, rg, A), g = mdl.g;
    g.position.set(-A.grip[0], -A.grip[1], -A.grip[2]);
    const holder = new T.Group(); holder.add(g); holder.visible = false; rg.root.add(holder);
    mdl.holder = holder;
    mdl.lh = C.buildLeftHand(mdl, rg); mdl.lh.visible = false; this.scene.add(mdl.lh); // левая кисть двигается отдельно от оружия (перезарядка)
    // позиция в прицеливании (в системе камеры): мушка по центру, целик на расстоянии relief от глаза
    mdl.ads = [0, -(A.sightY - A.grip[1]) + 0.002, -d.relief - (A.rearZ - A.grip[2])];
    mdl.muzzle = [A.muzzle[0] - A.grip[0], A.muzzle[1] - A.grip[1], A.muzzle[2] - A.grip[2]];
    mdl.sup = [A.sup[0] - A.grip[0], A.sup[1] - A.grip[1], A.sup[2] - A.grip[2]];
    rg.models[id] = mdl;
    return mdl;
  };

  Run.prototype.setRigVisible = function (v) {
    const rg = this.rg; if (!rg) return;
    if (!v) {
      rg.root.visible = false; rg.handMag.visible = false;
      rg.arms.forEach((a) => { a.up.visible = a.fo.visible = a.el.visible = a.hand.visible = false; });
      Object.keys(rg.models).forEach((k) => { rg.models[k].lh.visible = false; });
      if (rg.fh) C.fpsHands.hide(rg.fh);
    }
  };

  function limbTo(m, a, b) {
    m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.scale.set(1, 1, Math.max(0.02, a.distanceTo(b)));
    m.lookAt(b);
  }

  // поза перезарядки: между ключевыми кадрами — резкий старт и мягкий финиш (рваные движения).
  // o[0..5] — смещение/поворот оружия, o[6] — руки видны, o[7] — в левой руке магазин/патрон, o[8] — ход затвора; o.a/o.b/o.k — цели левой руки (из кадров) и прогресс между ними
  Run.prototype.rigJolt = function (z, rx, ry) { const j = this.rg && this.rg.j; if (j) { j.vz += z; j.vrx += rx; j.vry += ry; } };
  Run.prototype.rlPose = function (rl) {
    const K = rl.def.rl, u = clamp(rl.shell ? rl.cyc : rl.t / rl.dur, 0, 1), a0 = (K, i) => K[i][0];
    let i = 0;
    while (i < K.length - 2 && u >= K[i + 1][0]) i += 1;
    const P = rlp(rl.id), tt = clamp((u - a0(K, i)) / Math.max(0.001, K[i + 1][0] - K[i][0]), 0, 1);
    const a = K[i], b = K[i + 1], k = easeOut4(tt), kp = easeBack(tt, P.back);
    const o = rl.out || (rl.out = []);
    for (let j = 0; j < 6; j += 1) o[j] = lerp(a[j + 1], b[j + 1], kp) * P.amp;
    if (!rl.shell) { // первый рывок: оружие резко вниз-вбок и кантом, затем гасится
      const ye = Math.exp(-rl.t * 10) * Math.sin(Math.min(1, rl.t / 0.045) * 1.5708) * P.yank;
      o[0] -= 0.05 * ye; o[1] -= 0.07 * ye; o[3] += 0.28 * ye; o[5] += 0.3 * ye;
    }
    o[6] = lerp(a[8], b[8], k);
    o[7] = a[9] > 0.5 || b[9] > 0.5 ? 1 : 0;
    o[8] = lerp(a[10], b[10], k);
    o.a = a[7]; o.b = b[7]; o.k = k;
    if (rl.shell) { const pk = rl.pk; for (let j = 0; j < 7; j += 1) o[j] *= pk; } // у дробовика стойка плавно входит и выходит
    if (rl.hold > 0) { o[0] += rnd(-0.01, 0.01); o[1] += rnd(-0.008, 0.008); o[3] += rnd(-0.06, 0.06); } // пальцы не слушаются — дрожь
    return o;
  };

  // сброшенный магазин: падает, подпрыгивает и лежит на полу несколько секунд
  Run.prototype.dropMag = function (mdl, d) {
    const rg = this.rg, B = d.magBox, c = d.lt.magC; if (!B) return;
    const q = rg.drops.find((x) => !x.on) || rg.drops[0], m = q.m;
    m.scale.set(B[0], B[1], B[2]); m.visible = true;
    m.position.set(c[0], c[1], c[2]); rg.root.localToWorld(m.position);
    m.quaternion.copy(rg.root.quaternion);
    q.v.set(rnd(-0.4, 0.4), -0.5, rnd(-0.3, 0.2)).applyQuaternion(rg.root.quaternion); q.w.set(rnd(-5, 5), rnd(-3, 3), rnd(-5, 5)); q.t = 0; q.on = true;
  };
  Run.prototype.updateMagDrops = function (dt) {
    const rg = this.rg; if (!rg || !rg.drops) return;
    for (const q of rg.drops) {
      if (!q.on) continue;
      q.t += dt;
      const m = q.m, hh = m.scale.y * 0.5;
      if (q.t > 5) { q.on = false; m.visible = false; continue; }
      if (q.v.lengthSq() > 0.0004 || m.position.y > hh + 0.03) {
        q.v.y -= 9.8 * dt; m.position.addScaledVector(q.v, dt);
        m.rotation.x += q.w.x * dt; m.rotation.y += q.w.y * dt; m.rotation.z += q.w.z * dt;
        if (m.position.y < Math.min(hh, 0.05)) { m.position.y = Math.min(hh, 0.05); q.v.y *= -0.25; q.v.x *= 0.5; q.v.z *= 0.5; q.w.multiplyScalar(0.4); if (Math.abs(q.v.y) < 0.4) { q.v.set(0, 0, 0); q.w.set(0, 0, 0); m.rotation.set(Math.PI / 2, m.rotation.y, 0); m.position.y = 0.025; } }
      }
    }
  };

  Run.prototype.updateRig = function (dt, vel) {
    const rg = this.rg; if (!rg) return;
    const cam = this.camera, body = this.body, p = this.p, mv = this.bobK === undefined ? p.moving : this.bobK, ph = p.phase, t = this.time;
    const sp = rg.sp || (rg.sp = { x: 0, y: 0, r: 0, vx: 0, vy: 0, vr: 0, by: 0 }), sdt = Math.min(dt, 0.033);
    if (sdt > 0) {
      const tx = clamp(-vel * 0.0035, -0.045, 0.045), ty = clamp(-(this.pitchVel || 0) * 0.003, -0.04, 0.04), tr = clamp(vel * 0.0035, -0.07, 0.07);
      sp.vx += (150 * (tx - sp.x) - 15 * sp.vx) * sdt; sp.x += sp.vx * sdt;
      sp.vy += (150 * (ty - sp.y) - 15 * sp.vy) * sdt; sp.y += sp.vy * sdt;
      sp.vr += (120 * (tr - sp.r) - 13 * sp.vr) * sdt; sp.r += sp.vr * sdt;
    }
    const J = rg.j || (rg.j = { z: 0, rx: 0, ry: 0, vz: 0, vrx: 0, vry: 0 });
    if (sdt > 0) { J.vz += (320 * -J.z - 20 * J.vz) * sdt; J.z += J.vz * sdt; J.vrx += (320 * -J.rx - 20 * J.vrx) * sdt; J.rx += J.vrx * sdt; J.vry += (320 * -J.ry - 20 * J.vry) * sdt; J.ry += J.vry * sdt; }
    cam.updateMatrixWorld(true); body.updateMatrixWorld(true);
    const { v1, v2, v3, v4, q1, q2, e, sh, hp } = rg;
    sh[0].set(-0.24, -0.22, 0.02); body.localToWorld(sh[0]);
    sh[1].set(0.24, -0.22, 0.02); body.localToWorld(sh[1]);
    const w = this.wp, rl = this.rl;
    let hvT = clamp((-p.pitch - 0.12) / 0.45, 0, 1); // руки видны, только когда игрок смотрит вниз
    if (this.pmHv) hvT = this.pmHv(hvT); // pmove.js: с кулаками руки видны всегда
    if (w) {
      const d = w.def, mdl = this.rigModel(w.id);
      Object.keys(rg.models).forEach((k) => { rg.models[k].holder.visible = k === w.id; rg.models[k].lh.visible = k === w.id; });
      let px = d.low[0], py = d.low[1], pz = d.low[2], rx = d.low[3], ry = d.low[4], rz = 0;
      px += Math.sin(ph) * 0.01 * mv; py += Math.abs(Math.sin(ph)) * 0.014 * mv - Math.cos(ph * 2) * 0.004 * mv + Math.sin(t * 1.4) * 0.0025 * (1 - mv); rz += Math.sin(ph) * 0.012 * mv;
      const sk = this.sprintK || 0;
      if (sk > 0.001) { px = lerp(px, d.sprint[0], sk); py = lerp(py, d.sprint[1], sk); pz = lerp(pz, d.sprint[2], sk); rx = lerp(rx, d.sprint[3], sk); ry = lerp(ry, d.sprint[4], sk); rz = d.sprint[5] * sk; }
      const so = this.swapOff || 0;
      if (so > 0) { const se = so * so * (3 - 2 * so); py -= 0.4 * se; rx -= 0.75 * se; ry += 0.3 * se; }
      if (rl) {
        const o = this.rlPose(rl);
        px += o[0]; py += o[1]; pz += o[2]; rx += o[3]; ry += o[4]; rz += o[5];
        hvT = Math.max(hvT, o[6] * 0.85);
      }
      if (this.pmWo) { const o = this.pmWo(dt, px, py, pz, rx, ry, rz); if (o) { px = o[0]; py = o[1]; pz = o[2]; rx = o[3]; ry = o[4]; rz = o[5]; } }
      px += sp.x; py += sp.y; rz += sp.r; pz += J.z; rx += J.rx; ry += J.ry;
      v1.set(px, py, pz); body.localToWorld(v1);
      e.set(rx, ry, rz, 'YXZ'); q1.setFromEuler(e); q1.premultiply(body.quaternion);
      const ak = this.aimK || 0;
      if (ak > 0.001) {
        const k = smooth(ak);
        v2.set(mdl.ads[0], mdl.ads[1], mdl.ads[2]); cam.localToWorld(v2);
        q2.copy(cam.quaternion);
        v1.lerp(v2, k); q1.slerp(q2, k);
      }
      v1.add(v3.set(0, 0, rg.rec.back).applyQuaternion(q1));
      e.set(rg.rec.up, 0, 0); q2.setFromEuler(e); q1.multiply(q2);
      rg.root.position.copy(v1); rg.root.quaternion.copy(q1); rg.root.visible = true;
      // подвижные части
      const rlo = rl && rl.out;
      if (mdl.slide) mdl.slide.position.z = 0.03 * (rlo && rlo[8] > 0.001 ? Math.max(rg.slide, rlo[8]) : rg.slide); // при перезарядке затвор ведёт рука
      if (mdl.pump) mdl.pump.position.z = mdl.pumpBase + 0.1 * Math.sin(rg.pump * Math.PI);
      if (mdl.mag) mdl.mag.visible = !(rl && rl.done && rl.done.magout && !rl.done.magin);
      rg.flash.position.set(mdl.muzzle[0], mdl.muzzle[1], mdl.muzzle[2]);
      rg.root.updateMatrixWorld(true);
      hp[1].set(0, 0, 0); rg.root.localToWorld(hp[1]);
      const pumpOff = mdl.pump ? 0.1 * Math.sin(rg.pump * Math.PI) : 0;
      hp[0].set(mdl.sup[0], mdl.sup[1], mdl.sup[2] + pumpOff); rg.root.localToWorld(hp[0]);
      rg.lq.copy(rg.root.quaternion);
      let held = false;
      if (rl && rl.out) {
        // левая рука идёт между целями соседних ключевых кадров: хват, пояс, шахта магазина, затвор, окно заряжания
        const o = rl.out, L = d.lt || {};
        const tgt = (name, v) => {
          if (name === 'sup') { v.set(mdl.sup[0], mdl.sup[1], mdl.sup[2] + pumpOff); rg.root.localToWorld(v); return 0; }
          if (name === 'belt') { v.set(-0.17, -0.44, -0.36); body.localToWorld(v); return 1; }
          const c = L[name === 'charge' ? 'chg' : name]; if (!c) { v.copy(hp[0]); return 0; }
          v.set(c[0], c[1], c[2] + (name === 'charge' ? L.travel * (o[8] || 0) : 0)); rg.root.localToWorld(v); return 0;
        };
        const bA = tgt(o.a, v2), bB = tgt(o.b, v3);
        hp[0].lerpVectors(v2, v3, o.k);
        let bw = lerp(bA, bB, o.k);
        if (rl.shell) { tgt('sup', v2); hp[0].lerpVectors(v2, hp[0], rl.pk); bw *= rl.pk; }
        if (bw > 0.001) { e.set(-0.8, 0, 0); q2.setFromEuler(e); q2.premultiply(body.quaternion); rg.lq.slerp(q2, bw); } // у пояса кисть смотрит пальцами вниз-вперёд
        held = o[7] > 0.5;
        if (held && d.magBox) { // новый магазин в левой руке
          const B = d.magBox, hm = rg.handMag;
          hm.visible = true; hm.scale.set(B[0] / 0.035, B[1] / 0.1, B[2] / 0.05);
          hm.position.set(0, 0.045, -0.02).applyQuaternion(rg.lq).add(hp[0]); hm.quaternion.copy(rg.lq);
        } else rg.handMag.visible = false;
        if (held && d.shell) { const hs = rg.handShell; hs.visible = true; hs.position.set(0.02, -0.01, -0.03).applyQuaternion(rg.lq).add(hp[0]); hs.quaternion.copy(rg.lq); } else rg.handShell.visible = false;
      } else { rg.handMag.visible = false; rg.handShell.visible = false; }
    } else {
      rg.root.visible = false; rg.handMag.visible = false; rg.handShell.visible = false;
      Object.keys(rg.models).forEach((k) => { rg.models[k].lh.visible = false; });
      const sw = Math.sin(ph) * 0.12 * mv;
      hp[0].set(-0.22, -0.5, -0.26 - sw * 0.7); body.localToWorld(hp[0]);
      hp[1].set(0.22, -0.5, -0.26 + sw * 0.7); body.localToWorld(hp[1]);
    }
    if (this.pmHands) this.pmHands(dt, w);
    rg.hv = lerp(rg.hv, hvT, 1 - Math.exp(-dt * 12));
    // с оружием руки держат его всегда; без оружия видны, только когда игрок смотрит вниз
    const armA = w ? 1 : rg.hv, vis = armA > 0.02, arms = rg.arms, el = rg.el, wr = rg.wr;
    const fh = rg.fh; // риггнутые руки (fpshands.js); пока не загрузились — процедурные
    rg.armMat.opacity = armA;
    if (fh) fh.mat.opacity = armA;
    if (w) {
      const mdl = rg.models[w.id];
      mdl.lh.visible = !fh; mdl.rh.visible = !fh; mdl.lh.position.copy(hp[0]); mdl.lh.quaternion.copy(rg.lq);
      wr[1].set(mdl.wristR[0], mdl.wristR[1], mdl.wristR[2]); rg.root.localToWorld(wr[1]);
      wr[0].set(mdl.wristL[0], mdl.wristL[1], mdl.wristL[2]).applyQuaternion(rg.lq).add(hp[0]);
      if (fh) C.fpsHands.armed(fh, rg, mdl);
    } else { wr[0].copy(hp[0]); wr[1].copy(hp[1]); }
    for (let i = 0; i < 2; i += 1) {
      const a = arms[i];
      a.up.visible = a.fo.visible = a.el.visible = vis && !fh;
      a.hand.visible = !w && vis && !fh;
      if (fh) fh.vis[i] = false;
      if (!vis) continue;
      v1.set(i ? 0.55 : -0.55, -1, 0.15).applyQuaternion(body.quaternion);
      if (this.pmArm) this.pmArm(i, v1);
      if (fh) { C.fpsHands.pose(fh, i, sh[i], wr[i], v1, (w || this.pmQ) ? fh.q[i] : null); if (!(this.ty && this.ty.vis)) C.fpsHands.fingers(fh, i, w ? (i === 0 && this.pmFree ? 'fist' : 'grip') : (this.pmFist || (this.sprintK > 0.3 ? 'fist' : 'idle'))); continue; } // с игрушкой в руке позы пальцев задаёт toyArms
      C.ik2(sh[i], wr[i], 0.3, 0.3, v1, el[i]);
      limbTo(a.up, sh[i], el[i]); limbTo(a.fo, el[i], wr[i]);
      a.el.position.copy(el[i]);
      if (!w) { a.hand.position.copy(wr[i]); a.hand.quaternion.copy(a.fo.quaternion); }
    }
    if (fh) C.fpsHands.tick(fh, dt);
  };

  // ------------------------------------------------------------------ инициализация боя
  Run.prototype.combat = function (o) {
    if (this.cb) return this;
    o = o || {};
    this.cb = {
      kP: 0, kY: 0, kR: 0, shk: 0, bloom: 0, hurtK: 0, lastHurt: -10, beatT: 0, hitT: 0, deaths: 0, kills: 0, regen: o.regen !== false,
      hpShown: -1, ammoShown: '', nameShown: '', sparks: [], tracers: [], proj: [], pickups: [], enemies: [], shoot: [], killHooks: [], stressBias: 0, hint: false, lastCombat: -99
    };
    this.maxHp = o.hp || 100; this.hp = this.maxHp;
    this.stress = 0.1; this.inv = []; this.wp = null; this.aimK = 0; this.aimWant = false; this.fireCd = 0; this.sprintK = 0; this.swapOff = 0; this.fireBuf = 0;
    this.layer.classList.add('combat');
    this.snd = C.makeSound ? C.makeSound(this) : null;
    if (this.snd) this.snd.ambient.set(C.props && C.props.themeOf ? C.props.themeOf(this.taskId) : null); // фон помещения по теме миссии
    this.pool = [];
    const T = THREE, parts = this.q.parts * 2;
    const sg = new T.BoxGeometry(0.035, 0.035, 0.035), sm = new T.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < parts; i += 1) { const m = new T.Mesh(sg, sm); m.visible = false; this.scene.add(m); this.cb.sparks.push({ m, v: new T.Vector3(), life: 0 }); }
    const tg = new T.BoxGeometry(0.012, 0.012, 1), tm = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 8; i += 1) { const m = new T.Mesh(tg, tm); m.visible = false; m.frustumCulled = false; this.scene.add(m); this.cb.tracers.push({ m, life: 0 }); }
    this.cb.blast = new T.Mesh(new T.SphereGeometry(1, 12, 8), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    this.cb.blast.visible = false; this.scene.add(this.cb.blast);
    this.cb.dummy = new T.Object3D();
    this.bloodInit();
    this.refreshHud();
    return this;
  };

  Run.prototype.giveWeapon = function (id, o) {
    this.combat();
    o = o || {};
    const d = WEAPONS[id]; if (!d) return null;
    let w = this.inv.find((x) => x.id === id);
    if (!w) { w = { id, def: d, mag: o.mag === undefined ? d.mag : o.mag, reserve: o.reserve === undefined ? d.reserve : o.reserve }; this.inv.push(w); if (this.inv.length === 1) o.equip = true; }
    else { w.reserve = Math.max(w.reserve, Math.min(d.maxReserve, w.reserve + (o.reserve === undefined ? d.mag * 2 : o.reserve))); } // max: бонус игрушки (+100) может превышать maxReserve — подбор не должен его срезать
    this.rigModel(id);
    if (o.equip) this.equip(w, true);
    this.layer.classList.add('armed');
    if (!this.touch && !this.cb.hint) { this.cb.hint = true; const KL = (id) => (window.NexaSettings ? NexaSettings.keyLabel(id) : '').replace(/^[LR]-/, ''); this.qs('.m-hint').textContent = ['forward', 'left', 'back', 'right'].map(KL).join('') + ' MOVE  |  MOUSE LOOK  |  LMB FIRE  |  RMB AIM  |  ' + KL('reload') + ' RELOAD  |  ' + KL('swap') + '/1-9 SLOT  |  ' + KL('use') + ' USE  |  ' + KL('run') + ' RUN  |  ' + KL('crouch') + ' CROUCH  |  ' + KL('leanL') + ' ' + KL('leanR') + ' LEAN  |  ' + KL('fists') + ' FISTS  |  ' + KL('kick') + ' KICK'; }
    this.refreshHud();
    return w;
  };
  Run.prototype.clearWeapons = function () { if (!this.cb) return; this.inv = []; this.wp = null; this.rl = null; this.layer.classList.remove('armed'); this.refreshHud(); };
  Run.prototype.equip = function (w, instant) {
    if (!w || this.wp === w) return;
    this.rl = null;
    if (instant || !this.wp) { this.wp = w; this.swapOff = instant ? 0.9 : 0; this.swapTo = null; this.snd && this.snd.play('draw'); }
    else { this.swapTo = w; }
    this.refreshHud();
  };
  Run.prototype.swapNext = function (dir) {
    if (!this.cb || this.locked || this.inv.length < 2) return;
    const i = this.inv.indexOf(this.swapTo || this.wp);
    this.equip(this.inv[(i + (dir || 1) + this.inv.length) % this.inv.length]);
  };
  Run.prototype.selectSlot = function (n) { if (this.cb && !this.locked && this.inv[n]) this.equip(this.inv[n]); };

  // ------------------------------------------------------------------ скрытый стресс
  Run.prototype.updateStress = function (dt) {
    const cb = this.cb, p = this.p;
    let thr = 0;
    for (const e of cb.enemies) {
      if (e.dead || e.t.passive) continue;
      const d = Math.hypot(e.n.g.position.x - p.x, e.n.g.position.z - p.z);
      thr += clamp(1 - d / 14, 0, 1) * (e.type === 'heavy' || e.type === 'boss' ? 1.4 : 1) * (e.los ? 1 : 0.5);
    }
    let target = 0.06 + clamp(thr * 0.26, 0, 0.55) + (1 - this.hp / this.maxHp) * 0.35 + cb.hurtK * 0.25 + cb.stressBias;
    target = clamp(target, 0, 1);
    this.stress += (target - this.stress) * (1 - Math.exp(-dt * (target > this.stress ? 1.6 : 0.35))); // нарастает быстро, спадает медленно
    // сердцебиение — единственный косвенный намёк на высокий стресс (числа игроку не показываются)
    if (this.stress > 0.62 || this.hp < this.maxHp * 0.3) {
      cb.beatT -= dt;
      if (cb.beatT <= 0) { cb.beatT = lerp(1.0, 0.5, clamp((this.stress - 0.6) / 0.4, 0, 1)); this.snd && this.snd.play('beat', { k: 0.8 }); }
    }
    if (this.fxU) { this.fxU.uVig.value = 0.7 + this.stress * 0.22; }
  };

  // ------------------------------------------------------------------ оружие: цикл
  Run.prototype.fovNow = function () {
    const w = this.wp, b = this.baseFov;
    if (!w) return b;
    return lerp(b, w.def.adsFov * (b / 90), smooth(this.aimK || 0)) + (this.sprintK || 0) * 3;
  };

  Run.prototype.updateWeapon = function (dt) {
    const cb = this.cb, rg = this.rg, w = this.wp, p = this.p, st = this.stress, t = this.time;
    this.fireCd = Math.max(0, this.fireCd - dt); this.fireBuf = Math.max(0, this.fireBuf - dt);
    const k = Math.exp(-dt * 11);
    cb.kP *= k; cb.kY *= k; cb.kR *= k; cb.shk *= Math.exp(-dt * 7);
    rg.rec.back *= Math.exp(-dt * 16); rg.rec.up *= Math.exp(-dt * 13);
    rg.flashT -= dt; rg.flash.visible = rg.flashT > 0;
    cb.bloom = Math.max(0, cb.bloom - dt * 0.09);
    const ak = this.aimK;
    const sw = (0.0006 + st * 0.0032) * (0.35 + 0.65 * ak); // настоящее дрожание прицела: растёт со стрессом
    this.kickP = cb.kP + Math.sin(t * 1.1) * sw + Math.sin(t * 2.9) * sw * 0.4;
    this.kickY = cb.kY + Math.sin(t * 0.9 + 1) * sw + Math.sin(t * 2.3) * sw * 0.4;
    this.kickR = cb.kR + (this.extraRoll || 0); // extraRoll / extraShake: качка поезда, тряска лифта
    this.kickShake = cb.shk + st * 0.0012 + (this.extraShake || 0);
    if (cb.hitT > 0) { cb.hitT -= dt; if (cb.hitT <= 0) this.qs('.m-cross').classList.remove('hit'); }
    if (!w) { this.aimK = 0; return; }
    const d = w.def, K = this.keys;
    const running = (K.ShiftLeft || K.ShiftRight || this.runHeld || this.padRun) && p.moving > 0.3 && !this.aimWant;
    this.sprintK = lerp(this.sprintK, running ? 1 : 0, 1 - Math.exp(-dt * 9));
    // смена оружия: опустить -> переключить -> поднять
    if (this.swapTo) { this.swapOff = Math.min(1, this.swapOff + dt / 0.1); if (this.swapOff >= 1) { this.wp = this.swapTo; this.swapTo = null; this.rl = null; this.snd && this.snd.play('draw'); this.rigJolt(0.6, 3, sgn() * 1); this.refreshHud(); } }
    else if (this.swapOff > 0) this.swapOff = Math.max(0, this.swapOff - dt / 0.17);
    const busy = this.swapOff > 0.3 || this.swapTo;
    const want = this.aimWant && this.sprintK < 0.3 && !this.rl && !busy;
    this.aimK = clamp(this.aimK + (want ? 1.25 : -1.8) * dt / d.adsTime, 0, 1);
    this.layer.classList.toggle('ads', this.aimK > 0.6);
    // перезарядка
    const rl = this.rl;
    if (rl) this.stepReload(rl, dt);
    // стрельба
    if (this.fireHeld || this.padFire) { if (d.auto) this.tryFire(); else if (this.fireBuf > 0) this.tryFire(); }
    else if (this.fireBuf > 0 && !d.auto) this.tryFire();
    if (this.autoRel > 0) { this.autoRel -= dt; if (this.autoRel <= 0) this.startReload(); }
    const lockedBack = w.mag === 0 && !this.rl || (this.rl && this.rl.empty && !this.rl.done.rack && !d.shell); // пустой пистолет: затвор стоит сзади, пока его не отпустят
    rg.slide = lerp(rg.slide, lockedBack ? 1 : 0, 1 - Math.exp(-dt * (lockedBack ? 30 : 12)));
    if (rg.pump > 0) rg.pump = Math.max(0, rg.pump - dt / 0.5);
    this.updateMagDrops(dt);
  };

  Run.prototype.kick = function (p, y, r, shake) {
    const cb = this.cb;
    cb.kP += p; cb.kY += y; cb.kR += r; cb.shk = Math.max(cb.shk, (shake || 0) * (1 + this.stress * 1.2));
  };

  Run.prototype.startReload = function () {
    const w = this.wp; if (!w || this.rl || this.locked || this.swapTo) return false;
    const d = w.def, cap = d.mag + (d.chamber && w.mag > 0 ? 1 : 0);
    if (w.mag >= cap || w.reserve <= 0) return false;
    this.autoRel = 0;
    const mul = 1 + this.stress * 0.9; // чем выше скрытый стресс, тем дольше перезарядка
    this.rl = { def: d, id: w.id, t: 0, dur: d.reload * mul, done: {}, hold: 0, shell: !!d.shell, cyc: 0, cap, mul, age: 0, pk: 0, empty: w.mag === 0 };
    if (d.shell) this.kick(0.01, sgn() * 0.006, sgn() * 0.012, 0.003);
    return true;
  };

  Run.prototype.stepReload = function (rl, dt) {
    const w = this.wp, cb = this.cb;
    if (!w || w.id !== rl.id) { this.rl = null; return; }
    if (rl.shell) {
      if (rl.fin !== undefined) { // последний патрон встал: короткая подача цевья помпой, руки уходят
        rl.fin -= dt; rl.pk = clamp(rl.fin / 0.3, 0, 1);
        if (rl.fin <= 0) this.rl = null;
        return;
      }
      rl.age += dt; rl.pk = smooth(clamp(rl.age / 0.18, 0, 1));
      rl.t += dt; rl.cyc = (rl.t % (rl.dur)) / rl.dur;
      if (rl.t >= rl.dur) { // дробь вставлена
        rl.t -= rl.dur;
        w.mag += 1; w.reserve -= 1;
        this.snd && this.snd.play('shell');
        this.kick(-0.008, sgn() * 0.006, sgn() * 0.014, 0.003); this.rigJolt(0.3, 2.2, sgn() * 0.8);
        this.refreshHud();
        if (w.mag >= rl.def.mag || w.reserve <= 0) { rl.fin = 0.5; rl.cyc = 0; this.rg.pump = 1; this.snd && this.snd.play('pump'); this.kick(0.016, sgn() * 0.01, sgn() * 0.026, 0.006); this.rigJolt(-1, 3.5, sgn() * 1.5); }
      }
      return;
    }
    if (rl.hold > 0) { rl.hold -= dt; if (Math.random() < dt * 14) this.kick(rnd(-0.01, 0.01), sgn() * 0.01, sgn() * 0.02, 0.004); return; }
    rl.t += dt;
    const u = rl.t / rl.dur, ev = rl.def.ev;
    for (let i = 0; i < ev.length; i += 1) {
      const name = ev[i][0];
      if (rl.done[name] || u < ev[i][1]) continue;
      if (name === 'magin' && !rl.fumbled && this.stress > 0.42 && Math.random() < (this.stress - 0.3) * 0.75) { // дрожащие руки: магазин не встал с первого раза
        rl.fumbled = true; rl.hold = rnd(0.3, 0.55); this.snd && this.snd.play('magout', { k: 0.8, w: rl.id }); this.kick(0.02, sgn() * 0.012, sgn() * 0.03, 0.006); return;
      }
      rl.done[name] = true;
      const P = rlp(rl.id);
      if (name === 'magout') { this.snd && this.snd.play('magout', { w: rl.id }); this.kick(0.012 * P.cam, sgn() * 0.008, sgn() * 0.016, 0.004); this.rigJolt(0.3 * P.jolt, -3 * P.jolt, sgn() * 1.2 * P.jolt); this.dropMag(this.rg.models[rl.id], rl.def); }
      else if (name === 'magin') {
        this.snd && this.snd.play('magin', { w: rl.id }); this.kick(-0.03 * P.cam, sgn() * 0.014, sgn() * 0.04, 0.01 * P.cam); this.rigJolt(0.9 * P.jolt, 5 * P.jolt, sgn() * 1.5 * P.jolt);
        const take = Math.min(rl.cap - w.mag, w.reserve); w.mag += take; w.reserve -= take; this.refreshHud();
      } else if (name === 'rack') { this.snd && this.snd.play('rack'); this.kick(0.024 * P.cam, sgn() * 0.012, sgn() * 0.03, 0.008 * P.cam); this.rigJolt(-0.5 * P.jolt * (P.bolt || 1), 2 * P.jolt, sgn() * 2.2 * P.jolt * (P.bolt || 1)); this.rg.slide = 1; }
    }
    if (u >= 1) this.rl = null;
  };

  // ------------------------------------------------------------------ стрельба
  Run.prototype.pressFire = function () { this.fireBuf = 0.16; };
  Run.prototype.tryFire = function () {
    const w = this.wp, d = w && w.def;
    if (!w || this.locked || this.paused || this.fireCd > 0 || this.swapOff > 0.3 || this.swapTo || this.sprintK > 0.45) return false;
    if (this.rl) {
      if (this.rl.shell && w.mag > 0) { this.rl = null; } // дробовик можно прервать перезарядку выстрелом
      else return false;
    }
    if (w.mag <= 0) {
      this.fireCd = 0.28; this.fireBuf = 0; this.snd && this.snd.play('empty');
      if (w.reserve > 0) this.autoRel = 0.15;
      return false;
    }
    this.fireBuf = 0;
    w.mag -= 1;
    this.fireCd = d.rate;
    this.shoot(w);
    if (w.mag === 0 && w.reserve > 0 && !d.shell) this.autoRel = 0.35;
    this.refreshHud();
    return true;
  };

  Run.prototype.shoot = function (w) {
    const d = w.def, cb = this.cb, rg = this.rg, T = THREE, ak = this.aimK, p = this.p;
    const spreadBase = lerp(d.hip, d.ads, smooth(ak)) + cb.bloom + p.moving * lerp(0.03, 0.007, ak);
    const spread = spreadBase * (1 + this.stress * 0.9);
    const cam = this.camera, o = cam.position;
    const fwd = rg.v1; cam.getWorldDirection(fwd);
    // помощь прицеливания на тач-экране и геймпаде
    if (this.touch || this.padActive) this.assistDir(fwd, 0.055, 0.5);
    const right = rg.v2.set(1, 0, 0).applyQuaternion(cam.quaternion), up = rg.v3.set(0, 1, 0).applyQuaternion(cam.quaternion);
    let drawn = 0;
    for (let i = 0; i < d.pellets; i += 1) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      let dx = fwd.x + right.x * Math.cos(a) * r + up.x * Math.sin(a) * r, dy = fwd.y + right.y * Math.cos(a) * r + up.y * Math.sin(a) * r, dz = fwd.z + right.z * Math.cos(a) * r + up.z * Math.sin(a) * r;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const hit = this.castRay(o.x, o.y, o.z, dx, dy, dz, d.range);
      this.applyHit(hit, d.dmg, o, dx, dy, dz, d.pellets > 1);
      if (drawn < (d.pellets > 1 ? 3 : 1) || (d.auto && w.mag % 2 === 0)) { drawn += 1; this.tracerFrom(rg, w, hit, dx, dy, dz, o); }
    }
    // отдача: рывок камеры + реальный подъём ствола; стресс усиливает разброс отдачи
    const ar = 1 - 0.3 * ak, sm = 1 + this.stress * 0.35;
    this.kick(d.recoil * ar * sm, sgn() * d.recoilY * ar * sm, sgn() * 0.004, d.shake);
    p.pitch = Math.min(1.3, p.pitch + d.climb * ar);
    p.yaw += sgn() * d.recoilY * 0.12;
    rg.rec.back += d.back * (1 - 0.4 * ak); rg.rec.up += d.up * (1 - 0.4 * ak);
    rg.flashT = 0.045; rg.flash.scale.setScalar(rnd(0.7, 1.25)); rg.flash.rotation.z = Math.random() * 3;
    if (d.shell) rg.pump = 1;
    else { rg.slide = 0.1 + (w.mag === 0 ? 0.9 : 0); this.casing(false); }
    cb.bloom = Math.min(0.08, cb.bloom + d.bloom);
    this.torch.intensity = Math.max(this.torchKeep || 0, 2.6); cb.flashK = 1;
    this.snd && this.snd.shot(d.sound, { supp: this.suppressed });
    if (this.enemiesAlive() > 0) cb.lastCombat = this.time; // выстрел «в пустоту» перестрелкой не считается
    this.noise(this.suppressed ? 9 : 30); // шум выстрела привлекает врагов (stealth)
    if (d.shell) setTimeout(() => { if (this.disposed) return; this.snd && this.snd.play('pump'); this.casing(true); }, 260);
    this.rumble(d.pellets > 1 ? 0.9 : 0.5, 0.3, d.pellets > 1 ? 160 : 70);
  };

  // «магнит» прицела к ближайшему врагу в конусе (только тач / геймпад)
  Run.prototype.assistDir = function (dir, cone, k) {
    const o = this.camera.position;
    let best = null, bd = cone;
    for (const e of this.cb.enemies) {
      if (e.dead || e.t.passive && !e.assist) continue;
      const g = e.n.g.position, vx = g.x - o.x, vy = 1.2 - o.y, vz = g.z - o.z, l = Math.hypot(vx, vy, vz);
      if (l < 1 || l > 45) continue;
      const dot = (vx * dir.x + vy * dir.y + vz * dir.z) / l, ang = Math.acos(clamp(dot, -1, 1));
      if (ang < bd) { bd = ang; best = [vx / l, vy / l, vz / l]; }
    }
    if (best) { dir.x = lerp(dir.x, best[0], k); dir.y = lerp(dir.y, best[1], k); dir.z = lerp(dir.z, best[2], k); dir.normalize(); }
  };

  Run.prototype.castRay = function (ox, oy, oz, dx, dy, dz, range) {
    let best = { t: range, kind: 'none' };
    for (const c of this.colliders) {
      if (c.off) continue;
      const t = rayBox(ox, oy, oz, dx, dy, dz, c);
      if (t < best.t) best = { t, kind: 'wall', ax: _ax };
    }
    if (dy < -1e-6) { const t = -oy / dy; if (t > 0 && t < best.t) best = { t, kind: 'floor', ax: 2 }; }
    const ceil = this.bounds ? this.bounds.h : 3.4;
    if (dy > 1e-6) { const t = (ceil - oy) / dy; if (t > 0 && t < best.t) best = { t, kind: 'wall', ax: 2 }; }
    for (const s of this.cb.shoot) {
      if (!s.alive) continue;
      let t = Infinity, head = false;
      if (s.shape === 'sph') t = raySphere(ox, oy, oz, dx, dy, dz, s.x, s.y, s.z, s.r);
      else {
        t = rayCyl(ox, oy, oz, dx, dy, dz, s.x, s.z, s.r, s.y, s.y + s.h);
        if (s.hr) { const th = raySphere(ox, oy, oz, dx, dy, dz, s.x, s.y + s.hy, s.z, s.hr); if (th < t) { t = th; head = true; } }
      }
      if (t < best.t) best = { t, kind: 'obj', obj: s, head };
    }
    return best;
  };

  Run.prototype.applyHit = function (hit, dmg, o, dx, dy, dz, multi) {
    const px = o.x + dx * hit.t, py = o.y + dy * hit.t, pz = o.z + dz * hit.t, cb = this.cb;
    if (hit.kind === 'obj') {
      const s = hit.obj, falloff = multi ? clamp(1.2 - hit.t / 22, 0.25, 1) : 1;
      this.sparks(px, py, pz, 0, 1, 0, 3);
      s.damage(dmg * falloff * (hit.head ? 2.4 : 1), hit.head, { x: px, y: py, z: pz });
      this.hitmark(hit.head);
    } else if (hit.kind === 'wall' || hit.kind === 'floor') {
      const nx = hit.ax === 1 ? (dx > 0 ? -1 : 1) : 0, ny = hit.ax === 2 ? (dy > 0 ? -1 : 1) : 0, nz = hit.ax === 3 ? (dz > 0 ? -1 : 1) : 0;
      this.sparks(px, py, pz, nx, ny, nz, 4);
      if (!multi && this.snd && Math.random() < 0.6) this.snd.play('impact', { delay: hit.t / 340, k: 0.7 });
    }
  };

  Run.prototype.hitmark = function (head) {
    const cb = this.cb, c = this.qs('.m-cross');
    c.classList.add('hit'); cb.hitT = head ? 0.2 : 0.11;
    this.snd && this.snd.play(head ? 'head' : 'hit', { k: 0.8 });
  };

  Run.prototype.sparks = function (x, y, z, nx, ny, nz, n) {
    const S = this.cb.sparks;
    let c = 0;
    for (let i = 0; i < S.length && c < n; i += 1) {
      const s = S[i]; if (s.life > 0) continue;
      s.life = rnd(0.2, 0.4); s.m.visible = true; s.m.position.set(x, y, z);
      s.v.set(nx * rnd(0.5, 2.2) + rnd(-1.4, 1.4), ny * rnd(0.5, 2.2) + rnd(0, 1.8), nz * rnd(0.5, 2.2) + rnd(-1.4, 1.4));
      c += 1;
    }
  };

  Run.prototype.tracerFrom = function (rg, w, hit, dx, dy, dz, o, fromV) {
    const T = THREE, tr = this.cb.tracers.find((q) => q.life <= 0); if (!tr) return;
    const a = rg.v4;
    if (fromV) a.copy(fromV);
    else { const mdl = rg.models[w.id]; a.set(mdl.muzzle[0], mdl.muzzle[1], mdl.muzzle[2]); rg.root.localToWorld(a); }
    const t = Math.min(hit.t, 70), bx = o.x + dx * t, by = o.y + dy * t, bz = o.z + dz * t;
    const m = tr.m, len = Math.hypot(bx - a.x, by - a.y, bz - a.z);
    if (len < 0.3) return;
    m.visible = true; m.position.set((a.x + bx) / 2, (a.y + by) / 2, (a.z + bz) / 2); m.scale.set(1, 1, len); m.lookAt(bx, by, bz);
    tr.life = 0.07;
  };

  // ------------------------------------------------------------------ враги
  // ближайшая свободная точка для врага: не в стене/ящике и не за границами комнаты (среди равных — та, откуда видно игрока)
  Run.prototype.enemyFree = function (x, z) {
    const b = this.bounds;
    const ok = (px, pz) => !this.blockedE(px, pz) && (!b || (Math.abs(px - b.cx) < b.w / 2 - 0.45 && Math.abs(pz - b.cz) < b.d / 2 - 0.45));
    if (ok(x, z)) return { x, z, moved: 0 };
    let best = null;
    for (let r = 0.35; r <= 8 && !best; r += 0.35) {
      const n = Math.max(12, Math.round(r * 14)), found = [];
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
        if (ok(px, pz)) found.push({ x: px, z: pz, moved: r, los: this.hasLOS(px, 1.5, pz, this.p.x, EYE, this.p.z) });
      }
      if (found.length) best = found.find((f) => f.los) || found[0];
    }
    if (!best && b) best = { x: clamp(x, b.cx - b.w / 2 + 1, b.cx + b.w / 2 - 1), z: clamp(z, b.cz - b.d / 2 + 1, b.cz + b.d / 2 - 1), moved: 99 };
    return best || { x, z, moved: 0 };
  };
  Run.prototype.enemy = function (type, x, z, o) {
    this.combat();
    o = o || {};
    if (!o.exact) { const f = this.enemyFree(x, z); if (f.moved) { x = f.x; z = f.z; this.spawnFixes = (this.spawnFixes || 0) + 1; } } // враги не появляются в стенах
    const T = THREE, def = ETYPES[type] || ETYPES.grunt, cb = this.cb;
    let n = this.pool.find((q) => q.free);
    if (!n) {
      n = this.npc(x, z, 0);
      n.vest = new T.Mesh(this.g.box, new T.MeshBasicMaterial({ color: 0xf2f2f2 })); n.vest.scale.set(0.4, 0.4, 0.3); n.vest.position.y = 0.25; n.vest.visible = false; n.spine.add(n.vest); // белый жилет: «своих» не трогать
      this.pool.push(n);
    }
    this.actorReset(n); this.actorStyle(n, type, o.gun);
    n.vest.visible = !!o.friendly;
    n.free = false; n.g.visible = true; n.g.rotation.order = 'YXZ'; n.g.rotation.x = 0; n.g.position.set(x, 0, z); n.g.scale.setScalar(def.scale); n.g.rotation.y = n.yaw = o.yaw || 0;
    n.armT = 0; n.arm = 0; n.armAng = 1.45; n.goal = null; n.creeping = false; n.watch = false; n.tilt = n.tiltT = 0; if (n.flashM) n.flashM.visible = false;
    const m = o.hp || 1;
    const e = {
      n, t: def, type, hp: def.hp * m, max: def.hp * m, dead: false, alive: true, shape: 'cyl', y: 0, h: 1.8 * def.scale, r: 0.33 * def.scale, hr: 0.17 * def.scale, hy: 1.6 * def.scale,
      cd: rnd(0.4, 1.4), burst: 0, bt: 0, tele: 0, los: false, losT: rnd(0, 0.2), stagger: 0, strafe: sgn(), strafeT: rnd(0.8, 2), deadT: 0, atk: 0, flashT: 0, speedMul: o.speed || 1,
      passive: !!def.passive, onDeath: o.onDeath, ai: o.ai || null, tag: o.tag, drop: o.drop !== false, spawnT: 0.25, assist: !!o.assist, friendly: !!o.friendly
    };
    Object.defineProperty(e, 'x', { get() { return n.g.position.x; } });
    Object.defineProperty(e, 'z', { get() { return n.g.position.z; } });
    e.damage = (amt, head, pt) => this.damageEnemy(e, amt, head, pt);
    cb.enemies.push(e); cb.shoot.push(e);
    if (this.persona) this.persona(e, o); // personas.js: личность (параметры боя, поза, тактика)
    return e;
  };
  Run.prototype.enemiesAlive = function (filter) {
    let c = 0;
    for (const e of this.cb ? this.cb.enemies : []) if (!e.dead && !e.t.passive && !e.friendly && (!filter || filter(e))) c += 1;
    return c;
  };
  Run.prototype.clearEnemies = function (instant) {
    if (!this.cb) return;
    this.cb.enemies.forEach((e) => { e.dead = true; e.alive = false; e.n.free = true; e.n.g.visible = false; if (e.n.laser) e.n.laser.visible = false; });
    this.cb.enemies.length = 0; this.cb.shoot.length = 0;
  };

  Run.prototype.damageEnemy = function (e, amt, head, pt) {
    if (e.dead) return;
    if (e.t.armor && !head) amt *= e.t.armor;
    if (e.t.hArmor && head) amt *= e.t.hArmor;
    e.hp -= amt; e.stagger = e.t.stag !== undefined ? e.t.stag : e.type === 'heavy' || e.type === 'boss' ? 0.05 : 0.14; e.flashT = 0.06;
    if (e.pr) this.persHit(e, amt, head);
    if (!e.t.passive || e.hp > 0) this.actorHit(e.n, head, amt);
    if (!e.t.passive) {
      const o = this.camera.position, q = pt || { x: e.x, y: 1.3 * e.t.scale, z: e.z }, dx = q.x - o.x, dy = q.y - o.y, dz = q.z - o.z, l = Math.hypot(dx, dy, dz) || 1;
      this.bloodHit(q, head, amt, { x: dx / l, y: dy / l, z: dz / l });
      this.snd && this.snd.play(head ? 'bone' : 'flesh', { k: 1.4 });
    }
    if (e.passive && e.wake) e.wake();
    if (e.onHit) e.onHit(e, amt, head);
    if (e.hp <= 0) this.killEnemy(e, head);
  };
  Run.prototype.killEnemy = function (e, head) {
    e.dead = true; e.alive = false; e.deadT = 0; e.n.armT = 0; e.n.creeping = false; e.n.goal = null; if (e.n.flashM) e.n.flashM.visible = false;
    const cb = this.cb; cb.kills += 1;
    this.actorKill(e.n, head, this.camera && this.camera.position);
    if (this.persKill) this.persKill(e);
    this.dropGun(e.n); this.bloodPool(e.n, head);
    this.snd && this.snd.play('kill', { k: 0.8 });
    this.snd && this.snd.play('fall', { k: 0.8, delay: 0.55 });
    if (!e.friendly && !e.t.passive && this.stress > 0.3) cb.stressBias = Math.max(0, cb.stressBias - 0.02);
    if (e.drop && !e.t.passive && Math.random() < 0.38 && this.wp) { const w = this.wp; this.pickup(e.x + rnd(-0.3, 0.3), e.z + rnd(-0.3, 0.3), 'ammo', { id: w.id, amount: Math.ceil(w.def.mag * 0.7) }); }
    else if (e.drop && !e.t.passive && Math.random() < 0.12) this.pickup(e.x, e.z, 'health', { amount: 30 });
    e.onDeath && e.onDeath(e, head);
    cb.killHooks.forEach((f) => f(e, head));
    if (this.killcamNext && this.enemiesAlive() === 0 && !e.t.passive) { this.killcamNext = false; this.slowmo(0.22, 1.1); }
  };

  Run.prototype.blockedE = function (x, z) {
    for (const c of this.colliders) {
      if (c.off || (c.y0 !== undefined && c.y0 > 1.2)) continue; // потолочные балки врагам не мешают
      if (x > c.x0 - 0.34 && x < c.x1 + 0.34 && z > c.z0 - 0.34 && z < c.z1 + 0.34) return true;
    }
    return false;
  };
  Run.prototype.hasLOS = function (ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.hypot(dx, dy, dz);
    if (l < 0.01) return true;
    const ux = dx / l, uy = dy / l, uz = dz / l;
    for (const c of this.colliders) {
      if (c.off || c.glass) continue;
      if (rayBox(ax, ay, az, ux, uy, uz, c) < l) return false;
    }
    return true;
  };

  // ------------------------------------------------------------------ навигация врагов вокруг стен (BFS по сетке 0.7 м)
  // Сетка проходимости строится по blockedE и пересобирается, когда меняется набор открытых/закрытых дверей.
  Run.prototype.navGrid = function () {
    const b = this.bounds; if (!b) return null;
    let off = 0; for (const c of this.colliders) if (c.off) off += 1;
    const sig = this.colliders.length + ':' + off;
    if (this.nav && this.nav.sig === sig && this.nav.b === b) return this.nav;
    const st = 0.7, nx = Math.ceil(b.w / st), nz = Math.ceil(b.d / st), x0 = b.cx - b.w / 2, z0 = b.cz - b.d / 2, ok = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) {
      const x = x0 + (i + 0.5) * st, z = z0 + (j + 0.5) * st;
      ok[i + j * nx] = (Math.abs(x - b.cx) < b.w / 2 - 0.45 && Math.abs(z - b.cz) < b.d / 2 - 0.45 && !this.blockedE(x, z)) ? 1 : 0;
    }
    return (this.nav = { sig, b, st, nx, nz, x0, z0, ok, seen: new Int32Array(nx * nz), par: new Int32Array(nx * nz), tag: 0 });
  };
  Run.prototype.navPath = function (ax, az, bx, bz) {
    const N = this.navGrid(); if (!N) return null;
    const { st, nx, nz, x0, z0, ok, seen, par } = N;
    const near = (x, z) => {
      const i = Math.floor((x - x0) / st), j = Math.floor((z - z0) / st);
      for (let d = 0; d <= 4; d += 1) for (let a = -d; a <= d; a += 1) for (let c = -d; c <= d; c += 1) {
        if (Math.max(Math.abs(a), Math.abs(c)) !== d) continue;
        const ii = i + a, jj = j + c;
        if (ii >= 0 && jj >= 0 && ii < nx && jj < nz && ok[ii + jj * nx]) return ii + jj * nx;
      }
      return -1;
    };
    const s = near(ax, az), g = near(bx, bz);
    if (s < 0 || g < 0) return null;
    N.tag += 1; const tag = N.tag, q = [s]; seen[s] = tag; par[s] = -1;
    let found = s === g;
    for (let h = 0; h < q.length && !found; h += 1) {
      const cur = q[h], i = cur % nx, j = (cur - i) / nx;
      for (let a = -1; a <= 1 && !found; a += 1) for (let c = -1; c <= 1; c += 1) {
        if (!a && !c) continue;
        const ii = i + a, jj = j + c;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const k = ii + jj * nx;
        if (seen[k] === tag || !ok[k]) continue;
        if (a && c && (!ok[ii + j * nx] || !ok[i + jj * nx])) continue; // углы не режем
        seen[k] = tag; par[k] = cur; q.push(k);
        if (k === g) { found = true; break; }
      }
    }
    if (!found) return null;
    const path = [];
    for (let k = g; k !== -1 && k !== s; k = par[k]) path.push([x0 + ((k % nx) + 0.5) * st, z0 + (Math.floor(k / nx) + 0.5) * st]);
    return path.reverse();
  };

  Run.prototype.noise = function (radius) { // шум: пробуждает пассивных / патрулирующих врагов вокруг игрока
    if (!this.cb) return;
    const p = this.p;
    this.cb.enemies.forEach((e) => { if (e.hear && !e.dead && Math.hypot(e.x - p.x, e.z - p.z) < radius) e.hear(); });
  };

  Run.prototype.updateEnemies = function (dt, frozen) {
    const cb = this.cb, p = this.p;
    for (let i = cb.enemies.length - 1; i >= 0; i -= 1) {
      const e = cb.enemies[i], n = e.n, g = n.g;
      if (n.flashM) { e.flashT = Math.max(0, e.flashT - dt); n.flashM.visible = e.muz > 0; e.muz = Math.max(0, (e.muz || 0) - dt); }
      if (e.dead) {
        e.deadT += dt;
        if (e.deadT > 6) { g.visible = false; n.free = true; cb.enemies.splice(i, 1); const si = cb.shoot.indexOf(e); if (si >= 0) cb.shoot.splice(si, 1); }
        continue;
      }
      if (frozen) { if (n.laser) n.laser.visible = false; continue; }
      if (e.spawnT > 0) e.spawnT -= dt;
      const T = e.t, dx = p.x - g.position.x, dz = p.z - g.position.z, dist = Math.hypot(dx, dz) || 0.001;
      e.losT -= dt;
      if (e.losT <= 0) { e.losT = 0.2 + Math.random() * 0.1; const H = this.pmHd ? this.pmHd() : null; e.los = this.hasLOS(g.position.x, 1.5 * T.scale, g.position.z, H ? H[0] : p.x, H ? H[1] : EYE, H ? H[2] : p.z); }
      if (e.ai && e.ai(e, dt, this, dist)) continue;
      if (e.passive || e.friendly) continue;
      if (e.stagger > 0) { e.stagger -= dt; n.creeping = false; continue; }
      n.yaw = Math.atan2(dx, dz);
      const pm = e.pr ? this.persTick(e, dt, dist, dx, dz) : null; // выход личности: скорость, огонь, укрытие, поза
      if (pm && pm.yaw !== undefined) n.yaw = pm.yaw;
      if (e.spawnT <= 0 && (e.los ? dist < (T.melee ? 16 : T.rmax + 6) : e.tele > 0 || e.burst > 0)) cb.lastCombat = this.time; // враг видит игрока и идёт в бой — это уже перестрелка (трек fight1.mp3)
      if (e.spawnT <= 0 && e.los && !e.seen && dist < (T.melee ? 16 : T.rmax + 6)) { // первый контакт: враг заметил игрока (не чаще раза в 3.5 с на всех)
        e.seen = true;
        if (this.time - (cb.contactAt || -99) > 3.5 && this.snd && this.snd.has('contact')) { cb.contactAt = this.time; this.snd.play('contact', { k: 0.85 }); }
      }
      const sp = T.speed * e.speedMul * (this.slowEnemies || 1) * (pm ? pm.spd : 1);
      let vx = 0, vz = 0, moving = false;
      if (T.melee) {
        // рашер: бежит на игрока и бьёт
        if (dist > T.reach * 0.8) { vx = dx / dist * sp; vz = dz / dist * sp; moving = true; }
        e.cd -= dt;
        n.tilt = 0;
        if (dist < T.reach && e.cd <= 0 && e.atk <= 0) { e.atk = 0.3; n.armT = 1; n.armAng = 1.7; }
        if (e.atk > 0) { e.atk -= dt; if (e.atk <= 0) { n.armT = 0; if (Math.hypot(p.x - g.position.x, p.z - g.position.z) < T.reach + 0.35 && !(this.pmMelee && this.pmMelee(e, T.dmg, g.position.x, g.position.z))) this.hurt(T.dmg, g.position.x, g.position.z); e.cd = T.cd; } moving = false; vx = vz = 0; }
      } else {
        let want = (dist > T.rmax || !e.los) ? 1 : (dist < T.rmin ? -1 : 0);
        if (pm && pm.want !== undefined) want = pm.want;
        const sT = T.stT || [0.9, 2.2], sk = (T.strafeK !== undefined ? T.strafeK : 0.6) * (pm ? pm.lat : 1);
        e.strafeT -= dt; if (e.strafeT <= 0) { e.strafe = -e.strafe; e.strafeT = rnd(sT[0], sT[1]); }
        if (want !== 0) { vx = dx / dist * sp * want; vz = dz / dist * sp * want; moving = true; }
        if (sk && e.los && e.tele <= 0 && e.burst <= 0) { vx += -dz / dist * sp * sk * e.strafe; vz += dx / dist * sp * sk * e.strafe; moving = true; }
        if (pm && pm.mv) { const mx = pm.mv[0] - g.position.x, mz = pm.mv[1] - g.position.z, md = Math.hypot(mx, mz) || 0.001; vx = mx / md * sp; vz = mz / md * sp; moving = true; } // личность ведёт к точке (укрытие, раненый союзник)
        n.armT = pm && pm.aim !== undefined ? pm.aim : (e.los ? 1 : 0);
        e.cd -= dt;
        if (e.burst <= 0 && e.tele <= 0 && e.cd <= 0 && e.los && dist < T.rmax + 4 && (!pm || pm.fire)) e.tele = T.tele || 0.42; // телеграф перед очередью — враг поднимает руку
        if (e.tele > 0) { e.tele -= dt; const tm = T.teleMove !== undefined ? T.teleMove : 0.3; vx *= tm; vz *= tm; if (e.tele <= 0) { e.burst = Math.floor(rnd(T.burst[0], T.burst[1] + 1)); e.bt = 0; } }
        if (e.burst > 0) {
          const fm = T.fireMove !== undefined ? T.fireMove : 0.2; vx *= fm; vz *= fm;
          e.bt -= dt;
          if (e.bt <= 0) { e.bt = T.rate; e.burst -= 1; this.enemyShoot(e, dist); if (e.burst <= 0) e.cd = rnd(T.cd[0], T.cd[1]) * (pm ? pm.cdK : 1); }
        }
      }
      if (pm && pm.freeze) { vx = vz = 0; moving = false; } // присел в укрытии / перезаряжается / бьёт в ближнем бою / чинит союзника
      if (moving) {
        // обход стен: игрока не видно и враг почти не продвигается (упёрся в стену / косяк двери) — идёт по пути по сетке
        if (pm && pm.mv) e.path = null;
        else if (!e.los && dist > 2) {
          e.nt = (e.nt || 0) - dt;
          if (e.nt <= 0) {
            e.nt = 0.5;
            const moved = e.np ? Math.hypot(g.position.x - e.np[0], g.position.z - e.np[1]) : 9;
            e.np = [g.position.x, g.position.z];
            if (moved < sp * 0.2 && !(e.path && e.path.length) && (cb.navAt || 0) <= this.time) { cb.navAt = this.time + 0.1; e.path = this.navPath(g.position.x, g.position.z, p.x, p.z); e.pathT = 4; }
          }
        } else if (e.los) e.path = null;
        if (e.path && e.path.length) {
          e.pathT -= dt;
          let w = e.path[0];
          while (e.path.length > 1 && Math.hypot(w[0] - g.position.x, w[1] - g.position.z) < 0.5) { e.path.shift(); w = e.path[0]; }
          const wd = Math.hypot(w[0] - g.position.x, w[1] - g.position.z) || 0.001;
          if (e.pathT <= 0 || (e.path.length === 1 && wd < 0.35)) e.path = null;
          else { vx = (w[0] - g.position.x) / wd * sp; vz = (w[1] - g.position.z) / wd * sp; }
        }
        const nx = g.position.x + vx * dt, nz = g.position.z + vz * dt;
        let ok = false;
        if (!this.blockedE(nx, g.position.z)) { g.position.x = nx; ok = true; }
        if (!this.blockedE(g.position.x, nz)) { g.position.z = nz; ok = true; }
        if (!ok) { e.strafe = -e.strafe; e.strafeT = 0.6; }
      }
      // не слипаться друг с другом и с игроком
      for (const o of cb.enemies) {
        if (o === e || o.dead) continue;
        const ox = g.position.x - o.n.g.position.x, oz = g.position.z - o.n.g.position.z, od = Math.hypot(ox, oz);
        if (od < 0.8 && od > 0.001) { const push = (0.8 - od) * 2 * dt, px = g.position.x + ox / od * push, pz = g.position.z + oz / od * push; if (!this.blockedE(px, g.position.z)) g.position.x = px; if (!this.blockedE(g.position.x, pz)) g.position.z = pz; }
      }
      if (dist < 0.8) { const px = g.position.x - dx / dist * (0.8 - dist), pz = g.position.z - dz / dist * (0.8 - dist); if (!this.blockedE(px, g.position.z)) g.position.x = px; if (!this.blockedE(g.position.x, pz)) g.position.z = pz; }
      if (this.blockedE(g.position.x, g.position.z)) { const f = this.enemyFree(g.position.x, g.position.z); g.position.x = f.x; g.position.z = f.z; } // страховка: вытолкнуть из стены
      n.creeping = moving;
    }
  };

  Run.prototype.enemyShoot = function (e, dist) {
    const T = e.t, p = this.p, g = e.n.g, cam = this.camera;
    e.muz = 0.05; e.n.kick = 1; this.cb.lastCombat = this.time;
    const pm = e.pm; if (e.pr) this.persShot(e);
    this.snd && this.snd.shot(e.n.gunKind === 'pistol' ? 'epistol' : e.n.gunKind === 'shotgun' ? 'shotgun' : e.n.gunKind === 'lmg' ? 'elmg' : 'erifle', { dist, at: [e.x, 1.4, e.z] });
    const moving = p.moving > 0.3 ? 0.8 : 1, cover = this.aimK > 0.5 ? 0.9 : 1;
    const ph = T.acc * (1 - clamp(dist / 34, 0, 0.7)) * moving * cover * (e.type === 'boss' ? 1 : 1) * (this.pmAim ? this.pmAim() : 1) * (pm ? pm.acc : 1);
    const H = this.pmHd ? this.pmHd() : null;
    const gv = this.rg.v4.set(g.position.x, 1.35 * T.scale, g.position.z);
    const hit = Math.random() < ph;
    const tx = (H ? H[0] : p.x) + (hit ? 0 : rnd(-1.4, 1.4)), ty = (H ? H[1] : EYE) - 0.25 + (hit ? 0 : rnd(-0.5, 0.7)), tz = (H ? H[2] : p.z) + (hit ? 0 : rnd(-1.4, 1.4));
    const dx = tx - gv.x, dy = ty - gv.y, dz = tz - gv.z, l = Math.hypot(dx, dy, dz);
    const tr = this.cb.tracers.find((q) => q.life <= 0);
    if (tr) { const len = l + (hit ? 0 : 6); tr.m.visible = true; tr.m.position.set(gv.x + dx / l * len / 2, gv.y + dy / l * len / 2, gv.z + dz / l * len / 2); tr.m.scale.set(1, 1, len); tr.m.lookAt(gv.x + dx / l * len, gv.y + dy / l * len, gv.z + dz / l * len); tr.life = 0.09; }
    if (hit) this.hurt(T.dmg * (pm ? pm.dmg : 1), g.position.x, g.position.z);
    else {
      this.cb.stressBias = Math.min(0.2, this.cb.stressBias + 0.01);
      this.stress = Math.min(1, this.stress + 0.035); // свист пули рядом — стресс растёт
      this.snd && this.snd.play('whizz', { k: 0.8 });
    }
  };

  // ------------------------------------------------------------------ здоровье игрока, смерть, чекпоинты
  Run.prototype.hurt = function (amt, fx, fz) {
    const cb = this.cb;
    if (!cb || this.dead || this.cineDepth > 0 || this.ending || this.god) return;
    amt *= this.mercy || 1;
    this.hp = Math.max(0, this.hp - amt);
    cb.lastHurt = cb.lastCombat = this.time; cb.hurtK = 1;
    this.stress = Math.min(1, this.stress + amt / 45);
    this.kick(rnd(-0.02, 0.03), sgn() * 0.02, sgn() * 0.04, 0.012);
    this.snd && this.snd.play('hurt');
    this.rumble(0.8, 0.6, 180);
    if (fx !== undefined) {
      const rel = wrap(Math.atan2(-(fx - this.p.x), -(fz - this.p.z)) - this.p.yaw), el = this.qs('.m-hurt');
      const side = Math.abs(rel) < Math.PI / 4 ? 't' : Math.abs(rel) > 3 * Math.PI / 4 ? 'b' : rel > 0 ? 'l' : 'r';
      const i = el.querySelector('.' + side); if (i) { i.style.transition = 'none'; i.style.opacity = '1'; void i.offsetWidth; i.style.transition = 'opacity .9s ease-out'; i.style.opacity = '0'; }
    }
    this.refreshHud();
    if (this.hp <= 0) this.die();
  };
  Run.prototype.heal = function (amt) { if (!this.cb) return; this.hp = Math.min(this.maxHp, this.hp + amt); this.refreshHud(); };
  Run.prototype.die = function (reason) {
    if (this.dead) return;
    this.dead = true; this.deathReason = reason || 'SIGNAL LOST';
    this.snd && this.snd.play('death');
    this.fireHeld = false; this.padFire = false; this.aimWant = false; this.rl = null;
    this.syncLock();
    if (this.cb) this.cb.deaths += 1;
    if (this.deathRes) this.deathRes();
    else this.recover(null);
  };

  // phase(): участок миссии с чекпоинтом. fn выполняется заново после каждой смерти; всё созданное внутри очищается.
  // skip — необязательное описание «пропуска сектора» как в GTA 5: после 2 провалов подряд игрок может пропустить участок.
  //   { pos: [x, z, yaw], weapons: ['ak'], set: (r) => ... } — куда телепортировать, что выдать и что выставить так, как оставил бы успешный проход.
  const onlineNow = () => !!((window.NN && window.NN.connected) || (window.NexaCoop && window.NexaCoop.active));
  Run.prototype.phase = async function (name, fn, skip) {
    let fails = 0;
    const snap = {
      hooks: this.hooks.length, inter: this.interactables.length, sigs: Object.keys(this.sig), light: this.lightLevel, amb: this.ambBase,
      bars: this.layer.classList.contains('bars'), fog: this.scene.fog ? this.scene.fog.density : 0, fogC: this.scene.fog ? this.scene.fog.color.getHex() : 0,
      inv: this.inv ? this.inv.map((w) => ({ id: w.id, mag: w.mag, reserve: w.reserve })) : [], cur: this.wp ? this.wp.id : null, ts: this.torchKeep || 0
    };
    for (;;) {
      this.phaseName = name;
      snap.pos = { x: this.p.x, z: this.p.z, yaw: this.p.yaw };
      this.dead = false; this.syncLock();
      if (this.cb) { this.hp = this.maxHp; this.stress = Math.min(this.stress, 0.2); this.refreshHud(); }
      const dead = new Promise((res) => { this.deathRes = res; });
      const ok = await Promise.race([fn(this).then(() => true), dead.then(() => false)]);
      this.deathRes = null;
      if (ok) return;
      fails += 1;
      if (await this.recover(snap, skip && fails >= 2 && !onlineNow() ? { fails, skip } : null) === 'skip' && !onlineNow()) return;
    }
  };

  // мгновенно открытая дверь (без анимации)
  Run.prototype.openNow = function (d) { if (!d) return; if (d.userData.col) d.userData.col.off = true; d.position.y = (d.userData.h || 2.5) + 2.5; };
  // состояние «участок пройден»: общие хвосты фазы + то, что описано в skip
  Run.prototype.applySkip = function (sk) {
    if (onlineNow()) return;
    if (this.bulk) this.bulk.stop();
    Object.keys(this.beacons || {}).forEach((k) => { this.beacons[k].visible = false; });
    this.banner && this.banner(null); this.meter(null); this.waypoint(null);
    (sk.weapons || []).forEach((id) => { if (!this.inv.some((w) => w.id === id)) this.giveWeapon(id, { equip: true }); });
    if (sk.pos) { this.p.x = sk.pos[0]; this.p.z = sk.pos[1]; this.p.yaw = sk.pos[2] || 0; this.p.pitch = 0; this.prevYaw = undefined; }
    sk.set && sk.set(this);
  };
  // выбор на экране смерти: 'retry' | 'skip' (клавиатура: Enter / K, геймпад: A / Y, тач и мышь: кнопки)
  Run.prototype.askSkip = function () {
    return new Promise((res) => {
      const box = this.qs('.m-opts'), pad = !!this.padObj;
      this.qs('.m-retry').textContent = this.touch ? '[RETRY]' : pad ? '[A] RETRY' : '[ENTER] RETRY';
      this.qs('.m-skipsec').textContent = this.touch ? '[SKIP SECTOR]' : pad ? '[Y] SKIP SECTOR' : '[K] SKIP SECTOR';
      this.qs('.m-skipsec').style.display = onlineNow() ? 'none' : '';
      box.hidden = false;
      this.choice = { res, t0: Date.now() };
      if (!this.touch && document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) {} } // чтобы можно было кликнуть мышью
    });
  };
  Run.prototype.choose = function (v) {
    const c = this.choice;
    if (v === 'skip' && onlineNow()) v = 'retry';
    if (!c || Date.now() - c.t0 < 600) return; // защита от случайного нажатия сразу после смерти
    this.choice = null;
    this.qs('.m-opts').hidden = true;
    if (!this.touch && !document.pointerLockElement) this.requestLock();
    c.res(v);
  };

  Run.prototype.recover = async function (snap, offer) {
    // остановить всё, что запустила прошлая попытка
    this.tw = []; this.waiters = []; this.gazers = []; this.sigRes = {};
    if (snap) { this.hooks.length = snap.hooks; this.interactables.length = snap.inter; Object.keys(this.sig).forEach((k) => { if (snap.sigs.indexOf(k) < 0) delete this.sig[k]; }); }
    this.npcs.forEach((n) => { if (!n.free) n.goal = null; });
    this.cineDepth = 0; this.timeScale = 1; this.slowEnemies = 1; this.spawning = 0; this.extraRoll = 0; this.extraShake = 0;
    this.sayId = (this.sayId || 0) + 1; this.sub.classList.remove('on'); C.voice && C.voice.stop(this);
    this.meter(null); this.waypoint(null);
    this.snd && this.snd.music.duck(0.35);
    // показываем смерть: кинематика deathcam.js (падение, камера, звук, угасание → чёрный экран с кнопкой «Возродиться»); без неё — старый экран
    const end = this.qs('.m-end');
    let pick = 'retry', dcDone = false;
    if (C.deathcam && C.deathcam.ok(this)) {
      const got = await C.deathcam.play(this, offer);
      if (got) { pick = got; dcDone = true; }
      if (this.disposed) return pick;
    }
    if (!dcDone) {
      this.timeScale = 0.5;
      this.glitch(0.5);
      await this.fade(1, 0.9);
      this.timeScale = 1;
      end.querySelector('h2').textContent = this.deathReason || 'SIGNAL LOST';
      end.classList.add('on');
    }
    if (dcDone) { /* выбор уже сделан на чёрном экране */ } else if (offer) {
      end.querySelector('p').innerHTML = 'SUBJECT 083<br>SECTOR FAILED ' + offer.fails + ' TIMES IN A ROW<br>SKIP IT?';
      pick = await this.askSkip();
      if (this.disposed) return pick;
      end.querySelector('p').innerHTML = 'SUBJECT 083<br>' + (pick === 'skip' ? 'SKIPPING SECTOR...' : 'RECONNECTING TO LAST CHECKPOINT...');
      await this.wait(0.8);
    } else {
      end.querySelector('p').innerHTML = 'SUBJECT 083<br>RECONNECTING TO LAST CHECKPOINT...';
      await this.wait(2);
    }
    // сброс состояния
    this.clearEnemies(); this.clearPickups(); this.clearBlood(); this.cb && this.cb.proj.forEach((q) => { q.life = 0; q.m.visible = false; });
    if (this.cb) {
      this.hp = this.maxHp; this.stress = 0.1; this.cb.stressBias = 0; this.cb.hurtK = 0; this.rl = null; this.swapTo = null;
      this.mercy = Math.max(0.5, 1 - 0.12 * this.cb.deaths); // после нескольких смертей игра немного прощает
      if (snap) {
        this.inv = snap.inv.map((s) => { const d = WEAPONS[s.id]; return { id: s.id, def: d, mag: d.mag, reserve: Math.max(s.reserve, d.reserve) }; });
        this.wp = this.inv.find((w) => w.id === snap.cur) || this.inv[0] || null;
      } else if (this.inv) this.inv.forEach((w) => { w.mag = w.def.mag; w.reserve = Math.max(w.reserve, w.def.reserve); });
      this.refreshHud();
    }
    const pt = snap ? snap.pos : { x: this.spawnPt[0], z: this.spawnPt[1], yaw: this.spawnPt[2] };
    this.p.x = pt.x; this.p.z = pt.z; this.p.yaw = pt.yaw; this.p.pitch = 0; this.prevYaw = undefined;
    if (snap) { this.layer.classList.toggle('bars', snap.bars); this.setAmbient(snap.amb); this.lightsLevel(snap.light); if (this.scene.fog) { this.scene.fog.density = snap.fog; this.scene.fog.color.setHex(snap.fogC); } this.torchKeep = snap.ts; }
    this.layer.classList.remove('glitch');
    end.classList.remove('on');
    this.snd && this.snd.music.duck(1);
    this.dead = false; this.syncLock();
    if (pick === 'skip') this.applySkip(offer.skip);
    await this.fade(0, 0.8);
    return pick;
  };

  Run.prototype.slowmo = function (scale, sec) {
    const f0 = this.slowF0 || (this.slowF0 = this.baseFov);
    this.timeScale = scale;
    this.zoom(f0 - 12, 0.25);
    setTimeout(() => { if (this.disposed) return; this.timeScale = 1; this.zoom(f0, 0.5); this.slowF0 = 0; }, sec * 1000);
  };

  // ------------------------------------------------------------------ предметы, снаряды, эффекты
  Run.prototype.pickup = function (x, z, kind, o) {
    const T = THREE, cb = this.cb || this.combat().cb;
    o = o || {};
    const g = new T.Group();
    const col = kind === 'weapon' ? 0xffffff : kind === 'health' ? 0xdddddd : 0xbbbbbb;
    const box = new T.Mesh(this.g.box, new T.MeshBasicMaterial({ color: col })); box.scale.set(kind === 'weapon' ? 0.7 : 0.32, 0.16, kind === 'weapon' ? 0.2 : 0.22); box.position.y = 0.9; g.add(box);
    const beam = new T.Mesh(this.g.box, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false })); beam.scale.set(0.12, 2.6, 0.12); beam.position.y = 1.3; g.add(beam);
    g.position.set(x, 0, z); this.scene.add(g);
    const pk = { g, kind, o, x, z, t: Math.random() * 6, box };
    cb.pickups.push(pk);
    if (kind !== 'gadget' && this.pickupModel) this.pickupModel(pk);
    return pk;
  };
  Run.prototype.clearPickups = function () { if (!this.cb) return; this.cb.pickups.forEach((p) => { p.g.visible = false; p.dead = true; }); this.cb.pickups.length = 0; };
  Run.prototype.toast = function (text, sec) {
    const el = this.qs('.m-toast'); el.textContent = text; el.classList.add('on');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => { el.classList.remove('on'); }, (sec || 2) * 1000);
  };
  Run.prototype.updatePickups = function (dt) {
    const cb = this.cb, p = this.p;
    for (let i = cb.pickups.length - 1; i >= 0; i -= 1) {
      const k = cb.pickups[i]; k.t += dt; k.box.rotation.y += dt * 2; k.box.position.y = 0.9 + Math.sin(k.t * 3) * 0.06;
      if (!k.fx) { // предмет внутри ящика/колонны недоступен: вынести в ближайшую свободную точку (когда мир уже построен)
        k.fx = 1;
        if (this.blocked(k.x, k.z)) {
          let f = null;
          for (let d = 0.1; d <= 2.4 && !f; d += 0.1) {
            const n = Math.max(8, Math.round(d * 24));
            for (let a = 0; a < n && !f; a += 1) { const ang = a / n * Math.PI * 2, px = k.x + Math.sin(ang) * (d + 0.15), pz = k.z + Math.cos(ang) * (d + 0.15); if (!this.blocked(px, pz)) f = { x: px, z: pz }; }
          }
          if (f) { k.x = f.x; k.z = f.z; k.g.position.set(f.x, 0, f.z); }
        }
      }
      if (this.locked || Math.hypot(p.x - k.x, p.z - k.z) > 1.0) continue;
      let ok = true;
      if (k.kind === 'ammo') {
        const w = this.inv.find((x) => x.id === k.o.id) || this.wp;
        if (!w) ok = false; else if (w.reserve >= w.def.maxReserve) ok = false; else { w.reserve = Math.min(w.def.maxReserve, w.reserve + (k.o.amount || w.def.mag)); this.toast('AMMO +' + (k.o.amount || w.def.mag), 1.2); }
      } else if (k.kind === 'health') { if (this.hp >= this.maxHp) ok = false; else { this.heal(k.o.amount || 30); this.toast('INTEGRITY +' + (k.o.amount || 30), 1.2); } }
      else if (k.kind === 'gadget') { if (this.addGadget) this.addGadget(k.o.id, k.o.n || 1); }
      else if (k.kind === 'weapon') { this.giveWeapon(k.o.id, { equip: k.o.equip !== false, reserve: k.o.reserve }); this.toast(WEAPONS[k.o.id].name + ' ACQUIRED', 2); k.o.onTake && k.o.onTake(); }
      if (!ok) continue;
      this.snd && this.snd.play(k.kind === 'health' ? 'medkit' : k.kind === 'ammo' ? 'ammopickup' : 'pickup');
      this.scene.remove(k.g); cb.pickups.splice(i, 1); this.refreshHud();
    }
  };

  Run.prototype.projectile = function (x, y, z, tx, ty, tz, speed, dmg) {
    const T = THREE, cb = this.cb;
    let q = cb.proj.find((s) => s.life <= 0);
    if (!q) { if (cb.proj.length > 24) return; q = { m: new T.Mesh(new T.SphereGeometry(0.16, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff })), v: new T.Vector3(), life: 0 }; this.scene.add(q.m); cb.proj.push(q); }
    q.m.visible = true; q.m.position.set(x, y, z);
    q.v.set(tx - x, ty - y, tz - z).normalize().multiplyScalar(speed); q.life = 5; q.dmg = dmg;
  };
  Run.prototype.barrel = function (x, z) {
    const T = THREE, cb = this.combat().cb;
    const m = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 1, 10), this.mat(0x777777)); m.position.set(x, 0.5, z); this.scene.add(m);
    const band = new T.Mesh(new T.CylinderGeometry(0.31, 0.31, 0.12, 10), this.basic(0xeeeeee)); band.position.set(x, 0.62, z); this.scene.add(band);
    const col = { x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: 0, y1: 1 }; this.colliders.push(col);
    this.barrelModel && this.barrelModel(m, band);
    const b = { shape: 'cyl', alive: true, x, z, y: 0, h: 1, r: 0.3, hp: 30, m, band, col, damage: null, barrel: true };
    b.damage = (amt, head, pt) => { if (!b.alive) return; b.hp -= amt; if (b.hp <= 0) { b.alive = false; col.off = true; m.visible = band.visible = false; const i = cb.shoot.indexOf(b); if (i >= 0) cb.shoot.splice(i, 1); this.explode(x, 0.6, z, 4.2, 70, 'barrel'); } };
    cb.shoot.push(b);
    return b;
  };
  Run.prototype.explode = function (x, y, z, R, dmg) {
    const cb = this.cb;
    this.sparks(x, y, z, 0, 1, 0, 14);
    cb.blast.visible = true; cb.blast.position.set(x, y, z); cb.blast.userData = { t: 0, R };
    this.snd && this.snd.play('boom');
    this.flash(0.25);
    const p = this.p, d = Math.hypot(p.x - x, p.z - z);
    if (d < R + 1.5) { this.kick(0.05, sgn() * 0.03, sgn() * 0.06, 0.03); this.rumble(1, 1, 300); }
    if (d < R) this.hurt(dmg * 0.6 * (1 - d / R), x, z);
    cb.enemies.slice().forEach((e) => { if (e.dead) return; const ed = Math.hypot(e.x - x, e.z - z); if (ed < R) this.damageEnemy(e, dmg * 2.2 * (1 - ed / R) + 20, false); });
    cb.shoot.slice().forEach((s) => { if (s.barrel && s.alive && Math.hypot(s.x - x, s.z - z) < R) setTimeout(() => { if (!this.disposed) s.damage(99); }, 90); });
  };

  Run.prototype.updateFx = function (dt) {
    const cb = this.cb;
    for (const s of cb.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt; s.v.y -= 9 * dt; s.m.position.addScaledVector(s.v, dt);
      if (s.m.position.y < 0.02) { s.m.position.y = 0.02; s.v.y *= -0.3; }
      if (s.life <= 0) s.m.visible = false;
    }
    for (const t of cb.tracers) { if (t.life <= 0) continue; t.life -= dt; if (t.life <= 0) t.m.visible = false; }
    const b = cb.blast;
    if (b.visible) { const u = b.userData; u.t += dt; const k = u.t / 0.35; b.scale.setScalar(0.5 + k * u.R); b.material.opacity = Math.max(0, 0.7 * (1 - k)); if (k >= 1) b.visible = false; }
    if (cb.flashK > 0) { cb.flashK = Math.max(0, cb.flashK - dt * 18); this.torch.intensity = Math.max(this.torchKeep || 0, cb.flashK * 2.6); }
    // снаряды врагов
    const p = this.p;
    for (const q of cb.proj) {
      if (q.life <= 0) continue;
      q.life -= dt; q.m.position.addScaledVector(q.v, dt);
      const pp = q.m.position;
      if (Math.hypot(pp.x - p.x, pp.z - p.z) < 0.55 && pp.y > 0.2 && pp.y < 1.9) { q.life = 0; this.hurt(q.dmg, pp.x - q.v.x, pp.z - q.v.z); }
      else if (this.blocked(pp.x, pp.z) && pp.y < 3) q.life = Math.min(q.life, 0.01);
      if (q.life <= 0) q.m.visible = false;
    }
    this.updateBlood(dt); this.updateDrops(dt); this.updateCasings(dt);
    if (cb.hurtK > 0) { cb.hurtK = Math.max(0, cb.hurtK - dt * 1.6); const h = this.qs('.m-hurt'); h.style.opacity = String(Math.round(cb.hurtK * 100) / 100); }
  };

  // ------------------------------------------------------------------ HUD
  Run.prototype.refreshHud = function () {
    const cb = this.cb; if (!cb) return;
    const hp = Math.ceil(this.hp);
    if (hp !== cb.hpShown) {
      cb.hpShown = hp;
      this.qs('.m-hp i').style.width = Math.round(this.hp / this.maxHp * 100) + '%';
      this.qs('.m-hp b').textContent = String(hp);
      this.layer.classList.toggle('low', this.hp < this.maxHp * 0.3);
    }
    const w = this.wp;
    if (w) {
      const s = w.mag + '|' + w.reserve;
      if (s !== cb.ammoShown) { cb.ammoShown = s; const b = this.qs('.m-ammo b'); b.innerHTML = w.mag + ' <em>/ ' + w.reserve + '</em>'; this.qs('.m-ammo').classList.toggle('low', w.mag <= Math.ceil(w.def.mag * 0.25)); }
      if (w.def.name !== cb.nameShown) {
        cb.nameShown = w.def.name;
        const tg = w.def.tag || ['', w.def.auto ? 'AUTO' : 'SEMI'], sm = this.qs('.m-ammo small');   // калибр и режим огня вместо названия (оно уже есть в иконке хотбара)
        sm.innerHTML = '<i translate="no"></i> <i></i>'; sm.firstChild.textContent = tg[0]; sm.lastChild.textContent = tg[1];
        this.qs('.m-ammo').dataset.k = w.id;
      }
    }
  };
  Run.prototype.rumble = function (strong, weak, ms) {
    const buzz = !this.padObj && this.touch && navigator.vibrate && (!window.NexaSettings || NexaSettings.get('touch.haptics')); // Android: вибрация телефона вместо вибромоторов геймпада
    if ((!this.padObj && !buzz) || this.rumbleOff) return;
    const now = performance.now(); if (now < (this.rumbleT || 0)) return;
    this.rumbleT = now + ms * 0.6;
    if (buzz) { try { navigator.vibrate(Math.max(12, Math.min(70, Math.round(ms * strong * 0.5)))); } catch (e) {} return; }
    try { const a = this.padObj.vibrationActuator; a && a.playEffect && a.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: weak, strongMagnitude: strong }); } catch (e) {}
  };

  // путевая точка: белый ромб с расстоянием (чтобы ничего не приходилось запоминать)
  Run.prototype.waypoint = function (target, label) {
    this.wpt = target ? { target, label: label || '' } : null;
    const el = this.wpEl;
    if (el && !target) el.style.display = 'none';
  };
  Run.prototype.updateWaypoint = function () {
    if (!this.wpt || !this.wpEl) return;
    const el = this.wpEl, w = this.wpt;
    const tg = typeof w.target === 'function' ? w.target() : w.target;
    const pos = this.wpV.copy(tg.g ? tg.g.position : Array.isArray(tg) ? { x: tg[0], y: tg[1], z: tg[2] } : tg);
    if (tg.g) pos.y = 1.8;
    const dist = Math.hypot(pos.x - this.p.x, pos.z - this.p.z);
    const cp = this.camera.position;
    const f = this.wpF; this.camera.getWorldDirection(f);
    const behind = ((pos.x - cp.x) * f.x + (pos.y - cp.y) * f.y + (pos.z - cp.z) * f.z) < 0;
    pos.project(this.camera);
    let x = pos.x, y = pos.y;
    if (behind) { x = -x; y = -1; }
    const off = behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.86;
    x = clamp(x, -0.92, 0.92); y = clamp(y, -0.82, 0.82);
    el.style.display = this.cineDepth > 0 || this.inCinema ? 'none' : 'block';
    el.style.transform = 'translate(' + ((x * 0.5 + 0.5) * this.w).toFixed(0) + 'px,' + ((-y * 0.5 + 0.5) * this.h).toFixed(0) + 'px)';
    el.classList.toggle('off', off);
    const near = dist < 20;
    el.classList.toggle('near', near);
    el.querySelector('b').textContent = (near && w.label ? w.label + ' ' : '') + Math.round(dist) + 'M';
  };

  // перестрелка для трека fight1.mp3: она НАЧИНАЕТСЯ с настоящего боя (враг стреляет, по игроку попали или игрок стреляет во врага) —
  // не с оружия в руках и не с появления врагов. Идёт, пока враги живы и бой не затих дольше 12 с; после убийства последнего врага — ещё 3 с.
  // В катсцене, после смерти и в финале — тишина.
  Run.prototype.fightWant = function () {
    const cb = this.cb;
    if (this.dead || this.ending || this.inCinema || this.cineDepth > 0) { cb.fightOn = false; return false; }
    const since = this.time - cb.lastCombat;
    if (!cb.fightOn) {
      if (since < 0.4) cb.fightOn = true; // свежее боевое событие
    } else if (since > (this.enemiesAlive() > 0 ? 12 : 3)) cb.fightOn = false;
    return cb.fightOn;
  };

  // ------------------------------------------------------------------ цикл боя
  Run.prototype.updateCombat = function (dt) {
    if (!this.cb) { this.updateWaypoint(); return; }
    const cb = this.cb;
    this.updateStress(dt);
    this.updateWeapon(dt);
    const frozen = this.cineDepth > 0 || this.dead;
    this.updateEnemies(dt, frozen);
    this.updatePickups(dt); this.updateFx(dt);
    // регенерация целостности после паузы без урона
    if (cb.regen && !this.dead && this.hp < this.maxHp && this.time - cb.lastHurt > 4.5) { this.hp = Math.min(this.maxHp, this.hp + 9 * dt); this.refreshHud(); }
    if (this.snd) { this.snd.fight.tick(dt, this.noFight ? false : this.fightWant()); this.snd.ambient.tick(); } // noFight: у миссии свой трек (ограбление)
    if (this.snd && this.snd.music.on) {
      const pressure = clamp(this.enemiesAlive() / 5, 0, 1);
      this.snd.music.level(0.3 + 0.7 * Math.max(this.stress, pressure * 0.8));
    }
    this.updateWaypoint();
    if (this.fxU && this.q.fx === 'full') this.fxU.uCA.value = 0.0025 + this.stress * 0.0015 + cb.hurtK * 0.004;
  };

  // ------------------------------------------------------------------ ввод: мышь, клавиши, тач, геймпад
  const turnBy = Run.prototype.turnBy;
  Run.prototype.turnBy = function (dx, dy) { const f = 1 - 0.45 * (this.aimK || 0); turnBy.call(this, dx * f, dy * f); };

  Run.prototype.bindCombat = function () {
    const T = THREE;
    this.wpV = new T.Vector3(); this.wpF = new T.Vector3();
    const wp = document.createElement('div'); wp.className = 'm-wp'; wp.innerHTML = '<i></i><b></b>'; wp.style.display = 'none'; this.layer.appendChild(wp); this.wpEl = wp;
    const resume = () => { this.snd && this.snd.resume(); };
    this.on(document, 'touchstart', resume, { passive: true });
    this.on(document, 'keydown', (e) => {
      resume();
      if (e.repeat || !this.cb) return;
      if (e.code === 'KeyR') this.startReload();
      else if (e.code === 'KeyQ') this.swapNext(1);
      else if (e.code === 'Digit1') this.selectSlot(0); else if (e.code === 'Digit2') this.selectSlot(1); else if (e.code === 'Digit3') this.selectSlot(2);
    });
    this.on(document, 'mousedown', (e) => {
      resume();
      if (this.touch || this.paused || !this.cb || !this.entered) return;
      if (!document.pointerLockElement && e.target !== this.canvas) return;
      if (e.button === 0) { this.fireHeld = true; this.pressFire(); }
      else if (e.button === 2) this.aimWant = true;
    });
    this.on(window, 'mouseup', (e) => { if (e.button === 0) this.fireHeld = false; else if (e.button === 2) this.aimWant = false; });
    this.on(document, 'wheel', (e) => { if (this.cb && !this.paused && document.pointerLockElement) this.swapNext(e.deltaY > 0 ? 1 : -1); }, { passive: true });
    this.on(window, 'blur', () => { this.fireHeld = false; this.aimWant = false; });
    // тач-кнопки
    const hold = (sel, down, up, drag) => {
      const b = this.qs(sel); if (!b) return;
      let id = null, lx = 0, ly = 0;
      this.on(b, 'pointerdown', (e) => { e.preventDefault(); resume(); id = e.pointerId; lx = e.clientX; ly = e.clientY; try { b.setPointerCapture(id); } catch (err) {} b.classList.add('held'); down(); });
      this.on(b, 'pointermove', (e) => { if (e.pointerId !== id || !drag) return; const lk = window.NexaSettings ? NexaSettings.get('touch.look') / 100 : 1; this.turnBy((e.clientX - lx) * 0.0055 * lk, (e.clientY - ly) * 0.0055 * lk); lx = e.clientX; ly = e.clientY; });
      const end = (e) => { if (e.pointerId !== id) return; id = null; b.classList.remove('held'); up && up(); };
      this.on(b, 'pointerup', end); this.on(b, 'pointercancel', end);
    };
    hold('.m-fire', () => { this.fireHeld = true; this.pressFire(); }, () => { this.fireHeld = false; }, true); // палец на FIRE можно вести — это прицеливание
    const aim = this.qs('.m-aim');
    if (aim) this.on(aim, 'pointerdown', (e) => { e.preventDefault(); this.aimWant = !this.aimWant; aim.classList.toggle('held', this.aimWant); });
    const rel = this.qs('.m-rel'); if (rel) this.on(rel, 'pointerdown', (e) => { e.preventDefault(); this.startReload(); });
    const swp = this.qs('.m-swap'); if (swp) this.on(swp, 'pointerdown', (e) => { e.preventDefault(); this.swapNext(1); });
    // геймпад
    this.padPrev = [];
    this.on(window, 'gamepadconnected', (e) => {
      this.padObj = e.gamepad; this.padActive = true;
      this.setPadHint();
      this.toast('CONTROLLER CONNECTED', 1.6);
    });
    this.on(window, 'gamepaddisconnected', () => { this.padObj = null; this.padMove = null; this.padFire = false; this.padRun = false; });
    this.intervals.push(setInterval(() => this.padMenu(), 90)); // пауза и пропуск катсцены с геймпада (rAF в паузе не работает)
    resume(); // bindInput вызывается из клика по [ENTER] — жест пользователя, звук можно включать
  };

  function pads() { try { const l = navigator.getGamepads ? navigator.getGamepads() : []; for (let i = 0; i < l.length; i += 1) if (l[i] && l[i].connected) return l[i]; } catch (e) {} return null; }
  const dz = (x, y, d) => { const m = Math.hypot(x, y); if (m < d) return [0, 0]; const k = (m - d) / (1 - d) / m; return [x * k, y * k]; };

  // подсказка управления под тип контроллера (✕ □ △ ○ для PlayStation, ZR/ZL для Switch); один раз, когда геймпад «проснулся»
  Run.prototype.setPadHint = function () {
    if (this.touch || this.padHinted) return;
    this.padHinted = true;
    const h = 'L-STICK MOVE  |  R-STICK LOOK  |  RT FIRE  |  LT AIM  |  X RELOAD  |  Y SWAP  |  A USE  |  L3 RUN';
    this.qs('.m-hint').textContent = window.PadGlyph ? window.PadGlyph.fmt(h) : h;
  };

  Run.prototype.padMenu = function () {
    if (this.disposed || !this.entered) return;
    const g = pads(); if (!g) return;
    const b = (i) => !!(g.buttons[i] && g.buttons[i].pressed);
    const prev = this.padPrev;
    const edge = (i) => b(i) && !prev[i];
    if (edge(9)) { this.setPause(!this.pausedUser); this.padActive = true; }
    if (this.pausedUser && edge(0)) { this.setPause(false); }
    if (this.pausedUser && edge(1)) this.finish(false);
    if (this.inCinema && (edge(0) || edge(7))) this.cineSkip = true;
    if (this.choice) { if (edge(0)) this.choose('retry'); else if (edge(3)) this.choose('skip'); }
    prev[9] = b(9); prev[0] = b(0); prev[1] = b(1); prev[7] = b(7); prev[3] = b(3);
  };

  Run.prototype.pollPad = function (dt) {
    const g = pads();
    if (!g) { this.padMove = null; return; }
    this.padObj = g;
    const ax = g.axes, b = (i) => !!(g.buttons[i] && g.buttons[i].pressed), val = (i) => (g.buttons[i] ? g.buttons[i].value : 0);
    const prev = this.padPrev || (this.padPrev = []);
    const L = dz(ax[0] || 0, ax[1] || 0, 0.18), R = dz(ax[2] || 0, ax[3] || 0, 0.12);
    if (L[0] || L[1] || R[0] || R[1] || b(7) || b(6) || (this.choice && (b(0) || b(3)))) this.padActive = true;
    if (this.padActive) this.setPadHint();
    if (!this.padActive) { for (let i = 0; i < 16; i += 1) prev[i] = b(i); return; }
    this.padMove = this.locked ? { x: 0, y: 0 } : { x: L[0], y: L[1] }; // тот же знак, что у экранного стика: вверх = вперёд
    if (!this.locked && !this.paused) {
      // правый стик: нелинейная кривая — точные мелкие движения и быстрый разворот (замедление в прицеливании делает turnBy)
      const cv = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.7);
      this.turnBy(cv(R[0]) * 2.9 * dt, cv(R[1]) * 2.3 * dt);
    }
    const edge = (i) => b(i) && !prev[i];
    if (this.choice) { if (edge(0)) this.choose('retry'); else if (edge(3)) this.choose('skip'); }
    if (!this.locked) {
      if (edge(0)) this.useTarget();
      if (this.cb) {
        this.padFire = val(7) > 0.35;
        if (this.padFire && !prev[7]) this.pressFire();
        const aimNow = val(6) > 0.35;
        if (aimNow !== !!this.padAimHeld) { this.padAimHeld = aimNow; this.aimWant = aimNow; }
        if (edge(2)) this.startReload();
        if (edge(3) || edge(5) || edge(12)) this.swapNext(1);
        if (edge(4) || edge(13)) this.swapNext(-1);
      }
      if (edge(10)) this.padRun = !this.padRun;
    }
    if (this.p.moving < 0.05) this.padRun = false; // бег по L3 сбрасывается, когда стик отпущен
    for (let i = 0; i < 16; i += 1) prev[i] = b(i);
  };

  Run.prototype.disposeCombat = function () {
    clearTimeout(this.toastT);
    if (this.snd) { this.snd.close(); this.snd = null; }
    if (this.padObj) this.rumbleOff = true;
  };

  C.WEAPONS = WEAPONS; C.ETYPES = ETYPES;
}());
