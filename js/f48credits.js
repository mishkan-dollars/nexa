// NEXA: миссия 48 — титры (ФАЗА credits, после «МИССИЯ ВЫПОЛНЕНА»).
// Текст по-русски во всех сборках (CREDITS_48.md — слово в слово от автора). Музыка assets/end.m4a, прокрутка растянута ровно на длину трека.
// На заднем плане — лучшие моменты со всех миссий (js/clips.js → IndexedDB; нет записей — тёмный фон с шумом).
// После титров — крупно «СПАСИБО ЗА ИГРУ!», затем r.finish(true). Удержание пробела 1.2 с — перейти к финальной надписи / выйти.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.PH || !C.f48.PH.end || !C.f48.K || !C.f48.K.track || !C.f48.K.hook) return;
  const F = C.f48, K = F.K, PH = F.PH;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // [подпись, значение, 1 = «роль» (мельче, ближе к предыдущей)]
  const LINES = [
  ["СЦЕНАРИЙ", "МИШКАН"],
  ["ГЛАВНЫЙ ВЗЛОМЩИК ДВЕРЕЙ", "МИШКАН"],
  ["СТУДИЯ РАЗРАБОТКИ", "EPICLINES STUDIO"],
  ["РОЛЬ ДИКТОРА", "МИШКАН", 1],
  ["РОЛЬ ГЛАВНОГО ПЕРСОНАЖА", "???", 1],
  ["РОЛЬ ДЕВУШКИ ДИКТОРА", "ЛЕВАЯ РУКА МИШКАНА", 1],
  ["РОЛЬ ОХРАННИКОВ", "ПО ОБЬЯВЛЕНИЮ", 1],
  ["РОЛЬ ЗЛОДЕЯ", "ЛЕВЫЙ ТИП", 1],
  ["ДИКТОР / ГОЛОС В НАУШНИКЕ", "РАНДОМ ГОЛОС С НЕЙРОНКИ"],
  ["ДЕВУШКА ДИКТОРА", "ТА САМАЯ С ОГРОМНЫМИ... ГЛАЗАМИ"],
  ["ТОТ САМЫЙ ЧЕЛ В КОМНАТЕ С КОМПОМ", "ТОТ, ЧТО ПОЧИСТИЛ ИСТОРИЮ БРАУЗЕРА ДО ВАШЕГО ПРИХОДА"],
  ["ГЛАВНЫЙ ПОСТРАДАВШИЙ", "ОПЕРАТОР ТЕРМИНАЛА ИЗ 2-Й МИССИИ"],
  ["ПОСТАВЩИК АДРЕНАЛИНА", "АПТЕКАРЬ БЕЗ ЛИЦЕНЗИИ"],
  ["ГЛАВНЫЙ СПОНСОР ФИНАЛА", "ПУСТОЙ КОШЕЛЕК МИШКАНА"],
  ["ФИЗИКА ВЫБИВАНИЯ ДВЕРЕЙ", "УДАР ПРАВОЙ НОГОЙ"],
  ["МУЗЫКАЛЬНОЕ НАСИЛИЕ", "ПЕРЕГРУЖЕННЫЙ БАС НА 100%"],
  ["ТЕСТИРОВАНИЕ МЕХАНИКИ ПЫТОК", "НИ ОДИН ОПЕРАТОР НЕ ПОСТРАДАЛ (ПОЧТИ)"],
  ["ПЛАН ФИНАЛЬНОГО НАЛЕТА", "НАРИСОВАН НА САЛФЕТКЕ В 3 ЧАСА НОЧИ"],
  ["ГЛАВНЫЙ ИНЖЕНЕР СЕТЕЙ", "ПАРЕНЬ, ВЫДЕРНУВШИЙ КАБЕЛЬ ИЗ РОЗЕТКИ"],
  ["ОСОБАЯ БЛАГОДАРНОСТЬ", "ВСЕМ, КТО НЕ НАЖАЛ ESC ВО ВРЕМЯ КАТСЦЕН"],
  ["ИЗДАТЕЛЬ И ВДОХНОВИТЕЛЬ", "EPICLINES STUDIO & МИШКАН"],
  ["МОНТАЖ И РЕНДЕР", "ПЛАНШЕТ, КОТОРЫЙ ЕДВА НЕ СГОРЕЛ"],
  ["ПОСТАВКА ТЯЖЕЛОГО ОРУЖИЯ", "БАГАЖНИК ЧЕРНОГО СЕДАНА"],
  ["ЭЛЕКТРОШОКЕР ДЛЯ ДОПРОСА", "КИТАЙСКИЙ ФОНАРИК НА 10000 ВОЛЬТ"],
  ["РАЗРАБОТКА ИНТИМИДАЦИИ", "ЗЛОБНЫЙ ВЗГЛЯД МИШКАНА"],
  ["ГЛАВНЫЙ СПЕЦНАЗОВЕЦ", "БОТ, КОТОРЫЙ ЗАСТРЯЛ В ТЕКСТУРАХ"],
  ["ТАЙНЫЕ ШИФРЫ И ПАРОЛИ", "admin123"],
  ["НАСТРОЙКА BPM СЕРДЦА", "ПАНИКА ПОСЛЕ ТРЕТЬЕГО ЭНЕРГЕТИКА"],
  ["ЗВУКОВОЙ РЕЖИССЕР", "ЧЕЛОВЕК, КУПИВШИЙ САМЫЕ ГРОМКИЕ КОЛОНКИ"],
  ["КАМЕРА В КАТСЦЕНАХ", "РУКИ ДРОЖАЛИ ОТ АДРЕНАЛИНА"],
  ["ТАКТИЧЕСКИЙ КОНСУЛЬТАНТ", "МИШКАН ПОСЛЕ ПРОХОЖДЕНИЯ GTA V"],
  ["ОХРАНА ЗДАНИЯ", "РЕБЯТА С МИНИМАЛЬНОЙ ЗАРПЛАТОЙ"],
  ["ВЕЩЕВОЙ СОСТАВ", "СПОРТИВКИ И ТАКТИЧЕСКИЙ ЖИЛЕТ"],
  ["ГЛАВНЫЙ БОМБЕР", "ЧЕЛОВЕК С ГАЗОВЫМ БАЛЛОНОМ И ПАЯЛЬНИКОМ"],
  ["ВЫБИВАТЕЛЬ ОКОРУЖЕНИЯ", "HTML5 ДВИЖОК НА ПЕДАЛЬНОЙ ТЯГЕ"],
  ["СИСТЕМА СУБТИТРОВ", "ПИСАЛАСЬ В ПОСЛЕДНИЕ 10 МИНУТ"],
  ["ЛОГИСТИКА И ТРАНСПОРТ", "УГНАННЫЙ ФУРГОН БЕЗ НОМЕРОВ"],
  ["КООРОДИНАТОР ПОБЕГА", "ДЕВУШКА С НАВИГАТОРОМ 2008 ГОДА"],
  ["ИСПРАВЛЕНИЕ БАГОВ В КОДЕ", "КЛОД И МИШКАН В 4 УТРА"],
  ["ХАКЕРСКАЯ АТАКА", "КЛИКАНЬЕ ПО КЛАВИАТУРЕ СО СКОРОСТЬЮ СВЕТА"],
  ["ДИЗАЙН ИНТЕРФЕЙСА", "МИНИМАЛИЗМ ИЛИ ПРОСТО ЛЕНЬ"],
  ["КАЛИБРОВКА ГЛУШИТЕЛЕЙ", "ПАРА ПОРОЛОНОВЫХ ГУБОК"],
  ["НАЧАЛЬНИК БЕЗОПАСНОСТИ", "СПАЛ НА РАБОЧЕМ МЕСТЕ"],
  ["ДЫМОВАЯ ЗАВЕСА", "СГОРЕВШИЙ ТОСТ НА КУХНЕ"],
  ["УПРАВЛЕНИЕ ХАОСОМ", "КРАСНАЯ КНОПКА, КОТОРУЮ НЕ СТОИЛО НАЖИМАТЬ"],
  ["ПОСТАВЩИК ГОРЮЧЕГО", "ЗАПРАВКА НА ВЫЕЗДЕ ИЗ ГОРОДА"],
  ["ГЛАВНЫЙ СТРАТЕГ", "СГЕНЕРИРОВАННЫЙ ИИ-ГОЛОС В НАУШНИКАХ"],
  ["ШУМОВЫЕ ЭФФЕКТЫ", "ПАДЕНИЕ КАСТРЮЛИ В 2 ЧАСА НОЧИ"],
  ["БАГФИКСЕР", "СВЯТАЯ ВОДА И ПЕРЕЗАГРУЗКА"],
  ["ГЛАВНЫЙ КАПКУТЕР", "ТАБЛЕТКА CAPCUT"],
  ["КОНТРОЛЬ ПУЛЬСА", "АДРЕНАЛИН ПРЯМО В ВЕНУ"],
  ["ТЕСТИРОВЩИК СТЕЛСА", "ВРАГИ С ИНФРАКРАСНЫМ ЗРЕНИЕМ"],
  ["ХРАНИТЕЛЬ ЛОРА", "МИШКАН И ЕГО БЛОКНОТ"],
  ["ПРОДЮСЕР", "МИШКАН"],
  ["ФИНАЛЬНОЕ НАПУТСТВИЕ", "ПОМНИ... НИ СЛОВА ПО-РУССКИ."]
  ];

  function css() {
    if (document.getElementById('f48-cr-css')) return;
    const s = document.createElement('style'); s.id = 'f48-cr-css';
    s.textContent = `
.f48-cr{position:absolute;inset:0;z-index:40;background:#000;overflow:hidden;color:#eee;opacity:0;transition:opacity 1.6s;pointer-events:none}
.f48-cr.on{opacity:1}
.f48-cr .bg{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 60%,#1a1210 0%,#050505 70%);animation:f48crbg 14s ease-in-out infinite alternate}
@keyframes f48crbg{from{filter:brightness(.8)}to{filter:brightness(1.35)}}
.f48-cr video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 1.5s linear;filter:saturate(.7) contrast(1.1) brightness(.58)}
.f48-cr video.on{opacity:1}
.f48-cr .shade{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,.22) 0%,rgba(0,0,0,.78) 100%),linear-gradient(90deg,rgba(0,0,0,.5),rgba(0,0,0,.12) 28%,rgba(0,0,0,.12) 72%,rgba(0,0,0,.5))}
.f48-cr .scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.2) 0 1px,transparent 1px 3px);mix-blend-mode:multiply}
.f48-cr .bar{position:absolute;left:0;right:0;height:9%;background:#000}
.f48-cr .bar.t{top:0}.f48-cr .bar.b{bottom:0}
.f48-cr .roll{position:absolute;left:0;right:0;top:0;text-align:center;padding:0 7vw;will-change:transform}
.f48-cr .it{margin:0 0 clamp(36px,8vh,76px)}
.f48-cr .it.sub{margin:0 0 clamp(14px,3vh,28px)}
.f48-cr .it.gap{margin-top:clamp(36px,8vh,76px)}
.f48-cr .it small{display:block;font:500 clamp(13px,1.6vw,22px)/1.3 Oswald,Teko,sans-serif;letter-spacing:.32em;color:#a9a9a9;text-shadow:0 2px 8px #000}
.f48-cr .it b{display:block;margin-top:9px;font:600 clamp(20px,3.1vw,44px)/1.15 Oswald,Teko,sans-serif;letter-spacing:.1em;color:#f4f4f4;text-shadow:0 2px 16px #000}
.f48-cr .it.sub small{font-size:clamp(11px,1.25vw,17px)}
.f48-cr .it.sub b{margin-top:4px;font-size:clamp(16px,2.2vw,30px);color:#e2e2e2}
.f48-cr .it.last b{color:#ff4a3a;text-shadow:0 0 22px rgba(255,60,40,.45),0 2px 16px #000}
.f48-cr .thx{position:absolute;inset:0;display:grid;place-items:center;opacity:0;transition:opacity 2.4s ease-out;background:rgba(0,0,0,.55)}
.f48-cr .thx.on{opacity:1}
.f48-cr .thx h1{margin:0;padding:0 5vw;text-align:center;font:700 clamp(30px,8vw,118px)/1.1 Oswald,Teko,sans-serif;letter-spacing:.12em;color:#fff;text-shadow:0 0 46px rgba(255,60,40,.6),0 4px 22px #000;transform:scale(.94);transition:transform 9s ease-out}
.f48-cr .thx.on h1{transform:scale(1.04)}
.f48-cr .skip{position:absolute;right:3vw;bottom:2.2vh;font:500 clamp(10px,1vw,14px) Oswald,Teko,sans-serif;letter-spacing:.3em;color:#888;opacity:0;transition:opacity .4s}
.f48-cr .skip.on{opacity:1}
.f48-cr,.f48-cr *{font-family:Oswald,'Arial Narrow',sans-serif !important;font-size-adjust:none !important}
`;
    document.head.appendChild(s);
  }

  PH.credits = async function (r, st) {
    css(); K.css();
    K.lock(r);
    r.noPause = true;                                                            // во время титров паузу (Esc и т.п.) отключаем; setPause в missions.js это учитывает
    try { if (r.pausedUser) r.setPause(false); } catch (e) { /* пауза уже снята */ }
    K.cutFade(r, 1); K.black(r, 1, 0);
    K.amb.set(r, 'none', { fade: 0.5 });
    try { r.snd && r.snd.fight && r.snd.fight.hush && r.snd.fight.hush(); } catch (e) { /* без боевой музыки */ }

    // ---- записи со всех миссий (в том числе только что сыгранные куски этого финала)
    const NC = window.NexaClips;
    let clips = [];
    try { if (NC && NC.ok) { await NC.flush(); await NC.hold(true); clips = await NC.pick(18); } } catch (e) { clips = []; }

    // ---- DOM
    const el = document.createElement('div'); el.className = 'f48-cr';
    el.innerHTML = '<div class="bg"></div><video muted playsinline></video><video muted playsinline></video><div class="shade"></div><div class="scan"></div>' +
      '<div class="roll"></div><div class="bar t"></div><div class="bar b"></div><div class="thx"><h1></h1></div><div class="skip">HOLD SPACE TO SKIP</div>';
    const vids = el.querySelectorAll('video'), roll = el.querySelector('.roll'), thx = el.querySelector('.thx'), skip = el.querySelector('.skip');
    el.querySelector('h1').textContent = 'СПАСИБО ЗА ИГРУ!';
    LINES.forEach((l, i) => {
      const d = document.createElement('div'); d.className = 'it' + (l[2] ? ' sub' : '') + (l[2] && !LINES[i - 1][2] ? ' gap' : '') + (i === LINES.length - 1 ? ' last' : '');
      const s = document.createElement('small'); s.textContent = l[0];
      const b = document.createElement('b'); b.textContent = l[1];
      d.appendChild(s); d.appendChild(b); roll.appendChild(d);
    });
    r.layer.appendChild(el);
    if (!clips.length) vids.forEach((v) => v.remove());

    // ---- музыка и длительность
    const T = K.track(r, 'end.m4a', { vol: 1 });
    let D = 0;
    await new Promise((res) => {
      const done = () => { D = isFinite(T.el.duration) ? T.el.duration : 0; res(); };
      if (T.el.readyState >= 1) done(); else { T.el.addEventListener('loadedmetadata', done, { once: true }); setTimeout(done, 3000); }
    });
    if (!(D > 20)) D = 96;       // файла нет / метаданные не пришли — разумная длина
    T.dur = D;

    // ---- фоновые клипы: два <video>, перекрёстное затухание; следующий готовится заранее
    let vi = 0, ci = 0, clipT = 0, showFor = 5;
    const load = (v, c) => { v.pause(); v.src = c.url; v.loop = false; v.playbackRate = 0.9; try { v.load(); } catch (e) { /* ничего */ } };
    const swapIn = () => {
      const a = vids[vi], b = vids[1 - vi]; if (!a || !b) return;
      a.classList.add('on'); const p = a.play(); if (p && p.catch) p.catch(() => {});
      b.classList.remove('on');
      vi = 1 - vi;
      const c = clips[ci % clips.length]; ci += 1;
      showFor = clamp((c.dur || 7000) / 1000 / 0.9 - 1.0, 3.2, 6.4);
      setTimeout(() => { if (!r.disposed && clips.length > 1) load(vids[vi], clips[ci % clips.length]); }, 1700);
    };
    if (clips.length) {
      load(vids[0], clips[0]); vids[0].addEventListener('loadeddata', () => { vids[0].classList.add('on'); const p = vids[0].play(); if (p && p.catch) p.catch(() => {}); }, { once: true });
      ci = 1; vi = 1; showFor = clamp((clips[0].dur || 7000) / 1000 / 0.9 - 1.0, 3.2, 6.4);
      if (clips.length > 1) load(vids[1], clips[1 % clips.length]);
      if (clips.length === 1) vids[0].loop = true;
    }

    // ---- пропуск: удержание пробела
    let held = 0, keyDown = false, skipTo = false;
    const kd = (e) => { if (e.code === 'Space' || e.code === 'Enter') { keyDown = true; skip.classList.add('on'); } };
    const ku = (e) => { if (e.code === 'Space' || e.code === 'Enter') { keyDown = false; held = 0; } };
    document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);

    // ---- поехали
    K.black(r, 0, 0);
    requestAnimationFrame(() => el.classList.add('on'));
    T.play(0);
    let t = 0, phase = 0, thxT = 0;
    const H = () => roll.scrollHeight, VH = () => el.clientHeight || 600;
    const off = K.hook(r, (dt) => {
      dt = Math.min(dt, 0.1);
      if (keyDown) { held += dt; if (held >= 1.2) { held = 0; skipTo = true; } }
      if (phase === 0) {
        t += dt;
        const u = clamp(t / D, 0, 1), vh = VH();
        roll.style.transform = 'translate3d(0,' + (vh * 0.92 - (vh * 0.92 + H()) * u).toFixed(1) + 'px,0)';
        if (clips.length > 1) { clipT += dt; if (clipT >= showFor) { clipT = 0; swapIn(); } }
        if (t >= D || skipTo) { phase = 1; skipTo = false; T.stop(2.0); thx.classList.add('on'); skip.classList.remove('on'); }
      } else if (phase === 1) {
        thxT += dt;
        if (skipTo && thxT > 1) phase = 2;
        if (thxT >= 8.5) phase = 2;
      }
    });
    while (phase < 2 && !r.disposed) await r.wait(0.1);
    off();
    document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku);
    if (r.disposed) return;
    await K.black(r, 1, 1.8);
    el.remove();
    T.dispose();
    NC && NC.revoke && NC.revoke(clips);
    await r.wait(0.4);
    r.finish(true);
  };
}());
