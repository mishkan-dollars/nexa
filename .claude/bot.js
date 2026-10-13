// Тестовый бот для миссий (только для разработки; .claude не попадает в сборку itch.io).
(() => {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.__errs = [];
  window.addEventListener('error', (e) => __errs.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => __errs.push('REJ ' + (e.reason && e.reason.message || e.reason)));
  const yieldNow = () => new Promise((res) => { const c = new MessageChannel(); c.port1.onmessage = () => res(); c.port2.postMessage(0); });
  const B = window.__B = { log: [], done: false, exited: false, ticks: 0, opt: {}, act: null };
  B.boot = async (id, opt) => {
    B.opt = opt || {}; B.log = []; B.done = false; B.exited = false; B.ticks = 0; B.act = null; __errs.length = 0;
    const r = Missions.start(id, { playSfx() {}, onComplete() { B.done = true; }, onExit() { B.exited = true; }, onStage() {}, onCutscene() {} });
    if (!r) return 'start refused';
    window.__r = r;
    for (let i = 0; i < 300; i += 1) { await new Promise((res) => setTimeout(res, 100)); const b = document.querySelector('.m-enter'); if (b && !b.hidden) break; }
    r.hack = () => Promise.resolve(true);
    r.enter();
    return 'booted ' + id;
  };
  B.bot = (r) => {
    r.god = true;
    const M = r.mm, sec = M && M.cur;
    if (B.act && r.interactables.indexOf(B.act) >= 0 && !r.locked) { const a = B.act; r.p.x = a.pos.x + (a.pos.x > 0 ? -1 : 1); r.p.z = a.pos.z + 0.4; }
    else if (B.act) B.act = null;
    if (B.opt.noGhost && M) M.def.ghost = false;
    const en = r.cb ? r.cb.enemies.filter((e) => !e.dead && !e.friendly) : [];
    if (!B.opt.noKill) en.forEach((e) => r.damageEnemy(e, 99999, true));
    if (r.locked || B.act) return;
    const it = r.interactables.find((i) => !i.used && (!i.enabled || i.enabled()));
    if (it) { r.p.x = it.pos.x + (it.pos.x > 0 ? -1 : 1); r.p.z = it.pos.z + 0.4; B.act = it; try { it.use(); } catch (e) { __errs.push('use ' + e.message); } return; }
    if (sec && sec.b === 'blast' && sec.brk && !sec.brk.broken) { sec.t = (sec.t || 0) + 1; if (sec.t > 40) { r.p.z = Math.max(r.p.z, sec.zB + 6); r.explode(0, 1, sec.zB + 1.8, 5, 150); } return; }
    if (r.wpt) { const t = r.wpt.target; const tx = t[0], tz = t[2], dx = tx - r.p.x, dz = tz - r.p.z, d = Math.hypot(dx, dz); if (d > 0.3) { const s = Math.min(d, 0.22); r.p.x += dx / d * s; r.p.z += dz / d * s; } return; }
    if (sec && sec.b === 'run') { r.p.z -= 0.2; r.p.x *= 0.95; }
  };
  B.run = async (maxTicks, ms) => {
    const r = __r, t0 = performance.now(); let lastK = -1;
    for (let i = 0; i < maxTicks; i += 1) {
      if (r.disposed || B.done || B.exited) break;
      if (performance.now() - t0 > (ms || 20000)) break;
      B.bot(r);
      r.time += 1 / 30;
      try { r.update(1 / 30); } catch (e) { if (!r.disposed) { __errs.push('upd ' + e.message); } }
      B.ticks += 1;
      const M = r.mm; if (M && M.cur && M.cur.k !== lastK) { lastK = M.cur.k; B.log.push(`${(B.ticks / 30).toFixed(0)}s sector ${lastK} ${M.cur.b}`); }
      if (i % 3 === 0) await yieldNow(); else await Promise.resolve();
    }
    const M = r.mm;
    return { done: B.done, disposed: r.disposed, ticks: B.ticks, sim: (B.ticks / 30).toFixed(0), sec: M && M.cur ? M.cur.k + ':' + M.cur.b : null, hp: Math.round(r.hp), enemies: r.cb ? r.cb.enemies.filter((e) => !e.dead).length : 0, log: B.log.slice(-8), errs: __errs.slice(0, 6) };
  };
  // серия миссий подряд; возвращает итог по каждой
  B.batch = async (ids, opt, budget) => {
    const out = [];
    for (const id of ids) {
      const s = await B.boot(id, opt);
      if (s === 'start refused') { out.push(id + ' REFUSED'); break; }
      let r;
      for (let k = 0; k < 8; k += 1) { r = await B.run(4000, budget || 12000); if (r.done || r.disposed) break; }
      out.push(id + ' ' + JSON.stringify({ d: r.done, sim: r.sim, sec: r.sec, log: r.log.join('|'), errs: r.errs }));
      if (!r.done) break;
      await new Promise((res) => setTimeout(res, 300));
    }
    return out.join('\n');
  };
  return 'bot ready';
})();
