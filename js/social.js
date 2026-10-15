(function () {
  'use strict';
  const T = window.Toys, K = window.NexaSchnorr, RM = window.NexaRoom, NN = window.NexaNet, PF = window.NexaProfile;
  if (!T || !T.ident || !K || !RM || !NN || !PF) return;
  const ID = T.ident;
  const KIND = { pres: 27780, msg: 27781, chat: 27783, clanChat: 27784, report: 27785, prof: 30780, score: 30781, clan: 30782, dm: 4 };
  const SKEY = 'nexaSocial', DMKEY = 'nexaDM';
  const now = () => Date.now(), sec = () => Math.floor(Date.now() / 1000);
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ok */ } } };
  const jparse = (s, d) => { try { const j = JSON.parse(s); return j && typeof j === 'object' ? j : d; } catch (e) { return d; } };
  const HEX64 = /^[0-9a-f]{64}$/;
  const ICONS = ['◆', '▲', '●', '■', '✚', '★', '⌖', '☗'];
  const CHANNELS = ['all', 'en', 'ru', 'de'];

  // ------------------------------------------------------------------ состояние
  const S = Object.assign({ friends: {}, mute: {}, block: {}, clan: '', seen: 0, ch: '', score: 0 }, jparse(ls.get(SKEY), {}));
  const DM = jparse(ls.get(DMKEY), {});
  const save = () => { ls.set(SKEY, JSON.stringify({ friends: S.friends, mute: S.mute, block: S.block, clan: S.clan, seen: S.seen, ch: S.ch })); };
  const saveDM = () => { Object.keys(DM).forEach((k) => { if (DM[k].length > 100) DM[k] = DM[k].slice(-100); }); const ks = Object.keys(DM); if (ks.length > 60) ks.slice(0, ks.length - 60).forEach((k) => { delete DM[k]; }); ls.set(DMKEY, JSON.stringify(DM)); };
  const me = () => ID.pk;
  const short = (pk) => (pk ? pk.slice(0, 4) + '-' + pk.slice(4, 8) + '-' + pk.slice(8, 12) : '');
  const lang = () => { const l = (window.I18N && I18N.lang) || 'en'; return CHANNELS.indexOf(l) > 0 ? l : 'en'; };
  const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
  const validName = (s) => clean(s, 16) || 'PLAYER';
  const AD = () => window.NexaAdmin, banMe = () => { const a = AD(); return a ? a.me() : null; };
  const ev = new EventTarget();
  const emit = (t, d) => ev.dispatchEvent(new CustomEvent(t, { detail: d }));

  // ------------------------------------------------------------------ шифр личных сообщений: ECDH (secp256k1) + HKDF + AES-GCM (WebCrypto). Это НЕ NIP-44.
  const b64 = (u8) => btoa(String.fromCharCode.apply(null, u8)), unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const keyCache = {};
  async function aesKey(peer) {
    if (keyCache[peer]) return keyCache[peer];
    const x = ID.ecdh(peer); if (!x) throw new Error('ecdh');
    const base = await crypto.subtle.importKey('raw', K.unhex(x), 'HKDF', false, ['deriveKey']);
    return (keyCache[peer] = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('nexa-dm-v1'), info: new Uint8Array(0) }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
  }
  async function seal(peer, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(peer), new TextEncoder().encode(text)));
    const o = new Uint8Array(12 + ct.length); o.set(iv); o.set(ct, 12); return b64(o);
  }
  async function open(peer, s) {
    const o = unb64(s); if (o.length < 29 || o.length > 4096) throw new Error('len');
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: o.slice(0, 12) }, await aesKey(peer), o.slice(12)));
  }

  // ------------------------------------------------------------------ сеть: до 3 живых релеев из общего списка серверов
  const NET = { socks: new Map(), subs: new Map(), seen: new Set(), t: 0, outbox: [], bad: {} };
  const MAXS = 3;
  const netOk = () => !!(RM.servers.on && RM.consented()) && (!window.NexaSingle || window.NexaSingle.owner());
  function pickRelays() {
    const have = new Set(NET.socks.keys());
    return RM.servers.list().filter((x) => x.type === 'nostr' && (x.state === 'online' || x.state === 'active') && !have.has(x.url) && (NET.bad[x.url] || 0) < now()).sort((a, b) => (a.ms || 9e9) - (b.ms || 9e9));
  }
  function subSend(ws, id, f) { try { ws.send(JSON.stringify(['REQ', id, ...f])); } catch (e) { /* ok */ } }
  function connect(url) {
    let ws; try { ws = new WebSocket(url); } catch (e) { NET.bad[url] = now() + 300000; return; }
    const r = { ws, url, open: false };
    NET.socks.set(url, r);
    const fail = () => { NET.socks.delete(url); NET.bad[url] = now() + 120000; try { ws.close(); } catch (e) { /* ok */ } };
    const to = setTimeout(() => { if (!r.open) fail(); }, 6000);
    ws.onopen = () => { r.open = true; clearTimeout(to); NET.subs.forEach((s, id) => subSend(ws, id, s.f)); NET.outbox.slice(-40).forEach((m) => { try { ws.send(m); } catch (e) { /* ok */ } }); emit('net', netInfo()); };
    ws.onmessage = (m) => {
      let j; try { j = JSON.parse(m.data); } catch (e) { return; }
      if (!Array.isArray(j) || j[0] !== 'EVENT' || !j[2]) return;
      const e = j[2];
      if (!e.id || NET.seen.has(e.id)) return;
      if (!K.checkEvent(e)) return;
      NET.seen.add(e.id); if (NET.seen.size > 4000) NET.seen.clear();
      if (AD() && AD().banned(e.pubkey)) return;
      const s = NET.subs.get(j[1]); if (s && s.cb) s.cb(e);
    };
    ws.onerror = () => { if (!r.open) { clearTimeout(to); fail(); } };
    ws.onclose = () => { clearTimeout(to); NET.socks.delete(url); if (r.open) emit('net', netInfo()); };
  }
  function netTick() {
    if (!netOk()) { NET.socks.forEach((r) => { try { r.ws.close(); } catch (e) { /* ok */ } }); NET.socks.clear(); emit('net', netInfo()); return; }
    if (NET.socks.size < MAXS) pickRelays().slice(0, MAXS - NET.socks.size).forEach((x) => connect(x.url));
    NET.outbox = NET.outbox.filter((o) => true);
  }
  const netInfo = () => ({ on: netOk(), up: Array.from(NET.socks.values()).filter((r) => r.open).length });
  function publish(e) {
    if (!e || !netOk()) return false;
    if ((e.kind === KIND.chat || e.kind === KIND.clanChat || e.kind === KIND.msg || e.kind === KIND.dm || e.kind === KIND.clan || e.kind === KIND.score || e.kind === KIND.prof) && banMe()) return false;
    const m = JSON.stringify(['EVENT', e]); let n = 0;
    NET.socks.forEach((r) => { if (r.open) { try { r.ws.send(m); n += 1; } catch (er) { /* ok */ } } });
    if (e.kind >= 30000 || e.kind === KIND.dm) { NET.outbox.push(m); if (NET.outbox.length > 60) NET.outbox.shift(); }
    return n > 0;
  }
  function subscribe(id, filters, cb) {
    NET.subs.set(id, { f: filters, cb });
    NET.socks.forEach((r) => { if (r.open) subSend(r.ws, id, filters); });
  }
  const unsubscribe = (id) => { NET.subs.delete(id); NET.socks.forEach((r) => { if (r.open) { try { r.ws.send(JSON.stringify(['CLOSE', id])); } catch (e) { /* ok */ } } }); };
  const mk = (kind, tags, content) => ID.event(kind, tags, content);

  // ------------------------------------------------------------------ присутствие и друзья
  const PRES = {};
  function myState() {
    const R = window.Missions && window.Missions.current, co = window.NexaCoop;
    if (R && co && co.active) { const s = co.session; return s && s.spec && s.spec.mode === 'br' ? 'battle' : 'match'; }
    if (window.OnlineLobby && window.OnlineLobby.active) return 'lobby';
    return 'online';
  }
  const pinfo = () => PF.publicInfo();
  function presEvent() {
    if (!me()) return null;
    const f = Object.keys(S.friends).filter((k) => S.friends[k].st === 'friend');
    const p = pinfo();
    const a = AD(), tags = f.slice(0, 40).map((k) => ['p', k]), o = { s: myState(), n: p.name, l: p.level };
    if (a && a.active) { tags.push(['p', a.pub]); o.g = a.flags(); const hs = RM.hosting, js = RM.joining; o.rm = String((hs && hs.id) || (js && js.id) || '').slice(0, 40); o.m = hs ? hs.mode : ''; }
    return mk(KIND.pres, tags, JSON.stringify(o));
  }
  function sendPresence() {
    if (!netOk() || !me()) return;
    publish(presEvent());
  }
  function subFriends() {
    const f = Object.keys(S.friends).filter((k) => S.friends[k].st === 'friend');
    if (!f.length) { unsubscribe('nx-pres'); return; }
    subscribe('nx-pres', [{ kinds: [KIND.pres], authors: f.slice(0, 100), since: sec() - 180 }], (e) => {
      const c = jparse(e.content, null); if (!c || e.created_at < sec() - 240) return;
      PRES[e.pubkey] = { s: ['online', 'lobby', 'match', 'battle'].indexOf(c.s) >= 0 ? c.s : 'online', t: now(), n: validName(c.n), l: Math.max(1, Math.min(999, c.l | 0 || 1)) };
      if (S.friends[e.pubkey]) { S.friends[e.pubkey].n = PRES[e.pubkey].n; S.friends[e.pubkey].l = PRES[e.pubkey].l; }
      emit('friends');
    });
  }
  const statusOf = (pk) => { const p = PRES[pk]; return p && now() - p.t < 120000 ? p.s : 'offline'; };
  function sendMsg(to, obj, encrypt) {
    const base = JSON.stringify(obj);
    if (!encrypt) return publish(mk(KIND.msg, [['p', to]], base));
    return seal(to, base).then((c) => publish(mk(KIND.msg, [['p', to], ['x', '1']], c)));
  }
  function addFriend(code) {
    code = String(code || '').trim().toLowerCase().replace(/[^0-9a-f]/g, '');
    if (!HEX64.test(code)) return { ok: false, err: 'BAD ID' };
    if (code === me()) return { ok: false, err: 'THAT IS YOU' };
    if (S.block[code]) return { ok: false, err: 'BLOCKED' };
    const f = S.friends[code];
    if (f && f.st === 'friend') return { ok: false, err: 'ALREADY FRIENDS' };
    if (f && f.st === 'in') return acceptFriend(code);
    S.friends[code] = { st: 'out', n: (f && f.n) || short(code), t: now() }; save();
    const p = pinfo();
    sendMsg(code, { t: 'req', n: p.name, l: p.level });
    emit('friends'); return { ok: true };
  }
  function acceptFriend(pk) {
    const f = S.friends[pk]; if (!f) return { ok: false };
    f.st = 'friend'; save(); const p = pinfo(); sendMsg(pk, { t: 'acc', n: p.name, l: p.level }); subFriends(); sendPresence(); emit('friends'); return { ok: true };
  }
  function removeFriend(pk) { if (S.friends[pk]) { const was = S.friends[pk].st; delete S.friends[pk]; save(); if (was === 'friend') sendMsg(pk, { t: 'rm' }); subFriends(); emit('friends'); } }
  let pendingInvite = '';
  function invite(pk) {
    const h = RM.hosting;
    if (!h || !h.id) return { ok: false, err: 'HOST A ROOM FIRST' };
    sendMsg(pk, { t: 'inv', room: h.id, n: pinfo().name, mode: h.mode, mission: h.mission }, true);
    return { ok: true };
  }
  function popup(text, accept, label) {
    const el = document.createElement('div'); el.className = 'sc-toast'; el.setAttribute('role', 'alert');
    const t = document.createElement('span'); t.textContent = text; el.appendChild(t);
    if (accept) { const b = document.createElement('button'); b.type = 'button'; b.className = 'ol-btn'; b.textContent = label || 'ACCEPT'; b.onclick = () => { accept(); el.remove(); }; el.appendChild(b); }
    const x = document.createElement('button'); x.type = 'button'; x.className = 'ol-btn'; x.textContent = '×'; x.setAttribute('aria-label', 'Close'); x.onclick = () => el.remove(); el.appendChild(x);
    document.body.appendChild(el); setTimeout(() => el.remove(), 20000);
  }
  async function onMsg(e) {
    if (e.pubkey === me() || S.block[e.pubkey]) return;
    const tags = e.tags || [], to = tags.find((t) => t[0] === 'p');
    if (!to || to[1] !== me()) return;
    let c = null;
    if (tags.some((t) => t[0] === 'x')) { try { c = jparse(await open(e.pubkey, e.content), null); } catch (er) { return; } } else c = jparse(e.content, null);
    if (!c || typeof c.t !== 'string') return;
    const pk = e.pubkey, name = validName(c.n), f = S.friends[pk];
    if (c.t === 'req') {
      if (S.mute[pk]) return;
      if (f && f.st === 'out') { acceptFriend(pk); return; }
      if (f && f.st === 'friend') return;
      S.friends[pk] = { st: 'in', n: name, l: c.l | 0, t: now() }; save(); emit('friends'); popup(name + ' WANTS TO BE FRIENDS', () => acceptFriend(pk));
    } else if (c.t === 'acc' && f && f.st === 'out') { f.st = 'friend'; f.n = name; save(); subFriends(); emit('friends'); popup(name + ' ACCEPTED YOUR REQUEST'); }
    else if (c.t === 'rm' && f) { delete S.friends[pk]; save(); subFriends(); emit('friends'); }
    else if (c.t === 'inv' && f && f.st === 'friend' && /^[a-z0-9_-]{4,40}$/.test(String(c.room))) {
      popup(name + ' INVITES YOU TO PLAY', () => join(String(c.room)), 'JOIN');
    } else if (c.t === 'cjoin' && S.clan && c.c === S.clan) { clanRequest(pk, name, c.c); }
    else if (c.t === 'cleave' && S.clan && c.c === S.clan) clanRemove(pk);
  }
  function join(rid) { if (window.OnlineLobby && OnlineLobby.active) OnlineLobby.join(rid); else { pendingInvite = rid; if (window.OnlineLobby) OnlineLobby.action('online'); } }

  // ------------------------------------------------------------------ личные сообщения (kind 4, содержимое зашифровано, история только локально)
  async function sendDM(pk, text) {
    text = clean(text, 400); if (!text || !HEX64.test(pk) || S.block[pk]) return false;
    const m = { me: 1, t: now(), x: text };
    (DM[pk] || (DM[pk] = [])).push(m); saveDM(); emit('dm', pk);
    return publish(mk(KIND.dm, [['p', pk], ['t', 'nexa-dm']], await seal(pk, JSON.stringify({ x: text, n: pinfo().name }))));
  }
  function subDM() {
    subscribe('nx-msg', [{ kinds: [KIND.msg], '#p': [me()], since: sec() - 600 }], onMsg);
    subscribe('nx-dm', [{ kinds: [KIND.dm], '#p': [me()], since: Math.max(sec() - 86400 * 3, Math.floor((S.seen || 0) / 1000)) }], async (e) => {
      if (S.block[e.pubkey] || S.mute[e.pubkey] || e.pubkey === me()) return;
      let c; try { c = jparse(await open(e.pubkey, e.content), null); } catch (er) { return; }
      if (!c || typeof c.x !== 'string') return;
      const list = DM[e.pubkey] || (DM[e.pubkey] = []), t = e.created_at * 1000;
      if (list.some((m) => m.t === t && m.x === c.x)) return;
      list.push({ t, x: clean(c.x, 400) }); list.sort((a, b) => a.t - b.t); saveDM(); S.seen = Math.max(S.seen || 0, t); save();
      if (S.friends[e.pubkey]) { S.friends[e.pubkey].n = validName(c.n); }
      emit('dm', e.pubkey);
      if (!(DMOPEN === e.pubkey)) popup(validName(c.n) + ': ' + clean(c.x, 60));
    });
  }
  let DMOPEN = '';

  // ------------------------------------------------------------------ общий чат по каналам (эфемерные подписанные события)
  const CHAT = { rows: [], last: 0, lastText: '', lastAt: 0, per: {} };
  const LINK = /(https?:|www\.|\b[a-z0-9-]+\.(com|net|org|ru|de|io|gg|xyz|me|tv|ly|to|cc)\b|t\.me\/)/i;
  function chatCh() { return CHANNELS.indexOf(S.ch) >= 0 ? S.ch : lang(); }
  function subChat() {
    const ch = chatCh();
    unsubscribe('nx-chat');
    subscribe('nx-chat', [{ kinds: [KIND.chat], '#t': ['nexa-lobby-' + ch], since: sec() - 600, limit: 60 }], (e) => {
      if (banMe() || S.block[e.pubkey] || S.mute[e.pubkey] || e.created_at < sec() - 900 || e.created_at > sec() + 120) return;
      const t = now(), lastT = CHAT.per[e.pubkey] || 0; if (t - lastT < 700 && e.pubkey !== me()) return; CHAT.per[e.pubkey] = t;
      const c = jparse(e.content, null); if (!c) return;
      const text = clean(c.m, 140); if (!text || LINK.test(text)) return;
      if (CHAT.rows.some((r) => r.pk === e.pubkey && r.m === text && Math.abs(r.t - e.created_at * 1000) < 30000)) return;
      CHAT.rows.push({ pk: e.pubkey, n: validName(c.n), l: Math.max(1, Math.min(999, c.l | 0 || 1)), m: text, t: e.created_at * 1000, id: e.id });
      CHAT.rows.sort((a, b) => a.t - b.t); if (CHAT.rows.length > 120) CHAT.rows.shift();
      emit('chat');
    });
  }
  function sendChat(text) {
    text = clean(text, 140);
    if (!text) return { ok: false, err: '' };
    if (banMe()) return { ok: false, err: 'BLOCKED' };
    if (LINK.test(text)) return { ok: false, err: 'LINKS ARE NOT ALLOWED' };
    if (now() - CHAT.last < 2000) return { ok: false, err: 'SLOW DOWN' };
    if (text === CHAT.lastText && now() - CHAT.lastAt < 30000) return { ok: false, err: 'DUPLICATE MESSAGE' };
    const p = pinfo();
    if (!publish(mk(KIND.chat, [['t', 'nexa-lobby-' + chatCh()]], JSON.stringify({ n: p.name, l: p.level, m: text })))) return { ok: false, err: 'NO SERVERS' };
    CHAT.last = CHAT.lastAt = now(); CHAT.lastText = text;
    CHAT.rows.push({ pk: me(), n: p.name, l: p.level, m: text, t: now(), id: 'me' + now() }); emit('chat'); return { ok: true };
  }
  function setChannel(c) { S.ch = c; save(); CHAT.rows = []; subChat(); emit('chat'); }
  const mute = (pk, v) => { if (v) S.mute[pk] = 1; else delete S.mute[pk]; save(); CHAT.rows = CHAT.rows.filter((r) => !S.mute[r.pk]); emit('chat'); emit('friends'); };
  const block = (pk, v) => { if (v) { S.block[pk] = 1; delete S.friends[pk]; } else delete S.block[pk]; save(); CHAT.rows = CHAT.rows.filter((r) => !S.block[r.pk]); emit('chat'); emit('friends'); };
  function report(pk, why) { mute(pk, true); publish(mk(KIND.report, [['p', pk]], JSON.stringify({ r: clean(why || 'spam', 40) }))); }

  // ------------------------------------------------------------------ профили и рейтинг
  const PROFS = {};
  const myScore = () => { const st = PF.get().stats || {}; return Math.max(0, (st.kills | 0) + (st.matches | 0) * 5 + (st.wins | 0) * 25); };
  function pubProfile() {
    if (!netOk() || !me()) return;
    const p = PF.get(), pi = pinfo(), sh = PF.shareable ? PF.shareable() : null;
    publish(mk(KIND.prof, [['d', 'nexa-profile']], JSON.stringify({ n: pi.name, l: pi.level, c: pi.color, cl: S.clan || '', st: sh && sh.stats ? sh.stats : p.stats })));
    publish(mk(KIND.score, [['d', 'nexa-score']], JSON.stringify({ n: pi.name, l: pi.level, sc: myScore() })));
  }
  function loadProfile(pk, cb) {
    if (PROFS[pk] && now() - PROFS[pk].t < 60000) { cb(PROFS[pk]); return; }
    const id = 'nx-pf' + pk.slice(0, 8);
    subscribe(id, [{ kinds: [KIND.prof], authors: [pk], limit: 1 }], (e) => {
      const c = jparse(e.content, null); if (!c) return;
      PROFS[pk] = { t: now(), n: validName(c.n), l: Math.max(1, Math.min(999, c.l | 0 || 1)), cl: clean(c.cl, 8), st: c.st && typeof c.st === 'object' ? c.st : {}, at: e.created_at };
      cb(PROFS[pk]); unsubscribe(id);
    });
    setTimeout(() => unsubscribe(id), 8000);
  }
  const BOARD = { rows: [] };
  function subBoard() {
    subscribe('nx-board', [{ kinds: [KIND.score], limit: 300 }], (e) => {
      const c = jparse(e.content, null); if (!c) return;
      const sc = Math.max(0, Math.min(1e7, c.sc | 0));
      const r = BOARD.rows.find((x) => x.pk === e.pubkey);
      if (r && r.at >= e.created_at) return;
      const row = { pk: e.pubkey, n: validName(c.n), l: Math.max(1, Math.min(999, c.l | 0 || 1)), sc, at: e.created_at };
      if (r) Object.assign(r, row); else BOARD.rows.push(row);
      BOARD.rows.sort((a, b) => b.sc - a.sc); if (BOARD.rows.length > 300) BOARD.rows.length = 300;
      emit('board');
    });
  }
  function rewardCheck() {
    const i = BOARD.rows.findIndex((r) => r.pk === me());
    if (i >= 0 && i < 10 && BOARD.rows[i].sc > 0 && T.rankReward) { const n = T.rankReward(i + 1); if (n) popup('RANKING REWARD: +' + n + ' KP (TOP ' + (i + 1) + ')'); }
  }

  // ------------------------------------------------------------------ кланы (владелец — по ключу; состав публикует владелец)
  const CLANS = { list: {}, reqs: [] };
  const cid = (e) => { const d = (e.tags.find((t) => t[0] === 'd') || [])[1] || ''; return /^clan:[0-9a-f]{6}$/.test(d) ? d.slice(5) : ''; };
  function subClans() {
    subscribe('nx-clans', [{ kinds: [KIND.clan], limit: 120 }], (e) => {
      const id = cid(e), c = jparse(e.content, null); if (!id || !c) return;
      const cur = CLANS.list[id];
      if (cur && (cur.at >= e.created_at || (cur.o !== e.pubkey))) return;
      CLANS.list[id] = { id, o: e.pubkey, n: clean(c.n, 16) || 'CLAN', ic: ICONS.indexOf(c.ic) >= 0 ? c.ic : ICONS[0], m: Array.isArray(c.m) ? c.m.filter((x) => HEX64.test(x)).slice(0, 50) : [], at: e.created_at };
      if (!S.clan && CLANS.list[id].m.indexOf(me()) >= 0) { S.clan = id; S.clanT = now(); save(); subClanChat(); pubProfile(); }
      if (S.clan === id && CLANS.list[id].m.indexOf(me()) < 0 && now() - (S.clanT || 0) > 30000) { S.clan = ''; save(); unsubscribe('nx-cchat'); }
      emit('clans');
    });
    if (S.clan) subClanChat();
  }
  function pubClan(c) { publish(mk(KIND.clan, [['d', 'clan:' + c.id]], JSON.stringify({ n: c.n, ic: c.ic, m: c.m }))); c.at = sec(); CLANS.list[c.id] = c; emit('clans'); }
  function createClan(name, icon) {
    name = clean(name, 16); if (name.length < 3) return { ok: false, err: 'NAME TOO SHORT' };
    if (S.clan) return { ok: false, err: 'ALREADY IN A CLAN' };
    const id = K.hex(K.randBytes ? K.randBytes(3) : crypto.getRandomValues(new Uint8Array(3)));
    const c = { id, o: me(), n: name, ic: ICONS.indexOf(icon) >= 0 ? icon : ICONS[0], m: [me()], at: sec() };
    S.clan = id; save(); pubClan(c); subClanChat(); pubProfile(); return { ok: true };
  }
  function joinClan(id) {
    const c = CLANS.list[id]; if (!c || S.clan) return { ok: false, err: 'UNAVAILABLE' };
    sendMsg(c.o, { t: 'cjoin', c: id, n: pinfo().name }); return { ok: true };
  }
  function clanRequest(pk, name, id) { if (!CLANS.reqs.some((r) => r.pk === pk)) { CLANS.reqs.push({ pk, n: name }); emit('clans'); popup(name + ' WANTS TO JOIN YOUR CLAN'); } }
  function clanAccept(pk) {
    const c = CLANS.list[S.clan]; if (!c || c.o !== me()) return;
    if (c.m.indexOf(pk) < 0 && c.m.length < 50) c.m.push(pk);
    CLANS.reqs = CLANS.reqs.filter((r) => r.pk !== pk); pubClan(c);
  }
  function clanRemove(pk) { const c = CLANS.list[S.clan]; if (!c || c.o !== me() || pk === me()) return; c.m = c.m.filter((x) => x !== pk); pubClan(c); }
  function leaveClan() {
    const c = CLANS.list[S.clan];
    if (c && c.o === me()) { c.m = []; pubClan(c); } else if (c) sendMsg(c.o, { t: 'cleave', c: S.clan });
    S.clan = ''; save(); unsubscribe('nx-cchat'); CLANS.chat = []; pubProfile(); emit('clans');
  }
  function myClanOk() { const c = CLANS.list[S.clan]; if (!c) return !!S.clan; if (c.m.indexOf(me()) < 0 && now() - (S.clanT || 0) > 30000) { S.clan = ''; save(); } return !!S.clan; }
  CLANS.chat = [];
  function subClanChat() {
    if (!S.clan) return;
    subscribe('nx-cchat', [{ kinds: [KIND.clanChat], '#t': ['nexa-clan-' + S.clan], since: sec() - 900, limit: 50 }], (e) => {
      const c = CLANS.list[S.clan]; if (S.block[e.pubkey] || S.mute[e.pubkey] || (c && c.m.indexOf(e.pubkey) < 0)) return;
      const j = jparse(e.content, null); if (!j) return; const text = clean(j.m, 140); if (!text || LINK.test(text)) return;
      if (CLANS.chat.some((r) => r.id === e.id)) return;
      CLANS.chat.push({ id: e.id, pk: e.pubkey, n: validName(j.n), m: text, t: e.created_at * 1000 }); CLANS.chat.sort((a, b) => a.t - b.t); if (CLANS.chat.length > 80) CLANS.chat.shift();
      emit('clanchat');
    });
  }
  function sendClanChat(text) {
    text = clean(text, 140); if (!text || !S.clan) return { ok: false, err: '' };
    if (LINK.test(text)) return { ok: false, err: 'LINKS ARE NOT ALLOWED' };
    if (now() - CHAT.last < 2000) return { ok: false, err: 'SLOW DOWN' };
    if (!publish(mk(KIND.clanChat, [['t', 'nexa-clan-' + S.clan]], JSON.stringify({ n: pinfo().name, m: text })))) return { ok: false, err: 'NO SERVERS' };
    CHAT.last = now(); CLANS.chat.push({ id: 'me' + now(), pk: me(), n: pinfo().name, m: text, t: now() }); emit('clanchat'); return { ok: true };
  }

  // ------------------------------------------------------------------ запуск: только пока включён переключатель серверов и есть согласие
  let started = false, tm = 0, tp = 0;
  function boot() {
    if (started) return; started = true;
    me();
    netTick(); tm = setInterval(netTick, 8000);
    const go = () => { if (!netInfo().up) return false; subFriends(); subDM(); subChat(); subBoard(); subClans(); sendPresence(); pubProfile(); return true; };
    let tries = 0;
    const w = setInterval(() => { tries += 1; if (go() || tries > 40) clearInterval(w); }, 1000);
    ev.addEventListener('net', () => { if (netInfo().up) { subFriends(); subDM(); subChat(); subBoard(); subClans(); } });
    tp = setInterval(() => { sendPresence(); if (sec() % 3 === 0) pubProfile(); rewardCheck(); }, 45000);
  }
  function stop() { started = false; clearInterval(tm); clearInterval(tp); NET.socks.forEach((r) => { try { r.ws.close(); } catch (e) { /* ok */ } }); NET.socks.clear(); }

  // ------------------------------------------------------------------ интерфейс (вкладка SOCIAL в онлайн-лобби)
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const btn = (text, fn, cls) => { const b = h('button', 'ol-btn' + (cls ? ' ' + cls : ''), text); b.type = 'button'; b.onclick = fn; return b; };
  let UI = null;
  function mount(root) {
    if (!root) return;
    boot();
    if (!UI || UI.root !== root) { UI = { root, tab: 'friends', open: '', card: null }; root.textContent = ''; }
    render();
  }
  const SUBS = ['friends', 'chat', 'ranking', 'clans', 'id'];
  const SUBN = { friends: 'FRIENDS', chat: 'CHAT', ranking: 'RANKING', clans: 'CLANS', id: 'MY ID' };
  const ST_TXT = { online: 'ONLINE', lobby: 'IN LOBBY', match: 'IN A MATCH', battle: 'IN BATTLE', offline: 'OFFLINE' };
  function render() {
    if (!UI || !UI.root.isConnected) return;
    const r = UI.root; r.textContent = '';
    const info = netInfo();
    const nav = h('div', 'sc-nav'); nav.setAttribute('role', 'tablist');
    SUBS.forEach((k) => { const b = h('button', 'sc-sub' + (UI.tab === k ? ' on' : ''), SUBN[k]); b.type = 'button'; b.setAttribute('role', 'tab'); b.onclick = () => { UI.tab = k; UI.open = ''; render(); }; nav.appendChild(b); });
    r.appendChild(nav);
    const st = h('p', 'v-note sc-net', !RM.servers.on ? 'SIGNALING SERVERS ARE OFF — SOCIAL FEATURES NEED THEM' : !RM.consented() ? 'ALLOW PUBLIC MODE FIRST (PUBLIC TAB)' : info.up ? 'RELAYS CONNECTED: ' + info.up : 'CONNECTING TO RELAYS…');
    r.appendChild(st);
    const body = h('div', 'sc-body'); r.appendChild(body);
    if (banMe()) { body.appendChild(h('p', 'v-note bad sc-note', AD().text())); return; }
    if (UI.card) { body.appendChild(cardView(UI.card)); return; }
    ({ friends: vFriends, chat: vChat, ranking: vRanking, clans: vClans, id: vId })[UI.tab](body);
  }
  function note(el, text, bad) { el.textContent = text || ''; el.className = 'v-note sc-note' + (bad ? ' bad' : ''); }
  function vFriends(b) {
    if (UI.open) { vDM(b, UI.open); return; }
    const add = h('div', 'sc-add'), inp = h('input'); inp.type = 'text'; inp.placeholder = 'PLAYER ID'; inp.maxLength = 80; inp.setAttribute('aria-label', 'Player ID'); inp.spellcheck = false;
    const nt = h('p', 'v-note sc-note');
    add.appendChild(inp); add.appendChild(btn('ADD', () => { const r = addFriend(inp.value); note(nt, r.ok ? 'REQUEST SENT' : r.err, !r.ok); if (r.ok) inp.value = ''; })); b.appendChild(add); b.appendChild(nt);
    const keys = Object.keys(S.friends).sort((x, y) => { const o = { in: 0, friend: 1, out: 2 }; return (o[S.friends[x].st] - o[S.friends[y].st]) || (statusOf(y) !== 'offline') - (statusOf(x) !== 'offline'); });
    if (!keys.length) b.appendChild(h('p', 'pb-empty', 'NO FRIENDS YET. SHARE YOUR ID (MY ID) OR PASTE ONE ABOVE.'));
    const list = h('div', 'pb-list sc-list'); list.setAttribute('role', 'list');
    keys.forEach((pk) => {
      const f = S.friends[pk], row = h('div', 'pb-row sc-row'); row.setAttribute('role', 'listitem');
      const nm = h('button', 'pb-host sc-name'); nm.type = 'button'; nm.onclick = () => { UI.card = pk; render(); };
      const s = f.st === 'friend' ? statusOf(pk) : null;
      nm.appendChild(h('em', '', f.n || short(pk))); if (f.l) nm.appendChild(h('small', '', ' · ' + f.l));
      row.appendChild(nm);
      row.appendChild(h('span', 'sc-st ' + (s || f.st), f.st === 'in' ? 'REQUEST' : f.st === 'out' ? 'PENDING' : ST_TXT[s]));
      if (f.st === 'in') { row.appendChild(btn('ACCEPT', () => { acceptFriend(pk); render(); })); row.appendChild(btn('DECLINE', () => { removeFriend(pk); render(); })); }
      else if (f.st === 'friend') {
        row.appendChild(btn('INVITE', () => { const r = invite(pk); note(nt, r.ok ? 'INVITE SENT' : r.err, !r.ok); }));
        row.appendChild(btn('MESSAGE', () => { UI.open = pk; DMOPEN = pk; render(); }));
      } else row.appendChild(btn('CANCEL', () => { removeFriend(pk); render(); }));
      list.appendChild(row);
    });
    b.appendChild(list);
  }
  function vDM(b, pk) {
    const f = S.friends[pk] || {};
    const top = h('div', 'sc-dmtop'); top.appendChild(btn('←', () => { UI.open = ''; DMOPEN = ''; render(); })); top.appendChild(h('b', '', f.n || short(pk))); top.appendChild(h('small', 'sc-enc', 'END-TO-END ENCRYPTED')); b.appendChild(top);
    const log = h('div', 'sc-log'); log.setAttribute('role', 'log'); b.appendChild(log);
    const paint = () => { log.textContent = ''; (DM[pk] || []).slice(-60).forEach((m) => { const d = h('p', 'sc-msg' + (m.me ? ' me' : ''), m.x); log.appendChild(d); }); log.scrollTop = log.scrollHeight; };
    paint();
    const row = h('div', 'sc-send'), inp = h('input'); inp.type = 'text'; inp.maxLength = 400; inp.setAttribute('aria-label', 'Message');
    const go = () => { const v = inp.value; inp.value = ''; sendDM(pk, v).then(paint); paint(); };
    inp.onkeydown = (e) => { if (e.key === 'Enter') go(); e.stopPropagation(); };
    row.appendChild(inp); row.appendChild(btn('SEND', go)); b.appendChild(row);
    const on = (e) => { if (e.detail === pk && log.isConnected) paint(); }; ev.addEventListener('dm', on);
  }
  function vChat(b) {
    const ch = chatCh(), bar = h('div', 'sc-chs');
    CHANNELS.forEach((c) => { const x = h('button', 'ol-btn' + (c === ch ? ' on' : ''), c.toUpperCase()); x.type = 'button'; x.onclick = () => { setChannel(c); render(); }; bar.appendChild(x); });
    b.appendChild(bar);
    const log = h('div', 'sc-log'); log.setAttribute('role', 'log'); b.appendChild(log);
    const paint = () => {
      log.textContent = '';
      if (!CHAT.rows.length) log.appendChild(h('p', 'pb-empty', 'QUIET HERE. SAY SOMETHING.'));
      CHAT.rows.slice(-60).forEach((m) => {
        const d = h('p', 'sc-msg' + (m.pk === me() ? ' me' : '')), a = h('button', 'sc-who', m.n + ' · ' + m.l); a.type = 'button'; a.onclick = () => { UI.card = m.pk; render(); };
        d.appendChild(a); d.appendChild(h('span', '', ' ' + m.m)); log.appendChild(d);
      });
      log.scrollTop = log.scrollHeight;
    };
    paint();
    const row = h('div', 'sc-send'), inp = h('input'), nt = h('p', 'v-note sc-note'); inp.type = 'text'; inp.maxLength = 140; inp.setAttribute('aria-label', 'Message');
    const go = () => { const r = sendChat(inp.value); note(nt, r.err, !r.ok); if (r.ok) inp.value = ''; paint(); };
    inp.onkeydown = (e) => { if (e.key === 'Enter') go(); e.stopPropagation(); };
    row.appendChild(inp); row.appendChild(btn('SEND', go)); b.appendChild(row); b.appendChild(nt);
    const on = () => { if (log.isConnected) paint(); }; ev.addEventListener('chat', on);
  }
  function vRanking(b) {
    b.appendChild(h('p', 'cn-priv', 'Scores are reported by each player’s own game and can be faked. Top 10 get a small daily KP reward.'));
    const list = h('div', 'pb-list sc-list'); list.setAttribute('role', 'list'); b.appendChild(list);
    const paint = () => {
      list.textContent = '';
      if (!BOARD.rows.length) list.appendChild(h('p', 'pb-empty', 'NO SCORES YET'));
      BOARD.rows.slice(0, 25).forEach((r, i) => {
        const row = h('div', 'pb-row sc-row' + (r.pk === me() ? ' me' : '')); row.setAttribute('role', 'listitem');
        row.appendChild(h('b', 'sc-pos', String(i + 1)));
        const nm = h('button', 'pb-host sc-name'); nm.type = 'button'; nm.onclick = () => { UI.card = r.pk; render(); }; nm.appendChild(h('em', '', r.n)); nm.appendChild(h('small', '', ' · ' + r.l)); row.appendChild(nm);
        row.appendChild(h('b', 'sc-score', String(r.sc))); list.appendChild(row);
      });
    };
    paint(); const on = () => { if (list.isConnected) paint(); }; ev.addEventListener('board', on);
  }
  function vClans(b) {
    const nt = h('p', 'v-note sc-note');
    const mine = CLANS.list[S.clan];
    if (S.clan) {
      const c = mine || { n: '…', ic: ICONS[0], m: [], o: '' };
      const hd = h('div', 'sc-clanhd'); hd.appendChild(h('b', 'sc-ic', c.ic)); hd.appendChild(h('b', '', c.n)); hd.appendChild(h('small', '', ' · ' + c.m.length + ' / 50')); hd.appendChild(btn('LEAVE', () => { leaveClan(); render(); })); b.appendChild(hd);
      if (c.o === me() && CLANS.reqs.length) { b.appendChild(h('p', 'v-note', 'JOIN REQUESTS')); CLANS.reqs.forEach((q) => { const row = h('div', 'sc-row'); row.appendChild(h('em', '', q.n)); row.appendChild(btn('ACCEPT', () => { clanAccept(q.pk); render(); })); row.appendChild(btn('DECLINE', () => { CLANS.reqs = CLANS.reqs.filter((x) => x.pk !== q.pk); render(); })); b.appendChild(row); }); }
      const mem = h('div', 'sc-members'); c.m.slice(0, 50).forEach((pk) => { const x = h('button', 'sc-who', (pk === c.o ? '★ ' : '') + (pk === me() ? pinfo().name : (S.friends[pk] && S.friends[pk].n) || (PROFS[pk] && PROFS[pk].n) || short(pk))); x.type = 'button'; x.onclick = () => { UI.card = pk; render(); }; if (c.o === me() && pk !== me()) x.title = 'OPEN CARD'; mem.appendChild(x); }); b.appendChild(mem);
      const log = h('div', 'sc-log'); log.setAttribute('role', 'log'); b.appendChild(log);
      const paint = () => { log.textContent = ''; CLANS.chat.slice(-40).forEach((m) => { const d = h('p', 'sc-msg' + (m.pk === me() ? ' me' : '')); d.appendChild(h('b', '', m.n + ' ')); d.appendChild(h('span', '', m.m)); log.appendChild(d); }); log.scrollTop = log.scrollHeight; };
      paint();
      const row = h('div', 'sc-send'), inp = h('input'); inp.type = 'text'; inp.maxLength = 140; inp.setAttribute('aria-label', 'Clan message');
      const go = () => { const r = sendClanChat(inp.value); note(nt, r.err, !r.ok); if (r.ok) inp.value = ''; paint(); };
      inp.onkeydown = (e) => { if (e.key === 'Enter') go(); e.stopPropagation(); };
      row.appendChild(inp); row.appendChild(btn('SEND', go)); b.appendChild(row); b.appendChild(nt);
      b.appendChild(h('p', 'cn-priv', 'Clan chat is signed but not encrypted: anyone who knows the clan code can read it.'));
      const on = () => { if (log.isConnected) paint(); }; ev.addEventListener('clanchat', on);
      return;
    }
    const f = h('div', 'sc-add'), inp = h('input'); inp.type = 'text'; inp.maxLength = 16; inp.placeholder = 'CLAN NAME'; inp.setAttribute('aria-label', 'Clan name');
    let icon = ICONS[0]; const ics = h('div', 'sc-icons');
    ICONS.forEach((c) => { const x = h('button', 'ol-btn' + (c === icon ? ' on' : ''), c); x.type = 'button'; x.onclick = () => { icon = c; Array.from(ics.children).forEach((y) => y.classList.toggle('on', y.textContent === c)); }; ics.appendChild(x); });
    f.appendChild(inp); f.appendChild(btn('CREATE', () => { const r = createClan(inp.value, icon); note(nt, r.err, !r.ok); render(); })); b.appendChild(ics); b.appendChild(f); b.appendChild(nt);
    const list = h('div', 'pb-list sc-list'); list.setAttribute('role', 'list'); b.appendChild(list);
    const ids = Object.keys(CLANS.list).sort((x, y) => CLANS.list[y].m.length - CLANS.list[x].m.length).slice(0, 30);
    if (!ids.length) list.appendChild(h('p', 'pb-empty', 'NO CLANS FOUND YET'));
    ids.forEach((id) => { const c = CLANS.list[id], row = h('div', 'pb-row sc-row'); row.setAttribute('role', 'listitem'); row.appendChild(h('b', 'sc-ic', c.ic)); row.appendChild(h('em', '', c.n)); row.appendChild(h('small', '', c.m.length + ' / 50')); row.appendChild(btn('REQUEST', () => { const r = joinClan(id); note(nt, r.ok ? 'REQUEST SENT' : r.err, !r.ok); })); list.appendChild(row); });
    const on = () => { if (b.isConnected && UI.tab === 'clans') render(); }; ev.addEventListener('clans', on, { once: true });
  }
  function vId(b) {
    const pk = me();
    b.appendChild(h('p', 'cn-priv', 'Your player ID is a public key stored in this browser. Friends add you with it. Anyone who sees it can see your name, level and online status if they add you.'));
    const code = h('input'); code.type = 'text'; code.readOnly = true; code.value = pk; code.setAttribute('aria-label', 'Player ID'); b.appendChild(h('p', 'sc-short', short(pk))); b.appendChild(code);
    b.appendChild(btn('COPY ID', () => { try { navigator.clipboard.writeText(pk); } catch (e) { code.select(); document.execCommand && document.execCommand('copy'); } }));
    const bl = Object.keys(S.block), mu = Object.keys(S.mute);
    if (bl.length || mu.length) {
      b.appendChild(h('p', 'v-note', 'BLOCKED AND MUTED'));
      bl.concat(mu.filter((x) => !S.block[x])).forEach((k) => { const row = h('div', 'sc-row'); row.appendChild(h('em', '', short(k) + (S.block[k] ? ' · BLOCKED' : ' · MUTED'))); row.appendChild(btn('UNDO', () => { block(k, false); mute(k, false); render(); })); b.appendChild(row); });
    }
  }
  function cardView(pk) {
    const c = h('div', 'sc-card'), f = S.friends[pk], p = PROFS[pk];
    c.appendChild(btn('←', () => { UI.card = null; render(); }));
    const nm = h('h3', '', pk === me() ? pinfo().name : (p && p.n) || (f && f.n) || short(pk)); c.appendChild(nm);
    c.appendChild(h('p', 'sc-short', short(pk))); const stat = h('div', 'sc-stats'); c.appendChild(stat);
    const paint = (pp) => {
      nm.textContent = pp.n + ' · LVL ' + pp.l; stat.textContent = '';
      Object.keys(pp.st || {}).slice(0, 12).forEach((k) => { const v = pp.st[k]; if (typeof v === 'number') { const d = h('span', 'sc-stat'); d.appendChild(h('em', '', k.toUpperCase())); d.appendChild(h('b', '', String(Math.max(0, Math.min(1e9, v | 0))))); stat.appendChild(d); } });
      if (pp.cl && CLANS.list[pp.cl]) stat.appendChild(h('span', 'sc-stat', CLANS.list[pp.cl].ic + ' ' + CLANS.list[pp.cl].n));
    };
    if (pk === me()) { const q = PF.get(); paint({ n: q.name, l: pinfo().level, st: q.stats, cl: S.clan }); }
    else { loadProfile(pk, (pp) => { if (c.isConnected) paint(pp); }); stat.appendChild(h('p', 'v-note', 'LOADING…')); }
    if (pk !== me()) {
      const row = h('div', 'sc-actions');
      if (!f || f.st !== 'friend') row.appendChild(btn('ADD FRIEND', () => { addFriend(pk); render(); }));
      else { row.appendChild(btn('INVITE', () => invite(pk))); row.appendChild(btn('MESSAGE', () => { UI.card = null; UI.tab = 'friends'; UI.open = pk; DMOPEN = pk; render(); })); }
      row.appendChild(btn(S.mute[pk] ? 'UNMUTE' : 'MUTE', () => { mute(pk, !S.mute[pk]); render(); }));
      row.appendChild(btn('BLOCK', () => { block(pk, true); UI.card = null; render(); }));
      row.appendChild(btn('REPORT', () => { report(pk, 'abuse'); render(); }));
      c.appendChild(row);
    }
    return c;
  }

  window.NexaSocial = {
    mount, boot, stop, publish, presEvent, subscribe, unsubscribe, addFriend, acceptFriend, removeFriend, invite, sendDM, sendChat, setChannel, mute, block, report,
    createClan, joinClan, leaveClan, loadProfile, takeInvite() { const r = pendingInvite; pendingInvite = ''; return r; },
    get id() { return me(); }, short, state: S, board: BOARD, clans: CLANS, presence: PRES, statusOf, net: netInfo, on: (t, f) => ev.addEventListener(t, f), _seal: seal, _open: open, _dm: DM
  };
}());
