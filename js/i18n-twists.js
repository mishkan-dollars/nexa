// NEXA: «удивляющие штуки» миссий 8–47 (js/twists*.js). Исходный язык строк — en (HUD, подсказки, цели) или ru (реплики-субтитры); массив = переводы на остальные языки в порядке (en|ru), de.
(function () {
  'use strict';
  if (!window.I18N) return;
  I18N.add('en', {
    // --- общее
    "+{0} CR {s0}": ["+{0} CR {s0}", "+{0} CR {s0}"],
    "{s0} — {0}%": ["{s0} — {0}%", "{s0} — {0}%"],
    // --- 10 LIFT SHAFT
    "FREE FALL — IMPACT IN {0}": ["СВОБОДНОЕ ПАДЕНИЕ — УДАР ЧЕРЕЗ {0}", "FREIER FALL — AUFPRALL IN {0}"],
    "THE CABLE SNAPPED! NO COVER — CROUCH [C] TO BRACE FOR IMPACT": ["ТРОС ОБОРВАЛСЯ! УКРЫТИЙ НЕТ — ПРИСЯДЬ [C], ЧТОБЫ СГРУППИРОВАТЬСЯ ПЕРЕД УДАРОМ", "DAS SEIL IST GERISSEN! KEINE DECKUNG — HOCKE DICH [C] HIN, UM DEN AUFPRALL ABZUFANGEN"],
    "THE CABLE SNAPPED! NO COVER — CROUCH TO BRACE FOR IMPACT": ["ТРОС ОБОРВАЛСЯ! УКРЫТИЙ НЕТ — ПРИСЯДЬ, ЧТОБЫ СГРУППИРОВАТЬСЯ ПЕРЕД УДАРОМ", "DAS SEIL IST GERISSEN! KEINE DECKUNG — GEH IN DIE HOCKE, UM DEN AUFPRALL ABZUFANGEN"],
    "BRACED FOR IMPACT": ["СГРУППИРОВАЛСЯ ПЕРЕД УДАРОМ", "AUFPRALL ABGEFEDERT"],
    "BRACED — NO DAMAGE": ["СГРУППИРОВАЛСЯ — УРОНА НЕТ", "ABGEFEDERT — KEIN SCHADEN"],
    "IMPACT": ["УДАР", "AUFPRALL"],
    // --- 11 BLACKOUT
    "TORCH": ["ФОНАРЬ", "TASCHENLAMPE"],
    "TORCH ON": ["ФОНАРЬ ВКЛЮЧЁН", "LAMPE AN"],
    "TORCH OFF — HIDDEN": ["ФОНАРЬ ВЫКЛЮЧЕН — ВАС НЕ ВИДНО", "LAMPE AUS — UNSICHTBAR"],
    "BATTERY EMPTY": ["БАТАРЕЯ РАЗРЯЖЕНА", "AKKU LEER"],
    "TORCH BATTERY EMPTY": ["БАТАРЕЯ ФОНАРЯ СЕЛА", "TASCHENLAMPEN-AKKU LEER"],
    "TORCH BATTERY +30 S": ["БАТАРЕЯ ФОНАРЯ +30 С", "LAMPEN-AKKU +30 S"],
    "TORCH BUTTON — SWITCH IT OFF AND THEY LOSE YOU (YOU LOSE THEM TOO)": ["КНОПКА ФОНАРЯ — ВЫКЛЮЧИ, И ОНИ ПОТЕРЯЮТ ТЕБЯ (ТЫ ИХ ТОЖЕ)", "LAMPEN-TASTE — SCHALTE SIE AUS, DANN VERLIEREN SIE DICH (DU SIE AUCH)"],
    "TORCH [T] — SWITCH IT OFF AND THEY LOSE YOU (YOU LOSE THEM TOO)": ["ФОНАРЬ [T] — ВЫКЛЮЧИ, И ОНИ ПОТЕРЯЮТ ТЕБЯ (ТЫ ИХ ТОЖЕ)", "LAMPE [T] — SCHALTE SIE AUS, DANN VERLIEREN SIE DICH (DU SIE AUCH)"],
    // --- 12 NIGHT TRAIN
    "SUBJECT 024 — STANDING ON THE PLATFORM, WATCHING THE TRAIN": ["СУБЪЕКТ 024 — СТОИТ НА ПЛАТФОРМЕ И СМОТРИТ НА ПОЕЗД", "SUBJEKT 024 — STEHT AUF DEM BAHNSTEIG UND BEOBACHTET DEN ZUG"],
    // --- 19 CLEANERS
    "NEXA ARCHIVE — PERSONAL FILE": ["АРХИВ NEXA — ЛИЧНОЕ ДЕЛО", "NEXA-ARCHIV — PERSONALAKTE"],
    "SUBJECT": ["СУБЪЕКТ", "SUBJEKT"],
    "TASKS COMPLETED": ["ЗАДАНИЙ ВЫПОЛНЕНО", "AUFTRÄGE ERLEDIGT"],
    "HOSTILES NEUTRALIZED": ["ВРАГОВ УСТРАНЕНО", "FEINDE ELIMINIERT"],
    "HEADSHOTS": ["ВЫСТРЕЛОВ В ГОЛОВУ", "KOPFSCHÜSSE"],
    "TIMES TERMINATED": ["РАЗ ПРЕКРАЩЕНО", "MAL BEENDET"],
    "FAVOURITE TOOL": ["ЛЮБИМЫЙ ИНСТРУМЕНТ", "LIEBLINGSWERKZEUG"],
    "TIME UNDER OBSERVATION": ["ВРЕМЯ ПОД НАБЛЮДЕНИЕМ", "ZEIT UNTER BEOBACHTUNG"],
    "NOTE: THE SUBJECT DIED {0} TIMES AND CAME BACK EVERY TIME.": ["ЗАМЕТКА: СУБЪЕКТ УМИРАЛ {0} РАЗ И КАЖДЫЙ РАЗ ВОЗВРАЩАЛСЯ.", "HINWEIS: DAS SUBJEKT STARB {0} MAL UND KAM JEDES MAL ZURÜCK."],
    "NOTE: THE SUBJECT DIED ONCE AND CAME BACK.": ["ЗАМЕТКА: СУБЪЕКТ УМЕР ОДИН РАЗ И ВЕРНУЛСЯ.", "HINWEIS: DAS SUBJEKT STARB EINMAL UND KAM ZURÜCK."],
    "NOTE: NO DEATHS ON FILE. NEXA FINDS THIS SUSPICIOUS.": ["ЗАМЕТКА: СМЕРТЕЙ В ДЕЛЕ НЕТ. В NEXA ЭТО СЧИТАЮТ ПОДОЗРИТЕЛЬНЫМ.", "HINWEIS: KEINE TODESFÄLLE VERMERKT. NEXA HÄLT DAS FÜR VERDÄCHTIG."],
    // --- 21 FIRST JOB
    "CONTAINER {0}": ["КОНТЕЙНЕР {0}", "CONTAINER {0}"],
    "OPEN CONTAINER {0}": ["ОТКРЫТЬ КОНТЕЙНЕР {0}", "CONTAINER {0} ÖFFNEN"],
    "TAKE THE PLUSH BEAR": ["ВЗЯТЬ ПЛЮШЕВОГО МИШКУ", "PLÜSCHBÄREN NEHMEN"],
    "DOCK LOG: CONTAINER 14 WAS LOGGED AS EMPTY. SOMEONE HAS BEEN INSIDE.": ["ЖУРНАЛ ПОРТА: КОНТЕЙНЕР 14 ЗАПИСАН КАК ПУСТОЙ. КТО-ТО ПОБЫВАЛ ВНУТРИ.", "HAFENLOGBUCH: CONTAINER 14 ALS LEER VERMERKT. JEMAND WAR DRIN."],
    "THE BEAR IS ALREADY IN YOUR COLLECTION": ["МИШКА УЖЕ В ВАШЕЙ КОЛЛЕКЦИИ", "DER BÄR IST SCHON IN DEINER SAMMLUNG"],
    "TOY UNLOCKED: BLACK BEAR": ["ИГРУШКА ОТКРЫТА: ЧЁРНЫЙ МИШКА", "SPIELZEUG FREIGESCHALTET: SCHWARZER BÄR"],
    "YOU ALREADY OWN THE BEAR": ["МИШКА У ВАС УЖЕ ЕСТЬ", "DEN BÄREN BESITZT DU SCHON"],
    "PLUSH BEAR": ["ПЛЮШЕВЫЙ МИШКА", "PLÜSCHBÄR"],
    // --- 26 WIRETAP
    "...THE WEST WALL CAMERA? DEAD SINCE MONDAY. NOBODY FIXED IT.": ["...КАМЕРА У ЗАПАДНОЙ СТЕНЫ? С ПОНЕДЕЛЬНИКА МЁРТВАЯ. НИКТО НЕ ЧИНИЛ.", "...DIE KAMERA AN DER WESTWAND? SEIT MONTAG TOT. KEINER HAT SIE REPARIERT."],
    "...THE EAST WALL CAMERA? DEAD SINCE MONDAY. NOBODY FIXED IT.": ["...КАМЕРА У ВОСТОЧНОЙ СТЕНЫ? С ПОНЕДЕЛЬНИКА МЁРТВАЯ. НИКТО НЕ ЧИНИЛ.", "...DIE KAMERA AN DER OSTWAND? SEIT MONTAG TOT. KEINER HAT SIE REPARIERT."],
    "...I'M GOING OUT FOR A SMOKE. COVER FOR ME, OK?": ["...ВЫЙДУ ПОКУРИТЬ. ПРИКРОЙ МЕНЯ, ЛАДНО?", "...ICH GEH MAL RAUCHEN. DECK MICH, OK?"],
    "...DID YOU SEE THE GAME LAST NIGHT?": ["...ТЫ ВИДЕЛ ВЧЕРАШНИЙ МАТЧ?", "...HAST DU DAS SPIEL GESTERN GESEHEN?"],
    "...THIS FLOOR SMELLS LIKE OLD COFFEE.": ["...НА ЭТОМ ЭТАЖЕ ПАХНЕТ ВЫДОХШИМСЯ КОФЕ.", "...AUF DIESEM STOCK RIECHT ES NACH ALTEM KAFFEE."],
    "...I HATE THE NIGHT SHIFT.": ["...НЕНАВИЖУ НОЧНЫЕ СМЕНЫ.", "...ICH HASSE DIE NACHTSCHICHT."],
    "...THEY WANT A REPORT BY MORNING. A REPORT ON WHAT?": ["...К УТРУ НУЖЕН ОТЧЁТ. ОТЧЁТ О ЧЁМ?", "...BIS MORGEN SOLL EIN BERICHT STEHEN. EIN BERICHT WOZU?"],
    "...MY WIFE SAYS I SNORE AT WORK TOO.": ["...ЖЕНА ГОВОРИТ, Я И НА РАБОТЕ ХРАПЛЮ.", "...MEINE FRAU SAGT, ICH SCHNARCHE AUCH BEI DER ARBEIT."],
    "...DON'T TELL ANYONE, BUT I NEVER CHECK THE STAIRS.": ["...ТОЛЬКО НИКОМУ: Я НИКОГДА НЕ ПРОВЕРЯЮ ЛЕСТНИЦУ.", "...SAG'S KEINEM, ABER DIE TREPPE KONTROLLIERE ICH NIE."],
    "INTEL: A CAMERA IS OFFLINE": ["РАЗВЕДДАННЫЕ: КАМЕРА ОТКЛЮЧЕНА", "INFO: EINE KAMERA IST AUSGEFALLEN"],
    "INTEL: A GUARD LEFT HIS POST": ["РАЗВЕДДАННЫЕ: ОХРАННИК ОТОШЁЛ С ПОСТА", "INFO: EIN WÄCHTER HAT SEINEN POSTEN VERLASSEN"],
    "GUARD CHATTER — LISTEN CLOSELY: SOME OF IT IS USEFUL": ["РАЗГОВОРЫ ОХРАНЫ — ВСЛУШАЙТЕСЬ: ЧАСТЬ ИЗ НИХ ПОЛЕЗНА", "WÄCHTERGESPRÄCH — HÖR GENAU ZU: MANCHES IST NÜTZLICH"],
    // --- 31 CONVOY
    "CONVOY MANIFEST": ["СПИСОК КОЛОННЫ", "KONVOI-MANIFEST"],
    "TARGET: STEADY LAMP, PLATE ENDS IN": ["ЦЕЛЬ: РОВНАЯ ЛАМПА, НОМЕР ЗАКАНЧИВАЕТСЯ НА", "ZIEL: DAUERLICHT, KENNZEICHEN ENDET AUF"],
    "WRONG TRUCK — EMPTY CARGO BAY. THE ALARM IS ON": ["НЕ ТОТ ГРУЗОВИК — КУЗОВ ПУСТ. ТРЕВОГА ВКЛЮЧЕНА", "FALSCHER LKW — LADERAUM LEER. ALARM IST AN"],
    // --- 32 FLASHBANG
    "ENEMY FLASHBANG! KICK IT BACK [V]": ["СВЕТОШУМОВАЯ ОТ ВРАГА! ОТПИНЬ ЕЁ НАЗАД [V]", "BLENDGRANATE VOM GEGNER! TRITT SIE ZURÜCK [V]"],
    "ENEMY FLASHBANG! KICK IT BACK (KICK BUTTON)": ["СВЕТОШУМОВАЯ ОТ ВРАГА! ОТПИНЬ ЕЁ НАЗАД (КНОПКА УДАРА НОГОЙ)", "BLENDGRANATE VOM GEGNER! TRITT SIE ZURÜCK (KICK-TASTE)"],
    "FLASHBANG!": ["СВЕТОШУМОВАЯ!", "BLENDGRANATE!"],
    "RETURN TO SENDER": ["ВЕРНУЛ ОТПРАВИТЕЛЮ", "AN ABSENDER ZURÜCK"],
    "THEY ARE BLIND — FINISH THEM": ["ОНИ СЛЕПЫ — ДОБЕЙ ИХ", "SIE SIND BLIND — MACH SIE FERTIG"],
    // --- 37 GHOST
    "DANCE FILE": ["ФАЙЛ ТАНЦА", "TANZDATEI"],
    "LEARN THE DANCE": ["РАЗУЧИТЬ ТАНЕЦ", "TANZ LERNEN"],
    "GHOST PROTOCOL INTACT — A SERVICE DOOR HAS UNLOCKED": ["ПРОТОКОЛ «ПРИЗРАК» СОБЛЮДЁН — СЛУЖЕБНАЯ ДВЕРЬ ОТКРЫЛАСЬ", "GEISTERPROTOKOLL EINGEHALTEN — EINE SERVICETÜR IST ENTRIEGELT"],
    "YOU ALREADY KNOW THIS DANCE": ["ЭТОТ ТАНЕЦ ВЫ УЖЕ ЗНАЕТЕ", "DIESEN TANZ KENNST DU SCHON"],
    "NEW EMOTE UNLOCKED: {s0} — HOLD [B]": ["НОВАЯ ЭМОЦИЯ ОТКРЫТА: {s0} — ЗАЖМИ [B]", "NEUES EMOTE FREIGESCHALTET: {s0} — [B] HALTEN"],
    "ALL DANCES KNOWN — BONUS CREDITS": ["ВСЕ ТАНЦЫ УЖЕ ИЗВЕСТНЫ — БОНУСНЫЕ КРЕДИТЫ", "ALLE TÄNZE BEKANNT — BONUS-CREDITS"],
    "GHOST REWARD": ["НАГРАДА ПРИЗРАКА", "GEISTER-BELOHNUNG"],
    // --- 39 HEAVY ARMOR
    "RED TANK ON THEIR BACKS — GO AROUND OR FLASH THEM, THEN SHOOT THE TANK": ["КРАСНЫЙ БАЛЛОН У НИХ НА СПИНЕ — ОБОЙДИ ИЛИ ОСЛЕПИ СВЕТОШУМОВОЙ, ПОТОМ СТРЕЛЯЙ В БАЛЛОН", "ROTE FLASCHE AUF IHREM RÜCKEN — UMGEHEN ODER BLENDEN, DANN AUF DIE FLASCHE SCHIESSEN"],
    "TANK DETONATED": ["БАЛЛОН ВЗОРВАН", "FLASCHE EXPLODIERT"],
    "TANK SHOT": ["ВЫСТРЕЛ В БАЛЛОН", "SCHUSS AUF DIE FLASCHE"],
    // --- 45 BLUEPRINTS
    "BLUEPRINT": ["ЧЕРТЁЖ", "BAUPLAN"],
    "SHEET {0} OF {1} — THE PLAN IS TAKING SHAPE": ["ЛИСТ {0} ИЗ {1} — ПЛАН ПРОЯВЛЯЕТСЯ", "BLATT {0} VON {1} — DER PLAN NIMMT GESTALT AN"],
    "MARK 083 UNLOCKED": ["МЕТКА 083 ОТКРЫТА", "MARKIERUNG 083 FREIGESCHALTET"],
    "NEXA INDUSTRIES — HEADQUARTERS": ["NEXA INDUSTRIES — ШТАБ-КВАРТИРА", "NEXA INDUSTRIES — HAUPTSITZ"],
    "SECTION A-A": ["РАЗРЕЗ А-А", "SCHNITT A-A"],
    "FLOOR 3 — DIRECTOR": ["ЭТАЖ 3 — ДИРЕКТОР", "ETAGE 3 — DIREKTOR"],
    "FLOOR 2 — VAULT": ["ЭТАЖ 2 — ХРАНИЛИЩЕ", "ETAGE 2 — TRESOR"],
    "FLOOR 1 — LOBBY": ["ЭТАЖ 1 — ХОЛЛ", "ETAGE 1 — FOYER"],
    "BASEMENT — LIFTS": ["ПОДВАЛ — ЛИФТЫ", "KELLER — AUFZÜGE"],
    "YARD": ["ДВОР", "HOF"],
    "DEEP LEVEL — 210 M": ["ГЛУБОКИЙ УРОВЕНЬ — 210 М", "TIEFEBENE — 210 M"],
    "MISSING SHEET": ["ЛИСТ ОТСУТСТВУЕТ", "BLATT FEHLT"],
    // --- 46 REHEARSAL
    "REHEARSAL MODE": ["РЕЖИМ РЕПЕТИЦИИ", "PROBENMODUS"],
    "NO REAL RISK": ["РЕАЛЬНОГО РИСКА НЕТ", "KEIN ECHTES RISIKO"],
    "STEP {0} / 4": ["ШАГ {0} / 4", "SCHRITT {0} / 4"],
    "THIS IS NOT A DRILL": ["ЭТО НЕ УЧЕНИЯ", "DAS IST KEINE ÜBUNG"],
    "THE LOCKS ARE REAL": ["ЗАМКИ НАСТОЯЩИЕ", "DIE SCHLÖSSER SIND ECHT"],
    "GET OUT ALIVE": ["ВЫБЕРИСЬ ЖИВЫМ", "KOMM LEBEND RAUS"],
    "REHEARSAL COMPLETE": ["РЕПЕТИЦИЯ ЗАВЕРШЕНА", "PROBE ABGESCHLOSSEN"],
    "SCORE {0}%": ["РЕЗУЛЬТАТ {0}%", "ERGEBNIS {0}%"],
    "THE REHEARSAL WAS REAL — GET OUT": ["РЕПЕТИЦИЯ БЫЛА НАСТОЯЩЕЙ — БЕГИ ОТСЮДА", "DIE PROBE WAR ECHT — RAUS HIER"]
  });
  I18N.add('ru', {
    "ТРОС ОБОРВАН. СВОБОДНОЕ ПАДЕНИЕ.": ["THE CABLE IS CUT. FREE FALL.", "SEIL GERISSEN. FREIER FALL."],
    "ЭТО ТВОЁ ДОСЬЕ. ОНИ ВЕДУТ УЧЁТ КАЖДОГО ТВОЕГО ШАГА.": ["THIS IS YOUR FILE. THEY KEEP TRACK OF YOUR EVERY MOVE.", "DAS IST DEINE AKTE. SIE ZÄHLEN JEDEN DEINER SCHRITTE."],
    "СТРАННАЯ НАХОДКА. ПОХОЖЕ, КТО-ТО ОСТАВИЛ ЭТО ДЛЯ ТЕБЯ.": ["A STRANGE FIND. LOOKS LIKE SOMEONE LEFT THIS FOR YOU.", "EIN SELTSAMER FUND. SIEHT AUS, ALS HÄTTE JEMAND DAS FÜR DICH DA GELASSEN."],
    "ГРУЗОВИК С КОНТЕЙНЕРОМ ОДИН. У НЕГО РОВНАЯ ЛАМПА, А НОМЕР ЗАКАНЧИВАЕТСЯ НА {0}. У ОСТАЛЬНЫХ ЛАМПА МИГАЕТ.": ["THERE IS ONLY ONE TRUCK WITH THE CONTAINER. ITS LAMP IS STEADY AND THE PLATE ENDS IN {0}. THE OTHERS BLINK.", "ES GIBT NUR EINEN LKW MIT DEM CONTAINER. SEIN LICHT BRENNT DAUERHAFT, DAS KENNZEICHEN ENDET AUF {0}. DIE ANDEREN BLINKEN."],
    "ПРИЗРАКАМ ПОЛАГАЕТСЯ НАГРАДА. ПОТАНЦУЙ, КОГДА БУДЕТ ВРЕМЯ.": ["GHOSTS DESERVE A REWARD. DANCE WHEN YOU GET THE CHANCE.", "GEISTER VERDIENEN EINE BELOHNUNG. TANZ, WENN DU ZEIT HAST."],
    "ВОТ ОНО. ЗДАНИЕ NEXA. ЗАПОМНИ ЭТУ ДВЕРЬ.": ["THIS IS IT. THE NEXA BUILDING. REMEMBER THAT DOOR.", "DAS IST ES. DAS NEXA-GEBÄUDE. MERK DIR DIESE TÜR."],
    "ЭТО НЕ УЧЕНИЯ. ЗАМКИ НАСТОЯЩИЕ. БЕГИ!": ["THIS IS NOT A DRILL. THE LOCKS ARE REAL. RUN!", "DAS IST KEINE ÜBUNG. DIE SCHLÖSSER SIND ECHT. LAUF!"]
  });
  I18N.add('en', {
    "SUBJECT 024": ["СУБЪЕКТ 024","SUBJEKT 024"],
    "RECORD": ["РЕКОРД","REKORD"],
    "SUBJECT 024 BEATEN": ["СУБЪЕКТ 024 ПОБЕЖДЁН","SUBJEKT 024 GESCHLAGEN"],
    "SUBJECT 024 WAS FASTER": ["СУБЪЕКТ 024 БЫЛ БЫСТРЕЕ","SUBJEKT 024 WAR SCHNELLER"],
    "YOU — 60 S AGO": ["ТЫ — 60 С НАЗАД","DU — VOR 60 S"],
    "RECORDING ERASED": ["ЗАПИСЬ СТЁРТА","AUFZEICHNUNG GELÖSCHT"],
    "YOUR OWN RECORDING JOINS THE FIGHT — IT MOVES AND SHOOTS LIKE YOU DID A MINUTE AGO": ["ТВОЯ СОБСТВЕННАЯ ЗАПИСЬ ВСТУПАЕТ В БОЙ — ОНА ДВИЖЕТСЯ И СТРЕЛЯЕТ ТАК, КАК ТЫ МИНУТУ НАЗАД","DEINE EIGENE AUFZEICHNUNG GREIFT EIN — SIE BEWEGT SICH UND SCHIESST WIE DU VOR EINER MINUTE"]
  });
  I18N.add('ru', {
    "ЗАПИСЬ СУБЪЕКТА 083 ВОСПРОИЗВЕДЕНА. ОДНА ТЕНЬ ЛИШНЯЯ.": ["THE RECORDING OF SUBJECT 083 IS PLAYING. ONE SHADOW TOO MANY.","DIE AUFZEICHNUNG VON SUBJEKT 083 LÄUFT. EIN SCHATTEN ZU VIEL."]
  });
  I18N.add('en', {
    "LOOP": ["ПЕТЛЯ","SCHLEIFE"],
    "RECORDING": ["ЗАПИСЬ","AUFNAHME"],
    "GHOST ACTIVE": ["ПРИЗРАК АКТИВЕН","GEIST AKTIV"],
    "RECHARGING": ["ПЕРЕЗАРЯДКА","LÄDT"],
    "READY [L]": ["ГОТОВО [L]","BEREIT [L]"],
    "LOOP WORKS ONLY IN STEALTH SECTORS": ["ПЕТЛЯ РАБОТАЕТ ТОЛЬКО В СКРЫТНЫХ СЕКТОРАХ","SCHLEIFE FUNKTIONIERT NUR IN SCHLEICH-ABSCHNITTEN"],
    "RECORDING 10 S — WALK A ROUTE": ["ЗАПИСЬ 10 С — ПРОЙДИ МАРШРУТ","AUFNAHME 10 S — GEH EINE ROUTE"],
    "GHOST DEPLOYED — GUARDS WILL GO TO LOOK AT IT": ["ПРИЗРАК ЗАПУЩЕН — ОХРАНА ПОЙДЁТ НА НЕГО СМОТРЕТЬ","GEIST AUSGESETZT — DIE WÄCHTER SCHAUEN NACH IHM"]
  });
  I18N.add('en', {
    "THROW THE BREAKER": ["ВКЛЮЧИТЬ РУБИЛЬНИК","SCHALTER UMLEGEN"],
    "FLOOR LIVE IN 1 S — CLEAR THE FLOOR": ["ПОЛ ПОД ТОКОМ ЧЕРЕЗ 1 С — СОЙДИ С НЕГО","BODEN UNTER STROM IN 1 S — VERLASS IHN"],
    "BREAKERS BY THE WALL ELECTRIFY THE FLOOR — LURE THEM IN, STAY OFF IT YOURSELF": ["РУБИЛЬНИКИ У СТЕНЫ ПУСКАЮТ ТОК В ПОЛ — ЗАМАНИ ИХ, САМ НЕ СТОЙ НА НЁМ","SCHALTER AN DER WAND SETZEN DEN BODEN UNTER STROM — LOCKE SIE HIN, STEH SELBST NICHT DRAUF"],
    "HIGH": ["HIGH","HIGH"],
    "LOW": ["LOW","LOW"],
    "BEFORE THE ROUND: STAND ON HIGH (MORE ENEMIES, TRIPLE CREDITS) OR ON LOW": ["ПЕРЕД РАУНДОМ: ВСТАНЬ НА HIGH (БОЛЬШЕ ВРАГОВ, КРЕДИТЫ ×3) ИЛИ НА LOW","VOR DER RUNDE: STELL DICH AUF HIGH (MEHR GEGNER, DREIFACHE CREDITS) ODER AUF LOW"],
    "HIGH BET — THREE EXTRA ENEMIES": ["СТАВКА HIGH — ТРОЕ ЛИШНИХ ВРАГОВ","HIGH-WETTE — DREI ZUSÄTZLICHE GEGNER"],
    "LOW BET — SAFE PLAY": ["СТАВКА LOW — ИГРА НА ВЕРНОЕ","LOW-WETTE — SICHERES SPIEL"],
    "HIGH BET WON": ["СТАВКА HIGH СЫГРАЛА","HIGH-WETTE GEWONNEN"],
    "LOW BET WON": ["СТАВКА LOW СЫГРАЛА","LOW-WETTE GEWONNEN"],
    "CLEAN HANDS": ["ЧИСТЫЕ РУКИ","SAUBERE HÄNDE"],
    "CIVILIAN HIT — CLEAN HANDS BONUS LOST": ["ЗАДЕТ МИРНЫЙ — БОНУС «ЧИСТЫЕ РУКИ» ПОТЕРЯН","ZIVILIST GETROFFEN — BONUS „SAUBERE HÄNDE“ VERLOREN"],
    "ANOTHER HOSTAGE — WHITE VEST": ["ЕЩЁ ОДИН ЗАЛОЖНИК — БЕЛЫЙ ЖИЛЕТ","NOCH EINE GEISEL — WEISSE WESTE"],
    "A RESIDENT HIDES INSIDE — DO NOT SHOOT": ["ВНУТРИ ПРЯЧЕТСЯ ЖИЛЕЦ — НЕ СТРЕЛЯТЬ","DRINNEN VERSTECKT SICH EIN BEWOHNER — NICHT SCHIESSEN"],
    "TRIPWIRE CHARGE ON THE DOOR FRAME — BACK OFF!": ["РАСТЯЖКА С ЗАРЯДОМ НА КОСЯКЕ — ОТОЙДИ!","STOLPERDRAHT-LADUNG AM TÜRRAHMEN — ZURÜCK!"],
    "MONITORS SHOW YOU WITH A 3 S DELAY — CROSS THE FRAMES FAST OR SHOOT THE MONITOR": ["МОНИТОРЫ ПОКАЗЫВАЮТ ТЕБЯ С ЗАДЕРЖКОЙ 3 С — ПРОБЕГАЙ КАДР БЫСТРО ИЛИ РАССТРЕЛЯЙ МОНИТОР","MONITORE ZEIGEN DICH MIT 3 S VERZÖGERUNG — DURCHQUERE DIE BILDER SCHNELL ODER ZERSCHIESS DEN MONITOR"],
    "MONITOR DESTROYED": ["МОНИТОР УНИЧТОЖЕН","MONITOR ZERSTÖRT"],
    "NO SIGNAL": ["НЕТ СИГНАЛА","KEIN SIGNAL"],
    "REC  -3 S": ["ЗАП  -3 С","REC  -3 S"],
    "SPOTTED ON THE MONITOR": ["ЗАМЕТИЛИ НА МОНИТОРЕ","AUF DEM MONITOR ENTDECKT"]
  });
  I18N.add('ru', {
    "ЗРИТЕЛИ ДЕЛАЮТ СТАВКИ. HIGH ИЛИ LOW?": ["THE AUDIENCE IS PLACING BETS. HIGH OR LOW?","DAS PUBLIKUM SETZT. HIGH ODER LOW?"],
    "ЗРИТЕЛИ ПОСТАВИЛИ НА HIGH!": ["THE AUDIENCE BET ON HIGH!","DAS PUBLIKUM HAT AUF HIGH GESETZT!"]
  });
  I18N.add('en', {
    "MORALE": ["МОРАЛЬ","MORAL"],
    "CONDUCT": ["ПОВЕДЕНИЕ","VERHALTEN"],
    "WATCH IT — CIVILIANS": ["ОСТОРОЖНЕЕ — МИРНЫЕ","VORSICHT — ZIVILISTEN"],
    "CIVILIAN KILLED": ["МИРНЫЙ УБИТ","ZIVILIST GETÖTET"],
    "PEOPLE ARE WALKING THE PLAZA — DO NOT HIT THEM (MORALE)": ["ПО ПЛОЩАДИ ХОДЯТ ЛЮДИ — НЕ ЗАДЕВАЙ ИХ (МОРАЛЬ)","LEUTE GEHEN ÜBER DEN PLATZ — TRIFF SIE NICHT (MORAL)"]
  });
  I18N.add('en', {
    "BARREL": ["БОЧКА","FASS"],
    "MINE": ["МИНА","MINE"],
    "CRATE": ["ЯЩИК","KISTE"],
    "TRAPS": ["ЛОВУШКИ","FALLEN"],
    "[P] PLACE  [O] SWITCH": ["[P] ПОСТАВИТЬ  [O] СМЕНИТЬ","[P] PLATZIEREN  [O] WECHSELN"],
    "TRAP PREP — GENERATOR LOCKED {0}": ["ПОДГОТОВКА ЛОВУШЕК — ГЕНЕРАТОР ЗАБЛОКИРОВАН {0}","FALLEN VORBEREITEN — GENERATOR GESPERRT {0}"],
    "SET TRAPS BEFORE THE GENERATOR: BARRELS, MINES, CRATES": ["РАССТАВЬ ЛОВУШКИ ДО ГЕНЕРАТОРА: БОЧКИ, МИНЫ, ЯЩИКИ","STELL FALLEN VOR DEM GENERATOR AUF: FÄSSER, MINEN, KISTEN"],
    "NO ROOM HERE": ["ЗДЕСЬ НЕТ МЕСТА","HIER IST KEIN PLATZ"],
    "TRAPS ARMED — START THE GENERATOR": ["ЛОВУШКИ ВЗВЕДЕНЫ — ЗАПУСКАЙ ГЕНЕРАТОР","FALLEN SCHARF — STARTE DEN GENERATOR"],
    "TRAP TRIGGERED": ["ЛОВУШКА СРАБОТАЛА","FALLE AUSGELÖST"],
    "PULL THE COMPACTOR LEVER": ["ДЁРНУТЬ РЫЧАГ ПРЕССА","PRESSHEBEL ZIEHEN"],
    "COMPACTOR ARMED — CLEAR THE PLATE": ["ПРЕСС ВЗВЕДЁН — СОЙДИ С ПЛИТЫ","PRESSE SCHARF — VERLASS DIE PLATTE"],
    "COMPACTOR LEVER AT THE WALL — LURE THE GUARDS ONTO THE PLATE": ["РЫЧАГ ПРЕССА У СТЕНЫ — ЗАМАНИ ОХРАНУ НА ПЛИТУ","PRESSHEBEL AN DER WAND — LOCKE DIE WÄCHTER AUF DIE PLATTE"],
    "CRUSHED": ["РАЗДАВЛЕНО","ZERQUETSCHT"],
    "LOCK": ["ЗАМОК","SCHLOSS"],
    "PICK": ["ОТМЫЧКА","DIETRICH"],
    "PIN {0} / {1}": ["ШТИФТ {0} / {1}","STIFT {0} / {1}"],
    "LOCK OPEN": ["ЗАМОК ОТКРЫТ","SCHLOSS OFFEN"],
    "PICK BROKEN": ["ОТМЫЧКА СЛОМАНА","DIETRICH GEBROCHEN"],
    "SLIPPED": ["СОРВАЛОСЬ","ABGERUTSCHT"],
    "TAP PICK": ["НАЖМИ PICK","PICK TIPPEN"],
    "[SPACE] PICK": ["[ПРОБЕЛ] ВЗЛОМ","[LEERTASTE] KNACKEN"],
    "TRAIN IN": ["ПОЕЗД ЧЕРЕЗ","ZUG IN"],
    "HIT BY THE TRAIN": ["СБИТ ПОЕЗДОМ","VOM ZUG ERFASST"],
    "RUN OVER": ["ПЕРЕЕХАНО","ÜBERFAHREN"],
    "TRAINS RUN ALONG THE EAST WALL — STAY OFF THE TRACKS, KICK [V] GUARDS ONTO THEM": ["ПОЕЗДА ХОДЯТ У ВОСТОЧНОЙ СТЕНЫ — НЕ ВЫХОДИ НА ПУТИ, ПИНКОМ [V] СТАЛКИВАЙ ОХРАНУ","ZÜGE FAHREN AN DER OSTWAND — BLEIB VON DEN GLEISEN WEG, STOSSE WÄCHTER MIT [V] HINEIN"],
    "SHOOT THE WHITE FUEL CAPS — CHAIN REACTIONS, BUT SIRENS CALL GUARDS": ["СТРЕЛЯЙ В БЕЛЫЕ КРЫШКИ БАКОВ — ЦЕПНАЯ РЕАКЦИЯ, НО СИРЕНЫ ЗОВУТ ОХРАНУ","SCHIESS AUF DIE WEISSEN TANKDECKEL — KETTENREAKTION, ABER SIRENEN RUFEN WÄCHTER"],
    "SIRENS — SECURITY RESPONDING": ["СИРЕНЫ — ОХРАНА ВЫДВИНУЛАСЬ","SIRENEN — SICHERHEIT RÜCKT AN"]
  });
  I18N.add('en', {
    "[{s0} x{0}]": ["[{s0} x{0}]","[{s0} x{0}]"]
  });
  I18N.add('en', {
    "CONDUCT: MERCIFUL": ["ПОВЕДЕНИЕ: МИЛОСЕРДНЫЙ","VERHALTEN: BARMHERZIG"],
    "CONDUCT: RUTHLESS": ["ПОВЕДЕНИЕ: БЕЗЖАЛОСТНЫЙ","VERHALTEN: SKRUPELLOS"],
    "CONDUCT: PRAGMATIC": ["ПОВЕДЕНИЕ: ПРАГМАТИЧНЫЙ","VERHALTEN: PRAGMATISCH"],
    "PRISONERS: {0}": ["ПЛЕННЫХ: {0}","GEFANGENE: {0}"],
    "TAKE CAPTIVE": ["ВЗЯТЬ В ПЛЕН","GEFANGEN NEHMEN"],
    "CAPTIVE TAKEN": ["ПЛЕННЫЙ ВЗЯТ","GEFANGENER GENOMMEN"],
    "EXECUTION — THE HANDLER TAKES NOTE": ["КАЗНЬ — КУРАТОР ЭТО ЗАПИШЕТ","HINRICHTUNG — DER EINSATZLEITER NOTIERT ES"],
    "A CAPTOR SURRENDERS — TAKE HIM CAPTIVE [E] OR FINISH HIM": ["ПОХИТИТЕЛЬ СДАЁТСЯ — ВОЗЬМИ В ПЛЕН [E] ИЛИ ДОБЕЙ","EIN ENTFÜHRER ERGIBT SICH — NIMM IHN GEFANGEN [E] ODER MACH IHN FERTIG"],
    "COLLAPSE": ["ОБРУШЕНИЕ","EINSTURZ"],
    "RED CHARGES ON THE SUPPORTS — SHOOT ONE TO DROP THE PLATFORM ON THE GUARDS": ["КРАСНЫЕ ЗАРЯДЫ НА ОПОРАХ — СТРЕЛЯЙ В ОДИН, ЧТОБЫ РОНЯТЬ ПЛАТФОРМУ НА ОХРАНУ","ROTE LADUNGEN AN DEN STÜTZEN — SCHIESS AUF EINE, UM DIE PLATTFORM AUF DIE WÄCHTER ZU WERFEN"],
    "GAS MASK": ["ПРОТИВОГАЗ","GASMASKE"],
    "TIME LEFT": ["ОСТАЛОСЬ","VERBLEIBEND"],
    "TAKE THE GAS MASK": ["ВЗЯТЬ ПРОТИВОГАЗ","GASMASKE NEHMEN"],
    "MASK ON — 30 S OF PROTECTION": ["МАСКА НАДЕТА — 30 С ЗАЩИТЫ","MASKE AUF — 30 S SCHUTZ"],
    "OPEN THE VALVE": ["ОТКРЫТЬ ВЕНТИЛЬ","VENTIL ÖFFNEN"],
    "GAS RELEASED — KEEP OUT WITHOUT A MASK": ["ГАЗ ВЫПУЩЕН — БЕЗ МАСКИ НЕ ВХОДИ","GAS FREIGESETZT — OHNE MASKE FERNBLEIBEN"],
    "COUGHING — GET OUT OF THE GAS": ["КАШЕЛЬ — ВЫБЕРИСЬ ИЗ ГАЗА","HUSTEN — RAUS AUS DEM GAS"],
    "VALVES ON THE WALLS RELEASE GAS — MASK AT THE ENTRANCE PROTECTS YOU FOR 30 S": ["ВЕНТИЛИ НА СТЕНАХ ВЫПУСКАЮТ ГАЗ — МАСКА У ВХОДА ЗАЩИЩАЕТ 30 С","VENTILE AN DEN WÄNDEN SETZEN GAS FREI — DIE MASKE AM EINGANG SCHÜTZT 30 S"],
    "SIREN: {s0} WING": ["СИРЕНА: {s0} КРЫЛО","SIRENE: {s0} FLÜGEL"],
    "LEFT": ["ЛЕВОЕ","LINKER"],
    "RIGHT": ["ПРАВОЕ","RECHTER"],
    "SIREN ON — GUARDS ARE MOVING": ["СИРЕНА ВКЛЮЧЕНА — ОХРАНА ДВИЖЕТСЯ","SIRENE AN — DIE WÄCHTER SETZEN SICH IN BEWEGUNG"],
    "NOISE CONSOLE: PICK A WING — THE GUARDS WILL RUN TO THE SIREN": ["ПУЛЬТ ШУМА: ВЫБЕРИ КРЫЛО — ОХРАНА ПОБЕЖИТ К СИРЕНЕ","LÄRMPULT: WÄHLE EINEN FLÜGEL — DIE WÄCHTER LAUFEN ZUR SIRENE"]
  });
  I18N.add('en', {
    "COMBO RANKS: CHAIN BARRELS AND EXPLOSIVE KILLS FOR S / A / B": ["РАНГИ ЗА КОМБО: ЦЕПОЧКИ БОЧЕК И УБИЙСТВА ВЗРЫВОМ — S / A / B","COMBO-RÄNGE: FASS-KETTEN UND EXPLOSIONS-KILLS FÜR S / A / B"],
    "RANK {s0} — CHAIN x{0}, {1} EXPLOSIVE KILLS": ["РАНГ {s0} — ЦЕПОЧКА x{0}, УБИЙСТВ ВЗРЫВОМ: {1}","RANG {s0} — KETTE x{0}, {1} EXPLOSIONS-KILLS"],
    "RANK {s0}": ["РАНГ {s0}","RANG {s0}"],
    "CHAIN x{0}": ["ЦЕПОЧКА x{0}","KETTE x{0}"],
    "GUARDS RAISE THE ALARM OVER BODIES — HIDE THEM IN LOCKERS [E]": ["ОХРАНА ПОДНИМАЕТ ТРЕВОГУ ИЗ-ЗА ТЕЛ — ПРЯЧЬ ИХ В ШКАФЫ [E]","WÄCHTER SCHLAGEN BEI LEICHEN ALARM — VERSTECKE SIE IN SPINDEN [E]"],
    "HIDE THE BODY": ["СПРЯТАТЬ ТЕЛО","LEICHE VERSTECKEN"],
    "BODY HIDDEN": ["ТЕЛО СПРЯТАНО","LEICHE VERSTECKT"],
    "EVERYTHING IS GLASS — FOLLOW THE SHADOW: IT MOVES ONLY WHEN THE WAY IS SAFE": ["ВСЁ СТЕКЛЯННОЕ — ИДИ ЗА ТЕНЬЮ: ОНА ДВИЖЕТСЯ, ТОЛЬКО КОГДА ПУТЬ БЕЗОПАСЕН","ALLES IST GLAS — FOLGE DEM SCHATTEN: ER BEWEGT SICH NUR, WENN DER WEG SICHER IST"],
    "BOOKS": ["КНИГИ","BÜCHER"],
    "THROW [J]": ["БРОСИТЬ [J]","WERFEN [J]"],
    "BOOK THROWN": ["КНИГА БРОШЕНА","BUCH GEWORFEN"],
    "TAKE A BOOK": ["ВЗЯТЬ КНИГУ","BUCH NEHMEN"],
    "THE LIBRARIAN IS BLIND: HE HEARS RUNNING AND SHOTS — WALK, AND THROW BOOKS [J] TO DISTRACT HIM": ["БИБЛИОТЕКАРЬ СЛЕП: ОН СЛЫШИТ БЕГ И ВЫСТРЕЛЫ — ХОДИ ШАГОМ И БРОСАЙ КНИГИ [J], ЧТОБЫ ОТВЛЕЧЬ ЕГО","DER BIBLIOTHEKAR IST BLIND: ER HÖRT RENNEN UND SCHÜSSE — GEH LANGSAM UND WIRF BÜCHER [J], UM IHN ABZULENKEN"],
    "A RIVAL SNIPER IS ON THE FAR ROOF — WATCH FOR HIS LENS GLINT": ["НА ДАЛЬНЕЙ КРЫШЕ СНАЙПЕР-СОПЕРНИК — СЛЕДИ ЗА БЛИКОМ ЕГО ЛИНЗЫ","EIN RIVALISIERENDER SCHARFSCHÜTZE AUF DEM FERNEN DACH — ACHTE AUF SEIN LINSENBLITZEN"],
    "HE FIRES": ["ОН СТРЕЛЯЕТ","ER SCHIESST"],
    "YOUR LENS GLINT GAVE YOU AWAY": ["БЛИК ТВОЕЙ ЛИНЗЫ ВЫДАЛ ТЕБЯ","DEIN LINSENBLITZEN HAT DICH VERRATEN"],
    "SNIPER DUEL WON": ["ДУЭЛЬ СНАЙПЕРОВ ВЫИГРАНА","SCHARFSCHÜTZENDUELL GEWONNEN"]
  });
  I18N.add('en', {
    "THE SPAN IS FALLING AWAY BEHIND YOU — KEEP RUNNING": ["ПРОЛЁТ ОБРУШИВАЕТСЯ ЗА СПИНОЙ — БЕГИ ДАЛЬШЕ","DIE BRÜCKE BRICHT HINTER DIR WEG — LAUF WEITER"],
    "A PASSENGER WAS HIT": ["ЗАДЕТ ПАССАЖИР","EIN FAHRGAST WURDE GETROFFEN"],
    "PASSENGERS ARE LYING ON THE FLOOR — DO NOT SHOOT THEM": ["ПАССАЖИРЫ ЛЕЖАТ НА ПОЛУ — НЕ СТРЕЛЯЙ В НИХ","FAHRGÄSTE LIEGEN AM BODEN — NICHT AUF SIE SCHIESSEN"],
    "CHOOSE AN UPGRADE": ["ВЫБЕРИ УЛУЧШЕНИЕ","WÄHLE EIN UPGRADE"],
    "[4] [5] [6] OR CLICK — AUTO IN 9 S": ["[4] [5] [6] ИЛИ КЛИК — АВТОВЫБОР ЧЕРЕЗ 9 С","[4] [5] [6] ODER KLICK — AUTO IN 9 S"],
    "ARMOR": ["БРОНЯ","PANZERUNG"],
    "AMMO": ["ПАТРОНЫ","MUNITION"],
    "TRAP": ["ЛОВУШКА","FALLE"],
    "+40 MAX INTEGRITY, FULL HEAL": ["+40 К МАКС. ЦЕЛОСТНОСТИ, ПОЛНОЕ ЛЕЧЕНИЕ","+40 MAX. INTEGRITÄT, VOLLE HEILUNG"],
    "FULL RESERVES FOR EVERY WEAPON": ["ПОЛНЫЙ ЗАПАС ДЛЯ КАЖДОГО ОРУЖИЯ","VOLLER VORRAT FÜR JEDE WAFFE"],
    "THREE BARRELS AT THE GENERATOR": ["ТРИ БОЧКИ У ГЕНЕРАТОРА","DREI FÄSSER AM GENERATOR"],
    "YOUR PARTNER (WHITE VEST) COVERS YOUR BACK": ["НАПАРНИК (БЕЛЫЙ ЖИЛЕТ) ПРИКРЫВАЕТ ТЕБЕ СПИНУ","DEIN PARTNER (WEISSE WESTE) DECKT DEN RÜCKEN"],
    "HE TURNED ON YOU!": ["ОН ПРЕДАЛ ТЕБЯ!","ER HAT SICH GEGEN DICH GEWENDET!"],
    "PARTNER": ["НАПАРНИК","PARTNER"],
    "BREAKOUT {s0}": ["ПОБЕГ {s0}","AUSBRUCH {s0}"],
    "BREAKOUT --:--": ["ПОБЕГ --:--","AUSBRUCH --:--"],
    "THE WARDEN WEARS YOUR BREAKOUT TIME ON HIS BACK": ["НАДЗИРАТЕЛЬ НОСИТ ТВОЁ ВРЕМЯ ПОБЕГА НА СПИНЕ","DER AUFSEHER TRÄGT DEINE AUSBRUCHSZEIT AUF DEM RÜCKEN"],
    "SECURITY FOOTAGE: YOU WERE SEEN": ["ЗАПИСЬ КАМЕР: ТЕБЯ ВИДЕЛИ","ÜBERWACHUNGSVIDEO: DU WURDEST GESEHEN"],
    "SECURITY FOOTAGE: YOU WERE NOT SEEN": ["ЗАПИСЬ КАМЕР: ТЕБЯ НЕ ВИДЕЛИ","ÜBERWACHUNGSVIDEO: DU WURDEST NICHT GESEHEN"],
    "HOSTILES DOWN: {0}": ["ВРАГОВ УСТРАНЕНО: {0}","FEINDE AUSGESCHALTET: {0}"],
    "TIME ON JOB: {s0}": ["ВРЕМЯ НА ДЕЛЕ: {s0}","ZEIT AUFTRAG: {s0}"]
  });
  I18N.add('ru', {
    "ВОЗЬМИ НАПАРНИКА. ОН ПРОВЕДЁТ ТЕБЯ ДО КОМНАТЫ.": ["TAKE A PARTNER. HE WILL GET YOU TO THE ROOM.","NIMM EINEN PARTNER MIT. ER BRINGT DICH ZUM RAUM."],
    "ТЫ СЛИШКОМ МНОГО ЗНАЕШЬ.": ["YOU KNOW TOO MUCH.","DU WEISST ZU VIEL."]
  });
}());
