// проверка вида взрыва в регионе: контактный лист
window.Shorts = window.Shorts || {};
Shorts.tExpl = async (o) => {
  const r = Scn.r;
  const R = Scn.enter(o.region || 'plaza', 0, 0, 0);
  Scn.clear();
  const kind = o.kind || 'c4', ex = o.ex || [0, -3], cam = o.cam || [0, 1.5, 10], look = o.look || [0, 1.5, -3];
  let fired = false;
  return Scn.film(o.name || 't_expl', o.dur || 6, async (t) => {
    if (t === 0) { (o.guards || [[-2, -1], [2.2, -4], [0.5, -6]]).forEach((q) => Scn.guard('grunt', q[0], q[1], 0)); }
    if (!fired && t >= 0.3) { fired = true; r.explode(ex[0], 0.9, ex[1], o.R || 5, o.dmg || 110, kind); }
    Scn.cam(cam[0], cam[1], cam[2], look[0], look[1], look[2], o.fov || 62, 0);
    Scn.advance((t < 0.3 ? 0.5 : (o.slow || 0.25)) / 30);
    Scn.frame({});
  }, { sheets: [{ t0: 0, t1: o.dur || 6, every: o.every || 6, cols: 10, tw: 108 }], snaps: [] });
};
