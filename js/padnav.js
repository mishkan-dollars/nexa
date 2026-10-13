// NEXA/OS: управление лобби геймпадом (в т.ч. приставочные браузеры без мыши и клавиатуры).
// Крестовина/левый стик — переход к ближайшей плите в нужную сторону, A — нажать, B — назад, START — настройки.
// Диапазоны (range) и списки (select) меняются влево/вправо. Для числовых полей (?classic) есть экранная цифровая панель.
// Внутри миссии и за 3D-столом свой ввод (combat.js / table.js): здесь активно только лобби, диалоги и экран загрузки миссии.
// window.PadGlyph.fmt('A USE | RT FIRE') подменяет названия кнопок под тип контроллера (Xbox / PlayStation / Switch).
(function () {
  'use strict';

  var CAND = 'button, a[href], input:not([type=hidden]), select, summary, textarea, [data-action], .choice-card, .mission-row, [data-padnav]';
  var S = { on: false, cur: null, prev: [], dir: null, dirT: 0, dirN: 0, osk: null, kind: 'xbox', seen: false };
  var hintEl = null;

  // -------------------------------------------------------------- геймпад и глифы
  function getPad() {
    try {
      var l = navigator.getGamepads ? navigator.getGamepads() : [];
      for (var i = 0; i < l.length; i += 1) if (l[i] && l[i].connected) return l[i];
    } catch (e) {}
    return null;
  }
  function kindOf(g) {
    var id = String((g && g.id) || '').toLowerCase();
    if (/054c|dualsense|dualshock|playstation|wireless controller/.test(id)) return 'ps';
    if (/057e|nintendo|switch|joy-con|pro controller/.test(id)) return 'ns';
    return 'xbox';
  }
  var GL = {
    xbox: { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', L3: 'L3', R3: 'R3', START: 'START', BACK: 'BACK' },
    ps: { A: '✕', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', L3: 'L3', R3: 'R3', START: 'OPTIONS', BACK: 'SHARE' },
    ns: { A: 'B', B: 'A', X: 'Y', Y: 'X', LB: 'L', RB: 'R', LT: 'ZL', RT: 'ZR', L3: 'L3', R3: 'R3', START: '+', BACK: '−' }
  };
  var TOK = /\b(START|BACK|LB|RB|LT|RT|L3|R3|A|B|X|Y)\b/g;
  window.PadGlyph = {
    kind: function () { var g = getPad(); if (g) S.kind = kindOf(g); return S.kind; },
    name: function (t) { var m = GL[this.kind()]; return m[t] || t; },
    // заменяет токены кнопок в строке подсказки; токены (A, B, X, Y) — отдельные слова, поэтому вызывать только на строках про геймпад
    fmt: function (s) { var m = GL[this.kind()]; if (window.I18N) s = I18N.t(String(s)); return String(s).replace(TOK, function (t) { return m[t] || t; }); }
  };

  // -------------------------------------------------------------- область навигации
  function visible(el) {
    if (!el || el.disabled || el.hidden) return false;
    if (el.closest('[hidden], [inert]')) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') return false;
    return true;
  }
  function rootEl() {
    var pre = document.getElementById('nexa-preload');
    if (pre && !pre.hidden) return null; // экран загрузки управляет собой (preload.js)
    var run = window.Missions && window.Missions.current;
    if (run) return run.entered ? null : (run.layer || null);
    var dlg = document.querySelector('dialog[open]');
    if (dlg) return dlg;
    var disc = document.getElementById('disclaimer');
    if (disc && !disc.hidden) return disc;
    return document.body;
  }
  function cands(root) {
    var out = [], all = root.querySelectorAll(CAND);
    for (var i = 0; i < all.length; i += 1) {
      var el = all[i];
      if (el.id === 'brand' || el.closest('#padosk, #padhint, #nexa-preload')) continue;
      if (el.tagName === 'INPUT' && el.type === 'checkbox' && !visible(el)) { // скрытые чекбоксы-переключатели: целимся в подпись
        var lb = el.closest('label'); if (lb && visible(lb) && out.indexOf(lb) < 0) out.push(lb);
        continue;
      }
      if (visible(el)) out.push(el);
    }
    return out;
  }
  function rectOf(el) { var r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 }; }
  function scrollParent(el) {
    for (var p = el; p && p !== document.body; p = p.parentElement) {
      var o = getComputedStyle(p).overflowY;
      if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 4) return p;
    }
    return document.scrollingElement || document.documentElement;
  }

  function setHot(el) {
    S.cur = el || null;
    if (window.UI3D) window.UI3D.hot(el);
    if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { el.scrollIntoView(); } }
  }
  function initial(c) {
    var pref = null;
    for (var i = 0; i < c.length; i += 1) {
      if (c[i].matches('.primary, .m-enter, [data-action="accept-task"], [data-action="start-mission"]')) { pref = c[i]; break; }
    }
    if (!pref) {
      var best = Infinity; // иначе — ближайшая к верху-центру экрана
      for (var j = 0; j < c.length; j += 1) { var r = rectOf(c[j]), d = r.cy + Math.abs(r.cx - innerWidth / 2) * 0.5; if (d < best) { best = d; pref = c[j]; } }
    }
    return pref;
  }

  function move(dx, dy) {
    var root = rootEl(); if (!root) return;
    var c = cands(root); if (!c.length) return;
    var cur = S.cur && c.indexOf(S.cur) >= 0 ? S.cur : null;
    if (!cur) { setHot(initial(c)); return; }
    // range / select: влево-вправо меняют значение, а не уходят на другую плиту
    if (dx && cur.tagName === 'INPUT' && cur.type === 'range') { adjust(cur, dx); return; }
    if (dx && cur.tagName === 'SELECT') { cycle(cur, dx); return; }
    var a = rectOf(cur), best = null, bs = Infinity;
    for (var i = 0; i < c.length; i += 1) {
      var el = c[i]; if (el === cur || cur.contains(el) || el.contains(cur)) continue;
      var b = rectOf(el), ex = b.cx - a.cx, ey = b.cy - a.cy;
      var along = dx * ex + dy * ey; if (along <= 4) continue;
      var perp = Math.abs(dx ? ey : ex);
      var overlap = dx ? Math.min(a.b, b.b) - Math.max(a.t, b.t) : Math.min(a.r, b.r) - Math.max(a.l, b.l);
      if (overlap <= 0 && perp > along * 2.2) continue;
      var score = along + perp * (overlap > 0 ? 0.6 : 3);
      if (score < bs) { bs = score; best = el; }
    }
    if (best) { setHot(best); return; }
    if (dy) { var sp = scrollParent(cur); if (sp) sp.scrollBy ? sp.scrollBy({ top: dy * 160 }) : (sp.scrollTop += dy * 160); }
  }

  function fire(el, name) { var e = document.createEvent('Event'); e.initEvent(name, true, true); el.dispatchEvent(e); }
  function adjust(el, d) {
    var mn = +el.min || 0, mx = +el.max || 100, st = +el.step || 1, big = Math.max(st, (mx - mn) / 20);
    el.value = Math.max(mn, Math.min(mx, +el.value + d * big));
    fire(el, 'input'); fire(el, 'change');
  }
  function cycle(el, d) {
    var n = el.options.length; if (!n) return;
    el.selectedIndex = (el.selectedIndex + d + n) % n;
    fire(el, 'input'); fire(el, 'change');
  }

  function activate(el) {
    if (!el) return;
    if (window.UI3D) window.UI3D.press(el);
    var t = el.tagName;
    if (t === 'INPUT' && (el.type === 'text' || el.type === 'number' || el.type === 'tel' || !el.type)) { openOsk(el); return; }
    if (t === 'SELECT') { cycle(el, 1); return; }
    if (t === 'INPUT' && el.type === 'range') return;
    el.click();
  }
  function back() {
    var dlg = document.querySelector('dialog[open]');
    if (dlg) { try { dlg.close(); } catch (e) {} return; }
    var disc = document.getElementById('disclaimer');
    if (disc && !disc.hidden) { var ok = disc.querySelector('button'); ok && ok.click(); return; }
    var run = window.Missions && window.Missions.current;
    if (run) { var rb = run.layer && run.layer.querySelector('.m-back:not([hidden]), .m-abort'); rb && rb.click(); return; }
    var b = document.querySelector('#screen [data-action="menu"]');
    if (b && visible(b)) { if (window.UI3D) window.UI3D.press(b); b.click(); }
  }
  function startBtn() {
    var dlg = document.querySelector('dialog[open]');
    if (dlg) { try { dlg.close(); } catch (e) {} return; }
    if (window.Missions && window.Missions.current) return;
    var b = document.getElementById('open-settings'); b && b.click();
  }

  // -------------------------------------------------------------- цифровая экранная панель (для ?classic и любых numeric-полей)
  var OSK_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
  function openOsk(inp) {
    closeOsk();
    var el = document.createElement('div'); el.id = 'padosk';
    el.innerHTML = '<div class="po-val"></div><div class="po-grid">' + OSK_KEYS.map(function (k, i) { return '<button type="button" data-i="' + i + '">' + k + '</button>'; }).join('') + '</div><div class="po-hint"></div>';
    document.body.appendChild(el);
    S.osk = { el: el, inp: inp, sel: 4 };
    S.osk.el.querySelectorAll('button').forEach(function (b, i) { b.addEventListener('pointerdown', function (e) { e.preventDefault(); S.osk.sel = i; oskPress(); }); });
    oskDraw();
  }
  function closeOsk() { if (S.osk) { S.osk.el.remove(); S.osk = null; } }
  function oskDraw() {
    var o = S.osk; if (!o) return;
    o.el.querySelector('.po-val').textContent = o.inp.value || '—';
    o.el.querySelectorAll('button').forEach(function (b, i) { b.classList.toggle('sel', i === o.sel); });
    o.el.querySelector('.po-hint').textContent = window.PadGlyph.fmt('A TYPE  |  X ERASE  |  Y SUBMIT  |  B CLOSE');
  }
  function oskSet(v) { var i = S.osk.inp; i.value = v; fire(i, 'input'); oskDraw(); }
  function oskSubmit() {
    var inp = S.osk && S.osk.inp, form = inp && inp.closest('form'); closeOsk();
    if (form) { if (form.requestSubmit) form.requestSubmit(); else fire(form, 'submit'); }
  }
  function oskPress() {
    var o = S.osk, k = OSK_KEYS[o.sel], v = o.inp.value || '', max = +o.inp.maxLength > 0 ? +o.inp.maxLength : 6;
    if (k === '⌫') oskSet(v.slice(0, -1));
    else if (k === 'OK') oskSubmit();
    else if (v.length < max) oskSet(v + k);
  }
  function oskMove(dx, dy) {
    var o = S.osk, r = Math.floor(o.sel / 3), c = o.sel % 3;
    c = Math.max(0, Math.min(2, c + dx)); r = Math.max(0, Math.min(3, r + dy)); o.sel = r * 3 + c; oskDraw();
  }

  // -------------------------------------------------------------- подсказка и цикл опроса
  function hint(show) {
    if (!hintEl) {
      hintEl = document.createElement('div'); hintEl.id = 'padhint'; hintEl.setAttribute('aria-hidden', 'true'); document.body.appendChild(hintEl);
    }
    if (show) hintEl.textContent = window.PadGlyph.fmt('D-PAD / L-STICK  SELECT   |   A  OK   |   B  BACK   |   START  SETTINGS');
    hintEl.classList.toggle('on', !!show);
  }
  function deactivate() {
    if (!S.on) return;
    S.on = false; closeOsk(); if (window.UI3D) window.UI3D.hot(null); S.cur = null; hint(false);
  }

  function tick() {
    var g = getPad();
    if (!g) { if (S.on) deactivate(); return; }
    var b = function (i) { return !!(g.buttons[i] && g.buttons[i].pressed); };
    var ax = g.axes || [], lx = ax[0] || 0, ly = ax[1] || 0;
    var dx = b(15) ? 1 : b(14) ? -1 : (lx > 0.6 ? 1 : lx < -0.6 ? -1 : 0);
    var dy = b(13) ? 1 : b(12) ? -1 : (ly > 0.6 ? 1 : ly < -0.6 ? -1 : 0);
    if (dx && dy) { if (Math.abs(lx) > Math.abs(ly)) dy = 0; else dx = 0; }
    var edge = function (i) { return b(i) && !S.prev[i]; };
    var any = dx || dy || edge(0) || edge(1) || edge(2) || edge(3) || edge(9);
    var root = rootEl();
    if (!root) { for (var k = 0; k < 16; k += 1) S.prev[k] = b(k); if (S.on) deactivate(); return; }
    if (!S.on) {
      if (!any) { for (var q = 0; q < 16; q += 1) S.prev[q] = b(q); return; }
      S.on = true; hint(true);
      if (!S.cur) { var c0 = cands(root); if (c0.length) { setHot(initial(c0)); if (!edge(9)) { for (var z = 0; z < 16; z += 1) S.prev[z] = b(z); return; } } } // первое нажатие только «будит» навигацию, но START работает сразу
    }
    // направление: сразу при нажатии, затем автоповтор
    var now = performance.now();
    if (dx || dy) {
      var same = S.dir && S.dir[0] === dx && S.dir[1] === dy;
      if (!same) { S.dir = [dx, dy]; S.dirN = 0; S.dirT = now + 400; if (S.osk) oskMove(dx, dy); else move(dx, dy); }
      else if (now >= S.dirT) { S.dirT = now + 120; if (S.osk) oskMove(dx, dy); else move(dx, dy); }
    } else S.dir = null;
    if (S.osk) {
      if (edge(0)) oskPress();
      else if (edge(2)) oskSet((S.osk.inp.value || '').slice(0, -1));
      else if (edge(3)) oskSubmit();
      else if (edge(1)) closeOsk();
    } else {
      if (edge(0)) { var cc = cands(root); if (!S.cur || cc.indexOf(S.cur) < 0) setHot(initial(cc)); else activate(S.cur); }
      else if (edge(1)) back();
      else if (edge(9)) startBtn();
    }
    // если текущая плита исчезла (перерисовка экрана, закрылся дисклеймер, открылись настройки) — подхватываем ближайшую в новой области
    root = rootEl() || root; // кнопка могла закрыть/открыть диалог — область пересчитываем
    if (S.on && !S.osk && S.cur && (!document.contains(S.cur) || !root.contains(S.cur) || !visible(S.cur))) { var c1 = cands(root); S.cur = null; if (c1.length) setHot(initial(c1)); else if (window.UI3D) window.UI3D.hot(null); }
    for (var i = 0; i < 16; i += 1) S.prev[i] = b(i);
  }

  // мышь/тач забирают управление обратно
  document.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse' && S.on && (Math.abs(e.movementX) + Math.abs(e.movementY) > 2)) deactivate(); }, { passive: true });
  document.addEventListener('pointerdown', function () { deactivate(); }, true);
  document.addEventListener('keydown', function (e) { if (S.on && e.code !== 'Escape') deactivate(); }, true);
  window.addEventListener('gamepaddisconnected', function () { deactivate(); });
  setInterval(tick, 33);

  window.PadNav = { get active() { return S.on; }, tick: tick, move: move, activate: function () { activate(S.cur); }, get current() { return S.cur; } };
}());
