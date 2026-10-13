// NEXA: миссия 48 — акт 6 (часть 2): флэшбек. Сцена у двери 083 → монтаж → «реальность» (f48act6.js) → подъём с пола в тёмном коридоре →
// прогулка с командой → Диктор спрашивает, где виновный → ярость, команда исчезает → красная комната: 221 с боя под flashback.m4a (волны охраны
// «мало → много → невероятно много → безумно много», случайный охранник бьёт по лицу, затем появляется Диктор и даёт пощёчину, потолок рушится,
// взрывы, в конце охрана окружает игрока и бьёт по лицу) → пробуждение на полу перед дверью HEAD, пощёчина Диктора, «Get up», E на двери.
// Охрана может снять здоровье игрока максимум до 1 (K.hpFloor). Весь текст — английский.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.FL || !C.f48.FL.realityShots || !C.f48.K || !C.f48.K.hpFloor || !C.f48.PH || !C.f48.RED || !C.f48.DARK) return;
  const F = C.f48, K = F.K, PH = F.PH, FL = F.FL, PI = Math.PI, EYE = FL.EYE;
  const { put, sh, rnd, pick, trc } = FL;
  const DIC = 'DICTOR', SONG = 221.171;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wait = (r, s) => r.wait(s);
  // камера свободного полёта: повернуть точку взгляда (кадр «дёрнулся» от удара); вызывается из tick шота
  const kickLook = (r, dy, dp) => {
    const cf = r.camFree; if (!cf || (!dy && !dp)) return;
    const vx = cf.look.x - cf.pos.x, vy = cf.look.y - cf.pos.y, vz = cf.look.z - cf.pos.z, h = Math.hypot(vx, vz) || 1, L = Math.hypot(h, vy);
    const a = Math.atan2(vx, vz) + dy, pit = Math.atan2(vy, h) + dp;
    cf.look.set(cf.pos.x + Math.sin(a) * Math.cos(pit) * L, cf.pos.y + Math.sin(pit) * L, cf.pos.z + Math.cos(a) * Math.cos(pit) * L);
  };
  const faceTo = (n, x, z) => { n.yaw = Math.atan2(x - n.g.position.x, z - n.g.position.z); n.g.rotation.y = n.yaw; };
  const lerpA = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  // удар / пощёчина по лицу камеры: рука n (side −1 левая / +1 правая) летит по дуге перед объективом. u 0..1; кулак (jab) или размах (slap)
  // cam = [x, y, z, fx, fz (к ударяющему), vx, vz (куда смотрит камера), расстояние до ударяющего]. Кадр смещён так, что ударяющий стоит сбоку от центра,
  // а рука идёт по дуге через светлый фон к объективу (чёрная рука на чёрном торсе в лоб не читается)
  function strike(r, n, side, u, cam, kind, w) {
    const ex = cam[0], ey = cam[1], ez = cam[2], fx = cam[3], fz = cam[4], vx = cam[5] === undefined ? fx : cam[5], vz = cam[6] === undefined ? fz : cam[6], sd = cam[7] || 0.95;
    const rx = -vz, rz = vx;                                                      // вправо относительно взгляда камеры
    const ls = sd * (fx * rx + fz * rz), fs = sd * (fx * vx + fz * vz), sg = ls >= 0 ? 1 : -1;   // где стоит ударяющий в системе взгляда (боковое / вперёд)
    let lat, f, y;
    if (kind === 'jab') {                                                         // хук/прямой: от корпуса дугой наружу и в центр кадра (в «лицо»)
      const k = u < 0.5 ? u / 0.5 : 1 - (u - 0.5) / 0.5, e = k * k * (3 - 2 * k);
      lat = (ls + side * 0.06) * (1 - e) + sg * 0.06 * e + sg * 0.2 * Math.sin(Math.PI * e) * (side === sg ? 1 : 0.35);
      f = (fs - 0.1) * (1 - e) + 0.5 * e;
      y = ey - 0.26 + 0.24 * e + 0.05 * Math.sin(Math.PI * e);
    } else {                                                                      // пощёчина: размах от стороны ударяющего через центр кадра на другую сторону
      const k = u;
      lat = sg * (0.5 - 1.05 * k); f = 0.5 + 0.08 * Math.sin(Math.PI * k); y = ey - 0.04 + 0.06 * Math.sin(Math.PI * k);
    }
    K.armBlend(r, n, side, w, ex + vx * f + rx * lat, y, ez + vz * f + rz * lat);
  }

  // ================================================================== 1. СЦЕНА У ДВЕРИ (число «083»)
  FL.stareShots = function (r, W, T) {
    const FX = K.flash(r), p = r.p;
    let beat = 0;
    return [sh({
      at: [p.x, EYE, p.z], to: [0, 1.75, 243.1], look: [0, 1.7, 246], lookTo: [0, 2.35, 246], fov: 66, fovTo: 42, dur: 8.0, hand: 0.9, tense: 1.1, dockIn: true, ease: 'in',
      run: () => {
        if (r.cineSkip) return;
        K.amb.set(r, 'none', { fade: 1.2 });
        FX.to('dull', 3); FX.amount(0.5, 6);
      },
      tick: (rr, e, tt) => {
        const B = [1.6, 3.6, 5.2, 6.4, 7.2];
        if (beat < B.length && tt > B[beat]) {
          K.amb.pulse(r, beat % 2 ? 'heart' : 'bump', 0.5 + beat * 0.15); FX.pulse(0.25 + beat * 0.15); beat += 1;
          if (beat === 4) { FX.to('acid', 0.6); FX.amount(0.9, 0.8); }
        }
      }
    })];
  };

  // ================================================================== 2. ПОДЪЁМ С ПОЛА В ТЁМНОМ КОРИДОРЕ
  function darkSetup(r, W, T, pz, yaw) {
    const R = W.enter('dark', 0, pz, yaw);
    K.amb.set(r, 'corridor', { fade: 0.4 });
    r.p.x = 0; r.p.z = pz; r.p.yaw = yaw; r.p.pitch = 0; r.spawnPt = [0, pz, yaw];
    return R;
  }
  FL.riseShot = function (r, W, T) {
    const d = T.d, g = T.g, FX = K.flash(r);
    return sh({
      at: [0.18, 0.2, 247.0], to: [0, EYE, 247.6], look: [0, 0.9, 251.5], lookTo: [0, EYE, 253.6], fov: 72, fovTo: r.baseFov, roll: 0.16, rollTo: 0, dur: 5.0, hand: 1.0, tense: 0.7, dock: true, ease: 'out',
      run: () => {
        darkSetup(r, W, T, 247.6, PI);
        put(d, -0.55, 250.6, 0); put(g, 0.65, 251.6, 0); d.g.visible = g.g.visible = true; d.armT = 0; g.armT = 0;
        K.ally.goto(r, d, [-0.55, 256.5], 0.9); K.ally.goto(r, g, [0.65, 257.6], 0.9);
        r.fade(0, 0.5); FX.to('dull', 0.3); FX.cut(0.6); FX.off(4);
        K.amb.pulse(r, 'thunk', 0.5);
      }
    });
  };

  // ================================================================== 3. ПРОГУЛКА И ВОПРОС ДИКТОРА
  async function darkWalk(r, W, T) {
    const d = T.d, g = T.g, t0 = r.time;
    K.unlock(r); r.fade(0, 0.3);
    K.stress(r, 0.3, 1);
    r.objective('FOLLOW THE CORRIDOR');
    r.waypoint && r.waypoint([0, 1.6, 272], 'FOLLOW THE CORRIDOR');         // коридор тёмный: маркер на дальнем конце
    K.ally.goto(r, d, [-0.5, 270.2], 1.3, { lead: 2.2, tmo: 400 });
    K.ally.goto(r, g, [0.6, 271.4], 1.3, { lead: 2.2, tmo: 400 });
    await r.until(() => (r.p.z > 265.0 && d.g.position.z > 268.4) || r.time - t0 > 150);
    r.waypoint && r.waypoint(null);
  }

  FL.rageShots = function (r, W, T) {
    const d = T.d, g = T.g, FX = K.flash(r), p = r.p, px = p.x, pz = p.z;
    const Q = { open: 0, ph: 0, rage: 0 };
    let hb = 0, gone = false, flick = 0;
    const off = K.hook(r, (dt) => {
      if (r.disposed) return;
      Q.ph += dt;
      if (Q.open > 0.01) {                                                    // растерянный жест: руки в стороны, ладони вверх
        const dp = d.g.position, f = [Math.sin(d.g.rotation.y), Math.cos(d.g.rotation.y)];
        K.armBlend(r, d, -1, Q.open, dp.x - f[1] * 0.62 + f[0] * 0.28, 1.12 + Math.sin(Q.ph * 2.1) * 0.03, dp.z + f[0] * -0.0 + f[1] * 0.0 + f[0] * 0.3 - 0.0 * f[1]);
        K.armBlend(r, d, 1, Q.open, dp.x + f[1] * 0.62 + f[0] * 0.28, 1.12 + Math.cos(Q.ph * 2.3) * 0.03, dp.z + f[1] * 0.0 + f[0] * 0.3);
      }
    });
    return {
      off,
      shots: [
        sh({
          at: [px, EYE, pz], to: [px, EYE - 0.02, pz + 0.3], look: () => [d.g.position.x, 1.5, d.g.position.z], fov: 70, fovTo: 58, dur: 5.8, hand: 0.9, tense: 0.7, dockIn: true,
          run: () => {
            if (r.cineSkip) return;
            K.ally.stop(d); K.ally.stop(g); faceTo(d, px, pz); faceTo(g, px, pz);
            r.tween(0.6, (k) => { Q.open = k * 0.85; });
            FX.to('dull', 1); FX.amount(0.35, 2);
          },
          tick: (rr, e, tt) => { if (tt > 3.2 && hb < 1) { hb = 1; K.amb.pulse(r, 'heart', 0.6); } if (tt > 4.6 && hb < 2) { hb = 2; K.amb.pulse(r, 'heart', 0.8); } },
          says: [[DIC, 'Wait.', 0.9], [DIC, 'Where is he?', 1.5], [DIC, 'Where is the one who did this to you?', 2.6]]
        }),
        sh({
          at: [px, EYE - 0.02, pz + 0.3], to: [px, EYE - 0.1, pz + 0.5], look: () => [d.g.position.x, 1.5, d.g.position.z], lookTo: [px + 0.5, EYE + 0.6, pz + 6], fov: 58, fovTo: 92, roll: 0, rollTo: 0.38, dur: 4.6, hand: 2.4, tense: 2.0, push: 0, frame: 0,
          run: () => {
            if (r.cineSkip) return;
            FX.to('red', 1.2); FX.amount(1, 1.4); FX.swimK = 2.8; K.stress(r, 1, 1.5);
            K.amb.pulse(r, 'heart', 1); K.amb.pulse(r, 'scream', 0.45);
          },
          tick: (rr, e, tt) => {
            Q.open = Math.max(0, Q.open - 0.02);
            if (tt > hb * 0 + 0.55 * (flick + 1) && flick < 6) { flick += 1; K.amb.pulse(r, 'heart', 1); FX.pulse(0.8); }
            if (tt > 1.5 && !gone) {                                         // команда мерцает и пропадает
              const on = Math.sin(tt * 47) + Math.sin(tt * 23 + 1) > (tt - 1.5) * 1.2 - 0.4;
              d.g.visible = g.g.visible = on && tt < 3.2;
              if (tt >= 3.2) { gone = true; d.g.visible = g.g.visible = false; K.amb.pulse(r, 'squeal', 0.7); }
            }
            if (tt > 3.4 && !(Q.w)) { Q.w = true; FX.cut(0.55); FX.pulse(1); }
          }
        }),
        sh({
          at: [px, EYE - 0.1, pz + 0.65], to: [px, EYE - 0.2, pz + 0.9], look: [px + 0.5, EYE + 0.6, pz + 6], fov: 92, fovTo: 110, roll: 0.38, rollTo: 0.6, dur: 1.4, hand: 3, tense: 2.4,
          run: () => { FX.cut(0.8); K.amb.pulse(r, 'boom', 1); },
          tick: (rr, e, tt, dur) => { if (tt > dur - 0.7 && !Q.f) { Q.f = true; r.fade(1, 0.6); } }
        })
      ]
    };
  };

  // ================================================================== 4. КРАСНАЯ КОМНАТА
  const WAVES = [[0, 6], [26, 14], [58, 26], [92, 40]];                          // [секунда песни, одновременно живых охранников]

  function redEnd(r) {
    const Z = r.f48red; if (!Z) return;
    Z.dead = true; Z.offs.forEach((f) => { try { f(); } catch (e) { /* уже снят */ } }); Z.offs = [];
    if (Z.R) { Z.R.onSlab = null; }
    r.f48red = null;
  }

  function capAt(Z) {
    let c = WAVES[0][1];
    for (const w of WAVES) if (Z.t >= w[0]) c = w[1];
    return Math.max(4, Math.round(c * Z.qk));
  }

  // прямая от (x,z) до игрока свободна для бегуна (низкие барьеры не видны как препятствие для LOS, а рашер идёт напрямик)
  function clearLine(r, x, z) {
    const p = r.p, d = Math.hypot(p.x - x, p.z - z), n = Math.ceil(d / 0.3);
    for (let i = 1; i < n; i += 1) { const k = i / n; if (r.blockedE(x + (p.x - x) * k, z + (p.z - z) * k)) return false; }
    return true;
  }

  function redSpawn(Z, o) {
    o = o || {};
    const r = Z.r, R = Z.R, p = r.p;
    for (let tries = 0; tries < 24; tries += 1) {
      const s = pick(R.spots), x = s[0] + rnd(-1.2, 1.2), z = s[1] + rnd(-1.2, 1.2), dist = Math.hypot(x - p.x, z - p.z);
      if (dist < (o.min || 8.5) || r.blockedE(x, z) || (o.clear && !clearLine(r, x, z))) continue;
      const los = r.hasLOS(x, 1.5, z, p.x, 1.6, p.z);
      if (tries < 10 && (o.los ? !los : los)) continue;                          // охрана выходит там, где игрок не видит (в начале — наоборот, на виду)
      const prog = clamp(Z.t / SONG, 0, 1), roll = Math.random();
      const type = o.type || (roll < 0.05 + 0.14 * prog ? 'heavy' : roll < 0.3 ? 'rusher' : 'grunt');
      const e = r.enemy(type, x, z, { drop: false, yaw: Math.atan2(p.x - x, p.z - z), speed: o.speed || rnd(0.95, 1.2), hp: o.hp || (type === 'heavy' ? 2.0 : 1.5) });
      e.tag = 'redg'; Z.spawned += 1;
      return e;
    }
    return null;
  }

  // удар плиты: охрана под ней гибнет, игрок получает урон (потолок = 1 HP)
  function slabHit(Z, s) {
    const r = Z.r;
    for (const e of r.cb.enemies.slice()) {
      if (e.dead || e.f48punch) continue;
      if (Math.abs(e.x - s.x) < 4.3 && Math.abs(e.z - s.z) < 4.0) { e.n.blast = { x: s.x, z: s.z, f: 0.5, t: performance.now() }; r.damageEnemy(e, 9999, false); }
    }
    if (Math.abs(r.p.x - s.x) < 4.3 && Math.abs(r.p.z - s.z) < 4.0) r.hurt(60, s.x, s.z);
    K.amb.pulse(r, 'boom', 0.7); K.amb.pulse(r, 'rumble', 0.6);
    r.shake && r.shake(0.05, 0.7);
  }

  function blast(Z) {
    const r = Z.r, p = r.p;
    for (let t = 0; t < 10; t += 1) {
      const x = rnd(-11, 11), z = rnd(-13.5, 13.5), dist = Math.hypot(x - p.x, z - p.z);
      if (dist < 5.5) continue;
      const R = rnd(6, 9.5);
      r.explode(x, rnd(0.6, 1.2), z, R, 110, R >= 8 ? 'bomb' : 'frag');
      Z.R.puff(x, 1.2, z, 4, true);
      K.amb.pulse(r, 'boom', 1); r.shake && r.shake(0.07, 0.8);
      return;
    }
  }

  function startBattle(Z) {
    const r = Z.r;
    Z.started = true; Z.t = 0;
    Z.trk = K.track(r, 'flashback.m4a', { dur: SONG, vol: 1 });
    Z.trk.play(0);
    Z.offs.push(() => { if (!Z.keepTrack) Z.trk.stop(0.4); });
    K.amb.level(r, 0.3);
    K.flash(r).pulse(0.8);
  }

  function redTick(Z, dt) {
    const r = Z.r;
    if (Z.dead || r.disposed || !(dt > 0) || r.paused) return;
    dt = Math.min(dt, 0.05);
    if (r.locked || r.cineDepth > 0 || r.dead) return;
    if (!Z.started) {                                                            // горстка охранников ждёт; трек включается, когда началась настоящая стрельба
      if (r.cb.lastCombat >= Z.t0 + 0.3 || r.time - Z.t0 > 16) startBattle(Z);
      else { Z.dirT -= dt; if (Z.dirT <= 0) { Z.dirT = 1.2; if (r.enemiesAlive() < 3) redSpawn(Z, { los: true, min: 11 }); } return; }
    }
    Z.t = Z.trk.time();
    const R = Z.R, cap = capAt(Z);
    // директор: волны
    Z.dirT -= dt;
    if (Z.dirT <= 0) {
      Z.dirT = rnd(0.26, 0.5);
      const batch = Z.t < 26 ? 1 : Z.t < 58 ? 2 : 3;
      for (let i = 0; i < batch && r.enemiesAlive() < cap; i += 1) redSpawn(Z);
    }
    let wv = 0; WAVES.forEach((w, i) => { if (Z.t >= w[0]) wv = i; });
    if (wv !== Z.wave) { Z.wave = wv; if (wv > 0) { K.amb.pulse(r, 'shout', 0.7); K.amb.pulse(r, 'alarm', 0.4); FL.flashPulse && FL.flashPulse(r); K.flash(r).pulse(0.7); } }
    // обрушение потолка
    if (!Z.col && Z.t >= SONG - 100) {
      Z.col = true; R.siren = true;
      R.collapse(r, { t: 72, onHit: (s) => slabHit(Z, s) });
      K.amb.pulse(r, 'rumble', 1);
    }
    // взрывы
    if (Z.t >= SONG - 60 && Z.t < SONG - 15) {
      Z.expT -= dt;
      if (Z.expT <= 0) { const k = clamp((Z.t - (SONG - 60)) / 44, 0, 1); Z.expT = rnd(2.6, 4.4) * (1 - k * 0.75); blast(Z); }
    }
    // случайный охранник подбегает бить по лицу
    if (!Z.punch && Z.t > Z.Tp && Z.t < SONG - 40) {
      const e = redSpawn(Z, { type: 'rusher', hp: 60, speed: 1.4, min: 8, los: true, clear: true });
      if (e) { Z.punch = e; e.pr = null; e.f48punch = true; e.onHit = (ee) => { ee.hp = ee.max; }; Z.pk = { d: 99, t: 0 }; }
    }
    if (Z.punch && !Z.punchDone) {
      const e = Z.punch, d = Math.hypot(e.x - r.p.x, e.z - r.p.z);
      if (e.dead) { Z.punch = null; Z.Tp = Z.t + 6; }
      else if (d < 2.1) { Z.punchDone = true; punchEvent(Z, e); }
      else {                                                                          // застрял за препятствием → переставить на свободное место с прямой линией
        Z.pk.t += dt;
        if (d < Z.pk.d - 0.6) { Z.pk.d = d; Z.pk.t = 0; }
        else if (Z.pk.t > 1.6) {
          Z.pk.t = 0;
          for (let t = 0; t < 30; t += 1) {
            const a = rnd(0, PI * 2), rr = rnd(5, 7.5), x = r.p.x + Math.sin(a) * rr, z = r.p.z + Math.cos(a) * rr;
            if (r.blockedE(x, z) || !clearLine(r, x, z)) continue;
            e.n.g.position.x = x; e.n.g.position.z = z; Z.pk.d = rr; break;
          }
        }
      }
    }
    // финал
    if (!Z.ringed && (Z.t >= SONG - 14 || Z.trk.ended())) { Z.ringed = true; ringScene(Z); }
  }

  // ------------------------------------------------------------------ событие: охранник бьёт по лицу, потом появляется Диктор и даёт пощёчину
  async function punchEvent(Z, e) {
    const r = Z.r, T = Z.T, d = T.d, n = e.n, p = r.p, FX = K.flash(r);
    const ang = Math.atan2(n.g.position.x - p.x, n.g.position.z - p.z), fx = Math.sin(ang), fz = Math.cos(ang);
    const gx = p.x + fx * 0.95, gz = p.z + fz * 0.95;
    // кадр: ударяющий стоит сбоку от центра (dir +1 — слева, −1 — справа), центр кадра — «лицо» игрока
    const view = (dir) => { const a = ang - 0.2 * dir, vx = Math.sin(a), vz = Math.cos(a); return { cam: [p.x, EYE, p.z, fx, fz, vx, vz, 0.95], look: [p.x + vx * 0.95, EYE - 0.02, p.z + vz * 0.95] }; };
    const VG = view(1), VD = view(-1);
    const Q = { u: -1, side: 1, kind: 'jab', who: n, kx: 0, kp: 0, last: 0, w: 0, cam: VG.cam };
    const off = K.hook(r, (dt) => {
      if (Q.u >= 0) {
        Q.u += dt / (Q.kind === 'jab' ? 0.3 : 0.34);
        Q.w = Math.min(1, Math.sin(Math.min(1, Q.u) * PI) * 1.8);
        strike(r, Q.who, Q.side, Math.min(1, Q.u), Q.cam, Q.kind, Q.w);
        if (Q.u >= 1) Q.u = -1;
      }
    });
    const hit = (dir, strong) => {                                                  // dir: куда рвёт взгляд (−1 вправо, +1 влево)
      Q.kx = dir * (strong ? 0.5 : 0.36); Q.kp = strong ? -0.14 : -0.08;
      r.cineJolt && r.cineJolt(strong ? 1.5 : 1.1); FX.pulse(strong ? 1 : 0.8); K.amb.pulse(r, 'hit', 1);
      r.snd && r.snd.play('hurt');
    };
    const swing = (who, side, kind) => { Q.who = who; Q.side = side; Q.kind = kind; Q.u = 0; };
    const decay = (tt) => { const dt = Math.min(0.05, tt - Q.last); Q.last = tt; const k = Math.exp(-dt * 7.5); Q.kx *= k; Q.kp *= k; kickLook(r, Q.kx, Q.kp); };
    let b = 0;
    const eyeShot = (V, extra) => sh(Object.assign({ at: V.cam.slice(0, 3), to: [p.x - fx * 0.12, EYE - 0.04, p.z - fz * 0.12], look: V.look, fov: 62, hand: 1.3, tense: 1.2, push: 0, frame: 0 }, extra));
    const shots = [
      eyeShot(VG, {
        dockIn: true, dur: 3.2, fovTo: 56,
        run: () => {
          if (r.cineSkip) return;
          n.g.position.set(gx, 0, gz); n.yaw = ang + PI; n.g.rotation.y = n.yaw; n.armT = 0.1; n.aimK = 0; n.goal = null; n.creeping = false;
          FX.to('acid', 0.2); FX.pulse(0.7); K.amb.pulse(r, 'shout', 0.8); Q.last = 0; Q.cam = VG.cam;
        },
        tick: (rr, ee, tt) => {
          decay(tt);
          const B = [0.45, 1.15, 1.85];
          if (b < B.length && tt > B[b]) { swing(n, b % 2 ? 1 : -1, 'jab'); const bb = b; setTimeout(() => hit(-1, bb === 2), 140); b += 1; }   // хук внешней рукой, прямой внутренней, снова хук
        }
      }),
      eyeShot(VD, {
        dur: 3.4, dock: true, fovTo: r.baseFov,
        run: () => {
          if (r.cineSkip) return;
          FX.cut(1);                                                              // рывок реальности: охранник → Диктор
          n.g.visible = false;
          d.g.visible = true; put(d, gx, gz, ang + PI); d.armT = 0; d.aimK = 0; Q.who = d; Q.last = 0; b = 0; Q.cam = VD.cam;
          K.amb.pulse(r, 'squeal', 0.7);
        },
        tick: (rr, ee, tt) => {
          decay(tt);
          const B = [0.7, 1.55];
          if (b < B.length && tt > B[b]) { swing(d, 1, 'slap'); const bb = b; setTimeout(() => hit(1, true), 130); b += 1; }
          if (tt > 2.85 && !Q.gone) { Q.gone = true; FX.cut(0.9); d.g.visible = false; K.amb.pulse(r, 'squeal', 0.5); }
        },
        says: [[DIC, 'Wake up!', 1.3], [DIC, 'WAKE UP!', 1.2]]
      })
    ];
    try { await r.cinematic(shots); } finally { off(); }
    d.g.visible = false; d.bash = 0; d.bashKind = null;
    // охранник-«кулак» исчезает, остальная охрана продолжает
    e.dead = true; e.alive = false; e.n.free = true; e.n.g.visible = false;
    const cb = r.cb; let i = cb.enemies.indexOf(e); if (i >= 0) cb.enemies.splice(i, 1); i = cb.shoot.indexOf(e); if (i >= 0) cb.shoot.splice(i, 1);
    FX.to('acid', 0.5);
  }

  // ------------------------------------------------------------------ финал красной комнаты: все взрывается, охрана окружает игрока и бьёт по лицу
  async function ringScene(Z) {
    const r = Z.r, R = Z.R, p = r.p, FX = K.flash(r), px = p.x, pz = p.z;
    const ring = [], N = 9;
    let base = rnd(0, PI * 2);
    for (let t = 0; t < 12; t += 1) {                                           // ориентация кольца: чтобы передняя дуга стояла на свободном месте
      const a = rnd(0, PI * 2); let ok = true;
      for (let k = -2; k <= 2; k += 1) { const x = px + Math.sin(a + k * 0.5) * 1.5, z = pz + Math.cos(a + k * 0.5) * 1.5; if (!K.ally.free(r, x, z, 0.3)) ok = false; }
      if (ok) { base = a; break; }
    }
    const fx = Math.sin(base), fz = Math.cos(base);
    const Q = { u: -1, who: null, side: 1, kx: 0, kp: 0, last: 0, w: 0, cam: null };
    const off = K.hook(r, (dt) => {
      if (Q.u >= 0 && Q.who) {
        Q.u += dt / 0.3; Q.w = Math.min(1, Math.sin(Math.min(1, Q.u) * PI) * 1.8);
        strike(r, Q.who, Q.side, Math.min(1, Q.u), Q.cam, 'slap', Q.w);
        if (Q.u >= 1) Q.u = -1;
      }
    });
    // бьёт один из двух боковых передних охранников (средний заслонил бы руку своим торсом): рука идёт от его стороны через центр кадра
    const slapBy = (g) => {
      const dx = g.g.position.x - px, dz = g.g.position.z - pz, sd = Math.hypot(dx, dz) || 1;
      Q.cam = [px, EYE, pz, dx / sd, dz / sd, fx, fz, sd];
      Q.side = (dx * -fz + dz * fx) >= 0 ? 1 : -1; Q.who = g; Q.u = 0;
      return Q.side;
    };
    const ev = [];
    let nx = 0.9, gap = 0.95;
    for (let i = 0; i < 12; i += 1) { ev.push(nx); nx += gap; gap = Math.max(0.42, gap * 0.9); }
    const blasts = [2.2, 3.6, 4.8, 5.8, 6.6, 7.3, 7.9, 8.4, 8.8];
    let ei = 0, bi = 0, whiteOn = false;
    const DUR = 10.4;
    const shot = sh({
      at: [px, EYE, pz], to: [px - fx * 0.15, EYE - 0.08, pz - fz * 0.15], look: () => [px + fx * 1.4, EYE - 0.02, pz + fz * 1.4], fov: 70, fovTo: 52, roll: 0, rollTo: 0.22, dur: DUR, hand: 1.5, tense: 1.6, push: 0, frame: 0, dockIn: true,
      run: () => {
        if (r.cineSkip) return;
        FX.cut(1); FX.to('red', 0.3); FX.amount(1, 0.5); FX.swimK = 1.6;
        r.clearEnemies();
        for (let i = 0; i < N; i += 1) {
          const front = i < 3, a = base + (front ? (i - 1) * 0.42 : PI * 0.5 + (i - 3) * (PI * 1.5 / (N - 3))), rad = front ? 1.05 : 2.6 + (i % 2) * 0.7;
          const x = px + Math.sin(a) * rad, z = pz + Math.cos(a) * rad, g = r.npc(x, z, Math.atan2(px - x, pz - z));
          r.actorStyle(g, i % 4 === 3 ? 'heavy' : 'grunt', 'rifle'); g.armT = 0; g.aimK = 0; g.goal = null; ring.push(g);
        }
        K.amb.pulse(r, 'boom', 1); K.amb.pulse(r, 'scream', 0.5);
      },
      tick: (rr, e, tt) => {
        const dt = Math.min(0.05, tt - Q.last); Q.last = tt;
        const k = Math.exp(-dt * 7); Q.kx *= k; Q.kp *= k; kickLook(r, Q.kx, Q.kp);
        while (ei < ev.length && tt > ev[ei]) {                                  // передние охранники бьют по очереди, всё чаще
          const s2 = slapBy(ring[ei % 2 ? 2 : 0]); ei += 1;
          setTimeout(() => {
            Q.kx = s2 * 0.5; Q.kp = -0.1; r.cineJolt && r.cineJolt(1.3); FX.pulse(0.9); K.amb.pulse(r, 'hit', 1); r.snd && r.snd.play('hurt');
          }, 130);
        }
        while (bi < blasts.length && tt > blasts[bi]) {
          bi += 1;
          const a = rnd(0, PI * 2), rad = rnd(6, 11), x = clamp(px + Math.sin(a) * rad, -11.5, 11.5), z = clamp(pz + Math.cos(a) * rad, -14.5, 14.5);
          r.explode(x, 1, z, 9, 90, 'bomb'); R.puff(x, 1.2, z, 5, true); K.amb.pulse(r, 'boom', 1); r.cineJolt && r.cineJolt(1.6); FX.pulse(1); FX.cut(0.5);
        }
        if (tt > DUR - 1.1 && !whiteOn) { whiteOn = true; FX.cut(1); FX.pulse(1); K.amb.pulse(r, 'boom', 1.2); r.fade(1, 0.9); }
      }
    });
    try { await r.cinematic([shot]); } finally { off(); }
    ring.forEach((n) => F.rm(r, n));
    r.clearEnemies();
    R.uncollapse(); R.siren = false;
    Z.over = true;
  }

  // ------------------------------------------------------------------ сама фаза красной комнаты
  function redShots(r) {
    const p = r.p, FX = K.flash(r);
    return [
      sh({ at: [p.x, EYE - 0.55, p.z], to: [p.x, EYE - 0.6, p.z - 0.2], look: [0, 0.35, p.z - 1.2], lookTo: [-0.5, 0.5, p.z - 1.4], fov: 84, fovTo: 86, roll: 0.3, rollTo: 0.22, dur: 1.5, hand: 1.6, tense: 1.2, push: 0, frame: 0,
        run: () => { FX.to('acid', 0.3); FX.amount(1, 0.4); FX.edge = 0.75; FX.iri = 0.9; FX.cut(0.8); K.amb.pulse(r, 'heart', 0.8); } }),
      sh({ at: [p.x, EYE - 0.4, p.z], to: [p.x, EYE, p.z], look: [-2.2, EYE - 0.1, p.z - 6], lookTo: [0.4, EYE, p.z - 8], fov: 86, fovTo: r.baseFov, roll: 0.22, rollTo: 0, dur: 1.9, hand: 1.4, tense: 1.0, dock: true, ease: 'out', push: 0, frame: 0,
        run: () => { K.amb.pulse(r, 'squeal', 0.4); } })
    ];
  }

  async function redFight(r, W, T) {
    redEnd(r);
    K.lock(r);
    await r.clearEnemies();
    const R = W.enter('red', 0, 12.5, 0);
    R.uncollapse(); R.siren = false;
    r.p.x = 0; r.p.z = 12.5; r.p.yaw = 0; r.p.pitch = 0; r.spawnPt = [0, 12.5, 0];
    T.d.g.visible = T.g.g.visible = false;
    K.hpFloor(r, 1);
    K.suitMode(r, true); K.suitFov(r, 102, 0.4);
    K.stress(r, 0.9, 1);
    K.amb.set(r, 'red', { fade: 0.3 });
    const mq = r.q.maxEnemies;
    const Z = r.f48red = { r, W, T, R, t: 0, t0: r.time, started: false, trk: null, wave: -1, spawned: 0, dirT: 0.4, expT: 0, col: false, ringed: false, over: false, dead: false, offs: [], qk: mq <= 6 ? 0.5 : mq <= 9 ? 0.72 : 1,
      Tp: rnd(100, SONG - 52), punch: null, punchDone: false };
    R.onSlab = (s, kind) => { if (kind === 'break') K.amb.pulse(r, 'clank', 0.5); };
    r.fade(0, 0.2);
    await r.cinematic(redShots(r));
    Z.t0 = r.time;
    const FXr = K.flash(r); FXr.to('acid', 1.2); FXr.amount(0.95, 1.2); FXr.edge = 1; FXr.iri = 1; FXr.swimK = 3.6; K.warp(r, 0.68, 0.8);           // в бою переливающаяся краска только по краям экрана — центр чистый, стрелять видно
    for (let i = 0; i < 3; i += 1) redSpawn(Z, { los: true, min: 11 });
    K.unlock(r);
    r.objective('SURVIVE');
    Z.offs.push(K.hook(r, (dt) => redTick(Z, dt)));
    await r.until(() => Z.over || Z.dead);
    Z.keepTrack = false;
    redEnd(r);
  }

  // ================================================================== 5. ПРОБУЖДЕНИЕ ПЕРЕД ДВЕРЬЮ HEAD
  function wakeShots(r, W, T) {
    const d = T.d, g = T.g, FX = K.flash(r), R = W.R.dark;
    const Q = { lean: 0, ph: 0, u: -1, side: 1, w: 0, crouch: false };
    // Диктор присел над лежащим игроком (иначе рука до лица не достаёт); кадр смещён: Диктор справа, рука идёт через центр
    const WCAM = [0.05, 0.8, 294.8, -0.07, 1, 0.35, 0.94, 0.8];
    const off = K.hook(r, (dt) => {
      if (r.disposed) return;
      Q.ph += dt;
      if (Q.crouch) F.sit(d, { hy: 0.62, sx: Q.lean * 0.75, lx: -1.3, kn: 1.6 });
      else d.spine.rotation.x += Q.lean * 0.75;
      d.head.rotation.x += Q.lean * 0.2;
      if (Q.u >= 0) {
        Q.u += dt / 0.32; Q.w = Math.min(1, Math.sin(Math.min(1, Q.u) * PI) * 1.8);
        strike(r, d, 1, Math.min(1, Q.u), WCAM, 'slap', Q.w);
        if (Q.u >= 1) Q.u = -1;
      }
    });
    let b = 0, last = 0, kx = 0, kp = 0, stood = false;
    const decay = (tt) => { const dt = Math.min(0.05, tt - last); last = tt; const k = Math.exp(-dt * 7); kx *= k; kp *= k; kickLook(r, kx, kp); };
    const hit = (side) => { kx = side * 0.55; kp = -0.1; r.cineJolt && r.cineJolt(1.4); FX.pulse(1); K.amb.pulse(r, 'hit', 1); r.snd && r.snd.play('hurt'); };
    return {
      off,
      shots: [
        // 1. глаза открываются: лампы потолка, звон, лицо Диктора склоняется
        sh({
          at: [0.05, 0.16, 294.7], to: [0.05, 0.2, 294.8], look: [0, 3.4, 296.5], lookTo: [0, 1.7, 296.7], fov: 78, fovTo: 66, roll: 0.2, rollTo: 0.05, dur: 4.6, hand: 1.2, tense: 0.8, push: 0, frame: 0,
          says: [[DIC, 'That bastard let animal gas in on us.', 2.3], [DIC, 'We were all knocked out cold.', 2.0]],
          run: () => {
            darkSetup(r, W, T, 295.0, PI);
            K.amb.level(r, 0.6);
            put(d, 0.0, 296.5, PI); put(g, 1.3, 297.6, PI + 0.4); d.g.visible = g.g.visible = true; d.armT = 0; g.armT = 0;
            FX.to('dull', 0.3); FX.amount(0.9, 0.2); FX.cut(0.7); FX.off(3.4); FX.swimK = 1.2;
            r.fade(0, 1.4);
          },
          tick: (rr, e, tt) => { if (tt > 1.4) Q.lean = Math.min(0.6, Q.lean + 0.012); decay(tt); }
        }),
        // 2. пощёчины, «Get up»
        sh({
          at: [0.05, 0.2, 294.8], to: [0.05, 0.22, 294.8], look: [0.5, 1.2, 295.9], fov: 66, fovTo: 62, roll: 0.05, rollTo: 0.1, dur: 3.6, hand: 1.5, tense: 1.4, push: 0, frame: 0,
          run: () => { b = 0; last = 0; put(d, 0.0, 295.55, PI); Q.crouch = true; Q.lean = 0.6; },
          tick: (rr, e, tt) => {
            decay(tt);
            const B = [0.5, 1.5];
            if (b < B.length && tt > B[b]) { Q.u = 0; setTimeout(() => hit(1), 130); b += 1; }
          },
          says: [[DIC, 'Get up.', 1.2], [DIC, 'GET UP!', 1.4]]
        }),
        // 3. встаёт: камера поднимается с пола, Диктор отходит; впереди дверь
        sh({
          at: [0.05, 0.22, 294.8], to: [0, EYE, 294.9], look: [0, 1.5, 296.6], lookTo: [0, EYE + 0.1, 301], fov: 62, fovTo: r.baseFov, roll: 0.1, rollTo: 0, dur: 4.2, hand: 1.0, tense: 0.6, dock: true, ease: 'out', push: 0, frame: 0,
          run: () => {
            Q.lean = 0; Q.crouch = false; r.p.x = 0; r.p.z = 294.9; r.p.yaw = PI; r.p.pitch = 0; K.warp(r, 0, 3.5);
            K.ally.goto(r, d, [-1.5, 297.8], 1.3); K.ally.goto(r, g, [1.5, 297.7], 1.3);
          }
        })
      ]
    };
  }

  // ================================================================== ФАЗА
  const ORDER = ['start', 'reality', 'walk', 'rage', 'red', 'wake'];
  PH.flash = async function (r, ctx) {
    const W = ctx.W, st = K.st(r), from = ctx.from || 'start';
    const at = (k) => ORDER.indexOf(from) <= ORDER.indexOf(k);
    const T = st.team || await K.makeTeam(r, { D: [-2.2, 241.0, 0], G: [2.2, 241.6, 0] });
    const d = T.d, g = T.g, fov0 = r.baseFov;
    K.lock(r);
    await r.clearEnemies();
    if (r.f48blackEl) K.black(r, 0, 0);                                           // повтор фазы после смерти: чёрный слой с прошлой попытки не должен остаться
    r.xfTint = true; r.noFight = true; st.suit = true;
    K.flash(r).edge = 0; K.flash(r).iri = 0;
    [d, g].forEach((n) => { if (!n.suitMeshes) F.suit(r, n); });
    redEnd(r);
    const FX = K.flash(r);
    K.warp(r, ORDER.indexOf(from) <= ORDER.indexOf('reality') ? 0.6 : 0.4, 1.2);
    const deepSetup = () => {
      const R = W.enter('deep', 0, 241.2, 0);
      R.door.set(0); R.alarm = false; K.css(); K.amb.set(r, 'none', { fade: 0.2 });
      r.p.x = 0; r.p.z = 241.2; r.p.yaw = 0; r.p.pitch = 0; r.spawnPt = [0, 241.2, 0];
      put(d, -1.9, 239.6, 0); put(g, 1.9, 239.9, 0); d.g.visible = g.g.visible = true;
    };
    if (at('start') && from !== 'start') { /* прыжок: остальные блоки сами готовят сцену */ }
    // ---------------------------------------------------------- 1. дверь «083» и монтаж воспоминаний
    if (from === 'start') {
      deepSetup(); r.fade(0, 0.3);
      d.g.visible = g.g.visible = false;
      FX.swimK = 1.8;                                                         // зрение плывёт сильнее
      const mon = FL.montageShots(r, W, { count: ctx.count });
      const shots = FL.stareShots(r, W, T).concat(mon.shots);
      const last = mon.shots[mon.shots.length - 1], lt = last.tick;
      let fd = false;
      last.tick = (rr, e, tt, dur) => { lt && lt(rr, e, tt, dur); if (tt > dur - 0.5 && !fd) { fd = true; r.fade(1, 0.45); } };
      try { await r.cinematic(shots); } finally { mon.M.dispose(); }
      FX.off(0.1);
    }
    // ---------------------------------------------------------- 2. «реальность»: Диктор у двери, толчок, удар по двери, подъём в тёмном коридоре
    if (at('reality')) {
      if (from !== 'start') { deepSetup(); r.fade(0, 0.2); }
      K.warp(r, 0.38, 1.0); FX.swimK = 1.3;
      const rs = FL.realityShots(r, W, T);
      try { await r.cinematic(rs.shots.concat([FL.riseShot(r, W, T)])); } finally { rs.off(); }
      FX.off(0.3);
      darkSetup(r, W, T, 247.6, PI);
      d.g.visible = g.g.visible = true;
      r.baseFov = fov0;
    } else if (from === 'walk' || from === 'rage') {
      darkSetup(r, W, T, from === 'rage' ? 266.0 : 247.6, PI);
      put(d, -0.5, from === 'rage' ? 270.2 : 250.6, 0); put(g, 0.6, from === 'rage' ? 271.4 : 251.6, 0); d.g.visible = g.g.visible = true;
      r.fade(0, 0.3);
    }
    K.suitMode(r, true); K.suitFov(r, 102, 0.5);
    // ---------------------------------------------------------- 3. тёмный коридор
    if (at('walk') && !at('rage') || from === 'start' || from === 'reality' || from === 'walk') {
      await darkWalk(r, W, T);
    }
    // ---------------------------------------------------------- 4. вопрос Диктора, ярость, команда исчезает
    if (at('rage') && from !== 'red' && from !== 'wake') {
      K.lock(r); K.warp(r, 0.7, 1.5);
      const rg = FL.rageShots(r, W, T);
      try { await r.cinematic(rg.shots); } finally { rg.off(); }
      FX.swimK = undefined; d.g.visible = g.g.visible = false;
    }
    // ---------------------------------------------------------- 5. красная комната: бой под flashback.m4a
    if (at('red') && from !== 'wake') {
      await r.phase('flashred', async () => { await redFight(r, W, T); }, { pos: [0, 12.5, 0], weapons: ['minigun'], set: () => { } });
      FX.off(0.1); FX.swimK = undefined; FX.edge = 0; FX.iri = 0;
      const Z0 = r.f48red; Z0 && redEnd(r);
      K.lock(r);
      await K.black(r, 1, 0.2);
      await wait(r, 1.2);
    }
    // ---------------------------------------------------------- 6. пробуждение, дверь HEAD
    if (at('wake')) {
      if (from === 'wake') { K.hpFloor(r, 1); r.fade(1, 0); }
      // K.black() (красная комната) — отдельный слой .f48-black поверх .m-fade; раньше он так и оставался непрозрачным, и экран был чёрным всё пробуждение
      // и после него. Теперь снимаем его мгновенно, а «глаза открываются» через обычный .m-fade (первый шот делает fade(0, 1.4)).
      K.cutFade(r, 1); K.black(r, 0, 0);
      K.warp(r, 0.45, 0.4);
      K.lock(r);
      const wk = wakeShots(r, W, T);
      try { await r.cinematic(wk.shots); } finally { wk.off(); }
      FX.off(0.4); FX.swimK = undefined;
      r.f48floorOff && r.f48floorOff();
      r.baseFov = fov0;
      K.suitMode(r, true); K.suitFov(r, 102, 0.5);
      K.unlock(r); r.fade(0, 0.3);
      const R = W.R.dark;
      let opened = false;
      r.objective('OPEN THE DOOR');
      r.interact({ pos: [0, 1.4, R.headAt[1] + 0.9], label: 'OPEN', reach: 2.6, enabled: () => !opened, use: () => { opened = true; } });
      await r.beacon(R.headAt[0], R.headAt[1] + 0.9, 'HEAD', 2.2);
      await r.until(() => opened);
      r.waypoint && r.waypoint(null);
      K.ally.stop(d); K.ally.stop(g);
    }
    st.flashDone = true;
    K.lock(r);
  };
}());
