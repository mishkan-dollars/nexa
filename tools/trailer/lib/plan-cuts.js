#!/usr/bin/env node
// NEXA: подбор нарезок под скелет трейлера → storyboard.json.
//   node tools/trailer/lib/plan-cuts.js [--skeleton tools/trailer/skeleton.json] [--seed 1] [--write]
// Скелет (skeleton.json) — последовательность элементов: {kind:'span', beats, energy} — отрезок геймплея, который надо заполнить нарезками,
// и {kind:'card', id, beats, words:[{rb, text, ...}]} — чёрная карточка (rb — доля внутри карточки). Нарезки берутся из tools/trailer/scenes/*.meta.json
// (beats, type fp|free, hitAt, energy 1–5, tags), вердикты рецензентов — из tools/trailer/out/review/*.review.json (drop — не берём).
// Подбор — поиск лучом: сумма долей нарезок = длина отрезка точно; штрафы за повтор сцены/миссии подряд, бонусы за чередование FP/Free,
// совпадение энергии и посадку ключевого момента на долю (при посадке считается shift — сдвиг окна нарезки в сценарии).
'use strict';
const fs = require('fs');
const path = require('path');
const TL = require('./timeline');
const ROOT = TL.ROOT, B = () => music.beat;
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const SKEL = path.resolve(ROOT, arg('skeleton', 'tools/trailer/skeleton.json')), WRITE = process.argv.includes('--write');
let seed = Number(arg('seed', 1));
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const music = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'trailer', 'music', 'beats.json'), 'utf8'));
const skel = JSON.parse(fs.readFileSync(SKEL, 'utf8'));

// ---- нарезки
const dir = path.join(ROOT, 'tools', 'trailer', 'scenes');
const reviews = {};
const rdir = path.join(ROOT, 'tools', 'trailer', 'out', 'review');
if (fs.existsSync(rdir)) fs.readdirSync(rdir).filter((f) => f.endsWith('.review.json')).forEach((f) => { try { const j = JSON.parse(fs.readFileSync(path.join(rdir, f), 'utf8')); reviews[j.scene] = j; } catch (e) { /* битый файл */ } });
const cuts = [];
fs.readdirSync(dir).filter((f) => f.endsWith('.meta.json') && !f.startsWith('_')).forEach((f) => {
  const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  Object.keys(m.cuts || {}).forEach((id) => {
    const c = m.cuts[id], rv = reviews[m.scene] && reviews[m.scene].cuts.find((x) => x.id === id);
    if (rv && rv.verdict === 'drop') return;
    const q = rv ? (rv.verdict === 'keep' ? 1 : 0.45) : 0.8;
    cuts.push({ scene: m.scene, cut: id, mission: m.mission, beats: c.beats, type: c.type || 'free', hitAt: c.hitAt === undefined ? c.beats * B() / 2 : c.hitAt, energy: c.energy || 3, tags: c.tags || [], desc: c.desc || '', q, used: false });
  });
});

// ---- акценты трека (сильные доли) — для посадки ключевых моментов
const accentBeats = new Set((skel.accentBeats || []).map(Number));

function scoreCut(c, prev, span, startBeat, state) {
  let s = c.q * 3;
  s -= Math.abs(c.energy - span.energy) * 0.9;
  if (prev) {
    if (prev.scene === c.scene) s -= 1.4;
    if (prev.mission === c.mission) s -= 0.7;
    if (prev.type === c.type) s -= 0.5; else s += 0.4;
    if (prev.tags.includes('explosion') && c.tags.includes('explosion')) s -= 1;
  }
  // посадка ключевого момента: ближайшая доля, насколько нужен сдвиг, и бонус, если это акцент
  const hb = c.hitAt / B(), nearest = Math.round(hb), shift = c.hitAt - nearest * B();
  s -= Math.abs(shift) / B() * 1.2;
  if (accentBeats.has(startBeat + nearest)) s += 1.2;
  if (c.tags.includes('slowmo') && span.energy >= 4) s -= 0.4;
  return { s, shift };
}

// ---- раскладка
let cursor = 0, report = [];
const timeline = [], used = new Set();
const accents = [];
for (const it of skel.items) {
  if (it.kind === 'card') {
    timeline.push({ type: 'card', id: it.id, beat: cursor, beats: it.beats, vig: it.vig, grain: it.grain, words: it.words.map((w) => Object.assign({}, w, { b: cursor + w.rb, rb: undefined })) });
    cursor += it.beats; continue;
  }
  // span: поиск лучом
  const n = it.beats, avail = cuts.filter((c) => !used.has(c.scene + '/' + c.cut) && c.beats <= n);
  let beam = [{ left: n, seq: [], score: 0, prev: null, startBeat: cursor, lastKey: null }];
  const finished = [];
  for (let guard = 0; guard < 60 && beam.length; guard += 1) {
    const next = [];
    for (const st of beam) {
      if (st.left === 0) { finished.push(st); continue; }
      const picks = avail.filter((c) => c.beats <= st.left && !st.seq.some((x) => x.c === c) && !(st.left - c.beats === 1)).map((c) => ({ c, r: scoreCut(c, st.prev, it, st.startBeat, st) })).sort((a, b) => b.r.s - a.r.s + (rnd() - 0.5) * 0.3).slice(0, 7);
      for (const p of picks) next.push({ left: st.left - p.c.beats, seq: st.seq.concat([{ c: p.c, shift: p.r.shift, start: st.startBeat }]), score: st.score + p.r.s, prev: p.c, startBeat: st.startBeat + p.c.beats });
    }
    next.sort((a, b) => b.score / (n - b.left + 1) - a.score / (n - a.left + 1));
    beam = next.slice(0, 160);
    if (!beam.length) break;
  }
  const done = finished.concat(beam.filter((b) => b.left === 0)).sort((a, b) => b.score - a.score)[0];
  if (!done) { report.push({ span: cursor, beats: n, problem: 'не набралось нарезок (нужно ' + n + ' долей)' }); timeline.push({ type: 'card', id: 'gap_' + cursor, beat: cursor, beats: n, words: [] }); cursor += n; continue; }
  done.seq.forEach((x) => {
    used.add(x.c.scene + '/' + x.c.cut);
    timeline.push({ type: 'cut', scene: x.c.scene, cut: x.c.cut, beat: x.start, beats: x.c.beats, shift: +x.shift.toFixed(4), note: x.c.desc });
  });
  report.push({ span: cursor, beats: n, cuts: done.seq.map((x) => x.c.scene + '/' + x.c.cut + '(' + x.c.beats + ')').join(' ') });
  cursor += n;
}

const sb = { fps: skel.fps || 60, note: skel.note || '', post: skel.post || { accents: [] }, sfx: skel.sfx || [], timeline };
sb.post = Object.assign({}, sb.post, { accents: (skel.accentBeats || []).map((b) => +(music.offset + b * music.beat).toFixed(4)) });
const out = { totalBeats: cursor, expectedBeats: Math.floor((music.duration - music.offset) / music.beat), cutsAvailable: cuts.length, cutsUsed: used.size, unusedBeats: cuts.filter((c) => !used.has(c.scene + '/' + c.cut)).reduce((s, c) => s + c.beats, 0), report };
console.log(JSON.stringify(out, null, 1));
if (WRITE) { fs.writeFileSync(path.join(ROOT, 'tools', 'trailer', 'storyboard.json'), JSON.stringify(sb, null, 1) + '\n'); console.log('storyboard.json записан'); }
