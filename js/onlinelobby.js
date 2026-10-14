// NEXA/OS: «ОНЛАЙН ЛОББИ» — отдельный экран (view 'ONLINE') в духе лобби Fortnite: главный игрок на светящейся платформе по центру, напарник на платформе сзади,
// тусклые пустые платформы, слева внизу режим + серая кнопка «МИССИЯ / ПЕСОЧНИЦА С ДРУГОМ» и большая жёлтая «ИГРАТЬ», справа — уровень, внизу карусель карточек.
// Вкладки: PLAY / PROFILE / CHAT / CONNECTION / TELEGRAM. Подключение вручную (Offer/Answer) — вкладка CONNECTION, чат и голос — боковая панель.
// 3D-сцена: стикмены игры (Run.prototype.npc через THREE, загружается лениво); на слабых устройствах и без WebGL — лёгкий CSS-фолбэк. Стили — конец styles.css (блок «ОНЛАЙН ЛОББИ»).
(function () {
  'use strict';
  const NN = window.NexaNet, PF = window.NexaProfile;
  if (!NN || !PF) return;
  const TG = NN.TELEGRAM;
  const ctx = { audio: null, setView: null, render: null, startCoop: null };
  const L = { tab: 'play', mode: 'sandbox', mission: 1, peerReady: false, ready: false, cd: 0, cdT: 0, cdSpec: null, unread: 0, t0: 0, pick: false, notes: {}, joinFromUrl: false, lastStats: 0, copied: 0 };
  let root = null, tickT = 0;
  const $ = (s) => (root ? root.querySelector(s) : null);
  const $$ = (s) => (root ? Array.from(root.querySelectorAll(s)) : []);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isTouch = () => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };
  const sfx = (k) => { try { ctx.audio && ctx.audio.playSfx(k); } catch (e) { /* звук не критичен */ } };
  const missionsMap = () => (window.Missions && Missions._core && Missions._core.MISSIONS) || {};
  const missionTitle = (id) => { const m = missionsMap()[id]; return m && m.title ? m.title : 'MISSION'; };
  const validMission = (id) => { id = id | 0; return id >= 1 && id <= 47 && !!missionsMap()[id]; };

  // ------------------------------------------------------------------ разметка
  const IC = {
    back: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm8 4.5l-1.8.6a6.8 6.8 0 01-.7 1.6l.9 1.7-2 2-1.7-.9a6.8 6.8 0 01-1.6.7L12.5 21h-2.8l-.6-1.8a6.8 6.8 0 01-1.6-.7l-1.7.9-2-2 .9-1.7a6.8 6.8 0 01-.7-1.6L2 13v-2.8l1.8-.6a6.8 6.8 0 01.7-1.6l-.9-1.7 2-2 1.7.9a6.8 6.8 0 011.6-.7L9.5 2h2.8l.6 1.8a6.8 6.8 0 011.6.7l1.7-.9 2 2-.9 1.7a6.8 6.8 0 01.7 1.6L20 10.2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    mic: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    tg: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M21 4L3 11l5.5 2L10 19l3-3.5 5 3.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 13L17 7.5" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
    modes: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 8h16M4 16h16M8 4v16M16 4v16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    fig: '<svg viewBox="0 0 80 160" aria-hidden="true"><circle cx="40" cy="16" r="11" stroke-width="2"/><path d="M40 36v44M30 38l-8 28 14 6M50 38l8 28-14 6M35 82l-3 62M45 82l3 62" fill="none" stroke-width="11"/></svg>'
  };

  function shell() {
    const tabs = [['play', 'PLAY'], ['profile', 'PROFILE'], ['chat', 'CHAT'], ['connect', 'CONNECTION']];
    return '<div class="ol" id="ol" data-i18n="net" data-tab="play" data-state="idle">' +
      '<div class="ol-bg" aria-hidden="true"><i class="ol-moon"></i><i class="ol-haze"></i></div>' +
      '<div class="ol-stage" id="ol-stage"><div class="ol-floor"></div>' +
        [0, 1, 2].map((i) => '<div class="ol-plat p' + i + '"><i></i></div>').join('') +
        [0, 1].map((i) => '<div class="ol-fig f' + i + '" hidden>' + IC.fig + '</div>').join('') +
        [0, 1].map((i) => '<div class="ol-tag t' + i + '" hidden><span class="tg-l" translate="no"></span><span class="tg-n" translate="no"></span><span class="tg-s"></span></div>').join('') +
        '<button type="button" class="ol-invite" data-act="tab" data-v="connect" hidden><b>+</b><span>INVITE A FRIEND</span></button>' +
      '</div>' +
      '<header class="ol-top">' +
        '<button type="button" class="ol-ic" data-action="menu" aria-label="Back to NEXA/OS" title="Back to NEXA/OS">' + IC.back + '</button>' +
        '<nav class="ol-tabs" role="tablist">' + tabs.map((t) => '<button type="button" role="tab" class="ol-tab' + (t[0] === 'play' ? ' on' : '') + '" data-act="tab" data-v="' + t[0] + '" aria-selected="' + (t[0] === 'play') + '">' + t[1] + (t[0] === 'chat' ? '<i class="ol-dot" hidden></i>' : '') + '</button>').join('') +
          '<a class="ol-tab ol-tg" href="' + TG + '" target="_blank" rel="noopener noreferrer">' + IC.tg + '<span>TELEGRAM</span></a></nav>' +
        '<span class="ol-me"><span class="ol-mea"></span><span class="ol-men" translate="no"></span><span class="ol-mel"><small>LVL</small> <b translate="no"></b></span></span>' +
        '<button type="button" class="ol-ic" data-act="settings" aria-label="Settings" title="Settings">' + IC.gear + '</button>' +
      '</header>' +
      '<main class="ol-main">' + paneHTML() + '</main>' +
      '<div class="ol-cd" id="ol-cd" hidden><div><small>THE MATCH STARTS IN</small><b translate="no">3</b></div></div>' +
      '<div class="ol-toast" id="ol-toast" role="status" aria-live="polite"></div>' +
      '<div class="ol-modal" id="ol-pick" hidden role="dialog" aria-modal="true" aria-label="Choose a mode"></div>' +
    '</div>';
  }

  function paneHTML() {
    return '' +
    // -------- PLAY: левая нижняя панель, уровень, карточка соединения, карусель
    '<section class="ol-pane" data-pane="play">' +
      '<button type="button" class="ol-quest" data-act="tab" data-v="connect"><span class="q-t"><small>PARTY</small><b id="q-title">NOT CONNECTED</b></span><span class="q-s" id="q-sub">TAP TO CONNECT WITH A FRIEND</span><i class="q-bars"><u></u><u></u><u></u></i></button>' +
      '<div class="ol-bl"><h2 id="bl-mode">CO-OP SANDBOX</h2>' +
        '<button type="button" class="ol-grey" data-act="pick" id="bl-pick"><span class="g-i">' + IC.modes + '</span><span class="g-t"><b>MISSION / SANDBOX WITH A FRIEND</b><small id="bl-sub"></small></span></button>' +
        '<button type="button" class="ol-play" data-act="play" id="bl-play"><span id="bl-play-t">PLAY</span></button>' +
        '<p class="ol-hint" id="bl-hint"></p></div>' +
      '<div class="ol-br"><div class="ol-lvl" id="ol-lvl"><i></i><span><small>LVL</small><b translate="no">1</b></span></div><div class="ol-badge" id="ol-badge" title="Rank"><b translate="no">S</b><small>SUBJECT</small></div></div>' +
      '<div class="ol-car" id="ol-car">' +
        '<button type="button" class="ol-card c-sb on" data-act="mode" data-v="sandbox"><i class="cd-a">3</i><span><small>2 PLAYERS</small><b>CO-OP SANDBOX</b></span></button>' +
        '<button type="button" class="ol-card c-ms" data-act="pick"><i class="cd-a">47</i><span><small>STORY</small><b>CO-OP MISSIONS</b></span></button>' +
        '<button type="button" class="ol-card c-pf" data-act="tab" data-v="profile"><i class="cd-a">★</i><span><small>STATS</small><b>YOUR PROFILE</b></span></button>' +
        '<button type="button" class="ol-card c-cn" data-act="tab" data-v="connect"><i class="cd-a">⇄</i><span><small>NO SERVER</small><b>CONNECT WITH A FRIEND</b></span></button>' +
        '<a class="ol-card c-tg" href="' + TG + '" target="_blank" rel="noopener noreferrer"><i class="cd-a">' + IC.tg + '</i><span><small>OFFICIAL</small><b>TELEGRAM CHANNEL</b></span></a>' +
      '</div>' +
    '</section>' +
    // -------- чат + голос (одна панель: справа на PLAY, на всю вкладку на CHAT)
    '<aside class="ol-comm" id="ol-comm"><div class="ol-voice" id="ol-voice">' +
        '<div class="v-row"><button type="button" class="ol-btn v-mic" data-act="mic" id="v-mic">' + IC.mic + '<span id="v-mic-t">TURN MICROPHONE ON</span></button>' +
        '<label class="v-vol"><span>FRIEND VOLUME</span><input type="range" min="0" max="100" value="100" id="v-vol" aria-label="Friend volume"></label></div>' +
        '<div class="v-ind"><span class="v-who" id="v-me"><i></i><em>YOU</em></span><span class="v-who" id="v-peer"><i></i><em>FRIEND</em></span></div>' +
        '<p class="v-note" id="v-note"></p></div>' +
      '<div class="ol-chat"><div class="ol-log" id="ol-log" role="log" aria-live="polite"></div>' +
        '<form class="ol-send" id="ol-send" autocomplete="off"><input type="text" id="ol-msg" maxlength="200" placeholder="Type a message…" aria-label="Chat message" enterkeyhint="send"><button type="submit" class="ol-btn">SEND</button></form>' +
        '<p class="v-note" id="ol-chat-note"></p>' +
        '<a class="ol-tglink" href="' + TG + '" target="_blank" rel="noopener noreferrer">' + IC.tg + '<span>OFFICIAL TELEGRAM CHANNEL</span></a></div></aside>' +
    // -------- PROFILE
    '<section class="ol-pane ol-sheet" data-pane="profile"><div class="sh-in">' +
      '<div class="pf-head"><span id="pf-av"></span><div class="pf-id"><label for="pf-name">NICKNAME</label><div class="pf-nm"><input type="text" id="pf-name" maxlength="16" spellcheck="false" autocomplete="off" aria-label="Nickname"><button type="button" class="ol-btn" data-act="name">SAVE</button></div><p class="v-note" id="pf-note"></p></div>' +
        '<div class="pf-lv"><div class="pf-lvl"><small>LVL</small><b id="pf-lv" translate="no">1</b></div><div class="pf-xp"><span id="pf-rank">SUBJECT</span><div class="pf-bar"><i id="pf-bari"></i></div><em translate="no" id="pf-xpt"></em></div></div></div>' +
      '<div class="pf-sw" id="pf-sw" role="group" aria-label="Color">' + PF.COLORS.map((c, i) => '<button type="button" class="pf-c" data-act="color" data-v="' + c + '" style="--c:' + c + '" aria-label="' + COLOR_NAMES[i] + '" title="' + COLOR_NAMES[i] + '"></button>').join('') + '</div>' +
      '<div id="ol-stats"></div>' +
      '<details class="pf-io"><summary>EXPORT / IMPORT PROFILE</summary><textarea id="pf-json" rows="4" spellcheck="false" aria-label="Profile JSON" placeholder="Profile JSON"></textarea>' +
        '<div class="pf-btns"><button type="button" class="ol-btn" data-act="pf-export">EXPORT</button><button type="button" class="ol-btn" data-act="pf-import">IMPORT</button><button type="button" class="ol-btn danger" data-act="pf-reset" id="pf-reset">RESET STATS</button></div><p class="v-note" id="pf-io-note"></p></details>' +
    '</div></section>' +
    // -------- CONNECTION
    '<section class="ol-pane ol-sheet" data-pane="connect"><div class="sh-in">' +
      '<ol class="cn-steps" id="cn-steps"><li>INVITE</li><li>ANSWER</li><li>LINK</li><li>PLAY</li></ol>' +
      '<div class="cn-bar"><b id="cn-state">NOT CONNECTED</b><span id="cn-time" translate="no"></span><button type="button" class="ol-btn danger" data-act="disconnect" id="cn-dis" hidden>DISCONNECT</button></div>' +
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
      '<div class="cn-foot"><label class="cn-lan"><input type="checkbox" id="cn-lan"><span>SAME WI-FI / LAN MODE (less private, helps when both of you are on one network)</span></label>' +
        '<p class="cn-priv" id="cn-priv">Your IP address is never shown in the game. With a direct P2P link your friend\'s browser can technically see your network address (a WebRTC property); a VPN hides it.</p>' +
        '<p class="cn-priv">The invitation code carries your connection data in encoded form — send it only to your friend. On itch.io the game frame needs allow="microphone" for voice chat.</p></div>' +
    '</div></section>';
  }

  // ------------------------------------------------------------------ состояние -> интерфейс
  function updTop() {
    const p = PF.get(), lv = PF.level();
    const me = $('.ol-me'); if (!me) return;
    $('.ol-mea').innerHTML = PF.avatar(p.name, p.color, 26);
    $('.ol-men').textContent = p.name;
    $('.ol-mel b').textContent = lv.level;
    const lvl = $('#ol-lvl');
    if (lvl) { lvl.querySelector('b').textContent = lv.level; lvl.style.setProperty('--p', Math.round(lv.pct * 360) + 'deg'); }
    const bd = $('#ol-badge'); if (bd) { bd.querySelector('b').textContent = lv.rank.charAt(0); bd.querySelector('small').textContent = lv.rank; }
  }
  function modeText() {
    if (L.mode === 'mission' && validMission(L.mission)) return ['MISSION', String(L.mission).padStart(2, '0'), missionTitle(L.mission)];
    return ['SANDBOX', '', ''];
  }
  function updPlay() {
    if (!root) return;
    const host = !NN.connected || NN.isHost, mt = modeText();
    const sub = $('#bl-sub');
    sub.innerHTML = mt[1] ? '<span>MISSION</span> <b translate="no">' + mt[1] + '</b> — <span translate="no">' + esc(mt[2]) + '</span>' : '<span>SANDBOX</span> — <span>WAVES OF ENEMIES</span>';
    $('#bl-mode').textContent = mt[1] ? 'CO-OP MISSION' : 'CO-OP SANDBOX';
    $('#bl-pick').disabled = !host;
    $$('.ol-card[data-act="mode"]').forEach((c) => c.classList.toggle('on', L.mode === 'sandbox'));
    const c2 = $('.ol-card.c-ms'); if (c2) c2.classList.toggle('on', L.mode === 'mission');
    const btn = $('#bl-play'), tx = $('#bl-play-t'), hint = $('#bl-hint');
    root.dataset.cd = L.cd ? '1' : '0';
    let label = 'PLAY', dis = false, hn = '';
    if (L.cd) { label = 'STARTING…'; dis = true; }
    else if (!NN.connected) { label = 'PLAY'; hn = 'SOLO — OPEN CONNECTION TO PLAY WITH A FRIEND'; }
    else if (NN.isHost) { if (!L.peerReady) { dis = true; hn = 'WAITING FOR YOUR FRIEND TO PRESS READY'; } else hn = 'YOUR FRIEND IS READY'; }
    else { label = L.ready ? 'CANCEL' : 'READY'; hn = L.ready ? 'WAITING FOR THE HOST TO START' : 'PRESS READY WHEN YOU ARE SET'; }
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
    $('#q-title').textContent = open ? (NN.peer ? NN.peer.name : 'FRIEND') : (STATE_TXT[st] || STATE_TXT.idle);
    $('#q-title').setAttribute('translate', open && NN.peer ? 'no' : 'yes');
    $('#q-sub').textContent = open ? (st === 'lost' ? 'CONNECTION UNSTABLE…' : 'CONNECTED') : (st === 'idle' || st === 'closed' || st === 'failed' ? 'TAP TO CONNECT WITH A FRIEND' : 'TAP TO CONTINUE CONNECTING');
    root.classList.toggle('is-open', open);
    $('#h-create').disabled = open;
    $('#h-create').textContent = NN.offerCode && NN.role === 'host' ? 'CREATE NEW INVITATION' : 'CREATE INVITATION';
    $('#h-connect').disabled = !(NN.role === 'host' && st === 'waiting-answer');
    $('#g-answer').disabled = open;
    $('#cn-lan').checked = NN.lan;
    updTimer();
  }
  function fmtTime(s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function updTimer() {
    if (!root) return;
    const el = $('#cn-time'); if (!el) return;
    const st = NN.state;
    if (st === 'open' || st === 'lost') { const s = NN.stats(); el.textContent = fmtTime(s.up) + (s.rtt ? '  ·  ' + s.rtt + ' ms' : ''); }
    else if (L.t0 && (st === 'creating' || st === 'waiting-answer' || st === 'answering' || st === 'connecting')) el.textContent = fmtTime(Math.floor((Date.now() - L.t0) / 1000));
    else el.textContent = '';
    const sub = $('#q-sub');
    if (sub && st === 'open' && NN.rtt) sub.textContent = NN.rtt + ' ms';
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

  // ------------------------------------------------------------------ чат
  const COLOR_NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Purple', 'White'];
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
  const commVisible = () => root && (L.tab === 'chat' || (L.tab === 'play' && innerWidth >= 1180));
  function onChat(m) {
    if (!root) return;
    renderLog(false);
    if (m.from === 'peer' && !commVisible()) { L.unread += 1; const dot = $('.ol-dot'); if (dot) dot.hidden = false; }
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

  // ------------------------------------------------------------------ профиль
  function updProfile(force) {
    if (!root) return;
    const p = PF.get(), lv = PF.level();
    if (L.tab !== 'profile' && !force) return;
    const inp = $('#pf-name'); if (inp && document.activeElement !== inp) inp.value = p.name;
    $('#pf-av').innerHTML = PF.avatar(p.name, p.color, 64);
    $('#pf-lv').textContent = lv.level; $('#pf-rank').textContent = lv.rank;
    $('#pf-bari').style.width = Math.round(lv.pct * 100) + '%';
    $('#pf-xpt').textContent = lv.xp + ' / ' + lv.hi + ' XP';
    $$('.pf-c').forEach((c) => c.classList.toggle('on', c.dataset.v === p.color));
    $('#ol-stats').innerHTML = PF.renderStats();
  }

  // ------------------------------------------------------------------ сцена: CSS-слой и подписи
  function updStage() {
    if (!root) return;
    const p = PF.get(), lv = PF.level(), open = NN.connected, peer = NN.peer;
    const tag = (i, name, color, lvl, status, cls, host) => {
      const t = $('.ol-tag.t' + i); if (!t) return;
      t.hidden = false;
      t.querySelector('.tg-l').textContent = lvl;
      t.querySelector('.tg-n').textContent = (host ? '♛ ' : '') + name;
      const s = t.querySelector('.tg-s'); s.textContent = status; t.className = 'ol-tag t' + i + ' ' + cls;
      t.style.setProperty('--c', color);
    };
    tag(0, p.name, p.color, lv.level, !open ? 'OFFLINE' : (NN.isHost ? 'HOST' : (L.ready ? 'READY' : 'NOT READY')), !open ? 's-off' : (NN.isHost || L.ready ? 's-ok' : 's-no'), open && NN.isHost);
    const f1 = $('.ol-fig.f0'); if (f1) { f1.hidden = false; f1.style.setProperty('--c', p.color); }
    const t1 = $('.ol-tag.t1'), f2 = $('.ol-fig.f1');
    if (open && peer) {
      tag(1, peer.name, peer.color, peer.level, NN.isHost ? (L.peerReady ? 'READY' : 'NOT READY') : 'HOST', NN.isHost ? (L.peerReady ? 's-ok' : 's-no') : 's-ok', !NN.isHost);
      if (f2) { f2.hidden = false; f2.style.setProperty('--c', peer.color); }
    } else { if (t1) t1.hidden = true; if (f2) f2.hidden = true; }
    const inv = $('.ol-invite'); if (inv) inv.hidden = open;
    root.classList.toggle('has-peer', !!(open && peer));
    stSync();
  }

  function refreshAll() {
    if (!root) return;
    updTop(); updPlay(); updStatus(); updVoice(); renderLog(true); updProfile(true); updTab();
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
    if (commVisible()) { L.unread = 0; const dot = $('.ol-dot'); if (dot) dot.hidden = true; const log = $('#ol-log'); if (log) log.scrollTop = log.scrollHeight; }
    if (L.tab === 'profile') updProfile(true);
    layoutTags();
  }
  function setTab(t) {
    if (['play', 'profile', 'chat', 'connect'].indexOf(t) < 0) t = 'play';
    L.tab = t; updTab();
  }

  // ------------------------------------------------------------------ действия
  function copyFrom(el, label) {
    if (!el || !el.value) return;
    const done = () => { toast(label || 'COPIED'); L.copied = Date.now(); };
    const fb = () => { try { el.focus(); el.select(); const ok = document.execCommand && document.execCommand('copy'); if (ok) done(); else toast('PRESS CTRL+C TO COPY', 'bad'); } catch (e) { toast('PRESS CTRL+C TO COPY', 'bad'); } };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(el.value).then(done, fb); else fb(); } catch (e) { fb(); }
  }
  async function hostCreate() {
    L.t0 = Date.now(); NN.chat.clear(); renderLog(true);
    $('#h-out').hidden = true; note('h-note', '');
    $('#h-create').disabled = true;
    const r = await NN.createOffer();
    if (!root) return;
    if (!r.ok) { note('h-note', r.err, 'bad'); $('#h-create').disabled = false; return; }
    $('#h-out').hidden = false; $('#h-link').value = r.link;
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
    $('#g-out').hidden = true; note('g-note', '');
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

  function sendLobby() { if (NN.isHost && NN.connected) NN.sendAction({ type: 'lobby', mode: L.mode, mission: L.mission }); }
  function setMode(mode, mission) {
    if (NN.connected && !NN.isHost) return;
    L.mode = mode === 'mission' && validMission(mission) ? 'mission' : 'sandbox';
    if (L.mode === 'mission') L.mission = mission | 0;
    sendLobby(); updPlay(); sfx('mouse');
  }
  function openPick() {
    if (NN.connected && !NN.isHost) return;
    const el = $('#ol-pick'); if (!el) return;
    const ids = Object.keys(missionsMap()).map(Number).filter(validMission).sort((a, b) => a - b);
    el.innerHTML = '<div class="pk-box"><div class="pk-h"><h3>CHOOSE A MODE</h3><button type="button" class="ol-ic" data-act="pick-close" aria-label="Close">×</button></div>' +
      '<button type="button" class="pk-sb' + (L.mode === 'sandbox' ? ' on' : '') + '" data-act="mode" data-v="sandbox"><b>CO-OP SANDBOX</b><small>WAVES OF ENEMIES FOR TWO</small></button>' +
      '<p class="pk-t">CO-OP MISSIONS</p><div class="pk-grid">' + ids.map((i) => '<button type="button" class="pk-m' + (L.mode === 'mission' && L.mission === i ? ' on' : '') + '" data-act="mission" data-v="' + i + '"><b translate="no">' + String(i).padStart(2, '0') + '</b><span translate="no">' + esc(missionTitle(i)) + '</span></button>').join('') + '</div>' +
      '<p class="v-note">Enemies in story missions run separately on each device; the sandbox shares them.</p></div>';
    el.hidden = false; L.pick = true;
    const f = el.querySelector('.pk-sb'); if (f) try { f.focus({ preventScroll: true }); } catch (e) { /* ok */ }
  }
  function closePick() { const el = $('#ol-pick'); if (el) el.hidden = true; L.pick = false; }

  function mkSeed() { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] || 1; } catch (e) { return (Date.now() % 4294967295) || 1; } }
  function doPlay() {
    if (L.cd) return;
    if (!NN.connected) { beginMatch({ mode: L.mode, mission: L.mission, seed: mkSeed(), role: 'solo', solo: true }, 1); return; }
    if (NN.isHost) {
      if (!L.peerReady) return;
      const spec = { mode: L.mode, mission: L.mission, seed: mkSeed(), role: 'host', solo: false };
      NN.sendAction({ type: 'start', mode: spec.mode, mission: spec.mission, seed: spec.seed });
      beginMatch(spec, 3);
    } else {
      L.ready = !L.ready; NN.sendAction({ type: 'ready', on: L.ready }); updPlay();
    }
  }
  function beginMatch(spec, secs) {
    L.cdSpec = spec; L.cd = secs; L.cdT = 0; closePick(); setTab('play');
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

  function onClick(e) {
    const a = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!a || !root || !root.contains(a) || a.disabled) return;
    const act = a.dataset.act, v = a.dataset.v;
    if (act !== 'copy' && act !== 'copy-code') sfx('mouse');
    if (window.NexaNet && NN.voice && NN.voice.unlock) NN.voice.unlock();
    switch (act) {
      case 'tab': setTab(v); break;
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
      case 'copy': copyFrom($('#' + v), 'COPIED'); break;
      case 'copy-code': { const l = $('#h-link'); if (l && l.value) { const t = document.createElement('textarea'); t.value = NN.offerCode; t.style.cssText = 'position:fixed;left:-999px;top:0'; document.body.appendChild(t); copyFrom(t, 'COPIED'); setTimeout(() => t.remove(), 300); } break; }
      case 'disconnect': NN.close(); L.ready = L.peerReady = false; $('#h-out').hidden = true; $('#g-out').hidden = true; L.t0 = 0; refreshAll(); break;
      case 'name': {
        const r = PF.setName($('#pf-name').value);
        const nt = $('#pf-note'); nt.className = 'v-note ' + (r.ok ? 'ok' : 'bad'); nt.textContent = r.ok ? PF.text('NAME_OK') : PF.text(r.err);
        if (r.ok) { updTop(); updProfile(true); updStage(); if (NN.connected) NN.sendAction({ type: 'hello', info: NN.localInfo() }); }
        break;
      }
      case 'color': PF.setColor(v); updProfile(true); updStage(); stColors(); if (NN.connected) NN.sendAction({ type: 'hello', info: NN.localInfo() }); break;
      case 'pf-export': { const t = $('#pf-json'); t.value = PF.exportJSON(); copyFrom(t, 'COPIED'); break; }
      case 'pf-import': { const r = PF.importJSON($('#pf-json').value); const nt = $('#pf-io-note'); nt.className = 'v-note ' + (r.ok ? 'ok' : 'bad'); nt.textContent = r.ok ? 'Profile imported.' : 'The profile text is not valid.'; if (r.ok) { updTop(); updProfile(true); updStage(); } break; }
      case 'pf-reset': {
        const b = $('#pf-reset');
        if (b.dataset.arm) { delete b.dataset.arm; b.textContent = 'RESET STATS'; PF.reset(); updTop(); updProfile(true); }
        else { b.dataset.arm = '1'; b.textContent = 'TAP AGAIN TO CONFIRM'; setTimeout(() => { if (b.isConnected && b.dataset.arm) { delete b.dataset.arm; b.textContent = 'RESET STATS'; } }, 3500); }
        break;
      }
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
    $('#cn-lan').addEventListener('change', (e) => NN.setLan(e.target.checked));
    $('#pf-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const b = root.querySelector('[data-act="name"]'); b && b.click(); } });
    ['#h-ans', '#g-in'].forEach((s) => $(s).addEventListener('paste', () => { const el = $(s); setTimeout(() => { if (!root) return; if (s === '#g-in' && el.value.trim() && /NX\d+O\./.test(el.value.replace(/\s+/g, ''))) guestAnswer(false); }, 30); }));
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && L.pick) { e.stopPropagation(); closePick(); } });
    root.addEventListener('pointermove', onPtr, { passive: true });
  }

  // ------------------------------------------------------------------ события сети
  function netHooks() {
    NN.on('net:state', (s) => {
      if (s.state === 'creating' || s.state === 'answering') L.t0 = Date.now();
      if (s.state === 'open' || s.state === 'idle') { if (s.state === 'idle') L.t0 = 0; }
      if (s.state === 'open') { L.t0 = 0; L.ready = false; L.peerReady = false; sfx('notification'); }
      if (s.state === 'closed' || s.state === 'failed') { L.ready = L.peerReady = false; L.t0 = 0; }
      if (!root) return;
      updStatus(); updPlay(); updVoice();
      if (s.text && (s.state === 'failed' || s.state === 'closed' || s.state === 'lost')) { toast(s.text, 'bad'); const hn = $('#h-note'), gn = $('#g-note'); [hn, gn].forEach((n) => { if (n && n.isConnected && s.state !== 'lost') { n.className = 'v-note bad'; n.textContent = s.text; } }); }
      if (s.state === 'open') { toast('FRIEND CONNECTED'); if (L.tab === 'connect') setTab('play'); }
    });
    NN.on('net:peer', () => { if (NN.isHost) sendLobby(); if (root) { updStage(); updPlay(); updStatus(); } });
    NN.on('net:close', () => { if (NN.chat.history.length) NN.chat.sys('FRIEND_LEFT', NN.peer ? NN.peer.name : 'PLAYER'); L.cd = 0; L.cdSpec = null; const el = $('#ol-cd'); if (el) el.hidden = true; });
    NN.on('net:chat', onChat);
    NN.on('net:voice', updVoice);
    NN.on('net:tick', updTimer);
    NN.on('net:rtt', updTimer);
    NN.on('lobby', (p) => { if (NN.isHost) return; L.mode = p.mode === 'mission' && validMission(p.mission) ? 'mission' : 'sandbox'; if (L.mode === 'mission') L.mission = p.mission | 0; updPlay(); });
    NN.on('ready', (p) => { if (!NN.isHost) return; L.peerReady = !!p.on; updPlay(); if (root) toast(L.peerReady ? 'FRIEND IS READY' : 'FRIEND IS NOT READY'); });
    NN.on('start', (p) => {
      if (NN.isHost || L.cd) return;
      const mode = p.mode === 'mission' && validMission(p.mission) ? 'mission' : 'sandbox';
      beginMatch({ mode, mission: mode === 'mission' ? p.mission | 0 : 1, seed: (p.seed >>> 0) || 1, role: 'guest', solo: false }, 3);
    });
  }

  // ------------------------------------------------------------------ 3D-сцена
  const ST = { on: false, building: 0, ready: false, canvas: null, r: null, scene: null, cam: null, host: null, figs: [], raf: 0, last: 0, tok: 0, ptr: { x: 0, y: 0, sx: 0, sy: 0 }, w: 0, h: 0, plat: [], lost: false };
  const PLAT = [[0, 1.25, 0.95], [-1.55, -0.8, 0.8], [1.55, -0.8, 0.8]];   // x, z, радиус: главный, левый (пустой), правый (напарник)
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
      // платформы: тёмный диск, светящееся кольцо и ореол; у главной — красный свет снизу
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
      // стикмены игры: тот же риг, что у врагов (actors.js); тело чуть светлее, чтобы читалось на тёмном фоне
      const mkFig = (pi, yaw) => {
        const n = C.Run.prototype.npc.call(hostObj, PLAT[pi][0], PLAT[pi][1], yaw);
        n.yaw = yaw; n.g.rotation.y = yaw;
        const bg = new T.CylinderGeometry(0.185, 0.17, 0.07, 18); bg.scale(1, 1, 0.72);
        const band = new T.Mesh(bg, new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 }));
        band.position.y = 0.24; n.spine.add(band);
        n.g.visible = false;
        return { n, band, pi, vis: false, t: Math.random() * 6, yaw };
      };
      const figs = [mkFig(0, -0.12), mkFig(2, -0.5)];
      hostObj.agm.body.color.setHex(0x0e0f12); hostObj.agm.body.emissive.setHex(0x16181d);
      Object.keys(hostObj.ag).forEach((k) => keep.push(hostObj.ag[k]));
      keep.push(hostObj.agm.body, hostObj.agm.gear, hostObj.agm.gun, hostObj.agm.flash, figs[0].band.material, figs[0].band.geometry, figs[1].band.material, figs[1].band.geometry);
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ST.lost = true; stDispose(); });
      Object.assign(ST, { canvas, r, scene, cam, host: hostObj, figs, plats, keep, ready: true, pl, lost: false });
      ok = true;
      stAttach(); stResize(); stSync(); stColors();
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
    const open = NN.connected && NN.peer;
    ST.figs[0].n.g.visible = true; ST.figs[1].n.g.visible = !!open;
    ST.plats[2].ringMat.color.setHex(open ? 0xff9a3d : 0x3a3d44); ST.plats[2].ringMat.opacity = open ? 1 : 0.7;
    ST.plats[2].glowMat.opacity = open ? 1 : 0.5;
    stColors();
  }
  function stColors() {
    if (!ST.ready) return;
    const p = PF.get(), peer = NN.peer;
    ST.figs[0].band.material.color.set(p.color); ST.figs[0].band.material.emissive.set(p.color);
    const m = ST.figs[1].band.material; if (m === ST.figs[0].band.material) return;
    m.color.set(peer ? peer.color : '#ffffff'); m.emissive.set(peer ? peer.color : '#ffffff');
  }
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
      [0, 2].forEach((pi, i) => {
        v.set(PLAT[pi][0], 2.1, PLAT[pi][1]).project(ST.cam);
        const t = $('.ol-tag.t' + i); if (!t) return;
        t.style.left = ((v.x * 0.5 + 0.5) * ST.w).toFixed(1) + 'px'; t.style.top = ((-v.y * 0.5 + 0.5) * ST.h).toFixed(1) + 'px';
      });
      [0, 1, 2].forEach((pi) => {
        v.set(PLAT[pi][0], 0, PLAT[pi][1]).project(ST.cam);
        const e = $('.ol-plat.p' + pi);
        if (pi === 2) { const inv = $('.ol-invite'); if (inv) { inv.style.left = ((v.x * 0.5 + 0.5) * ST.w).toFixed(1) + 'px'; inv.style.top = ((-v.y * 0.5 + 0.5) * ST.h - 70).toFixed(1) + 'px'; } }
        void e;
      });
    } else {
      [0, 1].forEach((i) => { const t = $('.ol-tag.t' + i); if (t) { t.style.left = ''; t.style.top = ''; } });
      const inv = $('.ol-invite'); if (inv) { inv.style.left = ''; inv.style.top = ''; }
    }
  }
  function stTick(now) {
    ST.raf = 0;
    if (!ST.ready || !ST.on) return;
    ST.raf = requestAnimationFrame(stTick);
    if (document.hidden || !root || !root.isConnected || (window.Missions && Missions.current)) return;
    if (now - ST.last < 32) return;                         // ~30 кадров/с: лобби не должно греть телефон
    const dt = Math.min(0.1, (now - ST.last) / 1000); ST.last = now;
    stResize();
    const T = THREE, C = Missions._core, p = ST.ptr;
    p.sx += (p.x - p.sx) * 0.08; p.sy += (p.y - p.sy) * 0.08;
    ST.host.time += dt;
    const t = ST.host.time, k = ST.k || 1;
    ST.cam.position.set(p.sx * 0.35, 1.5 + p.sy * 0.12, PLAT[0][1] + 5.9 * k);
    ST.cam.lookAt(p.sx * 0.1, 0.92, 0.2);
    ST.figs.forEach((f, i) => {
      if (!f.n.g.visible) return;
      C.Run.prototype.updateNpc.call(ST.host, f.n, dt);
      const n = f.n;
      if (i === 0) { // главный: руки скрещены на груди (IK), голова следит за курсором
        const v = ST.v || (ST.v = [new T.Vector3(), new T.Vector3()]);
        ST.host.solveArm(n.armL, n.elbL, [-0.2, 0.46, 0], v[0].set(0.13, 0.31 + Math.sin(t * 1.5) * 0.004, 0.17), -1);
        ST.host.solveArm(n.armR, n.elbR, [0.2, 0.46, 0], v[1].set(-0.13, 0.27 + Math.sin(t * 1.5) * 0.004, 0.2), 1);
        n.head.rotation.y = p.sx * 0.45 + Math.sin(t * 0.4) * 0.05; n.head.rotation.x = -p.sy * 0.18;
        n.g.rotation.y = -0.12 + p.sx * 0.12;
      } else { n.head.rotation.y = Math.sin(t * 0.6 + 1) * 0.3; n.g.rotation.y = -0.55 + Math.sin(t * 0.3) * 0.08; }
    });
    const pulse = 0.82 + Math.sin(t * 2.2) * 0.18;
    ST.plats[0].ringMat.opacity = pulse; ST.plats[0].glowMat.opacity = 0.75 + pulse * 0.25; ST.pl.intensity = 0.7 + pulse * 0.4;
    if (NN.connected && NN.peer) ST.plats[2].glowMat.opacity = 0.7 + Math.sin(t * 2 + 1) * 0.2;
    ST.r.render(ST.scene, ST.cam);
  }
  function stDispose() {
    ST.tok += 1;
    if (ST.raf) { cancelAnimationFrame(ST.raf); ST.raf = 0; }
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
  function onSecond() {
    if (!root || !root.isConnected) return;
    updTimer(); cdTick();
    if (L.tab === 'profile' && Date.now() - L.lastStats > 2000) { L.lastStats = Date.now(); const s = $('#ol-stats'); if (s) s.innerHTML = PF.renderStats(); updTop(); }
  }
  let inited = false;
  const api = {
    init(o) {
      Object.assign(ctx, o || {});
      if (inited) return; inited = true;
      netHooks();
      tickT = setInterval(onSecond, 1000);
      window.addEventListener('resize', () => { if (root) { stResize(); layoutTags(); updTab(); } });
      PF.onChange(() => { /* обновление идёт по таймеру */ });
    },
    render: shell,
    afterRender(on) {
      document.body.classList.toggle('in-online', !!on);
      if (!on) { if (root) { root = null; } stStop(); return; }
      root = document.getElementById('ol');
      if (!root) return;
      bind(); refreshAll();
      const pj = NN.pendingJoin();
      if (pj && !L.joinFromUrl) { L.joinFromUrl = true; setTab('connect'); $('#g-in').value = pj; NN.clearJoinFromUrl(); guestAnswer(true); }
      stStart();
    },
    action(a) {
      if (a === 'online') { if (ctx.setView) ctx.setView('ONLINE'); if (ctx.render) ctx.render(); return true; }
      return false;
    },
    // после загрузки: ссылка с ?join= сразу открывает лобби
    boot() { if (NN.pendingJoin() && !L.joinFromUrl && ctx.setView) { ctx.setView('ONLINE'); ctx.render && ctx.render(); } },
    get active() { return !!root; },
    get state() { return L; },
    _st: ST
  };
  window.OnlineLobby = api;
}());
