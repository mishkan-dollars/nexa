// NEXA: окно выбора режима в онлайн-лобби (открывается из js/onlinelobby.js при «PLAY» / «MODE»): категории СЮЖЕТ / ПЕСОЧНИЦА / КАЖДЫЙ САМ ЗА СЕБЯ / PVP / HIGH-LOW, сетка заданий 1–48 с обложками (js/modecovers.js),
// фильтры и поиск, предпросмотр справа, настройки PvP. Клавиатура: стрелки по сетке, «/» — поиск, Esc — закрыть; карточки — обычные <button>, так что геймпад (padnav.js) и тач работают как везде.
(function () {
  'use strict';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const $ = (el, s) => el.querySelector(s);
  const CATS = [['story', 'STORY'], ['sandbox', 'SANDBOX'], ['ffa', 'FREE FOR ALL'], ['pvp', 'PVP'], ['hl', 'HIGH / LOW']];
  const PVP = [['ffa', 'FREE FOR ALL'], ['team', 'TEAM BATTLE'], ['duel', 'DUEL 1V1']];
  const WLAB = { all: 'ALL WEAPONS', random: 'RANDOM', glock: 'GLOCK', ak: 'AK', shotgun: 'SHOTGUN', sniper: 'SNIPER' };
  const MLAB = { rand: 'RANDOM', vote: 'VOTE', depot: 'DEPOT', lab: 'LAB', roof: 'ROOF', hall: 'TRAINING HALL', yard: 'SCRAPYARD' };
  const DESC = {
    sandbox: 'Waves of enemies in the training hall. Ammo never runs out. Hold the line with your friends.',
    hl: 'The table game. Bots fill empty seats.',
    ffa: 'Everyone against everyone, 2–6 players, no bots. Press READY: the game finds an open match or opens one. First to the kill limit, or the best score at time-out, wins. Respawn in 3 seconds.',
    team: 'Two teams, kills add up. Friendly fire is off by default. Respawn in 3 seconds.',
    duel: 'One on one. Pure aim: first to the limit wins.'
  };
  const diffOf = (id) => (id === 48 ? 5 : Math.max(1, Math.min(5, Math.ceil(id / 10))));
  const missions = () => (window.Missions && Missions._core && Missions._core.MISSIONS) || {};
  const metaOf = (id) => (window.Missions && Missions.META && Missions.META[id]) || null;
  function progress() {
    try { const d = JSON.parse(localStorage.getItem('nexaProgress') || 'null') || {}; return { done: new Set((d.completedTasks || []).map(Number)), cur: Number(d.currentTask || d.taskProgress) || 1 }; } catch (e) { return { done: new Set(), cur: 1 }; }
  }
  const stOf = (id, pg) => (pg.done.has(id) || id < pg.cur ? 'DONE' : id === pg.cur ? 'NEW' : 'CLOSED');
  const pips = (n) => '<span class="mp-df" aria-hidden="true">' + [1, 2, 3, 4, 5].map((i) => '<u' + (i <= n ? ' class="on"' : '') + '></u>').join('') + '</span>';

  function open(el, api) {
    const S = api.st(), pg = progress();
    let ids = Object.keys(missions()).map(Number).filter((n) => n >= 1 && n <= 48).sort((a, b) => a - b);
    if (!ids.length) ids = Array.from({ length: 48 }, (_, i) => i + 1);
    const U = { cat: S.mode === 'ffa' ? 'ffa' : S.mode === 'hl' ? 'hl' : S.mode === 'pvp' ? 'pvp' : S.mode === 'mission' ? 'story' : 'sandbox', q: '', fs: 'ALL', fd: 0, sel: '', pvp: window.NexaPvp ? NexaPvp.norm(S.pvp) : { kind: 'ffa', goal: 'k25', wpn: 'all', map: 'arena', ff: 0 } };
    U.sel = U.cat === 'story' ? 'm:' + (S.mission || ids[0]) : U.cat === 'pvp' ? 'mode:' + (U.pvp.kind === 'duel' ? 'duel' : 'team') : 'mode:' + U.cat;
    const syncKind = () => { if (/^mode:(ffa|team|duel)$/.test(U.sel)) U.pvp = NexaPvp.norm(Object.assign({}, U.pvp, { kind: U.sel.slice(5) })); };
    syncKind();
    const root = el; root.classList.add('mp-open');
    function items() {
      if (U.cat === 'story') {
        const q = U.q.trim().toLowerCase();
        return ids.filter((id) => {
          const t = String((missions()[id] || {}).title || '').toLowerCase(), st = stOf(id, pg);
          return (!q || t.indexOf(q) >= 0 || String(id).padStart(2, '0').indexOf(q) >= 0 || String(id) === q) && (U.fs === 'ALL' || st === U.fs) && (!U.fd || diffOf(id) === U.fd);
        }).map((id) => ({ k: 'm:' + id, id }));
      }
      if (U.cat === 'pvp') return PVP.filter((p) => p[0] !== 'ffa').map((p) => ({ k: 'mode:' + p[0], kind: p[0], t: p[1] }));
      if (U.cat === 'ffa') return [{ k: 'mode:ffa', kind: 'ffa', t: 'FREE FOR ALL' }];
      return [{ k: 'mode:' + U.cat, t: (CATS.find((c) => c[0] === U.cat) || [0, ''])[1] }];
    }
    function cardHtml(it) {
      const on = it.k === U.sel, cur = isCur(it);
      if (it.id) {
        const st = stOf(it.id, pg), m = missions()[it.id] || {};
        return '<button type="button" class="mission-row mp-card' + (on ? ' on' : '') + (cur ? ' cur' : '') + ' st-' + st.toLowerCase() + '" data-k="' + it.k + '" aria-label="' + esc(String(it.id).padStart(2, '0') + ' ' + (m.title || '')) + '">' +
          '<canvas class="mp-cv" width="320" height="180"></canvas><span class="mp-cap"><span class="mp-st">' + st + '</span><span class="mp-pl"><span>PLAYERS</span> <em translate="no">2–6</em></span>' + pips(diffOf(it.id)) + '</span>' + (cur ? '<i class="mp-tick"><span>SELECTED</span></i>' : '') + '</button>';
      }
      const pl = it.k === 'mode:duel' ? '2' : '2–6';
      return '<button type="button" class="mission-row mp-card' + (on ? ' on' : '') + (cur ? ' cur' : '') + '" data-k="' + it.k + '" aria-label="' + esc(it.t) + '"><canvas class="mp-cv" width="320" height="180"></canvas><span class="mp-cap"><span class="mp-st">' + (it.kind ? 'PVP' : 'CO-OP') + '</span><span class="mp-pl"><span>PLAYERS</span> <em translate="no">' + pl + '</em></span></span>' + (cur ? '<i class="mp-tick"><span>SELECTED</span></i>' : '') + '</button>';
    }
    function isCur(it) {
      if (it.id) return S.mode === 'mission' && S.mission === it.id;
      if (it.kind === 'ffa') return S.mode === 'ffa';
      if (it.kind) return S.mode === 'pvp' && NexaPvp.norm(S.pvp).kind === it.kind;
      return S.mode === it.k.slice(5);
    }
    function info(k) {
      if (k.indexOf('m:') === 0) {
        const id = k.slice(2) | 0, m = missions()[id] || {}, mt = metaOf(id), st = stOf(id, pg);
        const d = mt && mt.desc ? String(mt.desc).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '') : 'NEXA/OS task ' + String(id).padStart(2, '0') + '.';
        return { t: String(m.title || 'MISSION'), no: id, d, st, pl: '2–6', df: diffOf(id), tag: 'CO-OP MISSION' };
      }
      const key = k.slice(5), c = ModeCovers.MODES[key] || {};
      return { t: c.t || key.toUpperCase(), no: 0, d: DESC[key] || '', st: '', pl: key === 'duel' ? '2' : '2–6', df: 0, tag: c.s || '' };
    }
    function optBtn(act, v, label, on) { return '<button type="button" class="mp-opt' + (on ? ' on' : '') + '" data-o="' + act + '" data-v="' + v + '"><span>' + label + '</span></button>'; }
    function pvpOpts() {
      const P = NexaPvp.norm(U.pvp), G = NexaPvp.GOALS[P.kind];
      const gl = (g) => { const m = /^([kt])(\d+)$/.exec(g); return m[1] === 'k' ? '<em translate="no">' + m[2] + '</em> <span>KILLS</span>' : '<em translate="no">' + m[2] + '</em> <span>MIN</span>'; };
      let h = '<div class="mp-og"><label>GOAL</label><div>' + G.map((g) => optBtn('goal', g, gl(g), P.goal === g)).join('') + '</div></div>';
      h += '<div class="mp-og"><label>WEAPONS</label><div>' + NexaPvp.WPNS.map((w) => optBtn('wpn', w, WLAB[w], P.wpn === w)).join('') + '</div></div>';
      h += '<div class="mp-og"><label>MAP</label><div class="mp-maps">' + NexaPvp.MAPS.map((m) => '<button type="button" class="mp-opt mp-mapb' + (P.map === m ? ' on' : '') + '" data-o="map" data-v="' + m + '"><canvas class="mp-th" width="128" height="72" data-m="map:' + m + '"></canvas><span>' + MLAB[m] + '</span></button>').join('') + '</div></div>';
      if (P.kind === 'team') h += '<div class="mp-og"><label>FRIENDLY FIRE</label><div>' + optBtn('pff', '0', 'OFF', !P.ff) + optBtn('pff', '1', 'ON', !!P.ff) + '</div></div>';
      return h;
    }
    function ffOpts() {
      const S2 = api.st();
      return '<div class="mp-og"><label>FRIENDLY FIRE</label><div>' + optBtn('ff', '1', 'ON', S2.ff) + optBtn('ff', '0', 'OFF', !S2.ff) + '</div></div>' +
        '<div class="mp-og"><label>DAMAGE TO ALLIES</label><div>' + [0.25, 0.5, 1].map((x) => optBtn('ffm', x, Math.round(x * 100) + '%', S2.ffm === x)).join('') + '</div></div>';
    }
    function previewHtml() {
      const I = info(U.sel), k = U.sel, pv = k.indexOf('mode:') === 0 && PVP.some((p) => 'mode:' + p[0] === k), story = k.indexOf('m:') === 0;
      const needP = pv ? (k === 'mode:duel' ? 'DUEL NEEDS EXACTLY 2 PLAYERS' : k === 'mode:ffa' ? 'PRESS READY IN THE LOBBY TO FIND A MATCH' : 'PVP NEEDS 2–6 PLAYERS') : '';
      return '<div class="mp-pc"><canvas class="mp-big" width="960" height="540"></canvas></div><div class="mp-pb"><div class="mp-tag"><span>' + esc(I.tag) + '</span>' + (I.st ? ' <i class="mp-chip st-' + I.st.toLowerCase() + '"><span>' + I.st + '</span></i>' : '') + '</div>' +
        '<h3' + (story ? ' translate="no"' : '') + '>' + (I.no ? '<b>' + String(I.no).padStart(2, '0') + '</b> ' : '') + esc(I.t) + '</h3><p class="mp-d">' + (I.no === 48 ? '<span translate="no">' + esc(I.d) + '</span>' : esc(I.d) ) + '</p>' +
        '<div class="mp-meta"><div><label>PLAYERS</label><b translate="no">' + I.pl + '</b></div>' + (I.df ? '<div><label>DIFFICULTY</label>' + pips(I.df) + '</div>' : '') + '</div>' +
        (pv ? '<div class="mp-opts">' + pvpOpts() + '</div><p class="mp-note"><span>' + needP + '</span></p>' : '') + (story ? '<p class="mp-note"><span>Story missions: every player waits for the team at each stage.</span></p>' : '') +
        (!pv && !story && k === 'mode:sandbox' ? '<div class="mp-opts">' + ffOpts() + '</div>' : '') + (story ? '<div class="mp-opts">' + ffOpts() + '</div>' : '') +
        '<div class="mp-go"><button type="button" class="action primary mp-play" data-o="play"><span>PLAY</span></button><button type="button" class="link-button mp-set" data-o="set"><span>SELECT</span></button></div></div>';
    }
    function shell() {
      root.innerHTML = '<div class="mp" role="document"><header class="mp-h"><h3>SELECT MODE</h3><button type="button" class="ol-ic" data-mp="close" aria-label="Close">×</button></header>' +
        '<nav class="mp-rail" aria-label="Mode categories">' + CATS.map((c, i) => '<button type="button" class="mp-cat' + (U.cat === c[0] ? ' on' : '') + '" data-c="' + c[0] + '"><i translate="no">0' + (i + 1) + '</i><b>' + c[1] + '</b><small translate="no">' + (c[0] === 'story' ? ids.length : c[0] === 'pvp' ? 3 : 1) + '</small></button>').join('') + '</nav>' +
        '<section class="mp-main"><div class="mp-tools"></div><div class="mp-grid"></div></section><aside class="mp-prev"></aside></div>';
      tools(); grid(); prev();
    }
    function tools() {
      const t = $(root, '.mp-tools'); if (!t) return;
      if (U.cat !== 'story') { t.innerHTML = '<p class="mp-hint"><span>' + (U.cat === 'pvp' ? 'CHOOSE A PVP MODE' : 'SINGLE MODE') + '</span></p>'; return; }
      t.innerHTML = '<input class="mp-q" type="search" placeholder="Search by number or name  ( / )" aria-label="Search missions" value="' + esc(U.q) + '" autocomplete="off">' +
        '<div class="mp-fl">' + ['ALL', 'NEW', 'DONE', 'CLOSED'].map((s) => '<button type="button" class="mp-chipb' + (U.fs === s ? ' on' : '') + '" data-fs="' + s + '"><span>' + s + '</span></button>').join('') + '</div>' +
        '<div class="mp-fl"><label>LEVEL</label>' + [0, 1, 2, 3, 4, 5].map((n) => '<button type="button" class="mp-chipb' + (U.fd === n ? ' on' : '') + '" data-fd="' + n + '"><span translate="no">' + (n || 'ALL') + '</span></button>').join('') + '</div>';
    }
    function grid() {
      const g = $(root, '.mp-grid'); if (!g) return;
      const L = items();
      g.innerHTML = L.length ? L.map(cardHtml).join('') : '<p class="mp-empty"><span>NOTHING FOUND</span></p>';
      g.classList.toggle('few', L.length <= 3);
      g.querySelectorAll('canvas.mp-cv').forEach((cv) => ModeCovers.lazy(cv, cv.parentNode.dataset.k, g));
    }
    function prev() {
      const p = $(root, '.mp-prev'); if (!p) return;
      p.innerHTML = previewHtml(); p.classList.remove('mp-in'); void p.offsetWidth; p.classList.add('mp-in');
      const big = $(p, '.mp-big'); if (big) ModeCovers.paint(big, U.sel);
      p.querySelectorAll('canvas.mp-th').forEach((c) => ModeCovers.paint(c, c.dataset.m));
    }
    function mark() {
      root.querySelectorAll('.mp-card').forEach((b) => b.classList.toggle('on', b.dataset.k === U.sel));
    }
    function pick(k) {
      U.sel = k;
      if (k.indexOf('mode:') === 0 && PVP.some((p) => 'mode:' + p[0] === k)) U.pvp = NexaPvp.norm(Object.assign({}, U.pvp, { kind: k.slice(5) }));
      mark(); prev();
    }
    function apply() {
      const k = U.sel;
      if (k.indexOf('m:') === 0) api.setMode('mission', k.slice(2) | 0);
      else if (k === 'mode:ffa' || k === 'mode:team' || k === 'mode:duel') { api.setPvp(U.pvp); api.setMode(k === 'mode:ffa' ? 'ffa' : 'pvp'); }
      else api.setMode(k.slice(5));
    }
    root.onclick = (e) => {
      const t = e.target;
      if (t === root) { api.close(); return; }
      const b = t.closest('button'); if (!b || !root.contains(b)) return;
      if (b.dataset.mp === 'close') { api.close(); return; }
      if (b.dataset.mp === 'retry') { safe(); return; }
      if (b.dataset.c) { U.cat = b.dataset.c; U.q = ''; U.fs = 'ALL'; U.fd = 0; U.sel = U.cat === 'story' ? 'm:' + (S.mode === 'mission' ? S.mission : ids[0]) : U.cat === 'pvp' ? 'mode:' + (U.pvp.kind === 'duel' ? 'duel' : 'team') : 'mode:' + U.cat; syncKind(); root.querySelectorAll('.mp-cat').forEach((x) => x.classList.toggle('on', x === b)); tools(); grid(); prev(); return; }
      if (b.dataset.fs) { U.fs = b.dataset.fs; tools(); grid(); return; }
      if (b.dataset.fd !== undefined) { U.fd = +b.dataset.fd; tools(); grid(); return; }
      if (b.classList.contains('mp-card')) { pick(b.dataset.k); return; }
      const o = b.dataset.o; if (!o) return;
      if (o === 'play') { apply(); api.close(); api.play(); return; }
      if (o === 'set') { apply(); api.close(); return; }
      if (o === 'ff') { api.setFF(b.dataset.v === '1'); prev(); return; }
      if (o === 'ffm') { api.setFFm(+b.dataset.v); prev(); return; }
      if (o === 'goal' || o === 'wpn' || o === 'map') { U.pvp = NexaPvp.norm(Object.assign({}, U.pvp, { [o]: b.dataset.v })); prev(); return; }
      if (o === 'pff') { U.pvp = NexaPvp.norm(Object.assign({}, U.pvp, { ff: b.dataset.v === '1' ? 1 : 0 })); prev(); }
    };
    root.oninput = (e) => { if (e.target.classList.contains('mp-q')) { U.q = e.target.value; grid(); } };
    root.onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(); return; }
      const inq = e.target.classList && e.target.classList.contains('mp-q');
      if (e.key === '/' && !inq) { const q = $(root, '.mp-q'); if (q) { e.preventDefault(); q.focus(); } return; }
      if (inq) { if (e.key === 'ArrowDown') { const c = $(root, '.mp-card'); if (c) { e.preventDefault(); c.focus({ preventScroll: true }); } } return; }
      if (!e.target.classList || !e.target.classList.contains('mp-card')) return;
      const cards = Array.from(root.querySelectorAll('.mp-card')), i = cards.indexOf(e.target);
      const cols = Math.max(1, cards.filter((c) => Math.abs(c.offsetTop - cards[0].offsetTop) < 4).length);
      const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      if (d !== undefined) { e.preventDefault(); const n = cards[Math.max(0, Math.min(cards.length - 1, i + d))]; if (n) { n.focus({ preventScroll: true }); reveal(n); } }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); const n = cards[e.key === 'Home' ? 0 : cards.length - 1]; if (n) { n.focus({ preventScroll: true }); reveal(n); } }
    };
    if (root.__fi) root.removeEventListener('focusin', root.__fi);
    root.__fi = (e) => { const b = e.target.closest && e.target.closest('.mp-card'); if (b && b.dataset.k !== U.sel && matchMedia('(min-width: 900px)').matches) pick(b.dataset.k); };
    root.addEventListener('focusin', root.__fi);
    function reveal(n) {
      const g = n.parentNode; if (!g || !g.classList.contains('mp-grid')) return;
      const gr = g.getBoundingClientRect(), nr = n.getBoundingClientRect();
      if (nr.top < gr.top) g.scrollTop += nr.top - gr.top - 10; else if (nr.bottom > gr.bottom) g.scrollTop += nr.bottom - gr.bottom + 10;
      root.scrollTop = 0; if (root.parentNode) root.parentNode.scrollTop = 0;
    }
    function safe() {
      try { shell(); } catch (e) {
        console.warn('[modepick]', e);
        root.innerHTML = '<div class="mp err"><header class="mp-h"><h3>SELECT MODE</h3><button type="button" class="ol-ic" data-mp="close" aria-label="Close">×</button></header><p class="mp-empty"><span>COULD NOT BUILD THE LIST</span></p><button type="button" class="ol-btn big" data-mp="retry"><span>RETRY</span></button></div>';
      }
    }
    safe();
    const f = $(root, '.mp-card.on') || $(root, '.mp-card') || $(root, '.mp-cat.on');
    if (f) try { f.focus({ preventScroll: true }); reveal(f); } catch (e) { /* ok */ }
  }
  function close(el) { if (el) { if (el.__fi) { el.removeEventListener('focusin', el.__fi); el.__fi = null; } el.classList.remove('mp-open'); el.onclick = el.oninput = el.onkeydown = null; el.innerHTML = ''; } }
  window.ModePick = { open, close };
}());
