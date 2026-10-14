// NEXA 3D-миссии. Three.js грузится только при START MISSION и выгружается целиком после миссии.
// Публичный API: Missions.start(taskId, {playSfx, onComplete, onExit, onStage, onCutscene}), Missions.get/setQuality().
(function () {
  'use strict';

  const THREE_URL = 'assets/lib/three.min.js', THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'; // своя копия (r128, MIT) + запасной CDN
  const QUALITY = {
    LOW:    { pr: 1,    shadows: false, fog: 0.04, fx: 'none',  aa: false, lamps: 2, npcs: 2, maxEnemies: 6,  parts: 6 },
    MEDIUM: { pr: 1.25, shadows: false, fog: 0.035, fx: 'lite', aa: false, lamps: 3, npcs: 4, maxEnemies: 9,  parts: 12 },
    HIGH:   { pr: 1.5,  shadows: true,  fog: 0.03, fx: 'full',  aa: true,  lamps: 4, npcs: 4, maxEnemies: 12, parts: 20, bloom: 0.35, tone: 0.5 },
    ULTRA:  { pr: 2,    shadows: true,  shadowHigh: true, fog: 0.028, fx: 'full', aa: true, lamps: 5, npcs: 4, maxEnemies: 12, parts: 28, bloom: 0.55, tone: 0.7 }   // maxEnemies как у HIGH: баланс боя не меняется
  };
  const PLAYER_R = 0.3;
  const KL = (id) => (window.NexaSettings ? NexaSettings.keyLabel(id) : '').replace(/^[LR]-/, '');   // подпись клавиши действия с учётом переназначения
  const EYE = 1.35; // body cam: камера на уровне груди

  const isTouch = () => matchMedia('(pointer: coarse)').matches || /[?&]touch=1/.test(location.search); // ?touch=1 — проверка мобильного режима на ПК
  const wrap = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  const smooth = (k) => k * k * (3 - 2 * k);
  const lerp = (a, b, k) => a + (b - a) * k;

  function getQuality() {
    let saved = null;
    try { saved = localStorage.getItem('quality'); } catch (e) {}
    if ((saved === 'AUTO' || !QUALITY[saved]) && window.NexaSettings) return NexaSettings.autoPreset();   // AUTO: по устройству (телефон, слабая видеокарта → ниже)
    return QUALITY[saved] ? saved : (isTouch() ? 'LOW' : 'MEDIUM');
  }
  function getQualitySaved() { let v = null; try { v = localStorage.getItem('quality'); } catch (e) { /* без хранилища */ } return (v === 'AUTO' || QUALITY[v]) ? v : 'AUTO'; }   // то, что выбрано в настройках (AUTO — по устройству)
  function setQuality(q) {
    if (!QUALITY[q] && q !== 'AUTO') return;
    try { localStorage.setItem('quality', q); } catch (e) {}
  }

  // чувствительность обзора: множитель 0.25–3, общий для мыши и тача
  let sens = 1;
  try { const s = parseFloat(localStorage.getItem('sens')); if (s >= 0.25 && s <= 3) sens = s; } catch (e) {}
  function getSens() { return sens; }
  function setSens(v) {
    v = parseFloat(v);
    if (!(v >= 0.25 && v <= 3)) return;
    sens = v;
    try { localStorage.setItem('sens', String(v)); } catch (e) {}
  }

  // кровь: 'red' (по умолчанию) | 'dark' (чёрная, в стиле игры) | 'off'; действует со следующей миссии
  let blood = 'red';
  try { const b = localStorage.getItem('blood'); if (b === 'red' || b === 'dark' || b === 'off') blood = b; } catch (e) {}
  function getBlood() { return blood; }
  function setBlood(v) {
    if (v !== 'red' && v !== 'dark' && v !== 'off') return;
    blood = v;
    try { localStorage.setItem('blood', v); } catch (e) {}
  }

  let threePromise = null;
  function loadThree() {
    if (window.THREE) return Promise.resolve();
    if (threePromise) return threePromise;
    threePromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      const timer = setTimeout(() => { reject(new Error('timeout')); }, 25000);
      s.src = THREE_URL;
      s.onload = () => { clearTimeout(timer); resolve(); };
      s.onerror = () => { // локальной копии нет (file://, битая сборка) — пробуем CDN
        const s2 = document.createElement('script');
        s2.src = THREE_CDN;
        s2.onload = () => { clearTimeout(timer); resolve(); };
        s2.onerror = () => { clearTimeout(timer); threePromise = null; reject(new Error('load')); };
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    });
    return threePromise;
  }

  let current = null;

  // ---------------------------------------------------------------- Run
  class Run {
    constructor(taskId, opts) {
      this.taskId = taskId;
      this.opts = opts || {};
      window.Missions._core.voice && window.Missions._core.voice.prefetch(taskId);
      this.mission = MISSIONS[taskId];
      this.qName = getQuality();
      this.q = window.NexaSettings ? NexaSettings.gfx(QUALITY[this.qName]) : QUALITY[this.qName];   // пресет + расширенные настройки графики (js/settings.js)
      this.touch = isTouch();
      this.disposed = false;
      this.listeners = [];
      this.intervals = [];
      this.tw = [];
      this.waiters = [];
      this.gazers = [];
      this.hooks = [];
      this.npcs = [];
      this.interactables = [];
      this.colliders = [];
      this.lamps = [];
      this.sig = {};
      this.sigRes = {};
      this.matCache = {};
      this.cineDepth = 0;
      this.ending = false;
      this.entered = false;
      this.pausedUser = false;
      this.rotatePause = false;
      this.keys = {};
      this.stick = { x: 0, y: 0, id: null };
      this.runHeld = false;
      this.p = { x: 0, z: 0, yaw: 0, pitch: 0, phase: 0, moving: 0 };
      this.shakeAmp = 0;
      this.lightLevel = 1;
      this.time = 0;
      this.frames = 0;
      this.frameAcc = 0;
      this.pr = this.q.pr;
      this.target = null;
    }

    on(target, ev, fn, o) {
      target.addEventListener(ev, fn, o);
      this.listeners.push([target, ev, fn, o]);
    }
    qs(sel) { return this.layer.querySelector(sel); }
    get locked() { return this.cineDepth > 0 || this.ending || !this.entered || !!this.dead; }
    get paused() { return this.pausedUser || this.rotatePause; }
    alive() { return !this.disposed; }

    // ------------------------------------------------------------ DOM
    buildDom() {
      const layer = document.createElement('div');
      layer.id = 'mission';
      layer.className = 'mission fx-' + this.q.fx + (this.touch ? ' touch' : '');
      if (window.NexaSettings) { NexaSettings.applyTouch(layer); this.setOff = NexaSettings.onChange(() => { if (!this.disposed) NexaSettings.applyTouch(layer); }); }   // слой — левша, масштаб и прозрачность кнопок
      if (String(this.taskId) === '48') layer.setAttribute('translate', 'no');   // финал: весь текст миссии — английский (и «МИССИЯ ВЫПОЛНЕНА»/титры — как написаны), рантайм-i18n не трогает
      layer.innerHTML =
        '<canvas class="m-canvas"></canvas><div class="m-fx"></div>' +
        '<div class="m-bar top"></div><div class="m-bar bot"></div>' +
        '<div class="m-hud"><div class="m-obj"><small>OBJECTIVE</small><span></span></div>' +
        '<div class="m-meter"><span></span><div><i></i></div></div>' +
        '<div class="m-hint"></div><button type="button" class="m-pausebtn" aria-label="Pause">II</button></div>' +
        '<div class="m-cross"><i></i><span></span></div><div class="m-sub"></div>' +
        '<div class="m-hurt"><i class="t"></i><i class="r"></i><i class="b"></i><i class="l"></i></div><div class="m-gore"></div><div class="m-toast"></div>' +
        '<div class="m-card"><small></small><h1></h1><p></p></div><div class="m-cap"></div><div class="m-skip">[SPACE / A] SKIP</div>' +
        '<div class="m-vitals"><div class="m-hp"><small>INTEGRITY</small><div><i></i></div><b>100</b></div>' +
        '<div class="m-ammo"><small></small><b></b></div></div>' +
        '<div class="m-touchui"><div class="m-zone l"></div><div class="m-zone r"></div><div class="m-stick"><i></i></div>' +
        '<button type="button" class="m-btn m-e">E</button><button type="button" class="m-btn m-run">RUN</button>' +
        '<button type="button" class="m-btn m-fire">FIRE</button><button type="button" class="m-btn m-aim">AIM</button>' +
        '<button type="button" class="m-btn m-rel">R</button><button type="button" class="m-btn m-swap">SWAP</button></div>' +
        '<div class="m-fade" style="opacity:1"></div><div class="m-flash"></div>' +
        '<div class="m-pause"><div><p class="eyebrow">MISSION PAUSED</p><p class="m-ctl"></p><button type="button" class="action centered m-resume">[RESUME]</button><button type="button" class="action centered secondary m-sets">[SETTINGS]</button>' +
        '<button type="button" class="action centered secondary m-abort">[ABORT MISSION]</button></div></div>' +
        '<div class="m-rotate"><div><p class="eyebrow">NEXA INDUSTRIES</p><h2>PLEASE ROTATE DEVICE</h2><p class="muted">MISSION REQUIRES LANDSCAPE ORIENTATION</p></div></div>' +
        '<div class="m-load"><div class="m-load-in"><p class="eyebrow">NEXA INDUSTRIES</p><h2>MISSION INITIALIZATION</h2>' +
        '<p class="m-load-msg">LOADING ENVIRONMENT...</p><p class="m-load-bar">[░░░░░░░░░░░░░░░░░░░░] 0%</p>' +
        '<button type="button" class="action centered primary m-enter" hidden>[ ENTER ]</button>' +
        '<button type="button" class="action centered secondary m-back" hidden>[RETURN TO TERMINAL]</button></div></div>' +
        '<div class="m-end"><div><h2></h2><p></p><div class="m-opts" hidden><button type="button" class="action centered m-retry"></button>' +
        '<button type="button" class="action centered secondary m-skipsec"></button></div></div></div>';
      document.body.appendChild(layer);
      document.body.classList.add('in-mission');
      this.layer = layer;
      this.canvas = this.qs('.m-canvas');
      this.sub = this.qs('.m-sub');
      this.prompt = this.qs('.m-cross span');
      const hintEl = this.qs('.m-hint');
      hintEl.textContent = this.touch ? '' : ['forward', 'left', 'back', 'right'].map(KL).join('') + ' MOVE  |  MOUSE LOOK  |  ' + KL('use') + ' INTERACT  |  ' + KL('run') + ' RUN  |  ESC PAUSE';
      // подсказка клавиш видна ~12 с после каждой смены текста и потом гаснет; полный список — в меню паузы
      const hintHide = () => { if (/(cine|bars|cinema)/.test(this.layer.className)) this.hintTm = setTimeout(hintHide, 1500); else hintEl.classList.remove('show'); };   // во время катсцены отсчёт стоит
      const hintShow = this.hintPoke = () => { if (!hintEl.textContent) return; hintEl.classList.add('show'); clearTimeout(this.hintTm); this.hintTm = setTimeout(hintHide, 12000); };
      new MutationObserver(hintShow).observe(hintEl, { childList: true, characterData: true, subtree: true });
      hintShow();
      // viewport без zoom только на время миссии
      const meta = document.querySelector('meta[name=viewport]');
      if (meta) { this.metaOld = meta.getAttribute('content'); meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'); }
      this.on(layer, 'touchmove', (e) => { if (!e.target.closest('.m-pause, .m-load')) e.preventDefault(); }, { passive: false });
      this.on(layer, 'contextmenu', (e) => e.preventDefault());
    }

    progress(k, msg) {
      const n = Math.round(Math.max(0, Math.min(1, k)) * 20);
      this.qs('.m-load-bar').textContent = '[' + '█'.repeat(n) + '░'.repeat(20 - n) + '] ' + Math.round(k * 100) + '%';
      if (msg) this.qs('.m-load-msg').textContent = msg;
    }
    // rAF не тикает в фоновой вкладке — таймаут не даёт загрузке зависнуть
    nextFrame() {
      return new Promise((r) => {
        let done = false;
        const go = () => { if (!done) { done = true; r(); } };
        requestAnimationFrame(go);
        setTimeout(go, 120);
      });
    }

    waitLandscape() {
      const portrait = () => this.touch && innerHeight > innerWidth;
      if (!portrait()) return Promise.resolve();
      this.qs('.m-rotate').classList.add('on');
      return new Promise((resolve) => {
        const check = () => {
          if (this.disposed) return resolve();
          if (!portrait()) { this.qs('.m-rotate').classList.remove('on'); window.removeEventListener('resize', check); resolve(); }
        };
        window.addEventListener('resize', check);
        this.listeners.push([window, 'resize', check]);
      });
    }

    // ------------------------------------------------------------ boot
    async start() {
      this.buildDom();
      const back = this.qs('.m-back');
      try {
        this.progress(0.05, 'LOADING ENVIRONMENT...');
        // не оставляем интерфейс «мёртвым» при долгой загрузке
        let dots = 0;
        this.intervals.push(setInterval(() => {
          const el = this.qs('.m-load-msg');
          if (el && !this.entered) el.textContent = (dots++ % 2) ? 'INITIALIZING...' : 'LOADING ENVIRONMENT...';
        }, 2500));
        await this.waitLandscape();
        if (this.disposed) return;
        this.progress(0.15);
        const core = window.Missions && window.Missions._core;
        const loaded = await Promise.all([loadThree(), core && core.loadModels ? core.loadModels() : null, core && core.loadSamples ? core.loadSamples() : null, core && core.loadSurfaces ? core.loadSurfaces(this.taskId) : null, core && core.loadProps ? core.loadProps(this.taskId) : null, core && core.loadToys ? core.loadToys() : null]); // модели оружия, звуки (assets/*.mp3) и текстуры пола/стен грузятся параллельно с three.js
        if (this.disposed) return;
        this.progress(0.5);
        await this.nextFrame();
        this.initGL();
        this.initSurfaces && this.initSurfaces(loaded[3]);
        this.initProps && this.initProps(loaded[4]);
        try { this.initToys && this.initToys(loaded[5]); } catch (e) { console.warn('[toys]', e); }
        this.progress(0.7);
        await this.nextFrame();
        this.mission.build(this);
        try { this.dress && this.dress(); } catch (e) { console.warn('[dress]', e); }
        this.progress(0.95);
        await this.nextFrame();
        this.resize();
        this.render();            // прогрев шейдеров до входа
        this.progress(1, 'SYSTEM READY');
        const enter = this.qs('.m-enter');
        enter.hidden = false;
        enter.addEventListener('click', () => this.enter(), { once: true });
        this.opts.playSfx && this.opts.playSfx('notification');
      } catch (err) {
        console.error('[mission]', err);
        this.qs('.m-load-msg').textContent = 'ENVIRONMENT FAULT — CHECK CONNECTION';
        back.hidden = false;
        back.addEventListener('click', () => this.finish(false), { once: true });
      }
    }

    enter() {
      if (this.disposed) return;
      this.entered = true;
      this.snd && this.snd.resume(); // клик ENTER — жест игрока: разрешаем звук
      this.qs('.m-load').classList.add('gone');
      if (this.touch) {
        try { const f = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); f && f.catch && f.catch(() => {}); } catch (e) {}
        try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
        try { navigator.wakeLock && navigator.wakeLock.request('screen').then((l) => { if (this.disposed) l.release(); else this.wake = l; }).catch(() => {}); } catch (e) {} // экран не гаснет во время миссии
      } else {
        this.requestLock();
      }
      this.bindInput();
      this.hintPoke && this.hintPoke();   // 12 с подсказки считаем с момента ENTER, а не с загрузки
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
      const cin = CINEMA[this.taskId];
      (async () => {
        if (cin && cin.intro && this.cinematic) await this.cinematic(cin.intro(this), { title: this.mission.title, task: this.taskId });
        if (!this.disposed) await this.mission.play(this);
      })().catch((e) => { if (!this.disposed) console.error('[mission script]', e); });
    }

    requestLock() {
      try { const r = this.canvas.requestPointerLock && this.canvas.requestPointerLock(); r && r.catch && r.catch(() => {}); } catch (e) {}
    }

    // ------------------------------------------------------------ WebGL
    initGL() {
      const T = THREE;
      this.renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pr));
      this.renderer.shadowMap.enabled = this.q.shadows;
      if (this.q.shadows) this.renderer.shadowMap.type = this.q.shadowHigh ? T.PCFSoftShadowMap : T.PCFShadowMap;
      this.scene = new T.Scene();
      this.baseFov = this.q.fovUser || 90; // широкий обзор: оружие и руки остаются снизу, на горизонте их не видно
      this.camera = new T.PerspectiveCamera(this.baseFov, 1, 0.05, 80);
      this.camera.rotation.order = 'YXZ';
      this.scene.add(this.camera);
      this.initBody();
      this.initPost();
      this.amb = new T.AmbientLight(0xffffff, 0.8);
      this.ambBase = 0.8;
      this.scene.add(this.amb);
      this.torch = new T.PointLight(0xffffff, 0, 9, 2);
      this.camera.add(this.torch);
      this.lampMat = new T.MeshBasicMaterial({ color: 0xffffff });
      this.g = {
        torso: new T.BoxGeometry(0.36, 0.62, 0.2), head: new T.SphereGeometry(0.14, 10, 8),
        arm: new T.BoxGeometry(0.09, 0.56, 0.09), leg: new T.BoxGeometry(0.11, 0.8, 0.11), box: new T.BoxGeometry(1, 1, 1)
      };
      this.npcMat = new T.MeshLambertMaterial({ color: 0x040404 });
      this.setFog(this.q.fog, 0x1c1c1c);
    }
    setFog(density, color) {
      this.scene.fog = new THREE.FogExp2(color, density);
      this.scene.background = new THREE.Color(color);
    }
    // ------------------------------------------------------------ body cam: тело и руки от первого лица
    initBody() {
      const T = THREE, body = new T.Group();
      const part = (w, h, d, color, order, x, y, z, parent) => {
        const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshLambertMaterial({ color, fog: false, depthTest: false }));
        m.renderOrder = order; m.position.set(x, y, z); m.frustumCulled = false; (parent || body).add(m); return m;
      };
      const tor = this.fpTorso && this.fpTorso();                            // торс и таз из модели врага (actors.js), чуть позади камеры; без модели — плита
      if (tor) body.add(tor); else {
        part(0.52, 0.62, 0.28, 0x0a0a0a, 990, 0, -0.64, -0.12);             // торс (верхний край ниже поля зрения на горизонте): чёрный стикмен
        part(0.56, 0.05, 0.3, 0x1b1b1b, 991, 0, -0.9, -0.12);               // ремень
      }
      this.legs = [-1, 1].map((s) => {
        const g = new T.Group(); g.position.set(s * 0.13, -0.95, -0.1); body.add(g);
        part(0.17, 0.85, 0.2, 0x0c0c0c, 991, 0, -0.42, 0, g);
        part(0.19, 0.1, 0.34, 0x050505, 992, 0, -0.88, -0.08, g);         // ботинок
        return g;
      });
      this.body = body; this.fpb = null;
      body.rotation.order = 'YXZ';
      this.scene.add(body); // тело следует за поворотом, но не за наклоном головы — вниз видны торс, руки и ноги
      this.buildRig && this.buildRig(); // руки и оружие (combat.js)
    }
    updateBody(dt, vel) {
      const p = this.p, ph = p.phase, mv = p.moving;
      this.bodyLag = lerp(this.bodyLag || 0, Math.max(-0.12, Math.min(0.12, vel * 0.02)), 0.15);
      this.body.position.copy(this.camera.position);
      this.body.rotation.y = p.yaw + this.bodyLag;
      this.body.rotation.x = p.pitch * 0.2;
      this.legs.forEach((g, i) => { g.rotation.x = Math.sin(ph + (i ? 0 : Math.PI)) * 0.5 * mv; });
      this.body.visible = !this.camFree;
      this.updateTorsoBlood && this.updateTorsoBlood(dt);
      this.updateRig && this.updateRig(dt, vel);
    }

    // ------------------------------------------------------------ постобработка: fisheye, CA, зерно, виньетка, motion blur
    initPost() {
      const T = THREE, full = this.q.fx !== 'none';
      const rtOpt = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, depthBuffer: true };
      this.rt = null;
      if (this.q.aaMode === 'msaa' && this.renderer.capabilities.isWebGL2 && T.WebGLMultisampleRenderTarget) {   // настоящее сглаживание сцены (WebGL2)
        try { this.rt = new T.WebGLMultisampleRenderTarget(4, 4, rtOpt); this.rt.samples = 4; } catch (e) { this.rt = null; }
      }
      if (!this.rt) this.rt = new T.WebGLRenderTarget(4, 4, rtOpt);
      this.fxU = {
        tDiffuse: { value: this.rt.texture }, uK: { value: 0.2 }, uBlur: { value: new T.Vector2() },
        uCA: { value: full ? 0.0025 : 0 }, uTime: { value: 0 }, uGrain: { value: full ? 0.06 : 0.04 }, uVig: { value: 0.7 }, uGain: { value: 1.22 },
        uShk: { value: new T.Vector4(0.5, 0.5, 0, 0) }, uCon: { value: 0 }, uAsp: { value: 1.78 },
        uExp: { value: 0 }, uHaz: { value: new T.Vector4(0.5, 0.5, 0, 0) },   // взрывы (explosions.js): засвет экспозиции и марево над огнём
        uTexel: { value: new T.Vector2(1 / 640, 1 / 360) }, uFxaa: { value: this.q.aaMode === 'fxaa' ? 1 : 0 }, uBloom: { value: this.q.bloom || 0 }, uTone: { value: this.q.tone || 0 },
        uSat: { value: this.q.sat === undefined ? 1 : this.q.sat }, uCon2: { value: this.q.contrast === undefined ? 1 : this.q.contrast },
        uUser: { value: new T.Vector4(1, 1, 1, 1) }   // множители пользователя: линза, хроматика, зерно, виньетка (настройки графики)
      };
      this.fxMat = new T.ShaderMaterial({
        uniforms: this.fxU, depthTest: false, depthWrite: false,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: [
          'precision mediump float; varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uK, uCA, uTime, uGrain, uVig, uGain, uCon, uAsp, uExp, uFxaa, uBloom, uTone, uSat, uCon2; uniform vec2 uBlur, uTexel; uniform vec4 uShk, uHaz, uUser;',
          'vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }',
          'float rnd(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }',
          'vec3 tap(vec2 uv, vec2 off){ vec3 c; c.r = texture2D(tDiffuse, uv + off * (1.0 + uCA * uUser.y * 40.0)).r; c.g = texture2D(tDiffuse, uv).g; c.b = texture2D(tDiffuse, uv - off * (1.0 + uCA * uUser.y * 40.0)).b; return c; }',
          'void main(){',
          '  vec2 p = vUv * 2.0 - 1.0; float r2 = dot(p, p);',
          '  float kk = uK * uUser.x; vec2 q = p * (1.0 + kk * r2) / (1.0 + kk * 2.0); vec2 uv = q * 0.5 + 0.5;',
          '  float rg = 0.0; if (uShk.w > 0.001) { vec2 dd = (vUv - uShk.xy) * vec2(uAsp, 1.0); float dl = length(dd); float wd = 0.03 + uShk.z * 0.07; rg = exp(-pow((dl - uShk.z) / wd, 2.0)) * uShk.w; uv += normalize(dd + vec2(1e-5)) / vec2(uAsp, 1.0) * rg * 0.045; }',
          '  if (uHaz.w > 0.001) { vec2 hd = (vUv - uHaz.xy) * vec2(uAsp, 1.0); float hm = (1.0 - smoothstep(0.0, uHaz.z, length(hd))) * uHaz.w; float p1 = mod(uTime * 7.0, 6.2831853), p2 = mod(uTime * 16.1, 6.2831853), p3 = mod(uTime * 11.9, 6.2831853); uv += vec2(sin(vUv.y * 46.0 + vUv.x * 21.0 - p1) + 0.6 * sin(vUv.y * 105.8 - p2 + 1.7), 0.35 * cos(vUv.y * 78.2 - vUv.x * 17.0 - p3)) * hm * 0.0042; }',
          '  vec2 ca = q * uCA * uUser.y * (0.4 + r2);',
          '  vec3 col = tap(uv, ca);',
          '  if (uFxaa > 0.5) { vec3 cN = texture2D(tDiffuse, uv + vec2(0.0, uTexel.y)).rgb, cS = texture2D(tDiffuse, uv - vec2(0.0, uTexel.y)).rgb, cE = texture2D(tDiffuse, uv + vec2(uTexel.x, 0.0)).rgb, cW = texture2D(tDiffuse, uv - vec2(uTexel.x, 0.0)).rgb; vec3 lw = vec3(0.299, 0.587, 0.114); float lM = dot(col, lw), lN = dot(cN, lw), lS = dot(cS, lw), lE = dot(cE, lw), lW = dot(cW, lw); float lMx = max(lM, max(max(lN, lS), max(lE, lW))), lMn = min(lM, min(min(lN, lS), min(lE, lW))); float ed = lMx - lMn; col = mix(col, (cN + cS + cE + cW + col) * 0.2, clamp((ed - max(0.035, lMx * 0.1)) * 7.0, 0.0, 0.85)); }',
          '  float bl = length(uBlur);',
          '  if (bl > 0.0015) { float stp = bl > 0.1 ? 12.0 : (bl > 0.05 ? 8.0 : 4.0); float jt = rnd(vUv * 731.0 + fract(uTime) * 13.0) - 0.5; vec3 acc = col; for (int i = 1; i < 13; i++) { if (float(i) > stp) break; float f = (float(i) + jt) / stp - 0.5; acc += tap(uv + uBlur * f, ca); } col = acc / (stp + 1.0); }',
          '  if (uCon > 0.002) { vec3 za = col; for (int i = 1; i < 6; i++) { za += tap(uv - (uv - 0.5) * 0.014 * uCon * float(i), ca); } col = za / 6.0; col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), uCon * 0.75); }',
          '  float vig = 1.0 - (uVig * uUser.w + uCon * 0.5) * smoothstep(0.3, 1.5, r2);',
          '  float g = rnd(vUv * 900.0 + fract(uTime) * 37.0) - 0.5;',
          '  col = col * uGain * (1.0 + uExp * 0.9) + 0.03 + rg * 0.1 + uExp * 0.1;',
          '  if (uBloom > 0.001) { vec3 bl = vec3(0.0); vec2 b1 = uTexel * 9.0, b2 = uTexel * 24.0; for (int i = 0; i < 6; i++) { float a = float(i) * 1.0471976 + 0.4; vec2 d = vec2(cos(a), sin(a)); bl += max(texture2D(tDiffuse, uv + d * b1).rgb - 0.58, 0.0) * 0.12 + max(texture2D(tDiffuse, uv + d * b2).rgb - 0.58, 0.0) * 0.07; } col += bl * uBloom * 3.2; }',
          '  if (uTone > 0.001) col = mix(col, aces(col * 1.12), uTone);',
          '  float lum = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(vec3(lum), col, uSat); col = (col - 0.5) * uCon2 + 0.5;',
          '  col = col * vig + g * uGrain * uUser.z;',
          '  gl_FragColor = vec4(col, 1.0);',
          '}'
        ].join('\n')
      });
      this.fxGeo = new T.PlaneBufferGeometry(2, 2);
      this.fxMesh = new T.Mesh(this.fxGeo, this.fxMat); this.fxMesh.frustumCulled = false;
      this.fxScene = new T.Scene(); this.fxScene.add(this.fxMesh);
      this.fxCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }
    resize() {
      const w = this.layer.clientWidth || innerWidth, h = this.layer.clientHeight || innerHeight;
      this.w = w; this.h = h;
      const pr = this.q.ss ? this.pr : Math.min(window.devicePixelRatio || 1, this.pr);   // ss: масштаб рендера выше 100% — суперсэмплинг и на обычных экранах
      this.renderer.setPixelRatio(pr);
      this.renderer.setSize(w, h, false);
      this.rt.setSize(Math.max(2, Math.round(w * pr)), Math.max(2, Math.round(h * pr)));
      if (this.fxU && this.fxU.uTexel) this.fxU.uTexel.value.set(1 / Math.max(2, Math.round(w * pr)), 1 / Math.max(2, Math.round(h * pr)));
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    render() {
      this.fxU.uTime.value = this.time;
      { const mb = this.q.mblur === false ? 0 : 1; this.fxU.uBlur.value.set((this.blurX || 0) * mb, (this.blurY || 0) * mb); }
      if (this.fxU.uUser) { const qq = this.q, tb = this.layer.classList.contains('table'); this.fxU.uUser.value.set(tb ? 1 : qq.lens, qq.chroma, qq.grain, qq.vig); }   // в «столе» линза не меняется: курсор считается по uK
      this.xfPost && this.xfPost(); // взрывы (explosions.js): линза-рябь и контузия
      this.renderer.setRenderTarget(this.rt);
      this.renderer.render(this.scene, this.camera);
      this.renderOver && this.renderOver(); // игрушка в руке: рисуется поверх мира в тот же рендер-таргет (toyplay.js)
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.fxScene, this.fxCam);
    }

    // ------------------------------------------------------------ строительство мира
    mat(color) { return this.matCache[color] || (this.matCache[color] = new THREE.MeshLambertMaterial({ color })); }
    basic(color) { const k = 'b' + color; return this.matCache[k] || (this.matCache[k] = new THREE.MeshBasicMaterial({ color })); }

    box(x, y, z, w, h, d, color, solid, unlit) {
      const sk = !unlit && this.surf && this.surfKind(x, y, z, w, h, d, solid, color); // пол/стены/потолок — с текстурой (surfaces.js)
      const m = new THREE.Mesh(this.g.box, unlit ? this.basic(color) : (sk ? this.surfMat(sk, color) : this.mat(color)));
      m.position.set(x, y, z);
      m.scale.set(w, h, d);
      if (this.q.shadows && !unlit && h > 0.3) { m.castShadow = true; m.receiveShadow = true; }
      this.scene.add(m);
      let col = null;
      if (solid) { col = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: y - h / 2, y1: y + h / 2 }; this.colliders.push(col); }
      m.userData.col = col;
      return m;
    }
    glass(x, y, z, w, h, d) {
      const m = new THREE.Mesh(this.g.box, new THREE.MeshBasicMaterial({ color: 0xbbbbbb, transparent: true, opacity: 0.12, depthWrite: false }));
      m.position.set(x, y, z); m.scale.set(w, h, d);
      this.scene.add(m);
      this.colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - Math.max(d, 0.2) / 2, z1: z + Math.max(d, 0.2) / 2, y0: y - h / 2, y1: y + h / 2 });
      return m;
    }
    room(cx, cz, w, d, h, wallColor) {
      const c = wallColor || 0x8c8c8c;
      this.box(cx, -0.05, cz, w + 1, 0.1, d + 1, 0x5a5a5a, false);
      this.box(cx, h + 0.05, cz, w + 1, 0.1, d + 1, 0x3a3a3a, false);
      this.box(cx, h / 2, cz - d / 2 - 0.15, w + 0.6, h, 0.3, c, true);
      this.box(cx, h / 2, cz + d / 2 + 0.15, w + 0.6, h, 0.3, c, true);
      this.box(cx - w / 2 - 0.15, h / 2, cz, 0.3, h, d, c, true);
      this.box(cx + w / 2 + 0.15, h / 2, cz, 0.3, h, d, c, true);
      if (!this.surf) { // без текстуры пола — старая сетка
        const grid = new THREE.GridHelper(Math.max(w, d), Math.max(w, d) / 2, 0x3a3a3a, 0x3a3a3a);
        grid.position.set(cx, 0.012, cz);
        this.scene.add(grid);
      }
      this.bounds = { w, d, h, cx, cz };
    }
    lamp(x, y, z, intensity) {
      const m = new THREE.Mesh(this.g.box, this.lampMat);
      m.position.set(x, y, z); m.scale.set(0.9, 0.06, 0.35);
      this.scene.add(m);
      if (this.dressLamp) this.dressLamp(m);
      if (this.lamps.length < this.q.lamps) {
        const L = new THREE.PointLight(0xffffff, intensity || 0.7, 13, 2);
        L.position.set(x, y - 0.3, z);
        L.base = L.intensity;
        if (this.q.shadows && this.lamps.length === 0) { L.castShadow = true; L.shadow.mapSize.set(this.q.shadowHigh ? 2048 : 1024, this.q.shadowHigh ? 2048 : 1024); }
        this.scene.add(L);
        this.lamps.push(L);
      }
    }
    door(x, z, w, h, rotated) {
      const m = this.box(x, h / 2, z, rotated ? 0.2 : w, h, rotated ? w : 0.2, 0x050505, true);
      m.userData.h = h; m.userData.col.door = true;
      return m;
    }
    async openDoor(door, dur) {
      const col = door.userData.col; if (col) col.off = true;
      const y0 = door.position.y, h = door.userData.h || 2.5;
      await this.tween(dur || 1.6, (k) => { door.position.y = y0 + (h + 0.2) * k; }, smooth);
    }
    disc(x, y, z, rotY, r) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r || 0.28, 20), new THREE.MeshBasicMaterial({ color: 0x4a4a4a }));
      m.position.set(x, y, z); m.rotation.y = rotY;
      this.scene.add(m);
      return { mesh: m, pos: new THREE.Vector3(x, y, z), set: (on) => m.material.color.setHex(on ? 0xffffff : 0x4a4a4a) };
    }
    numberPlate(x, y, z, n) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#050505'; g.font = 'bold 44px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 35);
      const tex = new THREE.CanvasTexture(c);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: tex }));
      m.position.set(x, y, z);
      this.scene.add(m);
      return m;
    }
    interact(def) {
      def.pos = new THREE.Vector3(def.pos[0], def.pos[1], def.pos[2]);
      def.reach = def.reach || 2.5;
      this.interactables.push(def);
      return def;
    }
    lightsLevel(l) {
      this.lightLevel = l;
      this.amb.intensity = Math.max(this.ambBase, 0.68) * l; // локации светлее: минимальный ambient
      this.lamps.forEach((L) => { L.intensity = L.base * 1.3 * l; });
      this.lampMat.color.setScalar(0.12 + 0.88 * Math.min(1, l * 1.4));
    }
    setAmbient(v) { this.ambBase = v; this.lightsLevel(this.lightLevel); }
    spawn(x, z, yaw) { this.p.x = x; this.p.z = z; this.p.yaw = yaw || 0; this.p.pitch = 0; this.spawnPt = [x, z, yaw || 0]; this.placeCamera(0); }

    // ------------------------------------------------------------ NPC
    npc(x, z, yaw) {
      const T = THREE, g = new T.Group(), M = this.npcMat, G = this.g;
      const torso = new T.Mesh(G.torso, M); torso.position.y = 1.1;
      const head = new T.Group(); head.position.y = 1.5;
      const hm = new T.Mesh(G.head, M); hm.position.y = 0.16; head.add(hm);
      const mk = (geo, px, py, len) => { const piv = new T.Group(); piv.position.set(px, py, 0); const m = new T.Mesh(geo, M); m.position.y = -len / 2; piv.add(m); return piv; };
      const armL = mk(G.arm, -0.25, 1.38, 0.56), armR = mk(G.arm, 0.25, 1.38, 0.56);
      const legL = mk(G.leg, -0.1, 0.8, 0.8), legR = mk(G.leg, 0.1, 0.8, 0.8);
      g.add(torso, head, armL, armR, legL, legR);
      g.position.set(x, 0, z); g.rotation.y = yaw || 0;
      if (this.q.shadows) g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(g);
      const n = { g, head, armL, armR, legL, legR, yaw: yaw || 0, swing: 0, phase: 0, goal: null, tilt: 0, tiltT: 0, arm: 0, armT: 0, watch: false, speedMul: 1 };
      this.npcs.push(n);
      return n;
    }
    headPos(n) { return new THREE.Vector3(n.g.position.x, 1.55, n.g.position.z); }
    placeNpc(n, x, z) { n.g.position.x = x; n.g.position.z = z; }
    faceNow(n, x, z) { n.yaw = Math.atan2(x - n.g.position.x, z - n.g.position.z); n.g.rotation.y = n.yaw; }
    faceTarget(n, to) {
      if (to === 'player') return Math.atan2(this.p.x - n.g.position.x, this.p.z - n.g.position.z);
      return Math.atan2(to[0] - n.g.position.x, to[1] - n.g.position.z);
    }
    updateNpc(n, dt) {
      if (n.watch && n.g.visible) n.yaw = this.faceTarget(n, 'player');
      if (n.goal) {
        const dx = n.goal.x - n.g.position.x, dz = n.goal.z - n.g.position.z, dist = Math.hypot(dx, dz);
        if (dist < 0.06) { const r = n.goal.res; n.goal = null; r && r(); }
        else {
          n.yaw = Math.atan2(dx, dz);
          if (Math.abs(wrap(n.yaw - n.g.rotation.y)) < 0.9) {
            const st = Math.min(dist, n.goal.speed * dt);
            n.g.position.x += dx / dist * st; n.g.position.z += dz / dist * st;
          }
        }
      }
      const moving = n.goal || n.creeping ? 1 : 0;
      n.g.rotation.y += wrap(n.yaw - n.g.rotation.y) * (1 - Math.exp(-dt * 7));
      n.swing = lerp(n.swing, moving, 1 - Math.exp(-dt * 8));
      n.phase += dt * 6.5 * n.swing;
      const s = Math.sin(n.phase) * 0.7 * n.swing;
      n.legL.rotation.x = s; n.legR.rotation.x = -s;
      n.arm = lerp(n.arm, n.armT, 1 - Math.exp(-dt * 5));
      n.armL.rotation.x = -s * 0.8;
      n.armR.rotation.x = s * 0.8 * (1 - n.arm) - (n.armAng || 2.7) * n.arm;
      n.tilt = lerp(n.tilt, n.tiltT, 1 - Math.exp(-dt * 4));
      n.head.rotation.z = n.tilt;
    }
    walk(n, to, speed) {
      return new Promise((res) => { n.goal = { x: to[0], z: to[1], speed: speed || 1.3, res }; });
    }
    async turn(n, to, dur) { n.yaw = this.faceTarget(n, to); await this.wait(dur || 0.7); }
    arm(n, on) { n.armT = on ? 1 : 0; }
    tilt(n, rad) { n.tiltT = rad; }
    vanish(n) { n.g.visible = false; n.goal = null; }
    appear(n, x, z) { if (x !== undefined) { n.g.position.x = x; n.g.position.z = z; } n.g.visible = true; }

    // ------------------------------------------------------------ время: tween / wait / until
    tween(dur, fn, ease) {
      return new Promise((res) => { this.tw.push({ t: 0, dur: Math.max(0.0001, dur), fn, ease: ease || ((k) => k), res }); });
    }
    wait(s) { return this.tween(s); }
    until(cond) { return new Promise((res) => this.waiters.push({ cond, res })); }
    signal(n) { this.sig[n] = true; (this.sigRes[n] || []).forEach((f) => f()); this.sigRes[n] = []; }
    waitFor(n) { return this.sig[n] ? Promise.resolve() : new Promise((r) => (this.sigRes[n] = this.sigRes[n] || []).push(r)); }

    // ------------------------------------------------------------ HUD
    objective(text) {
      const el = this.qs('.m-obj'); el.querySelector('span').textContent = text;
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }
    meter(label, ratio) {
      const m = this.qs('.m-meter');
      if (label === null) { m.classList.remove('on'); return; }
      m.classList.add('on');
      m.querySelector('span').textContent = label;
      m.querySelector('i').style.width = Math.round(Math.max(0, Math.min(1, ratio)) * 100) + '%';
    }
    stage(name) { this.opts.onStage && this.opts.onStage(this.taskId, name); }
    cut(id) { this.opts.onCutscene && this.opts.onCutscene(id); }
    sfx(k) { this.opts.playSfx && this.opts.playSfx(k); }

    async say(who, text, hold) {
      if (this.disposed) return;
      const s = this.sub, id = (this.sayId = (this.sayId || 0) + 1);
      s.textContent = '';
      if (who) { const b = document.createElement('b'); b.textContent = who; s.appendChild(b); }
      const t = document.createElement('span'); t.textContent = who ? '"' + text + '"' : text; s.appendChild(t);
      s.classList.add('on');
      const V = window.Missions._core.voice, vo = V ? V.play(this, text) : null; // озвучка (assets/voice), если файл есть
      await this.wait(0.35);
      await this.wait(Math.max(hold || Math.max(1.8, text.length * 0.055), vo ? vo.dur - 0.05 : 0));
      if (this.sayId === id) s.classList.remove('on'); // только последняя реплика гасит субтитры (важно при пропуске катсцены)
      await this.wait(0.4);
    }
    async fade(to, dur) {
      const f = this.qs('.m-fade');
      f.style.transition = 'opacity ' + (dur || 1) + 's ease';
      void f.offsetWidth;
      f.style.opacity = String(to);
      await this.wait(dur || 1);
    }
    async flash(s) {
      const f = this.qs('.m-flash');
      f.style.transition = 'none'; f.style.opacity = this.q.flashes === false ? '0.22' : '1'; void f.offsetWidth;
      f.style.transition = 'opacity ' + (s || 0.4) + 's ease-out'; f.style.opacity = '0';
      await this.wait(s || 0.4);
    }
    async glitch(s) {
      if (this.snd && this.snd.has('glitch') && (s || 0.4) >= 0.2) this.snd.play('glitch', { k: Math.min(1, 0.55 + (s || 0.4)) }); // случайный из glitch2-4
      this.layer.classList.add('glitch');
      await this.wait(s || 0.4);
      this.layer.classList.remove('glitch');
    }
    async flicker(n) {
      for (let i = 0; i < n && !this.disposed; i += 1) {
        this.lightsLevel(Math.random() < 0.5 ? 0.05 : 0.9);
        await this.wait(0.04 + Math.random() * 0.1);
      }
      this.lightsLevel(1);
    }
    bars(on) { this.layer.classList.toggle('bars', !!on); return this.wait(0.9); }
    async lights(level, dur) {
      const l0 = this.lightLevel;
      await this.tween(dur || 0.5, (k) => this.lightsLevel(lerp(l0, level, k)), smooth);
    }
    async shake(amp, dur) {
      amp *= this.q.shake === undefined ? 1 : this.q.shake;
      this.shakeAmp = amp;
      await this.tween(dur || 1, (k) => { this.shakeAmp = amp * (1 - k); });
      this.shakeAmp = 0;
    }
    async zoom(fov, dur) {
      const f0 = this.baseFov;
      await this.tween(dur || 1, (k) => { this.baseFov = lerp(f0, fov, k); }, smooth);
    }
    lookVec(t) {
      if (typeof t === 'function') return this.lookVec(t());
      if (t && t.g) return this.headPos(t);
      if (Array.isArray(t)) return new THREE.Vector3(t[0], t[1], t[2]);
      return t;
    }
    async look(target, dur) {
      const v = this.lookVec(target);
      const dx = v.x - this.p.x, dy = v.y - EYE, dz = v.z - this.p.z;
      const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.hypot(dx, dz));
      const y0 = this.p.yaw, p0 = this.p.pitch, dyaw = wrap(ty - y0);
      await this.tween(dur || 1.2, (k) => { this.p.yaw = y0 + dyaw * k; this.p.pitch = lerp(p0, tp, k); }, smooth);
    }

    // ------------------------------------------------------------ кинематографическая система
    async cine(steps) {
      this.cineDepth += 1; this.syncLock();
      try { await this.seq(steps); } finally { this.cineDepth = Math.max(0, this.cineDepth - 1); this.syncLock(); }
    }
    async seq(steps) {
      for (const s of steps) { if (this.disposed) return; await this.exec(s); }
    }
    syncLock() { this.layer.classList.toggle('cine', this.locked); }
    // Шаг = набор действий, выполняемых одновременно; следующий шаг стартует, когда закончились все.
    exec(s) {
      const jobs = [];
      if (s.sound) this.sfx(s.sound);
      if (s.bars !== undefined) jobs.push(this.bars(s.bars));
      if (s.look) jobs.push(this.look(s.look, s.dur));
      if (s.walk) jobs.push(this.walk(s.walk, s.to, s.speed));
      if (s.turn) jobs.push(this.turn(s.turn, s.to, s.dur));
      if (s.say) jobs.push(this.say(s.say[0], s.say[1], s.hold));
      if (s.wait) jobs.push(this.wait(s.wait));
      if (s.lights !== undefined) jobs.push(this.lights(s.lights, s.dur));
      if (s.glitch) jobs.push(this.glitch(s.glitch));
      if (s.flash) jobs.push(this.flash(s.flash === true ? 0.4 : s.flash));
      if (s.fade !== undefined) jobs.push(this.fade(s.fade, s.dur));
      if (s.shake) jobs.push(this.shake(s.shake, s.dur));
      if (s.zoom) jobs.push(this.zoom(s.zoom, s.dur));
      if (s.tilt) this.tilt(s.tilt, s.rad);
      if (s.arm) this.arm(s.arm, s.on !== false);
      if (s.appear) this.appear(s.appear, s.at && s.at[0], s.at && s.at[1]);
      if (s.vanish) this.vanish(s.vanish);
      if (s.run) jobs.push(Promise.resolve(s.run()));
      if (s.par) jobs.push(Promise.all(s.par.map((sub) => this.seq(sub))));
      return Promise.all(jobs);
    }
    // triggerEvent({camera, npc, subtitle, sound, duration}) — компактный вариант одного шага.
    triggerEvent(def) {
      const s = {};
      const c = def.camera || {}, n = def.npc || {};
      if (c.look) { s.look = c.look; s.dur = c.dur; }
      if (c.zoom) s.zoom = c.zoom;
      if (c.shake) s.shake = c.shake;
      if (n.who) {
        if (n.walk) { s.walk = n.who; s.to = n.walk; }
        else if (n.turn) { s.turn = n.who; s.to = n.turn; }
        if (n.tilt !== undefined) s.tilt = n.who, s.rad = n.tilt;
        if (n.arm !== undefined) s.arm = n.who, s.on = n.arm;
        if (n.vanish) s.vanish = n.who;
      }
      if (def.subtitle) s.say = def.subtitle;
      if (def.sound) s.sound = def.sound;
      if (def.glitch) s.glitch = def.glitch;
      if (def.lights !== undefined) s.lights = def.lights;
      const steps = [s];
      if (def.duration) steps.push({ wait: def.duration });
      return this.cine(steps);
    }

    // ------------------------------------------------------------ gaze-механика (миссии 1, 2)
    gaze(targets, o) {
      o = o || {};
      return new Promise((res) => {
        const list = targets.map((t) => ({ t, got: 0, done: false, need: o.need || 1.5 }));
        const g = { list, cos: o.cos || 0.985, res, timeout: o.timeout || 0, age: 0, label: o.label || 'CALIBRATING' };
        this.gazers.push(g);
      });
    }
    updateGaze(dt) {
      if (!this.gazers.length || this.locked) return;
      const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd);
      const cam = this.camera.position;
      for (let i = this.gazers.length - 1; i >= 0; i -= 1) {
        const g = this.gazers[i];
        g.age += dt;
        let best = 0, all = true;
        g.list.forEach((e) => {
          if (e.done) return;
          const pos = typeof e.t.pos === 'function' ? e.t.pos() : e.t.pos;
          const dir = pos.clone().sub(cam).normalize();
          if (dir.dot(fwd) > g.cos) e.got = Math.min(e.need, e.got + dt); else e.got = Math.max(0, e.got - dt * 0.6);
          if (e.got >= e.need) { e.done = true; e.t.onDone && e.t.onDone(); this.sfx('notification'); }
          else { all = false; best = Math.max(best, e.got / e.need); }
        });
        this.meter(g.label + ' ' + g.list.filter((e) => e.done).length + '/' + g.list.length, all ? 1 : best);
        if (all || (g.timeout && g.age > g.timeout)) {
          this.gazers.splice(i, 1);
          this.meter(null);
          g.res(all);
        }
      }
    }

    // ------------------------------------------------------------ ввод
    bindInput() {
      const k = (e, v) => {
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].indexOf(e.code) >= 0) {
          this.keys[e.code] = v; e.preventDefault();
        }
      };
      this.on(document, 'keydown', (e) => {
        k(e, true);
        if (e.code === 'KeyE' && !e.repeat) this.useTarget();
        if (this.choice && !e.repeat) { if (e.code === 'Enter' || e.code === 'NumpadEnter') this.choose('retry'); else if (e.code === 'KeyK') this.choose('skip'); }
        if (e.code === 'Escape' && !document.pointerLockElement && !this.touch) this.setPause(true);
      });
      this.on(document, 'keyup', (e) => k(e, false));
      this.on(window, 'blur', () => { this.keys = {}; this.stick.x = this.stick.y = 0; });
      this.on(document, 'visibilitychange', () => { if (document.hidden) this.setPause(true); });
      if (!this.touch) {
        let drag = false;
        this.on(this.canvas, 'mousedown', () => { if (!this.paused) { drag = true; if (!document.pointerLockElement) this.requestLock(); } });
        this.on(window, 'mouseup', () => { drag = false; });
        this.on(document, 'mousemove', (e) => {
          if (this.locked || this.paused) return;
          if (document.pointerLockElement !== this.canvas && !drag) return;
          let mx = e.movementX || 0, my = e.movementY || 0;
          // Chrome при pointer lock иногда шлёт ложный скачок movementX — игнорируем его, остальное ограничиваем
          if (Math.abs(mx) > 450 || Math.abs(my) > 450) return;
          mx = Math.max(-160, Math.min(160, mx)); my = Math.max(-160, Math.min(160, my));
          this.turnBy(mx * 0.0022, my * 0.0022);
        });
        this.on(document, 'pointerlockchange', () => {
          if (!document.pointerLockElement && this.entered && !this.ending && !this.disposed && !this.choice && !this.hacking) this.setPause(true);
        });
      } else {
        this.bindTouch();
      }
      this.bindCombat && this.bindCombat();
      this.on(this.qs('.m-pausebtn'), 'click', () => this.setPause(true));
      this.on(this.qs('.m-resume'), 'click', () => { this.setPause(false); if (!this.touch) this.requestLock(); });
      this.on(this.qs('.m-sets'), 'click', () => { const d = document.getElementById('settings'); if (d && d.showModal && !d.open) d.showModal(); });   // настройки прямо из паузы (клавиши, геймпад и сенсорный оверлей действуют сразу)
      this.on(this.qs('.m-abort'), 'click', () => this.finish(false));
      this.on(this.qs('.m-retry'), 'click', () => this.choose('retry'));
      this.on(this.qs('.m-skipsec'), 'click', () => this.choose('skip'));
    }
    turnBy(dx, dy) {
      dx = Math.max(-0.4, Math.min(0.4, dx)); dy = Math.max(-0.4, Math.min(0.4, dy));
      this.p.yaw -= dx * sens; this.p.pitch = Math.max(-1.3, Math.min(1.3, this.p.pitch - dy * sens));
    }
    bindTouch() {
      const L = this.qs('.m-zone.l'), R = this.qs('.m-zone.r'), stick = this.qs('.m-stick'), knob = stick.firstChild;
      const RADIUS = 52;
      let ox = 0, oy = 0, lookId = null, lx = 0, ly = 0;
      const tcfg = () => (window.NexaSettings ? NexaSettings.get('touch') : {}), lefty = () => !!tcfg().lefty, fixedStick = () => tcfg().stick === 'fixed';
      const stickHome = () => { const W = this.w || innerWidth, H = this.h || innerHeight, x = Math.max(120, W * 0.14); return [lefty() ? W - x : x, H - 140]; };   // физические координаты
      const ls = () => (tcfg().look || 100) / 100;
      const showStick = (x, y) => { stick.style.left = (lefty() ? (this.w || innerWidth) - x : x) + 'px'; stick.style.top = y + 'px'; stick.classList.add('on'); };
      if (fixedStick()) { const hc = stickHome(); showStick(hc[0], hc[1]); }   // фиксированный стик виден всегда
      this.on(L, 'pointerdown', (e) => {
        if (this.locked || this.stick.id !== null) return;
        this.stick.id = e.pointerId; ox = e.clientX; oy = e.clientY;
        if (fixedStick()) { const hc = stickHome(); ox = hc[0]; oy = hc[1]; }
        try { L.setPointerCapture(e.pointerId); } catch (err) {}
        showStick(ox, oy); knob.style.transform = '';
      });
      this.on(L, 'pointermove', (e) => {
        if (e.pointerId !== this.stick.id) return;
        let dx = e.clientX - ox, dy = e.clientY - oy; const d = Math.hypot(dx, dy);
        if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
        let mx = dx / RADIUS, my = dy / RADIUS; const dzv = (tcfg().dead || 0) / 100, mg = Math.hypot(mx, my);
        if (mg < dzv) { mx = 0; my = 0; } else if (dzv > 0) { const kz = (mg - dzv) / (1 - dzv) / mg; mx *= kz; my *= kz; }
        this.stick.x = mx; this.stick.y = my;
        knob.style.transform = 'translate(' + (lefty() ? -dx : dx) + 'px,' + dy + 'px)';
      });
      const endStick = (e) => { if (e.pointerId !== this.stick.id) return; this.stick.id = null; this.stick.x = this.stick.y = 0; if (fixedStick()) knob.style.transform = ''; else stick.classList.remove('on'); };
      this.on(L, 'pointerup', endStick); this.on(L, 'pointercancel', endStick);
      this.on(R, 'pointerdown', (e) => { if (this.locked || lookId !== null) return; lookId = e.pointerId; lx = e.clientX; ly = e.clientY; try { R.setPointerCapture(e.pointerId); } catch (err) {} });
      this.on(R, 'pointermove', (e) => {
        if (e.pointerId !== lookId || this.locked) return;
        this.turnBy((e.clientX - lx) * 0.0055 * ls(), (e.clientY - ly) * 0.0055 * ls()); lx = e.clientX; ly = e.clientY;
      });
      const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
      this.on(R, 'pointerup', endLook); this.on(R, 'pointercancel', endLook);
      const eBtn = this.qs('.m-e'), runBtn = this.qs('.m-run');
      this.on(eBtn, 'pointerdown', (e) => { e.preventDefault(); this.useTarget(); });
      this.on(runBtn, 'pointerdown', (e) => { e.preventDefault(); this.runHeld = !this.runHeld; runBtn.classList.toggle('held', this.runHeld); });
    }
    setPause(on) {
      if (this.ending || this.disposed || !this.entered) return;
      if (on && this.noPause) return;                    // титры финала 48: на паузу (Esc, потеря фокуса, кнопка, геймпад) поставить нельзя
      this.pausedUser = !!on;
      if (on) this.snd && this.snd.fight.hush();
      this.qs('.m-pause').classList.toggle('on', !!on);
      if (on && !this.touch) { const hh = this.qs('.m-hint'); this.qs('.m-ctl').textContent = (this.ty && this.ty.hint !== null ? this.ty.hint : hh.textContent) || ''; }
      if (on) { this.keys = {}; try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {} }
      else this.last = performance.now();
    }
    useTarget() {
      if (this.locked || this.paused || !this.target || (this.target.enabled && !this.target.enabled())) return;
      this.sfx('mouse');
      this.target.use(this);
    }

    // ------------------------------------------------------------ цикл
    frame(t) {
      if (this.disposed) return;
      this.raf = requestAnimationFrame((n) => this.frame(n));
      const capMs = this.q.fpsCap ? 1000 / this.q.fpsCap - 2 : (this.touch ? 15 : 0);
      if (capMs && t - this.last < capMs) return; // телефоны с экраном 90–144 Гц: держим ~60 FPS, иначе GPU и батарея работают вдвое сильнее
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      if (this.layer.clientWidth !== this.w || this.layer.clientHeight !== this.h) this.resize();
      const portrait = this.touch && innerHeight > innerWidth;
      if (portrait !== this.rotatePause) { this.rotatePause = portrait; this.qs('.m-rotate').classList.toggle('on', portrait); }
      if (this.paused) { this.snd && this.snd.fight.hush(); this.voiceEl && window.Missions._core.voice.sync(this); return; }
      this.voiceEl && window.Missions._core.voice.sync(this);
      this.time += dt;
      this.update(dt * (this.timeScale || 1)); // timeScale < 1 — slow-motion (kill-cam, вход в комнату)
      this.render();
      // адаптивное разрешение: если средний кадр > 32 мс, снижаем render pixel ratio
      this.frameAcc += dt; this.frames += 1;
      if (this.q.showFps) this.fpsTick(dt);
      if (this.frames >= 90) {
        // на телефоне пол ниже (0.5), и разрешение возвращается, если кадры снова быстрые (не более двух откатов подряд — без «качелей»)
        const avg = this.frameAcc / this.frames, floor = this.touch ? 0.5 : 0.75;
        if (this.q.adaptive !== false && avg > 0.032 && this.pr > floor) { this.pr = Math.max(floor, this.pr - 0.25); this.downs = (this.downs || 0) + 1; this.fast = 0; this.resize(); }
        else if (this.q.adaptive !== false && avg < 0.019 && this.pr < this.q.pr && (this.downs || 0) < 2) {
          this.fast = (this.fast || 0) + 1;
          if (this.fast >= 3) { this.pr = Math.min(this.q.pr, this.pr + 0.25); this.fast = 0; this.resize(); }
        } else this.fast = 0;
        this.frames = 0; this.frameAcc = 0;
      }
    }
    fpsTick(dt) {   // счётчик FPS в углу (настройка графики)
      if (!this.fpsEl) { this.fpsEl = document.createElement('div'); this.fpsEl.className = 'm-fps'; this.layer.appendChild(this.fpsEl); this.fpsN = 0; this.fpsT = 0; }
      this.fpsN += 1; this.fpsT += dt;
      if (this.fpsT >= 0.5) { this.fpsEl.textContent = Math.round(this.fpsN / this.fpsT) + ' FPS  ·  x' + this.pr.toFixed(2); this.fpsN = 0; this.fpsT = 0; }
    }
    update(dt) {
      for (let i = this.tw.length - 1; i >= 0; i -= 1) {
        const w = this.tw[i];
        w.t += dt;
        const k = Math.min(1, w.t / w.dur);
        if (w.fn) w.fn(w.ease(k));
        if (k >= 1) { this.tw.splice(i, 1); w.res(); }
      }
      this.npcs.forEach((n) => this.updateNpc(n, dt));
      this.hooks.forEach((h) => h(dt));
      for (let i = this.waiters.length - 1; i >= 0; i -= 1) {
        if (this.waiters[i].cond()) { const w = this.waiters.splice(i, 1)[0]; w.res(); }
      }
      this.pollPad && this.pollPad(dt);
      this.movePlayer(dt);
      this.placeCamera(dt);
      this.updateCombat && this.updateCombat(dt);
      this.updateGaze(dt);
      this.updateTarget();
    }
    movePlayer(dt) {
      const p = this.p, K = this.keys;
      if (this.locked) { p.moving = 0; return; }
      if (K.ArrowLeft) p.yaw += 1.8 * dt;
      if (K.ArrowRight) p.yaw -= 1.8 * dt;
      const pad = this.padMove || { x: 0, y: 0 };
      let mz = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0) - this.stick.y - pad.y;
      let mx = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0) + this.stick.x + pad.x;
      const len = Math.hypot(mx, mz);
      if (len > 1) { mx /= len; mz /= len; }
      p.moving = Math.min(1, len);
      if (len < 0.05) return;
      const speed = ((K.ShiftLeft || K.ShiftRight || this.runHeld || this.padRun) ? 3.6 : 2.1) * (this.moveMul || 1) * (this.aimK ? 1 - 0.38 * this.aimK : 1);
      const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
      const dx = (-s * mz + c * mx) * speed * dt, dz = (-c * mz - s * mx) * speed * dt;
      if (!this.blocked(p.x + dx, p.z)) p.x += dx;
      if (!this.blocked(p.x, p.z + dz)) p.z += dz;
      p.phase += dt * speed * 2.6;
      const stepN = Math.floor(p.phase / Math.PI); // шаг на каждый полупериод покачивания
      if (stepN !== this.stepN) { if (this.stepN !== undefined && this.snd && !this.camFree) this.snd.play('footstep', { k: speed > 3 ? 1 : 0.75 }); this.stepN = stepN; }
    }
    blocked(x, z) {
      for (const c of this.colliders) {
        if (!c.off && x > c.x0 - PLAYER_R && x < c.x1 + PLAYER_R && z > c.z0 - PLAYER_R && z < c.z1 + PLAYER_R) return true;
      }
      return false;
    }
    placeCamera(dt) {
      const p = this.p, cam = this.camera, t = this.time;
      // body cam: заметное покачивание в такт шагам (вертикаль, боковой наклон, крен)
      const mvK = this.bobK = lerp(this.bobK === undefined ? p.moving : this.bobK, p.moving, 1 - Math.exp(-dt * 9));
      const bob = Math.sin(p.phase * 2) * 0.05 * mvK, sway = Math.sin(p.phase) * 0.035 * mvK, breath = Math.sin(t * 1.4) * 0.012;
      if (this.camFree) { this.applyFreeCam(dt); return; } // катсцена: камера принадлежит режиссёру (cinema.js)
      const shk = this.q.shake === undefined ? 1 : this.q.shake, sh = this.shakeAmp * shk, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      const kp = this.kickP || 0, ky = this.kickY || 0, kr = this.kickR || 0, ki = (this.kickShake || 0) * shk; // отдача, дёрганья перезарядки, стресс
      cam.position.set(p.x + c * sway + (sh ? (Math.random() - 0.5) * sh : 0), EYE + bob + breath + (sh ? (Math.random() - 0.5) * sh : 0), p.z - s * sway);
      cam.rotation.set(
        p.pitch + kp + Math.sin(t * 1.1) * 0.004 + Math.sin(p.phase * 2) * 0.012 * mvK + (ki ? (Math.random() - 0.5) * ki : 0),
        p.yaw + ky + (ki ? (Math.random() - 0.5) * ki : 0),
        Math.sin(p.phase) * 0.018 * mvK + kr
      );
      if (this.pmCam) this.pmCam(cam, dt); // pmove.js: присед, наклон из-за угла, подкат
      if (this.baseFov && !this.fovLocked) { const f = this.fovNow ? this.fovNow() : this.baseFov; if (Math.abs(cam.fov - f) > 0.05) { cam.fov = f; cam.updateProjectionMatrix(); } }
      // скорость поворота -> motion blur и инерция тела
      let vel = 0;
      if (dt > 0 && this.prevYaw !== undefined) {
        vel = wrap(p.yaw - this.prevYaw) / dt; this.pitchVel = (p.pitch - this.prevPitch) / dt;
        const cl = (v) => Math.max(-0.05, Math.min(0.05, v));
        this.blurX = lerp(this.blurX || 0, cl(-vel * 0.008), 0.35); this.blurY = lerp(this.blurY || 0, cl(this.pitchVel * 0.008), 0.35);
      }
      this.pitchVel = this.pitchVel || 0; this.prevYaw = p.yaw; this.prevPitch = p.pitch;
      if (this.body) this.updateBody(dt, vel);
    }
    updateTarget() {
      let best = null, bestDot = 0.9;
      if (!this.locked) {
        const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd);
        const cam = this.camera.position;
        for (const it of this.interactables) {
          if (it.enabled && !it.enabled()) continue;
          const d = it.pos.clone().sub(cam), dist = d.length();
          if (dist > it.reach) continue;
          const dot = d.normalize().dot(fwd);
          if (dot > bestDot) { bestDot = dot; best = it; }
        }
      }
      if (best !== this.target) {
        this.target = best;
        const cross = this.qs('.m-cross');
        cross.classList.toggle('on', !!best);
        this.prompt.textContent = best ? (this.touch ? best.label : '[' + KL('use') + '] ' + best.label) : '';
        const eb = this.qs('.m-e'); eb && eb.classList.toggle('ready', !!best);
      }
    }

    // ------------------------------------------------------------ завершение
    async complete() {
      if (this.ending) return;
      this.ending = true; this.syncLock();
      this.meter(null);
      const cin = CINEMA[this.taskId];
      if (this.inCinema && this.cineIdle) await this.cineIdle(); // вставка (килкам, подрыв) не должна съедать эпилог
      if (cin && cin.outro && this.cinematic) await this.cinematic(cin.outro(this), { outro: true });
      if (this.disposed) return;
      await this.bars(false);
      await this.fade(1, 1.1);
      const end = this.qs('.m-end');
      end.querySelector('h2').textContent = 'MISSION COMPLETE';
      end.querySelector('p').innerHTML = 'SUBJECT 083<br>RETURNING TO TERMINAL...';
      end.classList.add('on');
      this.sfx('succesfully');
      await this.wait(2.6);
      end.classList.remove('on');
      await this.wait(0.9);
      end.querySelector('h2').textContent = 'NEXA/OS';
      end.querySelector('p').innerHTML = 'SYSTEM READY';
      end.classList.add('on');
      await this.wait(1.2);
      this.finish(true);
    }
    finish(done) {
      if (this.disposed) return;
      this.dispose();
      current = null;
      const cb = done ? this.opts.onComplete : this.opts.onExit;
      cb && cb(this.taskId);
    }
    dispose() {
      this.disposed = true;
      if (this.setOff) { this.setOff(); this.setOff = null; }   // отписка от настроек: иначе слушатель держит всю миссию в памяти
      try { const V = window.Missions._core.voice; V && V.stop(this); } catch (e) {}
      try { this.disposeCombat && this.disposeCombat(); } catch (e) { console.error(e); }
      cancelAnimationFrame(this.raf);
      this.intervals.forEach(clearInterval);
      this.listeners.forEach((l) => l[0].removeEventListener(l[1], l[2], l[3]));
      this.listeners = []; this.tw = []; this.waiters = []; this.gazers = []; this.hooks = []; this.interactables = []; this.colliders = []; this.npcs = [];
      try { document.exitPointerLock && document.pointerLockElement && document.exitPointerLock(); } catch (e) {}
      try { if (this.touch && document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
      try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) {}
      try { this.wake && this.wake.release(); this.wake = null; } catch (e) {}
      if (this.scene) {
        const seen = new Set();
        const free = (m) => { if (!m || seen.has(m)) return; seen.add(m); m.map && m.map.dispose(); m.dispose(); };
        this.scene.traverse((o) => {
          if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(free);
        });
        Object.keys(this.g || {}).forEach((k) => { if (!seen.has(this.g[k])) this.g[k].dispose(); });
        free(this.lampMat); free(this.npcMat);
        this.scene.clear && this.scene.clear();
      }
      if (this.rt) { this.rt.dispose(); this.fxMat.dispose(); this.fxGeo.dispose(); this.rt = this.fxMat = this.fxGeo = null; }
      if (this.renderer) {
        this.renderer.dispose();
        try { this.renderer.forceContextLoss(); } catch (e) {}
      }
      this.scene = this.camera = this.renderer = null;
      if (this.layer) this.layer.remove();
      document.body.classList.remove('in-mission');
      const meta = document.querySelector('meta[name=viewport]');
      if (meta && this.metaOld) meta.setAttribute('content', this.metaOld);
    }
  }

  // ---------------------------------------------------------------- миссии
  const CINEMA = {}; // id -> { intro(r) -> shots[], outro(r) -> shots[] } — заполняет cinema.js
  const S24 = 'SUBJECT 024';
  const MISSIONS = {
    // TASK 01 — найти терминал, пройти калибровку взглядом
    1: {
      title: 'CALIBRATION',
      build(r) {
        r.room(0, 0, 12, 16, 3.2);
        r.setAmbient(0.85);
        r.lamp(0, 3.1, 3, 0.8); r.lamp(0, 3.1, -3, 0.8);
        r.box(-4.5, 0.5, 3, 1, 1, 1, 0x666666, true); r.box(-4.4, 0.5, 4.2, 1, 1, 1, 0x555555, true); r.box(-4.5, 1.45, 3, 0.8, 0.9, 0.8, 0x777777, true);
        r.box(3.6, 0.4, 4.2, 0.8, 0.8, 0.8, 0x606060, true); r.box(4.5, 0.4, 3.6, 0.8, 0.8, 0.8, 0x585858, true);
        r.box(4.5, 0.45, -6.8, 1.8, 0.9, 0.8, 0x222222, true);
        r.box(4.5, 1.25, -7.25, 0.9, 0.6, 0.06, 0xdddddd, false, true);
        r.door1 = r.door(0, -7.9, 1.8, 2.5);
        r.markers = [r.disc(-5.84, 1.7, -2, Math.PI / 2), r.disc(5.84, 2.0, -3, -Math.PI / 2), r.disc(-3, 2.5, -7.74, 0)];
        r.s = r.npc(-3, -1.5, 0); r.faceNow(r.s, 0, 6.8);
        r.term = r.interact({ pos: [4.5, 1.2, -7.1], label: 'USE TERMINAL', enabled: () => !r.sig.terminal, use: () => r.signal('terminal') });
        r.spawn(0, 6.8, 0);
      },
      async play(r) {
        await r.fade(0, 1.4);
        await r.cine([
          { bars: true },
          { look: r.s, dur: 2.2, say: [S24, 'Субъект 083. Не торопитесь.'], sound: 'notification' },
          { say: [S24, 'Терминал калибровки находится в конце комнаты.'] },
          { look: [4.5, 1.2, -7.2], dur: 2.0 },
          { bars: false }
        ]);
        r.objective('FIND THE TERMINAL');
        await r.waitFor('terminal');
        r.stage('terminal');
        await r.cine([{ sound: 'notification', wait: 0.4 }, { say: ['SYSTEM', 'КАЛИБРОВКА: СМОТРИТЕ НА КАЖДУЮ МЕТКУ.'], hold: 1.6 }]);
        r.objective('CALIBRATION: LOOK AT EACH MARKER');
        await r.gaze(r.markers.map((m) => ({ pos: m.pos, onDone: () => m.set(true) })), { need: 1.3, label: 'MARKERS' });
        r.stage('calibrated');
        try { r.calibModules && await r.calibModules(); } catch (e) { console.warn('[modules]', e); } // два модуля снаряжения: жизнеобеспечение и инвентарь (toyplay.js)
        r.cut('m1-climax');
        await r.cine([
          { bars: true },
          { lights: 0.4, dur: 0.6, turn: r.s, to: 'player' },
          { look: r.s, dur: 1.8, tilt: r.s, rad: 0.35 },
          { say: [S24, 'Калибровка завершена.'] },
          { wait: 0.7 },
          { say: [S24, 'Ты можешь возвращаться.'], run: () => r.openDoor(r.door1, 2) },
          { glitch: 0.6, sound: 'error', shake: 0.05, dur: 0.6 },
          { lights: 1, dur: 0.2 }
        ]);
        await r.complete();
      }
    },

    // TASK 02 — наблюдать за субъектом: удерживать его в поле зрения, пока он действует
    2: {
      title: 'OBSERVATION',
      build(r) {
        r.room(0, 0, 10, 14, 3.2, 0x7d7d7d);
        r.setAmbient(0.7);
        r.lamp(0, 3.1, 3.5, 0.7); r.lamp(0, 3.1, -4.5, 0.9);
        r.glass(0, 1.4, -1, 10, 2.8, 0.08);
        r.box(0, 0.45, 1.6, 2.2, 0.9, 0.8, 0x222222, true);
        r.box(0, 1.2, 1.2, 1.0, 0.6, 0.05, 0xdddddd, false, true);
        r.box(3.5, 0.6, -6, 1.4, 1.2, 0.8, 0x3a3a3a, true);
        r.s = r.npc(0, -5, 0);
        r.rec = r.interact({ pos: [0, 1.0, 1.6], label: 'START RECORDING', enabled: () => !r.sig.rec, use: () => r.signal('rec') });
        r.spawn(3, 5, 0);
      },
      async play(r) {
        const s = r.s;
        await r.fade(0, 1.4);
        r.objective('START RECORDING AT THE CONSOLE');
        await r.cine([{ say: ['SYSTEM', 'НАБЛЮДЕНИЕ ЗА СУБЪЕКТОМ 024. НАЧНИТЕ ЗАПИСЬ НА КОНСОЛИ.'] }]);
        await r.waitFor('rec');
        r.stage('rec');
        r.sfx('notification');
        const acts = [
          { name: 'MOVEMENT', go: async () => { await r.walk(s, [-2.5, -4.5], 1.1); await r.walk(s, [2.2, -3.5], 1.1); await r.walk(s, [0, -5], 1.1); } },
          { name: 'RAISED ARM', go: async () => { r.arm(s, true); await r.wait(6); r.arm(s, false); } },
          { name: 'HEAD TILT', go: async () => { r.tilt(s, 0.5); await r.wait(6); r.tilt(s, 0); } }
        ];
        let seen = 0;
        r.objective('KEEP SUBJECT 024 IN VIEW — OBSERVATIONS 0/3');
        for (const a of acts) {
          let ok = false;
          while (!ok && !r.disposed) {
            await r.wait(1.2);
            const run = a.go();
            ok = await r.gaze([{ pos: () => r.headPos(s) }], { need: 2.4, cos: 0.965, timeout: 11, label: a.name });
            if (!ok) { r.sfx('error'); r.objective('SIGNAL LOST — KEEP SUBJECT IN VIEW'); await run; await r.wait(1); }
            else { await run; }
          }
          seen += 1;
          r.objective('KEEP SUBJECT 024 IN VIEW — OBSERVATIONS ' + seen + '/3');
        }
        r.cut('m2-climax');
        await r.cine([
          { bars: true },
          { run: () => r.flicker(7), look: s, dur: 1.4 },
          { walk: s, to: [0, -1.9], speed: 1.2 },
          { turn: s, to: 'player', tilt: s, rad: -0.4 },
          { say: [S24, 'Ты записываешь меня.'], zoom: 58, dur: 3 },
          { say: [S24, 'Но кто записывает тебя?'], shake: 0.025, dur: 1.5 },
          { glitch: 0.5, sound: 'error' },
          { flash: 0.6, vanish: s }
        ]);
        await r.complete();
      }
    },

    // TASK 03 — найти источник аномалии по детектору сигнала
    3: {
      title: 'DEVIATION',
      build(r) {
        r.room(0, 0, 14, 26, 3.2, 0x777777);
        r.setAmbient(0.5);
        [8, 2, -4, -10].forEach((z) => r.lamp((z % 4 ? -2 : 2), 3.1, z, 0.6));
        r.box(-3.5, 1.6, 5, 7, 3.2, 0.3, 0x555555, true);
        r.box(3.5, 1.6, -3, 7, 3.2, 0.3, 0x555555, true);
        r.box(-3.5, 1.6, -9, 7, 3.2, 0.3, 0x555555, true);
        r.box(0, 0.5, 9, 1, 1, 1, 0x4a4a4a, true);
        r.panel = r.box(6.8, 1.4, -12, 0.12, 0.9, 0.9, 0x111111, false);
        r.panelPos = new THREE.Vector3(6.8, 1.4, -12);
        r.s = r.npc(-4, -9, 0); r.s.g.visible = false;
        r.src = r.interact({ pos: [6.7, 1.4, -12], label: 'EXAMINE PANEL', reach: 2.8, enabled: () => !r.sig.src, use: () => r.signal('src') });
        r.spawn(-5, 11, 0);
      },
      async play(r) {
        await r.fade(0, 1.4);
        await r.cine([{ say: ['SYSTEM', 'ОБНАРУЖЕНО ОТКЛОНЕНИЕ. ДЕТЕКТОР АКТИВЕН.'], sound: 'notification' }]);
        r.objective('FOLLOW THE SIGNAL TO THE ANOMALY SOURCE');
        let hinted = false;
        r.hooks.push(() => {
          if (r.locked) return;
          const d = Math.hypot(r.p.x - r.panelPos.x, r.p.z - r.panelPos.z);
          r.meter('ANOMALY SIGNAL', 1 - Math.min(1, d / 24));
          if (!hinted && r.p.z < -4 && r.p.x > -1) {
            hinted = true;
            r.cine([
              { run: () => r.flicker(8) },
              { appear: r.s, at: [-4, -9], look: r.s, dur: 1.6 },
              { say: ['SYSTEM', 'ПОКАЗАНИЯ НЕСТАБИЛЬНЫ.'], hold: 1.2 },
              { glitch: 0.4, vanish: r.s, sound: 'error' }
            ]);
          }
        });
        await r.waitFor('src');
        r.meter(null); r.stage('source');
        r.cut('m3-climax');
        await r.cine([
          { bars: true, lights: 0, dur: 0.4, sound: 'denied' },
          { appear: r.s, at: [3.5, -9], run: () => r.lights(0.18, 0.1) },
          { look: r.s, dur: 2 },
          { say: [S24, 'Отклонение — это не место.'] },
          { wait: 0.6, shake: 0.03, dur: 0.6 },
          { say: [S24, 'Отклонение — это ты.'] },
          { glitch: 0.6, vanish: r.s, sound: 'error' },
          { lights: 1, dur: 0.3 }
        ]);
        await r.complete();
      }
    },

    // TASK 04 — Incident 1103: тёмный объект с фонарём, три документа, безликие свидетели
    4: {
      title: 'INCIDENT 1103',
      build(r) {
        r.room(0, 0, 18, 22, 3.2, 0x555555);
        r.setAmbient(0.12);
        r.setFog(r.q.fog * 1.7, 0x030303);
        r.torch.intensity = 1.1;
        r.lamp(0, 3.1, -6, 0.15);
        r.box(-3, 1.6, 4, 8, 3.2, 0.3, 0x444444, true);
        r.box(4, 1.6, -3, 8, 3.2, 0.3, 0x444444, true);
        r.box(-4, 0.4, -5, 1.4, 0.8, 0.8, 0x333333, true);
        r.box(5, 0.5, 6, 1.2, 1, 1.2, 0x333333, true);
        r.exitDoor = r.door(0, -11, 2, 2.6);
        r.exitLight = r.box(0, 1.3, -11.6, 4, 2.6, 0.05, 0xffffff, false, true);
        r.docs = [[-6.5, 8, 'DOC'], [6, 1, 'DOC'], [-5.5, -8, 'DOC']].map((d, i) => {
          r.box(d[0], 0.35, d[1], 0.9, 0.7, 0.7, 0x2a2a2a, true);
          r.box(d[0], 0.74, d[1], 0.42, 0.03, 0.3, 0xe8e8e8, false, true);
          return r.interact({ pos: [d[0], 0.74, d[1]], label: 'READ DOCUMENT', reach: 2.2, enabled: () => !d.read, use: () => { d.read = true; r.signal('doc' + i); } });
        });
        r.docs.forEach((it, i) => { it.pos.y = 0.8; });
        r.ring = [];
        for (let i = 0; i < (r.q.npcs === 2 ? 4 : 6); i += 1) { const n = r.npc(0, 0, 0); n.g.visible = false; r.ring.push(n); }
        r.spawn(0, 9, 0);
      },
      async play(r) {
        await r.fade(0, 2);
        r.objective('INVESTIGATE: FIND 3 DOCUMENTS  0/3');
        await r.cine([{ say: ['SYSTEM', 'ДОСТУП К ЗАКРЫТОМУ ОБЪЕКТУ. ПИТАНИЕ ОТКЛЮЧЕНО. ФОНАРЬ АКТИВЕН.'], sound: 'denied' }]);
        const text = [
          'INCIDENT REPORT 1103. 03.11.1992. ЭКСПЕРИМЕНТ 01 ПРЕРВАН В ТРЕТЬЕМ РАУНДЕ.',
          'СУБЪЕКТ 024 НАЗВАЛ ЧИСЛО, КОТОРОЕ НИКТО НЕ ЗАГАДЫВАЛ.',
          'ВСЕ СУБЪЕКТЫ ОСТАЛИСЬ В КОМНАТЕ. СУБЪЕКТ 083 ПОКИНУЛ ЕЁ. ЗАПИСЬ ПОВРЕЖДЕНА.'
        ];
        for (let i = 0; i < 3; i += 1) {
          await r.waitFor('doc' + i);
          r.sfx('notification');
          r.objective('INVESTIGATE: FIND 3 DOCUMENTS  ' + (i + 1) + '/3');
          if (i < 2) r.say(null, text[i], 4.2); else await r.say(null, text[i], 3.5);
        }
        r.stage('documents');
        r.cut('m4-climax');
        const px = r.p.x, pz = r.p.z;
        r.ring.forEach((n, i) => {
          const a = (i / r.ring.length) * Math.PI * 2 + 0.4;
          r.placeNpc(n, px + Math.sin(a) * 4, pz + Math.cos(a) * 4);
          n.watch = true;
        });
        await r.cine([
          { bars: true, lights: 0, dur: 0.3, sound: 'poweroff' },
          { wait: 1.2 },
          { flash: 0.15 },
          { run: () => { r.ring.forEach((n) => r.appear(n)); r.torch.intensity = 1.4; } },
          { look: [px + 3, 1.5, pz + 3], dur: 1.6, shake: 0.02 },
          { look: [px - 3, 1.5, pz + 3], dur: 1.6 },
          { say: ['ЗАПИСЬ', 'ОНИ ВСЁ ЕЩЁ ЗДЕСЬ.'], hold: 2 },
          { glitch: 0.5, sound: 'error' },
          { run: () => { r.openDoor(r.exitDoor, 2.2); } },
          { look: [0, 1.3, -11], dur: 2.2 },
          { bars: false }
        ]);
        r.objective('LEAVE THE FACILITY');
        await r.until(() => Math.hypot(r.p.x - 0, r.p.z + 10.4) < 1.6 && !r.locked);
        r.stage('exit');
        await r.cine([{ flash: 0.5, sound: 'succesfully' }]);
        await r.complete();
      }
    },

    // TASK 05 — неизвестный процесс: движется только когда на него не смотрят
    5: {
      title: 'UNKNOWN PROCESS',
      build(r) {
        r.room(0, 0, 22, 22, 3.4, 0x666666);
        r.setAmbient(0.3);
        r.setFog(r.q.fog * 1.4, 0x040404);
        r.lamp(-5, 3.3, 5, 0.5); r.lamp(5, 3.3, -5, 0.5);
        [[-4, 0], [3, 3], [0, -6], [7, 6], [-7, -5], [4, -2]].forEach((p) => r.box(p[0], 1.7, p[1], 1.2, 3.4, 1.2, 0x2c2c2c, true));
        r.box(9.4, 0.5, -9.4, 1.4, 1, 1.4, 0x1a1a1a, true);
        r.box(9.4, 1.35, -9.4, 0.9, 0.6, 0.05, 0xdddddd, false, true);
        r.s = r.npc(9, 9, 0); r.s.creeping = false;
        r.srv = r.interact({ pos: [9.2, 1.3, -9.2], label: 'TERMINATE PROCESS', reach: 2.6, enabled: () => !r.sig.kill, use: () => r.signal('kill') });
        r.spawn(-9, 9, -Math.PI / 4);
      },
      async play(r) {
        const s = r.s;
        await r.fade(0, 1.4);
        r.cine([{ say: ['SYSTEM', 'ОБНАРУЖЕН НЕИЗВЕСТНЫЙ ПРОЦЕСС. НЕ ОТВОДИТЕ ОТ НЕГО ВЗГЛЯД.'], sound: 'notification' }]);
        r.objective('REACH SERVER 4 — IT MOVES WHEN YOU DO NOT LOOK');
        const fwd = new THREE.Vector3(), v = new THREE.Vector3();
        let caught = false;
        r.hooks.push((dt) => {
          if (r.locked || caught || r.sig.kill) { s.creeping = false; return; }
          r.camera.getWorldDirection(fwd);
          v.set(s.g.position.x - r.p.x, 0, s.g.position.z - r.p.z);
          const dist = v.length(); v.normalize();
          const seen = v.dot(fwd) > 0.5 && dist < 40;
          s.creeping = !seen;
          s.yaw = Math.atan2(-v.x, -v.z);
          if (!seen) { s.g.position.x -= v.x * 1.7 * dt; s.g.position.z -= v.z * 1.7 * dt; }
          r.meter('PROCESS DISTANCE', 1 - Math.min(1, dist / 22));
          if (dist < 1.1) {
            caught = true;
            r.cine([
              { glitch: 0.6, sound: 'error', shake: 0.08, dur: 0.5 },
              { fade: 1, dur: 0.4 },
              { run: () => { r.p.x = r.spawnPt[0]; r.p.z = r.spawnPt[1]; r.p.yaw = r.spawnPt[2]; r.p.pitch = 0; r.placeNpc(s, 9, 9); } },
              { fade: 0, dur: 0.6 }
            ]).then(() => { caught = false; });
          }
        });
        await r.waitFor('kill');
        r.meter(null); r.stage('terminated');
        r.cut('m5-climax');
        const bx = r.p.x - Math.sin(r.p.yaw) * -2.2, bz = r.p.z - Math.cos(r.p.yaw) * -2.2;
        await r.cine([
          { bars: true, sound: 'poweroff', lights: 0.1, dur: 0.5 },
          { run: () => { r.placeNpc(s, bx, bz); r.faceNow(s, r.p.x, r.p.z); } },
          { look: s, dur: 3, shake: 0.015 },
          { say: ['UNKNOWN PROCESS', '083.'], hold: 1.6 },
          { say: ['UNKNOWN PROCESS', 'Ты не завершил меня. Ты меня вызвал.'] },
          { glitch: 0.6, sound: 'error' },
          { flash: 0.6, vanish: s },
          { lights: 1, dur: 0.2 }
        ]);
        await r.complete();
      }
    },

    // TASK 06 — финальный эксперимент: HIGH / LOW в мире (угадай число субъекта)
    6: {
      title: 'FINAL EXPERIMENT',
      build(r) {
        r.room(0, 0, 14, 14, 3.6, 0x888888);
        r.setAmbient(0.7);
        r.lamp(-3, 3.5, 0, 0.7); r.lamp(3, 3.5, -5, 0.7);
        r.secret = 1 + Math.floor(Math.random() * 7);
        r.lo = 1; r.hi = 7; r.busy = false;
        r.pads = [];
        for (let i = 1; i <= 7; i += 1) {
          const x = -4.5 + (i - 1) * 1.5;
          const box = r.box(x, 0.45, -3.2, 0.7, 0.9, 0.7, 0x2a2a2a, true);
          r.numberPlate(x, 1.15, -2.84, i);
          const pad = { i, box };
          pad.it = r.interact({ pos: [x, 1.0, -3.2], label: 'GUESS ' + i, reach: 2.4, enabled: () => !r.busy && i >= r.lo && i <= r.hi && !pad.used, use: () => r.guess(i, pad) });
          r.pads.push(pad);
        }
        r.s = r.npc(0, -6, 0);
        r.others = [[-6, -5], [6, -5], [-6, 2], [6, 2]].slice(0, r.q.npcs).map((p) => { const n = r.npc(p[0], p[1], 0); r.faceNow(n, 0, 3); return n; });
        r.guess = async (i, pad) => {
          r.busy = true; pad.used = true;
          pad.box.material = r.mat(0x555555);
          if (i === r.secret) { r.busy = true; r.signal('found'); return; }
          if (i < r.secret) { r.lo = Math.max(r.lo, i + 1); await r.say(S24, 'HIGH. Число больше.', 1.2); }
          else { r.hi = Math.min(r.hi, i - 1); await r.say(S24, 'LOW. Число меньше.', 1.2); }
          r.pads.forEach((q) => { if (q.i < r.lo || q.i > r.hi) q.box.material = r.mat(0x151515); });
          r.objective('FIND THE NUMBER: RANGE ' + r.lo + ' — ' + r.hi);
          r.busy = false;
        };
        r.spawn(0, 5.5, 0);
      },
      async play(r) {
        await r.fade(0, 1.6);
        await r.cine([
          { bars: true },
          { look: r.s, dur: 2, say: [S24, 'Я загадал число от одного до семи.'], sound: 'notification' },
          { say: [S24, 'Подойди к числу. Я скажу HIGH или LOW.'] },
          { look: [0, 1.0, -3], dur: 1.6, bars: false }
        ]);
        r.objective('FIND THE NUMBER: RANGE 1 — 7');
        await r.waitFor('found');
        r.stage('found');
        r.cut('m6-climax');
        r.others.forEach((n) => { n.watch = true; }); r.s.watch = true;
        await r.cine([
          { bars: true, sound: 'succesfully' },
          { say: [S24, 'CORRECT.'], hold: 1.2, look: r.s, dur: 1.8 },
          { lights: 0.15, dur: 1.2, zoom: 55 },
          { say: [S24, 'Ты нашёл число.'] },
          { say: [S24, 'А я всё это время искал тебя.'], shake: 0.02, dur: 2 },
          { glitch: 0.8, sound: 'error' },
          { flash: 1.2 }
        ]);
        await r.complete();
      }
    }
  };

  window.Missions = {
    get TASKS() { return Object.keys(MISSIONS).filter((k) => /^\d+$/.test(k)).length; }, // только сюжетные миссии (стол HIGH/LOW и др. служебные — не в счёт)
    getQuality, getQualitySaved, setQuality, getSens, setSens, getBlood, setBlood,
    get current() { return current; },
    // расширения (combat.js, cinema.js, missions2.js) подключаются через _core
    _core: { Run, MISSIONS, CINEMA, QUALITY, PLAYER_R, EYE, isTouch, wrap, smooth, lerp, getSens, getBlood, loadThree },
    start(taskId, opts) {
      if (current || !MISSIONS[taskId]) return null;
      current = new Run(taskId, opts);
      current.start();
      return current;
    }
  };
}());
