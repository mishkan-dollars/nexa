// NEXA: титры и эффекты трейлера (2D-холст). Не зависит от игры: тот же код рисует чёрные вставки и накладки на геймплей.
// Все эффекты привязаны к ударам баса: Fx.punch(t, hits) = 1 в момент удара и экспоненциальное затухание.
(() => {
  'use strict';
  if (window.Fx && window.Fx.__v === 1) return;
  const Fx = window.Fx = { __v: 1, RED: '#ff2a2a', FONT: '"Oswald","Teko","Arial Narrow",Inter,Arial,sans-serif' };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  Fx.clamp = clamp; Fx.hash = hash;

  Fx.punch = (t, hits, rate) => {
    let best = 0;
    for (let i = 0; i < hits.length; i += 1) { const s = t - hits[i]; if (s >= 0 && s < 1.5) best = Math.max(best, Math.exp(-s * (rate || 9))); }
    return best;
  };
  // «*слово*» красным; возвращает [{t, red}]
  const segs = (line) => { const out = []; String(line).split('*').forEach((p, i) => { if (p) out.push({ t: p, red: i % 2 === 1 }); }); return out; };

  // зерно плёнки: заранее нарисованный шум, смещается на каждом кадре
  let grain = null;
  const grainCanvas = () => {
    if (grain) return grain;
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d'), d = g.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.floor(hash(i * 0.37) * 255); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
    return (grain = c);
  };
  Fx.grain = (ctx, frame, alpha) => {
    const W = ctx.canvas.width, H = ctx.canvas.height, c = grainCanvas();
    ctx.save(); ctx.globalAlpha = alpha === undefined ? 0.06 : alpha; ctx.globalCompositeOperation = 'overlay';
    const ox = Math.floor(hash(frame * 1.7) * 256), oy = Math.floor(hash(frame * 2.3) * 256), s = Math.max(1, Math.round(W / 640));
    for (let y = -oy * s; y < H; y += 256 * s) for (let x = -ox * s; x < W; x += 256 * s) ctx.drawImage(c, x, y, 256 * s, 256 * s);
    ctx.restore();
  };
  Fx.vignette = (ctx, a) => {
    const W = ctx.canvas.width, H = ctx.canvas.height, g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.55);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + (a === undefined ? 0.5 : a) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };
  Fx.flash = (ctx, a, col) => { if (a <= 0.003) return; ctx.save(); ctx.globalAlpha = clamp(a, 0, 1); ctx.fillStyle = col || '#fff'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore(); };

  // ширина строки с учётом разрядки и подсветки; рисует построчно по центру (cx, cy)
  const drawLines = (ctx, lines, cx, cy, size, o, mode) => {
    const lh = size * (o.lh || 1.05), th = lh * lines.length, track = (o.track || 0) * size;
    ctx.font = (o.weight || 700) + ' ' + size + 'px ' + Fx.FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    lines.forEach((ln, i) => {
      const parts = segs(ln), y = cy - th / 2 + lh * (i + 0.5);
      let w = 0; parts.forEach((s) => { w += ctx.measureText(s.t).width + track * s.t.length; });
      let x = cx - w / 2;
      parts.forEach((s) => {
        ctx.fillStyle = mode === 'r' ? '#ff1a1a' : mode === 'c' ? '#18e8ff' : (s.red ? Fx.RED : (o.color || '#fff'));
        for (const ch of s.t) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + track; }
      });
    });
    return th;
  };
  // подбираем кегль под ширину
  const fitSize = (ctx, lines, size, maxW, o) => {
    ctx.font = (o.weight || 700) + ' ' + size + 'px ' + Fx.FONT;
    const track = (o.track || 0), wmax = Math.max.apply(null, lines.map((ln) => { let w = 0; segs(ln).forEach((s) => { w += ctx.measureText(s.t).width + track * size * s.t.length; }); return w; }));
    return wmax > maxW ? Math.floor(size * maxW / wmax) : size;
  };

  // Карточка с титром «под бас». spec: {text, size, y, sub, subSize, color, track}, age — секунд с момента появления слова,
  // hits — моменты ударов (с карточки) для общей пульсации, t — время на карточке, frame — номер кадра (дрожь/зерно).
  // Эффекты удара p (1 → 0 за ≈0.25 с): слово «вбивается» (масштаб 1.32 → 1), RGB-разнос, дрожь, вспышка фона, глитч-полосы, ударная линия.
  Fx.card = (ctx, spec, age, p, frame, o) => {
    o = o || {};
    const W = ctx.canvas.width, H = ctx.canvas.height, lines = String(spec.text).split('\n');
    const size = fitSize(ctx, lines, (spec.size || 0.2) * H, (spec.maxW || 0.88) * W, spec), cx = W / 2 + (spec.x || 0) * W, cy = H * (spec.y === undefined ? 0.5 : spec.y);
    const inK = clamp(age / 0.11, 0, 1), snap = 1 + 0.34 * Math.pow(1 - inK, 2) + 0.05 * p, creep = 1 + 0.035 * clamp(age / 0.9, 0, 1);
    const sc = snap * creep, shake = (spec.shake === undefined ? 1 : spec.shake) * p * H * 0.006;
    const jx = (hash(frame * 3.1) - 0.5) * 2 * shake, jy = (hash(frame * 5.7) - 0.5) * 2 * shake;
    ctx.save();
    // вспышка фона и ударная линия
    if (p > 0.02) {
      const g = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, W * 0.55);
      g.addColorStop(0, 'rgba(255,255,255,' + (0.16 * p).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const lw = W * clamp(1 - p * 0.7, 0.3, 1);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * p).toFixed(3) + ')'; ctx.fillRect((W - lw) / 2, cy + size * 0.62, lw, Math.max(2, H * 0.003));
    }
    const draw = (mode, dx, alpha) => {
      ctx.save(); ctx.globalAlpha = alpha; if (mode) ctx.globalCompositeOperation = 'lighter';
      ctx.translate(cx + jx + dx, cy + jy); ctx.scale(sc, sc * (1 - 0.04 * p));
      drawLines(ctx, lines, 0, 0, size, spec, mode);
      ctx.restore();
    };
    const split = (spec.split === undefined ? 1 : spec.split) * (p * 0.012 + (1 - inK) * 0.01) * W;
    if (split > 0.5) { draw('r', -split, 0.9); draw('c', split, 0.9); draw(null, 0, 0.95); } else draw(null, 0, 1);
    // подпись под словом
    if (spec.sub) {
      const ss = (spec.subSize || 0.042) * H, a = clamp((age - 0.12) / 0.2, 0, 1);
      ctx.globalAlpha = a * 0.9; ctx.fillStyle = spec.subColor || '#9a9aa2';
      ctx.font = '500 ' + ss + 'px ' + Fx.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const sub = String(spec.sub), track = ss * 0.32;
      let w = 0; for (const ch of sub) w += ctx.measureText(ch).width + track;
      let x = cx - w / 2 + jx; ctx.textAlign = 'left';
      for (const ch of sub) { ctx.fillText(ch, x, cy + size * 0.78 + ss + jy); x += ctx.measureText(ch).width + track; }
    }
    // глитч-полосы при сильном ударе
    if (p > 0.55 && spec.glitch !== false) {
      const n = 2 + Math.floor(hash(frame * 9.1) * 3);
      for (let i = 0; i < n; i += 1) {
        const y = Math.floor(hash(frame * 11.3 + i) * (H - 40)), h = 10 + Math.floor(hash(frame * 13.7 + i) * H * 0.05), dx = (hash(frame * 17.9 + i) - 0.5) * W * 0.06 * p;
        ctx.drawImage(ctx.canvas, 0, y, W, h, dx, y, W, h);
      }
    }
    ctx.restore();
  };

  // чёрный фон с лёгкой виньеткой и зерном (под карточки)
  Fx.black = (ctx, frame, o) => {
    o = o || {};
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  };
  Fx.finish = (ctx, frame, o) => {
    o = o || {};
    Fx.vignette(ctx, o.vig === undefined ? 0.35 : o.vig);
    Fx.grain(ctx, frame, o.grain === undefined ? 0.07 : o.grain);
  };
})();

// ================================================================== накладка трейлера на кадры геймплея (вызывается из Trl.runScene при финальном рендере)
// Только на акцентах трека (accents — секунды): короткая вспышка и лёгкий «пинок» масштаба. Камера не дёргается: пульс 0.8 % и быстро гаснет.
(() => {
  if (!window.Trl) return;
  const Trl = window.Trl;
  Trl.post = { accents: [], flash: 0.14, pulse: 0.008, rate: 12 };
  Trl.setPost = (p) => Object.assign(Trl.post, p || {});
  let tmp = null;
  Trl.postFx = (ctx, g) => {
    const P = Trl.post, W = ctx.canvas.width, H = ctx.canvas.height;
    let a = 0;
    for (let i = 0; i < P.accents.length; i += 1) { const s = g - P.accents[i]; if (s >= 0 && s < 0.4) a = Math.max(a, Math.exp(-s * P.rate)); }
    if (a < 0.02) return;
    if (P.pulse > 0) {
      tmp = tmp || document.createElement('canvas'); tmp.width = W; tmp.height = H; tmp.getContext('2d').drawImage(ctx.canvas, 0, 0);
      const sc = 1 + P.pulse * a; ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.drawImage(tmp, -W / 2, -H / 2); ctx.restore();
    }
    if (P.flash > 0) Fx.flash(ctx, P.flash * a, '#fff');
  };
})();
