(function () {
  'use strict';
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36), LK = 'nexaLease', TTL = 5000;
  const ev = new EventTarget();
  let owner = false, decided = false, bar = null, waiting = false, bc = null;
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ok */ } };
  const lease = () => { try { return JSON.parse(lsGet(LK)); } catch (e) { return null; } };
  const T = (k) => (window.NexaAdminText ? window.NexaAdminText(k) : k);
  const useLocks = (() => { try { return !!(navigator.locks && navigator.locks.request); } catch (e) { return false; } })();
  let okLs = true; try { localStorage.setItem('nexaProbe', '1'); } catch (e) { okLs = false; }
  const hold = () => new Promise(() => { /* держим замок до закрытия вкладки */ });

  function set(v) {
    decided = true;
    if (v !== owner) { owner = v; ev.dispatchEvent(new Event('change')); }
    paint();
  }
  function paint() {
    if (!decided || owner) { if (bar) { bar.remove(); bar = null; } return; }
    if (!document.body) { document.addEventListener('DOMContentLoaded', paint, { once: true }); return; }
    if (!bar) {
      bar = document.createElement('div'); bar.setAttribute('role', 'alert');
      bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99997;background:#3a2a0b;color:#ffd38a;border-bottom:1px solid #ffb300;padding:8px 14px;font:700 12px monospace;letter-spacing:.05em;text-align:center';
      bar.appendChild(document.createElement('span'));
      const b = document.createElement('button'); b.type = 'button'; b.style.cssText = 'margin-left:12px;font:inherit;padding:3px 10px;background:#ffb300;color:#000;border:0;cursor:pointer';
      b.onclick = takeOver; bar.appendChild(b); document.body.appendChild(bar);
    }
    bar.firstChild.textContent = T('dup'); bar.lastChild.textContent = T('dupbtn');
  }
  document.addEventListener('i18nchange', paint);

  function queue() {
    if (waiting) return; waiting = true;
    navigator.locks.request('nexa-online', () => { set(true); return hold(); }).catch(() => { /* ok */ }).then(() => { waiting = false; });
  }
  function startLocks() {
    navigator.locks.request('nexa-online', { ifAvailable: true }, (lock) => {
      if (!lock) { set(false); queue(); return undefined; }
      set(true); return hold();
    }).catch((e) => { if (e && e.name === 'AbortError') { set(false); queue(); } else fallback(); });
  }
  function fallback() { if (okLs) startLease(); else set(true); }
  function claim() {
    lsSet(LK, JSON.stringify({ id, t: Date.now() }));
    setTimeout(() => { const l = lease(); if (l && l.id === id) set(true); else set(false); }, 400);
  }
  function tickLease() {
    const l = lease(), n = Date.now();
    if (owner) { if (l && l.id !== id && n - l.t <= TTL) set(false); else lsSet(LK, JSON.stringify({ id, t: n })); if (bc) try { bc.postMessage({ t: 'hb', id }); } catch (e) { /* ok */ } return; }
    if (!l || l.id === id || n - l.t > TTL) claim(); else set(false);
  }
  function startLease() {
    try { bc = new BroadcastChannel('nexa-single'); bc.onmessage = (m) => { if (m.data && m.data.t === 'take' && m.data.id !== id && owner) set(false); }; } catch (e) { bc = null; }
    window.addEventListener('storage', (e) => { if (e.key === LK && owner) tickLease(); });
    window.addEventListener('pagehide', () => { const l = lease(); if (owner && l && l.id === id) { try { localStorage.removeItem(LK); } catch (e) { /* ok */ } } });
    tickLease(); setInterval(tickLease, 1500);
  }
  function takeOver() {
    if (useLocks) { navigator.locks.request('nexa-online', { steal: true }, () => { set(true); return hold(); }).catch(() => set(false)); return; }
    lsSet(LK, JSON.stringify({ id, t: Date.now() })); if (bc) try { bc.postMessage({ t: 'take', id }); } catch (e) { /* ok */ }
    set(true);
  }

  if (useLocks) { try { startLocks(); } catch (e) { fallback(); } } else fallback();
  window.NexaSingle = Object.freeze({ owner: () => owner, takeOver, on: (t, f) => ev.addEventListener(t, f), mode: useLocks ? 'locks' : 'lease' });
}());
