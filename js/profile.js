// NEXA/OS: профиль игрока — ник, цвет/аватар, уровень и ВСЯ статистика за игру. Хранится локально (localStorage 'nexaProfile'), наружу уходит только публичная
// карточка (ник, цвет, уровень) собеседнику по сети. Счётчики идут из реальных событий игры через обёртки над Run.prototype / Missions.start — логика боя не тронута.
(function () {
  'use strict';
  const KEY = 'nexaProfile';
  const COLORS = ['#ff3b30', '#ff9500', '#ffd60a', '#30d158', '#32ade6', '#5e5ce6', '#bf5af2', '#ffffff'];
  const RANKS = ['SUBJECT', 'OPERATIVE', 'AGENT', 'SPECIALIST', 'VETERAN', 'ELITE', 'LEGEND'];
  const NUMS = ['playSec', 'sessions', 'missionSec', 'missionsStarted', 'missionsDone', 'missionsFailed', 'sandboxStarts', 'sandboxSec', 'kills', 'headshots', 'deaths',
    'shots', 'hits', 'damageTaken', 'gadgets', 'emotes', 'matches', 'onlineSec', 'msgSent', 'msgGot', 'coopKills', 'hostMatches', 'coopMissionsDone'];
  const clampN = (v, hi) => { v = Number(v); return isFinite(v) ? Math.max(0, Math.min(hi || 1e9, Math.floor(v))) : 0; };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* без хранилища */ } };

  const NAME_RE = (function () { try { return new RegExp('^[\\p{L}\\p{N}_ -]{2,16}$', 'u'); } catch (e) { return /^[A-Za-z0-9_ -]{2,16}$/; } }());
  function normName(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function validName(s) {
    const n = normName(s);
    if (n.length < 2) return { ok: false, err: 'NAME_SHORT' };
    if (Array.from(n).length > 16) return { ok: false, err: 'NAME_LONG' };
    if (!NAME_RE.test(n)) return { ok: false, err: 'NAME_CHARS' };
    return { ok: true, name: n };
  }
  const NAME_MSG = {
    NAME_SHORT: 'The name needs at least 2 characters.',
    NAME_LONG: 'The name can have up to 16 characters.',
    NAME_CHARS: 'Use only letters, digits, space, _ and -.',
    NAME_OK: 'Name saved.'
  };

  let P = null, dirty = false, listeners = [];
  function fresh() {
    const o = { v: 1, name: 'SUBJECT ' + String(1000 + Math.floor(Math.random() * 9000)), color: COLORS[Math.floor(Math.random() * 5)], created: Date.now(), stats: {}, shotsBy: {}, doneIds: [] };
    NUMS.forEach((k) => { o.stats[k] = 0; });
    return o;
  }
  // приведение к допустимому виду (и для импорта): белый список ключей, числа в пределах, имя по правилам
  function sanitize(src) {
    const o = fresh();
    if (!src || typeof src !== 'object') return o;
    const nm = validName(src.name);
    if (nm.ok) o.name = nm.name;
    if (typeof src.color === 'string' && /^#[0-9a-f]{6}$/i.test(src.color)) o.color = src.color.toLowerCase();
    o.created = clampN(src.created, 4e12) || o.created;
    const st = src.stats || {};
    NUMS.forEach((k) => { o.stats[k] = clampN(st[k]); });
    if (src.shotsBy && typeof src.shotsBy === 'object') Object.keys(src.shotsBy).slice(0, 12).forEach((k) => { if (/^[a-z0-9]{2,12}$/.test(k)) o.shotsBy[k] = clampN(src.shotsBy[k]); });
    if (Array.isArray(src.doneIds)) o.doneIds = src.doneIds.map(Number).filter((n) => n >= 1 && n <= 99).filter((n, i, a) => a.indexOf(n) === i).slice(0, 60);
    return o;
  }
  function load() {
    let raw = lsGet(KEY), obj = null;
    try { obj = raw ? JSON.parse(raw) : null; } catch (e) { obj = null; }
    P = obj ? sanitize(obj) : fresh();
    if (!obj) { dirty = true; save(); }
    return P;
  }
  function save() { if (!dirty || !P) return; dirty = false; lsSet(KEY, JSON.stringify(P)); }
  function changed() { dirty = true; listeners.forEach((f) => { try { f(P); } catch (e) { /* слушатель не должен ломать счётчики */ } }); }
  const get = () => P || load();

  function count(k, n) {
    const p = get();
    if (!(k in p.stats)) return;
    p.stats[k] = clampN(p.stats[k] + (n === undefined ? 1 : n));
    changed();
  }

  // ------------------------------------------------------------------ уровень
  function xp(s) {
    s = s || get().stats;
    return Math.floor(s.missionsDone * 120 + s.kills * 4 + s.headshots * 2 + s.hits * 0.5 + s.playSec / 60 + s.matches * 60 + s.msgSent * 0.5 + s.sandboxStarts * 5);
  }
  function levelInfo() {
    const x = xp(), lv = 1 + Math.floor(Math.sqrt(x / 40)), lo = 40 * (lv - 1) * (lv - 1), hi = 40 * lv * lv;
    return { level: Math.min(999, lv), xp: x, lo, hi, pct: Math.max(0, Math.min(1, (x - lo) / (hi - lo))), rank: RANKS[Math.min(RANKS.length - 1, Math.floor((lv - 1) / 4))] };
  }
  function publicInfo() { const p = get(); return { name: p.name, color: p.color, level: levelInfo().level }; }

  function setName(s) {
    const v = validName(s);
    if (!v.ok) return v;
    get().name = v.name; changed(); save();
    return { ok: true, name: v.name };
  }
  function setColor(c) { if (COLORS.indexOf(c) < 0) return false; get().color = c; changed(); save(); return true; }

  // ------------------------------------------------------------------ экспорт / импорт (JSON-текст: работает и там, где скачивание файлов запрещено)
  function exportJSON() { return JSON.stringify(get()); }
  function importJSON(text) {
    let o;
    try { o = JSON.parse(String(text || '').trim()); } catch (e) { return { ok: false, err: 'IMPORT_BAD' }; }
    if (!o || typeof o !== 'object' || o.v !== 1 || !o.stats || typeof o.stats !== 'object') return { ok: false, err: 'IMPORT_BAD' };
    P = sanitize(o); dirty = true; save(); changed();
    return { ok: true };
  }
  function reset() { P = fresh(); dirty = true; save(); changed(); }

  // ------------------------------------------------------------------ отображение
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function avatar(name, color, px) {
    const ch = Array.from(String(name || '?').trim())[0] || '?';
    return '<span class="pf-av" style="--c:' + esc(color || '#ff3b30') + ';--s:' + (px || 44) + 'px" translate="no" aria-hidden="true">' + esc(ch.toUpperCase()) + '</span>';
  }
  const num = (v) => '<b translate="no">' + esc(v) + '</b>';
  function timeHTML(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h ? '<span>' + num(h) + ' hr ' + num(String(m).padStart(2, '0')) + ' min</span>' : '<span>' + num(m) + ' min</span>';
  }
  function derived() {
    const s = get().stats, p = get();
    let fav = '', best = 0;
    Object.keys(p.shotsBy).forEach((k) => { if (p.shotsBy[k] > best) { best = p.shotsBy[k]; fav = k; } });
    return { acc: s.shots ? Math.round(s.hits / s.shots * 100) : 0, kd: s.deaths ? (s.kills / s.deaths).toFixed(2) : String(s.kills), fav: fav ? ({ glock: 'GLOCK 17', ak: 'AK-47', shotgun: 'SHOTGUN', sniper: 'SNIPER' }[fav] || fav.toUpperCase()) : '' };
  }
  function row(label, valueHTML) { return '<div class="pf-row"><span>' + label + '</span>' + valueHTML + '</div>'; }
  // карточка статистики: кладётся в экран «ПРОФИЛЬ» онлайн-лобби
  function renderStats() {
    const p = get(), s = p.stats, d = derived();
    const sec = (title, rows) => '<section class="pf-sec"><h4>' + title + '</h4>' + rows.join('') + '</section>';
    return '<div class="pf-grid">' +
      sec('MISSIONS', [row('COMPLETED', num(s.missionsDone)), row('FAILED / ABORTED', num(s.missionsFailed)), row('STARTED', num(s.missionsStarted)), row('SANDBOX SESSIONS', num(s.sandboxStarts))]) +
      sec('COMBAT', [row('KILLS', num(s.kills)), row('HEADSHOTS', num(s.headshots)), row('DEATHS', num(s.deaths)), row('KILL / DEATH RATIO', num(d.kd)), row('DAMAGE TAKEN', num(s.damageTaken))]) +
      sec('SHOOTING', [row('SHOTS FIRED', num(s.shots)), row('HITS', num(s.hits)), row('ACCURACY', '<b translate="no">' + d.acc + '%</b>'), row('FAVORITE WEAPON', d.fav ? '<b translate="no">' + esc(d.fav) + '</b>' : '<b>—</b>'), row('GADGETS THROWN', num(s.gadgets)), row('EMOTES PLAYED', num(s.emotes))]) +
      sec('TIME', [row('TIME IN GAME', timeHTML(s.playSec)), row('IN MISSIONS', timeHTML(s.missionSec)), row('IN SANDBOX', timeHTML(s.sandboxSec))]) +
      sec('ONLINE', [row('ONLINE MATCHES', num(s.matches)), row('AS HOST', num(s.hostMatches)), row('TIME TOGETHER', timeHTML(s.onlineSec)), row('CO-OP KILLS', num(s.coopKills)), row('MESSAGES SENT', num(s.msgSent)), row('MESSAGES RECEIVED', num(s.msgGot))]) +
      '</div>';
  }

  // ------------------------------------------------------------------ подключение к событиям игры
  let hooked = false;
  function hook() {
    if (hooked) return;
    const M = window.Missions, C = M && M._core, Run = C && C.Run;
    if (!M || !Run) return;
    hooked = true;
    const proto = Run.prototype, p0 = (name, fn) => { const o = proto[name]; if (typeof o !== 'function') return; proto[name] = function () { try { fn.apply(this, arguments); } catch (e) { /* статистика не должна ломать бой */ } return o.apply(this, arguments); }; };
    // выстрелы и попадания: дробовик — один выстрел, засчитывается, если хоть одна дробина попала (как в песочнице)
    const shoot0 = proto.shoot, hit0 = proto.hitmark;
    if (shoot0 && hit0) {
      let shotHit = false;
      proto.hitmark = function (head) { shotHit = true; return hit0.call(this, head); };
      proto.shoot = function (w) {
        shotHit = false;
        const r = shoot0.call(this, w);
        try { const s = get().stats; s.shots += 1; if (shotHit) s.hits += 1; if (w && w.id) { const b = get().shotsBy; b[w.id] = (b[w.id] || 0) + 1; } changed(); } catch (e) { /* не критично */ }
        return r;
      };
    }
    const kill0 = proto.killEnemy;
    if (kill0) proto.killEnemy = function (e, head) {
      const was = e && !e.dead;
      const r = kill0.apply(this, arguments);
      try {
        if (was && e && !e.friendly && !e.noCredit && !(e.t && e.t.passive)) {
          const s = get().stats; s.kills += 1; if (head) s.headshots += 1;
          if (window.NexaCoop && NexaCoop.active) s.coopKills += 1;
          changed();
        }
      } catch (er) { /* не критично */ }
      return r;
    };
    p0('die', function () { if (!this.dead) get().stats.deaths += 1; changed(); });
    p0('hurt', function (amt) { if (!this.dead && !this.god && !(this.cineDepth > 0) && !this.ending && amt > 0) { get().stats.damageTaken += Math.round(amt * (this.mercy || 1)); changed(); } });
    p0('throwGadget', function () { get().stats.gadgets += 1; changed(); });
    // старт / конец заданий и песочницы
    const start0 = M.start;
    M.start = function (taskId, opts) {
      opts = Object.assign({}, opts || {});
      const sandbox = taskId === 'sandbox' || taskId === 'coopbox', story = /^\d+$/.test(String(taskId));
      const done0 = opts.onComplete, exit0 = opts.onExit;
      let ended = false;
      opts.onComplete = function (id) { if (!ended) { ended = true; try { if (story) { const p = get(); p.stats.missionsDone += 1; if (window.NexaCoop && NexaCoop.active) p.stats.coopMissionsDone += 1; const n = Number(id); if (p.doneIds.indexOf(n) < 0) p.doneIds.push(n); changed(); save(); } } catch (e) { /* ok */ } } return done0 && done0.apply(this, arguments); };
      opts.onExit = function (id) { if (!ended) { ended = true; try { if (story) { get().stats.missionsFailed += 1; changed(); save(); } } catch (e) { /* ok */ } } return exit0 && exit0.apply(this, arguments); };
      const run = start0.call(this, taskId, opts);
      try { if (run) { const s = get().stats; if (sandbox) s.sandboxStarts += 1; else if (story) s.missionsStarted += 1; run.__pfSandbox = sandbox; changed(); } } catch (e) { /* ok */ }
      return run;
    };
    // эмоции: считаем новую сессию танца
    setInterval(() => {
      const r = M.current;
      if (!r || !r.em) return;
      const ses = r.em.ses;
      if (ses && ses !== r.__pfEm) { r.__pfEm = ses; get().stats.emotes += 1; changed(); }
      if (!ses) r.__pfEm = null;
    }, 400);
  }

  // время: игра на экране (вкладка видима), в заданиях и в песочнице, онлайн вместе
  function tick() {
    if (document.hidden) return;
    const s = get().stats, r = window.Missions && Missions.current;
    s.playSec += 1;
    if (r && r.entered && !r.paused && !r.disposed) { if (r.__pfSandbox) s.sandboxSec += 1; else s.missionSec += 1; }
    if (window.NexaNet && NexaNet.isOpen) s.onlineSec += 1;
    dirty = true;
    if (s.playSec % 15 === 0) save();
  }
  function init() {
    load();
    count('sessions');
    hook();
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('pagehide', save);
  }

  window.NexaProfile = {
    COLORS, RANKS, NAME_MSG, get, count, setName, setColor, validName, publicInfo, level: levelInfo, xp, avatar, renderStats, exportJSON, importJSON, reset, save, derived, sanitize,
    onChange(f) { listeners.push(f); }, offChange(f) { listeners = listeners.filter((x) => x !== f); }, text: (c) => NAME_MSG[c] || String(c || '')
  };
  init();
}());
