// Ролик 4: «Эту 3D-игру сделали без движка» — облёт локаций + факты (строки кода, файлы, миссии, языки). ~21 с.
// Цифры считаются с диска (node): window.Shorts.facts = { lines, files, missions, langs } — подставляются в титры.
window.Shorts = window.Shorts || {};
Shorts.v4 = async (o) => {
  o = o || {};
  const r = Scn.r;
  const F = Object.assign({ lines: '37 000+', files: '94', missions: '48', langs: 'RU · EN · DE' }, Shorts.facts || {});
  const DUR = 21.4, FPS = Scn.FPS, END = 17.2;
  // [регион, x, z, yaw, камера от, камера до, цель от, цель до, fov, подпись]
  const L = [
    { reg: 'plaza', t0: 0.0, t1: 2.6, a: [0.0, 1.6, 12.5], b: [0.0, 1.6, 8.5], la: [0, 5.5, -25], lb: [0, 5.0, -25], fov: 62,
      text: 'ЭТУ 3D-ИГРУ СДЕЛАЛИ\n*БЕЗ ДВИЖКА*', size: 120 },
    { reg: 'wh', t0: 2.6, t1: 5.4, a: [-6.0, 1.7, 16.0], b: [3.0, 1.7, 9.0], la: [0, 2.2, -14], lb: [0, 2.4, -14], fov: 64,
      text: 'Ни Unity, ни Unreal —\n*только JavaScript*', size: 96 },
    { reg: 'dark', t0: 5.4, t1: 8.2, a: [0.0, 1.55, 250.0], b: [0.0, 1.55, 262.0], la: [0, 1.5, 290], lb: [0, 1.5, 292], fov: 66,
      text: '*' + F.lines + '* строк кода\nв *' + F.files + '* файлах', size: 100 },
    { reg: 'vault', t0: 8.2, t1: 11.0, a: [-5.0, 1.8, 22.0], b: [4.0, 1.8, 14.0], la: [0, 2.5, -30], lb: [0, 2.5, -30], fov: 64,
      text: '*' + F.missions + '* миссий —\nу каждой свой мир', size: 100 },
    { reg: 'red', t0: 11.0, t1: 14.0, a: [0.0, 1.6, 13.5], b: [0.0, 1.6, 9.5], la: [0, 3.2, -14], lb: [0, 3.2, -14], fov: 62,
      text: '*3 языка:*\n' + F.langs, size: 110 },
    { reg: 'office', t0: 14.0, t1: 17.2, a: [-2.4, 1.6, 4.4], b: [1.4, 1.5, 2.6], la: [0, 1.3, -4], lb: [0, 1.3, -4], fov: 66,
      text: 'Запускается *в браузере* —\nбез установки', size: 92 }
  ];
  const ev = [];
  let entered = -1;
  const ensure = (i) => {
    if (entered === i) return;
    entered = i;
    const s = L[i];
    const R = Scn.enter(s.reg, 0, 0, 0);
    Scn.clear();
    if (s.reg === 'vault' && R && R.gate && R.gate.reset) { try { R.gate.reset(); } catch (e) { /* без шлюза */ } }
  };
  const caps = L.map((s) => ({ t0: s.t0 + 0.05, t1: s.t1 - 0.05, text: s.text, size: s.size, y: 0.205, bg: 'rgba(0,0,0,0.45)' }));

  const audio = async (C2) => {
    await C2.addAudio('/assets/game.mp3', { at: 0, from: 8, dur: DUR, gain: 0.5, fadeIn: 0.2, fadeOut: 1.8 });
    const jobs = [];
    L.forEach((s) => jobs.push(C2.addAudio('/assets/neon.mp3', { at: s.t0, gain: 0.35 })));
    jobs.push(C2.addAudio('/assets/glitch2.mp3', { at: END, gain: 0.5 }));
    await Promise.all(jobs);
  };

  return Scn.film(o.name || 'v4_no_engine', DUR, async (t) => {
    const i = Math.max(0, L.findIndex((s) => t >= s.t0 && t < s.t1));
    const s = t >= END ? L[L.length - 1] : L[i < 0 ? 0 : i];
    if (t < END) ensure(i < 0 ? 0 : i);
    const k = Cap.ease(Cap.clamp((t - s.t0) / (s.t1 - s.t0), 0, 1));
    const lerp = (a, b, q) => a + (b - a) * q;
    Scn.cam(lerp(s.a[0], s.b[0], k), lerp(s.a[1], s.b[1], k), lerp(s.a[2], s.b[2], k), lerp(s.la[0], s.lb[0], k), lerp(s.la[1], s.lb[1], k), lerp(s.la[2], s.lb[2], k), s.fov, 0);
    Scn.advance(1 / FPS);
    const ctx = Scn.frame({ vig: 0.5 });
    Scn.caps(ctx, t, caps);
    if (t > 0.5 && t < END) Scn.badge(ctx, t - 0.5);
    for (const q of L) { if (q.t0 > 0 && t >= q.t0 && t < q.t0 + 0.12) Cap.flash(ctx, 0.4 * (1 - (t - q.t0) / 0.12), '#fff'); }
    if (t >= END) Cap.endCard(ctx, t - END);
  }, { audio, snaps: o.snaps || [0.6, 3.5, 6.5, 9.5, 12.5, 15.5], sheets: [] });
};
