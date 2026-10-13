#!/usr/bin/env node
// Приёмник файлов для съёмки роликов (tools/shorts/cap.js): POST /save?name=file.mp4 → shorts/out/file.mp4
// Слушает только 127.0.0.1:8799, имя файла проверяется (только [\w.-]), CORS открыт для страницы игры.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const OUT = path.resolve(__dirname, '..', '..', 'shorts');
const PORT = Number(process.argv[2]) || 8799;
http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const u = new URL(req.url, 'http://x');
  const name = u.searchParams.get('name') || '';
  const sub = u.searchParams.get('dir') === 'frames' ? 'frames' : 'out';
  if (req.method !== 'POST' || u.pathname !== '/save' || !/^[\w.-]+$/.test(name)) { res.writeHead(400, cors); return res.end('bad'); }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const buf = Buffer.concat(chunks), file = path.join(OUT, sub, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    res.writeHead(200, cors); res.end(JSON.stringify({ ok: true, file, bytes: buf.length }));
  });
}).listen(PORT, '127.0.0.1', () => console.log('recv on ' + PORT + ' → ' + OUT));
