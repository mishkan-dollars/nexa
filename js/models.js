// NEXA: процедурные модели — оружие игрока, чёрные руки стикмана (пальцы, предплечья), оружие врагов.
// Всё собирается из боксов и цилиндров и склеивается по цвету: один draw call на материал (важно для телефонов).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C) return;

  // ------------------------------------------------------------------ примитивы и склейка
  const m4 = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().compose(
    new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'XYZ')),
    new THREE.Vector3(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz));
  const box = (w, h, d, x, y, z, rx, ry, rz) => ({ g: new THREE.BoxGeometry(w, h, d), m: m4(x, y, z, rx, ry, rz) });
  // цилиндр вдоль Z: rf — радиус у дульного конца (-z), rb — у казённого (+z)
  const cylZ = (rf, rb, len, x, y, z, seg) => ({ g: new THREE.CylinderGeometry(rb, rf, len, seg || 10, 1), m: m4(x, y, z, Math.PI / 2, 0, 0) });
  // вертикальный цилиндр с эллиптическим сечением
  const cylY = (rt, rb, h, x, y, z, sx, sz, seg, rx, rz) => ({ g: new THREE.CylinderGeometry(rt, rb, h, seg || 8, 1), m: m4(x, y, z, rx, 0, rz, sx || 1, 1, sz || 1) });
  const sph = (r, x, y, z, sx, sy, sz, seg) => ({ g: new THREE.SphereGeometry(r, seg || 8, 6), m: m4(x, y, z, 0, 0, 0, sx, sy, sz) });

  function merge(parts) {
    const T = THREE, pos = [], nor = [], v = new T.Vector3(), nm = new T.Matrix3();
    parts.forEach((p) => {
      const gi = p.g.index ? p.g.toNonIndexed() : p.g, pa = gi.attributes.position, na = gi.attributes.normal;
      nm.getNormalMatrix(p.m);
      for (let i = 0; i < pa.count; i += 1) {
        v.fromBufferAttribute(pa, i).applyMatrix4(p.m); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      }
      if (gi !== p.g) gi.dispose();
      p.g.dispose();
    });
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    return out;
  }

  // ------------------------------------------------------------------ руки игрока
  // Локальная система кисти: +Z — направление пальцев, +Y — «вверх» от тыльной стороны ладони.
  function restHandParts(side) { // расслабленный полукулак
    const s = side, P = [];
    P.push(box(0.05, 0.022, 0.055, 0, 0, 0.02));
    for (let i = 0; i < 4; i += 1) {
      const x = (i - 1.5) * 0.0115;
      P.push(box(0.0105, 0.013, 0.042, x, -0.004, 0.066, 0.45));
      P.push(box(0.0098, 0.012, 0.032, x, -0.026, 0.088, 1.15));
    }
    P.push(box(0.014, 0.014, 0.05, s * 0.032, -0.004, 0.034, 0, -s * 0.5, 0));
    return P;
  }

  // правая рука на рукоятке (в системе модели оружия): ладонь сзади, пальцы обхватывают переднюю часть, указательный вдоль скобы
  function gripHandParts(gx, gy, gz) {
    const P = [];
    P.push(box(0.038, 0.072, 0.022, gx, gy + 0.005, gz + 0.026));                 // ладонь на задней стороне рукоятки
    P.push(box(0.04, 0.02, 0.03, gx, gy + 0.045, gz + 0.032));                    // основание большого пальца
    for (let i = 0; i < 3; i += 1) P.push(box(0.042, 0.0135, 0.034, gx, gy - 0.004 - i * 0.0145, gz - 0.034)); // три пальца спереди
    P.push(box(0.0135, 0.0125, 0.054, gx + 0.024, gy + 0.034, gz - 0.026, 0, 0, 0)); // указательный вдоль скобы
    P.push(box(0.014, 0.014, 0.056, gx - 0.027, gy + 0.03, gz - 0.004, 0, 0.12, 0)); // большой палец слева
    return P;
  }

  // левая рука: 'grip' — поддержка пистолета; 'cup' — снизу на цевье / помпе
  function leftHandParts(kind) {
    const P = [];
    if (kind === 'grip') {
      P.push(box(0.02, 0.07, 0.042, -0.036, 0.0, 0.0));
      for (let i = 0; i < 3; i += 1) P.push(box(0.05, 0.0135, 0.03, -0.01, -0.016 - i * 0.0145, -0.036));
      P.push(box(0.012, 0.012, 0.065, -0.03, 0.04, -0.03));                       // большой палец вперёд по раме
    } else {
      P.push(box(0.056, 0.02, 0.09, 0, -0.03, 0.0));                              // ладонь под цевьём
      for (let i = 0; i < 4; i += 1) P.push(box(0.015, 0.046, 0.0145, 0.034, -0.008, -0.036 + i * 0.0245)); // пальцы обходят цевьё справа
      P.push(box(0.016, 0.034, 0.024, -0.034, -0.004, -0.004));                   // большой палец слева
    }
    return P;
  }

  // ------------------------------------------------------------------ модели оружия
  // Координаты те же, что в WEAPONS.anch (combat.js): целик / мушка / дульный срез не сдвигать — на них построено прицеливание.
  const COL = { dark: 0x242424, mid: 0x333333, lite: 0x4d4d4d, poly: 0x181818, wood: 0x5c5c5c, black: 0x0c0c0c, steel: 0x6a6a6a, white: 0xffffff, pale: 0xcfcfcf };

  function glock() {
    const S = {}, add = (c, ...p) => { (S[c] || (S[c] = [])).push(...p); };
    const sl = {};
    const addS = (c, ...p) => { (sl[c] || (sl[c] = [])).push(...p); };
    addS('mid', box(0.032, 0.034, 0.19, 0, 0.012, -0.095), box(0.014, 0.004, 0.17, 0, 0.0305, -0.1));
    addS('poly', box(0.034, 0.028, 0.004, 0, 0.014, -0.02), box(0.034, 0.028, 0.004, 0, 0.014, -0.03), box(0.034, 0.028, 0.004, 0, 0.014, -0.04),
      box(0.034, 0.028, 0.004, 0, 0.014, -0.165), box(0.034, 0.028, 0.004, 0, 0.014, -0.175));
    addS('black', box(0.002, 0.016, 0.045, 0.0165, 0.016, -0.065));                  // окно выброса
    addS('pale', box(0.006, 0.008, 0.012, -0.0075, 0.033, -0.012), box(0.006, 0.008, 0.012, 0.0075, 0.033, -0.012)); // целик с прорезью
    addS('white', box(0.006, 0.01, 0.01, 0, 0.034, -0.178));                         // мушка
    addS('steel', cylZ(0.0065, 0.0065, 0.022, 0, 0.012, -0.196, 8));
    add('poly', box(0.03, 0.028, 0.15, 0, -0.018, -0.08), box(0.026, 0.008, 0.05, 0, -0.03, -0.14),
      box(0.034, 0.1, 0.04, 0, -0.07, -0.02, -0.25), box(0.036, 0.1, 0.006, 0, -0.07, 0.0, -0.25),
      box(0.018, 0.006, 0.05, 0, -0.04, -0.075), box(0.012, 0.026, 0.006, 0, -0.03, -0.1));
    add('steel', box(0.008, 0.018, 0.006, 0, -0.032, -0.062, 0.3));
    const mag = { dark: [box(0.028, 0.03, 0.036, 0, -0.125, -0.022, -0.25), box(0.032, 0.008, 0.042, 0, -0.142, -0.016, -0.25)] };
    return { S, sl, mag, grip: [0, -0.07, -0.02], leftKind: 'grip' };
  }

  function ak() {
    const S = {}, add = (c, ...p) => { (S[c] || (S[c] = [])).push(...p); };
    add('lite', box(0.04, 0.09, 0.26, 0, -0.045, 0.16), box(0.042, 0.1, 0.012, 0, -0.05, 0.29));
    add('mid', box(0.04, 0.07, 0.3, 0, -0.005, -0.1), box(0.034, 0.014, 0.27, 0, 0.038, -0.1));
    add('black', box(0.002, 0.03, 0.06, 0.021, 0.0, -0.08), box(0.002, 0.04, 0.012, 0.021, -0.005, -0.03));
    add('steel', box(0.014, 0.012, 0.03, 0.026, 0.015, -0.12), cylZ(0.0145, 0.0145, 0.05, 0, 0.012, -0.595), box(0.022, 0.03, 0.03, 0, 0.028, -0.47));
    add('wood', box(0.052, 0.036, 0.2, 0, -0.022, -0.35), box(0.046, 0.02, 0.2, 0, 0.012, -0.35));
    add('poly', cylZ(0.009, 0.009, 0.25, 0, 0.04, -0.33, 8), cylZ(0.011, 0.011, 0.2, 0, 0.012, -0.5, 8),
      box(0.034, 0.1, 0.04, 0, -0.085, -0.01, -0.35), box(0.018, 0.006, 0.07, 0, -0.048, -0.07), box(0.02, 0.03, 0.03, 0, 0.03, -0.5),
      box(0.003, 0.03, 0.01, -0.008, 0.03, -0.5), box(0.003, 0.03, 0.01, 0.008, 0.03, -0.5));
    add('pale', box(0.012, 0.012, 0.04, -0.009, 0.056, -0.14), box(0.012, 0.012, 0.04, 0.009, 0.056, -0.14), box(0.03, 0.01, 0.05, 0, 0.049, -0.14));
    add('white', box(0.008, 0.035, 0.01, 0, 0.045, -0.5));
    const mag = { dark: [box(0.04, 0.085, 0.07, 0, -0.02, 0, 0.1), box(0.04, 0.085, 0.07, 0, -0.09, -0.02, 0.4), box(0.044, 0.01, 0.074, 0, -0.13, -0.045, 0.4)] };
    return { S, sl: null, mag, magPos: [0, -0.1, -0.17], grip: [0, -0.085, -0.01], leftKind: 'cup' };
  }

  function shotgun() {
    const S = {}, add = (c, ...p) => { (S[c] || (S[c] = [])).push(...p); };
    add('dark', box(0.05, 0.075, 0.26, 0, 0, -0.13), box(0.052, 0.01, 0.1, 0, 0.04, -0.07));
    add('black', box(0.002, 0.03, 0.06, 0.026, 0.005, -0.08), cylZ(0.0175, 0.0175, 0.012, 0, 0.025, -0.826, 10));
    add('lite', box(0.04, 0.08, 0.2, 0, -0.045, 0.1), box(0.042, 0.09, 0.012, 0, -0.05, 0.2));
    add('poly', box(0.034, 0.09, 0.04, 0, -0.075, -0.01, -0.3), cylZ(0.016, 0.016, 0.6, 0, 0.025, -0.52, 10), cylZ(0.0145, 0.0145, 0.46, 0, -0.025, -0.49, 10),
      box(0.03, 0.07, 0.02, 0, 0, -0.74), box(0.012, 0.006, 0.4, 0, 0.045, -0.42), box(0.006, 0.014, 0.008, 0, 0.047, -0.76));
    add('pale', box(0.03, 0.008, 0.012, 0, 0.05, -0.05));
    add('white', box(0.004, 0.004, 0.006, 0, 0.0545, -0.76));
    const pump = { lite: [box(0.052, 0.046, 0.18, 0, 0, 0)], black: [box(0.054, 0.048, 0.006, 0, 0, -0.06), box(0.054, 0.048, 0.006, 0, 0, 0), box(0.054, 0.048, 0.006, 0, 0, 0.06)] };
    return { S, sl: null, pump, pumpPos: [0, -0.025, -0.5], grip: [0, -0.075, -0.01], leftKind: 'cup' };
  }

  // снайперская винтовка (kit.js): длинный ствол с дульным тормозом, оптика сверху, рукоять затвора справа
  function sniper() {
    const S = {}, add = (c, ...p) => { (S[c] || (S[c] = [])).push(...p); };
    add('dark', box(0.04, 0.075, 0.34, 0, 0.0, -0.12), box(0.034, 0.012, 0.2, 0, 0.044, -0.1), box(0.046, 0.05, 0.12, 0, -0.012, -0.34));
    add('wood', box(0.05, 0.08, 0.3, 0, -0.04, 0.17), box(0.052, 0.1, 0.012, 0, -0.045, 0.32), box(0.05, 0.05, 0.34, 0, -0.03, -0.5), box(0.04, 0.03, 0.12, 0, -0.012, 0.0));
    add('steel', cylZ(0.0125, 0.0125, 0.75, 0, 0.016, -0.63, 10), cylZ(0.017, 0.017, 0.07, 0, 0.016, -1.0, 10), box(0.014, 0.014, 0.05, 0.034, 0.024, -0.02));
    add('black', cylZ(0.024, 0.024, 0.32, 0, 0.088, -0.12, 12), cylZ(0.033, 0.033, 0.06, 0, 0.088, -0.3, 12), cylZ(0.028, 0.028, 0.05, 0, 0.088, 0.06, 12),
      box(0.01, 0.036, 0.02, 0, 0.056, -0.04), box(0.01, 0.036, 0.02, 0, 0.056, -0.22));
    add('poly', box(0.034, 0.1, 0.04, 0, -0.085, -0.01, -0.3), box(0.018, 0.006, 0.07, 0, -0.048, -0.07));
    add('pale', box(0.012, 0.012, 0.03, 0.04, 0.026, -0.02, 0, 0.3, 0));
    const mag = { dark: [box(0.036, 0.09, 0.07, 0, -0.01, 0), box(0.04, 0.01, 0.074, 0, -0.06, 0)] };
    return { S, sl: null, mag, magPos: [0, -0.1, -0.17], grip: [0, -0.085, -0.01], leftKind: 'cup' };
  }

  const BUILD = { glock, ak, shotgun, sniper };
  C.WEAPON_BUILD = BUILD;

  // ------------------------------------------------------------------ готовые модели оружия (assets/models/*.nxm + *.jpg)
  // Формат NXM1: 'NXM1', u32 длина JSON, JSON { parts: [{ name, vc, ic, wide, bb, po, uo, no, io }] }, затем данные:
  // позиции Int16x3 (в рамке bb), UV Uint16x2, нормали Int8x4, индексы Uint16/Uint32. Модели уже в системе оружия: ствол в -Z, начало — как у процедурных.
  // Если файлы не загрузились (нет сети, file://) — молча остаётся процедурное оружие.
  const MODEL_DIR = 'assets/models/', MODEL_IDS = ['glock', 'ak', 'shotgun'], NX = {};

  function decodeNXM(buf) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, false) !== 0x4e584d31) return null;
    const hl = dv.getUint32(4, true), hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl))), base = 8 + hl, out = {};
    hdr.parts.forEach((p) => {
      const P = new Int16Array(buf, base + p.po, p.vc * 3), U = new Uint16Array(buf, base + p.uo, p.vc * 2), N = new Int8Array(buf, base + p.no, p.vc * 4);
      const I = p.wide ? new Uint32Array(buf, base + p.io, p.ic) : new Uint16Array(buf, base + p.io, p.ic);
      const pos = new Float32Array(p.vc * 3), nor = new Float32Array(p.vc * 3), uv = new Float32Array(p.vc * 2);
      for (let i = 0; i < p.vc; i += 1) {
        for (let k = 0; k < 3; k += 1) { pos[i * 3 + k] = (P[i * 3 + k] + 32767) / 65534 * (p.bb[3 + k] - p.bb[k]) + p.bb[k]; nor[i * 3 + k] = N[i * 4 + k] / 127; }
        uv[i * 2] = U[i * 2] / 65535; uv[i * 2 + 1] = U[i * 2 + 1] / 65535;
      }
      out[p.name] = { pos, nor, uv, idx: I };
    });
    return out;
  }
  function loadImage(src) {
    return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  }
  let modelsPromise = null;
  C.loadModels = function () {
    if (modelsPromise) return modelsPromise;
    const one = async (id) => {
      try {
        const r = await fetch(MODEL_DIR + id + '.nxm');
        if (!r.ok) return;
        const parts = decodeNXM(await r.arrayBuffer()), img = await loadImage(MODEL_DIR + id + '.jpg');
        if (parts && parts.body && img) NX[id] = { id, parts, img };
      } catch (e) { /* остаётся процедурная модель */ }
    };
    const lim = new Promise((res) => setTimeout(res, 20000)); // долгая загрузка не должна держать вход в миссию
    modelsPromise = Promise.race([Promise.all(MODEL_IDS.map(one)), lim]).then(() => NX);
    return modelsPromise;
  };
  C.hasModel = (id) => !!NX[id];
  C.decodeNXM = decodeNXM; C.loadImage = loadImage; // для внешних моделей (маска босса в heist.js)

  // текстура × фиксированный свет в системе камеры (оружие читается в любой комнате); двусторонний: у импортированных сеток порядок обхода непредсказуем
  const VERT = 'varying vec2 vUv; varying vec3 vN; varying vec3 vP;\n' +
    'void main(){ vUv = uv; vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }';
  const FRAG = 'uniform sampler2D map; uniform vec4 tone; varying vec2 vUv; varying vec3 vN; varying vec3 vP;\n' + // tone: усиление, подъём чёрного, размытие текстуры (mip bias), сила светотени
    'void main(){\n' +
    '  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;\n' +
    '  vec3 L = normalize(vec3(-0.35, 0.8, 0.5)); vec3 H = normalize(L - normalize(vP));\n' +
    '  float d = max(dot(n, L), 0.0), s = pow(max(dot(n, H), 0.0), 28.0);\n' +
    '  vec3 c = texture2D(map, vUv, tone.z).rgb * tone.x + tone.y;\n' +
    '  gl_FragColor = vec4(c * mix(0.85, 0.5 + 0.75 * d, tone.w) + vec3(s * 0.2), 1.0);\n}';
  // у АК текстура — шумная «фото-карта» (камуфляж из пятен), поэтому она размыта: остаётся тон дерева и металла без мозаики; у Glock текстура почти чёрная — подтянута
  const TONE = { glock: [3.2, 0.13, 0, 1], ak: [1.15, 0, 6, 0.65], shotgun: [1.25, 0.02, 0, 1] };

  // детали готовой модели: body — корпус, slide — затвор (отдаётся назад при выстреле), mag — магазин, pump — цевьё дробовика
  function importedParts(mdl, X, rg) {
    const T = THREE, tex = new T.Texture(X.img);
    tex.needsUpdate = true; tex.anisotropy = 4;
    // transparent нужен только чтобы оружие шло в общей очереди с руками (по renderOrder); смешивание выключено
    const mt = new T.ShaderMaterial({ uniforms: { map: { value: tex }, tone: { value: new T.Vector4().fromArray(TONE[X.id] || [1, 0, 0, 1]) } }, vertexShader: VERT, fragmentShader: FRAG, side: T.DoubleSide, transparent: true, blending: T.NoBlending, depthTest: true, depthWrite: true });
    const mesh = (p, order) => {
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(p.pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(p.nor, 3));
      geo.setAttribute('uv', new T.BufferAttribute(p.uv, 2)); geo.setIndex(new T.BufferAttribute(p.idx, 1));
      return rg.mk(geo, mt, order);
    };
    const grp = (name, order) => { const p = X.parts[name]; if (!p) return null; const h = new T.Group(); h.add(mesh(p, order)); mdl.g.add(h); return h; };
    mdl.g.add(mesh(X.parts.body, 1000));
    mdl.slide = grp('slide', 1000) || undefined; mdl.mag = grp('mag', 1001) || undefined; mdl.pump = grp('pump', 1001) || undefined;
    mdl.pumpBase = 0;
    // руки и оружие рисуются без глубины (чтобы кисти были всегда поверх); для самого оружия глубина нужна — чистим её перед ним
    const clr = new T.Mesh(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(new Float32Array(9), 3)),
      new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, transparent: true }));
    clr.renderOrder = 999; clr.frustumCulled = false;
    clr.onBeforeRender = (r) => { const b = r.state && r.state.buffers; if (b && b.depth) b.depth.setMask(true); r.clearDepth(); };
    mdl.g.add(clr);
  }

  // собирает модель и руки: возвращает { g, slide, mag, pump, lh (левая кисть), wristR, wristL }
  C.buildWeapon = function (id, rg, anch) {
    const T = THREE, B = BUILD[id](), g = new T.Group(), mdl = { g };
    if (anch) B.grip = anch.grip;
    const mat = (c, hand) => (hand ? rg.skinMat : rg.M(COL[c]));
    const put = (parent, list, order, hand) => {
      Object.keys(list).forEach((c) => { const m = rg.mk(merge(list[c]), mat(c, hand), order); parent.add(m); });
    };
    if (NX[id]) importedParts(mdl, NX[id], rg);
    else {
      put(g, B.S, 1000);
      if (B.sl) { mdl.slide = new T.Group(); g.add(mdl.slide); put(mdl.slide, B.sl, 1000); }
      if (B.mag) { mdl.mag = new T.Group(); if (B.magPos) mdl.mag.position.set(B.magPos[0], B.magPos[1], B.magPos[2]); g.add(mdl.mag); put(mdl.mag, B.mag, 1001); }
      if (B.pump) { mdl.pump = new T.Group(); mdl.pump.position.set(B.pumpPos[0], B.pumpPos[1], B.pumpPos[2]); g.add(mdl.pump); put(mdl.pump, B.pump, 1001); }
      mdl.pumpBase = B.pumpPos ? B.pumpPos[2] : 0;
    }
    const gr = B.grip;
    mdl.rh = new T.Group(); g.add(mdl.rh); put(mdl.rh, { skin: gripHandParts(gr[0], gr[1], gr[2]) }, 1008, true);
    mdl.lhGeo = leftHandParts(B.leftKind);
    mdl.leftKind = B.leftKind;
    mdl.wristR = [0, -0.012, 0.085];  // запястья в системе оружия: правое — относительно хвата, левое — относительно левой кисти
    mdl.wristL = B.leftKind === 'grip' ? [-0.04, -0.03, 0.08] : [0, -0.045, 0.1];
    return mdl;
  };

  // левая кисть оружия (создаётся один раз на модель, живёт внутри holder и двигается за точкой хвата)
  C.buildLeftHand = function (mdl, rg) {
    const h = new THREE.Group();
    h.add(rg.mk(merge(mdl.lhGeo), rg.skinMat, 1009));
    return h;
  };

  // расслабленная кисть без оружия
  C.buildRestHand = function (side, rg) {
    const h = new THREE.Group();
    h.add(rg.mk(merge(restHandParts(side)), rg.skinMat, 1010));
    return h;
  };

  // кости рук: цилиндр, который растягивается между двумя точками (толще у плеча)
  C.limbGeo = function (rEnd, rStart) { return new THREE.CylinderGeometry(rEnd, rStart, 1, 8, 1).rotateX(Math.PI / 2); };

  // ------------------------------------------------------------------ оружие врагов (в системе: ствол в -Z, начало — хват)
  const EGUN = {
    pistol: { muz: [0, 0.02, -0.2], fore: [0.0, 0.0, -0.02], grip: [0, 0, 0] },
    rifle:  { muz: [0, 0.03, -0.7], fore: [0, -0.01, -0.34], grip: [0, 0, 0] },
    shotgun: { muz: [0, 0.03, -0.82], fore: [0, -0.02, -0.4], grip: [0, 0, 0] },
    lmg:    { muz: [0, 0.035, -0.78], fore: [0, -0.01, -0.36], grip: [0, 0, 0] }
  };
  function enemyGunGeo(kind) {
    const P = [];
    if (kind === 'pistol') {
      P.push(box(0.032, 0.036, 0.19, 0, 0.04, -0.09), box(0.03, 0.04, 0.14, 0, 0.0, -0.07), box(0.034, 0.1, 0.04, 0, -0.05, 0.0, -0.25));
    } else if (kind === 'shotgun') {
      P.push(box(0.05, 0.075, 0.26, 0, 0.03, -0.1), box(0.04, 0.08, 0.22, 0, 0.0, 0.14), cylZ(0.016, 0.016, 0.6, 0, 0.05, -0.5), cylZ(0.0145, 0.0145, 0.46, 0, 0.0, -0.46),
        box(0.052, 0.046, 0.18, 0, 0.0, -0.4), box(0.034, 0.09, 0.04, 0, -0.06, 0.0, -0.3));
    } else {
      P.push(box(0.04, 0.07, 0.3, 0, 0.02, -0.1), box(0.04, 0.09, 0.26, 0, 0.0, 0.16), box(0.05, 0.04, 0.2, 0, 0.01, -0.35), cylZ(0.011, 0.011, 0.2, 0, 0.03, -0.55),
        cylZ(0.015, 0.015, 0.05, 0, 0.03, -0.68), box(0.034, 0.1, 0.04, 0, -0.06, 0.0, -0.35));
      if (kind === 'lmg') P.push(cylZ(0.07, 0.07, 0.07, 0, -0.07, -0.16), box(0.03, 0.02, 0.5, 0, 0.065, -0.3));
      else P.push(box(0.038, 0.11, 0.06, 0, -0.08, -0.17, -0.3));
    }
    return merge(P);
  }
  C.enemyGunGeo = enemyGunGeo; C.EGUN = EGUN;

  C.geo = { box, cylZ, cylY, sph, merge, m4 };
}());
