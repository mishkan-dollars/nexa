// NEXA: миссия 48 — пост-эффект флешбека (галлюциногенный стиль «Grass Roots»): хроматическая аберрация (растёт с движением камеры),
// «рыбий глаз» + туннельное зрение, шлейфы (обратная связь по кадрам), цветокор (неон-кислота / красная комната / блёклый), сильная виньетка,
// камера плывёт (крен, рыскание, FOV). Подмена render на экземпляре r — остальные миссии не затронуты.
// K.flash(r) → FX = { to(style, secs), amount(v, secs), pulse(a), cut(), off() }
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.K || !C.Run) return;
  const F = C.f48, K = F.K, PI = Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, k) => a + (b - a) * k;

  // параметры стилей: sat, con — насыщенность/контраст; lo/hi — тон теней/светов; tone — сила тонировки; hue — вращение оттенка (рад);
  // k — линза (бочка), ca — хроматика, ghost — шлейф, zoom — смещение эха, vig/tun — виньетка/туннель, wob — волна, swim — качка камеры
  const OFF = { sat: 1, con: 1, tone: 0, hue: 0, k: 0, ca: 0, ghost: 0, zoom: 0, vig: 0, tun: 0, wob: 0, swim: 0, cyc: 0, lo: [1, 1, 1], hi: [1, 1, 1] };
  const STY = {
    acid:  { sat: 1.4, con: 1.15, tone: 0.6, hue: 0, k: 0.42, ca: 0.0075, ghost: 0.84, zoom: 0.005, vig: 0.75, tun: 0.75, wob: 0.0045, swim: 1.0, cyc: 0.5, lo: [0.62, 0.2, 0.95], hi: [0.95, 1.0, 0.35] },
    red:   { sat: 1.3, con: 1.28, tone: 0.8, hue: 0, k: 0.45, ca: 0.013, ghost: 0.82, zoom: 0.008, vig: 1.0, tun: 1.0, wob: 0.0035, swim: 0.85, cyc: 0.15, lo: [0.75, 0.04, 0.05], hi: [1.0, 0.5, 0.28] },
    dull:  { sat: 0.45, con: 0.92, tone: 0.55, hue: 0, k: 0.3, ca: 0.006, ghost: 0.66, zoom: 0.003, vig: 0.85, tun: 0.8, wob: 0.003, swim: 0.7, cyc: 0, lo: [0.62, 0.6, 0.7], hi: [0.95, 0.88, 0.8] },
    sepia: { sat: 0.35, con: 1.1, tone: 0.9, hue: 0, k: 0.35, ca: 0.007, ghost: 0.7, zoom: 0.004, vig: 1.0, tun: 0.9, wob: 0.0025, swim: 0.6, cyc: 0, lo: [0.55, 0.38, 0.22], hi: [1.0, 0.86, 0.6] }
  };
  F.FLASH_STYLES = STY;

  const FRAG = [
    'precision mediump float; varying vec2 vUv; uniform sampler2D tScene, tHist;',
    'uniform float uTime, uK, uCA, uGhost, uZoom, uSat, uCon, uTone, uHue, uVig, uTun, uWob, uAsp, uFlash, uTear, uFirst, uEdge, uIri;',
    'uniform vec2 uMot; uniform vec3 uLo, uHi;',
    'float rnd(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }',
    'vec3 hue(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a), sa = sin(a); return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca); }',
    'void main(){',
    '  vec2 q = vUv * 2.0 - 1.0; vec2 pa = vec2(q.x * uAsp, q.y); float r2 = dot(pa, pa) / (uAsp * uAsp + 1.0) * 2.0; float r = sqrt(r2);',
    '  vec2 w = vec2(sin(vUv.y * 9.0 + uTime * 1.7) + sin(vUv.y * 23.0 - uTime * 2.3) * 0.4, cos(vUv.x * 7.0 + uTime * 1.3)) * uWob * (0.25 + r2 * 0.9);',
    '  float tear = (rnd(vec2(floor(vUv.y * 40.0), floor(uTime * 12.0))) - 0.5) * uTear * step(0.8, rnd(vec2(floor(vUv.y * 40.0) + 3.0, floor(uTime * 12.0))));',
    '  q *= 1.0 + uK * r2;',
    '  vec2 uv = q * 0.5 + 0.5 + w + vec2(tear, 0.0);',
    '  vec2 dir = normalize(q + vec2(1e-4)) * uCA * (0.35 + 1.4 * r2) + uMot;',
    '  vec3 c; c.r = texture2D(tScene, uv + dir).r; c.g = texture2D(tScene, uv).g; c.b = texture2D(tScene, uv - dir).b;',
    '  float eg = smoothstep(0.45, 1.1, r) * uTun;',
    '  if (eg > 0.02) { vec2 o = (uv - 0.5) * 0.012 * eg + vec2(0.0015) * eg; vec3 a = texture2D(tScene, uv + o).rgb + texture2D(tScene, uv - o).rgb + texture2D(tScene, uv + vec2(o.y, -o.x)).rgb + texture2D(tScene, uv - vec2(o.y, -o.x)).rgb; c = mix(c, a * 0.25, clamp(eg, 0.0, 0.85)); }',
    '  float ew = mix(1.0, smoothstep(0.32, 1.08, r), uEdge);',
    '  if (uGhost > 0.001 && uFirst < 0.5) {',
    '    vec2 hv = (vUv - 0.5) * (1.0 - uZoom) + 0.5; vec3 h;',
    '    h.r = texture2D(tHist, hv + dir * 0.6).r; h.g = texture2D(tHist, hv).g; h.b = texture2D(tHist, hv - dir * 0.6).b;',
    '    c = max(c, h * uGhost * ew); c = mix(c, h, uGhost * 0.28 * ew);',
    '  }',
    '  float l = dot(c, vec3(0.299, 0.587, 0.114));',
    '  c = mix(vec3(l), c, mix(1.0, uSat, ew)); c = (c - 0.5) * mix(1.0, uCon, ew) + 0.5;',
    '  vec3 tone = mix(uLo, uHi, smoothstep(0.08, 0.85, l)); c = mix(c, c * tone * 1.7 + (tone - 0.5) * 0.04, uTone * ew);',
    '  c = hue(max(c, 0.0), uHue * ew);',
    '  if (uIri > 0.001) {',
    '    float an = atan(q.y, q.x); vec3 rb = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + an * 0.3183 + r * 1.4 - uTime * 0.18));',
    '    float pw = uIri * smoothstep(0.62, 1.16, r) * (0.72 + 0.28 * sin(uTime * 1.9 + an * 3.0 + r * 9.0));',
    '    c = mix(c, rb * (0.5 + 0.9 * l) + 0.06, clamp(pw, 0.0, 0.8));',
    '  }',
    '  c *= 1.0 - uVig * (1.0 - 0.7 * uIri) * smoothstep(0.35, 1.25, r) * (0.7 + 0.5 * uTun);',
    '  c += uFlash + (rnd(vUv * 811.0 + fract(uTime) * 29.0) - 0.5) * 0.05;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');
  const BLIT = ['precision mediump float; varying vec2 vUv; uniform sampler2D tMap; void main(){ gl_FragColor = vec4(texture2D(tMap, vUv).rgb, 1.0); }'].join('\n');
  const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

  K.flash = function (r) {
    if (r.f48fx) return r.f48fx;
    const T = THREE;
    const FX = r.f48fx = { v: 0, vt: 0, vr: 3, style: 'acid', L: JSON.parse(JSON.stringify(STY.acid)), pulseV: 0, flashV: 0, tearV: 0, edge: 0, iri: 0, mot: new T.Vector2(), motA: 0, first: true, on: false, hue0: 0 };
    const render0 = r.render, fl = {};
    const mkRT = (w, h) => new T.WebGLRenderTarget(w, h, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, depthBuffer: false });
    let mid = null, cur = null, hist = null, scn = null, mat = null, blit = null, mesh = null;
    const prevQ = new T.Quaternion(), prevP = new T.Vector3(), v3 = new T.Vector3(), q0 = new T.Quaternion(), sw = new T.Quaternion(), eu = new T.Euler();
    let tPrev = 0, hadPrev = false;
    const ensure = () => {
      const w = r.rt.width, h = r.rt.height;
      if (!mat) {
        const U = {
          tScene: { value: null }, tHist: { value: null }, uTime: { value: 0 }, uK: { value: 0 }, uCA: { value: 0 }, uGhost: { value: 0 }, uZoom: { value: 0 }, uSat: { value: 1 }, uCon: { value: 1 }, uTone: { value: 0 },
          uHue: { value: 0 }, uVig: { value: 0 }, uTun: { value: 0 }, uWob: { value: 0 }, uAsp: { value: 1.78 }, uFlash: { value: 0 }, uTear: { value: 0 }, uFirst: { value: 1 }, uEdge: { value: 0 }, uIri: { value: 0 }, uMot: { value: new T.Vector2() },
          uLo: { value: new T.Vector3(1, 1, 1) }, uHi: { value: new T.Vector3(1, 1, 1) }
        };
        mat = new T.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false });
        blit = new T.ShaderMaterial({ uniforms: { tMap: { value: null } }, vertexShader: VERT, fragmentShader: BLIT, depthTest: false, depthWrite: false });
        mesh = new T.Mesh(r.fxGeo, mat); mesh.frustumCulled = false; scn = new T.Scene(); scn.add(mesh);
        fl.U = U;
      }
      if (!mid || mid.width !== w || mid.height !== h) {
        [mid, cur, hist].forEach((x) => x && x.dispose());
        mid = mkRT(w, h); cur = mkRT(w, h); hist = mkRT(w, h); FX.first = true;
      }
    };
    const vec = (u, a) => u.value.set(a[0], a[1], a[2]);
    r.render = function () {
      const dt = clamp((this.time || 0) - tPrev, 0, 0.1); tPrev = this.time || 0;
      // интенсивность и параметры плавно ведутся к цели
      FX.v += (FX.vt - FX.v) * (1 - Math.exp(-dt * FX.vr));
      if (Math.abs(FX.vt - FX.v) < 0.003) FX.v = FX.vt;
      FX.pulseV *= Math.exp(-dt * 5); FX.flashV *= Math.exp(-dt * 6); FX.tearV *= Math.exp(-dt * 7);
      if (FX.v < 0.004 && FX.flashV < 0.01) { FX.first = true; hadPrev = false; if (FX.on) { FX.on = false; } return render0.call(this); }
      FX.on = true;
      ensure();
      const T2 = this.time || 0, S = FX.S, L = FX.L, v = FX.v, cam = this.camera, U = fl.U;
      // стиль → текущие параметры (плавный переход между стилями)
      const tg = STY[FX.style], kk = 1 - Math.exp(-dt * (FX.sr || 1.5));
      ['sat', 'con', 'tone', 'k', 'ca', 'ghost', 'zoom', 'vig', 'tun', 'wob', 'swim', 'cyc'].forEach((n) => { L[n] += (tg[n] - L[n]) * kk; });
      for (let i = 0; i < 3; i += 1) { L.lo[i] += (tg.lo[i] - L.lo[i]) * kk; L.hi[i] += (tg.hi[i] - L.hi[i]) * kk; }
      // движение камеры → сила хроматики и направление смещения каналов
      let mx = 0, my = 0, ang = 0;
      if (hadPrev && dt > 0) {
        ang = 2 * Math.acos(clamp(Math.abs(prevQ.dot(cam.quaternion)), 0, 1));
        v3.set(0, 0, -1).applyQuaternion(prevQ).multiplyScalar(10).add(prevP).project(cam);
        mx = clamp(v3.x * 0.5, -0.25, 0.25); my = clamp(v3.y * 0.5, -0.25, 0.25);
      }
      prevQ.copy(cam.quaternion); prevP.copy(cam.position); hadPrev = true;
      const sp = dt > 0 ? ang / dt : 0;
      FX.motA += (clamp(sp / 4.0, 0, 1) - FX.motA) * (1 - Math.exp(-dt * 8));
      FX.mot.x += (mx * 0.5 - FX.mot.x) * 0.4; FX.mot.y += (my * 0.5 - FX.mot.y) * 0.4;
      // камера плывёт: крен, рыскание, тангаж, FOV (применяется на время кадра и возвращается)
      const sK = L.swim * v * (this.cineDepth > 0 ? 1 : 0.5) * (FX.swimK === undefined ? 1 : FX.swimK);
      const fov0 = cam.fov;
      q0.copy(cam.quaternion);
      if (sK > 0.001) {
        eu.set(
          Math.sin(T2 * 0.55 + 1.3) * 0.045 * sK + Math.sin(T2 * 1.31) * 0.015 * sK,
          Math.sin(T2 * 0.41) * 0.06 * sK + Math.sin(T2 * 1.05 + 2.0) * 0.02 * sK,
          Math.sin(T2 * 0.37) * 0.11 * sK + Math.sin(T2 * 0.93 + 0.6) * 0.045 * sK + Math.sin(T2 * 2.3) * 0.01 * sK, 'YXZ');
        sw.setFromEuler(eu); cam.quaternion.multiply(sw);
        cam.fov = fov0 + (Math.sin(T2 * 0.67) * 5.5 + Math.sin(T2 * 1.7 + 1) * 2.2 + FX.pulseV * 5) * sK;
        cam.updateProjectionMatrix();
      }
      // базовый проход движка → mid (фишай, зерно, размытие и т.д. остаются)
      this.fxU.uTime.value = this.time;
      this.fxU.uBlur.value.set(this.blurX || 0, this.blurY || 0);
      this.xfPost && this.xfPost();
      const rd = this.renderer;
      rd.setRenderTarget(this.rt); rd.render(this.scene, this.camera);
      this.renderOver && this.renderOver();
      cam.quaternion.copy(q0); if (cam.fov !== fov0) { cam.fov = fov0; cam.updateProjectionMatrix(); }
      this.fxMesh.material = this.fxMat;
      rd.setRenderTarget(mid); rd.render(this.fxScene, this.fxCam);
      // проход флешбека: mid + hist → cur
      const hue = L.cyc ? Math.sin(T2 * 0.55) * L.cyc * 0.9 + Math.sin(T2 * 1.3 + 1.0) * L.cyc * 0.3 + FX.pulseV * 0.6 : 0;
      U.tScene.value = mid.texture; U.tHist.value = hist.texture; U.uTime.value = T2;
      U.uK.value = v * (L.k + FX.motA * 0.3 + FX.pulseV * 0.35); U.uCA.value = v * (L.ca * (1 + FX.motA * 3.2) + FX.pulseV * 0.02); U.uMot.value.set(FX.mot.x * v * 0.5, FX.mot.y * v * 0.5);
      U.uGhost.value = v * Math.pow(L.ghost, Math.max(dt, 0.001) * 60); U.uZoom.value = v * (L.zoom + FX.motA * 0.01);
      U.uSat.value = mix(1, L.sat, v); U.uCon.value = mix(1, L.con, v); U.uTone.value = L.tone * v; U.uHue.value = hue * v;
      U.uVig.value = L.vig * v; U.uTun.value = L.tun * v; U.uWob.value = L.wob * v * (1 + FX.pulseV);
      U.uAsp.value = this.w && this.h ? this.w / this.h : 1.78; U.uFlash.value = FX.flashV; U.uTear.value = FX.tearV * 0.06; U.uFirst.value = FX.first ? 1 : 0;
      U.uEdge.value = FX.edge || 0; U.uIri.value = (FX.iri || 0) * v;
      vec(U.uLo, L.lo); vec(U.uHi, L.hi);
      rd.setRenderTarget(cur); rd.render(scn, this.fxCam);
      blit.uniforms.tMap.value = cur.texture; mesh.material = blit;
      rd.setRenderTarget(null); rd.render(scn, this.fxCam);
      mesh.material = mat;
      const t = hist; hist = cur; cur = t; FX.first = false;
    };
    // --- управление
    FX.S = null;
    FX.to = function (style, secs) { if (STY[style]) { FX.style = style; FX.sr = secs ? 3 / Math.max(0.2, secs) : 1.5; } return FX; };
    FX.amount = function (v, secs) { FX.vt = v; FX.vr = secs ? 3 / Math.max(0.1, secs) : 3; return FX; };
    FX.pulse = function (a) { FX.pulseV = Math.max(FX.pulseV, a === undefined ? 1 : a); return FX; };
    FX.cut = function (white) { FX.flashV = white === undefined ? 0.7 : white; FX.tearV = 1; FX.pulseV = 1; FX.first = true; return FX; };   // монтажный стык: вспышка + рваная строка + сброс шлейфа
    FX.off = function (secs) { return FX.amount(0, secs || 0.6); };
    FX.free = function () { FX.vt = FX.v = 0; [mid, cur, hist].forEach((x) => x && x.dispose()); mid = cur = hist = null; r.render = render0; delete r.f48fx; };
    return FX;
  };

  // ------------------------------------------------------------------ искажённый звук вокруг (флэшбек): K.warp(r, k, secs)
  // Вставка между master и muf в графе sound.js: сухой сигнал + «мокрая» цепочка (насыщение/ступеньки → полосовой срез → плывущая задержка-вибрато → дрожь громкости → тёмное эхо).
  // Музыка флэшбека (K.track → snd.dest = post) идёт ПОСЛЕ компрессора и этой вставки не касается — остаётся чистой.
  K.warp = function (r, k, secs) {
    const snd = r.snd, ctx = snd && snd.ctx; if (!ctx || !snd.master || !snd.muf) return null;
    let W = r.f48warp;
    if (!W) {
      const m = snd.master, muf = snd.muf; W = r.f48warp = { k: 0 };
      try { m.disconnect(muf); } catch (e) { r.f48warp = null; return null; }
      const dry = W.dry = ctx.createGain(); m.connect(dry); dry.connect(muf);
      const pre = ctx.createGain(); pre.gain.value = 2.4; m.connect(pre);
      const sh = ctx.createWaveShaper(), N = 1024, cv = new Float32Array(N);
      for (let i = 0; i < N; i += 1) { const x = i / (N - 1) * 2 - 1; cv[i] = 0.62 * Math.tanh(4.2 * x) + 0.38 * Math.round(x * 6) / 6; }
      sh.curve = cv; sh.oversample = '2x'; pre.connect(sh);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 150; hp.Q.value = 0.7;
      const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 1300; bp.Q.value = 1.4; bp.gain.value = 6;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200; lp.Q.value = 0.6;
      sh.connect(hp); hp.connect(bp); bp.connect(lp);
      const dl = ctx.createDelay(0.2); dl.delayTime.value = 0.024; lp.connect(dl);
      const lfo = (f, d, to) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.value = d; o.connect(g); g.connect(to); o.start(); return o; };
      const osc = [lfo(0.55, 0.012, dl.delayTime), lfo(4.3, 0.0017, dl.delayTime)];            // медленное «плывёт» + быстрая дрожь высоты
      const tr = ctx.createGain(); tr.gain.value = 0.78; osc.push(lfo(6.1, 0.22, tr.gain)); dl.connect(tr);
      const wet = W.wet = ctx.createGain(); wet.gain.value = 0; tr.connect(wet); wet.connect(muf);
      const e1 = ctx.createDelay(0.5); e1.delayTime.value = 0.14; const fb = ctx.createGain(); fb.gain.value = 0.38; const el = ctx.createBiquadFilter(); el.type = 'lowpass'; el.frequency.value = 1500;
      tr.connect(e1); e1.connect(el); el.connect(fb); fb.connect(e1); const eo = ctx.createGain(); eo.gain.value = 0.5; el.connect(eo); eo.connect(wet);
      W.osc = osc;
    }
    if (k === undefined) return W;
    const t = ctx.currentTime, tc = Math.max(0.03, (secs === undefined ? 1 : secs) / 3);
    [[W.dry.gain, 1 - 0.62 * k], [W.wet.gain, 0.95 * k]].forEach((x) => { x[0].cancelScheduledValues(t); x[0].setValueAtTime(x[0].value, t); x[0].setTargetAtTime(x[1], t, tc); });
    W.k = k; return W;
  };
  // удобная обёртка: включить за secs секунд в стиле style
  K.flashOn = function (r, style, secs) { const FX = K.flash(r); FX.to(style, 0.3); FX.sr = 20; FX.amount(1, secs || 1.0); return FX; };
}());
