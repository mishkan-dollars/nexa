#!/usr/bin/env node
// NEXA: рендер чёрных карточек трейлера (титры «под бас» на чёрном) → out/cards/<id>.mp4, кадр-в-кадр по таймлайну storyboard.json.
//   node tools/trailer/lib/render-cards.js [--sb tools/trailer/storyboard.json] [--only id1,id2] [--w 1920 --h 1080] [--fps 60]
// Игра не нужна: холст + page/fx.js. Слово появляется на своей доле (`b` — номер доли трека, 0 = 0.242 с) и держится до следующего.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { openGame, ROOT } = require('./browser');
const TL = require('./timeline');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const SB = path.resolve(arg('sb', path.join(ROOT, 'tools', 'trailer', 'storyboard.json'))), W = Number(arg('w', 1920)), H = Number(arg('h', 1080));
const ONLY = arg('only', '') ? arg('only').split(',') : null, OUT = path.resolve(arg('out', path.join(ROOT, 'tools', 'trailer', 'out', 'cards')));
const { sb, music } = TL.load(SB);
const LAY = TL.layout(Object.assign({}, sb, { fps: Number(arg('fps', sb.fps || 60)) }), music), FPS = LAY.fps;
const cards = LAY.segs.filter((s) => s.type === 'card' && (!ONLY || ONLY.includes(s.id)));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // шрифты (Oswald) приходят вместе со страницей самой игры (index.html), как при обычной игре — отдельно ничего не качаем
  const g = await openGame({ w: W, h: H, quality: 'LOW', music });
  const page = g.page, browser = g.browser;
  await page.addScriptTag({ path: path.join(ROOT, 'tools', 'trailer', 'page', 'fx.js') });
  await page.evaluate(({ W, H }) => { const cv = document.createElement('canvas'); cv.id = 'trlcards'; cv.width = W; cv.height = H; document.body.appendChild(cv); return Promise.all([document.fonts.load('700 100px Oswald'), document.fonts.load('500 40px Oswald')]).catch(() => {}); }, { W, H });
  for (const seg of cards) {
    const frames = seg.frames, startFrame = seg.f0;
    const file = path.join(OUT, seg.id + '.mp4');
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
      '-vf', 'scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-g', String(FPS),
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res) => ff.on('close', res));
    ff.stdin.on('error', () => {});
    const words = seg.words.map((w) => Object.assign({}, w, { at: music.offset + w.b * music.beat }));
    // кадры пачками: JPEG из страницы → ffmpeg
    for (let f0 = 0; f0 < frames; f0 += 12) {
      const urls = await page.evaluate(({ f0, f1, startFrame, FPS, words, seg, W, H }) => {
        const cv = document.getElementById('trlcards'), ctx = cv.getContext('2d'), out = [];
        for (let f = f0; f < f1; f += 1) {
          const gf = startFrame + f, t = gf / FPS;
          let wi = -1; for (let i = 0; i < words.length; i += 1) if (t + 1e-6 >= words[i].at) wi = i;
          Fx.black(ctx, gf);
          if (wi >= 0) {
            const w = words[wi], age = t - w.at;
            if (w.lines) w.lines.forEach((ln) => { const a = age - (ln.delay || 0); if (a >= 0) Fx.card(ctx, ln, a, Math.exp(-a * (ln.rate || 9)), gf); });   // карточка из нескольких строк с задержками
            else Fx.card(ctx, w, age, Math.exp(-age * (w.rate || 9)), gf);
          }
          Fx.finish(ctx, gf, { vig: seg.vig, grain: seg.grain });
          if (seg.fadeOutLast && t > seg.fadeFrom) Fx.flash(ctx, Math.min(1, (t - seg.fadeFrom) / 0.2), '#000');
          out.push(cv.toDataURL('image/jpeg', 0.95));
        }
        return out;
      }, { f0, f1: Math.min(frames, f0 + 12), startFrame, FPS, words, seg, W, H });
      for (const u of urls) { const buf = Buffer.from(u.slice(u.indexOf(',') + 1), 'base64'); if (!ff.stdin.write(buf)) await new Promise((res) => ff.stdin.once('drain', res)); }
    }
    ff.stdin.end(); await done;
    console.log(JSON.stringify({ card: seg.id, frames, startFrame, file: path.relative(ROOT, file) }));
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
