// NEXA: миссия 48 — боевые системы финала: тяжёлый костюм, «стресс» экрана, толпа гражданских, охрана зала, огонь союзников.
// Весь текст — английский. Всё живёт в r.f48hall (состояние одного прохода), чистится K.hall.dispose(r) при каждом повторе участка.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.K || !C.f48.K.ally || !C.ETYPES || !C.f48.PH) return;
  const F = C.f48, K = F.K, { lerp, smooth, wrap } = C, PI = Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // ================================================================== тяжёлый костюм
  // armorK — входящий урон ×, moveMul — скорость, baseFov — сильно расширенный обзор; миниган с бесконечной лентой.
  K.suitMode = function (r, on, o) {
    o = o || {};
    if (!on) { r.armorK = 1; r.moveMul = 1; return; }
    r.armorK = o.armorK || 0.1;
    r.moveMul = o.moveMul || 0.62;
    r.giveWeapon('minigun', { equip: true });
  };
  K.suitFov = function (r, fov, dur) { const f0 = r.baseFov; return r.tween(dur || 1.2, (k) => { r.baseFov = lerp(f0, fov, k); }, smooth); };

  // ================================================================== «стресс»: экран медленно плывёт (крен, рыскание, FOV, лёгкое размытие, пульс)
  // Подмена на самом экземпляре r (не на прототипе), поэтому другие миссии не затронуты. K.stress(r, 0..1, секунды нарастания).
  K.stress = function (r, target, ramp) {
    const S = r.f48stress || (r.f48stress = { v: 0, k: 0, rate: 0.25, pulse: 0, on: false });
    S.k = target; S.rate = ramp ? 1 / Math.max(0.1, ramp) : 0.25;
    if (S.on) return S;
    S.on = true;
    const fov0 = r.fovNow, post0 = r.xfPost, uw0 = r.updateWeapon;
    r.fovNow = function () {
      const f = fov0.call(this);
      if (S.v < 0.001) return f;
      const t = this.time;
      return f + S.v * (Math.sin(t * 0.37) * 3.0 + Math.sin(t * 0.93 + 1.3) * 1.4 + S.pulse * 1.8);
    };
    r.updateWeapon = function (dt) {
      uw0.call(this, dt);
      if (!(dt > 0)) return;
      S.v += (S.k - S.v) * (1 - Math.exp(-dt * S.rate));
      S.pulse *= Math.exp(-dt * 4.5);
      if (S.v < 0.001) return;
      const t = this.time, v = S.v;
      // медленное «плавание»: рыскание и тангаж на разных частотах (≈1° — целиться можно), крен чуть больше
      this.kickY += v * (Math.sin(t * 0.43) * 0.018 + Math.sin(t * 1.07 + 0.7) * 0.009);
      this.kickP += v * (Math.sin(t * 0.31 + 2.0) * 0.014 + Math.sin(t * 0.83) * 0.006) - v * S.pulse * 0.006;
      this.kickR += v * (Math.sin(t * 0.27) * 0.034 + Math.sin(t * 0.71 + 1.0) * 0.016);
    };
    r.xfPost = function () {
      if (post0) post0.call(this);
      const U = this.fxU;
      if (!U || S.v < 0.001) return;
      const t = this.time, v = S.v;
      U.uBlur.value.x += Math.sin(t * 0.6) * 0.0022 * v * (1 + S.pulse);
      U.uBlur.value.y += Math.cos(t * 0.47) * 0.0016 * v;
      U.uCon.value = Math.max(U.uCon.value, v * (0.05 + 0.1 * S.pulse));
      U.uVig.value += v * (0.1 + 0.08 * S.pulse);
      if (this.q.fx === 'full') U.uCA.value += v * (0.0008 + 0.002 * S.pulse);
    };
    return S;
  };
  K.stressBeat = function (r) { const S = r.f48stress; if (S) S.pulse = 1; K.amb.pulse(r, 'heart', 0.7); };

  // ================================================================== гражданские: модель, одежда, ИИ
  const VEST = [0x3f6fa8, 0xb5483a, 0x4f8a5b, 0xc8a13a, 0x7a5aa8, 0x2f9aa0, 0xc9c9c9, 0xa05a2c, 0x7d8899, 0xcc6a8a, 0x5a6a3a, 0x8a3a5a];
  C.ETYPES.civ = { hp: 26, speed: 3.6, scale: 1, civ: true };

  function dress(r, n, o) {
    const T = THREE, c = n.civ || (n.civ = { vest0: n.vest.material });
    if (!c.cs) {
      c.cs = new T.Mesh(r.g.box, r.mat(0x4a3220)); c.cs.scale.set(0.07, 0.24, 0.36); c.cs.position.set(0, -0.43, 0.02); n.elbR.add(c.cs);
      c.cap = new T.Mesh(r.g.box, r.mat(0x222831)); c.cap.scale.set(0.26, 0.07, 0.27); c.cap.position.set(0, 0.275, 0); n.head.add(c.cap);
      c.brim = new T.Mesh(r.g.box, r.mat(0x222831)); c.brim.scale.set(0.22, 0.02, 0.1); c.brim.position.set(0, 0.255, 0.15); n.head.add(c.brim);
    }
    n.vest.material = r.basic(o.vest); n.vest.scale.set(0.44, 0.5, 0.34);
    c.cs.visible = !!o.cs; c.cs.material = r.mat(pick([0x4a3220, 0x1c1c20, 0x5a4a38, 0x303a4a]));
    c.cap.visible = c.brim.visible = !!o.cap;
    if (o.cap) { const m = r.mat(pick([0x222831, 0x5a2a2a, 0x3a4a3a, 0x6a6a70])); c.cap.material = c.brim.material = m; }
  }
  function undress(n) {
    const c = n.civ; if (!c) return;
    if (c.cs) c.cs.visible = c.cap.visible = c.brim.visible = false;
    n.vest.material = c.vest0; n.vest.scale.set(0.4, 0.4, 0.3);
  }

  // ---- поле течения (BFS от выходов по сетке r.navGrid) — гражданские бегут по градиенту, а не по прямой
  function nearOk(N, x, z) {
    const i = Math.floor((x - N.x0) / N.st), j = Math.floor((z - N.z0) / N.st);
    for (let d = 0; d <= 5; d += 1) for (let a = -d; a <= d; a += 1) for (let c = -d; c <= d; c += 1) {
      if (Math.max(Math.abs(a), Math.abs(c)) !== d) continue;
      const ii = i + a, jj = j + c;
      if (ii >= 0 && jj >= 0 && ii < N.nx && jj < N.nz && N.ok[ii + jj * N.nx]) return ii + jj * N.nx;
    }
    return -1;
  }
  function buildField(r, pts) {
    const N = r.navGrid(); if (!N) return null;
    const { nx, nz, ok } = N, D = new Int16Array(nx * nz).fill(-1), q = [];
    pts.forEach((p) => { const c = nearOk(N, p[0], p[1]); if (c >= 0 && D[c] < 0) { D[c] = 0; q.push(c); } });
    for (let h = 0; h < q.length; h += 1) {
      const cur = q[h], i = cur % nx, j = (cur - i) / nx;
      for (let a = -1; a <= 1; a += 1) for (let c = -1; c <= 1; c += 1) {
        if (!a && !c) continue;
        const ii = i + a, jj = j + c;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const k = ii + jj * nx;
        if (D[k] >= 0 || !ok[k]) continue;
        if (a && c && (!ok[ii + j * nx] || !ok[i + jj * nx])) continue;
        D[k] = D[cur] + 1; q.push(k);
      }
    }
    return { N, D };
  }
  // следующая точка по градиенту (2 клетки вперёд — путь получается плавным); null — клетка закрыта / цель достигнута
  function flowTarget(Fd, x, z) {
    const N = Fd.N, D = Fd.D, nx = N.nx, nz = N.nz;
    let i = Math.floor((x - N.x0) / N.st), j = Math.floor((z - N.z0) / N.st);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return null;
    let cur = D[i + j * nx];
    if (cur < 0) { const c = nearOk(N, x, z); if (c < 0) return null; i = c % nx; j = (c - i) / nx; cur = D[c]; if (cur < 0) return null; }
    for (let s = 0; s < 2 && cur > 0; s += 1) {
      let bi = -1, bj = -1, bd = cur;
      for (let a = -1; a <= 1; a += 1) for (let c = -1; c <= 1; c += 1) {
        if (!a && !c) continue;
        const ii = i + a, jj = j + c;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const d = D[ii + jj * nx];
        if (d < 0 || d >= bd) continue;
        if (a && c && (D[ii + j * nx] < 0 || D[i + jj * nx] < 0)) continue;
        bd = d; bi = ii; bj = jj;
      }
      if (bi < 0) break;
      i = bi; j = bj; cur = bd;
    }
    return { x: N.x0 + (i + 0.5) * N.st, z: N.z0 + (j + 0.5) * N.st, d: cur };
  }

  function scream(S, e) {
    const r = S.r, now = r.time;
    if (now - S.lastScream < 0.14 || S.screams > 4) return;
    S.lastScream = now; S.screams += 1; setTimeout(() => { S.screams = Math.max(0, S.screams - 1); }, 900);
    const d = e ? Math.hypot(e.x - r.p.x, e.z - r.p.z) : 20;
    K.amb.pulse(r, Math.random() < 0.7 ? 'scream' : 'shout', clamp(1.15 - d / 42, 0.12, 1));
  }
  // паника распространяется волной от места события
  function alarmAt(S, x, z, rad, k) {
    const r = S.r;
    for (let i = 0; i < S.civ.length; i += 1) {
      const e = S.civ[i];
      if (e.dead || e.cs.st !== 'queue' || e.cs.panicAt) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < rad) e.cs.panicAt = r.time + d * (k || 0.035) + rnd(0, 0.6);
    }
  }

  function civAI(S, e, dt) {
    const r = S.r, c = e.cs, n = e.n, g = n.g, t = r.time;
    if (c.st === 'queue') {
      if (c.panicAt && t >= c.panicAt) {
        c.st = 'panic'; c.hide = Math.random() < 0.4; c.fd = c.hide ? S.fHide : S.fExit; c.sp = rnd(3.4, 4.8); c.zz = rnd(0, 6.28); c.dir = null; c.stuck = 0; c.t = 0;
        n.daze = Math.random() < 0.4 ? 1 : 0; n.armT = 0;
        if (Math.random() < 0.55) scream(S, e);
      } else {
        n.yaw = c.yaw; n.armT = 0;
        if (c.talk) { c.talk -= dt; if (c.talk <= 0) { n.gest = n.gest ? 0 : 1; c.talk = rnd(1.5, 4); } }
        return true;
      }
    }
    if (c.st === 'panic') {
      c.t += dt;
      const tg = c.fd ? flowTarget(c.fd, g.position.x, g.position.z) : null;
      if (!tg || tg.d <= 1) {                                         // добежал: выход — исчезает, комната — прячется
        if (c.hide) { c.st = 'cower'; n.cvT = 1; n.daze = 1; n.gest = 0; return true; }
        c.st = 'gone'; g.visible = false; e.dead = true; e.alive = false; e.deadT = 99; e.gone = true; return true;   // npc в пул вернёт updateEnemies (n.free ставить здесь нельзя: запись ещё живёт в cb.enemies)
      }
      let dx = tg.x - g.position.x, dz = tg.z - g.position.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const zz = Math.sin(t * 3.1 + c.zz) * 0.55;                      // зигзаг: метаются из стороны в сторону
      let vx = dx - dz * zz, vz = dz + dx * zz; const vl = Math.hypot(vx, vz) || 1; vx /= vl; vz /= vl;
      if (c.dir) { const k = 1 - Math.exp(-dt * 7); vx = c.dir[0] + (vx - c.dir[0]) * k; vz = c.dir[1] + (vz - c.dir[1]) * k; const l2 = Math.hypot(vx, vz) || 1; vx /= l2; vz /= l2; }
      c.dir = [vx, vz];
      // расталкивание с соседями
      for (let i = 0; i < S.civ.length; i += 1) {
        const o = S.civ[i]; if (o === e || o.dead) continue;
        const ox = g.position.x - o.n.g.position.x, oz = g.position.z - o.n.g.position.z, od = Math.hypot(ox, oz);
        if (od < 0.62 && od > 0.001) { vx += ox / od * (0.62 - od) * 1.8; vz += oz / od * (0.62 - od) * 1.8; }
      }
      const sp = c.sp * clamp(c.t / 0.35, 0.3, 1), nxp = g.position.x + vx * sp * dt, nzp = g.position.z + vz * sp * dt;
      let moved = false;
      if (!r.blockedE(nxp, g.position.z)) { g.position.x = nxp; moved = true; }
      if (!r.blockedE(g.position.x, nzp)) { g.position.z = nzp; moved = true; }
      c.stuck = moved ? Math.max(0, c.stuck - dt) : c.stuck + dt;
      if (c.stuck > 0.5) { c.zz += PI * 0.7; c.stuck = 0; }
      n.yaw = Math.atan2(vx, vz);
      return true;
    }
    if (c.st === 'cower') { n.cvT = 1; n.daze = 1; n.armT = 0; return true; }
    return true;
  }

  function makeCiv(S, x, z, yaw, o) {
    const r = S.r;
    const e = r.enemy('civ', x, z, { friendly: true, drop: false, yaw, exact: true, pers: false, ai: null });
    const n = e.n;
    e.cs = { st: 'queue', yaw, talk: o && o.talk ? rnd(0.5, 3) : 0, pair: !!(o && o.talk), panicAt: 0 };
    e.ai = (ee, dt) => civAI(S, ee, dt);
    n.g.scale.setScalar(rnd(0.93, 1.04)); n.daze = 0; n.cvT = 0; n.gest = 0; n.crouch = 0;
    dress(r, n, { vest: pick(VEST), cs: Math.random() < 0.36, cap: Math.random() < 0.28 });
    e.tag = 'civ';
    S.civ.push(e);
    return e;
  }

  // ================================================================== охрана зала
  function holdAI(S) {
    return (e, dt) => {
      if (S.alarm) { e.ai = null; return false; }
      e.n.armT = 0; return true;                                       // стоят на посту, пока не поднята тревога
    };
  }
  function spawnGuard(S) {
    const r = S.r, p = r.p, fw = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
    let pt = null;
    for (let tries = 0; tries < 9 && !pt; tries += 1) {
      const s = pick(S.spawnPts), d = Math.hypot(s[0] - p.x, s[1] - p.z);
      if (d < 13 || d > 80) continue;
      const seen = tries < 7 && r.hasLOS(s[0], 1.5, s[1], p.x, 1.6, p.z) && ((s[0] - p.x) * fw.x + (s[1] - p.z) * fw.z) > 0;
      if (!seen) pt = s;
    }
    if (!pt) return null;
    const prog = clamp((p.z + 44) / 58, 0, 1), roll = Math.random();
    const type = roll < 0.06 + 0.16 * prog ? 'heavy' : roll < 0.3 ? 'rusher' : 'grunt';
    const x = pt[0] + rnd(-0.9, 0.9), z = pt[1] + rnd(-0.9, 0.9);
    const e = r.enemy(type, x, z, { drop: false, yaw: Math.atan2(p.x - x, p.z - z), speed: rnd(0.95, 1.2), hp: type === 'heavy' ? 2.2 : 1.7 });   // живучие: стрелять приходится долго
    e.tag = 'hallguard'; S.guards.push(e); S.spawned += 1;
    return e;
  }
  function placeGuards(S, list) {
    const r = S.r;
    list.forEach((p) => {
      const e = r.enemy('grunt', p[0], p[1], { drop: false, yaw: p[2] || 0, gun: p[3], hp: 1.7 });
      e.tag = 'hallguard'; e.ai = holdAI(S); S.guards.push(e);
    });
  }

  // ================================================================== союзники стреляют (только по охране)
  function allyFire(S, dt) {
    const r = S.r;
    S.allies.forEach((a) => {
      const n = a.n, g = n.g.position;
      if (a.flash > 0) { a.flash -= dt; if (a.flash <= 0 && n.flashM) n.flashM.visible = false; }
      a.on = Math.max(0, (a.on || 0) - dt);
      a.spin = clamp(a.spin + (a.on > 0 ? dt / 0.85 : -dt / 1.4), 0, 1);       // стволы раскручиваются, как у игрока
      if (n.mgSpin) n.mgSpin.rotation.z += dt * 46 * a.spin;
      a.cd -= dt;
      if (a.cd > 0) return;
      let best = null, bd = 22;
      for (const e of r.cb.enemies) {
        if (e.dead || e.friendly || e.t.passive || !e.n.g.visible || e.spawnT > 0) continue;
        const d = Math.hypot(e.x - g.x, e.z - g.z);
        if (d < bd && r.hasLOS(g.x, 1.4, g.z, e.x, 1.3, e.z)) { best = e; bd = d; }
      }
      if (!best) { n.armT = 0; a.cd = 0.15; return; }
      n.armT = 1; n.yaw = Math.atan2(best.x - g.x, best.z - g.z);
      a.cd = a.rate * rnd(0.8, 1.4);
      a.on = 0.25;
      if (n.aimK < 0.55 || a.spin < 0.8) return;
      n.kick = 1; if (n.flashM) { n.flashM.visible = true; a.flash = 0.05; }
      r.snd && r.snd.shot(a.snd, { dist: Math.hypot(g.x - r.p.x, g.z - r.p.z), at: [g.x, 1.4, g.z] });
      if (Math.random() < a.acc) r.damageEnemy(best, a.dmg, Math.random() < 0.12);
    });
  }

  K.allyFire = allyFire;                                              // общий огонь союзников: S = { r, allies: [{ n, cd, rate, dmg, acc, flash, snd, spin }] }

  // ================================================================== зал: состояние прохода
  K.hall = {
    S: (r) => r.f48hall || null,
    // R — регион 'hall'; o.team = {d,g}. Создаёт гражданских и охрану, запускает тик. Возвращает состояние.
    begin(r, R, o) {
      K.hall.dispose(r);
      o = o || {};
      if (!r.__f48en) {                                                // пул npc переиспользуется: одежду гражданских снимаем с обычных врагов
        r.__f48en = true;
        const en0 = r.enemy;
        r.enemy = function (type, x, z, oo) { const e = en0.call(this, type, x, z, oo); if (type !== 'civ' && e.n.civ) undress(e.n); return e; };
      }
      r.combat();
      const S = r.f48hall = {
        r, R, civ: [], guards: [], offs: [], alarm: false, alarmAt: 0, t: 0, dirT: 0, spawned: 0, screams: 0, lastScream: -9, allies: [], kills: 0, civKills: 0, step: -1, beatT: 1, dead: false, cap: r.q.maxEnemies <= 6 ? 16 : r.q.maxEnemies <= 9 ? 24 : 34,
        spawnPts: [].concat(R.spawns.north, R.spawns.south, R.spawns.rooms, R.spawns.rooms), onAlarm: o.onAlarm || null
      };
      S.fExit = buildField(r, R.exits); S.fHide = buildField(r, R.hide);
      // очереди: десять окон, лицом к кассе
      const len = r.q.maxEnemies <= 6 ? 4 : r.q.maxEnemies <= 9 ? 5 : 6;
      R.queues.forEach((q) => {
        for (let i = 0; i < len; i += 1) {
          const x = q.s * (30.7 - i * 1.4 - rnd(0, 0.25)), z = q.z + rnd(-0.45, 0.45);
          if (r.blockedE(x, z)) continue;
          makeCiv(S, x, z, q.s * PI / 2 + rnd(-0.12, 0.12));
        }
      });
      // пары разговаривающих в центре зала
      [[-10, -12], [10, -14], [-8, 6], [9, 5], [-16, -31], [15, -29], [-5, -33], [6, -36]].slice(0, len > 4 ? 8 : 4).forEach((c) => {
        if (r.blockedE(c[0] - 0.6, c[1]) || r.blockedE(c[0] + 0.6, c[1])) return;
        const a = makeCiv(S, c[0] - 0.6, c[1], PI / 2 + rnd(-0.3, 0.3), { talk: 1 }), b = makeCiv(S, c[0] + 0.6, c[1], -PI / 2 + rnd(-0.3, 0.3), { talk: 1 });
        a.cs.yaw = Math.atan2(b.x - a.x, b.z - a.z); b.cs.yaw = Math.atan2(a.x - b.x, a.z - b.z);
      });
      // охрана на постах: у рамок металлодетекторов, у касс, у лестницы
      placeGuards(S, [[-9, 14.5, PI], [9, 14.5, PI], [-15, 10.5, PI], [15, 10.5, PI], [-4, 16.5, PI], [4, 16.5, PI], [-18, 2, PI / 2], [18, 2, -PI / 2], [-14, -14, PI], [14, -14, PI],
        [-6, 10, PI], [6, 10, PI], [-22, 12, PI], [22, 12, PI], [-12, -4, PI / 2], [12, -4, -PI / 2], [-24, -22, PI / 2], [24, -22, -PI / 2], [-8, -30, 0], [8, -30, 0],
        [-20, 6, PI / 2], [20, 6, -PI / 2], [-3, -8, PI], [3, -8, PI], [-26, -4, PI / 2], [26, -4, -PI / 2], [-16, -36, 0], [16, -36, 0]].slice(0, S.cap >= 30 ? 28 : S.cap >= 20 ? 20 : 12));
      // союзники: огонь по охране
      if (o.team) {
        const mk = (n, rate, dmg, acc, snd) => { F.npcMinigun(r, n); S.allies.push({ n, cd: rnd(0.2, 0.8), rate, dmg, acc, flash: 0, snd, spin: 0 }); };
        mk(o.team.d, 0.085, 17, 0.58, 'elmg');
        mk(o.team.g, 0.1, 14, 0.5, 'elmg');
      }
      S.offs.push(K.hook(r, (dt) => tick(S, dt)));
      if (!r.cb.__f48kh) {
        r.cb.__f48kh = true;
        r.cb.killHooks.push((e, head) => { const s = r.f48hall; if (s && !s.dead) onKill(s, e, head); });
      }
      return S;
    },
    // собеседники в зале оборачиваются на точку (лифт звякнул)
    turnPairs(r, x, z) { const S = r.f48hall; if (!S) return; S.civ.forEach((e) => { if (e.cs.pair && e.cs.st === 'queue') { e.cs.yaw = Math.atan2(x - e.x, z - e.z); e.cs.talk = 0; e.n.gest = 0; } }); },
    alarm(r, quiet) { const S = r.f48hall; if (!S || S.alarm) return; S.alarm = true; S.alarmAt = S.t; alarmAt(S, r.p.x, r.p.z, 400, 0.14);   // сирена: через несколько секунд бежит весь зал
      if (!quiet) K.amb.pulse(r, 'alarm', 0.8); S.onAlarm && S.onAlarm(S); },
    dispose(r) {
      const S = r.f48hall; if (!S) return;
      S.dead = true; S.offs.forEach((f) => { try { f(); } catch (e) { /* уже снят */ } }); S.offs = [];
      S.allies.forEach((a) => { a.n.armT = 0; if (a.n.flashM) a.n.flashM.visible = false; });
      r.f48hall = null;
    }
  };

  function onKill(S, e, head) {
    const r = S.r;
    if (e.cs) {                                                        // гражданский
      S.civKills += 1; scream(S, e); alarmAt(S, e.x, e.z, 20);
      if (!S.alarm && S.civKills >= 2) K.hall.alarm(r);
    } else {
      S.kills += 1; alarmAt(S, e.x, e.z, 14);
      if (!S.alarm) K.hall.alarm(r);
    }
  }

  function tick(S, dt) {
    const r = S.r;
    if (!(dt > 0) || r.paused || r.disposed || S.dead) return;
    dt = Math.min(dt, 0.05);
    const gameplay = !r.locked && r.cineDepth <= 0 && !r.dead;
    // трупы гражданских остаются на полу (обычно врага убирают через 6 с)
    for (let i = 0; i < S.civ.length; i += 1) { const e = S.civ[i]; if (e.dead && !e.gone && e.deadT > 5) e.deadT = 5; }
    if (!gameplay) return;
    S.t += dt;
    const p = r.p;
    // выстрел игрока будит зал: волна паники и сирена
    if (r.wp && r.wp.id === 'minigun' && (r.fireHeld || r.padFire) && r.mg && r.mg.s >= 0.8) {
      S.fireT = (S.fireT || 0) - dt;
      if (S.fireT <= 0) { S.fireT = 0.4; alarmAt(S, p.x, p.z, 34); if (!S.alarm) K.hall.alarm(r); }
    }
    // охрана стреляет — тоже паника вокруг
    for (const e of r.cb.enemies) if (!e.dead && e.burst > 0 && !e.friendly) { S.shotT = (S.shotT || 0) - dt; if (S.shotT <= 0) { S.shotT = 0.5; alarmAt(S, e.x, e.z, 16); } break; }
    // сама по себе тревога поднимется через 40 с: бронированных троих заметили
    if (!S.alarm && S.t > 40) K.hall.alarm(r);
    // директор волн: охрана прибывает непрерывно и со всех сторон
    if (S.alarm) {
      S.dirT -= dt;
      if (S.dirT <= 0) {
        const prog = clamp((p.z + 44) / 58, 0, 1), alive = r.enemiesAlive();
        S.dirT = lerp(0.8, 0.28, prog) * (0.6 + alive / S.cap * 0.7);
        const batch = 1 + (prog > 0.35 ? 1 : 0) + (prog > 0.7 ? 1 : 0) + (S.t - S.alarmAt < 9 ? 2 : 0);   // пачками: сперва залп подкрепления, дальше всё гуще
        for (let i = 0; i < batch && r.enemiesAlive() < S.cap; i += 1) spawnGuard(S);
      }
    }
    allyFire(S, dt);
    // тяжёлая поступь костюма: каждый шаг — глухой удар и лёгкая дрожь камеры
    if (r.stepN !== S.step) { S.step = r.stepN; if (p.moving > 0.3 && r.stepN !== undefined) { K.amb.pulse(r, 'thunk', 0.5); r.kick(0, 0, 0, 0.0045); } }
    // сердцебиение игрока
    if (r.f48stress && r.f48stress.v > 0.05) {
      S.beatT -= dt;
      if (S.beatT <= 0) { S.beatT = lerp(1.2, 0.7, clamp(r.stress, 0, 1)); K.stressBeat(r); }
    }
  }
}());
