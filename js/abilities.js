(function () {
  'use strict';
  const C = window.Missions && window.Missions._core, T = window.Toys, NN = window.NexaNet;
  if (!C || !C.Run || !T || !T.ab) return;
  const P = C.Run.prototype, AB = T.ab, defs = {};
  AB.defs.forEach((d) => { defs[d.id] = d; });
  const CODES = ['KeyT', 'KeyY', 'KeyU'];
  const online = () => !!((NN && NN.connected) || (window.NexaCoop && window.NexaCoop.active));
  const now = () => performance.now() / 1000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const HC = {}, HOV = {};

  function st(r) { return r.abS || (r.abS = { cd: {}, shield: 0, shieldT: 0, heal: null, sight: 0, mag: 0, magR: 0, over: null, dash: null, ui: null, uiT: 0, marks: [] }); }
  const dirOf = (r) => { const v = new THREE.Vector3(); r.camera.getWorldDirection(v); return v; };

  function fireAt(r, x, z, v) { r.explode(x, 0.4, z, 3.8, v * 0.5); }
  function shockAt(r, x, z, secs) { r.cb.enemies.forEach((e) => { if (!e.dead && !e.friendly && Math.hypot(e.x - x, e.z - z) < 7) { e.stagger = secs; e.flashT = 0.1; } }); r.glitch && r.glitch(0.1); }

  function local(r, id, lv) {
    const s = st(r), d = defs[id], v = d.v[lv - 1], p = r.p;
    switch (id) {
      case 'dash': { const f = dirOf(r), l = Math.hypot(f.x, f.z) || 1; s.dash = { dx: f.x / l, dz: f.z / l, left: v, sp: v / 0.18 }; r.snd && r.snd.play('throw', { k: 0.5 }); break; }
      case 'slow': r.slowmo && r.slowmo(0.35, v); break;
      case 'shield': s.shield = v; s.shieldT = 8; r.layer.classList.add('abshield'); break;
      case 'heal': s.heal = { left: 4, rate: v / 4 }; r.snd && r.snd.play('medkit', { k: 0.5 }); break;
      case 'sight': s.sight = v; break;
      case 'magnet': s.mag = 8; s.magR = v; break;
      case 'reload': (r.inv || []).forEach((w) => { const n = Math.min(w.def.mag - w.mag, w.reserve); if (n > 0) { w.mag += n; w.reserve -= n; } }); r.rl = null; r.refreshHud(); r.snd && r.snd.play('click'); break;
      case 'over': s.over = { until: now() + 6, m: v }; break;
      case 'fire': { const f = dirOf(r), l = Math.hypot(f.x, f.z) || 1; fireAt(r, p.x + f.x / l * 10, p.z + f.z / l * 10, v); break; }
      case 'shock': shockAt(r, p.x, p.z, v); break;
      default: break;
    }
  }

  function use(r, slot) {
    const id = AB.equipped()[slot];
    if (!id || !r || !r.cb || r.dead || r.locked || r.paused || r.disposed || r.inCinema || !r.entered) return false;
    const lv = AB.level(id), d = defs[id]; if (!lv || !d) return false;
    const s = st(r), t = now();
    if (t < (s.cd[id] || 0)) { r.sfx && r.sfx('denied'); r.toast(d.name + ' RECHARGING', 1); return false; }
    if (id === 'slow' && online()) { r.toast('OFFLINE ONLY', 1.2); return false; }
    s.cd[id] = t + d.cd[lv - 1];
    const co = window.NexaCoop && window.NexaCoop.active ? window.NexaCoop.session : null;
    if (co && !co.solo && !co.host && (id === 'fire' || id === 'shock' || id === 'over')) {
      const f = dirOf(r), l = Math.hypot(f.x, f.z) || 1;
      NN.sendAction({ type: 'ab', id, lv, x: Math.round((r.p.x + f.x / l * 10) * 10) / 10, z: Math.round((r.p.z + f.z / l * 10) * 10) / 10 });
      if (id === 'over') s.over = { until: t + 6, m: d.v[lv - 1], remote: true };
      r.toast(d.name, 1);
    } else {
      local(r, id, lv);
      if (co && !co.solo && co.host && id === 'over') HOV[1] = { until: t + 6, m: d.v[lv - 1] };
      r.toast(d.name, 1);
    }
    return true;
  }

  function hostCheck(p) {
    if (!NN.isHost) return;
    const slot = p.from | 0, d = defs[p.id], r = window.Missions && window.Missions.current, co = window.NexaCoop && window.NexaCoop.session;
    if (!d || !r || !r.cb || !co) return;
    const lv = p.lv | 0; if (lv < 1 || lv > d.price.length) return;
    const k = slot + ':' + d.id, t = now();
    if (t < (HC[k] || 0)) { NN.sendAction({ type: 'abx', id: d.id }, { to: slot }); return; }
    HC[k] = t + d.cd[lv - 1] * 0.9;
    const m = co.remotes.get(slot), v = d.v[lv - 1];
    if (d.id === 'over') { HOV[slot] = { until: t + 6, m: v }; return; }
    if (!m || !m.rem) return;
    if (d.id === 'shock') { shockAt(r, m.rem.x, m.rem.z, v); return; }
    if (d.id === 'fire') {
      let x = +p.x, z = +p.z; if (!isFinite(x) || !isFinite(z)) return;
      const dx = x - m.rem.x, dz = z - m.rem.z, l = Math.hypot(dx, dz);
      if (l > 12) { x = m.rem.x + dx / l * 12; z = m.rem.z + dz / l * 12; }
      co.dmgBy = slot; try { fireAt(r, x, z, v); } finally { co.dmgBy = 1; }
    }
  }

  function tick(r, dt) {
    const s = st(r), t = now(), p = r.p;
    if (s.dash) {
      const step = Math.min(s.dash.left, s.dash.sp * dt), nx = p.x + s.dash.dx * step, nz = p.z + s.dash.dz * step;
      if (r.blockedE && r.blockedE(nx, nz)) s.dash = null; else { p.x = nx; p.z = nz; s.dash.left -= step; if (s.dash.left <= 0.01) s.dash = null; }
    }
    if (s.shieldT > 0) { s.shieldT -= dt; if (s.shieldT <= 0 || s.shield <= 0) { s.shield = 0; s.shieldT = 0; r.layer.classList.remove('abshield'); } }
    if (s.heal) { r.hp = Math.min(r.maxHp, r.hp + s.heal.rate * dt); s.heal.left -= dt; if (s.heal.left <= 0) s.heal = null; if (r.refreshHud && (s.uiT += dt) > 0.15) { s.uiT = 0; r.refreshHud(); } }
    if (s.mag > 0) {
      s.mag -= dt;
      (r.cb.pickups || []).forEach((k) => { const dx = p.x - k.x, dz = p.z - k.z, l = Math.hypot(dx, dz); if (l < s.magR && l > 0.3) { const m = Math.min(l, 9 * dt); k.x += dx / l * m; k.z += dz / l * m; k.g.position.x = k.x; k.g.position.z = k.z; } });
    }
    if (s.over && t > s.over.until) s.over = null;
    marks(r, s, dt);
    ui(r, s, t);
  }

  function marks(r, s, dt) {
    if (s.sight > 0) s.sight -= dt;
    const on = s.sight > 0;
    if (!on && !s.marks.length) return;
    const list = on ? r.cb.enemies.filter((e) => !e.dead && !e.friendly && !(e.t && e.t.passive)) : [];
    while (s.marks.length < list.length) { const el = document.createElement('i'); el.className = 'm-abmark'; r.layer.appendChild(el); s.marks.push(el); }
    const v = s.v3 || (s.v3 = new THREE.Vector3());
    s.marks.forEach((el, i) => {
      const e = list[i]; if (!e) { el.hidden = true; return; }
      v.set(e.x, 1.2, e.z).project(r.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { el.hidden = true; return; }
      el.hidden = false; el.style.left = ((v.x * 0.5 + 0.5) * r.w).toFixed(0) + 'px'; el.style.top = ((-v.y * 0.5 + 0.5) * r.h).toFixed(0) + 'px';
    });
  }

  function ui(r, s, t) {
    const eq = AB.equipped();
    if (!s.ui) {
      const bar = document.createElement('div'); bar.className = 'm-abbar'; bar.hidden = true;
      for (let i = 0; i < 3; i += 1) { const b = document.createElement('button'); b.type = 'button'; b.className = 'm-ab'; b.dataset.slot = String(i); b.innerHTML = '<small></small><b></b><i></i>'; b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); use(r, i); }); bar.appendChild(b); }
      r.layer.appendChild(bar); s.ui = bar; s.sig = '';
    }
    const sig = eq.join('|') + '|' + (window.NexaSettings ? 1 : 0);
    if (sig !== s.sig) {
      s.sig = sig; s.ui.hidden = !eq.some(Boolean);
      const NS = window.NexaSettings;
      Array.from(s.ui.children).forEach((b, i) => { const d = eq[i] && defs[eq[i]]; b.hidden = !d; if (d) { b.querySelector('b').textContent = d.name; b.querySelector('small').textContent = r.touch ? '' : (NS && NS.codeName ? NS.codeName((NS.binding('ab' + (i + 1)) || [CODES[i]])[0]) : CODES[i].slice(3)); } });
    }
    Array.from(s.ui.children).forEach((b, i) => {
      const id = eq[i]; if (!id) return;
      const left = Math.max(0, (s.cd[id] || 0) - t), cd = defs[id].cd[Math.max(0, AB.level(id) - 1)];
      b.classList.toggle('cd', left > 0); b.style.setProperty('--k', String(left > 0 ? left / cd : 0));
    });
  }

  const initToys0 = P.initToys;
  P.initToys = function () {
    const res = initToys0.apply(this, arguments);
    const r = this; r.abS = null;
    r.hooks.push((dt) => { if (r.cb && !r.disposed) { try { tick(r, dt); } catch (e) { if (!r.abErr) { r.abErr = 1; console.warn('[abilities]', e); } } } });
    return res;
  };
  const hurt0 = P.hurt;
  P.hurt = function (amt, fx, fz) {
    const s = this.abS;
    if (s && s.shield > 0) { const a = Math.min(amt, s.shield); s.shield -= a; amt -= a; if (amt <= 0) return undefined; }
    return hurt0.call(this, amt, fx, fz);
  };
  const dmg0 = P.damageEnemy;
  P.damageEnemy = function (e, amt, head, pt) {
    const s = this.abS;
    if (s && s.over && !s.over.remote && now() < s.over.until && e && !e.puppet) amt *= s.over.m;
    return dmg0.call(this, e, amt, head, pt);
  };
  window.addEventListener('keydown', (e) => {
    if (e.repeat || !document.body.classList.contains('in-mission')) return;
    const i = CODES.indexOf(e.code); if (i < 0) return;
    const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const r = window.Missions && window.Missions.current; if (r) use(r, i);
  });
  if (NN) {
    NN.on('ab', hostCheck);
    NN.on('abx', (p) => { const r = window.Missions && window.Missions.current; if (r && (p.from | 0) === 1) r.toast('ABILITY REJECTED BY HOST', 1.4); });
  }
  window.NexaAbil = { use, hostMult(slot) { const o = slot === 1 ? HOV[1] : HOV[slot]; return o && now() < o.until ? o.m : 1; }, defs };
}());
