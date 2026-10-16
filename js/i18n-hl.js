(function () {
  'use strict';
  const D = {
    en: {
      round: 'ROUND {a}/{b}', turn: 'TURN {n}', yourTurn: 'YOUR TURN', pick: 'PICK A NUMBER', picking: 'PICKING NUMBERS', scores: 'SCORES', leave: 'LEAVE TABLE', sure: 'PRESS AGAIN TO LEAVE',
      skipped: '{n}: TURN SKIPPED', left: '{n} LEFT THE TABLE', out: '{n} IS OUT', hostLeft: 'THE HOST LEFT THE TABLE', spec: 'SPECTATING — YOU TAKE A SEAT NEXT ROUND', full: 'THE TABLE IS FULL',
      verified: 'COMMITMENTS VERIFIED', cheat: 'CHEAT DETECTED: {n}', altered: 'THE HOST CHANGED A VERDICT FOR YOUR NUMBER', waiting: 'WAITING FOR PLAYERS', final: 'FINAL STANDINGS', winner: 'WINNER', draw: 'DRAW',
      back: 'RETURN TO LOBBY', kp: '+{n} KP', total: 'TOTAL', nextRound: 'NEXT ROUND IN {n}', you: 'YOU', bot: 'SUBJECT {n}', commit: 'NUMBER LOCKED // HASH {h}', emotes: 'EMOTES',
      e0: 'GG', e1: '?!', e2: 'HA', e3: '...', e4: 'HANDS UP', hostOnly: 'THE HOST STARTS THE ROUND', noRestart: 'THE MATCH CONTINUES AUTOMATICALLY', pts: '+{n}', lost: 'CONNECTION LOST'
    },
    ru: {
      round: 'РАУНД {a}/{b}', turn: 'ХОД {n}', yourTurn: 'ВАШ ХОД', pick: 'ВЫБЕРИТЕ ЧИСЛО', picking: 'ВЫБОР ЧИСЕЛ', scores: 'СЧЁТ', leave: 'ВСТАТЬ ИЗ-ЗА СТОЛА', sure: 'НАЖМИТЕ ЕЩЁ РАЗ, ЧТОБЫ УЙТИ',
      skipped: '{n}: ХОД ПРОПУЩЕН', left: '{n} ВСТАЛ ИЗ-ЗА СТОЛА', out: '{n} ВЫБЫВАЕТ', hostLeft: 'ХОСТ ПОКИНУЛ СТОЛ', spec: 'ВЫ ЗРИТЕЛЬ — МЕСТО ДОСТАНЕТСЯ В СЛЕДУЮЩЕМ РАУНДЕ', full: 'ЗА СТОЛОМ НЕТ МЕСТ',
      verified: 'ОБЯЗАТЕЛЬСТВА ПРОВЕРЕНЫ', cheat: 'ОБМАН: {n}', altered: 'ХОСТ ПОДМЕНИЛ ВЕРДИКТ ПО ВАШЕМУ ЧИСЛУ', waiting: 'ЖДЁМ ИГРОКОВ', final: 'ИТОГИ МАТЧА', winner: 'ПОБЕДИТЕЛЬ', draw: 'НИЧЬЯ',
      back: 'ВЕРНУТЬСЯ В ЛОББИ', kp: '+{n} KP', total: 'ВСЕГО', nextRound: 'СЛЕДУЮЩИЙ РАУНД ЧЕРЕЗ {n}', you: 'ВЫ', bot: 'СУБЪЕКТ {n}', commit: 'ЧИСЛО ЗАФИКСИРОВАНО // ХЕШ {h}', emotes: 'ЭМОЦИИ',
      e0: 'GG', e1: '?!', e2: 'ХА', e3: '...', e4: 'РУКИ ВВЕРХ', hostOnly: 'РАУНД НАЧИНАЕТ ХОСТ', noRestart: 'МАТЧ ПРОДОЛЖИТСЯ АВТОМАТИЧЕСКИ', pts: '+{n}', lost: 'СВЯЗЬ ПОТЕРЯНА'
    },
    de: {
      round: 'RUNDE {a}/{b}', turn: 'ZUG {n}', yourTurn: 'DU BIST DRAN', pick: 'ZAHL WÄHLEN', picking: 'ZAHLEN WERDEN GEWÄHLT', scores: 'PUNKTE', leave: 'TISCH VERLASSEN', sure: 'ZUM VERLASSEN NOCHMAL DRÜCKEN',
      skipped: '{n}: ZUG ÜBERSPRUNGEN', left: '{n} HAT DEN TISCH VERLASSEN', out: '{n} SCHEIDET AUS', hostLeft: 'DER HOST HAT DEN TISCH VERLASSEN', spec: 'ZUSCHAUER — DU SITZT IN DER NÄCHSTEN RUNDE', full: 'DER TISCH IST VOLL',
      verified: 'FESTLEGUNGEN GEPRÜFT', cheat: 'BETRUG ERKANNT: {n}', altered: 'DER HOST HAT EIN URTEIL ZU DEINER ZAHL GEÄNDERT', waiting: 'WARTE AUF SPIELER', final: 'ENDSTAND', winner: 'SIEGER', draw: 'UNENTSCHIEDEN',
      back: 'ZURÜCK ZUR LOBBY', kp: '+{n} KP', total: 'GESAMT', nextRound: 'NÄCHSTE RUNDE IN {n}', you: 'DU', bot: 'PROBAND {n}', commit: 'ZAHL FESTGELEGT // HASH {h}', emotes: 'EMOTES',
      e0: 'GG', e1: '?!', e2: 'HA', e3: '...', e4: 'HÄNDE HOCH', hostOnly: 'DER HOST STARTET DIE RUNDE', noRestart: 'DAS MATCH LÄUFT AUTOMATISCH WEITER', pts: '+{n}', lost: 'VERBINDUNG VERLOREN'
    }
  };
  window.NexaHLText = function (k, v) {
    const l = (window.I18N && I18N.lang) || 'en', t = (D[l] || D.en)[k] || D.en[k] || k;
    return v ? t.replace(/\{(\w+)\}/g, (m, x) => (v[x] == null ? '' : String(v[x]))) : t;
  };
  if (window.I18N) {
    I18N.add('en', {
      'HIGH / LOW': ['HIGH / LOW', 'HIGH / LOW'],
      'THE TABLE GAME, 2–6 PLAYERS, BOTS FILL EMPTY SEATS': ['ИГРА ЗА СТОЛОМ, 2–6 ИГРОКОВ, БОТЫ ЗАНИМАЮТ СВОБОДНЫЕ МЕСТА', 'DAS TISCHSPIEL, 2–6 SPIELER, BOTS FÜLLEN LEERE PLÄTZE'],
      '2–6 PLAYERS': ['2–6 ИГРОКОВ', '2–6 SPIELER'],
      'HIGH / LOW — THE TABLE GAME': ['HIGH / LOW — ИГРА ЗА СТОЛОМ', 'HIGH / LOW — DAS TISCHSPIEL'],
      'EVERY NUMBER IS SEALED WITH A HASH; THE HOST CANNOT SWAP IT': ['КАЖДОЕ ЧИСЛО ЗАПЕЧАТАНО ХЕШЕМ; ХОСТ НЕ МОЖЕТ ЕГО ПОДМЕНИТЬ', 'JEDE ZAHL IST MIT EINEM HASH VERSIEGELT; DER HOST KANN SIE NICHT TAUSCHEN'],
      'COULD NOT START THE TABLE': ['НЕ УДАЛОСЬ ОТКРЫТЬ СТОЛ', 'TISCH KONNTE NICHT GESTARTET WERDEN']
    });
  }
}());
