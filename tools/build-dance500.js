'use strict';
// NEXA: конвейер танцев-эмоций. Сырой захват (поза из видео, 30 к/с) → assets/*.json (РОВНО 500 кадров на танец):
//   beat   «BEAT DROP»          tools/emote-data-src.js     (448 кадров)                 → assets/dance_500.json    (один раз, без цикла)
//   dance2 «СМОТРИ КАК МОГУ»    tools/emote-src-dance2.js   (278 кадров, ЦИКЛ 16 долей) → assets/dance2_500.json   ("loop": true)
//   dance3 «ДАВАЙ, ПОДХОДИ!»    tools/emote-src-dance3.js   (295 кадров, ЦИКЛ 16 долей) → assets/dance3_500.json   ("loop": true)
//   node tools/build-dance500.js                — собрать, записать и проверить ВСЕ танцы
//   node tools/build-dance500.js dance2 dance3  — только перечисленные
//   node tools/build-dance500.js --check [...]  — только проверить уже собранные файлы
// Для зацикленных танцев (loop: true) сырые данные — один период: кадр i ↔ время i·duration/кадров, после последнего кадра идёт снова нулевой.
// Поэтому передискретизация, сглаживание СГ и сглаживание плоскостей сгиба идут по кругу (индексы по модулю), а проверка дополнительно смотрит на шов (кадр 499 → 0).
// Этапы:
//  1. кубическая передискретизация на сетку из 500 кадров (Catmull-Rom как кубический Безье через Math.lerp — тот же код, что в движке);
//  2. сглаживание Савицкого–Голея (7 точек, 3-й порядок) надёжных суставов: шум уходит, пики шагов и ударов остаются;
//  3. анатомия через js/emote-ik.js (тот самый модуль, что работает в игре):
//     • колени: плоскость сгиба из видео ненадёжна (неоднозначность глубины, ~34% кадров вывернуты назад) — берётся непрерывное «естественное» направление
//       + сглаженная и зажатая в конус поправка из данных, затем шарнирный IK;
//     • локти: направление сгиба в данных надёжно — локоть сглажен, затем шарнирный IK (длины звеньев, предел сгиба);
//     • направление ноги из бедра зажато конусом.
// Кадры лежат в метрах: 15 суставов × XYZ, лицо к +Z, Y вверх, начало под тазом. Время кадра i = i · duration / 500 (≈33.5 ключевых кадра в секунду на 14.93 с трека).
const fs = require('fs'), vm = require('vm'), path = require('path');
const IK = require('../js/emote-ik.js');
const ROOT = path.resolve(__dirname, '..');
const JOBS = {
  beat: { src: 'emote-data-src.js', out: 'dance_500.json', name: 'BEAT DROP', loop: false },
  dance2: { src: 'emote-src-dance2.js', out: 'dance2_500.json', name: 'LOOK WHAT I CAN DO', loop: true, softElbow: true },
  dance3: { src: 'emote-src-dance3.js', out: 'dance3_500.json', name: 'COME ON, STEP UP!', loop: true, softElbow: true }
};
const srcPath = (job) => path.join(ROOT, 'tools', job.src), outPath = (job) => path.join(ROOT, 'assets', job.out);
const NF = 500, RENDER_FPS = 60;
const JOINTS = ['PEL', 'NECK', 'HEAD', 'SL', 'SR', 'EL', 'ER', 'HL', 'HR', 'PL', 'PR', 'KL', 'KR', 'AL', 'AR'];
const [PEL, NECK, HEAD, SL, SR, EL, ER, HL, HR, PL, PR, KL, KR, AL, AR] = JOINTS.map((_, i) => i);
const PARAMS = { kneeSigma: 4, kneeConf: 0.65, fade: IK.LIM.fade, softFrom: 2.2, softMax: 2.66 };   // σ — в кадрах 500-кадровой сетки (≈30 мс), conf — доверие данным о направлении сгиба колена

if (typeof Math.lerp !== 'function') Math.lerp = function (a, b, t) { return a + (b - a) * t; };
const lerp = Math.lerp;
// Catmull-Rom как кубический Безье: c1 = p1 + (p2 − p0)/6, c2 = p2 − (p3 − p1)/6, схема де Кастельжо через lerp (идентично js/emote.js)
function cr(p0, p1, p2, p3, u) {
  const c1 = p1 + (p2 - p0) / 6, c2 = p2 - (p3 - p1) / 6;
  const a = lerp(p1, c1, u), b = lerp(c1, c2, u), c = lerp(c2, p2, u);
  return lerp(lerp(a, b, u), lerp(b, c, u), u);
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const deg = (r) => r * 180 / Math.PI;
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const sd = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length); };

function loadSource(job) {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(srcPath(job), 'utf8'), ctx);
  const ED = ctx.window.EmoteData, n = ED.frames, buf = Buffer.from(ED.dance, 'base64'), D = new Float64Array(n * 45);
  if (buf.length !== n * 45 * 2) throw new Error('source: unexpected size');
  if (!!ED.loop !== !!job.loop) throw new Error('source: loop flag differs from the job table');
  for (let i = 0; i < n * 45; i += 1) D[i] = buf.readInt16LE(i * 2) / 1000;
  // петля: n кадров = один период длиной duration (кадр i ↔ i·duration/n); иначе длительность = n / fps
  return { D, n, fps: ED.loop ? n / ED.duration : ED.fps, dur: ED.loop ? ED.duration : n / ED.fps, loop: !!ED.loop, env: Array.from(Buffer.from(ED.env, 'base64')) };
}

// кадр i новой сетки ↔ время i·dur/NF ↔ индекс исходника i·n/NF; у петли соседи берутся по кругу
function resample(S, nOut) {
  const out = new Float64Array(nOut * 45), k = S.n / nOut, n = S.n;
  const ix = S.loop ? (f) => ((f % n) + n) % n : (f) => clamp(f, 0, n - 1);
  for (let i = 0; i < nOut; i += 1) {
    const f = S.loop ? i * k : Math.min(n - 1, i * k), i1 = Math.floor(f), u = f - i1;
    const i0 = ix(i1 - 1), j1 = ix(i1), i2 = ix(i1 + 1), i3 = ix(i1 + 2);
    for (let q = 0; q < 45; q += 1) out[i * 45 + q] = cr(S.D[i0 * 45 + q], S.D[j1 * 45 + q], S.D[i2 * 45 + q], S.D[i3 * 45 + q], u);
  }
  return out;
}

// Савицкий–Голей, окно 7, полином 3-й степени: [−2 3 6 7 6 3 −2]/21; на краях нечётное отражение (сохраняет наклон), у петли — индексы по кругу
function sgSmooth(a, n, joints, loop) {
  const W = [-2, 3, 6, 7, 6, 3, -2].map((v) => v / 21), src = a.slice();
  for (const j of joints) for (let k = 0; k < 3; k += 1) {
    const q = j * 3 + k;
    const at = loop ? (f) => src[(((f % n) + n) % n) * 45 + q]
      : (f) => (f < 0 ? 2 * src[q] - src[-f * 45 + q] : f > n - 1 ? 2 * src[(n - 1) * 45 + q] - src[(2 * (n - 1) - f) * 45 + q] : src[f * 45 + q]);
    for (let f = 0; f < n; f += 1) { let s = 0; for (let i = -3; i <= 3; i += 1) s += W[i + 3] * at(f + i); a[f * 45 + q] = s; }
  }
}

// Гауссово сглаживание угла плоскости сгиба с весами надёжности; возвращает {a, w}: угол и сглаженная надёжность (у петли — по кругу)
function smoothAngles(ang, rel, sigma, loop) {
  const n = ang.length, r = Math.ceil(sigma * 3), g = [];
  for (let i = -r; i <= r; i += 1) g.push(Math.exp(-i * i / (2 * sigma * sigma)));
  const a = new Float64Array(n), w = new Float64Array(n);
  for (let f = 0; f < n; f += 1) {
    let num = 0, den = 0, gs = 0;
    for (let i = -r; i <= r; i += 1) { const x = loop ? (((f + i) % n) + n) % n : clamp(f + i, 0, n - 1), q = g[i + r] * rel[x]; num += q * ang[x]; den += q; gs += g[i + r]; }
    a[f] = den > 1e-9 ? num / den : 0; w[f] = den / gs;
  }
  return { a, w };
}

const UP = [0, 1, 0];
const gj = (D, f, j) => [D[f * 45 + j * 3], D[f * 45 + j * 3 + 1], D[f * 45 + j * 3 + 2]];
function bases(D, f, Bp, Bc) {
  const X1 = IK.norm(sub(gj(D, f, PR), gj(D, f, PL)), [0, 0, 0]), dirS = IK.norm(sub(gj(D, f, NECK), gj(D, f, PEL)), [0, 0, 0]);
  const upP = IK.norm([dirS[0] * 0.45 + UP[0] * 0.55, dirS[1] * 0.45 + UP[1] * 0.55, dirS[2] * 0.45 + UP[2] * 0.55], [0, 0, 0]);
  IK.basis(X1, upP, Bp);
  IK.basis(IK.norm(sub(gj(D, f, SR), gj(D, f, SL)), [0, 0, 0]), dirS, Bc);
}
const mkB = () => ({ X: [0, 0, 0], Y: [0, 0, 0], Z: [0, 0, 0] });

// Мягкий предел сгиба локтей ДО шарнирного IK (только танцы с job.softElbow). Рука иногда «складывается» до плеча: кисть в 4–9 см от сустава, сгиб 165–177°, а предел локтя 154.7°.
// Жёсткий зажим досягаемости там плохо обусловлен: ось плечо→кисть почти нулевой длины, её направление шумит, и локоть после пересчёта «прыгает» на 0.2–0.3 м.
// Поэтому угол между плечом и предплечьем плавно (tanh) сжимается к пределу: направление плеча (локоть) не трогается, предплечье поворачивается в своей плоскости сгиба.
// Плоскость сгиба задаёт единичный вектор w (перпендикуляр к плечу в сторону предплечья). У почти сложенной руки (sin φ → 0) он шумит и за 2–3 кадра может развернуться на 150–180°
// (кисть пролетает мимо плеча), а усреднять единичные векторы через такой разворот нельзя. Поэтому w записывается ЧИСЛОМ — углом θ вокруг оси плеча в базисе, который переносится
// параллельно от кадра к кадру. Угол разворачивается (unwrap) по надёжным кадрам (sin φ > SIN_OK), в ненадёжных линейно интерполируется, затем гауссово сглаживается; в сжимаемых кадрах
// θ подмешивается плавно (β растёт от 0 за RAMP кадров до сжатой серии), так что скачка на пороге нет. Результат: кисть плавно обходит плечо по конусу вокруг оси предплечья.
const SIN_OK = 0.12, RAMP = 6;
function softFlex(D, n, F0, FM, loop) {
  let hit = 0, worst = 0;
  const R = 7, SIG = 2.5, G = []; for (let i = -R; i <= R; i += 1) G.push(Math.exp(-i * i / (2 * SIG * SIG)));
  const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }, TAU = 2 * Math.PI;
  const orth = (a, u) => { const d = IK.dot(a, u); return IK.norm([a[0] - d * u[0], a[1] - d * u[1], a[2] - d * u[2]], [0, 0, 0]); };
  for (const [S, E, T] of [[SL, EL, HL], [SR, ER, HR]]) {
    const U = [], Wv = [], PH = [], L2 = [], Ep = [];
    for (let f = 0; f < n; f += 1) {
      const s = gj(D, f, S), e = gj(D, f, E), t = gj(D, f, T), u = IK.norm(sub(e, s), [0, 0, 0]), dv = sub(t, e), l2 = len3(dv), v = dv.map((x) => x / l2);
      const c = clamp(IK.dot(u, v), -1, 1);
      U.push(u); Wv.push([v[0] - c * u[0], v[1] - c * u[1], v[2] - c * u[2]]); PH.push(Math.acos(c)); L2.push(l2); Ep.push(e);
    }
    let st = 0; for (let f = 1; f < n; f += 1) if (PH[f] < PH[st]) st = f;           // у петли ряд начинается с самого разогнутого кадра (он точно вне сжимаемых серий)
    const fr = (k) => (loop ? (st + k) % n : k);
    if (!PH.some((p) => p > F0)) continue;
    const E1 = [], E2 = [], TH = new Float64Array(n), ok = new Uint8Array(n); let e1 = null, prev = 0, cum = 0, have = false;
    for (let k = 0; k < n; k += 1) {
      const f = fr(k), u = U[f];
      if (e1 === null) { const a = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; e1 = orth(a, u); } else e1 = orth(e1, u);          // параллельный перенос базиса ⟂ плечу
      const e2 = IK.cross(u, e1, [0, 0, 0]); E1.push(e1); E2.push(e2);
      if (Math.sin(PH[f]) > SIN_OK) {
        const w = Wv[f], th = Math.atan2(IK.dot(w, e2), IK.dot(w, e1));
        if (!have) { cum = th; have = true; } else { let d = th - prev; d -= TAU * Math.round(d / TAU); cum += d; }
        prev = th; TH[k] = cum; ok[k] = 1;
      }
    }
    for (let k = 0; k < n; k += 1) {                                                    // ненадёжные кадры: линейная интерполяция угла между надёжными соседями
      if (ok[k]) continue;
      let a = k - 1, b = k + 1; while (a >= 0 && !ok[a]) a -= 1; while (b < n && !ok[b]) b += 1;
      TH[k] = a >= 0 && b < n ? TH[a] + (TH[b] - TH[a]) * (k - a) / (b - a) : a >= 0 ? TH[a] : b < n ? TH[b] : 0;
    }
    const TS = new Float64Array(n);
    for (let k = 0; k < n; k += 1) { let num = 0, den = 0; for (let i = -R; i <= R; i += 1) { const x = clamp(k + i, 0, n - 1); num += G[i + R] * TH[x]; den += G[i + R]; } TS[k] = num / den; }
    const dist = new Float64Array(n);                                                   // расстояние (в кадрах) до ближайшего сжимаемого кадра
    for (let k = 0; k < n; k += 1) dist[k] = PH[fr(k)] > F0 ? 0 : 1e9;
    for (let k = 1; k < n; k += 1) dist[k] = Math.min(dist[k], dist[k - 1] + 1);
    for (let k = n - 2; k >= 0; k -= 1) dist[k] = Math.min(dist[k], dist[k + 1] + 1);
    for (let k = 0; k < n; k += 1) {
      const f = fr(k); if (dist[k] >= RAMP) continue;
      const beta = sm(1 - dist[k] / RAMP), th = TH[k] + beta * (TS[k] - TH[k]);          // сглаженный угол плавно входит и выходит за RAMP кадров до/после сжатой серии
      const ct = Math.cos(th), stt = Math.sin(th), u = U[f], p2 = PH[f] > F0 ? F0 + (FM - F0) * Math.tanh((PH[f] - F0) / (FM - F0)) : PH[f];
      if (PH[f] > F0) { hit += 1; worst = Math.max(worst, PH[f]); }
      for (let q = 0; q < 3; q += 1) { const w = E1[k][q] * ct + E2[k][q] * stt; D[f * 45 + T * 3 + q] = Ep[f][q] + (u[q] * Math.cos(p2) + w * Math.sin(p2)) * L2[f]; }
    }
  }
  return { hit, worst };
}

// Основная чистка: пересчёт колен/локтей и зажим направления ног. Возвращает описание конечностей со статистикой.
function clean(D, n, loop) {
  const L = IK.LIM, Bp = mkB(), Bc = mkB(), pa = { ang: 0, rel: 0, cond: 1 }, F = PARAMS.fade;
  const lens = (s, e, t) => { const a = [], b = []; for (let f = 0; f < n; f += 1) { a.push(len3(sub(gj(D, f, e), gj(D, f, s)))); b.push(len3(sub(gj(D, f, t), gj(D, f, e)))); } return [median(a), median(b)]; };
  const limbs = [
    { name: 'legL', kind: 'leg', S: PL, E: KL, T: AL, side: -1, fl: L.knee, lim: L.kneePole, conf: PARAMS.kneeConf, sig: PARAMS.kneeSigma },
    { name: 'legR', kind: 'leg', S: PR, E: KR, T: AR, side: 1, fl: L.knee, lim: L.kneePole, conf: PARAMS.kneeConf, sig: PARAMS.kneeSigma },
    { name: 'armL', kind: 'arm', S: SL, E: EL, T: HL, side: -1, fl: L.elbow, lim: L.elbowPole },
    { name: 'armR', kind: 'arm', S: SR, E: ER, T: HR, side: 1, fl: L.elbow, lim: L.elbowPole }
  ];
  limbs.forEach((l) => {
    const m = lens(l.S, l.E, l.T); l.L1 = m[0]; l.L2 = m[1];
    Object.assign(l, { ang: new Float64Array(n), rel: new Float64Array(n), cond: new Float64Array(n), d: new Float64Array(n), tl: [], nat: [], raw: [], hipClamp: 0, coneClamp: 0 });
  });
  // проход 1: оси конечностей (бедро зажимается конусом) и угол плоскости сгиба из данных
  const nat = [0, 0, 0];
  for (let f = 0; f < n; f += 1) {
    bases(D, f, Bp, Bc);
    limbs.forEach((l) => {
      const S = gj(D, f, l.S), T0 = gj(D, f, l.T), E0 = gj(D, f, l.E), t0 = sub(T0, S), d0 = len3(t0), t = IK.norm(t0, [0, 0, 0]);
      let tt = t;
      if (l.kind === 'leg') {
        tt = [0, 0, 0];
        if (IK.limitDir(t, Bp.X, Bp.Y, Bp.Z, l.side, L.hipBack, L.hipOut, L.hipIn, tt)) l.hipClamp += 1;
        IK.legNat(tt, Bp.X, l.side, nat);
      } else IK.armNat(Bc.X, Bc.Y, Bc.Z, l.side, nat);
      IK.poleAngle(tt, sub(E0, S), nat, pa);
      l.ang[f] = clamp(pa.ang, -l.lim, l.lim); l.rel[f] = pa.rel; l.cond[f] = pa.cond; l.raw.push(pa.ang); l.d[f] = d0; l.tl.push(tt); l.nat.push(nat.slice());
    });
  }
  // проход 2: колени — сглаженная поправка плоскости сгиба; локти — сглаженные данные как есть (конус ослабляется там, где опорный полюс вырождается); затем шарнирный IK
  const o = {}, pole = [0, 0, 0];
  limbs.forEach((l) => {
    const sm = l.kind === 'leg' ? smoothAngles(l.ang, l.rel, l.sig, loop) : null; l.sm = [];
    for (let f = 0; f < n; f += 1) {
      const S = gj(D, f, l.S), tt = l.tl[f], T = [S[0] + tt[0] * l.d[f], S[1] + tt[1] * l.d[f], S[2] + tt[2] * l.d[f]];
      if (sm) { const a = clamp(sm.a[f] * sm.w[f] * l.conf, -l.lim, l.lim); l.sm.push(a); IK.poleAt(tt, l.nat[f], a, pole); }
      else {
        if (l.cond[f] > F[1] && Math.abs(l.raw[f]) > l.lim) l.coneClamp += 1;
        l.sm.push(l.raw[f]); IK.clampPole(tt, sub(gj(D, f, l.E), S), l.nat[f], l.lim, 1, pole, F[0], F[1]);
      }
      IK.solve(S, T, l.L1, l.L2, pole, l.fl[0], l.fl[1], o);
      for (let k = 0; k < 3; k += 1) { D[f * 45 + l.E * 3 + k] = o.E[k]; D[f * 45 + l.T * 3 + k] = o.T[k]; }
    }
  });
  return limbs;
}

// метрики «дрожания»: RMS третьей разности (мм) и RMS межкадрового скачка угла плоскости сгиба (°)
function jerk(D, n, j) { let s = 0, c = 0; for (let f = 3; f < n; f += 1) for (let k = 0; k < 3; k += 1) { const d3 = D[f * 45 + j * 3 + k] - 3 * D[(f - 1) * 45 + j * 3 + k] + 3 * D[(f - 2) * 45 + j * 3 + k] - D[(f - 3) * 45 + j * 3 + k]; s += d3 * d3; c += 1; } return Math.sqrt(s / c) * 1000; }
function poleSeries(D, n, kind, S, E, T, side) {
  const Bp = mkB(), Bc = mkB(), nat = [0, 0, 0], pa = { ang: 0, rel: 0, cond: 1 }, out = [];
  for (let f = 0; f < n; f += 1) {
    bases(D, f, Bp, Bc);
    const s = gj(D, f, S), t = IK.norm(sub(gj(D, f, T), s), [0, 0, 0]);
    if (kind === 'leg') IK.legNat(t, Bp.X, side, nat); else IK.armNat(Bc.X, Bc.Y, Bc.Z, side, nat);
    IK.poleAngle(t, sub(gj(D, f, E), s), nat, pa); out.push({ ang: pa.ang, cond: pa.cond });
  }
  return out;
}
const rmsDiff = (a) => { let s = 0; for (let i = 1; i < a.length; i += 1) { let d = a[i] - a[i - 1]; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; s += d * d; } return deg(Math.sqrt(s / (a.length - 1))); };
// ось шарнира u × v в системе таза/груди: у колена она смотрит в +X (голень уходит назад), у локтя — в −X; «неверный знак» = сгиб в обратную сторону
function hingeWrong(D, n, S, E, T, kind, minFlex) {
  const Bp = mkB(), Bc = mkB(); let bad = 0, tot = 0, worst = 1;
  for (let f = 0; f < n; f += 1) {
    bases(D, f, Bp, Bc);
    const s = gj(D, f, S), e = gj(D, f, E), u = IK.norm(sub(e, s), [0, 0, 0]), v = IK.norm(sub(gj(D, f, T), e), [0, 0, 0]), ax = IK.cross(u, v, [0, 0, 0]);
    if (len3(ax) < Math.sin(minFlex)) continue; tot += 1;
    const sg = IK.dot(IK.norm(ax, ax), (kind === 'leg' ? Bp : Bc).X) * (kind === 'leg' ? 1 : -1);
    worst = Math.min(worst, sg); if (sg < 0.05) bad += 1;
  }
  return { bad, tot, worst };
}

// удары стоп об пол — ровно тот же детектор, что в js/emote.js
function impacts(D, n, fps, loop) {
  const out = [], y = (f, j) => D[(loop ? ((f % n) + n) % n : f) * 45 + j * 3 + 1];
  for (let f = loop ? 0 : 2; f < (loop ? n : n - 1); f += 1) for (const j of [AL, AR]) {
    const v0 = (y(f - 1, j) - y(f - 2, j)) * fps, v1 = (y(f, j) - y(f - 1, j)) * fps;
    if (y(f, j) < 0.14 && v0 < -0.55 && v1 > -0.3) {
      const t = f / fps;
      if (out.length && t - out[out.length - 1].t < 0.12) { out[out.length - 1].s = Math.max(out[out.length - 1].s, clamp(-v0 / 1.1, 0.3, 1)); continue; }
      out.push({ t, s: clamp(-v0 / 1.1, 0.3, 1) });
    }
  }
  return out;
}

// ---- проверка собранного файла: структура и анатомия (то же, что движок получит при загрузке)
function verify(J, ref, job) {
  const errs = [];
  if (J.frames !== NF) errs.push('frames !== ' + NF);
  if (!Array.isArray(J.dance) || J.dance.length !== NF) errs.push('dance.length !== ' + NF);
  if (JSON.stringify(J.order) !== JSON.stringify(JOINTS)) errs.push('joint order mismatch');
  if (!Array.isArray(J.env) || J.env.length < 100) errs.push('env missing');
  if (!!J.loop !== !!job.loop) errs.push('loop flag is ' + !!J.loop + ', the job table says ' + !!job.loop);
  if (job.loop && Array.isArray(J.env) && J.env.length < Math.ceil(J.duration * 60)) errs.push('env is shorter than one loop');
  const D = new Float64Array(NF * 45);
  (J.dance || []).forEach((row, f) => { if (!Array.isArray(row) || row.length !== 45) errs.push('row ' + f + ' length'); else row.forEach((v, k) => { if (!Number.isFinite(v)) errs.push('row ' + f + ' NaN'); D[f * 45 + k] = v; }); });
  if (errs.length) return { errs };
  const fps = NF / J.duration, rep = [], bad = [];
  // длины костей
  const bone = (s, e) => { const a = []; for (let f = 0; f < NF; f += 1) a.push(len3(sub(gj(D, f, e), gj(D, f, s)))); return a; };
  let maxLenErr = 0;
  for (const [s, e] of [[SL, EL], [EL, HL], [SR, ER], [ER, HR], [PL, KL], [KL, AL], [PR, KR], [KR, AR]]) { const a = bone(s, e), m = median(a); a.forEach((v) => { maxLenErr = Math.max(maxLenErr, Math.abs(v - m)); }); }
  rep.push('bone length max deviation: ' + (maxLenErr * 1000).toFixed(2) + ' mm (limbs, includes 0.1 mm rounding)');
  if (maxLenErr > 0.001) bad.push('bone length deviates');
  // сгибы
  const flex = (S, E, T) => { const a = []; for (let f = 0; f < NF; f += 1) { const u = IK.norm(sub(gj(D, f, E), gj(D, f, S)), [0, 0, 0]), v = IK.norm(sub(gj(D, f, T), gj(D, f, E)), [0, 0, 0]); a.push(Math.acos(clamp(IK.dot(u, v), -1, 1))); } return a; };
  [['kneeL', PL, KL, AL, IK.LIM.knee], ['kneeR', PR, KR, AR, IK.LIM.knee], ['elbowL', SL, EL, HL, IK.LIM.elbow], ['elbowR', SR, ER, HR, IK.LIM.elbow]].forEach(([nm, s, e, t, lim]) => {
    const a = flex(s, e, t), mn = Math.min(...a), mx = Math.max(...a);
    rep.push('flex ' + nm + ': ' + deg(mn).toFixed(1) + '°…' + deg(mx).toFixed(1) + '° (limits ' + deg(lim[0]).toFixed(1) + '°…' + deg(lim[1]).toFixed(1) + '°)');
    if (mn < lim[0] - 0.003 || mx > lim[1] + 0.003) bad.push(nm + ' flex out of limits');
  });
  // шарнир: колено сгибается только назад (ось +X таза). Жёсткая проверка; для локтей — справочно (ось зависит от поворота плеча).
  const hk = [hingeWrong(D, NF, PL, KL, AL, 'leg', 0.1), hingeWrong(D, NF, PR, KR, AR, 'leg', 0.1)], he = [hingeWrong(D, NF, SL, EL, HL, 'arm', 0.1), hingeWrong(D, NF, SR, ER, HR, 'arm', 0.1)];
  rep.push('knee hinge axis wrong way: L ' + hk[0].bad + '/' + hk[0].tot + ' (worst cos ' + hk[0].worst.toFixed(2) + '), R ' + hk[1].bad + '/' + hk[1].tot + ' (worst cos ' + hk[1].worst.toFixed(2) + ')  [source data: ~160/500]');
  rep.push('elbow hinge axis (info): L ' + he[0].bad + '/' + he[0].tot + ' R ' + he[1].bad + '/' + he[1].tot);
  if (hk[0].bad || hk[1].bad) bad.push('knee hinge bends the wrong way');
  // плоскость сгиба: колено — в конусе; локоть — в конусе там, где опорный полюс хорошо обусловлен
  const ps = (nm, kind, S, E, T, side, lim) => {
    const a = poleSeries(D, NF, kind, S, E, T, side), cs = kind === 'leg' ? a : a.filter((x) => x.cond > PARAMS.fade[1]), mx = Math.max(...cs.map((x) => Math.abs(x.ang)));
    rep.push('pole ' + nm + ': |angle| max ' + deg(mx).toFixed(1) + '° (cone ±' + deg(lim).toFixed(0) + '°), sd ' + deg(sd(cs.map((x) => x.ang))).toFixed(1) + '°, frame-to-frame RMS ' + rmsDiff(a.map((x) => x.ang)).toFixed(2) + '°' + (kind === 'arm' ? ' (jumps near the reference singularity are not motion)' : ''));
    if (mx > lim + 0.02) bad.push(nm + ' pole outside cone');
  };
  ps('legL', 'leg', PL, KL, AL, -1, IK.LIM.kneePole); ps('legR', 'leg', PR, KR, AR, 1, IK.LIM.kneePole); ps('armL', 'arm', SL, EL, HL, -1, IK.LIM.elbowPole); ps('armR', 'arm', SR, ER, HR, 1, IK.LIM.elbowPole);
  // направление бедра: в пределах конуса
  const Bp = mkB(), Bc = mkB(); let hipOver = 0;
  for (let f = 0; f < NF; f += 1) {
    bases(D, f, Bp, Bc);
    for (const [S, T, side] of [[PL, AL, -1], [PR, AR, 1]]) { const s = gj(D, f, S), d = sub(gj(D, f, T), s), t = d.map((v) => v / len3(d)); const x = IK.dot(t, Bp.X) * side, z = IK.dot(t, Bp.Z); if (x > IK.LIM.hipOut + 1e-3 || x < -IK.LIM.hipIn - 1e-3 || z < IK.LIM.hipBack - 1e-3) hipOver += 1; }
  }
  rep.push('hip direction outside cone: ' + hipOver + ' leg-frames');
  if (hipOver) bad.push('hip cone violated');
  // дрожание
  rep.push('jerk RMS (mm) after: ' + JOINTS.map((nm, j) => nm + ' ' + jerk(D, NF, j).toFixed(1)).join(', '));
  const im = impacts(D, NF, fps, job.loop);
  rep.push('impacts: ' + im.length + (ref ? ' (source: ' + ref.length + ')' : '') + ' at t=' + im.map((i) => i.t.toFixed(2)).join(' '));
  // шов петли: шаг кадр 499 → 0 не должен отличаться от обычных шагов (иначе на повторе будет «рывок»)
  if (job.loop) {
    let worst = 0, wj = '', rootStep = 0;
    JOINTS.forEach((nm, j) => {
      const st = (f) => len3(sub(gj(D, (f + 1) % NF, j), gj(D, f, j))), steps = []; for (let f = 0; f < NF; f += 1) steps.push(st(f));
      const seam = steps[NF - 1], ref95 = steps.slice().sort((a, b) => a - b)[Math.floor(NF * 0.95)], ratio = seam / Math.max(ref95, 1e-4);
      if (j === PEL) rootStep = seam;
      if (ratio > worst) { worst = ratio; wj = nm; }
    });
    rep.push('loop seam (frame ' + (NF - 1) + ' → 0): worst step/p95 step ratio ' + worst.toFixed(2) + ' (' + wj + '), pelvis step ' + (rootStep * 1000).toFixed(1) + ' mm');
    if (worst > 1.6) bad.push('loop seam jumps (step ratio ' + worst.toFixed(2) + ' at ' + wj + ')');
  }
  return { errs: bad, rep, D, im };
}

function build(job) {
  const S = loadSource(job), dur = S.dur, OUT = outPath(job);
  const raw = resample(S, NF), D = raw.slice();
  console.log('[' + job.out + '] source: ' + S.n + ' frames @ ' + S.fps.toFixed(3) + ' fps, ' + dur.toFixed(4) + ' s' + (S.loop ? ' (one loop period)' : '') + '  →  ' + NF + ' frames (' + (NF / dur).toFixed(2) + ' keyframes/s), render ' + RENDER_FPS + ' Hz');
  console.log('jerk RMS (mm) raw on the 500-grid: ' + JOINTS.map((nm, j) => nm + ' ' + jerk(raw, NF, j).toFixed(1)).join(', '));
  // сглаживание: всё, кроме колен (они будут пересчитаны); локти сглаживаются здесь, их плоскость сгиба берётся из сглаженных данных
  sgSmooth(D, NF, [PEL, NECK, HEAD, SL, SR, EL, ER, HL, HR, PL, PR, AL, AR], S.loop);
  if (job.softElbow) { const sf = softFlex(D, NF, PARAMS.softFrom, PARAMS.softMax, S.loop); console.log('soft elbow limit: ' + sf.hit + ' arm-frames compressed, worst raw flex ' + deg(sf.worst).toFixed(0) + '°'); }
  const limbs = clean(D, NF, S.loop);
  limbs.forEach((l) => {
    const a = l.raw, b = l.sm;
    console.log(l.name + ': L1 ' + l.L1.toFixed(3) + ' L2 ' + l.L2.toFixed(3) + (l.kind === 'leg' ? ', hip cone clamps ' + l.hipClamp + ', raw pole angle sd ' + deg(sd(a)).toFixed(1) + '° f2f ' + rmsDiff(a).toFixed(1) + '° → cleaned sd ' + deg(sd(b)).toFixed(1) + '° f2f ' + rmsDiff(b).toFixed(2) + '°'
      : ', raw elbow plane kept (SG-smoothed), cone clamps (well-conditioned frames) ' + l.coneClamp + ', frames near reference singularity ' + Array.from(l.cond).filter((c) => c <= PARAMS.fade[1]).length));
  });
  const dev = JOINTS.map((nm, j) => { let s = 0, mx = 0; for (let f = 0; f < NF; f += 1) { const d = Math.hypot(D[f * 45 + j * 3] - raw[f * 45 + j * 3], D[f * 45 + j * 3 + 1] - raw[f * 45 + j * 3 + 1], D[f * 45 + j * 3 + 2] - raw[f * 45 + j * 3 + 2]); s += d * d; mx = Math.max(mx, d); } return nm + ' ' + (Math.sqrt(s / NF) * 1000).toFixed(0) + '/' + (mx * 1000).toFixed(0); });
  console.log('deviation cleaned vs source, RMS/max mm: ' + dev.join(', '));
  const ref = impacts(S.D, S.n, S.fps, S.loop);
  const R = new Float64Array(NF * 45); for (let i = 0; i < R.length; i += 1) R[i] = r4(D[i]);
  const rows = []; for (let f = 0; f < NF; f += 1) rows.push('[' + Array.from(R.subarray(f * 45, f * 45 + 45)).join(',') + ']');
  const json = '{\n"format":"nexa-dance","version":1,"name":' + JSON.stringify(job.name) + ',"frames":' + NF + ',"renderFps":' + RENDER_FPS + ',"duration":' + r4(dur) + ',"unit":"m",' + (S.loop ? '"loop":true,' : '') + '\n"order":' + JSON.stringify(JOINTS) +
    ',\n"envRate":60,"env":[' + S.env.join(',') + '],\n"dance":[\n' + rows.join(',\n') + '\n]\n}\n';
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  console.log('written ' + path.relative(ROOT, OUT) + ' (' + (json.length / 1024).toFixed(1) + ' KB)');
  return ref;
}

function main() {
  const args = process.argv.slice(2), names = args.filter((a) => !a.startsWith('--')), check = args.includes('--check');
  const todo = names.length ? names : Object.keys(JOBS);
  let fail = false;
  for (const nm of todo) {
    const job = JOBS[nm]; if (!job) { console.error('unknown job "' + nm + '" (known: ' + Object.keys(JOBS).join(', ') + ')'); process.exit(2); }
    console.log('\n=== ' + nm + ': ' + job.name + (job.loop ? ' (loop)' : ''));
    const ref = check ? null : build(job);
    const J = JSON.parse(fs.readFileSync(outPath(job), 'utf8')), v = verify(J, ref, job);
    if (v.rep) v.rep.forEach((s) => console.log(s));
    if (v.errs.length) { console.error('FAIL (' + nm + '):\n  ' + v.errs.join('\n  ')); fail = true; } else console.log('OK: ' + J.frames + ' frames' + (J.loop ? ', looped' : '') + ', constraints satisfied');
  }
  if (fail) process.exit(1);
}
if (require.main === module) main(); else module.exports = { loadSource, resample, sgSmooth, clean, softFlex, smoothAngles, bases, mkB, gj, sub, len3, jerk, impacts, hingeWrong, PARAMS, JOINTS, NF, JOBS };
