// NEXA: миссия 48 — акт 3: этаж 1 (зал, десять очередей), дальше хранилище, газ, подвал.
// Весь текст — английский. Команда (Диктор + девушка) приходит из акта 2 в st.team.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.PH || !C.f48.K || !C.f48.K.hall || !C.f48.HALL || !C.f48.K.suitMode) return;
  const F = C.f48, K = F.K, PH = F.PH, { lerp, smooth } = C, PI = Math.PI;
  const DIC = 'DICTOR';
  const face = (n, tx, tz) => { n.yaw = Math.atan2(tx - n.g.position.x, tz - n.g.position.z); n.g.rotation.y = n.yaw; };
  const put = (n, x, z, yaw) => { n.g.position.set(x, 0, z); n.yaw = yaw; n.g.rotation.y = yaw; n.goal = null; K.ally.stop(n); };

  // ================================================================== ЗАЛ: этаж 1
  const NEED = 120;                                                 // столько целей нужно снять, чтобы лестница на 2-й этаж открылась (охрана ≈ 90 + до 30 гражданских)
  const POS = { d: [0, -39.6], p: [-1.7, -40.5], g: [1.7, -40.5] };
  PH.hall = async function (r, ctx) {
    const W = ctx.W, st = K.st(r);
    const T = st.team || await K.makeTeam(r, { D: [0, -47.6, 0], G: [1.2, -47.9, 0] });
    const d = T.d, g = T.g;
    K.lock(r);
    await r.clearEnemies();
    K.amb.set(r, 'none', { fade: 0.1 });
    W.enter('hall', -1.1, -47.9, PI);
    const R = W.R.hall, L = R.lift;
    r.noFight = true;
    K.cutFade(r, 1);
    st.suit = true;
    // команда в кабине, лицом к залу
    const p4 = K.pbody(r, -1.1, -47.9, 0); F.npcMinigun(r, p4);
    put(d, 0, -47.6, 0); put(g, 1.2, -47.9, 0);
    d.g.visible = g.g.visible = true;
    [d, g].forEach((n) => { if (!n.suitMeshes) F.suit(r, n); });   // команда уже в броне из акта 2 (при прыжке ?m48=hall — надеваем здесь)
    r.p.x = -1.1; r.p.z = -47.9; r.p.yaw = PI; r.p.pitch = 0; r.spawnPt = [POS.p[0], POS.p[1], PI];
    const fov0 = r.baseFov;
    K.hall.begin(r, R, { team: { d, g } });             // зал уже полон людей: очереди у десяти касс, охрана на постах
    const mus = r.musicTrack('osttdictor', { vol: 0.95 });
    K.amb.set(r, 'hall', { fade: 0.1 });
    L.setFloor('B0', -1);

    // ---------------------------------------------------------- катсцена: лифт звякает, створки расходятся, трое выходят
    let ding = false, go = false, spinHook = null, spin = 0;
    const sh = (x) => K.shot(Object.assign({ dur: 3 }, x));
    const lead = (n, to, sp) => r.walk(n, to, sp);
    const shots = [
      // 1: общий — очереди у касс, вдали закрытый лифт; через 2 с — звон
      sh({ at: [-9, 3.4, 12], to: [-6.5, 2.7, -12], look: [0, 1.8, -46], lookTo: [0, 1.9, -46], fov: 60, dur: 5.0, hand: 0.5, tense: 0.1,
        run: () => { r.fade(0, 1.4); },
        tick: (rr, e, tt) => {
          if (!ding && tt > 2.0) { ding = true; K.amb.pulse(r, 'ding'); L.setFloor('1', 1); K.hall.turnPairs(r, 0, -46); L.open(r, 2.4); }
          if (!go && tt > 3.4) { go = true; lead(d, [POS.d[0], POS.d[1]], 1.25); lead(p4, [POS.p[0], POS.p[1]], 1.25); lead(g, [POS.g[0], POS.g[1]], 1.25); }
        } }),
      // 2: низко у лифта — створки открыты, трое в броне выходят из кабины
      sh({ at: [0.6, 0.95, -33.5], to: [0.1, 1.05, -35.5], look: [0, 1.6, -46.8], fov: 44, dur: 5.4, hand: 0.5, tense: 0.4 }),
      // 3: из-за спин — трое идут в зал
      sh({ at: [0.9, 1.8, -44.2], to: [0.7, 1.85, -43.0], look: [0, 1.6, -26], lookTo: [0, 1.7, -22], fov: 56, dur: 4.4, hand: 0.5, tense: 0.3,
        says: [[DIC, 'Floor one. Ten counters. Three hundred witnesses.', 3.8]] }),
      // 4: Диктор крупно — визор, фирменная фраза
      sh({ at: [POS.d[0] + 0.6, 1.66, POS.d[1] + 2.0], to: [POS.d[0] + 0.35, 1.66, POS.d[1] + 1.5], look: () => [d.g.position.x, 1.62, d.g.position.z], fov: 28, dur: 5.0, hand: 0.5, tense: 0.2,
        says: [[DIC, 'Remember!', 1.6], [DIC, 'Not a word of Russian.', 3.0]] }),
      // 5: тишина — стволы миниганa раскручиваются
      sh({ at: [POS.p[0] + 0.5, 0.85, POS.p[1] + 1.5], to: [POS.p[0] + 0.3, 0.95, POS.p[1] + 1.2], look: () => [p4.g.position.x - 0.1, 1.15, p4.g.position.z + 0.3], fov: 36, dur: 3.5, hand: 0.4, tense: 0.9,
        run: () => {
          K.amb.set(r, 'none', { fade: 0.3 });
          setTimeout(() => { K.amb.pulse(r, 'spinup', 1); }, 350);
          const t0 = r.time;
          spinHook = K.hook(r, () => { if (p4.mgSpin) { const k = Math.min(1, (r.time - t0) / 3.0); spin += (0.2 + 38 * k * k) * (1 / 60); p4.mgSpin.rotation.z = spin; } });
        } }),
      C.cin.pov(r, 1.6, { extra: { cut: 'dip', whip: false, frame: 0 } })
    ];
    r.p.x = POS.p[0]; r.p.z = POS.p[1]; r.p.yaw = PI; r.p.pitch = 0;
    await r.cinematic(shots);
    spinHook && spinHook();
    r.fade(0, 0.4);                                                  // если катсцену пропустили до первого шота, экран ещё чёрный
    F.rm(r, p4);
    put(d, POS.d[0] + 1.2, POS.d[1] + 2.4, 0); put(g, POS.g[0] + 0.4, POS.g[1] + 2.0, 0);
    K.amb.set(r, 'hall', { fade: 2.0 }); K.amb.level(r, 0.5);
    r.sub && r.sub.classList.remove('on');
    K.unlock(r);

    // ---------------------------------------------------------- бойня: игрок в броне с миниганом, зал в панике, охрана со всех сторон
    let first = true;
    await r.phase('hall', async () => {
      let S = r.f48hall;
      if (first) first = false;
      else {                                                           // повтор после смерти: зал собирается заново
        K.hall.dispose(r);
        r.p.x = POS.p[0]; r.p.z = POS.p[1]; r.p.yaw = PI; r.p.pitch = 0;
        put(d, POS.d[0] + 1.2, POS.d[1] + 2.4, 0); put(g, POS.g[0] + 0.4, POS.g[1] + 2.0, 0);
        S = K.hall.begin(r, R, { team: { d, g } });
      }
      if (!S) S = K.hall.begin(r, R, { team: { d, g } });
      const ok = () => r.f48hall === S && !S.dead;
      r.noFight = true;
      K.suitMode(r, true);
      K.suitFov(r, 102, 0.6);
      K.stress(r, 1, 5);                                               // экран плывёт: сильный стресс героя
      mus.play(2.0, true);
      K.ally.follow(r, [d], { side: -1, back: 3.0 });                  // у каждого свой слот: Диктор слева-сзади, девушка справа-сзади
      K.ally.follow(r, [g], { side: 1, back: 3.6 });
      r.objective('CLEAR THE HALL   0 / ' + NEED);
      r.hint('HOLD LMB — THE MINIGUN SPINS UP FIRST', 5);
      let last = -1, open = false, lastOrder = -9;
      const total = () => S.kills + Math.min(S.civKills, 30);
      const orders = [
        [(s) => s.t > 2.5, 'Walk through them. Nothing in this building can hurt you.', 3.8],
        [(s) => s.alarm && s.t > 8, 'Alarm is up. Good. Let them come to us.', 3.2],
        [(s) => s.t > 26, 'Guards at the gates. Cut them down.', 3.0],
        [(s) => total() >= 18, 'Do not stop. Fire at everything that moves.', 3.2],
        [(s) => s.t > 55, 'More of them from the north corridors. Hold the centre.', 3.4],
        [(s) => total() >= 50, 'Keep firing. The stairs unlock when the floor is clear.', 3.6],
        [(s) => s.t > 120, 'Security is pulling everything it has. Let them.', 3.4],
        [(s) => total() >= 90, 'Almost there. Do not let up.', 3.2],
        [(s) => total() >= NEED, 'Stairs are open. Go! Go!', 3.0]
      ];
      const done = orders.map(() => false);
      const off = K.hook(r, (dt) => {
        if (!ok() || r.locked || r.cineDepth > 0) return;
        const t = total();
        if (t !== last) { last = t; if (!open) r.objective('CLEAR THE HALL   ' + Math.min(t, NEED) + ' / ' + NEED); }
        for (let i = 0; i < orders.length; i += 1) if (!done[i] && orders[i][0](S) && (S.t - lastOrder > 5 || i === orders.length - 1)) { done[i] = true; lastOrder = S.t; K.say(r, orders[i][1], orders[i][2]); break; }
      });
      S.offs.push(off);
      await r.until(() => !ok() || total() >= NEED || S.t > 420);
      if (!ok()) return;
      open = true;
      r.objective('REACH THE VAULT STAIRS');
      r.hint('THE STAIRS TO LEVEL 2 ARE AHEAD', 3.5);
      await r.beacon(0, 13.4, 'VAULT STAIRS', 2.4);
    }, { pos: [0, 12.8, PI], weapons: ['minigun'], set: () => { } });

    // ---------------------------------------------------------- выход: чёрный экран, зал снимаем
    K.lock(r);
    K.stress(r, 0, 1.2);
    mus.stop(2.0);
    K.hall.dispose(r);
    await r.fade(1, 1.2);
    await r.clearEnemies();
    r.waypoint && r.waypoint(null);
    r.baseFov = fov0;
    r.noFight = false;
    st.hallDone = true;
    K.unlock(r);
  };
}());
