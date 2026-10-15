// NEXA: PvP в онлайне (поверх js/coop.js): «Бой насмерть» (все против всех), «Командный бой» (две команды), «Дуэль 1×1». Хост — арбитр: здоровье, урон, смерти, счёт, респаун, предметы, конец матча.
// Попадания идут по существующему пути «огня по своим» (цели-куклы в cb.shoot -> 'ffh' на Хост), только вместо ffApply работает Pvp.apply. Врагов-ботов нет, возрождение напарником (revive.js) выключено.
// Сообщения: тип 'pv', поле o: go (старт раунда), k (убийство), r (респаун), hp (урон/лечение цели), sc (табло), pu/pi (предмет взят/вернулся), end (итог), lb (в лобби); от гостя: pk, pg, lv.
(function () {
  'use strict';
  const NN = window.NexaNet, C = window.Missions && window.Missions._core;
  if (!NN || !C || !C.Run || !window.NexaCoop) return;
  const MIS = C.MISSIONS, RP = C.Run.prototype;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d || 0);
  const q = (v, k) => Math.round(v * k) / k;
  const now = () => performance.now();
  const HP = 100, RESP = 3, PROT = 2, WARM = 3, DMGK = 0.8, MAXT = 1500, KP_CAP = 150;
  const TEAMC = ['#ff3b30', '#4cc3ff'], TEAMN = ['RED', 'BLUE'];
  const WPN = ['glock', 'ak', 'shotgun', 'sniper'];
  const KINDS = ['ffa', 'team', 'duel'];
  const GOALS = { ffa: ['k15', 'k25', 'k50', 't5', 't10'], team: ['k15', 'k25', 'k50', 't5', 't10'], duel: ['k5', 'k10', 'k15', 't3', 't5'] };
  const WPNS = ['all', 'random', 'glock', 'ak', 'shotgun', 'sniper'];
  const MAPS = ['arena', 'yard'];

  function norm(c) {
    c = c || {};
    const kind = KINDS.indexOf(c.kind) >= 0 ? c.kind : 'ffa';
    const goal = GOALS[kind].indexOf(c.goal) >= 0 ? c.goal : kind === 'duel' ? 'k10' : 'k25';
    return { kind, goal, wpn: WPNS.indexOf(c.wpn) >= 0 ? c.wpn : 'all', map: MAPS.indexOf(c.map) >= 0 ? c.map : 'arena', ff: kind === 'team' && c.ff ? 1 : 0 };
  }
  const goalOf = (g) => { const m = /^([kt])(\d{1,3})$/.exec(g) || ['', 'k', '25']; return m[1] === 'k' ? { k: +m[2], t: 0 } : { k: 0, t: +m[2] * 60 }; };
  const fmt = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const nameOf = (s) => {
    if (s === (NN.slot | 0)) { try { return String(NN.localInfo().name || 'PLAYER').slice(0, 14).toUpperCase(); } catch (e) { return 'PLAYER'; } }
    const p = NN.players.find((x) => x.slot === s);
    return String((p && p.name) || 'PLAYER ' + s).slice(0, 14).toUpperCase();
  };

  let cur = null;

  class Pvp {
    constructor(run, co, spec) {
      this.r = run; this.co = co; this.cfg = norm(spec.pvp); this.goal = goalOf(this.cfg.goal); this.host = co.host; this.me = co.slot;
      this.team = this.cfg.kind === 'team';
      this.pl = new Map(); this.phase = 'wait'; this.rd = 0; this.items = []; this.tm = 0; this.tl = 0; this.warm = 0; this.cands = []; this.inSet = new Set();
      this.self = { dead: false, till: 0, by: 0, t0: 0 }; this.tab = false; this.offs = []; this.rate = new Map(); this.waitT = 0; this.sbT = 0; this.pgT = 0; this.hudT = 0; this.tagT = 0; this.over = null; this.fov0 = run.camera ? run.camera.fov : 0;
      run.__pvp = this;
      co.ff = false; co.ffAvail = true;
      co.ffApply = (a, t, d, w, h) => this.apply(a, t, d, w, h);
      co.ffHit = (m, amt, head, pt) => this.hitLocal(m, amt, head, pt);
      co.ffTick = () => this.ffTick();
      co.ffBoom = () => {}; co.setFF = () => {}; co.ffSend = () => {}; co.ffUi = () => {};
      if (co.ffBadge) { co.ffBadge.remove(); co.ffBadge = null; }
      this.offs.push(NN.on('pv', (p) => { try { this.rx(p); } catch (e) { if (!this.errLogged) { this.errLogged = true; console.warn('[pvp]', e); } } }));
      this.offs.push(NN.on('net:left', (p) => this.onLeft(p.slot | 0)));
      run.hooks.push((dt) => { try { this.tick(dt); } catch (e) { if (!this.errLogged) { this.errLogged = true; console.warn('[pvp]', e); } } });
      run.on(document, 'keydown', (e) => { if (e.code === 'Tab') { e.preventDefault(); if (!co.chatOpen) this.setTab(true); } });
      run.on(document, 'keyup', (e) => { if (e.code === 'Tab') { e.preventDefault(); this.setTab(false); } });
      run.on(window, 'blur', () => this.setTab(false));
      this.buildUi();
    }

    // ---------------------------------------------------------------- сеть
    bc(m, to) {
      m.type = 'pv';
      if (to && to !== 1) NN.sendAction(m, { to });
      else if (!to) NN.sendAction(m);
      if (!to || to === 1) this.rx(Object.assign({ from: 1 }, m));
    }
    toHost(m) { m.type = 'pv'; NN.sendAction(m); }
    rx(p) {
      const f = p.from | 0, o = p.o;
      if (this.host) {
        if (f === 1) { this.recv(o, p); return; }
        if (o === 'pk') this.hPick(f, p.i | 0);
        else if (o === 'pg') { const P = this.pl.get(f); if (P) P.rt = clamp(num(p.rt), 0, 999); }
        else if (o === 'lv') this.onLeft(f);
        return;
      }
      if (f === 1) this.recv(o, p);
    }
    recv(o, p) {
      if (o === 'go') this.onGo(p); else if (o === 'k') this.onKill(p); else if (o === 'r') this.onResp(p); else if (o === 'hp') this.onHp(p);
      else if (o === 'sc') this.onSc(p); else if (o === 'pu') this.onPu(p); else if (o === 'pi') this.onPi(p); else if (o === 'end') this.onEnd(p);
      else if (o === 'lb') { if (!this.host) this.leave(); }
    }

    // ---------------------------------------------------------------- карта и точки спауна
    bounds() {
      const r = this.r, s = r.mm && r.mm.secs && r.mm.secs[0];
      if (this.cfg.map === 'yard' && s) { const hw = s.W / 2 - 1.6; return { x0: -hw, x1: hw, z0: s.zB + 1.6, z1: s.zA - 1.6 }; }
      return { x0: -9.5, x1: 9.5, z0: -45, z1: 18 };
    }
    scan() {
      const r = this.r, b = this.bounds(), out = [], o = [[0, 0], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9], [0.65, 0.65], [-0.65, 0.65], [0.65, -0.65], [-0.65, -0.65]];
      for (let x = b.x0; x <= b.x1 + 0.01; x += 2.5) for (let z = b.z1; z >= b.z0 - 0.01; z -= 2.5) if (o.every((d) => !r.blocked(x + d[0], z + d[1]))) out.push({ x: q(x, 100), z: q(z, 100) });
      this.cands = out; this.bd = b;
      return out;
    }
    yawTo(x, z) { const b = this.bd || this.bounds(); return q(Math.atan2(-((b.x0 + b.x1) / 2 - x), -((b.z0 + b.z1) / 2 - z)), 100); }
    pos(s) {
      if (s === this.me) return { x: this.r.p.x, z: this.r.p.z, dead: this.r.dead, got: true };
      const m = this.co.remotes.get(s); return m && m.rem ? m.rem : null;
    }
    spawnFor(foes, zone) {
      let L = this.cands;
      if (zone !== undefined && zone >= 0 && L.length > 8) { const zs = L.map((c) => c.z).sort((a, c) => c - a), cut = Math.floor(zs.length * 0.4); L = zone === 0 ? L.filter((c) => c.z >= zs[cut]) : L.filter((c) => c.z <= zs[zs.length - 1 - cut]); }
      if (!L.length) { const b = this.bd || this.bounds(); return { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }; }
      const sc = L.map((c) => ({ c, d: foes.length ? Math.min.apply(null, foes.map((f) => Math.hypot(f.x - c.x, f.z - c.z))) : Math.random() * 10 })).sort((a, c) => c.d - a.d);
      return sc[Math.floor(Math.random() * Math.min(4, sc.length))].c;
    }
    foesOf(P) {
      const a = [];
      this.pl.forEach((X) => { if (X !== P && X.alive && (!this.team || X.team !== P.team)) { const p = this.pos(X.slot); if (p) a.push({ x: p.x, z: p.z }); } });
      return a;
    }

    // ---------------------------------------------------------------- хост: раунд
    startRound() {
      const slots = [1].concat(NN.players.map((x) => x.slot)).filter((s) => this.inSet.has(s) || s === 1);
      if (slots.length < 2) return;
      this.scan();
      const order = slots.slice().sort(() => Math.random() - 0.5), used = [], list = [];
      this.pl = new Map();
      order.forEach((s, i) => {
        const team = this.team ? i % 2 : -1;
        this.pl.set(s, { slot: s, name: nameOf(s), team, k: 0, d: 0, hs: 0, hp: HP, alive: true, inv: now() + (WARM + PROT) * 1000, rt: 0, resp: 0 });
      });
      order.forEach((s) => {
        const P = this.pl.get(s), sp = this.spawnFor(used, this.team ? P.team : undefined);
        used.push({ x: sp.x, z: sp.z }); list.push([s, P.team, sp.x, sp.z, this.yawTo(sp.x, sp.z), P.name]);
      });
      const it = [], taken = [];
      const place = (n, kind) => { for (let i = 0; i < n && this.cands.length; i += 1) { let best = null, bd = -1; for (let j = 0; j < 8; j += 1) { const c = this.cands[Math.floor(Math.random() * this.cands.length)], d = taken.length ? Math.min.apply(null, taken.map((t) => Math.hypot(t.x - c.x, t.z - c.z))) : 99; if (d > bd) { bd = d; best = c; } } taken.push(best); it.push([best.x, best.z, kind]); } };
      place(Math.min(5, Math.ceil(this.cands.length / 8)), 0); place(Math.min(4, Math.ceil(this.cands.length / 10)), 1);
      this.rd += 1;
      this.bc({ o: 'go', rd: this.rd, cfg: this.cfg, pl: list, it });
    }
    hPick(slot, i) {
      const it = this.items[i], P = this.pl.get(slot), p = this.pos(slot);
      if (this.phase !== 'live' || !it || !it.on || !P || !P.alive || !p || Math.hypot(p.x - it.x, p.z - it.z) > 3.4) return;
      it.on = false; it.back = now() + (it.kind ? 30000 : 22000);
      if (it.kind === 1) { if (P.hp >= HP) { it.on = true; return; } P.hp = Math.min(HP, P.hp + 45); this.bc({ o: 'hp', t: slot, hp: P.hp, heal: 1 }, slot); }
      this.bc({ o: 'pu', i, t: slot });
    }
    apply(att, tgt, d, wid, head) {
      if (!this.host || this.phase !== 'live' || att === tgt || !(d > 0)) return false;
      const A = this.pl.get(att), Tg = this.pl.get(tgt); if (!A || !Tg || !A.alive || !Tg.alive || Tg.inv > now()) return false;
      if (this.team && A.team === Tg.team && !this.cfg.ff) return false;
      const pa = this.pos(att), pt = this.pos(tgt); if (!pa || !pt || !pa.got || !pt.got) return false;
      const W = C.WEAPONS && C.WEAPONS[wid]; if (!W || !WPN.includes(wid)) return false;
      if (Math.hypot(pa.x - pt.x, pa.z - pt.z) > W.range + 6) return false;
      const t = now(), b = this.rate.get(att) || { t, n: 0 };
      if (t - b.t > 1000) { b.t = t; b.n = 0; } this.rate.set(att, b);
      if (++b.n > 12 * Math.max(1, W.pellets || 1)) return false;
      if (!this.r.hasLOS(pa.x, 1.5, pa.z, pt.x, 1.2, pt.z)) return false;
      d = Math.min(d, W.dmg * (head ? 2.4 : 1) * 1.1 + 1) * DMGK * (this.team && A.team === Tg.team ? 0.5 : 1);
      A.inv = 0; Tg.hp -= d; Tg.by = att;
      if (Tg.hp <= 0) { Tg.hp = 0; this.kill(att, tgt, wid, head); return true; }
      this.bc({ o: 'hp', t: tgt, hp: Math.round(Tg.hp), ax: q(pa.x, 10), az: q(pa.z, 10) }, tgt);
      return true;
    }
    sbArr() { return Array.from(this.pl.values()).map((P) => [P.slot, P.k, P.d, Math.round(P.rt), P.team, P.hs]); }
    kill(a, t, wid, head) {
      const A = this.pl.get(a), Tg = this.pl.get(t); if (!Tg || !Tg.alive) return;
      Tg.alive = false; Tg.d += 1; Tg.resp = now() + RESP * 1000;
      if (A && a !== t) { if (this.team && A.team === Tg.team) A.k = Math.max(0, A.k - 1); else { A.k += 1; if (head) A.hs += 1; } }
      this.bc({ o: 'k', a, t, w: wid, h: head ? 1 : 0, s: this.sbArr() });
      this.checkEnd();
    }
    teamKills(tm) { let n = 0; this.pl.forEach((P) => { if (P.team === tm) n += P.k; }); return n; }
    checkEnd() {
      if (this.phase !== 'live') return;
      const g = this.goal; let done = '';
      if (g.k) { if (this.team) { if (this.teamKills(0) >= g.k || this.teamKills(1) >= g.k) done = 'kills'; } else this.pl.forEach((P) => { if (P.k >= g.k) done = 'kills'; }); }
      if (g.t && this.tl <= 0) done = 'time';
      if (this.tm > MAXT) done = 'time';
      if (done) this.finish();
    }
    finish() {
      if (this.phase !== 'live') return;
      const rows = Array.from(this.pl.values()), dur = this.tm;
      rows.sort((a, c) => c.k - a.k || a.d - c.d);
      let win = -1;
      if (this.team) { const a = this.teamKills(0), c = this.teamKills(1); win = a === c ? -1 : a > c ? 0 : 1; }
      else if (rows.length && (rows.length < 2 || rows[0].k !== rows[1].k || rows[0].d !== rows[1].d)) win = rows[0].slot;
      const pool = this.team && win >= 0 ? rows.filter((P) => P.team === win) : rows, mvp = pool.length ? pool[0].slot : 0;
      const ok = dur >= 90 && rows.length >= 2;
      const out = rows.map((P) => { const won = this.team ? P.team === win : P.slot === win; return [P.slot, P.k, P.d, P.team, ok ? Math.min(KP_CAP, 15 + 4 * P.k + (won ? 40 : 0)) : 0, P.hs]; });
      this.bc({ o: 'end', rd: this.rd, rows: out, win, mvp, dur: Math.round(dur) });
    }
    onLeft(slot) {
      this.inSet.delete(slot);
      if (!this.host) return;
      this.pl.delete(slot);
      const gone = this.pl.size < 2 || (this.team && !Array.from(this.pl.values()).some((P) => P.team === 0) || (this.team && !Array.from(this.pl.values()).some((P) => P.team === 1)));
      if (this.phase === 'live' && gone) this.finish();
      else if (this.phase === 'warm' && gone) this.phase = 'wait';
    }
    hostTick(dt) {
      const t = now();
      if (this.phase === 'wait') {
        this.waitT += dt;
        const ready = this.co.ready && NN.players.length > 0 && NN.players.every((x) => this.co.readySet.has(x.slot));
        if ((ready && this.waitT > 1.2) || this.waitT > 25) { NN.players.forEach((x) => this.inSet.add(x.slot)); this.inSet.add(1); this.startRound(); }
        return;
      }
      if (this.phase !== 'live') return;
      this.pl.forEach((P) => {
        if (!P.alive && P.resp && t >= P.resp) {
          P.resp = 0; P.alive = true; P.hp = HP; P.inv = t + PROT * 1000;
          const sp = this.spawnFor(this.foesOf(P));
          this.bc({ o: 'r', t: P.slot, x: sp.x, z: sp.z, yaw: this.yawTo(sp.x, sp.z) });
        }
      });
      this.items.forEach((it, i) => { if (!it.on && t >= it.back) { it.on = true; this.bc({ o: 'pi', i }); } });
      this.sbT += dt;
      if (this.sbT >= 1) { this.sbT = 0; this.bc({ o: 'sc', s: this.sbArr(), tl: Math.round(this.tl), tm: Math.round(this.tm) }); }
      this.checkEnd();
    }

    // ---------------------------------------------------------------- клиент: обработка сообщений хоста
    onGo(p) {
      const r = this.r; this.cfg = norm(p.cfg); this.goal = goalOf(this.cfg.goal); this.team = this.cfg.kind === 'team'; this.rd = p.rd | 0; this.over = null;
      this.pl = new Map(); let mine = null;
      (Array.isArray(p.pl) ? p.pl : []).slice(0, 6).forEach((a) => {
        const s = a[0] | 0, P = { slot: s, name: String(a[5] || nameOf(s)).slice(0, 14), team: a[1] | 0, k: 0, d: 0, hs: 0, hp: HP, alive: true, inv: now() + (WARM + PROT) * 1000, rt: 0, resp: 0 };
        this.pl.set(s, P); if (s === this.me) mine = a;
      });
      this.buildItems(Array.isArray(p.it) ? p.it : []);
      this.phase = 'warm'; this.warm = WARM; this.tm = 0; this.tl = this.goal.t; this.sbT = 0; this.rate.clear();
      if (this.self.dead) this.undie();
      if (mine) { r.spawn(num(mine[2]), num(mine[3]), num(mine[4])); r.hp = r.maxHp || HP; r.cb && (r.cb.hurtK = 0); }
      this.loadout(); r.refreshHud && r.refreshHud();
      this.hideRes(); this.feedEl.innerHTML = ''; this.hud();
      this.say('GET READY', '', WARM);
    }
    loadout() {
      const r = this.r, w = this.cfg.wpn;
      const ids = w === 'all' ? WPN : w === 'random' ? [WPN[Math.floor(Math.random() * WPN.length)]] : [w];
      r.clearWeapons();
      ids.forEach((id, i) => { if (C.WEAPONS[id]) r.giveWeapon(id, { equip: ids.length === 1 || (ids.length > 1 && id === 'ak') }); });
      if (r.wp && r.inv.length) r.refreshHud && r.refreshHud();
    }
    onSc(p) {
      if (this.host) return;
      this.applySb(p.s);
      const ids = new Set((Array.isArray(p.s) ? p.s : []).map((a) => a[0] | 0)); Array.from(this.pl.keys()).forEach((k) => { if (!ids.has(k)) this.pl.delete(k); });
      if (p.tl !== undefined) this.tl = num(p.tl); if (p.tm !== undefined) this.tm = num(p.tm);
      if (this.phase === 'warm' && num(p.tm) > 0) { this.phase = 'live'; this.warm = 0; }
      this.hud();
    }
    applySb(s) {
      (Array.isArray(s) ? s : []).forEach((a) => {
        const P = this.pl.get(a[0] | 0); if (!P) return;
        P.k = a[1] | 0; P.d = a[2] | 0; P.rt = num(a[3]); P.team = a[4] | 0; P.hs = a[5] | 0;
      });
    }
    onKill(p) {
      const a = p.a | 0, t = p.t | 0, Tg = this.pl.get(t); if (!Tg) return;
      if (!this.host) this.applySb(p.s);
      Tg.alive = false;
      this.addFeed(a, t, String(p.w || ''), !!p.h);
      if (t === this.me) this.die(a);
      if (a === this.me && t !== this.me) { const r = this.r; try { r.hitmark && r.hitmark(!!p.h); } catch (e) { /* ok */ } this.say('KILL', nameOf(t), 1.3, true); }
      this.hud();
    }
    onResp(p) {
      const t = p.t | 0, P = this.pl.get(t); if (!P) return;
      P.alive = true; P.hp = HP; P.resp = 0; P.inv = now() + PROT * 1000;
      if (t === this.me) this.respawn(num(p.x), num(p.z), num(p.yaw));
    }
    onHp(p) {
      const r = this.r, hp = clamp(num(p.hp), 0, HP); if (r.dead) return;
      const P = this.pl.get(this.me); if (P) P.hp = hp;
      if (p.heal) { r.hp = Math.min(r.maxHp || HP, hp); r.refreshHud && r.refreshHud(); this.r.sfx && this.r.sfx('notification'); return; }
      const dmg = r.hp - Math.max(1, hp); if (dmg <= 0) { r.hp = Math.max(1, hp); r.refreshHud && r.refreshHud(); return; }
      this.allow = true; const m = r.mercy; r.mercy = 1;
      try { r.hurt(dmg, p.ax, p.az); } finally { r.mercy = m; this.allow = false; }
      if (r.hp <= 0) r.hp = 1;
    }
    onPu(p) {
      const it = this.items[p.i | 0]; if (!it) return;
      it.on = false; it.m.visible = false;
      if ((p.t | 0) === this.me && !this.r.dead) {
        const r = this.r;
        if (!it.kind && r.inv) r.inv.forEach((w) => { w.reserve = Math.min(w.def.maxReserve, w.reserve + Math.ceil(w.def.mag * 1.5)); });
        try { r.sfx && r.sfx('notification'); } catch (e) { /* ok */ }
        r.refreshHud && r.refreshHud();
        this.say(it.kind ? 'HEALTH' : 'AMMO', '', 0.8, true);
      }
    }
    onPi(p) { const it = this.items[p.i | 0]; if (it) { it.on = true; it.m.visible = true; } }
    onEnd(p) {
      this.phase = 'over'; this.over = p;
      (Array.isArray(p.rows) ? p.rows : []).forEach((a) => { const P = this.pl.get(a[0] | 0); if (P) { P.k = a[1] | 0; P.d = a[2] | 0; P.hs = a[5] | 0; } });
      let kp = 0;
      const mine = (Array.isArray(p.rows) ? p.rows : []).find((a) => (a[0] | 0) === this.me);
      if (mine && window.Toys && Toys.pvpReward) { try { kp = Toys.pvpReward(clamp(mine[4] | 0, 0, KP_CAP)); } catch (e) { kp = 0; } }
      if (this.self.dead) this.undie();
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ok */ }
      this.showRes(p, kp);
    }

    // ---------------------------------------------------------------- локальный игрок: смерть и респаун
    die(by) {
      const r = this.r; if (this.self.dead) return;
      r.hp = 0; r.dead = true; r.deathReason = 'ELIMINATED';
      r.snd && r.snd.play('death');
      r.fireHeld = false; r.padFire = false; r.aimWant = false; r.rl = null;
      r.syncLock && r.syncLock(); r.rumble && r.rumble(1, 1, 400); r.refreshHud && r.refreshHud();
      const T = window.THREE, cam = r.camera, v = new T.Vector3(); cam.getWorldDirection(v);
      r.camFree = { pos: cam.position.clone(), look: cam.position.clone().add(v), fov: cam.fov, roll: 0 };
      this.self = { dead: true, till: now() + RESP * 1000, by, t0: now() };
    }
    undie() {
      const r = this.r; if (!this.self.dead && !r.dead) return;
      this.self.dead = false; r.dead = false;
      if (r.camFree) { r.camFree = null; r.prevYaw = undefined; r.blurX = r.blurY = 0; }
      if (r.camera && this.fov0) { r.camera.fov = this.fov0; r.camera.updateProjectionMatrix(); }
      this.msgEl.hidden = true;
    }
    respawn(x, z, yaw) {
      const r = this.r; this.undie();
      r.hp = r.maxHp || HP; r.stress = 0; if (r.cb) r.cb.hurtK = 0;
      r.spawn(x, z, yaw);
      if (this.cfg.wpn === 'random') this.loadout(); else if (r.inv) { r.inv.forEach((w) => { w.mag = w.def.mag; w.reserve = w.def.reserve; }); r.rl = null; }
      r.syncLock && r.syncLock(); r.refreshHud && r.refreshHud();
    }
    camTick(dt) {
      const r = this.r, cf = r.camFree; if (!cf || !this.self.dead) return;
      const k = 1 - Math.exp(-dt * 4), kp = this.self.by && this.self.by !== this.me ? this.pos(this.self.by) : null;
      cf.pos.y += (0.4 - cf.pos.y) * k; cf.roll += (0.55 - cf.roll) * k;
      if (kp) { cf.look.x += (kp.x - cf.look.x) * k; cf.look.y += (1.3 - cf.look.y) * k; cf.look.z += (kp.z - cf.look.z) * k; }
    }

    // ---------------------------------------------------------------- цели для стрельбы (куклы соперников)
    canTarget(slot) {
      const P = this.pl.get(slot); if (!P || this.phase !== 'live' || !P.alive || P.inv > now()) return false;
      const M = this.pl.get(this.me); if (this.team && M && P.team === M.team && !this.cfg.ff) return false;
      return true;
    }
    ffTick() {
      const r = this.r, cb = r.cb, co = this.co; if (!cb) return;
      co.remotes.forEach((m) => {
        const s = m.ffT || (m.ffT = { alive: false, shape: 'cyl', x: 0, y: 0, z: 0, r: 0.36, h: 1.75, hr: 0.17, hy: 1.62, hp: 100, ally: false, damage: (amt, head, pt) => co.ffHit(m, amt, head, pt) });
        const on = this.canTarget(m.slot) && !r.dead && this.phase === 'live' && m.rem.got && !m.rem.dead && !co.gone;
        s.x = m.rem.x; s.z = m.rem.z; s.h = m.rem.crouch ? 1.2 : 1.75; s.hy = m.rem.crouch ? 1.1 : 1.62; s.alive = !!on;
        const i = cb.shoot.indexOf(s); if (on && i < 0) cb.shoot.push(s); else if (!on && i >= 0) cb.shoot.splice(i, 1);
      });
    }
    hitLocal(m, amt, head, pt) {
      const r = this.r, w = r.wp; if (!(amt > 0) || !this.canTarget(m.slot) || this.phase !== 'live') return;
      if (pt && r.bloodSplatTorso) { try { r.bloodSplatTorso({ x: pt.x, z: pt.z }, 1); } catch (e) { /* только картинка */ } }
      if (this.host) this.apply(1, m.slot, amt, w && w.id, head);
      else NN.sendAction({ type: 'ffh', t: m.slot, d: Math.round(amt * 10) / 10, w: w ? w.id : '', h: head ? 1 : 0 });
    }

    // ---------------------------------------------------------------- предметы
    buildItems(list) {
      this.clearItems();
      const T = window.THREE, geo = [new T.BoxGeometry(0.5, 0.32, 0.34), new T.BoxGeometry(0.46, 0.46, 0.46)], mat = [new T.MeshBasicMaterial({ color: 0xffd60a }), new T.MeshBasicMaterial({ color: 0x34c759 })];
      const ring = new T.RingGeometry(0.5, 0.62, 28), rm = [new T.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.55, side: T.DoubleSide }), new T.MeshBasicMaterial({ color: 0x34c759, transparent: true, opacity: 0.55, side: T.DoubleSide })];
      this.igeo = { geo, mat, ring, rm };
      list.slice(0, 16).forEach((a) => {
        const kind = a[2] ? 1 : 0, g = new T.Group(), b = new T.Mesh(geo[kind], mat[kind]), rg = new T.Mesh(ring, rm[kind]);
        rg.rotation.x = -Math.PI / 2; rg.position.y = -0.55; g.add(b); g.add(rg); g.position.set(num(a[0]), 0.9, num(a[1]));
        if (kind) { const cx = new T.Mesh(new T.BoxGeometry(0.1, 0.36, 0.5), new T.MeshBasicMaterial({ color: 0xffffff })); g.add(cx); }
        this.r.scene.add(g); this.items.push({ x: num(a[0]), z: num(a[1]), kind, on: true, back: 0, m: g, ph: Math.random() * 6, req: 0 });
      });
    }
    clearItems() {
      this.items.forEach((it) => { if (it.m.parent) it.m.parent.remove(it.m); });
      this.items = [];
    }
    itemTick(dt) {
      const r = this.r, P = this.pl.get(this.me), t = now();
      this.items.forEach((it, i) => {
        it.ph += dt * 2; it.m.rotation.y += dt * 1.6; it.m.position.y = 0.9 + Math.sin(it.ph) * 0.08;
        if (!it.on || this.phase !== 'live' || r.dead || !P || t < it.req) return;
        if (Math.hypot(r.p.x - it.x, r.p.z - it.z) > 1.3) return;
        if (it.kind && P.hp >= HP && r.hp >= (r.maxHp || HP)) return;
        if (!it.kind && r.inv && !r.inv.some((w) => w.reserve < w.def.maxReserve)) return;
        it.req = t + 600;
        if (this.host) this.hPick(1, i); else this.toHost({ o: 'pk', i });
      });
    }

    // ---------------------------------------------------------------- такт
    tick(dt) {
      const r = this.r; if (r.disposed) return;
      if (this.host) this.hostTick(dt);
      if (this.phase === 'warm') { this.warm -= dt; if (this.warm <= 0) { this.phase = 'live'; this.say('FIGHT', '', 1, true); } }
      else if (this.phase === 'live') { this.tm += dt; if (this.goal.t) this.tl -= dt; }
      if (this.self.dead) this.camTick(dt);
      this.itemTick(dt);
      if (!this.host && this.phase !== 'wait') { this.pgT += dt; if (this.pgT >= 3) { this.pgT = 0; this.toHost({ o: 'pg', rt: NN.rtt | 0 }); } }
      this.hudT += dt;
      if (this.hudT >= 0.25) { this.hudT = 0; this.hud(); }
      this.tagT += dt;
      if (this.tagT >= 1) { this.tagT = 0; this.tags(); }
    }
    tags() {
      this.co.remotes.forEach((m) => {
        const P = this.pl.get(m.slot); if (!m.tag || !P || !this.team) return;
        m.tag.style.color = TEAMC[P.team] || ''; const sm = m.tag.querySelector('small'); if (sm) sm.textContent = TEAMN[P.team] || '';
      });
    }

    // ---------------------------------------------------------------- интерфейс
    buildUi() {
      const r = this.r, ui = this.ui = document.createElement('div'); ui.className = 'pv-ui'; ui.setAttribute('data-i18n', 'net');
      const k = this.cfg.kind;
      ui.innerHTML = '<div class="pv-top"><div class="pv-a"><small></small><b>0</b></div><div class="pv-c"><b class="pv-tm">0:00</b><small class="pv-goal"></small></div><div class="pv-b"><small></small><b>0</b></div></div>' +
        '<div class="pv-feed"></div><div class="pv-msg" hidden><b></b><small translate="no"></small></div><div class="pv-prot" hidden><span>SPAWN PROTECTION</span></div><div class="pv-sb" hidden></div><div class="pv-res" hidden></div>';
      r.layer.appendChild(ui);
      this.feedEl = ui.querySelector('.pv-feed'); this.msgEl = ui.querySelector('.pv-msg'); this.sbEl = ui.querySelector('.pv-sb'); this.resEl = ui.querySelector('.pv-res'); this.protEl = ui.querySelector('.pv-prot');
      ui.classList.add('k-' + k);
      const top = ui.querySelector('.pv-top'); top.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.setTab(!this.tab); });
      this.hud();
    }
    say(a, b, sec, small) {
      const el = this.msgEl; el.hidden = false; el.classList.toggle('sm', !!small);
      el.querySelector('b').textContent = a; el.querySelector('small').textContent = b || '';
      clearTimeout(this.msgT); if (sec) this.msgT = setTimeout(() => { if (!this.self.dead && !(this.phase === 'warm')) el.hidden = true; }, sec * 1000);
    }
    hud() {
      const ui = this.ui; if (!ui) return;
      const r = this.r, M = this.pl.get(this.me), a = ui.querySelector('.pv-a'), b = ui.querySelector('.pv-b'), g = this.goal;
      if (this.team) {
        a.querySelector('small').textContent = 'RED'; b.querySelector('small').textContent = 'BLUE';
        a.querySelector('b').textContent = this.teamKills(0); b.querySelector('b').textContent = this.teamKills(1);
        a.style.color = TEAMC[0]; b.style.color = TEAMC[1];
      } else {
        let top = 0; this.pl.forEach((P) => { if (P.slot !== this.me && P.k > top) top = P.k; });
        a.querySelector('small').textContent = 'YOU'; b.querySelector('small').textContent = this.cfg.kind === 'duel' ? 'ENEMY' : 'BEST RIVAL';
        a.querySelector('b').textContent = M ? M.k : 0; b.querySelector('b').textContent = top; a.style.color = ''; b.style.color = '';
      }
      const tm = ui.querySelector('.pv-tm'); tm.textContent = this.phase === 'wait' ? '--:--' : g.t ? fmt(this.tl) : fmt(this.tm);
      const ge = ui.querySelector('.pv-goal');
      const gs = g.k ? 'k' + g.k : 't';
      if (ge.dataset.g !== gs) { ge.dataset.g = gs; ge.innerHTML = g.k ? '<span>FIRST TO</span> <em translate="no">' + g.k + '</em> <span>KILLS</span>' : '<span>TIME LIMIT</span>'; }
      const prot = !!(M && M.inv > now() && !this.self.dead && this.phase !== 'wait');
      this.protEl.hidden = !prot;
      if (this.self.dead) {
        const left = Math.max(0, Math.ceil((this.self.till - now()) / 1000));
        const el = this.msgEl; el.hidden = false; el.classList.remove('sm');
        el.querySelector('b').textContent = 'ELIMINATED';
        el.querySelector('small').textContent = (this.self.by && this.self.by !== this.me ? nameOf(this.self.by) + ' — ' : '') + left;
      } else if (this.phase === 'warm') {
        const el = this.msgEl; el.hidden = false; el.querySelector('b').textContent = 'GET READY'; el.querySelector('small').textContent = String(Math.max(1, Math.ceil(this.warm)));
      } else if (this.phase === 'wait') {
        const el = this.msgEl; el.hidden = false; el.classList.remove('sm'); el.querySelector('b').textContent = 'WAITING FOR PLAYERS'; el.querySelector('small').textContent = '';
      }
      if (!this.sbEl.hidden) this.drawSb(this.sbEl, false);
    }
    addFeed(a, t, w, head) {
      const d = document.createElement('div'), col = (s) => (this.team ? TEAMC[(this.pl.get(s) || {}).team] || '' : s === this.me ? '#ff3b30' : '');
      const An = this.pl.get(a), Tn = this.pl.get(t);
      d.className = (a === this.me ? 'me ' : t === this.me ? 'to ' : '');
      d.innerHTML = (a === t || !An ? '' : '<b translate="no" style="color:' + col(a) + '">' + esc(An.name) + '</b>') + '<i translate="no">' + (head ? '[' + esc(w.toUpperCase()) + ' · HS]' : '[' + esc(w.toUpperCase() || '—') + ']') + '</i><b translate="no" style="color:' + col(t) + '">' + esc(Tn ? Tn.name : '?') + '</b>';
      this.feedEl.appendChild(d);
      while (this.feedEl.children.length > 5) this.feedEl.firstChild.remove();
      setTimeout(() => d.remove(), 6000);
    }
    setTab(on) { if (this.tab === on) return; this.tab = on; if (this.sbEl) { this.sbEl.hidden = !on || this.over; if (on) this.drawSb(this.sbEl, false); } }
    drawSb(el, fin) {
      const rows = Array.from(this.pl.values());
      const mk = (P) => '<tr class="' + (P.slot === this.me ? 'me ' : '') + (P.alive ? '' : 'dead') + '"><td class="n" translate="no"><i style="background:' + (this.team ? TEAMC[P.team] : '#bbb') + '"></i>' + esc(P.name) + '</td><td translate="no">' + P.k + '</td><td translate="no">' + P.d + '</td><td translate="no">' + (P.slot === 1 ? '—' : Math.round(P.rt)) + '</td></tr>';
      const head = '<thead><tr><th><span>PLAYER</span></th><th><span>KILLS</span></th><th><span>DEATHS</span></th><th><span>PING</span></th></tr></thead>';
      const ord = (a, c) => c.k - a.k || a.d - c.d;
      let body = '';
      if (this.team) {
        [0, 1].forEach((tm) => { const L = rows.filter((P) => P.team === tm).sort(ord); body += '<tbody><tr class="tm" style="color:' + TEAMC[tm] + '"><td colspan="4"><span>' + TEAMN[tm] + '</span> <em translate="no">' + this.teamKills(tm) + '</em></td></tr>' + L.map(mk).join('') + '</tbody>'; });
      } else body = '<tbody>' + rows.sort(ord).map(mk).join('') + '</tbody>';
      el.innerHTML = '<table>' + head + body + '</table>';
    }
    showRes(p, kp) {
      const el = this.resEl, win = p.win | 0, mvp = p.mvp | 0;
      let t1 = 'DRAW';
      const M = this.pl.get(this.me);
      if (this.team) t1 = win < 0 ? 'DRAW' : (M && M.team === win ? 'VICTORY' : 'DEFEAT'); else t1 = win < 0 ? 'DRAW' : win === this.me ? 'VICTORY' : 'DEFEAT';
      const sub = this.team ? (win < 0 ? '' : '<span>' + TEAMN[win] + ' TEAM WINS</span>') : (win > 0 && this.pl.get(win) ? '<span translate="no">' + esc(this.pl.get(win).name) + '</span> <span>WINS</span>' : '');
      const mvpP = this.pl.get(mvp);
      el.innerHTML = '<div class="pv-rbox"><small>' + (this.cfg.kind === 'duel' ? 'DUEL' : this.team ? 'TEAM DEATHMATCH' : 'DEATHMATCH') + '</small><h2 class="' + t1.toLowerCase() + '"><span>' + t1 + '</span></h2><p class="pv-sub">' + sub + '</p>' +
        (mvpP ? '<p class="pv-mvp"><span>MVP</span> <b translate="no">' + esc(mvpP.name) + '</b> <em translate="no">' + mvpP.k + ' / ' + mvpP.d + '</em></p>' : '') +
        '<div class="pv-rt"></div>' + '<p class="pv-kp">' + (kp > 0 ? '<span>REWARD</span> <b translate="no">+' + kp + ' KP</b>' : '') + '</p>' +
        '<div class="pv-bt">' + (this.host ? '<button type="button" data-v="again">PLAY AGAIN</button>' : '<p class="pv-wt"><span>WAITING FOR THE HOST…</span></p>') + '<button type="button" data-v="lobby">BACK TO LOBBY</button></div></div>';
      this.drawSb(el.querySelector('.pv-rt'), true);
      el.hidden = false; this.sbEl.hidden = true;
      el.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.v === 'again') this.again(); else this.toLobby(); };
      ['pointerdown', 'mousedown', 'touchstart'].forEach((n) => el.addEventListener(n, (e) => e.stopPropagation(), { passive: true }));
      this.msgEl.hidden = true;
      const bt = el.querySelector('button'); if (bt) try { bt.focus({ preventScroll: true }); } catch (e) { /* ok */ }
    }
    hideRes() { this.resEl.hidden = true; this.resEl.innerHTML = ''; }
    again() {
      if (!this.host || this.phase !== 'over') return;
      this.startRound();
    }
    toLobby() { if (this.host) this.bc({ o: 'lb' }); else this.toHost({ o: 'lv' }); this.leave(); }
    leave() { const r = this.r; if (!r.disposed) r.finish(false); }
    dispose() {
      this.offs.forEach((f) => { try { f(); } catch (e) { /* ok */ } });
      this.clearItems(); clearTimeout(this.msgT);
      if (this.ui) this.ui.remove();
      if (cur === this) cur = null;
    }
  }

  function attach(run) {
    if (run.__pvp) return run.__pvp;
    const co = run.__co; if (!co || !co.spec || co.spec.mode !== 'pvp') return null;
    const pv = cur = new Pvp(run, co, co.spec);
    const d0 = run.dispose; run.dispose = function () { pv.dispose(); return d0.apply(this, arguments); };
    return pv;
  }

  MIS.pvpbox = {
    title: 'PVP',
    build(r) {
      const sp = r.opts && r.opts.coop, cfg = norm(sp && sp.pvp);
      if (cfg.map === 'yard' && MIS[20] && MIS[20].build) MIS[20].build(r); else { MIS.sandbox.build(r); r.spawn(0, 17, 0); }
    },
    async play(r) {
      const pv = attach(r), co = r.__co;
      r.god = false; r.layer.classList.add('sb-clean');
      if (pv) { try { pv.loadout(); } catch (e) { /* оружие выдаст go */ } }
      const box = r.qs('.m-pause > div'), abort = r.qs('.m-abort');
      if (box) { const h = box.querySelector('.eyebrow'); if (h) h.textContent = 'PVP PAUSED'; }
      if (abort) abort.textContent = '[LEAVE PVP]';
      if (co) co.onReady();
      await r.fade(0, 0.8);
      r.objective('PVP — LAST ONE STANDING WINS');
      await r.phase('pvpbox', () => new Promise(() => {}));
    }
  };

  const die0 = RP.die;
  RP.die = function () { if (this.__pvp) return undefined; return die0.apply(this, arguments); };
  const hurt0 = RP.hurt;
  RP.hurt = function () { if (this.__pvp && !this.__pvp.allow) return undefined; return hurt0.apply(this, arguments); };

  const start0 = window.Missions.start;
  window.Missions.start = function (id, opts) {
    const run = start0.apply(this, arguments);
    if (run && run.__co && opts && opts.coop && opts.coop.mode === 'pvp') attach(run);
    return run;
  };

  window.NexaPvp = { norm, goalOf, GOALS, KINDS, WPNS, MAPS, TEAMC, get active() { return !!cur; }, get state() { return cur ? { phase: cur.phase, rd: cur.rd, tm: cur.tm, tl: cur.tl, pl: Array.from(cur.pl.values()).map((P) => ({ slot: P.slot, team: P.team, k: P.k, d: P.d, alive: P.alive, hp: Math.round(P.hp) })), items: cur.items.map((i) => ({ kind: i.kind, on: i.on, x: i.x, z: i.z })), dead: cur.self.dead, over: cur.over } : null; } };
}());
