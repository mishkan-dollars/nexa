#!/usr/bin/env node
// node tools/check-servers.js [файл.txt|json] [--timeout=5000] [--batch=25] [--out=tools/servers-alive.json]
// Проверяет все серверы из js/servers.js (+ адреса из файла: по одному в строке или JSON-массив; из браузера: copy(localStorage.nexaDiscovered)).
// Nostr: открыт ли WebSocket и отвечает ли на REQ (EOSE/NOTICE). Трекер: открыт ли WebSocket. Нужен Node 22+.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : d; };
const TIMEOUT = +arg('timeout', 5000), BATCH = +arg('batch', 25), OUT = arg('out', path.join(__dirname, 'servers-alive.json'));
const win = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'servers.js'), 'utf8'), { window: win });
const S = win.NexaServers;
const norm = (u) => String(u).trim().replace(/\/$/, '');
const items = new Map();
(S.TRACKERS || []).concat(S.TRACKERS_OPTIONAL || []).forEach((u) => items.set(norm(u), 'tracker'));
(S.NOSTR_RELAYS || []).concat(S.NOSTR_OPTIONAL || []).forEach((u) => { if (!items.has(norm(u))) items.set(norm(u), 'nostr'); });
const extra = process.argv.slice(2).find((x) => !x.startsWith('--'));
if (extra) {
  const t = fs.readFileSync(extra, 'utf8').trim();
  let l; try { l = JSON.parse(t); } catch (e) { l = t.split(/\s+/); }
  (Array.isArray(l) ? l : Object.keys(l)).forEach((x) => { const u = norm(typeof x === 'string' ? x : x.url || ''); if (/^wss?:\/\//.test(u) && !items.has(u)) items.set(u, 'nostr'); });
}
if (typeof WebSocket === 'undefined') { console.error('нужен Node 22+ (глобальный WebSocket)'); process.exit(1); }
function probe(url, type) {
  return new Promise((resolve) => {
    const t0 = Date.now(); let done = false, ws, open = 0;
    const fin = (st, why) => { if (done) return; done = true; clearTimeout(tm); try { ws && ws.close(); } catch (e) { /* закрыт */ } resolve({ url, type, status: st, why, ms: open || Date.now() - t0 }); };
    const tm = setTimeout(() => fin(open ? (type === 'nostr' ? 'open-silent' : 'ok') : 'dead', open ? 'нет ответа на REQ' : 'таймаут'), TIMEOUT);
    try { ws = new WebSocket(url); } catch (e) { return fin('dead', 'bad url'); }
    ws.onopen = () => { open = Date.now() - t0; if (type === 'nostr') ws.send(JSON.stringify(['REQ', 'chk', { kinds: [27777], limit: 1 }])); else fin('ok', 'open'); };
    ws.onmessage = (m) => { let j; try { j = JSON.parse(m.data); } catch (e) { return; } if (j[0] === 'EOSE' || j[0] === 'EVENT') fin('ok', 'EOSE'); else if (j[0] === 'AUTH') fin('auth', 'нужна авторизация'); else if (j[0] === 'CLOSED') fin(/auth|restricted|payment|paid/i.test(j[2] || '') ? 'auth' : 'ok', String(j[2] || '').slice(0, 60)); else if (j[0] === 'NOTICE') fin(/pay|paid|whitelist|auth|restrict/i.test(j[1] || '') ? 'auth' : 'ok', String(j[1] || '').slice(0, 60)); };
    ws.onerror = () => fin('dead', 'ошибка соединения');
    ws.onclose = () => fin(open ? 'closed' : 'dead', open ? 'закрыт сервером' : 'не открылся');
  });
}
(async () => {
  const list = [...items.entries()], res = [];
  for (let i = 0; i < list.length; i += BATCH) {
    const part = await Promise.all(list.slice(i, i + BATCH).map(([u, t]) => probe(u, t)));
    res.push(...part);
    process.stdout.write('\r' + res.length + '/' + list.length + ' ok=' + res.filter((r) => r.status === 'ok').length + '   ');
  }
  const by = (s) => res.filter((r) => r.status === s);
  console.log('\nвсего ' + res.length + ' | рабочих ' + by('ok').length + ' | молчат ' + by('open-silent').length + ' | нужна авторизация/оплата ' + by('auth').length + ' | закрыты ' + by('closed').length + ' | мёртвые ' + by('dead').length);
  by('ok').sort((a, b) => a.ms - b.ms).slice(0, 15).forEach((r) => console.log('  ' + r.ms + ' мс  ' + r.url));
  fs.writeFileSync(OUT, JSON.stringify({ checked: res.length, ok: by('ok').map((r) => r.url), results: res }, null, 1));
  console.log('результат: ' + OUT + '  (рабочие адреса — поле "ok")');
})();
