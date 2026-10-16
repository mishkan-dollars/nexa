#!/usr/bin/env node
// NEXA: сборка трейлера по storyboard.json.
//   node tools/trailer/lib/build.js plan                 — проверка раскладки по долям/кадрам, tools/trailer/out/place/<сцена>.json
//   node tools/trailer/lib/build.js render [--jobs 2] [--only a_x,b_y] [--w 1920 --h 1080 --fps 60]   — рендер сцен (финал) и карточек
//   node tools/trailer/lib/build.js assemble [--out shorts/out/trailer_beta.mp4] [--crf 17]          — склейка клипов + звук → MP4
// Сцены рендерятся по одной в отдельных процессах (render-scene.js), не больше --jobs одновременно (машина 4-ядерная).
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const TL = require('./timeline');
const ROOT = TL.ROOT;

const cmd = process.argv[2] || 'plan';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const W = Number(arg('w', 1920)), H = Number(arg('h', 1080)), FPS = Number(arg('fps', 60)), JOBS = Number(arg('jobs', 2));
const ONLY = arg('only', '') ? arg('only').split(',') : null;
const OUTDIR = path.resolve(ROOT, arg('outdir', 'tools/trailer/out'));   // --outdir tools/trailer/out_test — пробная сборка в стороне от рабочей
const SBP = arg('sb', null), PRV = arg('pr', null);
const { sb, music } = TL.load(SBP ? path.resolve(SBP) : undefined);
const lay = TL.layout(Object.assign({}, sb, { fps: FPS }), music);

function plan() {
  let t = 0, prev = 0, bad = 0;
  const scenes = {}, used = {};
  lay.segs.forEach((s, i) => {
    if (s.f0 !== prev) { console.error('дыра/нахлёст перед сегментом', i, s.id || s.cut, s.f0, prev); bad += 1; }
    prev = s.f1; t += s.frames;
    if (s.type === 'cut') {
      const key = s.scene + '/' + s.cut;
      if (used[key]) { console.error('нарезка использована дважды:', key); bad += 1; }
      used[key] = true;
      (scenes[s.scene] = scenes[s.scene] || {})[s.cut] = { frames: s.frames, g0: +(s.f0 / FPS).toFixed(5), shift: s.shift || 0 };
    }
  });
  if (prev !== lay.total) { console.error('таймлайн не доходит до конца трека:', prev, 'из', lay.total); bad += 1; }
  const beats = lay.segs.reduce((n, s) => n + s.beats, 0);
  fs.mkdirSync(path.join(OUTDIR, 'place'), { recursive: true });
  Object.keys(scenes).forEach((sc) => fs.writeFileSync(path.join(OUTDIR, 'place', sc + '.json'), JSON.stringify(scenes[sc], null, 1)));
  const kinds = {}; lay.segs.forEach((s) => { kinds[s.type] = (kinds[s.type] || 0) + s.frames; });
  console.log(JSON.stringify({ fps: FPS, totalFrames: lay.total, sec: +(lay.total / FPS).toFixed(3), beatsInTimeline: beats, segments: lay.segs.length, secByType: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, +(v / FPS).toFixed(1)])), scenes: Object.keys(scenes), problems: bad }));
  return bad;
}

function run(args) {
  return new Promise((res) => { const p = spawn('node', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] }); let out = ''; p.stdout.on('data', (d) => { out += d; process.stdout.write(d); }); p.on('close', (code) => res({ code, out })); });
}

async function render() {
  if (plan()) { console.error('план с ошибками — рендер остановлен'); process.exit(1); }
  const scenes = fs.readdirSync(path.join(OUTDIR, 'place')).map((f) => f.replace(/\.json$/, '')).filter((s) => !ONLY || ONLY.includes(s));
  const queue = scenes.slice(), results = [];
  const worker = async () => {
    while (queue.length) {
      const sc = queue.shift(), file = path.join('tools', 'trailer', 'scenes', sc + '.js');
      console.log('=== render', sc);
      const r = await run(['tools/trailer/lib/render-scene.js', '--scene', file, '--name', sc, '--out', path.join(OUTDIR, 'clips'), '--w', String(W), '--h', String(H), '--fps', String(FPS), '--quality', 'HIGH', '--crf', arg('crf', '14')].concat(PRV ? ['--pr', PRV] : []).concat(SBP ? ['--sb', SBP] : []).concat([ '--place', path.join(OUTDIR, 'place', sc + '.json')]));
      results.push({ sc, code: r.code });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, JOBS) }, worker));
  if (!ONLY || ONLY.includes('cards')) { console.log('=== cards'); await run(['tools/trailer/lib/render-cards.js', '--w', String(W), '--h', String(H), '--fps', String(FPS), '--out', path.join(OUTDIR, 'cards')].concat(SBP ? ['--sb', SBP] : [])); }
  console.log(JSON.stringify(results));
}

function assemble() {
  const outFile = path.resolve(ROOT, arg('out', 'shorts/out/trailer_beta.mp4')), crf = arg('crf', '17');
  const list = [], missing = [];
  lay.segs.forEach((s) => {
    const f = s.type === 'cut' ? path.join(OUTDIR, 'clips', s.scene + '__' + s.cut + '.mp4') : path.join(OUTDIR, 'cards', s.id + '.mp4');
    if (!fs.existsSync(f)) { missing.push(f); return; }
    list.push(f);
  });
  if (missing.length) { console.error('нет клипов:\n' + missing.join('\n')); process.exit(1); }
  const txt = path.join(OUTDIR, 'concat.txt');
  fs.writeFileSync(txt, list.map((f) => "file '" + f.replace(/'/g, "'\\''") + "'").join('\n') + '\n');
  const audio = path.join(OUTDIR, 'audio', 'mix.wav'), haveMix = fs.existsSync(audio), src = haveMix ? audio : path.join(ROOT, 'shorts', 'betatrailer.m4a');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const args = ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', txt, '-i', src, '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-r', String(FPS), '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-frames:v', String(lay.total), '-movflags', '+faststart', outFile];
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  console.log(JSON.stringify({ out: path.relative(ROOT, outFile), code: r.status, mix: haveMix, bytes: fs.existsSync(outFile) ? fs.statSync(outFile).size : 0 }));
}

if (cmd === 'plan') process.exit(plan() ? 1 : 0);
else if (cmd === 'render') render();
else if (cmd === 'assemble') assemble();
else { console.error('usage: build.js plan|render|assemble'); process.exit(2); }
