// Тест-помощник для браузерной панели: ручной шаг симуляции и статистика камеры в катсценах (load: eval(await (await fetch('/.claude/adv.js')).text()))
(() => {
  HTMLMediaElement.prototype.play = function () { this.muted = true; this.volume = 0; return Promise.resolve(); };
  window.__stat = { shots: {}, maxBlur: 0, minY: 9, maxY: 0, frames: 0, log: [] };
  // реальный цикл игры ставим на паузу (пока r.__hold), все кадры гоним сами
  window.__hold = (on) => { const r = window.__r; if (!r.__upd) { r.__upd = r.update; r.update = function (dt) { if (r.__hold) return; return r.__upd.call(r, dt); }; } r.__hold = on; };
  window.__adv = async (sec, o) => {
    o = o || {};
    const r = window.__r, n = Math.round(sec * 60), S = window.__stat;
    for (let i = 0; i < n; i += 1) {
      r.time += 1 / 60;
      r.__upd ? r.__upd.call(r, 1 / 60) : r.update(1 / 60);
      if (r.inCinema && r.camFree) {
        const c = r.camera.position, st = r.shotState, id = st ? st.seed : -1;
        const sh = S.shots[id] || (S.shots[id] = { p0: [c.x, c.y, c.z], p1: null, t: 0, minY: 9, maxY: 0, maxBlur: 0 });
        sh.p1 = [c.x, c.y, c.z]; sh.t = st ? st.t : 0; sh.minY = Math.min(sh.minY, c.y); sh.maxY = Math.max(sh.maxY, c.y);
        const bl = Math.abs(r.blurX || 0) + Math.abs(r.blurY || 0);
        sh.maxBlur = Math.max(sh.maxBlur, bl); S.maxBlur = Math.max(S.maxBlur, bl); S.minY = Math.min(S.minY, c.y); S.maxY = Math.max(S.maxY, c.y); S.frames += 1;
      }
      if (o.stopBlur && Math.abs(r.blurX || 0) > o.stopBlur) { r.render(); return { stopped: true, blur: r.blurX, shot: r.shotState && r.shotState.seed, t: r.shotState && +r.shotState.t.toFixed(2) }; }
      if (i % 4 === 0) r.render();
      if (i % 90 === 89) await new Promise((x) => setTimeout(x, 4));
    }
    r.render();
    return { inCinema: r.inCinema, shot: r.shotState && r.shotState.seed, t: r.shotState && +r.shotState.t.toFixed(2), blur: +(r.blurX || 0).toFixed(3) };
  };
  window.__shots = () => JSON.stringify(Object.entries(window.__stat.shots).map(([k, v]) => [k, v.p0.map((n) => +n.toFixed(2)), v.p1.map((n) => +n.toFixed(2)), +v.minY.toFixed(2), +v.maxY.toFixed(2), +v.maxBlur.toFixed(3), +v.t.toFixed(1)]));
})();
