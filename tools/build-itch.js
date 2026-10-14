// Сборка NEXA/OS для itch.io:  node tools/build-itch.js
//  1) обновляет assets-manifest.json (список и размеры всех файлов из assets/ — по нему preload.js качает всё за один раз);
//  2) собирает dist/nexa-itch.zip (index.html в корне, пути с прямыми слэшами — как требует itch.io).
// В архив не попадают: *.zip, *.md, .claude, tools, dist, memory.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'nexa-itch.zip');
const STORE_EXT = /\.(mp3|m4a|ogg|png|jpg|jpeg|webp|zip)$/i;

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  });
  return out;
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

// ---------------------------------------------------------------- озвучка: assets/voice/list.json (какие mp3 есть и сколько длятся)
try { require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'extract-voice.js')], { stdio: 'inherit' }); } catch (e) { console.warn('extract-voice failed:', e.message); }

// ---------------------------------------------------------------- манифест
const assets = walk(path.join(ROOT, 'assets'), []).map(rel)
  .filter((f) => !/\.(zip|md|txt|db)$/i.test(f) && !/\/\./.test(f))
  .sort();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ver = (/preload\.js\?v=([\w.-]+)/.exec(html) || [0, '0'])[1];
const manifest = { version: ver, files: assets.map((f) => [f, fs.statSync(path.join(ROOT, f)).size]) };
fs.writeFileSync(path.join(ROOT, 'assets-manifest.json'), JSON.stringify(manifest) + '\n');
const assetBytes = manifest.files.reduce((s, f) => s + f[1], 0);
console.log('manifest: ' + manifest.files.length + ' files, ' + (assetBytes / 1048576).toFixed(1) + ' MB, v' + ver);

// ---------------------------------------------------------------- zip
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i += 1) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function dosTime(d) { return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; }

const files = ['index.html', 'styles.css', 'css/ui-polish.css', 'sw.js', 'manifest.webmanifest', 'assets-manifest.json']
  .concat(walk(path.join(ROOT, 'js'), []).map(rel).sort())
  .concat(assets);

const parts = [], central = [];
let offset = 0;
const stamp = dosTime(new Date());
files.forEach((name) => {
  const data = fs.readFileSync(path.join(ROOT, name));
  const nameBuf = Buffer.from(name, 'utf8');
  let method = 0, body = data;
  if (!STORE_EXT.test(name) && data.length > 64) {
    const z = zlib.deflateRawSync(data, { level: 9 });
    if (z.length < data.length) { method = 8; body = z; }
  }
  const crc = crc32(data);
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
  lh.writeUInt16LE(stamp.time, 10); lh.writeUInt16LE(stamp.date, 12); lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
  parts.push(lh, nameBuf, body);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10);
  ch.writeUInt16LE(stamp.time, 12); ch.writeUInt16LE(stamp.date, 14); ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
  ch.writeUInt32LE(offset, 42);
  central.push(ch, nameBuf);
  offset += lh.length + nameBuf.length + body.length;
});
const cdSize = central.reduce((s, b) => s + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(OUT, Buffer.concat(parts.concat(central, [end])));
const zipSize = fs.statSync(OUT).size;
console.log('zip: ' + files.length + ' files -> ' + rel(OUT) + ' (' + (zipSize / 1048576).toFixed(1) + ' MB)');
if (files.length > 1000) console.warn('WARNING: itch.io принимает не более 1000 файлов в HTML5-архиве');
