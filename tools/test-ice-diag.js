#!/usr/bin/env node
// NEXA: тест диагностики ICE на моках (node tools/serve.js 8765 &  node tools/test-ice-diag.js [fail]). Два окна 480x270, звук заглушён, один браузер.
// Без аргумента: успешное соединение по host-кандидатам; "fail": из SDP вырезаются кандидаты -> попытка проваливается, проверяется причина и подсказка.
const { spawn } = require('child_process'), path = require('path');
const pw = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const FAIL = process.argv[2] === 'fail', procs = [];
procs.push(spawn('node', [path.join(__dirname, 'mock-relay.js'), '8801', '--real'], { stdio: 'ignore' }));
procs.push(spawn('node', [path.join(__dirname, 'mock-tracker.js'), '8821'], { stdio: 'ignore' }));
const URLB = 'http://127.0.0.1:8765/index.html?mute=1&clips=0&nosplash&nopreload=1&nolobby3d&tracker=ws://127.0.0.1:8821&relay=ws://127.0.0.1:8801';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bad = [];
const chk = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad.push(m); };
async function mk(browser) {
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } }), page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await page.addInitScript((strip) => {
    try { localStorage.setItem('disclaimerOk', '1'); localStorage.setItem('nexaLang', 'en'); localStorage.setItem('quality', 'LOW'); localStorage.setItem('nexaIce', 'none'); localStorage.setItem('nexaRulesOk', JSON.stringify({ v: 1, t: 1 })); } catch (e) { /* ok */ }
    AudioContext.prototype.resume = function () { return Promise.resolve(); };
    HTMLMediaElement.prototype.play = function () { this.muted = true; this.volume = 0; return Promise.resolve(); };
    if (strip) { const o = RTCPeerConnection.prototype.setRemoteDescription; RTCPeerConnection.prototype.setRemoteDescription = function (d) { if (d && d.sdp) d = { type: d.type, sdp: d.sdp.replace(/^a=candidate:.*\r?\n/gm, '') }; return o.call(this, d); }; }
  }, FAIL);
  await page.goto(URLB, { waitUntil: 'load' });
  await page.waitForFunction(() => window.NexaNet && window.NexaRoom && window.OnlineLobby, null, { timeout: 60000 });
  return { ctx, page };
}
(async () => {
  await sleep(600);
  const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const A = await mk(browser), B = await mk(browser); [A, B].forEach((X, i) => X.page.on('console', (m) => { if (process.env.DBG && /\[rdv\]|\[net\]/.test(m.text())) console.log(i ? 'G' : 'H', m.text().slice(0, 160)); })); const id = 'ice' + Math.random().toString(36).slice(2, 7);
  await A.page.evaluate((i) => NexaRoom.hostRoom({ id: i }), id); await sleep(500);
  await B.page.evaluate((i) => NexaRoom.joinRoom(i), id);
  if (FAIL) await B.page.waitForFunction(() => { const a = NexaNet.lastAttempt(); return a && a.fail; }, null, { timeout: 90000, polling: 500 });
  else await B.page.waitForFunction(() => NexaNet.state === 'open', null, { timeout: 45000, polling: 250 });
  const rep = {};
  for (const [k, X] of [['guest', B], ['host', A]]) rep[k] = await X.page.evaluate(() => ({ text: OnlineLobby.report(), la: NexaNet.lastAttempt(), diag: NexaNet.diag(), mon: NexaRoom.servers.monitor.running, sm: NexaRoom.servers.summary() }));
  console.log(rep.guest.text.split('\n').filter((l, i, a) => a.indexOf('last attempt (ICE):') <= i).join('\n'));
  const IP4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/, IP6 = /[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){3,}/i, MD = /[0-9a-f-]{8,}\.local\b/i;
  for (const k of ['guest', 'host']) {
    const t = rep[k].text, blk = t.slice(t.indexOf('last attempt (ICE):'));
    chk(t.indexOf('last attempt (ICE):') > 0, k + ': блок last attempt есть');
    chk(!IP4.test(blk) && !IP6.test(blk) && !MD.test(blk), k + ': в блоке нет IP/mDNS-имён');
    chk(rep[k].la && rep[k].la.ev.length > 0 && rep[k].la.loc.host + rep[k].la.loc.mdns > 0, k + ': события ICE и host-кандидаты записаны');
    chk(!JSON.stringify(rep[k].la).match(IP4), k + ': lastAttempt() без IPv4');
  }
  chk(rep.guest.mon === true, 'монитор серверов стартовал без согласия (гость в комнате)');
  if (FAIL) {
    chk(rep.guest.la.fail === 'CONNECT_TIMEOUT' || rep.guest.la.fail === 'ICE_FAILED', 'fail-код: ' + rep.guest.la.fail);
    chk(!!rep.guest.la.why, 'причина провала: ' + rep.guest.la.why);
    chk(rep.guest.diag && rep.guest.diag.remote, 'NexaNet.diag() доступен для rendezvous-попытки (подсказка в окне ошибки)');
  } else {
    chk(rep.guest.la.ok === true && rep.guest.la.okAt > 0, 'ok=true, время ' + rep.guest.la.okAt + ' мс');
    await B.page.evaluate(() => NexaNet.close()); await sleep(700);
    const after = await B.page.evaluate(() => NexaNet.lastAttempt());
    chk(after && after.ok && after.ev.length > 0, 'итог последней попытки сохранён после закрытия');
  }
  console.log(bad.length ? 'ПРОВАЛ: ' + bad.length : 'ВСЕ ПРОВЕРКИ ПРОШЛИ');
  await browser.close(); procs.forEach((p) => p.kill()); process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.log('FATAL', e); procs.forEach((p) => p.kill()); process.exit(1); });
