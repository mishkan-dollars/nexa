// NEXA: миссия 48 — персонажи. Диктор (серый стикмен + голова dictorhead.glb), девушка (woman.nxm со скиннингом на скелет стикмена, одежда, волосы, очки, сигарета),
// тяжёлые костюмы, мешок, мужчина в маске, миниган в руках NPC, позы (сидеть / рука к точке).
// Только добавляет: C.f48.*; существующие функции не меняются (кроме обёртки C.enemyGunGeo для вида 'minigun').
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.geo || !C.Run) return;
  const { Run } = C;
  const { box, cylY, sph, cylZ, merge, m4 } = C.geo;
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const F = C.f48 = C.f48 || {};

  // ------------------------------------------------------------------ геометрия с цветом вершин (один draw call на сборку)
  function cmerge(parts) {
    const T = THREE, pos = [], nor = [], col = [], v = new T.Vector3(), nm = new T.Matrix3(), cc = new T.Color();
    parts.forEach((p) => {
      const gi = p.g.index ? p.g.toNonIndexed() : p.g, pa = gi.attributes.position, na = gi.attributes.normal;
      nm.getNormalMatrix(p.m); cc.setHex(p.c === undefined ? 0xffffff : p.c);
      for (let i = 0; i < pa.count; i += 1) {
        v.fromBufferAttribute(pa, i).applyMatrix4(p.m); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
        col.push(cc.r, cc.g, cc.b);
      }
      if (gi !== p.g) gi.dispose();
      p.g.dispose();
    });
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return out;
  }
  const col = (p, c) => { p.c = c; return p; };
  F.cmerge = cmerge; F.col = col;
  const lam = (o) => new THREE.MeshLambertMaterial(o);
  const vcMat = (em) => lam({ vertexColors: true, emissive: em === undefined ? 0x0c0c0c : em });
  F.vcMat = vcMat;

  // ------------------------------------------------------------------ холщовая ткань (мешок)
  function burlapTex() {
    if (F._burlap) return F._burlap;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#8a7f69'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 2) { g.fillStyle = 'rgba(0,0,0,' + (0.1 + Math.random() * 0.14) + ')'; g.fillRect(0, y, 128, 1); }
    for (let x = 0; x < 128; x += 2) { g.fillStyle = 'rgba(255,255,255,' + (0.04 + Math.random() * 0.1) + ')'; g.fillRect(x, 0, 1, 128); }
    for (let i = 0; i < 700; i += 1) { g.fillStyle = Math.random() < 0.5 ? 'rgba(30,20,10,0.25)' : 'rgba(255,240,210,0.18)'; g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
    return (F._burlap = t);
  }

  // ------------------------------------------------------------------ голова Диктора (assets/models/dictorhead.glb: волосы + очки; лица нет)
  let headP = null;
  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
  F.loadHead = function () {
    if (headP) return headP;
    headP = (async () => {
      try {
        await C.loadThree();
        const T = THREE;
        if (!T.GLTFLoader) await (window.__nexaGltf || (window.__nexaGltf = loadScript('assets/lib/GLTFLoader.js')));
        const gl = await new Promise((res, rej) => new T.GLTFLoader().load('assets/models/dictorhead.glb', res, undefined, rej));
        gl.scene.traverse((o) => {
          if (!o.isMesh) return;
          const m = o.material, map = m.map || null;
          if (map) map.encoding = T.LinearEncoding;
          const glass = !!m.transparent && !map;
          o.material = new T.MeshLambertMaterial({
            color: m.color ? m.color.clone() : 0xffffff, map, side: m.side, transparent: !!m.transparent, opacity: m.opacity === undefined ? 1 : m.opacity, alphaTest: m.alphaTest || 0,
            emissive: map ? 0xffffff : glass ? 0x000000 : 0x151515, emissiveMap: map, emissiveIntensity: map ? 0.32 : 1
          });
        });
        return gl.scene;
      } catch (e) { console.warn('[f48 head]', e); return null; }
    })();
    return headP;
  };
  const greyMat = (r) => r.__f48grey || (r.__f48grey = lam({ color: 0x5a5a5a, emissive: 0x080808 }));
  // Диктор: серый стикмен, на голове — модель с причёской и очками. n.ready — промис загрузки головы.
  F.dictor = function (r, x, z, yaw) {
    const n = r.npc(x, z, yaw), gm = greyMat(r);
    n.g.traverse((o) => { if (o.isMesh && o.material === r.agm.body) o.material = gm; });
    n.isDictor = true;
    n.ready = F.loadHead().then((h) => {
      if (!h || !n.head) return n;
      const hd = h.clone(true); hd.scale.setScalar(0.0151); hd.position.set(0, 0.14, 0.005); hd.frustumCulled = false;
      hd.traverse((o) => { o.frustumCulled = false; });
      n.head.add(hd); n.hair = hd;
      return n;
    });
    return n;
  };

  // девушка (woman.nxm, одежда, пружинная физика) — в js/f48woman.js

  // сигарета в правой руке (elbR): тлеющий кончик; возвращает {tip: Object3D}
  F.cigarette = function (r, n, side) {
    const T = THREE, el = side === 'L' ? n.elbL : n.elbR;
    const g = new T.Group(), P = [col(cylY(0.0045, 0.0045, 0.085, 0, 0, 0, 1, 1, 6), 0xf0f0f0), col(cylY(0.0047, 0.0047, 0.02, 0, -0.0525, 0, 1, 1, 6), 0xc7863a)];
    const body = new T.Mesh(cmerge(P), new T.MeshBasicMaterial({ vertexColors: true }));
    const tip = new T.Mesh(new T.SphereGeometry(0.0055, 6, 4), new T.MeshBasicMaterial({ color: 0xff5a1a }));
    tip.position.set(0, 0.0445, 0); g.add(body); g.add(tip);
    g.rotation.set(0, 0, 0); g.position.set(0, -0.34, 0.03); g.rotation.x = -1.2; g.rotation.z = 0.2;
    el.add(g); n.cig = { g, tip };
    return n.cig;
  };

  // дым: пул спрайтов, поднимаются и расплываются
  F.smoke = function (r) {
    if (r.f48smoke) return r.f48smoke;
    const T = THREE, c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(235,235,235,0.55)'); gr.addColorStop(0.5, 'rgba(210,210,210,0.22)'); gr.addColorStop(1, 'rgba(200,200,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const tex = new T.CanvasTexture(c), S = { list: [], i: 0 };
    for (let i = 0; i < 28; i += 1) {
      const m = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: 0xdddddd }));
      m.visible = false; m.renderOrder = 4; r.scene.add(m); S.list.push({ m, v: new T.Vector3(), life: 0, max: 1, s0: 0.05, s1: 0.4 });
    }
    S.emit = (p, vel, o) => {
      const q = S.list[S.i]; S.i = (S.i + 1) % S.list.length; o = o || {};
      q.m.position.copy(p); q.v.set(vel[0], vel[1], vel[2]); q.life = q.max = o.life || 2.2; q.s0 = o.s0 || 0.04; q.s1 = o.s1 || 0.38; q.a = o.a || 0.6; q.m.visible = true;
    };
    S.tick = (dt) => {
      S.list.forEach((q) => {
        if (q.life <= 0) return;
        q.life -= dt; const k = 1 - q.life / q.max;
        if (q.life <= 0) { q.m.visible = false; return; }
        q.m.position.addScaledVector(q.v, dt); q.v.x *= 1 - dt * 0.5; q.v.z *= 1 - dt * 0.5; q.v.y += dt * 0.02;
        q.m.scale.setScalar(q.s0 + (q.s1 - q.s0) * Math.sqrt(k)); q.m.material.opacity = q.a * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (1 - k * 0.4);
      });
    };
    r.f48smoke = S;
    return S;
  };

  // ------------------------------------------------------------------ позы
  // сидящий стикмен (перекрывает позу updateNpc: вызывать из kitUpd)
  F.sit = function (n, o) {
    o = o || {};
    n.hips.position.y = o.hy === undefined ? 0.52 : o.hy; n.hips.rotation.set(0, 0, 0);
    n.legL.rotation.set(o.lx === undefined ? -1.45 : o.lx, 0, -0.08); n.legR.rotation.set(o.lx === undefined ? -1.45 : o.lx, 0, 0.08);
    n.kneeL.rotation.x = n.kneeR.rotation.x = o.kn === undefined ? 1.5 : o.kn; n.footL.rotation.x = n.footR.rotation.x = -0.1;
    n.spine.rotation.set(o.sx === undefined ? -0.06 : o.sx, o.sy || 0, o.sz || 0);
    n.armL.rotation.set(-0.5, 0, -0.1); n.armR.rotation.set(-0.5, 0, 0.1); n.elbL.rotation.x = n.elbR.rotation.x = -1.25;
  };
  const _v = () => F._tv || (F._tv = new THREE.Vector3());
  // рука side (-1 = armL, 1 = armR) тянется к мировой точке
  F.armTo = function (r, n, side, wx, wy, wz) {
    const v = _v(); v.set(wx, wy, wz);
    n.spine.updateWorldMatrix(true, false);
    n.spine.worldToLocal(v);
    const SH = [[-0.2, 0.46, 0], [0.2, 0.46, 0]];
    if (side < 0) r.solveArm(n.armL, n.elbL, SH[0], v, -1); else r.solveArm(n.armR, n.elbR, SH[1], v, 1);
  };

  // ------------------------------------------------------------------ мешок на голову
  F.sack = function (parent, yScale) {
    const T = THREE, pts = [], N = 12;
    for (let i = 0; i <= N; i += 1) {
      const t = i / N, y = -0.11 + t * 0.44;
      let r0 = t < 0.08 ? 0.07 + t * 0.9 : 0.15 * Math.sin(Math.min(1, 0.18 + t * 1.05) * PI * 0.5 * 1.06) * (1 - 0.1 * t) + 0.015;
      if (t > 0.86) r0 *= 1 - (t - 0.86) * 4.2;
      pts.push(new T.Vector2(Math.max(0.004, r0), y));
    }
    const g = new T.LatheGeometry(pts, 16);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = Math.sin(x * 61 + y * 37) * Math.cos(z * 53 + y * 29) * 0.006; p.setXYZ(i, x * (1 + k * 3), y, z * (1 + k * 3)); }
    g.computeVertexNormals();
    const m = new T.Mesh(g, lam({ map: burlapTex(), color: 0xb7ab92, emissive: 0x24201a, side: T.DoubleSide }));
    m.position.set(0, 0.07, 0.0); m.scale.set(1, yScale || 1, 1.05);
    const rope = new T.Mesh(new T.TorusGeometry(0.063, 0.007, 5, 14), lam({ color: 0x4a3a28, emissive: 0x120d08 }));
    rope.rotation.x = PI / 2; rope.position.set(0, -0.04, 0.0); m.add(rope);
    m.frustumCulled = false; parent.add(m);
    return m;
  };

  // ------------------------------------------------------------------ мужчина в маске (assets/models/mask.nxm + mask.jpg), чёрный пиджак
  let maskP = null;
  F.loadMask = function () {
    if (maskP) return maskP;
    maskP = (async () => {
      try {
        const rs = await fetch('assets/models/mask.nxm');
        if (!rs.ok || !C.decodeNXM) return null;
        const parts = C.decodeNXM(await rs.arrayBuffer()), img = await C.loadImage('assets/models/mask.jpg');
        return parts && parts.body && img ? { part: parts.body, img } : null;
      } catch (e) { return null; }
    })();
    return maskP;
  };
  F.maskman = function (r, x, z, yaw) {
    const n = r.npc(x, z, yaw), T = THREE;
    const suit = lam({ color: 0x1a1a1c, emissive: 0x08080a }), shirt = lam({ color: 0xe6e6e6, emissive: 0x303030 });
    n.g.traverse((o) => { if (o.isMesh && o.material === r.agm.body) o.material = suit; });
    // сорочка и галстук на груди
    const tie = new T.Mesh(cmerge([col(box(0.05, 0.3, 0.02, 0, 0.27, 0.168), 0x9a1717), col(box(0.07, 0.04, 0.03, 0, 0.41, 0.166), 0x7c1212), col(box(0.1, 0.34, 0.01, 0, 0.26, 0.164), 0xe6e6e6)]), vcMat(0x101010));
    tie.frustumCulled = false; n.spine.add(tie);
    n.ready = F.loadMask().then((M) => {
      const mat = new T.MeshBasicMaterial({ color: new T.Color(1.6, 1.6, 1.6), side: T.DoubleSide });
      let mesh;
      if (M) {
        const p = M.part, geo = new T.BufferGeometry(), tex = new T.Texture(M.img); tex.needsUpdate = true; mat.map = tex;
        geo.setAttribute('position', new T.BufferAttribute(p.pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(p.nor, 3));
        geo.setAttribute('uv', new T.BufferAttribute(p.uv, 2)); geo.setIndex(new T.BufferAttribute(p.idx, 1));
        mesh = new T.Mesh(geo, mat); mesh.scale.setScalar(1.2); mesh.position.set(0, 0.14, 0.075);
      } else {
        mat.color.setRGB(0.78, 0.78, 0.78); mesh = new T.Mesh(r.g.box, mat); mesh.scale.set(0.2, 0.27, 0.05); mesh.position.set(0, 0.14, 0.135);
      }
      mesh.frustumCulled = false; n.head.add(mesh); n.mask = mesh;
      return n;
    });
    return n;
  };

  // ------------------------------------------------------------------ тяжёлый костюм (визуал поверх стикмена или девушки)
  F.suit = function (r, n, o) {
    o = o || {};
    if (n.suitMeshes) return n;
    const T = THREE, steel = o.steel || 0x2d3036, dark = 0x17181b, lite = 0x4a4e57, red = 0xd01616, M = [];
    const mat = vcMat(0x0d0d10), glow = new T.MeshBasicMaterial({ vertexColors: true });
    const add = (parent, parts, m) => { const me = new T.Mesh(cmerge(parts), m || mat); me.frustumCulled = false; parent.add(me); M.push(me); return me; };
    // корпус: нагрудник со скосами, рёбра, воротник, ранец с баллонами
    add(n.spine, [
      col(box(0.42, 0.3, 0.28, 0, 0.27, 0.01), steel), col(box(0.34, 0.12, 0.3, 0, 0.12, 0.01), dark), col(box(0.36, 0.1, 0.1, 0, 0.36, 0.14, -0.35), lite),
      col(box(0.12, 0.28, 0.02, 0, 0.27, 0.162), dark), col(box(0.02, 0.2, 0.025, 0.07, 0.27, 0.165), lite), col(box(0.02, 0.2, 0.025, -0.07, 0.27, 0.165), lite),
      col(box(0.26, 0.16, 0.09, 0, 0.5, 0.0), dark), col(box(0.3, 0.32, 0.14, 0, 0.28, -0.2), dark), col(cylY(0.05, 0.05, 0.36, 0.1, 0.3, -0.32, 1, 1, 8), lite), col(cylY(0.05, 0.05, 0.36, -0.1, 0.3, -0.32, 1, 1, 8), lite),
      col(box(0.03, 0.34, 0.03, 0, 0.3, -0.12), dark), col(box(0.46, 0.06, 0.3, 0, 0.02, 0.0), steel)
    ]);
    add(n.spine, [col(box(0.09, 0.012, 0.02, 0, 0.3, 0.177), red), col(box(0.012, 0.09, 0.02, 0, 0.3, 0.177), red)], glow);
    // бёдра: пояс
    add(n.hips, [col(box(0.36, 0.1, 0.27, 0, 0.0, 0.0), dark), col(box(0.1, 0.07, 0.04, 0, -0.01, 0.15), lite), col(box(0.07, 0.1, 0.06, 0.2, -0.04, 0.05), steel), col(box(0.07, 0.1, 0.06, -0.2, -0.04, 0.05), steel)]);
    // руки: наплечник, пластина плеча, локоть, наруч, перчатка
    [[n.armL, n.elbL, -1], [n.armR, n.elbR, 1]].forEach((a) => {
      const s = a[2];
      add(a[0], [col(sph(0.105, s * 0.025, 0.0, 0, 1.15, 0.7, 1.15, 8), steel), col(box(0.16, 0.02, 0.2, s * 0.03, 0.045, 0, 0, 0, s * 0.18), lite), col(box(0.085, 0.2, 0.09, 0, -0.14, 0), steel), col(box(0.02, 0.2, 0.02, s * 0.048, -0.14, 0.035), dark), col(sph(0.055, 0, -0.272, 0, 1, 0.9, 1, 6), lite)]);
      add(a[1], [col(box(0.08, 0.2, 0.082, 0, -0.14, 0), steel), col(box(0.095, 0.045, 0.095, 0, -0.04, 0), lite), col(box(0.07, 0.07, 0.1, 0, -0.29, 0.01), dark), col(box(0.012, 0.16, 0.012, s * 0.045, -0.14, 0.03), dark)]);
    });
    // ноги: накладка бедра, наколенник, голень, поршни, ботинок
    [[n.legL, n.kneeL, n.footL, -1], [n.legR, n.kneeR, n.footR, 1]].forEach((a) => {
      const s = a[3];
      add(a[0], [col(box(0.14, 0.3, 0.15, 0, -0.2, 0.012), steel), col(box(0.04, 0.26, 0.03, s * 0.062, -0.2, 0.0), dark), col(cylY(0.014, 0.014, 0.3, s * 0.085, -0.2, 0.09, 1, 1, 6), lite), col(box(0.13, 0.05, 0.14, 0, -0.04, 0.015), lite)]);
      add(a[1], [col(sph(0.08, 0, 0.0, 0.045, 1, 1, 0.8, 8), lite), col(box(0.115, 0.28, 0.125, 0, -0.2, 0.014), steel), col(box(0.1, 0.12, 0.03, 0, -0.34, -0.07), dark)]);
      add(a[2], [col(box(0.13, 0.08, 0.28, 0, -0.03, 0.05), dark), col(box(0.12, 0.05, 0.12, 0, 0.02, 0.0), steel)]);
    });
    // шлем с забралом: красная щель
    add(n.head, [col(sph(0.158, 0, 0.16, -0.005, 1, 1.02, 1.12, 10), steel), col(box(0.2, 0.05, 0.18, 0, 0.065, 0.02), dark), col(box(0.17, 0.08, 0.08, 0, 0.13, 0.12, 0.05), dark), col(box(0.08, 0.06, 0.05, 0, 0.05, 0.14), lite), col(box(0.16, 0.05, 0.05, 0, 0.23, -0.1), lite)]);
    add(n.head, [col(box(0.16, 0.022, 0.012, 0, 0.145, 0.176), red)], glow);
    n.suitMeshes = M;
    if (n.glasses) n.glasses.visible = false;
    if (n.hair) n.hair.visible = false;
    if (n.hairG) n.hairG.visible = false;
    return n;
  };
  F.unsuit = function (n) { if (!n.suitMeshes) return; n.suitMeshes.forEach((m) => { if (m.parent) m.parent.remove(m); }); n.suitMeshes = null; if (n.glasses) n.glasses.visible = true; if (n.hairG) n.hairG.visible = true; if (n.hair) n.hair.visible = true; };

  // ------------------------------------------------------------------ миниган в руках NPC (вид 'minigun' для setGun)
  let mgGeo = null, mgBar = null;
  // Общая модель минигана (в руках игрока, у NPC, на витринах). Система: ствол в -Z, ось блока стволов — y=0;
  // задняя рукоять ≈ (0,-0.12,0.09), передняя ≈ (0,-0.14,-0.12), дульный срез z≈-0.93. body — неподвижный корпус, rotor — вращающийся блок стволов (цвет вершин).
  function mgParts() {
    if (mgGeo) return;
    const A = [], B = [], R = 0.04, L0 = -0.21, L1 = -0.93;
    const add = (c, ...p) => p.forEach((q) => A.push(col(q, c)));
    const rot = (c, ...p) => p.forEach((q) => B.push(col(q, c)));
    const STEEL = 0x8a8e94;
    // --- корпус привода: цилиндр с кольцами, плита сверху, боковая крышка на винтах
    add(0x2b2e32, cylZ(0.066, 0.066, 0.3, 0, 0, -0.04, 20));
    add(0x80848a, cylZ(0.074, 0.074, 0.028, 0, 0, -0.205, 20), cylZ(0.0695, 0.0695, 0.016, 0, 0, 0, 20), cylZ(0.0695, 0.0695, 0.016, 0, 0, 0.075, 20));
    add(0x101214, cylZ(0.0685, 0.0685, 0.012, 0, 0, -0.165, 20), cylZ(0.0685, 0.0685, 0.012, 0, 0, 0.04, 20));
    add(0x3d4147, box(0.09, 0.014, 0.22, 0, 0.066, -0.03), box(0.07, 0.01, 0.12, 0, 0.0735, 0));
    add(0xd0561d, box(0.05, 0.002, 0.012, 0, 0.0795, -0.1));
    [[-0.036, -0.12], [0.036, -0.12], [-0.036, 0.06], [0.036, 0.06]].forEach((s) => add(STEEL, cylY(0.007, 0.007, 0.01, s[0], 0.0775, s[1], 1, 1, 8)));
    add(0x23262a, box(0.012, 0.075, 0.17, 0.068, 0, -0.02));
    [[0.025, -0.08], [-0.025, -0.08], [0.025, 0.04], [-0.025, 0.04]].forEach((s) => add(STEEL, cylY(0.007, 0.007, 0.008, 0.0775, s[0], s[1], 1, 1, 8, 0, PI / 2)));
    // --- мотор сзади: рёбра охлаждения, крышка, разъём питания
    add(0x1d2023, cylZ(0.06, 0.06, 0.17, 0, 0, 0.195, 18));
    for (let k = 0; k < 5; k += 1) add(0x363a3f, cylZ(0.067, 0.067, 0.01, 0, 0, 0.128 + k * 0.034, 18));
    add(0x0f1113, cylZ(0.057, 0.05, 0.04, 0, 0, 0.3, 16));
    add(STEEL, cylZ(0.03, 0.03, 0.02, 0, 0, 0.326, 12));
    add(0x16181a, box(0.034, 0.034, 0.04, 0.05, 0.062, 0.2), cylY(0.015, 0.015, 0.05, 0.076, 0.07, 0.21, 1, 1, 10, 0, -1.1));
    // --- подающий узел слева: корпус, крышка с защёлкой, окно ленты
    add(0x34383c, box(0.075, 0.09, 0.2, -0.1, 0.012, -0.02));
    add(0x2b2e32, cylZ(0.04, 0.04, 0.2, -0.1, 0.055, -0.02, 12));
    add(0x1f2224, box(0.08, 0.095, 0.012, -0.1, 0.012, 0.088), box(0.08, 0.095, 0.012, -0.1, 0.012, -0.128));
    add(STEEL, box(0.012, 0.03, 0.02, -0.1, 0.092, -0.1), box(0.012, 0.03, 0.02, -0.1, 0.092, 0.06));
    add(0x15171a, box(0.012, 0.07, 0.15, -0.141, 0, -0.02));
    // патронная лента свисает из окна: гильзы, пули, звенья
    for (let i = 0; i < 10; i += 1) {
      const y = -0.012 - i * 0.034, x = -0.158 - 0.045 * (i / 9) * (i / 9) - i * 0.0015;
      add(0xc9a24a, cylY(0.0105, 0.0105, 0.05, x, y, -0.02, 1, 1, 8, 0, PI / 2));
      add(0xb8672f, cylY(0.0035, 0.0102, 0.028, x + 0.037, y, -0.02, 1, 1, 8, 0, -PI / 2));
      add(0x2a2a2d, box(0.016, 0.026, 0.056, x - 0.002, y, -0.02), box(0.012, 0.01, 0.06, x + 0.012, y + 0.017, -0.02));
    }
    // --- ручка для переноски сверху
    add(0x1a1c1f, cylY(0.011, 0.011, 0.1, 0, 0.116, -0.14, 1, 1, 8), cylY(0.011, 0.011, 0.1, 0, 0.116, 0.08, 1, 1, 8));
    add(0x0a0a0b, cylZ(0.015, 0.015, 0.26, 0, 0.17, -0.03, 10));
    add(0x1b1b1d, cylZ(0.0168, 0.0168, 0.008, 0, 0.17, -0.1, 10), cylZ(0.0168, 0.0168, 0.008, 0, 0.17, -0.03, 10), cylZ(0.0168, 0.0168, 0.008, 0, 0.17, 0.04, 10));
    // --- задняя рукоять со спуском и скобой
    add(0x15171a, box(0.036, 0.11, 0.045, 0, -0.12, 0.09, -0.22));
    [-0.03, 0, 0.03].forEach((t) => add(0x050506, box(0.04, 0.008, 0.05, 0, -0.12 + 0.976 * t, 0.09 - 0.218 * t, -0.22)));
    add(0x23262a, box(0.05, 0.05, 0.09, 0, -0.058, 0.08), box(0.016, 0.01, 0.07, 0, -0.1, 0.04), box(0.016, 0.04, 0.01, 0, -0.08, 0.006));
    add(STEEL, box(0.008, 0.03, 0.01, 0, -0.085, 0.035, 0.3));
    // --- передняя рукоять под левую руку на кронштейне
    add(0x15171a, box(0.03, 0.12, 0.034, 0, -0.14, -0.12, 0.15));
    [-0.03, 0, 0.03].forEach((t) => add(0x050506, box(0.034, 0.008, 0.038, 0, -0.14 + 0.989 * t, -0.12 - 0.149 * t, 0.15)));
    add(0x23262a, box(0.04, 0.03, 0.09, 0, -0.085, -0.115));
    mgGeo = cmerge(A);
    // --- вращающийся блок: 6 стволов, утолщения казённой части, дульные втулки, три хомута, ось; ствол №0 — с оранжевой меткой (видно направление и скорость)
    rot(0x90959b, cylZ(0.058, 0.058, 0.04, 0, 0, -0.235, 18));
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU, sx = Math.sin(a) * R, sy = Math.cos(a) * R;
      rot(0x62666c, cylZ(0.0105, 0.0105, L0 - L1, sx, sy, (L0 + L1) / 2, 10));
      rot(0x3a3d42, cylZ(0.0135, 0.0135, 0.08, sx, sy, -0.25, 10));
      rot(0x2b2d30, cylZ(0.0135, 0.0135, 0.06, sx, sy, L1 + 0.03, 10));
      rot(0x040404, cylZ(0.0065, 0.0065, 0.004, sx, sy, L1 - 0.001, 8));
      if (i === 0) rot(0xd0561d, cylZ(0.0123, 0.0123, 0.035, sx, sy, -0.8, 10));
    }
    rot(0x8a8e94, cylZ(0.014, 0.014, L0 - L1, 0, 0, (L0 + L1) / 2, 10));
    rot(0x2f3236, cylZ(0.063, 0.063, 0.03, 0, 0, -0.3, 18), cylZ(0.066, 0.066, 0.034, 0, 0, -0.85, 18));
    rot(0x3d4147, cylZ(0.063, 0.063, 0.022, 0, 0, -0.56, 18));
    rot(0x6a6f75, cylZ(0.07, 0.07, 0.01, 0, 0, -0.872, 18));
    rot(0x8a8e94, cylZ(0.016, 0.016, 0.012, 0, 0, -0.88, 10));
    mgBar = cmerge(B);
  }
  F.mgGeo = function () { mgParts(); return { body: mgGeo, rotor: mgBar }; };
  const eg0 = C.enemyGunGeo;
  C.enemyGunGeo = function (kind) { if (kind === 'minigun') { mgParts(); return mgGeo; } return eg0(kind); };
  // готовая модель минигана (корпус + блок стволов) для витрин и подбора с полки; scale 1 = размеры оружия в руках
  F.mgMesh = function () {
    mgParts();
    const g = new THREE.Group(), m = vcMat(0x101010);
    const a = new THREE.Mesh(mgGeo, m), b = new THREE.Mesh(mgBar, m);
    a.frustumCulled = b.frustumCulled = false; g.add(a, b); g.spin = b;
    return g;
  };
  F.npcMinigun = function (r, n) {
    mgParts();
    if (C.actorGK && !C.actorGK.GK.minigun) C.actorGK.GK.minigun = { rH: [0, -0.05, -0.01], lH: [0, -0.09, 0.2], muz: [0, 0.0, 0.95] };
    r.setGun(n, 'minigun');
    const m = n.gm.minigun;
    if (m && !n.mgSpin) {
      m.position.set(0, 0.06, 0.05); // хват (рукоятка модели → точка кисти rH)
      m.material = vcMat(0x101010);
      const sp = new THREE.Mesh(mgBar, vcMat(0x101010)); sp.frustumCulled = false; m.add(sp); n.mgSpin = sp;
    }
    return n;
  };

  // игрок в третьем лице (катсцены): чёрный стикмен
  F.playerBody = function (r, x, z, yaw) { const n = r.npc(x, z, yaw); n.isPlayerBody = true; return n; };
  F.rm = function (r, n) { if (!n) return; if (r.f48jig) r.f48jig = r.f48jig.filter((e) => e.n !== n); if (n.g.parent) n.g.parent.remove(n.g); const i = r.npcs.indexOf(n); if (i >= 0) r.npcs.splice(i, 1); };
}());
