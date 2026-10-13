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
}());
