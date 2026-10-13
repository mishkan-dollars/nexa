// NEXA/OS: общие настройки игры — графика (расширенные), клавиатура (переназначение), геймпад (кнопки, стики), сенсорный оверлей.
// Хранятся одним JSON в localStorage 'nexaSettings' (+ старые ключи quality/sens/blood у Missions). Модуль ничего не рисует:
// вкладки настроек строит js/settingsui.js. Подключается РАНЬШЕ missions.js и остальных скриптов игры (подмена navigator.getGamepads
// и перехват клавиш должны стоять до того, как их начнут слушать). Звук не трогаем (js/audio.js не меняется).
(function () {
  'use strict';
  const LS = 'nexaSettings';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ------------------------------------------------------------------ значения по умолчанию
  // gfx: 'auto' — взять из пресета качества (LOW / MEDIUM / HIGH / ULTRA); числа — проценты от значения пресета, если не сказано иное
  const DEF = {
    gfx: {
      scale: 100,            // масштаб рендера, % от пресета (50–200)
      adaptive: true,        // динамическое разрешение: при тормозах само снижает масштаб
      fpsCap: 0,             // 0 — по умолчанию (60 на телефоне, без лимита на ПК), иначе 30 / 45 / 60 / 90 / 120
      shadows: 'auto',       // auto | off | on | high
      aa: 'auto',            // auto | off | fxaa | msaa
      fx: 'auto',            // auto | none | lite | full  (постобработка)
      bloom: 'auto',         // auto | off | low | high  (свечение ярких мест и пламени)
      tone: 'auto',          // auto | off | on  (кинематографичная кривая яркости)
      fov: 0,                // 0 — как в игре, иначе 60–110
      parts: 100,            // плотность частиц, % (25–200)
      lamps: 0,              // 0 — как в пресете, иначе число динамических ламп (1–8)
      fog: 100,              // дальность видимости, % (100 — как в пресете; больше — дальше)
      vignette: 100, grain: 100, chroma: 100, lens: 100,   // сила виньетки, зерна, хроматической аберрации, «рыбьего глаза», %
      sat: 100, contrast: 100,                              // насыщенность и контраст, %
      mblur: true,           // размытие движения
      flashes: true,         // вспышки и тряска экрана; выключено — безопасный режим (для светочувствительных)
      shake: 100,            // сила тряски камеры, %
      fps: false             // счётчик FPS в миссии
    },
    kb: {},                  // действие → [коды клавиш]; пусто — по умолчанию
    pad: { map: {}, swap: false, invertY: false, dead: 0, sens: 100, trig: 35, rumble: true },
    touch: { scale: 100, opacity: 85, lefty: false, stick: 'float', look: 100, dead: 10, haptics: true, spread: 100, hints: true }
  };

  // ------------------------------------------------------------------ действия клавиатуры
  // def — коды, на которые рассчитана игра (первый — «логический», на него переводятся переназначенные клавиши)
  const ACTIONS = [
    { id: 'forward', def: ['KeyW', 'ArrowUp'] },
    { id: 'back', def: ['KeyS', 'ArrowDown'] },
    { id: 'left', def: ['KeyA', 'ArrowLeft'] },
    { id: 'right', def: ['KeyD', 'ArrowRight'] },
    { id: 'run', def: ['ShiftLeft', 'ShiftRight'] },
    { id: 'use', def: ['KeyE'] },
    { id: 'reload', def: ['KeyR'] },
    { id: 'swap', def: ['KeyQ'] },
    { id: 'slot1', def: ['Digit1'] },
    { id: 'slot2', def: ['Digit2'] },
    { id: 'slot3', def: ['Digit3'] },
    { id: 'crouch', def: ['KeyC'] },
    { id: 'fists', def: ['KeyF'] },
    { id: 'kick', def: ['KeyV'] },
    { id: 'leanL', def: ['KeyZ'] },
    { id: 'leanR', def: ['KeyX'] },
    { id: 'gadget', def: ['KeyG'] },
    { id: 'gadgetNext', def: ['KeyH'] },
    { id: 'boom', def: ['KeyB'] }
  ];
  // кнопки геймпада (логический индекс стандартной раскладки → действие по умолчанию)
  const PAD_ACTIONS = [
    { id: 'use', idx: 0 }, { id: 'gadget', idx: 1 }, { id: 'reload', idx: 2 }, { id: 'swap', idx: 3 }, { id: 'prevWeapon', idx: 4 },
    { id: 'nextWeapon', idx: 5 }, { id: 'aim', idx: 6 }, { id: 'fire', idx: 7 }, { id: 'kick', idx: 8 }, { id: 'pause', idx: 9 },
    { id: 'run', idx: 10 }, { id: 'crouch', idx: 11 }
  ];

  // ------------------------------------------------------------------ хранилище
  let S = JSON.parse(JSON.stringify(DEF));
  const listeners = [];
  function merge(dst, src) {
    if (!src || typeof src !== 'object') return dst;
    Object.keys(dst).forEach((k) => {
      if (!(k in src)) return;
      if (dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k]) && k !== 'map' && k !== 'kb') merge(dst[k], src[k]);
      else if (k === 'map' || k === 'kb') { if (src[k] && typeof src[k] === 'object') dst[k] = JSON.parse(JSON.stringify(src[k])); }
      else if (typeof src[k] === typeof dst[k]) dst[k] = src[k];
    });
    return dst;
  }
  try { merge(S, JSON.parse(localStorage.getItem(LS) || 'null')); } catch (e) { /* без хранилища — значения по умолчанию */ }
  function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { /* не критично */ } }
  function emit(what) { rebuildKeys(); listeners.forEach((f) => { try { f(what); } catch (e) { console.warn('[settings]', e); } }); }

  // ------------------------------------------------------------------ пресет «авто» по устройству
  let detected = null;
  function detect() {
    if (detected) return detected;
    const d = { renderer: '', touch: false, mem: navigator.deviceMemory || 0, cores: navigator.hardwareConcurrency || 0, software: false };
    try { d.touch = matchMedia('(pointer: coarse)').matches || /[?&]touch=1/.test(location.search); } catch (e) { /* нет matchMedia */ }
    try {
      const c = document.createElement('canvas'), gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        d.renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
        const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      }
    } catch (e) { /* без WebGL */ }
    d.software = /swiftshader|llvmpipe|software|softpipe|basic render/i.test(d.renderer);
    return (detected = d);
  }
  function autoPreset() {
    const d = detect();
    if (d.software) return 'LOW';
    if (d.touch) {
      const strong = /adreno \(?(6[5-9]\d|7\d\d)|mali-g(7\d|8\d|9\d)|apple/i.test(d.renderer) || (d.mem >= 6 && d.cores >= 8);
      return strong ? 'MEDIUM' : 'LOW';
    }
    if (/nvidia|geforce|rtx|gtx|radeon rx|radeon pro|apple m\d|arc a\d/i.test(d.renderer) || (d.cores >= 12 && d.mem >= 8)) return 'HIGH';
    return 'MEDIUM';
  }

  // ------------------------------------------------------------------ графика: пресет + переопределения → объект q для Run
  function gfx(base) {
    const g = S.gfx, o = Object.assign({}, base);
    o.pr = clamp(base.pr * g.scale / 100, 0.5, 3);
    o.ss = g.scale > 100;                                  // суперсэмплинг: рендер выше размера экрана допускается
    o.parts = Math.max(2, Math.round(base.parts * g.parts / 100));
    if (g.lamps > 0) o.lamps = clamp(Math.round(g.lamps), 1, 8);
    o.fog = base.fog * 100 / clamp(g.fog, 40, 250);
    if (g.fx !== 'auto') o.fx = g.fx;
    if (g.shadows !== 'auto') { o.shadows = g.shadows !== 'off'; o.shadowHigh = g.shadows === 'high'; } else o.shadowHigh = !!base.shadowHigh;
    // сглаживание: msaa — мультисэмпл-буфер (WebGL2), fxaa — шейдер; в пресетах aa:true означает msaa
    let aa = g.aa === 'auto' ? (base.aa ? 'msaa' : (base.fx === 'none' ? 'off' : 'fxaa')) : g.aa;
    if (o.fx === 'none' && aa === 'fxaa') aa = 'off';
    o.aaMode = aa; o.aa = aa === 'msaa';
    o.bloom = g.bloom === 'auto' ? (base.bloom || 0) : ({ off: 0, low: 0.35, high: 0.7 }[g.bloom] || 0);
    if (o.fx !== 'full') o.bloom = g.bloom === 'auto' ? 0 : o.bloom;
    o.tone = g.tone === 'auto' ? (base.tone || 0) : (g.tone === 'on' ? 0.75 : 0);
    o.fovUser = g.fov >= 60 && g.fov <= 110 ? g.fov : 0;
    o.fpsCap = g.fpsCap > 0 ? g.fpsCap : 0;
    o.adaptive = !!g.adaptive;
    o.vig = g.vignette / 100; o.grain = g.grain / 100; o.chroma = g.chroma / 100; o.lens = g.lens / 100;
    o.sat = g.sat / 100; o.contrast = g.contrast / 100;
    o.mblur = !!g.mblur; o.flashes = !!g.flashes; o.shake = g.flashes ? g.shake / 100 : Math.min(0.25, g.shake / 100); o.showFps = !!g.fps;
    return o;
  }

  // ------------------------------------------------------------------ клавиатура: переназначение клавиш
  // Физическая клавиша → логический код игры: перехват в фазе capture на window (раньше всех слушателей игры), событие гасится
  // и заново отправляется с логическим кодом. Работает только внутри миссии и не мешает набору текста.
  let kmap = null, blocked = null, captureOn = false;
  const ALIAS = {};       // логический код → действие (для подсказок)
  ACTIONS.forEach((a) => a.def.forEach((c) => { if (!ALIAS[c]) ALIAS[c] = a.id; }));
  function binding(id) {
    const a = ACTIONS.find((x) => x.id === id); if (!a) return [];
    const b = S.kb[id];
    return Array.isArray(b) ? b : a.def.slice();
  }
  function rebuildKeys() {
    kmap = {}; blocked = {};
    let custom = false;
    ACTIONS.forEach((a) => {
      const b = S.kb[a.id];
      if (!Array.isArray(b)) return;
      if (b.length === a.def.length && b.every((c, i) => c === a.def[i])) return;
      custom = true;
    });
    if (!custom) { kmap = null; blocked = null; return; }
    // физические клавиши, назначенные действиям
    ACTIONS.forEach((a) => { binding(a.id).forEach((c) => { kmap[c] = a.def[0]; }); });
    // стандартные клавиши действий с переопределением, не занятые другим действием, — отключаем
    ACTIONS.forEach((a) => { if (!Array.isArray(S.kb[a.id])) return; a.def.forEach((c) => { if (!(c in kmap) || kmap[c] === undefined) blocked[c] = 1; }); });
    // клавиша по умолчанию, не тронутая настройками, остаётся самой собой, если ей не назначили другое
    ACTIONS.forEach((a) => { if (Array.isArray(S.kb[a.id])) return; a.def.forEach((c) => { if (!(c in kmap)) kmap[c] = c; }); });
  }
  function keyFor(c) {
    let m = /^Key([A-Z])$/.exec(c); if (m) return m[1].toLowerCase();
    m = /^Digit(\d)$/.exec(c); if (m) return m[1];
    if (/^Shift/.test(c)) return 'Shift';
    if (/^Control/.test(c)) return 'Control';
    if (/^Alt/.test(c)) return 'Alt';
    return c === 'Space' ? ' ' : c;
  }
  const isText = (t) => !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));
  function onKey(e) {
    if (!kmap || e.__nexa || !document.body.classList.contains('in-mission')) return;
    if (isText(e.target) || captureOn) return;
    const c = e.code;
    if (c === 'Escape' || /^F\d+$/.test(c)) return;
    let to = kmap[c];
    if (to === undefined && blocked[c]) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (to === undefined || to === c) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const ne = new KeyboardEvent(e.type, { code: to, key: keyFor(to), bubbles: true, cancelable: true, repeat: e.repeat, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey });
    ne.__nexa = true;
    (e.target || document).dispatchEvent(ne);
  }
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  rebuildKeys();

  const CODE_NAMES = { Space: 'SPACE', Escape: 'ESC', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT', Enter: 'ENTER', NumpadEnter: 'NUM-ENTER', Tab: 'TAB', Backspace: 'BACKSPACE', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', CapsLock: 'CAPS' };
  function codeName(c) {
    if (CODE_NAMES[c]) return CODE_NAMES[c];
    let m = /^Key([A-Z])$/.exec(c); if (m) return m[1];
    m = /^Digit(\d)$/.exec(c); if (m) return m[1];
    m = /^Numpad(.+)$/.exec(c); if (m) return 'NUM ' + m[1];
    return String(c || '').toUpperCase();
  }
  function keyLabel(id) { const b = binding(id); return b.length ? codeName(b[0]) : '—'; }

  // ------------------------------------------------------------------ геймпад: подмена navigator.getGamepads внутри миссии
  // Игра везде читает кнопки/оси через navigator.getGamepads(); отдаём «виртуальный» геймпад: кнопки переставлены по настройке,
  // стики можно поменять местами, инвертировать Y, подтянуть мёртвую зону и чувствительность правого стика.
  const nativeGet = navigator.getGamepads ? navigator.getGamepads.bind(navigator) : null;
  const IDLE = { pressed: false, touched: false, value: 0 };
  function virtualPad(g) {
    const P = S.pad, inM = document.body.classList.contains('in-mission');
    if (!inM) return g;
    const trivial = !Object.keys(P.map).length && !P.swap && !P.invertY && P.dead === 0 && P.sens === 100 && P.trig === 35 && P.rumble;
    if (trivial) return g;
    const btn = (i) => {
      const src = P.map[i] !== undefined ? P.map[i] : i, b = g.buttons[src] || IDLE;
      if (i === 6 || i === 7) { const v = b.value; const on = v > P.trig / 100; return { pressed: on, touched: b.touched || on, value: on ? Math.max(v, 0.4) : v * 0.5 }; }
      return b;
    };
    const buttons = []; for (let i = 0; i < g.buttons.length; i += 1) buttons.push(btn(i));
    let ax = Array.from(g.axes);
    while (ax.length < 4) ax.push(0);
    if (P.swap) ax = [ax[2], ax[3], ax[0], ax[1]].concat(ax.slice(4));
    if (P.invertY) { ax[3] = -ax[3]; }
    // дополнительная мёртвая зона (игра сама вычитает 0.18/0.12): масштабируем так, чтобы стик ощущался одинаково
    const extra = P.dead / 100;
    if (extra > 0.005) for (const k of [0, 2]) {
      const x = ax[k], y = ax[k + 1], m = Math.hypot(x, y);
      if (m < 1e-4) continue;
      const nm = m < extra ? 0 : (m - extra) / (1 - extra); ax[k] = x / m * nm; ax[k + 1] = y / m * nm;
    }
    const sn = P.sens / 100; ax[2] = clamp(ax[2] * sn, -1.6, 1.6); ax[3] = clamp(ax[3] * sn, -1.6, 1.6);
    return { id: g.id, index: g.index, connected: g.connected, mapping: g.mapping, timestamp: g.timestamp, axes: ax, buttons, vibrationActuator: P.rumble ? g.vibrationActuator : null, hapticActuators: P.rumble ? g.hapticActuators : [] };
  }
  if (nativeGet) {
    try {
      navigator.getGamepads = function () {
        const list = nativeGet(), out = [];
        for (let i = 0; i < list.length; i += 1) out.push(list[i] ? virtualPad(list[i]) : list[i]);
        return out;
      };
    } catch (e) { /* только для чтения — остаются родные кнопки */ }
  }

  // ------------------------------------------------------------------ сенсорный оверлей: переменные оформления на слое миссии
  function applyTouch(layer) {
    if (!layer) return;
    const T = S.touch;
    layer.style.setProperty('--tc-scale', String(clamp(T.scale, 60, 115) / 100));
    layer.style.setProperty('--tc-op', String(clamp(T.opacity, 15, 100) / 100));
    layer.style.setProperty('--tc-spread', String(clamp(T.spread, 70, 140) / 100));
    layer.classList.toggle('lefty', !!T.lefty);
    layer.classList.toggle('stick-fixed', T.stick === 'fixed');
    layer.classList.toggle('no-hints', !T.hints);
  }

  // ------------------------------------------------------------------ публичный API
  window.NexaSettings = {
    DEF, ACTIONS, PAD_ACTIONS,
    all() { return S; },
    get(path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), S); },
    set(path, v) {
      const ks = path.split('.'), last = ks.pop(), o = ks.reduce((p, k) => p[k], S);
      if (o[last] === v) return;
      o[last] = v; save(); emit(path);
    },
    setBinding(id, codes) { S.kb[id] = codes; save(); emit('kb.' + id); },
    resetBinding(id) { delete S.kb[id]; save(); emit('kb.' + id); },
    resetKeys() { S.kb = {}; save(); emit('kb'); },
    setPadButton(logical, physical) { if (physical === logical) delete S.pad.map[logical]; else S.pad.map[logical] = physical; save(); emit('pad.map'); },
    resetPad() { S.pad = JSON.parse(JSON.stringify(DEF.pad)); save(); emit('pad'); },
    resetGfx() { S.gfx = JSON.parse(JSON.stringify(DEF.gfx)); save(); emit('gfx'); },
    resetTouch() { S.touch = JSON.parse(JSON.stringify(DEF.touch)); save(); emit('touch'); },
    binding, keyLabel, codeName, gfx, autoPreset, detect, applyTouch,
    capture(on) { captureOn = !!on; },
    onChange(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    // отладка из консоли: NexaSettings.dump()
    dump() { return JSON.parse(JSON.stringify(S)); }
  };
}());
