// NEXA: общий набор для миссий 17–47 — взлом (мини-игры), гранаты / светошумовые / C4, ломаемые стены, стелс (охрана, камеры, лазеры),
// снайперская винтовка с оптикой, потоковые музыкальные треки (heistsneak / heistloud), красная пульсация по краям, таймер.
// Только добавляет методы в Run.prototype; существующие миссии 1–16 и HIGH/LOW не затрагивает (всё выключено, пока миссия не вызовет).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.M2 || !C.WEAPONS || !C.cin) return;
  const { Run, WEAPONS, PLAYER_R } = C;
  const { rnd, clamp } = C.M2;
  const P = Run.prototype;
  const TAU = Math.PI * 2;
  const rsel = (a) => a[Math.floor(Math.random() * a.length)];
  const mk = (cls, html) => { const e = document.createElement('div'); e.className = cls; if (html) e.innerHTML = html; return e; };
  function getPad() { try { const l = navigator.getGamepads ? navigator.getGamepads() : []; for (let i = 0; i < l.length; i += 1) if (l[i] && l[i].connected) return l[i]; } catch (e) {} return null; }
  const fmtT = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  // r.target занят полем «цель взаимодействия» (this.target = null), поэтому мишень-сфера доступна под другим именем
  P.shootTarget = P.target;

  // «locked» включает взлом: игрок стоит, пока открыт терминал
  const lockedDesc = Object.getOwnPropertyDescriptor(Run.prototype, 'locked');
  Object.defineProperty(Run.prototype, 'locked', { get() { return lockedDesc.get.call(this) || !!this.hacking; }, configurable: true });

  // ------------------------------------------------------------ снайперская винтовка (модель — в models.js, звук — в sound.js)
  WEAPONS.sniper = Object.assign({}, WEAPONS.ak, {
    name: 'SNIPER RIFLE', tag: ['.308', 'BOLT'], mag: 5, reserve: 25, maxReserve: 40, dmg: 150, rate: 1.05, auto: false, pellets: 1, chamber: false,
    hip: 0.14, ads: 0.0003, bloom: 0, recoil: 0.06, recoilY: 0.01, climb: 0.03, back: 0.12, up: 0.2, shake: 0.01,
    adsFov: 17, adsTime: 0.3, relief: 0.14, reload: 2.8, sound: 'sniper', range: 240,
    anch: { grip: [0, -0.085, -0.01], sup: [0, -0.03, -0.46], muzzle: [0, 0.016, -1.03], rearZ: 0.06, sightY: 0.088 }
  });

  // ------------------------------------------------------------ ввод и HUD набора
  const bindInput0 = P.bindInput;
  P.bindInput = function () {
    bindInput0.call(this);
    this.kitBind();
  };
  P.kitBind = function () {
    const L = this.layer;
    this.gadEl = mk('m-gadget', '<small></small><b></b>'); L.appendChild(this.gadEl);
    this.scopeEl = mk('m-scope', '<i class="h"></i><i class="v"></i>'); L.appendChild(this.scopeEl);
    this.edgeEl = mk('m-edge'); L.appendChild(this.edgeEl);
    const tu = this.qs('.m-touchui');
    if (tu) {
      tu.insertAdjacentHTML('beforeend', '<button type="button" class="m-btn m-gad">G</button><button type="button" class="m-btn m-gsel">H</button><button type="button" class="m-btn m-det">BOOM</button>');
      const wire = (sel, fn) => { const b = this.qs(sel); if (b) this.on(b, 'pointerdown', (e) => { e.preventDefault(); fn(); }); };
      wire('.m-gad', () => this.useGadget()); wire('.m-gsel', () => this.cycleGadget(1)); wire('.m-det', () => this.detonate());
    }
    this.on(document, 'keydown', (e) => {
      if (e.repeat || !this.cb || this.hacking) return;
      if (e.code === 'KeyG') this.useGadget(); else if (e.code === 'KeyH') this.cycleGadget(1); else if (e.code === 'KeyB') this.detonate();
    });
    this.refreshGad();
  };
  // геймпад: B — бросок / установка, D-pad влево — смена гаджета, D-pad вправо — подрыв
  const pollPad0 = P.pollPad;
  P.pollPad = function (dt) {
    pollPad0.call(this, dt);
    if (!this.cb || !this.gad || this.locked || this.paused) return;
    const g = getPad(); if (!g) return;
    const pv = this.kitPad || (this.kitPad = []), b = (i) => !!(g.buttons[i] && g.buttons[i].pressed);
    if (b(1) && !pv[1]) this.useGadget();
    if (b(14) && !pv[14]) this.cycleGadget(-1);
    if (b(15) && !pv[15]) this.detonate();
    pv[1] = b(1); pv[14] = b(14); pv[15] = b(15);
  };

  // ------------------------------------------------------------ гаджеты: осколочная, светошумовая, C4
  const GAD = { frag: { name: 'FRAG' }, flash: { name: 'FLASH' }, c4: { name: 'C4' } };
  const gadAvail = (g, k) => g.n[k] > 0 || (k === 'c4' && g.charges.length > 0);
  P.addGadget = function (id, n) {
    if (!GAD[id]) return;
    const g = this.gad || (this.gad = { sel: id, n: { frag: 0, flash: 0, c4: 0 }, charges: [], thrown: [] });
    g.n[id] += n === undefined ? 1 : n;
    if (!gadAvail(g, g.sel)) g.sel = id;
    this.refreshGad();
    this.toast(GAD[id].name + ' x' + (n === undefined ? 1 : n) + (this.touch ? '' : '   [G] USE  [H] SWITCH'), 2);
  };
  P.gadgetPickup = function (x, z, id, n) {
    const pk = this.pickup(x, z, 'gadget', { id, n: n || 1 });
    pk.box.material = this.basic(0xffffff); pk.box.scale.set(0.28, 0.28, 0.28);
    this.pickupModel && this.pickupModel(pk);
    return pk;
  };
  P.refreshGad = function () {
    const g = this.gad, el = this.gadEl; if (!el) return;
    const any = g && Object.keys(GAD).some((k) => gadAvail(g, k));
    el.classList.toggle('on', !!any);
    ['.m-gad', '.m-gsel', '.m-det'].forEach((s) => { const b = this.qs(s); if (b) b.classList.toggle('on', !!any); });
    const det = this.qs('.m-det'); if (det) det.classList.toggle('on', !!(g && g.charges.length));
    if (!any) return;
    const key = this.padObj && !this.touch ? 'B' : 'G';
    el.querySelector('small').textContent = g.sel === 'c4' ? (g.n.c4 > 0 ? '[' + key + '] PLANT' : '[' + key + '] DETONATE') : '[' + key + '] THROW';
    el.querySelector('b').innerHTML = GAD[g.sel].name + ' <em>x' + (g.sel === 'c4' ? g.n.c4 + (g.charges.length ? ' / ' + g.charges.length + ' SET' : '') : g.n[g.sel]) + '</em>';
    const gs = this.qs('.m-gad'); if (gs) gs.textContent = g.sel === 'c4' ? 'C4' : g.sel === 'frag' ? 'NADE' : 'FLASH';
  };
  P.cycleGadget = function (dir) {
    const g = this.gad; if (!g || this.locked) return;
    const ids = Object.keys(GAD).filter((k) => gadAvail(g, k));
    if (ids.length < 2) return;
    g.sel = ids[(ids.indexOf(g.sel) + (dir || 1) + ids.length) % ids.length];
    this.snd && this.snd.play('click'); this.refreshGad();
  };
  P.useGadget = function () {
    const g = this.gad;
    if (!g || this.locked || this.paused || !this.entered || this.inCinema) return;
    const id = g.sel;
    if (id === 'c4') { if (g.n.c4 > 0) this.plantC4(); else this.detonate(); return; }
    if (g.n[id] <= 0 || this.gadT) return;
    g.n[id] -= 1;
    if (this.startGadgetThrow && this.rg && this.body) this.startGadgetThrow(id); else this.throwGadget(id);
    if (!gadAvail(g, id)) { const o = Object.keys(GAD).find((k) => gadAvail(g, k)); if (o) g.sel = o; }
    this.refreshGad();
  };
  const fwdOf = (r) => { const v = new THREE.Vector3(); r.camera.getWorldDirection(v); return v; };
  P.throwGadget = function (id) {
    const T = THREE, g = this.gad, cam = this.camera.position, f = fwdOf(this);
    const m = new T.Mesh(new T.SphereGeometry(0.075, 8, 6), new T.MeshBasicMaterial({ color: id === 'frag' ? 0x2a2a2a : 0xe0e0e0 }));
    const cap = new T.Mesh(new T.BoxGeometry(0.03, 0.05, 0.03), new T.MeshBasicMaterial({ color: 0xffffff })); cap.position.y = 0.08; m.add(cap);
    m.position.set(cam.x + f.x * 0.5, cam.y - 0.15 + f.y * 0.5, cam.z + f.z * 0.5); this.scene.add(m);
    const sp = 11.5;
    g.thrown.push({ m, id, x: m.position.x, y: m.position.y, z: m.position.z, vx: f.x * sp, vy: f.y * sp + 2.6, vz: f.z * sp, t: 0, fuse: id === 'frag' ? 2.0 : 1.4, tk: 0 });
    this.snd && this.snd.play('throw');
    if (this.snd && id === 'frag') this.snd.play('grenade', { delay: 0.05 }); // чека / звон гранаты
    this.kick(0.015, 0, 0, 0.002);
  };
  const solidAt = (r, x, y, z) => {
    for (const c of r.colliders) {
      if (c.off) continue;
      if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && y > (c.y0 === undefined ? 0 : c.y0) && y < (c.y1 === undefined ? 3.6 : c.y1)) return true;
    }
    return false;
  };
  P.plantC4 = function () {
    const g = this.gad, o = this.camera.position, f = fwdOf(this);
    const hit = this.castRay(o.x, o.y, o.z, f.x, f.y, f.z, 3.4);
    if (hit.kind === 'none') { this.toast('NO SURFACE IN REACH', 1.4); return; }
    const T = THREE, t = Math.max(0.2, hit.t - 0.07);
    const x = o.x + f.x * t, y = o.y + f.y * t, z = o.z + f.z * t;
    const m = new T.Group();
    const body = new T.Mesh(new T.BoxGeometry(0.26, 0.14, 0.07), new T.MeshBasicMaterial({ color: 0x262626 })); m.add(body);
    const led = new T.Mesh(new T.BoxGeometry(0.04, 0.04, 0.08), new T.MeshBasicMaterial({ color: 0xffffff })); led.position.set(0.08, 0.03, 0); m.add(led);
    m.position.set(x, y, z); m.rotation.y = Math.atan2(-f.x, -f.z);
    this.scene.add(m);
    g.n.c4 -= 1; g.charges.push({ x, y, z, m, led, t: 0 });
    this.snd && this.snd.play('c4beep');
    this.toast('C4 PLANTED' + (this.touch ? '' : '  —  [' + (this.padObj ? 'D-PAD >' : 'B') + '] DETONATE'), 2);
    if (g.n.c4 <= 0) { /* остаёмся на C4 — следующее нажатие подрывает */ }
    this.refreshGad();
  };
  P.detonate = function () {
    const g = this.gad;
    if (!g || this.locked || !g.charges.length) return;
    const list = g.charges.splice(0);
    this.refreshGad();
    if (this.breachCam && this.breachCam(list)) return; // катсцена подрыва (cinema2.js) сама вызовет fireCharges
    this.fireCharges(list);
  };
  P.fireCharges = function (list) {
    list.forEach((c, i) => setTimeout(() => {
      if (this.disposed) return;
      c.m.visible = false;
      this.explode(c.x, Math.min(1.2, c.y), c.z, 4.8, 120, 'c4');
    }, i * 140));
  };
  // пошаговая подсказка подрыва ломаемой стены: найти C4 → заложить НА стену → отойти → подорвать (+ маркер на стене); вернуть off()
  P.c4Guide = function (b, setObj, label) {
    const k = this.touch ? { g: 'C4 BUTTON', b: 'DET BUTTON' } : this.padObj ? { g: 'PAD B', b: 'D-PAD RIGHT' } : { g: '[G]', b: '[B]' };
    let st = '';
    this.waypoint([b.x, 1.5, b.z], label || 'GATE');
    const off = this.addHook(() => {
      const g = this.gad;
      if (!g || this.locked || b.broken) return;
      const near = g.charges.some((c) => Math.hypot(Math.max(Math.abs(c.x - b.x) - b.w / 2, 0), Math.max(Math.abs(c.z - b.z) - b.d / 2, 0)) < 3.6);
      const s = g.charges.length ? (near ? 'det' : 'far') : g.n.c4 > 0 ? 'plant' : 'find';
      if (s === st) return;
      st = s;
      setObj(s === 'det' ? 'STEP BACK 5 M — THEN DETONATE ' + k.b : s === 'far' ? 'C4 IS TOO FAR FROM THE WALL — DETONATE ' + k.b + ' AND PLANT A NEW ONE ON THE WALL' : s === 'plant' ? 'WALK UP TO THE WALL, AIM AT IT, PLANT C4 ' + k.g : 'FIND C4 — OR SHOOT THE BARRELS BY THE WALL');
    });
    return () => { off(); this.waypoint(null); };
  };
  P.clearGadgets = function () {
    const g = this.gad; if (!g) return;
    g.thrown.splice(0).forEach((o) => { o.m.visible = false; });
    g.charges.splice(0).forEach((c) => { c.m.visible = false; });
    this.refreshGad();
  };
  // взрывная волна будит охрану: guards.hear(x, z)
  P.alertAt = function (x, z, rad) {
    if (!this.cb) return;
    this.cb.enemies.forEach((e) => { if (e.hear && !e.dead && Math.hypot(e.x - x, e.z - z) < rad) e.hear(x, z); });
  };
  P.flashbangAt = function (x, z) {
    const cb = this.cb, p = this.p;
    this.sparks(x, 0.6, z, 0, 1, 0, 10);
    if (this.snd) { if (this.snd.has('flashbang')) this.snd.play('flashbang', { k: Math.hypot(p.x - x, p.z - z) < 12 ? 1 : 0.6 }); else this.snd.play('boom', { k: 0.5 }); }
    cb.enemies.forEach((e) => {
      if (e.dead || e.t.passive) return;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < 14 && (d < 4 || this.hasLOS(x, 0.6, z, e.x, 1.4, e.z))) { e.stagger = Math.max(e.stagger, 5 - d * 0.18); e.blind = true; if (e.hear) e.hear(x, z); }
    });
    const d = Math.hypot(p.x - x, p.z - z), f = fwdOf(this), dx = x - p.x, dz = z - p.z, l = Math.hypot(dx, dz) || 1;
    const facing = (f.x * dx + f.z * dz) / l > -0.2 || d < 3;
    if (d < 11 && facing && this.hasLOS(x, 0.6, z, p.x, 1.5, p.z)) {
      this.flash(1.8 + 1.4 * (1 - d / 11)); this.stress = Math.min(1, this.stress + 0.2);
      const s = this.snd; if (s && !s.has('flashbang')) s.tone({ t: s.ctx.currentTime, type: 'sine', f0: 3300, dur: 2.4, g: 0.12, a: 0.02 });
    }
  };
  const explode0 = P.explode;
  P.explode = function (x, y, z, R, dmg) {
    explode0.call(this, x, y, z, R, dmg);
    this.breakAt(x, z, R);
    this.alertAt(x, z, R * 5);
  };

  // ломаемые стены (подрыв C4 / гранатой / бочкой)
  P.breakable = function (x, z, w, d, h, col) {
    const m = this.box(x, h / 2, z, w, h, d, col || 0x7c7c7c, true);
    m.userData.col.door = true; // не загораживать реквизитом (props3d)
    const b = { m, x, z, w, d, h, broken: false, col: col || 0x7c7c7c };
    (this.breakables || (this.breakables = [])).push(b);
    return b;
  };
  P.breakAt = function (x, z, R) {
    (this.breakables || []).forEach((b) => {
      if (b.broken) return;
      const dx = Math.max(Math.abs(x - b.x) - b.w / 2, 0), dz = Math.max(Math.abs(z - b.z) - b.d / 2, 0);
      if (Math.hypot(dx, dz) < R * 0.9) this.shatter(b);
    });
  };
  P.shatter = function (b) {
    if (b.broken) return;
    b.broken = true;
    if (b.m.userData.col) b.m.userData.col.off = true;
    b.m.visible = false;
    this.sparks(b.x, 1.2, b.z, 0, 1, 0, 14);
    this.box(b.x, 0.14, b.z, b.w * 0.9 + 0.2, 0.28, b.d * 0.9 + 0.2, b.col, false); // груда обломков
    this.snd && this.snd.play('glass', { k: 0.7 });
    b.onBreak && b.onBreak(b);
    this.signal && this.signal('break:' + (b.id || ''));
  };

  // ------------------------------------------------------------ цикл набора (вызывается из updateCombat)
  const updateCombat0 = P.updateCombat;
  P.updateCombat = function (dt) {
    updateCombat0.call(this, dt);
    if (this.cb) this.updateKit(dt);
  };
  P.updateKit = function (dt) {
    const g = this.gad;
    if (g && !this.paused) {
      for (let i = g.thrown.length - 1; i >= 0; i -= 1) {
        const o = g.thrown[i];
        if (this.cineDepth > 0) break;
        o.t += dt; o.vy -= 9.8 * dt; o.tk -= dt;
        let nx = o.x + o.vx * dt, ny = o.y + o.vy * dt, nz = o.z + o.vz * dt;
        const hitSnd = () => { if (o.tk <= 0) { o.tk = 0.18; this.snd && this.snd.play('thud', { k: 0.6 }); } };
        if (solidAt(this, nx, o.y, o.z)) { o.vx *= -0.35; nx = o.x; o.vz *= 0.8; hitSnd(); }
        if (solidAt(this, o.x, o.y, nz)) { o.vz *= -0.35; nz = o.z; o.vx *= 0.8; hitSnd(); }
        const ceil = this.bounds ? this.bounds.h - 0.1 : 3.3;
        if (ny > ceil) { ny = ceil; o.vy *= -0.3; }
        if (ny < 0.08) { ny = 0.08; if (Math.abs(o.vy) > 1.6) hitSnd(); o.vy *= -0.35; o.vx *= 0.72; o.vz *= 0.72; }
        o.x = nx; o.y = ny; o.z = nz; o.m.position.set(nx, ny, nz); o.m.rotation.x += dt * 9;
        if (o.t >= o.fuse) {
          g.thrown.splice(i, 1); o.m.visible = false;
          if (o.id === 'frag') this.explode(o.x, Math.max(0.4, o.y), o.z, 5.2, 95, 'frag'); else this.flashbangAt(o.x, o.z);
        }
      }
      g.charges.forEach((c) => {
        const was = c.led.visible; c.t += dt; c.led.visible = (c.t % 0.9) < 0.45;
        if (c.led.visible && !was && this.snd) this.snd.play('c4beep', { k: 0.5, dist: Math.hypot(c.x - this.p.x, c.z - this.p.z), at: [c.x, 0.3, c.z] }); // пикает в такт мигающему светодиоду
      });
    }
    // оптика: чёрная виньетка, оружие не рисуется
    const sc = !!(this.wp && this.wp.id === 'sniper' && this.aimK > 0.85 && !this.locked && !this.inCinema);
    if (sc !== this.scoped) { this.scoped = sc; this.scopeEl && this.scopeEl.classList.toggle('on', sc); this.layer.classList.toggle('scoped', sc); }
    if (sc && this.rg) { this.setRigVisible(false); this.rg.handShell.visible = false; }
    // красные края, пульсирующие под сирену
    const E = this.edge;
    if (E && this.edgeEl) {
      const ph = (E.track ? E.track.time() : this.time) - (E.phase || 0);
      const k = 0.5 + 0.5 * Math.sin(ph / E.period * TAU - Math.PI / 2);
      this.edgeEl.style.opacity = String(Math.round((E.min + (E.max - E.min) * k * k) * 100) / 100);
    }
    this.ammoGuard(dt);
    if (this.kitUpd) this.kitUpd.forEach((f) => f(dt));
  };
  // страховка от тупика: всё оружие пустое, враги живы, патронов на карте нет → через 6 с «выброс снабжения» перед игроком
  P.ammoGuard = function (dt) {
    const cb = this.cb;
    if (!cb || this.locked || this.paused || this.dead || this.cineDepth > 0 || !this.entered || !this.inv || !this.inv.length) return;
    this.agT = (this.agT || 0) + dt;
    if (this.agT < 1) return;
    this.agT = 0;
    const empty = this.inv.every((w) => w.mag + w.reserve <= 0);
    if (!empty || !cb.enemies.some((e) => !e.dead && !e.friendly && !(e.t && e.t.passive)) || cb.pickups.some((k) => k.kind === 'ammo')) { this.agN = 0; return; }
    this.agN = (this.agN || 0) + 1;
    if (this.agN < 6) return;
    this.agN = 0;
    const w = this.inv.find((x) => x.id !== 'sniper') || this.inv[0], p = this.p;
    let x = p.x, z = p.z;
    for (const a of [0, 0.6, -0.6, 1.2, -1.2, 2.4, -2.4, 3.1]) {
      const h = p.yaw + a, cx = p.x - Math.sin(h) * 2.6, cz = p.z - Math.cos(h) * 2.6;
      if (!this.blocked(cx, cz)) { x = cx; z = cz; break; }
    }
    this.pickup(x, z, 'ammo', { id: w.id, amount: Math.ceil(w.def.maxReserve * 0.5) });
    this.toast('SUPPLY DROP: AMMO', 2.2);
  };
  // красные пульсирующие края и более широкий угол обзора (ограбление); о: { period, track, phase, min, max, fov }
  P.redPulse = function (on, o) {
    o = o || {};
    if (!this.edgeEl) return;
    if (!on) { this.edge = null; this.edgeEl.style.opacity = '0'; this.edgeEl.classList.remove('on'); if (this.edgeFov) { this.baseFov -= this.edgeFov; this.edgeFov = 0; } return; }
    this.edge = { period: o.period || 1.1, track: o.track || null, phase: o.phase || 0, min: o.min === undefined ? 0.12 : o.min, max: o.max === undefined ? 0.95 : o.max };
    this.edgeEl.classList.add('on');
    if (o.fov && !this.edgeFov) { this.edgeFov = o.fov; this.baseFov += o.fov; }
  };

  // ------------------------------------------------------------ чекпоинты: гаджеты и взломы не переживают смерть
  const phase0 = P.phase;
  P.phase = function (name, fn, skip) {
    const self = this, snapG = this.gad ? Object.assign({}, this.gad.n) : null;
    let first = true;
    return phase0.call(this, name, function (r) {
      if (!first) { self.clearGadgets(); if (snapG && self.gad) { Object.assign(self.gad.n, snapG); self.refreshGad(); } }
      first = false;
      return fn(r);
    }, skip);
  };
  const hurt0 = P.hurt;
  P.hurt = function (amt, fx, fz) {
    if (this.hacking && this.hackAbort && !this.dead && !this.god && this.cineDepth <= 0) { this.hackAbort(); this.toast('CONNECTION LOST — YOU WERE HIT', 1.8); }
    return hurt0.call(this, amt, fx, fz);
  };
  const disposeCombat0 = P.disposeCombat;
  P.disposeCombat = function () {
    try { this.hackAbort && this.hackAbort(true); } catch (e) {}
    Object.keys(this.kitTracks || {}).forEach((k) => this.kitTracks[k].dispose());
    return disposeCombat0.call(this);
  };

  // ------------------------------------------------------------ взлом: мини-игры терминала
  // r.hack({ kind: 'seq' | 'sync' | 'match', title, len, tries, time }) -> Promise<boolean>
  // seq — запомнить и повторить последовательность стрелок; sync — остановить бегунок в зелёной зоне; match — найти код среди похожих
  const ARR = [{ s: '▲', k: ['ArrowUp', 'KeyW'], pad: [12, 3] }, { s: '▶', k: ['ArrowRight', 'KeyD'], pad: [15, 1] }, { s: '▼', k: ['ArrowDown', 'KeyS'], pad: [13, 0] }, { s: '◀', k: ['ArrowLeft', 'KeyA'], pad: [14, 2] }];
  P.hack = function (o) {
    o = o || {};
    if (this.hacking || this.disposed) return Promise.resolve(false);
    const self = this, kind = o.kind || 'seq', len = o.len || 4;
    return new Promise((resolve) => {
      this.hacking = true; this.syncLock();
      this.fireHeld = false; this.padFire = false; this.aimWant = false; this.keys = {};
      if (!this.touch && document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) {} }
      const root = mk('m-hack', '<div class="hk-box"><div class="hk-head"><b></b><span></span></div><div class="hk-body"></div><div class="hk-foot"></div></div>');
      this.layer.appendChild(root);
      const $ = (s) => root.querySelector(s), body = $('.hk-body'), foot = $('.hk-foot'), head = $('.hk-head b'), sub = $('.hk-head span');
      head.textContent = o.title || 'TERMINAL ACCESS';
      let tries = o.tries || 3, done = false, step = null, timer = 0;
      const snd = (n, k) => { self.snd && self.snd.play(n, { k: k || 1 }); };
      const ctl = [];
      const onKey = (e) => {
        if (e.code === 'Escape') { e.preventDefault(); end(false, true); return; }
        if (step && step.key) { const h = step.key(e); if (h) e.preventDefault(); }
      };
      document.addEventListener('keydown', onKey, true);
      const pv = [];
      const poll = setInterval(() => {
        if (done) return;
        const g = getPad(); if (!g) return;
        const b = (i) => !!(g.buttons[i] && g.buttons[i].pressed);
        if (step && step.pad) for (let i = 0; i < 16; i += 1) if (b(i) && !pv[i]) step.pad(i);
        for (let i = 0; i < 16; i += 1) pv[i] = b(i);
      }, 40);
      const tick = setInterval(() => { if (!done && !self.paused && step && step.tick) step.tick(0.04); }, 40);
      function end(ok, quiet) {
        if (done) return;
        done = true; clearInterval(poll); clearInterval(tick);
        document.removeEventListener('keydown', onKey, true);
        self.hackAbort = null;
        const fin = () => {
          root.remove(); self.hacking = false;
          if (!self.disposed) { self.syncLock(); if (!self.touch && !quiet) self.requestLock(); }
          resolve(ok);
        };
        if (quiet) { fin(); return; }
        body.innerHTML = '<div class="hk-big ' + (ok ? 'ok' : 'bad') + '">' + (ok ? 'ACCESS GRANTED' : 'ACCESS DENIED') + '</div>';
        foot.textContent = ok ? 'SECURITY LAYER BYPASSED' : 'TRACE STARTED';
        snd(ok ? (self.snd && self.snd.has('keycard') ? 'keycard' : 'ok') : 'bad'); // доступ получен — писки ключ-карты
        setTimeout(fin, ok ? 650 : 900);
      }
      this.hackAbort = (quiet) => end(false, quiet === true || quiet === undefined ? quiet === true : true);
      const lose = (why) => { tries -= 1; sub.textContent = 'TRIES ' + '■'.repeat(Math.max(0, tries)) + '□'.repeat(Math.max(0, (o.tries || 3) - tries)); snd('bad', 0.7); foot.textContent = why; };
      const bar = (cls) => '<div class="hk-bar ' + (cls || '') + '"><i></i></div>';
      sub.textContent = 'TRIES ' + '■'.repeat(tries);

      // ---- seq
      const seq = () => {
        const sq = []; for (let i = 0; i < len; i += 1) sq.push(Math.floor(Math.random() * 4));
        let phase = 'show', pos = 0, t = 0;
        const showT = 1.0 + len * 0.55, limit = o.time || (len * 1.7 + 3);
        const draw = () => {
          const row = sq.map((v, i) => '<span class="' + (phase === 'show' ? 'on' : i < pos ? 'on' : '') + '">' + (phase === 'show' || i < pos ? ARR[v].s : '·') + '</span>').join('');
          body.innerHTML = '<div class="hk-line">' + (phase === 'show' ? 'MEMORIZE THE KEY SEQUENCE' : 'ENTER THE SEQUENCE') + '</div><div class="hk-seq">' + row + '</div>' + bar(phase === 'show' ? '' : 'hot') +
            '<div class="hk-pad"><button data-d="0">▲</button><button data-d="3">◀</button><button data-d="1">▶</button><button data-d="2">▼</button></div>';
          body.querySelectorAll('.hk-pad button').forEach((b) => { b.addEventListener('pointerdown', (e) => { e.preventDefault(); press(+b.dataset.d); }); });
        };
        const press = (d) => {
          if (phase !== 'input') return;
          if (d === sq[pos]) { pos += 1; snd('tick'); if (pos >= sq.length) { end(true); return; } draw(); }
          else { lose('WRONG KEY'); if (tries <= 0) { end(false); return; } restart(); }
        };
        const restart = () => { sq.length = 0; for (let i = 0; i < len; i += 1) sq.push(Math.floor(Math.random() * 4)); phase = 'show'; pos = 0; t = 0; draw(); };
        step = {
          key: (e) => { const d = ARR.findIndex((a) => a.k.indexOf(e.code) >= 0); if (d >= 0) { press(d); return true; } return false; },
          pad: (i) => { const d = ARR.findIndex((a) => a.pad.indexOf(i) >= 0); if (d >= 0) press(d); },
          tick: (dt) => {
            t += dt;
            const lim = phase === 'show' ? showT : limit, i = body.querySelector('.hk-bar i');
            if (i) i.style.width = Math.round((phase === 'show' ? t / lim : 1 - t / lim) * 100) + '%';
            if (phase === 'show' && t >= showT) { phase = 'input'; t = 0; pos = 0; draw(); foot.textContent = touchHint(); }
            else if (phase === 'input' && t >= limit) { lose('TIMEOUT'); if (tries <= 0) end(false); else restart(); }
          }
        };
        restart(); foot.textContent = 'WATCH CLOSELY';
      };
      const touchHint = () => (self.touch ? 'TAP THE ARROWS' : self.padObj ? 'D-PAD / FACE BUTTONS' : 'ARROW KEYS / WASD');

      // ---- sync
      const sync = () => {
        let hits = 0, x = 0, dir = 1, speed = 0.85, w = 0.26, c = rnd(0.25, 0.75), lock = 0;
        const draw = () => {
          body.innerHTML = '<div class="hk-line">STOP THE SIGNAL INSIDE THE WINDOW  ' + hits + ' / ' + len + '</div>' +
            '<div class="hk-track"><u style="left:' + Math.round((c - w / 2) * 100) + '%;width:' + Math.round(w * 100) + '%"></u><i style="left:0%"></i></div>' +
            '<button type="button" class="hk-btn">LOCK</button>';
          body.querySelector('.hk-btn').addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
          mark = body.querySelector('.hk-track i');
        };
        let mark = null;
        const press = () => {
          if (lock > 0) return;
          if (Math.abs(x - c) <= w / 2) { hits += 1; snd('lockpick', 0.9); if (hits >= len) { end(true); return; } w = Math.max(0.08, w * 0.82); c = rnd(0.15, 0.85); speed *= 1.14; lock = 0.25; draw(); }
          else { lose('MISSED'); lock = 0.5; if (tries <= 0) end(false); }
        };
        step = {
          key: (e) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyE') { press(); return true; } return false; },
          pad: (i) => { if (i === 0 || i === 2 || i === 7) press(); },
          tick: (dt) => { lock = Math.max(0, lock - dt); x += dir * speed * dt; if (x > 1) { x = 1; dir = -1; } else if (x < 0) { x = 0; dir = 1; } if (mark) mark.style.left = Math.round(x * 100) + '%'; }
        };
        draw(); foot.textContent = self.touch ? 'TAP LOCK' : self.padObj ? '[A] LOCK' : '[SPACE] LOCK';
      };

      // ---- match
      const match = () => {
        let round = 0, t = 0, sel = 0, cells = [], answer = 0;
        const limit = o.time || 6, HEX = '0123456789ABCDEF';
        const code = () => { let s = ''; for (let i = 0; i < 4; i += 1) s += HEX[Math.floor(Math.random() * 16)]; return s; };
        const next = () => {
          const target = code(); answer = Math.floor(Math.random() * 9); cells = [];
          for (let i = 0; i < 9; i += 1) {
            if (i === answer) { cells.push(target); continue; }
            const a = target.split(''), k = Math.floor(Math.random() * 4); let ch; do ch = HEX[Math.floor(Math.random() * 16)]; while (ch === a[k]);
            a[k] = ch; if (Math.random() < 0.4) { const j = (k + 1 + Math.floor(Math.random() * 3)) % 4; a[j] = HEX[Math.floor(Math.random() * 16)]; }
            const s = a.join(''); cells.push(s === target ? target.split('').reverse().join('') : s);
          }
          t = 0; sel = 0;
          body.innerHTML = '<div class="hk-line">FIND THE EXACT KEY  ' + (round + 1) + ' / ' + len + '</div><div class="hk-target">' + target + '</div>' + bar('hot') +
            '<div class="hk-grid">' + cells.map((s, i) => '<button type="button" data-i="' + i + '" class="' + (i === sel ? 'sel' : '') + '">' + s + '</button>').join('') + '</div>';
          body.querySelectorAll('.hk-grid button').forEach((b) => { b.addEventListener('pointerdown', (e) => { e.preventDefault(); pick(+b.dataset.i); }); });
        };
        const mark = () => body.querySelectorAll('.hk-grid button').forEach((b, i) => b.classList.toggle('sel', i === sel));
        const pick = (i) => {
          if (i === answer) { round += 1; snd('tick'); if (round >= len) { end(true); return; } next(); }
          else { lose('MISMATCH'); if (tries <= 0) end(false); else next(); }
        };
        const move = (dx, dy) => { sel = clamp((sel % 3) + dx, 0, 2) + clamp(Math.floor(sel / 3) + dy, 0, 2) * 3; mark(); snd('click', 0.5); };
        step = {
          key: (e) => {
            const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] }[e.code];
            if (m) { move(m[0], m[1]); return true; }
            if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') { pick(sel); return true; }
            if (/^Digit[1-9]$/.test(e.code)) { pick(+e.code.slice(5) - 1); return true; }
            return false;
          },
          pad: (i) => { if (i === 12) move(0, -1); else if (i === 13) move(0, 1); else if (i === 14) move(-1, 0); else if (i === 15) move(1, 0); else if (i === 0) pick(sel); },
          tick: (dt) => { t += dt; const b = body.querySelector('.hk-bar i'); if (b) b.style.width = Math.round((1 - t / limit) * 100) + '%'; if (t >= limit) { lose('TIMEOUT'); if (tries <= 0) end(false); else next(); } }
        };
        next(); foot.textContent = self.touch ? 'TAP THE MATCHING KEY' : self.padObj ? (window.PadGlyph ? window.PadGlyph.fmt('D-PAD + [A]') : 'D-PAD + [A]') : 'MOUSE / ARROWS + ENTER / 1-9';
      };
      if (kind === 'sync') sync(); else if (kind === 'match') match(); else seq();
      ctl.length = 0;
      timer = 0;
    });
  };
  // терминал в мире: подойти, нажать E — мини-игра; Promise завершается после успеха (после провала — onFail и можно повторить)
  P.terminal = function (x, z, o) {
    o = o || {};
    const face = o.face || 'z+', ax = face[0] === 'x', sg = face[1] === '-' ? -1 : 1;
    this.box(x, 0.5, z, ax ? 0.7 : 1, 1, ax ? 1 : 0.7, 0x333333, true);
    this.termDress && this.termDress(x, z, ax, sg);
    const scr = this.strip(x + (ax ? sg * 0.36 : 0), 0.95, z + (ax ? 0 : sg * 0.36), ax ? 0.04 : 0.7, 0.35, ax ? 0.7 : 0.04, 0x555555);
    const st = { busy: false, done: false, scr };
    st.promise = new Promise((res) => {
      const it = this.interact({
        pos: [x, 1.1, z], label: o.label || 'HACK TERMINAL', reach: o.reach || 3, enabled: () => !st.busy && !st.done,
        use: async () => {
          st.busy = true; scr.material = this.basic(0xffffff);
          const ok = await this.hack(o);
          st.busy = false;
          if (this.disposed) return;
          if (ok) { st.done = true; const i = this.interactables.indexOf(it); if (i >= 0) this.interactables.splice(i, 1); scr.material = this.basic(0xffffff); o.onDone && o.onDone(); res(true); }
          else { scr.material = this.basic(0x555555); o.onFail && o.onFail(this); }
        }
      });
    });
    return st;
  };

  // ------------------------------------------------------------ таймер миссии (баннер сверху)
  P.countdown = function (secs, label, o) {
    o = o || {};
    const st = { left: secs, on: true };
    const off = this.addHook((dt) => {
      if (!st.on || this.locked) return;
      st.left -= dt;
      this.banner((label || 'TIME') + '  ' + fmtT(st.left), st.left < 15);
      if (st.left <= 0) { st.stop(); if (o.onExpire) o.onExpire(this); else this.fail('TIME EXPIRED'); }
    });
    st.stop = () => { st.on = false; off(); this.banner(null); };
    return st;
  };

  // ------------------------------------------------------------ потоковые треки (assets/<name>.mp3): heistsneak, heistloud
  P.musicTrack = function (name, o) {
    o = o || {};
    const T = this.kitTracks || (this.kitTracks = {});
    if (T[name]) return T[name];
    const snd = this.snd, self = this;
    const el = new Audio('assets/' + name + '.mp3');
    el.loop = o.loop !== false; el.preload = 'auto';
    let g = null, routed = false, failed = false;
    el.addEventListener('error', () => { failed = true; });
    if (snd && location.protocol !== 'file:') {
      try { const s = snd.ctx.createMediaElementSource(el); g = snd.ctx.createGain(); g.gain.value = 0; s.connect(g); g.connect(snd.dest || snd.ctx.destination); routed = true; } catch (e) { g = null; }
    }
    el.volume = routed ? 1 : 0;
    const tr = { el, vol: o.vol === undefined ? 1 : o.vol, mix: 0, want: 0, fin: 0.8, fout: 1, an: null, pending: 0 };
    const vol = () => clamp((snd ? snd.musVol() : 0.5) * tr.vol * tr.mix * (self.vDuck === undefined ? 1 : self.vDuck), 0, 1);   // vDuck: приглушение под голосом (voice.js)
    tr.timer = setInterval(() => {
      const dt = 0.05;
      tr.mix = clamp(tr.mix + (tr.want ? dt / tr.fin : -dt / tr.fout), 0, 1);
      const held = self.paused || self.disposed;
      if (tr.want && !held && el.paused && !failed && performance.now() > tr.pending) {
        tr.pending = performance.now() + 900;
        if (snd && snd.ctx.state === 'suspended') snd.ctx.resume().catch(() => {});
        const p = el.play(); if (p && p.catch) p.catch(() => {});
      } else if ((held || (!tr.want && tr.mix <= 0)) && !el.paused) el.pause();
      const v = vol();
      if (g) g.gain.value = v; else el.volume = v;
    }, 50);
    tr.play = (fade, restart) => { tr.want = 1; tr.fin = fade || 0.8; if (restart) { try { el.currentTime = 0; } catch (e) {} } return tr; };
    tr.stop = (fade) => { tr.want = 0; tr.fout = Math.max(0.05, fade === undefined ? 1 : fade); return tr; };
    tr.time = () => el.currentTime || 0;
    tr.dispose = () => { clearInterval(tr.timer); try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) {} delete T[name]; };
    T[name] = tr;
    return tr;
  };

  // ------------------------------------------------------------ стелс: охрана, камеры, лазеры, обнаружение, тревога
  // const S = r.stealth({ onAlarm(S), suppressed }); S.guard([[x,z],[x,z]...]); S.camera(x,y,z, yawA, yawB); S.laser([x,z],[x,z],{id,sweep,blink});
  // S.begin(carry) запускает обнаружение (в начале каждой phase), S.stop() выключает; S.disable(id) гасит лазеры/камеры группы; S.alarmNow().
  P.stealth = function (opt) {
    opt = opt || {};
    const r = this, T = THREE;
    const S = { r, det: 0, alarm: false, items: [], t0: 0, on: false, kills: 0, onAlarm: opt.onAlarm || null };
    const guards = () => r.cb.enemies.filter((e) => e.guard && !e.dead);
    S.guards = guards;
    S.raise = (v) => { if (S.alarm || r.locked) return; S.det = Math.min(1, S.det + v); if (S.det >= 1) S.alarmNow(); };
    S.alarmNow = (why) => {
      if (S.alarm) return;
      S.alarm = true;
      r.banner('ALARM — GUARDS ALERTED', true);
      r.snd && r.snd.play('alarm'); r.flash(0.3);
      guards().forEach((q) => { q.n.armT = 1; q.unaware = false; });
      S.onAlarm && S.onAlarm(S, why);
    };
    const guardAI = (q, dt, run, dist) => {
      if (S.alarm) { q.n.armT = 1; q.unaware = false; return false; }
      const n = q.n, g = n.g;
      if (q.stagger > 0) { q.stagger -= dt; n.creeping = false; return true; }
      q.hold -= dt;
      let tx, tz, spd = 1.35;
      if (q.inv) {
        tx = q.inv[0]; tz = q.inv[1]; spd = 2.3; q.invT -= dt;
        if (q.invT <= 0 || Math.hypot(tx - g.position.x, tz - g.position.z) < 1) { q.inv = null; q.hold = 1.8; }
      } else {
        const w = q.path[q.pi]; tx = w[0]; tz = w[1];
        if (Math.hypot(tx - g.position.x, tz - g.position.z) < 0.5) { q.pi = (q.pi + 1) % q.path.length; q.hold = q.path.length > 1 ? 1.1 : 99; }
      }
      if (q.hold > 0) { n.creeping = false; n.yaw += Math.sin(run.time * 1.4 + q.ph) * dt * 0.9; return true; }
      const dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz) || 1;
      n.yaw = Math.atan2(dx, dz);
      const nx = g.position.x + dx / d * spd * dt, nz = g.position.z + dz / d * spd * dt;
      if (!run.blockedE(nx, g.position.z)) g.position.x = nx;
      if (!run.blockedE(g.position.x, nz)) g.position.z = nz;
      n.creeping = true;
      return true;
    };
    S.guard = (path, o) => {
      o = o || {};
      const p1 = path[1] || [path[0][0], path[0][1] + 1];
      const q = r.enemy(o.type || 'grunt', path[0][0], path[0][1], { hp: o.hp || 0.5, drop: !!o.drop, ai: guardAI, yaw: Math.atan2(p1[0] - path[0][0], p1[1] - path[0][1]), gun: o.gun, exact: true });
      q.guard = true; q.path = path; q.pi = path.length > 1 ? 1 : 0; q.hold = path.length > 1 ? rnd(0, 1) : 99; q.ph = rnd(0, 6); q.unaware = true; q.range = o.range || 15; q.stand = path.length === 1;
      if (q.stand) q.baseYaw = q.n.yaw;
      q.hear = (x, z) => { if (S.alarm || q.dead) return; q.inv = [x === undefined ? r.p.x : x, z === undefined ? r.p.z : z]; q.invT = 4; q.hold = 0; S.det = Math.min(1, S.det + 0.12); };
      if (o.takedown !== false) {
        const it = r.interact({
          pos: [path[0][0], 1.2, path[0][1]], label: 'TAKEDOWN', reach: 1.9,
          enabled: () => {
            if (q.dead || S.alarm || !q.n.g.visible) return false;
            const g = q.n.g.position, dx = r.p.x - g.x, dz = r.p.z - g.z, d = Math.hypot(dx, dz) || 1;
            return d < 2.1 && (dx * Math.sin(q.n.yaw) + dz * Math.cos(q.n.yaw)) / d < 0.35;
          },
          use: () => { r.snd && r.snd.play('thud'); r.damageEnemy(q, 9999, false); S.kills += 1; r.noise(3); }
        });
        q.takeIt = it;
      }
      return q;
    };
    // камера наблюдения: вращается между yawA и yawB, видит конусом
    S.camera = (x, y, z, yawA, yawB, o) => {
      o = o || {};
      const g = new T.Group(); g.position.set(x, y, z);
      const body = new T.Mesh(r.g.box, r.basic(0x151515)); body.scale.set(0.22, 0.2, 0.4); g.add(body);
      const lens = new T.Mesh(r.g.box, r.basic(0xffffff)); lens.scale.set(0.08, 0.08, 0.04); lens.position.z = 0.21; g.add(lens);
      const range = o.range || 13, half = o.half || 0.5;
      const cg = new T.ConeGeometry(Math.tan(half) * range, range, 14, 1, true); cg.translate(0, -range / 2, 0); cg.rotateX(-Math.PI / 2);
      const cone = new T.Mesh(cg, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.09, depthWrite: false, side: T.DoubleSide })); cone.renderOrder = 4; g.add(cone);
      r.scene.add(g);
      const c = { kind: 'cam', id: o.id, g, lens, cone, x, y, z, a: yawA, b: yawB, per: o.period || 6, ph: rnd(0, 6), range, half, off: false, yaw: yawA };
      if (o.shootable !== false) c.tg = r.shootTarget(x, y, z, 0.3, { onDeath: () => { S.disable(c); S.raise(0.3); }, hp: 25 });
      if (c.tg) c.tg.m.visible = false;
      S.items.push(c);
      return c;
    };
    // лазерная растяжка: p0 -> p1 (x,z); sweep — луч ездит туда-сюда; blink — мигает
    S.laser = (p0, p1, o) => {
      o = o || {};
      const hs = o.heights || [0.35, 0.95, 1.55], g = new T.Group(), len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      hs.forEach((h) => { const m = new T.Mesh(r.g.box, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false })); m.scale.set(0.025, 0.025, len); m.position.set(0, h, 0); g.add(m); });
      g.position.set((p0[0] + p1[0]) / 2, 0, (p0[1] + p1[1]) / 2); g.rotation.y = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);
      r.scene.add(g);
      const l = { kind: 'laser', id: o.id, g, p0, p1, len, off: false, sweep: o.sweep || null, blink: o.blink || 0, ph: rnd(0, 6), cx: g.position.x, cz: g.position.z, hs };
      S.items.push(l);
      return l;
    };
    S.disable = (what) => {
      S.items.forEach((i) => { if (i === what || (typeof what === 'string' && i.id === what)) { i.off = true; i.g.visible = false; if (i.kind === 'cam' && i.tg) i.tg.remove(); } });
    };
    S.enable = (what) => { S.items.forEach((i) => { if (i === what || (typeof what === 'string' && i.id === what)) { i.off = false; i.g.visible = true; } }); };
    S.clear = () => { S.items.forEach((i) => { i.g.visible = false; i.off = true; if (i.tg) i.tg.remove(); }); S.items.length = 0; };
    const update = (dt) => {
      const t = r.time, p = r.p;
      S.items.forEach((i) => {
        if (i.off) return;
        if (i.kind === 'cam') { const k = 0.5 - 0.5 * Math.cos(((t + i.ph) / i.per) * TAU); i.yaw = i.a + (i.b - i.a) * k; i.g.rotation.set(0.28, i.yaw, 0, 'YXZ'); }
        else {
          if (i.sweep) { const k = 0.5 - 0.5 * Math.cos(((t + i.ph) / i.sweep.per) * TAU); i.g.position.set(i.cx + i.sweep.dx * (k - 0.5), 0, i.cz + i.sweep.dz * (k - 0.5)); }
          i.live = i.blink ? ((t + i.ph) % i.blink) < i.blink * 0.62 : true;
          i.g.visible = i.live;
        }
      });
      if (!S.on || r.locked || S.alarm) return;
      let rate = 0, camSeen = false;
      const mul = p.moving < 0.1 ? 0.55 : (r.keys.ShiftLeft || r.keys.ShiftRight || r.runHeld || r.padRun) ? 1.35 : 1;
      if (t >= S.t0 + 3.5) {
        guards().forEach((q) => {
          if (q.stagger > 0) return;
          const g = q.n.g, dx = p.x - g.position.x, dz = p.z - g.position.z, d = Math.hypot(dx, dz) || 0.001;
          if (d > q.range || !q.los) return;
          const cosA = (dx * Math.sin(q.n.yaw) + dz * Math.cos(q.n.yaw)) / d;
          if (cosA > 0.55 || d < 1.8) rate += (0.3 + (1 - d / q.range) * 1.5) * mul;
        });
        S.items.forEach((i) => {
          if (i.off || i.kind !== 'cam') return;
          const dx = p.x - i.x, dz = p.z - i.z, d = Math.hypot(dx, dz) || 0.001;
          if (d > i.range) return;
          const ang = Math.abs(((Math.atan2(dx, dz) - i.yaw + Math.PI * 3) % TAU) - Math.PI);
          if (ang < i.half && r.hasLOS(i.x, i.y, i.z, p.x, 1.4, p.z)) { rate += (0.7 + (1 - d / i.range) * 0.8) * mul; camSeen = true; }
        });
        // тела: охранник, увидевший труп, поднимает тревогу
        r.cb.enemies.forEach((b) => {
          if (!b.dead || !b.guard || b.found) return;
          guards().forEach((q) => {
            if (b.found) return;
            const dx = b.x - q.n.g.position.x, dz = b.z - q.n.g.position.z, d = Math.hypot(dx, dz) || 1;
            if (d < 9 && (dx * Math.sin(q.n.yaw) + dz * Math.cos(q.n.yaw)) / d > 0.5 && r.hasLOS(q.n.g.position.x, 1.5, q.n.g.position.z, b.x, 0.4, b.z)) { b.found = true; q.inv = [b.x, b.z]; q.invT = 5; q.hold = 0; S.det = Math.min(1, S.det + 0.5); r.toast('BODY FOUND', 1.4); }
          });
        });
      }
      S.items.forEach((i) => {
        if (i.off || i.kind !== 'laser' || !i.live) return;
        const gx = i.g.position.x, gz = i.g.position.z, ux = Math.sin(i.g.rotation.y), uz = Math.cos(i.g.rotation.y);
        const rx = p.x - gx, rz = p.z - gz, along = rx * ux + rz * uz, side = Math.abs(rx * uz - rz * ux);
        if (Math.abs(along) < i.len / 2 + 0.1 && side < 0.28) { rate += 99; r.toast('LASER TRIPPED', 1.2); }
      });
      // стоящие охранники смотрят по сторонам
      guards().forEach((q) => { if (q.stand && !q.inv && !S.alarm) q.n.yaw = q.baseYaw + Math.sin(t * 0.6 + q.ph) * 0.9; });
      if (camSeen && t >= (S.camBeep || 0)) { S.camBeep = t + 1.1; r.snd && r.snd.has('camerabeep') && r.snd.play('camerabeep'); } // камера держит игрока в кадре — тревожный писк
      S.det = clamp(S.det + (rate ? rate * dt : -0.18 * dt), 0, 1);
      if (S.det > 0.02) r.banner('DETECTION  ' + Math.round(S.det * 100) + '%', S.det > 0.6); else r.banner(null);
      if (S.det >= 1) S.alarmNow();
    };
    S.begin = (carry) => {
      S.det = 0; S.t0 = r.time; S.alarm = !!carry; S.on = true;
      if (opt.suppressed !== false) r.suppressed = true;
      r.banner(carry ? 'ALARM — GUARDS ALERTED' : null, !!carry);
      if (!r.kitUpd) r.kitUpd = [];
      if (r.kitUpd.indexOf(update) < 0) r.kitUpd.push(update);
    };
    S.stop = (keepAnim) => { S.on = false; if (!keepAnim && r.kitUpd) { const i = r.kitUpd.indexOf(update); if (i >= 0) r.kitUpd.splice(i, 1); } if (opt.suppressed !== false) r.suppressed = false; r.banner(null); };
    return S;
  };
}());
