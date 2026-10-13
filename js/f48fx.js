// NEXA: миссия 48 — эффекты и звук: CSS-вставки, мешок на голову, собственный Audio-трек для .m4a (car.m4a / flashback.m4a),
// «динамик машины» (EQ + бас-удар от анализатора), гудки. Постобработка флешбека — ниже (F.flash).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48) return;
  const F = C.f48, K = F.K = F.K || {}, PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ------------------------------------------------------------------ CSS (вставляется один раз)
  K.css = function () {
    if (document.getElementById('f48-css')) return;
    const s = document.createElement('style'); s.id = 'f48-css';
    s.textContent = `
.f48-sack{position:absolute;inset:0;z-index:7;pointer-events:none;background:#000;opacity:0;transition:opacity .05s}
.f48-sack i{position:absolute;inset:-8%;background-size:340px 340px;filter:brightness(.9) contrast(1.15);will-change:transform,opacity}
.f48-sack b{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 46%,rgba(255,224,170,.20) 0%,rgba(0,0,0,.35) 38%,rgba(0,0,0,.92) 100%)}
.f48-sack u{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px)}
.f48-title{position:absolute;inset:0;z-index:8;display:grid;place-items:center;pointer-events:none;text-align:center;color:#e9e9e9}
.f48-title h1{margin:0;font:600 clamp(26px,5vw,64px)/1.1 Teko,Oswald,sans-serif;letter-spacing:.18em;opacity:0;transition:opacity 2.4s ease-out, letter-spacing 6s linear;text-transform:uppercase}
.f48-title h1.on{opacity:1;letter-spacing:.28em}
.f48-title p{margin:10px 0 0;font:400 clamp(12px,1.4vw,18px) Teko,Oswald,sans-serif;letter-spacing:.4em;color:#9a9a9a;opacity:0;transition:opacity 1.6s}
.f48-title p.on{opacity:1}
.f48-black{position:absolute;inset:0;z-index:12;background:#000;opacity:0;pointer-events:none;transition:opacity .6s}
.f48-quote{position:absolute;inset:0;z-index:13;display:grid;place-items:center;text-align:center;pointer-events:none;padding:8vw;color:#dcdcdc}
.f48-quote div{max-width:900px;font:400 clamp(18px,2.6vw,34px)/1.5 Oswald,Teko,sans-serif;letter-spacing:.06em;opacity:0;transition:opacity 2.2s}
.f48-quote div.on{opacity:1}
.f48-done{position:absolute;inset:0;z-index:14;display:grid;place-items:center;pointer-events:none;color:#f1f1f1}
.f48-done h1{margin:0;font:600 clamp(28px,6vw,80px) Teko,Oswald,sans-serif;letter-spacing:.3em;opacity:0;transition:opacity 4s ease-in, letter-spacing 9s ease-out;white-space:nowrap}
.f48-done h1.on{opacity:1;letter-spacing:.42em}
.f48-gas{position:absolute;inset:0;z-index:5;pointer-events:none;background:radial-gradient(ellipse at 50% 50%,rgba(110,170,40,0) 25%,rgba(90,150,30,.45) 100%);opacity:0;transition:opacity .4s}
.f48-fl{position:absolute;inset:0;z-index:6;pointer-events:none;opacity:0;transition:opacity .8s;background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 38%,rgba(0,0,0,.55) 78%,rgba(0,0,0,.92) 100%);mix-blend-mode:normal}
.f48-time{position:absolute;top:18px;left:50%;transform:translateX(-50%);z-index:6;font:500 clamp(20px,3vw,38px) Teko,Oswald,sans-serif;letter-spacing:.2em;color:#e8e8e8;text-shadow:0 0 8px #000;pointer-events:none}
.f48-time.warn{color:#ff4a3a}
`;
    document.head.appendChild(s);
  };

  // ------------------------------------------------------------------ мешок на голове (DOM-слой поверх сцены)
  function burlapURL() {
    if (K._burl) return K._burl;
    const c = document.createElement('canvas'); c.width = c.height = 170; const g = c.getContext('2d');
    g.fillStyle = '#7d7260'; g.fillRect(0, 0, 170, 170);
    for (let y = 0; y < 170; y += 3) { g.fillStyle = 'rgba(0,0,0,' + (0.12 + Math.random() * 0.18) + ')'; g.fillRect(0, y, 170, 1.4); }
    for (let x = 0; x < 170; x += 3) { g.fillStyle = 'rgba(255,240,210,' + (0.05 + Math.random() * 0.12) + ')'; g.fillRect(x, 0, 1.2, 170); }
    for (let i = 0; i < 1400; i += 1) { g.fillStyle = Math.random() < 0.5 ? 'rgba(25,15,5,.28)' : 'rgba(255,235,200,.2)'; g.fillRect(Math.random() * 170, Math.random() * 170, 1 + Math.random() * 3, 1); }
    // светящиеся просветы
    for (let i = 0; i < 90; i += 1) { g.fillStyle = 'rgba(255,225,170,' + (0.1 + Math.random() * 0.25) + ')'; g.fillRect(Math.random() * 170, Math.random() * 170, 1, 1); }
    return (K._burl = c.toDataURL());
  }
  // on: true — мешок опускается на камеру (dur с), false — его срывают. Возвращает промис по завершении
  K.sackFx = function (r, on, dur, o) {
    K.css(); o = o || {};
    let el = r.f48sackEl;
    if (!el) {
      el = r.f48sackEl = document.createElement('div'); el.className = 'f48-sack';
      el.innerHTML = '<i></i><b></b><u></u>'; el.firstChild.style.backgroundImage = 'url(' + burlapURL() + ')';
      r.layer.appendChild(el);
    }
    const tex = el.firstChild;
    return new Promise((res) => {
      if (on) {
        el.style.transition = 'none'; el.style.opacity = '1'; tex.style.transition = 'none';
        tex.style.transform = 'translateY(-110%)'; tex.style.opacity = '1';
        void el.offsetWidth;
        tex.style.transition = 'transform ' + dur + 's cubic-bezier(.3,.8,.4,1)'; tex.style.transform = 'translateY(0)';
        setTimeout(res, dur * 1000);
      } else {
        tex.style.transition = 'transform ' + dur + 's cubic-bezier(.6,.0,.9,.4), opacity ' + dur + 's'; tex.style.transform = 'translateY(-125%) rotate(' + (o.rot || -6) + 'deg)';
        el.firstChild.nextSibling.style.transition = 'opacity ' + dur + 's'; el.firstChild.nextSibling.style.opacity = '0';
        setTimeout(() => { el.style.opacity = '0'; el.firstChild.nextSibling.style.opacity = '1'; res(); }, dur * 1000);
      }
    });
  };
  // прямой уровень непрозрачности мешка (дышит, когда игрок «просыпается»)
  K.sackLevel = function (r, a) { const el = r.f48sackEl; if (el) { el.style.transition = 'none'; el.style.opacity = String(a); } };
  K.sackHide = function (r) { const el = r.f48sackEl; if (el) { el.style.opacity = '0'; const t = el.firstChild; t.style.transition = 'none'; t.style.transform = 'translateY(-125%)'; } };

  // ------------------------------------------------------------------ экранные надписи
  K.title = async function (r, big, small, hold) {
    K.css();
    const el = document.createElement('div'); el.className = 'f48-title';
    el.innerHTML = '<div><h1></h1><p></p></div>'; el.querySelector('h1').textContent = big; el.querySelector('p').textContent = small || '';
    r.layer.appendChild(el);
    await r.wait(0.05); el.querySelector('h1').classList.add('on'); setTimeout(() => el.querySelector('p').classList.add('on'), 900);
    await r.wait(hold || 3.6);
    el.querySelector('h1').classList.remove('on'); el.querySelector('p').classList.remove('on');
    await r.wait(1.8); el.remove();
  };
  K.black = function (r, a, dur) {
    K.css();
    let el = r.f48blackEl;
    if (!el) { el = r.f48blackEl = document.createElement('div'); el.className = 'f48-black'; r.layer.appendChild(el); }
    el.style.transition = 'opacity ' + (dur === undefined ? 0.6 : dur) + 's linear'; el.style.opacity = String(a);
    return r.wait(dur === undefined ? 0.6 : dur);
  };

  // ------------------------------------------------------------------ собственный аудио-трек (.m4a) с часами, EQ «динамика» и анализатором
  // r.musicTrack поддерживает только assets/<name>.mp3, поэтому для .m4a — отдельный <audio> → MediaElementSource → цепочка → общий выход игры.
  // Громкость задаётся GainNode (element.volume не влияет на источник, пущенный через WebAudio).
  K.track = function (r, file, o) {
    o = o || {};
    const snd = r.snd, ctx = snd && snd.ctx, T = { el: null, on: false, t0: 0, dur: o.dur || 0, vol: o.vol === undefined ? 1 : o.vol, gain: null, an: null, spk: o.spk };
    T.want = false;
    const el = T.el = new Audio(); el.src = 'assets/' + file; el.preload = 'auto'; el.loop = !!o.loop; el.crossOrigin = 'anonymous';
    try { el.load(); } catch (e) {}
    let src = null, hp = null, lp = null, mid = null, shelf = null, pk = null, comp = null, an = null, buf = null;
    const build = () => {
      if (!ctx || T.gain) return;
      try {
        src = ctx.createMediaElementSource(el);
        el.volume = 1;   // громкость элемента применяется ДО узла: таймер apply мог обнулить её до play (громкость ведёт T.gain)
        T.gain = ctx.createGain(); T.gain.gain.value = 0;
        let node = src;
        if (o.spk) { // динамик машины: срезаем низ и верх, подчёркиваем «картонную» середину, но оставляем бас-тело
          hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 55; hp.Q.value = 0.8;
          shelf = ctx.createBiquadFilter(); shelf.type = 'lowshelf'; shelf.frequency.value = 95; shelf.gain.value = 5;
          mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1700; mid.Q.value = 0.9; mid.gain.value = 4;
          lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = T.mf === undefined ? 7600 : T.mf; lp.Q.value = 0.6;
          comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.16;
          node.connect(hp); hp.connect(shelf); shelf.connect(mid); mid.connect(lp); lp.connect(comp); node = comp;
        }
        an = T.an = ctx.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.55; node.connect(an);
        node.connect(T.gain);
        T.gain.connect(snd.dest || ctx.destination);
        buf = new Uint8Array(an.frequencyBinCount);
        T.buf = buf;
      } catch (e) { console.warn('[f48 track]', e); }
    };
    // «под мешком»: срез верха (hz) для сильно приглушённого звука; потом K muffle(7600) открывает динамик
    T.muffle = (hz, tc) => { T.mf = hz; if (lp && ctx) lp.frequency.setTargetAtTime(hz, ctx.currentTime, tc === undefined ? 0.05 : tc); };
    T.level = () => { // сила баса 0..1 (для удара динамиков и подпрыгивания капота)
      if (!an || !T.on) return 0;
      an.getByteFrequencyData(buf);
      let s = 0; for (let i = 1; i < 6; i += 1) s += buf[i]; return clamp(s / (5 * 255) * 1.35, 0, 1);
    };
        T.apply = () => {
      const mv = snd && snd.musVol ? snd.musVol() : 0.5;
      const want = (T.on && !r.paused && !r.disposed) ? clamp(mv * T.vol * (T.k === undefined ? 1 : T.k), 0, 1.5) : 0;
      if (T.gain) T.gain.gain.setTargetAtTime(want, ctx.currentTime, 0.05); else { try { el.volume = clamp(want, 0, 1); } catch (e) {} }
      if (T.on && (r.paused || r.disposed)) { if (!el.paused) el.pause(); }
      else if (T.on && el.paused && !el.ended && performance.now() > (T.pend || 0)) { T.pend = performance.now() + 900; if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); const p = el.play(); if (p && p.catch) p.catch(() => {}); }
    };
    // часы катсцены: audio.currentTime (без звука — обычные секунды)
    T.time = () => {
      if (T.on && !el.paused && !el.ended && el.currentTime > 0.02) return el.currentTime;
      if (T.on && T.t0) return Math.max(0, (performance.now() - T.t0) / 1000 - (T.wallPause || 0));
      return T.on ? 0 : (T.last || 0);
    };
    T.play = (from, fadeIn) => {
      T.on = true; T.want = true; build();
      try { el.currentTime = from || 0; } catch (e) {}
      T.t0 = performance.now() - (from || 0) * 1000; T.wallPause = 0;
      const pr = el.play(); if (pr && pr.catch) pr.catch((e) => { console.warn('[f48 track play]', e && e.message); });
      if (T.gain) { T.gain.gain.cancelScheduledValues(ctx.currentTime); T.gain.gain.setValueAtTime(0, ctx.currentTime); }
      T.apply();
    };
    T.stop = (fade) => {
      T.last = T.time(); T.on = false; T.want = false;
      if (T.gain) { T.gain.gain.cancelScheduledValues(ctx.currentTime); T.gain.gain.setTargetAtTime(0, ctx.currentTime, (fade || 0.3) / 3); }
      setTimeout(() => { try { el.pause(); } catch (e) {} }, (fade || 0.3) * 1000 + 100);
    };
    T.ended = () => !!(el.ended || (T.dur && T.time() >= T.dur - 0.05));
    T.dispose = () => { clearInterval(T.timer); try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) {} try { src && src.disconnect(); T.gain && T.gain.disconnect(); } catch (e) {} };
    // обновление каждый кадр: громкость, пауза
    T.timer = setInterval(() => T.apply(), 50);
    (r.f48tracks || (r.f48tracks = [])).push(T);
    return T;
  };
  // выключить все треки при выходе из миссии
  const dc0 = C.Run.prototype.disposeCombat;
  C.Run.prototype.disposeCombat = function () {
    try { (this.f48tracks || []).forEach((t) => t.dispose()); } catch (e) {}
    try { this.f48sackEl && this.f48sackEl.remove(); this.f48blackEl && this.f48blackEl.remove(); } catch (e) {}
    return dc0.call(this);
  };

  // ------------------------------------------------------------------ гудки и шум дороги (WebAudio-синтез: нет файлов)
  K.horn = function (r, pitch, dur, vol) {
    const snd = r.snd, ctx = snd && snd.ctx; if (!ctx || (snd.sfxVol && snd.sfxVol() <= 0)) return;
    const t = ctx.currentTime, g = ctx.createGain(), o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter();
    o1.type = o2.type = 'sawtooth'; o1.frequency.value = pitch || 420; o2.frequency.value = (pitch || 420) * 1.26;
    f.type = 'bandpass'; f.frequency.value = (pitch || 420) * 2.2; f.Q.value = 0.7;
    const v = (vol || 0.12) * (snd.sfxVol ? snd.sfxVol() : 1);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.03); g.gain.setValueAtTime(v, t + (dur || 0.5)); g.gain.linearRampToValueAtTime(0, t + (dur || 0.5) + 0.06);
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(snd.dest || ctx.destination);
    o1.start(t); o2.start(t); o1.stop(t + (dur || 0.5) + 0.1); o2.stop(t + (dur || 0.5) + 0.1);
  };
}());
