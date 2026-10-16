// NEXA: реплики финала (миссия 48, только английский) — сборщик списка из js/f48*.js.
// Правила разбора те же, что в shorts/tests/gen_voice48.js (по нему записаны D48_001 … D48_130 и составлен VOICE_48.md): порядок файлов, порядок строк, фильтры.
// Используется tools/extract-voice.js: коды D48_### заморожены в tools/voice-codes.json, так что смена порядка или текста не переименовывает записанные файлы.
'use strict';
const fs = require('fs');
const path = require('path');

const ORDER = ['f48act1.js', 'f48ride.js', 'f48act2.js', 'f48act3.js', 'f48act4.js', 'f48act5.js', 'f48act6.js', 'f48act6b.js', 'f48act7.js', 'f48act8.js', 'f48act9.js'];
// крики, набранные в коде капсом (под фильтр «весь текст заглавными» они не попадают): добавляются отдельной дорожкой, как в gen_voice48.js
const EXTRA = [{ f: 'f48act6b.js', ln: 506, who: 'DICTOR', text: 'GET UP!', dur: 1.4 }];

function scan48(root) {
  const lines = [], seen = new Set();
  ORDER.forEach((f) => {
    fs.readFileSync(path.join(root, 'js', f), 'utf8').split('\n').forEach((ln, i) => {
      if (/^\s*\/\//.test(ln)) return;
      let p = 0;
      while (p < ln.length) {
        const c = ln[p];
        if (c === '/' && ln[p + 1] === '/') break;
        if (c === "'" || c === '"' || c === '`') {
          let q = p + 1, s = '';
          while (q < ln.length && ln[q] !== c) { if (ln[q] === '\\') { s += ln[q + 1] === 'n' ? ' ' : ln[q + 1]; q += 2; } else { s += ln[q]; q += 1; } }
          const rest = ln.slice(q + 1), t = s.trim();
          p = q + 1;
          if (t.length < 4 || t.length > 300) continue;
          if (!/^[A-Z“"‘(][^<>{}=;]*[.!?…”"]$/.test(t)) continue;
          if (/^[A-Z0-9 \-—:.,'!?/%+]+$/.test(t)) continue;
          if (/^(Use|Click|Press|Hold|Open|Wait|Return)\b/.test(t) && t.length < 40) continue;
          if (seen.has(t)) continue; seen.add(t);
          const dm = /^\s*,\s*([0-9.]+)/.exec(rest);
          const before = ln.slice(0, p);
          let who = 'DICTOR';
          if (/'VOICE'\s*,\s*$/.test(before.slice(0, before.lastIndexOf(c)).trim())) who = 'VOICE';
          if (/FACILITY SYSTEM/.test(before)) who = 'FACILITY SYSTEM';
          if (ln.indexOf("r.say('VOICE'") >= 0) who = 'VOICE';
          lines.push({ f, ln: i + 1, who, text: t, dur: dm ? Number(dm[1]) : null });
        } else p += 1;
      }
    });
  });
  EXTRA.forEach((e) => { if (!seen.has(e.text)) { seen.add(e.text); lines.push(Object.assign({}, e)); } });
  lines.sort((a, b) => ORDER.indexOf(a.f) - ORDER.indexOf(b.f) || a.ln - b.ln);
  return lines;
}

module.exports = { scan48, ORDER };
