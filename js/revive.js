// Возрождение напарников в онлайне (сюжетные миссии, песочница): упавший игрок лежит (кукла видна всем), живой удерживает E рядом и поднимает.
// Хост — арбитр: состояние «лежит», прогресс, дистанция, кровотечение. Если лежат все — выбор «повторить / в лобби». Королевская битва и офлайн — как раньше.
(function () {
  'use strict';
  const NN = window.NexaNet, C = window.Missions && window.Missions._core;
  const RunP = C && C.Run ? C.Run.prototype : null;
  if (!NN || !RunP) return;
  const TYPE = 'rv', REV_T = 4.5, BLEED_T = 75, REACH = 2.4, REACH_H = 3.6, HP_K = 0.4, DEC_T = 20, HOLD_GAP = 0.7, NET_T = 0.2;
  let X = null;
  const me = () => NN.slot | 0;
  const now = () => performance.now() / 1000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const send = (m, to) => NN.sendAction(Object.assign({ type: TYPE }, m), to ? { to } : undefined);
  const members = () => [1].concat(NN.isHost ? NN.players.map((x) => x.slot) : []);
  const isMember = (s) => s === 1 || NN.players.some((x) => x.slot === s);
  const nameOf = (s) => { if (s === me()) return ''; const p = NN.players.find((x) => x.slot === s); return String((p && p.name) || 'PLAYER ' + s).slice(0, 16); };
  const posOf = (s) => {
    if (s === me()) return X.run.p;
    const m = X.co.remotes.get(s);
    return m && m.rem && m.rem.got ? m.rem : null;
  };
  const elig = (r) => !!(X && X.run === r && X.co && !X.co.solo && !X.co.gone && X.co.ready && NN.connected && X.co.spec && X.co.spec.mode !== 'br' && NN.players.length > 0 && !r.disposed);

  function list() {
    const a = [];
    if (NN.isHost) X.down.forEach((d, s) => a.push({ s, b: Math.max(0, BLEED_T - (now() - d.t0)), p: d.p, by: d.by }));
    else X.view.forEach((v, s) => a.push({ s, b: v.b, p: v.p, by: v.by }));
    return a;
  }

  // ---------------------------------------------------------------- хост: арбитраж
  function hostDown(s) {
    if (!isMember(s) || X.down.has(s)) return;
    X.down.set(s, { t0: now(), p: 0, by: 0, hl: 0 });
  }
  function hostHold(by, t) {
    const d = X.down.get(t);
    if (!d || by === t || X.down.has(by) || !isMember(by) || X.dec) return;
    const a = posOf(by), b = posOf(t);
    if (!a || !b || Math.hypot(a.x - b.x, a.z - b.z) > REACH_H) return;
    d.by = by; d.hl = now();
  }
  function hostCancel(by) { X.down.forEach((d) => { if (d.by === by) { d.p = 0; d.by = 0; } }); }
  function hostVote(from, v) {
    const dec = X.dec; if (!dec || !isMember(from)) return;
    dec.votes[from] = v === 'l' ? 'l' : 'r';
    if (from === 1) { decide(dec.votes[1]); return; }
    const ms = members();
    if (ms.every((s) => dec.votes[s])) { const l = ms.filter((s) => dec.votes[s] === 'l').length; decide(l * 2 > ms.length ? 'l' : 'r'); }
  }
  function decide(v) {
    X.dec = null; X.down.clear();
    send({ o: 'dc', v });
    applyDecision(v);
  }
  function revive(s, by) {
    X.down.delete(s);
    send({ o: 'up', s, by, hp: HP_K });
    if (s === me()) stand(HP_K);
  }
  function hostTick(dt) {
    const t = now();
    X.down.forEach((d, s) => {
      if (!isMember(s)) { X.down.delete(s); return; }
      if (X.dec) { d.t0 += dt; return; }
      if (t - d.t0 > BLEED_T) { X.down.delete(s); send({ o: 'bo', s }); if (s === me()) bleed(); return; }
      if (d.by && t - d.hl < HOLD_GAP && !X.down.has(d.by) && isMember(d.by)) { d.p += dt / REV_T; if (d.p >= 1) revive(s, d.by); }
      else { d.p = Math.max(0, d.p - dt * 1.5); if (!d.p) d.by = 0; }
    });
    const ms = members();
    if (!X.dec && ms.length > 1 && ms.every((s) => X.down.has(s))) { X.dec = { t0: t, votes: {} }; send({ o: 'ad', t: DEC_T }); showDecision(DEC_T); }
    if (X.dec && t - X.dec.t0 > DEC_T) decide('r');
    X.bt += dt;
    if (X.bt >= NET_T) { X.bt = 0; if (X.down.size || X.sentSome) { X.sentSome = X.down.size > 0; send({ o: 'st', d: list().map((e) => [e.s, Math.ceil(e.b), +e.p.toFixed(2), e.by]) }); } }
  }

  // ---------------------------------------------------------------- сообщения
  function onMsg(p) {
    if (!X) return;
    const from = p.from | 0;
    if (NN.isHost) {
      if (p.o === 'dn') hostDown(from);
      else if (p.o === 'hd') hostHold(from, p.t | 0);
      else if (p.o === 'hx') hostCancel(from);
      else if (p.o === 'vt') hostVote(from, p.v);
    } else if (from === 1) {
      const s = p.s | 0;
      if (p.o === 'st') { X.view = new Map((p.d || []).map((a) => [a[0] | 0, { b: +a[1] || 0, p: +a[2] || 0, by: a[3] | 0 }])); X.viewT = now(); }
      else if (p.o === 'up') { X.view.delete(s); if (s === me()) stand(+p.hp || HP_K); }
      else if (p.o === 'bo') { X.view.delete(s); if (s === me()) bleed(); }
      else if (p.o === 'ad') showDecision(+p.t || DEC_T);
      else if (p.o === 'dc') applyDecision(p.v);
    }
  }

  // ---------------------------------------------------------------- состояние «лежит» у себя
  function enterDown(r, reason) {
    r.dead = true; r.deathReason = reason || 'SIGNAL LOST';
    r.snd && r.snd.play('death');
    r.fireHeld = false; r.padFire = false; r.aimWant = false; r.rl = null;
    r.syncLock();
    r.rumble && r.rumble(1, 1, 400);
    cancelHold();
    const cam = r.camera, T = window.THREE, cf = r.camFree = { pos: cam.position.clone(), look: new T.Vector3(), fov: cam.fov, roll: 0 };
    const v = new T.Vector3(); cam.getWorldDirection(v); cf.look.copy(cf.pos).add(v);
    X.me = { fp: true, t0: now(), cf, eye: cf.pos.clone(), dir: v.clone(), spec: -1, auto: false, fov: cam.fov };
    r.layer.classList.add('rv-down');
    buildSelf();
    if (NN.isHost) hostDown(me()); else send({ o: 'dn' });
  }
  function teardown() {
    const r = X.run;
    X.me = null; cancelHold();
    if (X.selfEl) { X.selfEl.remove(); X.selfEl = null; }
    if (r.layer) r.layer.classList.remove('rv-down');
    if (r.camFree) { r.camFree = null; r.prevYaw = undefined; r.blurX = r.blurY = 0; }
    if (r.camera && X.fov0) { r.camera.fov = X.fov0; r.camera.updateProjectionMatrix(); }
  }
  function stand(k) {
    const r = X.run; if (!X.me) return;
    teardown();
    r.dead = false; r.hp = Math.max(1, Math.round((r.maxHp || 100) * clamp(k, 0.05, 1)));
    r.__rvGrace = now() + 1.5;
    if (r.cb) r.cb.hurtK = 0;
    r.stress = Math.min(r.stress || 0, 0.3);
    r.syncLock(); r.refreshHud && r.refreshHud();
    if (String(r.taskId) !== '48') X.co.note('REVIVED', 1.8);
  }
  function leave(auto) {
    const r = X.run; if (!X.me) return;
    teardown();
    r.__rvAuto = !!auto;
    if (r.deathRes) r.deathRes(); else r.recover(null);
  }
  const bleed = () => leave(false);
  function applyDecision(v) {
    const r = X.run;
    hideDecision();
    X.dec = null;
    if (v === 'l') { if (!r.disposed) r.finish(false); return; }
    X.rvN += 1;
    if (X.me) leave(true);
  }

  // ---------------------------------------------------------------- удержание E у лежащего напарника
  function inputHeld() {
    const r = X.run;
    if (X.keyE || X.btnE) return true;
    const gp = r.padObj && navigator.getGamepads ? navigator.getGamepads()[r.padObj.index] : null;
    return !!(gp && gp.buttons[0] && gp.buttons[0].pressed);
  }
  function nearest() {
    const r = X.run; let best = null, bd = REACH;
    list().forEach((e) => {
      if (e.s === me()) return;
      const p = posOf(e.s); if (!p) return;
      const d = Math.hypot(p.x - r.p.x, p.z - r.p.z);
      if (d < bd) { bd = d; best = e.s; }
    });
    return best;
  }
  function tryHold(r) {
    if (!elig(r) || r.dead || r.paused || r.locked || X.hold) return false;
    const t = nearest(); if (t === null) return false;
    X.hold = { t, s: now(), sent: 0 };
    return true;
  }
  function cancelHold() {
    const h = X.hold; if (!h) return;
    X.hold = null;
    if (NN.isHost) hostCancel(me()); else send({ o: 'hx' });
  }
  function holdTick() {
    const r = X.run, h = X.hold; if (!h) return;
    const e = list().find((x) => x.s === h.t), p = posOf(h.t);
    if (r.dead || !e || !p || !inputHeld() || Math.hypot(p.x - r.p.x, p.z - r.p.z) > REACH + 0.5) { cancelHold(); return; }
    if (now() - h.sent >= 0.25) { h.sent = now(); if (NN.isHost) hostHold(me(), h.t); else send({ o: 'hd', t: h.t }); }
  }

  // ---------------------------------------------------------------- камера лежащего и зрителя
  function pickSpec(dir) {
    const live = Array.from(X.co.remotes.values()).filter((m) => m.rem.got && !X.down.has(m.slot) && !(X.view.has(m.slot))).map((m) => m.slot);
    const all = live.concat([-1]), i = all.indexOf(X.me.spec);
    return all[(i + dir + all.length) % all.length];
  }
  function camTick(dt) {
    const r = X.run, m = X.me, cf = m.cf, t = now() - m.t0, T = window.THREE;
    if (r.camFree !== cf) { r.camFree = cf; }
    if (!m.auto && t > 2.2) { m.auto = true; const s = pickSpec(1); if (s !== -1) m.spec = s; }
    let tgt = m.spec > 0 ? posOf(m.spec) : null;
    if (m.spec > 0 && (!tgt || X.view.has(m.spec) || X.down.has(m.spec))) { m.spec = pickSpec(1); tgt = m.spec > 0 ? posOf(m.spec) : null; }
    const k = 1 - Math.exp(-dt * 5);
    if (tgt) {
      const yaw = tgt.yaw || 0, px = tgt.x + Math.sin(yaw) * 2.8, pz = tgt.z + Math.cos(yaw) * 2.8;
      if (m.fp) {      // глаза цели: позиция/взгляд/наклон из пакетов кукол, сглаживание; руки и оружие видны на кукле (голова изнутри не рисуется)
        const kf = 1 - Math.exp(-dt * 16), pt = tgt.pitch || 0, ey = tgt.crouch ? 1.1 : 1.6;
        if (m.fs !== m.spec || m.fyaw === undefined) { m.fs = m.spec; m.fyaw = yaw; m.fpit = pt; cf.pos.set(tgt.x, ey, tgt.z); }
        let dy = yaw - m.fyaw; dy -= Math.round(dy / 6.2832) * 6.2832; m.fyaw += dy * kf; m.fpit += (pt - m.fpit) * kf;
        cf.pos.x += (tgt.x - Math.sin(m.fyaw) * 0.1 - cf.pos.x) * kf; cf.pos.y += (ey - cf.pos.y) * kf; cf.pos.z += (tgt.z - Math.cos(m.fyaw) * 0.1 - cf.pos.z) * kf;
        const cp = Math.cos(m.fpit);
        cf.look.set(cf.pos.x - Math.sin(m.fyaw) * cp * 3, cf.pos.y + Math.sin(m.fpit) * 3, cf.pos.z - Math.cos(m.fyaw) * cp * 3); cf.roll = 0; cf.fov = 74; return;
      }
      cf.pos.x += (px - cf.pos.x) * k; cf.pos.y += (2.0 - cf.pos.y) * k; cf.pos.z += (pz - cf.pos.z) * k;
      cf.look.x += (tgt.x - cf.look.x) * k; cf.look.y += (1.2 - cf.look.y) * k; cf.look.z += (tgt.z - cf.look.z) * k;
      cf.roll += (0 - cf.roll) * k;
    } else {
      const e = clamp(t / 0.9, 0, 1), s = e * e * (3 - 2 * e), p = r.p;
      cf.pos.set(p.x + (m.eye.x - p.x) * (1 - s), m.eye.y + (0.28 - m.eye.y) * s + Math.sin(t * 1.3) * 0.015 * s, p.z + (m.eye.z - p.z) * (1 - s));
      cf.look.set(cf.pos.x + m.dir.x * 3, 0.12 * s + cf.pos.y * (1 - s) + m.dir.y * 3 * (1 - s), cf.pos.z + m.dir.z * 3);
      cf.roll = 0.5 * s;
    }
    cf.fov = m.fov;
  }

  // ---------------------------------------------------------------- интерфейс
  const tr = () => (String(X.run.taskId) === '48' ? '' : ' data-i18n="net"');
  function buildSelf() {
    const el = X.selfEl = document.createElement('div'); el.className = 'rv-self';
    if (tr()) el.setAttribute('data-i18n', 'net');
    el.innerHTML = '<b>YOU ARE DOWN</b><span>WAIT FOR A TEAMMATE TO REVIVE YOU</span><i class="rv-bar"><u></u></i>' +
      '<span class="rv-row"><span class="rv-rvg" hidden>REVIVING…</span><span class="rv-bl">BLEEDING OUT</span> <em translate="no"></em></span>' +
      '<button type="button" class="rv-sp">[Q] SPECTATE</button> <em class="rv-nm" translate="no"></em>';
    el.querySelector('.rv-sp').addEventListener('click', () => { if (X.me) X.me.spec = pickSpec(1); });
    ['pointerdown', 'mousedown', 'touchstart'].forEach((n) => el.addEventListener(n, (e) => e.stopPropagation(), { passive: true }));
    X.run.layer.appendChild(el);
  }
  function mkMarker(s) {
    const el = document.createElement('div'); el.className = 'rv-mk';
    if (tr()) el.setAttribute('data-i18n', 'net');
    el.innerHTML = '<b translate="no"></b><i class="rv-bar"><u></u></i><small class="rv-dn">DOWN</small><small class="rv-ho" hidden>HOLD [E] TO REVIVE</small><small class="rv-rg" hidden>REVIVING…</small>';
    el.querySelector('b').textContent = nameOf(s);
    X.run.layer.appendChild(el);
    return el;
  }
  function uiTick() {
    const r = X.run, cam = r.camera, L = r.layer; if (!cam || !L) return;
    const es = list(), W = L.clientWidth, H = L.clientHeight, near = X.hold ? X.hold.t : (r.dead ? null : nearest());
    X.mk.forEach((el, s) => { if (!es.some((e) => e.s === s && e.s !== me())) { el.remove(); X.mk.delete(s); } });
    es.forEach((e) => {
      if (e.s === me()) return;
      let el = X.mk.get(e.s); if (!el) X.mk.set(e.s, el = mkMarker(e.s));
      const p = posOf(e.s), v = X.v3 || (X.v3 = new window.THREE.Vector3());
      if (!p) { el.hidden = true; return; }
      v.set(p.x, 0.95, p.z).project(cam);
      el.hidden = v.z > 1;
      el.style.left = ((v.x * 0.5 + 0.5) * W) + 'px'; el.style.top = ((-v.y * 0.5 + 0.5) * H) + 'px';
      const mine = X.hold && X.hold.t === e.s, prog = mine ? Math.max(e.p, now() - X.hold.s < 0.8 ? (now() - X.hold.s) / REV_T : 0) : e.p;
      el.querySelector('u').style.width = Math.round(clamp(prog, 0, 1) * 100) + '%';
      el.querySelector('.rv-dn').hidden = prog > 0 || near === e.s;
      el.querySelector('.rv-ho').hidden = !(near === e.s && prog <= 0 && !r.dead);
      el.querySelector('.rv-rg').hidden = !(prog > 0 && !(near === e.s && prog <= 0));
      el.classList.toggle('near', near === e.s);
    });
    const eb = r.qs('.m-e'); if (eb && !r.dead && near !== null) eb.classList.add('ready');
    if (X.selfEl && X.me) {
      const mine = es.find((e) => e.s === me()), el = X.selfEl, left = mine ? mine.b : Math.max(0, BLEED_T - (now() - X.me.t0)), p = mine ? mine.p : 0;
      el.querySelector('u').style.width = Math.round(clamp(p, 0, 1) * 100) + '%';
      el.querySelector('.rv-rvg').hidden = !(p > 0); el.querySelector('.rv-bl').hidden = p > 0;
      el.querySelector('.rv-row em').textContent = Math.ceil(left) + ' s';
      { const sp = X.me.spec > 0 ? posOf(X.me.spec) : null; el.querySelector('.rv-nm').textContent = X.me.spec > 0 ? nameOf(X.me.spec) + (sp ? '  ' + Math.round(sp.hp) + '%  ' + String(sp.w || '').toUpperCase() : '') + '  [V]' : ''; }
    }
    if (X.decEl && X.decT) {
      const left = Math.max(0, Math.ceil(X.decT - now()));
      X.decEl.querySelector('.rv-dl').textContent = left + ' s';
      if (!NN.isHost && now() > X.decT + 6) applyDecision('r');
    }
  }
  function showDecision(sec) {
    if (X.decEl) return;
    const r = X.run, el = X.decEl = document.createElement('div'); el.className = 'rv-dec';
    if (tr()) el.setAttribute('data-i18n', 'net');
    el.innerHTML = '<div><h2>ALL PLAYERS DOWN</h2><p><span>AUTO RETRY IN</span> <em class="rv-dl" translate="no"></em></p>' +
      '<div class="rv-bt"><button type="button" data-v="r">RETRY MISSION</button><button type="button" data-v="l">BACK TO LOBBY</button></div>' +
      '<p class="rv-wt" hidden>WAITING FOR THE HOST…</p></div>';
    X.decT = now() + sec;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (NN.isHost) hostVote(1, b.dataset.v);
      else { send({ o: 'vt', v: b.dataset.v }); el.querySelector('.rv-wt').hidden = false; el.querySelectorAll('button').forEach((x) => x.classList.toggle('pick', x === b)); }
    });
    ['pointerdown', 'mousedown', 'touchstart'].forEach((n) => el.addEventListener(n, (e) => e.stopPropagation(), { passive: true }));
    r.layer.appendChild(el);
    if (!r.touch && document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { /* без захвата */ } }
  }
  function hideDecision() { if (X.decEl) { X.decEl.remove(); X.decEl = null; X.decT = 0; } }

  // ---------------------------------------------------------------- подключение к запуску
  function attach(run) {
    detach();
    const co = run.__co;
    X = { run, co, down: new Map(), view: new Map(), viewT: 0, dec: null, decEl: null, decT: 0, me: null, hold: null, keyE: false, btnE: false, mk: new Map(), offs: [], bt: 0, sentSome: false, lt: now(), rvN: 0, selfEl: null, v3: null, fov0: run.camera ? run.camera.fov : 0 };
    X.offs.push(NN.on(TYPE, onMsg));
    run.on(document, 'keydown', (e) => {
      if (e.code === 'KeyE') X.keyE = true;
      else if ((e.code === 'KeyQ' || e.code === 'ArrowRight') && !e.repeat && X.me) X.me.spec = pickSpec(1);
      else if (e.code === 'ArrowLeft' && !e.repeat && X.me) X.me.spec = pickSpec(-1);
      else if (e.code === 'KeyV' && !e.repeat && X.me) X.me.fp = !X.me.fp;
    });
    run.on(document, 'keyup', (e) => { if (e.code === 'KeyE') X.keyE = false; });
    run.on(window, 'blur', () => { X.keyE = X.btnE = false; });
    const eb = run.qs('.m-e');
    if (eb) { run.on(eb, 'pointerdown', () => { X.btnE = true; }); ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => run.on(eb, n, () => { X.btnE = false; })); }
    run.hooks.push(() => {
      if (!X || X.run !== run) return;
      try {
        const t = now(), dt = Math.min(0.25, t - X.lt); X.lt = t;
        if (NN.isHost) hostTick(dt); else if (X.view.size && t - X.viewT > 4) X.view.clear();
        if (X.me && !elig(run)) { leave(false); return; }
        holdTick();
        if (X.me) camTick(dt);
        uiTick();
      } catch (e) { if (!X.errLogged) { X.errLogged = true; console.warn('[revive]', e); } }
    });
  }
  function detach() {
    if (!X) return;
    X.offs.forEach((f) => { try { f(); } catch (e) { /* ok */ } });
    [X.selfEl, X.decEl].forEach((el) => el && el.remove());
    X.mk.forEach((el) => el.remove());
    X = null;
  }

  function hookRun() {
    if (RunP.__rv) return;
    RunP.__rv = true;
    const die0 = RunP.die;
    RunP.die = function (reason) {
      if (!this.dead && !reason && elig(this)) return enterDown(this, reason);
      return die0.apply(this, arguments);
    };
    const hurt0 = RunP.hurt;
    RunP.hurt = function () {
      if (!X || X.run !== this) return hurt0.apply(this, arguments);
      if (this.__rvGrace > now()) return;
      const h = this.hp;
      hurt0.apply(this, arguments);
      if (this.hp < h && X && X.hold) cancelHold();
    };
    const use0 = RunP.useTarget;
    RunP.useTarget = function () {
      if (X && X.run === this && tryHold(this)) return;
      return use0.apply(this, arguments);
    };
    const rec0 = RunP.recover;
    RunP.recover = async function () {
      const r = this, auto = !!r.__rvAuto; r.__rvAuto = false;
      const poll = auto ? setInterval(() => { if (r.choice) r.choose('retry'); }, 250) : 0;
      let res;
      try { res = await rec0.apply(this, arguments); } finally { clearInterval(poll); }
      if (auto && X && X.run === r && X.co && !X.co.solo && X.co.barrierKey) await X.co.barrierKey('rv:' + X.rvN, 20000);
      return res;
    };
  }

  window.NexaRevive = {
    get active() { return !!X; },
    state() { return X ? { down: list(), me: !!X.me, hold: X.hold ? X.hold.t : 0, dec: !!X.dec || !!X.decEl, rvN: X.rvN } : null; }
  };

  if (window.Missions && window.Missions.start) {
    const start0 = window.Missions.start;
    window.Missions.start = function () {
      const run = start0.apply(this, arguments);
      if (run && run.__co && !run.__co.solo) { hookRun(); attach(run); const d0 = run.dispose; run.dispose = function () { detach(); return d0.apply(this, arguments); }; }
      return run;
    };
  }
  hookRun();
}());
