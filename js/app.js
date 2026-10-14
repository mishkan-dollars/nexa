(function () {
  'use strict';

  var game = new HighLow.GameManager();
  var audio = new AudioManager();
  var bootComplete = false;
  var firstMatchComplete = false;
  var taskAccepted = false;
  var currentView = 'GAME';
  var taskProgress = 1;
  var systemLogs = [];
  var archiveUnlocks = [];
  var completedTasks = [];      // id выполненных заданий
  var missionProgress = {};     // taskId -> последняя достигнутая стадия миссии
  var cutscenesSeen = [];       // id просмотренных кат-сцен
  var missionActive = false;
  var tableActive = false;      // 3D-стол HIGH/LOW (table.js) сейчас занимает экран: 2D-интерфейс не рисуем и фокус не крадём
  var fromList = false;         // миссия запущена из вкладки MISSIONS (после неё возвращаемся туда же)
  var PHASES = HighLow.PHASES;
  var INTRO_TASKS = 6;          // первые 6 заданий обязательны: пока они не пройдены подряд, доступны только сами миссии
  var justUnlocked = false;     // 6-е задание только что пройдено — показать «терминал разблокирован»
  function introLocked() { return taskProgress <= INTRO_TASKS; }
  window.NexaIntro = { locked: introLocked, count: INTRO_TASKS };   // emote.js и др. спрашивают, можно ли уже отвлекаться
  var lastKey = null;           // ключ последнего нарисованного экрана (чтобы не перерисовывать без нужды)
  var shownVerdictKey = null;   // какой HIGH/LOW/CORRECT уже проигрывал анимацию
  var shownTurnToken = null;    // какой ход уже проигрывал анимацию
  var AUTO_ORDER = ['EXPIRED', 'AUTO', 'GENERATED', 'AUTOLOCKED', 'COMPLETE'];

  function loadProgress() {
    var saved = null;
    try { saved = localStorage.getItem('nexaProgress'); } catch (e) {}
    if (saved) {
      try {
        var data = JSON.parse(saved);
        firstMatchComplete = data.firstMatchComplete || false;
        taskProgress = data.currentTask || data.taskProgress || 1;   // currentTask; taskProgress — старый формат сохранения
        taskAccepted = false;                                         // после перезагрузки всегда начинаем с TASK на NEXA/OS
        completedTasks = data.completedTasks || [];
        missionProgress = data.missionProgress || {};
        cutscenesSeen = data.cutscenesSeen || [];
        systemLogs = data.systemLogs || [];
        archiveUnlocks = data.archiveUnlocks || [];
      } catch (e) {}
    }
  }

  function saveProgress() {
    var data = {
      firstMatchComplete: firstMatchComplete,
      currentTask: taskProgress,
      completedTasks: completedTasks,
      missionProgress: missionProgress,
      cutscenesSeen: cutscenesSeen,
      systemLogs: systemLogs,
      archiveUnlocks: archiveUnlocks
    };
    try { localStorage.setItem('nexaProgress', JSON.stringify(data)); } catch (e) {}
  }

  function addSystemLog(message) {
    if (systemLogs.indexOf(message) === -1) {
      systemLogs.push(message);
      saveProgress();
    }
  }

  function renderBoot() {
    var lines = ['NEXA INDUSTRIES', 'BEHAVIORAL RESEARCH DIVISION', 'TERMINAL 083', '', 'SYSTEM BOOT', 'CHECKING MEMORY ........ OK', 'MOUNTING C:\\NEXA ........ OK', 'LOADING NEXA/OS ........ OK', 'DATE: 19.11.1992 &nbsp; TIME: 03:17:42'];
    var html = '<div class="screen-shell boot"><div class="boot-inner">';
    lines.forEach(function (text, i) {
      html += '<p class="boot-line' + (i === 0 ? ' red' : '') + (text === '' ? ' gap' : '') + '" style="animation-delay:' + (0.2 + i * 0.24).toFixed(2) + 's">' + (text || '&nbsp;') + '</p>';
    });
    html += '<div class="boot-bar"><i></i></div><p class="boot-line ready" style="animation-delay:2.5s">&gt; SYSTEM READY<span class="cursor"></span></p></div></div>';
    return html;
  }

  var TASKS = [
    { id: 1, title: 'CALIBRATION', desc: 'Find the terminal.<br>Complete calibration.' },
    { id: 2, title: 'OBSERVATION', desc: 'Observe SUBJECT 024.<br>Record behavior.' },
    { id: 3, title: 'DEVIATION', desc: 'Locate the source of the anomaly.' },
    { id: 4, title: 'INCIDENT 1103', desc: 'Investigate the restricted facility.' },
    { id: 5, title: 'UNKNOWN PROCESS', desc: 'Reach SERVER 4.<br>Terminate the process.' },
    { id: 6, title: 'FINAL EXPERIMENT', desc: 'Complete the final test.' },
    { id: 7, title: 'BREAKOUT', desc: 'Escape the containment block.<br>Do not stop moving.' },
    { id: 8, title: 'PROFICIENCY TEST', desc: 'Pass the live-fire assessment.<br>Hit only the black targets.' },
    { id: 9, title: 'POWER SURGE', desc: 'Restore power to the reactor wing.<br>Stay out of the open when it pulses.' },
    { id: 10, title: 'LIFT SHAFT', desc: 'Hold the elevator until it reaches the surface.' },
    { id: 11, title: 'BLACKOUT', desc: 'Something is hunting in the dark.<br>Bring the lights back.' },
    { id: 12, title: 'NIGHT TRAIN', desc: 'Fight through the train to the engine.' },
    { id: 13, title: 'OPEN FIRE', desc: 'Survive the arena.<br>Five rounds.' },
    { id: 14, title: 'CLOSE QUARTERS', desc: 'Breach and clear the corridor.' },
    { id: 15, title: 'CONTROL ROOM', desc: 'Reach the control room.<br>Stay quiet if you can.' },
    { id: 16, title: 'NEXA PROTOCOL', desc: 'End the experiment.' }
  ];

  // шкала обязательных заданий 01–06 и пометка, что терминал закрыт до их прохождения
  function introSteps() {
    var h = '<div class="intro-steps">';
    for (var i = 1; i <= INTRO_TASKS; i += 1) h += '<span class="intro-step ' + (i < taskProgress ? 'done' : (i === taskProgress ? 'cur' : '')) + '">' + String(i).padStart(2, '0') + '</span>';
    return h + '</div><p class="intro-note"><b>MANDATORY</b><span>TERMINAL ACCESS IS LOCKED UNTIL TASKS 01–06 ARE COMPLETE</span></p>';
  }
  function unlockedNote() {
    return justUnlocked && taskProgress === INTRO_TASKS + 1 ? '<p class="intro-note ok"><b>TERMINAL UNLOCKED</b><span>SHOP, SANDBOX, ARCHIVE AND REPLAYS ARE NOW AVAILABLE</span></p>' : '';
  }

  function renderTaskDialog() {
    var current = TASKS[taskProgress - 1], intro = introLocked();
    if (!current) {
      return '<div class="center-shell"><div class="panel" style="max-width:540px;animation:slideUp .5s ease-out;"><div class="panel-head"><div><p class="eyebrow">NEW TASK</p><h2>ALL TASKS<br>COMPLETE</h2></div><div class="session-tag">SUBJECT<strong>083</strong></div></div><p style="color:var(--muted);margin-bottom:28px;">STATUS: ARCHIVED</p><button class="action primary centered" data-action="accept-task">[OPEN TERMINAL]</button></div></div>';
    }
    return '<div class="center-shell"><div class="panel" style="max-width:540px;animation:slideUp .5s ease-out;"><div class="panel-head"><div><p class="eyebrow">NEW TASK</p><h2>TASK ' + String(current.id).padStart(2, '0') + '<br>' + current.title + '</h2></div><div class="session-tag">SUBJECT<strong>083</strong></div></div>' + (intro ? introSteps() : unlockedNote()) + '<p style="color:var(--muted);margin-bottom:28px;">STATUS: REQUIRED</p><p class="eyebrow" style="margin-bottom:6px;">OBJECTIVE</p><p style="margin-bottom:22px;">' + current.desc + '</p><div class="task-actions"><button class="action primary centered" data-action="start-mission" data-cursor="interact">[START MISSION]</button>' + (intro ? '' : '<button class="link-button" data-action="accept-task">OPEN TERMINAL WITHOUT STARTING</button>') + '</div></div></div>';
  }

  function renderDesktop() {
    return '<div class="center-shell"><div data-lobbybg style="background-image:url(assets/menubg.png);background-size:cover;background-position:center;background-repeat:no-repeat;position:absolute;inset:0;opacity:.75;"></div><div style="position:relative;z-index:1;width:min(680px,100%);"><div style="text-align:center;margin-bottom:60px;"><p style="font:700 32px/1.1 var(--display);letter-spacing:.12em;color:var(--red);margin-bottom:12px;">NEXA/OS</p><p style="color:var(--muted);font-size:11px;letter-spacing:.15em;">BEHAVIORAL RESEARCH DIVISION</p><p style="color:var(--muted);font-size:10px;letter-spacing:.2em;margin:8px 0 0;">TERMINAL 083 // SYSTEM READY</p></div><div class="os-status"><span><i class="status-dot blink"></i>DISK ACTIVE</span><span>MEM 0640K</span><span>SUBJECT 083<span class="cursor"></span></span></div><div class="menu-actions os-window">' + missionButton() + '<button class="action" data-action="play">HIGH_LOW.exe</button><button class="action" data-action="missions" data-cursor="interact">MISSIONS</button><button class="action" data-action="shop" data-cursor="interact">SHOP</button><button class="action" data-action="sandbox" data-cursor="interact">SANDBOX</button><button class="action" data-action="online" data-cursor="interact">ONLINE LOBBY</button><button class="action" data-action="archive">ARCHIVE</button><button class="action" data-action="system-log">SYSTEM LOG</button></div></div></div>';
  }

  function missionButton() {
    var t = TASKS[taskProgress - 1];
    if (!t) return '';
    return '<button class="action primary" data-action="start-mission" data-cursor="interact">TASK ' + String(t.id).padStart(2, '0') + ' // START MISSION</button>';
  }

  // Вкладка MISSIONS: пройденные и текущая миссии можно запускать заново; остальные закрыты.
  function missionState(id) {
    if (completedTasks.indexOf(id) !== -1) return 'DONE';
    if (id === taskProgress) return 'CURRENT';
    return id < taskProgress ? 'DONE' : 'LOCKED';
  }

  function renderMissions() {
    var done = 0, rows = '';
    TASKS.forEach(function (t) {
      var st = missionState(t.id), code = String(t.id).padStart(2, '0');
      if (st === 'DONE') done += 1;
      if (st === 'LOCKED') {
        rows += '<div class="mission-row locked"><span class="mission-no">' + code + '</span><span class="mission-info"><b>[ LOCKED ]</b><i>CLEARANCE REQUIRED</i></span><span class="mission-tag">LOCKED</span></div>';
      } else {
        rows += '<button class="mission-row ' + (st === 'CURRENT' ? 'current' : 'done') + '" data-action="replay-mission" data-value="' + t.id + '" data-cursor="interact"><span class="mission-no">' + code + '</span><span class="mission-info"><b>' + t.title + '</b><i>' + t.desc.split('<br>').map(function (p) { return '<span>' + p + '</span>'; }).join(' ') + '</i></span><span class="mission-tag">' + (st === 'CURRENT' ? 'CURRENT // START' : 'COMPLETE // REPLAY') + '</span></button>';
      }
    });
    return '<div class="screen-shell"><div class="panel" style="max-width:840px;margin:auto;"><div class="panel-head"><div><p class="eyebrow">NEXA/OS</p><h2>MISSIONS</h2></div><div class="session-tag">COMPLETED<strong>' + done + ' / ' + TASKS.length + '</strong></div></div><div class="back-row"><button class="link-button" data-action="menu">← BACK TO NEXA/OS</button></div><p style="color:var(--muted);margin-bottom:20px;">C:\\NEXA\\MISSIONS\\ &nbsp;//&nbsp; COMPLETED MISSIONS CAN BE REPLAYED. STORY PROGRESS IS NOT AFFECTED.</p><div class="mission-list" data-i18n="mlist">' + rows + '</div></div></div>';
  }

  function renderExperimentSelect() {
    return '<div class="center-shell"><div class="panel" style="max-width:700px;"><div class="panel-head"><h2>SELECT EXPERIMENT</h2><div class="session-tag">SESSION<strong>' + (game.state.sessionId || 'PENDING') + '</strong></div></div><div class="back-row"><button class="link-button" data-action="menu">← BACK TO NEXA/OS</button></div><div class="card-grid" data-i18n="mlist"><button class="choice-card" data-action="experiment" data-value="HIGH"><div class="code">01</div><h3>HIGH / LOW</h3><p>Numerical prediction experiment with multiple subjects</p></button><button class="choice-card" style="opacity:.4;cursor:not-allowed;" disabled><div class="code">02</div><h3>LOCKED</h3><p>Clearance level 04 required</p></button></div></div></div>';
  }

  function renderPlayerSelect() {
    return '<div class="center-shell"><div class="panel" style="max-width:700px;"><div class="panel-head"><h2>PARTICIPANT COUNT</h2><div class="session-tag">EXPERIMENT<strong>01</strong></div></div><div class="back-row"><button class="link-button" data-action="menu">← BACK TO NEXA/OS</button></div><div class="card-grid" data-i18n="mlist"><button class="choice-card" data-action="players" data-value="2"><div class="code">2</div><h3>TWO SUBJECTS</h3><p>Standard dyadic configuration</p></button><button class="choice-card" data-action="players" data-value="4"><div class="code">4</div><h3>FOUR SUBJECTS</h3><p>Extended group configuration</p></button></div></div></div>';
  }

  function renderInitialization() {
    return '<div class="center-shell"><div class="panel" style="max-width:600px;"><div class="panel-head"><h2>INITIALIZING</h2><div class="session-tag">EXPERIMENT<strong>01</strong></div></div><div class="init-list"><div class="init-row"><span>LOADING PARAMETERS</span><span>DONE</span></div><div class="init-row"><span>SELECTING SUBJECTS</span><span>DONE</span></div><div class="init-row"><span>ESTABLISHING SECURE CHANNEL</span><span>DONE</span></div><div class="init-row"><span>RANDOMIZING TARGET</span><span>DONE</span></div></div></div></div>';
  }

  function renderParticipants() {
    var html = '<div class="screen-shell"><div class="panel" style="max-width:840px;margin:auto;"><div class="panel-head"><h2>PARTICIPANTS READY</h2><div class="session-tag">SESSION<strong>' + (game.state.sessionId || 'PENDING') + '</strong></div></div><p style="color:var(--muted);margin-bottom:26px;">All subjects connected. Experiment will begin shortly.</p><div class="participants-grid">';
    game.state.players.forEach(function (player) {
      var label = player.isUser ? '<span class="red">YOU</span>' : '<span class="muted">SYSTEM</span>';
      html += '<div class="participant ' + (player.isUser ? 'you' : '') + '"><span class="participant-id">SUBJECT ' + player.id + '</span><span class="participant-state">' + label + '</span></div>';
    });
    html += '</div><div style="margin-top:32px;"><button class="action primary centered" data-action="begin-round">[BEGIN EXPERIMENT]</button></div></div></div>';
    return html;
  }

  function typedText(text) {
    return '<span class="typed" style="--n:' + String(text).length + '">' + text + '</span>';
  }

  function timerClass(rem) {
    var c = 'timer';
    if (rem <= 5) c += ' warn';
    if (rem <= 3) c += ' critical';
    if (rem <= 1) c += ' last';
    return c;
  }

  // TIME EXPIRED -> AUTO-SELECTION -> SYSTEM GENERATED VALUE -> NUMBER LOCKED -> PICK COMPLETE
  function renderAutoSelect(stage) {
    var st = game.state;
    var idx = AUTO_ORDER.indexOf(stage);
    if (idx < 0) idx = 0;
    var n = String(st.autoSelectedNumber);
    function line(i, html, cls) {
      if (idx < i) return '';
      return '<p class="sys-line ' + (cls || '') + (idx > i ? ' instant' : '') + '">' + html + '</p>';
    }
    var html = '<div class="screen-shell auto-select-overlay"><div class="panel expired-panel"><div class="panel-head"><h2 class="red' + (idx === 0 ? ' glitch-text' : '') + '">TIME EXPIRED</h2><div class="session-tag">SUBJECT<strong>083</strong></div></div><div class="sys-lines">';
    html += line(1, 'SUBJECT 083<br>NO NUMBER SELECTED');
    html += line(1, 'AUTO-SELECTION ACTIVE...', 'amber');
    html += line(2, 'SYSTEM GENERATED VALUE: ' + (idx === 2 ? typedText(n) : n), 'green big');
    html += line(3, 'NUMBER LOCKED<br>VALUE: ' + n, 'green');
    html += line(4, 'PICK COMPLETE', 'muted');
    html += '</div></div></div>';
    return html;
  }

  function renderPicking() {
    var st = game.state;
    var stage = st.pickStage || 'INPUT';
    if (st.autoSelecting) return renderAutoSelect(stage);

    var rem = st.pickRemaining;
    var locked = !!st.pickLocked;
    var max = st.rangeMax;
    var value = (st.lockedValue !== null && st.lockedValue !== undefined) ? st.lockedValue : '';
    var defaultNote = 'Enter a number between 1 and ' + max;
    var note = locked
      ? '<span class="green">NUMBER LOCKED</span><br>SUBJECT 083<br>VALUE: ' + value + (stage === 'COMPLETE' ? '<br><span class="green">PICK COMPLETE</span>' : '')
      : defaultNote;

    var html = '<div class="screen-shell pick-screen' + (!locked && rem <= 5 ? ' warn' : '') + (!locked && rem <= 3 ? ' danger' : '') + '"><div class="panel" style="max-width:920px;margin:auto;"><div class="panel-head"><div><p class="eyebrow">EXPERIMENT 01</p><h2>SELECT YOUR NUMBER</h2></div><div class="session-tag">SESSION<strong>' + (st.sessionId || 'PENDING') + '</strong></div></div>';
    html += '<div class="pick-layout"><div><p style="color:var(--muted);margin-bottom:20px;">Each subject selects one number within the range. Time remaining:</p>';
    html += '<form class="number-form" data-form="pick" autocomplete="off" novalidate><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" class="number-input' + (locked ? ' locked' : '') + '" id="pick-input" placeholder="ENTER NUMBER" aria-label="Enter number" value="' + value + '"' + (locked ? ' disabled' : '') + '>';
    html += '<button type="submit" class="action" id="pick-lock"' + (locked ? ' disabled' : '') + '>LOCK NUMBER</button></form>';
    html += '<div class="form-note' + (locked ? ' locked-note' : '') + '" id="pick-note" data-default="' + defaultNote + '" aria-live="polite">' + note + '</div><div class="subject-locks">';
    st.players.forEach(function (player) {
      var isLocked = player.status === 'LOCKED';
      html += '<div class="lock-row"><span>SUBJECT ' + player.id + '</span><span class="lock-state ' + (isLocked ? 'green' : 'muted') + '">' + (isLocked ? 'LOCKED' : 'THINKING') + '</span></div>';
    });
    html += '</div></div><div class="timer-box"><p class="timer-label">TIME REMAINING</p><div class="' + timerClass(rem) + '">' + rem + '</div><p class="range-readout">RANGE: 1 &mdash; ' + max + '</p></div></div></div></div>';
    return html;
  }

  // Точечное обновление PICK без перерисовки: input, курсор и набранный текст не трогаются.
  function updatePickView() {
    var st = game.state;
    if (st.phase !== PHASES.PICKING || st.autoSelecting || st.pickLocked) return;
    var rem = st.pickRemaining;
    var t = document.querySelector('.timer');
    if (t) {
      var txt = String(rem);
      if (t.textContent !== txt) {
        t.textContent = txt;
        t.classList.remove('tick');
        void t.offsetWidth;
        t.classList.add('tick');
      }
      t.classList.toggle('warn', rem <= 5);
      t.classList.toggle('critical', rem <= 3);
      t.classList.toggle('last', rem <= 1);
    }
    var scr = document.querySelector('.pick-screen');
    if (scr) {
      scr.classList.toggle('warn', rem <= 5);
      scr.classList.toggle('danger', rem <= 3);
    }
    var rows = document.querySelectorAll('.lock-row');
    st.players.forEach(function (player, i) {
      var row = rows[i];
      if (!row) return;
      var cell = row.lastElementChild;
      var isLocked = player.status === 'LOCKED';
      var label = isLocked ? 'LOCKED' : 'THINKING';
      if (cell && cell.textContent !== (window.I18N ? I18N.t(label) : label)) {
        cell.textContent = label;
        cell.className = 'lock-state ' + (isLocked ? 'green' : 'muted');
      }
    });
  }

  function verdictKey(r) {
    return r ? [r.actorId, r.targetId, r.guess, r.result].join(':') : '';
  }

  function renderVerdict(last, fresh, ending) {
    if (!last) return '<div class="verdict verdict-idle"><span class="v-line">NO GUESSES YET</span></div>';
    var cls = 'verdict verdict-' + last.result.toLowerCase() + (fresh ? ' fresh' : '');
    var html = '<div class="' + cls + '"><span class="v-who">SUBJECT ' + last.actorId + ' &rarr; ' + last.guess + '</span>';
    var range = last.range ? last.range.min + ' &mdash; ' + last.range.max : '';
    if (last.result === 'HIGH') {
      html += '<span class="v-main">HIGH</span><span class="v-line">TARGET IS HIGHER</span><span class="v-line">RANGE UPDATED<br>' + range + '</span><span class="v-arrow">&uarr;</span>';
    } else if (last.result === 'LOW') {
      html += '<span class="v-main">LOW</span><span class="v-line">TARGET IS LOWER</span><span class="v-line">RANGE UPDATED<br>' + range + '</span><span class="v-arrow">&darr;</span>';
    } else {
      html += '<span class="v-main">CORRECT</span><span class="v-line">TARGET MATCH</span><span class="v-line">' + (ending ? 'EXPERIMENT COMPLETE' : 'SUBJECT ' + last.targetId + ' REMOVED') + '</span>';
    }
    return html + '</div>';
  }

  function renderGuessing() {
    var st = game.state;
    var target = game.publicTarget() || { min: 1, max: st.rangeMax || 1 };
    var last = st.lastResult;
    var ending = !!st.matchEnding;
    var vKey = verdictKey(last);
    var freshVerdict = vKey !== '' && vKey !== shownVerdictKey;
    shownVerdictKey = vKey;
    var freshTurn = !!st.turnToken && st.turnToken !== shownTurnToken;
    if (st.turnToken) shownTurnToken = st.turnToken;
    var actorId = st.currentActorId;
    var actor = st.players.find(function (p) { return p.id === actorId; });
    var sameTarget = !!last && last.targetId === st.targetId;
    var turnLabel = actorId ? 'SUBJECT ' + actorId : '&mdash; &mdash; &mdash;';

    var html = '<div class="screen-shell game-screen"><div class="panel" style="max-width:1020px;margin:auto;">';
    if (freshVerdict && last.result === 'CORRECT') html += '<div class="correct-flash"></div>';
    html += '<div class="panel-head"><h2>EXPERIMENT ACTIVE</h2><div class="session-tag">SESSION<strong>' + st.sessionId + '</strong></div></div><div class="guess-layout"><div>';
    html += '<div class="status-strip"><div class="turn-card' + (actorId ? ' active-turn' : '') + '"><span>CURRENT TURN</span><strong>' + (actorId && freshTurn ? typedText(turnLabel) : turnLabel) + '</strong></div><div><span>TARGET</span><strong>SUBJECT ' + st.targetId + '</strong></div></div>';
    if (actor && actor.isUser && !ending) {
      html += '<form data-form="guess" novalidate><div class="number-form"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" class="number-input" id="guess-input" placeholder="' + target.min + ' - ' + target.max + '" aria-label="Your guess"><button type="submit" class="action" id="guess-submit">SUBMIT GUESS</button></div><div class="form-note" id="guess-note" data-default="YOUR TURN: ENTER A NUMBER BETWEEN ' + target.min + ' AND ' + target.max + '" aria-live="polite">YOUR TURN: ENTER A NUMBER BETWEEN ' + target.min + ' AND ' + target.max + '</div></form>';
    } else if (!ending && actorId) {
      html += '<p class="thinking">SUBJECT ' + actorId + ' IS MAKING A GUESS<span class="dots"></span></p>';
    }
    html += renderVerdict(last, freshVerdict, ending);
    var history = st.targetHistory[st.targetId] || [];
    if (history.length > 0) {
      html += '<div class="guess-history">';
      history.forEach(function (entry, i) {
        var isNew = freshVerdict && sameTarget && i === history.length - 1;
        var resultClass = entry.result === 'CORRECT' ? 'green' : (entry.result === 'HIGH' ? 'red' : 'amber');
        html += '<div class="history-row' + (isNew ? ' fresh' : '') + '"><span>SUBJECT <strong>' + entry.actorId + '</strong> guessed <strong>' + (isNew ? typedText(entry.guess) : entry.guess) + '</strong></span><span class="' + resultClass + '">' + entry.result + '</span></div>';
      });
      html += '</div>';
    }
    var flash = freshVerdict && sameTarget && last.result !== 'CORRECT' ? ' range-flash' : '';
    html += '</div><div><div class="target-box"><p class="label">TARGET SUBJECT</p><span class="target-id">SUBJECT ' + st.targetId + '</span><div class="target-range"><span class="' + flash + '">' + target.min + '</span><span class="' + flash + '">' + target.max + '</span></div></div><div class="side-panel"><p class="side-title">ACTIVE SUBJECTS</p><div class="roster">';
    st.players.forEach(function (player) {
      var stateLabel = player.active ? '<span class="state">ACTIVE</span>' : '<span class="state">REMOVED</span>';
      html += '<div class="roster-row ' + (player.active ? '' : 'removed') + '"><span>SUBJECT ' + player.id + '</span>' + stateLabel + '</div>';
    });
    html += '</div></div></div></div></div></div>';
    return html;
  }

  function renderResult() {
    var winner = game.state.players.find(function (p) { return p.id === game.state.winnerId; });
    var winnerLabel = winner && winner.isUser ? 'YOU' : 'SUBJECT ' + game.state.winnerId;
    var html = '<div class="center-shell"><div class="result"><p class="result-complete">CORRECT &mdash; TARGET MATCH</p><p class="eyebrow">EXPERIMENT COMPLETE</p><h1>TARGET IDENTIFIED</h1><div class="result-winner"><span class="winner-label">WINNER</span><span class="winner-id">' + winnerLabel + '</span></div><p class="result-state green">RESULT: SUCCESS</p><div class="result-actions"><button class="action" data-action="restart">RESTART EXPERIMENT</button><button class="action secondary" data-action="menu">RETURN TO NEXA/OS</button></div></div></div>';
    return html;
  }

  function renderArchive() {
    var entries = [];
    entries.push({ title: 'EXPERIMENT_01.log', body: '<p style="color:var(--muted);margin:0;">EXPERIMENT: HIGH / LOW<br>TYPE: NUMERICAL PREDICTION<br>STATUS: ACTIVE<br><br>INITIATED: 1992.11.03<br>SUBJECTS: MULTIPLE<br><br>OBJECTIVE:<br>MEASURE COGNITIVE RESPONSE UNDER COMPETITIVE PRESSURE</p>' });
    if (firstMatchComplete || taskProgress >= 2) {
      entries.push({ title: 'SUBJECT_083.log', body: '<p style="color:var(--muted);margin:0;">SUBJECT: 083<br>FIRST SESSION: COMPLETE<br><br>COGNITIVE RESPONSE: NORMAL<br>COMPLIANCE: 100%<br><br>OBSERVATION:<br>SUBJECT DID NOT QUESTION THE PURPOSE OF THE TEST.<br><br>NEXT SESSION:<br>PENDING</p>' });
    }
    if (taskProgress >= 3) {
      entries.push({ title: 'OBSERVATION_083.log', body: '<p style="color:var(--muted);margin:0;">SUBJECT: 083<br><br>SESSION COUNT: 01<br><br>BEHAVIOR:<br>SUBJECT FOLLOWED ALL INSTRUCTIONS.<br><br>OBSERVATION:<br>NO RESISTANCE DETECTED.<br><br>STATUS:<br>CONTINUE OBSERVATION.</p>' });
    }
    if (taskProgress >= 5) {
      entries.push({ title: 'INCIDENT_1103.txt', body: '<p style="color:var(--muted);margin:0;">NEXA INDUSTRIES<br>INCIDENT REPORT<br><br>DATE:<br>1992.11.03<br><br>LOCATION:<br>BEHAVIORAL RESEARCH DIVISION<br><br>STATUS:<br>RESTRICTED<br><br>PARTICIPANTS:<br>[REDACTED]<br><br>DETAILS:<br>[CORRUPTED]</p>' });
    } else {
      entries.push({ title: 'INCIDENT_1103.txt', body: '<p class="access-denied">ACCESS DENIED<br>CLEARANCE LEVEL: 04 REQUIRED</p>', denied: true });
    }
    entries.push({ title: 'SHUTDOWN.log', body: '<p class="access-denied">ACCESS DENIED<br>CLEARANCE LEVEL: 04 REQUIRED</p>', denied: true });
    var html = '<div class="screen-shell"><div class="panel" style="max-width:840px;margin:auto;"><div class="panel-head"><h2>ARCHIVE</h2></div><div class="back-row"><button class="link-button" data-action="menu">← BACK TO NEXA/OS</button></div><p style="color:var(--muted);margin-bottom:24px;">C:\\NEXA\\ARCHIVE\\</p><div class="archive-grid">';
    entries.forEach(function (entry) {
      if (entry.denied) {
        html += '<details class="archive-entry"><summary>' + entry.title + '<span></span></summary><div class="archive-body" data-denied="true">' + entry.body + '</div></details>';
      } else {
        html += '<details class="archive-entry"><summary>' + entry.title + '<span></span></summary><div class="archive-body">' + entry.body + '</div></details>';
      }
    });
    html += '</div></div></div>';
    return html;
  }

  function renderSystemLog() {
    var logs = ['[03:17:42] SYSTEM BOOT', '[03:17:46] SUBJECT 083 CONNECTED'];
    if (taskAccepted) logs.push('[03:18:02] TASK ' + String(taskProgress).padStart(2, '0') + ' CREATED');
    systemLogs.forEach(function (log) {
      if (logs.indexOf(log) === -1) logs.push(log);
    });
    if (taskProgress >= 4) {
      logs.push('[03:21:44] UNKNOWN PROCESS DETECTED');
      logs.push('[03:21:45] PROCESS TERMINATED');
      logs.push('[03:21:46] ...');
    }
    var html = '<div class="screen-shell"><div class="panel" style="max-width:740px;margin:auto;"><div class="panel-head"><h2>SYSTEM LOG</h2></div><div class="back-row"><button class="link-button" data-action="menu">← BACK TO NEXA/OS</button></div><div style="border:1px solid var(--line);background:var(--void);padding:20px;font-size:11px;line-height:1.7;color:var(--muted);">';
    logs.forEach(function (log) {
      html += '<p style="margin:0;">' + log + '</p>';
    });
    html += '</div></div></div>';
    return html;
  }

  function viewKey() {
    var s = game.state;
    return [bootComplete, taskAccepted, currentView, s.phase, s.pickStage, s.autoSelecting, s.pickLocked,
      s.currentActorId, s.targetId, s.turnToken, s.matchEnding, s.winnerId, s.players.length, verdictKey(s.lastResult)].join('|');
  }

  function buildView() {
    var phase = game.state.phase;
    if (!bootComplete) return renderBoot();
    if (currentView === 'ONLINE' && window.OnlineLobby) return OnlineLobby.render();   // онлайн-лобби (onlinelobby.js): не закрыто первыми заданиями — друг приходит по ссылке
    var menuLike = phase === PHASES.MENU || currentView === 'ARCHIVE' || currentView === 'SYSTEM_LOG' || currentView === 'MISSIONS' || currentView === 'SHOP';
    if ((!taskAccepted || introLocked()) && menuLike) return renderTaskDialog();   // пока первые 6 заданий не пройдены, кроме задания ничего нет
    if (currentView === 'SHOP' && window.Toys) return Toys.renderShop();
    if (currentView === 'MISSIONS') return renderMissions();
    if (currentView === 'ARCHIVE') return renderArchive();
    if (currentView === 'SYSTEM_LOG') return renderSystemLog();
    if (phase === PHASES.MENU) return renderDesktop();
    if (phase === PHASES.EXPERIMENT) return renderExperimentSelect();
    if (phase === PHASES.PLAYERS) return renderPlayerSelect();
    if (phase === PHASES.INITIALIZATION) return renderInitialization();
    if (phase === PHASES.PARTICIPANTS) return renderParticipants();
    if (phase === PHASES.PICKING) return renderPicking();
    if (phase === PHASES.GUESSING) return renderGuessing();
    if (phase === PHASES.RESULT) return renderResult();
    return '';
  }

  function afterRender() {
    if (tableActive) return;
    var dlg = document.getElementById('settings');
    if (dlg && dlg.open) return;
    var el = document.getElementById('pick-input');
    if (!el || el.disabled) el = document.getElementById('guess-input');
    if (el && !el.disabled) {
      try {
        el.focus({ preventScroll: true });
        var len = el.value.length;
        el.setSelectionRange(len, len);
      } catch (e) {}
    }
  }

  function render() {
    var screen = document.getElementById('screen');
    if (!screen || tableActive) return;
    var html;
    try {
      html = buildView();
    } catch (err) {
      console.error('[render]', err);
      html = '<div class="center-shell"><div class="panel" style="max-width:540px;"><p class="eyebrow">SYSTEM FAULT</p><h2 class="red">DISPLAY ERROR</h2><p class="muted">Screen could not be drawn.</p><button class="action centered" data-action="menu">[RETURN TO NEXA/OS]</button></div></div>';
    }
    screen.innerHTML = html;
    lastKey = viewKey();
    afterRender();
    if (window.Lobby3D) Lobby3D.sync(lobbyView());
    if (window.OnlineLobby) OnlineLobby.afterRender(currentView === 'ONLINE');
  }

  // экраны NEXA/OS (рабочий стол, задание, миссии, магазин, архив, лог): за ними идёт 3D-фон лобби
  function lobbyView() {
    if (!bootComplete || missionActive || tableActive) return false;
    return game.state.phase === PHASES.MENU || currentView === 'ARCHIVE' || currentView === 'SYSTEM_LOG' || currentView === 'MISSIONS' || currentView === 'SHOP';
  }

  function setNote(id, html, kind) {
    var note = document.getElementById(id);
    if (!note) return;
    note.className = 'form-note' + (kind ? ' ' + kind : '');
    note.innerHTML = html;
  }

  function clearNote(id) {
    var note = document.getElementById(id);
    if (note && note.classList.contains('error')) {
      note.className = 'form-note';
      note.textContent = note.getAttribute('data-default') || '';
    }
  }

  function rejectInput(input, noteId, reason) {
    audio.playSfx('error');
    setNote(noteId, '<span class="red">INVALID VALUE</span><br>' + (reason === 'EMPTY' ? 'NUMBER REQUIRED' : 'VALUE OUT OF RANGE'), 'error');
    input.classList.add('shake');
    setTimeout(function () { input.classList.remove('shake'); }, 320);
    try { input.focus({ preventScroll: true }); } catch (e) {}
  }

  var MISSION_LOGS = {
    1: '[03:24:10] TASK 01 COMPLETE. CALIBRATION NOMINAL',
    2: '[03:31:52] TASK 02 COMPLETE. SUBJECT 024 RECORDED',
    3: '[03:40:07] TASK 03 COMPLETE. DEVIATION CONFIRMED',
    4: '[03:52:31] TASK 04 COMPLETE. INCIDENT 1103 FILE OPENED',
    5: '[04:03:19] TASK 05 COMPLETE. PROCESS STATUS UNKNOWN',
    6: '[04:17:00] TASK 06 COMPLETE. EXPERIMENT 01 CLOSED',
    7: '[04:26:41] TASK 07 COMPLETE. CONTAINMENT BREACHED',
    8: '[04:38:05] TASK 08 COMPLETE. PROFICIENCY CONFIRMED',
    9: '[04:51:12] TASK 09 COMPLETE. REACTOR WING ONLINE',
    10: '[05:02:33] TASK 10 COMPLETE. SURFACE ACCESS GRANTED',
    11: '[05:14:50] TASK 11 COMPLETE. HUNTER PROCESS TERMINATED',
    12: '[05:29:18] TASK 12 COMPLETE. TRANSIT HIJACKED',
    13: '[05:43:07] TASK 13 COMPLETE. WARDEN OFFLINE',
    14: '[05:55:26] TASK 14 COMPLETE. CORRIDOR CLEARED',
    15: '[06:08:44] TASK 15 COMPLETE. CONTROL ROOM COMPROMISED',
    16: '[06:21:00] TASK 16 COMPLETE. NEXA PROTOCOL ENDED'
  };

  // задания 17–47 описаны в missions4data.js / heist.js (скрипты с defer подключены раньше app.js)
  if (window.Missions && Missions.META) {
    Object.keys(Missions.META).map(Number).sort(function (a, b) { return a - b; }).forEach(function (id) {
      var m = Missions.META[id];
      if (!TASKS[id - 1]) TASKS[id - 1] = { id: id, title: m.title, desc: m.desc };
      if (m.log) MISSION_LOGS[id] = m.log;
    });
  }

  // NEXA/OS -> 3D миссия -> NEXA/OS. Three.js и мир загружаются только здесь и выгружаются после миссии.
  function startMission(replayId, force) {
    var id = replayId || taskProgress;
    if (missionActive || !window.Missions || id < 1 || id > Missions.TASKS) return;
    if (!force && id > taskProgress && completedTasks.indexOf(id) === -1) return;   // закрытые миссии не запускаются
    fromList = !!replayId;
    missionActive = true;
    if (window.Lobby3D) Lobby3D.sync(false);
    audio.stopMusic();
    audio.stopHarddrive();                  // во время миссии шум жёсткого диска не нужен — вернётся на NEXA/OS
    Missions.start(id, {
      audio: audio,                         // громкости и вкл/выкл звука для процедурных звуков миссий
      playSfx: function (k) { audio.playSfx(k); },
      onStage: function (taskId, stage) { missionProgress[taskId] = stage; saveProgress(); },
      onCutscene: function (name) { if (cutscenesSeen.indexOf(name) === -1) { cutscenesSeen.push(name); saveProgress(); } },
      onComplete: function (taskId) { endMission(taskId, true); },
      onExit: function (taskId) { endMission(taskId, false); }
    });
  }

  function endMission(taskId, done) {
    missionActive = false;
    var advanced = false;
    if (done) {
      if (window.Toys) Toys.reward(taskId);
      if (completedTasks.indexOf(taskId) === -1) completedTasks.push(taskId);
      missionProgress[taskId] = 'complete';
      if (taskProgress === taskId) { taskProgress = taskId + 1; advanced = true; if (taskProgress === INTRO_TASKS + 1) justUnlocked = true; }
      addSystemLog(MISSION_LOGS[taskId]);
      if (advanced) taskAccepted = false;   // следующий TASK; повтор старой миссии прогресс не трогает
    }
    currentView = fromList && !advanced ? 'MISSIONS' : 'GAME';
    fromList = false;
    saveProgress();
    audio.startHarddrive();
    audio.playMusic('menu');
    render();
  }

  // Песочница: тренировка аима и спавн врагов, прогресс сюжета не трогает.
  function startSandbox() {
    if (missionActive || !window.Missions || introLocked()) return;
    missionActive = true;
    if (window.Lobby3D) Lobby3D.sync(false);
    audio.stopMusic();
    audio.stopHarddrive();
    var noop = function () {};
    var back = function () { endSandbox(); };
    var run = Missions.start('sandbox', { audio: audio, playSfx: function (k) { audio.playSfx(k); }, onStage: noop, onCutscene: noop, onComplete: back, onExit: back });
    if (!run) { missionActive = false; audio.startHarddrive(); audio.playMusic('menu'); }
  }
  function endSandbox() {
    missionActive = false;
    currentView = 'GAME';
    audio.startHarddrive();
    audio.playMusic('menu');
    render();
  }

  // Онлайн (coop.js): тот же режим запускается у обоих игроков; прогресс сюжета не трогаем, по выходу — обратно в онлайн-лобби
  function startCoop(spec) {
    if (missionActive || !window.Missions) return false;
    var id = spec.mode === 'mission' ? spec.mission : spec.mode === 'br' ? 'brbox' : 'coopbox';
    if (id !== 'coopbox' && id !== 'brbox' && (id < 1 || id > 48 || !Missions._core.MISSIONS[id])) return false;
    missionActive = true;
    if (window.Lobby3D) Lobby3D.sync(false);
    audio.stopMusic();
    audio.stopHarddrive();
    var noop = function () {};
    var back = function () { missionActive = false; currentView = 'ONLINE'; audio.startHarddrive(); audio.playMusic('menu'); if (window.NexaCoop) NexaCoop.end(); render(); };
    var run = Missions.start(id, { audio: audio, playSfx: function (k) { audio.playSfx(k); }, onStage: noop, onCutscene: noop, onComplete: back, onExit: back, coop: spec });
    if (!run) { missionActive = false; audio.startHarddrive(); audio.playMusic('menu'); return false; }
    return true;
  }

  function handleAction(action, value) {
    if (introLocked() && action !== 'start-mission' && !(action === 'menu' && currentView === 'ONLINE')) return;   // первые 6 заданий обязательны: магазин, песочница, терминал, архив и повторы закрыты
    if (window.Toys && Toys.action(action, value)) return;
    if (window.OnlineLobby && OnlineLobby.action(action, value)) return;
    if (action === 'accept-task') {
      taskAccepted = true;
      audio.playSfx('notification');
      saveProgress();
      render();
    } else if (action === 'start-mission') {
      startMission();
    } else if (action === 'missions') {
      currentView = 'MISSIONS';
      render();
    } else if (action === 'replay-mission') {
      startMission(Number(value));
    } else if (action === 'play') {
      addSystemLog('[03:18:14] HIGH_LOW.EXE STARTED');
      game.selectExperiment('HIGH');
    } else if (action === 'archive') {
      currentView = 'ARCHIVE';
      render();
    } else if (action === 'system-log') {
      currentView = 'SYSTEM_LOG';
      render();
    } else if (action === 'menu') {
      currentView = 'GAME';
      audio.playMusic('menu');
      game.startMenu();
      render();
    } else if (action === 'experiment') {
      game.selectExperiment('HIGH');
    } else if (action === 'players') {
      game.selectParticipants(Number(value));
      game.beginInitialization();
    } else if (action === 'begin-round') {
      game.beginRound();              // музыка PICK запускается событием 'picking-started'
    } else if (action === 'restart') {
      audio.playMusic('menu');        // до PICK звучит menu, pick не должен играть на экране участников
      game.restartMatch();
    }
  }

  function handleForm(formType, form) {
    var st = game.state;
    if (formType === 'pick') {
      var input = form.querySelector('#pick-input');
      if (!input || input.disabled) return;
      if (st.phase !== PHASES.PICKING || st.selectionLocked || st.pickLocked || st.pickStage !== 'INPUT') return;
      var parsed = HighLow.parseNumber(input.value, 1, st.rangeMax);
      if (!parsed.ok) { rejectInput(input, 'pick-note', parsed.reason); return; }
      var btn = form.querySelector('#pick-lock');
      if (btn) btn.classList.add('pressed');
      audio.playSfx('mouse');
      var result = game.lockNumber('083', parsed.value);
      if (!result.ok && result.reason !== 'CLOSED' && result.reason !== 'ALREADY_LOCKED') rejectInput(input, 'pick-note', result.reason);
    } else if (formType === 'guess') {
      var guessInput = form.querySelector('#guess-input');
      var bounds = game.publicTarget();
      if (!guessInput || !bounds || st.phase !== PHASES.GUESSING || st.matchEnding || st.currentActorId !== '083') return;
      var p = HighLow.parseNumber(guessInput.value, bounds.min, bounds.max);
      if (!p.ok) { rejectInput(guessInput, 'guess-note', p.reason); return; }
      audio.playSfx('mouse');
      var res = game.submitGuess(st.currentActorId, st.targetId, p.value, st.turnToken);
      if (!res.ok) rejectInput(guessInput, 'guess-note', 'RANGE');
    }
  }

  // Обработчики вешаются ОДИН раз на #screen (делегирование) — не пересоздаются при каждом render().
  function bindScreen() {
    var screen = document.getElementById('screen');
    screen.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
      if (!el || !screen.contains(el) || el.disabled) return;
      audio.playSfx('mouse');
      handleAction(el.getAttribute('data-action'), el.getAttribute('data-value'));
    });
    screen.addEventListener('submit', function (e) {
      var form = e.target && e.target.closest ? e.target.closest('[data-form]') : null;
      if (!form) return;
      e.preventDefault();
      handleForm(form.getAttribute('data-form'), form);
    });
    screen.addEventListener('input', function (e) {
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains('number-input')) return;
      var clean = t.value.replace(/\D+/g, '');
      if (clean !== t.value) t.value = clean;
      clearNote(t.id === 'pick-input' ? 'pick-note' : 'guess-note');
    });
    screen.addEventListener('toggle', function (e) {
      var d = e.target;
      if (d && d.tagName === 'DETAILS' && d.open && d.querySelector('[data-denied]')) audio.playSfx('denied');
    }, true);
  }

  game.onUpdate = function () {
    if (!bootComplete) return;
    if (tableActive) { window.HLTable && HLTable.onUpdate(game.state); return; }
    if (viewKey() !== lastKey) { render(); return; }
    updatePickView();
  };

  // 3D-стол: игрок и субъекты сидят за одним столом, интерфейс HIGH/LOW живёт на ноутбуках (table.js). ?classic — старый 2D-экран.
  function tableAllowed() {
    return !!(window.HLTable && window.Missions && window.HLScreen && !/[?&]classic(?![A-Za-z0-9_])/.test(location.search));
  }
  function startTable() {
    if (tableActive || missionActive || !tableAllowed()) return false;
    tableActive = true;
    if (window.Lobby3D) Lobby3D.sync(false);
    audio.stopHarddrive();
    var ok = HLTable.start(game, {
      audio: audio,
      playSfx: function (k) { audio.playSfx(k); },
      stopMusic: function () { audio.stopMusic(); },
      restart: function () { handleAction('restart'); },
      onEnd: endTable
    });
    if (!ok) { tableActive = false; audio.startHarddrive(); }
    return ok;
  }

  // reason: 'dead' — число игрока угадали (катсцена, цитата → всасывает в лобби), 'menu' — игрок вышел, 'fail' — 3D не запустился (откат на 2D)
  function endTable(reason) {
    tableActive = false;
    audio.startHarddrive();
    if (reason === 'fail') { render(); return; }
    currentView = 'GAME';
    audio.playMusic('menu');
    game.startMenu();
    render();
    if (reason === 'dead') {
      var term = document.querySelector('.terminal');
      if (term) {
        term.classList.add('suck-in');
        setTimeout(function () { term.classList.remove('suck-in'); }, 1600);
      }
    }
  }

  game.onEvent = function (event, data) {
    if (tableActive) HLTable.onEvent(event, data);
    if (event === 'participants-ready' && !tableActive && startTable()) return;
    if (event === 'picking-started') {
      audio.playMusic('pick');
    } else if (event === 'picking-complete') {
      audio.stopMusic();              // pick.m4a полностью останавливается...
      audio.playMusic('game');        // ...и только потом запускается game.mp3
    } else if (event === 'pick-stage') {
      if (data.stage === 'EXPIRED') audio.playSfx('notification');
      else if (data.stage === 'AUTOLOCKED') audio.playSfx('succesfully');
    } else if (event === 'number-locked' && data.user) {
      audio.playSfx('succesfully');
    } else if (event === 'guess-result') {
      if (data.result === 'CORRECT') audio.playSfx('succesfully');
      else audio.playSfx('notification');
    } else if (event === 'match-complete') {
      if (!firstMatchComplete) {
        firstMatchComplete = true;
        addSystemLog('[03:19:03] EXPERIMENT 01 COMPLETE');
        saveProgress();
        setTimeout(function () { audio.playSfx('notification'); }, 1500);
      }
    } else if (event === 'menu') {
      currentView = 'GAME';
      audio.playMusic('menu');
    } else if (event === 'participants-selected') {
      currentView = 'GAME';
    }
  };

  // Редкие короткие глитчи (не постоянная тряска): один цикл на всё приложение.
  function scheduleGlitch() {
    setTimeout(function () {
      var term = document.querySelector('.terminal');
      if (term && bootComplete && !document.hidden) {
        if (window.Toys && !missionActive) Toys.glitchSfx();
        if (window.Lobby3D && !missionActive) Lobby3D.glitch();     // «лаг» = смена кадра 3D-фона на случайный
        term.classList.add('glitch-once');
        setTimeout(function () { term.classList.remove('glitch-once'); }, 280);
      }
      scheduleGlitch();
    }, 9000 + Math.floor(Math.random() * 13000));
  }

  function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function lsSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }

  function bindSlider(id, outId, key, setter, fallback) {
    var el = document.getElementById(id);
    var out = document.getElementById(outId);
    if (!el) return;
    var saved = parseFloat(lsGet(key));
    var value = isFinite(saved) ? Math.max(0, Math.min(1, saved)) : fallback;
    setter(value);
    el.value = Math.round(value * 100);
    if (out) out.textContent = Math.round(value * 100) + '%';
    el.addEventListener('input', function () {
      var v = el.value / 100;
      setter(v);
      if (out) out.textContent = el.value + '%';
      lsSet(key, String(v));
    });
  }

  document.getElementById('open-settings').addEventListener('click', function () {
    audio.unlock();
    audio.playSfx('mouse');
    document.getElementById('settings').showModal();
  });

  document.getElementById('settings').addEventListener('close', function () {
    audio.playSfx('mouse');
    afterRender();
  });

  document.getElementById('music-toggle').addEventListener('change', function (e) {
    audio.setMusicEnabled(e.target.checked);
    lsSet('musicEnabled', e.target.checked);
  });

  document.getElementById('sfx-toggle').addEventListener('change', function (e) {
    audio.setSfxEnabled(e.target.checked);
    lsSet('sfxEnabled', e.target.checked);
  });

  bindSlider('volume', 'volume-value', 'masterVolume', audio.setMasterVolume.bind(audio), 0.55);
  bindSlider('music-volume', 'music-volume-value', 'musicVolume', audio.setMusicVolume.bind(audio), 1);
  bindSlider('sfx-volume', 'sfx-volume-value', 'sfxVolume', audio.setSfxVolume.bind(audio), 1);
  bindSlider('hdd-volume', 'hdd-volume-value', 'hddVolume', audio.setHddVolume.bind(audio), 0.12);

  var qualitySel = document.getElementById('quality');
  if (qualitySel && window.Missions) {
    qualitySel.value = Missions.getQualitySaved ? Missions.getQualitySaved() : Missions.getQuality();
    qualitySel.addEventListener('change', function () { Missions.setQuality(qualitySel.value); });
  }

  var sensRange = document.getElementById('sens'), sensOut = document.getElementById('sens-value');
  if (sensRange && window.Missions) {
    var showSens = function () { sensOut.textContent = sensRange.value + '%'; };
    sensRange.value = Math.round(Missions.getSens() * 100);
    showSens();
    sensRange.addEventListener('input', function () { Missions.setSens(sensRange.value / 100); showSens(); });
  }

  var bloodSel = document.getElementById('blood');
  if (bloodSel && window.Missions && Missions.getBlood) {
    bloodSel.value = Missions.getBlood();
    bloodSel.addEventListener('change', function () { Missions.setBlood(bloodSel.value); });
  }

  var langSel = document.getElementById('lang');
  if (langSel && window.I18N) {
    langSel.value = I18N.lang;
    langSel.addEventListener('change', function () { audio.playSfx('mouse'); I18N.setLang(langSel.value); showDataStatus && showDataStatus(); });
  }

  // Дисклеймер: показывается при первом запуске, потом доступен из настроек
  var disc = document.getElementById('disclaimer'), discOk = document.getElementById('disc-ok');
  function showDisclaimer() { if (disc) { disc.hidden = false; discOk.focus(); } }
  if (disc && discOk) {
    discOk.addEventListener('click', function () { disc.hidden = true; lsSet('disclaimerOk', '1'); audio.playSfx('mouse'); });
    document.getElementById('show-disclaimer').addEventListener('click', function () {
      var st = document.getElementById('settings');
      if (st.open) st.close();
      showDisclaimer();
    });
  }

  // GAME DATA: статус единоразовой загрузки файлов (preload.js) и принудительная перезагрузка
  var dataStatus = document.getElementById('data-status'), redl = document.getElementById('redownload');
  function showDataStatus() {
    if (!dataStatus) return;
    if (!window.NexaPreload || !NexaPreload.status) { dataStatus.textContent = 'Game data: loaded from the network.'; return; }
    NexaPreload.status().then(function (s) {
      dataStatus.textContent = !s.supported ? 'Game data: this browser cannot store files — loaded from the network.'
        : s.missing ? 'Game data: ' + s.missing + ' of ' + s.total + ' files missing — they will download on next launch.'
        : 'Game data: all ' + s.total + ' files stored on this device.';
    }).catch(function () {});
  }
  if (redl) {
    redl.addEventListener('click', function () { audio.playSfx('mouse'); if (window.NexaPreload && NexaPreload.reset) NexaPreload.reset(); });
    document.getElementById('open-settings').addEventListener('click', showDataStatus);
  }

  document.getElementById('fullscreen').addEventListener('click', function () {
    audio.playSfx('mouse');
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(function () {
        document.getElementById('fullscreen-status').textContent = 'Fullscreen active. Press ESC to exit.';
        try { if (window.matchMedia('(pointer: coarse)').matches && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (e) {}
      }).catch(function () {
        document.getElementById('fullscreen-status').textContent = 'Fullscreen not supported.';
      });
    } else {
      document.exitFullscreen();
    }
  });

  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement) {
      document.getElementById('fullscreen-status').textContent = '';
    }
  });

  var savedMusic = lsGet('musicEnabled');
  var savedSfx = lsGet('sfxEnabled');
  if (savedMusic !== null) {
    document.getElementById('music-toggle').checked = savedMusic === 'true';
    audio.setMusicEnabled(savedMusic === 'true');
  }
  if (savedSfx !== null) {
    document.getElementById('sfx-toggle').checked = savedSfx === 'true';
    audio.setSfxEnabled(savedSfx === 'true');
  }

  // Любое первое действие пользователя (мышь / клавиатура) снимает блокировку автоплея.
  ['pointerdown', 'keydown', 'click'].forEach(function (name) {
    document.addEventListener(name, function () { audio.unlock(); }, { once: true, capture: true });
  });

  function start() {
    loadProgress();
    if (window.Toys) Toys.init({ audio: audio, setView: function (v) { currentView = v; }, render: render, startSandbox: startSandbox });
    if (window.OnlineLobby) OnlineLobby.init({ audio: audio, setView: function (v) { currentView = v; }, render: render, startCoop: startCoop });
    bindScreen();
    audio.startHarddrive();        // единственный экземпляр; стартует сразу после unlock, на время 3D миссии выключается (startMission/endMission)
    audio.playSfx('boot');
    render();                      // экран BOOT (раньше до конца загрузки экран был пустым)
    scheduleGlitch();
    if (disc && lsGet('disclaimerOk') !== '1') showDisclaimer();
    setTimeout(function () {
      bootComplete = true;
      audio.playMusic('menu');
      render();
      // отладка: ?go=48 — сразу запустить миссию в обход замков списка; с ?m48=<этап> финал начнётся с этого этапа (flash, head, bombs…)
      if (window.OnlineLobby) OnlineLobby.boot();   // ссылка ?join=… сразу открывает онлайн-лобби
      var go = /[?&]go=(\d+)/.exec(location.search);
      if (go) startMission(Number(go[1]), true);
    }, 2800);
  }
  // NEXA/OS стартует после единоразовой загрузки файлов (preload.js) и заставки студии (splash.js); без них — сразу
  (window.NexaPreload && NexaPreload.ready ? NexaPreload.ready : Promise.resolve())
    .then(function () { return window.Splash ? Splash.play() : null; })
    .catch(function () {})
    .then(start);
}());
