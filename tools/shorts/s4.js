// Ролик №3: «5 приёмов, о которых игра не говорит» — от первого лица (ближний бой: js/pmove.js). Нужны cap.js, scn.js.
window.Shorts = window.Shorts || {};
(() => {
  const C0 = { size: 100, y: 0.205, bg: 'rgba(0,0,0,0.45)' };
  const cap = (t0, t1, text, size, extra) => Object.assign({}, C0, { t0, t1, text, size: size || 100 }, extra || {});
  const bed = (C2, url, dur, gain, from) => C2.addAudio(url, { at: 0, from: from || 0, dur, gain, fadeIn: 0.2, fadeOut: 1.6, loop: true });
  const hits = (C2, list, url, gain) => Promise.all(list.map((t) => C2.addAudio(url, { at: t, gain: gain === undefined ? 0.5 : gain })));

  Shorts.s05 = async (o) => {
    o = o || {};
    const r = Scn.r, FPS = Scn.FPS;
    const DUR = 25.0, END = 20.8;
    Scn.enter('wh', 0, 15, 0); Scn.clear();
    const key = (code, down) => document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code.replace('Key', '').toLowerCase(), bubbles: true }));
    const tap = (code) => { key(code, true); key(code, false); };
    const fists = (on) => { if (!!(r.pm && (r.pm.fists || r.pm.want)) !== on) tap('KeyF'); };
    const PZ = 15;
    const reset = (z, f) => { Scn.clear(); Scn.resetFx(); r.p.x = 0; r.p.z = z; r.p.yaw = 0; r.p.pitch = 0; r.keys.KeyW = false; r.keys.ShiftLeft = false; r.aimWant = false; fists(f); };
    const flashAt = [2.6, 6.2, 9.6, 13.4, 17.2];
    const ev = [
      // хук: пинок сразу
      { t: 0.0, fn: () => { reset(PZ, false); Scn.guard('grunt', 0, PZ - 1.7, 0); } },
      { t: 0.5, fn: () => tap('KeyV') },
      // 1 — кулаки
      { t: 2.6, fn: () => { reset(PZ, true); Scn.guard('grunt', 0, PZ - 1.3, 0); } },
      { t: 3.3, fn: () => r.pressFire() }, { t: 3.8, fn: () => r.pressFire() }, { t: 4.3, fn: () => r.pressFire() },
      // 2 — пинок
      { t: 6.2, fn: () => { reset(PZ, false); Scn.guard('grunt', 0, PZ - 1.7, 0); } },
      { t: 6.9, fn: () => tap('KeyV') },
      // 3 — подкат
      { t: 9.6, fn: () => { reset(PZ, false); Scn.guard('grunt', 0, PZ - 8.4, 0); r.keys.KeyW = true; r.keys.ShiftLeft = true; } },
      { t: 10.7, fn: () => tap('KeyC') },
      // 4 — таран
      { t: 13.4, fn: () => { reset(PZ, true); Scn.guard('grunt', 0, PZ - 6.4, 0); r.keys.KeyW = true; r.keys.ShiftLeft = true; } },
      { t: 14.5, fn: () => r.pressFire() },
      // 5 — наклоны Z / X
      { t: 17.2, fn: () => { reset(PZ, false); Scn.guard('grunt', 0, PZ - 9, 0); } },
      { t: 17.9, fn: () => key('KeyZ', true) }, { t: 19.0, fn: () => key('KeyZ', false) },
      { t: 19.2, fn: () => key('KeyX', true) }, { t: 20.3, fn: () => key('KeyX', false) }
    ].map((e) => Object.assign(e, { done: false }));
    const caps = [cap(0.1, 2.5, 'НАЖМИ *V* —\nИ УВИДИШЬ', 140), cap(2.8, 6.0, '*F* — кулаки,\nкомбо из трёх', 100), cap(6.3, 9.5, '*V* — пинок', 130),
      cap(9.8, 13.2, '*C* на бегу —\n*подкат*', 110), cap(13.6, 17.0, 'Бег + удар —\n*таран*', 110), cap(17.4, 20.6, '*Z / X* — наклон\nиз-за угла', 110)];
    return Scn.film(o.name || 's05_five_moves', DUR, async (t) => {
      ev.forEach((e) => { if (!e.done && t >= e.t) { e.done = true; e.fn(); } });
      // от первого лица: свободная камера не нужна
      r.camFree = null; r.inCinema = false; r.cineDepth = 0; r.shotState = null; r.locked = false; r.paused = false;
      Scn.advance(1 / FPS);
      const ctx = Scn.frame({ vig: 0.5 });
      Scn.caps(ctx, t, caps);
      if (t > 0.5 && t < END) Scn.badge(ctx, t - 0.5);
      flashAt.forEach((ft) => { if (t >= ft && t < ft + 0.12) Cap.flash(ctx, 0.4 * (1 - (t - ft) / 0.12), '#fff'); });
      if (t >= END) Cap.endCard(ctx, t - END, { cta: 'Публично и *бесплатно*\nпопробуй все пять' });
    }, {
      audio: async (C2) => { await bed(C2, '/assets/fight1.mp3', DUR, 0.45, 40); await hits(C2, [0.55, 3.35, 3.85, 4.35, 6.95, 10.75, 14.55, 19.45], '/assets/bodyhit.mp3', 0.8); await hits(C2, [2.6, 6.2, 9.6, 13.4, 17.2], '/assets/neon.mp3', 0.4); await hits(C2, [END], '/assets/glitch2.mp3', 0.5); },
      snaps: o.snaps || [0.8, 3.6, 7.2, 11.0, 14.8, 18.8], sheets: o.sheets || [{ t0: 9.6, t1: 20.6, every: 10, cols: 10, tw: 108 }]
    });
  };
})();
