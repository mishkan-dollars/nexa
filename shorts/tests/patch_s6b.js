const fs = require('fs');
let s = fs.readFileSync('tools/shorts/s5.js', 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('nf: ' + a.slice(0, 60)); s = s.replace(a, b); };
rep("r.box(0, 0.65, PZ - 9, 3.2, 1.3, 0.9, 0x7a6a50, true)", "r.box(0, 0.5, PZ - 6, 2.6, 1.0, 0.7, 0x7a6a50, true)");
rep("pro = r.enemy('grunt', 0.6, PZ - 11.5,", "pro = r.enemy('grunt', 0.5, PZ - 8.2,");
fs.writeFileSync('tools/shorts/s5.js', s);
console.log('ok');
