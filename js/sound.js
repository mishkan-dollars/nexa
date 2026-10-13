// NEXA: звук миссий — выстрелы, перезарядка, удары, сердцебиение, стрессовая музыка и трек перестрелки (WebAudio).
// Выстрелы и перезарядка играют из файлов assets/*.mp3; если их не удалось загрузить — работает процедурный синтез (запасной вариант).
// Уважает настройки игры (audio.sfxEnabled/sfxVolume/musicEnabled/musicVolume/masterVolume) через opts.audio.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C) return;

  // ------------------------------------------------------------ внешние файлы
  const DIR = 'assets/';
  const FILES = { ak: 'ak47.mp3', pistol: 'glock.mp3', shotgun: 'shotgun.mp3', akRl: 'ak47reload.mp3', pistolRl: 'glockreload.mp3' };
  // эффекты миссий (id = имя файла): играют вместо синтеза; нет файла — работает запасной синтез
  ['alarm', 'ammopickup', 'bodyhit', 'c4beep', 'camerabeep', 'cashbag', 'contact1', 'contact2', 'contact3', 'death', 'enemydeath', 'explosion', 'flashbang', 'footstep',
    'glitch2', 'glitch3', 'glitch4', 'goldpickup', 'grenade', 'heartbeat', 'keycard', 'lockpick', 'medkit', 'plush1', 'plush2', 'plush3', 'smoke', 'vaultdoor'].forEach((n) => { FILES[n] = n + '.mp3'; });
  // фоновые лупы по темам (по 20 с) качаются только для своей темы; gain подобран по громкости файла
  const AMB = { office: { f: 'amboffice.mp3', g: 2.2 }, lab: { f: 'amblab.mp3', g: 0.5 }, bunker: { f: 'ambbunker.mp3', g: 0.45 }, industrial: { f: 'ambindustrial.mp3', g: 0.35 } };
  const AMB_OF = { office: 'office', mansion: 'office', lab: 'lab', bunker: 'bunker', vault: 'bunker', sewer: 'bunker', metro: 'bunker', industrial: 'industrial', dock: 'industrial', garage: 'industrial', yard: 'industrial', alley: 'industrial', roof: 'industrial' };
  const ambRaw = {};
  C.loadAmb = function (key) {
    if (!AMB[key] || typeof fetch !== 'function') return Promise.resolve(null);
    return ambRaw[key] || (ambRaw[key] = fetch(DIR + AMB[key].f).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
  };
  const FIGHT_SRC = DIR + 'fight1.mp3';
  let rawP = null;
  const raw = {};
  // скачиваем сырые mp3 один раз за сессию; декодирование делает каждый прогон миссии своим AudioContext
  C.loadSamples = function () {
    if (rawP) return rawP;
    const get = (id) => fetch(DIR + FILES[id]).then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => { if (ab) raw[id] = ab; }).catch(() => {});
    const all = typeof fetch === 'function' ? Promise.all(Object.keys(FILES).map(get)) : Promise.resolve();
    rawP = Promise.race([all, new Promise((res) => setTimeout(res, 8000))]).then(() => raw);
    return rawP;
  };

  C.makeSound = function (run) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    let ctx;
    try { ctx = new AC(); } catch (e) { return null; }
    const A = (run.opts && run.opts.audio) || {};
    const num = (v, d) => (typeof v === 'number' ? v : d);
    const sfxVol = () => (A.sfxEnabled === false ? 0 : num(A.sfxVolume, 1)) * num(A.masterVolume, 0.55) * 1.6;
    const musVol = () => (A.musicEnabled === false ? 0 : num(A.musicVolume, 1)) * num(A.masterVolume, 0.55) * 0.95;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12; // страховка от клиппинга при взрывах
    const post = ctx.createGain(); // общий «рубильник» всего звука игры (смерть игрока: обрыв); звуки самой сцены смерти идут мимо него — через dBus
    const dBus = ctx.createGain(); dBus.connect(ctx.destination);
    // эмоция (js/emote.js): пока она играет, весь звук игры (post) уходит «за стену» — тише, глуше (ФНЧ) и с тёмным эхом (duck). Музыку и звуки самой эмоции emote.js пускает мимо — прямо в ctx.destination
    const duckLP = ctx.createBiquadFilter(); duckLP.type = 'lowpass'; duckLP.frequency.value = 20000; duckLP.Q.value = 0.6;
    const duckG = ctx.createGain();
    comp.connect(lim); lim.connect(post); post.connect(duckLP); duckLP.connect(duckG); duckG.connect(ctx.destination);
    const echoSend = ctx.createGain(); echoSend.gain.value = 0; post.connect(echoSend);
    { const dl = ctx.createDelay(1.0); dl.delayTime.value = 0.23;
      const fb = ctx.createGain(); fb.gain.value = 0.5;
      const eo = ctx.createGain(); eo.gain.value = 0.7;
      const elp = ctx.createBiquadFilter(); elp.type = 'lowpass'; elp.frequency.value = 600; elp.Q.value = 0.5;
      echoSend.connect(dl); dl.connect(elp); elp.connect(fb); fb.connect(dl); elp.connect(eo); eo.connect(ctx.destination); }
    function duck(on, dur) {
      const t = ctx.currentTime, d = Math.max(0.05, dur || (on ? 0.55 : 0.8));
      const to = [[duckG.gain, on ? 0.15 : 1], [duckLP.frequency, on ? 480 : 20000], [echoSend.gain, on ? 0.38 : 0]];
      for (const x of to) { const p = x[0]; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.setTargetAtTime(x[1], t, d / 3); }
    }
    const muf = ctx.createBiquadFilter(); muf.type = 'lowpass'; muf.frequency.value = 20000; muf.Q.value = 0.5; muf.connect(comp); // срезается при контузии (blast)
    const master = ctx.createGain(); master.connect(muf);
    const SPA = window.Spatial ? window.Spatial.attach(ctx, master, run) : null; // js/spatial.js: PannerNode + окклюзия; звуку с o.at (мировые координаты источника) даёт позицию
    const musBus = ctx.createGain(); musBus.gain.value = 0; musBus.connect(comp);

    const len = ctx.sampleRate * 2, nb = ctx.createBuffer(1, len, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < len; i += 1) nd[i] = Math.random() * 2 - 1;

    const now = () => ctx.currentTime;
    function noise(o) {
      const t = o.t, s = ctx.createBufferSource(); s.buffer = nb;
      const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q || 1;
      f.frequency.setValueAtTime(o.f0, t);
      if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
      const g = ctx.createGain(), peak = Math.max(0.0003, o.g);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + (o.a || 0.002)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      s.connect(f); f.connect(g); g.connect(o.dest || master);
      if (o.dur > 0.7) s.loop = true; // буфер шума короткий (2 с): длинные раскаты зацикливаем
      s.start(t, Math.random() * 1.2); s.stop(t + o.dur + 0.05);
    }
    function tone(o) {
      const t = o.t, os = ctx.createOscillator(); os.type = o.type || 'sine';
      os.frequency.setValueAtTime(o.f0, t);
      if (o.f1) os.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t + o.dur);
      const g = ctx.createGain(), peak = Math.max(0.0003, o.g);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + (o.a || 0.003)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      let out = os;
      if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; os.connect(f); out = f; }
      out.connect(g); g.connect(o.dest || master);
      os.start(t); os.stop(t + o.dur + 0.05);
    }

    // ------------------------------------------------------------ выстрелы и эффекты
    // Каждый выстрел — несколько слоёв: сухой треск (crack), хлопок (snap), тело (body), удар по груди (thump),
    // металлический звон ствола (ring), механика затвора (mech) и хвост помещения (реверб из затухающего шума).
    const light = !!(run.q && run.q.parts <= 6);
    function makeIR(sec, decay) {
      const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch += 1) {
        const d = b.getChannelData(ch); let lp = 0;
        for (let i = 0; i < n; i += 1) {
          const k = i / n; lp += ((Math.random() * 2 - 1) - lp) * (0.5 * (1 - k) + 0.05); // хвост темнеет со временем
          d[i] = lp * Math.pow(1 - k, decay) * Math.min(1, i / 300);
        }
      }
      return b;
    }
    const sat = ctx.createWaveShaper();
    sat.curve = (() => { const n = 512, c = new Float32Array(n); for (let i = 0; i < n; i += 1) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); } return c; })();
    const gunBus = ctx.createGain(); gunBus.gain.value = 2.1; gunBus.connect(sat); sat.connect(master); // лёгкое насыщение — «плотность» выстрела
    const verb = ctx.createConvolver(); verb.buffer = makeIR(light ? 0.6 : 1.3, 2.6);
    const verbSend = ctx.createGain(); verbSend.gain.value = 0.25; sat.connect(verbSend); verbSend.connect(verb);
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.7; verb.connect(verbOut); verbOut.connect(master);

    // ------------------------------------------------------------ сэмплы из assets/
    const SB = {}; // декодированные буферы этого прогона; пока не готовы (или файлов нет) — играет синтез
    const SPLIT = {}; // точка разреза файла перезарядки: [вынуть магазин | вставить магазин]
    const decode = (ab) => new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
    function findSplit(b) { // тишина между двумя ударами: после первого затухания ждём начала второго звука
      const d = b.getChannelData(0), sr = b.sampleRate, w = Math.max(1, Math.floor(sr * 0.005));
      let peak = 0; for (let i = 0; i < d.length; i += 1) peak = Math.max(peak, Math.abs(d[i]));
      let quiet = false;
      for (let s = 0.1; s < 0.4; s += 0.005) {
        let m = 0; const i0 = Math.floor(s * sr);
        for (let j = 0; j < w; j += 1) m = Math.max(m, Math.abs(d[i0 + j] || 0));
        m /= peak || 1;
        if (m < 0.06) quiet = true; else if (quiet && m > 0.08) return Math.max(0.1, s - 0.02);
      }
      return 0.22;
    }
    C.loadSamples().then((rw) => Promise.all(Object.keys(rw).map((id) => decode(rw[id].slice(0)).then((b) => { SB[id] = b; if (/Rl$/.test(id)) SPLIT[id] = findSplit(b); }).catch(() => {})))).catch(() => {});
    // у каждого оружия свой файл: gain, длина хвоста, скорость воспроизведения (у врагов чуть другой тембр)
    const SGUN = {
      pistol: { id: 'pistol', len: 0.8, g: 0.8 }, ak: { id: 'ak', len: 1.0, g: 0.55 }, shotgun: { id: 'shotgun', len: 2.6, g: 0.8 },
      sniper: { id: 'ak', len: 1.9, g: 0.95, rate: 0.58 }, epistol: { id: 'pistol', len: 0.7, g: 0.5, rate: 1.1 }, erifle: { id: 'ak', len: 0.8, g: 0.42, rate: 1.1 }, elmg: { id: 'ak', len: 0.8, g: 0.46, rate: 0.88 },
      minigun: { id: 'ak', len: 0.26, g: 0.5, rate: 0.8 } // миссия 48: короткий хвост — 22 выстрела в секунду не должны слипаться
    };
    const smpSend = ctx.createGain(); smpSend.connect(verb);
    let smpVoices = 0;
    function sampleShot(kind, o) {
      const S = SGUN[kind], b = S && SB[S.id];
      if (!b || o.supp) return false; // с глушителем и без файла — синтез
      if (smpVoices > 22) return true; // слишком много голосов: пропускаем выстрел, но не дублируем синтезом
      const d = o.dist || 0, t = now() + (o.delay || 0) + Math.min(0.14, d / 343 * 0.8);
      const sv = SPA && o.at ? SPA.voice(o.at, { loud: true }) : null; // есть позиция — затухание делает PannerNode, ручное 1/(1+d·0.06) не применяем
      if (o.at && SPA && !sv) return true;
      const k = sv ? 1 : 1 / (1 + d * 0.06), len = Math.min(o.len || S.len, b.duration), pk = Math.max(0.001, S.g * k * (0.92 + Math.random() * 0.16));
      const src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = (S.rate || 1) * (0.97 + Math.random() * 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(pk, t); g.gain.setValueAtTime(pk, t + len * 0.55); g.gain.exponentialRampToValueAtTime(0.0005, t + len);
      let out = src;
      if (d > 4) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.max(1200, 9000 - d * 220); src.connect(f); out = f; } // даль глушит верха
      out.connect(g); g.connect(sv ? sv.in : master);
      if (sv) sv.free(t - now() + len + 0.6);
      if (!light) { g.connect(smpSend); smpSend.gain.value = 0.1 + Math.min(0.3, d * 0.012); }
      smpVoices += 1; src.onended = () => { smpVoices -= 1; };
      master.gain.value = sfxVol();
      src.start(t); src.stop(t + len + 0.05);
      return true;
    }
    const RL = { glock: 'pistolRl', ak: 'akRl' }; // у дробовика файла перезарядки нет: вставка патронов и помпа остаются синтезом
    function reloadSample(name, w, t, k) {
      const id = RL[w], b = id && SB[id];
      if (!b) return false;
      const sp = SPLIT[id] || 0.22, out = name === 'magout', a = out ? 0 : sp, e = out ? sp : Math.min(b.duration, 1.2), vol = 0.55 * k;
      const src = ctx.createBufferSource(); src.buffer = b;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004);
      g.gain.setValueAtTime(vol, t + Math.max(0.005, e - a - 0.02)); g.gain.linearRampToValueAtTime(0.0001, t + e - a);
      src.connect(g); g.connect(master);
      master.gain.value = sfxVol();
      src.start(t, a, e - a);
      return true;
    }

    // ------------------------------------------------------------ звуки событий из assets/ (вместо процедурного синтеза)
    // ids — варианты (играет случайный, подряд не повторяется), g — громкость события, len — обрезка хвоста, also — ещё и синтез поверх.
    const SN = { alarm: 0.5, ammopickup: 1.1, bodyhit: 0.6, c4beep: 0.5, camerabeep: 1, cashbag: 1.1, contact1: 0.55, contact2: 0.55, contact3: 0.55, death: 0.7, enemydeath: 0.6, explosion: 0.85, flashbang: 0.7,
      footstep: 6, glitch2: 0.7, glitch3: 0.75, glitch4: 1.3, goldpickup: 0.75, grenade: 0.85, heartbeat: 0.75, keycard: 0.5, lockpick: 1, medkit: 0.6, plush1: 1.5, plush2: 0.65, plush3: 1.25, smoke: 0.6, vaultdoor: 0.8 }; // выравнивание пиков файлов
    const SMP = {
      alarm: { ids: ['alarm'] }, boom: { ids: ['explosion'], g: 1.1 }, kill: { ids: ['enemydeath'], g: 1.1 }, hurt: { ids: ['bodyhit'], g: 1.2 }, beat: { ids: ['heartbeat'], g: 1 },
      slam: { ids: ['vaultdoor'], g: 0.9, also: true }, death: { ids: ['death'], g: 1.1 }, footstep: { ids: ['footstep'], len: 0.7, rate: [0.9, 1.1] }, medkit: { ids: ['medkit'] }, ammopickup: { ids: ['ammopickup'] },
      keycard: { ids: ['keycard'] }, lockpick: { ids: ['lockpick'] }, c4beep: { ids: ['c4beep'], len: 0.5 }, camerabeep: { ids: ['camerabeep'] }, goldpickup: { ids: ['goldpickup'] }, cashbag: { ids: ['cashbag'] },
      flashbang: { ids: ['flashbang'], g: 1.1 }, grenade: { ids: ['grenade'] }, smoke: { ids: ['smoke'] },
      plush: { ids: ['plush1', 'plush2', 'plush3'], rate: [0.92, 1.1] }, contact: { ids: ['contact1', 'contact2', 'contact3'], rate: [0.97, 1.03] }, glitch: { ids: ['glitch2', 'glitch3', 'glitch4'], rate: [0.95, 1.05] }
    };
    const FALL = { medkit: 'pickup', ammopickup: 'pickup', keycard: 'ok', lockpick: 'click', c4beep: 'beep', camerabeep: 'tick', goldpickup: 'ok', cashbag: 'pickup', flashbang: 'boom', grenade: 'thud', death: 'kill', contact: 'whizz', glitch: 'zap' };
    const lastVar = {};
    let evVoices = 0;
    function playSmp(name, o, t) {
      const S = SMP[name]; if (!S) return false;
      const have = S.ids.filter((id) => SB[id]); if (!have.length) return false;
      if (evVoices > 28) return true;
      let id = have[Math.floor(Math.random() * have.length)];
      if (have.length > 1 && id === lastVar[name]) id = have[(have.indexOf(id) + 1 + Math.floor(Math.random() * (have.length - 1))) % have.length];
      lastVar[name] = id;
      const sv = SPA && o.at ? SPA.voice(o.at, { loud: !!o.loud }) : null;
      if (o.at && SPA && !sv) return true;
      const b = SB[id], d = o.dist || 0, k = (o.k || 1) / (sv ? 1 : 1 + d * 0.06), rr = S.rate || [0.98, 1.02], rate = (o.rate || 1) * (rr[0] + Math.random() * (rr[1] - rr[0]));
      const pk = Math.max(0.001, (SN[id] || 1) * (S.g || 1) * k), len = Math.min(S.len || b.duration, b.duration), ts = t + Math.min(0.14, d / 343 * 0.8);
      const src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.setValueAtTime(pk, ts);
      if (S.len) { g.gain.setValueAtTime(pk, ts + len * 0.6); g.gain.exponentialRampToValueAtTime(0.0005, ts + len); }
      let out = src;
      if (d > 4) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.max(1200, 9000 - d * 220); src.connect(f); out = f; }
      out.connect(g); g.connect(sv ? sv.in : master);
      evVoices += 1; src.onended = () => { evVoices -= 1; };
      src.start(ts); src.stop(ts + len / rate + 0.05);
      if (sv) sv.free(ts - now() + len / rate + 0.4);
      return true;
    }
    const has = (name) => !!(SMP[name] && SMP[name].ids.some((id) => SB[id]));

    // ------------------------------------------------------------ фоновый шум помещения (assets/amb*.mp3)
    // файл сам по себе не зацикливается чисто: хвост подмешиваем в начало (кроссфейд) — получается бесшовный луп
    const ambBus = ctx.createGain(); ambBus.gain.value = 0; ambBus.connect(master);
    const AM = { key: null, src: null, g: null, vol: -1 };
    function loopify(b, xf) {
      const sr = b.sampleRate, n = b.length, x = Math.min(Math.floor(xf * sr), n >> 1), m = n - x, o = ctx.createBuffer(b.numberOfChannels, m, sr);
      for (let ch = 0; ch < b.numberOfChannels; ch += 1) {
        const s = b.getChannelData(ch), d = o.getChannelData(ch);
        d.set(s.subarray(0, m));
        for (let i = 0; i < x; i += 1) { const k = (i / x) * Math.PI / 2; d[i] = s[i] * Math.sin(k) + s[m + i] * Math.cos(k); }
      }
      return o;
    }
    const ambient = {
      // theme — тема миссии (office/lab/bunker/…); неизвестная — тишина. Звук подхватывается сам, когда файл докачается
      set(theme) {
        const key = AMB_OF[theme] || null;
        if (key === AM.key) return;
        AM.key = key;
        if (AM.src) { try { AM.g.gain.setTargetAtTime(0, now(), 0.4); AM.src.stop(now() + 2); } catch (e) {} AM.src = AM.g = null; }
        if (!key) return;
        C.loadAmb(key).then((ab) => (ab ? decode(ab.slice(0)) : null)).then((b) => {
          if (!b || AM.key !== key || run.disposed) return;
          const src = ctx.createBufferSource(); src.buffer = loopify(b, 2.5); src.loop = true;
          const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(AMB[key].g, now(), 1.2);
          src.connect(g); g.connect(ambBus); src.start();
          AM.src = src; AM.g = g;
        }).catch(() => {});
      },
      // громкость следует за настройкой SFX; пауза игры (fight.hush) глушит, следующий кадр возвращает
      tick() {
        master.gain.value = sfxVol();
        if (AM.vol !== 0.8) { AM.vol = 0.8; ambBus.gain.setTargetAtTime(0.8, now(), 0.4); }
      },
      hush() { AM.vol = 0; ambBus.gain.setTargetAtTime(0, now(), 0.1); }
    };

    const GUNS = {
      // Glock: резкий короткий хлопок, лёгкий звон, щелчок затвора
      pistol: { hp: 3300, cd: 0.012, cg: 0.55, s0: 2700, s1: 650, sq: 0.9, sd: 0.065, sg: 1.0, b0: 1400, bd: 0.1, bg: 0.6, t0: 200, t1: 62, td: 0.09, tg: 0.8, ring: [2350, 0.05, 0.2], tail: 0.35, wet: 0.22, mech: 'slide' },
      // АК-47: громкий, «лающий», низкий удар и металлический звон
      ak: { hp: 2800, cd: 0.014, cg: 0.85, s0: 2100, s1: 420, sq: 0.7, sd: 0.11, sg: 1.2, b0: 950, bd: 0.22, bg: 1.0, t0: 125, t1: 40, td: 0.18, tg: 1.15, ring: [1250, 0.13, 0.32], sub: [72, 32, 0.22, 0.5], tail: 0.6, wet: 0.32, mech: 'rattle' },
      // дробовик: взрыв, долгий низкий хвост и эхо-«шлепок»
      shotgun: { hp: 2000, cd: 0.02, cg: 1.0, s0: 1600, s1: 240, sq: 0.6, sd: 0.2, sg: 1.45, b0: 720, bd: 0.4, bg: 1.45, t0: 95, t1: 28, td: 0.34, tg: 1.6, sub: [56, 24, 0.5, 0.85], tail: 1.0, wet: 0.42, mech: null, slap: 0.09 },
      epistol: { hp: 3000, cd: 0.012, cg: 0.4, s0: 2300, s1: 600, sq: 0.9, sd: 0.07, sg: 0.65, b0: 1100, bd: 0.1, bg: 0.4, t0: 170, t1: 60, td: 0.08, tg: 0.45, ring: [2000, 0.05, 0.12], tail: 0.35, wet: 0.25 },
      erifle: { hp: 2500, cd: 0.014, cg: 0.6, s0: 1900, s1: 400, sq: 0.7, sd: 0.1, sg: 0.85, b0: 850, bd: 0.18, bg: 0.7, t0: 140, t1: 48, td: 0.14, tg: 0.7, ring: [1100, 0.1, 0.2], tail: 0.5, wet: 0.3 },
      elmg: { hp: 2300, cd: 0.016, cg: 0.7, s0: 1700, s1: 340, sq: 0.7, sd: 0.12, sg: 1.0, b0: 800, bd: 0.2, bg: 0.9, t0: 110, t1: 38, td: 0.17, tg: 0.95, ring: [950, 0.12, 0.25], sub: [66, 30, 0.2, 0.4], tail: 0.6, wet: 0.32 },
      sniper: { hp: 1800, cd: 0.02, cg: 1.0, s0: 1500, s1: 220, sq: 0.6, sd: 0.22, sg: 1.5, b0: 700, bd: 0.45, bg: 1.5, t0: 100, t1: 30, td: 0.4, tg: 1.7, sub: [58, 24, 0.55, 0.9], tail: 1.2, wet: 0.5, slap: 0.12 },
    };
    GUNS.enemy = GUNS.erifle;
    function blast(P, t, k, lp, supp) {
      const r = 0.93 + Math.random() * 0.14, sk = supp ? 0.5 : 1;
      if (!supp) noise({ t, type: 'highpass', f0: Math.min(P.hp * r, lp + 2500), q: 0.7, dur: P.cd, g: P.cg * k, a: 0.0008, dest: gunBus });
      noise({ t, type: 'bandpass', f0: Math.min(P.s0 * r, lp), f1: P.s1, q: P.sq, dur: P.sd * (supp ? 1.3 : 1), g: P.sg * k * sk, a: 0.001, dest: gunBus });
      noise({ t, type: 'lowpass', f0: Math.min(P.b0 * r, supp ? 1500 : lp), f1: 90, q: 0.6, dur: P.bd, g: P.bg * k * sk, a: 0.002, dest: gunBus });
      tone({ t, type: 'sine', f0: P.t0 * r, f1: P.t1, dur: P.td, g: P.tg * k * (supp ? 0.45 : 1), a: 0.002, dest: gunBus });
      if (P.ring && !supp) noise({ t: t + 0.002, type: 'bandpass', f0: P.ring[0] * r, q: 12, dur: P.ring[1], g: P.ring[2] * k, a: 0.001, dest: gunBus });
      if (P.sub) tone({ t, type: 'triangle', f0: P.sub[0], f1: P.sub[1], dur: P.sub[2], g: P.sub[3] * k * (supp ? 0.4 : 1), a: 0.004, dest: gunBus });
    }
    function shot(kind, o) {
      o = o || {};
      if (sampleShot(kind, o)) return;
      const P = GUNS[kind] || GUNS.pistol, d = o.dist || 0, t = now() + (o.delay || 0) + Math.min(0.14, d / 343 * 0.8);
      const k = (1 / (1 + d * 0.06)) * (o.supp ? 0.7 : 1), lp = Math.max(900, 7000 - d * 190);
      master.gain.value = sfxVol();
      verbSend.gain.value = P.wet * (o.supp ? 0.25 : 1) * Math.min(1.4, 0.7 + d * 0.02);
      blast(P, t, k, lp, o.supp);
      if (P.slap && !o.supp) { // эхо от стен
        noise({ t: t + P.slap, type: 'lowpass', f0: 800, f1: 100, q: 0.5, dur: 0.3, g: 0.55 * k, dest: gunBus });
        tone({ t: t + P.slap, type: 'sine', f0: 70, f1: 30, dur: 0.25, g: 0.5 * k, dest: gunBus });
      }
      if (!o.supp && d < 60) noise({ t: t + 0.02, type: 'lowpass', f0: 520, f1: 80, q: 0.4, dur: P.tail, g: 0.2 * k, a: 0.01, dest: gunBus }); // грохот помещения
      if (P.mech && d < 8) { // механика: затвор Glock / сухой лязг АК
        const tm = t + (P.mech === 'slide' ? 0.05 : 0.035), sk = o.supp ? 2.4 : 1;
        if (P.mech === 'slide') { noise({ t: tm, type: 'highpass', f0: 2600, dur: 0.025, g: 0.22 * k * sk }); tone({ t: tm, type: 'square', f0: 1500, f1: 700, dur: 0.02, g: 0.06 * k * sk, lp: 3500 }); }
        else { noise({ t: tm, type: 'bandpass', f0: 1100, q: 2, dur: 0.04, g: 0.3 * k * sk }); tone({ t: tm, type: 'triangle', f0: 640, f1: 300, dur: 0.03, g: 0.1 * k, lp: 2500 }); }
      }
    }
    const FX = {
      magout: (t, k) => { noise({ t, type: 'highpass', f0: 2200, dur: 0.04, g: 0.35 * k }); tone({ t, type: 'triangle', f0: 800, f1: 300, dur: 0.06, g: 0.25 * k }); },
      magin: (t, k) => { tone({ t, type: 'sine', f0: 210, f1: 90, dur: 0.09, g: 0.9 * k }); noise({ t, type: 'bandpass', f0: 1800, dur: 0.05, g: 0.45 * k }); },
      rack: (t, k) => { [0, 0.075].forEach((d, i) => { noise({ t: t + d, type: 'highpass', f0: 1800, dur: 0.035, g: 0.5 * k }); tone({ t: t + d, type: 'square', f0: i ? 520 : 1100, f1: i ? 300 : 600, dur: 0.045, g: 0.16 * k, lp: 2500 }); }); },
      pump: (t, k) => { [0, 0.16].forEach((d, i) => { noise({ t: t + d, type: 'bandpass', f0: i ? 700 : 1200, dur: 0.06, g: 0.7 * k }); tone({ t: t + d, type: 'square', f0: i ? 180 : 330, f1: 120, dur: 0.06, g: 0.2 * k, lp: 1800 }); }); },
      shell: (t, k) => { tone({ t, type: 'triangle', f0: 900, f1: 420, dur: 0.04, g: 0.3 * k }); noise({ t, type: 'bandpass', f0: 2000, dur: 0.03, g: 0.3 * k }); },
      empty: (t, k) => { tone({ t, type: 'square', f0: 900, f1: 500, dur: 0.025, g: 0.3 * k, lp: 3000 }); noise({ t, type: 'highpass', f0: 3000, dur: 0.02, g: 0.2 * k }); },
      draw: (t, k) => { noise({ t, type: 'bandpass', f0: 900, f1: 1800, dur: 0.12, g: 0.25 * k }); tone({ t: t + 0.1, type: 'triangle', f0: 600, f1: 300, dur: 0.05, g: 0.2 * k }); },
      hit: (t, k) => { tone({ t, type: 'square', f0: 1700, dur: 0.03, g: 0.22 * k, lp: 4000 }); },
      head: (t, k) => { tone({ t, type: 'square', f0: 2300, dur: 0.035, g: 0.26 * k, lp: 5000 }); tone({ t: t + 0.04, type: 'square', f0: 3000, dur: 0.05, g: 0.2 * k, lp: 5000 }); },
      kill: (t, k) => { tone({ t, type: 'sine', f0: 140, f1: 60, dur: 0.18, g: 0.5 * k }); noise({ t, type: 'lowpass', f0: 500, f1: 100, dur: 0.2, g: 0.3 * k }); },
      impact: (t, k) => { noise({ t, type: 'highpass', f0: 3200, dur: 0.04, g: 0.18 * k }); tone({ t, type: 'triangle', f0: 400, f1: 200, dur: 0.04, g: 0.1 * k }); },
      whizz: (t, k) => { noise({ t, type: 'bandpass', f0: 3200, f1: 1000, q: 3, dur: 0.14, g: 0.25 * k }); },
      hurt: (t, k) => { tone({ t, type: 'sine', f0: 95, f1: 45, dur: 0.24, g: 1.1 * k }); noise({ t, type: 'lowpass', f0: 600, f1: 100, dur: 0.22, g: 0.6 * k }); },
      beat: (t, k) => { tone({ t, type: 'sine', f0: 62, f1: 40, dur: 0.13, g: 0.9 * k }); tone({ t: t + 0.19, type: 'sine', f0: 56, f1: 38, dur: 0.12, g: 0.55 * k }); },
      boom: (t, k) => { noise({ t, type: 'lowpass', f0: 1100, f1: 60, q: 0.5, dur: 1.0, g: 2.0 * k }); tone({ t, type: 'sine', f0: 70, f1: 24, dur: 0.9, g: 1.6 * k }); noise({ t, type: 'bandpass', f0: 2500, f1: 500, dur: 0.15, g: 1.0 * k }); },
      pickup: (t, k) => { tone({ t, type: 'triangle', f0: 600, dur: 0.07, g: 0.3 * k }); tone({ t: t + 0.07, type: 'triangle', f0: 900, dur: 0.1, g: 0.3 * k }); },
      slam: (t, k) => { tone({ t, type: 'sine', f0: 90, f1: 35, dur: 0.4, g: 1.3 * k }); noise({ t, type: 'lowpass', f0: 900, f1: 80, dur: 0.35, g: 1.0 * k }); noise({ t, type: 'highpass', f0: 2000, dur: 0.08, g: 0.5 * k }); },
      alarm: (t, k) => { tone({ t, type: 'square', f0: 880, dur: 0.22, g: 0.2 * k, lp: 2200 }); tone({ t: t + 0.25, type: 'square', f0: 620, dur: 0.22, g: 0.2 * k, lp: 2200 }); },
      beep: (t, k) => { tone({ t, type: 'sine', f0: 1500, dur: 0.07, g: 0.22 * k }); },
      hum: (t, k) => { tone({ t, type: 'sawtooth', f0: 60, f1: 62, dur: 0.6, g: 0.18 * k, lp: 240 }); },
      glass: (t, k) => { noise({ t, type: 'highpass', f0: 4000, dur: 0.3, g: 0.5 * k }); tone({ t, type: 'triangle', f0: 3000, f1: 1500, dur: 0.15, g: 0.15 * k }); },
      flesh: (t, k) => { noise({ t, type: 'lowpass', f0: 900, f1: 160, q: 0.6, dur: 0.1, g: 0.55 * k }); tone({ t, type: 'sine', f0: 130, f1: 55, dur: 0.09, g: 0.5 * k }); noise({ t: t + 0.008, type: 'bandpass', f0: 1700, q: 1.2, dur: 0.05, g: 0.18 * k }); },
      bone: (t, k) => { noise({ t, type: 'highpass', f0: 2500, dur: 0.02, g: 0.4 * k }); tone({ t, type: 'triangle', f0: 520, f1: 190, dur: 0.07, g: 0.35 * k }); noise({ t: t + 0.01, type: 'lowpass', f0: 800, f1: 150, dur: 0.1, g: 0.45 * k }); tone({ t, type: 'sine', f0: 110, f1: 50, dur: 0.1, g: 0.4 * k }); },
      fall: (t, k) => { noise({ t, type: 'lowpass', f0: 450, f1: 60, q: 0.5, dur: 0.28, g: 0.85 * k }); tone({ t, type: 'sine', f0: 80, f1: 32, dur: 0.3, g: 0.9 * k }); noise({ t, type: 'bandpass', f0: 1400, f1: 500, q: 0.8, dur: 0.18, g: 0.12 * k }); },
      casing: (t, k) => { const f = 3800 + Math.random() * 1200; [0, 0.09, 0.16].forEach((d, i) => { tone({ t: t + d, type: 'sine', f0: f * (1 - i * 0.04), dur: 0.09 - i * 0.02, g: (0.26 - i * 0.08) * k }); tone({ t: t + d, type: 'sine', f0: f * 1.5, dur: 0.05, g: (0.1 - i * 0.03) * k }); noise({ t: t + d, type: 'highpass', f0: 5000, dur: 0.012, g: 0.1 * k }); }); },
      gundrop: (t, k) => { tone({ t, type: 'sine', f0: 170, f1: 70, dur: 0.1, g: 0.6 * k }); noise({ t, type: 'bandpass', f0: 1500, q: 1, dur: 0.07, g: 0.45 * k }); [0.07, 0.15, 0.22].forEach((d, i) => { noise({ t: t + d, type: 'bandpass', f0: 2200 - i * 300, q: 3, dur: 0.035, g: 0.25 * k / (i + 1) }); tone({ t: t + d, type: 'triangle', f0: 900 - i * 120, f1: 400, dur: 0.04, g: 0.1 * k / (i + 1) }); }); },
      train: (t, k) => { tone({ t, type: 'sine', f0: 52, dur: 0.16, g: 0.3 * k, lp: 150 }); noise({ t, type: 'lowpass', f0: 280, dur: 0.14, g: 0.2 * k }); },
      // набор для миссий 17–47 (kit.js): взлом, гранаты, сирена
      click: (t, k) => { tone({ t, type: 'square', f0: 1900, f1: 1100, dur: 0.02, g: 0.14 * k, lp: 4000 }); noise({ t, type: 'highpass', f0: 4000, dur: 0.012, g: 0.12 * k }); },
      tick: (t, k) => { tone({ t, type: 'sine', f0: 2300, dur: 0.035, g: 0.16 * k }); },
      ok: (t, k) => { tone({ t, type: 'triangle', f0: 700, dur: 0.08, g: 0.26 * k }); tone({ t: t + 0.08, type: 'triangle', f0: 1050, dur: 0.1, g: 0.26 * k }); tone({ t: t + 0.17, type: 'triangle', f0: 1400, dur: 0.16, g: 0.26 * k }); },
      bad: (t, k) => { tone({ t, type: 'sawtooth', f0: 190, f1: 120, dur: 0.28, g: 0.3 * k, lp: 900 }); tone({ t: t + 0.12, type: 'sawtooth', f0: 150, f1: 90, dur: 0.3, g: 0.3 * k, lp: 800 }); },
      zap: (t, k) => { noise({ t, type: 'bandpass', f0: 3500, f1: 600, q: 2, dur: 0.18, g: 0.5 * k }); tone({ t, type: 'sawtooth', f0: 900, f1: 120, dur: 0.16, g: 0.2 * k, lp: 2500 }); },
      throw: (t, k) => { noise({ t, type: 'bandpass', f0: 700, f1: 1800, q: 1, dur: 0.14, g: 0.3 * k }); },
      thud: (t, k) => { tone({ t, type: 'sine', f0: 130, f1: 60, dur: 0.1, g: 0.55 * k }); noise({ t, type: 'bandpass', f0: 900, q: 1.5, dur: 0.05, g: 0.25 * k }); },
      siren: (t, k) => { tone({ t, type: 'sawtooth', f0: 520, f1: 980, dur: 0.55, g: 0.2 * k, a: 0.12, lp: 2600 }); tone({ t: t + 0.55, type: 'sawtooth', f0: 980, f1: 520, dur: 0.55, g: 0.2 * k, a: 0.02, lp: 2600 }); },
      // ближний бой (pmove.js): замах, удары кулаком, пинок, скольжение, блок/парирование, хлопок ладонью по магазину, дыхание
      whoosh: (t, k) => { noise({ t, type: 'bandpass', f0: 520, f1: 1900, q: 0.9, dur: 0.15, g: 0.34 * k, a: 0.05 }); },
      punch: (t, k) => { tone({ t, type: 'sine', f0: 150, f1: 58, dur: 0.12, g: 0.85 * k }); noise({ t, type: 'lowpass', f0: 1300, f1: 150, q: 0.7, dur: 0.1, g: 0.6 * k }); noise({ t, type: 'highpass', f0: 2600, dur: 0.02, g: 0.3 * k }); },
      punchheavy: (t, k) => { tone({ t, type: 'sine', f0: 110, f1: 38, dur: 0.22, g: 1.25 * k }); noise({ t, type: 'lowpass', f0: 1000, f1: 100, q: 0.6, dur: 0.18, g: 0.95 * k }); noise({ t, type: 'highpass', f0: 2200, dur: 0.035, g: 0.4 * k }); tone({ t: t + 0.015, type: 'triangle', f0: 380, f1: 130, dur: 0.07, g: 0.35 * k }); },
      kick: (t, k) => { tone({ t, type: 'sine', f0: 120, f1: 44, dur: 0.18, g: 1.05 * k }); noise({ t, type: 'lowpass', f0: 900, f1: 120, q: 0.6, dur: 0.15, g: 0.8 * k }); noise({ t, type: 'bandpass', f0: 1700, q: 1.1, dur: 0.05, g: 0.3 * k }); },
      slide: (t, k) => { noise({ t, type: 'bandpass', f0: 950, f1: 280, q: 0.8, dur: 0.75, g: 0.3 * k, a: 0.06 }); noise({ t, type: 'lowpass', f0: 320, f1: 90, q: 0.6, dur: 0.7, g: 0.4 * k, a: 0.05 }); },
      parry: (t, k) => { tone({ t, type: 'triangle', f0: 1800, f1: 900, dur: 0.12, g: 0.34 * k }); noise({ t, type: 'highpass', f0: 3000, dur: 0.06, g: 0.5 * k }); tone({ t, type: 'sine', f0: 100, f1: 48, dur: 0.18, g: 0.85 * k }); },
      block: (t, k) => { tone({ t, type: 'sine', f0: 105, f1: 55, dur: 0.14, g: 0.7 * k }); noise({ t, type: 'lowpass', f0: 700, f1: 160, q: 0.6, dur: 0.11, g: 0.55 * k }); },
      palm: (t, k) => { noise({ t, type: 'highpass', f0: 2800, dur: 0.018, g: 0.4 * k }); tone({ t, type: 'sine', f0: 125, f1: 70, dur: 0.08, g: 0.6 * k }); },
      breath: (t, k) => { noise({ t, type: 'bandpass', f0: 700, f1: 520, q: 0.7, dur: 0.5, g: 0.13 * k, a: 0.18 }); },
      rustle: (t, k) => { noise({ t, type: 'bandpass', f0: 2400, f1: 1200, q: 0.8, dur: 0.14, g: 0.12 * k, a: 0.04 }); }
    };

    // ------------------------------------------------------------ взрыв (граната / C4 / бочка / бомба): слои — удар, треск, тело, раскат, эхо, град обломков; вдали темнее и позже;
    // рядом — звон в ушах: срезаются верха всех эффектов (muf) и приглушается трек перестрелки
    let earUntil = 0, earSpan = 1, earLow = 1;
    const earMul = () => { const t = now(); if (t >= earUntil) return 1; const k = 1 - (earUntil - t) / earSpan; return earLow + (1 - earLow) * k * k; };
    function blast(o) {
      o = o || {};
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      master.gain.value = sfxVol();
      const d = Math.max(0, o.dist || 0), R = o.R || 5, sz = Math.min(2.2, Math.max(0.5, R / 4.8)), near = Math.max(0, Math.min(1, o.near || 0)), kind = o.kind || 'frag';
      const sv = SPA && o.at ? SPA.voice(o.at, { loud: true, dest: gunBus }) : null;
      const k = (o.k || 1) / (sv ? 1 : 1 + d * 0.09), t = now() + Math.min(0.45, d / 343 * 1.1), r = Math.random;
      if (sv) sv.free(t - now() + 4.5);
      playSmp('boom', { at: o.at, loud: true, dist: d, k: (0.75 + 0.2 * sz) * (kind === 'barrel' ? 0.85 : 1), rate: Math.max(0.78, Math.min(1.12, 1.1 - 0.12 * sz)) }, t);
      const bf = ctx.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = Math.max(1100, 14000 - d * 420);
      // слои суммируются с запасом x6, а после gunBus (x2.1) идёт насыщение: без lvl всё упиралось в потолок и дистанция не влияла на громкость
      const lvl = 0.18;
      const bus = ctx.createGain(); bus.gain.value = k * 0.5 * lvl; bus.connect(bf); bf.connect(sv ? sv.in : gunBus); // gunBus (x2.1) даёт насыщение и реверб помещения
      const dry = ctx.createGain(); dry.gain.value = k * lvl; dry.connect(bf); // низ: удар и гул
      const big = kind === 'bomb' ? 1.25 : kind === 'barrel' ? 0.8 : 1;
      tone({ t, type: 'sine', f0: 78, f1: 26, dur: 0.9 + 0.5 * sz, g: 2.2 * big, a: 0.004, dest: dry });
      tone({ t, type: 'sine', f0: 46, f1: 20, dur: 1.2 + 0.6 * sz, g: 1.5 * big, a: 0.01, dest: dry });
      noise({ t, type: 'lowpass', f0: 170, f1: 60, q: 0.7, dur: 0.14, g: 2.6 * big, a: 0.001, dest: dry });
      noise({ t, type: 'bandpass', f0: 4200, f1: 900, q: 0.8, dur: 0.14, g: 1.5, a: 0.001, dest: bus });
      noise({ t, type: 'highpass', f0: 6000, dur: 0.05, g: 0.9, a: 0.0008, dest: bus });
      noise({ t, type: 'lowpass', f0: 2600, f1: 110, q: 0.6, dur: 0.55 + 0.35 * sz, g: 2.0, a: 0.004, dest: bus });
      noise({ t: t + 0.05, type: 'lowpass', f0: 520, f1: 40, q: 1.1, dur: 1.9 + 1.3 * sz, g: 1.1, a: 0.06, dest: bus });
      if (!light) {
        noise({ t: t + 0.05, type: 'lowpass', f0: 1400, f1: 90, q: 0.6, dur: 0.9, g: 1.2, a: 0.01, dest: bus });
        noise({ t: t + 0.2 + d * 0.004, type: 'lowpass', f0: 900, f1: 80, q: 0.6, dur: 0.8 + 0.3 * sz, g: 0.5, a: 0.02, dest: bus }); // отражение от стен
      }
      for (let i = 0, n = light ? 5 : 11; i < n; i += 1) { // осыпающиеся обломки
        const tt = t + 0.3 + r() * 1.6;
        noise({ t: tt, type: 'bandpass', f0: 900 + r() * 3200, q: 2, dur: 0.04 + r() * 0.05, g: 0.12 + r() * 0.2, dest: bus });
        if (r() < 0.4) tone({ t: tt, type: 'triangle', f0: 180 + r() * 150, f1: 70, dur: 0.08, g: 0.15, dest: bus });
      }
      if (near > 0.3 && d < R * 2) { // контузия: звон + приглушённый мир, который возвращается за пару секунд
        tone({ t: t + 0.05, type: 'sine', f0: 4800, dur: 1.2 + 3.2 * near, g: 0.05 + 0.09 * near, a: 0.05 });
        const span = 1.4 + 3 * near, low = Math.max(380, 1800 - near * 1400), f = muf.frequency;
        f.cancelScheduledValues(t); f.setValueAtTime(20000, t + 0.1); f.exponentialRampToValueAtTime(low, t + 0.22); f.exponentialRampToValueAtTime(20000, t + 0.22 + span);
        earUntil = t + 0.22 + span; earSpan = span + 0.22; earLow = 0.2;
      }
    }
    function play(name, o) {
      o = o || {};
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      master.gain.value = sfxVol();
      const t = now() + (o.delay || 0);
      if (o.w && (name === 'magout' || name === 'magin') && reloadSample(name, o.w, t, o.k || 1)) return;
      const S = SMP[name];
      const smp = S && playSmp(name, o, t);
      if (smp && !S.also) return;
      const f = FX[name] || FX[FALL[name]];
      if (f) f(t, (o.k || 1) * (smp ? 0.55 : 1)); // слой сэмпла + синтез поверх (дверь хранилища): синтез тише
    }

    // ------------------------------------------------------------ процедурная музыка (стрессовые треки)
    // шаг = 1/16 такта; ratios — интервалы от тоники (фригийский лад: малая секунда даёт тревогу)
    // Синтезированная музыка отключена: в миссиях играют ТОЛЬКО треки из assets (fight1 — перестрелки, heistsneak/heistloud — ограбление).
    // Оставлены пустые start/level/stop и duck (его читает трек перестрелки), чтобы вызовы из миссий ничего не ломали.
    const M = { duck: 1 };
    const F = { el: null, g: null, mix: 0, failed: false, primed: false, retry: 0 }; // трек перестрелки (см. ниже)
    const music = {
      start() {},
      level() {},
      duck(v) { M.duck = v; },
      stop() {},
      get on() { return false; }
    };

    // ------------------------------------------------------------ трек перестрелки (assets/fight1.mp3)
    // Файл большой, поэтому он не декодируется целиком, а стримится через HTMLAudioElement. Играет по кругу, пока идёт перестрелка;
    // между перестрелками ставится на паузу и продолжается с того же места. Громкость — по настройке музыки (musicVolume/masterVolume).
    function fightInit() {
      if (F.el || F.failed || typeof Audio === 'undefined') return;
      try {
        const el = new Audio(FIGHT_SRC);
        el.loop = true; el.preload = 'auto';
        el.addEventListener('error', () => { F.failed = true; });
        F.el = el;
        // через WebAudio громкость работает и на iOS (там el.volume игнорируется); для file:// нельзя — звук обнулится.
        // ВАЖНО: у элемента, подключённого через MediaElementSource, volume/muted применяются ДО узла, поэтому его громкость держим на 1, а регулируем F.g
        let routed = false;
        if (location.protocol !== 'file:') {
          try { const s = ctx.createMediaElementSource(el); F.g = ctx.createGain(); F.g.gain.value = 0; s.connect(F.g); F.g.connect(post); routed = true; } catch (e) { F.g = null; }
        }
        el.volume = routed ? 1 : 0;
      } catch (e) { F.failed = true; }
    }
    function fightApply() {
      const v = Math.max(0, Math.min(1, musVol() * M.duck * earMul() * F.mix));
      if (F.g) F.g.gain.value = v; else F.el.volume = v;
    }
    const fight = {
      // want — идёт ли перестрелка; вызывается каждый кадр игры
      tick(dt, want) {
        if (!F.el) { if (!want) return; fightInit(); if (!F.el) return; }
        F.mix = Math.max(0, Math.min(1, F.mix + (want ? dt / 0.7 : -dt / 1.6)));
        if (want && F.el.paused && !F.failed && performance.now() > F.retry) {
          F.retry = performance.now() + 1000;
          if (ctx.state === 'suspended') ctx.resume().catch(() => {});
          const p = F.el.play(); if (p && p.catch) p.catch(() => {});
        } else if (!want && F.mix <= 0 && !F.el.paused) F.el.pause();
        fightApply();
      },
      // пауза игры / закрытая вкладка: звук сразу останавливается, после снятия паузы трек плавно возвращается
      hush() { ambient.hush(); if (!F.el) return; F.mix = 0; F.retry = 0; if (!F.el.paused) F.el.pause(); },
      // iOS: первый play() должен произойти внутри жеста игрока, иначе позже браузер его не пустит
      prime() {
        if (F.primed || !run.touch) return;
        fightInit(); if (!F.el || F.failed) return;
        F.primed = true;
        const el = F.el; el.muted = true;
        const undo = () => { el.muted = false; if (F.mix <= 0) { el.pause(); try { el.currentTime = 0; } catch (e) {} } };
        try { const p = el.play(); if (p && p.then) p.then(undo, undo); else undo(); } catch (e) { undo(); }
      },
      get on() { return !!F.el && F.mix > 0; }
    };

    // ------------------------------------------------------------ смерть игрока (js/deathcam.js)
    // 1) весь звук резко обрывается «зажёванной плёнкой»: музыка тормозит с падением тона (playbackRate без сохранения высоты), поверх — царапанье иглы и треск
    // 2) тишина, в ней нарастает звон в ушах 3) глухое сердце: Бум… Бум… Бум……. — всё реже и тише, к концу сцены исчезает
    const D = { on: false, timer: 0, els: [], nodes: [] };
    function deathStop() {
      clearInterval(D.timer); D.timer = 0;
      const t = now();
      for (const n of D.nodes) { try { n.g.gain.cancelScheduledValues(t); n.g.gain.setTargetAtTime(0, t, 0.06); n.o.stop(t + 0.5); } catch (e) {} }
      D.nodes = [];
      for (const e of D.els) { try { e.playbackRate = 1; e.preservesPitch = true; e.mozPreservesPitch = true; e.webkitPreservesPitch = true; } catch (x) {} }
      D.els = [];
      if (D.on) { post.gain.cancelScheduledValues(t); post.gain.setValueAtTime(post.gain.value, t); post.gain.setTargetAtTime(1, t, 0.12); }
      D.on = false;
    }
    function deathThud() { // тело упало на пол: глухой удар в тишине
      if (!D.on) return;
      const t = now() + 0.005;
      tone({ t, type: 'sine', f0: 84, f1: 28, dur: 0.38, g: 1.0, a: 0.004, dest: dBus });
      noise({ t, type: 'lowpass', f0: 420, f1: 60, q: 0.6, dur: 0.3, g: 0.7, a: 0.003, dest: dBus });
    }
    // выстрел в упор по игроку (deathcam.js, вариант C «казнь»): сухой треск + удар в грудь + раскат — поверх тишины и звона в ушах
    function deathShot(pw, dl) {
      if (!D.on) return;
      const t = now() + 0.004 + (dl || 0), p = pw || 1, r = Math.random;
      noise({ t, type: 'highpass', f0: 1800, f1: 500, q: 0.7, dur: 0.07, g: 0.8 * p, a: 0.0012, dest: dBus });
      noise({ t, type: 'bandpass', f0: 2600, f1: 800, q: 0.8, dur: 0.17, g: 0.6 * p, a: 0.0015, dest: dBus });
      tone({ t, type: 'sine', f0: 190 + r() * 30, f1: 36, dur: 0.36, g: 0.95 * p, a: 0.002, dest: dBus });
      tone({ t, type: 'sawtooth', f0: 420, f1: 60, dur: 0.12, g: 0.2 * p, a: 0.002, lp: 1600, dest: dBus });
      noise({ t: t + 0.03, type: 'lowpass', f0: 900, f1: 90, q: 0.5, dur: 0.8, g: 0.32 * p, a: 0.01, dest: dBus });
    }
    function deathClick(cnt) { // ствол упёрся в голову: металлический «клик», у главного охранника — ещё и передёргивание затвора
      if (!D.on) return;
      for (let i = 0; i < (cnt || 1); i += 1) {
        const t = now() + 0.004 + i * 0.13;
        noise({ t, type: 'highpass', f0: 3600, dur: 0.025, g: 0.45, a: 0.0008, dest: dBus });
        tone({ t, type: 'triangle', f0: 2100 - i * 500, f1: 900, dur: 0.05, g: 0.22, a: 0.001, dest: dBus });
      }
    }
    function deathStart(els) {
      if (D.on) deathStop();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      D.on = true;
      const t = now(), r = Math.random, k = Math.min(1.2, sfxVol()) * 0.75;
      dBus.gain.value = k;
      post.gain.cancelScheduledValues(t); post.gain.setValueAtTime(post.gain.value, t);
      post.gain.setTargetAtTime(0, t + 0.03, 0.14); post.gain.setValueAtTime(0, t + 1);
      D.els = [F.el].concat(els || []).filter(Boolean);
      for (const e of D.els) { try { e.preservesPitch = false; e.mozPreservesPitch = false; e.webkitPreservesPitch = false; } catch (x) {} }
      const t0 = performance.now();
      D.timer = setInterval(() => {
        const q = Math.min(1, (performance.now() - t0) / 700);
        for (const e of D.els) { try { e.playbackRate = Math.max(0.12, 1 - 0.9 * Math.pow(q, 1.5)); } catch (x) {} }
        if (q >= 1) { clearInterval(D.timer); D.timer = 0; for (const e of D.els) { try { e.pause(); } catch (x) {} } }
      }, 30);
      const T = t + 0.02;
      tone({ t: T, type: 'sine', f0: 110, f1: 30, dur: 0.5, g: 1.1, a: 0.004, dest: dBus });                              // глухой удар
      tone({ t: T, type: 'sawtooth', f0: 540, f1: 36, dur: 0.66, g: 0.3, a: 0.01, lp: 1800, dest: dBus });                  // плёнка тормозит
      tone({ t: T + 0.05, type: 'square', f0: 250, f1: 20, dur: 0.6, g: 0.1, a: 0.01, lp: 900, dest: dBus });
      for (let i = 0; i < 6; i += 1) { // иглу дёргает туда-сюда: быстрые царапающие взмахи
        const ti = T + 0.03 + i * 0.075 + r() * 0.02, up = i % 2 === 0;
        noise({ t: ti, type: 'bandpass', f0: up ? 800 : 3800, f1: up ? 3800 : 700, q: 2.5, dur: 0.07, g: 0.8, a: 0.004, dest: dBus });
        tone({ t: ti, type: 'sawtooth', f0: up ? 280 : 1100, f1: up ? 1100 : 250, dur: 0.07, g: 0.12, a: 0.004, lp: 3000, dest: dBus });
      }
      for (let i = 0; i < 18; i += 1) noise({ t: T + r() * 0.95, type: 'highpass', f0: 3000 + r() * 3000, dur: 0.012, g: 0.25 + r() * 0.35, a: 0.0006, dest: dBus }); // треск винила
      const ring = (f, peak, rise) => { // звон в ушах: две близкие ноты дают дрожащие биения
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, T + 0.5); g.gain.linearRampToValueAtTime(peak, T + 0.5 + rise);
        o.connect(g); g.connect(dBus); o.start(T + 0.5); D.nodes.push({ o, g });
      };
      ring(6200, 0.055, 4.5); ring(6247, 0.035, 5); ring(3100, 0.018, 5.5);
      [[0.85, 1], [1.7, 0.75], [2.65, 0.52], [3.75, 0.3], [5, 0.14]].forEach((b) => { // сердце: удар и слабый второй толчок, интервалы растут, громкость падает
        const tb = T + b[0], a = b[1];
        tone({ t: tb, type: 'sine', f0: 68, f1: 36, dur: 0.24, g: 1.1 * a, a: 0.006, dest: dBus });
        tone({ t: tb, type: 'triangle', f0: 130, f1: 70, dur: 0.12, g: 0.3 * a, a: 0.004, dest: dBus });
        tone({ t: tb + 0.19, type: 'sine', f0: 58, f1: 34, dur: 0.2, g: 0.6 * a, a: 0.006, dest: dBus });
        noise({ t: tb, type: 'lowpass', f0: 180, f1: 60, q: 0.7, dur: 0.16, g: 0.5 * a, a: 0.004, dest: dBus });
      });
    }

    function close() {
      deathStop(); music.stop(0);
      try { SPA && SPA.dispose(); } catch (e) {}
      if (AM.src) { try { AM.src.stop(); } catch (e) {} AM.src = null; }
      F.failed = true;
      if (F.el) { try { F.el.pause(); F.el.removeAttribute('src'); F.el.load(); } catch (e) {} F.el = null; }
      try { ctx.close(); } catch (e) {}
    }
    return { ctx, out: comp, lim, dest: post, spatial: SPA, master, muf, duck, deathStart, deathStop, deathThud, deathShot, deathClick, shot, play, blast, has, ambient, music, fight, close, tone, noise, sfxVol, musVol, resume() { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); fight.prime(); } };
  };
}());
