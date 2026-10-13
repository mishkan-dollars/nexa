(function () {
  'use strict';

  // srcs: первый файл — основной, остальные — запасные имена (если основного нет, браузер пробует следующий).
  var TRACKS = {
    boot: { srcs: ['assets/boot.mp3'], volume: 0.7, loop: false },
    menu: { srcs: ['assets/menu.mp3'], volume: 0.6, loop: true },
    game: { srcs: ['assets/game.mp3'], volume: 0.6, loop: true },
    pick: { srcs: ['assets/pick.m4a'], volume: 0.6, loop: false },
    harddrive: { srcs: ['assets/harddrive.mp3'], volume: 1.0, loop: true },
    mouse: { srcs: ['assets/mouse.mp3'], volume: 0.4, loop: false },
    notification: { srcs: ['assets/notification.mp3'], volume: 0.55, loop: false },
    denied: { srcs: ['assets/denied.mp3'], volume: 0.6, loop: false },
    error: { srcs: ['assets/error.mp3'], volume: 0.55, loop: false },
    poweroff: { srcs: ['assets/poweroff.mp3'], volume: 0.6, loop: false },
    succesfully: { srcs: ['assets/succesfully.mp3', 'assets/sucsesfully.mp3'], volume: 0.5, loop: false }
  };

  var MUSIC_KEYS = ['menu', 'game', 'pick'];
  var SFX_KEYS = ['boot', 'mouse', 'notification', 'denied', 'error', 'poweroff', 'succesfully'];

  function clamp01(v) {
    v = Number(v);
    if (!isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
  }

  function AudioManager() {
    this.elements = Object.create(null);
    this.unlocked = false;
    this.masterVolume = 0.55;
    this.musicVolume = 1.0;
    this.sfxVolume = 1.0;
    this.hddVolume = 0.12;          // Hard Drive Volume: 12% по умолчанию
    this.musicEnabled = true;
    this.sfxEnabled = true;
    this.currentMusic = null;       // что реально играет
    this.desiredMusic = null;       // что должно играть (запоминается, даже если аудио ещё заблокировано)
    this.wantHarddrive = false;
    this.harddriveStarted = false;
    this.lastMouseClick = 0;

    var self = this;
    Object.keys(TRACKS).forEach(function (key) {
      var track = TRACKS[key];
      var audio = new Audio();
      var entry = { audio: audio, baseVolume: track.volume, srcs: track.srcs, srcIndex: 0 };
      audio.loop = track.loop;
      audio.preload = 'auto';
      audio.addEventListener('error', function () {
        if (entry.srcIndex < entry.srcs.length - 1) {
          entry.srcIndex += 1;
          audio.src = entry.srcs[entry.srcIndex];
          audio.load();
        }
      });
      audio.src = entry.srcs[0];
      self.elements[key] = entry;
    });
    this.updateAllVolumes(); // раньше громкость применялась только после движения слайдера => всё играло на 100%
  }

  AudioManager.prototype.unlock = function () {
    if (this.unlocked) return;
    this.unlocked = true;
    // Ничего не проигрываем "на пробу": раньше play()+pause() в unlock гасил только что запущенный harddrive.
    if (this.wantHarddrive) this._playHarddrive();
    if (this.desiredMusic && this.musicEnabled) this._startMusic(this.desiredMusic);
  };

  AudioManager.prototype.setMasterVolume = function (v) { this.masterVolume = clamp01(v); this.updateAllVolumes(); };
  AudioManager.prototype.setMusicVolume = function (v) { this.musicVolume = clamp01(v); this.updateAllVolumes(); };
  AudioManager.prototype.setSfxVolume = function (v) { this.sfxVolume = clamp01(v); this.updateAllVolumes(); };
  AudioManager.prototype.setHddVolume = function (v) { this.hddVolume = clamp01(v); this.updateAllVolumes(); };

  AudioManager.prototype.setMusicEnabled = function (enabled) {
    this.musicEnabled = !!enabled;
    if (!enabled) {
      this._pauseAllMusic();
    } else if (this.unlocked && this.desiredMusic) {
      this._startMusic(this.desiredMusic);
    }
  };

  AudioManager.prototype.setSfxEnabled = function (enabled) { this.sfxEnabled = !!enabled; };

  AudioManager.prototype.updateAllVolumes = function () {
    var self = this;
    Object.keys(this.elements).forEach(function (key) {
      var entry = self.elements[key];
      var mult = self.sfxVolume;
      if (MUSIC_KEYS.indexOf(key) >= 0) mult = self.musicVolume;
      if (key === 'harddrive') mult = self.hddVolume;
      entry.audio.volume = clamp01(entry.baseVolume * mult * self.masterVolume);
    });
  };

  AudioManager.prototype._pauseAllMusic = function () {
    var self = this;
    MUSIC_KEYS.forEach(function (key) {
      var entry = self.elements[key];
      if (entry) {
        entry.audio.pause();
        try { entry.audio.currentTime = 0; } catch (e) {}
      }
    });
    this.currentMusic = null;
  };

  AudioManager.prototype._startMusic = function (key) {
    if (this.currentMusic === key) return;
    this._pauseAllMusic();               // предыдущий трек всегда гасится первым — наложения нет
    var entry = this.elements[key];
    if (!entry) return;
    this.currentMusic = key;
    try { entry.audio.currentTime = 0; } catch (e) {}
    var self = this;
    var p = entry.audio.play();
    if (p && p.catch) p.catch(function () { if (self.currentMusic === key) self.currentMusic = null; });
  };

  AudioManager.prototype.playMusic = function (key) {
    if (MUSIC_KEYS.indexOf(key) < 0) return;
    this.desiredMusic = key;
    if (!this.unlocked || !this.musicEnabled) return;
    this._startMusic(key);
  };

  AudioManager.prototype.stopMusic = function () {
    this.desiredMusic = null;
    this._pauseAllMusic();               // harddrive не затрагивается
  };

  AudioManager.prototype.playSfx = function (key) {
    if (!this.unlocked || !this.sfxEnabled || SFX_KEYS.indexOf(key) < 0) return;
    if (key === 'mouse') {
      var now = Date.now();
      if (now - this.lastMouseClick < 120) return;
      this.lastMouseClick = now;
    }
    var entry = this.elements[key];
    if (!entry) return;
    try { entry.audio.currentTime = 0; } catch (e) {}
    var p = entry.audio.play();
    if (p && p.catch) p.catch(function () {});
  };

  AudioManager.prototype._playHarddrive = function () {
    if (this.harddriveStarted) return;
    var entry = this.elements.harddrive;
    if (!entry) return;
    this.harddriveStarted = true;        // единственный экземпляр, повторно не запускается
    try { entry.audio.currentTime = 0; } catch (e) {}
    var self = this;
    var p = entry.audio.play();
    if (p && p.catch) p.catch(function () { self.harddriveStarted = false; });
  };

  AudioManager.prototype.startHarddrive = function () {
    this.wantHarddrive = true;           // если аудио ещё заблокировано — стартует сразу после unlock()
    if (this.unlocked) this._playHarddrive();
  };

  AudioManager.prototype.stopHarddrive = function () {
    this.wantHarddrive = false;
    this.harddriveStarted = false;
    var entry = this.elements.harddrive;
    if (entry) {
      entry.audio.pause();
      try { entry.audio.currentTime = 0; } catch (e) {}
    }
  };

  window.AudioManager = AudioManager;
}());
