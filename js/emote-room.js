// NEXA: эмоции в лобби. Карточка магазина (миниатюра из реальных кадров танца, медведь у кнопки PREVIEW) и комната предпросмотра:
// абсолютно чёрная комната, тусклая мерцающая лампа с настоящими тенями, конус света с пылинками, глаза медведя в темноте.
// Стикмена вращают мышью, колесо — масштаб; Beat Bump (бас → FOV и лампа), пружинная камера с «памятью взгляда», приглушение музыки лобби.
// Ядро (каталог танцев, загрузчик, поза, фигура, музыка, звуки) — js/emote.js (window.EmoteCore). Показывает любой танец из каталога; зацикленный играет без конца.
(function () {
  'use strict';
  const K = window.EmoteCore, E = window.Emote;
  if (!K || !E) return;
  const C = window.Missions && window.Missions._core;
  const { clamp, lerp, spr, sprStep, smooth } = K;
  const BLEND_IN = 0.4;   // секунды плавного перехода из стойки в танец
  const toys = () => window.Toys;
  const audio = () => (toys() && toys().audio ? toys().audio() : null);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  // уровни — из настроек лобби (мастер/музыка/эффекты и их выключатели)
  const sfxLvl = () => { const a = audio(); return a && a.sfxEnabled !== false ? num(a.sfxVolume, 1) * num(a.masterVolume, 0.55) * 1.6 : 0; };
  const musLvl = () => { const a = audio(); return a && a.musicEnabled !== false ? num(a.musicVolume, 1) * num(a.masterVolume, 0.55) * 0.95 * 1.35 : 0; };

  // общий AudioContext лобби-эмоций (создаётся по первому жесту пользователя)
  let AC = null, FX = null;
  function getAC() {
    if (AC && AC.state !== 'closed') { if (AC.state === 'suspended') { try { AC.resume(); } catch (e) { /* ignore */ } } return AC; }
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    try { AC = new A(); } catch (e) { AC = null; return null; }
    FX = K.makeFx(AC, sfxLvl);
    return AC;
  }

  // ------------------------------------------------------------------ карточка магазина
  const f1 = (v) => v.toFixed(1);
  function figSvgInner(tr) {
    const t = K.thumbLines(tr.iconFrame, 33, 32, 59, tr);
    return t.lines.map((l) => '<line x1="' + f1(l[0]) + '" y1="' + f1(l[1]) + '" x2="' + f1(l[2]) + '" y2="' + f1(l[3]) + '"/>').join('') + '<circle cx="' + f1(t.head[0]) + '" cy="' + f1(t.head[1]) + '" r="4.4"/>';
  }
  E.thumbSvg = (id) => { const tr = K.track(id || E.id); return tr ? '<svg viewBox="0 0 64 64" class="shop-ico em-ico" aria-hidden="true">' + figSvgInner(tr) + '</svg>' : ''; };
  E.bearSvg = () => '<span class="em-bear" aria-hidden="true"><svg viewBox="0 0 38 26"><circle class="b-ear" cx="7" cy="9" r="5"/><circle class="b-ear" cx="31" cy="9" r="5"/><circle class="b-body" cx="19" cy="22" r="13"/>' +
    '<g class="eye-l"><circle class="eye-w" cx="13" cy="17" r="3.2"/><circle class="pup" cx="13" cy="17" r="1.7"/></g><g class="eye-r"><circle class="eye-w" cx="25" cy="17" r="3.2"/><circle class="pup" cx="25" cy="17" r="1.7"/></g>' +
    '<ellipse class="nose" cx="19" cy="22.5" rx="3" ry="2"/><path class="mouth" d="M15 24.5 Q19 28 23 24.5"/></svg></span>';

  function animThumb(svg, frame, tr) {
    const t = K.thumbLines(frame, 33, 32, 59, tr), ls = svg.querySelectorAll('line'), c = svg.querySelector('circle');
    t.lines.forEach((l, i) => { const e = ls[i]; if (!e) return; e.setAttribute('x1', f1(l[0])); e.setAttribute('y1', f1(l[1])); e.setAttribute('x2', f1(l[2])); e.setAttribute('y2', f1(l[3])); });
    if (c) { c.setAttribute('cx', f1(t.head[0])); c.setAttribute('cy', f1(t.head[1])); }
  }

  // медведь у кнопки PREVIEW: зрачки следят за курсором; наведение на кнопку — улыбка и подмигивание; клик — низкий «вуш»
  let shopBound = false, lookQ = false;
  const mouse = { x: -1, y: -1 };
  const btnOf = (t) => { const b = t && t.closest ? t.closest('[data-action="shop-preview"]') : null; return b && K.track(b.dataset.value) ? b : null; };
  const bearOf = (b) => (b && b.parentNode ? b.parentNode.querySelector('.em-bear') : null);
  function bearLook() {
    lookQ = false;
    document.querySelectorAll('.em-bear').forEach((b) => {
      const r = b.getBoundingClientRect(); if (!r.width) return;
      const cx = r.left + r.width / 2, cy = r.top + r.height * 0.65, dx = mouse.x - cx, dy = mouse.y - cy, d = Math.hypot(dx, dy) || 1, k = Math.min(1.7, d / 50);
      const t = 'translate(' + f1(dx / d * k) + ' ' + f1(dy / d * k * 0.8) + ')';
      b.querySelectorAll('.pup').forEach((p) => p.setAttribute('transform', t));
    });
  }
  function setBear(b, on) {
    const bear = bearOf(b); if (!bear) return;
    clearTimeout(bear._w);
    if (on) { bear.classList.add('smile'); bear._w = setTimeout(() => bear.classList.add('wink'), 240); } else bear.classList.remove('smile', 'wink');
  }
  E.bindShop = function () {
    if (!shopBound) {
      shopBound = true;
      document.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; if (!lookQ) { lookQ = true; requestAnimationFrame(bearLook); } }, { passive: true });
      document.addEventListener('mouseover', (e) => { const b = btnOf(e.target); if (b && !(e.relatedTarget && b.contains(e.relatedTarget))) setBear(b, true); });
      document.addEventListener('mouseout', (e) => { const b = btnOf(e.target); if (b && !(e.relatedTarget && b.contains(e.relatedTarget))) setBear(b, false); });
      document.addEventListener('click', (e) => { if (btnOf(e.target)) { getAC(); FX && FX.bear(); } }, true);
    }
    document.querySelectorAll('.shop-av.em:not([data-eb])').forEach((av) => {
      av.dataset.eb = '1';
      const svg = av.querySelector('.em-ico'), tr = K.track(av.dataset.id); if (!svg || !tr) return;
      let raf = 0, t0 = 0;
      const loop = (now) => { animThumb(svg, clamp(Math.floor(((now - t0) / 1000 * tr.fps) % K.NF), 0, K.NF - 1), tr); raf = requestAnimationFrame(loop); };
      const card = av.closest('.shop-card') || av;
      card.addEventListener('mouseenter', () => { if (raf) return; t0 = performance.now(); raf = requestAnimationFrame(loop); });
      card.addEventListener('mouseleave', () => { cancelAnimationFrame(raf); raf = 0; animThumb(svg, tr.iconFrame, tr); });
    });
    if (!lookQ) { lookQ = true; requestAnimationFrame(bearLook); }
  };

  // ------------------------------------------------------------------ приглушение музыки лобби на время предпросмотра
  const lobby = { saved: null, timer: 0 };
  function lobbyFade(to, ms) {
    const a = audio(); if (!a || !a.elements) return;
    clearInterval(lobby.timer);
    if (to < 1 && !lobby.saved) { lobby.saved = []; Object.keys(a.elements).forEach((k) => { const el = a.elements[k] && a.elements[k].audio; if (el && !el.paused) lobby.saved.push({ el, v: el.volume }); }); }
    if (!lobby.saved) return;
    const t0 = performance.now(), from = lobby.saved.map((s) => s.el.volume), saved = lobby.saved;
    const tick = () => {
      const k = clamp((performance.now() - t0) / ms, 0, 1);
      saved.forEach((s, i) => { try { s.el.volume = clamp(lerp(from[i], s.v * to, k), 0, 1); } catch (e) { /* ignore */ } });
      if (k >= 1) { clearInterval(lobby.timer); if (to >= 1) { lobby.saved = null; try { a.updateAllVolumes(); } catch (e) { /* ignore */ } } }
    };
    lobby.timer = setInterval(tick, 40); tick();
  }

  // ------------------------------------------------------------------ комната
  let pv = null;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function glow(T) { // мягкое пятно для ореолов (канвас-текстура)
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(cv);
  }

  E.openPreview = function (id) {
    const tr = K.track(id || E.id), d = toys() && toys().def && tr ? toys().def(tr.id) : null;
    if (pv || !d) return;
    tr.load();   // данные танца — асинхронно (fetch); комната дождётся их в темноте
    const owned = toys().owned(d.id);
    const el = document.createElement('div'); el.id = 'em-preview';
    el.innerHTML = '<canvas class="tp-canvas"></canvas><div class="tp-info"><p class="eyebrow">ANIMATION</p><p class="tp-code">' + d.code + '</p><h2 class="tp-name">' + esc(d.name) + '</h2>' +
      '<p class="tp-sub">EMOTE ANIMATION ITEM</p><ul class="tp-list">' + d.lines.map((l) => '<li>' + l + '</li>').join('') + '</ul>' + (owned ? '<p class="tp-own">OWNED</p>' : '<p class="tp-price">' + d.price + ' CR</p>') + '</div>' +
      '<div class="emp-bar"><div class="emp-prog"><i></i></div><button type="button" class="emp-replay" data-cursor="interact">REPLAY</button></div>' +
      '<button type="button" class="tp-close" data-cursor="interact">[ ESC / CLOSE ]</button><p class="emp-note"></p><p class="tp-hint">DRAG: ROTATE THE DANCER &nbsp;|&nbsp; WHEEL: ZOOM &nbsp;|&nbsp; SPACE: REPLAY</p>';
    document.body.appendChild(el);
    pv = { el, tr, dead: false, listeners: [], ready: false };
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); pv.listeners.push([t, ev, fn, opt]); };
    on(el.querySelector('.tp-close'), 'click', E.closePreview);
    on(el.querySelector('.emp-replay'), 'click', () => replay());
    on(document, 'keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); E.closePreview(); }
      else if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); replay(); }
    }, true);
    const ac = getAC(); FX && FX.open();
    pv.ac = ac; lobbyFade(0.1, 700);
    const mine = pv;
    Promise.resolve(C && C.loadThree ? C.loadThree() : null).then(() => { if (pv !== mine || mine.dead) return; start(); })
      .catch((e) => { console.warn('[emote-room]', e); if (pv === mine && !mine.dead) el.querySelector('.emp-note').textContent = 'MODEL LOAD FAULT'; });
  };

  E.closePreview = function () {
    if (!pv) return;
    const S = pv; pv = null; S.dead = true;
    cancelAnimationFrame(S.raf);
    S.listeners.forEach((l) => l[0].removeEventListener(l[1], l[2], l[3]));
    try { S.M && S.M.stop(); } catch (e) { /* ignore */ }
    try { S.dispose && S.dispose(); } catch (e) { console.warn('[emote-room]', e); }
    S.el.remove();
    lobbyFade(1, 900);
  };

  function replay() {
    const S = pv; if (!S || !S.ready) return;
    if (S.tr.state === 'error') { S.note.textContent = ''; S.tr.load(); }   // повторная попытка загрузить данные танца
    if (S.ph === 'dark') return;
    if (S.M) S.M.stop();
    S.M = null; S.tp = 0; S.bl = 0; S.t = 0; S.beat = K.makeBeat(); S.started = false; S.wait = 0; S.ph = 'dark'; S.rt = Math.min(S.rt, 0.9); S.endT = 0;
    S.el.querySelector('.emp-replay').classList.remove('on'); S.prog.style.width = '0';
  }

  function start() {
    const T = window.THREE, el = pv.el, cv = el.querySelector('.tp-canvas'), S = pv;
    let r;
    try { r = new T.WebGLRenderer({ canvas: cv, antialias: true }); } catch (e) { el.querySelector('.emp-note').textContent = 'MODEL LOAD FAULT'; return; }
    r.setClearColor(0x000000, 1); r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    const sc = new T.Scene(); sc.background = new T.Color(0x000000);
    const cam = new T.PerspectiveCamera(38, 1, 0.05, 40);
    // --- лампа
    const LAMP = new T.Vector3(0.3, 3.5, 0.45), ANG = 0.46;
    const spot = new T.SpotLight(0xffd9a8, 2, 14, ANG, 0.7, 1.15);
    spot.position.copy(LAMP); spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = 1.2; spot.shadow.camera.far = 9; spot.shadow.bias = -0.0006;
    sc.add(spot); sc.add(spot.target);
    sc.add(new T.AmbientLight(0x1a1a24, 0.07));
    const bulb = new T.Mesh(new T.SphereGeometry(0.07, 14, 10), new T.MeshBasicMaterial({ color: 0xfff1d6 })); bulb.position.copy(LAMP); sc.add(bulb);
    const cord = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 6, 6), new T.MeshBasicMaterial({ color: 0x0a0a0a })); cord.position.set(LAMP.x, LAMP.y + 3.1, LAMP.z); sc.add(cord);
    const floor = new T.Mesh(new T.CircleGeometry(9, 48), new T.MeshLambertMaterial({ color: 0x2b2b30 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor);
    // --- конус света
    const H = LAMP.length(), R = H * Math.tan(ANG);
    const coneTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 64; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(255,235,205,.9)'); g.addColorStop(1, 'rgba(255,235,205,0)'); x.fillStyle = g; x.fillRect(0, 0, 4, 64); return new T.CanvasTexture(c); })();
    const coneGeo = new T.CylinderGeometry(0.06, R, H, 40, 1, true); coneGeo.translate(0, -H / 2, 0);
    const coneMat = new T.MeshBasicMaterial({ map: coneTex, transparent: true, opacity: 0.14, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    const cone = new T.Mesh(coneGeo, coneMat); cone.position.copy(LAMP); cone.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), LAMP.clone().multiplyScalar(-1).normalize()); sc.add(cone);
    // --- пылинки в конусе
    const ND = 90, dp = new Float32Array(ND * 3), dv = new Float32Array(ND * 3), dph = new Float32Array(ND);
    const inCone = (x, y, z) => { const k = clamp(y / LAMP.y, 0, 1), ax = LAMP.x * k, az = LAMP.z * k, rr = 0.3 + (R - 0.3) * (1 - k) * 0.95; return Math.hypot(x - ax, z - az) < rr; };
    const respawn = (i) => { for (let n = 0; n < 12; n += 1) { const y = 0.1 + Math.random() * 3.2, a = Math.random() * 6.283, k = y / LAMP.y, rr = (0.3 + (R - 0.3) * (1 - k) * 0.95) * Math.sqrt(Math.random()); dp[i * 3] = LAMP.x * k + Math.cos(a) * rr; dp[i * 3 + 1] = y; dp[i * 3 + 2] = LAMP.z * k + Math.sin(a) * rr; if (inCone(dp[i * 3], y, dp[i * 3 + 2])) break; } };
    for (let i = 0; i < ND; i += 1) { respawn(i); dph[i] = Math.random() * 6.283; dv[i * 3 + 1] = 0.02 + Math.random() * 0.03; }
    const dgeo = new T.BufferGeometry(); dgeo.setAttribute('position', new T.BufferAttribute(dp, 3));
    const dmat = new T.PointsMaterial({ size: 0.035, color: 0xffeacb, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const dust = new T.Points(dgeo, dmat); dust.frustumCulled = false; sc.add(dust);
    // --- глаза медведя в темноте
    const gTex = glow(T), eyes = new T.Group(), eyeParts = [];
    const eyeMat = new T.MeshBasicMaterial({ color: 0xdadde0 }), pupMat = new T.MeshBasicMaterial({ color: 0x030303 }), eGeo = new T.SphereGeometry(0.034, 12, 8), pGeo = new T.SphereGeometry(0.017, 10, 6);
    const haloMat = new T.SpriteMaterial({ map: gTex, color: 0xaab4c0, transparent: true, opacity: 0.2, blending: T.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 2; i += 1) { const g = new T.Group(), w = new T.Mesh(eGeo, eyeMat), p = new T.Mesh(pGeo, pupMat), h = new T.Sprite(haloMat); h.scale.set(0.22, 0.22, 1); g.add(h, w, p); g.position.x = (i ? 1 : -1) * 0.095; eyes.add(g); eyeParts.push({ g, p }); }
    sc.add(eyes);
    // --- фигура, шлейфы
    const fig = K.makeFigure(T, { cast: true, receive: true }); sc.add(fig.group);
    // чёрная комната: у чёрного стикмена материал чуть светлее, чем в миссиях (иначе силуэт тонет в темноте), плюс едва заметный холодный контровой свет
    fig.group.traverse((m) => { if (m.isMesh && m.material && m.material.emissive && m.material.color.getHex() === 0x050505) { m.material.color.setHex(0x191a1e); m.material.emissive.setHex(0x14151a); } });
    const rim = new T.PointLight(0x8fa8d0, 0.7, 5, 2); rim.position.set(-1.6, 1.5, 1.9); sc.add(rim);
    const trails = K.makeTrails(T); sc.add(trails.group);
    const pose = new Float32Array(45), sqo = { y: 1, xz: 1 };
    // --- состояние
    Object.assign(S, {
      r, sc, cam, fig, trails, pose, sqo, spot, coneMat, dust, dmat, bulb, eyes, eyeParts, ph: 'dark', rt: 0, t: 0, started: false, wait: 0, tp: 0, bl: 0, tmp: new Float32Array(45), endT: 0, M: null, beat: K.makeBeat(),
      H: spr(0.45), hT: 0.45, hv: 0, dragging: false, dist: 4.7, distS: spr(7.2), LKx: spr(0), LKy: spr(0.85), LKz: spr(0), CPx: spr(0), CPy: spr(1.2), CPz: spr(7.2),
      SQ: spr(0), sh: 0, flick: 0, fseq: null, fnext: 99, lampOn: false, last: performance.now(), hb: 0.2, gl: 4 + Math.random() * 4, eyeBlink: 2.5, eyeT: 0,
      prog: el.querySelector('.emp-prog i'), note: el.querySelector('.emp-note'), replayBtn: el.querySelector('.emp-replay'), ready: true
    });
    K.idlePose(0, pose, S.tr); fig.update(pose, null);
    // --- ввод: вращение стикмена мышью с инерцией, колесо — масштаб
    const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); S.listeners.push([t, ev, fn, opt]); };
    const size = () => {
      const w = el.clientWidth || innerWidth || 800, h = el.clientHeight || innerHeight || 450;
      r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    };
    size(); on(window, 'resize', size);
    let px = 0, pid = null, pt = 0;
    on(cv, 'contextmenu', (e) => e.preventDefault());
    on(cv, 'pointerdown', (e) => { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } pid = e.pointerId; px = e.clientX; pt = performance.now(); S.dragging = true; S.hv = 0; });
    on(cv, 'pointermove', (e) => {
      if (e.pointerId !== pid || !S.dragging) return;
      const now = performance.now(), dx = e.clientX - px, dtm = Math.max(0.008, (now - pt) / 1000); px = e.clientX; pt = now;
      S.hT += dx * 0.012; S.hv = clamp(S.hv * 0.55 + (dx * 0.012 / dtm) * 0.45, -7, 7);
    });
    const up = (e) => { if (e.pointerId === pid) { S.dragging = false; pid = null; if (performance.now() - pt > 90) S.hv = 0; } };
    on(cv, 'pointerup', up); on(cv, 'pointercancel', up);
    on(cv, 'wheel', (e) => { e.preventDefault(); S.dist = clamp(S.dist * (1 + clamp(e.deltaY, -120, 120) * 0.0012), 2.4, 7); }, { passive: false });
    S.step = (dt) => step(S, dt, T);
    S.dispose = () => {
      [eGeo, pGeo, coneGeo, dgeo, bulb.geometry, cord.geometry, floor.geometry].forEach((g) => g.dispose());
      [eyeMat, pupMat, haloMat, coneMat, dmat, bulb.material, cord.material, floor.material, gTex, coneTex].forEach((m) => m.dispose());
      fig.dispose(); trails.dispose(); sc.clear && sc.clear(); r.dispose(); try { r.forceContextLoss(); } catch (e) { /* ignore */ }
    };
    S.raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    const S = pv; if (!S || S.dead) return;
    S.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - S.last) / 1000); S.last = now;
    S.step(dt);
  }

  // случайная серия микро-вспышек лампы: [{d, lv}], lv — относительная яркость на d секунд
  const burstSeq = (n) => { const s = []; for (let i = 0; i < n; i += 1) s.push({ d: 0.025 + Math.random() * 0.06, lv: i % 2 ? 0.85 + Math.random() * 0.25 : 0.2 + Math.random() * 0.5 }); return s; };

  function step(S, dt, T) {
    const fig = S.fig, pose = S.pose, sqo = S.sqo, M = S.M, tr = S.tr;
    S.rt += dt;
    if (M) M.tick(dt);
    // ---- фазы: тёмная комната → лампа включается серией вспышек → музыка и танец → финал
    if (S.ph === 'dark') {
      if (!S.lampOn && S.rt >= 0.3) { S.lampOn = true; S.fseq = [{ d: 0.07, lv: 0.25 }, { d: 0.05, lv: 1 }, { d: 0.09, lv: 0.1 }, { d: 0.04, lv: 0.9 }, { d: 0.13, lv: 0.35 }, { d: 0.05, lv: 1 }]; S.fi = 0; S.fT = S.fseq[0].d; FX && FX.heart(0.35); }
      if (S.rt >= 1.25) {
        if (!tr.ready()) { if (tr.state === 'error') S.note.textContent = 'EMOTE DATA UNAVAILABLE'; else if (tr.state === 'idle') tr.load(); }   // пока данные не пришли, комната ждёт в темноте
        else {
          S.ph = 'play'; S.started = false; S.wait = 0; S.t = 0; S.tp = 0; S.bl = 0;
          const ac = S.ac || getAC();
          if (ac) { S.M = K.makeMusic(ac, musLvl, tr); S.M.target = 1; S.M.play(0); FX && FX.pull(0.8); } else S.note.textContent = 'AUDIO UNAVAILABLE';
          S.sh = 1.1;
        }
      }
    }
    const M2 = S.M;
    if (S.ph === 'play') {
      if (!S.started) {
        S.wait += dt;
        if (!M2 || M2.running() || M2.failed || M2.blocked || S.wait > 1.2) {
          S.started = true; S.t = M2 && M2.running() ? M2.time() : 0; S.tp = S.t; S.bl = 0;
          if (tr.loop) S.replayBtn.classList.add('on');   // зацикленный танец не кончается: «повтор» доступен сразу
          if (M2 && (M2.failed || M2.blocked)) S.note.textContent = 'AUDIO UNAVAILABLE';
        }
      } else {
        K.danceClock(S, M2, dt, tr); S.bl += dt;
        if (!tr.loop) {   // обычный танец доигрывается и замирает в финальной позе; зацикленный идёт по кругу бесконечно
          if (S.t >= tr.dur + 0.05) { S.ph = 'end'; S.endT = 0; S.replayBtn.classList.add('on'); if (M2) M2.target = 0; } else if (M2 && S.t > tr.dur - 0.5) M2.target = clamp((tr.dur + 0.05 - S.t) / 0.55, 0, 1);
        }
      }
    } else if (S.ph === 'end') S.endT += dt;
    const playing = S.ph === 'play' && S.started;
    S.prog.style.width = (clamp(S.ph === 'end' ? 1 : tr.loop ? (S.t % tr.dur) / tr.dur : S.t / tr.dur, 0, 1) * 100).toFixed(1) + '%';

    // ---- Beat Bump: бас трека (живой анализатор при http, иначе запечённая огибающая)
    let b = 0;
    if (playing) { const lb = M2 ? M2.bass() : -1; b = lb >= 0 && M2.running() ? lb : K.envAt(S.t, tr); }
    const fired = S.beat.update(dt, b, playing, S.rt);
    if (fired > 1.0 && Math.random() < 0.55) { S.fseq = [{ d: 0.03, lv: 0.4 }, { d: 0.035, lv: 1 }]; S.fi = 0; S.fT = S.fseq[0].d; }

    // ---- удары ступней: тряска камеры, сжатие тела, пыль, глухой стук
    if (playing) {
      K.impactsIn(tr, S.tp, S.t, (im) => { S.sh = Math.min(1.8, S.sh + im.s * 0.9); S.SQ.v += 1.4 * im.s; FX && FX.stomp(im.s); dustBurst(S, fig, im); });
      S.tp = S.t;
    }
    S.sh *= Math.exp(-dt * 8);
    const vy = playing ? K.pvyAt(S.t, tr) : 0;
    sprStep(S.SQ, -Math.min(0.045, Math.abs(vy) * 0.035), 230, 14, dt);
    const q = clamp(S.SQ.x, -0.08, 0.12); sqo.y = 1 - q * 0.9; sqo.xz = 1 + q * 0.5;

    // ---- поза и поворот мышью (инерция после броска)
    if (S.ph === 'play' && S.started) { K.sampleDance(S.t, pose, tr); if (S.bl < BLEND_IN) K.mixPose(K.idlePose(S.rt, S.tmp, tr), pose, smooth(S.bl / BLEND_IN), pose); }   // первые 0.4 с — плавно из стойки
    else if (S.ph === 'end') K.sampleDance(tr.dur, pose, tr); else K.idlePose(S.rt, pose, tr);
    if (!S.dragging) { S.hT += S.hv * dt; S.hv *= Math.exp(-2.6 * dt); }
    sprStep(S.H, S.hT, 80, 11, dt);
    fig.place(0, 0, S.H.x); fig.update(pose, sqo);
    const wp = S.wp || (S.wp = new T.Vector3()); fig.toWorld(0, wp);   // таз в мире
    S.trails.update(S.ph === 'play' && S.started && S.bl >= BLEND_IN ? S.t : 0, fig, S.cam.position, S.flick, tr);

    // ---- лампа: базовое дыхание + микро-вспышки + бит
    S.fnext -= dt;
    if (S.lampOn && S.fnext <= 0 && !S.fseq) { S.fseq = burstSeq(2 + (Math.random() * 4 | 0)); S.fi = 0; S.fT = S.fseq[0].d; S.fnext = 1.2 + Math.random() * 3.8; }
    let lv = 1;
    if (S.fseq) { lv = S.fseq[S.fi].lv; S.fT -= dt; if (S.fT <= 0) { S.fi += 1; if (S.fi >= S.fseq.length) S.fseq = null; else S.fT = S.fseq[S.fi].d; } }
    const on = S.lampOn ? clamp((S.rt - 0.3) / 0.6, 0, 1) : 0;
    S.flick = on * clamp((0.93 + 0.035 * Math.sin(S.rt * 7.3) + 0.025 * Math.sin(S.rt * 2.1 + 1)) * lv + S.beat.k * 0.22, 0.05, 1.5);
    S.spot.intensity = 2 * S.flick; S.bulb.material.color.setScalar(clamp(0.25 + 0.75 * S.flick, 0, 1.1));
    S.coneMat.opacity = 0.14 * S.flick; S.dmat.opacity = 0.75 * clamp(S.flick, 0, 1.2);
    // сердцебиение первые секунды
    S.hb -= dt; if (FX && S.hb <= 0 && S.rt < 6) { FX.heart(0.3 * Math.exp(-S.rt / 3)); S.hb = 0.82; }
    // случайный глитч интерфейса
    S.gl -= dt; if (S.gl <= 0) { S.el.classList.add('glitch'); setTimeout(() => { if (S.el) S.el.classList.remove('glitch'); }, 70 + Math.random() * 60); S.gl = 3 + Math.random() * 5; }
    if (fired > 1.1 && Math.random() < 0.25) { S.el.classList.add('glitch'); setTimeout(() => { if (S.el) S.el.classList.remove('glitch'); }, 80); }

    // ---- пыль
    const dp = S.dust.geometry.attributes.position.array, dv = S.dustV || (S.dustV = new Float32Array(dp.length));
    for (let i = 0; i < dp.length / 3; i += 1) {
      const k = i * 3, ph = S.rt * 0.7 + i;
      dp[k] += (Math.sin(ph * 1.3) * 0.03 + dv[k]) * dt; dp[k + 1] += (0.025 + Math.sin(ph * 0.9) * 0.015 + dv[k + 1]) * dt; dp[k + 2] += (Math.cos(ph * 1.1) * 0.03 + dv[k + 2]) * dt;
      const dr = Math.exp(-1.6 * dt); dv[k] *= dr; dv[k + 1] *= dr; dv[k + 2] *= dr;
      if (dp[k + 1] > 3.4 || dp[k + 1] < 0.03 || !pointIn(dp[k], dp[k + 1], dp[k + 2], S)) { respawnDust(dp, k, S); dv[k] = dv[k + 1] = dv[k + 2] = 0; }
    }
    S.dust.geometry.attributes.position.needsUpdate = true;

    // ---- глаза медведя: следят за танцором, медленно приближаются, моргают; ярче, когда лампа «проваливается»
    const e = S.eyes, tt = S.rt, appr = clamp(tt / 40, 0, 1);
    e.position.set(lerp(-2.6, -1.7, appr) + Math.sin(tt * 0.31) * 0.05, 1.08 + Math.sin(tt * 0.5) * 0.02, lerp(-4.7, -3.3, appr));
    e.lookAt(wp.x, wp.y + 0.7, wp.z);
    S.eyeBlink -= dt; if (S.eyeBlink <= 0) { S.eyeT = 0.13; S.eyeBlink = 2.2 + Math.random() * 3.5; }
    let sy = 1; if (S.eyeT > 0) { S.eyeT -= dt; sy = Math.abs(S.eyeT / 0.13 - 0.5) * 2 * 0.9 + 0.1; }
    S.eyeParts.forEach((p) => { p.g.scale.y = sy; p.p.position.set(0, 0, 0.024); });   // зрачок смотрит на танцора (+Z глаза = взгляд)
    const eg = clamp(0.55 + (1 - clamp(S.flick, 0, 1)) * 0.9, 0.4, 1.3); S.eyes.children.forEach((g) => { g.children[0].material.opacity = 0.2 * eg; });

    // ---- камера: орбита с инерцией, «память взгляда», дрожь, пульс FOV
    sprStep(S.distS, S.dist, 70, 9.5, dt);
    // смотрим на середину тела, не на голову: фигура целиком в кадре
    sprStep(S.LKx, wp.x, 26, 6.5, dt); sprStep(S.LKy, 0.82 + (pose[1] - 0.95) * 0.5, 26, 6.5, dt); sprStep(S.LKz, wp.z, 26, 6.5, dt);
    const yaw = 0.05 * Math.sin(S.rt * 0.35), cx = Math.sin(yaw) * S.distS.x, cz = Math.cos(yaw) * S.distS.x;
    sprStep(S.CPx, cx, 70, 9.5, dt); sprStep(S.CPy, 1.15 + (S.distS.x - 4.7) * 0.05, 70, 9.5, dt); sprStep(S.CPz, cz, 70, 9.5, dt);
    const sa = S.sh, tt2 = S.rt;
    S.cam.position.set(S.CPx.x + sa * 0.018 * Math.sin(tt2 * 61), S.CPy.x + sa * 0.018 * Math.sin(tt2 * 53 + 2), S.CPz.x);
    S.cam.lookAt(S.LKx.x + sa * 0.006 * Math.sin(tt2 * 47), S.LKy.x + sa * 0.006 * Math.sin(tt2 * 43), S.LKz.x);
    const fov = 38 - 1.7 * S.beat.k; if (Math.abs(S.cam.fov - fov) > 0.01) { S.cam.fov = fov; S.cam.updateProjectionMatrix(); }
    S.r.render(S.sc, S.cam);
  }
  const pointIn = (x, y, z, S) => { const R = 1.76, k = clamp(y / 3.5, 0, 1), ax = 0.3 * k, az = 0.45 * k, rr = 0.3 + (R - 0.3) * (1 - k) * 0.95; return Math.hypot(x - ax, z - az) < rr; };
  function respawnDust(dp, k, S) {
    for (let n = 0; n < 12; n += 1) {
      const y = 0.1 + Math.random() * 3.2, a = Math.random() * 6.283, kk = y / 3.5, rr = (0.3 + (1.76 - 0.3) * (1 - kk) * 0.95) * Math.sqrt(Math.random());
      dp[k] = 0.3 * kk + Math.cos(a) * rr; dp[k + 1] = y; dp[k + 2] = 0.45 * kk + Math.sin(a) * rr;
      if (pointIn(dp[k], y, dp[k + 2], S)) break;
    }
  }
  // удар ступни: десяток пылинок вылетает от пола в стороны и вверх
  function dustBurst(S, fig, im) {
    const dp = S.dust.geometry.attributes.position.array, dv = S.dustV || (S.dustV = new Float32Array(dp.length)), n = Math.round(8 + 14 * im.s), c = Math.cos(fig.h), s = Math.sin(fig.h);
    const wx = fig.ox + im.x * c + im.z * s, wz = fig.oz - im.x * s + im.z * c;
    for (let j = 0; j < n; j += 1) {
      const i = (Math.random() * (dp.length / 3)) | 0, k = i * 3, a = Math.random() * 6.283, sp = (0.3 + Math.random() * 0.9) * im.s;
      dp[k] = wx + Math.cos(a) * 0.08; dp[k + 1] = 0.04 + Math.random() * 0.1; dp[k + 2] = wz + Math.sin(a) * 0.08;
      dv[k] = Math.cos(a) * sp; dv[k + 1] = (0.5 + Math.random() * 1.1) * im.s; dv[k + 2] = Math.sin(a) * sp;
    }
  }

  E._room = () => pv;
  E._roomStep = (dt) => { if (pv && pv.ready && !pv.dead) pv.step(dt); };
}());
