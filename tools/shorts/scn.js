// NEXA: общий набор для съёмки сцен (используется tools/shorts/v*.js). Нужен tools/shorts/cap.js.
// Игра «держится»: реальный цикл не двигает симуляцию, каждый кадр ролика = шаг симуляции + render + композит + титры.
(() => {
  'use strict';
  const S = window.Scn = window.Scn || {};   // перезагрузка файла не теряет r/W/F/K
  const T = () => window.THREE;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const FPS = 30;
  S.FPS = FPS;

  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src + (src.includes('?') ? '&' : '?') + 'x=' + Date.now(); s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
  S.loadScript = loadScript;

  // мир миссии 48 (регионы wh/office/yard/base/hall/vault/deep/dark/red/head/plaza/road) как «съёмочная площадка»
  S.boot = async (o) => {
    o = o || {};
    try { localStorage.setItem('quality', o.quality || 'HIGH'); } catch (e) { /* без хранилища */ }
    if (!window.Cap) await loadScript('/tools/shorts/cap.js');
    if (!window.__b48) await loadScript('/.claude/t48.js');
    await window.__b48();
    const m = window.__m48;
    S.r = m.r; S.W = m.W; S.F = m.F; S.K = m.K;
    const r = S.r;
    try { r.snd.ctx.suspend(); } catch (e) { /* нет звука — и не надо */ }
    if (!r.__upd) { r.__upd = r.update; r.update = function (dt) { if (r.__hold) return; return r.__upd.call(r, dt); }; }
    r.__hold = true; r.inCinema = false; r.cineDepth = 0; r.shotState = null; r.hurt = () => {}; r.hp = r.maxHp || 100;
    r.timeScale = 1;
    await document.fonts.load('700 100px Oswald');
    return { quality: r.qName, canvas: [r.renderer.domElement.width, r.renderer.domElement.height] };
  };

  // сброс следов взрывов/крови между шотами (дым, огонь, осколки, кольца, копоть, лужи)
  S.resetFx = () => {
    const r = S.r, X = r.xf, B = r.bl;
    if (X) {
      [].concat(X.fire, X.smoke, X.deb, X.rings, X.decals).forEach((o) => { if (o && o.u) { o.u.on = false; o.visible = false; if (o.material) o.material.opacity = 0; } });
      if (X.flash) { X.flash.visible = false; X.flash.material.opacity = 0; }
      X.burn.length = 0; X.corp.length = 0; X.act = false; X.con = 0; X.shk = 0; X.sw = null; X.last = null; if (X.fl) X.fl.age = 9; if (X.light) X.light.intensity = 0;
      if (X.emb) { X.emb.live = 0; for (let i = 0; i < X.emb.n; i += 1) X.emb.pos[i * 3 + 1] = -100; X.emb.geo.attributes.position.needsUpdate = true; X.emb.age.fill(0); }
    }
    if (B) { B.parts.forEach((p) => { p.life = 0; p.m.visible = false; }); B.decals.forEach((d) => { d.m.visible = false; }); }
  };
  S.enter = (name, x, z, yaw) => { S.resetFx(); S.r.clearEnemies(); S.W.enter(name, x || 0, z || 0, yaw || 0); const R = S.W.R[name]; return R; };

  // шаг симуляции на sec секунд (мелкими шагами 1/60)
  S.advance = (sec) => {
    const r = S.r; let left = sec;
    const n = Math.max(1, Math.round(sec * 60)), dt = sec / n;
    for (let i = 0; i < n; i += 1) { r.time += dt; r.__upd.call(r, dt); left -= dt; }
  };
  // свободная камера: позиция, точка взгляда, fov, крен
  S.cam = (px, py, pz, lx, ly, lz, fov, roll) => {
    const r = S.r;
    if (!r.camFree) r.camFree = { pos: new (T().Vector3)(), look: new (T().Vector3)(), fov: 60, roll: 0 };
    const cf = r.camFree;
    cf.pos.set(px, py, pz); cf.look.set(lx, ly, lz); cf.fov = fov || 60; cf.roll = roll || 0;
    r.inCinema = false; r.shotState = null;
  };
  // статист: стоит и не стреляет
  S.guard = (type, x, z, yaw, o) => {
    const r = S.r;
    const e = r.enemy(type || 'grunt', x, z, Object.assign({ drop: false, yaw: yaw || 0, exact: true, ai: () => true, tag: 'film' }, o || {}));
    e.n.g.position.set(x, 0, z); e.n.g.rotation.y = e.n.yaw = yaw || 0;
    return e;
  };
  // попадание: зона head|torso|leg, dmg — «сила» удара (от неё зависит бросок), from — откуда стреляли [x,y,z]
  S.hit = (e, o) => {
    const r = S.r, g = e.n.g.position, sc = e.t.scale || 1, cam = r.camera.position, keep = cam.clone();
    const y = o.zone === 'head' ? 1.62 * sc : o.zone === 'leg' ? 0.45 * sc : 1.15 * sc;
    if (o.from) cam.set(o.from[0], o.from[1], o.from[2]);
    e.hp = 1;
    r.damageEnemy(e, o.dmg || 60, o.zone === 'head', { x: g.x, y, z: g.z });
    cam.copy(keep);
  };
  S.shotgun = (e, from) => S.hit(e, { zone: 'torso', dmg: 150, from });
  S.alive = () => S.r.cb.enemies.filter((e) => !e.dead);
  S.clear = () => { S.r.clearEnemies(); };

  // подписи по времени: [{t0,t1,text,y,size,bg,color,pop}] — рисуются с «выскоком» и затуханием
  S.caps = (ctx, t, list) => {
    list.forEach((c) => {
      if (t < c.t0 || t > c.t1) return;
      const k = clamp((t - c.t0) / 0.4, 0, 1), out = clamp((c.t1 - t) / 0.15, 0, 1);
      Cap.text(ctx, c.text, Object.assign({}, c, { k: k, alpha: out, y: (c.y === undefined ? 0.205 : c.y) + (c.noShift ? 0 : 0.03) }));
    });
  };

  // проектируем мировую точку на холст ролика
  S.proj = (x, y, z) => Cap.project(S.r, x, y, z, Cap.S.W, Cap.S.H);

  // снимок кадра для контроля (shorts/frames/<имя>.jpg)
  S.snap = (name) => Cap.snap(name);

  // раннер: frameFn(t, i, n) готовит кадр (камера, симуляция, render, blit, титры); возвращает итог записи
  S.film = async (name, dur, frameFn, o) => {
    o = o || {};
    await Cap.begin({ name, fps: FPS, bitrate: o.bitrate || 8e6 });
    if (o.audio || o.audioAfter) { Cap.audioInit(dur); if (o.audio) await o.audio(Cap); }
    const n = Math.round(dur * FPS), snaps = o.snaps || [];
    // контактные листы: o.sheets = [{t0, t1, every}] → shorts/frames/<name>_sheet_<t0>.jpg (миниатюры подряд, чтобы видеть движение)
    const sheets = (o.sheets || []).map((q) => { const every = q.every || 5, cnt = Math.ceil((q.t1 - q.t0) * FPS / every), cols = q.cols || 8, rows = Math.ceil(cnt / cols), tw = q.tw || 135, th = Math.round(tw * 16 / 9); const cv = document.createElement('canvas'); cv.width = cols * tw; cv.height = rows * th; const c = cv.getContext('2d'); c.fillStyle = '#222'; c.fillRect(0, 0, cv.width, cv.height); return Object.assign({ every, cols, tw, th, cv, c, k: 0 }, q); });
    const t0 = performance.now();
    for (let i = 0; i < n; i += 1) {
      const t = i / FPS;
      await frameFn(t, i, n);
      if (snaps.length && snaps.some((s) => Math.abs(s - t) < 0.5 / FPS)) await Cap.snap(name + '_t' + t.toFixed(1).replace('.', '_'));
      sheets.forEach((q) => { if (t >= q.t0 && t < q.t1 && i % q.every === 0) { const cx = (q.k % q.cols) * q.tw, cy = Math.floor(q.k / q.cols) * q.th; q.c.drawImage(Cap.S.cv, cx, cy, q.tw, q.th); q.c.fillStyle = '#ff0'; q.c.font = '14px sans-serif'; q.c.fillText(t.toFixed(1), cx + 4, cy + 16); q.k += 1; } });
      await Cap.commit();
      if (i % 20 === 0) await Cap.yieldNow();
    }
    if (o.audioAfter) await o.audioAfter(Cap);
    for (const q of sheets) { const blob = await new Promise((res) => q.cv.toBlob(res, 'image/jpeg', 0.85)); await Cap.save(name + '_sheet_' + String(q.t0).replace('.', '_') + '.jpg', new Uint8Array(await blob.arrayBuffer()), 'frames'); }
    const res = await Cap.end();
    res.ms = Math.round(performance.now() - t0);
    return res;
  };

  // типовой «кадр»: render → блит с наездом → виньетка; возвращает ctx для титров
  S.frame = (o) => {
    const r = S.r;
    r.blurX = 0; r.blurY = 0;                         // «смаз от поворота» на склейках выглядит как брак
    r.render();
    Cap.blit(r, o || {});
    const ctx = Cap.S.ctx;
    Cap.vignette(ctx, (o && o.vig) === undefined ? 0.5 : o.vig);
    return ctx;
  };

  // постоянные элементы: плашка беты вверху слева
  S.badge = (ctx, t, text) => {
    const W = Cap.S.W, H = Cap.S.H;
    const al = clamp(t / 0.3, 0, 1), L = W * 0.06;
    Cap.tag(ctx, text || 'БЕТА-ТЕСТ · 15 ОКТЯБРЯ', 0, H * 0.062, { size: 40, alpha: al, left: L });
    Cap.tag(ctx, 'тгк с релизом: nexaindustries', 0, H * 0.0975, { size: 31, alpha: al, left: L, accent: '#fff', bg: 'rgba(8,8,10,0.78)' });
  };
})();

// ================================================================== монтаж по шотам (общий)
// o: {name, dur, end, endOpts, badge, shots:[{reg,t0,t1,a,b,la,lb,fov,fovTo,speed,sh,setup(R),tick(t,k,R),flash}], caps, events:[{t,fn}], over(ctx,t,i), audio, snaps, sheets}
(() => {
  const S = window.Scn;
  S.timer = (ctx, text, x, y, o) => Cap.text(ctx, text, Object.assign({ x, y, size: 90, pop: false }, o || {}));
  S.montage = async (o) => {
    const FPS = S.FPS, r = S.r, lerp = (a, b, k) => a + (b - a) * k;
    let cur = -1, prevReg = null;
    const ev = (o.events || []).map((e) => ({ t: e.t, fn: e.fn, done: false }));
    const ensure = (i) => {
      if (cur === i) return;
      cur = i;
      const s = o.shots[i];
      let R = null;
      if (s.reg && !(s.cont && prevReg === s.reg)) { R = S.enter(s.reg, 0, 0, 0); if (!s.lobby) S.clear(); } else if (s.reg) R = S.W.R[s.reg];
      prevReg = s.reg || prevReg;
      if (s.setup) s.setup(R, s);
    };
    const flashes = o.shots.map((s) => s.t0).filter((t) => t > 0);
    return S.film(o.name, o.dur, async (t) => {
      let i = o.shots.findIndex((s) => t >= s.t0 && t < s.t1);
      if (i < 0) i = o.shots.length - 1;
      ensure(i);
      ev.forEach((e) => { if (!e.done && t >= e.t) { e.done = true; e.fn(t); } });
      const s = o.shots[i], k = Cap.ease(Cap.clamp((t - s.t0) / Math.max(0.01, s.t1 - s.t0), 0, 1)), sh = s.sh === undefined ? 0.006 : s.sh;
      if (!s.lobby) S.cam(lerp(s.a[0], s.b[0], k) + Math.sin(t * 8.7) * sh, lerp(s.a[1], s.b[1], k) + Math.sin(t * 6.9) * sh, lerp(s.a[2], s.b[2], k),
        lerp(s.la[0], s.lb[0], k), lerp(s.la[1], s.lb[1], k), lerp(s.la[2], s.lb[2], k), lerp(s.fov, s.fovTo === undefined ? s.fov : s.fovTo, k), 0);
      if (s.tick) s.tick(t, k, S.W.R[s.reg]);
      let ctx;
      if (s.lobby) {                                    // 3D-фон лобби игры (js/lobby3d.js), шагаем сами
        try { Lobby3D._step(1 / FPS, 1); } catch (e) { /* лобби не готово */ }
        const lc = document.querySelector('#lobby3d canvas');
        Cap.blit(null, { canvas: lc, zoom: s.zoom || 1 });
        ctx = Cap.S.ctx; Cap.vignette(ctx, 0.45);
      } else {
        S.advance((s.speed === undefined ? 1 : s.speed) / FPS);
        ctx = S.frame({ vig: o.vig === undefined ? 0.5 : o.vig });
      }
      S.caps(ctx, t, o.caps || []);
      if (o.over) o.over(ctx, t, i);
      if (o.badge !== false && t > 0.5 && t < o.end) S.badge(ctx, t - 0.5, o.badge);
      for (const ft of flashes) if (t >= ft && t < ft + 0.12) Cap.flash(ctx, 0.4 * (1 - (t - ft) / 0.12), '#fff');
      if (t >= o.end) Cap.endCard(ctx, t - o.end, o.endOpts);
    }, { audio: o.audio, snaps: o.snaps || [], sheets: o.sheets || [], bitrate: o.bitrate });
  };
})();
