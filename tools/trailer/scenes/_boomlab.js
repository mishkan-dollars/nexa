// лаборатория взрывов: три типа взрыва на арене (миссия 13), камера далеко (взрывы большие) — для сравнения «до/после» (контактные листы)
Trl.scene('_boomlab', {
  mission: 13, seed: 5,
  setup(S) {
    S.r.p.x = 0; S.r.p.z = 6;
    S.r.clearEnemies && S.r.clearEnemies();
    S.boomT = { frag: 0.4, barrel: 5.4, bomb: 10.4 };
  },
  tick(S, t) {
    const r = S.r, T = S.boomT;
    if (!T.f1 && t >= T.frag) { T.f1 = true; r.explode(0, 0.6, -20, 6.5, 80, 'frag'); }
    if (!T.f2 && t >= T.barrel - 0.6) { T.f2 = true; S.barrelObj = r.barrel(-1, -20); }
    if (!T.f3 && t >= T.barrel) { T.f3 = true; S.barrelObj && S.barrelObj.damage(99); }
    if (!T.f4 && t >= T.bomb) { T.f4 = true; r.explode(0, 0.6, -22, 11, 120, 'bomb'); }
  },
  cuts: {
    frag:   { t0: 0.2,  dur: 2.4, cam(S, k) { S.camFree(3.0 - 1.0 * k, 1.7, 6.5, 0, 2.6, -20, 58, 0); } },
    barrel: { t0: 5.2,  dur: 2.0, cam(S, k) { S.camFree(3.0 - 1.0 * k, 1.7, 5.0, -1, 2.2, -20, 52, 0); } },
    bomb:   { t0: 10.2, dur: 3.2, cam(S, k) { S.camFree(5.0 - 1.0 * k, 2.2, 7.0, 0, 3.5, -22, 62, 0); } }
  }
});
