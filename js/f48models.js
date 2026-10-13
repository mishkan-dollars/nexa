// NEXA: миссия 48 — оружие и модели. Миниган (раскрутка стволов, бесконечный магазин), тяжёлый костюм (множитель урона), общие фабрики моделей C.f48.
// Только добавляет: WEAPONS.minigun, C.WEAPON_BUILD.minigun и обёртки Run.prototype (поведение остальных оружий не меняется).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.WEAPONS || !C.WEAPON_BUILD || !C.geo) return;
  const { Run, WEAPONS } = C;
  const P = Run.prototype;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const F = C.f48 = C.f48 || {};

  // ------------------------------------------------------------------ миниган
  // Геометрия — общая с NPC (F.mgGeo из f48chars.js): корпус привода, рукоятки, лента, вращающийся блок из 6 стволов.
  // Рисуется шейдером с цветом вершин и глубиной (как готовые модели), перед ним чистится буфер глубины; цвета — в самой геометрии.
  WEAPONS.minigun = Object.assign({}, WEAPONS.ak, {
    name: 'MINIGUN', tag: ['7.62', '6-BARREL'], mag: 9999, reserve: 9999, maxReserve: 9999, dmg: 26, rate: 0.045, auto: true, pellets: 1, chamber: false,
    hip: 0.055, ads: 0.03, bloom: 0.0035, recoil: 0.009, recoilY: 0.005, climb: 0.0025, back: 0.022, up: 0.02, shake: 0.0035,
    adsFov: 78, adsTime: 0.35, relief: 0.36, reload: 3, sound: 'minigun', range: 140,
    low: [0.4, -0.36, -0.72, -0.05, 0.44], sprint: [0.32, -0.52, -0.5, -0.5, 0.6, 0.28],
    anch: { grip: [0, -0.12, 0.085], sup: [0.03, -0.1, -0.12], muzzle: [0, 0.02, -0.96], rearZ: 0.0, sightY: 0.22 }
  });
  C.WEAPON_BUILD.minigun = function () { return { S: {}, sl: null, grip: [0, -0.12, 0.085], leftKind: 'cup' }; };

  const MG_VERT = 'attribute vec3 cc; varying vec3 vC; varying vec3 vN; varying vec3 vP; varying float vZ;\n' +
    'void main(){ vC = cc; vN = normalMatrix * normal; vZ = position.z; vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }';
  const MG_FRAG = 'uniform float uHeat; uniform float uFlash; varying vec3 vC; varying vec3 vN; varying vec3 vP; varying float vZ;\n' +
    'void main(){\n' +
    '  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;\n' +
    '  vec3 V = normalize(-vP), L = normalize(vec3(-0.35, 0.8, 0.5)), H = normalize(L + V);\n' +
    '  float d = max(dot(n, L), 0.0), s = pow(max(dot(n, H), 0.0), 36.0), lum = dot(vC, vec3(0.3, 0.59, 0.11));\n' +
    '  float fill = max(dot(n, normalize(vec3(0.7, -0.2, 0.4))), 0.0), rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);\n' +
    '  vec3 env = mix(vec3(0.05, 0.055, 0.065), vec3(0.45, 0.5, 0.56), clamp(reflect(-V, n).y * 0.5 + 0.5, 0.0, 1.0));\n' +
    '  vec3 c = vC * (0.4 + 0.9 * d + 0.25 * fill) + env * lum * 0.55 + vec3(s) * (0.15 + lum * 0.9) + vec3(0.05, 0.06, 0.075) * rim;\n' +
    '  float fr = smoothstep(-0.1, -0.9, vZ);\n' +
    '  c += vec3(1.0, 0.3, 0.06) * uHeat * smoothstep(-0.3, -0.9, vZ) * (0.35 + 0.65 * fr) * 0.6;\n' +
    '  c += vec3(1.0, 0.6, 0.25) * uFlash * (0.25 + 0.75 * fr) * (0.2 + 0.8 * d) * 0.55;\n' +
    '  gl_FragColor = vec4(c, 1.0);\n}';

  // текстуры вспышки: круглое ядро и вытянутый язык пламени вдоль ствола (рисуются один раз)
  let fxTex = null;
  function mgFxTex() {
    if (fxTex) return fxTex;
    const T = THREE, mk = (w, h, fn) => {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const x = cv.getContext('2d'), im = x.createImageData(w, h);
      for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) { const o = (j * w + i) * 4, v = fn(i / (w - 1) * 2 - 1, 1 - j / (h - 1)); im.data[o] = v[0]; im.data[o + 1] = v[1]; im.data[o + 2] = v[2]; im.data[o + 3] = v[3]; }
      x.putImageData(im, 0, 0);
      const t = new T.CanvasTexture(cv); t.needsUpdate = true; return t;
    };
    const mix = (a, b, k) => a + (b - a) * k;
    fxTex = {
      core: mk(64, 64, (u, v) => { const r = Math.min(1, Math.hypot(u, v * 2 - 1)), a = Math.pow(1 - r, 1.6); return [255, mix(250, 120, r), mix(220, 30, r), 255 * a]; }),
      streak: mk(32, 128, (u, v) => { const a = Math.pow(1 - v, 1.5) * Math.exp(-u * u * 5); return [255, mix(245, 110, v), mix(210, 20, v), 255 * a]; })
    };
    return fxTex;
  }

  function mgFps(mdl, rg) {
    const T = THREE, G = F.mgGeo && F.mgGeo();
    if (!G) return;
    const U = { uHeat: { value: 0 }, uFlash: { value: 0 } };
    const mat = new T.ShaderMaterial({ uniforms: U, vertexShader: MG_VERT, fragmentShader: MG_FRAG, side: T.DoubleSide, transparent: true, blending: T.NoBlending, depthTest: true, depthWrite: true });
    const geo = (g) => { const c = g.clone(); c.setAttribute('cc', c.getAttribute('color')); c.deleteAttribute('color'); return c; };
    mdl.g.add(rg.mk(geo(G.body), mat, 1000));
    const spin = new T.Group();
    spin.add(rg.mk(geo(G.rotor), mat, 1000));
    // при быстром вращении стволы размываются: полупрозрачные диски по длине блока (непрозрачность растёт с оборотами)
    mdl.blur = [-0.42, -0.7].map((z) => {
      const m = rg.mk(new T.CylinderGeometry(0.056, 0.056, 0.2, 18, 1, true).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0, depthWrite: false, fog: false, side: T.DoubleSide }), 1002);
      m.position.z = z; m.visible = false; spin.add(m); return m;
    });
    mdl.g.add(spin);
    // дульная вспышка: ядро и два перекрещённых языка пламени; слой рисуется поверх всего без глубины
    const X = mgFxTex(), fx = new T.Group();
    const core = new T.Sprite(new T.SpriteMaterial({ map: X.core, blending: T.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, fog: false }));
    core.scale.set(0.4, 0.4, 1); core.renderOrder = 1021; fx.add(core);
    const sm = new T.MeshBasicMaterial({ map: X.streak, blending: T.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, side: T.DoubleSide, fog: false });
    for (let k = 0; k < 2; k += 1) {
      const pg = new T.PlaneGeometry(0.2, 0.8).translate(0, 0.4, 0).rotateX(-Math.PI / 2);
      if (k) pg.rotateZ(Math.PI / 2);
      fx.add(rg.mk(pg, sm, 1020));
    }
    fx.position.set(0, 0.02, -0.96); fx.visible = false;
    mdl.g.add(fx);
    // перед моделью чистится буфер глубины (руки и оружие рисуются без неё)
    const clr = new T.Mesh(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(new Float32Array(9), 3)), new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, transparent: true }));
    clr.renderOrder = 999; clr.frustumCulled = false;
    clr.onBeforeRender = (rr) => { const b = rr.state && rr.state.buffers; if (b && b.depth) b.depth.setMask(true); rr.clearDepth(); };
    mdl.g.add(clr);
    mdl.spin = spin; mdl.dark = new T.Group(); mdl.fx = fx; mdl.mgU = U;
  }
  const bw0 = C.buildWeapon;
  C.buildWeapon = function (id, rg, anch) {
    const mdl = bw0(id, rg, anch);
    if (id === 'minigun') mgFps(mdl, rg);
    return mdl;
  };

  // раскрутка: пока кнопка огня зажата — стволы разгоняются (0.85 с), без выстрела; отпустил — замедляются
  function mgState(r) { return r.mg || (r.mg = { s: 0, a: 0, ctx: null, heat: 0, cr: 26 }); }
  function mgSound(r, m) {
    const snd = r.snd, ctx = snd && snd.ctx;
    if (!ctx) return;
    if (!m.ctx) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      o1.type = 'sawtooth'; o2.type = 'triangle'; lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 1.2; g.gain.value = 0;
      o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(snd.out);
      o1.start(); o2.start();
      m.ctx = { o1, o2, lp, g };
    }
    const k = m.ctx, t = ctx.currentTime, on = m.s > 0.02 && !r.paused && !r.disposed;
    k.o1.frequency.setTargetAtTime(24 + 150 * m.s, t, 0.05);
    k.o2.frequency.setTargetAtTime(48 + 300 * m.s, t, 0.05);
    k.lp.frequency.setTargetAtTime(380 + 1500 * m.s, t, 0.05);
    k.g.gain.setTargetAtTime(on ? 0.07 * Math.min(1, m.s * 1.4) * snd.sfxVol() : 0, t, 0.06);
  }
  // прицел минигана: кольцо радиуса = реальный разброс (в пикселях), риски по сторонам, точка в центре; готовность (стволы раскручены) — яркое кольцо
  function mgCross(r, mm, dt, d) {
    const L = r.layer; if (!L) return;
    let x = r.mgx;
    if (!x || !x.isConnected) { const c = r.qs('.m-cross'); if (!c) return; x = r.mgx = document.createElement('b'); x.className = 'mgx'; c.appendChild(x); }
    const ak = r.aimK || 0, cb = r.cb, p = r.p, sm = ak * ak * (3 - 2 * ak);
    const sp = (d.hip + (d.ads - d.hip) * sm + (cb ? cb.bloom : 0) + (p ? p.moving : 0) * (0.03 + (0.007 - 0.03) * ak)) * (1 + (r.stress || 0) * 0.9);
    const px = clamp(sp * window.innerHeight * 0.5 / Math.tan((r.camera.fov || 90) * Math.PI / 360), 12, 110);
    mm.cr += (px - mm.cr) * (1 - Math.exp(-dt * 16));
    if (!mm.crS || Math.abs(mm.crS - mm.cr) > 0.4) { mm.crS = mm.cr; x.style.setProperty('--mgr', mm.cr.toFixed(1) + 'px'); }
    const rdy = mm.s >= 0.8;
    if (x.classList.contains('rdy') !== rdy) x.classList.toggle('rdy', rdy);
  }
  const uw0 = P.updateWeapon;
  P.updateWeapon = function (dt) {
    const w0 = this.wp, m = this.mg;
    if ((w0 && w0.id === 'minigun') || (m && m.s > 0)) {
      const mm = mgState(this), mine = w0 && w0.id === 'minigun';
      const want = mine && (this.fireHeld || this.padFire) && !this.locked && !this.paused && !this.rl && !this.swapTo ? 1 : 0;
      mm.s = clamp(mm.s + (want ? dt / 0.85 : -dt / 2.6), 0, 1);
      mm.a += mm.s * dt * 34;
      mm.heat = clamp(mm.heat + (want && mm.s >= 0.8 ? dt / 8 : -dt / 7), 0, 1);
      mgSound(this, mm);
    }
    const res = uw0.call(this, dt);
    const w = this.wp, rg = this.rg, mine = !!(w && w.id === 'minigun');
    if (this.layer && this.layer.classList.contains('mg') !== mine) this.layer.classList.toggle('mg', mine);
    if (mine && rg) {
      const mm = mgState(this), mdl = rg.models && rg.models.minigun;
      mgCross(this, mm, dt, w.def);
      if (mdl && mdl.fx) {
        const on = rg.flashT > 0 && !this.paused;
        rg.flash.visible = false;                                   // общая крестовая вспышка здесь не нужна: у минигана своя
        mdl.fx.visible = on;
        if (on) { mdl.fx.scale.copy(rg.flash.scale); mdl.fx.rotation.z = rg.flash.rotation.z; }
        mdl.mgU.uHeat.value = mm.heat; mdl.mgU.uFlash.value = on ? 1 : 0;
        const bo = Math.max(0, mm.s - 0.25) * 0.28;
        mdl.blur.forEach((b) => { b.visible = bo > 0.01; b.material.opacity = bo; });
      }
    }
    return res;
  };
  const tf0 = P.tryFire;
  P.tryFire = function () {
    const w = this.wp;
    if (w && w.id === 'minigun') {
      const m = mgState(this);
      if (m.s < 0.8) return false; // стволы ещё не раскрутились
      w.mag = w.def.mag; w.reserve = w.def.reserve; // магазин бесконечный
    }
    return tf0.call(this);
  };
  const ur0 = P.updateRig;
  P.updateRig = function (dt, vel) {
    ur0.call(this, dt, vel);
    const mdl = this.rg && this.rg.models && this.rg.models.minigun;
    if (mdl && mdl.spin && this.mg) mdl.spin.rotation.z = this.mg.a;
  };
  const rh0 = P.refreshHud;
  P.refreshHud = function () {
    rh0.call(this);
    if (this.cb && this.wp && this.wp.id === 'minigun') { const b = this.qs('.m-ammo b'); if (b && b.textContent !== '∞') b.innerHTML = '∞'; }
  };
  const dc0 = P.disposeCombat;
  P.disposeCombat = function () {
    const m = this.mg;
    if (m && m.ctx) { try { m.ctx.g.gain.value = 0; m.ctx.o1.stop(); m.ctx.o2.stop(); m.ctx.o1.disconnect(); m.ctx.o2.disconnect(); m.ctx.g.disconnect(); } catch (e) {} m.ctx = null; }
    this.mg = null;
    return dc0.call(this);
  };

  // тяжёлый костюм: входящий урон × armorK (миссия 48). 1 — без костюма.
  const hurt0 = P.hurt;
  P.hurt = function (amt, fx, fz) { return hurt0.call(this, amt * (this.armorK || 1), fx, fz); };
}());
