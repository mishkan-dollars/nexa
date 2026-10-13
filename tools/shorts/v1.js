// Ролик 1: «Это не анимация» — физика смерти (Verlet-рэгдолл). ~22 с, 1080×1920. Двор NEXA INDUSTRIES ночью.
// Хук 0–2.6 с: дробовик в упор + «ЭТО НЕ АНИМАЦИЯ». Дальше 4 факта и финальная плашка беты (15 октября).
// Охрана смотрит +Z (yaw 0), камера стоит с положительной стороны Z и «стреляет» с неё.
window.Shorts = window.Shorts || {};
Shorts.v1 = async (o) => {
  o = o || {};
  const r = Scn.r;
  Scn.enter('plaza', 0, 0, 0);
  Scn.clear();
  r.p.x = 0; r.p.z = 12; r.p.yaw = 0;
  const DUR = 22.4, FPS = Scn.FPS, END = 18.2;
  let g1, g2, g3, g4, g5, g6, g7, pile = [];
  const ev = [];
  const at = (t, fn) => ev.push({ t, fn, done: false });
  const BANG = [0.15, 2.9, 7.0, 8.4, 11.0, 12.7, 14.9, 15.2, 15.5, 15.8, 16.1, 16.4];
  const SH = [0.3, 1.4, 8.5];                           // «стрелок»: откуда летят пули

  at(0.0, () => { g1 = Scn.guard('grunt', 0.2, 2.2, 0); });
  at(0.15, () => { Scn.hit(g1, { zone: 'torso', dmg: 200, from: SH }); });
  at(2.6, () => { Scn.clear(); g2 = Scn.guard('grunt', 0.0, -1.5, 0); });
  at(2.9, () => { Scn.hit(g2, { zone: 'torso', dmg: 175, from: [0.0, 1.3, 4.0] }); });
  at(6.2, () => { Scn.clear(); g3 = Scn.guard('grunt', -0.95, 0.5, 0); g4 = Scn.guard('grunt', 0.95, 1.2, 0); });
  at(7.0, () => { Scn.hit(g3, { zone: 'head', dmg: 80, from: SH }); });
  at(8.4, () => { Scn.hit(g4, { zone: 'leg', dmg: 70, from: SH }); });
  at(10.4, () => { Scn.clear(); g5 = Scn.guard('grunt', -1.0, 1.2, 0); g6 = Scn.guard('grunt', -2.6, -8.5, 0); g7 = Scn.guard('grunt', 1.8, -9.5, 0); });
  at(11.0, () => { Scn.hit(g5, { zone: 'torso', dmg: 240, from: SH }); });
  at(12.7, () => { r.explode(-0.4, 0.9, -9.0, 5.4, 110, 'frag'); });
  at(14.4, () => {
    Scn.clear();
    pile = [[-2.4, 2.5], [-0.8, 0.5], [1.0, -1.8], [2.6, -3.5], [-1.6, -5.5], [0.4, -7.8]].map((q) => Scn.guard('grunt', q[0], q[1], 0));
  });
  [14.9, 15.2, 15.5, 15.8, 16.1, 16.4].forEach((t, i) => at(t, () => {
    const e = pile[i]; if (!e) return;
    Scn.hit(e, { zone: i % 3 === 0 ? 'head' : i % 3 === 1 ? 'torso' : 'leg', dmg: i % 3 === 1 ? 170 : 80, from: [0.0, 1.4, 9] });
  }));

  const slow = (t) => {
    for (const f of BANG) if (t >= f - 0.08 && t < f + 1.0) return t < 14.4 ? 0.62 : 0.5;
    return 0.33;
  };

  const C = { size: 108, y: 0.205, bg: 'rgba(0,0,0,0.4)' };
  const caps = [
    Object.assign({}, C, { t0: 0.0, t1: 2.5, text: 'ЭТО *НЕ*\nАНИМАЦИЯ', size: 150 }),
    Object.assign({}, C, { t0: 3.0, t1: 4.7, text: 'Тело — это\n*16 точек* и пружины' }),
    Object.assign({}, C, { t0: 4.8, t1: 6.1, text: 'Физика считается\n*в момент удара*' }),
    Object.assign({}, C, { t0: 6.4, t1: 8.3, text: 'В голову —\n*оседает на месте*' }),
    Object.assign({}, C, { t0: 8.4, t1: 10.3, text: 'В ногу —\n*валится на бок*' }),
    Object.assign({}, C, { t0: 10.6, t1: 12.5, text: 'Сильный удар —\n*бросок назад*' }),
    Object.assign({}, C, { t0: 12.7, t1: 14.3, text: 'Взрыв —\n*швыряет тела*' }),
    Object.assign({}, C, { t0: 14.6, t1: 18.1, text: 'Ни одна смерть\n*не повторяется*', size: 120 })
  ];

  const shots = [
    [0, 2.6, { p: [0.7, 1.45, 7.6], l: [0.2, 1.0, 1.5], f: 54 }, { p: [0.45, 1.4, 6.6], l: [0.2, 0.8, 0.5], f: 50 }],
    [2.6, 6.2, { p: [-5.2, 1.1, 0.5], l: [0.0, 0.9, -2.2], f: 48 }, { p: [-4.4, 1.0, -1.5], l: [0.2, 0.5, -4.4], f: 44 }],
    [6.2, 10.4, { p: [0.0, 1.5, 6.8], l: [0.0, 0.9, 0.5], f: 62 }, { p: [0.0, 1.3, 5.2], l: [0.0, 0.5, -0.5], f: 56 }],
    [10.4, 14.4, { p: [-2.6, 1.3, 6.0], l: [-0.8, 1.0, 0.0], f: 60 }, { p: [1.8, 1.5, 5.0], l: [-0.4, 1.0, -7.5], f: 54 }],
    [14.4, 18.2, { p: [0.0, 1.5, 8.0], l: [0.0, 0.9, -2.0], f: 66 }, { p: [0.0, 3.2, 10.5], l: [0.0, 0.6, -5.0], f: 62 }],
    [18.2, 22.5, { p: [0.0, 3.2, 10.5], l: [0.0, 0.6, -5.0], f: 62 }, { p: [0.0, 3.0, 11.5], l: [0.0, 0.8, -5.0], f: 60 }]
  ];
  const lerp = (a, b, k) => a + (b - a) * k;
  const camAt = (t) => {
    const s = shots.find((q) => t >= q[0] && t < q[1]) || shots[shots.length - 1];
    const k = Cap.ease(Cap.clamp((t - s[0]) / (s[1] - s[0]), 0, 1)), a = s[2], b = s[3], sh = 0.01;
    return [lerp(a.p[0], b.p[0], k) + Math.sin(t * 9.1) * sh, lerp(a.p[1], b.p[1], k) + Math.sin(t * 7.3) * sh, lerp(a.p[2], b.p[2], k),
      lerp(a.l[0], b.l[0], k), lerp(a.l[1], b.l[1], k), lerp(a.l[2], b.l[2], k), lerp(a.f, b.f, k)];
  };

  const audio = async (C2) => {
    await C2.addAudio('/assets/fight1.mp3', { at: 0, from: 52, dur: DUR, gain: 0.42, fadeIn: 0.15, fadeOut: 1.8 });
    const jobs = [];
    const sfx = (url, t, g) => jobs.push(C2.addAudio(url, { at: t, gain: g }));
    sfx('/assets/shotgun.mp3', 0.12, 0.8); sfx('/assets/bodyhit.mp3', 0.2, 0.7);
    sfx('/assets/shotgun.mp3', 2.87, 0.75); sfx('/assets/bodyhit.mp3', 2.95, 0.7);
    sfx('/assets/glock.mp3', 6.98, 0.7); sfx('/assets/bodyhit.mp3', 7.05, 0.7);
    sfx('/assets/glock.mp3', 8.38, 0.7); sfx('/assets/bodyhit.mp3', 8.45, 0.7);
    sfx('/assets/shotgun.mp3', 10.98, 0.8); sfx('/assets/bodyhit.mp3', 11.05, 0.7);
    sfx('/assets/explosion.mp3', 12.68, 0.95);
    [14.9, 15.2, 15.5, 15.8, 16.1, 16.4].forEach((t, i) => sfx(i % 3 === 1 ? '/assets/shotgun.mp3' : '/assets/glock.mp3', t - 0.02, 0.6));
    sfx('/assets/glitch2.mp3', END, 0.5);
    await Promise.all(jobs);
  };

  return Scn.film(o.name || 'v1_ragdoll', DUR, async (t) => {
    ev.forEach((e) => { if (!e.done && t >= e.t) { e.done = true; e.fn(); } });
    const c = camAt(t);
    const kick = BANG.reduce((m, f) => (t >= f && t < f + 0.2 ? Math.max(m, 1 - (t - f) / 0.2) : m), 0);
    Scn.cam(c[0], c[1], c[2], c[3], c[4], c[5], c[6] - 5 * kick, 0);
    Scn.advance(slow(t) / FPS);
    const ctx = Scn.frame({ zoom: 1 + 0.04 * kick, vig: 0.55 });
    Scn.caps(ctx, t, caps);
    if (t > 0.5 && t < END) Scn.badge(ctx, t - 0.5);
    Cap.flash(ctx, kick * kick * 0.25, '#fff');
    if (t >= END) Cap.endCard(ctx, t - END);
  }, { audio, snaps: o.snaps || [0.6, 1.3, 2.3, 9.0, 13.4, 15.0, 17.0, 20.0], sheets: o.sheets || [{ t0: 0, t1: 3.2, every: 3 }, { t0: 6.2, t1: 10.4, every: 5 }, { t0: 10.4, t1: 14.4, every: 5 }] });
};
