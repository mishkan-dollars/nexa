// 3D-кнопки NEXA/OS: наклон плиты за курсором (только мышь), гарантированный «клик-прогиб» на сенсоре,
// публичный window.UI3D для геймпада (hot / press). Вся геометрия — в styles.css (переменные --rx/--ry/--ty).
(function () {
  'use strict';

  var SEL = '.action, .choice-card, button.mission-row, .link-button, .quiet, button.secondary';
  var fine = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  var cur = null, rect = null, mx = 0, my = 0, raf = 0, hot = null;

  function reset(el) {
    if (!el) return;
    el.style.removeProperty('--rx');
    el.style.removeProperty('--ry');
  }

  function frame() {
    raf = 0;
    if (!cur || !rect) return;
    var w = rect.width || 1, h = rect.height || 1;
    var nx = Math.max(-1, Math.min(1, ((mx - rect.left) / w - 0.5) * 2));
    var ny = Math.max(-1, Math.min(1, ((my - rect.top) / h - 0.5) * 2));
    // широкие плиты наклоняем слабее по Y, высокие карточки — слабее по X
    var maxY = w > 520 ? 2.2 : w > 260 ? 4 : 6;
    var maxX = h > 110 ? 3 : 5;
    cur.style.setProperty('--ry', (nx * maxY).toFixed(2) + 'deg');
    cur.style.setProperty('--rx', (-ny * maxX).toFixed(2) + 'deg');
  }

  function track(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var t = e.target && e.target.closest ? e.target.closest(SEL) : null;
    if (t && (t.disabled || t.classList.contains('is-down'))) t = null;
    if (t !== cur) {
      reset(cur);
      cur = t;
      rect = t ? t.getBoundingClientRect() : null;
    }
    if (!cur) return;
    mx = e.clientX; my = e.clientY;
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function leave() { reset(cur); cur = null; rect = null; }

  if (fine && !reduce) {
    document.addEventListener('pointermove', track, { passive: true });
    document.addEventListener('pointerleave', leave);
    document.documentElement.addEventListener('mouseleave', leave);
    window.addEventListener('scroll', function () { rect = cur ? cur.getBoundingClientRect() : null; }, { passive: true, capture: true });
    window.addEventListener('blur', leave);
  }

  // нажатие: класс .is-down живёт минимум 130 мс, чтобы даже короткий тап на Android был виден
  var downAt = 0, downEl = null;
  function down(e) {
    var t = e.target && e.target.closest ? e.target.closest(SEL) : null;
    if (!t || t.disabled) return;
    downEl = t; downAt = performance.now();
    reset(t);
    t.classList.add('is-down');
  }
  function up() {
    var t = downEl;
    if (!t) return;
    downEl = null;
    var wait = Math.max(0, 130 - (performance.now() - downAt));
    setTimeout(function () { t.classList.remove('is-down'); }, wait);
  }
  document.addEventListener('pointerdown', down, true);
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);
  document.addEventListener('dragend', up, true);

  window.UI3D = {
    // геймпад/клавиатура: подсветить плиту как «наведённую»
    hot: function (el) {
      if (hot && hot !== el) hot.classList.remove('u3d-hot');
      hot = el || null;
      if (hot) hot.classList.add('u3d-hot');
    },
    // программное нажатие (кнопка A на геймпаде)
    press: function (el, ms) {
      if (!el) return;
      el.classList.add('is-down');
      setTimeout(function () { el.classList.remove('is-down'); }, ms || 140);
    },
    selector: SEL
  };
})();
