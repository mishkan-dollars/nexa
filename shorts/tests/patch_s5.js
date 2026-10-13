const fs = require('fs');
let s = fs.readFileSync('tools/shorts/s5.js', 'utf8');
const a = "a: [-9, 5.5, 1.0], b: [-9, 5.0, 0.5], la: [0, 0.6, 0], lb: [0, 0.6, 0], fov: 62, speed: 1.0, sh: 0.004,";
if (!s.includes(a)) throw new Error('nf');
s = s.replace(a, "a: [0, 15.5, 3.2], b: [0, 14.5, 3.2], la: [0, 0, 0.2], lb: [0, 0, 0.2], fov: 55, speed: 1.0, sh: 0.003,");
fs.writeFileSync('tools/shorts/s5.js', s);
console.log('ok');
