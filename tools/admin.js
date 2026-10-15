(function () {
  'use strict';
  const K = window.NexaSchnorr, $ = (id) => document.getElementById(id);
  const HEX64 = /^[0-9a-f]{64}$/, KB = 30791, KB2 = 30078, KG = 7790, KG2 = 27790, KA = 7791, KA2 = 27791, KPRES = 27780, KPROF = 30780, MAXKP = 2147483647;
  const sec = () => Math.floor(Date.now() / 1000);
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ok */ } } };
  const jp = (s, d) => { try { const j = JSON.parse(s); return j == null ? d : j; } catch (e) { return d; } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const short = (pk) => pk.slice(0, 4) + '-' + pk.slice(4, 8) + '-' + pk.slice(8, 12);
  const ago = (s) => (s < 60 ? s + ' с' : s < 3600 ? Math.floor(s / 60) + ' мин' : Math.floor(s / 3600) + ' ч');
  const q = new URLSearchParams(location.search);

  let lastBans = [], key = null, avb = jp(ls.get('nexaAdminAvb'), {}), bans = jp(ls.get('nexaAdminBans'), {}), banAt = +ls.get('nexaAdminBanAt') || 0, LOG = jp(ls.get('nexaAdminLog'), []);
  const AVRE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*$/, AV = {}, P = {}, grants = {}, track = {}, socks = new Map(), subs = new Map(), outbox = [];
  const log = (t, d) => { LOG.push({ t: Date.now(), a: t, d }); LOG = LOG.slice(-500); ls.set('nexaAdminLog', JSON.stringify(LOG)); drawLog(); };

  function setKey(skHex) {
    if (!HEX64.test(skHex)) return false;
    try { const sk = K.unhex(skHex); key = { sk, pk: K.hex(K.pubkey(sk)) }; } catch (e) { return false; }
    ls.set('nexaAdminSk', skHex); drawKey(); resub(); return true;
  }
  function drawKey() {
    const b = $('keybox'); b.textContent = '';
    const add = (h) => { const d = document.createElement('div'); d.className = 'row'; d.innerHTML = h; b.appendChild(d); return d; };
    if (!key) {
      add('<span class="bad">Ключа нет.</span>');
      add('<button id="knew">Создать ключ</button>');
      add('<input id="kimp" placeholder="импорт секретного ключа (64 hex)" size="30"><button id="kimpb">Импорт</button>');
      add('<span class="mu">Секрет хранится только в localStorage этой страницы. Сразу скачайте бэкап.</span>');
    } else {
      add('<span class="ok">Ключ готов.</span> <span class="mu">Публичный ключ:</span>');
      add('<code>' + key.pk + '</code>');
      add('<span class="mu">Вставьте в js/adminkey.js игры:</span>');
      add('<code id="snip">window.NEXA_ADMIN_PUB = \'' + key.pk + '\';</code>');
      add('<button id="kcopy">Копировать строку</button><button id="kbak">Скачать бэкап</button><button id="kdel" class="d">Забыть ключ</button>');
    }
    $('who').textContent = key ? 'админ ' + short(key.pk) : 'нет ключа';
    const on = (id, f) => { const e = $(id); if (e) e.onclick = f; };
    on('knew', () => { setKey(K.hex(K.newKey().sk)); log('ключ создан', key.pk); });
    on('kimpb', () => { if (!setKey(($('kimp').value || '').trim().toLowerCase())) alert('Неверный ключ'); else log('ключ импортирован', key.pk); });
    on('kcopy', () => { const t = $('snip').textContent; if (navigator.clipboard) navigator.clipboard.writeText(t); });
    on('kbak', () => {
      const a = document.createElement('a'); a.download = 'nexa-admin-key-backup.txt';
      a.href = URL.createObjectURL(new Blob(['NEXA admin key backup. KEEP SECRET. Do not commit or share.\npublic: ' + key.pk + '\nsecret: ' + K.hex(key.sk) + '\n'], { type: 'text/plain' }));
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    on('kdel', () => { if (confirm('Удалить ключ из этой страницы? Без бэкапа он будет потерян.')) { key = null; ls.set('nexaAdminSk', ''); drawKey(); } });
  }

  // ---- релеи
  function relayList() {
    const o = q.getAll('relay').filter((u) => /^wss?:\/\//.test(u));
    if (o.length) return o;
    const S = window.NexaServers; return S ? S.NOSTR_VERIFIED.slice(0, 12) : [];
  }
  function subSend(ws, id, f) { try { ws.send(JSON.stringify(['REQ', id, ...f])); } catch (e) { /* ok */ } }
  function connect(url) {
    let ws; try { ws = new WebSocket(url); } catch (e) { return; }
    const r = { ws, open: false }; socks.set(url, r);
    ws.onopen = () => { r.open = true; subs.forEach((f, id) => subSend(ws, id, f)); outbox.forEach((m) => { try { ws.send(m); } catch (e) { /* ok */ } }); drawRelays(); };
    ws.onmessage = (m) => {
      const j = jp(m.data, null); if (!Array.isArray(j)) return;
      if (j[0] === 'OK') { const t = track[j[1]]; if (t) { if (j[2]) t.ok += 1; else { t.no += 1; t.why[String(j[3] || '').slice(0, 60)] = 1; } } return; }
      if (j[0] !== 'EVENT' || !j[2]) return;
      const e = j[2]; if (!K.checkEvent(e)) return; onEvent(e);
    };
    ws.onclose = () => { socks.delete(url); drawRelays(); };
    ws.onerror = () => { try { ws.close(); } catch (e) { /* ok */ } };
  }
  function tickNet() { relayList().forEach((u) => { if (!socks.has(u)) connect(u); }); }
  function publish(e) {
    const m = JSON.stringify(['EVENT', e]); let n = 0;
    socks.forEach((r) => { if (r.open) { try { r.ws.send(m); n += 1; } catch (er) { /* ok */ } } });
    track[e.id] = { ok: 0, no: 0, why: {}, sent: n };
    return n;
  }
  function resub() {
    if (!key) return;
    subs.clear();
    subs.set('pres', [{ kinds: [KPRES], '#p': [key.pk], since: sec() - 300 }]);
    subs.set('pres2', [{ kinds: [KPRES], since: sec() - 300, limit: 200 }]);
    subs.set('ack', [{ kinds: [KA, KA2], '#p': [key.pk], since: sec() - 3600 }]);
    subs.set('ack2', [{ kinds: [KA, KA2], since: sec() - 3600, limit: 200 }]);
    subs.set('avs', [{ kinds: [KPROF], since: sec() - 86400 * 14, limit: 300 }]);
    subs.set('bans', [{ kinds: [KB, KB2], authors: [key.pk], '#d': ['nexa-bans'], limit: 1 }]);
    subs.set('bans2', [{ kinds: [KB, KB2], authors: [key.pk], limit: 5 }]);
    socks.forEach((r) => { if (r.open) subs.forEach((f, id) => subSend(r.ws, id, f)); });
  }
  const drawRelays = () => { const n = Array.from(socks.values()).filter((r) => r.open).length; $('relays').textContent = 'релеев: ' + n + '/' + relayList().length; $('relays').className = n ? 'ok' : 'bad'; };

  // ---- события
  function onEvent(e) {
    if (!key || Math.abs(e.created_at - sec()) > 86400) return;
    if (e.kind === KPRES && e.pubkey !== key.pk && e.tags.some((t) => t[0] === 'p' && t[1] === key.pk) && Math.abs(e.created_at - sec()) < 300) {
      const c = jp(e.content, null); if (!c) return;
      P[e.pubkey] = Object.assign(P[e.pubkey] || {}, { n: String(c.n || '').slice(0, 16), l: c.l | 0, s: String(c.s || '').slice(0, 10), rm: String(c.rm || '').slice(0, 40), m: String(c.m || '').slice(0, 10), g: c.g | 0, t: Date.now() });
      drawPlayers();
    } else if ((e.kind === KA || e.kind === KA2) && e.tags.some((t) => t[0] === 'p' && t[1] === key.pk)) {
      const c = jp(e.content, {}), g = grants[c.i] || Object.keys(grants).map((k) => grants[k]).find((x) => x.ids.indexOf((e.tags.find((t) => t[0] === 'e') || [])[1]) >= 0);
      if (g && g.to === e.pubkey && c.ok === 0) {
        g.seen = true; if (g.why !== c.w) { g.why = c.w; log('не применено', short(g.to) + ' · ' + g.n + ' KP · ' + (WHY[c.w] || c.w) + (c.f ? ' · флаги: ' + flagTxt(c.f) : '')); }
        drawGrants();
      } else if (g && g.to === e.pubkey && !g.ack) { g.ack = true; g.seen = true; g.bal = c.n > 0 && Number.isInteger(c.b) ? [c.b - c.n, c.b] : null; log('подтверждено', short(g.to) + ' получил ' + g.n + ' KP' + (g.bal ? ' · баланс игрока: ' + g.bal[0] + ' → ' + g.bal[1] : (Number.isInteger(c.b) ? ' · баланс игрока: ' + c.b : ''))); drawGrants(); }
    } else if ((e.kind === KB || e.kind === KB2) && e.pubkey === key.pk && e.created_at > banAt) {
      const c = jp(e.content, null); if (c && c.bans) { bans = {}; c.bans.forEach((b) => { if (b && HEX64.test(b.k)) bans[b.k] = { r: b.r || '', u: b.u | 0 }; }); avb = {}; (c.av || []).forEach((b) => { if (b && HEX64.test(b.k)) avb[b.k] = { r: b.r || '', u: b.u | 0 }; }); drawAv(); banAt = e.created_at; saveBans(); drawBans(); }
    } else if (e.kind === KPROF) {
      const c = jp(e.content, null);
      if (c && typeof c.av === 'string' && c.av.length <= 12000 && AVRE.test(c.av) && (!AV[e.pubkey] || AV[e.pubkey].t <= e.created_at)) { AV[e.pubkey] = { u: c.av, t: e.created_at, n: String(c.n || '').slice(0, 16) }; drawAv(); }
      else if (c && !c.av && AV[e.pubkey] && AV[e.pubkey].t <= e.created_at) { delete AV[e.pubkey]; drawAv(); }
      if (c && P[e.pubkey] && e.pubkey === (P._want || '')) $('prof').textContent = short(e.pubkey) + ' · ' + (c.n || '') + ' LVL ' + (c.l || 0) + '\n' + JSON.stringify(c.st || {}, null, 1) + (c.cl ? '\nклан: ' + c.cl : '');
    }
  }
  const saveBans = () => { ls.set('nexaAdminAvb', JSON.stringify(avb)); ls.set('nexaAdminBans', JSON.stringify(bans)); ls.set('nexaAdminBanAt', String(banAt)); };
  function pubBans() {
    if (!key) return alert('Сначала создайте ключ');
    const now = sec(); Object.keys(bans).forEach((k) => { if (bans[k].u && bans[k].u < now) delete bans[k]; });
    banAt = Math.max(now, banAt + 1);
    const c = JSON.stringify({ v: 1, bans: Object.keys(bans).map((k) => ({ k, r: bans[k].r, u: bans[k].u })), av: Object.keys(avb).filter((k) => !avb[k].u || avb[k].u > now).map((k) => ({ k, r: avb[k].r, u: avb[k].u })) });
    lastBans = [KB, KB2].map((kd) => K.makeEvent(key, kd, [['d', 'nexa-bans']], c, banAt));
    saveBans(); drawBans(); return lastBans.map(publish)[0];
  }
  function ban(pk, reason, mins) {
    if (!HEX64.test(pk)) return alert('Неверный ID (нужно 64 hex)');
    bans[pk] = { r: String(reason || '').slice(0, 80), u: mins > 0 ? sec() + mins * 60 : 0 };
    const n = pubBans(); log('бан', short(pk) + ' · ' + (reason || '—') + ' · ' + (mins > 0 ? mins + ' мин' : 'навсегда') + ' · релеев: ' + n);
  }
  function unban(pk) { if (!bans[pk]) return; delete bans[pk]; const n = pubBans(); log('разбан', short(pk) + ' · релеев: ' + n); }
  function give(pk, n) {
    if (!key) return alert('Сначала создайте ключ');
    n = Math.floor(Number(n));
    if (!HEX64.test(pk)) return alert('Неверный ID (нужно 64 hex)');
    if (!(n >= 1 && n <= MAXKP)) return alert("Сумма 1…2 147 483 647");
    const x = sec() + 600, i = K.hex(crypto.getRandomValues(new Uint8Array(16))), c = JSON.stringify({ t: 'kp', n, x, i });
    const evs = [KG, KG2].map((kd) => K.makeEvent(key, kd, [['p', pk]], c));
    const g = grants[i] = { to: pk, n, x, i, ack: false, evs, ids: evs.map((e) => e.id), tries: 1 };
    const nr = evs.map(publish)[0]; g.relays = nr;
    const pp = P[pk], live = pp && Date.now() - pp.t < 120000;
    log('выдача KP', short(pk) + ' · ' + n + ' KP · релеев: ' + nr + ' · повторяю каждые 5 с до подтверждения (10 мин)' + (live ? '' : ' · ВНИМАНИЕ: игрока нет в списке «в сети» (он должен быть в онлайне/лобби, иначе админ-канал у него спит)'));
    if (!nr) log('НЕ доставлено', 'нет открытых релеев');
    if (window.NEXA_ADMIN_PUB && window.NEXA_ADMIN_PUB !== key.pk) log('НЕ доставлено', 'ключ админки не совпадает с js/adminkey.js игры: игроки отклонят подпись (SIG)');
    drawGrants();
    const tm = setInterval(() => {
      if (g.ack) { clearInterval(tm); return; }
      if (sec() > g.x) { clearInterval(tm); g.dead = true; drawGrants(); log('НЕ подтверждено', short(pk) + ' · ' + n + ' KP: ' + (g.seen ? 'игрок ответил: ' + (WHY[g.why] || g.why) : 'нет ответа 10 мин: игрок не в сети, не слушает админ-канал или нет общих релеев') + '; выдайте заново'); return; }
      g.tries += 1; g.relays = g.evs.map(publish)[0];
    }, 5000);
  }

  const WHY = { SINGLE: 'игра открыта в другой вкладке (нужна главная вкладка)', INTEG: 'файлы игры изменены', SIG: 'подпись не сходится: ключ админки не совпадает с js/adminkey.js игры', EXPIRED: 'грант просрочен (часы игрока/админа расходятся?)', BAD: 'неверный формат или расхождение часов более 2 мин', TARGET: 'грант для другого ID', AMOUNT: 'сумма вне лимита', CAP: 'потолок баланса', STORE: 'не удалось записать в хранилище игрока (nonce не сожжён, повтор позже)', VERIFY: 'запись в хранилище не прошла проверку (nonce не сожжён)' };
  function gStatus(g) {
    if (g.ack) return '<span class="ok">применено' + (g.bal ? ', баланс ' + g.bal[0] + ' → ' + g.bal[1] : '') + '</span>';
    if (g.seen) return '<span class="bad">доставлено, не применено: ' + esc(WHY[g.why] || g.why || '?') + '</span>';
    if (g.dead) return '<span class="bad">нет ответа 10 мин</span>';
    return '<span class="mu">отправлено в ' + g.relays + ' релеев, ждём ответ</span>';
  }
  function drawGrants() {
    const d = $('gl'); if (!d) return;
    d.innerHTML = Object.keys(grants).map((k) => grants[k]).sort((a, b) => b.x - a.x).slice(0, 15).map((g) => '<div><code>' + short(g.to) + '</code> ' + g.n + ' KP · ' + gStatus(g) + '</div>').join('');
  }
  const said = {};
  function summ() {
    Object.keys(track).forEach((id) => {
      const t = track[id]; if (said[id] || !(t.ok + t.no)) return; said[id] = 1;
      if (t.no) log('релеи отказали', t.no + ' из ' + (t.ok + t.no) + ': ' + Object.keys(t.why).join('; '));
    });
    Object.keys(track).slice(0, -300).forEach((k) => { delete track[k]; delete said[k]; });
  }
  // ---- интерфейс
  const flagTxt = (g) => [g & 1 ? 'DEVTOOLS' : '', g & 2 ? 'ФАЙЛЫ' : '', g & 4 ? 'ХРАНИЛИЩЕ' : ''].filter(Boolean).join(' ');
  function drawPlayers() {
    const f = ($('flt').value || '').trim().toLowerCase(), tb = $('pl'); tb.textContent = '';
    const ks = Object.keys(P).filter((k) => k !== '_want' && (!f || (k + ' ' + P[k].n + ' ' + P[k].rm).toLowerCase().indexOf(f) >= 0)).sort((a, b) => P[b].t - P[a].t);
    let on = 0;
    ks.forEach((k) => {
      const p = P[k], age = Math.floor((Date.now() - p.t) / 1000), live = age < 120; if (live) on += 1;
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + thumb(k, 28) + '</td><td><code title="' + k + '">' + short(k) + '</code></td><td>' + esc(p.n) + (bans[k] ? ' <span class="bad">[БАН]</span>' : '') + '</td><td>' + p.l + '</td><td class="' + (live ? 'st-' + p.s : 'st-off') + '">' + (live ? esc(p.s) : 'не в сети') + '</td><td>' + esc(p.rm || '') + (p.m ? ' · ' + esc(p.m) : '') + '</td><td class="bad">' + flagTxt(p.g) + '</td><td>' + ago(age) + '</td><td></td>';
      const td = tr.lastChild, mk = (t, c, fn) => { const b = document.createElement('button'); b.textContent = t; if (c) b.className = c; b.onclick = fn; td.appendChild(b); td.appendChild(document.createTextNode(' ')); };
      mk('Профиль', '', () => openProfile(k)); mk('KP', 'g', () => { $('gk').value = k; $('gn').focus(); }); mk('Бан', 'd', () => { $('bk').value = k; $('br').focus(); });
      tb.appendChild(tr);
    });
    $('cnt').textContent = 'в сети: ' + on + ' · всего видели: ' + ks.length;
  }
  const avOn = (pk) => avb[pk] && (!avb[pk].u || avb[pk].u > sec());
  function thumb(pk, px) {
    const a = AV[pk]; if (!a) return '<span class="mu">—</span>';
    return avOn(pk) ? '<span class="bad" title="аватар снят">✖</span>' : '<img class="th" data-pk="' + pk + '" width="' + px + '" height="' + px + '" src="' + a.u + '" alt="">';
  }
  function avAct(pk, mins, why) {
    if (!HEX64.test(pk)) return;
    avb[pk] = { r: String(why || 'avatar').slice(0, 80), u: mins > 0 ? sec() + mins * 60 : 0 };
    const n = pubBans(); log('снят аватар', short(pk) + ' · ' + (mins > 0 ? mins + ' мин' : 'навсегда') + ' · релеев: ' + n); drawAv();
  }
  function avRestore(pk) { if (!avb[pk]) return; delete avb[pk]; const n = pubBans(); log('аватар возвращён', short(pk) + ' · релеев: ' + n); drawAv(); }
  function avModal(pk) {
    const a = AV[pk], m = $('avm'); if (!a) return;
    $('avm-img').src = a.u; $('avm-id').textContent = (a.n || (P[pk] && P[pk].n) || '') + ' · ' + pk + ' · ' + new Date(a.t * 1000).toLocaleString();
    m.hidden = false; m.dataset.pk = pk;
  }
  function drawAv() {
    const g = $('avg'); if (!g) return; g.textContent = '';
    Object.keys(AV).sort((x, y) => AV[y].t - AV[x].t).forEach((k) => {
      const a = AV[k], d = document.createElement('div'); d.className = 'avi' + (avOn(k) ? ' off' : '');
      d.innerHTML = '<img src="' + a.u + '" width="64" height="64" alt="" data-pk="' + k + '"><b>' + esc(a.n || (P[k] && P[k].n) || '?') + '</b><small>' + short(k) + '<br>' + ago(sec() - a.t) + (bans[k] ? ' · БАН' : '') + (avOn(k) ? ' · снят' : '') + '</small>';
      g.appendChild(d);
    });
    $('avc').textContent = 'аватарок: ' + Object.keys(AV).length + ' · снято: ' + Object.keys(avb).filter(avOn).length;
    drawPlayers();
  }
  function openProfile(pk) {
    P._want = pk; $('prof').textContent = 'загрузка профиля…';
    subs.set('prof', [{ kinds: [KPROF], authors: [pk], limit: 1 }]);
    socks.forEach((r) => { if (r.open) subSend(r.ws, 'prof', subs.get('prof')); });
  }
  function drawBans() {
    const tb = $('bl'); tb.textContent = '';
    Object.keys(bans).forEach((k) => {
      const b = bans[k], tr = document.createElement('tr');
      tr.innerHTML = '<td><code title="' + k + '">' + short(k) + '</code></td><td>' + esc(b.r) + '</td><td>' + (b.u ? new Date(b.u * 1000).toLocaleString() : 'навсегда') + '</td><td></td>';
      const bt = document.createElement('button'); bt.textContent = 'Разбан'; bt.onclick = () => unban(k); tr.lastChild.appendChild(bt); tb.appendChild(tr);
    });
  }
  function drawLog() {
    const d = $('log'); d.innerHTML = LOG.slice(-60).reverse().map((l) => '<div><span class="mu">' + new Date(l.t).toLocaleTimeString() + '</span> <b>' + esc(l.a) + '</b> ' + esc(l.d) + '</div>').join('');
  }

  document.addEventListener('click', (e) => { const i = e.target.closest && e.target.closest('img[data-pk]'); if (i) avModal(i.dataset.pk); });
  $('avm-x').onclick = () => { $('avm').hidden = true; };
  $('avm-ban').onclick = () => { const pk = $('avm').dataset.pk; $('bk').value = pk; $('br').value = 'avatar'; $('avm').hidden = true; $('br').focus(); };
  $('avm-rm').onclick = () => { avAct($('avm').dataset.pk, +$('avm-d').value, 'avatar'); $('avm').hidden = true; };
  $('avm-back').onclick = () => { avRestore($('avm').dataset.pk); $('avm').hidden = true; };
  $('flt').oninput = drawPlayers;
  $('bban').onclick = () => ban(($('bk').value || '').trim().toLowerCase(), $('br').value, +$('bd').value);
  $('bun').onclick = () => unban(($('bk').value || '').trim().toLowerCase());
  $('ggive').onclick = () => give(($('gk').value || '').trim().toLowerCase(), $('gn').value);
  drawKey(); drawBans(); drawLog(); drawAv();
  const saved = ls.get('nexaAdminSk'); if (saved) setKey(saved);
  tickNet(); setInterval(tickNet, 5000); setInterval(drawPlayers, 5000); setInterval(() => { lastBans.forEach(publish); }, 60000); setInterval(summ, 4000); setInterval(drawGrants, 5000); setInterval(() => { if (key) { socks.forEach((r) => { if (r.open) subSend(r.ws, 'pres', subs.get('pres')); }); } }, 60000);
  window.NexaAdminConsole = { ban, unban, give, avAct, avRestore, avb: () => avb, AV, state: () => ({ P, bans, grants, key: !!key, pub: key && key.pk }) };
}());
