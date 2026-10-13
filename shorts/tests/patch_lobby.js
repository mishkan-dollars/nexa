const fs = require('fs');
let s = fs.readFileSync('tools/shorts/scn.js', 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('nf: ' + a.slice(0, 60)); s = s.replace(a, b); };
rep("      if (s.reg) R = S.enter(s.reg, 0, 0, 0);\n      S.clear();", "      if (s.reg) R = S.enter(s.reg, 0, 0, 0);\n      if (!s.lobby) S.clear();");
rep("      S.cam(lerp(s.a[0], s.b[0], k) + Math.sin(t * 8.7) * sh,", "      if (!s.lobby) S.cam(lerp(s.a[0], s.b[0], k) + Math.sin(t * 8.7) * sh,");
rep("      if (s.tick) s.tick(t, k, S.W.R[s.reg]);\n      S.advance((s.speed === undefined ? 1 : s.speed) / FPS);\n      const ctx = S.frame({ vig: o.vig === undefined ? 0.5 : o.vig });",
"      if (s.tick) s.tick(t, k, S.W.R[s.reg]);\n      let ctx;\n      if (s.lobby) {                                    // 3D-фон лобби игры (js/lobby3d.js), шагаем сами\n        try { Lobby3D._step(1 / FPS, 1); } catch (e) { /* лобби не готово */ }\n        const lc = document.querySelector('#lobby3d canvas');\n        Cap.blit(null, { canvas: lc, zoom: s.zoom || 1 });\n        ctx = Cap.S.ctx; Cap.vignette(ctx, 0.45);\n      } else {\n        S.advance((s.speed === undefined ? 1 : s.speed) / FPS);\n        ctx = S.frame({ vig: o.vig === undefined ? 0.5 : o.vig });\n      }");
fs.writeFileSync('tools/shorts/scn.js', s);
console.log('ok');
