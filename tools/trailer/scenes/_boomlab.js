// лаборатория взрывов: три типа взрыва на арене (миссия 13) с одной и той же камерой — для сравнения «до/после» (контактные листы check-clips)
Trl.scene('_boomlab', {
  mission: 13, seed: 5,
  setup(S) {
    S.r.p.x = 0; S.r.p.z = 12;
    S.r.cb.enemies.forEach((e) => { e.dead = true; });
    S.r.clearEnemies && S.r.clearEnemies();
    S.boomT = { frag: 0.4, barrel: 5.4, bomb: 10.4 };
  },
  tick(S, t) {
    const r = S.r, T = S.boomT;
    if (!T.fired1 && t >= T.frag) { T.fired1 = true; r.explode(0, 0.6, -2, 6.5, 80, 'frag'); }
    if (!T.fired2 && t >= T.barrel - 0.6) { T.fired2 = true; S.barrelObj = r.barrel(-1, -2); }
    if (!T.fired3 && t >= T.barrel) { T.fired3 = true; S.barrelObj && S.barrelObj.damage(99); }
    if (!T.fired4 && t >= T.bomb) { T.fired4 = true; r.explode(0, 0.6, -3, 11, 120, 'bomb'); }
  },
  cuts: {
    frag:   { t0: 0.0,  dur: 4.0, cam(S, k, t) { S.camFree(2.5 - 0.8 * k, 1.5, 9 - 0.8 * k, 0, 1.6, -2, 62, 0); } },
    barrel: { t0: 5.0,  dur: 4.0, cam(S, k, t) { S.camFree(3.0 - 0.8 * k, 1.5, 8 - 0.8 * k, -1, 1.5, -2, 62, 0); } },
    bomb:   { t0: 10.0, dur: 5.0, cam(S, k, t) { S.camFree(5.0 - 1.0 * k, 2.0, 12 - 1.5 * k, 0, 2.2, -3, 60, 0); } }
  }
});
