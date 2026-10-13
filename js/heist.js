// NEXA: миссия 47 «COLD STORAGE» — ограбление. Тихо (heistsneak) или громко (heistloud).
// Если охрана заметила игрока: уведомление «ВАС ЗАМЕТИЛИ» -> громкий трек с нуля -> катсцена ровно 32,5 с, синхронная с треком
// (часы катсцены = audio.currentTime трека; без звука — обычные секунды) -> красные края экрана в такт сирене и шире FOV.
// Зависит от kit.js: r.stealth, r.hack, r.musicTrack, r.redPulse, r.countdown, гаджеты, breakable.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.M2 || !C.cin || !C.WEAPONS || !C.Run.prototype.stealth) return;
  const { Run, MISSIONS, CINEMA, smooth } = C;
  const { DONE, rnd, clamp } = C.M2;
  const { pov, pull } = C.cin;
  const P = Run.prototype, PI = Math.PI, TAU = PI * 2;
  const HND = 'HANDLER', HW = 4.2, WORD = 'ОГРАБЛЕНИЕ';
  const ONSET = [7.32, 7.56, 7.82, 7.96, 8.2, 8.34]; // вступления трека: мониторы краснеют ровно в них
  const CUT = 32.5;

  // ------------------------------------------------------------ маска босса (assets/models/mask.nxm + mask.jpg)
  let maskP = null;
  function loadMask() {
    if (maskP) return maskP;
    maskP = (async () => {
      try {
        const rs = await fetch('assets/models/mask.nxm');
        if (!rs.ok || !C.decodeNXM) return null;
        const parts = C.decodeNXM(await rs.arrayBuffer()), img = await C.loadImage('assets/models/mask.jpg');
        return parts && parts.body && img ? { part: parts.body, img } : null;
      } catch (e) { return null; }
    })();
    return maskP;
  }
  function attachMask(r, H, M) {
    const T = THREE, mat = new T.MeshBasicMaterial({ color: new T.Color(2.3, 2.3, 2.3), side: T.DoubleSide });
    let mesh;
    if (M) {
      const p = M.part, geo = new T.BufferGeometry(), tex = new T.Texture(M.img);
      tex.needsUpdate = true; mat.map = tex;
      geo.setAttribute('position', new T.BufferAttribute(p.pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(p.nor, 3));
      geo.setAttribute('uv', new T.BufferAttribute(p.uv, 2)); geo.setIndex(new T.BufferAttribute(p.idx, 1));
      mesh = new T.Mesh(geo, mat); mesh.scale.setScalar(1.2); mesh.position.set(0, 0.14, 0.075);
    } else { // нет файла — простая белая маска с чёрными глазами
      mat.color.setRGB(0.78, 0.78, 0.78);
      mesh = new T.Mesh(r.g.box, mat); mesh.scale.set(0.2, 0.27, 0.05); mesh.position.set(0, 0.14, 0.135);
      const eye = new T.MeshBasicMaterial({ color: 0x000000 });
      [-0.045, 0.045].forEach((x) => { const e = new T.Mesh(r.g.box, eye); e.scale.set(0.045, 0.04, 0.06); e.position.set(x, 0.04, 0.0); mesh.add(e); });
    }
    mesh.frustumCulled = false;
    H.boss.head.add(mesh); H.maskMat = mat; H.maskBase = mat.color.r;
  }

  // ------------------------------------------------------------ сирена (WebAudio, непрерывный осциллятор): time() — фаза для красных краёв
  function makeSiren(r) {
    const snd = r.snd, ctx = snd && snd.ctx, S = { on: false, t0: 0, lvl: 1 };
    S.time = () => (S.on && ctx ? ctx.currentTime - S.t0 : r.time);
    if (!ctx) { S.start = () => { S.on = true; }; S.stop = () => { S.on = false; }; return S; }
    let osc = null, g = null, timer = null, nextT = 0, up = false;
    const level = () => (S.on && !r.paused && !r.disposed ? 0.15 * S.lvl * snd.sfxVol() : 0);
    const sched = () => {
      while (nextT < ctx.currentTime + 2.2) { osc.frequency.linearRampToValueAtTime(up ? 520 : 980, nextT + 0.7); up = !up; nextT += 0.7; }
      g.gain.setTargetAtTime(level(), ctx.currentTime, 0.06);
    };
    S.start = (lvl) => {
      if (lvl !== undefined) S.lvl = lvl;
      if (S.on) return;
      osc = ctx.createOscillator(); osc.type = 'sawtooth';
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700; lp.Q.value = 0.7;
      g = ctx.createGain(); g.gain.value = 0;
      osc.connect(lp); lp.connect(g); g.connect(snd.out);
      S.t0 = nextT = ctx.currentTime + 0.02; up = false;
      osc.frequency.setValueAtTime(520, S.t0); osc.start(S.t0);
      S.on = true; sched(); timer = setInterval(sched, 300);
    };
    S.stop = (fade) => {
      if (!S.on) return;
      S.on = false; clearInterval(timer);
      try { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(0, ctx.currentTime, fade || 0.15); } catch (e) {}
      const o = osc; setTimeout(() => { try { o.stop(); o.disconnect(); } catch (e) {} }, 900);
    };
    return S;
  }
  const dc0 = P.disposeCombat;
  P.disposeCombat = function () {
    if (this.hz) { try { this.hz.siren && this.hz.siren.stop(0.05); this.hz.robEl && this.hz.robEl.remove(); } catch (e) {} }
    return dc0.call(this);
  };

  // ------------------------------------------------------------ текстуры: надпись и мониторы
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  const LT = (str) => (window.I18N ? I18N.t(str) : str); // текст на канвасе — на текущем языке (миссия создаётся после выбора языка)
  const FONT = (px) => 'bold ' + px + 'px "Arial Black", Impact, "Helvetica Neue", sans-serif';
  function wallTex() {
    return canvasTex(1024, 256, (g, w, h) => {
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ff2323'; g.fillRect(0, 0, w, 12); g.fillRect(0, h - 12, w, 12);
      const word = LT(WORD);
      let px = 158; g.font = FONT(px);
      while (g.measureText(word).width > w * 0.9 && px > 40) { px -= 6; g.font = FONT(px); } // слово целиком входит в плашку при любом шрифте
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = '#000'; g.strokeText(word, w / 2, h / 2 + 4);
      g.fillStyle = '#ff2b2b'; g.fillText(word, w / 2, h / 2 + 4);
    });
  }
  function monTex(kind) {
    return canvasTex(256, 144, (g, w, h) => {
      if (kind === 0) {
        g.fillStyle = '#161616'; g.fillRect(0, 0, w, h); g.fillStyle = '#7d7d7d'; g.font = '10px monospace';
        for (let i = 0; i < 12; i += 1) g.fillText('> 0x' + (Math.random() * 65535 | 0).toString(16).toUpperCase().padStart(4, '0') + '  ' + Math.random().toString(36).slice(2, 12 + (i % 4)), 8, 14 + i * 11);
        g.fillStyle = '#3a3a3a'; g.fillRect(0, h - 12, w * 0.6, 3);
      } else {
        const hot = kind === 2;
        g.fillStyle = hot ? '#ff1c1c' : '#4a0000'; g.fillRect(0, 0, w, h);
        g.font = FONT(30); g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = hot ? '#000' : '#fff'; g.fillText(LT(WORD), w / 2, h / 2 - 6, w - 16);
        g.font = 'bold 12px monospace'; g.fillText(LT('ROBBERY IN PROGRESS'), w / 2, h / 2 + 26, w - 16);
      }
    });
  }

  // ------------------------------------------------------------ вспомогательное
  const seatPose = (n) => { // сидящий стикмен: перекрывает позу updateNpc (kitUpd идёт после updateNpc)
    n.hips.position.y = 0.52; n.hips.rotation.set(0, 0, 0);
    n.legL.rotation.set(-1.45, 0, -0.08); n.legR.rotation.set(-1.45, 0, 0.08);
    n.kneeL.rotation.x = n.kneeR.rotation.x = 1.5; n.footL.rotation.x = n.footR.rotation.x = -0.1;
    n.spine.rotation.set(-0.06, 0, 0);
    n.armL.rotation.set(-0.5, 0, -0.1); n.armR.rotation.set(-0.5, 0, 0.1); n.elbL.rotation.x = n.elbR.rotation.x = -1.25;
  };
  function makeChair(r, x, z) {
    const T = THREE, g = new T.Group(), m = r.mat(0x151515), m2 = r.mat(0x2a2a2a);
    const add = (w, h, d, px, py, pz, mt) => { const b = new T.Mesh(r.g.box, mt || m); b.scale.set(w, h, d); b.position.set(px, py, pz); g.add(b); };
    add(0.56, 0.09, 0.54, 0, 0.37, 0); add(0.66, 1.1, 0.08, 0, 1.0, -0.28);
    add(0.07, 0.34, 0.07, 0, 0.19, 0, m2); add(0.62, 0.05, 0.08, 0, 0.04, 0, m2); add(0.08, 0.05, 0.62, 0, 0.04, 0, m2);
    add(0.06, 0.04, 0.4, 0.3, 0.6, 0.0); add(0.06, 0.04, 0.4, -0.3, 0.6, 0.0);
    g.position.set(x, 0, z); r.scene.add(g);
    return g;
  }
  const zoneOf = (x, z) => (z > 16 ? 'dock' : z > -6 ? 'lobby' : z > -34 ? 'hall' : z > -50 ? (x < -8.2 ? 'corr' : x > 8.2 ? 'supply' : 'office') : z > -66 ? 'vault' : 'tunnel');
  const SPAWNS = {
    dock: [[-13, 30], [13, 30], [-13, 18], [13, 18], [0, 24]],
    lobby: [[-13, 12], [13, 12], [-13, -3], [13, -3], [0, 9]],
    hall: [[-13, -9], [13, -9], [0, -12], [-13, -30], [13, -30], [0, -28]],
    corr: [[-15, -38], [-9.5, -38], [-12.5, -46]],
    supply: [[12, -38], [14, -46]],
    office: [[-6, -38], [6, -38], [0, -42]],
    vault: [[-12, -54], [12, -54], [-12, -62], [12, -62], [0, -55]],
    tunnel: [[0, -70], [-4, -78], [4, -78]]
  };
  function pickSpawns(r, types, rmin) {
    const zn = zoneOf(r.p.x, r.p.z), pts = (SPAWNS[zn] || SPAWNS.hall).slice().sort(() => Math.random() - 0.5);
    const ok = pts.filter((p) => Math.hypot(p[0] - r.p.x, p[1] - r.p.z) >= (rmin || 8));
    const use = ok.length ? ok : pts;
    return types.map((t, i) => { const p = use[i % use.length]; return [t, p[0] + rnd(-0.6, 0.6), p[1] + rnd(-0.6, 0.6)]; });
  }

  MISSIONS[47] = {
    title: 'COLD STORAGE',
    build(r) {
      const T = THREE, W = 0x8c8c8c, D = 0x606060;
      const H = r.hz = { loud: false, cutDone: false, mon: [], texts: [], lampPos: [], scr: {}, monRed: 0, redK: 0, alarm: false, chairYaw: 0, rt: 10, shut: [], reinfOn: false, lampT: 0 };
      r.room(0, -30, 32, 124, HW, W); r.bound(0, -30, 32, 124, HW);
      r.mood(0.9, 0.38, 0x505050); r.combat(); r.giveWeapon('glock'); r.noFight = true;
      [28, 18, 8, -2, -12, -22, -30, -40, -46, -56, -62, -72, -82].forEach((z) => [-7, 7].forEach((x) => { r.lamp(x, HW - 0.1, z, 0.85); H.lampPos.push([x, HW - 0.4, z]); }));

      // перегородки
      r.wallH(16, -16, 16, HW, W, [[-2, 2]]); H.doorA = r.door(0, 16, 4, 2.6);
      r.wallH(-6, -16, 16, HW, W, [[-2, 2]]);
      r.wallH(-34, -16, 16, HW, W, [[-15, -10], [-7.5, 4], [4.5, 7], [10, 15]]);
      H.doorC = r.door(-12.5, -34, 5, 2.6); H.doorO = r.door(5.75, -34, 2.5, 2.6);
      r.glass(-1.75, 1.5, -34, 11.5, 2.2, 0.1); r.box(-1.75, 0.2, -34, 11.5, 0.4, 0.3, W, true);
      r.wallV(-8, -50, -34, HW, W); r.wallV(8, -50, -34, HW, W);
      r.wallH(-50, -16, 16, HW, W, [[-15, -10]]);
      r.wallH(-66, -16, 16, HW, W, [[-3, 3]]);
      r.wallV(-6, -92, -66, HW, D); r.wallV(6, -92, -66, HW, D);
      H.VB = r.breakable(-12.5, -50, 5, 0.4, 3.0, 0x4a4a4a); H.EB = r.breakable(0, -66, 6, 0.4, 3.0, 0x5a5a5a);
      H.VB.onBreak = () => { H.S && H.S.alarmNow('vault'); };

      // терминалы (интерактив — в фазах)
      const term = (x, z, face) => {
        const ax = face[0] === 'x', sg = face[1] === '-' ? -1 : 1;
        r.box(x, 0.5, z, ax ? 0.7 : 1, 1, ax ? 1 : 0.7, 0x333333, true);
        H.scr[x + ',' + z] = r.strip(x + (ax ? sg * 0.36 : 0), 0.95, z + (ax ? 0 : sg * 0.36), ax ? 0.04 : 0.7, 0.35, ax ? 0.7 : 0.04, 0x555555);
        r.termDress && r.termDress(x, z, ax, sg); // props3d: консоль-модель на стойке
      };
      term(-4.2, 17.2, 'z+'); term(11.5, -5.1, 'z+'); term(-11.5, -32.8, 'z+'); term(-8.7, -47.5, 'x-');

      // погрузочная зона
      r.crate(-8.5, 24, 5, 2.6, 2.7, 0x4a4a4a); r.crate(10.5, 22, 2.6, 6, 2.7, 0x4a4a4a); r.crate(-3, 28.5, 2.2, 2.2, 1.2, 0x555555);
      r.crate(3.5, 21, 1.6, 1.6, 1.1, 0x555555); r.crate(-13.4, 18.4, 2, 2, 2.4, 0x4a4a4a); r.markFloor(0, 24, 0.25, 12, 0xd8d8d8);
      // лобби
      r.box(0, 0.5, 2, 6, 1, 1.2, 0x333333, true); r.strip(0, 1.02, 2, 6, 0.04, 1.2, 0x9a9a9a);
      r.crate(-11, -1.5, 3.2, 0.8, 0.5, 0x555555); r.crate(11, 5, 3.2, 0.8, 0.5, 0x555555);
      [[-8, 7], [8, 7], [-8, -1], [8, -1]].forEach((p) => r.pillar(p[0], p[1], 1.2, 1.2));
      // серверный зал
      [-10, -5, 5, 10].forEach((x) => [-11, -19, -27].forEach((z) => {
        r.box(x, 1.2, z, 1.5, 2.4, 5, 0x3a3a3a, true);
        r.strip(x + (x < 0 ? 0.77 : -0.77), 1.9, z, 0.03, 0.1, 4.2, 0xcfcfcf);
      }));
      // склад оборудования (справа от зала)
      r.crate(14, -36.5, 2, 1.2, 1.1, 0x555555); r.crate(10.5, -48, 1.6, 1.6, 1.1, 0x555555);
      // коридор к хранилищу
      r.crate(-14.8, -41, 1.4, 1.4, 1.1, 0x555555); r.markFloor(-12, -42, 8, 0.15, 0xd8d8d8);
      // кабинет босса: стол, кресло, мониторы, надписи
      r.box(0, 0.77, -46.4, 4, 0.06, 1.3, 0x1f1f1f, true); r.box(-1.9, 0.38, -46.4, 0.1, 0.72, 1.2, 0x1a1a1a, true); r.box(1.9, 0.38, -46.4, 0.1, 0.72, 1.2, 0x1a1a1a, true);
      r.box(0, 0.4, -45.8, 3.7, 0.7, 0.05, 0x1a1a1a, true);
      r.lamp(0, HW - 0.1, -42, 0.8); r.lamp(0, HW - 0.1, -47.5, 0.8); H.lampPos.push([0, HW - 0.4, -42], [0, HW - 0.4, -47.5]);
      H.chair = makeChair(r, 0, -47.5);
      const t0 = monTex(0), t1 = monTex(1), t2 = monTex(2);
      for (let i = 0; i < 6; i += 1) {
        const x = -3.75 + i * 1.5;
        const fr = new T.Mesh(r.g.box, r.basic(0x050505)); fr.scale.set(1.28, 0.8, 0.06); fr.position.set(x, 2.0, -49.82); r.scene.add(fr);
        const m = new T.Mesh(new T.PlaneGeometry(1.18, 0.7), new T.MeshBasicMaterial({ map: t0 })); m.position.set(x, 2.0, -49.78); r.scene.add(m);
        H.mon.push(m);
      }
      H.monTex = [t0, t1, t2];
      const wt = wallTex();
      const txt = (x, y, z, ry, w, h) => {
        const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: wt, transparent: true, depthWrite: false, opacity: 0.8, side: T.DoubleSide }));
        m.position.set(x, y, z); m.rotation.y = ry; m.visible = false; m.renderOrder = 3; r.scene.add(m); H.texts.push(m);
      };
      txt(0, 3.4, -49.7, 0, 9, 1.0); txt(-7.8, 2.4, -43, PI / 2, 8, 1.6); txt(7.8, 2.4, -43, -PI / 2, 8, 1.6); txt(0, 3.35, -33.8, 0, 11, 1.4);
      H.boss = r.npc(0, -47.5, 0); r.actorStyle(H.boss, 'grunt', null);
      H.office = [r.npc(-2.9, -48.5, 0), r.npc(2.9, -48.5, 0)]; H.office.forEach((n) => r.actorStyle(n, 'grunt', null));
      // хранилище
      r.box(-14.6, 1.1, -56, 1.6, 2.2, 6, 0x3a3a3a, true); r.box(14.6, 1.1, -56, 1.6, 2.2, 6, 0x3a3a3a, true);
      r.box(-14.6, 1.1, -63, 1.6, 2.2, 3, 0x3a3a3a, true); r.box(14.6, 1.1, -63, 1.6, 2.2, 3, 0x3a3a3a, true);
      r.pillar(-7, -58, 1.2, 1.2); r.pillar(7, -58, 1.2, 1.2);
      r.box(0, 0.45, -60, 5, 0.9, 1.6, 0x2c2c2c, true);
      H.loot = [-1.6, 0, 1.6].map((x) => r.strip(x, 1.0, -60, 0.9, 0.24, 0.6, 0xe8e8e8));
      if (r.lootModels) H.loot = r.lootModels(H.loot); // props3d: слитки, пачки денег, сумка (нет моделей — остаются плашки)
      // туннель к грузовику
      [[-4.5, -72], [4.5, -72], [-4.5, -80], [4.5, -80]].forEach((p) => r.pillar(p[0], p[1], 1.0, 1.0));
      r.markFloor(-5.6, -79, 0.2, 26, 0xe0e0e0); r.markFloor(5.6, -79, 0.2, 26, 0xe0e0e0);
      [-73, -80].forEach((z) => {
        const m = r.box(0, 1.7, z, 12, 3.4, 0.3, 0x3a3a3a, true); m.userData.h = 3.4;
        H.shut.push({ m, z, open: true, k: 1, ph: rnd(0, 3) });
        m.position.y = 1.7 + 3.6; m.userData.col.off = true;
      });
      r.box(0, 1.4, -89.2, 3.6, 2.8, 5.6, 0x3a3a3a, true); r.box(0, 1.4, -86.35, 3.0, 2.4, 0.06, 0x151515, false, true);
      r.strip(0, 3.0, -86.2, 3.2, 0.16, 0.05, 0xe8e8e8);
      r.spawn(0, 29.5, 0);
    },

    async play(r) {
      const H = r.hz, snd = r.snd;
      H.siren = makeSiren(r);
      const tSneak = r.musicTrack('heistsneak', { vol: 0.95 }), tLoud = r.musicTrack('heistloud', { vol: 1 });
      const S = r.stealth({ onAlarm: (s, why) => { if (why === 'vault') loudStart(); else spotted(); } });
      H.S = S;
      const M = await Promise.race([loadMask(), new Promise((res) => setTimeout(() => res(null), 7000))]);
      attachMask(r, H, M);
      H.robEl = document.createElement('div'); H.robEl.className = 'm-robw'; H.robEl.textContent = WORD; r.layer.appendChild(H.robEl);
      if (!r.kitUpd) r.kitUpd = [];

      // ---------------------------------------------------------- эффекты и постоянные задачи (kitUpd переживает смерть)
      const sync = (r2) => { // все эффекты тревоги: красный свет, мониторы, надписи, сирена
        const sirenOn = H.siren.on, ph = (H.siren.time() % 1.4) / 1.4, k = sirenOn ? 0.5 - 0.5 * Math.cos(ph * TAU) : 1, rk = H.redK;
        if (rk > 0) {
          r2.lamps.forEach((L) => { L.color.setRGB(1, 1 - 0.86 * rk, 1 - 0.88 * rk); L.intensity = L.base * 1.3 * (r2.lightLevel || 1) * (1 + (sirenOn ? (k - 0.4) * 1.1 : 0)); });
          r2.lampMat.color.setRGB(0.4 + 0.6 * (sirenOn ? k : 1), 0.1 * (1 - rk) + 0.04, 0.08 * (1 - rk) + 0.03);
        }
        if (H.maskMat) H.maskMat.color.setRGB(H.maskBase, H.maskBase * (1 - 0.75 * rk), H.maskBase * (1 - 0.78 * rk));
        H.mon.forEach((m, i) => {
          const want = i < H.monRed ? (sirenOn && (Math.floor(H.siren.time() / 0.35) + i) % 2 ? H.monTex[2] : H.monTex[1]) : H.monTex[0];
          if (m.material.map !== want) m.material.map = want;
        });
        if (H.alarm) H.texts.forEach((t) => { t.visible = true; t.material.opacity = 0.3 + 0.7 * k; });
      };
      const kit = (dt) => {
        if (H.boss && H.boss.g.visible) { if (H.cs) { H.boss.g.rotation.y = H.boss.yaw = H.chairYaw; } seatPose(H.boss); }
        H.chair.rotation.y = H.chairYaw;
        sync(r);
        // лампы следуют за игроком (источников света мало, зона длинная)
        H.lampT -= dt;
        if (H.lampT <= 0 && r.lamps.length) {
          H.lampT = 0.45;
          const near = H.lampPos.map((p) => ({ p, d: Math.hypot(p[0] - r.p.x, p[2] - r.p.z) })).sort((a, b) => a.d - b.d).slice(0, r.lamps.length);
          r.lamps.forEach((L, i) => { const p = near[i].p; if (Math.abs(L.position.x - p[0]) + Math.abs(L.position.z - p[2]) > 0.01) L.position.set(p[0], p[1], p[2]); });
        }
        // подкрепление в громком режиме
        if (H.reinfOn && H.loud && !r.locked && !r.dead && r.cb) {
          H.rt -= dt;
          if (H.rt <= 0) { H.rt = rnd(12, 17); if (r.enemiesAlive() < Math.max(3, r.q.maxEnemies >> 1)) r.spawnWave(pickSpawns(r, ['grunt', 'rusher', 'grunt'].slice(0, 2 + (Math.random() < 0.4 ? 1 : 0)), 9), { gap: 0.4 }); }
        }
        // шторки туннеля: открыты/закрыты по кругу, не закрываются на игроке
        if (H.shutOn) H.shut.forEach((s) => {
          const open = ((r.time + s.ph) % 5) < 2.8, col = s.m.userData.col;
          if (!open && s.open && Math.abs(r.p.z - s.z) < 0.9) { /* игрок в проёме — ждём */ } else if (open !== s.open) { s.open = open; if (open && col) col.off = true; if (!open && col) col.off = false; r.sfx && r.sfx('thud'); }
          s.k = clamp(s.k + (s.open ? 1 : -1) * dt / 0.45, 0, 1);
          s.m.position.y = 1.7 + 3.6 * smooth(s.k);
        });
      };
      r.kitUpd.push(kit);

      const notice = (big, small, ms) => {
        const el = document.createElement('div'); el.className = 'm-robn'; el.innerHTML = '<b>' + big + '</b><i>' + small + '</i>';
        r.layer.appendChild(el);
        setTimeout(() => el.classList.add('on'), 20);
        setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 350); }, ms);
      };
      const loudWave = (types) => r.spawnWave(pickSpawns(r, types, 8), { gap: 0.35 });
      const startLoudWorld = () => { r.suppressed = false; H.loud = true; r.redPulse(true, { period: 1.4, track: H.siren, fov: 12 }); };

      // громкий режим без катсцены: сигнализация хранилища
      function loudStart() {
        if (H.loud) return;
        startLoudWorld();
        tSneak.stop(0.6); tLoud.play(0.5, true);
        H.siren.start(0.35); H.alarm = true; H.redK = 1; H.monRed = 6; H.reinfOn = true; H.rt = 9;
        r.banner('ROBBERY IN PROGRESS', true); r.snd && r.snd.play('alarm'); r.flash(0.4);
        r.say(HND, 'СИГНАЛИЗАЦИЯ. ПРОБИВАЙСЯ К ВЫХОДУ.', 2.6);
        loudWave(['grunt', 'rusher', 'grunt']);
      }

      // ---------------------------------------------------------- катсцена 32,5 с
      const mkNpc = (x, z, yaw, gun) => { const n = r.npc(x, z, yaw); r.actorStyle(n, 'grunt', gun || null); n.g.rotation.y = n.yaw = yaw; return n; };
      const rmNpc = (n) => { r.scene.remove(n.g); const i = r.npcs.indexOf(n); if (i >= 0) r.npcs.splice(i, 1); };
      const runPath = (n, pts, speed) => { let i = 0; const go = () => { if (i >= pts.length) return; const p = pts[i]; i += 1; n.goal = { x: p[0], z: p[1], speed, res: go }; }; go(); };
      const draw = (n) => { r.setGun(n, 'rifle'); n.armT = 0.2; n.kick = 1.5; r.snd && r.snd.play('click'); };
      const POS = [[-1, 1.5, 0], [0.4, 1.1, 2], [1.6, 2.3, 3.4]];

      function scene(Tc) { // состояние мира как функция времени катсцены
        const cs = H.cs, c = H.cast;
        if (Tc >= 0.2 && !cs.f0) { cs.f0 = true; r.flash(0.35); }
        if (Tc >= 4.3 && !cs.ent) { cs.ent = true; c.ent.forEach(rmNpc); c.ent = []; r.flash(0.5); r.glitch(0.2); }
        H.monRed = ONSET.filter((t) => Tc >= t).length;
        H.redK = clamp((Tc - 7.2) / 1.4, 0, 1);
        if (Tc >= 8.4 && !cs.siren) { cs.siren = true; H.alarm = true; H.siren.start(1); r.snd && r.snd.play('alarm'); }
        if (Tc >= 11.9 && !cs.dA) { cs.dA = true; draw(H.office[0]); }
        if (Tc >= 13.18 && !cs.dB) { cs.dB = true; draw(H.office[1]); }
        if (Tc >= 15.6 && !cs.door) { cs.door = true; r.openDoor(H.doorO, 0.5); }
        if (Tc >= 15.84 && !cs.run) {
          cs.run = true;
          runPath(H.office[0], [[-4.5, -47.2], [-4.5, -39], [5.75, -36.4], [5.75, -30], [1, -20], [0, -8], [0, 6]], 5.4);
          runPath(H.office[1], [[4.6, -47.2], [5.75, -39], [5.75, -30.5], [-1, -20], [0, -8], [0, 6]], 5.0);
        }
        // кресло: поворот на 180° (спинка закрывает босса), затем босс исчезает за спинкой
        if (Tc >= 20.4) H.chairYaw = PI * smooth(clamp((Tc - 20.4) / 1.5, 0, 1)) + (Tc > 21.9 ? 0.55 * (1 - Math.exp(-(Tc - 21.9) * 0.8)) : 0);
        if (Tc >= 22.4 && !cs.vanish) { cs.vanish = true; H.boss.g.visible = false; r.glitch(0.3); }
        if (Tc >= 30.0 && !cs.mass) {
          cs.mass = true;
          for (let k = 0; k < 16; k += 1) {
            const x = [-1.5, -0.7, 0.7, 1.5][k % 4] + rnd(-0.15, 0.15), n = mkNpc(x, -9 - k * 1.5, 0, 'rifle'); // средняя полоса свободна: камера стоит на x=0
            n.armT = 0.3; n.goal = { x, z: 12, speed: 6.2 + rnd(-0.4, 0.6) };
            c.mass.push(n);
          }
        }
        if (Tc >= 31.98 && !cs.drop) { cs.drop = true; r.flash(0.7); r.glitch(0.3); }
        // слова на экране в такт сирене
        if (Tc >= 8.4 && Tc < 21.6) {
          const idx = Math.floor((Tc - 8.4) / 1.4), ph = (Tc - 8.4) % 1.4, p = POS[idx % POS.length], el = H.robEl;
          el.style.left = (50 + p[0] * 16) + '%'; el.style.top = (50 - p[1] * 12 + (idx % 2 ? 14 : -10)) + '%'; el.style.transform = 'translate(-50%,-50%) rotate(' + (p[2] * 2 - 3) + 'deg) scale(' + (1 + p[1] * 0.12) + ')';
          el.style.opacity = String(Math.round(Math.exp(-ph * 5) * 100) / 100);
        } else H.robEl.style.opacity = '0';
      }
      const clock = (r2) => { // часы катсцены: audio.currentTime трека; при остановке звука — обычное время
        const cs = H.cs, now = r2.time, dt = Math.min(0.05, Math.max(0, now - cs.rt)); cs.rt = now;
        const tt = cs.track.time();
        if (!cs.track.el.paused && tt > cs.tt + 0.0001) { cs.tc = tt; cs.tt = tt; cs.stall = 0; } else { cs.stall += dt; if (cs.stall > 0.25) cs.tc += dt; }
        return cs.tc;
      };
      const shot = (a, b, o) => Object.assign({ dur: b - a, sync: (r2) => { const Tc = clock(r2); scene(Tc); return clamp(Tc - a, 0, b - a); } }, o);
      const shots = () => [
        shot(0, 4.26, { at: [-10, 1.15, 4.5], to: [-1.8, 1.3, 8.6], look: [0, 1.45, 13.6], fov: 58, hand: 0.6 }),
        shot(4.26, 7.3, { at: [0.9, 1.1, -39.8], to: [0.25, 1.2, -43.9], look: [0, 1.22, -47.5], fov: 36, hand: 0.5 }),
        shot(7.3, 10.4, { at: [0.2, 1.95, -39.2], to: [0, 1.75, -41.4], look: [0, 1.9, -49.8], fov: 58, hand: 0.7 }),
        shot(10.4, 12.6, { at: [-6.9, 1.1, -41.6], to: [-5.6, 1.3, -42.6], look: [-2.9, 1.2, -48.4], fov: 38, hand: 0.8 }),
        shot(12.6, 14.2, { at: [7.0, 1.1, -42], to: [5.7, 1.3, -43], look: [2.9, 1.2, -48.4], fov: 38, hand: 0.8 }),
        shot(14.2, 15.84, { at: [0.1, 1.3, -43.2], to: [0.1, 1.25, -44.4], look: [0, 1.24, -47.5], fov: 26, hand: 0.4 }),
        shot(15.84, 20.3, { at: [7.2, 1.55, -36.3], to: [7.45, 1.5, -35.4], look: [3.2, 1.0, -43.5], lookTo: [5.9, 1.0, -30.5], fov: 55, hand: 1 }),
        shot(20.3, 24.0, { at: [0, 1.45, -42.0], to: [0.2, 1.4, -43.2], look: [0, 1.15, -47.5], fov: 40, hand: 0.5 }),
        shot(24.0, 30.7, { orbit: { c: [0, -47.5], r: 3.7, rTo: 2.1, a0: 0.1, a1: 2.45, h: 1.75, ly: 0.7 }, fov: 46, hand: 0.4 }),
        shot(30.7, CUT, { at: [0, 1.05, -1.6], to: [0, 1.15, -3.2], look: [0, 1.3, -22], fov: 68, hand: 1.6 })
      ];

      async function cutscene() {
        const hid = [];
        r.cb.enemies.forEach((e) => { hid.push([e, e.n.g.visible]); e.n.g.visible = false; });
        H.cast = { ent: [-6, -2.2, 2.2, 6].map((x) => mkNpc(x, 13.6, PI, 'rifle')), mass: [] };
        H.cs = { track: tLoud, tc: 0, tt: -1, stall: 0, rt: r.time };
        tLoud.play(0.05, true);
        await Promise.race([r.until(() => tLoud.time() > 0.04), r.wait(2.2)]);
        H.cs.tc = tLoud.time(); H.cs.tt = H.cs.tc; H.cs.rt = r.time;
        await r.cinematic(shots());
        const skipped = r.cineSkip || H.cs.tc < CUT - 0.5;
        // итоговое состояние (и при пропуске катсцены)
        Object.assign(H.cs, { ent: true, siren: true });
        H.cast.ent.forEach(rmNpc); H.cast.mass.forEach(rmNpc); H.cast = null;
        H.boss.g.visible = false; H.chairYaw = PI + 0.55; H.monRed = 6; H.redK = 1; H.alarm = true; H.robEl.style.opacity = '0';
        H.office.forEach((n) => { n.g.visible = false; }); r.openNow(H.doorO);
        H.siren.start(1); H.siren.lvl = 0.35;
        hid.forEach((p) => { p[0].n.g.visible = p[1]; });
        if (skipped) { try { tLoud.el.currentTime = 31.9; } catch (e) {} }
        H.cs = null;
      }

      async function spotted() {
        if (H.loud) return;
        H.loud = true; r.suppressed = false;
        if (H.cutDone) { tSneak.stop(0.4); tLoud.play(0.4, true); return; }
        H.cutDone = true;
        r.cineDepth += 1; r.syncLock();
        tSneak.stop(0.25);
        r.snd && r.snd.play('alarm'); r.flash(0.5); r.sfx('error'); r.banner(null);
        notice('ВАС ЗАМЕТИЛИ', 'YOU HAVE BEEN SPOTTED', 1500);
        await r.wait(1.5);
        await cutscene();
        r.cineDepth = Math.max(0, r.cineDepth - 1); r.syncLock();
        startLoudWorld(); H.reinfOn = true; H.rt = 10;
        r.banner('ROBBERY IN PROGRESS', true); r.flash(0.45);
        r.objective(H.objText ? 'ROBBERY — ' + H.objText.replace(/ — STAY UNSEEN$/, '') : 'ROBBERY IN PROGRESS');
        r.say(HND, 'ОНИ ВСЁ ЗНАЮТ. ДЕЙСТВУЙ БЫСТРО — ИХ СЛИШКОМ МНОГО.', 3);
        loudWave(['grunt', 'grunt', 'rusher', 'grunt', 'rusher']);
      }

      // ---------------------------------------------------------- фазы
      const loudTxt = (t) => t.replace(/ — STAY UNSEEN$/, '').replace(/^ROBBERY IN PROGRESS — /, '');
      const obj = (t) => { H.objText = t; r.objective(H.loud ? 'ROBBERY — ' + loudTxt(t) : t); };
      const wp = (x, z, label) => r.waypoint([x, 1.5, z], label); // маркер цели на HUD (как в остальных миссиях)
      const begin = () => { S.clear(); S.begin(H.loud); if (H.loud) { r.suppressed = false; r.banner('ROBBERY IN PROGRESS', true); H.reinfOn = true; } };
      const hackSpot = (x, z, label, o) => new Promise((res) => {
        const scr = H.scr[x + ',' + z], st = { busy: false };
        if (scr) scr.material = r.basic(0x555555);
        const it = r.interact({
          pos: [x, 1.1, z], label, reach: 3, enabled: () => !st.busy,
          use: async () => {
            st.busy = true; if (scr) scr.material = r.basic(0xffffff);
            const ok = await r.hack(o);
            st.busy = false;
            if (r.disposed) return;
            if (ok) { const i = r.interactables.indexOf(it); if (i >= 0) r.interactables.splice(i, 1); res(true); } else if (scr) scr.material = r.basic(0x555555);
          }
        });
      });

      r.say(HND, 'ХОЛОДНОЕ ХРАНИЛИЩЕ NEXA. ВНУТРИ — ОБРАЗЦЫ. ТИХО ВОЙТИ, ТИХО ВЫЙТИ.', 3.6);
      tSneak.play(1.8, true);
      await r.fade(0, 0.8);

      await r.phase('dock', async () => {
        begin();
        obj('REACH THE LOADING DOOR — STAY UNSEEN');
        r.pickup(-14, 22, 'ammo', { id: 'glock', amount: 30 }); r.pickup(13.5, 29, 'health', { amount: 40 });
        r.gadgetPickup(2, 29.5, 'flash', 2); r.gadgetPickup(-5, 29.5, 'frag', 1);
        S.guard([[-13, 28], [-13, 20], [-4, 20]]); S.guard([[12.5, 27], [5, 27], [5, 19.5]]); S.guard([[8, 18]]);
        S.camera(-14.8, 3.9, 30.8, PI - 1.05, PI - 0.15, { id: 'camD' });
        r.hint('GUARDS SEE IN FRONT OF THEM — TAKE DOWN FROM BEHIND [E]', 5);
        wp(-4.2, 17.2, 'HACK DOOR');
        await hackSpot(-4.2, 17.2, 'HACK DOOR', { kind: 'sync', title: 'ENTRY LOCK' });
        r.sfx('notification'); r.openDoor(H.doorA, 1.1);
        obj('ENTER THE LOBBY'); wp(0, 12, 'LOBBY');
        await r.until(() => r.p.z < 14.5);
        r.waypoint(null);
      }, { pos: [0, 13.5, 0], set: () => r.openNow(H.doorA) });

      await r.phase('lobby', async () => {
        begin();
        obj('CROSS THE LOBBY — HACK THE SECURITY PANEL');
        r.pickup(-14, 0, 'health', { amount: 40 }); r.pickup(14, 9, 'ammo', { id: 'glock', amount: 30 });
        S.guard([[-12, 11], [-12, -3], [-5, -3]]); S.guard([[12, -3], [12, 11], [5, 11]]); S.guard([[-5, 6], [5, 6]]); S.guard([[7, -3.5]]);
        S.camera(15.4, 3.9, 13.4, -2.3, -0.9, { id: 'camL' }); S.camera(-15.4, 3.9, -4.2, 0.5, 1.5, { id: 'camL' });
        S.laser([-2, -6.6], [2, -6.6], { id: 'laserB', blink: 3.4 }); S.laser([-2, -7.4], [2, -7.4], { id: 'laserB', blink: 2.7 });
        wp(11.5, -5.1, 'SECURITY PANEL');
        await hackSpot(11.5, -5.1, 'HACK SECURITY PANEL', { kind: 'match', title: 'SECURITY PANEL' });
        S.disable('laserB'); S.disable('camL'); r.sfx('notification'); r.toast('LASERS AND CAMERAS OFFLINE', 2);
        obj('GO TO THE SERVER HALL'); wp(0, -9, 'SERVER HALL');
        await r.until(() => r.p.z < -7.5);
        r.waypoint(null);
      }, { pos: [0, -8, 0], set: () => { S.disable('laserB'); S.disable('camL'); } });

      await r.phase('servers', async () => {
        begin();
        obj('HACK THE SERVER — OPEN THE SERVICE CORRIDOR');
        r.pickup(13, -8, 'ammo', { id: 'glock', amount: 30 }); r.pickup(-13, -24, 'health', { amount: 40 });
        // склад оборудования
        r.gadgetPickup(14, -38.4, 'c4', 2); r.gadgetPickup(13, -42, 'frag', 2); r.gadgetPickup(11.5, -44, 'flash', 2);
        r.pickup(14.5, -46, 'weapon', { id: 'ak', equip: false }); r.pickup(12, -37, 'weapon', { id: 'shotgun', equip: false }); r.pickup(15, -41, 'weapon', { id: 'sniper', equip: false });
        S.guard([[0, -9], [0, -31]]); S.guard([[-13, -15], [13, -15]]); S.guard([[13, -23], [-13, -23]]); S.guard([[12.5, -30.5]]);
        S.camera(0, 3.9, -33.6, -0.7, 0.7, { id: 'camH' }); S.camera(15.4, 3.9, -9, -2.4, -0.9, { id: 'camH' });
        S.laser([-3.4, -20], [3.4, -20], { id: 'laserH', sweep: { per: 6, dx: 0, dz: 4 } });
        wp(-11.5, -32.8, 'SERVER');
        await hackSpot(-11.5, -32.8, 'HACK SERVER', { kind: 'seq', title: 'VAULT KEY SERVER', len: 5, tries: 3 });
        S.disable('camH'); S.disable('laserH'); r.sfx('notification'); r.openDoor(H.doorC, 1.2);
        obj('USE THE SERVICE CORRIDOR'); wp(-12.5, -36.5, 'CORRIDOR');
        await r.until(() => r.p.x < -9.5 && r.p.z < -35.5);
        r.waypoint(null);
      }, { pos: [-12.5, -35.8, 0], set: () => { S.disable('camH'); S.disable('laserH'); r.openNow(H.doorC); } });

      await r.phase('vault', async () => {
        begin();
        obj('OPEN THE VAULT — HACK THE LOCK (QUIET) OR BLOW IT WITH C4 (LOUD)');
        r.pickup(-14.5, -38, 'ammo', { id: 'glock', amount: 30 }); r.pickup(-9.4, -41, 'health', { amount: 40 });
        S.guard([[-14.8, -37], [-9.5, -37]]); S.guard([[-12.5, -44]]);
        S.camera(-15.5, 3.9, -35.6, PI - 1.3, PI - 0.15, { id: 'camV' });
        S.laser([-15.6, -42], [-8.4, -42], { id: 'laserV', blink: 2.6 });
        if (!H.VB.broken) {
          hackSpot(-8.7, -47.5, 'HACK VAULT LOCK', { kind: 'seq', title: 'VAULT LOCK', len: 6, tries: 3 }).then(() => {
            if (H.VB.broken) return;
            S.disable('laserV'); H.VB.broken = true; r.sfx('notification'); r.openDoor(H.VB.m, 1.8); r.toast('VAULT OPEN', 2); r.snd && r.snd.play('slam', { k: 0.8 }); // тяжёлая дверь хранилища
          });
        }
        if (!H.VB.broken) wp(-8.7, -47.5, 'VAULT LOCK');
        await r.until(() => H.VB.broken);
        obj('ENTER THE VAULT'); wp(-12.5, -54, 'VAULT');
        await r.until(() => r.p.z < -52);
        r.waypoint(null);
      }, { pos: [-12.5, -53, 0], set: () => { if (!H.VB.broken) { H.VB.broken = true; r.openNow(H.VB.m); } } });

      await r.phase('loot', async () => {
        begin();
        obj('PACK THE COLD STORAGE SAMPLES');
        r.pickup(-11, -54, 'ammo', { id: 'glock', amount: 30 }); r.pickup(11, -64, 'health', { amount: 40 });
        S.guard([[-10, -55], [10, -55]]); S.guard([[10, -62], [-10, -62]]);
        S.camera(0, 3.9, -50.8, PI - 0.8, PI + 0.8, { id: 'camT' });
        H.loot.forEach((m) => { m.visible = true; });
        wp(0, -60.4, 'SAMPLES');
        await r.holdUse([0, 1.2, -60.4], 'PACK THE SAMPLES', 5, { meter: 'PACKING', reach: 3.4 });
        r.waypoint(null);
        H.loot.forEach((m) => { m.visible = false; });
        r.sfx('notification'); r.toast('SAMPLES SECURED', 2);
        if (r.snd) { r.snd.play('goldpickup'); r.snd.play('cashbag', { delay: 0.3 }); } // золото и сумка с деньгами
      }, { pos: [0, -57.5, 0], set: () => { H.loot.forEach((m) => { m.visible = false; }); } });

      S.stop(); S.clear();
      await r.phase('escape', async () => {
        const first = !H.alarm;
        H.loud = true; r.suppressed = false; H.reinfOn = true; H.rt = 8; H.shutOn = false;
        if (first) { r.snd && r.snd.play('alarm'); r.flash(0.45); notice('ТРЕВОГА', 'VAULT LOCKDOWN', 1400); }
        if (!tLoud.want) { tSneak.stop(0.6); tLoud.play(0.5, true); }
        H.siren.start(0.4); H.alarm = true; H.redK = 1; H.monRed = 6;
        r.redPulse(true, { period: 1.4, track: H.siren, fov: 12 });
        r.banner(null); obj('LOCKDOWN — BLOW THE EXIT WALL WITH C4');
        r.hint('PLANT C4 ON THE WALL BEHIND THE VAULT — STEP BACK — DETONATE', 6);
        r.say(HND, 'БЛОКИРОВКА! ВЗОРВИ СТЕНУ ЗА ХРАНИЛИЩЕМ — ТАМ ТОННЕЛЬ К ГРУЗОВИКУ.', 3.4);
        r.gadgetPickup(-3, -63.4, 'c4', 2); r.gadgetPickup(3, -63.4, 'frag', 2); r.gadgetPickup(-6, -52, 'flash', 1);
        r.pickup(8, -64, 'health', { amount: 60 }); r.pickup(-8, -64, 'ammo', { id: 'ak', amount: 60 }); r.pickup(0, -52.5, 'ammo', { id: 'shotgun', amount: 16 });
        const cd = r.countdown(120, 'LOCKDOWN', {});
        loudWave(['grunt', 'rusher', 'grunt', 'rusher']);
        const guide = r.c4Guide(H.EB, (t) => obj('LOCKDOWN — ' + t), 'EXIT WALL');
        await r.until(() => H.EB.broken);
        guide();
        H.shutOn = true; obj('RUN FOR THE TRUCK');
        r.pickup(0, -70, 'health', { amount: 40 }); r.pickup(5, -76, 'ammo', { id: 'ak', amount: 60 });
        loudWave(['rusher', 'grunt', 'rusher']);
        await r.goTo(0, -84.2, 'EXTRACTION', 2.4);
        cd.stop();
      }, { pos: [0, -61.5, 0], set: () => { /* стена остаётся как оставил игрок */ } });

      H.reinfOn = false; H.shutOn = false;
      tLoud.stop(1.8); H.siren.stop(0.6); r.redPulse(false);
      await r.endCombat();
      r.banner(null);
      await r.cine([{ flash: 0.6, sound: 'succesfully' }]);
      await r.complete();
    }
  };

  // ------------------------------------------------------------ вступление и эпилог
  CINEMA[47] = {
    intro: (r) => [
      { at: [-13, 3.7, 31], to: [13, 3.7, 31], look: [0, 1.0, 14], fov: 70, dur: 4.6, caption: 'COLD STORAGE — LOADING DOCK\nNEXA INDUSTRIES — 03.11.1992' },
      { at: [-2, 1.4, 22.5], to: [0.5, 1.5, 20], look: [0, 1.5, 16], fov: 48, dur: 3, cut: 'dip', say: [HND, 'НА ХРАНЕНИИ — ОБРАЗЦЫ NEXA. ТИХО ВОЙТИ. ТИХО ВЫЙТИ. ЕСЛИ ЗАМЕТЯТ — БЕГИ.'] },
      pov(r, 2.2, { extra: { cut: 'dip' } })
    ],
    outro: (r) => [pull(r, DONE(47))]
  };
}());
