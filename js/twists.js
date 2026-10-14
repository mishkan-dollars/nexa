// NEXA: «удивляющие штуки» миссий 8–47 — ядро. По одной заметной механике на миссию (описание: MISSION_TWISTS.md).
// Модуль не правит игру: он оборачивает Run.prototype.dress (после постройки мира), phase (старт каждой попытки сектора), recover (после смерти),
// finish (конец миссии). Сами штуки лежат в js/twists-m8.js (8–16), twists-m17.js (17–32), twists-m33.js (33–47) и регистрируются как
// Twists.add(id, { name, setup(r,T), phase(r,T,name), tick(r,T,dt), reset(r,T), finish(r,T,done) }).
// T — состояние штуки в одном прохождении (r.twx): T.s — её данные, T.after / T.att — таймеры и уборка «на попытку» (сбрасываются при смерти и на старте сектора).
// Любая ошибка внутри штуки ловится и логируется — миссия идёт дальше. ?twists=0 выключает всё; ?twists=19,21 — только перечисленные номера.
// Миссия 48 не затрагивается (диапазон 8–47). Весь видимый текст — английский исходник, переводы RU/DE — js/i18n-twists.js.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.Run) return;
  const P = C.Run.prototype;
  const QS = location.search;
  const qm = /[?&]twists=([^&]*)/.exec(QS);
  const OFF = !!qm && (qm[1] === '0' || qm[1] === 'off' || qm[1] === 'false');
  const ONLY = qm && /^[\d,]+$/.test(qm[1]) && qm[1] !== '0' ? qm[1].split(',').map(Number) : null;
  const REG = {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const hyp = Math.hypot;

  const API = window.Twists = {
    on: !OFF, only: ONLY, reg: REG, clamp, rnd,
    add(id, def) { def.id = id; REG[id] = def; return def; },
    has: (id) => !!REG[id],
    active(id) { return API.on && id >= 8 && id <= 47 && !!REG[id] && (!ONLY || ONLY.indexOf(id) >= 0); }
  };

  // разовые награды (игрушка, эмоция): флажок в localStorage, чтобы повторное прохождение не фармило кредиты
  const CKEY = 'nexaTwists';
  const cread = () => { try { return JSON.parse(localStorage.getItem(CKEY)) || {}; } catch (e) { return {}; } };
  API.claimed = (k) => !!cread()[k];
  API.claim = (k) => { const d = cread(); d[k] = 1; try { localStorage.setItem(CKEY, JSON.stringify(d)); } catch (e) { /* ignore */ } };

  // ------------------------------------------------------------ стили (инъекция, чтобы не трогать styles.css)
  const css = document.createElement('style');
  css.id = 'tw-css';
  css.textContent = [
    '.tw-panel { position: absolute; z-index: 7; pointer-events: none; font: 400 12px/1.55 var(--display, monospace); letter-spacing: .1em; color: #e8e8e8; text-shadow: 0 1px 2px #000; }',
    '.tw-box { background: rgba(0,0,0,.72); border: 1px solid rgba(255,255,255,.32); padding: 12px 16px; max-width: min(520px, 86vw); }',
    '.tw-box h3 { margin: 0 0 8px; font: 700 12px var(--display, monospace); letter-spacing: .26em; color: #fff; border-bottom: 1px solid rgba(255,255,255,.25); padding-bottom: 6px; }',
    '.tw-box p { margin: 0; white-space: pre-wrap; }',
    '.tw-box b { color: #fff; }',
    '.tw-rows p { display: flex; justify-content: space-between; gap: 22px; } .tw-rows b { text-align: right; }',
    '.tw-box em { font-style: normal; color: var(--red, #ef4b45); }',
    '.tw-fade { opacity: 0; transition: opacity .6s ease; } .tw-fade.on { opacity: 1; }',
    '.tw-corner { right: max(16px, env(safe-area-inset-right)); top: 150px; }',
    '.tw-left { left: max(20px, env(safe-area-inset-left)); top: 30%; }',
    '.tw-mid { left: 50%; top: 34%; transform: translateX(-50%); text-align: center; }',
    '.tw-big { font: 900 clamp(26px, 6vw, 64px)/1 var(--display, monospace); letter-spacing: .14em; color: #fff; text-shadow: 0 0 18px rgba(0,0,0,.9); }',
    '.tw-red { color: var(--red, #ef4b45); }',
    '.tw-cards { position: absolute; z-index: 8; inset: 0; display: grid; place-items: center; background: rgba(0,0,0,.66); pointer-events: auto; }',
    '.tw-cards > div { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; max-width: 94vw; }',
    '.tw-cards h2 { width: 100%; text-align: center; margin: 0 0 6px; font: 700 14px var(--display, monospace); letter-spacing: .3em; color: #fff; }',
    '.tw-cards p.s { width: 100%; text-align: center; margin: 0 0 12px; font-size: 11px; letter-spacing: .14em; color: rgba(255,255,255,.65); }',
    '.tw-card { width: min(190px, 28vw); min-height: 120px; padding: 14px 12px; border: 1px solid rgba(255,255,255,.45); background: rgba(10,10,10,.9); color: #fff; cursor: pointer; font: 400 11px/1.5 var(--display, monospace); letter-spacing: .08em; text-align: left; }',
    '.tw-card:hover, .tw-card.sel { background: #fff; color: #000; }',
    '.tw-card b { display: block; font-size: 13px; letter-spacing: .16em; margin-bottom: 8px; }',
    '.tw-card i { display: block; font-style: normal; opacity: .6; margin-bottom: 6px; font-size: 10px; }',
    '.tw-dark { position: absolute; inset: 0; z-index: 4; pointer-events: none; background: #000; opacity: 0; }',
    '.tw-flashred { position: absolute; inset: 0; z-index: 5; pointer-events: none; opacity: 0; background: radial-gradient(ellipse at center, rgba(200,0,0,0) 30%, rgba(200,0,0,.55) 100%); }'
  ].join('\n');
  document.head.appendChild(css);

  const mk = (cls, html) => { const e = document.createElement('div'); e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const tr = (s) => (window.I18N && window.I18N.t ? window.I18N.t(s) : s);

  // ------------------------------------------------------------ состояние штуки в одном прохождении
  class TW {
    constructor(r, def) {
      this.r = r; this.id = def.id; this.def = def; this.s = {}; this.timers = []; this.cl = []; this.perm = [];
      this.ph = ''; this.attempt = 0; this.t = 0; this.broken = false; this.errs = 0;
    }
    // таймер «через сек» в игровом времени (учитывает паузу, замедление и блокировки); сбрасывается вместе с попыткой
    after(sec, fn) { const t = { t: sec, fn, per: 0 }; this.timers.push(t); return t; }
    every(sec, fn) { const t = { t: sec, fn, per: sec }; this.timers.push(t); return t; }
    cancel(t) { const i = this.timers.indexOf(t); if (i >= 0) this.timers.splice(i, 1); }
    // уборка «на попытку»: выполняется при смерти и на старте следующей попытки сектора
    att(fn) { this.cl.push(fn); return fn; }
    clean() {
      this.timers.length = 0;
      const list = this.cl.splice(0);
      for (let i = list.length - 1; i >= 0; i -= 1) { try { list[i](); } catch (e) { console.warn('[twist ' + this.id + ' clean]', e); } }
    }
    // меш/группа в сцене, исчезающие вместе с попыткой (keep = true — живут до конца миссии)
    add(obj, keep) { const r = this.r; if (!obj || !r.scene) return obj; r.scene.add(obj); if (!keep) this.att(() => { r.scene.remove(obj); }); return obj; }
    // твёрдый ящик с коллайдером (сносится вместе с попыткой)
    solid(x, y, z, w, h, d, color, unlit) {
      const r = this.r, m = r.box(x, y, z, w, h, d, color, true, unlit);
      this.att(() => { this.gone(m); });
      return m;
    }
    gone(m) {
      if (!m) return;
      const c = m.userData && m.userData.col;
      if (c) { c.off = true; const i = this.r.colliders.indexOf(c); if (i >= 0) this.r.colliders.splice(i, 1); }
      m.visible = false; if (m.parent) m.parent.remove(m);
    }
    // HTML-панель поверх HUD (исчезает вместе с попыткой; keep — до конца миссии)
    panel(cls, html, keep) {
      const r = this.r, el = mk('tw-panel ' + cls, html);
      r.layer.appendChild(el);
      if (!keep) this.att(() => { el.remove(); });
      return el;
    }
    // клавиша (одноразовое нажатие; не работает в катсцене/паузе/смерти); слушатель снимается вместе с миссией
    key(code, fn) {
      const r = this.r;
      r.on(document, 'keydown', (e) => { if (e.code === code && !e.repeat && !r.locked && !r.paused && r.entered && !this.broken) safe(this, 'key', () => fn(e)); });
    }
    // кнопка для сенсорного управления (рядом с остальными m-btn)
    btn(text, css, fn) {
      const r = this.r, tu = r.qs('.m-touchui'); if (!tu) return null;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'm-btn tw-btn'; b.textContent = text; b.style.cssText = css || '';
      tu.appendChild(b);
      r.on(b, 'pointerdown', (e) => { e.preventDefault(); if (!r.locked && !r.paused) safe(this, 'btn', fn); });
      return b;
    }
    // интерактив с done(): помечает использованным и убирает из списка (так делает и r.useOnce — бот и подсказки не цепляются за него дальше)
    interact(def) {
      const r = this.r, it = r.interact(def);
      it.done = () => { it.used = true; const i = r.interactables.indexOf(it); if (i >= 0) r.interactables.splice(i, 1); };
      return it;
    }
    sec() { const M = this.r.mm; return M ? M.cur : null; }
    // сектор по имени фазы ('s3') — на старте попытки M.cur ещё указывает на прошлый сектор
    secOf(name) { const M = this.r.mm, m = /^s(\d+)$/.exec(name || ''); return M && m ? M.secs[+m[1]] || null : null; }
    foes(filter) { const cb = this.r.cb; return cb ? cb.enemies.filter((e) => !e.dead && !e.friendly && !(e.t && e.t.passive) && (!filter || filter(e))) : []; }
    // точки появления врагов внутри сектора (не за стеной, не в укрытии, не вплотную к игроку)
    spawnPts(sec, n, minD) {
      const r = this.r, hw = (sec.W || 24) / 2 - 2.6, out = [];
      for (let i = 0; i < n; i += 1) {
        let best = null;
        for (let t = 0; t < 24 && !best; t += 1) {
          const x = (Math.random() * 2 - 1) * hw, z = sec.zB + 3 + Math.random() * Math.max(2, sec.D - 6);
          if (r.blockedE(x, z) || (r.inRoom && r.inRoom(x, z)) || hyp(x - r.p.x, z - r.p.z) < (minD || 7) || out.some((o) => hyp(o[0] - x, o[1] - z) < 1.4)) continue;
          best = [x, z];
        }
        out.push(best || [(Math.random() * 2 - 1) * hw, sec.zB + 4 + Math.random() * 6]);
      }
      return out;
    }
    // подкрепление в секторе: types — ['grunt','rusher',...]
    wave(sec, types, gap) {
      const r = this.r, pts = this.spawnPts(sec, types.length);
      return r.spawnWave(types.map((t, i) => [Array.isArray(t) ? t[0] : t, pts[i][0], pts[i][1], Array.isArray(t) ? t[1] : undefined]), { gap: gap || 0.4 });
    }
    // «призрак»: полупрозрачная фигура игрока (не враг). g.set(x, z, yaw) — yaw в формате NPC (вперёд = sin, cos); g.rm() — убрать
    ghost(o) {
      o = o || {};
      const r = this.r, T3 = window.THREE, n = r.npc(0, 0, 0);
      const mat = new T3.MeshBasicMaterial({ color: o.color || 0xffffff, transparent: true, opacity: o.opacity || 0.3, depthWrite: false });
      n.g.traverse((m) => { if (m.isMesh) { m.material = mat; m.castShadow = false; } });
      n.g.visible = false;
      const gh = { n, mat,
        set(x, z, yaw) { n.g.position.set(x, 0, z); n.yaw = yaw; n.g.rotation.y = yaw; n.creeping = true; },
        show(v) { n.g.visible = !!v; if (!v) n.creeping = false; },
        rm() { n.g.visible = false; if (n.g.parent) n.g.parent.remove(n.g); const i = r.npcs.indexOf(n); if (i >= 0) r.npcs.splice(i, 1); } };
      return gh;
    }
    // подсказка/цель/реплика
    hint(text, sec) { this.r.hint(text, sec || 3.6); }
    say(who, text, hold) { return this.r.say(who, text, hold); }
    bonus(n, why) { const r = this.r; r.twBonus = (r.twBonus || 0) + n; r.toast('+' + n + ' CR  ' + (why || ''), 2.4); }
    // текстовая табличка в мире; текст переводится на текущий язык (o.bill — всегда лицом к камере, o.lines — максимум строк, по умолчанию 1)
    label(text, x, y, z, o) {
      o = o || {};
      const T3 = window.THREE, L = o.lines || 1, w = o.w || 2.4;
      const c = document.createElement('canvas'); c.width = 512; c.height = 128 * L;
      const tex = new T3.CanvasTexture(c);
      const m = new T3.Mesh(new T3.PlaneGeometry(w, w / 4 * L), new T3.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
      m.position.set(x, y, z); if (o.yaw !== undefined) m.rotation.y = o.yaw;
      m.renderOrder = 6;
      m.userData.tw = { canvas: c, tex, o, L, text: '' };
      this.relabel(m, text);
      this.add(m, o.keep);
      if (o.bill) (this.bills || (this.bills = [])).push(m);
      return m;
    }
    relabel(m, text) {
      const d = m.userData.tw, c = d.canvas, o = d.o, L = d.L, g = c.getContext('2d'), s = tr(text), H = 128 * L;
      d.text = text;
      g.clearRect(0, 0, 512, H);
      if (o.bg !== false) { g.fillStyle = o.bg || 'rgba(0,0,0,.62)'; g.fillRect(0, 22, 512, H - 44); }
      g.fillStyle = o.color || '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      let fs = o.size || 46, lines = [s];
      for (;;) {
        g.font = 'bold ' + fs + 'px "Courier New", monospace';
        lines = []; let cur = '';
        s.split(' ').forEach((wd) => { const t = cur ? cur + ' ' + wd : wd; if (cur && g.measureText(t).width > 484) { lines.push(cur); cur = wd; } else cur = t; });
        lines.push(cur);
        if ((lines.length <= L && fs * 1.15 * lines.length <= H - 40) || fs <= 14) break;
        fs -= 2;
      }
      const lh = fs * 1.15, y0 = H / 2 - lh * (lines.length - 1) / 2 + 2;
      lines.forEach((ln, i) => g.fillText(ln, 256, y0 + i * lh));
      d.tex.needsUpdate = true;
    }
    // HTML-текст в виде «печатающегося» терминала: строки появляются по одной
    type(el, lines, step, done) {
      let i = 0;
      const t = this.every(step || 0.45, () => {
        if (i >= lines.length) { this.cancel(t); done && done(); return; }
        const p = document.createElement('p'), ln = lines[i];
        if (typeof ln === 'string') p.textContent = ln; else { p.innerHTML = ln.html; if (ln.cls) p.className = ln.cls; }
        el.appendChild(p); i += 1;
      });
      return t;
    }
  }
  API.TW = TW;

  function safe(T, what, fn) {
    if (!T || T.broken) return undefined;
    try { return fn(); } catch (e) {
      T.errs += 1;
      console.warn('[twist ' + T.id + ' ' + what + ']', e);
      if (T.errs >= 4) { T.broken = true; try { T.clean(); } catch (e2) { /* ignore */ } }
    }
    return undefined;
  }

  // ------------------------------------------------------------ статистика героя (для досье в миссии 19): локально, без сети
  const SKEY = 'nexaDossier';
  function readStats() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SKEY)); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') d = {};
    return { tm: d.tm && typeof d.tm === 'object' ? d.tm : {}, kills: d.kills | 0, deaths: d.deaths | 0, shots: d.shots && typeof d.shots === 'object' ? d.shots : {}, time: +d.time || 0, runs: d.runs | 0, heads: d.heads | 0, since: d.since || 0 };
  }
  function writeStats(d) { try { localStorage.setItem(SKEY, JSON.stringify(d)); } catch (e) { /* ignore */ } }
  API.stats = function (r) {
    const d = readStats(), s = r && r.twStat;
    if (s) { d.kills += s.kills; d.deaths += s.deaths; d.time += s.time; d.heads += s.heads; Object.keys(s.shots).forEach((k) => { d.shots[k] = (d.shots[k] || 0) + s.shots[k]; }); }
    return d;
  };
  function trackAttach(r) {
    const s = r.twStat = { kills: 0, deaths: 0, time: 0, heads: 0, shots: {}, saved: false };
    let wired = false;
    r.hooks.push((dt) => {
      if (r.entered && !r.locked) s.time += dt;
      if (!wired && r.cb) { wired = true; r.cb.killHooks.push((e, head) => { if (!e.friendly && !(e.t && e.t.passive)) { s.kills += 1; if (head) s.heads += 1; } }); }
    });
  }
  function trackSave(r, done) {
    const s = r.twStat; if (!s || s.saved) return;
    s.saved = true;
    const d = readStats();
    d.kills += s.kills; d.deaths += s.deaths; d.time += s.time; d.heads += s.heads; d.runs += 1;
    Object.keys(s.shots).forEach((k) => { d.shots[k] = (d.shots[k] || 0) + s.shots[k]; });
    if (done && Number(r.taskId) > 0) { d.tm = d.tm || {}; const id = Number(r.taskId); d.tm[id] = d.tm[id] ? Math.min(d.tm[id], s.time) : s.time; }
    if (!d.since) d.since = Date.now();
    writeStats(d);
  }
  const shoot0 = P.shoot;
  if (shoot0) P.shoot = function (w) { this.twShotT = this.time; const s = this.twStat; if (s && w && w.id) s.shots[w.id] = (s.shots[w.id] || 0) + 1; return shoot0.apply(this, arguments); };
  const die0 = P.die;
  if (die0) P.die = function () { const s = this.twStat; if (s && !this.dead) s.deaths += 1; return die0.apply(this, arguments); };

  // ------------------------------------------------------------ подключение к циклу миссии
  function attach(r) {
    const id = Number(r.taskId);
    if (!API.on || !(id >= 1 && id <= 47) || String(r.taskId) !== String(id)) return;
    trackAttach(r);
    if (!API.active(id)) return;
    const def = REG[id], T = r.twx = new TW(r, def);
    r.hooks.push((dt) => tick(r, T, dt));
    safe(T, 'setup', () => def.setup && def.setup(r, T));
  }
  function tick(r, T, dt) {
    if (T.broken || r.disposed) return;
    if (r.entered && !r.locked) T.t += dt;
    if (T.bills && r.camera) for (let i = T.bills.length - 1; i >= 0; i -= 1) { const m = T.bills[i]; if (!m.parent) T.bills.splice(i, 1); else m.quaternion.copy(r.camera.quaternion); }
    if (!r.locked && !r.paused && T.timers.length) {
      for (let i = T.timers.length - 1; i >= 0; i -= 1) {
        const t = T.timers[i]; if (!t) continue;
        t.t -= dt;
        if (t.t <= 0) {
          if (t.per) t.t += t.per; else T.timers.splice(i, 1);
          safe(T, 'timer', () => t.fn(t));
        }
      }
    }
    if (r.entered) safe(T, 'tick', () => T.def.tick && T.def.tick(r, T, dt));
  }
  API.attach = attach;

  const dress0 = P.dress;
  P.dress = function () {
    const res = dress0 ? dress0.apply(this, arguments) : undefined;
    try { attach(this); } catch (e) { console.warn('[twists attach]', e); }
    return res;
  };

  // каждый появившийся враг проходит через def.enemy(r, T, e) (личные привязки штук: слепота, баллон, предатель)
  const enemy0 = P.enemy;
  P.enemy = function () {
    const e = enemy0.apply(this, arguments), T = this.twx;
    if (e && T && !T.broken && T.def.enemy) safe(T, 'enemy', () => T.def.enemy(this, T, e));
    return e;
  };

  // старт каждой попытки сектора (включая повторы после смерти)
  const phase0 = P.phase;
  P.phase = function (name, fn, skip) {
    const self = this;
    return phase0.call(this, name, function (r) {
      const T = self.twx;
      if (T && !T.broken) { T.attempt += 1; T.ph = name; T.clean(); safe(T, 'phase', () => T.def.phase && T.def.phase(self, T, name)); }
      return fn(r);
    }, skip);
  };
  // после смерти: состояние откатилось к чекпоинту — штука убирает свои временные объекты
  const rec0 = P.recover;
  P.recover = async function () {
    const res = await rec0.apply(this, arguments);
    const T = this.twx;
    if (T && !T.broken && !this.disposed) { T.clean(); safe(T, 'reset', () => T.def.reset && T.def.reset(this, T)); }
    return res;
  };
  // конец миссии: бонусные кредиты штук идут вместе с наградой, статистика героя сохраняется
  const fin0 = P.finish;
  P.finish = function (done) {
    if (!this.disposed) {
      const T = this.twx;
      if (T && !T.broken) safe(T, 'finish', () => T.def.finish && T.def.finish(this, T, done));
      if (done && this.twBonus > 0) this.intBonus = (this.intBonus || 0) + this.twBonus;
      this.twBonus = 0;
      try { trackSave(this, done); } catch (e) { /* ignore */ }
    }
    return fin0.apply(this, arguments);
  };
}());
