// Ролики: №10 трейлер, №11 «как я это сделал» (2 истории), №12 опрос. Нужны cap.js, scn.js.
window.Shorts = window.Shorts || {};
(() => {
  const C0 = { size: 100, y: 0.205, bg: 'rgba(0,0,0,0.45)' };
  const cap = (t0, t1, text, size, extra) => Object.assign({}, C0, { t0, t1, text, size: size || 100 }, extra || {});
  const bed = (C2, url, dur, gain, from) => C2.addAudio(url, { at: 0, from: from || 0, dur, gain, fadeIn: 0.2, fadeOut: 1.6, loop: true });
  const hits = (C2, list, url, gain) => Promise.all(list.map((t) => C2.addAudio(url, { at: t, gain: gain === undefined ? 0.5 : gain })));

  // ---- №10: трейлер 14 с
  Shorts.s12 = async (o) => {
    o = o || {};
    const DUR = 18.4, END = 14.4, r = Scn.r;
    const guards = (list, pers) => list.map((q, i) => Scn.guard(q[2] || 'grunt', q[0], q[1], 0, pers ? { pers: pers[i] } : {}));
    const once = (key, fn) => { if (!r[key]) { r[key] = true; fn(); } };
    const W2 = 1.8;
    return Scn.montage({
      name: o.name || 's12_trailer', dur: DUR, end: END, vig: 0.55,
      endOpts: { cta: 'Публично и *бесплатно*\nссылка — в описании' },
      shots: [
        { reg: 'plaza', t0: 0, t1: W2, a: [0.6, 1.45, 7.6], b: [0.4, 1.4, 6.6], la: [0.2, 1.0, 1.5], lb: [0.2, 0.8, 0.5], fov: 54, speed: 0.55,
          setup: () => { r.__t0 = 0; r.__tg = Scn.guard('grunt', 0.2, 2.2, 0); }, tick: (t) => { if (t > 0.15 && !r.__t0) { r.__t0 = 1; Scn.hit(r.__tg, { zone: 'torso', dmg: 200, from: [0.3, 1.4, 8.5] }); } } },
        { reg: 'plaza', t0: W2, t1: W2 * 2, a: [-6, 1.1, 6.5], b: [4.5, 1.3, 7.5], la: [0.2, 1.7, -3.0], lb: [0.2, 1.7, -3.0], fov: 58, speed: 0.3,
          setup: () => { r.__t1 = 0; guards([[-2.4, -2.4], [2.2, -3.5], [0.2, -6]]); }, tick: (t) => { if (t > W2 + 0.2 && !r.__t1) { r.__t1 = 1; r.explode(0.2, 0.9, -3.0, 5.2, 95, 'frag'); } } },
        { reg: 'plaza', t0: W2 * 2, t1: W2 * 3, a: [0, 1.6, 8.5], b: [0, 1.5, 7.0], la: [0, 1.2, -4.6], lb: [0, 1.2, -4.6], fov: 62, speed: 0.5,
          setup: () => { [['panic', -3.3], ['sniper', -2.0], ['officer', -0.7], ['jugg', 0.6], ['zealot', 1.9], ['tech', 3.2]].forEach((q, i) => Scn.guard(q[0] === 'jugg' ? 'heavy' : 'grunt', q[1], -4.6 - (i % 2) * 1.7, 0, { pers: q[0] })); } },
        { reg: 'dark', t0: W2 * 3, t1: W2 * 4, a: [0, 1.55, 249], b: [0, 1.55, 262], la: [0, 1.5, 290], lb: [0, 1.5, 292], fov: 68 },
        { reg: 'vault', t0: W2 * 4, t1: W2 * 5, a: [-3, 1.7, -6], b: [3, 1.7, -12], la: [0, 1.8, -30], lb: [0, 1.8, -30], fov: 62, speed: 0.6,
          setup: (R) => { r.__t4 = 0; R.shutters.forEach((q) => q.set(1)); }, tick: (t, k, R) => { if (t > W2 * 4 + 0.3 && !r.__t4) { r.__t4 = 1; try { R.gate.blow(); } catch (e) { /* нет шлюза */ } r.explode(0, 1.0, -27.6, 7, 120, 'c4'); } } },
        { reg: 'red', t0: W2 * 5, t1: W2 * 6, a: [0, 3.6, 15.2], b: [0, 3.2, 14.2], la: [0, 0.8, -3], lb: [0, 0.8, -2], fov: 62, speed: 1.0,
          setup: (R) => { r.p.x = 0; r.p.z = 8; for (let i = 0; i < 16; i += 1) { const q = R.spots[i % R.spots.length]; r.enemy(i % 3 === 0 ? 'rusher' : 'grunt', q[0] + (Math.random() - 0.5) * 2, q[1] + (Math.random() - 0.5) * 2, { drop: false, yaw: 0, tag: 'film' }).spawnT = 0; } } },
        { lobby: true, t0: W2 * 6, t1: W2 * 7, a: [0, 0, 0], b: [0, 0, 0], la: [0, 0, 0], lb: [0, 0, 0], fov: 60 },
        { reg: 'deep', t0: W2 * 7, t1: END, a: [0, 1.5, 120], b: [0, 1.4, 124], la: [0, 1.2, 138], lb: [0, 1.2, 140], fov: 66, speed: 0.5,
          setup: (R) => { R.gates.forEach((g, i) => g.set(i < 3 ? 1 : 0)); r.__t7 = 0; r.__tg7 = Scn.guard('grunt', 0.1, 130, Math.PI); },
          tick: (t) => { if (t > W2 * 7 + 0.3 && !r.__t7) { r.__t7 = 1; Scn.hit(r.__tg7, { zone: 'torso', dmg: 190, from: [0.2, 1.4, 121] }); } } }
      ],
      caps: [
        cap(0.0, W2 - 0.05, 'ФИЗИКА', 170, { y: 0.2 }), cap(W2, W2 * 2 - 0.05, 'ВЗРЫВЫ', 170, { y: 0.2 }), cap(W2 * 2, W2 * 3 - 0.05, '*10* ХАРАКТЕРОВ', 130, { y: 0.2 }),
        cap(W2 * 3, W2 * 4 - 0.05, '*48* МИССИЙ', 150, { y: 0.2 }), cap(W2 * 4, W2 * 5 - 0.05, 'ОГРАБЛЕНИЯ', 150, { y: 0.2 }), cap(W2 * 5, W2 * 6 - 0.05, 'ВОЛНЫ ОХРАНЫ', 140, { y: 0.2 }),
        cap(W2 * 6, W2 * 7 - 0.05, 'RU · EN · DE', 150, { y: 0.2 }), cap(W2 * 7, END - 0.05, '*15 ОКТЯБРЯ*', 170, { y: 0.2 })
      ],
      audio: async (C2) => {
        await bed(C2, '/assets/fight1.mp3', DUR, 0.55, 120);
        const cuts = []; for (let i = 0; i < 8; i += 1) cuts.push(i * W2);
        await hits(C2, cuts, '/assets/neon.mp3', 0.4);
        await hits(C2, [0.15, W2 + 0.2, W2 * 4 + 0.3, W2 * 7 + 0.3], '/assets/explosion.mp3', 0.8);
        await hits(C2, [0.17, W2 * 7 + 0.32], '/assets/shotgun.mp3', 0.8);
        await hits(C2, [END], '/assets/glitch2.mp3', 0.5);
      },
      snaps: o.snaps || [0.6, 2.4, 4.5, 6.3, 8.1, 10.2, 12.0, 13.5]
    });
  };

  // ---- №11, история 1: невидимая стена у упавшей двери
  Shorts.s13 = async (o) => {
    o = o || {};
    const DUR = 19.2, END = 15.4;
    // коллайдер упавшей створки, который стоял раньше: x -1.4..2.2, z 246.7..249.9
    const X0 = -1.4, X1 = 2.2, Z0 = 246.7, Z1 = 249.9;
    return Scn.montage({
      name: o.name || 's13_devdiary_wall', dur: DUR, end: END,
      endOpts: { cta: 'Публично и *бесплатно*\nбаги чиним до релиза' },
      shots: [
        { reg: 'dark', t0: 0, t1: 3.0, a: [0, 1.6, 243.5], b: [0, 1.5, 246.5], la: [0.6, 0.3, 249], lb: [0.6, 0.3, 249], fov: 62 },
        { reg: 'dark', t0: 3.0, t1: 8.0, a: [0, 6.0, 242.0], b: [0, 6.8, 243.0], la: [0.4, 0, 248.5], lb: [0.4, 0, 248.5], fov: 55, cont: true },
        { reg: 'dark', t0: 8.0, t1: 11.7, a: [0, 1.45, 244.8], b: [0, 1.45, 246.0], la: [0, 1.2, 252], lb: [0, 1.2, 252], fov: 62, cont: true },
        { reg: 'dark', t0: 11.7, t1: END, a: [0, 1.55, 247.6], b: [0, 1.55, 262], la: [0, 1.5, 285], lb: [0, 1.5, 290], fov: 66, cont: true }
      ],
      caps: [cap(0.1, 2.9, 'БАГ В БЕТЕ:\n*нельзя ходить*', 120), cap(3.2, 7.9, 'Упавшая дверь —\n*невидимая стена*', 104), cap(8.2, 11.6, 'Игрок вставал\n*прямо внутри неё*', 104), cap(11.9, 15.2, 'Фикс: *одна строка*', 120)],
      over: (ctx, t) => {
        if (t >= 3.2 && t < 11.6) {
          const pts = [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]].map((p) => Scn.proj(p[0], 0.35, p[1]));
          if (pts.every((p) => p.vis)) {
            ctx.save(); ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < 4; i += 1) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath();
            const a = Cap.clamp((t - 3.2) / 0.5, 0, 1);
            ctx.globalAlpha = 0.38 * a; ctx.fillStyle = '#ff2a2a'; ctx.fill(); ctx.globalAlpha = a; ctx.lineWidth = 6; ctx.strokeStyle = '#ff2a2a'; ctx.stroke(); ctx.restore();
          }
          const c = Scn.proj((X0 + X1) / 2, 0.9, (Z0 + Z1) / 2);
          if (c.vis && c.y > 260 && c.y < 1500) Cap.tag(ctx, 'коллайдер', c.x, c.y, { size: 34, alpha: Cap.clamp((t - 3.4) / 0.4, 0, 1) });
        }
        if (t >= 8.2 && t < 11.6) { const p = Scn.proj(0, 2.0, 247.6); if (p.vis) Cap.tag(ctx, 'ты здесь', p.x, p.y, { size: 34 }); }
        if (t >= 12.0 && t < END) {
          const a = Cap.clamp((t - 12.0) / 0.4, 0, 1);
          ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(8,8,10,0.88)'; ctx.fillRect(40, 1000, 1000, 250);
          ctx.font = '700 34px Consolas, "Courier New", monospace'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ff5a5a'; ctx.fillText('- solid(R, 0.4, DK.z0 + 2.3, 3.6, 3.2, 0.4);', 70, 1075);
          ctx.fillStyle = '#6ae08a'; ctx.fillText('+ // створка лежит на полу — без коллайдера', 70, 1170);
          ctx.restore();
        }
      },
      audio: async (C2) => { await bed(C2, '/assets/amblab.mp3', DUR, 0.7); await hits(C2, [3.0, 8.0, 11.9], '/assets/neon.mp3', 0.5); await hits(C2, [END], '/assets/glitch2.mp3', 0.5); },
      snaps: o.snaps || [1.0, 5.0, 10.0, 13.5]
    });
  };

  // ---- №11, история 2: охрана застревала в комнатах (вид сверху, реальная проверка достижимости)
  Shorts.s14 = async (o) => {
    o = o || {};
    const DUR = 19.6, END = 15.6, r = Scn.r;
    const R0 = Scn.enter('deep', 0, 118, 0);
    R0.gates.forEach((g) => g.set(1));
    const ROOM = { x0: -9.1, x1: -3.1, z0: 141, z1: 147 }, OLD = { x0: -5.65, x1: -5.15, z0: 141.3, z1: 146.7, y0: 0, y1: 2.0 };
    const ST = 0.25;
    // достижимость: BFS от оси коридора по клеткам r.blockedE (как у реальной проверки спавна)
    const grid = () => {
      const x0 = -10.5, x1 = 1.5, z0 = 138, z1 = 150, nx = Math.round((x1 - x0) / ST), nz = Math.round((z1 - z0) / ST);
      const free = new Uint8Array(nx * nz), seen = new Uint8Array(nx * nz);
      for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) free[i + j * nx] = r.blockedE(x0 + (i + 0.5) * ST, z0 + (j + 0.5) * ST) ? 0 : 1;
      const idx = (x, z) => Math.floor((x - x0) / ST) + Math.floor((z - z0) / ST) * nx;
      const q = [idx(0, 144)]; seen[q[0]] = 1;
      for (let h = 0; h < q.length; h += 1) { const c = q[h], i = c % nx, j = (c - i) / nx; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const k = ii + jj * nx; if (seen[k] || !free[k]) continue; seen[k] = 1; q.push(k); } }
      const cells = []; let nFree = 0, nBad = 0;
      for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) {
        const x = x0 + (i + 0.5) * ST, z = z0 + (j + 0.5) * ST;
        if (x < ROOM.x0 || x > ROOM.x1 || z < ROOM.z0 || z > ROOM.z1 || !free[i + j * nx]) continue;
        nFree += 1; const ok = seen[i + j * nx] === 1; if (!ok) nBad += 1; cells.push([x, z, ok]);
      }
      return { cells, pct: Math.round(100 * nBad / Math.max(1, nFree)) };
    };
    r.colliders.push(OLD);
    const before = grid();
    r.colliders.splice(r.colliders.indexOf(OLD), 1);
    const after = grid();
    let oldOn = false;
    const near0 = r.camera.near;
    return Scn.montage({
      name: o.name || 's14_devdiary_rooms', dur: DUR, end: END,
      endOpts: { cta: 'Публично и *бесплатно*\nигра без «застрявших»' },
      shots: [
        { reg: 'deep', t0: 0, t1: END, a: [-5.6, 16, 145.4], b: [-5.6, 16, 145.4], la: [-5.6, 0, 144], lb: [-5.6, 0, 144], fov: 50, sh: 0,
          setup: (R) => { R.gates.forEach((g) => g.set(1)); r.camera.near = 12.2; r.camera.updateProjectionMatrix(); },
          tick: (t) => { const want = t < 8.2; if (want && !oldOn) { r.colliders.push(OLD); oldOn = true; } if (!want && oldOn) { r.colliders.splice(r.colliders.indexOf(OLD), 1); oldOn = false; } } }
      ],
      caps: [cap(0.1, 2.6, 'БАГ: ОХРАНА\n*ЗАСТРЕВАЛА*', 120), cap(2.8, 8.0, 'Красное — клетки,\nоткуда *не выйти*', 100), cap(8.4, 12.2, 'Фикс: проход\n*по оси двери*', 104), cap(12.4, 15.4, 'Было *' + before.pct + '%* —\nстало *' + after.pct + '%*', 120)],
      over: (ctx, t) => {
        if (t >= END) return;
        const G = t < 8.2 ? before : after;
        const a = Cap.clamp(t / 0.5, 0, 1);
        ctx.save(); ctx.globalAlpha = 0.55 * a;
        G.cells.forEach((c) => {
          const p0 = Scn.proj(c[0] - ST / 2, 0.05, c[1] - ST / 2), p1 = Scn.proj(c[0] + ST / 2, 0.05, c[1] + ST / 2);
          ctx.fillStyle = c[2] ? '#2fe068' : '#ff2a2a';
          ctx.fillRect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x) + 0.8, Math.abs(p1.y - p0.y) + 0.8);
        });
        ctx.restore();
        Cap.text(ctx, 'ЗАПЕРТО: *' + G.pct + '%*', { x: 0.5, y: 0.8, size: 70, pop: false, bg: 'rgba(0,0,0,0.55)', k: 1 });
      },
      audio: async (C2) => { await bed(C2, '/assets/amblab.mp3', DUR, 0.7); await hits(C2, [2.8, 8.4, 12.4], '/assets/neon.mp3', 0.5); await hits(C2, [END], '/assets/glitch2.mp3', 0.5); },
      finish: () => { r.camera.near = near0; r.camera.updateProjectionMatrix(); },
      snaps: o.snaps || [1.0, 5.0, 10.0, 13.5]
    }).then((x) => { r.camera.near = near0; r.camera.updateProjectionMatrix(); if (oldOn) r.colliders.splice(r.colliders.indexOf(OLD), 1); x.pcts = [before.pct, after.pct]; return x; });
  };

  // ---- №12: опрос «кто бесит больше»
  Shorts.s15 = async (o) => {
    o = o || {};
    const DUR = 17.8, END = 13.8, SLOT = 3.0, T0 = 2.6, r = Scn.r;
    const P = [['panic', 'grunt', '1', 'ПАНИКЁР', -2.0, 0.8], ['sniper', 'grunt', '2', 'СНАЙПЕР', -7.0, -1.0], ['jugg', 'heavy', '3', 'ДЖАГГЕРНАУТ', -4.0, -0.6]];
    const shots = [{ reg: 'plaza', t0: 0, t1: T0, a: [0, 1.6, 8.5], b: [0, 1.5, 7.0], la: [0, 1.2, -4.6], lb: [0, 1.2, -4.6], fov: 62, speed: 0.35,
      setup: () => { P.forEach((q, i) => Scn.guard(q[1], -2.4 + i * 2.4, -4.6 - (i % 2) * 1.5, 0, { pers: q[0] })); } }];
    P.forEach((q, i) => {
      const cz = q[4] + (q[1] === 'heavy' ? 9.5 : 7.5);
      shots.push({ reg: 'plaza', t0: T0 + i * SLOT, t1: T0 + (i + 1) * SLOT, a: [0, 1.5, cz], b: [0, 1.5, cz], la: [q[5] * 0.7, 1.15, q[4]], lb: [q[5] * 0.7, 1.15, q[4]], fov: 40, speed: 0.7, sh: 0.004,
        setup: () => { r.p.x = 0; r.p.z = cz; const e = r.enemy(q[1], q[5], q[4], { drop: false, yaw: 0, exact: true, pers: q[0], tag: 'film' }); e.spawnT = 0; } });
    });
    const FIN = T0 + P.length * SLOT;
    shots.push({ reg: 'plaza', t0: FIN, t1: END, a: [0, 1.7, 9], b: [0, 1.7, 9], la: [0, 1.2, -6], lb: [0, 1.2, -6], fov: 64, speed: 0.7,
      setup: () => { r.p.x = 0; r.p.z = 6; ['panic', 'sniper', 'jugg'].forEach((id, i) => Scn.guard(id === 'jugg' ? 'heavy' : 'grunt', -2.4 + i * 2.4, -5 - (i % 2) * 1.5, 0, { pers: id })); } });
    return Scn.montage({
      name: o.name || 's15_poll', dur: DUR, end: END,
      endOpts: { cta: 'Публично и *бесплатно*\nпиши свой ответ' },
      shots,
      caps: [cap(0.1, 2.5, 'КТО БЕСИТ\n*БОЛЬШЕ ВСЕХ?*', 130)].concat(P.map((q, i) => cap(T0 + i * SLOT + 0.05, T0 + (i + 1) * SLOT - 0.05, '*' + q[2] + '*  ' + q[3], 120))).concat([cap(FIN + 0.1, END - 0.1, 'Пиши *1, 2 или 3*\nв комментариях', 112)]),
      audio: async (C2) => { await bed(C2, '/assets/fight1.mp3', DUR, 0.45, 100); await hits(C2, [T0, T0 + SLOT, T0 + 2 * SLOT, FIN], '/assets/neon.mp3', 0.4); await hits(C2, [END], '/assets/glitch2.mp3', 0.5); },
      snaps: o.snaps || [1.0, 4.0, 7.0, 10.0, 12.0]
    });
  };
})();
