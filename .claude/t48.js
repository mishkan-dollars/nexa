// звук в панели ВСЕГДА выключен: контекст не возобновляется, медиа не играет (пользователь просил много раз)
if (!window.__mutedHard) { window.__mutedHard = true; try { AudioContext.prototype.resume = function () { return Promise.resolve(); }; HTMLMediaElement.prototype.play = function () { this.muted = true; this.volume = 0; return Promise.resolve(); }; } catch (e) { /* нет AudioContext */ } }
// тест-помощник миссии 48 (панель): window.__b48() → грузит tour, готовит r/W/F/K; __run48(name) запускает фазу в фоне
window.__errs = window.__errs || [];
window.addEventListener('error', (e) => window.__errs.push(String(e.message) + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
window.addEventListener('unhandledrejection', (e) => window.__errs.push('REJ ' + String((e.reason && e.reason.stack) || e.reason)));
window.__b48 = async function () {
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/.claude/tour.js?x=' + Date.now(); s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  await window.__tour(48);
  const m = window.__m48; delete m.r.hurt; m.r.setPause(false); m.r.fade(0, 0.1); m.K.unlock(m.r);
  return 'ready';
};
window.__run48 = function (name, extra) {
  const { r, W, F } = window.__m48; window.__done = false;
  F.PH[name](r, Object.assign({ r, W, start: 0 }, extra || {})).then(() => { window.__done = true; }).catch((e) => { window.__errs.push('PH ' + ((e && e.stack) || e)); });
};
window.__st48 = function () {
  const { r, W, K } = window.__m48; const V = r.f48deep;
  return 'cur=' + (W.cur && W.cur.name) + ' p=' + r.p.x.toFixed(1) + ',' + r.p.z.toFixed(1) + ' locked=' + r.locked + ' cine=' + r.cineDepth + ' alive=' + r.enemiesAlive() +
    (V ? ' key=' + V.key + ' kills=' + JSON.stringify(V.kills) + ' spawned=' + V.spawned + '/' + V.lim + ' need=' + V.need + ' t=' + V.t.toFixed(0) : '') + ' hp=' + Math.round(r.hp) + ' done=' + window.__done + ' errs=' + window.__errs.join('|');
};
