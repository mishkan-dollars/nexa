// Серия «Субъект 083»: три ролика обратного отсчёта (13 / 14 / 15 октября). Без спойлеров финала.
window.Shorts = window.Shorts || {};
(() => {
  const C = { size: 100, y: 0.205, bg: 'rgba(0,0,0,0.45)' };
  const cap = (t0, t1, text, size) => Object.assign({}, C, { t0, t1, text, size: size || 100 });
  const bed = async (C2, url, dur, gain, from) => C2.addAudio(url, { at: 0, from: from || 0, dur, gain, fadeIn: 0.2, fadeOut: 1.6, loop: true });
  const beats = (C2, from, to, step, url, gain) => { const jobs = []; for (let t = from; t < to; t += step) jobs.push(C2.addAudio(url, { at: t, gain })); return Promise.all(jobs); };

  // День 1 (за 2 дня): тайна номера 083
  Shorts.s01 = async (o) => {
    o = o || {};
    const DUR = 19.4, END = 15.6;
    return Scn.montage({
      name: o.name || 's01_083_day1', dur: DUR, end: END, badge: 'ДО БЕТЫ: 2 ДНЯ',
      endOpts: { beta: 'ЧЕРЕЗ *2 ДНЯ*', date: '15 ОКТЯБРЯ', cta: 'Публично и *бесплатно*\nприходи за ответом' },
      shots: [
        { reg: 'dark', t0: 0, t1: 2.4, a: [0, 1.55, 248.5], b: [0, 1.55, 253], la: [0, 1.5, 282], lb: [0, 1.5, 285], fov: 66 },
        { reg: 'dark', t0: 2.4, t1: 6.0, a: [-1.3, 1.6, 254], b: [0.9, 1.55, 262], la: [1.9, 1.7, 259], lb: [1.9, 1.7, 266], fov: 62 },
        { reg: 'deep', t0: 6.0, t1: 11.0, a: [0, 1.6, 223], b: [0, 1.7, 235], la: [0, 2.2, 246], lb: [0, 2.3, 246], fov: 62, setup: (R) => { R.gates.forEach((g) => g.set(1)); R.door.set(0); } },
        { reg: 'red', t0: 11.0, t1: 15.6, a: [0, 1.6, 13.5], b: [0, 1.7, 9.8], la: [0, 3.0, -14], lb: [0, 3.1, -14], fov: 60 }
      ],
      caps: [cap(0.0, 2.3, 'СУБЪЕКТ\n*083*', 170), cap(2.5, 5.9, 'Коридор камер.\n*У каждой — номер*'), cap(6.1, 10.9, 'Дверь *083*.\nЧто за ней?', 110), cap(11.1, 15.4, 'Скоро ты\n*узнаешь*', 120)],
      audio: async (C2) => {
        await bed(C2, '/assets/ambbunker.mp3', DUR, 0.8);
        await beats(C2, 0.3, 6, 0.85, '/assets/heartbeat.mp3', 0.9);
        await Promise.all([2.4, 6.0, 11.0, END].map((t) => C2.addAudio('/assets/glitch2.mp3', { at: t, gain: 0.5 })));
      },
      snaps: o.snaps || [0.6, 4.0, 8.5, 13.0]
    });
  };

  // День 2 (завтра): волны охраны в красной комнате, счётчик растёт
  Shorts.s02 = async (o) => {
    o = o || {};
    const DUR = 19.8, END = 16.0, r = Scn.r;
    let R = null;
    const spawn = (n, rushers) => {
      const spots = R.spots;
      for (let i = 0; i < n; i += 1) {
        const q = spots[Math.floor(Math.random() * spots.length)];
        const x = q[0] + (Math.random() - 0.5) * 2.4, z = q[1] + (Math.random() - 0.5) * 2.4;
        const type = i < rushers ? 'rusher' : 'grunt';
        const e = r.enemy(type, x, z, { drop: false, yaw: 0, tag: 'film', speed: 0.8 + Math.random() * 0.3 });
        e.spawnT = 0;
      }
    };
    return Scn.montage({
      name: o.name || 's02_083_day2', dur: DUR, end: END, badge: 'ДО БЕТЫ: 1 ДЕНЬ',
      endOpts: { beta: 'ЗАВТРА *БЕТА-ТЕСТ*', date: '15 ОКТЯБРЯ', cta: 'Публично и *бесплатно*\nвыдержишь волны?' },
      shots: [
        { reg: 'red', t0: 0, t1: END, a: [0, 3.6, 15.2], b: [0, 3.2, 14.2], la: [0, 0.8, -3], lb: [0, 0.8, -2], fov: 62, speed: 0.9, sh: 0.012,
          setup: (Rg) => { R = Rg; r.p.x = 0; r.p.z = 8.0; r.p.yaw = 0; } }
      ],
      events: [{ t: 0.5, fn: () => spawn(6, 2) }, { t: 4.4, fn: () => spawn(8, 3) }, { t: 8.3, fn: () => spawn(12, 5) }, { t: 12.0, fn: () => spawn(14, 6) }],
      caps: [cap(0.0, 2.4, 'ВОЛНЫ.\n*Ты один.*', 150), cap(2.6, 4.3, 'Сначала *6* охранников…', 96), cap(4.5, 8.2, '…потом *14*', 120), cap(8.4, 11.9, '…потом *26*', 130), cap(12.1, 15.9, 'и *40*\nодновременно', 130)],
      over: (ctx, t) => {
        if (t < 0.4 || t >= END) return;
        const n = r.enemiesAlive();
        Cap.text(ctx, 'ОХРАНА: *' + n + '*', { x: 0.5, y: 0.34, size: 84, pop: false, bg: 'rgba(0,0,0,0.5)', k: 1 });
      },
      audio: async (C2) => {
        await bed(C2, '/assets/fight1.mp3', DUR, 0.45, 20);
        await Promise.all([0.5, 4.4, 8.3, 12.0].map((t) => C2.addAudio('/assets/alarm.mp3', { at: t, gain: 0.5 })));
        await Promise.all([END].map((t) => C2.addAudio('/assets/glitch2.mp3', { at: t, gain: 0.5 })));
      },
      snaps: o.snaps || [0.8, 3.5, 7.0, 10.5, 14.0]
    });
  };

  // День 3 (сегодня): быстрый монтаж + «СЕГОДНЯ»
  Shorts.s03 = async (o) => {
    o = o || {};
    const DUR = 17.8, END = 13.8, r = Scn.r;
    const guards = (list, pers) => list.map((q) => Scn.guard('grunt', q[0], q[1], q[2] || 0, pers ? { pers } : {}));
    return Scn.montage({
      name: o.name || 's03_083_day3', dur: DUR, end: END, badge: 'БЕТА-ТЕСТ СЕГОДНЯ',
      endOpts: { beta: 'БЕТА-ТЕСТ *СЕГОДНЯ*', date: '15 ОКТЯБРЯ', cta: 'Публично и *бесплатно*\nссылка в описании' },
      shots: [
        { reg: 'plaza', t0: 0, t1: 2.3, a: [0, 1.5, 9.5], b: [0.1, 1.45, 8.4], la: [0, 1.5, -3.5], lb: [0, 1.5, -3.5], fov: 58, speed: 0.5,
          setup: () => { guards([[-2.2, -1.5], [2.4, -4], [0.6, -6.5]]); }, tick: (t) => { if (t > 0.25 && !r.__s3a) { r.__s3a = true; r.explode(0, 0.9, -3.5, 5, 110, 'c4'); } } },
        { reg: 'deep', t0: 2.3, t1: 4.5, a: [0, 1.5, 120], b: [0, 1.4, 124], la: [0, 1.2, 138], lb: [0, 1.2, 140], fov: 66, speed: 0.5,
          setup: (R) => { R.gates.forEach((g, i) => g.set(i < 3 ? 1 : 0)); r.__s3a = false; const e = Scn.guard('grunt', 0.1, 130, Math.PI); setTimeout(() => {}, 0); r.__s3g = e; r.__s3h = false; },
          tick: (t) => { if (t > 2.6 && !r.__s3h && r.__s3g) { r.__s3h = true; Scn.hit(r.__s3g, { zone: 'torso', dmg: 190, from: [0.2, 1.4, 121] }); } } },
        { reg: 'vault', t0: 4.5, t1: 6.7, a: [-3, 1.7, -6], b: [3, 1.7, -12], la: [0, 1.8, -30], lb: [0, 1.8, -30], fov: 62, speed: 0.6,
          setup: (R) => { r.__s3v = false; R.shutters.forEach((q) => q.set(1)); }, tick: (t, k, R) => { if (t > 5.0 && !r.__s3v) { r.__s3v = true; try { R.gate.blow(); } catch (e) { /* без шлюза */ } r.explode(0, 1.0, -27.6, 7, 120, 'c4'); } } },
        { reg: 'red', t0: 6.7, t1: 8.9, a: [0, 1.6, 12.8], b: [0, 1.6, 11.5], la: [0, 1.3, -6], lb: [0, 1.3, -5], fov: 66, speed: 0.8,
          setup: (R) => { r.p.x = 0; r.p.z = 12.4; for (let i = 0; i < 10; i += 1) { const q = R.spots[i % R.spots.length]; r.enemy(i % 3 === 0 ? 'rusher' : 'grunt', q[0] + (Math.random() - 0.5) * 2, q[1] + (Math.random() - 0.5) * 2, { drop: false, yaw: 0, tag: 'film' }).spawnT = 0; } } },
        { reg: 'dark', t0: 8.9, t1: 11.1, a: [0, 1.55, 249], b: [0, 1.55, 266], la: [0, 1.5, 290], lb: [0, 1.5, 292], fov: 68 },
        { reg: 'wh', t0: 11.1, t1: 13.8, a: [-6, 1.7, 16], b: [3, 1.7, 9], la: [0, 2.2, -14], lb: [0, 2.4, -14], fov: 64 }
      ],
      caps: [cap(0.1, 2.2, 'СЕГОДНЯ\n*15 ОКТЯБРЯ*', 150), cap(2.4, 5.5, '*ПУБЛИЧНО*', 150), cap(5.6, 8.8, '*БЕСПЛАТНО*', 150), cap(8.9, 13.6, 'Бета-тест\n*уже сегодня*', 130)],
      audio: async (C2) => {
        await bed(C2, '/assets/fight1.mp3', DUR, 0.5, 120);
        await Promise.all([0.28, 4.9, 7.0].map((t, i) => C2.addAudio('/assets/explosion.mp3', { at: t, gain: 0.9 })));
        await C2.addAudio('/assets/shotgun.mp3', { at: 2.6, gain: 0.8 });
        await C2.addAudio('/assets/glitch2.mp3', { at: END, gain: 0.5 });
      },
      snaps: o.snaps || [0.6, 3.0, 5.5, 7.5, 10.0, 12.5]
    });
  };
})();
