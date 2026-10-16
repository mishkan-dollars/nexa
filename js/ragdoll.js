// NEXA: рэгдолл и реактивные смерти. Подключается после actors.js / explosions.js.
// Падение врага — не заготовленная анимация, а верле-симуляция 16 точек (таз, плечи, шея, голова, бёдра, живот, локти, кисти, колени, лодыжки)
// с распорками, лимитами коленей/локтей, полом, ящиками и стенами. Скелет актора (капсулы из actors.js) просто следует за точками.
//   • выстрел в голову  — марионетку «обрезали»: тело оседает вертикально, голова дёргается назад по траектории пули
//   • попадание в ногу  — раненая нога подгибается, 0.5 с спотыкания, потом падение в сторону раненой ноги
//   • попадание в корпус — складывается пополам, обе руки к ране (IK), шаг назад, потом валится на колени/вперёд
//   • дробовик / взрыв / крупный урон — сразу импульс по траектории и кувырок
//   • после падения 1–2 с судороги конечностей; кровь: брызги вдоль траектории пули + пульсирующая рана + лужа, растущая 3 с
// Интерфейс актора (n.death, D.done, n.g, e.x/e.z) сохранён; старая заготовка deathPose остаётся для декоративных трупов (actorLay).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.geo || !C.Run) return;
  const { Run, lerp, smooth } = C;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sgn = () => (Math.random() < 0.5 ? -1 : 1);

  let V = null; // THREE подгружается лениво — векторы создаём при первом использовании
  const tv = () => V || (V = {
    a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), X: new THREE.Vector3(), Y: new THREE.Vector3(), Z: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0), down: new THREE.Vector3(0, -1, 0), m: new THREE.Matrix4(),
    Qt: new THREE.Quaternion(), Qi: new THREE.Quaternion(), q1: new THREE.Quaternion(), q2: new THREE.Quaternion()
  });

  // ------------------------------------------------------------------ точки и связи
  const P0 = 0, SL = 1, SR = 2, NK = 3, HD = 4, HL = 5, HR = 6, FR = 7, EL = 8, ER = 9, WL = 10, WR = 11, KL = 12, KR = 13, AL = 14, AR = 15, NP = 16;
  // положение точек корпуса в системе таза (x — «правая» сторона рига, y — вверх, z — вперёд), метры при scale = 1
  const REST = [[0, 0, 0], [-0.2, 0.52, 0], [0.2, 0.52, 0], [0, 0.56, 0], [0, 0.70, 0.005], [-0.095, -0.02, 0], [0.095, -0.02, 0], [0, 0.30, 0.12]];
  const RAD = [0.12, 0.09, 0.09, 0.08, 0.12, 0.09, 0.09, 0.04, 0.045, 0.045, 0.05, 0.05, 0.055, 0.055, 0.05, 0.05];
  const UPPER = [SL, SR, NK, HD, FR], ARMS = [EL, ER, WL, WR], LEGS = [HL, HR, KL, KR, AL, AR], LIMBS = [HD, EL, ER, WL, WR, KL, KR, AL, AR];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const CA = [], CB = [], CL = [], CK = [], CM = [], CT = []; // CT=1 — связь корпуса (мягче в первые кадры, пока поза «доворачивается»)
  const link = (a, b, len, k, min, torso) => { CA.push(a); CB.push(b); CL.push(len); CK.push(k); CM.push(min ? 1 : 0); CT.push(torso ? 1 : 0); };
  const TORSO = [P0, SL, SR, NK, HL, HR, FR];
  for (let i = 0; i < TORSO.length; i += 1) for (let j = i + 1; j < TORSO.length; j += 1) link(TORSO[i], TORSO[j], dist(REST[TORSO[i]], REST[TORSO[j]]), 1, 0, 1);
  link(HD, NK, 0.14, 1, 0, 0);
  link(HD, SL, dist(REST[HD], REST[SL]), 0.1, 0, 0); link(HD, SR, dist(REST[HD], REST[SR]), 0.1, 0, 0); link(HD, P0, dist(REST[HD], REST[P0]), 0.08, 0, 0);
  link(SL, EL, 0.27, 1, 0, 0); link(EL, WL, 0.27, 1, 0, 0); link(SR, ER, 0.27, 1, 0, 0); link(ER, WR, 0.27, 1, 0, 0);
  link(HL, KL, 0.42, 1, 0, 0); link(KL, AL, 0.4, 1, 0, 0); link(HR, KR, 0.42, 1, 0, 0); link(KR, AR, 0.4, 1, 0, 0);
  link(KL, KR, 0.13, 1, 1, 0); link(AL, AR, 0.11, 1, 1, 0); // ноги не проходят друг через друга
  link(WL, P0, 0.16, 1, 1, 0); link(WR, P0, 0.16, 1, 1, 0);  // кисти не лезут в таз
  const NC = CA.length, H = 1 / 60, GRAV = 11.5;
  // массы точек (кг): тяжёлый таз/корпус тянет лёгкие кисти и лодыжки, а не наоборот
  const MASS = [14, 6, 6, 3, 5, 8, 8, 8, 2, 2, 1.2, 1.2, 4, 4, 2, 2], IMS = MASS.map((m) => 1 / m);
  const WA = new Float64Array(NC), WB = new Float64Array(NC);
  for (let c = 0; c < NC; c += 1) { const ia = IMS[CA[c]], ib = IMS[CB[c]]; WA[c] = ia / (ia + ib); WB[c] = ib / (ia + ib); }
  const DAMP = MASS.map((m, i) => (i === P0 || i === FR || i === NK ? 0.996 : i === HD ? 0.994 : 0.989));

  // ------------------------------------------------------------------ сборка точек из текущей позы актора
  function capture(n, R) {
    const T = THREE, v = tv(), g = n.g, p = R.p, s = g.scale.x;
    g.updateMatrixWorld(true);
    const put = (i, x, y, z) => { p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z; };
    const w = (obj, x, y, z, i) => { v.a.set(x, y, z); obj.localToWorld(v.a); put(i, v.a.x, v.a.y, v.a.z); };
    w(n.hips, 0, 0, 0, P0); w(n.armL, 0, 0, 0, SL); w(n.armR, 0, 0, 0, SR); w(n.head, 0, 0, 0, NK); w(n.head, 0, 0.14, 0.005, HD);
    w(n.legL, 0, 0, 0, HL); w(n.legR, 0, 0, 0, HR); w(n.spine, 0, 0.24, 0.12, FR);
    w(n.elbL, 0, 0, 0, EL); w(n.elbR, 0, 0, 0, ER); w(n.elbL, 0, -0.27, 0, WL); w(n.elbR, 0, -0.27, 0, WR);
    w(n.kneeL, 0, 0, 0, KL); w(n.kneeR, 0, 0, 0, KR); w(n.footL, 0, 0, 0, AL); w(n.footR, 0, 0, 0, AR);
    for (let i = 0; i < NP * 3; i += 1) R.q[i] = p[i];
    R.s = s;
  }
  function addVel(R, i, x, y, z) { // скорость в метрах/с: смещаем «предыдущую» позицию
    if (i < 0) { for (let k = 0; k < NP; k += 1) addVel(R, k, x, y, z); return; }
    R.q[i * 3] -= x * H; R.q[i * 3 + 1] -= y * H; R.q[i * 3 + 2] -= z * H;
  }
  function addVelSet(R, list, x, y, z) { for (const i of list) addVel(R, i, x, y, z); }

  // ------------------------------------------------------------------ шаг симуляции
  function relax(r, R, kt) {
    const p = R.p, s = R.s;
    for (let c = 0; c < NC; c += 1) {
      const a = CA[c] * 3, b = CB[c] * 3;
      let dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
      const l2 = dx * dx + dy * dy + dz * dz, L = CL[c] * s;
      if (CM[c] && l2 >= L * L) continue;
      const l = Math.sqrt(l2) || 1e-6, f = (l - L) / l * CK[c] * (CT[c] ? kt : 1), fa = f * WA[c], fb = f * WB[c];
      p[a] += dx * fa; p[a + 1] += dy * fa; p[a + 2] += dz * fa; p[b] -= dx * fb; p[b + 1] -= dy * fb; p[b + 2] -= dz * fb;
    }
  }
  function limits(R) {
    const p = R.p;
    let ax = p[SR * 3] - p[SL * 3], ay = p[SR * 3 + 1] - p[SL * 3 + 1], az = p[SR * 3 + 2] - p[SL * 3 + 2];
    const bx = p[NK * 3] - p[P0 * 3], by = p[NK * 3 + 1] - p[P0 * 3 + 1], bz = p[NK * 3 + 2] - p[P0 * 3 + 2];
    let fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx;
    const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl; // «вперёд» корпуса
    const bend = (h, k, a, sign, soft) => {
      const mx = (p[h * 3] + p[a * 3]) / 2, my = (p[h * 3 + 1] + p[a * 3 + 1]) / 2, mz = (p[h * 3 + 2] + p[a * 3 + 2]) / 2;
      const d = ((p[k * 3] - mx) * fx + (p[k * 3 + 1] - my) * fy + (p[k * 3 + 2] - mz) * fz) * sign;
      if (d < 0) { const m = d * sign * soft; p[k * 3] -= fx * m; p[k * 3 + 1] -= fy * m; p[k * 3 + 2] -= fz * m; }
    };
    bend(HL, KL, AL, 1, 0.85); bend(HR, KR, AR, 1, 0.85);   // колено гнётся только вперёд
    bend(SL, EL, WL, -1, 0.5); bend(SR, ER, WR, -1, 0.5);   // локоть — назад
    const xl = Math.hypot(ax, ay, az) || 1; ax /= xl; ay /= xl; az /= xl;
    const spread = (h, k, sg, lim) => { // отведение ноги не больше ~45°
      const dx = p[k * 3] - p[h * 3], dy = p[k * 3 + 1] - p[h * 3 + 1], dz = p[k * 3 + 2] - p[h * 3 + 2];
      const out = (dx * ax + dy * ay + dz * az) * sg, L = Math.hypot(dx, dy, dz) * lim;
      if (out > L) { const m = (out - L) * 0.6 * sg; p[k * 3] -= ax * m; p[k * 3 + 1] -= ay * m; p[k * 3 + 2] -= az * m; }
    };
    spread(HL, KL, -1, 0.72); spread(HR, KR, 1, 0.72); spread(HL, AL, -1, 0.8); spread(HR, AR, 1, 0.8);
    const yl = Math.hypot(bx, by, bz) || 1, hx = p[HD * 3] - p[NK * 3], hy = p[HD * 3 + 1] - p[NK * 3 + 1], hz = p[HD * 3 + 2] - p[NK * 3 + 2], hl = Math.hypot(hx, hy, hz) || 1;
    const cn = (hx * bx + hy * by + hz * bz) / (hl * yl);
    if (cn < 0.4) { const m = (0.4 - cn) * hl * 0.7 / yl; p[HD * 3] += bx * m; p[HD * 3 + 1] += by * m; p[HD * 3 + 2] += bz * m; } // шея не складывается больше ~65°
  }
  function collide(r, R) {
    const p = R.p, q = R.q, s = R.s, cl = R.cols, b = r.bounds;
    for (let i = 0; i < NP; i += 1) {
      const o = i * 3, rad = RAD[i] * s;
      if (b) {
        const mx = b.w / 2 - 0.22, mz = b.d / 2 - 0.22;
        if (p[o] < b.cx - mx) p[o] = b.cx - mx; else if (p[o] > b.cx + mx) p[o] = b.cx + mx;
        if (p[o + 2] < b.cz - mz) p[o + 2] = b.cz - mz; else if (p[o + 2] > b.cz + mz) p[o + 2] = b.cz + mz;
      }
      for (let k = 0; k < cl.length; k += 1) {
        const c = cl[k]; if (c.off) continue;
        const y1 = c.y1 === undefined ? 3.6 : c.y1;
        if (c.yb !== undefined && p[o + 1] < c.yb - rad) continue;   // ниже нижней грани (столешница над коленями)
        if (p[o] < c.x0 - rad || p[o] > c.x1 + rad || p[o + 2] < c.z0 - rad || p[o + 2] > c.z1 + rad || p[o + 1] > y1 + rad) continue;
        if (y1 < 1.6 && q[o + 1] >= y1 + rad * 0.5 - 0.03) { // сверху ящика
          p[o + 1] = y1 + rad; q[o + 1] = Math.min(q[o + 1], p[o + 1]); continue;
        }
        const dl = p[o] - (c.x0 - rad), dr = (c.x1 + rad) - p[o], df = p[o + 2] - (c.z0 - rad), db = (c.z1 + rad) - p[o + 2];
        let m = Math.min(dl, dr, df, db);
        const qo = q[o], qz = q[o + 2]; // точка пришла снаружи — выталкиваем с той стороны, откуда влетела (быстрое тело не проскакивает тонкую стену)
        if (qo <= c.x0 - rad) m = dl; else if (qo >= c.x1 + rad) m = dr; else if (qz <= c.z0 - rad) m = df; else if (qz >= c.z1 + rad) m = db;
        if (m === dl) { p[o] = c.x0 - rad; } else if (m === dr) { p[o] = c.x1 + rad; } else if (m === df) { p[o + 2] = c.z0 - rad; } else { p[o + 2] = c.z1 + rad; }
      }
      if (p[o + 1] < rad) {
        const vy = p[o + 1] - q[o + 1];
        if (R.sq && i <= FR && vy < -0.04) R.hitV = Math.max(R.hitV || 0, -vy / H); // скорость удара корпуса (м/с) — для squash & stretch
        p[o + 1] = rad; q[o + 1] = vy < -0.04 ? rad + vy * 0.12 : rad;
      }
    }
  }
  function friction(R) {
    const p = R.p, q = R.q, s = R.s;
    for (let i = 0; i < NP; i += 1) {
      const o = i * 3;
      if (p[o + 1] <= RAD[i] * s + 0.004) { // кулоновское трение + вязкое; при малой скорости — трение покоя (тело не ползёт и не дрожит)
        let vx = p[o] - q[o], vz = p[o + 2] - q[o + 2]; const v = Math.hypot(vx, vz), mu = i === P0 || i === FR || i === SL || i === SR ? 0.0023 : 0.0016;
        if (v < 0.0016) { q[o] = p[o]; q[o + 2] = p[o + 2]; } else { const k = Math.max(0, v * 0.94 - mu) / v; q[o] = p[o] - vx * k; q[o + 2] = p[o + 2] - vz * k; }
        if (Math.abs(p[o + 1] - q[o + 1]) < 0.0006) q[o + 1] = p[o + 1];
      }
    }
  }
  function simStep(r, R) {
    const p = R.p, q = R.q, lim = 0.24 * R.s;
    R.age += H;
    for (let i = 0; i < NP; i += 1) {
      const o = i * 3, damp = DAMP[i];
      let dx = (p[o] - q[o]) * damp, dy = (p[o + 1] - q[o + 1]) * damp - GRAV * H * H, dz = (p[o + 2] - q[o + 2]) * damp;
      const dl = Math.hypot(dx, dy, dz); if (dl > lim) { const k = lim / dl; dx *= k; dy *= k; dz *= k; } // не больше ~14 м/с: тело не пролетает сквозь пол и стены
      q[o] = p[o]; q[o + 1] = p[o + 1]; q[o + 2] = p[o + 2]; p[o] += dx; p[o + 1] += dy; p[o + 2] += dz;
    }
    const kt = clamp(0.3 + R.age / 0.3, 0.3, 1);
    for (let it = 0; it < R.iters; it += 1) { relax(r, R, kt); limits(R); collide(r, R); }
    friction(R);
  }

  // ------------------------------------------------------------------ точки → кости
  function drive(n, R) {
    const v = tv(), p = R.p, s = R.s, g = n.g;
    const pt = (i, o) => o.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    const X = v.X.set(p[SR * 3] - p[SL * 3], p[SR * 3 + 1] - p[SL * 3 + 1], p[SR * 3 + 2] - p[SL * 3 + 2]).normalize();
    const Y = v.Y.set(p[NK * 3] - p[P0 * 3], p[NK * 3 + 1] - p[P0 * 3 + 1], p[NK * 3 + 2] - p[P0 * 3 + 2]).normalize();
    X.addScaledVector(Y, -X.dot(Y)).normalize();
    v.Z.crossVectors(X, Y);
    v.m.makeBasis(X, Y, v.Z); v.Qt.setFromRotationMatrix(v.m);
    const ys = R.ys || 1, xz = R.xz || 1; // squash & stretch: сплющивание об пол и растяжение в падении (у игрока)
    g.rotation.set(0, 0, 0); g.scale.set(s * xz, s * ys, s * xz); g.position.set(p[0], p[1] - 0.95 * s * ys, p[2]);
    n.hips.position.set(0, 0.95, 0); n.hips.quaternion.copy(v.Qt); n.spine.quaternion.set(0, 0, 0, 1);
    const Qi = v.Qi.copy(v.Qt).invert();
    const loc = (a, b, out) => out.set(p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]).normalize();
    n.head.quaternion.setFromUnitVectors(v.up, loc(NK, HD, v.a).applyQuaternion(Qi));
    const limb = (top, mid, S, E, W) => {
      top.quaternion.setFromUnitVectors(v.down, loc(S, E, v.a).applyQuaternion(Qi));
      loc(E, W, v.b).applyQuaternion(Qi).applyQuaternion(v.q1.copy(top.quaternion).invert());
      mid.quaternion.setFromUnitVectors(v.down, v.b);
    };
    limb(n.armL, n.elbL, SL, EL, WL); limb(n.armR, n.elbR, SR, ER, WR);
    limb(n.legL, n.kneeL, HL, KL, AL); limb(n.legR, n.kneeR, HR, KR, AR);
    n.footL.rotation.set(0.3, 0, 0); n.footR.rotation.set(0.3, 0, 0);
  }

  // ------------------------------------------------------------------ предфазы: кинематические позы реакции (потом передаём телу симуляции)
  function poseClutch(r, n, R, t) { // складывается пополам, обе руки к ране
    const k = smooth(clamp((t - 0.06) / 0.4, 0, 1)), jerk = Math.sin(clamp(t / 0.12, 0, 1) * Math.PI), tr = Math.sin(t * 19) * 0.025 * k;
    n.hips.position.y = 0.95 - 0.3 * k; n.hips.rotation.set(0, 0, R.w * 0.08 * k);
    n.spine.rotation.set(-0.38 * jerk + 1.08 * k + tr, 0, -R.w * 0.1 * k);
    n.head.rotation.set(-0.35 * jerk + 0.5 * k, 0, 0);
    n.legL.rotation.set(-0.7 * k, 0, -0.08); n.legR.rotation.set(-0.62 * k, 0, 0.08);
    n.kneeL.rotation.set(1.35 * k, 0, 0); n.kneeR.rotation.set(1.2 * k, 0, 0);
    n.footL.rotation.set(0.3 * k, 0, 0); n.footR.rotation.set(0.3 * k, 0, 0);
    const w = R.wl, tg = clamp(k * 1.4, 0, 1);
    for (const sd of [0, 1]) { // кисти к ране: цель в системе корпуса
      const x = sd ? 0.05 : -0.05, tz = Math.max(0.14, w.z + 0.04);
      const T = tv().c.set(lerp(sd ? 0.2 : -0.2, w.x + x, tg), lerp(0.2, w.y + (sd ? 0.025 : -0.02), tg), lerp(0.05, tz, tg));
      r.solveArm(sd ? n.armR : n.armL, sd ? n.elbR : n.elbL, sd ? [0.2, 0.46, 0] : [-0.2, 0.46, 0], T, sd ? 1 : -1);
    }
  }
  function poseStumble(r, n, R, t) { // нога подкошена: прыжок на здоровой, бросок в сторону раны
    const w = R.w, k = smooth(clamp(t / 0.16, 0, 1)), k2 = smooth(clamp((t - 0.12) / 0.4, 0, 1)), wing = Math.sin(t * 17);
    const hurt = w > 0 ? [n.legR, n.kneeR, n.footR] : [n.legL, n.kneeL, n.footL], ok = w > 0 ? [n.legL, n.kneeL, n.footL] : [n.legR, n.kneeR, n.footR];
    hurt[0].rotation.set(-0.95 * k, 0, w * 0.1 * k); hurt[1].rotation.set(1.55 * k + wing * 0.1 * k, 0, 0); hurt[2].rotation.set(0.5 * k, 0, 0);
    ok[0].rotation.set(0.25 * k - 0.2 * k2, 0, -w * 0.06); ok[1].rotation.set(0.35 * k + 0.5 * k2, 0, 0); ok[2].rotation.set(0.15, 0, 0);
    n.hips.position.y = 0.95 - 0.1 * k - 0.24 * k2; n.hips.rotation.set(0, 0, -w * (0.18 + 0.38 * k2));
    n.spine.rotation.set(0.28 + 0.42 * k2, 0, w * 0.12 * k2); n.head.rotation.set(-0.2 * k + 0.1 * k2, 0, w * 0.2 * k2);
    const fl = 0.7 + 0.8 * k2;
    n.armL.rotation.set(-0.7 * k + wing * 0.25, 0, -(0.35 + fl * 0.8)); n.armR.rotation.set(-0.6 * k - wing * 0.25, 0, 0.35 + fl * 0.8);
    n.elbL.rotation.set(-0.5, 0, 0); n.elbR.rotation.set(-0.5, 0, 0);
  }
  function poseArch(r, n, R, t) { // попали в спину: выгибается, руки вверх/в стороны
    const k = smooth(clamp(t / 0.2, 0, 1)), k2 = smooth(clamp((t - 0.25) / 0.35, 0, 1));
    n.hips.position.y = 0.95 - 0.12 * k - 0.16 * k2; n.hips.rotation.set(0, 0, 0);
    n.spine.rotation.set(-0.42 * k + 0.55 * k2, 0, R.w * 0.08 * k); n.head.rotation.set(-0.55 * k + 0.4 * k2, 0, 0);
    n.armL.rotation.set(-1.0 * k, 0, -(0.5 + 1.0 * k)); n.armR.rotation.set(-1.0 * k, 0, 0.5 + 1.0 * k);
    n.elbL.rotation.set(-0.5 * k, 0, 0); n.elbR.rotation.set(-0.5 * k, 0, 0);
    n.legL.rotation.set(0.15 * k - 0.45 * k2, 0, -0.06); n.legR.rotation.set(-0.15 * k - 0.3 * k2, 0, 0.06);
    n.kneeL.rotation.set(0.3 * k + 0.9 * k2, 0, 0); n.kneeR.rotation.set(0.3 * k + 0.7 * k2, 0, 0);
  }

  // ------------------------------------------------------------------ старт: разбор попадания → вариант смерти
  function activeCount(r) { let c = 0; for (const n of r.npcs || []) if (n.death && n.death.rag && !n.death.done) c += 1; return c; }

  const upd0 = Run.prototype.updateNpc, kill0 = Run.prototype.actorKill, dmg0 = Run.prototype.damageEnemy, pool0 = Run.prototype.bloodPool;

  // запоминаем попадание: точка, откуда стреляли, суммарный урон за последние 120 мс (дробовик = много дробин)
  Run.prototype.damageEnemy = function (e, amt, head, pt) {
    const n = e && e.n;
    if (n && !e.dead) {
      const now = performance.now(), o = this.camera && this.camera.position;
      const rd = n.rd && now - n.rd.t < 120 ? n.rd : (n.rd = { t: now, dmg: 0 });
      rd.dmg += amt; rd.t = now;
      n.lastHit = { t: now, pt: pt ? { x: pt.x, y: pt.y, z: pt.z } : null, head: !!head, amt, dmg: rd.dmg, o: o ? { x: o.x, y: o.y, z: o.z } : null };
    }
    return dmg0.call(this, e, amt, head, pt);
  };

  Run.prototype.actorKill = function (n, head, from) {
    if (n.death) return n.death;
    const now = performance.now(), hit = n.lastHit && now - n.lastHit.t < 250 ? n.lastHit : null, blast = n.blast && now - n.blast.t < 250 ? n.blast : null;
    const D = kill0.call(this, n, head, from);
    try { // враг рядом погиб — кровь брызгает на торс игрока (вид от первого лица)
      const pp = this.p, g0 = n.g, dx = pp ? pp.x - g0.position.x : 0, dz = pp ? pp.z - g0.position.z : 0, ds = Math.hypot(dx, dz);
      if (pp && ds < 3.8 && (hit || blast) && this.bloodSplatTorso && !this.camFree) this.bloodSplatTorso({ x: dx / (ds || 1), z: dz / (ds || 1) }, clamp((3.8 - ds) / 2.6, 0.2, 1) * (blast ? 1.2 : head ? 1 : 0.75));
    } catch (err) { /* без крови */ }
    if (!(hit || blast || from) || !n.g.visible || (activeCount(this) >= 12 && !n.pForce) || !window.THREE) return D; // декоративные трупы (actorLay) и перегруз — старая поза
    try { ragStart(this, n, D, head, hit, blast, from); } catch (err) { D.rag = null; console.warn('[ragdoll]', err); }
    return D;
  };

  function ragStart(r, n, D, head, hit, blast, from) {
    const g = n.g, s = g.scale.x, ry = g.rotation.y, fw = { x: Math.sin(ry), z: Math.cos(ry) }, rt = { x: Math.cos(ry), z: -Math.sin(ry) };
    const R = D.rag = {
      p: new Float64Array(NP * 3), q: new Float64Array(NP * 3), s, age: 0, acc: 0, pre: false, pt: 0, preT: 0, pose: '', w: 1, wl: null, vx: 0, vz: 0, fric: 3,
      iters: r.q && r.q.parts >= 12 ? 5 : 3, cols: [], still: 0, tw: 0, twDone: false, twNext: 0, tTw: 1, poolMade: false, pool: null, bleedT: 0, wound: P0,
      head: !!head
    };
    // коллайдеры рядом с телом (статичный список на всё падение)
    const near = 9; for (const c of r.colliders || []) { if (c.off || (c.y0 !== undefined && c.y0 > 1.2)) continue; if (c.x1 > g.position.x - near && c.x0 < g.position.x + near && c.z1 > g.position.z - near && c.z0 < g.position.z + near) R.cols.push(c); }
    // откуда и чем
    let dir = null, dmg = 25, zone = 'torso', wy = 1.1 * s, takedown = false;
    if (blast) {
      const dx = g.position.x - blast.x, dz = g.position.z - blast.z, l = Math.hypot(dx, dz) || 1;
      dir = { x: dx / l, y: 0.55, z: dz / l }; dmg = 90 + 160 * (blast.f || 1); zone = 'blast';
    } else {
      if (hit) { dmg = hit.dmg; takedown = hit.amt >= 9000; }
      if (hit && hit.pt && hit.o) {
        const dx = hit.pt.x - hit.o.x, dy = hit.pt.y - hit.o.y, dz = hit.pt.z - hit.o.z, l = Math.hypot(dx, dy, dz) || 1;
        dir = { x: dx / l, y: dy / l, z: dz / l }; wy = hit.pt.y;
        const hy = (hit.pt.y - g.position.y) / s; zone = (hit.head || hy > 1.42) ? 'head' : hy < 0.8 ? 'leg' : 'torso';
      } else {
        const o = (hit && hit.o) || (from && from.x !== undefined ? from : null);
        if (o) { const dx = g.position.x - o.x, dz = g.position.z - o.z, l = Math.hypot(dx, dz) || 1; dir = { x: dx / l, y: 0, z: dz / l }; } else dir = { x: fw.x, y: 0, z: fw.z };
        zone = head ? 'head' : 'torso';
      }
      if (hit && hit.head) zone = 'head';
    }
    D.zone = zone;
    const imp = clamp((0.8 + 0.075 * dmg) / Math.pow(s, 1.4), 0.8, 8);          // м/с на «основной» точке
    const hz = dir.x * fw.x + dir.z * fw.z;                                        // >0 — пуля летит в спину (по направлению взгляда)
    let wlocal = 1;
    if (hit && hit.pt) wlocal = ((hit.pt.x - g.position.x) * rt.x + (hit.pt.z - g.position.z) * rt.z) >= 0 ? 1 : -1; else wlocal = sgn();
    R.w = wlocal; D.side = wlocal;
    let mode = 'sim';
    if (takedown) mode = 'takedown';
    else if (zone === 'head') mode = 'head';
    else if (zone === 'blast') mode = 'blast';
    else if (zone === 'leg') mode = imp > 5.2 ? 'throw' : 'stumble';
    else mode = imp > 4.6 ? 'throw' : (Math.random() < 0.25 ? 'throw' : (hz > 0.25 ? 'arch' : 'clutch'));
    if (n.pForce) { mode = 'collapse'; R.sq = true; R.imp = Math.max(imp, 3.4, n.pForce.imp || 0); }  // тело игрока (deathcam.js): ноги подкашиваются, тяжёлое падение
    R.mode = mode; R.dir = dir; R.imp = R.imp || imp; R.fw = fw; R.rt = rt;
    let mvx = n.mvx || 0, mvz = n.mvz || 0; const mvl = Math.hypot(mvx, mvz); if (mvl > 6) { mvx *= 6 / mvl; mvz *= 6 / mvl; } // сохраняем инерцию бега: тело не врастает в землю на месте
    // точка раны → какая точка частицы кровит
    capture(n, R);
    if (!isFinite(R.p[0] + R.p[1] + R.p[2] + R.p[NK * 3 + 1])) throw new Error('bad capture'); // испорченный актёр → старая анимация
    R.wound = zone === 'head' ? HD : zone === 'leg' ? (wlocal > 0 ? (wy / s > 0.45 ? KR : AR) : (wy / s > 0.45 ? KL : AL)) : (wy / s > 1.15 ? NK : P0);
    if (hit && hit.pt && (mode === 'clutch')) { const v = tv(); v.a.set(hit.pt.x, hit.pt.y, hit.pt.z); n.spine.worldToLocal(v.a); R.wl = { x: clamp(v.a.x, -0.12, 0.12), y: clamp(v.a.y, 0.0, 0.42), z: clamp(v.a.z, 0.1, 0.16) }; }
    else if (mode === 'clutch') R.wl = { x: 0, y: 0.25, z: 0.12 };
    // кровь: выходной фонтан вдоль траектории пули
    if (hit && hit.pt && r.bloodSpray) r.bloodSpray(hit.pt, dir, zone === 'head' ? 18 : zone === 'leg' ? 7 : 13, zone === 'head' ? 6.5 : 4.5, zone === 'head');
    // у предфазных вариантов тело ещё стоит и двигается
    R.vx = dir.x * (mode === 'clutch' ? 1.5 : mode === 'stumble' ? 1.1 : 0) + mvx * 0.9; R.vz = dir.z * (mode === 'clutch' ? 1.5 : mode === 'stumble' ? 1.1 : 0) + mvz * 0.9;
    if (mode === 'stumble') { R.vx += fw.x * 1.4 * (n.vel > 0.5 ? 1 : 0.4); R.vz += fw.z * 1.4 * (n.vel > 0.5 ? 1 : 0.4); R.fric = 2.2; }
    if (mode === 'clutch' || mode === 'stumble' || mode === 'arch') {
      R.pre = true; R.pose = mode; R.preT = mode === 'clutch' ? rnd(0.72, 0.95) : mode === 'stumble' ? rnd(0.46, 0.6) : rnd(0.4, 0.5);
      if (mode === 'arch') { R.vx = dir.x * 1.3 + mvx * 0.9; R.vz = dir.z * 1.3 + mvz * 0.9; }
    } else simInit(r, n, D, R);
    D.t = 0; D.done = false;
  }

  // начало свободного падения: берём позу, задаём скорости
  function simInit(r, n, D, R) {
    const g = n.g, dir = R.dir, imp = R.imp, fw = R.fw, rt = R.rt, mode = R.mode, k = Math.exp(-R.fric * R.pt);
    if (R.pt > 0) capture(n, R); // в предфазе поза уже сменилась
    R.pre = false; R.age = 0; R.acc = 0;
    const bx = R.vx * k, bz = R.vz * k, bn = [bx, 0, bz];
    addVel(R, -1, bx, 0, bz);
    const wi = nearestWound(R, n);
    if (mode === 'head') { // марионетку обрезали: проседаем вертикально, голова дёргается по пуле
      addVelSet(R, UPPER, 0, -0.9, 0); addVelSet(R, [P0, HL, HR], 0, -0.4, 0);
      addVel(R, HD, dir.x * imp * 0.85, 0.5, dir.z * imp * 0.85); addVel(R, NK, dir.x * imp * 0.35, 0, dir.z * imp * 0.35);
      addVel(R, KL, fw.x * 0.9, 0, fw.z * 0.9); addVel(R, KR, fw.x * 0.9, 0, fw.z * 0.9); // колени подламываются вперёд
      if (Math.random() < 0.4) addVelSet(R, UPPER, rt.x * sgn() * 0.8, 0, rt.z * sgn() * 0.8);
    } else if (mode === 'collapse') { // игрок: ноги подкашиваются, корпус тяжело рушится по линии удара
      const sd = (n.pForce && n.pForce.side) || sgn();
      addVelSet(R, UPPER, dir.x * imp * 0.5, -1.3, dir.z * imp * 0.5); addVel(R, P0, dir.x * imp * 0.25, -0.5, dir.z * imp * 0.25);
      addVelSet(R, [HL, HR], dir.x * imp * 0.2, 0, dir.z * imp * 0.2);
      addVel(R, KL, fw.x * 1.0, 0, fw.z * 1.0); addVel(R, KR, fw.x * 1.0, 0, fw.z * 1.0);
      addVel(R, HD, dir.x * imp * 0.45, 0.2, dir.z * imp * 0.45);
      addVelSet(R, ARMS, dir.x * imp * 0.3, 0.7, dir.z * imp * 0.3);
      addVelSet(R, UPPER, rt.x * sd * 0.7, 0, rt.z * sd * 0.7); // чуть разворачивает набок
    } else if (mode === 'takedown') { // тихое снятие: оседает вперёд-вниз
      addVelSet(R, UPPER, fw.x * 0.7, -0.5, fw.z * 0.7); addVel(R, KL, fw.x * 0.9, 0, fw.z * 0.9); addVel(R, KR, fw.x * 0.9, 0, fw.z * 0.9);
    } else if (mode === 'clutch') { // упал на колени и вперёд
      addVelSet(R, UPPER, fw.x * 1.1, -0.6, fw.z * 1.1); addVel(R, HD, fw.x * 0.8, -0.3, fw.z * 0.8);
      addVelSet(R, [KL, KR], -fw.x * 0.2, 0, -fw.z * 0.2);
    } else if (mode === 'arch') { // выгнуло — и лицом вперёд
      addVelSet(R, UPPER, dir.x * imp * 0.8, 0.2, dir.z * imp * 0.8); addVelSet(R, ARMS, dir.x * imp * 0.4, 0.4, dir.z * imp * 0.4);
    } else if (mode === 'stumble') { // бросок в сторону раненой ноги
      const sx = rt.x * R.w, sz = rt.z * R.w;
      addVelSet(R, UPPER, sx * 2.9 + fw.x * 0.6, 0.35, sz * 2.9 + fw.z * 0.6); addVelSet(R, ARMS, sx * 2.2, 0.2, sz * 2.2);
      addVel(R, R.w > 0 ? AR : AL, 0, 0.5, 0); // подкошенная нога отрывается от пола
    } else { // throw / blast: импульс по траектории, самая сильная доля — в точке попадания
      const up = mode === 'blast' ? 0.5 : 0.25;
      addVel(R, -1, dir.x * imp * 0.5, imp * up, dir.z * imp * 0.5);
      addVelSet(R, UPPER, dir.x * imp * 0.25, imp * 0.06, dir.z * imp * 0.25);
      const wo = wi * 3; // сильнее всего бьёт у раны, дальше от неё — слабее: тело закручивается вокруг центра масс
      for (let i = 0; i < NP; i += 1) {
        const o = i * 3, dx = R.p[o] - R.p[wo], dy = R.p[o + 1] - R.p[wo + 1], dz = R.p[o + 2] - R.p[wo + 2], w = Math.exp(-(dx * dx + dy * dy + dz * dz) / 0.2);
        addVel(R, i, dir.x * imp * 0.5 * w, imp * 0.1 * w, dir.z * imp * 0.5 * w);
      }
      addVelSet(R, LIMBS, rnd(-1, 1) * imp * 0.12, imp * 0.1 * Math.random(), rnd(-1, 1) * imp * 0.12);
      if (mode === 'blast') { addVelSet(R, LIMBS, rnd(-2, 2), rnd(0, 2.5), rnd(-2, 2)); }
    }
    R.dir = dir;
  }
  function nearestWound(R, n) { return R.wound; }

  // ------------------------------------------------------------------ кадр
  const BLEED_T = 1.4;
  Run.prototype.updateNpc = function (n, dt) {
    const D = n.death;
    if (!D || !D.rag) return upd0.call(this, n, dt);
    const g = n.g;
    if (!g.visible) { n.lx = g.position.x; n.lz = g.position.z; return; }
    if (D.done) return;
    ragFrame(this, n, D, Math.min(dt, 0.05));
  };

  function ragFrame(r, n, D, dt) {
    const R = D.rag, g = n.g;
    if (R.pre) {
      R.pt += dt; const t = R.pt;
      if (R.pose === 'clutch') poseClutch(r, n, R, t); else if (R.pose === 'stumble') poseStumble(r, n, R, t); else poseArch(r, n, R, t);
      const k = Math.exp(-R.fric * t), nx = g.position.x + R.vx * k * dt, nz = g.position.z + R.vz * k * dt;
      if (!r.blockedE(nx, g.position.z)) g.position.x = nx; if (!r.blockedE(g.position.x, nz)) g.position.z = nz;
      if (r.bloodSpray) { R.bleedT -= dt; if (R.bleedT <= 0) { R.bleedT = 0.07; const v = tv(); (R.pose === 'clutch' ? n.spine : n.hips).getWorldPosition(v.a); v.a.y += 0.25 * g.scale.x; r.bloodSpray({ x: v.a.x, y: v.a.y, z: v.a.z }, { x: R.dir.x * 0.4, y: 0.3, z: R.dir.z * 0.4 }, 2, 2.2, false); } }
      if (t >= R.preT) simInit(r, n, D, R);
      return;
    }
    R.acc += dt; let st = 0;
    while (R.acc >= H && st < 3) { twitch(R); simStep(r, R); R.acc -= H; st += 1; if (R.asleep) { const p = R.p, q = R.q; for (let i = 0; i < NP * 3; i += 1) q[i] = p[i]; } }
    if (!isFinite(R.p[0] + R.p[1] + R.p[2] + R.p[NK * 3 + 1]) || R.p[1] < -2) { ragEnd(r, n, D, R); return; }
    if (R.acc > H * 3) R.acc = 0;
    if (R.sq) squash(R, dt);
    drive(n, R);
    // скорость тела → покой
    let vm = 0; for (let i = 0; i < NP * 3; i += 3) vm = Math.max(vm, Math.hypot(R.p[i] - R.q[i], R.p[i + 1] - R.q[i + 1], R.p[i + 2] - R.q[i + 2]) / H);
    if (vm < 0.4) R.still += dt; else R.still = 0;
    R.asleep = R.twDone && R.tw <= 0 && R.still > 0.25;
    // кровь: пульсирующая рана пока падает/лежит и лужа
    if (R.age < BLEED_T && r.bloodSpray) {
      R.bleedT -= dt;
      if (R.bleedT <= 0) {
        R.bleedT = 0.06; const o = R.wound * 3, k = 1 - R.age / BLEED_T, d = R.dir;
        r.bloodSpray({ x: R.p[o], y: R.p[o + 1], z: R.p[o + 2] }, { x: d.x * 0.5 + (R.p[o] - R.q[o]) * 0.25, y: 0.5, z: d.z * 0.5 + (R.p[o + 2] - R.q[o + 2]) * 0.25 }, Math.ceil(2.4 * k), 1.8 + 1.4 * k, false);
      }
    }
    if (!R.poolMade && (R.p[1] < 0.42 * R.s || R.age > 1.6)) makePool(r, n, R);
    if (R.pool && !R.settled) { const m = R.pool.m.position, o = (R.p[0] * 0.6 + R.p[NK * 3] * 0.4); m.x += (o - m.x) * Math.min(1, dt * 3.5); m.z += ((R.p[2] * 0.6 + R.p[NK * 3 + 2] * 0.4) - m.z) * Math.min(1, dt * 3.5); }
    if (!R.twDone && R.still > 0.15 && R.age > 0.4) randTwitch(R);
    if (!R.hold && (R.age > 9 || (R.twDone && R.tw <= 0 && R.still > 0.45))) ragEnd(r, n, D, R);
  }
  // растяжение в падении и пружинное сплющивание при ударе об пол (только тело игрока): вес чувствуется в теле, а не только в камере
  function squash(R, dt) {
    if (!R.sqHit && R.hitV > 2.0) { R.sqHit = true; R.sqX = 0; R.sqV = clamp(R.hitV * 0.6, 1.6, 4.2); }
    let st = 0;
    if (R.sqHit) {
      R.sqV += (-420 * R.sqX - 15 * R.sqV) * dt; R.sqX = clamp(R.sqX + R.sqV * dt, -0.08, 0.17);
    } else { let vd = 0; for (let i = 0; i < NP; i += 1) vd = Math.max(vd, -(R.p[i * 3 + 1] - R.q[i * 3 + 1]) / H); st = clamp(vd * 0.012, 0, 0.09); }
    R.ys = 1 - R.sqX + st; R.xz = 1 + R.sqX * 0.55 - st * 0.5;
  }
  function ragEnd(r, n, D, R) {
    D.done = true; R.settled = true;
    if (!R.poolMade) makePool(r, n, R);
  }
  function makePool(r, n, R) {
    R.poolMade = true;
    const px = R.p[0], pz = R.p[2], s = R.s, d = r.decal && r.decal(px, pz, rnd(0.6, 0.85) * s * (R.head ? 1.12 : 1), 1);
    if (d) { d.dur = 3; d.delay = 0.05; R.pool = d; const d2 = r.decal(px + rnd(-0.3, 0.3), pz + rnd(-0.3, 0.3), rnd(0.22, 0.4) * s, 1); if (d2) { d2.dur = 3; d2.delay = 0.5; } }
  }
  // судороги: тоническая фаза (скованность, выгибание) → клонические серии рывков с паузами; частота и размах падают к концу,
  // доминирует одна сторона тела, в рывки вовлечены шея, плечи и таз; длительность и сила случайны. electro — быстрее и дольше (шок)
  function startTwitch(R, dur, amp, electro) {
    R.twDone = true; R.settled = true; R.tw = R.tTw = dur; R.tamp = amp; R.tside = sgn(); R.twNext = rnd(0, 0.12); R.twBurst = 0; R.twAlt = 1; R.twElec = !!electro; R.twLast = false;
    R.twTonic = electro ? rnd(0.3, 0.7) : (Math.random() < 0.45 ? rnd(0.12, 0.4) : 0);
    const tm = R.tm || (R.tm = new Float32Array(LIMBS.length));
    for (let j = 0; j < LIMBS.length; j += 1) { const i = LIMBS[j]; tm[j] = i === HD ? rnd(0.5, 1) : rnd(0.25, 1.2) * ((i & 1 ? 1 : -1) === R.tside ? 1 : rnd(0.25, 0.6)); }
  }
  function twitch(R) {
    if (R.tw <= 0) return;
    R.tw -= H;
    const k = clamp(R.tw / R.tTw, 0, 1), env = Math.pow(k, 1.4), a0 = R.tamp * (0.45 + 2.3 * env), tm = R.tm, p = R.p;
    if (R.twTonic > 0) { // скованность: голова запрокинута, руки сжаты к груди, ноги вытянуты, мелкая дрожь
      R.twTonic -= H;
      let ux = p[HD * 3] - p[P0 * 3], uy = p[HD * 3 + 1] - p[P0 * 3 + 1], uz = p[HD * 3 + 2] - p[P0 * 3 + 2]; const ul = Math.hypot(ux, uy, uz) || 1, a = R.tamp * (R.twElec ? 0.5 : 0.28) / ul;
      ux *= a; uy *= a; uz *= a;
      addVel(R, HD, ux, uy, uz); addVel(R, NK, ux * 0.5, uy * 0.5, uz * 0.5); addVel(R, AL, -ux, -uy, -uz); addVel(R, AR, -ux, -uy, -uz);
      for (const w of [WL, WR]) { const o = w * 3, f = FR * 3, dx = p[f] - p[o], dy = p[f + 1] - p[o + 1], dz = p[f + 2] - p[o + 2], dl = (Math.hypot(dx, dy, dz) || 1) / (a * ul * 1.4); addVel(R, w, dx / dl, dy / dl, dz / dl); }
      const i = LIMBS[(Math.random() * LIMBS.length) | 0]; addVel(R, i, rnd(-1, 1) * a * ul * 0.5, rnd(-1, 1) * a * ul * 0.5, rnd(-1, 1) * a * ul * 0.5);
      return;
    }
    R.twNext -= H;
    if (R.twNext > 0) {
      if (env > 0.05 && Math.random() < 0.5) { const i = LIMBS[(Math.random() * LIMBS.length) | 0], t = R.tamp * 0.16 * env; addVel(R, i, rnd(-1, 1) * t, rnd(-0.5, 1) * t, rnd(-1, 1) * t); } // мелкий тремор между рывками
      return;
    }
    if (R.twBurst <= 0) R.twBurst = 2 + ((Math.random() * 5) | 0);
    R.twBurst -= 1;
    const f = (R.twElec ? 14 : 8) * (0.3 + 0.7 * env) * rnd(0.8, 1.25);
    R.twNext = R.twBurst <= 0 ? rnd(0.15, 0.55) * (1.7 - k) : 1 / f;
    R.twAlt = -R.twAlt;
    const a = a0 * rnd(0.55, 1.35), up = R.twAlt > 0 ? 1 : -0.35;
    if (k > 0.25 && Math.random() < 0.03 + 0.1 * env) { // общий спазм
      for (let j = 0; j < LIMBS.length; j += 1) addVel(R, LIMBS[j], rnd(-1, 1) * a * tm[j], rnd(0.3, 1.3) * a * tm[j], rnd(-1, 1) * a * tm[j]);
      addVel(R, NK, 0, 0.5 * a, 0);
    } else {
      let tot = 0; for (let j = 0; j < tm.length; j += 1) tot += tm[j];
      const cnt = 1 + (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0);
      for (let c = 0; c < cnt; c += 1) {
        let x = Math.random() * tot, j = 0; while (j < tm.length - 1 && x > tm[j]) { x -= tm[j]; j += 1; }
        addVel(R, LIMBS[j], rnd(-1, 1) * a * 0.8, up * rnd(0.2, 1.5) * a, rnd(-1, 1) * a * 0.8);
      }
    }
    if (Math.random() < 0.55) { const t = a * 0.7; addVel(R, HD, rnd(-1, 1) * t, rnd(0, 0.8) * t * up, rnd(-1, 1) * t); addVel(R, NK, rnd(-1, 1) * t * 0.4, 0, rnd(-1, 1) * t * 0.4); }
    if (Math.random() < 0.5) { addVel(R, R.tside > 0 ? SR : SL, 0, a * 0.45 * rnd(0.3, 1), rnd(-1, 1) * a * 0.3); addVel(R, R.tside > 0 ? SL : SR, 0, -a * 0.15, 0); }
    if (Math.random() < 0.05 + 0.25 * env) addVel(R, P0, 0, a * 0.5, 0);
    if (k < 0.15 && !R.twLast && Math.random() < 0.12) { R.twLast = true; addVel(R, NK, 0, 0.8 * R.tamp, 0); addVel(R, LIMBS[(Math.random() * LIMBS.length) | 0], rnd(-1, 1), 1.2 * R.tamp, rnd(-1, 1)); } // последний вздох
  }
  function randTwitch(R) {
    const u = Math.random(), amp = (R.mode === 'head' ? 0.75 : R.mode === 'takedown' ? 0.5 : R.mode === 'blast' ? 0.7 : 1) * rnd(0.6, 1.3);
    startTwitch(R, (u < 0.25 ? rnd(0.8, 1.4) : u < 0.75 ? rnd(1.8, 3.0) : rnd(3.2, 4.6)) * (R.mode === 'head' ? 0.8 : 1), amp, false);
  }

  // ------------------------------------------------------------------ кровь
  // фонтан брызг вдоль заданного направления (траектория пули продолжается за телом); mist — густое облако (голова)
  Run.prototype.bloodSpray = function (pt, dir, count, speed, mist) {
    this.ensureBlood && this.ensureBlood();
    const B = this.bl; if (!B || !pt || !dir) return;
    let c = 0;
    for (let i = 0; i < B.parts.length && c < count; i += 1) {
      const p = B.parts[i]; if (p.life > 0) continue;
      const sp = speed * rnd(0.45, 1.15), sx = mist ? 0.45 : 0.28;
      p.m.visible = true; p.m.position.set(pt.x + dir.x * 0.12 + rnd(-0.03, 0.03), pt.y + dir.y * 0.12 + rnd(-0.03, 0.03), pt.z + dir.z * 0.12 + rnd(-0.03, 0.03));
      p.v.set(dir.x * sp + rnd(-sx, sx) * sp * 0.4, dir.y * sp + rnd(0.2, 1.2), dir.z * sp + rnd(-sx, sx) * sp * 0.4);
      p.life = rnd(0.5, 1.3); const sc = rnd(0.6, mist ? 1.5 : 2.0); p.m.scale.set(sc, sc * rnd(0.7, 1.2), sc);
      c += 1;
    }
  };
  // лужа под телом: у рэгдолла она появляется в момент касания пола и растёт 3 с (makePool); старый вариант — для трупов-декораций
  Run.prototype.bloodPool = function (n, head, instant) {
    const D = n.death;
    if (instant || !D || !D.rag) return pool0.call(this, n, head, instant);
    D.rag.head = !!head;
    for (let i = 0; i < 3; i += 1) this.decal(n.g.position.x + rnd(-0.8, 0.8), n.g.position.z + rnd(-0.8, 0.8), rnd(0.05, 0.12));
  };

  function convulse(n, dur, amp, electro) { // внешний вызов (шок, судороги): запускает серию на лежащем теле
    const D = n && n.death, R = D && D.rag; if (!R || R.pre || D.done) return false;
    startTwitch(R, dur || rnd(2, 4), amp || 1, electro); R.asleep = false; R.still = 0; return true;
  }
  C.ragdoll = { convulse, IDX: { P0, NK, HD, HL, HR, SL, SR, FR, EL, ER, WL, WR, KL, KR, AL, AR }, GROUPS: { UPPER, ARMS, LEGS, LIMBS }, addVel, start: ragStart, drive, capture };
}());
