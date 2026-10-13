// Автопилот миссии 48 для сквозного прогона реальным раннером (панель браузера).
// window.__ap48.start(opt) → начинает: Missions.start(48) + enter; хук внутри игрового цикла:
//   бессмертие, убивает враждебных, жмёт доступные интерактивные точки (телепорт рядом), идёт к путевой точке r.wpt,
//   пропускает катсцены (Space), жмёт кнопки выбора/пульта. window.__ap48.st() — состояние для диагностики застреваний.
(() => {
  // звук в панели всегда выключен
  if (!window.__mutedHard) { window.__mutedHard = true; try { AudioContext.prototype.resume = function () { return Promise.resolve(); }; HTMLMediaElement.prototype.play = function () { this.muted = true; this.volume = 0; return Promise.resolve(); }; } catch (e) { /* нет AudioContext */ } }
  window.__errs = window.__errs || [];
  window.addEventListener('error', (e) => window.__errs.push(String(e.message) + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', (e) => window.__errs.push('REJ ' + String((e.reason && e.reason.stack) || e.reason).slice(0, 300)));
  const A = window.__ap48 = { on: true, kills: true, skip: true, ts: 3, log: [], cur: '', t0: 0, hold: null, used: 0, nkill: 0, opt: {} };
  const note = (s) => { if (A.log.length < 400) A.log.push(((performance.now() - A.t0) / 1000).toFixed(0) + 's ' + s); };
  A.note = note;
  const key = (code) => { document.dispatchEvent(new KeyboardEvent('keydown', { code, key: code === 'Space' ? ' ' : 'e', bubbles: true, cancelable: true })); document.dispatchEvent(new KeyboardEvent('keyup', { code, key: code === 'Space' ? ' ' : 'e', bubbles: true })); };
  A.start = async (opt) => {
    A.walk = (opt && opt.walk) !== false; A.stuck = []; A.sx = 0; A.sz = 0; A.sT = 0; A.sN = 0;
    A.opt = opt || {}; A.t0 = performance.now(); A.log = []; A.cur = ''; A.hold = null; A.nkill = 0; A.used = 0;
    // audio обязателен: без него процедурный звук/музыка миссии идут на громкости по умолчанию (localStorage на run.opts.audio не влияет)
    const r = window.__r = Missions.start(48, { audio: { masterVolume: 0, musicVolume: 0, sfxVolume: 0, musicEnabled: false, sfxEnabled: false }, playSfx() {}, onComplete() { A.complete = true; note('onComplete'); }, onExit() { A.exited = true; }, onStage() {}, onCutscene() {} });
    if (!r) return 'refused';
    for (let i = 0; i < 300; i += 1) { await new Promise((res) => setTimeout(res, 100)); const b = document.querySelector('.m-enter'); if (b && !b.hidden) break; }
    document.querySelector('.m-enter').click();
    await new Promise((res) => setTimeout(res, 600));
    r.timeScale = A.ts;
    let aE = 0, aI = 0, aS = 0, aO = 0, hT = 0;
    r.hooks.push((dt) => {
      if (!A.on || r.disposed) return;
      const F = Missions._core.f48, st = F && F.K.st(r);
      if (st && st.cur !== A.cur) { A.cur = st.cur; note('PHASE ' + st.cur + ' simT=' + r.time.toFixed(0)); }
      r.hp = r.maxHp || 100;
      aE += dt; aI += dt; aS += dt; aO += dt;
      const cb = r.cb;
      if (A.kills && cb && aE > 0.3) { aE = 0; for (const e of cb.enemies.slice()) { if (!e.dead && !e.friendly) { try { r.killEnemy(e, false); A.nkill += 1; } catch (x) { A.err = x.message; } } } }
      const endEl = document.querySelector('.m-end.on');
      if (endEl && aO > 0.4) { note('END overlay: ' + endEl.innerText.replace(/\s+/g, ' ').slice(0, 80)); key('Enter'); }
      const cine = r.cineDepth > 0 || r.inCinema;
      if (A.skip && cine && aS > 0.7) { aS = 0; key('Space'); }
      if (aO > 0.5) {
        aO = 0;
        const chs = document.querySelectorAll('.f48-choice button');
        const ch = chs.length ? chs[Math.min(A.pick || 0, chs.length - 1)] : null;                // A.pick: какая кнопка развилки (0 — первая, 1 — вторая)
        if (ch) { ch.click(); note('choice click'); }
        const rm = document.querySelector('.f48-rem button'); if (rm) { key('KeyE'); }
      }
      if (cine || r.locked || r.paused) return;
      // честная ходьба: шаг по r.blocked со скольжением; застревание → запись в A.stuck и телепорт вперёд, чтобы прогон продолжился
      const walkTo = (tx, tz, stop) => {
        const dx = tx - r.p.x, dz = tz - r.p.z, d = Math.hypot(dx, dz);
        if (d <= stop) { A.sN = 0; return true; }
        const stp = Math.min(d - stop, 3.6 * dt);
        const nx = r.p.x + dx / d * stp, nz = r.p.z + dz / d * stp;
        if (!r.blocked(nx, r.p.z)) r.p.x = nx;
        if (!r.blocked(r.p.x, nz)) r.p.z = nz;
        r.p.yaw = Math.atan2(-dx, -dz);
        A.sT += dt;
        if (A.sT > 2) {
          if (Math.hypot(r.p.x - A.sx, r.p.z - A.sz) < 0.4) {
            A.sN += 1;
            const msg = 'STUCK at ' + r.p.x.toFixed(1) + ',' + r.p.z.toFixed(1) + ' -> ' + tx.toFixed(1) + ',' + tz.toFixed(1) + ' phase=' + A.cur;
            if (A.sN === 1) { A.stuck.push(msg); note(msg); }
            if (A.sN >= 3) { const j = Math.min(d, 4); r.p.x += dx / d * j; r.p.z += dz / d * j; A.sN = 0; note('teleport 4m'); }
          } else A.sN = 0;
          A.sx = r.p.x; A.sz = r.p.z; A.sT = 0;
        }
        return false;
      };
      // удержание: остаёмся рядом с точкой, пока она не исчезнет
      if (A.hold) {
        const it = A.hold;
        let off = false; try { off = !!it.enabled && !it.enabled(); } catch (e) { off = true; }
        if (off || r.interactables.indexOf(it) < 0 || (performance.now() - A.holdT0) > 60000) { A.hold = null; aI = 9; }
        else { if (!A.walk) { r.p.x = it.pos.x + 0.9; r.p.z = it.pos.z; } return; }
      }
      // цель: ближайшая доступная интерактивная точка, иначе путевая точка
      if (aI > 0.6) {
        aI = 0; A.goal = null;
        let best = null, bd = 1e9;
        for (const it of r.interactables) {
          let ok = true; try { ok = !it.enabled || it.enabled(); } catch (e) { ok = false; }
          if (!ok) continue;
          const d = Math.hypot(it.pos.x - r.p.x, it.pos.z - r.p.z);
          if (d < bd) { bd = d; best = it; }
        }
        if (best) A.goal = { it: best };
        else if (r.wpt) {
          let tg = r.wpt.target; if (typeof tg === 'function') { try { tg = tg(); } catch (e) { tg = null; } }
          if (tg) { const p = tg.g ? tg.g.position : Array.isArray(tg) ? { x: tg[0], z: tg[2] } : tg; A.goal = { x: p.x, z: p.z }; }
        }
      }
      const G = A.goal;
      if (!G) return;
      if (G.it) {
        const it = G.it, need = Math.min(it.reach || 3, 2.4) * 0.8;
        let arrived = false;
        if (!A.walk) { r.p.x = it.pos.x + 0.9; r.p.z = it.pos.z; arrived = true; } else arrived = walkTo(it.pos.x, it.pos.z, need);
        if (arrived) {
          r.p.yaw = Math.atan2(-(it.pos.x - r.p.x), -(it.pos.z - r.p.z)); r.p.pitch = 0;
          r.target = it; r.useTarget(); A.used += 1;
          note('use [' + (it.label || '?') + '] @' + it.pos.x.toFixed(0) + ',' + it.pos.z.toFixed(0));
          A.hold = it; A.holdT0 = performance.now(); A.goal = null;
        }
      } else if (A.walk) walkTo(G.x, G.z, 1.5);
      else {
        const dx = G.x - r.p.x, dz = G.z - r.p.z, d = Math.hypot(dx, dz);
        if (d > 1.5) { const s = Math.min(d - 1.0, 6); r.p.x += dx / d * s; r.p.z += dz / d * s; r.p.yaw = Math.atan2(-dx, -dz); }
      }
    });
    return 'started';
  };
  A.st = () => {
    const r = window.__r; if (!r) return 'no r';
    const F = Missions._core.f48, st = F && F.K.st(r);
    const its = (r.interactables || []).slice(0, 6).map((it) => { let en = '?'; try { en = it.enabled ? !!it.enabled() : true; } catch (e) { en = 'err'; } return (it.label || '?') + '@' + it.pos.x.toFixed(0) + ',' + it.pos.z.toFixed(0) + (en ? '' : '(off)'); });
    let wp = null; if (r.wpt) { let tg = r.wpt.target; try { if (typeof tg === 'function') tg = tg(); } catch (e) { tg = null; } if (tg) { const p = tg.g ? tg.g.position : Array.isArray(tg) ? { x: tg[0], z: tg[2] } : tg; wp = (r.wpt.label || '') + '@' + p.x.toFixed(0) + ',' + p.z.toFixed(0); } }
    const obj = r.qs ? (r.qs('.m-obj span') || {}).textContent : '';
    return JSON.stringify({
      cur: st && st.cur, simT: +r.time.toFixed(0), p: [+r.p.x.toFixed(1), +r.p.z.toFixed(1)], locked: !!r.locked, cine: r.cineDepth, paused: !!r.paused,
      alive: r.enemiesAlive ? r.enemiesAlive() : -1, obj, wp, its, hold: !!A.hold, used: A.used, kills: A.nkill, done: !!A.complete || r.disposed, errs: window.__errs.slice(-3)
    });
  };
})();
