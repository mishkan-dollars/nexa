// NEXA: интерактивные комнаты в залах миссий — жилые/служебные помещения с жильцами и «бытовыми» сценами.
// Комната пристроена к боковой стене зала: дверь + окно (стекло видно сквозь него), мебель, 1–2 охранника заняты делом
// (играет за ПК / пьют чай / чинят технику / спят). Выбить дверь — breach.js (катсцена от первого лица), после чего жильцы
// переходят из бытового режима в шок и либо хватаются за оружие, либо умоляют — их можно поставить на колени и взять в плен
// (бонус), казнить (максимум) или убить быстро (минимум). Описание: INTERIORS.md. Озвучки нет — только тело и звук среды.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.actors || !C.personas) return;
  const { Run } = C;
  const PI = Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const hyp = Math.hypot;
  const OFF = /[?&]rooms=0\b/.test(location.search);
  const rndr = (rng, a, b) => a + rng() * (b - a);
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const RW = 7.0, DW = 1.5, DH = 2.15, WT = 0.24;   // ширина комнаты вдоль зала, проём двери, высота двери, толщина стен
  const EXTRA_PROPS = ['sofa', 'armchair', 'bookshelf', 'filing_cabinet', 'water_cooler', 'server_rack', 'generator', 'copier', 'medkit'];
  C.extraProps = (C.extraProps || []).concat(EXTRA_PROPS);

  // ------------------------------------------------------------------ бонусы (фиксированные суммы — строки переводятся целиком)
  const BONUS = {
    surprise: [50, '+50 CR · SURPRISE KILL'],
    brutal: [80, '+80 CR · BRUTAL ELIMINATION'],
    door: [25, '+25 CR · DOOR HIT'],
    secure: [120, '+120 CR · HOSTAGE SECURED'],
    exec: [250, '+250 CR · KNEE EXECUTION'],
    clean: [100, '+100 CR · ROOM CLEARED — NO RESISTANCE']
  };
  function award(r, room, key) {
    const b = BONUS[key]; if (!b) return;
    r.intBonus = (r.intBonus || 0) + b[0];
    if (room && room.sec) room.sec.intEarned = (room.sec.intEarned || 0) + b[0];
    r.toast(b[1], 2.4);
    r.snd && r.snd.play('ok', { k: 0.9 });
  }

  // ------------------------------------------------------------------ позы жильцов (слой поверх базовой анимации actors.js)
  // Каждая поза — набор целевых значений суставов; actPose плавно подтягивает текущие значения к цели (damp) и смешивает с базовой
  // позой по весу w (вход/выход из позы). Ключи: hipY, spine xyz, head xyz, arm L/R (x,z) + локти, ноги/колени/стопы, g.y, g.rot.x.
  const D = { hipY: 0.95, spX: 0, spY: 0, spZ: 0, hdX: 0, hdY: 0, hdZ: 0, alX: 0, alZ: -0.1, elX: -0.2, arX: 0, arZ: 0.1, erX: -0.2, llX: 0, lrX: 0, klX: 0.06, krX: 0.06, flX: 0, frX: 0, llZ: 0, lrZ: 0, gY: 0, gRx: 0 };
  const KEYS = Object.keys(D);
  const POSES = {
    sit(a, t) {
      const typ = a.mode === 'type', sip = a.mode === 'drink';
      const o = { hipY: 0.56, spX: 0.1 + (typ ? 0.12 : 0), llX: -1.55, lrX: -1.5, klX: 1.5, krX: 1.5, flX: 0, frX: 0, llZ: -0.06, lrZ: 0.06 };
      if (typ) { // печатает и водит мышью: кисти у клавиатуры, голова на экран, редкий кивок/покачивание
        const k = Math.sin(t * 9 + a.ph) * 0.05, m = Math.sin(t * 2.2 + a.ph) * 0.05, shake = Math.max(0, Math.sin(t * 0.7 + a.ph * 2) - 0.93) * 8;
        o.alX = -1.0 + k; o.alZ = -0.14; o.elX = -1.1 + k * 1.5; o.arX = -1.05 + m; o.arZ = 0.12; o.erX = -1.0 + m * 2;
        o.hdX = 0.1 + Math.sin(t * 0.4 + a.ph) * 0.04; o.hdY = Math.sin(t * 0.25 + a.ph) * 0.1 + Math.sin(t * 11) * 0.02 * shake; o.hdZ = Math.sin(t * 0.33) * 0.03;
      } else if (a.mode === 'cards') { // карты: обе руки над столом перебирают веер, изредка бросок карты, взгляд то в руки, то на соперника
        const sh = Math.sin(t * 3.1 + a.ph) * 0.05, pl = Math.max(0, Math.sin(t * 0.45 + a.ph * 2) - 0.7) * 3.3, gz = Math.max(0, Math.sin(t * 0.3 + a.ph * 5));
        o.alX = -1.05 + sh; o.alZ = -0.2; o.elX = -1.0 - sh * 1.5; o.arX = -1.1 - pl * 0.35; o.arZ = 0.15; o.erX = -0.9 - pl * 0.5;
        o.spX = 0.2; o.hdX = 0.3 + Math.sin(t * 0.6 + a.ph) * 0.04 - gz * 0.2; o.hdY = a.look * 0.55 * gz;
      } else { // чаепитие: чашка к губам по кругу, другая рука жестикулирует, голова к собеседнику с кивками
        const cyc = ((t * 0.16 + a.ph) % 1), s = cyc < 0.3 ? Math.sin(cyc / 0.3 * PI) : 0, talk = Math.max(0, Math.sin(t * 0.8 + a.ph * 3));
        o.arX = lerp(-0.95, -1.95, s); o.arZ = 0.12; o.erX = lerp(-1.1, -2.2, s);
        o.alX = -0.7 + Math.sin(t * 2.6 + a.ph) * 0.35 * talk; o.alZ = -0.3; o.elX = -1.0 - Math.sin(t * 3.1 + a.ph) * 0.3 * talk;
        o.hdY = a.look * (0.55 + Math.sin(t * 0.5) * 0.08); o.hdX = 0.05 + (sip ? 0 : Math.sin(t * 3.2 + a.ph) * 0.05 * talk) - 0.12 * s; o.spY = a.look * 0.25;
      }
      return o;
    },
    sleep(a, t) {
      const br = Math.sin(t * 1.5 + a.ph);
      return { gRx: -PI / 2, gY: 0.56, spX: 0.02 * br, hdX: -0.08, hdZ: 0.18, hdY: 0.1, alX: -0.35, alZ: -0.12, elX: -1.35, arX: -0.5, arZ: 0.1, erX: -1.4, llX: -0.05, lrX: 0.06, klX: 0.25, krX: 0.1, llZ: -0.12, lrZ: 0.1 };
    },
    startle(a, t) { // рывок от неожиданности: корпус и голова назад, руки в стороны
      const j = Math.sin(t * 30) * 0.03;
      return { spX: -0.22, hdX: -0.32, alX: -0.3 + j, alZ: -0.95, elX: -0.5, arX: -0.35 - j, arZ: 0.95, erX: -0.5, llX: -0.05, lrX: 0.08, klX: 0.3, krX: 0.3, llZ: -0.12, lrZ: 0.12 };
    },
    reach(a, t) { // ветеран хватает пистолет со стола
      return { spX: 0.32, hdX: 0.15, arX: -1.55, arZ: 0.12, erX: -0.15, alX: -0.5, alZ: -0.35, elX: -0.9, llX: -0.2, lrX: 0.1, klX: 0.4, krX: 0.3 };
    },
    hands(a, t) { // сдаётся стоя: руки подняты, мелкая дрожь, голова ходит
      const tr = Math.sin(t * 22) * 0.03 * a.fear;
      return { hipY: 0.92, spX: -0.04, hdX: 0.05, hdY: Math.sin(t * 2.2) * 0.25, hdZ: 0.1, alX: -2.85 + tr, alZ: -0.26, elX: -0.4 - tr * 2, arX: -2.85 - tr, arZ: 0.26, erX: -0.4 + tr * 2, klX: 0.35, krX: 0.35, llX: -0.18, lrX: -0.1 };
    },
    cower(a, t) { // присел, руки над головой, трясётся
      const tr = Math.sin(t * 27) * 0.035;
      return { hipY: 0.5, spX: 0.85, hdX: 0.55, hdZ: tr * 2, alX: -2.6, alZ: -0.35 + tr, elX: -2.2, arX: -2.6, arZ: 0.35 - tr, erX: -2.2, llX: -1.25, lrX: -1.25, klX: 2.2, krX: 2.2, flX: 0.2, frX: 0.2, llZ: -0.12, lrZ: 0.12 };
    },
    face(a, t) { // закрывает лицо предплечьями и отворачивается
      const tr = Math.sin(t * 24) * 0.03;
      return { hipY: 0.84, spX: 0.4, spY: 0.45, hdX: 0.3, hdY: 0.35, alX: -1.65 + tr, alZ: 0.1, elX: -2.35, arX: -1.55 - tr, arZ: -0.1, erX: -2.4, llX: -0.5, lrX: -0.3, klX: 0.9, krX: 0.7 };
    },
    kneel(a, t) { // на коленях, руки за головой
      const tr = Math.sin(t * 19) * 0.02 * a.fear;
      return { hipY: 0.48, spX: 0.1, hdX: 0.26, hdY: Math.sin(t * 1.3) * 0.12, alX: -2.7 + tr, alZ: -0.58, elX: -1.95, arX: -2.7 - tr, arZ: 0.58, erX: -1.95, llX: 0.05, lrX: 0.05, klX: 1.55, krX: 1.55, flX: 0.65, frX: 0.65, llZ: -0.1, lrZ: 0.1 };
    },
    bound(a, t) { // связан: руки за спиной, голова опущена
      return { hipY: 0.48, spX: 0.24, hdX: 0.55, alX: 0.55, alZ: -0.08, elX: -0.25, arX: 0.55, arZ: 0.08, erX: -0.25, llX: 0.05, lrX: 0.05, klX: 1.55, krX: 1.55, flX: 0.65, frX: 0.65, llZ: -0.1, lrZ: 0.1 };
    }
  };
  function setAct(n, kind, o) {
    const a = n.act;
    if (a && !a.dead) { a.kind = kind; a.tw = 1; Object.assign(a, o || {}); return a; }
    n.act = Object.assign({ kind, w: 0, tw: 1, sp: 7, ph: Math.random() * 6.28, mode: '', look: 0, fear: 1, cur: null }, o || {});
    return n.act;
  }
  function endAct(n, sp) { if (n.act) { n.act.tw = 0; if (sp) n.act.sp = sp; } }

  Run.prototype.actPose = function (n, dt, t) {
    const a = n.act, g = n.g;
    a.w += (a.tw - a.w) * (1 - Math.exp(-dt * a.sp));
    if (a.tw === 0 && a.w < 0.01) { n.act = null; g.rotation.x = 0; g.position.y = 0; return; }
    const tp = Object.assign({}, D, (POSES[a.kind] || POSES.startle)(a, t));
    if (!a.cur) a.cur = Object.assign({}, tp);
    const k = 1 - Math.exp(-dt * (a.kind === 'startle' || a.kind === 'reach' ? 16 : 9)), c = a.cur, w = a.w;
    for (const key of KEYS) c[key] += (tp[key] - c[key]) * k;
    const mix = (cur, v) => cur + (v - cur) * w;
    n.hips.position.y = mix(n.hips.position.y, c.hipY);
    n.spine.rotation.set(mix(n.spine.rotation.x, c.spX), mix(n.spine.rotation.y, c.spY), mix(n.spine.rotation.z, c.spZ));
    n.head.rotation.set(mix(n.head.rotation.x, c.hdX), mix(n.head.rotation.y, c.hdY), mix(n.head.rotation.z, c.hdZ));
    if (!n.gunKind || n.holster) {          // оружие в руках — руки у IK, их не трогаем
      n.armL.rotation.set(mix(n.armL.rotation.x, c.alX), 0, mix(n.armL.rotation.z, c.alZ)); n.elbL.rotation.set(mix(n.elbL.rotation.x, c.elX), 0, 0);
      n.armR.rotation.set(mix(n.armR.rotation.x, c.arX), 0, mix(n.armR.rotation.z, c.arZ)); n.elbR.rotation.set(mix(n.elbR.rotation.x, c.erX), 0, 0);
    }
    n.legL.rotation.set(mix(n.legL.rotation.x, c.llX), 0, mix(n.legL.rotation.z, c.llZ)); n.legR.rotation.set(mix(n.legR.rotation.x, c.lrX), 0, mix(n.legR.rotation.z, c.lrZ));
    n.kneeL.rotation.x = mix(n.kneeL.rotation.x, c.klX); n.kneeR.rotation.x = mix(n.kneeR.rotation.x, c.krX);
    n.footL.rotation.x = mix(n.footL.rotation.x, c.flX); n.footR.rotation.x = mix(n.footR.rotation.x, c.frX);
    g.position.y = c.gY * w; g.rotation.x = c.gRx * w;
  };

  // вырез в стене зала под пристройку: стена-коробка режется на части слева/справа от выреза, выше комнаты (Hr) остаётся перемычка.
  // xp — плоскость стены (центр), [z0, z1] — вырез. Возвращает {hex} цвета стены (для стен комнаты) или null.
  function cutWall(r, xp, z0, z1, Hr) {
    const list = []; let hex = null;
    r.scene.children.forEach((m) => {
      const c = m.userData && m.userData.col;
      if (c && !c.off && !c.door && !c.nodress && !c.glass && c.x0 < xp + 0.05 && c.x1 > xp - 0.05 && (c.x1 - c.x0) < 0.7 && c.z1 > z0 + 0.05 && c.z0 < z1 - 0.05 && c.y1 - c.y0 > 1.8) list.push([m, c]);
    });
    list.forEach((e) => {
      const m = e[0], c = e[1], cz0 = c.z0, cz1 = c.z1, y0 = c.y0, y1 = c.y1, xc = (c.x0 + c.x1) / 2, th = c.x1 - c.x0;
      if (hex === null && m.material && m.material.color) hex = m.material.color.getHex();
      const put = (mesh, a, b, ya, yb, col) => {
        mesh.scale.set(th, yb - ya, b - a); mesh.position.set(xc, (ya + yb) / 2, (a + b) / 2);
        if (col) { col.z0 = a; col.z1 = b; col.y0 = ya; col.y1 = yb; }
      };
      const left = z0 - cz0 > 0.05, right = cz1 - z1 > 0.05;
      if (left) put(m, cz0, z0, y0, y1, c);
      else { m.visible = false; c.off = true; }
      if (right) {
        const m2 = m.clone(); m2.visible = true;
        const c2 = Object.assign({}, c, { off: false }); put(m2, z1, cz1, y0, y1, c2); m2.userData = { col: c2 };
        r.colliders.push(c2); r.scene.add(m2);
      }
      if (y1 > Hr + 0.05) {                                                           // перемычка над комнатой
        const m3 = m.clone(); m3.visible = true; m3.userData = { col: null }; put(m3, z0, z1, Hr, y1, null); r.scene.add(m3);
      }
    });
    return { hex, n: list.length };
  }

  // ------------------------------------------------------------------ геометрия комнаты
  // Локальные координаты: u — вглубь комнаты от стены с дверью (0..RD), v — вдоль зала от центра комнаты.
  // yaw «лицом к»: FACE.door — в зал (к двери), FACE.wall — к дальней (внешней) стене.
  function makeRoom(r, o) {
    const T = THREE, side = o.side, W = o.W, RD = o.RD, Hr = Math.min(o.H, 3.2), rz = o.z, rng = o.rng;
    const an = o.x0 !== undefined;                                                    // пристройка за стеной зала (скриптовые миссии): o.x0 — плоскость стены с дверью
    const x0 = an ? o.x0 : side * (W / 2 - RD), xo = an ? o.x0 + side * RD : side * W / 2, cx = (x0 + xo) / 2, wsd = rng() < 0.5 ? -1 : 1;
    const cut = an ? cutWall(r, x0, rz - RW / 2 - WT / 2, rz + RW / 2 + WT / 2, Hr) : null;
    const wall = cut && cut.hex !== null ? cut.hex : o.wall, col = o.floorCol;
    const room = {
      r, side, W, RD, Hr, z: rz, x0, xo, cx, wsd, scene: o.scene, sec: o.sec || null, state: 'closed', items: [], occ: [], door: null, rng,
      F: { door: Math.atan2(-side, 0), wall: Math.atan2(side, 0) }, at: 0.5, num: o.num || 1, aggro: false, clean: false, annex: an
    };
    room.pt = (u, v) => [x0 + side * u, rz + v];
    const box = (x, y, z, w, h, d, c, solid) => {
      const m = r.box(x, y, z, w, h, d, c, solid);
      if (m.userData.col) m.userData.col.nodress = true;
      return m;
    };
    // боковые стены, потолок, пол
    box(cx, Hr / 2, rz - RW / 2, RD, Hr, WT, wall, true);
    box(cx, Hr / 2, rz + RW / 2, RD, Hr, WT, wall, true);
    if (an) box(xo, Hr / 2, rz, WT, Hr, RW + WT, wall, true);                         // дальняя стена пристройки
    box(cx, Hr + 0.05, rz, RD + 0.1, 0.1, RW + 0.1, 0x3b3b3b, false);
    box(cx, 0.012, rz, RD - 0.12, 0.02, RW - 0.12, col, false);
    r.strip(cx, Hr - 0.06, rz, 1.5, 0.05, 0.34, 0xffffff);          // потолочная лампа-полоска (без источника света: лампы зала следуют за игроком)
    // стена с дверью и окном (толщина вдоль x)
    // сегменты выше человеческого роста (притолока, верх окна) без коллайдера: r.blocked игрока не смотрит на высоту и перегородил бы проём
    const seg = (v0, v1, y0, y1) => { if (v1 - v0 > 0.02 && y1 - y0 > 0.02) box(x0, (y0 + y1) / 2, rz + (v0 + v1) / 2, WT, y1 - y0, v1 - v0, wall, y0 < 1); };
    const wa = wsd * 1.3, wb = wsd * 2.9, w0 = Math.min(wa, wb), w1 = Math.max(wa, wb), h = RW / 2, d2 = DW / 2;
    // вдоль v: [−h..−d2] стена | дверь | [d2..h] стена; окно (w0..w1) — на стороне wsd
    const parts = [];
    if (wsd > 0) parts.push([-h, -d2], [d2, w0], [w1, h]); else parts.push([-h, w0], [w1, -d2], [d2, h]);
    parts.forEach((p) => seg(p[0], p[1], 0, Hr));
    seg(-d2, d2, DH, Hr);                                           // притолока над дверью
    seg(w0, w1, 0, 0.9); seg(w0, w1, 2.1, Hr);                      // подоконник и верх окна
    const gm = new T.Mesh(r.g.box, new T.MeshBasicMaterial({ color: 0xbbbbbb, transparent: true, opacity: 0.14, depthWrite: false }));
    gm.position.set(x0, 1.5, rz + (w0 + w1) / 2); gm.scale.set(0.06, 1.2, w1 - w0); r.scene.add(gm);
    const gc = { x0: x0 - 0.05, x1: x0 + 0.05, z0: rz + w0, z1: rz + w1, y0: 0.9, y1: 2.1, glass: true, nodress: true }; r.colliders.push(gc);
    room.win = { v0: w0, v1: w1, mesh: gm, col: gc };
    // дверь: панель на петле со стороны −z; коллайдер закрытой двери
    const pivot = new T.Group(); pivot.position.set(x0, 0, rz - d2); r.scene.add(pivot);
    const dm = new T.Mesh(r.g.box, r.mat(0x2b2b2b)); dm.scale.set(0.07, DH, DW - 0.03); dm.position.set(0, DH / 2, DW / 2); pivot.add(dm);
    const st = new T.Mesh(r.g.box, r.mat(0x3d3d3d)); st.scale.set(0.075, DH * 0.62, DW * 0.62); st.position.set(0, DH / 2, DW / 2); pivot.add(st);
    const hd = new T.Mesh(r.g.box, r.mat(0x9a9a9a)); hd.scale.set(0.2, 0.05, 0.05); hd.position.set(-side * 0.05, 1.0, DW - 0.14); pivot.add(hd);
    const dc = { x0: x0 - 0.1, x1: x0 + 0.1, z0: rz - d2, z1: rz + d2, y0: 0, y1: DH, door: true, nodress: true }; r.colliders.push(dc);
    room.door = { pivot, panel: dm, col: dc, parts: [dm, st, hd] };
    // табличка с номером комнаты на стороне зала
    const plate = r.numberPlate(x0 - side * 0.14, 1.65, rz - d2 - 0.4, room.num);
    plate.rotation.y = room.F.door; room.plate = plate;
    // подсказка «выбить дверь»
    room.it = r.interact({
      pos: [x0 - side * 0.3, 1.2, rz], reach: 2.3, label: 'BREACH DOOR',
      enabled: () => room.state === 'closed' && room.active() && !r.breaching && !r.dead,
      use: () => { if (r.breach) r.breach(room); }
    });
    // подсказка «взять в плен» — привязана к ближайшему стоящему на коленях жильцу
    room.hit = r.interact({
      pos: [0, 1.1, 0], reach: 2.2, label: 'SECURE HOSTAGE',
      enabled: () => !!room.kn, use: () => { if (room.kn) secure(r, room.kn); }
    });
    room.active = () => !room.sec || !r.mm || r.mm.cur === room.sec;
    return room;
  }

  // мебель: модель из props3d или коробка-заглушка. fb: [w, h, d, цвет] по локальным осям модели
  function put(room, name, u, v, o, fb) {
    const r = room.r, p = room.pt(u, v); o = o || {};
    let g = window.RoomProps && window.RoomProps.has(name) ? window.RoomProps.make(name, room, p[0], p[1], { yaw: o.yaw || 0, y: o.y || 0, s: o.s, solid: !!o.solid }) : null;   // roomprops.js: детальная мебель с текстурами
    if (!g) g = r.prop(name, p[0], p[1], { yaw: o.yaw || 0, y: o.y || 0, s: o.s, solid: !!o.solid });
    if (g && g.userData.col) g.userData.col.nodress = true;
    if (!g && fb) {
      const sw = Math.abs(Math.sin(o.yaw || 0)) > 0.7, w = sw ? fb[2] : fb[0], d = sw ? fb[0] : fb[2];
      g = r.box(p[0], (o.y || 0) + fb[1] / 2, p[1], w, fb[1], d, fb[3], !!o.solid);
      if (g.userData.col) g.userData.col.nodress = true;
    }
    if (g) room.items.push(g);
    return g;
  }
  const yawTo = (dx, dz) => Math.atan2(dx, dz);

  // ------------------------------------------------------------------ сцены: расстановка мебели и описание жильцов
  // occupant: { u, v, yaw, act: {kind, ...}, pers, gun, sees }
  const SCENES = {
    pc(room, rng) {
      const { RD, side, F, wsd } = room, dv = wsd * rndr(rng, 1.0, 1.9), du = RD - 0.38, H = 0.777;
      put(room, 'office_desk', du, dv, { yaw: F.door, solid: true }, [1.8, 0.78, 0.72, 0x3c3c3c]);
      put(room, 'crt_monitor', du, dv - 0.45, { yaw: F.door, y: H }, [0.36, 0.38, 0.38, 0x222222]);
      put(room, 'computer_tower', du, dv + 0.62, { yaw: F.door, y: H }, [0.25, 0.46, 0.46, 0x2a2a2a]);
      put(room, 'office_chair', RD - 1.0, dv - 0.45, { yaw: F.wall }, [0.6, 0.9, 0.6, 0x1c1c1c]);
      put(room, 'keyboard', du - 0.26, dv - 0.45, { yaw: F.door, y: H }, [0.44, 0.02, 0.15, 0x2a2a2a]);
      put(room, 'mouse', du - 0.27, dv - 0.08, { yaw: F.door + (rng() - 0.5) * 0.3, y: H }, [0.22, 0.03, 0.18, 0x2a3040]);
      put(room, 'desk_lamp', du + 0.2, dv - 0.8, { yaw: F.door, y: H }, [0.12, 0.4, 0.12, 0x303034]);
      put(room, 'mug', du - 0.2, dv - 0.8, { yaw: F.door, y: H }, [0.08, 0.09, 0.08, 0xdddddd]);
      put(room, 'papers', du - 0.08, dv + 0.2, { yaw: F.door + 0.15, y: H }, [0.21, 0.012, 0.3, 0xe8e6de]);
      // экран монитора: мерцает
      const sp = room.pt(du - 0.176, dv - 0.45), T = THREE;   // экран на лицевой грани корпуса (было du-0.15 — утонуло в коробке)
      const sm = new T.MeshBasicMaterial({ color: 0xcfcfcf }), scr = new T.Mesh(room.r.g.box, sm);
      scr.scale.set(0.24, 0.19, 0.01); scr.position.set(sp[0], H + 0.2, sp[1]); scr.rotation.y = F.door; room.r.scene.add(scr);
      room.screen = { mat: sm, mesh: scr };
      window.PCSys && window.PCSys.attach(room, { mesh: scr, mat: sm, x: sp[0], y: H + 0.2, z: sp[1], yaw: F.door }); // webcam.js: камера на мониторе + экран-картинка; desktop.js: рабочий стол по E
      const gp = room.pt(du, dv + 0.2);
      room.gunProp = gunProp(room, gp[0], H + 0.012, gp[1]);                                          // пистолет лежит на бумагах
      decorate(room, rng, dv);
      return [{ u: RD - 1.0, v: dv - 0.45, yaw: F.wall, act: { kind: 'sit', mode: 'type' }, pers: pick(rng, ['lazy', 'lazy', 'pro', 'sadist']), gun: 'pistol', sees: false }];
    },
    tea(room, rng) {
      const { RD, side, F, wsd } = room, dv = wsd * rndr(rng, 1.6, 2.0), ut = RD * 0.55, TH = 0.752;
      put(room, 'tea_table', ut, dv, { yaw: F.door, solid: true }, [1.4, 0.75, 0.9, 0x6a5a48]);
      put(room, 'wood_chair', ut - 0.85, dv, { yaw: F.wall }, [0.46, 0.97, 0.46, 0x4a3a2a]);
      put(room, 'wood_chair', ut + 0.85, dv, { yaw: F.door }, [0.46, 0.97, 0.46, 0x4a3a2a]);
      put(room, 'tea_service', ut, dv, { yaw: F.door, y: TH }, [0.4, 0.17, 0.28, 0xdedede]);
      put(room, 'tea_cup', ut - 0.27, dv + 0.14, { yaw: F.door + 0.3, y: TH }, [0.14, 0.08, 0.14, 0xdedede]);       // чашки у каждого из сидящих
      put(room, 'tea_cup', ut + 0.27, dv - 0.14, { yaw: F.door + PI - 0.3, y: TH }, [0.14, 0.08, 0.14, 0xdedede]);
      put(room, 'thermos', ut, dv - 0.52, { yaw: F.door, y: TH }, [0.09, 0.3, 0.09, 0x555555]);
      const gp = room.pt(ut + 0.1, dv + 0.52); room.gunProp = gunProp(room, gp[0], TH, gp[1]);
      decorate(room, rng, dv);
      const pairs = [['pro', 'panic'], ['sadist', 'lazy'], ['lazy', 'panic'], ['pro', 'lazy']], pr = pairs[(rng() * pairs.length) | 0];
      return [
        { u: ut - 0.85, v: dv, yaw: F.wall, act: { kind: 'sit', mode: 'drink', look: side * 0.0 + 0.0 }, pers: pr[0], gun: 'pistol', sees: true, mate: 1 },
        { u: ut + 0.85, v: dv, yaw: F.door, act: { kind: 'sit', mode: 'drink' }, pers: pr[1], gun: 'rifle', sees: true, mate: 0 }
      ];
    },
    repair(room, rng) {
      const { RD, side, F, wsd } = room, dv = wsd * rndr(rng, 0.9, 2.0), rack = /lab|vault/.test(room.theme || '') || rng() < 0.5;
      if (rack) put(room, 'server_rack', RD - 0.4, dv, { yaw: F.door, solid: true }, [0.62, 1.9, 0.62, 0x2a2a2a]);
      else put(room, 'generator', RD - 0.65, dv, { yaw: F.door, solid: true }, [1.4, 1.0, 1.07, 0x2a2a2a]);
      const tp = room.pt(RD - 1.55, dv - 0.8); room.items.push(room.r.box(tp[0], 0.12, tp[1], 0.5, 0.24, 0.3, 0x444444, false));   // ящик с инструментом
      room.spark = room.pt(RD - 0.9, dv);
      decorate(room, rng, dv);
      return [{ u: RD - 1.3, v: dv + 0.15, yaw: F.wall, act: null, work: rack ? 1 : 2, pers: 'tech', gun: 'pistol', sees: false }];
    },
    sleep(room, rng) {
      const { RD, side, F, wsd } = room, sg = rng() < 0.5 ? wsd : -wsd, us = RD * 0.5, vs = sg * 2.9;
      put(room, 'sofa', us, vs, { yaw: -sg * PI / 2, solid: true }, [0.926, 0.9, 1.9, 0x3a3a3a]);
      put(room, 'armchair', RD - 0.7, -sg * 2.55, { yaw: yawTo(0, sg) }, [0.7, 0.85, 0.69, 0x333333]);
      const tp = room.pt(us + 1.35, vs - sg * 0.3); room.items.push(room.r.box(tp[0], 0.28, tp[1], 0.45, 0.56, 0.45, 0x444444, true));   // столик
      decorate(room, rng, sg * 2.2, true);
      const hx = side;                                                                          // голова — к внешней стене
      return [{ u: us - 0.85, v: vs, yaw: -hx * PI / 2, act: { kind: 'sleep' }, pers: pick(rng, ['lazy', 'stunned', 'lazy']), gun: 'pistol', sees: false, sleeper: true }];
    },
    // караулка: двое играют в карты за столом, третий стоит у двери с винтовкой; у стены оружейная стойка, шкафчики, ящики с патронами
    guards(room, rng) {
      const { RD, side, F, wsd } = room, dv = wsd * rndr(rng, 1.4, 1.8), ut = RD * 0.52, TH = 0.752, ow = RD - 0.3;
      put(room, 'guard_table', ut, dv, { yaw: F.door, solid: true }, [1.4, 0.75, 0.9, 0x5a4a38]);
      put(room, 'wood_chair', ut - 0.85, dv, { yaw: F.wall }, [0.46, 0.97, 0.46, 0x4a3a2a]);
      put(room, 'wood_chair', ut + 0.85, dv, { yaw: F.door }, [0.46, 0.97, 0.46, 0x4a3a2a]);
      put(room, 'cards', ut, dv, { yaw: F.door, y: TH + 0.005 }, [0.3, 0.01, 0.15, 0xece8de]);
      put(room, 'radio', ut + 0.28, dv + 0.38, { yaw: F.door + 0.5, y: TH }, [0.07, 0.15, 0.04, 0x2a2e2a]);
      put(room, 'mug', ut - 0.32, dv - 0.36, { yaw: F.door, y: TH }, [0.08, 0.09, 0.08, 0xdddddd]);
      put(room, 'gun_rack', ow + 0.08, -wsd * 2.7, { yaw: F.door }, [1.5, 1.9, 0.2, 0x3a3a3a]);
      put(room, 'locker', ow - 0.05, -wsd * 0.35, { yaw: F.door, solid: true }, [0.84, 1.9, 0.5, 0x4c5652]);
      put(room, 'locker', ow - 0.05, -wsd * 1.25, { yaw: F.door, solid: true }, [0.84, 1.9, 0.5, 0x4c5652]);
      put(room, 'ammo_box', ow - 0.1, wsd * 3.0, { yaw: F.door - 0.15 * wsd, solid: true }, [0.66, 0.56, 0.4, 0x46502f]);
      const gp = room.pt(ut + 0.3, dv - 0.33); room.gunProp = gunProp(room, gp[0], TH, gp[1]);
      decorate(room, rng, dv);
      return [
        { u: ut - 0.85, v: dv, yaw: F.wall, act: { kind: 'sit', mode: 'cards' }, pers: pick(rng, ['lazy', 'sadist', 'pro']), gun: 'pistol', sees: true, mate: 1 },
        { u: ut + 0.85, v: dv, yaw: F.door, act: { kind: 'sit', mode: 'cards' }, pers: pick(rng, ['sadist', 'lazy', 'zealot']), gun: 'pistol', sees: true, mate: 0 },
        { u: 1.25, v: -wsd * 1.5, yaw: yawTo(0, wsd), act: null, pers: pick(rng, ['pro', 'zealot', 'pro']), gun: 'rifle', sees: true }
      ];
    }
  };
  function pick(rng, arr) { return arr[(rng() * arr.length) | 0]; }
  function gunProp(room, x, y, z) {
    const m = room.r.box(x, y + 0.02, z, 0.2, 0.04, 0.09, 0x151515, false); m.rotation.y = room.rng() * PI; room.items.push(m); return m;
  }
  // мелкая обстановка вдоль боковых стен (не там, где сцена)
  function decorate(room, rng, busyV, noShelf) {
    const { RD, side, wsd } = room, wallV = busyV > 0 ? -1 : 1;                                 // сторона стены, противоположная сцене
    const vz = wallV * (RW / 2 - 0.4), yaw = wallV > 0 ? PI : 0;
    const a = pick(rng, ['bookshelf', 'filing_cabinet', 'copier', 'bookshelf']);
    if (!noShelf || rng() < 0.5) put(room, a, RD * 0.45, vz, { yaw, solid: true }, a === 'bookshelf' ? [1.24, 2.0, 0.44, 0x3a3a3a] : [0.72, 1.3, 0.72, 0x3a3a3a]);
    put(room, 'water_cooler', 0.7, -wsd * (RW / 2 - 0.4), { yaw: wsd > 0 ? 0 : PI, solid: true }, [0.24, 1.1, 0.26, 0x666666]);
  }

  // ------------------------------------------------------------------ жильцы
  const REACT = {
    panic: { sk: 0.7, pose: 'cower', next: 'beg', begT: 9, gd: 1.5 },
    tech: { sk: 0.55, pose: 'face', next: 'beg', begT: 8, gd: 1.7 },
    stunned: { sk: 1.0, pose: 'face', next: 'beg', begT: 6, gd: 1.6 },
    lazy: { sk: 1.15, pose: 'startle', next: 'grab', gd: 1.5 },
    pro: { sk: 0.35, pose: 'startle', next: 'grab', gd: 0.6, snatch: true },
    sadist: { sk: 0.45, pose: 'startle', next: 'grab', gd: 0.7, taunt: true },
    zealot: { sk: 0.3, pose: 'startle', next: 'grab', gd: 0.45 }
  };
  const live = (e) => !e.dead && e.occ;
  const isFight = (e) => e.occ && e.occ.st === 'fight';

  function spawnOcc(r, room, specs) {
    specs.forEach((sp) => {
      const p = room.pt(sp.u, sp.v), yaw = sp.yaw;
      const e = r.enemy('grunt', p[0], p[1], { exact: true, drop: false, tag: 'int', yaw, pers: sp.pers || false, gun: sp.gun || 'pistol', ai: occAI });
      const n = e.n;
      n.holster = true; n.gunG.visible = false;
      n.yaw = yaw; n.g.rotation.y = yaw;
      e.occ = { room, st: 'idle', t: 0, spec: sp, nt: 0, kt: 0, surprise: true, snd: 0, ph: Math.random() * 6 };
      e.onHit = onHit; e.onDeath = onDeath;
      if (sp.act) { const a = setAct(n, sp.act.kind, sp.act); a.w = 1; }
      if (sp.work) { n.work = 1; n.cvT = sp.work === 2 ? 0.55 : 0; }                // техник чинит стоя у стойки / присев у генератора
      if (sp.mate !== undefined) e.occ.mate = sp.mate;
      room.occ.push(e);
    });
    // партнёры по чаю смотрят друг на друга
    room.occ.forEach((e) => { if (e.occ.mate !== undefined && room.occ[e.occ.mate] && e.n.act) e.n.act.look = lookAt(e, room.occ[e.occ.mate]); });
  }
  function lookAt(a, b) { // поворот головы к соседу относительно взгляда a: >0 влево
    const ya = a.n.yaw, ang = Math.atan2(b.x - a.x, b.z - a.z), d = Math.atan2(Math.sin(ang - ya), Math.cos(ang - ya));
    return clamp(d / 1.57, -1, 1);
  }
  function faceP(r, e) { e.n.yaw = Math.atan2(r.p.x - e.x, r.p.z - e.z); }

  function occAI(e, dt, r, dist) {
    const o = e.occ; if (!o) return false;
    o.t += dt;
    const n = e.n;
    switch (o.st) {
      case 'idle': {
        const room = o.room;
        if (room.state !== 'closed') { toShock(r, e, 'door'); return true; }
        if (o.spec.sees !== false && e.los && dist < 10) {  // сквозь окно виден игрок: замечает через ~1.3 с, вблизи быстрее
          const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(r.p.x - e.x, r.p.z - e.z) - n.g.rotation.y), Math.cos(Math.atan2(r.p.x - e.x, r.p.z - e.z) - n.g.rotation.y)));
          if (ang < 1.25) { o.nt += dt * (dist < 4 ? 2 : 1); if (o.nt > 1.3) { toAlert(r, e, 'seen'); return true; } } else o.nt = Math.max(0, o.nt - dt);
        } else o.nt = Math.max(0, o.nt - dt * 0.6);
        return true;
      }
      case 'alert': { // засада: стоит с оружием, целится в дверь
        const d = o.room.door; n.yaw = Math.atan2(o.room.x0 - e.x, o.room.z - e.z); n.armT = o.t > 0.7 ? 1 : 0;
        if (o.t > 0.45 && n.holster) drawGun(e);
        if (o.room.state !== 'closed') toFight(r, e);
        void d; return true;
      }
      case 'shock': {
        faceP(r, e);
        if (o.t >= o.R.sk) { if (o.R.next === 'grab') toGrab(r, e); else toBeg(r, e); }
        return true;
      }
      case 'grab': {
        faceP(r, e);
        const gd = o.R.gd || 1;
        if (o.R.snatch && o.t > gd * 0.2 && o.t < gd * 0.5 && o.room.gunProp && o.room.gunProp.visible) setAct(n, 'reach');
        if (o.t > gd * 0.5 && n.holster) { drawGun(e); if (o.room.gunProp && o.R.snatch) o.room.gunProp.visible = false; endAct(n, 10); o.surprise = false; }
        if (o.t >= gd) toFight(r, e);
        return true;
      }
      case 'beg': {
        faceP(r, e);
        if (o.kt >= 0.55) { toKneel(r, e); return true; }
        if (aimedAt(r, e, dist)) o.kt += dt; else o.kt = Math.max(0, o.kt - dt * 0.7);
        if (o.t >= o.R.begT && !r.cineDepth) { o.R = Object.assign({}, o.R, { gd: 1.2 }); toGrab(r, e, true); }
        return true;
      }
      case 'kneel': { faceP(r, e); o.kneelT += dt; return true; }
      case 'bound': return true;
      case 'fight': default: e.ai = null; return false;
    }
  }

  function aimedAt(r, e, dist) {
    if (!r.wp || r.rl || r.swapTo || r.locked || dist > 9 || !e.los) return false;
    const v = r.int.v || (r.int.v = new THREE.Vector3()), cam = r.camera;
    cam.getWorldDirection(v);
    const dx = e.x - cam.position.x, dy = 1.15 - cam.position.y, dz = e.z - cam.position.z, l = hyp(dx, dy, dz) || 1;
    return (dx * v.x + dy * v.y + dz * v.z) / l > ((r.aimK || 0) > 0.3 ? 0.93 : 0.975);
  }
  function drawGun(e) { const n = e.n; n.holster = false; n.gunG.visible = !!n.gunKind; n.work = 0; n.cvT = 0; }

  function toAlert(r, e, why) {
    const o = e.occ, n = e.n; if (o.st !== 'idle') return;
    o.st = 'alert'; o.t = 0; o.surprise = false; n.work = 0; n.cvT = 0;
    if (n.act) setAct(n, 'startle'), endAct(n, 7);
    n.armT = 0;
  }
  function toShock(r, e, cause) {
    const o = e.occ, n = e.n; if (o.st !== 'idle' && o.st !== 'alert') return;
    if (o.st === 'alert') { toFight(r, e); return; }
    o.st = 'shock'; o.t = 0; o.R = REACT[e.pr ? e.pr.id : 'pro'] || REACT.pro;
    n.work = 0; n.cvT = 0;
    faceP(r, e);
    setAct(n, o.R.pose, { fear: 1 });
    n.act.w = Math.max(n.act.w, 0.25);
    if (o.R.pose === 'startle' && !n.act.cur) n.act.cur = null;
    if (o.R.taunt) n.taunt = 0.8;
    r.snd && r.snd.play('rustle', { k: 0.5 });
  }
  function toGrab(r, e, desperate) { const o = e.occ; o.st = 'grab'; o.t = 0; o.surprise = false; if (desperate) e.n.act && setAct(e.n, 'startle'); else setAct(e.n, 'startle'); }
  function toBeg(r, e) {
    const o = e.occ; o.st = 'beg'; o.t = 0; o.kt = 0; setAct(e.n, 'hands', { fear: 1 }); e.n.taunt = 0;
    if (!r.int.tipB) { r.int.tipB = 1; r.hint('HE SURRENDERS — KEEP YOUR AIM ON HIM AND HE WILL KNEEL', 5); }
  }
  function toKneel(r, e) {
    const o = e.occ; o.st = 'kneel'; o.kneelT = 0; o.surprise = false; setAct(e.n, 'kneel', { fear: 1 });
    r.snd && r.snd.play('rustle', { k: 0.7 });
    if (!r.int.tipK) { r.int.tipK = 1; r.hint('SHOOT = EXECUTE // [E] = SECURE HOSTAGE', 5); }
  }
  function toFight(r, e) {
    const o = e.occ, n = e.n; o.st = 'fight'; o.room.aggro = true; o.surprise = false;
    if (n.holster) drawGun(e);
    endAct(n, 10); n.taunt = 0; n.daze = 0; e.ai = null; e.spawnT = 0;
    if (r.cb) r.cb.lastCombat = r.time;
  }
  function secure(r, e) {
    const o = e.occ; if (!o || o.st !== 'kneel') return;
    o.st = 'bound'; setAct(e.n, 'bound'); r.snd && r.snd.play('rustle', { k: 1 }); r.snd && r.snd.play('click', { k: 0.6 });
    award(r, o.room, 'secure');
    checkClear(r, o.room);
  }
  function onHit(e, amt, head) {                                                    // ранение не смертельное: жилец выходит из бытового режима и дерётся
    const o = e.occ; if (!o || e.dead || e.hp <= 0 || o.st === 'fight') return;        // смертельный выстрел: onDeath сам решит, какой бонус
    if (o.st === 'kneel' || o.st === 'bound' || o.st === 'beg' || o.st === 'shock') o.room.aggro = true;
    toFight(o.room.r, e);
  }
  function onDeath(e, head) {
    const o = e.occ; if (!o) return;
    const r = o.room.r;
    if (o.st === 'kneel' && o.kneelT > 0.4) award(r, o.room, 'exec');
    else if (o.st === 'bound') { /* убийство связанного заложника — без бонуса */ }
    else if (e.mel) award(r, o.room, 'brutal');
    else if (o.surprise && (o.st === 'idle' || o.st === 'shock' || o.st === 'beg')) award(r, o.room, 'surprise');
    o.st = 'dead'; if (e.n.act) { e.n.act.tw = 0; e.n.act.sp = 40; }
    checkClear(r, o.room);
  }
  function checkClear(r, room) {
    if (room.clean || room.aggro) return;
    if (room.occ.every((e) => e.dead || (e.occ && e.occ.st === 'bound'))) { room.clean = true; award(r, room, 'clean'); }
  }

  // ------------------------------------------------------------------ жизненный цикл комнат в миссии
  function roomOf(r) { return r.int || (r.int = { rooms: [], bonus: 0, v: null }); }
  function dispose(r, e) {                                                          // жилец прошлой попытки: убрать из боя, вернуть тело в пул
    if (!e || e.n.free || !r.cb) return;
    e.dead = true; e.alive = false; e.ai = null; e.n.act = null; e.n.free = true; e.n.g.visible = false;
    const i = r.cb.enemies.indexOf(e); if (i >= 0) r.cb.enemies.splice(i, 1);
    const j = r.cb.shoot.indexOf(e); if (j >= 0) r.cb.shoot.splice(j, 1);
  }
  function reset(r, room) {                                                         // перед (повторным) входом в сектор: дверь закрыта, жильцы на местах
    const D2 = room.door;
    room.state = 'closed'; room.aggro = false; room.clean = false; room.kn = null;
    if (D2.fly) { D2.fly.parent && D2.fly.parent.remove(D2.fly); D2.fly = null; }   // летящая дверь breach.js — отдельная копия
    D2.pivot.rotation.set(0, 0, 0); D2.pivot.visible = true; D2.col.off = false;
    if (room.splinters) room.splinters = null;
    if (room.gunProp) room.gunProp.visible = true;
    room.occ.forEach((e) => dispose(r, e));
    room.occ.length = 0;
    if (room.sec && room.sec.intEarned) { r.intBonus = Math.max(0, (r.intBonus || 0) - room.sec.intEarned); room.sec.intEarned = 0; }
  }
  // ------------------------------------------------------------------ планирование комнат в миссии
  // В каждой миссии после 6-й гарантирована минимум одна комната-караулка ('guards'). Уровни сектора:
  //   0 — обычная комната внутри зала у боковой стены;  1 — пристройка за наружной стеной (стелс/хак/снайпер/мост — внутри зал занят);  9 — не годится.
  const NOGO = ['run', 'boss'];
  function lvlOf(M, sec) {
    if (sec.last || sec.norooms || NOGO.indexOf(sec.b) >= 0) return 9;
    if (['snipe', 'stealth'].indexOf(sec.b) >= 0 || sec.hk || M.def.theme === 'bridge' || M.W < 16) return 1;
    return 0;
  }
  const ovlIn = (placed, b) => placed.some((p) => Math.abs(p[0] - b[0]) < (p[2] + b[2]) / 2 + 0.6 && Math.abs(p[1] - b[1]) < (p[3] + b[3]) / 2 + 0.6);
  // одна попытка поставить комнату в сектор: annex=false — внутри зала, true — за наружной стеной; tries — число случайных попыток по z
  function tryPlace(r, M, sec, placed, rng, annex, scene, tries) {
    const W = M.W, T = M.T, side = sec.k % 2 === 0 ? 1 : -1, RD = annex ? 4.6 : clamp(W * 0.22, 4.4, 5.6);
    const x0 = annex ? side * (W / 2 + 0.15) : side * (W / 2 - RD), xc = annex ? x0 : (x0 + side * W / 2) / 2;
    const zr = annex ? [sec.zB + RW / 2 + 1.0, sec.zA - RW / 2 - 1.0] : [sec.zB + RW / 2 + 7.5, sec.zA - RW / 2 - 6.5];
    if (zr[1] - zr[0] < 1) return null;
    const hw = W / 2 - 2.4, supp = [[hw * 0.8, sec.cz - 2], [-hw * 0.7, sec.cz + 2]];       // точки подбора припасов из missions4.supplies — не внутри комнаты
    const onSupp = (z) => supp.some((q) => q[0] * side > x0 * side - 1.2 && Math.abs(q[1] - z) < RW / 2 + 1.2);
    let rz = null;
    for (let t = 0; t < tries && rz === null; t += 1) {
      const z = rndr(rng, zr[0], zr[1]);
      if ((annex || !ovlIn(placed, [xc, z, RD + 0.5, RW + 0.5])) && !ovlIn(placed, [x0 - side * 1.9, z, 3.8, 3.4]) && !onSupp(z)) rz = z;
    }
    if (rz === null) return null;
    if (!annex) placed.push([xc, rz, RD + 0.5, RW + 0.5]);
    placed.push([x0 - side * 1.9, rz, 3.8, 3.4]);
    const I = roomOf(r);
    const o = { side, W, RD, H: M.H, z: rz, rng, scene, sec, num: I.rooms.length + 1 + (M.def.id % 7) * 3, wall: shade(T.wall, 0.92), floorCol: shade(T.floor, 1.25) };
    if (annex) o.x0 = x0;
    const room = makeRoom(r, o);
    room.theme = M.def.theme; room.rect = [Math.min(room.x0, room.xo) - 0.3, Math.max(room.x0, room.xo) + 0.3, rz - RW / 2 - 0.3, rz + RW / 2 + 0.3];
    room.specs = SCENES[scene](room, rng);
    I.rooms.push(room);
    if (annex) extendBounds(r, room);
    if (!I.hook) { I.hook = true; r.hooks.push((dt) => roomsUpdate(r, dt)); }
    return room;
  }
  Run.prototype.intBuild = function (M, sec, placed) {
    if (OFF || !M || !M.def) return;
    const I = roomOf(this), id = M.def.id | 0, seed = id * 131 + sec.k * 17 + 5, rng = mulberry(seed), lv = lvlOf(M, sec);
    if (lv > 1) return;
    // гарантированная караулка (миссии после 6-й): первый по приоритету сектор, где комната возможна
    if (id > 6 && !I.guardDone) {
      if (!I.order) I.order = M.secs.map((s, k) => [lvlOf(M, s), k]).filter((q) => q[0] <= 1).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((q) => q[1]);
      const left = I.order.filter((k) => k >= sec.k && !(I.failed && I.failed[k]));
      if (left[0] === sec.k) {
        const rf = mulberry(seed + 99);
        const room = (lv === 0 && tryPlace(this, M, sec, placed, rf, false, 'guards', 40)) || tryPlace(this, M, sec, placed, rf, true, 'guards', 60);
        if (room) { I.guardDone = true; room.guard = true; return; }
        (I.failed || (I.failed = {}))[sec.k] = 1;
      }
    }
    if (lv !== 0 || rng() > 0.82) return;
    const scenes = SCENE_BY_THEME[M.def.theme] || SCENE_BY_THEME.default, scene = scenes[(rng() * scenes.length) | 0];
    tryPlace(this, M, sec, placed, rng, false, scene, 14);
  };
  const SCENE_BY_THEME = {
    office: ['pc', 'tea', 'guards', 'pc', 'sleep'], lab: ['repair', 'pc', 'guards', 'tea'], mansion: ['tea', 'sleep', 'guards', 'tea', 'pc'], vault: ['repair', 'guards', 'pc'],
    bunker: ['sleep', 'guards', 'tea', 'repair'], garage: ['repair', 'sleep', 'guards', 'tea'], default: ['pc', 'tea', 'guards', 'repair', 'sleep']
  };
  function shade(hex, k) { const f = (c) => clamp(Math.round(c * k), 0, 255); return (f((hex >> 16) & 255) << 16) | (f((hex >> 8) & 255) << 8) | f(hex & 255); }

  Run.prototype.intSector = function (M, sec) {                                     // начало сектора: двери закрыты, жильцы появляются
    const I = this.int; if (!I) return;
    I.rooms.forEach((room) => { if (room.sec === sec) { reset(this, room); spawnOcc(this, room, room.specs); } });
  };
  Run.prototype.inRoom = function (x, z) {
    const I = this.int; if (!I) return false;
    for (const rm of I.rooms) { const q = rm.rect; if (x > q[0] && x < q[1] && z > q[2] && z < q[3]) return true; }
    return false;
  };
  // ------------------------------------------------------------------ пристройки за наружной стеной зала
  // Комната стоит снаружи зала, стена зала режется под неё (cutWall); границы мира (r.bounds) расширяются до комнаты, а «пустота» рядом
  // с залом закрывается невидимыми коллайдерами — чтобы навигация и спавн врагов не уходили за стену.
  function extendBounds(r, room) {
    const b = r.bounds; if (!b) return;
    const I = roomOf(r);
    if (!I.b0) I.b0 = { x0: b.cx - b.w / 2, x1: b.cx + b.w / 2, z0: b.cz - b.d / 2, z1: b.cz + b.d / 2, h: b.h };
    const B = I.b0, a = { side: room.side, xo: room.xo, z0: room.z - RW / 2 - WT, z1: room.z + RW / 2 + WT };
    if (a.z0 < B.z0 || a.z1 > B.z1 || (room.side > 0 ? room.xo <= B.x1 : room.xo >= B.x0)) return;   // не за боковой стеной — границы не трогаем
    (I.ann || (I.ann = [])).push(a);
    let xa = B.x0, xb = B.x1;
    I.ann.forEach((q) => { if (q.side > 0) xb = Math.max(xb, q.xo + 0.6); else xa = Math.min(xa, q.xo - 0.6); });
    r.bounds = { cx: (xa + xb) / 2, cz: b.cz, w: xb - xa, d: b.d, h: b.h };
    if (I.fills) I.fills.forEach((c) => { const i = r.colliders.indexOf(c); if (i >= 0) r.colliders.splice(i, 1); });
    I.fills = [];
    [[1, B.x1, xb], [-1, xa, B.x0]].forEach((s) => {
      if (s[2] - s[1] < 0.5) return;
      const cuts = I.ann.filter((q) => q.side === s[0]).sort((p, q) => p.z0 - q.z0);
      let z = B.z0;
      const fill = (za, zb) => { if (zb - za > 0.05) { const c = { x0: s[1], x1: s[2], z0: za, z1: zb, y0: 0, y1: 9, nodress: true, fill: true }; r.colliders.push(c); I.fills.push(c); } };
      cuts.forEach((q) => { fill(z, q.z0); z = Math.max(z, q.z1); });
      fill(z, B.z1);
    });
  }

  // стены-кандидаты под пристройку: тонкие высокие коллайдеры, в которые влезает комната (вдоль z ≥ RW + 0.5)
  function wallSegs(r) {
    const out = [];
    for (const c of r.colliders) {
      if (c.off || c.door || c.glass || c.nodress || c.fill) continue;
      if (c.x1 - c.x0 > 0.7 || c.z1 - c.z0 < RW + 0.5 || c.y1 - c.y0 < 2.4) continue;
      out.push(c);
    }
    return out;
  }
  const hits = (r, x0, x1, z0, z1, skip) => r.colliders.some((c) => !c.off && !(skip && skip(c)) && c.y1 > 0.15 && c.y0 < 2.2 && c.x0 < x1 && c.x1 > x0 && c.z0 < z1 && c.z1 > z0);
  const origB = (r) => (r.int && r.int.b0) || (r.bounds ? { x0: r.bounds.cx - r.bounds.w / 2, x1: r.bounds.cx + r.bounds.w / 2, z0: r.bounds.cz - r.bounds.d / 2, z1: r.bounds.cz + r.bounds.d / 2 } : null);
  // свободен ли слот: за стеной (тело комнаты) и в зале перед дверью. side — куда вырастает комната (+1 → к +x)
  function slotFree(r, xp, side, z, RD, FZ) {
    const b = origB(r), xo = xp + side * RD, bx0 = Math.min(xp, xo), bx1 = Math.max(xp, xo);
    if (b && bx0 < b.x1 - 0.3 && bx1 > b.x0 + 0.3 && z + RW / 2 > b.z0 && z - RW / 2 < b.z1) return false;   // тело комнаты не должно заходить в игровую область
    const ba = xp + side * 0.2, bb = xo + side * 0.4;
    if (hits(r, Math.min(ba, bb), Math.max(ba, bb), z - RW / 2 - 0.4, z + RW / 2 + 0.4)) return false;
    const fa = xp - side * 0.35, fb = xp - side * FZ;
    return !hits(r, Math.min(fa, fb), Math.max(fa, fb), z - 1.9, z + 1.9, (c) => Math.abs((c.x0 + c.x1) / 2 - xp) < 0.45 && c.x1 - c.x0 < 0.7);
  }
  // все допустимые слоты: [{xp, side, z}], по возрастанию z
  function scanSlots(r, RD) {
    const out = [];
    wallSegs(r).forEach((c) => {
      const xp = (c.x0 + c.x1) / 2;
      [1, -1].forEach((side) => {
        for (let z = c.z0 + RW / 2 + 0.3; z <= c.z1 - RW / 2 - 0.3; z += 0.5) if (slotFree(r, xp, side, z, RD || 4.6, 2.8)) out.push({ xp, side, z });
      });
    });
    return out.sort((p, q) => p.z - q.z);
  }
  // построить пристройку по слоту; возвращает комнату
  function makeAnnex(r, slot, scene, rng, num) {
    const I = roomOf(r), H = r.bounds ? r.bounds.h : 3.6, RD = 4.6;
    const o = { side: slot.side, W: 0, RD, H, z: slot.z, rng, scene, num: num || I.rooms.length + 1, wall: 0x8a8a8a, floorCol: 0x5a5a5a, x0: slot.xp };
    const room = makeRoom(r, o);
    room.theme = ''; room.scripted = true; room.sec = { scripted: true, intEarned: 0 };
    room.rect = [Math.min(room.x0, room.xo) - 0.3, Math.max(room.x0, room.xo) + 0.3, room.z - RW / 2 - 0.3, room.z + RW / 2 + 0.3];
    room.specs = SCENES[scene](room, rng);
    I.rooms.push(room);
    extendBounds(r, room);
    if (!I.hook) { I.hook = true; r.hooks.push((dt) => roomsUpdate(r, dt)); }
    return room;
  }

  // скриптовые миссии (7–16, 47): один зал, без секторов. Комнаты у наружных стен на долях f длины зала; первая — караулка
  const ANNEX = {
    7: { f: [0.3], side: [1] }, 8: { f: [0.5], side: [-1] }, 9: { f: [0.3, 0.7], side: [1, -1] }, 10: { f: [0.5], side: [1] },
    11: { f: [0.45], side: [1] }, 12: { f: [0.5], side: [1] }, 13: { f: [0.35, 0.8], side: [-1, 1] }, 14: { f: [0.5], side: [1] },
    15: { f: [0.3, 0.7], side: [1, -1] }, 16: { f: [0.55], side: [-1] }, 47: { f: [0.35, 0.75], side: [1, -1] }
  };
  function intAuto(r) {
    const id = r.taskId | 0, spec = ANNEX[id];
    if (OFF || !spec || r.mm || !r.bounds) return;
    const I = roomOf(r); if (I.auto) return; I.auto = true;
    const slots = scanSlots(r, 4.6), b = r.bounds, zmin = b.cz - b.d / 2, zlen = b.d, rng = mulberry(id * 977 + 41);
    const used = [];
    spec.f.forEach((f, i) => {
      const zt = zmin + zlen * f, sd = spec.side[i];
      let best = null, bd = 1e9;
      slots.forEach((s) => {
        if (used.some((u) => Math.abs(u - s.z) < RW + 2)) return;
        const d = Math.abs(s.z - zt) + (s.side === sd ? 0 : 6);
        if (d < bd) { bd = d; best = s; }
      });
      if (!best) return;
      used.push(best.z);
      const scene = i === 0 ? 'guards' : ['pc', 'tea', 'guards'][(rng() * 3) | 0];
      makeAnnex(r, best, scene, rng, 20 + id * 2 + i);
    });
    window.Breach && Breach.fxInit && I.rooms.length && Breach.fxInit(r);
  }
  const dr1 = Run.prototype.dress;
  Run.prototype.dress = function () {                                                // пристройки ставим до расстановки декора (он обходит все коллайдеры)
    try { intAuto(this); } catch (e) { console.warn('[rooms]', e); }
    return dr1 ? dr1.apply(this, arguments) : undefined;
  };
  // жильцы пристроек появляются после входа в миссию и возвращаются, если скрипт зачистил врагов (смерть, конец этапа), пока комнату не взял игрок
  function scriptedRooms(r, dt) {
    const I = r.int; if (!I || !r.entered || !r.cb) return;
    for (const rm of I.rooms) {
      if (!rm.scripted) continue;
      if (!rm.life) { reset(r, rm); spawnOcc(r, rm, rm.specs); rm.life = 1; continue; }
      const ext = rm.occ.some((e) => e.dead && e.occ && e.occ.st !== 'dead' && e.occ.st !== 'bound');
      if (ext && !r.cineDepth) { reset(r, rm); spawnOcc(r, rm, rm.specs); }
    }
  }
  // враги скриптов не должны появляться внутри комнат
  const ef1 = Run.prototype.enemyFree;
  Run.prototype.enemyFree = function (x, z) {
    const res = ef1.call(this, x, z), I = this.int;
    if (!I || !I.rooms.length || !this.inRoom(res.x, res.z)) return res;
    for (let rr = 0.5; rr <= 8; rr += 0.5) {
      const n = Math.max(12, Math.round(rr * 12));
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * PI * 2, px = res.x + Math.sin(a) * rr, pz = res.z + Math.cos(a) * rr;
        if (this.inRoom(px, pz)) continue;
        const q = ef1.call(this, px, pz);
        if (q.moved === 0) return { x: px, z: pz, moved: rr, los: q.los };
      }
    }
    return res;
  };

  // сколько жильцов ещё в бою: спящие, сдавшиеся и связанные не считаются врагами миссии
  const ea1 = Run.prototype.enemiesAlive;
  Run.prototype.enemiesAlive = function (filter) {
    return ea1.call(this, (e) => (!e.occ || e.occ.st === 'fight') && (!filter || filter(e)));
  };
  // выстрелы будят жильцов, но стены глушат: слышат ближе, чем остальные враги
  const nz1 = Run.prototype.noise;
  Run.prototype.noise = function (radius) {
    const res = nz1.apply(this, arguments);
    const I = this.int, p = this.p; if (!I || !this.cb) return res;
    for (const rm of I.rooms) {
      for (const e of rm.occ) {
        if (!live(e) || e.occ.st !== 'idle') continue;
        if (hyp(e.x - p.x, e.z - p.z) < radius * (e.occ.spec.sleeper ? 0.35 : 0.55)) toAlert(this, e, 'noise');
      }
    }
    return res;
  };
  // бонусы выплачиваются вместе с наградой за миссию (Toys.bonus добавляется к ближайшему reward)
  const fin1 = Run.prototype.finish;
  Run.prototype.finish = function (done) {
    if (done && this.intBonus > 0 && window.Toys && Toys.bonus) Toys.bonus(this.intBonus);
    this.intBonus = 0;
    return fin1.apply(this, arguments);
  };
  // удар игрока ближнего боя помечает убийство как «жестокое»
  const dmg1 = Run.prototype.damageEnemy;
  Run.prototype.damageEnemy = function (e, amt, head, pt) {
    if (e.occ && e.n.rd && performance.now() - e.n.rd.t < 60) e.mel = true;        // pmove.js hitEnemy метит удар только что (n.rd)
    return dmg1.call(this, e, amt, head, pt);
  };

  // ------------------------------------------------------------------ покадровая работа комнат: звук среды, экран монитора, подсказка заложника
  function roomsUpdate(r, dt) {
    const I = r.int; if (!I) return;
    scriptedRooms(r, dt);
    for (const rm of I.rooms) {
      if (rm.screen) { const f = 0.55 + 0.3 * Math.sin(r.time * 7.3) * Math.sin(r.time * 2.1) + 0.12 * Math.sin(r.time * 31); rm.screen.mat.color.setScalar(clamp(f, 0.2, 1)); }
      if (r.breaching && rm.breaching) rm.occ.forEach((e) => { if (live(e) && e.ai) e.ai(e, dt, r, hyp(e.x - r.p.x, e.z - r.p.z)); }); // враги заморожены катсценой — жильцов ведём сами
      // ближайший коленопреклонённый — цель подсказки «взять в плен»
      let best = null, bd = 9;
      for (const e of rm.occ) if (live(e) && e.occ.st === 'kneel') { const d = hyp(e.x - r.p.x, e.z - r.p.z); if (d < bd) { bd = d; best = e; } }
      rm.kn = best;
      if (best) rm.hit.pos.set(best.x, 1.1, best.z);
      roomAudio(r, rm, dt);
    }
  }
  function roomAudio(r, rm, dt) {
    const snd = r.snd; if (!snd || !snd.ctx || !snd.noise || !snd.tone || !rm.occ.some((e) => live(e) && e.occ.st === 'idle')) return;
    rm.at -= dt; if (rm.at > 0) return;
    const d = hyp(rm.cx - r.p.x, rm.z - r.p.z); if (d > 18) { rm.at = 0.6; return; }
    // пространственный звук (spatial.js): источник — сам жилец (клавиатура, чашки, храп) или центр комнаты; расстояние и стены (дверь, окно) делает PannerNode + окклюзия
    const sp = snd.spatial, who = rm.occ.find((e) => live(e) && e.occ.st === 'idle') || null;
    const v = sp ? sp.voice([who ? who.x : rm.cx, 1.0, who ? who.z : rm.z]) : null;
    if (sp && !v) { rm.at = 0.6; return; }
    const open = rm.state !== 'closed' || !!v, k = v ? 3.2 : Math.pow(1 - d / 18, 1.4) * (rm.state !== 'closed' ? 1 : 0.4), t = snd.ctx.currentTime + 0.02, br = open ? 2600 : 520, dest = v ? v.in : undefined;
    const q = Math.random();
    switch (rm.scene) {
      case 'pc': // клавиатура — очереди щелчков, иногда удар по столу
        for (let i = 0; i < 4 + ((q * 5) | 0); i += 1) snd.noise({ t: t + i * (0.07 + Math.random() * 0.06), type: 'bandpass', f0: br, q: 1.5, dur: 0.018, g: 0.22 * k, dest });
        rm.at = 0.9 + Math.random() * 1.8; break;
      case 'tea': // бубнёж двух голосов и звон чашки
        for (let i = 0; i < 3 + ((q * 4) | 0); i += 1) snd.noise({ t: t + i * 0.17, type: 'bandpass', f0: (rm.occ[(i + 1) % 2] ? 280 : 340) + Math.random() * 160, q: 1.1, dur: 0.13, g: 0.1 * k, a: 0.02, dest });
        if (q < 0.25) snd.tone({ t: t + 0.7, type: 'sine', f0: open ? 2400 : 900, dur: 0.05, g: 0.1 * k, dest });
        rm.at = 1.2 + Math.random() * 1.6; break;
      case 'sleep': // дыхание/храп
        snd.noise({ t, type: 'lowpass', f0: open ? 600 : 300, f1: 160, q: 0.6, dur: 1.1, g: 0.2 * k, a: 0.35, dest });
        rm.at = 2.6 + Math.random() * 0.8; break;
      case 'guards': // карты: бубнёж, шлепок карты о стол
        for (let i = 0; i < 2 + ((q * 3) | 0); i += 1) snd.noise({ t: t + i * 0.23, type: 'bandpass', f0: (i % 2 ? 300 : 360) + Math.random() * 140, q: 1.1, dur: 0.12, g: 0.1 * k, a: 0.02, dest });
        snd.noise({ t: t + 0.55, type: 'bandpass', f0: open ? 3000 : 900, q: 2, dur: 0.035, g: 0.2 * k, dest });
        rm.at = 1.0 + Math.random() * 1.4; break;
      case 'repair': // щёлканье инструмента, редкий разряд с искрой
        for (let i = 0; i < 2 + ((q * 3) | 0); i += 1) snd.tone({ t: t + i * 0.11, type: 'square', f0: open ? 1600 : 700, dur: 0.02, g: 0.1 * k, dest });
        if (q < 0.18) { snd.play('zap', { k: 0.5 * Math.min(1, k) }); if (rm.spark && d < 14) r.sparks && r.sparks(rm.spark[0], 1.0, rm.spark[1], 0, 0.3, 0, 6); }
        rm.at = 0.8 + Math.random() * 1.5; break;
      default: rm.at = 2;
    }
    if (v) v.free(3);
  }

  // ------------------------------------------------------------------ API
  window.Interiors = {
    OFF, REACT, BONUS, SCENES, ANNEX, makeRoom, spawnOcc, reset, award, setAct, endAct, toShock, toFight, toAlert, secure, scanSlots, makeAnnex, intAuto, extendBounds,
    // песочница / отладка: комната у боковой стены текущего помещения; возвращает комнату
    test(r, o) {
      o = o || {}; const b = r.bounds || { w: 24, d: 24, cx: 0, cz: 0, h: 3.6 }, W = b.w, side = o.side || 1;
      const rng = mulberry((o.seed || 7) + 1), RD = clamp(W * 0.22, 4.4, 5.6);
      const I = roomOf(r);
      const room = makeRoom(r, { side, W, RD, H: b.h || 3.6, z: o.z === undefined ? b.cz : o.z, rng, scene: o.scene || 'pc', num: 7, wall: 0x9a9a9a, floorCol: 0x6a6a6a });
      room.cx0 = b.cx; room.theme = o.theme || '';
      // комната построена в мировых координатах относительно x=0 (залы миссий центрированы по x)
      room.specs = SCENES[room.scene](room, rng);
      room.rect = [Math.min(room.x0, room.xo) - 0.3, Math.max(room.x0, room.xo) + 0.3, room.z - RW / 2 - 0.3, room.z + RW / 2 + 0.3];
      I.rooms.push(room);
      if (!I.hook) { I.hook = true; r.hooks.push((dt) => roomsUpdate(r, dt)); }
      reset(r, room); spawnOcc(r, room, room.specs);
      return room;
    }
  };
}());
