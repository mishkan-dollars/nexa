const fs = require('fs');
let s = fs.readFileSync('tools/shorts/s4.js', 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('nf: ' + a.slice(0, 70)); s = s.split(a).join(b); };
rep("Scn.enter('plaza', 0, 0, 0); Scn.clear();", "Scn.enter('wh', 0, 15, 0); Scn.clear();");
rep("const reset = (z, f) => {", "const PZ = 15;\n    const reset = (z, f) => {");
rep("reset(10, false); Scn.guard('grunt', 0, 8.3, 0); } },\n      { t: 0.5", "reset(PZ, false); Scn.guard('grunt', 0, PZ - 1.7, 0); } },\n      { t: 0.5");
rep("reset(10, true); Scn.guard('grunt', 0, 8.8, 0); } },", "reset(PZ, true); Scn.guard('grunt', 0, PZ - 1.3, 0); } },");
rep("reset(10, false); Scn.guard('grunt', 0, 8.2, 0); } },", "reset(PZ, false); Scn.guard('grunt', 0, PZ - 1.7, 0); } },");
rep("reset(10, false); Scn.guard('grunt', 0, 1.6, 0); r.keys.KeyW", "reset(PZ, false); Scn.guard('grunt', 0, PZ - 8.4, 0); r.keys.KeyW");
rep("reset(10, true); Scn.guard('grunt', 0, 3.6, 0); r.keys.KeyW", "reset(PZ, true); Scn.guard('grunt', 0, PZ - 6.4, 0); r.keys.KeyW");
rep("      // 5 — блок и контрудар\n      { t: 17.2, fn: () => { reset(10, true); const e = r.enemy('rusher', 0, 3, { drop: false, yaw: 0, tag: 'film', exact: true }); e.spawnT = 0; } },\n      { t: 18.0, fn: () => { r.aimWant = true; } },\n      { t: 19.4, fn: () => { r.aimWant = false; r.pressFire(); } }",
    "      // 5 — наклоны Z / X\n      { t: 17.2, fn: () => { reset(PZ, false); Scn.guard('grunt', 0, PZ - 9, 0); } },\n      { t: 17.9, fn: () => key('KeyZ', true) }, { t: 19.0, fn: () => key('KeyZ', false) },\n      { t: 19.2, fn: () => key('KeyX', true) }, { t: 20.3, fn: () => key('KeyX', false) }");
fs.writeFileSync('tools/shorts/s4.js', s);
console.log('ok');
