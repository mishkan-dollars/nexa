(function () {
  'use strict';
  const INTEG = /*@INTEGRITY@*/null;
  const st = { dev: false, integ: true };
  const touch = (() => { try { return matchMedia('(pointer:coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent); } catch (e) { return false; } })();
  const online = () => { try { return !!(window.NexaNet && NexaNet.connected) || !!(window.NexaRoom && NexaRoom.servers.on && NexaRoom.consented()); } catch (e) { return false; } };
  const block = () => online() && (st.dev || !st.integ);
  const flags = () => (st.dev ? 1 : 0) | (st.integ ? 0 : 2) | (window.Toys && Toys.tampered ? 4 : 0);
  let trap = false, big = 0, calm = 0, bar = null;
  const bait = new Image();
  try { Object.defineProperty(bait, 'id', { get() { trap = true; return ''; } }); } catch (e) { /* ok */ }

  function probe() {
    if (touch || document.hidden) return;
    const wide = !document.fullscreenElement && (outerWidth - innerWidth > 250 || outerHeight - innerHeight > 330);
    big = wide ? big + 1 : 0;
    trap = false;
    if (online()) { try { console.log(bait); } catch (e) { /* ok */ } }
    if (trap || big >= 3) { st.dev = true; calm = 0; } else if (st.dev && (calm += 1) >= 2) st.dev = false;
    paint();
  }
  function paint() {
    const X = window.NexaAdminText, bad = block();
    if (!bad || !X) { if (bar) { bar.remove(); bar = null; } return; }
    if (!bar) {
      bar = document.createElement('div'); bar.setAttribute('role', 'alert');
      bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99998;background:#3a0b0b;color:#ffb4a8;border-top:1px solid #ff3b30;padding:8px 14px;font:700 12px monospace;letter-spacing:.05em;text-align:center';
      document.body.appendChild(bar);
    }
    bar.textContent = X(st.integ ? 'dev' : 'integ');
  }
  const hex = (b) => Array.from(new Uint8Array(b), (x) => (x + 256).toString(16).slice(1)).join('');
  async function verify() {
    if (!INTEG || !window.crypto || !crypto.subtle) return;
    try {
      for (const f of Object.keys(INTEG)) {
        const r = await fetch(f, { cache: 'no-cache' });
        if (!r.ok) continue;
        const h = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode((await r.text()).replace(/\r\n/g, '\n').replace(/^﻿/, ''))));
        if (h !== INTEG[f]) st.integ = false;
      }
    } catch (e) { /* нет сети — не наказываем */ }
    paint();
  }
  function lock() {
    const fz = (o) => { try { if (o && typeof o === 'object') Object.freeze(o); } catch (e) { /* ok */ } };
    const T = window.Toys; if (T) { fz(T.ab); fz(T.hud); fz(T.ident); }
    ['Toys', 'NexaSocial', 'NexaAdmin', 'NexaGuard', 'NexaSchnorr'].forEach((n) => {
      try { const v = window[n]; if (v) { fz(v); Object.defineProperty(window, n, { value: v, writable: false, configurable: false }); } } catch (e) { /* ok */ }
    });
  }
  window.NexaGuard = Object.freeze({ block, flags, state: () => ({ dev: st.dev, integ: st.integ, online: online() }) });
  window.addEventListener('load', () => { lock(); verify(); setInterval(probe, 3000); });
}());
