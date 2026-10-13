// NEXA: съёмка и монтаж вертикальных роликов (YouTube Shorts) прямо из игры.
// Работает в браузерной панели: симуляцию гоним вручную (детерминированно), каждый кадр рендерим в 2D-холст 1080×1920,
// рисуем титры/метки/переходы, кодируем H.264 (WebCodecs) + AAC, пишем MP4 без ffmpeg и отправляем в tools/shorts/recv.js.
// Звук игры не воспроизводится: музыка и эффекты декодируются из assets/*.mp3 и сводятся в файл офлайн.
(() => {
  'use strict';
  if (window.Cap && window.Cap.__v === 6) return;
  const Cap = window.Cap = { __v: 6 };
  const RECV = 'http://127.0.0.1:8799/save';
  const yieldNow = () => new Promise((res) => { const c = new MessageChannel(); c.port1.onmessage = () => res(); c.port2.postMessage(0); });
  Cap.yieldNow = yieldNow;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => k * k * (3 - 2 * k);
  const easeOut = (k) => 1 - (1 - k) * (1 - k) * (1 - k);
  Cap.clamp = clamp; Cap.lerp = lerp; Cap.ease = ease; Cap.easeOut = easeOut;

  // ================================================================== MP4-мультиплексор (один видеотрек H.264 + опционально AAC)
  const te = new TextEncoder();
  const cat = (arr) => { let n = 0; arr.forEach((a) => { n += a.length; }); const o = new Uint8Array(n); let p = 0; arr.forEach((a) => { o.set(a, p); p += a.length; }); return o; };
  const u8 = (...v) => new Uint8Array(v);
  const u16 = (v) => u8((v >> 8) & 255, v & 255);
  const u32 = (v) => u8((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  const str = (s) => te.encode(s);
  const box = (type, ...p) => { const body = cat(p); return cat([u32(body.length + 8), str(type), body]); };
  const full = (type, ver, flags, ...p) => box(type, u8(ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...p);
  const zeros = (n) => new Uint8Array(n);
  const MATRIX = cat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);
  const desc = (tag, ...p) => { const body = cat(p); return cat([u8(tag, body.length), body]); };

  function trak(id, kind, o) {
    // o: {timescale, duration (в timescale), w, h, sizes[], delta, keys[] | null, stsd, offset}
    const isV = kind === 'vide';
    const tkhd = full('tkhd', 0, 7, u32(0), u32(0), u32(id), u32(0), u32(o.durMovie), zeros(8), u16(0), u16(0), u16(isV ? 0 : 0x0100), u16(0), MATRIX, u32(isV ? o.w << 16 : 0), u32(isV ? o.h << 16 : 0));
    const mdhd = full('mdhd', 0, 0, u32(0), u32(0), u32(o.timescale), u32(o.duration), u16(0x55c4), u16(0));
    const hdlr = full('hdlr', 0, 0, u32(0), str(kind), zeros(12), str(isV ? 'VideoHandler\0' : 'SoundHandler\0'));
    const mhd = isV ? full('vmhd', 0, 1, u16(0), zeros(6)) : full('smhd', 0, 0, u16(0), u16(0));
    const dinf = box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));
    const n = o.sizes.length;
    const stts = full('stts', 0, 0, u32(1), u32(n), u32(o.delta));
    const stsc = full('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1));
    const stsz = full('stsz', 0, 0, u32(0), u32(n), cat(o.sizes.map(u32)));
    const stco = full('stco', 0, 0, u32(1), u32(o.offset));
    const parts = [o.stsd, stts];
    if (o.keys) parts.push(full('stss', 0, 0, u32(o.keys.length), cat(o.keys.map(u32))));
    parts.push(stsc, stsz, stco);
    const stbl = box('stbl', ...parts);
    return box('trak', tkhd, box('mdia', mdhd, hdlr, box('minf', mhd, dinf, stbl)));
  }
  function avc1(w, h, avcC) {
    const name = zeros(32);
    return full('stsd', 0, 0, u32(1), box('avc1', zeros(6), u16(1), u16(0), u16(0), zeros(12), u16(w), u16(h), u32(0x00480000), u32(0x00480000), u32(0), u16(1), name, u16(0x18), u16(0xffff), box('avcC', avcC)));
  }
  function mp4a(rate, ch, asc) {
    const dsi = desc(0x05, asc);
    const dcd = desc(0x04, u8(0x40, 0x15), zeros(3), u32(0), u32(0), dsi);
    const esd = desc(0x03, u16(0), u8(0), dcd, desc(0x06, u8(2)));
    return full('stsd', 0, 0, u32(1), box('mp4a', zeros(6), u16(1), zeros(8), u16(ch), u16(16), u16(0), u16(0), u32(rate << 16), full('esds', 0, 0, esd)));
  }
  // V: {w,h,fps,avcC,samples:[{d,key}]}; A: {rate,ch,asc,samples:[{d}]} | null
  Cap.mux = (V, A) => {
    const nV = V.samples.length, vDelta = Math.round(90000 / V.fps), vDur = nV * vDelta, movieMs = Math.round(vDur / 90);
    const keys = []; V.samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });
    const vBytes = V.samples.reduce((a, s) => a + s.d.length, 0);
    const aBytes = A ? A.samples.reduce((a, s) => a + s.d.length, 0) : 0;
    const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'));
    const build = (offV, offA) => {
      const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(movieMs), u32(0x00010000), u16(0x0100), u16(0), zeros(8), MATRIX, zeros(24), u32(A ? 3 : 2));
      const tv = trak(1, 'vide', { timescale: 90000, duration: vDur, durMovie: movieMs, w: V.w, h: V.h, sizes: V.samples.map((s) => s.d.length), delta: vDelta, keys, stsd: avc1(V.w, V.h, V.avcC), offset: offV });
      const ta = A ? trak(2, 'soun', { timescale: A.rate, duration: A.samples.length * 1024, durMovie: movieMs, w: 0, h: 0, sizes: A.samples.map((s) => s.d.length), delta: 1024, keys: null, stsd: mp4a(A.rate, A.ch, A.asc), offset: offA }) : new Uint8Array(0);
      return box('moov', mvhd, tv, ta);
    };
    const m0 = build(0, 0), start = ftyp.length + m0.length + 8;
    const moov = build(start, start + vBytes);
    const mdat = cat([u32(vBytes + aBytes + 8), str('mdat')]);
    return cat([ftyp, moov, mdat, ...V.samples.map((s) => s.d), ...(A ? A.samples.map((s) => s.d) : [])]);
  };

  Cap.save = async (name, bytes, dir) => {
    const r = await fetch(RECV + '?name=' + encodeURIComponent(name) + (dir ? '&dir=' + dir : ''), { method: 'POST', body: bytes });
    return r.json();
  };

  // ================================================================== сессия съёмки
  Cap.begin = async (o) => {
    const S = Cap.S = { W: o.w || 1080, H: o.h || 1920, fps: o.fps || 30, name: o.name || 'clip', n: 0, vs: [], avcC: null, err: null, bitrate: o.bitrate || 12e6 };
    S.cv = document.createElement('canvas'); S.cv.width = S.W; S.cv.height = S.H;
    S.ctx = S.cv.getContext('2d');
    S.enc = new VideoEncoder({
      output: (chunk, meta) => {
        const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d);
        const dc = meta && meta.decoderConfig && meta.decoderConfig.description;
        if (dc && !S.avcC) S.avcC = new Uint8Array(dc.buffer ? dc.buffer.slice(dc.byteOffset, dc.byteOffset + dc.byteLength) : dc);
        S.vs.push({ d, key: chunk.type === 'key', ts: chunk.timestamp });
      },
      error: (e) => { S.err = e; }
    });
    S.enc.configure({ codec: 'avc1.640028', width: S.W, height: S.H, bitrate: S.bitrate, framerate: S.fps, avc: { format: 'avc' }, latencyMode: 'quality' });
    Cap.aud = null;
    return 'begin ' + S.W + 'x' + S.H + '@' + S.fps;
  };
  Cap.t = () => (Cap.S ? Cap.S.n / Cap.S.fps : 0);
  // текущий холст → кодировщик
  Cap.commit = async () => {
    const S = Cap.S;
    const f = new VideoFrame(S.cv, { timestamp: Math.round(S.n * 1e6 / S.fps), duration: Math.round(1e6 / S.fps) });
    S.enc.encode(f, { keyFrame: S.n % (S.fps * 2) === 0 });
    f.close(); S.n += 1;
    if (S.enc.encodeQueueSize > 5) { while (S.enc.encodeQueueSize > 1) await yieldNow(); }
  };
  // JPEG текущего холста на диск (для контроля глазами): shorts/frames/<name>.jpg
  Cap.snap = async (name) => {
    const S = Cap.S;
    const blob = await new Promise((res) => S.cv.toBlob(res, 'image/jpeg', 0.82));
    return Cap.save(name + '.jpg', new Uint8Array(await blob.arrayBuffer()), 'frames');
  };

  // ================================================================== звук: офлайн-микс из assets
  Cap.audioInit = (sec) => {
    const rate = 48000, n = Math.ceil(sec * rate);
    Cap.aud = { rate, n, L: new Float32Array(n), R: new Float32Array(n), cache: {} };
  };
  const decode = async (url) => {
    const A = Cap.aud; if (A.cache[url]) return A.cache[url];
    const buf = await (await fetch(url)).arrayBuffer();
    const ctx = new OfflineAudioContext(2, 48000, 48000);
    const ab = await ctx.decodeAudioData(buf);
    return (A.cache[url] = ab);
  };
  // o: {at, from, dur, gain, fadeIn, fadeOut, loop}
  Cap.addAudio = async (url, o) => {
    const A = Cap.aud, ab = await decode(url), r = A.rate;
    const L = ab.getChannelData(0), R = ab.numberOfChannels > 1 ? ab.getChannelData(1) : L;
    const at = Math.round((o.at || 0) * r), from = Math.round((o.from || 0) * r), srcLen = L.length;
    const len = Math.round((o.dur !== undefined ? o.dur : (srcLen - from) / r) * r), g = o.gain === undefined ? 1 : o.gain;
    const fi = Math.round((o.fadeIn || 0) * r), fo = Math.round((o.fadeOut || 0) * r);
    for (let i = 0; i < len; i += 1) {
      const d = at + i; if (d < 0) continue; if (d >= A.n) break;
      let s = from + i; if (s >= srcLen) { if (o.loop) s = from + (i % Math.max(1, srcLen - from)); else break; }
      let k = g; if (fi && i < fi) k *= i / fi; if (fo && i > len - fo) k *= (len - i) / fo;
      A.L[d] += L[s] * k; A.R[d] += R[s] * k;
    }
    return ab.duration;
  };
  const encodeAudio = async () => {
    const A = Cap.aud; if (!A) return null;
    let peak = 0; for (let i = 0; i < A.n; i += 1) { const a = Math.max(Math.abs(A.L[i]), Math.abs(A.R[i])); if (a > peak) peak = a; }
    if (peak > 0.97) { const k = 0.97 / peak; for (let i = 0; i < A.n; i += 1) { A.L[i] *= k; A.R[i] *= k; } }   // мягко не клиппуем
    const out = { rate: A.rate, ch: 2, asc: null, samples: [], peak };
    let err = null;
    const enc = new AudioEncoder({
      output: (c, m) => {
        const d = new Uint8Array(c.byteLength); c.copyTo(d);
        const dc = m && m.decoderConfig && m.decoderConfig.description;
        if (dc && !out.asc) out.asc = new Uint8Array(dc.buffer ? dc.buffer.slice(dc.byteOffset, dc.byteOffset + dc.byteLength) : dc);
        out.samples.push({ d });
      },
      error: (e) => { err = e; }
    });
    enc.configure({ codec: 'mp4a.40.2', sampleRate: A.rate, numberOfChannels: 2, bitrate: 160000 });
    for (let i = 0; i < A.n; i += 1024) {
      const frames = Math.min(1024, A.n - i), data = new Float32Array(2 * 1024);
      data.set(A.L.subarray(i, i + frames), 0); data.set(A.R.subarray(i, i + frames), 1024);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: A.rate, numberOfFrames: 1024, numberOfChannels: 2, timestamp: Math.round(i / A.rate * 1e6), data });
      enc.encode(ad); ad.close();
      if (enc.encodeQueueSize > 12) { while (enc.encodeQueueSize > 2) await yieldNow(); }
    }
    await enc.flush();
    if (err) throw err;
    return out;
  };

  Cap.end = async () => {
    const S = Cap.S;
    await S.enc.flush();
    if (S.err) throw S.err;
    const V = { w: S.W, h: S.H, fps: S.fps, avcC: S.avcC, samples: S.vs };
    let A = null;
    try { A = await encodeAudio(); } catch (e) { S.audioErr = String(e && e.message || e); A = null; }
    const bytes = Cap.mux(V, A && A.asc ? A : null);
    const res = await Cap.save(S.name + '.mp4', bytes);
    return Object.assign({ frames: S.n, sec: +(S.n / S.fps).toFixed(2), audio: !!(A && A.asc), peak: A && +A.peak.toFixed(2), audioErr: S.audioErr }, res);
  };

  // ================================================================== рисование: титры, метки, переходы
  const FONT = '"Oswald","Teko","Arial Narrow",Arial,sans-serif';
  Cap.FONT = FONT;
  Cap.RED = '#ff2a2a';
  // строка с подсветкой: *слово* → красным. Возвращает массив [{t, red}]
  const segs = (line) => { const out = []; line.split('*').forEach((p, i) => { if (p) out.push({ t: p, red: i % 2 === 1 }); }); return out; };
  // крупный текст по центру: o {x,y (0..1), size, lines via \n, k (0..1 анимация появления), align, maxW, stroke, bg}
  Cap.text = (ctx, text, o) => {
    o = o || {};
    const W = ctx.canvas.width, H = ctx.canvas.height, k = o.k === undefined ? 1 : o.k;
    if (k <= 0) return;
    let size = o.size || 110;
    const lines = String(text).split('\n'), maxW = (o.maxW || 0.9) * W;
    ctx.save();
    ctx.font = '700 ' + size + 'px ' + FONT;
    const widthOf = (ln) => { let w = 0; segs(ln).forEach((s) => { w += ctx.measureText(s.t).width; }); return w; };
    let wmax = Math.max(...lines.map(widthOf));
    if (wmax > maxW) { size = Math.floor(size * maxW / wmax); ctx.font = '700 ' + size + 'px ' + FONT; wmax = Math.max(...lines.map(widthOf)); }
    const lh = size * 1.08, th = lh * lines.length, cx = (o.x === undefined ? 0.5 : o.x) * W, cy = (o.y === undefined ? 0.3 : o.y) * H;
    const pop = o.pop === false ? 1 : lerp(1.28, 1, easeOut(clamp(k * 4, 0, 1)));
    const alpha = clamp(k * 6, 0, 1) * (o.alpha === undefined ? 1 : o.alpha);
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy); ctx.scale(pop, pop);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    if (o.bg) {
      const pad = size * 0.28;
      ctx.fillStyle = o.bg; ctx.fillRect(-wmax / 2 - pad, -th / 2 - pad * 0.55, wmax + pad * 2, th + pad * 1.1);
    }
    lines.forEach((ln, i) => {
      const parts = segs(ln), w = widthOf(ln), y = -th / 2 + lh * (i + 0.5);
      let x = -w / 2;
      parts.forEach((s) => {
        ctx.lineWidth = size * 0.16; ctx.strokeStyle = 'rgba(0,0,0,0.92)'; ctx.strokeText(s.t, x, y);
        ctx.fillStyle = s.red ? Cap.RED : (o.color || '#fff'); ctx.fillText(s.t, x, y);
        x += ctx.measureText(s.t).width;
      });
    });
    ctx.restore();
  };
  // плашка «тег» с чёрной подложкой: маленькая подпись (подзаголовки, метки)
  Cap.tag = (ctx, text, x, y, o) => {
    o = o || {}; const size = o.size || 44;
    ctx.save();
    ctx.font = '700 ' + size + 'px ' + FONT;
    const w = ctx.measureText(text).width, padX = size * 0.45, h = size * 1.35;
    if (o.left !== undefined) x = o.left + padX + w / 2;
    ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    ctx.fillStyle = o.bg || 'rgba(8,8,10,0.82)';
    ctx.fillRect(x - w / 2 - padX, y - h / 2, w + padX * 2, h);
    ctx.fillStyle = o.accent || Cap.RED; ctx.fillRect(x - w / 2 - padX, y - h / 2, size * 0.14, h);
    ctx.fillStyle = o.color || '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(text, x, y + size * 0.03);
    ctx.restore();
  };
  // проекция мировой точки на холст
  Cap.project = (r, x, y, z, W, H) => {
    const v = new THREE.Vector3(x, y, z).project(r.camera);
    return { x: (v.x * 0.5 + 0.5) * W, y: (1 - (v.y * 0.5 + 0.5)) * H, vis: v.z < 1 && v.z > -1 };
  };
  Cap.flash = (ctx, a, col) => { if (a <= 0) return; ctx.save(); ctx.globalAlpha = clamp(a, 0, 1); ctx.fillStyle = col || '#fff'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore(); };
  Cap.vignette = (ctx, a) => {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + (a === undefined ? 0.55 : a) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };
  // кадр игры → холст (cover по центру), zoom — наезд (1..), dx/dy — смещение в долях
  Cap.blit = (r, o) => {
    o = o || {};
    const S = Cap.S, c = o.canvas || r.renderer.domElement, W = S.W, H = S.H;
    const sc = Math.max(W / c.width, H / c.height) * (o.zoom || 1);
    const w = c.width * sc, h = c.height * sc;
    S.ctx.save();
    S.ctx.fillStyle = '#000'; S.ctx.fillRect(0, 0, W, H);
    S.ctx.drawImage(c, (W - w) / 2 + (o.dx || 0) * W, (H - h) / 2 + (o.dy || 0) * H, w, h);
    S.ctx.restore();
  };
  // конечная плашка беты: тёмный фон, название, «БЕТА-ТЕСТ», призыв. k — время от начала плашки (с)
  Cap.endCard = (ctx, t, o) => {
    o = o || {};
    const W = ctx.canvas.width, H = ctx.canvas.height, a = clamp(t / 0.25, 0, 1);
    ctx.save();
    ctx.globalAlpha = a; ctx.fillStyle = 'rgba(6,6,8,0.9)'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    // тонкая красная линия сканера
    const y = (t * 0.55 % 1) * H; ctx.fillStyle = 'rgba(255,42,42,0.10)'; ctx.fillRect(0, y - 3, W, 6);
    Cap.text(ctx, o.title || 'HIGH / LOW', { y: 0.23, size: 180, k: clamp((t - 0.1) / 0.5, 0, 1), color: '#fff' });
    Cap.text(ctx, o.sub || 'NEXA/OS', { y: 0.295, size: 62, k: clamp((t - 0.2) / 0.5, 0, 1), color: '#9a9aa2', pop: false });
    Cap.text(ctx, o.beta || '*БЕТА-ТЕСТ*', { y: 0.395, size: 124, k: clamp((t - 0.35) / 0.5, 0, 1) });
    Cap.text(ctx, o.date || '15 ОКТЯБРЯ', { y: 0.49, size: 200, k: clamp((t - 0.55) / 0.5, 0, 1), color: '#fff' });
    Cap.text(ctx, o.tg || 'тгк с релизом: *nexaindustries*', { y: 0.585, size: 64, k: clamp((t - 0.8) / 0.5, 0, 1), color: '#fff', pop: false });
    Cap.text(ctx, o.cta || 'Публично и *бесплатно*\nиграй прямо в браузере', { y: 0.69, size: 74, k: clamp((t - 1.0) / 0.5, 0, 1), color: '#e8e8ec', pop: false });
    ctx.restore();
  };
})();
