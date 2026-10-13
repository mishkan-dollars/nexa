// NEXA: веб-камера на мониторе ПК в комнатах (interiors.js, сцена «pc»). Вторая PerspectiveCamera (webcam_fov) стоит на мониторе и смотрит в комнату,
// рисует сцену в WebGLRenderTarget (render_target_resolution_x/y), а экран монитора показывает эту картинку через шейдер:
// задержка в один кадр сенсора (две цели «пинг-понг»), частота сенсора webcam_feed_fps (не больше webcam_fps_limit), шум, строчная развёртка, дрожание строк.
// Поверх — наложение записи (recording_overlay_enabled): мигающая ● REC, таймер 00:00:00, рамка фокуса (цвет — по состоянию жильца), табличка статуса.
// Камера рендерится только когда монитор в кадре игрока, ближе webcam_render_distance и не за глухой стеной (через окно — видно); один рендер на кадр.
// Общий объект window.PCSys: attach(room, info) вызывается из interiors.js; desktop.js добавляет рабочий стол через PCSys.onAttach.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.Run) return;
  const P = C.Run.prototype, hyp = Math.hypot, PI = Math.PI;
  const cfg = () => (window.FPP && window.FPP.cfg) || {};
  const num = (k, d) => { const v = cfg()[k]; return typeof v === 'number' && isFinite(v) ? v : d; };
  const tr = (s) => (window.I18N ? window.I18N.t(s) : s);
  const OV_W = 512, OV_H = 406;                 // наложение под пропорции экрана монитора (0.24 × 0.19 м)
  const SCR_ASPECT = 0.24 / 0.19;

  const PCSys = window.PCSys = window.PCSys || {};
  PCSys.onAttach = PCSys.onAttach || [];

  // ------------------------------------------------------------------ шейдер экрана
  const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const FRAG = [
    'precision mediump float; varying vec2 vUv; uniform sampler2D tCam, tOv; uniform float uTime, uOn, uCrop, uGlitch;',
    'float rnd(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }',
    'void main(){',
    '  vec2 uv = vUv;',
    '  float ln = floor(uv.y * 160.0), tk = floor(uTime * 14.0);',
    '  float jit = (rnd(vec2(ln, tk)) - 0.5) * 0.012 * step(0.975, rnd(vec2(ln * 1.7, floor(uTime * 3.0))));',   // редкие «сорвавшиеся» строки
    '  uv.x += jit + uGlitch * (rnd(vec2(ln, tk)) - 0.5) * 0.08;',
    '  vec2 cu = vec2((uv.x - 0.5) * uCrop + 0.5, uv.y);',
    '  vec3 c = texture2D(tCam, cu).rgb * uOn;',
    '  float l = dot(c, vec3(0.299, 0.587, 0.114));',
    '  c = mix(vec3(l), c, 0.42) * vec3(0.9, 1.06, 0.96);',                                    // слегка выцветшая «вебка» с зеленцой
    '  c *= 0.84 + 0.16 * sin(vUv.y * 700.0);',                                              // строчная развёртка
    '  c += (rnd(vUv * vec2(512.0, 400.0) + fract(uTime) * 19.0) - 0.5) * 0.11;',           // шум матрицы
    '  vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 1.7;',
    '  c = mix(c, vec3(0.02, 0.03, 0.02), 1.0 - uOn);',
    '  vec4 o = texture2D(tOv, vUv);',
    '  c = mix(c, o.rgb, o.a);',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');

  // ------------------------------------------------------------------ статус жильца для таблички
  const RANK = { dead: 0, bound: 1, kneel: 2, beg: 3, idle: 4, shock: 5, alert: 5, grab: 6, fight: 7 };
  const LABEL = { dead: ['STATUS: NO MOTION', '#9aa0a8'], bound: ['STATUS: SECURED', '#7CFC8A'], kneel: ['STATUS: KNEELING', '#7CFC8A'], beg: ['STATUS: SURRENDERING', '#7CFC8A'],
    idle: ['STATUS: IDLE', '#d9d9d9'], shock: ['STATUS: ALERT', '#ffbf3a'], alert: ['STATUS: ALERT', '#ffbf3a'], grab: ['STATUS: HOSTILE', '#ff4a3a'], fight: ['STATUS: HOSTILE', '#ff4a3a'], none: ['STATUS: ROOM EMPTY', '#9aa0a8'] };
  function subject(room) {
    const occ = room.occ || [];
    let best = null, rank = -1;
    for (const e of occ) {
      const st = e.dead || e.hp <= 0 ? 'dead' : (e.occ && e.occ.st) || 'idle', k = RANK[st] === undefined ? 4 : RANK[st];
      if (k > rank && (st !== 'dead' || rank < 0)) { rank = k; best = st; }
    }
    return LABEL[best || 'none'];
  }
  PCSys.subject = subject;
  PCSys.rig = rigList;

  // ------------------------------------------------------------------ наложение «REC»
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  const clock = (s) => { s = Math.max(0, Math.floor(s)); return pad2(Math.floor(s / 3600) % 100) + ':' + pad2(Math.floor(s / 60) % 60) + ':' + pad2(s % 60); };
  function drawOverlay(W, r) {
    const o = W.ov, c = o.cx, w = OV_W, h = OV_H, t = r.time;
    c.clearRect(0, 0, w, h);
    if (cfg().recording_overlay_enabled !== false) {
      const st = subject(W.room), col = st[1], blink = Math.floor(t) % 2 === 0;
      // рамка фокуса: уголки по краям + прицел по центру, который «ищет» фокус и защёлкивается
      const m = 20, L = 38; c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.8)';
      [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]].forEach((q) => { c.beginPath(); c.moveTo(q[0], q[1] + q[3] * L); c.lineTo(q[0], q[1]); c.lineTo(q[0] + q[2] * L, q[1]); c.stroke(); });
      const ph = (t * 0.55) % 1, hunt = ph < 0.3, sz = hunt ? 92 - 34 * Math.sin(ph / 0.3 * PI) : 92, cx = w / 2 + (hunt ? Math.sin(t * 9) * 5 : 0), cy = h / 2 - 14;
      c.strokeStyle = hunt ? 'rgba(255,255,255,0.8)' : col; c.lineWidth = 2.5;
      c.strokeRect(cx - sz / 2, cy - sz / 2, sz, sz);
      c.beginPath(); c.moveTo(cx - 8, cy); c.lineTo(cx + 8, cy); c.moveTo(cx, cy - 8); c.lineTo(cx, cy + 8); c.stroke();
      // REC и таймер
      if (blink) { c.fillStyle = '#e8261c'; c.beginPath(); c.arc(54, 56, 11, 0, 6.2832); c.fill(); }
      c.font = '700 30px Consolas, "Courier New", monospace'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.textAlign = 'left';
      c.fillText('REC', 74, 57);
      c.textAlign = 'right'; c.fillText(clock(t), w - 40, 57);
      // табличка статуса
      const lab = tr('CAM ' + pad2(W.num) + ' · ROOM ' + W.room.num), s1 = tr(st[0]);
      c.font = '700 24px Consolas, "Courier New", monospace';
      const tw = Math.max(c.measureText(lab).width, c.measureText(s1).width) + 30;
      c.fillStyle = 'rgba(0,0,0,0.62)'; c.fillRect(m + 4, h - m - 80, tw, 66);
      c.fillStyle = col; c.fillRect(m + 4, h - m - 80, 5, 66);
      c.textAlign = 'left'; c.fillStyle = '#e8e8e8'; c.fillText(lab, m + 20, h - m - 58);
      c.fillStyle = col; c.fillText(s1, m + 20, h - m - 28);
      // сигнал
      const bars = 3 + ((Math.sin(t * 1.3) > 0.9) ? -1 : 0);
      for (let i = 0; i < 4; i += 1) { c.fillStyle = i < bars ? '#d9d9d9' : 'rgba(255,255,255,0.22)'; c.fillRect(w - 92 + i * 14, h - m - 34 - i * 7, 9, 10 + i * 7); }
    }
    o.tex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ создание
  function init(r) {
    if (r.pcs) return r.pcs;
    const S = r.pcs = { cams: [], focus: null, acc: 0, fr: null, pm: null };
    r.hooks.push((dt) => tick(r, S, dt));
    return S;
  }
  PCSys.attach = function (room, info) {
    const r = room.r;
    if (!r || !window.THREE || !r.scene || room.pc) return null;
    const T = THREE, S = init(r), yaw = info.yaw;
    const W = { room, r, mesh: info.mesh, base: info.mat, num: S.cams.length + 7, x: info.x, y: info.y, z: info.z, yaw, cam: null, rt: null, w: 0, last: -1e9, on: 0, shown: false, ovAcc: 0, led: null, grab: null, tex: null };
    room.pc = W; S.cams.push(W);
    // наложение
    const cv = document.createElement('canvas'); cv.width = OV_W; cv.height = OV_H;
    W.ov = { cv, cx: cv.getContext('2d'), tex: new T.CanvasTexture(cv) };
    W.ov.tex.minFilter = T.LinearFilter; W.ov.tex.generateMipmaps = false;
    W.mat = new T.ShaderMaterial({ uniforms: { tCam: { value: null }, tOv: { value: W.ov.tex }, uTime: { value: 0 }, uOn: { value: 0 }, uCrop: { value: SCR_ASPECT / (num('render_target_resolution_x', 1280) / num('render_target_resolution_y', 720)) }, uGlitch: { value: 0 } }, vertexShader: VERT, fragmentShader: FRAG, fog: false });
    // камера: на верхней кромке монитора, смотрит вдоль направления экрана
    const sx = Math.sin(yaw), cz = Math.cos(yaw), top = info.y + 0.2;
    const cam = W.cam = new T.PerspectiveCamera(num('webcam_fov', 75), num('render_target_resolution_x', 1280) / num('render_target_resolution_y', 720), 0.05, 40);
    cam.rotation.order = 'YXZ'; cam.position.set(info.x + sx * 0.08, top + 0.04, info.z + cz * 0.08); cam.rotation.set(-0.05, yaw + PI, 0);
    W.look = { x: sx, z: cz };
    // корпус камеры и светодиод записи
    const body = new T.Mesh(r.g.box, r.basic(0x101010)); body.scale.set(0.07, 0.034, 0.045); body.position.set(info.x + sx * 0.045, top + 0.017, info.z + cz * 0.045); body.rotation.y = yaw; r.scene.add(body);
    const led = new T.Mesh(r.g.box, new T.MeshBasicMaterial({ color: 0xff2a1a })); led.scale.set(0.011, 0.011, 0.011); led.position.set(info.x + sx * 0.071 + cz * 0.022, top + 0.02, info.z + cz * 0.071 - sx * 0.022); r.scene.add(led);
    W.led = led; room.items.push(body, led);
    drawOverlay(W, r);
    PCSys.onAttach.forEach((f) => { try { f(room, W); } catch (e) { console.error('[pc]', e); } });
    return W;
  };

  function ensureRT(r, W) {
    if (W.rt) return;
    const T = THREE, q = (r.touch || r.qName === 'LOW') ? 0.5 : 1;
    const w = Math.max(64, Math.round(num('render_target_resolution_x', 1280) * q)), h = Math.max(36, Math.round(num('render_target_resolution_y', 720) * q));
    const mk = () => new T.WebGLRenderTarget(w, h, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, depthBuffer: true });
    W.rt = [mk(), mk()];
  }

  // что прячем в кадре камеры: тело игрока и руки (рисуются без depthTest — иначе «плавали» бы поверх картинки), сам экран (иначе петля обратной связи)
  function rigList(r) {
    const a = [];
    if (r.body) a.push(r.body);
    const g = r.rg;
    if (g) {
      a.push(g.root, g.handMag, g.handShell);
      (g.arms || []).forEach((m) => a.push(m.up, m.fo, m.el, m.hand));
      Object.keys(g.models || {}).forEach((k) => { const m = g.models[k]; if (m && m.lh) a.push(m.lh); });
    }
    if (r.fh && r.fh.root) a.push(r.fh.root);
    return a.filter(Boolean);
  }
  function renderCam(r, W) {
    const rd = r.renderer; if (!rd || !r.scene) return;
    ensureRT(r, W);
    const hid = rigList(r), was = hid.map((o) => o.visible), scrVis = W.mesh.visible;
    hid.forEach((o) => { o.visible = false; }); W.mesh.visible = false;
    const sa = rd.shadowMap.autoUpdate, prev = rd.getRenderTarget();
    rd.shadowMap.autoUpdate = false;
    rd.setRenderTarget(W.rt[W.w]);
    rd.render(r.scene, W.cam);
    rd.setRenderTarget(prev);
    rd.shadowMap.autoUpdate = sa;
    hid.forEach((o, i) => { o.visible = was[i]; }); W.mesh.visible = scrVis;
    // показываем предыдущий кадр (задержка в один кадр сенсора); сама экранная плоскость переключается на шейдер при первом рендере
    const show = W.rt[W.w ^ 1];
    W.mat.uniforms.tCam.value = show.texture; W.mat.uniforms.uOn.value = W.shown ? 1 : 0;
    W.w ^= 1; W.shown = true;
    if (W.mesh.material !== W.mat) W.mesh.material = W.mat;
  }
  // снимок кадра камеры в небольшой canvas (окно «КАМЕРА» на рабочем столе, desktop.js)
  PCSys.grab = function (r, W, cv) {
    const rd = r.renderer; if (!rd || !W || !cv) return false;
    const T = THREE, w = cv.width, h = cv.height;
    if (!W.grabRT || W.grabRT.width !== w) { W.grabRT && W.grabRT.dispose(); W.grabRT = new T.WebGLRenderTarget(w, h, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, depthBuffer: true }); W.grabBuf = new Uint8Array(w * h * 4); W.grabImg = new ImageData(w, h); }
    const hid = rigList(r), was = hid.map((o) => o.visible), scrVis = W.mesh.visible;
    hid.forEach((o) => { o.visible = false; }); W.mesh.visible = false;
    const sa = rd.shadowMap.autoUpdate, prev = rd.getRenderTarget();
    rd.shadowMap.autoUpdate = false; rd.setRenderTarget(W.grabRT); rd.render(r.scene, W.cam); rd.readRenderTargetPixels(W.grabRT, 0, 0, w, h, W.grabBuf);
    rd.setRenderTarget(prev); rd.shadowMap.autoUpdate = sa;
    hid.forEach((o, i) => { o.visible = was[i]; }); W.mesh.visible = scrVis;
    // строки в буфере идут снизу вверх — переворачиваем
    const d = W.grabImg.data, row = w * 4;
    for (let y = 0; y < h; y += 1) d.set(W.grabBuf.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    cv.getContext('2d').putImageData(W.grabImg, 0, 0);
    return true;
  };

  // ------------------------------------------------------------------ покадровая логика
  function inView(r, S, W) {
    const T = THREE, cam = r.camera;
    if (!S.fr) { S.fr = new T.Frustum(); S.pm = new T.Matrix4(); }
    cam.updateMatrixWorld();
    S.pm.multiplyMatrices(cam.projectionMatrix, S.pm.copy(cam.matrixWorld).invert());
    S.fr.setFromProjectionMatrix(S.pm);
    return S.fr.intersectsObject(W.mesh);
  }
  function tick(r, S, dt) {
    for (const W of S.cams) {
      W.mat.uniforms.uTime.value = r.time;
      W.ovAcc -= dt;
      const near = hyp(W.x - r.p.x, W.z - r.p.z) < 22;
      if (W.ovAcc <= 0 && near) { W.ovAcc = 0.2; drawOverlay(W, r); }
      if (W.led) W.led.visible = Math.floor(r.time) % 2 === 0;
    }
  }
  // вызывается перед основным кадром: камера рисуется не чаще sensor-fps и только если нужна
  const render0 = P.render;
  P.render = function () {
    const S = this.pcs;
    if (S && S.cams.length && this.camera && !this.disposed) {
      try {
        const now = performance.now(), fps = Math.min(num('webcam_fps_limit', 60), num('webcam_feed_fps', 24)), gap = 1000 / fps - 1, maxD = num('webcam_render_distance', 16);
        for (const W of S.cams) {
          if (now - W.last < gap) continue;
          const focus = S.focus === W;
          if (!W.mesh.visible) continue;
          if (!focus) {
            if (hyp(W.x - this.camera.position.x, W.z - this.camera.position.z) > maxD) continue;
            if (!inView(this, S, W)) continue;
            const Sp = window.Spatial; // глухая стена между игроком и монитором — картинку не видно
            if (Sp && Sp.occlusion(this.colliders, W.x, W.z, this.camera.position.x, this.camera.position.z) >= 0.7) continue;
          }
          W.last = now; renderCam(this, W);
          break;
        }
      } catch (e) { console.error('[webcam]', e); S.cams.length = 0; }
    }
    return render0.apply(this, arguments);
  };

  // освобождение GPU-ресурсов
  const disp0 = P.dispose;
  P.dispose = function () {
    const S = this.pcs;
    if (S) S.cams.forEach((W) => { try { (W.rt || []).forEach((t) => t.dispose()); W.grabRT && W.grabRT.dispose(); W.ov.tex.dispose(); W.mat.dispose(); } catch (e) { /* ignore */ } });
    return disp0.apply(this, arguments);
  };
}());
