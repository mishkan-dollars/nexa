// dev-only: контактный лист серых превью текстур.  node sheet.js <dir> <out.jpg>
const sharp = require('sharp'), fs = require('fs'), path = require('path');
(async () => {
  const dir = process.argv[2], files = fs.readdirSync(dir).filter((f) => /\.(jpg|png)$/i.test(f));
  const S = 200, cols = 4, rows = Math.ceil(files.length / cols);
  const comp = [];
  for (let i = 0; i < files.length; i += 1) {
    const b = await sharp(path.join(dir, files[i])).resize(S, S).greyscale().toBuffer();
    comp.push({ input: b, left: (i % cols) * S, top: Math.floor(i / cols) * S });
  }
  await sharp({ create: { width: cols * S, height: rows * S, channels: 3, background: '#000' } }).composite(comp).jpeg({ quality: 80 }).toFile(process.argv[3]);
  console.log(files.map((f, i) => i + ':' + f.replace(/_1K.*/, '')).join('  '));
})();
