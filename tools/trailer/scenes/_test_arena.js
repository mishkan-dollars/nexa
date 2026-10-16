// проверочная сцена конвейера: арена (миссия 13), одна FP-нарезка и одна с Free-камерой
Trl.scene('_test_arena', {
  mission: 13, seed: 3,
  setup(S) {
    const r = S.r;
    r.giveWeapon('ak', { equip: true });
    [[-6, -8], [0, -12], [6, -9], [3, -14]].forEach(([x, z], i) => r.enemy(i % 2 ? 'grunt' : 'rusher', x, z, { yaw: 0 }));
  },
  tick(S, t, dt) {
    const r = S.r, live = r.cb.enemies.filter((e) => !e.dead);
    if (!live.length) return;
    let best = live[0], bd = 1e9; live.forEach((e) => { const d = Math.hypot(e.x - r.p.x, e.z - r.p.z); if (d < bd) { bd = d; best = e; } });
    S.fp.lookAt(best.x, 1.3, best.z, dt, 0.2, 4);
    if (Math.abs(S.wrap(r.p.yaw - S.yawTo(r.p.x, r.p.z, best.x, best.z))) < 0.05 && r.fireCd <= 0) r.tryFire();
  },
  cuts: {
    fp: { t0: 0.0, dur: 4 * 0.41371, cam(S) { S.camFP(); } },
    free: { t0: 1.0, dur: 4 * 0.41371, cam(S, k, t) {
      const p = S.r.p, a = S.smoother(k), h = S.hand(t, 0.01, 1);
      S.camFree(p.x + 3 - 5 * a + h[0], 1.7 + 0.3 * a + h[1], p.z + 3 - 2 * a, p.x, 1.3, p.z - 8, 68, 0);
    } }
  }
});
