#!/usr/bin/env node
// NEXA: «стенд» для проб — держит открытым браузер с игрой и принимает команды по HTTP (127.0.0.1).
//   node tools/trailer/lib/stage-server.js --port 9301 --mission 7 [--quality HIGH] [--w 960 --h 540]
//   curl -s localhost:9301/eval -d 'return Trl.r.p'                     → результат JSON
//   curl -s localhost:9301/frame -o f.jpg                               → текущий кадр (рендер без шага симуляции)
//   curl -s localhost:9301/load -d '/abs/path/scene.js'                  → подключить файл сцены в страницу
// Тело /eval — тело async-функции (можно await, return). Один запрос за раз.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { openGame, ROOT } = require('./browser');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('port', 9301)), MISSION = arg('mission', null), W = Number(arg('w', 960)), H = Number(arg('h', 540)), Q = arg('quality', 'HIGH');
const music = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'trailer', 'music', 'beats.json'), 'utf8'));

(async () => {
  const g = await openGame({ w: W, h: H, quality: Q, music });
  const page = g.page;
  let busy = Promise.resolve();
  const queue = (fn) => { const p = busy.then(fn, fn); busy = p.catch(() => {}); return p; };
  if (MISSION) { const info = await page.evaluate((m) => window.Trl.boot(Number(m), { seed: 1 }), MISSION); console.log('boot', JSON.stringify(info)); }
  http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8'), url = new URL(req.url, 'http://x');
      const done = (code, type, data) => { res.writeHead(code, { 'Content-Type': type }); res.end(data); };
      queue(async () => {
        try {
          if (url.pathname === '/eval') {
            const out = await page.evaluate(async (code) => { const fn = new (Object.getPrototypeOf(async function () {}).constructor)('Trl', code); const v = await fn(window.Trl); return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, body);
            return done(200, 'application/json', JSON.stringify(out));
          }
          if (url.pathname === '/frame') {
            const q = Number(url.searchParams.get('q') || 0.92);
            const data = await page.evaluate((q) => { const O = window.Trl.present(); return window.Trl.jpeg(q); }, q);
            return done(200, 'image/jpeg', Buffer.from(data.split(',')[1], 'base64'));
          }
          if (url.pathname === '/load') {
            await page.addScriptTag({ path: path.resolve(body.trim()) });
            return done(200, 'application/json', '{"ok":true}');
          }
          if (url.pathname === '/quit') { done(200, 'text/plain', 'bye'); await g.close(); process.exit(0); }
          return done(404, 'text/plain', 'no route');
        } catch (e) { return done(500, 'application/json', JSON.stringify({ error: String(e && e.message || e).slice(0, 2000) })); }
      });
    });
  }).listen(PORT, '127.0.0.1', () => console.log('READY ' + PORT));
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
