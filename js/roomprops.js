// NEXA: процедурная мебель комнат (interiors.js) — детальные модели с canvas-текстурами, без внешних файлов.
// ПК-комната: письменный стол (шпон с волокном, тумба с ящиками, задняя панель), офисное кресло (ткань, хром, колёсики),
// ЭЛТ-монитор (корпус, вентиляция, панель кнопок), системный блок (отсеки, решётка, кнопка), клавиатура, мышь с ковриком, лампа, кружка, бумаги.
// Чайная комната: чайный стол со скатертью в клетку, деревянные стулья с мягкой накладкой, чайник/чашки с блюдцами/сахарница/поднос/печенье/термос.
// API: RoomProps.has(name) / RoomProps.make(name, room, x, z, {yaw, y, s, solid}) → THREE.Group (+ коллайдер при solid) или null.
// Система координат модели: +Z — «лицом» (экран монитора, сторона сидящего, переда стула); низ детали — на y=0 группы. THREE берётся лениво.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C) return;
  const PI = Math.PI;
  const RP = window.RoomProps = {};
  RP.DESK_H = 0.777;      // высота столешницы ПК-стола (экран монитора в interiors.js рассчитан на неё)
  RP.TEA_H = 0.752;       // верх скатерти чайного стола

  // ---------------------------------------------------------------- канвас-текстуры
  const TX = {}, MT = {}, GEO = {};
  const css = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a === undefined ? 1 : a) + ')';
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function speckle(g, w, h, R, n, a) {
    for (let i = 0; i < n; i += 1) { g.fillStyle = R() < 0.5 ? css([0, 0, 0], a * R()) : css([255, 255, 255], a * R()); g.fillRect((R() * w) | 0, (R() * h) | 0, 1 + ((R() * 2) | 0), 1); }
  }
  function drawWood(g, w, h, R, c, planks) {
    g.fillStyle = css(c); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i += 1) { g.fillStyle = R() < 0.5 ? css([0, 0, 0], 0.04 + R() * 0.06) : css([255, 225, 185], 0.04 + R() * 0.06); g.fillRect(0, R() * h, w, 8 + R() * 44); }
    for (let i = 0; i < 230; i += 1) {
      const y = R() * h, a = 0.5 + R() * 3, ph = R() * 6.283, n = 1 + ((R() * 3) | 0), dk = R() < 0.65;
      g.strokeStyle = dk ? css([28, 14, 5], 0.08 + R() * 0.2) : css([255, 222, 172], 0.05 + R() * 0.11); g.lineWidth = 0.5 + R() * 1.4;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin(x / w * 6.2832 * n + ph) * a; if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy); }
      g.stroke();
    }
    for (let k = 0; k < 2; k += 1) { const x = R() * w, y = R() * h; for (let j = 6; j > 0; j -= 1) { g.strokeStyle = css([25, 12, 4], 0.13); g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, j * 4.5, j * 1.7, 0, 0, 6.2832); g.stroke(); } }
    if (planks) for (let i = 0; i < planks; i += 1) { g.fillStyle = css([18, 9, 3], 0.55); g.fillRect(0, i * h / planks, w, 2); g.fillStyle = css([255, 225, 185], 0.08); g.fillRect(0, i * h / planks + 2, w, 1); }
    speckle(g, w, h, R, 1400, 0.07);
  }
  function drawFabric(g, w, h, R, c) {
    g.fillStyle = css(c); g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = css([0, 0, 0], 0.17); g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 2) { g.fillStyle = css([255, 255, 255], 0.07); g.fillRect(x, 0, 1, h); }
    speckle(g, w, h, R, 1800, 0.12);
  }
  function drawPlastic(g, w, h, R, c, grain) {
    g.fillStyle = css(c); g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    speckle(g, w, h, R, grain || 2400, 0.06);
  }
  function drawGingham(g, w, h, R) {
    g.fillStyle = css([236, 232, 220]); g.fillRect(0, 0, w, h);
    const s = w / 8;
    for (let i = 0; i < 8; i += 2) { g.fillStyle = css([150, 48, 48], 0.5); g.fillRect(i * s, 0, s, h); g.fillRect(0, i * s, w, s); }
    for (let y = 0; y < h; y += 2) { g.fillStyle = css([0, 0, 0], 0.07); g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 2) { g.fillStyle = css([255, 255, 255], 0.1); g.fillRect(x, 0, 1, h); }
    speckle(g, w, h, R, 700, 0.1);
  }
  function drawDrawers(g, w, h, R, c) {              // фасад тумбы: 3 ящика с ручками
    drawWood(g, w, h, R, c, 0);
    const m = 10, n = 3, hh = (h - m * 2) / n;
    for (let i = 0; i < n; i += 1) {
      const y = m + i * hh;
      g.strokeStyle = css([20, 10, 4], 0.75); g.lineWidth = 3; g.strokeRect(m, y + 2, w - m * 2, hh - 4);
      g.strokeStyle = css([255, 225, 185], 0.12); g.lineWidth = 1; g.strokeRect(m + 4, y + 6, w - m * 2 - 8, hh - 12);
      g.fillStyle = css([40, 40, 42]); g.fillRect(w * 0.3, y + hh * 0.2, w * 0.4, 6);
      g.fillStyle = css([180, 180, 175], 0.7); g.fillRect(w * 0.3, y + hh * 0.2, w * 0.4, 2);
    }
    g.fillStyle = css([25, 25, 25]); g.beginPath(); g.arc(w * 0.82, 20, 3, 0, 6.283); g.fill();
  }
  function drawTowerFront(g, w, h, R) {
    drawPlastic(g, w, h, R, [178, 171, 152], 2600);
    const bay = (y, hh, cd) => {
      g.fillStyle = css([210, 203, 184]); g.fillRect(20, y, w - 40, hh);
      g.strokeStyle = css([60, 56, 48], 0.9); g.lineWidth = 2; g.strokeRect(20, y, w - 40, hh);
      g.fillStyle = css([30, 29, 28]); g.fillRect(34, y + hh * 0.42, w - 68, 5);
      if (cd) { g.fillStyle = css([88, 84, 76]); g.fillRect(w - 62, y + hh * 0.7, 26, 7); g.fillStyle = css([40, 40, 40]); g.fillRect(34, y + hh * 0.7, 44, 6); }
    };
    bay(34, 54, true); bay(98, 54, false);
    g.fillStyle = css([205, 198, 179]); g.fillRect(20, 168, w - 40, 36); g.strokeStyle = css([60, 56, 48], 0.9); g.lineWidth = 2; g.strokeRect(20, 168, w - 40, 36);
    g.fillStyle = css([12, 12, 12]); g.fillRect(48, 184, 110, 5); g.fillStyle = css([60, 60, 56]); g.fillRect(172, 180, 26, 12);
    g.fillStyle = css([55, 52, 46]); g.beginPath(); g.arc(w * 0.5, 252, 16, 0, 6.283); g.fill();
    g.fillStyle = css([200, 194, 176]); g.beginPath(); g.arc(w * 0.5, 252, 11, 0, 6.283); g.fill();
    g.fillStyle = css([40, 40, 38]); g.fillRect(w * 0.5 - 1, 244, 2, 9);
    g.fillStyle = css([80, 200, 90]); g.fillRect(46, 242, 8, 5); g.fillStyle = css([230, 160, 40]); g.fillRect(46, 254, 8, 5);
    g.fillStyle = css([60, 56, 48]); g.fillRect(w - 62, 244, 18, 12);
    g.fillStyle = css([36, 36, 36]); g.fillRect(24, 300, w - 48, 20);
    g.fillStyle = css([220, 215, 200], 0.85); g.fillRect(34, 306, 56, 4); g.fillRect(34, 313, 30, 3);
    for (let i = 0; i < 14; i += 1) { const y = 340 + i * 11; g.fillStyle = css([22, 22, 22]); g.fillRect(28, y, w - 56, 5); g.fillStyle = css([255, 255, 255], 0.08); g.fillRect(28, y + 5, w - 56, 1); }
    g.strokeStyle = css([60, 56, 48], 0.7); g.lineWidth = 2; g.strokeRect(2, 2, w - 4, h - 4);
  }
  function drawCrtControls(g, w, h, R) {
    drawPlastic(g, w, h, R, [186, 179, 160], 800);
    g.fillStyle = css([30, 30, 28], 0.8); g.fillRect(8, h * 0.5 - 1, 70, 2);
    for (let i = 0; i < 5; i += 1) { g.fillStyle = css([90, 86, 78]); g.fillRect(w * 0.42 + i * 22, h * 0.3, 14, h * 0.4); g.fillStyle = css([220, 214, 196], 0.7); g.fillRect(w * 0.42 + i * 22, h * 0.3, 14, 3); }
    g.fillStyle = css([40, 40, 38]); g.beginPath(); g.arc(w * 0.9, h * 0.5, 7, 0, 6.283); g.fill();
    g.fillStyle = css([140, 136, 124]); g.beginPath(); g.arc(w * 0.9, h * 0.5, 4, 0, 6.283); g.fill();
  }
  function drawVents(g, w, h, R) {
    drawPlastic(g, w, h, R, [150, 144, 128], 1800);
    for (let y = 10; y < h - 10; y += 9) for (let x = 14; x < w - 14; x += 26) { g.fillStyle = css([20, 20, 20]); g.fillRect(x, y, 16, 4); }
  }
  function drawKeys(g, w, h, R) {
    g.fillStyle = css([52, 52, 54]); g.fillRect(0, 0, w, h);
    const rows = [['', 'F1 F2 F3 F4 F5 F6 F7 F8 F9'], ['1234567890-=', ''], ['QWERTYUIOP[]', ''], ['ASDFGHJKL;\'', ''], ['ZXCVBNM,./', '']];
    const kh = h / 6.4, pad = 3;
    g.font = 'bold ' + Math.max(8, kh * 0.4) + 'px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const keyAt = (x, y, kw, lab) => {
      g.fillStyle = css([26, 26, 28]); g.fillRect(x, y, kw, kh - pad);
      g.fillStyle = css([206, 201, 188]); g.fillRect(x + 1.5, y + 1, kw - 4, kh - pad - 3);
      g.fillStyle = css([255, 255, 255], 0.35); g.fillRect(x + 1.5, y + 1, kw - 4, 2);
      if (lab) { g.fillStyle = css([40, 40, 40]); g.fillText(lab, x + kw / 2 - 0.5, y + (kh - pad) / 2); }
    };
    let y = 4; const ku = (w - 28) / 15.5;
    for (let i = 0; i < 9; i += 1) keyAt(8 + i * ku * 1.18 + 1.2 * ku, y, ku * 1.1, 'F' + (i + 1));
    keyAt(8, y, ku, 'Esc'); y += kh * 1.15;
    rows.slice(1).forEach((rw, ri) => {
      const s = rw[0]; let x = 8 + (ri === 0 ? 0 : ri * ku * 0.45);
      for (let i = 0; i < s.length; i += 1) { keyAt(x, y, ku, s[i]); x += ku; }
      keyAt(x, y, ku * (ri === 0 ? 2 : 1.6), ri === 0 ? '⌫' : ri === 1 ? '' : ri === 2 ? '' : '⇧');
      y += kh;
    });
    keyAt(8 + ku * 2.2, y, ku * 7.5, ''); keyAt(8, y, ku * 1.6, '');
    // блок стрелок
    keyAt(w - 8 - ku * 3, y, ku, '←'); keyAt(w - 8 - ku * 2, y, ku, '↓'); keyAt(w - 8 - ku, y, ku, '→');
    speckle(g, w, h, R, 400, 0.08);
  }
  function drawPaper(g, w, h, R) {
    g.fillStyle = css([236, 234, 226]); g.fillRect(0, 0, w, h);
    g.fillStyle = css([40, 70, 120], 0.5); g.fillRect(14, 14, w * 0.5, 7);
    for (let y = 36; y < h - 14; y += 11) { let x = 14; while (x < w - 18) { const l = 8 + R() * 28; g.fillStyle = css([50, 50, 55], 0.4 + R() * 0.2); g.fillRect(x, y, Math.min(l, w - 14 - x), 3); x += l + 4; } }
    g.strokeStyle = css([200, 40, 40], 0.6); g.lineWidth = 2; g.strokeRect(w * 0.55, h * 0.78, 40, 20);
  }
  function drawPorcelain(g, w, h, R) {
    g.fillStyle = css([240, 238, 230]); g.fillRect(0, 0, w, h);
    g.fillStyle = css([50, 84, 150]); g.fillRect(0, h * 0.4, w, 9); g.fillRect(0, h * 0.62, w, 5);
    for (let x = 6; x < w; x += 16) { g.beginPath(); g.arc(x, h * 0.51, 3.2, 0, 6.283); g.fill(); }
    speckle(g, w, h, R, 120, 0.05);
  }
  function drawCrate(g, w, h, R) { drawWood(g, w, h, R, [150, 112, 74], 4); }
  function drawAmmo(g, w, h, R) {                     // армейский ящик: оливковая краска, облупленные углы, трафаретные полосы
    g.fillStyle = css([70, 78, 54]); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i += 1) { g.fillStyle = css([0, 0, 0], 0.1 + R() * 0.08); g.fillRect(0, i * h / 6, w, 2); }
    g.fillStyle = css([198, 172, 62], 0.9); g.fillRect(w * 0.12, h * 0.36, w * 0.76, h * 0.07); g.fillRect(w * 0.12, h * 0.5, w * 0.44, h * 0.07);
    g.fillStyle = css([40, 44, 30], 0.9); g.fillRect(w * 0.12, h * 0.64, w * 0.2, h * 0.05);
    for (let i = 0; i < 40; i += 1) { g.fillStyle = css([128, 132, 100], 0.15 + R() * 0.25); g.fillRect(R() * w, R() * h, 2 + R() * 6, 1 + R() * 2); }
    speckle(g, w, h, R, 1400, 0.1);
  }
  function drawLocker(g, w, h, R) {                   // двойной стальной шкафчик: двери, жалюзи, ручки, царапины
    g.fillStyle = css([86, 98, 94]); g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,255,255,0.08)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let d = 0; d < 2; d += 1) {
      const x = d * w / 2;
      g.fillStyle = css([0, 0, 0], 0.5); g.fillRect(x, 0, 3, h);
      for (let i = 0; i < 7; i += 1) { g.fillStyle = css([0, 0, 0], 0.55); g.fillRect(x + w * 0.1, h * 0.06 + i * h * 0.014, w * 0.3, 3); g.fillStyle = css([255, 255, 255], 0.1); g.fillRect(x + w * 0.1, h * 0.06 + i * h * 0.014 + 3, w * 0.3, 1); }
      g.fillStyle = css([0, 0, 0], 0.35); g.fillRect(x + w * 0.08, h * 0.12, w * 0.34, 2);
      g.fillStyle = css([212, 212, 204]); g.fillRect(x + w * 0.4, h * 0.48, 7, h * 0.07);
      g.fillStyle = css([0, 0, 0], 0.4); g.fillRect(x + w * 0.4 + 6, h * 0.48, 1, h * 0.07);
    }
    for (let i = 0; i < 26; i += 1) { g.strokeStyle = css([210, 210, 200], 0.05 + R() * 0.12); g.lineWidth = 1; g.beginPath(); const x = R() * w, y = R() * h; g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 36, y + (R() - 0.5) * 14); g.stroke(); }
    speckle(g, w, h, R, 2000, 0.07);
  }
  function drawCard(g, w, h, R) {                     // рубашка карты
    g.fillStyle = css([236, 232, 222]); g.fillRect(0, 0, w, h);
    g.fillStyle = css([150, 42, 42]); g.fillRect(6, 6, w - 12, h - 12);
    g.strokeStyle = css([236, 232, 222], 0.8); g.lineWidth = 2;
    for (let i = -h; i < w + h; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
  }

  const DRAW = {
    walnut: [256, 256, (g, w, h, R) => drawWood(g, w, h, R, [104, 72, 46], 0)],
    walnutD: [256, 256, (g, w, h, R) => drawWood(g, w, h, R, [82, 56, 36], 0)],
    oak: [256, 256, (g, w, h, R) => drawWood(g, w, h, R, [150, 112, 72], 0)],
    oakD: [256, 256, (g, w, h, R) => drawWood(g, w, h, R, [112, 78, 48], 0)],
    drawers: [256, 512, (g, w, h, R) => drawDrawers(g, w, h, R, [96, 66, 42])],
    fabricBlack: [128, 128, (g, w, h, R) => drawFabric(g, w, h, R, [40, 41, 46])],
    fabricRed: [128, 128, (g, w, h, R) => drawFabric(g, w, h, R, [122, 52, 46])],
    gingham: [256, 256, drawGingham],
    plBeige: [256, 256, (g, w, h, R) => drawPlastic(g, w, h, R, [186, 179, 160], 2600)],
    plDark: [128, 128, (g, w, h, R) => drawPlastic(g, w, h, R, [34, 34, 36], 1600)],
    plBlack: [128, 128, (g, w, h, R) => drawPlastic(g, w, h, R, [20, 20, 22], 900)],
    towerFront: [256, 512, drawTowerFront],
    crtCtrl: [256, 64, drawCrtControls],
    vents: [256, 256, drawVents],
    keys: [512, 192, drawKeys],
    paper: [128, 180, drawPaper],
    porcelain: [128, 128, drawPorcelain],
    pad: [128, 128, (g, w, h, R) => drawFabric(g, w, h, R, [44, 52, 70])],
    tray: [256, 256, (g, w, h, R) => drawWood(g, w, h, R, [128, 92, 58], 0)],
    ammo: [256, 128, drawAmmo],
    locker: [256, 512, drawLocker],
    card: [64, 96, drawCard],
    crateW: [256, 256, drawCrate]
  };
  function tex(k) {
    if (TX[k]) return TX[k];
    const d = DRAW[k], cv = document.createElement('canvas'); cv.width = d[0]; cv.height = d[1];
    d[2](cv.getContext('2d'), d[0], d[1], rng32(hash(k)));
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return (TX[k] = t);
  }
  // материал: map — ключ текстуры, color — множитель (по умолчанию белый); o: {side, basic}
  function M(map, color, o) {
    const key = (map || '-') + '|' + (color === undefined ? 'w' : color) + '|' + (o ? JSON.stringify(o) : '');
    if (MT[key]) return MT[key];
    const T = THREE, p = { color: color === undefined ? 0xffffff : color };
    if (map) p.map = tex(map);
    if (o && o.side) p.side = o.side;
    return (MT[key] = o && o.basic ? new T.MeshBasicMaterial(p) : new T.MeshLambertMaterial(p));
  }
  const FLAT = (c) => M(null, c);

  // геометрия «коробка» с UV в метрах: k — повторов текстуры на метр (0 — растянуть по грани)
  function GB(w, h, d, k) {
    const key = [w, h, d, k].join('|'); if (GEO[key]) return GEO[key];
    const g = new THREE.BoxGeometry(w, h, d);
    if (k) { const uv = g.attributes.uv, dm = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; for (let f = 0; f < 6; f += 1) for (let i = 0; i < 4; i += 1) { const j = f * 4 + i; uv.setXY(j, uv.getX(j) * dm[f][0] * k, uv.getY(j) * dm[f][1] * k); } }
    return (GEO[key] = g);
  }
  // деталь: w,h,d — размеры, (x,y,z): x/z — центр, y — НИЗ. m — материал или массив из 6 (+x,-x,+y,-y,+z,-z)
  function part(c, w, h, d, x, y, z, m, k, rot) {
    const me = new THREE.Mesh(GB(w, h, d, k === undefined ? 3 : k), m);
    me.position.set(x, y + h / 2, z);
    if (rot) { if (rot[0]) me.rotation.x = rot[0]; if (rot[1]) me.rotation.y = rot[1]; if (rot[2]) me.rotation.z = rot[2]; }
    if (c.sh && h > 0.15) { me.castShadow = true; me.receiveShadow = true; }
    (c.p || c.g).add(me);
    return me;
  }
  function cyl(c, rt, rb, h, seg, x, y, z, m, o) {
    const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!(o && o.open)), m);
    me.position.set(x, y + h / 2, z);
    if (o && o.rx) me.rotation.x = o.rx; if (o && o.rz) me.rotation.z = o.rz;
    (c.p || c.g).add(me);
    return me;
  }
  function lathe(c, pts, seg, x, y, z, m) {
    const me = new THREE.Mesh(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg), m);
    me.position.set(x, y, z); (c.p || c.g).add(me); return me;
  }
  const sub = (c, x, y, z, ry) => { const s = new THREE.Group(); s.position.set(x, y, z); if (ry) s.rotation.y = ry; c.g.add(s); return s; };

  // ---------------------------------------------------------------- ПК-комната
  const BUILD = {
    // письменный стол 1.8×0.72, тумба с ящиками со стороны +v (мировой), открытое подколенное место со стороны стула
    office_desk(c) {
      const s = c.side, H = RP.DESK_H, top = M('walnut'), sd = M('walnutD'), dr = M('drawers');
      part(c, 1.8, 0.035, 0.72, 0, H - 0.035, 0, [top, top, top, sd, top, top], 2.2);                 // столешница
      part(c, 0.04, H - 0.035, 0.66, -s * 0.88, 0, 0, sd, 2.2);                                       // боковая панель
      part(c, 0.46, H - 0.035 - 0.04, 0.64, s * 0.64, 0.04, 0, [sd, sd, sd, sd, dr, sd], 0);          // тумба: фасад с ящиками смотрит в +Z
      part(c, 0.5, 0.04, 0.66, s * 0.64, 0, 0, FLAT(0x1c1612));                                       // цоколь
      part(c, 1.2, 0.46, 0.02, -s * 0.23, 0.24, -0.3, sd, 2.2);                                       // задняя панель
      part(c, 1.2, 0.07, 0.02, -s * 0.23, H - 0.105, 0.29, sd, 2.2);                                  // передний «пояс» над подколенным местом
      const cab = part(c, 0.012, 0.012, 0.3, -s * 0.5, 0.02, -0.18, FLAT(0x0e0e0e), 0);               // кабель вдоль пола
      cab.position.y = 0.02;
      return { w: 1.8, h: H, d: 0.72 };
    },
    // ЭЛТ-монитор: лицо +Z, экран 0.24×0.19 (рисует interiors.js/webcam.js) центром на высоте 0.2 над столом, на z=+0.176
    crt_monitor(c) {
      const be = M('plBeige'), bk = M('plBeige', 0xcfcfcf), vt = M('vents'), dk = M('plDark');
      cyl(c, 0.1, 0.11, 0.02, 14, 0, 0, 0.02, dk);                                                   // подставка
      part(c, 0.13, 0.03, 0.12, 0, 0.02, 0.02, dk, 3);
      part(c, 0.36, 0.09, 0.06, 0, 0.295, 0.148, be, 3);                                              // рамка: верх
      part(c, 0.36, 0.075, 0.06, 0, 0.03, 0.148, [be, be, be, be, M('crtCtrl'), be], 0);              // низ с кнопками
      part(c, 0.06, 0.19, 0.06, -0.15, 0.105, 0.148, be, 3); part(c, 0.06, 0.19, 0.06, 0.15, 0.105, 0.148, be, 3);
      part(c, 0.26, 0.21, 0.2, 0, 0.095, 0.071, FLAT(0x0c0c0c), 0);                                  // «трубка» за экраном
      part(c, 0.33, 0.32, 0.15, 0, 0.045, 0.043, [bk, bk, vt, bk, bk, bk], 3);                        // корпус, вентиляция сверху
      part(c, 0.24, 0.22, 0.17, 0, 0.09, -0.115, [bk, bk, vt, bk, bk, M('vents')], 3);                // задний конус
      part(c, 0.006, 0.006, 0.12, 0.08, 0.1, -0.26, FLAT(0x0a0a0a), 0);                              // сетевой шнур
      const led = new THREE.Mesh(c.T.BoxGeometry ? new c.T.BoxGeometry(0.008, 0.008, 0.004) : GB(0.008, 0.008, 0.004, 0), M(null, 0x66ff7a, { basic: true }));
      led.position.set(0.13, 0.062, 0.18); c.g.add(led);
      return { w: 0.36, h: 0.385, d: 0.38 };
    },
    // системный блок (миди-тауэр): передняя панель с отсеками, решёткой и кнопкой питания, на столе рядом с монитором
    computer_tower(c) {
      const sd = M('plBeige', 0xd2d2d2), fr = M('towerFront', 0xffffff), bk = M('vents', 0xdddddd), tp = M('plBeige', 0xe0e0e0), ft = FLAT(0x1a1a1a);
      part(c, 0.22, 0.44, 0.44, 0, 0.02, -0.01, [sd, sd, tp, ft, bk, bk], 0);
      part(c, 0.225, 0.44, 0.02, 0, 0.02, 0.22, [sd, sd, tp, ft, fr, sd], 0);                          // выступающая передняя панель
      part(c, 0.002, 0.3, 0.3, 0.111, 0.08, -0.04, FLAT(0x7a7468), 0);                                // шов боковой крышки (+x)
      part(c, 0.002, 0.3, 0.3, -0.111, 0.08, -0.04, FLAT(0x7a7468), 0);
      [[-0.09, -0.17], [0.09, -0.17], [-0.09, 0.17], [0.09, 0.17]].forEach((p) => part(c, 0.035, 0.02, 0.05, p[0], 0, p[1], ft, 0)); // ножки
      return { w: 0.225, h: 0.46, d: 0.46 };
    },
    // офисное кресло: 5 лучей хром с колёсиками, газлифт, тканевые сиденье и спинка, подлокотники. Перед (куда смотрит сидящий) — +Z
    office_chair(c) {
      const fb = M('fabricBlack'), pl = M('plBlack'), ch = FLAT(0xa8a8ac), rb = FLAT(0x101010);
      for (let k = 0; k < 5; k += 1) {
        const a = k * PI * 2 / 5 + 0.3, sg = sub(c, 0, 0, 0, a);
        part({ g: sg }, 0.3, 0.028, 0.045, 0.14, 0.075, 0, ch, 0);
        part({ g: sg }, 0.04, 0.05, 0.03, 0.29, 0.02, 0, rb, 0);
        part({ g: sg }, 0.016, 0.02, 0.022, 0.29, 0.0, 0, rb, 0);
      }
      cyl(c, 0.03, 0.05, 0.1, 10, 0, 0.09, 0, ch);                                                   // кожух газлифта
      cyl(c, 0.022, 0.022, 0.26, 10, 0, 0.19, 0, ch);
      part(c, 0.36, 0.03, 0.34, 0, 0.42, -0.01, pl, 0);                                               // механизм под сиденьем
      part(c, 0.5, 0.06, 0.48, 0, 0.45, 0, [fb, fb, fb, pl, fb, fb], 4);                              // подушка сиденья
      part(c, 0.48, 0.035, 0.07, 0, 0.455, 0.255, fb, 4);                                             // «водопад» переднего края
      part(c, 0.06, 0.34, 0.045, 0, 0.47, -0.27, pl, 0);                                              // стойка спинки
      part(c, 0.46, 0.46, 0.07, 0, 0.56, -0.3, [fb, fb, fb, fb, fb, pl], 4, [-0.08, 0, 0]);          // спинка (чуть откинута)
      [-1, 1].forEach((sg) => {
        part(c, 0.03, 0.2, 0.03, sg * 0.275, 0.5, -0.04, ch, 0);
        part(c, 0.06, 0.035, 0.26, sg * 0.275, 0.69, 0.02, pl, 0);
      });
      return { w: 0.6, h: 1.05, d: 0.6 };
    },
    keyboard(c) {
      const ky = M('keys'), pl = M('plDark');
      part(c, 0.44, 0.02, 0.15, 0, 0, 0, [pl, pl, ky, pl, pl, pl], 0);
      part(c, 0.006, 0.004, 0.3, 0.1, 0.006, -0.22, FLAT(0x0e0e0e), 0);                              // шнур
      return { w: 0.44, h: 0.02, d: 0.15 };
    },
    mouse(c) {
      part(c, 0.22, 0.004, 0.18, 0, 0, 0, M('pad', 0xffffff), 0);                                     // коврик
      part(c, 0.06, 0.026, 0.1, 0.0, 0.004, 0.01, M('plBeige'), 0);
      part(c, 0.0015, 0.001, 0.045, 0.0, 0.03, -0.015, FLAT(0x2a2a2a), 0);
      part(c, 0.06, 0.002, 0.003, 0.0, 0.03, -0.0, FLAT(0x2a2a2a), 0);
      part(c, 0.005, 0.003, 0.2, 0.0, 0.006, -0.19, FLAT(0x0e0e0e), 0);
      return { w: 0.22, h: 0.04, d: 0.18 };
    },
    desk_lamp(c) {
      const mt = FLAT(0x303034), sh = FLAT(0x8a8a82);
      cyl(c, 0.06, 0.065, 0.016, 14, 0, 0, 0, mt);
      const a1 = new THREE.Group(); a1.position.set(0, 0.016, 0); a1.rotation.z = -0.5; c.g.add(a1); part({ g: a1 }, 0.012, 0.26, 0.012, 0, 0, 0, mt, 0);
      const t1 = [Math.sin(0.5) * 0.26, 0.016 + Math.cos(0.5) * 0.26];
      const a2 = new THREE.Group(); a2.position.set(t1[0], t1[1], 0); a2.rotation.z = 0.6; c.g.add(a2); part({ g: a2 }, 0.012, 0.24, 0.012, 0, 0, 0, mt, 0);
      const t2 = [t1[0] - Math.sin(0.6) * 0.24, t1[1] + Math.cos(0.6) * 0.24];
      cyl(c, 0.022, 0.07, 0.09, 14, t2[0], t2[1] - 0.07, 0, sh, { open: true });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), M(null, 0xfff1c0, { basic: true })); bulb.position.set(t2[0], t2[1] - 0.075, 0); c.g.add(bulb);
      return { w: 0.2, h: 0.46, d: 0.14 };
    },
    mug(c) {
      cyl(c, 0.038, 0.034, 0.09, 12, 0, 0, 0, M('porcelain'));
      const hd = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 6, 10, PI), FLAT(0xe8e6de)); hd.position.set(0.04, 0.045, 0); hd.rotation.z = -PI / 2; c.g.add(hd);
      const cf = new THREE.Mesh(new THREE.CircleGeometry(0.032, 12), FLAT(0x2a1a0e)); cf.rotation.x = -PI / 2; cf.position.y = 0.082; c.g.add(cf);
      return { w: 0.1, h: 0.09, d: 0.08 };
    },
    papers(c) {
      const pp = M('paper');
      part(c, 0.21, 0.004, 0.297, 0, 0, 0, [pp, pp, pp, pp, pp, pp], 0);
      part(c, 0.21, 0.004, 0.297, 0.012, 0.004, 0.01, pp, 0, [0, 0.25, 0]);
      part(c, 0.21, 0.004, 0.297, -0.006, 0.008, -0.006, pp, 0, [0, -0.12, 0]);
      cyl(c, 0.004, 0.004, 0.14, 6, 0.05, 0.013, 0.02, FLAT(0x20407a), { rz: PI / 2 });
      return { w: 0.24, h: 0.02, d: 0.3 };
    },

    // ---------------------------------------------------------------- чайная комната
    // чайный стол 1.3×0.8 со скатертью в клетку; ножки и пояс из дуба видны из-под скатерти
    tea_table(c) {
      const ok = M('oak'), od = M('oakD'), cl = M('gingham'), H = RP.TEA_H;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((q) => part(c, 0.06, 0.7, 0.06, q[0] * 0.6, 0, q[1] * 0.35, od, 3));
      part(c, 1.2, 0.07, 0.025, 0, 0.62, 0.35, od, 3); part(c, 1.2, 0.07, 0.025, 0, 0.62, -0.35, od, 3);
      part(c, 0.025, 0.07, 0.7, 0.6, 0.62, 0, od, 3); part(c, 0.025, 0.07, 0.7, -0.6, 0.62, 0, od, 3);
      part(c, 1.3, 0.04, 0.8, 0, 0.7, 0, ok, 2.2);                                                    // столешница
      part(c, 1.4, 0.012, 0.9, 0, H - 0.012, 0, cl, 4);                                               // скатерть
      part(c, 1.4, 0.1, 0.012, 0, H - 0.112, 0.444, cl, 4); part(c, 1.4, 0.1, 0.012, 0, H - 0.112, -0.444, cl, 4);
      part(c, 0.012, 0.1, 0.9, 0.694, H - 0.112, 0, cl, 4); part(c, 0.012, 0.1, 0.9, -0.694, H - 0.112, 0, cl, 4);
      return { w: 1.4, h: H, d: 0.9 };
    },
    // караульный стол: потёртая дубовая столешница с суконной подкладкой для карт, без скатерти
    guard_table(c) {
      const ok = M('oak'), od = M('oakD'), wd = M('walnutD'), pd = M('pad'), H = RP.TEA_H;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((q) => part(c, 0.07, H - 0.05, 0.07, q[0] * 0.62, 0, q[1] * 0.37, od, 3));
      part(c, 1.28, 0.08, 0.025, 0, H - 0.13, 0.37, wd, 3); part(c, 1.28, 0.08, 0.025, 0, H - 0.13, -0.37, wd, 3);
      part(c, 0.025, 0.08, 0.72, 0.62, H - 0.13, 0, wd, 3); part(c, 0.025, 0.08, 0.72, -0.62, H - 0.13, 0, wd, 3);
      part(c, 1.4, 0.05, 0.9, 0, H - 0.05, 0, ok, 2.2);                                              // столешница
      part(c, 0.9, 0.004, 0.55, 0, H, 0, pd, 2.5);                                                    // сукно для карт
      return { w: 1.4, h: H, d: 0.9 };
    },
    // деревянный стул с мягкой накладкой и перекладинами в спинке (перед +Z)
    wood_chair(c) {
      const wd = M('oakD'), cu = M('fabricRed');
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((q) => part(c, 0.04, 0.45, 0.04, q[0] * 0.19, 0, q[1] * 0.19, wd, 3));
      part(c, 0.42, 0.04, 0.42, 0, 0.45, 0, wd, 3);                                                   // сиденье
      part(c, 0.4, 0.035, 0.4, 0, 0.49, 0.005, [cu, cu, cu, cu, cu, cu], 4);                          // накладка
      part(c, 0.04, 0.48, 0.04, -0.19, 0.49, -0.19, wd, 3); part(c, 0.04, 0.48, 0.04, 0.19, 0.49, -0.19, wd, 3);   // задние стойки
      part(c, 0.4, 0.07, 0.03, 0, 0.84, -0.19, wd, 3); part(c, 0.4, 0.04, 0.025, 0, 0.64, -0.19, wd, 3);
      [-0.11, 0, 0.11].forEach((x) => part(c, 0.025, 0.2, 0.02, x, 0.68, -0.19, wd, 3));
      part(c, 0.4, 0.025, 0.025, 0, 0.18, 0.19, wd, 3); part(c, 0.4, 0.025, 0.025, 0, 0.18, -0.19, wd, 3);
      return { w: 0.46, h: 0.97, d: 0.46 };
    },
    // чайный сервиз: поднос, чайник, сахарница, тарелка с печеньем (в центре стола)
    tea_service(c) {
      const po = M('porcelain', 0xffffff, { side: THREE.DoubleSide }), tr = M('tray');
      part(c, 0.4, 0.014, 0.28, 0, 0, 0, tr, 3);
      part(c, 0.4, 0.03, 0.012, 0, 0.0, 0.134, tr, 3); part(c, 0.4, 0.03, 0.012, 0, 0.0, -0.134, tr, 3);
      part(c, 0.012, 0.03, 0.28, 0.194, 0.0, 0, tr, 3); part(c, 0.012, 0.03, 0.28, -0.194, 0.0, 0, tr, 3);
      const tp = sub(c, -0.08, 0.014, 0, 0.4);
      lathe({ g: tp }, [[0, 0], [0.045, 0], [0.07, 0.014], [0.085, 0.05], [0.09, 0.09], [0.08, 0.125], [0.05, 0.14], [0.03, 0.145], [0, 0.145]], 14, 0, 0, 0, po);
      const kn = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), po); kn.position.set(0, 0.16, 0); tp.add(kn);
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.026, 0.1, 8), po); sp.position.set(0.1, 0.1, 0); sp.rotation.z = -0.9; tp.add(sp);
      const hd = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 12, PI * 1.1), po); hd.position.set(-0.085, 0.085, 0); hd.rotation.z = PI / 2 + 0.2; tp.add(hd);
      const sb = sub(c, 0.1, 0.014, -0.06, 0);
      lathe({ g: sb }, [[0, 0], [0.025, 0], [0.04, 0.01], [0.048, 0.04], [0.044, 0.06], [0.0, 0.06]], 12, 0, 0, 0, po);
      cyl({ g: sb }, 0.045, 0.045, 0.012, 12, 0, 0.062, 0, po);
      const pl = sub(c, 0.1, 0.014, 0.07, 0);
      cyl({ g: pl }, 0.075, 0.06, 0.012, 14, 0, 0, 0, po);
      [[0, 0, 0.3], [0.03, 0.02, -0.4], [-0.03, 0.02, 0.9], [0.0, -0.035, 0.1]].forEach((b) => part({ g: pl }, 0.04, 0.012, 0.04, b[0], 0.012, b[1] - 0.0, FLAT(0xb4864a), 0, [0, b[2], 0]));
      return { w: 0.4, h: 0.17, d: 0.28 };
    },
    tea_cup(c) {
      const po = M('porcelain', 0xffffff, { side: THREE.DoubleSide });
      cyl(c, 0.07, 0.055, 0.012, 14, 0, 0, 0, po);
      lathe(c, [[0, 0], [0.02, 0], [0.032, 0.008], [0.04, 0.045], [0.044, 0.07]], 12, 0, 0.012, 0, po);
      const hd = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 10, PI), po); hd.position.set(0.045, 0.048, 0); hd.rotation.z = -PI / 2; c.g.add(hd);
      const te = new THREE.Mesh(new THREE.CircleGeometry(0.038, 12), FLAT(0x5a3418)); te.rotation.x = -PI / 2; te.position.y = 0.074; c.g.add(te);
      return { w: 0.14, h: 0.08, d: 0.14 };
    },
    thermos(c) {
      const st = FLAT(0x8c9096);
      cyl(c, 0.045, 0.045, 0.27, 12, 0, 0, 0, st);
      cyl(c, 0.04, 0.045, 0.03, 12, 0, 0.27, 0, FLAT(0x2c2c30));
      return { w: 0.09, h: 0.3, d: 0.09 };
    },

    // ---------------------------------------------------------------- караулка
    // оружейная стойка на стене: доска, два держателя, четыре винтовки стволами вверх (низ модели — у пола, доска на высоте груди)
    gun_rack(c) {
      const wd = M('walnutD'), blk = FLAT(0x1c1c1e), st = M('oakD'), steel = FLAT(0x3a3d40), strap = FLAT(0x2a2a22);
      part(c, 1.52, 1.0, 0.035, 0, 0.8, -0.1, wd, 2.2);                                                  // задняя доска
      part(c, 1.52, 0.05, 0.07, 0, 1.12, -0.06, wd, 2.2); part(c, 1.52, 0.05, 0.07, 0, 1.58, -0.06, wd, 2.2);   // держатели
      for (let i = 0; i < 4; i += 1) {
        const x = -0.55 + i * 0.37;
        part(c, 0.055, 0.34, 0.05, x, 0.84, -0.03, st, 3);                                              // приклад
        part(c, 0.05, 0.3, 0.06, x, 1.15, -0.03, blk, 0);                                               // ствольная коробка
        part(c, 0.04, 0.2, 0.07, x, 1.0, 0.02, blk, 0, [-0.18, 0, 0]);                                  // магазин
        cyl(c, 0.011, 0.011, 0.5, 8, x, 1.45, -0.03, steel);                                             // ствол
        part(c, 0.03, 0.05, 0.03, x, 1.95, -0.03, blk, 0);                                               // мушка
        part(c, 0.015, 0.28, 0.02, x, 1.13, -0.005, strap, 0);                                          // ремень
      }
      part(c, 1.52, 0.04, 0.1, 0, 0.78, -0.04, wd, 2.2);                                                 // нижняя полка
      return { w: 1.52, h: 1.9, d: 0.2 };
    },
    // два сложенных армейских ящика с патронами
    ammo_box(c) {
      const am = M('ammo'), dk = FLAT(0x30341f), mt = FLAT(0x1f1f1f);
      const mats = [am, am, dk, dk, am, am];
      part(c, 0.62, 0.3, 0.38, 0, 0, 0, mats, 0);
      part(c, 0.5, 0.26, 0.32, 0.04, 0.3, 0.0, mats, 0, [0, 0.22, 0]);
      [-0.2, 0.2].forEach((x) => part(c, 0.05, 0.03, 0.04, x, 0.22, 0.2, mt, 0));                        // ручки нижнего ящика
      part(c, 0.1, 0.02, 0.06, 0.04, 0.56, 0.0, mt, 0, [0, 0.22, 0]);
      return { w: 0.66, h: 0.56, d: 0.4 };
    },
    // двойной стальной шкафчик (лицо — +Z)
    locker(c) {
      const f = M('locker'), sd = FLAT(0x4c5652), tp = FLAT(0x3c4440);
      part(c, 0.84, 1.86, 0.5, 0, 0, 0, [sd, sd, tp, tp, f, sd], 0);
      part(c, 0.84, 0.03, 0.52, 0, 1.86, 0, tp, 0);
      return { w: 0.84, h: 1.9, d: 0.5 };
    },
    // колода на столе: две стопки рубашкой вверх, веер брошенных карт, фишки
    cards(c) {
      const cm = M('card', 0xffffff), face = FLAT(0xece8de), gold = FLAT(0xb89a3c), red = FLAT(0xa23030);
      part(c, 0.06, 0.012, 0.09, -0.12, 0, 0.03, cm, 0, [0, 0.2, 0]); part(c, 0.06, 0.012, 0.09, -0.115, 0.012, 0.028, cm, 0, [0, 0.35, 0]);
      for (let i = 0; i < 5; i += 1) part(c, 0.06, 0.002, 0.09, 0.06 + i * 0.05, 0.0, -0.05 + (i % 2) * 0.02, i % 2 ? face : cm, 0, [0, -0.5 + i * 0.28, 0]);
      for (let i = 0; i < 4; i += 1) cyl(c, 0.017, 0.017, 0.006 * (i + 2), 8, 0.2, 0, 0.08 + i * 0.001, i % 2 ? gold : red);
      for (let i = 0; i < 3; i += 1) cyl(c, 0.017, 0.017, 0.006 * (i + 1), 8, 0.24, 0, 0.05, i % 2 ? red : gold);
      return { w: 0.4, h: 0.03, d: 0.2 };
    },
    // портативная рация с антенной
    radio(c) {
      const bd = FLAT(0x2a2e2a), gr = FLAT(0x151515), kn = FLAT(0xa8a8a0), led = new THREE.MeshBasicMaterial({ color: 0x40d060 });
      part(c, 0.07, 0.15, 0.035, 0, 0, 0, bd, 0);
      cyl(c, 0.004, 0.004, 0.17, 6, 0.025, 0.15, 0, gr);
      part(c, 0.05, 0.04, 0.004, 0, 0.1, 0.019, gr, 0);                                                 // динамик
      cyl(c, 0.011, 0.011, 0.012, 8, -0.02, 0.145, 0, kn);
      part(c, 0.008, 0.008, 0.004, 0.02, 0.135, 0.019, led, 0);
      return { w: 0.07, h: 0.3, d: 0.04 };
    }
  };

  // ---------------------------------------------------------------- API
  RP.has = (name) => !!BUILD[name];
  RP.make = function (name, room, x, z, o) {
    const b = BUILD[name]; if (!b || !window.THREE) return null;
    const r = room.r, T = window.THREE; o = o || {};
    const g = new T.Group(), c = { T, g, r, side: room.side || 1, sh: !!(r.q && r.q.shadows) };
    const info = b(c) || {};
    g.position.set(x, o.y || 0, z); g.rotation.y = o.yaw || 0; if (o.s) g.scale.setScalar(o.s);
    r.scene.add(g);
    if (o.solid && info.w) {
      const yaw = o.yaw || 0, cs = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw)), hw = (info.w * cs + info.d * sn) / 2, hd = (info.w * sn + info.d * cs) / 2;
      const col = { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, y0: o.y || 0, y1: (o.y || 0) + info.h, prop: true, nodress: true };
      r.colliders.push(col); g.userData.col = col;
    }
    return g;
  };
})();
