// NEXA/OS: единоразовая загрузка ВСЕХ файлов игры (звуки, текстуры, модели, three.js) в Cache Storage.
// Первый запуск (или файлы удалены / очищены данные сайта) — экран «DOWNLOADING GAME DATA» с прогрессом; дальше — мгновенный старт без экрана.
// Список файлов — assets-manifest.json (его собирает tools/build-itch.js); без манифеста работает запасной список ниже.
// Кэш отдаёт sw.js (cache-first, с поддержкой Range для аудио). Где service worker недоступен — файлы всё равно прогреваются в HTTP-кэше.
// app.js ждёт window.NexaPreload.ready перед стартом NEXA/OS. Сменилась версия (?v= у этого скрипта) — кэш пересобирается.
(function () {
  'use strict';

  var me = document.currentScript;
  var VER = (me && /[?&]v=([\w.-]+)/.exec(me.src || '') || [0, '0'])[1];
  var CACHE = 'nexa-assets-v' + VER;
  var FLAG = 'nexaAssets';
  var FALLBACK = ['ak47.mp3', 'ak47reload.mp3', 'boot.mp3', 'denied.mp3', 'error.mp3', 'fight1.mp3', 'floor.png', 'game.mp3', 'glock.mp3', 'glockreload.mp3', 'harddrive.mp3',
    'heistloud.mp3', 'heistsneak.mp3', 'menu.mp3', 'menubg.png', 'mouse.mp3', 'notification.mp3', 'pick.m4a', 'poweroff.mp3', 'shotgun.mp3', 'succesfully.mp3', 'sucsesfully.mp3', 'wall.png',
    'lib/three.min.js', 'lib/GLTFLoader.js', 'lib/SkeletonUtils.js', 'models/ak.jpg', 'models/ak.nxm', 'models/glock.jpg', 'models/glock.nxm', 'models/mask.jpg', 'models/mask.nxm', 'models/shotgun.jpg', 'models/shotgun.nxm', 'models/fps_hands_stickman.glb']
    .map(function (f) { return ['assets/' + f, 400000]; });

  var api = { version: VER, cacheName: CACHE, files: [], total: 0 };
  var resolveReady;
  api.ready = new Promise(function (res) { resolveReady = res; });
  window.NexaPreload = api;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function abs(p) { return /^https?:/.test(p) ? p : new URL(p, location.href).href; }
  function mb(n) { return (n / 1048576).toFixed(1); }

  // ---------------------------------------------------------------- service worker
  function registerSW() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    try { navigator.serviceWorker.register('sw.js?v=' + VER).catch(function () {}); } catch (e) {}
  }

  // ---------------------------------------------------------------- UI
  var ui = null;
  function buildUI() {
    var el = document.createElement('div');
    el.id = 'nexa-preload';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML =
      '<div class="pl-box">' +
      '<p class="pl-eyebrow">NEXA INDUSTRIES / TERMINAL 083</p>' +
      '<h2>DOWNLOADING GAME DATA</h2>' +
      '<p class="pl-note">First launch only. Sounds, textures and models are stored on this device — the next launch starts instantly.</p>' +
      '<div class="pl-bar"><i></i></div>' +
      '<p class="pl-pct">0%</p>' +
      '<p class="pl-file">PREPARING...</p>' +
      '<div class="pl-btns"><button type="button" class="pl-btn pl-enter" hidden>[ ENTER SYSTEM ]</button><button type="button" class="pl-btn pl-retry" hidden>[ RETRY ]</button><button type="button" class="pl-btn pl-skip" hidden>[ CONTINUE ONLINE ]</button></div>' +
      '<p class="pl-hint"></p>' +
      '</div>';
    document.body.appendChild(el);
    ui = {
      el: el, bar: el.querySelector('.pl-bar i'), pct: el.querySelector('.pl-pct'), file: el.querySelector('.pl-file'), hint: el.querySelector('.pl-hint'),
      enter: el.querySelector('.pl-enter'), retry: el.querySelector('.pl-retry'), skip: el.querySelector('.pl-skip'), title: el.querySelector('h2'), note: el.querySelector('.pl-note')
    };
    return ui;
  }
  function setBtns(which) {
    ['enter', 'retry', 'skip'].forEach(function (k) { ui[k].hidden = which.indexOf(k) < 0; });
    var first = ui[which[0]]; if (first) { first.classList.add('pl-hot'); try { first.focus({ preventScroll: true }); } catch (e) {} }
  }
  function waitChoice(map) {
    // map: { enter: fn, retry: fn, skip: fn }; управление: клик, Enter / Space, кнопка A геймпада
    return new Promise(function (res) {
      var done = false, poll = 0;
      function pick(k) { if (done || !map[k]) return; done = true; clearInterval(poll); document.removeEventListener('keydown', onKey, true); res(k); }
      Object.keys(map).forEach(function (k) { ui[k].addEventListener('click', function () { pick(k); }); });
      var firstKey = Object.keys(map)[0];
      function onKey(e) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); pick(firstKey); } else if ((e.code === 'Escape' || e.code === 'KeyS') && map.skip) { pick('skip'); } }
      document.addEventListener('keydown', onKey, true);
      var prev = false;
      poll = setInterval(function () {
        try {
          var l = navigator.getGamepads ? navigator.getGamepads() : [];
          for (var i = 0; i < l.length; i += 1) {
            var g = l[i]; if (!g || !g.connected) continue;
            var a = !!(g.buttons[0] && g.buttons[0].pressed), b = !!(g.buttons[1] && g.buttons[1].pressed);
            if (a && !prev) pick(firstKey); else if (b && map.skip) pick('skip');
            prev = a;
          }
        } catch (e) {}
      }, 60);
    });
  }

  // ---------------------------------------------------------------- загрузка
  function loadManifest() {
    return fetch('assets-manifest.json?v=' + VER, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('no manifest'); return r.json(); })
      .then(function (m) { return m.files && m.files.length ? m.files : FALLBACK; })
      .catch(function () { return FALLBACK; });
  }
  function absentFiles(cache, files) {
    return Promise.all(files.map(function (f) { return cache.match(abs(f[0])).then(function (r) { return r ? null : f; }); }))
      .then(function (arr) { return arr.filter(Boolean); });
  }
  function fetchOne(cache, f, onBytes) {
    var url = abs(f[0]), cross = url.indexOf(location.origin) !== 0;
    return fetch(url, cross ? { mode: 'cors', credentials: 'omit' } : { cache: 'reload' }).then(function (resp) {
      if (!resp.ok) throw new Error(resp.status + ' ' + f[0]);
      var copy = resp.clone(), got = 0;
      var done = function () { return cache.put(url, copy); };
      if (resp.body && resp.body.getReader) {
        var rd = resp.body.getReader();
        return (function pump() { return rd.read().then(function (c) { if (c.done) return done(); got += c.value.length; onBytes(c.value.length); return pump(); }); }());
      }
      return resp.arrayBuffer().then(function (b) { onBytes(b.byteLength); return done(); });
    });
  }
  function downloadAll(cache, todo, totalBytes) {
    var loaded = 0, idx = 0, failed = [], active = {};
    function paint(name) {
      var k = Math.min(1, loaded / Math.max(1, totalBytes));
      ui.bar.style.width = (k * 100).toFixed(1) + '%';
      ui.pct.textContent = Math.round(k * 100) + '%   ' + mb(Math.min(loaded, totalBytes)) + ' / ' + mb(totalBytes) + ' MB';
      if (name) ui.file.textContent = name.replace(/^.*\//, '').replace(/\?.*$/, '').toUpperCase();
    }
    function worker() {
      if (idx >= todo.length) return Promise.resolve();
      var f = todo[idx]; idx += 1;
      var tries = 0, counted = 0;
      var onBytes = function (n) { counted += n; loaded += n; paint(f[0]); };
      var attempt = function () {
        tries += 1; paint(f[0]);
        return fetchOne(cache, f, onBytes).catch(function (err) {
          loaded -= counted; counted = 0;
          if (tries < 3) return new Promise(function (r) { setTimeout(r, 400 * tries); }).then(attempt);
          failed.push(f[0]);
        });
      };
      return attempt().then(function () { delete active[f[0]]; return worker(); });
    }
    return Promise.all([worker(), worker(), worker()]).then(function () { return failed; });
  }

  function run() {
    return caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return /^nexa-assets-v/.test(k) && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return caches.open(CACHE); }).then(function (cache) {
      return loadManifest().then(function (list) {
        var files = list;
        api.files = files; api.total = files.length;
        return absentFiles(cache, files).then(function (todo) {
          if (!todo.length) { lsSet(FLAG, VER); registerSW(); return resolveReady(); }
          var first = lsGet(FLAG) !== VER;
          buildUI();
          var bytes = todo.reduce(function (s, f) { return s + (f[1] || 0); }, 0);
          ui.hint.textContent = todo.length + ' FILES  /  ' + mb(bytes) + ' MB' + (first ? '' : '  /  RESTORING MISSING FILES');
          function attemptAll() {
            ui.title.textContent = 'DOWNLOADING GAME DATA';
            ui.el.classList.remove('err'); setBtns([]);
            return downloadAll(cache, todo, bytes).then(function (failed) {
              if (!failed.length) {
                lsSet(FLAG, VER); registerSW();
                ui.title.textContent = 'GAME DATA READY'; ui.file.textContent = 'ALL FILES STORED ON THIS DEVICE'; ui.pct.textContent = '100%';
                ui.bar.style.width = '100%'; ui.hint.textContent = window.PadGlyph ? window.PadGlyph.fmt('ENTER / CLICK / A') : 'ENTER / CLICK / A';
                setBtns(['enter']);
                return waitChoice({ enter: 1 }).then(function () { return 'ok'; });
              }
              ui.el.classList.add('err');
              ui.title.textContent = 'DOWNLOAD INCOMPLETE';
              ui.file.textContent = failed.length + ' FILE(S) FAILED — CHECK YOUR CONNECTION';
              ui.hint.textContent = 'ENTER / A — RETRY    S / B — CONTINUE ONLINE';
              todo = todo.filter(function (f) { return failed.indexOf(f[0]) >= 0; });
              bytes = todo.reduce(function (s, f) { return s + (f[1] || 0); }, 0);
              setBtns(['retry', 'skip']);
              return waitChoice({ retry: 1, skip: 1 }).then(function (k) { return k === 'retry' ? attemptAll() : 'skip'; });
            });
          }
          return attemptAll().then(function () {
            api.tapped = true;   // игрок только что нажал кнопку — заставка (splash.js) не просит второй жест
            ui.el.classList.add('out');
            setTimeout(function () { ui.el.remove(); }, 450);
            resolveReady();
          });
        });
      });
    });
  }

  // статус и сброс — для кнопки в настройках
  api.status = function () {
    if (!window.caches) return Promise.resolve({ supported: false });
    return caches.open(CACHE).then(function (cache) {
      return loadManifest().then(function (list) {
        var files = list;
        return absentFiles(cache, files).then(function (todo) { return { supported: true, total: files.length, missing: todo.length, flag: lsGet(FLAG) === VER }; });
      });
    });
  };
  api.reset = function () {
    try { localStorage.removeItem(FLAG); } catch (e) {}
    var jobs = [];
    if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return /^nexa-assets-v/.test(k); }).map(function (k) { return caches.delete(k); })); }));
    return Promise.all(jobs).then(function () { location.reload(); });
  };

  // ---------------------------------------------------------------- старт
  var off = !window.caches || !window.fetch || location.protocol === 'file:' || /[?&]nopreload=1/.test(location.search);
  if (off) { resolveReady(); return; }
  var go = function () {
    run().catch(function () { if (ui && ui.el) ui.el.remove(); resolveReady(); }); // любая ошибка кэша не должна блокировать игру
  };
  if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  setTimeout(function () { if (!ui) resolveReady(); }, 2500); // кэш молчит — не задерживаем NEXA/OS, если экран загрузки так и не понадобился
}());
