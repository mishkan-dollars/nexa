// NEXA: процедурные обложки заданий 1–48 и режимов (canvas, без внешних картинок). Детерминированы: seed = номер задания; рисуются в условных 640×360 и масштабируются под любой размер.
// Стиль NEXA/OS: тёмная палитра, крупные силуэты места действия, красные лучи/полосы, зерно, большой номер и подпись. Задание 48 — отдельная «дорогая» обложка (текст только English).
// API: ModeCovers.paint(canvas, key) (key: 'm:7' | 'mode:sandbox|br|ffa|team|duel|story'), ModeCovers.lazy(canvas, key[, root]) — рисует при появлении в области прокрутки; кэш готовых картинок в памяти.
(function () {
  'use strict';
  const RED = '#ef4b45', FONT = '"Space Mono","Courier New",monospace';
  const mulberry = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const MOTIF = {
    1: 'range', 2: 'lab', 3: 'lab', 4: 'tunnel', 5: 'lab', 6: 'vault', 7: 'cells', 8: 'range', 9: 'pylon', 10: 'shaft', 11: 'office', 12: 'train', 13: 'city', 14: 'tunnel', 15: 'control', 16: 'tower',
    17: 'city', 18: 'alley', 19: 'office', 20: 'yard', 21: 'dock', 22: 'lock', 23: 'camera', 24: 'metro', 25: 'garage', 26: 'office', 27: 'house', 28: 'yard', 29: 'lab', 30: 'tunnel', 31: 'dock', 32: 'tunnel',
    33: 'yard', 34: 'office', 35: 'house', 36: 'control', 37: 'vault', 38: 'roof', 39: 'tunnel', 40: 'bridge', 41: 'metro', 42: 'tunnel', 43: 'house', 44: 'cells', 45: 'lab', 46: 'vault', 47: 'cold', 48: 'finale'
  };
  const DAY = { 17: 1, 13: 1, 38: 1, 40: 1, 20: 1, 28: 1, 33: 1, 31: 1, 21: 1 };
  const MODES = {
    sandbox: { t: 'SANDBOX', s: 'CO-OP · WAVES', m: 'range' }, ffa: { t: 'FREE FOR ALL', s: 'PVP · QUICK MATCH', m: 'ffa' },
    team: { t: 'TEAM BATTLE', s: 'PVP · TWO TEAMS', m: 'team' }, duel: { t: 'DUEL', s: 'PVP · 1 VS 1', m: 'duel' }, hl: { t: 'HIGH / LOW', s: 'TABLE GAME', m: 'hl' }, story: { t: 'STORY', s: 'CO-OP MISSIONS 01–48', m: 'story' }
  };
  const cache = new Map();

  function noise(ctx, w, h, rnd, k) {
    const im = ctx.getImageData(0, 0, w, h), d = im.data, n = Math.round(w * h * k);
    for (let i = 0; i < n; i += 1) { const p = ((rnd() * w | 0) + (rnd() * h | 0) * w) * 4, v = rnd() < 0.5 ? -26 : 30; d[p] += v; d[p + 1] += v; d[p + 2] += v; }
    ctx.putImageData(im, 0, 0);
  }
  function person(c, x, y, h, dir, col, gun) {
    const s = h / 100;
    c.fillStyle = col; c.beginPath(); c.arc(x, y - 88 * s, 8 * s, 0, 7); c.fill();
    c.beginPath(); c.moveTo(x - 13 * s, y - 78 * s); c.lineTo(x + 13 * s, y - 78 * s); c.lineTo(x + 10 * s, y - 38 * s); c.lineTo(x - 10 * s, y - 38 * s); c.closePath(); c.fill();
    c.fillRect(x - 10 * s, y - 40 * s, 7 * s, 40 * s); c.fillRect(x + 3 * s, y - 40 * s, 7 * s, 40 * s);
    if (gun) { c.save(); c.translate(x, y - 64 * s); c.rotate(dir > 0 ? -0.04 : 0.04); c.fillRect(dir > 0 ? 2 * s : -34 * s, -4 * s, 32 * s, 7 * s); c.restore(); }
  }
  function sky(c, W, H, day, rnd) {
    const g = c.createLinearGradient(0, 0, 0, H);
    if (day) { g.addColorStop(0, '#4a4a4a'); g.addColorStop(0.6, '#1d1d1d'); g.addColorStop(1, '#070707'); } else { g.addColorStop(0, '#161616'); g.addColorStop(0.6, '#0a0a0a'); g.addColorStop(1, '#030303'); }
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  function beams(c, W, H, rnd, n, x0, y0, a) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i += 1) {
      const ang = (a === undefined ? 1.9 : a) + (rnd() - 0.5) * 1.1, wd = 0.04 + rnd() * 0.1, L = 700, al = 0.07 + rnd() * 0.12;
      const g = c.createLinearGradient(x0, y0, x0 + Math.cos(ang) * L, y0 + Math.sin(ang) * L); g.addColorStop(0, 'rgba(239,75,69,' + al * 2 + ')'); g.addColorStop(1, 'rgba(239,75,69,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + Math.cos(ang - wd) * L, y0 + Math.sin(ang - wd) * L); c.lineTo(x0 + Math.cos(ang + wd) * L, y0 + Math.sin(ang + wd) * L); c.closePath(); c.fill();
    }
    c.restore();
  }
  function glow(c, x, y, r, col, a) {
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0));
    c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
  }
  const RGLOW = 'rgba(239,75,69,A)', WGLOW = 'rgba(230,233,230,A)';
  const edge = (c, col) => { c.strokeStyle = col || '#2c2c2c'; c.lineWidth = 1.2; c.stroke(); };

  // ------------------------------------------------------------------ мотивы (W=640, H=360)
  const M = {
    city(c, W, H, rnd, d) {
      const base = H * 0.78;
      for (let layer = 0; layer < 3; layer += 1) {
        let x = -20; const col = ['#101010', '#0b0b0b', '#050505'][layer], top = [0.28, 0.2, 0.1][layer];
        while (x < W) { const w = 36 + rnd() * 70, h = (60 + rnd() * 190) * (1 - top) + layer * 18; c.fillStyle = col; c.fillRect(x, base - h, w, h + 80); c.strokeStyle = '#1f1f1f'; c.strokeRect(x + 0.5, base - h + 0.5, w, h);
          if (layer < 2) for (let wy = base - h + 10; wy < base - 8; wy += 14) for (let wx = x + 6; wx < x + w - 8; wx += 11) if (rnd() < 0.2) { c.fillStyle = rnd() < 0.14 ? RED : 'rgba(230,233,230,' + (0.12 + rnd() * 0.3) + ')'; c.fillRect(wx, wy, 5, 7); }
          x += w + 2 + rnd() * 6; }
      }
      c.fillStyle = '#040404'; c.fillRect(0, base, W, H - base);
      c.fillStyle = 'rgba(239,75,69,.18)'; c.fillRect(0, base, W, 2);
    },
    tower(c, W, H, rnd) {
      M.city(c, W, H, rnd);
      const x = W * (0.55 + rnd() * 0.1), w = 74;
      c.fillStyle = '#0c0c0c'; c.fillRect(x, 24, w, H); c.strokeStyle = '#3a3a3a'; c.strokeRect(x + 0.5, 24.5, w, H);
      for (let y = 36; y < H * 0.75; y += 12) { c.fillStyle = rnd() < 0.2 ? RED : 'rgba(230,233,230,.22)'; c.fillRect(x + 8, y, w - 16, 3); }
      c.fillStyle = RED; c.fillRect(x + w / 2 - 1, 0, 2, 24); glow(c, x + w / 2, 8, 40, RGLOW, 0.8);
    },
    tunnel(c, W, H, rnd, d, arch) {
      const vx = W * (0.46 + rnd() * 0.1), vy = H * 0.5;
      for (let i = 0; i < 9; i += 1) {
        const k = 1 - i / 9, w = 80 + k * k * 560, h = 50 + k * k * 330;
        c.strokeStyle = 'rgba(' + (i % 3 === 0 ? '239,75,69' : '90,90,90') + ',' + (0.12 + k * 0.5) + ')'; c.lineWidth = 1 + k * 2;
        if (arch) { c.beginPath(); c.arc(vx, vy + h * 0.1, w / 2, Math.PI, 0); c.lineTo(vx + w / 2, vy + h / 2); c.moveTo(vx - w / 2, vy + h * 0.1); c.lineTo(vx - w / 2, vy + h / 2); c.stroke(); } else c.strokeRect(vx - w / 2, vy - h / 2, w, h);
      }
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, 0, W, H);
      glow(c, vx, vy, 120, WGLOW, 0.55); glow(c, vx, vy, 60, RGLOW, 0.5);
      c.strokeStyle = 'rgba(230,233,230,.12)'; c.lineWidth = 1;
      for (let i = -5; i <= 5; i += 1) { c.beginPath(); c.moveTo(vx + i * 6, vy + 20); c.lineTo(vx + i * 150, H); c.stroke(); }
      person(c, vx + (rnd() - 0.5) * 80, vy + 70, 70, 1, '#020202', true);
    },
    metro(c, W, H, rnd, d) { M.tunnel(c, W, H, rnd, d, true); c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, H * 0.78, W, H); c.fillStyle = RED; c.fillRect(W * 0.12, H * 0.74, W * 0.76, 3); },
    train(c, W, H, rnd) {
      c.fillStyle = '#060606'; c.fillRect(0, H * 0.6, W, H);
      for (let i = 0; i < 3; i += 1) {
        const x = -30 + i * 230, y = H * 0.28; c.fillStyle = '#0d0d0d'; c.fillRect(x, y, 220, H * 0.36); c.strokeStyle = '#2a2a2a'; c.strokeRect(x + 0.5, y + 0.5, 220, H * 0.36);
        for (let k = 0; k < 4; k += 1) { c.fillStyle = rnd() < 0.3 ? 'rgba(239,75,69,.7)' : 'rgba(230,233,230,.2)'; c.fillRect(x + 14 + k * 52, y + 22, 40, 34); }
        c.fillStyle = RED; c.fillRect(x, y + H * 0.36 - 14, 220, 3);
      }
      c.strokeStyle = '#303030'; c.beginPath(); c.moveTo(0, H * 0.7); c.lineTo(W, H * 0.7); c.moveTo(0, H * 0.74); c.lineTo(W, H * 0.74); c.stroke();
      glow(c, W * 0.9, H * 0.4, 130, RGLOW, 0.45);
    },
    lab(c, W, H, rnd) {
      const n = 4 + (rnd() * 3 | 0);
      for (let i = 0; i < n; i += 1) {
        const x = 60 + i * (W - 120) / (n - 1), h = 140 + rnd() * 100, w = 34 + rnd() * 16;
        c.fillStyle = '#080808'; c.fillRect(x - w / 2, H * 0.78 - h, w, h); c.strokeStyle = '#303030'; c.strokeRect(x - w / 2 + 0.5, H * 0.78 - h + 0.5, w, h);
        const lv = 0.3 + rnd() * 0.5, g = c.createLinearGradient(0, H * 0.78 - h * lv, 0, H * 0.78); g.addColorStop(0, 'rgba(239,75,69,.65)'); g.addColorStop(1, 'rgba(120,20,20,.25)');
        c.fillStyle = g; c.fillRect(x - w / 2 + 3, H * 0.78 - h * lv, w - 6, h * lv - 3);
        glow(c, x, H * 0.78 - h * lv * 0.5, 70, RGLOW, 0.25);
        c.fillStyle = '#111'; c.fillRect(x - w / 2 - 6, H * 0.78 - h - 8, w + 12, 8); c.fillRect(x - w / 2 - 6, H * 0.78, w + 12, 10);
      }
      c.fillStyle = '#050505'; c.fillRect(0, H * 0.78 + 10, W, H); c.fillStyle = 'rgba(230,233,230,.08)'; for (let x = 0; x < W; x += 40) c.fillRect(x, H * 0.78 + 10, 1, H);
    },
    range(c, W, H, rnd) {
      const vx = W / 2, vy = H * 0.46;
      c.fillStyle = '#060606'; c.beginPath(); c.moveTo(0, H); c.lineTo(vx - 60, vy); c.lineTo(vx + 60, vy); c.lineTo(W, H); c.fill();
      c.strokeStyle = 'rgba(230,233,230,.18)';
      for (let i = -6; i <= 6; i += 1) { c.beginPath(); c.moveTo(vx + i * 8, vy); c.lineTo(vx + i * 130, H); c.stroke(); }
      for (let k = 1; k < 7; k += 1) { const y = vy + Math.pow(k / 7, 2) * (H - vy); c.strokeStyle = k % 2 ? 'rgba(239,75,69,.5)' : 'rgba(230,233,230,.15)'; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      for (let i = 0; i < 5; i += 1) {
        const x = vx + (i - 2) * 82 * (0.7 + i * 0.05), y = vy + 6, s = 22 + (2 - Math.abs(i - 2)) * 6;
        c.fillStyle = '#0c0c0c'; c.fillRect(x - s * 0.4, y - s * 0.2, s * 0.8, s * 1.8); c.strokeStyle = '#3a3a3a'; c.strokeRect(x - s * 0.4 + 0.5, y - s * 0.2, s * 0.8, s * 1.8);
        for (let r = 3; r >= 1; r -= 1) { c.beginPath(); c.arc(x, y + s * 0.5, r * s * 0.19, 0, 7); c.fillStyle = r % 2 ? RED : '#1b1b1b'; c.fill(); }
      }
      glow(c, vx, vy, 170, WGLOW, 0.22);
    },
    cells(c, W, H, rnd) {
      c.fillStyle = '#060606'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 7; i += 1) { const x = 30 + i * 90; c.fillStyle = '#0b0b0b'; c.fillRect(x, 50, 70, H - 90); c.strokeStyle = '#3a3a3a'; c.lineWidth = 2; for (let b = 0; b <= 6; b += 1) { c.beginPath(); c.moveTo(x + 6 + b * 10, 50); c.lineTo(x + 6 + b * 10, H - 40); c.stroke(); } }
      c.fillStyle = RED; c.fillRect(0, 44, W, 3); glow(c, W * (0.2 + rnd() * 0.6), 50, 150, RGLOW, 0.4);
    },
    vault(c, W, H, rnd) {
      const x = W * 0.58, y = H * 0.48;
      for (let i = 7; i >= 0; i -= 1) { c.beginPath(); c.arc(x, y, 40 + i * 20, 0, 7); c.fillStyle = i % 2 ? '#0b0b0b' : '#141414'; c.fill(); edge(c, i === 0 ? RED : '#303030'); }
      c.strokeStyle = '#3a3a3a'; c.lineWidth = 6; for (let k = 0; k < 6; k += 1) { const a = k * Math.PI / 3 + 0.3; c.beginPath(); c.moveTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); c.lineTo(x + Math.cos(a) * 52, y + Math.sin(a) * 52); c.stroke(); }
      c.beginPath(); c.arc(x, y, 14, 0, 7); c.fillStyle = RED; c.fill(); glow(c, x, y, 160, RGLOW, 0.4);
    },
    pylon(c, W, H, rnd) {
      for (let i = 0; i < 3; i += 1) {
        const x = 120 + i * 200 + rnd() * 30, b = H * 0.86, t = 40 + rnd() * 50; c.strokeStyle = '#2e2e2e'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x - 46, b); c.lineTo(x - 6, t); c.lineTo(x + 6, t); c.lineTo(x + 46, b); for (let y = b; y > t; y -= 26) { c.moveTo(x - 46 * (y - t) / (b - t) - 4, y); c.lineTo(x + 46 * (y - t) / (b - t) + 4, y); } c.stroke();
        c.beginPath(); c.moveTo(x - 60, t + 14); c.lineTo(x + 60, t + 14); c.stroke();
        if (i < 2) { c.strokeStyle = 'rgba(239,75,69,.6)'; c.beginPath(); c.moveTo(x + 60, t + 14); c.quadraticCurveTo(x + 130, t + 70, x + 140, t + 14); c.stroke(); }
      }
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); let x = W * 0.3, y = 0; c.moveTo(x, y); while (y < H * 0.7) { x += (rnd() - 0.5) * 50; y += 20 + rnd() * 20; c.lineTo(x, y); } c.stroke(); glow(c, x, y, 120, WGLOW, 0.5);
      c.fillStyle = '#040404'; c.fillRect(0, H * 0.86, W, H);
    },
    shaft(c, W, H, rnd) {
      const vx = W * 0.5; c.fillStyle = '#050505'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 14; i += 1) { const y = i * 28; c.strokeStyle = i % 4 ? '#222' : '#3a3a3a'; c.beginPath(); c.moveTo(vx - 120, y); c.lineTo(vx + 120, y); c.stroke(); c.beginPath(); c.moveTo(vx - 120, y); c.lineTo(vx - 150, y + 28); c.moveTo(vx + 120, y); c.lineTo(vx + 150, y + 28); c.stroke(); }
      c.strokeStyle = '#555'; c.lineWidth = 2; [-60, 60].forEach((o) => { c.beginPath(); c.moveTo(vx + o, 0); c.lineTo(vx + o, H * 0.4); c.stroke(); });
      c.fillStyle = '#121212'; c.fillRect(vx - 70, H * 0.4, 140, 100); c.strokeStyle = RED; c.strokeRect(vx - 70.5, H * 0.4 + 0.5, 140, 100); c.fillStyle = 'rgba(239,75,69,.6)'; c.fillRect(vx - 56, H * 0.4 + 16, 112, 6);
      glow(c, vx, H * 0.4 + 50, 150, RGLOW, 0.35); glow(c, vx, H, 140, WGLOW, 0.25);
    },
    office(c, W, H, rnd) {
      const day = rnd() < 0.5; c.fillStyle = '#060606'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 6; i += 1) { const x = 20 + i * 104; c.fillStyle = day ? 'rgba(230,233,230,.07)' : 'rgba(239,75,69,.05)'; c.fillRect(x, 28, 88, H * 0.58); c.strokeStyle = '#2a2a2a'; c.strokeRect(x + 0.5, 28.5, 88, H * 0.58); }
      c.fillStyle = '#080808'; for (let i = 0; i < 4; i += 1) { const x = 40 + i * 150 + rnd() * 20; c.fillRect(x, H * 0.66, 100, 8); c.fillRect(x + 8, H * 0.66, 5, 40); c.fillRect(x + 86, H * 0.66, 5, 40); c.fillRect(x + 20, H * 0.66 - 22, 38, 22); }
      c.fillStyle = '#030303'; c.fillRect(0, H * 0.86, W, H); beams(c, W, H, rnd, 3, W * 0.5, 0, 1.57);
    },
    control(c, W, H, rnd) {
      c.fillStyle = '#050505'; c.fillRect(0, 0, W, H);
      for (let r = 0; r < 3; r += 1) for (let k = 0; k < 6; k += 1) { const x = 24 + k * 100, y = 30 + r * 92, on = rnd();
        c.fillStyle = '#0b0b0b'; c.fillRect(x, y, 88, 76); c.strokeStyle = '#333'; c.strokeRect(x + 0.5, y + 0.5, 88, 76);
        c.fillStyle = on < 0.15 ? 'rgba(239,75,69,.65)' : 'rgba(230,233,230,' + (0.05 + rnd() * 0.12) + ')'; c.fillRect(x + 5, y + 5, 78, 56);
        c.strokeStyle = on < 0.15 ? '#fff' : 'rgba(255,255,255,.3)'; c.beginPath(); c.moveTo(x + 8, y + 52); for (let q = 1; q < 8; q += 1) c.lineTo(x + 8 + q * 10, y + 52 - rnd() * 34); c.stroke(); }
      glow(c, W * 0.5, H, 200, RGLOW, 0.3);
    },
    camera(c, W, H, rnd) {
      M.control(c, W, H, rnd); c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, 0, W, H);
      const x = W * 0.62, y = H * 0.36; c.save(); c.translate(x, y); c.rotate(-0.35);
      c.fillStyle = '#101010'; c.fillRect(-60, -20, 110, 40); c.strokeStyle = '#555'; c.strokeRect(-59.5, -19.5, 110, 40); c.beginPath(); c.arc(54, 0, 17, 0, 7); c.fillStyle = '#070707'; c.fill(); c.strokeStyle = RED; c.stroke(); c.beginPath(); c.arc(54, 0, 5, 0, 7); c.fillStyle = RED; c.fill(); c.restore();
      glow(c, x + 50, y - 16, 70, RGLOW, 0.6); beams(c, W, H, rnd, 2, x + 40, y - 14, 0.9);
    },
    lock(c, W, H, rnd) {
      const x = W * 0.58, y = H * 0.46; c.fillStyle = '#0d0d0d'; c.fillRect(x - 80, y - 30, 160, 130); c.strokeStyle = '#444'; c.lineWidth = 2; c.strokeRect(x - 80, y - 30, 160, 130);
      c.beginPath(); c.arc(x, y - 30, 48, Math.PI, 0); c.lineWidth = 12; c.strokeStyle = '#2a2a2a'; c.stroke();
      c.beginPath(); c.arc(x, y + 28, 15, 0, 7); c.fillStyle = '#000'; c.fill(); c.fillRect(x - 5, y + 28, 10, 40); glow(c, x, y + 28, 130, RGLOW, 0.5);
      for (let i = 0; i < 6; i += 1) { c.fillStyle = 'rgba(230,233,230,.15)'; c.fillRect(30 + i * 20, 60 + rnd() * 160, 3, 30 + rnd() * 50); }
    },
    garage(c, W, H, rnd) {
      const vx = W * 0.5, vy = H * 0.45; c.fillStyle = '#050505'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 6; i += 1) { const k = i / 6, x = vx + (i % 2 ? 1 : -1) * (40 + k * 260 + (1 - k) * 40); c.fillStyle = '#101010'; c.fillRect(x - 12 - k * 18, vy - 40 - k * 110, 24 + k * 36, 80 + k * 260); c.strokeStyle = '#303030'; c.strokeRect(x - 11.5 - k * 18, vy - 40 - k * 110, 24 + k * 36, 80 + k * 260); }
      c.fillStyle = RED; for (let i = 0; i < 5; i += 1) { const k = i / 5; c.fillRect(vx - 30 - k * 140, vy - 80 - k * 110, 60 + k * 280, 3); }
      c.fillStyle = '#0a0a0a'; c.beginPath(); c.moveTo(W * 0.1, H * 0.86); c.lineTo(W * 0.14, H * 0.7); c.lineTo(W * 0.3, H * 0.66); c.lineTo(W * 0.42, H * 0.7); c.lineTo(W * 0.46, H * 0.86); c.fill(); edge(c, '#333');
      c.fillStyle = RED; c.fillRect(W * 0.14, H * 0.8, 14, 5); c.fillRect(W * 0.4, H * 0.8, 14, 5); glow(c, vx, vy, 130, WGLOW, 0.25);
    },
    house(c, W, H, rnd) {
      const x = W * 0.5, b = H * 0.82; c.fillStyle = '#0b0b0b'; c.fillRect(x - 210, b - 140, 420, 140); c.strokeStyle = '#303030'; c.strokeRect(x - 209.5, b - 139.5, 420, 140);
      c.beginPath(); c.moveTo(x - 240, b - 140); c.lineTo(x, b - 230); c.lineTo(x + 240, b - 140); c.closePath(); c.fillStyle = '#060606'; c.fill(); edge(c, '#3a3a3a');
      for (let i = 0; i < 6; i += 1) { c.fillStyle = '#121212'; c.fillRect(x - 190 + i * 70, b - 134, 14, 134); }
      for (let i = 0; i < 5; i += 1) { c.fillStyle = rnd() < 0.3 ? 'rgba(239,75,69,.8)' : 'rgba(230,233,230,.2)'; c.fillRect(x - 160 + i * 72, b - 110, 34, 46); }
      c.fillStyle = '#000'; c.fillRect(x - 18, b - 56, 36, 56); c.fillStyle = '#030303'; c.fillRect(0, b, W, H); glow(c, x, b - 80, 200, RGLOW, 0.3);
    },
    alley(c, W, H, rnd) {
      const vx = W * 0.5, vy = H * 0.4;
      c.fillStyle = '#090909'; c.beginPath(); c.moveTo(0, 0); c.lineTo(vx - 40, vy - 30); c.lineTo(vx - 40, vy + 60); c.lineTo(0, H); c.fill(); edge(c, '#303030');
      c.beginPath(); c.moveTo(W, 0); c.lineTo(vx + 40, vy - 30); c.lineTo(vx + 40, vy + 60); c.lineTo(W, H); c.fill(); edge(c, '#303030');
      for (let i = 0; i < 6; i += 1) { const k = i / 6; c.fillStyle = rnd() < 0.3 ? 'rgba(239,75,69,.5)' : 'rgba(230,233,230,.16)'; c.fillRect(vx - 40 - (1 - k) * 220 + 10, vy - 20 + i * 10, 20 * (1 - k * 0.5) + 4, 26); }
      c.fillStyle = '#050505'; c.fillRect(vx - 120, H * 0.7, 80, 60); glow(c, vx, vy + 10, 90, WGLOW, 0.45); beams(c, W, H, rnd, 2, vx, 0, 1.55);
    },
    yard(c, W, H, rnd) {
      sky(c, W, H, true, rnd); const b = H * 0.8;
      c.strokeStyle = '#303030'; c.lineWidth = 3; c.beginPath(); c.moveTo(W * 0.78, b); c.lineTo(W * 0.78, 50); c.lineTo(W * 0.2, 50); c.moveTo(W * 0.3, 50); c.lineTo(W * 0.3, 140); c.stroke();
      c.fillStyle = RED; c.fillRect(W * 0.3 - 20, 140, 40, 8);
      for (let i = 0; i < 9; i += 1) { const x = -10 + i * 74 + rnd() * 20, h = 30 + rnd() * 80; c.fillStyle = ['#0a0a0a', '#101010', '#151515'][i % 3]; c.fillRect(x, b - h, 68, h + 40); c.strokeStyle = '#2a2a2a'; c.strokeRect(x + 0.5, b - h + 0.5, 68, h); c.fillStyle = 'rgba(239,75,69,.25)'; c.fillRect(x, b - h + 6, 68, 3); }
      c.fillStyle = '#040404'; c.fillRect(0, b + 10, W, H); beams(c, W, H, rnd, 2, W * 0.78, 50, 2.1);
    },
    dock(c, W, H, rnd) {
      sky(c, W, H, true, rnd); const b = H * 0.7;
      c.fillStyle = '#05080a'; c.fillRect(0, b, W, H); c.fillStyle = 'rgba(239,75,69,.1)'; for (let i = 0; i < 12; i += 1) c.fillRect(W * rnd(), b + 10 + i * 12, 60 + rnd() * 120, 2);
      c.beginPath(); c.moveTo(W * 0.05, b); c.lineTo(W * 0.15, b + 26); c.lineTo(W * 0.62, b + 26); c.lineTo(W * 0.72, b); c.closePath(); c.fillStyle = '#0a0a0a'; c.fill(); edge(c, '#3a3a3a');
      for (let r = 0; r < 3; r += 1) for (let k = 0; k < 5; k += 1) { if (r === 2 && k > 2) continue; c.fillStyle = (r + k) % 4 === 0 ? '#3a1210' : ['#101010', '#171717'][(r + k) % 2]; c.fillRect(W * 0.1 + k * 56, b - 22 - r * 22, 54, 20); c.strokeStyle = '#2c2c2c'; c.strokeRect(W * 0.1 + k * 56 + 0.5, b - 22 - r * 22 + 0.5, 54, 20); }
      c.strokeStyle = '#444'; c.lineWidth = 3; c.beginPath(); c.moveTo(W * 0.86, b + 20); c.lineTo(W * 0.86, 60); c.lineTo(W * 0.5, 60); c.stroke(); c.beginPath(); c.moveTo(W * 0.5, 60); c.lineTo(W * 0.5, 150); c.stroke(); c.fillStyle = RED; c.fillRect(W * 0.5 - 14, 150, 28, 8);
      glow(c, W * 0.86, 60, 100, RGLOW, 0.5);
    },
    bridge(c, W, H, rnd) {
      sky(c, W, H, true, rnd); const b = H * 0.66; c.fillStyle = '#060606'; c.fillRect(0, b, W, 12); c.strokeStyle = '#333'; c.lineWidth = 3;
      [W * 0.25, W * 0.75].forEach((x) => { c.beginPath(); c.moveTo(x, b + 12); c.lineTo(x, 36); c.stroke(); c.beginPath(); c.moveTo(x - 20, b + 12); c.lineTo(x, 36); c.lineTo(x + 20, b + 12); c.stroke(); });
      c.strokeStyle = '#3a3a3a'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, b - 30); c.quadraticCurveTo(W * 0.125, b - 20, W * 0.25, 36); c.quadraticCurveTo(W * 0.5, b + 10, W * 0.75, 36); c.quadraticCurveTo(W * 0.875, b - 20, W, b - 30); c.stroke();
      c.lineWidth = 1; c.strokeStyle = 'rgba(239,75,69,.35)'; for (let k = 1; k < 24; k += 1) { const t = k / 24, x = W * 0.25 + t * W * 0.5, y = (1 - t) * (1 - t) * 36 + 2 * (1 - t) * t * (b + 10) + t * t * 36; c.beginPath(); c.moveTo(x, y); c.lineTo(x, b); c.stroke(); }
      c.fillStyle = '#020202'; c.fillRect(0, b + 12, W, H); c.fillStyle = 'rgba(230,233,230,.07)'; for (let i = 0; i < 20; i += 1) c.fillRect(rnd() * W, b + 20 + rnd() * 100, 40, 1);
      glow(c, W * 0.5, b, 150, RGLOW, 0.3);
    },
    cold(c, W, H, rnd) {
      c.fillStyle = '#050607'; c.fillRect(0, 0, W, H);
      for (let r = 0; r < 4; r += 1) for (let k = 0; k < 9; k += 1) { const x = 10 + k * 70, y = 40 + r * 70; c.fillStyle = (r * 9 + k) % 7 === 0 ? '#2d0f0e' : '#0d1012'; c.fillRect(x, y, 64, 62); c.strokeStyle = '#2b3236'; c.strokeRect(x + 0.5, y + 0.5, 64, 62); c.beginPath(); c.moveTo(x + 8, y + 31); c.lineTo(x + 56, y + 31); c.stroke(); }
      c.strokeStyle = 'rgba(230,240,255,.35)'; c.lineWidth = 1; for (let i = 0; i < 18; i += 1) { const x = rnd() * W, y = rnd() * H; for (let a = 0; a < 3; a += 1) { c.beginPath(); c.moveTo(x - 6 * Math.cos(a), y - 6 * Math.sin(a)); c.lineTo(x + 6 * Math.cos(a), y + 6 * Math.sin(a)); c.stroke(); } }
      glow(c, W * 0.5, 0, 260, 'rgba(180,210,255,A)', 0.2); glow(c, W * 0.85, H, 160, RGLOW, 0.35);
    },
    roof(c, W, H, rnd) {
      M.city(c, W, H, rnd); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, W, H);
      const x = W * 0.5, y = H * 0.44; c.strokeStyle = 'rgba(239,75,69,.85)'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 90, 0, 7); c.moveTo(x - 140, y); c.lineTo(x - 20, y); c.moveTo(x + 20, y); c.lineTo(x + 140, y); c.moveTo(x, y - 140); c.lineTo(x, y - 20); c.moveTo(x, y + 20); c.lineTo(x, y + 140); c.stroke();
      c.beginPath(); c.arc(x, y, 3, 0, 7); c.fillStyle = RED; c.fill(); for (let i = -4; i <= 4; i += 1) { c.beginPath(); c.moveTo(x + i * 18, y - 5); c.lineTo(x + i * 18, y + 5); c.stroke(); }
    },
    depot(c, W, H, rnd) {
      c.fillStyle = '#060606'; c.fillRect(0, 0, W, H); const b = H * 0.8;
      for (let r = 0; r < 2; r += 1) for (let k = 0; k < 5; k += 1) { const x = 30 + k * 118 + r * 40, y = b - 54 - r * 50, w = 104; c.fillStyle = (k + r) % 3 === 0 ? '#3a1210' : ['#101010', '#171717'][(k + r) % 2]; c.fillRect(x, y, w, 48); c.strokeStyle = '#333'; c.strokeRect(x + 0.5, y + 0.5, w, 48); for (let q2 = 1; q2 < 6; q2 += 1) { c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(x + q2 * 17, y, 2, 48); } }
      c.fillStyle = '#080808'; c.fillRect(0, b, W, H); c.fillStyle = '#222'; c.fillRect(0, 70, W, 8); c.fillStyle = RED; c.fillRect(0, 66, W, 2); for (let x = 20; x < W; x += 90) { c.fillStyle = '#1a1a1a'; c.fillRect(x, 78, 4, 120); }
      glow(c, W * 0.2, 20, 160, RGLOW, 0.45); glow(c, W * 0.8, 20, 160, WGLOW, 0.25);
    },
    lab_(c, W, H, rnd) {
      c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, W, H); c.strokeStyle = '#3a3a3a'; c.lineWidth = 3;
      for (let i = 1; i < 3; i += 1) { c.beginPath(); c.moveTo(W * 0.1 + i * W * 0.267, 30); c.lineTo(W * 0.1 + i * W * 0.267, H - 60); c.moveTo(W * 0.1, 30 + i * (H - 90) / 3); c.lineTo(W * 0.9, 30 + i * (H - 90) / 3); c.stroke(); }
      for (let i = 0; i < 9; i += 1) { const x = W * 0.1 + (i % 3) * W * 0.267 + W * 0.133, y = 30 + (H - 90) / 6 + ((i / 3) | 0) * (H - 90) / 3; c.fillStyle = i === 4 ? RED : 'rgba(230,233,230,.25)'; c.fillRect(x - 14, y - 3, 28, 6); }
      glow(c, W * 0.5, H * 0.45, 200, RGLOW, 0.3);
    },
    roof(c, W, H, rnd) {
      M.city(c, W, H, rnd); c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, 0, W, H); const b = H * 0.8;
      c.fillStyle = '#0d0d0d'; c.fillRect(0, b - 30, W, 90); c.strokeStyle = '#3a3a3a'; c.strokeRect(0.5, b - 29.5, W, 12);
      [[90, 70], [330, 90], [500, 60]].forEach((p) => { c.fillStyle = '#161616'; c.fillRect(p[0], b - 30 - p[1] * 0.45, p[1], p[1] * 0.45); c.strokeStyle = '#333'; c.strokeRect(p[0] + 0.5, b - 30 - p[1] * 0.45, p[1], p[1] * 0.45); c.fillStyle = '#050505'; c.fillRect(p[0] + 8, b - 30 - p[1] * 0.45 - 4, p[1] - 16, 4); });
      c.fillStyle = RED; c.fillRect(W * 0.52, b - 120, 3, 90); glow(c, W * 0.52 + 1, b - 122, 50, RGLOW, 0.8);
    },
    rand(c, W, H, rnd) {
      c.fillStyle = '#060606'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 4; i += 1) { const x = 50 + i * 140, y = 70 + (i % 2) * 40; c.fillStyle = '#0d0d0d'; c.fillRect(x, y, 112, 112); c.strokeStyle = i === 1 ? RED : '#3a3a3a'; c.lineWidth = 2; c.strokeRect(x + 0.5, y + 0.5, 112, 112); c.fillStyle = i === 1 ? RED : 'rgba(230,233,230,.55)'; c.font = '900 76px ' + FONT; c.textAlign = 'center'; c.fillText('?', x + 56, y + 84); }
      glow(c, W * 0.5, H * 0.5, 240, RGLOW, 0.25);
    },
    vote(c, W, H, rnd) {
      c.fillStyle = '#060606'; c.fillRect(0, 0, W, H);
      [0.7, 0.45, 0.9, 0.3].forEach((v, i) => { const x = 60 + i * 135, h = 190 * v; c.fillStyle = i === 2 ? RED : '#1b1b1b'; c.fillRect(x, 250 - h, 100, h); c.strokeStyle = '#444'; c.strokeRect(x + 0.5, 250 - h + 0.5, 100, h); c.fillStyle = '#e6e9e6'; for (let k = 0; k < Math.round(v * 5); k += 1) c.fillRect(x + 12 + k * 17, 260, 9, 12); });
      glow(c, W * 0.75, H * 0.4, 220, RGLOW, 0.3);
    },
    ffa(c, W, H, rnd) {
      c.fillStyle = '#060606'; c.fillRect(0, 0, W, H); const x = W * 0.58, y = H * 0.48;
      for (let i = 0; i < 6; i += 1) { const a = i * Math.PI / 3 + 0.4, px = x + Math.cos(a) * 170, py = y + Math.sin(a) * 90 + 60; person(c, px, py, 74, px < x ? 1 : -1, '#0c0c0c', true); c.strokeStyle = 'rgba(239,75,69,.45)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px, py - 64); c.lineTo(x, y); c.stroke(); }
      c.strokeStyle = RED; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 34, 0, 7); c.moveTo(x - 60, y); c.lineTo(x - 14, y); c.moveTo(x + 14, y); c.lineTo(x + 60, y); c.moveTo(x, y - 60); c.lineTo(x, y - 14); c.moveTo(x, y + 14); c.lineTo(x, y + 60); c.stroke(); glow(c, x, y, 190, RGLOW, 0.3);
    },
    team(c, W, H, rnd) {
      c.fillStyle = '#060606'; c.fillRect(0, 0, W, H);
      c.save(); c.beginPath(); c.moveTo(W * 0.56, 0); c.lineTo(W, 0); c.lineTo(W, H); c.lineTo(W * 0.44, H); c.closePath(); c.fillStyle = 'rgba(239,75,69,.16)'; c.fill(); c.restore();
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(W * 0.56, 0); c.lineTo(W * 0.44, H); c.stroke();
      for (let i = 0; i < 3; i += 1) { person(c, W * 0.12 + i * 66, H * 0.84 - i * 14, 90 - i * 8, 1, '#0d0d0d', true); person(c, W * 0.88 - i * 66, H * 0.84 - i * 14, 90 - i * 8, -1, '#1a0807', true); }
      glow(c, W * 0.5, H * 0.5, 160, WGLOW, 0.22);
    },
    duel(c, W, H, rnd) {
      c.fillStyle = '#060606'; c.fillRect(0, 0, W, H);
      person(c, W * 0.2, H * 0.88, 230, 1, '#0b0b0b', true); person(c, W * 0.8, H * 0.88, 230, -1, '#1a0807', true);
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); let y = 0, x = W * 0.5; c.moveTo(x, y); while (y < H) { x = W * 0.5 + (rnd() - 0.5) * 24; y += 24; c.lineTo(x, y); } c.stroke();
      glow(c, W * 0.5, H * 0.5, 200, RGLOW, 0.5); glow(c, W * 0.5, H * 0.5, 80, WGLOW, 0.5);
    },
    hl(c, W, H, rnd) {
      c.fillStyle = '#050505'; c.fillRect(0, 0, W, H);
      glow(c, W * 0.5, H * 0.34, 260, WGLOW, 0.22);
      c.fillStyle = '#161616'; c.beginPath(); c.ellipse(W * 0.5, H * 0.66, W * 0.34, H * 0.15, 0, 0, 7); c.fill(); edge(c, '#2f2f2f');
      for (let i = 0; i < 5; i += 1) {
        const a = Math.PI * (0.12 + i * 0.19), x = W * 0.5 + Math.cos(a + Math.PI) * W * 0.34, y = H * 0.66 - Math.sin(a) * H * 0.15 - 14;
        c.fillStyle = '#0b0b0b'; c.fillRect(x - 17, y - 6, 34, 20); c.fillStyle = i === 2 ? RED : 'rgba(230,233,230,.55)'; c.fillRect(x - 14, y - 3, 28, 12);
        person(c, x, y - 12, 62, 1, '#0a0a0a', false);
      }
      c.fillStyle = RED; c.font = '700 64px ' + FONT; c.textAlign = 'center'; c.fillText('?', W * 0.5, H * 0.6);
      c.textAlign = 'left';
    },
    hl(c, W, H, rnd) {
      c.fillStyle = '#050505'; c.fillRect(0, 0, W, H);
      c.beginPath(); c.ellipse(W * 0.56, H * 0.62, 300, 120, 0, 0, 7); c.fillStyle = '#0d0d0d'; c.fill(); edge(c, '#3a3a3a');
      c.beginPath(); c.ellipse(W * 0.56, H * 0.62, 250, 92, 0, 0, 7); c.strokeStyle = 'rgba(239,75,69,.4)'; c.stroke();
      [[0.38, 0.5, -0.25], [0.5, 0.46, -0.08], [0.62, 0.46, 0.1], [0.74, 0.5, 0.28]].forEach((p, i) => {
        c.save(); c.translate(W * p[0], H * p[1]); c.rotate(p[2]); c.fillStyle = i === 3 ? RED : '#e9e9e9'; c.fillRect(-26, -38, 52, 76); c.strokeStyle = '#000'; c.strokeRect(-25.5, -37.5, 52, 76);
        c.fillStyle = i === 3 ? '#fff' : '#111'; c.font = '700 26px ' + FONT; c.textAlign = 'center'; c.fillText(['K', '7', '2', 'A'][i], 0, 9); c.restore();
      });
      for (let i = 0; i < 5; i += 1) { c.fillStyle = i % 2 ? RED : '#bbb'; c.fillRect(W * 0.2 + i * 3, H * 0.74 - i * 6, 30, 5); }
      c.fillStyle = RED; c.beginPath(); c.moveTo(W * 0.86, H * 0.2); c.lineTo(W * 0.9, H * 0.3); c.lineTo(W * 0.82, H * 0.3); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(W * 0.86, H * 0.5); c.lineTo(W * 0.82, H * 0.4); c.lineTo(W * 0.9, H * 0.4); c.closePath(); c.fill();
      glow(c, W * 0.56, H * 0.4, 220, RGLOW, 0.25);
    },
    story(c, W, H, rnd) {
      M.tunnel(c, W, H, rnd, 0, false); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(0,0,0,.8)'; for (let i = 0; i < 16; i += 1) { c.fillRect(i * 42 + 6, 6, 24, 12); c.fillRect(i * 42 + 6, H - 18, 24, 12); }
    },
    finale(c, W, H, rnd) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#000'); g.addColorStop(0.62, '#120505'); g.addColorStop(1, '#000'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      const x = W * 0.66, y = H * 0.56, R = 130;
      glow(c, x, y, 330, RGLOW, 0.38);
      const sg = c.createRadialGradient(x, y - 30, 10, x, y, R); sg.addColorStop(0, '#ff9a8c'); sg.addColorStop(0.5, '#ef4b45'); sg.addColorStop(1, '#5a0f0d');
      c.save(); c.beginPath(); c.rect(0, 0, W, H * 0.62); c.clip(); c.beginPath(); c.arc(x, y, R, 0, 7); c.fillStyle = sg; c.fill(); c.restore();
      c.fillStyle = '#000'; for (let i = 0; i < 6; i += 1) c.fillRect(x - R - 4, H * 0.62 - 8 - i * 16 - i * i * 0.9, R * 2 + 8, 2 + i * 0.9);
      c.strokeStyle = 'rgba(241,230,200,.65)'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, R + 22, Math.PI, 0); c.stroke(); for (let i = 0; i <= 36; i += 1) { const a = Math.PI + i * Math.PI / 36, l = i % 6 === 0 ? 14 : 6; c.beginPath(); c.moveTo(x + Math.cos(a) * (R + 22), y + Math.sin(a) * (R + 22)); c.lineTo(x + Math.cos(a) * (R + 22 + l), y + Math.sin(a) * (R + 22 + l)); c.stroke(); }
      c.fillStyle = '#000'; c.fillRect(0, H * 0.62, W, H);
      c.strokeStyle = 'rgba(239,75,69,.5)'; c.lineWidth = 1; for (let i = -12; i <= 12; i += 1) { c.beginPath(); c.moveTo(x + i * 6, H * 0.62); c.lineTo(x + i * 70, H); c.stroke(); } for (let k = 1; k < 7; k += 1) { const yy = H * 0.62 + Math.pow(k / 7, 2) * H * 0.38; c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy); c.stroke(); }
      c.fillStyle = '#fff'; c.fillRect(x - 0.5, 0, 1, H * 0.62); person(c, W * 0.2, H * 0.62 + 6, 130, 1, '#000', true);
      c.strokeStyle = 'rgba(241,230,200,.5)'; c.lineWidth = 1; c.strokeRect(10.5, 10.5, W - 21, H - 21); c.strokeRect(15.5, 15.5, W - 31, H - 31);
    }
  };

  // ------------------------------------------------------------------ подписи, рамка, рендер
  function frame(c, W, H, key, info) {
    const v = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.72)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(0,0,0,.16)'; for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
    c.fillStyle = RED; c.save(); c.beginPath(); c.moveTo(0, H - 82); c.lineTo(10, H - 82); c.lineTo(10, H); c.lineTo(0, H); c.fill(); c.restore();
    c.strokeStyle = 'rgba(230,233,230,.55)'; c.lineWidth = 1.4;
    [[10, 10, 1, 1], [W - 10, 10, -1, 1], [10, H - 10, 1, -1], [W - 10, H - 10, -1, -1]].forEach((p) => { c.beginPath(); c.moveTo(p[0], p[1] + p[3] * 16); c.lineTo(p[0], p[1]); c.lineTo(p[0] + p[2] * 16, p[1]); c.stroke(); });
    c.textBaseline = 'alphabetic';
    if (info.num) {
      const num = String(info.num).padStart(2, '0'); c.font = '900 118px ' + FONT; c.textAlign = 'left';
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.85)'; c.strokeText(num, 24, H - 42);
      const g = c.createLinearGradient(0, H - 150, 0, H - 40); g.addColorStop(0, '#ffffff'); g.addColorStop(1, info.fin ? '#d9c79a' : '#9a9a9a'); c.fillStyle = g; c.fillText(num, 24, H - 42);
      c.font = '700 13px ' + FONT; c.fillStyle = RED; c.fillText('TASK', 26, H - 168 + 50);
    }
    c.textAlign = info.num ? 'left' : 'left';
    const tx = info.num ? 24 : 26;
    c.font = '700 ' + (info.num ? 21 : 34) + 'px ' + FONT; c.fillStyle = '#f2f2f2'; c.shadowColor = '#000'; c.shadowBlur = 8;
    const t = info.title.length > 22 && info.num ? info.title.slice(0, 21) + '…' : info.title;
    c.fillText(t, tx, H - (info.num ? 18 : 46)); c.shadowBlur = 0;
    if (info.sub) { c.font = '700 12px ' + FONT; c.fillStyle = RED; c.fillText(info.sub, tx, H - (info.num ? 168 + 28 : 24)); }
    if (info.tag) { c.textAlign = 'right'; c.font = '700 11px ' + FONT; c.fillStyle = 'rgba(230,233,230,.7)'; c.fillText(info.tag, W - 22, 28); }
  }

  function finale(c, W, H, rnd) {
    M.finale(c, W, H, rnd);
    const v = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.7)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    c.font = '900 150px ' + FONT; const g = c.createLinearGradient(0, 60, 0, 220); g.addColorStop(0, '#fffbe9'); g.addColorStop(0.55, '#d9c79a'); g.addColorStop(1, '#6d5a2c');
    c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.9)'; c.strokeText('48', 30, 200); c.fillStyle = g; c.fillText('48', 30, 200);
    c.font = '700 14px ' + FONT; c.fillStyle = RED; c.fillText('FINAL TASK  //  NEXA INDUSTRIES', 34, 54);
    c.font = '700 26px ' + FONT; c.fillStyle = '#f4efe0'; c.shadowColor = '#000'; c.shadowBlur = 10; c.fillText('REMEMBER.', 34, H - 62); c.fillText('NOT A WORD.', 34, H - 30); c.shadowBlur = 0;
    c.fillStyle = RED; c.fillRect(34, H - 112, 70, 3);
    c.textAlign = 'right'; c.font = '700 11px ' + FONT; c.fillStyle = 'rgba(241,230,200,.8)'; c.fillText('CO-OP  ·  2–6 PLAYERS', W - 24, 30);
  }

  function render(key, w, h) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    c.setTransform(w / 640, 0, 0, h / 360, 0, 0);
    const W = 640, H = 360;
    let info, motif, rnd, day = false;
    if (key.indexOf('m:') === 0) {
      const id = key.slice(2) | 0, meta = (window.Missions && Missions._core && Missions._core.MISSIONS && Missions._core.MISSIONS[id]) || {};
      info = { num: id, title: String(meta.title || 'MISSION ' + id).toUpperCase(), sub: '', tag: 'CO-OP' };
      motif = MOTIF[id] || 'tunnel'; rnd = mulberry(id * 7919 + 13); day = !!DAY[id] || meta.theme === 'day';
      if (id === 48) { finale(c, W, H, rnd); noise(c, w, h, mulberry(48), 0.06); return cv; }
    } else if (key.indexOf('map:') === 0) {
      const nm = key.slice(4), t = { depot: ['DEPOT', 'depot'], lab: ['LAB', 'lab_'], roof: ['ROOF', 'roof'], hall: ['TRAINING HALL', 'range'], yard: ['SCRAPYARD', 'yard'], rand: ['RANDOM MAP', 'rand'], vote: ['MAP VOTE', 'vote'] }[nm] || ['MAP', 'range'];
      info = { num: 0, title: t[0], sub: 'PVP MAP', tag: 'NEXA/OS' }; motif = t[1]; rnd = mulberry(hash(key));
    } else {
      const m = MODES[key.slice(5)] || MODES.sandbox; info = { num: 0, title: m.t, sub: m.s, tag: 'NEXA/OS' }; motif = m.m; rnd = mulberry(hash(key));
    }
    sky(c, W, H, day, rnd);
    const bx = W * (0.15 + rnd() * 0.7);
    beams(c, W, H, rnd, 3 + (rnd() * 3 | 0), bx, -20, 1.2 + rnd() * 0.9);
    (M[motif] || M.tunnel)(c, W, H, rnd, 0, motif === 'tunnel' && rnd() < 0.5);
    if (motif === 'tunnel' && info.num && (info.num === 30 || info.num === 42)) { /* бункер: усиленная арка */ }
    beams(c, W, H, rnd, 2, W * rnd(), -30, 1.5 + rnd() * 0.6);
    c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(239,75,69,.5)'; const sy = 30 + rnd() * 120; c.beginPath(); c.moveTo(0, sy); c.lineTo(W, sy - 60); c.lineTo(W, sy - 54); c.lineTo(0, sy + 6); c.closePath(); c.fill(); c.restore();
    frame(c, W, H, key, info);
    noise(c, w, h, mulberry(hash(key) + 5), 0.05);
    return cv;
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function get(key, w, h) {
    const k = key + '|' + w + 'x' + h; let cv = cache.get(k);
    if (!cv) { try { cv = render(key, w, h); } catch (e) { cv = document.createElement('canvas'); cv.width = w; cv.height = h; if (!ModeCovers.err) { ModeCovers.err = 1; console.warn('[covers]', e); } } cache.set(k, cv); if (cache.size > 160) cache.delete(cache.keys().next().value); }
    return cv;
  }
  function paint(canvas, key) {
    const src = get(key, canvas.width, canvas.height), c = canvas.getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height); c.drawImage(src, 0, 0); canvas.dataset.cv = key; canvas.dataset.ok = '1';
  }
  const queue = []; let busy = false;
  function pump() {
    busy = true;
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 10) { const it = queue.shift(); if (it.c.isConnected && it.c.dataset.ok !== '1') paint(it.c, it.k); }
    if (queue.length) requestAnimationFrame(pump); else busy = false;
  }
  function lazy(canvas, key, root) {
    if (canvas.dataset.ok === '1') return;
    const go = () => { queue.push({ c: canvas, k: key }); if (!busy) requestAnimationFrame(pump); };
    if (!window.IntersectionObserver) { go(); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { root: root || null, rootMargin: '160px' });
    io.observe(canvas);
  }

  const ModeCovers = window.ModeCovers = { get, paint, lazy, MODES, MOTIF, M, clear() { cache.clear(); } };
}());
