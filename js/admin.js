(function () {
  'use strict';
  const T = window.Toys, K = window.NexaSchnorr, SO = window.NexaSocial, NN = window.NexaNet, X = window.NexaAdminText;
  const ADM = /^[0-9a-f]{64}$/.test(String(window.NEXA_ADMIN_PUB || '')) ? window.NEXA_ADMIN_PUB : '';
  if (!T || !K || !SO || !NN || !X) return;
  const HEX64 = /^[0-9a-f]{64}$/, KIND = { bans: 30791, grant: 7790, ack: 7791 }, CK = 'nexaBans';
  const sec = () => Math.floor(Date.now() / 1000);
  const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
  const ev = new EventTarget(), emit = (t) => ev.dispatchEvent(new Event(t));
  let bans = {}, banAt = 0, started = false, subbed = false;
  const pending = {};

  function applyBans(e, quiet) {
    if (!ADM || !e || e.pubkey !== ADM || e.kind !== KIND.bans || !Array.isArray(e.tags) || !K.checkEvent(e)) return false;
    if (e.created_at <= banAt || e.created_at > sec() + 300 || String(e.content).length > 200000) return false;
    let c; try { c = JSON.parse(e.content); } catch (er) { return false; }
    if (!c || !Array.isArray(c.bans)) return false;
    const m = {};
    c.bans.slice(0, 3000).forEach((b) => { if (b && HEX64.test(b.k)) m[b.k] = { r: clean(b.r, 80), u: Math.max(0, b.u | 0) }; });
    bans = m; banAt = e.created_at;
    if (!quiet) { try { localStorage.setItem(CK, JSON.stringify(e)); } catch (er) { /* ok */ } }
    fresh(); return true;
  }
  function fresh() {
    setMsg(); emit('bans');
    if (NN.kickWhere) NN.kickWhere((pk) => !pk || !!banned(pk));
    if (me()) { const R = window.NexaRoom; if (R) { R.stopHost(); R.stopJoin(); R.stopQuick(); } if (NN.connected) NN.close(); }
  }
  const banned = (pk) => { const b = ADM && bans[pk]; return b && (!b.u || b.u > sec()) ? b : null; };
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
  function ack(e, r) {
    const o = T.ident.event(KIND.ack, [['p', ADM], ['e', e.id]], JSON.stringify({ ok: 1, n: r.n, b: r.bal }));
    if (o) SO.publish(o);
  }
  function onGrant(e) {
    if (!e || e.pubkey !== ADM) return;
    const r = T.adminGrant(e);
    if (r.ok) { delete pending[e.id]; toast(X('grant', { n: r.n })); ack(e, r); emit('grant'); } else if (r.err === 'LOCKED') { if (!pending[e.id]) { pending[e.id] = e; toast(X('locked')); } } else delete pending[e.id];
  }
  function retry() { Object.keys(pending).forEach((id) => onGrant(pending[id])); }

  function subs() {
    const pk = T.ident.pk; if (!pk) return;
    SO.unsubscribe('nx-bans'); SO.unsubscribe('nx-grant');
    SO.subscribe('nx-bans', [{ kinds: [KIND.bans], authors: [ADM], '#d': ['nexa-bans'], limit: 1 }], (e) => applyBans(e));
    SO.subscribe('nx-grant', [{ kinds: [KIND.grant], authors: [ADM], '#p': [pk], since: sec() - 900 }], onGrant);
    subbed = true;
  }
  function tick() {
    if (!SO.net().on) { subbed = false; return; }
    SO.boot();
    if (SO.net().up && !subbed) subs();
    retry();
  }
  function start() {
    if (started || !ADM) return; started = true;
    try { applyBans(JSON.parse(localStorage.getItem(CK)), true); } catch (e) { /* ok */ }
    setInterval(tick, 4000);
    setInterval(() => { subbed = false; }, 300000);
    SO.on('net', () => { if (!SO.net().up) subbed = false; });
  }
  start(); setMsg();

  const flags = () => { const g = window.NexaGuard; return g ? g.flags() : 0; };
  window.NexaAdmin = {
    active: !!ADM, pub: ADM, banned: (pk) => (ADM && HEX64.test(String(pk)) ? banned(pk) : null), me: ADM ? me : () => null, text, flags,
    on: (t, f) => ev.addEventListener(t, f), _apply: applyBans
  };
}());
