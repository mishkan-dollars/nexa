// проба съёмки от первого лица: кулаки, пинок, подкат
window.Shorts = window.Shorts || {};
Shorts.tMoves = async (o) => {
  o = o || {};
  const r = Scn.r;
  Scn.enter('plaza', 0, 0, 0); Scn.clear();
  r.camFree = null; r.inCinema = false; r.cineDepth = 0; r.shotState = null; r.locked = false; r.paused = false;
  r.p.x = 0; r.p.z = 10; r.p.yaw = 0; r.p.pitch = 0;
  const key = (code, down) => document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code.replace('Key', '').toLowerCase(), bubbles: true }));
  const tap = (code) => { key(code, true); key(code, false); };
  const es = [];
  const ev = [
    { t: 0.2, fn: () => { tap('KeyF'); es.push(Scn.guard('grunt', 0, 8.3, 0)); } },
    { t: 0.9, fn: () => r.pressFire() }, { t: 1.4, fn: () => r.pressFire() }, { t: 1.9, fn: () => r.pressFire() },
    { t: 3.0, fn: () => { Scn.clear(); es.push(Scn.guard('grunt', 0, 8.2, 0)); } },
    { t: 3.4, fn: () => tap('KeyV') },
    { t: 5.0, fn: () => { Scn.clear(); es.push(Scn.guard('grunt', 0, 3.0, 0)); r.p.z = 10; r.keys.KeyW = true; r.keys.ShiftLeft = true; } },
    { t: 5.9, fn: () => tap('KeyC') },
    { t: 7.2, fn: () => { r.keys.KeyW = false; r.keys.ShiftLeft = false; } }
  ].map((e) => Object.assign(e, { done: false }));
  return Scn.film(o.name || 't_moves', 8.5, async (t) => {
    ev.forEach((e) => { if (!e.done && t >= e.t) { e.done = true; e.fn(); } });
    Scn.advance(1 / 30);
    Scn.frame({});
  }, { sheets: [{ t0: 0, t1: 8.5, every: 6, cols: 10, tw: 108 }] });
};
