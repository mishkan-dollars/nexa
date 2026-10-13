// NEXA: сетка трейлера. Номер доли b → время трека t = offset + b·beat; сегменты раскладываются по кадрам без дыр и перекрытий:
// кадр сегмента = round(t·fps), первый сегмент начинается с кадра 0, последний заканчивается на последнем кадре трека.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');

function load(sbPath) {
  const sb = JSON.parse(fs.readFileSync(sbPath || path.join(ROOT, 'tools', 'trailer', 'storyboard.json'), 'utf8'));
  const music = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'trailer', 'music', 'beats.json'), 'utf8'));
  return { sb, music };
}
const beatTime = (music, b) => music.offset + b * music.beat;

// возвращает [{...seg, f0, f1, frames}] — полуинтервал кадров [f0, f1)
function layout(sb, music) {
  const fps = sb.fps || 30, total = Math.floor(music.duration * fps), segs = sb.timeline;
  const out = segs.map((s, i) => {
    const f0 = i === 0 ? 0 : Math.round(beatTime(music, s.beat) * fps);
    const f1 = i === segs.length - 1 ? total : Math.round(beatTime(music, s.beat + s.beats) * fps);
    return Object.assign({}, s, { f0, f1, frames: f1 - f0 });
  });
  return { fps, total, segs: out };
}

module.exports = { load, layout, beatTime, ROOT };
