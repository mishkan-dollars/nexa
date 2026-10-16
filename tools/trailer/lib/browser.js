// NEXA: общий запуск игры в headless Chromium для съёмки трейлера (tools/trailer).
// Играть в панели нельзя, поэтому браузер программный (SwiftShader): кадр 1920×1080 в HIGH ≈ 0.8 с.
'use strict';
const fs = require('fs');
const path = require('path');

let pw = null;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'];

// opts: {w,h, quality: 'LOW'|'MEDIUM'|'HIGH', game: 'http://127.0.0.1:8765', music: json}
async function openGame(opts) {
  opts = opts || {};
  const w = opts.w || 1920, h = opts.h || 1080, game = opts.game || process.env.NEXA_GAME || 'http://127.0.0.1:8765';
  const browser = await pw.chromium.launch({ args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(0);
  page.on('pageerror', (e) => { if (!opts.quiet) console.error('[page]', String(e).slice(0, 400)); });
  page.on('console', (m) => { if (opts.verbose || process.env.NEXA_VERBOSE) console.log('[console]', m.type(), m.text().slice(0, 300)); });
  // звук в съёмке всегда выключен (правило проекта): контекст не возобновляется, медиа не играет
  await page.addInitScript((q) => {
    try {
      localStorage.setItem('quality', q); localStorage.setItem('disclaimerOk', '1');
      // колбэки таймеров и rAF самой страницы (глитч интерфейса и т. п.) помечаем: их Math.random не должен сдвигать сид съёмки (см. stage.js)
      window.__trlCb = 0;
      const wrap = (fn) => (typeof fn === 'function' ? function () { window.__trlCb += 1; try { return fn.apply(this, arguments); } finally { window.__trlCb -= 1; } } : fn);
      const st = window.setTimeout.bind(window), si = window.setInterval.bind(window), raf = window.requestAnimationFrame.bind(window);
      window.setTimeout = (fn, ms, ...a) => st(wrap(fn), ms, ...a);
      window.setInterval = (fn, ms, ...a) => si(wrap(fn), ms, ...a);
      window.requestAnimationFrame = (fn) => raf(wrap(fn));
      AudioContext.prototype.resume = function () { return Promise.resolve(); };
      HTMLMediaElement.prototype.play = function () { this.muted = true; this.volume = 0; return Promise.resolve(); };
    } catch (e) { /* без хранилища */ }
  }, opts.quality || 'HIGH');
  await page.goto(game + '/index.html?mute=1&clips=0', { waitUntil: 'load' });
  await page.waitForFunction(() => window.Missions && window.Missions.start, null, { timeout: 120000 });
  await page.waitForTimeout(2500);   // заставка студии и preload
  await page.addScriptTag({ path: path.join(ROOT, 'tools', 'trailer', 'page', 'stage.js') });
  if (opts.fx) await page.addScriptTag({ path: path.join(ROOT, 'tools', 'trailer', 'page', 'fx.js') });
  if (opts.music) await page.evaluate((m) => window.Trl.setMusic(m), opts.music);
  await page.evaluate(() => document.fonts.load('700 100px Oswald').catch(() => {}));
  return { browser, page, close: () => browser.close() };
}

module.exports = { openGame, ROOT };
