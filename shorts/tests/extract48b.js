const fs = require('fs'), path = require('path');
const files = fs.readdirSync('js').filter((f) => /^f48.*\.js$|^finale48\.js$/.test(f)).sort();
const res = [], seen = new Set();
files.forEach((f) => {
  fs.readFileSync(path.join('js', f), 'utf8').split('\n').forEach((ln, i) => {
    if (/^\s*\/\//.test(ln)) return;
    for (const m of ln.matchAll(/(['"`])((?:\.|(?!\1).){8,})\1/g)) {
      const t = m[2].replace(/\'/g, "'").replace(/\n/g, ' ');
      if (!/^[A-Z“"‘(][^<>{}=;]*[.!?…”"]$/.test(t)) continue;                 // предложение с точкой / ! / ?
      if (/^[A-Z0-9 \-—:.,'!?/]+$/.test(t)) continue;                          // ВЕРХНИЙ РЕГИСТР — это UI, не речь
      if (t.split(/\s+/).length < 2) continue;
      if (/^(Use|Click|Press|Hold|Open|Wait)\b/.test(t) && t.length < 60) continue;
      if (seen.has(t)) continue; seen.add(t);
      res.push([f + ':' + (i + 1), t]);
    }
  });
});
fs.writeFileSync('shorts/tests/lines48b.json', JSON.stringify(res, null, 1));
console.log(res.length);
res.forEach((r) => console.log(r[0] + ' | ' + r[1]));
