// NEXA: 3D-сцена заставки EPICLINES STUDIO (three.js). Весь кадр — чистая функция времени render(t), поэтому видео и звук синхронизируются по одним часам.
// Стрелки и буквы — экструзия с фаской (хромированные боковины, чёрные глянцевые торцы, трещины с неоновым свечением), под стрелками тёмная подложка с тенями,
// сзади неоновый круг; пост-обработка: bloom, хроматическая аберрация, глитч, виньетка. Тайминг (секунды): см. TL.
(function () {
  'use strict';

  var TL = {
    ring: 0.14,      // первая вспышка кольца-«неоновой вывески»
    arrC: 1.15, arrL: 1.28, arrR: 1.40, arrDur: 0.46,
    letters: 1.72, studio: 2.12,
    boom: 2.30, glitchEnd: 2.62,
    glint0: 2.80, glint1: 3.60,
    fade0: 3.55, end: 4.0
  };
  function setEnd(e) { TL.end = e; TL.fade0 = e - 0.45; }   // конец заставки можно продлить (длинный файл голоса), затухание — последние 0.45 с
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function smooth(a, b, x) { var k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); }
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function easeOutBack(k, s) { k = clamp(k, 0, 1) - 1; return 1 + k * k * ((s + 1) * k + s); }
  function easeInOutSine(k) { return 0.5 - 0.5 * Math.cos(Math.PI * clamp(k, 0, 1)); }
  function glintP(t) { return easeInOutSine((t - TL.glint0) / (TL.glint1 - TL.glint0)); }   // 0..1 положение блика и панорамы голоса
  function fadeK(t) { var u = clamp((t - TL.fade0) / (TL.end - TL.fade0), 0, 1); return 1 - u * u * (3 - 2 * u); }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // огни кольца: «умирающая» вывеска до 1.15 с
  function ringLevel(t) {
    if (t < TL.ring) return 0;
    if (t < 0.20) return 0.95;
    if (t < 0.30) return 0;
    if (t < 0.36) return 0.8;
    if (t < 0.44) return 0.05;
    if (t < 0.62) return 0.35 + 0.55 * hash(Math.floor(t * 55));
    if (t < 0.70) return 0;
    if (t < 1.0) return (0.6 + 0.4 * hash(Math.floor(t * 40))) * (hash(Math.floor(t * 9)) > 0.2 ? 1 : 0.25);
    if (t < 1.15) return 0.9 + 0.1 * hash(Math.floor(t * 60));
    return 1;
  }

  // ------------------------------------------------------------------ геометрия (пиксели логотипа, ось Y вверх, начало — центр логотипа)
  function area(p) { var s = 0; for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function ccw(p) { return area(p) > 0 ? p : p.slice().reverse(); }
  function cw(p) { return area(p) < 0 ? p : p.slice().reverse(); }
  function dedupe(p) { var o = []; for (var i = 0; i < p.length; i++) { var q = o[o.length - 1]; if (!q || Math.abs(q[0] - p[i][0]) + Math.abs(q[1] - p[i][1]) > 0.05) o.push(p[i]); } var f = o[0], l = o[o.length - 1]; if (o.length > 1 && Math.abs(f[0] - l[0]) + Math.abs(f[1] - l[1]) < 0.05) o.pop(); return o; }
  // скругление (segs>1) или фаска (segs=1) выпуклых углов контура против часовой стрелки
  function corners(p, r, segs, concaveR) {
    var out = [], n = p.length;
    for (var i = 0; i < n; i++) {
      var a = p[(i + n - 1) % n], v = p[i], b = p[(i + 1) % n];
      var e1x = v[0] - a[0], e1y = v[1] - a[1], e2x = b[0] - v[0], e2y = b[1] - v[1];
      var l1 = Math.hypot(e1x, e1y), l2 = Math.hypot(e2x, e2y);
      var cross = e1x * e2y - e1y * e2x, dot = (e1x * e2x + e1y * e2y) / (l1 * l2);
      var rr = cross > 0 ? r : (concaveR || 0);
      if (dot > 0.94 || rr <= 0) { out.push(v); continue; }
      rr = Math.min(rr, l1 * 0.48, l2 * 0.48);
      var A = [v[0] - e1x / l1 * rr, v[1] - e1y / l1 * rr], B = [v[0] + e2x / l2 * rr, v[1] + e2y / l2 * rr];
      out.push(A);
      for (var k = 1; k < segs; k++) {
        var s = k / segs, w0 = (1 - s) * (1 - s), w1 = 2 * s * (1 - s), w2 = s * s;
        out.push([A[0] * w0 + v[0] * w1 + B[0] * w2, A[1] * w0 + v[1] * w1 + B[1] * w2]);
      }
      out.push(B);
    }
    return out;
  }
  // смещение контура (против часовой стрелки: d>0 — внутрь, d<0 — наружу), угловые «шипы» ограничены
  function offset(p, d) {
    var n = p.length, out = [];
    for (var i = 0; i < n; i++) {
      var a = p[(i + n - 1) % n], v = p[i], b = p[(i + 1) % n];
      var x1 = v[0] - a[0], y1 = v[1] - a[1], x2 = b[0] - v[0], y2 = b[1] - v[1];
      var l1 = Math.hypot(x1, y1) || 1, l2 = Math.hypot(x2, y2) || 1;
      var n1 = [-y1 / l1, x1 / l1], n2 = [-y2 / l2, x2 / l2];
      var mx = n1[0] + n2[0], my = n1[1] + n2[1], ml = Math.hypot(mx, my) || 1;
      mx /= ml; my /= ml;
      var k = d / Math.max(mx * n1[0] + my * n1[1], 0.4);
      out.push([v[0] + mx * k, v[1] + my * k]);
    }
    return out;
  }
  function bez(p0, p1, p2, p3, t) {
    var u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
  }
  function conv(p) { return p.map(function (q) { return [q[0] - 322, 330 - q[1]]; }); }   // из пикселей скриншота в координаты сцены

  // стрелки (координаты скриншота: Y вниз)
  function arrowCenter() {
    var p = [[322, 80], [372, 164], [344, 164], [344, 442]];
    for (var i = 1; i < 12; i++) { var a = i / 12 * Math.PI; p.push([322 + 22 * Math.cos(a), 442 + 22 * Math.sin(a)]); }
    p.push([300, 442], [300, 164], [272, 164]);
    return p;
  }
  function arrowBranch(P, headLen, hb, hw) {
    var N = 40, L = [], R = [], i, c, c2, tx, ty, tl, nx, ny;
    for (i = 0; i <= N; i++) {
      var t = i / N; c = bez(P[0], P[1], P[2], P[3], t); c2 = bez(P[0], P[1], P[2], P[3], Math.min(1, t + 0.01));
      if (i === N) c2 = [c[0] * 2 - bez(P[0], P[1], P[2], P[3], 0.99)[0], c[1] * 2 - bez(P[0], P[1], P[2], P[3], 0.99)[1]];
      tx = c2[0] - c[0]; ty = c2[1] - c[1]; tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      nx = -ty; ny = tx;
      L.push([c[0] + nx * hw, c[1] + ny * hw]); R.push([c[0] - nx * hw, c[1] - ny * hw]);
      if (i === N) { var e = c; var tip = [e[0] + tx * headLen, e[1] + ty * headLen]; var hA = [e[0] - nx * hb, e[1] - ny * hb], hB = [e[0] + nx * hb, e[1] + ny * hb]; R.push(hA, tip, hB); }
    }
    return R.concat(L.slice().reverse());
  }
  function arrowLeft() { return arrowBranch([[322, 398], [322, 300], [292, 246], [232, 246]], 90, 45, 20); }
  function arrowRight() { return arrowBranch([[322, 430], [322, 352], [346, 318], [408, 318]], 88, 43, 20); }

  // буквы (контуры в пикселях, начало — левый низ, Y вверх)
  function glyph(ch, W, H, t) {
    var m = (H - t) / 2, Wm = W * 0.86, hc = H * 0.42, o, h = [];
    switch (ch) {
      case 'E': o = [[0, 0], [W, 0], [W, t], [t, t], [t, m], [Wm, m], [Wm, m + t], [t, m + t], [t, H - t], [W, H - t], [W, H], [0, H]]; break;
      case 'P': o = [[0, 0], [t, 0], [t, hc], [W, hc], [W, H], [0, H]]; h = [[[t, hc + t], [W - t, hc + t], [W - t, H - t], [t, H - t]]]; break;
      case 'I': o = [[0, 0], [t, 0], [t, H], [0, H]]; break;
      case 'C': o = [[0, 0], [W, 0], [W, t], [t, t], [t, H - t], [W, H - t], [W, H], [0, H]]; break;
      case 'L': o = [[0, 0], [W, 0], [W, t], [t, t], [t, H], [0, H]]; break;
      case 'N': o = [[0, 0], [t, 0], [t, H * 0.6], [W - t * 1.15, 0], [W, 0], [W, H], [W - t, H], [W - t, H * 0.4], [t * 1.15, H], [0, H]]; break;
      case 'S': o = [[0, 0], [W, 0], [W, H / 2 + t / 2], [t, H / 2 + t / 2], [t, H - t], [W, H - t], [W, H], [0, H], [0, H / 2 - t / 2], [W - t, H / 2 - t / 2], [W - t, t], [0, t]]; break;
      case 'T': o = [[W / 2 - t / 2, 0], [W / 2 + t / 2, 0], [W / 2 + t / 2, H - t], [W, H - t], [W, H], [0, H], [0, H - t], [W / 2 - t / 2, H - t]]; break;
      case 'U': o = [[0, 0], [W, 0], [W, H], [W - t, H], [W - t, t], [t, t], [t, H], [0, H]]; break;
      case 'D': o = [[0, 0], [W * 0.68, 0], [W, H * 0.3], [W, H * 0.7], [W * 0.68, H], [0, H]]; break;
      default: { var c = H * 0.28; o = [[c, 0], [W - c, 0], [W, c], [W, H - c], [W - c, H], [c, H], [0, H - c], [0, c]]; }   // 'O'
    }
    o = ccw(o);
    if (ch === 'D' || ch === 'O') h = [offset(o, t)];
    return { outer: o, holes: h.map(cw) };
  }
  function glyphWidth(ch, W, t) { return ch === 'I' ? t : W; }

  // ------------------------------------------------------------------ шейдеры постобработки
  var VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  var FS_BRIGHT = 'uniform sampler2D tMap; uniform float uThr; varying vec2 vUv; void main(){ vec3 c = texture2D(tMap, vUv).rgb; float l = max(c.r, max(c.g, c.b)); c *= max(l - uThr, 0.0) / max(l, 0.0001); gl_FragColor = vec4(c, 1.0); }';
  var FS_COPY = 'uniform sampler2D tMap; uniform vec2 uTexel; varying vec2 vUv; void main(){ vec3 c = texture2D(tMap, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tMap, vUv + uTexel * vec2(0.5, -0.5)).rgb + texture2D(tMap, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tMap, vUv + uTexel * vec2(0.5, 0.5)).rgb; gl_FragColor = vec4(c * 0.25, 1.0); }';
  var FS_BLUR = 'uniform sampler2D tMap; uniform vec2 uDir; varying vec2 vUv; void main(){ vec3 c = texture2D(tMap, vUv).rgb * 0.227027; c += (texture2D(tMap, vUv + uDir * 1.0).rgb + texture2D(tMap, vUv - uDir * 1.0).rgb) * 0.1945946; c += (texture2D(tMap, vUv + uDir * 2.0).rgb + texture2D(tMap, vUv - uDir * 2.0).rgb) * 0.1216216; c += (texture2D(tMap, vUv + uDir * 3.0).rgb + texture2D(tMap, vUv - uDir * 3.0).rgb) * 0.054054; c += (texture2D(tMap, vUv + uDir * 4.0).rgb + texture2D(tMap, vUv - uDir * 4.0).rgb) * 0.016216; gl_FragColor = vec4(c, 1.0); }';
  var FS_COMP = [
    'uniform sampler2D tScene, tB0, tB1, tB2, tB3;',
    'uniform float uTime, uGlitch, uChroma, uBloom, uFade, uFlash, uSeed;',
    'uniform vec2 uRes;',
    'varying vec2 vUv;',
    'float h11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }',
    'float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
    'vec3 S(vec2 uv){ return texture2D(tScene, uv).rgb + uBloom * (0.5 * texture2D(tB0, uv).rgb + 0.6 * texture2D(tB1, uv).rgb + 0.75 * texture2D(tB2, uv).rgb + 0.9 * texture2D(tB3, uv).rgb); }',
    'void main(){',
    '  vec2 uv = vUv; float g = uGlitch; float tt = floor(uTime * 24.0) + uSeed;',
    '  float sl = floor(uv.y * mix(10.0, 46.0, h11(tt)));',
    '  float on = step(1.0 - g * 0.4, h21(vec2(sl, tt)));',
    '  uv.x += (h21(vec2(sl + 7.0, tt)) - 0.5) * 0.17 * g * on;',
    '  float bx = floor(uv.x * 14.0), by = floor(uv.y * 9.0);',
    '  float blk = step(1.0 - g * 0.10, h21(vec2(bx + by * 17.0, tt + 3.0)));',
    '  uv += (vec2(h21(vec2(bx, by + tt)), h21(vec2(by, bx + tt))) - 0.5) * 0.06 * g * blk;',
    '  float ca = uChroma + g * 0.016 * (0.4 + h11(tt + 5.0));',
    '  vec3 col; col.r = S(uv + vec2(ca, 0.0)).r; col.g = S(uv).g; col.b = S(uv - vec2(ca, 0.0)).b;',
    '  float split = g * (0.5 + 0.5 * h11(tt + 9.0));',
    '  col.r += S(uv + vec2(0.045 * split, 0.0)).r * 0.55 * split; col.b += S(uv - vec2(0.045 * split, 0.0)).b * 0.7 * split;',
    '  col += vec3(0.30, 0.78, 1.0) * uFlash;',
    '  float sc = 0.965 + 0.035 * sin(uv.y * uRes.y * 3.14159);',
    '  col *= sc;',
    '  vec2 q = vUv - 0.5; col *= 1.0 - dot(q, q) * 1.15;',
    '  col += (h21(vUv * uRes + uTime * 60.0) - 0.5) * 0.035;',
    '  col = vec3(1.0) - exp(-col * 1.25);',
    '  col = pow(max(col, vec3(0.0)), vec3(0.82));',
    '  gl_FragColor = vec4(col * uFade, 1.0);',
    '}'
  ].join('\n');

  var PART_VS = [
    'uniform float uTime, uScale; attribute vec3 aVel; attribute vec3 aInfo; varying float vA; varying float vK;',
    'void main(){',
    '  float age = uTime - aInfo.x; float k = age / aInfo.y;',
    '  vec3 p = position + aVel * age * (1.0 - 0.5 * k) + vec3(0.0, -90.0 * age * age, 0.0);',
    '  vA = (age < 0.0 || k > 1.0) ? 0.0 : (1.0 - k) * (0.55 + 0.45 * fract(sin(aInfo.x * 91.7 + aInfo.z * 13.0 + floor(uTime * 28.0)) * 437.5));',
    '  vK = k;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;',
    '  gl_PointSize = max(aInfo.z * uScale / -mv.z * (vA > 0.0 ? 1.0 : 0.0), 0.0);',
    '}'
  ].join('\n');
  var PART_FS = 'varying float vA; varying float vK; void main(){ vec2 c = abs(gl_PointCoord - 0.5) * 2.0; float d = max(c.x, c.y); if (vA <= 0.001 || d > 1.0) discard; vec3 col = mix(vec3(0.85, 1.0, 1.0), vec3(0.05, 0.55, 1.0), smoothstep(0.0, 0.8, vK)); gl_FragColor = vec4(col * (1.2 + 2.6 * (1.0 - d) * vA) * vA, 1.0); }';

  var SMOKE_VS = [
    'uniform float uTime, uScale, uAmt; attribute vec3 aVel; attribute vec3 aInfo; varying float vA;',
    'void main(){',
    '  float age = uTime - aInfo.x; float k = clamp(age / aInfo.y, 0.0, 1.0);',
    '  vec3 p = position + aVel * max(age, 0.0);',
    '  vA = (age < 0.0 ? 0.0 : smoothstep(0.0, 0.3, k) * (1.0 - smoothstep(0.55, 1.0, k))) * uAmt;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;',
    '  gl_PointSize = aInfo.z * (0.7 + 0.8 * k) * uScale / -mv.z;',
    '}'
  ].join('\n');
  var SMOKE_FS = 'uniform sampler2D uMap; varying float vA; void main(){ float a = texture2D(uMap, gl_PointCoord).r * vA; if (a < 0.002) discard; gl_FragColor = vec4(vec3(0.10, 0.52, 0.85) * a, 1.0); }';

  function create(THREE, canvas, opt) {
    opt = opt || {};
    var G = function (n) { return THREE[n + 'BufferGeometry'] || THREE[n + 'Geometry']; };
    var gl, renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    } catch (e) { return null; }
    var isGL2 = !!renderer.capabilities.isWebGL2;
    var reduce = !!opt.reduceMotion;
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = false;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    var scene = new THREE.Scene(), ovScene = new THREE.Scene();
    var cam = new THREE.PerspectiveCamera(24, 16 / 9, 100, 7000);
    var ovCam = new THREE.OrthographicCamera(-1.78, 1.78, 1, -1, -1, 1);
    var W = 2, H = 2, dist = 1650, dbg = { zoom: 1, ox: 0, oy: 0 };

    // ---------------------------------------------------------------- окружение для хрома (процедурная «студия» из неоновых панелей)
    var pm = new THREE.PMREMGenerator(renderer);
    var envTex = (function () {
      var es = new THREE.Scene(); es.background = new THREE.Color(0x01040a);
      function panel(w, h, x, y, z, col, k) {
        var m = new THREE.Mesh(new (G('Plane'))(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
        m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m);
      }
      panel(34, 9, -18, 20, 22, 0xcfeeff, 2.6); panel(6, 42, 28, 2, 8, 0x12b4ff, 3.2); panel(44, 3.5, 0, -15, 20, 0x2e74ff, 1.8);
      panel(14, 14, 0, 12, -32, 0x00e6ff, 2.2); panel(4, 30, -30, -4, 2, 0xffffff, 2.2); panel(22, 5, 14, 24, 10, 0x9fe0ff, 1.6);
      var t = pm.fromScene(es, 0.03).texture; return t;
    })();

    // ---------------------------------------------------------------- материалы
    function crackTexture() {
      var c = document.createElement('canvas'); c.width = c.height = 512; var x = c.getContext('2d'); var rng = mulberry(9);
      x.fillStyle = '#000'; x.fillRect(0, 0, 512, 512); x.lineCap = 'round';
      function crack(px, py, ang, len, w, depth) {
        var steps = 10 + (rng() * 8 | 0); x.beginPath(); x.moveTo(px, py);
        for (var i = 0; i < steps; i++) {
          ang += (rng() - 0.5) * 1.1; var l = len / steps * (0.6 + rng() * 0.8); px += Math.cos(ang) * l; py += Math.sin(ang) * l; x.lineTo(px, py);
          if (depth > 0 && rng() < 0.18) { x.stroke(); crack(px, py, ang + (rng() - 0.5) * 2, len * 0.45, w * 0.7, depth - 1); x.beginPath(); x.moveTo(px, py); }
        }
        x.lineWidth = w; x.strokeStyle = 'rgba(120,225,255,' + (0.35 + rng() * 0.6).toFixed(2) + ')'; x.stroke();
      }
      for (var i = 0; i < 46; i++) crack(rng() * 512, rng() * 512, rng() * 6.28, 60 + rng() * 150, 0.8 + rng() * 1.2, 2);
      for (i = 0; i < 1400; i++) { x.fillStyle = 'rgba(90,200,255,' + (rng() * 0.5).toFixed(2) + ')'; x.fillRect(rng() * 512, rng() * 512, 1, 1); }
      var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 300, 1 / 300); return t;
    }
    function grainTexture() {
      var c = document.createElement('canvas'); c.width = c.height = 256; var x = c.getContext('2d'); var rng = mulberry(4);
      x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256);
      for (var i = 0; i < 5200; i++) { var v = 40 + (rng() * 200 | 0); x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; var s = 1 + (rng() * 2 | 0); x.fillRect(rng() * 256, rng() * 256, s, s); }
      var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 90, 1 / 90); return t;
    }
    var crackTex = crackTexture(), grainTex = grainTexture();
    var glintU = { value: new THREE.Vector3(-999, 30, 0) };   // x, ширина, сила
    function glintable(m) {
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uGlint = glintU;
        sh.vertexShader = 'varying vec3 vGP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = 'varying vec3 vGP; uniform vec3 uGlint;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n float gx = vGP.x - uGlint.x + vGP.y * 0.45; totalEmissiveRadiance += vec3(0.75, 0.95, 1.0) * exp(-gx * gx / (2.0 * uGlint.y * uGlint.y)) * uGlint.z;');
      };
      return m;
    }
    var matCap = new THREE.MeshStandardMaterial({ color: 0x0a0c10, metalness: 0.88, roughness: 0.34, envMap: envTex, envMapIntensity: 1.0, bumpMap: grainTex, bumpScale: 0.7, roughnessMap: grainTex, emissive: 0x1fb8ff, emissiveMap: crackTex, emissiveIntensity: 0.05 });
    var matChrome = new THREE.MeshStandardMaterial({ color: 0xf2f7fc, metalness: 1.0, roughness: 0.2, envMap: envTex, envMapIntensity: 1.3, emissive: 0x0e7fb0, emissiveIntensity: 0.12 });
    var matPlate = new THREE.MeshStandardMaterial({ color: 0x05070a, metalness: 0.7, roughness: 0.45, envMap: envTex, envMapIntensity: 0.6, bumpMap: grainTex, bumpScale: 0.5, emissive: 0x0a5a80, emissiveIntensity: 0.0 });
    var matPlateEdge = new THREE.MeshStandardMaterial({ color: 0x9fb4c4, metalness: 1, roughness: 0.3, envMap: envTex, envMapIntensity: 1.2, emissive: 0x13a0d8, emissiveIntensity: 0.15 });
    var mLet = glintable(new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1.0, roughness: 0.2, envMap: envTex, envMapIntensity: 1.25, emissive: 0x138fc8, emissiveIntensity: 0.1 }));
    var mLetFace = glintable(new THREE.MeshStandardMaterial({ color: 0x030405, metalness: 0.5, roughness: 0.42, envMap: envTex, envMapIntensity: 0.28, bumpMap: grainTex, bumpScale: 0.5, emissive: 0x138fc8, emissiveIntensity: 0.0 }));
    var mStu = glintable(new THREE.MeshStandardMaterial({ color: 0xeef5fb, metalness: 1.0, roughness: 0.22, envMap: envTex, envMapIntensity: 1.2, emissive: 0x138fc8, emissiveIntensity: 0.1 }));

    // ---------------------------------------------------------------- свет
    var key = new THREE.DirectionalLight(0xe6f2ff, 1.15); key.position.set(-420, 520, 900); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -420; key.shadow.camera.right = 420; key.shadow.camera.top = 420; key.shadow.camera.bottom = -420; key.shadow.camera.near = 100; key.shadow.camera.far = 2600; key.shadow.bias = -0.0005; key.shadow.radius = 4;
    scene.add(key);
    var cyanL = new THREE.PointLight(0x10c8ff, 1.6, 1500, 1); cyanL.position.set(-260, 120, -40); scene.add(cyanL);
    var blueL = new THREE.PointLight(0x2f6bff, 1.2, 1500, 1); blueL.position.set(300, -200, 160); scene.add(blueL);
    scene.add(new THREE.AmbientLight(0x1a2a3a, 0.5));
    var catcher = new THREE.Mesh(new (G('Plane'))(1400, 1400), new THREE.ShadowMaterial({ opacity: 0.6 })); catcher.position.z = -34; catcher.receiveShadow = true; scene.add(catcher);

    // ---------------------------------------------------------------- логотип
    var logo = new THREE.Group(); scene.add(logo);
    function shapeOf(o, holes) { var s = new THREE.Shape(o.map(function (v) { return new THREE.Vector2(v[0], v[1]); })); (holes || []).forEach(function (h) { s.holes.push(new THREE.Path(h.map(function (v) { return new THREE.Vector2(v[0], v[1]); }))); }); return s; }
    function extrude(o, holes, depth, bev, bsz, segs) {
      return new (G('Extrude'))(shapeOf(dedupe(o), (holes || []).map(dedupe)), { depth: depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bsz, bevelOffset: 0, bevelSegments: segs, curveSegments: 4, steps: 1 });
    }
    function outlineLine(pts, z, color) {
      var arr = []; pts.forEach(function (p) { arr.push(p[0], p[1], z); });
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
      var m = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: color || 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      return m;
    }
    var pieces = [], edgeLines = [];
    var pool = [];   // точки на контурах стрелок и букв — цели для молний и искр
    function addPiece(name, raw, depth, plateTop, t0, spinY, spinZ) {
      var o = ccw(conv(raw)); o = corners(o, 8, 3, 2.5);
      var grp = new THREE.Group();
      var geo = extrude(o, [], depth, 6, 5, 3);
      var mesh = new THREE.Mesh(geo, [matCap, matChrome]); mesh.castShadow = true; mesh.receiveShadow = true; grp.add(mesh);
      var plateO = offset(o, -16); plateO = corners(plateO, 10, 3, 4);
      var pgeo = extrude(plateO, [], 7, 2.5, 2, 2);
      var plate = new THREE.Mesh(pgeo, [matPlate, matPlateEdge]); plate.position.z = plateTop - 7; plate.castShadow = true; plate.receiveShadow = true; grp.add(plate);
      var l1 = outlineLine(o, depth + 6.4, 0xffffff); grp.add(l1);
      var l2 = outlineLine(plateO, plateTop + 2.6, 0x22b8ff); grp.add(l2);
      edgeLines.push(l1, l2);
      logo.add(grp);
      var pc = { name: name, grp: grp, t0: t0, spinY: spinY, spinZ: spinZ, depth: depth, l1: l1, l2: l2 };
      o.forEach(function (p, i) { if (i % 2 === 0) pool.push([p[0], p[1], depth + 8]); });
      pieces.push(pc); return pc;
    }
    addPiece('c', arrowCenter(), 40, -22, TL.arrC, 0.0, 0.0);
    addPiece('l', arrowLeft(), 34, -26, TL.arrL, 1.5, 0.35);
    addPiece('r', arrowRight(), 34, -30, TL.arrR, -1.5, -0.35);

    // буквы
    var letters = [];
    (function () {
      var word = 'EPICLINES', LW = 46, LH = 52, LT = 11, gap = 13, tot = 0, i, x;
      for (i = 0; i < word.length; i++) tot += glyphWidth(word[i], LW, LT) + (i ? gap : 0);
      x = -tot / 2; var y0 = -187 - LH / 2;
      for (i = 0; i < word.length; i++) {
        var g = glyph(word[i], LW, LH, LT), o = corners(g.outer, 6, 1, 0);
        var grp = new THREE.Group(); grp.position.set(x, y0, 0);
        var m1 = new THREE.Mesh(extrude(o, g.holes, 14, 3, 2.2, 2), mLet); m1.castShadow = true; grp.add(m1);
        var inner = offset(g.outer, 3.4); inner = corners(inner, 3.2, 1, 0);
        var hin = g.holes.map(function (h) { return offset(h, 3.4); });
        var m2 = new THREE.Mesh(extrude(inner, hin, 16.4, 1.4, 1.0, 2), [mLetFace, mLet]); grp.add(m2);
        logo.add(grp); letters.push({ grp: grp, t0: TL.letters + i * 0.045, x: x + glyphWidth(word[i], LW, LT) / 2 });
        pool.push([x + 4, y0 + 4, 20], [x + glyphWidth(word[i], LW, LT) - 4, y0 + LH - 4, 20]);
        x += glyphWidth(word[i], LW, LT) + gap;
      }
      var stu = 'STUDIO', SW = 12, SH = 14, ST = 3, pitch = 44; x = -((stu.length - 1) * pitch + SW) / 2; var sy = -235 - SH / 2;
      for (i = 0; i < stu.length; i++) {
        var gs = glyph(stu[i], SW, SH, ST), os = corners(gs.outer, 1.6, 1, 0);
        var grp2 = new THREE.Group(); grp2.position.set(x + (SW - glyphWidth(stu[i], SW, ST)) / 2, sy, 0);
        var ms = new THREE.Mesh(extrude(os, gs.holes, 6, 1.2, 0.9, 2), mStu); ms.castShadow = true; grp2.add(ms);
        logo.add(grp2); letters.push({ grp: grp2, t0: TL.studio + i * 0.05, x: x + SW / 2, studio: true });
        x += pitch;
      }
    })();
    // линии по бокам от STUDIO (неоновые)
    var sideLines = [];
    [[-192, -132], [133, 198]].forEach(function (s, k) {
      var g = new (G('Box'))(s[1] - s[0], 1.6, 3); var m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x20d0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.set((s[0] + s[1]) / 2, -235, 4); logo.add(m); sideLines.push({ m: m, side: k ? 1 : -1, w: s[1] - s[0], x0: (s[0] + s[1]) / 2 });
    });

    // ---------------------------------------------------------------- круг: «неоновая вывеска» и техно-кольца позади логотипа
    var ringGrp = new THREE.Group(); ringGrp.position.set(0, 20, -140); scene.add(ringGrp);
    function addMat(r, g, b) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); }
    var rrng = mulberry(77), outerArcs = [], innerRings = [];
    (function () {
      var n = 14, i, a = 0;
      for (i = 0; i < n; i++) {
        var len = Math.PI * 2 / n * (0.84 + rrng() * 0.1), mat = addMat(0.2, 0.85, 1.0);
        var m = new THREE.Mesh(new (G('Ring'))(229, 235, Math.max(6, (len * 24) | 0), 1, a, len), mat); ringGrp.add(m); outerArcs.push({ mat: mat, h: rrng() });
        a += Math.PI * 2 / n;
      }
      var specs = [[214, 1.4, 0.55, 9], [196, 2.2, 0.35, 7], [174, 1.2, 0.5, 12], [150, 3, 0.25, 6], [124, 1.2, 0.5, 14], [96, 2, 0.3, 8], [236, 1, 0.4, 24]];
      specs.forEach(function (sp, k) {
        var grp = new THREE.Group(), mat = addMat(0.1 * sp[2] * 3, 0.7 * sp[2] * 2, 1.0 * sp[2] * 2), segs = sp[3], aa = rrng() * 6.28;
        for (var j = 0; j < segs; j++) {
          var len2 = Math.PI * 2 / segs * (0.35 + rrng() * 0.5);
          grp.add(new THREE.Mesh(new (G('Ring'))(sp[0] - sp[1] / 2, sp[0] + sp[1] / 2, Math.max(4, (len2 * 20) | 0), 1, aa, len2), mat)); aa += Math.PI * 2 / segs;
        }
        ringGrp.add(grp); innerRings.push({ grp: grp, mat: mat, w: (k % 2 ? -1 : 1) * (0.12 + 0.07 * k), base: sp[2] });
      });
      // риски по внешнему кругу и горизонтальные «потоки данных»
      var pts = [], ang;
      for (ang = 0; ang < 360; ang += 3) { var rad = ang * Math.PI / 180, r0 = 240, r1 = ang % 15 === 0 ? 256 : 247; pts.push(Math.cos(rad) * r0, Math.sin(rad) * r0, 0, Math.cos(rad) * r1, Math.sin(rad) * r1, 0); }
      for (i = 0; i < 46; i++) { var yy = (rrng() - 0.5) * 260, side = rrng() < 0.5 ? -1 : 1, x0 = side * (250 + rrng() * 30), ll = 30 + rrng() * 150; pts.push(x0, yy, 0, x0 + side * ll, yy, 0); }
      var tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      var tmat = new THREE.LineBasicMaterial({ color: new THREE.Color(0.1, 0.5, 0.7), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      ringGrp.add(new THREE.LineSegments(tg, tmat)); ringGrp.userData.ticks = tmat;
    })();
    // гало за стрелками
    function radialTex(stops) {
      var c = document.createElement('canvas'); c.width = c.height = 256; var x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); x.fillStyle = g; x.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c);
    }
    var haloTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(120,225,255,0.55)'], [0.6, 'rgba(10,110,200,0.18)'], [1, 'rgba(0,0,0,0)']]);
    var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0x38c8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    halo.scale.set(900, 900, 1); halo.position.set(0, 20, -190); scene.add(halo);
    // звезда-блик, едет по строке текста вместе с проходом света
    var starTex = (function () {
      var c = document.createElement('canvas'); c.width = c.height = 256; var x = c.getContext('2d');
      var g = x.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(190,240,255,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
      var h = x.createLinearGradient(0, 0, 256, 0); h.addColorStop(0, 'rgba(255,255,255,0)'); h.addColorStop(0.5, 'rgba(255,255,255,0.95)'); h.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = h; x.fillRect(0, 124, 256, 8);
      var v = x.createLinearGradient(0, 0, 0, 256); v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(0.5, 'rgba(255,255,255,0.8)'); v.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = v; x.fillRect(125, 0, 6, 256);
      return new THREE.CanvasTexture(c);
    })();
    var star = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: 0xcff4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    star.position.z = 34; star.scale.set(150, 150, 1); logo.add(star);

    // ---------------------------------------------------------------- искры, цифровой дым, молнии
    function easePos(u) { return easeOutBack(u, 1.6); }
    var sparkGeo = (function () {
      var rng = mulberry(31), pos = [], vel = [], info = [];
      function add(ox, oy, oz, vx, vy, vz, birth, life, size) { pos.push(ox, oy, oz); vel.push(vx, vy, vz); info.push(birth, life, size); }
      var starts = { c: [0, 30, -150], l: [0, 30, -150], r: [0, 30, -150] };
      var tips = { c: [0, 160, 20], l: [-120, 87, 20], r: [120, 12, 20] };
      pieces.forEach(function (pc) {
        for (var i = 0; i < 150; i++) {
          var u = rng(), b = pc.t0 + u * TL.arrDur, k = easePos(u), s = starts[pc.name], e = tips[pc.name];
          var a = rng() * 6.283, sp = 60 + rng() * 380;
          add(lerp(s[0], e[0], k), lerp(s[1], e[1], k), lerp(s[2], e[2], k), Math.cos(a) * sp, Math.sin(a) * sp, (rng() - 0.3) * 200, b, 0.35 + rng() * 0.6, 1.4 + rng() * 2.6);
        }
      });
      for (var i = 0; i < 520; i++) {   // взрыв на 2.30
        var p = pool[(rng() * pool.length) | 0], a2 = Math.atan2(p[1] + 40, p[0]) + (rng() - 0.5) * 1.4, sp2 = 120 + rng() * 620;
        add(p[0], p[1], p[2], Math.cos(a2) * sp2, Math.sin(a2) * sp2, (rng() - 0.2) * 300, TL.boom + rng() * 0.07, 0.45 + rng() * 0.8, 1.4 + rng() * 3.2);
      }
      for (i = 0; i < 260 + Math.round(Math.max(0, TL.end - 4) * 200); i++) {   // тихая россыпь по контурам после стабилизации
        var q = pool[(rng() * pool.length) | 0];
        add(q[0], q[1], q[2], (rng() - 0.5) * 50, 25 + rng() * 80, rng() * 40, 2.62 + rng() * Math.max(1.2, TL.end - 2.9), 0.7 + rng() * 0.9, 1.0 + rng() * 1.8);
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('aVel', new THREE.BufferAttribute(new Float32Array(vel), 3)); g.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(info), 3));
      return g;
    })();
    var sparkU = { uTime: { value: 0 }, uScale: { value: 1000 } };
    var sparks = new THREE.Points(sparkGeo, new THREE.ShaderMaterial({ uniforms: sparkU, vertexShader: PART_VS, fragmentShader: PART_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sparks.frustumCulled = false; scene.add(sparks);

    var smokeTex = (function () {
      var c = document.createElement('canvas'); c.width = c.height = 128; var x = c.getContext('2d'), rng = mulberry(5);
      x.fillStyle = '#000'; x.fillRect(0, 0, 128, 128);
      for (var i = 0; i < 26; i++) {
        var cx = 64 + (rng() - 0.5) * 60, cy = 64 + (rng() - 0.5) * 60, r = 14 + rng() * 30, g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(255,255,255,' + (0.12 + rng() * 0.15).toFixed(2) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      }
      var edge = x.createRadialGradient(64, 64, 20, 64, 64, 64); edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,1)'); x.fillStyle = edge; x.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    var smokeU = { uTime: { value: 0 }, uScale: { value: 1000 }, uAmt: { value: 0.0 }, uMap: { value: smokeTex } };
    var smoke = (function () {
      var rng = mulberry(12), pos = [], vel = [], info = [];
      for (var i = 0; i < 34 + Math.round(Math.max(0, TL.end - 4) * 14); i++) {
        var p = pool[(rng() * pool.length) | 0];
        pos.push(p[0] * 0.8 + (rng() - 0.5) * 40, p[1] * 0.8 + (rng() - 0.5) * 40, 30 + rng() * 60); vel.push((rng() - 0.5) * 16, 6 + rng() * 14, 0); info.push(2.55 + rng() * (0.7 + Math.max(0, TL.end - 4) * 0.8), 1.7 + rng() * 0.8, 170 + rng() * 170);
      }
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute('aVel', new THREE.BufferAttribute(new Float32Array(vel), 3)); g.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(info), 3));
      var m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: smokeU, vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.frustumCulled = false; scene.add(m); return m;
    })();

    var NB = 12, SEG = 16, boltPos = new Float32Array(NB * SEG * 6);
    var boltGeo = new THREE.BufferGeometry(); var boltAttr = new THREE.BufferAttribute(boltPos, 3); boltAttr.setUsage(THREE.DynamicDrawUsage || 35048); boltGeo.setAttribute('position', boltAttr);
    var boltMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0.6, 0.9, 1.0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    var bolts = [];
    [[0, 0], [1.4, 0], [0, 1.4], [-1.2, -1.2]].forEach(function (o) { var l = new THREE.LineSegments(boltGeo, boltMat); l.position.set(o[0], o[1], 0); l.frustumCulled = false; scene.add(l); bolts.push(l); });
    var boltSeed = -1;
    function updateBolts(t, inten) {
      var seed = Math.floor(t * 22);
      if (seed === boltSeed) { boltMat.color.setRGB(0.6 * (0.5 + inten), 0.9 * (0.5 + inten), 1.0 * (0.6 + inten)); return; }
      boltSeed = seed; var rng = mulberry(seed * 7919 + 13), b, s, k = 0;
      for (b = 0; b < NB; b++) {
        var active = rng() < inten;
        var a = rng() * 6.283, rr = 205 + rng() * 25, sx = Math.cos(a) * rr, sy = 20 + Math.sin(a) * rr, sz = -120;
        var tp = pool[Math.min((rng() * (t > TL.boom ? pool.length : 60)) | 0, pool.length - 1)];
        var dx = tp[0] - sx, dy = tp[1] - sy, dl = Math.hypot(dx, dy) || 1, px = -dy / dl, py = dx / dl, amp = 30 + rng() * 50, prev = null;
        for (s = 0; s <= SEG; s++) {
          var u = s / SEG, j = (rng() - 0.5) * amp * Math.sin(Math.PI * u) * 1.2;
          var cur = active ? [sx + dx * u + px * j, sy + dy * u + py * j, sz + (tp[2] - sz) * u] : [0, 0, -9000];
          if (prev) { boltPos[k++] = prev[0]; boltPos[k++] = prev[1]; boltPos[k++] = prev[2]; boltPos[k++] = cur[0]; boltPos[k++] = cur[1]; boltPos[k++] = cur[2]; }
          prev = cur;
        }
      }
      boltAttr.needsUpdate = true;
      boltMat.color.setRGB(0.6 * (0.5 + inten), 0.9 * (0.5 + inten), 1.0 * (0.6 + inten));
    }

    // ---------------------------------------------------------------- «бегущая строка» кода: имя студии пробегает и исчезает (до 1.15 с)
    var codeTex = (function () {
      var c = document.createElement('canvas'); c.width = 4096; c.height = 128; var x = c.getContext('2d'), rng = mulberry(21);
      x.font = 'bold 54px Consolas, "Courier New", monospace'; x.textBaseline = 'middle';
      var hex = '0123456789ABCDEF', words = ['sys.init()', 'link::open', 'sig=0x7F', 'EXEC', 'mount /dev/studio', 'ping 0.0.0.0', 'sync...', 'frame++', 'load.core'], px = 8;
      function junk(n) { var s = ''; while (s.length < n) { s += rng() < 0.45 ? words[(rng() * words.length) | 0] + ' ' : (rng() < 0.5 ? '0x' + hex[(rng() * 16) | 0] + hex[(rng() * 16) | 0] + ' ' : (rng() < 0.5 ? '01'.repeat(2 + ((rng() * 4) | 0)) + ' ' : '// ' + hex[(rng() * 16) | 0] + ' ')); } return s; }
      function draw(s, col, glow) { x.shadowColor = glow || 'rgba(0,0,0,0)'; x.shadowBlur = glow ? 14 : 0; x.fillStyle = col; x.fillText(s, px, 64); px += x.measureText(s).width; }
      draw(junk(52), 'rgba(80,190,235,0.55)');
      px = 2260; draw('> ', 'rgba(120,230,255,0.9)', '#18c8ff'); draw('EPICLINES STUDIO', '#ffffff', '#38d8ff'); draw(' _', 'rgba(120,230,255,0.9)', '#18c8ff');
      px += 24; draw(junk(40), 'rgba(80,190,235,0.55)');
      var t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(0.5, 1); t.minFilter = THREE.LinearFilter; return t;
    })();
    var codeMat = new THREE.MeshBasicMaterial({ map: codeTex, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, opacity: 0 });
    var codeLine = new THREE.Mesh(new (G('Plane'))(1, 1), codeMat); codeLine.position.set(0, -0.04, 0); ovScene.add(codeLine);

    // ---------------------------------------------------------------- пост-обработка
    var quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var quad = new THREE.Mesh(new (G('Plane'))(2, 2), null); quad.frustumCulled = false; quadScene.add(quad);
    function sm(fs, uniforms) { return new THREE.ShaderMaterial({ uniforms: uniforms, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false }); }
    var uBright = { tMap: { value: null }, uThr: { value: 1.0 } }, matBright = sm(FS_BRIGHT, uBright);
    var uCopy = { tMap: { value: null }, uTexel: { value: new THREE.Vector2() } }, matCopy = sm(FS_COPY, uCopy);
    var uBlur = { tMap: { value: null }, uDir: { value: new THREE.Vector2() } }, matBlur = sm(FS_BLUR, uBlur);
    var uComp = { tScene: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null }, uTime: { value: 0 }, uGlitch: { value: 0 }, uChroma: { value: 0.0012 }, uBloom: { value: 1 }, uFade: { value: 1 }, uFlash: { value: 0 }, uSeed: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } };
    var matComp = sm(FS_COMP, uComp);
    var halfOk = isGL2 || renderer.extensions.has('EXT_color_buffer_half_float');
    var rtScene, lv = [];
    function mkRT(w, h, depth, ms) {
      var o = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: halfOk ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: !!depth, stencilBuffer: false };
      var t = new THREE.WebGLRenderTarget(Math.max(2, w | 0), Math.max(2, h | 0), o); if (ms && isGL2) t.samples = 4; return t;
    }
    function disposeRT() { if (rtScene) rtScene.dispose(); lv.forEach(function (l) { l.a.dispose(); l.b.dispose(); }); lv = []; }
    function buildRT() {
      disposeRT(); var pw = renderer.domElement.width, ph = renderer.domElement.height;
      rtScene = mkRT(pw, ph, true, true);
      for (var i = 0; i < 4; i++) { var d = Math.pow(2, i + 1); lv.push({ a: mkRT(pw / d, ph / d, false), b: mkRT(pw / d, ph / d, false), w: Math.max(2, (pw / d) | 0), h: Math.max(2, (ph / d) | 0) }); }
    }
    function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, opt.maxDpr || 1.5), w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
      W = w; H = h; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
      var asp = w / h; cam.aspect = asp; cam.updateProjectionMatrix();
      var tv = Math.tan(cam.fov * Math.PI / 360);
      dist = Math.max(300 / 0.8 / tv, 270 / 0.9 / (tv * asp)) + 0;
      ovCam.left = -asp; ovCam.right = asp; ovCam.top = 1; ovCam.bottom = -1; ovCam.updateProjectionMatrix();
      codeLine.scale.set(asp * 2, asp * 2 * 128 / 2048, 1);
      var ph = renderer.domElement.height; var sc = ph / (2 * tv); sparkU.uScale.value = sc; smokeU.uScale.value = sc;
      uComp.uRes.value.set(renderer.domElement.width, renderer.domElement.height);
      buildRT();
    }

    // ---------------------------------------------------------------- кадр
    function render(t) {
      var i, p, u, e;
      var fl = t >= TL.boom ? Math.exp(-(t - TL.boom) / 0.2) : 0;                 // вспышка на 2.30
      var charge = smooth(1.95, TL.boom, t) * (t < TL.boom ? 1 : 0);                // «накопление» перед взрывом
      var rk = ringLevel(t), rgb;
      // камера: плавный подъезд, лёгкое покачивание (видна объёмность) и тряска на глитче
      var sway = reduce ? 0.04 : 0.11, a = sway * Math.sin(t * 1.25 - 0.5) * smooth(0.9, 1.6, t), shake = 0;
      if (t >= TL.boom && t < TL.glitchEnd + 0.1) shake = (reduce ? 4 : 16) * (1 - (t - TL.boom) / 0.42);
      var d = dist * (1.055 - 0.055 * smooth(0, 4, t)) / dbg.zoom;
      cam.position.set(Math.sin(a) * d + (shake > 0 ? (hash(Math.floor(t * 60)) - 0.5) * shake : 0), 45 * Math.sin(t * 0.9) * smooth(1, 2, t) + (shake > 0 ? (hash(Math.floor(t * 60) + 7) - 0.5) * shake : 0), Math.cos(a) * d);
      cam.position.x += dbg.ox; cam.position.y += dbg.oy; cam.lookAt(dbg.ox, -6 + dbg.oy, 0);
      // кольцо
      outerArcs.forEach(function (arc, k) {
        var lv2 = clamp(rk * 1.5 - arc.h * 0.7, 0, 1); if (rk < 1) lv2 *= hash(Math.floor(t * 50) + k * 3.1) > 0.15 ? 1 : 0.3;
        var boost = 2.2 + 3.0 * fl + 1.2 * charge; arc.mat.color.setRGB(0.2 * lv2 * boost, 0.85 * lv2 * boost, 1.0 * lv2 * boost);
      });
      innerRings.forEach(function (r) { r.grp.rotation.z = t * r.w; var k = clamp(rk * 1.3 - 0.2, 0, 1) * (0.4 + 0.6 * smooth(0.5, 1.4, t)); r.mat.color.setRGB(0.1 * k * (1 + 2 * fl), 0.7 * k * (1 + 2 * fl) * r.base * 2, 1.0 * k * (1 + 2 * fl) * r.base * 2); });
      ringGrp.userData.ticks.color.setRGB(0.1 * rk, 0.5 * rk * (1 + fl * 2), 0.7 * rk * (1 + fl * 2));
      ringGrp.rotation.y = 0.06 * Math.sin(t * 0.8); ringGrp.rotation.x = 0.04 * Math.sin(t * 0.6 + 1);
      // гало
      var hp = smooth(TL.arrC - 0.05, TL.arrC + 0.12, t) * 0.5 + 0.4 * Math.exp(-Math.abs(t - TL.arrC) * 14) + 0.25 * Math.exp(-Math.abs(t - TL.arrL) * 14) + 0.25 * Math.exp(-Math.abs(t - TL.arrR) * 14);
      halo.material.opacity = clamp((rk * 0.12 + hp * 0.38) * smooth(TL.ring, 0.25, t) + fl * 0.55 + charge * 0.2, 0, 1.0) * (t < 1.15 ? rk : 1);
      // стрелки: вылет из круга с перелётом, раскалённые -> хром
      pieces.forEach(function (pc) {
        u = (t - pc.t0) / TL.arrDur; pc.grp.visible = u > 0;
        if (u <= 0) return;
        e = easeOutBack(u, 1.7); var ec = clamp(u, 0, 1), k = Math.min(Math.max(e, 0), 1.12);
        pc.grp.position.set(0, 0, 0);
        var f = 1 - ec; pc.grp.position.set(0, 30 * f * (1 - k) * 0, -150 * f);
        var sc = lerp(0.12, 1, Math.min(ec * 1.0, 1)) * (1 + (e - ec) * 0.25); pc.grp.scale.set(sc, sc, sc);
        pc.grp.rotation.set(0, pc.spinY * f * f, pc.spinZ * f * f);
        pc.grp.userData.heat = Math.max(0, 1 - ec) * 1.0 + Math.exp(-(t - pc.t0 - TL.arrDur) * 6) * (t > pc.t0 + TL.arrDur ? 0.6 : 0);
        pc.l1.material.color.setRGB(0.55 + pc.grp.userData.heat * 2, 0.9 + pc.grp.userData.heat * 2, 1.0 + pc.grp.userData.heat * 2);
        pc.l2.material.color.setRGB(0.05 + fl * 0.3, 0.45 + fl, 0.75 + fl);
      });
      var heat = 0; pieces.forEach(function (pc) { if (pc.grp.userData.heat > heat) heat = pc.grp.userData.heat; });
      var neon = 0.35 + 0.25 * Math.sin(t * 2.2) + 1.4 * fl + 0.7 * charge + heat * 0.9;
      matChrome.emissiveIntensity = 0.03 + neon * 0.1; matCap.emissiveIntensity = 0.05 + neon * 0.16 + 0.5 * (hash(Math.floor(t * 18)) > 0.8 && t > 1.2 && t < 2.6 ? 1 : 0);
      matPlate.emissiveIntensity = fl * 0.3; matPlateEdge.emissiveIntensity = 0.04 + fl * 1.2;
      mLet.emissiveIntensity = 0.02 + fl * 0.9 + charge * 0.35; mLetFace.emissiveIntensity = fl * 0.35; mStu.emissiveIntensity = 0.03 + fl * 0.8 + charge * 0.35;
      cyanL.intensity = 1.2 + 1.6 * fl + 0.6 * charge + 0.4 * rk; blueL.intensity = 0.8 + 1.0 * fl;
      // буквы
      letters.forEach(function (L, k) {
        var uu = (t - L.t0) / 0.2, vis = uu > 0 && (uu > 0.55 || hash(Math.floor(t * 70) + k * 5) > 0.45);
        L.grp.visible = vis; if (!vis) return;
        var q = clamp(uu, 0, 1); L.grp.scale.set(1, lerp(0.25, 1, q), lerp(0.2, 1, q)); L.grp.position.z = (1 - q) * -40;
      });
      sideLines.forEach(function (s) { var q = smooth(TL.boom - 0.15, TL.boom + 0.2, t); s.m.visible = q > 0; s.m.scale.x = Math.max(q, 0.001); s.m.position.x = s.x0 - s.side * s.w * 0.5 * (1 - q); s.m.material.color.setRGB(0.1 + fl, 0.8 + fl * 2, 1 + fl * 2); });
      // блик по тексту (положение и панорама голоса — из одного таймлайна)
      var gp = glintP(t), gAct = t >= TL.glint0 && t <= TL.glint1 + 0.05 ? 1 : 0, gx = lerp(-300, 300, gp);
      glintU.value.set(gx, 22, gAct * 2.6);
      star.position.x = gx; star.position.y = -187 + 10 * Math.sin(gp * Math.PI); star.material.opacity = gAct * Math.sin(Math.PI * clamp(gp, 0, 1)) * 0.9;
      star.scale.setScalar(120 + 80 * Math.sin(Math.PI * clamp(gp, 0, 1)));
      // молнии, искры, дым
      var bi = 0;
      if (t >= TL.arrC && t < TL.boom) bi = 0.3 + 0.35 * Math.exp(-Math.abs(t - TL.arrC) * 4) + 0.45 * smooth(1.8, TL.boom, t);
      else if (t >= TL.boom && t < TL.glitchEnd) bi = 1;
      else if (t >= TL.glitchEnd && t < 3.2) bi = 0.3 * (1 - smooth(2.62, 3.2, t));
      else if (t >= 3.2) bi = hash(Math.floor(t * 6)) > 0.8 ? 0.12 : 0;
      updateBolts(t, reduce ? bi * 0.6 : bi);
      sparkU.uTime.value = t; smokeU.uTime.value = t; smokeU.uAmt.value = 0.28 * smooth(2.55, 3.1, t);
      // код-строка
      var ct = clamp((t - 0.15) / 0.9, 0, 1), cvis = t > 0.18 && t < 1.12;
      codeTex.offset.x = lerp(0, 3300 / 4096, ct);
      var cfl = t > 0.95 ? (hash(Math.floor(t * 50)) > 0.5 ? 1 : 0.1) : 1;
      codeMat.opacity = cvis ? 0.95 * smooth(0.18, 0.3, t) * cfl : 0; codeLine.visible = cvis;
      codeLine.scale.y = (codeLine.scale.x * 128 / 2048) * (t > 1.0 ? 1 - smooth(1.0, 1.12, t) * 0.9 : 1);
      // глитч / пост-эффекты
      var gl = 0;
      if (t >= TL.boom && t < TL.glitchEnd) { var gk = (t - TL.boom) / (TL.glitchEnd - TL.boom); gl = (hash(Math.floor(t * 40)) > 0.22 * gk ? 1 : 0.35) * (1 - gk * 0.55); }
      else if (t > 1.9 && t < TL.boom) gl = hash(Math.floor(t * 30)) > 0.86 ? 0.35 : 0;
      else if (t > TL.arrC && t < TL.arrC + 0.14) gl = hash(Math.floor(t * 50)) > 0.5 ? 0.3 : 0;
      if (reduce) gl *= 0.4;
      uComp.uGlitch.value = gl; uComp.uChroma.value = 0.0012 + 0.004 * fl + 0.002 * charge;
      uComp.uBloom.value = 0.7 + 0.9 * fl + 0.4 * charge; uComp.uFlash.value = 0.04 * fl * (reduce ? 0.5 : 1) + 0.02 * charge;
      uComp.uFade.value = fadeK(t); uComp.uTime.value = t; uComp.uSeed.value = 0;
      // проходы
      renderer.setRenderTarget(rtScene); renderer.clear(true, true, true);
      renderer.render(scene, cam); renderer.clearDepth(); renderer.render(ovScene, ovCam);
      uBright.tMap.value = rtScene.texture; pass(matBright, lv[0].a);
      for (i = 0; i < 4; i++) {
        if (i > 0) { uCopy.tMap.value = lv[i - 1].a.texture; uCopy.uTexel.value.set(1 / lv[i - 1].w, 1 / lv[i - 1].h); pass(matCopy, lv[i].a); }
        uBlur.tMap.value = lv[i].a.texture; uBlur.uDir.value.set(1.4 / lv[i].w, 0); pass(matBlur, lv[i].b);
        uBlur.tMap.value = lv[i].b.texture; uBlur.uDir.value.set(0, 1.4 / lv[i].h); pass(matBlur, lv[i].a);
      }
      uComp.tScene.value = rtScene.texture; uComp.tB0.value = lv[0].a.texture; uComp.tB1.value = lv[1].a.texture; uComp.tB2.value = lv[2].a.texture; uComp.tB3.value = lv[3].a.texture;
      pass(matComp, null);
    }
    function clear() { renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1); renderer.clear(); }
    function dispose() {
      try { disposeRT(); pm.dispose(); renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss(); } catch (e) {}
    }
    resize();
    return { render: render, resize: resize, clear: clear, dispose: dispose, renderer: renderer, halfFloat: halfOk, scene: scene, dbg: dbg };
  }

  window.SplashScene = { create: create, TL: TL, setEnd: setEnd, glintP: glintP, fadeK: fadeK, easeInOutSine: easeInOutSine };
}());
