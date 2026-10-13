// Ролик №8: штурм двери и жильцы (js/interiors.js + js/breach.js). От первого лица, реальная катсцена. Нужны cap.js, scn.js.
// ВАЖНО: комнаты остаются в регионе wh — снимать на свежей странице (после перезагрузки).
window.Shorts = window.Shorts || {};
(() => {
  const C0 = { size: 100, y: 0.205, bg: 'rgba(0,0,0,0.45)' };
  const cap = (t0, t1, text, size, extra) => Object.assign({}, C0, { t0, t1, text, size: size || 100 }, extra || {});
  const bed = (C2, url, dur, gain, from) => C2.addAudio(url, { at: 0, from: from || 0, dur, gain, fadeIn: 0.2, fadeOut: 1.6, loop: true });
  const hits = (C2, list, url, gain) => Promise.all(list.map((t) => C2.addAudio(url, { at: t, gain: gain === undefined ? 0.5 : gain })));

  Shorts.s10 = async (o) => {
    o = o || {};
    const r = Scn.r, FPS = Scn.FPS;
    const DUR = 15.8, END = 11.6, PRE = 0.9, TB = 3.9;
    Scn.enter('wh', 0, 15, 0); Scn.clear(); Scn.resetFx();
    r.camFree = null; r.inCinema = false; r.cineDepth = 0; r.locked = false; r.paused = false;
    const roomA = Interiors.test(r, { side: 1, scene: 'repair', z: 6, seed: 4 });
    const roomB = Interiors.test(r, { side: 1, scene: 'tea', z: -8, seed: 5 });
    const stage = (room, z) => { r.p.x = room.x0 - 2.4; r.p.z = z; r.p.yaw = -Math.PI / 2; r.p.pitch = 0; };
    stage(roomA, 6);
    r.breach(roomA, { variant: 'A' });
    for (let i = 0; i < Math.round(PRE * 60); i += 1) Scn.advance(1 / 60);       // разбег без записи: удар придётся на 1,6 с ролика
    const ev = [{ t: TB, fn: () => { r.camFree = null; stage(roomB, -8); r.breach(roomB, { variant: 'B' }); } }].map((e) => Object.assign(e, { done: false }));
    const caps = [cap(0.1, 2.4, 'ДВЕРЬ —\n*НОГОЙ*', 170), cap(2.6, 3.8, 'Вариант *A*: пяткой', 96), cap(4.0, 7.5, 'Вариант *B*:\n*прыжок двумя ногами*', 100), cap(7.8, 11.4, 'Внутри — *жильцы*.\nКто-то сдаётся', 104)];
    return Scn.film(o.name || 's10_breach', DUR, async (t) => {
      ev.forEach((e) => { if (!e.done && t >= e.t) { e.done = true; e.fn(); } });
      Scn.advance(1 / FPS);
      r.blurX = 0; r.blurY = 0;
      r.render();
      Cap.blit(r, {});
      const ctx = Cap.S.ctx;
      Cap.vignette(ctx, 0.5);
      Scn.caps(ctx, t, caps);
      if (t > 0.5 && t < END) Scn.badge(ctx, t - 0.5);
      if (t >= TB && t < TB + 0.12) Cap.flash(ctx, 0.4 * (1 - (t - TB) / 0.12), '#fff');
      if (t >= END) Cap.endCard(ctx, t - END, { cta: 'Публично и *бесплатно*\nвыбей дверь сам' });
    }, {
      audio: async (C2) => { await bed(C2, '/assets/fight1.mp3', DUR, 0.4, 70); await hits(C2, [1.55, 5.7], '/assets/explosion.mp3', 0.6); await hits(C2, [1.6, 5.75], '/assets/bodyhit.mp3', 0.9); await hits(C2, [TB], '/assets/neon.mp3', 0.4); await hits(C2, [END], '/assets/glitch2.mp3', 0.5); },
      snaps: o.snaps || [0.5, 1.7, 3.0, 5.0, 6.0, 9.0], sheets: o.sheets || [{ t0: 0, t1: 11.6, every: 8, cols: 10, tw: 108 }]
    });
  };
})();
