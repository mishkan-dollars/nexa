// NEXA: миссия 48 — девушка. woman.nxm (манекен): удлинённая шея, скиннинг на скелет стикмена + 4 пружинные кости (грудь ×2, ягодицы ×2) с инерционной физикой,
// одежда (кожаная куртка с лацканами и молнией, футболка с V-вырезом, джинсы, ремень, ботинки) оболочками с плавной обрезкой. Кожа серая, лицо без черт;
// волосы — модель пользователя assets/models/hair.nxm + hair.png (F_Hair_640), качаются изгибом вершин от пружины.
// Только добавляет: C.f48.loadWoman / loadHair / woman / womanDress / jigAdd / jigStep.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.geo || !C.f48 || !C.f48.cmerge) return;
  const F = C.f48, { box, cylY, sph } = C.geo, cmerge = F.cmerge, col = F.col, vcMat = F.vcMat;
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lam = (o) => new THREE.MeshLambertMaterial(o);
  const sk_ = (m) => { m.skinning = true; return m; }; // three r128: флаг скиннинга задаётся на материале
  const WS = 1.03, NECK = 0.042, NZ = -0.047;            // масштаб манекена, удлинение шеи, ось шеи по z (м, система n.g)
  const RGB = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

  // ------------------------------------------------------------------ загрузка меша
  let womanP = null;
  F.loadWoman = function () {
    if (womanP) return womanP;
    womanP = (async () => {
      try {
        const rs = await fetch('assets/models/woman.nxm');
        if (!rs.ok || !C.decodeNXM) return null;
        const parts = C.decodeNXM(await rs.arrayBuffer());
        return parts && parts.body ? parts.body : null;
      } catch (e) { return null; }
    })();
    return womanP;
  };

  // волосы пользователя (hair.nxm в координатах файла + hair.png: полосы прядей с альфой)
  let hairP = null;
  F.loadHair = function () {
    if (hairP) return hairP;
    hairP = (async () => {
      try {
        const rs = await fetch('assets/models/hair.nxm');
        if (!rs.ok || !C.decodeNXM) return null;
        const parts = C.decodeNXM(await rs.arrayBuffer()), img = await C.loadImage('assets/models/hair.png');
        return parts && parts.body && img ? { part: parts.body, img } : null;
      } catch (e) { return null; }
    })();
    return hairP;
  };

  // ------------------------------------------------------------------ скелет: сегменты (Т-поза, система n.g) и пружинные кости
  const SEG = [[[0, 0.86, 0], [0, 1.05, 0], 0.17], [[0, 1.05, 0], [0, 1.46, 0], 0.125], [[0, 1.55, -0.035], [0, 1.78, -0.035], 0.075]];
  [-1, 1].forEach((s) => {
    SEG.push([[s * 0.2, 1.47, 0], [s * 0.47, 1.47, 0], 0.05], [[s * 0.47, 1.47, 0], [s * 0.84, 1.47, 0], 0.045],
      [[s * 0.1, 0.92, 0], [s * 0.1, 0.51, 0], 0.095], [[s * 0.1, 0.51, 0], [s * 0.1, 0.11, 0], 0.07], [[s * 0.1, 0.07, 0], [s * 0.1, 0.03, 0.14], 0.055]);
  });
  const boneList = (n) => [n.hips, n.spine, n.head, n.armL, n.elbL, n.legL, n.kneeL, n.footL, n.armR, n.elbR, n.legR, n.kneeR, n.footR];
  // p — индекс сегмента-родителя (0 бёдра, 1 торс); c — центр кости; r — полуоси области влияния; k/cc — жёсткость/демпфирование; lim — предел смещения (м); g — реакция на ускорение по осям
  const JIG = [
    { p: 1, c: [-0.072, 1.36, 0.115], r: [0.088, 0.108, 0.15], k: 170, cc: 5.0, lim: 0.034, g: [0.75, 1.0, 0.85], idle: 0.55, hz: 0.27 },
    { p: 1, c: [0.072, 1.36, 0.115], r: [0.088, 0.108, 0.15], k: 170, cc: 5.0, lim: 0.034, g: [0.75, 1.0, 0.85], idle: 0.55, hz: 0.27 },
    { p: 0, c: [-0.092, 1.03, -0.1], r: [0.118, 0.165, 0.145], k: 130, cc: 6.2, lim: 0.038, g: [0.85, 1.0, 0.75], idle: 0.0, hz: 0.2 },
    { p: 0, c: [0.092, 1.03, -0.1], r: [0.118, 0.165, 0.145], k: 130, cc: 6.2, lim: 0.038, g: [0.85, 1.0, 0.75], idle: 0.0, hz: 0.2 }
  ];
  function segDist(px, py, pz, a, b) {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2], apx = px - a[0], apy = py - a[1], apz = pz - a[2];
    const t = clamp((apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz || 1), 0, 1);
    const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  const _dd = new Float32Array(SEG.length);
  // веса вершины: 4 ближайших сегмента (мягко) + пружинные кости, забирающие вес у родителя по профилю эллипсоида
  function weights(px, py, pz, si, sw, o) {
    let dmin = 9;
    for (let k = 0; k < SEG.length; k += 1) { const s = SEG[k]; _dd[k] = Math.max(0, segDist(px, py, pz, s[0], s[1]) - s[2]); if (_dd[k] < dmin) dmin = _dd[k]; }
    const act = [];
    for (let j = 0; j < JIG.length; j += 1) {
      const q = JIG[j], e = Math.sqrt(((px - q.c[0]) / q.r[0]) ** 2 + ((py - q.c[1]) / q.r[1]) ** 2 + ((pz - q.c[2]) / q.r[2]) ** 2), pr = 1 - sst(0.2, 1, e);
      if (pr > 0.01) act.push([j, pr]);
    }
    const cand = [];
    for (let k = 0; k < SEG.length; k += 1) if (_dd[k] - dmin < 0.07) cand.push([k, Math.exp(-(_dd[k] - dmin) / 0.022)]);
    cand.sort((a, b) => b[1] - a[1]);
    const top = cand.slice(0, 4 - act.length), ids = [], ws = []; let sum = 0;
    top.forEach((c) => { sum += c[1]; });
    top.forEach((c) => { ids.push(c[0]); ws.push(c[1] / sum); });
    act.forEach((a) => {
      const m = ids.indexOf(JIG[a[0]].p); if (m < 0) return;
      const take = Math.min(a[1], ws[m]); ws[m] -= take; ids.push(SEG.length + a[0]); ws.push(take);
    });
    for (let j = 0; j < 4; j += 1) { si[o + j] = ids[j] === undefined ? 0 : ids[j]; sw[o + j] = ws[j] === undefined ? 0 : ws[j]; }
  }

  // ------------------------------------------------------------------ подготовка сетки: шея, масштаб, веса, цвет кожи, карта глубины
  const SKIN = RGB(0x6a6a6e), HAIRC = RGB(0x17110e); // серая кожа (без цветового оттенка), волосяная шапка на темени
  function prep(body) {
    if (F._wb) return F._wb;
    const nv = body.pos.length / 3, P = body.pos, pos = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), colA = new Float32Array(nv * 3);
    const ZC = -0.045;
    for (let i = 0; i < nv; i += 1) {
      let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const rad = Math.hypot(x, z - ZC), m = y >= 1.53 ? 1 : 1 - sst(0.05, 0.095, rad), dy = NECK * sst(1.466, 1.53, y) * m;
      if (y > 1.47 && y < 1.56) { const k = 1 + 0.1 * Math.sin(PI * sst(1.47, 1.56, y)) * (1 - sst(0.045, 0.075, rad)); x *= k; z = ZC + (z - ZC) * k; } // шея чуть толще
      pos[i * 3] = x * WS; pos[i * 3 + 1] = (y + dy) * WS; pos[i * 3 + 2] = z * WS;
    }
    for (let i = 0; i < nv; i += 1) {
      const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
      weights(px, py, pz, si, sw, i * 4);
      let c = SKIN;
      if (py > 1.5 && py < 1.64) c = mul(SKIN, 0.82 + 0.18 * sst(1.5, 1.64, py));              // тень под подбородком
      if (py > 1.62) { const line = 1.69 + 0.055 * sst(-0.012, 0.045, pz - ZC * WS) - 0.03 * sst(0.05, 0.062, Math.abs(px)); if (py > line) c = HAIRC; } // кожа под волосами: линия роста выше на лбу, ниже на затылке и висках
      colA[i * 3] = c[0]; colA[i * 3 + 1] = c[1]; colA[i * 3 + 2] = c[2];
    }
    const B = { nv, pos, nor: new Float32Array(body.nor), idx: body.idx, si, sw, col: colA };
    // карта глубины по (x,y): список треугольников в ячейках 2 см
    const CS = 0.02, GX0 = -0.5, GY0 = -0.02, GNX = 50, GNY = 100, grid = new Array(GNX * GNY), I = B.idx;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const x0 = Math.min(pos[a], pos[b], pos[c]), x1 = Math.max(pos[a], pos[b], pos[c]), y0 = Math.min(pos[a + 1], pos[b + 1], pos[c + 1]), y1 = Math.max(pos[a + 1], pos[b + 1], pos[c + 1]);
      const i0 = Math.max(0, Math.floor((x0 - GX0) / CS)), i1 = Math.min(GNX - 1, Math.floor((x1 - GX0) / CS)), j0 = Math.max(0, Math.floor((y0 - GY0) / CS)), j1 = Math.min(GNY - 1, Math.floor((y1 - GY0) / CS));
      for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) (grid[j * GNX + i] || (grid[j * GNX + i] = [])).push(t);
    }
    B.grid = grid; B.cs = CS; B.gx0 = GX0; B.gy0 = GY0; B.gnx = GNX; B.gny = GNY;
    return (F._wb = B);
  }
  // поверхность тела в точке (x,y) со стороны front (true — +z, false — −z): {z, nx, ny, nz} или null
  function surf(B, x, y, front) {
    const ci = Math.floor((x - B.gx0) / B.cs), cj = Math.floor((y - B.gy0) / B.cs);
    if (ci < 0 || cj < 0 || ci >= B.gnx || cj >= B.gny) return null;
    const list = B.grid[cj * B.gnx + ci]; if (!list) return null;
    const P = B.pos, N = B.nor, I = B.idx; let bz = front ? -9 : 9, out = null;
    for (let q = 0; q < list.length; q += 1) {
      const t = list[q], a = I[t], b = I[t + 1], c = I[t + 2], x0 = P[a * 3], y0 = P[a * 3 + 1], x1 = P[b * 3], y1 = P[b * 3 + 1], x2 = P[c * 3], y2 = P[c * 3 + 1];
      const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2); if (Math.abs(d) < 1e-12) continue;
      const u = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d, v = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d, w = 1 - u - v;
      if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
      const z = u * P[a * 3 + 2] + v * P[b * 3 + 2] + w * P[c * 3 + 2];
      if (front ? z > bz : z < bz) {
        bz = z; out = { z, nx: u * N[a * 3] + v * N[b * 3] + w * N[c * 3], ny: u * N[a * 3 + 1] + v * N[b * 3 + 1] + w * N[c * 3 + 1], nz: u * N[a * 3 + 2] + v * N[b * 3 + 2] + w * N[c * 3 + 2] };
      }
    }
    if (out) { const l = Math.hypot(out.nx, out.ny, out.nz) || 1; out.nx /= l; out.ny /= l; out.nz /= l; }
    return out;
  }
  // сечение сетки плоскостью axis=t → сегменты [u0,z0,u1,z1] (для 'y': u = x; для 'x': u = y)
  function slice(B, axis, t) {
    const P = B.pos, I = B.idx, A = axis === 'y' ? 1 : 0, U = axis === 'y' ? 0 : 1, S = [];
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i], b = I[i + 1], c = I[i + 2], da = P[a * 3 + A] - t, db = P[b * 3 + A] - t, dc = P[c * 3 + A] - t;
      if ((da < 0) === (db < 0) && (db < 0) === (dc < 0)) continue;
      const pts = [];
      [[a, b, da, db], [b, c, db, dc], [c, a, dc, da]].forEach((e) => {
        if ((e[2] < 0) !== (e[3] < 0)) { const s = e[2] / (e[2] - e[3]); pts.push(P[e[0] * 3 + U] + (P[e[1] * 3 + U] - P[e[0] * 3 + U]) * s, P[e[0] * 3 + 2] + (P[e[1] * 3 + 2] - P[e[0] * 3 + 2]) * s); }
      });
      if (pts.length === 4) S.push(pts);
    }
    return S;
  }
  function centroid(S) { let u = 0, z = 0; S.forEach((s) => { u += s[0] + s[2]; z += s[1] + s[3]; }); return [u / (2 * S.length || 1), z / (2 * S.length || 1)]; }
  function radii(S, c0, c1, N) {
    const R = new Float32Array(N);
    for (let i = 0; i < N; i += 1) {
      const th = (i / N) * TAU, dx = Math.sin(th), dz = Math.cos(th); let best = 0;
      for (let q = 0; q < S.length; q += 1) {
        const s = S[q], px = s[0] - c0, pz = s[1] - c1, rx = s[2] - s[0], rz = s[3] - s[1], den = dx * rz - dz * rx;
        if (Math.abs(den) < 1e-9) continue;
        const t = (px * rz - pz * rx) / den, u = (px * dz - pz * dx) / den;
        if (t > 0.005 && u >= 0 && u <= 1 && (best === 0 || t < best)) best = t;
      }
      R[i] = best;
    }
    let mean = 0, cnt = 0; R.forEach((v) => { if (v > 0) { mean += v; cnt += 1; } }); mean = cnt ? mean / cnt : 0.1;
    for (let i = 0; i < N; i += 1) if (!R[i]) R[i] = mean;
    const O = new Float32Array(N); for (let i = 0; i < N; i += 1) O[i] = (R[(i + N - 1) % N] + R[i] * 2 + R[(i + 1) % N]) / 4;
    return O;
  }

  // ------------------------------------------------------------------ накопитель геометрии деталей (вершинные цвета; веса считаются по положению вершин)
  function Acc() { this.pos = []; this.nor = []; this.col = []; }
  Acc.prototype.tri = function (a, b, c) { [a, b, c].forEach((v) => { this.pos.push(v.p[0], v.p[1], v.p[2]); this.nor.push(v.n[0], v.n[1], v.n[2]); this.col.push(v.c[0], v.c[1], v.c[2]); }); };
  Acc.prototype.quad = function (a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); };
  Acc.prototype.geo = function (parts) {
    const g = cmerge(parts), p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color.array;
    for (let i = 0; i < p.length; i += 1) { this.pos.push(p[i]); this.nor.push(n[i]); this.col.push(c[i]); }
    g.dispose();
  };
  Acc.prototype.mesh = function (mat) {
    const T = THREE, n = this.pos.length / 3, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i += 1) weights(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2], si, sw, i * 4);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(Float32Array.from(this.pos), 3)); g.setAttribute('normal', new T.BufferAttribute(Float32Array.from(this.nor), 3));
    g.setAttribute('color', new T.BufferAttribute(Float32Array.from(this.col), 3));
    g.setAttribute('skinIndex', new T.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new T.BufferAttribute(sw, 4));
    return new T.SkinnedMesh(g, mat);
  };
  // сетка-«наклейка» по поверхности: прямоугольник w×h вокруг (x0,y0), повёрнутый на rot, цвет cfn(u,v) или c
  function patch(acc, B, x0, y0, w, h, nx, ny, off, front, rot, c, cfn) {
    const cs = Math.cos(rot || 0), sn = Math.sin(rot || 0), G = [];
    for (let j = 0; j <= ny; j += 1) {
      const row = [];
      for (let i = 0; i <= nx; i += 1) {
        const u = (i / nx - 0.5) * w, v = (j / ny - 0.5) * h, x = x0 + u * cs - v * sn, y = y0 + u * sn + v * cs, s = surf(B, x, y, front);
        row.push(s ? { p: [x + s.nx * off, y + s.ny * off, s.z + s.nz * off], n: [s.nx, s.ny, s.nz], c: cfn ? cfn(u, v) : c } : null);
      }
      G.push(row);
    }
    for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) { const a = G[j][i], b = G[j][i + 1], cc = G[j + 1][i + 1], d = G[j + 1][i]; if (a && b && cc && d) acc.quad(a, b, cc, d); }
  }
  // лента по ломаной pts=[[x,y],…] шириной wd, прилегающая к поверхности
  function strip(acc, B, pts, wd, off, front, c) {
    const L = [], R = [];
    for (let i = 0; i < pts.length; i += 1) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)];
      let tx = p1[0] - p0[0], ty = p1[1] - p0[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      [[-ty, tx, L], [ty, -tx, R]].forEach((e) => {
        const x = pts[i][0] + e[0] * wd * 0.5, y = pts[i][1] + e[1] * wd * 0.5, s = surf(B, x, y, front);
        e[2].push(s ? { p: [x + s.nx * off, y + s.ny * off, s.z + s.nz * off], n: [s.nx, s.ny, s.nz], c } : null);
      });
    }
    for (let i = 0; i + 1 < pts.length; i += 1) if (L[i] && L[i + 1] && R[i] && R[i + 1]) acc.quad(L[i], L[i + 1], R[i + 1], R[i]);
  }
  // кольцо вокруг оси: radii R (N лучей из (u0,z0)), высота h по оси t0, наружу на off, раструб flare на верхней кромке, пропуск участков skip(θ)
  function ring(acc, R, u0, z0, axis, t0, h, off, c, flare, skip) {
    const N = R.length, P = (th, r, t) => (axis === 'y' ? [u0 + r * Math.sin(th), t, z0 + r * Math.cos(th)] : [t, u0 + r * Math.sin(th), z0 + r * Math.cos(th)]);
    const Nn = (th) => (axis === 'y' ? [Math.sin(th), 0, Math.cos(th)] : [0, Math.sin(th), Math.cos(th)]);
    for (let i = 0; i < N; i += 1) {
      const j = (i + 1) % N, ti = (i / N) * TAU, tj = ((i + 1) / N) * TAU; if (skip && skip((ti + tj) / 2)) continue;
      const ca = (k) => mix(c, mul(c, 1.35), k), mk = (th, r, t, k) => ({ p: P(th, r, t), n: Nn(th), c: ca(k) });
      acc.quad(mk(ti, R[i] + off, t0 - h / 2, 0), mk(tj, R[j] + off, t0 - h / 2, 0), mk(tj, R[j] + off + (flare || 0), t0 + h / 2, 0.3), mk(ti, R[i] + off + (flare || 0), t0 + h / 2, 0.3));
    }
  }
  let _M, _Q, _Z, _N, _P, _S1;                       // THREE подгружается при старте миссии — временные объекты создаём лениво
  // ставит примитив C.geo на поверхность (x,y), ось +z детали — по нормали, поворот rz в плоскости
  function put(part, B, x, y, front, off, rz) {
    if (!_M) { _M = new THREE.Matrix4(); _Q = new THREE.Quaternion(); _Z = new THREE.Vector3(0, 0, 1); _N = new THREE.Vector3(); _P = new THREE.Vector3(); _S1 = new THREE.Vector3(1, 1, 1); }
    const s = surf(B, x, y, front); if (!s) return null;
    _N.set(s.nx, s.ny, s.nz); _Q.setFromUnitVectors(_Z, _N); _P.set(x + s.nx * off, y + s.ny * off, s.z + s.nz * off);
    const M = new THREE.Matrix4().compose(_P, _Q, _S1);
    if (rz) M.multiply(_M.makeRotationZ(rz));
    part.m = M.multiply(part.m);
    return part;
  }

  // ------------------------------------------------------------------ оболочка-одежда: обрезка исходной сетки по полю field>0 с интерполяцией на рёбрах
  function clipShell(B, field, offFn, colFn, mat) {
    const T = THREE, P = B.pos, N = B.nor, I = B.idx, nv = B.nv, fv = new Float32Array(nv);
    for (let i = 0; i < nv; i += 1) fv[i] = field(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const oP = [], oN = [], oSI = [], oSW = [], oF = [], mapV = new Int32Array(nv).fill(-1), mapE = new Map(), ind = [];
    const outV = (i) => {
      if (mapV[i] < 0) {
        mapV[i] = oF.length; oF.push(fv[i]); oP.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); oN.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
        for (let j = 0; j < 4; j += 1) { oSI.push(B.si[i * 4 + j]); oSW.push(B.sw[i * 4 + j]); }
      }
      return mapV[i];
    };
    const outE = (a, b) => { // a внутри (f>0), b снаружи
      const key = a < b ? a * nv + b : b * nv + a; let id = mapE.get(key); if (id !== undefined) return id;
      const t = fv[a] / (fv[a] - fv[b]), s = t < 0.5 ? a : b;
      id = oF.length; oF.push(0);
      oP.push(P[a * 3] + (P[b * 3] - P[a * 3]) * t, P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * t, P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * t);
      const nx = N[a * 3] + (N[b * 3] - N[a * 3]) * t, ny = N[a * 3 + 1] + (N[b * 3 + 1] - N[a * 3 + 1]) * t, nz = N[a * 3 + 2] + (N[b * 3 + 2] - N[a * 3 + 2]) * t, l = Math.hypot(nx, ny, nz) || 1;
      oN.push(nx / l, ny / l, nz / l);
      for (let j = 0; j < 4; j += 1) { oSI.push(B.si[s * 4 + j]); oSW.push(B.sw[s * 4 + j]); }
      mapE.set(key, id); return id;
    };
    for (let t = 0; t < I.length; t += 3) {
      const v = [I[t], I[t + 1], I[t + 2]], inn = v.map((q) => fv[q] > 0), c = inn[0] + inn[1] + inn[2];
      if (!c) continue;
      if (c === 3) { ind.push(outV(v[0]), outV(v[1]), outV(v[2])); continue; }
      const poly = [];
      for (let k = 0; k < 3; k += 1) {
        const a = v[k], b = v[(k + 1) % 3], ia = inn[k], ib = inn[(k + 1) % 3];
        if (ia) poly.push(outV(a));
        if (ia !== ib) poly.push(ia ? outE(a, b) : outE(b, a));
      }
      for (let k = 1; k + 1 < poly.length; k += 1) ind.push(poly[0], poly[k], poly[k + 1]);
    }
    const n = oF.length, pos = new Float32Array(oP), colA = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], nx = oN[i * 3], ny = oN[i * 3 + 1], nz = oN[i * 3 + 2], o = offFn(x, y, z, oF[i]);
      pos[i * 3] = x + nx * o; pos[i * 3 + 1] = y + ny * o; pos[i * 3 + 2] = z + nz * o;
      const c = colFn(x, y, z, oF[i], nx, ny, nz); colA[i * 3] = c[0]; colA[i * 3 + 1] = c[1]; colA[i * 3 + 2] = c[2];
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(new Float32Array(oN), 3)); g.setAttribute('color', new T.BufferAttribute(colA, 3));
    g.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(oSI), 4)); g.setAttribute('skinWeight', new T.BufferAttribute(new Float32Array(oSW), 4));
    g.setIndex(ind);
    return new T.SkinnedMesh(g, mat);
  }

  // ------------------------------------------------------------------ одежда и детали
  const JKT = RGB(0x15161a), JKT2 = RGB(0x2a2c34), TEEC = RGB(0xe6e6e8), DEN = RGB(0x1b2542), DEN2 = RGB(0x3f5584), BOOT = RGB(0x0d0d0f), SILV = 0xb9bcc2, GOLD = 0xc9a24a;
  const HEMY = 1.12, WAIST = 1.095, BELTY = 1.075, JEANB = 0.26, BOOTT = 0.33;
  const jacketField = (x, y, z) => { const ax = Math.abs(x); return Math.min(y - HEMY, 1.505 - y, Math.hypot(x, z - NZ) - 0.064, ax - (y - 1.31) * 0.62 + sst(0.07, -0.03, z) * 0.6, 0.72 - ax); };
  const teeField = (x, y, z) => { const ax = Math.abs(x); return Math.min(y - 1.04, 1.505 - y, Math.hypot(x, z - NZ) - 0.058, ax - (y - 1.39) * 0.5 + sst(0.07, -0.03, z) * 0.6, 0.27 - ax); };
  const jeansField = (x, y) => Math.min(WAIST - y, y - JEANB);
  const bootField = (x, y) => BOOTT - y;
  const edgeOff = (f, w, a) => (f < w ? a * (1 - f / w) : 0); // валик по краю оболочки

  function buildClothes(B, parts) {
    const mk = (emi) => sk_(lam({ vertexColors: true, emissive: emi, side: THREE.DoubleSide }));
    // куртка
    parts.push(clipShell(B, jacketField, (x, y, z, f) => 0.013 + 0.004 * sst(0.2, 0.3, Math.abs(x)) + edgeOff(f, 0.014, 0.004),
      (x, y, z, f, nx, ny) => { const h = hash(x * 9, y * 9, z * 9); return mix(JKT, JKT2, clamp(ny * 0.9 + 0.15 + (h - 0.5) * 0.35, 0, 1)); }, mk(0x0a0a0d)));
    // футболка с V-вырезом
    parts.push(clipShell(B, teeField, () => 0.006, (x, y, z, f, nx, ny) => mul(TEEC, 0.88 + 0.12 * clamp(ny + 0.5, 0, 1) - 0.12 * sst(0.05, 0, f)), mk(0x2c2c2e)));
    // джинсы: вытертые бёдра и колени, складки у паха
    parts.push(clipShell(B, jeansField, (x, y, z, f) => 0.009 + 0.003 * sst(0.45, 0.9, y) + edgeOff(f, 0.012, 0.003),
      (x, y, z, f, nx, ny, nz) => {
        const h = hash(x * 13, y * 13, z * 13);
        let fade = 0.28 * sst(0.02, 0.09, z) * sst(0.4, 0.62, y) * (1 - sst(0.78, 0.92, y)) + 0.3 * Math.max(0, 1 - Math.abs(y - 0.52) / 0.07) * sst(0, 0.04, z);
        fade += 0.16 * Math.max(0, Math.sin(y * 62 + x * 9)) * sst(0.8, 1.0, y) * (1 - sst(1.0, 1.08, y)); // складки у бедра
        return mix(DEN, DEN2, clamp(fade + (h - 0.5) * 0.12, 0, 1));
      }, mk(0x07090f)));
    // ботинки: подошва, носок, голенище
    parts.push(clipShell(B, bootField, (x, y, z) => 0.010 + 0.012 * sst(0.045, 0.01, y), (x, y, z, f, nx, ny, nz) => {
      if (y < 0.026) return RGB(0x1b1b1d);
      if (y < 0.04) return RGB(0x060606);
      return mix(BOOT, RGB(0x2a2a2e), clamp(0.6 * sst(0.07, 0.17, z) * sst(0.0, 0.12, y) * (1 - sst(0.12, 0.2, y)) + 0.35 * clamp(ny, 0, 1), 0, 1));
    }, mk(0x050505)));
  }

  function buildDetails(B, jointsOut) {
    const A = new Acc(), V = (h) => RGB(h), pieces = [];
    const addGeo = (a) => A.geo(a.filter(Boolean));
    // -- торс: центр сечения и контуры
    const tor = slice(B, 'y', BELTY), tc = centroid(tor), torR = radii(tor, tc[0], tc[1], 40);
    // ремень (кожа, прошивка) + пряжка + шлёвки
    ring(A, torR, tc[0], tc[1], 'y', BELTY, 0.034, 0.0165, V(0x0b0b0d), 0, null);
    ring(A, torR, tc[0], tc[1], 'y', BELTY + 0.0175, 0.003, 0.0172, V(0x3a3a40), 0, null);
    ring(A, torR, tc[0], tc[1], 'y', BELTY - 0.0175, 0.003, 0.0172, V(0x3a3a40), 0, null);
    const bz = surf(B, 0, BELTY, true);
    if (bz) {
      addGeo([put(col(box(0.056, 0.038, 0.006, 0, 0, 0), SILV), B, 0, BELTY, true, 0.021), put(col(box(0.036, 0.022, 0.008, 0, 0, 0), 0x0c0c0e), B, 0, BELTY, true, 0.0215), put(col(box(0.006, 0.02, 0.009, 0.004, 0, 0), SILV), B, 0, BELTY, true, 0.0222),
        put(col(box(0.05, 0.007, 0.004, 0.04, -0.012, 0), 0x101012), B, 0.07, BELTY - 0.012, true, 0.0195, 0.0)]);
      [-0.15, -0.085, 0.085, 0.15].forEach((lx) => addGeo([put(col(box(0.014, 0.046, 0.006, 0, 0.003, 0), 0x16161a), B, lx, BELTY, true, 0.0215)]));
    }
    [-0.13, 0.13].forEach((lx) => addGeo([put(col(box(0.014, 0.046, 0.006, 0, 0.003, 0), 0x16161a), B, lx, BELTY, false, 0.0215)]));
    // верх пояса джинсов (кромка), клёпки
    ring(A, torR, tc[0], tc[1], 'y', WAIST - 0.004, 0.008, 0.0125, V(0x141c34), 0, null);
    // -- джинсы: передние карманы (косая кромка со строчкой), гульфик, задние карманы
    [-1, 1].forEach((s) => {
      const arc = []; for (let i = 0; i <= 8; i += 1) { const t = i / 8; arc.push([s * (0.075 + 0.1 * Math.sin(t * 1.3)), WAIST - 0.012 - 0.1 * (1 - Math.cos(t * 1.25))]); }
      strip(A, B, arc, 0.006, 0.0125, true, V(0xb98e3e));
      const arc2 = arc.map((q) => [q[0] + s * 0.007, q[1] - 0.006]); strip(A, B, arc2, 0.0035, 0.0127, true, V(0xb98e3e));
      addGeo([put(sph(0.0045, 0, 0, 0, 1, 1, 0.6, 5), B, arc[0][0], arc[0][1], true, 0.0135), put(sph(0.0045, 0, 0, 0, 1, 1, 0.6, 5), B, arc[8][0], arc[8][1], true, 0.0135)].map((p) => p && col(p, GOLD)));
      // задний карман: нашивка, строчка по контуру, двойная дуга
      const bx = s * 0.082, by = 0.99, rot = -s * 0.12;
      patch(A, B, bx, by, 0.095, 0.105, 6, 6, 0.0128, false, rot, V(0x27345c), (u, v) => mix(DEN, DEN2, 0.18 + 0.14 * hash(u * 40, v * 40, s) - 0.1 * sst(-0.01, -0.05, v)));
      const cs = Math.cos(rot), sn = Math.sin(rot), R = (u, v) => [bx + u * cs - v * sn, by + u * sn + v * cs];
      strip(A, B, [R(-0.049, 0.053), R(0.049, 0.053), R(0.049, -0.01), R(0, -0.056), R(-0.049, -0.01), R(-0.049, 0.053)], 0.0035, 0.0134, false, V(0xc9a24a));
      strip(A, B, [R(-0.036, 0.034), R(0, -0.02), R(0.036, 0.034)], 0.0035, 0.0134, false, V(0xc9a24a));
      addGeo([put(sph(0.0042, 0, 0, 0, 1, 1, 0.6, 5), B, R(-0.049, 0.053)[0], R(-0.049, 0.053)[1], false, 0.0142), put(sph(0.0042, 0, 0, 0, 1, 1, 0.6, 5), B, R(0.049, 0.053)[0], R(0.049, 0.053)[1], false, 0.0142)].map((p) => p && col(p, GOLD)));
    });
    strip(A, B, [[0.0, WAIST - 0.02], [0.0, 0.99], [0.016, 0.955], [0.03, 0.935]], 0.005, 0.0125, true, V(0xb98e3e)); // гульфик
    strip(A, B, [[0.0, WAIST - 0.02], [0.0, 1.0], [-0.012, 0.965]], 0.004, 0.0125, true, V(0x10182e));
    // шов вдоль ног (внешний), строчка по подолу — в виде колец у голенищ
    // -- куртка: подол-резинка, манжеты, молния, лацканы, воротник, карманы, заклёпки
    ring(A, torR, tc[0], tc[1], 'y', HEMY - 0.019, 0.042, 0.0215, V(0x1f2026), 0, null);
    [-1, 1].forEach((s) => {
      const xs = s * 0.685, as = slice(B, 'x', xs), ac = centroid(as), aR = radii(as, ac[0], ac[1], 22);
      ring(A, aR, ac[0], ac[1], 'x', xs, 0.055, 0.0275, V(0x1f2026), 0, null);
      ring(A, aR, ac[0], ac[1], 'x', xs - s * 0.03, 0.006, 0.0285, V(0x3a3c45), 0, null);
      const bs = slice(B, 'x', s * 0.4), bc = centroid(bs), bR = radii(bs, bc[0], bc[1], 22); // шов-кант на рукаве выше локтя
      ring(A, bR, bc[0], bc[1], 'x', s * 0.4, 0.007, 0.0235, V(0x35373f), 0, null);
    });
    // молния (тесьма + зубцы + бегунок)
    const zip = []; for (let i = 0; i <= 14; i += 1) zip.push([0, HEMY - 0.005 + (1.31 - HEMY + 0.005) * (i / 14)]);
    strip(A, B, zip, 0.014, 0.0185, true, V(0x23242a));
    for (let i = 0; i < 17; i += 1) { const y = HEMY + 0.005 + i * 0.0108; addGeo([put(col(box(i % 2 ? 0.006 : 0.005, 0.0052, 0.0045, i % 2 ? 0.0028 : -0.0028, 0, 0), SILV), B, 0, y, true, 0.0205)]); }
    addGeo([put(col(box(0.016, 0.028, 0.006, 0, 0, 0), SILV), B, 0, 1.285, true, 0.0225), put(col(box(0.007, 0.03, 0.005, 0, -0.026, 0), 0x8f9299), B, 0, 1.27, true, 0.0215), put(col(box(0.02, 0.006, 0.006, 0, 0.0155, 0), 0xcfd2d8), B, 0, 1.31, true, 0.0225)]);
    [-1, 1].forEach((s) => {
      // лацкан: полоса вдоль кромки V-выреза, шириной растёт вверх
      const edge = [], out = [];
      for (let i = 0; i <= 9; i += 1) { const y = 1.31 + i * 0.026, x = s * ((y - 1.31) * 0.62); edge.push([x, y]); out.push([x + s * (0.012 + i * 0.0035), y + 0.004]); }
      const mid = edge.map((q, i) => [(q[0] + out[i][0]) / 2, (q[1] + out[i][1]) / 2]);
      strip(A, B, mid, 0.034, 0.0215, true, V(0x24252c));
      strip(A, B, edge, 0.005, 0.0222, true, V(0x3c3e48));
      // карман: косая прорезь с кантом и маленькой молнией
      const p0 = [s * 0.205, 1.215], p1 = [s * 0.115, 1.165];
      strip(A, B, [p0, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], p1], 0.014, 0.0185, true, V(0x2f313a));
      strip(A, B, [p0, p1], 0.004, 0.0195, true, V(0x0a0a0c));
      addGeo([put(col(box(0.012, 0.012, 0.005, 0, 0, 0), SILV), B, p0[0] - s * 0.012, p0[1] - 0.004, true, 0.0215), put(col(box(0.006, 0.02, 0.004, 0, 0, 0), SILV), B, p1[0], p1[1], true, 0.021)]);
      // заклёпки на плечевом шве
      addGeo([put(sph(0.005, 0, 0, 0, 1, 1, 0.6, 6), B, s * 0.14, 1.54, true, 0.019), put(sph(0.005, 0, 0, 0, 1, 1, 0.6, 6), B, s * 0.17, 1.52, true, 0.019)].map((p) => p && col(p, SILV)));
    });
    // ботинки: ободок голенища, шнуровка-язык, каблук
    [-1, 1].forEach((s) => {
      const lg = slice(B, 'y', BOOTT).filter((q) => (q[0] + q[2]) * s > 0), lc = centroid(lg), lR = radii(lg, lc[0], lc[1], 24);
      ring(A, lR, lc[0], lc[1], 'y', BOOTT - 0.004, 0.026, 0.0175, V(0x08080a), 0.004, null);
      ring(A, lR, lc[0], lc[1], 'y', BOOTT - 0.02, 0.004, 0.0175, V(0x2a2a30), 0, null);
      const hs = surf(B, s * 0.1, 0.045, false);
      if (hs) addGeo([put(col(box(0.075, 0.06, 0.05, 0, 0, 0), 0x070707), B, s * 0.1, 0.04, false, 0.0), put(col(box(0.08, 0.012, 0.055, 0, 0, 0), 0x1a1a1c), B, s * 0.1, 0.012, false, 0.0)]);
      // язык и строчка носка
      const ts = surf(B, s * 0.1, 0.07, true);
      if (ts) strip(A, B, [[s * 0.1 - 0.035, 0.06], [s * 0.1, 0.075], [s * 0.1 + 0.035, 0.06]], 0.004, 0.0135, true, V(0x3a3a40));
    });
    return A;
  }

  // ------------------------------------------------------------------ сборка девушки
  F.woman = async function (r, x, z, yaw, o) {
    o = o || {};
    const n = r.npc(x, z, yaw), body = await F.loadWoman();
    n.isWoman = true;
    n.g.traverse((m) => { if (m.isMesh) m.visible = false; });
    if (!body) { n.g.traverse((m) => { if (m.isMesh) m.visible = true; }); return n; } // нет файла — обычный стикмен
    const T = THREE, B = prep(body), parts = [];
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(B.pos, 3)); g.setAttribute('normal', new T.BufferAttribute(B.nor, 3)); g.setAttribute('color', new T.BufferAttribute(B.col, 3));
    g.setAttribute('skinIndex', new T.BufferAttribute(B.si, 4)); g.setAttribute('skinWeight', new T.BufferAttribute(B.sw, 4)); g.setIndex(new T.BufferAttribute(B.idx, 1));
    parts.push(new T.SkinnedMesh(g, sk_(vcMat(0x101012))));
    if ((o.outfit || 'jacket') === 'jacket') {
      buildClothes(B, parts);
      const A = buildDetails(B);
      parts.push(A.mesh(sk_(lam({ vertexColors: true, emissive: 0x0c0c0e, side: T.DoubleSide }))));
    }
    // Т-поза для привязки; пружинные кости — дети торса/бёдер в центрах областей
    const sv = [n.armL.rotation.z, n.armR.rotation.z];
    n.armL.rotation.z = -PI / 2; n.armR.rotation.z = PI / 2;
    n.g.updateMatrixWorld(true);
    const jb = JIG.map((q) => {
      const b = new T.Group(), par = q.p ? n.spine : n.hips, w = new T.Vector3(q.c[0], q.c[1], q.c[2]);
      n.g.localToWorld(w); par.worldToLocal(w); b.position.copy(w); par.add(b); return b;
    });
    n.g.updateMatrixWorld(true);
    parts.forEach((m) => { m.frustumCulled = false; n.g.add(m); });
    n.g.updateMatrixWorld(true);
    const sk = new T.Skeleton(boneList(n).concat(jb));
    parts.forEach((m) => m.bind(sk, m.matrixWorld));
    n.armL.rotation.z = sv[0]; n.armR.rotation.z = sv[1];
    n.skinMeshes = parts; n.jigBones = jb;
    F.womanDress(r, n, await F.loadHair());
    F.jigAdd(r, n, jb);
    return n;
  };

  // ------------------------------------------------------------------ волосы и голова (лицо без черт: ни носа, ни губ, ни очков, ни ушей)
  const HAIR = { s: [0.62, 0.62, 0.62], p: [0, -0.435, -0.04], top: 1.124, len: 0.716 }; // посадка файла волос на голову: масштаб, сдвиг (система головы до сдвига hr), верх темени, длина прядей
  F.womanDress = function (r, n, HD) {
    const T = THREE, hr = new T.Group(); hr.position.y = NECK * WS; n.head.add(hr); n.headRoot = hr; // шея удлинена — голова выше
    n.hairG = null; n.hairSway = null; n.glasses = null;
    if (!HD) return;
    const p = HD.part, geo = new T.BufferGeometry(), tex = new T.Texture(HD.img); tex.needsUpdate = true; tex.anisotropy = 4;
    geo.setAttribute('position', new T.BufferAttribute(p.pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(p.nor, 3));
    geo.setAttribute('uv', new T.BufferAttribute(p.uv, 2)); geo.setIndex(new T.BufferAttribute(p.idx, 1));
    const U = { value: new T.Vector3() };
    const mat = new T.MeshLambertMaterial({ map: tex, color: 0x2b1d15, emissive: 0x0a0605, alphaTest: 0.42, side: T.DoubleSide });
    mat.onBeforeCompile = (sh) => { // качание: вершины ниже темени смещаются на uSway пропорционально квадрату расстояния от макушки
      sh.uniforms.uSway = U;
      sh.vertexShader = 'uniform vec3 uSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', 'float hw = clamp((' + HAIR.top.toFixed(3) + ' - position.y) / ' + HAIR.len.toFixed(3) + ', 0.0, 1.0); vec3 transformed = position + uSway * hw * hw;');
    };
    const mesh = new T.Mesh(geo, mat); mesh.frustumCulled = false;
    mesh.scale.set(HAIR.s[0], HAIR.s[1], HAIR.s[2]); mesh.position.set(HAIR.p[0], HAIR.p[1], HAIR.p[2]);
    hr.add(mesh); n.hairG = mesh; n.hairSway = { u: U, s: HAIR.s };
  };

  // ------------------------------------------------------------------ пружинная физика: грудь, ягодицы, хвост волос
  // состояние пружины: смещение p (локально в родителе), скорость v; возбуждение — ускорение точки крепления в мире
  function mkSpring(rest, k, cc, g, lim, idle, hz) {
    const T = THREE;
    return { rest: rest.clone(), k, cc, g: new T.Vector3(g[0], g[1], g[2]), lim, idle, hz, p: new T.Vector3(), v: new T.Vector3(), pw: new T.Vector3(), pv: new T.Vector3(), init: false, ph: Math.random() * TAU };
  }
  let _w, _a, _q;
  function springStep(st, par, dt, t) {
    if (!_w) { _w = new THREE.Vector3(); _a = new THREE.Vector3(); _q = new THREE.Quaternion(); }
    par.updateWorldMatrix(true, false);
    _w.copy(st.rest); par.localToWorld(_w);
    if (!st.init) { st.init = true; st.pw.copy(_w); st.pv.set(0, 0, 0); return; }
    _a.copy(_w).sub(st.pw);
    if (_a.lengthSq() > 0.36) { st.pw.copy(_w); st.pv.set(0, 0, 0); st.p.set(0, 0, 0); st.v.set(0, 0, 0); return; } // телепорт / смена кадра
    if (!(dt > 1e-4)) { st.pw.copy(_w); return; }
    _a.divideScalar(dt);
    const ax = (_a.x - st.pv.x) / dt, ay = (_a.y - st.pv.y) / dt, az = (_a.z - st.pv.z) / dt;
    st.pw.copy(_w); st.pv.copy(_a);
    _a.set(ax, ay, az); const al = _a.length(); if (!(al < 1e6)) { st.p.set(0, 0, 0); st.v.set(0, 0, 0); st.pv.set(0, 0, 0); return; } if (al > 60) _a.multiplyScalar(60 / al);
    par.getWorldQuaternion(_q); _q.invert(); _a.applyQuaternion(_q);
    _a.y += st.idle * Math.sin(t * st.hz * TAU + st.ph);
    const steps = 3, h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      st.v.x += (-st.k * st.p.x - st.cc * st.v.x - st.g.x * _a.x) * h; st.v.y += (-st.k * st.p.y - st.cc * st.v.y - st.g.y * _a.y) * h; st.v.z += (-st.k * st.p.z - st.cc * st.v.z - st.g.z * _a.z) * h;
      st.p.x += st.v.x * h; st.p.y += st.v.y * h; st.p.z += st.v.z * h;
    }
    const L = st.p.length(); if (!(L < 10)) { st.p.set(0, 0, 0); st.v.set(0, 0, 0); return; }
    if (L > st.lim) { st.p.multiplyScalar(st.lim / L); const vn = st.v.dot(st.p) / (st.lim * st.lim); if (vn > 0) st.v.addScaledVector(st.p, -vn); }
  }
  F.jigAdd = function (r, n, jb) {
    const T = THREE, J = r.f48jig || (r.f48jig = []);
    const e = { n, t: Math.random() * 7, bones: JIG.map((q, i) => ({ bone: jb[i], par: jb[i].parent, st: mkSpring(jb[i].position, q.k, q.cc, q.g, q.lim, q.idle, q.hz) })), tail: null };
    if (n.hairSway) e.tail = { sw: n.hairSway, par: n.head, st: mkSpring(new T.Vector3(0, 0.2, -0.1), 60, 3.2, [1.2, 0.4, 1.2], 0.1, 0.1, 0.13) };
    n.jig = e; J.push(e);
    if (!r.f48jigOn) { r.f48jigOn = true; (r.kitUpd || (r.kitUpd = [])).push((dt) => F.jigStep(r, dt)); }
    return e;
  };
  F.jigStep = function (r, dt) {
    const J = r.f48jig; if (!J || !J.length || !(dt > 0)) return;
    dt = Math.min(dt, 0.05);
    for (let i = 0; i < J.length; i += 1) {
      const e = J[i]; if (!e.n.g.parent) continue;
      e.t += dt;
      for (let k = 0; k < e.bones.length; k += 1) { const b = e.bones[k]; springStep(b.st, b.par, dt, e.t); b.bone.position.copy(b.st.rest).add(b.st.p); }
      if (e.tail) { const t = e.tail, q = t.st.p, sc = t.sw.s; springStep(t.st, t.par, dt, e.t); t.sw.u.value.set(q.x * 1.7 / sc[0], q.y * 0.5 / sc[1], q.z * 1.7 / sc[2]); }
    }
  };
}());
