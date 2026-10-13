// NEXA: миссия 48 — акт 2: ночной двор NEXA (стелс, две свёрнутые шеи) → подвал B0 (броня «Heavy Assault», грузовой лифт).
// Весь текст — английский. Команда (Диктор + девушка) живёт в st.team и переходит из фазы в фазу; броня — F.suit поверх npc.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.PH || !C.f48.K || !C.f48.lift || !C.f48.YARD || !C.f48.woman || !K_ok(C)) return;
  function K_ok(c) { return !!(c.f48.K && c.f48.K.armBlend && c.f48.K.amb); }
  const F = C.f48, K = F.K, PH = F.PH, { lerp, smooth } = C, PI = Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DIC = 'DICTOR';
  const Y = F.YARD, B = F.BASE;
  const PX = -8.5;                                                  // x служебной двери подвала на северной стене двора

  // ------------------------------------------------------------------ общие помощники команды
  const face = (n, tx, tz) => { n.yaw = Math.atan2(tx - n.g.position.x, tz - n.g.position.z); n.g.rotation.y = n.yaw; };
  const put = (n, x, z, yaw) => { n.g.position.set(x, 0, z); n.yaw = yaw; n.g.rotation.y = yaw; n.goal = null; K.ally.stop(n); };
  // тело игрока для катсцены (в броне, если уже надета)
  K.pbody = function (r, x, z, yaw) { const n = F.playerBody(r, x, z, yaw); if (K.st(r).suit) F.suit(r, n); return n; };
  K.makeTeam = async function (r, pos) {
    const st = K.st(r);
    if (st.team) return st.team;
    const d = F.dictor(r, pos.D[0], pos.D[1], pos.D[2]), g = await F.woman(r, pos.G[0], pos.G[1], pos.G[2]);
    await d.ready;
    st.team = { d, g };
    return st.team;
  };

  // ================================================================== ДВОР: ночной стелс
  // Старт — чёрный экран и мешок (после поездки). Мешок срывают, Диктор показывает на дверь подвала; два охранника: патруль между контейнерами и страж у двери.
  PH.yard = async function (r, ctx) {
    const W = ctx.W, st = K.st(r);
    await r.clearEnemies();
    K.amb.set(r, 'none', { fade: 0.1 });
    W.enter('yard');
    const R = W.R.yard;
    K.lock(r);
    K.cutFade(r, 1); K.sackLevel(r, 1);
    const P0 = [0.2, 11.6], D0 = [-1.5, 10.5], G0 = [1.8, 12.7];
    r.p.x = P0[0]; r.p.z = P0[1]; r.p.yaw = 0; r.p.pitch = 0; r.spawnPt = [P0[0], P0[1], 0];
    const yD = Math.atan2(P0[0] - D0[0], P0[1] - D0[1]), yG = Math.atan2(P0[0] - G0[0], P0[1] - G0[1]);
    const T = await K.makeTeam(r, { D: [D0[0], D0[1], yD], G: [G0[0], G0[1], yG] });
    const d = T.d, g = T.g;
    put(d, D0[0], D0[1], yD); put(g, G0[0], G0[1], yG);
    d.g.visible = g.g.visible = true;
    const p = F.playerBody(r, P0[0], P0[1], 0);
    st.yardP = p;
    K.amb.set(r, 'yard', { fade: 3.0 });
    let yank = false;
    const sh = (x) => K.shot(Object.assign({ dur: 3 }, x));
    const shots = [
      // 1: под мешком, свет фонарей — мешок срывают
      sh({ at: [P0[0], 1.62, P0[1]], to: [P0[0], 1.64, P0[1] - 0.15], look: [-1, 1.8, -8], lookTo: [0, 5.5, -30], fov: 66, dur: 4.2, hand: 1.3, tense: 0.6,
        run: () => { p.g.visible = false; K.sackLevel(r, 1); r.fade(0, 1.0); yank = false; },
        tick: (rr, e, tt) => { if (tt < 2.4) K.sackLevel(r, 1 - 0.1 * smooth(Math.min(1, tt / 1.4))); else if (!yank) { yank = true; K.snd(r, 'rustle'); K.sackFx(r, false, 0.6, { rot: 8 }); } },
        says: [[DIC, 'Welcome to NEXA Industries, 083.', 2.6]] }),
      // 2: общий — комплекс, фасад в сто окон, машина у ворот
      sh({ at: [-13, 2.0, 14.4], to: [-5, 3.0, 14.0], look: [0, 6.0, -30], fov: 56, dur: 5.6, hand: 0.5, tense: 0.2, run: () => { p.g.visible = true; },
        says: [[DIC, 'Three floors above us. One vault. And more guards than you can count.', 4.6]] }),
      // 3: Диктор крупно
      sh({ at: [D0[0] + Math.sin(yD) * 1.7 + Math.cos(yD) * 0.4, 1.5, D0[1] + Math.cos(yD) * 1.7 - Math.sin(yD) * 0.4], to: [D0[0] + Math.sin(yD) * 1.35 + Math.cos(yD) * 0.3, 1.5, D0[1] + Math.cos(yD) * 1.35 - Math.sin(yD) * 0.3], look: () => [d.g.position.x, 1.52, d.g.position.z], fov: 32, dur: 5.0, hand: 0.7,
        says: [[DIC, 'Staff door, north wall. Two guards. One walks the containers, one holds the door.', 4.8], [DIC, 'No guns. Hands only. Quietly.', 2.2]] }),
      // 4: вид вдоль двора на дверь с красной лампой
      sh({ at: [P0[0] + 1.2, 1.7, P0[1] - 1.0], to: [P0[0] + 0.4, 1.7, P0[1] - 2.2], look: [PX, 1.4, -29], lookTo: [PX, 1.8, -29], fov: 48, dur: 4.4, hand: 0.6,
        says: [[DIC, 'Break their necks. The moment someone shouts, we are finished.', 3.8]] }),
      C.cin.pov(r, 1.8, { extra: { cut: 'dip', whip: false, frame: 0 } })
    ];
    await r.cinematic(shots);
    K.sackLevel(r, 0); K.sackHide(r); K.cutFade(r, 0);
    F.rm(r, p); st.yardP = null;
    K.unlock(r);
    // команда ждёт у машины
    face(d, 0, -29); face(g, 0, -29);
    K.ally.hold(r, d, d.g.position.x, d.g.position.z, d.yaw); K.ally.hold(r, g, g.g.position.x, g.g.position.z, g.yaw);

    // ---------------------------------------------------------- стелс-участок
    r.objective('REACH THE STAFF DOOR — NO ALARM');
    r.hint('HOLD [E] BEHIND A GUARD TO BREAK HIS NECK', 5);
    let S = null;
    await r.phase('yard', async () => {
      S = r.stealth({
        onAlarm: () => {
          K.say(r, 'Cover blown. Finish them!', 2.4);
          K.snd(r, 'alarm', { k: 0.5 });
          r.spawnWave([['grunt', -3, -26.5], ['grunt', 7, -27.2], ['rusher', -20.5, -28.2]], { gap: 0.9 });
        }
      });
      const mk = (path) => {
        const q = S.guard(path, { type: 'grunt', hp: 0.6, range: 13, takedown: false });
        const pos = new THREE.Vector3(path[0][0], 1.2, path[0][1]);
        const it = r.interact({
          pos: [pos.x, pos.y, pos.z], label: 'BREAK NECK', reach: 1.9,
          enabled: () => {
            if (q.dead || S.alarm || q.necking || !q.n.g.visible) return false;
            const gp = q.n.g.position, dx = r.p.x - gp.x, dz = r.p.z - gp.z, dd = Math.hypot(dx, dz) || 1;
            return dd < 2.1 && (dx * Math.sin(q.n.yaw) + dz * Math.cos(q.n.yaw)) / dd < 0.35;
          },
          use: () => { neck(r, S, q); }
        });
        r.addHook(() => { it.pos.set(q.n.g.position.x, 1.2, q.n.g.position.z); });
        return q;
      };
      const A = mk(R.guardPaths.A), Bg = mk(R.guardPaths.B);
      S.begin(false);
      await r.until(() => A.dead && Bg.dead);
      S.stop();
      await r.waitClear(0);
    }, { pos: [PX, -27, 0], weapons: ['glock'], set: () => { try { r.openNow(R.door); } catch (e) { /* дверь уже открыта */ } } });

    // ---------------------------------------------------------- дверь открывается, команда идёт ко входу
    K.ally.idle(r, d); K.ally.idle(r, g);
    r.objective('ENTER THE BASEMENT');
    K.snd(r, 'click', { k: 0.8 });
    await r.wait(0.5);
    K.say(r, 'Clean. Inside.', 2.0);
    r.openDoor(R.door, 1.6);
    K.snd(r, 'slam', { k: 0.4 });
    r.walk(d, [PX + 1.3, -26.5], 3.4).then(() => r.walk(d, [PX + 1.2, -27.4], 1.2));
    r.walk(g, [PX - 1.2, -26.2], 3.4);
    await r.beacon(PX, -28.4, 'BASEMENT', 1.7);
    K.lock(r);
    await r.fade(1, 0.7);
    K.unlock(r);
  };

  // «сворачивание шеи»: игрок встаёт за спиной, руки на голову и подбородок, поворот, хруст. Две камеры, 2.6 с.
  async function neck(r, S, q) {
    q.necking = true; q.stagger = 99; q.n.creeping = false;
    const n = q.n, gp = n.g.position, yaw = n.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
    const bx = gp.x - fx * 0.58, bz = gp.z - fz * 0.58;
    const p3 = F.playerBody(r, bx, bz, yaw);
    const V = new THREE.Vector3(), tk = { t: 0, snap: false, dir: Math.random() < 0.5 ? -1 : 1 };
    const unhook = K.hook(r, (dt) => {
      if (!(dt > 0)) return;
      tk.t += Math.min(dt, 0.05);
      const t = tk.t, k = smooth(clamp(t / 0.7, 0, 1)), sn = clamp((t - 1.65) / 0.18, 0, 1);
      n.head.updateWorldMatrix(true, false); n.head.localToWorld(V.set(0, 0.14, 0));
      const hx = V.x, hy = V.y, hz = V.z;
      // игрок: правая рука обхватывает подбородок, левая — темя; корпус подаётся вперёд
      K.armBlend(r, p3, 1, k, hx + fx * 0.1 - rx * 0.1, hy - 0.08, hz + fz * 0.1 - rz * 0.1);
      K.armBlend(r, p3, -1, k, hx + rx * 0.1, hy + 0.04, hz + rz * 0.1);
      p3.spine.rotation.x = 0.18 * k;
      // охранник: бьётся, руки к горлу; на хрусте голова рывком в сторону и обмякает
      const fl = (1 - sn) * k;
      n.armL.rotation.set(-1.0 + Math.sin(t * 17) * 0.4 * fl, 0, -0.4); n.armR.rotation.set(-1.1 + Math.cos(t * 19) * 0.4 * fl, 0, 0.4);
      n.elbL.rotation.x = -0.8; n.elbR.rotation.x = -0.8;
      n.spine.rotation.x = -0.12 * k + (-0.12) * sn;
      n.head.rotation.y = tk.dir * 2.0 * sn; n.head.rotation.z = tk.dir * 0.55 * sn; n.head.rotation.x = 0.1 * sn;
      n.legL.rotation.x = Math.sin(t * 15) * 0.25 * fl; n.legR.rotation.x = -Math.sin(t * 15) * 0.25 * fl;
      if (sn > 0.2 && !tk.snap) { tk.snap = true; K.snd(r, 'bodyhit', { k: 0.9 }); K.snd(r, 'click', { k: 1 }); K.snd(r, 'kick', { k: 0.3 }); }
    });
    const hp = () => [gp.x, 1.55, gp.z];
    const shots = [
      K.shot({ at: [bx - fx * 1.3 + rx * 0.55, 1.75, bz - fz * 1.3 + rz * 0.55], to: [bx - fx * 0.5 + rx * 0.4, 1.7, bz - fz * 0.5 + rz * 0.4], look: hp, fov: 50, dur: 1.2, hand: 0.5, tense: 1 }),
      K.shot({ at: [gp.x + rx * 1.5 + fx * 0.3, 1.55, gp.z + rz * 1.5 + fz * 0.3], to: [gp.x + rx * 1.1 + fx * 0.3, 1.55, gp.z + rz * 1.1 + fz * 0.3], look: hp, fov: 34, dur: 1.5, hand: 0.5, tense: 1 })
    ];
    await r.cinematic(shots);
    unhook(); F.rm(r, p3);
    r.damageEnemy(q, 9999, false);
    S.kills = (S.kills || 0) + 1; r.noise && r.noise(2);
  }

  // ================================================================== ПОДВАЛ B0: оружейная, броня, грузовой лифт
  const STANDS = [[-20.4, -20.6], [-18.0, -20.6], [-15.6, -20.6]];
  PH.base = async function (r, ctx) {
    const W = ctx.W, st = K.st(r);
    const T = st.team || await K.makeTeam(r, { D: [-9, 10.8, 0], G: [-7, 10.8, 0] });
    const d = T.d, g = T.g;
    K.lock(r);
    await r.clearEnemies();
    K.amb.set(r, 'none', { fade: 0.1 });
    W.enter('base', PX, 10.2, 0);
    const R = W.R.base, L = R.lift;
    put(d, PX - 1.1, 10.6, 0); put(g, PX + 1.2, 10.9, 0);
    d.g.visible = g.g.visible = true;
    K.amb.set(r, 'garage', { fade: 1.6 });
    K.cutFade(r, 1);
    // манекены брони на стендах
    const dummies = STANDS.map((s) => { const m = F.playerBody(r, s[0], s[1] - 0.15, 0); F.suit(r, m); return m; });
    await r.fade(0, 1.0);
    K.unlock(r);
    r.objective('FOLLOW DICTOR TO THE ARMOURY');
    K.say(r, 'Level B0. The armoury is on the left. Go.', 3.0);
    const lead = (n, pts, sp) => pts.reduce((pr, pt) => pr.then(() => K.ally.goto(r, n, pt, sp, { lead: 6, tol: 0.5 })), Promise.resolve());
    const wd = lead(d, [[-12.0, 2.4], [-17.2, -9.2], [STANDS[0][0] - 1.6, -18.4]], 2.5);
    K.ally.follow(r, [g], { side: 1, back: 2.0 });
    await r.beacon(-18.0, -17.4, 'ARMOURY', 3.0);

    // ---------------------------------------------------------- одевание: удержать E у среднего стенда
    r.objective('EQUIP THE HEAVY SUIT');
    await r.holdUse([STANDS[1][0], 1.4, STANDS[1][1] + 0.2], 'EQUIP HEAVY SUIT', 1.2, { meter: 'SUIT', reach: 3.2 });
    K.lock(r);
    await Promise.race([wd, r.wait(6)]);
    K.ally.idle(r, d); K.ally.idle(r, g);
    const p3 = F.playerBody(r, STANDS[1][0], -20.6, 0); p3.g.visible = false;
    put(d, STANDS[0][0] - 1.8, -18.6, PI * 0.5); put(g, STANDS[2][0] + 1.8, -18.6, -PI * 0.5);
    st.suit = true;
    const sh = (x) => K.shot(Object.assign({ dur: 3 }, x));
    const equip = () => {
      dummies.forEach((m) => F.rm(r, m));
      [d, g, p3].forEach((n) => F.suit(r, n));
      put(d, STANDS[0][0], -20.6, 0); put(g, STANDS[2][0], -20.6, 0); put(p3, STANDS[1][0], -20.6, 0); p3.g.visible = true;
      K.snd(r, 'draw', { k: 0.9 }); K.snd(r, 'rack', { k: 0.7 }); r.flash && r.flash(0.22); r.cineJolt && r.cineJolt(0.5);
    };
    const shots = [
      // 1: манекены брони — медленный подъезд
      sh({ at: [-18.0, 1.5, -15.4], to: [-18.0, 1.55, -17.2], look: [-18.0, 1.4, -20.7], fov: 52, dur: 3.6, hand: 0.5,
        says: [[DIC, 'Heavy assault suits. Eight hundred kilos of armour and hydraulics between the three of us.', 5.0]] }),
      // 2: надевают — вспышка, поворот лицом к камере
      sh({ at: [-18.0, 1.0, -14.6], to: [-18.0, 1.5, -15.4], look: [-18.0, 1.4, -20.3], fov: 62, dur: 4.6, hand: 0.6, tense: 0.4,
        run: () => { setTimeout(equip, 1700); },
        says: [[DIC, 'Walk slow. It will feel like wading through water. Nothing gets through that plating.', 4.8]] }),
      // 3: крупный план Диктора в броне, красное забрало
      sh({ at: [STANDS[0][0] + 0.3, 1.66, -16.6], to: [STANDS[0][0] + 0.2, 1.66, -17.4], look: () => [d.g.position.x, 1.62, d.g.position.z], fov: 28, dur: 5.2, hand: 0.5, tense: 0.2,
        says: [[DIC, 'Remember!', 1.8], [DIC, 'Not a word of Russian.', 3.0]] }),
      C.cin.pov(r, 1.6, { extra: { cut: 'dip', whip: false, frame: 0 } })
    ];
    r.p.x = STANDS[1][0]; r.p.z = -17.6; r.p.yaw = PI; r.p.pitch = 0;
    await r.cinematic(shots);
    F.rm(r, p3);
    equip.done = true;
    if (!d.suitMeshes) { dummies.forEach((m) => F.rm(r, m)); [d, g].forEach((n) => F.suit(r, n)); }
    put(d, STANDS[0][0] + 0.2, -19.0, PI); put(g, STANDS[2][0] - 0.2, -19.0, PI);
    K.unlock(r);

    // ---------------------------------------------------------- к лифту
    r.objective('TAKE THE FREIGHT ELEVATOR');
    lead(d, [[-2.0, -17.6], [-1.0, -21.2]], 1.9);
    K.ally.follow(r, [g], { side: 1, back: 2.0 });
    await r.beacon(0, -20.2, 'ELEVATOR', 2.4);
    K.ally.idle(r, d); K.ally.idle(r, g);
    K.lock(r);
    r.waypoint && r.waypoint(null);
    const p4 = K.pbody(r, 0, -19.4, 0);
    r.p.x = 0; r.p.z = -19.4; r.p.yaw = 0; r.p.pitch = 0;
    put(d, -1.0, -21.0, 0); put(g, 1.1, -21.0, 0);
    let fl = 0;
    const shots2 = [
      // 1: перед лифтом — створки расходятся, команда входит
      sh({ at: [0, 1.6, -15.6], to: [0.2, 1.7, -17.2], look: [0, 1.5, -24], fov: 52, dur: 5.2, hand: 0.6,
        run: () => {
          K.amb.pulse(r, 'ding'); L.open(r, 2.0);
          setTimeout(() => {
            r.walk(d, [-0.9, -25.6], 1.1); r.walk(g, [0.9, -25.6], 1.1);
            r.walk(p4, [0, -25.0], 1.1).then(() => { p4.yaw = 0; });
          }, 1400);
        },
        says: [[DIC, 'When these doors open, there is no way back.', 3.6]] }),
      // 2: из угла кабины — створки закрываются, табло
      sh({ at: [1.6, 1.95, -26.8], to: [1.3, 1.95, -26.5], look: [0, 1.4, -23.8], fov: 62, dur: 6.2, hand: 0.8, tense: 0.4,
        run: () => { L.close(r, 1.9); K.snd(r, 'slam', { k: 0.5 }); fl = 0; },
        tick: (rr, e, tt) => {
          if (fl === 0 && tt > 1.6) { fl = 1; L.setFloor('B0', 1); }
          if (fl === 1 && tt > 3.6) { fl = 2; L.setFloor('1', 1); K.snd(r, 'click', { k: 0.5 }); }
        },
        says: [[DIC, 'Ten counters. Hundreds of civilians. Keep walking and keep firing.', 4.2]] })
    ];
    await r.cinematic(shots2);
    K.cutFade(r, 1);
    F.rm(r, p4);
    K.amb.set(r, 'none', { fade: 0.8 });
    r.sub && r.sub.classList.remove('on');
    st.liftUp = true;
    K.unlock(r);
  };
}());
