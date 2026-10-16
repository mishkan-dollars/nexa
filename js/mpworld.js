// MPWorld — общий хост-авторитетный мир лобби (до 6 игроков): реестр ключ→значение с версией, замки на объекты, снапшот при входе.
// Автоподключается ко всем миссиям через Run.prototype (interact / hack / objective / signal / cinematic / runShot); сами миссии не правятся.
(function () {
  'use strict';
  const NN = window.NexaNet, C = window.Missions && window.Missions._core;
  const RunP = C && C.Run ? C.Run.prototype : null;
  if (!NN) return;
  const TTL = 25000, RENEW = 8000, TYPE = 'mw';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const me = () => NN.slot | 0;
  let S = null;

  const rec = (k) => { let q = S.recs.get(k); if (!q) S.recs.set(k, q = { v: undefined, ver: 0, lo: 0, exp: 0 }); return q; };
  const emit = (k) => { S.subs.forEach((s) => { if (s.k === k || (s.k.slice(-1) === '*' && k.indexOf(s.k.slice(0, -1)) === 0)) { try { s.fn(k, S.recs.get(k)); } catch (e) { console.warn('[mpworld]', e); } } }); };
  const pub = (k, to) => { const q = S.recs.get(k); NN.sendAction({ type: TYPE, o: 'u', k, v: q.v, ver: q.ver, lo: q.lo }, to ? { to } : undefined); };
  const put = (k, v, ver, lo) => { const q = rec(k); if (ver < q.ver) return; q.v = v; q.ver = ver; q.lo = lo | 0; emit(k); };

  function hostOp(from, m) {
    const k = String(m.k || '').slice(0, 96); if (!k) return false;
    const q = rec(k), t = Date.now();
    switch (m.o) {
      case 'cl': {
        if (q.v === 'done') return false;
        if (q.lo && q.lo !== from && q.exp > t) return false;
        if (q.lo !== from) { q.lo = from; q.ver += 1; emit(k); pub(k); }
        q.exp = t + TTL; return true;
      }
      case 'rn': if (q.lo === from) q.exp = t + TTL; return true;
      case 'rl': {
        if (q.v === 'done') return true;
        if (q.lo && q.lo !== from) return false;
        if (!q.lo && !m.d) return true;
        q.lo = 0; if (m.d) q.v = 'done'; q.ver += 1; emit(k); pub(k); return true;
      }
      case 'st': {
        if (q.v === m.v || (typeof m.v === 'object' && JSON.stringify(q.v) === JSON.stringify(m.v))) return true;
        q.v = m.v; q.ver += 1; emit(k); pub(k); return true;
      }
      default: return false;
    }
  }
  const snapTo = (to) => { const a = []; S.recs.forEach((q, k) => { if (q.ver) a.push([k, q.v === undefined ? null : q.v, q.ver, q.lo]); }); NN.sendAction({ type: TYPE, o: 'sn', a }, to ? { to } : undefined); };

  function onMsg(p) {
    if (!S) return;
    const from = p.from | 0;
    if (NN.isHost) {
      if (p.o === 'hi') { S.known.add(from); snapTo(from); return; }
      if (['cl', 'rn', 'rl', 'st'].indexOf(p.o) < 0) return;
      const ok = hostOp(from, p);
      if (p.id) NN.sendAction({ type: TYPE, o: 'r', id: p.id, ok }, { to: from });
    } else if (from === 1) {
      if (p.o === 'u') put(p.k, p.v, p.ver | 0, p.lo);
      else if (p.o === 'sn') (p.a || []).forEach((x) => put(x[0], x[1] === null ? undefined : x[1], x[2] | 0, x[3]));
      else if (p.o === 'r') { const f = S.pend.get(p.id); if (f) { S.pend.delete(p.id); f(!!p.ok); } }
    }
  }
  function expire() {
    const t = Date.now(), ids = new Set(NN.players.map((x) => x.slot)); ids.add(me());
    S.recs.forEach((q, k) => { if (q.lo && (q.exp < t || !ids.has(q.lo))) { q.lo = 0; q.ver += 1; emit(k); pub(k); } });
  }

  const W = {
    get active() { return !!S && NN.connected; },
    get(k) { const q = S && S.recs.get(k); return q ? q.v : undefined; },
    owner(k) { const q = S && S.recs.get(k); return q ? q.lo : 0; },
    done(k) { return W.get(k) === 'done'; },
    on(k, fn) { if (!S) return () => {}; const s = { k, fn }; S.subs.push(s); return () => { const i = S.subs.indexOf(s); if (i >= 0) S.subs.splice(i, 1); }; },
    send(m) { return NN.isHost ? (hostOp(me(), m), true) : NN.sendAction(Object.assign({ type: TYPE }, m)); },
    set(k, v) {
      if (!W.active) return;
      const t = Date.now(), l = S.lst.get(k) || (S.lst.set(k, { t: 0, v: undefined, h: 0 }), S.lst.get(k));
      if (t - l.t >= 100) { l.t = t; W.send({ o: 'st', k, v }); return; }
      l.v = v;
      if (!l.h) l.h = setTimeout(() => { l.h = 0; if (S && W.active) { l.t = Date.now(); W.send({ o: 'st', k, v: l.v }); } }, 100 - (t - l.t));
    },
    claim(k) {
      if (!W.active) return Promise.resolve(true);
      if (NN.isHost) return Promise.resolve(hostOp(me(), { o: 'cl', k }));
      return new Promise((res) => { let n = 0; const go = () => { const id = ++S.seq; S.pend.set(id, res); NN.sendAction({ type: TYPE, o: 'cl', k, id }); setTimeout(() => { if (S.pend.delete(id)) { if (++n < 3) go(); else res(false); } }, 2500); }; go(); });
    },
    renew(k) { if (W.active) W.send({ o: 'rn', k }); },
    release(k, done) { if (W.active) W.send({ o: 'rl', k, d: done ? 1 : 0 }); },
    snapshot() { const o = {}; if (S) S.recs.forEach((q, k) => { if (q.ver) o[k] = { v: q.v, ver: q.ver, lo: q.lo }; }); return o; },
    attach(run) {
      W.detach();
      S = { run, recs: new Map(), subs: [], pend: new Map(), seq: 0, offs: [], its: new Map(), t: 0, known: new Set(), lst: new Map() };
      S.offs.push(NN.on(TYPE, onMsg));
      S.offs.push(NN.on('net:roster', () => { if (!NN.isHost) return; NN.players.forEach((x) => { if (!S.known.has(x.slot)) { S.known.add(x.slot); snapTo(x.slot); } }); }));
      S.offs.push(NN.on('net:left', () => { if (NN.isHost) expire(); }));
      run.hooks.push((dt) => { S.t += dt; if (NN.isHost && S.t > 0.5) { S.t = 0; expire(); } try { blocking(run); } catch (e) { /* ok */ } });
      if (!NN.isHost) NN.sendAction({ type: TYPE, o: 'hi' });
      wireSignals(run); wireWorld(run);
    },
    detach() { if (!S) return; S.offs.forEach((f) => { try { f(); } catch (e) { /* ok */ } }); S = null; }
  };
  window.MPWorld = W;

  const live = (r) => !!(S && S.run === r && r.__co && r.__co.mode === 'mission' && !r.__co.solo && NN.connected);
  const scope = (r) => r.__co.stage + ':' + (r.__co.act || '');
  const nameOf = (s) => { const p = NN.players.find((x) => x.slot === s); return String((p && p.name) || 'PLAYER ' + s).toUpperCase().slice(0, 14); };

  // ---------------------------------------------------------------- флаги (r.signal) и цели (r.objective)
  function wireSignals(r) {
    W.on('sig:*', (k, q) => { const n = k.slice(4); if (q.v === 1 && !r.sig[n] && r.__mpSig !== n) { r.__mpSig = n; try { r.signal(n); } finally { r.__mpSig = null; } } });
    W.on('obj', (k, q) => { const v = q.v; if (v && v.by !== me() && v.t !== r.__mpObj) { r.__mpObj = v.t; r.__mpRemote = true; try { r.objective(v.t); } finally { r.__mpRemote = false; } } });
  }
  // ---------------------------------------------------------------- мир: разрушаемое, двери, подбор, тревога, таймер (по событию, не покадрово)
  const rd = (v) => Math.round(v * 2) / 2;
  function remote(r, fn) { r.__mpRem = true; try { fn(); } catch (e) { console.warn('[mpworld]', e); } finally { r.__mpRem = false; } }
  function wireWorld(r) {
    const on = (pat, fn) => W.on(pat, (k, q) => { if (q.v !== undefined && !r.disposed) remote(r, () => fn(k, q)); });
    on('bk:*', (k) => { const b = (r.breakables || []).find((x) => x.mpk === k); if (b && !b.broken) r.shatter(b); });
    on('dr:*', (k) => { const d = r.mpDoors && r.mpDoors.get(k); if (d && !(d.userData.col && d.userData.col.off)) r.openDoor(d, 0.6); });
    on('pk:*', (k) => { const cb = r.cb; if (!cb) return; const i = cb.pickups.findIndex((x) => x.mpk === k && !x.dead); if (i >= 0) { const x = cb.pickups[i]; x.dead = true; x.mpRem = true; x.g.visible = false; cb.pickups.splice(i, 1); } });
    on('bl:*', (k) => { const b = r.cb && r.cb.shoot.find((x) => x.mpk === k && x.alive); if (b) b.damage(99); });
    on('al:*', (k, q) => { const o = r.mpStealth && r.mpStealth[k]; if (o && !o.S.alarm) o.a0.call(o.S, q.v); });
    on('cd:*', (k, q) => { const o = r.mpCd && r.mpCd[k]; if (o && o.on && !NN.isHost && q.v && Math.abs(o.left - q.v.l) > 0.5) o.left = q.v.l; });
  }
  const progress = () => { let n = 0; S.recs.forEach((q) => { if (q.v === 'done') n += 1; }); return n; };

  // ---------------------------------------------------------------- интерактивные объекты
  function hookRun() {
    if (!RunP || RunP.__mp) return;
    RunP.__mp = true;
    const interact0 = RunP.interact;
    RunP.interact = function (def) {
      const r = this, it = interact0.call(this, def);
      if (!live(r)) return it;
      const key = 'i:' + scope(r) + ':' + [0, 1, 2].map((i) => Math.round(it.pos.getComponent(i) * 5) / 5).join(',') + ':' + String(def.label || '').slice(0, 24);
      if (S.its.has(key)) return it;
      S.its.set(key, it);
      const en0 = it.enabled, use0 = it.use, lab0 = it.label;
      it.mpKey = key;
      it.enabled = function () { if (W.done(key)) return false; return en0 ? en0.apply(this, arguments) : true; };
      Object.defineProperty(it, 'label', { configurable: true, enumerable: true, get() { const o = W.owner(key); return o && o !== me() ? 'IN USE — ' + nameOf(o) : lab0; }, set(v) { /* fixed */ } });
      const finish = (auto) => {
        it.mpAuto = true; r.__mpAuto = true;
        let p; try { p = use0.call(it, r); } catch (e) { p = null; }
        Promise.resolve(p).then(() => 0, () => 0).then(() => sleep(400)).then(() => { it.mpAuto = false; r.__mpAuto = false; });
      };
      it.use = async function () {
        if (it.mpBusy || it.mpAuto || W.done(key)) return;
        const o = W.owner(key);
        if (o && o !== me()) { r.toast('IN USE — ' + nameOf(o), 1.4); return; }
        it.mpBusy = true;
        try {
          if (!(await W.claim(key))) { r.toast(W.owner(key) ? 'IN USE BY ANOTHER PLAYER' : 'NO ANSWER FROM HOST — TRY AGAIN', 1.4); return; }
          let p; try { p = use0.apply(it, arguments); } catch (e) { p = null; }
          let settled = false; Promise.resolve(p).then(() => { settled = true; }, () => { settled = true; });
          const gone = () => r.interactables.indexOf(it) < 0 || it.used === true;
          let ok = false, last = Date.now();
          for (let t0 = Date.now(); Date.now() - t0 < 90000 && !r.disposed && !r.dead && live(r); ) {
            await sleep(150);
            if (Date.now() - last > RENEW) { last = Date.now(); W.renew(key); }
            if (gone()) { ok = true; break; }
            if (settled && !r.hacking && !r.inCinema) { await sleep(350); ok = gone(); break; }
          }
          W.release(key, ok);
        } finally { it.mpBusy = false; }
      };
      const replay = (k, q) => { if (q.v === 'done' && !it.mpBusy && !it.mpAuto && !r.disposed && r.interactables.indexOf(it) >= 0) finish(true); };
      W.on(key, replay);
      W.on(key, () => { if (r.target === it) r.target = null; });
      if (W.done(key)) setTimeout(() => replay(key, { v: 'done' }), 0);
      return it;
    };
    const brk0 = RunP.breakable;
    if (brk0) RunP.breakable = function () { const r = this, b = brk0.apply(this, arguments); if (live(r) && b) b.mpk = 'bk:' + scope(r) + ':' + (r.breakables.length - 1) + ':' + rd(b.x) + ',' + rd(b.z); if (b.mpk && W.get(b.mpk) === 1) remote(r, () => r.shatter(b)); return b; };
    const sh0 = RunP.shatter;
    if (sh0) RunP.shatter = function (b) { const r = this; if (b && b.mpk && !b.broken && !r.__mpRem && live(r)) W.set(b.mpk, 1); return sh0.apply(this, arguments); };
    const door0 = RunP.door;
    if (door0) RunP.door = function (x, z) { const r = this, m = door0.apply(this, arguments); if (live(r)) { m.mpk = 'dr:' + scope(r) + ':' + rd(x) + ',' + rd(z); (r.mpDoors || (r.mpDoors = new Map())).set(m.mpk, m); if (W.get(m.mpk) === 1) { if (m.userData.col) m.userData.col.off = true; m.position.y += (m.userData.h || 2.5) + 0.2; } } return m; };
    const od0 = RunP.openDoor;
    if (od0) RunP.openDoor = function (d) { const r = this; if (d && d.mpk && !r.__mpRem && live(r) && !(d.userData.col && d.userData.col.off)) W.set(d.mpk, 1); return od0.apply(this, arguments); };
    const pk0 = RunP.pickup;
    if (pk0) RunP.pickup = function (x, z, kind, o) { const r = this, k = pk0.apply(this, arguments); if (live(r) && k) k.mpk = 'pk:' + scope(r) + ':' + rd(x) + ',' + rd(z) + ':' + kind + ((o && o.id) || ''); return k; };
    const up0 = RunP.updatePickups;
    if (up0) RunP.updatePickups = function () {
      const r = this, cb = r.cb;
      if (!cb || !cb.pickups.length || !live(r)) return up0.apply(this, arguments);
      const before = cb.pickups.slice(), res = up0.apply(this, arguments);
      for (let i = 0; i < before.length; i += 1) { const k = before[i]; if (k.mpk && !k.dead && !k.mpRem && cb.pickups.indexOf(k) < 0) { k.mpRem = true; W.set(k.mpk, (W.get(k.mpk) | 0) + 1); } }
      return res;
    };
    const bar0 = RunP.barrel;
    if (bar0) RunP.barrel = function (x, z) {
      const r = this, b = bar0.apply(this, arguments);
      if (live(r) && b && b.damage) {
        b.mpk = 'bl:' + scope(r) + ':' + rd(x) + ',' + rd(z); const d0 = b.damage;
        b.damage = function () { const was = b.alive; const v = d0.apply(this, arguments); if (was && !b.alive && !r.__mpRem && b.mpk) W.set(b.mpk, 1); return v; };
        if (W.get(b.mpk) === 1) remote(r, () => d0(99));
      }
      return b;
    };
    const st0 = RunP.stealth;
    if (st0) RunP.stealth = function () {
      const r = this, S = st0.apply(this, arguments);
      if (live(r) && S && S.alarmNow) {
        const key = 'al:' + scope(r) + ':' + (r.mpSN = (r.mpSN | 0) + 1), a0 = S.alarmNow;
        S.alarmNow = function (why) { if (!S.alarm && !r.__mpRem) W.set(key, String(why || 1)); return a0.apply(S, arguments); };
        (r.mpStealth || (r.mpStealth = {}))[key] = { S, a0 };
      }
      return S;
    };
    const cd0 = RunP.countdown;
    if (cd0) RunP.countdown = function () {
      const r = this, c = cd0.apply(this, arguments);
      if (live(r) && c) {
        const key = 'cd:' + scope(r) + ':' + (r.mpCN = (r.mpCN | 0) + 1); let acc = 0;
        (r.mpCd || (r.mpCd = {}))[key] = c;
        if (NN.isHost) { const off = r.addHook((dt) => { acc += dt; if (acc >= 2 && c.on) { acc = 0; W.set(key, { l: Math.round(c.left * 10) / 10 }); } }); const s0 = c.stop; c.stop = function () { off(); return s0.apply(this, arguments); }; }
      }
      return c;
    };
    // «точка встречи»: r.gate(label, x, z, rad) и автоматически любое ожидание r.until по позиции игрока (r.p.x / r.p.z)
    RunP.gate = function (label, x, z, rad) {
      const r = this, R = rad || 3.2;
      return r.until(() => !r.locked && Math.hypot(r.p.x - x, r.p.z - z) < R);
    };
    const until0 = RunP.until;
    RunP.until = function (cond) {
      const co0 = this.__co; if (co0 && co0.catchUp && co0.catchUp()) return Promise.resolve();
      const r = this, p = until0.apply(this, arguments);
      if (!live(r) || r.__mpGate) return p;
      let src = ''; try { src = String(cond); } catch (e) { return p; }
      if (!/\.p\.[xz]\b/.test(src) || /dead|enemiesAlive|\.hp\b|inv\b/.test(src)) return p;
      const h = src.replace(/\s+/g, '').slice(0, 60), co = r.__co, n = (r.mpGN = r.mpGN || {});
      const key = 'u:' + scope(r) + ':' + h; n[key] = (n[key] | 0) + 1;
      return p.then(() => (live(r) && co.barrierKey ? co.barrierKey(key + ':' + n[key], 25000) : undefined));
    };
    // поздний вход: пока клиент догоняет этап, паузы и реплики сценария пролетают мгновенно (ожидания по сигналам решает снапшот MPWorld)
    const tw0 = RunP.tween;
    if (tw0) RunP.tween = function (dur, fn, ease) { const co = this.__co; if (co && co.catchUp && co.catchUp()) dur = Math.min(dur, 0.03); return tw0.call(this, dur, fn, ease); };
    const gz0 = RunP.gaze;
    if (gz0) RunP.gaze = function () { const co = this.__co; if (co && co.catchUp && co.catchUp()) return Promise.resolve(); return gz0.apply(this, arguments); };
    const say0 = RunP.say;
    if (say0) RunP.say = function () { const co = this.__co; if (co && co.catchUp && co.catchUp()) return Promise.resolve(); return say0.apply(this, arguments); };
    const hack0 = RunP.hack;
    if (hack0) RunP.hack = function () { if (this.__mpAuto) return Promise.resolve(true); return hack0.apply(this, arguments); };

    const obj0 = RunP.objective;
    RunP.objective = function (text) {
      const r = this;
      if (live(r) && !r.__mpRemote) {
        const cur = S.recs.get('obj'), pv = progress();
        if (cur && cur.v && cur.v.pv > pv) return;
        r.__mpObj = text;
        W.set('obj', { t: String(text).slice(0, 160), by: me(), pv });
      }
      return obj0.apply(this, arguments);
    };
    const sig0 = RunP.signal;
    RunP.signal = function (n) {
      const r = this;
      if (live(r) && r.__mpSig !== n && !r.sig[n]) W.set('sig:' + n, 1);
      return sig0.apply(this, arguments);
    };

    // ---------------------------------------------------------------- катсцены: ожидание всех, кадр с аватарами всех игроков
    const cin0 = RunP.cinematic;
    RunP.cinematic = function (shots, o) {
      const r = this, co = r.__co;
      if (live(r) && String(r.taskId) !== '48' && !r.inCinema && !r.cineInsert && co.barrierKey) {
        co.cinN = (co.cinN || 0) + 1;
        return co.barrierKey('c:' + scope(r) + ':' + co.cinN, 12000).then(() => cin0.call(r, shots, o));
      }
      return cin0.call(r, shots, o);
    };
    const shot0 = RunP.runShot;
    if (shot0) RunP.runShot = async function (s, ctx) {
      const r = this, co = r.__co, on = live(r) && !r.cineInsert && ctx;
      if (on) {
        r.mpShotI = ctx.first ? 0 : (r.mpShotI | 0) + 1;
        if (NN.isHost) NN.sendAction({ type: 'cev', k: 'cs', c: co.cinN | 0, i: r.mpShotI });
        else if (!ctx.first) { const t0 = Date.now(), g = () => co.cs && (co.cs.c > (co.cinN | 0) || (co.cs.c === (co.cinN | 0) && co.cs.i >= r.mpShotI)); while (!g() && !r.disposed && !r.cineSkip && Date.now() - t0 < 2500 && live(r)) await sleep(25); }
      }
      const n = live(this) ? NN.players.length + 1 : 1;
      if (n >= 3 && s && !s.free) { const x = Math.min(16, 3 * (n - 2)); s = Object.assign({}, s, { fov: (s.fov || 60) + x }); if (s.fovTo !== undefined) s.fovTo += x; }
      return shot0.call(this, s, ctx);
    };
  }

  // блокинг: пока идёт катсцена, куклы остальных игроков ставятся дугой рядом с героем (локальным игроком), лицом по его курсу
  function blocking(r) {
    const co = r.__co;
    if (!live(r) || !r.inCinema || !co.remotes) return;
    const list = [];
    co.remotes.forEach((m) => { if (m.av && m.av.n && m.av.n.g && m.rem && !m.rem.dead) list.push(m); });
    if (!list.length) return;
    const p = r.p, yaw = p.yaw || 0, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    list.sort((a, b) => a.slot - b.slot).forEach((m, i) => {
      const side = i % 2 ? 1 : -1, k = Math.floor(i / 2) + 1, g = m.av.n.g;
      const x = p.x + rx * side * 1.15 * k - fx * (0.5 + 0.55 * k), z = p.z + rz * side * 1.15 * k - fz * (0.5 + 0.55 * k);
      g.position.set(x, 0, z); g.rotation.y = yaw + Math.PI; m.av.n.yaw = yaw + Math.PI; g.visible = true;
    });
  }

  if (window.Missions && window.Missions.start) {
    const start0 = window.Missions.start;
    window.Missions.start = function () {
      const run = start0.apply(this, arguments);
      if (run && run.__co && !run.__co.solo) { hookRun(); W.attach(run); const d0 = run.dispose; run.dispose = function () { W.detach(); return d0.apply(this, arguments); }; }
      return run;
    };
  }
  hookRun();
}());
