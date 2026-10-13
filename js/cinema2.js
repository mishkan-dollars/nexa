// NEXA: короткие «вставные» катсцены поверх геймплея (стиль GTA V: камера в руках оператора, резкие повороты с размытием).
//   • подрыв C4 (взгляд на заряд → жёсткая склейка сбоку, замедление, толчок камеры)
//   • дверь сектора открывается (каждая вторая дверь миссий 17–46)
//   • добивание босса и последний враг перестрелки (хедшот, не чаще раза в 30 с)
//   • тревога у охраны: кадр «перебрасывается» на заметившего охранника и возвращается
// Все идут через r.insertCam: пока вставка играет, любая другая катсцена (осмотр сектора, эпилог) ждёт её конца (cinema.js: cineInsert/cineIdle).
// Ограбление (миссия 47) имеет собственную режиссуру и сюда не заходит.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.cin) return;
  const { Run } = C, P = Run.prototype, K = C.cin, { pov, eyeAt, ahead } = K;
  const ok = (r) => !!(r && !r.disposed && !r.dead && !r.ending && !r.inCinema && r.cinematic && r.p);
  const heist = (r) => String(r.taskId) === '47' || String(r.taskId) === '48';
  const log = (n) => (e) => console.error('[cinema ' + n + ']', e);

  P.insertCam = async function (shots, o) {
    if (!ok(this)) return false;
    this.cineInsert = true;
    try { await this.cinematic(shots, o); } finally { this.cineInsert = false; }
    return true;
  };

  // свободная точка сбоку от базы (ox,oz) на расстоянии до m: стороны чередуются от вставки к вставке; [x, z, знак стороны]
  function sidePoint(r, ox, oz, ux, uz, m, y) {
    const rx = -uz, rz = ux;
    r.insertN = (r.insertN || 0) + 1;
    for (const sg of r.insertN % 2 ? [1, -1] : [-1, 1]) {
      for (let k = m; k >= 0.3; k -= 0.35) {
        const x = ox + rx * sg * k, z = oz + rz * sg * k;
        if (!K.camBlocked(r, x, y, z)) return [x, z, sg];
      }
    }
    return [ox, oz, 1];
  }

  // ------------------------------------------------------------ подрыв C4: вызывается из kit.js detonate(); true — катсцена сама подорвёт заряды (fireCharges)
  P.breachCam = function (list) {
    const r = this;
    if (!ok(r) || heist(r) || Date.now() - (r.breachAt || 0) < 6000) return false;
    const p = r.p; let c = null, d = 1e9;
    list.forEach((q) => { const dd = Math.hypot(q.x - p.x, q.z - p.z); if (dd < d) { d = dd; c = q; } });
    if (!c || d < 4.6 || d > 26) return false; // слишком близко — игрок должен получить урон, слишком далеко — не видно
    r.breachAt = Date.now();
    const ux = (c.x - p.x) / d, uz = (c.z - p.z) / d, A = eyeAt(r), cp = [c.x, c.y, c.z];
    const sd = sidePoint(r, p.x - ux * 0.5, p.z - uz * 0.5, ux, uz, 1.5, 1.25);
    let fired = false;
    const fire = () => { if (!fired) { fired = true; r.fireCharges(list); } };
    r.insertCam([
      { at: A, to: [A[0] + ux * 0.5, A[1], A[2] + uz * 0.5], look: ahead(r, 8), lookTo: cp, pan: [0, 0.55], fov: r.baseFov, fovTo: 60, dur: 0.7, slow: 0.7, dockIn: true, whip: { in: false }, tense: 0.4 },
      { at: [sd[0], 1.25, sd[1]], to: [sd[0] + ux * 0.7, 1.3, sd[1] + uz * 0.7], look: cp, fov: 58, fovTo: 44, dur: 1.1, slow: 0.4, jolt: [0.1, 1], tense: 0.9, hand: 1.1, whip: { out: false }, run: fire },
      pov(r, 1.1, { back: 1.8 })
    ]).catch(log('breach')).then(fire); // fire идемпотентен: если катсцена не стартовала или оборвалась — подрыв всё равно произойдёт
    return true;
  };

  // ------------------------------------------------------------ дверь сектора: оператор за плечом игрока снимает, как она открывается; open() вызывается ровно один раз
  K.doorCam = async function (r, sec, open) {
    let fired = false;
    const go = () => { if (!fired) { fired = true; open(); } };
    try {
      if (r.inCinema && r.cineIdle) await r.cineIdle();
      if (!ok(r)) return;
      const p = r.p, dx = -p.x, dz = sec.zB - p.z, d = Math.hypot(dx, dz);
      if (d < 3.2 || d > 28) return;
      const ux = dx / d, uz = dz / d, sd = sidePoint(r, p.x - ux * 1.1, p.z - uz * 1.1, ux, uz, 1.0, 1.35);
      await r.insertCam([
        { at: [sd[0], 1.35, sd[1]], to: [sd[0] + ux * 0.8, 1.45, sd[1] + uz * 0.8], look: [0, 1.4, sec.zB], fov: 62, fovTo: 50, dur: 1.2, slow: 0.55, tense: 0.6, run: go },
        pov(r, 1.0, { back: 1.6 })
      ]);
    } catch (e) { log('door')(e); } finally { go(); }
  };

  // ------------------------------------------------------------ добивание: босс всегда, обычный враг — последний в перестрелке и только хедшотом
  const kill0 = P.killEnemy;
  P.killEnemy = function (e, head) {
    kill0.call(this, e, head);
    try { finisher(this, e, !!head); } catch (err) { log('finisher')(err); }
  };
  function finisher(r, e, head) {
    if (!ok(r) || heist(r) || !e.t || e.t.passive || e.friendly) return;
    if (e.type !== 'boss') {
      if (!head || !r.cb || !r.cb.fightOn || r.enemiesAlive() > 0 || Date.now() - (r.killCamAt || 0) < 30000) return;
      r.killCamAt = Date.now();
    }
    const p = r.p, dx = e.x - p.x, dz = e.z - p.z, d = Math.max(0.5, Math.hypot(dx, dz));
    if (d > 34) return;
    const ux = dx / d, uz = dz / d, hy = e.hy || 1.5, back = Math.min(2.4, d * 0.6);
    const s1 = sidePoint(r, e.x - ux * back, e.z - uz * back, ux, uz, 1.7, 0.8), s2 = sidePoint(r, p.x - ux * 0.9, p.z - uz * 0.9, ux, uz, 0.5, 1.5);
    r.insertCam([
      { at: [s1[0], 0.8, s1[1]], to: [s1[0] + ux * 0.9, 0.85, s1[1] + uz * 0.9], look: [e.x, Math.min(1.5, hy * 0.6), e.z], lookTo: [e.x, 0.5, e.z], fov: 52, fovTo: 40, dur: 0.65, slow: 0.28, roll: 0.07 * s1[2], rollTo: 0.02 * s1[2], tense: 1, hand: 1.2 },
      { at: [s2[0], 1.5, s2[1]], to: [s2[0] + ux * 0.5, 1.52, s2[1] + uz * 0.5], look: [e.x, 1.0, e.z], lookTo: [e.x, 0.45, e.z], fov: 54, fovTo: 44, dur: 1.0, slow: 0.5, tense: 0.5 },
      pov(r, 1.1, { back: 1.8 })
    ]).catch(log('finisher'));
  }

  // ------------------------------------------------------------ тревога: кадр срывается с вида игрока на ближайшего охранника, потом крупный план и возврат
  const st0 = P.stealth;
  P.stealth = function (opt) {
    const r = this, S = st0.call(this, opt), a0 = S.alarmNow;
    S.alarmNow = function (why) {
      const was = S.alarm;
      a0(why);
      if (!was && S.alarm) { try { alarmCam(r, S); } catch (e) { log('alarm')(e); } }
    };
    return S;
  };
  function alarmCam(r, S) {
    if (!ok(r) || heist(r) || Date.now() - (r.alarmCamAt || 0) < 20000) return;
    const p = r.p; let g = null, d = 1e9;
    S.guards().forEach((q) => { const dd = Math.hypot(q.x - p.x, q.z - p.z); if (dd < d) { d = dd; g = q; } });
    if (!g || d > 40 || d < 1.2) return;
    r.alarmCamAt = Date.now();
    const ux = (g.x - p.x) / d, uz = (g.z - p.z) / d, A = eyeAt(r), back = Math.min(3, d * 0.5);
    const s2 = sidePoint(r, g.x - ux * back, g.z - uz * back, ux, uz, 0.9, 1.45);
    r.insertCam([
      { at: A, to: [A[0] + ux * 0.4, A[1], A[2] + uz * 0.4], look: ahead(r, 8), lookTo: [g.x, 1.55, g.z], pan: [0, 0.5], fov: r.baseFov, fovTo: 58, dur: 0.75, slow: 0.65, dockIn: true, whip: { in: false }, tense: 0.9 },
      { at: [s2[0], 1.45, s2[1]], to: [s2[0] + ux * 0.5, 1.45, s2[1] + uz * 0.5], look: () => [g.x, 1.55, g.z], fov: 46, fovTo: 36, dur: 0.9, slow: 0.5, tense: 1 },
      pov(r, 1.0, { back: 1.8 })
    ]).catch(log('alarm'));
  }
}());
