const fs = require('fs');
let s = fs.readFileSync('tools/shorts/s6.js', 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('nf: ' + a.slice(0, 60)); s = s.replace(a, b); };
rep("Interiors.test(r, { side: 1, scene: 'pc', z: 6, seed: 3 })", "Interiors.test(r, { side: 1, scene: 'repair', z: 6, seed: 4 })");
rep("      Scn.advance(1 / FPS);\n      r.blurX = 0; r.blurY = 0;", "      // после выбитой двери целимся в жильца: техник сдаётся и опускается на колени\n      if (done.a && tA === null) tA = t;\n      if (tA !== null && t < 8.6 && t > tA + 0.6) {\n        const occ = roomA.occ && roomA.occ[0];\n        if (occ && !occ.dead) { const g = occ.n.g.position, dx = g.x - r.p.x, dz = g.z - r.p.z; r.p.yaw = Math.atan2(-dx, -dz); r.p.pitch = -0.05; r.aimWant = true; }\n      }\n      if (t >= 8.6) r.aimWant = false;\n      Scn.advance(1 / FPS);\n      r.blurX = 0; r.blurY = 0;");
rep("let done = { a: false, b: false }, pA = null, pB = null;", "let done = { a: false, b: false }, pA = null, pB = null, tA = null;");
fs.writeFileSync('tools/shorts/s6.js', s);
console.log('ok');
