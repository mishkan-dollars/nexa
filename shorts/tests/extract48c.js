// все строки-реплики финала 48: посимвольный разбор литералов (без перепутанных кавычек)
const fs = require('fs'), path = require('path');
const files = fs.readdirSync('js').filter((f) => /^f48.*\.js$|^finale48\.js$/.test(f)).sort();
const res = [], seen = new Set();
files.forEach((f) => {
  fs.readFileSync(path.join('js', f), 'utf8').split('\n').forEach((ln, i) => {
    let p = 0;
    while (p < ln.length) {
      const c = ln[p];
      if (c === '/' && ln[p + 1] === '/') break;                       // комментарий до конца строки
      if (c === "'" || c === '"' || c === '`') {
        let q = p + 1, s = '';
        while (q < ln.length && ln[q] !== c) { if (ln[q] === '\\') { s += ln[q + 1] === 'n' ? ' ' : ln[q + 1]; q += 2; } else { s += ln[q]; q += 1; } }
        p = q + 1;
        const t = s.trim();
        if (t.length < 4 || t.length > 300) continue;
        if (!/^[A-Z“"‘(][^<>{}=;]*[.!?…”"]$/.test(t)) continue;
        if (/^[A-Z0-9 \-—:.,'!?/%+]+$/.test(t)) continue;               // ВЕРХНИЙ РЕГИСТР — интерфейс
        if (/^(Use|Click|Press|Hold|Open|Wait|Return)\b/.test(t) && t.length < 40) continue;
        if (seen.has(t)) continue; seen.add(t);
        res.push([f + ':' + (i + 1), t]);
      } else p += 1;
    }
  });
});
fs.writeFileSync('shorts/tests/lines48c.json', JSON.stringify(res, null, 1));
console.log(res.length);
