// NEXA: заставка EPICLINES STUDIO перед главным меню (4 секунды). Рисует js/splash3d.js, звук — собственный WebAudio (audio.js не трогаем).
// assets/bodycam.* (с 0:00) — тактический гул; assets/neon.* (с 1.15) — неон и удар на 2.30; assets/voice.* (с 2.80) — женский голос:
// панорама от левого уха к правому ровно на время блика по тексту + лёгкое эхо; всё затухает в 0 к 4.00. Нет файла — этот слой просто молчит.
// Параметры адреса (для отладки): ?nosplash — пропустить; ?splash — показать даже при ?nopreload; ?mute — без звука; ?sp_t=2.4 — застыть на кадре в момент t.
(function () {
  'use strict';
  var SS = window.SplashScene;
  var q = new URLSearchParams(location.search);
  var TL = SS && SS.TL;
  var EXTS = ['mp3', 'ogg', 'wav', 'm4a'];

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function num(k, d) { var v = parseFloat(lsGet(k)); return isFinite(v) ? Math.max(0, Math.min(1, v)) : d; }
  function loadScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('load ' + src)); }; document.head.appendChild(s); });
  }
  function withTimeout(p, ms, fallback) { return Promise.race([p, new Promise(function (r) { setTimeout(function () { r(fallback); }, ms); })]); }

  function loadBuffer(ctx, name) {
    var i = 0;
    function next() {
      if (i >= EXTS.length) return Promise.resolve(null);
      var url = 'assets/' + name + '.' + EXTS[i++];
      return fetch(url).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(function (ab) {
        return new Promise(function (res, rej) { var p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); });
      }).catch(next);
    }
    return next();
  }

  var BODYCAM_LOOP = false;
  var VOICE_GAIN = 2.0;      // файл голоса тихий (пик ≈0.15) — выравниваем по громкости с neon
  function voiceEnd(buf) {   // последний заметный звук реплики
    try {
      var d = buf.getChannelData(0), pk = 0, i, thr, sr = buf.sampleRate;
      for (i = 0; i < d.length; i += 16) pk = Math.max(pk, Math.abs(d[i]));
      thr = pk * 0.06;
      for (i = d.length - 1; i > 0; i--) if (Math.abs(d[i]) > thr) return Math.min(buf.duration, i / sr + 0.05);
    } catch (e) {}
    return buf.duration;
  }

  function play() {
    if (!SS || q.has('nosplash') || (q.has('nopreload') && !q.has('splash'))) return Promise.resolve();
    return new Promise(function (resolve) {
      var done = false, started = false, raf = 0, scene = null, ctx = null, graph = null, t0 = 0, wall0 = 0, skipAt = 0;
      var hold = q.has('sp_t') ? parseFloat(q.get('sp_t')) : null;
      var muted = q.has('mute') || num('masterVolume', 0.55) <= 0 || lsGet('sfxEnabled') === 'false';
      var vol = num('masterVolume', 0.55) * num('sfxVolume', 1);
      var reduce = false; try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

      var el = document.createElement('div'); el.id = 'nexa-splash'; el.setAttribute('aria-hidden', 'true');
      var cv = document.createElement('canvas'); cv.className = 'sp-cv'; el.appendChild(cv);
      var gate = document.createElement('p'); gate.className = 'sp-gate'; gate.hidden = true; gate.textContent = '[ TAP TO START ]'; el.appendChild(gate);
      document.body.appendChild(el);

      function finish() {
        if (done) return; done = true; cancelAnimationFrame(raf);
        document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onPointer, true);
        try { if (graph) graph.stop(); } catch (e) {}
        try { if (ctx && ctx.state !== 'closed') ctx.close(); } catch (e) {}
        if (scene) { scene.clear(); scene.dispose(); }
        el.remove(); resolve();
      }
      function clock() {
        if (ctx && ctx.state === 'running') { var lat = 0; try { lat = Math.min(0.15, ctx.outputLatency || 0); } catch (e) {} return ctx.currentTime - t0 - lat; }
        return (performance.now() - wall0) / 1000;
      }
      function skip() {
        if (!started || skipAt || done || hold !== null) return;
        if (clock() < 0.4) return;
        skipAt = performance.now();
        if (graph) graph.quickFade(0.22);
        el.style.transition = 'opacity .22s linear'; el.style.opacity = '0';
        setTimeout(finish, 240);
      }
      function onKey(e) { if (!started) return; if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); skip(); } }
      function onPointer() { if (started) skip(); }

      // ------------------------------------------------------------ звук
      function buildGraph() {
        var master = ctx.createGain(); master.gain.value = Math.min(1, vol * 1.6);
        var lim = ctx.createDynamicsCompressor(); lim.threshold.value = -9; lim.knee.value = 8; lim.ratio.value = 8; lim.attack.value = 0.003; lim.release.value = 0.2;
        master.connect(lim); lim.connect(ctx.destination);
        var an = ctx.createAnalyser(); an.fftSize = 1024; lim.connect(an);
        var fade = ctx.createGain(); fade.connect(master);
        var srcs = [], w0 = t0;
        function src(buf, at, gain, dest) {
          var s = ctx.createBufferSource(); s.buffer = buf; var g = ctx.createGain(); g.gain.value = gain; s.connect(g); g.connect(dest); s.start(Math.max(at, ctx.currentTime)); srcs.push(s); return s;
        }
        // bodycam: стартует с 0:00 (файл короткий, ≈1 с — по умолчанию играет один раз; BODYCAM_LOOP=true кладёт копии внахлёст на всю заставку)
        if (bufs.bodycam) {
          if (!BODYCAM_LOOP) src(bufs.bodycam, w0, 0.6, fade);
          else { var bs = Math.min(0.5, bufs.bodycam.duration / 2); for (var bt = 0; bt < TL.end; bt += bs) src(bufs.bodycam, w0 + bt, 0.42, fade); }
        }
        // neon: удар в момент выстрела стрелок и второй, тяжёлый (ниже по тону + суб-бас) — пик в момент вспышки/глитча
        if (bufs.neon) {
          src(bufs.neon, w0 + TL.arrC, 0.95, fade);
          var nb = ctx.createGain(); nb.gain.value = 0.9; nb.connect(fade);
          var ls = ctx.createBiquadFilter(); ls.type = 'lowshelf'; ls.frequency.value = 220; ls.gain.value = 9; ls.connect(nb);
          var hit = ctx.createBufferSource(); hit.buffer = bufs.neon; hit.playbackRate.value = 0.74; var hg = ctx.createGain(); hg.gain.value = 1; hit.connect(hg); hg.connect(ls);
          hit.start(Math.max(w0 + TL.boom, ctx.currentTime)); srcs.push(hit);
        }
        var sub = ctx.createOscillator(), sg = ctx.createGain(), tb = Math.max(w0 + TL.boom, ctx.currentTime);
        sub.type = 'sine'; sub.frequency.setValueAtTime(92, tb); sub.frequency.exponentialRampToValueAtTime(34, tb + 0.75);
        sg.gain.setValueAtTime(0.0001, tb); sg.gain.exponentialRampToValueAtTime(0.5, tb + 0.015); sg.gain.exponentialRampToValueAtTime(0.0001, tb + 1.1);
        sub.connect(sg); sg.connect(fade); sub.start(tb); sub.stop(tb + 1.2); srcs.push(sub);
        var pan = null;
        if (bufs.voice) {
          var vin = ctx.createGain(); vin.gain.value = 1.0;
          var dry = ctx.createGain(); dry.gain.value = 1.0; dry.connect(fade);
          var last = vin;
          if (ctx.createStereoPanner) {
            pan = ctx.createStereoPanner(); pan.pan.setValueAtTime(-1, w0);
            var N = 96, curve = new Float32Array(N), d = TL.glint1 - TL.glint0;
            for (var i = 0; i < N; i++) curve[i] = -1 + 2 * SS.glintP(TL.glint0 + d * i / (N - 1));    // та же кривая, что у блика по буквам
            pan.pan.setValueCurveAtTime(curve, w0 + TL.glint0, d);
            vin.connect(pan); last = pan;
          }
          last.connect(dry);
          var dl = ctx.createDelay(1.0); dl.delayTime.value = 0.22;
          var fb = ctx.createGain(); fb.gain.value = 0.28; var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
          var wet = ctx.createGain(); wet.gain.value = 0.22;
          last.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(fade);
          src(bufs.voice, w0 + TL.glint0, VOICE_GAIN, vin);
        }
        // затухание всего звука в 0 к 4.00 (та же кривая, что и у картинки)
        var M = 48, fc = new Float32Array(M), fd = TL.end - TL.fade0;
        for (var j = 0; j < M; j++) fc[j] = SS.fadeK(TL.fade0 + fd * j / (M - 1));
        fade.gain.setValueAtTime(1, w0); fade.gain.setValueCurveAtTime(fc, w0 + TL.fade0, fd);
        return {
          analyser: an, fade: fade, pan: pan, bufs: bufs, ctx: ctx, t0: t0,
          stop: function () { srcs.forEach(function (s) { try { s.stop(); } catch (e) {} }); },
          quickFade: function (sec) { try { var n = ctx.currentTime; fade.gain.cancelScheduledValues(n); fade.gain.setValueAtTime(fade.gain.value, n); fade.gain.linearRampToValueAtTime(0, n + sec); } catch (e) {} }
        };
      }

      // ------------------------------------------------------------ запуск
      function begin() {
        if (started || done) return; started = true; gate.hidden = true;
        var go = function () {
          wall0 = performance.now() + 100;
          if (ctx) { t0 = ctx.currentTime + 0.1; try { graph = buildGraph(); } catch (e) { graph = null; } if (!graph) { try { ctx.close(); } catch (e) {} ctx = null; } }
          window.Splash._audio = graph;
          if (hold !== null) { frame(hold); return; }
          raf = requestAnimationFrame(loop);
        };
        if (ctx && ctx.state !== 'running') ctx.resume().then(go, go); else go();
      }
      var bufs = {};
      function frame(t) { if (scene) scene.render(Math.max(0, t)); }
      function loop() {
        if (done) return;
        var t = clock();
        if (!skipAt) { frame(t); if (t >= TL.end) { finish(); return; } }
        raf = requestAnimationFrame(loop);
      }
      function fallback() {
        // нет WebGL / three.js: статичный логотип с CSS-анимацией того же тайминга
        cv.remove(); var im = new Image(); im.className = 'sp-fb'; im.alt = ''; im.src = 'assets/epiclines_logo.webp'; el.appendChild(im);
        document.addEventListener('keydown', onKey, true); document.addEventListener('pointerdown', onPointer, true);
        begin();
      }
      window.Splash._skip = skip;

      // логотип стартует только после касания/клика/клавиши игрока (жест нужен и для звука); пока грузятся ресурсы, ждём на «[ TAP TO START ]»
      var P = [], tapped = false, ready = false;
      if (!muted && (window.AudioContext || window.webkitAudioContext)) {
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
      }
      if (ctx) {
        P.push(Promise.all([['bodycam'], ['neon'], ['voice', 'audio']].map(function (names) {
          return names.reduce(function (pr, n) { return pr.then(function (b) { return b || loadBuffer(ctx, n); }); }, Promise.resolve(null)).then(function (b) { bufs[names[0]] = b; });
        })));
      }
      var three = window.THREE ? Promise.resolve() : loadScript('assets/lib/three.min.js').catch(function () { return loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r125/three.min.js'); });
      P.push(three);
      withTimeout(Promise.all(P).then(function () { return true; }, function () { return false; }), 7000, false).then(function (ok) {
        if (done) return;
        if (ctx && !bufs.bodycam && !bufs.neon && !bufs.voice) { try { ctx.close(); } catch (e) {} ctx = null; }
        var vEnd = bufs.voice ? voiceEnd(bufs.voice) : 0;           // конец реплики в секундах от начала файла
        SS.setEnd(vEnd ? Math.min(6, Math.max(4, TL.glint0 + vEnd + 0.35)) : 4);
        if (ok && window.THREE) { try { scene = SS.create(window.THREE, cv, { reduceMotion: reduce }); } catch (e) { scene = null; } }
        window.Splash._scene = scene;
        if (!scene) { onReady(fallback); return; }
        if (hold !== null) { begin(); return; }
        document.addEventListener('keydown', onKey, true); document.addEventListener('pointerdown', onPointer, true);
        onReady(begin);
      });
      // ждём и ресурсы, и жест игрока: что бы ни пришло последним — запускает логотип
      var go0 = null;
      function onReady(cb) { go0 = cb; ready = true; if (tapped) { go0(); go0 = null; } }
      function waitGesture() {
        var h = function () {
          document.removeEventListener('keydown', h, true); document.removeEventListener('pointerdown', h, true);
          if (done) return; tapped = true; gate.hidden = true;
          if (ctx && ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }   // разблокируем звук прямо внутри жеста
          if (ready && go0) { var f = go0; go0 = null; f(); }
        };
        document.addEventListener('keydown', h, true); document.addEventListener('pointerdown', h, true);
      }
      if (hold === null && !(window.NexaPreload && window.NexaPreload.tapped)) { gate.hidden = false; waitGesture(); } else tapped = true;
    });
  }

  window.Splash = { play: play, _scene: null, _audio: null };
}());
