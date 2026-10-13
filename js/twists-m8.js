// NEXA: «удивляющие штуки» миссий 8–16 (ядро и реестр — js/twists.js, описание — MISSION_TWISTS.md). Тексты: английский исходник, переводы — js/i18n-twists.js.
(function () {
  'use strict';
  const TW = window.Twists;
  if (!TW) return;
  const { clamp, rnd } = TW;
  const mk = (cls, html) => { const e = document.createElement('div'); e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const bar = (k) => '<div style="height:4px;background:rgba(255,255,255,.2);margin:6px 0"><i style="display:block;height:100%;width:' + Math.round(clamp(k, 0, 1) * 100) + '%;background:#fff"></i></div>';

  // ===================================================================== 10 LIFT SHAFT — трос рвётся
  // На 3-й волне (≈33 с подъёма) трос лопается: 10 секунд свободного падения в замедлении, укрытия «отрывает» от пола; присед [C] перед ударом гасит урон.
  TW.add(10, {
    name: 'cable-snap',
    setup(r, T) {
      const S = T.s;
      S.prog = 0; S.fall = null; S.done = false;
      S.cover = [[-3.5, -3], [3.5, -3], [-3.5, 3], [3.5, 3], [0, 1.2]].map((p) => {
        const m = r.scene.children.find((o) => o.userData && o.userData.col && Math.abs(o.position.x - p[0]) < 0.05 && Math.abs(o.position.z - p[1]) < 0.05);
        return m ? { m, col: m.userData.col, y0: m.position.y, rx: m.rotation.x, rz: m.rotation.z, ph: Math.random() * 6 } : null;
      }).filter(Boolean);
    },
    phase(r, T, name) {
      const S = T.s;
      S.prog = 0; S.done = false; S.fall = null;
      T.att(() => this.end(r, T, true));
    },
    reset(r, T) { this.end(r, T, true); },
    end(r, T, silent) {
      const S = T.s;
      if (S.cover) S.cover.forEach((c) => { c.m.position.y = c.y0; c.m.rotation.x = c.rx; c.m.rotation.z = c.rz; c.col.off = false; });
      if (S.fovAdd) { r.baseFov -= S.fovAdd; S.fovAdd = 0; }
      if (S.fall) { r.timeScale = 1; r.extraShake = 0; r.lightsLevel(r.baseLight || 1); r.banner(null); S.fall = null; }
      const fl = S.flashEl; if (fl) fl.style.opacity = '0';
    },
    tick(r, T, dt) {
      const S = T.s;
      if (T.ph !== 'lift' || r.locked) return;
      S.prog += dt;
      if (!S.done && !S.fall && S.prog >= 33) this.begin(r, T);
      const f = S.fall; if (!f) return;
      const k = r.timeScale || 1, rdt = dt / k;
      f.t += rdt; r.timeScale = 0.5;
      r.extraShake = 0.012;
      // полосы тоннелей несутся вверх: мы падаем
      r.tun.forEach((t) => t.bars.forEach((b) => { b.position.y = (((b.position.y + dt * 14) % 4) + 4) % 4; }));
      S.cover.forEach((c) => { c.m.position.y = c.y0 + 0.5 + Math.sin(f.t * 2 + c.ph) * 0.25; c.m.rotation.x = Math.sin(f.t * 1.3 + c.ph) * 0.35; c.m.rotation.z = Math.cos(f.t * 1.1 + c.ph) * 0.3; });
      r.lightsLevel((r.baseLight || 1) * (0.62 + 0.38 * Math.abs(Math.sin(f.t * 9))));
      const left = Math.max(0, Math.ceil(10 - f.t));
      r.banner('FREE FALL — IMPACT IN ' + left, left <= 3);
      if (S.flashEl) S.flashEl.style.opacity = String(0.25 + 0.2 * Math.sin(f.t * 8));
      if (f.t >= 10) this.impact(r, T);
    },
    begin(r, T) {
      const S = T.s;
      S.fall = { t: 0 };
      if (!S.fovAdd) { S.fovAdd = 12; r.baseFov += 12; }
      S.cover.forEach((c) => { c.col.off = true; });
      if (!S.flashEl) S.flashEl = T.panel('tw-flashred', '', true);
      r.snd && r.snd.play('alarm');
      r.flash(0.3); r.glitch && r.glitch(0.25);
      r.hint(r.touch ? 'THE CABLE SNAPPED! NO COVER — CROUCH TO BRACE FOR IMPACT' : 'THE CABLE SNAPPED! NO COVER — CROUCH [C] TO BRACE FOR IMPACT', 5);
      r.say('SYSTEM', 'ТРОС ОБОРВАН. СВОБОДНОЕ ПАДЕНИЕ.', 2.2);
    },
    impact(r, T) {
      const S = T.s;
      S.done = true; S.fall = null;
      r.timeScale = 1; r.extraShake = 0; r.banner(null);
      if (S.fovAdd) { r.baseFov -= S.fovAdd; S.fovAdd = 0; }
      r.lightsLevel(r.baseLight || 1);
      // укрытия возвращаются на пол; если игрок стоит на их месте — вытолкнуть
      S.cover.forEach((c) => { c.m.position.y = c.y0; c.m.rotation.x = c.rx; c.m.rotation.z = c.rz; c.col.off = false; });
      const p = r.p;
      if (r.blocked(p.x, p.z)) {
        for (let d = 0.4; d < 4; d += 0.4) {
          let ok = false;
          for (let a = 0; a < 16 && !ok; a += 1) { const x = p.x + Math.cos(a * 0.3927) * d, z = p.z + Math.sin(a * 0.3927) * d; if (!r.blocked(x, z)) { p.x = x; p.z = z; ok = true; } }
          if (ok) break;
        }
      }
      const braced = !!(r.pm && (r.pm.crouch || r.pm.sl));
      r.snd && r.snd.play('boom', { k: 0.8 });
      r.shake(0.1, 1.1); r.flash(0.5);
      if (braced) { T.bonus(15, 'BRACED FOR IMPACT'); r.hint('BRACED — NO DAMAGE', 2.4); }
      else { const dmg = Math.min(30, Math.max(0, r.hp - 8)); if (dmg > 0) r.hurt(dmg); r.hint('IMPACT', 1.6); }
      T.foes().forEach((e) => r.damageEnemy(e, 22, false));
      r.pickup(0, 3.8, 'health', { amount: 40 });
    }
  });

  // ===================================================================== 11 BLACKOUT — фонарь как приманка
  // [T] выключает фонарь: враги вдали теряют вас (подойти ближе 6.5 м, выстрелить или рвануть бегом — найдут), но и вы их почти не видите (туман гуще).
  // Батарея 90 с горения; +30 с за каждый восстановленный предохранитель.
  TW.add(11, {
    name: 'torch-lure',
    setup(r, T) {
      const S = T.s;
      S.batt = 90; S.on = true; S.fog0 = r.scene.fog ? r.scene.fog.density : 0.02;
      S.el = T.panel('tw-corner tw-box', '<h3>TORCH <span>[T]</span></h3><div class="tw-bar"></div><p class="tw-st"></p>', true);
      S.bar = S.el.querySelector('.tw-bar'); S.st = S.el.querySelector('.tw-st');
      S.el.style.minWidth = '150px';
      const toggle = () => { if (S.batt <= 0 && !S.on) { r.toast('TORCH BATTERY EMPTY', 1.4); return; } S.on = !S.on; r.snd && r.snd.play('click'); this.apply(r, T); };
      T.key('KeyT', toggle);
      T.btn('TORCH', 'right: 120px; bottom: 170px;', toggle);
      this.apply(r, T); S.shown = '';
      T.after(4.5, () => r.hint(r.touch ? 'TORCH BUTTON — SWITCH IT OFF AND THEY LOSE YOU (YOU LOSE THEM TOO)' : 'TORCH [T] — SWITCH IT OFF AND THEY LOSE YOU (YOU LOSE THEM TOO)', 6));
    },
    apply(r, T) {
      const S = T.s;
      r.torchKeep = S.on ? 1.2 : 0; r.torch.intensity = r.torchKeep;
      if (r.scene.fog) r.scene.fog.density = S.on ? S.fog0 : S.fog0 * 2.2;
    },
    phase(r, T, name) {
      const S = T.s;
      if (/^fuse[23]$|^hall$/.test(name) && !S.fed[name]) { S.fed[name] = 1; S.batt = Math.min(90, S.batt + 30); r.hint('TORCH BATTERY +30 S', 2.4); }
      this.apply(r, T);
    },
    reset(r, T) { const S = T.s; if (S.batt < 20) S.batt = 20; if (S.batt > 0 && !S.on) S.on = true; this.apply(r, T); },
    tick(r, T, dt) {
      const S = T.s;
      if (!S.fed) S.fed = {};
      if (S.on && !r.locked) {
        S.batt = Math.max(0, S.batt - dt);
        if (S.batt <= 0) { S.on = false; this.apply(r, T); r.toast('TORCH BATTERY EMPTY', 2); }
      }
      const sig = (S.on ? 1 : 0) + ':' + Math.ceil(S.batt) + ':' + (S.batt <= 0 ? 1 : 0);
      if (sig !== S.shown) {
        S.shown = sig;
        S.bar.innerHTML = bar(S.batt / 90) + '<span>' + Math.ceil(S.batt) + '</span>';
        S.st.textContent = S.batt <= 0 ? 'BATTERY EMPTY' : S.on ? 'TORCH ON' : 'TORCH OFF — HIDDEN';
      }
    },
    enemy(r, T, e) {
      if (e.ai || (e.t && e.t.passive)) return;
      const S = T.s;
      e.ai = (q, dt, run, dist) => {
        const sprint = run.keys && (run.keys.ShiftLeft || run.keys.ShiftRight) && run.p.moving > 0.3;
        const see = S.on || dist < 6.5 || (run.time - (run.twShotT || -99)) < 2.5 || (sprint && dist < 11) || q.hp < q.max;
        if (see) { q.twLast = [run.p.x, run.p.z]; q.twLost = false; return false; }
        const g = q.n.g;
        if (!q.twLost) { q.twLost = true; q.twGoal = null; q.twT = 0; if (!q.twLast) q.twLast = [run.p.x, run.p.z]; }
        if (q.stagger > 0) { q.stagger -= dt; q.n.creeping = false; return true; }
        q.twT -= dt;
        if (!q.twGoal || q.twT <= 0 || Math.hypot(q.twGoal[0] - g.position.x, q.twGoal[1] - g.position.z) < 0.5) {
          const L = q.twLast, a = Math.random() * 6.283, d = q.twGoal ? rnd(1.5, 4.5) : 0;
          q.twGoal = [L[0] + Math.sin(a) * d, L[1] + Math.cos(a) * d]; q.twT = rnd(2, 3.5);
        }
        const dx = q.twGoal[0] - g.position.x, dz = q.twGoal[1] - g.position.z, d = Math.hypot(dx, dz) || 1, sp = 1.2 * (q.speedMul || 1);
        q.n.yaw = Math.atan2(dx, dz);
        const nx = g.position.x + dx / d * sp * dt, nz = g.position.z + dz / d * sp * dt;
        if (!run.blockedE(nx, g.position.z)) g.position.x = nx;
        if (!run.blockedE(g.position.x, nz)) g.position.z = nz;
        q.n.creeping = true; q.n.armT = 0; q.tele = 0; q.burst = 0;
        return true;
      };
    }
  });

  // ===================================================================== 12 NIGHT TRAIN — силуэт на платформе
  // В третьем вагоне одно окно не бежит вместе с остальными: на «станции» стоит тёмный силуэт Субъекта 024 и смотрит на поезд.
  // Присмотришься — повернёт голову к вам и исчезнет, едва отведёте взгляд (камео без слов).
  TW.add(12, {
    name: 'platform-figure',
    setup(r, T) {
      const S = T.s, T3 = window.THREE;
      const mkTex = (face) => {
        const c = document.createElement('canvas'); c.width = 256; c.height = 256;
        const g = c.getContext('2d');
        const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#d8d8d8'); gr.addColorStop(1, '#8a8a8a');
        g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
        g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 256, 18);                       // фонарь платформы
        g.fillStyle = '#5d5d5d'; g.fillRect(0, 228, 256, 28);                     // край платформы
        g.fillStyle = '#bdbdbd'; g.fillRect(0, 222, 256, 6);
        g.fillStyle = '#060606';
        g.beginPath(); g.arc(128, 78, 21, 0, 6.283); g.fill();                    // голова
        g.beginPath(); g.moveTo(104, 100); g.lineTo(152, 100); g.lineTo(162, 150); g.lineTo(156, 224); g.lineTo(100, 224); g.lineTo(94, 150); g.closePath(); g.fill(); // тело
        g.fillRect(90, 108, 12, 74); g.fillRect(154, 108, 12, 74);               // руки вдоль тела
        if (face) { g.fillStyle = '#fff'; g.fillRect(118, 74, 6, 4); g.fillRect(133, 74, 6, 4); }
        const t = new T3.CanvasTexture(c); t.minFilter = T3.LinearFilter; return t;
      };
      S.texA = mkTex(false); S.texB = mkTex(true);
      const mat = new T3.MeshBasicMaterial({ map: S.texA, fog: false, transparent: true });
      const m = new T3.Mesh(new T3.PlaneGeometry(1.7, 1.2), mat);
      m.position.set(-2.69, 1.78, -28); m.rotation.y = Math.PI / 2;
      r.scene.add(m);
      S.m = m; S.mat = mat; S.seen = 0; S.state = 0; S.said = false;
    },
    tick(r, T, dt) {
      const S = T.s;
      if (!S.m || S.state === 2) return;
      S.m.visible = r.win && r.win.length ? r.win[0].visible : true;
      if (!S.m.visible) return;
      const cam = r.camera.position, m = S.m.position;
      const dx = m.x - cam.x, dy = m.y - cam.y, dz = m.z - cam.z, d = Math.hypot(dx, dy, dz);
      if (d > 11 || d < 0.5) { S.seen = 0; return; }
      const f = r.p, fx = -Math.sin(f.yaw) * Math.cos(f.pitch), fy = Math.sin(f.pitch), fz = -Math.cos(f.yaw) * Math.cos(f.pitch);
      const dot = (fx * dx + fy * dy + fz * dz) / d;
      const looking = dot > 0.88;
      if (S.state === 0) {
        if (looking) { S.seen += dt; if (!S.said && S.seen > 0.5) { S.said = true; r.hint('SUBJECT 024 — STANDING ON THE PLATFORM, WATCHING THE TRAIN', 4.5); } if (S.seen > 2.4) { S.state = 1; S.mat.map = S.texB; S.mat.needsUpdate = true; r.glitch && r.glitch(0.18); } }
        else S.seen = Math.max(0, S.seen - dt * 0.5);
      } else if (S.state === 1 && dot < 0.72) {
        S.state = 2; S.m.visible = false; r.glitch && r.glitch(0.12);
      }
    }
  });

  // ===================================================================== 8 PROFICIENCY TEST — призрак прошлого испытуемого
  // На каждом этапе по полигону бежит прозрачный силуэт Субъекта 024 с «рекордным» временем. Уложился быстрее — бонус и «SUBJECT 024 BEATEN».
  TW.add(8, {
    name: 'ghost-subject',
    REC: { static: 45, moving: 40, live: 70 },
    setup(r, T) {
      const S = T.s;
      S.el = T.panel('tw-corner tw-box tw-rows', '<h3>SUBJECT 024</h3><p><span>RECORD</span><b class="tw-n">0</b></p>', true);
      S.el.style.display = 'none'; S.n = S.el.querySelector('.tw-n');
      S.stage = ''; S.wins = 0;
    },
    settle(r, T) {
      const S = T.s; if (!S.stage || S.settled) return;
      S.settled = true;
      const el = T.t - S.t0, rec = this.REC[S.stage];
      if (el < rec) { S.wins += 1; T.bonus(15, 'SUBJECT 024 BEATEN'); r.hint('SUBJECT 024 BEATEN', 3); }
      else r.hint('SUBJECT 024 WAS FASTER', 2.6);
      if (S.g) S.g.show(false);
    },
    phase(r, T, name) {
      const S = T.s;
      if (!this.REC[name]) return;
      if (S.stage && S.stage !== name) this.settle(r, T);
      S.stage = name; S.t0 = T.t; S.settled = false;
      if (!S.g) S.g = T.ghost({ opacity: 0.32 });
      S.g.show(true); S.el.style.display = ''; S.n.textContent = this.REC[name];
    },
    reset(r, T) { const S = T.s; if (S.g) S.g.show(false); },
    tick(r, T, dt) {
      const S = T.s;
      if (!S.stage) return;
      if (r.ending) { this.settle(r, T); S.el.style.display = 'none'; return; }
      if (S.settled || r.locked) return;
      const rec = this.REC[S.stage], u = (T.t - S.t0) / rec;
      S.n.textContent = Math.max(0, Math.ceil(rec - (T.t - S.t0)));
      if (u >= 1) { if (S.g) S.g.show(false); return; }
      const f = (k) => ({ x: Math.sin(k * 18) * 8, z: 12 - k * 40 }), a = f(u), b = f(Math.min(1, u + 0.01));
      S.g.show(true); S.g.set(a.x, a.z, Math.atan2(b.x - a.x, b.z - a.z));
    }
  });

  // ===================================================================== 16 NEXA PROTOCOL — твоя запись из прошлого
  // Пока идёт бой с Оператором, пишется движение игрока. Через 60 с в бой вступает «ЗАПИСЬ»: ты минутной давности — идёт твоим путём, стреляет, когда стрелял ты.
  TW.add(16, {
    name: 'own-recording',
    LAG: 60,
    phase(r, T, name) {
      const S = T.s;
      S.rec = []; S.t0 = T.t; S.e = null; S.rt = 0; S.on = name === 'operator';
      T.att(() => { if (S.lab) { S.lab.visible = false; } S.e = null; });
    },
    reset(r, T) { T.s.on = false; },
    tick(r, T, dt) {
      const S = T.s;
      if (!S.on || r.locked) return;
      const el = T.t - S.t0, p = r.p;
      S.rt -= dt;
      if (S.rt <= 0) { S.rt = 0.1; S.rec.push([p.x, p.z, p.yaw + Math.PI, (r.time - (r.twShotT || -9)) < 0.15 ? 1 : 0]); }
      if (!S.e && el >= this.LAG && T.foes((e) => e.type === 'boss').length) this.spawn(r, T);
      const e = S.e;
      if (e) {
        if (e.dead) { S.e = null; if (S.lab) S.lab.visible = false; T.bonus(20, 'RECORDING ERASED'); r.hint('RECORDING ERASED', 2.4); return; }
        S.lab.position.set(e.x, 2.35, e.z);
      }
    },
    spawn(r, T) {
      const S = T.s, T3 = window.THREE, def = this;
      const a = S.rec[0] || [0, 8, 0, 0];
      const e = r.enemy('grunt', a[0], a[1], { hp: 3, drop: false, exact: true });
      e.n.vest.visible = true;
      let fcd = 0;
      e.ai = (q, dt2) => {
        const k = Math.min(S.rec.length - 1, Math.floor((T.t - S.t0 - def.LAG) * 10)), s2 = S.rec[Math.max(0, k)];
        if (!s2) return true;
        const g = q.n.g.position, nx = s2[0], nz = s2[1];
        if (!r.blockedE(nx, nz)) { g.x += (nx - g.x) * Math.min(1, dt2 * 8); g.z += (nz - g.z) * Math.min(1, dt2 * 8); }
        q.n.yaw = Math.atan2(r.p.x - g.x, r.p.z - g.z); q.n.creeping = Math.hypot(nx - g.x, nz - g.z) > 0.15;
        q.n.armT = 1; fcd -= dt2;
        if (s2[3] && fcd <= 0 && q.los && q.stagger <= 0) { fcd = 0.11; r.enemyShoot(q, Math.hypot(r.p.x - g.x, r.p.z - g.z)); }
        return true;
      };
      S.e = e;
      if (!S.lab) S.lab = T.label('YOU — 60 S AGO', 0, 2.35, 0, { w: 2.6, size: 44, bill: true, keep: true });
      S.lab.visible = true;
      r.glitch && r.glitch(0.3); r.sfx('error');
      r.hint('YOUR OWN RECORDING JOINS THE FIGHT — IT MOVES AND SHOOTS LIKE YOU DID A MINUTE AGO', 5);
      r.say('OPERATOR', 'ЗАПИСЬ СУБЪЕКТА 083 ВОСПРОИЗВЕДЕНА. ОДНА ТЕНЬ ЛИШНЯЯ.', 3);
    }
  });

  // ===================================================================== 9 POWER SURGE — рубильники как оружие
  // Три секции пола зала под током. У каждой сбоку рубильник [E]: через 0.6 с секция бьёт током 6 с — враги в ней гибнут (вы тоже, не стойте на ней).
  TW.add(9, {
    name: 'live-floor',
    Z: [[0, -3, 8, 6], [0, -27, 8, 6], [0, -48, 10, 6]],
    setup(r, T) {
      const S = T.s;
      S.z = this.Z.map((a) => {
        r.box(a[0], 0.03, a[1], a[2], 0.04, a[3], 0x4a4a4a, false, true);
        [-1, 1].forEach((s) => { r.strip(a[0], 0.05, a[1] + s * a[3] / 2, a[2], 0.04, 0.12, 0xdddddd); r.strip(a[0] + s * a[2] / 2, 0.05, a[1], 0.12, 0.04, a[3], 0xdddddd); });
        const m = r.box(a[0], 0.05, a[1], a[2] - 0.3, 0.03, a[3] - 0.3, 0x555555, false, true);
        r.box(7.8, 0.65, a[1], 0.5, 1.3, 0.4, 0x8a8a8a, true); r.strip(7.8, 1.45, a[1], 0.3, 0.15, 0.3, 0xffffff);
        return { x: a[0], z: a[1], w: a[2], d: a[3], m, ch: 0, t: 0, acc: 0 };
      });
    },
    phase(r, T, name) {
      const S = T.s;
      S.z.forEach((q) => { q.ch = 0; q.t = 0; q.m.material = r.basic(0x555555); });
      if (!/^gen/.test(name)) return;
      S.z.forEach((q, i) => {
        let used = false;
        const it = T.interact({ pos: [7.8, 1.1, q.z], label: 'THROW THE BREAKER', reach: 2.8, enabled: () => T.ph === name && !used && q.ch <= 0 && q.t <= 0,
          use: () => { used = true; it.done(); q.ch = 0.6; r.snd && r.snd.play('click'); r.toast('FLOOR LIVE IN 1 S — CLEAR THE FLOOR', 1.6); } });
      });
      if (!S.said) { S.said = true; T.after(5, () => r.hint('BREAKERS BY THE WALL ELECTRIFY THE FLOOR — LURE THEM IN, STAY OFF IT YOURSELF', 5)); }
    },
    reset(r, T) { T.s.z.forEach((q) => { q.ch = 0; q.t = 0; q.m.material = r.basic(0x555555); }); },
    tick(r, T, dt) {
      const S = T.s;
      if (!S.z || r.locked) return;
      S.z.forEach((q) => {
        if (q.ch > 0) { q.ch -= dt; q.m.material = r.basic(Math.sin(T.t * 40) > 0 ? 0xaaaaaa : 0x555555); if (q.ch <= 0) { q.t = 6; r.snd && r.snd.play('alarm', { k: 0.5 }); } return; }
        if (q.t <= 0) return;
        q.t -= dt; q.acc += dt;
        q.m.material = r.basic(Math.random() < 0.6 ? 0xffffff : 0x666666);
        if (q.t <= 0) { q.m.material = r.basic(0x555555); return; }
        if (q.acc < 0.25) return;
        q.acc = 0;
        r.sparks(q.x + (Math.random() - 0.5) * q.w, 0.2, q.z + (Math.random() - 0.5) * q.d, 0, 1, 0, 3);
        r.snd && r.snd.play('zap', { k: 0.4 });
        const inside = (x, z) => Math.abs(x - q.x) < q.w / 2 && Math.abs(z - q.z) < q.d / 2;
        T.foes().forEach((e) => { if (inside(e.x, e.z)) { r.damageEnemy(e, 38, false); } });
        if (inside(r.p.x, r.p.z)) r.hurt(10);
      });
    }
  });

  // ===================================================================== 13 OPEN FIRE — HIGH или LOW
  // Перед каждым раундом на полу две площадки. Встал на HIGH к старту — +3 врага и втрое больше кредитов, иначе LOW. Зрители «ставят».
  TW.add(13, {
    name: 'high-low-pads',
    setup(r, T) {
      const S = T.s, P = window.Math.PI;
      S.pads = [['HIGH', -3.5], ['LOW', 3.5]].map((a) => {
        const m = r.box(a[1], 0.03, 0.5, 5, 0.04, 3.5, 0x555555, false, true);
        const l = T.label(a[0], a[1], 0.08, 0.5, { w: 3, size: 90, bg: false, keep: true }); l.rotation.x = -P / 2;
        return { k: a[0], x: a[1], m };
      });
      S.arm = false;
    },
    inPad(r, p) { return Math.abs(r.p.x - p.x) < 2.5 && Math.abs(r.p.z - 0.5) < 1.75; },
    phase(r, T, name) {
      const S = T.s;
      S.arm = true; S.fight = false; S.choice = 'LOW';
      r.hint('BEFORE THE ROUND: STAND ON HIGH (MORE ENEMIES, TRIPLE CREDITS) OR ON LOW', 5);
      r.say('ANNOUNCER', 'ЗРИТЕЛИ ДЕЛАЮТ СТАВКИ. HIGH ИЛИ LOW?', 2.6);
    },
    reset(r, T) { const S = T.s; S.arm = false; S.fight = false; S.pads.forEach((p) => { p.m.material = r.basic(0x555555); }); },
    tick(r, T, dt) {
      const S = T.s;
      if (!S.pads || r.locked) return;
      if (S.arm) {
        S.pads.forEach((p) => { p.m.material = r.basic(this.inPad(r, p) ? 0xffffff : 0x555555); });
        if (T.foes().length || r.spawning) {
          S.arm = false; S.fight = true;
          const hi = this.inPad(r, S.pads[0]);
          S.choice = hi ? 'HIGH' : 'LOW';
          S.pads.forEach((p) => { p.m.material = r.basic(0x555555); });
          if (hi) {
            r.spawnWave(r.around(['grunt', 'grunt', 'rusher'], 12, 20), { gap: 0.4 });
            r.hint('HIGH BET — THREE EXTRA ENEMIES', 2.4); r.say('ANNOUNCER', 'ЗРИТЕЛИ ПОСТАВИЛИ НА HIGH!', 2);
          } else r.hint('LOW BET — SAFE PLAY', 1.8);
        }
      } else if (S.fight && !T.foes().length && !r.spawning) {
        S.fight = false;
        T.bonus(S.choice === 'HIGH' ? 30 : 10, S.choice === 'HIGH' ? 'HIGH BET WON' : 'LOW BET WON');
      }
    }
  });

  // ===================================================================== 14 CLOSE QUARTERS — что за дверью
  // Выбитая дверь скрывает случайный сюрприз: жилец (не стрелять!), ещё один заложник (белый жилет) или растяжка на косяке (отойди, пока пищит).
  TW.add(14, {
    name: 'door-surprise',
    SIDE: [-1, 1, -1, 1, -1], ZC: [6, -10, -26, -42, -58], HOST: [0, 1, 0, 1, 1],
    setup(r, T) { T.s.done = {}; T.s.civ = 0; },
    phase(r, T, name) {
      const S = T.s, m = /^room(\d)$/.exec(name);
      if (!m) { if (name === 'exit' && S.civ === 0 && !S.paid) { S.paid = true; T.bonus(30, 'CLEAN HANDS'); } return; }
      const k = +m[1] - 1;
      S.k = k; S.done[k] = false; S.trap = null;
      const bag = this.HOST[k] ? ['tenant', 'trap', 'none'] : ['tenant', 'trap', 'hostage'];
      S.kind = bag[Math.floor(Math.random() * bag.length)];
      T.att(() => { S.trap = null; if (S.chargeM) S.chargeM.visible = false; });
    },
    tick(r, T, dt) {
      const S = T.s;
      if (S.k === undefined || r.locked && !S.trap) return;
      const door = r.rdoors && r.rdoors[S.k];
      if (S.trap && !r.paused) {
        const tr = S.trap; tr.t -= dt / (r.timeScale || 1);
        S.chargeM.material = r.basic(Math.floor(tr.t * 6) % 2 ? 0xffffff : 0x333333);
        if (tr.t <= 0) { S.chargeM.visible = false; S.trap = null; r.explode(tr.x, 1, tr.z, 3.6, 60); }
      }
      if (!door || S.done[S.k] || !door.userData.col.off || T.ph !== 'room' + (S.k + 1)) return;
      S.done[S.k] = true;
      const s = this.SIDE[S.k], zc = this.ZC[S.k], PI = Math.PI;
      if (S.kind === 'tenant' || S.kind === 'hostage') {
        const host = S.kind === 'hostage';
        const e = r.enemy('grunt', s * 11, host ? zc + 3.9 : zc - 3.8, { friendly: true, drop: false, exact: true, yaw: s * PI / 2, onDeath: () => { if (host) r.fail('HOSTAGE LOST'); else { S.civ += 1; r.hint('CIVILIAN HIT — CLEAN HANDS BONUS LOST', 2.6); r.flash(0.3); } } });
        e.ai = (q) => { q.n.cvT = 1; q.n.daze = 1; q.n.armT = 0; return true; };
        r.hint(host ? 'ANOTHER HOSTAGE — WHITE VEST' : 'A RESIDENT HIDES INSIDE — DO NOT SHOOT', 3);
      } else if (S.kind === 'trap') {
        if (!S.chargeM) S.chargeM = new (window.THREE.Mesh)(new (window.THREE.BoxGeometry)(0.3, 0.2, 0.2), r.basic(0xffffff));
        S.chargeM.position.set(s * 2.3, 1.4, zc - 0.9); S.chargeM.visible = true; T.add(S.chargeM);
        S.trap = { t: 2.2, x: s * 2.3, z: zc - 0.9 };
        r.hint('TRIPWIRE CHARGE ON THE DOOR FRAME — BACK OFF!', 2.6); r.snd && r.snd.play('c4beep');
      }
    }
  });

  // ===================================================================== 15 CONTROL ROOM — мониторы с задержкой
  // На стене три монитора показывают вас с задержкой 3 с. Если «старый вы» попал в кадр поста — охрана замечает. Пересекай кадр быстро или расстреляй монитор.
  TW.add(15, {
    name: 'delayed-monitors',
    F: [[0, 8], [0, -18], [0, -42]],
    setup(r, T) {
      const S = T.s, T3 = window.THREE;
      S.hist = []; S.hr = 0; S.cd = 0;
      S.m = this.F.map((f, i) => {
        const c = document.createElement('canvas'); c.width = 128; c.height = 96;
        const tex = new T3.CanvasTexture(c);
        const pl = new T3.Mesh(new T3.PlaneGeometry(2.2, 1.65), new T3.MeshBasicMaterial({ map: tex }));
        pl.position.set(13.85, 1.9, f[1]); pl.rotation.y = -Math.PI / 2; r.scene.add(pl);
        [-1, 1].forEach((s) => { r.strip(f[0], 0.05, f[1] + s * 2.5, 8, 0.04, 0.1, 0xdddddd); r.strip(f[0] + s * 4, 0.05, f[1], 0.1, 0.04, 5, 0xdddddd); });
        const m = { c, tex, x: f[0], z: f[1], alive: true, seen: 0 };
        m.tg = r.shootTarget(13.5, 1.9, f[1], 0.7, { hp: 3, onDeath: () => { m.alive = false; this.draw(m, null); r.hint('MONITOR DESTROYED', 1.6); } });
        if (m.tg.m) m.tg.m.visible = false;
        return m;
      });
      T.after(4, () => r.hint('MONITORS SHOW YOU WITH A 3 S DELAY — CROSS THE FRAMES FAST OR SHOOT THE MONITOR', 6));
    },
    draw(m, p) {
      const g = m.c.getContext('2d'), tr = (s) => (window.I18N ? I18N.t(s) : s);
      g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, 128, 96);
      g.strokeStyle = '#ddd'; g.strokeRect(14, 12, 100, 62);
      g.fillStyle = '#ddd'; g.font = 'bold 10px monospace';
      if (!m.alive) { g.fillText(tr('NO SIGNAL'), 36, 48); } else {
        g.fillText(tr('REC  -3 S'), 6, 90);
        if (p) { const u = (p[0] - (m.x - 4)) / 8, v = (p[1] - (m.z - 2.5)) / 5; if (u > 0 && u < 1 && v > 0 && v < 1) { g.fillStyle = '#fff'; g.fillRect(14 + u * 100 - 4, 12 + v * 62 - 6, 8, 12); } }
      }
      m.tex.needsUpdate = true;
    },
    phase(r, T, name) { T.s.hist = []; T.s.m.forEach((m) => { m.seen = 0; }); },
    tick(r, T, dt) {
      const S = T.s;
      if (!S.m) return;
      S.hr -= dt;
      if (S.hr <= 0) { S.hr = 0.1; S.hist.push([T.t, r.p.x, r.p.z]); if (S.hist.length > 80) S.hist.shift(); }
      S.cd -= dt;
      let old = null;
      for (let i = S.hist.length - 1; i >= 0; i -= 1) if (S.hist[i][0] <= T.t - 3) { old = S.hist[i]; break; }
      S.dr = (S.dr || 0) - dt;
      S.m.forEach((m) => {
        const p = old ? [old[1], old[2]] : null;
        if (S.dr <= 0) this.draw(m, p);
        const inside = m.alive && p && Math.abs(p[0] - m.x) < 4 && Math.abs(p[1] - m.z) < 2.5;
        m.seen = inside ? m.seen + dt : 0;
        if (m.seen > 0.4 && S.cd <= 0 && !r.locked) {
          S.cd = 6; m.seen = 0;
          const gs = r.cb.enemies.filter((e) => e.guard && !e.dead);
          gs.forEach((q) => { for (let k = 0; k < 8; k += 1) q.hear && q.hear(); });
          r.toast('SPOTTED ON THE MONITOR', 2); r.snd && r.snd.has('camerabeep') && r.snd.play('camerabeep');
        }
      });
      if (S.dr <= 0) S.dr = 0.25;
    }
  });
}());
