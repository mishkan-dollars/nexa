#!/usr/bin/env node
// NEXA: звуковая дорожка трейлера → out/audio/mix.wav (48 кГц, стерео). Всё — из имеющегося: трек shorts/betatrailer.m4a + звуки игры из assets/*.mp3
// (выстрелы, взрывы, удары, шаги), никакой новой озвучки. Смешивание — в Node (f32), ffmpeg только декодирует и пишет WAV.
//   node tools/trailer/lib/mix-audio.js [--sfx 0.9] [--music 1.0]
// Что кладём на таймлайн:
//   • «бас-удары» на каждое слово карточек (глубокий взрыв: assets/explosion.mp3, замедлен и срезан по низу) + глитч на сильных ударах;
//   • обратный взрыв (riser) перед сменой секций из storyboard.sfx и общий удар на «дропе»;
//   • звуки геймплея по журналу событий из рендера (out/clips/<сцена>.json → cuts[id].events): выстрелы, взрывы, удары, шаги — в точный кадр.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const TL = require('./timeline');
const ROOT = TL.ROOT, SR = 48000;
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const SFX = Number(arg('sfx', 0.9)), MUSIC = Number(arg('music', 1.0)), FPS = Number(arg('fps', 60));
const SBP = arg('sb', null), OUTDIR = path.resolve(ROOT, arg('outdir', 'tools/trailer/out'));
const { sb, music } = TL.load(SBP ? path.resolve(SBP) : undefined);
const lay = TL.layout(Object.assign({}, sb, { fps: FPS }), music);

const decode = (file, ch) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', String(ch), '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error('decode ' + file + ': ' + String(r.stderr));
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4));
};
const cache = {};
const asset = (name) => cache[name] || (cache[name] = decode(path.join(ROOT, 'assets', name), 1));   // моно
const total = Math.ceil((lay.total / FPS + 1.5) * SR);
const L = new Float32Array(total), R = new Float32Array(total);

// ---- простые обработки (моно-буфер → моно-буфер)
const resample = (x, rate) => { const n = Math.floor(x.length / rate), y = new Float32Array(n); for (let i = 0; i < n; i += 1) { const p = i * rate, j = Math.floor(p), f = p - j; y[i] = x[j] * (1 - f) + (x[j + 1] || 0) * f; } return y; };
const lowpass = (x, fc, order) => { let y = x; for (let k = 0; k < (order || 2); k += 1) { const a = 1 - Math.exp(-2 * Math.PI * fc / SR), z = new Float32Array(y.length); let s = 0; for (let i = 0; i < y.length; i += 1) { s += a * (y[i] - s); z[i] = s; } y = z; } return y; };
const highpass = (x, fc) => { const lp = lowpass(x, fc, 1), y = new Float32Array(x.length); for (let i = 0; i < x.length; i += 1) y[i] = x[i] - lp[i]; return y; };
const trim = (x, sec) => x.slice(0, Math.min(x.length, Math.round(sec * SR)));
const fadeOut = (x, sec) => { const n = Math.min(x.length, Math.round(sec * SR)); const y = x.slice(); for (let i = 0; i < n; i += 1) y[y.length - 1 - i] *= i / n; return y; };
const reverse = (x) => x.slice().reverse();
const gain = (x, g) => { const y = new Float32Array(x.length); for (let i = 0; i < x.length; i += 1) y[i] = x[i] * g; return y; };
const add = (x, t, g, pan) => {   // накладываем моно x в момент t (с); pan −1..1
  const start = Math.round(t * SR), pl = Math.cos((((pan || 0) + 1) / 4) * Math.PI) * g, pr = Math.sin((((pan || 0) + 1) / 4) * Math.PI) * g;
  for (let i = 0; i < x.length; i += 1) { const j = start + i; if (j < 0 || j >= total) continue; L[j] += x[i] * pl; R[j] += x[i] * pr; }
};

// ---- музыка
const mus = decode(path.join(ROOT, 'shorts', 'betatrailer.m4a'), 2);
for (let i = 0; i < Math.min(total, mus.length / 2); i += 1) { L[i] += mus[i * 2] * MUSIC; R[i] += mus[i * 2 + 1] * MUSIC; }

// ---- заготовки
let subBoom = null;
const boom = (deep) => {   // глубокий бас-удар из explosion.mp3: замедление, срез верхов, затухание
  if (!subBoom) subBoom = fadeOut(trim(lowpass(resample(asset('explosion.mp3'), 0.62), 150, 3), 0.7), 0.35);
  return deep ? subBoom : fadeOut(trim(lowpass(resample(asset('explosion.mp3'), 0.8), 600, 2), 0.5), 0.25);
};
const beatT = (b) => TL.beatTime(music, b);

// ---- 1) карточки: бас-удар на каждое слово
let nHits = 0;
lay.segs.filter((s) => s.type === 'card').forEach((s) => {
  (s.words || []).forEach((w, i) => {
    const t = beatT(w.b);
    if (w.lines) { w.lines.forEach((ln, k) => { if (ln.hit === false) return; add(boom(true), t + (ln.delay || 0), (k === 0 ? 0.9 : 0.55) * SFX, 0); add(highpass(trim(asset('bodyhit.mp3'), 0.3), 1200), t + (ln.delay || 0), 0.18 * SFX, 0); nHits += 1; }); return; }
    add(boom(true), t, 0.85 * SFX, 0); nHits += 1;
    add(highpass(trim(asset('bodyhit.mp3'), 0.3), 1200), t, 0.22 * SFX, 0);   // короткий «щелчок» удара
    if (w.glitch !== false && (i % 4 === 0 || w.big)) add(asset('glitch' + (2 + (i % 3)) + '.mp3'), t, 0.18 * SFX, (i % 2 ? 0.2 : -0.2));
  });
});

// ---- 2) явные звуки из storyboard.sfx: [{b|t, file, gain, rate, reverse, lp, hp, len}]
(sb.sfx || []).forEach((e) => {
  let x = asset(e.file);
  if (e.rate) x = resample(x, e.rate);
  if (e.lp) x = lowpass(x, e.lp, 2);
  if (e.hp) x = highpass(x, e.hp);
  if (e.len) x = fadeOut(trim(x, e.len), Math.min(0.3, e.len / 2));
  if (e.reverse) x = reverse(x);
  const t = e.t !== undefined ? e.t : beatT(e.b);
  add(x, e.reverse ? t - x.length / SR : t, (e.gain === undefined ? 0.8 : e.gain) * SFX, e.pan || 0);
});

// ---- 3) геймплей по журналу событий рендера
const SHOT = { pistol: 'glock.mp3', glock: 'glock.mp3', ak: 'ak47.mp3', shotgun: 'shotgun.mp3', epistol: 'glock.mp3', erifle: 'ak47.mp3', elmg: 'ak47.mp3' };
const GAIN = { pistol: 0.5, glock: 0.5, ak: 0.45, shotgun: 0.7, epistol: 0.16, erifle: 0.16, elmg: 0.18 };
let nEv = 0;
const lastShot = {};
lay.segs.filter((s) => s.type === 'cut').forEach((s) => {
  const man = path.join(OUTDIR, 'clips', s.scene + '.json');
  if (!fs.existsSync(man)) return;
  const c = JSON.parse(fs.readFileSync(man, 'utf8')).cuts[s.cut];
  if (!c || !c.events) return;
  const g0 = s.f0 / FPS;
  c.events.forEach((e) => {
    const t = g0 + e.rel, dist = e.d || 0, att = 1 / (1 + dist * 0.07);
    let x = null, g = 0;
    if (e.k === 'blast' || (e.k === 'play' && e.a === 'boom')) { x = asset('explosion.mp3'); g = (e.k === 'blast' ? 0.8 : 0.45) * (0.6 + 0.4 * att); if (e.k === 'blast') add(boom(true), t, 0.7 * SFX * att, 0); }
    else if (e.k === 'shot' && SHOT[e.a]) {
      const key = e.a + Math.round(t * 20);   // слои одного и того же кадра не множим (очередь врагов)
      if (lastShot[key]) return; lastShot[key] = true;
      x = trim(asset(SHOT[e.a]), e.a === 'shotgun' ? 1.2 : 0.7); g = (GAIN[e.a] || 0.3) * (0.5 + 0.5 * att); if (dist > 18) x = lowpass(x, 2500, 1);
    } else if (e.k === 'play' && (e.a === 'flesh' || e.a === 'bone' || e.a === 'head' || e.a === 'hit')) { x = trim(asset('bodyhit.mp3'), 0.5); g = 0.28 * att; }
    else if (e.k === 'play' && e.a === 'footstep') { x = trim(asset('footstep.mp3'), 0.5); g = 0.2; }
    else if (e.k === 'play' && e.a === 'kill') { x = trim(asset('enemydeath.mp3'), 0.8); g = 0.2 * att; }
    if (x) { add(x, t, g * SFX, ((hashPan(e.t) * 2) - 1) * 0.35); nEv += 1; }
  });
});
function hashPan(v) { const s = Math.sin((v || 0) * 91.7) * 43758.5453; return s - Math.floor(s); }

// ---- мягкий лимитер и запись
let peak = 0; for (let i = 0; i < total; i += 1) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const lim = peak > 0.97 ? 0.97 / peak : 1;
const out = Buffer.alloc(total * 2 * 4), view = new Float32Array(out.buffer, out.byteOffset, total * 2);
for (let i = 0; i < total; i += 1) {
  // tanh-насыщение выше порога 0.8: громкие совпадения (взрыв + бит) не рвутся
  const sat = (v) => { v *= lim; const a = Math.abs(v); return a <= 0.8 ? v : Math.sign(v) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2)); };
  view[i * 2] = sat(L[i]); view[i * 2 + 1] = sat(R[i]);
}
const dir = path.join(OUTDIR, 'audio'); fs.mkdirSync(dir, { recursive: true });
const raw = path.join(dir, 'mix.f32'), wav = path.join(dir, 'mix.wav');
fs.writeFileSync(raw, out);
const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', raw, '-c:a', 'pcm_s16le', wav]);
fs.unlinkSync(raw);
console.log(JSON.stringify({ wav: path.relative(ROOT, wav), code: r.status, sec: +(total / SR).toFixed(2), peakBefore: +peak.toFixed(3), cardHits: nHits, gameplayEvents: nEv }));
