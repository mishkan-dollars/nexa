// NEXA: миссия 48 — ИИ союзников (Диктор, девушка, тела-дублёры игрока в катсценах).
// Не «по рельсам», а по уму: поиск пути A* по настоящим коллайдерам мира (стены, мебель, двери), движение со скольжением вдоль стен
// (в стену попасть физически нельзя), обход друг друга/игрока/NPC, ожидание у закрытых дверей, свободное следование за игроком
// строем сзади-сбоку, не перекрывают линию прицела, поворот к ближайшей угрозе, ждут отставшего игрока, телепорт только вне кадра.
// r.walk(n, …) для таких актёров автоматически идёт через этот модуль (скрипты катсцен не меняются).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.Run) return;
  const F = C.f48, K = F.K = F.K || {}, P = C.Run.prototype, PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = (a) => { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; };

  const BODY = 0.34;        // физический радиус тела (квадрат, как у игрока): к стене ближе не подойти
  const PLAN = 0.38;        // запас при планировании: путь идёт чуть дальше от углов
  const CELL = 0.4;         // шаг сетки A*
  const BK = 2;             // размер корзины коллайдеров, м

  // ------------------------------------------------------------------ навигационная сетка региона
  const NAVS = new WeakMap();
  const navOf = (r) => {
    const cols = r.colliders;
    let nv = NAVS.get(cols);
    if (nv && nv.n === cols.length) return nv;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const c of cols) {
      if (c.x1 - c.x0 > 180 || c.z1 - c.z0 > 180) continue;
      if (c.x0 < x0) x0 = c.x0; if (c.x1 > x1) x1 = c.x1; if (c.z0 < z0) z0 = c.z0; if (c.z1 > z1) z1 = c.z1;
    }
    const b = r.bounds;
    if (b) { x0 = Math.min(x0, b.cx - b.w / 2); x1 = Math.max(x1, b.cx + b.w / 2); z0 = Math.min(z0, b.cz - b.d / 2); z1 = Math.max(z1, b.cz + b.d / 2); }
    if (!(x0 < x1) || !(z0 < z1)) { x0 = -20; x1 = 20; z0 = -20; z1 = 20; }
    x0 -= 3; x1 += 3; z0 -= 3; z1 += 3;
    let cs = CELL; const ext = Math.max(x1 - x0, z1 - z0); if (ext / cs > 420) cs = ext / 420;
    const nx = Math.ceil((x1 - x0) / cs), nz = Math.ceil((z1 - z0) / cs), N = nx * nz;
    nv = { cols, n: cols.length, ox: x0, oz: z0, cs, nx, nz, bx: Math.ceil((x1 - x0) / BK), bz: Math.ceil((z1 - z0) / BK), bk: new Map(),
      G: new Float32Array(N), Pn: new Int32Array(N), seen: new Uint32Array(N), closed: new Uint32Array(N), ms: new Uint32Array(N), mv: new Uint8Array(N), stamp: 0 };
    for (const c of cols) {
      const a = clamp(Math.floor((c.x0 - 0.8 - x0) / BK), 0, nv.bx - 1), b2 = clamp(Math.floor((c.x1 + 0.8 - x0) / BK), 0, nv.bx - 1);
      const e = clamp(Math.floor((c.z0 - 0.8 - z0) / BK), 0, nv.bz - 1), f = clamp(Math.floor((c.z1 + 0.8 - z0) / BK), 0, nv.bz - 1);
      for (let i = a; i <= b2; i += 1) for (let j = e; j <= f; j += 1) { const k = i * 4096 + j; let L = nv.bk.get(k); if (!L) nv.bk.set(k, L = []); L.push(c); }
    }
    NAVS.set(cols, nv);
    return nv;
  };
  // точка (x,z) с телом радиуса rad внутри твёрдого коллайдера (выключенные — открытые двери — не считаются)
  const solid = (nv, x, z, rad) => {
    const ix = Math.floor((x - nv.ox) / BK), iz = Math.floor((z - nv.oz) / BK);
    if (ix < 0 || iz < 0 || ix >= nv.bx || iz >= nv.bz) return false;
    const L = nv.bk.get(ix * 4096 + iz);
    if (!L) return false;
    for (let i = 0; i < L.length; i += 1) {
      const c = L[i];
      if (!c.off && x > c.x0 - rad && x < c.x1 + rad && z > c.z0 - rad && z < c.z1 + rad) return true;
    }
    return false;
  };
  const lineFree = (nv, ax, az, bx, bz, rad) => {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.18);
    for (let k = 1; k <= n; k += 1) { const t = k / n; if (solid(nv, ax + (bx - ax) * t, az + (bz - az) * t, rad)) return false; }
    return true;
  };
  // ближайшая свободная точка (кольцами) для тела радиуса rad
  const freeNear = (nv, x, z, rad, maxR) => {
    if (!solid(nv, x, z, rad)) return [x, z];
    for (let R = 0.3; R <= maxR; R += 0.3) {
      const n = Math.max(8, Math.round(R * 14));
      for (let k = 0; k < n; k += 1) {
        const a = k / n * TAU, px = x + Math.cos(a) * R, pz = z + Math.sin(a) * R;
        if (!solid(nv, px, pz, rad)) return [px, pz];
      }
    }
    return null;
  };

  // ------------------------------------------------------------------ A*
  const findPath = (r, sx, sz, gx, gz) => {
    const nv = navOf(r), cs = nv.cs, W = nv.nx, H = nv.nz, stamp = ++nv.stamp;
    const fr = (i, j) => {
      if (i < 0 || j < 0 || i >= W || j >= H) return false;
      const k = j * W + i;
      if (nv.ms[k] !== stamp) { nv.ms[k] = stamp; nv.mv[k] = solid(nv, nv.ox + (i + 0.5) * cs, nv.oz + (j + 0.5) * cs, PLAN) ? 2 : 1; }
      return nv.mv[k] === 1;
    };
    const ci = (x) => clamp(Math.floor((x - nv.ox) / cs), 0, W - 1), cj = (z) => clamp(Math.floor((z - nv.oz) / cs), 0, H - 1);
    const ring = (x, z, maxC) => {
      const i0 = ci(x), j0 = cj(z);
      if (fr(i0, j0)) return [i0, j0];
      for (let R = 1; R <= maxC; R += 1) {
        let best = null, bd = 1e9;
        for (let di = -R; di <= R; di += 1) for (let dj = -R; dj <= R; dj += 1) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== R || !fr(i0 + di, j0 + dj)) continue;
          const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i0 + di, j0 + dj]; }
        }
        if (best) return best;
      }
      return null;
    };
    const s = ring(sx, sz, 14);
    if (!s) return null;
    const gc = ring(gx, gz, 12), gI = gc ? gc[0] : ci(gx), gJ = gc ? gc[1] : cj(gz);
    const si = s[0] + s[1] * W, gi = gc ? gc[0] + gc[1] * W : -1;
    const hz = (i, j) => { const dx = Math.abs(i - gI), dz = Math.abs(j - gJ); return dx + dz - 0.5858 * Math.min(dx, dz); };
    // бинарная куча (f, индекс)
    const hf = [], hk = [];
    const push = (f, k) => {
      let i = hf.length; hf.push(f); hk.push(k);
      while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hk[i] = hk[p]; i = p; }
      hf[i] = f; hk[i] = k;
    };
    const pop = () => {
      const top = hk[0], lf = hf.pop(), lk = hk.pop(), n = hf.length;
      if (n) {
        let i = 0;
        for (;;) {
          let c = i * 2 + 1; if (c >= n) break;
          if (c + 1 < n && hf[c + 1] < hf[c]) c += 1;
          if (hf[c] >= lf) break;
          hf[i] = hf[c]; hk[i] = hk[c]; i = c;
        }
        hf[i] = lf; hk[i] = lk;
      }
      return top;
    };
    nv.G[si] = 0; nv.Pn[si] = -1; nv.seen[si] = stamp; push(hz(s[0], s[1]), si);
    let best = si, bestH = hz(s[0], s[1]), found = false, iter = 0;
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
    while (hf.length && iter < 30000) {
      const k = pop();
      if (nv.closed[k] === stamp) continue;
      nv.closed[k] = stamp; iter += 1;
      const i = k % W, j = (k / W) | 0, h = hz(i, j);
      if (h < bestH) { bestH = h; best = k; }
      if (k === gi) { best = k; found = true; break; }
      for (let q = 0; q < 8; q += 1) {
        const ni = i + DX[q], nj = j + DZ[q];
        if (!fr(ni, nj)) continue;
        const diag = q >= 4;
        if (diag && (!fr(i + DX[q], j) || !fr(i, j + DZ[q]))) continue;
        const nk = ni + nj * W;
        if (nv.closed[nk] === stamp) continue;
        const ng = nv.G[k] + (diag ? 1.4142 : 1);
        if (nv.seen[nk] !== stamp || ng < nv.G[nk]) { nv.seen[nk] = stamp; nv.G[nk] = ng; nv.Pn[nk] = k; push(ng + hz(ni, nj), nk); }
      }
    }
    const pts = [];
    for (let k = best; k >= 0; k = nv.Pn[k]) pts.push([nv.ox + ((k % W) + 0.5) * cs, nv.oz + (((k / W) | 0) + 0.5) * cs]);
    pts.reverse();
    // точная цель, если до неё можно дойти физически
    if (found && !solid(nv, gx, gz, BODY) && pts.length) {
      const pl = pts[pts.length - 1];
      if (lineFree(nv, pl[0], pl[1], gx, gz, BODY + 0.02)) pts.push([gx, gz]);
    }
    // спрямление пути (string pulling)
    const out = []; let cur = [sx, sz], i = 0;
    while (i < pts.length) {
      let j = Math.min(pts.length - 1, i + 60);
      while (j > i && !lineFree(nv, cur[0], cur[1], pts[j][0], pts[j][1], BODY + 0.03)) j -= 1;
      out.push(pts[j]); cur = pts[j]; i = j + 1;
    }
    return { pts: out, partial: !found, iter };
  };

  // ------------------------------------------------------------------ состояние союзников
  const camSees = (r, x, z) => {
    const p = r.p, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1;
    return (dx * -Math.sin(p.yaw) + dz * -Math.cos(p.yaw)) / d > 0.2 && d < 45;
  };
  const threatOf = (r, g, maxD) => {
    const L = r.cb && r.cb.enemies; if (!L) return null;
    let best = null, bd = maxD * maxD;
    for (let i = 0; i < L.length; i += 1) {
      const e = L[i];
      if (e.dead || e.friendly || (e.t && e.t.passive) || !e.n || !e.n.g.visible) continue;
      const d = (e.x - g.x) * (e.x - g.x) + (e.z - g.z) * (e.z - g.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best ? { e: best, d: Math.sqrt(bd) } : null;
  };
  const sepOf = (r, n, g, list) => {
    let sx = 0, sz = 0;
    const push = (ox, oz, R, k) => {
      const dx = g.x - ox, dz = g.z - oz, d2 = dx * dx + dz * dz;
      if (d2 >= R * R) return;
      if (d2 < 1e-6) { sx += (Math.random() - 0.5) * k; sz += (Math.random() - 0.5) * k; return; }
      const d = Math.sqrt(d2), f = (R - d) / R * k; sx += dx / d * f; sz += dz / d * f;
    };
    if (r.cineDepth <= 0 && !r.locked) push(r.p.x, r.p.z, 1.05, 1.5);
    for (let i = 0; i < list.length; i += 1) { const a = list[i]; if (a !== n && a.g.visible) push(a.g.position.x, a.g.position.z, 0.95, 1.1); }
    for (let i = 0; i < r.npcs.length; i += 1) {
      const o = r.npcs[i];
      if (o === n || o.ai || !o.g.visible || o.free) continue;
      push(o.g.position.x, o.g.position.z, 0.62, 0.9);
    }
    return [sx, sz];
  };

  const init = (r, n, o) => {
    const st = K.st(r);
    if (!n.ai) {
      n.nav = true;
      n.ai = { base: 'idle', go: null, path: null, pi: 0, pg: null, rp: 0, lf: 0, stuck: 0, lost: 0, t: 0, moved: 0, side: 1, back: 2.3, spread: 1.25, far: 4.8, ph: Math.random() * 6, fg: null, post: null, wait: 0 };
    }
    Object.assign(n.ai, o || {});
    const L = st.allies || (st.allies = []);
    if (L.indexOf(n) < 0) L.push(n);
    if (!st.allyHook) { st.allyHook = true; K.hook(r, (dt) => tickAll(r, dt)); }
    return n.ai;
  };

  const finish = (ai) => { const res = ai.go && ai.go.res; ai.go = null; ai.path = null; ai.pg = null; ai.wait = 0; if (res) res(); };

  // цель следования: «строем» сзади-сбоку от игрока (сзади — относительно угрозы, если враги рядом); null — стоять
  const followGoal = (r, n, ai, S, g, th) => {
    const P_ = r.p, nv = navOf(r);
    const dP = Math.hypot(g.x - P_.x, g.z - P_.z);
    let bx = -S.hx, bz = -S.hz;
    if (th && th.d < 24) { const dx = P_.x - th.e.x, dz = P_.z - th.e.z, l = Math.hypot(dx, dz) || 1; bx = dx / l; bz = dz / l; }
    const rx = bz, rz = -bx;                                       // «справа» относительно направления вперёд (-b)
    let ix = P_.x + bx * ai.back + rx * ai.side * ai.spread, iz = P_.z + bz * ai.back + rz * ai.side * ai.spread;
    const fx = -Math.sin(P_.yaw), fz = -Math.cos(P_.yaw), vx = g.x - P_.x, vz = g.z - P_.z;
    const along = vx * fx + vz * fz, lat = vx * -fz + vz * fx;
    const inLine = along > 0.2 && along < 4.6 && Math.abs(lat) < 1.05;   // стоит на линии прицела
    const want = dP > ai.far || dP < 0.95 || inLine;
    if (want && (!ai.fg || ai.fgT <= 0 || Math.hypot(ai.fg[0] - ix, ai.fg[1] - iz) > 3.2)) {
      const q = freeNear(nv, ix, iz, BODY + 0.04, 3.2);
      if (q) { ai.fg = q; ai.fgT = 3.5; }
    }
    if (ai.fg && Math.hypot(ai.fg[0] - g.x, ai.fg[1] - g.z) < 0.45) ai.fg = null;
    if (!ai.fg) return null;
    const sp = clamp(Math.max(S.pv * 1.12, 1.5) + Math.max(0, dP - 3) * 0.75, 1.3, 5.4);
    return { x: ai.fg[0], z: ai.fg[1], speed: dP < 2.2 ? Math.min(sp, 1.3) : sp, tol: 0.4 };
  };

  const tickOne = (r, n, dt, S, list) => {
    const ai = n.ai, g = n.g.position;
    if (!n.g.visible) { n.creeping = false; return; }
    const nv = navOf(r);
    ai.t += dt; ai.fgT = (ai.fgT || 0) - dt; ai.rp -= dt; ai.lf -= dt;
    // телепорт катсцены/закрывшаяся дверь: выталкиваем из стены
    if (solid(nv, g.x, g.z, BODY * 0.8)) { const q = freeNear(nv, g.x, g.z, BODY, 4); if (q) { g.x = q[0]; g.z = q[1]; } }
    const gameplay = r.cineDepth <= 0 && !r.locked;
    const th = gameplay || ai.base === 'hold' ? threatOf(r, g, 22) : null;
    let goal = null, lookYaw = null;
    if (ai.go) {
      goal = ai.go;
      if (ai.t > goal.t0 + goal.tmo) { finish(ai); goal = null; }
    }
    if (!goal && ai.base === 'follow' && gameplay) {
      goal = followGoal(r, n, ai, S, g, th);
      lookYaw = th && th.d < 20 ? Math.atan2(th.e.x - g.x, th.e.z - g.z) : r.p.yaw + PI + Math.sin(ai.t * 0.45 + ai.ph) * 0.45;
    } else if (!goal && ai.base === 'hold' && ai.post) {
      const po = ai.post;
      if (Math.hypot(po.x - g.x, po.z - g.z) > 0.7) goal = { x: po.x, z: po.z, speed: 2.0, tol: 0.25 };
      lookYaw = th && th.d < 24 ? Math.atan2(th.e.x - g.x, th.e.z - g.z) : (po.yaw !== undefined ? po.yaw : n.yaw);
    }
    let mx = 0, mz = 0, moving = false, spd = 0;
    if (goal) {
      const tx = goal.x, tz = goal.z;
      let sp = goal.speed;
      // ведущий ждёт игрока, если тот сильно отстал (только в игровой фазе)
      if (goal.lead && gameplay) {
        const qx = r.p.x - g.x, qz = r.p.z - g.z, dp = Math.hypot(qx, qz), gx = tx - g.x, gz = tz - g.z, gl = Math.hypot(gx, gz) || 1;
        if ((qx * gx + qz * gz) / gl < 1.0) sp *= clamp((goal.lead + 3.5 - dp) / 3.5, 0, 1);   // игрок уже впереди по ходу — не ждём его (иначе ведущий замирал, пока игрок не вернётся)
      }
      // путь: (пере)планируем при смене цели, по таймеру и при застревании
      if (!ai.path || !ai.pg || Math.hypot(ai.pg[0] - tx, ai.pg[1] - tz) > 0.5 || ai.rp <= 0) {
        const res = findPath(r, g.x, g.z, tx, tz);
        ai.path = res ? res.pts : [[tx, tz]]; ai.partial = !!(res && res.partial); ai.pi = 0; ai.pg = [tx, tz]; ai.rp = ai.partial ? 0.8 : 1.6;
      } else if (ai.lf <= 0 && ai.path.length > 1) {
        ai.lf = 0.3;
        if (lineFree(nv, g.x, g.z, tx, tz, BODY + 0.03) && !ai.partial) { ai.path = [[tx, tz]]; ai.pi = 0; }
      }
      let w = ai.path[ai.pi];
      while (w && ai.pi < ai.path.length - 1 && Math.hypot(w[0] - g.x, w[1] - g.z) < 0.3) { ai.pi += 1; w = ai.path[ai.pi]; }
      if (!w) w = [tx, tz];
      const last = ai.pi >= ai.path.length - 1, dist = Math.hypot(w[0] - g.x, w[1] - g.z);
      if (last && dist < (ai.partial ? 0.42 : goal.tol)) {
        // пришли (или упёрлись в ближайшую достижимую точку)
        if (goal === ai.go) {
          if (!ai.partial) finish(ai);
          else { ai.wait += dt; if (ai.wait > 2.4) finish(ai); }
        } else ai.fg = ai.partial ? ai.fg : null;
        if (!ai.partial) ai.stuck = 0;
      } else {
        const dx = (w[0] - g.x) / (dist || 1), dz = (w[1] - g.z) / (dist || 1);
        const want = Math.atan2(dx, dz);
        const turned = Math.abs(wrap(want - n.g.rotation.y));
        n.yaw = want;
        const step = Math.min(sp, dist / Math.max(dt, 1e-3));
        let vx = dx * step, vz = dz * step;
        const sep = sepOf(r, n, g, list);
        vx += sep[0] * Math.max(sp, 1.2) * 0.9; vz += sep[1] * Math.max(sp, 1.2) * 0.9;
        const vl = Math.hypot(vx, vz), cap = Math.max(sp, 0.8) * 1.15;
        if (vl > cap) { vx = vx / vl * cap; vz = vz / vl * cap; }
        if (turned < 1.1 || dist < 0.3) { mx = vx * dt; mz = vz * dt; }
        spd = sp;
      }
    }
    // перемещение со скольжением вдоль стен
    if (mx || mz) {
      const ox = g.x, oz = g.z;
      if (!solid(nv, g.x + mx, g.z, BODY)) g.x += mx;
      if (!solid(nv, g.x, g.z + mz, BODY)) g.z += mz;
      const moved = Math.hypot(g.x - ox, g.z - oz);
      moving = moved / dt > 0.25;
      if (moved < Math.hypot(mx, mz) * 0.3) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt * 2);
      if (ai.stuck > 0.6 && ai.rp > 0.1) { ai.rp = 0; if (ai.stuck > 1.4) { ai.pg = null; } }
      if (ai.stuck > 4.5 && goal === ai.go) { finish(ai); ai.stuck = 0; }
    } else if (goal !== ai.go || !goal) ai.stuck = Math.max(0, ai.stuck - dt);
    // анимация шага по скорости
    n.creeping = moving;
    if (moving) n.phase += dt * 6.5 * n.swing * (clamp(spd / 1.55, 0.7, 2.6) - 1);
    // взгляд в покое / на ходу
    if (!moving && lookYaw !== null && !ai.go) n.yaw += wrap(lookYaw - n.yaw) * (1 - Math.exp(-dt * 4));
    // потерялся: далеко, застрял, и игрок этого не видит — тихо переносим ближе
    if (ai.base === 'follow' && gameplay) {
      const dP = Math.hypot(g.x - r.p.x, g.z - r.p.z);
      ai.lost = dP > 9 ? ai.lost + dt : 0;
      if ((dP > 22 || (ai.lost > 6 && ai.stuck > 1.5) || ai.lost > 14) && !camSees(r, g.x, g.z)) {
        for (let a = 0; a < 8; a += 1) {
          const ang = Math.atan2(S.hx, S.hz) + PI + (a - 3.5) * 0.45, dd = 3.2 + a * 0.4;
          const q = freeNear(nv, r.p.x + Math.sin(ang) * dd, r.p.z + Math.cos(ang) * dd, BODY + 0.05, 1.2);
          if (q && !camSees(r, q[0], q[1])) { g.x = q[0]; g.z = q[1]; ai.path = null; ai.fg = null; ai.lost = 0; ai.stuck = 0; break; }
        }
      }
    }
  };

  const tickAll = (r, dt) => {
    const st = K.st(r), L = st.allies;
    if (!L || !L.length || !(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    const p = r.p, S = st.ally || (st.ally = { px: p.x, pz: p.z, pv: 0, hx: -Math.sin(p.yaw), hz: -Math.cos(p.yaw) });
    const mvx = p.x - S.px, mvz = p.z - S.pz, inst = Math.hypot(mvx, mvz) / dt;
    S.px = p.x; S.pz = p.z;
    if (inst < 12) {
      S.pv += (inst - S.pv) * (1 - Math.exp(-dt * 4));
      if (inst > 0.5) {
        const k = 1 - Math.exp(-dt * 3);
        S.hx += (mvx / (inst * dt) - S.hx) * k; S.hz += (mvz / (inst * dt) - S.hz) * k;
        const l = Math.hypot(S.hx, S.hz) || 1; S.hx /= l; S.hz /= l;
      }
    }
    for (let i = L.length - 1; i >= 0; i -= 1) {
      const n = L[i];
      if (!n.g.parent) { L.splice(i, 1); continue; }
      try { tickOne(r, n, dt, S, L); } catch (e) { if (!n.ai.err) { n.ai.err = 1; console.error('[f48 ally]', e); } }
    }
  };

  // ------------------------------------------------------------------ API
  K.ally = {
    BODY,
    add: (r, n, o) => init(r, n, o),
    // идти к точке с обходом стен; Promise выполняется по приходу (или если точка недостижима/истёк срок) — сценарий не зависает
    goto(r, n, to, speed, o) {
      const ai = init(r, n);
      const sp = speed || 1.3, g = n.g.position, d = Math.hypot(to[0] - g.x, to[1] - g.z);
      return new Promise((res) => {
        ai.go = Object.assign({ x: to[0], z: to[1], speed: sp, tol: 0.07, res, t0: ai.t, tmo: d / Math.max(0.4, sp) * 3 + 8 }, o || {});
        ai.path = null; ai.pg = null; ai.wait = 0; ai.stuck = 0; n.goal = null;
      });
    },
    // следовать за игроком по собственному разумению (список npc; side -1/+1 — слева/справа)
    follow(r, list, o) {
      (Array.isArray(list) ? list : [list]).forEach((n, i) => init(r, n, Object.assign({ base: 'follow', side: i % 2 ? 1 : -1, back: 2.2 + i * 0.5 }, o || {})));
    },
    // держать пост (охранять место), поворачиваясь к врагам
    hold(r, n, x, z, yaw, o) { init(r, n, Object.assign({ base: 'hold', post: { x, z, yaw } }, o || {})); },
    idle(r, n) { const ai = init(r, n); ai.base = 'idle'; ai.fg = null; ai.post = null; },
    stop(n) { const ai = n.ai; if (ai) { ai.go = null; ai.path = null; ai.pg = null; ai.fg = null; ai.stuck = 0; } n.goal = null; n.creeping = false; },
    plan: (r, ax, az, bx, bz) => findPath(r, ax, az, bx, bz),
    free: (r, x, z, rad) => !solid(navOf(r), x, z, rad === undefined ? BODY : rad),
    nearFree: (r, x, z, rad, maxR) => freeNear(navOf(r), x, z, rad === undefined ? BODY : rad, maxR || 3),
    lineFree: (r, ax, az, bx, bz, rad) => lineFree(navOf(r), ax, az, bx, bz, rad === undefined ? BODY : rad),
    nav: navOf
  };

  // r.walk для актёров финала идёт через ИИ (поиск пути, коллизии); остальные NPC — как раньше
  const owalk = P.walk;
  P.walk = function (n, to, speed) {
    if (n && n.nav && this.colliders) return K.ally.goto(this, n, to, speed);
    return owalk.call(this, n, to, speed);
  };
  // фабрики актёров помечают их как «умных»
  const wrapMk = (name) => {
    const o = F[name];
    if (typeof o !== 'function' || o.__nav) return;
    const w = function () {
      const res = o.apply(this, arguments);
      if (res && typeof res.then === 'function') return res.then((n) => { if (n && n.g) n.nav = true; return n; });
      if (res && res.g) res.nav = true;
      return res;
    };
    w.__nav = true; F[name] = w;
  };
  ['dictor', 'woman', 'playerBody'].forEach(wrapMk);
}());
