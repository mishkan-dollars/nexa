// NEXA: движок миссий 17–46 (данные — missions4data.js). Миссия = цепочка секторов вдоль оси -Z; у каждого сектора свой «бит»:
// fight | hack | hold | stealth | blast | plant | snipe | rescue | collect | run | boss. Сектор — это r.phase() с чекпоинтом и «пропуском сектора».
// Мир строится один раз в build() (стены, укрытия, терминалы, бочки); враги, подборы, интерактив создаются внутри фазы и чистятся при смерти.
// Window.Missions.define(def) регистрирует MISSIONS[id], CINEMA[id] и Missions.META[id] (название/описание/лог для NEXA/OS).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.M2 || !C.cin || !C.WEAPONS || !C.Run.prototype.stealth) return;
  const { Run, MISSIONS, CINEMA } = C;
  const { CAP, DONE, rnd, clamp } = C.M2;
  const { pov, back, crane, reveal: revealShots, bossIntro } = C.cin;
  const PI = Math.PI;
  const HND = 'HANDLER';
  const TYPE = { g: 'grunt', r: 'rusher', h: 'heavy', b: 'boss' };
  const AMMO = { glock: 30, ak: 60, shotgun: 12, sniper: 10 };
  const DEPTH = { fight: 28, hack: 24, hold: 26, stealth: 32, blast: 22, plant: 28, snipe: 58, rescue: 28, collect: 28, run: 42, boss: 34 };

  const THEMES = {
    day:     { amb: 1.0,  fogK: 0.45, fog: 0x939393, wall: 0xa2a2a2, floor: 0x7e7e7e, h: 5.2, W: 28, open: 1, cover: 'crates' },
    alley:   { amb: 0.6,  fogK: 0.75, fog: 0x1b1b1b, wall: 0x585858, floor: 0x3e3e3e, h: 5.0, W: 18, open: 1, cover: 'crates' },
    yard:    { amb: 0.85, fogK: 0.6,  fog: 0x5a5a5a, wall: 0x6a6a6a, floor: 0x555555, h: 5.5, W: 32, open: 1, cover: 'crates' },
    dock:    { amb: 0.8,  fogK: 0.55, fog: 0x4a4a4a, wall: 0x777777, floor: 0x4e4e4e, h: 5.5, W: 30, open: 1, cover: 'crates' },
    roof:    { amb: 0.9,  fogK: 0.38, fog: 0x6e6e6e, wall: 0x8a8a8a, floor: 0x666666, h: 4.6, W: 30, open: 1, cover: 'crates' },
    bridge:  { amb: 0.85, fogK: 0.5,  fog: 0x555555, wall: 0x777777, floor: 0x5c5c5c, h: 5.0, W: 14, open: 1, cover: 'cars' },
    garage:  { amb: 0.7,  fogK: 0.8,  fog: 0x222222, wall: 0x7a7a7a, floor: 0x505050, h: 3.6, W: 30, cover: 'cars' },
    office:  { amb: 0.85, fogK: 0.8,  fog: 0x2a2a2a, wall: 0xaaaaaa, floor: 0x6e6e6e, h: 3.4, W: 26, cover: 'tables' },
    lab:     { amb: 0.9,  fogK: 0.7,  fog: 0x303030, wall: 0xb4b4b4, floor: 0x808080, h: 3.8, W: 24, cover: 'racks' },
    sewer:   { amb: 0.5,  fogK: 1.0,  fog: 0x151515, wall: 0x4a4a4a, floor: 0x333333, h: 3.4, W: 16, cover: 'pillars' },
    metro:   { amb: 0.7,  fogK: 0.9,  fog: 0x1e1e1e, wall: 0x6a6a6a, floor: 0x484848, h: 4.0, W: 20, cover: 'pillars' },
    bunker:  { amb: 0.7,  fogK: 0.9,  fog: 0x202020, wall: 0x646464, floor: 0x444444, h: 3.6, W: 22, cover: 'walls' },
    mansion: { amb: 0.75, fogK: 0.8,  fog: 0x1a1a1a, wall: 0x8e8e8e, floor: 0x5a5a5a, h: 3.8, W: 24, cover: 'tables' },
    vault:   { amb: 0.8,  fogK: 0.8,  fog: 0x262626, wall: 0x8a8a8a, floor: 0x5a5a5a, h: 3.8, W: 22, cover: 'pillars' }
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const has = (r, id) => !!(r.inv && r.inv.some((w) => w.id === id));

  // ------------------------------------------------------------ строительство мира
  const COVER = [0x585858, 0x646464, 0x707070, 0x7c7c7c];
  function clearOf(placed, x, z, w, d, gap) {
    return !placed.some((p) => Math.abs(p[0] - x) < p[2] / 2 + w / 2 + gap && Math.abs(p[1] - z) < p[3] / 2 + d / 2 + gap);
  }
  function placeCover(r, M, sec, placed) {
    const rng = M.rng, W = M.W, R = (a, b) => a + rng() * (b - a);
    const style = sec.cover || (sec.b === 'stealth' ? 'pillars' : M.T.cover);
    if (style === 'none') return;
    const x0 = -W / 2 + 2, x1 = W / 2 - 2, z0 = sec.zB + 4.6, z1 = sec.zA - 4.6;
    if (z1 - z0 < 6) return;
    const dens = sec.dens === undefined ? 1 : sec.dens;
    const spawn = sec.k === 0 ? [[0, 1.5, 0.6, 0.6]] : null; // точка появления игрока: длинное укрытие (стеллаж до 6 м) не должно запирать её
    const n = Math.max(2, Math.min(16, Math.round((x1 - x0) * (z1 - z0) / 70 * dens)));
    for (let i = 0, tries = 0; i < n && tries < 140; tries += 1) {
      let x = R(x0, x1);
      const z = R(z0, z1), col = COVER[(rng() * 4) | 0];
      let w = 1.3, d = 1.3, h = 3, kind = 'box';
      if (style === 'pillars') kind = 'pillar';
      else if (style === 'crates') { if (rng() < 0.55) { w = R(1.6, 2.8); d = R(1.2, 2.0); h = 2.2; } else { w = R(1.2, 2.6); d = R(1.0, 1.8); h = 1.0; } }
      else if (style === 'walls') { const len = R(3.4, 5.2); if (rng() < 0.7) { w = len; d = 0.5; } else { w = 0.5; d = len; } h = 2.6; }
      else if (style === 'cars') { if (rng() < 0.5) { w = 4.2; d = 1.9; } else { w = 1.9; d = 4.2; } h = 1.7; }
      else if (style === 'tables') { if (rng() < 0.5) { w = 2.6; d = 1.2; h = 0.9; } else { w = 0.25; d = 2.6; h = 2.2; } }
      else if (style === 'racks') { w = 1.3; d = R(4, 6); h = 2.6; }
      const lim = Math.max(0, W / 2 - 1.7 - w / 2); // между укрытием и боковой стеной остаётся проход ≥ 1.7 м (не узкая щель)
      x = Math.max(-lim, Math.min(lim, x));
      if (!clearOf(placed, x, z, w, d, 1.7) || (spawn && !clearOf(spawn, x, z, w, d, 1.6))) continue;
      if (kind === 'pillar') r.pillar(x, z, w, d, col); else r.box(x, h / 2, z, w, h, d, col, true);
      placed.push([x, z, w, d]); i += 1;
    }
  }
  function spot(r, M, sec, placed, gap, zr) {
    const W = M.W, rng = M.rng;
    for (let t = 0; t < 40; t += 1) {
      const x = (rng() * 2 - 1) * (W / 2 - 2.6), z = zr ? zr[0] + rng() * (zr[1] - zr[0]) : sec.zB + 5 + rng() * (sec.D - 10);
      if (clearOf(placed, x, z, 0.8, 0.8, gap) && !r.blockedE(x, z) && !(r.inRoom && r.inRoom(x, z))) return [x, z];
    }
    return [0, sec.cz];
  }
  const termProp = (r, x, z, face) => {
    const ax = face[0] === 'x', sg = face[1] === '-' ? -1 : 1;
    r.box(x, 0.5, z, ax ? 0.7 : 1, 1, ax ? 1 : 0.7, 0x333333, true);
    r.termDress && r.termDress(x, z, ax, sg); // props3d: консоль-модель на стойке
    return r.strip(x + (ax ? sg * 0.36 : 0), 0.95, z + (ax ? 0 : sg * 0.36), ax ? 0.04 : 0.7, 0.35, ax ? 0.7 : 0.04, 0x555555);
  };

  function buildWorld(r, def) {
    const T = THEMES[def.theme] || THEMES.office, W = def.W || T.W, H = T.h;
    const secs = []; let z = 4;
    def.secs.forEach((s, k) => {
      const d = s.d || DEPTH[s.b] || 28;
      secs.push(Object.assign({}, s, { k, zA: z, zB: z - d, D: d, W, H, cz: z - d / 2, last: k === def.secs.length - 1 }));
      z -= d;
    });
    const zEnd = z, total = 4 - zEnd, cz = (4 + zEnd) / 2;
    const M = r.mm = { def, T, W, H, secs, rng: mulberry32(def.id * 7919 + 13), zEnd, S: null, lampPos: [], att: 0, hp: def.hp || 1, cur: null, alarmed: false };
    r.combat();
    r.mood(T.amb, T.fogK, T.fog);
    r.box(0, -0.05, cz, W + 1, 0.1, total + 1, T.floor, false);
    if (!T.open) r.box(0, H + 0.05, cz, W + 1, 0.1, total + 1, 0x3a3a3a, false);
    r.box(0, H / 2, 4.15, W + 0.6, H, 0.3, T.wall, true);
    r.box(0, H / 2, zEnd - 0.15, W + 0.6, H, 0.3, T.wall, true);
    r.box(-W / 2 - 0.15, H / 2, cz, 0.3, H, total, T.wall, true);
    r.box(W / 2 + 0.15, H / 2, cz, 0.3, H, total, T.wall, true);
    r.bound(0, cz, W, total, H);
    (def.kit || ['glock']).forEach((id) => r.giveWeapon(id));

    secs.forEach((sec) => {
      const placed = [];
      // перегородка с дверью / ломаемой стеной
      if (!sec.last) {
        if (sec.b === 'blast' || sec.b === 'plant') {
          r.wallH(sec.zB, -W / 2, W / 2, H, T.wall, [[-2.8, 2.8]]);
          sec.brk = r.breakable(0, sec.zB, 5.6, 0.5, 2.6, 0x4a4a4a);
        } else {
          r.wallH(sec.zB, -W / 2, W / 2, H, T.wall, [[-2.2, 2.2]]);
          sec.door = r.door(0, sec.zB, 4.4, 2.6);
        }
      } else r.strip(0, 1.5, zEnd + 0.05, 4.6, 2.8, 0.05, 0xffffff);
      // потолочные лампы (света мало — они «следуют» за игроком)
      for (let lz = sec.zA - 5; lz > sec.zB + 2; lz -= 11) {
        [-W / 4, W / 4].forEach((lx) => {
          r.lamp(lx, H - 0.1, lz, 0.85); M.lampPos.push([lx, H - 0.4, lz]);
          if (T.open) r.box(lx, H / 2, lz, 0.14, H, 0.14, 0x1a1a1a, false);
        });
      }
      // постоянные предметы бита
      if (sec.b === 'hack' || sec.hk) {
        const left = sec.k % 2 === 0, x = left ? -W / 2 + 0.9 : W / 2 - 0.9, z = sec.cz + (M.rng() * 6 - 3);
        sec.term = { x, z, scr: termProp(r, x, z, left ? 'x+' : 'x-') };
        placed.push([x, z, 2.4, 3]);
      }
      if (sec.b === 'hold') {
        const gx = (M.rng() * 2 - 1) * 4, gz = sec.cz + (M.rng() * 4 - 2);
        r.box(gx, 0.8, gz, 1.8, 1.6, 1.2, 0x3a3a3a, true); r.strip(gx, 1.66, gz, 1.0, 0.08, 0.8, 0xffffff);
        sec.gen = [gx, gz]; placed.push([gx, gz, 3.6, 3.2]);
      }
      if (sec.b === 'plant') {
        const tx = (M.rng() * 2 - 1) * 4, tz = sec.zB + 5.2;
        r.crate(tx, tz, 2.6, 2.0, 1.4, 0x4a4a4a); r.crate(tx + 0.3, tz, 1.4, 1.4, 2.3, 0x5a5a5a); r.strip(tx + 0.3, 2.4, tz, 1.0, 0.08, 0.8, 0xffffff);
        sec.tgt = [tx, tz]; placed.push([tx, tz, 4, 3.4]);
      }
      if (sec.bays || sec.surge) {
        sec.bays = [r.bay(-W / 4, sec.cz + 4), r.bay(W / 4, sec.cz - 4)];
        placed.push([-W / 4, sec.cz + 4, 5, 5], [W / 4, sec.cz - 4, 5, 5]);
      }
      if (sec.b === 'rescue') {
        const n = sec.n || 3; sec.hos = [];
        for (let i = 0; i < n; i += 1) {
          const x = (i - (n - 1) / 2) * 2.6, z = sec.zB + 6.5 + (i % 2) * 1.6;
          const npc = r.npc(x, z, 0); npc.g.rotation.y = npc.yaw = 0;
          const v = new THREE.Mesh(r.g.box, r.basic(0xf2f2f2)); v.scale.set(0.42, 0.42, 0.34); v.position.y = 1.2; npc.g.add(v);
          sec.hos.push({ x, z, npc }); placed.push([x, z, 2, 2]);
        }
      }
      r.intBuild && r.intBuild(M, sec, placed); // interiors.js: комната у боковой стены
      placeCover(r, M, sec, placed);
      const nb = sec.barrels === undefined ? (sec.b === 'fight' ? 2 : 0) : sec.barrels;
      for (let i = 0; i < nb; i += 1) { const p = spot(r, M, sec, placed, 1.4, [sec.zB + 5, sec.zA - 6]); r.barrel(p[0], p[1]); placed.push([p[0], p[1], 0.8, 0.8]); }
      if (sec.b === 'blast' || sec.b === 'plant') { // запасные бочки у стены
        r.barrel(-3.2, sec.zB + 2.4); r.barrel(3.2, sec.zB + 2.4);
        r.strip(0, 2.9, sec.zB + 0.32, 5.4, 0.08, 0.04, 0xffffff);
      }
      if (sec.b === 'collect') {
        const n = sec.n || 3; sec.items = [];
        for (let i = 0; i < n; i += 1) {
          const zr = [sec.zA - 7 - (i + 1) * (sec.D - 12) / n, sec.zA - 7 - i * (sec.D - 12) / n];
          const p = spot(r, M, sec, placed, 1.8, zr), m = r.strip(p[0], 0.45, p[1], 0.5, 0.3, 0.4, 0xffffff);
          m.visible = false; sec.items.push({ x: p[0], z: p[1], m }); placed.push([p[0], p[1], 1, 1]);
        }
      }
    });
    r.spawn(0, 1.5, 0);
    return M;
  }

  // ------------------------------------------------------------ враги: точки появления и волны
  function pts(r, sec, n, mode) {
    const hw = sec.W / 2 - 2.4, p = r.p, out = [];
    const rng = {
      far: [sec.zB + 2.6, sec.zB + 11], mid: [sec.cz - 6, sec.cz + 6],
      back: [p.z + 8, sec.zA - 1.6], beyond: [sec.zB - 9, sec.zB - 3.5]
    };
    let [za, zb] = rng[mode] || rng.far;
    if (mode === 'back' && zb - za < 3) [za, zb] = rng.far;
    for (let i = 0; i < n; i += 1) {
      let best = null;
      for (let t = 0; t < 18 && !best; t += 1) {
        let x = rnd(-hw, hw); const z = rnd(Math.min(za, zb), Math.max(za, zb));
        if (mode === 'mid') x = (Math.random() < 0.5 ? -1 : 1) * rnd(hw * 0.45, hw);
        if (r.blockedE(x, z) || (r.inRoom && r.inRoom(x, z))) continue;
        if (mode !== 'beyond' && Math.hypot(x - p.x, z - p.z) < 7) continue;
        if (out.some((o) => Math.hypot(o[0] - x, o[1] - z) < 1.4)) continue;
        best = [x, z];
      }
      out.push(best || [rnd(-hw, hw), (za + zb) / 2]);
    }
    return out;
  }
  function spawnList(r, M, sec, types, i, mode) {
    const m = mode || (sec.mode === 'mix' || !sec.mode ? ['far', 'mid', 'far', 'back'][i % 4] : sec.mode);
    const list = String(types).split('');
    const at = pts(r, sec, list.length, m);
    return list.map((c, j) => {
      const o = Object.assign({}, sec.eo);
      o.hp = (o.hp || 1) * M.hp * (c === 'b' ? (sec.bhp || 0.3) : 1);
      return [TYPE[c] || 'grunt', at[j][0], at[j][1], o];
    });
  }
  // волна: сама проверяет «попытку» (M.att) — после смерти старые волны не доспавнивают врагов в новую попытку
  async function wave(r, M, sec, types, i, mode) {
    const att = M.att, list = spawnList(r, M, sec, types, i === undefined ? 0 : i, mode);
    const dead = () => r.disposed || r.ceasefire || M.att !== att;
    r.spawning = (r.spawning || 0) + 1;
    try {
      for (const it of list) {
        if (dead()) return;
        while (r.enemiesAlive() >= r.q.maxEnemies && !dead()) await r.wait(0.35);
        if (dead()) return;
        r.enemy(it[0], it[1], it[2], Object.assign({ yaw: Math.atan2(r.p.x - it[1], r.p.z - it[2]) }, it[3]));
        await r.wait(sec.gap || 0.35);
      }
    } finally { r.spawning = Math.max(0, (r.spawning || 1) - 1); }
  }

  // ------------------------------------------------------------ общее: взлом, свет, расходники
  function hackAt(r, sec, label, o, onUse) {
    return new Promise((res) => {
      const t = sec.term, st = { busy: false }, opt = Object.assign({ kind: 'seq', title: 'ACCESS TERMINAL', len: 4, tries: 3 }, o);
      t.scr.material = r.basic(0x555555);
      const it = r.interact({
        pos: [t.x, 1.1, t.z], label, reach: 3.2, enabled: () => !st.busy,
        use: async () => {
          st.busy = true; t.scr.material = r.basic(0xffffff); onUse && onUse();
          const ok = await r.hack(opt);
          st.busy = false;
          if (r.disposed) return;
          if (ok) { const i = r.interactables.indexOf(it); if (i >= 0) r.interactables.splice(i, 1); res(true); } else t.scr.material = r.basic(0x555555);
        }
      });
    });
  }
  function dark(r, lvl) {
    r.baseLight = lvl || 1; r.lightsLevel(r.baseLight);
    r.torchKeep = lvl ? 1.2 : 0; r.torch.intensity = r.torchKeep;
  }
  function supplies(r, M, sec) {
    const hw = sec.W / 2 - 2.4, owned = r.inv.map((w) => w.id);
    owned.forEach((id, i) => r.pickup((i % 2 ? 1 : -1) * (hw - (i >> 1) * 1.8), sec.zA - 3, 'ammo', { id, amount: AMMO[id] || 30 }));
    r.pickup(hw * 0.6, sec.zA - 3.2, 'health', { amount: 45 });
    r.pickup(-hw * 0.7, sec.cz + 2, 'health', { amount: 40 });
    const prim = owned.filter((id) => id !== 'sniper')[0] || owned[0];
    if (prim) r.pickup(hw * 0.8, sec.cz - 2, 'ammo', { id: prim, amount: AMMO[prim] || 30 });
    (sec.get || []).forEach((id, i) => r.pickup(-2 + i * 4, sec.zA - 4.2, 'weapon', { id, equip: false }));
    (sec.gad || []).forEach((g, i) => r.gadgetPickup(2 + i * 2.2, sec.zA - 3.4, g[0], g[1]));
  }
  function lampFollow(r, M) {
    let t = 0;
    return (dt) => {
      t -= dt;
      if (t > 0 || !r.lamps.length) return;
      t = 0.45;
      const near = M.lampPos.map((p) => ({ p, d: Math.hypot(p[0] - r.p.x, p[2] - r.p.z) })).sort((a, b) => a.d - b.d).slice(0, r.lamps.length);
      r.lamps.forEach((L, i) => { const p = near[i].p; if (Math.abs(L.position.x - p[0]) + Math.abs(L.position.z - p[2]) > 0.01) L.position.set(p[0], p[1], p[2]); });
    };
  }

  // ------------------------------------------------------------ биты
  const BEATS = {};

  BEATS.fight = async (r, M, sec) => {
    const W = sec.w || ['gg'];
    if (sec.foes) await wave(r, M, sec, sec.foes, 1);
    for (let i = 0; i < W.length; i += 1) {
      await wave(r, M, sec, W[i], i);
      await r.waitClear(i < W.length - 1 ? (sec.left || 0) : 0);
      if (i < W.length - 1) await r.wait(sec.rest === undefined ? 1.2 : sec.rest);
    }
  };

  BEATS.hack = async (r, M, sec) => {
    if (sec.foes) await wave(r, M, sec, sec.foes, 0);
    let atk = false;
    await hackAt(r, sec, sec.hkLabel || 'HACK TERMINAL', sec.hk, () => {
      if (!atk && sec.atk) { atk = true; wave(r, M, sec, sec.atk, 1, 'far'); }
    });
    r.sfx('notification');
    if (sec.clear) await r.waitClear(0);
  };

  BEATS.hold = async (r, M, sec) => {
    const h = sec.hold || {}, att = M.att;
    if (sec.foes) await wave(r, M, sec, sec.foes, 0);
    const sched = h.w || [];
    let done = false;
    await r.holdUse([sec.gen[0], 1.2, sec.gen[1]], h.label || 'START THE GENERATOR', h.secs || 20, {
      meter: h.meter || 'UPLOAD', reach: 3.2,
      onStart: () => {
        r.say(HND, h.say || 'ДЕРЖИСЬ РЯДОМ. ОНИ УЖЕ ИДУТ.', 2.4);
        (async () => {
          let prev = 0;
          for (let i = 0; i < sched.length; i += 1) {
            await r.wait(Math.max(0.2, sched[i][0] - prev)); prev = sched[i][0];
            if (done || M.att !== att || r.disposed) return;
            wave(r, M, sec, sched[i][1], i);
          }
        })();
      }
    });
    done = true;
    await r.waitClear(0);
  };

  function buildStealth(r, M, sec) {
    const S = M.S, hw = sec.W / 2 - 2.6, id = 'sc' + sec.k, G = sec.g === undefined ? 3 : sec.g, Cn = sec.c === undefined ? 1 : sec.c, Ln = sec.l || 0;
    const rows = Math.max(1, G), span = sec.D - 13;
    for (let i = 0; i < G; i += 1) {
      let z = sec.zA - 7.5 - (i + 0.5) * span / rows, path = null;
      for (let t = 0; t < 8 && !path; t += 1) {
        const zz = z + (t === 0 ? 0 : (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 1.2);
        let ok = true;
        for (let x = -hw; x <= hw; x += 0.5) if (r.blockedE(x, zz)) { ok = false; break; }
        if (ok) path = i % 3 === 2 ? [[rnd(-hw, hw), zz]] : (i % 2 ? [[hw, zz], [-hw, zz]] : [[-hw, zz], [hw, zz]]);
      }
      if (!path) { const x = rnd(-hw, hw); path = [[x, r.blockedE(x, z) ? z + 2 : z]]; }
      S.guard(path, { type: sec.gt || 'grunt', hp: sec.ghp || 0.5, range: sec.gr || 15, gun: sec.gun });
    }
    for (let i = 0; i < Cn; i += 1) {
      const left = i % 2 === 0, z = sec.zA - 9 - (i + 0.5) * (sec.D - 16) / Math.max(1, Cn), y = Math.min(sec.H - 0.3, 3.6);
      S.camera(left ? -sec.W / 2 + 0.25 : sec.W / 2 - 0.25, y, z, left ? PI * 0.62 : -PI * 0.88, left ? PI * 0.88 : -PI * 0.62, { id, period: 5.5 + i * 0.7, range: sec.cr || 13 });
    }
    for (let i = 0; i < Ln; i += 1) {
      const z = sec.zA - 11 - (i + 0.5) * (sec.D - 18) / Math.max(1, Ln);
      if (i % 2) S.laser([-sec.W / 2 + 0.5, z], [sec.W / 2 - 0.5, z], { id, sweep: { per: 5, dx: 0, dz: 3 } });
      else S.laser([-sec.W / 2 + 0.5, z], [sec.W / 2 - 0.5, z], { id, blink: 3.2 + i * 0.4 });
    }
  }
  BEATS.stealth = async (r, M, sec) => {
    const S = M.S;
    M.alarmed = false;
    S.clear(); S.begin(false);
    buildStealth(r, M, sec);
    if (sec.hk) {
      await hackAt(r, sec, sec.hkLabel || 'HACK THE SECURITY PANEL', sec.hk);
      S.disable('sc' + sec.k); r.sfx('notification'); r.toast('CAMERAS AND LASERS OFFLINE', 2);
    } else { sec.open = true; r.openNow(sec.door); } // без панели дверь открыта сразу — нужно пройти незамеченным
  };

  BEATS.blast = async (r, M, sec) => {
    const b = sec.brk;
    if (!sec.gad) {
      r.gadgetPickup(-3, sec.zA - 3.4, 'c4', 2); r.gadgetPickup(3, sec.zA - 3.4, 'frag', 1);
    }
    if (sec.foes) await wave(r, M, sec, sec.foes, 0);
    r.hint('PLANT C4 ON THE WALL [G] — STEP BACK — DETONATE [B]. OR SHOOT THE BARRELS BY THE WALL.', 6);
    let t = 0;
    const off = r.addHook((dt) => {
      if (r.locked || b.broken) return;
      t += dt;
      if (t > 45) { t = -9999; r.gadgetPickup(0, sec.zB + 8, 'c4', 2); r.toast('SUPPLY DROP: C4', 2.2); }
    });
    const guide = r.c4Guide(b, (t) => r.objective(t), 'WALL');
    await r.until(() => b.broken);
    off(); guide();
    if (sec.after) { wave(r, M, sec, sec.after, 1, 'beyond'); await r.wait(0.6); await r.waitClear(0); }
  };

  BEATS.plant = async (r, M, sec) => {
    const [tx, tz] = sec.tgt, b = sec.brk, pl = sec.pl || {}, att = M.att;
    if (sec.foes) await wave(r, M, sec, sec.foes, 0);
    let done = false;
    await r.holdUse([tx, 1.2, tz], pl.label || 'SET THE CHARGES', pl.secs || 7, {
      meter: 'ARMING', reach: 3.2,
      onStart: () => {
        (async () => {
          let prev = 0;
          for (let i = 0; i < (pl.w || []).length; i += 1) {
            await r.wait(Math.max(0.2, pl.w[i][0] - prev)); prev = pl.w[i][0];
            if (done || M.att !== att || r.disposed) return;
            wave(r, M, sec, pl.w[i][1], i);
          }
        })();
      }
    });
    done = true;
    const sx = clamp(tx, -sec.W / 2 + 3, sec.W / 2 - 3), sz = Math.min(sec.zA - 2, tz + 15);
    r.objective('CHARGES SET — GET TO THE SAFE ZONE');
    r.say(HND, 'ЗАРЯДЫ УСТАНОВЛЕНЫ. УХОДИ — ВЗРЫВ ЧЕРЕЗ ' + (pl.fuse || 16) + ' СЕКУНД.', 2.6);
    r.waypoint([sx, 1.5, sz], 'SAFE ZONE');
    let boom = false;
    r.countdown(pl.fuse || 16, 'DETONATION', { onExpire: () => { boom = true; r.waypoint(null); r.explode(tx, 1, tz, 10, 260, 'bomb'); r.shake && r.shake(0.1, 0.8); } });
    await r.until(() => boom);
    if (!b.broken) r.shatter(b);
    await r.waitClear(sec.left || 0);
  };

  const markAI = () => {
    let ph = rnd(0, 6), alert = false;
    return (e, dt, run, dist) => {
      if (alert) return false;
      if (e.hp < e.max || dist < 20 || e.stagger > 0) { alert = true; return false; }
      e.n.creeping = false; e.n.yaw += Math.sin(run.time * 0.7 + ph) * dt * 0.8;
      return true;
    };
  };
  BEATS.snipe = async (r, M, sec) => {
    const n = sec.n || 5, hw = sec.W / 2 - 3;
    r.hint(r.touch ? 'AIM BUTTON = SCOPE. HEADSHOTS ONE-SHOT.' : 'RMB — SCOPE. ONE SHOT TO THE HEAD.', 5);
    for (let i = 0; i < n; i += 1) {
      let x = 0, z = 0;
      for (let t = 0; t < 30; t += 1) { x = rnd(-hw, hw); z = rnd(sec.zB + 5, sec.zA - 30); if (!r.blockedE(x, z)) break; }
      r.enemy('grunt', x, z, { hp: 0.6 * M.hp, yaw: rnd(0, PI * 2), ai: markAI(), tag: 'mark', drop: false, exact: true });
    }
    r.objective(sec.obj + ' — ' + n + ' TARGETS');
    await r.waitClear(0);
    if (sec.w) {
      r.say(HND, 'ТЕБЯ ЗАСЕКЛИ! ОНИ ИДУТ К ТЕБЕ — ПЕРЕКЛЮЧИСЬ НА ОСНОВНОЕ ОРУЖИЕ.', 2.8);
      for (let i = 0; i < sec.w.length; i += 1) { await wave(r, M, sec, sec.w[i], i, 'far'); await r.waitClear(sec.left || 0); }
      await r.waitClear(0);
    }
  };

  BEATS.rescue = async (r, M, sec) => {
    const hs = sec.hos;
    hs.forEach((h) => { h.npc.g.position.set(h.x, 0, h.z); h.npc.goal = null; h.npc.g.visible = true; });
    if (sec.foes) await wave(r, M, sec, sec.foes, 0);
    let freed = 0;
    await Promise.all(hs.map((h) => r.holdUse([h.x, 1.2, h.z], 'CUT THE RESTRAINTS', 2.4, { meter: 'FREEING', reach: 2.2 }).then(() => {
      freed += 1; r.toast('HOSTAGE FREE  ' + freed + ' / ' + hs.length, 1.6);
      h.npc.goal = { x: h.x * 0.6, z: sec.zA - 3, speed: 2.4 };
    })));
    if (sec.after) { wave(r, M, sec, sec.after, 1); await r.wait(0.6); }
    await r.waitClear(0);
  };

  BEATS.collect = async (r, M, sec) => {
    if (sec.foes) await wave(r, M, sec, sec.foes, 0);
    const it = sec.items;
    for (let i = 0; i < it.length; i += 1) {
      const p = it[i]; p.m.visible = true;
      r.objective(sec.obj + ' — ' + (i + 1) + ' / ' + it.length);
      r.waypoint([p.x, 1.2, p.z], sec.lbl || 'DATA CASE');
      await r.useOnce([p.x, 1.1, p.z], sec.use || 'TAKE', { reach: 2.4 });
      p.m.visible = false; r.waypoint(null); r.sfx('notification');
      if (sec.amb && sec.amb[i]) wave(r, M, sec, sec.amb[i], i, 'back');
    }
    await r.waitClear(0);
  };

  BEATS.run = async (r, M, sec) => {
    const bulk = r.bulkhead(sec.zA + 11, -M.W / 2 + 0.2, M.W / 2 - 0.2, sec.speed || 1.7);
    sec.open = true; r.openNow(sec.door);
    if (sec.foes) wave(r, M, sec, sec.foes, 0, 'far');
    r.say(HND, 'ПРЕСС ЗА СПИНОЙ! НЕ ОСТАНАВЛИВАЙСЯ!', 2.4);
    const goal = sec.last ? sec.zB + 3.2 : sec.zB - 1.2;
    await r.until(() => r.p.z < goal);
    bulk.stop(); r.banner(null);
  };

  BEATS.boss = async (r, M, sec) => {
    const bz = sec.zB + 9;
    if (sec.foes) await wave(r, M, sec, sec.foes, 0);
    const b = r.enemy('boss', 0, bz, { hp: (sec.bhp || 0.3) * M.hp, drop: false, tag: 'boss', yaw: Math.atan2(r.p.x, r.p.z - bz) });
    r.objective(sec.obj + ' — ' + (sec.bname || 'WARDEN'));
    // выход босса: низкий ракурс на голову, потом жёсткая склейка к игроку (враги на время катсцены заморожены)
    if (r.cinematic && !r.dead) await r.cinematic(bossIntro(r, () => ({ x: b.x, y: b.hy * 0.95, z: b.z }), (sec.bname || 'WARDEN') + '\nHOSTILE — ELIMINATE'));
    r.say(HND, sec.bsay || 'ЭТО ОН. БЕЙ ПО ГОЛОВЕ — БРОНЯ ДЕРЖИТ ПУЛИ.', 2.8);
    const adds = sec.adds || []; let ai = 0;
    const off = r.addHook(() => {
      if (b.dead) return;
      const k = b.hp / b.max;
      r.meter((sec.bname || 'WARDEN') + ' ' + Math.max(0, Math.round(k * 100)) + '%', Math.max(0, k));
      if (ai < adds.length && k < adds[ai][0]) { wave(r, M, sec, adds[ai][1], ai + 1, 'far'); ai += 1; }
    });
    await r.until(() => b.dead);
    off(); r.meter(null);
    if (r.cineIdle) await r.cineIdle(); // добивание босса (cinema2.js) доигрывает до конца
    await r.waitClear(0);
  };

  // ------------------------------------------------------------ сектор и миссия
  function alarm(r, M, why) {
    const sec = M.cur;
    if (!sec || M.alarmed) return;
    M.alarmed = true;
    if (M.def.ghost) { r.fail('SPOTTED — GHOST PROTOCOL BROKEN'); return; }
    r.suppressed = false;
    r.objective('ALARM — ' + (sec.objLoud || 'FIGHT YOUR WAY OUT'));
    wave(r, M, sec, sec.alarmW || 'gg', 9, 'far');
  }

  async function runSector(r, M, k) {
    const sec = M.secs[k], S = M.S, T = M.T;
    M.cur = sec; M.att += 1; M.alarmed = false;
    r.banner(null); S.stop(); S.clear(); r.suppressed = false;
    r.mood(T.amb, sec.fogK || T.fogK, T.fog);
    dark(r, sec.dark || 0);
    if (sec.b === 'snipe' && !has(r, 'sniper')) r.giveWeapon('sniper', { equip: true });
    supplies(r, M, sec);
    r.intSector && r.intSector(M, sec);
    r.objective(sec.obj);
    if (sec.say) r.say(HND, sec.say, 3.2);
    if (sec.tip) r.hint(sec.tip, 5);
    const tm = sec.timer ? r.countdown(sec.timer, sec.tl || 'TIME', {}) : null;
    const sg = sec.bays ? r.surge(sec.bays, { first: 6, every: 11, dmg: 28, edmg: 40, label: sec.sl }) : null;
    await BEATS[sec.b](r, M, sec);
    tm && tm.stop(); sg && sg.stop();
    if (sec.last) {
      r.objective('REACH THE EXTRACTION POINT');
      await r.goTo(0, sec.zB + 2.4, 'EXTRACTION', 2.8);
      S.stop(); S.clear();
      return;
    }
    if (sec.door && !sec.open) {
      r.sfx('notification');
      const open = () => r.openDoor(sec.door, 1.1);
      if (k % 2 === 1 && C.cin.doorCam && !r.dead) await C.cin.doorCam(r, sec, open); else open(); // через сектор: короткая вставка «дверь открывается»
    }
    r.objective(sec.b === 'blast' || sec.b === 'plant' ? 'GO THROUGH THE BREACH' : 'ADVANCE TO THE NEXT SECTOR');
    // сектор считается пройденным только когда игрок реально ЗА проёмом (радиус маяка ~0: иначе дверь захлопывалась перед носом)
    await r.goTo(0, sec.zB - 2.2, 'ADVANCE', 0.01, () => r.p.z < sec.zB - 1.6 && Math.abs(r.p.x) < sec.W / 2);
    // сектор закрыт: дверь захлопывается, оставшиеся враги и подборы исчезают
    M.att += 1; S.stop(); S.clear(); r.suppressed = false;
    if (sec.door) { r.closeDoor(sec.door); r.sfx('thud'); }
    r.clearEnemies(); r.clearPickups(); r.banner(null);
  }

  function skipOf(r, M, k) {
    const sec = M.secs[k], def = M.def;
    const weapons = (def.kit || ['glock']).slice();
    M.secs.slice(0, k + 1).forEach((s) => (s.get || []).forEach((id) => { if (weapons.indexOf(id) < 0) weapons.push(id); }));
    return {
      pos: [0, sec.last ? sec.zB + 3 : sec.zB - 2.4, 0], weapons,
      set: () => {
        M.S.stop(); M.S.clear();
        if (sec.door) { r.openNow(sec.door); r.closeDoor(sec.door); }
        if (sec.brk && !sec.brk.broken) r.shatter(sec.brk);
        (sec.hos || []).forEach((h) => { h.npc.g.visible = false; });
        if (sec.items) sec.items.forEach((p) => { p.m.visible = false; });
      }
    };
  }

  function define(def) {
    const id = def.id;
    META[id] = { title: def.title, desc: def.desc, log: def.log };
    if (!def.secs) return; // только метаданные (миссия описана в другом файле)
    MISSIONS[id] = {
      title: def.title, theme: def.theme,
      build(r) { buildWorld(r, def); },
      async play(r) {
        const M = r.mm;
        M.S = r.stealth({ onAlarm: (s, why) => alarm(r, M, why) });
        if (!r.kitUpd) r.kitUpd = [];
        r.kitUpd.push(lampFollow(r, M));
        const mus = r.snd && r.snd.music;
        mus && mus.start(def.music || 'drone');
        r.hint(r.ctl(), 4);
        Object.keys(def.gad || {}).forEach((g) => r.addGadget(g, def.gad[g]));
        await r.fade(0, 0.8);
        for (let k = 0; k < M.secs.length; k += 1) await r.phase('s' + k, () => runSector(r, M, k), skipOf(r, M, k));
        M.S.stop(); M.S.clear(); r.banner(null); r.meter(null);
        await r.endCombat();
        await r.cine([{ flash: 0.6, sound: 'succesfully' }]);
        await r.complete();
      }
    };
    CINEMA[id] = {
      intro: (r) => {
        // оператор идёт по участку шагом с камерой в руках (на уровне груди/глаз), потом низкий ракурс на дальнюю дверь и реплика куратора
        const M = r.mm, s = M.secs[0], hw = M.W / 2 - 2.2, zA = s.zA, zE = Math.max(s.zB, zA - 22), sp = (x, y, z) => C.cin.spot(r, x, y, z);
        return [
          { at: sp(hw * 0.55, 1.55, zA - 0.8), to: sp(hw * 0.2, 1.5, zA - 3.6), look: [-hw * 0.3, 1.2, zE], lookTo: [hw * 0.4, 1.3, zE], fov: 70, dur: 3.8, caption: CAP(def.place || def.title) },
          { at: sp(-hw * 0.55, 0.85, zA - 6), to: sp(-hw * 0.25, 0.95, zA - 7.6), look: [0, 1.5, zE], fov: 58, fovTo: 48, dur: 2.6, roll: -0.04, tense: 0.7 },
          { at: sp(hw * 0.3, 1.5, zA - 2.4), to: sp(hw * 0.1, 1.5, zA - 3.3), look: [0, 1.5, zA - 13], fov: 50, dur: 3, say: [HND, def.brief] },
          pov(r, 2.2)
        ];
      },
      // осмотр участка перед каждым сектором, кроме первого (там уже играло интро)
      reveal: (r, name) => {
        const k = /^s\d+$/.test(name) ? +name.slice(1) : -1, M = r.mm;
        if (!M || k < 1 || !M.secs[k] || M.secs[k].b === 'boss') return null;   // у босса свой выход (bossIntro)
        const pad = (n) => String(n).padStart(2, '0');
        return revealShots(r, { caption: 'SECTOR ' + pad(k + 1) + ' / ' + pad(M.secs.length) + '\n' + M.secs[k].obj, far: M.secs[k].b === 'snipe' ? 30 : 16 });
      },
      outro: (r) => [back(r), crane(r, DONE(id))]
    };
  }

  const META = {};
  window.Missions.META = META;
  window.Missions.define = define;
}());
