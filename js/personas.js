// NEXA: личности врагов — 10 архетипов поверх базовых типов (grunt / rusher / heavy). Описание: BOT_PERSONALITIES.md
// Модуль даёт каждому врагу: параметры боя (e.t — копия типа с правками), стиль позы/походки (n.ps, читает actors.js),
// тактику (persTick — вызывается из combat.js каждый кадр), реакции на попадания / смерти союзников, ближний контакт.
// Озвучки нет: личность читается по телу, ритму стрельбы и поведению.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.actors || !C.actors.PS0) return;
  const { Run } = C;
  const EYE = C.EYE || 1.6;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sgn = () => (Math.random() < 0.5 ? -1 : 1);
  const hyp = Math.hypot;

  // ------------------------------------------------------------------ вспомогательное
  const bnd = (r, x, z) => { const b = r.bounds; return !b || (Math.abs(x - b.cx) < b.w / 2 - 0.6 && Math.abs(z - b.cz) < b.d / 2 - 0.6); };
  const free = (r, x, z) => bnd(r, x, z) && !r.blockedE(x, z);
  const hostile = (q) => !q.dead && !q.friendly && !q.t.passive;
  const near = (r, e, rad, f) => { const out = []; for (const q of r.cb.enemies) if (q !== e && hostile(q) && hyp(q.x - e.x, q.z - e.z) < rad && (!f || f(q))) out.push(q); return out; };

  // поиск укрытия: точка H, откуда игрока не видно, и точка выглядывания K рядом, откуда видно
  function findCover(r, e) {
    const g = e.n.g.position, p = r.p, T = e.t;
    let best = null, bs = 1e9;
    for (let k = 0; k < 18; k += 1) {
      const a = (k / 18) * Math.PI * 2 + rnd(-0.15, 0.15), rr = rnd(2.2, 7);
      const x = g.x + Math.sin(a) * rr, z = g.z + Math.cos(a) * rr;
      if (!free(r, x, z) || !r.hasLOS(g.x, 0.5, g.z, x, 0.5, z)) continue;   // дойти напрямую можно
      if (r.hasLOS(x, 0.95, z, p.x, EYE, p.z)) continue;                       // из присяда игрока не видно
      const dpx = hyp(p.x - x, p.z - z); if (dpx < Math.min(T.rmin, 5)) continue;
      const dx = p.x - x, dz = p.z - z, tx = -dz / dpx, tz = dx / dpx;
      let pk = null;
      for (const sd of [1, -1]) {
        for (const d of [0.9, 1.4, 2]) {
          const qx = x + tx * sd * d, qz = z + tz * sd * d;
          if (free(r, qx, qz) && r.hasLOS(x, 0.5, z, qx, 0.5, qz) && r.hasLOS(qx, 1.5, qz, p.x, EYE, p.z)) { pk = [qx, qz]; break; }
        }
        if (pk) break;
      }
      if (!pk) continue;
      const sc = rr + Math.abs(dpx - (T.rmin + T.rmax) / 2) * 0.35;
      if (sc < bs) { bs = sc; best = { h: [x, z], k: pk }; }
    }
    return best;
  }

  // цикл «укрытие → выглянул → очередь → назад» (профессионал, офицер без свиты, техник); op: {mag, hide:[a,b], rel}
  function coverTick(r, e, s, o, dt, dist, op) {
    const g = e.n.g.position, n = e.n, now = r.time, cb = r.cb, T = e.t;
    const c = s.c || (s.c = { st: 'open', t: 0, lastLos: now, cov: null, dst: null, next: null, fired: false, nf: 0 });
    c.t += dt;
    if (e.los) c.lastLos = now;
    if (c.st !== 'reload' && (s.shots || 0) >= op.mag) { s.shots = 0; if (c.cov && c.st !== 'go') { c.st = 'go'; c.dst = c.cov.h; c.next = 'reload'; c.t = 0; } else { c.st = 'reload'; c.t = 0; } }
    switch (c.st) {
      case 'open': {
        o.cv = 0;
        if (((e.los && dist < T.rmax + 6) || s.hurtT > 0) && now >= c.nf && (cb.coverAt || 0) <= now) {
          cb.coverAt = now + 0.12; c.nf = now + 1.6;
          const f = findCover(r, e);
          if (f) { c.cov = f; c.st = 'go'; c.dst = f.h; c.next = 'hide'; c.t = 0; }
        }
        break;
      }
      case 'go': {
        o.mv = c.dst; o.spd = 1.4; o.fire = false; o.cv = c.next === 'peek' ? 0 : 0.2;
        if (hyp(c.dst[0] - g.x, c.dst[1] - g.z) < 0.4) { c.st = c.next; c.t = 0; c.hideT = rnd(op.hide[0], op.hide[1]); c.fired = false; }
        else if (c.t > 3.2) { c.st = 'open'; c.t = 0; c.cov = null; }
        break;
      }
      case 'hide': {
        o.freeze = true; o.aim = 0; o.cv = 1;
        if (c.t > c.hideT) {
          if (c.cov && r.hasLOS(c.cov.k[0], 1.5, c.cov.k[1], r.p.x, EYE, r.p.z)) { c.st = 'go'; c.dst = c.cov.k; c.next = 'peek'; c.t = 0; }
          else if ((cb.coverAt || 0) <= now) {
            cb.coverAt = now + 0.12;
            const f = findCover(r, e);
            if (f) { c.cov = f; c.st = 'go'; c.dst = f.h; c.next = 'hide'; c.t = 0; }
            else { c.st = 'push'; c.t = 0; c.cov = null; }
          }
        }
        break;
      }
      case 'peek': {
        o.cv = 0; o.want = 0; o.lat = 0;
        if (e.burst > 0 || e.tele > 0) c.fired = true;
        const quick = r.aimK > 0.5 && c.t > 0.6;   // игрок целится — не торчим
        if ((c.fired && e.burst <= 0 && e.tele <= 0) || c.t > (quick ? 0.8 : 3.2) || (s.hurtT > 0 && c.t > 0.5)) { c.st = 'go'; c.dst = c.cov.h; c.next = 'hide'; c.t = 0; }
        break;
      }
      case 'reload': {
        o.freeze = true; o.aim = 0; o.cv = 0.7; n.rel = clamp(c.t / op.rel, 0, 1);
        if (c.t >= op.rel) { n.rel = 0; c.st = 'hide'; c.t = 0; c.hideT = 0.3; }
        break;
      }
      case 'push': { // игрок засел — давим напролом (стандартное движение к игроку)
        o.spd = 1.15; o.cv = 0;
        if (e.los || c.t > 5) { c.st = 'open'; c.t = 0; c.nf = now + 1; }
        break;
      }
      default: break;
    }
    if (c.st !== 'reload' && n.rel) n.rel = 0;
    if (c.st === 'open' && now - c.lastLos > 7 && (!e.los)) { c.st = 'push'; c.t = 0; c.lastLos = now; }
  }

  // ближний контакт: у каждой личности свой удар (style — вариант анимации в actors.js)
  function closeReact(r, e, s, o, dt, dist) {
    const c = e.t.close, n = e.n, g = n.g.position;
    if (!c || e.t.melee) return;
    s.cc = Math.max(0, (s.cc || 0) - dt);
    if (s.bash > 0) {
      s.bash -= dt; o.freeze = true; o.aim = 1; n.bash = clamp(1 - s.bash / 0.34, 0, 1);
      if (s.bash <= 0) {
        n.bash = 0; s.cc = c.cd;
        if (hyp(r.p.x - g.x, r.p.z - g.z) < c.reach + 0.35 && !(r.pmMelee && r.pmMelee(e, c.dmg, g.x, g.z))) {
          r.hurt(c.dmg, g.x, g.z); r.kick(-0.03, sgn() * 0.03, sgn() * 0.05, c.shake || 0.03);
        }
        if (c.back) s.retreat = c.back;
      }
      return;
    }
    if (dist < c.reach && s.cc <= 0 && e.spawnT <= 0) { s.bash = 0.34; n.bashKind = c.style; e.burst = 0; e.tele = 0; o.freeze = true; }
  }

  // лазерный целеуказатель снайпера: честное предупреждение перед выстрелом
  function laser(r, e, on, k) {
    const n = e.n; let m = n.laser;
    if (!on) { if (m) m.visible = false; return; }
    if (!m) {
      m = n.laser = new THREE.Mesh(r.g.box, new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.4, depthWrite: false, fog: false }));
      m.frustumCulled = false; r.scene.add(m);
    }
    const g = n.g.position, H = r.pmHd ? r.pmHd() : null, p = r.p;
    const tx = H ? H[0] : p.x, ty = (H ? H[1] : EYE) - 0.2, tz = H ? H[2] : p.z;
    const oy = 1.35 * e.t.scale * (1 - 0.25 * (n.cv || 0)), dx = tx - g.x, dy = ty - oy, dz = tz - g.z, l = hyp(dx, dy, dz) || 1;
    m.visible = true; m.material.opacity = 0.25 + 0.6 * k;
    m.position.set(g.x + dx / 2, oy + dy / 2, g.z + dz / 2); m.scale.set(0.014 + 0.01 * k, 0.014 + 0.01 * k, l); m.lookAt(tx, ty, tz);
  }

  // ------------------------------------------------------------------ 10 личностей
  // k — множители числовых полей типа (hp — здоровье), t — абсолютные значения, ps — стиль тела (actors.js), close — реакция на ближний контакт
  const PERS = {
    panic: {
      name: 'PANICKER', k: { hp: 0.8, speed: 1.3 }, scale: 0.97,
      t: { rmin: 3, rmax: 11, burst: [3, 5], rate: 0.09, cd: [0.5, 1.1], acc: 0.26, tele: 0.15, fireMove: 0.8, strafeK: 0.95, stT: [0.3, 0.8], close: { reach: 1.5, dmg: 6, cd: 1.1, style: 'shove' } },
      ps: { lean: 0.1, gait: 1.15, rate: 1.35, bob: 1.4, sway: 1.5, twitch: 0.1, flinch: 1.5, idle: 'jitter', hip: 0.8 },
      tick(r, e, s, o, dt) {
        s.spike = Math.max(0, (s.spike || 0) - dt);
        if (s.spike > 0) { o.spd = 1.35; o.acc = 0.7; o.lat = 1.3; }                   // вспышка паники: рвётся вперёд и поливает
        if (!s.broke && e.hp < e.max * 0.35) { s.broke = true; s.brk = 3.5; }
        if (s.brk > 0) { s.brk -= dt; o.want = -1; o.spd = 1.25; o.acc = 0.5; o.cv = 0.5; } // сломался: пятится, стреляя от бедра, пригнувшись
      }
    },
    sadist: {
      name: 'SADIST', k: { hp: 1.1, speed: 0.9 },
      t: { rmin: 4, rmax: 9, burst: [1, 2], rate: 0.32, cd: [1.4, 2.6], acc: 0.5, tele: 0.65, fireMove: 0.15, strafeK: 0.35, stT: [2, 4], close: { reach: 1.6, dmg: 13, cd: 0.9, style: 'bash' } },
      ps: { lean: 0.12, gait: 0.92, rate: 0.82, bob: 1.2, sway: 1.3, head: 0.22, flinch: 0.6, idle: 'twirl', oneHand: true },
      tick(r, e, s, o, dt, dist) {
        const n = e.n, low = r.hp < r.maxHp * 0.5;
        if (low) { // игрок ранен — добивание вплотную
          o.want = dist > 1.3 ? 1 : 0; o.spd = 1.7; o.fire = dist > 5; o.dmg = 1.15;
        } else {
          o.dmg = 0.75;                                                                   // играет с жертвой: бьёт слабее, пока она здорова
          s.tc = (s.tc === undefined ? rnd(4, 7) : s.tc) - dt;
          if (s.tc <= 0 && e.los && dist > 3.5) { s.tc = rnd(7, 10); s.tt = 1.1; }
          if (s.tt > 0) { s.tt -= dt; o.fire = false; o.spd = 0.3; n.taunt = Math.sin(Math.PI * clamp(1 - s.tt / 1.1, 0, 1)); } else n.taunt = 0;
        }
      }
    },
    pro: {
      name: 'PROFESSIONAL', k: { hp: 1, speed: 1.15 }, helmet: true,
      t: { rmin: 7, rmax: 15, burst: [2, 3], rate: 0.12, cd: [0.8, 1.5], acc: 0.58, tele: 0.28, fireMove: 0.1, strafeK: 0.5, stT: [0.5, 1.1], close: { reach: 1.7, dmg: 9, cd: 0.9, style: 'jab', back: 1.6 } },
      ps: { lean: 0.08, gait: 1, rate: 1.05, flinch: 0.7, idle: 'scan' },
      tick(r, e, s, o, dt, dist) { coverTick(r, e, s, o, dt, dist, { mag: 24, hide: [0.7, 1.7], rel: 1.9 }); }
    },
    lazy: {
      name: 'SLACKER', k: { hp: 1.3, speed: 0.6 },
      t: { rmin: 8, rmax: 13, burst: [1, 2], rate: 0.28, cd: [2.2, 3.8], acc: 0.38, tele: 0.9, fireMove: 0.1, strafeK: 0.2, stT: [2.5, 4.5], stag: 0.1, close: { reach: 1.5, dmg: 8, cd: 1.6, style: 'shove' } },
      ps: { lean: -0.07, gait: 0.78, rate: 0.72, bob: 0.6, sway: 1.4, flinch: 0.5, idle: 'yawn', oneHand: true, hip: 0.6 },
      tick(r, e, s, o, dt, dist) {
        if (e.los && !s.seen) { s.seen = true; s.rt = 1.1; }                              // реакция с опозданием: сначала смотрит, потом стреляет
        if (s.rt > 0) { s.rt -= dt; o.freeze = true; o.aim = 0; }
        if (!e.los) { s.nl = (s.nl || 0) + dt; if (s.nl < 9) o.want = 0; } else s.nl = 0;  // без видимости стоит на месте — лень идти
        if (s.rage > 0) { s.rage -= dt; o.spd = 1.5; o.acc = 1.25; o.cdK = 0.5; }       // «разбудили» попаданием — злится
      }
    },
    zealot: {
      name: 'ZEALOT', k: { hp: 0.9, speed: 1.25 },
      t: { rmin: 0, rmax: 6, burst: [2, 4], rate: 0.1, cd: [0.6, 1.2], acc: 0.4, tele: 0.1, fireMove: 0.85, strafeK: 0.15, stT: [1, 2], stag: 0.05, close: { reach: 1.6, dmg: 11, cd: 0.8, style: 'jab', shake: 0.04 } },
      ps: { lean: 0.34, gait: 1.1, rate: 1.15, sway: 0.8, flinch: 0.3, idle: 'rigid', twitch: 0.03 },
      tick(r, e, s, o, dt, dist) {
        const rg = s.rage = Math.max(0, (s.rage || 0) - dt * 0.04);                       // ярость растёт от гибели союзников
        o.spd = 1 + 0.1 * rg; o.acc = 1 + 0.05 * rg; o.cdK = 1 / (1 + 0.15 * rg);
        o.want = dist > (rg >= 2 ? 2.2 : 3.5) ? 1 : 0; if (rg >= 3) o.fire = dist > 3.5; // в ярости забывает про огонь и идёт врукопашную
        e.n.ps.twitch = 0.03 + 0.02 * rg;
      }
    },
    stunned: {
      name: 'SHELL-SHOCKED', k: { hp: 1, speed: 0.75 },
      t: { rmin: 5, rmax: 12, burst: [1, 3], rate: 0.2, cd: [1.2, 2.4], acc: 0.22, tele: 0.5, fireMove: 0.4, strafeK: 0.5, stT: [0.6, 1.6], stag: 0.3, close: { reach: 1.7, dmg: 8, cd: 1.3, style: 'wild' } },
      ps: { lean: 0.04, gait: 0.85, rate: 0.8, wobble: 1, limp: 0.35, twitch: 0.05, flinch: 1.8, idle: 'sway', head: 0.15, oneHand: true, hip: 0.5 },
      tick(r, e, s, o, dt) {
        const g = e.n.g.position, n = e.n, now = r.time;
        if (s.mx === undefined) { s.mx = r.p.x; s.mz = r.p.z; s.mt = 0; s.nd = rnd(1.5, 3); s.dz = 0; }
        s.mt -= dt; if (s.mt <= 0) { s.mt = 0.55; s.mx = r.p.x; s.mz = r.p.z; }
        o.yaw = Math.atan2(s.mx - g.x, s.mz - g.z) + Math.sin(now * 1.7 + n.seed) * 0.3; // видит игрока с запозданием и «плавает»
        o.lat = 1 + Math.sin(now * 0.9 + n.seed) * 1.2; o.spd = 0.6 + 0.8 * (0.5 + 0.5 * Math.sin(now * 1.3 + n.seed));
        if (s.dazeT > 0) { s.dazeT -= dt; o.freeze = true; o.fire = false; o.aim = 0; n.daze = Math.min(1, s.dazeT * 4); }   // схватился за голову
        else { n.daze = 0; s.nd -= dt; if (s.nd <= 0) { s.nd = rnd(3, 5.5); s.dazeT = rnd(0.9, 1.5); } }
      }
    },
    sniper: {
      name: 'SNIPER', k: { hp: 0.8, speed: 0.9 }, gun: 'rifle', scale: 1.04,
      t: { rmin: 14, rmax: 30, burst: [1, 1], rate: 0.1, cd: [2.2, 3.4], acc: 0.82, dmg: 22, tele: 1.1, teleMove: 0, fireMove: 0, strafeK: 0, stT: [3, 5], close: { reach: 1.8, dmg: 9, cd: 1.5, style: 'kick', back: 3, shake: 0.05 } },
      ps: { gait: 0.85, rate: 0.9, bob: 0.5, sway: 0.4, flinch: 0.6, idle: 'still' },
      tick(r, e, s, o, dt, dist) {
        const n = e.n, g = n.g.position, T = e.t;
        const aiming = e.los && e.tele > 0;
        laser(r, e, aiming, aiming ? clamp(1 - e.tele / T.tele, 0, 1) : 0);
        o.cv = (e.tele > 0 || e.burst > 0) ? 0.55 : 0;                                    // на колено перед выстрелом
        if (s.shotT > (s.sc0 || 0) && e.burst <= 0 && !s.sc) {                            // выстрелил — меняет позицию
          s.sc0 = s.shotT;
          const sd = sgn(), dx = r.p.x - g.x, dz = r.p.z - g.z, l = hyp(dx, dz) || 1;
          for (const sg of [sd, -sd]) {
            const px = g.x - dz / l * sg * 4.5, pz = g.z + dx / l * sg * 4.5;
            if (free(r, px, pz) && r.hasLOS(g.x, 0.5, g.z, px, 0.5, pz)) { s.sc = { p: [px, pz], t: 1.6 }; break; }
          }
        }
        if (s.sc) { s.sc.t -= dt; o.mv = s.sc.p; o.spd = 1.6; o.fire = false; o.cv = 0; if (s.sc.t <= 0 || hyp(s.sc.p[0] - g.x, s.sc.p[1] - g.z) < 0.4) s.sc = null; }
        if (r.p.moving < 0.3) o.acc = 1.15;                                                // стоящего игрока выцеливает увереннее
      }
    },
    officer: {
      name: 'OFFICER', k: { hp: 1.2, speed: 0.9 }, gun: 'pistol', helmet: true, scale: 1.04,
      t: { rmin: 8, rmax: 14, burst: [2, 3], rate: 0.14, cd: [1.2, 2], acc: 0.5, tele: 0.35, fireMove: 0.2, strafeK: 0.3, stT: [1.5, 3], close: { reach: 1.6, dmg: 10, cd: 1, style: 'bash' } },
      ps: { lean: -0.03, gait: 0.95, rate: 0.95, flinch: 0.5, idle: 'point', oneHand: true },
      tick(r, e, s, o, dt, dist) {
        const n = e.n, now = r.time, al = near(r, e, 14);
        for (const q of al) q.aura = now + 0.35;                                          // аура командира: союзники рядом быстрее и точнее
        s.ord = Math.max(0, (s.ord || 0) - dt); s.oc = Math.max(0, (s.oc || 0) - dt);
        if (e.los && dist < e.t.rmax + 8 && s.oc <= 0) {                                  // приказ «вперёд!»: жест рукой, союзники ускоряются
          s.oc = 14; s.ord = 1.1; for (const q of near(r, e, 28)) { q.push = now + 5; if (q.hear) q.hear(); }
        }
        n.gest = s.ord > 0 ? Math.sin(Math.PI * clamp(1 - s.ord / 1.1, 0, 1)) : 0;
        if (s.ord > 0) { o.fire = false; o.spd = 0.4; }
        if (al.length >= 1) {                                                             // со свитой — держится позади
          let mine = hyp(r.p.x - e.x, r.p.z - e.z), front = 1e9;
          for (const q of al) front = Math.min(front, hyp(r.p.x - q.x, r.p.z - q.z));
          if (front > mine - 1.5 && s.ord <= 0) o.want = -1;
        } else coverTick(r, e, s, o, dt, dist, { mag: 30, hide: [0.9, 1.8], rel: 2 });
      }
    },
    jugg: {
      name: 'JUGGERNAUT', k: { hp: 1.4, speed: 0.85 }, scale: 1.4,
      t: { rmin: 5, rmax: 12, burst: [8, 14], rate: 0.075, cd: [1.6, 2.4], acc: 0.4, tele: 0.5, fireMove: 0.55, strafeK: 0, stT: [2, 3], stag: 0, armor: 0.6, hArmor: 0.8, close: { reach: 2, dmg: 18, cd: 1.4, style: 'ram', shake: 0.08 } },
      ps: { lean: 0.1, gait: 1.2, rate: 0.62, bob: 1.7, sway: 1.8, flinch: 0.12, idle: 'stomp', stomp: 1, hip: 0.7 },
      tick(r, e, s, o, dt, dist) { o.want = (e.los && dist < e.t.rmax * 0.6) ? 0 : 1; }  // неумолимо идёт на игрока, без укрытий
    },
    tech: {
      name: 'ENGINEER', k: { hp: 0.9, speed: 1 }, gun: 'pistol', scale: 0.97,
      t: { rmin: 8, rmax: 13, burst: [2, 3], rate: 0.16, cd: [1.4, 2.2], acc: 0.38, tele: 0.5, fireMove: 0.2, strafeK: 0.3, stT: [1.5, 3], close: { reach: 1.5, dmg: 9, cd: 1.2, style: 'bash' } },
      ps: { lean: 0.05, gait: 1, rate: 1, flinch: 1, idle: 'tinker', oneHand: true },
      tick(r, e, s, o, dt, dist) {
        const n = e.n, g = n.g.position, now = r.time;
        s.rc = Math.max(0, (s.rc || 0) - dt);
        const stop = () => { s.rep = 0; n.work = 0; n.holster = false; n.gunG.visible = !!n.gunKind && !!n.gunCur; };
        if (s.rep > 0) {                                                                  // чинит союзника: кобура, присел, искры
          const q = s.tgt;
          if (!q || q.dead || s.hurtT > 0 || hyp(q.x - g.x, q.z - g.z) > 3.4) { stop(); s.rc = 3; return; }
          s.rep -= dt; o.freeze = true; o.fire = false; o.cv = 0.8; n.work = 1;
          s.sp = (s.sp || 0) - dt; if (s.sp <= 0) { s.sp = 0.22; r.sparks(q.x, 0.9, q.z, 0, 1, 0, 3); }
          if (s.rep <= 0) { q.hp = Math.min(q.max, q.hp + q.max * 0.35); s.reps = (s.reps || 0) + 1; stop(); s.rc = 6; }
          return;
        }
        if ((s.reps || 0) < 3 && s.rc <= 0) {
          let tg = null, bd = 1e9;
          for (const q of near(r, e, 12, (m) => m.hp < m.max * 0.75)) { const d = hyp(q.x - g.x, q.z - g.z); if (d < bd) { bd = d; tg = q; } }
          if (tg) {
            s.tgt = tg;
            if (bd < 2.4) { s.rep = 2.2; n.holster = true; n.gunG.visible = false; return; }
            o.mv = [tg.x, tg.z]; o.spd = 1.25; o.fire = false; return;                     // приоритет №1 — бежит к раненому
          }
        }
        coverTick(r, e, s, o, dt, dist, { mag: 26, hide: [1, 2.2], rel: 2.1 });
      }
    }
  };
  const IDS = Object.keys(PERS);

  // веса выбора личности по базовому типу (чтобы миссии получили разнообразие без правки их данных)
  const WEIGHTS = {
    grunt: [['pro', 3], ['panic', 2], ['sadist', 2], ['lazy', 2], ['zealot', 2], ['stunned', 1], ['sniper', 1], ['officer', 1], ['tech', 1]],
    rusher: [['zealot', 3], ['panic', 2], ['sadist', 1], ['stunned', 1]],
    heavy: [['jugg', 1]]
  };
  const CAP = { sniper: 1, officer: 1, tech: 1, jugg: 3 };

  const PS = C.personas = {
    enabled: !/[?&]pers=0\b/.test(location.search), PERS, IDS,
    pick(r, e) {
      const list = WEIGHTS[e.type]; if (!list) return null;
      const cnt = {}; for (const q of r.cb.enemies) if (q.pr && !q.dead) cnt[q.pr.id] = (cnt[q.pr.id] || 0) + 1;
      const pool = list.filter(([id]) => !CAP[id] || (cnt[id] || 0) < CAP[id]);
      let tot = 0; pool.forEach((p) => { tot += p[1]; });
      let v = Math.random() * tot;
      for (const [id, w] of pool) { v -= w; if (v <= 0) return id; }
      return pool.length ? pool[0][0] : null;
    }
  };

  // ------------------------------------------------------------------ назначение личности врагу
  Run.prototype.persona = function (e, o) {
    if (!PS.enabled || o.pers === false || e.friendly || e.t.passive || e.type === 'boss' || e.type === 'target') return;
    const id = o.pers || PS.pick(this, e), P = PERS[id];
    if (!P) return;
    const n = e.n, def = e.t, T = Object.assign({}, def, P.t || {});
    if (P.k) for (const key in P.k) { if (key === 'hp') { e.hp *= P.k.hp; e.max *= P.k.hp; } else if (def[key] !== undefined) T[key] = def[key] * P.k[key]; }
    if (def.melee) { T.melee = true; delete T.close; }
    if (P.scale && !def.melee) { T.scale = P.scale * (def.scale > 1.2 ? def.scale / 1.25 : 1); e.h = 1.8 * T.scale; e.r = 0.33 * T.scale; e.hr = 0.17 * T.scale; e.hy = 1.6 * T.scale; n.g.scale.setScalar(T.scale); }
    e.t = T;
    if (P.gun && !def.melee && !o.gun) this.setGun(n, P.gun);
    if (P.helmet) n.helmet.visible = true;
    n.ps = Object.assign({}, C.actors.PS0, P.ps || {});
    e.pr = { id, P, s: { shots: 0, hits: 0, hurtT: 0, home: [e.x, e.z] }, out: { spd: 1, fire: true, mv: null, want: undefined, yaw: undefined, freeze: false, aim: undefined, acc: 1, dmg: 1, lat: 1, cdK: 1, cv: 0 } };
  };

  // ------------------------------------------------------------------ кадр личности (вызывается из updateEnemies, пока враг жив и не оглушён)
  Run.prototype.persTick = function (e, dt, dist, dx, dz) {
    const pr = e.pr, s = pr.s, o = pr.out, n = e.n;
    o.spd = 1; o.fire = true; o.mv = null; o.want = undefined; o.yaw = undefined; o.freeze = false; o.aim = undefined; o.acc = 1; o.dmg = 1; o.lat = 1; o.cdK = 1; o.cv = 0;
    s.hurtT = Math.max(0, s.hurtT - dt);
    pr.P.tick(this, e, s, o, dt, dist, dx, dz);
    closeReact(this, e, s, o, dt, dist);
    if (s.retreat > 0) { s.retreat -= dt; if (!o.mv) { o.want = -1; o.spd *= 1.4; } }
    if (o.freeze && (o.aim === 0 || s.bash > 0)) o.fire = false;                       // из укрытия / во время перезарядки и удара не стреляет
    const now = this.time;                                                             // влияние офицера: аура рядом, приказ «вперёд», потеря морали после его гибели
    if (e.aura > now) { o.spd *= 1.12; o.acc *= 1.1; }
    if (e.push > now) o.spd *= 1.2;
    if (e.dem > now) o.acc *= 0.8;
    n.cvT = o.cv;
    const k = n.cv || 0; e.h = 1.8 * e.t.scale * (1 - 0.3 * k); e.hy = 1.6 * e.t.scale * (1 - 0.32 * k);
    e.pm = o;
    return o;
  };

  // выстрел врага (enemyShoot): счётчики магазина и позиции для укрытий / снайпера
  Run.prototype.persShot = function (e) { const s = e.pr.s; s.shots = (s.shots || 0) + 1; s.shotT = (s.shotT || 0) + 1; };

  // попадание по врагу
  Run.prototype.persHit = function (e, amt, head) {
    const s = e.pr.s, id = e.pr.id;
    s.hits += 1; s.hurtT = 0.8;
    if (id === 'panic') s.spike = 1.5;
    else if (id === 'lazy') s.rage = 6;
    else if (id === 'stunned') s.dazeT = Math.max(s.dazeT || 0, 0.55);
  };

  // смерть врага: союзники реагируют (ярость фанатиков, паника новичков, потеря морали без офицера)
  Run.prototype.persKill = function (e) {
    if (e.n.laser) e.n.laser.visible = false;
    if (e.n.holster) { e.n.holster = false; e.n.work = 0; }
    if (e.friendly || e.t.passive || !this.cb) return;
    const now = this.time;
    for (const q of this.cb.enemies) {
      if (q === e || !hostile(q)) continue;
      const d = hyp(q.x - e.x, q.z - e.z);
      if (q.pr && q.pr.id === 'zealot' && d < 25) q.pr.s.rage = Math.min(5, (q.pr.s.rage || 0) + (d < 8 ? 1.6 : 1));
      if (q.pr && q.pr.id === 'panic' && d < 7) q.pr.s.spike = 1.3;
      if (e.pr && e.pr.id === 'officer' && d < 28) q.dem = now + 6;
    }
  };

  PS.spawn = function (r, id, x, z, o) { return r.enemy(PERS[id] && (id === 'jugg') ? 'heavy' : 'grunt', x, z, Object.assign({ pers: id, drop: false }, o || {})); };
}());
