// NEXA: миссия 48 — акт 1: перестрелка на складе (wh) → фальшивое «миссия выполнена» + мешок (fake) → кабинет Диктора (office).
// Весь текст — английский. Актёры кабинета: Диктор (серый, сидит), девушка (курит), игрок (чёрный стикмен на стуле). Позы — поверх updateNpc из kitUpd.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.PH || !C.f48.K || !C.f48.World || !C.f48.woman) return;
  const F = C.f48, K = F.K, PH = F.PH, { lerp, smooth } = C, PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = (a) => { a %= TAU; if (a > PI) a -= TAU; if (a < -PI) a += TAU; return a; };
  const DIC = 'DICTOR';
  const SH = [[-0.2, 0.46, 0], [0.2, 0.46, 0]];

  // ------------------------------------------------------------------ общие помощники актёров
  // рука side (−1 = armL, 1 = armR) тянется к точке в системе корпуса (spine): x вправо-лево, y вверх от пояса, z вперёд
  K.armLocal = function (r, n, side, x, y, z) {
    const v = K._v || (K._v = new THREE.Vector3()); v.set(x, y, z);
    if (side < 0) r.solveArm(n.armL, n.elbL, SH[0], v, -1); else r.solveArm(n.armR, n.elbR, SH[1], v, 1);
  };
  // сидячая поза с плавным вставанием: k = 1 сидит, 0 — стоит (смешивается с позой updateNpc текущего кадра)
  K.sitK = function (n, k, o) {
    o = o || {};
    const L = lerp, hy = o.hy === undefined ? 0.52 : o.hy, lx = o.lx === undefined ? -1.45 : o.lx, kn = o.kn === undefined ? 1.5 : o.kn;
    n.hips.position.y = L(n.hips.position.y, hy, k); n.hips.rotation.set(L(n.hips.rotation.x, 0, k), L(n.hips.rotation.y, 0, k), L(n.hips.rotation.z, 0, k));
    n.legL.rotation.set(L(n.legL.rotation.x, lx, k), 0, L(n.legL.rotation.z, -0.08, k)); n.legR.rotation.set(L(n.legR.rotation.x, lx, k), 0, L(n.legR.rotation.z, 0.08, k));
    n.kneeL.rotation.x = L(n.kneeL.rotation.x, kn, k); n.kneeR.rotation.x = L(n.kneeR.rotation.x, kn, k);
    n.footL.rotation.x = L(n.footL.rotation.x, -0.1, k); n.footR.rotation.x = L(n.footR.rotation.x, -0.1, k);
    n.spine.rotation.x = L(n.spine.rotation.x, o.sx === undefined ? -0.06 : o.sx, k);
    n.armL.rotation.set(L(n.armL.rotation.x, -0.5, k), 0, L(n.armL.rotation.z, -0.1, k)); n.armR.rotation.set(L(n.armR.rotation.x, -0.5, k), 0, L(n.armR.rotation.z, 0.1, k));
    n.elbL.rotation.x = L(n.elbL.rotation.x, -1.25, k); n.elbR.rotation.x = L(n.elbR.rotation.x, -1.25, k);
  };
  // голова поворачивается к точке мира (w — вес, s — состояние для сглаживания)
  K.headLook = function (n, tx, tz, w, S, dt, pitch) {
    const ang = clamp(wrap(Math.atan2(tx - n.g.position.x, tz - n.g.position.z) - n.g.rotation.y), -1.15, 1.15);
    S.hy = lerp(S.hy || 0, ang * w, 1 - Math.exp(-dt * 5)); S.hp = lerp(S.hp || 0, pitch || 0, 1 - Math.exp(-dt * 4));
    n.head.rotation.y = S.hy; n.head.rotation.x = S.hp;
  };
  // рука тянется к мировой точке с весом w (0 — поза updateNpc, 1 — чистый IK)
  // рука с весом w: fn() ставит желаемую позу, результат смешивается с той, что была до вызова
  K.armMix = function (r, n, side, w, fn) {
    const a = side < 0 ? n.armL : n.armR, e = side < 0 ? n.elbL : n.elbR, ax = a.rotation.x, ay = a.rotation.y, az = a.rotation.z, ex = e.rotation.x;
    fn();
    a.rotation.x = lerp(ax, a.rotation.x, w); a.rotation.y = lerp(ay, a.rotation.y, w); a.rotation.z = lerp(az, a.rotation.z, w); e.rotation.x = lerp(ex, e.rotation.x, w);
  };
  K.armBlend = (r, n, side, w, wx, wy, wz) => K.armMix(r, n, side, w, () => F.armTo(r, n, side, wx, wy, wz));
  K.lock = (r) => { const st = K.st(r); if (st.locked) return; st.locked = true; r.cineDepth += 1; r.syncLock(); };
  K.unlock = (r) => { const st = K.st(r); if (!st.locked) return; st.locked = false; r.cineDepth = Math.max(0, r.cineDepth - 1); r.syncLock(); };
  // мгновенная установка чёрного слоя (без анимации)
  K.cutFade = (r, a) => { const f = r.qs('.m-fade'); f.style.transition = 'none'; f.style.opacity = String(a); void f.offsetWidth; };
  K.snd = (r, name, o) => { try { r.snd && r.snd.has && r.snd.has(name) ? r.snd.play(name, o) : r.snd && r.snd.play(name, o); } catch (e) { /* звук не критичен */ } };
  K.removeAll = (r, list) => list.forEach((n) => n && F.rm(r, n));

  // ================================================================== ФАЗА 1 — СКЛАД: «обычная» миссия (запустить три генератора под огнём)
  // Звук — стандартный фон миссий (industrial); со вставкой мешка он выключается, дальше фон ведёт f48audio.js.
  PH.wh = async function (r, ctx) {
    const W = ctx.W;
    K.ambStd(r, 'industrial');
    W.enter('wh', 0, 15, 0);
    const R = W.R.wh, gens = R.gens;
    const GL = [0.45, 0.62, 0.8, 1];                                   // освещённость склада после 0..3 запущенных генераторов
    const light = (n) => { r.baseLight = GL[n]; r.lightsLevel(GL[n]); };
    const lampOn = (i, on) => { gens[i].lamp.material = r.basic(on ? 0x6aff8a : 0xb02a2a); };
    gens.forEach((g, i) => lampOn(i, false));
    light(0);
    r.objective('RESTORE THE POWER — 3 GENERATORS');
    r.say('NEXA/OS', 'DEPOT 14: MAIN POWER LOST. START ALL THREE GENERATORS.', 3.2);
    r.hint(r.ctl(), 4);
    r.pickup(-9.5, 9, 'ammo', { id: 'glock', amount: 45 }); r.pickup(10.5, 5, 'health', { amount: 50 });
    r.pickup(-3, 11.5, 'weapon', { id: 'ak', equip: false }); r.pickup(8, 10, 'ammo', { id: 'ak', amount: 90 });
    // волны для каждого генератора: [секунда, [[тип, x, z, опции?]…]]
    const GATES = [-12.5, 0.5, 12.5];
    const WAVES = [
      [[1.5, [['grunt', GATES[0], -24], ['grunt', GATES[1], -24.5], ['grunt', GATES[2], -24]]], [9, [['rusher', -17.8, 4], ['rusher', 17.8, 4]]]],
      [[1.0, [['grunt', GATES[0], -24], ['grunt', GATES[2], -24], ['heavy', GATES[1], -24.5, { hp: 0.8 }]]], [7, [['rusher', -17.8, 4], ['rusher', 17.8, 4], ['rusher', 0.5, -24.5]]], [14, [['grunt', 16.5, -25.5], ['grunt', -16.5, -25.5]]]],
      [[1.0, [['grunt', GATES[0], -24], ['grunt', GATES[1], -24.5], ['grunt', GATES[2], -24], ['heavy', 16.5, -25.5, { hp: 0.9 }]]], [6, [['rusher', -17.8, 4], ['rusher', 17.8, 4], ['rusher', -17.8, -6], ['rusher', 17.8, -6]]], [13, [['grunt', GATES[0], -24], ['grunt', GATES[2], -24], ['heavy', GATES[1], -24.5, { hp: 0.9 }]]]]
    ];
    for (let i = 0; i < 3; i += 1) {
      const g = gens[i];
      await r.phase('gen' + (i + 1), async () => {
        light(i);
        gens.forEach((q, k) => lampOn(k, k < i));
        r.objective('RESTORE GENERATOR ' + (i + 1) + ' OF 3');
        r.pickup(g.hx + Math.cos(g.yaw) * 1.6, g.hz - Math.sin(g.yaw) * 1.6, 'ammo', { id: 'glock', amount: 30 });
        r.pickup(g.hx - Math.cos(g.yaw) * 1.6, g.hz + Math.sin(g.yaw) * 1.6, 'health', { amount: 35 });
        await r.beacon(g.hx, g.hz, 'GENERATOR ' + (i + 1), 3);
        let done = false;
        const flick = r.addHook((dt) => { if (!done && Math.random() < dt * 3.2) g.lamp.visible = !g.lamp.visible; });   // мигает, пока не запущен
        const hold = r.holdUse([g.x, 1.4, g.z], 'START GENERATOR', 9, { meter: 'GENERATOR', reach: 3.4, onStart: () => K.snd(r, 'click', { k: 0.6 }) });
        (async () => {
          let prev = 0;
          for (const w of WAVES[i]) { await r.wait(Math.max(0.2, w[0] - prev)); prev = w[0]; if (done || r.disposed) return; r.spawnWave(w[1], { gap: 0.5 }); }
        })();
        await hold; done = true; flick(); g.lamp.visible = true;
        lampOn(i, true); r.sfx('notification'); light(i + 1);
        r.hint('GENERATOR ' + (i + 1) + ' ONLINE', 2.4);
        await r.waitClear(0);
        if (i < 2) { r.say('NEXA/OS', 'GENERATOR ' + (i + 1) + ' ONLINE. NEXT ONE — FOLLOW THE MARKER.', 2.4); await r.wait(1.4); }
      }, {
        pos: [g.hx, g.hz, g.yaw + PI], weapons: ['glock'],
        set: () => { gens.forEach((q, k) => lampOn(k, k <= i)); light(i + 1); }
      });
    }
    r.objective('POWER RESTORED');
    r.stage('power');
  };

  // ================================================================== ФАЗА 2 — ФАЛЬШИВЫЙ ФИНАЛ И МЕШОК
  PH.fake = async function (r, ctx) {
    await r.endCombat();
    r.objective('AREA CLEAR');
    K.lock(r);
    await r.wait(1.4);
    // «настоящий» экран завершения миссии, как в r.complete()
    await r.fade(1, 1.1);
    const end = r.qs('.m-end'), h2 = end.querySelector('h2'), pp = end.querySelector('p');
    h2.textContent = 'MISSION COMPLETE'; pp.innerHTML = 'SUBJECT 083<br>RETURNING TO TERMINAL...';
    end.classList.add('on'); r.sfx('succesfully');
    await r.wait(2.6);
    end.classList.remove('on'); await r.wait(0.9);
    h2.textContent = 'NEXA/OS'; pp.innerHTML = 'SYSTEM READY'; end.classList.add('on');
    await r.wait(1.15);
    // удар сзади: экран исчезает, мешок падает на голову
    K.snd(r, 'thud'); K.snd(r, 'slam', { k: 0.6 });
    end.classList.remove('on'); K.cutFade(r, 0);
    r.glitch(0.25); r.shake(0.12, 1.0);
    K.amb.set(r, 'none', { fade: 0.25 });                // обычный фон миссий выключен навсегда — дальше эмбиент ведёт f48audio.js
    r.p.pitch = -0.22;
    await K.sackFx(r, true, 0.16);
    K.snd(r, 'rustle');
    r.tween(1.2, (k) => { r.p.pitch = lerp(-0.22, 0.0, smooth(k)); });
    K.sackLevel(r, 1);
    await r.wait(0.5);
    r.say('VOICE', 'Sleep tight, 083.', 2.2);
    await r.wait(2.2);
    await r.fade(1, 1.4);
    K.sackLevel(r, 1);
    r.sub && r.sub.classList.remove('on');
    r.clearPickups && r.clearPickups();
    await r.wait(2.4);                                  // «через ~5 с» — чёрный экран, глухие звуки
    K.amb.set(r, 'office', { fade: 3.2 });
    await r.wait(1.8);
  };

  // ================================================================== ФАЗА 3 — КАБИНЕТ
  const OFC = { P: [0, 0.6], D: [0, -4.4], G: [-3.45, -1.0], RACK: [4.75, -1.2], ASH: [-3.6, -1.3] };
  PH.office = async function (r, ctx) {
    const W = ctx.W, st = K.st(r);
    await r.clearEnemies();
    W.enter('office');
    const R = W.R.office;
    K.lock(r);
    // ---------------------------------------------------------- актёры
    const d = F.dictor(r, OFC.D[0], OFC.D[1], 0);
    const g = await F.woman(r, OFC.G[0], OFC.G[1], PI / 2);
    const p = F.playerBody(r, OFC.P[0], OFC.P[1], PI);
    await d.ready;
    F.cigarette(r, g, 'R');
    const smoke = F.smoke(r);
    // игрок смотрит на стол: руки за спиной, голова чуть опущена
    r.p.x = OFC.P[0]; r.p.z = OFC.P[1]; r.p.yaw = 0; r.p.pitch = 0;
    // миниган на коленях игрока (после вручения)
    const lap = F.mgMesh(); lap.scale.setScalar(1.1); lap.position.set(0, 0.86, 0.3); lap.visible = false; r.scene.add(lap);
    const S = { on: true, dead: false, t: 0, dSit: 1, dFold: 1, dGest: 0, dLook: 'p', gLook: 'd', gSmoke: 1, gStub: 0, pGrab: 0, pHead: 0, handW: 0, hd: {}, hg: {}, hp: {}, cyc: 0, tipT: 0, take: 0, sack: null, sackK: 0, gWalkBehind: 0 };
    st.office = S;
    const V = new THREE.Vector3(), V2 = new THREE.Vector3();
    const tgt = (who) => who === 'p' ? [OFC.P[0], OFC.P[1]] : who === 'g' ? [g.g.position.x, g.g.position.z] : who === 'd' ? [d.g.position.x, d.g.position.z] : who;

    const upd = (dt) => {
      if (!S.on || !(dt > 0)) return;
      dt = Math.min(dt, 0.05); S.t += dt;
      const t = S.t;
      // ---------------- Диктор
      if (d.g.parent) {
        if (S.dSit > 0.001) K.sitK(d, S.dSit, { hy: 0.56, sx: -0.02 });
        if (S.dFold > 0.01 && S.dSit > 0.5) { // руки сомкнуты у груди, на выразительных словах правая раскрывается
          const gx = S.dGest, br = Math.sin(t * 1.6) * 0.004;
          K.armLocal(r, d, -1, -0.05, 0.2 + br, 0.34);
          K.armLocal(r, d, 1, lerp(0.05, 0.3, gx), lerp(0.2, 0.34 + Math.sin(t * 2.3) * 0.03, gx) + br, lerp(0.34, 0.5, gx));
        }
        const tt = tgt(S.dLook);
        if (S.dLook) K.headLook(d, tt[0], tt[1], 1, S.hd, dt, -0.03 + Math.sin(t * 0.7) * 0.02);
        if (S.handW > 0.001) { // передача минигана: обе руки ведут ствол к коленям игрока
          const q = lap.position, w = smooth(S.handW);
          K.armBlend(r, d, -1, w, q.x - 0.1, q.y - 0.02, q.z - 0.2); K.armBlend(r, d, 1, w, q.x + 0.1, q.y - 0.02, q.z - 0.2);
        }
      }
      // ---------------- девушка: затяжка по циклу 7 с, левая рука поддерживает локоть
      if (g.g.parent && S.gSmoke > 0.001) {
        if (!S.stubbing) S.cyc = (S.cyc + dt) % 7.2;
        const c = S.stubbing ? 0 : S.cyc, up = c < 2.4 ? 0 : c < 3.2 ? smooth((c - 2.4) / 0.8) : c < 4.5 ? 1 : c < 5.3 ? 1 - smooth((c - 4.5) / 0.8) : 0, w = smooth(S.gSmoke);
        K.armMix(r, g, -1, w, () => K.armLocal(r, g, -1, 0.12, 0.17, 0.2));
        K.armMix(r, g, 1, w, () => {
          K.armLocal(r, g, 1, lerp(0.17, 0.02, up), lerp(0.3, 0.52, up), lerp(0.2, 0.2, up));
          if (S.stub > 0.001) K.armBlend(r, g, 1, smooth(S.stub), OFC.ASH[0] + 0.02, 0.88 + (S.press || 0) * -0.03, OFC.ASH[1]);   // рука с сигаретой тянется к пепельнице
        });
        const tt = tgt(S.gLook === 'd' ? 'd' : S.gLook);
        K.headLook(g, tt[0], tt[1], 0.6, S.hg, dt, lerp(0.02, -0.28, up * (c > 4.0 && c < 5.0 ? 1 : 0)));
        // дым: тонкая струйка с кончика сигареты, выдох после затяжки
        S.tipT -= dt;
        if (S.tipT <= 0 && g.cig && !S.stubbed) { S.tipT = 0.16; g.cig.tip.getWorldPosition(V); smoke.emit(V, [0.01, 0.14 + Math.random() * 0.05, 0.01], { life: 3.4, s0: 0.025, s1: 0.3, a: 0.34 }); }
        if (c > 4.5 && c < 4.62 && !S.exh && !S.stubbed) { S.exh = true; g.head.localToWorld(V.set(0, 0.1, 0.13)); for (let i = 0; i < 6; i += 1) smoke.emit(V, [0.07 + Math.random() * 0.1, 0.05 + Math.random() * 0.06, 0.1 + Math.random() * 0.12], { life: 2.8 + Math.random(), s0: 0.04, s1: 0.5, a: 0.5 }); }
        if (c < 4.4) S.exh = false;
      }
      // ---------------- игрок: сидит, руки за спиной / принимает миниган
      if (p.g.parent) {
        F.sit(p, { hy: 0.56, sx: 0.0 });
        const gr = smooth(S.pGrab);
        p.armL.rotation.set(lerp(0.5, -1.2, gr), 0, lerp(-0.28, -0.1, gr)); p.elbL.rotation.x = lerp(-0.15, -0.55, gr);
        p.armR.rotation.set(lerp(0.5, -1.2, gr), 0, lerp(0.28, 0.1, gr)); p.elbR.rotation.x = lerp(-0.15, -0.55, gr);
        if (gr > 0.01) { K.armLocal(r, p, -1, lerp(-0.2, -0.12, gr), lerp(0.1, 0.0, gr), lerp(0.1, 0.34, gr)); K.armLocal(r, p, 1, lerp(0.2, 0.1, gr), lerp(0.1, 0.0, gr), lerp(0.1, 0.4, gr)); }
        p.head.rotation.set(lerp(0.05, 0.5, S.pHead) + Math.sin(t * 0.8) * 0.01, S.pLook || 0, 0);
        if (S.sackK > 0 && S.sack) { S.sack.position.y = lerp(0.62, 0.07, smooth(S.sackK)); }
      }
      if (S.take > 0 && R.mg) lap.rotation.z = Math.sin(t * 1.3) * 0.005;
    };
    const unhook = K.hook(r, (dt) => { try { upd(dt); } catch (e) { if (!S.err) { S.err = 1; console.error('[f48 office]', e); } } });

    // ---------------------------------------------------------- последовательности (отменяются флагом dead)
    const CANCEL = { cancel: true };
    const wt = async (s) => { await r.wait(s); if (S.dead) throw CANCEL; };
    const seqStand = async () => {
      await wt(0.5);
      await r.tween(1.0, (k) => { S.dSit = 1 - smooth(k); S.dFold = 1 - smooth(Math.min(1, k * 1.6)); }); if (S.dead) throw CANCEL;
      S.dSit = 0; S.dFold = 0; S.dLook = null;
      K.snd(r, 'rustle');
      d.g.position.set(0, 0, -4.05);
      await r.walk(d, [2.6, -4.1], 1.5); if (S.dead) throw CANCEL;
      await r.walk(d, [4.45, -2.2], 1.5); if (S.dead) throw CANCEL;
      await r.walk(d, [OFC.RACK[0], OFC.RACK[1]], 1.2); if (S.dead) throw CANCEL;
      d.yaw = PI / 2;
    };
    const seqTake = async () => { // рука к миниганy, снимает с кронштейнов, поднимает
      d.yaw = PI / 2;
      await wt(0.6);
      R.mg.visible = false; K.snd(r, 'rack'); K.snd(r, 'draw', { k: 0.7 });
      F.npcMinigun(r, d); d.armT = 0; d.holster = false; S.take = 1;
      await wt(0.8);
    };
    const seqBring = async () => {
      await r.walk(d, [3.4, -1.15], 1.15); if (S.dead) throw CANCEL;
      await r.walk(d, [0.15, -0.8], 1.1); if (S.dead) throw CANCEL;
      await r.turn(d, [OFC.P[0], OFC.P[1]], 0.8); if (S.dead) throw CANCEL;
      S.dLook = 'p';
    };
    const LAP = [0, 0.86, 0.3];
    const seqHand = async () => { // миниган уходит из рук Диктора на колени игрока; руки Диктора ведут ствол, игрок хватается
      const from = new THREE.Vector3(); d.gunG.updateWorldMatrix(true, false); d.gunG.getWorldPosition(from);
      r.setGun(d, null); lap.visible = true; lap.position.copy(from); lap.rotation.set(0, 0, 0);
      S.handW = 1; S.hand = true;
      await r.tween(0.9, (k) => {
        const e = smooth(k); lap.position.set(lerp(from.x, LAP[0], e), lerp(from.y, LAP[1], e) + Math.sin(e * PI) * 0.08, lerp(from.z, LAP[2], e));
        S.pGrab = smooth(clamp((k - 0.45) / 0.55, 0, 1)); S.pHead = smooth(k);
      }); if (S.dead) throw CANCEL;
      K.snd(r, 'click', { k: 0.5 });
      await r.tween(0.6, (k) => { S.handW = 1 - smooth(k); }); if (S.dead) throw CANCEL;
      S.hand = false; S.handW = 0;
      await r.walk(d, [1.35, -1.0], 0.8); if (S.dead) throw CANCEL;
      r.turn(d, [OFC.P[0], OFC.P[1]], 0.5);
    };
    const seqStub = async () => { // девушка в последний раз затягивается и гасит сигарету в пепельнице
      S.stubbing = true; S.stub = 0;
      await wt(0.4);
      await r.tween(0.9, (k) => { S.stub = k; }); if (S.dead) throw CANCEL;
      await r.tween(0.35, (k) => { S.press = k; }); if (S.dead) throw CANCEL;       // вдавливает окурок
      K.snd(r, 'click', { k: 0.4 });
      S.stubbed = true; if (g.cig) g.cig.g.visible = false;
      V.set(OFC.ASH[0] + 0.02, 0.9, OFC.ASH[1]);
      for (let i = 0; i < 5; i += 1) smoke.emit(V, [0.02 * (i - 2), 0.12 + Math.random() * 0.05, 0.02], { life: 2.6, s0: 0.03, s1: 0.28, a: 0.32 });
      await r.tween(0.5, (k) => { S.press = 1 - k; }); if (S.dead) throw CANCEL;
      await r.tween(0.9, (k) => { S.stub = 1 - smooth(k); }); if (S.dead) throw CANCEL;
      S.stubbing = false; S.stub = 0;
    };
    const seqSack = async () => { // девушка обходит стул сзади и надевает мешок
      r.tween(0.7, (k) => { S.gSmoke = 1 - smooth(k); });
      await r.walk(g, [-1.2, 1.9], 1.4); if (S.dead) throw CANCEL;
      await r.walk(g, [0, 1.3], 1.1); if (S.dead) throw CANCEL;
      await r.turn(g, [0, -5], 0.6); if (S.dead) throw CANCEL;
      S.sack = F.sack(p.head, 1); S.sack.position.y = 0.62; S.sackK = 0;
      S.gArms = true;
      await r.tween(1.0, (k) => { S.sackK = k; }); if (S.dead) throw CANCEL;
      K.snd(r, 'rustle');
      await wt(0.4);
    };
    // руки девушки с мешком (по кадру, после появления мешка): она стоит лицом к −Z, её левая рука — на мировой +X
    const unhook3 = K.hook(r, (dt) => {
      if (!S.gArms || !g.g.parent || !S.sack) return;
      const y = S.sack.position.y; // относительно головы игрока
      p.head.localToWorld(V.set(0.0, y + 0.12, 0.02));
      K.armBlend(r, g, -1, 1, V.x + 0.13, V.y, V.z); K.armBlend(r, g, 1, 1, V.x - 0.13, V.y, V.z);
    });

    // ---------------------------------------------------------- шоты
    const o = F.OF;
    const sh = (x) => K.shot(Object.assign({ dur: 3 }, x));
    const dpos = () => [d.g.position.x, 1.1, d.g.position.z];
    let seq = null;
    const go = (fn) => { seq = fn().catch((e) => { if (e !== CANCEL) console.error('[f48 seq]', e); }); return seq; };
    const shots = [
      // 1: под мешком — глухой голос, мешок срывают
      sh({ at: [0, 1.18, 0.62], to: [0, 1.2, 0.5], look: [0, 1.22, -4.4], lookTo: [0.25, 1.2, -4.4], fov: 64, dur: 3.8, hand: 1.4, tense: 0.5,
        run: () => { p.g.visible = false; K.sackLevel(r, 1); r.fade(0, 0.8); S.yank = false; },
        tick: (rr, e, tt) => { if (tt < 2.4) K.sackLevel(r, 1 - 0.09 * smooth(Math.min(1, tt / 1.4))); else if (!S.yank) { S.yank = true; K.snd(r, 'rustle'); K.sackFx(r, false, 0.55, { rot: -9 }); } },
        says: [[DIC, 'Wake up, 083.', 1.4]] }),
      // 2: Диктор среднего плана через плечо игрока
      sh({ at: [-0.85, 1.32, 1.5], to: [-0.6, 1.3, 0.8], look: [0, 1.2, -4.4], fov: 34, dur: 4, hand: 0.7, run: () => { p.g.visible = true; },
        says: [[DIC, 'This is me – Dictor.', 2.2], [DIC, 'You are probably wondering where you are. You are exactly where you need to be.', 3.6]] }),
      // 3: девушка у пепельницы, дым
      sh({ at: [-0.6, 1.45, 1.05], to: [-1.1, 1.45, 0.7], look: [-3.45, 1.0, -1.0], fov: 47, dur: 3.2, hand: 0.9,
        says: [[DIC, 'Out there is a complex. NEXA Industries. Three floors, one vault, and more guards than you can count.', 4.6]] }),
      // 4: общий план от двери к окну
      sh({ at: [0.4, 1.55, 5.0], to: [0.1, 1.5, 4.3], look: [0, 1.2, -4.2], fov: 52, dur: 4.4, hand: 0.6,
        run: () => { S.dGest = 0; S.dLook = 'p'; },
        says: [[DIC, 'Everything they ever did is written down in that vault. Every name. Every price.', 4.2], [DIC, 'So tonight we walk in through the front door.', 3.2]] }),
      // 5: Диктор крупно, сомкнутые руки
      sh({ at: [0.7, 1.28, -1.5], to: [0.45, 1.28, -1.9], look: [0, 1.15, -4.4], fov: 26, dur: 4.5, hand: 0.7,
        tick: (rr, e, tt) => { S.dGest = tt > 2.4 ? smooth(Math.min(1, (tt - 2.4) / 0.6)) : 0; },
        says: [[DIC, 'We make that whole place afraid. Every hall. Every room. Every person inside.', 5.2]] }),
      // 6: встаёт и идёт к стойке
      sh({ at: [3.4, 1.5, 1.2], to: [3.0, 1.45, 0.4], look: () => [d.g.position.x * 0.8, 1.1, d.g.position.z + 0.2], fov: 42, dur: 5.6, hand: 0.9,
        run: () => { S.dGest = 0; go(seqStand); },
        says: [[DIC, 'And you are going to need something heavier than a pistol.', 3.4]] }),
      // 7: стойка — миниган снимают с кронштейнов
      sh({ at: [2.9, 1.5, -3.2], to: [3.2, 1.45, -2.6], look: [5.4, 1.25, -1.2], fov: 36, dur: 5.0, hand: 0.8,
        run: () => { go(seqTake); },
        says: [[DIC, 'Forty kilos. In the suit it weighs nothing. Almost nothing.', 4.4]] }),
      // 8: несёт к игроку
      sh({ at: [-2.5, 1.3, -1.9], to: [-1.9, 1.35, -1.3], look: () => [d.g.position.x, 1.1, d.g.position.z], fov: 46, dur: 5.4, hand: 0.9,
        run: () => { go(seqBring); }, says: [] }),
      // 9: вручает — игрок хватает ствол (сбоку: Диктор слева в кадре, игрок справа)
      sh({ at: [-2.7, 1.4, -0.1], to: [-2.35, 1.38, -0.1], look: [0.05, 1.0, -0.05], fov: 42, dur: 4.4, hand: 0.8,
        run: () => { go(seqHand); },
        says: [[DIC, 'Take it. It is yours.', 2.2]] }),
      // 10: девушка гасит сигарету
      sh({ at: [0.3, 1.5, -0.4], to: [-0.1, 1.47, -0.6], look: [-3.5, 1.2, -1.1], fov: 56, dur: 4.2, hand: 0.9,
        run: () => { go(seqStub); },
        says: [[DIC, 'Now sleep. We have a long drive ahead.', 3.0]] }),
      // 11: «усыпите его» — девушка надевает мешок (справа-спереди: видны и игрок, и она за его спиной)
      sh({ at: [2.5, 1.55, -0.7], to: [2.2, 1.5, -0.3], look: [0, 1.0, 1.0], fov: 46, dur: 6.0, hand: 0.8,
        run: () => { go(seqSack); },
        says: [[DIC, 'Put him back to sleep.', 2.2]] }),
      // 12: глазами игрока — мешок опускается, чёрный
      sh({ at: [0, 1.35, 0.6], to: [0, 1.32, 0.6], look: [0, 1.15, -4.4], fov: 62, dur: 1.9, hand: 1.2, tense: 0.7,
        run: () => { p.g.visible = false; K.sackFx(r, true, 0.3); K.snd(r, 'thud', { k: 0.5 }); } })
    ];
    await r.cinematic(shots);
    // ---------------------------------------------------------- итог (и при пропуске катсцены)
    S.dead = true; S.on = false;
    [unhook, unhook3].forEach((u) => u());
    K.sackLevel(r, 1);
    await r.fade(1, 0.01);
    K.removeAll(r, [d, g, p]);
    try { lap.parent && lap.parent.remove(lap); } catch (e) { /* уже убран */ }
    R.mg.visible = false;
    r.sub && r.sub.classList.remove('on');
    K.sackHide(r);
    st.office = null;
    K.unlock(r);
  };
}());
