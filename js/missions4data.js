// NEXA: данные миссий 17–46 (движок — missions4.js) + метаданные героя-ограбления 47 (сама миссия в heist.js).
// Сектор: b = бит (fight|hack|hold|stealth|blast|plant|snipe|rescue|collect|run|boss), obj = цель на экране,
// w = волны строками (g грант, r раш, h тяжёлый, b босс), остальные ключи описаны в missions4.js.
(function () {
  'use strict';
  const MS = window.Missions;
  if (!MS || !MS.define) return;

  const S = (b, obj, o) => Object.assign({ b, obj }, o || {});
  const fight = (obj, w, o) => S('fight', obj, Object.assign({ w }, o));
  const hack = (obj, hk, o) => S('hack', obj, Object.assign({ hk }, o));
  const hold = (obj, secs, w, o) => S('hold', obj, Object.assign({ hold: { secs, w, label: (o && o.label) || 'START THE GENERATOR', meter: (o && o.meter) || 'UPLOAD', say: o && o.hsay } }, o));
  const stealth = (obj, o) => S('stealth', obj, o);
  const blast = (obj, o) => S('blast', obj, o);
  const plant = (obj, secs, fuse, w, o) => S('plant', obj, Object.assign({ pl: { secs, fuse, w } }, o));
  const snipe = (obj, n, w, o) => S('snipe', obj, Object.assign({ n, w, fogK: 0.2 }, o));
  const rescue = (obj, n, o) => S('rescue', obj, Object.assign({ n }, o));
  const collect = (obj, n, amb, o) => S('collect', obj, Object.assign({ n, amb }, o));
  const run = (obj, speed, o) => S('run', obj, Object.assign({ speed }, o));
  const boss = (obj, bhp, o) => S('boss', obj, Object.assign({ bhp }, o));
  const seq = (len, title) => ({ kind: 'seq', len, tries: 3, title: title || 'ACCESS TERMINAL' });
  const sync = (title) => ({ kind: 'sync', tries: 3, title: title || 'SYNC FREQUENCY' });
  const match = (title) => ({ kind: 'match', tries: 3, title: title || 'MATCH SIGNATURES' });

  const M = (id, title, desc, log, theme, hp, kit, place, brief, secs, o) => MS.define(Object.assign({ id, title, desc, log, theme, hp, kit, place, brief, secs }, o));

  // ===================================================== АКТ I — улица, первые заказы
  M(17, 'DAYLIGHT', 'Recover three stolen drives.<br>Clear the plaza.', '[06:35:12] TASK 17 COMPLETE. DRIVES RECOVERED', 'day', 0.9, ['glock'],
    'CITY PLAZA — SECTOR 4',
    'ДОБРО ПОЖАЛОВАТЬ НАВЕРХ. ТРИ ДИСКА НАШЕГО ПРОЕКТА ВЫНЕСЛИ НА ПЛОЩАДЬ. ВЕРНИ ИХ. ПАТРОНЫ ВОЗЬМИ У ЯЩИКОВ.',
    [fight('CLEAR THE ENTRANCE', ['gg', 'rg'], { get: ['ak'], tip: 'AK-47 ON THE CRATE — PICK IT UP AND SWITCH WITH 1 / 2' }),
     collect('RECOVER THE DRIVES', 3, ['g', 'rg', 'ggr'], { lbl: 'DRIVE', use: 'TAKE DRIVE' }),
     fight('CLEAR THE EXIT', ['ggg', 'rrg', 'gggr'])]);

  M(18, 'SAFEHOUSE', 'Reach the safehouse unseen.<br>Hold it until the line is back.', '[06:49:31] TASK 18 COMPLETE. SAFEHOUSE ONLINE', 'alley', 0.9, ['glock'],
    'BACK ALLEY — DISTRICT 9',
    'УЛИЦА КИШИТ ЛЮДЬМИ ЗАКАЗЧИКА. ПРОЙДИ ТИХО К УБЕЖИЩУ, ЗАПУСТИ ГЕНЕРАТОР И ДЕРЖИСЬ. ЕСЛИ СПАЛЯТ — СТРЕЛЯЙ.',
    [stealth('SLIP PAST THE PATROL', { g: 3, c: 0, alarmW: 'gg', tip: 'CROUCH-WALK BEHIND THE CRATES. TAKE GUARDS DOWN WITH E FROM BEHIND.' }),
     hold('RESTORE POWER TO THE SAFEHOUSE', 22, [[6, 'gg'], [14, 'rg']], { hsay: 'ГЕНЕРАТОР ЗАПУЩЕН. ДЕРЖИСЬ — ОНИ УЖЕ ИДУТ.' }),
     fight('DEFEND THE EXIT', ['gg', 'rrg', 'ggg'], { gad: [['flash', 2]], tip: 'FLASHBANG [G] BLINDS THE ENEMY FOR SEVERAL SECONDS' })]);

  M(19, 'CLEANERS', 'Break into the office floor.<br>Open the archive.', '[07:02:44] TASK 19 COMPLETE. ARCHIVE OPENED', 'office', 0.9, ['glock', 'ak'],
    'NEXA ANNEX — FLOOR 12',
    'ОФИС, ГДЕ ЧИСТЯТ СЛЕДЫ. ВЗЛОМАЙ ТЕРМИНАЛ АРХИВА — НО ОХРАНА УСЛЫШИТ ШУМ. ГОТОВЬСЯ.',
    [fight('CLEAR THE OFFICE', ['gg', 'ggr']),
     hack('HACK THE ARCHIVE TERMINAL', seq(4, 'ARCHIVE ACCESS'), { foes: 'g', atk: 'rr', clear: true, tip: 'HACK: REPEAT THE SEQUENCE. THE ALARM BRINGS REINFORCEMENTS.' }),
     fight('FIGHT TO THE EXIT', ['ggg', 'hr'])]);

  M(20, 'SCRAPYARD', 'Blow the gate.<br>Outrun the compactor.', '[07:16:08] TASK 20 COMPLETE. GATE BREACHED', 'yard', 0.9, ['glock', 'ak'],
    'SCRAPYARD — EAST GATE',
    'ВОРОТА ЗАВАРЕНЫ. C4 ЛЕЖИТ У ЯЩИКОВ. ПОСЛЕ ВЗРЫВА ЗА СПИНОЙ ЗАПУСТЯТ ПРЕСС — НЕ ОСТАНАВЛИВАЙСЯ.',
    [fight('CLEAR THE YARD', ['ggg', 'rrg'], { barrels: 4 }),
     blast('BLOW THE GATE WITH C4', { after: 'gg', gad: [['c4', 2], ['frag', 1]] }),
     run('RUN FROM THE COMPACTOR', 1.6, { foes: 'rr' }),
     fight('HOLD THE EXIT', ['ggh'])]);

  M(21, 'FIRST JOB', 'Break into the dock office.<br>Grab the cargo list.', '[07:29:50] TASK 21 COMPLETE. CARGO LIST SECURED', 'dock', 0.9, ['glock', 'ak'],
    'HARBOR — WAREHOUSE 3',
    'ПЕРВОЕ НАСТОЯЩЕЕ ДЕЛО. СКЛАД В ПОРТУ. ВЗЛОМАЙ ПАНЕЛЬ, ДОСТАНЬ СПИСОК ГРУЗОВ И УХОДИ. ТИХО, ЕСЛИ ПОЛУЧИТСЯ.',
    [stealth('REACH THE OFFICE UNSEEN', { g: 3, c: 1, hk: seq(4, 'DOCK SECURITY'), hkLabel: 'HACK THE SECURITY PANEL', alarmW: 'ggr' }),
     hack('OPEN THE CARGO DATABASE', sync('CARGO DATABASE')),
     hold('COPY THE CARGO LIST', 20, [[5, 'gg'], [12, 'rg']], { label: 'START THE COPY', meter: 'COPYING' }),
     run('ESCAPE BEFORE THE SHUTTERS CLOSE', 1.9, { foes: 'rrg' })]);

  // ===================================================== АКТ II — тихая работа
  M(22, 'LOCKSMITH', 'Open three locks.<br>Do not wake the floor.', '[07:44:03] TASK 22 COMPLETE. ALL LOCKS OPEN', 'office', 1.0, ['glock', 'ak'],
    'LAW FIRM — FLOOR 31',
    'ТРИ ЗАМКА, ТРИ ЭТАЖА ОХРАНЫ. КАЖДЫЙ ЗАМОК — ВЗЛОМ. ПОЛКОВНИК ЗАПЛАТИЛ ЗА ТИШИНУ.',
    [stealth('OPEN THE FIRST LOCK', { g: 2, c: 1, hk: seq(5, 'LOCK 1/3'), gad: [['frag', 2]] }),
     stealth('OPEN THE SECOND LOCK', { g: 3, c: 1, hk: seq(5, 'LOCK 2/3') }),
     hack('OPEN THE THIRD LOCK', match('LOCK 3/3'), { foes: 'g', atk: 'rr' }),
     fight('FIGHT TO THE ROOF HATCH', ['ggg', 'rrg'])]);

  M(23, 'CAMERA LOOP', 'Loop the cameras.<br>Cross the lab.', '[07:58:27] TASK 23 COMPLETE. FEEDS LOOPED', 'lab', 1.0, ['glock', 'ak'],
    'GENOME LAB — LEVEL B',
    'КАМЕРЫ ВИДЯТ ВСЁ. НА КАЖДОМ ЭТАЖЕ ЕСТЬ ПАНЕЛЬ, КОТОРАЯ ПУСКАЕТ ИХ ПО КРУГУ. НАЙДИ ЕЁ РАНЬШЕ, ЧЕМ ОНИ НАЙДУТ ТЕБЯ.',
    [stealth('LOOP THE FIRST CAMERAS', { g: 1, c: 3, hk: seq(4, 'CCTV LOOP 1/3') }),
     stealth('LOOP THE SECOND CAMERAS', { g: 2, c: 3, hk: sync('CCTV LOOP 2/3') }),
     stealth('LOOP THE LAST CAMERAS', { g: 2, c: 4, l: 2, hk: match('CCTV LOOP 3/3') }),
     fight('FIGHT OUT OF THE LAB', ['gg', 'rrg', 'ggg'])]);

  M(24, 'DEAD DROP', 'Collect four dead drops.<br>Hold the last one.', '[08:12:19] TASK 24 COMPLETE. PACKAGES DELIVERED', 'metro', 1.0, ['glock', 'ak'],
    'METRO STATION — LINE 6',
    'ЧЕТЫРЕ ТАЙНИКА ПО СТАНЦИИ. СОБЕРИ ВСЕ. НА ПЕРРОНЕ ТЕБЯ ЖДУТ ПЕРЕКУПЩИКИ.',
    [collect('COLLECT THE DEAD DROPS', 4, ['g', 'rg', 'ggr', 'rrg'], { lbl: 'DEAD DROP', use: 'TAKE PACKAGE' }),
     stealth('CROSS THE CONCOURSE', { g: 3, c: 0, alarmW: 'ggr' }),
     fight('CLEAR THE PLATFORM', ['ggg', 'rrg', 'ggr'], { barrels: 4 }),
     hold('UPLOAD THE PACKAGES', 24, [[5, 'gg'], [12, 'rrg'], [18, 'gg']], { label: 'START THE UPLOAD', meter: 'UPLOAD' })]);

  M(25, 'PARKING LEVEL 3', 'Find the keys.<br>Open the garage hatch.', '[08:26:41] TASK 25 COMPLETE. GARAGE CRACKED', 'garage', 1.0, ['glock', 'ak'],
    'UNDERGROUND PARKING — LEVEL 3',
    'ПАРКОВКА, МАШИНЫ, ТЕНИ. НА УРОВНЕ ТРИ ЧЕЛОВЕКА С КЛЮЧАМИ. ЗАБЕРИ ИХ И ВЫЙДИ ЧЕРЕЗ ЛЮК.',
    [fight('CLEAR LEVEL 3', ['gg', 'rrg', 'ggg']),
     collect('FIND THE KEY FOBS', 3, ['gg', 'rr', 'ggr'], { lbl: 'KEY FOB', use: 'TAKE FOB' }),
     hack('OPEN THE GARAGE HATCH', seq(5, 'GARAGE HATCH'), { atk: 'rr', clear: true }),
     fight('SURVIVE THE ESCAPE', ['gg', 'gghh'])]);

  M(26, 'WIRETAP', 'Plant the tap.<br>Hold the line open.', '[08:41:06] TASK 26 COMPLETE. LINE TAPPED', 'office', 1.0, ['glock', 'ak'],
    'CITY HALL — FLOOR 5',
    'НАМ НУЖЕН ТЕЛЕФОН ИХ ГЛАВНОГО. ВЗЛОМАЙ ЛИНИЮ, УДЕРЖИВАЙ ЗВОНОК ДВАДЦАТЬ СЕКУНД. НИКТО НЕ ДОЛЖЕН ТЕБЯ ЗАМЕТИТЬ.',
    [stealth('REACH THE SWITCHBOARD', { g: 3, c: 1, hk: sync('SWITCHBOARD') }),
     hold('KEEP THE LINE OPEN', 20, [[5, 'gg'], [12, 'rg'], [17, 'gg']], { label: 'START THE TAP', meter: 'TAPPING' }),
     hack('DECRYPT THE RECORDING', seq(6, 'DECRYPT'), { atk: 'gg' }),
     fight('FIGHT TO THE STAIRS', ['ggg', 'rrg'])]);

  M(27, 'HOSTAGE', 'Free the hostages.<br>Two and a half minutes.', '[08:55:58] TASK 27 COMPLETE. HOSTAGES FREE', 'mansion', 1.0, ['glock', 'ak'],
    'GOVERNOR’S MANSION — WEST WING',
    'ТРОЕ ЗАЛОЖНИКОВ. ПОСЛЕ ПЕРВОГО ВЫСТРЕЛА ЧАСЫ ИДУТ. ПЕРЕРЕЖЬ ВЕРЁВКИ И ВЫВОДИ ИХ. ЗАЛОЖНИКОВ С БЕЛЫМИ ЖИЛЕТАМИ НЕ ТРОГАЙ.',
    [stealth('REACH THE HOSTAGE ROOM', { g: 3, c: 1, alarmW: 'gg' }),
     rescue('FREE THE HOSTAGES', 3, { foes: 'gg', timer: 150, tl: 'EXECUTION IN', after: 'rr' }),
     fight('BREAK OUT', ['ggg', 'rrg', 'ggh'])]);

  // ===================================================== АКТ III — взрывы и тяжёлые бои
  M(28, 'DEMOLITION', 'Blow the wall.<br>Plant the charges.', '[09:10:22] TASK 28 COMPLETE. STRUCTURE DESTROYED', 'yard', 1.1, ['glock', 'ak'],
    'DEMOLITION SITE — TOWER 2',
    'СНОСИМ ВСЁ ПО ПЛАНУ. СНАЧАЛА ЗАЧИСТКА, ПОТОМ СТЕНА, ПОТОМ ОСНОВНОЙ ЗАРЯД. У ТЕБЯ ЕСТЬ C4 И ГРАНАТЫ.',
    [fight('CLEAR THE LOT', ['ggg', 'rrg'], { barrels: 3, gad: [['c4', 2], ['frag', 2]] }),
     blast('BLOW THE WALL', { after: 'gg' }),
     plant('PLANT THE MAIN CHARGE', 7, 18, [[2, 'gg'], [5, 'rr']], { foes: 'g' }),
     blast('BLOW THE LAST WALL', { after: 'rrg' }),
     fight('FINISH THE CREW', ['ggh'])]);

  M(29, 'GAS LEAK', 'Close the valve.<br>Stay out of the gas.', '[09:24:40] TASK 29 COMPLETE. VALVE CLOSED', 'lab', 1.1, ['glock', 'ak'],
    'CHEMICAL PLANT — UNIT 4',
    'ТРУБЫ ПРОРВАЛО. ГАЗ ПОДНИМАЕТСЯ ВОЛНАМИ — ПРЯЧЬСЯ ЗА УКРЫТИЯМИ. ЗАКРОЙ ВЕНТИЛЬ И УХОДИ.',
    [fight('SURVIVE THE LEAK', ['gg', 'rrg', 'ggg'], { bays: 1, sl: 'GAS' }),
     hack('CLOSE THE MAIN VALVE', seq(5, 'MAIN VALVE'), { atk: 'rr', bays: 1, sl: 'GAS' }),
     fight('CLEAR THE LOWER LEVEL', ['ggg', 'hrr'], { bays: 1, sl: 'GAS' }),
     run('RUN FROM THE FIRE WALL', 2.0, { foes: 'rr' })]);

  M(30, 'DIVERSION', 'Set the decoy charge.<br>Cross the bunker.', '[09:38:15] TASK 30 COMPLETE. GUARDS DRAWN OFF', 'bunker', 1.1, ['glock', 'ak', 'shotgun'],
    'MILITARY BUNKER — GATE 2',
    'ПУСТЬ ОНИ БЕГУТ К ВЗРЫВУ. ЗАЛОЖИ ЗАРЯД ДАЛЕКО ОТ ЦЕЛИ, А САМ ИДИ ТИХО ПО КОРИДОРУ. ДРОБОВИК — НА ЯЩИКЕ.',
    [plant('SET THE DECOY CHARGE', 6, 16, [[3, 'gg'], [6, 'rr']], { get: ['shotgun'], gad: [['frag', 2]] }),
     stealth('SNEAK ACROSS THE BUNKER', { g: 3, c: 1, hk: seq(5, 'BUNKER LOCK') }),
     blast('BLOW THE ARMORY WALL', { gad: [['c4', 2]], after: 'ggh' }),
     fight('CLEAR THE ARMORY', ['ggg', 'rrg', 'hh'])]);

  M(31, 'CONVOY', 'Stop the convoy.<br>Take the truck.', '[09:53:02] TASK 31 COMPLETE. CONVOY STOPPED', 'dock', 1.1, ['glock', 'ak'],
    'HIGHWAY 9 — CHECKPOINT',
    'КОЛОННА ИДЁТ ЧЕРЕЗ ПОСТ. ЗАЧИСТИ ПОСТ, ВЗОРВИ ГРУЗОВИК И ЗАБЕРИ КОНТЕЙНЕР. ТЯЖЁЛАЯ ПЕХОТА ЖДЁТ ПОД ПРИКРЫТИЕМ.',
    [fight('CLEAR THE CHECKPOINT', ['ggg', 'rrg', 'gggr'], { barrels: 3, gad: [['c4', 2], ['frag', 2]] }),
     plant('SET THE CHARGE ON THE TRUCK', 7, 16, [[2, 'gg'], [5, 'rrg']]),
     blast('BLOW THE CONTAINER DOOR', { after: 'rrg' }),
     fight('DEFEAT THE ARMORED ESCORT', ['hh', 'ggh'])]);

  M(32, 'FLASHBANG', 'Blind them.<br>Finish the heavies.', '[10:07:55] TASK 32 COMPLETE. HEAVIES NEUTRALIZED', 'bunker', 1.1, ['glock', 'ak', 'shotgun'],
    'RIOT SQUAD BARRACKS',
    'ТЯЖЁЛЫЕ ВНУТРИ — ОНИ ПРОБЬЮТ ТЕБЯ НАСКВОЗЬ. БРОСАЙ СВЕТОШУМОВЫЕ И БЕЙ В ГОЛОВУ. ДРОБОВИК ПОМОЖЕТ.',
    [fight('CLEAR THE MESS HALL', ['ggg', 'rr', 'hg'], { get: ['shotgun'], gad: [['flash', 3]] }),
     fight('DEFEAT THE VANGUARD', ['hh', 'rrh'], { gad: [['flash', 3], ['frag', 1]] }),
     fight('DEFEAT THE SQUAD', ['hhr', 'gghh'], { gad: [['flash', 2]] })]);

  M(33, 'DEMO DERBY', 'Survive the arena.<br>Barrels are your friends.', '[10:22:33] TASK 33 COMPLETE. ARENA CLEARED', 'yard', 1.1, ['glock', 'ak', 'shotgun'],
    'DEMOLITION ARENA — PIT 1',
    'ТОЛПА ЖДЁТ ШОУ. БОЧКИ НА ПОЛЕ ВЗРЫВАЮТСЯ ОТ ЛЮБОЙ ПУЛИ. ВЫЖИВИ — И МЫ ЗАБИРАЕМ ПРИЗ.',
    [fight('SURVIVE ROUND 1', ['ggg', 'rrg'], { barrels: 8, dens: 0.5 }),
     fight('SURVIVE ROUND 2', ['rrr', 'hgg', 'ggr'], { barrels: 10, dens: 0.5 }),
     fight('SURVIVE THE FINAL ROUND', ['hhrr', 'ggg', 'rrhh'], { barrels: 10, dens: 0.4 })], { music: 'arena' });

  // ===================================================== АКТ IV — призрак
  M(34, 'NIGHT SHIFT', 'The lights are off.<br>So are the cameras.', '[10:37:20] TASK 34 COMPLETE. OFFICE EMPTIED', 'office', 1.2, ['glock', 'ak'],
    'NEXA INDUSTRIES — NIGHT SHIFT',
    'СВЕТ ВЫКЛЮЧЕН — ФОНАРЬ ЕСТЬ, НО ОХРАНА СЛЫШИТ ШАГИ. ТИХО ДО ТЕРМИНАЛА, ПОТОМ ВЗЛОМ.',
    [stealth('SNEAK TO THE SERVER ROOM', { g: 2, c: 1, dark: 0.35, hk: seq(5, 'NIGHT LOCK') }),
     stealth('CROSS THE OPEN FLOOR', { g: 3, c: 1, dark: 0.35, hk: seq(6, 'FLOOR LOCK') }),
     hack('PULL THE FILES', sync('FILE SERVER'), { dark: 0.35, atk: 'gg' }),
     fight('FIGHT IN THE DARK', ['ggg', 'rrg', 'gh'], { dark: 0.35 })]);

  M(35, 'GLASS HOUSE', 'Lasers everywhere.<br>Take your time.', '[10:52:08] TASK 35 COMPLETE. NO ALARMS', 'mansion', 1.2, ['glock', 'ak'],
    'GLASS HOUSE — PENTHOUSE',
    'ДОМ ИЗ СТЕКЛА, ЛУЧИ ПОВСЮДУ, КАМЕРЫ НАД ПОТОЛКОМ. ДВИГАЙСЯ МЕДЛЕННО И ЖДИ ПРОМЕЖУТКОВ МЕЖДУ ВСПЫШКАМИ.',
    [stealth('CROSS THE LASER HALL', { g: 1, c: 2, l: 3, hk: match('LASER CONTROL') }),
     stealth('CROSS THE GALLERY', { g: 3, c: 3, hk: seq(5, 'GALLERY LOCK') }),
     hack('OPEN THE SAFE', seq(6, 'SAFE'), { atk: 'rr', clear: true }),
     fight('BREAK OUT OF THE GLASS HOUSE', ['ggg', 'rrg', 'hh'])]);

  M(36, 'THE LIBRARIAN', 'Four pages are missing.<br>Find them.', '[11:07:14] TASK 36 COMPLETE. ARCHIVE COMPLETE', 'lab', 1.2, ['glock', 'ak'],
    'NEXA ARCHIVE — STACKS',
    'В ХРАНИЛИЩЕ НЕ ХВАТАЕТ ЧЕТЫРЁХ СТРАНИЦ ДОСЬЕ. БИБЛИОТЕКАРЬ ХРАНИТ ИХ В СТЕЛЛАЖАХ. СОБЕРИ ВСЁ И ВЫХОДИ.',
    [stealth('SNEAK TO THE CATALOG', { g: 2, c: 2, hk: seq(6, 'CATALOG') }),
     collect('FIND THE MISSING PAGES', 4, ['g', 'rg', 'ggr', 'rrg'], { lbl: 'PAGE', use: 'TAKE PAGE' }),
     stealth('LEAVE THE STACKS', { g: 3, c: 2, alarmW: 'ggr' }),
     fight('SURVIVE THE ALARM', ['ggg', 'hhr'])]);

  M(37, 'GHOST', 'No alarms.<br>No witnesses.', '[11:21:50] TASK 37 COMPLETE. GHOST PROTOCOL OBSERVED', 'vault', 1.2, ['glock'],
    'NEXA VAULT — LEVEL 0',
    'ПРИЗРАК. ОДНА ТРЕВОГА — И ВСЁ СНАЧАЛА. ЗАМЕТЯТ — ПРОВАЛ. ДВИГАЙСЯ ЛЕГКО И ЖДИ ПРОМЕЖУТКОВ МЕЖДУ ВСПЫШКАМИ.',
    [stealth('SECTOR 1 — NO ALARMS', { g: 2, c: 1, l: 1 }),
     stealth('SECTOR 2 — NO ALARMS', { g: 3, c: 2, hk: seq(4, 'GHOST LOCK 1') }),
     stealth('SECTOR 3 — NO ALARMS', { g: 3, c: 2, l: 2, hk: sync('GHOST LOCK 2') }),
     stealth('SECTOR 4 — NO ALARMS', { g: 4, c: 3, l: 2, hk: match('GHOST LOCK 3') }),
     hold('WIPE THE LOGS', 18, [], { label: 'WIPE THE SERVER', meter: 'WIPING' })], { ghost: true });

  M(38, 'SNIPER NEST', 'Take the sniper rifle.<br>Clear the roofs.', '[11:36:47] TASK 38 COMPLETE. ROOFTOPS CLEARED', 'roof', 1.2, ['glock', 'ak'],
    'ROOFTOPS — BANK DISTRICT',
    'ТЕБЕ ВЫДАЮТ ВИНТОВКУ. ПКМ — ПРИЦЕЛ, ВЫСТРЕЛ В ГОЛОВУ — ОДИН ПАТРОН. ПОСЛЕ ВЫСТРЕЛА ОСТАЛЬНЫЕ ПОБЕГУТ К ТЕБЕ — ПЕРЕКЛЮЧИСЬ НА АВТОМАТ.',
    [snipe('CLEAR THE FIRST ROOF', 5, ['gg']),
     snipe('CLEAR THE SECOND ROOF', 6, ['ggr']),
     snipe('CLEAR THE LAST ROOF', 7, ['gghh'])]);

  // ===================================================== АКТ V — броня и осада
  M(39, 'HEAVY ARMOR', 'Heavy troops hold the hall.<br>Break through.', '[11:52:19] TASK 39 COMPLETE. HEAVIES DOWN', 'bunker', 1.35, ['ak', 'shotgun'],
    'ARMORY — HALL 7',
    'ТЯЖЁЛАЯ ПЕХОТА. ПУЛИ В ТУЛОВИЩЕ ОНИ ПОЧТИ НЕ ЧУВСТВУЮТ. ЦЕЛЬСЯ В ГОЛОВУ ИЛИ БЕРИ ДРОБОВИК.',
    [fight('CLEAR THE HALL', ['hg', 'hrr', 'ggh'], { gad: [['frag', 2], ['flash', 2]] }),
     fight('CLEAR THE CORRIDOR', ['hh', 'ggh', 'hhr'], { gad: [['frag', 2]] }),
     blast('BLOW THE ARMORY DOOR', { gad: [['c4', 2]], after: 'hhg' }),
     fight('DEFEAT THE GUARD', ['hhh', 'hhrr'])]);

  M(40, 'BRIDGE', 'Cross the bridge.<br>Do not stop.', '[12:08:03] TASK 40 COMPLETE. BRIDGE CROSSED', 'bridge', 1.35, ['ak', 'shotgun'],
    'RIVER BRIDGE — NORTH SPAN',
    'МОСТ УЗКИЙ, УКРЫТИЙ ПОЧТИ НЕТ. МАШИНЫ ПЕРЕКРЫЛИ ПОЛОСЫ. ИДИ ВПЕРЁД, СТРЕЛЯЙ ИЗ-ЗА КАПОТОВ.',
    [fight('CLEAR THE SOUTH SPAN', ['ggg', 'rrg', 'gggr'], { cover: 'cars' }),
     run('RUN — THE SPAN IS COLLAPSING', 2.0, { foes: 'rrr' }),
     blast('BLOW THE ROADBLOCK', { gad: [['c4', 2]], after: 'rrg' }),
     fight('CLEAR THE NORTH SPAN', ['ggh', 'rrh', 'hhg'], { cover: 'cars' })]);

  M(41, 'SUBWAY RUSH', 'Rush hour.<br>Two minutes.', '[12:21:47] TASK 41 COMPLETE. LINE CLEARED', 'metro', 1.35, ['ak', 'shotgun'],
    'METRO — LINE 3 TERMINUS',
    'ДВЕ МИНУТЫ ДО ОТПРАВЛЕНИЯ. РАШЕРЫ ВЫХОДЯТ ИЗ ВАГОНОВ ПО ОДНОМУ И ПО ТРОЕ. НЕ ЖДИ — ИДИ ВПЕРЁД.',
    [fight('CLEAR THE PLATFORM', ['rrr', 'rrg', 'rrrr'], { timer: 120, tl: 'TRAIN LEAVES IN' }),
     run('RUN TO THE LAST CAR', 2.1, { foes: 'rrr', timer: 60, tl: 'DEPARTURE IN' }),
     fight('CLEAR THE LAST CAR', ['rrrg', 'hrr', 'rrgg'])]);

  M(42, 'SIEGE', 'Hold the bunker.<br>Three waves.', '[12:36:28] TASK 42 COMPLETE. SIEGE BROKEN', 'bunker', 1.35, ['ak', 'shotgun'],
    'COMMAND BUNKER — LEVEL 2',
    'ОНИ ИДУТ ВОЛНАМИ. ГЕНЕРАТОРЫ ДАЮТ СВЕТ И ДВЕРИ. ЗАПУСКАЙ КАЖДЫЙ И ДЕРЖИСЬ, ПОКА ПОЛНОСТЬЮ НЕ ЗАГРУЗИТСЯ.',
    [hold('HOLD GENERATOR 1', 24, [[3, 'gg'], [10, 'rrg'], [17, 'ggh']], { label: 'START GENERATOR 1', gad: [['frag', 2]] }),
     hold('HOLD GENERATOR 2', 26, [[3, 'rrg'], [10, 'hg'], [18, 'rrrg']], { label: 'START GENERATOR 2', gad: [['flash', 2]] }),
     hold('HOLD GENERATOR 3', 28, [[3, 'hh'], [10, 'rrrg'], [18, 'hhg'], [24, 'rr']], { label: 'START GENERATOR 3', gad: [['frag', 2]] }),
     fight('FINISH THE ASSAULT', ['hh', 'hhrr'])]);

  M(43, 'TRAITOR', 'The traitor wears armor.<br>Kill him.', '[12:52:14] TASK 43 COMPLETE. TRAITOR ELIMINATED', 'mansion', 1.35, ['ak', 'shotgun'],
    'RESIDENCE — MASTER SUITE',
    'ЭТО ТОТ, КТО ПРОДАЛ ТЕБЯ. ТИХО ДО ЕГО КОМНАТЫ, ПОТОМ БОЙ. ОН В БРОНЕ — ЦЕЛЬСЯ В ГОЛОВУ.',
    [stealth('SNEAK TO THE SUITE', { g: 3, c: 2, alarmW: 'ggh' }),
     fight('BREAK THE BODYGUARD', ['hh', 'ggh', 'hrr'], { gad: [['frag', 2]] }),
     boss('ELIMINATE THE TRAITOR', 0.3, { bname: 'TRAITOR', bsay: 'ЭТО ОН. БРОНЯ ДЕРЖИТ ПУЛИ — ЦЕЛЬСЯ В ГОЛОВУ.', adds: [[0.5, 'hh']] })]);

  M(44, 'THE WARDEN RETURNS', 'The Warden is back.<br>End it.', '[13:07:51] TASK 44 COMPLETE. WARDEN DEFEATED', 'bunker', 1.35, ['ak', 'shotgun'],
    'WARDEN CHAMBER — DEEP LEVEL',
    'СМОТРИТЕЛЬ ВЕРНУЛСЯ. ЭТО ВТОРОЙ РАЗ, КОГДА ТЫ ВСТРЕЧАЕШЬСЯ С НИМ. ЗДЕСЬ БОЧЕК НЕТ, ЗАТО ЕСТЬ ГРАНАТЫ.',
    [fight('CLEAR THE ANTECHAMBER', ['hh', 'ggh', 'hrr'], { gad: [['frag', 3], ['flash', 2]] }),
     fight('CLEAR THE GUARD ROOM', ['hhh', 'hhrr'], { gad: [['frag', 2]] }),
     boss('DEFEAT THE WARDEN', 0.7, { bname: 'WARDEN', gad: [['frag', 2]], adds: [[0.7, 'rrr'], [0.45, 'hh'], [0.2, 'rrrr']] })]);

  // ===================================================== АКТ VI — подготовка к ограблению
  M(45, 'BLUEPRINTS', 'Steal the blueprints.<br>Take the vault plan.', '[13:23:09] TASK 45 COMPLETE. BLUEPRINTS STOLEN', 'lab', 1.4, ['ak', 'shotgun', 'glock'],
    'ARCHITECT BUREAU — FLOOR 40',
    'ПЛАНЫ ХРАНИЛИЩА ЛЕЖАТ У АРХИТЕКТОРА. ТИХО, ВЗЛОМ, ПОТОМ ЧЕТЫРЕ ЛИСТА — И БЕГОМ ВНИЗ.',
    [stealth('SNEAK INTO THE BUREAU', { g: 3, c: 2, hk: seq(6, 'BUREAU LOCK') }),
     hack('UNLOCK THE PLAN CABINET', sync('PLAN CABINET'), { atk: 'rrg', clear: true }),
     collect('COLLECT THE BLUEPRINTS', 4, ['gg', 'rrg', 'ggh', 'hrr'], { lbl: 'BLUEPRINT', use: 'TAKE BLUEPRINT' }),
     run('RUN — THE BUILDING IS SEALING', 2.0, { foes: 'rrr' })]);

  M(46, 'REHEARSAL', 'Rehearse the job.<br>One mistake — start over.', '[13:38:36] TASK 46 COMPLETE. READY FOR THE HEIST', 'vault', 1.4, ['ak', 'shotgun', 'glock'],
    'NEXA TRAINING VAULT',
    'ПОСЛЕДНЯЯ РЕПЕТИЦИЯ ПЕРЕД НАСТОЯЩИМ ДЕЛОМ. ТИХО ДО СЕЙФА, ВЗРЫВ СТЕНЫ, ГРАБЁЖ И ЗАБЕГ ПОД ТАЙМЕРОМ.',
    [stealth('SNEAK TO THE VAULT', { g: 3, c: 2, l: 1, hk: seq(6, 'VAULT DOOR') }),
     blast('BLOW THE VAULT WALL', { gad: [['c4', 2], ['frag', 2]], after: 'rrh' }),
     hold('LOAD THE LOOT', 24, [[4, 'gg'], [10, 'rrg'], [16, 'hhg']], { label: 'START LOADING', meter: 'LOADING' }),
     run('ESCAPE BEFORE LOCKDOWN', 2.1, { foes: 'rrrg', timer: 70, tl: 'LOCKDOWN IN' })]);

  // 47 — ограбление (миссия в heist.js): только метаданные для списка NEXA/OS
  MS.define({ id: 47, title: 'COLD STORAGE', desc: 'The big job.<br>Quiet or loud.', log: '[13:58:30] TASK 47 COMPLETE. COLD STORAGE EMPTIED' });

  // 48 — финал (миссия в finale48.js): только метаданные. Весь текст миссии — английский во всех языках
  MS.define({ id: 48, title: 'REMEMBER: NOT A WORD OF RUSSIAN', desc: 'Remember.<br>Not a word.', log: '[23:59:59] TASK 48 COMPLETE. NEXA INDUSTRIES CLOSED' });
}());
