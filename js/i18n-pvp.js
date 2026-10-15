// NEXA: переводы окна выбора режима и PvP (RU/DE). Исходный язык — английский; '@net:' — только внутри [data-i18n="net"].
(function () {
  'use strict';
  if (!window.I18N) return;
  const T = {
    'COULD NOT BUILD THE LIST': ['НЕ УДАЛОСЬ ПОСТРОИТЬ СПИСОК', 'LISTE KONNTE NICHT ERSTELLT WERDEN'], 'RETRY': ['ПОВТОРИТЬ', 'WIEDERHOLEN'], 'SELECT MODE': ['ВЫБОР РЕЖИМА', 'MODUS WÄHLEN'], 'STORY': ['СЮЖЕТ', 'STORY'], 'SANDBOX': ['ПЕСОЧНИЦА', 'SANDBOX'], 'PVP': ['PVP', 'PVP'],
    'HIGH / LOW': ['HIGH / LOW', 'HIGH / LOW'], 'PLAYERS': ['ИГРОКИ', 'SPIELER'], 'SELECTED': ['ВЫБРАНО', 'GEWÄHLT'], 'DONE': ['ПРОЙДЕНО', 'ERLEDIGT'], 'NEW': ['НОВОЕ', 'NEU'], 'CLOSED': ['ЗАКРЫТО', 'GESPERRT'],
    'CO-OP': ['КООП', 'KOOP'], 'CO-OP MISSION': ['КООП-МИССИЯ', 'KOOP-MISSION'], 'CHOOSE A PVP MODE': ['ВЫБЕРИ РЕЖИМ PVP', 'PVP-MODUS WÄHLEN'], 'SINGLE MODE': ['ОДИН РЕЖИМ', 'EIN MODUS'], 'ALL': ['ВСЕ', 'ALLE'],
    'LEVEL': ['СЛОЖНОСТЬ', 'STUFE'], 'NOTHING FOUND': ['НИЧЕГО НЕ НАЙДЕНО', 'NICHTS GEFUNDEN'], 'DIFFICULTY': ['СЛОЖНОСТЬ', 'SCHWIERIGKEIT'], 'GOAL': ['ЦЕЛЬ', 'ZIEL'], 'WEAPONS': ['ОРУЖИЕ', 'WAFFEN'], 'MAP': ['КАРТА', 'KARTE'],
    'FRIENDLY FIRE': ['ОГОНЬ ПО СВОИМ', 'FRIENDLY FIRE'], 'DAMAGE TO ALLIES': ['УРОН СОЮЗНИКАМ', 'SCHADEN AN VERBÜNDETEN'], 'ON': ['ВКЛ', 'AN'], 'OFF': ['ВЫКЛ', 'AUS'], 'KILLS': ['УБИЙСТВ', 'KILLS'], 'MIN': ['МИН', 'MIN'],
    'ALL WEAPONS': ['ВСЁ ОРУЖИЕ', 'ALLE WAFFEN'], 'RANDOM': ['СЛУЧАЙНОЕ', 'ZUFALL'], 'GLOCK': ['GLOCK', 'GLOCK'], 'AK': ['AK', 'AK'], 'SHOTGUN': ['ДРОБОВИК', 'SCHROTFLINTE'], 'SNIPER': ['СНАЙПЕРКА', 'SCHARFSCHÜTZE'],
    'TRAINING HALL': ['ТРЕНИРОВОЧНЫЙ ЗАЛ', 'TRAININGSHALLE'], 'SCRAPYARD': ['СВАЛКА', 'SCHROTTPLATZ'], 'PLAY': ['ИГРАТЬ', 'SPIELEN'], 'SELECT': ['ВЫБРАТЬ', 'WÄHLEN'],
    'TEAM BATTLE': ['КОМАНДНЫЙ БОЙ', 'TEAMKAMPF'], 'DUEL 1V1': ['ДУЭЛЬ 1×1', 'DUELL 1V1'], 'DUEL': ['ДУЭЛЬ', 'DUELL'], 
    'CO-OP · WAVES': ['КООП · ВОЛНЫ', 'KOOP · WELLEN'], 'LAST ONE STANDING': ['ВЫЖИВАЕТ ОДИН', 'LETZTER ÜBERLEBENDER'], 'PVP · FREE FOR ALL': ['PVP · ВСЕ ПРОТИВ ВСЕХ', 'PVP · JEDER GEGEN JEDEN'], 'PVP · TWO TEAMS': ['PVP · ДВЕ КОМАНДЫ', 'PVP · ZWEI TEAMS'],
    'PVP · 1 VS 1': ['PVP · 1 НА 1', 'PVP · 1 GEGEN 1'], 'TABLE GAME': ['НАСТОЛЬНАЯ ИГРА', 'TISCHSPIEL'], 'CO-OP MISSIONS 01–48': ['КООП-МИССИИ 01–48', 'KOOP-MISSIONEN 01–48'],
    'Waves of enemies in the training hall. Ammo never runs out. Hold the line with your friends.': ['Волны врагов в тренировочном зале. Патроны не кончаются. Держите оборону вместе с друзьями.', 'Gegnerwellen in der Trainingshalle. Die Munition geht nie aus. Haltet die Stellung mit euren Freunden.'],
    'Two teams, kills add up. Friendly fire is off by default. Respawn in 3 seconds.': ['Две команды, убийства суммируются. Огонь по своим по умолчанию выключен. Респаун через 3 секунды.', 'Zwei Teams, Kills werden addiert. Friendly Fire ist standardmäßig aus. Respawn nach 3 Sekunden.'],
    'One on one. Pure aim: first to the limit wins.': ['Один на один. Чистая стрельба: побеждает тот, кто первым достиг лимита.', 'Eins gegen eins. Reines Zielen: Wer zuerst das Limit erreicht, gewinnt.'],
    'The table game. Bots fill empty seats.': ['Настольная игра. Пустые места займут боты.', 'Das Tischspiel. Bots füllen leere Plätze.'],
    'PVP NEEDS 2–6 PLAYERS': ['ДЛЯ PVP НУЖНО 2–6 ИГРОКОВ', 'PVP BRAUCHT 2–6 SPIELER'], 'DUEL NEEDS EXACTLY 2 PLAYERS': ['ДЛЯ ДУЭЛИ НУЖНО РОВНО 2 ИГРОКА', 'FÜR EIN DUELL SIND GENAU 2 SPIELER NÖTIG'],
    'PVP NEEDS 2–6 PLAYERS — OPEN CONNECTION': ['ДЛЯ PVP НУЖНО 2–6 ИГРОКОВ — ОТКРОЙ СОЕДИНЕНИЕ', 'PVP BRAUCHT 2–6 SPIELER — VERBINDUNG ÖFFNEN'],
    'Search by number or name  ( / )': ['Поиск по номеру или названию  ( / )', 'Suche nach Nummer oder Name  ( / )'],

    'FREE FOR ALL': ['КАЖДЫЙ САМ ЗА СЕБЯ', 'JEDER GEGEN JEDEN'], 'PVP · QUICK MATCH': ['PVP · БЫСТРЫЙ ПОДБОР', 'PVP · SCHNELLSUCHE'], 'PVP MAP': ['КАРТА PVP', 'PVP-KARTE'], 'VOTE': ['ГОЛОСОВАНИЕ', 'ABSTIMMUNG'], 'DEPOT': ['СКЛАД', 'LAGER'], 'LAB': ['ЛАБОРАТОРИЯ', 'LABOR'], 'ROOF': ['КРЫША', 'DACH'],
    'RANDOM MAP': ['СЛУЧАЙНАЯ КАРТА', 'ZUFÄLLIGE KARTE'], 'MAP VOTE': ['ГОЛОСОВАНИЕ ЗА КАРТУ', 'KARTENABSTIMMUNG'], 'VOTE FOR THE MAP': ['ГОЛОСУЙ ЗА КАРТУ', 'STIMME FÜR DIE KARTE'], 'WEAPON': ['ОРУЖИЕ', 'WAFFE'], 'START NOW': ['НАЧАТЬ СЕЙЧАС', 'JETZT STARTEN'],
    'PVP — FREE FOR ALL': ['PVP — КАЖДЫЙ САМ ЗА СЕБЯ', 'PVP — JEDER GEGEN JEDEN'], 'PVP — TEAM BATTLE': ['PVP — КОМАНДНЫЙ БОЙ', 'PVP — TEAMKAMPF'], 'PVP — DUEL 1V1': ['PVP — ДУЭЛЬ 1×1', 'PVP — DUELL 1V1'],
    'THE MATCH STARTS WHEN THE HOST BEGINS': ['МАТЧ НАЧНЁТСЯ, КОГДА ХОСТ ЕГО ЗАПУСТИТ', 'DAS MATCH STARTET, WENN DER HOST ES BEGINNT'], 'WAITING FOR PLAYERS — START NOW WITH 2 OR MORE': ['ЖДЁМ ИГРОКОВ — «НАЧАТЬ СЕЙЧАС» ОТ 2 ИГРОКОВ', 'WARTE AUF SPIELER — „JETZT STARTEN“ AB 2 SPIELERN'],
    'SEARCHING FOR PLAYERS': ['ИЩЕМ ИГРОКОВ', 'SUCHE SPIELER'], 'PRESS READY TO FIND A MATCH': ['НАЖМИ «ГОТОВО», ЧТОБЫ НАЙТИ МАТЧ', 'DRÜCKE „BEREIT“, UM EIN MATCH ZU FINDEN'], 'PRESS READY IN THE LOBBY TO FIND A MATCH': ['НАЖМИ «ГОТОВО» В ЛОББИ, ЧТОБЫ НАЙТИ МАТЧ', 'DRÜCKE IN DER LOBBY „BEREIT“, UM EIN MATCH ZU FINDEN'],
    'Everyone against everyone, 2–6 players, no bots. Press READY: the game finds an open match or opens one. First to the kill limit, or the best score at time-out, wins. Respawn in 3 seconds.': ['Все против всех, 2–6 игроков, без ботов. Нажми «ГОТОВО»: игра найдёт открытый матч или откроет свой. Побеждает тот, кто первым добрал лимит убийств, или лучший по счёту, когда время вышло. Респаун через 3 секунды.', 'Jeder gegen jeden, 2–6 Spieler, keine Bots. Drücke „BEREIT“: Das Spiel findet ein offenes Match oder eröffnet eines. Wer zuerst das Kill-Limit erreicht oder bei Zeitablauf die beste Wertung hat, gewinnt. Respawn nach 3 Sekunden.'],
    'RED': ['КРАСНЫЕ', 'ROT'], 'BLUE': ['СИНИЕ', 'BLAU'], 'YOU': ['ТЫ', 'DU'], 'ENEMY': ['ВРАГ', 'GEGNER'], 'BEST RIVAL': ['ЛУЧШИЙ СОПЕРНИК', 'BESTER GEGNER'], 'FIRST TO': ['ПЕРВЫЙ ДО', 'ZUERST'], 'TIME LIMIT': ['ЛИМИТ ВРЕМЕНИ', 'ZEITLIMIT'],
    'SPAWN PROTECTION': ['ЗАЩИТА ПОСЛЕ РЕСПАУНА', 'SPAWN-SCHUTZ'], 'GET READY': ['ПРИГОТОВЬСЯ', 'MACH DICH BEREIT'], 'FIGHT': ['В БОЙ', 'KAMPF'], 'KILL': ['УБИЙСТВО', 'KILL'], 'ELIMINATED': ['ТЫ УБИТ', 'AUSGESCHALTET'],
    'WAITING FOR PLAYERS': ['ЖДЁМ ИГРОКОВ', 'WARTE AUF SPIELER'], 'HEALTH': ['АПТЕЧКА', 'MEDIPACK'], 'AMMO': ['ПАТРОНЫ', 'MUNITION'], 'PLAYER': ['ИГРОК', 'SPIELER'], 'DEATHS': ['СМЕРТЕЙ', 'TODE'], 'PING': ['ПИНГ', 'PING'],
    'VICTORY': ['ПОБЕДА', 'SIEG'], 'DEFEAT': ['ПОРАЖЕНИЕ', 'NIEDERLAGE'], 'DRAW': ['НИЧЬЯ', 'UNENTSCHIEDEN'], 'RED TEAM WINS': ['КРАСНЫЕ ПОБЕДИЛИ', 'TEAM ROT GEWINNT'], 'BLUE TEAM WINS': ['СИНИЕ ПОБЕДИЛИ', 'TEAM BLAU GEWINNT'], 'WINS': ['ПОБЕЖДАЕТ', 'GEWINNT'],
    'MVP': ['MVP', 'MVP'], 'REWARD': ['НАГРАДА', 'BELOHNUNG'], 'PLAY AGAIN': ['ИГРАТЬ ЕЩЁ', 'NOCHMAL SPIELEN'], 'BACK TO LOBBY': ['В ЛОББИ', 'ZURÜCK ZUR LOBBY'], 'WAITING FOR THE HOST…': ['ЖДЁМ ХОСТА…', 'WARTE AUF DEN HOST…']
  };
  const o = {}; Object.keys(T).forEach((k) => { o['@net:' + k] = T[k]; });
  I18N.add('en', o);
}());
