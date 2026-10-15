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
        if (JSON.stringify(q.v) === JSON.stringify(m.v)) return true;
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
      if (p.o === 'hi') { snapTo(from); return; }
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
    set(k, v) { if (!W.active) return; W.send({ o: 'st', k, v }); },
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
      S = { run, recs: new Map(), subs: [], pend: new Map(), seq: 0, offs: [], its: new Map(), t: 0 };
      S.offs.push(NN.on(TYPE, onMsg));
      S.offs.push(NN.on('net:roster', () => { if (NN.isHost) snapTo(); }));
      S.offs.push(NN.on('net:left', () => { if (NN.isHost) expire(); }));
      run.hooks.push((dt) => { S.t += dt; if (NN.isHost && S.t > 0.5) { S.t = 0; expire(); } try { blocking(run); } catch (e) { /* ok */ } });
      if (!NN.isHost) NN.sendAction({ type: TYPE, o: 'hi' });
      wireSignals(run);
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
    if (shot0) RunP.runShot = function (s, ctx) {
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
