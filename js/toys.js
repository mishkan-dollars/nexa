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
  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') d = {};
    const owned = Array.isArray(d.owned) ? d.owned.filter((id) => DEF[id]) : [];
    const wheel = [];   // колесо эмоций: 8 слотов, в слоте только купленная эмоция (и без повторов)
    for (let i = 0; i < WHEEL_N; i += 1) { const id = Array.isArray(d.wheel) ? d.wheel[i] : null; wheel.push(DEF[id] && DEF[id].kind === 'emote' && owned.indexOf(id) >= 0 && wheel.indexOf(id) < 0 ? id : null); }
    return {
      credits: Number.isFinite(d.credits) ? Math.max(0, Math.floor(d.credits)) : START_CREDITS,
      owned,
      loadout: DEF[d.loadout] && !DEF[d.loadout].kind && owned.indexOf(d.loadout) >= 0 ? d.loadout : null,
      wheel: wheel,
      hud: { life: !!(d.hud && d.hud.life), gear: !!(d.hud && d.hud.gear) },
      paid: Array.isArray(d.paid) ? d.paid : []
    };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
  S = load();

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
  function renderShop() {
    const note = shopNote ? '<p class="shop-note ' + shopNote.kind + '">' + shopNote.text + '</p>' : '';
    return '<div class="screen-shell"><div class="panel" style="max-width:900px;margin:auto;"><div class="panel-head"><div><p class="eyebrow">NEXA/OS</p><h2>SHOP</h2></div><div class="session-tag">BALANCE<strong>' + S.credits + ' CR</strong></div></div>' +
      '<div class="back-row"><button class="link-button" data-action="menu">← BACK TO NEXA/OS</button></div>' +
      '<p style="color:var(--muted);margin-bottom:20px;">C:\\NEXA\\SHOP\\ &nbsp;//&nbsp; PLUSH ITEMS GRANT A MISSION ABILITY. ONE ITEM CAN BE CARRIED INTO A MISSION. EMOTES ARE PLAYED FROM THE WHEEL: HOLD B.</p>' + note +
      '<div class="shop-grid">' + CATALOG.map(card).join('') + EMOTES.map(card).join('') + lockedCard() + '</div></div></div>';
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
      if (S.credits < d.price) { shopNote = { kind: 'bad', text: 'NOT ENOUGH CREDITS' }; ctx.audio && ctx.audio.playSfx('denied'); }
      else { S.credits -= d.price; S.owned.push(d.id); if (d.kind === 'emote') { const i = S.wheel.indexOf(null); if (i >= 0) S.wheel[i] = d.id; } else S.loadout = d.id; save(); shopNote = { kind: 'ok', text: 'PURCHASE COMPLETE' }; sfx('uibuy'); }
      ctx.render && ctx.render(); fillAvatars(); return true;
    }
    if (a === 'shop-equip') {
      const d = DEF[v]; if (!d || S.owned.indexOf(d.id) < 0) return true;
      if (d.kind === 'emote') { const i = S.wheel.indexOf(d.id); if (i >= 0) S.wheel[i] = null; else { const e = S.wheel.indexOf(null); if (e >= 0) S.wheel[e] = d.id; else S.wheel[0] = d.id; } }
      else S.loadout = S.loadout === d.id ? null : d.id;
      save(); shopNote = null; ctx.render && ctx.render(); fillAvatars(); return true;
    }
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
  function bonus(n) { pendBonus = Math.max(0, Math.round(n) || 0); }
  function reward(taskId) {
    const first = S.paid.indexOf(taskId) < 0;
    const n = (first ? REWARD_FIRST : REWARD_REPLAY) + pendBonus; pendBonus = 0;
    if (first) S.paid.push(taskId);
    S.credits += n; save();
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

  window.Toys = {
    CATALOG, EMOTES, def: (id) => DEF[id], REWARD_FIRST,
    emoteWheel: () => S.wheel.slice(), audio: () => ctx.audio,
    get credits() { return S.credits; },
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
