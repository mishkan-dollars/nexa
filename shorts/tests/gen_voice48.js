// VOICE_48.md: все реплики финала 48 с говорящим, длительностью субтитра и местом в миссии.
const fs = require('fs'), path = require('path');
const ORDER = ['f48act1.js', 'f48ride.js', 'f48act2.js', 'f48act3.js', 'f48act4.js', 'f48act5.js', 'f48act6.js', 'f48act6b.js', 'f48act7.js', 'f48act8.js', 'f48act9.js'];
const SCENE = {
  'f48act1.js': 'Пролог: офис Диктора (мешок, пробуждение, оружие)',
  'f48ride.js': 'Поездка на машине к комплексу NEXA',
  'f48act2.js': 'Двор и база: тихое проникновение, броня',
  'f48act3.js': 'Зал этажа 1: десять касс, перестрелка',
  'f48act4.js': 'Уровень 2: крылья хранилища, взрыв ворот, 2 минуты, газ',
  'f48act5.js': 'Спуск на B4: лифт, шесть шлюзов, дверь 083',
  'f48act6.js': 'Флешбек: воспоминания и «реальность»',
  'f48act6b.js': 'Флешбек: красная комната и пробуждение у двери HEAD',
  'f48act7.js': 'Кабинет HEAD: выбор «пощадить / убить»',
  'f48act8.js': 'Прощание с костюмами, шесть зарядов',
  'f48act9.js': 'Три этажа с зарядами и выход'
};
const lines = [], seen = new Set();
ORDER.forEach((f) => {
  fs.readFileSync(path.join('js', f), 'utf8').split('\n').forEach((ln, i) => {
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
// одиночные крики, которые в коде набраны капсом (GET UP!) — добавляем как отдельную дорожку
const extra = [{ f: 'f48act6b.js', ln: 506, who: 'DICTOR', text: 'GET UP!', dur: 1.4, note: 'крик, громче и злее, чем «Get up.»' }];
extra.forEach((e) => lines.push(e));
lines.sort((a, b) => ORDER.indexOf(a.f) - ORDER.indexOf(b.f) || a.ln - b.ln);

const total = lines.reduce((a, l) => a + (l.dur || 3), 0), words = lines.reduce((a, l) => a + l.text.split(/\s+/).length, 0);
let md = '# VOICE_48 — что нужно озвучить в миссии 48 («ПОМНИТЕ: НИ ОДНОГО СЛОВА НА РУССКОМ»)\n\n';
md += 'Собрано скриптом из `js/f48*.js` и `js/finale48.js` (все строки, которые игра показывает субтитрами).\n';
md += 'Язык — **английский** (правило миссии: ни одного слова на русском). Сейчас реплики только субтитрами, звука нет.\n\n';
md += '**Итого:** ' + lines.length + ' реплик, ≈' + words + ' слов, суммарно по длительности субтитров ≈' + Math.round(total) + ' с (' + (total / 60).toFixed(1) + ' мин).\n\n';
md += '## Голоса\n\n| Кто | Реплик | Описание |\n|---|---|---|\n';
const cnt = {}; lines.forEach((l) => { cnt[l.who] = (cnt[l.who] || 0) + 1; });
const DESC = {
  DICTOR: 'Диктор — главный голос финала. Мужской, 40–50 лет, низкий, неторопливый, вежливый и страшно спокойный; в бою резче и громче; в конце (HEAD) — тише и устало.',
  VOICE: 'Голос из-под мешка: глухой, будто через ткань, тот же Диктор, но приглушённый (одна реплика).',
  'FACILITY SYSTEM': 'Системное оповещение комплекса: женский или обезличенный голос, ровный, без эмоций (одна реплика).'
};
Object.keys(cnt).forEach((k) => { md += '| ' + k + ' | ' + cnt[k] + ' | ' + (DESC[k] || '') + ' |\n'; });
md += '\nДевушка Диктора в финале **не говорит**. Человек в маске (HEAD) в игре не произносит реплик — вместо этого после его сцены на чёрном выходит случайная цитата (текстом).\n\n';
md += '## Как называть файлы\n\n`D48_001.mp3 … D48_' + String(lines.length).padStart(3, '0') + '.mp3` — в порядке таблиц ниже. Формат: mp3 или m4a, моно, 44.1/48 кГц, без шума комнаты. ';
md += 'Колонка «Макс. с» — сколько секунд игра держит субтитр; реплика не должна быть длиннее, иначе обрежется/наложится на следующую.\n\n';
let n = 0, lastF = null;
lines.forEach((l) => {
  if (l.f !== lastF) {
    lastF = l.f;
    md += '\n## ' + SCENE[l.f] + '\n\n| Файл | Кто | Макс. с | Реплика (English) | Примечание |\n|---|---|---|---|---|\n';
  }
  n += 1;
  md += '| D48_' + String(n).padStart(3, '0') + ' | ' + l.who + ' | ' + (l.dur !== null ? l.dur : '~3') + ' | ' + l.text.replace(/\|/g, '/') + ' | ' + (l.note || '') + ' |\n';
});
md += '\n## Подключение (когда файлы будут готовы)\n\nПоложить в `assets/voicelines/` с кодами `D48_###`, затем занести в `tools/voice-codes.json` и перегенерировать `assets/voice/list.json` — реплики подхватятся по тексту, как остальные 120. Отдельно обычно нужны только `Sleep tight, 083.` (приглушённая обработка) и системное оповещение о газе.\n';
fs.writeFileSync('VOICE_48.md', md);
console.log('written', lines.length, 'lines', Math.round(total), 'sec', words, 'words');
const by = {}; lines.forEach((l) => { by[l.f] = (by[l.f] || 0) + 1; }); console.log(JSON.stringify(by));
