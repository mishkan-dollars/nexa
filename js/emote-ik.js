// NEXA: жёсткие ограничения конечностей для эмоций — чистая математика на массивах [x, y, z] (без three.js).
// Один и тот же код работает в игре (js/emote.js) и в офлайн-конвейере tools/build-dance500.js: очищенные данные заведомо проходят ограничения движка.
//  • колено и локоть — ШАРНИР: угол сгиба всегда в [fMin, fMax], отрицательным он быть не может → назад вывернуться физически нельзя;
//  • плоскость сгиба (полюс) держится в анатомическом конусе вокруг «естественного» направления (колено — вперёд, локоть — назад-вниз-наружу);
//  • направление всей ноги из бедра зажато конусом (бедро не уходит назад дальше предела разгибания и не заходит за середину тела).
(function (root) {
  'use strict';
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = (a) => Math.sqrt(dot(a, a));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sstep = (v, a, b) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  function set3(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; }
  function norm(a, o) { const l = len(a) || 1; return set3(o, a[0] / l, a[1] / l, a[2] / l); }
  function cross(a, b, o) { return set3(o, a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]); }
  // составляющая v, перпендикулярная единичной оси t (не нормирована); возвращает её длину
  function perp(v, t, o) { const k = dot(v, t); set3(o, v[0] - t[0] * k, v[1] - t[1] * k, v[2] - t[2] * k); return len(o); }
  const tmp = { a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0], d: [0, 0, 0] };
  const AX = [1, 0, 0], AY = [0, 1, 0];

  // «Естественные» направления сгиба в системе туловища (X — вбок, Y — вверх, Z — вперёд). side = +1, если «наружу» совпадает с +X (правая сторона), иначе −1.
  // Колено: в сагиттальной плоскости ноги, т.е. t × X — направление непрерывно, даже когда нога поднята выше горизонтали; чуть наружу (носки врозь).
  function legNat(t, X, side, o) { cross(t, X, o); return set3(o, o[0] + X[0] * 0.15 * side, o[1] + X[1] * 0.15 * side, o[2] + X[2] * 0.15 * side); }
  // Локоть: назад-вниз-наружу.
  function armNat(X, Y, Z, side, o) { return set3(o, -0.75 * Z[0] - 0.3 * Y[0] + 0.5 * side * X[0], -0.75 * Z[1] - 0.3 * Y[1] + 0.5 * side * X[1], -0.75 * Z[2] - 0.3 * Y[2] + 0.5 * side * X[2]); }

  // единичный вектор ⟂ t по направлению nat (если nat ∥ t — произвольный ⟂ t)
  function basePole(t, nat, o) {
    if (perp(nat, t, o) < 1e-4) cross(t, Math.abs(t[1]) < 0.9 ? AY : AX, o);
    return norm(o, o);
  }
  // Угол от естественного полюса до полюса из данных вокруг оси t (рад, −π…π) и «надёжность» данных rel (0..1):
  // у почти прямой конечности плоскость сгиба в данных шумит — тогда rel → 0 и берётся естественная.
  // o.cond — обусловленность опорного полюса (0..1): у руки, направленной вдоль «естественного» направления, он вырождается и угол начинает скакать при неподвижном локте.
  function poleAngle(t, pole, nat, o) {
    const pn = basePole(t, nat, tmp.a), pd = tmp.b, c = tmp.c, ld = perp(pole, t, pd);
    o.cond = perp(nat, t, c) / (len(nat) || 1);
    o.rel = sstep(ld, 0.012, 0.05);
    if (ld < 1e-6) { o.ang = 0; o.rel = 0; return o; }
    norm(pd, pd);
    o.ang = Math.atan2(dot(t, cross(pn, pd, c)), dot(pn, pd));
    return o;
  }
  // Полюс = естественный, повёрнутый вокруг оси t на угол ang (поворот pn вокруг t: pn·cos + (t × pn)·sin)
  function poleAt(t, nat, ang, out) {
    const pn = basePole(t, nat, tmp.a), c = cross(t, pn, tmp.c), co = Math.cos(ang), si = Math.sin(ang);
    return set3(out, pn[0] * co + c[0] * si, pn[1] * co + c[1] * si, pn[2] * co + c[2] * si);
  }
  const pa = { ang: 0, rel: 0, cond: 1 };
  // Полюс из данных, зажатый в конус ±lim вокруг естественного и умноженный на доверие conf·rel.
  // fadeHi > 0 — конус ослабляется там, где опорный полюс вырождается (cond < fadeHi): угол в таких местах не несёт смысла, а зажим давал бы скачок.
  function clampPole(t, pole, nat, lim, conf, out, fadeLo, fadeHi) {
    poleAngle(t, pole, nat, pa);
    poleAt(t, nat, clamp(pa.ang, -lim, lim) * conf * pa.rel, out);
    if (fadeHi > 0) {
      const b = sstep(pa.cond, fadeLo, fadeHi);
      if (b < 1) {
        const d = poleAt(t, nat, pa.ang * pa.rel, tmp.d);
        norm(set3(out, d[0] * (1 - b) + out[0] * b, d[1] * (1 - b) + out[1] * b, d[2] * (1 - b) + out[2] * b), out);
      }
    }
    return out;
  }

  // Направление конечности из сустава в локальной системе (X — вбок, Y — вверх, Z — вперёд): назад не дальше zMin, наружу не дальше outMax, внутрь не дальше inMax.
  // Возвращает true, если пришлось зажимать.
  function limitDir(t, X, Y, Z, side, zMin, outMax, inMax, out) {
    let x = dot(t, X) * side, y = dot(t, Y), z = dot(t, Z);
    const x0 = x, z0 = z;
    x = clamp(x, -inMax, outMax); z = Math.max(z, zMin);
    if (x === x0 && z === z0) { set3(out, t[0], t[1], t[2]); return false; }
    let r2 = x * x + z * z;
    if (r2 > 0.9999) { const k = Math.sqrt(0.9999 / r2); x *= k; z *= k; r2 = 0.9999; }
    y = (y < 0 ? -1 : 1) * Math.sqrt(1 - r2); x *= side;
    set3(out, X[0] * x + Y[0] * y + Z[0] * z, X[1] * x + Y[1] * y + Z[1] * z, X[2] * x + Y[2] * y + Z[2] * z);
    return true;
  }

  // Двухзвенный шарнирный IK. S — плечо/бедро, T — цель кисти/стопы, pole — куда торчит локоть/колено (любой вектор, проецируется ⟂ S→T).
  // Сгиб ограничен [fMin, fMax] через допустимую дальность цели (при «слишком прямой/слишком сложенной» конечности цель сдвигается вдоль луча, а не ломается сустав).
  // o: E — локоть/колено, T — достигнутая цель, u — верхнее звено (ед.), f — нижнее звено (ед.), w — куда нижнее звено уходит от оси верхнего (ед.), flex — угол сгиба (рад)
  function solve(S, T, L1, L2, pole, fMin, fMax, o) {
    const t = o.t || (o.t = [0, 0, 0]), p = o.p || (o.p = [0, 0, 0]), E = o.E || (o.E = [0, 0, 0]), Tc = o.T || (o.T = [0, 0, 0]);
    const u = o.u || (o.u = [0, 0, 0]), f = o.f || (o.f = [0, 0, 0]), w = o.w || (o.w = [0, 0, 0]);
    set3(t, T[0] - S[0], T[1] - S[1], T[2] - S[2]);
    let d = len(t);
    if (d < 1e-6) { set3(t, 0, -1, 0); d = 1e-6; } else { t[0] /= d; t[1] /= d; t[2] /= d; }
    const base = L1 * L1 + L2 * L2, k2 = 2 * L1 * L2;
    d = clamp(d, Math.sqrt(base + k2 * Math.cos(fMax)), Math.sqrt(base + k2 * Math.cos(fMin)));   // d² = L1² + L2² + 2·L1·L2·cos(сгиб)
    if (perp(pole, t, p) < 1e-6) cross(t, Math.abs(t[1]) < 0.9 ? AY : AX, p);
    norm(p, p);
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    set3(E, S[0] + t[0] * a + p[0] * h, S[1] + t[1] * a + p[1] * h, S[2] + t[2] * a + p[2] * h);
    set3(Tc, S[0] + t[0] * d, S[1] + t[1] * d, S[2] + t[2] * d);
    set3(u, (E[0] - S[0]) / L1, (E[1] - S[1]) / L1, (E[2] - S[2]) / L1);
    set3(f, (Tc[0] - E[0]) / L2, (Tc[1] - E[1]) / L2, (Tc[2] - E[2]) / L2);
    o.flex = Math.PI - Math.acos(clamp((base - d * d) / k2, -1, 1));
    if (perp(f, u, w) < 1e-6) set3(w, -p[0], -p[1], -p[2]); else norm(w, w);
    return o;
  }

  // Базис туловища: ось X задана, «верх» — приблизительный; Z = X × up, Y = Z × X (как в движке при построении кватерниона).
  function basis(x, up, B) {
    cross(x, up, B.Z);
    if (len(B.Z) < 1e-8) set3(B.Z, 0, 0, 1); else norm(B.Z, B.Z);
    cross(B.Z, x, B.Y); set3(B.X, x[0], x[1], x[2]);
    return B;
  }

  const api = { solve, poleAngle, poleAt, clampPole, legNat, armNat, limitDir, basis, dot, cross, norm, perp, clamp, sstep,
    // Пределы суставов, рад. Сгиб колена 3.4°…140°, локтя 3.4°…155°. Конус плоскости сгиба вокруг естественной: колено ±40°, локоть ±115° (в данных танца — не больше ±102°).
    // Бедро (sin угла от вертикали в системе таза, таз наклоняется): назад не дальше hipBack, наружу hipOut, внутрь hipIn — стойка на одной ноге с «провисшим» тазом даёт аддукцию до 55°.
    // fade — пороги обусловленности (cond), между которыми конус локтя ослабевает у руки, направленной вдоль «естественного» направления (там угол плоскости сгиба не несёт смысла).
    LIM: { knee: [0.06, 2.45], elbow: [0.06, 2.7], kneePole: 0.7, elbowPole: 2.0, hipBack: -0.6, hipOut: 0.85, hipIn: 0.9, fade: [0.2, 0.45] } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EmoteIK = api;
}(typeof window !== 'undefined' ? window : globalThis));
