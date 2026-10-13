// NEXA: озвучка реплик. Субтитры r.say() остаются; если в assets/voice/ (или assets/voicelines/) лежит mp3 этой реплики — он играет вместе с ними.
// Какие файлы есть, в какой папке и сколько они длятся, знает assets/voice/list.json (его собирает `node tools/extract-voice.js`, он же запускается из build-itch.js).
// Озвучка одна на все языки интерфейса (английский голос), громкость и выключатель — как у звуковых эффектов (audio.sfxVolume/sfxEnabled × masterVolume).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C) return;
  const DIR = 'assets/voice/';
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toUpperCase();
  const num = (v, d) => (typeof v === 'number' ? v : d);
  let data = { files: {}, map: {} }, loading = null;

  const load = () => loading || (loading = fetch(DIR + 'list.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j && j.files && j.map) data = j; return data; })
    .catch(() => data));

  // реплика (исходный русский текст) -> { code, dur } или null, если озвучки нет
  const find = (run, text) => {
    const hit = data.map[norm(text)];
    if (!hit) return null;
    const m = hit.find((h) => h[0] === run.taskId) || hit[0];
    return data.files[m[1]] ? { code: m[1], dur: data.files[m[1]] } : null;
  };
  const urlOf = (code) => 'assets/' + ((data.dirs && data.dirs[code]) || 'voice') + '/' + code + '.mp3';
  const warmed = new Set();
  const vol = (run) => {
    const A = (run.opts && run.opts.audio) || {};
    return A.sfxEnabled === false ? 0 : Math.min(1, num(A.sfxVolume, 1) * num(A.masterVolume, 0.55) * 1.8);
  };

  const V = C.voice = {
    load, find,
    // при старте миссии: тихо подгрузить её озвученные реплики в кеш браузера, чтобы первая реплика не ждала сеть (на itch)
    prefetch(taskId) {
      load().then(() => Object.keys(data.map).forEach((k) => data.map[k].forEach((h) => {
        if (h[0] !== taskId || !data.files[h[1]] || warmed.has(h[1])) return;
        warmed.add(h[1]); fetch(urlOf(h[1])).catch(() => {});
      })));
    },
    reload() { loading = null; return load(); }, // перечитать list.json (например, после добавления файлов без перезагрузки страницы)
    // длительность озвучки реплики (0, если файла нет) — чтобы субтитры и шот катсцены не обрывали голос
    dur(run, text) { const v = find(run, text); return v ? v.dur : 0; },
    play(run, text) {
      V.stop(run);
      const v = find(run, text);
      if (!v) return null;
      const el = new Audio(urlOf(v.code));
      el.volume = vol(run);
      run.voiceEl = el;
      const p = el.play(); if (p && p.catch) p.catch(() => {});
      return v;
    },
    stop(run) {
      const el = run && run.voiceEl;
      if (!el) return;
      run.voiceEl = null;
      try { el.pause(); } catch (e) {}
    },
    // каждый кадр, пока играет реплика: пауза вместе с игрой и живая громкость
    sync(run) {
      const el = run.voiceEl;
      if (!el) return;
      if (el.ended) { run.voiceEl = null; return; }
      el.volume = vol(run);
      if (run.paused || run.disposed) { if (!el.paused) el.pause(); } else if (el.paused) { const p = el.play(); if (p && p.catch) p.catch(() => {}); }
    }
  };
  load();
}());
