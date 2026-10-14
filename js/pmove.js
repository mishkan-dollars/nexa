// NEXA: движение и ближний бой игрока — присед (C), подкат (C на бегу), наклоны (Z/X), кулаки (F), пинок (V),
// блок / парирование (ПКМ в режиме кулаков), агрессивный бег, тактическая перезарядка, быстрая смена оружия.
// Подключается после toyplay.js (самый внешний слой обёрток Run.prototype); combat.js и missions.js вызывают крючки pm* (pmCam, pmHv, pmWo, pmHands, pmPole, pmMelee, pmAim, pmHd).
// THREE при загрузке модуля не нужен (после миссии он выгружается): все векторы берутся из rg (v1..v4, q1, q2, e).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.Run) return;
  const P = C.Run.prototype, EYE = C.EYE, PI = Math.PI, HP = PI / 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const sm = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const eo = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const ei = (k) => { k = clamp(k, 0, 1); return k * k; };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sgn = () => (Math.random() < 0.5 ? -1 : 1);
  const damp = (k, dt) => 1 - Math.exp(-dt * k);

  const CR_DROP = 0.5, SL_DROP = 0.72;              // на сколько опускается глаз в приседе / подкате (м)
  const LEAN = { off: 0.38, roll: 0.22, offC: 0.42, rollC: 0.26 };
  const PARRY = 0.32;                               // окно парирования после нажатия блока (с)

  // позы кистей: [x, y, z, rx, ry, rz] в системе тела (x вправо, y вверх, вперёд −Z, начало — глаз); это ЗАПЯСТЬЕ, кулак торчит дальше по направлению кисти.
  // rz — крен вокруг оси пальцев (±π/2 — большой палец вверх), rx — подъём пальцев (π/2 — ладонь смотрит вперёд)
  const GUARD = [[-0.2, -0.26, -0.5, 0.85, -0.1, HP], [0.2, -0.3, -0.48, 0.85, 0.1, -HP]];
  const BLOCK = [[-0.09, -0.15, -0.46, 1.3, -0.15, HP * 0.8], [0.09, -0.15, -0.46, 1.3, 0.15, -HP * 0.8]];
  const SPRINT = [[-0.24, -0.42, -0.3, 0.55, 0.1, HP * 0.9], [0.24, -0.42, -0.3, 0.55, -0.1, -HP * 0.9]];
  const LOW = [[-0.22, -0.5, -0.24, 0.35, 0, HP * 0.6], [0.22, -0.5, -0.24, 0.35, 0, -HP * 0.6]];
  const CHIN = [-0.18, -0.2, -0.4, 1.05, -0.1, HP];

  // удары. h — рука (0 левая, 1 правая, 2 обе: левая зеркалит правую), dur — длительность (с), hit — доля времени удара, peak — конец замаха (у тяжёлых до неё идёт зарядка),
  // dmg / rng — урон и дальность, stg — оглушение (с), kn — отбрасывание (м), rd — прибавка к импульсу рэгдолла, tw — скрутка корпуса, mv — множитель скорости ходьбы, cam — толчок камеры при ударе [pitch, yaw, roll, shake],
  // pole — куда смотрит локоть (в системе тела), yaw — взмах камеры ключевыми точками, lunge — [с, до, скорость м/с] рывок вперёд, head — удар в голову, leg — удар ногой, fov — прибавка поля зрения
  // kf — ключевые кадры кисти: [u, x, y, z, rx, ry, rz, плавность отрезка] ('o' — резкий старт, 'i' — разгон, 'io' — плавно)
  const ATK = {
    jab: { h: 0, dur: 0.30, hit: 0.30, dmg: 14, rng: 1.5, stg: 0.45, kn: 0.5, rd: 0, snd: 'punch', tw: -0.05, mv: 0.55, cam: [-0.006, -0.008, 0.012, 0.003],
      kf: [[0, ...GUARD[0], 'io'], [0.14, -0.23, -0.31, -0.43, 0.8, -0.1, 1.45, 'o'], [0.30, -0.09, -0.17, -0.8, 0.14, 0.04, 0.35, 'o'], [0.44, -0.085, -0.17, -0.82, 0.14, 0.04, 0.35, 'io'], [1, ...GUARD[0]]] },
    cross: { h: 1, dur: 0.36, hit: 0.31, dmg: 20, rng: 1.5, stg: 0.6, kn: 0.8, rd: 10, snd: 'punch', tw: 0.16, mv: 0.5, cam: [-0.01, 0.014, -0.016, 0.005], off: CHIN,
      kf: [[0, ...GUARD[1], 'io'], [0.20, 0.27, -0.33, -0.36, 0.6, 0.25, -HP, 'o'], [0.31, 0.07, -0.17, -0.82, 0.12, -0.05, -0.3, 'o'], [0.46, 0.065, -0.17, -0.84, 0.12, -0.05, -0.3, 'io'], [1, ...GUARD[1]]] },
    hook: { h: 1, dur: 0.42, hit: 0.36, dmg: 26, rng: 1.6, stg: 0.8, kn: 1.0, rd: 30, snd: 'punch', tw: 0.2, mv: 0.5, cam: [-0.008, 0.03, -0.03, 0.007], pole: [1, 0.1, 0.2],
      kf: [[0, ...GUARD[1], 'io'], [0.17, 0.46, -0.26, -0.3, 0.1, -0.9, -1.35, 'o'], [0.36, -0.14, -0.12, -0.66, 0.05, 0.75, -1.45, 'o'], [0.52, -0.2, -0.14, -0.62, 0.05, 0.85, -1.45, 'io'], [1, ...GUARD[1]]] },
    hook2: { h: 1, dur: 0.62, hit: 0.45, peak: 0.30, dmg: 34, rng: 1.7, stg: 1.1, kn: 1.5, rd: 45, snd: 'punchheavy', tw: 0.32, mv: 0.45, cam: [-0.016, 0.05, -0.05, 0.012], pole: [1, 0.1, 0.2],
      kf: [[0, ...GUARD[1], 'io'], [0.30, 0.58, -0.32, -0.2, 0.05, -1.15, -1.3, 'o'], [0.45, -0.2, -0.12, -0.68, 0.05, 0.85, -1.5, 'o'], [0.6, -0.32, -0.16, -0.52, 0.05, 1.0, -1.5, 'io'], [1, ...GUARD[1]]] },
    upper: { h: 1, dur: 0.66, hit: 0.45, peak: 0.30, dmg: 38, rng: 1.6, stg: 1.2, kn: 1.2, rd: 40, snd: 'punchheavy', tw: 0.1, mv: 0.45, head: true, cam: [0.045, 0.012, -0.02, 0.012], pole: [0.4, -1, 0.2],
      kf: [[0, ...GUARD[1], 'io'], [0.30, 0.17, -0.62, -0.28, -0.55, -0.1, -0.5, 'o'], [0.45, 0.04, -0.1, -0.62, 1.4, 0, -1.1, 'o'], [0.6, 0.03, -0.04, -0.62, 1.45, 0, -1.1, 'io'], [1, ...GUARD[1]]] },
    elbow: { h: 1, dur: 0.70, hit: 0.43, peak: 0.30, dmg: 42, rng: 1.5, stg: 1.3, kn: 1.4, rd: 55, snd: 'punchheavy', tw: 0, mv: 0.4, head: true, cam: [-0.012, 0.03, 0.05, 0.016], pole: [0.2, 0, -1],
      yaw: [[0, 0], [0.30, -0.95], [0.43, 0.18], [0.62, 0], [1, 0]],
      kf: [[0, ...GUARD[1], 'io'], [0.30, 0.36, -0.32, -0.12, 0.2, -1.0, -1.2, 'o'], [0.43, -0.08, -0.24, -0.16, -0.4, 0.9, -1.3, 'o'], [0.62, -0.1, -0.24, -0.2, -0.4, 0.9, -1.3, 'io'], [1, ...GUARD[1]]] },
    push: { h: 2, dur: 0.40, hit: 0.35, dmg: 8, rng: 1.6, stg: 1.0, kn: 2.2, rd: 0, snd: 'punch', tw: 0, mv: 0.5, open: true, cam: [-0.012, 0, 0, 0.006],
      kf: [[0, ...GUARD[1], 'io'], [0.35, 0.1, -0.15, -0.74, 1.45, 0, -0.3, 'o'], [0.5, 0.1, -0.15, -0.76, 1.45, 0, -0.3, 'io'], [1, ...GUARD[1]]] },
    counter: { h: 2, dur: 0.45, hit: 0.27, dmg: 30, rng: 1.7, stg: 1.5, kn: 2.4, rd: 40, snd: 'punchheavy', tw: 0, mv: 0.5, open: true, cam: [-0.02, 0, 0, 0.012],
      kf: [[0, ...BLOCK[1], 'io'], [0.27, 0.09, -0.15, -0.78, 1.45, 0, -0.3, 'o'], [0.45, 0.09, -0.15, -0.8, 1.45, 0, -0.3, 'io'], [1, ...GUARD[1]]] },
    ram: { h: 1, dur: 0.50, hit: 0.42, dmg: 40, rng: 2.2, stg: 1.0, kn: 3, rd: 60, snd: 'punchheavy', tw: 0.22, mv: 1, lunge: [0.28, 0.5, 5.5], fov: 3.5, cam: [-0.02, 0.02, -0.03, 0.018],
      kf: [[0, ...SPRINT[1], 'io'], [0.2, 0.3, -0.34, -0.28, 0.5, 0.3, -HP, 'o'], [0.42, 0.1, -0.16, -0.86, 0.1, -0.05, -0.3, 'o'], [0.62, 0.1, -0.16, -0.88, 0.1, -0.05, -0.3, 'io'], [1, ...GUARD[1]]] },
    drop: { h: 1, dur: 0.50, hit: 0.40, dmg: 36, rng: 1.4, stg: 1.0, kn: 1.4, rd: 30, snd: 'punchheavy', tw: 0.1, mv: 1, cam: [-0.03, 0.012, -0.02, 0.012], pole: [0.6, -0.3, -0.4],
      kf: [[0, ...GUARD[1], 'io'], [0.25, 0.3, -0.02, -0.25, 0.3, -0.6, -1.0, 'o'], [0.40, 0.04, -0.62, -0.58, 0.9, 0.2, -0.9, 'o'], [0.58, 0.03, -0.66, -0.55, 0.9, 0.2, -0.9, 'io'], [1, ...GUARD[1]]] },
    kick: { leg: true, dur: 0.46, hit: 0.44, dmg: 30, rng: 1.8, stg: 1.0, kn: 1.8, rd: 50, snd: 'kick', mv: 0.5, fov: 5, cam: [0.035, 0.01, 0.025, 0.014] }
  };

  // ------------------------------------------------------------------ состояние и условия
  function S(r) {
    return r.pm || (r.pm = {
      t: 0, k: {}, padLean: 0, r3t: -1, r3L: false, pp: [],
      crouch: false, drop: 0, dv: 0, cr: 0,
      sl: null, slCd: 0, slK: 0,
      lean: 0, leanOff: 0, leanRoll: 0,
      want: false, fists: false, stash: null, fk: 0, bk: 0,
      blk: false, blkAge: 9, ctr: 0,
      atk: null, combo: 0, comboT: 0, buf: 0, pressQ: false, down: false, hold: 0, chg: 0, chgKind: 'hook2', hs: 0, kv: 0,
      exh: 0, nextBr: 0, tw: 0, yawOff: 0, fa: 0, slam: 0, rack: 0, knock: [], mm: 1, torso: null, free: 0, cc: false, wo: [0, 0, 0, 0, 0, 0],
      hand: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]], pole: [[0, 0, 0, 0], [0, 0, 0, 0]], tmp: [0, 0, 0, 0, 0, 0]
    });
  }
  const toyOn = (r) => !!(r.ty && r.ty.s && r.ty.s !== 'none');
  const canMove = (r) => !r.locked && !r.paused && !r.camFree && !r.inCinema && !r.choice && !r.hacking && !r.dead;
  const canFight = (r) => canMove(r) && !!r.cb && !toyOn(r);
  const isRun = (r) => { const K = r.keys || {}; return !!(K.ShiftLeft || K.ShiftRight || r.runHeld || r.padRun); };
  const play = (r, name, k, delay) => { if (r.snd) r.snd.play(name, { k: k === undefined ? 1 : k, delay: delay || 0 }); };

  // ------------------------------------------------------------------ присед, подкат
  function crouchKey(r, s) {
    if (!canMove(r) || s.sl) return;
    if (r.cb && !s.crouch && s.slCd <= 0 && isRun(r) && r.p.moving > 0.3) { slideStart(r, s); return; }
    s.crouch = !s.crouch;
    s.dv += s.crouch ? 1.5 : -1.2;                 // толчок пружины: глаз проваливается ниже цели и возвращается
    play(r, 'rustle', s.crouch ? 1.1 : 0.8);
  }
  function slideStart(r, s) {
    const p = r.p, K = r.keys || {}, pad = r.padMove || { x: 0, y: 0 }, st = r.stick || { x: 0, y: 0 };
    let mz = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0) - st.y - pad.y, mx = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0) + st.x + pad.x;
    const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
    const sn = Math.sin(p.yaw), c = Math.cos(p.yaw);
    s.sl = { t: 0, dur: 0.85, dx: -sn * mz + c * mx, dz: -c * mz - sn * mx, v0: 5.4, hit: false };
    s.crouch = true; s.atk = null; s.chg = 0; s.dv += 0.8;
    r.runHeld = false; r.padRun = false;
    const rb = r.qs && r.qs('.m-run'); if (rb) rb.classList.remove('held');
    play(r, 'slide', 1); r.kick(0.03, 0, 0, 0.01); r.noise && r.noise(7);
  }
  // возвращает true, если подкат сам подвинул игрока (штатный movePlayer тогда пропускается)
  function slideMove(r, s, dt) {
    const sl = s.sl; if (!sl) return false;
    if (!canMove(r)) { s.sl = null; return false; }
    const p = r.p, K = r.keys || {};
    if (K.ArrowLeft) p.yaw += 1.8 * dt;
    if (K.ArrowRight) p.yaw -= 1.8 * dt;
    sl.t += dt;
    const k = clamp(sl.t / sl.dur, 0, 1), v = sl.v0 * Math.pow(1 - k, 1.25), st = v * dt;
    let moved = false;
    const nx = p.x + sl.dx * st, nz = p.z + sl.dz * st;
    if (!r.blocked(nx, p.z)) { p.x = nx; moved = true; }
    if (!r.blocked(p.x, nz)) { p.z = nz; moved = true; }
    if (!moved && sl.t > 0.08) { sl.t = sl.dur; r.kick(-0.02, 0, sgn() * 0.02, 0.01); play(r, 'block', 0.6); }
    p.moving = 0.25;                                // sprintK спадает — стрельба и прицеливание в подкате работают
    if (!sl.hit && r.cb) {                         // сбивает одного врага впереди
      for (const e of r.cb.enemies) {
        if (e.dead || e.friendly || e.t.passive) continue;
        const g = e.n.g, dx = g.position.x - p.x, dz = g.position.z - p.z, d = Math.hypot(dx, dz);
        if (d > 1.15 || (dx * sl.dx + dz * sl.dz) / (d || 1) < 0.55) continue;
        sl.hit = true;
        hitEnemy(r, s, e, { dmg: 28, stg: 1.0, kn: 1.4, rd: 30, head: false, snd: 'kick' }, dx / (d || 1), dz / (d || 1));
        break;
      }
    }
    if (sl.t >= sl.dur) { s.sl = null; s.slCd = 0.6; s.crouch = true; }
    return true;
  }

  // ------------------------------------------------------------------ кулаки: вход и выход
  function setFists(r, s, on) {
    s.fists = on; s.fk = 0;
    if (r.layer) { r.layer.classList.toggle('pm-fist', on); r.layer.classList.toggle('fisting', on); }
  }
  function enterFists(r, s) {
    s.want = true; r.aimWant = false; r.rl = null; r.swapTo = null;
    r.toast && r.toast('FISTS', 0.9);
  }
  function leaveFists(r, s, silent) {
    const had = s.fists || s.want;
    s.want = false; s.atk = null; s.chg = 0; s.blk = false; s.bk = 0; s.hold = 0; s.pressQ = false;
    if (s.fists) {
      setFists(r, s, false);
      if (s.stash && !r.wp) { r.wp = s.stash; r.swapOff = 0.9; if (!silent) play(r, 'draw', 1); }
      r.refreshHud && r.refreshHud();
    }
    s.stash = null;
    return had;
  }
  function fistsKey(r, s) {
    if (!canFight(r)) return;
    if (s.fists || s.want) leaveFists(r, s, false); else enterFists(r, s);
  }

  // ------------------------------------------------------------------ удар: запуск, кадры, попадание
  function startAtk(r, s, id, o) {
    const d = ATK[id]; if (!d) return false;
    o = o || {};
    s.atk = { id, d, t: o.t0 || 0, u: 0, done: false, heavy: !!o.heavy, mul: o.mul || 1, peak: d.peak ? d.peak * d.dur : 0, hand: d.h };
    s.hold = 0; s.buf = 0; s.hs = 0;
    s.exh = Math.min(1, s.exh + (d.dmg > 25 ? 0.16 : 0.08));
    play(r, 'whoosh', d.dmg > 25 ? 1.1 : 0.85);
    const c = d.cam; r.kick(c[0] * 0.3, c[1] * -0.4, c[2] * -0.3, 0);
    return true;
  }
  function nextLight(s) {
    if (s.comboT <= 0) s.combo = 0;
    const id = ['jab', 'cross', 'jab', 'hook'][s.combo % 4];
    s.combo = (s.combo + 1) % 4;
    return id;
  }
  function press(r, s) {
    const a = s.atk;
    if (a && a.u < a.d.hit + 0.14) { s.buf = 0.2; return; }      // удар в разгаре — буфер; в фазе возврата можно прервать следующим
    if (s.sl) { startAtk(r, s, 'drop'); return; }
    if ((r.sprintK || 0) > 0.5 && r.p.moving > 0.3) { startAtk(r, s, 'ram'); return; }
    if (s.blk && s.ctr > 0) { s.ctr = 0; startAtk(r, s, 'counter'); return; }
    startAtk(r, s, nextLight(s));
  }
  function kickKey(r, s) {
    if (!canFight(r) || s.sl || (s.atk && s.atk.u < 0.6)) return;
    if (s.fists && r.aimWant) startAtk(r, s, 'push'); else startAtk(r, s, 'kick');
  }
  function endAtk(r, s) {
    const a = s.atk; s.atk = null;
    if (a && !a.d.leg && !a.d.open && a.d.dmg < 30) s.comboT = 0.9;
    if (s.buf > 0 && canFight(r) && (s.fists || (a && a.d.leg))) { if (s.fists) press(r, s); s.buf = 0; }
  }
  function tickAtk(r, s, dt) {
    const a = s.atk; if (!a) return;
    if (s.hs > 0) { s.hs -= dt; return; }
    const d = a.d;
    a.t += dt * (a.heavy && a.t < a.peak ? 2.5 : 1);
    a.u = a.t / d.dur;
    if (d.lunge && a.u > d.lunge[0] && a.u < d.lunge[1]) {
      const p = r.p, st = d.lunge[2] * dt, nx = p.x - Math.sin(p.yaw) * st, nz = p.z - Math.cos(p.yaw) * st;
      if (!r.blocked(nx, p.z)) p.x = nx;
      if (!r.blocked(p.x, nz)) p.z = nz;
    }
    if (!a.done && a.u >= d.hit) { a.done = true; strike(r, s, a); }
    if (a.u >= 1) endAtk(r, s);
  }
  // ближайший враг в конусе перед игроком
  function strike(r, s, a) {
    const d = a.d, cb = r.cb, p = r.p;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), hy = EYE - s.drop;
    let best = null, bd = 1e9, bx = 0, bz = 0;
    for (const e of cb.enemies) {
      if (e.dead || e.friendly) continue;
      const g = e.n.g, dx = g.position.x - p.x, dz = g.position.z - p.z, dist = Math.hypot(dx, dz), sc = e.t.scale || 1;
      if (dist > d.rng + 0.3 * (sc - 1)) continue;
      if (dist > 0.55 && (dx * fx + dz * fz) / dist < 0.78) continue;
      if (!r.hasLOS(p.x, hy, p.z, g.position.x, 1.2 * sc, g.position.z)) continue;
      if (dist < bd) { bd = dist; best = e; bx = dx / (dist || 1); bz = dz / (dist || 1); }
    }
    const kick = d.cam, sg = sgn();
    if (!best) { if (d.leg) r.kick(kick[0] * 0.5, 0, sg * kick[2] * 0.5, 0.004); return; }
    const heavy = d.dmg >= 30;
    hitEnemy(r, s, best, { dmg: d.dmg * a.mul, stg: d.stg, kn: d.kn, rd: d.rd * (a.mul > 1 ? 1 : 1), head: !!d.head, snd: d.snd }, bx, bz);
    r.kick(kick[0], kick[1] * sg, kick[2] * sg, kick[3]);
    s.hs = heavy ? 0.07 : 0.04;
    r.rumble && r.rumble(heavy ? 0.9 : 0.5, 0.5, heavy ? 140 : 90);
  }
  function hitEnemy(r, s, e, o, dx, dz) {
    const T = e.t, sc = T.scale || 1, g = e.n.g;
    const pt = { x: g.position.x, y: (o.head ? 1.55 : 1.2) * sc, z: g.position.z };
    e.n.rd = { t: performance.now(), dmg: o.rd || 0 };           // ragdoll.js суммирует урон за 120 мс: так сила удара влияет на то, как упадёт тело
    r.damageEnemy(e, o.dmg * (o.head ? 1.5 : 1), !!o.head, pt);
    r.hitmark && r.hitmark(!!o.head);
    play(r, o.snd, o.dmg > 28 ? 1.1 : 0.9);
    r.noise && r.noise(8);
    r.cb.lastCombat = r.time;
    if (e.dead) return;
    const big = T === undefined ? 1 : (e.type === 'boss' ? 0.15 : e.type === 'heavy' ? 0.35 : 1);
    e.stagger = Math.max(e.stagger || 0, o.stg * big);               // damageEnemy сам ставит 0.14 с — перекрываем после вызова
    e.atk = 0; e.tele = 0; e.burst = 0; e.cd = Math.max(e.cd || 0, 0.5);
    if (e.n) e.n.armT = 0;
    if (o.kn) s.knock.push({ e, x: dx, z: dz, v: o.kn * big * 9 });
  }
  function tickKnock(r, s, dt) {
    for (let i = s.knock.length - 1; i >= 0; i -= 1) {
      const k = s.knock[i], e = k.e;
      if (!e || e.dead || k.v < 0.15) { s.knock.splice(i, 1); continue; }
      const g = e.n.g, st = k.v * dt;
      const nx = g.position.x + k.x * st, nz = g.position.z + k.z * st;
      if (!r.blockedE(nx, g.position.z)) g.position.x = nx;
      if (!r.blockedE(g.position.x, nz)) g.position.z = nz;
      k.v *= Math.exp(-dt * 9);
    }
  }

  // ------------------------------------------------------------------ покадровая логика (внутри movePlayer)
  function tick(r, s, dt) {
    const p = r.p, mv = canMove(r), fight = canFight(r);
    s.t += dt;
    if (r.paused) s.k = {};
    s.buf = Math.max(0, s.buf - dt); s.comboT = Math.max(0, s.comboT - dt); s.ctr = Math.max(0, s.ctr - dt); s.slCd = Math.max(0, s.slCd - dt);
    // присед: бег поднимает игрока
    if (mv && s.crouch && !s.sl && isRun(r) && p.moving > 0.3) { s.crouch = false; s.dv -= 1.2; }
    // пружина глаза: лёгкий перелёт при приседании и вставании
    const tgt = s.sl ? SL_DROP : (s.crouch ? CR_DROP : 0);
    s.dv += ((tgt - s.drop) * 170 - s.dv * 17) * dt;
    s.drop = clamp(s.drop + s.dv * dt, -0.08, 0.9);
    s.cr = clamp(s.drop / CR_DROP, 0, 1.4);
    r.pmDrop = s.drop;
    s.slK += ((s.sl ? 1 : 0) - s.slK) * damp(s.sl ? 14 : 7, dt);
    // наклон
    const lw = mv && !s.sl ? (s.k.KeyX ? 1 : 0) - (s.k.KeyZ ? 1 : 0) + s.padLean : 0;
    s.lean += (clamp(lw, -1, 1) - s.lean) * damp(11, dt);
    // кулаки: вход, когда оружие уже убрано
    if (s.want && !s.fists && !r.wp && fight) { setFists(r, s, true); play(r, 'rustle', 1); }
    if (s.fists) s.fk = Math.min(1, s.fk + dt / 0.22);
    const cc = s.crouch || !!s.sl;
    if (cc !== s.cc) { s.cc = cc; if (r.layer) r.layer.classList.toggle('pm-crouch', cc); }
    // блок и ввод удара
    s.down = !!(r.fireHeld || r.padFire);
    const fisting = fight && s.fists;
    s.blk = fisting && !!r.aimWant && !s.atk && s.fk > 0.6 && !s.sl;
    s.blkAge = s.blk ? s.blkAge + dt : 0;
    s.bk += ((s.blk ? 1 : 0) - s.bk) * damp(18, dt);
    if (fisting && s.pressQ) { s.pressQ = false; press(r, s); } else if (!fisting) s.pressQ = false;
    if (!fight && (s.atk || s.chg)) { s.atk = null; s.chg = 0; }
    // зарядка тяжёлого: держим ЛКМ после лёгкого удара
    if (fisting && !s.atk && !s.blk) {
      if (s.down) {
        s.hold += dt;
        if (s.hold > 0.14) {
          if (s.chg <= 0.001) { // тип выбирается в начале зарядки: взгляд вниз — апперкот, A/D — удар локтем, иначе боковой
            const K = r.keys || {};
            s.chgKind = p.pitch < -0.25 ? 'upper' : ((K.KeyA || K.KeyD) ? 'elbow' : 'hook2');
          }
          s.chg = Math.min(1, s.chg + dt / 0.55);
        }
      } else {
        if (s.chg >= 0.35) {
          const d = ATK[s.chgKind], u0 = d.peak * eo(s.chg);
          startAtk(r, s, s.chgKind, { heavy: true, t0: u0 * d.dur, mul: 0.75 + 0.5 * s.chg });
          s.chg = 0;
        } else s.chg = Math.max(0, s.chg - dt * 4);
        s.hold = 0;
      }
    } else if (!s.atk) { s.chg = Math.max(0, s.chg - dt * 4); if (!s.down) s.hold = 0; }
    tickAtk(r, s, dt);
    tickKnock(r, s, dt);
    // кик-огибающая и поле зрения
    const a = s.atk;
    s.kv = a && a.d.leg ? (a.u < a.d.hit ? eo(a.u / a.d.hit) : 1 - sm((a.u - a.d.hit) / (1 - a.d.hit))) : Math.max(0, s.kv - dt * 6);
    const fovT = (s.sl ? 9 * s.slK : 0) + (a && a.d.fov ? a.d.fov * Math.sin(PI * clamp(a.u, 0, 1)) : 0);
    s.fa += (fovT - s.fa) * damp(12, dt);
    // скрутка корпуса и взмах камеры
    let twT = 0, yw = 0;
    if (a && a.d.tw) twT = a.d.tw * Math.sin(PI * clamp(a.u / 0.8, 0, 1)) * (a.hand === 0 ? 1 : 1);
    if (a && a.d.yaw) yw = sample1(a.d.yaw, a.u);
    s.tw += (twT - s.tw) * damp(18, dt);
    s.yawOff += (yw - s.yawOff) * damp(22, dt);
    s.slam *= Math.exp(-dt * 14); s.rack *= Math.exp(-dt * 12);
    // усталость и дыхание
    s.exh = Math.max(0, s.exh - dt * 0.1 + (s.fists && (r.sprintK || 0) > 0.5 ? dt * 0.04 : 0));
    if (s.exh > 0.45 && r.time > s.nextBr) { s.nextBr = r.time + 2.4 - s.exh * 1.1; play(r, 'breath', 0.5 + s.exh * 0.6); }
    // скорость ходьбы
    let mm = 1;
    if (s.cr > 0.05) mm = Math.min(mm, lerp(1, 0.55, clamp(s.cr, 0, 1)));
    if (s.blk) mm = Math.min(mm, 0.6);
    if (a) mm = Math.min(mm, a.d.mv || 0.5);
    if (s.chg > 0.05) mm = Math.min(mm, 0.5);
    s.mm = mm;
    hookSnd(r);
  }
  function sample1(kf, u) {
    let i = 0;
    while (i < kf.length - 2 && u >= kf[i + 1][0]) i += 1;
    const a = kf[i], b = kf[i + 1];
    return lerp(a[1], b[1], sm((u - a[0]) / Math.max(1e-4, b[0] - a[0])));
  }
  // шаги тише в приседе
  function hookSnd(r) {
    const snd = r.snd; if (!snd || snd.__pm) return;
    snd.__pm = true;
    const pl = snd.play;
    snd.play = function (name, o) {
      const s = r.pm;
      if (name === 'footstep' && s && s.cr > 0.4) { o = Object.assign({}, o); o.k = (o.k === undefined ? 1 : o.k) * 0.45; }
      return pl.call(this, name, o);
    };
  }

  // ------------------------------------------------------------------ позы рук
  function sampleKf(kf, u, out) {
    let i = 0;
    while (i < kf.length - 2 && u >= kf[i + 1][0]) i += 1;
    const a = kf[i], b = kf[i + 1];
    let k = clamp((u - a[0]) / Math.max(1e-4, b[0] - a[0]), 0, 1);
    const e = a[7];
    k = e === 'o' ? eo(k) : e === 'i' ? ei(k) : sm(k);
    for (let j = 0; j < 6; j += 1) out[j] = a[j + 1] + (b[j + 1] - a[j + 1]) * k;
  }
  function mix(o, b, k) { for (let j = 0; j < 6; j += 1) o[j] += (b[j] - o[j]) * k; }
  function mirror(o) { o[0] = -o[0]; o[4] = -o[4]; o[5] = -o[5]; }

  function fistsPose(r, s, dt) {
    const rg = r.rg, body = r.body, fh = rg.fh, t = r.time, st = r.stress || 0;
    const fk = eo(s.fk), sk = (r.sprintK || 0) * (s.blk ? 0 : 1), bk = s.bk, low = 1 - fk;
    const br = Math.sin(t * 3.2) * (0.01 + 0.012 * st + 0.01 * s.exh);
    const a = s.atk, tmp = s.tmp;
    let open = false;
    for (let i = 0; i < 2; i += 1) {
      const o = s.hand[i], g = GUARD[i], pl = s.pole[i];
      for (let j = 0; j < 6; j += 1) o[j] = g[j];
      // дыхание и лёгкое покачивание
      o[1] += br * (i ? 0.8 : 1) + Math.sin(t * 1.3 + i * 2.1) * 0.004;
      o[0] += Math.sin(t * 0.9 + i) * 0.004;
      o[2] += br * 0.6;
      if (sk > 0.01) { // бег: кулаки ниже, руки толкают воздух в такт шагам
        const q = SPRINT[i], th = Math.sin(r.p.phase + i * PI) * 0.12;
        mix(o, [q[0], q[1], q[2] + th, q[3], q[4], q[5]], sm(sk));
      }
      if (bk > 0.01) mix(o, BLOCK[i], sm(bk));
      pl[3] = 0;
      // замах и удар
      let aw = 0, ap = null;
      if (a && !a.d.leg) {
        const d = a.d, mir = d.h === 2 && i === 0;
        const own = d.h === 2 || d.h === i;
        if (own) {
          sampleKf(d.kf, a.u, tmp); if (mir) mirror(tmp); ap = tmp;
          aw = Math.min(sm(a.u / 0.08), 1 - sm((a.u - 0.85) / 0.15));
          if (d.pole) { const pp = d.pole; pl[0] = pp[0] * (i ? 1 : -1); pl[1] = pp[1]; pl[2] = pp[2]; pl[3] = aw; }
          if (d.open) open = true;
        } else if (d.off) { ap = d.off; aw = Math.min(sm(a.u / 0.2), 1 - sm((a.u - 0.6) / 0.4)); }
        else { aw = 0; }
      } else if (s.chg > 0.001 && i === 1) {   // зарядка: кулак идёт к точке замаха
        const d = ATK[s.chgKind];
        sampleKf(d.kf, d.peak * eo(s.chg), tmp); ap = tmp; aw = sm(s.chg * 4);
        if (d.pole) { const pp = d.pole; pl[0] = pp[0]; pl[1] = pp[1]; pl[2] = pp[2]; pl[3] = aw; }
      }
      if (ap && aw > 0.001) mix(o, ap, aw);
      if (low > 0.01) mix(o, LOW[i], low);
    }
    for (let i = 0; i < 2; i += 1) {
      const o = s.hand[i], hp = rg.hp[i];
      hp.set(o[0], o[1], o[2]); body.localToWorld(hp);
      if (fh) { rg.e.set(o[3], o[4], o[5], 'YXZ'); fh.q[i].setFromEuler(rg.e).premultiply(body.quaternion); }
    }
    r.pmQ = !!fh;
    r.pmFist = fk < 0.35 ? 'idle' : (open ? 'open' : 'fist');
  }
  // оружие в руках: на бегу левая рука отпускает цевьё и режет воздух (сама рука ставится в pmArm — после того, как fpsHands.armed положил её на оружие)
  function armedHands(r, s, dt, w) {
    const can = (r.sprintK || 0) > 0.5 && !r.rl && (r.swapOff || 0) < 0.25 && !r.aimWant && !!r.rg.fh;
    s.free += ((can ? 1 : 0) - s.free) * damp(can ? 9 : 14, dt);
    r.pmFree = s.free > 0.55;
  }

  // ------------------------------------------------------------------ крючки для combat.js / missions.js
  P.pmHv = function (hvT) { const s = this.pm; return s && s.fists ? 1 : hvT; };
  P.pmHands = function (dt, w) {
    const s = this.pm; this.pmQ = false; this.pmFist = null; this.pmFree = false;
    if (!s || !this.rg) return;
    if (s.fists && !w) fistsPose(this, s, dt); else if (w) armedHands(this, s, dt, w); else s.free = 0;
  };
  // перед IK руки i: локоть для хуков (кулаки) и свободная левая рука на бегу с оружием
  P.pmArm = function (i, v1) {
    const s = this.pm; if (!s) return;
    const rg = this.rg, fh = rg.fh;
    if (s.fists) {
      const pl = s.pole[i]; if (pl[3] < 0.01) return;
      v1.lerp(rg.v2.set(pl[0], pl[1], pl[2]).applyQuaternion(this.body.quaternion), pl[3]);
      return;
    }
    if (i !== 0 || s.free < 0.02 || !fh || !this.wp) return;
    const ph = this.p.phase, k = sm(s.free), sn = Math.sin(ph);
    rg.v2.set(-0.27 + sn * 0.02, -0.23 + Math.abs(sn) * 0.03, -0.42 + sn * 0.15); this.body.localToWorld(rg.v2);
    rg.wr[0].lerp(rg.v2, k);
    rg.e.set(0.6 + sn * 0.35, -0.15, HP * 0.8, 'YXZ'); rg.q2.setFromEuler(rg.e).premultiply(this.body.quaternion);
    fh.q[0].slerp(rg.q2, k);
  };
  // смещение оружия: агрессивный бег, перекидывание на ремень при смене, хлопок по магазину, рывок затвора, пинок / подкат
  P.pmWo = function (dt, px, py, pz, rx, ry, rz) {
    const s = this.pm; if (!s) return null;
    const sk = this.sprintK || 0, ph = this.p.phase, so = this.swapOff || 0;
    if (sk > 0.001) { rx -= 0.2 * sk; px += Math.sin(ph) * 0.02 * sk; py += (Math.abs(Math.sin(ph)) * 0.035 - 0.02) * sk; rz += Math.sin(ph) * 0.08 * sk; ry += Math.sin(ph) * 0.05 * sk; }
    if (so > 0) { rz += 0.55 * so; px += 0.12 * so; }
    if (s.slam > 0.001) { py += 0.035 * s.slam; rx += 0.1 * s.slam; }
    if (s.rack > 0.001) { rz += 0.2 * s.rack; rx += 0.08 * s.rack; px -= 0.01 * s.rack; }
    if (s.kv > 0.01) { py -= 0.1 * s.kv; rx -= 0.4 * s.kv; }
    if (s.slK > 0.01) { py -= 0.05 * s.slK; rz -= 0.15 * s.slK; }
    py -= 0.02 * clamp(s.cr, 0, 1) * (1 - sk);
    const o = s.wo; o[0] = px; o[1] = py; o[2] = pz; o[3] = rx; o[4] = ry; o[5] = rz;
    return o;
  };
  P.pmAim = function () { const s = this.pm; if (!s) return 1; if (s.sl) return 0.6; return lerp(1, 0.82, clamp(s.cr, 0, 1)); };
  P.pmHd = function () {
    const s = this.pm; if (!s || this.camFree || (s.drop < 0.03 && Math.abs(s.leanOff) < 0.03)) return null;
    const c = this.camera.position; return [c.x, c.y, c.z];
  };
  // удар рашера по игроку: в блоке урон ×0.2, вовремя нажатый блок — парирование (враг оглушён, открывается контрудар)
  P.pmMelee = function (e, dmg, ex, ez) {
    const s = this.pm; if (!s || !s.fists || !s.blk) return false;
    const p = this.p, dx = ex - p.x, dz = ez - p.z, d = Math.hypot(dx, dz) || 1;
    if ((dx * -Math.sin(p.yaw) + dz * -Math.cos(p.yaw)) / d < 0.3) return false;
    if (s.blkAge < PARRY) {
      e.stagger = 1.2; e.atk = 0; e.tele = 0; if (e.n) e.n.armT = 0;
      s.ctr = 0.8; s.hs = 0;
      play(this, 'parry', 1); this.kick(-0.012, 0, 0.02 * sgn(), 0.008); this.rumble && this.rumble(0.7, 0.6, 120);
      this.toast && this.toast('PARRY', 0.7);
      return true;
    }
    play(this, 'block', 1);
    this.hurt(dmg * 0.2, ex, ez);
    this.kick(-0.01, 0, 0, 0.006);
    return true;
  };

  // камера: просадка, наклон из-за угла, подкат, бег, ход в приседе
  function clearance(r, x, y, z, rx, rz, want) {
    const cols = r.colliders; if (!cols || Math.abs(want) < 0.01) return want;
    const n = 6, mg = want > 0 ? 0.13 : -0.13;
    for (let i = 1; i <= n; i += 1) {
      const o = want * i / n + mg, px = x + rx * o, pz = z + rz * o;
      for (const c of cols) {
        if (c.off || c.glass) continue;
        const y0 = c.y0 === undefined ? 0 : c.y0, y1 = c.y1 === undefined ? 3.6 : c.y1;
        if (y < y0 - 0.15 || y > y1 + 0.15) continue;
        if (px > c.x0 && px < c.x1 && pz > c.z0 && pz < c.z1) return want * (i - 1) / n;
      }
    }
    return want;
  }
  P.pmCam = function (cam, dt) {
    const s = this.pm; if (!s) return;
    const p = this.p, c = Math.cos(p.yaw), sn = Math.sin(p.yaw), mv = p.moving, ph = p.phase, sk = this.sprintK || 0, crc = clamp(s.cr, 0, 1);
    let ox = 0, oy = -s.drop, oz = 0, rl = 0, pt = 0, yw = s.tw * 0.35 + s.yawOff;
    // наклон из-за угла: камера уходит вдоль правого вектора, упираясь в стены
    const offMax = lerp(LEAN.off, LEAN.offC, crc), rollMax = lerp(LEAN.roll, LEAN.rollC, crc);
    const want = s.lean * offMax;
    const lim = clearance(this, cam.position.x, cam.position.y + oy, cam.position.z, c, -sn, want);
    s.leanOff = (lim * s.leanOff >= 0 && Math.abs(lim) < Math.abs(s.leanOff)) ? lim : lerp(s.leanOff, lim, damp(20, dt));   // стена — камера отъезжает сразу, а не вползает в неё
    if (Math.abs(s.leanOff) < 0.0005) s.leanOff = 0;
    ox += c * s.leanOff; oz -= sn * s.leanOff;
    s.leanRoll = -clamp(s.leanOff / offMax, -1, 1) * rollMax;
    // ход в приседе: «краб» — шире качание, ниже и тише
    const crab = crc * mv;
    if (crab > 0.01) { const sw = Math.sin(ph) * 0.045 * crab; ox += c * sw; oz -= sn * sw; rl += Math.sin(ph) * 0.03 * crab; oy -= (0.5 + 0.5 * Math.sin(ph * 2)) * 0.02 * crab; }
    // агрессивный бег: сильнее качает, взгляд чуть вперёд-вниз
    if (sk > 0.01 && !s.sl) { rl += Math.sin(ph) * 0.02 * sk; oy += Math.sin(ph * 2) * 0.022 * sk * mv; pt -= 0.018 * sk; }
    // подкат: корпус откинут, дрожь от пола, крен в сторону скольжения
    if (s.slK > 0.01) {
      const sl = s.sl, lat = sl ? sl.dx * c - sl.dz * sn : 0, k = s.slK;
      pt += 0.05 * k; rl += -0.1 * lat * k;
      oy += (Math.random() - 0.5) * 0.008 * k; yw += (Math.random() - 0.5) * 0.004 * k;
    }
    cam.position.x += ox; cam.position.y += oy; cam.position.z += oz;
    cam.rotation.x += pt; cam.rotation.y += yw; cam.rotation.z += rl + s.leanRoll;
  };

  // ------------------------------------------------------------------ обёртки методов Run
  const mp0 = P.movePlayer;
  P.movePlayer = function (dt) {
    const s = S(this);
    tick(this, s, dt);
    if (slideMove(this, s, dt)) return;
    const old = this.moveMul;
    this.moveMul = (old || 1) * s.mm;
    try { return mp0.call(this, dt); } finally { this.moveMul = old; }
  };

  const rig1 = P.updateRig;
  P.updateRig = function (dt, vel) {
    const s = this.pm, body = this.body;
    if (s && body && this.legs) {
      const cr = clamp(s.cr, 0, 1.2), kv = s.kv, sl = s.slK;
      body.rotation.z = s.leanRoll * 0.85;
      body.rotation.y += s.tw + s.yawOff;
      if (!s.torso) s.torso = body.children[0];
      if (s.torso) s.torso.rotation.x = -0.22 * cr;
      for (let i = 0; i < 2; i += 1) {
        const g = this.legs[i];
        let y = lerp(-0.95, -0.62, cr), sy = lerp(1, 0.7, cr), rx = g.rotation.x * (1 - cr * 0.7) + 1.0 * cr;
        if (sl > 0.01) { rx = lerp(rx, i ? 1.5 : 1.25, sl); y = lerp(y, -0.7, sl); sy = lerp(sy, 0.85, sl); }
        if (i === 1 && kv > 0.01) { rx = lerp(rx, 1.45, kv); y = lerp(y, -0.38, kv); sy = lerp(sy, 0.72, kv); }
        g.position.y = y; g.scale.y = sy; g.rotation.x = rx;
      }
    }
    return rig1.call(this, dt, vel);
  };

  const uw1 = P.updateWeapon;
  P.updateWeapon = function (dt) {
    const s = this.pm;
    if (!s) return uw1.call(this, dt);
    const so0 = this.swapOff || 0, w0 = this.wp;
    // быстрая смена: опускание и подъём на 50% быстрее штатных
    if (w0 && !s.want) {
      if (this.swapTo) this.swapOff = Math.min(1, so0 + dt / 0.13 * 0.5);
      else if (so0 > 0) this.swapOff = Math.max(0, so0 - dt / 0.22 * 0.5);
    }
    const so1 = this.swapOff || 0;
    uw1.call(this, dt);
    if (!this.wp) { // без оружия штатный updateWeapon выходит рано — бег считаем сами
      const K = this.keys || {}, running = (K.ShiftLeft || K.ShiftRight || this.runHeld || this.padRun) && this.p.moving > 0.3 && !this.aimWant;
      this.sprintK = lerp(this.sprintK || 0, running ? 1 : 0, damp(9, dt));
    }
    // убираем оружие в режим кулаков
    if (s.want && !s.fists && this.wp) {
      this.swapTo = null; this.rl = null; this.aimWant = false; this.fireHeld = false;
      this.swapOff = Math.min(1, so1 + dt / 0.16);
      if (this.swapOff >= 1) {
        s.stash = this.wp; this.wp = null; this.swapOff = 0; this.aimK = 0;
        setFists(this, s, true); play(this, 'rustle', 1);
        this.refreshHud && this.refreshHud();
      }
    }
    if (s.fists && this.wp) leaveFists(this, s, true);          // кто-то внешний взял оружие в руки: кулаки больше не нужны
    // тактическая перезарядка: хлопок по магазину и резкий рывок затвора — толчок оружия и камеры
    return undefined;
  };

  const sr1 = P.stepReload;
  P.stepReload = function (rl, dt) {
    const s = this.pm, d0 = rl.done || {}, mi = !!d0.magin, rk = !!d0.rack;
    const res = sr1.call(this, rl, dt);
    if (s && rl.done) {
      if (!mi && rl.done.magin && !rl.shell) { s.slam = 1; play(this, 'palm', 1); this.kick(-0.012, 0, 0, 0.004); }
      if (!rk && rl.done.rack && !rl.shell) { s.rack = 1; play(this, 'rustle', 0.6); }
    }
    return res;
  };
  const rl1 = P.startReload;
  P.startReload = function () {
    const ok = rl1.apply(this, arguments);
    if (ok && this.rl && this.pm && !this.rl.shell) this.rl.dur *= 0.88;     // хват и закладка отработаны: перезарядка на 12% быстрее
    return ok;
  };

  const fov1 = P.fovNow;
  P.fovNow = function () {
    const f = fov1.call(this), s = this.pm;
    if (!s) return f;
    return f + s.fa + (!this.wp ? (this.sprintK || 0) * 3 : 0);
  };

  const pf1 = P.pressFire;
  P.pressFire = function () {
    const s = this.pm;
    if (s && s.fists && canFight(this)) { s.pressQ = true; return undefined; }
    return pf1.apply(this, arguments);
  };

  const eq1 = P.equip;
  P.equip = function (w, instant) {
    const s = this.pm;
    if (s && w && (s.fists || s.want) && !this.dead) leaveFists(this, s, true);
    return eq1.call(this, w, instant);
  };
  if (P.toyDraw) {
    const td1 = P.toyDraw;
    P.toyDraw = function () {
      const s = this.pm;
      if (s && (s.fists || s.want) && this.toy && this.ty && this.ty.s === 'none' && !this.locked && !this.camFree) leaveFists(this, s, true);
      return td1.apply(this, arguments);
    };
  }
  const cmb1 = P.combat;
  if (cmb1) {
    P.combat = function () {
      const res = cmb1.apply(this, arguments);
      if (this.layer) this.layer.classList.add('pm-cb');       // сенсорные кнопки FISTS / KICK нужны только там, где есть бой
      return res;
    };
  }
  const cw1 = P.clearWeapons;
  P.clearWeapons = function () {
    const s = this.pm;
    if (s) s.stash = null;
    return cw1.apply(this, arguments);
  };
  const hurt1 = P.hurt;
  P.hurt = function (amt) {
    const s = this.pm;
    if (s && amt >= 9 && !this.dead && !this.god && (s.atk || s.chg > 0.05)) { s.atk = null; s.chg = 0; s.hold = 0; }   // сильный удар сбивает замах
    return hurt1.apply(this, arguments);
  };
  const die1 = P.die;
  P.die = function () {
    const s = this.pm;
    if (s && !this.dead) {
      leaveFists(this, s, true);
      s.sl = null; s.crouch = false; s.drop = 0; s.dv = 0; s.cr = 0; s.slK = 0; s.lean = 0; s.leanOff = 0; s.leanRoll = 0; s.k = {};
      s.atk = null; s.chg = 0; s.knock.length = 0; s.kv = 0; s.tw = 0; s.yawOff = 0; s.fa = 0; s.pressQ = false;
      this.pmDrop = 0;
    }
    return die1.apply(this, arguments);
  };

  // ------------------------------------------------------------------ ввод: клавиши, геймпад, сенсорные кнопки
  const pad = () => { try { const l = navigator.getGamepads ? navigator.getGamepads() : []; for (let i = 0; i < l.length; i += 1) if (l[i] && l[i].connected) return l[i]; } catch (e) { /* нет геймпада */ } return null; };
  const pp1 = P.pollPad;
  P.pollPad = function (dt) {
    pp1.call(this, dt);
    const s = this.pm; if (!s) return;
    const g = pad();
    if (!g || !this.padActive) { s.padLean = 0; return; }
    const b = (i) => !!(g.buttons[i] && g.buttons[i].pressed), pv = s.pp;
    s.padLean = !this.gad && canMove(this) ? (b(15) ? 1 : 0) - (b(14) ? 1 : 0) : 0;     // D-pad наклоняет, пока в руках нет гаджета (там он занят kit.js)
    if (canMove(this)) {
      if (b(11) && !pv[11]) { s.r3t = performance.now(); s.r3L = false; }
      if (b(11) && s.r3t >= 0 && !s.r3L && performance.now() - s.r3t > 400) { s.r3L = true; fistsKey(this, s); }     // R3 удержать — кулаки
      if (!b(11) && pv[11] && s.r3t >= 0 && !s.r3L) crouchKey(this, s);                                               // R3 тап — присед / подкат
      if (b(8) && !pv[8]) kickKey(this, s);                                                                          // Select — пинок
    }
    if (!b(11)) s.r3t = -1;
    for (const i of [8, 11]) pv[i] = b(i);
  };

  const bi1 = P.bindInput;
  P.bindInput = function () {
    const res = bi1.apply(this, arguments);
    try { bind(this); } catch (e) { console.warn('[pmove]', e); }
    return res;
  };
  function bind(r) {
    const s = S(r);
    r.on(document, 'keydown', (e) => {
      const c = e.code;
      if (c === 'KeyZ' || c === 'KeyX') { s.k[c] = true; return; }
      if (e.repeat || !r.entered) return;
      if (c === 'KeyC') crouchKey(r, s);
      else if (c === 'KeyF') fistsKey(r, s);
      else if (c === 'KeyV') kickKey(r, s);
    });
    r.on(document, 'keyup', (e) => { if (e.code === 'KeyZ' || e.code === 'KeyX') s.k[e.code] = false; });
    r.on(window, 'blur', () => { s.k = {}; });
    const tu = r.qs('.m-touchui');
    if (tu && !tu.querySelector('.m-crch')) {
      tu.insertAdjacentHTML('beforeend', '<button type="button" class="m-btn m-crch">CROUCH</button><button type="button" class="m-btn m-fist">FISTS</button><button type="button" class="m-btn m-kick">KICK</button>');
      const wire = (sel, fn) => { const b = r.qs(sel); if (b) r.on(b, 'pointerdown', (e) => { e.preventDefault(); fn(); }); };
      wire('.m-crch', () => { if (!s.crouch && !s.sl && r.runHeld && r.p.moving > 0.3) crouchKey(r, s); else { r.runHeld = false; const rb = r.qs('.m-run'); if (rb) rb.classList.remove('held'); crouchKey(r, s); } });
      wire('.m-fist', () => fistsKey(r, s));
      wire('.m-kick', () => kickKey(r, s));
    }
  }

  C.pmove = { ATK, state: S };
}());
