// NEXA: текст в игре нельзя выделить и скопировать — ни мышью (частые клики, двойной/тройной клик, протяжка), ни пальцем на телефоне (долгий тап, ручки выделения, лупа).
// Основа — CSS (styles.css, «блокировка выделения»); здесь страховка от того, что CSS не умеет. Поля ввода (число в игре, настройки) остаются обычными.
(function () {
  'use strict';
  const EDIT = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  const inEditable = (t) => {
    if (t && t.nodeType === 3) t = t.parentElement;   // у selectstart цель — текстовый узел
    return !!(t && t.closest && t.closest(EDIT));
  };
  const block = (e) => { if (!inEditable(e.target)) e.preventDefault(); };
  const opt = { capture: true };
  // начало выделения, копирование/вырезание, перетаскивание текста и картинок, контекстное меню (ПКМ и долгое нажатие на телефоне)
  ['selectstart', 'copy', 'cut', 'dragstart', 'contextmenu'].forEach((ev) => document.addEventListener(ev, block, opt));

  // если выделение всё же возникло (расширение браузера, «выделить всё») — тут же снимаем; пока курсор в поле ввода, его выделение не трогаем
  const clear = () => {
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    if (inEditable(document.activeElement)) return;
    sel.removeAllRanges();
  };
  document.addEventListener('selectionchange', clear);
  ['mouseup', 'dblclick', 'pointerup', 'touchend'].forEach((ev) => document.addEventListener(ev, clear, { capture: true, passive: true }));
}());
