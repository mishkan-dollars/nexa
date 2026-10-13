// NEXA: переводы интерактивных комнат (js/interiors.js, js/breach.js). Исходный язык — английский; массив = [ru, de].
(function () {
  'use strict';
  if (!window.I18N) return;
  I18N.add('en', {
    'BREACH DOOR': ['ВЫБИТЬ ДВЕРЬ', 'TÜR AUFBRECHEN'],
    'SECURE HOSTAGE': ['ВЗЯТЬ В ПЛЕН', 'GEISEL SICHERN'],
    'SHOOT = EXECUTE // [E] = SECURE HOSTAGE': ['ВЫСТРЕЛ = КАЗНЬ // [E] = ВЗЯТЬ В ПЛЕН', 'SCHUSS = HINRICHTUNG // [E] = GEISEL SICHERN'],
    'HE SURRENDERS — KEEP YOUR AIM ON HIM AND HE WILL KNEEL': ['ОН СДАЁТСЯ — ДЕРЖИ ЕГО НА ПРИЦЕЛЕ, И ОН ВСТАНЕТ НА КОЛЕНИ', 'ER ERGIBT SICH — HALTE IHN IM VISIER, DANN KNIET ER NIEDER'],
    '+50 CR · SURPRISE KILL': ['+50 CR · УБИЙСТВО ВРАСПЛОХ', '+50 CR · ÜBERRASCHUNGSKILL'],
    '+80 CR · BRUTAL ELIMINATION': ['+80 CR · ЖЁСТКОЕ УСТРАНЕНИЕ', '+80 CR · BRUTALE ELIMINIERUNG'],
    '+25 CR · DOOR HIT': ['+25 CR · УДАР ДВЕРЬЮ', '+25 CR · TÜRTREFFER'],
    '+120 CR · HOSTAGE SECURED': ['+120 CR · ПЛЕННИК ВЗЯТ', '+120 CR · GEISEL GESICHERT'],
    '+250 CR · KNEE EXECUTION': ['+250 CR · КАЗНЬ НА КОЛЕНЯХ', '+250 CR · KNIE-HINRICHTUNG'],
    '+100 CR · ROOM CLEARED — NO RESISTANCE': ['+100 CR · КОМНАТА ЗАЧИЩЕНА — БЕЗ СОПРОТИВЛЕНИЯ', '+100 CR · RAUM GESÄUBERT — KEIN WIDERSTAND'],
    'BREACH ROOM': ['ШТУРМ КОМНАТЫ', 'RAUM STÜRMEN'],
    'BREACH ROOM — [E]': ['ШТУРМ КОМНАТЫ — [E]', 'RAUM STÜRMEN — [E]'],
    'ROOMS OFF (?rooms=0)': ['КОМНАТЫ ОТКЛЮЧЕНЫ (?rooms=0)', 'RÄUME AUS (?rooms=0)']
  });
}());
