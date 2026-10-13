// все реплики финала 48 из js/f48*.js, finale48.js: [файл:строка, говорящий, текст, длительность]
const fs = require('fs'), path = require('path');
const files = fs.readdirSync('js').filter((f) => /^f48.*\.js$|^finale48\.js$/.test(f));
const out = [];
const ID = { DIC: 'DICTOR', GRL: 'GIRL', HND: 'HANDLER', HEAD: 'HEAD', MAN: 'MAN' };
files.forEach((f) => {
  const lines = fs.readFileSync(path.join('js', f), 'utf8').split('\n');
  lines.forEach((ln, i) => {
    // [DIC, 'text', 2.3]
    for (const m of ln.matchAll(/\[\s*([A-Z_]{2,8}|'[A-Z ]+')\s*,\s*(['"`])((?:\.|(?!\2).)+)\2\s*,\s*([0-9.]+)\s*\]/g)) out.push([f + ':' + (i + 1), m[1].replace(/'/g, ''), m[3], m[4]]);
    // K.say(r, 'text', 2.4)   r.say(DIC, 'text', 3)
    for (const m of ln.matchAll(/\b(?:K\.say|r\.say|rr\.say)\(\s*(?:r\s*,\s*)?([A-Z_]{2,8}|'[A-Z ]+')?\s*,?\s*(['"`])((?:\.|(?!\2).)+)\2\s*,\s*([0-9.]+)/g)) out.push([f + ':' + (i + 1), (m[1] || 'DICTOR').replace(/'/g, ''), m[3], m[4]]);
  });
});
const seen = new Set(), uniq = [];
out.forEach((o) => { const k = o[2]; if (seen.has(k)) return; seen.add(k); uniq.push(o); });
fs.writeFileSync('shorts/tests/lines48.json', JSON.stringify(uniq, null, 1));
console.log('files', files.length, 'raw', out.length, 'unique', uniq.length);
const by = {}; uniq.forEach((o) => { by[o[1]] = (by[o[1]] || 0) + 1; }); console.log(JSON.stringify(by));
