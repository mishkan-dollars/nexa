// dev-only: облегчение плюшевой игрушки (мех из 16 «оболочек» по 67k треугольников → тело + несколько слоёв меха).
//   node build-plush.js [вход.glb] [выход.glb]   (по умолчанию black_plush_bear.glb в корне → assets/models/toys/plush_black.glb)
// Текстура меха 2048² → 512 (альфа сохраняется: по ней вырезаются слои), нормал-карты и расширения sheen/clearcoat убираются (three r128 их не читает).
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { prune, dedup } = require('@gltf-transform/functions');
const { MeshoptSimplifier } = require('meshoptimizer');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, 'black_plush_bear.glb'));
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'assets', 'models', 'toys', 'plush_black.glb'));
const TEX = 512;
// материал → целевое число треугольников (null — выбросить)
const KEEP = { Plush_Backing: 7500, Suede_Pads: 500, Velvet_InnerEar: 250, Fur_Shell_04: 3200, Fur_Shell_09: 3200, Fur_Shell_14: 3200, Glass_Eye: 700, Embroidered_Nose: 700, Thread_Mouth: 420 };

function simp(prim, doc, buf, target, err) {
  const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), U = prim.getAttribute('TEXCOORD_0'), I = prim.getIndices();
  const n = P.getCount(), pos = Float32Array.from(P.getArray()), idx = Uint32Array.from(I.getArray());
  const at = new Float32Array(n * 5), v = [0, 0, 0];
  for (let i = 0; i < n; i += 1) {
    if (N) { N.getElement(i, v); at[i * 5] = v[0]; at[i * 5 + 1] = v[1]; at[i * 5 + 2] = v[2]; }
    if (U) { U.getElement(i, v); at[i * 5 + 3] = v[0]; at[i * 5 + 4] = v[1]; }
  }
  let res = idx;
  if (idx.length / 3 > target) res = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, at, 5, [0.5, 0.5, 0.5, 0.7, 0.7], null, Math.max(3, Math.floor(target) * 3), err, [])[0];
  if (res.length / 3 > target * 1.4) { const sl = MeshoptSimplifier.simplifySloppy(idx, pos, 3, null, Math.max(3, Math.floor(target) * 3), err * 2)[0]; if (sl.length < res.length) res = sl; }
  const map = new Int32Array(n).fill(-1), np = [], nn = [], nu = [], ni = [];
  for (let i = 0; i < res.length; i += 1) {
    const o = res[i];
    if (map[o] < 0) { map[o] = np.length / 3; np.push(pos[o * 3], pos[o * 3 + 1], pos[o * 3 + 2]); nn.push(at[o * 5], at[o * 5 + 1], at[o * 5 + 2]); nu.push(at[o * 5 + 3], at[o * 5 + 4]); }
    ni.push(map[o]);
  }
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  prim.setAttribute('POSITION', acc('VEC3', new Float32Array(np)));
  prim.setAttribute('NORMAL', acc('VEC3', new Float32Array(nn)));
  if (U) prim.setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(nu))); else prim.setAttribute('TEXCOORD_0', null);
  prim.setIndices(acc('SCALAR', np.length / 3 > 65535 ? new Uint32Array(ni) : new Uint16Array(ni)));
  return ni.length / 3;
}

(async () => {
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(SRC);
  const root = doc.getRoot(), buf = root.listBuffers()[0];
  // 1. выбросить лишние примитивы, остальные упростить
  let tris = 0;
  root.listMeshes().forEach((mesh) => {
    mesh.listPrimitives().forEach((p) => {
      const name = p.getMaterial() && p.getMaterial().getName();
      if (!(name in KEEP)) { mesh.removePrimitive(p); p.dispose(); return; }
      tris += simp(p, doc, buf, KEEP[name], name.indexOf('Eye') >= 0 || name.indexOf('Nose') >= 0 ? 0.2 : 0.1);
    });
  });
  // 2. материалы: без расширений и нормал-карт; текстура меха 512 с альфой
  root.listMaterials().forEach((m) => {
    m.listExtensions && 0;
    m.setNormalTexture(null);
    m.setMetallicFactor(0).setRoughnessFactor(1);
    ['KHR_materials_sheen', 'KHR_materials_clearcoat', 'KHR_materials_ior'].forEach((e) => { const x = m.getExtension(e); if (x) m.setExtension(e, null); });
  });
  await doc.transform(prune(), dedup());
  const tex = root.listTextures()[0];
  if (tex) {
    const png = await sharp(Buffer.from(tex.getImage())).resize(TEX, TEX, { fit: 'fill' }).png({ compressionLevel: 9, palette: false }).toBuffer();
    tex.setImage(new Uint8Array(png)).setMimeType('image/png');
  }
  // 3. центрировать по габаритам
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], v = [0, 0, 0];
  root.listMeshes().forEach((m) => m.listPrimitives().forEach((p) => { const P = p.getAttribute('POSITION'); for (let i = 0; i < P.getCount(); i += 1) { P.getElement(i, v); for (let k = 0; k < 3; k += 1) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } } }));
  const c = [0, 1, 2].map((k) => (mn[k] + mx[k]) / 2);
  const seen = new Set();
  root.listMeshes().forEach((m) => m.listPrimitives().forEach((p) => { const P = p.getAttribute('POSITION'); if (seen.has(P)) return; seen.add(P); for (let i = 0; i < P.getCount(); i += 1) { P.getElement(i, v); P.setElement(i, [v[0] - c[0], v[1] - c[1], v[2] - c[2]]); } }));
  // узлы: трансформации плоские (у корня нет), но на всякий случай сбросить
  root.listNodes().forEach((n) => { n.setTranslation([0, 0, 0]); n.setRotation([0, 0, 0, 1]); n.setScale([1, 1, 1]); });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const bin = await io.writeBinary(doc);
  fs.writeFileSync(OUT, bin);
  console.log('tris', Math.round(tris), '| size', [0, 1, 2].map((k) => +(mx[k] - mn[k]).toFixed(3)).join('x'), '| KB', (bin.length / 1024).toFixed(0), '→', path.relative(ROOT, OUT));
})().catch((e) => { console.error(e); process.exit(1); });
