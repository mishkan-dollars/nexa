// NEXA/OS: «ОНЛАЙН ЛОББИ» — отдельный экран (view 'ONLINE') в духе лобби Fortnite: главный игрок на платформе по центру, остальные игроки комнаты (до NexaNet.MAX_PLAYERS)
// на платформах сзади, пустые платформы тусклые; слева внизу режим + серая кнопка «МИССИЯ / ПЕСОЧНИЦА» и большая жёлтая «ИГРАТЬ», справа — уровень, внизу карусель карточек.
// Вкладки: PLAY / PUBLIC / PROFILE / CHAT / CONNECTION / TELEGRAM. Подключение: ссылка комнаты «в один клик» через серверы сигналинга (js/rendezvous.js), публичные комнаты,
// быстрая игра, приватная комната по имени, режим «этот компьютер» (вкладки одного браузера) и ЗАПАСНОЙ ручной обмен кодами (всегда доступен). Чат и голос — боковая панель.
// Эмоции (танцы EmoteCore) на платформах — у всех игроков, танец и музыка синхронизируются по сети (cev emote/emoteoff, как в coop.js). Нажатие на ник/аватар игрока открывает
// карточку его профиля (данные приходят по DataChannel). 3D-сцена: стикмены игры (Run.prototype.npc через THREE, лениво); без свечения и колец у игроков (кольца и свет — только
// у платформ). Лёгкий CSS-фолбэк без WebGL. Все тексты — английские исходники; переводы RU/DE — js/i18n-net.js. Данные из сети выводятся только через textContent.
(function () {
  'use strict';
  const NN = window.NexaNet, PF = window.NexaProfile, RM = window.NexaRoom;
  if (!NN || !PF) return;
  const TG = NN.TELEGRAM, MAXP = NN.MAX_PLAYERS;
  const ctx = { audio: null, setView: null, render: null, startCoop: null };
  const L = { ff: true, ffm: 1, tab: 'play', mode: 'sandbox', mission: 1, ready: false, readyMap: {}, readyList: [], cd: 0, cdT: 0, cdSpec: null, unread: 0, t0: 0, pick: false, notes: {}, joinFromUrl: false, lastStats: 0, copied: 0,
    pubSession: false, joinUi: null, roomLink: '', dances: {}, cards: {}, srvSeen: false };
  const QM = { on: false, host: false, t0: 0, state: '', findT: 0 };
  const TRADES_ENABLED = true;
  const TRD = { sent: {}, seen: new Set(), hseen: new Set(), route: {} };
  const VAULT = window.Toys && Toys.vault ? Toys.vault() : null;
  const SIG = { key: {}, mine: '', led: {} };
  const sg = (k, parts) => (k && window.Toys && Toys.sha ? Toys.sha(k + '|' + parts.join('|')).slice(0, 20) : '');
  const sgOk = (k, parts, v) => !!k && typeof v === 'string' && v.length === 20 && sg(k, parts) === v;
  const tOk = (t) => Number.isFinite(t) && Math.abs(Date.now() - t) < 300000;
  function ledgerOk(src, amt, bal) {
    const now = Date.now(), e = SIG.led[src] || (SIG.led[src] = { bal: -1, t: now, recv: 0, ts: [], sum: [] });
    e.ts = e.ts.filter((t) => now - t < 60000); e.sum = e.sum.filter((x) => now - x[0] < 3600000);
    if (e.ts.length >= 3) return false;
    if (e.sum.reduce((a, x) => a + x[1], 0) + amt > 100000) return false;
    if (!Number.isInteger(bal) || bal < 0 || bal > 1e9) return false;
    if (e.bal >= 0 && bal + amt > e.bal + e.recv + 2000 + Math.ceil((now - e.t) / 3600000 * 1000)) return false;
    e.ts.push(now); e.sum.push([now, amt]); e.bal = bal; e.recv = 0; e.t = now;
    return true;
  }
  let root = null, tickT = 0;
  const $ = (s) => (root ? root.querySelector(s) : null);
  const $$ = (s) => (root ? Array.from(root.querySelectorAll(s)) : []);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isTouch = () => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };
  const sfx = (k) => { try { ctx.audio && ctx.audio.playSfx(k); } catch (e) { /* звук не критичен */ } };
  const missionsMap = () => (window.Missions && Missions._core && Missions._core.MISSIONS) || {};
  const missionTitle = (id) => { const m = missionsMap()[id]; return m && m.title ? m.title : 'MISSION'; };
  const validMission = (id) => { id = id | 0; return id >= 1 && id <= 48 && !!missionsMap()[id]; };
  const mySlot = () => (NN.connected ? NN.slot || 1 : 1);
  // список игроков для платформ: [я, остальные по слотам]
  function party() {
    const p = PF.get(), lv = PF.level();
    const me = { slot: mySlot(), name: p.name, color: p.color, level: lv.level, me: true, pid: NN.PID };
    return [me].concat(NN.connected ? NN.players : []);
  }
  const isHostSide = () => !NN.connected || NN.isHost;

  // ------------------------------------------------------------------ разметка
  const IC = {
    back: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm8 4.5l-1.8.6a6.8 6.8 0 01-.7 1.6l.9 1.7-2 2-1.7-.9a6.8 6.8 0 01-1.6.7L12.5 21h-2.8l-.6-1.8a6.8 6.8 0 01-1.6-.7l-1.7.9-2-2 .9-1.7a6.8 6.8 0 01-.7-1.6L2 13v-2.8l1.8-.6a6.8 6.8 0 01.7-1.6l-.9-1.7 2-2 1.7.9a6.8 6.8 0 011.6-.7L9.5 2h2.8l.6 1.8a6.8 6.8 0 011.6.7l1.7-.9 2 2-.9 1.7a6.8 6.8 0 01.7 1.6L20 10.2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    mic: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    tg: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M21 4L3 11l5.5 2L10 19l3-3.5 5 3.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 13L17 7.5" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
    modes: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 8h16M4 16h16M8 4v16M16 4v16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    emo: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="5" r="2.4" fill="currentColor"/><path d="M12 8v6M12 10l-5-2M12 10l5 2M12 14l-3 7M12 14l3 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    // серьёзная стойка: прямо, руки скрещены на груди (светлее тела, чтобы читались), голова чуть вверх; у остальных руки сзади/вдоль тела
    fig: '<svg viewBox="0 0 80 160" aria-hidden="true"><circle cx="40" cy="15" r="10.5" stroke-width="2"/><path d="M40 35v46M35 82l-2 63M45 82l2 63" fill="none" stroke-width="11"/><path d="M31 41l-7 20 24-8M49 41l7 20-24-8" fill="none" stroke="#2a2d34" stroke-width="7"/></svg>',
    fig2: '<svg viewBox="0 0 80 160" aria-hidden="true"><circle cx="40" cy="15" r="10.5" stroke-width="2"/><path d="M40 35v46M35 82l-2 63M45 82l2 63" fill="none" stroke-width="11"/><path d="M30 41l-3 28M50 41l3 28" fill="none" stroke="#2a2d34" stroke-width="7"/></svg>'
  };
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const COLOR_NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Purple', 'White'];

  function srvHTML(id) {
    return '<section class="ol-srv" data-srv="' + id + '"><div class="srv-h"><h3>SIGNALING SERVERS</h3><b class="srv-count"></b></div>' +
      '<p class="cn-priv">Public servers only pass the short connection messages. The game, chat and voice go directly between players. Without servers the manual codes below always work.</p>' +
      '<div class="srv-row"><label class="cn-lan"><input type="checkbox" class="srv-on"><span>USE SIGNALING SERVERS (off = manual mode only)</span></label>' +
        '<button type="button" class="ol-btn" data-act="srv-probe">CHECK SERVERS</button></div>' +
      '<ul class="srv-list" role="list"></ul></section>';
  }

  function shell() {
    const tabs = [['play', 'PLAY'], ['public', 'PUBLIC'], ['trade', 'TRADES'], ['social', 'SOCIAL'], ['profile', 'PROFILE'], ['connect', 'CONNECTION'], ['rules', 'RULES']].filter((x) => TRADES_ENABLED || x[0] !== 'trade');
    return '<div class="ol" id="ol" data-i18n="net" data-tab="play" data-state="idle">' +
      '<div class="ol-bg" aria-hidden="true"><i class="ol-moon"></i><i class="ol-haze"></i></div>' +
      '<div class="ol-stage" id="ol-stage"><div class="ol-floor"></div>' +
        range(MAXP).map((i) => '<div class="ol-plat p' + i + '"><i></i></div>').join('') +
        range(MAXP).map((i) => '<div class="ol-fig f' + i + '" hidden>' + (i ? IC.fig2 : IC.fig) + '</div>').join('') +
        range(MAXP).map((i) => '<div class="ol-tag t' + i + '" hidden data-act="card" data-slot=""><span class="tg-a" translate="no"></span><span class="tg-l" translate="no"></span><span class="tg-n" translate="no"></span><span class="tg-s"></span></div>').join('') +
        '<button type="button" class="ol-invite" data-act="tab" data-v="connect" hidden><b>+</b><span>INVITE A FRIEND</span></button>' +
      '</div>' +
      '<header class="ol-top">' +
        '<button type="button" class="ol-ic" data-action="menu" aria-label="Back to NEXA/OS" title="Back to NEXA/OS">' + IC.back + '</button>' +
        '<nav class="ol-tabs" role="tablist">' + tabs.map((t) => '<button type="button" role="tab" class="ol-tab' + (t[0] === 'play' ? ' on' : '') + '" data-act="tab" data-v="' + t[0] + '" aria-selected="' + (t[0] === 'play') + '">' + t[1] + (t[0] === 'chat' ? '<i class="ol-dot" hidden></i>' : '') + '</button>').join('') +
          '<a class="ol-tab ol-tg" href="' + TG + '" target="_blank" rel="noopener noreferrer">' + IC.tg + '<span>TELEGRAM</span></a></nav>' +
        '<span class="ol-kp" id="ol-kp" title="KP"><small>KP</small><b translate="no">0</b></span>' +
        '<span class="ol-me"><span class="ol-mea"></span><span class="ol-men" translate="no"></span><span class="ol-mel"><small>LVL</small> <b translate="no"></b></span></span>' +
        '<button type="button" class="ol-ic" data-act="settings" aria-label="Settings" title="Settings">' + IC.gear + '</button>' +
      '</header>' +
      '<main class="ol-main">' + paneHTML() + '</main>' +
      '<div class="ol-cd" id="ol-cd" hidden><div><small>THE MATCH STARTS IN</small><b translate="no">3</b></div></div>' +
      '<div class="rl-bar" id="rl-bar"><span>AS IS, P2P: ROOM MEMBERS MAY SEE YOUR IP; YOUR BALANCE IS STORED IN YOUR BROWSER.</span> <button type="button" data-act="rules-open">DISCLAIMER · DETAILS</button></div>' +
      '<div class="ol-toast" id="ol-toast" role="status" aria-live="polite"></div>' +
      '<div class="ol-modal" id="ol-pick" hidden role="dialog" aria-modal="true" aria-label="Choose a mode"></div>' +
      '<div class="ol-modal" id="ol-card" hidden role="dialog" aria-modal="true" aria-label="Player profile"></div>' +
      '<div class="ol-modal" id="ol-trade" hidden role="dialog" aria-modal="true" aria-label="Send KP"></div>' +
      '<div class="ol-modal" id="ol-emo" hidden role="dialog" aria-modal="true" aria-label="Emotes"></div>' +
      '<div class="ol-modal" id="ol-consent" hidden role="dialog" aria-modal="true" aria-label="Public play"></div>' +
      '<div class="ol-modal" id="ol-pubnew" hidden role="dialog" aria-modal="true" aria-label="Create a public room"></div>' +
      '<div class="ol-modal" id="ol-join" hidden role="dialog" aria-modal="true" aria-label="Connecting"></div>' +
    '</div>';
  }

  function paneHTML() {
    return '' +
    // -------- PLAY: левая нижняя панель, уровень, карточка соединения, карусель
    '<section class="ol-pane" data-pane="play">' +
      '<button type="button" class="ol-chatbtn" data-act="chat-toggle" id="ol-chatbtn"><span>CHAT</span><i class="ol-dot" hidden></i><b aria-hidden="true">⌄</b></button>' +
      '<div class="ol-bl"><h2 id="bl-mode">CO-OP SANDBOX</h2>' +
        '<button type="button" class="ol-grey" data-act="pick" id="bl-pick"><span class="g-i">' + IC.modes + '</span><span class="g-t"><b>MISSION / SANDBOX WITH A FRIEND</b><small id="bl-sub"></small></span></button>' +
        '<button type="button" class="ol-play" data-act="play" id="bl-play"><span id="bl-play-t">PLAY</span></button>' +
        '<p class="ol-hint" id="bl-hint"></p></div>' +
      '<div class="ol-br"><button type="button" class="ol-emob" data-act="emotes" id="ol-emob" title="B">' + IC.emo + '<span id="ol-emob-t">EMOTES</span></button>' +
        '<div class="ol-lvl" id="ol-lvl"><i></i><span><small>LVL</small><b translate="no">1</b></span></div><div class="ol-badge" id="ol-badge" title="Rank"><b translate="no">S</b><small>SUBJECT</small></div></div>' +
    '</section>' +
    // -------- чат + голос (одна панель: справа на PLAY, на всю вкладку на CHAT)
    '<aside class="ol-comm" id="ol-comm"><div class="ol-voice" id="ol-voice">' +
        '<div class="v-row"><button type="button" class="ol-btn v-mic" data-act="mic" id="v-mic">' + IC.mic + '<span id="v-mic-t">TURN MICROPHONE ON</span></button>' +
        '<label class="v-vol"><span>FRIEND VOLUME</span><input type="range" min="0" max="100" value="100" id="v-vol" aria-label="Friend volume"></label>' +
        '<label class="cn-lan"><input type="checkbox" id="v-in" checked><span>HEAR OTHER PLAYERS\' VOICE</span></label></div>' +
        '<div class="v-ind"><span class="v-who" id="v-me"><i></i><em>YOU</em></span><span class="v-who" id="v-peer"><i></i><em>FRIEND</em></span></div>' +
        '<p class="v-note" id="v-note"></p></div>' +
      '<div class="ol-roster" id="ol-roster"></div>' +
      '<div class="ol-chat"><div class="ol-log" id="ol-log" role="log" aria-live="polite"></div>' +
        '<form class="ol-send" id="ol-send" autocomplete="off"><input type="text" id="ol-msg" maxlength="200" placeholder="Type a message…" aria-label="Chat message" enterkeyhint="send"><button type="submit" class="ol-btn">SEND</button></form>' +
        '<p class="v-note" id="ol-chat-note"></p>' +
        '<a class="ol-tglink" href="' + TG + '" target="_blank" rel="noopener noreferrer">' + IC.tg + '<span>OFFICIAL TELEGRAM CHANNEL</span></a></div></aside>' +
    // -------- PUBLIC: публичные комнаты, быстрая игра, приватная комната по имени
    '<section class="ol-pane ol-sheet" data-pane="public"><div class="sh-in">' +
      '<div class="pb-top"><h3>PUBLIC ROOMS</h3><div class="pf-btns"><button type="button" class="ol-btn" data-act="pub-refresh">REFRESH</button>' +
        '<button type="button" class="ol-btn big" data-act="quick" id="pb-quick">QUICK PLAY</button><button type="button" class="ol-btn" data-act="pub-new">CREATE A PUBLIC ROOM</button></div></div>' +
      '<p class="v-note" id="pub-note"></p>' +
      '<div class="pb-list" id="pub-list" role="list"></div>' +
      '<div class="pb-priv"><h3>PRIVATE ROOM BY NAME</h3><div class="pf-nm"><input type="text" id="pr-name" maxlength="24" spellcheck="false" autocomplete="off" aria-label="Room name" placeholder="room-name"><button type="button" class="ol-btn" data-act="pr-create">CREATE</button><button type="button" class="ol-btn" data-act="pr-join">JOIN</button></div>' +
        '<p class="cn-priv">Anyone who knows the room name can join — pick a long, unusual name and share it only with friends.</p><p class="v-note" id="pr-note"></p></div>' +
      srvHTML('pub') +
      '<p class="cn-priv">Strangers in public rooms and the signaling servers can technically see your network address (WebRTC); a VPN hides it. Public chat is not moderated: you can mute or report any player.</p>' +
    '</div></section>' +
    // -------- TRADES: передача KP игрокам комнаты
    '<section class="ol-pane ol-sheet" data-pane="trade"><div class="sh-in">' +
      '<div class="pb-top"><h3>TRADES</h3><div class="tr-bal"><small>YOUR BALANCE</small><b id="tr-bal" translate="no">0</b><em>KP</em></div></div>' +
      '<p class="cn-priv">You can send KP only to players who are in your room right now. Every transfer is confirmed first; the host checks it and a duplicate or negative amount is rejected.</p>' +
      '<p class="v-note" id="tr-note"></p><input id="tr-msg" type="text" maxlength="80" autocomplete="off" spellcheck="false" aria-label="Message"><div class="pb-list" id="tr-list" role="list"></div>' +
    '</div></section>' +
    // -------- SOCIAL: друзья, чат, рейтинг, кланы (js/social.js)
    '<section class="ol-pane ol-sheet" data-pane="social"><div class="sh-in"><div class="sc-root" id="sc-root"></div></div></section>' +
    // -------- PROFILE
    '<section class="ol-pane ol-sheet" data-pane="profile"><div class="sh-in">' +
      '<div class="pf-head"><span id="pf-av"></span><div class="pf-id"><label for="pf-name">NICKNAME</label><div class="pf-nm"><input type="text" id="pf-name" maxlength="16" spellcheck="false" autocomplete="off" aria-label="Nickname"><button type="button" class="ol-btn" data-act="name">SAVE</button></div><p class="v-note" id="pf-note"></p></div>' +
        '<div class="pf-lv"><div class="pf-lvl"><small>LVL</small><b id="pf-lv" translate="no">1</b></div><div class="pf-xp"><span id="pf-rank">SUBJECT</span><div class="pf-bar"><i id="pf-bari"></i></div><em translate="no" id="pf-xpt"></em></div></div></div>' +
      '<div class="av-box-c" id="pf-avc"></div>' +
      '<div class="pf-sw" id="pf-sw" role="group" aria-label="Color">' + PF.COLORS.map((c, i) => '<button type="button" class="pf-c" data-act="color" data-v="' + c + '" style="--c:' + c + '" aria-label="' + COLOR_NAMES[i] + '" title="' + COLOR_NAMES[i] + '"></button>').join('') + '</div>' +
      '<div id="ol-stats"></div>' +
      '<div class="pf-btns"><button type="button" class="ol-btn danger" data-act="pf-reset" id="pf-reset">RESET STATS</button></div>' +
    '</div></section>' +
    // -------- CONNECTION
    '<section class="ol-pane ol-sheet" data-pane="rules"><div class="sh-in" id="rl-pane"></div></section>' +
    '<section class="ol-pane ol-sheet" data-pane="connect"><div class="sh-in">' +
      '<ol class="cn-steps" id="cn-steps"><li>INVITE</li><li>ANSWER</li><li>LINK</li><li>PLAY</li></ol>' +
      '<div class="cn-bar"><b id="cn-state">NOT CONNECTED</b><span id="cn-time" translate="no"></span><button type="button" class="ol-btn danger" data-act="disconnect" id="cn-dis" hidden>DISCONNECT</button><button type="button" class="ol-btn" data-act="net-report" id="cn-rep">COPY NETWORK REPORT</button></div>' +
      '<article class="cn-card cn-room" id="cn-room"><h3>ONE-CLICK INVITE LINK</h3><p class="cn-p">Create a room and send the link. Your friend opens it and connects automatically — no codes. Several friends can join one link (up to 6 players).</p>' +
        '<button type="button" class="ol-btn big" data-act="room-create" id="rm-create">CREATE ROOM LINK</button>' +
        '<div class="cn-out" id="rm-out" hidden><label for="rm-link">ROOM LINK</label><textarea id="rm-link" readonly rows="2" spellcheck="false"></textarea>' +
          '<div class="pf-btns"><button type="button" class="ol-btn" data-act="copy" data-v="rm-link">COPY LINK</button><button type="button" class="ol-btn danger" data-act="room-close">CLOSE ROOM</button></div>' +
          '<p class="v-note" id="rm-status"></p></div><p class="v-note" id="rm-note"></p></article>' +
      srvHTML('cn') +
      '<article class="cn-card cn-local" id="cn-local"><h3>THIS COMPUTER</h3><p class="cn-p">Two tabs or windows of the same browser (not private windows): no codes, no internet, no servers. Open the room in one tab, join it in the other.</p>' +
        '<div class="pf-btns"><button type="button" class="ol-btn" data-act="local-host" id="lc-host">OPEN A ROOM HERE</button><button type="button" class="ol-btn" data-act="local-join" id="lc-join">JOIN A ROOM HERE</button></div><p class="v-note" id="lc-note"></p></article>' +
      '<details class="cn-manual" open><summary>MANUAL CONNECTION (works without servers)</summary>' +
      '<p class="cn-priv" id="cn-hint">Do all steps within 1–2 minutes: every code is single-use. If it does not connect, press TRY AGAIN and start over with a new invitation.</p>' +
      '<div class="cn-cols">' +
        '<article class="cn-card" id="cn-host"><h3>HOST</h3><p class="cn-p">You are player 1. Create an invitation and send the link to your friend.</p>' +
          '<button type="button" class="ol-btn big" data-act="host-create" id="h-create">CREATE INVITATION</button>' +
          '<div class="cn-out" id="h-out" hidden><label for="h-link">INVITATION LINK</label><textarea id="h-link" readonly rows="3" spellcheck="false"></textarea>' +
            '<div class="pf-btns"><button type="button" class="ol-btn" data-act="copy" data-v="h-link">COPY LINK</button><button type="button" class="ol-btn" data-act="copy-code">COPY CODE ONLY</button></div></div>' +
          '<label for="h-ans">PASTE YOUR FRIEND\'S ANSWER CODE</label><textarea id="h-ans" rows="3" spellcheck="false" placeholder="NX1A.…"></textarea>' +
          '<button type="button" class="ol-btn big" data-act="host-connect" id="h-connect">CONNECT</button><p class="v-note" id="h-note"></p></article>' +
        '<article class="cn-card" id="cn-guest"><h3>FRIEND</h3><p class="cn-p">You are player 2. Paste the host\'s link or code, then send the answer code back.</p>' +
          '<label for="g-in">PASTE THE HOST\'S LINK OR CODE</label><textarea id="g-in" rows="3" spellcheck="false" placeholder="…?join=NX1O.…"></textarea>' +
          '<button type="button" class="ol-btn big" data-act="guest-answer" id="g-answer">CREATE ANSWER</button>' +
          '<div class="cn-out" id="g-out" hidden><label for="g-code">YOUR ANSWER CODE — SEND IT TO THE HOST</label><textarea id="g-code" readonly rows="3" spellcheck="false"></textarea>' +
            '<div class="pf-btns"><button type="button" class="ol-btn" data-act="copy" data-v="g-code">COPY CODE</button></div></div><p class="v-note" id="g-note"></p></article>' +
      '</div>' +
      '<p class="v-note" id="cn-nat" hidden></p>' +
      '<div class="cn-diag" id="cn-diag" hidden><p class="v-note bad" id="cn-diag-t"></p><p class="v-note" id="cn-diag-c" translate="no"></p><button type="button" class="ol-btn big" data-act="manual-retry">TRY AGAIN</button></div>' +
      '</details>' +
      '<div class="cn-foot"><label class="cn-lan"><input type="checkbox" id="cn-lan"><span>SAME WI-FI / LAN MODE (less private, helps when both of you are on one network)</span></label>' +
        '<p class="cn-priv" id="cn-priv">Your IP address is never shown in the game. With a direct P2P link your friend\'s browser can technically see your network address (a WebRTC property); a VPN hides it.</p>' +
        '<p class="cn-priv">The invitation code carries your connection data in encoded form — send it only to your friend. On itch.io the game frame needs allow="microphone" for voice chat.</p></div>' +
    '</div></section>';
  }

  // ------------------------------------------------------------------ состояние -> интерфейс
  function updTop() {
    const p = PF.get(), lv = PF.level();
    const me = $('.ol-me'); if (!me) return;
    $('.ol-mea').innerHTML = PF.avatar(p.name, p.color, 26, NN.PID);
    $('.ol-men').textContent = p.name;
    $('.ol-mel b').textContent = lv.level;
    const lvl = $('#ol-lvl');
    if (lvl) { lvl.querySelector('b').textContent = lv.level; lvl.style.setProperty('--p', Math.round(lv.pct * 360) + 'deg'); }
    const bd = $('#ol-badge'); if (bd) { bd.querySelector('b').textContent = lv.rank.charAt(0); bd.querySelector('small').textContent = lv.rank; }
    updKP();
  }
  const kp = () => { try { return window.Toys ? Toys.credits | 0 : 0; } catch (e) { return 0; } };
  document.addEventListener('nexacredits', () => { try { updKP(); } catch (e) { /* ok */ } });
  function updKP() {
    const e = $('#ol-kp b'); if (e) e.textContent = String(kp());
    const b = $('#tr-bal'); if (b) b.textContent = String(kp());
  }
  function modeText() {
    if (L.mode === 'hl') return ['HIGH / LOW', '', ''];
    if (L.mode === 'pvp') return ['PVP', '', ''];
    if (L.mode === 'ffa') return ['FREE FOR ALL', '', ''];
    if (L.mode === 'mission' && validMission(L.mission)) return ['MISSION', String(L.mission).padStart(2, '0'), missionTitle(L.mission)];
    return ['SANDBOX', '', ''];
  }
  const guestsReady = () => { const g = NN.players; return g.length > 0 && g.every((q) => !!L.readyMap[q.slot]); };
  function updPlay() {
    if (!root) return;
    const host = isHostSide(), mt = modeText();
    const sub = $('#bl-sub');
    if (L.mode === 'pvp' || L.mode === 'ffa') sub.innerHTML = pvpSub(); else if (L.mode === 'hl') sub.innerHTML = '<span>HIGH / LOW</span> — <span>2–6 PLAYERS</span>'; else sub.innerHTML = mt[1] ? '<span>MISSION</span> <b translate="no">' + mt[1] + '</b> — <span translate="no">' + esc(mt[2]) + '</span>' : '<span>SANDBOX</span> — <span>WAVES OF ENEMIES</span>';
    if (L.mode !== 'ffa' && L.mode !== 'hl' && L.mode !== 'pvp') sub.innerHTML += ' — <span>' + (L.ff ? 'FF: ON' : 'FF: OFF') + '</span>' + (L.ff && L.ffm < 1 ? ' ' + Math.round(L.ffm * 100) + '%' : '');
    $('#bl-mode').textContent = L.mode === 'pvp' ? 'PVP' : L.mode === 'hl' ? 'HIGH / LOW' : L.mode === 'ffa' ? 'FREE FOR ALL' : mt[1] ? 'CO-OP MISSION' : 'CO-OP SANDBOX';
    $('#bl-pick').disabled = !host;
    const btn = $('#bl-play'), tx = $('#bl-play-t'), hint = $('#bl-hint');
    root.dataset.cd = L.cd ? '1' : '0';
    let label = 'PLAY', dis = false, hn = '';
    if (L.cd) { label = 'STARTING…'; dis = true; }
    else if (L.mode === 'ffa' && (QM.on || !inRoom())) { const n = NN.connected ? NN.count : 1; label = QM.on ? (QM.host && n >= 2 ? 'START NOW' : 'CANCEL') : 'READY'; dis = !isHostSide() && NN.connected && !QM.on; hn = dis ? 'THE MATCH STARTS WHEN THE HOST BEGINS' : QM.on ? (QM.host ? 'WAITING FOR PLAYERS — START NOW WITH 2 OR MORE' : 'SEARCHING FOR PLAYERS') : 'PRESS READY TO FIND A MATCH'; }
    else if (!NN.connected) { label = 'PLAY'; hn = 'SOLO — OPEN CONNECTION TO PLAY WITH A FRIEND'; }
    else if (NN.isHost) { if (!NN.players.length) { hn = 'SOLO — OPEN CONNECTION TO PLAY WITH A FRIEND'; } else if (!guestsReady()) { dis = true; hn = NN.players.length > 1 ? 'WAITING FOR ALL PLAYERS TO PRESS READY' : 'WAITING FOR YOUR FRIEND TO PRESS READY'; } else hn = NN.players.length > 1 ? 'ALL PLAYERS ARE READY' : 'YOUR FRIEND IS READY'; }
    else { label = L.ready ? 'CANCEL' : 'READY'; hn = L.ready ? 'WAITING FOR THE HOST TO START' : 'PRESS READY WHEN YOU ARE SET'; }
    if ((L.mode === 'pvp' || (L.mode === 'ffa' && inRoom() && !QM.on)) && !L.cd && isHostSide()) { const n = NN.connected ? NN.players.length + 1 : 1; if (n < 2 || (curCfg().kind === 'duel' && n !== 2)) { dis = true; hn = n < 2 ? 'PVP NEEDS 2–6 PLAYERS — OPEN CONNECTION' : 'DUEL NEEDS EXACTLY 2 PLAYERS'; } }
    voteUi(hint);
    tx.textContent = label; btn.disabled = dis; btn.classList.toggle('is-ready', !NN.isHost && NN.connected && L.ready);
    hint.textContent = hn;
    updStage();
  }
  const STATE_TXT = {
    idle: 'NOT CONNECTED', creating: 'CREATING INVITATION…', 'waiting-answer': 'WAITING FOR THE FRIEND\'S ANSWER', answering: 'ANSWER READY — SEND IT TO THE HOST',
    connecting: 'CONNECTING…', open: 'CONNECTED', lost: 'CONNECTION UNSTABLE…', closed: 'DISCONNECTED', failed: 'CONNECTION FAILED'
  };
  function updStatus() {
    if (!root) return;
    const st = NN.state;
    root.dataset.state = st;
    $('#cn-state').textContent = STATE_TXT[st] || STATE_TXT.idle;
    const open = NN.connected;
    $('#cn-dis').hidden = !(open || st === 'waiting-answer' || st === 'answering' || st === 'connecting' || st === 'creating');
    const idx = { idle: 0, creating: 0, 'waiting-answer': 1, answering: 1, connecting: 2, open: 3, lost: 3, closed: 0, failed: 0 }[st] || 0;
    $$('#cn-steps li').forEach((li, i) => { li.classList.toggle('done', i < idx); li.classList.toggle('on', i === idx); });
    root.classList.toggle('is-open', open);
    const full = open && NN.count >= MAXP;
    $('#h-create').disabled = (open && !NN.isHost) || full;
    $('#h-create').textContent = NN.offerCode && NN.role === 'host' ? 'CREATE NEW INVITATION' : (open && NN.isHost ? 'INVITE ANOTHER PLAYER' : 'CREATE INVITATION');
    $('#h-connect').disabled = !(NN.role === 'host' && NN.pending && NN.offerCode && st !== 'idle');
    $('#g-answer').disabled = open;
    $('#rm-create').disabled = (open && !NN.isHost) || full;
    $('#cn-lan').checked = NN.lan;
    if (open) { const d = $('#cn-diag'); if (d) d.hidden = true; }
    updTimer(); updRoster(); updRoom();
  }
  function fmtTime(s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function updTimer() {
    if (!root) return;
    const el = $('#cn-time'); if (!el) return;
    const st = NN.state;
    if (st === 'open' || st === 'lost') { const s = NN.stats(); const ls = NN.linkStats ? NN.linkStats() : null, dg = ls ? ls.links[0] : null; if (ls) el.title = ls.links.map((l) => '#' + l.slot + ' ' + l.path + '/' + l.ct + ' min/avg/p95/max ' + l.min + '/' + l.avg + '/' + l.p95 + '/' + l.max + ' ms').join('\n') + '\ndropBuf ' + ls.dropBuf; el.textContent = fmtTime(s.up) + (s.rtt ? '  ·  ' + (NN.pingText ? NN.pingText() : s.rtt + ' ms') : '') + (dg && dg.path ? '  ·  ' + (window.I18N ? I18N.t(dg.path === 'relay' ? 'VIA RELAY' : 'DIRECT PATH') : dg.path) : ''); }
    else if (L.t0 && (st === 'creating' || st === 'waiting-answer' || st === 'answering' || st === 'connecting')) el.textContent = fmtTime(Math.floor((Date.now() - L.t0) / 1000));
    else el.textContent = '';
  }
  function note(id, code, kind) {
    const el = $('#' + id); if (!el) return;
    el.className = 'v-note' + (kind ? ' ' + kind : '');
    el.textContent = code ? NN.text(code) : '';
  }
  function noteSet(el, texts, cls) {
    el.className = 'v-note' + (cls ? ' ' + cls : ''); el.textContent = '';
    texts.forEach((t, i) => { const s = document.createElement('span'); s.textContent = t; el.appendChild(s); if (i < texts.length - 1) el.appendChild(document.createTextNode(' ')); });
  }
  function toast(text, kind) {
    const el = $('#ol-toast'); if (!el) return;
    const d = document.createElement('div'); d.className = 'tt' + (kind ? ' ' + kind : ''); d.textContent = text;
    el.appendChild(d);
    while (el.children.length > 3) el.removeChild(el.firstChild);
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 500); }, 3600);
  }

  // ------------------------------------------------------------------ диагностика ручного соединения: счётчики кандидатов (без адресов) и причина
  function candPlain(d) {
    const el = $('#cn-diag-c'); if (!el) return;
    el.textContent = '';
    const parts = [['YOU', d.local], ['FRIEND', d.remote]];
    parts.forEach((p) => {
      const s = document.createElement('span'); s.className = 'cd-g';
      const t = document.createElement('em'); t.textContent = p[0]; s.appendChild(t);
      [['LOCAL ADDR.', p[1].host], ['MDNS', p[1].mdns], ['PUBLIC ADDR.', p[1].srflx], ['RELAY', p[1].relay]].forEach((c) => { const k = document.createElement('span'); k.textContent = c[0]; const n = document.createElement('b'); n.textContent = String(c[1]); s.appendChild(k); s.appendChild(n); });
      el.appendChild(s);
    });
  }
  function showDiag(code) {
    const box = $('#cn-diag'); if (!box) return;
    const d = NN.diag(); if (!d) return;
    box.hidden = false;
    const none = d.local.srflx + d.remote.srflx === 0;
    const t = $('#cn-diag-t');
    t.textContent = '';
    const main = document.createElement('span'); main.textContent = NN.text(code || 'CONNECT_TIMEOUT'); t.appendChild(main);
    const why = document.createElement('span');
    if (NN.natType === 'symmetric' || NN.natType === 'blocked') { const nt = document.createElement('span'); nt.textContent = ' ' + NN.text(NN.natBoth ? 'NAT_BOTH' : NN.natType === 'symmetric' ? 'NAT_SYM' : 'NAT_BLOCKED'); t.appendChild(nt); }
    why.textContent = ' ' + NN.text(d.local.mdns + d.remote.mdns > 0 && none ? 'DIAG_MDNS' : (none ? 'DIAG_NO_STUN' : (d.local.srflx === 0 || d.remote.srflx === 0 ? 'DIAG_ONE_SIDE' : 'DIAG_NAT')));
    t.appendChild(why);
    candPlain(d);
  }

  // ------------------------------------------------------------------ чат
  const SYS = { FRIEND_JOINED: '{0} joined the party', HOST_READY: 'Connected to host {0}', FRIEND_LEFT: '{0} left the party' };
  function lineEl(m) {
    const d = document.createElement('div');
    if (m.from === 'sys') { d.className = 'ol-msg sys'; d.textContent = (SYS[m.key] || m.key).replace('{0}', m.name); return d; }
    d.className = 'ol-msg ' + m.from;
    const b = document.createElement('b'); b.setAttribute('translate', 'no'); b.textContent = m.name; if (m.color) b.style.color = m.color;
    const s = document.createElement('span'); s.setAttribute('translate', 'no'); s.textContent = m.text;
    d.appendChild(b); d.appendChild(s);
    return d;
  }
  function renderLog(full) {
    const log = $('#ol-log'); if (!log) return;
    const h = NN.chat.history;
    if (full || log.children.length > h.length) { log.textContent = ''; h.forEach((m) => log.appendChild(lineEl(m))); }
    else for (let i = log.children.length; i < h.length; i += 1) log.appendChild(lineEl(h[i]));
    log.scrollTop = log.scrollHeight;
  }
  const commVisible = () => root && L.tab === 'play' && root.classList.contains('chat-open');
  function chatToggle(on) {
    if (!root) return;
    const open = on === undefined ? !root.classList.contains('chat-open') : !!on;
    root.classList.toggle('chat-open', open);
    const b = $('#ol-chatbtn'); if (b) { b.classList.toggle('on', open); b.querySelector('b').textContent = open ? '⌃' : '⌄'; }
    if (open) { L.unread = 0; const dot = $('#ol-chatbtn .ol-dot'); if (dot) dot.hidden = true; const log = $('#ol-log'); if (log) log.scrollTop = log.scrollHeight; }
  }
  function onChat(m) {
    if (!root) return;
    renderLog(false);
    if (m.from === 'peer' && !commVisible()) { L.unread += 1; const dot = $('#ol-chatbtn .ol-dot'); if (dot) dot.hidden = false; }
    if (m.from === 'peer') sfx('notification');
  }

  // ------------------------------------------------------------------ голос
  function updVoice() {
    if (!root) return;
    const v = NN.voice.state, open = NN.connected;
    const b = $('#v-mic'), t = $('#v-mic-t');
    b.disabled = !open;
    b.classList.toggle('on', v.mic && !v.muted); b.classList.toggle('muted', v.mic && v.muted);
    t.textContent = !v.mic ? 'TURN MICROPHONE ON' : (v.muted ? 'MICROPHONE MUTED — TAP TO UNMUTE' : 'MICROPHONE ON — TAP TO MUTE');
    $('#v-me').classList.toggle('talk', !!v.speaking);
    $('#v-peer').classList.toggle('talk', !!v.peerSpeaking);
    $('#v-peer').classList.toggle('off', !v.hasRemote && !v.peerSpeaking);
    $('#v-me').classList.toggle('off', !v.mic || v.muted);
    const nt = $('#v-note');
    const code = v.err ? v.err : (v.blocked ? 'VOICE_BLOCKED' : (!open ? 'NOT_CONNECTED' : ''));
    nt.className = 'v-note' + (v.err ? ' bad' : ''); nt.textContent = code ? NN.text(code) : '';
  }

  // ------------------------------------------------------------------ список игроков (клик по нику/аватару — карточка профиля)
  function updRoster() {
    const box = $('#ol-roster'); if (!box) return;
    const list = party();
    box.textContent = '';
    if (list.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    const h = document.createElement('p'); h.className = 'ro-h'; h.textContent = 'PLAYERS'; box.appendChild(h);
    list.forEach((q) => {
      const row = document.createElement('div'); row.className = 'ro-row';
      const a = document.createElement('button'); a.type = 'button'; a.className = 'ro-p'; a.dataset.act = 'card'; a.dataset.slot = String(q.slot);
      const av = document.createElement('span'); av.innerHTML = PF.avatar(q.name, q.color, 24, q.pid);
      const nm = document.createElement('b'); nm.setAttribute('translate', 'no'); nm.textContent = (q.slot === 1 ? '♛ ' : '') + q.name;
      const lv = document.createElement('small'); lv.setAttribute('translate', 'no'); lv.textContent = String(q.level);
      a.appendChild(av); a.appendChild(nm); a.appendChild(lv); row.appendChild(a);
      if (!q.me) {
        const mu = document.createElement('button'); mu.type = 'button'; mu.className = 'ol-btn ro-b'; mu.dataset.act = 'mute'; mu.dataset.slot = String(q.slot);
        mu.textContent = NN.isMuted(q.slot) ? 'UNMUTE' : 'MUTE'; row.appendChild(mu);
      }
      box.appendChild(row);
    });
  }

  // ------------------------------------------------------------------ профиль (свой)
  function updProfile(force) {
    if (!root) return;
    const p = PF.get(), lv = PF.level();
    if (L.tab !== 'profile' && !force) return;
    const inp = $('#pf-name'); if (inp && document.activeElement !== inp) inp.value = p.name;
    $('#pf-av').innerHTML = PF.avatar(p.name, p.color, 64, NN.PID);
    if (window.NexaAvatar) NexaAvatar.mount($('#pf-avc'));
    $('#pf-lv').textContent = lv.level; $('#pf-rank').textContent = lv.rank;
    $('#pf-bari').style.width = Math.round(lv.pct * 100) + '%';
    $('#pf-xpt').textContent = lv.xp + ' / ' + lv.hi + ' XP';
    $$('.pf-c').forEach((c) => c.classList.toggle('on', c.dataset.v === p.color));
    $('#ol-stats').innerHTML = PF.renderStats();
  }

  // ------------------------------------------------------------------ профили других игроков по сети ('profile' / 'profile?')
  const PR = {};                               // pid -> {pf, t}
  const pidOf = (slot) => { const q = NN.players.find((x) => x.slot === slot); return q ? q.pid || ('s' + slot) : ''; };
  let pfSig = '';
  function sendProfile(to) {
    if (!NN.connected) return;
    let pf; try { pf = PF.shareable(); } catch (e) { return; }
    NN.sendAction({ type: 'profile', pf }, to ? { to } : undefined);
  }
  function profileTick(force) {
    if (!NN.connected) return;
    let sig = ''; try { sig = JSON.stringify(PF.shareable()); } catch (e) { return; }
    if (!force && sig === pfSig) return;
    pfSig = sig;
    if (NN.isHost) sendProfile(); else sendProfile(1);     // Хост — всем гостям, гость — Хосту (остальные берут по запросу)
  }
  function onProfile(p) {
    const pf = PF.cleanShared(p.pf); if (!pf) return;
    const k = pidOf(p.from); if (!k) return;
    PR[k] = { pf, t: Date.now() };
    if (L.cards.open === p.from) renderCard(p.from);
  }
  function onProfileReq(p) { sendProfile(p.from); }

  // ------------------------------------------------------------------ карточка профиля игрока
  function openCard(slot, extra) {
    const el = $('#ol-card'); if (!el) return;
    L.cards.open = slot; L.cards.extra = extra || null;
    renderCard(slot);
    el.hidden = false;
    if (!extra && slot !== mySlot()) { try { NN.sendAction({ type: 'profile?' }, { to: slot }); } catch (e) { /* ok */ } }
    const f = el.querySelector('[data-act="card-close"]'); if (f) try { f.focus({ preventScroll: true }); } catch (e) { /* ok */ }
  }
  function renderCard(slot) {
    const el = $('#ol-card'); if (!el) return;
    const ex = L.cards.extra, me = !ex && slot === mySlot();
    let q, pf = null;
    if (ex) { q = { name: ex.host, color: ex.col, level: ex.lv, slot: 0 }; pf = ex.pf || null; }
    else if (me) { q = party()[0]; pf = PF.shareable(); }
    else { q = NN.players.find((x) => x.slot === slot); if (q) { const c = PR[pidOf(slot)]; pf = c ? c.pf : null; } }
    if (!q) { el.hidden = true; return; }
    const box = document.createElement('div'); box.className = 'pk-box cd-box';
    const hd = document.createElement('div'); hd.className = 'pk-h';
    const t = document.createElement('div'); t.className = 'cd-id';
    const av = document.createElement('span'); av.innerHTML = PF.avatar(pf ? pf.name : q.name, pf ? pf.color : q.color, 54, me ? NN.PID : q.pid);
    const nm = document.createElement('div'); nm.className = 'cd-nm';
    const b = document.createElement('b'); b.setAttribute('translate', 'no'); b.textContent = pf ? pf.name : q.name;
    const lv = pf ? PF.levelOf(pf) : { level: q.level, rank: PF.rankOf(q.level) };
    const s = document.createElement('small'); s.innerHTML = '<span>LVL</span> <b translate="no">' + esc(lv.level) + '</b> · <span>' + esc(lv.rank) + '</span>';
    nm.appendChild(b); nm.appendChild(s); t.appendChild(av); t.appendChild(nm);
    const x = document.createElement('button'); x.type = 'button'; x.className = 'ol-ic'; x.dataset.act = 'card-close'; x.setAttribute('aria-label', 'Close'); x.textContent = '×';
    hd.appendChild(t); hd.appendChild(x); box.appendChild(hd);
    const body = document.createElement('div'); body.className = 'cd-body';
    if (pf) body.innerHTML = PF.renderStatsOf(pf);
    else { const p = document.createElement('p'); p.className = 'v-note'; p.textContent = ex ? 'FULL PROFILE LOADS WHEN YOU JOIN OR THE SWARM ANSWERS' : 'LOADING PROFILE…'; body.appendChild(p); }
    box.appendChild(body);
    const act = document.createElement('div'); act.className = 'pf-btns';
    if (!me && !ex) {
      const mu = document.createElement('button'); mu.type = 'button'; mu.className = 'ol-btn'; mu.dataset.act = 'mute'; mu.dataset.slot = String(slot); mu.textContent = NN.isMuted(slot) ? 'UNMUTE' : 'MUTE'; act.appendChild(mu);
      if (window.NexaAvatar && q.pid) { const ah = document.createElement('button'); ah.type = 'button'; ah.className = 'ol-btn'; ah.dataset.act = 'av-hide'; ah.dataset.slot = String(slot); ah.textContent = NexaAvatar.isHidden(q.pid) ? 'SHOW AVATAR' : 'HIDE AVATAR'; act.appendChild(ah); }
      const rp = document.createElement('button'); rp.type = 'button'; rp.className = 'ol-btn danger'; rp.dataset.act = 'report'; rp.dataset.slot = String(slot); rp.textContent = 'REPORT'; act.appendChild(rp);
      if (NN.isHost) { const kk = document.createElement('button'); kk.type = 'button'; kk.className = 'ol-btn danger'; kk.dataset.act = 'kick'; kk.dataset.slot = String(slot); kk.textContent = 'REMOVE FROM ROOM'; act.appendChild(kk); }
    }
    const cl = document.createElement('button'); cl.type = 'button'; cl.className = 'ol-btn'; cl.dataset.act = 'card-close'; cl.textContent = 'CLOSE'; act.appendChild(cl);
    box.appendChild(act);
    el.textContent = ''; el.appendChild(box);
  }
  function closeCard() { const el = $('#ol-card'); if (el) el.hidden = true; L.cards.open = null; L.cards.extra = null; }

  // ------------------------------------------------------------------ сцена: CSS-слой и подписи (платформы по кругу: я в центре впереди, остальные дугой сзади)
  const FB = [[50, 80, 26], [66, 63, 15], [34, 63, 15], [82, 55, 12], [18, 55, 12], [50, 51, 12]];   // CSS-фолбэк: центр платформы %, ширина %
  function updStage() {
    if (!root) return;
    const list = party(), open = NN.connected;
    const rdy = (q) => (q.me ? (NN.isHost ? true : L.ready) : (q.slot === 1 ? true : (NN.isHost ? !!L.readyMap[q.slot] : L.readyList.indexOf(q.slot) >= 0)));
    for (let d = 0; d < MAXP; d += 1) {
      const q = list[d], t = $('.ol-tag.t' + d), f = $('.ol-fig.f' + d);
      if (!q) { if (t) t.hidden = true; if (f) f.hidden = true; continue; }
      if (t) {
        t.hidden = false;
        t.dataset.slot = String(q.slot);
        { const ah = PF.avatar(q.name, q.color, 34, q.pid), ae = t.querySelector('.tg-a'); if (ae.dataset.h !== ah) { ae.dataset.h = ah; ae.innerHTML = ah; } }
        t.querySelector('.tg-l').textContent = q.level;
        t.querySelector('.tg-n').textContent = (q.slot === 1 && open ? '♛ ' : '') + q.name;
        let status, cls;
        if (!open) { status = 'OFFLINE'; cls = 's-off'; }
        else if (q.slot === 1) { status = 'HOST'; cls = 's-ok'; }
        else { const r = rdy(q); status = r ? 'READY' : 'NOT READY'; cls = r ? 's-ok' : 's-no'; }
        const s = t.querySelector('.tg-s'); s.textContent = status; t.className = 'ol-tag t' + d + ' ' + cls + (L.dances[q.slot] ? ' dancing' : '');
        t.style.setProperty('--c', q.color);
      }
      if (f) { f.hidden = false; f.style.setProperty('--c', q.color); f.classList.toggle('dancing', !!L.dances[q.slot]); }
    }
    const inv = $('.ol-invite'); if (inv) inv.hidden = open;
    root.classList.toggle('has-peer', !!(open && list.length > 1));
    $$('.ol-plat').forEach((p, d) => p.classList.toggle('used', d < list.length));
    stSync();
    layoutTags();
  }

  function refreshAll() {
    if (!root) return;
    updTop(); updPlay(); updStatus(); updVoice(); renderLog(true); updProfile(true); updTab(); renderServers(); renderPublic(); updRoom(); updEmoBtn(); renderTrade(); updKP();
    $('#ol-msg').disabled = false;
    const lan = $('#cn-lan'); if (lan) lan.checked = NN.lan;
    const o = NN.offerCode;
    if (o && NN.role === 'host') { $('#h-out').hidden = false; $('#h-link').value = NN.linkFor(o); }
    if (NN.answerCode && NN.role === 'guest') { $('#g-out').hidden = false; $('#g-code').value = NN.answerCode; }
    layoutTags();
  }
  function updTab() {
    if (!root) return;
    root.dataset.tab = L.tab;
    $$('.ol-tab[data-act="tab"]').forEach((b) => { const on = b.dataset.v === L.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    if (commVisible()) { L.unread = 0; const dot = $('#ol-chatbtn .ol-dot'); if (dot) dot.hidden = true; }
    if (L.tab === 'profile') updProfile(true);
    if (L.tab === 'trade') renderTrade();
    if (L.tab === 'social' && window.NexaSocial) NexaSocial.mount($('#sc-root'));
    if (L.tab === 'public') enterPublic();
    layoutTags();
  }
  function setTab(t) {
    if (t === 'chat') { L.tab = 'play'; updTab(); chatToggle(true); return; }
    if (['play', 'public', 'trade', 'social', 'profile', 'connect', 'rules'].indexOf(t) < 0 || (t === 'trade' && !TRADES_ENABLED)) t = 'play';
    L.tab = t; updTab();
    if (t === 'rules' && window.NexaRules) NexaRules.mountTab($('#rl-pane'));
  }

  // ------------------------------------------------------------------ действия
  function copyFrom(el, label) {
    if (!el || !el.value) return;
    const done = () => { toast(label || 'COPIED'); L.copied = Date.now(); };
    const fb = () => { try { el.focus(); el.select(); const ok = document.execCommand && document.execCommand('copy'); if (ok) done(); else toast('PRESS CTRL+C TO COPY', 'bad'); } catch (e) { toast('PRESS CTRL+C TO COPY', 'bad'); } };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(el.value).then(done, fb); else fb(); } catch (e) { fb(); }
  }
  function iceLines() {
    const A = NN.lastAttempt ? NN.lastAttempt() : null, R0 = RM && RM.lastAttempt ? RM.lastAttempt() : null;
    if (!A) return ['last attempt: none yet'];
    const ct = (c) => (c ? 'host ' + c.host + ', mDNS ' + (c.mdns ? 'yes (' + c.mdns + ')' : 'no') + ', srflx ' + c.srflx + ', prflx ' + c.prflx + ', relay ' + c.relay + ', IPv6 ' + (c.v6 ? 'yes' : 'no') : 'n/a');
    const a = ['last attempt (ICE):', '  role: ' + A.role + ', ice round: ' + A.round + (R0 && R0.rounds ? ', rendezvous rounds: ' + R0.rounds : '') + (R0 && R0.via ? ', via: ' + NN.util.scrub(R0.via) : ''),
      '  result: ' + (A.ok ? 'connected in ' + A.okAt + ' ms' : A.fail ? 'failed (' + A.fail + ')' : 'in progress / no verdict') + (A.why ? ', reason: ' + A.why : ''),
      '  local candidates: ' + ct(A.loc), '  remote candidates: ' + ct(A.rem), '  first public candidate: ' + (A.firstPub >= 0 ? A.firstPub + ' ms' : 'none')];
    a.push('  STUN' + (A.noUrl ? ' (browser reports the server for some candidates only)' : '') + ':');
    A.stun.forEach((x) => a.push('    ' + x.u + ' - ' + (x.ok ? 'answered in ' + x.ms + ' ms' : x.err ? 'error ' + (x.code || '?') + (x.code === 701 ? ' (no answer)' : '') : 'no answer')));
    a.push('  ice events (ms): ' + (A.ev.length ? A.ev.map((e) => e[0] + ' ' + e[1]).join(', ') : 'none'));
    return a;
  }
  function netReport() {
    const ls = NN.linkStats ? NN.linkStats() : null, sm = RM && RM.servers ? RM.servers.summary() : null, st = NN.stats ? NN.stats() : {};
    const sv = (n) => { const e = document.querySelector('script[src*="' + n + '"]'), m = e && /[?&]v=([\w.]+)/.exec(e.getAttribute('src')); return m ? m[1] : '?'; };
    const q = /[?&]v=([\w.]+)/.exec(location.search);
    const a = ['NEXA network report', 'time: ' + new Date().toISOString(), 'game: net.js v' + sv('net.js') + ', onlinelobby.js v' + sv('onlinelobby.js') + (q ? ', url v=' + q[1] : ''),
      'userAgent: ' + navigator.userAgent, 'language: ' + (navigator.language || '?'), 'state: ' + NN.state + ', role: ' + (NN.role || '-') + ', uptime: ' + (st.up | 0) + ' s',
      'mode: ' + L.mode + (L.mode === 'mission' ? ' ' + L.mission : '') + (window.NexaCoop && NexaCoop.active ? ' (in match)' : ''), 'players: ' + (NN.connected ? NN.players.length + 1 : 1),
      'relays online/total: ' + (sm ? sm.online + '/' + sm.total + ' (found ' + sm.found + ', in use ' + sm.active + ', down ' + sm.down + ')' : 'n/a'), 'rtt: ' + (NN.rtt || 0) + ' ms'];
    if (ls) {
      a.push('dropBuf: ' + ls.dropBuf);
      if (!ls.links.length) a.push('links: none');
      ls.links.forEach((l) => a.push('link #' + l.slot + ': path=' + (l.path || '?') + ' (' + (l.ct || '?') + ') ice-rtt=' + l.ice + ' ms, ping min/avg/p95/max=' + l.min + '/' + l.avg + '/' + l.p95 + '/' + l.max + ' ms'));
    }
    if (window.NexaCoop && NexaCoop.puppetStats) { const t = NexaCoop.puppetStats().trim(); if (t) a.push('puppets: ' + t); }
    iceLines().forEach((x) => a.push(x));
    return a.join('\n');
  }
  function copyReport() {
    const txt = netReport(), done = () => { toast('REPORT COPIED'); L.copied = Date.now(); };
    const fb = () => { try { const t = document.createElement('textarea'); t.value = txt; t.style.cssText = 'position:fixed;left:-999px;top:0'; document.body.appendChild(t); t.select(); const ok = document.execCommand && document.execCommand('copy'); t.remove(); if (ok) done(); else toast('PRESS CTRL+C TO COPY', 'bad'); } catch (e) { toast('PRESS CTRL+C TO COPY', 'bad'); } };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fb); else fb(); } catch (e) { fb(); }
  }
  async function hostCreate() {
    L.t0 = Date.now(); if (!NN.connected) { NN.chat.clear(); renderLog(true); }
    $('#h-out').hidden = true; note('h-note', ''); const dg = $('#cn-diag'); if (dg) dg.hidden = true;
    $('#h-create').disabled = true;
    const r = await NN.createOffer();
    if (!root) return;
    if (!r.ok) { note('h-note', r.err, 'bad'); $('#h-create').disabled = false; return; }
    $('#h-out').hidden = false; $('#h-link').value = r.link; $('#h-ans').value = '';
    const bits = [];
    if (r.forced) bits.push(NN.text('GATHER_FORCED'));
    if (r.onlyLocal) bits.push(NN.text('NO_PUBLIC'));
    noteSet($('#h-note'), bits.length ? bits : ['Invitation ready. Send the link to your friend.'], r.onlyLocal ? 'bad' : 'ok');
    updStatus();
  }
  async function hostConnect() {
    const v = $('#h-ans').value;
    const r = await NN.acceptAnswer(v);
    if (!root) return;
    if (!r.ok) { note('h-note', r.err, 'bad'); return; }
    const nt = $('#h-note'); nt.className = 'v-note ok'; nt.textContent = 'Answer accepted — connecting…';
  }
  async function guestAnswer(fromUrl) {
    const v = $('#g-in').value;
    L.t0 = Date.now(); NN.chat.clear(); renderLog(true);
    $('#g-out').hidden = true; note('g-note', ''); const dg = $('#cn-diag'); if (dg) dg.hidden = true;
    $('#g-answer').disabled = true;
    const r = await NN.createAnswer(v);
    if (!root) return;
    $('#g-answer').disabled = false;
    if (!r.ok) { note('g-note', r.err, 'bad'); updStatus(); return; }
    $('#g-out').hidden = false; $('#g-code').value = r.code;
    const bits = [];
    if (r.forced) bits.push(NN.text('GATHER_FORCED'));
    if (r.onlyLocal) bits.push(NN.text('NO_PUBLIC'));
    noteSet($('#g-note'), bits.length ? bits : [fromUrl ? 'Invitation found in the link. Send the answer code to the host.' : 'Answer ready. Send the code to the host.'], r.onlyLocal ? 'bad' : 'ok');
    updStatus();
  }
  // «Повторить»: новое приглашение (хост) или новый ответ из того же приглашения (друг)
  function manualRetry() {
    const dg = $('#cn-diag'); if (dg) dg.hidden = true;
    if (NN.role === 'guest' || ($('#g-in').value.trim() && !NN.offerCode && NN.role !== 'host')) { if ($('#g-in').value.trim()) guestAnswer(false); else toast('PASTE THE HOST\'S LINK OR CODE', 'bad'); }
    else hostCreate();
  }
  // галочка LAN влияет на уже созданный код — код пересоздаётся
  function lanChanged(on) {
    NN.setLan(on);
    if (NN.state === 'waiting-answer' && NN.role === 'host' && NN.offerCode) { toast('LAN MODE CHANGED — NEW INVITATION CREATED'); hostCreate(); }
    else if (NN.role === 'guest' && NN.answerCode && !NN.connected && $('#g-in').value.trim()) { toast('LAN MODE CHANGED — NEW ANSWER CREATED'); guestAnswer(false); }
  }

  // ------------------------------------------------------------------ быстрый подбор PvP «каждый сам за себя» (ГОТОВО: ищем открытый матч ~10 с, иначе хостим публичную комнату)
  const QM_MAX = () => NN.MAX_PLAYERS;
  const qmWait = () => { try { const m = /[?&]qmwait=(\d{1,3})/.exec(location.search); return m ? Number(m[1]) : 35; } catch (e) { return 35; } };
  const qmFind = () => { try { const m = /[?&]qmfind=(\d{1,2})/.exec(location.search); return m ? Number(m[1]) : 10; } catch (e) { return 10; } };
  const qmLeft = () => Math.ceil(qmWait() - (Date.now() - QM.t0) / 1000);
  function mkp(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function qmReady() {
    if (!RM || QM.on) return;
    if (needConsent('ffa')) return;
    RM.stopHost(); RM.stopJoin(); if (NN.connected) NN.close();
    QM.on = true; QM.host = false; QM.state = 'searching'; QM.t0 = Date.now(); L.mode = 'ffa'; L.qmt = -1;
    updPlay();
    RM.gossip.start().then(() => { RM.gossip.refresh(); });
    QM.find0 = Date.now(); clearTimeout(QM.findT); QM.findT = setTimeout(qmDecide, 1500);
  }
  async function qmDecide() {
    if (!QM.on || !RM) return;
    const r = RM.gossip.rooms().find((x) => x.mode === 'ffa' && x.n < x.max);
    if (r) { QM.state = 'joining'; startJoin(r.rid, 'join', true); return; }
    if (Date.now() - QM.find0 < qmFind() * 1000) { QM.findT = setTimeout(qmDecide, 1000); return; }      // сначала ищем уже открытый матч (рой находит комнаты за несколько секунд)
    QM.host = true; QM.state = 'waiting'; QM.t0 = Date.now();
    const res = await RM.hostRoom({ pub: true, title: 'FREE FOR ALL', mode: 'ffa', max: QM_MAX() });
    if (!QM.on) { RM.stopHost(); return; }
    if (!res.ok) { QM.on = false; QM.host = false; toast(NN.text(res.err), 'bad'); } else { L.roomLink = res.link; L.pubSession = true; try { NN.voice.incoming(false); } catch (e) { /* ok */ } }
    updPlay();
  }
  function qmCancel() {
    QM.on = false; QM.host = false; QM.state = ''; clearTimeout(QM.findT);
    if (RM) { RM.stopHost(); RM.stopJoin(); }
    closeJoin(); if (NN.connected) NN.close();
    updPlay();
  }
  function qmStart() {
    const n = NN.connected ? NN.count : 1;
    if (n < 2) return;
    const cfg = resolveCfg(ffaCfg());
    const spec = { mode: 'pvp', mission: 1, seed: mkSeed(), role: 'host', solo: false, ff: 1, ffm: 1, pvp: cfg };
    NN.sendAction({ type: 'start', mode: 'pvp', mission: 1, seed: spec.seed, ff: 1, ffm: 1, pvp: cfg });
    QM.on = false; QM.host = false; QM.state = ''; if (RM) RM.stopHost();
    beginMatch(spec, 3);
  }

  // ------------------------------------------------------------------ вкладка TRADES: передача KP игрокам комнаты (хост — авторитет, дубли и отрицательные суммы отклоняются)
  const validAmt = (n) => Number.isInteger(n) && n >= 1 && n <= 1000000;
  const validTid = (t) => typeof t === 'string' && /^[0-9a-f]{12}$/.test(t);
  const GF = () => window.NexaGift;
  const gmsg = (m) => (typeof m === 'string' && GF() ? GF().clean(m, 80) : '');
  const tp = (a, m) => (m ? a.concat([m]) : a);
  function giftIn(src, amt, tid, msg) {
    const g = GF(); if (!g) return;
    const q = NN.players.find((x) => x.slot === src);
    g.add({ id: 't' + tid, k: 'p', n: q ? q.name : 'HOST', c: q ? q.color : '#ff3b30', p: q ? q.pid : '', m: msg, a: amt });
  }
  function renderTrade() {
    const box = $('#tr-list'); if (!box) return;
    updKP(); box.textContent = '';
    const list = NN.connected ? NN.players : [];
    if (!list.length) { box.appendChild(mkp('p', 'pb-empty', 'NO OTHER PLAYERS IN YOUR ROOM')); return; }
    list.forEach((q) => {
      const row = mkp('div', 'pb-row tr-row'); row.setAttribute('role', 'listitem');
      const a = mkp('button', 'pb-host'); a.type = 'button'; a.dataset.act = 'card'; a.dataset.slot = String(q.slot);
      const av = mkp('span'); av.innerHTML = PF.avatar(q.name, q.color, 26, q.pid); const nm = mkp('em', '', q.name + ' · ' + q.level); nm.setAttribute('translate', 'no'); a.appendChild(av); a.appendChild(nm); row.appendChild(a);
      const inp = mkp('input'); inp.type = 'number'; inp.min = '1'; inp.max = '1000000'; inp.step = '1'; inp.id = 'tr-amt-' + q.slot; inp.setAttribute('aria-label', 'Amount'); inp.value = '10'; row.appendChild(inp);
      const b = mkp('button', 'ol-btn', 'SEND'); b.type = 'button'; b.dataset.act = 'trade'; b.dataset.slot = String(q.slot); row.appendChild(b);
      box.appendChild(row);
    });
  }
  function openTrade(slot) {
    const q = NN.players.find((x) => x.slot === slot), inp = $('#tr-amt-' + slot), nt = $('#tr-note');
    const amt = inp ? Math.floor(Number(inp.value)) : 0;
    nt.className = 'v-note bad';
    if (!q) { nt.textContent = NN.text('TRADE_GONE'); return; }
    if (!validAmt(amt)) { nt.textContent = NN.text('TRADE_AMT'); return; }
    if (amt > kp()) { nt.textContent = NN.text('TRADE_FUNDS'); return; }
    nt.textContent = ''; nt.className = 'v-note';
    const mi = $('#tr-msg'); L.tradeAsk = { slot, amt, msg: mi ? gmsg(mi.value) : '' };
    const el = $('#ol-trade'); el.textContent = '';
    const box = mkp('div', 'pk-box jn-box'); box.appendChild(mkp('h3', '', 'CONFIRM TRANSFER'));
    const p = mkp('p', 'jn-st'); const b1 = mkp('b', '', String(amt)); b1.setAttribute('translate', 'no'); const ar = mkp('span', '', ' KP → '); const b2 = mkp('b', '', q.name); b2.setAttribute('translate', 'no'); p.appendChild(b1); p.appendChild(ar); p.appendChild(b2); box.appendChild(p);
    box.appendChild(mkp('p', 'cn-priv', 'This cannot be undone. KP is sent only to a player who is in your room right now.'));
    const act = mkp('div', 'pf-btns'); const y = mkp('button', 'ol-btn big', 'CONFIRM'); y.type = 'button'; y.dataset.act = 'trade-yes'; const n = mkp('button', 'ol-btn', 'CANCEL'); n.type = 'button'; n.dataset.act = 'trade-no'; act.appendChild(y); act.appendChild(n); box.appendChild(act);
    el.appendChild(box); el.hidden = false;
  }
  function tradeConfirm() {
    const a = L.tradeAsk, el = $('#ol-trade'); if (el) el.hidden = true; L.tradeAsk = null;
    if (!TRADES_ENABLED || !a || !window.Toys) return;
    const q = NN.players.find((x) => x.slot === a.slot);
    if (!NN.connected || !q) { toast(NN.text('TRADE_GONE'), 'bad'); return; }
    if (!validAmt(a.amt) || a.amt > kp()) { toast(NN.text('TRADE_FUNDS'), 'bad'); return; }
    const tid = NN.util.rndHex(6);
    if (!VAULT || !VAULT.debit(a.amt)) { toast(NN.text('TRADE_FUNDS'), 'bad'); return; }
    TRD.sent[tid] = { slot: a.slot, amt: a.amt, name: q.name };
    updKP();
    if (NN.isHost) trRoute(1, a.slot, a.amt, tid, a.msg); else { const t = Date.now(), bal = kp(); NN.sendAction({ type: 'trq', dst: a.slot, amt: a.amt, tid, t, bal, msg: a.msg || undefined, sg: sg(SIG.mine, tp(['trq', a.slot, a.amt, tid, t, bal], a.msg)) }); }
    toast('TRANSFER SENT — WAITING FOR CONFIRMATION');
  }
  function trResult(src, tid, ok, amt) { if (src === 1) onTrf({ tid, ok, amt }); else NN.sendAction({ type: 'trf', tid, ok: ok ? 1 : 0, amt, sg: sg(SIG.key[src], ['trf', tid, ok ? 1 : 0, amt]) }, { to: src }); }
  function trRoute(src, dst, amt, tid, msg) {                       // только хост
    if (!TRADES_ENABLED) { trResult(src, tid, false, 0); return; }
    const key = src + ':' + tid;
    if (TRD.hseen.has(key)) return;
    TRD.hseen.add(key); if (TRD.hseen.size > 500) TRD.hseen.clear();
    if (!validTid(tid) || !validAmt(amt) || dst === src || !window.Toys) { trResult(src, tid, false, 0); return; }
    if (dst === 1) { if (!VAULT || !VAULT.credit(amt)) { trResult(src, tid, false, 0); return; } toastFrom(src, amt); giftIn(src, amt, tid, msg || ''); updKP(); trResult(src, tid, true, amt); return; }
    if (!NN.players.some((q) => q.slot === dst)) { trResult(src, tid, false, 0); return; }
    TRD.route[tid] = { src, dst, amt };
    const t = Date.now(); NN.sendAction({ type: 'trd', src, amt, tid, t, msg: msg || undefined, sg: sg(SIG.key[dst], tp(['trd', src, amt, tid, t], msg)) }, { to: dst });
  }
  function toastFrom(src, amt) { const q = src === 1 ? null : NN.players.find((x) => x.slot === src); if (root) toast('+' + amt + ' KP — ' + (q ? q.name : 'HOST')); }
  function onTrf(p) {
    const e = TRD.sent[p.tid]; if (!e) return;
    delete TRD.sent[p.tid];
    if (p.ok) { if (root) toast('SENT ' + e.amt + ' KP — ' + e.name); }
    else { if (VAULT) VAULT.credit(e.amt); if (root) toast('TRANSFER FAILED — KP RETURNED', 'bad'); }
    updKP(); renderTrade();
  }
  function tradeHooks() {
    NN.on('tk', (p) => { if ((p.from | 0) === 1 && !NN.isHost && typeof p.k === 'string' && /^[0-9a-f]{32}$/.test(p.k)) SIG.mine = p.k; });
    NN.on('trq', (p) => {
      if (!NN.isHost) return;
      const src = p.from | 0;
      if (!TRADES_ENABLED) { if (validTid(p.tid)) trResult(src, p.tid, false, 0); return; }
      const rm = typeof p.msg === 'string' ? p.msg.slice(0, 240) : '';
      if (!sgOk(SIG.key[src], tp(['trq', p.dst, p.amt, p.tid, p.t, p.bal], rm), p.sg) || !tOk(p.t) || !validAmt(p.amt)) return;
      if (!TRD.hseen.has(src + ':' + p.tid) && !ledgerOk(src, p.amt, p.bal)) { TRD.hseen.add(src + ':' + p.tid); trResult(src, p.tid, false, 0); return; }
      trRoute(src, p.dst | 0, p.amt, p.tid, gmsg(rm));
    });
    NN.on('trd', (p) => {
      if (!TRADES_ENABLED || (p.from | 0) !== 1 || NN.isHost || !validTid(p.tid) || !validAmt(p.amt) || TRD.seen.has(p.tid)) return;
      const rm = typeof p.msg === 'string' ? p.msg.slice(0, 240) : '';
      if (!sgOk(SIG.mine, tp(['trd', p.src | 0, p.amt, p.tid, p.t], rm), p.sg) || !tOk(p.t)) return;
      TRD.seen.add(p.tid); if (TRD.seen.size > 500) TRD.seen.clear();
      if (VAULT && VAULT.credit(p.amt)) { toastFrom(p.src | 0, p.amt); giftIn(p.src | 0, p.amt, p.tid, gmsg(rm)); updKP(); }
      NN.sendAction({ type: 'tra', src: p.src | 0, tid: p.tid, amt: p.amt, sg: sg(SIG.mine, ['tra', p.src | 0, p.tid, p.amt]) });
    });
    NN.on('tra', (p) => {
      if (!TRADES_ENABLED) return;
      if (!NN.isHost) return;
      const r = TRD.route[p.tid]; if (!r || r.dst !== (p.from | 0) || !sgOk(SIG.key[r.dst], ['tra', p.src | 0, p.tid, p.amt], p.sg)) return;
      delete TRD.route[p.tid]; const le = SIG.led[r.dst]; if (le) le.recv += r.amt; trResult(r.src, p.tid, true, r.amt);
    });
    NN.on('trf', (p) => { if (TRADES_ENABLED && (p.from | 0) === 1 && !NN.isHost && sgOk(SIG.mine, ['trf', p.tid, p.ok ? 1 : 0, p.amt], p.sg)) onTrf(p); });
    NN.on('net:left', (p) => { if (!NN.isHost) return; delete SIG.key[p.slot]; delete SIG.led[p.slot]; Object.keys(TRD.route).forEach((t) => { const r = TRD.route[t]; if (r.dst === p.slot) { delete TRD.route[t]; trResult(r.src, t, false, 0); } }); });
  }

  const pvpCfg = () => (L.pvp = window.NexaPvp ? NexaPvp.norm(L.pvp) : (L.pvp || {}));
  const ffaCfg = () => (window.NexaPvp ? NexaPvp.norm(Object.assign({}, L.pvp, { kind: 'ffa' })) : { kind: 'ffa' });
  const curCfg = () => (L.mode === 'ffa' ? ffaCfg() : pvpCfg());
  const inRoom = () => NN.connected && NN.players.length > 0;
  const resolveCfg = (c) => (window.NexaPvp ? NexaPvp.resolveMap(c, L.votes) : c);
  function pvpSub() { const c = curCfg(), g = /^([kt])(\d+)$/.exec(c.goal) || ['', 'k', '25']; return '<span>PVP</span> — <span>' + (c.kind === 'team' ? 'TEAM BATTLE' : c.kind === 'duel' ? 'DUEL 1V1' : 'FREE FOR ALL') + '</span> — <em translate="no">' + g[2] + '</em> <span>' + (g[1] === 'k' ? 'KILLS' : 'MIN') + '</span>'; }
  function voteUi(hint) {
    let vb = $('#bl-vote');
    const on = window.NexaPvp && (L.mode === 'pvp' || L.mode === 'ffa') && curCfg().map === 'vote' && !L.cd;
    if (!on) { if (vb) vb.hidden = true; return; }
    if (!vb) { vb = mkp('div', 'bl-vote'); vb.id = 'bl-vote'; hint.parentNode.insertBefore(vb, hint.nextSibling); }
    const my = (L.votes || {})[NN.connected ? NN.slot || 1 : 1], tally = {};
    Object.keys(L.votes || {}).forEach((k) => { tally[L.votes[k]] = (tally[L.votes[k]] || 0) + 1; });
    vb.hidden = false;
    vb.innerHTML = '<label>VOTE FOR THE MAP</label>' + NexaPvp.POOL.map((m) => '<button type="button" class="ol-btn' + (my === m ? ' on' : '') + '" data-act="vote" data-v="' + m + '"><span>' + NexaPvp.MAPN[m] + '</span> <em translate="no">' + (tally[m] || 0) + '</em></button>').join('');
  }
  function lobbyMsg() { return { type: 'lobby', pvp: L.mode === 'pvp' || L.mode === 'ffa' ? curCfg() : undefined, votes: L.votes || {}, ff: L.ff ? 1 : 0, ffm: L.ffm, mode: L.mode, mission: L.mission, ready: NN.players.filter((q) => L.readyMap[q.slot]).map((q) => q.slot) }; }
  function sendLobby() { if (NN.isHost && NN.connected) NN.sendAction(lobbyMsg()); }
  function setMode(mode, mission) {
    if (NN.connected && !NN.isHost) return;
    if (QM.on && mode !== 'ffa') qmCancel();
    L.mode = mode === 'ffa' && window.NexaPvp ? 'ffa' : mode === 'hl' ? 'hl' : mode === 'pvp' && window.NexaPvp ? 'pvp' : mode === 'mission' && validMission(mission) ? 'mission' : 'sandbox';
    if (L.mode === 'mission') L.mission = mission | 0;
    L.votes = {}; sendLobby(); updPlay(); sfx('mouse');
    if (RM && RM.hosting && RM.hosting.pub) RM.setMeta({ mode: L.mode, mission: L.mission });
  }
  function openPick() {
    if (NN.connected && !NN.isHost) return;
    const el = $('#ol-pick'); if (!el) return;
    if (window.ModePick && window.ModeCovers) {
      L.pick = true; el.hidden = false;
      ModePick.open(el, {
        st: () => ({ mode: L.mode, mission: L.mission, pvp: L.mode === 'ffa' ? ffaCfg() : pvpCfg(), ff: L.ff, ffm: L.ffm }),
        setMode: (m, n) => setMode(m, n), setPvp: (c) => { L.pvp = window.NexaPvp ? NexaPvp.norm(c) : c; L.votes = {}; sendLobby(); },
        setFF: (on) => { L.ff = !!on; sendLobby(); updPlay(); }, setFFm: (v) => { L.ffm = +v || 1; sendLobby(); updPlay(); },
        close: () => closePick(), play: () => { const b = $('#bl-play'); if (b && !b.disabled) doPlay(); }
      });
      return;
    }
  }
  function closePick() { const el = $('#ol-pick'); if (el) { if (window.ModePick) ModePick.close(el); el.hidden = true; } L.pick = false; }

  function mkSeed() { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] || 1; } catch (e) { return (Date.now() % 4294967295) || 1; } }
  function doPlay() {
    if (L.cd) return;
    if (L.mode === 'ffa' && (QM.on || !inRoom())) { if (QM.on) { if (QM.host && NN.connected && NN.count >= 2) qmStart(); else qmCancel(); } else qmReady(); return; }
    if ((L.mode === 'pvp' || L.mode === 'ffa') && (!NN.connected || NN.isHost)) {
      const cfg = curCfg(), n = NN.connected ? NN.players.length + 1 : 1;
      if (n < 2 || (cfg.kind === 'duel' && n !== 2) || !guestsReady()) return;
      const rc = resolveCfg(cfg), spec = { mode: 'pvp', mission: 1, seed: mkSeed(), role: 'host', solo: false, ff: 1, ffm: 1, pvp: rc };
      NN.sendAction({ type: 'start', mode: 'pvp', mission: 1, seed: spec.seed, ff: 1, ffm: 1, pvp: rc });
      beginMatch(spec, 3); return;
    }
    if (!NN.connected || (NN.isHost && !NN.players.length)) { beginMatch({ mode: L.mode, mission: L.mission, seed: mkSeed(), role: 'solo', solo: true }, 1); return; }
    if (NN.isHost) {
      if (!guestsReady()) return;
      const spec = { mode: L.mode, mission: L.mission, seed: mkSeed(), role: 'host', solo: false, ff: L.ff ? 1 : 0, ffm: L.ffm };
      NN.sendAction({ type: 'start', mode: spec.mode, mission: spec.mission, seed: spec.seed, ff: spec.ff, ffm: spec.ffm });
      beginMatch(spec, 3);
    } else {
      L.ready = !L.ready; NN.sendAction({ type: 'ready', on: L.ready }); updPlay();
    }
  }
  function beginMatch(spec, secs) {
    L.cdSpec = spec; L.cd = secs; L.cdT = 0; closePick(); closeCard(); setTab('play'); danceStopLocal(true);
    const el = $('#ol-cd'); if (el) { el.hidden = false; el.querySelector('b').textContent = L.cd; }
    sfx('notification'); updPlay();
  }
  function cdTick() {
    if (!L.cd) return;
    if (++L.cdT < 1) return;
    L.cdT = 0; L.cd -= 1;
    const el = $('#ol-cd');
    if (L.cd > 0) { if (el) el.querySelector('b').textContent = L.cd; sfx('mouse'); return; }
    if (el) el.hidden = true;
    const spec = L.cdSpec; L.cdSpec = null; L.cd = 0;
    if (!spec) return;
    if (!spec.solo && !NN.connected) { toast('CONNECTION CLOSED', 'bad'); updPlay(); return; }
    L.ready = false;
    if (window.NexaCoop) NexaCoop.prepare(spec);
    if (!ctx.startCoop || ctx.startCoop(spec) === false) { toast('COULD NOT START', 'bad'); if (window.NexaCoop) NexaCoop.end(); }
    updPlay();
  }

  // ------------------------------------------------------------------ серверы сигналинга: видимый список с состоянием каждого
  const SRV_TXT = { active: 'IN USE', online: 'ONLINE', connecting: 'CONNECTING', down: 'UNAVAILABLE', reserve: 'RESERVE', off: 'OFF', idle: 'NOT CHECKED' };
  const WHY_TXT = { timeout: 'NO ANSWER (TIMEOUT)', error: 'CONNECTION ERROR', ws: 'CONNECTION ERROR', closed: 'CLOSED BY SERVER', silent: 'NO REPLY', nocrypto: 'CRYPTO UNAVAILABLE', pow: 'NEEDS PROOF OF WORK', paid: 'PAID OR RESTRICTED', auth: 'NEEDS LOGIN',
    readonly: 'READ ONLY: REJECTS OUR EVENTS', rejecting: 'REJECTS OUR EVENTS', closedreq: 'REFUSED OUR REQUEST', noreq: 'OPEN, NO REPLY TO REQUEST', notice: 'SERVER NOTICE', refused: 'SERVER ERROR', probe: 'CHECK FAILED' };
  function renderServers() {
    if (!root || !RM) return;
    const list = RM.servers.list(), on = RM.servers.on, sm = RM.servers.summary();
    { let sg = ''; try { sg = JSON.stringify([list, sm, on]); } catch (e) { sg = String(Math.random()); } if (root.__srvSig === sg) return; root.__srvSig = sg; }
    $$('.ol-srv').forEach((blk) => {
      blk.classList.toggle('is-off', !on);
      const cnt = blk.querySelector('.srv-count'); cnt.textContent = '';
      [['FOUND', sm.found], ['TOTAL', sm.total], ['CHECKED', sm.checked], ['ONLINE', sm.online], ['IN USE', sm.active], ['UNAVAILABLE', sm.down]].forEach((c) => {
        const sp = document.createElement('span'); sp.className = 'sm-' + c[0].replace(/ /g, '').toLowerCase();
        const em = document.createElement('em'); em.textContent = c[0]; const n = document.createElement('b'); n.setAttribute('translate', 'no'); n.textContent = String(c[1]);
        sp.appendChild(em); sp.appendChild(n); cnt.appendChild(sp);
      });
      const sw = blk.querySelector('.srv-on'); if (sw) sw.checked = on;
      const ul = blk.querySelector('.srv-list'); ul.textContent = '';
      const prio = { active: 0, connecting: 1, online: 2, down: 3, idle: 4, off: 5 };
      const shown = list.length > 60 ? list.slice().sort((a, b) => (prio[a.state] || 9) - (prio[b.state] || 9) || (a.ms || 1e9) - (b.ms || 1e9)).slice(0, 60) : list;
      shown.forEach((s) => {
        const li = document.createElement('li'); li.className = 'srv st-' + s.state;
        const dot = document.createElement('i'); dot.setAttribute('aria-hidden', 'true');
        const nm = document.createElement('b'); nm.setAttribute('translate', 'no'); nm.textContent = s.host;
        const ty = document.createElement('em'); ty.setAttribute('translate', 'no'); ty.textContent = s.type;
        const st = document.createElement('span'); st.textContent = SRV_TXT[s.state] || SRV_TXT.idle;
        const ms = document.createElement('small'); ms.setAttribute('translate', 'no'); ms.textContent = s.ms && (s.state === 'online' || s.state === 'active') ? s.ms + ' ms' : '';
        li.appendChild(dot); li.appendChild(nm); li.appendChild(ty); li.appendChild(ms); li.appendChild(st);
        if (s.why && WHY_TXT[s.why]) { const w = document.createElement('i'); w.className = 'srv-why'; w.textContent = WHY_TXT[s.why]; li.appendChild(w); }
        ul.appendChild(li);
      });
      if (list.length > shown.length) { const li = document.createElement('li'); li.className = 'srv-more'; li.textContent = '… AND ' + (list.length - shown.length) + ' MORE SERVERS'; ul.appendChild(li); }
      let la = blk.querySelector('.srv-last'); if (la) la.remove();
      const L = RM.lastAttempt ? RM.lastAttempt() : null;
      if (L && L.ok !== null && L.id) {
        la = document.createElement('p'); la.className = 'srv-last ' + (L.ok ? 'is-ok' : 'is-bad');
        const mk = (tag, txt, nt) => { const e = document.createElement(tag); if (nt) e.setAttribute('translate', 'no'); e.textContent = txt; la.appendChild(e); la.appendChild(document.createTextNode(' ')); };
        mk('em', 'LAST ATTEMPT');
        if (L.ok) { mk('span', 'CONNECTED IN ' + (L.ms / 1000).toFixed(1) + ' S, ROUND ' + L.rounds); if (L.via) mk('b', L.via, true); }
        else { mk('span', 'NO CONNECTION AFTER ' + L.rounds + ' ROUNDS'); mk('small', 'SERVERS ' + L.up + ' OF ' + L.total); mk('i', L.why === 'servers' ? 'NO SIGNALING SERVER REACHABLE' : L.why === 'ice' ? 'DIRECT CONNECTION FAILED (NAT / FIREWALL)' : 'NO ANSWER FROM THE HOST - IS THE ROOM OPEN?'); }
        const A = NN.lastAttempt ? NN.lastAttempt() : null;
        if (A) {
          const k = A.ok ? '' : A.why === 'no-srflx' ? 'ICE: NO PUBLIC ADDRESS (STUN SILENT)' : A.why === 'remote-no-srflx' ? 'ICE: FRIEND HAS NO PUBLIC ADDRESS' : A.why === 'no-pairs' ? 'ICE: NO CONNECTION CHECKS STARTED' : A.why === 'checking-failed' ? 'ICE: CHECKS FAILED (STRICT NAT)' : A.why === 'disconnected' ? 'ICE: LINK DROPPED' : A.why === 'timeout' ? 'ICE: TIMED OUT' : '';
          if (k) mk('i', k);
          const c = A.loc;
          mk('small', 'host ' + c.host + ' / srflx ' + (c.srflx + c.prflx) + ' / relay ' + c.relay + ' / mDNS ' + (c.mdns ? 'yes' : 'no') + ' / IPv6 ' + (c.v6 ? 'yes' : 'no') + (A.firstPub >= 0 ? ' / ' + A.firstPub + ' ms' : ''), true);
        }
        ul.parentNode.insertBefore(la, ul);
      }
      const btn = blk.querySelector('[data-act="srv-probe"]'); if (btn) btn.disabled = !on;
    });
  }
  function srvProbe() {
    if (!RM || !RM.servers.on) return;
    const bs = $$('[data-act="srv-probe"]'); bs.forEach((b) => { b.disabled = true; });
    RM.servers.probe(true).then(() => { if (root) renderServers(); });
  }

  // ------------------------------------------------------------------ комната по ссылке (хост)
  function updRoom() {
    if (!root || !RM) return;
    const h = RM.hosting, out = $('#rm-out'); if (!out) return;
    if (h && !h.pub && L.roomLink) {
      out.hidden = false; $('#rm-link').value = L.roomLink;
      const st = $('#rm-status'); st.className = 'v-note ok';
      st.textContent = 'ROOM OPEN — PLAYERS ' + NN.count + '/' + MAXP;
      $('#rm-create').textContent = 'NEW ROOM LINK';
    } else if (!h) { out.hidden = true; $('#rm-create').textContent = 'CREATE ROOM LINK'; }
  }
  async function roomCreate(opts) {
    if (!RM) return;
    note('rm-note', '');
    if (!RM.servers.on) { note('rm-note', 'SERVERS_OFF', 'bad'); return; }
    $('#rm-create').disabled = true;
    const r = await RM.hostRoom(opts || {});
    if (!root) return;
    $('#rm-create').disabled = false;
    if (!r.ok) { note('rm-note', r.err, 'bad'); return; }
    L.roomLink = r.link; L.t0 = Date.now(); L.pubSession = false;
    updRoom(); updStatus();
    const nt = $('#rm-note'); nt.className = 'v-note ok'; nt.textContent = 'Room link ready. Send it to your friends — they connect automatically while this page stays open.';
  }

  // ------------------------------------------------------------------ подключение по ссылке/публичной комнате (гость): экран «Подключение…»
  function joinUi(kind, id) {
    const el = $('#ol-join'); if (!el) return;
    L.joinUi = { kind, id, stage: 'searching', t0: Date.now() };
    el.hidden = false; renderJoin();
  }
  function renderJoin() {
    const el = $('#ol-join'), j = L.joinUi; if (!el || !j) return;
    const stages = { retry: 'TRYING OTHER SERVERS…', searching: j.kind === 'quick' ? 'LOOKING FOR PLAYERS…' : 'LOOKING FOR YOUR FRIEND…', connecting: 'CONNECTING TO YOUR FRIEND…', paired: 'PLAYER FOUND — CONNECTING…', hosting: 'WAITING FOR THE OTHER PLAYER…',
      timeout: 'NO ANSWER YET', unavailable: 'SERVERS NOT REACHABLE', error: 'COULD NOT CONNECT', open: 'CONNECTED' };
    const box = document.createElement('div'); box.className = 'pk-box jn-box';
    const h = document.createElement('h3'); h.textContent = j.kind === 'quick' ? 'QUICK PLAY' : 'CONNECTING TO YOUR FRIEND…'; box.appendChild(h);
    const s = document.createElement('p'); s.className = 'jn-st' + (j.stage === 'timeout' || j.stage === 'unavailable' || j.stage === 'error' ? ' bad' : ''); s.textContent = stages[j.stage] || stages.searching; box.appendChild(s);
    const bar = document.createElement('div'); bar.className = 'pf-bar'; const bi = document.createElement('i'); bi.style.width = clamp(((Date.now() - j.t0) / 20000) * 100, 4, 100) + '%'; bar.appendChild(bi);
    if (j.stage === 'searching' || j.stage === 'retry' || j.stage === 'connecting' || j.stage === 'paired' || j.stage === 'hosting') box.appendChild(bar);
    if (j.attempt > 1 && j.of) { const at = document.createElement('p'); at.className = 'v-note'; at.textContent = 'ATTEMPT ' + j.attempt + '/' + j.of; box.appendChild(at); }
    if (j.msg) { const m = document.createElement('p'); m.className = 'v-note bad'; m.textContent = NN.text(j.msg); box.appendChild(m); }
    const p2 = document.createElement('p'); p2.className = 'cn-priv'; p2.textContent = 'The meeting servers and your friend can technically see your network address (WebRTC); a VPN hides it.'; box.appendChild(p2);
    const act = document.createElement('div'); act.className = 'pf-btns';
    if (j.stage === 'timeout' || j.stage === 'unavailable' || j.stage === 'error') {
      if (j.kind === 'quick') { const b = document.createElement('button'); b.type = 'button'; b.className = 'ol-btn big'; b.dataset.act = 'pub-new'; b.textContent = 'CREATE A PUBLIC ROOM'; act.appendChild(b); }
      else { const b = document.createElement('button'); b.type = 'button'; b.className = 'ol-btn big'; b.dataset.act = 'join-retry'; b.textContent = 'TRY AGAIN'; act.appendChild(b); }
      const m = document.createElement('button'); m.type = 'button'; m.className = 'ol-btn'; m.dataset.act = 'join-manual'; m.textContent = 'MANUAL CONNECTION WITH CODES'; act.appendChild(m);
    }
    const c = document.createElement('button'); c.type = 'button'; c.className = 'ol-btn'; c.dataset.act = 'join-cancel'; c.textContent = j.stage === 'open' ? 'CLOSE' : 'CANCEL'; act.appendChild(c);
    box.appendChild(act);
    el.textContent = ''; el.appendChild(box);
  }
  function joinStage(stage, msg) {
    if (!L.joinUi) return;
    L.joinUi.stage = stage; L.joinUi.msg = msg || '';
    if (stage === 'open') { const el = $('#ol-join'); if (el) el.hidden = true; L.joinUi = null; return; }
    renderJoin();
  }
  function closeJoin() { const el = $('#ol-join'); if (el) el.hidden = true; L.joinUi = null; }
  function startJoin(id, kind, pub) {
    if (!RM) return;
    L.pubSession = !!pub; L.joinId = id; L.joinKind = kind;
    if (pub) { try { NN.voice.incoming(false); const c = $('#v-in'); if (c) c.checked = false; } catch (e) { /* ok */ } }
    joinUi(kind === 'quick' ? 'quick' : 'join', id);
    L.t0 = Date.now(); NN.chat.clear(); renderLog(true);
    RM.joinRoom(id).then((r) => { if (r && !r.ok) joinStage('error', r.err); });
  }

  // ------------------------------------------------------------------ публичные комнаты
  function consentModal(next) {
    const el = $('#ol-consent'); if (!el) return;
    L.consentNext = next;
    el.innerHTML = '<div class="pk-box"><div class="pk-h"><h3>PUBLIC PLAY</h3><button type="button" class="ol-ic" data-act="consent-no" aria-label="Close">×</button></div>' +
      '<p class="cn-p">Public rooms and quick play connect you to strangers through free public servers.</p>' +
      '<ul class="cs-list"><li>The signaling servers and the other players can technically see your network address (WebRTC / P2P). To hide it you need a VPN.</li>' +
      '<li>The public chat is not moderated. You can mute or report any player at any time.</li>' +
      '<li>Strangers\' voice is off by default. Your nickname is visible to everyone in the room.</li>' +
      '<li>No account or personal data is sent — only your nickname, color and level.</li></ul>' +
      '<div class="pf-btns"><button type="button" class="ol-btn big" data-act="consent-yes">I UNDERSTAND — CONTINUE</button><button type="button" class="ol-btn" data-act="consent-no">CANCEL</button></div></div>';
    el.hidden = false;
  }
  const needConsent = (next) => { if (!RM) return false; if (RM.consented()) return false; consentModal(next); return true; };
  function enterPublic() {
    renderServers(); renderPublic();
    if (!RM || !RM.servers.on) return;
    if (RM.consented()) { RM.servers.monitor.start(); RM.gossip.start().then(() => { if (root) renderPublic(); }); }
  }
  function ageText(s) { return s < 5 ? 'NOW' : s + ' s'; }
  function renderPublic() {
    const box = $('#pub-list'); if (!box || !RM) return;
    {
      const on0 = RM.servers.on, ok0 = RM.consented(), bm0 = window.NexaAdmin && NexaAdmin.me(), mine0 = !bm0 && RM.hosting && RM.hosting.pub ? RM.adOf() : null;
      const sig = [on0, ok0, !!bm0, JSON.stringify(mine0, (k, v) => (k === 'age' ? Math.floor(v / 20) : v)), JSON.stringify(ok0 && on0 && !bm0 ? RM.gossip.rooms() : [], (k, v) => (k === 'age' ? Math.floor(v / 20) : v)), RM.gossip.peers].join('|');
      if (box.__sig === sig && box.firstChild) return;
      box.__sig = sig;
    }
    box.textContent = '';
    const nt = $('#pub-note');
    const on = RM.servers.on, ok = RM.consented();
    if (!on) { nt.className = 'v-note bad'; nt.textContent = NN.text('SERVERS_OFF'); }
    else if (!ok) { nt.className = 'v-note'; nt.textContent = NN.text('PUBLIC_OFF'); }
    else { nt.className = 'v-note'; nt.textContent = ''; }
    const bm = window.NexaAdmin && NexaAdmin.me();
    if (bm) { nt.className = 'v-note bad'; nt.textContent = NexaAdmin.text(); }
    const rooms = ok && on && !bm ? RM.gossip.rooms() : [];
    const mine = !bm && RM.hosting && RM.hosting.pub ? RM.adOf() : null;
    const rows = (mine ? [Object.assign({ mine: true, age: 0 }, mine)] : []).concat(rooms);
    if (!rows.length) {
      const p = document.createElement('p'); p.className = 'pb-empty'; p.textContent = !on ? 'PUBLIC ROOMS ARE OFF' : (!ok ? 'PRESS REFRESH TO LOOK FOR PUBLIC ROOMS' : (RM.gossip.peers ? 'NO PUBLIC ROOMS RIGHT NOW — CREATE ONE OR TRY QUICK PLAY' : 'LOOKING FOR OTHER PLAYERS…')); box.appendChild(p);
      return;
    }
    rows.forEach((r) => {
      const row = document.createElement('div'); row.className = 'pb-row' + (r.mine ? ' mine' : ''); row.setAttribute('role', 'listitem');
      const t = document.createElement('b'); t.setAttribute('translate', 'no'); t.textContent = r.title; row.appendChild(t);
      const h = document.createElement('button'); h.type = 'button'; h.className = 'pb-host'; h.dataset.act = 'pub-card'; h.dataset.rid = r.rid;
      const av = document.createElement('span'); av.innerHTML = PF.avatar(r.host, r.col, 22); const hn = document.createElement('em'); hn.setAttribute('translate', 'no'); hn.textContent = r.host + ' · ' + r.lv;
      h.appendChild(av); h.appendChild(hn); row.appendChild(h);
      const m = document.createElement('span'); m.className = 'pb-mode'; m.textContent = r.mode === 'mission' ? 'MISSION ' + String(r.mission).padStart(2, '0') : r.mode === 'hl' ? 'HIGH / LOW' : r.mode === 'ffa' ? 'FREE FOR ALL' : r.mode === 'pvp' ? 'PVP' : 'SANDBOX'; row.appendChild(m);
      const n = document.createElement('span'); n.className = 'pb-n'; n.setAttribute('translate', 'no'); n.textContent = r.n + '/' + r.max; row.appendChild(n);
      const a = document.createElement('span'); a.className = 'pb-age'; a.textContent = ageText(r.age); row.appendChild(a);
      const j = document.createElement('button'); j.type = 'button'; j.className = 'ol-btn'; j.dataset.act = 'pub-join'; j.dataset.rid = r.rid; j.textContent = r.mine ? 'YOUR ROOM' : 'JOIN'; j.disabled = !!r.mine || r.n >= r.max; row.appendChild(j);
      if (!r.mine) { const w = document.createElement('button'); w.type = 'button'; w.className = 'ol-btn'; w.dataset.act = 'pub-watch'; w.dataset.rid = r.rid; w.textContent = 'WATCH'; row.appendChild(w); }
      box.appendChild(row);
    });
  }
  function pubNewModal() {
    const el = $('#ol-pubnew'); if (!el) return;
    const ids = Object.keys(missionsMap()).map(Number).filter(validMission).sort((a, b) => a - b);
    el.innerHTML = '<div class="pk-box"><div class="pk-h"><h3>CREATE A PUBLIC ROOM</h3><button type="button" class="ol-ic" data-act="pubnew-close" aria-label="Close">×</button></div>' +
      '<label for="pn-title">ROOM NAME</label><input type="text" id="pn-title" maxlength="24" spellcheck="false" autocomplete="off">' +
      '<label for="pn-mode">MODE</label><select id="pn-mode"><option value="sandbox">CO-OP SANDBOX</option><option value="ffa">PVP — FREE FOR ALL</option><option value="team">PVP — TEAM BATTLE</option><option value="duel">PVP — DUEL 1V1</option>' + ids.map((i) => '<option value="m' + i + '">' + String(i).padStart(2, '0') + ' — ' + esc(missionTitle(i)) + '</option>').join('') + '</select>' +
      '<p class="v-note">Enemies in story missions run separately on each device; the sandbox shares them.</p>' +
      '<div class="pf-btns"><button type="button" class="ol-btn big" data-act="pubnew-go">CREATE</button><button type="button" class="ol-btn" data-act="pubnew-close">CANCEL</button></div></div>';
    el.hidden = false;
    const i = el.querySelector('#pn-title'); i.value = PF.get().name.slice(0, 16) + '\'s room';
    const sel = el.querySelector('#pn-mode'); sel.value = L.mode === 'mission' ? 'm' + L.mission : 'sandbox';
    try { i.focus({ preventScroll: true }); } catch (e) { /* ok */ }
  }
  async function pubNewGo() {
    const el = $('#ol-pubnew'); if (!el || !RM) return;
    const title = el.querySelector('#pn-title').value, mv = el.querySelector('#pn-mode').value;
    const pk = mv === 'ffa' || mv === 'team' || mv === 'duel' ? mv : '';
    const mode = pk ? (pk === 'ffa' ? 'ffa' : 'pvp') : mv === 'sandbox' ? 'sandbox' : 'mission', mission = mode === 'mission' ? Number(mv.slice(1)) : 1;
    if (pk && window.NexaPvp) L.pvp = NexaPvp.norm(Object.assign({}, L.pvp, { kind: pk }));
    if (mode === 'mission' && !validMission(mission)) return;
    el.hidden = true; closeJoin();
    if (NN.connected && !NN.isHost) NN.close();
    L.mode = mode; L.mission = mission;
    const r = await RM.hostRoom({ pub: true, title, mode, mission, max: pk ? NN.MAX_PLAYERS : undefined });
    if (!root) return;
    if (!r.ok) { toast(NN.text(r.err), 'bad'); return; }
    L.pubSession = true; L.roomLink = r.link;
    try { NN.voice.incoming(false); const c = $('#v-in'); if (c) c.checked = false; } catch (e) { /* ok */ }
    updPlay(); renderPublic(); updRoom(); toast('PUBLIC ROOM IS OPEN');
    setTab('play');
  }
  function quickStart() {
    if (!RM) return;
    if (needConsent('quick')) return;
    L.pubSession = true;
    try { NN.voice.incoming(false); const c = $('#v-in'); if (c) c.checked = false; } catch (e) { /* ok */ }
    joinUi('quick', '');
    L.t0 = Date.now(); NN.chat.clear(); renderLog(true);
    RM.quickPlay(L.mode === 'mission' ? 'mission' : 'sandbox', { mission: L.mission }).then((r) => { if (r && !r.ok) joinStage('error', r.err); });
  }

  // ------------------------------------------------------------------ эмоции (танцы) в лобби: колесо/кнопка, музыка EmoteCore, синхронизация с остальными игроками
  const EC = () => window.EmoteCore;
  const emoAvail = () => (EC() ? EC().tracks().filter(Boolean) : []);
  const emoOwned = (id) => { try { return !!(window.Toys && Toys.owned && Toys.owned(id)); } catch (e) { return false; } };
  const emoMusLvl = () => { const a = ctx.audio; const n = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d); return a && a.musicEnabled !== false ? Math.min(1, n(a.musicVolume, 1) * n(a.masterVolume, 0.55) * 0.95 * 1.35) : 0; };
  const DN = { ac: null, music: {}, list: {}, savedMusic: null, active: 0 };      // list: slot -> {id, tr, t, fig, pose, tmp, self}
  function dnAC() {
    if (DN.ac && DN.ac.state !== 'closed') { if (DN.ac.state === 'suspended') { try { DN.ac.resume(); } catch (e) { /* ok */ } } return DN.ac; }
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return null;
    try { DN.ac = new A(); } catch (e) { DN.ac = null; }
    return DN.ac;
  }
  function dnMusicOn(d) {
    const e = EC(); if (!e) return;
    if (DN.music[d.id]) { DN.music[d.id].users += 1; return; }
    const ac = dnAC(); if (!ac) return;
    try {
      const M = e.makeMusic(ac, () => emoMusLvl(), d.tr); M.target = 1; M.play(0);
      DN.music[d.id] = { M, users: 1 };
      if (ctx.audio && ctx.audio.desiredMusic && !DN.savedMusic) { DN.savedMusic = ctx.audio.desiredMusic; try { ctx.audio.stopMusic(); } catch (er) { /* ok */ } }
    } catch (er) { /* музыка не критична */ }
  }
  function dnMusicOff(d) {
    const m = DN.music[d.id]; if (!m) return;
    m.users -= 1;
    if (m.users <= 0) { try { m.M.stop(); } catch (e) { /* ok */ } delete DN.music[d.id]; }
    if (!Object.keys(DN.music).length && DN.savedMusic && ctx.audio) { try { ctx.audio.playMusic(DN.savedMusic); } catch (e) { /* ok */ } DN.savedMusic = null; }
  }
  const dispIndex = (slot) => party().findIndex((q) => q.slot === slot);
  const IN_T = 0.8, OUT_T = 0.6;
  DN.fade = [];
  function flatSkin(g) {      // тот же тёмный цвет, что у стикмена в стойке: цвет не меняется при танце
    const mats = [];
    g.traverse((o) => { if (o.isMesh && o.material) { const m = o.material.clone(); if (m.color) m.color.setHex(0x0e0f12); if (m.emissive) m.emissive.setHex(0x16181d); m.map = null; o.material = m; mats.push(m); } });
    return mats;
  }
  function mkFig(d) {
    if (!ST.ready || d.fig || d.dead) return;
    const e = EC(); if (!e || dispIndex(d.slot) < 0) return;
    d.fig = e.makeFigure(THREE, { cast: false }); d.mats = flatSkin(d.fig.group); ST.scene.add(d.fig.group);
    e.idlePose(ST.host.time, d.pose, d.tr); d.first = new Float32Array(45); e.sampleDance(0, d.first, d.tr); d.ph = 'in'; d.bl = 0;
    d.fig.update(d.pose, null);
  }
  function dropFig(x) { try { x.fig.dispose(); } catch (e) { /* ok */ } (x.mats || []).forEach((m) => { try { m.dispose(); } catch (e) { /* ok */ } }); }
  function danceStart(slot, id, self) {
    const e = EC(); if (!e) return false;
    const tr = e.track(String(id || '').slice(0, 20)); if (!tr) return false;
    danceStop(slot, false);
    const d = DN.list[slot] = { id: tr.id, tr, t: 0, bl: 0, fig: null, pose: new Float32Array(45), tmp: new Float32Array(45), self: !!self, slot, dead: false, ready: false, music: false, ph: '' };
    L.dances[slot] = tr.id; DN.active += 1;
    tr.load().then((ok) => {
      if (d.dead) return;
      if (!ok && !tr.ready()) { danceStop(slot, !!d.self); return; }
      d.ready = true; mkFig(d);
    });
    if (root) { updStage(); updEmoBtn(); }
    return true;
  }
  function danceStop(slot, notify) {
    const d = DN.list[slot]; if (!d) return;
    d.dead = true; delete DN.list[slot]; delete L.dances[slot]; DN.active = Math.max(0, DN.active - 1);
    if (d.fig) DN.fade.push({ fig: d.fig, mats: d.mats, pose: Float32Array.from(d.pose), slot, t: 0, idx: dispIndex(slot) });      // плавно вернуться в стойку
    d.fig = null;
    if (d.music) dnMusicOff(d);
    if (notify && d.self && NN.connected) NN.sendAction({ type: 'cev', k: 'emoteoff' });
    if (root) { updStage(); updEmoBtn(); }
  }
  function danceStopLocal(notify) { danceStop(mySlot(), notify !== false); closeEmo(); }
  function danceStopAll() {
    Object.keys(DN.list).map(Number).forEach((s) => danceStop(s, false));
    DN.fade.forEach(dropFig); DN.fade = [];
    Object.keys(DN.music).forEach((k) => { try { DN.music[k].M.stop(); } catch (e) { /* ok */ } delete DN.music[k]; });
    if (DN.savedMusic && ctx.audio) { try { ctx.audio.playMusic(DN.savedMusic); } catch (e) { /* ok */ } DN.savedMusic = null; }
  }
  function danceMine(id) {
    const slot = mySlot();
    if (DN.list[slot] && DN.list[slot].id === id) { danceStopLocal(true); return; }
    if (!danceStart(slot, id, true)) return;
    try { PF.count('emotes'); } catch (e) { /* ok */ }
    if (NN.connected) NN.sendAction({ type: 'cev', k: 'emote', id });
    closeEmo();
  }
  function updEmoBtn() {
    const b = $('#ol-emob'); if (!b) return;
    const on = !!DN.list[mySlot()];
    b.classList.toggle('on', on); $('#ol-emob-t').textContent = on ? 'STOP' : 'EMOTES';
  }
  function openEmo() {
    const el = $('#ol-emo'); if (!el) return;
    if (DN.list[mySlot()]) { danceStopLocal(true); return; }
    const tracks = emoAvail();
    const box = document.createElement('div'); box.className = 'pk-box em-box';
    const hd = document.createElement('div'); hd.className = 'pk-h'; const h3 = document.createElement('h3'); h3.textContent = 'EMOTES'; hd.appendChild(h3);
    const x = document.createElement('button'); x.type = 'button'; x.className = 'ol-ic'; x.dataset.act = 'emo-close'; x.setAttribute('aria-label', 'Close'); x.textContent = '×'; hd.appendChild(x); box.appendChild(hd);
    const grid = document.createElement('div'); grid.className = 'em-grid';
    let any = false;
    tracks.forEach((tr) => {
      const own = emoOwned(tr.id); any = any || own;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'em-b' + (own ? '' : ' lock'); b.dataset.act = 'emote'; b.dataset.v = tr.id; b.disabled = !own;
      let ico = ''; try { ico = window.Emote && Emote.thumbSvg ? Emote.thumbSvg(tr.id) : ''; } catch (e) { ico = ''; }
      b.innerHTML = ico; const nm = document.createElement('b'); nm.setAttribute('translate', 'no'); nm.textContent = tr.name; b.appendChild(nm);
      const sm = document.createElement('small'); sm.textContent = own ? 'DANCE' : 'LOCKED'; b.appendChild(sm);
      grid.appendChild(b);
    });
    box.appendChild(grid);
    const p = document.createElement('p'); p.className = 'v-note'; p.textContent = any ? 'Everyone in the room sees your dance and hears the music. Press B or Esc to stop.' : 'Buy emotes in the shop (TOYS) to dance here.'; box.appendChild(p);
    el.textContent = ''; el.appendChild(box); el.hidden = false;
    const f = el.querySelector('.em-b:not([disabled])') || x; try { f.focus({ preventScroll: true }); } catch (e) { /* ok */ }
  }
  function closeEmo() { const el = $('#ol-emo'); if (el) el.hidden = true; }
  // входящее: cev emote/emoteoff от игрока p.from
  function onCev(p) {
    if (!root || (p.k !== 'emote' && p.k !== 'emoteoff')) return;
    const slot = p.from | 0; if (slot < 1 || slot === mySlot()) return;
    if (!NN.players.some((q) => q.slot === slot)) return;
    if (p.k === 'emote') danceStart(slot, String(p.id || '').slice(0, 20), false);
    else danceStop(slot, false);
  }
  // Хост: новому игроку показать, кто уже танцует (состояния других игроков Хост ретранслирует отдельным пакетом)
  function sendDances(to) {
    const list = Object.keys(L.dances).map(Number).map((s) => ({ s, id: L.dances[s] }));
    if (list.length && NN.isHost) NN.sendAction({ type: 'dances', list }, { to });
  }
  function onDances(p) {
    if (!root || !Array.isArray(p.list)) return;
    p.list.slice(0, MAXP).forEach((q) => { const s = q && q.s | 0; if (s > 0 && s !== mySlot() && NN.players.some((x) => x.slot === s) && !DN.list[s]) danceStart(s, String(q.id || '').slice(0, 20), false); });
  }
  // любая клавиша (кроме модификаторов) прерывает свой танец; B — открыть/закрыть колесо
  function onKey(e) {
    if (!root || !root.isConnected) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (/^(Shift|Control|Alt|Meta|Tab|CapsLock)/.test(e.code) || /^F\d/.test(e.code)) return;
    if (DN.list[mySlot()]) { e.preventDefault(); e.stopPropagation(); danceStopLocal(true); return; }
    if (e.code === 'KeyB' && !e.repeat) { const el = $('#ol-emo'); if (el && !el.hidden) closeEmo(); else if (!L.pick) openEmo(); }
  }

  // ------------------------------------------------------------------ режим «этот компьютер» (вкладки одного браузера)
  function localHost() {
    const nt = $('#lc-note'); if (!NN.local) { note('lc-note', 'LOCAL_NO', 'bad'); return; }
    NN.local.host(); L.t0 = Date.now(); NN.chat.clear(); renderLog(true);
    nt.className = 'v-note ok'; nt.textContent = 'Room open on this computer. In another tab of this browser press "JOIN A ROOM HERE".';
  }
  function localJoin() {
    const nt = $('#lc-note'); if (!NN.local) { note('lc-note', 'LOCAL_NO', 'bad'); return; }
    L.t0 = Date.now(); NN.chat.clear(); renderLog(true);
    nt.className = 'v-note'; nt.textContent = 'Looking for a room in the other tabs…';
    NN.local.join().then((ok) => { if (!root) return; if (!ok) { nt.className = 'v-note bad'; nt.textContent = NN.text('LOCAL_NONE'); } else { nt.className = 'v-note ok'; nt.textContent = 'Connecting…'; } });
  }

  // ------------------------------------------------------------------ обработка кликов
  function onClick(e) {
    const a = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!a || !root || !root.contains(a) || a.disabled) return;
    const act = a.dataset.act, v = a.dataset.v;
    if (act !== 'copy' && act !== 'copy-code') sfx('mouse');
    if (window.NexaNet && NN.voice && NN.voice.unlock) NN.voice.unlock();
    switch (act) {
      case 'tab': setTab(v); break;
      case 'chat-toggle': chatToggle(); break;
      case 'ff': L.ff = v === '1'; sendLobby(); updPlay(); openPick(); break;
      case 'ffm': L.ffm = +v || 1; sendLobby(); updPlay(); openPick(); break;
      case 'vote': { const m = v; if (!window.NexaPvp || NexaPvp.POOL.indexOf(m) < 0) break; L.votes = L.votes || {}; if (NN.isHost || !NN.connected) { L.votes[1] = m; sendLobby(); } else { L.votes[NN.slot] = m; NN.sendAction({ type: 'mapvote', m }); } updPlay(); break; }
      case 'trade': if (!TRADES_ENABLED) break; openTrade(Number(a.dataset.slot)); break;
      case 'trade-yes': if (!TRADES_ENABLED) break; tradeConfirm(); break;
      case 'trade-no': { const el = $('#ol-trade'); if (el) el.hidden = true; L.tradeAsk = null; break; }
      case 'settings': { const b = document.getElementById('open-settings'); if (b) b.click(); break; }
      case 'pick': openPick(); break;
      case 'pick-close': closePick(); break;
      case 'mode': setMode(v); closePick(); break;
      case 'mission': setMode('mission', Number(v)); closePick(); break;
      case 'play': doPlay(); break;
      case 'mic': {
        const s = NN.voice.state;
        if (!s.mic) NN.voice.enable().then(() => updVoice()); else NN.voice.setMuted(!s.muted);
        break;
      }
      case 'host-create': hostCreate(); break;
      case 'host-connect': hostConnect(); break;
      case 'guest-answer': guestAnswer(false); break;
      case 'manual-retry': manualRetry(); break;
      case 'local-host': localHost(); break;
      case 'local-join': localJoin(); break;
      case 'copy': copyFrom($('#' + v), 'COPIED'); break;
      case 'net-report': copyReport(); break;
      case 'rules-open': setTab('rules'); break;
      case 'copy-code': { const l = $('#h-link'); if (l && l.value) { const t = document.createElement('textarea'); t.value = NN.offerCode; t.style.cssText = 'position:fixed;left:-999px;top:0'; document.body.appendChild(t); copyFrom(t, 'COPIED'); setTimeout(() => t.remove(), 300); } break; }
      case 'disconnect': if (RM) { RM.stopHost(); RM.stopJoin(); } if (NN.local) NN.local.stop(); NN.close(); L.ready = false; L.readyMap = {}; L.readyList = []; L.roomLink = ''; $('#h-out').hidden = true; $('#g-out').hidden = true; L.t0 = 0; danceStopAll(); refreshAll(); break;
      case 'name': {
        const r = PF.setName($('#pf-name').value);
        const nt = $('#pf-note'); nt.className = 'v-note ' + (r.ok ? 'ok' : 'bad'); nt.textContent = r.ok ? PF.text('NAME_OK') : PF.text(r.err);
        if (r.ok) { updTop(); updProfile(true); updStage(); if (NN.connected) { NN.sendAction({ type: 'hello', info: NN.localInfo() }); profileTick(true); } }
        break;
      }
      case 'color': PF.setColor(v); updProfile(true); updStage(); stColors(); if (NN.connected) { NN.sendAction({ type: 'hello', info: NN.localInfo() }); profileTick(true); } break;
      case 'pf-reset': {
        const b = $('#pf-reset');
        if (b.dataset.arm) { delete b.dataset.arm; b.textContent = 'RESET STATS'; PF.reset(); updTop(); updProfile(true); }
        else { b.dataset.arm = '1'; b.textContent = 'TAP AGAIN TO CONFIRM'; setTimeout(() => { if (b.isConnected && b.dataset.arm) { delete b.dataset.arm; b.textContent = 'RESET STATS'; } }, 3500); }
        break;
      }
      // ---- карточки профилей
      case 'card': { const s = Number(a.dataset.slot); if (s > 0) openCard(s); break; }
      case 'card-close': closeCard(); break;
      case 'mute': { const s = Number(a.dataset.slot); NN.setMuted(s, !NN.isMuted(s)); updRoster(); if (L.cards.open === s) renderCard(s); break; }
      case 'report': { const s = Number(a.dataset.slot); NN.report(s); { const pk = window.NexaAvatar ? NexaAvatar.pkOf(pidOf(s)) : ''; if (pk && window.NexaSocial && NexaSocial.reportPlayer) NexaSocial.reportPlayer(pk); } toast('PLAYER HIDDEN AND BLOCKED'); updRoster(); renderCard(s); break; }
      case 'av-hide': { const s = Number(a.dataset.slot), k = pidOf(s); if (k && window.NexaAvatar) { const on = !NexaAvatar.isHidden(k), pk = NexaAvatar.pkOf(k); NexaAvatar.hide(k, on); if (on && pk && window.NexaSocial && NexaSocial.reportAvatar) NexaSocial.reportAvatar(pk); } break; }
      case 'kick': { const s = Number(a.dataset.slot); NN.kick(s); closeCard(); break; }
      // ---- серверы и комнаты
      case 'srv-probe': srvProbe(); break;
      case 'room-create': roomCreate(); break;
      case 'room-close': if (RM) RM.stopHost(); L.roomLink = ''; updRoom(); break;
      case 'pub-refresh': if (needConsent('refresh')) break; if (RM) { RM.gossip.start().then(() => { RM.gossip.refresh(); renderPublic(); }); } break;
      case 'pub-join': { if (needConsent('join:' + a.dataset.rid)) break; closeCard(); NN.setSpectator(false); if (NN.connected) NN.close(); startJoin(a.dataset.rid, 'join', true); break; }
      case 'pub-watch': { if (needConsent('join:' + a.dataset.rid)) break; closeCard(); if (NN.connected) NN.close(); NN.setSpectator(true); startJoin(a.dataset.rid, 'join', true); break; }
      case 'pub-card': {
        const r = RM.gossip.rooms().find((x) => x.rid === a.dataset.rid) || (RM.hosting && RM.adOf());
        if (r) { const ex = { host: r.host, col: r.col, lv: r.lv, rid: r.rid }; openCard(0, ex); RM.gossip.requestProfile(r.rid).then((pf) => { if (pf && L.cards.extra && L.cards.extra.rid === r.rid) { L.cards.extra.pf = pf; renderCard(0); } }); }
        break;
      }
      case 'pub-new': if (needConsent('new')) break; closeJoin(); pubNewModal(); break;
      case 'pubnew-close': { const el = $('#ol-pubnew'); if (el) el.hidden = true; break; }
      case 'pubnew-go': pubNewGo(); break;
      case 'quick': quickStart(); break;
      case 'pr-create': case 'pr-join': {
        const name = RM ? RM.roomName($('#pr-name').value) : '';
        if (!name) { note('pr-note', 'ROOM_NAME_BAD', 'bad'); break; }
        note('pr-note', '');
        if (!RM.servers.on) { note('pr-note', 'SERVERS_OFF', 'bad'); break; }
        if (act === 'pr-create') { RM.hostRoom({ id: name }).then((r) => { if (!r.ok) { note('pr-note', r.err, 'bad'); return; } L.pubSession = true; L.roomLink = r.link; const nt = $('#pr-note'); nt.className = 'v-note ok'; nt.textContent = 'Room "' + name + '" is open. Friends join with the same name.'; updRoom(); }); }
        else { if (NN.connected) NN.close(); startJoin(name, 'join', true); }
        break;
      }
      case 'consent-yes': { RM.consent(true); const el = $('#ol-consent'); if (el) el.hidden = true; const n = L.consentNext || ''; L.consentNext = ''; enterPublic(); if (n === 'quick') quickStart(); else if (n === 'ffa') qmReady(); else if (n === 'new') pubNewModal(); else if (n === 'refresh') { RM.gossip.start().then(() => RM.gossip.refresh()); } else if (n.indexOf('join:') === 0) { if (NN.connected) NN.close(); startJoin(n.slice(5), 'join', true); } break; }
      case 'consent-no': { const el = $('#ol-consent'); if (el) el.hidden = true; L.consentNext = ''; break; }
      case 'join-cancel': if (RM) { RM.stopJoin(); RM.stopQuick(); } if (NN.state !== 'open') NN.close(); closeJoin(); break;
      case 'join-retry': if (L.joinId) startJoin(L.joinId, L.joinKind || 'join', L.pubSession); break;
      case 'join-manual': if (RM) { RM.stopJoin(); RM.stopQuick(); } closeJoin(); setTab('connect'); break;
      // ---- эмоции
      case 'emotes': openEmo(); break;
      case 'emo-close': closeEmo(); break;
      case 'emote': danceMine(v); break;
      default: break;
    }
  }

  function bind() {
    root.addEventListener('click', onClick);
    $('#ol-send').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = $('#ol-msg'), r = NN.chat.send(inp.value);
      const nt = $('#ol-chat-note');
      if (r.ok) { inp.value = ''; nt.textContent = ''; nt.className = 'v-note'; } else { nt.className = 'v-note bad'; nt.textContent = NN.text(r.err); }
    });
    $('#v-vol').addEventListener('input', (e) => NN.voice.setVolume(e.target.value / 100));
    $('#v-in').addEventListener('change', (e) => NN.voice.incoming(e.target.checked));
    $('#cn-lan').addEventListener('change', (e) => lanChanged(e.target.checked));
    $$('.srv-on').forEach((c) => c.addEventListener('change', (e) => { if (RM) RM.servers.setOn(e.target.checked); renderServers(); renderPublic(); updRoom(); }));
    $('#pf-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const b = root.querySelector('[data-act="name"]'); b && b.click(); } });
    ['#h-ans', '#g-in'].forEach((s) => $(s).addEventListener('paste', () => { const el = $(s); setTimeout(() => { if (!root) return; if (s === '#g-in' && el.value.trim() && /NX\d+O\./.test(el.value.replace(/\s+/g, ''))) guestAnswer(false); }, 30); }));
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { for (const id of ['#ol-card', '#ol-consent', '#ol-pubnew', '#ol-emo', '#ol-trade']) { const m = $(id); if (m && !m.hidden && !DN.list[mySlot()]) { e.stopPropagation(); m.hidden = true; return; } } if (L.pick) { e.stopPropagation(); closePick(); } } });
    root.addEventListener('pointermove', onPtr, { passive: true });
  }

  // ------------------------------------------------------------------ события сети
  function netHooks() {
    const updNat = () => { const el = $('#cn-nat'); if (!el) return; const k = NN.natType === 'symmetric' ? 'NAT_SYM' : NN.natType === 'blocked' ? 'NAT_BLOCKED' : ''; el.hidden = !k; if (k) el.textContent = NN.text(k); };
    NN.on('net:nat', updNat); setTimeout(updNat, 4500);
    NN.on('net:close', () => { if (!NN.isHost) NN.setSpectator(false); });
    NN.on('net:state', (s) => {
      if (s.state === 'creating' || s.state === 'answering') L.t0 = Date.now();
      if (s.state === 'open' || s.state === 'idle') { if (s.state === 'idle') L.t0 = 0; }
      if (s.state === 'open') { L.t0 = 0; sfx('notification'); }
      if (s.state === 'closed' || s.state === 'failed') { L.ready = false; L.readyMap = {}; L.readyList = []; L.t0 = 0; }
      if (!root) return;
      updStatus(); updPlay(); updVoice();
      if (s.text && (s.state === 'failed' || s.state === 'closed' || s.state === 'lost')) { toast(s.text, 'bad'); const hn = $('#h-note'), gn = $('#g-note'); [hn, gn].forEach((n) => { if (n && n.isConnected && s.state !== 'lost') { n.className = 'v-note bad'; n.textContent = s.text; } }); }
      if (s.state === 'failed' && (s.code === 'CONNECT_TIMEOUT' || s.code === 'ICE_FAILED')) showDiag(s.code);
      if (s.state === 'open' && s.prev !== 'open' && s.prev !== 'lost') { toast('FRIEND CONNECTED'); if (L.tab === 'connect') setTab('play'); }
    });
    NN.on('net:peer', (q) => {
      if (NN.isHost) { sendLobby(); sendDances(q.slot); if (!SIG.key[q.slot]) SIG.key[q.slot] = NN.util.rndHex(16); NN.sendAction({ type: 'tk', k: SIG.key[q.slot] }, { to: q.slot }); }
      sendProfile(q.slot);
      if (root) { updStage(); updPlay(); updStatus(); }
    });
    NN.on('net:roster', () => { if (root) { updStage(); updPlay(); updStatus(); } });
    if (window.NexaAvatar && !L.avSub) { L.avSub = true; NexaAvatar.on(() => { if (!root) return; updTop(); updStage(); updRoster(); updProfile(true); if (L.cards.open) renderCard(L.cards.open); }); }
    NN.on('net:left', (p) => {
      NN.chat.sys('FRIEND_LEFT', p.name); delete L.readyMap[p.slot]; danceStop(p.slot, false); delete PR[p.pid || ''];
      if (NN.isHost) sendLobby();
      if (root) { updStage(); updPlay(); updStatus(); toast(p.name + ' — ' + NN.text('PEER_LEFT')); }
    });
    NN.on('net:close', () => { if (QM.on && !QM.host) { QM.on = false; QM.state = ''; } if (NN.chat.history.length && !NN.isHost) NN.chat.sys('FRIEND_LEFT', 'HOST'); danceStopAll(); L.cd = 0; L.cdSpec = null; const el = $('#ol-cd'); if (el) el.hidden = true; });
    NN.on('net:chat', onChat);
    NN.on('net:voice', updVoice);
    NN.on('net:mute', () => { if (root) { updRoster(); updVoice(); } });
    NN.on('net:tick', updTimer);
    NN.on('net:rtt', updTimer);
    NN.on('lobby', (p) => {
      if (NN.isHost) return;
      L.mode = p.mode === 'ffa' && window.NexaPvp ? 'ffa' : p.mode === 'hl' ? 'hl' : p.mode === 'pvp' && window.NexaPvp ? 'pvp' : p.mode === 'mission' && validMission(p.mission) ? 'mission' : 'sandbox'; if (L.mode === 'mission') L.mission = p.mission | 0;
      if (L.mode === 'pvp' || L.mode === 'ffa') L.pvp = NexaPvp.norm(p.pvp);
      L.votes = p.votes && typeof p.votes === 'object' ? p.votes : {}; L.ff = p.ff !== 0; L.ffm = [0.25, 0.5, 1].indexOf(+p.ffm) >= 0 ? +p.ffm : 1;
      L.readyList = Array.isArray(p.ready) ? p.ready.map(Number).filter((n) => n >= 2 && n <= MAXP).slice(0, MAXP) : [];
      updPlay();
    });
    NN.on('mapvote', (p) => { if (!NN.isHost || !window.NexaPvp || NexaPvp.POOL.indexOf(p.m) < 0) return; const s = p.from | 0; if (s < 2) return; L.votes = L.votes || {}; L.votes[s] = p.m; sendLobby(); updPlay(); });
    NN.on('ready', (p) => {
      if (!NN.isHost) return;
      const s = p.from | 0; if (s < 2) return;
      L.readyMap[s] = !!p.on; sendLobby(); updPlay();
      const q = NN.players.find((x) => x.slot === s);
      if (root && q) toast(q.name + ' — ' + (p.on ? 'READY' : 'NOT READY'));
    });
    NN.on('net:roster', () => {   // поздний вход: песочница и миссия 48 (с текущего акта); остальные миссии — со следующего старта
      const co = window.NexaCoop && NexaCoop.session;
      if (!NN.isHost || !co || co.solo || co.gone || !co.ready || co.spec.mode === 'pvp' || !co.startSlots) return;
      if (!(co.spec.mode === 'sandbox' || (co.spec.mode === 'mission' && +co.spec.mission === 48))) return;
      NN.players.map((q) => q.slot).concat(NN.spectatorSlots).forEach((slot) => { const q = { slot }; if (!co.startSlots.has(q.slot)) { co.startSlots.add(q.slot); NN.sendAction({ type: 'start', mode: co.spec.mode, mission: co.spec.mission, seed: co.spec.seed, ff: co.ff ? 1 : 0, ffm: co.ffm, late: 1, act: co.act || '', stage: co.stage | 0 }, { to: q.slot }); } });
    });
    NN.on('start', (p) => {
      if (NN.isHost || L.cd) return;
      if (QM.on) { QM.on = false; QM.state = ''; }
      const mode = p.mode === 'hl' ? 'hl' : p.mode === 'pvp' && window.NexaPvp ? 'pvp' : p.mode === 'mission' && validMission(p.mission) ? 'mission' : 'sandbox';
      beginMatch({ mode, pvp: mode === 'pvp' ? NexaPvp.norm(p.pvp) : undefined, mission: mode === 'mission' ? p.mission | 0 : 1, seed: (p.seed >>> 0) || 1, role: 'guest', solo: false, spectator: NN.spectator ? 1 : 0, jump: p.late ? String(p.act || '').slice(0, 12) : '', stage: p.late ? p.stage | 0 : 0, ff: p.ff === 0 ? 0 : 1, ffm: +p.ffm || 1 }, 3);
    });
    tradeHooks();
    NN.on('profile', onProfile); NN.on('profile?', onProfileReq);
    NN.on('cev', onCev); NN.on('dances', onDances);
    if (RM) {
      RM.on('servers', () => { if (root) renderServers(); });
      RM.on('rooms', () => { if (root) renderPublic(); });
      RM.on('swarm', () => { if (root && L.tab === 'public') renderPublic(); });
      RM.on('incoming', () => { if (root) updStatus(); });
      RM.on('join', (j) => {
        if (!root || !L.joinUi) return;
        if (j.stage === 'open') { joinStage('open'); setTab('play'); toast('FRIEND CONNECTED'); return; }
        L.joinUi.attempt = j.attempt; L.joinUi.of = j.of;
        joinStage(j.stage, j.err);
      });
      RM.on('quick', (q) => {
        if (!root || !L.joinUi) return;
        if (q.stage === 'paired') { L.joinUi.stage = 'paired'; renderJoin(); }
        else if (q.stage === 'hosting') { L.joinUi.stage = 'hosting'; renderJoin(); L.roomLink = RM.roomLink(q.id); }
        else if (q.stage === 'timeout' || q.stage === 'unavailable') joinStage(q.stage, q.err);
      });
    }
  }

  // ------------------------------------------------------------------ 3D-сцена
  const ST = { on: false, building: 0, ready: false, canvas: null, r: null, scene: null, cam: null, host: null, figs: [], raf: 0, last: 0, tok: 0, ptr: { x: 0, y: 0, sx: 0, sy: 0 }, w: 0, h: 0, plat: [], lost: false };
  // x, z, радиус: [0] — главный игрок (центр спереди), далее дугой: справа, слева, дальние справа/слева, центр сзади (кольца и свечение — только у платформ)
  const PLAT = [[0, 1.25, 0.95], [1.7, -0.55, 0.8], [-1.7, -0.55, 0.8], [3.15, -1.55, 0.7], [-3.15, -1.55, 0.7], [0, -2.5, 0.7]];
  const POSES = ['cross', 'hang', 'cross', 'hang', 'cross', 'hang'];     // строгая стойка: руки скрещены на груди или строго по швам
  const yawOf = (pi) => (pi === 0 ? -0.12 : -PLAT[pi][0] * 0.32);
  function onPtr(e) { if (e.isPrimary === false) return; ST.ptr.x = clamp(e.clientX / Math.max(1, innerWidth) * 2 - 1, -1, 1); ST.ptr.y = -clamp(e.clientY / Math.max(1, innerHeight) * 2 - 1, -1, 1); }
  const want3d = () => !/[?&]nolobby3d(?![A-Za-z0-9_])/.test(location.search) && !!(window.Missions && Missions._core && Missions._core.loadThree && Missions._core.geo && Missions._core.Run && Missions._core.Run.prototype.npc) &&
    !(isTouch() && (function () { try { return Missions.getQuality() === 'LOW'; } catch (e) { return false; } }()));

  function glowTex(T, inner, outer) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, inner); gr.addColorStop(0.55, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new T.CanvasTexture(c); return t;
  }
  async function stBuild() {
    const tok = ++ST.tok;
    ST.building = 1;
    let ok = false;
    try {
      await Missions._core.loadThree();
      if (tok !== ST.tok || !ST.on || !window.THREE) return;
      const T = THREE, C = Missions._core, low = (function () { try { return Missions.getQuality() === 'LOW'; } catch (e) { return false; } }());
      const canvas = document.createElement('canvas'); canvas.className = 'ol-cv';
      const r = new T.WebGLRenderer({ canvas, antialias: !low, alpha: true, powerPreference: 'default' });
      r.setClearColor(0x000000, 0);
      const scene = new T.Scene(), cam = new T.PerspectiveCamera(30, 1, 0.1, 60);
      const keep = [];
      const hostObj = Object.create(C.Run.prototype);
      hostObj.q = { parts: low ? 8 : 12, shadows: false }; hostObj.scene = scene; hostObj.npcs = []; hostObj.time = 0;
      // платформы: тёмный диск, кольцо и ореол (у платформ они остаются); у главной — красный свет снизу
      const plats = [];
      PLAT.forEach((p, i) => {
        const g = new T.Group(); g.position.set(p[0], 0, p[1]);
        const disc = new T.Mesh(new T.CylinderGeometry(p[2], p[2] * 1.04, 0.09, 40), new T.MeshLambertMaterial({ color: 0x1c1d21, emissive: 0x060607 })); disc.position.y = 0.045; g.add(disc);
        const ringMat = new T.MeshBasicMaterial({ color: i === 0 ? 0xff4a3d : 0x3a3d44, transparent: true, opacity: i === 0 ? 1 : 0.7 });
        const ring = new T.Mesh(new T.TorusGeometry(p[2] * 0.98, 0.028, 8, 56), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.092; g.add(ring);
        const glowMat = new T.MeshBasicMaterial({ map: glowTex(T, i === 0 ? 'rgba(255,90,70,.75)' : 'rgba(120,130,150,.25)', i === 0 ? 'rgba(255,60,50,.22)' : 'rgba(80,90,110,.08)'), transparent: true, depthWrite: false, blending: T.AdditiveBlending });
        const glow = new T.Mesh(new T.PlaneGeometry(p[2] * 3.1, p[2] * 3.1), glowMat); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.1; g.add(glow);
        scene.add(g); plats.push({ g, ringMat, glowMat, disc, ring, glow }); keep.push(disc.geometry, disc.material, ring.geometry, ringMat, glow.geometry, glowMat, glowMat.map);
      });
      const floor = new T.Mesh(new T.PlaneGeometry(24, 18), new T.MeshBasicMaterial({ map: glowTex(T, 'rgba(18,20,26,.95)', 'rgba(10,11,14,.55)'), transparent: true, depthWrite: false }));
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.002, -1); scene.add(floor); keep.push(floor.geometry, floor.material, floor.material.map);
      scene.add(new T.AmbientLight(0xb4b4b4, 0.85));
      const key = new T.DirectionalLight(0xffffff, 0.95); key.position.set(2.5, 5, 6); scene.add(key);
      const rim = new T.DirectionalLight(0xc8c8c8, 0.7); rim.position.set(-3, 3, -5); scene.add(rim);
      const pl = new T.PointLight(0xffffff, 0.35, 5, 2); pl.position.set(0, 0.5, PLAT[0][1] + 0.4); scene.add(pl);
      // стикмены игры: тот же риг, что у врагов (actors.js), чистый тёмный силуэт: без колец, обводок и свечения
      const mkF = (pi) => {
        const yaw = yawOf(pi);
        const n = C.Run.prototype.npc.call(hostObj, PLAT[pi][0], PLAT[pi][1], yaw);
        n.yaw = yaw; n.g.rotation.y = yaw; n.g.visible = false;
        return { n, pi, yaw };
      };
      const figs = PLAT.map((_, i) => mkF(i));
      hostObj.agm.body.color.setHex(0x0e0f12); hostObj.agm.body.emissive.setHex(0x16181d);
      Object.keys(hostObj.ag).forEach((k) => keep.push(hostObj.ag[k]));
      keep.push(hostObj.agm.body, hostObj.agm.gear, hostObj.agm.gun, hostObj.agm.flash);
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ST.lost = true; stDispose(); });
      Object.assign(ST, { canvas, r, scene, cam, host: hostObj, figs, plats, keep, ready: true, pl, lost: false });
      ok = true;
      stAttach(); stResize(); stSync(); stColors();
      Object.keys(DN.list).forEach((s) => { const d = DN.list[s]; if (d.ready) mkFig(d); });
      if (!ST.raf) ST.raf = requestAnimationFrame(stTick);
    } catch (err) { console.warn('[online-lobby 3d]', err); }
    finally { ST.building = 0; if (!ok) ST.ready = false; }
  }
  function stAttach() {
    const stage = $('#ol-stage');
    if (!stage || !ST.canvas) return;
    if (ST.canvas.parentNode !== stage) stage.insertBefore(ST.canvas, stage.firstChild);
    root.classList.add('is3d');
  }
  function stSync() {
    if (!ST.ready) return;
    const list = party(), n = list.length;
    ST.figs.forEach((f, i) => { f.n.g.visible = i < n && !(DN.list[list[i].slot] && DN.list[list[i].slot].fig); });
    ST.plats.forEach((p, i) => { if (i === 0) return; const used = i < n; p.ringMat.color.setHex(used ? 0xff9a3d : 0x3a3d44); p.ringMat.opacity = used ? 1 : 0.7; p.glowMat.opacity = used ? 1 : 0.5; });
  }
  function stColors() { /* цвет игрока — только в нике и аватаре; у фигуры колец и свечения нет */ }
  function stResize() {
    if (!ST.ready || !root) return;
    const stage = $('#ol-stage'); if (!stage) return;
    const w = Math.max(2, stage.clientWidth), h = Math.max(2, stage.clientHeight);
    if (w === ST.w && h === ST.h) return;
    ST.w = w; ST.h = h;
    const low = (function () { try { return Missions.getQuality() === 'LOW'; } catch (e) { return false; } }());
    ST.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 1.5));
    ST.r.setSize(w, h, false);
    ST.cam.aspect = w / h;
    const k = Math.max(1, 1.7 / (w / h));
    ST.k = k;
    ST.cam.updateProjectionMatrix();
    layoutTags();
  }
  // подписи над головами: проекция 3D-точек (или CSS-проценты в фолбэке)
  function layoutTags() {
    if (!root) return;
    const stage = $('#ol-stage'); if (!stage) return;
    if (ST.ready && ST.cam && ST.w) {
      const T = THREE, v = new T.Vector3();
      PLAT.forEach((pp, pi) => {
        v.set(pp[0], 2.1, pp[1]).project(ST.cam);
        const t = $('.ol-tag.t' + pi); if (!t) return;
        t.style.left = ((v.x * 0.5 + 0.5) * ST.w).toFixed(1) + 'px'; t.style.top = Math.max(92, (-v.y * 0.5 + 0.5) * ST.h) + 'px';
      });
      const pi = Math.min(party().length, MAXP - 1);
      v.set(PLAT[pi][0], 0, PLAT[pi][1]).project(ST.cam);
      const inv = $('.ol-invite'); if (inv) { inv.style.left = ((v.x * 0.5 + 0.5) * ST.w).toFixed(1) + 'px'; inv.style.top = ((-v.y * 0.5 + 0.5) * ST.h - 70).toFixed(1) + 'px'; }
    } else {
      // CSS-фолбэк: те же платформы дугой, проценты от размера сцены
      FB.forEach((p, d) => {
        const pl = $('.ol-plat.p' + d), f = $('.ol-fig.f' + d), t = $('.ol-tag.t' + d);
        const h = p[2] * 2.1;
        if (pl) { pl.style.left = p[0] + '%'; pl.style.top = p[1] + '%'; pl.style.width = p[2] + '%'; }
        if (f) { f.style.left = p[0] + '%'; f.style.bottom = (100 - p[1] + p[2] * 0.12) + '%'; f.style.height = h + '%'; }
        if (t) { t.style.left = p[0] + '%'; t.style.top = 'max(' + clamp(p[1] - h - 1.5, 9, 90) + '%, 92px)'; }
      });
      const inv = $('.ol-invite'); if (inv) { inv.style.left = FB[1][0] + '%'; inv.style.top = (FB[1][1] - 18) + '%'; }
    }
  }
  // позы: руки скрещены на груди / за спиной / вдоль тела; лёгкое дыхание; голова чуть вверх
  function pose(fi, n, t, p) {
    const T = THREE, v = ST.v || (ST.v = [new T.Vector3(), new T.Vector3()]), H = ST.host, e = EC();
    const h = e && e.rightOnHip ? e.rightOnHip(t + fi * 3.7) : 1, br = Math.sin(t * 1.9 + fi);
    const mx = (a, b) => a + (b - a) * h;
    // правая рука на поясе (h = 1) или свободно опущена (h = 0); у левой наоборот. Локоть уходит в сторону.
    const g = 1 - h;
    v[1].set(mx(0.245, 0.2), mx(-0.08, 0.04), mx(0.03, 0.08));
    v[0].set(-(0.245 + (0.2 - 0.245) * g), -0.08 + 0.12 * g, 0.03 + 0.05 * g);
    H.solveArm(n.armL, n.elbL, [-0.2, 0.46 + br * 0.003, 0], v[0], -1);
    H.solveArm(n.armR, n.elbR, [0.2, 0.46 + br * 0.003, 0], v[1], 1);
    n.hips.rotation.set(0, 0.03, -0.035); n.hips.position.set(-0.018, 0.95 + br * 0.0015, 0);   // вес на левой ноге
    n.spine.rotation.set(0.01 + br * 0.006, -0.04, 0.03); n.spine.scale.setScalar(1 + br * 0.006);   // дыхание: грудь и плечи
    n.legL.rotation.set(0, 0, -0.045); n.legR.rotation.set(0.02, 0, 0.1);                       // ноги на ширине плеч
    n.kneeL.rotation.x = 0.02; n.kneeR.rotation.x = 0.14; n.footL.rotation.x = 0; n.footR.rotation.x = -0.1;
    n.head.rotation.set(-0.05 + br * 0.008, (fi === 0 ? p.sx * 0.35 : 0) - 0.3 + Math.sin(t * 0.4) * 0.03, 0.03);   // взгляд в камеру через плечо
  }
  function stTick(now) {
    ST.raf = 0;
    if (!ST.ready || !ST.on) return;
    ST.raf = requestAnimationFrame(stTick);
    if (document.hidden || !root || !root.isConnected || (window.Missions && Missions.current)) return;
    if (now - ST.last < 32) return;                         // ~30 кадров/с: лобби не должно греть телефон
    const dt = Math.min(0.1, (now - ST.last) / 1000); ST.last = now;
    stResize();
    const C = Missions._core, p = ST.ptr;
    p.sx += (p.x - p.sx) * 0.08; p.sy += (p.y - p.sy) * 0.08;
    ST.host.time += dt;
    const t = ST.host.time, k = ST.k || 1, list = party();
    ST.cam.position.set(p.sx * 0.35, 1.5 + p.sy * 0.12, PLAT[0][1] + 5.9 * k);
    ST.cam.lookAt(p.sx * 0.1, 0.92, 0.2);
    ST.figs.forEach((f, i) => {
      const q = list[i], dancing = q && ((DN.list[q.slot] && DN.list[q.slot].fig) || DN.fade.some((x) => x.slot === q.slot));
      f.n.g.visible = !!q && !dancing;
      if (!f.n.g.visible) return;
      C.Run.prototype.updateNpc.call(ST.host, f.n, dt);
      pose(i, f.n, t, p);
      f.n.g.rotation.y = f.yaw + 0.5 + (i === 0 ? p.sx * 0.12 : Math.sin(t * 0.3 + i) * 0.05);
    });
    // танцоры (EmoteCore): фигура-танцор на платформе игрока, музыка тикает здесь же
    const e = EC();
    Object.keys(DN.list).forEach((s) => {
      const d = DN.list[s], idx = dispIndex(d.slot);
      if (!d.fig && d.ready && idx >= 0) mkFig(d);
      const mu = DN.music[d.id];
      if (mu && d.music && mu.tickAt !== now) { mu.tickAt = now; mu.M.tick(dt); }
      if (!d.fig || idx < 0 || !e) return;
      const tr = d.tr;
      if (d.ph === 'in') {                                    // плавный переход из стойки в первый кадр танца, музыка стартует после него
        d.bl += dt; const k = e.smooth(Math.min(1, d.bl / IN_T));
        e.mixPose(e.idlePose(ST.host.time, d.tmp, tr), d.first, k, d.pose);
        if (k >= 1) { d.ph = 'play'; d.t = 0; dnMusicOn(d); d.music = true; const m2 = DN.music[d.id]; if (m2 && m2.users > 1 && m2.M.running && m2.M.running()) d.t = m2.M.time(); }
      } else {
        d.t += dt;
        if (mu && mu.M.running && mu.M.running()) { let err = mu.M.time() - (tr.loop ? d.t % tr.dur : d.t); if (tr.loop) err -= tr.dur * Math.round(err / tr.dur); if (Math.abs(err) > 0.25) d.t += err; else d.t += err * Math.min(1, dt * 4); }
        e.sampleDance(d.t, d.pose, tr);
        if (!tr.loop && d.t > tr.dur + 0.3) danceStop(d.slot, !!d.self);
      }
      d.fig.place(PLAT[idx][0], PLAT[idx][1], yawOf(idx)); d.fig.update(d.pose, null);
    });
    if (DN.fade.length && e) {                                // плавный возврат из танца в стойку
      DN.fade = DN.fade.filter((x) => {
        x.t += dt; const k = e.smooth(Math.min(1, x.t / OUT_T)), idx = dispIndex(x.slot);
        e.mixPose(x.pose, e.idlePose(ST.host.time, x.idle || (x.idle = new Float32Array(45)), null), k, x.tmp || (x.tmp = new Float32Array(45)));
        if (idx >= 0) x.fig.place(PLAT[idx][0], PLAT[idx][1], yawOf(idx)); x.fig.update(x.tmp, null);
        if (k >= 1) { dropFig(x); return false; }
        return true;
      });
    }
    const pulse = 0.82 + Math.sin(t * 2.2) * 0.18;
    ST.plats[0].ringMat.opacity = pulse; ST.plats[0].glowMat.opacity = 0.75 + pulse * 0.25; ST.pl.intensity = 0.7 + pulse * 0.4;
    for (let i = 1; i < list.length && i < ST.plats.length; i += 1) ST.plats[i].glowMat.opacity = 0.7 + Math.sin(t * 2 + i) * 0.2;
    ST.r.render(ST.scene, ST.cam);
  }
  function stDispose() {
    ST.tok += 1;
    if (ST.raf) { cancelAnimationFrame(ST.raf); ST.raf = 0; }
    Object.keys(DN.list).forEach((s) => { const d = DN.list[s]; if (d.fig) { dropFig(d); d.fig = null; } });
    DN.fade.forEach(dropFig); DN.fade = [];
    if (ST.ready) {
      try { ST.keep.forEach((o) => o && o.dispose && o.dispose()); ST.r.dispose(); ST.r.forceContextLoss && ST.r.forceContextLoss(); } catch (e) { /* ok */ }
      if (ST.canvas && ST.canvas.parentNode) ST.canvas.parentNode.removeChild(ST.canvas);
    }
    Object.assign(ST, { ready: false, canvas: null, r: null, scene: null, cam: null, host: null, figs: [], plats: [], keep: [], w: 0, h: 0 });
    if (root) root.classList.remove('is3d');
  }
  function stStart() {
    ST.on = true;
    if (ST.ready) { stAttach(); stResize(); stSync(); if (!ST.raf) ST.raf = requestAnimationFrame(stTick); return; }
    if (!ST.building && want3d()) stBuild();
  }
  function stStop() { ST.on = false; stDispose(); }

  // ------------------------------------------------------------------ жизненный цикл (вызывается из app.js)
  let sec = 0;
  function onSecond() {
    if (!root || !root.isConnected) return;
    updTimer(); cdTick(); sec += 1;
    if (QM.on) { if (QM.host && NN.connected) sendLobby(); if (QM.host && RM && RM.hosting && (NN.count >= QM_MAX() || (qmLeft() <= 0 && NN.count >= 2))) qmStart(); else updPlay(); }
    if (L.tab === 'trade') updKP();
    if (L.tab === 'profile' && Date.now() - L.lastStats > 2000) { L.lastStats = Date.now(); const s = $('#ol-stats'); if (s) s.innerHTML = PF.renderStats(); updTop(); }
    if (sec % 25 === 0) profileTick(false);
    if (L.tab === 'public' || L.tab === 'connect') { if (sec % 3 === 0) renderServers(); if (L.tab === 'public' && sec % 4 === 0) renderPublic(); }
    if (L.joinUi) renderJoin();
    if (RM && RM.hosting) { updRoom(); if (RM.hosting.pub) renderPublic(); }
  }
  const gate = (go) => { if (!window.NexaRules || NexaRules.accepted()) { go(); return; } NexaRules.ask((ok) => { if (ok) go(); }); };
  let inited = false;
  const api = {
    init(o) {
      Object.assign(ctx, o || {});
      if (inited) return; inited = true;
      netHooks();
      tickT = setInterval(onSecond, 1000);
      window.addEventListener('resize', () => { if (root) { stResize(); layoutTags(); updTab(); } });
      window.addEventListener('keydown', onKey, true);
      PF.onChange(() => { /* обновление идёт по таймеру */ });
    },
    render: shell,
    afterRender(on) {
      document.body.classList.toggle('in-online', !!on);
      if (!on) { if (root) { root = null; } danceStopAll(); stStop(); if (RM && !RM.hosting && !RM.joining) RM.servers.monitor.stop(); return; }
      root = document.getElementById('ol');
      if (!root) return;
      bind(); refreshAll();
      if (RM && RM.consented()) RM.servers.monitor.start();
      const pj = NN.pendingJoin(), pr = RM ? RM.pendingRoom() : '';
      if (pj && !L.joinFromUrl) { L.joinFromUrl = true; setTab('connect'); $('#g-in').value = pj; NN.clearJoinFromUrl(); guestAnswer(true); }
      else if (window.NexaSocial && NexaSocial.takeInvite && !L.joinFromUrl && (L._iv = NexaSocial.takeInvite())) { L.joinFromUrl = true; startJoin(L._iv, 'join', false); }
      else if (pr && !L.joinFromUrl) { L.joinFromUrl = true; RM.clearRoomFromUrl(); startJoin(pr, 'join', false); }
      stStart();
    },
    action(a) {
      if (a === 'online') { gate(() => { if (ctx.setView) ctx.setView('ONLINE'); if (ctx.render) ctx.render(); }); return true; }
      return false;
    },
    // после загрузки: ссылка с ?join= / ?room= сразу открывает онлайн-лобби
    boot() { if ((NN.pendingJoin() || (RM && RM.pendingRoom())) && !L.joinFromUrl && ctx.setView) gate(() => { ctx.setView('ONLINE'); ctx.render && ctx.render(); }); },
    join(rid) { if (root) startJoin(rid, 'join', false); else { this._pend = rid; this.action('online'); } },
    get active() { return !!root; },
    report: netReport,
    get state() { return L; },
    _st: ST, _dn: DN, _qm: { st: QM, start: () => qmStart() }
  };
  window.OnlineLobby = api;
}());
