// NEXA: переводы окна выбора режима и PvP (RU/DE). Исходный язык — английский; '@net:' — только внутри [data-i18n="net"].
(function () {
  'use strict';
  if (!window.I18N) return;
  const T = {
    'SELECT MODE': ['ВЫБОР РЕЖИМА', 'MODUS WÄHLEN'], 'STORY': ['СЮЖЕТ', 'STORY'], 'SANDBOX': ['ПЕСОЧНИЦА', 'SANDBOX'], 'BATTLE ROYALE': ['КОРОЛЕВСКАЯ БИТВА', 'BATTLE ROYALE'], 'PVP': ['PVP', 'PVP'],
    'HIGH / LOW': ['HIGH / LOW', 'HIGH / LOW'], 'PLAYERS': ['ИГРОКИ', 'SPIELER'], 'SELECTED': ['ВЫБРАНО', 'GEWÄHLT'], 'DONE': ['ПРОЙДЕНО', 'ERLEDIGT'], 'NEW': ['НОВОЕ', 'NEU'], 'CLOSED': ['ЗАКРЫТО', 'GESPERRT'],
    'CO-OP': ['КООП', 'KOOP'], 'CO-OP MISSION': ['КООП-МИССИЯ', 'KOOP-MISSION'], 'CHOOSE A PVP MODE': ['ВЫБЕРИ РЕЖИМ PVP', 'PVP-MODUS WÄHLEN'], 'SINGLE MODE': ['ОДИН РЕЖИМ', 'EIN MODUS'], 'ALL': ['ВСЕ', 'ALLE'],
    'LEVEL': ['СЛОЖНОСТЬ', 'STUFE'], 'NOTHING FOUND': ['НИЧЕГО НЕ НАЙДЕНО', 'NICHTS GEFUNDEN'], 'DIFFICULTY': ['СЛОЖНОСТЬ', 'SCHWIERIGKEIT'], 'GOAL': ['ЦЕЛЬ', 'ZIEL'], 'WEAPONS': ['ОРУЖИЕ', 'WAFFEN'], 'MAP': ['КАРТА', 'KARTE'],
    'FRIENDLY FIRE': ['ОГОНЬ ПО СВОИМ', 'FRIENDLY FIRE'], 'DAMAGE TO ALLIES': ['УРОН СОЮЗНИКАМ', 'SCHADEN AN VERBÜNDETEN'], 'ON': ['ВКЛ', 'AN'], 'OFF': ['ВЫКЛ', 'AUS'], 'KILLS': ['УБИЙСТВ', 'KILLS'], 'MIN': ['МИН', 'MIN'],
    'ALL WEAPONS': ['ВСЁ ОРУЖИЕ', 'ALLE WAFFEN'], 'RANDOM': ['СЛУЧАЙНОЕ', 'ZUFALL'], 'GLOCK': ['GLOCK', 'GLOCK'], 'AK': ['AK', 'AK'], 'SHOTGUN': ['ДРОБОВИК', 'SCHROTFLINTE'], 'SNIPER': ['СНАЙПЕРКА', 'SCHARFSCHÜTZE'],
    'TRAINING HALL': ['ТРЕНИРОВОЧНЫЙ ЗАЛ', 'TRAININGSHALLE'], 'SCRAPYARD': ['СВАЛКА', 'SCHROTTPLATZ'], 'PLAY': ['ИГРАТЬ', 'SPIELEN'], 'SELECT': ['ВЫБРАТЬ', 'WÄHLEN'],
    'DEATHMATCH': ['БОЙ НАСМЕРТЬ', 'DEATHMATCH'], 'TEAM BATTLE': ['КОМАНДНЫЙ БОЙ', 'TEAMKAMPF'], 'DUEL 1V1': ['ДУЭЛЬ 1×1', 'DUELL 1V1'], 'DUEL': ['ДУЭЛЬ', 'DUELL'], 'TEAM DEATHMATCH': ['КОМАНДНЫЙ БОЙ', 'TEAM-DEATHMATCH'],
    'CO-OP · WAVES': ['КООП · ВОЛНЫ', 'KOOP · WELLEN'], 'LAST ONE STANDING': ['ВЫЖИВАЕТ ОДИН', 'LETZTER ÜBERLEBENDER'], 'PVP · FREE FOR ALL': ['PVP · ВСЕ ПРОТИВ ВСЕХ', 'PVP · JEDER GEGEN JEDEN'], 'PVP · TWO TEAMS': ['PVP · ДВЕ КОМАНДЫ', 'PVP · ZWEI TEAMS'],
    'PVP · 1 VS 1': ['PVP · 1 НА 1', 'PVP · 1 GEGEN 1'], 'TABLE GAME': ['НАСТОЛЬНАЯ ИГРА', 'TISCHSPIEL'], 'CO-OP MISSIONS 01–48': ['КООП-МИССИИ 01–48', 'KOOP-MISSIONEN 01–48'],
    'Waves of enemies in the training hall. Ammo never runs out. Hold the line with your friends.': ['Волны врагов в тренировочном зале. Патроны не кончаются. Держите оборону вместе с друзьями.', 'Gegnerwellen in der Trainingshalle. Die Munition geht nie aus. Haltet die Stellung mit euren Freunden.'],
    'Up to 10 players in one arena. Bots fill empty seats after the timer. Last one standing wins.': ['До 10 игроков на одной арене. Пустые места после таймера займут боты. Побеждает последний выживший.', 'Bis zu 10 Spieler in einer Arena. Bots füllen leere Plätze nach dem Timer. Der Letzte, der steht, gewinnt.'],
    'Everyone against everyone. First to the kill limit, or the best score at time-out, wins. Respawn in 3 seconds, 2 seconds of protection.': ['Все против всех. Побеждает тот, кто первым добрал лимит убийств, или лучший по счёту, когда время вышло. Респаун через 3 секунды, 2 секунды защиты.', 'Jeder gegen jeden. Wer zuerst das Kill-Limit erreicht oder bei Zeitablauf die beste Wertung hat, gewinnt. Respawn nach 3 Sekunden, 2 Sekunden Schutz.'],
    'Two teams, kills add up. Friendly fire is off by default. Respawn in 3 seconds.': ['Две команды, убийства суммируются. Огонь по своим по умолчанию выключен. Респаун через 3 секунды.', 'Zwei Teams, Kills werden addiert. Friendly Fire ist standardmäßig aus. Respawn nach 3 Sekunden.'],
    'One on one. Pure aim: first to the limit wins.': ['Один на один. Чистая стрельба: побеждает тот, кто первым достиг лимита.', 'Eins gegen eins. Reines Zielen: Wer zuerst das Limit erreicht, gewinnt.'],
    'The table game. Bots fill empty seats.': ['Настольная игра. Пустые места займут боты.', 'Das Tischspiel. Bots füllen leere Plätze.'],
    'PVP NEEDS 2–6 PLAYERS': ['ДЛЯ PVP НУЖНО 2–6 ИГРОКОВ', 'PVP BRAUCHT 2–6 SPIELER'], 'DUEL NEEDS EXACTLY 2 PLAYERS': ['ДЛЯ ДУЭЛИ НУЖНО РОВНО 2 ИГРОКА', 'FÜR EIN DUELL SIND GENAU 2 SPIELER NÖTIG'],
    'PVP NEEDS 2–6 PLAYERS — OPEN CONNECTION': ['ДЛЯ PVP НУЖНО 2–6 ИГРОКОВ — ОТКРОЙ СОЕДИНЕНИЕ', 'PVP BRAUCHT 2–6 SPIELER — VERBINDUNG ÖFFNEN'],
    'Search by number or name  ( / )': ['Поиск по номеру или названию  ( / )', 'Suche nach Nummer oder Name  ( / )'],
    'RED': ['КРАСНЫЕ', 'ROT'], 'BLUE': ['СИНИЕ', 'BLAU'], 'YOU': ['ТЫ', 'DU'], 'ENEMY': ['ВРАГ', 'GEGNER'], 'BEST RIVAL': ['ЛУЧШИЙ СОПЕРНИК', 'BESTER GEGNER'], 'FIRST TO': ['ПЕРВЫЙ ДО', 'ZUERST'], 'TIME LIMIT': ['ЛИМИТ ВРЕМЕНИ', 'ZEITLIMIT'],
    'SPAWN PROTECTION': ['ЗАЩИТА ПОСЛЕ РЕСПАУНА', 'SPAWN-SCHUTZ'], 'GET READY': ['ПРИГОТОВЬСЯ', 'MACH DICH BEREIT'], 'FIGHT': ['В БОЙ', 'KAMPF'], 'KILL': ['УБИЙСТВО', 'KILL'], 'ELIMINATED': ['ТЫ УБИТ', 'AUSGESCHALTET'],
    'WAITING FOR PLAYERS': ['ЖДЁМ ИГРОКОВ', 'WARTE AUF SPIELER'], 'HEALTH': ['АПТЕЧКА', 'MEDIPACK'], 'AMMO': ['ПАТРОНЫ', 'MUNITION'], 'PLAYER': ['ИГРОК', 'SPIELER'], 'DEATHS': ['СМЕРТЕЙ', 'TODE'], 'PING': ['ПИНГ', 'PING'],
    'VICTORY': ['ПОБЕДА', 'SIEG'], 'DEFEAT': ['ПОРАЖЕНИЕ', 'NIEDERLAGE'], 'DRAW': ['НИЧЬЯ', 'UNENTSCHIEDEN'], 'RED TEAM WINS': ['КРАСНЫЕ ПОБЕДИЛИ', 'TEAM ROT GEWINNT'], 'BLUE TEAM WINS': ['СИНИЕ ПОБЕДИЛИ', 'TEAM BLAU GEWINNT'], 'WINS': ['ПОБЕЖДАЕТ', 'GEWINNT'],
    'MVP': ['MVP', 'MVP'], 'REWARD': ['НАГРАДА', 'BELOHNUNG'], 'PLAY AGAIN': ['ИГРАТЬ ЕЩЁ', 'NOCHMAL SPIELEN'], 'BACK TO LOBBY': ['В ЛОББИ', 'ZURÜCK ZUR LOBBY'], 'WAITING FOR THE HOST…': ['ЖДЁМ ХОСТА…', 'WARTE AUF DEN HOST…']
  };
  const o = {}; Object.keys(T).forEach((k) => { o['@net:' + k] = T[k]; });
  I18N.add('en', o);
}());
