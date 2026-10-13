(function () {
  'use strict';

  var PHASES = Object.freeze({
    MENU: 'MAIN_MENU',
    EXPERIMENT: 'EXPERIMENT_SELECT',
    PLAYERS: 'PLAYER_COUNT',
    INITIALIZATION: 'INITIALIZATION',
    PARTICIPANTS: 'PARTICIPANTS',
    PICKING: 'NUMBER_PICKING',
    GUESSING: 'GUESSING',
    RESULT: 'RESULT'
  });
  var RANGES = [50, 100, 250, 500, 1000];
  var SUBJECT_POOL = ['014', '027', '031', '044', '056', '068'];
  var STYLES = ['midpoint', 'risky', 'chaotic', 'cautious'];

  function defaultClock() { return Date.now(); }
  function defaultRandom() { return Math.random(); }

  function clampInt(value, min, max) {
    var n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) return null;
    return n;
  }

  // Строгий разбор: только цифры, целое, в диапазоне. Возвращает {ok, value} или {ok:false, reason: EMPTY|INVALID|RANGE}
  function parseNumber(raw, min, max) {
    var s = String(raw === null || raw === undefined ? '' : raw).trim();
    if (!s) return { ok: false, reason: 'EMPTY' };
    if (!/^\d+$/.test(s)) return { ok: false, reason: 'INVALID' };
    var n = Number(s);
    if (!Number.isSafeInteger(n) || n < min || n > max) return { ok: false, reason: 'RANGE' };
    return { ok: true, value: n };
  }

  function randomInt(random, min, max) {
    return min + Math.floor(random() * (max - min + 1));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makePlayer(id, isUser, style) {
    return {
      id: id,
      isUser: isUser,
      style: style || null,
      active: true,
      status: 'READY'
    };
  }

  function GameManager(options) {
    options = options || {};
    this.now = options.now || defaultClock;
    this.random = options.random || defaultRandom;
    this.setTimeout = options.setTimeout || window.setTimeout.bind(window);
    this.clearTimeout = options.clearTimeout || window.clearTimeout.bind(window);
    this.setInterval = options.setInterval || window.setInterval.bind(window);
    this.clearInterval = options.clearInterval || window.clearInterval.bind(window);
    this.onUpdate = options.onUpdate || function () {};
    this.onEvent = options.onEvent || function () {};
    this.matchSerial = 0;
    this.timerHandles = [];
    this.intervalHandles = [];
    this.state = this.emptyState();
    this.secrets = Object.create(null);
    this.numberSystem = Object.create(null);
  }

  GameManager.prototype.emptyState = function () {
    return {
      phase: PHASES.MENU,
      experiment: null,
      participantCount: null,
      sessionId: null,
      rangeMax: null,
      pickStartedAt: null,
      pickDeadline: null,
      pickRemaining: null,
      pickLocked: false,
      pickSubmitting: false,
      autoSelecting: false,
      autoSelectedNumber: null,
      selectionLocked: false,   // единый флаг: первый валидный выбор (ручной или авто) закрывает PICK
      lockedValue: null,
      pickStage: 'INPUT',       // INPUT | LOCKED | EXPIRED | AUTO | GENERATED | AUTOLOCKED | COMPLETE | DONE
      matchEnding: false,
      players: [],
      currentActorId: null,
      targetId: null,
      turnToken: null,
      targetBounds: Object.create(null),
      targetHistory: Object.create(null),
      lastResult: null,
      winnerId: null,
      userEliminated: false,
      message: ''
    };
  };

  GameManager.prototype.emit = function (event, data) {
    this.onEvent(event, data || {});
    this.onUpdate(this.getPublicState());
  };

  GameManager.prototype.getPublicState = function () {
    var publicState = clone(this.state);
    publicState.targetBounds = clone(this.state.targetBounds);
    publicState.targetHistory = clone(this.state.targetHistory);
    publicState.players = this.state.players.map(function (player) {
      return {
        id: player.id,
        isUser: player.isUser,
        active: player.active,
        status: player.status
      };
    });
    return publicState;
  };

  GameManager.prototype.getUserSecret = function () {
    return this.secrets['083'] || null;
  };

  GameManager.prototype.cancelScheduled = function () {
    var self = this;
    this.timerHandles.forEach(function (handle) { self.clearTimeout(handle); });
    this.intervalHandles.forEach(function (handle) { self.clearInterval(handle); });
    this.timerHandles = [];
    this.intervalHandles = [];
    this.held = false; this.heldQueue = [];
  };

  // Пауза отложенных событий (ход ИИ, конец матча) на время катсцены 3D-стола. Не влияет на таймер выбора числа.
  GameManager.prototype.hold = function (on) {
    this.held = !!on;
    if (!on && this.heldQueue && this.heldQueue.length) {
      var q = this.heldQueue; this.heldQueue = [];
      q.forEach(function (fn) { fn(); });
    }
  };

  GameManager.prototype.schedule = function (fn, delay) {
    var self = this;
    var handle = this.setTimeout(function () {
      self.timerHandles = self.timerHandles.filter(function (item) { return item !== handle; });
      if (self.held) { (self.heldQueue = self.heldQueue || []).push(fn); return; }   // 3D-стол: пока идёт катсцена, ход игры ждёт
      fn();
    }, delay);
    this.timerHandles.push(handle);
    return handle;
  };

  GameManager.prototype.selectExperiment = function (experiment) {
    if (experiment !== 'HIGH' && experiment !== 'LOW') return false;
    if (this.state.phase !== PHASES.EXPERIMENT && this.state.phase !== PHASES.MENU) return false;
    this.state.experiment = experiment;
    this.state.phase = PHASES.PLAYERS;
    this.emit('experiment-selected');
    return true;
  };

  GameManager.prototype.selectParticipants = function (count) {
    if (count !== 2 && count !== 4) return false;
    if (this.state.phase !== PHASES.PLAYERS) return false;
    this.state.participantCount = count;
    this.state.phase = PHASES.INITIALIZATION;
    this.emit('participants-selected');
    return true;
  };

  GameManager.prototype.beginInitialization = function () {
    if (this.state.phase !== PHASES.INITIALIZATION) return false;
    this.cancelScheduled();
    var self = this;
    this.schedule(function () {
      if (self.state.phase !== PHASES.INITIALIZATION) return;
      self.createParticipants();
      self.state.phase = PHASES.PARTICIPANTS;
      self.emit('participants-ready');
    }, 650);
    return true;
  };

  GameManager.prototype.createParticipants = function () {
    var count = this.state.participantCount || 2;
    var players = [makePlayer('083', true, null)];
    var offset = randomInt(this.random, 0, SUBJECT_POOL.length - 1);
    for (var i = 0; i < count - 1; i += 1) {
      var id = SUBJECT_POOL[(offset + i) % SUBJECT_POOL.length];
      players.push(makePlayer(id, false, STYLES[i % STYLES.length]));
    }
    this.state.players = players;
    this.state.message = 'ALL SUBJECTS READY';
  };

  GameManager.prototype.beginRound = function () {
    if (this.state.phase !== PHASES.PARTICIPANTS) return false;
    this.cancelScheduled();
    this.matchSerial += 1;
    this.state.sessionId = 'NEXA-' + String(this.matchSerial).padStart(4, '0');
    this.state.rangeMax = RANGES[randomInt(this.random, 0, RANGES.length - 1)];
    this.state.pickStartedAt = this.now();
    this.state.pickDeadline = this.state.pickStartedAt + 15000;
    this.state.pickRemaining = 15;
    this.state.pickLocked = false;
    this.state.pickSubmitting = false;
    this.state.autoSelecting = false;
    this.state.autoSelectedNumber = null;
    this.state.selectionLocked = false;
    this.state.lockedValue = null;
    this.state.pickStage = 'INPUT';
    this.state.matchEnding = false;
    this.state.phase = PHASES.PICKING;
    this.state.lastResult = null;
    this.state.winnerId = null;
    this.state.userEliminated = false;
    this.state.currentActorId = null;
    this.state.targetId = null;
    this.state.turnToken = null;
    this.state.targetBounds = Object.create(null);
    this.state.targetHistory = Object.create(null);
    this.secrets = Object.create(null);
    this.numberSystem = Object.create(null);
    this.state.players.forEach(function (player) { player.active = true; player.status = 'THINKING'; });
    this.emit('picking-started');
    this.schedulePickingControllers();
    this.startPickingClock();
    return true;
  };

  GameManager.prototype.startPickingClock = function () {
    var self = this;
    var lastRemaining = self.state.pickRemaining;
    var handle = this.setInterval(function () {
      if (self.state.phase !== PHASES.PICKING || self.state.selectionLocked) {
        self.clearInterval(handle);
        return;
      }
      var left = Math.max(0, self.state.pickDeadline - self.now());
      var remaining = Math.ceil(left / 1000);
      if (remaining !== lastRemaining) {
        self.state.pickRemaining = remaining;
        lastRemaining = remaining;
        self.onUpdate(self.getPublicState());
      }
      if (left <= 0) {
        self.clearInterval(handle);
        // "0" успевает отрисоваться на таймере, затем запускается TIME EXPIRED.
        // Если игрок нажмёт LOCK в это окно — lockNumber увидит просроченный дедлайн и тоже вызовет expirePicking() (он идемпотентен).
        self.schedule(function () { self.expirePicking(); }, 250);
      }
    }, 100);
    this.intervalHandles.push(handle);
  };

  GameManager.prototype.stopPickingClock = function () {
    var self = this;
    this.intervalHandles.forEach(function (handle) { self.clearInterval(handle); });
    this.intervalHandles = [];
  };

  GameManager.prototype.schedulePickingControllers = function () {
    var self = this;
    this.state.players.forEach(function (player) {
      if (player.isUser) return;
      var delay = 800 + Math.floor(self.random() * 11200);
      self.schedule(function () {
        if (self.state.phase !== PHASES.PICKING || self.state.selectionLocked || self.now() >= self.state.pickDeadline) return;
        self.lockNumber(player.id, randomInt(self.random, 1, self.state.rangeMax));
      }, delay);
    });
  };

  // Остальным субъектам, не успевшим выбрать, число назначается тихо.
  GameManager.prototype.fillMissingSecrets = function () {
    var self = this;
    this.state.players.forEach(function (player) {
      if (player.isUser || self.secrets[player.id] !== undefined) return;
      self.secrets[player.id] = randomInt(self.random, 1, self.state.rangeMax);
      player.status = 'LOCKED';
    });
  };

  GameManager.prototype.setStage = function (stage) {
    if (this.state.phase !== PHASES.PICKING) return;
    this.state.pickStage = stage;
    this.emit('pick-stage', { stage: stage });
  };

  GameManager.prototype.runStages = function (steps) {
    var self = this;
    var t = 0;
    steps.forEach(function (step) {
      t += step.after;
      self.schedule(function () {
        if (self.state.phase !== PHASES.PICKING) return;
        step.run();
      }, t);
    });
  };

  GameManager.prototype.lockNumber = function (playerId, value) {
    var state = this.state;
    if (state.phase !== PHASES.PICKING) return { ok: false, reason: 'CLOSED' };
    var isUser = playerId === '083';
    if (state.selectionLocked) return { ok: false, reason: 'CLOSED' };
    if (this.now() >= state.pickDeadline) {
      if (isUser) this.expirePicking();
      return { ok: false, reason: 'CLOSED' };
    }
    var player = state.players.find(function (item) { return item.id === playerId; });
    if (!player || this.secrets[playerId] !== undefined) return { ok: false, reason: 'ALREADY_LOCKED' };
    var parsed = parseNumber(value, 1, state.rangeMax);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };

    if (!isUser) {
      this.secrets[playerId] = parsed.value;
      player.status = 'LOCKED';
      this.emit('number-locked', { playerId: playerId, user: false });
      return { ok: true };
    }

    // Ручной выбор игрока: закрываем PICK сразу и окончательно.
    var self = this;
    state.selectionLocked = true;
    state.pickLocked = true;
    state.pickSubmitting = true;
    state.lockedValue = parsed.value;
    this.secrets[playerId] = parsed.value;
    player.status = 'LOCKED';
    this.stopPickingClock();   // таймер останавливается немедленно
    this.cancelScheduled();    // отменяем отложенные выборы остальных — они будут назначены ниже
    this.fillMissingSecrets();
    state.pickStage = 'LOCKED';
    this.emit('number-locked', { playerId: playerId, user: true, value: parsed.value });
    this.runStages([
      { after: 1100, run: function () { self.setStage('COMPLETE'); } },
      { after: 800, run: function () { self.completePicking(); } }
    ]);
    return { ok: true, value: parsed.value };
  };

  // Время вышло: система сама выбирает число и проводит тот же переход, что и ручной LOCK.
  GameManager.prototype.expirePicking = function () {
    var state = this.state;
    var self = this;
    if (state.phase !== PHASES.PICKING || state.selectionLocked) return false;
    state.selectionLocked = true;
    state.pickLocked = true;
    state.pickSubmitting = true;
    state.autoSelecting = true;
    state.pickRemaining = 0;
    this.stopPickingClock();
    this.cancelScheduled();
    var n = randomInt(this.random, 1, state.rangeMax);
    if (clampInt(n, 1, state.rangeMax) === null) n = 1;
    state.autoSelectedNumber = n;
    state.lockedValue = n;
    this.secrets['083'] = n;
    this.fillMissingSecrets();
    state.pickStage = 'EXPIRED';
    this.emit('pick-stage', { stage: 'EXPIRED' });
    this.runStages([
      { after: 900, run: function () { self.setStage('AUTO'); } },
      { after: 1000, run: function () { self.setStage('GENERATED'); } },
      { after: 1100, run: function () {
        var me = self.state.players.find(function (p) { return p.id === '083'; });
        if (me) me.status = 'LOCKED';
        self.setStage('AUTOLOCKED');
      } },
      { after: 900, run: function () { self.setStage('COMPLETE'); } },
      { after: 700, run: function () { self.completePicking(); } }
    ]);
    return true;
  };

  // Оставлено для совместимости со старым кодом.
  GameManager.prototype.finishPicking = function () { return this.expirePicking(); };

  // PICK -> GAME. Всё состояние первого хода готовится ДО смены фазы и события,
  // поэтому render() никогда не видит наполовину готовую игру (именно это раньше подвешивало переход).
  GameManager.prototype.completePicking = function () {
    var state = this.state;
    if (state.phase !== PHASES.PICKING || state.pickStage === 'DONE') return false;
    this.stopPickingClock();
    this.fillMissingSecrets();
    state.players.forEach(function (player) {
      state.targetBounds[player.id] = { min: 1, max: state.rangeMax };
      state.targetHistory[player.id] = [];
    });
    state.pickStage = 'DONE';
    state.autoSelecting = false;
    state.pickRemaining = 0;
    state.message = 'EXPERIMENT ACTIVE';
    this.setFirstTurn();
    state.phase = PHASES.GUESSING;
    this.emit('picking-complete');
    this.scheduleCurrentController();
    return true;
  };

  GameManager.prototype.activePlayers = function () {
    return this.state.players.filter(function (player) { return player.active; });
  };

  GameManager.prototype.findNextActive = function (id) {
    var players = this.state.players;
    var index = players.findIndex(function (player) { return player.id === id; });
    if (index < 0) return null;
    for (var step = 1; step <= players.length; step += 1) {
      var candidate = players[(index + step) % players.length];
      if (candidate.active) return candidate.id;
    }
    return null;
  };

  GameManager.prototype.setFirstTurn = function () {
    var first = this.state.players[0];
    this.state.currentActorId = first.id;
    this.state.targetId = this.findNextActive(first.id);
    this.state.turnToken = this.state.sessionId + ':turn:1';
    this.state.players.forEach(function (player) { player.status = player.active ? 'ACTIVE' : 'REMOVED'; });
    return true;
  };

  GameManager.prototype.publicTarget = function () {
    var bounds = this.state.targetId ? this.state.targetBounds[this.state.targetId] : null;
    return bounds ? clone(bounds) : null;
  };

  GameManager.prototype.scheduleCurrentController = function () {
    var self = this;
    if (this.state.phase !== PHASES.GUESSING || !this.state.currentActorId) return;
    var actor = this.state.players.find(function (player) { return player.id === self.state.currentActorId; });
    if (!actor || actor.isUser) {
      this.emit('awaiting-user');
      return;
    }
    var token = this.state.turnToken;
    var delay = 1300 + Math.floor(this.random() * 1400);
    this.schedule(function () {
      if (self.state.phase !== PHASES.GUESSING || token !== self.state.turnToken) return;
      var target = self.state.targetId;
      var bounds = self.state.targetBounds[target];
      var history = self.state.targetHistory[target] || [];
      var guess = self.chooseAiGuess(actor, bounds, history);
      self.submitGuess(actor.id, target, guess, token);
    }, delay);
  };

  GameManager.prototype.chooseAiGuess = function (actor, bounds, history) {
    var min = bounds.min;
    var max = bounds.max;
    if (min === max) return min;
    var guess;
    var midpoint = Math.floor((min + max) / 2);
    if (this.random() < 0.12) {
      guess = randomInt(this.random, min, max); // иногда субъект ошибается
    } else if (actor.style === 'risky') {
      guess = this.random() < 0.5 ? min : max;
    } else if (actor.style === 'chaotic') {
      guess = randomInt(this.random, min, max);
    } else if (actor.style === 'cautious') {
      guess = min + Math.max(0, Math.floor((max - min) * 0.35));
    } else {
      var spread = Math.max(1, Math.floor((max - min) * 0.2));
      guess = midpoint + randomInt(this.random, -spread, spread);
    }
    guess = Math.max(min, Math.min(max, guess));
    var seen = Object.create(null);
    history.forEach(function (entry) { seen[entry.guess] = true; });
    if (seen[guess]) {
      for (var n = min; n <= max; n += 1) if (!seen[n]) return n;
    }
    return guess;
  };

  GameManager.prototype.submitGuess = function (actorId, targetId, value, token) {
    if (this.state.phase !== PHASES.GUESSING || this.state.matchEnding) return { ok: false, reason: 'PHASE_CLOSED' };
    if (actorId !== this.state.currentActorId || targetId !== this.state.targetId || token !== this.state.turnToken) {
      return { ok: false, reason: 'STALE_TURN' };
    }
    var actor = this.state.players.find(function (player) { return player.id === actorId; });
    var target = this.state.players.find(function (player) { return player.id === targetId; });
    if (!actor || !target || !actor.active || !target.active || actor.id === target.id) return { ok: false, reason: 'INVALID_ACTOR' };
    var bounds = this.state.targetBounds[targetId];
    var parsed = parseNumber(value, bounds.min, bounds.max);
    if (!parsed.ok) return { ok: false, reason: parsed.reason === 'RANGE' ? 'OUT_OF_RANGE' : parsed.reason };
    var guess = parsed.value;
    var secret = this.secrets[targetId];
    var result = guess < secret ? 'HIGH' : (guess > secret ? 'LOW' : 'CORRECT');
    if (result === 'HIGH') bounds.min = guess + 1;
    if (result === 'LOW') bounds.max = guess - 1;
    this.state.targetHistory[targetId].push({ actorId: actorId, guess: guess, result: result });
    this.state.lastResult = { actorId: actorId, targetId: targetId, guess: guess, result: result, range: { min: bounds.min, max: bounds.max } };
    if (result === 'CORRECT') {
      target.active = false;
      target.status = 'REMOVED';
      if (targetId === '083') this.state.userEliminated = true;
    }
    var self = this;
    var remaining = this.activePlayers();
    if (remaining.length <= 1) {
      // Финальный CORRECT сначала показывается на экране игры, потом открывается RESULT.
      this.state.winnerId = remaining.length ? remaining[0].id : actorId;
      this.state.matchEnding = true;
      this.state.currentActorId = null;
      this.state.turnToken = null;
      this.emit('guess-result', clone(this.state.lastResult));
      this.schedule(function () {
        if (self.state.phase !== PHASES.GUESSING) return;
        self.state.phase = PHASES.RESULT;
        self.state.targetId = null;
        self.emit('match-complete');
      }, 2600);
      return { ok: true, result: result, winnerId: this.state.winnerId };
    }
    var nextActor = this.findNextActive(actorId);
    var nextTarget = this.findNextActive(nextActor);
    this.state.currentActorId = nextActor;
    this.state.targetId = nextTarget;
    this.state.turnToken = this.state.sessionId + ':turn:' + (this.state.targetHistory[targetId].length + Date.now());
    this.state.players.forEach(function (player) { if (player.active) player.status = 'ACTIVE'; });
    this.emit('guess-result', clone(this.state.lastResult));   // уже с состоянием следующего хода — UI рисует один раз
    this.scheduleCurrentController();
    return { ok: true, result: result };
  };

  GameManager.prototype.startMenu = function () {
    this.cancelScheduled();
    this.state = this.emptyState();
    this.secrets = Object.create(null);
    this.numberSystem = Object.create(null);
    this.emit('menu');
  };

  GameManager.prototype.restartMatch = function () {
    if (!this.state.experiment || !this.state.participantCount) return false;
    var experiment = this.state.experiment;
    var count = this.state.participantCount;
    this.cancelScheduled();
    this.state = this.emptyState();
    this.state.experiment = experiment;
    this.state.participantCount = count;
    this.state.phase = PHASES.INITIALIZATION;
    this.createParticipants();
    this.emit('restart');
    this.beginInitialization();
    return true;
  };

  window.HighLow = {
    PHASES: PHASES,
    RANGES: RANGES,
    GameManager: GameManager,
    clampInt: clampInt,
    parseNumber: parseNumber
  };
}());
