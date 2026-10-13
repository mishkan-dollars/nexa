// Кастомный курсор NEXA: один HTML-элемент, без canvas. Включается только для мыши (pointer: fine).
(function () {
  'use strict';

  if (!window.matchMedia || !matchMedia('(pointer: fine)').matches) return;

  var el = document.createElement('div');
  el.id = 'nx-cursor';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<i></i><b></b><span>[E]</span>';
  if ('popover' in el) el.setAttribute('popover', 'manual'); // top-layer: курсор остаётся над <dialog> и слоем миссии
  document.body.appendChild(el);
  document.documentElement.classList.add('nx-cursor');

  var x = -50, y = -50, queued = false, hoverEl = null, state = '';
  var HOVER = 'button, a, summary, label, select, input[type=checkbox], input[type=range], [data-action]';
  var TEXT = 'input[type=text], textarea';

  function popoverUp() {
    if (el.showPopover) {
      try { el.hidePopover(); } catch (e) {}
      try { el.showPopover(); } catch (e) {}
    }
  }

  function setState(next) {
    if (next === state) return;
    state = next;
    el.className = next;
  }

  function classify(target) {
    hoverEl = null;
    if (!target || !target.closest) return '';
    var t = target.closest(TEXT);
    if (t && !t.disabled) return 'text';
    var h = target.closest(HOVER);
    if (!h) return '';
    hoverEl = h;
    if (h.disabled || h.hasAttribute('data-denied') || h.getAttribute('aria-disabled') === 'true') return 'denied-hover';
    return h.getAttribute('data-cursor') === 'interact' ? 'interact' : 'hover';
  }

  function frame() {
    queued = false;
    el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    setState(classify(document.elementFromPoint(x, y)));
  }

  document.addEventListener('mousemove', function (e) {
    x = e.clientX; y = e.clientY;
    if (!queued) { queued = true; requestAnimationFrame(frame); }
  }, { passive: true });

  document.addEventListener('mousedown', function () {
    var denied = state === 'denied-hover';
    el.classList.remove('click', 'denied');
    void el.offsetWidth;
    el.classList.add(denied ? 'denied' : 'click');
    setTimeout(function () { el.classList.remove('click', 'denied'); }, 320);
  }, true);

  // [E] на подсвеченном элементе нажимает его (подсказка курсора не должна врать).
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'e' && e.key !== 'E') return;
    if (state === 'interact' && hoverEl && !hoverEl.disabled && !e.repeat) { e.preventDefault(); hoverEl.click(); }
  });

  // Курсор прячется при pointer lock (3D) и когда мышь ушла из окна.
  document.addEventListener('pointerlockchange', function () {
    el.style.visibility = document.pointerLockElement ? 'hidden' : 'visible';
  });
  document.documentElement.addEventListener('mouseleave', function () { el.style.opacity = '0'; });
  document.documentElement.addEventListener('mouseenter', function () { el.style.opacity = ''; });
  document.addEventListener('close', popoverUp, true);                    // <dialog> закрылся
  document.getElementById('open-settings') && document.getElementById('open-settings').addEventListener('click', function () { setTimeout(popoverUp, 0); });

  popoverUp();
  window.NexaCursor = { raise: popoverUp };
}());
