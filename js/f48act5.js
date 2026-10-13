// NEXA: миссия 48 — акт 5: спуск в подвал B4. Бег по залу этажа 1 к лифту, две катсцены лифта, шесть секций бесконечного коридора
// (шлюзы открываются после зачистки секции; охрана лезет из комнат, поперечных проходов и сзади), предбанник и дверь «083».
// Весь текст — английский. Регионы 'hall' (f48world3.js), 'deep' (f48world5.js). Команда (Диктор + девушка) приходит из акта 4 в st.team.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.PH || !C.f48.K || !C.f48.K.allyFire || !C.f48.K.suitMode || !C.f48.DEEP || !C.f48.Mk) return;
  const F = C.f48, K = F.K, PH = F.PH, PI = Math.PI;
  const DIC = 'DICTOR';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const put = (n, x, z, yaw) => { n.g.position.set(x, 0, z); n.yaw = yaw; n.g.rotation.y = yaw; n.goal = null; K.ally.stop(n); };
  const sh = (x) => K.shot(Object.assign({ dur: 3 }, x));
  const D0 = F.DEEP;
  const SEC = { z0: 16, len: 34 };
  // сколько охраны надо снять в секции, чтобы шлюз отпустил (и сколько максимум появится); вдвое плотнее, чем в первой версии
  const NEED = [34, 42, 50, 58, 66, 80];

  function deepEnd(r) {
    const V = r.f48deep; if (!V) return;
    V.dead = true; V.offs.forEach((f) => { try { f(); } catch (e) { /* уже снят */ } }); V.offs = [];
    V.allies.forEach((a) => { a.n.armT = 0; if (a.n.flashM) a.n.flashM.visible = false; });
    r.f48deep = null;
  }
  // состояние одного прохода участка: союзники с миниганами, директор охраны. pts(V) → [{x,z,rx,rz,w}] — откуда лезет охрана
  function deepBegin(r, R, team, o) {
    deepEnd(r);
    r.combat();
    const mq = r.q.maxEnemies;
    const V = r.f48deep = {
      r, R, key: o.key, sec: o.sec || 0, t: 0, cap: (mq <= 6 ? 16 : mq <= 9 ? 24 : 34) + 2 * (o.sec || 0), kills: {}, spawned: 0, need: Math.round(o.need * (mq <= 6 ? 0.6 : mq <= 9 ? 0.8 : 1)),
      prog: o.prog || 0, minD: o.minD || 11, pts: o.pts, allies: [], offs: [], dirT: 0.2, burstT: rnd(10, 16), wdT: 1, reach: new Map(), reachCheck: o.pts === corrPts, dir: false, fire: true, dead: false, step: -1, said: {}, lastSay: -9
    };
    V.lim = V.need + 8 + Math.ceil(V.need * 0.3);                      // запас на тех, кого не удалось достать
    V.kills[V.key] = 0;
    const mk = (n, rate, dmg, acc, snd) => { F.npcMinigun(r, n); V.allies.push({ n, cd: rnd(0.2, 0.8), rate, dmg, acc, flash: 0, snd, spin: 0 }); };
    mk(team.d, 0.085, 17, 0.58, 'elmg'); mk(team.g, 0.1, 14, 0.5, 'elmg');
    V.offs.push(K.hook(r, (dt) => dtick(V, dt)));
    if (!r.cb.__f48dk) {
      r.cb.__f48dk = true;
      r.cb.killHooks.push((e) => { const v = r.f48deep; if (v && !v.dead && e.dseg !== undefined && e.dseg === v.key) v.kills[v.key] += 1; });
    }
    return V;
  }

  // из точки есть проход к полосе коридора (|x| < 2.4)? Короткий поиск по сетке, результат кэшируется на ячейку 0.6 м.
  // Нужна, чтобы охрана не появлялась в «карманах» комнат/проходов (за мебелью, в углу у ящиков): оттуда она не выходила и не умирала.
  function reachable(V, x, z) {
    if (Math.abs(x) < 2.4) return true;
    const r = V.r, ck = Math.round(x / 0.6) * 4096 + Math.round(z / 0.6), hit = V.reach.get(ck);
    if (hit !== undefined) return hit;
    const st = 0.35, seen = new Set([0]), q = [[x, z]], DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];
    let h = 0, ok = false;
    for (; h < q.length && h < 2600 && !ok; h += 1) {
      for (let k = 0; k < 4; k += 1) {
        const nx = q[h][0] + DX[k] * st, nz = q[h][1] + DZ[k] * st, key = Math.round((nx - x) / st) * 4096 + Math.round((nz - z) / st);
        if (seen.has(key)) continue;
        seen.add(key);
        if (r.blockedE(nx, nz)) continue;
        if (Math.abs(nx) < 2.4) { ok = true; break; }
        q.push([nx, nz]);
      }
    }
    if (!ok && h >= 2600) ok = true;                                          // огромная открытая область — считаем достижимой
    V.reach.set(ck, ok);
    return ok;
  }
  function pickPt(V) {
    const r = V.r, p = r.p, pool = V.pts(V);
    if (!pool.length) return null;
    let tot = 0; pool.forEach((q) => { tot += q.w; });
    for (let t = 0; t < 14; t += 1) {
      let a = Math.random() * tot, q = pool[0];
      for (let i = 0; i < pool.length; i += 1) { a -= pool[i].w; if (a <= 0) { q = pool[i]; break; } }
      const x = q.x + rnd(-q.rx, q.rx), z = q.z + rnd(-q.rz, q.rz);
      if (Math.hypot(x - p.x, z - p.z) < V.minD || r.blockedE(x, z) || (V.reachCheck && !reachable(V, x, z))) continue;
      if (t < 6 && r.hasLOS(x, 1.5, z, p.x, 1.6, p.z)) continue;             // сначала пробуем точки, где игрок не видит появления
      return [x, z];
    }
    return null;
  }
  function spawnOne(V, hp) {
    const r = V.r, pt = pickPt(V); if (!pt) return null;
    const roll = Math.random();
    const type = roll < 0.06 + 0.16 * V.prog ? 'heavy' : roll < 0.3 ? 'rusher' : 'grunt';
    const e = r.enemy(type, pt[0], pt[1], { drop: false, yaw: Math.atan2(r.p.x - pt[0], r.p.z - pt[1]), speed: rnd(0.95, 1.2), hp: hp || (type === 'heavy' ? 2.2 : 1.7) });   // живучие: стрелять приходится долго
    e.tag = 'dguard'; e.dseg = V.key; V.spawned += 1;
    return e;
  }
  function director(V, dt) {
    const r = V.r;
    V.dirT -= dt;
    if (V.dirT <= 0) {
      const alive = r.enemiesAlive();
      V.dirT = rnd(0.45, 0.9) * (0.6 + alive / V.cap * 0.8);
      if (V.spawned < V.lim) {
        const batch = 1 + (V.sec > 1 ? 1 : 0) + (V.sec > 3 ? 1 : 0) + (V.t < 10 ? 1 : 0);
        for (let i = 0; i < batch && r.enemiesAlive() < V.cap && V.spawned < V.lim; i += 1) spawnOne(V);
      }
    }
    V.burstT -= dt;
    if (V.burstT <= 0) {                                                       // волна: тревога поднимает сразу несколько постов
      V.burstT = rnd(14, 24);
      K.amb.pulse(r, 'shout', 0.5);
      for (let i = 0; i < 5 + V.sec && r.enemiesAlive() < V.cap + 4 && V.spawned < V.lim + 6; i += 1) spawnOne(V);
    }
  }
  // сторож: охранник, который 6 с не двигается, не видит игрока и далеко — застрял (угол, мебель); переносим на достижимую точку, иначе убираем
  function watchdog(V, dt) {
    V.wdT -= dt; if (V.wdT > 0) return;
    V.wdT = 1;
    const r = V.r, p = r.p;
    r.cb.enemies.slice().forEach((e) => {
      if (e.dead || e.tag !== 'dguard' || e.ai) return;                       // часовые с ai стоят намеренно
      const g = e.n.g;
      if (e.wx === undefined || Math.hypot(g.position.x - e.wx, g.position.z - e.wz) > 0.7) { e.wx = g.position.x; e.wz = g.position.z; e.wt = 0; return; }
      e.wt += 1;
      if (e.wt < 6 || e.los || Math.hypot(g.position.x - p.x, g.position.z - p.z) < 5) return;
      const pt = pickPt(V);
      if (pt) { g.position.x = pt[0]; g.position.z = pt[1]; e.path = null; e.wx = pt[0]; e.wz = pt[1]; e.wt = 0; }
      else if (e.wt > 14) r.killEnemy(e, false);
    });
  }
  function dtick(V, dt) {
    const r = V.r;
    if (!(dt > 0) || r.paused || r.disposed || V.dead) return;
    dt = Math.min(dt, 0.05);
    if (V.fire && !r.dead) K.allyFire(V, dt);
    if (r.locked || r.cineDepth > 0 || r.dead) return;
    V.t += dt;
    if (V.dir) { director(V, dt); watchdog(V, dt); }
    if (r.stepN !== V.step) { V.step = r.stepN; if (r.p.moving > 0.3 && r.stepN !== undefined) { K.amb.pulse(r, 'thunk', 0.5); r.kick(0, 0, 0, 0.0045); } }
  }
  // реплики Диктора по порядку: [условие, текст, длительность]; не чаще раза в 5 с
  function lines(V, list) {
    return K.hook(V.r, () => {
      if (V.dead || V.r.locked || V.r.cineDepth > 0) return;
      for (let i = 0; i < list.length; i += 1) {
        if (V.said[i] || !list[i][0](V)) continue;
        if (V.t - V.lastSay < 5) return;
        V.said[i] = true; V.lastSay = V.t; K.say(V.r, list[i][1], list[i][2]); return;
      }
    });
  }
  // часовые: стоят, пока не заметят игрока (или он не подойдёт на 17 м)
  function post(V, type, x, z, yaw, hp) {
    const e = V.r.enemy(type, x, z, { drop: false, yaw, hp: hp || (type === 'heavy' ? 2.2 : 1.7) });
    e.tag = 'dguard'; e.dseg = V.key; V.spawned += 1;
    e.ai = (ee, dt, rr, dist) => { if (rr.locked || rr.cineDepth > 0) { ee.n.armT = 0; return true; } if (ee.los || dist < 17) { ee.ai = null; return false; } ee.n.armT = 0; return true; };
    return e;
  }

  function lobbyPosts(V) { [[-5, 12.4], [5, 12.4], [-3.2, 10.8], [3.2, 10.8], [0, 12.6], [-1.4, 13.8], [1.4, 13.8]].forEach((q) => post(V, 'grunt', q[0], q[1], PI)); }

  // ------------------------------------------------------------------ точки появления охраны
  function hallPts(V) {
    const S = V.R.spawns, out = [];
    S.north.forEach((q) => out.push({ x: q[0], z: q[1], rx: 1.2, rz: 0.8, w: 3 }));
    S.rooms.forEach((q) => out.push({ x: q[0], z: q[1], rx: 2.5, rz: 2.5, w: 2 }));
    S.south.forEach((q) => out.push({ x: q[0], z: q[1], rx: 1.5, rz: 0.8, w: 1.3 }));
    return out;
  }
  function corrPts(V) {
    const R = V.R, sec = V.sec, out = [];
    R.rooms.forEach((rm) => {
      if (rm.seg === sec) out.push({ x: rm.cx, z: rm.cz, rx: 1.8, rz: 2.1, w: 3 });
      else if (rm.seg === sec - 1) out.push({ x: rm.cx, z: rm.cz, rx: 1.8, rz: 2.1, w: 0.9 });
    });
    R.cross.forEach((c) => {
      if (c.seg === sec) out.push({ x: c.x, z: c.z, rx: 0.8, rz: 1.3, w: 2.6 });
      else if (c.seg === sec - 1) out.push({ x: c.x, z: c.z, rx: 0.8, rz: 1.3, w: 0.9 });
    });
    if (sec === 0) [[-4.5, 12], [4.5, 12], [0, 13.6]].forEach((q) => out.push({ x: q[0], z: q[1], rx: 1, rz: 1, w: 1.6 }));
    return out;
  }

  // ================================================================== ФАЗА
  PH.deep = async function (r, ctx) {
    const W = ctx.W, st = K.st(r);
    const T = st.team || await K.makeTeam(r, { D: [-2.2, 12.0, 0], G: [2.2, 12.6, 0] });
    const d = T.d, g = T.g;
    K.lock(r);
    await r.clearEnemies();
    K.hall && K.hall.dispose(r);
    deepEnd(r);
    r.fade(1, 0);
    r.xfTint = true; r.noFight = true; st.suit = true;
    [d, g].forEach((n) => { if (!n.suitMeshes) F.suit(r, n); });
    d.g.visible = g.g.visible = true;
    const fov0 = r.baseFov;
    const skip = ctx.from === 'corr';                                         // отладка: сразу в коридор (ctx.sec — номер секции)
    let R = null, L = null;
    if (!skip) {

    // ---------------------------------------------------------- 1. зал этажа 1: вниз по лестнице и бегом к лифту через охрану
    W.enter('hall', 0, 12.4, 0);
    const RH = W.R.hall, LH = RH.lift;
    RH.alarm = true;
    LH.set(0); LH.setFloor('1', 0);
    K.css();
    K.amb.set(r, 'hall', { fade: 0.4 });
    r.p.x = 0; r.p.z = 12.4; r.p.yaw = 0; r.p.pitch = 0; r.spawnPt = [0, 12.4, 0];
    put(d, -2.0, 13.6, 0); put(g, 2.0, 14.0, 0);
    r.fade(0, 1.0);
    K.unlock(r);
    await r.phase('deep0', async () => {
      const V = deepBegin(r, RH, T, { key: 'h', sec: 0, need: 30, prog: 0.2, minD: 14, pts: hallPts });
      const ok = () => r.f48deep === V && !V.dead;
      await r.clearEnemies();
      V.dir = true; V.cap += 4;
      K.suitMode(r, true);
      K.suitFov(r, 102, 0.6);
      K.stress(r, 0.9, 2);
      K.ally.follow(r, [d], { side: -1, back: 2.6 });
      K.ally.follow(r, [g], { side: 1, back: 3.2 });
      r.objective('REACH THE SERVICE LIFT');
      r.waypoint && r.waypoint([0, 1.8, -41.6], 'SERVICE LIFT');          // маркер сразу: идти на север, к лифту в конце зала
      r.hint('SECURITY IS FLOODING THE HALL  —  FIGHT NORTH TO THE LIFT', 5);
      V.offs.push(lines(V, [
        [(v) => v.t > 2.5, 'Alarm is up on every floor. Straight to the lift.', 3.2],
        [(v) => v.kills.h >= 6, 'Do not stop. The lift is at the far end.', 2.8],
        [(v) => v.kills.h >= 16, 'Almost there. Cut them down!', 2.4]
      ]));
      await r.until(() => !ok() || (V.kills.h >= V.need && r.p.z < -18) || r.p.z < -38);
      if (!ok()) return;
      r.objective('REACH THE SERVICE LIFT');
      await r.beacon(0, -41.6, 'SERVICE LIFT', 2.6);
      V.dir = false;
      const tq = r.time; await r.until(() => !ok() || r.enemiesAlive() === 0 || r.time - tq > 12);
    }, { pos: [0, 12.4, 0], weapons: ['minigun'], set: () => { } });
    r.waypoint && r.waypoint(null);
    K.lock(r);
    deepEnd(r);
    K.stress(r, 0.3, 1);

    // ---------------------------------------------------------- 2. катсцена: лифт этажа 1, троица заходит в кабину и спускается
    await r.clearEnemies();
    LH.setFloor('1', 0);
    LH.set(1);
    const pbx = r.p.x, pbz = r.p.z;
    const p4 = K.pbody(r, pbx, pbz, PI); F.npcMinigun(r, p4);
    put(d, pbx + 1.5, pbz + 1.1, PI); put(g, pbx - 1.5, pbz + 1.3, PI);
    r.p.x = pbx; r.p.z = pbz;
    const cab = (dx, dz) => LH.cabPoint(dx, dz);
    let walked = false, closed = false, dinged = false;
    const turn = (n, to) => { const y0 = n.yaw; return r.tween(0.7, (k) => { n.yaw = lerpYaw(y0, to, k); n.g.rotation.y = n.yaw; }); };
    const shots1 = [
      sh({ at: [0.6, 1.65, -36.2], to: [0.3, 1.7, -37.4], look: [0, 1.3, -47.2], fov: 52, dur: 5.0, hand: 0.5, tense: 0.3,
        run: () => {
          r.fade(0, 0.5);
          K.amb.set(r, 'none', { fade: 0.6 });
        },
        tick: (rr, e, tt) => {
          if (!walked && tt > 0.3) {
            walked = true;
            const a = cab(0, 0.4), b = cab(-1.1, 0.7), c = cab(1.1, 0.7);
            Promise.all([r.walk(d, a, 1.7), r.walk(p4, b, 1.7), r.walk(g, c, 1.7)]).then(() => {
              [[d, a], [p4, b], [g, c]].forEach(([n, q]) => { K.ally.hold(r, n, q[0], q[1], 0); turn(n, 0); });
            });
          }
        },
        says: [[DIC, 'Sublevel four. The man we came for is down there.', 3.8]] }),
      sh({ at: [0.55, 1.5, cab(0, -1.35)[1]], to: [0.3, 1.52, cab(0, -1.2)[1]], look: [0, 1.42, cab(0, 0)[1] + 3.2], fov: 56, dur: 5.6, hand: 0.5, tense: 0.5,
        tick: (rr, e, tt) => {
          if (!closed && tt > 1.2) { closed = true; K.amb.pulse(r, 'ding', 0.8); LH.setFloor('B4', -1); LH.close(r, 2.0); }
          if (!dinged && tt > 3.8) { dinged = true; K.amb.pulse(r, 'rumble', 1); }
        },
        says: [[DIC, 'Last ride, gentlemen.', 2.4]] }),
      sh({ at: [-0.3, 1.5, cab(0, -1.4)[1]], to: [0.1, 1.5, cab(0, -1.25)[1]], look: [0, 1.5, cab(0, 0)[1] + 1.6], fov: 50, dur: 3.4, hand: 0.7, tense: 0.9, jolt: [0.8, 1.2],
        run: () => { r.fade(1, 2.6); K.amb.pulse(r, 'rumble', 1); K.amb.pulse(r, 'clank', 0.8); } })
    ];
    r.p.x = cab(-1.1, 0.7)[0]; r.p.z = cab(-1.1, 0.7)[1];
    await r.cinematic(shots1);
    await r.fade(1, 0.1);
    F.rm(r, p4);

    // ---------------------------------------------------------- 3. подвал: кабина, двери открываются на сто метров коридора
    W.enter('deep', 0, -1.6, PI);
    R = W.R.deep; L = R.lift;
    R.alarm = true;
    L.set(0); L.setFloor('B4', 0);
    R.gates.forEach((q) => q.reset());
    R.door.set(0);
    K.amb.set(r, 'none', { fade: 0.1 });
    const p5 = K.pbody(r, -1.1, -0.75, 0); F.npcMinigun(r, p5);
    put(d, 0, -0.95, 0); put(g, 1.1, -0.75, 0);
    K.ally.hold(r, d, 0, -0.95, 0); K.ally.hold(r, g, 1.1, -0.75, 0); K.ally.hold(r, p5, -1.1, -0.75, 0);
    r.p.x = -1.1; r.p.z = -0.75; r.p.yaw = PI; r.p.pitch = 0; r.spawnPt = [-1.1, -0.75, PI];
    // сторожевые посты у турникетов: стоят, пока не заметят
    const Vp = deepBegin(r, R, T, { key: 0, sec: 0, need: NEED[0], prog: 0, pts: corrPts });
    lobbyPosts(Vp);
    Vp.fire = false;
    let open2 = false;
    const shots2 = [
      sh({ at: [0, 1.55, -2.86], to: [0, 1.55, -2.7], look: [0, 1.5, 7], fov: 60, dur: 5.2, hand: 0.5, tense: 0.5,
        run: () => { r.fade(0, 0.9); K.amb.set(r, 'corridor', { fade: 1.2 }); },
        tick: (rr, e, tt) => { if (!open2 && tt > 1.6) { open2 = true; K.amb.pulse(r, 'ding', 0.8); L.open(r, 2.2); K.amb.pulse(r, 'alarm', 0.5); } },
        says: [[DIC, 'B4.', 1.4]] }),
      sh({ at: [-4.6, 1.5, 0.9], to: [-3.9, 1.55, 1.8], look: [2.4, 1.3, 11.5], fov: 50, dur: 4.4, hand: 0.5, tense: 0.7,
        says: [[DIC, 'Security. Of course.', 2.2]] }),
      sh({ at: [1.6, 1.9, 13.9], to: [0.6, 1.85, 14.4], look: [0, 1.9, 70], lookTo: [0, 1.9, 120], fov: 34, dur: 5.4, hand: 0.4, tense: 0.4,
        says: [[DIC, 'Six locks. One door. Walk through everything in your way.', 4.4]] }),
      C.cin.pov(r, 1.4, { extra: { cut: 'dip', whip: false, frame: 0 } })
    ];
    await r.cinematic(shots2);
    r.fade(0, 0.3);
    F.rm(r, p5);
    r.p.x = -1.1; r.p.z = -0.75; r.p.yaw = PI; r.p.pitch = 0;
    put(d, 0.5, -1.9, 0); put(g, 1.3, -2.2, 0);
    r.sub && r.sub.classList.remove('on');
    K.amb.level(r, 0.55);
    deepEnd(r);
    K.unlock(r);
    K.suitMode(r, true);
    K.suitFov(r, 102, 0.6);

    } else {
      W.enter('deep', 0, -1.6, PI);
      R = W.R.deep; L = R.lift; R.alarm = true; L.set(1); L.setFloor('B4', 0);
      R.door.set(0); K.css(); K.amb.set(r, 'corridor', { fade: 0.5 });
      const zs = ctx.sec ? SEC.z0 + SEC.len * ctx.sec + 2.5 : -0.75;
      r.p.x = 0; r.p.z = zs; r.p.yaw = PI; r.p.pitch = 0; r.spawnPt = [0, zs, PI];
      put(d, -1.4, zs - 2.2, 0); put(g, 1.4, zs - 2.6, 0);
      d.g.visible = g.g.visible = true;
      r.fade(0, 0.4); K.unlock(r); K.suitMode(r, true); K.suitFov(r, 102, 0.6);
    }

    // ---------------------------------------------------------- 4. шесть секций: каждая — отдельный чекпоинт
    const SAY = [
      [[(v) => v.t > 6, 'Hold the corridor. The lock opens when the section is clear.', 3.4], [(v) => v.kills[0] >= 12, 'They keep coming from the rooms. Good.', 2.6]],
      [[(v) => v.t > 5, 'Second lock. Same rules.', 2.4], [(v) => v.kills[1] >= 14, 'Barricades ahead. Walk through them.', 2.8]],
      [[(v) => v.t > 5, 'They are bringing everything down from the surface.', 3.2], [(v) => v.kills[2] >= 16, 'Behind us too! Keep moving!', 2.4]],
      [[(v) => v.t > 4, 'Red lights. Security protocol three. They are afraid.', 3.2], [(v) => v.kills[3] >= 18, 'Good. Let them come.', 2.2]],
      [[(v) => v.t > 5, 'Lights are failing. Keep firing.', 2.6], [(v) => v.kills[4] >= 20, 'One more lock after this one.', 2.6]],
      [[(v) => v.t > 4, 'Final lock! Break it and the door is ours.', 3.2], [(v) => v.kills[5] >= 26, 'Everything they have left is here. Finish it!', 3.0]]
    ];
    for (let i = ctx.sec || 0; i < D0.n; i += 1) {
      const gate = R.gates[i], s0 = SEC.z0 + SEC.len * i, s1 = s0 + SEC.len;
      let tries = 0;
      await r.phase('deep' + (i + 1), async () => {
        for (let j = 0; j < D0.n; j += 1) { if (j < i) R.gates[j].set(1); else R.gates[j].reset(); }
        const V = deepBegin(r, R, T, { key: i, sec: i, need: NEED[i], prog: i / (D0.n - 1), pts: corrPts });
        const ok = () => r.f48deep === V && !V.dead;
        if (i === 0 && tries++ > 0) lobbyPosts(V);                              // повтор: recover уже снял охрану, часовые у турникетов — заново
        V.dir = true;
        K.suitMode(r, true);
        K.stress(r, 0.9, 1.5);
        K.ally.follow(r, [d], { side: -1, back: 2.6 });
        K.ally.follow(r, [g], { side: 1, back: 3.2 });
        r.objective('BREAK THROUGH TO THE LOCK  ' + (i + 1) + ' / ' + D0.n + '   0 / ' + V.need);
        i === 0 && r.hint('HOLD LMB — THE MINIGUN SPINS UP FIRST', 4);
        let last = -1;
        V.offs.push(lines(V, SAY[i]));
        V.offs.push(K.hook(r, () => {
          if (!ok() || r.locked || r.cineDepth > 0) return;
          const k = Math.min(V.kills[i], V.need);
          if (k !== last) { last = k; r.objective('BREAK THROUGH TO THE LOCK  ' + (i + 1) + ' / ' + D0.n + '   ' + k + ' / ' + V.need); }
        }));
        // игрок не должен проскочить недозачищенную секцию: шлюз закрыт, пока охрана не снята (или пока её больше нет)
        await r.until(() => !ok() || V.kills[i] >= V.need || (V.spawned >= V.lim && r.enemiesAlive() === 0));
        if (!ok()) return;
        K.amb.pulse(r, 'clank', 1); K.amb.pulse(r, 'beep', 0.8);
        K.say(r, i === D0.n - 1 ? 'Final lock released!' : 'Lock released. Go!', 2.0);
        r.objective('GO THROUGH THE LOCK');
        gate.slide(r, 2.4);
        await r.beacon(0, s1 + 3.0, i === D0.n - 1 ? 'ANTECHAMBER' : 'NEXT SECTION', 2.4);
      }, { pos: [0, i === 0 ? 4 : s0 + 2.0, PI], weapons: ['minigun'], set: () => { R.gates.forEach((q, j) => { if (j <= i) q.set(1); }); } });
    }
    deepEnd(r);

    // ---------------------------------------------------------- 5. предбанник: последние посты у колонн, дверь «083»
    await r.phase('deep7', async () => {
      R.gates.forEach((q) => q.set(1));
      const V = deepBegin(r, R, T, { key: 'a', sec: 5, need: 99, prog: 1, pts: () => [] });
      const ok = () => r.f48deep === V && !V.dead;
      K.suitMode(r, true);
      K.stress(r, 0.9, 1.5);
      K.ally.follow(r, [d], { side: -1, back: 2.6 });
      K.ally.follow(r, [g], { side: 1, back: 3.2 });
      [[-3.2, 227], [3.2, 227], [-3.4, 232], [3.4, 232], [-7.4, 229], [7.4, 229], [-3.2, 237], [3.2, 237], [-7.6, 235], [7.6, 235], [-1.6, 241], [1.6, 241]]
        .forEach((q, k) => post(V, k % 3 === 0 ? 'heavy' : 'grunt', q[0], q[1], PI + (q[0] > 0 ? 0.2 : -0.2) * 0));
      V.offs.push(lines(V, [
        [(v) => v.t > 1.5, 'The antechamber. Last of them.', 2.6],
        [(v) => r.enemiesAlive() <= 4, 'That is the door. Number zero eight three.', 3.2]
      ]));
      r.objective('REACH DOOR 083');
      await r.beacon(R.beaconAt[0], R.beaconAt[1], 'DOOR 083', 2.6);
      if (!ok()) return;
      const tEnd = r.time; await r.until(() => !ok() || r.enemiesAlive() === 0 || r.time - tEnd > 14);
    }, { pos: [0, 223, PI], weapons: ['minigun'], set: () => { R.gates.forEach((q) => q.set(1)); } });

    // ---------------------------------------------------------- выход: охрана снята, команда у двери
    deepEnd(r);
    await r.clearEnemies();
    r.waypoint && r.waypoint(null);
    K.ally.stop(d); K.ally.stop(g);
    r.baseFov = fov0;
    st.deepDone = true;
    K.unlock(r);
  };

  function lerpYaw(a, b, k) { let dd = b - a; while (dd > PI) dd -= 2 * PI; while (dd < -PI) dd += 2 * PI; return a + dd * k; }
}());
