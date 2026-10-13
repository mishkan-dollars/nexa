// NEXA: пространственный звук (Web Audio). Точечные звуки (чужие выстрелы, взрывы, бытовые шумы комнат, гул ПК) идут через PannerNode:
// HRTF-панорама, затухание по расстоянию (audio_ref_distance / audio_max_distance / audio_rolloff_factor из assets/fpp-config.json),
// конус (audio_inner_cone_angle — у направленных источников вроде динамика ПК) и окклюзия: стены между источником и слушателем
// срезают верха (ФНЧ) и громкость; стекло глушит слабее, закрытая дверь — сильнее стекла. Слушатель — камера игрока: позиция и направление
// обновляются каждый кадр (Run.render). Подключается из sound.js (makeSound → Spatial.attach).
// Громкие звуки (выстрелы, взрывы) используют audio_ref_distance × audio_loud_ref_scale: иначе при rolloff 1.5 перестрелка за 10 м почти не слышна.
(function () {
  'use strict';
  const hyp = Math.hypot, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cfg = () => (window.FPP && window.FPP.cfg) || {};
  const num = (k, d) => { const v = cfg()[k]; return typeof v === 'number' && isFinite(v) ? v : d; };

  // ослабление за препятствиями: индекс — «число стен» (между значениями — геометрическая интерполяция)
  const CUT = [20000, 1500, 650, 380, 260], GAIN = [1, 0.6, 0.4, 0.3, 0.24];
  const curve = (tab, w) => {
    w = clamp(w, 0, tab.length - 1);
    const i = Math.min(tab.length - 2, Math.floor(w)), f = w - i;
    return tab[i] * Math.pow(tab[i + 1] / tab[i], f);
  };

  // «стены» между точками (в плоскости XZ): высокие коллайдеры и стекло. Низкие укрытия звук не глушат. Источник/слушатель внутри объёма — объём пропускаем
  function occlusion(cols, sx, sz, lx, lz) {
    const dx = lx - sx, dz = lz - sz;
    if (!cols || dx * dx + dz * dz < 0.01) return 0;
    let w = 0;
    for (let i = 0; i < cols.length; i += 1) {
      const c = cols[i];
      if (c.off) continue;
      if (!c.glass && !(c.y1 - c.y0 >= 1.9 && c.y0 < 0.7)) continue;
      if ((sx > c.x0 && sx < c.x1 && sz > c.z0 && sz < c.z1) || (lx > c.x0 && lx < c.x1 && lz > c.z0 && lz < c.z1)) continue;
      let t0 = 0, t1 = 1;
      if (dx !== 0) { let a = (c.x0 - sx) / dx, b = (c.x1 - sx) / dx; if (a > b) { const q = a; a = b; b = q; } if (a > t0) t0 = a; if (b < t1) t1 = b; } else if (sx < c.x0 || sx > c.x1) continue;
      if (dz !== 0) { let a = (c.z0 - sz) / dz, b = (c.z1 - sz) / dz; if (a > b) { const q = a; a = b; b = q; } if (a > t0) t0 = a; if (b < t1) t1 = b; } else if (sz < c.z0 || sz > c.z1) continue;
      if (t0 < t1) w += c.glass ? 0.35 : c.door ? 0.8 : 1;
    }
    return w;
  }

  function attach(ctx, dest, run) {
    const L = ctx.listener, hasP = L && L.positionX !== undefined;
    const S = { ctx, run, x: 0, y: 1.6, z: 0, fx: 0, fz: -1, voices: 0, live: new Set(), acc: 0, on: true };

    S.listen = function (cam) {
      if (!cam || !L) return;
      cam.updateMatrixWorld();
      const e = cam.matrixWorld.elements, fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
      S.x = e[12]; S.y = e[13]; S.z = e[14]; S.fx = fx; S.fz = fz;
      if (hasP) {
        L.positionX.value = S.x; L.positionY.value = S.y; L.positionZ.value = S.z;
        L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz; L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz;
      } else { L.setPosition(S.x, S.y, S.z); L.setOrientation(fx, fy, fz, ux, uy, uz); }
    };

    S.dist = (at) => { const p = pos(at); return hyp(p[0] - S.x, p[1] - S.y, p[2] - S.z); };
    function pos(at) { return at.length > 2 ? [at[0], at[1], at[2]] : [at[0], 1.3, at[1]]; }

    // opts: loud — выстрелы/взрывы (дальняя опорная дистанция); dest — куда выводить (по умолчанию master); orient [x,y,z] — направление динамика (конус);
    // persist — долгоживущий источник (окклюзия пересчитывается сама, v.move(at) переносит). Возвращает голос {in, free(sec), move(at), stop()} или null (источник слишком далеко)
    S.voice = function (at, o) {
      o = o || {};
      const p = pos(at), loud = !!o.loud, sc = loud ? num('audio_loud_ref_scale', 8) : 1;
      const ref = num('audio_ref_distance', 1) * sc, max = num('audio_max_distance', 25) * sc;
      const d0 = hyp(p[0] - S.x, p[1] - S.y, p[2] - S.z);
      if (d0 > max * 1.15) return null;
      const inp = ctx.createGain(), lp = ctx.createBiquadFilter(), og = ctx.createGain(), pn = ctx.createPanner();
      lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = 20000;
      pn.panningModel = S.voices < num('audio_hrtf_voices', 8) ? 'HRTF' : 'equalpower';
      pn.distanceModel = 'inverse'; pn.refDistance = ref; pn.maxDistance = max; pn.rolloffFactor = num('audio_rolloff_factor', 1.5);
      pn.coneInnerAngle = clamp(num('audio_inner_cone_angle', 180), 0, 360); pn.coneOuterAngle = 360; pn.coneOuterGain = o.orient ? 0.35 : 1;
      const v = { in: inp, pn, lp, og, p, max, ref, wall: 0, dead: false, persist: !!o.persist, t: 0 };
      setPos(v, p);
      if (o.orient) {
        const q = o.orient;
        if (pn.orientationX !== undefined) { pn.orientationX.value = q[0]; pn.orientationY.value = q[1]; pn.orientationZ.value = q[2]; } else pn.setOrientation(q[0], q[1], q[2]);
      }
      inp.connect(lp); lp.connect(og); og.connect(pn); pn.connect(o.dest || dest);
      update(v, true);
      S.voices += 1; S.live.add(v);
      v.free = (sec) => { if (v.dead) return; setTimeout(() => kill(v), Math.max(50, (sec || 0) * 1000)); };
      v.stop = () => kill(v);
      v.move = (a) => { v.p = pos(a); setPos(v, v.p); update(v, false); };
      return v;
    };
    function setPos(v, p) {
      const pn = v.pn;
      if (pn.positionX !== undefined) { pn.positionX.value = p[0]; pn.positionY.value = p[1]; pn.positionZ.value = p[2]; } else pn.setPosition(p[0], p[1], p[2]);
    }
    function kill(v) {
      if (v.dead) return; v.dead = true; S.voices -= 1; S.live.delete(v);
      try { v.in.disconnect(); v.lp.disconnect(); v.og.disconnect(); v.pn.disconnect(); } catch (e) { /* уже отключён */ }
    }
    // окклюзия + плавное затухание за maxDistance
    function update(v, now) {
      let w = 0;
      if (cfg().audio_occlusion !== false && S.run && S.run.colliders) w = occlusion(S.run.colliders, v.p[0], v.p[2], S.x, S.z);
      v.wall = w;
      const d = hyp(v.p[0] - S.x, v.p[1] - S.y, v.p[2] - S.z), fade = d <= v.max ? 1 : clamp(1 - (d - v.max) / (v.max * 0.15), 0, 1);
      const cut = curve(CUT, w), g = curve(GAIN, w) * fade, t = ctx.currentTime;
      if (now) { v.lp.frequency.value = cut; v.og.gain.value = g; } else { v.lp.frequency.setTargetAtTime(cut, t, 0.06); v.og.gain.setTargetAtTime(g, t, 0.06); }
    }
    // пересчёт окклюзии у долгоживущих источников (вызывается каждый кадр)
    S.tick = function (dt) {
      S.acc += dt; if (S.acc < 0.12) return; S.acc = 0;
      S.live.forEach((v) => { if (v.persist) update(v, false); });
    };
    S.occlusion = (a) => { const p = pos(a); return occlusion(S.run && S.run.colliders, p[0], p[2], S.x, S.z); };
    S.dispose = () => { Array.from(S.live).forEach(kill); };
    return S;
  }

  window.Spatial = { attach, occlusion, CUT, GAIN };

  // слушатель = камера: обновляется перед каждым кадром (катсцены, камера-режиссёр и режим «за монитором» тоже учтены)
  const C = window.Missions && window.Missions._core;
  if (C && C.Run) {
    const P = C.Run.prototype, render0 = P.render;
    P.render = function () {
      const sp = this.snd && this.snd.spatial;
      if (sp && this.camera) {
        try { const n = performance.now(); sp.listen(this.camera); sp.tick(Math.min(0.1, (n - (sp.tm || n)) / 1000)); sp.tm = n; } catch (e) { /* звук не должен ломать кадр */ }
      }
      return render0.apply(this, arguments);
    };
  }
}());
