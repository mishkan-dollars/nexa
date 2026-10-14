// NEXA: игрушки-абилки. Хранилище (кредиты, купленное, части HUD), каталог, загрузка модели (GLB), вмятины при нажатии,
// магазин и предпросмотр в лобби. Игровая часть (рука, тряска, объятие, эффект, хотбар) — в toyplay.js.
// Валюта только внутриигровая (кредиты) — никаких реальных денег.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;

  const KEY = 'nexaToys';
  const START_CREDITS = 300;
  const REWARD_FIRST = 120, REWARD_REPLAY = 20;
  const BASE = 'assets/models/toys/';

  // ---------------------------------------------------------------- каталог
  const CATALOG = [{
    id: 'black_bear', model: 'plush_black', code: 'PL-01', name: 'BLACK BEAR', price: 250, ability: 'EMBRACE', duration: 120, cooldown: 300,
    lines: ['LMB: HUG THE TOY', 'RESTORES ALL INTEGRITY', 'WIDER FIELD OF VIEW', 'DARK BARS AT THE SCREEN EDGES', '+100 AMMO FOR EVERY WEAPON', 'EFFECT 2:00 / COOLDOWN 5:00']
  }];
  const ABIL = [
    { id: 'dash', name: 'DASH', price: [3000, 8000, 20000], cd: [12, 10, 8], v: [5, 6.5, 8], info: 'BURST FORWARD' },
    { id: 'slow', name: 'TIME SLOW', price: [5000, 15000, 40000], cd: [40, 35, 30], v: [2, 3, 4], info: 'SLOWS TIME (OFFLINE ONLY)' },
    { id: 'shield', name: 'ABSORBER', price: [6000, 18000, 50000], cd: [45, 40, 35], v: [40, 70, 110], info: 'ABSORBS DAMAGE FOR 8 S' },
    { id: 'heal', name: 'SELF REPAIR', price: [4000, 12000, 30000], cd: [40, 35, 30], v: [40, 70, 100], info: 'RESTORES INTEGRITY OVER 4 S' },
    { id: 'sight', name: 'WALL SCAN', price: [8000, 22000, 60000], cd: [50, 45, 40], v: [6, 9, 12], info: 'MARKS ENEMIES THROUGH WALLS' },
    { id: 'magnet', name: 'MAGNET', price: [3000, 9000, 25000], cd: [30, 28, 25], v: [8, 14, 22], info: 'PULLS DROPS TO YOU' },
    { id: 'fire', name: 'FIRE STRIKE', price: [15000, 40000, 110000], cd: [35, 30, 25], v: [30, 50, 75], info: 'BLAST WHERE YOU AIM' },
    { id: 'shock', name: 'SHOCK WAVE', price: [12000, 35000, 90000], cd: [40, 36, 32], v: [2, 3, 4], info: 'STUNS ENEMIES AROUND YOU' },
    { id: 'reload', name: 'INSTANT RELOAD', price: [5000, 14000, 35000], cd: [25, 20, 15], v: [1, 1, 1], info: 'FILLS EVERY MAGAZINE' },
    { id: 'over', name: 'OVERDRIVE', price: [20000, 60000, 200000], cd: [60, 55, 50], v: [1.3, 1.5, 1.8], info: 'MORE DAMAGE FOR 6 S' }
  ];
  const ABD = {};
  ABIL.forEach((d) => { ABD[d.id] = d; });
  const DEF = {};
  CATALOG.forEach((d) => { DEF[d.id] = d; });
  // эмоции (kind 'emote') — не игрушки: в CATALOG (плюш) не входят, покупаются здесь и играются из колеса эмоций (js/emote.js, зажать B). Слот игрушки не занимают
  const EMOTES = [{
    id: 'emote_beat', kind: 'emote', code: 'EM-01', name: 'BEAT DROP', price: 200,
    lines: ['HOLD B: EMOTE WHEEL', 'FULL-BODY DANCE FROM A REAL POSE CAPTURE', 'CAMERA PULLS BACK AND ORBITS THE DANCER', 'GAME SOUND DUCKS, THE DANCE TRACK IS BOOSTED', 'PLAYS ONCE: ANY MOVE OR SHOT CANCELS IT']
  }, {
    id: 'emote_look', kind: 'emote', code: 'EM-02', name: 'LOOK WHAT I CAN DO', price: 250,
    lines: ['HOLD B: EMOTE WHEEL', 'LOOPING FULL-BODY DANCE FROM A REAL POSE CAPTURE', 'CAMERA PULLS BACK AND ORBITS THE DANCER', 'GAME SOUND DUCKS, THE DANCE TRACK IS BOOSTED', 'REPEATS UNTIL YOU SHOOT, RUN OR MOVE']
  }, {
    id: 'emote_comeon', kind: 'emote', code: 'EM-03', name: 'COME ON, STEP UP!', price: 250,
    lines: ['HOLD B: EMOTE WHEEL', 'LOOPING FULL-BODY DANCE FROM A REAL POSE CAPTURE', 'CAMERA PULLS BACK AND ORBITS THE DANCER', 'GAME SOUND DUCKS, THE DANCE TRACK IS BOOSTED', 'REPEATS UNTIL YOU SHOOT, RUN OR MOVE']
  }];
  EMOTES.forEach((d) => { DEF[d.id] = d; });
  const WHEEL_N = 8;

  // ---------------------------------------------------------------- хранилище
  let S = null;
  function sha256(str) {
    const K = [], H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    for (let n = 2, c = 0; c < 64; n += 1) { let pr = true; for (let d = 2; d * d <= n; d += 1) if (n % d === 0) { pr = false; break; } if (pr) { K[c] = (Math.pow(n, 1 / 3) * 4294967296) | 0; c += 1; } }
    const u = unescape(encodeURIComponent(str)), l = u.length, w = [];
    for (let i = 0; i < l; i += 1) w[i >> 2] |= u.charCodeAt(i) << (24 - (i % 4) * 8);
    w[l >> 2] |= 0x80 << (24 - (l % 4) * 8); w[(((l + 8) >> 6) + 1) * 16 - 1] = l * 8;
    const rr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < w.length; o += 16) {
      const m = w.slice(o, o + 16).map((x) => x | 0), v = H.slice();
      for (let i = 16; i < 64; i += 1) { const a0 = m[i - 15], a1 = m[i - 2]; m[i] = (m[i - 16] + (rr(a0, 7) ^ rr(a0, 18) ^ (a0 >>> 3)) + m[i - 7] + (rr(a1, 17) ^ rr(a1, 19) ^ (a1 >>> 10))) | 0; }
      let [A, B, C, D, E, F, G, Hh] = v;
      for (let i = 0; i < 64; i += 1) {
        const t1 = (Hh + (rr(E, 6) ^ rr(E, 11) ^ rr(E, 25)) + ((E & F) ^ (~E & G)) + K[i] + m[i]) | 0, t2 = ((rr(A, 2) ^ rr(A, 13) ^ rr(A, 22)) + ((A & B) ^ (A & C) ^ (B & C))) | 0;
        Hh = G; G = F; F = E; E = (D + t1) | 0; D = C; C = B; B = A; A = (t1 + t2) | 0;
      }
      [A, B, C, D, E, F, G, Hh].forEach((x, i) => { H[i] = (H[i] + x) | 0; });
    }
    return H.map((x) => ('00000000' + (x >>> 0).toString(16)).slice(-8)).join('');
  }
  const GD = window.NexaGuard, ADM = /^[0-9a-f]{64}$/.test(String(window.NEXA_ADMIN_PUB || '')) ? window.NEXA_ADMIN_PUB : '', ADM_MAX = 100000;
  const onlineNow = () => { try { return !!(window.NexaNet && NexaNet.connected) || !!(window.NexaRoom && NexaRoom.servers.on && NexaRoom.consented()); } catch (e) { return false; } };
  const locked = () => { try { return GD ? !!GD.block() : onlineNow(); } catch (e) { return true; } };
  const DK = 'nexaDev', BK = KEY + '.b';
  const rnd32 = () => { try { const a = new Uint32Array(4); crypto.getRandomValues(a); return Array.from(a).map((x) => ('00000000' + x.toString(16)).slice(-8)).join(''); } catch (e) { return sha256(String(Math.random()) + Date.now()); } };
  let DEVR = null;
  try { DEVR = JSON.parse(localStorage.getItem(DK)); } catch (e) { DEVR = null; }
  const devNew = !(DEVR && typeof DEVR.s === 'string' && DEVR.s.length === 32);
  const DEV = devNew ? { s: rnd32(), q: 0, h: '' } : { s: DEVR.s, q: Math.max(0, DEVR.q | 0), h: String(DEVR.h || '') };
  const saveDev = () => { try { localStorage.setItem(DK, JSON.stringify(DEV)); } catch (e) { /* ignore */ } };
  const MASK = parseInt(DEV.s.slice(0, 7), 16) | 0;
  const recHash = (q, p, c, d) => sha256(DEV.s + '|' + q + '|' + p + '|' + c + '|' + d).slice(0, 32);
  let tampered = 0, lastRec = null;
  function readRec(raw) {
    let r = null;
    try { r = JSON.parse(raw); } catch (e) { return null; }
    if (!r || r.v !== 2 || typeof r.c !== 'string' || typeof r.d !== 'string' || typeof r.h !== 'string') return null;
    if (recHash(r.q | 0, String(r.p || ''), r.c, r.d) !== r.h) return null;
    if ((r.q | 0) < DEV.q) return null;
    let d; try { d = JSON.parse(r.d); } catch (e) { return null; }
    const cr = (parseInt(r.c, 36) ^ MASK) >>> 0;
    if (!d || typeof d !== 'object' || !isFinite(cr) || cr > 1e9) return null;
    d.credits = cr; return { d, r };
  }
  function build(d, fresh) {
    const owned = Array.isArray(d.owned) ? d.owned.filter((id) => DEF[id]) : [];
    const wheel = [];
    for (let i = 0; i < WHEEL_N; i += 1) { const id = Array.isArray(d.wheel) ? d.wheel[i] : null; wheel.push(DEF[id] && DEF[id].kind === 'emote' && owned.indexOf(id) >= 0 && wheel.indexOf(id) < 0 ? id : null); }
    const o = {
      owned,
      loadout: DEF[d.loadout] && !DEF[d.loadout].kind && owned.indexOf(d.loadout) >= 0 ? d.loadout : null,
      wheel: wheel,
      hud: { life: !!(d.hud && d.hud.life), gear: !!(d.hud && d.hud.gear) },
      paid: Array.isArray(d.paid) ? d.paid.filter((x) => Number.isInteger(x) && x >= 1 && x <= 48).slice(0, 60) : [],
      ab: (() => {
        const lv = {}, a = d.ab && typeof d.ab === 'object' ? d.ab : {};
        ABIL.forEach((x) => { const n = a.lv && Number.isInteger(a.lv[x.id]) ? a.lv[x.id] : 0; if (n > 0) lv[x.id] = Math.min(n, x.price.length); });
        const eq = [0, 1, 2].map((i) => { const id = Array.isArray(a.eq) ? a.eq[i] : null; return id && lv[id] ? id : null; });
        return { lv, eq: eq.map((id, i) => (id && eq.indexOf(id) === i ? id : null)) };
      })(),
      id: typeof d.id === 'string' && /^[0-9a-f]{64}$/.test(d.id) ? d.id : '',
      rk: Number.isFinite(d.rk) ? d.rk : 0,
      rl: Array.isArray(d.rl) ? d.rl.filter((x) => x && isFinite(x.t) && isFinite(x.n)).slice(-40) : [],
      adm: Array.isArray(d.adm) ? d.adm.filter((x) => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x)).slice(-300) : []
    };
    let cv = 0; const ck = (Math.random() * 4294967296) >>> 0;
    const set = (v) => { v = Math.floor(Number(v)); if (!isFinite(v)) return; cv = (Math.max(0, Math.min(1e9, v)) ^ ck) >>> 0; };
    set(Number.isFinite(d.credits) ? d.credits : START_CREDITS);
    Object.defineProperty(o, 'credits', { get: () => (cv ^ ck) >>> 0, set, enumerable: false });
    return o;
  }
  function load() {
    let got = null;
    const raws = [localStorage.getItem(KEY), localStorage.getItem(BK)];
    let from = -1;
    for (let i = 0; i < raws.length && !got; i += 1) if (raws[i]) { got = readRec(raws[i]); from = i; }
    if (got) { if (from > 0 && raws[0]) tampered += 1; lastRec = got.r; return build(got.d); }
    if (raws[0] || raws[1]) {
      let leg = null; try { leg = JSON.parse(raws[0]); } catch (e) { leg = null; }
      if (devNew && leg && typeof leg === 'object' && leg.v === undefined) { leg.credits = Math.min(Number.isFinite(leg.credits) ? leg.credits : START_CREDITS, 20000); return build(leg); }
      tampered += 1;
    }
    return build({});
  }
  function save() {
    try {
      const d = JSON.stringify({ owned: S.owned, loadout: S.loadout, wheel: S.wheel, hud: S.hud, paid: S.paid, rl: S.rl, ab: S.ab, id: S.id, rk: S.rk, adm: S.adm });
      const q = DEV.q + 1, p = lastRec ? lastRec.h : '', c = ((S.credits ^ MASK) >>> 0).toString(36);
      const r = { v: 2, q, p, c, d, h: recHash(q, p, c, d) };
      const js = JSON.stringify(r);
      localStorage.setItem(BK, js); localStorage.setItem(KEY, js);
      DEV.q = q; DEV.h = r.h; lastRec = r; saveDev();
    } catch (e) { /* ignore */ }
  }
  S = load();
  if (devNew || tampered) save();

  const ctx = { audio: null, setView: null, render: null, startSandbox: null };

  // ---------------------------------------------------------------- звук лобби (audio.js не трогаем: свой помощник на <audio>)
  const SFXV = { plush1: 0.9, plush2: 0.42, plush3: 0.8, uibuy: 0.8, uivhs: 0.55, glitch2: 0.4, glitch3: 0.42, glitch4: 0.75 };
  const rsel = (a) => a[Math.floor(Math.random() * a.length)];
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  let live = 0;
  function sfx(name, vol, rate) {
    const a = ctx.audio;
    if (!a || !a.unlocked || !a.sfxEnabled || live > 8) return;
    try {
      const el = new Audio('assets/' + name + '.mp3');
      el.volume = clamp01((SFXV[name] || 0.6) * (vol || 1) * (a.masterVolume === undefined ? 0.55 : a.masterVolume) * (a.sfxVolume === undefined ? 1 : a.sfxVolume));
      if (rate) { el.preservesPitch = false; el.mozPreservesPitch = false; el.webkitPreservesPitch = false; el.playbackRate = rate; }
      live += 1;
      const done = () => { live = Math.max(0, live - 1); };
      el.addEventListener('ended', done); el.addEventListener('error', done);
      const p = el.play();
      if (p && p.catch) p.catch(done);
    } catch (e) { /* ignore */ }
  }
  const plushSfx = (vol) => sfx(rsel(['plush1', 'plush2', 'plush3']), vol, 0.92 + Math.random() * 0.18);
  const glitchSfx = () => sfx(rsel(['glitch2', 'glitch3', 'glitch4']), 1, 0.95 + Math.random() * 0.1);

  // ---------------------------------------------------------------- загрузка модели
  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
  let gltfP = null;
  const TPL = {}, TPLR = {};

  // тёмные материалы поднимаем до тёмно-серых: иначе чёрный мишка на тёмном фоне виден только силуэтом
  function lambertOf(m, name, T) {
    const map = m.map || null;
    if (map) map.encoding = T.LinearEncoding;
    const col = m.color ? m.color.clone() : new T.Color(0xffffff);
    if (/^Bear_/.test(name)) col.lerp(new T.Color(0.16, 0.16, 0.17), 0.78);
    const out = new T.MeshLambertMaterial({ color: col, map, side: m.side, transparent: !!m.transparent, opacity: m.opacity === undefined ? 1 : m.opacity, alphaTest: m.alphaTest || 0 });
    out.fog = false;
    out.name = name;
    return out;
  }

  // В GLB атрибуты лежат в interleaved-буфере (position/normal/uv вперемешку), а у глаз ещё и мусорный хвост за пределами индексов.
  // Для вмятин нужны плоские Float32-массивы: разворачиваем и обрезаем по максимальному индексу.
  function trimGeo(geo, T) {
    let n = geo.attributes.position.count;
    if (geo.index) {
      const ia = geo.index.array;
      let mx = 0;
      for (let i = 0; i < ia.length; i += 1) if (ia[i] > mx) mx = ia[i];
      n = Math.min(n, mx + 1);
    }
    const out = new T.BufferGeometry();
    ['position', 'normal', 'uv'].forEach((k) => {
      const a = geo.attributes[k];
      if (!a) return;
      const s = a.itemSize, arr = new Float32Array(n * s);
      for (let i = 0; i < n; i += 1) {
        arr[i * s] = a.getX(i); arr[i * s + 1] = a.getY(i);
        if (s > 2) arr[i * s + 2] = a.getZ(i);
      }
      out.setAttribute(k, new T.BufferAttribute(arr, s));
    });
    if (geo.index) out.setIndex(new T.BufferAttribute(geo.index.array.slice(), 1));
    return out;
  }

  // Плоская модель: геометрии уже в системе корня, центр в нуле, лицо смотрит в +Z
  function loadTpl(id) {
    if (TPL[id]) return TPL[id];
    const def = DEF[id];
    TPL[id] = (async () => {
      if (!def) throw new Error('unknown toy');
      await C.loadThree();
      const T = window.THREE;
      if (!T.GLTFLoader) await (window.__nexaGltf || (window.__nexaGltf = loadScript('assets/lib/GLTFLoader.js')));
      const gl = await new Promise((res, rej) => new T.GLTFLoader().load(BASE + def.model + '.glb', res, undefined, rej));
      gl.scene.updateMatrixWorld(true);
      const parts = [], box = new T.Box3();
      gl.scene.traverse((o) => {
        if (!o.isMesh) return;
        const geo = trimGeo(o.geometry, T);
        geo.applyMatrix4(o.matrixWorld);
        Object.keys(geo.attributes).forEach((k) => { if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k); });
        geo.computeBoundingBox(); box.union(geo.boundingBox);
        parts.push({ name: o.name, geo, mat: lambertOf(o.material, o.name, T) });
        if (o.material && o.material.dispose) o.material.dispose();
      });
      const c = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
      parts.forEach((p) => { p.geo.translate(-c.x, -c.y, -c.z); p.geo.computeBoundingSphere(); });
      return (TPLR[id] = { parts, size: [size.x, size.y, size.z] });
    })();
    TPL[id].catch(() => { delete TPL[id]; });
    return TPL[id];
  }

  // ---------------------------------------------------------------- игрушка: меши, вмятины
  const DENT = { R: 0.078, depth: 0.052, k: 540, c: 26 };

  function makeToy(id, o) {
    const tpl = TPLR[id], T = window.THREE;
    if (!tpl || !T) return null;
    o = o || {};
    const group = new T.Group(), meshes = [];
    tpl.parts.forEach((p) => {
      const geo = o.dent ? p.geo.clone() : p.geo;
      let mat = p.mat;
      if (o.ghost) { mat = p.mat.clone(); mat.transparent = true; mat.opacity = o.ghost; mat.depthWrite = false; }
      const m = new T.Mesh(geo, mat);
      m.frustumCulled = false;
      m.name = p.name;
      if (o.dent) { m.userData.p0 = new Float32Array(geo.attributes.position.array); m.userData.n0 = new Float32Array(geo.attributes.normal.array); }
      group.add(m); meshes.push(m);
    });
    const toy = { id, group, meshes, size: tpl.size, dents: [], dirty: false, own: !!o.dent || !!o.ghost };
    toy.dispose = () => {
      meshes.forEach((m) => { if (o.dent) m.geometry.dispose(); if (o.ghost) m.material.dispose(); });
      group.clear();
    };
    return toy;
  }

  // вмятина в точке p (локальная система игрушки) по направлению нажатия d; живёт, пока target = 1 (кнопка зажата), потом пружинит обратно
  function pressToy(toy, p, d) {
    const T = window.THREE;
    if (toy.dents.length >= 5) toy.dents.shift();
    const dent = { p: p.clone(), d: d.clone().normalize(), x: 0, v: 0, t: 1 };
    toy.dents.push(dent);
    toy.dirty = true;
    return dent;
  }
  function releaseDent(dent) { if (dent) dent.t = 0; }

  function applyDents(toy) {
    const D = DENT, R2 = D.R * D.R;
    for (let mi = 0; mi < toy.meshes.length; mi += 1) {
      const m = toy.meshes[mi], pa = m.geometry.attributes.position, na = m.geometry.attributes.normal;
      const p0 = m.userData.p0, n0 = m.userData.n0, pos = pa.array, nor = na.array, n = pos.length;
      for (let i = 0; i < n; i += 3) {
        let px = p0[i], py = p0[i + 1], pz = p0[i + 2], nx = n0[i], ny = n0[i + 1], nz = n0[i + 2];
        for (let k = 0; k < toy.dents.length; k += 1) {
          const dt = toy.dents[k];
          const dx = p0[i] - dt.p.x, dy = p0[i + 1] - dt.p.y, dz = p0[i + 2] - dt.p.z, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= R2) continue;
          const q = d2 / R2, w = (1 - q) * (1 - q), amp = D.depth * dt.x, g = amp * w;
          px += dt.d.x * g; py += dt.d.y * g; pz += dt.d.z * g;
          const dd = Math.sqrt(d2) + 1e-6, dg = amp * (-4 * dd * (1 - q) / R2); // dg/d(dist)
          let gx = dg * dx / dd, gy = dg * dy / dd, gz = dg * dz / dd;
          const gn = gx * n0[i] + gy * n0[i + 1] + gz * n0[i + 2];
          gx -= n0[i] * gn; gy -= n0[i + 1] * gn; gz -= n0[i + 2] * gn; // только касательная часть градиента
          const k2 = -(dt.d.x * n0[i] + dt.d.y * n0[i + 1] + dt.d.z * n0[i + 2]);
          nx += k2 * gx; ny += k2 * gy; nz += k2 * gz;
        }
        const nl = Math.hypot(nx, ny, nz) || 1;
        pos[i] = px; pos[i + 1] = py; pos[i + 2] = pz; nor[i] = nx / nl; nor[i + 1] = ny / nl; nor[i + 2] = nz / nl;
      }
      pa.needsUpdate = true; na.needsUpdate = true;
    }
  }
  function stepToy(toy, dt) {
    if (!toy.dirty && !toy.dents.length) return;
    dt = Math.min(dt, 1 / 30);
    const h = dt / 2;
    for (let k = toy.dents.length - 1; k >= 0; k -= 1) {
      const d = toy.dents[k];
      for (let s = 0; s < 2; s += 1) { d.v += (DENT.k * (d.t - d.x) - DENT.c * d.v) * h; d.x += d.v * h; }
      if (d.t === 0 && Math.abs(d.x) < 0.002 && Math.abs(d.v) < 0.05) toy.dents.splice(k, 1);
    }
    applyDents(toy);
    if (!toy.dents.length) toy.dirty = false;
  }

  // ---------------------------------------------------------------- сцена с освещением для магазина
  function lights(T, scene) {
    scene.add(new T.AmbientLight(0xffffff, 0.8));
    const key = new T.DirectionalLight(0xffffff, 0.8); key.position.set(1.6, 2.2, 3); scene.add(key);
    const rim = new T.DirectionalLight(0xbfd0ff, 0.55); rim.position.set(-2.4, 1.2, -2.2); scene.add(rim);
  }

  // ---------------------------------------------------------------- мини-аватарки (рисуются один раз и кэшируются)
  const AV = {};
  function avatar(id) {
    if (AV[id]) return Promise.resolve(AV[id]);
    return loadTpl(id).then(() => {
      const T = window.THREE, S0 = 220;
      const cv = document.createElement('canvas'); cv.width = cv.height = S0;
      const r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setSize(S0, S0, false); r.setClearColor(0x000000, 0);
      const sc = new T.Scene(); lights(T, sc);
      const cam = new T.PerspectiveCamera(30, 1, 0.05, 5); cam.position.set(0, 0.03, 0.82); cam.lookAt(0, 0, 0);
      const toy = makeToy(id); toy.group.rotation.y = 0.5; toy.group.rotation.x = -0.05; sc.add(toy.group);
      r.render(sc, cam);
      let url = '';
      try { url = cv.toDataURL('image/png'); } catch (e) { url = ''; }
      r.dispose(); try { r.forceContextLoss(); } catch (e) { /* ignore */ }
      if (url) AV[id] = url;
      return url;
    }).catch(() => '');
  }

  // ---------------------------------------------------------------- магазин
  let shopNote = null;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const BEAR_SVG = '<svg viewBox="0 0 64 64" class="shop-ico" aria-hidden="true"><circle cx="14" cy="16" r="9" fill="#2a2a2a"/><circle cx="50" cy="16" r="9" fill="#2a2a2a"/><circle cx="32" cy="34" r="22" fill="#1b1b1b" stroke="#444" stroke-width="2"/><ellipse cx="32" cy="42" rx="9" ry="7" fill="#2f2f2f"/><circle cx="23" cy="30" r="2.6" fill="#8a8a8a"/><circle cx="41" cy="30" r="2.6" fill="#8a8a8a"/><ellipse cx="32" cy="38" rx="3.4" ry="2.4" fill="#050505"/></svg>';

  const inWheel = (id) => S.wheel.indexOf(id) >= 0;
  function card(d) {
    const emote = d.kind === 'emote';
    const owned = S.owned.indexOf(d.id) >= 0, eq = emote ? inWheel(d.id) : S.loadout === d.id;
    const E = window.Emote;
    const img = emote ? (E && E.thumbSvg ? E.thumbSvg(d.id) : BEAR_SVG) : AV[d.id] ? '<img alt="" src="' + AV[d.id] + '">' : BEAR_SVG;
    let btn;
    if (!owned) btn = '<button class="action secondary centered" data-action="shop-buy" data-value="' + d.id + '" data-cursor="interact">BUY</button>';
    else btn = '<button class="action secondary centered" data-action="shop-equip" data-value="' + d.id + '" data-cursor="interact">' + (eq ? 'UNEQUIP' : 'EQUIP') + '</button>';
    return '<div class="shop-card' + (eq ? ' equipped' : '') + (emote ? ' emote' : '') + '"><div class="shop-av' + (emote ? ' em' : '') + '" data-id="' + d.id + '">' + img + (eq ? '<span class="shop-badge">EQUIPPED</span>' : owned ? '<span class="shop-badge dim">OWNED</span>' : '') + '</div>' +
      '<div class="shop-meta"><span class="shop-code">' + d.code + '</span><h3>' + esc(d.name) + '</h3><p class="shop-price">' + (owned ? '' : d.price + ' CR') + '</p></div>' +
      '<ul class="shop-fx">' + d.lines.map((l) => '<li>' + l + '</li>').join('') + '</ul>' +
      '<div class="shop-btns">' + (emote && E && E.bearSvg ? E.bearSvg() : '') + btn + '<button class="action secondary centered" data-action="shop-preview" data-value="' + d.id + '" data-cursor="interact">PREVIEW</button></div></div>';
  }
  function lockedCard() {
    return '<div class="shop-card locked"><div class="shop-av"><span class="shop-q">?</span></div><div class="shop-meta"><span class="shop-code">PL-??</span><h3>[ NO SIGNAL ]</h3><p class="shop-price"></p></div>' +
      '<ul class="shop-fx"><li>ITEM UNAVAILABLE</li></ul><div class="shop-btns"><button class="action secondary centered" disabled>BUY</button><button class="action secondary centered" disabled>PREVIEW</button></div></div>';
  }
  let shopTab = 'items';
  function abilShop() {
    const eq = S.ab.eq, slots = eq.map((id, i) => '<span class="ab-slot' + (id ? ' on' : '') + '"><small>SLOT ' + (i + 1) + '</small> <b>' + (id ? ABD[id].name : 'EMPTY') + '</b>' + (id ? ' <button class="link-button" data-action="shop-ab-eq" data-value="' + i + ':">CLEAR</button>' : '') + '</span>').join(' ');
    const cards = ABIL.map((d) => {
      const lv = S.ab.lv[d.id] | 0, max = d.price.length, np = lv < max ? d.price[lv] : 0;
      const btn = np ? '<button class="action' + (np > S.credits ? ' secondary' : '') + '" data-action="shop-ab-buy" data-value="' + d.id + '">' + (lv ? 'UPGRADE ' : 'BUY ') + np + ' KP</button>' : '<button class="action secondary" disabled>MAX</button>';
      const eqb = lv ? [0, 1, 2].map((i) => '<button class="link-button' + (eq[i] === d.id ? ' on' : '') + '" data-action="shop-ab-eq" data-value="' + i + ':' + d.id + '">' + (i + 1) + '</button>').join(' ') : '';
      return '<div class="shop-card"><h3>' + d.name + '</h3><p>' + d.info + '</p><p class="shop-sub">' + (lv ? 'LEVEL ' + lv + '/' + max + ' · RECHARGE ' + d.cd[lv - 1] + ' S' : 'NOT OWNED') + '</p>' + btn + (eqb ? '<div class="shop-eq">' + eqb + '</div>' : '') + '</div>';
    }).join('');
    return '<p class="shop-sub">' + slots + '</p><div class="shop-grid">' + cards + '</div>';
  }
  function renderShop() {
    const tabBtn = (id, t) => '<button class="link-button' + (shopTab === id ? ' on' : '') + '" data-action="shop-tab" data-value="' + id + '">' + t + '</button>';
    const tabs = '<div class="back-row shop-tabs">' + tabBtn('items', 'ITEMS') + ' &nbsp; ' + tabBtn('abil', 'ABILITIES') + '</div>';
    const note = shopNote ? '<p class="shop-note ' + shopNote.kind + '">' + shopNote.text + '</p>' : '';
    return '<div class="screen-shell"><div class="panel" style="max-width:900px;margin:auto;"><div class="panel-head"><div><p class="eyebrow">NEXA/OS</p><h2>SHOP</h2></div><div class="session-tag">BALANCE<strong>' + S.credits + ' CR</strong></div></div>' +
      '<div class="back-row"><button class="link-button" data-action="menu">← BACK TO NEXA/OS</button></div>' +
      '<p style="color:var(--muted);margin-bottom:20px;">C:\\NEXA\\SHOP\\ &nbsp;//&nbsp; PLUSH ITEMS GRANT A MISSION ABILITY. ONE ITEM CAN BE CARRIED INTO A MISSION. EMOTES ARE PLAYED FROM THE WHEEL: HOLD B.</p>' + note +
      tabs + (shopTab === 'abil' ? abilShop() : '<div class="shop-grid">' + CATALOG.map(card).join('') + EMOTES.map(card).join('') + lockedCard() + '</div>') + '</div></div>';
  }
  function fillAvatars() {
    if (window.Emote && window.Emote.bindShop) window.Emote.bindShop();
    CATALOG.forEach((d) => {
      if (AV[d.id]) return;
      avatar(d.id).then((url) => {
        if (!url) return;
        document.querySelectorAll('.shop-av[data-id="' + d.id + '"]').forEach((el) => {
          const svg = el.querySelector('.shop-ico');
          if (!svg) return;
          const im = document.createElement('img'); im.alt = ''; im.src = url; svg.replaceWith(im);
        });
      });
    });
  }

  function action(a, v) {
    if (a === 'shop') {
      shopNote = null; ctx.setView && ctx.setView('SHOP'); sfx('uivhs'); ctx.render && ctx.render(); fillAvatars(); return true;
    }
    if (a === 'shop-buy') {
      const d = DEF[v]; if (!d) return true;
      if (S.owned.indexOf(d.id) >= 0) return true;
      if (locked()) { shopNote = { kind: 'bad', text: 'LOCKED' }; ctx.audio && ctx.audio.playSfx('denied'); }
      else if (S.credits < d.price) { shopNote = { kind: 'bad', text: 'NOT ENOUGH CREDITS' }; ctx.audio && ctx.audio.playSfx('denied'); }
      else { S.credits -= d.price; S.owned.push(d.id); if (d.kind === 'emote') { const i = S.wheel.indexOf(null); if (i >= 0) S.wheel[i] = d.id; } else S.loadout = d.id; save(); shopNote = { kind: 'ok', text: 'PURCHASE COMPLETE' }; sfx('uibuy'); }
      ctx.render && ctx.render(); fillAvatars(); return true;
    }
    if (a === 'shop-equip') {
      const d = DEF[v]; if (!d || S.owned.indexOf(d.id) < 0) return true;
      if (d.kind === 'emote') { const i = S.wheel.indexOf(d.id); if (i >= 0) S.wheel[i] = null; else { const e = S.wheel.indexOf(null); if (e >= 0) S.wheel[e] = d.id; else S.wheel[0] = d.id; } }
      else S.loadout = S.loadout === d.id ? null : d.id;
      save(); shopNote = null; ctx.render && ctx.render(); fillAvatars(); return true;
    }
    if (a === 'shop-tab') { shopTab = v === 'abil' ? 'abil' : 'items'; shopNote = null; ctx.render && ctx.render(); fillAvatars(); return true; }
    if (a === 'shop-ab-buy') {
      const r = window.Toys.ab.buy(v); shopNote = r.ok ? { kind: 'ok', text: 'UNLOCKED' } : { kind: 'bad', text: r.err }; if (!r.ok && ctx.audio) ctx.audio.playSfx('denied');
      ctx.render && ctx.render(); fillAvatars(); return true;
    }
    if (a === 'shop-ab-eq') { const m = /^(\d):(\w*)$/.exec(String(v)); if (m) window.Toys.ab.equip(+m[1], m[2] || null); ctx.render && ctx.render(); fillAvatars(); return true; }
    if (a === 'shop-preview') {
      if (DEF[v] && DEF[v].kind === 'emote') { if (window.Emote && window.Emote.openPreview) window.Emote.openPreview(v); } else openPreview(v);
      return true;
    }
    if (a === 'sandbox') { ctx.startSandbox && ctx.startSandbox(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- предпросмотр: игрушка вылетает снизу, её можно вертеть, двигать и мять
  let pv = null;
  const easeOutExpo = (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -11 * k));

  function openPreview(id) {
    if (pv || !DEF[id]) return;
    const d = DEF[id];
    const el = document.createElement('div');
    el.id = 'toy-preview';
    const owned = S.owned.indexOf(id) >= 0;
    el.innerHTML = '<canvas class="tp-canvas"></canvas><div class="tp-info"><p class="eyebrow">MODEL</p><p class="tp-code">' + d.code + '</p><h2 class="tp-name">' + esc(d.name) + '</h2>' +
      '<p class="tp-sub">PLUSH ABILITY ITEM</p><ul class="tp-list">' + d.lines.map((l) => '<li>' + l + '</li>').join('') + '</ul>' +
      (owned ? '<p class="tp-own">OWNED</p>' : '<p class="tp-price">' + d.price + ' CR</p>') + '</div>' +
      '<button type="button" class="tp-close" data-cursor="interact">[ ESC / CLOSE ]</button><p class="tp-hint">DRAG: ROTATE &nbsp;|&nbsp; RMB: MOVE &nbsp;|&nbsp; WHEEL: ZOOM &nbsp;|&nbsp; CLICK THE TOY: SQUEEZE</p>';
    document.body.appendChild(el);
    pv = { el, id, dead: false, listeners: [] };
    sfx('uivhs', 0.7);
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); pv.listeners.push([t, ev, fn, opt]); };
    on(el.querySelector('.tp-close'), 'click', closePreview);
    on(document, 'keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePreview(); } }, true);
    loadTpl(id).then(() => { if (!pv || pv.dead) return; startPreview(); }).catch((e) => { console.warn('[toys]', e); if (pv && !pv.dead) el.querySelector('.tp-hint').textContent = 'MODEL LOAD FAULT'; });
  }

  function startPreview() {
    const T = window.THREE, el = pv.el, cv = el.querySelector('.tp-canvas'), on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); pv.listeners.push([t, ev, fn, opt]); };
    const r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    const sc = new T.Scene(); lights(T, sc);
    const cam = new T.PerspectiveCamera(32, 1, 0.05, 6);
    const toy = makeToy(pv.id, { dent: true });
    const holder = new T.Group(); holder.add(toy.group); sc.add(holder);
    const st = { yaw: 0.35, pitch: -0.05, vy: 0, vp: 0, px: 0, py: 0, dist: 0.95, t0: performance.now(), user: false };
    Object.assign(pv, { r, sc, cam, toy, holder, st });
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    const size = () => {
      const w = el.clientWidth || innerWidth || 800, h = el.clientHeight || innerHeight || 450;
      r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    };
    size(); on(window, 'resize', size);
    const pick = (cx, cy) => {
      const b = cv.getBoundingClientRect();
      ndc.set(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1);
      cam.updateMatrixWorld(); holder.updateMatrixWorld(true);
      ray.setFromCamera(ndc, cam);
      const hit = ray.intersectObject(toy.group, true)[0];
      if (!hit) return null;
      const inv = new T.Matrix4().copy(toy.group.matrixWorld).invert();
      return { p: hit.point.clone().applyMatrix4(inv), d: ray.ray.direction.clone().transformDirection(inv) };
    };
    const ptrs = new Map();
    let mode = null, dent = null, sx = 0, sy = 0, pinch = 0;
    const lastXY = {};
    on(cv, 'contextmenu', (e) => e.preventDefault());
    on(cv, 'pointerdown', (e) => {
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      st.user = true;
      if (ptrs.size === 2) { const a = Array.from(ptrs.values()); pinch = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); mode = 'pinch'; if (dent) { releaseDent(dent); dent = null; } return; }
      sx = lastXY.x = e.clientX; sy = lastXY.y = e.clientY;
      if (e.button === 2 || e.shiftKey) { mode = 'pan'; return; }
      const h = pick(e.clientX, e.clientY);
      if (h) { mode = 'press'; dent = pressToy(toy, h.p, h.d); plushSfx(); st.vy = st.vp = 0; }
      else mode = 'rotate';
    });
    on(cv, 'pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (mode === 'pinch' && ptrs.size >= 2) {
        const a = Array.from(ptrs.values()), dd = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
        if (pinch > 0) st.dist = Math.max(0.5, Math.min(1.9, st.dist * (pinch / Math.max(20, dd))));
        pinch = dd; return;
      }
      const dx = e.clientX - lastXY.x, dy = e.clientY - lastXY.y;
      if (mode === 'press') {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) < 9) return;
        releaseDent(dent); dent = null; mode = 'rotate';
      }
      lastXY.x = e.clientX; lastXY.y = e.clientY;
      if (mode === 'rotate') { st.vy = dx * 0.012; st.vp = dy * 0.012; st.yaw += dx * 0.011; st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch + dy * 0.011)); }
      else if (mode === 'pan') { const k = st.dist * 0.0021; st.px = Math.max(-0.45, Math.min(0.45, st.px + dx * k)); st.py = Math.max(-0.3, Math.min(0.3, st.py - dy * k)); }
    });
    const up = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (dent) { releaseDent(dent); dent = null; }
      if (ptrs.size < 2 && mode === 'pinch') { mode = null; }
      if (!ptrs.size) mode = null;
    };
    on(cv, 'pointerup', up); on(cv, 'pointercancel', up);
    on(cv, 'wheel', (e) => { e.preventDefault(); st.dist = Math.max(0.5, Math.min(1.9, st.dist * (1 + Math.sign(e.deltaY) * 0.08))); }, { passive: false });
    let last = performance.now();
    const loop = (now) => {
      if (!pv || pv.dead) return;
      pv.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const k = easeOutExpo((now - st.t0) / 950), rest = 1 - k;
      if (mode !== 'rotate') { st.yaw += st.vy; st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch + st.vp)); const f = Math.exp(-dt * 4); st.vy *= f; st.vp *= f; }
      if (!st.user && k >= 1) st.yaw += dt * 0.25; // пока игрок не трогал — медленно поворачивается
      holder.position.set(st.px, st.py - 1.15 * rest + Math.sin(now / 900) * 0.004 * k, 0);
      toy.group.rotation.set(st.pitch - 0.9 * rest, st.yaw + 2.4 * rest, 0, 'YXZ');
      cam.position.set(0, 0.02, st.dist); cam.lookAt(0, 0, 0);
      stepToy(toy, dt);
      r.render(sc, cam);
    };
    pv.raf = requestAnimationFrame(loop);
  }

  function closePreview() {
    if (!pv) return;
    const p = pv; pv = null; p.dead = true;
    cancelAnimationFrame(p.raf);
    p.listeners.forEach((l) => l[0].removeEventListener(l[1], l[2], l[3]));
    try { p.toy && p.toy.dispose(); p.r && p.r.dispose(); p.r && p.r.forceContextLoss(); } catch (e) { /* ignore */ }
    p.el.remove();
    sfx('mouse' in SFXV ? 'mouse' : 'uivhs', 0.4);
  }

  // ---------------------------------------------------------------- награды и части HUD
  let pendBonus = 0; // interiors.js: бонус за бесшумные/жестокие убийства и заложников — ждёт ближайшей награды за миссию
  function bonus(n) { pendBonus = Math.max(0, Math.min(300, Math.round(n) || 0)); }
  const REPLAY_HOUR = 1500, REWARD_GAP = 30000;
  function reward(taskId) {
    taskId = Number(taskId);
    if (!Number.isInteger(taskId) || taskId < 1 || taskId > 48 || locked()) return 0;
    const now = Date.now(), first = S.paid.indexOf(taskId) < 0;
    S.rl = S.rl.filter((x) => now - x.t < 3600000);
    const last = S.rl.length ? S.rl[S.rl.length - 1].t : 0, hourly = S.rl.reduce((a, x) => a + x.n, 0);
    let n = (first ? 300 + taskId * 25 : 60 + taskId * 5) + pendBonus; pendBonus = 0;
    if (now - last < REWARD_GAP) n = 0;
    else if (!first) n = Math.max(0, Math.min(n, REPLAY_HOUR - hourly));
    if (n > 0) { if (first) S.paid.push(taskId); S.rl.push({ t: now, n: first ? 0 : n }); S.credits += n; save(); }
    const el = document.getElementById('system-message');
    if (el) { const old = el.dataset.old || el.textContent; el.dataset.old = old; el.textContent = '+' + n + ' CR // BALANCE ' + S.credits + ' CR'; clearTimeout(reward.t); reward.t = setTimeout(() => { el.textContent = old; delete el.dataset.old; }, 6000); }
    return n;
  }

  // подарок из миссии (js/twists-*.js): игрушка или эмоция без оплаты; false — уже есть / нет такой
  function grant(id) {
    const d = DEF[id];
    if (!d || S.owned.indexOf(id) >= 0) return false;
    S.owned.push(id);
    if (d.kind === 'emote') { const i = S.wheel.indexOf(null); if (i >= 0) S.wheel[i] = id; } else if (!S.loadout) S.loadout = id;
    save();
    return true;
  }

  let vaultTaken = false;
  window.Toys = {
    CATALOG, EMOTES, def: (id) => DEF[id], REWARD_FIRST,
    emoteWheel: () => S.wheel.slice(), audio: () => ctx.audio,
    get credits() { return S.credits; },
    vault() {
      if (vaultTaken) return null;
      vaultTaken = true;
      return {
        credit(n) { n = Math.floor(n); if (locked() || !isFinite(n) || n < 1 || n > 1000000 || S.credits + n > 1e9) return false; S.credits += n; save(); return true; },
        debit(n) { n = Math.floor(n); if (locked() || !isFinite(n) || n < 1 || n > 1000000 || S.credits < n) return false; S.credits -= n; save(); return true; }
      };
    },
    get tampered() { return tampered; },
    ident: {
      get pk() { const K = window.NexaSchnorr; if (!K) return ''; if (!S.id) { S.id = K.hex(K.newKey().sk); save(); } return K.hex(K.pubkey(K.unhex(S.id))); },
      event(kind, tags, content) { const K = window.NexaSchnorr; if (!K || !this.pk) return null; return K.makeEvent({ sk: K.unhex(S.id), pk: this.pk }, kind | 0, tags || [], String(content || '')); },
      ecdh(peer) { const K = window.NexaSchnorr; return K && this.pk && /^[0-9a-f]{64}$/.test(peer) ? K.ecdh(K.unhex(S.id), peer) : ''; }
    },
    adminGrant(ev) {
      const K = window.NexaSchnorr, t = Math.floor(Date.now() / 1000);
      if (!ADM || !K || !ev || ev.pubkey !== ADM || ev.kind !== 7790 || !Array.isArray(ev.tags) || !K.checkEvent(ev)) return { ok: false, err: 'SIG' };
      let c; try { c = JSON.parse(ev.content); } catch (e) { return { ok: false, err: 'BAD' }; }
      const to = (ev.tags.find((x) => x[0] === 'p') || [])[1], n = c && c.n, x = c && c.x;
      if (to !== window.Toys.ident.pk) return { ok: false, err: 'TARGET' };
      if (!Number.isInteger(n) || n < 1 || n > ADM_MAX) return { ok: false, err: 'AMOUNT' };
      if (!Number.isInteger(x) || t > x) return { ok: false, err: 'EXPIRED' };
      if (x - ev.created_at > 900 || ev.created_at > t + 120) return { ok: false, err: 'BAD' };
      if (S.adm.indexOf(ev.id) >= 0) return { ok: false, err: 'DUP' };
      if (locked()) return { ok: false, err: 'LOCKED' };
      if (S.credits + n > 1e9) return { ok: false, err: 'CAP' };
      S.adm.push(ev.id); S.adm = S.adm.slice(-300); S.credits += n; save();
      return { ok: true, n, id: ev.id, bal: S.credits };
    },
    rankReward(place) {
      const now = Date.now(); if (locked() || now - S.rk < 86400000 || !(place >= 1 && place <= 10)) return 0;
      S.rk = now; const n = 500 - (place - 1) * 40; S.credits += n; save(); return n;
    },
    ab: {
      defs: ABIL.map((d) => Object.freeze(Object.assign({}, d, { price: d.price.slice(), cd: d.cd.slice(), v: d.v.slice() }))),
      level: (id) => (S.ab.lv[id] | 0),
      equipped: () => S.ab.eq.slice(),
      nextPrice(id) { const d = ABD[id], n = S.ab.lv[id] | 0; return d && n < d.price.length ? d.price[n] : 0; },
      buy(id) {
        const d = ABD[id], n = d ? S.ab.lv[id] | 0 : -1;
        if (!d || n >= d.price.length) return { ok: false, err: 'MAX LEVEL' };
        if (locked()) return { ok: false, err: 'LOCKED' };
        if (S.credits < d.price[n]) return { ok: false, err: 'NOT ENOUGH KP' };
        S.credits -= d.price[n]; S.ab.lv[id] = n + 1;
        if (n === 0) { const i = S.ab.eq.indexOf(null); if (i >= 0) S.ab.eq[i] = id; }
        save(); return { ok: true, lv: n + 1 };
      },
      equip(slot, id) {
        slot |= 0; if (slot < 0 || slot > 2) return false;
        if (id && !S.ab.lv[id]) return false;
        const i = id ? S.ab.eq.indexOf(id) : -1; if (i >= 0) S.ab.eq[i] = null;
        S.ab.eq[slot] = id || null; save(); return true;
      }
    }, sha: sha256,
    owned: (id) => S.owned.indexOf(id) >= 0,
    loadout() { return S.loadout && S.owned.indexOf(S.loadout) >= 0 ? S.loadout : null; },
    hud: {
      has: (k) => !!S.hud[k],
      grant(k) { if (S.hud[k] !== undefined && !S.hud[k]) { S.hud[k] = true; save(); } }
    },
    init(o) { Object.assign(ctx, o || {}); },
    load: loadTpl, tpl: (id) => TPLR[id], make: makeToy, press: pressToy, release: releaseDent, step: stepToy, avatar, avatarUrl: (id) => AV[id] || '',
    sfx, plushSfx, glitchSfx, action, renderShop, fillAvatars, openPreview, closePreview, reward, bonus, grant, BEAR_SVG,
    reset() { S = load(); },
    _dbg: () => ({ pv, S })
  };

  // игра грузит модель вместе с остальным (core.loadToys из Run.start)
  if (C) C.loadToys = function () { const id = window.Toys.loadout(); return id ? loadTpl(id).then(() => id, () => null) : Promise.resolve(null); };
}());
