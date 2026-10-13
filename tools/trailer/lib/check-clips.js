#!/usr/bin/env node
// NEXA: проверка отснятых нарезок. По журналу камеры (манифест render-scene) считает плавность, по кадрам — яркость,
// и делает контактные листы (по 12 кадров на нарезку) для просмотра глазами.
//   node tools/trailer/lib/check-clips.js tools/trailer/out/clips/<scene>.json [--sheets tools/trailer/out/preview]
// Пороги (рекомендуемые): p95 второй разности направления < 0.015 рад, максимум < 0.05 рад (кроме намеренного «рывка»),
// скачок позиции камеры между кадрами < 0.6 м (без телепортов), яркость кадра (Y) в среднем 18…225.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');

const file = process.argv[2];
const sheetsIdx = process.argv.indexOf('--sheets');
const SHEETS = sheetsIdx >= 0 ? path.resolve(process.argv[sheetsIdx + 1]) : path.join(ROOT, 'tools', 'trailer', 'out', 'preview');
if (!file) { console.error('usage: check-clips.js manifest.json [--sheets dir]'); process.exit(2); }
const man = JSON.parse(fs.readFileSync(file, 'utf8'));
const fps = man.fps || 30;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const pct = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };

const report = { scene: man.scene, cuts: {} };
fs.mkdirSync(SHEETS, { recursive: true });
for (const id of Object.keys(man.cuts)) {
  const c = man.cuts[id], cam = c.cam || [], out = { frames: c.frames, sec: +(c.frames / fps).toFixed(2), flags: [] };
  // плавность камеры
  if (cam.length > 3) {
    const ang = [], d2 = [], sp = [], fov = [];
    for (let i = 1; i < cam.length; i += 1) {
      ang.push(Math.acos(Math.max(-1, Math.min(1, dot(cam[i - 1].slice(3, 6), cam[i].slice(3, 6))))));
      sp.push(Math.hypot(cam[i][0] - cam[i - 1][0], cam[i][1] - cam[i - 1][1], cam[i][2] - cam[i - 1][2]));
      fov.push(Math.abs(cam[i][6] - cam[i - 1][6]));
    }
    for (let i = 1; i < cam.length - 1; i += 1) {
      const a = cam[i - 1], b = cam[i], d = cam[i + 1];
      d2.push(Math.hypot(d[3] - 2 * b[3] + a[3], d[4] - 2 * b[4] + a[4], d[5] - 2 * b[5] + a[5]) * Math.pow(fps / 30, 2));   // нормировка на 30 fps
    }
    out.camera = {
      maxTurnDegPerSec: +(Math.max(...ang) * fps * 180 / Math.PI).toFixed(0),
      dirSecondDiff: { p95: +pct(d2, 0.95).toFixed(4), max: +Math.max(...d2).toFixed(4) },
      maxStepM: +(Math.max(...sp) * fps / 30).toFixed(3), maxSpeedMS: +(Math.max(...sp) * fps).toFixed(2),
      moved: +sp.reduce((s, v) => s + v, 0).toFixed(2), turned: +(ang.reduce((s, v) => s + v, 0) * 180 / Math.PI).toFixed(0), maxFovStep: +Math.max(...fov).toFixed(2)
    };
    if (out.camera.dirSecondDiff.p95 > 0.015) out.flags.push('дрожь/рваный взгляд (p95 второй разности > 0.015)');
    if (out.camera.dirSecondDiff.max > 0.05) out.flags.push('резкий рывок взгляда (max второй разности > 0.05)');
    if (out.camera.maxStepM > 0.6) out.flags.push('скачок позиции камеры > 0.6 м за кадр (телепорт?)');
    if (out.camera.moved < 0.05 && out.camera.turned < 2) out.flags.push('камера статична (нужно плавное движение)');
  } else out.flags.push('нет журнала камеры');
  // яркость кадров
  const mp4 = path.join(ROOT, c.file);
  if (fs.existsSync(mp4)) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', mp4, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { encoding: 'utf8' });
    const ys = (r.stdout || '').split('\n').map((l) => /YAVG=([\d.]+)/.exec(l)).filter(Boolean).map((m) => Number(m[1]));
    if (ys.length) {
      out.luma = { mean: +(ys.reduce((s, v) => s + v, 0) / ys.length).toFixed(1), min: +Math.min(...ys).toFixed(1), max: +Math.max(...ys).toFixed(1) };
      if (out.luma.mean < 18) out.flags.push('слишком тёмный кадр');
      if (out.luma.mean > 225) out.flags.push('пересвет');
      let jump = 0; for (let i = 1; i < ys.length; i += 1) jump = Math.max(jump, Math.abs(ys[i] - ys[i - 1]));
      out.luma.maxJump = +jump.toFixed(1);
    }
    // контактный лист
    const sheet = path.join(SHEETS, man.scene + '__' + id + '.jpg');
    const n = Math.max(1, c.frames), every = Math.max(1, Math.floor(n / 12));
    spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', mp4, '-vf', `select=not(mod(n\\,${every})),scale=480:-1,tile=4x3`, '-frames:v', '1', '-q:v', '3', sheet]);
    out.sheet = path.relative(ROOT, sheet);
  } else out.flags.push('нет файла клипа');
  report.cuts[id] = out;
}
console.log(JSON.stringify(report, null, 1));
