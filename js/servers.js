// NEXA: список публичных серверов сигналинга (js/rendezvous.js). Правьте ЗДЕСЬ — остальной код ничего не знает о конкретных адресах.
// Через них ходят только служебные SDP offer/answer; игра, чат и голос идут напрямую P2P. Ручной режим (коды) и режим «этот компьютер» от серверов не зависят.
// ТОЛЬКО открытые общественные серверы без аккаунтов, ключей и оплаты. Платные, по подписке, с whitelist, PoW, тарифами и квотами — НЕ добавлять
// (исключены сознательно: nostr.wine, relay.nostrplebs.com, eden.nostr.land, nostr.zebedee.cloud, relay.minds.com и др.).
// VERIFIED — адреса, у которых WebSocket реально открылся при проверке в браузере пользователя 2026-10-14 (5 с): это проверка РУКОПОЖАТИЯ, а не гарантия работы и бесплатности.
// CANDIDATES — адреса из памяти, НЕ ПРОВЕРЕНО (в песочнице нет интернета): часть окажется мёртвой, список придётся периодически обновлять. Игра сама проверяет живость
// (по согласию, пачками по 8, таймаут 4 с), хранит результаты в localStorage, сначала берёт VERIFIED и лучших по задержке, остальных держит в резерве.
(function () {
  'use strict';
  const VERIFIED = [
    'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://offchain.pub', 'wss://nostr.mom', 'wss://relay.snort.social',
    'wss://purplepag.es', 'wss://nostr-pub.wellorder.net', 'wss://nostr.oxtr.dev'          // purplepag.es принимает не все типы событий — игра сама отбросит, если откажет
  ];
  const CANDIDATES = [
    'wss://relay.nostr.info', 'wss://relay.current.fyi', 'wss://relay.nostrich.de', 'wss://nostr.einundzwanzig.space', 'wss://relay.orangepill.dev', 'wss://nostr.bitcoiner.social',
    'wss://nostr.openordex.org', 'wss://relay.nostrgraph.net', 'wss://nostr.sathoarder.com', 'wss://soloco.nl', 'wss://relay.n057r.club', 'wss://relay.nostr.net',
    'wss://nostr-01.yakihonne.com', 'wss://relay.lexingtonbitcoin.org', 'wss://nostr.cercatrova.me', 'wss://relay.nostr.wirednet.jp', 'wss://relay.pleb.to',
    'wss://nostr.ra.pe', 'wss://relay.nostr.com.au', 'wss://nostr.stakey.net', 'wss://relay.nostrcheck.me', 'wss://relay.0xchat.com', 'wss://nostr.massmux.com',
    'wss://relay.exit.pub', 'wss://relay.verified-nostr.com', 'wss://nostr.fbxl.net', 'wss://nostr.plantroon.com', 'wss://relay.siamstr.com', 'wss://relay.utxo.one',
    'wss://nostr.vulpem.com', 'wss://nostr.milou.lol', 'wss://relay.wellorder.net', 'wss://nostr.sandwich.farm', 'wss://nostr.l00p.org', 'wss://nostr.thank.eu',
    'wss://relay.stoner.com', 'wss://relay.hodl.ar', 'wss://nostr.rocks', 'wss://nostr.fmt.wiz.biz', 'wss://relay.bitcoinpark.com', 'wss://nostr.hifish.org'
  ];
  // у пользователя НЕ открылись (2026-10-14): остаются в конце списка с низким приоритетом на случай, если заработают
  const LOW = ['wss://relay.nostr.bg', 'wss://relay.mostr.pub', 'wss://relay.nostr.band'];
  window.NexaServers = {
    VERSION: 3,
    // WebTorrent-трекеры (WebSocket, протокол announce). open.ftorrent.com открылся у пользователя, но бесплатность/условия не подтверждены — оставлен, отмечен.
    TRACKERS: ['wss://tracker.webtorrent.dev', 'wss://tracker.openwebtorrent.com', 'wss://open.ftorrent.com:443'],
    TRACKERS_VERIFIED: ['wss://tracker.webtorrent.dev', 'wss://tracker.openwebtorrent.com', 'wss://open.ftorrent.com:443'],
    // Не включены (у пользователя не открылся; у сервиса есть тарифы): tracker.files.fm — включайте сами через ?tracker=… или localStorage 'nexaTrackers'.
    TRACKERS_OPTIONAL: ['wss://tracker.files.fm:7073/announce'],
    NOSTR_VERIFIED: VERIFIED,
    NOSTR_CANDIDATES: CANDIDATES,
    NOSTR_LOW: LOW,
    // Nostr-релеи (NIP-01, эфемерные события kind 20000–29999, подпись BIP-340 одноразовым ключом сессии): сначала проверенные, затем кандидаты, затем неработавшие
    NOSTR_RELAYS: VERIFIED.concat(CANDIDATES, LOW),
    // Сомнительные по условиям (связаны с коммерческими сервисами) — по умолчанию выключены.
    NOSTR_OPTIONAL: ['wss://relay.keychat.io', 'wss://relay.coinos.io', 'wss://bitcoiner.social', 'wss://relay.mutinywallet.com', 'wss://nostr.mutinywallet.com'],
    LIVE_MAX: 6,            // одновременно живых соединений с серверами (остальные — в резерве)
    DEAD_MS: 180000,        // «мёртвый» сервер отдыхает столько (дальше — x2 при повторных сбоях, максимум 30 минут)
    KIND: 27777,            // эфемерный тип события Nostr
    KINDS: [27777, 22222, 25050, 20777]   // если релей отвергает kind — пробуем следующий из эфемерного диапазона 20000–29999, потом «только чтение»
  };
}());
