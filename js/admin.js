(function () {
  'use strict';
  const T = window.Toys, K = window.NexaSchnorr, SO = window.NexaSocial, NN = window.NexaNet, X = window.NexaAdminText;
  const ADM = /^[0-9a-f]{64}$/.test(String(window.NEXA_ADMIN_PUB || '')) ? window.NEXA_ADMIN_PUB : '';
  if (!T || !K || !SO || !NN || !X) return;
  const HEX64 = /^[0-9a-f]{64}$/, KIND = { bans: 30791, grant: 7790, ack: 7791 }, CK = 'nexaBans';
  const sec = () => Math.floor(Date.now() / 1000);
  const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
  const ev = new EventTarget(), emit = (t) => ev.dispatchEvent(new Event(t));
  let bans = {}, avb = {}, banAt = 0, started = false, subbed = false;
  const pending = {};

  function applyBans(e, quiet) {
    if (!ADM || !e || e.pubkey !== ADM || e.kind !== KIND.bans || !Array.isArray(e.tags) || !K.checkEvent(e)) return false;
    if (e.created_at <= banAt || e.created_at > sec() + 300 || String(e.content).length > 200000) return false;
    let c; try { c = JSON.parse(e.content); } catch (er) { return false; }
    if (!c || !Array.isArray(c.bans)) return false;
    const m = {};
    c.bans.slice(0, 3000).forEach((b) => { if (b && HEX64.test(b.k)) m[b.k] = { r: clean(b.r, 80), u: Math.max(0, b.u | 0) }; });
    const av = {};
    (Array.isArray(c.av) ? c.av : []).slice(0, 3000).forEach((b) => { if (b && HEX64.test(b.k)) av[b.k] = { r: clean(b.r, 80), u: Math.max(0, b.u | 0) }; });
    bans = m; avb = av; banAt = e.created_at;
    if (!quiet) { try { localStorage.setItem(CK, JSON.stringify(e)); } catch (er) { /* ok */ } }
    fresh(); return true;
  }
  function fresh() {
    setMsg(); emit('bans'); if (window.NexaAvatar) { try { NexaAvatar.checkMod(); NexaAvatar.announce(true); NexaAvatar.refresh(); } catch (e) { /* ok */ } }
    if (NN.kickWhere) NN.kickWhere((pk) => !pk || !!banned(pk));
    if (me()) { const R = window.NexaRoom; if (R) { R.stopHost(); R.stopJoin(); R.stopQuick(); } if (NN.connected) NN.close(); }
  }
  const banned = (pk) => { const b = ADM && bans[pk]; return b && (!b.u || b.u > sec()) ? b : null; };
  const avBlocked = (pk) => { const b = ADM && avb[pk]; return b && (!b.u || b.u > sec()) ? b : null; };
  const me = () => { const pk = T.ident.pk; return pk ? banned(pk) : null; };
  function text() {
    const b = me(); if (!b) return '';
    const d = b.u ? new Date(b.u * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '';
    return X('ban') + (b.r ? ' · ' + X('reason') + ': ' + b.r : '') + ' · ' + (b.u ? X('until') + ' ' + d : X('forever'));
  }
  function setMsg() { if (NN.MSG) NN.MSG.BANNED = text() || X('ban'); }

  function toast(msg) {
    const d = document.createElement('div');
    d.setAttribute('role', 'status');
    d.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:99999;background:#0b1d12;color:#7dffb0;border:1px solid #7dffb0;padding:8px 14px;font:700 13px monospace;letter-spacing:.06em;max-width:90vw;text-align:center';
    d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 6000);
  }
  const log = (...a) => { try { console.log('[admin]', ...a); } catch (e) { /* ok */ } };
  const D = { bans: 0, applied: 0, grants: 0, granted: 0, refused: 0, why: '', rej: {}, lastSync: 0, lastBan: 0 };
  const nacked = new Set(), lastAck = {};
  const rej = (why) => { D.rej[why] = (D.rej[why] || 0) + 1; log('rejected:', why); };
  const CH = { socks: new Map(), seen: new Set(), bad: {} };
  const KB = [30791, 30078];
  const MAXR = 6, POOL = 12;
  const urls = () => {
    const o = (new URLSearchParams(location.search).get('relay') || '').split(',').filter((u) => /^wss?:\/\//.test(u));
    const SV = window.NexaServers; return (o.length ? o : (SV ? SV.NOSTR_VERIFIED : [])).slice(0, POOL);
  };
  const chOpen = () => Array.from(CH.socks.values()).filter((r) => r.open);
  const chSend = (m) => { const j = typeof m === 'string' ? m : JSON.stringify(m); chOpen().forEach((r) => { try { r.ws.send(j); } catch (e) { /* ok */ } }); return chOpen().length; };
  function reqs(r) {
    const pk = T.ident.pk, t = sec() - 900; if (!pk) return;
    const send = (id, f) => { try { r.ws.send(JSON.stringify(['REQ', id].concat(f))); } catch (e) { /* ok */ } };
    send('adm-bans', [{ kinds: KB, authors: [ADM], '#d': ['nexa-bans'], limit: 5 }]);
    send('adm-bans2', [{ kinds: KB, authors: [ADM], limit: 10 }]);
    send('adm-grant', [{ kinds: [KIND.grant, 27790], authors: [ADM], '#p': [pk], since: t }]);
    send('adm-grant2', [{ kinds: [KIND.grant, 27790], authors: [ADM], since: t, limit: 100 }]);
  }
  function chConnect(url) {
    let ws; try { ws = new WebSocket(url); } catch (e) { CH.bad[url] = Date.now() + 60000; return; }
    const r = { ws, url, open: false }; CH.socks.set(url, r);
    const drop = () => { CH.socks.delete(url); CH.bad[url] = Date.now() + 30000; };
    const to = setTimeout(() => { if (!r.open) { try { ws.close(); } catch (e) { /* ok */ } drop(); } }, 7000);
    ws.onopen = () => { r.open = true; clearTimeout(to); log('relay up', url, '(' + chOpen().length + ')'); reqs(r); presence(); };
    ws.onmessage = (m) => {
      let j; try { j = JSON.parse(m.data); } catch (e) { return; }
      if (!Array.isArray(j)) return;
      if (j[0] === 'EOSE' && /^adm-bans/.test(j[1])) { D.lastSync = Date.now(); return; }
      if (j[0] === 'OK' && j[2] === false) { log('relay refused our event', url, String(j[3] || '').slice(0, 80)); return; }
      if (j[0] !== 'EVENT' || !j[2]) return;
      const e = j[2];
      if (/^adm-bans/.test(j[1])) { D.lastSync = Date.now(); onBanEv(e); } else if (/^adm-grant/.test(j[1])) onGrant(e);
    };
    ws.onerror = () => { clearTimeout(to); try { ws.close(); } catch (e) { /* ok */ } };
    ws.onclose = () => { clearTimeout(to); drop(); };
  }
  function onBanEv(e) {
    if (!e || e.pubkey !== ADM) return rej('ban: not from admin');
    if (KB.indexOf(e.kind) < 0 || !Array.isArray(e.tags) || !e.tags.some((t) => t[0] === 'd' && t[1] === 'nexa-bans')) return;
    D.bans += 1;
    if (e.created_at <= banAt) return;
    if (!K.checkEvent(e)) return rej('ban: bad signature');
    if (applyBans(e)) { D.applied += 1; D.lastBan = Date.now(); log('ban list applied', Object.keys(bans).length, 'entries, mine:', !!me()); } else rej('ban: invalid content/time');
  }
  function onGrant(e) {
    if (!e || e.pubkey !== ADM || (e.kind !== KIND.grant && e.kind !== 27790)) return;
    if (!(e.tags || []).some((t) => t[0] === 'p' && t[1] === T.ident.pk)) return;
    if (CH.seen.has(e.id)) { const a = lastAck[e.id]; if (a && Date.now() - a.t > 8000) { a.t = Date.now(); ack(e, a.r); } return; }
    D.grants += 1; applyGrant(e);
  }
  function ack(e, r) {
    lastAck[e.id] = { r, t: Date.now() };
    const c = JSON.stringify({ ok: 1, n: r.n, b: r.bal, i: r.id });
    const o = T.ident.event(KIND.ack, [['p', ADM], ['e', e.id]], c), o2 = T.ident.event(27791, [['p', ADM], ['e', e.id]], c);
    if (o) { chSend(['EVENT', o]); SO.publish(o); }
    if (o2) chSend(['EVENT', o2]);
  }
  function nack(e, why) {
    const k = e.id + why; if (nacked.has(k)) return; nacked.add(k);
    let gid = ''; try { gid = JSON.parse(e.content).i || ''; } catch (er) { /* ok */ }
    const c = JSON.stringify({ ok: 0, w: why, i: gid, f: flags() });
    const o = T.ident.event(KIND.ack, [['p', ADM], ['e', e.id]], c), o2 = T.ident.event(27791, [['p', ADM], ['e', e.id]], c);
    if (o) { chSend(['EVENT', o]); SO.publish(o); }
    if (o2) chSend(['EVENT', o2]);
  }
  function applyGrant(e) {
    const r = T.adminGrant(e);
    const why = r.ok ? '' : r.err === 'LOCKED' ? r.why : r.err;
    log('grant', e.id.slice(0, 8), r.ok ? 'applied ' + r.n : 'refused ' + why);
    if (r.ok) { CH.seen.add(e.id); delete pending[e.id]; D.granted += 1; D.why = ''; if (window.NexaGift && NexaGift.add({ id: 'a' + r.id, k: 'a', a: r.n })) { /* подарок покажет gift.js */ } else toast(X('grant', { n: r.n })); ack(e, r); emit('grant'); }
    else if (r.err === 'LOCKED') { D.why = why; nack(e, why); if (!pending[e.id]) { pending[e.id] = e; toast(X('locked')); } }
    else { CH.seen.add(e.id); delete pending[e.id]; if (r.err === 'DUP') ack(e, { n: 0, bal: T.credits, id: '' }); else { D.refused += 1; D.why = why; nack(e, why); rej('grant: ' + r.err); } }
  }
  function retry() { Object.keys(pending).forEach((id) => applyGrant(pending[id])); }
  function presence() { const p0 = SO.presEvent && SO.presEvent(); if (p0) chSend(['EVENT', p0]); }
  const active = () => { try { return SO.net().on; } catch (e) { return false; } };

  function tick() {
    if (!active()) { CH.socks.forEach((r) => { try { r.ws.close(); } catch (e) { /* ok */ } }); CH.socks.clear(); return; }
    SO.boot();
    urls().forEach((u) => { if (!CH.socks.has(u) && (CH.bad[u] || 0) < Date.now() && chOpen().length < MAXR && CH.socks.size < MAXR + 3) chConnect(u); });
    retry();
  }
  function paintUi() {
    const b = me(), lob = document.getElementById('ol');
    let bar = document.getElementById('adm-ban');
    if (b && lob) {
      if (!bar) { bar = document.createElement('div'); bar.id = 'adm-ban'; bar.setAttribute('role', 'alert'); bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99996;background:#4a0b0b;color:#fff;border-bottom:2px solid #ff3b30;padding:14px;font:700 14px monospace;text-align:center;letter-spacing:.06em'; document.body.appendChild(bar); }
      bar.textContent = text();
    } else if (bar) bar.remove();
    document.querySelectorAll('.ol-srv').forEach((blk) => {
      let p = blk.querySelector('.adm-diag'); if (!p) { p = document.createElement('p'); p.className = 'v-note adm-diag'; blk.appendChild(p); }
      p.textContent = X('diag', { n: Object.keys(bans).length, t: D.lastSync ? new Date(D.lastSync).toLocaleTimeString() : '-', r: chOpen().length }) + ' | ' + X('gdiag', { a: D.grants, b: D.granted, c: D.refused + Object.keys(pending).length, w: D.why || '-' });
    });
  }
  function start() {
    if (started || !ADM) return; started = true;
    try { applyBans(JSON.parse(localStorage.getItem(CK)), true); } catch (e) { /* ok */ }
    log('channel start, admin', ADM.slice(0, 8));
    setInterval(tick, 4000);
    setInterval(() => { chOpen().forEach(reqs); }, 30000);
    setInterval(presence, 45000);
    setInterval(paintUi, 1500);
    tick();
  }
  start(); setMsg();

  const flags = () => { const g = window.NexaGuard; return g ? g.flags() : 0; };
  window.NexaAdmin = {
    active: !!ADM, pub: ADM, avBlocked: (pk) => (ADM && HEX64.test(String(pk)) ? avBlocked(pk) : null), banned: (pk) => (ADM && HEX64.test(String(pk)) ? banned(pk) : null), me: ADM ? me : () => null, text, flags,
    on: (t, f) => ev.addEventListener(t, f), diag: () => Object.assign({ relays: chOpen().length, entries: Object.keys(bans).length }, D), _apply: applyBans
  };
}());
