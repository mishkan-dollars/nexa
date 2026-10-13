// NEXA: «удивляющие штуки» миссий 8–47 (js/twists*.js). Исходный язык строк — en (HUD, подсказки, цели) или ru (реплики-субтитры); массив = переводы на остальные языки в порядке (en|ru), de.
(function () {
  'use strict';
  if (!window.I18N) return;
  I18N.add('en', {
    // --- общее
    "+{0} CR {s0}": ["+{0} CR {s0}", "+{0} CR {s0}"],
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
    "SUBJECT 024 — STANDING ON THE PLATFORM, WATCHING THE TRAIN": ["СУБЪЕКТ 024 — СТОИТ НА ПЛАТФОРМЕ И СМОТРИТ НА ПОЕЗД", "SUBJEKT 024 — STEHT AUF DEM BAHNSTEIG UND BEOBACHTET DEN ZUG"]
  });
  I18N.add('ru', {
    "ТРОС ОБОРВАН. СВОБОДНОЕ ПАДЕНИЕ.": ["THE CABLE IS CUT. FREE FALL.", "SEIL GERISSEN. FREIER FALL."]
  });
}());
