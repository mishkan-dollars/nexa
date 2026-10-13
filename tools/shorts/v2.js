// Ролик 2: «Один взрыв = 6 эффектов». Двор NEXA INDUSTRIES: C4 в хуке, граната в замедлении по слоям,
// ближний взрыв (оглушение), большая бомба в финале. ~22 с.
window.Shorts = window.Shorts || {};
Shorts.v2 = async (o) => {
  o = o || {};
  const r = Scn.r;
  Scn.enter('plaza', 0, 0, 0);
  Scn.clear();
  r.p.x = 0; r.p.z = 12; r.p.yaw = 0;
  const DUR = 22.4, FPS = Scn.FPS, END = 18.4;
  const ev = [];
  const at = (t, fn) => ev.push({ t, fn, done: false });
  const guards = (list) => list.forEach((q) => Scn.guard('grunt', q[0], q[1], 0));
  // хук: C4 в 12 м
  at(0.0, () => { guards([[-2.2, -1.5], [2.4, -4], [0.6, -6.5]]); });
  at(0.22, () => { r.explode(0, 0.9, -3.5, 5.0, 110, 'c4'); });
  // слои: граната
  at(2.6, () => { Scn.clear(); guards([[-2.4, -2.4], [2.2, -3.5], [0.2, -6]]); });
  at(3.0, () => { r.explode(0.2, 0.9, -3.0, 5.2, 95, 'frag'); });
  // оглушение: граната в 3,5 м от камеры
  at(11.0, () => { Scn.clear(); });
  at(11.2, () => { r.explode(0.4, 0.9, 1.6, 5.0, 40, 'frag'); });
  // финал: большая бомба в 17 м
  at(15.6, () => { Scn.clear(); guards([[-2.2, -8], [2.4, -10], [0.0, -12], [-1.0, -14.5]]); });
  at(15.9, () => { r.explode(0, 0.9, -11, 9, 220, 'bomb'); });

  const BANG = [0.22, 3.0, 11.2, 15.9];
  const slow = (t) => {
    if (t < 0.22) return 0.5;
    if (t < 2.6) return t < 1.2 ? 0.4 : 0.55;
    if (t < 3.0) return 0.5;
    if (t < 11.0) return t < 5.5 ? 0.15 : 0.24;
    if (t < 11.2) return 0.5;
    if (t < 15.6) return 0.2;
    if (t < 15.9) return 0.5;
    return t < 17.4 ? 0.2 : 0.45;
  };
  const C = { size: 100, y: 0.205, bg: 'rgba(0,0,0,0.45)' };
  const L = [
    [3.05, 3.9, '1', 'ВСПЫШКА', 'свет бьёт по всему двору'],
    [3.9, 5.3, '2', 'УДАРНАЯ ВОЛНА', 'кольца идут по асфальту'],
    [5.3, 7.0, '3', 'ОГНЕННЫЙ ШАР', 'растёт, гаснет, греет всё вокруг'],
    [7.0, 8.9, '4', 'ОСКОЛКИ', 'обломки летят и падают'],
    [8.9, 10.9, '5', 'ГУСТОЙ ДЫМ', 'поднимается и застилает сцену'],
    [11.4, 14.2, '6', 'ОГЛУШЕНИЕ', 'рядом с взрывом картинка плывёт\nи звенит в ушах']
  ];
  const caps = [{ t0: 0.0, t1: 2.5, text: 'ОДИН ВЗРЫВ =\n*6 ЭФФЕКТОВ*', size: 150, y: 0.205, bg: 'rgba(0,0,0,0.4)' }];
  L.forEach((q) => caps.push(Object.assign({}, C, { t0: q[0], t1: q[1], text: '*' + q[2] + '*  ' + q[3] + '\n' + q[4], size: 92 })));
  caps.push(Object.assign({}, C, { t0: 15.95, t1: 18.2, text: 'И всё это считает\n*обычный браузер*', size: 104 }));

  const shots = [
    [0, 2.6, { p: [0.0, 1.5, 9.5], l: [0.0, 1.5, -3.5], f: 58 }, { p: [0.1, 1.45, 8.4], l: [0.0, 1.5, -3.5], f: 52 }],
    [2.6, 11.0, { p: [-6.5, 1.1, 6.5], l: [0.2, 1.7, -3.0], f: 58 }, { p: [4.5, 1.3, 7.5], l: [0.2, 1.7, -3.0], f: 58 }],
    [11.0, 15.6, { p: [0.0, 1.5, 6.2], l: [0.4, 1.2, 1.6], f: 62 }, { p: [0.0, 1.5, 6.6], l: [0.4, 1.2, 1.6], f: 62 }],
    [15.6, 18.4, { p: [0.0, 1.6, 9.0], l: [0.0, 2.2, -11], f: 60 }, { p: [0.0, 1.8, 10.5], l: [0.0, 2.4, -11], f: 62 }],
    [18.4, 22.5, { p: [0.0, 1.8, 10.5], l: [0.0, 2.4, -11], f: 62 }, { p: [0.0, 1.8, 11.5], l: [0.0, 2.4, -11], f: 60 }]
  ];
  const lerp = (a, b, k) => a + (b - a) * k;
  const camAt = (t) => {
    const s = shots.find((q) => t >= q[0] && t < q[1]) || shots[shots.length - 1];
    const k = Cap.ease(Cap.clamp((t - s[0]) / (s[1] - s[0]), 0, 1)), a = s[2], b = s[3];
    return [lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2], b.p[2], k), lerp(a.l[0], b.l[0], k), lerp(a.l[1], b.l[1], k), lerp(a.l[2], b.l[2], k), lerp(a.f, b.f, k)];
  };

  const audio = async (C2) => {
    await C2.addAudio('/assets/fight1.mp3', { at: 0, from: 80, dur: DUR, gain: 0.4, fadeIn: 0.15, fadeOut: 1.8 });
    const jobs = [];
    const sfx = (url, t, g) => jobs.push(C2.addAudio(url, { at: t, gain: g }));
    sfx('/assets/explosion.mp3', 0.2, 1.0); sfx('/assets/explosion.mp3', 3.0, 1.0); sfx('/assets/explosion.mp3', 11.2, 1.0); sfx('/assets/explosion.mp3', 15.9, 1.0);
    for (let i = 0; i < L.length; i += 1) sfx('/assets/neon.mp3', L[i][0], 0.3);
    sfx('/assets/glitch2.mp3', END, 0.5);
    await Promise.all(jobs);
  };

  return Scn.film(o.name || 'v2_explosion', DUR, async (t) => {
    ev.forEach((e) => { if (!e.done && t >= e.t) { e.done = true; e.fn(); } });
    const c = camAt(t);
    const kick = BANG.reduce((m, f) => (t >= f && t < f + 0.25 ? Math.max(m, 1 - (t - f) / 0.25) : m), 0);
    Scn.cam(c[0] + (Math.random() - 0.5) * 0.05 * kick, c[1] + (Math.random() - 0.5) * 0.05 * kick, c[2], c[3], c[4], c[5], c[6] - 4 * kick, 0);
    Scn.advance(slow(t) / FPS);
    const ctx = Scn.frame({ zoom: 1 + 0.05 * kick, vig: 0.55 });
    Scn.caps(ctx, t, caps);
    if (t > 0.5 && t < END) Scn.badge(ctx, t - 0.5);
    if (t >= END) Cap.endCard(ctx, t - END);
  }, { audio, snaps: o.snaps || [0.5, 1.0, 5.5, 9.5, 12.5, 17.0], sheets: o.sheets || [{ t0: 2.8, t1: 15.6, every: 8, cols: 8, tw: 135 }] });
};
