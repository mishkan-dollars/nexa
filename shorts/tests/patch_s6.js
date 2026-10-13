const fs = require('fs');
let s = fs.readFileSync('tools/shorts/s5.js', 'utf8');
const a = s.indexOf('  // ---- №4: профессионал прячется');
const b = s.indexOf('  // ---- №5: обними мишку');
if (a < 0 || b < 0) throw new Error('markers');
const neu = `  // ---- №4: профессионал прячется, пока ты целишься (от первого лица, реальный ИИ, r.aimK читает игра)
  Shorts.s06 = async (o) => {
    o = o || {};
    const DUR = 20.4, END = 16.4, r = Scn.r, FPS = Scn.FPS, PZ = 15;
    Scn.enter('wh', 0, PZ, 0); Scn.clear(); Scn.resetFx();
    const AIM = o.aim || [[3.2, 6.6], [9.6, 13.0]];
    const aiming = (t) => AIM.some((w) => t >= w[0] && t < w[1]);
    const cover = r.box(0, 0.65, PZ - 9, 3.2, 1.3, 0.9, 0x7a6a50, true);
    let pro = null;
    const ev = [{ t: 0.0, fn: () => { r.p.x = 0; r.p.z = PZ; r.p.yaw = 0; r.p.pitch = 0.02; r.aimWant = false; pro = r.enemy('grunt', 0.6, PZ - 11.5, { drop: false, yaw: 0, exact: true, pers: 'pro', tag: 'film' }); pro.spawnT = 0; } }].map((e) => Object.assign(e, { done: false }));
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

`;
s = s.slice(0, a) + neu + s.slice(b);
fs.writeFileSync('tools/shorts/s5.js', s);
console.log('ok');
