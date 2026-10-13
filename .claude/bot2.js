// Реалистичный бот: ходит клавишами с коллизиями (никаких телепортов), стреляет по врагам, подбирает предметы,
// жмёт «E» по прицелу. Нужен, чтобы ловить баги прохождения, которые не видит бот-телепорт (.claude/bot.js).
(() => {
  if (!window.__B2LIVE) HTMLMediaElement.prototype.play = () => Promise.resolve(); // в режиме «смотрелки» звук настоящий
  window.__errs = [];
  window.addEventListener('error', (e) => __errs.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => __errs.push('REJ ' + (e.reason && e.reason.message || e.reason)));
  const yieldNow = () => new Promise((res) => { const c = new MessageChannel(); c.port1.onmessage = () => res(); c.port2.postMessage(0); });
  const B = window.__B2 = { log: [], done: false, exited: false, ticks: 0, opt: {}, side: 1, stuck: 0, last: null, notes: [] };
  const note = (s) => { if (B.notes.length < 150) B.notes.push((B.ticks / 30).toFixed(0) + 's ' + s); };

  B.boot = async (id, opt) => {
    B.wallSeen = {}; B.walls = 0;
    B.opt = opt || {}; B.log = []; B.notes = []; B.done = false; B.exited = false; B.ticks = 0; B.side = 1; B.stuck = 0; B.last = null; B.stay = null; B.fireT = 0; B.sealed = 0; __errs.length = 0;
    const r = Missions.start(id, { playSfx() {}, onComplete() { B.done = true; }, onExit() { B.exited = true; }, onStage() {}, onCutscene() {} });
    if (!r) return 'start refused';
    window.__r = r;
    for (let i = 0; i < 300; i += 1) { await new Promise((res) => setTimeout(res, 100)); const b = document.querySelector('.m-enter'); if (b && !b.hidden) break; }
    if (B.opt.hack !== false) r.hack = () => Promise.resolve(true);
    r.enter();
    if (B.opt.live) { // реальное время: бот работает хуком внутри настоящего цикла игры (rAF) — всё видно в окне
      B.pause = false;
      r.addHook((dt) => { if (r.disposed || B.done || B.exited || B.pause) { r.keys.KeyW = false; r.fireHeld = false; return; } B.ticks += 1; try { B.bot(r, Math.min(dt || 1 / 60, 0.1)); } catch (e) { __errs.push('bot ' + e.message); } });
    }
    return 'booted ' + id;
  };

  const fwd = (h) => [-Math.sin(h), -Math.cos(h)];
  // идти к точке: выбираем направление так, чтобы ближайшие 0.9 м были свободны для игрока (r.blocked), липнем к одной стороне обхода
  B.walk = (r, x, z, stop) => {
    const p = r.p, K = r.keys, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < stop) { K.KeyW = false; K.ShiftLeft = false; return true; }
    const want = Math.atan2(-dx, -dz), s = B.side;
    let pick = null;
    for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.0, -2.0, 2.7]) {
      const h = want + off * s, f = fwd(h);
      let ok = true;
      for (const L of [0.3, 0.6, 0.95]) if (r.blocked(p.x + f[0] * L, p.z + f[1] * L)) { ok = false; break; }
      if (ok) { pick = h; break; }
    }
    if (pick === null) { K.KeyW = false; B.side = -B.side; return false; }
    p.yaw = pick; p.pitch = 0;
    K.KeyW = true; K.ShiftLeft = d > 3;
    return false;
  };
  // путь по сетке 0.5 м с коллизиями игрока (BFS 8 направлений без срезания углов); ячейки кэшируются на один расчёт
  B.plan = (r, tx, tz) => {
    const B0 = r.bounds || { cx: 0, cz: -20, w: 110, d: 220 }, M = 14;
    // сетка только вокруг игрока и цели (иначе на больших картах расчёт пути тормозит бота)
    const ax0 = Math.max(B0.cx - B0.w / 2, Math.min(r.p.x, tx) - M), ax1 = Math.min(B0.cx + B0.w / 2, Math.max(r.p.x, tx) + M);
    const az0 = Math.max(B0.cz - B0.d / 2, Math.min(r.p.z, tz) - M), az1 = Math.min(B0.cz + B0.d / 2, Math.max(r.p.z, tz) + M);
    const b = { cx: (ax0 + ax1) / 2, cz: (az0 + az1) / 2, w: ax1 - ax0 + 0.8, d: az1 - az0 + 0.8 };
    const st = 0.5, nx = Math.ceil(b.w / st), nz = Math.ceil(b.d / st), x0 = b.cx - b.w / 2, z0 = b.cz - b.d / 2;
    const ci = (x) => Math.floor((x - x0) / st), cj = (z) => Math.floor((z - z0) / st), cache = new Int8Array(nx * nz).fill(-1);
    const free = (i, j) => {
      if (i < 0 || j < 0 || i >= nx || j >= nz) return false;
      const k = i + j * nx;
      if (cache[k] < 0) { const x = x0 + (i + 0.5) * st, z = z0 + (j + 0.5) * st; cache[k] = (Math.abs(x - b.cx) < b.w / 2 - 0.4 && Math.abs(z - b.cz) < b.d / 2 - 0.4 && !r.blocked(x, z)) ? 1 : 0; }
      return cache[k] === 1;
    };
    const near = (i, j) => { if (free(i, j)) return [i, j]; for (let d = 1; d < 8; d += 1) for (let a = -d; a <= d; a += 1) for (let c = -d; c <= d; c += 1) if ((Math.abs(a) === d || Math.abs(c) === d) && free(i + a, j + c)) return [i + a, j + c]; return null; };
    const s = near(ci(r.p.x), cj(r.p.z)), g = near(ci(tx), cj(tz));
    const out = { tx, tz, t: r.time, i: 0, path: null };
    if (!s || !g) return out;
    const par = new Int32Array(nx * nz).fill(-2), q = [s[0] + s[1] * nx]; par[q[0]] = -1;
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const gk = g[0] + g[1] * nx;
    for (let h = 0; h < q.length && par[gk] === -2; h += 1) {
      const k = q[h], i = k % nx, j = (k - i) / nx;
      for (const [a, c] of D) {
        const ni = i + a, nj = j + c, nk = ni + nj * nx;
        if (par[nk] !== -2 || !free(ni, nj)) continue;
        if (a && c && (!free(i + a, j) || !free(i, j + c))) continue;
        par[nk] = k; q.push(nk);
      }
    }
    if (par[gk] === -2) return out;
    const pts = []; for (let k = gk; k !== -1; k = par[k]) { const i = k % nx, j = (k - i) / nx; pts.push([x0 + (i + 0.5) * st, z0 + (j + 0.5) * st]); }
    pts.reverse(); pts.push([tx, tz]); out.path = pts; return out;
  };
  // идти к точке по пути BFS (если пути нет — прямая ходьба); сглаживание: выбираем самую дальнюю точку пути с прямой видимостью
  B.go = (r, x, z, stop) => {
    const p = r.p;
    if (Math.hypot(x - p.x, z - p.z) < stop) return B.walk(r, x, z, stop);
    if (!B.pl || Math.hypot(B.pl.tx - x, B.pl.tz - z) > 0.8 || r.time - B.pl.t > 1.2) B.pl = B.plan(r, x, z);
    const path = B.pl.path;
    if (!path) return B.walk(r, x, z, stop);
    while (B.pl.i < path.length - 1 && Math.hypot(path[B.pl.i][0] - p.x, path[B.pl.i][1] - p.z) < 0.55) B.pl.i += 1;
    let pick = B.pl.i;
    for (let k = Math.min(path.length - 1, B.pl.i + 14); k > B.pl.i; k -= 1) {
      const w = path[k], L = Math.hypot(w[0] - p.x, w[1] - p.z); let ok = true;
      for (let t = 0.3; t < L && ok; t += 0.3) if (r.blocked(p.x + (w[0] - p.x) * t / L, p.z + (w[1] - p.z) * t / L)) ok = false;
      if (ok) { pick = k; break; }
    }
    const w = path[pick];
    return B.walk(r, w[0], w[1], pick === path.length - 1 ? stop : 0.05);
  };
  B.aimAt = (r, x, y, z) => {
    const p = r.p, ey = r.camera.position.y, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 0.01;
    p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(y - ey, d);
  };

  // детектор: враг стоит внутри стены/ящика или за границей комнаты (спавн «в стене»)
  B.wallCheck = (r) => {
    if (!r.cb) return;
    B.rt = (B.rt || 0) + 1;
    let reach = null;
    if (B.rt % 45 === 0 && r.cb.enemies.some((e) => !e.dead && !e.friendly && !e.t.passive && !e.rchk)) reach = B.reach(r);
    r.cb.enemies.forEach((e) => {
      if (e.dead || e.friendly || e.t.passive) return;
      if (reach && !e.rchk && !r.hacking) { e.rchk = 1; if (!reach(e.x, e.z)) { const k = 'UNREACH ' + e.type + '@' + e.x.toFixed(1) + ',' + e.z.toFixed(1); if (!B.wallSeen[k]) { B.wallSeen[k] = 1; B.walls += 1; note(k + ' player=' + r.p.x.toFixed(1) + ',' + r.p.z.toFixed(1)); } } }
      const b = r.bounds, out = b && (Math.abs(e.x - b.cx) > b.w / 2 - 0.2 || Math.abs(e.z - b.cz) > b.d / 2 - 0.2);
      if (r.blockedE(e.x, e.z) || out) {
        const k = e.type + '@' + e.x.toFixed(1) + ',' + e.z.toFixed(1);
        if (!B.wallSeen[k]) { B.wallSeen[k] = 1; B.walls += 1; note('ENEMY IN WALL ' + k + (out ? ' (out of bounds)' : '') + ' age=' + (e.spawnT).toFixed(2)); }
      }
    });
  };
  // достижимость: BFS по сетке 0.5 м (проходимость как у врагов) от игрока; враги вне связной области = «в кармане за стеной»
  B.reach = (r) => {
    const b = r.bounds; if (!b) return null;
    const st = 0.5, nx = Math.ceil(b.w / st), nz = Math.ceil(b.d / st), x0 = b.cx - b.w / 2, z0 = b.cz - b.d / 2;
    const cx = (x) => Math.floor((x - x0) / st), cz = (z) => Math.floor((z - z0) / st);
    const free = (i, j) => { const x = x0 + (i + 0.5) * st, z = z0 + (j + 0.5) * st; return i >= 0 && j >= 0 && i < nx && j < nz && Math.abs(x - b.cx) < b.w / 2 - 0.45 && Math.abs(z - b.cz) < b.d / 2 - 0.45 && !r.blockedE(x, z); };
    const seen = new Uint8Array(nx * nz), q = [];
    let si = cx(r.p.x), sj = cz(r.p.z);
    if (!free(si, sj)) { let f = false; for (let d = 1; d < 6 && !f; d += 1) for (let a = -d; a <= d && !f; a += 1) for (let c = -d; c <= d && !f; c += 1) if (free(si + a, sj + c)) { si += a; sj += c; f = true; } }
    q.push([si, sj]); seen[si + sj * nx] = 1;
    while (q.length) { const [i, j] = q.pop(); for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + a, nj = j + c; if (ni < 0 || nj < 0 || ni >= nx || nj >= nz || seen[ni + nj * nx] || !free(ni, nj)) continue; seen[ni + nj * nx] = 1; q.push([ni, nj]); } }
    return (x, z) => { const i = cx(x), j = cz(z); for (let a = -1; a <= 1; a += 1) for (let c = -1; c <= 1; c += 1) { const ii = i + a, jj = j + c; if (ii >= 0 && jj >= 0 && ii < nx && jj < nz && seen[ii + jj * nx]) return true; } return false; };
  };
  // аудит размещения: подборы и интерактивы должны быть достижимы игроком (не внутри ящика/стены/колонны)
  B.minFree = (r, x, z, maxR) => {
    if (!r.blocked(x, z)) return 0;
    for (let d = 0.1; d <= maxR; d += 0.1) { const n = Math.max(8, Math.round(d * 40)); for (let i = 0; i < n; i += 1) { const a = i / n * Math.PI * 2; if (!r.blocked(x + Math.cos(a) * d, z + Math.sin(a) * d)) return d; } }
    return maxR + 0.1;
  };
  B.audit = (r) => {
    if (!r.__efw) { // спавны, которые enemyFree сильно сдвинул (данные миссии поставили врага в стену/за границу)
      r.__efw = 1; const orig = r.enemyFree;
      r.enemyFree = function (x, z) { const f = orig.call(this, x, z); if (f.moved > 1.2) note('SPAWN MOVED ' + x.toFixed(1) + ',' + z.toFixed(1) + ' -> ' + f.x.toFixed(1) + ',' + f.z.toFixed(1) + ' (' + f.moved.toFixed(1) + ' m)'); return f; };
    }
    (r.cb ? r.cb.pickups : []).forEach((k) => { if (k.aud) return; k.aud = 1; const d = B.minFree(r, k.x, k.z, 2); if (d > 0.55) note('PICKUP ' + k.kind + ' ' + (k.o && k.o.id || '') + '@' + k.x.toFixed(1) + ',' + k.z.toFixed(1) + ' nearest free ' + d.toFixed(1) + ' m' + (d >= 1 ? ' UNREACHABLE' : ' TIGHT')); });
    (r.interactables || []).forEach((it) => { if (it.aud) return; it.aud = 1; const d = B.minFree(r, it.pos.x, it.pos.z, 4); if (d > Math.max(0.8, it.reach * 0.7)) note('INTERACT ' + it.label + '@' + it.pos.x.toFixed(1) + ',' + it.pos.z.toFixed(1) + ' nearest free ' + d.toFixed(1) + ' reach ' + it.reach + (d >= it.reach - 0.3 ? ' UNREACHABLE' : ' TIGHT')); });
  };
  // реальное время: бот работает хуком внутри настоящего цикла игры (rAF), всё видно в окне
  B.live = (r, dt) => { B.ticks += 1; B.bot(r, dt); };
  B.bot = (r, dt) => {
    dt = dt || 1 / 30;
    const M = r.mm, sec = M && M.cur, p = r.p, K = r.keys;
    B.wallCheck(r);
    B.audit(r);
    if (B.opt.god !== false) r.god = true;
    if (B.opt.noGhost && M) M.def.ghost = false;
    if (r.locked || r.cineDepth > 0) { K.KeyW = false; r.fireHeld = false; return; }
    const prevIdle = B.idleT || 0; B.idleT = 0; // любой ранний return = цель найдена, простой сбрасывается
    // стук в одно место: считаем «застревание»
    B.stk = (B.stk || 0) + dt;
    if (B.stk >= 1.5) {
      const L = B.last; B.last = [p.x, p.z];
      if (L && Math.hypot(L[0] - p.x, L[1] - p.z) < 0.35 && K.KeyW) { B.stuck += 1; B.side = -B.side; note('STUCK at ' + p.x.toFixed(1) + ',' + p.z.toFixed(1) + ' sec ' + (sec ? sec.k + ':' + sec.b : '-')); }
      B.stk = 0;
    }
    // оружие: подобранное — берём в руки
    const INV = r.inv || [];
    const ak = INV.find((w) => w.id === 'ak'); if (ak && r.wp !== ak && !B.akEq) { B.akEq = true; r.equip(ak); }
    if (r.wp && r.wp.mag === 0 && r.wp.reserve > 0 && !r.rl) r.startReload();
    if (r.wp && r.wp.mag === 0 && r.wp.reserve === 0 && !r.rl) { const alt = INV.find((w) => w.mag + w.reserve > 0); if (alt && alt !== r.wp) r.equip(alt); }
    if (INV.length && INV.every((w) => w.mag + w.reserve <= 0)) { // всё пусто: бежим за патронами, а не стоим
      const a = (r.cb ? r.cb.pickups : []).filter((k) => k.kind === 'ammo').map((k) => ({ k, d: Math.hypot(k.x - p.x, k.z - p.z) })).sort((x, y) => x.d - y.d)[0];
      if (a) { r.fireHeld = false; B.go(r, a.k.x, a.k.z, 0.3); return; }
    }
    const en = r.cb ? r.cb.enemies.filter((e) => !e.dead && !e.friendly && (!e.t.passive || e.type === 'target') && !(e.occ && (e.occ.st === 'idle' || e.occ.st === 'alert' || e.occ.st === 'bound'))) : []; // жильцы комнат (interiors.js) за закрытой дверью — не цель
    let tgt = null, td = 1e9;
    en.forEach((e) => { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < td) { td = d; tgt = e; } });
    r.fireHeld = false;
    if (tgt) {
      const vis = r.hasLOS(p.x, 1.6, p.z, tgt.x, 1.5, tgt.z);
      if (vis && td < 40 && !(sec && sec.b === 'run' && td > 5)) { // в забеге бегут, а не стоят и стреляют
        B.aimAt(r, tgt.x, tgt.hy * 0.92, tgt.z); K.KeyW = false;
        B.fireT -= dt;
        if (r.wp && r.wp.def.auto) { r.fireHeld = true; } else if (B.fireT <= 0) { r.pressFire(); B.fireT = 0.2; }
        return;
      }
      if (!B.stay && !(sec && sec.b === 'run')) { B.go(r, tgt.x, tgt.z, 0.9); if (td < 4 && !vis) { B.hunt = (B.hunt || 0) + dt; if (B.hunt > 4) { B.hunt = 0; B.side = -B.side; note('HUNT no-LOS enemy ' + tgt.type + '@' + tgt.x.toFixed(1) + ',' + tgt.z.toFixed(1) + ' player ' + p.x.toFixed(1) + ',' + p.z.toFixed(1)); } } return; }
    }
    if (B.stay && B.stay.until > r.time && r.interactables.includes(B.stay.it) && !B.stay.it.used) { // держимся у объекта, пока идёт удержание
      B.go(r, B.stay.x, B.stay.z, Math.max(1.0, B.stay.it.reach - 0.9)); return;
    }
    B.stay = null;
    // миссии-«взгляд» (1, 2): держим прицел на текущей цели gaze
    if (r.gazers && r.gazers.length) {
      const ge = r.gazers[0].list.find((x) => !x.done);
      if (ge) { const gp = typeof ge.t.pos === 'function' ? ge.t.pos() : ge.t.pos; K.KeyW = false; B.aimAt(r, gp.x, gp.y, gp.z); return; }
    }
    // интерактивы
    const it = r.interactables.find((i) => !i.used && i.label !== 'TAKEDOWN' && (!i.enabled || i.enabled()));
    if (it) {
      const ix = it.pos.x, iz = it.pos.z, d = Math.hypot(ix - p.x, iz - p.z);
      if (d > it.reach - 0.5) { B.go(r, ix, iz, Math.max(1.0, it.reach - 0.8)); return; } // как игрок: подходим на расстояние использования, не лезем внутрь укрытия
      K.KeyW = false; B.aimAt(r, ix, it.pos.y, iz);
      B.act = (B.act || 0) + dt;
      if (r.target === it) { r.useTarget(); B.stay = { x: ix, z: iz, until: r.time + 45, it }; B.act = 0; }
      else if (B.act > 1) { note('CANNOT TARGET ' + it.label + ' d=' + d.toFixed(2)); B.act = 0; B.go(r, ix, iz, 0.8); }
      return;
    }
    // подборы
    const hpLow = r.hp < r.maxHp * 0.7;
    const lowAmmo = (k) => { const w = INV.find((x) => x.id === k.o.id); return !!w && w.reserve < w.def.maxReserve * 0.4; };
    const pk = (r.cb ? r.cb.pickups : []).filter((k) => !k.skip && (k.kind === 'weapon' || (k.kind === 'health' && hpLow) || k.kind === 'gadget' || (k.kind === 'ammo' && lowAmmo(k))))
      .map((k) => ({ k, d: Math.hypot(k.x - p.x, k.z - p.z) })).sort((a, b) => a.d - b.d)[0];
    if (pk && pk.d < 16 && pk.d > 0.9) {
      if (!B.pkT || B.pkT.k !== pk.k) B.pkT = { k: pk.k, t: 0 };
      B.pkT.t += dt;
      if (B.pkT.t > 14) { pk.k.skip = 1; note('PICKUP UNREACHABLE (gave up) ' + pk.k.kind + ' ' + (pk.k.o && pk.k.o.id || '') + '@' + pk.k.x.toFixed(1) + ',' + pk.k.z.toFixed(1) + ' player ' + p.x.toFixed(1) + ',' + p.z.toFixed(1)); }
      else { B.go(r, pk.k.x, pk.k.z, 0.5); return; }
    }
    // подрыв стены: C4 (поставить у стены → отойти → взорвать) или стрельба по бочкам
    if (sec && sec.b === 'blast' && sec.brk && !sec.brk.broken) {
      const g = r.gad, b = sec.brk;
      if (g && g.charges.length) { if (p.z < b.z + 7) { B.go(r, 0, b.z + 8.5, 0.5); return; } K.KeyW = false; r.detonate(); return; }
      if (g && g.n.c4 > 0) {
        if (g.sel !== 'c4') { r.cycleGadget(1); return; }
        if (Math.hypot(p.x, p.z - (b.z + 2.4)) > 0.8) { B.go(r, 0, b.z + 2.4, 0.5); return; }
        K.KeyW = false; B.aimAt(r, 0, 1.2, b.z); r.useGadget(); return;
      }
      const br = r.cb.shoot.find((s) => s.barrel && s.alive);
      if (br) {
        if (Math.hypot(p.x, p.z - (b.z + 9)) > 1 && !r.hasLOS(p.x, 1.6, p.z, br.x, 0.6, br.z)) { B.go(r, 0, b.z + 9, 0.8); return; }
        K.KeyW = false; B.aimAt(r, br.x, 0.6, br.z); B.fireT -= dt; if (B.fireT <= 0) { r.pressFire(); B.fireT = 0.25; } return;
      }
    }
    // маяк
    if (r.wpt) { const t = r.wpt.target; B.go(r, t[0], t[2], 0.6); return; }
    // бегство от пресса и т.п.
    if (sec && sec.b === 'run') { B.go(r, 0, sec.zB - 2, 0.5); return; }
    // нет цели: через 4 с без дела идём вдоль -Z (так бы поступил игрок; фиксируем в заметках — возможно, непонятная подсказка)
    B.idleT = prevIdle + dt;
    if (B.idleT > 4) { if (B.idleT - dt <= 4) note('IDLE-ADVANCE at ' + p.x.toFixed(1) + ',' + p.z.toFixed(1) + ' obj=' + (r.objText || '')); B.go(r, 0, p.z - 6, 0.5); return; }
    K.KeyW = false;
  };

  B.run = async (maxTicks, ms) => {
    const r = __r, t0 = performance.now(); let lastK = B.lastK === undefined ? -1 : B.lastK;
    for (let i = 0; i < maxTicks; i += 1) {
      if (r.disposed || B.done || B.exited) break;
      if (performance.now() - t0 > (ms || 20000)) break;
      try { B.bot(r); } catch (e) { __errs.push('bot ' + e.message); }
      r.time += 1 / 30;
      try { r.update(1 / 30); } catch (e) { if (!r.disposed) { __errs.push('upd ' + e.message); } }
      B.ticks += 1;
      const M = r.mm; if (M && M.cur && M.cur.k !== lastK) {
        lastK = M.cur.k; B.lastK = lastK;
        const inside = r.p.z <= M.cur.zA + 0.6;
        B.log.push(`${(B.ticks / 30).toFixed(0)}s sector ${lastK} ${M.cur.b} p=(${r.p.x.toFixed(1)},${r.p.z.toFixed(1)}) zA=${M.cur.zA} ${inside ? 'in' : 'SEALED-OUT'}`);
        if (!inside) B.sealed += 1;
      }
      if (i % 3 === 0) await yieldNow(); else await Promise.resolve();
    }
    const M = r.mm;
    return { done: B.done, disposed: r.disposed, sim: (B.ticks / 30).toFixed(0), sec: M && M.cur ? M.cur.k + ':' + M.cur.b : null, p: [r.p.x.toFixed(1), r.p.z.toFixed(1)], hp: Math.round(r.hp), enemies: r.cb ? r.cb.enemies.filter((e) => !e.dead).length : 0, sealed: B.sealed, stuck: B.stuck, walls: B.walls, log: B.log.slice(-8), notes: B.notes.filter((n) => !/PICKUP|INTERACT|SPAWN MOVED/.test(n)).slice(-6), aud: B.notes.filter((n) => /PICKUP|INTERACT|SPAWN MOVED/.test(n)).slice(0, 12), errs: __errs.slice(0, 6) };
  };
  B.batch = async (ids, opt, budget) => {
    const out = [];
    for (const id of ids) {
      const s = await B.boot(id, opt);
      if (s === 'start refused') { out.push(id + ' REFUSED'); break; }
      let r;
      for (let k = 0; k < 14; k += 1) { r = await B.run(1500, budget || 8000); if (r.done || r.disposed) break; if (Number(r.sim) > (opt && opt.maxSim || 900)) break; }
      out.push(id + ' ' + JSON.stringify({ d: r.done, sim: r.sim, sec: r.sec, sealed: r.sealed, stuck: r.stuck, walls: B.walls, log: r.log.join(' | '), notes: r.notes, aud: r.aud, errs: r.errs })); B.outs = out;
      if (!r.done) break;
      await new Promise((res) => setTimeout(res, 300));
    }
    return out.join('\n');
  };
  return 'bot2 ready';
})();
