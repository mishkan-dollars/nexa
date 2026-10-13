// dev-only: сборка лёгких моделей для игры.  node build-models.js [имя …]   (без аргументов — все)
// Источники лежат в scratchpad/work (glb после assimp и распакованные zip-архивы), результат — assets/models/props/<имя>.glb
//  • все меши склеиваются по материалу, трансформы узлов запекаются, модель приводится к реальным метрам и ставится на «пол» (pivot)
//  • треугольники упрощаются (meshoptimizer), текстуры — только baseColor, уменьшены, обесцвечены под стиль игры (ЧБ), JPEG
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { Document, NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { weld, simplify, prune, dedup } = require('@gltf-transform/functions');
const { MeshoptSimplifier } = require('meshoptimizer');
const CFG = require('./models.config.js');

const ROOT = path.resolve(__dirname, '..', '..');
const WORK = process.env.NEXA_WORK || 'C:/Users/nezna/AppData/Local/Temp/claude/C--Users-nezna-Desktop-game/28917271-1492-49e2-a491-02b09fbeee71/scratchpad/work';
const OUT = path.join(ROOT, 'assets', 'models', 'props');
const PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// --- GLB: заменяем внешние картинки (пути чужого диска) на пиксель, иначе загрузка падает
function stripExternal(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) return buf;
  const jl = dv.getUint32(12, true), json = JSON.parse(Buffer.from(buf.buffer, buf.byteOffset + 20, jl).toString('utf8'));
  let touched = false;
  (json.images || []).forEach((im) => { if (im.uri && !/^data:/.test(im.uri)) { im.uri = 'data:image/png;base64,' + PX; touched = true; } });
  if (!touched) return buf;
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
  const rest = Buffer.from(buf.buffer, buf.byteOffset + 20 + jl, buf.byteLength - 20 - jl);
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + js.length + rest.length, 8);
  head.writeUInt32LE(js.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, js, rest]);
}

const mulMat = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) for (let k = 0; k < 4; k += 1) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const rotMat = (rx, ry, rz) => {
  const d = Math.PI / 180, cx = Math.cos(rx * d), sx = Math.sin(rx * d), cy = Math.cos(ry * d), sy = Math.sin(ry * d), cz = Math.cos(rz * d), sz = Math.sin(rz * d);
  const X = [1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1], Y = [cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1], Z = [cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return mulMat(Z, mulMat(Y, X));
};
const apply = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const applyN = (m, x, y, z) => { // нормали: для равномерного масштаба хватает линейной части + нормализация
  const r = [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z], l = Math.hypot(r[0], r[1], r[2]) || 1;
  return [r[0] / l, r[1] / l, r[2] / l];
};


// упрощение одной группы (позиции в метрах): атрибуты учитываются, мелкие отдельные детали вырезаются (Prune), «суп» из треугольников — sloppy
function simpGroup(g, target, err) {
  const idx = Uint32Array.from(g.idx), pos = Float32Array.from(g.pos), at = new Float32Array(g.n * 5);
  for (let i = 0; i < g.n; i += 1) { at[i * 5] = g.nor[i * 3]; at[i * 5 + 1] = g.nor[i * 3 + 1]; at[i * 5 + 2] = g.nor[i * 3 + 2]; at[i * 5 + 3] = g.uv[i * 2]; at[i * 5 + 4] = g.uv[i * 2 + 1]; }
  let res = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, at, 5, [0.5, 0.5, 0.5, 0.7, 0.7], null, Math.max(3, Math.floor(target) * 3), err, ['Prune'])[0];
  if (res.length / 3 > target * 1.25) { const sl = MeshoptSimplifier.simplifySloppy(idx, pos, 3, null, Math.max(3, Math.floor(target) * 3), err * 2)[0]; if (sl.length < res.length) res = sl; }
  const map = new Int32Array(g.n).fill(-1), np = [], nn = [], nu = [], ni = [];
  for (let i = 0; i < res.length; i += 1) {
    const v = res[i];
    if (map[v] < 0) { map[v] = np.length / 3; np.push(g.pos[v * 3], g.pos[v * 3 + 1], g.pos[v * 3 + 2]); nn.push(g.nor[v * 3], g.nor[v * 3 + 1], g.nor[v * 3 + 2]); nu.push(g.uv[v * 2], g.uv[v * 2 + 1]); }
    ni.push(map[v]);
  }
  g.pos = np; g.nor = nn; g.uv = nu; g.idx = ni; g.n = np.length / 3;
}

async function procTexture(buf, c, cfg) {
  let im = sharp(buf, { failOn: 'none' }).rotate();
  const meta = await im.metadata();
  const max = cfg.tex || 256;
  im = im.resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true });
  const sa = cfg.sat === undefined ? 0.1 : cfg.sat, lw = [0.3, 0.59, 0.11]; // смешение с яркостью в sRGB: sat 0 — чёрно-белое, 1 — как есть
  im = im.removeAlpha ? im : im;
  im = im.recomb([0, 1, 2].map((r) => [0, 1, 2].map((c) => (r === c ? sa : 0) + (1 - sa) * lw[c])));
  if (cfg.bri && cfg.bri !== 1) im = im.linear(cfg.bri, 0);
  if (cfg.gamma) im = im.gamma(cfg.gamma);
  const alpha = meta.hasAlpha && cfg.alpha !== false;
  const out = alpha ? await im.png({ compressionLevel: 9, palette: true }).toBuffer() : await im.flatten({ background: '#808080' }).jpeg({ quality: cfg.q || 80, mozjpeg: true }).toBuffer();
  return { data: out, mime: alpha ? 'image/png' : 'image/jpeg' };
}

async function build(name, cfg) {
  const src = path.join(WORK, 'glb', cfg.src || (name + '.glb'));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc0 = await io.readBinary(stripExternal(new Uint8Array(fs.readFileSync(src))));
  const root0 = doc0.getRoot(), scene0 = root0.getDefaultScene() || root0.listScenes()[0];

  // 1. собрать примитивы с мировыми матрицами
  const groups = new Map(); // материал -> { pos:[], nor:[], uv:[], idx:[] }
  const R = rotMat(...(cfg.rot || [0, 0, 0]));
  scene0.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const M = mulMat(R, node.getWorldMatrix());
    mesh.listPrimitives().forEach((p) => {
      if (p.getMode() !== 4) return;
      const P = p.getAttribute('POSITION'), N = p.getAttribute('NORMAL'), U = p.getAttribute('TEXCOORD_0'), I = p.getIndices();
      if (!P) return;
      const mat = p.getMaterial(), key = mat;
      let g = groups.get(key);
      if (!g) { g = { mat, pos: [], nor: [], uv: [], idx: [], n: 0 }; groups.set(key, g); }
      const cnt = P.getCount(), base = g.n, v = [0, 0, 0];
      for (let i = 0; i < cnt; i += 1) {
        P.getElement(i, v); const w = apply(M, v[0], v[1], v[2]); g.pos.push(w[0], w[1], w[2]);
        if (N) { N.getElement(i, v); const n = applyN(M, v[0], v[1], v[2]); g.nor.push(n[0], n[1], n[2]); } else g.nor.push(0, 1, 0);
        if (U) { U.getElement(i, v); g.uv.push(v[0], v[1]); } else g.uv.push(0, 0);
      }
      const ic = I ? I.getCount() : cnt;
      for (let i = 0; i < ic; i += 1) g.idx.push(base + (I ? I.getScalar(i) : i));
      g.n += cnt;
    });
  });
  if (!groups.size) throw new Error('нет мешей');

  // 2. габариты → масштаб и pivot
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  groups.forEach((g) => { for (let i = 0; i < g.pos.length; i += 3) for (let k = 0; k < 3; k += 1) { const v = g.pos[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; } });
  const sz = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  let s = 1;
  if (cfg.h) s = cfg.h / sz[1];
  else if (cfg.w) s = cfg.w / sz[0];
  else if (cfg.d) s = cfg.d / sz[2];
  else if (cfg.len) s = cfg.len / Math.max(sz[0], sz[2]);
  else if (cfg.max) s = cfg.max / Math.max(sz[0], sz[1], sz[2]);
  const piv = cfg.pivot || 'bottom', cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
  const oy = piv === 'center' ? (mn[1] + mx[1]) / 2 : piv === 'top' ? mx[1] : mn[1];
  groups.forEach((g) => { for (let i = 0; i < g.pos.length; i += 3) { g.pos[i] = (g.pos[i] - cx) * s; g.pos[i + 1] = (g.pos[i + 1] - oy) * s; g.pos[i + 2] = (g.pos[i + 2] - cz) * s; } });
  const fin = sz.map((v) => +(v * s).toFixed(3));

  await MeshoptSimplifier.ready;
  let tris0 = 0;
  groups.forEach((g) => { tris0 += g.idx.length / 3; });
  const want = cfg.tris || 2000;
  if (tris0 > want) groups.forEach((g) => simpGroup(g, want * (g.idx.length / 3) / tris0, cfg.err || 0.05));

  // 3. новый документ
  const doc = new Document(), buf = doc.createBuffer(), sc = doc.createScene(name), node = doc.createNode(name), mesh = doc.createMesh(name);
  sc.addChild(node); node.setMesh(mesh);
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const sat = cfg.sat === undefined ? 0.1 : cfg.sat;
  let ti = 0;
  for (const g of groups.values()) {
    const om = g.mat, mat = doc.createMaterial((om && om.getName()) || 'm' + (ti += 1));
    mat.setMetallicFactor(0).setRoughnessFactor(1);
    const bf = om ? om.getBaseColorFactor() : [0.8, 0.8, 0.8, 1], L = lum(bf);
    let col = [L + (bf[0] - L) * sat, L + (bf[1] - L) * sat, L + (bf[2] - L) * sat];
    if (cfg.tint) col = col.map((v, k) => v * cfg.tint[k]);
    mat.setBaseColorFactor([Math.min(1, col[0]), Math.min(1, col[1]), Math.min(1, col[2]), bf[3]]);
    if (om && om.getAlphaMode() !== 'OPAQUE') { mat.setAlphaMode(om.getAlphaMode()); mat.setAlphaCutoff(om.getAlphaCutoff()); }
    // текстура: из модели (если не пиксель-заглушка) или из файла конфигурации
    let img = null;
    const t0 = om && om.getBaseColorTexture();
    if (t0 && t0.getImage() && (t0.getSize() || [0])[0] > 4) img = Buffer.from(t0.getImage());
    const tf = cfg.texFile && (typeof cfg.texFile === 'string' ? cfg.texFile : Object.keys(cfg.texFile).filter((k) => om && om.getName().indexOf(k) >= 0).map((k) => cfg.texFile[k])[0] || cfg.texFile['*']);
    if (!img && tf) img = fs.readFileSync(path.join(WORK, 'x', tf));
    if (cfg.noTex) img = null;
    if (img) {
      try {
        const t = await procTexture(img, g, cfg);
        const tex = doc.createTexture(name + ti).setImage(new Uint8Array(t.data)).setMimeType(t.mime);
        mat.setBaseColorTexture(tex);
        if (cfg.texTint) mat.setBaseColorFactor(cfg.texTint.concat([bf[3]])); else mat.setBaseColorFactor([1, 1, 1, bf[3]]);
        if (om && om.getAlphaMode() === 'BLEND') mat.setAlphaMode('BLEND');
      } catch (e) { console.log('  texture failed:', e.message); }
    }
    if (om && om.getDoubleSided()) mat.setDoubleSided(true);
    if (cfg.double) mat.setDoubleSided(true);
    const prim = doc.createPrimitive().setMaterial(mat);
    prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.pos)).setBuffer(buf));
    prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.nor)).setBuffer(buf));
    prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(g.uv)).setBuffer(buf));
    const wide = g.n > 65535;
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(wide ? new Uint32Array(g.idx) : new Uint16Array(g.idx)).setBuffer(buf));
    mesh.addPrimitive(prim);
  }

  await doc.transform(dedup(), prune());
  let tris1 = 0;
  doc.getRoot().listMeshes().forEach((m) => m.listPrimitives().forEach((p) => { const i = p.getIndices(); tris1 += i ? i.getCount() / 3 : 0; }));
  fs.mkdirSync(OUT, { recursive: true });
  const bin = await io.writeBinary(doc);
  fs.writeFileSync(path.join(OUT, name + '.glb'), bin);
  console.log(name.padEnd(22), 'tris', String(Math.round(tris0)).padStart(7), '→', String(Math.round(tris1)).padStart(5), '| size', fin.join('x'), '| KB', (bin.length / 1024).toFixed(0));
  return { name, tris: Math.round(tris1), bytes: bin.length, size: fin };
}

(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CFG);
  const rep = [];
  for (const n of names) {
    if (!CFG[n]) { console.log('нет конфигурации:', n); continue; }
    try { rep.push(await build(n, CFG[n])); } catch (e) { console.log(n.padEnd(22), 'ОШИБКА', e.message); }
  }
  const idxP = path.join(OUT, 'index.json');
  let idx = {}; try { idx = JSON.parse(fs.readFileSync(idxP, 'utf8')); } catch (e) { /* первый запуск */ }
  Object.keys(idx).forEach((k) => { if (!CFG[k]) delete idx[k]; }); // убрать устаревшие записи
  rep.forEach((r) => { idx[r.name] = { size: r.size, tris: r.tris, bytes: r.bytes }; });
  fs.writeFileSync(idxP, JSON.stringify(idx));
  const tot = rep.reduce((a, r) => a + r.bytes, 0);
  console.log('итого', rep.length, 'моделей,', (tot / 1048576).toFixed(2), 'MB');
})();
