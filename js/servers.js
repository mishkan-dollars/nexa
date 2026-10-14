// NEXA: список публичных серверов сигналинга (js/rendezvous.js). Правьте ЗДЕСЬ — остальной код ничего не знает о конкретных адресах.
// Через них ходят только служебные SDP offer/answer; игра, чат и голос идут напрямую P2P. Ручной режим (коды) и режим «этот компьютер» от серверов не зависят.
// ТОЛЬКО открытые общественные серверы без аккаунтов, ключей и оплаты. Платные, по подписке, с whitelist, PoW, тарифами и квотами — НЕ добавлять
// (исключены сознательно: nostr.wine, relay.nostrplebs.com, eden.nostr.land, nostr.zebedee.cloud, relay.minds.com и др.).
// ВНИМАНИЕ: все адреса — НЕ ПРОВЕРЕНО ИЗ ПЕСОЧНИЦЫ, кандидаты из памяти (там нет интернета): часть окажется мёртвой, переехавшей или с ограничениями, список придётся
// периодически обновлять. Игра сама проверяет живость (по согласию, пачками по 8, таймаут 4 с), хранит результаты в localStorage, держит LIVE_MAX лучших по задержке,
// остальные — в резерве; отказавшие реле временно отключаются (relay с PoW/оплатой/AUTH отбрасывается сразу).
(function () {
  'use strict';
  window.NexaServers = {
    VERSION: 2,
    // WebTorrent-трекеры (WebSocket, протокол announce). По умолчанию — только эти, без тарифов и квот.
    TRACKERS: ['wss://tracker.webtorrent.dev', 'wss://tracker.openwebtorrent.com'],
    // Кандидаты, НЕ включённые по умолчанию (есть коммерческие сервисы/тарифы или нет подтверждения бесплатности): включайте сами через ?tracker=… или localStorage 'nexaTrackers'.
    TRACKERS_OPTIONAL: ['wss://tracker.files.fm:7073/announce', 'wss://open.ftorrent.com:443'],
    // Nostr-релеи (NIP-01, эфемерные события kind 20000–29999, подпись BIP-340 одноразовым ключом сессии). Кандидаты, не проверено.
    NOSTR_RELAYS: [
      'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://relay.nostr.band', 'wss://offchain.pub', 'wss://nostr.mom', 'wss://relay.snort.social',
      'wss://purplepag.es', 'wss://nostr.oxtr.dev', 'wss://nostr-pub.wellorder.net', 'wss://relay.nostr.bg', 'wss://relay.mostr.pub', 'wss://relay.nostr.info',
      'wss://relay.current.fyi', 'wss://relay.nostrich.de', 'wss://nostr.einundzwanzig.space', 'wss://relay.orangepill.dev', 'wss://nostr.bitcoiner.social',
      'wss://nostr.openordex.org', 'wss://relay.nostrgraph.net', 'wss://nostr.sathoarder.com', 'wss://soloco.nl', 'wss://relay.n057r.club', 'wss://relay.nostr.net',
      'wss://nostr-01.yakihonne.com', 'wss://relay.lexingtonbitcoin.org', 'wss://nostr.cercatrova.me', 'wss://relay.nostr.wirednet.jp', 'wss://relay.pleb.to',
      'wss://nostr.ra.pe', 'wss://relay.nostr.com.au', 'wss://nostr.stakey.net', 'wss://relay.nostrcheck.me', 'wss://relay.0xchat.com', 'wss://nostr.massmux.com',
      'wss://relay.exit.pub', 'wss://relay.verified-nostr.com', 'wss://nostr.fbxl.net', 'wss://nostr.plantroon.com', 'wss://relay.siamstr.com', 'wss://relay.utxo.one',
      'wss://nostr.vulpem.com', 'wss://nostr.milou.lol', 'wss://relay.wellorder.net', 'wss://nostr.sandwich.farm', 'wss://nostr.l00p.org', 'wss://nostr.thank.eu',
      'wss://relay.stoner.com', 'wss://relay.hodl.ar', 'wss://nostr.rocks', 'wss://nostr.fmt.wiz.biz', 'wss://relay.bitcoinpark.com', 'wss://nostr.hifish.org'
    ],
    // Сомнительные по условиям (связаны с коммерческими сервисами) — по умолчанию выключены.
    NOSTR_OPTIONAL: ['wss://relay.keychat.io', 'wss://relay.coinos.io', 'wss://bitcoiner.social', 'wss://relay.mutinywallet.com', 'wss://nostr.mutinywallet.com'],
    LIVE_MAX: 6,            // одновременно живых соединений с серверами (остальные — в резерве)
    DEAD_MS: 180000,        // «мёртвый» сервер отдыхает столько (дальше — x2 при повторных сбоях, максимум 30 минут)
    KIND: 27777             // эфемерный тип события Nostr
  };
}());
