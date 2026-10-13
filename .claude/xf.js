// Тест-помощник для взрывов (панель браузера скрыта → rAF стоит, игру гоним вручную через adv.js).
//   await __xboot(17)  — миссия, пропуск вступления, бот на паузе, взгляд на -Z
//   __xat(d, side)     — точка перед игроком на d метров (side — вправо)
//   await __xblast(d, R, dmg, kind, wait) — взрыв перед игроком, прокрутка wait сек, render
window.__xboot = async (id, q) => {
  (0, eval)(await (await fetch('/.claude/bot2.js?' + Date.now())).text());
  (0, eval)(await (await fetch('/.claude/adv.js?' + Date.now())).text());
  window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(e.message));
  if (q) localStorage.setItem('quality', q);
  await __B2.boot(id, { live: true });
  __hold(true);
  for (let i = 0; i < 14 && window.__r.inCinema; i += 1) await __adv(5);
  __B2.pause = true;
  const r = window.__r; r.p.yaw = 0; r.p.pitch = 0.03; r.hp = 100;
  await __adv(0.3);
  return JSON.stringify({ cin: r.inCinema, p: [r.p.x, r.p.z], q: r.qName, xf: !!r.xf });
};
// Замер громкости взрывов без звука: выход компрессора отключается от колонок и уходит в анализатор; возвращает [RMS, пик, длительность] по каждому.
window.__xaudio = async (cases) => {
  const r = window.__r, s = r.snd, A = (r.opts && r.opts.audio) || {}, sv = { sfx: A.sfxEnabled, mv: A.masterVolume };
  A.sfxEnabled = true; A.masterVolume = 0.55;
  if (!window.__an) { (s.lim || s.out).disconnect(); window.__an = s.ctx.createAnalyser(); window.__an.fftSize = 2048; (s.lim || s.out).connect(window.__an); }
  const an = window.__an, buf = new Float32Array(an.fftSize), res = {};
  const rms = () => { an.getFloatTimeDomainData(buf); let m = 0, p = 0; for (const v of buf) { m += v * v; p = Math.max(p, Math.abs(v)); } return [Math.sqrt(m / buf.length), p]; };
  const wait = (ms) => new Promise((x) => setTimeout(x, ms));
  for (const [label, fn] of cases) {
    for (let i = 0; i < 200 && rms()[0] > 0.0008; i += 1) await wait(50);
    await wait(300);
    const mx = [0, 0]; let n = 0; const t0 = performance.now(); fn(s);
    while (performance.now() - t0 < 6000) { const [a, p] = rms(); mx[0] = Math.max(mx[0], a); mx[1] = Math.max(mx[1], p); if (a > 0.002) n += 1; await wait(20); }
    res[label] = [+mx[0].toFixed(2), +mx[1].toFixed(2), +(n * 0.02).toFixed(1)];
  }
  A.sfxEnabled = sv.sfx; A.masterVolume = sv.mv;
  return JSON.stringify(res);
};
window.__xat =(d, side) => { const p = window.__r.p, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw); return [p.x + fx * d - fz * (side || 0), p.z + fz * d + fx * (side || 0)]; };
window.__xblast = async (d, R, dmg, kind, wait, y) => {
  const r = window.__r, a = __xat(d, 0);
  r.explode(a[0], y === undefined ? 0.9 : y, a[1], R, dmg, kind);
  const o = await __adv(wait || 0.3); r.render();
  return JSON.stringify({ hp: Math.round(r.hp), con: +r.xf.con.toFixed(2), light: +r.xf.light.intensity.toFixed(2), pv: [+r.xf.pv.x.toFixed(1), +r.xf.pv.z.toFixed(1)], errs: window.__errs, o });
};
