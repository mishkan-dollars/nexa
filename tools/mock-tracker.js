#!/usr/bin/env node
// NEXA: локальный мок-трекер WebTorrent (только для тестов). Минимальный WebSocket-сервер RFC 6455 вручную на http upgrade, без зависимостей.
//   node tools/mock-tracker.js [порт]     клиент подключается так:  index.html?tracker=ws://127.0.0.1:ПОРТ
// Поведение announce как у настоящего трекера: каждому offer из announce выбирается случайный ДРУГОЙ пир роя (по info_hash) и ему пересылается
// {action:'announce', info_hash, offer_id, peer_id, offer}; answer с to_peer_id пересылается адресату; announcer получает {complete, incomplete, interval}.
'use strict';
const http = require('http'), crypto = require('crypto');
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8790;
const swarms = new Map();     // info_hash -> Map(peer_id -> ws)
const stats = { announces: 0, offers: 0, answers: 0, conns: 0 };

function frame(op, payload) {
  const b = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const n = b.length, h = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : (() => { const x = Buffer.alloc(10); x[0] = 0x80 | op; x[1] = 127; x.writeBigUInt64BE(BigInt(n), 2); return x; })();
  return Buffer.concat([h, b]);
}
function wsSend(ws, obj) { try { ws.sock.write(frame(1, JSON.stringify(obj))); } catch (e) { /* закрыт */ } }
function onMsg(ws, text) {
  let m; try { m = JSON.parse(text); } catch (e) { return; }
  if (!m || m.action !== 'announce' || typeof m.info_hash !== 'string' || typeof m.peer_id !== 'string') return;
  stats.announces += 1;
  let sw = swarms.get(m.info_hash); if (!sw) swarms.set(m.info_hash, sw = new Map());
  ws.keys.add(m.info_hash + '\u0000' + m.peer_id);
  sw.set(m.peer_id, ws);
  if (Array.isArray(m.offers)) {
    const others = Array.from(sw.keys()).filter((k) => k !== m.peer_id);
    m.offers.forEach((o) => {
      if (!others.length || !o || typeof o.offer_id !== 'string') return;
      const to = sw.get(others[Math.floor(Math.random() * others.length)]);
      stats.offers += 1;
      wsSend(to, { action: 'announce', info_hash: m.info_hash, offer_id: o.offer_id, peer_id: m.peer_id, offer: o.offer });
    });
  }
  if (m.answer && typeof m.to_peer_id === 'string') {
    const to = sw.get(m.to_peer_id);
    if (to) { stats.answers += 1; wsSend(to, { action: 'announce', info_hash: m.info_hash, offer_id: m.offer_id, peer_id: m.peer_id, answer: m.answer }); }
  } else wsSend(ws, { action: 'announce', info_hash: m.info_hash, interval: 120, complete: 0, incomplete: sw.size });
}
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(JSON.stringify(stats)); });
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64') + '\r\n\r\n');
  stats.conns += 1;
  const ws = { sock, keys: new Set() };
  let buf = Buffer.alloc(0), frag = null;
  const drop = () => { ws.keys.forEach((k) => { const [h, p] = k.split('\u0000'); const sw = swarms.get(h); if (sw && sw.get(p) === ws) { sw.delete(p); if (!sw.size) swarms.delete(h); } }); ws.keys.clear(); };
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
      if (op === 1 || op === 0) {
        frag = op === 1 ? payload : Buffer.concat([frag || Buffer.alloc(0), payload]);
        if (fin) { onMsg(ws, frag.toString('utf8')); frag = null; }
      }
    }
  });
  sock.on('close', drop); sock.on('error', drop);
});
server.listen(PORT, '127.0.0.1', () => console.log('mock tracker ws://127.0.0.1:' + PORT));
