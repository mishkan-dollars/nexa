// NEXA: игрушка-абилка в миссии. Клавиша слота достаёт игрушку из-под экрана, ПКМ — поднести к камере и трясти (33 раза), ЛКМ — обнять (активировать) и убрать в карман
// (эффект 2 мин, перезарядка 5 мин). Здесь же: инвентарь-хотбар «1 2 3…», фигурка здоровья человека (слева сверху), качание HUD вслед за камерой
// и модули калибровки в миссии 1, которые включают эти части HUD. Игрушка рисуется отдельным проходом поверх мира (renderOver) в тот же рендер-таргет,
// поэтому на неё работают fisheye, зерно и виньетка. Всё работает и без боевого режима (cb): в миссии 1 нет ни здоровья, ни оружия.
(function () {
  'use strict';
  const MS = window.Missions, C = MS && MS._core, Toys = window.Toys;
  if (!C || !C.Run || !Toys) return;
  const P = C.Run.prototype;
  const wrap = C.wrap;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const sm = (k) => k * k * (3 - 2 * k);
  const eOut3 = (k) => 1 - Math.pow(1 - k, 3);
  const eIn3 = (k) => k * k * k;
  const eOutExp = (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k));
  const eInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const lin = (k) => k;

  const SHAKE_N = 33, SHAKE_F = 6.0;            // 33 тряски, 6 раз в секунду (≈5,5 с)
  const BONUS_AMMO = 100, BONUS_FOV = 20;
const TOSS_T = 0.86, TOSS_H = 0.5;            // объятие: игрушку подбрасывают вверх (0.86 с) и ловят в воздухе у груди
  const FIGURE = ['head', 'torso', 'armL', 'armR', 'legL', 'legR'];
  const HIT_W = [0.10, 0.40, 0.12, 0.12, 0.13, 0.13];   // куда чаще попадают
  const CAP = [0.22, 0.50, 0.28, 0.28, 0.30, 0.30];     // сколько урона (от maxHp) полностью «красит» часть тела

  // ---------------------------------------------------------------- позы игрушки
  // sp: 'b' — в системе тела (покачивается вместе с оружием), 'c' — в системе камеры, 'w' — готовая мировая (снимок текущей позы)
  let PZ = null;
  function mkPose(sp, x, y, z, rx, ry, rz, s) {
    const T = window.THREE;
    return { sp, p: new T.Vector3(x, y, z), q: new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')), s: s || 1 };
  }
  function poses() {
    return PZ || (PZ = {
      down: mkPose('b', 0.17, -1.0, -0.42, -0.7, -0.35, 0.1, 0.92),       // под экраном: отсюда игрушка вылетает и сюда уходит в карман
      hold: mkPose('b', 0.2, -0.24, -0.53, -0.3, -0.3, 0.04, 1),          // в правой руке, лицом к игроку
      near: mkPose('c', 0.02, -0.04, -0.5, 0.02, 0, 0, 1),                // у самой камеры: тут её трясут
      hug: mkPose('c', 0, -0.27, -0.3, -0.12, 0, 0, 1.04),                // прижата к груди
      catch: mkPose('c', 0, -0.13, -0.42, -0.12, 0, 0, 1)                 // точка, где её ловят двумя руками, перед тем как прижать
    });
  }
  function evalPose(r, Q, op, oq) {
    if (Q.sp === 'w') { op.copy(Q.p); oq.copy(Q.q); return Q.s; }
    const o = Q.sp === 'b' ? r.body : r.camera;
    op.copy(Q.p); if (Q.sp === 'b') op.add(r.ty.sw);
    op.applyMatrix4(o.matrixWorld); oq.copy(o.quaternion).multiply(Q.q);
    return Q.s;
  }
  function blend(r, A, B, k, op, oq) {
    const ty = r.ty, sa = evalPose(r, A, ty.pa, ty.qa), sb = evalPose(r, B, ty.pb, ty.qb);
    op.lerpVectors(ty.pa, ty.pb, k); oq.copy(ty.qa).slerp(ty.qb, k);
    return lerp(sa, sb, k);
  }
  // тряска: в основном вверх-вниз, с лёгким кивком и креном
  function shakeOff(tm, env, o) {
    const w = 2 * Math.PI * SHAKE_F * tm;
    o.x = 0.022 * Math.sin(w + 1.3) * env; o.y = 0.065 * Math.sin(w) * env; o.z = 0.015 * Math.cos(w) * env;
    o.rx = 0.45 * Math.sin(w + 0.5) * env; o.rz = 0.35 * Math.sin(w + 2.0) * env;
  }
  function limbTo(m, a, b) {
    m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.scale.set(1, 1, Math.max(0.02, a.distanceTo(b)));
    m.lookAt(b);
  }
  const fmt = (s) => { const c = Math.max(0, Math.ceil(s)); return Math.floor(c / 60) + ':' + String(c % 60).padStart(2, '0'); };

  // ---------------------------------------------------------------- инициализация (вызывается из Run.start после initProps)
  P.initToys = function (id) {
    const T = window.THREE;
    const force = Number(this.taskId) !== 1;                  // миссия 1 — калибровка: части HUD включаются модулями; везде дальше — всегда
    this.hudOn = { life: force || Toys.hud.has('life'), gear: force || Toys.hud.has('gear') };
    this.toyId = null; this.toy = null;
    this.toyFx = { on: false, k: 0, until: 0, cdUntil: 0, cdOn: false };
    this.ty = {
      s: 'none', t: 0, dur: 1, ease: lin, from: null, to: null, vis: false, prev: null, after: null, hk: 0, sq: 0, sqT: 0, shakeT: 0, shakeN: 0, hint: null, env: 0,
      sw: new T.Vector3(), pa: new T.Vector3(), pb: new T.Vector3(), qa: new T.Quaternion(), qb: new T.Quaternion(),
      cur: { p: new T.Vector3(), q: new T.Quaternion(), s: 1 }, sc: { sp: 'c', p: new T.Vector3(), q: new T.Quaternion(), s: 1 },
      off: { x: 0, y: 0, z: 0, rx: 0, rz: 0 }, eo: new T.Euler(0, 0, 0, 'YXZ'), qo: new T.Quaternion(), v: new T.Vector3(), v2: new T.Vector3(), gp: new T.Vector3(), gq: new T.Quaternion(), qh: new T.Quaternion(), qh2: new T.Quaternion(), hf: 0, tossed: false
    };
    this.buildToyHud();
    const toy = id && Toys.tpl(id) ? Toys.make(id) : null;
    if (toy) {
      this.toyId = id; this.toy = toy;
      const sc = this.toyScene = new T.Scene();
      this.tlAmb = new T.AmbientLight(0xffffff, 0.7); sc.add(this.tlAmb);
      this.tlKey = new T.DirectionalLight(0xffffff, 0.7); sc.add(this.tlKey); sc.add(this.tlKey.target);
      this.tlRim = new T.DirectionalLight(0xbfd0ff, 0.45); sc.add(this.tlRim); sc.add(this.tlRim.target);
      this.toyPivot = new T.Group(); this.toyPivot.add(toy.group); this.toyPivot.visible = false; sc.add(this.toyPivot);
      this.toyGhosts = [0.3, 0.15].map((a) => {
        const g = Toys.make(id, { ghost: a }), pv = new T.Group(); pv.add(g.group); pv.visible = false; sc.add(pv);
        return { toy: g, pv };
      });
    }
    this.hotSig = ''; this.hb = { slots: [], acc: 1, bar: this.qs('.m-hotbar') };
    this.hs = { yaw: this.p.yaw, pitch: this.p.pitch, x: 0, y: 0, vx: 0, vy: 0, sx: 1e9, sy: 1e9 };
    this.bd = { inj: [0, 0, 0, 0, 0, 0], shown: [-1, -1, -1, -1, -1, -1], hp: -1, acc: 1, glow: -1 };
    this.syncHudFlags(false);
  };

  P.syncHudFlags = function (boot, which) {
    const L = this.layer.classList;
    L.toggle('hud-life', !!this.hudOn.life); L.toggle('hud-gear', !!this.hudOn.gear);
    if (boot && which) { const c = 'boot-' + which; L.remove(c); void this.layer.offsetWidth; L.add(c); setTimeout(() => { this.layer && L.remove(c); }, 1600); }
  };

  const FIG = '<svg viewBox="0 0 60 126" width="46" height="97"><g>' +
    '<ellipse data-p="0" cx="30" cy="11" rx="9" ry="10"/><rect data-p="1" x="19" y="24" width="22" height="42" rx="6"/>' +
    '<rect data-p="2" x="8" y="25" width="9" height="40" rx="4.5"/><rect data-p="3" x="43" y="25" width="9" height="40" rx="4.5"/>' +
    '<rect data-p="4" x="19.5" y="68" width="10" height="52" rx="5"/><rect data-p="5" x="30.5" y="68" width="10" height="52" rx="5"/></g></svg>';

  P.buildToyHud = function () {
    const hud = this.qs('.m-hud');
    hud.insertAdjacentHTML('beforeend', '<div class="m-body" aria-hidden="true">' + FIG + '<b translate="no">100</b></div>');
    this.layer.insertAdjacentHTML('beforeend', '<div class="m-hotbar"></div><div class="m-toyfx" aria-hidden="true"><i class="l"></i><i class="r"></i></div>');
    this.bdEl = this.qs('.m-body'); this.bdParts = Array.from(this.bdEl.querySelectorAll('[data-p]')); this.bdNum = this.bdEl.querySelector('b');
    this.fxEl = this.qs('.m-toyfx');
  };

  // ---------------------------------------------------------------- состояния игрушки
  function go(r, s, to, dur, ease, from) {
    const ty = r.ty;
    if (!from) {
      const c = ty.cur; from = { sp: 'w', p: c.p.clone(), q: c.q.clone(), s: c.s };
    }
    ty.s = s; ty.t = 0; ty.dur = dur; ty.ease = ease || lin; ty.from = from; ty.to = to;
  }
  P.ensureSnd = function () {
    if (!this.snd && C.makeSound && !this.disposed) { try { this.snd = C.makeSound(this); } catch (e) { this.snd = null; } }
    if (this.snd) this.snd.resume();
    return this.snd;
  };
  P.toyHint = function (on) {
    if (this.touch) return;
    const el = this.qs('.m-hint'), ty = this.ty; if (!el) return;
    if (on) { if (ty.hint === null) ty.hint = el.textContent; el.textContent = 'LMB ACTIVATE  |  RMB SHAKE  |  SLOT KEY PUT AWAY'; }
    else if (ty.hint !== null) { el.textContent = ty.hint; ty.hint = null; }
  };
  P.toyRevealed = function (v) {
    const ty = this.ty;
    ty.vis = v; this.toyPivot.visible = v;
    this.toyGhosts.forEach((g) => { g.pv.visible = false; });
    this.layer.classList.toggle('toyheld', v);
    this.toyHint(v);
  };
  P.toyDraw = function () {
    const ty = this.ty;
    if (!this.toy || ty.s !== 'none' || this.locked || this.camFree) return;
    this.ensureSnd();
    ty.prev = this.swapTo || this.wp || null; ty.after = null;
    this.aimWant = false; this.fireHeld = false;
    if (this.wp) { this.swapTo = null; this.rl = null; ty.s = 'unwield'; ty.t = 0; ty.dur = 0.14; }
    else this.toyBeginDraw();
  };
  P.toyBeginDraw = function () {
    const Z = poses(), ty = this.ty;
    this.wp = null; this.swapOff = 0; this.aimK = 0;
    this.toyRevealed(true);
    this.snd && this.snd.play('plush', { k: 0.55 });
    go(this, 'draw', Z.hold, 0.62, eOutExp, Z.down);
  };
  P.toySetHold = function () { const Z = poses(); go(this, 'hold', Z.hold, Infinity, lin, Z.hold); };
  P.toyShake = function () {
    const Z = poses(), ty = this.ty;
    if (ty.s !== 'hold' || this.locked) return;
    go(this, 'approach', Z.near, 0.7, eInOut, Z.hold);
  };
  P.toyHug = function () {
    const Z = poses(), ty = this.ty;
    if (this.locked || ['hold', 'approach', 'shake', 'out', 'draw'].indexOf(ty.s) < 0) return;
    this.ensureSnd();
    ty.tossed = false;
    this.snd && this.snd.play('throw', { k: 0.45 });
    go(this, 'toss', Z.catch, TOSS_T, lin);
  };
  P.toyStow = function (after) {
    const Z = poses(), ty = this.ty;
    if (ty.s === 'none') return;
    if (after) ty.after = after;
    if (ty.s === 'stow' || ty.s === 'toss' || ty.s === 'hug' || ty.s === 'hugHold' || ty.s === 'pocket') return;   // эти состояния и так заканчиваются уходом игрушки (оружие вернётся само)
    if (ty.s === 'unwield') { ty.s = 'none'; ty.prev = null; return; }
    go(this, 'stow', Z.down, 0.24, eIn3, ty.s === 'hold' ? Z.hold : null);
  };
  // игрушка спрятана: вернуть оружие, которое было в руках (или выбранное во время ухода игрушки)
  P.toyHide = function () {
    const ty = this.ty;
    ty.s = 'none'; ty.hk = 0; ty.hf = 0; ty.sq = 0; ty.tossed = false;
    this.toyRevealed(false);
    const w = ty.after || ty.prev; ty.after = ty.prev = null;
    if (w && this.cb && this.inv && this.inv.indexOf(w) >= 0) equip0.call(this, w, true);
  };
  P.toyContact = function () {
    const Z = poses(), ty = this.ty, d = Toys.def(this.toyId), fx = this.toyFx;
    ty.sqT = 0;
    this.snd && this.snd.play('plush', { k: 0.95 });
    // эффект «ОБЪЯТИЕ»: всё здоровье, патроны, шире обзор (fovNow), чёрные полосы по краям (.m-toyfx)
    fx.on = true; fx.until = this.time + d.duration; fx.cdUntil = this.time + d.cooldown; fx.cdOn = true;
    if (this.cb) {
      this.hp = this.maxHp; this.stress = Math.min(this.stress, 0.12);
      (this.inv || []).forEach((w) => { w.reserve += BONUS_AMMO; });
      this.refreshHud();
    }
    this.snd && this.snd.play('medkit', { k: 0.5 });
    this.toast('EMBRACE ACTIVE', 2.2);
    this.glitch && this.glitch(0.16);
    go(this, 'hugHold', Z.hug, 0.55, lin, Z.hug);
  };
  // следующее состояние, когда закончилось время текущего
  P.toyNext = function () {
    const Z = poses(), ty = this.ty;
    switch (ty.s) {
      case 'unwield': this.toyBeginDraw(); break;
      case 'draw': case 'out': this.toySetHold(); break;
      case 'approach': ty.s = 'shake'; ty.t = 0; ty.dur = SHAKE_N / SHAKE_F; ty.shakeT = 0; ty.shakeN = 0; break;
      case 'shake': go(this, 'out', Z.hold, 0.65, eInOut, Z.near); break;
      case 'toss': ty.tossed = true; go(this, 'hug', Z.hug, 0.14, eOut3); break;     // поймали в воздухе — прижимаем к груди
      case 'hug': this.toyContact(); break;
      case 'hugHold': go(this, 'pocket', Z.down, 0.34, eIn3, Z.hug); break;
      case 'pocket': case 'stow': this.toyHide(); break;
      default: ty.t = 0; break;
    }
  };
  P.toyCancel = function () {
    const ty = this.ty; if (!ty || ty.s === 'none') return;
    if (ty.s === 'unwield') { ty.s = 'none'; ty.prev = ty.after = null; return; }
    this.toyHide();
  };
  P.toyKey = function () {
    const ty = this.ty, fx = this.toyFx;
    if (!this.toy || this.locked || this.camFree) return;
    if (ty.s === 'none') {
      if (this.time < fx.cdUntil) { this.toyDeny(); return; }
      this.toyDraw();
    } else if (ty.s !== 'stow') this.toyStow();
  };
  P.toyDeny = function () {
    this.sfx && this.sfx('denied');
    this.toast('BLACK BEAR RECHARGING', 1.4);
    const el = this.hb && this.hb.slots[0] && this.hb.slots[0].el;
    if (el && this.hotEntries()[0] && this.hotEntries()[0].toy) { el.classList.remove('deny'); void el.offsetWidth; el.classList.add('deny'); }
  };

  // ---------------------------------------------------------------- покадровое обновление игрушки (после updateRig: матрицы тела и камеры уже свежие)
  const rig0 = P.updateRig;
  P.updateRig = function (dt, vel) {
    rig0.call(this, dt, vel);
    if (this.ty) this.toyUpdate(dt, vel);
  };
  // подброс: путь от снимка позы в руке к точке поимки + парабола вверх (в системе камеры), кувырок вокруг горизонтальной оси; к моменту поимки поза успокаивается
  function tossPose(r, k, op, oq) {
    const ty = r.ty, cam = r.camera, kc = clamp(k, 0, 1);
    const s0 = blend(r, ty.from, ty.to, kc, op, oq);
    const arc = 4 * kc * (1 - kc);
    op.add(ty.v.set(0, TOSS_H * arc, -0.12 * arc).applyQuaternion(cam.quaternion));
    const sk = eInOut(clamp(kc / 0.72, 0, 1));
    ty.eo.set(-Math.PI * 2 * sk, 0, 0.35 * Math.sin(Math.PI * 2 * sk)); ty.qo.setFromEuler(ty.eo);
    ty.qa.copy(cam.quaternion).invert(); ty.qb.copy(cam.quaternion).multiply(ty.qo).multiply(ty.qa);
    oq.premultiply(ty.qb);
    return s0 * (1 - 0.16 * arc);
  }
  P.toyUpdate = function (dt, vel) {
    const ty = this.ty, p = this.p, mv = p.moving, Z = poses(), rg = this.rg;
    ty.sw.set(Math.sin(p.phase) * 0.01 * mv + clamp(-vel * 0.0035, -0.045, 0.045), Math.abs(Math.sin(p.phase)) * 0.014 * mv + Math.sin(this.time * 1.4) * 0.004 + clamp(-(this.pitchVel || 0) * 0.003, -0.04, 0.04), 0);
    if (ty.s === 'none') return;
    if (dt > 0) ty.t += dt;
    if (ty.s === 'unwield') {                                     // оружие опускается, потом достаём игрушку
      this.rl = null; this.fireHeld = false;
      this.swapOff = Math.max(this.swapOff || 0, clamp(ty.t / ty.dur, 0, 1));
      if (ty.t >= ty.dur) this.toyNext();
      return;
    }
    if (ty.t >= ty.dur) this.toyNext();
    if (ty.s === 'none' || !ty.vis) return;
    const k = ty.dur === Infinity ? 0 : clamp(ty.t / ty.dur, 0, 1), cur = ty.cur;
    let sc, env = 0;
    ty.hk = ty.s === 'hug' ? (ty.tossed ? 1 : eOut3(k)) : ty.s === 'hugHold' ? 1 : ty.s === 'pocket' ? 1 - sm(k) : ty.s === 'toss' ? sm(clamp((k - 0.7) / 0.3, 0, 1)) : 0;
    ty.hf = ty.s === 'toss' ? sm(clamp(k / 0.14, 0, 1)) * (1 - sm(clamp((k - 0.72) / 0.23, 0, 1))) : 0;   // руки отпустили игрушку и вернулись, пока она летит
    if (ty.s === 'hug') ty.sq = 0.5 * k;
    else if (ty.s === 'hugHold') { ty.sqT = ty.t; ty.sq = 0.5 * Math.exp(-5 * ty.t) * Math.cos(22 * ty.t); } else ty.sq *= Math.exp(-dt * 14);
    if (ty.s === 'shake') {
      ty.shakeT = ty.t;
      env = Math.min(1, ty.t / 0.25) * Math.min(1, (ty.dur - ty.t) / 0.35);
      while (ty.shakeN < SHAKE_N && ty.shakeT * SHAKE_F >= ty.shakeN) { ty.shakeN += 1; this.snd && this.snd.play('plush', { k: 0.5 + 0.3 * env }); }   // на каждую тряску — случайный plush
      const so = ty.off, q = ty.sc;
      shakeOff(ty.t, env, so);
      q.p.copy(Z.near.p).add(ty.v.set(so.x, so.y, so.z)); ty.eo.set(so.rx, 0, so.rz); ty.qo.setFromEuler(ty.eo); q.q.copy(ty.qo).multiply(Z.near.q); q.s = Z.near.s;
      cur.s = evalPose(this, q, cur.p, cur.q);
      for (let gi = 0; gi < 2; gi += 1) {                         // «размытие»: призраки игрушки на предыдущих фазах тряски
        const g = this.toyGhosts[gi], lag = gi ? 0.044 : 0.021;
        shakeOff(Math.max(0, ty.t - lag), env, so);
        q.p.copy(Z.near.p).add(ty.v.set(so.x, so.y, so.z)); ty.eo.set(so.rx, 0, so.rz); ty.qo.setFromEuler(ty.eo); q.q.copy(ty.qo).multiply(Z.near.q);
        g.pv.visible = env > 0.2; evalPose(this, q, g.pv.position, g.pv.quaternion); g.pv.scale.setScalar(Z.near.s);
      }
    } else if (ty.s === 'toss') {
      cur.s = tossPose(this, k, cur.p, cur.q);
      for (let gi = 0; gi < 2; gi += 1) {                         // размытие полёта: призраки на предыдущих фазах дуги
        const g = this.toyGhosts[gi], kk = k - (gi ? 0.075 : 0.036);
        g.pv.visible = kk > 0.02 && k < 0.8;
        if (g.pv.visible) g.pv.scale.setScalar(tossPose(this, kk, g.pv.position, g.pv.quaternion));
      }
    } else {
      cur.s = blend(this, ty.from, ty.to, ty.ease(k), cur.p, cur.q);
      if (this.toyGhosts[0].pv.visible) this.toyGhosts.forEach((g) => { g.pv.visible = false; });
    }
    ty.env = env;
    const pv = this.toyPivot, s = cur.s, q = ty.sq;
    pv.position.copy(cur.p); pv.quaternion.copy(cur.q); pv.scale.set(s * (1 + 0.12 * q), s * (1 - 0.14 * q), s * (1 - 0.1 * q));
    this.toyArms(dt);
  };

  // руки: правая держит игрушку снизу сзади, при объятии обе обнимают её; рисуется тем же IK, что и руки с оружием
  P.toyArms = function (dt) {
    const rg = this.rg, ty = this.ty, cur = ty.cur, body = this.body, C0 = C;
    if (!rg || !ty.vis) return;
    const { sh, el, wr, hp, arms } = rg, v = ty.v2;
    rg.armMat.opacity = 1; if (rg.fh) rg.fh.mat.opacity = 1;
    const hk = ty.hk, hf = ty.hf || 0;
    let q = cur.q;
    // правая кисть: хват под игрушкой; в объятии — сбоку от неё
    const gp = ty.gp;
    gp.set(0.19, lerp(-0.12, -0.05, hk), lerp(0.0, 0.03, hk)).multiplyScalar(cur.s).applyQuaternion(q).add(cur.p);
    if (hf > 0.001) {                                             // подброс: рука идёт вверх вслед за игрушкой и опускается в покой, пока та летит
      const k = ty.dur === Infinity ? 0 : clamp(ty.t / ty.dur, 0, 1);
      ty.v.set(0.2, -0.34 + 0.2 * Math.sin(Math.PI * clamp(k / 0.35, 0, 1)), -0.46).applyMatrix4(this.camera.matrixWorld);
      gp.lerp(ty.v, hf);
      ty.qh.copy(this.body.quaternion).multiply(poses().hold.q); ty.qh2.copy(cur.q).slerp(ty.qh, hf); q = ty.qh2;   // кисти не вертятся вместе с игрушкой
    }
    wr[1].copy(gp);
    // левая кисть: расслаблена у пояса, в объятии идёт к игрушке с другой стороны
    gp.set(-0.19, -0.05, 0.03).multiplyScalar(cur.s).applyQuaternion(cur.q).add(cur.p);
    wr[0].copy(hp[0]).lerp(gp, sm(hk));
    for (let i = 0; i < 2; i += 1) {
      const a = arms[i];
      v.set(i ? 0.55 : -0.55, -1, 0.15).applyQuaternion(body.quaternion);
      if (rg.fh) { a.up.visible = a.fo.visible = a.el.visible = a.hand.visible = false; C0.fpsHands.toy(rg.fh, i, sh[i], wr[i], v, q, sm(hk)); continue; } // риггнутые руки
      a.up.visible = a.fo.visible = a.el.visible = a.hand.visible = true;
      C0.ik2(sh[i], wr[i], 0.3, 0.3, v, el[i]);
      limbTo(a.up, sh[i], el[i]); limbTo(a.fo, el[i], wr[i]);
      a.el.position.copy(el[i]);
      a.hand.position.copy(wr[i]); a.hand.quaternion.copy(a.fo.quaternion);
    }
  };

  // игрушка поверх мира: чистим глубину и рисуем её отдельной сценой в тот же рендер-таргет
  P.renderOver = function () {
    const ty = this.ty, sc = this.toyScene;
    if (!ty || !sc || !ty.vis || !this.renderer) return;
    const cam = this.camera, v = ty.v, r = this.renderer;
    this.tlAmb.intensity = 0.26 + 0.62 * clamp((this.amb ? this.amb.intensity : 0.8) / 0.85, 0.25, 1.4);
    const cp = cam.position, cq = cam.quaternion;
    this.tlKey.position.copy(cp).add(v.set(-0.6, 1.0, 0.9).applyQuaternion(cq));
    this.tlKey.target.position.copy(cp).add(v.set(0, -0.2, -0.5).applyQuaternion(cq)); this.tlKey.target.updateMatrixWorld();
    this.tlRim.position.copy(cp).add(v.set(0.9, 0.3, -0.7).applyQuaternion(cq));
    this.tlRim.target.position.copy(cp).add(v.set(0, -0.2, -0.5).applyQuaternion(cq)); this.tlRim.target.updateMatrixWorld();
    r.autoClear = false; r.clearDepth(); r.render(sc, cam); r.autoClear = true;
  };

  // ---------------------------------------------------------------- враппер боевых методов
  const equip0 = P.equip, sel0 = P.selectSlot, swap0 = P.swapNext, pf0 = P.pressFire, hurt0 = P.hurt, fov0 = P.fovNow, uc0 = P.updateCombat, bc0 = P.bindCombat, dc0 = P.disposeCombat;

  P.equip = function (w, instant) {
    const ty = this.ty;
    if (ty && ty.s !== 'none' && w) { this.toyStow(w); ty.after = w; return; }       // оружие выбрали, пока игрушка в руке: игрушка уходит, потом оружие
    return equip0.call(this, w, instant);
  };
  P.pressFire = function () {
    const ty = this.ty;
    if (ty && ty.s !== 'none') { this.fireHeld = false; this.toyHug(); return; }
    return pf0.call(this);
  };
  P.fovNow = function () {
    const f = fov0.call(this), fx = this.toyFx;
    return fx && fx.k > 0.001 ? f + BONUS_FOV * sm(fx.k) * (1 - sm(this.aimK || 0)) : f;
  };
  P.hurt = function (amt, fx, fz) {
    const before = this.hp;
    hurt0.call(this, amt, fx, fz);
    const lost = before - this.hp;
    if (lost > 0 && this.bd) this.bodyHit(lost, fx, fz);
  };
  P.disposeCombat = function () {
    try { this.toyDispose(); } catch (e) { console.warn('[toys]', e); }
    return dc0.call(this);
  };
  P.toyDispose = function () {
    if (this.toyGhosts) this.toyGhosts.forEach((g) => g.toy.dispose());
    if (this.toy) this.toy.dispose();
    this.toyGhosts = null; this.toy = null; this.toyScene = null; this.toyPivot = null;
    if (this.ty) this.ty.vis = false;
  };

  // ---------------------------------------------------------------- хотбар: «1 2 3…» — игрушка первой, затем всё оружие
  P.hotEntries = function () {
    const list = [];
    if (!this.hudOn || !this.hudOn.gear) return list;
    if (this.toy) list.push({ toy: true, key: 'toy:' + this.toyId });
    if (this.cb && this.inv) this.inv.forEach((w) => list.push({ w, key: w.id }));
    return list;
  };
  P.selectSlot = function (n) {
    const list = this.hotEntries();
    if (!list.length) return sel0.call(this, n);
    if (this.locked || this.paused) return;
    const e = list[n]; if (!e) return;
    if (e.toy) this.toyKey(); else this.equip(e.w);
  };
  P.swapNext = function (dir) {
    const list = this.hotEntries();
    if (!list.length) return swap0.call(this, dir);
    if (this.locked || this.paused || list.length < 2) return;
    const ty = this.ty, tw = ty.s !== 'none', cw = this.swapTo || this.wp;
    let i = list.findIndex((e) => (e.toy ? tw : (!tw && e.w === cw)));
    if (i < 0) i = 0;
    this.selectSlot((i + (dir || 1) + list.length) % list.length);
  };

  const WSVG = {
    glock: '<path d="M4 5h30v4h-3v3h-5l-2 7h-5l1-7h-4v-3z"/>',
    ak: '<path d="M2 7h10l2 3v3H2zM14 8h20v4H14zM34 9h12v1.6H34zM24 12h4l2 7h-5zM16 12h3l-1 6h-3z"/>',
    shotgun: '<path d="M2 8h12l2 3H2zM14 8h14v4H14zM28 8h18v2H28zM30 10.5h10v1.6H30z"/>',
    sniper: '<path d="M2 8h12l2 3v2H2zM14 9h16v3H14zM30 10h16v1.4H30zM22 5h10v2H22zM24 7h2v2h-2z"/>',
    minigun: '<path d="M1 8h5v6H1zM6 6.5h12v9H6zM9 4h7v1.5H9zM8 15.5h3l-.5 4H7.6zM18 7.6h28v1.3H18zM18 10.2h28v1.3H18zM18 12.8h28v1.3H18zM29 6.5h2v9h-2zM43 6.5h2v9h-2z"/>'
  };
  // игрушка в хотбаре — та же 3D-аватарка, что и в магазине (пока рисуется — плоский силуэт)
  const slotIcon = (e, id) => {
    if (!e.toy) return '<svg viewBox="0 0 48 20" aria-hidden="true">' + (WSVG[e.w.id] || WSVG.glock) + '</svg>';
    const url = Toys.avatarUrl(id);
    return url ? '<img class="hb-av" alt="" src="' + url + '">' : Toys.BEAR_SVG;
  };

  P.hotBuild = function (list) {
    const bar = this.hb.bar; this.hb.slots = [];
    this.layer.classList.toggle('hb-on', list.length > 0);
    if (!list.length) { bar.innerHTML = ''; return; }
    bar.innerHTML = list.map((e, i) => {
      const nm = e.toy ? Toys.def(this.toyId).name : e.w.def.name;
      return '<div class="hb-slot' + (e.toy ? ' toy' : '') + '" data-i="' + i + '"><i class="hb-n" translate="no">' + (i + 1) + '</i><span class="hb-ic">' + slotIcon(e, this.toyId) + '</span><b class="hb-nm">' + nm + '</b>' +
        (e.toy ? '<em class="hb-st">READY</em><s class="hb-t" translate="no"></s><u class="hb-cd"></u>' : '') + '</div>';
    }).join('');
    if (list.some((e) => e.toy) && !Toys.avatarUrl(this.toyId)) {       // аватарка ещё не нарисована — рисуем и подменяем силуэт
      const id = this.toyId;
      Toys.avatar(id).then((url) => {
        if (!url) return;
        bar.querySelectorAll('.hb-slot.toy .hb-ic').forEach((ic) => { ic.innerHTML = '<img class="hb-av" alt="" src="' + url + '">'; });
      });
    }
    this.hb.slots = Array.from(bar.querySelectorAll('.hb-slot')).map((el, i) => ({ el, e: list[i], st: el.querySelector('.hb-st'), tm: el.querySelector('.hb-t'), cd: el.querySelector('.hb-cd'), cur: null, text: '', time: '', cdw: -1 }));
  };
  P.hotRefresh = function (dt) {
    const hb = this.hb; if (!hb || !hb.bar) return;
    hb.acc += dt; if (hb.acc < 0.1) return; hb.acc = 0;
    const list = this.hotEntries(), sig = (this.hudOn.gear ? 'g' : 'x') + list.map((e) => e.key).join(',');
    if (sig !== this.hotSig) { this.hotSig = sig; this.hotBuild(list); }
    const ty = this.ty, fx = this.toyFx, tw = ty.s !== 'none' && ty.s !== 'stow' && ty.s !== 'toss' && ty.s !== 'hug' && ty.s !== 'hugHold' && ty.s !== 'pocket', cw = this.swapTo || this.wp;
    hb.slots.forEach((S) => {
      const cur = S.e.toy ? tw : (!ty.vis && S.e.w === cw && ty.s === 'none') || (S.e.w === cw && !tw && ty.s === 'none');
      if (cur !== S.cur) { S.cur = cur; S.el.classList.toggle('cur', cur); }
      if (!S.e.toy) return;
      let text = 'READY', time = '', cd = 0;
      if (fx.on && this.time < fx.until) { text = 'ACTIVE'; time = fmt(fx.until - this.time); cd = 1 - (fx.until - this.time) / Toys.def(this.toyId).duration; }
      else if (fx.cdOn && this.time < fx.cdUntil) { text = 'RECHARGING'; time = fmt(fx.cdUntil - this.time); cd = 1 - (fx.cdUntil - this.time) / Toys.def(this.toyId).cooldown; }
      if (text !== S.text) { S.text = text; S.st.textContent = text; S.el.classList.toggle('ready', text === 'READY'); S.el.classList.toggle('act', text === 'ACTIVE'); }
      if (time !== S.time) { S.time = time; S.tm.textContent = time; }
      const w = Math.round(clamp(cd, 0, 1) * 100);
      if (w !== S.cdw) { S.cdw = w; S.cd.style.width = w + '%'; }
    });
  };

  // ---------------------------------------------------------------- фигурка здоровья: красным светятся раненые части тела — тем сильнее, чем больше урона
  P.bodyHit = function (lost, fx, fz) {
    const bd = this.bd, w = HIT_W.slice();
    if (fx !== undefined && fz !== undefined) {                     // сторона попадания относительно взгляда
      const rel = wrap(Math.atan2(-(fx - this.p.x), -(fz - this.p.z)) - this.p.yaw), left = rel > 0, back = Math.abs(rel) > 2.35;
      w[2] *= left ? 2 : 0.5; w[4] *= left ? 2 : 0.5; w[3] *= left ? 0.5 : 2; w[5] *= left ? 0.5 : 2;
      if (back) { w[1] *= 1.5; w[0] *= 1.3; }
    }
    const pick = (skip) => {
      let sum = 0; w.forEach((x, i) => { if (i !== skip) sum += x; });
      let r = Math.random() * sum;
      for (let i = 0; i < w.length; i += 1) { if (i === skip) continue; r -= w[i]; if (r <= 0) return i; }
      return 1;
    };
    const a = pick(-1);
    if (Math.random() < 0.35) { const b = pick(a); bd.inj[a] += lost * 0.7; bd.inj[b] += lost * 0.3; } else bd.inj[a] += lost;
    bd.acc = 1;
    this.bdEl.classList.remove('hit'); void this.bdEl.offsetWidth; this.bdEl.classList.add('hit');
  };
  P.bodyDraw = function (dt) {
    const bd = this.bd; bd.acc += dt; if (bd.acc < 0.08) return; bd.acc = 0;
    const max = this.maxHp || 100, hpNow = this.cb ? this.hp : max, deficit = Math.max(0, max - hpNow);
    let sum = 0; for (let i = 0; i < 6; i += 1) sum += bd.inj[i];
    if (sum > deficit + 0.01) { const k = deficit / sum; for (let i = 0; i < 6; i += 1) bd.inj[i] *= k; }     // регенерация и лечение смывают раны пропорционально
    else if (deficit > sum + 0.01) bd.inj[1] += deficit - sum;                                                // потери от неизвестного источника — в корпус
    let glow = 0;
    for (let i = 0; i < 6; i += 1) {
      const L = clamp(bd.inj[i] / (CAP[i] * max), 0, 1);
      glow = Math.max(glow, L);
      if (Math.abs(L - bd.shown[i]) < 0.015) continue;
      bd.shown[i] = L;
      const r = Math.round(lerp(236, 239, L)), g = Math.round(lerp(236, 75, L)), b = Math.round(lerp(236, 69, L));
      this.bdParts[i].style.fill = 'rgba(' + r + ',' + g + ',' + b + ',' + lerp(0.78, 0.96, L).toFixed(2) + ')';
    }
    if (Math.abs(glow - bd.glow) > 0.015) { bd.glow = glow; this.bdEl.style.setProperty('--g', glow.toFixed(2)); }
    const hp = Math.ceil(hpNow);
    if (hp !== bd.hp) { bd.hp = hp; this.bdNum.textContent = String(hp); this.bdEl.classList.toggle('low', hpNow < max * 0.3); }
  };

  // ---------------------------------------------------------------- цикл: эффект игрушки, качание HUD, хотбар, фигурка
  P.updateCombat = function (dt) {
    uc0.call(this, dt);
    if (this.ty) {
      if (this.ty.s === 'unwield') this.swapOff = clamp(this.ty.t / this.ty.dur, 0, 1);   // updateWeapon сам возвращает оружие наверх — держим его опущенным
      this.toyTick(dt);
    }
  };
  P.toyTick = function (dt) {
    const ty = this.ty, fx = this.toyFx, h = this.hs, p = this.p, L = this.layer;
    if (ty.s !== 'none' && (this.locked || this.camFree)) this.toyCancel();
    if (ty.s !== 'none' && this.aimWant) {                           // ПКМ / LT / кнопка AIM с игрушкой в руке — трясти (ЛКМ / FIRE — обнять и активировать)
      this.aimWant = false; const a = this.qs('.m-aim'); a && a.classList.remove('held');
      this.toyShake();
    }
    // эффект: плавно входит, к последним 10 секундам начинает мигать, потом гаснет; конец перезарядки сообщаем
    const live = fx.on && this.time < fx.until;
    if (fx.on && !live) { fx.on = false; this.toast('EMBRACE ENDED', 1.8); }
    if (fx.cdOn && this.time >= fx.cdUntil) { fx.cdOn = false; this.toast('BLACK BEAR READY', 1.8); this.hotSig = ''; }
    fx.k = clamp(fx.k + (live ? 1 : -1) * dt / 0.8, 0, 1);
    if (fx.k > 0 || this.fxShown) {
      const pulse = live && fx.until - this.time < 10 ? 0.82 + 0.18 * Math.sin(this.time * 7) : 1;
      this.fxEl.style.opacity = (sm(fx.k) * pulse).toFixed(3);
      this.fxShown = fx.k > 0;
    }
    // HUD покачивается туда же, куда повернулась камера: вправо при повороте вправо, вверх при взгляде вверх; пружина возвращает на место
    if (dt > 0) {
      const d = Math.min(dt, 0.05);
      const vy = wrap(p.yaw - h.yaw) / d, vp = (p.pitch - h.pitch) / d;
      const tx = clamp(-vy * 7, -38, 38), tp = clamp(-vp * 7, -30, 30);
      h.vx += ((tx - h.x) * 170 - h.vx * 15) * d; h.x += h.vx * d;
      h.vy += ((tp - h.y) * 170 - h.vy * 15) * d; h.y += h.vy * d;
      if (Math.abs(h.x - h.sx) > 0.05 || Math.abs(h.y - h.sy) > 0.05) {
        h.sx = h.x; h.sy = h.y;
        L.style.setProperty('--hx', h.x.toFixed(2) + 'px'); L.style.setProperty('--hy', h.y.toFixed(2) + 'px');
      }
    }
    h.yaw = p.yaw; h.pitch = p.pitch;
    this.hotRefresh(dt);
    if (this.hudOn.life) this.bodyDraw(dt);
  };

  // ---------------------------------------------------------------- ввод
  P.bindCombat = function () {
    bc0.call(this);
    this.bindToy();
  };
  P.bindToy = function () {
    if (!this.ty) return;
    // цифры: пока нет боевого режима, слоты обрабатываем сами; с ним 1–3 ловит combat.js (через наш selectSlot), 4–9 — мы
    this.on(document, 'keydown', (e) => {
      if (e.repeat) return;
      const m = /^Digit([1-9])$/.exec(e.code); if (!m) return;
      const n = Number(m[1]);
      if (this.cb && n <= 3) return;
      this.selectSlot(n - 1);
    });
    // без боевого режима combat.js мышь не слушает: ЛКМ — обнять (активировать), ПКМ — трясти
    this.on(document, 'mousedown', (e) => {
      if (this.cb || this.touch || this.paused || !this.entered || !this.toy) return;
      if (!document.pointerLockElement && e.target !== this.canvas) return;
      if (e.button === 0) this.pressFire(); else if (e.button === 2) this.toyShake();
    });
    // тач: нажатие на слот хотбара
    this.on(this.hb.bar, 'pointerdown', (e) => {
      const s = e.target.closest && e.target.closest('.hb-slot'); if (!s || s.dataset.i === undefined) return;
      e.preventDefault(); this.selectSlot(Number(s.dataset.i));
    });
  };

  // ---------------------------------------------------------------- миссия 1: два модуля калибровки открывают жизнеобеспечение и инвентарь
  const MODS = {
    life: { pos: [-4.4, 1.38, 4.2], color: 0xef4b45, label: 'TAKE LIFE SUPPORT MODULE', toast: 'LIFE SUPPORT ONLINE' },
    gear: { pos: [3.6, 1.18, 4.2], color: 0xffffff, label: 'TAKE INVENTORY MODULE', toast: 'INVENTORY ONLINE' }
  };
  P.calibModules = async function () {
    const r = this, T = window.THREE;
    const need = Object.keys(MODS).filter((k) => !Toys.hud.has(k));
    if (!need.length || r.disposed) return;
    await r.cine([{ sound: 'notification', wait: 0.4 }, { say: ['SYSTEM', 'ОБНАРУЖЕНЫ МОДУЛИ СНАРЯЖЕНИЯ. ВОЗЬМИТЕ ИХ.'], hold: 1.6 }]);
    let got = 0;
    const objective = () => r.objective('COLLECT THE EQUIPMENT MODULES ' + got + '/' + need.length);
    objective();
    const items = {};
    need.forEach((k) => {
      const M = MODS[k], g = new T.Group();
      const core = new T.Mesh(new T.OctahedronGeometry(0.15), new T.MeshBasicMaterial({ color: M.color }));
      const cage = new T.Mesh(new T.OctahedronGeometry(0.2), new T.MeshBasicMaterial({ color: M.color, wireframe: true, transparent: true, opacity: 0.55 }));
      const beam = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 3, 8, 1, true), new T.MeshBasicMaterial({ color: M.color, transparent: true, opacity: 0.1, depthWrite: false, side: T.DoubleSide }));
      beam.position.y = 1.6;
      g.add(core, cage); g.position.set(M.pos[0], M.pos[1], M.pos[2]); r.scene.add(g); beam.position.set(M.pos[0], M.pos[1] + 1.4, M.pos[2]); r.scene.add(beam);
      const hook = (dt) => { g.rotation.y += dt * 1.8; cage.rotation.x += dt * 1.1; g.position.y = M.pos[1] + Math.sin(r.time * 2.4) * 0.05; beam.material.opacity = 0.08 + 0.04 * Math.sin(r.time * 5); };
      r.hooks.push(hook);
      const it = r.interact({ pos: M.pos, label: M.label, reach: 2.4, enabled: () => !r.sig['mod_' + k], use: () => r.signal('mod_' + k) });
      items[k] = { g, beam, hook, it, M };
    });
    r.waypoint(() => MODS[need.find((x) => !r.sig['mod_' + x]) || need[0]].pos, 'MODULE');
    await Promise.all(need.map((k) => r.waitFor('mod_' + k).then(() => {
      const I = items[k];
      got += 1;
      const i = r.hooks.indexOf(I.hook); if (i >= 0) r.hooks.splice(i, 1);
      const j = r.interactables.indexOf(I.it); if (j >= 0) r.interactables.splice(j, 1);
      r.scene.remove(I.g); r.scene.remove(I.beam);
      Toys.hud.grant(k); r.hudOn[k] = true; r.syncHudFlags(true, k);
      r.ensureSnd(); r.snd && r.snd.play('keycard', { k: 0.9 });
      r.glitch && r.glitch(0.35);
      r.toast(I.M.toast, 2.2);
      if (got < need.length) objective();
    })));
    r.waypoint(null);
    r.objective('MODULES INSTALLED');
    await r.cine([{ sound: 'notification', wait: 0.3 }, { say: ['SYSTEM', 'МОДУЛИ УСТАНОВЛЕНЫ. ПРОДОЛЖАЮ КАЛИБРОВКУ.'], hold: 1.6 }]);
  };
}());
