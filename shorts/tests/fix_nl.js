// склеивает строковые литералы '...' / "...", в которые попал реальный перевод строки (заменяет его на \n)
const fs = require('fs');
const file = process.argv[2];
const s = fs.readFileSync(file, 'utf8');
let out = '', inStr = false, q = '', fixed = 0;
for (let i = 0; i < s.length; i += 1) {
  const c = s[i];
  if (!inStr) {
    if (c === "'" || c === '"') { inStr = true; q = c; }
    out += c;
  } else {
    if (c === '\\') { out += c + s[i + 1]; i += 1; continue; }
    if (c === q) { inStr = false; out += c; continue; }
    if (c === '\n') { out += '\\n'; fixed += 1; continue; }
    out += c;
  }
}
fs.writeFileSync(file, out);
console.log('fixed', fixed);
