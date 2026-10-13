// NEXA: собирает все озвучиваемые реплики игры (субтитры r.say / шоты катсцен) в VOICE_LINES.md и tools/voice-lines.json.
// Запуск:  node tools/extract-voice.js
// Источники: js/missions*.js, js/cutscenes.js, js/cinema.js, js/heist.js, js/missions4data.js (brief / say / bsay / hsay).
// Переводы EN/DE берутся из словарей js/i18n-*.js (если строки в словаре нет — помечается «—»).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ------------------------------------------------------------ словарь переводов
const LANGS = ['en', 'ru', 'de'];
const dict = new Map(); // нормализованный ключ -> { en, ru, de }
const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toUpperCase();
const fakeWin = { I18N: { add(src, obj) {
  const rest = LANGS.filter((l) => l !== src);
  Object.keys(obj).forEach((k) => {
    const v = obj[k]; if (!Array.isArray(v)) return;
    const e = { [src]: k, [rest[0]]: v[0], [rest[1]]: v[1] };
    if (!dict.has(norm(k))) dict.set(norm(k), e);
    [rest[0], rest[1]].forEach((l) => { if (e[l] && !dict.has(norm(e[l]))) dict.set(norm(e[l]), e); });
  });
} } };
fs.readdirSync(path.join(ROOT, 'js')).filter((f) => /^i18n-.*\.js$/.test(f)).forEach((f) => {
  try { new Function('window', 'document', 'localStorage', 'navigator', 'I18N', read('js/' + f))(fakeWin, {}, {}, {}, fakeWin.I18N); } catch (e) { console.warn('i18n skip', f, e.message); }
});
const pats = []; // шаблоны с {0}: «ГЕНЕРАТОР {0} ЗАПУЩЕН…»
const esc = (k) => k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{0\}/g, '(\\d+)');
dict.forEach((e, k) => { if (/\{0\}/.test(k)) pats.push({ re: new RegExp('^' + esc(k) + '$'), e }); });
const tr = (ru) => {
  const e = dict.get(norm(ru)); if (e) return { en: e.en || '', de: e.de || '' };
  for (const p of pats) { const m = norm(ru).match(p.re); if (m) return { en: (p.e.en || '').replace('{0}', m[1]), de: (p.e.de || '').replace('{0}', m[1]) }; }
  return { en: '', de: '' };
};

// ------------------------------------------------------------ разбор исходников
const STR = '(\'(?:\\\\.|[^\'\\\\\\n])*\'|"(?:\\\\.|[^"\\\\\\n])*")';
const SPK = '([A-Za-z_][A-Za-z_0-9.]*|\'[^\']*\'|"[^"]*"|null)';
const lit = (s) => new Function('return ' + s)();
const FILES = ['js/cinema.js', 'js/cutscenes.js', 'js/missions.js', 'js/missions2.js', 'js/missions3.js', 'js/missions4.js', 'js/missions4data.js', 'js/heist.js'];
const NAMES = { 1: 'CALIBRATION' };
const lines = []; // { id, spk, text, kind, file }
const seen = new Set();

function marks(src, file) {
  const m = [];
  const add = (re, g) => { let x; while ((x = re.exec(src))) m.push({ pos: x.index, id: Number(x[g]) }); };
  add(/MISSIONS\[(\d+)\]\s*=/g, 1); add(/CINEMA\[(\d+)\]\s*=/g, 1);
  if (file === 'js/missions.js') add(/\n {4}(\d):\s*\{/g, 1);
  if (file === 'js/missions4data.js') add(/\n\s*M\((\d+),/g, 1);
  m.sort((a, b) => a.pos - b.pos);
  return m;
}
const idAt = (m, pos) => { let id = 0; for (const x of m) { if (x.pos <= pos) id = x.id; else break; } return id; };
const GC = { HND: 'HANDLER', AN: 'ANNOUNCER', OP: 'OPERATOR' };
function consts(src) {
  const c = GC;
  let x; const re = /const\s+([A-Za-z_0-9]+)\s*=\s*'([^']+)'/g;
  while ((x = re.exec(src))) if (/^[A-Z0-9]{2,5}$/.test(x[1])) c[x[1]] = x[2];
  return c;
}
function push(id, spk, text, kind, file) {
  text = String(text).replace(/\s+/g, ' ').trim();
  if (!text || /^[\d\s.,!?:;—-]+$/.test(text)) return;
  const key = id + '|' + spk + '|' + text;
  if (seen.has(key)) return; seen.add(key);
  lines.push({ id, spk, text, kind, file });
}

FILES.forEach((f) => consts(read(f))); // константы-спикеры (SYS, INS, S24…) общие для всех файлов
FILES.forEach((file) => {
  const src = read(file), mk = marks(src, file), K = consts(src);
  const who = (t) => (t === 'null' ? 'NARRATOR' : /^['"]/.test(t) ? lit(t) : (K[t] || (t === 'def.brief' ? 'HANDLER' : t)));
  const run = (re, f) => { let x; re.lastIndex = 0; while ((x = re.exec(src))) f(x, idAt(mk, x.index)); };

  // say: [КТО, 'текст']  — шоты катсцен и r.cine
  run(new RegExp('\\bsay\\s*:\\s*\\[\\s*' + SPK + '\\s*,\\s*' + STR + '\\s*[,\\]]', 'g'), (x, id) => push(id, who(x[1]), lit(x[2]), 'cutscene', file));
  // r.say(КТО, 'текст', ...)
  run(new RegExp('\\bsay\\(\\s*' + SPK + '\\s*,\\s*' + STR + '\\s*[,)]', 'g'), (x, id) => push(id, who(x[1]), lit(x[2]), 'ingame', file));
  // r.say(HND, h.say || 'текст', ...) — реплика по умолчанию движка миссий 17–46
  run(new RegExp('\\bsay\\(\\s*' + SPK + '\\s*,\\s*[\\w.]+\\s*\\|\\|\\s*' + STR + '\\s*[,)]', 'g'), (x, id) => push(id, who(x[1]), lit(x[2]), 'default', file));
  // says: [[КТО, 'текст'], ...]
  run(/\bsays\s*:\s*\[/g, (x, id) => {
    let d = 0, i = x.index + x[0].length - 1, j = i;
    for (; j < src.length; j += 1) { if (src[j] === '[') d += 1; else if (src[j] === ']') { d -= 1; if (!d) break; } }
    const block = src.slice(i, j + 1); let y; const re2 = new RegExp('\\[\\s*' + SPK + '\\s*,\\s*' + STR + '\\s*[,\\]]', 'g');
    while ((y = re2.exec(block))) push(id, who(y[1]), lit(y[2]), 'cutscene', file);
  });
  if (file === 'js/missions4data.js') {
    // say / bsay / hsay — реплики Куратора по секторам
    run(new RegExp('\\b(say|bsay|hsay)\\s*:\\s*' + STR, 'g'), (x, id) => push(id, 'HANDLER', lit(x[2]), x[1] === 'bsay' ? 'boss' : x[1] === 'hsay' ? 'hold' : 'sector', file));
    // M(id, title, desc, log, theme, hp, kit, place, brief, ...) — брифинг
    run(/\n\s*M\((\d+),/g, (x, id) => {
      let d = 0, i = x.index + x[0].indexOf('('), j = i, q = null; const args = []; let cur = '';
      for (j = i + 1; j < src.length; j += 1) {
        const ch = src[j];
        if (q) { cur += ch; if (ch === '\\') { cur += src[j + 1]; j += 1; } else if (ch === q) q = null; continue; }
        if (ch === '\'' || ch === '"') { q = ch; cur += ch; continue; }
        if ('([{'.indexOf(ch) >= 0) d += 1; if (')]}'.indexOf(ch) >= 0) { if (!d) break; d -= 1; }
        if (ch === ',' && !d) { args.push(cur.trim()); cur = ''; } else cur += ch;
      }
      args.push(cur.trim());
      if (args.length >= 9) { NAMES[id] = lit(args[1]); if (/^['"]/.test(args[8])) push(id, 'HANDLER', lit(args[8]), 'brief', file); }
    });
  }
  // названия миссий
  run(/(?:MISSIONS\[(\d+)\]\s*=|\n {4}(\d):)\s*\{\s*title:\s*'([^']+)'/g, (x) => { NAMES[Number(x[1] || x[2])] = x[3]; });
});

// ------------------------------------------------------------ ручные добавки (динамические / составные строки)
// Миссия 4: тексты найденных документов (r.say(null, text[i]) — диктор читает записи)
{
  const src = read('js/missions.js'), a = src.indexOf('const text = [');
  if (a > 0) { const b = src.indexOf('];', a), blk = src.slice(a, b); let x; const re = new RegExp(STR, 'g'); while ((x = re.exec(blk))) push(4, 'NARRATOR', lit(x[1]), 'document', 'js/missions.js'); }
}
// «ГЕНЕРАТОР N ЗАПУЩЕН», «ВЗРЫВ ЧЕРЕЗ N СЕКУНД» — числа озвучиваем отдельными вставками
push(9, 'SYSTEM', 'ГЕНЕРАТОР 1 ЗАПУЩЕН. СЛЕДУЮЩИЙ — ПО МАРКЕРУ.', 'dynamic', 'js/missions2.js');
push(9, 'SYSTEM', 'ГЕНЕРАТОР 2 ЗАПУЩЕН. СЛЕДУЮЩИЙ — ПО МАРКЕРУ.', 'dynamic', 'js/missions2.js');
[16, 18].forEach((n) => push(0, 'HANDLER', 'ЗАРЯДЫ УСТАНОВЛЕНЫ. УХОДИ — ВЗРЫВ ЧЕРЕЗ ' + n + ' СЕКУНД.', 'dynamic', 'js/missions4.js'));

// ------------------------------------------------------------ вывод
lines.sort((a, b) => (a.id || 999) - (b.id || 999));
const bySpk = {};
lines.forEach((l) => { (bySpk[l.spk] = bySpk[l.spk] || []).push(l); });
// Коды файлов заморожены в tools/voice-codes.json («миссия|текст» -> код): правка текста или порядка не переименовывает уже озвученное,
// новые реплики получают следующий свободный номер. Меняется текст реплики -> новый код (старый файл остаётся «осиротевшим», скрипт об этом сообщит).
const CODES_FILE = path.join(__dirname, 'voice-codes.json');
const frozen = fs.existsSync(CODES_FILE) ? JSON.parse(fs.readFileSync(CODES_FILE, 'utf8')) : {};
const pre = (k) => (k ? 'm' + String(k).padStart(2, '0') : 'gen');
const used = {}; // префикс -> максимальный номер
Object.keys(frozen).forEach((key) => { const m = /^(\w+)_(\d+)$/.exec(frozen[key]); if (m) used[m[1]] = Math.max(used[m[1]] || 0, Number(m[2])); });
lines.forEach((l) => {
  const key = l.id + '|' + l.text;
  if (!frozen[key]) { const p = pre(l.id); used[p] = (used[p] || 0) + 1; frozen[key] = p + '_' + String(used[p]).padStart(2, '0'); }
  l.code = frozen[key];
  l.file_out = 'assets/voice/' + l.code + '.mp3';
  const t = tr(l.text); l.en = t.en; l.de = t.de;
});
const live = new Set(lines.map((l) => l.id + '|' + l.text));
const orphans = Object.keys(frozen).filter((k) => !live.has(k));
fs.writeFileSync(CODES_FILE, JSON.stringify(frozen, null, 1));
if (orphans.length) console.warn('ORPHAN codes (text changed or removed):', orphans.map((k) => frozen[k]).join(', '));
const uniq = new Set(lines.map((l) => l.text));
const chars = [...uniq].reduce((s, t) => s + t.length, 0);

const VOICE = {
  HANDLER: 'Куратор / связной в наушнике: мужской, 35–45 лет, спокойный, сухой, чуть уставший; слышен лёгкий радиошум. Единственный «живой» голос игрока.',
  SYSTEM: 'Система NEXA: женский или обезличенный, ровный, без эмоций, как автоинформатор 1992 года; слегка металлический.',
  INSTRUCTOR: 'Инструктор: мужской, сухой военный тон, короткие фразы (миссия 8).',
  OPERATOR: 'Оператор: мужской, низкий, холодный (финал, миссия 16).',
  ANNOUNCER: 'Диктор арены: громкий, театральный, как ведущий шоу (миссия 13).',
  'SUBJECT 024': 'Субъект 024: тихий, пугающе спокойный, почти шёпот; нечеловечески ровная интонация. Главный «жуткий» голос игры.',
  'UNKNOWN PROCESS': 'Неизвестный процесс: тот же голос 024, но пропущенный через глитч/питч-даун; можно озвучить тем же голосом и обработать эффектом.',
  'ЗАПИСЬ': 'Голос записи: плохое качество, как плёнка / диктофон.',
  NARRATOR: 'Диктор: тихий, без эмоций — читает найденные документы (миссия 4).'
};

let md = '# VOICE_LINES — что нужно озвучить\n\n';
md += 'Файл собран скриптом `node tools/extract-voice.js` из исходников игры (перезапускай после правок текстов).\n\n';
md += `**Итого:** ${lines.length} реплик (${uniq.size} уникальных текстов, ≈${chars} символов на один язык). Основной язык — русский (это исходный текст); EN/DE уже переведены в игре, их можно озвучить теми же голосами (модель ElevenLabs Multilingual v2).\n\n`;
md += 'Сейчас реплики показываются только субтитрами (`r.say`). Имя в колонке «Файл» — предлагаемое имя озвучки: `assets/voice/<имя>.mp3` (потом подключу воспроизведение по этой таблице — скажи, когда файлы будут в папке).\n\n';
md += '## Голоса\n\n| Персонаж | Реплик | Описание голоса |\n|---|---|---|\n';
Object.keys(bySpk).sort((a, b) => bySpk[b].length - bySpk[a].length).forEach((s) => { md += `| ${s} | ${bySpk[s].length} | ${VOICE[s] || '—'} |\n`; });
md += '\nПорядок генерации: сначала HANDLER и SYSTEM (их больше всего), потом SUBJECT 024 (самое важное по атмосфере), потом редкие голоса.\n\n';
md += '## Реплики по миссиям\n\n';
let cur = -1;
lines.forEach((l) => {
  if (l.id !== cur) { cur = l.id; md += '\n### ' + (l.id ? String(l.id).padStart(2, '0') + ' — ' + (NAMES[l.id] || '') : 'Общие (подставляются в разных миссиях)') + '\n\n| Файл | Кто | Русский (озвучивать) | English | Deutsch |\n|---|---|---|---|---|\n'; }
  md += `| ${l.code} | ${l.spk} | ${l.text.replace(/\|/g, '/')} | ${l.en ? l.en.replace(/\|/g, '/') : '—'} | ${l.de ? l.de.replace(/\|/g, '/') : '—'} |\n`;
});
md += '\n## Не озвучивается (только текст на экране)\n\n- Подписи мест в катсценах (`CAP(...)`, например «DETENTION BLOCK C — CELL 14»), цели, подсказки, лог заданий — это интерфейс.\n- ~600 цитат на чёрном экране после проигрыша за столом HIGH / LOW (`js/quotes.js`) — по желанию, одним голосом (Диктор / 024).\n- Слово «ОГРАБЛЕНИЕ» на мониторах в катсцене миссии 47 — графика; в этот момент играет трек `heistloud.mp3`.\n';
fs.writeFileSync(path.join(ROOT, 'VOICE_LINES.md'), md);
fs.writeFileSync(path.join(__dirname, 'voice-lines.json'), JSON.stringify(lines.map((l) => ({ code: l.code, mission: l.id, speaker: l.spk, ru: l.text, en: l.en, de: l.de, file: l.file_out })), null, 1));
// ------------------------------------------------------------ английская версия для ElevenLabs (VOICE_LINES_EN.md): по персонажам
// Голоса — готовые (premade) голоса библиотеки ElevenLabs; состав библиотеки меняется, поэтому у каждого есть запасной вариант и текст для Voice Design.
const ENV = {
  HANDLER: { voice: 'Brian', alt: 'Bill', set: 'Stability 55 · Similarity 75 · Style 10 · Speaker boost on', design: 'Male, 40s, American, calm, dry and tired, low and close to the microphone, the voice of a handler talking to an agent over a radio earpiece. Short, clipped delivery, no drama.', fx: 'Optional: band-pass 300 Hz – 3.4 kHz plus faint radio noise.' },
  SYSTEM: { voice: 'Alice', alt: 'Sarah', set: 'Stability 90 · Similarity 75 · Style 0', design: 'Female, neutral accent, completely flat and emotionless, like a 1992 automated announcement system. Slightly metallic, even tempo, every word equally stressed.', fx: 'Recommended: slight bit-crush / 8 kHz sample rate and a short metallic reverb so it sounds like a machine.' },
  'SUBJECT 024': { voice: 'George (Voice Design recommended)', alt: 'Charlie / Lily', set: 'Stability 85 · Similarity 80 · Style 0 · speak very softly', design: 'Androgynous young adult, almost a whisper, unnervingly calm and flat, speaks slowly as if reading a fact, slightly too close to the microphone. No emotion, no emphasis.', fx: 'Optional: very light room reverb. This is the creepiest voice in the game, keep it quiet and intimate.' },
  'UNKNOWN PROCESS': { voice: 'Same voice as SUBJECT 024', alt: '-', set: 'Same as SUBJECT 024', design: 'Same as SUBJECT 024.', fx: 'Pitch down 3–5 semitones, add glitch / stutter, a little distortion.' },
  'ЗАПИСЬ': { voice: 'Same voice as SUBJECT 024', alt: 'HANDLER', set: 'Same as SUBJECT 024', design: 'Same as SUBJECT 024.', fx: 'Tape / dictaphone effect: band-pass 400 Hz – 2.5 kHz, wow-and-flutter, hiss.' },
  INSTRUCTOR: { voice: 'Clyde', alt: 'Arnold', set: 'Stability 60 · Similarity 75 · Style 15', design: 'Male, 50s, American, gravelly war-veteran drill instructor, dry and curt, short orders, no shouting.', fx: '-' },
  OPERATOR: { voice: 'Daniel', alt: 'Callum', set: 'Stability 70 · Similarity 75 · Style 10', design: 'Male, deep, cold and precise, controlled and slightly clinical, like someone who watches an experiment through glass.', fx: 'Optional: PA-speaker / intercom filter.' },
  ANNOUNCER: { voice: 'Adam', alt: 'Harry', set: 'Stability 35 · Similarity 75 · Style 45', design: 'Male, deep, loud theatrical arena announcer, cruel showman, big pauses.', fx: 'Optional: stadium PA reverb.' },
  NARRATOR: { voice: 'Bill', alt: 'Brian', set: 'Stability 70 · Similarity 75 · Style 0', design: 'Male, older, quiet documentary narrator, emotionless, reading a classified report.', fx: '-' }
};
const sentence = (t) => {
  if (/[a-z]/.test(t)) return t;
  return t.toLowerCase()
    .replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\bi\b/g, 'I')
    .replace(/\b(nexa|ak-47|c4)\b/gi, (m) => m.toUpperCase())
    .replace(/\b(block|sector|level|wing|zone) ([a-z])\b/gi, (m, a, b) => a + ' ' + b.toUpperCase());
};
{
  const en = lines.filter((l) => l.en);
  const enChars = en.reduce((s, l) => s + sentence(l.en).length, 0);
  let t = '# VOICE_LINES_EN — English voice-over script for ElevenLabs\n\n';
  t += `${en.length} lines, about ${enChars} characters (≈ ${enChars} credits on the standard models; check your plan). Generated by \`node tools/extract-voice.js\`.\n\n`;
  t += 'Workflow: for each character create or pick ONE voice, generate all of that character\'s lines with the same settings, download as mp3 and save as `assets/voice/<code>.mp3` (code is in the first column). The text is already converted from ALL CAPS to normal sentence case, because ElevenLabs reads capitals too loudly.\n\n';
  t += 'Voice names are ElevenLabs premade voices; the library changes over time, so every character also has a Voice Design prompt (Voices → Add a new voice → Voice Design) that you can paste instead.\n\n';
  t += '## Voices\n\n| Character | Lines | Voice | Backup | Settings |\n|---|---|---|---|---|\n';
  const order = ['HANDLER', 'SYSTEM', 'SUBJECT 024', 'INSTRUCTOR', 'OPERATOR', 'ANNOUNCER', 'NARRATOR', 'ЗАПИСЬ', 'UNKNOWN PROCESS'];
  order.forEach((s) => { const n = en.filter((l) => l.spk === s).length; if (n) t += `| ${s === 'ЗАПИСЬ' ? 'RECORDING (ЗАПИСЬ)' : s} | ${n} | ${ENV[s].voice} | ${ENV[s].alt} | ${ENV[s].set} |\n`; });
  order.forEach((s) => {
    const L = en.filter((l) => l.spk === s); if (!L.length) return;
    t += `\n## ${s === 'ЗАПИСЬ' ? 'RECORDING (ЗАПИСЬ)' : s} — ${L.length} line${L.length > 1 ? 's' : ''}\n\n`;
    t += `- **Voice:** ${ENV[s].voice} (backup: ${ENV[s].alt})\n- **Settings:** ${ENV[s].set}\n- **Voice Design prompt:** ${ENV[s].design}\n- **Post-processing:** ${ENV[s].fx}\n\n`;
    t += '| File | Mission | Line |\n|---|---|---|\n';
    L.forEach((l) => { t += `| ${l.code} | ${l.id ? String(l.id).padStart(2, '0') + ' ' + (NAMES[l.id] || '') : 'any'} | ${sentence(l.en).replace(/\|/g, '/')} |\n`; });
  });
  fs.writeFileSync(path.join(ROOT, 'VOICE_LINES_EN.md'), t);
}
// ------------------------------------------------------------ assets/voice/list.json — для игры: map (текст -> коды) и files (код -> длительность, с)
// В игру попадают только реально лежащие в assets/voice/*.mp3 файлы; длительность считается по заголовкам кадров mp3.
function mp3Seconds(buf) {
  let p = 0;
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') p = 10 + ((buf[6] & 127) << 21 | (buf[7] & 127) << 14 | (buf[8] & 127) << 7 | (buf[9] & 127));
  const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0], BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  let sec = 0;
  while (p + 4 <= buf.length) {
    if (buf[p] !== 0xff || (buf[p + 1] & 0xe0) !== 0xe0) { p += 1; continue; }
    const ver = (buf[p + 1] >> 3) & 3, layer = (buf[p + 1] >> 1) & 3, bi = buf[p + 2] >> 4, si = (buf[p + 2] >> 2) & 3, pad = (buf[p + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bi === 0 || bi === 15 || si === 3) { p += 1; continue; }
    const br = (ver === 3 ? BR1 : BR2)[bi] * 1000, sr = SR[ver][si], spf = ver === 3 ? 1152 : 576;
    const len = Math.floor((ver === 3 ? 144 : 72) * br / sr) + pad;
    sec += spf / sr; p += Math.max(len, 4);
  }
  return Math.round(sec * 100) / 100;
}
{
  const dir = path.join(ROOT, 'assets', 'voice');
  fs.mkdirSync(dir, { recursive: true });
  const files = {}, dirs = {}, map = {};
  // озвучку можно класть и в assets/voice, и в assets/voicelines (пользователь уже использует вторую); при одинаковом коде побеждает voicelines
  ['voice', 'voicelines'].forEach((sub) => {
    const d = path.join(ROOT, 'assets', sub);
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).filter((f) => /\.mp3$/i.test(f)).forEach((f) => { const c = f.replace(/\.mp3$/i, ''); files[c] = mp3Seconds(fs.readFileSync(path.join(d, f))); if (sub !== 'voice') dirs[c] = sub; else delete dirs[c]; });
  });
  lines.forEach((l) => { const k = norm(l.text); (map[k] = map[k] || []).push([l.id, l.code]); });
  fs.writeFileSync(path.join(dir, 'list.json'), JSON.stringify({ v: 1, files, dirs, map }) + '\n');
  const have = lines.filter((l) => files[l.code]).length;
  console.log('voice files found: ' + have + ' / ' + lines.length + (have < lines.length ? '  (missing: ' + lines.filter((l) => !files[l.code]).length + ')' : ''));
  const stray = Object.keys(files).filter((c) => !lines.some((l) => l.code === c));
  if (stray.length) console.warn('mp3 without a line:', stray.join(', '));
}
console.log('lines', lines.length, 'unique', uniq.size, 'chars', chars);
Object.keys(bySpk).forEach((s) => console.log(' ', s, bySpk[s].length));
console.log('without EN:', lines.filter((l) => !l.en).length, 'without DE:', lines.filter((l) => !l.de).length);
