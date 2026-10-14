#!/usr/bin/env node
// NEXA: локальный мок Nostr-релея (только для тестов). Минимальный WebSocket RFC 6455 вручную + NIP-01: ["EVENT",ev] (подпись BIP-340 проверяется js/schnorr.js),
// ["REQ",sub,filter…] (kinds, #t, since), ["CLOSE",sub]; события эфемерные — не хранятся, сразу рассылаются подходящим подпискам.
//   node tools/mock-relay.js [порт] [--pow] [--silent]    клиент:  index.html?relay=ws://127.0.0.1:ПОРТ
//   --pow     отвечать на каждое событие ["OK",id,false,"pow: required"] (релей, который нам не подходит — клиент должен его бросить)
//   --silent  принимать соединение, но ничего не отвечать (проверка «молчащего» сервера)
//   --kind=N  принимать только события kind N, остальные отвергать ["OK",id,false,"blocked: kind not allowed"]
//   --notag   на REQ с тег-фильтром (#t) отвечать ["CLOSED",sub,"error: tag filters not supported"]
//   --auth    сразу слать ["AUTH",challenge] и на REQ отвечать CLOSED "auth-required"
'use strict';
const http = require('http'), crypto = require('crypto'), path = require('path');
const S = require(path.join(__dirname, '..', 'js', 'schnorr.js'));
const KIND = (process.argv.find((a) => /^--kind=\d+$/.test(a)) || '').slice(7) | 0, NOTAG = process.argv.includes('--notag'), AUTHR = process.argv.includes('--auth');
const PORT = Number(process.argv.find((a) => /^\d+$/.test(a))) || 8791, POW = process.argv.includes('--pow'), SILENT = process.argv.includes('--silent');
const conns = new Set(), stats = { events: 0, bad: 0, delivered: 0, conns: 0, reqs: 0 };
function frame(op, payload) {
  const b = Buffer.isBuffer(payload) ? payload : Buffer.from(payload), n = b.length;
  const h = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : (() => { const x = Buffer.alloc(10); x[0] = 0x80 | op; x[1] = 127; x.writeBigUInt64BE(BigInt(n), 2); return x; })();
  return Buffer.concat([h, b]);
}
const send = (c, arr) => { try { c.sock.write(frame(1, JSON.stringify(arr))); } catch (e) { /* закрыт */ } };
const match = (f, ev) => (!f.kinds || f.kinds.includes(ev.kind)) && (!f.since || ev.created_at >= f.since) && (!f['#t'] || ev.tags.some((t) => t[0] === 't' && f['#t'].includes(t[1])));
function onMsg(c, text) {
  if (SILENT) return;
  let m; try { m = JSON.parse(text); } catch (e) { return; }
  if (!Array.isArray(m)) return;
  if (m[0] === 'REQ' && typeof m[1] === 'string') {
    stats.reqs += 1;
    if (AUTHR) { send(c, ['CLOSED', m[1], 'auth-required: please authenticate']); return; }
    if (NOTAG && m.slice(2).some((f) => f && f['#t'])) { send(c, ['CLOSED', m[1], 'error: tag filters not supported']); return; }
    c.subs.set(m[1], m.slice(2)); send(c, ['EOSE', m[1]]);
  }
  else if (m[0] === 'CLOSE') c.subs.delete(m[1]);
  else if (m[0] === 'EVENT') {
    const ev = m[1];
    if (!S.checkEvent(ev)) { stats.bad += 1; send(c, ['OK', ev && ev.id, false, 'invalid: bad signature']); return; }
    stats.events += 1;
    if (POW) { send(c, ['OK', ev.id, false, 'pow: required']); return; }
    if (KIND && ev.kind !== KIND) { stats.kindRej = (stats.kindRej || 0) + 1; send(c, ['OK', ev.id, false, 'blocked: kind not allowed']); return; }
    send(c, ['OK', ev.id, true, '']);
    conns.forEach((o) => o.subs.forEach((fs, sub) => { if (fs.some((f) => match(f, ev))) { stats.delivered += 1; send(o, ['EVENT', sub, ev]); } }));
  }
}
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(JSON.stringify(stats)); });
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64') + '\r\n\r\n');
  stats.conns += 1;
  const c = { sock, subs: new Map() }; conns.add(c);
  if (AUTHR && !SILENT) setTimeout(() => send(c, ['AUTH', 'challenge']), 50);
  let buf = Buffer.alloc(0), frag = null;
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15, fin = buf[0] & 0x80, masked = buf[1] & 0x80;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > 8 * 1024 * 1024) { sock.destroy(); return; }
      if (buf.length < off + (masked ? 4 : 0) + len) return;
      let payload = buf.subarray(off + (masked ? 4 : 0), off + (masked ? 4 : 0) + len);
      if (masked) { const mk = buf.subarray(off, off + 4); payload = Buffer.from(payload.map((b, i) => b ^ mk[i & 3])); }
      buf = buf.subarray(off + (masked ? 4 : 0) + len);
      if (op === 8) { try { sock.write(frame(8, Buffer.alloc(0))); } catch (e) { /* ok */ } sock.end(); return; }
      if (op === 9) { sock.write(frame(10, payload)); continue; }
      if (op === 1 || op === 0) { frag = op === 1 ? payload : Buffer.concat([frag || Buffer.alloc(0), payload]); if (fin) { onMsg(c, frag.toString('utf8')); frag = null; } }
    }
  });
  const gone = () => conns.delete(c);
  sock.on('close', gone); sock.on('error', gone);
});
server.listen(PORT, '127.0.0.1', () => console.log('mock relay ws://127.0.0.1:' + PORT + (POW ? ' (pow)' : '') + (SILENT ? ' (silent)' : '')));
