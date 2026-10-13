// NEXA: руки от первого лица — риггнутая модель assets/models/fps_hands_stickman.glb (37 костей, клипы Idle / Grip / Fist / Point / Punch_R / Open).
// Плечи, локти и запястья ставит тот же IK, что и раньше (combat.js: updateRig / toyArms), кисть берёт ориентацию оружия,
// а позы пальцев смешиваются из клипов (в каждый момент — свой вес на левую и правую руку).
// Если модель не загрузилась — молча остаются процедурные руки из models.js.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C) return;
  const PI = Math.PI, URL = 'assets/models/fps_hands_stickman.glb';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
  let bufP = null;
  function loadBuf() {
    if (!bufP) {
      bufP = (async () => {
        if (!THREE.GLTFLoader) await (window.__nexaGltf || (window.__nexaGltf = loadScript('assets/lib/GLTFLoader.js')));
        const r = await fetch(URL);
        if (!r.ok) throw new Error('hands ' + r.status);
        return r.arrayBuffer();
      })();
      bufP.catch(() => {});
    }
    return bufP;
  }
  const parse = (buf) => new Promise((res, rej) => new THREE.GLTFLoader().parse(buf.slice(0), '', res, rej)); // у каждой миссии свой экземпляр: сцена чистится вместе с геометрией

  // ориентация кисти относительно оружия (кисть в покое: пальцы к -Z, ладонь вниз; большой палец с внутренней стороны).
  // e — эйлер 'YXZ' (сначала крен вокруг оси пальцев), off — смещение запястья от точки хвата в системе оружия
  const CFG = {
    R: { e: [0, 0, -PI / 2], off: [0.03, -0.012, 0.085] },                  // хват рукоятки: большой палец вверх, ладонь смотрит влево
    Lgrip: { e: [0, 0, PI / 2], off: [-0.04, -0.03, 0.08] },                // поддержка пистолета слева
    Lcup: { e: [0, -PI / 2, PI], off: [-0.058, -0.045, 0.0] }                // снизу на цевьё: пальцы обходят его справа
  };
  const POSES = ['idle', 'grip', 'fist', 'point', 'open'];
  const FING = /(Index|Middle|Ring|Pinky|Thumb)\d\.quaternion$/;

  function make(gltf) {
    const root = gltf.scene, byName = {}, mesh = { m: null };
    root.traverse((o) => { byName[o.name] = o; if (o.isSkinnedMesh) mesh.m = o; });
    if (!mesh.m || !byName.R_UpperArm || !byName.L_UpperArm) throw new Error('hands: bad model');
    const sm = mesh.m;
    sm.frustumCulled = false; sm.renderOrder = 1008;
    sm.material = new THREE.MeshLambertMaterial({ color: 0x070707, emissive: 0x0d0d0d, fog: false, depthTest: false, depthWrite: false, transparent: true, skinning: true });
    const fh = {
      root, mesh: sm, mat: sm.material, mixer: new THREE.AnimationMixer(root), vis: [false, false],
      b: [0, 1].map((i) => { const p = i ? 'R_' : 'L_'; return { up: byName[p + 'UpperArm'], fo: byName[p + 'Forearm'], hd: byName[p + 'Hand'] }; }),
      act: [{}, {}], w: [{ idle: 1 }, { idle: 1 }], want: ['idle', 'idle'],
      q: [new THREE.Quaternion(), new THREE.Quaternion()], qU: new THREE.Quaternion(), qF: new THREE.Quaternion(), qI: new THREE.Quaternion(), qH: new THREE.Quaternion(),
      E: new THREE.Vector3(), W: new THREE.Vector3(), S2: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), m4: new THREE.Matrix4(), eu: new THREE.Euler(0, 0, 0, 'YXZ'), qr: new THREE.Quaternion(), v: new THREE.Vector3()
    };
    fh.len = fh.b.map((b) => [Math.abs(b.fo.position.z), Math.abs(b.hd.position.z)]);
    root.position.set(0, 0, 0); root.quaternion.identity();
    // клипы режутся на левую и правую руку и только по пальцам: плечо / предплечье / кисть двигает IK
    gltf.animations.forEach((clip) => {
      const nm = clip.name.toLowerCase();
      if (POSES.indexOf(nm) < 0) return;
      [0, 1].forEach((i) => {
        const p = i ? 'R_' : 'L_';
        const tr = clip.tracks.filter((t) => t.name.indexOf(p) === 0 && FING.test(t.name));
        if (!tr.length) return;
        const a = fh.mixer.clipAction(new THREE.AnimationClip(nm + p, clip.duration, tr));
        a.setEffectiveWeight(nm === 'idle' ? 1 : 0);
        if (nm === 'idle') a.setLoop(THREE.LoopRepeat); else { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
        a.play();
        if (nm !== 'idle') { a.time = clip.duration; a.paused = true; } // позы-клипы: берём их конечный кадр
        else a.time = i * 0.7;
        fh.act[i][nm] = a;
      });
    });
    root.visible = false;
    fh.mixer.update(0);
    return fh;
  }

  const P = {
    // pose: i — 0 левая / 1 правая; S — плечо, Wr — запястье (мир), pole — куда смотрит локоть, qh — мировая ориентация кисти (или null)
    pose(fh, i, S, Wr, pole, qh, k) {
      const b = fh.b[i], l = fh.len[i], E = fh.E, W = fh.W, m4 = fh.m4;
      W.copy(Wr);
      // жёсткая рука не тянется: если цель дальше, плечо (оно за краем кадра) сдвигается к ней, а кисть остаётся точно на оружии
      const reach = (l[0] + l[1]) * 0.94, d = S.distanceTo(W);
      if (d > reach) { S = fh.S2.copy(W).sub(S).multiplyScalar(reach / d).negate().add(W); }
      C.ik2(S, W, l[0], l[1], pole, E);
      const up = Math.abs(fh.up.y) > 0.99 ? fh.v.set(1, 0, 0) : fh.up;
      m4.lookAt(S, E, up); fh.qU.setFromRotationMatrix(m4);
      m4.lookAt(E, W, up); fh.qF.setFromRotationMatrix(m4);
      b.up.position.copy(S); b.up.quaternion.copy(fh.qU);
      b.fo.quaternion.copy(fh.qI.copy(fh.qU).invert()).multiply(fh.qF);
      fh.eu.set(0, 0, i ? -0.5 : 0.5); fh.qr.setFromEuler(fh.eu); fh.qH.copy(fh.qF).multiply(fh.qr); // расслабленная кисть: ладонью чуть внутрь
      if (qh) fh.qH.slerp(qh, k === undefined ? 1 : k);
      b.hd.quaternion.copy(fh.qI.copy(fh.qF).invert()).multiply(fh.qH);
      fh.vis[i] = true;
    },
    // позы пальцев: name — одно из POSES; вес плавно перетекает за кадр
    fingers(fh, i, name) { fh.want[i] = POSES.indexOf(name) < 0 ? 'idle' : name; },
    tick(fh, dt) {
      const k = 1 - Math.exp(-dt * 14);
      for (let i = 0; i < 2; i += 1) {
        const w = fh.w[i], A = fh.act[i];
        let sum = 0;
        POSES.forEach((n) => { w[n] = (w[n] || 0) + ((fh.want[i] === n ? 1 : 0) - (w[n] || 0)) * k; sum += w[n]; });
        POSES.forEach((n) => { if (A[n]) A[n].setEffectiveWeight(sum > 0.001 ? w[n] / sum : (n === 'idle' ? 1 : 0)); });
      }
      fh.mixer.update(dt);
      fh.root.visible = fh.vis[0] || fh.vis[1];
    },
    hide(fh) { fh.vis[0] = fh.vis[1] = false; fh.root.visible = false; },
    // игрушка: правая кисть держит её снизу (ладонь вверх), левая при объятии ложится на бок игрушки; base — ориентация игрушки, hk — степень объятия
    toy(fh, i, S, Wr, pole, base, hk) {
      fh.eu.set(0, 0, i ? PI * 0.85 : PI / 2); fh.qr.setFromEuler(fh.eu); fh.qT = fh.qT || new THREE.Quaternion();
      fh.qT.copy(base).multiply(fh.qr);
      P.pose(fh, i, S, Wr, pole, fh.qT, i ? 1 : hk);
      fh.root.visible = true;
      P.fingers(fh, i, i ? 'grip' : (hk > 0.3 ? 'grip' : 'idle'));
    },
    // оружие в руках: запястья и ориентации кистей (мир). rg — риг, mdl — модель оружия, kind — 'grip' / 'cup'
    armed(fh, rg, mdl) {
      const kind = mdl.leftKind === 'grip' ? CFG.Lgrip : CFG.Lcup, R = CFG.R, v = fh.v;
      const wr = rg.wr;
      fh.eu.set(R.e[0], R.e[1], R.e[2]); fh.qr.setFromEuler(fh.eu);
      fh.q[1].copy(rg.root.quaternion).multiply(fh.qr);
      v.set(R.off[0], R.off[1], R.off[2]); rg.root.localToWorld(wr[1].copy(v));
      fh.eu.set(kind.e[0], kind.e[1], kind.e[2]); fh.qr.setFromEuler(fh.eu);
      fh.q[0].copy(rg.lq).multiply(fh.qr);
      wr[0].set(kind.off[0], kind.off[1], kind.off[2]).applyQuaternion(rg.lq).add(rg.hp[0]);
    }
  };

  C.fpsHands = {
    CFG, POSES,
    // вызывается из buildRig: загрузка идёт в фоне, пока руки не готовы — работают процедурные
    attach(run) {
      const rg = run.rg; if (!rg || rg.fh || rg.fhLoading) return;
      rg.fhLoading = true;
      loadBuf().then(parse).then((gltf) => {
        if (run.disposed || run.rg !== rg || !run.scene) return;
        const fh = make(gltf);
        run.scene.add(fh.root);
        fh.mat.opacity = 1;
        rg.fh = fh;
      }).catch((e) => { console.warn('[fps hands]', e && e.message); });
    },
    pose: P.pose, fingers: P.fingers, tick: P.tick, hide: P.hide, armed: P.armed, toy: P.toy
  };
})();
