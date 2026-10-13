// NEXA: ломаемые компьютеры в комнатах (interiors.js, сцена «pc»): монитор, системный блок, клавиатура и мышь.
// Урон наносят пули (выстрел идёт через Run.castRay → OBB-тест деталей → applyHit), кулаки/ноги/плечо (pmove.js → PCBreak.melee) и взрывы (обёртка Run.explode → PCBreak.blast).
// Монитор: пули по стеклу трескают экран (трещины рисуются в canvas поверх экрана), сбой картинки веб-камеры (uDmg), искры и дым, на нуле — имплозия ЭЛТ (вспышка, осколки стекла, чёрная воронка).
// Системный блок: дырки, искры, дым, на нуле — отлетают крышки, машина мертва (экран гаснет). Клавиатура: клавиши разлетаются. Мышь: рассыпается.
// Удар/взрыв сбрасывает деталь со стола: простая физика твёрдого тела (OBB, отскок, трение, поворот на грань), урон от падения; осколки и дым — свои пулы, без новых источников света.
// Мёртвый монитор или блок = компьютер выключен: рабочий стол по E недоступен (desktop.js), камера не рисует (webcam.js). ?pcbreak=0 отключает.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.Run) return;
  const P = C.Run.prototype, PI = Math.PI, TAU = PI * 2, hyp = Math.hypot;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const OFF = /[?&]pcbreak=0/.test(location.search);
  const PB = window.PCBreak = {};

  // размеры в системе корпуса модели (y — от основания группы, +z — «лицом»): c — центр OBB, h — полуразмеры, m — масса (кг), rs — радиус по горизонтали для стен
  const SPEC = {
    monitor: { hp: 100, c: [0, 0.195, -0.01], h: [0.18, 0.195, 0.19], m: 7, rs: 0.2 },
    tower: { hp: 150, c: [0, 0.24, 0], h: [0.113, 0.23, 0.23], m: 10, rs: 0.22 },
    keyboard: { hp: 40, c: [0, 0.011, 0], h: [0.22, 0.012, 0.075], m: 1, rs: 0.12 },
    mouse: { hp: 25, c: [0, 0.017, 0.01], h: [0.032, 0.014, 0.052], m: 0.3, rs: 0.07 }
  };
  const COL = { beige: 0xcdc6af, dark: 0x1d1d1f, ivory: 0xe6e1d1, grey: 0x55585c, metal: 0x9a9ca2, soot: 0x161616 };
  let PUFF = null;

  // ------------------------------------------------------------------ состояние забега
  function st(r) {
    if (r.pcb) return r.pcb;
    const T = THREE;
    const S = r.pcb = { parts: [], deb: [], smoke: [], glow: [], mats: {}, t: 0, tmp: null };
    S.geo = { box: new T.BoxGeometry(1, 1, 1), circ: new T.CircleGeometry(1, 9), ring: new T.RingGeometry(0.62, 1, 9), plane: new T.PlaneGeometry(1, 1) };
    S.tmp = { iq: new T.Quaternion(), dq: new T.Quaternion(), q2: new T.Quaternion(), o: new T.Vector3(), d: new T.Vector3(), a: new T.Vector3(), b: new T.Vector3(), e: new T.Euler(0, 0, 0, 'YXZ'), m: new T.Matrix4() };
    S.dead = new T.MeshBasicMaterial({ color: 0x07090a });
    r.hooks.push((dt) => { try { tick(r, S, Math.min(dt, 0.05)); } catch (e) { console.error('[pcbreak]', e); S.parts.length = 0; } });
    return S;
  }
  function mat(S, col, glass) {
    const k = glass ? 'g' + col : col;
    if (S.mats[k]) return S.mats[k];
    const T = THREE;
    return (S.mats[k] = glass ? new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, depthWrite: false, side: T.DoubleSide }) : new T.MeshLambertMaterial({ color: col }));
  }
  function puffTex() {
    if (PUFF) return PUFF;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (PUFF = new THREE.CanvasTexture(cv));
  }

  // ------------------------------------------------------------------ регистрация деталей (interiors.js)
  PB.register = function (room, d) {
    if (OFF || !window.THREE || !room || !room.r || !room.r.hooks) return;
    const r = room.r, S = st(r), T = THREE, W = room.pc || null;
    const mk = (kind, g, items, extra) => {
      if (!g) return null;
      const sp = SPEC[kind]; g.updateMatrixWorld(true);
      const p = Object.assign({
        kind, room, W, g, items: items || [g], sp, hp: sp.hp, hp0: sp.hp, stage: 0, state: 'set', hx: sp.h[0], hy: sp.h[1], hz: sp.h[2],
        wc: new T.Vector3(sp.c[0], sp.c[1], sp.c[2]).applyMatrix4(g.matrixWorld), wq: g.getWorldQuaternion(new T.Quaternion()),
        wob: { a: 0, v: 0, dir: 0 }, holes: [], smk: 0, smkT: 0, zap: rnd(1, 3), lastFx: -9, pv: null, b: null
      }, extra);
      if (kind === 'monitor' || kind === 'tower') g.rotation.order = 'YXZ';
      S.parts.push(p); return p;
    };
    const kb = d.keyboard, ms = d.mouse;
    const mon = mk('monitor', d.monitor, [d.monitor].concat(d.scr || [], W && W.body ? [W.body] : [], W && W.led ? [W.led] : []), { scr: d.scr });
    const tow = mk('tower', d.tower);
    const key = kb ? mk('keyboard', kb, kb.children && kb.children.length ? [kb.children[0]] : [kb], { board: kb.children && kb.children[0] ? kb.children[0] : kb }) : null;
    const mou = ms ? mk('mouse', ms, ms.children && ms.children.length >= 4 ? [ms.children[1], ms.children[2], ms.children[3]] : [ms]) : null;
    const set = { mon, tow, key, mou, W, room };
    [mon, tow, key, mou].forEach((p) => { if (p) p.set = set; });
    room.pcb = set;
  };

  // ------------------------------------------------------------------ луч в OBB детали
  function rayPart(S, p, ox, oy, oz, dx, dy, dz, tmax) {
    const R = hyp(p.hx, p.hy, p.hz), vx = p.wc.x - ox, vy = p.wc.y - oy, vz = p.wc.z - oz, tt = vx * dx + vy * dy + vz * dz;
    if (tt < -R || tt > tmax + R) return null;
    if (vx * vx + vy * vy + vz * vz - tt * tt > R * R) return null;
    const T = S.tmp, iq = T.iq.copy(p.wq).invert(), o = T.o.set(-vx, -vy, -vz).applyQuaternion(iq), d = T.d.set(dx, dy, dz).applyQuaternion(iq);
    const h = [p.hx, p.hy, p.hz], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
    let t0 = 0, t1 = tmax, ax = -1, sg = 0;
    for (let i = 0; i < 3; i += 1) {
      if (Math.abs(dd[i]) < 1e-9) { if (Math.abs(oo[i]) > h[i]) return null; continue; }
      let ta = (-h[i] - oo[i]) / dd[i], tb = (h[i] - oo[i]) / dd[i], s = -1;
      if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
      if (ta > t0) { t0 = ta; ax = i; sg = s; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) return null;
    }
    if (ax < 0) return null;
    return { p, t: t0, ax, sg, lx: oo[0] + dd[0] * t0, ly: oo[1] + dd[1] * t0, lz: oo[2] + dd[2] * t0 };
  }
  function nearestHit(r, ox, oy, oz, dx, dy, dz, tmax) {
    const S = r.pcb; if (!S || !S.parts.length) return null;
    let best = null;
    for (const p of S.parts) {
      const h = rayPart(S, p, ox, oy, oz, dx, dy, dz, best ? best.t : tmax);
      if (h && (!best || h.t < best.t)) best = h;
    }
    return best;
  }
  const world = (S, p, lx, ly, lz) => S.tmp.a.set(lx, ly, lz).applyQuaternion(p.wq).add(p.wc);
  const fwdOf = (S, p) => S.tmp.b.set(0, 0, 1).applyQuaternion(p.wq);

  const cast0 = P.castRay;
  P.castRay = function (ox, oy, oz, dx, dy, dz, range) {
    const best = cast0.apply(this, arguments), S = this.pcb;
    if (!S || !S.parts.length) return best;
    const h = nearestHit(this, ox, oy, oz, dx, dy, dz, best.t);
    if (!h || h.t >= best.t) return best;
    const n = new THREE.Vector3(h.ax === 0 ? h.sg : 0, h.ax === 1 ? h.sg : 0, h.ax === 2 ? h.sg : 0).applyQuaternion(h.p.wq);
    const wa = Math.abs(n.x) > Math.abs(n.y) && Math.abs(n.x) > Math.abs(n.z) ? 1 : (Math.abs(n.y) > Math.abs(n.z) ? 2 : 3);
    return { t: h.t, kind: 'pc', ax: wa, hit: h, n };
  };
  const apply0 = P.applyHit;
  P.applyHit = function (hit, dmg, o, dx, dy, dz, multi) {
    if (hit && hit.kind === 'pc') { try { PB.bullet(this, hit, dmg, o, dx, dy, dz, multi); } catch (e) { console.error('[pcbreak]', e); } return; }
    return apply0.apply(this, arguments);
  };

  // ------------------------------------------------------------------ звук (пространственный голос spatial.js, если есть)
  function sfx(r, kind, x, y, z, k) {
    const s = r.snd; if (!s || !s.ctx || !s.noise || !s.tone) return;
    const d = hyp(x - r.p.x, z - r.p.z); if (d > 38) return;
    const sp = s.spatial, v = sp ? sp.voice([x, y, z]) : null;
    if (sp && !v) return;
    const t0 = s.ctx.currentTime + 0.005, dest = v ? v.in : undefined, gk = (k || 1) * (v ? 3.2 : Math.pow(1 - d / 38, 1.5));
    const N = (o) => { o.t = t0 + (o.t || 0); o.dest = dest; o.g *= gk; s.noise(o); };
    const Tn = (o) => { o.t = t0 + (o.t || 0); o.dest = dest; o.g *= gk; s.tone(o); };
    let life = 0.6;
    switch (kind) {
      case 'glass': // трещина по экрану: короткий треск + звон осколков
        N({ type: 'highpass', f0: 3800, q: 0.7, dur: 0.12, g: 0.2, a: 0.001 });
        N({ type: 'bandpass', f0: 1300, q: 1, dur: 0.05, g: 0.14, a: 0.001 });
        for (let i = 0; i < 4; i += 1) Tn({ t: 0.02 + i * 0.04 + Math.random() * 0.02, type: 'sine', f0: rnd(2800, 5400), f1: rnd(2200, 3600), dur: 0.1, g: 0.05, a: 0.001 });
        break;
      case 'implode': // ЭЛТ схлопывается: хлопок, низкий «вуф», сыплется стекло
        N({ type: 'lowpass', f0: 1100, f1: 90, q: 0.8, dur: 0.5, g: 0.55, a: 0.003 });
        N({ type: 'highpass', f0: 4200, q: 0.7, dur: 0.24, g: 0.3, a: 0.001 });
        Tn({ type: 'sine', f0: 150, f1: 38, dur: 0.38, g: 0.5, a: 0.002 });
        Tn({ type: 'sawtooth', f0: 90, f1: 40, dur: 0.3, g: 0.06, a: 0.002, lp: 700 });
        for (let i = 0; i < 7; i += 1) Tn({ t: 0.08 + i * 0.05 + Math.random() * 0.04, type: 'sine', f0: rnd(2600, 5800), f1: rnd(2000, 3400), dur: 0.1, g: 0.04, a: 0.001 });
        N({ t: 0.1, type: 'bandpass', f0: 6500, q: 0.9, dur: 0.6, g: 0.06, a: 0.02 });
        life = 1.4; break;
      case 'plastic':
        N({ type: 'bandpass', f0: 1500, q: 1.4, dur: 0.07, g: 0.22, a: 0.001 });
        Tn({ type: 'triangle', f0: 280, f1: 130, dur: 0.09, g: 0.1, a: 0.001 }); break;
      case 'metal':
        Tn({ type: 'triangle', f0: 2100, f1: 1500, dur: 0.22, g: 0.08, a: 0.001 });
        N({ type: 'bandpass', f0: 3200, q: 1.2, dur: 0.05, g: 0.2, a: 0.001 });
        Tn({ type: 'sine', f0: 190, f1: 120, dur: 0.1, g: 0.14, a: 0.001 }); break;
      case 'keys':
        for (let i = 0; i < 5; i += 1) N({ t: i * 0.035 + Math.random() * 0.02, type: 'bandpass', f0: rnd(1800, 3200), q: 1.6, dur: 0.03, g: 0.16, a: 0.001 });
        break;
      case 'zap': // замыкание: треск и «жужжание»
        Tn({ type: 'sawtooth', f0: 120, f1: 55, dur: 0.32, g: 0.07, a: 0.002, lp: 900 });
        N({ type: 'bandpass', f0: 5200, q: 0.8, dur: 0.26, g: 0.14, a: 0.002 });
        N({ t: 0.05, type: 'highpass', f0: 6500, q: 0.7, dur: 0.08, g: 0.16, a: 0.001 }); break;
      case 'thud':
        N({ type: 'lowpass', f0: 520, f1: 100, q: 0.8, dur: 0.16, g: 0.32, a: 0.001 });
        Tn({ type: 'sine', f0: 95, f1: 48, dur: 0.18, g: 0.32, a: 0.001 }); break;
      case 'clack':
        N({ type: 'bandpass', f0: 2300, q: 1.5, dur: 0.04, g: 0.2, a: 0.001 });
        Tn({ type: 'triangle', f0: 400, f1: 220, dur: 0.05, g: 0.06, a: 0.001 }); break;
      case 'fizz':
        N({ type: 'highpass', f0: 4500, q: 0.7, dur: 1.2, g: 0.035, a: 0.08 }); life = 1.4; break;
      default: break;
    }
    if (v) v.free(life);
  }

  // ------------------------------------------------------------------ частицы: осколки, дым, вспышки (свои пулы)
  function colsNear(r, x, z, R) { return r.colliders.filter((c) => !c.off && c.x1 > x - R && c.x0 < x + R && c.z1 > z - R && c.z0 < z + R); }
  function chip(r, x, y, z, vx, vy, vz, sx, sy, sz, col, life, glass, cols) {
    const S = st(r), T = THREE;
    let d = null;
    for (const q of S.deb) if (q.life <= 0) { d = q; break; }
    if (!d) {
      if (S.deb.length >= 90) return;
      d = { m: new T.Mesh(S.geo.box, S.mats.d0 || (S.mats.d0 = mat(S, COL.beige))), v: new T.Vector3(), w: new T.Vector3(), life: 0, rad: 0.02, rest: false };
      r.scene.add(d.m); S.deb.push(d);
    }
    d.m.material = mat(S, col, glass); d.m.visible = true; d.m.position.set(x, y, z); d.m.scale.set(sx, sy, sz);
    d.m.rotation.set(rnd(0, TAU), rnd(0, TAU), rnd(0, TAU));
    d.v.set(vx, vy, vz); d.w.set(rnd(-14, 14), rnd(-14, 14), rnd(-14, 14)); d.life = life; d.rad = Math.max(0.006, Math.min(sx, sy, sz) * 0.5 + 0.004); d.rest = false; d.glass = !!glass; d.cols = cols || colsNear(r, x, z, 6);
  }
  function burst(r, x, y, z, n, o) { // осколки от точки: o = {dir:[x,y,z] (основное направление), sp:[min,max] скорость, size:[min,max], col:[...], glass, life, spread}
    const cols = colsNear(r, x, z, 6), dir = o.dir || [0, 1, 0], sp = o.sp || [1, 4], sz = o.size || [0.01, 0.04], spread = o.spread === undefined ? 1.4 : o.spread;
    for (let i = 0; i < n; i += 1) {
      const s = rnd(sp[0], sp[1]), cc = Array.isArray(o.col) ? pick(o.col) : o.col;
      const sc = rnd(sz[0], sz[1]), flat = o.glass ? [1, rnd(0.5, 1), 0.06] : [1, rnd(0.3, 1), rnd(0.2, 0.9)];
      chip(r, x + rnd(-0.03, 0.03), y + rnd(-0.03, 0.03), z + rnd(-0.03, 0.03), dir[0] * s + rnd(-spread, spread), dir[1] * s + rnd(0, spread), dir[2] * s + rnd(-spread, spread), sc * flat[0], sc * flat[1], sc * flat[2], cc, o.life || rnd(3, 6), !!o.glass, cols);
    }
  }
  function sprite(r, pool, add, x, y, z, vx, vy, vz, s0, s1, life, op, col, max) {
    const S = st(r), T = THREE;
    let q = null;
    for (const s of pool) if (!s.u.on) { q = s; break; }
    if (!q) {
      if (pool.length >= max) return;
      q = new T.Sprite(new T.SpriteMaterial({ map: puffTex(), transparent: true, depthWrite: false, fog: false, blending: add ? T.AdditiveBlending : T.NormalBlending }));
      q.u = { on: false, v: new T.Vector3() }; q.visible = false; r.scene.add(q); pool.push(q);
    }
    const u = q.u; u.on = true; u.age = 0; u.life = life; u.v.set(vx, vy, vz); u.s0 = s0; u.s1 = s1; u.op = op; u.add = add;
    q.position.set(x, y, z); q.material.color.setHex(col); q.material.opacity = 0; q.scale.set(s0, s0, 1); q.visible = true;
  }
  const smoke = (r, x, y, z, s0, s1, life, op, col) => sprite(r, st(r).smoke, false, x, y, z, rnd(-0.12, 0.12), rnd(0.25, 0.6), rnd(-0.12, 0.12), s0, s1, life, op, col || 0x3a3a3a, 40);
  const glow = (r, x, y, z, s, life, col, op) => sprite(r, st(r).glow, true, x, y, z, 0, 0, 0, s * 0.5, s, life, op || 1, col, 10);

  // ------------------------------------------------------------------ декали: трещины, дырки, повреждения клавиатуры
  function crackPlane(p) {
    if (p.cr) return p.cr;
    const T = THREE, cv = document.createElement('canvas'); cv.width = 256; cv.height = 203;
    const tex = new T.CanvasTexture(cv); tex.generateMipmaps = false; tex.minFilter = T.LinearFilter;
    const m = new T.Mesh(new T.PlaneGeometry(0.24, 0.19), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.position.set(0, 0.2, 0.1825); p.g.add(m);
    return (p.cr = { cv, cx: cv.getContext('2d'), tex, mesh: m });
  }
  function drawCrack(p, u, v, big) {
    const c = crackPlane(p), g = c.cx, W = c.cv.width, H = c.cv.height, X = u * W, Y = (1 - v) * H, n = (big ? 9 : 6) + ((Math.random() * 5) | 0);
    g.save();
    const hz = g.createRadialGradient(X, Y, 1, X, Y, big ? 48 : 30); hz.addColorStop(0, 'rgba(235,245,250,0.32)'); hz.addColorStop(1, 'rgba(235,245,250,0)');
    g.fillStyle = hz; g.beginPath(); g.arc(X, Y, big ? 48 : 30, 0, TAU); g.fill();
    g.fillStyle = 'rgba(6,6,6,0.92)'; g.beginPath(); g.arc(X, Y, rnd(2.2, 4.2) * (big ? 1.6 : 1), 0, TAU); g.fill();
    for (let i = 0; i < n; i += 1) {
      let a = (i / n) * TAU + rnd(-0.3, 0.3), x = X, y = Y, len = rnd(18, big ? 120 : 80);
      const segs = 3 + ((Math.random() * 3) | 0), pts = [[x, y]];
      for (let s = 0; s < segs; s += 1) { a += rnd(-0.32, 0.32); x += Math.cos(a) * len / segs; y += Math.sin(a) * len / segs; pts.push([x, y]); }
      [[1, 0.9, 'rgba(0,0,0,0.5)', 1.6], [0, 0, 'rgba(232,244,250,0.9)', 1]].forEach((pass) => {
        g.strokeStyle = pass[2]; g.lineWidth = pass[3]; g.beginPath();
        pts.forEach((q, k) => { if (k === 0) g.moveTo(q[0] + pass[0], q[1] + pass[1]); else g.lineTo(q[0] + pass[0], q[1] + pass[1]); }); g.stroke();
      });
    }
    for (let k = 1; k <= 2; k += 1) { // паутина: дуги между лучами
      g.strokeStyle = 'rgba(225,238,245,0.55)'; g.lineWidth = 0.8;
      const rr = k * (big ? 17 : 11) + rnd(-2, 2), a0 = rnd(0, TAU);
      g.beginPath(); g.arc(X, Y, rr, a0, a0 + rnd(2, 4.2)); g.stroke();
    }
    g.restore(); c.tex.needsUpdate = true;
  }
  function deadLines(p, n) { // мёртвые пиксели и тёмные полосы
    const c = crackPlane(p), g = c.cx;
    for (let i = 0; i < n; i += 1) { g.fillStyle = 'rgba(0,0,0,' + rnd(0.45, 0.85).toFixed(2) + ')'; if (Math.random() < 0.6) g.fillRect(rnd(0, c.cv.width), 0, rnd(1, 4), c.cv.height); else g.fillRect(0, rnd(0, c.cv.height), c.cv.width, rnd(1, 5)); }
    c.tex.needsUpdate = true;
  }
  function deadGlass(p) { // чёрный экран с воронкой, копотью и торчащими осколками; закрывает всю лицевую грань
    const T = THREE, W = 360, H = 355, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), sx0 = 60, sy0 = 90, sw = 240, sh = 190, cx = sx0 + sw * rnd(0.35, 0.65), cy = sy0 + sh * rnd(0.35, 0.65);
    const gl = g.createLinearGradient(sx0, sy0, sx0 + sw, sy0 + sh); gl.addColorStop(0, '#12171a'); gl.addColorStop(0.5, '#05070808'); gl.addColorStop(1, '#101517');
    g.fillStyle = '#080a0b'; g.fillRect(sx0, sy0, sw, sh);
    g.fillStyle = 'rgba(120,150,165,0.10)'; g.beginPath(); g.moveTo(sx0 + 14, sy0 + 6); g.lineTo(sx0 + 90, sy0 + 6); g.lineTo(sx0 + 40, sy0 + sh - 6); g.lineTo(sx0 + 8, sy0 + sh - 6); g.fill();
    if (p.cr) g.drawImage(p.cr.cv, sx0, sy0, sw, sh);
    const sg = g.createRadialGradient(cx, cy, 10, cx, cy, 190); sg.addColorStop(0, 'rgba(0,0,0,0.9)'); sg.addColorStop(0.5, 'rgba(10,8,6,0.55)'); sg.addColorStop(1, 'rgba(10,8,6,0)');
    g.fillStyle = sg; g.fillRect(0, 0, W, H);
    const up = g.createLinearGradient(0, cy, 0, 0); up.addColorStop(0, 'rgba(8,6,5,0.55)'); up.addColorStop(1, 'rgba(8,6,5,0)'); // копоть вверх по рамке
    g.fillStyle = up; g.fillRect(cx - 80, 0, 160, cy);
    const R0 = rnd(26, 40), nv = 14, pts = [];
    for (let i = 0; i < nv; i += 1) { const a = (i / nv) * TAU, rr = R0 * rnd(0.55, 1.25); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85, a]); }
    g.fillStyle = '#010101'; g.beginPath(); pts.forEach((q, i) => { if (i === 0) g.moveTo(q[0], q[1]); else g.lineTo(q[0], q[1]); }); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,120,40,0.35)'; g.lineWidth = 2; g.stroke();
    pts.forEach((q) => { // торчащие осколки по краю воронки
      if (Math.random() < 0.45) return;
      const a = q[2], l = rnd(8, 22); g.fillStyle = 'rgba(225,238,245,0.55)'; g.beginPath(); g.moveTo(q[0] - Math.sin(a) * 3, q[1] + Math.cos(a) * 3); g.lineTo(q[0] + Math.sin(a) * 3, q[1] - Math.cos(a) * 3); g.lineTo(q[0] - Math.cos(a) * l, q[1] - Math.sin(a) * l); g.fill();
    });
    for (let i = 0; i < 16; i += 1) { // лучевые трещины от воронки
      let a = rnd(0, TAU), x = cx + Math.cos(a) * R0, y = cy + Math.sin(a) * R0 * 0.85; g.strokeStyle = 'rgba(230,242,248,0.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 4; s += 1) { a += rnd(-0.35, 0.35); x += Math.cos(a) * rnd(12, 28); y += Math.sin(a) * rnd(12, 28); g.lineTo(Math.max(sx0, Math.min(sx0 + sw, x)), Math.max(sy0, Math.min(sy0 + sh, y))); }
      g.stroke();
    }
    const tex = new T.CanvasTexture(cv); tex.generateMipmaps = false; tex.minFilter = T.LinearFilter;
    const m = new T.Mesh(new T.PlaneGeometry(0.36, 0.355), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.position.set(0, 0.2075, 0.1795); p.g.add(m); p.dg = m;
  }
  function holeDecal(S, p, h, n) { // пулевое отверстие: тёмный диск с светлым ободом (в системе корпуса)
    if (p.holes.length >= 12) return;
    const T = THREE, q = new T.Group(), sz = rnd(0.007, 0.012);
    const d = new T.Mesh(S.geo.circ, S.mats.hole || (S.mats.hole = new T.MeshBasicMaterial({ color: 0x040404, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
    const rg = new T.Mesh(S.geo.ring, S.mats.rim || (S.mats.rim = new T.MeshBasicMaterial({ color: 0x8c8a80, transparent: true, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: T.DoubleSide })));
    rg.scale.setScalar(1.7); q.add(d, rg); q.scale.setScalar(sz);
    const nl = new T.Vector3(h.ax === 0 ? h.sg : 0, h.ax === 1 ? h.sg : 0, h.ax === 2 ? h.sg : 0);
    q.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), nl);
    q.position.set(h.lx + p.sp.c[0] + nl.x * 0.0012, h.ly + p.sp.c[1] + nl.y * 0.0012, h.lz + p.sp.c[2] + nl.z * 0.0012);
    p.g.add(q); p.holes.push(q);
  }
  function kbPlane(p) {
    if (p.kd) return p.kd;
    const T = THREE, cv = document.createElement('canvas'); cv.width = 256; cv.height = 88;
    const tex = new T.CanvasTexture(cv); tex.generateMipmaps = false; tex.minFilter = T.LinearFilter;
    const m = new T.Mesh(new T.PlaneGeometry(0.44, 0.15), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.rotation.x = -PI / 2; m.position.y = 0.0104; p.board.add(m);
    return (p.kd = { cv, cx: cv.getContext('2d'), tex, mesh: m });
  }
  function kbDamage(p, u, v, r0) { // выбитые клавиши: рваная чёрная дыра по месту попадания
    const c = kbPlane(p), g = c.cx, X = u * c.cv.width, Y = v * c.cv.height, n = 9, R = r0 || rnd(9, 15);
    g.fillStyle = '#060606'; g.beginPath();
    for (let i = 0; i < n; i += 1) { const a = (i / n) * TAU, rr = R * rnd(0.6, 1.2); const x = X + Math.cos(a) * rr * 1.3, y = Y + Math.sin(a) * rr; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.closePath(); g.fill(); g.strokeStyle = 'rgba(210,205,190,0.45)'; g.lineWidth = 1; g.stroke();
    c.tex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ урон и стадии
  function hurt(r, p, amt, how, c) {
    if (amt <= 0) return;
    const S = st(r), was = p.hp;
    hitFx(r, S, p, how, c, amt);
    if (p.hp <= 0) return;
    p.hp = Math.max(0, p.hp - amt);
    const f = p.hp / p.hp0, stg = p.hp <= 0 ? 3 : f <= 0.33 ? 2 : f <= 0.66 ? 1 : 0;
    if (was > 0 && stg > p.stage) { p.stage = stg; stageUp(r, S, p, stg, how, c); }
  }
  function dmgLevel(p) { // 0..1 для шейдера камеры: сбой картинки растёт со стадией
    return p.dead ? 1 : p.stage === 0 ? Math.max(0, 1 - p.hp / p.hp0) * 0.25 : p.stage === 1 ? 0.45 : 0.9;
  }
  function applyScreen(S, set) {
    const W = set.W; if (!W || !W.mat || !W.mat.uniforms.uDmg) return;
    W.mat.uniforms.uDmg.value = set.mon ? dmgLevel(set.mon) : 0;
  }
  function hitFx(r, S, p, how, c, amt) {
    const pt = c && c.pt; if (!pt) return;
    const n = c.n || S.tmp.d.set(0, 1, 0), quiet = how === 'bullet' && S.t - p.lastFx < 0.05;
    p.lastFx = S.t;
    if (how === 'bullet' || how === 'melee') {
      // колебание корпуса
      if (p.kind === 'monitor' || p.kind === 'tower') { p.wob.v += (how === 'melee' ? 2.2 : amt * 0.02) * (Math.random() < 0.5 ? -1 : 1); p.wob.dir = rnd(0, TAU); }
    }
    if (p.kind === 'monitor') {
      if (c.front && !p.dead) {
        const u = c.u === undefined ? 0.5 : c.u, v = c.v === undefined ? 0.5 : c.v;
        drawCrack(p, u, v, how === 'melee' || amt > 40);
        if (!quiet) { sfx(r, 'glass', pt.x, pt.y, pt.z, 1); burst(r, pt.x, pt.y, pt.z, how === 'melee' ? 7 : 3, { dir: [n.x, n.y, n.z], sp: [0.6, 2.2], size: [0.008, 0.026], col: 0xb7d2dc, glass: true, life: rnd(3, 5) }); }
      } else if (!quiet) {
        sfx(r, 'plastic', pt.x, pt.y, pt.z, 1);
        burst(r, pt.x, pt.y, pt.z, 3, { dir: [n.x, n.y, n.z], sp: [0.8, 2.6], size: [0.008, 0.02], col: [COL.beige, COL.dark], life: rnd(3, 5) });
      }
      if (c.h && !(c.front && !p.dead) && how === 'bullet') holeDecal(S, p, c.h, n);
    } else if (p.kind === 'tower') {
      if (!quiet) { sfx(r, 'metal', pt.x, pt.y, pt.z, 1); burst(r, pt.x, pt.y, pt.z, 2, { dir: [n.x, n.y, n.z], sp: [0.8, 2.4], size: [0.006, 0.014], col: [COL.metal, COL.beige], life: rnd(2, 4) }); }
      if (c.h && how === 'bullet') holeDecal(S, p, c.h, n);
    } else if (p.kind === 'keyboard') {
      if (!quiet) sfx(r, 'keys', pt.x, pt.y, pt.z, 1);
      const nk = how === 'melee' ? 6 : 3 + (amt > 20 ? 1 : 0);
      burst(r, pt.x, pt.y + 0.01, pt.z, nk, { dir: [n.x * 0.5, 1, n.z * 0.5], sp: [1.2, 3.2], size: [0.012, 0.018], col: [COL.dark, COL.ivory, COL.grey], life: rnd(3, 6), spread: 1.1 });
      if (c.h && c.h.ax === 1 && c.h.sg > 0) kbDamage(p, (c.h.lx + 0.22) / 0.44, (c.h.lz + 0.075) / 0.15, how === 'melee' ? 20 : undefined);
    } else if (p.kind === 'mouse') {
      if (!quiet) sfx(r, 'plastic', pt.x, pt.y, pt.z, 0.9);
      burst(r, pt.x, pt.y, pt.z, 3, { dir: [n.x, n.y, n.z], sp: [1, 2.8], size: [0.007, 0.016], col: [COL.beige, COL.dark], life: rnd(3, 5) });
    }
  }
  function stageUp(r, S, p, stg, how, c) {
    const set = p.set;
    if (stg === 3) { kill(r, S, p, how, c); applyScreen(S, set); return; }
    if (p.kind === 'monitor') {
      if (stg >= 1) { p.smk = 0.4; p.smkT = 40; }
      if (stg >= 2) { p.smk = 1; deadLines(p, 3); }
      else deadLines(p, 1);
    } else if (p.kind === 'tower') {
      p.smk = stg >= 2 ? 1 : 0.4; p.smkT = 45;
    }
    applyScreen(S, set);
  }
  function powerOff(r, p) { // компьютер мёртв: камера не рисует, рабочий стол недоступен
    const W = p.W, set = p.set; if (!W || W.dead) return;
    W.dead = true; if (set) set.room.pcDead = true;
    if (W.mat) W.mat.uniforms.uOn.value = 0;
    if (W.led) W.led.visible = false;
    if (r.pcd && r.pcd.W === W && r.hackAbort) { try { r.hackAbort(false); } catch (e) { /* ignore */ } }
  }
  function kill(r, S, p, how, c) {
    const pos = p.wc, k = p.kind;
    if (k === 'monitor') {
      const W = p.W, f = fwdOf(S, p), fx = f.x, fy = f.y, fz = f.z, sc = world(S, p, 0, 0.005, 0.19);
      const sx = sc.x, sy = sc.y, sz = sc.z;
      powerOff(r, p);
      p.dead = true;
      if (p.scr) p.scr.visible = false;
      if (p.cr) p.cr.mesh.visible = false;
      deadGlass(p);
      glow(r, sx, sy, sz, 0.55, 0.16, 0xcfe6ff, 1);
      glow(r, sx + fx * 0.05, sy, sz + fz * 0.05, 0.4, 0.4, 0xff8a30, 0.9);
      burst(r, sx + fx * 0.03, sy, sz + fz * 0.03, 20, { dir: [fx, fy + 0.15, fz], sp: [1.5, 5], size: [0.012, 0.05], col: 0xb7d2dc, glass: true, life: rnd(4, 7), spread: 1.8 });
      burst(r, sx, sy, sz, 7, { dir: [fx, fy, fz], sp: [0.8, 3], size: [0.012, 0.035], col: [COL.beige, COL.dark], life: rnd(4, 7) });
      r.sparks(sx, sy, sz, fx, fy, fz, 14);
      smoke(r, sx, sy, sz, 0.15, 0.7, 2.6, 0.55, 0x2a2a2a); smoke(r, sx, sy + 0.1, sz, 0.12, 0.6, 2.2, 0.45, 0x333333);
      sfx(r, 'implode', sx, sy, sz, 1);
      r.noise && r.noise(14);
      p.smk = 1; p.smkT = 60;
      const pp = r.p; if (hyp(pp.x - sx, pp.z - sz) < 2.6 && r.flash) r.flash(0.12);
    } else if (k === 'tower') {
      const set = p.set; powerOff(r, p);
      if (set && set.mon && set.mon.scr && !set.mon.dead) set.mon.scr.material = S.dead;
      p.dead = true;
      const top = world(S, p, 0, p.hy, 0), cx = top.x, cy = top.y, cz = top.z;
      glow(r, cx, cy - 0.1, cz, 0.45, 0.35, 0xff8a30, 0.8);
      r.sparks(cx, cy - 0.05, cz, 0, 1, 0, 14);
      for (let i = 0; i < 2; i += 1) { // отлетают крышки
        const sd = i ? 1 : -1, v = S.tmp.b.set(sd, 0.2, rnd(-0.3, 0.3)).applyQuaternion(p.wq), q = S.tmp.a.copy(pos);
        chip(r, q.x, q.y, q.z, v.x * rnd(2, 4), rnd(1.5, 3), v.z * rnd(2, 4), 0.004, 0.2, 0.3, COL.metal, rnd(5, 8), false);
      }
      burst(r, cx, cy - 0.1, cz, 8, { dir: [0, 1, 0], sp: [1, 3.5], size: [0.01, 0.03], col: [COL.metal, COL.beige, COL.dark], life: rnd(4, 7), spread: 1.4 });
      smoke(r, cx, cy, cz, 0.15, 0.8, 3, 0.6, 0x2a2a2a); smoke(r, cx, cy - 0.1, cz, 0.12, 0.7, 2.4, 0.5, 0x353535);
      sfx(r, 'zap', cx, cy, cz, 1); setTimeout(() => { if (!r.disposed) sfx(r, 'metal', cx, cy, cz, 1.3); }, 120);
      r.noise && r.noise(10);
      p.smk = 1; p.smkT = 60;
    } else if (k === 'keyboard') {
      const t = world(S, p, 0, 0.02, 0), tx = t.x, ty = t.y, tz = t.z;
      burst(r, tx, ty, tz, 20, { dir: [0, 1, 0], sp: [1.2, 3.6], size: [0.012, 0.019], col: [COL.dark, COL.ivory, COL.grey], life: rnd(4, 7), spread: 1.6 });
      kbDamage(p, rnd(0.2, 0.8), rnd(0.2, 0.8), 28);
      sfx(r, 'keys', tx, ty, tz, 1.2); r.noise && r.noise(7);
      p.dead = true;
      if (how !== 'bullet') shove(r, p, c, how);
    } else if (k === 'mouse') {
      const t = world(S, p, 0, 0.02, 0), tx = t.x, ty = t.y, tz = t.z;
      burst(r, tx, ty, tz, 8, { dir: [0, 1, 0], sp: [1, 3], size: [0.008, 0.02], col: [COL.beige, COL.dark], life: rnd(3, 6), spread: 1.4 });
      sfx(r, 'plastic', tx, ty, tz, 1.1);
      p.dead = true;
      if (how === 'bullet') p.items.forEach((o) => { o.visible = false; }); else shove(r, p, c, how);
    }
  }

  // ------------------------------------------------------------------ физика
  // OBB детали поднимается на «шарнир» в центре; отскоки от пола, стола и стен (шар по горизонтали + опора по высоте), оседание на грань
  function lift(r, S, p) {
    if (p.pv) return p.pv;
    const T = THREE, pv = new T.Group();
    pv.position.copy(p.wc); pv.quaternion.copy(p.wq); r.scene.add(pv); pv.updateMatrixWorld(true);
    p.items.forEach((o) => { if (o) pv.attach(o); });
    p.pv = pv;
    if (p.kind === 'monitor' || p.kind === 'tower') { p.g.rotation.x = 0; p.g.rotation.z = 0; }
    if ((p.kind === 'monitor' || p.kind === 'tower') && !p.dead) powerOff(r, p);
    if (p.kind === 'monitor' && p.scr && !p.dead) p.scr.material = S.dead;
    return pv;
  }
  function fling(r, S, p, v, w) {
    lift(r, S, p);
    const T = THREE;
    p.b = p.b || { v: new T.Vector3(), w: new T.Vector3(), calm: 0 };
    p.b.v.copy(v); p.b.w.copy(w); p.b.calm = 0; p.b.cols = colsNear(r, p.wc.x, p.wc.z, 14); p.b.snd = 0; p.state = 'fly';
  }
  function shove(r, S0, p, how, c) { // (r, p, c, how) — вызов из kill; ниже настоящая сигнатура
  }
  function throwPart(r, p, dx, dz, spd, up, spin) {
    const S = st(r), T = THREE, l = hyp(dx, dz) || 1, m = clamp(2 / Math.sqrt(p.sp.m), 0.45, 2.2);
    const v = S.tmp.o.set(dx / l * spd * m, up, dz / l * spd * m), w = S.tmp.d.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(spin * m);
    fling(r, S, p, v, w);
  }
  function groundAt(cols, x, z, low) {
    let g = 0;
    for (const c of cols) {
      if (c.off || c.fill || c.door || c.y1 === undefined || c.y1 > low + 0.25) continue;
      if (x < c.x0 - 0.02 || x > c.x1 + 0.02 || z < c.z0 - 0.02 || z > c.z1 + 0.02) continue;
      if (c.y1 > g) g = c.y1;
    }
    return g;
  }
  // шар радиуса rs против вертикальных коробок: выталкивание и отражение скорости; возвращает скорость удара о препятствие
  function wallPush(cols, P, v, rs, low, hi, e) {
    let imp = 0;
    for (const c of cols) {
      if (c.off || c.y1 === undefined) continue;
      if (c.y1 <= low + 0.12 || (c.y0 || 0) >= hi - 0.02) continue;
      const qx = clamp(P.x, c.x0, c.x1), qz = clamp(P.z, c.z0, c.z1), dx = P.x - qx, dz = P.z - qz, d = hyp(dx, dz);
      if (d >= rs) continue;
      let nx, nz, pen;
      if (d > 1e-5) { nx = dx / d; nz = dz / d; pen = rs - d; }
      else { const a = [P.x - c.x0, c.x1 - P.x, P.z - c.z0, c.z1 - P.z], m = Math.min(a[0], a[1], a[2], a[3]); nx = m === a[0] ? -1 : m === a[1] ? 1 : 0; nz = m === a[2] ? -1 : m === a[3] ? 1 : 0; pen = m + rs; }
      P.x += nx * pen; P.z += nz * pen;
      const vn = v.x * nx + v.z * nz;
      if (vn < 0) { v.x -= (1 + e) * vn * nx; v.z -= (1 + e) * vn * nz; imp = Math.max(imp, -vn); }
    }
    return imp;
  }
  function stepBody(r, S, p, dt) {
    const b = p.b, pv = p.pv, T = S.tmp, rs = p.sp.rs;
    const n = Math.min(5, Math.max(1, Math.ceil(b.v.length() * dt / 0.1))), h = dt / n;
    let grounded = false, imp = 0, fall = 0;
    for (let i = 0; i < n; i += 1) {
      b.v.y -= 9.81 * h;
      pv.position.addScaledVector(b.v, h);
      const w = b.w.length();
      if (w > 1e-4) { T.dq.setFromAxisAngle(T.a.copy(b.w).divideScalar(w), w * h); pv.quaternion.premultiply(T.dq).normalize(); }
      T.m.makeRotationFromQuaternion(pv.quaternion);
      const te = T.m.elements, ey = Math.abs(te[1]) * p.hx + Math.abs(te[5]) * p.hy + Math.abs(te[9]) * p.hz;
      const P_ = pv.position, low = P_.y - ey;
      imp = Math.max(imp, wallPush(b.cols, P_, b.v, rs, low, P_.y + ey, 0.32));
      const g = groundAt(b.cols, P_.x, P_.z, low), lo2 = P_.y - ey;
      if (lo2 < g) {
        P_.y += g - lo2;
        if (b.v.y < 0) {
          fall = Math.max(fall, -b.v.y);
          b.v.y = -b.v.y < 0.9 ? 0 : -b.v.y * 0.34;
          const fr = Math.exp(-7 * h); b.v.x *= fr; b.v.z *= fr; b.w.multiplyScalar(Math.exp(-4 * h));
          if (fall > 0.8) { b.w.x += rnd(-1.5, 1.5) * fall * 0.3; b.w.z += rnd(-1.5, 1.5) * fall * 0.3; }
        } else { const fr = Math.exp(-5 * h); b.v.x *= fr; b.v.z *= fr; b.w.multiplyScalar(Math.exp(-3 * h)); }
        grounded = true;
      }
      if (grounded && b.v.length() < 2.4) { // оседание: ближайшая к текущей ориентации «плоская» (кратная 90°)
        T.e.setFromQuaternion(pv.quaternion, 'YXZ'); T.e.x = Math.round(T.e.x / (PI / 2)) * PI / 2; T.e.z = Math.round(T.e.z / (PI / 2)) * PI / 2;
        T.q2.setFromEuler(T.e); pv.quaternion.slerp(T.q2, 1 - Math.exp(-9 * h));
      }
    }
    const bn = r.bounds;
    if (bn) { // не вылетать за границы мира
      const P_ = pv.position, x0 = bn.cx - bn.w / 2 + 0.2, x1 = bn.cx + bn.w / 2 - 0.2, z0 = bn.cz - bn.d / 2 + 0.2, z1 = bn.cz + bn.d / 2 - 0.2;
      if (P_.x < x0) { P_.x = x0; b.v.x = Math.abs(b.v.x) * 0.3; } if (P_.x > x1) { P_.x = x1; b.v.x = -Math.abs(b.v.x) * 0.3; }
      if (P_.z < z0) { P_.z = z0; b.v.z = Math.abs(b.v.z) * 0.3; } if (P_.z > z1) { P_.z = z1; b.v.z = -Math.abs(b.v.z) * 0.3; }
    }
    p.wc.copy(pv.position); p.wq.copy(pv.quaternion);
    // звук и урон от ударов
    b.snd -= dt;
    const hard = Math.max(fall, imp);
    if (hard > 1.1 && b.snd <= 0) { b.snd = 0.14; sfx(r, p.sp.m > 3 ? 'thud' : 'clack', p.wc.x, p.wc.y, p.wc.z, clamp(hard / 5, 0.3, 1.2)); if (hard > 3) r.noise && r.noise(6); }
    if (hard > 2.4 && p.hp > 0) hurt(r, p, (hard - 2.2) * 22, 'fall', { pt: p.wc.clone(), n: new THREE.Vector3(0, 1, 0) });
    // покой
    if (grounded && b.v.length() < 0.12 && b.w.length() < 0.5) { b.calm += dt; if (b.calm > 0.45) { p.state = 'rest'; b.v.set(0, 0, 0); b.w.set(0, 0, 0); } } else b.calm = 0;
  }

  function stepDebris(r, S, d, dt) {
    d.life -= dt;
    if (d.life <= 0) { d.m.visible = false; return; }
    if (d.life < 0.6) d.m.scale.multiplyScalar(Math.max(0, 1 - dt * 3));
    if (d.rest) return;
    const m = d.m, P_ = m.position;
    d.v.y -= 9.81 * dt; P_.addScaledVector(d.v, dt);
    m.rotation.x += d.w.x * dt; m.rotation.y += d.w.y * dt; m.rotation.z += d.w.z * dt;
    if (P_.y < 1.1) {
      const g = groundAt(d.cols, P_.x, P_.z, P_.y - d.rad);
      if (P_.y - d.rad < g) {
        P_.y = g + d.rad;
        if (d.v.y < -0.7) { d.v.y = -d.v.y * 0.3; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.55); } else { d.v.set(0, 0, 0); d.rest = true; m.rotation.x = 0; m.rotation.z = 0; if (d.glass) m.scale.y *= 0.4; }
      }
    }
    if (d.v.x * d.v.x + d.v.z * d.v.z > 0.04) wallPush(d.cols, P_, d.v, d.rad + 0.01, P_.y - d.rad, P_.y + d.rad, 0.35);
  }

  // ------------------------------------------------------------------ покадровое обновление
  function tick(r, S, dt) {
    S.t += dt;
    const pp = r.p;
    for (const p of S.parts) {
      if (p.state === 'fly') stepBody(r, S, p, dt);
      else if (p.wob.a !== 0 || p.wob.v !== 0) { // пружинное покачивание корпуса
        const w = p.wob; w.v += (-120 * w.a - 6 * w.v) * dt; w.a += w.v * dt;
        if (Math.abs(w.a) < 0.0005 && Math.abs(w.v) < 0.01) { w.a = 0; w.v = 0; }
        if (!p.pv) { p.g.rotation.x = w.a * Math.cos(w.dir); p.g.rotation.z = w.a * Math.sin(w.dir); }
      }
      const near = hyp(p.wc.x - pp.x, p.wc.z - pp.z) < 14;
      if (p.smkT > 0) {
        p.smkT -= dt;
        if (near && p.smk > 0) {
          p.zap -= dt;
          // дым
          p.smkAcc = (p.smkAcc || 0) - dt * p.smk * Math.min(1, p.smkT / 30);
          if (p.smkAcc <= 0) {
            p.smkAcc = rnd(0.35, 0.7);
            const t = world(S, p, p.kind === 'monitor' ? rnd(-0.05, 0.05) : 0, p.hy * 1.02, p.kind === 'monitor' ? -0.08 : 0);
            smoke(r, t.x, t.y, t.z, 0.08, rnd(0.35, 0.6), rnd(2.4, 3.6), 0.3, 0x3a3a3a);
          }
          // искры замыкания
          if (p.zap <= 0 && p.stage >= 2 && p.smkT > 6) {
            p.zap = rnd(1.4, 4);
            const t = world(S, p, rnd(-0.08, 0.08), rnd(-0.05, 0.1), p.kind === 'monitor' ? 0.19 : rnd(-0.1, 0.1));
            r.sparks(t.x, t.y, t.z, 0, 1, 0, 4); sfx(r, 'zap', t.x, t.y, t.z, 0.5);
            if (p.kind === 'monitor' && !p.dead) glow(r, t.x, t.y, t.z, 0.25, 0.1, 0xcfe6ff, 0.8);
          }
        }
      }
      if (p.set && p.kind === 'monitor' && p.stage >= 1 && !p.dead) { // экран мигает
        const W = p.W; if (W && W.mat && W.mat.uniforms.uDmg) W.mat.uniforms.uDmg.value = dmgLevel(p) * (0.55 + 0.45 * Math.sin(S.t * 31 + Math.sin(S.t * 5) * 7));
      }
    }
    for (const d of S.deb) if (d.life > 0) stepDebris(r, S, d, dt);
    const cam = r.camera, ceil = r.bounds ? r.bounds.h - 0.05 : 3.4;
    for (const pool of [S.smoke, S.glow]) {
      for (const q of pool) {
        const u = q.u; if (!u.on) continue;
        u.age += dt; const k = u.age / u.life;
        if (k >= 1) { u.on = false; q.visible = false; continue; }
        q.position.addScaledVector(u.v, dt); u.v.multiplyScalar(Math.exp(-1.1 * dt));
        if (q.position.y > ceil) q.position.y = ceil;
        const s = u.s0 + (u.s1 - u.s0) * (1 - (1 - k) * (1 - k));
        q.scale.set(s, s, 1);
        q.material.opacity = u.op * (u.add ? (1 - k) : Math.pow(1 - k, 1.4)) * Math.min(1, u.age / (u.add ? 0.02 : 0.15));
      }
    }
  }

  // ------------------------------------------------------------------ точки входа
  // пуля: h — запись из castRay ({t, hit:{p,ax,sg,lx,ly,lz}, n}), o — позиция камеры
  PB.bullet = function (r, hit, dmg, o, dx, dy, dz, multi) {
    const S = st(r), h = hit.hit, p = h.p, n = hit.n;
    const pt = new THREE.Vector3(o.x + dx * hit.t, o.y + dy * hit.t, o.z + dz * hit.t);
    let m = 1, front = false, u, v;
    if (p.kind === 'monitor') {
      const gy = h.ly + p.sp.c[1];
      front = h.ax === 2 && h.sg > 0 && Math.abs(h.lx) < 0.125 && gy > 0.1 && gy < 0.3 && !p.dead;
      m = front ? 2.4 : 0.55;
      if (front) { u = (h.lx + 0.12) / 0.24; v = (gy - 0.105) / 0.19; }
    } else if (p.kind === 'tower') m = 0.7;
    else if (p.kind === 'keyboard') m = 1.6; else m = 3;
    r.sparks(pt.x, pt.y, pt.z, n.x, n.y, n.z, multi ? 2 : 4);
    if (!multi) r.noise && r.noise(2);
    hurt(r, p, dmg * m * (multi ? 1.0 : 1), 'bullet', { pt, n, front, u, v, h, dir: [dx, dy, dz] });
  };
  // дальний бой: кулак / ступня / плечо. d — запись из ATK (pmove.js), mul — множитель удара, fx/fz — направление взгляда по горизонтали
  PB.melee = function (r, d, mul, fx, fz) {
    const S = r.pcb; if (!S || !S.parts.length || !r.camera) return false;
    const cam = r.camera, o = cam.position, dir = S.tmp.o;
    cam.getWorldDirection(dir);
    const hl = hyp(dir.x, dir.z) || 1, hx = dir.x / hl, hz = dir.z / hl, pitch = Math.asin(clamp(dir.y, -1, 1)), reach = Math.min((d.rng || 1.5) + 0.3, 2.2);
    let best = null;
    for (const dp of [0, -0.2, -0.4, 0.2]) { // кулак бьёт «вперёд-вниз» — стол ниже уровня глаз
      const a = pitch + dp, cy = Math.cos(a), h = nearestHit(r, o.x, o.y, o.z, hx * cy, Math.sin(a), hz * cy, reach);
      if (h && (!best || h.t < best.t)) best = h;
      if (best) break;
    }
    if (!best) return false;
    const p = best.p, mm = p.kind === 'monitor' ? 1.3 : p.kind === 'tower' ? 0.8 : p.kind === 'keyboard' ? 2.5 : 4, dm = (d.dmg || 14) * (mul || 1);
    const pt = new THREE.Vector3(o.x + dir.x * best.t, o.y + dir.y * best.t, o.z + dir.z * best.t);
    // ближняя точка контакта лежит на самой детали
    pt.set(p.wc.x - hx * p.hx * 0.6, Math.max(p.wc.y - p.hy * 0.5, Math.min(p.wc.y + p.hy, pt.y)), p.wc.z - hz * p.hz * 0.6);
    const n = new THREE.Vector3(-hx, 0.2, -hz).normalize();
    let front = false, u, v;
    if (p.kind === 'monitor' && !p.dead) {
      const loc = new THREE.Vector3().copy(pt).sub(p.wc).applyQuaternion(S.tmp.iq.copy(p.wq).invert());
      const gy = loc.y + p.sp.c[1];
      front = loc.z > p.hz * 0.4 && Math.abs(loc.x) < 0.14 && gy > 0.09 && gy < 0.31;
      u = clamp((loc.x + 0.12) / 0.24, 0.1, 0.9); v = clamp((gy - 0.105) / 0.19, 0.1, 0.9);
    }
    const kn = d.kn || 0.5;
    const ctx = { pt, n, front, u, v, dir: [hx, 0, hz], melee: { hx, hz, kn, leg: !!d.leg, dm } };
    hurt(r, p, dm * mm, 'melee', ctx);
    r.noise && r.noise(8);
    if (p.state !== 'fly' && (p.hp <= 0 || (p.sp.m < 2 && dm >= 12))) shoveDo(r, p, ctx);
    else if (p.state !== 'fly' && p.sp.m >= 2 && dm >= 30 && p.hp <= p.hp0 * 0.5) shoveDo(r, p, ctx, 0.55);
    return true;
  };
  // удар сбрасывает деталь: ориентир — направление удара
  function shoveDo(r, p, c, k) {
    const S = st(r), m = c && c.melee ? c.melee : { hx: 0, hz: 1, kn: 1, leg: false, dm: 20 };
    const sp = (2.2 + m.kn * 1.0 + m.dm / 22) * (m.leg ? 1.35 : 1) * (k || 1);
    throwPart(r, p, m.hx + rnd(-0.15, 0.15), m.hz + rnd(-0.15, 0.15), sp, rnd(1.2, 2.4) * (k || 1), 7 + sp);
  }
  // kill() для клавиатуры/мыши вызывает сдвиг через shove(r, p, c, how) — перенаправляем
  function shoveKill(r, S, p, how, c) { if (c && c.melee) shoveDo(r, p, c); else if (how === 'blast') blastKick(r, p, c); }
  function blastKick(r, p, c) {
    const d = c && c.bl ? c.bl : null; if (!d) return;
    const dx = p.wc.x - d.x, dz = p.wc.z - d.z, f = d.f;
    throwPart(r, p, dx, dz, 3 + 10 * f, 2 + 4 * f, 6 + 10 * f);
  }
  // взрыв: урон по расстоянию и видимости, отброс всех деталей в радиусе
  PB.blast = function (r, x, y, z, R, dmg) {
    const S = r.pcb; if (!S || !S.parts.length) return;
    const oy = Math.max(y, 0.95);
    for (const p of S.parts.slice()) {
      const d = Math.sqrt((p.wc.x - x) * (p.wc.x - x) + (p.wc.z - z) * (p.wc.z - z) + (p.wc.y - oy) * (p.wc.y - oy) * 0.5);
      if (d >= R * 1.15) continue;
      const los = r.hasLOS(x, oy, z, p.wc.x, p.wc.y + 0.05, p.wc.z), fall = d < R * 0.22 ? 1.6 : Math.max(0, 1 - d / R), f = fall * (los ? 1 : 0.4);
      if (f < 0.05) continue;
      const bl = { x, z, f }, n = new THREE.Vector3(p.wc.x - x, 0.3, p.wc.z - z).normalize();
      const ctx = { pt: p.wc.clone(), n, front: p.kind === 'monitor' && !p.dead, u: rnd(0.2, 0.8), v: rnd(0.2, 0.8), bl };
      const wasDead = p.hp <= 0;
      hurt(r, p, dmg * 1.3 * f, 'blast', ctx);
      if (!wasDead && p.kind === 'monitor' && p.hp > 0 && f > 0.1) drawCrack(p, rnd(0.15, 0.85), rnd(0.15, 0.85), f > 0.4);
      if (f > (p.hp <= 0 ? 0.1 : 0.3) || (p.sp.m < 2 && f > 0.15)) blastKick(r, p, ctx);
      else { p.wob.v += f * 6; p.wob.dir = rnd(0, TAU); }
    }
  };
  // kill() ссылается на shove — подменяем настоящей реализацией
  function shoveBind() { }
  const _kill = kill;

  const explode0 = P.explode;
  P.explode = function (x, y, z, R, dmg) {
    const res = explode0.apply(this, arguments);
    if (!OFF && this.pcb) { try { PB.blast(this, x, y, z, R, dmg); } catch (e) { console.error('[pcbreak]', e); } }
    return res;
  };
  const disp0 = P.dispose;
  P.dispose = function () {
    const S = this.pcb;
    if (S) { try { S.parts.forEach((p) => { if (p.cr) p.cr.tex.dispose(); if (p.kd) p.kd.tex.dispose(); }); } catch (e) { /* ignore */ } }
    return disp0 ? disp0.apply(this, arguments) : undefined;
  };
  PB._shove = shoveKill;
}());
