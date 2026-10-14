// NEXA/OS: вкладки настроек (GENERAL / AUDIO / GRAPHICS / KEYBOARD / GAMEPAD / MOBILE) внутри #settings.
// Старые элементы (язык, звук, качество, чувствительность, кровь) остаются в разметке — их привязывает app.js; здесь строятся расширенная графика,
// переназначение клавиш, кнопки и стики геймпада, оверлей телефона. Все подписи — английский исходник; перевод RU/DE — js/i18n-settings.js.
(function () {
  'use strict';
  const NS = window.NexaSettings;
  if (!NS) return;
  const $ = (s, r) => (r || document).querySelector(s);
  function h(tag, attrs, kids) {
    const e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => { if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach((c) => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  }
  let uid = 0;
  const nid = () => 'set-c' + (uid += 1);

  // ------------------------------------------------------------------ строительные блоки
  function row(label, control, hint) {
    const id = control.id || (control.id = nid());
    const r = h('div', { class: 'set-row' });
    const l = h('label', { for: id, text: label });
    r.appendChild(l); r.appendChild(control.wrap || control);
    if (hint) r.appendChild(h('p', { class: 'set-hint small muted', text: hint }));
    return r;
  }
  function select(path, opts) {
    const s = h('select', {});
    opts.forEach((o) => s.appendChild(h('option', { value: String(o[0]), text: o[1] })));
    const num = typeof NS.get(path) === 'number';
    s.value = String(NS.get(path));
    s.addEventListener('change', () => NS.set(path, num ? Number(s.value) : s.value));
    s.sync = () => { s.value = String(NS.get(path)); };
    return s;
  }
  function bselect(path, labelFalse, labelTrue) {
    const s = h('select', {});
    [[false, labelFalse], [true, labelTrue]].forEach((o) => s.appendChild(h('option', { value: String(o[0]), text: o[1] })));
    s.value = String(!!NS.get(path));
    s.addEventListener('change', () => NS.set(path, s.value === 'true'));
    return s;
  }
  function check(path) {
    const c = h('input', { type: 'checkbox' });
    c.checked = !!NS.get(path);
    c.addEventListener('change', () => NS.set(path, c.checked));
    c.sync = () => { c.checked = !!NS.get(path); };
    return c;
  }
  // ползунок: to — перевод значение настройки ⇄ положение (для «по умолчанию»), fmt — подпись справа
  function range(path, min, max, step, fmt, map) {
    const wrap = h('div', { class: 'set-range' });
    const inp = h('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
    const out = h('output', {});
    const toPos = map ? map.to : (v) => v, fromPos = map ? map.from : (v) => v;
    const show = () => { const v = NS.get(path); out.textContent = fmt ? fmt(v) : v; };
    inp.value = String(toPos(NS.get(path)));
    inp.addEventListener('input', () => { NS.set(path, fromPos(Number(inp.value))); show(); });
    wrap.appendChild(inp); wrap.appendChild(out); show();
    wrap.id = nid(); inp.id = wrap.id + 'i';
    wrap.wrap = wrap; wrap.sync = () => { inp.value = String(toPos(NS.get(path))); show(); };
    const holder = { id: inp.id, wrap, sync: wrap.sync };
    return holder;
  }
  const pct = (v) => v + '%';

  // ------------------------------------------------------------------ вкладки
  const dlg = $('#settings');
  if (!dlg) return;
  const tabs = dlg.querySelectorAll('#set-tabs [role=tab]'), panes = dlg.querySelectorAll('.set-pane');
  function openTab(name) {
    tabs.forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === name ? 'true' : 'false'));
    panes.forEach((p) => { p.hidden = p.dataset.pane !== name; });
    try { sessionStorage.setItem('setTab', name); } catch (e) { /* без хранилища */ }
    if (name === 'gamepad') startPadPoll(); else stopPadPoll();
    if (name !== 'keyboard') cancelCapture();
    if (name === 'mobile') refreshPreview();
  }
  tabs.forEach((t) => t.addEventListener('click', () => openTab(t.dataset.tab)));
  dlg.addEventListener('close', () => { stopPadPoll(); cancelCapture(); });
  const openBtn = document.getElementById('open-settings');
  if (openBtn) openBtn.addEventListener('click', () => { let n = 'general'; try { n = sessionStorage.getItem('setTab') || n; } catch (e) { /* без хранилища */ } openTab(n); refreshDevice(); });

  // ------------------------------------------------------------------ GRAPHICS
  const gfxRoot = $('#set-gfx');
  const gfxCtl = [];
  function buildGfx() {
    gfxRoot.textContent = '';
    gfxCtl.length = 0;
    const add = (label, ctl, hint) => { gfxCtl.push(ctl.sync ? ctl : (ctl.wrap || ctl)); gfxRoot.appendChild(row(label, ctl, hint)); };
    gfxRoot.appendChild(h('h3', { text: 'PICTURE' }));
    add('RENDER SCALE', range('gfx.scale', 50, 200, 5, pct), 'Above 100% renders more pixels than the screen shows (sharper, heavier). Below 100% is faster.');
    add('ADAPTIVE RESOLUTION', check('gfx.adaptive'), 'Lowers the render scale by itself when the frame rate drops.');
    add('FPS LIMIT', select('gfx.fpsCap', [[0, 'DEFAULT'], [30, '30'], [45, '45'], [60, '60'], [90, '90'], [120, '120']]));
    add('FIELD OF VIEW', range('gfx.fov', 55, 110, 1, (v) => (v ? v + '°' : 'DEFAULT'), { to: (v) => (v ? v : 55), from: (p) => (p <= 55 ? 0 : p) }));
    gfxRoot.appendChild(h('h3', { text: 'QUALITY OPTIONS' }));
    add('SHADOWS', select('gfx.shadows', [['auto', 'AUTO'], ['off', 'OFF'], ['on', 'ON'], ['high', 'HIGH']]));
    add('ANTI-ALIASING', select('gfx.aa', [['auto', 'AUTO'], ['off', 'OFF'], ['fxaa', 'FXAA'], ['msaa', 'MSAA x4']]), 'MSAA needs WebGL 2; FXAA is cheap and works everywhere.');
    add('POST-PROCESSING', select('gfx.fx', [['auto', 'AUTO'], ['none', 'NONE'], ['lite', 'LITE'], ['full', 'FULL']]));
    add('GLOW (BLOOM)', select('gfx.bloom', [['auto', 'AUTO'], ['off', 'OFF'], ['low', 'LOW'], ['high', 'HIGH']]));
    add('TONE MAPPING', select('gfx.tone', [['auto', 'AUTO'], ['off', 'OFF'], ['on', 'ON']]));
    add('PARTICLES', range('gfx.parts', 25, 200, 5, pct));
    add('DYNAMIC LIGHTS', select('gfx.lamps', [[0, 'AUTO'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [8, '8']]));
    add('VIEW DISTANCE', range('gfx.fog', 60, 200, 5, pct));
    gfxRoot.appendChild(h('h3', { text: 'SCREEN LOOK' }));
    add('LENS DISTORTION', range('gfx.lens', 0, 150, 5, pct));
    add('CHROMATIC ABERRATION', range('gfx.chroma', 0, 200, 5, pct));
    add('FILM GRAIN', range('gfx.grain', 0, 200, 5, pct));
    add('VIGNETTE', range('gfx.vignette', 0, 150, 5, pct));
    add('SATURATION', range('gfx.sat', 50, 150, 5, pct));
    add('CONTRAST', range('gfx.contrast', 70, 130, 5, pct));
    add('MOTION BLUR', check('gfx.mblur'));
    gfxRoot.appendChild(h('h3', { text: 'COMFORT' }));
    add('SCREEN SHAKE', range('gfx.shake', 0, 150, 5, pct));
    add('FLASHES AND SCREEN EFFECTS', check('gfx.flashes'), 'Turn off for a safer picture: flashes become dim and shaking is limited.');
    add('SHOW FPS', check('gfx.fps'));
    const act = h('div', { class: 'set-actions' });
    const reset = h('button', { type: 'button', class: 'secondary', text: 'RESET GRAPHICS' });
    reset.addEventListener('click', () => { NS.resetGfx(); buildGfx(); });
    act.appendChild(reset);
    gfxRoot.appendChild(act);
    gfxRoot.appendChild(h('p', { class: 'small muted', text: 'Graphics changes apply from the next mission.' }));
  }
  buildGfx();
  function refreshDevice() {
    const p = $('#gfx-device'); if (!p) return;
    const d = NS.detect();
    p.textContent = 'Device: ' + (d.renderer || 'unknown GPU') + ' · ' + (d.touch ? 'touch screen' : 'mouse and keyboard') + ' · AUTO picks ' + NS.autoPreset();
  }
  refreshDevice();

  // ------------------------------------------------------------------ KEYBOARD
  const KB_LABELS = {
    forward: 'MOVE FORWARD', back: 'MOVE BACK', left: 'MOVE LEFT', right: 'MOVE RIGHT', run: 'RUN', use: 'INTERACT / USE', reload: 'RELOAD', swap: 'NEXT WEAPON',
    slot1: 'WEAPON SLOT 1', slot2: 'WEAPON SLOT 2', slot3: 'WEAPON SLOT 3', crouch: 'CROUCH / SLIDE', fists: 'FISTS', kick: 'KICK', leanL: 'LEAN LEFT', leanR: 'LEAN RIGHT',
    gadget: 'USE GADGET', gadgetNext: 'NEXT GADGET', boom: 'DETONATE / EMOTE WHEEL', ab1: 'ABILITY 1', ab2: 'ABILITY 2', ab3: 'ABILITY 3'
  };
  const kbRoot = $('#set-kb');
  let cap = null;     // { id, slot, btn }
  function cancelCapture() { if (!cap) return; const c = cap; cap = null; NS.capture(false); window.removeEventListener('keydown', onCapKey, true); if (c.btn) c.btn.classList.remove('wait'); buildKb(); }
  const RESERVED = /^(Escape|F\d+|ContextMenu|MetaLeft|MetaRight|OSLeft|OSRight)$/;
  function onCapKey(e) {
    if (!cap) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (e.code === 'Escape') { cancelCapture(); return; }
    const id = cap.id, slot = cap.slot, cur = NS.binding(id).slice();
    if (e.code === 'Backspace' || e.code === 'Delete') { cur.splice(slot, 1); finish(id, cur); return; }
    if (RESERVED.test(e.code)) return;
    // клавиша уже занята другим действием — снимаем её там
    NS.ACTIONS.forEach((a) => { if (a.id === id) return; const b = NS.binding(a.id); if (b.indexOf(e.code) >= 0) { NS.setBinding(a.id, b.filter((c) => c !== e.code)); } });
    const dup = cur.indexOf(e.code); if (dup >= 0 && dup !== slot) cur.splice(dup, 1);
    cur[Math.min(slot, cur.length)] = e.code;
    finish(id, cur.filter(Boolean));
  }
  function finish(id, codes) { NS.setBinding(id, codes); cap = null; NS.capture(false); window.removeEventListener('keydown', onCapKey, true); buildKb(); }
  function buildKb() {
    kbRoot.textContent = '';
    kbRoot.appendChild(h('p', { class: 'small muted', text: 'Click a key box, then press the new key. Backspace clears a box, Esc cancels. Two keys per action are possible. Mouse buttons: left fires, right aims.' }));
    const table = h('div', { class: 'kb-table' });
    NS.ACTIONS.forEach((a) => {
      const keys = NS.binding(a.id), r = h('div', { class: 'kb-row' });
      r.appendChild(h('span', { class: 'kb-name', text: KB_LABELS[a.id] || a.id }));
      const boxes = h('span', { class: 'kb-keys' });
      for (let slot = 0; slot < 2; slot += 1) {
        const b = h('button', { type: 'button', class: 'kb-key' + (keys[slot] ? '' : ' empty'), text: keys[slot] ? NS.codeName(keys[slot]) : '—' });
        b.addEventListener('click', () => {
          cancelCapture();
          const nb = kbRoot.querySelectorAll('.kb-row')[NS.ACTIONS.indexOf(a)].querySelectorAll('.kb-key')[slot];
          cap = { id: a.id, slot, btn: nb }; NS.capture(true);
          nb.classList.add('wait'); nb.textContent = 'PRESS A KEY';
          window.addEventListener('keydown', onCapKey, true);
        });
        boxes.appendChild(b);
      }
      r.appendChild(boxes);
      const same = Array.isArray(NS.all().kb[a.id]) ? false : true;
      const rs = h('button', { type: 'button', class: 'kb-reset quiet' + (same ? ' off' : ''), text: '↺', title: 'Reset to default', 'aria-label': 'Reset to default' });
      rs.addEventListener('click', () => { NS.resetBinding(a.id); buildKb(); });
      r.appendChild(rs);
      table.appendChild(r);
    });
    kbRoot.appendChild(table);
    const act = h('div', { class: 'set-actions' });
    const all = h('button', { type: 'button', class: 'secondary', text: 'RESET ALL KEYS' });
    all.addEventListener('click', () => { NS.resetKeys(); buildKb(); });
    act.appendChild(all); kbRoot.appendChild(act);
  }
  buildKb();

  // ------------------------------------------------------------------ GAMEPAD
  const padRoot = $('#set-pad');
  const PAD_NAMES = ['A (✕)', 'B (○)', 'X (□)', 'Y (△)', 'LB (L1)', 'RB (R1)', 'LT (L2)', 'RT (R2)', 'SELECT (SHARE)', 'START (OPTIONS)', 'L3', 'R3', 'D-PAD UP', 'D-PAD DOWN', 'D-PAD LEFT', 'D-PAD RIGHT'];
  const PAD_LABELS = { use: 'USE / CONFIRM', gadget: 'THROW GADGET', reload: 'RELOAD', swap: 'SWAP WEAPON', prevWeapon: 'PREVIOUS WEAPON', nextWeapon: 'NEXT WEAPON', aim: 'AIM', fire: 'FIRE', kick: 'KICK', pause: 'PAUSE', run: 'RUN (TOGGLE)', crouch: 'CROUCH (TAP) / FISTS (HOLD)' };
  let padTimer = null, padBind = null, padStatusEl = null, padLive = null;
  function nativePad() { try { const l = navigator.getGamepads ? navigator.getGamepads() : []; for (let i = 0; i < l.length; i += 1) if (l[i] && l[i].connected) return l[i]; } catch (e) { /* нет геймпада */ } return null; }
  function buildPad() {
    padRoot.textContent = '';
    padStatusEl = h('p', { class: 'small' });
    padRoot.appendChild(padStatusEl);
    padLive = h('div', { class: 'pad-live' });
    for (let i = 0; i < 16; i += 1) padLive.appendChild(h('i', { title: PAD_NAMES[i], text: String(i) }));
    padRoot.appendChild(padLive);
    padRoot.appendChild(h('p', { class: 'small muted', text: 'Click a button box, then press the button on your controller. The picture above lights up the buttons you press.' }));
    const table = h('div', { class: 'kb-table' });
    NS.PAD_ACTIONS.forEach((a) => {
      const phys = NS.all().pad.map[a.idx] !== undefined ? NS.all().pad.map[a.idx] : a.idx, r = h('div', { class: 'kb-row' });
      r.appendChild(h('span', { class: 'kb-name', text: PAD_LABELS[a.id] || a.id }));
      const b = h('button', { type: 'button', class: 'kb-key wide' + (phys === a.idx ? '' : ' changed'), text: PAD_NAMES[phys] || String(phys) });
      b.addEventListener('click', () => { padBind = { a, btn: b }; b.classList.add('wait'); b.textContent = 'PRESS A BUTTON'; });
      r.appendChild(b);
      const rs = h('button', { type: 'button', class: 'kb-reset quiet' + (phys === a.idx ? ' off' : ''), text: '↺', title: 'Reset to default', 'aria-label': 'Reset to default' });
      rs.addEventListener('click', () => { NS.setPadButton(a.idx, a.idx); buildPad(); });
      r.appendChild(rs);
      table.appendChild(r);
    });
    padRoot.appendChild(table);
    const set = h('div', { class: 'set-block' });
    set.appendChild(row('LOOK SENSITIVITY', range('pad.sens', 40, 200, 5, pct)));
    set.appendChild(row('EXTRA DEAD ZONE', range('pad.dead', 0, 30, 1, pct), 'Raise it if the camera drifts without touching the stick.'));
    set.appendChild(row('TRIGGER THRESHOLD', range('pad.trig', 10, 90, 5, pct)));
    set.appendChild(row('SWAP STICKS', check('pad.swap'), 'Left stick looks, right stick moves.'));
    set.appendChild(row('INVERT LOOK Y', check('pad.invertY')));
    set.appendChild(row('VIBRATION', check('pad.rumble')));
    padRoot.appendChild(set);
    const act = h('div', { class: 'set-actions' });
    const rs = h('button', { type: 'button', class: 'secondary', text: 'RESET GAMEPAD' });
    rs.addEventListener('click', () => { NS.resetPad(); buildPad(); });
    act.appendChild(rs); padRoot.appendChild(act);
  }
  function padTick() {
    const g = nativePad();
    if (padStatusEl) padStatusEl.textContent = g ? 'Connected: ' + String(g.id).slice(0, 60) : 'No controller found. Connect one and press any button.';
    if (!g) { if (padLive) Array.prototype.forEach.call(padLive.children, (c) => c.classList.remove('on')); return; }
    if (padLive) for (let i = 0; i < 16; i += 1) { const b = g.buttons[i]; padLive.children[i].classList.toggle('on', !!(b && b.pressed)); }
    if (padBind) {
      for (let i = 0; i < g.buttons.length; i += 1) {
        if (g.buttons[i] && g.buttons[i].pressed && i !== 9 || (g.buttons[i] && g.buttons[i].pressed && i === 9 && padBind.a.idx === 9)) {
          const idx = padBind.a.idx; padBind = null;
          NS.setPadButton(idx, i); buildPad(); return;
        }
      }
    }
  }
  function startPadPoll() { if (padTimer) return; buildPad(); padTimer = setInterval(padTick, 80); }
  function stopPadPoll() { if (padTimer) { clearInterval(padTimer); padTimer = null; } padBind = null; }

  // ------------------------------------------------------------------ MOBILE
  const tRoot = $('#set-touch');
  let preview = null;
  function buildTouch() {
    tRoot.textContent = '';
    tRoot.appendChild(h('p', { class: 'small muted', text: 'These settings change the on-screen controls on phones and tablets. To try them on a computer open the game with ?touch=1 at the end of the address.' }));
    preview = h('div', { class: 'tc-preview' }, [
      h('div', { class: 'tc-stick' }), h('div', { class: 'tc-pad' }, [h('i', { class: 'a', text: 'FIRE' }), h('i', { class: 'b', text: 'AIM' }), h('i', { class: 'c', text: 'E' }), h('i', { class: 'd', text: 'RUN' })])
    ]);
    tRoot.appendChild(preview);
    tRoot.appendChild(row('BUTTON SIZE', range('touch.scale', 60, 115, 5, pct)));
    tRoot.appendChild(row('BUTTON OPACITY', range('touch.opacity', 15, 100, 5, pct)));
    tRoot.appendChild(row('LAYOUT', bselect('touch.lefty', 'RIGHT-HANDED', 'LEFT-HANDED'), 'Left-handed mirrors the controls: the stick moves to the right side.'));
    tRoot.appendChild(row('MOVE STICK', select('touch.stick', [['float', 'FLOATING (APPEARS WHERE YOU TOUCH)'], ['fixed', 'FIXED (ALWAYS VISIBLE)']])));
    tRoot.appendChild(row('LOOK SENSITIVITY', range('touch.look', 40, 220, 5, pct)));
    tRoot.appendChild(row('STICK DEAD ZONE', range('touch.dead', 0, 40, 1, pct)));
    tRoot.appendChild(row('VIBRATION (HAPTICS)', check('touch.haptics')));
    tRoot.appendChild(row('SHOW CONTROL HINTS', check('touch.hints')));
    const act = h('div', { class: 'set-actions' });
    const rs = h('button', { type: 'button', class: 'secondary', text: 'RESET MOBILE CONTROLS' });
    rs.addEventListener('click', () => { NS.resetTouch(); buildTouch(); });
    act.appendChild(rs); tRoot.appendChild(act);
    refreshPreview();
  }
  function refreshPreview() {
    if (!preview) return;
    NS.applyTouch(preview);
    preview.classList.toggle('stick-fixed', NS.get('touch.stick') === 'fixed');
  }
  buildTouch();

  // любое изменение настроек обновляет оформление; при выборе пресета/сенсорных значений — предпросмотр
  NS.onChange((what) => { if (/^touch/.test(what)) refreshPreview(); });

  let tab0 = 'general'; try { tab0 = sessionStorage.getItem('setTab') || tab0; } catch (e) { /* без хранилища */ }
  openTab(tab0);
}());
