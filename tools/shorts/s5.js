// Ролики №4 («бот видит, что ты целишься») и №5 («мишка лечит»). Нужны cap.js, scn.js.
window.Shorts = window.Shorts || {};
(() => {
  const C0 = { size: 100, y: 0.205, bg: 'rgba(0,0,0,0.45)' };
  const cap = (t0, t1, text, size, extra) => Object.assign({}, C0, { t0, t1, text, size: size || 100 }, extra || {});
  const bed = (C2, url, dur, gain, from) => C2.addAudio(url, { at: 0, from: from || 0, dur, gain, fadeIn: 0.2, fadeOut: 1.6, loop: true });
  const hits = (C2, list, url, gain) => Promise.all(list.map((t) => C2.addAudio(url, { at: t, gain: gain === undefined ? 0.5 : gain })));

  // ---- №4: профессионал прячется, пока ты целишься (от первого лица, реальный ИИ, r.aimK читает игра)
  Shorts.s06 = async (o) => {
    o = o || {};
    const DUR = 20.4, END = 16.4, r = Scn.r, FPS = Scn.FPS, PZ = 15;
    Scn.enter('wh', 0, PZ, 0); Scn.clear(); Scn.resetFx();
    const AIM = o.aim || [[3.2, 6.6], [9.6, 13.0]];
    const aiming = (t) => AIM.some((w) => t >= w[0] && t < w[1]);
    const cover = r.box(0, 0.5, PZ - 6, 2.6, 1.0, 0.7, 0x7a6a50, true);
    let pro = null;
    const ev = [{ t: 0.0, fn: () => { r.p.x = 0; r.p.z = PZ; r.p.yaw = 0; r.p.pitch = 0.02; r.aimWant = false; pro = r.enemy('grunt', 0.5, PZ - 8.2, { drop: false, yaw: 0, exact: true, pers: 'pro', tag: 'film' }); pro.spawnT = 0; } }].map((e) => Object.assign(e, { done: false }));
    let res;
    try {
      res = await Scn.film(o.name || 's06_bot_aim', DUR, async (t) => {
        ev.forEach((e) => { if (!e.done && t >= e.t) { e.done = true; e.fn(); } });
        r.camFree = null; r.inCinema = false; r.cineDepth = 0; r.shotState = null; r.locked = false; r.paused = false;
        r.aimWant = aiming(t);
        r.p.x = 0; r.p.z = PZ;
        Scn.advance(1 / FPS);
        const ctx = Scn.frame({ vig: 0.5 });
        Scn.caps(ctx, t, [cap(0.1, 3.0, 'БОТ ВИДИТ,\nЧТО ТЫ *ЦЕЛИШЬСЯ*', 118), cap(3.3, 6.5, 'Целишься —\nон *прячется*', 118), cap(6.8, 9.5, 'Опустил оружие —\nон *выглядывает*', 100), cap(9.8, 13.0, 'Поднял снова —\nснова в укрытии', 100), cap(13.2, 16.2, 'Игра *читает* твой прицел', 92)]);
        if (t > 0.5 && t < END) Scn.badge(ctx, t - 0.5);
        if (t < END) {
          const on = r.aimK > 0.5;
          Cap.tag(ctx, on ? 'ТЫ ЦЕЛИШЬСЯ' : 'БЕЗ ПРИЦЕЛА', 540, 0.37 * 1920, { size: 40, accent: on ? '#ff2a2a' : '#6ae08a' });
        }
        if (t >= END) Cap.endCard(ctx, t - END, { cta: 'Публично и *бесплатно*\nпроверь, кто кого' });
      }, {
        audio: async (C2) => { await bed(C2, '/assets/fight1.mp3', DUR, 0.45, 60); await hits(C2, [3.2, 6.6, 9.6, 13.0], '/assets/neon.mp3', 0.45); await hits(C2, [END], '/assets/glitch2.mp3', 0.5); },
        sheets: o.sheets || [{ t0: 0, t1: 14, every: 10, cols: 10, tw: 108 }], snaps: o.snaps || [2.0, 5.0, 8.0, 11.5]
      });
    } finally {
      try { r.scene.remove(cover); const i = r.colliders.indexOf(cover.userData.col); if (i >= 0) r.colliders.splice(i, 1); } catch (e) { /* уже убрана */ }
      r.aimWant = false; if (pro) pro.dead = true;
    }
    return res;
  };

  // ---- №5: обними мишку (плюшевая игрушка, js/toyplay.js) — от первого лица
  Shorts.s07 = async (o) => {
    o = o || {};
    const r = Scn.r, FPS = Scn.FPS, DUR = 19.0, END = 15.0;
    try { await Toys.load('black_bear'); } catch (e) { /* уже загружена */ }
    if (!r.toy) r.initToys('black_bear');
    Scn.enter('wh', 0, 15, 0); Scn.clear();
    const key = (code) => { document.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.slice(-1), bubbles: true })); document.dispatchEvent(new KeyboardEvent('keyup', { code, key: code.slice(-1), bubbles: true })); };
    const ev = [
      { t: 0.0, fn: () => { r.p.x = 0; r.p.z = 15; r.p.yaw = 0; r.p.pitch = 0; r.hp = 24; r.maxHp = r.maxHp || 100; } },
      { t: 0.5, fn: () => key('Digit1') },
      { t: 2.6, fn: () => { try { r.toyShake(); } catch (e) { /* не в руках */ } } },
      { t: 3.6, fn: () => { try { r.toyShake(); } catch (e) { /* не в руках */ } } },
      { t: 5.6, fn: () => r.pressFire() }
    ].map((e) => Object.assign(e, { done: false }));
    let healed = 0;
    return Scn.film(o.name || 's07_bear', DUR, async (t) => {
      ev.forEach((e) => { if (!e.done && t >= e.t) { e.done = true; e.fn(); } });
      r.camFree = null; r.inCinema = false; r.cineDepth = 0; r.shotState = null; r.locked = false; r.paused = false;
      if (r.hp < 100 && t < 5.5) r.hp = 24;            // до объятия здоровье держим низким
      Scn.advance(1 / FPS);
      const ctx = Scn.frame({ vig: 0.5 });
      Scn.caps(ctx, t, [cap(0.1, 2.4, 'ОБНИМИ МИШКУ —\n*И ТЫ КАК НОВЫЙ*', 118), cap(2.7, 5.4, 'Достань: *1*\nвстряхни: *ПКМ*', 110), cap(5.7, 9.4, '*ЛКМ* — обнять:\nздоровье и патроны', 104), cap(9.8, 14.8, 'Баг или фича?\n*Это фича.*', 120)]);
      if (t > 0.5 && t < END) Scn.badge(ctx, t - 0.5);
      if (t > 0.3 && t < END) Cap.text(ctx, 'ЗДОРОВЬЕ: *' + Math.round(r.hp) + '*', { x: 0.5, y: 0.36, size: 72, pop: false, bg: 'rgba(0,0,0,0.5)', k: 1 });
      if (r.toyFx && r.toyFx.on && t < END) { healed = 1; ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, 0, 80, 1920); ctx.fillRect(1000, 0, 80, 1920); ctx.restore(); }
      if (t >= END) Cap.endCard(ctx, t - END, { cta: 'Публично и *бесплатно*\nобними мишку сам' });
    }, {
      audio: async (C2) => { await bed(C2, '/assets/menu.mp3', DUR, 0.7, 30); await hits(C2, [0.5], '/assets/plush1.mp3', 0.9); await hits(C2, [2.6, 3.6], '/assets/plush2.mp3', 0.9); await hits(C2, [5.6], '/assets/plush3.mp3', 1.0); await hits(C2, [END], '/assets/glitch2.mp3', 0.5); },
      snaps: o.snaps || [1.5, 4.0, 6.5, 9.0, 12.0], sheets: o.sheets || [{ t0: 0, t1: 10, every: 8, cols: 10, tw: 108 }]
    });
  };
})();
