// NEXA: миссия 48 — акт 4: этаж 2 (ХРАНИЛИЩЕ И АРХИВ): прорыв по галерее с бронешторками, подрыв ворот, ограбление за 2 минуты; затем газ.
// Весь текст — английский. Команда (Диктор + девушка) приходит из акта 3 в st.team. Регион 'vault' — js/f48world4.js.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.PH || !C.f48.K || !C.f48.K.allyFire || !C.f48.K.suitMode || !C.f48.VAULT || !C.f48.Mk) return;
  const F = C.f48, K = F.K, PH = F.PH, { lerp, smooth } = C, PI = Math.PI;
  const DIC = 'DICTOR';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const put = (n, x, z, yaw) => { n.g.position.set(x, 0, z); n.yaw = yaw; n.g.rotation.y = yaw; n.goal = null; K.ally.stop(n); };
  const sh = (x) => K.shot(Object.assign({ dur: 3 }, x));
  // yaw актёров: 0 — лицом к +Z (юг), PI — к −Z (север, вглубь хранилища)

  // ================================================================== ГАЛЕРЕЯ: три крыла, две шторки
  // need — сколько охраны крыла нужно снять, чтобы шторка отпустила; rows — ряды комнат (R.rooms[i]) этого крыла; posts — часовые в галерее (лицом к югу)
  const SEG = [
    { rows: [3, 4], need: 26, posts: [[-4, 14, 0], [4, 14, 0], [0, 10.5, 0], [-8, 9.5, 0], [8, 9.5, 0], [-3, 5.5, 0], [3, 5.5, 0], [0, 16.5, 0]] },
    { rows: [1, 2], need: 34, posts: [[-4, -0.5, 0], [4, -0.5, 0], [0, -4, 0], [-8, -7.5, 0], [8, -7.5, 0], [-3, -10.5, 0], [3, -10.5, 0], [0, -15.5, 0], [-8, -1.5, 0], [8, -1.5, 0]] },
    { rows: [0, 5], need: 40, posts: [[-4, -22, 0], [4, -22, 0], [0, -25, 0], [-8, -23, 0], [8, -23, 0], [-3, -27, 0], [3, -27, 0]] }
  ];
  const segOf = (V, z) => (z > V.R.shutters[0].z - 0.8 ? 0 : z > V.R.shutters[1].z - 0.8 ? 1 : 2);

  function vaultEnd(r) {
    const V = r.f48vault; if (!V) return;
    V.dead = true; V.offs.forEach((f) => { try { f(); } catch (e) { /* уже снят */ } }); V.offs = [];
    V.allies.forEach((a) => { a.n.armT = 0; if (a.n.flashM) a.n.flashM.visible = false; });
    r.f48vault = null;
  }
  // состояние одного прохода участка: союзники с миниганами, директор охраны; всё снимается vaultEnd при повторе
  function vaultBegin(r, R, team) {
    vaultEnd(r);
    r.combat();
    const V = r.f48vault = {
      r, R, t: 0, cap: r.q.maxEnemies <= 6 ? 14 : r.q.maxEnemies <= 9 ? 20 : 28, kills: [0, 0, 0], spawned: [0, 0, 0], segT: [null, null, null], rooms: SEG.map((s) => R.rooms.filter((rm) => s.rows.includes(rm.i))),
      allies: [], offs: [], dirT: 0, dir: false, fire: true, dead: false, trick: false, trickT: 5, total: 0
    };
    const mk = (n, rate, dmg, acc, snd) => { F.npcMinigun(r, n); V.allies.push({ n, cd: rnd(0.2, 0.8), rate, dmg, acc, flash: 0, snd, spin: 0 }); };
    mk(team.d, 0.085, 17, 0.58, 'elmg'); mk(team.g, 0.1, 14, 0.5, 'elmg');
    V.offs.push(K.hook(r, (dt) => vtick(V, dt)));
    if (!r.cb.__f48vk) {
      r.cb.__f48vk = true;
      r.cb.killHooks.push((e) => { const v = r.f48vault; if (v && !v.dead && e.vseg !== undefined) { v.kills[e.vseg] += 1; v.total += 1; } });
    }
    return V;
  }

  function spawnV(V, seg, rooms, hp) {
    const r = V.r, p = r.p;
    let rm = null;
    for (let i = 0; i < 8 && !rm; i += 1) { const c = pick(rooms); if (Math.hypot(c.cx - p.x, c.cz - p.z) >= 12) rm = c; }
    if (!rm) return null;
    const roll = Math.random(), prog = seg / 2;
    const type = roll < 0.07 + 0.14 * prog ? 'heavy' : roll < 0.32 ? 'rusher' : 'grunt';
    const x = rm.cx + rnd(-3, 3), z = rm.cz + rnd(-2.4, 2.4);
    const e = r.enemy(type, x, z, { drop: false, yaw: Math.atan2(p.x - x, p.z - z), speed: rnd(0.95, 1.2), hp: hp || (type === 'heavy' ? 2.2 : 1.7) });
    e.tag = 'vguard'; e.vseg = seg; V.spawned[seg] += 1;
    return e;
  }
  // часовые стоят в галерее, пока не заметят игрока (или он не подойдёт на 17 м)
  function placePosts(V, seg) {
    SEG[seg].posts.forEach((q) => {
      const e = V.r.enemy('grunt', q[0], q[1], { drop: false, yaw: q[2], hp: 1.7 });
      e.tag = 'vguard'; e.vseg = seg; V.spawned[seg] += 1;
      e.ai = (ee, dt, rr, dist) => { if (ee.los || dist < 17) { ee.ai = null; return false; } ee.n.armT = 0; return true; };
    });
  }
  function director(V, dt) {
    const r = V.r, p = r.p, seg = segOf(V, p.z);
    if (V.segT[seg] === null) V.segT[seg] = V.t;
    V.dirT -= dt;
    if (V.dirT > 0) return;
    const alive = r.enemiesAlive(), lim = SEG[seg].need + 8;
    V.dirT = rnd(0.45, 0.9) * (0.6 + alive / V.cap * 0.8);
    if (V.spawned[seg] >= lim) return;
    const batch = 1 + (seg > 0 ? 1 : 0) + (V.t - V.segT[seg] < 10 ? 1 : 0);
    for (let i = 0; i < batch && r.enemiesAlive() < V.cap && V.spawned[seg] < lim; i += 1) spawnV(V, seg, V.rooms[seg]);
  }
  // пока игрок обчищает хранилище, из казарм и оружейной подтягивается охрана (по 1–2 каждые 5–10 с; девушка у дверей встречает их огнём)
  function trickle(V, dt) {
    const r = V.r;
    V.trickT -= dt;
    if (V.trickT > 0) return;
    V.trickT = rnd(5, 10);
    if (r.enemiesAlive() >= 7) return;
    const rooms = V.R.rooms.filter((rm) => rm.i === 5), n = Math.random() < 0.5 ? 2 : 1;
    for (let i = 0; i < n; i += 1) spawnV(V, 2, rooms, 1.2);
    K.amb.pulse(r, 'shout', 0.5);
  }
  function vtick(V, dt) {
    const r = V.r;
    if (!(dt > 0) || r.paused || r.disposed || V.dead) return;
    dt = Math.min(dt, 0.05);
    if (V.fire && !r.dead) K.allyFire(V, dt);
    if (r.locked || r.cineDepth > 0 || r.dead) return;
    V.t += dt;
    if (V.dir) director(V, dt);
    if (V.trick) trickle(V, dt);
    if (r.stepN !== V.step) { V.step = r.stepN; if (r.p.moving > 0.3 && r.stepN !== undefined) { K.amb.pulse(r, 'thunk', 0.5); r.kick(0, 0, 0, 0.0045); } }
  }
  // створка шторки едет вверх (свой твин: при повторе участка старый твин не трогает уже сброшенную шторку)
  async function slide(V, s, dur) {
    s.open = true;
    await V.r.tween(dur, (k) => { if (!V.dead) s.set(k); }, smooth);
    if (!V.dead) s.set(1);
  }

  // ------------------------------------------------------------------ заряд на воротах: плита, четыре цилиндрических блока, ремни, пульт с красным таймером
  function mkBomb(R) {
    const M = new F.Mk(), COLS = 9, ROWS = 5, PX = 0.56, PY = 0.46, Y0 = 0.88;
    M.b(5.3, 0.14, 0.24, 0, 0.62, 0.1, 0x1c1d20); M.b(5.3, 0.14, 0.24, 0, 3.08, 0.1, 0x1c1d20);          // монтажные рельсы поперёк шва створок
    for (let c = 0; c < COLS; c += 1) {
      const x = (c - (COLS - 1) / 2) * PX;
      for (let i = 0; i < ROWS; i += 1) {
        const y = Y0 + i * PY;
        M.b(0.5, 0.4, 0.13, x, y, 0.1, (c + i) % 2 ? 0xdcd6c4 : 0xcdc6b2);                                  // брикет пластита
        M.b(0.07, 0.42, 0.14, x, y, 0.1, 0x3a4228);                                                         // стяжка-лента
        M.b(0.5, 0.05, 0.14, x, y + 0.14, 0.1, 0xb8b09a);
      }
      M.y(0.03, 0.03, 0.16, x, 3.0, 0.1, 0x9aa0aa, 8);                                                      // капсюль-детонатор сверху колонки
      M.b(0.02, 0.1, 0.02, x, 3.1, 0.12, 0x15161a);
    }
    M.b(5.0, 0.02, 0.02, 0, 3.2, 0.2, 0xd02a1a); M.b(5.0, 0.02, 0.02, 0, 3.25, 0.22, 0x2a4fd0); M.b(5.0, 0.02, 0.02, 0, 3.3, 0.24, 0xd8b020);   // жгут проводов к блоку
    M.b(1.3, 0.62, 0.3, 0, 3.58, 0.16, 0x1f2227); M.b(1.36, 0.05, 0.34, 0, 3.92, 0.16, 0x3a3d44); M.b(1.36, 0.05, 0.34, 0, 3.26, 0.16, 0x3a3d44);   // блок подрыва
    M.b(0.03, 0.55, 0.03, 0.55, 4.2, 0.16, 0x15161a);                                                       // антенна
    M.glow((q) => { q.b(0.1, 0.1, 0.04, -0.52, 3.38, 0.34, 0xff2a1a); q.b(0.1, 0.1, 0.04, 0.52, 3.38, 0.34, 0xff2a1a); q.b(0.06, 0.06, 0.06, 0.55, 4.5, 0.16, 0xff2a1a); });
    const grp = M.build({ cull: false });
    // цифровой таймер: обратный отсчёт до взрыва
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 80;
    const cx = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv);
    let last = '';
    grp.setTime = (txt, on) => {
      const key = txt + on; if (key === last) return; last = key;
      cx.fillStyle = '#100404'; cx.fillRect(0, 0, 256, 80);
      cx.fillStyle = on ? '#ff3020' : '#6a130c'; cx.font = 'bold 64px monospace'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(txt, 128, 44);
      tex.needsUpdate = true;
    };
    grp.setTime('00:08.0', true);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.3), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
    disp.position.set(0, 3.62, 0.32); grp.add(disp);
    grp.position.set(0, 0, -29.5); grp.visible = false;
    R.g.add(grp);
    return grp;
  }

  const restoreLoot = (it) => { it.taken = false; it.res = 0; it.grp.visible = true; if (it.sp) it.sp.visible = true; if (it.col) it.col.off = false; };
  const baseFog = (r) => r.q.fog * 0.12;
  const setFog = (r, k) => {                                                 // k: 0 — как в регионе, 1 — густая пыль
    const f = r.scene.fog; if (!f) return;
    f.density = lerp(baseFog(r), 0.055, k);
    f.color.setHex(k > 0.02 ? 0x6b6254 : 0x0a0c12);
  };

  // ------------------------------------------------------------------ щебень и плиты ворот (физика, остаются лежать)
  const clearRubble = (R) => { if (R.rubble) { if (R.rubble.off) R.rubble.off(); R.g.remove(R.rubble.g); R.rubble = null; } };
  function slabs(r, R, settle) {
    clearRubble(R);
    const grp = new THREE.Group(); R.g.add(grp);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mats = [0x2c2e33, 0x4a4d54, 0x66482a, 0x1c1d20, 0x7a7d84].map((c) => (r.mat ? r.mat(c) : new THREE.MeshLambertMaterial({ color: c })));
    const list = [], ceil = (r.bounds ? r.bounds.h : 7.5) - 0.2;
    const add = (sx, sy, sz, p, v) => {
      const m = new THREE.Mesh(geo, pick(mats));
      m.scale.set(sx, sy, sz); m.position.set(p[0], p[1], p[2]); m.rotation.set(rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28)); grp.add(m);
      list.push({ m, v: new THREE.Vector3(v[0], v[1], v[2]), w: new THREE.Vector3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9)), s: [sx, sy, sz], rest: false, h: Math.min(sx, sy, sz) * 0.5 });
    };
    for (let i = 0; i < 26; i += 1) {                                   // крупные плиты створок: большей частью в хранилище, часть — в галерею
      const x = rnd(-3.9, 3.9), y = rnd(0.3, 4.4), north = Math.random() < 0.78, sp = north ? rnd(5, 15) : rnd(2.5, 8);
      add(rnd(0.35, 1.5), rnd(0.25, 1.1), rnd(0.1, 0.3), [x, y, -30 + (north ? -0.4 : 0.4)], [x * 0.35 + rnd(-2, 2), rnd(1.5, 7) * (y < 1 ? 1.5 : 1), (north ? -1 : 1) * sp]);
    }
    for (let i = 0; i < 46; i += 1) {                                   // осколки и щебень
      const north = Math.random() < 0.6, sz = rnd(0.07, 0.28);
      add(sz * rnd(0.6, 1.8), sz * rnd(0.5, 1.3), sz * rnd(0.6, 1.8), [rnd(-3.8, 3.8), rnd(0.2, 4.4), -30 + (north ? -0.3 : 0.3)], [rnd(-5, 5), rnd(1, 9), (north ? -1 : 1) * rnd(3, 16)]);
    }
    const step = (dt) => {
      let alive = 0;
      list.forEach((q) => {
        if (q.rest) return;
        alive += 1;
        const m = q.m, p = m.position, v = q.v;
        v.y -= 9.8 * dt;
        const inside = r.blocked(p.x, p.z), nx = p.x + v.x * dt, nz = p.z + v.z * dt;
        if (!inside && r.blocked(nx, p.z)) v.x *= -0.35; else p.x = nx;
        if (!inside && r.blocked(p.x, nz)) v.z *= -0.35; else p.z = nz;
        p.y += v.y * dt;
        if (p.y > ceil) { p.y = ceil; v.y *= -0.3; }
        if (p.y < q.h) {
          p.y = q.h;
          if (Math.abs(v.y) < 1.4) {                                    // лёг: поворачиваем на ближайшую грань и садим на пол
            q.rest = true; v.set(0, 0, 0);
            const snap = (a) => Math.round(a / (PI / 2)), kx = snap(m.rotation.x), kz = snap(m.rotation.z), d3 = q.s.slice();
            m.rotation.x = kx * PI / 2; m.rotation.z = kz * PI / 2;
            if (Math.abs(kx) % 2 === 1) { const t = d3[1]; d3[1] = d3[2]; d3[2] = t; }
            if (Math.abs(kz) % 2 === 1) { const t = d3[0]; d3[0] = d3[1]; d3[1] = t; }
            p.y = d3[1] / 2;
          } else { v.y *= -0.34; v.x *= 0.58; v.z *= 0.58; q.w.multiplyScalar(0.55); }
        }
        if (!q.rest) { const k = Math.exp(-dt * 0.4); q.w.multiplyScalar(k); m.rotation.x += q.w.x * dt; m.rotation.y += q.w.y * dt; m.rotation.z += q.w.z * dt; }
      });
      return alive;
    };
    R.rubble = { g: grp, off: null };
    if (settle) { for (let i = 0; i < 260; i += 1) step(1 / 30); return; }
    R.rubble.off = K.hook(r, (dt) => { if (!(dt > 0) || r.paused) return; if (!step(Math.min(dt, 0.05)) && R.rubble && R.rubble.off) { const o = R.rubble.off; R.rubble.off = null; o(); } });
  }

  // ------------------------------------------------------------------ свет: после взрыва лампы гаснут, потом дёргаются и возвращаются
  function blackout(r, R, dur) {
    const L = r.lamps || [], base = L.map((l) => l.intensity), t0 = r.time;
    R.alarm = false;
    let off = null;
    const restore = () => { if (off) { off(); off = null; } L.forEach((l, i) => { l.intensity = base[i]; }); R.alarm = true; };
    off = K.hook(r, () => {
      const t = r.time - t0;
      let f = 1;
      if (t < 0.45) f = 0;
      else if (t < 1.9) f = (Math.sin(t * 53) + Math.sin(t * 29 + 1.7) > 0.4 ? 0.6 : 0.04) * (0.4 + (t - 0.45) / 1.45 * 0.6);
      else if (t < dur) f = 0.55 + 0.45 * smooth((t - 1.9) / (dur - 1.9));
      L.forEach((l, i) => { l.intensity = base[i] * f; });
      if (t >= dur) restore();
    });
    return restore;
  }

  // ------------------------------------------------------------------ взрыв ворот: три заряда в линию + вторичный, плиты, обломки потолка, пыль, темнота
  function gateBlast(r, R) {
    const z0 = -29.4;
    r.xfTint = true;
    R.gate.blow();                                                       // створки исчезают (коллайдер снят) — на их месте летят плиты
    slabs(r, R, false);
    r.explode(0, 1.6, z0, 15, 320, 'bomb');                              // основной заряд: урон, отброс, рэгдолл тел
    [[50, -3.1, 2.0, -29.9, 7], [90, 3.1, 2.0, -29.9, 7], [170, 0, 3.0, -33.6, 8.5], [300, -1.6, 1.3, -26.0, 6.5]].forEach((q) => {   // кумулятивный ряд: чуть позже по бокам, дальше — удар в тамбуре
      setTimeout(() => { if (!r.disposed && r.blastFx) r.blastFx(q[1], q[2], q[3], q[4], 'frag'); }, q[0]);
    });
    r.debrisBurst && r.debrisBurst({ x: 0, z: -30, w: 8, d: 1.4, h: 4.5, col: 0x6b6254 });
    [[250, 0, -35, 14, 7, 7.2], [450, -6, -24, 7, 7, 6.8], [600, 6, -24, 7, 7, 6.8], [900, 0, -17, 12, 8, 6.9]].forEach((q) => {  // с потолка сыплется штукатурка и пыль
      setTimeout(() => { if (!r.disposed && r.debrisBurst) r.debrisBurst({ x: q[1], z: q[2], w: q[3], d: q[4], h: q[5], col: 0x7a7468 }); }, q[0]);
    });
    K.amb.pulse(r, 'boom', 1); K.amb.pulse(r, 'rumble', 1);
    r.cineJolt && r.cineJolt(2.2);
    r.flash && r.flash(1.3).catch(() => {});
    return { restore: blackout(r, R, 3.6) };
  }

  // ================================================================== ЭТАЖ 2
  PH.vault = async function (r, ctx) {
    const W = ctx.W, st = K.st(r);
    const T = st.team || await K.makeTeam(r, { D: [-1.7, 27.2, PI], G: [1.7, 27.5, PI] });
    const from = ctx.from || '';                                            // тест: from = bomb | loot — сразу к сцене
    const d = T.d, g = T.g;
    K.lock(r);
    await r.clearEnemies();
    K.hall && K.hall.dispose(r);
    K.amb.set(r, 'none', { fade: 0.1 });
    W.enter('vault', 0, 21, 0);
    const R = W.R.vault;
    R.shutters.forEach((s) => s.reset()); R.gate.reset(); R.vdoor.reset(); R.alarm = false; R.loot.forEach(restoreLoot); clearRubble(R);
    if (from) R.shutters.forEach((s) => { s.set(1); s.open = true; });
    setFog(r, 0);
    r.xfTint = true;                                                       // взрывы миссии 48 — с настоящим оранжевым пламенем (explosions.js)
    r.noFight = true;
    K.cutFade(r, 1);
    st.suit = true;
    [d, g].forEach((n) => { if (!n.suitMeshes) F.suit(r, n); });
    const fov0 = r.baseFov;
    r.p.x = 0; r.p.z = 21; r.p.yaw = 0; r.p.pitch = 0; r.spawnPt = [0, 21, 0];
    const mus = r.musicTrack('osttdictor', { vol: 0.95 });

    // ---------------------------------------------------------- прибытие: вестибюль, красные мигалки, шторка A
    if (!from) {
    const p4 = K.pbody(r, 0, 26.6, PI); F.npcMinigun(r, p4);
    put(d, -1.7, 27.3, PI); put(g, 1.7, 27.6, PI);
    d.g.visible = g.g.visible = true;
    const shots = [
      sh({ at: [0.7, 1.15, 28.0], to: [0.3, 1.2, 26.9], look: [0, 2.0, 8], fov: 62, dur: 5.4, hand: 0.5, tense: 0.2,
        run: () => {
          R.alarm = true; K.amb.set(r, 'vault', { fade: 2.0 }); r.fade(0, 1.4);
          r.walk(p4, [0, 21.2], 1.2); r.walk(d, [-1.9, 22.6], 1.2); r.walk(g, [1.9, 23.0], 1.2);
        } }),
      sh({ at: [-5.4, 1.45, 10.0], to: [-5.0, 1.5, 9.2], look: [0, 3.1, 2.4], fov: 50, dur: 4.6, hand: 0.5, tense: 0.3,
        says: [[DIC, 'Level two. Vault and archive.', 3.0]] }),
      sh({ at: [-0.9, 1.64, 20.2], to: [-0.9, 1.64, 20.7], look: () => [d.g.position.x, 1.6, d.g.position.z], fov: 30, dur: 5.0, hand: 0.5, tense: 0.2,
        says: [[DIC, 'Security sealed every wing.', 2.6], [DIC, 'A shutter releases when its wing is clear.', 3.4], [DIC, 'So clear it.', 1.8]] }),
      C.cin.pov(r, 1.6, { extra: { cut: 'dip', whip: false, frame: 0 } })
    ];
    r.p.x = 0; r.p.z = 21; r.p.yaw = 0; r.p.pitch = 0;
    await r.cinematic(shots);
    r.fade(0, 0.4);
    F.rm(r, p4);
    put(d, -1.9, 23.6, PI); put(g, 1.9, 24.0, PI);
    r.sub && r.sub.classList.remove('on');
    K.unlock(r);
    }

    // ---------------------------------------------------------- бой: южное, центральное и северное крыло
    if (!from) await r.phase('vault', async () => {
      const V = vaultBegin(r, R, T);
      const ok = () => r.f48vault === V && !V.dead;
      await r.clearEnemies();
      R.shutters.forEach((s) => s.reset()); R.gate.reset(); R.vdoor.reset(); R.alarm = true;
      put(d, r.p.x - 1.9, r.p.z + 2.6, PI); put(g, r.p.x + 1.9, r.p.z + 3.0, PI);
      r.noFight = true;
      K.suitMode(r, true);
      K.suitFov(r, 102, 0.6);
      K.stress(r, 1, 5);
      mus.play(2.0, true);
      K.ally.follow(r, [d], { side: -1, back: 3.0 });
      K.ally.follow(r, [g], { side: 1, back: 3.6 });
      V.dir = true; V.fire = true;
      placePosts(V, 0);
      K.amb.pulse(r, 'alarm', 0.7);
      const NAMES = ['SOUTH WING', 'CENTRAL WING', 'NORTH WING'];
      let last = -1, seg = 0, lastOrder = -9, objLock = false;
      const orders = [
        [(v) => v.t > 3, 'Walk through them. Nothing in this building can hurt you.', 3.8],
        [(v) => v.kills[0] >= 10, 'South wing is breaking. Keep the pressure.', 3.2],
        [(v) => v.kills[1] >= 8, 'They are pulling guards from every floor.', 3.2],
        [(v) => v.kills[1] >= 24, 'Central wing is folding. Stay on them.', 3.0],
        [(v) => v.kills[2] >= 6, 'Last wing. The gate is right behind them.', 3.2],
        [(v) => v.kills[2] >= 28, 'Almost through. Do not let up.', 3.0]
      ];
      const done = orders.map(() => false);
      V.offs.push(K.hook(r, () => {
        if (!ok() || r.locked || r.cineDepth > 0) return;
        const n = V.kills[seg];
        if (!objLock && n !== last) { last = n; r.objective('CLEAR THE ' + NAMES[seg] + '   ' + Math.min(n, SEG[seg].need) + ' / ' + SEG[seg].need); }
        for (let i = 0; i < orders.length; i += 1) if (!done[i] && orders[i][0](V) && V.t - lastOrder > 5) { done[i] = true; lastOrder = V.t; K.say(r, orders[i][1], orders[i][2]); break; }
      }));
      for (let s = 0; s < 3; s += 1) {
        seg = s; last = -1;
        await r.until(() => !ok() || V.kills[s] >= SEG[s].need);
        if (!ok()) return;
        if (s < 2) {
          const S = R.shutters[s];
          V.dir = false;
          K.say(r, 'Wing is clear. Shutter ' + 'AB'[s] + ' is releasing.', 3.0);
          r.objective('SHUTTER ' + 'AB'[s] + ' IS OPENING');
          K.amb.pulse(r, 'clank', 1); r.snd && r.snd.play('vaultdoor');
          placePosts(V, s + 1);                                                // за шторкой уже ждут
          await slide(V, S, 2.8);
          if (!ok()) return;
          V.dir = true;
          r.objective('ADVANCE');
          await r.beacon(0, S.z - 4.0, 'SHUTTER ' + 'AB'[s], 3.0);
          if (!ok()) return;
        }
      }
      V.dir = false;
      objLock = true;                                                      // дальше цель ведём вручную (счётчик крыла больше не перекрывает её)
      // остаток охраны (часовые, застрявшие в комнатах): гоним на игрока, ведём к ближайшему; дольше 14 с не держим — остаток снимет сцена подрыва
      r.cb.enemies.forEach((e) => { if (!e.dead && e.tag === 'vguard') e.ai = null; });
      if (r.enemiesAlive() > 2) {
        r.objective('FINISH THE REMAINING GUARDS');
        r.waypoint && r.waypoint(() => {
          let b = null, bd = 1e9;
          r.cb.enemies.forEach((e) => { if (e.dead || e.friendly || e.t.passive) return; const q = Math.hypot(e.x - r.p.x, e.z - r.p.z); if (q < bd) { bd = q; b = e; } });
          return b ? b.n : [0, 1.4, -22.6];
        }, 'GUARD');
      }
      const tq = r.time;
      await r.until(() => !ok() || r.enemiesAlive() <= 2 || r.time - tq > 14);
      r.waypoint && r.waypoint(null);
      if (!ok()) return;
      K.say(r, 'The gate is sealed. We blow it.', 3.0);
      r.objective('REACH THE BLAST GATE');
      await r.beacon(0, -22.6, 'BLAST GATE', 3.0);
    }, { pos: [0, -22.6, 0], weapons: ['minigun'], set: () => { R.shutters.forEach((s) => s.set(1)); } });

    if (from !== 'loot') {
    // ---------------------------------------------------------- подрыв ворот: катсцена
    // таймлайн (игровые секунды от старта): 0 Диктор идёт к воротам · 4.6 заряд на плите · 5.2 «все назад» · 8.4 охрана из крыльев · 12.4 ВЗРЫВ (замедление) · 14.4 пыль оседает · 21 дверь хранилища
    K.lock(r);
    K.stress(r, 0.3, 1.2);
    vaultEnd(r);
    r.waypoint && r.waypoint(null);
    r.banner(null);
    await r.clearEnemies();
    clearRubble(R);
    const bomb = mkBomb(R);
    r.p.x = 0; r.p.z = -21.6; r.p.yaw = 0; r.p.pitch = 0;
    const pb = K.pbody(r, 0, -21.6, PI); F.npcMinigun(r, pb);
    put(d, -2.0, -20.8, PI); put(g, 2.0, -20.4, PI);
    const V2 = vaultBegin(r, R, T);                                         // союзники стреляют и в катсцене
    V2.dir = false;
    const run = { abort: false, fast: false, det: false, restore: null, armedAt: 0 }, boys = [];
    const blink = K.hook(r, () => {
      if (!bomb.visible) return;
      if (bomb.glowMesh) bomb.glowMesh.visible = Math.floor(r.time * (run.fast ? 7 : 2.5)) % 2 === 0;
      const left = Math.max(0, 7.8 - (r.time - run.armedAt)), sec = Math.floor(left), cs = Math.floor((left - sec) * 10);
      bomb.setTime('00:0' + sec + '.' + cs, left > 0);
    });
    const beeps = async () => {
      let iv = 1.0;
      while (!run.det && !run.abort) {
        r.snd && r.snd.play('c4beep');
        await r.wait(iv); iv = Math.max(0.16, iv * 0.88);
      }
    };
    const detonate = () => {
      if (run.det || run.abort) return;
      run.det = true;
      bomb.visible = false;
      run.restore = gateBlast(r, R).restore;
      r.tween(0.4, (k) => setFog(r, k));                                    // пыль повисает в воздухе
      r.timeScale = 0.2;                                                    // кадр взрыва — в замедлении
      r.wait(0.3).then(() => r.tween(0.55, (k) => { if (!run.abort) r.timeScale = lerp(0.2, 1, smooth(k)); })).then(() => { if (!run.abort) r.timeScale = 1; });
    };
    const script = async () => {
      const w = async (sec) => { await r.wait(sec); return !run.abort; };
      K.say(r, 'Blast doors. Forty centimetres of steel.', 3.2);
      r.walk(d, [-2.9, -28.3], 1.9);
      if (!(await w(4.6))) return;
      bomb.visible = true; run.armedAt = r.time; beeps();
      if (!(await w(0.6))) return;
      K.say(r, 'Charge is set. Everybody back!', 2.4);
      run.fast = true;
      r.walk(g, [3.0, -13.2], 3.0); r.walk(pb, [0, -13.8], 3.0); r.walk(d, [-3.0, -12.8], 4.2);
      if (!(await w(3.2))) return;
      K.amb.pulse(r, 'alarm', 0.8);
      for (let i = 0; i < 10; i += 1) {                                     // десять охранников выбегают из обоих крыльев к воротам
        const sd = i % 2 ? 1 : -1, x = sd * rnd(15.5, 18.5), z = -24.6 + rnd(-1.8, 1.8);
        const e = r.enemy(i % 5 === 4 ? 'heavy' : 'rusher', x, z, { drop: false, exact: true, yaw: sd < 0 ? -PI / 2 : PI / 2, hp: 5 });
        e.tag = 'vguard'; boys.push(e);
        e.n.armT = 0.6;
        (async () => {
          await r.wait(rnd(0, 0.5)); if (run.abort) return;
          await r.walk(e.n, [sd * 9.4, -24.6 + rnd(-0.8, 0.8)], 3.7); if (run.abort) return;
          await r.walk(e.n, [rnd(-1.8, 1.8), -26.4 + rnd(-0.6, 0.6)], 3.9);
        })();
      }
      K.amb.pulse(r, 'shout', 0.9);
      if (!(await w(4.0))) return;
      detonate();                                                           // 12.4 — взрыв (если кадр D не успел вызвать)
      if (!(await w(1.4))) return;
      r.walk(d, [-1.0, -34.6], 3.8); r.walk(g, [2.6, -31.8], 3.4); r.walk(pb, [0, -30.6], 3.2);
      if (!(await w(0.6))) return;
      r.tween(2.2, (k) => { if (!run.abort) setFog(r, 1 - k); }, smooth);   // через 2 с после взрыва пыль оседает
      if (!(await w(6.6))) return;
      r.snd && r.snd.play('vaultdoor');
      K.say(r, 'Vault is open. Two minutes. Take everything.', 3.4);
      await R.vdoor.run(r, 4.2);
    };
    r.p.x = 0; r.p.z = -30.6; r.p.yaw = 0; r.p.pitch = 0;                  // конечная точка игрока — до сборки pov-кадра
    const bShots = [
      sh({ at: [3.6, 1.5, -11.5], to: [3.0, 1.55, -12.7], look: [-0.5, 1.9, -29.0], fov: 50, dur: 4.4, hand: 0.5, tense: 0.2, run: () => { r.fade(0, 0.3); script(); } }),
      sh({ at: [3.9, 1.45, -25.3], to: [3.3, 1.5, -25.8], look: [-0.3, 1.9, -29.5], fov: 42, dur: 3.2, hand: 0.4, tense: 0.5 }),
      sh({ at: [0.5, 1.3, -9.0], to: [0.3, 1.35, -9.6], look: () => [d.g.position.x, 1.4, d.g.position.z], fov: 48, dur: 3.2, hand: 0.6, tense: 0.8 }),
      sh({ at: [0, 1.55, -9.2], to: [0, 1.6, -9.8], look: [0, 2.0, -27.5], fov: 46, dur: 5.8, hand: 0.5, tense: 0.7, jolt: [1.6, 1.5] }),
      sh({ at: [-5.2, 0.85, -17.0], to: [-4.6, 0.95, -19.5], look: [0.5, 2.0, -30.5], fov: 54, dur: 4.0, hand: 0.5, tense: 0.4 }),
      sh({ at: [-7.8, 1.4, -33.0], to: [-7.0, 1.45, -33.6], look: [0, 2.4, -38.0], fov: 52, dur: 6.6, hand: 0.5, tense: 0.3 }),
      C.cin.pov(r, 1.6, { extra: { cut: 'dip', whip: false, frame: 0 } })
    ];
    await r.cinematic(bShots);
    run.abort = true; blink();
    r.timeScale = 1;
    // итог сцены (в том числе после пропуска катсцены)
    await r.clearEnemies();
    bomb.visible = false; R.gate.blow(); R.vdoor.set(1); R.vdoor.open = true; setFog(r, 0);
    if (run.restore) run.restore(); else R.alarm = true;
    if (!R.rubble) slabs(r, R, true);
    F.rm(r, pb);
    r.p.x = 0; r.p.z = -30.6; r.p.yaw = 0; r.p.pitch = 0;
    put(d, -2.2, -34.0, PI); put(g, 2.2, -33.4, PI);
    r.sub && r.sub.classList.remove('on');
    vaultEnd(r);
    K.unlock(r);
    }
    if (from === 'loot') { r.fade(0, 0.3); K.unlock(r); R.gate.blow(); R.vdoor.set(1); R.vdoor.open = true; setFog(r, 0); slabs(r, R, true); r.p.x = 0; r.p.z = -30.6; r.p.yaw = 0; put(d, -2.2, -34.0, PI); put(g, 2.2, -33.4, PI); }

    // ---------------------------------------------------------- ограбление: две минуты на золото и компромат (музыка — тот же osttdictor, трека 47-й миссии здесь нет)
    await r.phase('loot', async () => {
      const V = vaultBegin(r, R, T);
      const ok = () => r.f48vault === V && !V.dead;
      await r.clearEnemies();
      R.loot.forEach(restoreLoot);
      R.alarm = true; V.dir = false; V.trick = true; V.trickT = 7; V.fire = true;
      put(d, r.p.x - 1.6, r.p.z - 2.0, PI); put(g, 0, -35.4, 0);
      K.suitMode(r, true, { moveMul: 0.78 });
      K.stress(r, 0.6, 2);
      mus.play(1.5);                                                        // продолжает играть с боя; при перезапуске с чекпойнта (from=loot) стартует заново
      K.ally.follow(r, [d], { side: -1, back: 2.2 });
      K.ally.hold(r, g, 0, -35.4, 0);                                       // девушка прикрывает вход в хранилище
      let n = 0;
      const total = R.loot.length;
      const upd = () => r.objective('LOOT   ' + n + ' / ' + total);
      upd();
      r.hint('PRESS  E  AT EVERY PALLET, CASE AND LEDGER', 5);
      const clock = r.countdown(120, 'VAULT LOCKDOWN IN', { onExpire: () => { K.say(r, 'Lockdown! We are out of time!', 2.0); r.fail('VAULT LOCKDOWN'); } });
      // забрать предмет: игрок (E) и союзники делают это одинаково — общий счётчик
      const take = (it, ally) => {
        if (it.taken || !ok()) return false;
        it.taken = true; it.res = 0; it.grp.visible = false; if (it.sp) it.sp.visible = false; if (it.col) it.col.off = true;
        n += 1; upd();
        if (r.snd) { const o = ally ? { k: 0.65 } : undefined; r.snd.play('goldpickup', o); if (it.kind === 'gold') r.snd.play('cashbag', Object.assign({ delay: 0.3 }, o || {})); }
        const what = it.kind === 'gold' ? 'GOLD' : it.label.replace('TAKE ', '');
        r.toast(ally ? 'TEAM TOOK  ' + what + '  —  ' + n + ' / ' + total : (it.kind === 'gold' ? 'GOLD  —  ' + n + ' / ' + total : what + '  —  SECURED'), 1.6);
        return true;
      };
      R.loot.forEach((it) => {
        r.interact({ pos: [it.x, it.y, it.z], label: it.label, reach: 2.6, enabled: () => !it.taken && ok(), use: () => { take(it, null); } });
      });
      // союзники тоже грабят: идут по навигации к ближайшему свободному предмету (не рядом с игроком), берут, возвращаются к своей роли
      const looter = async (a, quota, t0) => {
        await r.wait(t0);
        let mine = 0;
        while (ok() && mine < quota && n < total) {
          const ap = a.g.position;
          const c = R.loot.filter((it) => !it.taken && !it.res && Math.hypot(it.x - r.p.x, it.z - r.p.z) > 3.4)
            .sort((p, q) => Math.hypot(p.x - ap.x, p.z - ap.z) - Math.hypot(q.x - ap.x, q.z - ap.z))[0];
          if (!c) { await r.wait(2.0); continue; }
          c.res = 1;
          const pt = K.ally.nearFree(r, c.x, c.z, undefined, 2.6);
          if (pt) await K.ally.goto(r, a, pt, 2.6);
          if (!ok()) return;
          a.yaw = Math.atan2(c.x - ap.x, c.z - ap.z); a.g.rotation.y = a.yaw;
          c.res = 0;
          if (take(c, a)) mine += 1;
          await r.wait(rnd(2.5, 5));
        }
      };
      looter(d, 4, 9); looter(g, 3, 15);
      const said = { a: false, b: false, c: false };
      V.offs.push(K.hook(r, () => {
        if (!ok() || r.locked || r.cineDepth > 0) return;
        if (!said.a && n >= 3) { said.a = true; K.say(r, 'Keep moving. Every bar counts.', 2.6); }
        if (!said.b && clock.left < 60 && n < total) { said.b = true; K.say(r, 'One minute!', 1.8); }
        if (!said.c && clock.left < 25 && n < total) { said.c = true; K.say(r, 'Twenty seconds. Grab what you can reach!', 2.4); }
      }));
      await r.until(() => !ok() || n >= total);
      clock.stop();
      mus.stop(3.0);
      if (!ok()) return;
      r.banner(null);
      V.trick = false;
      r.objective('GET OUT OF THE VAULT');
      K.say(r, 'That is all of it. Now go!', 2.4);
    }, { pos: [0, -34.4, 0], weapons: ['minigun'], set: () => { R.gate.blow(); R.vdoor.set(1); R.vdoor.open = true; setFog(r, 0); if (!R.rubble) slabs(r, R, true); R.loot.forEach((it) => { it.taken = true; it.grp.visible = false; if (it.sp) it.sp.visible = false; if (it.col) it.col.off = true; }); } });
    K.stress(r, 0.5, 1);
    r.baseFov = fov0 === r.baseFov ? fov0 : r.baseFov;
    st.vaultDone = true;
  };

  // ================================================================== ГАЗ: этаж 2 заполняется ядом с севера; вся галерея с охраной — до лестницы вниз
  const GAS0 = -43.0;                                                      // стартовая линия фронта (внутри хранилища)
  const STAIRS = [0, 26.2];
  // облако: спрайты двумя слоями вдоль линии фронта (стена газа, которая движется на юг); G.front — z фронта
  function mkGas(r, R) {
    const g = new THREE.Group(); R.g.add(g);
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const cx = cv.getContext('2d'), gr = cx.createRadialGradient(64, 64, 2, 64, 64, 63);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 26; i += 1) { cx.fillStyle = 'rgba(255,255,255,' + rnd(0.05, 0.14).toFixed(2) + ')'; cx.beginPath(); cx.arc(rnd(18, 110), rnd(18, 110), rnd(5, 16), 0, 6.283); cx.fill(); }
    const tex = new THREE.CanvasTexture(cv), list = [], cols = [0x7aa82e, 0x93c03c, 0x5f8a22, 0x4a6a1a, 0x9ac848, 0x33440f, 0x6a9a2a];
    [[0, 0.3], [-3.2, 0.3], [-6.6, 0.32], [-10.5, 0.4]].forEach((L) => {
      for (let row = 0; row < 3; row += 1) {
        for (let i = 0; i < 14; i += 1) {
          const m = new THREE.SpriteMaterial({ map: tex, color: pick(cols), transparent: true, opacity: L[1], depthWrite: false, fog: false, rotation: rnd(0, 6.3) });
          const sp = new THREE.Sprite(m), sc = rnd(5, 9.5);
          sp.scale.set(sc, sc * rnd(0.7, 1.0), 1); sp.renderOrder = 6; g.add(sp);
          list.push({ sp, m, rs: rnd(-0.12, 0.12), x: -34 + i * 5.2 + rnd(-2.2, 2.2), y: 0.9 + row * 1.7 + rnd(-0.4, 0.4), dz: L[0] + rnd(-2, 2), ph: rnd(0, 6.3), op: L[1] });
        }
      }
    });
    return { g, list, tex, front: GAS0, time: 0 };
  }
  function gasStep(G, r, dt) {
    G.time += dt;
    const cam = r.camera.position;
    G.list.forEach((q) => {
      const p = q.sp.position;
      p.set(q.x + Math.sin(G.time * 0.5 + q.ph) * 1.2, q.y + Math.sin(G.time * 0.8 + q.ph * 2) * 0.3, G.front + q.dz + Math.sin(G.time * 0.6 + q.ph) * 0.9);
      q.m.rotation += q.rs * dt;
      q.m.opacity = q.op * clamp((Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z) - 1.2) / 5, 0, 1);
    });
  }
  function gasDispose(r, R, G, ov) {
    if (G) { R.g.remove(G.g); G.list.forEach((q) => q.m.dispose()); G.tex.dispose(); }
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    setFog(r, 0);
  }
  // туман и зелёная виньетка: чем ближе фронт, тем гуще; внутри газа — почти слепота
  function gasFx(r, ov, gap) {
    const k = clamp(1 - gap / 16, 0, 1), inside = gap < 0 ? clamp(-gap / 2, 0, 1) : 0, f = r.scene.fog;
    if (f) { f.color.setRGB(lerp(0.04, 0.17, k), lerp(0.05, 0.23, k), lerp(0.07, 0.04, k)); f.density = lerp(baseFog(r), 0.085, Math.max(k * k * 0.6, inside)); }
    if (ov) ov.style.opacity = String((0.2 * k + 0.7 * inside).toFixed(2));
  }

  PH.gas = async function (r, ctx) {
    const W = ctx.W, st = K.st(r);
    const T = st.team || await K.makeTeam(r, { D: [-2.2, -34.0, PI], G: [2.2, -33.4, PI] });
    const d = T.d, g = T.g;
    K.lock(r);
    await r.clearEnemies();
    K.hall && K.hall.dispose(r);
    if (W.cur !== W.R.vault) {                                              // прямой запуск ?m48=gas: готовим вскрытое хранилище сами
      W.enter('vault', 0, -34.4, 0);
      const R1 = W.R.vault;
      R1.shutters.forEach((s2) => { s2.set(1); s2.open = true; });
      R1.gate.blow(); R1.vdoor.set(1); R1.vdoor.open = true; slabs(r, R1, true);
      R1.loot.forEach((it) => { it.taken = true; it.grp.visible = false; if (it.sp) it.sp.visible = false; if (it.col) it.col.off = true; });
      [d, g].forEach((n) => { if (!n.suitMeshes) F.suit(r, n); });
      d.g.visible = g.g.visible = true;
    }
    const R = W.R.vault;
    K.css();
    r.xfTint = true; r.noFight = true; st.suit = true;
    setFog(r, 0);
    K.amb.set(r, 'vault', { fade: 0.5 });
    R.alarm = true;
    r.p.x = 0; r.p.z = -34.4; r.p.yaw = 0; r.p.pitch = 0; r.spawnPt = [0, -34.4, 0];
    put(d, -1.9, -35.6, 0); put(g, 1.9, -35.2, 0);
    const fov0 = r.baseFov;
    const G = mkGas(r, R);
    const ov = document.createElement('div'); ov.className = 'f48-gas'; (r.layer || document.body).appendChild(ov);
    const offG = K.hook(r, (dt) => { if (dt > 0 && !r.paused) gasStep(G, r, Math.min(dt, 0.05)); });

    // ---------------------------------------------------------- катсцена: система объявляет выброс, газ идёт из вентиляции хранилища
    const shots = [
      sh({ at: [0, 1.5, -31.4], to: [0, 1.55, -32.6], look: [0, 3.9, -44.5], fov: 60, dur: 4.6, hand: 0.6, tense: 0.6, jolt: [0.4, 0.8],
        run: () => {
          r.fade(0, 0.5);
          K.amb.pulse(r, 'alarm', 1); K.amb.pulse(r, 'rumble', 0.8);
          r.say('FACILITY SYSTEM', 'Warning. Lethal gas release on level two. All personnel evacuate.', 4.2);
        },
        tick: () => { G.front = Math.min(GAS0 + 1.8, G.front + 0.012); } }),
      sh({ at: [-1.2, 1.66, -33.7], to: [-1.45, 1.66, -34.2], look: () => [d.g.position.x, 1.62, d.g.position.z], fov: 28, dur: 5.2, hand: 0.5, tense: 0.5,
        says: [[DIC, 'Gas! They are venting the whole floor!', 2.6], [DIC, 'South. The stairs. Run!', 2.4]] }),
      C.cin.pov(r, 1.4, { extra: { cut: 'dip', whip: false, frame: 0 } })
    ];
    await r.cinematic(shots);
    r.fade(0, 0.3);
    r.sub && r.sub.classList.remove('on');
    K.unlock(r);

    // ---------------------------------------------------------- бег: фронт газа идёт по этажу, охрана выходит из комнат со всех сторон
    await r.phase('gas', async () => {
      const V = vaultBegin(r, R, T);
      const ok = () => r.f48vault === V && !V.dead;
      await r.clearEnemies();
      G.front = GAS0; G.t = 0;
      R.alarm = true; V.dir = false; V.trick = false; V.fire = true;
      put(d, -1.9, -35.6, PI); put(g, 1.9, -35.2, PI);
      r.p.x = 0; r.p.z = -34.4; r.p.yaw = 0; r.p.pitch = 0;
      K.suitMode(r, true, { moveMul: 0.95 });
      K.stress(r, 0.9, 2);
      K.ally.follow(r, [d], { side: -1, back: 2.4 });
      K.ally.follow(r, [g], { side: 1, back: 3.0 });
      r.objective('ESCAPE TO LEVEL 1');
      r.hint('THE GAS ADVANCES  —  KEEP MOVING SOUTH TO THE STAIRS', 5);
      let dmgT = 0, waveT = 0.8, hissT = 0;
      const said = { a: false, b: false, c: false, d: false };
      const spawnWave = () => {
        const p = r.p, alive = r.enemiesAlive();
        if (alive >= V.cap) return;
        const ahead = R.rooms.filter((rm) => rm.cz > G.front + 6 && rm.cz > p.z - 3);
        const side = R.rooms.filter((rm) => rm.cz > G.front + 6);
        const n = 1 + (Math.random() < 0.55 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0);
        const pool = ahead.length && Math.random() < 0.75 ? ahead : side;
        if (!pool.length) return;
        for (let i = 0; i < n && r.enemiesAlive() < V.cap; i += 1) spawnV(V, 2, pool, 1.5);
      };
      V.offs.push(K.hook(r, (dt) => {
        if (!ok() || r.paused || !(dt > 0)) return;
        dt = Math.min(dt, 0.05);
        if (r.locked || r.cineDepth > 0) return;
        G.t += dt;
        const p = r.p, gap = p.z - G.front;
        // скорость фронта растёт; если игрок далеко — газ чуть тише, если вплотную — не добивает сразу
        let v = 1.75 + 0.02 * G.t;
        if (gap > 26) v *= 0.55; else if (gap < 5) v *= 0.8;
        G.front += v * dt;
        gasFx(r, ov, gap);
        // гибель охраны в газе: кашляют, роняют оружие, падают
        r.cb.enemies.forEach((e) => {
          if (e.dead || e.t.passive || e.friendly) return;
          if (e.z < G.front - 0.5) { e.gT = (e.gT || 0) + dt; e.n.armT = 0; if (!e.gD) e.gD = rnd(0.6, 1.9); if (e.gT > e.gD) r.killEnemy(e, false); } else e.gT = 0;
        });
        // союзники не должны гулять в газе
        [d, g].forEach((n) => { const q = n.g.position; if (q.z < G.front - 1.2) { const c = K.ally.nearFree(r, q.x, G.front + 5, undefined, 4); if (c) { q.x = c[0]; q.z = c[1]; K.ally.stop(n); } } });
        // урон игроку: запас в полтора метра у кромки, дальше — тик каждые 0.3 с
        if (gap < -1.2 && !r.dead) { dmgT -= dt; if (dmgT <= 0) { dmgT = 0.3; if (r.hp <= 9) { r.hp = 0; r.die('LETHAL GAS'); } else { r.hurt(9 / (r.armorK || 1)); r.kick(0.01, 0.02, 0.03, 0.01); } /* газ обходит броню костюма */ } } else dmgT = 0;
        hissT -= dt; if (hissT <= 0 && gap < 22) { hissT = 2.6; K.amb.pulse(r, 'rumble', 0.35); }
        waveT -= dt; if (waveT <= 0) { waveT = rnd(1.0, 2.0); spawnWave(); }
        if (!said.a && G.t > 3) { said.a = true; K.say(r, 'It is moving. Stay ahead of it!', 2.6); }
        if (!said.b && gap < 7 && G.t > 6) { said.b = true; K.say(r, 'Gas is right behind us! Keep running!', 2.6); }
        if (!said.c && p.z > -8) { said.c = true; K.say(r, 'Cut through them. Do not stop to fight.', 2.8); }
        if (!said.d && p.z > 12) { said.d = true; K.say(r, 'The stairs! Straight ahead!', 2.2); }
      }));
      await r.beacon(STAIRS[0], STAIRS[1], 'STAIRS DOWN', 2.4);
      if (!ok()) return;
    }, { pos: [0, -34.4, 0], weapons: ['minigun'], set: () => { G.front = GAS0; gasFx(r, ov, 40); } });

    // ---------------------------------------------------------- выход на лестницу: чёрный экран, этаж снимаем
    K.lock(r);
    K.stress(r, 0.4, 1);
    offG();
    vaultEnd(r);
    await r.fade(1, 1.0);
    await r.clearEnemies();
    gasDispose(r, R, G, ov);
    r.waypoint && r.waypoint(null);
    r.baseFov = fov0;
    st.gasDone = true;
    K.unlock(r);
  };
}());
