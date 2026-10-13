// помощники теста PH.bombs (панель скрыта → rAF не идёт, шагаем кадры вручную)
(function () {
  const M = window.__m48; if (!M) return;
  const r = M.r, W = M.W;
  window.__step = (n) => { for (let i = 0; i < n; i += 1) { r.last = performance.now(); r.time += 1 / 60; r.update(1 / 60); } r.render(); };
  window.__go = (n) => { r.pausedUser = false; r.paused = false; try { r.qs('.m-pause').classList.remove('on'); } catch (e) { /* нет */ } window.__step(n); };
  window.__shot = async (n) => { window.__go(n || 2); await new Promise((res) => setTimeout(res, 150)); r.render(); await new Promise((res) => setTimeout(res, 350)); };
  window.__until = (f, ms) => new Promise((res) => { const t0 = performance.now(); const iv = setInterval(() => { let v = false; try { v = f(); } catch (e) { /* ждём */ } if (v || performance.now() - t0 > (ms || 20000)) { clearInterval(iv); res(!!v); } }, 60); });
  window.__at = (x, z, yaw, pitch) => { r.p.x = x; r.p.z = z; r.p.yaw = yaw; r.p.pitch = pitch === undefined ? -0.1 : pitch; };
  window.__plant = (n) => { window.__go(4); r.useTarget(); window.__go(n || 230); };
  window.__bs = () => { const B = r.f48bomb; return B ? { floor: B.f.key, planted: B.planted, spawned: B.spawned, lim: B.lim, alive: r.enemiesAlive(), wave: B.wave } : null; };
}());
