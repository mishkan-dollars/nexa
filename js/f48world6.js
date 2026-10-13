// NEXA: миссия 48 — регионы 6: 'red' (красная комната флэшбэка: колонны, укрытия, потолок из плит, который обрушивается) и 'head' (кабинет HEAD:
// дуга из 50 анимированных мониторов HIGH / LOW на одной канвас-текстуре, большое кресло, стол, место для коленопреклонения).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.World || !C.f48.shell || !C.f48.Mk || !C.f48.sign) return;
  const F = C.f48, PI = Math.PI, TAU = PI * 2;
  const solid = (R, x, z, w, d, h, y0) => R.world.col(R, x, z, w, d, h, y0);
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  // ================================================================== КРАСНАЯ КОМНАТА (флэшбэк)
  const RD = { x0: -13, x1: 13, z0: -16, z1: 16, h: 6.6 };
  function buildRed(R, g) {
    const r = R.world.r, M = R.D, T = THREE;
    R.lampPos = []; R.halos = []; R.slabs = []; R.dust = [];
    const WALL = 0x5a1212, FLOOR = 0x4a0e0e, CONC = 0x6a1818, DARKR = 0x2a0606;
    F.shell(r, RD.x0, RD.x1, RD.z0, RD.z1, RD.h, WALL, {}, { floor: FLOOR, open: true });
    // потолок из 12 плит (3×4): падают по очереди
    const sw = (RD.x1 - RD.x0) / 3, sd = (RD.z1 - RD.z0) / 4;
    for (let i = 0; i < 3; i += 1) for (let j = 0; j < 4; j += 1) {
      const x = RD.x0 + sw * (i + 0.5), z = RD.z0 + sd * (j + 0.5);
      const m = r.box(x, RD.h + 0.15, z, sw - 0.04, 0.3, sd - 0.04, 0x3a0a0a, false);
      R.slabs.push({ m, x, z, y0: RD.h + 0.15, y: RD.h + 0.15, vy: 0, falling: false, done: false, spin: [0, 0, 0], rv: [0, 0, 0], delay: 0, ord: i + j * 0.6 });
    }
    // ребра жёсткости и балки под плитами (остаются при обрушении)
    for (let z = RD.z0 + 4; z < RD.z1; z += 8) M.b(RD.x1 - RD.x0, 0.4, 0.5, 0, RD.h - 0.35, z, DARKR);
    for (let x = RD.x0 + 4.3; x < RD.x1; x += 8.7) M.b(0.5, 0.4, RD.z1 - RD.z0, x, RD.h - 0.55, 0, DARKR);
    // колонны: 3 ряда по 2
    [-10, -1.5, 7].forEach((z) => [-7, 7].forEach((x) => {
      M.b(1.1, RD.h, 1.1, x, RD.h / 2, z, CONC); M.b(1.4, 0.35, 1.4, x, 0.18, z, DARKR); M.b(1.4, 0.35, 1.4, x, RD.h - 0.2, z, DARKR);
      M.b(1.12, 0.12, 1.12, x, 1.1, z, 0xa01818); M.b(1.12, 0.12, 1.12, x, 1.3, z, 0x15040a);
      solid(R, x, z, 1.1, 1.1, RD.h);
    }));
    // укрытия: бетонные блоки и ящики
    const blk = (x, z, ry, w) => { M.push(x, 0, z, ry); M.b(w, 0.9, 0.7, 0, 0.45, 0, 0x7a1c1c); M.b(w, 0.1, 0.8, 0, 0.95, 0, 0x4a0e0e); M.b(w, 0.1, 0.5, 0, 0.4, 0, 0x2a0606); M.pop(); const c = Math.abs(Math.cos(ry)) > 0.7; solid(R, x, z, c ? w : 0.8, c ? 0.8 : w, 1.0); };
    blk(-3.2, -3.4, 0, 3.2); blk(3.2, -3.4, 0, 3.2); blk(0, 4.2, 0, 3.8); blk(-10.2, 2.4, PI / 2, 3.0); blk(10.2, 2.4, PI / 2, 3.0); blk(-4.6, -11.6, 0.2, 2.8); blk(4.6, -11.6, -0.2, 2.8);
    const crate = (x, z, s, ry) => { M.push(x, 0, z, ry); M.b(s, s, s, 0, s / 2, 0, 0x7a1616); M.b(s + 0.02, 0.06, s + 0.02, 0, 0.07, 0, 0x3a0808); M.b(s + 0.02, 0.06, s + 0.02, 0, s - 0.07, 0, 0x3a0808); M.b(s * 0.5, s * 0.28, 0.01, 0, s * 0.55, s / 2 + 0.01, 0xdcb0a8); M.pop(); solid(R, x, z, s + 0.05, s + 0.05, s); };
    crate(-11.4, -13.4, 1.2, 0.2); crate(-11.6, -11.8, 0.9, -0.1); crate(-10.6, -13.6, 0.8, 0.5); crate(11.4, -13.4, 1.2, -0.2); crate(11.6, -11.8, 0.9, 0.1);
    crate(-11.6, 11.8, 1.1, 0.1); crate(11.6, 11.8, 1.1, -0.1); crate(9.3, 11.6, 0.8, 0.3);
    // гигантские «083» на северной стене, красные трубы и аварийные лампы
    const big = F.sign('083', 9.5, 3.4, { bg: '#2a0505', fg: '#ff2a1a', edge: '#8a1010' }); big.position.set(0, 3.5, RD.z0 + 0.2); g.add(big);
    for (let i = 0; i < 5; i += 1) { M.z(0.1, RD.z1 - RD.z0, RD.x0 + 0.5, 1.2 + i * 0.35, 0, 0x7a1414, 8); M.z(0.1, RD.z1 - RD.z0, RD.x1 - 0.5, 1.2 + i * 0.35, 0, 0x7a1414, 8); }
    [[-9, -12], [9, -12], [-9, 0], [9, 0], [-9, 12], [9, 12], [0, -7], [0, 8]].forEach((p, i) => {
      M.b(0.5, 0.3, 0.5, p[0], RD.h - 0.8, p[1], 0x1a0404); M.glow((q) => q.b(0.4, 0.2, 0.4, p[0], RD.h - 1.0, p[1], 0xff3a22));
      R.halos.push([p[0], RD.h - 1.2, p[1], 0xff2a1a, 7]); R.lampPos.push([p[0], RD.h - 1.5, p[1]]);
    });
    M.glass((q) => { q.b(3.4, 0.012, 2.2, -3, 0.015, 6, 0xcc2020); q.b(2.4, 0.012, 3.0, 6, 0.015, -7, 0xcc2020); });
    // след на стенах: «пятна» тёмных плит, дыры в бетоне — просто крупная неровность для глаза
    for (let i = 0; i < 16; i += 1) { const a = hash(i + 3), b = hash(i + 9); M.b(0.08, 0.5 + a * 1.6, 0.6 + b * 1.2, RD.x0 + 0.18, 1.5 + a * 3, -14 + b * 28, DARKR); M.b(0.08, 0.5 + b * 1.4, 0.6 + a * 1.2, RD.x1 - 0.18, 1.5 + b * 3, -14 + a * 28, DARKR); }
    // точки для охраны (юг — игрок появляется у z≈12)
    R.spots = [[-9, -13], [-5, -13], [0, -13.5], [5, -13], [9, -13], [-11, -6], [11, -6], [-6, -7.5], [6, -7.5], [0, -8.2], [-12, 1], [12, 1], [-4, 0.6], [4, 0.6], [-8, 5], [8, 5], [-3, 8.5], [3, 8.5], [0, 0], [-12, 8], [12, 8]];
    R.arrive = [0, 12.5, 0];
    R.bounds = { cx: 0, cz: 0, w: 28, d: 34, h: 7 };
    R.sprites = R.halos.map((hh) => { const sp = new T.Sprite(new T.SpriteMaterial({ map: F.glowTex(), color: hh[3], transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.55, fog: false })); sp.position.set(hh[0], hh[1], hh[2]); sp.scale.setScalar(hh[4]); g.add(sp); return sp; });
    // пыль при обрушении: пул спрайтов
    const dc = document.createElement('canvas'); dc.width = dc.height = 64; const dg = dc.getContext('2d'), gr = dg.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,140,120,0.7)'); gr.addColorStop(0.5, 'rgba(200,90,80,0.28)'); gr.addColorStop(1, 'rgba(160,60,50,0)'); dg.fillStyle = gr; dg.fillRect(0, 0, 64, 64);
    const dtex = new T.CanvasTexture(dc);
    for (let i = 0; i < 70; i += 1) { const sp = new T.Sprite(new T.SpriteMaterial({ map: dtex, transparent: true, depthWrite: false, opacity: 0, color: 0xffffff })); sp.visible = false; sp.renderOrder = 4; g.add(sp); R.dust.push({ sp, v: new T.Vector3(), life: 0, max: 1 }); }
    let di = 0;
    R.puff = (x, y, z, n, big2) => { for (let i = 0; i < n; i += 1) { const q = R.dust[di]; di = (di + 1) % R.dust.length; q.sp.position.set(x + (Math.random() - 0.5) * 3, y + Math.random(), z + (Math.random() - 0.5) * 3); q.v.set((Math.random() - 0.5) * 2.4, -0.2 + Math.random() * 1.2, (Math.random() - 0.5) * 2.4); q.life = q.max = 1.8 + Math.random() * 2.2; q.s0 = big2 ? 2 : 1; q.s1 = big2 ? 8 : 4.5; q.sp.visible = true; } };
    // обрушение: плиты падают по очереди, ударяются об пол, остаются валяться под наклоном
    R.collapse = (r2, o) => {
      o = o || {};
      R.slabs.forEach((s) => { s.delay = (o.t || 6) * (s.ord / 4.6) + Math.random() * 0.5; s.falling = false; s.done = false; s.t = 0; });
      R.colT = 0; R.collapsing = true; R.colHit = o.onHit || null;
    };
    R.uncollapse = () => { R.collapsing = false; R.slabs.forEach((s) => { s.falling = false; s.done = false; s.vy = 0; s.y = s.y0; s.m.position.set(s.x, s.y0, s.z); s.m.rotation.set(0, 0, 0); }); R.dust.forEach((q) => { q.life = 0; q.sp.visible = false; }); };
    let lt = 0;
    R.tick = (t) => {
      const dt = Math.min(0.1, lt ? t - lt : 0); lt = t;
      R.sprites.forEach((sp, i) => { const f = Math.sin(t * 5 + i * 1.7) * Math.sin(t * 13.1 + i); sp.material.opacity = (R.siren ? 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * 6 + i)) : 0.5) * (f > 0.82 ? 0.45 : 1); });
      if (R.collapsing) {
        R.colT += dt;
        R.slabs.forEach((s) => {
          if (s.done) return;
          if (!s.falling) { if (R.colT >= s.delay) { s.falling = true; s.rv = [(Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.9]; R.puff(s.x, RD.h - 0.3, s.z, 5, true); if (R.onSlab) R.onSlab(s, 'break'); } else { s.m.position.x = s.x + (Math.random() - 0.5) * 0.04; s.m.position.y = s.y0 + (Math.random() - 0.5) * 0.03; return; } }
          s.vy -= 16 * dt; s.y += s.vy * dt; s.m.position.set(s.x, s.y, s.z);
          s.spin = s.spin.map((a, k) => a + s.rv[k] * dt); s.m.rotation.set(s.spin[0], s.spin[1], s.spin[2]);
          if (s.y <= 0.6 + Math.random() * 0.1) { s.y = 0.5 + Math.random() * 0.25; s.done = true; s.m.position.y = s.y; R.puff(s.x, 0.6, s.z, 8, true); if (R.onSlab) R.onSlab(s, 'hit'); if (R.colHit) R.colHit(s); }
        });
      }
      R.dust.forEach((q) => {
        if (q.life <= 0) return; q.life -= dt; const k = 1 - q.life / q.max;
        if (q.life <= 0) { q.sp.visible = false; return; }
        q.sp.position.addScaledVector(q.v, dt); q.v.multiplyScalar(1 - dt * 0.6); q.sp.scale.setScalar(q.s0 + (q.s1 - q.s0) * Math.sqrt(k)); q.sp.material.opacity = 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.1)) * (1 - k * 0.3);
      });
    };
    R.onEnter = (Rg, w) => { w.r.scene.background = new T.Color(0x1a0303); };
  }

  // ================================================================== КАБИНЕТ HEAD
  const HD = { x0: -15, x1: 15, z0: -13, z1: 12, h: 6.8, cols: 10, rows: 5, cw: 1.95, ch: 1.1, rad: 19.5, zc: 7 };
  const CAW = 128, CAH = 72;
  // --- сцены мониторов (канвас-2D): стикмены играют в HIGH / LOW: столы, убийства, выигрыши, выброс за дверь, графики, обычные камеры
  function fig(g, x, y, s, col, o) {
    o = o || {}; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.5 * s; g.lineCap = 'round';
    const lean = o.lean || 0, sit = o.sit, hy = y - (sit ? 9 : 14) * s, bx = x + lean * 4 * s;
    g.beginPath(); g.arc(bx, hy - 4 * s, 2.8 * s, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(bx, hy - 1.2 * s); g.lineTo(x, y - (sit ? 3 : 6) * s); g.stroke();
    const arm = (a, sgn) => { g.beginPath(); g.moveTo(bx, hy + 0.6 * s); g.lineTo(bx + Math.cos(a) * 6 * s * sgn, hy + 0.6 * s + Math.sin(a) * 6 * s); g.stroke(); };
    arm(o.a1 === undefined ? 1.2 : o.a1, 1); arm(o.a2 === undefined ? 1.2 : o.a2, -1);
    const leg = (a, sgn) => { g.beginPath(); g.moveTo(x, y - (sit ? 3 : 6) * s); if (sit) { g.lineTo(x + sgn * 4 * s, y - 3 * s); g.lineTo(x + sgn * 4 * s, y + 1 * s); } else g.lineTo(x + Math.sin(a) * 4 * s * sgn, y + (o.lift ? 0 : 0.6) * s); g.stroke(); };
    leg(o.l1 === undefined ? 0.4 : o.l1, 1); leg(o.l2 === undefined ? 0.4 : o.l2, -1);
  }
  const SCN = {
    table(g, t, k, c) {
      g.fillStyle = '#10301c'; g.fillRect(0, 0, CAW, CAH);
      g.fillStyle = '#1d5a34'; g.beginPath(); g.ellipse(64, 46, 46, 16, 0, 0, TAU); g.fill(); g.strokeStyle = '#6a4a22'; g.lineWidth = 2; g.stroke();
      for (let i = 0; i < 4; i += 1) { const px = 26 + i * 25, ph = t * 1.6 + i + k; fig(g, px, 40 + (i % 2) * 2, 1.0, '#d8d4c8', { sit: true, a1: 0.6 + Math.sin(ph) * 0.4, a2: 1.2 }); }
      const ph = (t * 0.6 + k * 0.37) % 1, hi = ((t * 0.6 + k * 0.37) | 0) % 2 === 0;
      g.fillStyle = hi ? '#4cff7a' : '#ff4a4a'; g.font = 'bold 20px Arial Black, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.globalAlpha = 0.5 + 0.5 * Math.min(1, ph * 6); g.fillText(hi ? 'HIGH' : 'LOW', 64, 18); g.globalAlpha = 1;
      for (let i = 0; i < 5; i += 1) { g.fillStyle = ['#e8c84a', '#cf3030', '#3a78c8'][i % 3]; g.fillRect(44 + i * 8, 48 + (i % 2) * 2, 5, 3); }
      g.fillStyle = '#fff'; g.fillRect(58 + Math.sin(t * 3 + k) * 3, 40, 7, 10);
    },
    kill(g, t, k, c) {
      const p = (t * 0.28 + hash(k) * 3) % 1, shot = p > 0.34, f = Math.max(0, (p - 0.34) / 0.2);
      g.fillStyle = '#1a0e10'; g.fillRect(0, 0, CAW, CAH); g.fillStyle = '#3a1a1a'; g.fillRect(0, 56, CAW, 16);
      fig(g, 30, 60, 1.5, '#d8d4c8', { a1: -0.1, a2: 1.3, lean: 0.5 });
      g.strokeStyle = '#d8d4c8'; g.lineWidth = 2; g.beginPath(); g.moveTo(40, 49); g.lineTo(52, 49); g.stroke();
      if (p > 0.33 && p < 0.38) { g.fillStyle = '#ffe48a'; g.beginPath(); g.arc(55, 49, 5 + Math.random() * 3, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 0, CAW, CAH); }
      if (!shot) fig(g, 92, 60, 1.5, '#9a9a96', { a1: 2.4, a2: 2.4 });
      else {
        g.save(); g.translate(92, 60); g.rotate(Math.min(1.5, f * 1.6) * 1.0); fig(g, 0, 0, 1.5, '#9a9a96', { a1: 2.8, a2: 2.0 }); g.restore();
        g.fillStyle = '#c01818'; for (let i = 0; i < 10; i += 1) { const q = hash(i + k) * 6.28, d2 = Math.min(1, f * 1.3) * (6 + hash(i + 7) * 14); g.fillRect(90 + Math.cos(q) * d2, 48 + Math.sin(q) * d2 * 0.6 + f * 6, 2, 2); }
        g.fillStyle = '#c01818'; g.beginPath(); g.ellipse(92, 63, Math.min(1, f) * 16, 3, 0, 0, TAU); g.fill();
      }
      if (p > 0.55) { g.fillStyle = '#ff2a2a'; g.font = 'bold 12px Arial Black, sans-serif'; g.textAlign = 'center'; g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 9); g.fillText('ELIMINATED', 64, 14); g.globalAlpha = 1; }
    },
    prize(g, t, k, c) {
      g.fillStyle = '#1a1a30'; g.fillRect(0, 0, CAW, CAH); g.fillStyle = '#2a2a4a'; g.fillRect(0, 58, CAW, 14);
      const jump = Math.abs(Math.sin(t * 3 + k)) * 6;
      fig(g, 64, 62 - jump, 1.5, '#e8e4d8', { a1: -1.9 + Math.sin(t * 8) * 0.3, a2: -1.9 - Math.sin(t * 8) * 0.3, l1: 0.5, l2: 0.5 });
      g.fillStyle = '#ffd24a'; g.fillRect(56, 14 - jump * 0.3, 16, 9); g.fillStyle = '#7a5a10'; g.fillRect(56, 17 - jump * 0.3, 16, 2); g.fillStyle = '#7a5a10'; g.font = 'bold 8px Arial Black, sans-serif'; g.textAlign = 'center'; g.fillText('$', 64, 22 - jump * 0.3);
      for (let i = 0; i < 22; i += 1) { const x = (hash(i + k * 3) * 128 + Math.sin(t * 2 + i) * 6) % 128, y = ((t * (18 + hash(i) * 30) + hash(i + 5) * 72) % 80) - 4; g.fillStyle = ['#ff4a6a', '#4aff8a', '#4ac8ff', '#ffe04a'][i % 4]; g.fillRect(x, y, 3, 2); }
      g.fillStyle = '#ffe04a'; g.font = 'bold 13px Arial Black, sans-serif'; g.fillText('WIN  x' + (2 + ((t * 0.5 + k) | 0) % 8), 64, 40 + Math.sin(t * 6) * 2);
    },
    throw(g, t, k, c) {
      const p = (t * 0.22 + hash(k + 5)) % 1;
      g.fillStyle = '#14161a'; g.fillRect(0, 0, CAW, CAH); g.fillStyle = '#26282e'; g.fillRect(0, 56, CAW, 16);
      g.fillStyle = '#d8d0a0'; g.fillRect(110, 22, 14, 36); g.fillStyle = '#080808'; g.fillRect(112, 24, 10, 34); g.fillStyle = '#ff4a4a'; g.font = 'bold 6px Arial Black, sans-serif'; g.textAlign = 'center'; g.fillText('EXIT', 117, 20);
      const bx = 14 + Math.min(1, p / 0.62) * 66, dragging = p < 0.66, step = Math.sin(t * 9) * 0.5;
      fig(g, bx, 60, 1.9, '#5a5a62', { a1: 0.3, a2: 0.1, l1: step, l2: -step });
      if (dragging) fig(g, bx + 9, 60, 1.1, '#d8d4c8', { a1: 2.6, a2: 2.0, l1: -0.4, l2: 0.9, lean: 0.9 });
      else { const q = Math.min(1, (p - 0.66) / 0.3), fx = bx + 9 + q * 34, fy = 52 - Math.sin(q * PI) * 22; g.save(); g.translate(fx, fy); g.rotate(q * 7); fig(g, 0, 0, 1.1, '#d8d4c8', { a1: 2.4, a2: 2.9, l1: 0.8, l2: -0.8 }); g.restore(); }
      g.fillStyle = '#e8e8e8'; g.font = 'bold 8px Arial Black, sans-serif'; g.textAlign = 'left'; if (!dragging) g.fillText('OUT', 6, 12);
    },
    chart(g, t, k, c) {
      g.fillStyle = '#0c1620'; g.fillRect(0, 0, CAW, CAH); g.strokeStyle = '#243a50'; g.lineWidth = 0.5;
      for (let i = 1; i < 5; i += 1) { g.beginPath(); g.moveTo(8, 10 + i * 11); g.lineTo(120, 10 + i * 11); g.stroke(); }
      for (let i = 0; i < 10; i += 1) { const h1 = 8 + (0.5 + 0.5 * Math.sin(t * 1.3 + i * 0.9 + k)) * 36, up = i % 2 === 0; g.fillStyle = up ? '#4cff7a' : '#ff4a4a'; g.fillRect(12 + i * 11, 64 - h1, 7, h1); }
      g.fillStyle = '#e8e8e8'; g.font = 'bold 8px Arial Black, sans-serif'; g.textAlign = 'left'; g.fillText('HIGH ' + (40 + ((Math.sin(t + k) * 20 + 20) | 0)) + '%', 8, 8);
    },
    cam(g, t, k, c) {
      g.fillStyle = '#0e100e'; g.fillRect(0, 0, CAW, CAH); g.strokeStyle = '#3a4a3a'; g.lineWidth = 0.7;
      for (let i = 0; i < 8; i += 1) { g.beginPath(); g.moveTo(64, 28); g.lineTo(i * 18 - 4, 72); g.stroke(); }
      for (let i = 0; i < 5; i += 1) { const y = 28 + Math.pow(i / 4, 2) * 44; g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
      const wx = ((t * (8 + k % 5)) % 150) - 12; fig(g, wx, 52, 1.1, '#cfd8cf', { l1: Math.sin(t * 8) * 0.6, l2: -Math.sin(t * 8) * 0.6 });
      for (let i = 0; i < 40; i += 1) { g.fillStyle = 'rgba(200,255,200,' + (hash(i + Math.floor(t * 20)) * 0.25).toFixed(2) + ')'; g.fillRect(hash(i * 3 + Math.floor(t * 20)) * 128, hash(i * 7 + Math.floor(t * 20)) * 72, 2, 1); }
    },
    bars(g, t, k, c) {                                              // «нет сигнала»
      const cs = ['#c8c8c8', '#c8c800', '#00c8c8', '#00c800', '#c800c8', '#c80000', '#0000c8']; for (let i = 0; i < 7; i += 1) { g.fillStyle = cs[i]; g.fillRect(i * 18.3, 0, 18.4, 56); }
      g.fillStyle = '#111'; g.fillRect(0, 56, 128, 16); g.fillStyle = '#e8e8e8'; g.font = 'bold 9px Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('NO SIGNAL', 64, 64);
    }
  };
  const KINDS = ['table', 'table', 'table', 'kill', 'prize', 'throw', 'table', 'kill', 'chart', 'prize', 'throw', 'cam', 'table', 'kill', 'prize', 'throw', 'table', 'chart', 'cam', 'bars'];
  function buildScreens(R, g) {
    const T = THREE, N = HD.cols * HD.rows;
    const cv = document.createElement('canvas'); cv.width = HD.cols * CAW; cv.height = HD.rows * CAH;
    const ctx = cv.getContext('2d'), tex = new T.CanvasTexture(cv); tex.minFilter = T.LinearFilter; tex.generateMipmaps = false; tex.anisotropy = 2;
    R.scr = { cv, ctx, tex, cells: [], t: 0 };
    const pos = [], uv = [], idx = [], M = R.D;
    const tints = ['#ffffff', '#cfe8ff', '#d8ffd8', '#fff0d0'];
    for (let j = 0; j < HD.rows; j += 1) for (let i = 0; i < HD.cols; i += 1) {
      const n = j * HD.cols + i, th = (i - (HD.cols - 1) / 2) * (HD.cw + 0.12) / HD.rad, y = 0.9 + j * (HD.ch + 0.12) + HD.ch / 2;
      const cx = Math.sin(th) * HD.rad, cz = HD.zc - Math.cos(th) * HD.rad, ca = Math.cos(-th), sa = Math.sin(-th);
      // квад: локальные углы → мировые (поворот вокруг Y на −th)
      const corners = [[-HD.cw / 2, -HD.ch / 2], [HD.cw / 2, -HD.ch / 2], [HD.cw / 2, HD.ch / 2], [-HD.cw / 2, HD.ch / 2]];
      const b0 = pos.length / 3;
      corners.forEach((c) => { pos.push(cx + c[0] * ca, y + c[1], cz - c[0] * sa); });
      const u0 = i / HD.cols, u1 = (i + 1) / HD.cols, v0 = 1 - (j + 1) / HD.rows, v1 = 1 - j / HD.rows;
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1); idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
      M.push(cx, y, cz, -th); M.b(HD.cw + 0.16, HD.ch + 0.16, 0.14, 0, 0, -0.1, 0x0d0e12); M.b(HD.cw + 0.1, 0.05, 0.05, 0, -HD.ch / 2 - 0.1, 0.0, 0x2a2c32); M.pop();
      R.scr.cells.push({ n, kind: KINDS[(i * 7 + j * 3 + ((i * j) % 5)) % KINDS.length], k: n * 1.37, tint: tints[n % 4], hz: 0.75 + hash(n) * 0.5 });
    }
    // не больше 2 «нет сигнала»: остальные заменяем сценами
    let bars = 0; R.scr.cells.forEach((c) => { if (c.kind === 'bars' && ++bars > 2) c.kind = 'table'; });
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const mat = new T.MeshBasicMaterial({ map: tex, color: 0xffffff, side: T.DoubleSide, toneMapped: false });
    const mesh = new T.Mesh(geo, mat); mesh.frustumCulled = false; g.add(mesh); R.scr.mesh = mesh;
    // свет экранов на пол и мебель: цветные точки вдоль дуги
    [[-8, 0x4a86c8], [-3, 0x3aa86a], [3, 0x4a86c8], [8, 0xc84a4a]].forEach((p) => R.lampPos.push([p[0], 2.4, -6]));
    R.scr.draw = (t) => {
      const g2 = ctx; g2.save();
      R.scr.cells.forEach((c) => {
        const i = c.n % HD.cols, j = (c.n / HD.cols) | 0, tt = t * c.hz;
        g2.save(); g2.beginPath(); g2.rect(i * CAW, j * CAH, CAW, CAH); g2.clip(); g2.translate(i * CAW, j * CAH);
        (SCN[c.kind] || SCN.table)(g2, tt, c.k, c);
        // шапка камеры, REC, шум и строки
        g2.fillStyle = 'rgba(0,0,0,0.45)'; g2.fillRect(0, 0, CAW, 10); g2.fillStyle = '#e8e8e8'; g2.font = '7px monospace'; g2.textAlign = 'left'; g2.textBaseline = 'alphabetic';
        g2.fillText('CAM ' + String(c.n + 1).padStart(2, '0') + '  HIGH/LOW', 3, 7.5);
        if (((t * 1.4 + c.k) | 0) % 2 === 0) { g2.fillStyle = '#ff2a2a'; g2.beginPath(); g2.arc(CAW - 7, 5, 2.2, 0, TAU); g2.fill(); }
        g2.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 0; y < CAH; y += 3) g2.fillRect(0, y, CAW, 1);
        const gl = hash(Math.floor(t * 6) + c.n * 7);
        if (gl > 0.965) { g2.fillStyle = 'rgba(255,255,255,0.35)'; g2.fillRect(0, hash(c.n + t) * CAH, CAW, 3 + hash(c.n) * 5); }
        if (c.tint !== '#ffffff') { g2.globalCompositeOperation = 'multiply'; g2.fillStyle = c.tint; g2.fillRect(0, 0, CAW, CAH); g2.globalCompositeOperation = 'source-over'; }
        g2.restore();
      });
      g2.restore(); tex.needsUpdate = true;
    };
    R.scr.draw(0);
  }

  function buildHead(R, g) {
    const r = R.world.r, M = R.D, T = THREE, h = HD.h;
    R.lampPos = []; R.halos = [];
    F.shell(r, HD.x0, HD.x1, HD.z0, HD.z1, h, 0x1a1c22, { s: [[-1.9, 1.9]] }, { floor: 0x14151a, ceil: 0x0c0d10 });
    // тёмный пол с ковром под столом, подсветка по периметру
    M.b(9, 0.02, 7, 0, 0.012, -2.6, 0x2a1418); M.b(9.4, 0.016, 7.4, 0, 0.009, -2.6, 0x6a5624);
    for (let i = 0; i < 9; i += 1) M.glow((q) => q.b(0.2, 0.012, 22, -10 + i * 2.5, 0.016, -1, i % 2 ? 0x1a3a5a : 0x1a1a22));
    M.glow((q) => { q.b(30, 0.06, 0.1, 0, 0.06, HD.z0 + 0.4, 0x2a60c8); q.b(0.1, 0.06, 25, HD.x0 + 0.4, 0.06, 0, 0x2a60c8); q.b(0.1, 0.06, 25, HD.x1 - 0.4, 0.06, 0, 0x2a60c8); });
    // за дугой экранов — тёмная панель на всю стену, консоль перед экранами
    M.b(30, h, 0.3, 0, h / 2, HD.z0 + 0.2, 0x07080a);
    buildScreens(R, g);
    // потолок: полосы света, боковые экраны с графиками
    for (let i = 0; i < 4; i += 1) { M.b(26, 0.1, 0.5, 0, h - 0.06, -9 + i * 6, 0x181a1e); M.glow((q) => q.b(25, 0.03, 0.12, 0, h - 0.13, -9 + i * 6, i % 2 ? 0x3a6aa0 : 0x2a4a70)); }
    // стол руководителя: длинный, ножки-панели, три малых монитора, стеклянная столешница, лампа
    M.b(7.6, 0.12, 2.4, 0, 0.9, -6.0, 0x15161a); M.b(7.7, 0.05, 2.5, 0, 0.96, -6.0, 0x0a0b0d); M.b(7.2, 0.9, 0.12, 0, 0.45, -7.1, 0x1c1d22); M.b(0.12, 0.9, 2.2, -3.6, 0.45, -6.0, 0x1c1d22); M.b(0.12, 0.9, 2.2, 3.6, 0.45, -6.0, 0x1c1d22);
    M.glass((q) => q.b(7.4, 0.02, 2.2, 0, 1.0, -6.0, 0x7ab4e8));
    [-2.4, 0, 2.4].forEach((x, i) => { M.b(1.0, 0.62, 0.05, x, 1.5, -6.9, 0x0a0a0c); M.b(0.08, 0.3, 0.08, x, 1.15, -6.9, 0x1c1d22); M.glow((q) => q.b(0.92, 0.55, 0.02, x, 1.5, -6.87, [0x3a78c8, 0x3a9a6a, 0xc8503a][i])); });
    M.b(0.7, 0.04, 0.26, -1.2, 1.01, -5.4, 0x0a0a0c); M.b(0.34, 0.025, 0.2, 1.4, 1.01, -5.4, 0x2a2c30); M.glow((q) => q.b(0.04, 0.02, 0.02, 1.4, 1.03, -5.4, 0xff3a2a));
    solid(R, 0, -6.2, 7.8, 2.4, 1.0);
    // большое кресло: отдельная группа (вращается), высокая спинка, подлокотники, пятилучевая база
    const CH = new F.Mk();
    CH.y(0.04, 0.05, 0.4, 0, 0.3, 0, 0x15161a, 8); for (let i = 0; i < 5; i += 1) { const a = i / 5 * TAU; CH.b(0.52, 0.045, 0.06, Math.sin(a) * 0.26, 0.1, Math.cos(a) * 0.26, 0x1c1d21, 0, a - PI / 2); CH.y(0.035, 0.035, 0.05, Math.sin(a) * 0.52, 0.06, Math.cos(a) * 0.52, 0x0a0a0c, 8); }
    CH.b(0.95, 0.18, 0.92, 0, 0.38, 0, 0x201a16); CH.b(0.9, 0.08, 0.86, 0, 0.49, 0.02, 0x2c231c);
    CH.b(0.95, 1.55, 0.2, 0, 1.3, -0.47, 0x201a16, -0.1); CH.b(0.8, 1.25, 0.06, 0, 1.3, -0.35, 0x2c231c, -0.1); CH.b(0.6, 0.5, 0.2, 0, 2.2, -0.5, 0x201a16, -0.1);
    [-1, 1].forEach((s) => { CH.b(0.1, 0.08, 0.65, s * 0.55, 0.82, 0.0, 0x15161a); CH.b(0.08, 0.35, 0.08, s * 0.55, 0.66, 0.2, 0x15161a); for (let i = 0; i < 5; i += 1) CH.b(0.02, 0.02, 0.5, s * 0.46, 1.2 + i * 0.22, -0.3, 0x6a5624, 0.0, 0.0, 0.0); });
    for (let i = 0; i < 7; i += 1) CH.b(0.82, 0.015, 0.012, 0, 0.9 + i * 0.19, -0.352, 0x120e0b, -0.1);
    const chair = CH.build({ cull: false }); chair.position.set(0, 0, -4.0); g.add(chair); R.chair = chair; R.chairAt = [0, -4.0];
    solid(R, 0, -4.0, 1.0, 1.0, 1.0).off = true;
    // сзади у входа: диван и два кресла для гостей, торшеры, стеклянный шкаф с кубками
    M.b(3.2, 0.5, 1.1, -9.5, 0.3, 8.5, 0x2a1c18); M.b(3.2, 0.7, 0.3, -9.5, 0.85, 8.95, 0x2a1c18); M.b(0.3, 0.7, 1.1, -11.0, 0.55, 8.5, 0x201510); M.b(0.3, 0.7, 1.1, -8.0, 0.55, 8.5, 0x201510);
    solid(R, -9.5, 8.5, 3.2, 1.2, 0.8);
    M.b(3.6, 2.4, 0.6, 11.4, 1.2, 9.2, 0x14151a); M.glass((q) => q.b(3.4, 2.2, 0.05, 11.4, 1.2, 8.9, 0xaec2d4));
    for (let i = 0; i < 4; i += 1) { M.y(0.08, 0.14, 0.34, 10.2 + i * 0.7, 0.9 + (i % 2) * 0.9, 9.3, 0xd8a418, 10); M.b(0.3, 0.04, 0.3, 10.2 + i * 0.7, 0.7 + (i % 2) * 0.9, 9.3, 0x2a2c30); }
    solid(R, 11.4, 9.2, 3.6, 0.7, 2.4);
    [[-13.2, 9.8], [13.2, -9.5], [-13.2, -9.5]].forEach((p) => { M.y(0.02, 0.02, 1.5, p[0], 0.75, p[1], 0x15161a, 6); M.y(0.2, 0.12, 0.3, p[0], 1.6, p[1], 0x15161a, 10); M.glow((q) => q.y(0.16, 0.16, 0.04, p[0], 1.5, p[1], 0xffd9a0, 10)); R.lampPos.push([p[0], 1.6, p[1]]); R.halos.push([p[0], 1.6, p[1], 0xffc880, 3.2]); });
    // эмблема HIGH / LOW над дугой и надпись над дверью
    const em = F.sign('H I G H   /   L O W', 8.4, 1.0, { bg: '#0a0a0c', fg: '#d9b25a', edge: '#6a5624' }); em.position.set(0, h - 0.5, HD.z0 + 0.5); g.add(em);
    // дверь HEAD (двустворчатая, распахивается внутрь): рама, створки на петлях по краям
    const FR = new F.Mk(); FR.b(0.7, 3.8, 0.7, -2.55, 1.9, 0, 0x1a1a1e); FR.b(0.7, 3.8, 0.7, 2.55, 1.9, 0, 0x1a1a1e); FR.b(5.8, 0.7, 0.7, 0, 3.85, 0, 0x1a1a1e); FR.b(0.12, 3.5, 0.1, 0, 1.75, 0.3, 0x6a5624);
    const fr = FR.build({ cull: false }); fr.position.set(0, 0, HD.z1); g.add(fr);
    const leafs = [-1, 1].map((s) => {
      const L = new F.Mk(); L.b(1.9, 3.5, 0.14, -s * 0.95, 1.75, 0, 0x0e0e10); L.b(1.7, 3.3, 0.06, -s * 0.95, 1.75, 0.08, 0x17171a); for (let i = 0; i < 4; i += 1) L.b(1.64, 0.05, 0.07, -s * 0.95, 0.6 + i * 0.8, 0.1, 0x6a5624);
      L.b(0.1, 0.7, 0.14, -s * 0.05, 1.5, 0.12, 0xb08a3a);
      const lg = L.build({ cull: false }), piv = new T.Group(); piv.position.set(s * 1.95, 0, HD.z1); piv.add(lg); g.add(piv); return piv;
    });
    R.door = { leafs, k: 0, col: solid(R, 0, HD.z1, 3.9, 0.5, 3.6) };
    R.door.set = (k) => { R.door.k = k; leafs[0].rotation.y = k * 1.75; leafs[1].rotation.y = -k * 1.75; R.door.col.off = k > 0.3; };
    R.door.set(0);
    R.arrive = [0, 10.2, 0]; R.kneelAt = [0, -1.3];
    R.bounds = { cx: 0, cz: -0.5, w: 31, d: 26.5, h: 7.2 };
    R.halos.forEach((hh) => { const sp = new T.Sprite(new T.SpriteMaterial({ map: F.glowTex(), color: hh[3], transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.5, fog: false })); sp.position.set(hh[0], hh[1], hh[2]); sp.scale.setScalar(hh[4]); g.add(sp); });
    let last = -1;
    R.tick = (t) => { if (t - last > 0.055) { last = t; R.scr.draw(t); } };
    R.onEnter = (Rg, w) => { w.r.scene.background = new T.Color(0x040508); };
  }

  F.regions6 = function (w) {
    const A = w.def('red', { build: buildRed, surf: ['concrete_dark', 'concrete_dark', 'concrete_dark'], amb: 0.85, fogK: 0.2, fogC: 0x2a0404, lampCol: 0xff3020, lampI: 1.0, lampD: 20, seed: 93 });
    const B = w.def('head', { build: buildHead, surf: ['carpet', 'plaster', 'concrete_dark'], amb: 0.6, fogK: 0.3, fogC: 0x04050a, lampCol: 0x6aa0ff, lampI: 0.7, lampD: 16, seed: 94 });
    [A, B].forEach((R) => { R.world = w; });
  };
  F.RED = RD; F.HEAD = HD;
}());
