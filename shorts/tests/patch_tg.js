const fs = require('fs');
let c = fs.readFileSync('tools/shorts/cap.js', 'utf8');
const rep = (s, a, b) => { if (!s.includes(a)) throw new Error('nf: ' + a.slice(0, 60)); return s.replace(a, b); };
c = rep(c, "if (window.Cap && window.Cap.__v === 5) return;\n  const Cap = window.Cap = { __v: 5 };", "if (window.Cap && window.Cap.__v === 6) return;\n  const Cap = window.Cap = { __v: 6 };");
// Cap.tag: опорная точка слева (o.left) — чтобы стопка плашек выравнивалась по левому краю
c = rep(c, "    const w = ctx.measureText(text).width, padX = size * 0.45, h = size * 1.35;\n    ctx.globalAlpha", "    const w = ctx.measureText(text).width, padX = size * 0.45, h = size * 1.35;\n    if (o.left !== undefined) x = o.left + padX + w / 2;\n    ctx.globalAlpha");
// финальная карточка: ТГК с релизом сразу под датой
const a = c.indexOf("    Cap.text(ctx, o.title || 'HIGH / LOW'");
const b = c.indexOf("    ctx.restore();\n  };\n})();");
c = c.slice(0, a) + `    Cap.text(ctx, o.title || 'HIGH / LOW', { y: 0.23, size: 180, k: clamp((t - 0.1) / 0.5, 0, 1), color: '#fff' });
    Cap.text(ctx, o.sub || 'NEXA/OS', { y: 0.295, size: 62, k: clamp((t - 0.2) / 0.5, 0, 1), color: '#9a9aa2', pop: false });
    Cap.text(ctx, o.beta || '*БЕТА-ТЕСТ*', { y: 0.395, size: 124, k: clamp((t - 0.35) / 0.5, 0, 1) });
    Cap.text(ctx, o.date || '15 ОКТЯБРЯ', { y: 0.49, size: 200, k: clamp((t - 0.55) / 0.5, 0, 1), color: '#fff' });
    Cap.text(ctx, o.tg || 'тгк с релизом: *nexaindustries*', { y: 0.585, size: 64, k: clamp((t - 0.8) / 0.5, 0, 1), color: '#fff', pop: false });
    Cap.text(ctx, o.cta || 'Публично и *бесплатно*\nиграй прямо в браузере', { y: 0.69, size: 74, k: clamp((t - 1.0) / 0.5, 0, 1), color: '#e8e8ec', pop: false });
` + c.slice(b);
fs.writeFileSync('tools/shorts/cap.js', c);

let s = fs.readFileSync('tools/shorts/scn.js', 'utf8');
s = rep(s, "    Cap.tag(ctx, text || 'БЕТА-ТЕСТ · 15 ОКТЯБРЯ', W * 0.36, H * 0.075, { size: 40, alpha: clamp(t / 0.3, 0, 1) });",
  "    const al = clamp(t / 0.3, 0, 1), L = W * 0.06;\n    Cap.tag(ctx, text || 'БЕТА-ТЕСТ · 15 ОКТЯБРЯ', 0, H * 0.062, { size: 40, alpha: al, left: L });\n    Cap.tag(ctx, 'тгк с релизом: nexaindustries', 0, H * 0.0975, { size: 31, alpha: al, left: L, accent: '#fff', bg: 'rgba(8,8,10,0.78)' });");
// подписи чуть ниже, чтобы не налезать на вторую строку плашки (v5 отключает через noShift)
s = rep(s, "      Cap.text(ctx, c.text, Object.assign({}, c, { k: k, alpha: out }));", "      Cap.text(ctx, c.text, Object.assign({}, c, { k: k, alpha: out, y: (c.y === undefined ? 0.205 : c.y) + (c.noShift ? 0 : 0.03) }));");
fs.writeFileSync('tools/shorts/scn.js', s);
console.log('patched');
