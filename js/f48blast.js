// NEXA: миссия 48 — взрыв и обрушение здания (регион 'plaza', R.tw из f48world7.js).
// 6 зарядов по цепочке (по два на этаж) → главный взрыв → фасад вылетает панелями → этажи складываются «блином» → кучу обломков
// затягивает пыль и дым, пожар остаётся. Свои пулы спрайтов огня/дыма, инстанс-обломки, угольки, ударное кольцо, свет и синтез звука
// (мега-бум, гул обрушения, звон в ушах). Мелкие вспышки и тряска камеры — через r.blastFx / r.xf (explosions.js).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.K || !C.f48.TOWER || !C.f48.w2) return;
  const F = C.f48, K = F.K, PI = Math.PI, TW0 = F.TOWER, { hex } = F.w2;
  const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const ZF = TW0.zf, FL = TW0.floors, XW = TW0.xw;
  const WINY = [3.6, 8.2, 13.3];

  // ------------------------------------------------------------------ текстуры (общие на страницу)
  let TX = null;
  function puffTex(kind, seed) {
    const n = 128, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const g = cv.getContext('2d'), rand = F.rng(seed);
    for (let i = 0; i < 26; i += 1) {
      const a = rand() * 6.283, d = rand() * n * 0.25, x = n / 2 + Math.cos(a) * d, y = n / 2 + Math.sin(a) * d, rr = n * (0.14 + rand() * 0.2), gr = g.createRadialGradient(x, y, 0, x, y, rr);
      if (kind === 'fire') { gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.2)'); } else { gr.addColorStop(0, 'rgba(255,255,255,0.3)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.14)'); }
      gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n);
    }
    g.globalCompositeOperation = 'destination-in';
    const m = g.createRadialGradient(n / 2, n / 2, n * 0.16, n / 2, n / 2, n / 2); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = m; g.fillRect(0, 0, n, n);
    return new THREE.CanvasTexture(cv);
  }
  function texs() {
    if (TX) return TX;
    const ring = document.createElement('canvas'); ring.width = ring.height = 128;
    const g = ring.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    [[0, 0], [0.7, 0], [0.88, 0.8], [0.96, 0.25], [1, 0]].forEach((s) => gr.addColorStop(s[0], 'rgba(255,255,255,' + s[1] + ')')); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const dot = document.createElement('canvas'); dot.width = dot.height = 32;
    const d = dot.getContext('2d'), dg = d.createRadialGradient(16, 16, 0, 16, 16, 16); dg.addColorStop(0, 'rgba(255,255,255,1)'); dg.addColorStop(0.4, 'rgba(255,255,255,0.5)'); dg.addColorStop(1, 'rgba(255,255,255,0)'); d.fillStyle = dg; d.fillRect(0, 0, 32, 32);
    const fl = document.createElement('canvas'); fl.width = fl.height = 64;
    const f = fl.getContext('2d'), fg = f.createRadialGradient(32, 32, 0, 32, 32, 32);
    [[0, 1], [0.12, 0.95], [0.4, 0.3], [1, 0]].forEach((s) => fg.addColorStop(s[0], 'rgba(255,255,255,' + s[1] + ')')); f.fillStyle = fg; f.fillRect(0, 0, 64, 64);
    const so = document.createElement('canvas'); so.width = so.height = 128;
    const sg = so.getContext('2d'), sgr = sg.createRadialGradient(64, 64, 4, 64, 64, 64);                  // копоть на земле: тёмное пятно с лучами от эпицентра
    sgr.addColorStop(0, 'rgba(0,0,0,0.92)'); sgr.addColorStop(0.5, 'rgba(0,0,0,0.6)'); sgr.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = sgr; sg.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i += 1) { const a = Math.random() * 6.283, l = 30 + Math.random() * 33; sg.strokeStyle = 'rgba(0,0,0,' + (0.15 + Math.random() * 0.3) + ')'; sg.lineWidth = 1 + Math.random() * 3; sg.beginPath(); sg.moveTo(64 + Math.cos(a) * 18, 64 + Math.sin(a) * 18); sg.lineTo(64 + Math.cos(a) * l, 64 + Math.sin(a) * l); sg.stroke(); }
    const mk = (cv) => new THREE.CanvasTexture(cv);
    return (TX = { soot: mk(so), fire: [puffTex('fire', 3), puffTex('fire', 29), puffTex('fire', 57)], smoke: [puffTex('smoke', 1), puffTex('smoke', 17), puffTex('smoke', 41), puffTex('smoke', 73)], ring: mk(ring), dot: mk(dot), flash: mk(fl) });
  }

  // ------------------------------------------------------------------ пулы
  function mkPool(sc, n, tex, add) {
    const a = [];
    for (let i = 0; i < n; i += 1) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[i % tex.length], transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false, opacity: 0 }));
      s.visible = false; s.u = { on: false }; sc.add(s); a.push(s);
    }
    return a;
  }
  function spawn(pool, o) {
    let s = null;
    for (let i = 0; i < pool.length; i += 1) if (!pool[i].u.on) { s = pool[i]; break; }
    if (!s) return null;
    const u = s.u;
    u.on = true; u.age = -(o.delay || 0); u.dur = o.dur; u.vx = o.vx || 0; u.vy = o.vy || 0; u.vz = o.vz || 0; u.s0 = o.s0; u.s1 = o.s1; u.op = o.op === undefined ? 1 : o.op;
    u.c0 = o.c0 === undefined ? 1 : o.c0; u.c1 = o.c1 === undefined ? 0.15 : o.c1; u.drag = o.drag === undefined ? 1.2 : o.drag; u.rise = o.rise || 0; u.spin = o.spin || 0; u.fl = o.fl || 0; u.warm = o.warm || 0;
    s.position.set(o.x, o.y, o.z); s.scale.set(o.s0, o.s0, 1); s.visible = false; s.material.opacity = 0; s.material.rotation = rnd(0, 6.283);
    return s;
  }
  function stepPool(pool, dt, cam, isFire) {
    for (let i = 0; i < pool.length; i += 1) {
      const s = pool[i], u = s.u; if (!u.on) continue;
      u.age += dt; if (u.age < 0) continue;
      const k = u.age / u.dur; if (k >= 1) { u.on = false; s.visible = false; continue; }
      s.visible = true;
      const f = Math.exp(-u.drag * dt); u.vx *= f; u.vy *= f; u.vz *= f; u.vy += u.rise * dt;
      s.position.x += u.vx * dt; s.position.y += u.vy * dt; s.position.z += u.vz * dt;
      const sz = lerp(u.s0, u.s1, 1 - (1 - k) * (1 - k)); s.scale.set(sz, sz, 1);
      if (s.position.y < sz * u.fl) s.position.y = sz * u.fl;
      const m = s.material; m.rotation += u.spin * dt;
      let a = isFire ? Math.min(1, u.age / 0.05) * Math.pow(1 - k, 1.25) : Math.min(1, u.age / 0.3) * (1 - sm(0.5, 1, k));
      a *= clamp((s.position.distanceTo(cam) - 1) / (2 + sz * 0.22), 0, 1);
      m.opacity = a * u.op;
      const cc = lerp(u.c0, u.c1, Math.pow(k, 0.6));
      if (isFire) m.color.setRGB(Math.min(1, cc * 1.5), cc * cc * 0.95 * (0.6 + 0.4 * cc), Math.pow(cc, 3.4) * 0.7);
      else { const w = (1 - k) * (1 - k) * u.warm * clamp(1 - s.position.y / 26, 0.15, 1); m.color.setRGB(Math.min(1, cc + 0.5 * w), Math.min(1, cc + 0.16 * w), Math.min(1, cc * (1 - 0.1 * w))); }
    }
  }

  // ------------------------------------------------------------------ куча обломков («блин» из плит, куски бетона, арматура, тлеющие угли)
  function buildHeap(rand) {
    const M = new F.Mk();
    const hAt = (x, z) => 3.2 * Math.pow(Math.max(0, 1 - (x / 31) * (x / 31)), 0.7) * Math.max(0, 1 - Math.pow((z + 40.5) / 12.5, 2) * 0.85);
    for (let i = 0; i < 5; i += 1) {
      const w = 30 + rand() * 24, d = 12 + rand() * 9, x = rand() * 10 - 5, z = -41 + rand() * 7 - 3.5, y = 0.3 + i * 0.62 + rand() * 0.15;
      M.b(w, 0.34, d, x, y, z, hex(0x5a5b60, 0.75 + rand() * 0.3), (rand() - 0.5) * 0.07, (rand() - 0.5) * 0.14, (rand() - 0.5) * 0.12);
      M.b(w * 0.96, 0.12, d * 0.96, x, y + 0.2, z, 0x2a2b2e, (rand() - 0.5) * 0.07, (rand() - 0.5) * 0.14, (rand() - 0.5) * 0.12);
    }
    for (let i = 0; i < 280; i += 1) {
      const x = rand() * 60 - 30, z = -29.5 - rand() * 22.5, h = hAt(x, z); if (h < 0.25 && rand() < 0.8) continue;
      const y = rand() * h, s = 0.22 + rand() * rand() * 2.4, c = [0x5a5b60, 0x6a6c72, 0x4a3a34, 0x3a3c42, 0x7a7468, 0x2e2f33][Math.floor(rand() * 6)];
      M.b(s * (0.6 + rand()), s * (0.3 + rand() * 0.7), s * (0.6 + rand()), x, y, z, hex(c, 0.7 + rand() * 0.4), rand() * 3, rand() * 3, rand() * 3);
    }
    for (let i = 0; i < 46; i += 1) {
      const x = rand() * 56 - 28, z = -31 - rand() * 20, h = hAt(x, z); if (h < 0.4) continue;
      M.y(0.025, 0.025, 1.6 + rand() * 3.2, x, h + rand() * 0.8, z, 0x3a2a22, 5, (rand() - 0.5) * 1.4, (rand() - 0.5) * 1.4);
    }
    for (let i = 0; i < 6; i += 1) {                                                         // обломки стены с рамами окон
      const x = rand() * 44 - 22, z = -31 - rand() * 8, h = hAt(x, z), w = 2.6 + rand() * 3;
      M.b(w, 2.2 + rand() * 1.6, 0.4, x, h + 1.0, z, 0x4a3a34, (rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.7);
    }
    M.glow((q) => {
      for (let i = 0; i < 90; i += 1) {
        const x = rand() * 54 - 27, z = -31 - rand() * 19, h = hAt(x, z); if (h < 0.3) continue;
        const s = 0.12 + rand() * 0.34; q.b(s, s * 0.5, s, x, h * (0.55 + rand() * 0.55), z, rand() < 0.5 ? 0xff5a1a : 0xffa040, rand() * 3, rand() * 3, rand() * 3);
      }
    });
    const grp = M.build({ cull: false });
    grp.scale.y = 0.001; grp.visible = false;
    return grp;
  }

  // ------------------------------------------------------------------ звук: мега-бум, гул обрушения, звон в ушах
  function megaBoom(r) {
    const s = r.snd, c = s && s.ctx; if (!c || !s.dest) return;
    try {
      const vol = s.sfxVol ? s.sfxVol() : 0.6; if (vol <= 0) return;
      const t0 = c.currentTime + 0.02, comp = c.createDynamicsCompressor(), out = c.createGain();
      comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.25; out.gain.value = vol * 1.35; out.connect(comp); comp.connect(s.dest);
      const len = Math.floor(c.sampleRate * 11), nb = c.createBuffer(1, len, c.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
      const noise = (dur) => { const n = c.createBufferSource(); n.buffer = nb; n.start(t0, Math.random() * 3, dur); return n; };
      const gain = (pts) => { const g = c.createGain(); g.gain.setValueAtTime(0, t0); pts.forEach((p) => g.gain.linearRampToValueAtTime(p[1], t0 + p[0])); return g; };
      const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.setValueAtTime(74, t0); sub.frequency.exponentialRampToValueAtTime(21, t0 + 2.6);
      const sg = gain([[0.015, 1.0], [0.5, 0.78], [1.6, 0.34], [3.2, 0]]); sub.connect(sg); sg.connect(out); sub.start(t0); sub.stop(t0 + 3.3);
      const sub2 = c.createOscillator(); sub2.type = 'triangle'; sub2.frequency.setValueAtTime(130, t0); sub2.frequency.exponentialRampToValueAtTime(34, t0 + 1.8);
      const s2g = gain([[0.01, 0.5], [0.9, 0.2], [2.2, 0]]); sub2.connect(s2g); s2g.connect(out); sub2.start(t0); sub2.stop(t0 + 2.3);
      const cr = noise(0.5), crh = c.createBiquadFilter(); crh.type = 'highpass'; crh.frequency.value = 900; const cg = gain([[0.004, 1.0], [0.06, 0.55], [0.5, 0]]); cr.connect(crh); crh.connect(cg); cg.connect(out);
      const roar = noise(5), rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.setValueAtTime(3200, t0); rl.frequency.exponentialRampToValueAtTime(70, t0 + 4.6); rl.Q.value = 0.8;
      const rg = gain([[0.01, 1.1], [0.7, 0.8], [2.2, 0.34], [4.8, 0]]); roar.connect(rl); rl.connect(rg); rg.connect(out);
      const rum = noise(10), rml = c.createBiquadFilter(); rml.type = 'lowpass'; rml.frequency.value = 170; rml.Q.value = 1.4;
      const mg = c.createGain(); mg.gain.setValueAtTime(0, t0); mg.gain.linearRampToValueAtTime(0.9, t0 + 0.9);
      for (let i = 0; i < 26; i += 1) mg.gain.linearRampToValueAtTime(clamp(0.75 - i * 0.026 + rnd(-0.28, 0.28), 0.05, 1), t0 + 0.9 + i * 0.32);
      mg.gain.linearRampToValueAtTime(0, t0 + 10); rum.connect(rml); rml.connect(mg); mg.connect(out);
      const cl = noise(10), clb = c.createBiquadFilter(); clb.type = 'bandpass'; clb.frequency.value = 2600; clb.Q.value = 0.9;
      const clg = c.createGain(); clg.gain.setValueAtTime(0, t0);
      for (let i = 0; i < 60; i += 1) { const tt = 0.5 + i * 0.14 + rnd(0, 0.1); clg.gain.linearRampToValueAtTime(rnd(0.05, 0.3) * (1 - i / 70), t0 + tt); clg.gain.linearRampToValueAtTime(0.005, t0 + tt + 0.05); }
      clg.gain.linearRampToValueAtTime(0, t0 + 9.8); cl.connect(clb); clb.connect(clg); clg.connect(out);
      [6300, 7050].forEach((f, i) => {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(0, t0 + 0.25);
        g.gain.linearRampToValueAtTime(0.05, t0 + 0.7 + i * 0.1); g.gain.linearRampToValueAtTime(0.034, t0 + 3.5); g.gain.linearRampToValueAtTime(0, t0 + 8.5); o.connect(g); g.connect(out); o.start(t0 + 0.25); o.stop(t0 + 8.6);
      });
      // эхо города: отражения от соседних кварталов — поздние, глухие, всё более срезанные по верху удары
      const noiseAt = (ts, dur) => { const n = c.createBufferSource(); n.buffer = nb; n.start(ts, Math.random() * 3, dur); return n; };
      [[0.8, 0.5, 1100, 1.5], [1.6, 0.34, 700, 1.7], [2.7, 0.24, 480, 1.9], [4.1, 0.15, 330, 2.1]].forEach((q, i) => {
        const ts = t0 + q[0], e = noiseAt(ts, q[3]), ef = c.createBiquadFilter(), eg = c.createGain(); ef.type = 'lowpass'; ef.frequency.value = q[2]; ef.Q.value = 0.6;
        eg.gain.setValueAtTime(0, ts); eg.gain.linearRampToValueAtTime(q[1], ts + 0.04); eg.gain.exponentialRampToValueAtTime(0.002, ts + q[3]); e.connect(ef); ef.connect(eg); eg.connect(out);
        const th = c.createOscillator(), tg = c.createGain(); th.type = 'sine'; th.frequency.setValueAtTime(52 - i * 5, ts); th.frequency.exponentialRampToValueAtTime(24, ts + 1.1);
        tg.gain.setValueAtTime(0, ts); tg.gain.linearRampToValueAtTime(q[1] * 0.9, ts + 0.03); tg.gain.exponentialRampToValueAtTime(0.002, ts + 1.2); th.connect(tg); tg.connect(out); th.start(ts); th.stop(ts + 1.25);
      });
      // дождь обломков: зернистый шорох (частых зёрен больше в начале) и тяжёлые удары кусков о землю; к 9-й секунде стихает
      const qk = clamp(((r.q && r.q.parts) || 12) / 20, 0.3, 1);
      for (let i = 0, n = Math.round(40 + 60 * qk); i < n; i += 1) {
        const tt = 2.2 + 7 * Math.pow(Math.random(), 1.5), a = rnd(0.05, 0.22) * (1 - (tt - 2.2) / 8), ts = t0 + tt, gr = noiseAt(ts, 0.06), gf = c.createBiquadFilter(), gg = c.createGain();
        gf.type = 'bandpass'; gf.frequency.value = rnd(500, 3600); gf.Q.value = 1.2; gg.gain.setValueAtTime(a, ts); gg.gain.exponentialRampToValueAtTime(0.001, ts + 0.06); gr.connect(gf); gf.connect(gg); gg.connect(out);
      }
      for (let i = 0; i < 14; i += 1) {
        const ts = t0 + 2.6 + rnd(0, 6.2), a = rnd(0.2, 0.4) * (1 - (ts - t0 - 2.6) / 8), o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(rnd(60, 95), ts); o.frequency.exponentialRampToValueAtTime(34, ts + 0.22);
        og.gain.setValueAtTime(0, ts); og.gain.linearRampToValueAtTime(a, ts + 0.008); og.gain.exponentialRampToValueAtTime(0.001, ts + 0.3); o.connect(og); og.connect(out); o.start(ts); o.stop(ts + 0.32);
        const cr = noiseAt(ts, 0.1), cf = c.createBiquadFilter(), cg2 = c.createGain(); cf.type = 'lowpass'; cf.frequency.value = rnd(900, 2400); cg2.gain.setValueAtTime(a * 0.8, ts); cg2.gain.exponentialRampToValueAtTime(0.001, ts + 0.1); cr.connect(cf); cf.connect(cg2); cg2.connect(out);
      }
      // скрежет металла: пила через узкий полосовой фильтр, частота ползёт вниз, дрожь; плюс низкий стон каркаса
      [[1.2, 1.1, 0.2], [2.5, 1.5, 0.26], [4.0, 1.2, 0.2], [5.6, 1.6, 0.16]].forEach((q) => {
        const ts = t0 + q[0] + rnd(0, 0.25), d = q[1], o = c.createOscillator(), bp = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(rnd(210, 330), ts); o.frequency.exponentialRampToValueAtTime(rnd(120, 190), ts + d);
        bp.type = 'bandpass'; bp.Q.value = 7; bp.frequency.setValueAtTime(rnd(1300, 2100), ts); bp.frequency.exponentialRampToValueAtTime(rnd(520, 900), ts + d);
        lfo.type = 'square'; lfo.frequency.value = rnd(17, 34); lg.gain.value = q[2] * 0.7;
        g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(q[2], ts + 0.12); g.gain.setValueAtTime(q[2], ts + d * 0.6); g.gain.linearRampToValueAtTime(0, ts + d);
        lfo.connect(lg); lg.connect(g.gain); o.connect(bp); bp.connect(g); g.connect(out); o.start(ts); o.stop(ts + d + 0.05); lfo.start(ts); lfo.stop(ts + d + 0.05);
      });
      { const ts = t0 + 1.0, o = c.createOscillator(), vb = c.createOscillator(), vg = c.createGain(), g = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(58, ts); o.frequency.exponentialRampToValueAtTime(36, ts + 3.2);
        vb.type = 'sine'; vb.frequency.value = 5.5; vg.gain.value = 2.2; vb.connect(vg); vg.connect(o.frequency);
        g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(0.38, ts + 0.8); g.gain.linearRampToValueAtTime(0, ts + 3.3); o.connect(g); g.connect(out); o.start(ts); o.stop(ts + 3.4); vb.start(ts); vb.stop(ts + 3.4); }
    } catch (e) { /* звук не критичен */ }
  }
  function chargeThump(r, q) {                                                                // глухой удар заряда внутри здания (поверх blastFx)
    const s = r.snd, c = s && s.ctx; if (!c || !s.dest) return;
    try {
      const vol = s.sfxVol ? s.sfxVol() : 0.6; if (vol <= 0) return;
      const t0 = c.currentTime + 0.01, o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(90 * q, t0); o.frequency.exponentialRampToValueAtTime(30, t0 + 0.7);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.7 * vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9); o.connect(g); g.connect(s.dest); o.start(t0); o.stop(t0 + 1);
    } catch (e) { /* звук не критичен */ }
  }

  // ------------------------------------------------------------------ контроллер
  F.blast = {
    begin(r, R) {
      const TW = R && R.tw; if (!TW) return null;
      const T = THREE, sc = r.scene, tx = texs(), qk = clamp(((r.q && r.q.parts) || 12) / 20, 0.3, 1), cam = r.camera.position, rand = F.rng(1234);
      const B = { r, TW, t: 0, on: false, ev: [], pulses: [], emit: [], glowI: 0, col: null, dust: null, main: false, done: false, heapOn: false, disposed: false };
      B.mainAt = 2.7;
      B.fire = mkPool(sc, Math.round(46 + 70 * qk), tx.fire, true);
      B.smoke = mkPool(sc, Math.round(110 + 170 * qk), tx.smoke, false);
      B.flashS = (() => { const s = new T.Sprite(new T.SpriteMaterial({ map: tx.flash, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, opacity: 0, color: 0xffe2b0 })); s.visible = false; sc.add(s); return s; })();
      B.flashes = [];
      B.scorch = (() => { const g2 = new T.PlaneGeometry(1, 1); g2.rotateX(-PI / 2); const m = new T.Mesh(g2, new T.MeshBasicMaterial({ map: tx.soot, transparent: true, depthWrite: false, fog: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.position.set(0, 0.06, -34); m.scale.set(76, 1, 40); m.visible = false; sc.add(m); return m; })();
      B.light = new T.PointLight(0xffa45c, 0, 95, 1.3); B.light.position.set(0, 8, -24); sc.add(B.light);
      // обломки (инстанс)
      const nd = Math.round(140 + 260 * qk), mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial({ color: 0xffffff }), nd), z0 = new T.Matrix4().makeScale(0, 0, 0), cc = new T.Color();
      for (let i = 0; i < nd; i += 1) { mesh.setMatrixAt(i, z0); mesh.setColorAt(i, cc.setHex(0x555555)); }
      mesh.frustumCulled = false; sc.add(mesh);
      B.D = { mesh, n: nd, tr: new Float32Array(nd), tt: new Float32Array(nd), p: new Float32Array(nd * 3), v: new Float32Array(nd * 3), a: new Float32Array(nd * 3), w: new Float32Array(nd * 3), s: new Float32Array(nd * 3), on: new Uint8Array(nd), rest: new Uint8Array(nd), cur: 0, obj: new T.Object3D(), col: cc };
      // угольки
      const ne = Math.round(160 + 260 * qk), eg = new T.BufferGeometry(), ep = new Float32Array(ne * 3), ecol = new Float32Array(ne * 3);
      for (let i = 0; i < ne; i += 1) ep[i * 3 + 1] = -100;
      eg.setAttribute('position', new T.BufferAttribute(ep, 3)); eg.setAttribute('color', new T.BufferAttribute(ecol, 3));
      const pts = new T.Points(eg, new T.PointsMaterial({ size: 0.16, map: tx.dot, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true, fog: false }));
      pts.frustumCulled = false; sc.add(pts);
      B.E = { pts, geo: eg, pos: ep, col: ecol, n: ne, v: new Float32Array(ne * 3), age: new Float32Array(ne).fill(9), dur: new Float32Array(ne).fill(1) };
      // ударное кольцо
      const rg = new T.PlaneGeometry(1, 1); rg.rotateX(-PI / 2);
      B.rings = [0, 1].map(() => { const m = new T.Mesh(rg, new T.MeshBasicMaterial({ map: tx.ring, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, side: T.DoubleSide, opacity: 0, color: 0xffd8a8 })); m.visible = false; m.u = { on: false }; sc.add(m); return m; });
      B.heap = buildHeap(rand); sc.add(B.heap);
      B.heap.visible = true; B.heap.position.y = -50;                                         // один раз показываем вне кадра: шейдеры компилируются заранее
      try { r.renderer.compile(sc, r.camera); } catch (e) { /* не критично */ }
      B.heap.visible = false; B.heap.position.y = 0;

      const X = () => r.xf, shake = (a) => { const x = X(); if (x) x.shk = Math.max(x.shk, a); };
      B.pulse = (x, y, z, pk, decay) => { B.pulses.push({ t: B.t, x, y, z, pk, decay }); };
      B.flashAt = (x, y, z, sz, dur, pk) => { B.flashes.push({ t: B.t, x, y, z, sz, dur, pk: pk || 1 }); };
      const fire = (o) => spawn(B.fire, o), smoke = (o) => spawn(B.smoke, o);
      const chunk = (x, y, z, vx, vy, vz, size, c, rs, trail) => {
        const D = B.D; let i = -1;
        for (let j = 0; j < D.n; j += 1) { const k = (D.cur + j) % D.n; if (!D.on[k]) { i = k; break; } }
        if (i < 0) i = D.cur;
        D.cur = (i + 1) % D.n; D.on[i] = 1; D.rest[i] = 0;
        D.p[i * 3] = x; D.p[i * 3 + 1] = y; D.p[i * 3 + 2] = z; D.v[i * 3] = vx; D.v[i * 3 + 1] = vy; D.v[i * 3 + 2] = vz;
        D.a[i * 3] = rnd(0, 6); D.a[i * 3 + 1] = rnd(0, 6); D.a[i * 3 + 2] = rnd(0, 6); const w = rs === undefined ? 10 : rs;
        D.w[i * 3] = rnd(-w, w); D.w[i * 3 + 1] = rnd(-w, w); D.w[i * 3 + 2] = rnd(-w, w);
        D.s[i * 3] = size * rnd(0.6, 1.5); D.s[i * 3 + 1] = size * rnd(0.4, 1.2); D.s[i * 3 + 2] = size * rnd(0.6, 1.5);
        D.mesh.setColorAt(i, D.col.setHex(c)); D.mesh.instanceColor.needsUpdate = true;
        D.tr[i] = trail || 0; D.tt[i] = 0;                                                  // trail — сколько секунд тянется дымный след
      };
      const ember = (x, y, z, sp, up) => {
        const E = B.E; let i = -1;
        for (let j = 0; j < E.n; j += 1) if (E.age[j] >= E.dur[j]) { i = j; break; }
        if (i < 0) return;
        const a = rnd(0, 6.283), c = rnd(-0.3, 1), h = Math.sqrt(1 - c * c) * sp;
        E.pos[i * 3] = x; E.pos[i * 3 + 1] = y; E.pos[i * 3 + 2] = z; E.v[i * 3] = Math.cos(a) * h; E.v[i * 3 + 1] = c * sp * up + 1; E.v[i * 3 + 2] = Math.sin(a) * h * 0.6 + sp * 0.35;
        E.age[i] = 0; E.dur[i] = rnd(0.9, 3.4);
      };
      B.chunk = chunk; B.smoke_ = smoke; B.fire_ = fire;

      // ---- панели
      const launch = (p, vx, vy, vz, wx, wy, wz, delay) => { p.fly = true; p.rest = false; p.delay = delay || 0; p.v.set(vx, vy, vz); p.w.set(wx, wy, wz); p.g.rotation.order = 'YXZ'; };
      const blowPanels = (x, fi, rad, sp, delay) => {
        let n = 0;
        TW.panels.forEach((p) => {
          if (p.fly || p.fi !== fi) return;
          const d = Math.abs(p.base.x - x); if (d > rad) return;
          const k = 1 - d / rad; n += 1; p.scorch = 1;
          launch(p, (p.base.x - x) * 0.6 + rnd(-1.6, 1.6), rnd(0.5, 4.5) * (0.4 + k), sp * (0.45 + k) * rnd(0.7, 1.2), rnd(-2.6, 2.6), rnd(-1.4, 1.4), rnd(-2.6, 2.6), delay + d * 0.01 + rnd(0, 0.06));
        });
        return n;
      };
      // ---- заряд внутри здания: этаж fi, позиция x
      const charge = (x, fi, i) => {
        const y = WINY[fi], z = ZF + 0.4;
        TW.interior(true);
        blowPanels(x, fi, 5.2, 8, 0);
        r.blastFx(x, y, z + 0.8, 3.6, 'frag');
        chargeThump(r, 1 + i * 0.04);
        B.flashAt(x, y, z - 1.2, 11, 0.32, 1); B.pulse(x, y, z + 1.5, 7, 4.2);
        for (let k = 0; k < 9; k += 1) fire({ x: x + rnd(-2.4, 2.4), y: y + rnd(-1.4, 1.4), z: z + rnd(-0.4, 1.2), vx: rnd(-2, 2), vy: rnd(0.8, 5), vz: rnd(5, 14), s0: rnd(1.4, 2.4), s1: rnd(4.2, 6.4), dur: rnd(0.8, 1.5), op: rnd(0.75, 1), c0: 1, c1: 0.14, drag: 1.6, rise: 1.2, spin: rnd(-1.5, 1.5) });
        for (let k = 0; k < 8; k += 1) smoke({ x: x + rnd(-2.4, 2.4), y: y + rnd(-1, 1.6), z: z + rnd(-0.4, 1), vx: rnd(-1.5, 1.5), vy: rnd(1.2, 4.5), vz: rnd(1, 6), s0: rnd(2, 3), s1: rnd(6, 10), dur: rnd(4, 7), op: rnd(0.5, 0.7), c0: 0.34, c1: 0.1, drag: 0.8, rise: 0.5, spin: rnd(-0.3, 0.3), warm: 1, delay: rnd(0, 0.2) });
        for (let k = 0; k < 20; k += 1) chunk(x + rnd(-2.4, 2.4), y + rnd(-1.4, 1.4), z, rnd(-3, 3), rnd(0.5, 6), rnd(5, 15), rnd(0.05, 0.17), [0xcfe2f0, 0x9ab0c0, 0x3a3c42, 0x5a5b60][k & 3], 14);
        for (let k = 0; k < 24; k += 1) ember(x + rnd(-2, 2), y, z + 0.4, rnd(3, 11), 0.8);
        B.emit.push({ x, y: y - 1.2, z: z - 0.2, t1: 9999, s: 1.4, rate: 5 });
        shake(0.05 + 0.012 * i); r.cineJolt && r.cineJolt(0.35 + 0.08 * i);
        B.glowI = Math.min(1.6, B.glowI + 0.18);
      };
      const secondary = (x, y, z, i) => {                                                          // вторичные подрывы в руинах: баллоны, трансформаторы, топливо
        r.blastFx(x, y, z, 6.5, i % 2 ? 'frag' : 'bomb'); chargeThump(r, 0.8 + i * 0.05);
        B.pulse(x, y + 2, z + 6, 9, 3); B.flashAt(x, y + 1, z + 4, 26, 0.45, 0.9); B.glowI = Math.min(1.8, B.glowI + 0.2);
        for (let k = 0; k < 8; k += 1) fire({ x: x + rnd(-2.5, 2.5), y: y + rnd(-1, 2), z: z + rnd(-2, 2), vx: rnd(-3, 3), vy: rnd(3, 9), vz: rnd(-1, 6), s0: rnd(3, 5), s1: rnd(9, 14), dur: rnd(1.0, 1.9), op: rnd(0.7, 1), c0: 1, c1: 0.14, drag: 1.3, rise: 1.5, spin: rnd(-1, 1) });
        for (let k = 0; k < 6; k += 1) smoke({ x: x + rnd(-2.5, 2.5), y: y + rnd(0, 2), z: z + rnd(-2, 2), vx: rnd(-2, 2), vy: rnd(4, 9), vz: rnd(0, 4), s0: rnd(3, 5), s1: rnd(10, 16), dur: rnd(4, 7), op: rnd(0.55, 0.75), c0: 0.1, c1: 0.06, drag: 0.7, rise: 1.0, spin: rnd(-0.3, 0.3), warm: 0.5 });
        for (let k = 0; k < 10; k += 1) chunk(x + rnd(-2, 2), y, z, rnd(-6, 6), rnd(5, 14), rnd(-2, 9), rnd(0.15, 0.4), 0x4a4b50, 8, rnd(1.2, 2.6));
        for (let k = 0; k < 30; k += 1) ember(x, y + 1, z, rnd(4, 12), 1);
        shake(0.07); r.cineJolt && r.cineJolt(0.5);
      };
      const CH = [[-18, 0], [14, 1], [-4, 2], [22, 0], [-22, 1], [8, 2]];
      CH.forEach((q, i) => B.ev.push({ t: i * 0.34, fn: () => charge(q[0], q[1], i) }));

      // ---- главный взрыв
      const mainBlast = () => {
        B.main = true;                                                                          // огонь в окнах гаснет: окон больше нет (кроме помеченных keep — костёр у площади)
        for (let i = B.emit.length - 1; i >= 0; i -= 1) if (!B.emit[i].keep) B.emit.splice(i, 1);
        TW.interior(true);
        try { r.flash && r.flash(1.6).catch(() => {}); } catch (e) { /* не критично */ }
        megaBoom(r);
        if (K.warp) K.warp(r, 0.55, 7);
        shake(0.24); const x = X(); if (x) x.con = Math.max(x.con, 0.85); r.cineJolt && r.cineJolt(2.6);
        B.pulse(0, 7, -20, 16, 1.1); B.flashAt(0, 8, -33, 90, 0.9, 1);
        for (let i = 0; i < 12; i += 1) {
          const gx = -27 + i * 4.9 + rnd(-1, 1), gy = [1.5, 7, 12.5][i % 3];
          B.ev.push({ t: B.t + i * 0.05 + rnd(0, 0.06), fn: () => { r.blastFx(gx, gy, ZF + 1.5, 7.5, i % 3 === 0 ? 'bomb' : 'frag'); chunk(gx, gy, ZF, rnd(-4, 4), rnd(6, 16), rnd(2, 12), rnd(0.2, 0.5), 0x5a5b60, 6); } });
        }
        for (let i = 0; i < 46; i += 1) fire({ x: rnd(-29, 29), y: rnd(0.5, 14), z: rnd(-45, -29), vx: rnd(-3, 3), vy: rnd(3, 13), vz: rnd(3, 16), s0: rnd(4, 7), s1: rnd(12, 21), dur: rnd(1.4, 2.8), op: rnd(0.65, 1), c0: 1, c1: 0.14, drag: 1.3, rise: 1.5, spin: rnd(-1, 1), delay: rnd(0, 0.35) });
        for (let i = 0; i < 70; i += 1) smoke({ x: rnd(-29, 29), y: rnd(2, 15), z: rnd(-46, -30), vx: rnd(-2, 2), vy: rnd(5, 15), vz: rnd(0, 7), s0: rnd(6, 9), s1: rnd(20, 32), dur: rnd(9, 16), op: rnd(0.55, 0.78), c0: rnd(0.22, 0.4), c1: 0.1, drag: 0.5, rise: 1.4, spin: rnd(-0.2, 0.2), warm: 1, delay: rnd(0.05, 0.9) });
        // панели фасада летят каскадом от центра взрыва наружу
        TW.panels.forEach((p) => {
          if (p.fly) return;
          const d = Math.hypot(p.base.x * 0.5, (p.base.y - 7) * 0.9); p.scorch = 1;
          launch(p, p.base.x * rnd(0.12, 0.3) + rnd(-3, 3), rnd(1, 6) + (p.base.y > 6 ? 2 : 0), rnd(3.5, 11) * (1 - d / 45), rnd(-3, 3), rnd(-1.6, 1.6), rnd(-3, 3), 0.05 + d * 0.025 + rnd(0, 0.2));
        });
        if (TW.sign) { TW.sign.fly = true; TW.sign.t = -0.1; TW.sign.v.set(rnd(-2, 2), rnd(5, 9), rnd(4, 7)); TW.sign.w.set(rnd(-1.5, 1.5), rnd(-1, 1), rnd(-2, 2)); TW.sign.halo.visible = false; }
        // обломки веером
        for (let i = 0; i < Math.round(110 * qk + 60); i += 1) {
          const a = rnd(-0.9, 0.9), sp = rnd(8, 26), c = [0x5a5b60, 0x6a6c72, 0x4a3a34, 0x2e2f33][i & 3];
          chunk(rnd(-28, 28), rnd(1, 15), rnd(-44, -30), Math.sin(a) * sp * 0.5, rnd(4, 20), Math.cos(a) * sp * 0.8, rnd(0.12, 0.55), c, 9, i % 3 === 0 ? rnd(1.6, 3.2) : 0);
        }
        for (let i = 0; i < 200; i += 1) ember(rnd(-26, 26), rnd(1, 14), rnd(-42, -30), rnd(6, 20), 1);
        // ударная волна и пыль по земле
        const ring = B.rings[0]; ring.u.on = true; ring.u.t0 = B.t; ring.u.dur = 2.4; ring.u.r1 = 120; ring.u.op = 0.4; ring.position.set(0, 0.2, -36); ring.visible = true;
        for (let i = 0; i < 34; i += 1) { const a = (i / 34) * PI - PI / 2 + rnd(-0.1, 0.1), sp = rnd(8, 20); smoke({ x: Math.sin(a) * 26, y: 0.6, z: -30 + Math.cos(a) * 3, vx: Math.sin(a) * sp * 0.35, vy: rnd(0, 1.5), vz: Math.cos(a) * sp, s0: 3, s1: rnd(9, 16), dur: rnd(4, 8), op: 0.5, c0: 0.46, c1: 0.2, drag: 1.5, rise: 0.2, spin: rnd(-0.3, 0.3), fl: 0.4, delay: rnd(0.1, 0.6) }); }
        // этажи складываются
        TW.levels.forEach((L) => { L.userData.sy0 = 1; });
        // сажа в огне: тёмные клубы прорастают сквозь пламя
        for (let i = 0; i < Math.round(12 + 14 * qk); i += 1) smoke({ x: rnd(-26, 26), y: rnd(1, 13), z: rnd(-44, -31), vx: rnd(-2, 2), vy: rnd(4, 11), vz: rnd(1, 9), s0: rnd(4, 7), s1: rnd(11, 18), dur: rnd(3, 5.5), op: rnd(0.55, 0.8), c0: 0.06, c1: 0.04, drag: 1.1, rise: 1.2, spin: rnd(-0.5, 0.5), delay: rnd(0.12, 0.5) });
        // ударный купол: вторая, быстрая и тонкая кромка конденсата над землёй
        { const r2 = B.rings[1]; r2.u.on = true; r2.u.t0 = B.t; r2.u.dur = 1.7; r2.u.r1 = 95; r2.u.op = 0.5; r2.position.set(0, 9, -36); r2.material.color.setHex(0xf2f6ff); r2.visible = true; }
        // окна: после главного взрыва в каждом этаже по очереди вырываются струи пыли (сверху вниз по ходу обрушения)
        B.jets = [[2, 0.0], [1, 0.5], [0, 1.0]].map((j) => ({ y: WINY[j[0]], t0: B.t + j[1], t1: B.t + j[1] + 1.4, acc: 0 }));
        // вторичные подрывы по времени
        [[1.5, -14, 3, -34], [2.6, 17, 5, -41], [3.9, -6, 2, -37], [5.3, 9, 8, -44], [6.8, -21, 4, -40]].forEach((q, i) => B.ev.push({ t: B.t + q[0], fn: () => secondary(q[1], q[2], q[3], i) }));
        // засвет экспозиции, марево над огнём, копоть на земле
        { const xx = X(); if (xx) { xx.exp = 1; xx.hz.x = 0; xx.hz.y = 12; xx.hz.z = -38; xx.hz.t = 0; xx.hz.R = 24; } }
        B.scorchT = B.t;
        B.col = { t: -0.55, dur: 6.2 }; B.heapOn = true; B.heap.visible = true;
        B.dust = { t: 0, until: 8.5 };
        B.glowI = 1.4; B.ev.sort((p, q) => p.t - q.t);
        for (let i = 0; i < 9; i += 1) B.emit.push({ x: rnd(-22, 22), y: 0.8, z: rnd(-46, -32), t1: 9999, s: 2.6, rate: 2.6, at: B.t + 3.5 + rnd(0, 3), heap: true });
        B.emit.push({ x: 0, y: 3, z: -40, t1: 9999, s: 5, rate: 1.8, at: B.t + 4.5, black: true }, { x: -14, y: 3, z: -38, t1: 9999, s: 4.5, rate: 1.4, at: B.t + 5, black: true }, { x: 15, y: 3, z: -42, t1: 9999, s: 4.5, rate: 1.4, at: B.t + 5.5, black: true });
      };
      B.ev.push({ t: B.mainAt, fn: mainBlast });
      // дрожь перед главным взрывом (после цепочки)
      B.ev.push({ t: 2.15, fn: () => { shake(0.06); r.cineJolt && r.cineJolt(0.6); } });
      B.ev.sort((a, b) => a.t - b.t);

      // ---- покадровое обновление
      const tmpM = new T.Matrix4(), g = 9.8;
      B.update = (dt) => {
        if (B.disposed || !B.on) return;
        dt = Math.min(dt, 0.05); B.t += dt;
        while (B.armed && B.ev.length && B.ev[0].t <= B.t) B.ev.shift().fn();
        const x = X();
        // постоянные источники: огонь из окон, дым, огонь куч
        for (let i = 0; i < B.emit.length; i += 1) {
          const e = B.emit[i]; if (e.at && B.t < e.at) continue;
          if (e.t1 !== undefined && B.t > e.t1) { B.emit.splice(i, 1); i -= 1; continue; }
          e.acc = (e.acc || 0) + e.rate * dt;
          while (e.acc >= 1) {
            e.acc -= 1;
            if (e.black) smoke({ x: e.x + rnd(-6, 6), y: e.y, z: e.z + rnd(-4, 4), vx: rnd(-0.8, 1.2), vy: rnd(3, 6), vz: rnd(0, 1.5), s0: e.s * 0.7, s1: e.s * rnd(3, 5), dur: rnd(8, 12), op: rnd(0.55, 0.75), c0: 0.16, c1: 0.08, drag: 0.3, rise: 0.5, spin: rnd(-0.15, 0.15), warm: 0.6 });
            else if (e.camp) {                                                                   // костёр: низкое пламя, лёгкий дым, искры
              fire({ x: e.x + rnd(-e.s, e.s) * 0.8, y: e.y + rnd(0, 0.25), z: e.z + rnd(-e.s, e.s) * 0.8, vx: rnd(-0.25, 0.25), vy: rnd(0.8, 1.9), vz: rnd(-0.25, 0.25), s0: e.s * rnd(0.55, 0.85), s1: e.s * rnd(0.9, 1.5), dur: rnd(0.45, 0.9), op: rnd(0.7, 0.95), c0: 1, c1: 0.1, drag: 1.1, rise: 1.0, spin: rnd(-1.2, 1.2) });
              if (rand() < 0.3) smoke({ x: e.x + rnd(-e.s, e.s), y: e.y + 0.9, z: e.z + rnd(-e.s, e.s), vx: rnd(-0.3, 0.5), vy: rnd(1.0, 2.2), vz: rnd(-0.2, 0.5), s0: e.s * 0.9, s1: e.s * rnd(2.2, 3.4), dur: rnd(3.5, 6), op: rnd(0.28, 0.42), c0: 0.2, c1: 0.1, drag: 0.5, rise: 0.7, spin: rnd(-0.2, 0.2), warm: 0.7 });
              if (rand() < 0.16) ember(e.x, e.y + 0.4, e.z, rnd(1.2, 3.4), 1.1);
            }
            else {
              fire({ x: e.x + rnd(-e.s, e.s), y: e.y + rnd(0, 0.6), z: e.z + rnd(-e.s, e.s) * 0.6, vx: rnd(-0.4, 0.4), vy: rnd(1.4, 3.6), vz: rnd(0.2, 1.8), s0: e.s * rnd(0.7, 1.1), s1: e.s * rnd(1.8, 2.8), dur: rnd(0.7, 1.4), op: rnd(0.6, 0.95), c0: 1, c1: 0.1, drag: 0.9, rise: 1.3, spin: rnd(-1, 1) });
              if (rand() < 0.55) smoke({ x: e.x + rnd(-e.s, e.s), y: e.y + e.s, z: e.z + rnd(-e.s, e.s) * 0.5, vx: rnd(-0.5, 0.8), vy: rnd(2, 4.5), vz: rnd(0.2, 2), s0: e.s * 1.2, s1: e.s * rnd(3.2, 5), dur: rnd(5, 9), op: rnd(0.4, 0.6), c0: 0.2, c1: 0.1, drag: 0.4, rise: 0.8, spin: rnd(-0.2, 0.2), warm: 1 });
              if (rand() < 0.2) ember(e.x, e.y + 0.5, e.z, rnd(1.5, 5), 1.4);
            }
          }
        }
        // пыль при обрушении: поднимается и катится на площадь
        if (B.dust && B.t - B.mainAt < B.dust.until) {
          B.dust.acc = (B.dust.acc || 0) + 34 * dt;
          const kk = 1 - sm(0, B.dust.until, B.t - B.mainAt) * 0.7;
          while (B.dust.acc >= 1) {
            B.dust.acc -= 1;
            smoke({ x: rnd(-30, 30), y: rnd(0.5, 7), z: rnd(-50, -30), vx: rnd(-2, 2), vy: rnd(1.5, 7) * kk, vz: rnd(3, 11) * kk, s0: rnd(5, 8), s1: rnd(16, 28), dur: rnd(6, 11), op: rnd(0.42, 0.62), c0: rnd(0.4, 0.55), c1: 0.2, drag: 0.7, rise: 0.25, spin: rnd(-0.2, 0.2), warm: 0.6, fl: 0.3 });
          }
          if (rand() < 0.05) ember(rnd(-26, 26), rnd(2, 10), rnd(-44, -30), rnd(4, 14), 1);
        }
        // обрушение: «блин»
        if (B.col) {
          const Cc = B.col; Cc.t += dt;
          TW.levels.forEach((L, k) => {
            const del = (2 - k) * 0.5, p0 = clamp((Cc.t - del) / (Cc.dur * 0.62), 0, 1), p = p0 * p0, fin = [0.0, 0.7, 1.4][k];
            L.position.y = lerp(FL[k], fin, p); L.scale.y = lerp(1, 0.12, p); L.scale.x = lerp(1, 0.985, p);
            L.rotation.z = Math.sin(Cc.t * 7 + k * 2) * 0.012 * Math.sin(p0 * PI) + (k === 2 ? 0.05 : k === 1 ? -0.03 : 0.015) * p;
            L.rotation.x = (k === 2 ? -0.03 : 0.02) * p;
            L.position.x = (k === 2 ? 1.2 : k === 1 ? -0.8 : 0.3) * p;
            L.position.z = (k === 2 ? 1.0 : 0) * p;
          });
          const hp = clamp((Cc.t + 0.4) / (Cc.dur * 0.78), 0, 1); B.heap.scale.y = Math.max(0.001, 1 - Math.pow(1 - hp, 3));
          if (x && Cc.t > -0.4 && Cc.t < Cc.dur) x.shk = Math.max(x.shk, 0.09 * (1 - sm(0.3, 1, Cc.t / Cc.dur)));
          if (Cc.t > 0.4 && Cc.t < Cc.dur * 0.7 && rand() < dt * 3) {                         // падающие куски сверху
            for (let k = 0; k < 6; k += 1) chunk(rnd(-26, 26), rnd(8, 15), rnd(-46, -31), rnd(-2, 2), rnd(-1, 4), rnd(0, 6), rnd(0.2, 0.6), 0x4a4b50, 5);
          }
          if (Cc.t > Cc.dur) { B.col = null; B.done = true; TW.interior(false); TW.levels.forEach((L) => { L.visible = false; }); }
        }
        // панели
        const cam2 = r.camera.position;
        TW.panels.forEach((p) => {
          if (!p.fly) return;
          const gp = p.g;
          if (p.scorch > 0 && p.solid) { p.scorch = Math.max(0, p.scorch - dt * 0.9); p.solid.material.color.setScalar(0.38 + 0.62 * p.scorch); if (p.glass && p.scorch < 0.99) p.glass.material.color.setHex(0x0a0c10); }
          if (p.rest) return;
          if (p.delay > 0) { p.delay -= dt; return; }
          p.v.y -= g * dt; gp.position.addScaledVector(p.v, dt);
          gp.rotation.x += p.w.x * dt; gp.rotation.y += p.w.y * dt; gp.rotation.z += p.w.z * dt;
          tmpM.makeRotationFromEuler(gp.rotation); const e = tmpM.elements, ext = p.hw * Math.abs(e[1]) + p.hh * Math.abs(e[5]) + p.hd * Math.abs(e[9]);
          const gy = gp.position.y - ext;
          if (gy < 0.0) {
            gp.position.y = ext;
            if (p.v.y < -2.5) {
              if (p.v.y < -6 && rand() < 0.7) { const d = gp.position.distanceTo(cam2); if (d < 140) for (let k = 0; k < 2; k += 1) smoke({ x: gp.position.x + rnd(-1, 1), y: 0.5, z: gp.position.z + rnd(-1, 1), vx: rnd(-2.5, 2.5), vy: rnd(0.4, 2), vz: rnd(-2.5, 2.5), s0: 1.6, s1: rnd(4.5, 8), dur: rnd(2.6, 4.5), op: 0.4, c0: 0.46, c1: 0.2, drag: 1.4, rise: 0.1, fl: 0.4 }); }
              p.v.y = -p.v.y * 0.2; p.v.x *= 0.55; p.v.z *= 0.55; p.w.multiplyScalar(0.45);
            } else {
              p.v.y = 0; const f = Math.exp(-dt * 4); p.v.x *= f; p.v.z *= f; p.w.multiplyScalar(Math.exp(-dt * 5));
              if (p.v.lengthSq() < 0.12 && p.w.lengthSq() < 0.1) { p.rest = true; }
            }
          }
        });
        if (TW.sign && TW.sign.fly) {
          const S = TW.sign; S.t += dt;
          if (S.t > 0) { S.v.y -= g * dt; S.m.position.addScaledVector(S.v, dt); S.m.rotation.x += S.w.x * dt; S.m.rotation.y += S.w.y * dt; S.m.rotation.z += S.w.z * dt; if (S.m.position.y < 0.4) { S.m.position.y = 0.4; S.v.set(0, 0, 0); S.w.set(0, 0, 0); S.fly = false; } }
        }
        // обломки (инстанс)
        B.tb = 3;
        {
          const D = B.D; let any = false;
          for (let i = 0; i < D.n; i += 1) {
            if (!D.on[i] || D.rest[i]) continue;
            any = true;
            const i3 = i * 3;
            if (D.tr[i] > 0) {                                                                        // дымный след от тяжёлого куска (не больше трёх клубов за кадр на все)
              D.tr[i] -= dt; D.tt[i] -= dt;
              if (D.tt[i] <= 0 && B.tb > 0) { D.tt[i] = 0.06; B.tb -= 1; smoke({ x: D.p[i3], y: D.p[i3 + 1], z: D.p[i3 + 2], vx: rnd(-0.6, 0.6), vy: rnd(0.2, 1.2), vz: rnd(-0.6, 0.6), s0: 0.7 + D.s[i3] * 1.5, s1: 3.2 + D.s[i3] * 3, dur: rnd(1.6, 2.8), op: 0.32, c0: 0.28, c1: 0.14, drag: 1.1, rise: 0.4, spin: rnd(-0.4, 0.4), warm: 0.5 }); }
            }
            D.v[i3 + 1] -= g * dt;
            D.p[i3] += D.v[i3] * dt; D.p[i3 + 1] += D.v[i3 + 1] * dt; D.p[i3 + 2] += D.v[i3 + 2] * dt;
            D.a[i3] += D.w[i3] * dt; D.a[i3 + 1] += D.w[i3 + 1] * dt; D.a[i3 + 2] += D.w[i3 + 2] * dt;
            const hh = Math.min(D.s[i3], D.s[i3 + 1], D.s[i3 + 2]) * 0.5;
            if (D.p[i3 + 1] < hh) {
              D.p[i3 + 1] = hh;
              if (D.v[i3 + 1] < -2.2) { D.v[i3 + 1] *= -0.3; D.v[i3] *= 0.6; D.v[i3 + 2] *= 0.6; D.w[i3] *= 0.5; D.w[i3 + 1] *= 0.5; D.w[i3 + 2] *= 0.5; } else {
                D.v[i3 + 1] = 0; const f = Math.exp(-dt * 5); D.v[i3] *= f; D.v[i3 + 2] *= f; D.w[i3] *= f; D.w[i3 + 1] *= f; D.w[i3 + 2] *= f;
                if (Math.abs(D.v[i3]) + Math.abs(D.v[i3 + 2]) < 0.2) D.rest[i] = 1;
              }
            }
            const o = D.obj; o.position.set(D.p[i3], D.p[i3 + 1], D.p[i3 + 2]); o.rotation.set(D.a[i3], D.a[i3 + 1], D.a[i3 + 2]); o.scale.set(D.s[i3], D.s[i3 + 1], D.s[i3 + 2]); o.updateMatrix(); D.mesh.setMatrixAt(i, o.matrix);
          }
          if (any) D.mesh.instanceMatrix.needsUpdate = true;
        }
        // угольки
        {
          const E = B.E; let live = 0;
          for (let i = 0; i < E.n; i += 1) {
            if (E.age[i] >= E.dur[i]) { if (E.pos[i * 3 + 1] > -50) { E.pos[i * 3 + 1] = -100; E.col[i * 3] = E.col[i * 3 + 1] = E.col[i * 3 + 2] = 0; } continue; }
            live += 1; E.age[i] += dt; const k = E.age[i] / E.dur[i], j = i * 3;
            E.v[j + 1] -= 4.2 * dt; E.v[j] *= Math.exp(-0.3 * dt); E.v[j + 2] *= Math.exp(-0.3 * dt);
            E.pos[j] += E.v[j] * dt; E.pos[j + 1] += E.v[j + 1] * dt; E.pos[j + 2] += E.v[j + 2] * dt;
            if (E.pos[j + 1] < 0.05) { E.pos[j + 1] = 0.05; E.v[j + 1] *= -0.3; }
            const b = Math.max(0, 1 - k) * (0.6 + 0.4 * Math.sin(B.t * 40 + i)); E.col[j] = b; E.col[j + 1] = b * (0.74 - 0.5 * k); E.col[j + 2] = b * (0.34 - 0.3 * k);
          }
          if (live || E.dirty) { E.geo.attributes.position.needsUpdate = true; E.geo.attributes.color.needsUpdate = true; E.dirty = live > 0; }
        }
        // кольцо ударной волны
        B.rings.forEach((m) => {
          if (!m.u.on) return;
          const k = (B.t - m.u.t0) / m.u.dur; if (k >= 1) { m.u.on = false; m.visible = false; return; }
          const rr = m.u.r1 * (1 - Math.pow(1 - k, 2.4)); m.scale.set(rr, 1, rr); m.material.opacity = m.u.op * Math.pow(1 - k, 1.4) * Math.min(1, k * 14);
        });
        // вспышки-спрайты
        {
          let j = 0, s = B.flashS;
          for (let i = B.flashes.length - 1; i >= 0; i -= 1) {
            const f = B.flashes[i], k = (B.t - f.t) / f.dur; if (k >= 1) { B.flashes.splice(i, 1); continue; }
            if (j === 0) { s.visible = true; s.position.set(f.x, f.y, f.z); const q = f.sz * (0.55 + 0.6 * k); s.scale.set(q, q, 1); s.material.opacity = f.pk * Math.pow(1 - k, 1.6); }
            j += 1;
          }
          if (!j) s.visible = false;
        }
        // свет
        {
          let I = 0, best = 0, bp = null;
          for (let i = B.pulses.length - 1; i >= 0; i -= 1) { const p = B.pulses[i], v = p.pk * Math.exp(-(B.t - p.t) * p.decay); if (v < 0.02) { B.pulses.splice(i, 1); continue; } I += v; if (v > best) { best = v; bp = p; } }
          if (bp) B.light.position.set(bp.x, bp.y, bp.z); else if (B.lpos) B.light.position.set(B.lpos[0], B.lpos[1], B.lpos[2]); else B.light.position.set(0, 4, -38);
          const fl = B.glowI * (0.82 + 0.18 * Math.sin(B.t * 17) * Math.sin(B.t * 9.3) + rnd(-0.06, 0.06));
          B.light.intensity = Math.min(16, I) + (B.main ? 1.1 : 0.5) * fl;
          if (B.heapOn && B.heap.children[1]) B.heap.children[1].material.color.setScalar(0.65 + 0.35 * Math.abs(Math.sin(B.t * 5.1 + Math.sin(B.t * 2.3))));
        }
        if (B.jets) B.jets.forEach((j) => {                                                       // струи пыли из окон этажей
          if (B.t < j.t0 || B.t > j.t1) return;
          j.acc += (10 + 22 * qk) * dt;
          while (j.acc >= 1) { j.acc -= 1; smoke({ x: rnd(-27, 27), y: j.y + rnd(-1.2, 1.2), z: ZF - 0.5, vx: rnd(-1.5, 1.5), vy: rnd(-0.5, 2), vz: rnd(14, 26), s0: rnd(2.2, 3.4), s1: rnd(8, 13), dur: rnd(2.8, 4.4), op: rnd(0.45, 0.62), c0: rnd(0.42, 0.56), c1: 0.2, drag: 1.0, rise: 0.15, spin: rnd(-0.3, 0.3), warm: 0.4 }); }
        });
        if (B.main && x && B.t - B.mainAt < 16 && B.t - (B.hzT || 0) > 4.5) { B.hzT = B.t; x.hz.x = 0; x.hz.y = 10; x.hz.z = -38; x.hz.t = 0.8; x.hz.R = 20 - 8 * clamp((B.t - B.mainAt) / 16, 0, 1); }   // марево над пожаром держится дольше шара
        if (B.scorchT !== undefined) { B.scorch.visible = true; B.scorch.material.opacity = 0.82 * sm(0, 1, (B.t - B.scorchT) / 3); }
        stepPool(B.fire, dt, r.camera.position, true);
        stepPool(B.smoke, dt, r.camera.position, false);
      };
      B.run = () => { B.on = true; };                                                      // пулы, костёр и свет живут; события взрыва ещё не запущены
      B.go = () => { if (B.armed) return; const o = B.t; B.ev.forEach((e) => { e.t += o; }); B.mainAt += o; B.armed = true; B.t0 = o; };
      B.start = () => { B.on = true; B.t = 0; B.go(); };
      B.burn = (x, z, o) => { const e = Object.assign({ x, y: 0.12, z, s: 0.36, rate: 0, t1: 9999, keep: true }, o || {}); B.emit.push(e); return e; };
      B.un = K.hook(r, (dt) => B.update(dt));
      B.dispose = () => {
        if (B.disposed) return; B.disposed = true; B.on = false; try { B.un && B.un(); } catch (e) { /* уже снят */ }
        [B.fire, B.smoke].forEach((a) => a.forEach((s) => { sc.remove(s); s.material.dispose(); }));
        sc.remove(B.flashS); sc.remove(B.light); sc.remove(B.scorch); B.scorch.geometry.dispose(); B.scorch.material.dispose(); sc.remove(B.D.mesh); sc.remove(B.E.pts); sc.remove(B.heap);
        B.D.mesh.geometry.dispose(); B.D.mesh.material.dispose(); B.E.geo.dispose(); B.E.pts.material.dispose();
        B.rings.forEach((m) => { sc.remove(m); m.material.dispose(); });
        B.heap.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      };
      return B;
    }
  };
}());
