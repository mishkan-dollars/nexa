// NEXA: 3D-стол HIGH / LOW. Вне сюжета игрок и субъекты сидят за одним столом, у каждого ноутбук с тем же интерфейсом (tablescreen.js).
// Наведи прицел на дисплей ноутбука и нажми ЛКМ; чтобы вписать число — K (стикман кладёт руки на клавиатуру).
// Проигравший (чьё число угадали): охранник подходит и стреляет в голову. Если угадали число игрока — катсцена от первого лица, цитата и возврат в лобби.
// Движок игры (game.js) не меняется: стол — это 3D-интерфейс поверх того же GameManager (app.js пересылает сюда события).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.actors || !C.makeSound || !window.HLScreen || !window.HighLow) return;
  const { MISSIONS, lerp, smooth, wrap } = C;
  const HL = window.HighLow, PH = HL.PHASES, SCR = window.HLScreen, CW = SCR.W, CH = SCR.H;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PI = Math.PI;
  const expk = (dt, k) => 1 - Math.exp(-dt * k);

  // ------------------------------------------------------------------ геометрия стола (система координат места игрока = мировая: игрок на +Z, смотрит на −Z)
  const R_SEAT = 1.42;                         // расстояние от центра стола до стула / бёдер стикмена
  const TABLE_R = 1.2, TABLE_Y = 0.76;
  const SIT_Y = -0.4;                          // сдвиг группы стикмена вниз: таз на высоте сиденья
  const LAP_Z = 0.84, LID_TILT = 0.26;         // положение петли ноутбука и наклон крышки
  const SW = 0.42, SH = SW * CH / CW;          // размер дисплея, м
  const SHOULDER = [[-0.2, 0.46, 0], [0.2, 0.46, 0]];
  const FREE = { x: 0, y: 1.26, z: 1.18, fov: 68 };
  const FOCUS = { x: 0, y: 1.0, z: 1.14, fov: 55 };
  const TYPE = { x: 0, y: 1.1, z: 1.17, fov: 62 };
  const TYPE_LOOK = [0, 0.92, 0.8];
  const CORNERS = [[-4.4, -4.4], [4.4, -4.4], [-4.4, 4.4], [4.4, 4.4]];

  const LT = (s) => (window.I18N ? I18N.t(s) : s);
  const subLabel = (id) => { const f = SCR.label, t = f && f(id); return t || 'SUBJECT ' + id; };
  let S = null;        // сессия стола (одна за раз)
  let T = null;        // временные объекты THREE (создаются лениво: three.js подгружается позже скрипта)
  const tt = () => T || (T = {
    a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), dir: new THREE.Vector3(), hit: new THREE.Vector3(), eye: new THREE.Vector3()
  });
  const lookYP = (f, t, o) => { const dx = t.x - f.x, dy = t.y - f.y, dz = t.z - f.z; o.yaw = Math.atan2(-dx, -dz); o.pitch = Math.atan2(dy, Math.hypot(dx, dz)); return o; };
  const real = (ms) => new Promise((res) => setTimeout(res, ms));

  // ------------------------------------------------------------------ вспомогательные текстуры
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  // ------------------------------------------------------------------ состояние ввода/вида
  const V = { yaw: 0, pitch: -0.3, f: 0, typ: 0, engaged: false };
  const D = { on: false, w: 0, pos: null, yaw: 0, pitch: 0, fov: 60, roll: 0, tr: 0 };       // «режиссёр»: камера катсцены
  const disp = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 60 };              // что показано сейчас
  const P = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 60 };                 // поза игрока
  const FY = { yaw: 0, pitch: 0 }, TY = { yaw: 0, pitch: 0 };                // углы взгляда на экран и на клавиатуру

  const alive = () => S && S.r && !S.r.disposed;
  const sn = (name, o) => { if (alive() && S.r.snd) S.r.snd.play(name, o); };
  const shot = (kind, o) => { if (alive() && S.r.snd) S.r.snd.shot(kind, o); };

  // ------------------------------------------------------------------ ввод: что сейчас можно вписать
  function canType() {
    if (!S || !S.ready) return false;
    const st = S.game.state;
    if (st.phase === PH.PICKING) return !st.autoSelecting && !st.pickLocked && !st.selectionLocked && st.pickStage === 'INPUT';
    if (st.phase === PH.GUESSING) return st.currentActorId === '083' && !st.matchEnding && !!S.game.publicTarget();
    return false;
  }
  const maxLen = () => { const st = S.game.state; return String(st.phase === PH.PICKING ? st.rangeMax : (S.game.publicTarget() || { max: 9999 }).max).length; };
  function setTyping(on) {
    if (!alive() || S.r.locked) return;
    if (on && !canType()) { if (S.r.paused) return; sn('empty'); S.r.toast('NOTHING TO TYPE RIGHT NOW', 1.4); return; }
    if (on === S.ui.typing) return;
    S.ui.typing = on;
    if (on) { S.ui.buf = ''; S.ui.note = null; }
  }
  function addDigit(d) { if (S.ui.buf.length < maxLen()) { S.ui.buf += d; sn('beep', { k: 0.6 }); } }
  function backspace() { if (S.ui.buf.length) { S.ui.buf = S.ui.buf.slice(0, -1); sn('beep', { k: 0.4 }); } }
  function reject(reason) {
    const r = S.r;
    r.sfx('error');
    S.ui.note = { text: 'INVALID VALUE — ' + (reason === 'EMPTY' ? 'NUMBER REQUIRED' : 'VALUE OUT OF RANGE'), kind: 'error', until: r.time + 2.4 };
    r.shake(0.012, 0.25);
  }
  function submit() {
    if (!alive() || !S.ui.typing || !canType()) return;
    const game = S.game, st = game.state, buf = S.ui.buf;
    if (st.phase === PH.PICKING) {
      const p = HL.parseNumber(buf, 1, st.rangeMax);
      if (!p.ok) { reject(p.reason); return; }
      S.r.sfx('mouse');
      const res = game.lockNumber('083', p.value);
      if (!res.ok && res.reason !== 'CLOSED' && res.reason !== 'ALREADY_LOCKED') reject(res.reason);
      else { S.ui.typing = false; S.ui.buf = ''; }
    } else if (st.phase === PH.GUESSING) {
      const b = game.publicTarget();
      const p = HL.parseNumber(buf, b.min, b.max);
      if (!p.ok) { reject(p.reason); return; }
      S.r.sfx('mouse');
      const actor = st.currentActorId, target = st.targetId, token = st.turnToken;
      S.ui.buf = ''; S.ui.typing = false;
      const res = game.submitGuess(actor, target, p.value, token);
      if (!res.ok) reject('RANGE');
    }
  }
  function act(id) {
    const game = S.game, st = game.state;
    if (id === 'begin') { if (st.phase === PH.PARTICIPANTS) { S.r.sfx('mouse'); game.beginRound(); } }
    else if (id === 'input') setTyping(true);
    else if (id === 'lock' || id === 'submit') { if (!S.ui.typing) setTyping(true); else submit(); }
    else if (id === 'restart') { if (st.phase === PH.RESULT) { S.r.sfx('mouse'); S.hooks.restart && S.hooks.restart(); } }
    else if (id === 'menu') { if (st.phase === PH.RESULT) { S.r.sfx('mouse'); leave('menu'); } }
  }
  async function leave(reason) {
    const r = S.r; if (!alive() || S.leaving) return;
    S.leaving = true; S.endReason = reason; r.ending = true; r.syncLock();
    await r.fade(1, 0.8);
    if (alive()) r.finish(false);
  }

  // ------------------------------------------------------------------ экран → луч → кнопка
  function hotAt(px, py) {
    const h = S.screen.hot; if (!h) return null;
    for (let i = h.length - 1; i >= 0; i -= 1) { const z = h[i]; if (px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h) return z.id; }
    return null;
  }
  // пересечение луча (o + d·t) с плоскостью дисплея → { ok, px, py, inside, margin, point }
  function planeHit(o, d, out) {
    const sc = S.scr, v = tt();
    const den = d.dot(sc.n);
    if (den > -1e-5) { out.ok = false; return out; }
    const t = v.a.copy(sc.c).sub(o).dot(sc.n) / den;
    if (t <= 0) { out.ok = false; return out; }
    out.point.copy(o).addScaledVector(d, t);
    v.b.copy(out.point).sub(sc.c);
    const ux = v.b.dot(sc.x), vy = v.b.dot(sc.y);
    out.ok = true; out.ux = ux; out.vy = vy;
    out.px = (ux / SW + 0.5) * CW; out.py = (0.5 - vy / SH) * CH;
    out.dx = Math.max(0, Math.abs(ux) - SW / 2); out.dy = Math.max(0, Math.abs(vy) - SH / 2);
    out.gap = Math.max(out.dx, out.dy);          // расстояние до края дисплея (0 — внутри)
    out.inside = out.gap === 0;
    return out;
  }
  function clickAt() {
    if (!alive() || S.r.locked || S.r.paused) return false;
    const a = S.aim; if (!a.ok || !a.inside) return false;
    const id = hotAt(a.px, a.py);
    if (id) { act(id); return true; }
    return false;
  }

  // ------------------------------------------------------------------ камера
  function playerPose(o) {
    const f = V.f, t = V.typ;
    let x = lerp(FREE.x, FOCUS.x, f), y = lerp(FREE.y, FOCUS.y, f), z = lerp(FREE.z, FOCUS.z, f), fov = lerp(FREE.fov, FOCUS.fov, f);
    let yaw = V.yaw + wrap(FY.yaw - V.yaw) * f, pitch = lerp(V.pitch, FY.pitch, f);
    x = lerp(x, TYPE.x, t); y = lerp(y, TYPE.y, t); z = lerp(z, TYPE.z, t); fov = lerp(fov, TYPE.fov, t);
    yaw += wrap(TY.yaw - yaw) * t; pitch = lerp(pitch, TY.pitch, t);
    o.x = x; o.y = y; o.z = z; o.yaw = yaw; o.pitch = pitch; o.fov = fov;
    return o;
  }
  function blendPose(a, b, k, o) { // k=0 → a, k=1 → b
    o.x = lerp(a.x, b.x, k); o.y = lerp(a.y, b.y, k); o.z = lerp(a.z, b.z, k); o.fov = lerp(a.fov, b.fov, k);
    o.yaw = a.yaw + wrap(b.yaw - a.yaw) * k; o.pitch = lerp(a.pitch, b.pitch, k);
    return o;
  }
  function dirBegin() { D.pos.set(disp.x, disp.y, disp.z); D.yaw = disp.yaw; D.pitch = disp.pitch; D.fov = disp.fov; D.on = true; D.w = 1; }
  function dirSet(pos, look, fov) { D.pos.copy(pos); const o = lookYP(pos, look, {}); D.yaw = o.yaw; D.pitch = o.pitch; D.fov = fov; D.on = true; D.w = 1; }
  // плавный переход «режиссёра» к новой точке/взгляду
  function dirTo(pos, yaw, pitch, fov, dur, ease) {
    const p0 = D.pos.clone(), y0 = D.yaw, pi0 = D.pitch, f0 = D.fov, y1 = y0 + wrap(yaw - y0);
    return S.r.tween(dur, (k) => { D.pos.lerpVectors(p0, pos, k); D.yaw = lerp(y0, y1, k); D.pitch = lerp(pi0, pitch, k); D.fov = lerp(f0, fov, k); }, ease || smooth);
  }
  function dirLook(pos, look, fov, dur, ease) { const o = lookYP(pos, look, {}); return dirTo(pos, o.yaw, o.pitch, fov, dur, ease); }
  async function dirEnd(dur) {
    await S.r.tween(dur, (k) => { D.w = 1 - k; }, smooth);
    D.on = false; D.w = 0;
  }

  // положение лазера-прицела и состояние «сфокусировался на ноутбуке»
  function aimUpdate(dt) {
    const r = S.r, v = tt(), a = S.aim;
    const cp = Math.cos(V.pitch);
    v.dir.set(-Math.sin(V.yaw) * cp, Math.sin(V.pitch), -Math.cos(V.yaw) * cp);
    v.eye.set(FREE.x, FREE.y, FREE.z);
    planeHit(v.eye, v.dir, a);
    if (a.ok) {
      if (!V.engaged && a.gap < 0.02) V.engaged = true;
      else if (V.engaged && a.gap > 0.14) V.engaged = false;
    } else V.engaged = false;
    const typing = S.ui.typing, want = (V.engaged || typing || S.touchFocus || S.forceFocus) && !S.noFocus ? 1 : 0;
    V.f += (want - V.f) * expk(dt, 6);
    V.typ += ((typing ? 1 : 0) - V.typ) * expk(dt, 7);
    const hid = a.ok && a.inside ? hotAt(a.px, a.py) : null;
    S.ui.hover = r.locked || r.touch ? null : hid;
  }
  function placeCamera(dt) {
    const r = this, cam = r.camera, t = r.time;
    if (!S || !S.scr) return;
    aimUpdate(dt);
    playerPose(P);
    let F = P;
    if (D.on) F = D.w >= 1 ? { x: D.pos.x, y: D.pos.y, z: D.pos.z, yaw: D.yaw, pitch: D.pitch, fov: D.fov } : blendPose({ x: D.pos.x, y: D.pos.y, z: D.pos.z, yaw: D.yaw, pitch: D.pitch, fov: D.fov }, P, 1 - D.w, {});
    disp.x = F.x; disp.y = F.y; disp.z = F.z; disp.yaw = F.yaw; disp.pitch = F.pitch; disp.fov = F.fov;
    const sh = (r.shakeAmp || 0) + (D.on ? D.tr * D.w : 0), br = Math.sin(t * 1.4) * 0.0035;
    cam.position.set(F.x + (sh ? (Math.random() - 0.5) * sh : 0), F.y + br + (sh ? (Math.random() - 0.5) * sh : 0), F.z + (sh ? (Math.random() - 0.5) * sh : 0));
    cam.rotation.set(F.pitch + Math.sin(t * 1.1) * 0.003, F.yaw, D.on ? D.roll * D.w : 0);
    if (Math.abs(cam.fov - F.fov) > 0.02) { cam.fov = F.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld(true);
    r.blurX = r.blurY = 0;
    placeCursor();
  }
  // DOM-прицел: точка на дисплее → экран (с обратным fisheye)
  function placeCursor() {
    const r = S.r, el = S.crossEl, a = S.aim;
    if (!el) return;
    const show = !r.touch && !r.locked && !r.paused && !S.ui.typing && !D.on;
    if (!show) { if (S.crossOn) { el.style.opacity = '0'; S.crossOn = false; } return; }
    const w = r.w || innerWidth, h = r.h || innerHeight;
    let x = w / 2, y = h / 2;
    if (a.ok && a.gap < 0.3) {
      const p = tt().c.copy(a.point).project(r.camera);
      if (p.z < 1) {
        const K = r.fxU.uK.value, qx = p.x, qy = p.y;
        let px = qx, py = qy;
        for (let i = 0; i < 4; i += 1) { const r2 = px * px + py * py, s = (1 + 2 * K) / (1 + K * r2); px = qx * s; py = qy * s; }
        x = clamp((px * 0.5 + 0.5) * w, 6, w - 6); y = clamp((-py * 0.5 + 0.5) * h, 6, h - 6);
      }
    }
    el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    if (!S.crossOn) { el.style.opacity = '1'; S.crossOn = true; }
    const hot = !!S.ui.hover;
    if (hot !== S.crossHot) { S.crossHot = hot; el.classList.toggle('hot', hot); }
  }
  // касание → плоскость дисплея (камера и обратный fisheye)
  function tapHit(cx, cy) {
    const r = S.r, rect = r.layer.getBoundingClientRect(), v = tt();
    let x = (cx - rect.left) / rect.width * 2 - 1, y = -((cy - rect.top) / rect.height * 2 - 1);
    const K = r.fxU.uK.value, s = (1 + K * (x * x + y * y)) / (1 + 2 * K);
    v.c.set(x * s, y * s, 0.5).unproject(r.camera);
    v.dir.copy(v.c).sub(r.camera.position).normalize();
    const o = { point: new THREE.Vector3() };
    return planeHit(r.camera.position, v.dir, o);
  }

  // ------------------------------------------------------------------ экраны ноутбуков
  function screenModel(s) {
    const st = S.game.state, me = s.isUser;
    return { id: s.id, me, st, tgt: S.game.publicTarget(), ui: me ? S.ui : { buf: '', typing: false, caret: false, hover: null, note: null }, t: S.r.time, dead: s.dead, crash: me ? S.crash : 0, seed: s.seed, verdictT: S.verdictT };
  }
  function modelKey(s, M) {
    const st = M.st, l = st.lastResult, tg = M.tgt;
    let k = st.phase + '|' + st.pickRemaining + '|' + st.pickStage + '|' + st.pickLocked + '|' + st.autoSelecting + '|' + st.lockedValue + '|' + st.currentActorId + '|' + st.targetId + '|' + st.matchEnding + '|' + st.winnerId + '|' + st.sessionId;
    if (l) k += '|' + l.actorId + l.targetId + l.guess + l.result;
    if (tg) k += '|' + tg.min + '-' + tg.max;
    for (let i = 0; i < st.players.length; i += 1) k += st.players[i].status + (st.players[i].active ? 1 : 0);
    k += '|' + (window.I18N ? I18N.lang : '') + '|' + s.dead + '|' + M.crash + '|' + Math.floor(M.t * (M.crash ? 14 : 4));
    if (M.me) k += '|' + M.ui.buf + M.ui.typing + M.ui.caret + M.ui.hover + (M.ui.note ? M.ui.note.text : '');
    return k;
  }
  function paintSeat(s, force) {
    const sc = s.lap; if (!sc) return;
    const M = screenModel(s);
    const key = modelKey(s, M);
    if (!force && key === sc.key) return;
    sc.key = key;
    const k = sc.canvas.width / CW;
    sc.g.setTransform(k, 0, 0, k, 0, 0);
    const hot = SCR.draw(sc.g, M);
    if (s.isUser) sc.hot = hot;
    sc.tex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ сборка сцены
  function buildTable(r) {
    const T3 = THREE, q = r.q, seg = q.parts >= 12 ? 36 : 24, sh = q.shadows;
    const add = (geo, mat, x, y, z, parent) => { const m = new T3.Mesh(geo, mat); m.position.set(x, y, z); if (sh) { m.castShadow = true; m.receiveShadow = true; } (parent || r.scene).add(m); return m; };
    const top = add(new T3.CylinderGeometry(TABLE_R, TABLE_R, 0.06, seg), r.mat(0x2b2b2b), 0, TABLE_Y - 0.03, 0);
    add(new T3.CylinderGeometry(TABLE_R + 0.01, TABLE_R + 0.01, 0.012, seg), r.mat(0x555555), 0, TABLE_Y - 0.066, 0);
    add(new T3.CylinderGeometry(0.15, 0.2, TABLE_Y - 0.07, 14), r.mat(0x161616), 0, (TABLE_Y - 0.07) / 2, 0);
    add(new T3.CylinderGeometry(0.62, 0.66, 0.04, 20), r.mat(0x161616), 0, 0.02, 0);
    S.tableTop = top;
    // ковёр под столом (принимает тени)
    const rug = new T3.Mesh(new T3.CircleGeometry(2.7, 40).rotateX(-PI / 2), new T3.MeshLambertMaterial({ color: 0x1a1a1a, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    rug.position.y = 0.01; if (sh) rug.receiveShadow = true; r.scene.add(rug);
    // подвесная лампа
    const shade = new T3.Mesh(new T3.CylinderGeometry(0.12, 0.42, 0.28, 24, 1, true), new T3.MeshLambertMaterial({ color: 0x2a2a2a, side: T3.DoubleSide }));
    shade.position.set(0, 2.55, 0); r.scene.add(shade);
    const cable = new T3.Mesh(new T3.CylinderGeometry(0.012, 0.012, 1.7, 6), r.basic(0x0a0a0a)); cable.position.set(0, 3.5, 0); r.scene.add(cable);
    const bulb = new T3.Mesh(new T3.SphereGeometry(0.07, 10, 8), r.basic(0xfff1d6)); bulb.position.set(0, 2.44, 0); r.scene.add(bulb);
    const L = new T3.PointLight(0xfff0d8, 1.9, 12, 2); L.position.set(0, 2.3, 0); L.base = 1.9;
    if (sh) { L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.bias = -0.002; }
    r.scene.add(L); r.lamps.push(L);
    const fill = new T3.PointLight(0x8aa0b4, 0.7, 14, 2); fill.position.set(-4.6, 3.4, 4.6); fill.base = 0.7; r.scene.add(fill); r.lamps.push(fill);
    // дверь, табличка, камера наблюдения
    r.door(0, -5.88, 1.5, 2.4);
    const plaque = new T3.Mesh(new T3.PlaneGeometry(3.4, 0.7), new T3.MeshBasicMaterial({
      fog: false, color: 0xbbbbbb, map: canvasTex(512, 104, (g, w, h) => {
        g.fillStyle = '#050606'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3a4244'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
        g.fillStyle = '#ef4b45'; g.fillRect(18, 18, 14, 14);
        g.fillStyle = '#e6e9e6'; g.font = '700 26px "Space Mono","Courier New",monospace'; g.fillText('NEXA INDUSTRIES', 44, 36);
        g.fillStyle = '#7c898c'; g.font = '400 17px "IBM Plex Mono","Courier New",monospace'; g.fillText(LT('EXPERIMENT 01 // HIGH-LOW // ROOM 07'), 18, 78);
      })
    }));
    plaque.position.set(2.6, 2.6, -5.97); r.scene.add(plaque);
    r.box(5.55, 3.75, -5.55, 0.22, 0.16, 0.3, 0x111111, false);
    S.led = r.box(5.55, 3.66, -5.4, 0.045, 0.045, 0.02, 0xff2a22, false, true);
    // клавиатура ноутбуков: общая текстура
    S.kbTex = canvasTex(256, 96, (g, w, h) => {
      g.fillStyle = '#0d0e0e'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d2020';
      for (let row = 0; row < 5; row += 1) for (let c = 0; c < 14; c += 1) g.fillRect(6 + c * 17.5, 5 + row * 13.5, 15, 11);
      g.fillRect(60, 73, 130, 11);
      g.fillStyle = '#161818'; g.fillRect(96, 80, 64, 14);
    });
  }

  function makeLaptop(r, sg, isUser) {
    const T3 = THREE, q = r.q, sh = q.shadows;
    const lap = new T3.Group(); lap.position.set(0, TABLE_Y, LAP_Z); sg.add(lap);
    const base = new T3.Mesh(r.g.box, r.mat(0x1c1c1c)); base.scale.set(0.44, 0.022, 0.3); base.position.set(0, 0.011, 0.15); if (sh) base.castShadow = true; lap.add(base);
    const kb = new T3.Mesh(new T3.PlaneGeometry(0.4, 0.15), new T3.MeshBasicMaterial({ map: S.kbTex, fog: false, color: 0x9aa0a0 }));
    kb.rotation.x = -PI / 2; kb.position.set(0, 0.0225, 0.145); lap.add(kb);
    const lid = new T3.Group(); lid.position.set(0, 0.022, 0); lid.rotation.x = -LID_TILT; lap.add(lid);
    const back = new T3.Mesh(r.g.box, r.mat(0x222222)); back.scale.set(0.46, 0.3, 0.012); back.position.set(0, 0.15, -0.006); if (sh) back.castShadow = true; lid.add(back);
    // холст экрана: у игрока полное разрешение, у остальных — вдвое меньше (экраны соседей видны только сбоку)
    const scale = isUser ? (r.touch || r.qName === 'LOW' ? 0.75 : 1) : 0.5;
    const canvas = document.createElement('canvas'); canvas.width = Math.round(CW * scale); canvas.height = Math.round(CH * scale);
    const tex = new T3.CanvasTexture(canvas); tex.generateMipmaps = false; tex.minFilter = T3.LinearFilter;
    try { tex.anisotropy = Math.min(8, r.renderer.capabilities.getMaxAnisotropy()); } catch (e) {}
    const screen = new T3.Mesh(new T3.PlaneGeometry(SW, SH), new T3.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false }));
    screen.position.set(0, 0.15, 0.001); lid.add(screen);
    return { grp: lap, lid, screen, canvas, g: canvas.getContext('2d'), tex, key: '', hot: [] };
  }

  function drawCard(card, id) {
    const tex = card.userData.tex, g = tex.image.getContext('2d'), w = tex.image.width, h = tex.image.height;
    g.fillStyle = '#0a0b0b'; g.fillRect(0, 0, w, h); g.strokeStyle = '#7c898c'; g.lineWidth = 2; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#e6e9e6'; g.font = '700 26px "Space Mono","Courier New",monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(LT(subLabel(id)), w / 2, h / 2 + 2);
    tex.needsUpdate = true;
  }
  function makeSeat(r, i, N, p) {
    const T3 = THREE, sh = r.q.shadows, theta = i * 2 * PI / N;
    const sg = new T3.Group(); sg.rotation.y = theta; r.scene.add(sg);
    const seatRot = new T3.Group(); seatRot.position.set(0, 0, R_SEAT); sg.add(seatRot);
    const part = (w, h, d, x, y, z, color) => { const m = new T3.Mesh(r.g.box, r.mat(color)); m.scale.set(w, h, d); m.position.set(x, y, z); if (sh) m.castShadow = true; seatRot.add(m); return m; };
    part(0.46, 0.06, 0.46, 0, 0.435, 0, 0x1b1b1b);            // сиденье
    part(0.44, 0.5, 0.06, 0, 0.74, 0.23, 0x1b1b1b);           // спинка (сзади сидящего)
    part(0.06, 0.4, 0.06, 0, 0.21, 0, 0x2a2a2a);              // колонна
    part(0.58, 0.04, 0.07, 0, 0.03, 0, 0x222222);             // крестовина
    const cross = part(0.58, 0.04, 0.07, 0, 0.03, 0, 0x222222); cross.rotation.y = PI / 2;
    const lap = makeLaptop(r, sg, p.isUser);
    // карточка с номером субъекта на столе (номер обновляется при рестарте)
    const cardTex = canvasTex(256, 64, () => {});
    const card = new T3.Mesh(new T3.PlaneGeometry(0.3, 0.075), new T3.MeshBasicMaterial({ fog: false, color: 0xc4c8c4, map: cardTex }));
    card.rotation.x = -PI / 2; card.position.set(0, TABLE_Y + 0.003, 1.13); sg.add(card);
    card.userData.tex = cardTex;
    // лужа крови на столе (растёт, когда субъекта убивают)
    let pool = null;
    if (r.bloodMode && r.bloodMode !== 'off') {
      pool = new T3.Mesh(new T3.CircleGeometry(1, 20).rotateX(-PI / 2), new T3.MeshBasicMaterial({ color: r.bloodMode === 'dark' ? 0x0b0b0b : 0x6a0a0a, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      pool.position.set(0.03, TABLE_Y + 0.006, 1.1); pool.scale.set(0.02, 1, 0.02); pool.visible = false; sg.add(pool);
    }
    const x = R_SEAT * Math.sin(theta), z = R_SEAT * Math.cos(theta);
    const n = r.npc(x, z, theta + PI); n.g.position.y = SIT_Y;
    r.actorStyle(n, 'grunt', null);
    if (p.isUser) n.head.visible = false;
    sg.updateMatrixWorld(true);
    drawCard(card, p.id);
    return {
      i, id: p.id, isUser: !!p.isUser, theta, sg, seatRot, n, lap, card, pool, poolK: 0, dead: false, slump: 0, recoil: 0, typeK: 0, swivel: 0, free: false, fear: 0, fearT: 0, press: 0, rag: false,
      baseYaw: theta + PI, x, z, hy: 0, hp: 0.2, tyaw: 0, tpitch: 0.3, gt: 1 + Math.random() * 2, seed: 11 + i * 37, side: i % 2 ? 1 : -1, ph: Math.random() * 6
    };
  }

  function buildGuards(r) {
    S.guards = CORNERS.map((c, i) => {
      const yaw = Math.atan2(-c[0], -c[1]);
      const n = r.npc(c[0], c[1], yaw);
      r.actorStyle(n, 'grunt', 'rifle');
      return { n, home: { x: c[0], z: c[1], yaw }, busy: false, i };
    });
  }

  function build(r) {
    const T3 = THREE;
    S.r = r;
    r.layer.classList.add('table');
    r.qs('.m-load .eyebrow').textContent = 'NEXA INDUSTRIES / EXPERIMENT 01';
    r.qs('.m-load h2').textContent = 'EXPERIMENT ROOM';
    r.setFog(0.03, 0x0a0a0a);
    r.fxU.uK.value = 0.07;
    // свет: тусклый ambient + лампа над столом (без «пола» яркости миссий)
    r.lightsLevel = function (l) {
      this.lightLevel = l;
      this.amb.intensity = this.ambBase * l;
      this.lamps.forEach((L) => { L.intensity = L.base * l; });
      this.lampMat.color.setScalar(0.12 + 0.88 * Math.min(1, l * 1.4));
    };
    r.setAmbient(0.55);
    r.camera.remove(r.torch);
    r.room(0, 0, 12, 12, 4.2, 0x6e6e6e);
    // кровь без боя: красные края экрана нам не нужны
    r.bloodInit();
    if (r.bl) r.bl.gore = null;
    r.snd = C.makeSound(r);
    r.body.visible = false;
    if (r.rg && r.rg.root) r.rg.root.visible = false;

    buildTable(r);
    const st = S.game.state, N = Math.max(2, st.players.length);
    S.seats = st.players.map((p, i) => makeSeat(r, i, N, p));
    buildGuards(r);
    // дульная вспышка (одна на все выстрелы)
    S.mz = new T3.PointLight(0xffe4b0, 0, 5, 2); S.mz.t = 0; S.mz.position.set(0, 1.3, 0); r.scene.add(S.mz);
    // базис дисплея игрока
    const us = S.seats[0];
    us.lap.screen.updateMatrixWorld(true);
    const m = us.lap.screen.matrixWorld, sc = S.scr = { c: new T3.Vector3(), x: new T3.Vector3(), y: new T3.Vector3(), n: new T3.Vector3() };
    sc.c.setFromMatrixPosition(m); m.extractBasis(sc.x, sc.y, sc.n); sc.x.normalize(); sc.y.normalize(); sc.n.normalize();
    S.screen = us.lap;
    lookYP(new T3.Vector3(FOCUS.x, FOCUS.y, FOCUS.z), sc.c, FY);
    lookYP(new T3.Vector3(TYPE.x, TYPE.y, TYPE.z), new T3.Vector3(TYPE_LOOK[0], TYPE_LOOK[1], TYPE_LOOK[2]), TY);
    D.pos = new T3.Vector3();
    S.aim = { ok: false, point: new T3.Vector3(), px: 0, py: 0, gap: 9, inside: false };
    // интерфейс поверх мира
    const lay = r.layer;
    const mk = (html) => { const d = document.createElement('div'); d.innerHTML = html; const el = d.firstChild; lay.appendChild(el); return el; };
    S.crossEl = mk('<div class="t-cross"><i></i></div>');
    S.quoteEl = mk('<div class="t-quote"><p class="q"></p><p class="by"></p></div>');
    S.uiEl = mk('<div class="t-ui"><button type="button" class="t-btn t-type">TYPE</button><button type="button" class="t-btn t-back">BACK</button></div>');
    S.padEl = mk('<div class="t-pad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((k, i) => '<button type="button" data-i="' + i + '">' + k + '</button>').join('') + '</div>');
    installOverrides(r);
    S.ready = true;
    // шрифты интерфейса подгружаются позже: перерисовать экраны, когда будут готовы
    try { if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('700 20px "Space Mono"'), document.fonts.load('400 16px "IBM Plex Mono"')]).then(() => { if (alive()) { S.seats.forEach((s) => { s.lap.key = ''; }); } }); } catch (e) {}
    reseat();
  }

  // ------------------------------------------------------------------ позы стикменов
  const REST = [0.30, 0.80, 1.02], TYPEP = [0.11, 0.815, 0.87], LIMP = [0.26, 0.55, 1.2], HUP = [0.3, 1.42, 1.1];
  function armsIK(s, dt) {
    const r = S.r, n = s.n, v = tt(), t = r.time + s.ph;
    n.g.updateMatrixWorld(true);
    for (let k = 0; k < 2; k += 1) {
      const side = k ? 1 : -1, sx = -side;           // armL (локально −x) смотрит в +x системы места; armR — в −x
      const tk = s.typeK, jit = tk * Math.sin(t * (14 + k * 3.3)) * 0.007, jx = tk * Math.sin(t * (9 + k * 2)) * 0.008;
      const hx = lerp(REST[0], TYPEP[0], tk), hy = lerp(REST[1], TYPEP[1], tk), hz = lerp(REST[2], TYPEP[2], tk);
      let x = sx * hx + jx, y = hy + jit, z = hz;
      const sl = smooth(clamp(s.slump, 0, 1));
      x = lerp(x, sx * LIMP[0], sl); y = lerp(y, LIMP[1], sl); z = lerp(z, LIMP[2], sl);
      const fe = smooth(clamp(s.fear || 0, 0, 1));
      if (fe > 0.001) { const tm = Math.sin(t * (21 + k * 4.7)) * 0.012 * fe, tm2 = Math.sin(t * (17 + k * 3.1) + 1) * 0.01 * fe; x = lerp(x, sx * HUP[0] + tm, fe); y = lerp(y, HUP[1] + tm2, fe); z = lerp(z, HUP[2] + tm, fe); }
      v.a.set(x, y, z); s.sg.localToWorld(v.a); n.spine.worldToLocal(v.a);
      r.solveArm(k ? n.armR : n.armL, k ? n.elbR : n.elbL, SHOULDER[k], v.a, side);
    }
  }
  function poseSeat(s, dt) {
    const r = S.r, n = s.n, v = tt(), t = r.time + s.ph, st = S.game.state;
    const me = st.players.find((p) => p.id === s.id);
    s.seatRot.rotation.y = s.swivel;
    if (s.rag) return;                                   // тело ведёт рэгдолл (ragdoll.js)
    s.fear += ((s.fearT || 0) - s.fear) * expk(dt, 7);
    // положение и поворот (у игрока кресло вращается)
    n.g.position.y = SIT_Y;
    n.g.rotation.y = n.yaw = s.baseYaw + s.swivel;
    s.seatRot.rotation.y = s.swivel;
    n.goal = null; n.vel = 0;
    // ноги: сидит, колени согнуты
    n.hips.position.y = 0.95; n.hips.rotation.set(0, 0, 0);
    n.legL.rotation.set(-1.45, 0, 0.05); n.legR.rotation.set(-1.45, 0, -0.05);
    n.kneeL.rotation.set(1.42, 0, 0); n.kneeR.rotation.set(1.42, 0, 0);
    n.footL.rotation.set(0.02, 0, 0); n.footR.rotation.set(0.02, 0, 0);
    // печатает ли
    let typing;
    if (s.isUser) typing = S.ui.typing;
    else if (s.dead || s.fearT) typing = false;
    else typing = (st.phase === PH.PICKING && me && me.status !== 'LOCKED') || (st.phase === PH.GUESSING && st.currentActorId === s.id);
    s.typeK += ((typing ? 1 : 0) - s.typeK) * expk(dt, 5);
    s.recoil = Math.max(0, s.recoil - dt * 2.4);
    const sl = smooth(clamp(s.slump, 0, 1));
    // корпус и голова
    const lean = 0.1 + 0.2 * s.typeK + 0.55 * sl - 0.08 * s.fear;
    n.spine.rotation.set(lean + Math.sin(t * 1.6) * 0.008 + Math.sin(t * 26) * 0.006 * s.fear, 0, s.side * 0.32 * sl);
    if (!s.isUser) {
      s.gt -= dt;
      if (s.gt <= 0 && !s.dead) glanceAt(s);
      s.hy += (s.tyaw - s.hy) * expk(dt, 4); s.hp += (s.tpitch - s.hp) * expk(dt, 4);
      n.head.rotation.set(s.hp * (1 - sl) + 0.55 * sl - s.recoil * 0.6 + Math.sin(t * 23) * 0.014 * s.fear, s.hy * (1 - sl), s.side * 0.2 * sl + (s.press || 0) * 0.22 * s.fear);
    }
    if (!s.free) armsIK(s, dt);
  }
  // субъект поглядывает на соседей, на дисплей или на стол
  function glanceAt(s) {
    const others = S.seats.filter((o) => o !== s && !o.dead), v = tt();
    s.gt = 1.4 + Math.random() * 3.4;
    const dn = Math.random() < 0.45 || !others.length;
    if (dn) { s.tyaw = (Math.random() - 0.5) * 0.3; s.tpitch = 0.42; return; }
    const o = others[Math.floor(Math.random() * others.length)];
    o.n.head.getWorldPosition(v.a);
    s.n.g.updateMatrixWorld(true);
    s.n.g.worldToLocal(v.a);
    s.tyaw = clamp(Math.atan2(v.a.x, v.a.z), -1.2, 1.2);
    s.tpitch = clamp(-Math.atan2(v.a.y - 1.4 - SIT_Y * 0, Math.hypot(v.a.x, v.a.z)) * 0.6 + 0.12, -0.3, 0.5);
  }
  function seatById(id) { return S.seats.find((s) => s.id === id); }

  // тело, упавшее рэгдоллом, снова сидит за столом (рестарт)
  function reviveSeat(s) {
    const r = S.r, n = s.n, g = n.g;
    r.actorReset(n); n.pForce = null;
    g.scale.set(1, 1, 1); g.rotation.set(0, s.baseYaw, 0); g.position.set(s.x, SIT_Y, s.z); g.visible = true;
    n.hips.quaternion.set(0, 0, 0, 1); n.spine.quaternion.set(0, 0, 0, 1); n.head.quaternion.set(0, 0, 0, 1);
    s.rag = false; s.fear = 0; s.fearT = 0; s.press = 0; s.swivel = 0; s.seatRot.rotation.y = 0;
    s.gt = 1 + Math.random() * 2; s.tyaw = 0; s.tpitch = 0.3;
  }
  // перерисовать мир под новый раунд (участники готовы / рестарт)
  function reseat() {
    const r = S.r;
    r.clearBlood();
    S.ui.typing = false; S.ui.buf = ''; S.ui.note = null; S.crash = 0; S.touchFocus = false; S.forceFocus = false; S.noFocus = false;
    S.game.state.players.forEach((p, i) => { const s = S.seats[i]; if (s && s.id !== p.id) { s.id = p.id; drawCard(s.card, p.id); } });
    S.seats.forEach((s) => {
      if (s.rag || s.n.death) reviveSeat(s);
      s.dead = false; s.slump = 0; s.recoil = 0; s.typeK = 0; s.free = false; s.swivel = 0; s.lap.key = '';
      if (s.pool) { s.pool.visible = false; s.poolK = 0; s.pool.scale.set(0.02, 1, 0.02); }
    });
    S.guards.forEach((g) => {
      g.n.g.position.x = g.home.x; g.n.g.position.z = g.home.z; g.n.yaw = g.n.g.rotation.y = g.home.yaw; g.n.goal = null; g.n.armT = 0; g.n.g.visible = true; g.busy = false;
      if (g.n.gunKind !== 'rifle') r.setGun(g.n, 'rifle');
    });
    refreshObjective(true);
  }

  // ------------------------------------------------------------------ подсказки и цели
  const padMode = () => !S.r.touch && S.r.padActive;
  const typeKey = () => (S.r.touch ? '[TYPE]' : padMode() ? '[Y]' : '[K]');
  function refreshObjective(force) {
    const r = S.r; if (!alive() || !S.ready) return;
    const st = S.game.state; let t = '';
    if (st.phase === PH.PARTICIPANTS) t = 'CLICK [BEGIN EXPERIMENT] ON YOUR LAPTOP';
    else if (st.phase === PH.PICKING) t = st.pickLocked ? 'NUMBER LOCKED — WAITING FOR OTHER SUBJECTS' : 'SELECT YOUR NUMBER (1 — ' + st.rangeMax + ') — ' + typeKey() + ' TO TYPE';
    else if (st.phase === PH.GUESSING) t = st.matchEnding ? 'EXPERIMENT COMPLETE' : st.currentActorId === '083' ? 'YOUR TURN — ' + typeKey() + ' TO TYPE A GUESS' : subLabel(st.currentActorId) + ' IS GUESSING';
    else if (st.phase === PH.RESULT) t = st.winnerId === '083' ? 'YOU ARE THE LAST ONE LEFT — USE YOUR LAPTOP' : '';
    else t = 'INITIALIZING...';
    if (S.cutHold) t = '';
    if (force || t !== S.objText) { S.objText = t; r.objective(t); }
  }
  const hintText = () => { const r = S.r; return r.touch ? '' : padMode() ? (window.PadGlyph ? window.PadGlyph.fmt('R-STICK AIM  |  A CLICK  |  Y TYPE  |  X ERASE  |  B BACK  |  START PAUSE') : 'R-STICK AIM  |  A CLICK  |  Y TYPE  |  X ERASE  |  B BACK  |  START PAUSE') :'MOUSE: LOOK AT LAPTOP + CLICK  |  K TYPE  |  ENTER SEND  |  ESC PAUSE'; };

  // ------------------------------------------------------------------ геймпад / сенсор
  function padObj() { try { const l = navigator.getGamepads ? navigator.getGamepads() : []; for (let i = 0; i < l.length; i += 1) if (l[i] && l[i].connected) return l[i]; } catch (e) {} return null; }
  const PADKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bs', '0', 'ok'];
  function padKey(k) {
    if (k === 'bs') backspace(); else if (k === 'ok') submit(); else addDigit(k);
  }
  function padTick() {
    const g = padObj(), r = S.r; if (!g) return;
    const b = (i) => !!(g.buttons[i] && g.buttons[i].pressed), P2 = S.padPrev, edge = (i) => b(i) && !P2[i];
    if (r.padActive && !r.locked && !r.paused) {
      if (edge(3)) { setTyping(!S.ui.typing); }
      if (S.ui.typing) {
        if (edge(2)) backspace();
        if (edge(1)) setTyping(false);
        let i = S.padSel, row = Math.floor(i / 3), col = i % 3;
        if (edge(12)) row = (row + 3) % 4; if (edge(13)) row = (row + 1) % 4; if (edge(14)) col = (col + 2) % 3; if (edge(15)) col = (col + 1) % 3;
        S.padSel = row * 3 + col;
      }
    }
    [1, 2, 3, 12, 13, 14, 15].forEach((i) => { P2[i] = b(i); });
  }
  function syncUi() {
    const r = S.r, st = S.game.state;
    const typing = S.ui.typing, can = canType() && !r.locked;
    const showBtns = (r.touch || padMode() ? 1 : 0) && !r.locked;
    S.uiEl.classList.toggle('on', !!(showBtns && r.touch && (can || typing) && !typing));
    S.uiEl.classList.toggle('back', !!(r.touch && typing && !r.locked));
    S.padEl.classList.toggle('on', !!(typing && !r.locked && (r.touch || padMode())));
    const sel = (!r.touch && padMode()) ? S.padSel : -1;
    const btns = S.padEl.children;
    for (let i = 0; i < btns.length; i += 1) btns[i].classList.toggle('sel', i === sel);
    void st;
    const h = hintText(), el = S.hintEl || (S.hintEl = r.qs('.m-hint'));
    if (el.textContent !== (window.I18N ? I18N.t(h) : h)) el.textContent = h;
  }

  // ------------------------------------------------------------------ главный цикл стола
  function tick(dt) {
    if (!S || !S.ready) return;
    const r = S.r;
    S.frame += 1;
    const st = S.game.state;
    // подсветка/ввод
    if (S.ui.note && r.time > S.ui.note.until) S.ui.note = null;
    S.ui.caret = Math.floor(r.time * 2) % 2 === 0;
    if (S.ui.typing && !canType()) { S.ui.typing = false; S.ui.buf = ''; }
    S.seats.forEach((s) => poseSeat(s, dt));
    execTick(dt);
    if (S.seats[0]) S.seats[0].n.head.visible = !!D.on && !S.dying;   // голову игрока видно только со стороны
    r.updateBlood(dt);
    // лужи на столе
    S.seats.forEach((s) => { if (s.pool && s.pool.visible && s.poolK < 1) { s.poolK = Math.min(1, s.poolK + dt / 5); const k = smooth(s.poolK), sc = 0.02 + 0.3 * k; s.pool.scale.set(sc, 1, sc * 0.85); } });
    // дульная вспышка гаснет
    if (S.mz.t > 0) { S.mz.t -= dt; S.mz.intensity = S.mz.t > 0 ? 4 * (S.mz.t / 0.09) : 0; }
    if (S.led) S.led.visible = Math.floor(r.time * 1.1) % 2 === 0;
    // экраны: игрок — чаще, соседи — редко (их почти не видно)
    paintSeat(S.seats[0]);
    if (D.on || S.frame % 20 === 0) for (let i = 1; i < S.seats.length; i += 1) paintSeat(S.seats[i]);
    padTick();
    syncUi();
    if (S.frame % 15 === 0) refreshObjective();
    void st;
  }

  // ------------------------------------------------------------------ катсцены
  function lockOn() { const r = S.r; r.cineDepth += 1; r.syncLock(); S.ui.typing = false; S.cutHold = true; refreshObjective(true); }
  function lockOff() { const r = S.r; if (!alive()) return; r.cineDepth = Math.max(0, r.cineDepth - 1); r.syncLock(); if (!r.cineDepth) S.cutHold = false; }
  function softFlash(a, dur) { const f = S.r.qs('.m-flash'); f.style.transition = 'none'; f.style.opacity = String(a); void f.offsetWidth; f.style.transition = 'opacity ' + dur + 's ease-out'; f.style.opacity = '0'; }
  function muzzleBoom(g, strong, noMesh) {
    const v = tt();
    if (g.n.flashM && !noMesh) { g.n.flashM.visible = true; }
    if (g.n.flashM) { g.n.gunG.updateWorldMatrix(true, true); g.n.flashM.getWorldPosition(v.a); S.mz.position.copy(v.a); }
    S.mz.t = 0.09; S.mz.intensity = 4;
    if (strong) softFlash(0.9, 0.1); else softFlash(0.28, 0.14);
    setTimeout(() => { if (g.n.flashM) g.n.flashM.visible = false; }, 70);
  }

  // ------------------------------------------------------------------ охрана «впритык»: ствол в упор к голове (хват — C.deathcam.hold, руки по IK)
  const HEADR = 0.12;
  const XG = { pistol: { hg: 1.3, fg: 0.5, side: 0.06, lean: 0.3 }, rifle: { hg: 1.37, fg: 0.5, side: 0.07, lean: 0.24 } };
  const sgnOf = (v) => (v < 0 ? -1 : 1);
  const ragPt = (R, i, out) => out.set(R.p[i * 3], R.p[i * 3 + 1], R.p[i * 3 + 2]);
  const headWorld = (s, out) => { s.n.head.updateWorldMatrix(true, false); return s.n.head.localToWorld(out.set(0, 0.13, 0.01)); };
  const leftDist = (gd) => Math.hypot(gd.ex - gd.n.g.position.x, gd.ez - gd.n.g.position.z);
  const newX = (guards) => ({ guards, ts: 1, tsT: 1, tsK: 4, cam: null, shock: 0, roll: 0, rollT: 0, pressed: 0, tKill: 0, t0: 0, base: new THREE.Vector3(), ls: new THREE.Vector3() });
  // охранник стоит в направлении dir=(x,z) от центра головы H так, что ствол ложится на череп (расстояние headR от центра головы)
  function mkGuard(gref, kind, H, dir, headR) {
    const c = XG[kind], L = C.actorGK.GK[kind].muz[2];
    const phi = Math.asin(clamp((c.hg - (H.y + 0.02)) / L, -0.9, 0.9)), Dd = headR + c.fg + L * Math.cos(phi);
    return { n: gref.n, gref, home: gref.home, kind, hg: c.hg, fg: c.fg, side: c.side, lean: c.lean, leanNow: 0.15, dx: dir.x, dz: dir.z, hr: headR, ex: H.x + dir.x * Dd, ez: H.z + dir.z * Dd, on: false, walking: false, fireT: -99, ak: 30, at: null, hz: 1.8, mode: 'head', sd: 1, aim: null };
  }
  // хват каждого кадра: ствол на цели, руки по IK (после анимации NPC и позы стула)
  function holdFrame(rdt) {
    const X = S.X, dc = C.deathcam; if (!X || !dc || !dc.hold) return;
    const r = S.r, v = S.hv || (S.hv = dc.vecs());
    X.guards.forEach((gd) => {
      if (!gd.on || !gd.aim) return;
      gd.aim(v.t);
      if (!gd.at) gd.at = v.t.clone(); else gd.at.lerp(v.t, 1 - Math.exp(-rdt * gd.ak));
      v.t.copy(gd.at);
      const n = gd.n, g = n.g;
      if (!gd.walking) n.yaw = Math.atan2(v.t.x - g.position.x, v.t.z - g.position.z);
      gd.leanNow += (gd.lean - gd.leanNow) * Math.min(1, rdt * 5);
      const age = r.time - gd.fireT, fk = age < 0.5 ? Math.exp(-age / 0.1) : 0;
      dc.hold(r, v, gd, v.t.x, v.t.y, v.t.z, fk);
    });
  }
  function execTick(dt) {
    const X = S.X; if (!X) return;
    const r = S.r, rdt = dt / (r.timeScale || 1);
    X.ts += (X.tsT - X.ts) * (1 - Math.exp(-rdt * X.tsK));
    r.timeScale = clamp(X.ts, 0.06, 1);
    X.shock *= Math.exp(-rdt / 0.16);
    X.guards.forEach((gd) => { if (!gd.on && gd.walking && gd.arm && leftDist(gd) < gd.hz) gd.on = true; });
    holdFrame(rdt);
    if (X.cam) X.cam(dt, rdt);
  }
  function setDir(x, y, z, look, fov, roll) {
    D.pos.set(x, y, z); const o = lookYP(D.pos, look, {}); D.yaw = o.yaw; D.pitch = o.pitch; D.fov = fov; D.roll = roll || 0;
  }
  function walkTo(gd, x, z, speed, delay) {
    const r = S.r;
    return (async () => {
      if (delay) await r.wait(delay);
      gd.walking = true; await r.walk(gd.n, [x, z], speed); gd.walking = false;
    })();
  }
  function gunFire(gd, kind, strong, noMesh) {
    gd.fireT = S.r.time; shot(kind, {}); muzzleBoom(gd, !!strong, noMesh); gd.n.kick = 1;
  }
  // коллайдеры для рэгдолла: круглый стол (слои), сиденье и спинка стула
  let TCOLS = null;
  function tableCols() {
    if (TCOLS) return TCOLS;
    TCOLS = []; const n = 12, h = TABLE_R * 2 / n;
    for (let i = 0; i < n; i += 1) {
      const z0 = -TABLE_R + i * h, z1 = z0 + h, zm = Math.max(Math.abs(z0), Math.abs(z1)), hx = Math.sqrt(Math.max(0.0001, TABLE_R * TABLE_R - zm * zm));
      TCOLS.push({ x0: -hx, x1: hx, z0, z1, y0: 0.7, y1: TABLE_Y, yb: 0.7 });
    }
    return TCOLS;
  }
  function seatCols(s) {
    const o = { x: Math.sin(s.theta), z: Math.cos(s.theta) }, tg = { x: Math.cos(s.theta), z: -Math.sin(s.theta) };
    const hx = 0.23 * (Math.abs(o.x) + Math.abs(tg.x)), hz = 0.23 * (Math.abs(o.z) + Math.abs(tg.z));
    const bx = s.x + o.x * 0.23, bz = s.z + o.z * 0.23, bhx = Math.abs(tg.x) * 0.22 + Math.abs(o.x) * 0.035, bhz = Math.abs(tg.z) * 0.22 + Math.abs(o.z) * 0.035;
    return [{ x0: s.x - hx, x1: s.x + hx, z0: s.z - hz, z1: s.z + hz, y0: 0.4, y1: 0.465, yb: 0.4 }, { x0: bx - bhx, x1: bx + bhx, z0: bz - bhz, z1: bz + bhz, y0: 0.49, y1: 0.99, yb: 0.49 }];
  }
  // кубики крови, выпущенные вызовом fn, делаем мельче: у самого объектива они иначе читаются как огромные красные квадраты
  function tameBlood(fn, k) {
    const B = S.r.bl, was = B ? B.parts.map((p) => p.life > 0) : null;
    fn();
    if (B) B.parts.forEach((p, i) => { if (p.life > 0 && !was[i]) p.m.scale.multiplyScalar(k); });
  }
  // толчок точкам рэгдолла (м/с): попадания очереди дёргают труп
  function kickRag(vs, idx, x, y, z) {
    const R = vs.n.death && vs.n.death.rag, RG = C.ragdoll; if (!R || !RG || !RG.addVel) return;
    RG.addVel(R, idx, x, y, z); R.still = 0;
  }

  // ------------------------------------------------------------------ расстрел проигравшего субъекта
  // Два охранника выходят из ближайших углов, жертва поднимает дрожащие руки; стволы упираются в виски (пистолет и винтовка с разных сторон).
  // Камера: широкий план с места игрока → врез в лицо через стол с медленным наездом. Выстрел: время почти встаёт, голова дёргается, тело — рэгдоллом
  // (ragdoll.js, режим collapse; стол и стул — коллайдеры), второй охранник бьёт очередью в упавшее тело, первый подходит и добивает в голову (камера у пола, крен).
  function execPlan(vs) {
    const o = { x: Math.sin(vs.theta), z: Math.cos(vs.theta) }, tg = { x: Math.cos(vs.theta), z: -Math.sin(vs.theta) };
    const H = headWorld(vs, new THREE.Vector3());
    const free = S.guards.filter((g) => !g.busy);
    if (!free.length) return null;
    const side = (g) => (((g.n.g.position.x - vs.x) * tg.x + (g.n.g.position.z - vs.z) * tg.z) < 0 ? -1 : 1);
    free.sort((a, b) => Math.hypot(a.n.g.position.x - vs.x, a.n.g.position.z - vs.z) - Math.hypot(b.n.g.position.x - vs.x, b.n.g.position.z - vs.z));
    const a = free[0], b = free.slice(1).find((g) => side(g) !== side(a)) || free[1] || null, s0 = side(a);
    const mk = (gref, kind, sd, ang) => {
      const dir = { x: tg.x * sd * Math.cos(ang) + o.x * Math.sin(ang), z: tg.z * sd * Math.cos(ang) + o.z * Math.sin(ang) };
      const gd = mkGuard(gref, kind, H, dir, HEADR); gd.sd = sd; gd.arm = true; return gd;
    };
    const g1 = mk(a, 'pistol', s0, 0.25), g2 = b ? mk(b, 'rifle', -s0, 0.8) : null;
    const X = newX(g2 ? [g1, g2] : [g1]);
    Object.assign(X, { vs, o, tg, H, g1, g2 });
    const hv = new THREE.Vector3();
    const aim = (gd, out) => {
      const R = vs.n.death && vs.n.death.rag;
      if (gd.mode === 'head') {
        if (R) { ragPt(R, 4, out); out.x += gd.dx * 0.1; out.z += gd.dz * 0.1; }
        else { headWorld(vs, hv); out.set(hv.x + gd.dx * HEADR, hv.y + 0.02, hv.z + gd.dz * HEADR); }
      } else if (!R) out.copy(H);
      else if (gd.mode === 'body') { ragPt(R, 0, out); out.y += 0.05; }
      else if (gd.mode === 'down') { ragPt(R, 4, out); out.y += 0.02; }
      else { ragPt(R, 0, out); out.y = 0.25; out.x += gd.dx * 1.1; out.z += gd.dz * 1.1; }   // 'low': ствол опущен к телу
      return out;
    };
    X.guards.forEach((gd) => { gd.aim = (out) => aim(gd, out); });
    return X;
  }
  // камера у стола: перед лицом жертвы (взгляд поверх ноутбука), медленный наезд; после выстрела — следит за головой
  function frontCam(X) {
    const vs = X.vs, r = S.r, tl = new THREE.Vector3();
    X.t0 = r.time; X.base.set(X.H.x - X.o.x * 1.25, 1.4, X.H.z - X.o.z * 1.25);
    headWorld(vs, X.ls);
    X.cam = (dt, rdt) => {
      const t = r.time - X.t0, R = vs.n.death && vs.n.death.rag, s = X.shock;
      if (R) ragPt(R, 4, tl); else headWorld(vs, tl);
      X.ls.lerp(tl, 1 - Math.exp(-rdt * (R ? 7 : 18)));
      const k = smooth(clamp(t / 3.4, 0, 1)), fv = R ? lerp(38, 48, smooth(clamp((r.time - X.tKill) / 1.2, 0, 1))) : lerp(52, 38, k);
      const tr = (R ? 0.01 : 0.002 + 0.005 * X.pressed) + s * 0.05;
      X.roll += (X.rollT - X.roll) * (1 - Math.exp(-rdt * 5));
      const j = () => (Math.random() - 0.5) * tr;
      let px = X.base.x + X.o.x * 0.22 * k, py = X.base.y - 0.04 * k, pz = X.base.z + X.o.z * 0.22 * k;
      if (R) {
        // стол и ноутбук закрыли бы упавшее тело: камера выезжает наружу, со стороны от центра стола, и смотрит на тело поверх
        const w = smooth(clamp((r.time - X.tKill - 0.4) / 1.3, 0, 1)), hl = Math.hypot(X.ls.x, X.ls.z) || 1;
        const ox = X.ls.x / hl, oz = X.ls.z / hl, side = X.g1 ? X.g1.sd : 1;
        px = lerp(px, X.ls.x + ox * 1.35 - oz * 0.55 * side, w); py = lerp(py, 1.1, w); pz = lerp(pz, X.ls.z + oz * 1.35 + ox * 0.55 * side, w);
      }
      setDir(px + j(), py + j(), pz + j(), X.ls, fv, X.roll + (Math.random() - 0.5) * s * 0.05);
    };
  }
  // камера у пола: смотрит на голову лежащего с той стороны, откуда идёт охранник; крен
  function floorCam(X, hp) {
    const r = S.r, g1 = X.g1, R = X.vs.n.death.rag, tl = new THREE.Vector3(), t0 = r.time;
    const bx = hp.x - g1.dx * 1.8, bz = hp.z - g1.dz * 1.8;
    X.rollT = -0.16;
    X.cam = (dt, rdt) => {
      const t = r.time - t0, s = X.shock, j = () => (Math.random() - 0.5) * (0.003 + s * 0.05);
      ragPt(R, 4, tl); tl.y += 0.08;
      X.ls.lerp(tl, 1 - Math.exp(-rdt * 5));
      X.roll += (X.rollT - X.roll) * (1 - Math.exp(-rdt * 4));
      const k = smooth(clamp(t / 2.4, 0, 1));
      setDir(bx + g1.dx * 0.3 * k + j(), 0.34 + 0.05 * k + j(), bz + g1.dz * 0.3 * k + j(), X.ls, lerp(48, 40, k), X.roll);
    };
  }

  async function runExecution(id) {
    const r = S.r, vs = seatById(id), DC = C.deathcam;
    if (!vs || vs.dead) return;
    if (!DC || !DC.hold || !C.actorGK || !(S.guards || []).some((g) => !g.busy)) return runExecutionOld(id);
    const v = tt();
    const X = execPlan(vs); if (!X) return runExecutionOld(id);
    const { g1, g2 } = X, touched = X.guards.map((gd) => gd.gref);
    S.X = X;
    lockOn();
    try {
      r.bars(true);
      dirBegin(); D.roll = 0;
      const head = new THREE.Vector3(); headWorld(vs, head); head.y += 0.02;
      const eye = new THREE.Vector3(FREE.x, FREE.y, FREE.z);
      const dirIn = dirLook(eye, head, 60, 1.1);
      // жертва замирает с поднятыми руками; охранники берут её на прицел и идут к ней
      vs.fearT = 1; vs.gt = 99; vs.tyaw = 0; vs.tpitch = 0.1; vs.press = -g1.sd;
      touched.forEach((g) => { g.busy = true; g.n.armT = 1; });
      r.setGun(g1.n, 'pistol'); sn('draw');
      await r.wait(0.5);
      const walks = X.guards.map((gd, i) => walkTo(gd, gd.ex, gd.ez, i ? 2.2 : 2.4, i * 0.3));
      await dirIn;
      // широкий план: охранники входят в кадр
      await Promise.race([r.until(() => X.guards.every((gd) => leftDist(gd) < 1.7)), r.wait(6)]);
      // врез: лицо жертвы через стол, стволы входят в кадр с краёв
      r.shake(0.012, 0.2); softFlash(0.12, 0.08); frontCam(X); X.tsT = 0.8; X.tsK = 3;
      await Promise.all(walks);
      X.pressed = 1;
      r.shake(0.014, 0.3); sn('rack'); sn('beat', { k: 1 });
      if (g2) { await r.wait(0.3); sn('draw', { k: 0.7 }); r.shake(0.01, 0.2); }
      X.tsT = 0.55; X.tsK = 2.5;
      await r.wait(0.5); sn('beat', { k: 1 });
      await r.wait(0.5); sn('beat', { k: 1 });
      await r.wait(0.45);
      // ---------------- выстрел
      headWorld(vs, v.a);
      const hx = v.a.x, hy = v.a.y, hz = v.a.z;
      X.ts = 0.2; X.tsT = 0.17; X.tsK = 6; X.tKill = r.time;
      gunFire(g1, 'epistol', true); sn('head'); sn('flesh', { delay: 0.01 });
      r.shake(0.04, 0.5); X.shock = 1;
      v.b.set(hx - g1.n.g.position.x, 0.05, hz - g1.n.g.position.z).normalize();
      tameBlood(() => {
        r.bloodHit(v.a.set(hx, hy, hz), true, 70, v.b);
        r.bloodSpray({ x: hx, y: hy, z: hz }, { x: v.b.x, y: 0.25, z: v.b.z }, 26, 7, true);
      }, 0.5);
      vs.dead = true; vs.rag = true; vs.fearT = 0; vs.fear = 0; vs.lap.key = '';
      // тело падает по линии выстрела (от охранника) рэгдоллом; стол и стул — твёрдые
      vs.n.pForce = { side: g1.sd, imp: 5.4 };
      r.actorKill(vs.n, true, { x: g1.n.g.position.x, z: g1.n.g.position.z });
      const Rg = vs.n.death && vs.n.death.rag;
      if (Rg) { Rg.hold = true; tableCols().concat(seatCols(vs)).forEach((c) => Rg.cols.push(c)); }
      X.rollT = 0.2 * g1.sd;
      const spl = DC.lensSplat && DC.lensSplat(r); if (spl) setTimeout(() => spl.remove(), 4200);
      if (vs.pool) { vs.pool.visible = true; vs.poolK = 0.35; }
      r.tween(0.7, (k) => { vs.swivel = g1.sd * 0.9 * smooth(k); }, smooth);
      g2 && (g2.mode = 'body');
      setTimeout(() => { X.tsT = 1; X.tsK = 1.25; }, 420);
      await r.wait(0.35);
      // первый опускает ствол; второй отступает на шаг и берёт тело на мушку
      g1.mode = 'low'; g1.ak = 6; sn('fall', { k: 0.6 });
      if (g2) { g2.walking = true; r.walk(g2.n, [g2.ex + g2.dx * 0.55, g2.ez + g2.dz * 0.55], 1.8).then(() => { g2.walking = false; }); }
      await r.wait(0.5);
      // ---------------- добивание очередью в упавшее тело
      if (g2 && Rg) {
        for (let i = 0; i < 4; i += 1) {
          gunFire(g2, 'erifle', false); X.shock = Math.max(X.shock, 0.5);
          ragPt(Rg, 0, v.c); r.bloodSpray({ x: v.c.x, y: v.c.y + 0.1, z: v.c.z }, { x: -g2.dx * 0.5, y: 0.7, z: -g2.dz * 0.5 }, 5, 3.5, false);
          kickRag(vs, -1, -g2.dx * 0.5, 0.7, -g2.dz * 0.5); sn('flesh', { delay: 0.01 });
          await r.wait(0.11);
        }
      }
      g2 && (g2.mode = 'low');
      await r.wait(0.5);
      // первый подходит к голове лежащего и стреляет в упор; камера у пола
      if (Rg) {
        ragPt(Rg, 4, v.d);
        const hp = { x: v.d.x, y: v.d.y, z: v.d.z };
        floorCam(X, hp); softFlash(0.18, 0.08); r.shake(0.012, 0.2);
        X.tsT = 0.7; X.tsK = 3;
        g1.walking = true;
        await r.walk(g1.n, [hp.x + g1.dx * 0.5, hp.z + g1.dz * 0.5], 1.7); g1.walking = false;
        g1.mode = 'down'; g1.ak = 12; g1.lean = 0.5; sn('rack', { k: 0.8 });
        X.tsT = 0.5;
        await r.wait(0.75);
        X.ts = 0.25; X.tsT = 0.2; X.tsK = 6;
        gunFire(g1, 'epistol', true); sn('head'); X.shock = 1; r.shake(0.03, 0.35);
        ragPt(Rg, 4, v.c); r.bloodSpray({ x: v.c.x, y: v.c.y + 0.05, z: v.c.z }, { x: 0, y: 1, z: 0 }, 16, 4.5, true);
        kickRag(vs, 4, 0, 1.2, 0); r.decal(v.c.x, v.c.z, 0.5, 1);
        setTimeout(() => { X.tsT = 1; X.tsK = 1.5; }, 380);
        await r.wait(0.7);
      } else await r.wait(1.2);
      // ---------------- отход
      g1.mode = 'low'; g1.lean = 0.2;
      await r.wait(0.9);
      X.cam = null; X.tsT = 1; X.tsK = 3;
      const rl = D.roll; r.tween(1.4, (k) => { D.roll = rl * (1 - smooth(k)); });
      if (Rg) ragPt(Rg, 0, v.d); else v.d.copy(head);
      const back = dirLook(eye, v.d.clone(), 60, 1.8);
      await Promise.all([back].concat(X.guards.map((gd) => { gd.on = false; gd.n.armT = 0; gd.walking = true; return r.walk(gd.n, [gd.home.x, gd.home.z], 2.0).then(() => { gd.walking = false; }); })));
      X.guards.forEach((gd) => { gd.n.yaw = gd.home.yaw; r.setGun(gd.n, 'rifle'); });
      if (Rg) Rg.hold = false;
      await dirEnd(1.0);
      r.bars(false);
    } finally {
      D.on = false; D.roll = 0; D.tr = 0;
      r.timeScale = 1;
      if (S) S.X = null;
      X.guards.forEach((gd) => { gd.on = false; });
      touched.forEach((g) => { g.busy = false; g.n.armT = 0; });
      lockOff();
      if (alive()) refreshObjective(true);
    }
  }

  // запасной вариант (без deathcam.js): охранник из дальнего угла подходит и стреляет в голову
  async function runExecutionOld(id) {
    const r = S.r, vs = seatById(id);
    if (!vs || vs.dead) return;
    const v = tt();
    lockOn();
    try {
      r.bars(true);
      dirBegin();
      const head = new THREE.Vector3(); vs.n.head.getWorldPosition(head); head.y += 0.1;
      const eye = new THREE.Vector3(FREE.x, FREE.y, FREE.z);
      dirLook(eye, head, 62, 1.1);
      await r.wait(1.5);
      // охранник: ближайший угол
      const o = { x: Math.sin(vs.theta), z: Math.cos(vs.theta) }, tg = { x: Math.cos(vs.theta), z: -Math.sin(vs.theta) };
      const spot = [vs.x + o.x * 0.72 - tg.x * 0.5, vs.z + o.z * 0.72 - tg.z * 0.5];
      let gd = null, best = 1e9;
      S.guards.forEach((g) => { if (g.busy) return; const d = Math.hypot(g.n.g.position.x - spot[0], g.n.g.position.z - spot[1]); if (d < best) { best = d; gd = g; } });
      gd.busy = true;
      const g = gd.n;
      r.setGun(g, 'pistol'); g.armT = 0; sn('draw');
      const cam = new THREE.Vector3(vs.x + tg.x * 1.35 + o.x * 0.2, 1.42, vs.z + tg.z * 1.35 + o.z * 0.2);
      await Promise.all([r.walk(g, spot, 2.1), dirLook(cam, head, 46, 2.6)]);
      // прицеливание
      g.yaw = Math.atan2(head.x - g.g.position.x, head.z - g.g.position.z);
      await r.wait(0.4);
      g.armT = 1; sn('rack');
      await r.wait(0.85);
      // выстрел
      shot('epistol', {});
      g.kick = 1; muzzleBoom(gd, false);
      v.b.set(head.x - g.g.position.x, 0.05, head.z - g.g.position.z).normalize();
      r.bloodHit(head, true, 70, v.b);
      sn('head'); sn('flesh', { delay: 0.01 });
      r.shake(0.012, 0.25);
      vs.recoil = 1; vs.dead = true;
      vs.lap.key = '';
      await r.tween(1.1, (k) => { vs.slump = smooth(k); });
      sn('fall', { k: 0.6 });
      if (vs.pool) { vs.pool.visible = true; vs.poolK = 0; }
      r.decal(vs.x + o.x * 0.1, vs.z + o.z * 0.1, 0.55, 1);
      r.decal(vs.x + o.x * 0.3 + tg.x * 0.2, vs.z + o.z * 0.3 + tg.z * 0.2, 0.3, 1);
      await r.wait(1.3);
      // охранник уходит
      g.armT = 0;
      await r.wait(0.35);
      const back = dirLook(eye, head, 62, 1.6);
      await Promise.all([r.walk(g, [gd.home.x, gd.home.z], 2.0), back]);
      g.yaw = gd.home.yaw; r.setGun(g, 'rifle'); gd.busy = false;
      await dirEnd(1.0);
      r.bars(false);
    } finally {
      D.on = false;
      lockOff();
      if (alive()) refreshObjective(true);
    }
  }

  function teleportGuard(gd, x, z, yaw, gun) {
    const r = S.r, n = gd.n;
    n.goal = null; n.g.position.x = x; n.g.position.z = z; n.yaw = n.g.rotation.y = yaw; n.armT = 0; n.g.visible = true; gd.busy = true;
    r.setGun(n, gun); n.lx = x; n.lz = z;
  }

  // число игрока угадали: ноутбук ломается, охранник сзади достаёт пистолет, выстрел, чёрный экран, цитата, возврат в лобби
  async function runPlayerDeath() {
    const r = S.r, us = S.seats[0];
    S.endReason = 'dead'; S.dying = true;
    lockOn();
    S.forceFocus = true;
    r.bars(true);
    try {
      await r.wait(1.7);                                   // на экране видно CORRECT
      r.sfx('error'); sn('glass'); S.crash = 1; r.glitch(0.5); r.shake(0.025, 0.8);
      await r.wait(0.6);
      S.crash = 2; sn('boom', { k: 0.22 }); r.shake(0.04, 0.9);
      await r.wait(1.0);
      S.crash = 3; sn('glass', { k: 0.8 }); r.shake(0.03, 0.5);
      // свет мигает; пока темно, охранники встают за спиной
      const fl = r.flicker(7);
      await r.wait(0.25);
      const gs = S.guards;
      teleportGuard(gs[0], 0, 2.75, PI, 'pistol');
      teleportGuard(gs[1], -1.05, 2.55, PI, 'rifle');
      teleportGuard(gs[2], 1.05, 2.55, PI, 'rifle');
      await fl;
      // поворот кресла
      S.forceFocus = false; S.noFocus = true;
      dirBegin();
      const p0 = D.pos.clone(), y0 = D.yaw, pi0 = D.pitch, f0 = D.fov, end = new THREE.Vector3(0, 1.31, R_SEAT - 0.13);
      us.free = true; us.slump = 0;
      sn('beat', { k: 0.9 }); sn('beat', { k: 0.9, delay: 0.75 });
      await r.tween(1.4, (k) => { D.pos.lerpVectors(p0, end, k); D.yaw = y0 - PI * k; D.pitch = lerp(pi0, -0.04, k); D.fov = lerp(f0, 72, k); us.swivel = -PI * k; }, smooth);
      S.ui.typing = false;
      await r.wait(0.6);
      // охранники делают шаг вперёд и вжимают стволы: центральный — между глаз у самого объектива, боковые — в виски
      const H = new THREE.Vector3(0, 1.3, R_SEAT - 0.12);
      const mkp = (i, kind, ang, hr) => { const gd = mkGuard(gs[i], kind, H, { x: Math.sin(ang), z: Math.cos(ang) }, hr); gd.aim = (out) => out.set(H.x + gd.dx * gd.hr, H.y + 0.02, H.z + gd.dz * gd.hr); return gd; };
      const X = S.X = newX([mkp(0, 'pistol', 0, 0.17), mkp(1, 'rifle', -0.78, HEADR), mkp(2, 'rifle', 0.78, HEADR)]);
      sn('draw'); await r.wait(0.55);
      sn('rack'); await r.wait(0.45);
      X.guards.forEach((gd) => { gd.n.armT = 1; });
      sn('beat', { k: 1 });
      await r.wait(0.35);
      X.guards.forEach((gd, i) => { gd.on = true; walkTo(gd, gd.ex, gd.ez, i ? 0.8 : 1.0, 0); });
      D.tr = 0.004;
      await r.wait(0.55);
      // взгляд направо (на охранника справа) и налево
      const pos = D.pos.clone(), gp = (gd) => new THREE.Vector3(gd.ex, 1.55, gd.ez);
      const yawR = D.yaw + wrap(lookYP(pos, gp(X.guards[1]), {}).yaw - D.yaw), yawL = D.yaw + wrap(lookYP(pos, gp(X.guards[2]), {}).yaw - D.yaw);
      await dirTo(pos, yawR, 0.02, 66, 0.8);
      await r.wait(0.4);
      await dirTo(pos, yawL, 0.02, 66, 1.15);
      await r.wait(0.35);
      sn('beat', { k: 1 }); sn('beat', { k: 1, delay: 0.6 });
      await dirLook(pos, new THREE.Vector3(0, 1.3, X.guards[0].ez), 58, 0.8);
      await r.wait(0.9);
      // выстрел: только вспышка и миллисекунда звука Glock — и чёрный экран
      D.tr = 0;
      muzzleBoom(gs[0], true, true);
      shot('pistol', { len: 0.06 });
      r.shake(0.03, 0.1);
      await real(70);
      const fade = r.qs('.m-fade'); fade.style.transition = 'none'; fade.style.opacity = '1';
      try { if (r.snd) r.snd.out.disconnect(); } catch (e) {}
      S.hooks.stopMusic && S.hooks.stopMusic();
      await real(1200);
      if (!alive()) return;
      // цитата: 2 с появление, пауза на чтение, 1 с затухание, 1 с чёрного
      const qt = (window.NexaQuotes && window.NexaQuotes.pick()) || { text: 'ЗАКРЫТО.', by: '' };
      const el = S.quoteEl;
      el.querySelector('.q').textContent = qt.text; el.querySelector('.by').textContent = qt.by ? '— ' + qt.by : '';
      void el.offsetWidth;
      el.style.transition = 'opacity 2s ease'; el.style.opacity = '1';
      await real(2000 + clamp(1600 + qt.text.length * 55, 2200, 6500));
      if (!alive()) return;
      el.style.transition = 'opacity 1s ease'; el.style.opacity = '0';
      await real(2000);
      if (alive()) r.finish(false);
    } catch (e) { console.error('[table death]', e); if (alive()) r.finish(false); }
  }

  // ------------------------------------------------------------------ события игры (app.js пересылает сюда)
  function onEvent(ev, data) {
    if (!S || !S.ready || !alive()) return;
    const game = S.game, r = S.r;
    if (ev === 'participants-ready' || ev === 'restart') {
      if (ev === 'restart' && S.dying) return;
      if (S.seats.length !== game.state.players.length && ev === 'participants-ready') { /* число участников не меняется внутри сессии */ }
      reseat();
    } else if (ev === 'picking-started') {
      S.ui.buf = ''; S.ui.typing = false; S.ui.note = null;
      refreshObjective(true);
    } else if (ev === 'number-locked') {
      if (data && data.user) { S.ui.typing = false; S.ui.buf = ''; }
    } else if (ev === 'guess-result') {
      S.verdictT = r.time;
      if (data && data.result === 'CORRECT') {
        S.ui.typing = false;
        if (S.hooks.kill) { S.hooks.kill(data.targetId); return; }
        game.hold(true); S.heldNow = true;
        if (data.targetId === '083') runPlayerDeath();
        else runExecution(data.targetId).catch((e) => { console.error('[table exec]', e); });
      }
    } else if (ev === 'match-complete') {
      refreshObjective(true);
    } else if (ev === 'menu') {
      if (!S.leaving && !S.dying) { S.endReason = 'menu'; r.finish(false); }
    }
  }
  function onUpdate() { if (S && S.ready && alive()) refreshObjective(); }

  // ------------------------------------------------------------------ вход / выход
  function installOverrides(r) {
    // «E» и кнопка A геймпада (его вызывает pollPad) — клик по наведённой кнопке или нажатие выбранной клавиши цифровой панели
    r.useTarget = function () {
      if (this.locked || this.paused) return;
      if (S.ui.typing && !this.touch && this.padActive) { padKey(PADKEYS[S.padSel]); return; }
      clickAt();
    };
    // обзор: свои углы (камеру ведёт placeCamera), игрок на месте
    r.turnBy = function (dx, dy) {
      if (this.locked || this.paused) return;
      dx = clamp(dx, -0.4, 0.4); dy = clamp(dy, -0.4, 0.4);
      const sens = C.getSens() * (1 - 0.6 * V.f);
      V.yaw = clamp(V.yaw - dx * sens, -2.2, 2.2);
      V.pitch = clamp(V.pitch - dy * sens, -1.3, 1.2);
    };
    r.movePlayer = function () { this.p.moving = 0; };
    r.placeCamera = placeCamera;
  }

  function bindTable(r) {
    // ввод: клавиатура
    r.on(document, 'keydown', (e) => {
      if (!S || r.locked || r.paused) return;
      if (e.code === 'KeyK' && !e.repeat) { r.padActive = false; setTyping(!S.ui.typing); e.preventDefault(); return; }
      if (!S.ui.typing) return;
      const dm = /^(?:Digit|Numpad)(\d)$/.exec(e.code), dg = dm ? dm[1] : (/^\d$/.test(e.key) ? e.key : null);
      if (dg !== null) { addDigit(dg); e.preventDefault(); }
      else if (e.code === 'Backspace') { backspace(); e.preventDefault(); }
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') { submit(); e.preventDefault(); }
    });
    // мышь: клик по дисплею. Если браузер не дал pointer lock — клик засчитывается по отпусканию кнопки без движения
    let dx0 = 0, dy0 = 0, dn = false;
    r.on(document, 'mousedown', (e) => {
      if (e.button !== 0 || r.touch || r.paused || r.locked) return;
      r.padActive = false;
      if (document.pointerLockElement) { clickAt(); return; }
      dn = true; dx0 = e.clientX; dy0 = e.clientY;
    });
    r.on(window, 'mouseup', (e) => {
      if (!dn) return; dn = false;
      if (e.button === 0 && Math.hypot(e.clientX - dx0, e.clientY - dy0) < 5) clickAt();
    });
    // тач: касание по дисплею — фокус/клик, касание в сторону — отпустить; кнопки TYPE/BACK и цифровая панель
    if (r.touch) {
      const Z = r.qs('.m-zone.r');
      let t0 = 0, sx = 0, sy = 0, id = null;
      r.on(Z, 'pointerdown', (e) => { id = e.pointerId; t0 = performance.now(); sx = e.clientX; sy = e.clientY; });
      const up = (e) => {
        if (e.pointerId !== id) return; id = null;
        if (r.locked || r.paused || performance.now() - t0 > 320 || Math.hypot(e.clientX - sx, e.clientY - sy) > 14) return;
        if (S.ui.typing) return;
        const h = tapHit(e.clientX, e.clientY);
        if (h.ok && h.gap < 0.03) {
          if (!S.touchFocus) { S.touchFocus = true; return; }
          const hid = hotAt(h.px, h.py); if (hid) act(hid);
        } else S.touchFocus = false;
      };
      r.on(Z, 'pointerup', up); r.on(Z, 'pointercancel', () => { id = null; });
    }
    r.on(S.uiEl.querySelector('.t-type'), 'pointerdown', (e) => { e.preventDefault(); if (!S.touchFocus) S.touchFocus = true; setTyping(true); });
    r.on(S.uiEl.querySelector('.t-back'), 'pointerdown', (e) => { e.preventDefault(); setTyping(false); });
    S.padEl.querySelectorAll('button').forEach((b, i) => r.on(b, 'pointerdown', (e) => { e.preventDefault(); S.padSel = i; padKey(PADKEYS[i]); }));
    // ход игры стоит на паузе игрока и во время катсцен (таймер выбора числа не трогаем)
    r.intervals.push(setInterval(() => {
      if (!S || !alive()) return;
      const want = !!(S.cutHold || r.paused);
      if (want !== !!S.game.held) { S.heldNow = want; S.game.hold(want); }
    }, 200));
    r.hooks.push(tick);
  }

  MISSIONS.table = {
    title: 'HIGH / LOW',
    build(r) { build(r); },
    async play(r) {
      bindTable(r);
      lockOn();
      const g = new THREE.Vector3();
      r.bars(true);
      dirSet(new THREE.Vector3(0, 3.6, 3.4), g.set(0, 0.8, 0), 62);
      r.fade(0, 1.6);
      await r.wait(0.5);
      const tgt = new THREE.Vector3(FREE.x, FREE.y, FREE.z);
      await dirTo(tgt, V.yaw, V.pitch, FREE.fov, 3.2);
      await dirEnd(0.5);
      r.bars(false);
      lockOff();
      refreshObjective(true);
    }
  };

  window.HLTable = {
    get active() { return !!S; },
    get state() { return S; },
    relabel() { if (S && S.ready && alive()) S.seats.forEach((s) => { drawCard(s.card, s.id); s.lap.key = ''; }); },
    get debug() { return { V, D, act, setTyping, submit, addDigit, runExecution, runPlayerDeath, seatById, tapHit }; },
    start(game, hooks) {
      if (S || !window.Missions || window.Missions.current) return false;
      S = { game, hooks: hooks || {}, r: null, run: null, ready: false, endReason: null, leaving: false, dying: false, heldNow: false, cutHold: false, frame: 0, t: 0, X: null,
        ui: { buf: '', typing: false, caret: false, hover: null, note: null }, crash: 0, verdictT: -9, padPrev: [], padSel: 4, touchFocus: false, forceFocus: false, noFocus: false, crossOn: false, crossHot: false };
      V.yaw = 0; V.pitch = -0.42; V.f = 0; V.typ = 0; V.engaged = false; D.on = false; D.w = 0;
      const run = window.Missions.start('table', {
        audio: S.hooks.audio, playSfx: S.hooks.playSfx,
        onComplete: endSession, onExit: endSession
      });
      if (!run) { S = null; return false; }
      S.run = run;
      return true;
    },
    onUpdate(state) { onUpdate(state); },
    onEvent(ev, data) { onEvent(ev, data); },
    stop() { if (S && S.run && !S.run.disposed) { S.endReason = S.endReason || 'menu'; S.run.finish(false); } }
  };

  function endSession() {
    const s = S; if (!s) return;
    const reason = !s.run || !s.run.entered ? 'fail' : (s.endReason || 'menu');
    S = null;
    if (reason === 'fail') { try { s.game.hold(false); } catch (e) {} }
    s.hooks.onEnd && s.hooks.onEnd(reason);
  }
}());
