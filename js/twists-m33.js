// NEXA: «удивляющие штуки» миссий 33–47 (ядро и реестр — js/twists.js, описание — MISSION_TWISTS.md). Тексты: английский исходник, переводы — js/i18n-twists.js.
(function () {
  'use strict';
  const TW = window.Twists;
  const C = window.Missions && window.Missions._core;
  if (!TW || !C) return;
  const { clamp, rnd } = TW;
  const PI = Math.PI;
  const HND = 'HANDLER';
  const rsel = (a) => a[Math.floor(Math.random() * a.length)];

  // ===================================================================== 37 GHOST — награда за чистое прохождение
  // Ни одной тревоги и смерти за всю миссию — в последнем секторе открывается служебная дверь: за ней скрытая комната с «танцем» (эмоция).
  TW.add(37, {
    name: 'ghost-room',
    setup(r, T) {
      const S = T.s, M = r.mm, sec = M && M.secs[M.secs.length - 1], W = M.W, H = M.H, T3 = window.THREE;
      if (!sec) return;
      // восточная стена одним боксом: ищем и разрезаем, оставляя проём под дверь
      const wall = r.scene.children.find((o) => o.userData && o.userData.col && Math.abs(o.userData.col.x0 - W / 2) < 0.02 && (o.userData.col.z1 - o.userData.col.z0) > 40);
      if (!wall) { S.none = true; return; }
      let gz = sec.cz, ok = false;
      for (const dz of [0, 3, -3, 5, -5, 7, -7]) {
        gz = sec.cz + dz;
        const inRoom = r.inRoom && (r.inRoom(W / 2 + 0.6, gz) || r.inRoom(W / 2 + 3.6, gz) || r.inRoom(W / 2 + 3.6, gz + 3) || r.inRoom(W / 2 + 3.6, gz - 3));
        if (!inRoom) { ok = true; break; }
      }
      if (!ok) { S.none = true; return; }
      const c = wall.userData.col, z0 = c.z0, z1 = c.z1, g0 = gz - 1.6, g1 = gz + 1.6, cx = W / 2 + 0.15;
      wall.position.z = (z0 + g0) / 2; wall.scale.z = g0 - z0; c.z1 = g0;
      const up = r.box(cx, H / 2, (g1 + z1) / 2, 0.3, H, z1 - g1, 0x8a8a8a, true);
      up.material = wall.material;
      const door = r.door(cx, gz, 3.2, H, true);
      door.material = wall.material;
      // комната за стеной
      const rx0 = W / 2 + 0.3, rx1 = rx0 + 7, rz0 = gz - 3.5, rz1 = gz + 3.5, rc = 0x6a6a6a;
      r.box((rx0 + rx1) / 2, -0.05, gz, 7.4, 0.1, 7.6, 0x4a4a4a, false);
      r.box((rx0 + rx1) / 2, H + 0.05, gz, 7.4, 0.1, 7.6, 0x2c2c2c, false);
      r.box((rx0 + rx1) / 2, H / 2, rz0 - 0.15, 7.6, H, 0.3, rc, true);
      r.box((rx0 + rx1) / 2, H / 2, rz1 + 0.15, 7.6, H, 0.3, rc, true);
      r.box(rx1 + 0.15, H / 2, gz, 0.3, H, 7.6, rc, true);
      r.lamp(rx0 + 3.5, H - 0.1, gz, 0.9);
      // постамент с манекеном-танцором
      const px = rx0 + 4.6;
      r.box(px, 0.35, gz, 1.1, 0.7, 1.1, 0x303030, true);
      const fig = new T3.Group();
      const part = (w, h, d, x, y, z, rx, rz) => { const m = new T3.Mesh(new T3.BoxGeometry(w, h, d), r.mat(0x101010)); m.position.set(x, y, z); if (rx) m.rotation.x = rx; if (rz) m.rotation.z = rz; fig.add(m); return m; };
      part(0.34, 0.5, 0.2, 0, 1.1, 0);                     // торс
      const hd = new T3.Mesh(new T3.SphereGeometry(0.14, 10, 8), r.mat(0x101010)); hd.position.set(0, 1.5, 0); fig.add(hd);
      S.arms = [part(0.09, 0.5, 0.09, -0.3, 1.45, 0, 0, 0.9), part(0.09, 0.5, 0.09, 0.3, 1.45, 0, 0, -0.9)];
      S.legs = [part(0.11, 0.6, 0.11, -0.12, 0.62, 0, 0.1), part(0.11, 0.6, 0.11, 0.12, 0.62, 0, -0.1)];
      fig.position.set(px, 0.7, gz); fig.scale.setScalar(0.85);
      r.scene.add(fig); S.fig = fig;
      r.strip(px, 2.9, gz, 0.9, 0.05, 0.9, 0xffffff);
      T.label('DANCE FILE', px, 2.55, gz - 0.02, { w: 1.8, size: 52, keep: true, yaw: -PI / 2 });
      S.door = door; S.gz = gz; S.px = px; S.open = false; S.got = false;
      S.it = T.interact({ pos: [px - 0.9, 1.1, gz], label: 'LEARN THE DANCE', reach: 2.8, enabled: () => S.open && !S.got, use: () => { S.it.done(); this.learn(r, T); } });
    },
    phase(r, T, name) {
      const S = T.s, M = r.mm;
      if (S.none || S.open || !M) return;
      const sec = T.secOf(name);
      if (sec && sec.last && r.twStat && r.twStat.deaths === 0) {
        S.open = true;
        r.openDoor(S.door, 1.4);
        r.sfx('notification');
        T.after(1.2, () => { r.hint('GHOST PROTOCOL INTACT — A SERVICE DOOR HAS UNLOCKED', 5); });
      }
    },
    learn(r, T) {
      const S = T.s, Ty = window.Toys;
      S.got = true; r.sfx('notification');
      let msg = 'YOU ALREADY KNOW THIS DANCE';
      if (!TW.claimed('ghost37')) {
        TW.claim('ghost37');
        const em = Ty && Ty.EMOTES ? Ty.EMOTES.find((e) => !Ty.owned(e.id)) : null;
        if (em && Ty.grant(em.id)) msg = 'NEW EMOTE UNLOCKED: ' + em.name + ' — HOLD [B]';
        else { T.bonus(200, 'GHOST REWARD'); msg = 'ALL DANCES KNOWN — BONUS CREDITS'; }
      }
      r.hint(msg, 5);
      r.say(HND, 'ПРИЗРАКАМ ПОЛАГАЕТСЯ НАГРАДА. ПОТАНЦУЙ, КОГДА БУДЕТ ВРЕМЯ.', 3);
    },
    tick(r, T, dt) {
      const S = T.s;
      if (!S.fig) return;
      const t = T.t, f = S.fig;
      f.rotation.y = t * 0.8;
      S.arms[0].rotation.z = 0.9 + Math.sin(t * 5) * 0.7; S.arms[1].rotation.z = -0.9 - Math.sin(t * 5 + 1.2) * 0.7;
      S.legs[0].rotation.x = Math.sin(t * 5) * 0.45; S.legs[1].rotation.x = -Math.sin(t * 5) * 0.45;
      f.position.y = 0.7 + Math.abs(Math.sin(t * 5)) * 0.04;
    }
  });

  // ===================================================================== 39 HEAVY ARMOR — красный баллон на спине
  // У каждого джаггернаута на спине красный баллон: выстрел в него — взрыв, и джаггернаут (и рядом стоящие) выбывают. Спереди баллон закрыт телом;
  // ослеплённый светошумовой тяжёлый разворачивается спиной — самый удобный момент.
  TW.add(39, {
    name: 'red-tank',
    setup(r, T) { T.s.tanks = []; },
    phase(r, T, name) { const S = T.s; S.said = false; },
    reset(r, T) { this.sweep(r, T); },
    sweep(r, T) { const S = T.s; (S.tanks || []).forEach((k) => { k.grp.visible = false; if (k.grp.parent) k.grp.parent.remove(k.grp); if (k.tg && k.tg.remove) k.tg.remove(); }); S.tanks = []; },
    enemy(r, T, e) {
      if (e.type !== 'heavy') return;
      const S = T.s, T3 = window.THREE, sc = e.t.scale || 1;
      const grp = new T3.Group();
      const body = new T3.Mesh(new T3.CylinderGeometry(0.15 * sc, 0.15 * sc, 0.72 * sc, 10), new T3.MeshBasicMaterial({ color: 0xd2271f }));
      const cap = new T3.Mesh(new T3.SphereGeometry(0.15 * sc, 10, 6, 0, PI * 2, 0, PI / 2), new T3.MeshBasicMaterial({ color: 0xd2271f }));
      cap.position.y = 0.36 * sc;
      const band = new T3.Mesh(new T3.CylinderGeometry(0.155 * sc, 0.155 * sc, 0.07 * sc, 10), new T3.MeshBasicMaterial({ color: 0xffffff }));
      band.position.y = 0.1 * sc;
      const valve = new T3.Mesh(new T3.BoxGeometry(0.07 * sc, 0.1 * sc, 0.07 * sc), new T3.MeshBasicMaterial({ color: 0xffffff }));
      valve.position.y = 0.5 * sc;
      grp.add(body, cap, band, valve);
      r.scene.add(grp);
      const k = { e, grp, sc, dir: Math.random() < 0.5 ? 1 : -1, boom: false };
      k.tg = r.shootTarget(e.x, 1.2 * sc, e.z, 0.26 * sc, {
        hp: 4, onDeath: () => {
          if (k.boom) return; k.boom = true;
          const q = k.grp.position;
          k.grp.visible = false;
          r.explode(q.x, 1.1, q.z, 4.4, 110);
          if (!e.dead) r.damageEnemy(e, 99999, false);
          r.hint('TANK DETONATED', 1.8);
          T.bonus(10, 'TANK SHOT');
        }
      });
      if (k.tg && k.tg.m) k.tg.m.visible = false;
      S.tanks.push(k);
      if (!S.said) { S.said = true; r.hint('RED TANK ON THEIR BACKS — GO AROUND OR FLASH THEM, THEN SHOOT THE TANK', 5); }
    },
    tick(r, T, dt) {
      const S = T.s;
      for (let i = S.tanks.length - 1; i >= 0; i -= 1) {
        const k = S.tanks[i], e = k.e;
        if (k.boom) { if (k.tg && k.tg.remove) k.tg.remove(); S.tanks.splice(i, 1); continue; }
        if (e.dead || !e.n.g.visible) { k.grp.visible = false; if (k.tg && k.tg.remove) k.tg.remove(); if (k.grp.parent) k.grp.parent.remove(k.grp); S.tanks.splice(i, 1); continue; }
        const g = e.n.g, yaw = g.rotation.y, sc = k.sc;
        // ослеплённый тяжёлый «крутится на месте» — спина открывается
        if (e.blind && e.stagger > 0 && !r.locked) e.n.yaw += k.dir * dt * 2.4;
        const bx = g.position.x - Math.sin(yaw) * 0.37 * sc, bz = g.position.z - Math.cos(yaw) * 0.37 * sc;
        k.grp.position.set(bx, 1.17 * sc, bz); k.grp.rotation.y = yaw;
        if (k.tg && k.tg.move) k.tg.move(bx, 1.17 * sc, bz);
      }
    }
  });

  // ===================================================================== 45 BLUEPRINTS — схема здания NEXA
  // Каждый собранный лист открывает четверть схемы штаб-квартиры (то самое здание из последнего задания); на четвёртом — метка 083.
  TW.add(45, {
    name: 'blueprint-map',
    phase(r, T, name) {
      const S = T.s;
      S.got = []; S.prev = []; S.el = null; S.cv = null; S.hide = null;
    },
    tick(r, T, dt) {
      const S = T.s, sec = T.sec();
      if (!sec || sec.b !== 'collect' || !sec.items) return;
      sec.items.forEach((it, i) => {
        const now = !!it.m.visible;
        if (S.prev[i] === true && !now && S.got.indexOf(i) < 0 && !r.locked) { S.got.push(i); this.reveal(r, T, S.got.length, sec.items.length); }
        S.prev[i] = now;
      });
    },
    reveal(r, T, k, n) {
      const S = T.s;
      if (!S.el) {
        S.el = T.panel('tw-corner tw-box tw-fade', '<h3>BLUEPRINT</h3>');
        S.el.style.maxWidth = 'min(400px, 56vw)'; S.el.style.top = '120px';
        S.cv = document.createElement('canvas'); S.cv.width = 480; S.cv.height = 300; S.cv.style.cssText = 'width:100%;display:block;background:#050505';
        S.el.appendChild(S.cv);
        T.after(0.05, () => S.el.classList.add('on'));
      }
      S.el.classList.add('on');
      if (S.hide) T.cancel(S.hide);
      this.draw(r, T, k);
      r.sfx('notification');
      if (k >= n) {
        try { localStorage.setItem('nexaMark083', '1'); } catch (e) { /* ignore */ }
        r.hint('MARK 083 UNLOCKED', 4);
        r.say(HND, 'ВОТ ОНО. ЗДАНИЕ NEXA. ЗАПОМНИ ЭТУ ДВЕРЬ.', 3);
        S.hide = T.after(13, () => S.el.classList.remove('on'));
      } else {
        r.hint('SHEET ' + k + ' OF ' + n + ' — THE PLAN IS TAKING SHAPE', 2.6);
        S.hide = T.after(7, () => S.el.classList.remove('on'));
      }
    },
    draw(r, T, k) {
      const S = T.s, g = S.cv.getContext('2d'), t = (s) => (window.I18N ? I18N.t(s) : s);
      g.fillStyle = '#050505'; g.fillRect(0, 0, 480, 300);
      const Q = [[0, 0], [240, 150], [240, 0], [0, 150]]; // порядок открытия четвертей
      const revealed = Q.slice(0, k);
      // полный чертёж рисуем в отдельный холст и показываем только открытые четверти
      const off = document.createElement('canvas'); off.width = 480; off.height = 300;
      const o = off.getContext('2d');
      o.strokeStyle = '#e6e6e6'; o.fillStyle = '#e6e6e6'; o.lineWidth = 1.4; o.font = 'bold 12px "Courier New", monospace';
      o.strokeStyle = 'rgba(255,255,255,.12)'; for (let x = 0; x <= 480; x += 20) { o.beginPath(); o.moveTo(x, 0); o.lineTo(x, 300); o.stroke(); } for (let y = 0; y <= 300; y += 20) { o.beginPath(); o.moveTo(0, y); o.lineTo(480, y); o.stroke(); }
      o.strokeStyle = '#e6e6e6';
      o.strokeRect(6, 6, 468, 288);
      o.fillText(t('NEXA INDUSTRIES — HEADQUARTERS'), 16, 24); o.font = '11px "Courier New", monospace'; o.fillText(t('SECTION A-A'), 16, 40);
      o.font = 'bold 11px "Courier New", monospace';
      o.beginPath(); o.moveTo(20, 150); o.lineTo(460, 150); o.stroke();                       // уровень земли
      o.strokeRect(170, 45, 140, 105);                                                          // башня
      [80, 115].forEach((y) => { o.beginPath(); o.moveTo(170, y); o.lineTo(310, y); o.stroke(); });
      o.fillText(t('FLOOR 3 — DIRECTOR'), 178, 66); o.fillText(t('FLOOR 2 — VAULT'), 178, 101); o.fillText(t('FLOOR 1 — LOBBY'), 178, 136);
      o.strokeRect(160, 150, 160, 36); o.fillText(t('BASEMENT — LIFTS'), 172, 172);            // подвал
      o.strokeRect(36, 122, 100, 28); o.fillText(t('YARD'), 74, 140);                           // двор
      o.beginPath(); o.moveTo(310, 150); [0, 1, 2, 3, 4].forEach((i) => { o.lineTo(330 + i * 12, 150 - i * 7); o.lineTo(330 + i * 12 + 12, 150 - i * 7); }); o.stroke(); // лестница выхода
      o.strokeRect(190, 186, 14, 70); o.strokeRect(276, 186, 14, 70);                           // шахты лифтов
      o.strokeRect(60, 240, 380, 18);                                                           // коридор
      for (let i = 1; i <= 6; i += 1) { const x = 60 + i * 54; o.beginPath(); o.moveTo(x, 236); o.lineTo(x, 262); o.stroke(); }
      o.fillText(t('DEEP LEVEL — 210 M'), 130, 282);
      o.strokeRect(436, 232, 12, 34); o.fillText('083', 430, 224);
      g.save();
      Q.forEach((q, i) => {
        if (i < k) { g.drawImage(off, q[0], q[1], 240, 150, q[0], q[1], 240, 150); }
        else {
          g.fillStyle = '#0c0c0c'; g.fillRect(q[0] + 1, q[1] + 1, 238, 148);
          g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 1;
          for (let x = -150; x < 240; x += 14) { g.beginPath(); g.moveTo(q[0] + x, q[1] + 150); g.lineTo(q[0] + x + 150, q[1]); g.stroke(); }
          g.fillStyle = 'rgba(255,255,255,.55)'; g.font = 'bold 12px "Courier New", monospace'; g.textAlign = 'center';
          g.fillText(t('MISSING SHEET'), q[0] + 120, q[1] + 80);
        }
      });
      g.restore();
      if (k >= 4) {
        g.strokeStyle = '#ef4b45'; g.lineWidth = 3; g.beginPath(); g.arc(442, 249, 24, 0, PI * 2); g.stroke();
        g.fillStyle = '#ef4b45'; g.font = 'bold 13px "Courier New", monospace'; g.textAlign = 'right'; g.fillText(t('MARK 083 UNLOCKED'), 468, 292);
      }
    }
  });

  // ===================================================================== 46 REHEARSAL — тревога оказывается настоящей
  // Первые три сектора идут под вывеской «репетиция» (учебный режим, шаг n/4). Перед последним секторам тревога настоящая: свет, сирена, красные края,
  // табличка «ЭТО НЕ УЧЕНИЯ».
  TW.add(46, {
    name: 'not-a-drill',
    setup(r, T) {
      const S = T.s;
      S.tag = T.panel('tw-corner tw-box', '<h3>REHEARSAL MODE</h3><p class="tw-a"></p><p class="tw-b"></p>', true);
      S.tag.style.top = '120px';
      S.a = S.tag.querySelector('.tw-a'); S.b = S.tag.querySelector('.tw-b');
      S.real = false; this.paint(r, T, 0);
    },
    paint(r, T, k) {
      const S = T.s;
      if (S.real) { S.tag.querySelector('h3').textContent = 'THIS IS NOT A DRILL'; S.tag.querySelector('h3').style.color = '#ef4b45'; S.a.textContent = 'THE LOCKS ARE REAL'; S.b.textContent = 'GET OUT ALIVE'; return; }
      S.tag.querySelector('h3').textContent = 'REHEARSAL MODE'; S.tag.querySelector('h3').style.color = '#fff';
      S.a.textContent = 'NO REAL RISK'; S.b.textContent = 'STEP ' + (k + 1) + ' / 4';
    },
    phase(r, T, name) {
      const S = T.s, k = /^s(\d+)$/.test(name) ? +name.slice(1) : 0;
      S.real = false; this.paint(r, T, k);
      if (k < 3) return;
      // последний сектор: сначала «зачёт», затем срыв
      const el = T.panel('tw-mid tw-box', '<h3>REHEARSAL COMPLETE</h3><p>SCORE 100%</p>');
      T.after(2.3, () => {
        el.remove();
        S.real = true; this.paint(r, T, k);
        r.flicker && r.flicker(5);
        r.snd && r.snd.play('alarm'); r.flash(0.35); r.shake && r.shake(0.04, 0.8);
        r.redPulse && r.redPulse(true, { period: 1.0, min: 0.18, max: 0.95 });
        T.att(() => { r.redPulse && r.redPulse(false); });
        try { const tr = r.musicTrack('heistloud'); tr.play(0.6); T.att(() => { tr.stop(0.5); }); } catch (e) { /* ignore */ }
        r.hint('THE REHEARSAL WAS REAL — GET OUT', 4);
        r.say(HND, 'ЭТО НЕ УЧЕНИЯ. ЗАМКИ НАСТОЯЩИЕ. БЕГИ!', 3);
      });
    },
    reset(r, T) { const S = T.s; S.real = false; r.redPulse && r.redPulse(false); }
  });

  // ===================================================================== 33 DEMO DERBY — ранги за комбо-взрывы
  // Считаются цепочки бочек (взрывы подряд ≤1.6 с) и убийства взрывом. После каждого раунда ранг S / A / B и кредиты.
  TW.add(33, {
    name: 'combo-rank',
    setup(r, T) {
      const S = T.s; S.best = 0; S.ek = 0; S.chain = 0; S.last = -9; S.seen = new Set(); S.rd = 0; S.settled = true;
      r.cb.killHooks.push((e) => { if (!e.friendly && T.t - S.last < 1.4) S.ek += 1; });
      T.after(4, () => r.hint('COMBO RANKS: CHAIN BARRELS AND EXPLOSIVE KILLS FOR S / A / B', 5));
    },
    settle(r, T) {
      const S = T.s; if (S.settled) return; S.settled = true;
      const k = S.best >= 4 && S.ek >= 4 ? 'S' : S.best >= 3 || S.ek >= 3 ? 'A' : 'B';
      T.bonus(k === 'S' ? 40 : k === 'A' ? 25 : 10, 'RANK ' + k);
      r.hint('RANK ' + k + ' — CHAIN x' + S.best + ', ' + S.ek + ' EXPLOSIVE KILLS', 3.5);
    },
    phase(r, T, name) { const S = T.s; this.settle(r, T); S.best = 0; S.ek = 0; S.chain = 0; S.last = -9; S.settled = false; },
    reset(r, T) { T.s.settled = true; },
    tick(r, T, dt) {
      const S = T.s;
      if (r.ending) this.settle(r, T);
      r.cb.shoot.forEach((b) => { if (b.barrel) S.seen.add(b); });
      S.seen.forEach((b) => {
        if (b.alive) return;
        S.seen.delete(b);
        S.chain = T.t - S.last < 1.6 ? S.chain + 1 : 1; S.last = T.t; S.best = Math.max(S.best, S.chain);
        if (S.chain >= 2) r.toast('CHAIN x' + S.chain, 1.4);
      });
    }
  });

  // ===================================================================== 34 NIGHT SHIFT — спрячь тело
  // Убитого охранника можно спрятать в шкаф [E] (у стен в скрытных секторах), пока тело не нашли: охрана о нём не узнает.
  TW.add(34, {
    name: 'hide-bodies',
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name);
      S.lk = []; S.bd = new Set();
      if (!sec || sec.b !== 'stealth') return;
      const hw = sec.W / 2 - 0.7;
      for (let i = 0; i < 4; i += 1) {
        const x = (i % 2 ? 1 : -1) * hw, z = sec.zA - 6 - i * (sec.D - 12) / 3.5;
        if (r.blockedE(x, z)) continue;
        T.solid(x, 1.1, z, 0.8, 2.2, 1.0, 0x5a5a5a); r.strip(x - Math.sign(x) * 0.42, 1.6, z, 0.04, 0.3, 0.5, 0xffffff);
        S.lk.push([x, z]);
      }
      if (!S.said) { S.said = true; T.after(4, () => r.hint('GUARDS RAISE THE ALARM OVER BODIES — HIDE THEM IN LOCKERS [E]', 5)); }
    },
    tick(r, T, dt) {
      const S = T.s, sec = T.sec();
      if (!S.lk || !S.lk.length || !sec || sec.b !== 'stealth' || r.locked) return;
      r.cb.enemies.forEach((e) => {
        if (!e.dead || !e.guard || S.bd.has(e)) return;
        S.bd.add(e);
        const it = T.interact({ pos: [e.x, 0.8, e.z], label: 'HIDE THE BODY', reach: 2.2, enabled: () => !e.hid && !e.found && e.n.g.visible, use: () => {
          it.done(); let best = S.lk[0], bd = 1e9;
          S.lk.forEach((l) => { const d = Math.hypot(l[0] - e.x, l[1] - e.z); if (d < bd) { bd = d; best = l; } });
          e.hid = true; e.found = true; const g = e.n.g.position, x0 = g.x, z0 = g.z;
          r.tween(1.1, (k) => { g.x = x0 + (best[0] - x0) * k; g.z = z0 + (best[1] - z0) * k; }).then(() => { e.n.g.visible = false; r.toast('BODY HIDDEN', 1.4); r.snd && r.snd.play('thud'); });
        } });
        T.att(() => it.done());
      });
    }
  });

  // ===================================================================== 35 GLASS HOUSE — всё прозрачное
  // Укрытия стеклянные: охрана видит сквозь них. Зато и вы видите охрану сквозь стены (белые ромбы), а по дому идёт «тень» — она ждёт, пока путь безопасен.
  TW.add(35, {
    name: 'glass',
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name), T3 = window.THREE;
      if (S.g) { S.g.rm(); S.g = null; }
      S.sec = null;
      if (!sec || sec.b !== 'stealth') return;
      S.sec = sec;
      r.scene.children.forEach((m) => {
        const c = m.userData && m.userData.col;
        if (!c || c.off || c.glass || c.door || (c.y1 - c.y0) > 3.3 || (c.x1 - c.x0) > 7 || c.z1 < sec.zB || c.z0 > sec.zA || (c.z1 - c.z0) > 7) return;
        c.glass = true;
        const col = m.material && m.material.color ? m.material.color.getHex() : 0x888888;
        m.material = new T3.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.25, depthWrite: false });
      });
      S.g = T.ghost({ color: 0x222222, opacity: 0.55 });
      S.gz = sec.zA - 2; S.gx = 0; S.g.set(0, S.gz, Math.PI); S.g.show(true);
      T.att(() => { if (S.g) { S.g.rm(); S.g = null; } });
      if (!S.said) { S.said = true; T.after(3, () => r.hint('EVERYTHING IS GLASS — FOLLOW THE SHADOW: IT MOVES ONLY WHEN THE WAY IS SAFE', 6)); }
    },
    safe(r, T, x, z) {
      const M = r.mm; if (!M || !M.S) return true;
      for (const q of M.S.guards()) {
        const g = q.n.g.position, dx = x - g.x, dz = z - g.z, d = Math.hypot(dx, dz) || 1;
        if (d < q.range && ((dx * Math.sin(q.n.yaw) + dz * Math.cos(q.n.yaw)) / d > 0.45 || d < 3) && r.hasLOS(g.x, 1.5, g.z, x, 1.2, z)) return false;
      }
      for (const i of M.S.items) {
        if (i.off) continue;
        if (i.kind === 'cam') { const dx = x - i.x, dz = z - i.z, d = Math.hypot(dx, dz); if (d < i.range && Math.abs(((Math.atan2(dx, dz) - i.yaw + 9.42) % 6.283) - 3.1416) < i.half + 0.2) return false; }
        else if (i.kind === 'laser' && i.live && Math.abs(z - i.g.position.z) < 0.9) return false;
      }
      return true;
    },
    tick(r, T, dt) {
      const S = T.s, M = r.mm, T3 = window.THREE;
      if (!S.sec || !M || !M.S || r.locked) return;
      S.mk = S.mk || new Map();
      M.S.guards().forEach((q) => {
        let m = S.mk.get(q);
        if (!m) { m = new T3.Mesh(r.g.box, new T3.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true })); m.scale.set(0.22, 0.22, 0.22); m.rotation.set(0.6, 0.78, 0); m.renderOrder = 20; r.scene.add(m); S.mk.set(q, m); }
        m.visible = !q.dead; m.position.set(q.n.g.position.x, 2.3, q.n.g.position.z);
      });
      const g = S.g; if (!g) return;
      const sec = S.sec, nz = S.gz - 1.7 * dt;
      if (Math.hypot(r.p.x - S.gx, r.p.z - S.gz) > 14) { g.n.creeping = false; return; }
      let moved = false;
      for (const off of [0, 3, -3, 6, -6]) {
        const nx = Math.max(-sec.W / 2 + 2, Math.min(sec.W / 2 - 2, off === 0 ? S.gx : S.gx + Math.sign(off) * 1.6 * dt * 2));
        if (!r.blockedE(nx, nz) && this.safe(r, T, nx, nz) && this.safe(r, T, nx, nz - 2)) { S.gx = nx; S.gz = nz; moved = true; break; }
      }
      g.n.creeping = moved; g.set(S.gx, S.gz, Math.PI);
      if (S.gz < sec.zB + 1) { S.gz = sec.zA - 2; S.gx = 0; }
    }
  });

  // ===================================================================== 36 THE LIBRARIAN — слепой смотритель
  // По секторам бродит слепой Библиотекарь: слышит бег и стрельбу, но не видит. Идите шагом. Книги ([E] взять, [J] бросить) отвлекают его на 6 с.
  TW.add(36, {
    name: 'blind-warden',
    setup(r, T) {
      const S = T.s; S.books = 0;
      S.el = T.panel('tw-corner tw-box tw-rows', '<h3>BOOKS</h3><p><span>THROW [J]</span><b class="tw-n">0</b></p>', true); S.n = S.el.querySelector('.tw-n');
      const th = () => this.thr(r, T);
      T.key('KeyJ', th); T.btn('BOOK', 'right: 120px; bottom: 170px;', th);
    },
    thr(r, T) {
      const S = T.s; if (S.books <= 0 || !S.w) return;
      S.books -= 1; S.n.textContent = S.books;
      let x = r.p.x, z = r.p.z;
      for (let d = 1; d <= 9; d += 1) { const nx = r.p.x - Math.sin(r.p.yaw) * d, nz = r.p.z - Math.cos(r.p.yaw) * d; if (r.blockedE(nx, nz)) break; x = nx; z = nz; }
      S.lure = [x, z]; S.lt = 6; r.snd && r.snd.play('thud', { k: 0.8 }); r.toast('BOOK THROWN', 1);
    },
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name);
      S.w = null; S.lt = 0;
      if (!sec || sec.b === 'fight') return;
      const p = T.spawnPts(sec, 4, 12), def = this;
      const e = r.enemy('heavy', p[0][0], p[0][1], { hp: 3, drop: false, exact: true, friendly: true });
      e.n.vest.visible = false; S.w = e; let goal = null, cd = 0, tg = 0;
      e.ai = (q, dt) => {
        const g = q.n.g.position, pl = r.p, sprint = r.keys && (r.keys.ShiftLeft || r.keys.ShiftRight) && pl.moving > 0.3;
        const dp = Math.hypot(pl.x - g.x, pl.z - g.z);
        if ((sprint && dp < 14) || (r.time - (r.twShotT || -9) < 1 && dp < 22)) { goal = [pl.x, pl.z]; tg = 3; }
        if (S.lt > 0 && S.lure) { goal = S.lure; tg = 1; }
        S.lt -= dt; tg -= dt; cd -= dt;
        if (!goal || tg < -4 || Math.hypot(goal[0] - g.x, goal[1] - g.z) < 0.8) { const w = T.spawnPts(sec, 1, 0)[0]; goal = w; tg = 0; }
        const dx = goal[0] - g.x, dz = goal[1] - g.z, d = Math.hypot(dx, dz) || 1, sp = tg > 0 ? 3.1 : 1.1;
        q.n.yaw = Math.atan2(dx, dz);
        const nx = g.x + dx / d * sp * dt, nz = g.z + dz / d * sp * dt;
        if (!r.blockedE(nx, g.z)) g.x = nx; if (!r.blockedE(g.x, nz)) g.z = nz;
        q.n.creeping = true; q.n.armT = 0;
        if (dp < 1.7 && cd <= 0 && !r.locked) { cd = 1; r.hurt(25, g.x, g.z); }
        return true;
      };
      p.slice(1).forEach((q, i) => {
        const m = r.box(q[0], 0.15, q[1], 0.45, 0.3, 0.35, 0xffffff, false, true); T.att(() => T.gone(m));
        const it = T.interact({ pos: [q[0], 0.4, q[1]], label: 'TAKE A BOOK', reach: 2.4, use: () => { it.done(); T.gone(m); S.books += 1; S.n.textContent = S.books; r.sfx('notification'); } });
        T.att(() => it.done());
      });
      if (!S.said) { S.said = true; T.after(4, () => r.hint('THE LIBRARIAN IS BLIND: HE HEARS RUNNING AND SHOTS — WALK, AND THROW BOOKS [J] TO DISTRACT HIM', 6)); }
    }
  });

  // ===================================================================== 38 SNIPER NEST — дуэль снайперов
  // В каждом секторе на дальнем краю засел снайпер-соперник. Блик его линзы мигает перед выстрелом; ваш блик (долгое прицеливание) выдаёт вас — прячьтесь и стреляйте первым.
  TW.add(38, {
    name: 'sniper-duel',
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name);
      S.rv = null; S.sc = 0; S.gl = S.gl || null;
      if (!sec || sec.b !== 'snipe') return;
      const hw = sec.W / 2 - 3, x = (Math.random() < 0.5 ? -1 : 1) * hw, z = sec.zB + 8;
      const e = r.enemy('grunt', x, z, { hp: 0.6, drop: false, exact: true, pers: 'sniper', tag: 'rival' });
      S.rv = e; S.cd = 4;
      if (!S.gl) { S.gl = new (window.THREE.Mesh)(r.g.box, new (window.THREE.MeshBasicMaterial)({ color: 0xffffff, depthTest: false, transparent: true })); S.gl.scale.set(0.35, 0.35, 0.35); S.gl.renderOrder = 20; r.scene.add(S.gl); }
      S.gl.visible = false;
      T.att(() => { S.gl.visible = false; S.rv = null; });
      r.hint('A RIVAL SNIPER IS ON THE FAR ROOF — WATCH FOR HIS LENS GLINT', 5);
    },
    tick(r, T, dt) {
      const S = T.s, e = S.rv;
      if (!e || r.locked) return;
      if (e.dead) { S.gl.visible = false; S.rv = null; T.bonus(20, 'SNIPER DUEL WON'); return; }
      S.cd -= dt;
      S.gl.position.set(e.x, 1.7, e.z);
      S.gl.visible = S.cd < 0.6 && S.cd > 0 && Math.sin(T.t * 30) > 0;
      if (S.cd <= 0) { S.cd = 4.5; if (e.los) { r.toast('HE FIRES', 0.8); r.hurt(12, e.x, e.z); } }
      S.sc = r.scoped ? S.sc + dt : 0;
      if (S.sc > 2.2) { S.sc = 0; if (e.los) { r.toast('YOUR LENS GLINT GAVE YOU AWAY', 1.6); r.hurt(14, e.x, e.z); } }
    }
  });

  const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  // ===================================================================== 40 BRIDGE — мост рушится позади
  // В забеге за вами обваливается полотно: чёрная пропасть догоняет прессом, пролёты трясутся.
  TW.add(40, {
    name: 'collapsing-span',
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name);
      S.pit = null; S.sec = null;
      if (!sec || sec.b !== 'run') return;
      S.sec = sec;
      const m = T.add(new (window.THREE.Mesh)(r.g.box, r.basic(0x000000))); m.scale.set(sec.W, 0.05, 1); m.position.set(0, 0.07, sec.zA); S.pit = m;
      T.att(() => { r.extraShake = 0; });
      T.after(2, () => r.hint('THE SPAN IS FALLING AWAY BEHIND YOU — KEEP RUNNING', 4));
    },
    tick(r, T, dt) {
      const S = T.s, b = r.bulk;
      if (!S.pit || !b || !b.on) return;
      const len = Math.max(0.1, S.sec.zA + 12 - b.z);
      S.pit.scale.z = len; S.pit.position.z = b.z + len / 2 - 0.4;
      if (!r.locked) { r.extraShake = 0.004; if (Math.random() < dt * 4) r.sparks(rnd(-6, 6), 0.2, b.z + 1, 0, 1, 0, 2); }
    }
  });

  // ===================================================================== 41 SUBWAY RUSH — вагон полон пассажиров
  // В боевых секторах на полу лежат перепуганные пассажиры. Не стрелять: за чистый штурм без жертв — бонус.
  TW.add(41, {
    name: 'passengers',
    setup(r, T) { T.s.dead = 0; },
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name);
      if (!sec || sec.b !== 'fight') return;
      T.spawnPts(sec, 7, 5).forEach((p) => {
        const e = r.enemy('grunt', p[0], p[1], { friendly: true, drop: false, exact: true, hp: 0.4, yaw: Math.random() * 6.28 });
        e.ai = (q) => { q.n.cvT = 1; q.n.daze = 1; q.n.armT = 0; q.n.creeping = false; return true; };
        e.onDeath = () => { S.dead += 1; r.hint('A PASSENGER WAS HIT', 1.8); r.flash(0.25); };
      });
      if (!S.said) { S.said = true; T.after(3, () => r.hint('PASSENGERS ARE LYING ON THE FLOOR — DO NOT SHOOT THEM', 5)); }
    },
    finish(r, T, done) { if (done && T.s.dead === 0) r.twBonus = (r.twBonus || 0) + 40; }
  });

  // ===================================================================== 42 SIEGE — карта улучшения между волнами
  // Перед каждым генератором три карты: БРОНЯ (+40 здоровья), ПАТРОНЫ (полный запас), ЛОВУШКА (бочки у генератора). Клик или [4] [5] [6]; через 9 с выбирается первая.
  TW.add(42, {
    name: 'upgrade-cards',
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name);
      if (!sec || sec.b !== 'hold' || sec.k === 0) return;
      const cards = [['ARMOR', '+40 MAX INTEGRITY, FULL HEAL'], ['AMMO', 'FULL RESERVES FOR EVERY WEAPON'], ['TRAP', 'THREE BARRELS AT THE GENERATOR']];
      const el = document.createElement('div'); el.className = 'tw-cards';
      el.innerHTML = '<div><h2>CHOOSE AN UPGRADE</h2><p class="s">[4] [5] [6] OR CLICK — AUTO IN 9 S</p>' + cards.map((c, i) => '<button type="button" class="tw-card"><i>[' + (i + 4) + ']</i><b>' + c[0] + '</b>' + c[1] + '</button>').join('') + '</div>';
      r.layer.appendChild(el); let done = false;
      if (!r.touch && document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { /* ignore */ } }
      const pick = (i) => {
        if (done) return; done = true; el.remove();
        if (!r.touch) r.requestLock();
        if (i === 0) { r.maxHp += 40; r.hp = r.maxHp; r.refreshHud(); }
        else if (i === 1) r.inv.forEach((w) => { w.reserve = w.def.maxReserve; w.mag = w.def.mag; });
        else for (let k = 0; k < 3; k += 1) { const x = sec.gen[0] + (k - 1) * 2.4, z = sec.gen[1] + 3; if (!r.blockedE(x, z)) { const b = r.barrel(x, z); T.att(() => { b.alive = false; b.col.off = true; b.m.visible = b.band.visible = false; }); } }
        r.refreshHud(); r.sfx('notification'); r.toast(cards[i][0], 1.4);
      };
      el.querySelectorAll('.tw-card').forEach((b, i) => b.addEventListener('click', () => pick(i)));
      const kd = (e) => { if (/^Digit[456]$/.test(e.code)) pick(+e.code.slice(5) - 4); };
      document.addEventListener('keydown', kd);
      T.att(() => { done = true; el.remove(); document.removeEventListener('keydown', kd); });
      T.after(9, () => pick(0));
    }
  });

  // ===================================================================== 43 TRAITOR — напарник стреляет в спину
  // На стелс-участке с вами идёт напарник в белом жилете. На середине он оборачивается и открывает огонь.
  TW.add(43, {
    name: 'partner-betrayal',
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name);
      S.p = null;
      if (!sec || sec.b !== 'stealth') return;
      const e = r.enemy('grunt', r.p.x + 2, r.p.z + 2, { friendly: true, drop: false, exact: true, hp: 2.2, tag: 'partner' });
      S.p = e; S.sec = sec; S.turned = false;
      e.ai = (q, dt) => {
        if (S.turned) return false;
        const g = q.n.g.position, tx = r.p.x + 1.6, tz = r.p.z + 2.2, dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz);
        if (d > 0.5) { const sp = Math.min(3.2, d * 2) * dt, nx = g.x + dx / d * sp, nz = g.z + dz / d * sp; if (!r.blockedE(nx, g.z)) g.x = nx; if (!r.blockedE(g.x, nz)) g.z = nz; q.n.yaw = Math.atan2(dx, dz); q.n.creeping = true; } else q.n.creeping = false;
        q.n.armT = 0; return true;
      };
      T.att(() => { S.p = null; });
      if (!S.said) { S.said = true; r.say(HND, 'ВОЗЬМИ НАПАРНИКА. ОН ПРОВЕДЁТ ТЕБЯ ДО КОМНАТЫ.', 3); r.hint('YOUR PARTNER (WHITE VEST) COVERS YOUR BACK', 4); }
    },
    tick(r, T, dt) {
      const S = T.s, e = S.p;
      if (!e || S.turned || e.dead || r.locked) return;
      if (r.p.z < S.sec.zA - S.sec.D * 0.55) {
        S.turned = true; e.friendly = false; e.n.vest.visible = true; e.n.armT = 1; e.cd = 0.3;
        r.glitch && r.glitch(0.2); r.sfx('error');
        r.say(e.n ? 'PARTNER' : '', 'ТЫ СЛИШКОМ МНОГО ЗНАЕШЬ.', 2.4); r.hint('HE TURNED ON YOU!', 3);
      }
    }
  });

  // ===================================================================== 44 THE WARDEN RETURNS — время BREAKOUT на спине
  // Над Надзирателем висит ваше лучшее время прохождения BREAKOUT (миссия 7).
  TW.add(44, {
    name: 'warden-time',
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name);
      S.lab = null;
      if (!sec || sec.b !== 'boss') return;
      const tm = TW.stats(null).tm[7];
      S.txt = 'BREAKOUT ' + (tm ? fmt(tm) : '--:--');
      S.lab = T.label(S.txt, 0, 4.2, 0, { w: 3, size: 54, bill: true });
      T.att(() => { S.lab = null; });
      T.after(2, () => r.hint('THE WARDEN WEARS YOUR BREAKOUT TIME ON HIS BACK', 4));
    },
    tick(r, T, dt) {
      const S = T.s; if (!S.lab) return;
      const b = T.foes((e) => e.type === 'boss')[0];
      if (b) { S.lab.visible = true; S.lab.position.set(b.x, 4.8, b.z); } else S.lab.visible = false;
    }
  });

  // ===================================================================== 47 COLD STORAGE — запись камер
  // На финальной карточке: «ТЕБЯ ВИДЕЛИ / НЕ ВИДЕЛИ», число убийств и время ограбления.
  TW.add(47, {
    name: 'footage',
    tick(r, T, dt) {
      const S = T.s;
      if (!r.ending || S.card) return;
      const end = r.qs('.m-end');
      if (end.classList.contains('on') && end.querySelector('h2').textContent === 'MISSION COMPLETE') {
        S.card = true;
        const seen = r.hz && (r.hz.loud || r.hz.alarm);
        end.querySelector('p').insertAdjacentHTML('beforeend', '<br>SECURITY FOOTAGE: ' + (seen ? 'YOU WERE SEEN' : 'YOU WERE NOT SEEN') + '<br>HOSTILES DOWN: ' + (r.twStat ? r.twStat.kills : 0) + '<br>TIME ON JOB: ' + fmt(r.twStat ? r.twStat.time : 0));
      }
    }
  });
}());
