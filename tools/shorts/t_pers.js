// проверка личностей: шеренга живых врагов, смотрим 8 с в слоумо
window.Shorts = window.Shorts || {};
Shorts.tPers = async (o) => {
  const r = Scn.r;
  Scn.enter('plaza', 0, 0, 0);
  Scn.clear();
  r.p.x = 0; r.p.z = 8; r.p.yaw = 0;
  const list = o.list || ['panic', 'sniper', 'officer', 'jugg', 'zealot', 'tech'];
  const es = [];
  list.forEach((id, i) => {
    const x = -7.5 + i * (15 / (list.length - 1));
    const e = r.enemy(id === 'jugg' ? 'heavy' : 'grunt', x, -7 - (i % 2) * 2, { drop: false, yaw: 0, exact: true, pers: id, tag: 'film' });
    es.push(e);
  });
  return Scn.film(o.name || 't_pers', o.dur || 8, async (t) => {
    r.p.x = 0; r.p.z = 8;
    Scn.cam(0, 1.6, 12, 0, 1.2, -6, o.fov || 60, 0);
    Scn.advance((o.slow || 0.5) / 30);
    const ctx = Scn.frame({});
    es.forEach((e, i) => {
      const p = Scn.proj(e.n.g.position.x, 2.4, e.n.g.position.z);
      if (p.vis) Cap.tag(ctx, list[i], p.x, p.y, { size: 28 });
    });
  }, { sheets: [{ t0: 0, t1: o.dur || 8, every: 8, cols: 10, tw: 108 }], snaps: [] });
};
