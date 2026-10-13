// NEXA: интерфейс HIGH / LOW для экранов ноутбуков 3D-стола (table.js). Тот же интерфейс, что и в NEXA/OS, но нарисованный на canvas 1024x640.
// HLScreen.draw(g, M) рисует экран и возвращает зоны для клика [{id,x,y,w,h}] в логических координатах.
// M = { id, me, st (состояние игры), tgt ({min,max}|null), ui {buf, typing, caret, hover, note}, t (время, c), dead, crash (0..3), seed }
(function () {
  'use strict';
  const W = 1024, H = 640;
  const INK = '#e6e9e6', MUTED = '#7c898c', RED = '#ef4b45', GREEN = '#79c19a', AMBER = '#ddb56b', LINE = '#2b3132', VOID = '#040505', PANEL = '#0b0d0d', REDDIM = '#5b1514';
  const FD = '"Space Mono","Courier New",monospace', FB = '"IBM Plex Mono","Courier New",monospace';
  const AUTO = ['EXPIRED', 'AUTO', 'GENERATED', 'AUTOLOCKED', 'COMPLETE'];

  let scan = null;
  function T(g, s, x, y, o) {
    o = o || {};
    g.font = (o.w || 400) + ' ' + (o.px || 16) + 'px ' + (o.f || FB);
    g.fillStyle = o.c || INK;
    g.textAlign = o.a || 'left'; g.textBaseline = o.b || 'alphabetic';
    if ('letterSpacing' in g) g.letterSpacing = (o.ls || 0) + 'px';
    g.fillText(window.I18N ? I18N.t(String(s)) : String(s), x, y);
  }
  function box(g, x, y, w, h, fill, stroke, lw) {
    if (fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
  }
  function rng(seed) { let s = (seed || 1) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function button(g, hot, M, id, label, x, y, w, h, o) {
    o = o || {};
    const hv = M.me && M.ui.hover === id && !o.off;
    box(g, x, y, w, h, hv ? INK : (o.primary ? 'rgba(239,75,69,.10)' : PANEL), o.off ? LINE : (hv ? INK : (o.primary ? RED : MUTED)), 2);
    T(g, label, x + w / 2, y + h / 2 + 1, { px: o.px || 18, w: 700, f: FD, c: hv ? '#000' : (o.off ? MUTED : INK), a: 'center', b: 'middle', ls: 2 });
    if (!o.off) hot.push({ id, x, y, w, h });
  }

  function frame(g, M, status) {
    g.fillStyle = VOID; g.fillRect(0, 0, W, H);
    box(g, 0, 0, W, 46, PANEL); box(g, 0, 46, W, 1, LINE);
    box(g, 18, 12, 22, 22, RED); T(g, 'N', 29, 29, { px: 15, w: 700, f: FD, c: '#000', a: 'center' });
    T(g, 'NEXA', 52, 30, { px: 17, w: 700, f: FD, ls: 2 }); T(g, 'INDUSTRIES', 118, 30, { px: 11, f: FD, c: MUTED, ls: 2 });
    T(g, 'TERMINAL ' + M.id + ' / REV. 1992.11', W - 18, 29, { px: 12, c: MUTED, a: 'right', ls: 1 });
    box(g, 0, H - 34, W, 34, PANEL); box(g, 0, H - 34, W, 1, LINE);
    g.fillStyle = GREEN; g.beginPath(); g.arc(24, H - 17, 4, 0, Math.PI * 2); g.fill();
    T(g, 'SYSTEM ONLINE / LOCAL SESSION', 38, H - 12, { px: 11, c: MUTED, ls: 1 });
    T(g, status || 'NO EXTERNAL CONNECTION', W / 2 + 70, H - 12, { px: 11, c: MUTED, ls: 1, a: 'center' });
    T(g, '© NEXA INDUSTRIES 1992', W - 18, H - 12, { px: 11, c: MUTED, a: 'right' });
  }
  function head(g, M, eyebrow, title, color) {
    if (eyebrow) T(g, eyebrow, 60, 86, { px: 12, w: 600, f: FD, c: RED, ls: 3 });
    T(g, title, 60, 126, { px: 30, w: 700, f: FD, c: color || INK, ls: 2 });
    T(g, 'SESSION', W - 60, 86, { px: 11, c: MUTED, a: 'right', ls: 2 }); T(g, M.st.sessionId || 'PENDING', W - 60, 118, { px: 22, w: 700, f: FD, a: 'right' });
    box(g, 60, 142, W - 120, 1, LINE);
  }
  function inputBox(g, hot, M, x, y, w, h, text, placeholder, o) {
    o = o || {};
    const active = o.active, hv = M.me && M.ui.hover === 'input' && !o.locked;
    box(g, x, y, w, h, o.locked ? 'rgba(121,193,154,.06)' : '#000', o.locked ? GREEN : (active ? INK : (hv ? REDDIM : LINE)), active ? 2 : 1);
    if (text) T(g, text, x + 18, y + h / 2 + 1, { px: 32, w: 700, f: FD, c: o.locked ? GREEN : INK, b: 'middle', ls: 3 });
    else T(g, placeholder, x + 18, y + h / 2 + 1, { px: 18, f: FD, c: '#3b4446', b: 'middle', ls: 2 });
    if (active && M.ui.caret) { g.font = '700 32px ' + FD; if ('letterSpacing' in g) g.letterSpacing = '3px'; const tw = text ? g.measureText(text).width : 0; box(g, x + 20 + tw, y + 12, 3, h - 24, INK); }
    if (!o.locked && o.id) hot.push({ id: o.id, x, y, w, h });
  }
  function note(g, M, x, y, def) {
    const n = M.ui.note;
    if (n && n.text) T(g, n.text, x, y, { px: 14, c: n.kind === 'error' ? RED : INK, ls: 1 });
    else T(g, def, x, y, { px: 14, c: MUTED, ls: 0.5 });
  }

  // ----------------------------------------------------------------- экраны
  function sBoot(g, M) {
    frame(g, M, 'ESTABLISHING SECURE CHANNEL');
    T(g, 'INITIALIZING' + '.'.repeat(1 + Math.floor(M.t * 2.5) % 3), W / 2, H / 2 - 6, { px: 28, w: 700, f: FD, a: 'center', ls: 3 });
    T(g, 'SUBJECT ' + M.id + ' // SESSION LINK', W / 2, H / 2 + 34, { px: 13, c: MUTED, a: 'center', ls: 3 });
  }

  function sParticipants(g, M, hot) {
    frame(g, M, 'ALL SUBJECTS CONNECTED');
    head(g, M, 'NEXA/OS', 'PARTICIPANTS READY');
    T(g, 'All subjects connected. Experiment will begin shortly.', 60, 182, { px: 15, c: MUTED });
    const pl = M.st.players, cols = pl.length > 2 ? 2 : 1, cw = cols === 2 ? 452 : 904;
    pl.forEach((p, i) => {
      const x = 60 + (i % cols) * (cw + 0), y = 210 + Math.floor(i / cols) * 74;
      const px = cols === 2 ? 60 + (i % 2) * 476 : 60;
      box(g, px, y, cw, 58, p.isUser ? 'rgba(239,75,69,.04)' : null, p.isUser ? REDDIM : LINE, 1);
      T(g, 'SUBJECT ' + p.id, px + 20, y + 36, { px: 20, f: FD });
      T(g, p.isUser ? 'YOU' : 'SYSTEM', px + cw - 20, y + 35, { px: 12, c: p.isUser ? RED : MUTED, a: 'right', ls: 2 });
      void x;
    });
    button(g, hot, M, 'begin', '[BEGIN EXPERIMENT]', W / 2 - 200, 462, 400, 66, { primary: true, px: 20 });
  }

  function sAuto(g, M) {
    frame(g, M, 'AUTO-SELECTION');
    const st = M.st, idx = Math.max(0, AUTO.indexOf(st.pickStage)), n = String(st.autoSelectedNumber);
    T(g, 'TIME EXPIRED', 60, 126, { px: 34, w: 700, f: FD, c: RED, ls: 3 });
    T(g, 'SUBJECT', W - 60, 86, { px: 11, c: MUTED, a: 'right', ls: 2 }); T(g, M.id, W - 60, 118, { px: 22, w: 700, f: FD, a: 'right' });
    box(g, 60, 142, W - 120, 1, LINE);
    let y = 200;
    if (idx >= 1) { T(g, 'SUBJECT ' + M.id, 60, y, { px: 18, ls: 2 }); T(g, 'NO NUMBER SELECTED', 60, y + 28, { px: 18, ls: 2 }); y += 74; T(g, 'AUTO-SELECTION ACTIVE...', 60, y, { px: 18, c: AMBER, ls: 2 }); y += 58; }
    if (idx >= 2) { T(g, 'SYSTEM GENERATED VALUE: ' + n, 60, y, { px: 32, w: 700, f: FD, c: GREEN, ls: 2 }); y += 62; }
    if (idx >= 3) { T(g, 'NUMBER LOCKED', 60, y, { px: 18, c: GREEN, ls: 2 }); T(g, 'VALUE: ' + n, 60, y + 28, { px: 18, c: GREEN, ls: 2 }); y += 74; }
    if (idx >= 4) T(g, 'PICK COMPLETE', 60, y, { px: 18, c: MUTED, ls: 2 });
  }

  function sPicking(g, M, hot) {
    const st = M.st, rem = st.pickRemaining || 0, locked = M.me ? !!st.pickLocked : st.players.some((p) => p.id === M.id && p.status === 'LOCKED');
    frame(g, M, 'TIME REMAINING ' + rem);
    head(g, M, 'EXPERIMENT 01', 'SELECT YOUR NUMBER');
    T(g, 'Each subject selects one number within the range. Time remaining:', 60, 182, { px: 14, c: MUTED });
    const val = M.me && st.lockedValue !== null && st.lockedValue !== undefined ? String(st.lockedValue) : (locked ? '••••' : (M.me ? M.ui.buf : ''));
    inputBox(g, hot, M, 60, 204, 392, 66, val, 'ENTER NUMBER', { active: M.me && M.ui.typing && !locked, locked, id: 'input' });
    button(g, hot, M, 'lock', 'LOCK NUMBER', 464, 204, 168, 66, { off: locked, px: 15 });
    if (locked) {
      T(g, 'NUMBER LOCKED', 60, 304, { px: 14, c: GREEN, ls: 1 });
      T(g, 'SUBJECT ' + M.id, 60, 326, { px: 14, c: MUTED });
      if (M.me) T(g, 'VALUE: ' + st.lockedValue + (st.pickStage === 'COMPLETE' ? '   PICK COMPLETE' : ''), 60, 348, { px: 14, c: GREEN });
    } else note(g, M, 60, 304, 'Enter a number between 1 and ' + st.rangeMax);
    let y = 392;
    T(g, 'SUBJECT STATUS', 60, y - 20, { px: 10, c: MUTED, ls: 3 });
    st.players.forEach((p) => {
      const l = p.status === 'LOCKED';
      box(g, 60, y, 572, 1, LINE);
      T(g, 'SUBJECT ' + p.id + (p.id === M.id ? '  (YOU)' : ''), 60, y + 24, { px: 14, ls: 1 });
      T(g, l ? 'LOCKED' : 'THINKING', 632, y + 24, { px: 13, c: l ? GREEN : MUTED, a: 'right', ls: 2 });
      y += 34;
    });
    // таймер
    const crit = rem <= 3 && !locked, warn = rem <= 5 && !locked;
    box(g, 664, 190, 300, 270, crit ? 'rgba(239,75,69,.10)' : 'rgba(91,21,20,.12)', crit && Math.floor(M.t * 3) % 2 ? RED : REDDIM, 1);
    T(g, 'TIME REMAINING', 814, 224, { px: 11, c: MUTED, a: 'center', ls: 3 });
    T(g, String(rem), 814, 358, { px: 128, w: 700, f: FD, c: warn ? RED : INK, a: 'center', ls: -8 });
    T(g, 'RANGE: 1 — ' + st.rangeMax, 814, 420, { px: 16, f: FD, a: 'center' });
  }

  function verdict(g, M, x, y, w, h) {
    const l = M.st.lastResult;
    if (!l) { box(g, x, y, w, h, null, LINE, 1); T(g, 'NO GUESSES YET', x + 20, y + h / 2 + 5, { px: 14, c: MUTED, ls: 2 }); return; }
    const col = l.result === 'CORRECT' ? GREEN : (l.result === 'HIGH' ? RED : AMBER), fresh = M.t - (M.verdictT || 0) < 0.5 && Math.floor(M.t * 14) % 2;
    box(g, x, y, w, h, fresh ? 'rgba(255,255,255,.06)' : null, col, 1);
    T(g, 'SUBJECT ' + l.actorId + ' → ' + l.guess, x + 18, y + 26, { px: 13, c: MUTED, ls: 1 });
    T(g, l.result, x + 18, y + 72, { px: 40, w: 700, f: FD, c: col, ls: 3 });
    const rng2 = l.range ? l.range.min + ' — ' + l.range.max : '';
    if (l.result === 'HIGH') { T(g, 'TARGET IS HIGHER', x + w - 18, y + 36, { px: 13, a: 'right', ls: 1 }); T(g, 'RANGE UPDATED ' + rng2, x + w - 18, y + 62, { px: 12, c: MUTED, a: 'right' }); T(g, '↑', x + w - 24, y + 94, { px: 24, c: col, a: 'right', f: FD }); }
    else if (l.result === 'LOW') { T(g, 'TARGET IS LOWER', x + w - 18, y + 36, { px: 13, a: 'right', ls: 1 }); T(g, 'RANGE UPDATED ' + rng2, x + w - 18, y + 62, { px: 12, c: MUTED, a: 'right' }); T(g, '↓', x + w - 24, y + 94, { px: 24, c: col, a: 'right', f: FD }); }
    else { T(g, 'TARGET MATCH', x + w - 18, y + 36, { px: 13, a: 'right', ls: 1 }); T(g, M.st.matchEnding ? 'EXPERIMENT COMPLETE' : 'SUBJECT ' + l.targetId + ' REMOVED', x + w - 18, y + 62, { px: 12, c: MUTED, a: 'right' }); }
  }

  function sGuessing(g, M, hot) {
    const st = M.st, ending = !!st.matchEnding, actorId = st.currentActorId, b = M.tgt || { min: 1, max: st.rangeMax || 1 };
    frame(g, M, ending ? 'EXPERIMENT COMPLETE' : 'EXPERIMENT ACTIVE');
    head(g, M, '', 'EXPERIMENT ACTIVE');
    // статус-полоса
    box(g, 60, 164, 272, 62, actorId ? 'rgba(239,75,69,.05)' : null, actorId ? REDDIM : LINE, 1);
    T(g, 'CURRENT TURN', 76, 186, { px: 10, c: MUTED, ls: 3 }); T(g, actorId ? 'SUBJECT ' + actorId : '— — —', 76, 214, { px: 19, w: 700, f: FD, ls: 1 });
    box(g, 346, 164, 276, 62, null, LINE, 1);
    T(g, 'TARGET', 362, 186, { px: 10, c: MUTED, ls: 3 }); T(g, st.targetId ? 'SUBJECT ' + st.targetId : '— — —', 362, 214, { px: 19, w: 700, f: FD, ls: 1 });
    // ввод / ожидание
    if (actorId === M.id && !ending) {
      inputBox(g, hot, M, 60, 244, 392, 62, M.me ? M.ui.buf : '', b.min + ' - ' + b.max, { active: M.me && M.ui.typing, id: 'input' });
      button(g, hot, M, 'submit', 'SUBMIT GUESS', 464, 244, 168, 62, { px: 15 });
      note(g, M, 60, 332, 'YOUR TURN: ENTER A NUMBER BETWEEN ' + b.min + ' AND ' + b.max);
    } else if (!ending && actorId) {
      T(g, 'SUBJECT ' + actorId + ' IS MAKING A GUESS' + '.'.repeat(Math.floor(M.t * 2.5) % 4), 60, 284, { px: 15, c: AMBER, ls: 1 });
    }
    verdict(g, M, 60, 352, 572, 106);
    const hist = (st.targetHistory[st.targetId] || []).slice(-4);
    let y = 478;
    hist.forEach((e) => {
      box(g, 60, y, 572, 1, LINE);
      T(g, 'SUBJECT ' + e.actorId + ' guessed ' + e.guess, 60, y + 20, { px: 13 });
      T(g, e.result, 632, y + 20, { px: 13, f: FD, a: 'right', ls: 2, c: e.result === 'CORRECT' ? GREEN : (e.result === 'HIGH' ? RED : AMBER) });
      y += 28;
    });
    // справа: цель и список
    box(g, 664, 164, 300, 150, 'rgba(91,21,20,.10)', REDDIM, 1);
    T(g, 'TARGET SUBJECT', 684, 192, { px: 10, c: MUTED, ls: 3 });
    T(g, st.targetId ? 'SUBJECT ' + st.targetId : '—', 684, 232, { px: 24, w: 700, f: FD, c: RED, ls: 1 });
    T(g, String(b.min), 684, 290, { px: 30, w: 700, f: FD }); T(g, String(b.max), 944, 290, { px: 30, w: 700, f: FD, a: 'right' });
    T(g, '—', 814, 288, { px: 20, c: MUTED, a: 'center' });
    T(g, 'ACTIVE SUBJECTS', 664, 346, { px: 10, c: MUTED, ls: 3 });
    y = 358;
    st.players.forEach((p) => {
      box(g, 664, y, 300, 1, LINE);
      T(g, 'SUBJECT ' + p.id, 664, y + 22, { px: 13, c: p.active ? INK : '#4b5557', ls: 1 });
      T(g, p.active ? 'ACTIVE' : 'REMOVED', 964, y + 22, { px: 11, c: p.active ? GREEN : RED, a: 'right', ls: 2 });
      y += 30;
    });
  }

  function sResult(g, M, hot) {
    const st = M.st, win = st.winnerId === M.id;
    frame(g, M, 'EXPERIMENT COMPLETE');
    T(g, 'CORRECT — TARGET MATCH', W / 2, 108, { px: 16, f: FD, c: GREEN, a: 'center', ls: 3 });
    T(g, 'EXPERIMENT COMPLETE', W / 2, 150, { px: 12, w: 600, f: FD, c: RED, a: 'center', ls: 4 });
    T(g, 'TARGET IDENTIFIED', W / 2, 214, { px: 44, w: 700, f: FD, a: 'center', ls: 3 });
    box(g, W / 2 - 200, 252, 400, 110, null, LINE, 1);
    T(g, 'WINNER', W / 2, 284, { px: 11, c: MUTED, a: 'center', ls: 4 });
    T(g, win ? 'YOU' : 'SUBJECT ' + st.winnerId, W / 2, 338, { px: 36, w: 700, f: FD, a: 'center', ls: 3, c: win ? GREEN : INK });
    T(g, 'RESULT: SUCCESS', W / 2, 400, { px: 14, c: GREEN, a: 'center', ls: 3 });
    button(g, hot, M, 'restart', 'RESTART EXPERIMENT', 150, 456, 340, 64, { px: 16 });
    button(g, hot, M, 'menu', 'RETURN TO NEXA/OS', 534, 456, 340, 64, { px: 16 });
  }

  function sDead(g, M) {
    frame(g, M, 'LINK TERMINATED');
    const r = rng(M.seed + Math.floor(M.t * 6));
    for (let i = 0; i < 26; i += 1) { g.fillStyle = 'rgba(239,75,69,' + (0.02 + r() * 0.05) + ')'; g.fillRect(0, 60 + r() * 520, W, 1 + r() * 2); }
    T(g, 'CONNECTION LOST', W / 2, H / 2 - 20, { px: 40, w: 700, f: FD, c: RED, a: 'center', ls: 4 });
    T(g, 'SUBJECT ' + M.id + ' TERMINATED', W / 2, H / 2 + 28, { px: 16, c: MUTED, a: 'center', ls: 4 });
    T(g, 'REMOVED FROM EXPERIMENT', W / 2, H / 2 + 56, { px: 12, c: '#4b5557', a: 'center', ls: 4 });
  }

  // поломка ноутбука игрока: 1 — помехи поверх экрана, 2 — FATAL ERROR, 3 — треснувший чёрный экран
  function crashFx(g, M) {
    const r = rng(M.seed * 7 + Math.floor(M.t * 14));
    if (M.crash === 1) {
      for (let i = 0; i < 30; i += 1) { const y = r() * H, h = 4 + r() * 38, dx = (r() - 0.5) * 120; g.drawImage(g.canvas, 0, y * g.canvas.height / H, g.canvas.width, h * g.canvas.height / H, dx, y, W, h); }
      for (let i = 0; i < 90; i += 1) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,' + (r() * 0.5) + ')' : 'rgba(239,75,69,' + (r() * 0.5) + ')'; g.fillRect(r() * W, r() * H, 10 + r() * 160, 1 + r() * 5); }
    } else if (M.crash === 2) {
      g.fillStyle = '#050000'; g.fillRect(0, 0, W, H);
      T(g, 'FATAL ERROR', W / 2, 250, { px: 56, w: 700, f: FD, c: RED, a: 'center', ls: 5 });
      T(g, 'SUBJECT ' + M.id + ' / CONNECTION TERMINATED', W / 2, 300, { px: 16, c: INK, a: 'center', ls: 3 });
      for (let i = 0; i < 9; i += 1) { let s = ''; for (let k = 0; k < 40; k += 1) s += '0123456789ABCDEF'[Math.floor(r() * 16)] + (k % 4 === 3 ? ' ' : ''); T(g, s, W / 2, 350 + i * 22, { px: 13, c: i % 3 ? '#4b1010' : '#7a1c1a', a: 'center' }); }
    } else if (M.crash === 3) {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const q = rng(M.seed * 13), cx = 600 + q() * 120, cy = 250 + q() * 90;
      g.strokeStyle = 'rgba(230,233,230,.55)'; g.lineWidth = 2;
      for (let i = 0; i < 14; i += 1) {
        let a = q() * Math.PI * 2, x = cx, y = cy; g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 7; k += 1) { a += (q() - 0.5) * 0.9; const l = 40 + q() * 130; x += Math.cos(a) * l; y += Math.sin(a) * l; g.lineTo(x, y); }
        g.stroke();
      }
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 90); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(cx - 100, cy - 100, 200, 200);
      if (Math.floor(M.t * 5) % 7 === 0) T(g, '...', 80, 100, { px: 20, c: RED });
    }
  }

  function draw(g, M) {
    const hot = [], st = M.st;
    M.ui = M.ui || {};
    if (M.crash >= 2) { crashFx(g, M); return hot; }
    if (M.dead) sDead(g, M);
    else if (st.phase === 'PARTICIPANTS') sParticipants(g, M, hot);
    else if (st.phase === 'NUMBER_PICKING') { if (M.me && st.autoSelecting) sAuto(g, M); else sPicking(g, M, hot); }
    else if (st.phase === 'GUESSING') sGuessing(g, M, hot);
    else if (st.phase === 'RESULT') sResult(g, M, hot);
    else sBoot(g, M);
    if (M.crash === 1) crashFx(g, M);
    // линии развёртки — ощущение ЭЛТ
    if (!scan) { scan = document.createElement('canvas'); scan.width = 4; scan.height = 4; const x = scan.getContext('2d'); x.fillStyle = 'rgba(255,255,255,0.035)'; x.fillRect(0, 0, 4, 1); }
    g.fillStyle = g.createPattern(scan, 'repeat'); g.fillRect(0, 0, W, H);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    return hot;
  }

  window.HLScreen = { W, H, draw };
}());
