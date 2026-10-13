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
}());
