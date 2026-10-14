// NEXA: миссия 48 — акт 7: комната HEAD. Игрок выбивает дверь → входит в зал с 50 мониторами → Диктор разворачивает кресло, в нём человек в маске →
// игрок хватает его за шиворот, швыряет на пол и пинает в лицо → девушка и Диктор аплодируют → человек в маске молча встаёт на колени →
// ВЫБОР: убить (пистолет ко лбу, выстрел, мгновенный чёрный экран) или пощадить (бросает оружие; взбешённый Диктор бежит с ножом и режет горло, чёрный экран) →
// на чёрном экране — случайная цитата режима HIGH/LOW. PH.end: через пару секунд — звук «задание выполнено» с большим эхом и медленная надпись «МИССИЯ ВЫПОЛНЕНА».
// Все кадры идут по одним часам S.t (ручной монтаж: поза каждого актёра — функция времени); весь текст — английский (кроме финальной надписи).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.PH || !C.f48.PH.flash || !C.f48.FL || !C.f48.FL.sh || !C.f48.K || !C.f48.K.headLook || !C.f48.K.pbody || !C.f48.HEAD || !C.f48.DARK || !C.f48.maskman) return;
  const F = C.f48, K = F.K, PH = F.PH, FL = F.FL, PI = Math.PI;
  const { sh } = FL;
  const DIC = 'DICTOR';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const sm = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

  // ------------------------------------------------------------------ хронометраж (секунды общих часов S.t)
  const T = { kick: 1.25, b2: 2.5, c: 4.05, d1: 8.2, d2: 12.5, e: 14.1, f: 15.6, g1: 17.4, g2: 18.5, g3: 19.0, h: 20.4, i: 24.4, j: 29.0 };
  const TURN = [10.1, 12.3], GRAB = 15.05, REL = 16.45, LAND = 16.95, HITK = 18.77;
  const CHAIR = [0, -4.0], SEAT_Z = -0.26;                                     // кресло и посадка человека (локально, назад к спинке)
  const P_IN = [[1.9, 0, 13.9], [6.3, 0, 2.9], [8.2, 0, 0.5, 'o']];
  const P_CH = [[12.4, 0, 0.5], [14.7, 0, -3.55, 's']];
  const P_KK = [[17.0, 0, -3.55], [18.4, -1.7, -2.95, 's']];
  const D_IN = [[2.0, 0.9, 14.6], [8.4, 0.8, -1.95], [9.3, 0.78, -3.2, 'o']];
  const G_IN = [[3.0, -1.1, 14.8], [8.2, -1.0, 3.2], [9.4, -1.1, 1.9, 'o']];
  const DPOS = [2.25, -3.9];                                                    // где Диктор стоит, пока игрок хватает и бросает человека
  const POSL = { d: [-1.0, 0.8], g: [0.9, 1.3] };                              // где стоят Диктор и девушка во время аплодисментов
  const LIE = { x: -2.45, z: -3.3, yaw: 4.95 };                                // куда падает человек (головой к +x)

  // путь по точкам [t, x, z, ease]: 'o' замедление, 'i' разгон, 's' плавно, иначе линейно
  function trk(pts, t) {
    if (t <= pts[0][0]) return { x: pts[0][1], z: pts[0][2], dx: 0, dz: 0 };
    for (let i = 1; i < pts.length; i += 1) {
      if (t <= pts[i][0]) {
        const a = pts[i - 1], b = pts[i], u = (t - a[0]) / (b[0] - a[0]);
        const e = b[3] === 'o' ? 1 - (1 - u) * (1 - u) : b[3] === 'i' ? u * u : b[3] === 's' ? u * u * (3 - 2 * u) : u;
        return { x: lerp(a[1], b[1], e), z: lerp(a[2], b[2], e), dx: b[1] - a[1], dz: b[2] - a[2] };
      }
    }
    const l = pts[pts.length - 1], q = pts[pts.length - 2];
    return { x: l[1], z: l[2], dx: l[1] - q[1], dz: l[2] - q[2] };
  }
  const heading = (q) => Math.atan2(q.dx, q.dz);
  const chairTheta = (t) => PI + PI * sm(seg(t, TURN[0], TURN[1]));
  const chairEnd = (th) => [-0.5 * Math.cos(th) - 0.47 * Math.sin(th), 0.5 * Math.sin(th) - 0.47 * Math.cos(th) + CHAIR[1]];
  const stand = (n, x, z, yaw) => { n.g.position.set(x, 0, z); n.yaw = yaw; n.g.rotation.set(0, yaw, 0); };

  // ------------------------------------------------------------------ позы (смесь «поза updateNpc → целевая»)
  const KEYS = { hy: 0.95, lx: 0, ld: 0, lz: 0.05, kn: 0, kd: 0, ft: 0, sx: 0.0, sy: 0, sz: 0, ax: 0, ad: 0, az: 0.08, el: -0.2, ed: 0, hx: 0, hy2: 0, hz: 0 };
  const mk = (o) => Object.assign({}, KEYS, o);
  function readPose(n) {
    return {
      hy: n.hips.position.y, lx: (n.legL.rotation.x + n.legR.rotation.x) / 2, ld: (n.legL.rotation.x - n.legR.rotation.x) / 2, lz: n.legR.rotation.z,
      kn: (n.kneeL.rotation.x + n.kneeR.rotation.x) / 2, kd: (n.kneeL.rotation.x - n.kneeR.rotation.x) / 2, ft: (n.footL.rotation.x + n.footR.rotation.x) / 2,
      sx: n.spine.rotation.x, sy: n.spine.rotation.y, sz: n.spine.rotation.z, ax: (n.armL.rotation.x + n.armR.rotation.x) / 2, ad: (n.armL.rotation.x - n.armR.rotation.x) / 2,
      az: n.armR.rotation.z, el: (n.elbL.rotation.x + n.elbR.rotation.x) / 2, ed: (n.elbL.rotation.x - n.elbR.rotation.x) / 2, hx: n.head.rotation.x, hy2: n.head.rotation.y, hz: n.head.rotation.z
    };
  }
  function applyPose(n, P) {
    n.hips.position.y = P.hy; n.hips.rotation.set(0, 0, 0);
    n.legL.rotation.set(P.lx + P.ld, 0, -P.lz); n.legR.rotation.set(P.lx - P.ld, 0, P.lz);
    n.kneeL.rotation.x = P.kn + P.kd; n.kneeR.rotation.x = P.kn - P.kd; n.footL.rotation.x = n.footR.rotation.x = P.ft;
    n.spine.rotation.set(P.sx, P.sy, P.sz);
    n.armL.rotation.set(P.ax + P.ad, 0, -P.az); n.armR.rotation.set(P.ax - P.ad, 0, P.az);
    n.elbL.rotation.x = P.el + P.ed; n.elbR.rotation.x = P.el - P.ed;
    n.head.rotation.set(P.hx, P.hy2, P.hz);
  }
  const mix = (a, b, k) => { const o = {}; Object.keys(KEYS).forEach((q) => { o[q] = lerp(a[q], b[q], k); }); return o; };
  const blendTo = (n, P, k) => applyPose(n, k >= 1 ? P : mix(readPose(n), P, k));
  const POSE = {
    seat: (bow) => mk({ hy: 0.6, lx: -1.45, lz: 0.08, kn: 1.5, ft: -0.1, sx: -0.06, ax: -0.4, az: 0.3, el: -0.95, hx: bow }),
    hang: (t) => mk({ hy: 0.95, lx: 0.1, ld: Math.sin(t * 5.3) * 0.12, lz: 0.1, kn: 0.3, kd: Math.sin(t * 4.1) * 0.1, ft: 0.55, sx: 0.08, ax: 0.18, ad: Math.sin(t * 4.6) * 0.15, az: 0.22, el: -0.3, hx: 0.55, hz: 0.15 }),
    lie: (t) => mk({ hy: 0.95, lx: 0.04, ld: 0.02, lz: 0.13, kn: 0.12, kd: 0.1, ft: 0.35, sx: 0.0, ax: 0.05, az: 0.34, el: -0.14, hx: 0.0, hz: 0.25 + Math.sin(t * 1.3) * 0.12 }),
    kneel: (bow) => mk({ hy: 0.5, lx: -0.04, lz: 0.1, kn: 1.57, ft: 0, sx: 0.03, ax: -0.18, az: 0.12, el: -0.55, hx: bow })
  };

  // ------------------------------------------------------------------ реквизит: нож и пистолет в руке
  function buildKnife(r, n, side) {
    const T3 = THREE, el = side < 0 ? n.elbL : n.elbR, grp = new T3.Group();
    grp.position.set(0, -0.31, 0); grp.rotation.x = PI / 2;
    const steel = new T3.MeshLambertMaterial({ color: 0xd6dae2, emissive: 0x484c54 }), dark = new T3.MeshLambertMaterial({ color: 0x141416, emissive: 0x060607 }), brass = new T3.MeshLambertMaterial({ color: 0x9a7a30, emissive: 0x241a08 });
    const add = (geo, m, x, y, z) => { const o = new T3.Mesh(geo, m); o.position.set(x, y, z); o.frustumCulled = false; grp.add(o); return o; };
    add(new T3.BoxGeometry(0.03, 0.034, 0.12), dark, 0, 0, 0.0);
    [-0.04, -0.012, 0.016].forEach((zz) => add(new T3.BoxGeometry(0.033, 0.038, 0.007), dark, 0, 0, zz));
    add(new T3.BoxGeometry(0.036, 0.04, 0.014), brass, 0, 0, -0.066);
    add(new T3.BoxGeometry(0.016, 0.074, 0.012), brass, 0, 0, 0.066);
    const bs = new T3.Shape();
    bs.moveTo(-0.019, 0); bs.lineTo(0.019, 0); bs.lineTo(0.019, 0.115); bs.quadraticCurveTo(0.017, 0.17, 0.0, 0.215); bs.lineTo(-0.019, 0.125); bs.lineTo(-0.019, 0);
    const bg = new T3.ExtrudeGeometry(bs, { depth: 0.006, bevelEnabled: false }); bg.translate(0, 0, -0.003);
    bg.applyMatrix4(new T3.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
    const blade = add(bg, steel, 0, 0, 0.072);
    const bl = add(new T3.BoxGeometry(0.008, 0.03, 0.09), new T3.MeshLambertMaterial({ color: 0x8a0d0d, emissive: 0x3a0505 }), 0, 0, 0.17); bl.visible = false;
    grp.visible = false; el.add(grp);
    return { grp, blade, blood: bl };
  }
  function buildPistol(r, n, side) {
    const el = side < 0 ? n.elbL : n.elbR, grp = new THREE.Group();
    grp.position.set(0, -0.31, 0); grp.rotation.x = PI / 2;
    const m = new THREE.Mesh(C.enemyGunGeo('pistol'), r.agm.gun); m.rotation.y = PI; m.frustumCulled = false; grp.add(m);
    grp.visible = false; el.add(grp);
    return grp;
  }
  const handPos = (n, side, out) => { n.g.updateMatrixWorld(true); return (side < 0 ? n.elbL : n.elbR).localToWorld(out.set(0, -0.27, 0)); };
  const _v = () => (_v.v || (_v.v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]));
  // группа n ставится так, чтобы центр тела (на высоте 0.9) был в точке c
  function placeCentre(n, cx, cy, cz, pitch, yaw, roll) {
    n.g.rotation.set(pitch, yaw, roll); n.yaw = yaw;
    const o = _v()[2].set(0, 0.9, 0).applyQuaternion(n.g.quaternion);
    n.g.position.set(cx - o.x, cy - o.y, cz - o.z);
  }

  // ------------------------------------------------------------------ звук
  function clap(r, loud) {
    const s = r.snd, c = s && s.ctx; if (!c || !s.noise) return;
    const t = c.currentTime + 0.005, k = (loud || 1) * (0.8 + Math.random() * 0.4);
    s.noise({ t, type: 'bandpass', f0: 1700 + Math.random() * 500, f1: 900, q: 0.8, dur: 0.07, g: 0.5 * k, a: 0.001 });
    s.noise({ t: t + 0.006, type: 'highpass', f0: 3000, q: 0.7, dur: 0.035, g: 0.22 * k, a: 0.001 });
    s.tone && s.tone({ t, type: 'sine', f0: 260, f1: 120, dur: 0.06, g: 0.16 * k, a: 0.002 });
    s.noise({ t: t + 0.11, type: 'bandpass', f0: 1100, q: 0.5, dur: 0.28, g: 0.06 * k, a: 0.02 });       // отзвук большого зала
  }
  async function echoSuccess(r) {
    const s = r.snd, c = s && s.ctx;
    if (!c) { r.sfx('succesfully'); return; }
    try {
      const buf = await c.decodeAudioData(await (await fetch('assets/succesfully.mp3')).arrayBuffer());
      const vol = s.sfxVol ? s.sfxVol() : 0.6, src = c.createBufferSource(); src.buffer = buf;
      const len = Math.floor(c.sampleRate * 6.5), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch += 1) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4); }
      const dry = c.createGain(), conv = c.createConvolver(), wet = c.createGain(), dl = c.createDelay(1.2), fb = c.createGain(), lp = c.createBiquadFilter(), dw = c.createGain();
      dry.gain.value = 0.75 * vol; conv.buffer = ir; wet.gain.value = 1.5 * vol;
      dl.delayTime.value = 0.46; fb.gain.value = 0.52; lp.type = 'lowpass'; lp.frequency.value = 2400; dw.gain.value = 0.5 * vol;
      src.connect(dry); dry.connect(s.dest);
      src.connect(conv); conv.connect(wet); wet.connect(s.dest);
      src.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(dw); dw.connect(s.dest);
      src.start();
    } catch (e) { r.sfx('succesfully'); }
  }

  // ------------------------------------------------------------------ экранные слои
  function css7() {
    if (document.getElementById('f48-css7')) return;
    const st = document.createElement('style'); st.id = 'f48-css7';
    st.textContent = '.f48-choice{position:absolute;inset:0;z-index:11;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:18px;padding-bottom:21vh;pointer-events:none;opacity:0;transition:opacity 1.2s}' +
      '.f48-choice.on{opacity:1}.f48-choice .fc-q{font:400 clamp(14px,1.6vw,22px) Teko,Oswald,sans-serif;letter-spacing:.5em;color:#a8a8a8;text-transform:uppercase}' +
      '.f48-choice .fc-row{display:flex;gap:28px;flex-wrap:wrap;justify-content:center;pointer-events:auto}' +
      '.f48-choice button{font:600 clamp(20px,2.6vw,36px) Teko,Oswald,sans-serif;letter-spacing:.24em;color:#e8e8e8;background:rgba(6,6,8,.66);border:1px solid rgba(232,232,232,.55);padding:12px 40px;cursor:pointer;text-transform:uppercase;transition:background .25s,color .25s,border-color .25s}' +
      '.f48-choice button b{opacity:.55;margin-right:.7em;font-weight:500}.f48-choice button:hover,.f48-choice button:focus{background:#e8e8e8;color:#0a0a0c;outline:none}' +
      '.f48-choice button.kill:hover,.f48-choice button.kill:focus{background:#b01616;border-color:#b01616;color:#fff}' +
      '.f48-quote p{margin:22px 0 0;font:400 clamp(13px,1.5vw,20px) Teko,Oswald,sans-serif;letter-spacing:.3em;color:#8c8c8c;text-transform:uppercase}';
    document.head.appendChild(st);
  }
  // выбор: «пощадить» / «убить» (кнопки, клавиши 1/2, ← →)
  function askChoice(r) {
    css7();
    return new Promise((res) => {
      const el = document.createElement('div'); el.className = 'f48-choice';
      el.innerHTML = '<div class="fc-q">HE IS YOURS</div><div class="fc-row"><button type="button" data-k="spare"><b>1</b>SPARE HIM</button><button type="button" class="kill" data-k="kill"><b>2</b>KILL HIM</button></div>';
      r.layer.appendChild(el);
      try { document.exitPointerLock && document.pointerLockElement && document.exitPointerLock(); } catch (e) { /* не критично */ }
      let done = false;
      const fin = (k) => { if (done) return; done = true; document.removeEventListener('keydown', onKey, true); el.classList.remove('on'); setTimeout(() => el.remove(), 900); res(k); };
      const onKey = (e) => {
        if (e.code === 'Digit1' || e.code === 'Numpad1' || e.code === 'KeyS') { e.preventDefault(); fin('spare'); }
        else if (e.code === 'Digit2' || e.code === 'Numpad2' || e.code === 'KeyK') { e.preventDefault(); fin('kill'); }
      };
      document.addEventListener('keydown', onKey, true);
      el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => fin(b.dataset.k)));
      void el.offsetWidth; el.classList.add('on');
    });
  }
  async function quoteOnBlack(r) {
    css7(); K.css();
    const q = (window.NexaQuotes && NexaQuotes.pick()) || { text: '', by: '' };
    const el = document.createElement('div'); el.className = 'f48-quote';
    const box = document.createElement('div'), tx = document.createElement('span'); tx.textContent = q.text; box.appendChild(tx);
    if (q.by) { const by = document.createElement('p'); by.textContent = '— ' + q.by; box.appendChild(by); }
    el.appendChild(box); r.layer.appendChild(el);
    await r.wait(0.4); box.classList.add('on');
    await r.wait(Math.min(11, 4.5 + String(q.text).length * 0.045));
    box.classList.remove('on'); await r.wait(2.4); el.remove();
  }

  // ------------------------------------------------------------------ кровь
  function blood(r, pt, dir, n, sp) { try { r.ensureBlood && r.ensureBlood(); r.bloodSpray && r.bloodSpray(pt, dir, n, sp, false); } catch (e) { /* кровь выключена */ } }
  function stain(r, x, z, rad) { try { r.ensureBlood && r.ensureBlood(); r.decal && r.decal(x, z, rad, 1); } catch (e) { /* кровь выключена */ } }

  // ================================================================== ПОЗЫ АКТЁРОВ ПО ВРЕМЕНИ
  function poseD(S, t, dt) {
    const d = S.d, r = S.r;
    let x, z, yaw;
    if (t < 9.3) { const q = trk(D_IN, t); x = q.x; z = q.z; yaw = t < D_IN[0][0] ? PI : PI; }
    else if (t < 11.6) { const th = chairTheta(t), e = chairEnd(th); x = e[0] + 0.28; z = e[1] + 0.34; yaw = Math.atan2(-0.28, -0.34); }
    else if (t < 12.8) { const e = chairEnd(chairTheta(11.6)), k = sm(seg(t, 11.6, 12.8)); x = lerp(e[0] + 0.28, DPOS[0], k); z = lerp(e[1] + 0.34, DPOS[1], k); yaw = Math.atan2(-x, -3.9 - z); }
    else if (t < 17.0) { x = DPOS[0]; z = DPOS[1]; yaw = Math.atan2(-DPOS[0], -3.9 - DPOS[1]); }
    else if (t < 19.6) { const q = trk([[17.0, DPOS[0], DPOS[1]], [19.6, POSL.d[0], POSL.d[1], 's']], t); x = q.x; z = q.z; yaw = t < 19.1 ? Math.atan2(q.dx, q.dz) : Math.atan2(-1.7 - x, -2.95 - z); }
    else if (t < T.i) { x = POSL.d[0]; z = POSL.d[1]; yaw = Math.atan2(-1.7 - x, -2.95 - z); }
    else { x = -1.3; z = -0.1; yaw = Math.atan2(0 - x, -1.9 - z); }
    if (S.dRun) { const k = S.dRun(t); x = k.x; z = k.z; yaw = k.yaw; }
    stand(d, x, z, yaw);
    // толкает кресло (правая рука — armL) за торец спинки
    const wp = sm(seg(t, 9.0, 9.6)) * (1 - sm(seg(t, 11.5, 12.1)));
    if (wp > 0.01) { const e = chairEnd(chairTheta(t)); K.armBlend(r, d, -1, wp, e[0], 1.3, e[1]); K.armBlend(r, d, 1, wp * 0.6, e[0] + 0.1, 1.05, e[1] + 0.35); }
    // аплодисменты
    const wc = sm(seg(t, 20.5, 20.9)) * (1 - sm(seg(t, 24.0, 24.4)));
    if (wc > 0.01) clapArms(r, d, t - 20.7, 0.46, wc);
    if (S.knifeOn) d.armT = 0;
  }
  function clapArms(r, n, tt, per, w) {
    const ph = (tt / per) % 1, s = 0.02 + 0.13 * (0.5 + 0.5 * Math.cos(ph * PI * 2));
    K.armMix(r, n, -1, w, () => K.armLocal(r, n, -1, -(0.02 + s), 0.33 + 0.02 * Math.sin(ph * PI * 2), 0.34));
    K.armMix(r, n, 1, w, () => K.armLocal(r, n, 1, 0.02 + s, 0.33 + 0.02 * Math.sin(ph * PI * 2), 0.34));
  }
  function poseG(S, t, dt) {
    const g = S.g, r = S.r;
    let x, z, yaw;
    if (t < G_IN[0][0]) { x = -1.1; z = 16.5; yaw = PI; }
    else if (t < 9.4) { const q = trk(G_IN, t); x = q.x; z = q.z; yaw = PI; }
    else if (t < 19.0) { x = -1.1; z = 1.9; yaw = Math.atan2(0.4, -4.5); }
    else if (t < 20.2) { const q = trk([[19.0, -1.1, 1.9], [20.2, POSL.g[0], POSL.g[1], 's']], t); x = q.x; z = q.z; yaw = t < 19.9 ? Math.atan2(q.dx, q.dz) : Math.atan2(-1.7 - x, -2.95 - z); }
    else if (t < T.i) { x = POSL.g[0]; z = POSL.g[1]; yaw = Math.atan2(-1.7 - x, -2.95 - z); }
    else { x = 1.0; z = 0.3; yaw = Math.atan2(0 - x, -1.9 - z); }
    stand(g, x, z, yaw);
    const wc = sm(seg(t, 20.8, 21.2)) * (1 - sm(seg(t, 24.0, 24.4)));
    if (wc > 0.01) clapArms(r, g, t - 20.9, 0.52, wc);
  }
  function pathP(t) {
    if (t < T.kick) return { x: 0, z: 299.0, yaw: 0 };
    if (t < 12.4) { const q = trk(P_IN, t); return { x: q.x, z: q.z, yaw: PI }; }
    if (t < 14.7) { const q = trk(P_CH, t); return { x: q.x, z: q.z, yaw: PI }; }
    if (t < 17.0) return { x: 0, z: -3.55, yaw: PI };
    if (t < 18.4) {
      const q = trk(P_KK, t), hd = 2 * PI + Math.atan2(-1.7, 0.6);
      return { x: q.x, z: q.z, yaw: t < 17.7 ? lerp(PI, hd, sm(seg(t, 17.0, 17.35))) : lerp(hd, PI, sm(seg(t, 18.0, 18.4))) };
    }
    if (t < 19.5) return { x: -1.7, z: -2.95, yaw: PI };
    if (t < T.i) return { x: -1.7, z: -2.95, yaw: lerp(PI, 0.39, sm(seg(t, 19.5, 20.3))) };
    return { x: 0, z: -1.05, yaw: PI };
  }
  function poseP(S, t, dt) {
    const p = S.p, r = S.r, q = pathP(t);
    stand(p, q.x, q.z, q.yaw);
    p.head.visible = !(t < T.kick || (t >= T.h && t < T.i) || t >= T.j || S.pov);
    // A: удар ногой по двери (вид от первого лица, видна нога)
    if (t < T.kick) {
      const wu = sm(seg(t, 0.45, 0.95)), st = sm(seg(t, 0.95, 1.2));
      const lx = lerp(lerp(0.0, -1.15, wu), -1.32, st), kn = lerp(lerp(0.0, 1.9, wu), 0.0, st);
      p.legL.rotation.x = lx; p.kneeL.rotation.x = kn; p.footL.rotation.x = lerp(0, -0.25, st);
      p.spine.rotation.x = lerp(0, -0.18, st); p.armL.rotation.x = -0.5 * wu; p.armR.rotation.x = -0.5 * wu; p.elbL.rotation.x = p.elbR.rotation.x = -0.6;
      return;
    }
    // B..: вбегает, взгляд вперёд
    // E..F: наклон, захват за воротник, подъём, бросок
    const lean = t < 14.3 ? 0 : t < GRAB ? 0.7 * sm(seg(t, 14.3, 15.0)) : t < 15.6 ? 0.7 : t < 16.0 ? lerp(0.7, 0.2, sm(seg(t, 15.6, 16.0))) : t < 17.0 ? lerp(0.2, 0.0, sm(seg(t, 16.45, 16.9))) : 0;
    if (t >= 14.3 && t < 17.2) {
      const twist = t < 16.0 ? 0 : t < 16.2 ? -0.7 * sm(seg(t, 16.0, 16.2)) : t < REL ? lerp(-0.7, 0.9, sm(seg(t, 16.2, REL))) : lerp(0.9, 0, sm(seg(t, REL, 17.2)));
      p.spine.rotation.set(lean, twist, 0);
      p.head.rotation.x = -lean * 0.5;
      const wg = sm(seg(t, 14.3, 15.0));
      if (t < 15.35) {
        K.armBlend(r, p, -1, wg, 0.0, 1.13, CHAIR[1] + SEAT_Z - 0.03 - 0.0);                  // воротник сидящего (0,1.13,-4.3)
        K.armMix(r, p, 1, wg * 0.7, () => K.armLocal(r, p, 1, 0.3, 0.2, 0.3));
      } else {
        const up = sm(seg(t, 15.35, 15.95)), wnd = sm(seg(t, 16.0, 16.2)), after = sm(seg(t, REL, REL + 0.5));
        const tx = lerp(-0.18, -0.12, wnd), ty = lerp(lerp(0.52, 0.8, up), 0.7, wnd), tz = lerp(lerp(0.4, 0.38, up), 0.34, wnd);
        K.armMix(r, p, -1, 1 - after * 0.8, () => K.armLocal(r, p, -1, tx, ty, tz));
        K.armMix(r, p, 1, 0.9, () => K.armLocal(r, p, 1, 0.14, 0.4 + 0.1 * Math.sin(t * 3), 0.2));
      }
    }
    // G: пинок лежащему в лицо
    if (t >= 18.2 && t < 19.9) {
      const wu = sm(seg(t, 18.35, 18.66)), st = sm(seg(t, 18.66, HITK)), bk = sm(seg(t, HITK + 0.05, HITK + 0.55));
      const lx = lerp(lerp(0.0, 0.5, wu), -0.55, st), kn = lerp(lerp(0.0, 1.3, wu), 0.1, st);
      const fl = bk > 0 ? bk : 0;
      p.legL.rotation.x = lerp(lx, 0, fl); p.kneeL.rotation.x = lerp(kn, 0, fl); p.footL.rotation.x = lerp(0, -0.2, st) * (1 - fl);
      p.spine.rotation.x = lerp(lerp(0, -0.1, wu), 0.08, st) * (1 - fl);
      p.armL.rotation.x = -0.3 * st; p.armR.rotation.x = 0.4 * st; p.armL.rotation.z = -0.5 * st; p.armR.rotation.z = 0.5 * st;
    }
    // I..: пистолет в руке, направлен на человека на коленях
    if (S.pst) {
      S.pst.visible = t >= 25.3 && !S.pstGone;
      const wa = sm(seg(t, 25.3, 26.2));
      if (wa > 0.01 && !S.pstGone && !S.aim) K.armMix(r, p, -1, wa, () => K.armLocal(r, p, -1, -0.14, 0.34, 0.47));
    }
  }
  // человек в маске
  function poseM(S, t, dt) {
    const m = S.m, r = S.r;
    const th = chairTheta(t);
    if (t < 15.35) {                                                                   // сидит в кресле, голова опущена; поднимает голову, когда его разворачивают
      const bow = lerp(0.55, -0.02, sm(seg(t, 12.9, 13.9))) + (t >= GRAB ? -0.3 * sm(seg(t, GRAB, GRAB + 0.15)) : 0);
      m.g.position.set(-SEAT_Z * -Math.sin(th) * 0 + (SEAT_Z) * Math.sin(th), 0, CHAIR[1] + SEAT_Z * Math.cos(th)); m.g.rotation.set(0, th, 0); m.yaw = th;
      applyPose(m, POSE.seat(bow));
      if (t >= GRAB) { m.spine.rotation.x = lerp(-0.06, 0.25, sm(seg(t, GRAB, GRAB + 0.3))); }
      return;
    }
    if (t < REL) {                                                                     // висит на руке игрока: поднят за воротник, мотается при замахе
      const ak = sm(seg(t, 15.35, 15.95)), sw = sm(seg(t, 16.2, REL));
      const yaw = 2 * PI - 0.3 * sw, roll = lerp(-0.12 * sm(seg(t, 16.0, 16.2)), 0.9, sw);
      m.g.rotation.set(0, yaw, roll); m.yaw = yaw;
      blendTo(m, mix(POSE.seat(-0.02), POSE.hang(t), ak), 1);
      const hp = handPos(S.p, -1, _v()[0]);                                           // реальная позиция руки игрока (после IK)
      const c0 = m.spine.localToWorld(_v()[1].set(0, 0.47, 0.06));
      m.g.position.set(0, 0, 0); m.g.updateMatrixWorld(true);
      const c1 = m.spine.localToWorld(_v()[1].set(0, 0.47, 0.06));
      const ox = -SEAT_Z * 0, seatX = 0, seatZ = CHAIR[1] + SEAT_Z;
      const tx = hp.x - c1.x, ty = hp.y - c1.y, tz = hp.z - c1.z;
      m.g.position.set(lerp(seatX, tx, ak) + ox, lerp(0, ty, ak), lerp(seatZ, tz, ak));
      void c0;
      return;
    }
    if (t < LAND) {                                                                    // полёт: баллистика центра, переворот на спину
      if (!S.rel) { m.g.updateMatrixWorld(true); const c = m.g.localToWorld(new THREE.Vector3(0, 0.9, 0)); S.rel = { x: c.x, y: c.y, z: c.z, roll: m.g.rotation.z, yaw: m.g.rotation.y }; }
      const R = S.rel, tau = t - REL, Tf = LAND - REL, u = tau / Tf;
      const tx = LIE.x + 0.25, ty = 0.2, tz = LIE.z;
      const cx = lerp(R.x, tx, u), cz = lerp(R.z, tz, u), cy = lerp(R.y, ty, u) + 4.9 * tau * (Tf - tau);
      const pit = lerp(0, -PI / 2, sm(u)), yaw = lerp(R.yaw, LIE.yaw, sm(u)), roll = lerp(R.roll, 0, sm(u));
      placeCentre(m, cx, cy, cz, pit, yaw, roll);
      blendTo(m, POSE.hang(t * 1.6), 1);
      blendTo(m, POSE.lie(t), sm(u));
      return;
    }
    if (t < 20.6) {                                                                    // лежит на спине: отскок, скольжение, стон; пинок
      const tb = t - LAND, bounce = tb < 0.28 ? 0.11 * Math.sin(PI * tb / 0.28) * (1 - tb / 0.28 * 0.4) : 0, slide = -0.25 * (1 - Math.pow(1 - Math.min(1, tb / 0.55), 2));
      let hx = LIE.x + 0.25 + slide, hz = LIE.z;
      let kk = 0; if (t >= HITK) kk = Math.exp(-(t - HITK) * 5);
      hz -= 0.14 * (1 - Math.exp(-(t - HITK) * 14)) * (t >= HITK ? 1 : 0);
      placeCentre(m, hx, 0.2 + bounce, hz, -PI / 2, LIE.yaw + (t >= HITK ? 0.1 * (1 - kk) : 0), 0);
      const P = POSE.lie(t); applyPose(m, P);
      if (t >= HITK) { m.head.rotation.set(0.1, -1.1 * (1 - 0.35 * (1 - kk)), 0.5 + 0.5 * kk); m.legL.rotation.x += 0.3 * kk; m.armL.rotation.z -= 0.2 * kk; }
      S.lieAt = [hx, hz];
      return;
    }
    if (t < 22.4) {                                                                    // поднимается с пола (за кадром)
      const k = sm(seg(t, 20.6, 22.4));
      placeCentre(m, lerp(S.lieAt ? S.lieAt[0] : LIE.x, -2.4, k), lerp(0.2, 0.9, k), lerp(S.lieAt ? S.lieAt[1] : LIE.z, -3.0, k), lerp(-PI / 2, 0, k), lerp(LIE.yaw, 2 * PI + 0.2, k), 0);
      blendTo(m, POSE.lie(t), 1 - k);
      if (k > 0.9) m.g.position.y = 0;
      return;
    }
    if (t < T.i) { stand(m, -2.4, -3.0, 2 * PI + 0.2); m.head.rotation.x = 0.4; return; }
    // I: идёт к игроку, опускается на колени, голова опущена, потом медленно поднимает взгляд
    const q = trk([[T.i, -2.4, -3.0], [26.3, 0, -1.9, 's']], t), kn = sm(seg(t, 26.3, 27.6));
    const hd = t < 26.3 ? Math.atan2(q.dx, q.dz) : 0;
    stand(m, q.x, kn > 0 ? -1.9 : q.z, t < 26.3 ? lerp(hd, hd, 1) : lerp(hd, 0, 1));
    if (t >= 26.2) m.yaw = m.g.rotation.y = lerp(Math.atan2(0 - q.x, -1.9 - q.z), 0, sm(seg(t, 26.0, 26.6)));
    const bow = lerp(0.4, 0.55, kn) - 0.65 * sm(seg(t, 28.0, 28.9)) + (S.mHead || 0);
    if (kn > 0) blendTo(m, POSE.kneel(bow), kn); else m.head.rotation.x = 0.4;
    if (kn > 0.5) m.head.rotation.x = bow;
  }

  // ------------------------------------------------------------------ общий проход: поза всех участников момента t
  function pose(S, t, dt) {
    const R = S.RH;
    if (R && R.door) {
      const tau = t - T.kick;
      R.door.set(tau < 0 ? 0 : Math.max(0, 1 - Math.exp(-10 * tau) * Math.cos(13 * tau)));
      S.chair.rotation.y = chairTheta(t);
    }
    poseD(S, t, dt);
    poseG(S, t, dt);
    if (t < 15.35) { poseM(S, t, dt); poseP(S, t, dt); } else { poseP(S, t, dt); poseM(S, t, dt); }
  }

  // ------------------------------------------------------------------ события (звук, реплики, кровь)
  function events(S) {
    const r = S.r, ev = [], on = (t, fn) => ev.push([t, fn]);
    const snd = (name, o) => K.snd(r, name, o);
    on(0.78, () => snd('whoosh', { k: 0.7 }));
    on(T.kick - 0.02, () => { snd('kick', { k: 1 }); snd('slam', { k: 1 }); snd('boom', { k: 0.8 }); });
    on(T.kick + 0.26, () => { snd('slam', { k: 0.7 }); snd('thud', { k: 0.8 }); });
    on(T.kick + 0.05, () => K.amb.set(r, 'head', { fade: 1.2 }));
    on(9.5, () => r.say(DIC, 'There he is.', 1.6));
    on(TURN[0], () => snd('slide', { k: 0.8 }));
    on(TURN[1] - 0.1, () => snd('thud', { k: 0.5 }));
    on(GRAB, () => { snd('rustle', { k: 1 }); snd('flesh', { k: 0.6 }); });
    on(15.8, () => snd('rustle', { k: 0.7 }));
    on(REL, () => snd('whoosh', { k: 1 }));
    on(LAND, () => { snd('fall', { k: 1 }); snd('thud', { k: 1 }); snd('slam', { k: 0.6 }); stain(r, LIE.x + 0.5, LIE.z, 0.0); r.cineJolt && r.cineJolt(0.5); });
    on(HITK - 0.1, () => snd('whoosh', { k: 0.6 }));
    on(HITK, () => {
      snd('kick', { k: 1 }); snd('bone', { k: 1 }); snd('flesh', { k: 0.8 });
      const h = S.m.head.getWorldPosition(new THREE.Vector3());
      blood(r, { x: h.x, y: h.y + 0.05, z: h.z }, { x: -0.2, y: 0.6, z: -0.8 }, 12, 4.2); stain(r, h.x, h.z - 0.1, 0.25);
      r.cineJolt && r.cineJolt(0.7);
    });
    on(HITK + 0.3, () => snd('breath', { k: 0.6 }));
    for (let i = 0; i < 8; i += 1) { on(20.7 + i * 0.46, () => clap(r, 1)); on(20.95 + i * 0.52, () => clap(r, 0.85)); }
    on(23.6, () => { clap(r, 1.1); });
    on(25.3, () => { snd('click', { k: 0.9 }); snd('slide', { k: 0.5 }); });
    S.ev = ev.sort((a, b) => a[0] - b[0]);
  }

  // ================================================================== ФАЗА HEAD
  PH.head = async function (r, ctx) {
    const W = ctx.W, st = K.st(r);
    css7(); K.css();
    K.lock(r);
    await r.clearEnemies();
    r.noFight = true;
    const TM = st.team || await K.makeTeam(r, { D: [0, 296, 0], G: [0.8, 295, 0] });
    const d = TM.d, g = TM.g;
    [d, g].forEach((n) => { if (!n.suitMeshes) F.suit(r, n); n.g.visible = true; K.ally.stop(n); n.goal = null; });
    if (!W.cur || W.cur.name !== 'dark') W.enter('dark', 0, 297.4, PI);
    const RH = W.R.head;
    if (!RH.built) { W.build(RH); RH.g.visible = false; }
    r.p.x = 0; r.p.z = 297.6; r.p.yaw = PI; r.p.pitch = 0;
    const p = K.pbody(r, 0, 299.0, 0), m = F.maskman(r, 0, CHAIR[1] + SEAT_Z, PI);
    await m.ready;
    d.armT = g.armT = 0;
    const S = { r, W, RH, d, g, p, m, t: 0, run: true, ev: [], chair: RH.chair, knife: buildKnife(r, d, -1), pst: buildPistol(r, p, -1), rel: null, aim: false, pstGone: false };
    events(S);
    let fired = 0;
    const off = K.hook(r, (dt) => {
      if (r.disposed || S.dead) return;
      if (S.run) S.t = Math.min(T.j, S.t + dt);
      if (S.run && !r.cineSkip) while (fired < S.ev.length && S.ev[fired][0] <= S.t) { const e = S.ev[fired]; fired += 1; try { e[1](); } catch (err) { console.error(err); } }
      pose(S, S.t, dt);
    });
    S.off = off;
    pose(S, 0, 0);
    const SY = (t0) => (rr) => S.t - t0;
    const pPos = () => pathP(S.t);
    const mHead = () => S.m.head.getWorldPosition(_v()[0]);
    const at = (t0, t1, o) => sh(Object.assign({ dur: t1 - t0, sync: SY(t0) }, o));
    const enterHead = () => {
      if (W.cur !== RH) { W.enter('head', 0, 12.6, 0); RH.door.set(0); }
      d.g.visible = g.g.visible = true;
    };
    const shots = [
      // A. дверь: от первого лица — замах и удар ногой
      at(0, T.kick, {
        at: [0, 1.6, 298.1], to: [0, 1.58, 298.55], look: [0, 1.5, 310], lookTo: [0, 0.7, 301.3], fov: 74, fovTo: 58, hand: 1.0, tense: 1.4, jolt: [T.kick - 0.04, 1.3],
        run: () => { if (r.fadeBlack) r.fadeBlack(0, 0.3); r.fade(0, 0.3); K.amb.set(r, 'corridor', { fade: 0.3 }); }
      }),
      // B1. дверь распахивается: камера в зале, на двери
      at(T.kick, T.b2, {
        at: [0.5, 0.95, 7.2], to: [0.25, 1.1, 6.3], look: [0, 1.9, 12.5], lookTo: [0, 1.7, 12.5], fov: 70, fovTo: 62, hand: 0.5, tense: 1.2, jolt: [0.1, 0.9],
        run: () => { enterHead(); pose(S, S.t, 0); }
      }),
      // B2. сзади, снаружи: игрок входит в зал
      at(T.b2, T.c, {
        at: [1.7, 1.7, 15.6], to: [1.2, 1.7, 12.0], look: [0, 1.5, 4], lookTo: [0, 1.5, 0], fov: 60, fovTo: 56, hand: 0.6, tense: 0.7,
        tick: (rr, e, tt) => { const cf = rr.camFree, P = pPos(); cf.pos.z = Math.max(cf.pos.z, P.z + 2.8); cf.look.set(0, 1.45, P.z - 7); }
      }),
      // C. боковой проезд: игрок идёт через зал, Диктор обгоняет
      at(T.c, T.d1, {
        at: [3.8, 1.4, 9.5], to: [3.4, 1.4, 2.0], look: [0, 1.5, 6], lookTo: [0, 1.5, 0], fov: 52, fovTo: 50, hand: 0.7, tense: 0.7,
        tick: (rr, e, tt) => { const cf = rr.camFree, P = pPos(); cf.pos.set(4.1 - 0.5 * e, 1.35, P.z + 1.0); cf.look.set(0.2, 1.45, P.z - 1.3 + 0.5 * e); }
      }),
      // D1. Диктор у кресла: разворачивает его
      at(T.d1, T.d2, {
        at: [4.4, 1.5, -0.4], to: [3.2, 1.25, -1.6], look: [0.3, 1.3, -3.9], lookTo: [0.1, 1.25, -4.0], fov: 52, fovTo: 44, hand: 0.6, tense: 0.9
      }),
      // D2. крупно: человек в маске поднимает голову
      at(T.d2, T.e, {
        at: [1.7, 1.3, -2.1], to: [1.15, 1.22, -2.6], look: [0, 1.2, -4.1], lookTo: [0, 1.2, -4.15], fov: 40, fovTo: 32, hand: 0.5, tense: 1.0
      }),
      // E. игрок наклоняется и хватает его за воротник
      at(T.e, T.f, {
        at: [2.4, 1.4, -3.0], to: [1.9, 1.38, -3.25], look: [0, 1.25, -3.95], lookTo: [0, 1.3, -3.95], fov: 46, fovTo: 40, hand: 0.7, tense: 1.2
      }),
      // F. подъём, замах, бросок — камера следит за человеком
      at(T.f, T.g1, {
        at: [2.7, 1.5, -0.3], to: [1.5, 1.2, -1.1], look: [0.2, 1.3, -3.8], lookTo: [-0.3, 1.0, -3.6], fov: 52, fovTo: 56, hand: 0.9, tense: 1.4, jolt: [LAND - T.f, 0.9],
        tick: (rr, e, tt) => { const cf = rr.camFree; if (S.t > REL - 0.2) { const h = S.m.g.localToWorld(_v()[0].set(0, 0.9, 0)), k = sm(seg(S.t, REL - 0.2, REL + 0.25)); cf.look.set(lerp(cf.look.x, h.x, k), lerp(cf.look.y, h.y, k), lerp(cf.look.z, h.z, k)); } }
      }),
      // G1. игрок идёт к лежащему
      at(T.g1, T.g2, {
        at: [0.3, 1.0, -1.5], to: [-0.6, 0.85, -1.9], look: [-1.5, 0.6, -3.2], lookTo: [-1.7, 0.35, -3.3], fov: 56, fovTo: 50, hand: 0.8, tense: 1.0
      }),
      // G2. замедление: пинок в лицо
      at(T.g2, T.g3, {
        at: [-0.35, 0.42, -2.55], to: [-0.6, 0.38, -2.7], look: [-1.68, 0.3, -3.3], lookTo: [-1.68, 0.28, -3.3], fov: 50, fovTo: 44, hand: 0.35, tense: 1.2, slow: 0.25,
        run: () => { r.timeScale = 0.25; }
      }),
      // G3. после удара
      at(T.g3, T.h, {
        at: [0.5, 1.35, -1.5], to: [0.95, 1.5, -1.1], look: [-1.6, 0.7, -3.2], lookTo: [-1.7, 0.9, -3.0], fov: 54, fovTo: 50, hand: 0.8, tense: 0.9,
        run: () => { r.timeScale = 1; }
      }),
      // H. взгляд игрока на Диктора и девушку: аплодисменты
      at(T.h, T.i, {
        at: [-1.7, 1.62, -2.95], to: [-1.68, 1.62, -2.9], look: [0.0, 1.45, 1.1], lookTo: [-0.2, 1.5, 1.2], fov: 62, fovTo: 56, hand: 0.5, tense: 0.5,
        run: () => { S.pov = true; }, end: () => { S.pov = false; }
      }),
      // I. человек в маске подходит и опускается на колени
      at(T.i, T.j, {
        at: [1.9, 1.3, 0.3], to: [2.55, 1.15, -1.45], look: [0.0, 1.1, -1.5], lookTo: [0, 0.95, -1.5], fov: 48, fovTo: 44, hand: 0.6, tense: 0.9,
        tick: (rr, e, tt) => { const q = trk([[T.i, -2.4, -3.0], [26.3, 0, -1.9, 's']], S.t); const w = 1 - sm(seg(S.t, 26.2, 27.6)); if (w > 0) rr.camFree.look.set(lerp(0, q.x, 0.55 * w), lerp(0.95, 1.15, w), lerp(-1.5, q.z, 0.55 * w)); }
      })
    ];
    try { await r.cinematic(shots); } finally { /* пропуск: ниже ставим конечное состояние */ }
    S.run = false; S.t = T.j; r.timeScale = 1;
    if (W.cur !== RH) enterHead();
    K.amb.set(r, 'head', { fade: 0.6 });
    pose(S, T.j, 0);
    S.pov = true; p.head.visible = false;
    r.p.x = 0; r.p.z = -1.05; r.p.yaw = 0; r.p.pitch = 0;
    r.fade(0, 0.2);

    // ---------------------------------------------------------- выбор: пощадить или убить (держим кадр, пока игрок не решит)
    let pick = null;
    const live = { ph: 0 };
    const skipHint = r.qs('.m-skip'); if (skipHint) skipHint.style.display = 'none';
    S.live = live;
    const holdOff = K.hook(r, (dt) => {                                              // тихое дыхание сцены, пока ждём решения
      if (r.disposed) return;
      live.ph += dt;
      S.mHead = Math.sin(live.ph * 1.1) * 0.02;
    });
    const jShot = () => sh({
      at: [0, 1.6, -1.04], to: [0, 1.56, -1.1], look: [0, 1.15, -1.9], fov: 58, dur: 3600, hand: 0.45, tense: 0.4, frame: 0,
      tick: (rr, e, tt) => {
        const cf = rr.camFree, k = sm(tt / 7), g = S.m.g.position;                       // поза человека применяется после тика, поэтому цель задана по группе, а не по кости
        cf.pos.set(0, lerp(1.6, 1.55, k), lerp(-1.04, -1.14, k)); cf.look.set(g.x * 0.8, lerp(1.02, 1.0, k), g.z);
      }
    });
    // камера от первого лица держится на человеке в маске, пока идёт выбор и вся развязка (Space/Enter её не прерывает)
    S.holdStop = false;
    const holdLoop = (async () => { while (!S.holdStop && !r.disposed) { await r.cinematic([jShot()]); if (!S.holdStop) await r.wait(0.01); } })();
    S.holdEnd = () => { S.holdStop = true; if (r.shotState && r.shotState.done) r.shotState.done(); };
    void holdLoop;
    r.wait(1.4).then(() => { if (!pick) r.say(DIC, 'Your call, 083.', 2.2); });
    pick = await askChoice(r);
    if (skipHint) skipHint.style.display = '';
    holdOff();
    S.mHead = 0;
    st.headChoice = pick;
    K.ost(r, false, 0.4);
    // ---------------------------------------------------------- развязка
    S.bt = 0;
    const brOff = K.hook(r, (dt) => { S.bt += dt; });
    if (pick === 'kill') await killScene(S); else await spareScene(S);
    brOff();
    // чёрный экран уже стоит: цитата режима HIGH/LOW
    K.cutFade(r, 1);
    await quoteOnBlack(r);
    off();
    S.dead = true;
    st.headObjs = [S.m, S.p];                                                         // уберёт PH.bombs: этажи ниже — другие помещения
    st.headDone = true;
  };

  // ------------------------------------------------------------------ развязка 1: выстрел (дуло ко лбу → мгновенный чёрный экран)
  async function killScene(S) {
    const r = S.r, p = S.p, m = S.m;
    S.aim = true;
    K.amb.set(r, 'none', { fade: 1.4 });
    const sh0 = _v()[0], tgt = _v()[1];
    const off = K.hook(r, () => {
      const k = sm(S.bt / 1.5);
      m.head.getWorldPosition(tgt); const fh = m.head.localToWorld(_v()[2].set(0, 0.1, 0.2));
      p.spine.updateWorldMatrix(true, false);
      sh0.set(-0.2, 0.46, 0); p.spine.localToWorld(sh0);
      const dx = fh.x - sh0.x, dy = fh.y - sh0.y, dz = fh.z - sh0.z, L = Math.hypot(dx, dy, dz) || 1;
      const hx = fh.x - dx / L * 0.23, hy = fh.y - dy / L * 0.23, hz = fh.z - dz / L * 0.23;
      const lo = [0.14 + p.g.position.x, 1.35, p.g.position.z - 0.47];
      K.armBlend(r, p, -1, 1, lerp(lo[0], hx, k), lerp(lo[1], hy, k), lerp(lo[2], hz, k));
      K.armMix(r, p, 1, 0.8, () => K.armLocal(r, p, 1, 0.3, 0.2, 0.3));
      m.head.rotation.x = -0.12 * k; m.head.rotation.z = 0.04 * Math.sin(S.bt * 9) * k;
    });
    K.amb.pulse && K.amb.pulse(r, 'heart', 0.5);
    await r.wait(1.9); K.amb.pulse && K.amb.pulse(r, 'heart', 0.7);
    await r.wait(1.1);
    K.snd(r, 'click', { k: 1 });
    await r.wait(0.55);
    K.black(r, 1, 0);
    try { r.snd.shot('pistol'); } catch (e) { K.snd(r, 'boom', { k: 1 }); }
    S.holdEnd(); off();
  }

  // ------------------------------------------------------------------ развязка 2: оружие брошено на пол → Диктор в ярости режет горло ножом
  async function spareScene(S) {
    const r = S.r, p = S.p, m = S.m, d = S.d;
    S.aim = true;
    const sh0 = _v()[0];
    const drop = { m: null, v: new THREE.Vector3(), live: false, landed: false };
    const mesh = new THREE.Mesh(C.enemyGunGeo('pistol'), r.agm.gun); mesh.rotation.y = PI; mesh.visible = false; mesh.frustumCulled = false;
    const holder = new THREE.Group(); holder.add(mesh); r.scene.add(holder); S.holder = holder;
    const spin = new THREE.Vector3(5, 3, 7);
    let knifeOut = false, stabbed = false, jet = 0;
    const throwAt = 0.9, kn = S.knife;
    const D0 = [d.g.position.x, d.g.position.z];
    const runPath = (bt) => {
      const u = sm(seg(bt, 3.2, 4.15)), ex = -0.52, ez = -1.55;
      return { x: lerp(D0[0], ex, u), z: lerp(D0[1], ez, u), yaw: Math.atan2(0 - lerp(D0[0], ex, u), -1.9 - lerp(D0[1], ez, u)) };
    };
    const off = K.hook(r, (dt) => {
      const bt = S.bt;
      // P: рука с оружием опускается, замах в сторону и бросок
      const a = sm(seg(bt, 0, 0.9)), rel = bt >= throwAt;
      if (!rel) K.armBlend(r, p, -1, 1, p.g.position.x + lerp(0.14, 0.42, a), lerp(1.35, 1.2, a), p.g.position.z - lerp(0.47, 0.35, a));
      else { const b = sm(seg(bt, throwAt, throwAt + 0.7)); K.armMix(r, p, -1, 1 - b, () => K.armBlend(r, p, -1, 1, p.g.position.x + 0.55, 1.1, p.g.position.z - 0.2)); }
      K.armMix(r, p, 1, 0.8, () => K.armLocal(r, p, 1, 0.3, 0.2, 0.3));
      if (bt >= throwAt && !drop.live && !drop.landed) {
        const hp = handPos(p, -1, _v()[0]);
        S.pstGone = true; S.pst.visible = false;
        holder.position.copy(hp); mesh.visible = true; drop.live = true; drop.v.set(0.62, 1.0, -1.48);
        K.snd(r, 'throw', { k: 0.6 });
      }
      if (drop.live) {
        drop.v.y -= 9.8 * dt; holder.position.addScaledVector(drop.v, dt);
        holder.rotation.x += spin.x * dt; holder.rotation.y += spin.y * dt; holder.rotation.z += spin.z * dt;
        if (holder.position.y <= 0.05) {
          holder.position.y = 0.05;
          if (!drop.landed) { drop.landed = true; K.snd(r, 'gundrop', { k: 1 }); }
          if (Math.abs(drop.v.y) > 1.2) { drop.v.y *= -0.35; drop.v.x *= 0.5; drop.v.z *= 0.5; spin.multiplyScalar(0.5); K.snd(r, 'gundrop', { k: 0.5 }); }
          else { drop.live = false; holder.rotation.set(Math.PI / 2, 0.6, 0); }
        }
      }
      // M: смотрит на игрока
      m.head.rotation.x = lerp(-0.1, 0.0, a);
      const lk = sm(seg(bt, 3.15, 3.8));                                             // человек замечает бегущего Диктора и отшатывается
      m.head.rotation.y = -0.75 * lk; m.spine.rotation.x = -0.12 * lk; m.head.rotation.x -= 0.1 * lk;
      // D: бежит с ножом, колет
      if (bt >= 2.5 && !knifeOut) { knifeOut = true; S.knifeOn = true; kn.grp.visible = true; K.snd(r, 'slide', { k: 0.9 }); K.snd(r, 'click', { k: 0.6 }); }
      if (bt >= 3.1) S.dRun = runPath;
      if (bt >= 3.0 && bt < 4.35) {
        const rp = runPath(bt), th = m.head.getWorldPosition(_v()[1]);
        const thr = _v()[2].set(th.x, th.y - 0.13, th.z + 0.07);
        const reach = sm(seg(bt, 3.75, 4.12));
        d.g.position.set(rp.x, 0, rp.z); d.g.rotation.y = d.yaw = rp.yaw;
        const sd = _v()[0]; d.spine.updateWorldMatrix(true, false); sd.set(-0.2, 0.46, 0); d.spine.localToWorld(sd);
        const dx = thr.x - sd.x, dy = thr.y - sd.y, dz = thr.z - sd.z, L = Math.hypot(dx, dy, dz) || 1;
        const cx = lerp(sd.x - 0.05 + (dx / L) * 0.1, thr.x - dx / L * 0.3, reach), cy = lerp(sd.y - 0.15, thr.y - dy / L * 0.3, reach), cz = lerp(sd.z + (dz / L) * 0.1, thr.z - dz / L * 0.3, reach);
        K.armBlend(r, d, -1, 1, cx, cy, cz);
        d.spine.rotation.x = 0.3 * sm(seg(bt, 3.1, 3.7)); d.spine.rotation.y = -0.15;
        if (bt >= 4.12 && !stabbed) {
          stabbed = true; kn.blood.visible = true;
          K.snd(r, 'flesh', { k: 1 }); K.snd(r, 'punchheavy', { k: 0.7 }); r.cineJolt && r.cineJolt(1.1);
          jet = 0.2;
        }
      }
      if (jet > 0) {
        jet -= dt;
        const th = m.head.getWorldPosition(_v()[1]);
        blood(r, { x: th.x, y: th.y - 0.12, z: th.z + 0.08 }, { x: -0.5 + Math.random() * 0.4, y: 0.7, z: 0.8 }, 5, 4.5);
      }
    });
    S.bt = 0;
    await r.wait(0.8);
    r.say(DIC, 'Pick it up, 083.', 1.4);
    await r.wait(1.8);
    r.say(DIC, 'Then I will.', 1.0);
    while (!stabbed && !r.disposed) await r.wait(0.02);
    await r.wait(0.14);
    K.black(r, 1, 0);
    S.holdEnd(); off(); S.dRun = null;
    try { r.scene.remove(holder); } catch (e) { /* уже убран */ }
  }

  // ================================================================== ФАЗА END: тишина → звук «задание выполнено» с эхом → медленная надпись
  PH.end = async function (r) {
    K.css();
    K.lock(r);
    K.cutFade(r, 1); K.black(r, 1, 0);
    await r.wait(2.2);
    echoSuccess(r);
    const el = document.createElement('div'); el.className = 'f48-done';
    const h = document.createElement('h1'); h.textContent = 'МИССИЯ ВЫПОЛНЕНА'; el.appendChild(h); r.layer.appendChild(el);
    await r.wait(0.3); h.classList.add('on');
    await r.wait(11);
    h.classList.remove('on');
    await r.wait(3.2);
    el.remove();
    if (!PH.credits) r.finish(true);   // титры (f48credits.js) завершают миссию сами
  };
}());
