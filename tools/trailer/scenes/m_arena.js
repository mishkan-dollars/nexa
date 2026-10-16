// Сцена m_arena — миссия 13 («арена»): перестрелка и взрыв бочек. Нарезки: FP-бег, FP-огонь, Free-кран, Free-облёт взрыва в слоу-мо.
// Сценарий (время симуляции, с): 0–1.8 игрок бежит вперёд, с 1.2 включается автоприцел (S.engage), 6.9 — взрыв бочек среди врагов.
(() => {
  const B = Trl.B, lerp = Trl.lerp, sm = Trl.smoother;
  const BAR = [[-7.2, -16.4], [-5.4, -17.4], [-8.6, -14.6]];   // бочки; врагов ставим рядом, чтобы взрыв кого-то подбросил
  const shotAt = (S, name) => (S._m = S._m || {})[name];

  Trl.scene('m_arena', {
    mission: 13, seed: 11,
    setup(S) {
      const r = S.r, p = r.p;
      r.clearEnemies && r.clearEnemies();
      r.giveWeapon('ak', { equip: true });
      p.x = 0; p.z = 4.5; p.yaw = 0; p.pitch = 0;
      Trl.fpState.yaw = 0; Trl.fpState.pitch = 0;
      S._m = { bar: [], e: [] };
      BAR.forEach(([x, z]) => S._m.bar.push(r.barrel(x, z)));
      const mk = (type, x, z, o) => S._m.e.push(r.enemy(type, x, z, Object.assign({ yaw: 0 }, o || {})));
      mk('grunt', -6.4, -16.0, { pers: 'pro' });
      mk('grunt', -4.4, -18.4, { pers: 'sadist' });
      mk('grunt', 3.5, -17.5);
      mk('rusher', 9, -24);
      mk('rusher', -12, -25);
      mk('heavy', 7.5, -21);
    },
    tick(S, t, dt) {
      const r = S.r, p = r.p, M = S._m;
      r.hp = r.maxHp || 100;
      // бег по диагонали к центру арены, дальше шагом
      if (t < 1.9) S.fp.walkPath('run', [[-0.5, -1.5], [-1.5, -5.2]], true);
      else if (t < 6.5) S.fp.walkPath('walk', [[-2.0, -7.2], [-3.0, -8.4]], false);
      else S.fp.stop();
      // автоприцел: после 1.2 с; перед взрывом метим в бочку (ближайшая к группе врагов)
      if (t >= 1.2 && t < 6.7) S.engage(dt, { tau: 0.2, vmax: 3.6, tol: 0.045, delay: 0.3, range: 34 });
      if (t >= 6.7 && t < 7.0) {
        const b = M.bar[0]; if (b && b.alive) { S.fp.lookAt(b.x, 0.6, b.z, dt, 0.16, 4); }
      }
      if (t >= 6.9 && !M.boom) { M.boom = true; M.bar.forEach((b, i) => { if (b.alive) setTimeout(() => b.damage(99), i * 120); }); }
      // слоу-мо вокруг взрыва: 6.9–7.9 с (камера Free едет в реальном времени)
      r.timeScale = t > 6.95 && t < 7.9 ? 0.3 : 1;
    },
    cuts: {
      run_fp:   { t0: 0.4, dur: 4 * B, cam(S) { S.camFP(); } },
      fight_fp: { t0: 2.6, dur: 4 * B, cam(S) { S.camFP(); } },
      crane:    { t0: 1.6, dur: 6 * B, cam(S, k, t) {
        const p = S.r.p, u = sm(k), h = S.hand(t, 0.012, 3);
        S.camFree(p.x + lerp(2.4, -3.2, u) + h[0], lerp(1.5, 4.6, u) + h[1], p.z + lerp(5.0, 2.6, u), p.x - 1.5, 1.3, p.z - 14, lerp(66, 56, u), 0);
      } },
      boom_orbit: { t0: 6.3, dur: 5 * B, cam(S, k, t) {
        const u = sm(k), a = lerp(-0.95, 0.35, u), R = lerp(11.5, 8.5, u), h = S.hand(t, 0.01, 5), cx = -7.0, cz = -16.0;
        S.camFree(cx + Math.sin(a) * R + h[0], lerp(1.3, 2.7, u) + h[1], cz + Math.cos(a) * R, cx, 1.5, cz, lerp(62, 54, u), 0);
      } }
    }
  });
})();
