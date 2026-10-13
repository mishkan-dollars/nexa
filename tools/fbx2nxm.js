// NEXA: конвертер статичного FBX (Blender, бинарный v7.x) -> NXM1 (assets/models/*.nxm), один меш 'body'.
// Использование: node tools/fbx2nxm.js in.fbx out.nxm [высота_м=1.68 | raw]
// Модель масштабируется до заданной высоты, ставится ногами на y=0, по центру X/Z (T-поза остаётся T-позой).
// FBX читается собственным разборщиком (zlib из Node). Чужие библиотеки не нужны.
const fs = require('fs');
const zlib = require('zlib');

function parseFbx(buf) {
  const ver = buf.readUInt32LE(23), wide = ver >= 7500;
  let p = 27;
  const readProp = () => {
    const t = String.fromCharCode(buf[p]); p += 1;
    switch (t) {
      case 'Y': { const v = buf.readInt16LE(p); p += 2; return v; }
      case 'C': { const v = buf[p] !== 0; p += 1; return v; }
      case 'I': { const v = buf.readInt32LE(p); p += 4; return v; }
      case 'F': { const v = buf.readFloatLE(p); p += 4; return v; }
      case 'D': { const v = buf.readDoubleLE(p); p += 8; return v; }
      case 'L': { const v = Number(buf.readBigInt64LE(p)); p += 8; return v; }
      case 'S': { const l = buf.readUInt32LE(p); p += 4; const s = buf.toString('utf8', p, p + l); p += l; return s; }
      case 'R': { const l = buf.readUInt32LE(p); p += 4; const b = Buffer.from(buf.slice(p, p + l)); p += l; return b; }
      case 'f': case 'd': case 'l': case 'i': case 'b': {
        const n = buf.readUInt32LE(p), enc = buf.readUInt32LE(p + 4), clen = buf.readUInt32LE(p + 8); p += 12;
        let data = buf.slice(p, p + clen); p += clen;
        if (enc === 1) data = zlib.inflateSync(data);
        const out = new ({ f: Float32Array, d: Float64Array, l: Float64Array, i: Int32Array, b: Uint8Array }[t])(n);
        for (let k = 0; k < n; k += 1) {
          if (t === 'f') out[k] = data.readFloatLE(k * 4); else if (t === 'd') out[k] = data.readDoubleLE(k * 8);
          else if (t === 'l') out[k] = Number(data.readBigInt64LE(k * 8)); else if (t === 'i') out[k] = data.readInt32LE(k * 4); else out[k] = data[k];
        }
        return out;
      }
      default: throw new Error('FBX: тип свойства ' + t);
    }
  };
  const readNode = () => {
    let end, np, nl;
    if (wide) { end = Number(buf.readBigUInt64LE(p)); np = Number(buf.readBigUInt64LE(p + 8)); nl = buf[p + 24]; p += 25; }
    else { end = buf.readUInt32LE(p); np = buf.readUInt32LE(p + 4); nl = buf[p + 12]; p += 13; }
    if (end === 0) return null;
    const name = buf.toString('utf8', p, p + nl); p += nl;
    const props = []; for (let i = 0; i < np; i += 1) props.push(readProp());
    const children = [];
    while (p < end) { const c = readNode(); if (c) children.push(c); }
    p = end;
    return { name, props, children };
  };
  const top = [];
  while (p < buf.length - 160) { const n = readNode(); if (!n) break; top.push(n); }
  return top;
}

const [, , inF, outF, hArg] = process.argv;
if (!inF || !outF) { console.error('node tools/fbx2nxm.js in.fbx out.nxm [height_m]'); process.exit(1); }
const RAW = hArg === 'raw'; // raw: координаты как в файле (волосы и другие насадки, посаженные по месту)
const H = RAW ? 1 : +(hArg || 1.68);
const top = parseFbx(fs.readFileSync(inF));
const geo = top.find((n) => n.name === 'Objects').children.find((n) => n.name === 'Geometry');
const ch = (n, name) => n.children.find((c) => c.name === name);
const V = ch(geo, 'Vertices').props[0], PV = ch(geo, 'PolygonVertexIndex').props[0];
const LN = ch(geo, 'LayerElementNormal'), LU = ch(geo, 'LayerElementUV');
const NORM = LN && ch(LN, 'Normals').props[0], NI = LN && ch(LN, 'NormalsIndex') && ch(LN, 'NormalsIndex').props[0], UV = LU && ch(LU, 'UV').props[0], UVI = LU && ch(LU, 'UVIndex') && ch(LU, 'UVIndex').props[0];

// высота/центр по Y и X/Z
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (let i = 0; i < V.length; i += 3) for (let k = 0; k < 3; k += 1) { mn[k] = Math.min(mn[k], V[i + k]); mx[k] = Math.max(mx[k], V[i + k]); }
const s = RAW ? 1 : H / (mx[1] - mn[1]), cx = RAW ? 0 : (mn[0] + mx[0]) / 2, cz = RAW ? 0 : (mn[2] + mx[2]) / 2;
if (RAW) mn[1] = 0;

const nAt = (pvi) => { const q = NI ? NI[pvi] : pvi; return [NORM[q * 3], NORM[q * 3 + 1], NORM[q * 3 + 2]]; };
const pos = [], nor = [], uv = [], idx = [], map = new Map();
let pvi = 0, poly = [];
for (let i = 0; i < PV.length; i += 1) {
  const raw = PV[i], last = raw < 0, vi = last ? ~raw : raw;
  const key = vi + '|' + (NORM ? nAt(pvi).map((v) => Math.round(v * 60)).join(',') : '') + '|' + (UV ? [UV[(UVI ? UVI[pvi] : pvi) * 2], UV[(UVI ? UVI[pvi] : pvi) * 2 + 1]].map((v) => Math.round(v * 4000)).join(',') : '');
  let id = map.get(key);
  if (id === undefined) {
    id = pos.length / 3; map.set(key, id);
    pos.push((V[vi * 3] - cx) * s, (V[vi * 3 + 1] - mn[1]) * s, (V[vi * 3 + 2] - cz) * s);
    if (NORM) nor.push(...nAt(pvi)); else nor.push(0, 1, 0);
    if (UV) { const u = UVI ? UVI[pvi] : pvi; uv.push(UV[u * 2], UV[u * 2 + 1]); } else uv.push(0, 0);
  }
  poly.push(id); pvi += 1;
  if (last) { for (let k = 1; k + 1 < poly.length; k += 1) idx.push(poly[0], poly[k], poly[k + 1]); poly = []; }
}
const vc = pos.length / 3, ic = idx.length, wideIdx = vc > 65535;
const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k += 1) { bb[k] = Math.min(bb[k], pos[i + k]); bb[3 + k] = Math.max(bb[3 + k], pos[i + k]); }
for (let k = 0; k < 3; k += 1) if (bb[3 + k] - bb[k] < 1e-6) bb[3 + k] = bb[k] + 1e-6;
const P16 = Buffer.alloc(vc * 6), U16 = Buffer.alloc(vc * 4), N8 = Buffer.alloc(vc * 4), I = Buffer.alloc(ic * (wideIdx ? 4 : 2));
for (let i = 0; i < vc; i += 1) {
  for (let k = 0; k < 3; k += 1) P16.writeInt16LE(Math.round((pos[i * 3 + k] - bb[k]) / (bb[3 + k] - bb[k]) * 65534 - 32767), (i * 3 + k) * 2);
  const nl = Math.hypot(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]) || 1;
  for (let k = 0; k < 3; k += 1) N8.writeInt8(Math.round(nor[i * 3 + k] / nl * 127), i * 4 + k);
  U16.writeUInt16LE(Math.max(0, Math.min(65535, Math.round((uv[i * 2] % 1 + 1) % 1 * 65535))), i * 4); U16.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(uv[i * 2 + 1] * 65535))), i * 4 + 2);
}
for (let i = 0; i < ic; i += 1) { if (wideIdx) I.writeUInt32LE(idx[i], i * 4); else I.writeUInt16LE(idx[i], i * 2); }
const pad4 = (b) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b);
const parts = [P16, U16, N8, I].map(pad4);
const po = 0, uo = parts[0].length, no = uo + parts[1].length, io = no + parts[2].length;
const hdr = Buffer.from(JSON.stringify({ parts: [{ name: 'body', vc, ic, wide: wideIdx, bb, po, uo, no, io }] }));
const hpad = (4 - ((8 + hdr.length) % 4)) % 4, hbuf = Buffer.concat([hdr, Buffer.alloc(hpad, 0x20)]);
const head = Buffer.alloc(8); head.writeUInt32BE(0x4e584d31, 0); head.writeUInt32LE(hbuf.length, 4);
fs.writeFileSync(outF, Buffer.concat([head, hbuf, ...parts]));
console.log('OK', outF, 'verts', vc, 'tris', ic / 3, 'height', H, 'bbox', bb.map((v) => +v.toFixed(3)).join(' '), 'bytes', fs.statSync(outF).size);
