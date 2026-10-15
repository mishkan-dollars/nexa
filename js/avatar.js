// Свои аватарки: выбор файла (только локально) -> кадрирование в квадрат -> WebP/JPEG 128x128 до ~6 КБ -> локальное хранилище.
// Видят другие: P2P в комнате (хэш в 'av', картинка по запросу 'av?'/'avd', кэш по хэшу) и подписанный профиль Nostr (поле av).
// Получатель принимает только data:image/webp|jpeg|png, декодирует и ПЕРЕКОДИРУЕТ через canvas. Модерации без сервера нет: скрытие локальное + список админа.
(function () {
  'use strict';
  const NN = window.NexaNet, PF = window.NexaProfile;
  if (!NN || !PF) return;
  const K_MINE = 'nexaAvatar', K_HIDE = 'nexaAvHide', K_SHOW = 'nexaAvShow';
  const RE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*$/, MAXC = 12000, LIM = 6000, HEX64 = /^[0-9a-f]{64}$/, HASH = /^[0-9a-f]{8}$/;
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* без хранилища */ } } };
  const jp = (s, d) => { try { const j = JSON.parse(s); return j == null ? d : j; } catch (e) { return d; } };
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
  const adm = () => window.NexaAdmin;
  const sec = () => Math.floor(Date.now() / 1000);
  const t = (s) => (window.I18N && I18N.t ? I18N.t(s) : s);

  let mine = jp(ls.get(K_MINE), null);
  if (!mine || typeof mine.u !== 'string' || !RE.test(mine.u) || mine.u.length > MAXC) mine = null;
  const hidden = new Set(jp(ls.get(K_HIDE), []).filter((x) => typeof x === 'string').slice(0, 300));
  const byKey = new Map(), byHash = new Map(), ann = new Map(), askAt = new Map(), servedAt = new Map(), missAt = new Map();
  const subs = new Set();
  let showOthers = ls.get(K_SHOW) !== '0', annT = 0, annTimer = 0;
  const emit = () => subs.forEach((f) => { try { f(); } catch (e) { /* слушатель не должен ломать остальных */ } });
  const myPk = () => (window.Toys && Toys.ident && Toys.ident.pk) || '';
  const pidOf = (slot) => { const q = NN.players.find((x) => x.slot === slot); return q ? q.pid || '' : ''; };

  // ---------------------------------------------------------------- проверка и перекодирование
  function toBlob(u) {
    const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(u); if (!m) return null;
    const bin = atob(m[2]), a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: m[1] });
  }
  function encode(cv, lim) {
    const kind = (cv.toDataURL('image/webp', 0.5).indexOf('data:image/webp') === 0) ? 'image/webp' : 'image/jpeg';
    let best = '';
    [0.85, 0.72, 0.6, 0.48, 0.36, 0.26].some((q) => { best = cv.toDataURL(kind, q); return best.length * 0.75 <= lim; });
    return best;
  }
  function draw(src, sw, sh, sx, sy, side, size) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
    g.drawImage(src, sx, sy, side, side, 0, 0, size, size);
    return cv;
  }
  async function sane(u) {
    if (typeof u !== 'string' || u.length > MAXC || !RE.test(u)) return '';
    try {
      const bmp = await createImageBitmap(toBlob(u));
      if (bmp.width < 8 || bmp.height < 8 || bmp.width > 512 || bmp.height > 512) { bmp.close && bmp.close(); return ''; }
      const side = Math.min(bmp.width, bmp.height), out = encode(draw(bmp, bmp.width, bmp.height, (bmp.width - side) / 2, (bmp.height - side) / 2, side, 128), LIM * 1.4);
      bmp.close && bmp.close();
      return RE.test(out) ? out : '';
    } catch (e) { return ''; }
  }
  async function make(bmp, zoom, ox, oy) {
    const base = Math.min(bmp.width, bmp.height), side = base / Math.max(1, zoom);
    const sx = (bmp.width - side) * (ox + 1) / 2, sy = (bmp.height - side) * (oy + 1) / 2;
    let out = '';
    for (const size of [128, 96, 64]) { out = encode(draw(bmp, bmp.width, bmp.height, sx, sy, side, size), LIM); if (out.length * 0.75 <= LIM) break; }
    return out;
  }

  // ---------------------------------------------------------------- доступ к картинкам
  const isMe = (k) => k === 'me' || k === NN.PID || (k && k === myPk());
  const blockedPk = (pk) => { const a = adm(); return !!(pk && a && (a.banned(pk) || (a.avBlocked && a.avBlocked(pk)))); };
  function myBlock() { const a = adm(), pk = myPk(); return pk && a && a.avBlocked ? a.avBlocked(pk) : null; }
  function url(key) {
    if (!key) return '';
    if (isMe(key)) return mine && !myBlock() ? mine.u : '';
    if (!showOthers) return '';
    const r = byKey.get(key);
    if (!r) { want(key); return ''; }
    if (hidden.has(key) || (r.pk && hidden.has(r.pk)) || (r.pid && hidden.has(r.pid)) || blockedPk(r.pk || (HEX64.test(key) ? key : ''))) return '';
    return r.u;
  }
  function want(key) {
    if (!HEX64.test(key) || !window.NexaSocial || !NexaSocial.loadProfile) return;
    const n = Date.now(); if (n - (missAt.get(key) || 0) < 600000) return;
    missAt.set(key, n);
    try { NexaSocial.loadProfile(key, () => {}); } catch (e) { /* релеи недоступны */ }
  }
  async function ingest(key, raw, meta) {
    if (!key) return;
    const m = meta || {};
    if (!raw) { const r0 = byKey.get(key); if (r0) { byKey.delete(key); if (r0.pk) byKey.delete(r0.pk); if (r0.pid) byKey.delete(r0.pid); emit(); } return; }
    const h = m.h || hash(raw);
    let u = byHash.get(h);
    if (!u) { u = await sane(raw); if (!u) return; byHash.set(h, u); if (byHash.size > 80) byHash.delete(byHash.keys().next().value); }
    const r = { u, h, pk: HEX64.test(m.pk || '') ? m.pk : (HEX64.test(key) ? key : ''), pid: m.pid || '' };
    byKey.set(key, r); if (r.pk) byKey.set(r.pk, r); if (r.pid) byKey.set(r.pid, r);
    emit();
  }

  // ---------------------------------------------------------------- свой аватар
  function announce(force) {
    if (!NN.connected) return;
    const n = Date.now();
    if (!force && n - annT < 3000) { if (!annTimer) annTimer = setTimeout(() => { annTimer = 0; announce(true); }, 3000 - (n - annT)); return; }
    annT = n;
    NN.sendAction({ type: 'av', h: mine && !myBlock() ? mine.h : '', k: myPk() });
  }
  function setMine(u) {
    if (u) { mine = { u, h: hash(u), t: Date.now() }; ls.set(K_MINE, JSON.stringify(mine)); }
    else { mine = null; ls.set(K_MINE, ''); }
    announce(true); emit();
    if (window.NexaSocial && NexaSocial.pubProfile) { try { NexaSocial.pubProfile(); } catch (e) { /* ok */ } }
  }
  function checkMod() {
    const b = myBlock();
    if (b && mine) { mine = null; ls.set(K_MINE, ''); announce(true); emit(); }
    return b;
  }

  // ---------------------------------------------------------------- P2P
  function onAv(p) {
    const s = p.from | 0, pid = pidOf(s); if (!pid) return;
    const h = typeof p.h === 'string' ? p.h : '', pk = HEX64.test(p.k || '') ? p.k : '';
    if (!h) { ann.delete(pid); ingest(pid, '', {}); return; }
    if (!HASH.test(h)) return;
    ann.set(pid, { h, pk });
    const r = byKey.get(pid);
    if (r && r.h === h) { if (pk && !r.pk) { r.pk = pk; byKey.set(pk, r); emit(); } return; }
    const cached = byHash.get(h);
    if (cached) { const r2 = { u: cached, h, pk, pid }; byKey.set(pid, r2); if (pk) byKey.set(pk, r2); emit(); return; }
    const n = Date.now(); if (n - (askAt.get(pid) || 0) < 5000) return;
    askAt.set(pid, n); NN.sendAction({ type: 'av?', h, to: s }, { to: s });
  }
  function onAsk(p) {
    const s = p.from | 0; if (!mine || p.h !== mine.h || myBlock()) return;
    const n = Date.now(); if (n - (servedAt.get(s) || 0) < 8000) return;
    servedAt.set(s, n); NN.sendAction({ type: 'avd', h: mine.h, u: mine.u, to: s }, { to: s });
  }
  function onData(p) {
    const s = p.from | 0, pid = pidOf(s), a = pid && ann.get(pid);
    if (!a || p.h !== a.h || typeof p.u !== 'string' || hash(p.u) !== a.h) return;
    ingest(pid, p.u, { h: a.h, pk: a.pk, pid });
  }
  NN.on('av', onAv); NN.on('av?', onAsk); NN.on('avd', onData);
  NN.on('net:roster', () => announce(false));
  NN.on('net:state', (s) => { if (s && s.state === 'open') announce(false); });
  NN.on('net:left', () => { const ids = new Set(NN.players.map((x) => x.pid)); ann.forEach((v, k) => { if (!ids.has(k)) { ann.delete(k); byKey.delete(k); } }); });
  setInterval(() => { const had = !!myBlock(); checkMod(); if (had) emit(); }, 15000);

  // ---------------------------------------------------------------- интерфейс: редактор и управление
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  let ctl = null;
  function status() {
    if (!ctl) return;
    const b = myBlock(), n = ctl.querySelector('.av-note');
    if (b) { const d = b.u ? ' · ' + new Date(b.u * 1000).toISOString().slice(0, 10) : ''; n.textContent = t('AVATAR REMOVED BY A MODERATOR') + d; n.className = 'v-note av-note bad'; }
    else if (mine) { n.textContent = Math.round(mine.u.length * 0.75 / 100) / 10 + ' KB'; n.className = 'v-note av-note'; }
    else { n.textContent = t('NO AVATAR — YOUR NAME LETTER IS SHOWN'); n.className = 'v-note av-note'; }
    ctl.querySelector('[data-av="rm"]').hidden = !mine;
    ctl.querySelector('[data-av="pick"]').disabled = !!b;
    ctl.querySelector('.av-show input').checked = showOthers;
  }
  async function openFile(file) {
    if (!file || !/^image\//.test(file.type) || file.size > 12 * 1024 * 1024) { if (ctl) { const n = ctl.querySelector('.av-note'); n.textContent = t('CHOOSE AN IMAGE FILE (UP TO 12 MB)'); n.className = 'v-note av-note bad'; } return; }
    let bmp; try { bmp = await createImageBitmap(file); } catch (e) { return; }
    editor(bmp);
  }
  function editor(bmp) {
    const wrap = el('div', 'av-ed'); wrap.setAttribute('data-i18n', 'net'); wrap.setAttribute('role', 'dialog');
    const box = el('div', 'av-box'); wrap.appendChild(box);
    box.appendChild(el('h3', '', 'AVATAR'));
    const cv = el('canvas', 'av-cv'); cv.width = cv.height = 128; box.appendChild(cv);
    const z = el('input'); z.type = 'range'; z.min = '1'; z.max = '4'; z.step = '0.01'; z.value = '1'; z.setAttribute('aria-label', 'Zoom'); box.appendChild(z);
    box.appendChild(el('p', 'v-note', 'DRAG TO MOVE, SLIDER TO ZOOM'));
    const info = el('p', 'v-note av-size'); box.appendChild(info);
    const bt = el('div', 'pf-btns'); const ok = el('button', 'ol-btn big', 'SAVE'), no = el('button', 'ol-btn', 'CANCEL'); ok.type = no.type = 'button'; bt.appendChild(ok); bt.appendChild(no); box.appendChild(bt);
    document.body.appendChild(wrap);
    let ox = 0, oy = 0, drag = null, tm = 0;
    const base = Math.min(bmp.width, bmp.height);
    const paint = () => {
      const side = base / +z.value, g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
      g.drawImage(bmp, (bmp.width - side) * (ox + 1) / 2, (bmp.height - side) * (oy + 1) / 2, side, side, 0, 0, 128, 128);
      clearTimeout(tm); tm = setTimeout(async () => { const u = await make(bmp, +z.value, ox, oy); info.textContent = Math.round(u.length * 0.75 / 100) / 10 + ' KB'; }, 250);
    };
    cv.addEventListener('pointerdown', (e) => {
      const side = base / +z.value;
      drag = { x: e.clientX, y: e.clientY, sx: (bmp.width - side) * (ox + 1) / 2, sy: (bmp.height - side) * (oy + 1) / 2 };
      try { cv.setPointerCapture(e.pointerId); } catch (er) { /* ok */ }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const side = base / +z.value, k = side / (cv.clientWidth || 128), rw = bmp.width - side, rh = bmp.height - side;
      const sx = drag.sx - (e.clientX - drag.x) * k, sy = drag.sy - (e.clientY - drag.y) * k;
      ox = rw > 0 ? Math.max(-1, Math.min(1, sx * 2 / rw - 1)) : 0; oy = rh > 0 ? Math.max(-1, Math.min(1, sy * 2 / rh - 1)) : 0;
      paint();
    });
    const up = () => { drag = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    z.addEventListener('input', paint);
    const close = () => { clearTimeout(tm); wrap.remove(); bmp.close && bmp.close(); };
    no.onclick = close;
    ok.onclick = async () => { ok.disabled = true; const u = await make(bmp, +z.value, ox, oy); close(); if (u && RE.test(u)) setMine(u); };
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    paint(); ok.focus();
  }
  function mount(box) {
    if (!box) return;
    if (!box.firstChild) {
      ctl = box; box.classList.add('av-ctl');
      const row = el('div', 'pf-btns');
      const pick = el('button', 'ol-btn', 'CHANGE AVATAR'); pick.type = 'button'; pick.dataset.av = 'pick';
      const rm = el('button', 'ol-btn danger', 'REMOVE AVATAR'); rm.type = 'button'; rm.dataset.av = 'rm';
      const fi = el('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.hidden = true;
      pick.onclick = () => { if (!myBlock()) fi.click(); };
      fi.onchange = () => { const f = fi.files && fi.files[0]; fi.value = ''; openFile(f); };
      rm.onclick = () => setMine('');
      row.appendChild(pick); row.appendChild(rm); row.appendChild(fi); box.appendChild(row);
      const lab = el('label', 'av-show'); const cb = el('input'); cb.type = 'checkbox'; lab.appendChild(cb); lab.appendChild(el('span', '', ' SHOW OTHER PLAYERS’ AVATARS'));
      cb.onchange = () => { showOthers = cb.checked; ls.set(K_SHOW, showOthers ? '1' : '0'); emit(); };
      box.appendChild(lab); box.appendChild(el('p', 'v-note av-note'));
      const over = (e) => { e.preventDefault(); box.classList.add('drop'); };
      const leave = () => box.classList.remove('drop');
      ['dragenter', 'dragover'].forEach((n) => { box.addEventListener(n, over); const h = document.getElementById('pf-av'); if (h) h.addEventListener(n, over); });
      ['dragleave', 'dragend'].forEach((n) => box.addEventListener(n, leave));
      const drop = (e) => { e.preventDefault(); leave(); if (!myBlock() && e.dataTransfer && e.dataTransfer.files[0]) openFile(e.dataTransfer.files[0]); };
      box.addEventListener('drop', drop); const h = document.getElementById('pf-av'); if (h) h.addEventListener('drop', drop);
    }
    ctl = box; checkMod(); status();
  }
  subs.add(status);

  window.NexaAvatar = {
    url, mount, ingest, announce, mine: () => (mine && !myBlock() ? mine.u : ''), mineHash: () => (mine ? mine.h : ''),
    on: (f) => { subs.add(f); return () => subs.delete(f); },
    hide(key, on) { const r = byKey.get(key); [key, r && r.pk, r && r.pid].filter(Boolean).forEach((k) => { if (on) hidden.add(k); else hidden.delete(k); }); ls.set(K_HIDE, JSON.stringify(Array.from(hidden).slice(-300))); emit(); },
    isHidden: (key) => { const r = byKey.get(key); return hidden.has(key) || !!(r && ((r.pk && hidden.has(r.pk)) || (r.pid && hidden.has(r.pid)))); },
    pkOf: (key) => { const r = byKey.get(key); return r ? r.pk : (HEX64.test(key) ? key : ''); },
    has: (key) => byKey.has(key),
    get showOthers() { return showOthers; },
    refresh: emit, sane, RE, MAXC, checkMod
  };
}());
