// Ролик 5: «Этот танец — 500 кадров». Комната предпросмотра эмоции (js/emote-room.js), покадровый шаг. ~21 с.
// Музыка танца (assets/dance1.mp3) ставится в момент, когда комната запускает танец (pv.started).
window.Shorts = window.Shorts || {};
Shorts.v5 = async (o) => {
  o = o || {};
  const E = window.Emote;
  try { E.closePreview(); } catch (e) { /* не открыта */ }
  E.openPreview(o.track || 'emote_beat');
  for (let i = 0; i < 60 && !(E._room() && E._room().ready); i += 1) await new Promise((res) => setTimeout(res, 250));
  const pv = E._room();
  if (!pv) throw new Error('комната предпросмотра не открылась');
  cancelAnimationFrame(pv.raf);                              // реальный rAF не нужен: шагаем сами
  const cv = pv.el.querySelector('.tp-canvas');
  const DUR = 21.6, FPS = Scn.FPS, T_DANCE = 14.93, END = 17.8;
  let tStart = null;
  const caps = [
    { t0: 0.0, t1: 2.5, text: 'ЭТОТ ТАНЕЦ —\n*500 КАДРОВ*', size: 140, y: 0.205, bg: 'rgba(0,0,0,0.4)' },
    { t0: 2.7, t1: 6.2, text: 'Каждая поза —\n*ключевой кадр*', size: 100, y: 0.205, bg: 'rgba(0,0,0,0.45)' },
    { t0: 6.3, t1: 10.0, text: '15 суставов, колени\nи локти *не гнутся назад*', size: 92, y: 0.2, bg: 'rgba(0,0,0,0.45)' },
    { t0: 10.1, t1: 13.7, text: 'Бас музыки\n*толкает камеру и свет*', size: 100, y: 0.205, bg: 'rgba(0,0,0,0.45)' },
    { t0: 13.8, t1: 17.6, text: '*3 танца* —\nуже в бета-тесте', size: 110, y: 0.205, bg: 'rgba(0,0,0,0.45)' }
  ];
  const audioAfter = async (C2) => {
    const jobs = [];
    const ts = tStart === null ? 2.6 : tStart;
    jobs.push(C2.addAudio('/assets/dance1.mp3', { at: ts, dur: Math.max(0, END - ts), gain: 1.0, fadeOut: 1.2 }));
    jobs.push(C2.addAudio('/assets/heartbeat.mp3', { at: 0.4, gain: 0.8 }));
    jobs.push(C2.addAudio('/assets/heartbeat.mp3', { at: 1.2, gain: 0.8 }));
    jobs.push(C2.addAudio('/assets/neon.mp3', { at: 0.3, gain: 0.4 }));
    jobs.push(C2.addAudio('/assets/glitch2.mp3', { at: END, gain: 0.5 }));
    await Promise.all(jobs);
  };
  const res = await Scn.film(o.name || 'v5_dance500', DUR, async (t) => {
    // шаг комнаты: после конца сцены (END) просто крутим дальше
    E._roomStep(1 / FPS);
    if (tStart === null && pv.started) tStart = t;
    Cap.blit(null, { canvas: cv, zoom: 1.0 });
    const ctx = Cap.S.ctx;
    Cap.vignette(ctx, 0.35);
    Scn.caps(ctx, t, caps.map((c) => Object.assign({ noShift: true }, c)));
    if (t > 0.5 && t < END) Scn.badge(ctx, t - 0.5);
    if (t >= END) Cap.endCard(ctx, t - END);
  }, { audioAfter, snaps: o.snaps || [0.5, 2.0, 4.5, 8.0, 11.5, 15.0], sheets: o.sheets || [{ t0: 0, t1: 6, every: 6, cols: 10, tw: 108 }] });
  res.tStart = tStart;
  try { E.closePreview(); } catch (e) { /* уже закрыта */ }
  return res;
};
