// NEXA: переводы магазина, игрушек-способностей, хотбара, модулей калибровки и песочницы. Исходный язык — английский; массив = [ru, de].
(function () {
  'use strict';
  if (!window.I18N) return;
  I18N.add('en', {
    // ---------------------------------------------------------------- меню и магазин
    'SHOP': ['МАГАЗИН', 'SHOP'],
    'SANDBOX': ['ПЕСОЧНИЦА', 'SANDBOX'],
    'BALANCE': ['БАЛАНС', 'KONTOSTAND'],
    '{0} CR': ['{0} КР', '{0} CR'],
    '+{0} CR // BALANCE {1} CR': ['+{0} КР // БАЛАНС {1} КР', '+{0} CR // KONTOSTAND {1} CR'],
    'BUY': ['КУПИТЬ', 'KAUFEN'],
    'PREVIEW': ['ПРЕДПРОСМОТР', 'VORSCHAU'],
    'EQUIP': ['ВЗЯТЬ В МИССИЮ', 'MITNEHMEN'],
    'UNEQUIP': ['СНЯТЬ', 'ABLEGEN'],
    'EQUIPPED': ['ВЫБРАНО', 'GEWÄHLT'],
    'SECTOR {0} / {1} {s0}': ['СЕКТОР {0} / {1}\n{s0}', 'SEKTOR {0} / {1}\n{s0}'],
    '{s0} HOSTILE — ELIMINATE': ['{s0}\nЦЕЛЬ ВРАЖДЕБНА — УСТРАНИТЬ', '{s0}\nFEINDLICH — AUSSCHALTEN'],
    'SEMI': ['ПОЛУАВТ.', 'HALBAUT.'], 'AUTO': ['АВТО', 'AUTO'], 'PUMP': ['ПОМПА', 'PUMP'], 'BOLT': ['ЗАТВОР', 'REPETIER.'],
    'OWNED': ['КУПЛЕНО', 'IM BESITZ'],
    'BLACK BEAR': ['ЧЁРНЫЙ МИШКА', 'SCHWARZER BÄR'],
    'PL-01': ['PL-01', 'PL-01'],
    'PL-??': ['PL-??', 'PL-??'],
    '[ NO SIGNAL ]': ['[ НЕТ СИГНАЛА ]', '[ KEIN SIGNAL ]'],
    'ITEM UNAVAILABLE': ['ПРЕДМЕТ НЕДОСТУПЕН', 'ARTIKEL NICHT VERFÜGBAR'],
    'NOT ENOUGH CREDITS': ['НЕДОСТАТОЧНО КРЕДИТОВ', 'NICHT GENUG KREDITE'],
    'PURCHASE COMPLETE': ['ПОКУПКА ЗАВЕРШЕНА', 'KAUF ABGESCHLOSSEN'],
    'C:\\NEXA\\SHOP\\ // PLUSH ITEMS GRANT A MISSION ABILITY. ONE ITEM CAN BE CARRIED INTO A MISSION.': ['C:\\NEXA\\SHOP\\ // ПЛЮШЕВЫЕ ПРЕДМЕТЫ ДАЮТ СПОСОБНОСТЬ В МИССИИ. В МИССИЮ МОЖНО ВЗЯТЬ ОДИН ПРЕДМЕТ.', 'C:\\NEXA\\SHOP\\ // PLÜSCHARTIKEL VERLEIHEN EINE MISSIONSFÄHIGKEIT. EIN ARTIKEL KANN IN EINE MISSION MITGENOMMEN WERDEN.'],
    'LMB: HUG THE TOY': ['ЛКМ: ОБНЯТЬ ИГРУШКУ', 'LMT: SPIELZEUG UMARMEN'],
    'RESTORES ALL INTEGRITY': ['ВОССТАНАВЛИВАЕТ ВСЮ ЦЕЛОСТНОСТЬ', 'STELLT DIE GESAMTE INTEGRITÄT WIEDER HER'],
    'WIDER FIELD OF VIEW': ['ШИРЕ ПОЛЕ ЗРЕНИЯ', 'BREITERES SICHTFELD'],
    'DARK BARS AT THE SCREEN EDGES': ['ТЁМНЫЕ ПОЛОСЫ ПО КРАЯМ ЭКРАНА', 'DUNKLE STREIFEN AM BILDSCHIRMRAND'],
    '+100 AMMO FOR EVERY WEAPON': ['+100 ПАТРОНОВ НА КАЖДОЕ ОРУЖИЕ', '+100 MUNITION FÜR JEDE WAFFE'],
    'EFFECT 2:00 / COOLDOWN 5:00': ['ЭФФЕКТ 2:00 / ПЕРЕЗАРЯДКА 5:00', 'EFFEKT 2:00 / ABKLINGZEIT 5:00'],
    // предпросмотр игрушки
    'MODEL': ['МОДЕЛЬ', 'MODELL'],
    'PLUSH ABILITY ITEM': ['ПЛЮШЕВЫЙ ПРЕДМЕТ-СПОСОБНОСТЬ', 'PLÜSCH-FÄHIGKEITSARTIKEL'],
    '[ ESC / CLOSE ]': ['[ ESC / ЗАКРЫТЬ ]', '[ ESC / SCHLIESSEN ]'],
    'DRAG: ROTATE | RMB: MOVE | WHEEL: ZOOM | CLICK THE TOY: SQUEEZE': ['ТЯНИ: ВРАЩАТЬ  |  ПКМ: ДВИГАТЬ  |  КОЛЕСО: МАСШТАБ  |  КЛИК ПО ИГРУШКЕ: СЖАТЬ', 'ZIEHEN: DREHEN  |  RMT: VERSCHIEBEN  |  RAD: ZOOM  |  SPIELZEUG ANKLICKEN: DRÜCKEN'],
    'MODEL LOAD FAULT': ['ОШИБКА ЗАГРУЗКИ МОДЕЛИ', 'MODELL KONNTE NICHT GELADEN WERDEN'],

    // ---------------------------------------------------------------- игрушка в миссии
    'READY': ['ГОТОВО', 'BEREIT'],
    'RECHARGING': ['ПЕРЕЗАРЯДКА', 'LÄDT AUF'],
    'EMBRACE ACTIVE': ['ОБЪЯТИЕ АКТИВНО', 'UMARMUNG AKTIV'],
    'EMBRACE ENDED': ['ОБЪЯТИЕ ЗАКОНЧИЛОСЬ', 'UMARMUNG BEENDET'],
    'BLACK BEAR RECHARGING': ['ЧЁРНЫЙ МИШКА ПЕРЕЗАРЯЖАЕТСЯ', 'SCHWARZER BÄR LÄDT AUF'],
    'BLACK BEAR READY': ['ЧЁРНЫЙ МИШКА ГОТОВ', 'SCHWARZER BÄR BEREIT'],
    'LMB ACTIVATE | RMB SHAKE | SLOT KEY PUT AWAY': ['ЛКМ АКТИВИРОВАТЬ  |  ПКМ ТРЯСТИ  |  КЛАВИША СЛОТА УБРАТЬ', 'LMT AKTIVIEREN  |  RMT SCHÜTTELN  |  SLOT-TASTE WEGSTECKEN'],
    'WASD MOVE | MOUSE LOOK | LMB FIRE | RMB AIM | R RELOAD | Q/1-9 SLOT | E USE | SHIFT RUN | C CROUCH | Z X LEAN | F FISTS | V KICK': ['WASD ХОДЬБА  |  МЫШЬ ОБЗОР  |  ЛКМ ОГОНЬ  |  ПКМ ПРИЦЕЛ  |  R ПЕРЕЗАРЯДКА  |  Q/1-9 СЛОТ  |  E ДЕЙСТВИЕ  |  SHIFT БЕГ  |  C ПРИСЕСТЬ  |  Z X НАКЛОН  |  F КУЛАКИ  |  V ПИНОК', 'WASD BEWEGEN  |  MAUS UMSEHEN  |  LMT FEUER  |  RMT ZIELEN  |  R NACHLADEN  |  Q/1-9 SLOT  |  E BENUTZEN  |  SHIFT RENNEN  |  C DUCKEN  |  Z X NEIGEN  |  F FÄUSTE  |  V TRITT'],
    'FISTS': ['КУЛАКИ', 'FÄUSTE'],
    'PARRY': ['ПАРИРОВАНИЕ', 'PARIERT'],
    'CROUCH': ['ПРИСЕД', 'DUCKEN'],
    'KICK': ['ПИНОК', 'TRITT'],

    // ---------------------------------------------------------------- калибровка: модули снаряжения
    'TAKE LIFE SUPPORT MODULE': ['ВОЗЬМИ МОДУЛЬ ЖИЗНЕОБЕСПЕЧЕНИЯ', 'LEBENSERHALTUNGSMODUL NEHMEN'],
    'TAKE INVENTORY MODULE': ['ВОЗЬМИ МОДУЛЬ ИНВЕНТАРЯ', 'INVENTARMODUL NEHMEN'],
    'LIFE SUPPORT ONLINE': ['ЖИЗНЕОБЕСПЕЧЕНИЕ ВКЛЮЧЕНО', 'LEBENSERHALTUNG ONLINE'],
    'INVENTORY ONLINE': ['ИНВЕНТАРЬ ВКЛЮЧЁН', 'INVENTAR ONLINE'],
    'COLLECT THE EQUIPMENT MODULES {0}/{1}': ['СОБЕРИ МОДУЛИ СНАРЯЖЕНИЯ {0}/{1}', 'SAMMLE DIE AUSRÜSTUNGSMODULE {0}/{1}'],
    'MODULES INSTALLED': ['МОДУЛИ УСТАНОВЛЕНЫ', 'MODULE INSTALLIERT'],
    'MODULE': ['МОДУЛЬ', 'MODUL'],

    // ---------------------------------------------------------------- песочница
    'MODE': ['РЕЖИМ', 'MODUS'],
    'HITS': ['ПОПАДАНИЯ', 'TREFFER'],
    'ACCURACY': ['ТОЧНОСТЬ', 'GENAUIGKEIT'],
    'HEADSHOTS': ['ХЭДШОТЫ', 'KOPFSCHÜSSE'],
    'KILLS': ['УБИЙСТВА', 'ABSCHÜSSE'],
    'STREAK': ['СЕРИЯ', 'SERIE'],
    'REACTION': ['РЕАКЦИЯ', 'REAKTION'],
    'TARGETS LOST': ['ЦЕЛЕЙ УПУЩЕНО', 'ZIELE VERPASST'],
    'ON': ['ВКЛ', 'AN'],
    'FREE FIRE': ['СВОБОДНАЯ СТРЕЛЬБА', 'FREIES SCHIESSEN'],
    'STATIC GRID': ['НЕПОДВИЖНЫЕ МИШЕНИ', 'STATISCHE ZIELE'],
    'STRAFING TARGETS': ['ДВИЖУЩИЕСЯ МИШЕНИ', 'BEWEGLICHE ZIELE'],
    'FLICK TRAINER': ['ТРЕНИРОВКА РЕАКЦИИ', 'FLICK-TRAINER'],
    'T MODE | J K L P SPAWN | N CLEAR | Y RESET | I AMMO | O GOD | ESC MENU': ['T РЕЖИМ  |  J K L P ВРАГИ  |  N УБРАТЬ  |  Y СБРОС  |  I ПАТРОНЫ  |  O БЕССМЕРТИЕ  |  ESC МЕНЮ', 'T MODUS  |  J K L P GEGNER  |  N LÖSCHEN  |  Y RESET  |  I MUNITION  |  O GODMODE  |  ESC MENÜ'],
    'T MODE | J K L P SPAWN | G NADE | H SWITCH | N CLEAR | Y RESET | I AMMO | O GOD | ESC MENU': ['T РЕЖИМ  |  J K L P ВРАГИ  |  G ГРАНАТА  |  H СМЕНА  |  N УБРАТЬ  |  Y СБРОС  |  I ПАТРОНЫ  |  O БЕССМЕРТИЕ  |  ESC МЕНЮ', 'T MODUS  |  J K L P GEGNER  |  G GRANATE  |  H WECHSEL  |  N LÖSCHEN  |  Y RESET  |  I MUNITION  |  O GODMODE  |  ESC MENÜ'],
    'REFILL GRENADES': ['ПОПОЛНИТЬ ГРАНАТЫ', 'GRANATEN AUFFÜLLEN'],
    'GRENADES REFILLED': ['ГРАНАТЫ ПОПОЛНЕНЫ', 'GRANATEN AUFGEFÜLLT'],
    'TRAIN YOUR AIM — ESC: MENU, SPAWN ENEMIES': ['ТРЕНИРУЙ ПРИЦЕЛ — ESC: МЕНЮ, ВРАГИ', 'TRAINIERE DEIN ZIELEN — ESC: MENÜ, GEGNER ERSCHAFFEN'],
    'ENEMY LIMIT REACHED': ['ДОСТИГНУТ ЛИМИТ ВРАГОВ', 'GEGNERLIMIT ERREICHT'],
    'INFINITE AMMO {s0}': ['БЕСКОНЕЧНЫЕ ПАТРОНЫ {s0}', 'UNENDLICH MUNITION {s0}'],
    'GOD MODE {s0}': ['БЕССМЕРТИЕ {s0}', 'GODMODE {s0}'],
    'SANDBOX PAUSED': ['ПЕСОЧНИЦА НА ПАУЗЕ', 'SANDBOX PAUSIERT'],
    '[EXIT SANDBOX]': ['[ВЫЙТИ ИЗ ПЕСОЧНИЦЫ]', '[SANDBOX VERLASSEN]'],
    'SPAWN GRUNT': ['СОЗДАТЬ СОЛДАТА', 'SOLDAT ERSCHAFFEN'],
    'SPAWN RUSHER': ['СОЗДАТЬ БЕГУНА', 'LÄUFER ERSCHAFFEN'],
    'SPAWN HEAVY': ['СОЗДАТЬ ТЯЖЁЛОГО', 'SCHWEREN ERSCHAFFEN'],
    'SPAWN BOSS': ['СОЗДАТЬ БОССА', 'BOSS ERSCHAFFEN'],
    'CLEAR ENEMIES': ['УБРАТЬ ВРАГОВ', 'GEGNER ENTFERNEN'],
    'RESET STATS': ['СБРОС СТАТИСТИКИ', 'STATISTIK ZURÜCKSETZEN'],
    'INFINITE AMMO': ['БЕСКОНЕЧНЫЕ ПАТРОНЫ', 'UNENDLICH MUNITION'],
    'GOD MODE': ['БЕССМЕРТИЕ', 'GODMODE'],
    'ENEMIES HOSTILE': ['ВРАГИ АГРЕССИВНЫ', 'GEGNER FEINDLICH']
  });
  // реплики системы (исходный язык — русский)
  I18N.add('en', {
    '[ TAP TO START ]': ['[ НАЖМИТЕ НА ЭКРАН ]', '[ BILDSCHIRM ANTIPPEN ]']   // заставка студии (js/splash.js)
  });

  I18N.add('ru', {
    'ОБНАРУЖЕНЫ МОДУЛИ СНАРЯЖЕНИЯ. ВОЗЬМИТЕ ИХ.': ['EQUIPMENT MODULES DETECTED. TAKE THEM.', 'AUSRÜSTUNGSMODULE ERKANNT. NEHMEN SIE SIE AN SICH.'],
    'МОДУЛИ УСТАНОВЛЕНЫ. ПРОДОЛЖАЮ КАЛИБРОВКУ.': ['MODULES INSTALLED. RESUMING CALIBRATION.', 'MODULE INSTALLIERT. KALIBRIERUNG WIRD FORTGESETZT.']
  });

  // ---------------------------------------------------------------- эмоции (js/emote.js, js/emote-room.js): колесо на зажатой B, карточка магазина, комната предпросмотра
  I18N.add('en', {
    'HOLD B: EMOTE WHEEL': ['ЗАЖМИ B: КОЛЕСО ЭМОЦИЙ', 'B HALTEN: EMOTE-RAD'],
    'FULL-BODY DANCE FROM A REAL POSE CAPTURE': ['ТАНЕЦ ВСЕГО ТЕЛА ПО РЕАЛЬНОМУ ЗАХВАТУ ПОЗЫ', 'GANZKÖRPERTANZ AUS ECHTER POSENERFASSUNG'],
    'CAMERA PULLS BACK AND ORBITS THE DANCER': ['КАМЕРА ОТЪЕЗЖАЕТ И КРУЖИТ ВОКРУГ ТАНЦОРА', 'KAMERA ZIEHT ZURÜCK UND UMKREIST DEN TÄNZER'],
    'GAME SOUND DUCKS, THE DANCE TRACK IS BOOSTED': ['ЗВУК ИГРЫ ПРИГЛУШАЕТСЯ, МУЗЫКА ТАНЦА УСИЛИВАЕТСЯ', 'SPIELTON WIRD GEDÄMPFT, DER TANZ-TRACK VERSTÄRKT'],
    'PLAYS ONCE: ANY MOVE OR SHOT CANCELS IT': ['ИГРАЕТ ОДИН РАЗ: ЛЮБОЕ ДВИЖЕНИЕ ИЛИ ВЫСТРЕЛ ПРЕРЫВАЕТ', 'SPIELT EINMAL: JEDE BEWEGUNG ODER JEDER SCHUSS BRICHT AB'],
    'C:\\NEXA\\SHOP\\ // PLUSH ITEMS GRANT A MISSION ABILITY. ONE ITEM CAN BE CARRIED INTO A MISSION. EMOTES ARE PLAYED FROM THE WHEEL: HOLD B.': ['C:\\NEXA\\SHOP\\ // ПЛЮШЕВЫЕ ПРЕДМЕТЫ ДАЮТ СПОСОБНОСТЬ В МИССИИ. В МИССИЮ МОЖНО ВЗЯТЬ ОДИН ПРЕДМЕТ. ЭМОЦИИ ИГРАЮТСЯ ИЗ КОЛЕСА: ЗАЖМИ B.', 'C:\\NEXA\\SHOP\\ // PLÜSCHARTIKEL VERLEIHEN EINE MISSIONSFÄHIGKEIT. EIN ARTIKEL KANN IN EINE MISSION MITGENOMMEN WERDEN. EMOTES WERDEN AUS DEM RAD GESPIELT: B HALTEN.'],
    'BEAT DROP': ['БИТ-ДРОП', 'BEAT DROP'],
    'BEAT': ['БИТ', 'BEAT'],
    'LOOK WHAT I CAN DO': ['СМОТРИ КАК МОГУ', 'SCHAU, WAS ICH KANN'],
    'LOOK': ['СМОТРИ', 'SCHAU'],
    'COME ON, STEP UP!': ['ДАВАЙ, ПОДХОДИ!', 'KOMM SCHON, TRAU DICH!'],
    'COME ON': ['ДАВАЙ', 'KOMM'],
    'LOOPING FULL-BODY DANCE FROM A REAL POSE CAPTURE': ['ЗАЦИКЛЕННЫЙ ТАНЕЦ ВСЕГО ТЕЛА ПО РЕАЛЬНОМУ ЗАХВАТУ ПОЗЫ', 'ENDLOSER GANZKÖRPERTANZ AUS ECHTER POSENERFASSUNG'],
    'REPEATS UNTIL YOU SHOOT, RUN OR MOVE': ['ПОВТОРЯЕТСЯ, ПОКА ТЫ НЕ СТРЕЛЯЕШЬ, НЕ БЕЖИШЬ И НЕ ДВИГАЕШЬСЯ', 'WIEDERHOLT SICH, BIS DU SCHIESST, RENNST ODER DICH BEWEGST'],
    'EMOTES': ['ЭМОЦИИ', 'EMOTES'],
    'RELEASE B': ['ОТПУСТИ B', 'B LOSLASSEN'],
    'EMPTY SLOT': ['ПУСТОЙ СЛОТ', 'LEERER SLOT'],
    'HOVER THE MOUSE': ['ВЫБЕРИ МЫШЬЮ', 'MAUS BEWEGEN'],
    'HOLD B: EMOTES': ['ЗАЖМИ B: ЭМОЦИИ', 'B HALTEN: EMOTES'],
    'ANIMATION': ['АНИМАЦИЯ', 'ANIMATION'],
    'EMOTE ANIMATION ITEM': ['ПРЕДМЕТ-ЭМОЦИЯ', 'EMOTE-ARTIKEL'],
    'DRAG: ROTATE THE DANCER | WHEEL: ZOOM | SPACE: REPLAY': ['ТЯНИ: ВРАЩАТЬ ТАНЦОРА  |  КОЛЕСО: МАСШТАБ  |  ПРОБЕЛ: ПОВТОР', 'ZIEHEN: TÄNZER DREHEN  |  RAD: ZOOM  |  LEERTASTE: WIEDERHOLEN'],
    'REPLAY': ['ПОВТОР', 'WIEDERHOLEN'],
    'AUDIO UNAVAILABLE': ['ЗВУК НЕДОСТУПЕН', 'AUDIO NICHT VERFÜGBAR'],
    'EMOTE DATA UNAVAILABLE': ['ДАННЫЕ ЭМОЦИИ НЕДОСТУПНЫ', 'EMOTE-DATEN NICHT VERFÜGBAR']
  });
}());
