#!/usr/bin/env node
// NEXA: стенд надёжности сигналинга (только для тестов). Поднимает мок-релеи/трекеры с неисправностями, на каждую попытку запускает
// двух игроков (хост и гость в разных контекстах Chromium), у каждого свои «недоступные» серверы, часы со сдвигом и отложенный старт гостя.
//   node tools/serve.js 8765 &    node tools/bench-signal.js [попыток=30] [параллельно=2] [метка]
const { spawn } = require('child_process'), path = require('path');
const pw = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const N = Number(process.argv[2]) || 30, PAR = Number(process.argv[3]) || 2, LABEL = process.argv[4] || 'run', WAIT = Number(process.env.WAIT_MS) || 45000;
const T = path.join(__dirname, 'mock-relay.js'), TR = path.join(__dirname, 'mock-tracker.js');
const RELAYS = [['--real'], ['--real'], ['--real', '--lose=0.4'], ['--real'], ['--real', '--kind=20777'], ['--real', '--lag=800'], ['--real', '--silent'], ['--real', '--pow'], ['--real', '--lose=0.6'], ['--real']];
const relayUrls = RELAYS.map((_, i) => 'ws://127.0.0.1:' + (8801 + i)), trackUrls = [8821, 8822].map((p) => 'ws://127.0.0.1:' + p);
const HARSH = process.env.HARSH === '1', GUEST_FIRST = process.env.GUEST_FIRST === '1', RDV_FILE = process.env.RDV_FILE || '';
const procs = [];
RELAYS.forEach((a, i) => procs.push(spawn('node', [T, String(8801 + i)].concat(a), { stdio: 'ignore' })));
trackUrls.forEach((u) => procs.push(spawn('node', [TR, u.split(':')[2]], { stdio: 'ignore' })));
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const URLB = 'http://127.0.0.1:8765/index.html?mute=1&clips=0&nosplash&nopreload=1&nolobby3d&tracker=' + trackUrls.join(',') + '&relay=' + relayUrls.join(',');
const rnd = (n) => Math.floor(Math.random() * n), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function pick(arr, k) { const a = arr.slice(), o = []; while (o.length < k && a.length) o.push(a.splice(rnd(a.length), 1)[0]); return o; }
async function mk(browser, name, blocked, skewMs) {
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  if (RDV_FILE) await page.route(/\/js\/rendezvous\.js/, (r) => r.fulfill({ path: RDV_FILE, contentType: 'application/javascript' }));
  await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:88\d\d/, (ws) => {
    const port = /:(\d+)/.exec(ws.url())[1], b = blocked.get(port);
    if (b === 'refuse') ws.close(); else if (b === 'hang') return; else ws.connectToServer();
  });
  await page.addInitScript((a) => {
    try { localStorage.setItem('disclaimerOk', '1'); localStorage.setItem('nexaLang', 'en'); localStorage.setItem('quality', 'LOW'); localStorage.setItem('nexaIce', 'none'); localStorage.setItem('nexaRulesOk', JSON.stringify({ v: 1, t: 1 })); localStorage.setItem('musicEnabled', 'false'); localStorage.setItem('sfxEnabled', 'false'); localStorage.setItem('nexaProgress', JSON.stringify({ currentTask: 12, completedTasks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], firstMatchComplete: true })); } catch (e) { /* ok */ }
    AudioContext.prototype.resume = function () { return Promise.resolve(); };
    HTMLMediaElement.prototype.play = function () { this.muted = true; this.volume = 0; return Promise.resolve(); };
    if (a.skew) { const D = Date.now.bind(Date); Date.now = () => D() + a.skew; }
  }, { skew: skewMs });
  await page.goto(URLB, { waitUntil: 'load' });
  await page.waitForFunction(() => window.NexaNet && window.NexaRoom, null, { timeout: 60000 });
  return { ctx, page, name };
}
async function attempt(browser, n) {
  const all = relayUrls.concat(trackUrls).map((u) => u.split(':')[2]);
  const mkBlock = () => { const m = new Map(); pick(all, HARSH ? 4 + rnd(4) : 2 + rnd(3)).forEach((p) => m.set(p, Math.random() < 0.5 ? 'refuse' : 'hang')); return m; };
  const skew = Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) * (60000 + rnd(180000)) : 0;
  const delay = Math.floor(Math.random() * 8000), id = 'bn' + n + 'x' + Math.random().toString(36).slice(2, 7);
  const bh = mkBlock(), bg = mkBlock();
  const A = await mk(browser, 'host', bh, 0), B = await mk(browser, 'guest', bg, skew);
  const res = { n, delay, skew: Math.round(skew / 1000), blockedHost: [...bh.keys()].join(','), blockedGuest: [...bg.keys()].join(','), ok: false, ms: 0, events: '' };
  try {
    const host = () => A.page.evaluate((i) => NexaRoom.hostRoom({ id: i }), id);
    await B.page.evaluate(() => { window.__ev = []; NexaRoom.on('join', (j) => window.__ev.push(j.stage + (j.attempt ? ':' + j.attempt : '') + (j.why ? '/' + j.why : ''))); });
    let t0 = Date.now();
    if (GUEST_FIRST) {
      await B.page.evaluate((i) => NexaRoom.joinRoom(i), id);
      await sleep(delay); await host();
    } else {
      await host(); await sleep(delay);
      t0 = Date.now(); await B.page.evaluate((i) => NexaRoom.joinRoom(i), id);
    }
    try { await B.page.waitForFunction(() => NexaNet.state === 'open', null, { timeout: WAIT, polling: 250 }); res.ok = true; } catch (e) { res.ok = false; }
    res.ms = Date.now() - t0;
    res.events = (await B.page.evaluate(() => window.__ev.join(' '))).slice(0, 200);
    if (!res.ok) { try { res.diag = await B.page.evaluate(() => JSON.stringify(NexaRoom.diag ? NexaRoom.diag() : null)); } catch (e) { /* ok */ } }
  } catch (e) { res.err = String(e).slice(0, 120); }
  await A.ctx.close(); await B.ctx.close();
  return res;
}
(async () => {
  await sleep(600);
  const browser = await pw.chromium.launch({ args: ARGS });
  const out = []; let next = 0;
  const worker = async () => { while (next < N) { const n = next++; const r = await attempt(browser, n); out.push(r); console.log(r.ok ? 'OK ' : 'FAIL', n, r.ms + 'ms', 'delay', r.delay, 'skew', r.skew, 'blkH', r.blockedHost, 'blkG', r.blockedGuest, r.events, r.err || '', r.diag || ''); } };
  await Promise.all(Array.from({ length: PAR }, worker));
  const okMs = out.filter((r) => r.ok).map((r) => r.ms).sort((a, b) => a - b);
  const pct = out.length ? Math.round(1000 * okMs.length / out.length) / 10 : 0;
  console.log('[' + LABEL + '] attempts', out.length, 'ok', okMs.length, pct + '%', 'median ms', okMs.length ? okMs[okMs.length >> 1] : 0, 'p90', okMs.length ? okMs[Math.floor(okMs.length * 0.9)] : 0);
  await browser.close(); procs.forEach((p) => p.kill()); process.exit(0);
})().catch((e) => { console.log('FATAL', e); procs.forEach((p) => p.kill()); process.exit(1); });
