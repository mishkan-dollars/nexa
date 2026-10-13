// Ролик 3: «У каждого врага свой характер» — личности ботов (js/personas.js). ~25 с.
// Хук: шеренга статистов с метками; дальше по одному: живой ИИ, враг стреляет в камеру (игрок = камера); финал — общий бой.
window.Shorts = window.Shorts || {};
Shorts.v3 = async (o) => {
  o = o || {};
  const r = Scn.r;
  Scn.enter('plaza', 0, 0, 0);
  Scn.clear();
  const DUR = 25.4, FPS = Scn.FPS, END = 21.2, SLOT = 2.6, T0 = 2.6;
  const CAM = [0, 1.55, 6.0];
  r.p.x = CAM[0]; r.p.z = CAM[2]; r.p.yaw = 0;
  // [id, тип, метка, подсказка, дистанция (z), x]
  const P = [
    ['panic', 'grunt', 'ПАНИКЁР', 'стреляет много и мажет,\nраненый — пятится', -2.0, 0.8],
    ['sniper', 'grunt', 'СНАЙПЕР', 'лазерный прицел и\nсмена позиции', -8.5, -1.0],
    ['officer', 'grunt', 'ОФИЦЕР', 'командует и толкает\nсвоих в бой', -3.5, 0.0],
    ['jugg', 'heavy', 'ДЖАГГЕРНАУТ', 'огромный, медленный,\nпочти непробиваемый', -5.5, -0.6],
    ['zealot', 'grunt', 'ФАНАТИК', 'впадает в ярость,\nкогда гибнет союзник', -5.0, 0.7],
    ['tech', 'grunt', 'ИНЖЕНЕР', 'чинит раненых\nприсев в укрытии', -3.0, -0.4]
  ];
  const ev = [];
  const at = (t, fn) => ev.push({ t, fn, done: false });
  let lineup = [], cur = null;
  // хук: шеренга статистов (живой ИИ выключен — видны позы)
  at(0.0, () => {
    lineup = P.map((q, i) => Scn.guard(q[1], -3.3 + i * 1.32, -4.6 - (i % 2) * 1.7, 0, { pers: q[0] }));
  });
  P.forEach((q, i) => {
    const t = T0 + i * SLOT;
    at(t, () => {
      Scn.clear(); lineup = [];
      cur = r.enemy(q[1], q[5], q[4], { drop: false, yaw: 0, exact: true, pers: q[0], tag: 'film' });
      cur.spawnT = 0;
    });
  });
  // финал: общий бой
  at(T0 + P.length * SLOT, () => {
    Scn.clear(); cur = null;
    ['panic', 'sniper', 'officer', 'jugg', 'zealot', 'tech', 'pro', 'sadist'].forEach((id, i) => {
      const x = -7 + i * 2, z = -6 - (i % 3) * 2.2;
      r.enemy(id === 'jugg' ? 'heavy' : 'grunt', x, z, { drop: false, yaw: 0, exact: true, pers: id, tag: 'film' });
    });
  });

  const caps = [{ t0: 0.0, t1: 2.5, text: 'У КАЖДОГО ВРАГА\n*СВОЙ ХАРАКТЕР*', size: 120, y: 0.205, bg: 'rgba(0,0,0,0.4)' }];
  P.forEach((q, i) => caps.push({ t0: T0 + i * SLOT + 0.05, t1: T0 + (i + 1) * SLOT - 0.05, text: '*' + q[2] + '*\n' + q[3], size: 96, y: 0.205, bg: 'rgba(0,0,0,0.45)' }));
  const FIN = T0 + P.length * SLOT;
  caps.push({ t0: FIN + 0.1, t1: END - 0.1, text: '10 характеров —\n*каждый бой другой*', size: 110, y: 0.205, bg: 'rgba(0,0,0,0.45)' });

  const audio = async (C2) => {
    await C2.addAudio('/assets/fight1.mp3', { at: 0, from: 100, dur: DUR, gain: 0.42, fadeIn: 0.15, fadeOut: 1.8 });
    const jobs = [];
    P.forEach((q, i) => { jobs.push(C2.addAudio('/assets/neon.mp3', { at: T0 + i * SLOT, gain: 0.35 })); jobs.push(C2.addAudio('/assets/glock.mp3', { at: T0 + i * SLOT + 0.9, gain: 0.5 })); });
    jobs.push(C2.addAudio('/assets/glitch2.mp3', { at: END, gain: 0.5 }));
    await Promise.all(jobs);
  };

  return Scn.film(o.name || 'v3_personalities', DUR, async (t) => {
    ev.forEach((e) => { if (!e.done && t >= e.t) { e.done = true; e.fn(); } });
    if (t < T0 || t >= FIN) { r.p.x = CAM[0]; r.p.z = CAM[2]; }
    // камера: хук — общий план шеренги; слоты — на персонаже; финал — общий
    if (t < T0) {
      const k = Cap.ease(t / T0);
      Scn.cam(0, 1.6 - 0.1 * k, 8.5 - 1.5 * k, 0, 1.2, -4.5, 62, 0);
    } else if (t < FIN && cur) {
      const g = cur.n.g.position, hv = cur.type === 'heavy', cz = P[Math.min(P.length - 1, Math.floor((t - T0) / SLOT))][4] + (hv ? 9.5 : 7.5);
      r.p.x = 0; r.p.z = cz;                                   // игрок = камера: пули и лазеры летят в зрителя
      Scn.cam(0.0, 1.5, cz, g.x * 0.7, 1.15 + (hv ? 0.25 : 0), g.z, 40, 0);
    } else if (t < END) {
      Scn.cam(0, 1.7, 9.0, 0, 1.2, -6, 64, 0);
    } else Scn.cam(0, 1.7, 9.0, 0, 1.2, -6, 64, 0);
    Scn.advance((t < T0 ? 0.35 : 0.7) / FPS);
    const ctx = Scn.frame({ vig: 0.55 });
    // метки над головами (в хуке — у всех, в слотах — у текущего)
    if (t < T0) lineup.forEach((e, i) => { if (!e.dead) { const p = Scn.proj(e.n.g.position.x, 2.35 * (e.t.scale || 1), e.n.g.position.z); if (p.vis) Cap.tag(ctx, P[i][2], p.x, p.y - (i % 2) * 52, { size: 26, alpha: Cap.clamp((t - 0.3) / 0.4, 0, 1) }); } });
    Scn.caps(ctx, t, caps);
    if (t > 0.5 && t < END) Scn.badge(ctx, t - 0.5);
    if (t >= END) Cap.endCard(ctx, t - END);
    // вспышка на склейках
    for (let i = 0; i <= P.length; i += 1) { const ts = T0 + i * SLOT; if (t >= ts && t < ts + 0.12) Cap.flash(ctx, 0.35 * (1 - (t - ts) / 0.12), '#fff'); }
  }, { audio, snaps: o.snaps || [0.4, 1.6, 4.0, 6.5, 9.5, 12.0, 15.0, 18.5], sheets: o.sheets || [{ t0: 2.6, t1: 10.4, every: 6, cols: 8, tw: 135 }] });
};
