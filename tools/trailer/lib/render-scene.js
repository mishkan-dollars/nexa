#!/usr/bin/env node
// NEXA: рендер одной сцены трейлера → клипы нарезок (MP4, H.264, 30 fps) в --out.
//   node tools/trailer/lib/render-scene.js --scene tools/trailer/scenes/corridor.js --name corridor --out tools/trailer/out/clips
//        [--cuts a,b] [--w 1920 --h 1080] [--quality HIGH] [--crf 14] [--fps 30|60] [--place place.json]
// Превью — 30 fps (--fps 30), финал — 60 fps. --place: JSON {cutId:{frames, g0}} (точное число кадров и время первого кадра в трейлере, нужно для финала).
// Сцена регистрируется через Trl.scene(name, spec) (см. tools/trailer/README.md). Нужен запущенный сервер игры: node tools/serve.js 8765.
// Кадры не пишутся на диск: страница отдаёт JPEG, Node кормит ими ffmpeg (по одному процессу на нарезку).
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { openGame, ROOT } = require('./browser');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const SCENE = arg('scene'), NAME = arg('name'), OUT = path.resolve(arg('out', path.join(ROOT, 'tools', 'trailer', 'out', 'clips')));
const W = Number(arg('w', 1920)), H = Number(arg('h', 1080)), Q = arg('quality', 'HIGH'), CRF = arg('crf', '14'), FPS = Number(arg('fps', 30));
const CUTS = arg('cuts', '') ? arg('cuts').split(',') : null, PR = arg('pr', null), PLACE = arg('place', null), SBP = arg('sb', null);
if (!SCENE || !NAME) { console.error('usage: render-scene.js --scene file.js --name sceneName --out dir'); process.exit(2); }

const music = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'trailer', 'music', 'beats.json'), 'utf8'));
const place = PLACE ? JSON.parse(fs.readFileSync(path.resolve(PLACE), 'utf8')) : null;
const encoders = {};
const startEncoder = (id) => {
  const file = path.join(OUT, NAME + '__' + id + '.mp4');
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-vf', 'scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', CRF, '-g', String(FPS), '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const e = { ff, file, frames: 0, done: new Promise((res) => ff.on('close', res)) };
  ff.stdin.on('error', () => {});
  return e;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const g = await openGame({ w: W, h: H, quality: Q, music, fx: true });
  const page = g.page;
  await page.exposeFunction('__trlSend', async (id, i, dataUrl) => {
    const e = encoders[id] || (encoders[id] = startEncoder(id));
    const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    if (!e.ff.stdin.write(buf)) await new Promise((res) => e.ff.stdin.once('drain', res));
    e.frames += 1;
  });
  const sbFile = SBP ? path.resolve(SBP) : path.join(ROOT, 'tools', 'trailer', 'storyboard.json');
  if (place && fs.existsSync(sbFile)) { const sb = JSON.parse(fs.readFileSync(sbFile, 'utf8')); if (sb.post) await page.evaluate((p) => window.Trl.setPost(p), sb.post); }
  await page.addScriptTag({ path: path.resolve(SCENE) });
  const t0 = Date.now();
  const res = await page.evaluate(async (a) => window.Trl.runScene(a.name, { cuts: a.cuts, fps: a.fps, pr: a.pr, send: (id, i, d) => window.__trlSend(id, i, d), place: a.place }),
    { name: NAME, cuts: CUTS, fps: FPS, pr: PR ? Number(PR) : undefined, place });
  await g.close();
  for (const id of Object.keys(encoders)) encoders[id].ff.stdin.end();
  await Promise.all(Object.keys(encoders).map((id) => encoders[id].done));
  const manifest = { scene: NAME, w: W, h: H, fps: FPS, quality: Q, ms: Date.now() - t0, cuts: {} };
  Object.keys(encoders).forEach((id) => { manifest.cuts[id] = { file: path.relative(ROOT, encoders[id].file), frames: encoders[id].frames, cam: res.cam && res.cam[id], events: res.events && res.events[id] }; });
  manifest.placed = !!place;
  fs.writeFileSync(path.join(OUT, NAME + '.json'), JSON.stringify(manifest, null, 1));
  console.log(JSON.stringify({ scene: NAME, ms: manifest.ms, sim: { ms: res.ms, frames: res.frames }, cuts: Object.fromEntries(Object.entries(manifest.cuts).map(([k, v]) => [k, { file: v.file, frames: v.frames }])) }));
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
