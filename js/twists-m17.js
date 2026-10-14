// NEXA: «удивляющие штуки» миссий 17–32 (ядро и реестр — js/twists.js, описание — MISSION_TWISTS.md). Тексты: английский исходник, переводы — js/i18n-twists.js.
(function () {
  'use strict';
  const TW = window.Twists;
  const C = window.Missions && window.Missions._core;
  if (!TW || !C) return;
  const { clamp, rnd } = TW;
  const PI = Math.PI;
  const HND = 'HANDLER';
  const rsel = (a) => a[Math.floor(Math.random() * a.length)];
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const row = (k, v) => ({ html: '<span>' + k + '</span><b>' + esc(v) + '</b>' });
  const fmtT = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  // прямоугольник [x0,x1]×[z0,z1] свободен от коллайдеров (кроме внешних стен — они отступают внутрь по x0/x1)
  const freeRect = (r, x0, x1, z0, z1, m) => !r.colliders.some((c) => !c.off && (c.y0 === undefined || c.y0 < 1.5) && x0 < c.x1 && x1 + m > c.x0 && z0 - m < c.z1 && z1 + m > c.z0);

  // ===================================================================== 19 CLEANERS — личное досье в архиве
  // Взломал терминал архива — на экране ваше досье: задания, убийства, смерти, любимое оружие (статистика копится локально, см. Twists.stats).
  TW.add(19, {
    name: 'dossier',
    // успех взлома = интерактив терминала исчез не из-за смерти (смерть режет список интерактивов, но тогда r.dead)
    setup(r, T) { T.s.shown = false; T.s.had = false; },
    phase(r, T, name) { T.s.had = false; },
    tick(r, T, dt) {
      const S = T.s, sec = T.sec();
      if (S.shown || r.dead || T.ph !== 's1' || !sec || sec.b !== 'hack' || !sec.term) return;
      const t = sec.term, has = r.interactables.some((i) => Math.abs(i.pos.x - t.x) < 0.01 && Math.abs(i.pos.z - t.z) < 0.01);
      if (has) S.had = true;
      else if (S.had && !r.locked) { S.shown = true; this.show(r, T); }
    },
    show(r, T) {
      const st = TW.stats(r);
      let prog = {}; try { prog = JSON.parse(localStorage.getItem('nexaProgress')) || {}; } catch (e) { prog = {}; }
      const done = Math.max(18, Array.isArray(prog.completedTasks) ? prog.completedTasks.length : 0);
      let top = '', n = 0, tot = 0;
      Object.keys(st.shots).forEach((k) => { tot += st.shots[k]; if (st.shots[k] > n) { n = st.shots[k]; top = k; } });
      const W = C.WEAPONS || {}, wname = top && W[top] ? W[top].name : 'GLOCK 17';
      const el = T.panel('tw-left tw-box tw-rows tw-fade', '<h3>NEXA ARCHIVE — PERSONAL FILE</h3><p><span>SUBJECT</span><b>083</b></p>');
      el.style.maxWidth = 'min(430px, 84vw)';
      T.after(0.05, () => el.classList.add('on'));
      const notes = st.deaths > 1 ? [{ html: '<em>NOTE: THE SUBJECT DIED ' + st.deaths + ' TIMES AND CAME BACK EVERY TIME.</em>' }] : st.deaths === 1 ? [{ html: '<em>NOTE: THE SUBJECT DIED ONCE AND CAME BACK.</em>' }] : [{ html: '<em>NOTE: NO DEATHS ON FILE. NEXA FINDS THIS SUSPICIOUS.</em>' }];
      const lines = [
        row('TASKS COMPLETED', String(done)),
        row('HOSTILES NEUTRALIZED', String(st.kills)),
        row('HEADSHOTS', String(st.heads)),
        row('TIMES TERMINATED', String(st.deaths)),
        row('FAVOURITE TOOL', tot ? wname + ' — ' + Math.round(n / tot * 100) + '%' : wname),
        row('TIME UNDER OBSERVATION', fmtT(st.time))
      ].concat(notes);
      r.sfx('notification');
      r.say(HND, 'ЭТО ТВОЁ ДОСЬЕ. ОНИ ВЕДУТ УЧЁТ КАЖДОГО ТВОЕГО ШАГА.', 2.8);
      T.type(el, lines, 0.55, () => { T.after(11, () => el.classList.remove('on')); });
    }
  });

  // ===================================================================== 21 FIRST JOB — контейнер №14
  // У западной стены склада в секторе 2 стоят пронумерованные контейнеры. №14 приоткрыт: внутри спрятан плюшевый чёрный мишка
  // (разблокировка игрушки; если мишка уже есть — кредиты). Забирается один раз за все прохождения.
  TW.add(21, {
    name: 'container-14',
    setup(r, T) {
      const S = T.s, M = r.mm, sec = M && M.secs[1];
      if (!sec) return;
      const W = M.W, x0 = -W / 2 + 0.12, x1 = x0 + 2.4, LEN = 4.0, H = 2.5, T3 = window.THREE;
      // подходящие места вдоль стены: сверху вниз по Z
      const spots = [];
      for (let zt = sec.zA - 4.5; zt > sec.zB + 4.5 && spots.length < 3; zt -= 0.5) {
        const z0 = zt - LEN, z1 = zt;
        if (r.inRoom && r.inRoom(-W / 2 - 1.5, (z0 + z1) / 2)) continue;
        if (freeRect(r, x0, x1 + 0.6, z0, z1, 0.25) && (!spots.length || spots[spots.length - 1][0] - z1 > 1.0)) spots.push([z1, z0]);
        if (spots.length && spots.length < 3) zt = Math.min(zt, spots[spots.length - 1][1] - 0.5);
      }
      if (!spots.length) { S.none = true; return; }
      const nums = spots.length >= 3 ? [7, 14, 19] : spots.length === 2 ? [7, 14] : [14];
      S.cont = [];
      spots.forEach((sp, i) => {
        const num = nums[i], z0 = sp[1], z1 = sp[0], cz = (z0 + z1) / 2, hot = num === 14;
        r.box((x0 + x1) / 2, H - 0.06, cz, x1 - x0, 0.12, LEN, 0x4a4a4a, true);                 // крыша
        r.box((x0 + x1) / 2, H / 2, z0 + 0.06, x1 - x0, H, 0.12, 0x686868, true);               // торцы
        r.box((x0 + x1) / 2, H / 2, z1 - 0.06, x1 - x0, H, 0.12, 0x686868, true);
        r.box(x1 - 0.06, H / 2, z0 + 0.3, 0.12, H, 0.5, 0x5a5a5a, true);                         // косяки двери
        r.box(x1 - 0.06, H / 2, z1 - 0.3, 0.12, H, 0.5, 0x5a5a5a, true);
        r.box(x0 + 0.06, H / 2, cz, 0.12, H, LEN, 0x686868, false);                              // задняя стена
        const door = r.door(x1 - 0.06, cz, LEN - 1.0, hot ? H - 0.35 : H - 0.1, true);
        door.material = r.mat(hot ? 0x3b3b3b : 0x4a4a4a);
        if (hot) door.position.y += 0.3;
        // таблички едут вместе с дверью (поднимаются, когда она открывается)
        door.attach(T.label(String(num), x1 + 0.07, 1.75, cz, { w: 1.4, size: 96, yaw: PI / 2, bg: 'rgba(0,0,0,.35)', keep: true }));
        door.attach(T.label('CONTAINER ' + num, x1 + 0.07, 0.7, cz, { w: 2.2, size: 44, yaw: PI / 2, bg: false, keep: true, color: '#d8d8d8' }));
        const c = { num, door, cz, x0, x1, hot, opened: false };
        if (hot) {
          // приоткрыта: щель внизу и свет из неё
          r.strip(x1 + 0.02, 0.12, cz, 0.05, 0.24, LEN - 1.1, 0xffffff);
          r.strip((x0 + x1) / 2, H - 0.16, cz, 1.6, 0.05, 1.6, 0xffffff);
          // мишка на ящике у задней стены
          const bear = this.bear(r), bx = x0 + 0.9;
          bear.position.set(bx, 0.62, cz); bear.rotation.y = PI / 2;
          r.scene.add(bear); r.crate(bx, cz, 0.7, 0.7, 0.42, 0x3a3a3a);
          S.bear = bear; S.bpos = [bx, cz];
          const here = () => !!r.mm.cur && r.mm.cur.k === 1;
          c.it1 = T.interact({ pos: [x1 + 0.2, 1.1, cz], label: 'OPEN CONTAINER 14', reach: 2.8, enabled: () => here() && !c.opened, use: () => { c.opened = true; c.it1.done(); r.openDoor(door, 1.0); r.sfx('notification'); } });
          c.it2 = T.interact({ pos: [bx + 0.4, 1.0, cz], label: 'TAKE THE PLUSH BEAR', reach: 2.4, enabled: () => here() && c.opened && !S.taken, use: () => { c.it2.done(); this.take(r, T); } });
        }
        S.cont.push(c);
      });
      T.after(5, () => r.hint('DOCK LOG: CONTAINER 14 — "EMPTY". SOMEONE HAS BEEN INSIDE.', 5));
    },
    bear(r) {
      const T3 = window.THREE, g = new T3.Group(), mk = (rad, col, x, y, z, sy) => { const m = new T3.Mesh(new T3.SphereGeometry(rad, 12, 9), r.mat(col)); m.position.set(x, y, z); if (sy) m.scale.y = sy; g.add(m); return m; };
      mk(0.2, 0x1a1a1a, 0, 0, 0, 1.12);                  // тело
      mk(0.15, 0x1f1f1f, 0, 0.32, 0.02);                 // голова
      mk(0.055, 0x1a1a1a, -0.11, 0.46, 0); mk(0.055, 0x1a1a1a, 0.11, 0.46, 0);   // уши
      mk(0.06, 0x3a3a3a, 0, 0.29, 0.14);                 // морда
      mk(0.07, 0x1a1a1a, -0.24, 0.02, 0.04); mk(0.07, 0x1a1a1a, 0.24, 0.02, 0.04);  // лапы
      mk(0.09, 0x1a1a1a, -0.12, -0.2, 0.12); mk(0.09, 0x1a1a1a, 0.12, -0.2, 0.12);  // ноги
      const eye = (x) => { const m = new T3.Mesh(new T3.SphereGeometry(0.02, 6, 5), r.basic(0xffffff)); m.position.set(x, 0.36, 0.14); g.add(m); };
      eye(-0.055); eye(0.055);
      return g;
    },
    take(r, T) {
      const S = T.s;
      S.taken = true; S.bear.visible = false;
      r.sfx('notification');
      let msg;
      if (TW.claimed('bear21')) msg = 'THE BEAR IS ALREADY IN YOUR COLLECTION';
      else {
        TW.claim('bear21');
        const T_ = window.Toys;
        if (T_ && T_.grant && T_.grant('black_bear')) msg = 'TOY UNLOCKED: BLACK BEAR';
        else { T.bonus(150, 'PLUSH BEAR'); msg = 'YOU ALREADY OWN THE BEAR'; }
      }
      r.hint(msg, 4);
      r.say(HND, 'СТРАННАЯ НАХОДКА. ПОХОЖЕ, КТО-ТО ОСТАВИЛ ЭТО ДЛЯ ТЕБЯ.', 2.6);
    },
    tick(r, T, dt) {
      const S = T.s;
      if (S.bear && S.bear.visible) { S.bear.position.y = 0.62 + Math.sin(T.t * 2) * 0.015; S.bear.rotation.y = PI / 2 + Math.sin(T.t * 0.8) * 0.25; }
    }
  });

  // ===================================================================== 26 WIRETAP — подслушанные разговоры охраны
  // Над охранниками в скрытных секторах всплывают обрывки разговоров. Среди них есть настоящие наводки: «камера у стены не работает» (она отключается)
  // и «иду курить» (охранник действительно уходит с поста). Остальное — болтовня.
  TW.add(26, {
    name: 'eavesdrop',
    phase(r, T, name) { const S = T.s; S.tips = { cam: false, smoke: false }; S.tag = new Map(); S.cd = 2.5; },
    tick(r, T, dt) {
      const S = T.s, sec = T.sec(), M = r.mm;
      if (!sec || sec.b !== 'stealth' || !M || !M.S || !S.tag) return;
      const SS = M.S, G = SS.guards();
      S.cd -= dt;
      G.forEach((q) => {
        let t = S.tag.get(q);
        if (!t) { t = { next: rnd(0.5, 2.5), life: 0, m: null }; S.tag.set(q, t); }
        const g = q.n.g.position, d = Math.hypot(g.x - r.p.x, g.z - r.p.z);
        if (t.life > 0) { t.life -= dt; if (t.m) { t.m.position.set(g.x, 2.45, g.z); if (SS.alarm || t.life <= 0 || d > 11) { t.m.visible = false; t.life = Math.min(t.life, 0); } } }
        if (t.life <= 0 && d < 9 && !SS.alarm && !q.dead && q.unaware !== false && S.cd <= 0) {
          t.next -= dt;
          if (t.next <= 0) { this.speak(r, T, q, t, SS); t.next = rnd(5.5, 8); S.cd = 1.6; }
        }
      });
    },
    speak(r, T, q, t, SS) {
      const S = T.s;
      const cams = SS.items.filter((i) => i.kind === 'cam' && !i.off);
      let line = null, tip = null;
      if (!S.tips.cam && cams.length) {
        const cam = rsel(cams); S.tips.cam = true; tip = 'cam';
        line = cam.x < 0 ? '...THE WEST WALL CAMERA? DEAD SINCE MONDAY. NOBODY FIXED IT.' : '...THE EAST WALL CAMERA? DEAD SINCE MONDAY. NOBODY FIXED IT.';
        T.after(2.2, () => { SS.disable(cam); r.hint('INTEL: A CAMERA IS OFFLINE', 3); });
      } else if (!S.tips.smoke && SS.guards().length > 1) {
        S.tips.smoke = true; tip = 'smoke';
        line = '...I\'M GOING OUT FOR A SMOKE. COVER FOR ME, OK?';
        T.after(2.4, () => {
          if (q.dead || SS.alarm) return;
          const b = r.bounds, wx = (q.n.g.position.x > 0 ? -1 : 1) * (b ? b.w / 2 - 2.6 : 8), wz = q.n.g.position.z;
          q.inv = [wx, wz]; q.invT = 13; q.hold = 0; r.hint('INTEL: A GUARD LEFT HIS POST', 3);
        });
      } else line = rsel(['...DID YOU SEE THE GAME LAST NIGHT?', '...THIS FLOOR SMELLS LIKE OLD COFFEE.', '...I HATE THE NIGHT SHIFT.', '...THEY WANT A REPORT BY MORNING. A REPORT ON WHAT?', '...MY WIFE SAYS I SNORE AT WORK TOO.', '...DON\'T TELL ANYONE, BUT I NEVER CHECK THE STAIRS.']);
      if (!t.m) t.m = T.label(line, q.n.g.position.x, 2.45, q.n.g.position.z, { w: 3.4, size: 40, lines: 2, bill: true });
      else T.relabel(t.m, line);
      t.m.visible = true; t.life = 5;
      if (tip && !S.said) { S.said = true; r.hint('GUARD CHATTER — LISTEN CLOSELY: SOME OF IT IS USEFUL', 4); }
    }
  });

  // ===================================================================== 31 CONVOY — какая из четырёх машин
  // В секторе 2 четыре грузовика колонны. Нужный один: по записке куратора — ровный огонёк и номер на заданную цифру, остальные мигают.
  // Заряд на чужой грузовик — ложная тревога и подкрепление.
  TW.add(31, {
    name: 'which-truck',
    setup(r, T) { /* грузовики строятся на старте сектора (нужны sec.tgt и построенные укрытия) */ },
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name);
      if (!sec || sec.b !== 'plant') return;
      S.sec = sec;
      if (!S.built) this.build(r, T, sec);
      if (S.built) { sec.tgt = S.tgt; this.live(r, T, sec); }
    },
    build(r, T, sec) {
      const S = T.s, M = r.mm, W = M.W;
      // убрать исходный ящик-цель
      const [tx0, tz0] = sec.tgt;
      r.scene.children.slice().forEach((o) => {
        if (!o.isMesh) return;
        const p = o.position;
        if (Math.abs(p.z - tz0) < 0.06 && (Math.abs(p.x - tx0) < 0.06 || Math.abs(p.x - (tx0 + 0.3)) < 0.06) && (o.userData.col || p.y > 2)) T.gone(o);
      });
      const xs = [-10.5, -3.5, 3.5, 10.5].map((x) => clamp(x, -W / 2 + 2.5, W / 2 - 2.5));
      const tz = tz0, trucks = [];
      // укрытия, мешающие колонне, убираем
      xs.forEach((x) => {
        const bx0 = x - 1.4, bx1 = x + 1.4, bz0 = tz - 2.6, bz1 = tz + 2.3;
        r.scene.children.slice().forEach((o) => {
          const c = o.userData && o.userData.col;
          if (!c || c.off || ((c.y1 - c.y0) > 3.3 && (c.x1 - c.x0) > 8)) return;
          if (bx0 < c.x1 && bx1 > c.x0 && bz0 < c.z1 && bz1 > c.z0) T.gone(o);
        });
      });
      const used = {}; const plate = [];
      while (plate.length < 4) { const n = 10 + Math.floor(Math.random() * 89); if (!used[n % 10]) { used[n % 10] = 1; plate.push(n); } }
      const lamps = ['steady', 'slow', 'fast', 'off'].sort(() => Math.random() - 0.5);
      const goal = Math.floor(Math.random() * 4);
      const lampOf = [0, 1, 2, 3].map((i) => (i === goal ? 'steady' : lamps.filter((l) => l !== 'steady')[(i > goal ? i - 1 : i) % 3]));
      xs.forEach((x, i) => {
        // кузов + кабина (кабиной к стене-цели), коллайдер общий
        const z = tz, g = { x, z, i, plate: plate[i], lamp: lampOf[i], goal: i === goal };
        const c1 = r.box(x, 1.25, z + 0.5, 2.5, 2.5, 3.0, 0x666666, true);
        const c2 = r.box(x, 0.95, z - 1.7, 2.3, 1.9, 1.4, 0x4c4c4c, true);
        r.box(x, 2.0, z - 2.42, 2.0, 0.5, 0.08, 0x111111, false);      // лобовое
        const plateM = T.label('NX-' + g.plate, x, 0.75, z + 2.03, { w: 1.5, size: 54, bg: 'rgba(230,230,230,.9)', color: '#111', keep: true });
        plateM.rotation.y = 0;
        const lamp = r.box(x, 2.38, z + 2.03, 1.4, 0.16, 0.06, 0xffffff, false, true);
        g.lampM = lamp; g.parts = [c1, c2];
        trucks.push(g);
      });
      S.trucks = trucks; S.goal = trucks[goal]; S.tgt = [S.goal.x, S.goal.z];
      S.built = true;
    },
    live(r, T, sec) {
      const S = T.s;
      const d = S.goal.plate % 10;
      const el = T.panel('tw-left tw-box', '<h3>CONVOY MANIFEST</h3><p>TARGET: STEADY LAMP, PLATE ENDS IN <b>' + d + '</b></p>');
      el.style.maxWidth = 'min(330px, 80vw)';
      r.say(HND, 'ГРУЗОВИК С КОНТЕЙНЕРОМ ОДИН. У НЕГО РОВНАЯ ЛАМПА, А НОМЕР ЗАКАНЧИВАЕТСЯ НА ' + d + '. У ОСТАЛЬНЫХ ЛАМПА МИГАЕТ.', 4);
      S.wrong = 0;
      // «заряд» на чужих машинах: ложная тревога
      S.trucks.forEach((g) => {
        if (g.goal) return;
        let used = false;
        const it = T.interact({
          pos: [g.x, 1.1, g.z + 2.4], label: 'SET THE CHARGES', reach: 2.6, enabled: () => T.ph === 's' + sec.k && !used && !(sec.brk && sec.brk.broken),
          use: () => {
            used = true; it.done(); S.wrong += 1;
            r.snd && r.snd.play('alarm'); r.flash(0.3); r.shake(0.05, 0.6);
            r.hint('WRONG TRUCK — EMPTY CARGO BAY. THE ALARM IS ON', 3.4);
            T.wave(sec, ['grunt', 'grunt', 'rusher']);
          }
        });
        T.att(() => { const i = r.interactables.indexOf(it); if (i >= 0) r.interactables.splice(i, 1); });
      });
      T.att(() => { el.remove(); });
    },
    tick(r, T, dt) {
      const S = T.s;
      if (!S.trucks) return;
      const t = T.t;
      S.trucks.forEach((g) => {
        const m = g.lampM; if (!m) return;
        let on = true;
        if (g.lamp === 'slow') on = (t % 1.6) < 0.8; else if (g.lamp === 'fast') on = (t % 0.5) < 0.25; else if (g.lamp === 'off') on = false;
        m.material = r.basic(on ? 0xffffff : 0x2a2a2a);
      });
      // груз взорван — целевой грузовик горит чёрным остовом
      const sec = S.sec;
      if (sec && sec.brk && sec.brk.broken && !S.burnt) { S.burnt = true; S.goal.parts.forEach((p) => { p.material = r.mat(0x151515); }); }
    }
  });

  // ===================================================================== 32 FLASHBANG — отбей гранату ногой
  // Враги швыряют светошумовые под ноги. Пока граната на полу и пищит — ударьте её ногой [V] в сторону бросившего: ослепление вернётся к нему.
  TW.add(32, {
    name: 'kick-back',
    phase(r, T, name) {
      const S = T.s;
      S.g = []; S.next = 5.5; S.said = false; S.kickRef = null; S.blinded = 0;
      T.att(() => { (S.g || []).forEach((g) => { g.grp.visible = false; if (g.grp.parent) g.grp.parent.remove(g.grp); g.beam.visible = false; if (g.beam.parent) g.beam.parent.remove(g.beam); }); S.g = []; });
    },
    reset(r, T) { const S = T.s; (S.g || []).forEach((g) => { g.grp.visible = false; if (g.grp.parent) g.grp.parent.remove(g.grp); g.beam.visible = false; if (g.beam.parent) g.beam.parent.remove(g.beam); }); S.g = []; },
    tick(r, T, dt) {
      const S = T.s;
      if (!S.g || r.locked) return;
      const sec = T.sec();
      if (sec && sec.b === 'fight') {
        S.next -= dt;
        if (S.next <= 0 && S.g.length < 2) { if (this.throwOne(r, T)) S.next = rnd(11, 15); else S.next = 1.5; }
      }
      // физика гранат
      for (let i = S.g.length - 1; i >= 0; i -= 1) {
        const g = S.g[i];
        g.fuse -= dt; g.vy -= 9.8 * dt;
        let nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, nz = g.z + g.vz * dt;
        if (r.blockedE(nx, g.z)) { g.vx *= -0.35; nx = g.x; }
        if (r.blockedE(g.x, nz)) { g.vz *= -0.35; nz = g.z; }
        if (ny < 0.09) { ny = 0.09; if (Math.abs(g.vy) > 1.4) r.snd && r.snd.play('thud', { k: 0.5 }); g.vy *= -0.3; g.vx *= 0.6; g.vz *= 0.6; }
        g.x = nx; g.y = ny; g.z = nz; g.grp.position.set(nx, ny, nz); g.grp.rotation.x += dt * 8;
        g.beam.position.set(nx, ny + 0.85, nz);
        g.beep -= dt;
        if (g.beep <= 0) { g.beep = Math.max(0.12, g.fuse * 0.22); r.snd && r.snd.play('c4beep', { k: 0.45, at: [g.x, 0.3, g.z], dist: Math.hypot(g.x - r.p.x, g.z - r.p.z) }); g.core.material = r.basic(g.core.material.color.getHex() === 0xffffff ? 0x888888 : 0xffffff); }
        if (g.fuse <= 0) { this.boom(r, T, g); S.g.splice(i, 1); }
      }
      // пинок
      const a = r.pm && r.pm.atk;
      if (a && a.id === 'kick' && a.done && S.kickRef !== a) { S.kickRef = a; this.kick(r, T); }
    },
    throwOne(r, T) {
      const S = T.s, p = r.p;
      const cand = T.foes((e) => { const d = Math.hypot(e.x - p.x, e.z - p.z); return e.los && d > 6 && d < 20 && !e.t.melee && e.n.g.visible; });
      if (!cand.length) return false;
      const e = rsel(cand), THREE_ = window.THREE;
      e.n.armT = 1; e.n.armAng = 2.4; T.after(0.5, () => { e.n.armT = 0; });
      const grp = new THREE_.Group(), core = new THREE_.Mesh(new THREE_.SphereGeometry(0.09, 8, 6), r.basic(0xffffff)), cap = new THREE_.Mesh(new THREE_.BoxGeometry(0.04, 0.07, 0.04), r.basic(0x888888)); cap.position.y = 0.09;
      grp.add(core, cap);
      const beam = new THREE_.Mesh(new THREE_.BoxGeometry(0.035, 1.8, 0.035), new THREE_.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
      r.scene.add(beam);
      const tx = p.x + rnd(-1.2, 1.2), tz = p.z + rnd(-1.2, 1.2), dx = tx - e.x, dz = tz - e.z, dist = Math.hypot(dx, dz), tf = clamp(dist / 9, 0.7, 1.3), y0 = 1.6;
      const g = { grp, core, beam, x: e.x, y: y0, z: e.z, vx: dx / tf, vz: dz / tf, vy: (0.09 - y0 + 0.5 * 9.8 * tf * tf) / tf, fuse: 2.5, beep: 0.5, src: e, sx: e.x, sz: e.z, ret: false };
      r.scene.add(grp); grp.position.set(g.x, g.y, g.z);
      S.g.push(g);
      r.snd && r.snd.play('throw');
      if (!S.said) { S.said = true; r.hint(r.touch ? 'ENEMY FLASHBANG! KICK IT BACK (KICK BUTTON)' : 'ENEMY FLASHBANG! KICK IT BACK [V]', 4.5); }
      else r.toast('FLASHBANG!', 1);
      return true;
    },
    kick(r, T) {
      const S = T.s, p = r.p, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      S.g.forEach((g) => {
        if (g.ret || g.y > 1.2) return;
        const dx = g.x - p.x, dz = g.z - p.z, d = Math.hypot(dx, dz);
        if (d > 2.5 || (d > 0.5 && (dx * fx + dz * fz) / d < 0.15)) return;
        const e = g.src, tx = e && !e.dead ? e.x : g.sx, tz = e && !e.dead ? e.z : g.sz, ux = tx - g.x, uz = tz - g.z, l = Math.hypot(ux, uz) || 1;
        g.vx = ux / l * 12; g.vz = uz / l * 12; g.vy = 3.4; g.ret = true; g.fuse = Math.min(g.fuse, 1.15);
        r.snd && r.snd.play('thud', { k: 0.9 });
        r.toast('RETURN TO SENDER', 1.6);
      });
    },
    boom(r, T, g) {
      const S = T.s;
      g.grp.visible = false; if (g.grp.parent) g.grp.parent.remove(g.grp); g.beam.visible = false; if (g.beam.parent) g.beam.parent.remove(g.beam);
      r.sparks(g.x, 0.6, g.z, 0, 1, 0, 10);
      if (r.snd) { if (r.snd.has('flashbang')) r.snd.play('flashbang', { k: 0.9 }); else r.snd.play('boom', { k: 0.5 }); }
      let n = 0;
      r.cb.enemies.forEach((e) => {
        if (e.dead || e.t.passive || e.friendly) return;
        const d = Math.hypot(e.x - g.x, e.z - g.z);
        if (d < 8 && (d < 3.5 || r.hasLOS(g.x, 0.6, g.z, e.x, 1.4, e.z))) { e.stagger = Math.max(e.stagger, 4.8 - d * 0.25); e.blind = true; e.tele = 0; e.burst = 0; if (e.n) e.n.armT = 0; n += 1; }
      });
      if (g.ret && n) { S.blinded += n; T.bonus(10 * Math.min(n, 3), 'RETURN TO SENDER'); r.hint('THEY ARE BLIND — FINISH THEM', 2.4); }
      const p = r.p, d = Math.hypot(p.x - g.x, p.z - g.z);
      if (d < 9) {
        const f = -Math.sin(p.yaw), h = -Math.cos(p.yaw), dx = g.x - p.x, dz = g.z - p.z, l = Math.hypot(dx, dz) || 1;
        const facing = (f * dx + h * dz) / l > -0.2 || d < 3;
        if (facing && r.hasLOS(g.x, 0.6, g.z, p.x, 1.5, p.z) && !(g.ret && d > 5)) { r.flash(0.9 + 0.8 * (1 - d / 9)); r.stress = Math.min(1, r.stress + 0.15); }
      }
    }
  });

  // ===================================================================== 23 CAMERA LOOP — призрак из записи
  // [L] — записать 10 секунд своей ходьбы. Дальше «призрак» крутит запись по кругу ~25 с, а охрана идёт посмотреть на него. Перезарядка 20 с.
  TW.add(23, {
    name: 'loop-ghost',
    setup(r, T) {
      const S = T.s;
      S.st = 'idle'; S.cd = 0; S.rec = [];
      S.el = T.panel('tw-corner tw-box', '<h3>LOOP</h3><p class="tw-a"></p>', true);
      const go = () => this.press(r, T);
      T.key('KeyL', go); T.btn('LOOP', 'right: 120px; bottom: 170px;', go);
      this.paint(T);
    },
    paint(T) {
      const S = T.s, k = S.st === 'rec' ? 'RECORDING' : S.st === 'ghost' ? 'GHOST ACTIVE' : S.cd > 0 ? 'RECHARGING' : 'READY [L]';
      if (S.k !== k) { S.k = k; S.el.querySelector('.tw-a').textContent = k; }
    },
    phase(r, T, name) { this.stop(r, T); T.s.cd = 0; },
    reset(r, T) { this.stop(r, T); },
    stop(r, T) { const S = T.s; if (S.g) { S.g.rm(); S.g = null; } S.st = 'idle'; S.rec = []; },
    press(r, T) {
      const S = T.s, sec = T.sec();
      if (S.st !== 'idle' || S.cd > 0 || !sec || sec.b !== 'stealth') { if (S.st === 'idle' && S.cd <= 0) r.toast('LOOP WORKS ONLY IN STEALTH SECTORS', 1.6); return; }
      S.st = 'rec'; S.rec = []; S.t = 0; S.rt = 0; r.sfx('notification'); r.toast('RECORDING 10 S — WALK A ROUTE', 2);
    },
    tick(r, T, dt) {
      const S = T.s;
      if (!S.el) return;
      if (S.cd > 0) S.cd = Math.max(0, S.cd - dt);
      if (r.locked) return;
      if (S.st === 'rec') {
        S.t += dt; S.rt -= dt;
        if (S.rt <= 0) { S.rt = 0.1; S.rec.push([r.p.x, r.p.z, r.p.yaw + Math.PI]); }
        if (S.t >= 10) { S.st = 'ghost'; S.t = 0; S.life = 25; S.g = T.ghost({ opacity: 0.38 }); S.g.show(true); S.lt = 0; r.snd && r.snd.play('glitch', { k: 0.5 }); r.hint('GHOST DEPLOYED — GUARDS WILL GO TO LOOK AT IT', 3.5); }
      } else if (S.st === 'ghost') {
        S.life -= dt; S.lt += dt;
        const n = S.rec.length, i = Math.floor((S.lt * 10) % Math.max(1, n)), a = S.rec[i] || S.rec[0];
        if (a) S.g.set(a[0], a[1], a[2]);
        S.lure = (S.lure || 0) - dt;
        const M = r.mm;
        if (S.lure <= 0 && M && M.S && a) {
          S.lure = 0.6;
          M.S.guards().forEach((q) => { const g = q.n.g.position; if (!M.S.alarm && q.unaware !== false && Math.hypot(g.x - a[0], g.z - a[1]) < 16) { q.inv = [a[0], a[1]]; q.invT = 3; q.hold = 0; } });
        }
        if (S.life <= 0) { this.stop(r, T); S.cd = 20; r.snd && r.snd.play('glitch', { k: 0.4 }); }
      }
      this.paint(T);
    }
  });

  // ===================================================================== 17 DAYLIGHT — обычный день на площади
  // В секторах бродят прохожие (цветные жилеты). Задел мирного — падает «мораль» (меню справа); в конце мораль превращается в кредиты.
  TW.add(17, {
    name: 'passers-by',
    VEST: [0x3f6fa8, 0xb5483a, 0x4f8a5b, 0xc8a13a, 0x7a5aa8, 0x2f9aa0],
    setup(r, T) {
      const S = T.s; S.m = 100;
      S.el = T.panel('tw-corner tw-box tw-rows', '<h3>MORALE</h3><p><span>CONDUCT</span><b class="tw-n">100%</b></p>', true);
      S.n = S.el.querySelector('.tw-n');
    },
    hit(r, T, d, why) {
      const S = T.s; S.m = Math.max(0, S.m - d); S.n.textContent = Math.round(S.m) + '%';
      r.toast(why, 1.8); r.flash(0.25); r.snd && r.snd.play('hurt', { k: 0.4 });
    },
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name);
      if (!sec || sec.b === 'run') return;
      const pts = T.spawnPts(sec, 6, 6), def = this;
      pts.forEach((p, i) => {
        const e = r.enemy('grunt', p[0], p[1], { friendly: true, drop: false, exact: true, hp: 0.4, yaw: Math.random() * 6.28 });
        e.n.vest.material = r.basic(def.VEST[i % def.VEST.length]); e.n.vest.scale.set(0.44, 0.5, 0.34);
        const c = { goal: null, wait: Math.random() * 2, pan: 0 };
        e.ai = (q, dt) => {
          const g = q.n.g.position, d = Math.hypot(r.p.x - g.x, r.p.z - g.z);
          if (d < 16 && r.time - (r.twShotT || -9) < 1.2) c.pan = 5;
          let tx, tz, sp;
          if (c.pan > 0) { c.pan -= dt; const dx = g.x - r.p.x, dz = g.z - r.p.z, l = Math.hypot(dx, dz) || 1; tx = g.x + dx / l * 3; tz = g.z + dz / l * 3; sp = 4; q.n.cvT = 0; }
          else {
            if (c.wait > 0) { c.wait -= dt; q.n.creeping = false; return true; }
            if (!c.goal || Math.hypot(c.goal[0] - g.x, c.goal[1] - g.z) < 0.6) { const q2 = T.spawnPts(sec, 1, 0)[0]; c.goal = q2; c.wait = 1 + Math.random() * 3; return true; }
            tx = c.goal[0]; tz = c.goal[1]; sp = 1.1;
          }
          const dx = tx - g.x, dz = tz - g.z, l = Math.hypot(dx, dz) || 1;
          q.n.yaw = Math.atan2(dx, dz);
          const nx = g.x + dx / l * sp * dt, nz = g.z + dz / l * sp * dt;
          if (!r.blockedE(nx, g.z) && Math.abs(nx) < sec.W / 2 - 1) g.x = nx;
          if (!r.blockedE(g.x, nz) && nz < sec.zA - 1 && nz > sec.zB + 1) g.z = nz;
          q.n.creeping = true; q.n.armT = 0;
          return true;
        };
        e.onHit = () => { def.hit(r, T, 3, 'WATCH IT — CIVILIANS'); };
        e.onDeath = () => { def.hit(r, T, 25, 'CIVILIAN KILLED'); };
      });
      if (!S.said) { S.said = true; T.after(4, () => r.hint('PEOPLE ARE WALKING THE PLAZA — DO NOT HIT THEM (MORALE)', 5)); }
    },
    finish(r, T, done) { if (done) r.twBonus = (r.twBonus || 0) + Math.round(T.s.m * 0.5); }
  });

  // ===================================================================== 18 SAFEHOUSE — 20 секунд на ловушки
  // Перед обороной генератора 20 с на расстановку ловушек: бочки (взрываются от пули), мины (от приближения врага), ящики-баррикады. [P] поставить, [O] сменить.
  TW.add(18, {
    name: 'trap-prep',
    setup(r, T) {
      const S = T.s;
      S.el = T.panel('tw-box', '<h3>TRAPS</h3><p class="tw-a"></p>', true);
      S.el.style.cssText += ';left:50%;bottom:92px;transform:translateX(-50%);display:none;text-align:center';
      S.a = S.el.querySelector('.tw-a');
      T.key('KeyP', () => this.place(r, T)); T.key('KeyO', () => { const S2 = T.s; if (S2.prep > 0) { S2.sel = (S2.sel + 1) % 3; this.paint(T); } });
      T.btn('PLACE', 'right: 120px; bottom: 170px;', () => this.place(r, T)); T.btn('SWITCH', 'right: 120px; bottom: 230px;', () => { T.s.sel = (T.s.sel + 1) % 3; this.paint(T); });
    },
    NAMES: ['BARREL', 'MINE', 'CRATE'],
    paint(T) {
      const S = T.s;
      S.a.innerHTML = [0, 1, 2].map((i) => (i === S.sel ? '<b>[' : '') + this.NAMES[i] + ' x' + S.inv[i] + (i === S.sel ? ']</b>' : '')).join('  |  ') + '<br><em>[P] PLACE  [O] SWITCH</em>';
    },
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name);
      S.prep = 0; S.items = []; S.mines = [];
      T.att(() => { S.el.style.display = 'none'; S.prep = 0; S.items.forEach((f) => f()); S.items = []; S.mines.forEach((m) => { m.m.visible = false; if (m.m.parent) m.m.parent.remove(m.m); }); S.mines = []; r.banner(null); });
      if (!sec || sec.b !== 'hold') return;
      S.sec = sec; S.prep = 20; S.sel = 0; S.inv = [3, 3, 4]; S.el.style.display = ''; S.patched = false; this.paint(T);
      r.hint('SET TRAPS BEFORE THE GENERATOR: BARRELS, MINES, CRATES', 5);
    },
    place(r, T) {
      const S = T.s, p = r.p;
      if (!(S.prep > 0) || S.inv[S.sel] <= 0) return;
      const x = p.x - Math.sin(p.yaw) * 2.6, z = p.z - Math.cos(p.yaw) * 2.6, sec = S.sec;
      if (r.blocked(x, z) || z > sec.zA - 1.5 || z < sec.zB + 1.5 || Math.abs(x) > sec.W / 2 - 1) { r.toast('NO ROOM HERE', 1.2); return; }
      S.inv[S.sel] -= 1;
      if (S.sel === 0) { const b = r.barrel(x, z); S.items.push(() => { b.alive = false; b.col.off = true; b.m.visible = b.band.visible = false; const i = r.cb.shoot.indexOf(b); if (i >= 0) r.cb.shoot.splice(i, 1); }); }
      else if (S.sel === 2) T.solid(x, 0.5, z, 1.6, 1, 0.8, 0x6a6a6a);
      else {
        const T3 = window.THREE, g = new T3.Group();
        g.add(new T3.Mesh(new T3.CylinderGeometry(0.25, 0.25, 0.07, 10), r.basic(0x2a2a2a)));
        const led = new T3.Mesh(new T3.BoxGeometry(0.06, 0.05, 0.06), r.basic(0xffffff)); led.position.y = 0.06; g.add(led);
        g.position.set(x, 0.04, z); r.scene.add(g); S.mines.push({ m: g, led, x, z, t: 0 });
      }
      r.snd && r.snd.play('click'); this.paint(T);
    },
    tick(r, T, dt) {
      const S = T.s;
      if (!S.sec) return;
      if (S.prep > 0 && !r.locked) {
        S.prep -= dt;
        r.banner('TRAP PREP — GENERATOR LOCKED ' + Math.max(1, Math.ceil(S.prep)), S.prep < 5);
        if (S.prep <= 0) { S.prep = 0; S.el.style.display = 'none'; r.banner(null); r.hint('TRAPS ARMED — START THE GENERATOR', 3); }
      }
      if (!S.patched) {
        const it = r.interactables.find((i) => i.label === 'START THE GENERATOR' && !i.twp);
        if (it) { it.twp = true; const e0 = it.enabled; it.enabled = () => S.prep <= 0 && (!e0 || e0()); S.patched = true; }
      }
      S.mines.forEach((m, i) => {
        m.t += dt; m.led.visible = (m.t % 0.8) < 0.4;
        if (m.t < 1 || r.locked) return;
        if (T.foes().some((e) => Math.hypot(e.x - m.x, e.z - m.z) < 1.5)) {
          m.m.visible = false; if (m.m.parent) m.m.parent.remove(m.m); S.mines.splice(i, 1);
          r.explode(m.x, 0.3, m.z, 3.6, 80); if (!S.slo) { S.slo = true; r.slowmo(0.35, 1.2); } r.hint('TRAP TRIGGERED', 1.6);
        }
      });
    }
  });

  // ===================================================================== 20 SCRAPYARD — компактор как оружие
  // В боевых секторах посреди двора плита-пресс. Рычаг сбоку [E]: 1.2 с сирены — и плита падает, давя всё под собой. Заманите охрану на плиту, сами не стойте.
  TW.add(20, {
    name: 'compactor',
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name);
      S.busy = false;
      if (!sec || sec.b !== 'fight') return;
      const cx = 0, cz = sec.cz, T3 = window.THREE, lx = sec.W / 2 - 3;
      // освободить место под плитой и у рычага
      r.scene.children.slice().forEach((o) => { const c = o.userData && o.userData.col; if (!c || c.off || ((c.y1 - c.y0) > 3.3 && (c.x1 - c.x0) > 8)) return; if ((c.x0 < 3.4 && c.x1 > -3.4 && c.z0 < cz + 3.4 && c.z1 > cz - 3.4) || (c.x0 < lx + 0.6 && c.x1 > lx - 0.6 && c.z0 < cz + 0.6 && c.z1 > cz - 0.6)) T.gone(o); });
      const floor = T.add(new T3.Mesh(r.g.box, r.basic(0x3a3a3a))); floor.scale.set(6, 0.04, 6); floor.position.set(cx, 0.03, cz);
      const slab = T.add(new T3.Mesh(r.g.box, r.basic(0x888888))); slab.scale.set(6, 0.9, 6); slab.position.set(cx, 6.5, cz);
      const lev = T.solid(lx, 0.6, cz, 0.5, 1.2, 0.4, 0x999999);
      let used = false;
      const it = T.interact({ pos: [lx, 1.1, cz], label: 'PULL THE COMPACTOR LEVER', reach: 2.8, enabled: () => !used && !S.busy, use: () => { used = true; it.done(); S.busy = true; this.go(r, T, slab, floor, cx, cz); } });
      if (!S.said) { S.said = true; T.after(4, () => r.hint('COMPACTOR LEVER AT THE WALL — LURE THE GUARDS ONTO THE PLATE', 5)); }
    },
    go(r, T, slab, floor, cx, cz) {
      r.snd && r.snd.play('alarm', { k: 0.6 });
      r.toast('COMPACTOR ARMED — CLEAR THE PLATE', 1.4);
      let t = 0;
      const off = r.addHook((dt) => {
        if (r.locked) return;
        t += dt;
        if (t < 1.2) floor.material = r.basic(Math.sin(t * 30) > 0 ? 0xffffff : 0x3a3a3a);
        else if (t < 1.45) { slab.position.y = 6.5 - (t - 1.2) / 0.25 * 6.0; }
        else if (t < 1.5) {
          slab.position.y = 0.5; floor.material = r.basic(0x3a3a3a); off();
          r.shake(0.1, 0.6); r.snd && r.snd.play('boom', { k: 0.7 }); r.sparks(cx, 0.4, cz, 0, 1, 0, 14);
          const inside = (x, z) => Math.abs(x - cx) < 3.2 && Math.abs(z - cz) < 3.2; let n = 0;
          T.foes().forEach((e) => { if (inside(e.x, e.z)) { r.damageEnemy(e, 99999, false); n += 1; } });
          if (n) T.bonus(5 * n, 'CRUSHED');
          if (inside(r.p.x, r.p.z)) r.hurt(70);
          T.after(2, () => { const h = r.addHook((d2) => { slab.position.y += d2 * 6; if (slab.position.y > 6.5) { slab.position.y = 6.5; h(); } }); });
          T.s.busy = false;
        }
      });
      T.att(off);
    }
  });

  // ===================================================================== 22 LOCKSMITH — отмычка на тайминг
  // Взломы заменены замками: вращающаяся стрелка, нажми [Space] / [E] / кнопку, когда она в светлом секторе. Каждый штифт быстрее и уже.
  TW.add(22, {
    name: 'lockpick',
    setup(r, T) {
      const def = this;
      r.hack = function (o) { return def.pick(r, T, o || {}); };
    },
    pick(r, T, o) {
      if (r.hacking || r.disposed) return Promise.resolve(false);
      return new Promise((resolve) => {
        r.hacking = true; r.syncLock(); r.fireHeld = false; r.padFire = false; r.aimWant = false; r.keys = {};
        if (!r.touch && document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { /* ignore */ } }
        const root = document.createElement('div'); root.className = 'm-hack';
        root.innerHTML = '<div class="hk-box"><div class="hk-head"><b></b><span></span></div><div class="hk-body"><div class="hk-line"></div><div class="tw-lock" style="position:relative;width:150px;height:150px;border-radius:50%;margin:10px auto;border:2px solid #fff"><div class="tw-needle" style="position:absolute;left:50%;top:50%;width:2px;height:70px;margin-left:-1px;background:#fff;transform-origin:50% 0%"></div></div><button type="button" class="hk-btn">PICK</button></div><div class="hk-foot"></div></div>';
        r.layer.appendChild(root);
        const q = (s) => root.querySelector(s), ring = q('.tw-lock'), nd = q('.tw-needle'), line = q('.hk-line'), sub = q('.hk-head span'), foot = q('.hk-foot');
        q('.hk-head b').textContent = o.title || 'LOCK';
        const pins = o.kind === 'match' ? 4 : 3;
        let pin = 0, tries = 3, ang = 0, dir = 1, speed = 150, w = 70, a0 = 120, lock = 0, done = false;
        const snd = (n, k) => r.snd && r.snd.play(n, { k: k || 1 });
        const arc = () => { ring.style.background = 'conic-gradient(from ' + a0 + 'deg, rgba(255,255,255,.9) 0 ' + w + 'deg, #111 ' + w + 'deg 360deg)'; line.textContent = 'PIN ' + (pin + 1) + ' / ' + pins; sub.textContent = 'TRIES ' + '■'.repeat(tries); };
        const end = (ok, quiet) => {
          if (done) return; done = true; clearInterval(iv); document.removeEventListener('keydown', onKey, true); r.hackAbort = null;
          const fin = () => { root.remove(); r.hacking = false; if (!r.disposed) { r.syncLock(); if (!r.touch && !quiet) r.requestLock(); } resolve(ok); };
          if (quiet) { fin(); return; }
          foot.textContent = ok ? 'LOCK OPEN' : 'PICK BROKEN'; snd(ok ? 'keycard' : 'bad'); setTimeout(fin, 700);
        };
        const press = () => {
          if (lock > 0 || done) return;
          const d = (((ang - a0) % 360) + 360) % 360;
          if (d <= w) { pin += 1; snd('lockpick', 0.9); if (pin >= pins) { end(true); return; } w = Math.max(22, w * 0.75); a0 = Math.random() * 360; speed *= 1.18; lock = 0.3; arc(); }
          else { tries -= 1; snd('bad', 0.7); lock = 0.6; foot.textContent = 'SLIPPED'; arc(); if (tries <= 0) end(false); }
        };
        const onKey = (e) => { if (e.code === 'Escape') { e.preventDefault(); end(false, true); } else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { e.preventDefault(); press(); } };
        document.addEventListener('keydown', onKey, true);
        q('.hk-btn').addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
        r.hackAbort = (quiet) => end(false, quiet === true);
        const iv = setInterval(() => { if (done || r.paused) return; lock = Math.max(0, lock - 0.03); ang = (ang + speed * 0.03 * dir + 360) % 360; nd.style.transform = 'rotate(' + (ang - 180) + 'deg)'; }, 30);
        r.intervals.push(iv);
        arc(); foot.textContent = r.touch ? 'TAP PICK' : '[SPACE] PICK';
      });
    }
  });

  // ===================================================================== 24 DEAD DROP — поезд по расписанию
  // Вдоль восточной стены каждого сектора — пути. Раз в ~28 с: сирена 5 с и состав сметает всё на путях (вас тоже). Пинком [V] можно столкнуть охрану под поезд.
  TW.add(24, {
    name: 'train-schedule',
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name), T3 = window.THREE;
      S.train = null; S.sec = null;
      if (!sec || sec.b === 'boss') return;
      S.sec = sec; S.next = 14; S.x0 = sec.W / 2 - 4.5; S.x1 = sec.W / 2 - 0.3; S.xc = (S.x0 + S.x1) / 2;
      const bed = T.add(new T3.Mesh(r.g.box, r.basic(0x1d1d1d))); bed.scale.set(S.x1 - S.x0, 0.04, sec.D - 2); bed.position.set(S.xc, 0.03, sec.cz);
      [-1, 1].forEach((s) => { const rl = T.add(new T3.Mesh(r.g.box, r.basic(0x9a9a9a))); rl.scale.set(0.1, 0.06, sec.D - 2); rl.position.set(S.xc + s * 0.9, 0.06, sec.cz); });
      const edge = T.add(new T3.Mesh(r.g.box, r.basic(0xe0e0e0))); edge.scale.set(0.12, 0.05, sec.D - 2); edge.position.set(S.x0 - 0.1, 0.05, sec.cz);
      const tr = T.add(new T3.Group());
      const body = new T3.Mesh(r.g.box, r.basic(0x2c2c2c)); body.scale.set(3, 3.2, 14); body.position.y = 1.6; tr.add(body);
      for (let i = 0; i < 5; i += 1) { const w = new T3.Mesh(r.g.box, r.basic(0xf0f0f0)); w.scale.set(3.05, 0.7, 1.8); w.position.set(0, 2.0, -5.2 + i * 2.6); tr.add(w); }
      tr.visible = false; S.tr = tr;
      if (!S.said) { S.said = true; T.after(4, () => r.hint('TRAINS RUN ALONG THE EAST WALL — STAY OFF THE TRACKS, KICK [V] GUARDS ONTO THEM', 6)); }
    },
    tick(r, T, dt) {
      const S = T.s;
      if (!S.sec || r.locked) return;
      if (!S.train) {
        S.next -= dt;
        if (S.next > 0 && S.next < 5) { if (!S.warn) { S.warn = true; r.snd && r.snd.play('train'); } if (!S.pn) S.pn = T.panel('tw-mid tw-box', '<h3>TRAIN IN <span></span></h3>'); S.pn.querySelector('span').textContent = Math.ceil(S.next); }
        if (S.next <= 0) { S.warn = false; if (S.pn) { S.pn.remove(); S.pn = null; } S.train = { z: S.sec.zA + 10, hit: {} }; S.tr.visible = true; r.shake(0.03, 4); }
        return;
      }
      const t = S.train; t.z -= 34 * dt; S.tr.position.set(S.xc, 0, t.z);
      const inside = (x, z) => x > S.x0 - 0.2 && x < S.x1 + 0.2 && Math.abs(z - t.z) < 7.4;
      T.foes().forEach((e) => { if (inside(e.x, e.z)) { r.damageEnemy(e, 99999, false); T.bonus(8, 'RUN OVER'); } });
      if (inside(r.p.x, r.p.z) && !t.hp) { t.hp = true; r.hurt(90); r.toast('HIT BY THE TRAIN', 1.6); }
      if (t.z < S.sec.zB - 18) { S.train = null; S.tr.visible = false; S.next = 26; }
    }
  });

  // ===================================================================== 25 PARKING LEVEL 3 — взрывающиеся машины
  // У каждой машины на торце белая крышка бензобака. Выстрел — взрыв и цепная реакция соседних машин, но сирены зовут подкрепление охраны.
  TW.add(25, {
    name: 'fuel-tanks',
    setup(r, T) {
      const S = T.s; S.cars = []; S.sir = 0;
      r.scene.children.slice().forEach((m) => {
        const c = m.userData && m.userData.col; if (!c || c.off) return;
        const w = c.x1 - c.x0, d = c.z1 - c.z0, h = c.y1 - c.y0;
        if (Math.abs(h - 1.7) > 0.05 || !((Math.abs(w - 4.2) < 0.05 && Math.abs(d - 1.9) < 0.05) || (Math.abs(w - 1.9) < 0.05 && Math.abs(d - 4.2) < 0.05))) return;
        const alongX = w > d, cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, tx = alongX ? c.x1 + 0.1 : cx, tz = alongX ? cz : c.z1 + 0.1;
        const car = { m, cx, cz, tx, tz, dead: false };
        r.strip(tx, 0.55, tz, alongX ? 0.14 : 0.5, 0.3, alongX ? 0.5 : 0.14, 0xffffff);
        car.tg = r.shootTarget(tx, 0.55, tz, 0.3, { hp: 4, onDeath: () => this.boom(r, T, car, 0) });
        if (car.tg.m) car.tg.m.visible = false;
        S.cars.push(car);
      });
      T.after(5, () => r.hint('SHOOT THE WHITE FUEL CAPS — CHAIN REACTIONS, BUT SIRENS CALL GUARDS', 6));
    },
    boom(r, T, car, depth) {
      const S = T.s;
      if (car.dead) return; car.dead = true;
      car.m.material = r.mat(0x151515);
      r.explode(car.tx, 0.8, car.tz, 4.6, 80);
      r.snd && r.snd.play('alarm', { k: 0.4 });
      S.cars.forEach((o) => { if (!o.dead && Math.hypot(o.cx - car.cx, o.cz - car.cz) < 6.5) T.after(0.45, () => { if (o.tg && o.tg.alive) o.tg.damage(99); }); });
      S.sir += 1;
      const sec = T.sec();
      if (S.sir <= 4 && sec && sec.b !== 'boss') T.after(1.5, () => { T.wave(sec, ['grunt', 'grunt']); r.toast('SIRENS — SECURITY RESPONDING', 1.8); });
    },
    phase(r, T, name) { T.s.sir = 0; }
  });

  // ===================================================================== 27 HOSTAGE — освободить или взять в плен
  // Раненые похитители иногда сдаются: опустились на колени. Можно взять в плен [E] (мораль, кредиты) или добить (жестоко). Итог — на финальной карточке.
  TW.add(27, {
    name: 'mercy',
    setup(r, T) { T.s.cap = 0; T.s.exe = 0; T.s.freed = 0; },
    enemy(r, T, e) {
      const S = T.s;
      if (T.ph !== 's1' || e.type === 'boss' || Math.random() > 0.5) return;
      e.surr = true;
      e.onHit = () => {
        if (e.sur || e.dead || e.hp <= 0 || e.hp > e.max * 0.4) return;
        e.sur = true; e.stagger = 0; e.tele = 0; e.burst = 0;
        e.ai = (q) => { q.n.cvT = 1; q.n.daze = 1; q.n.armT = 0; q.n.creeping = false; return true; };
        const it = T.interact({ pos: [e.x, 1.1, e.z], label: 'TAKE CAPTIVE', reach: 2.4, enabled: () => !e.dead && !e.friendly, use: () => { it.done(); e.friendly = true; e.n.vest.visible = true; S.cap += 1; T.bonus(15, 'CAPTIVE TAKEN'); r.sfx('notification'); } });
        T.att(() => it.done());
        e.onDeath = () => { if (e.sur && !e.friendly) { S.exe += 1; r.hint('EXECUTION — THE HANDLER TAKES NOTE', 2.2); } };
        if (!S.said) { S.said = true; r.hint('A CAPTOR SURRENDERS — TAKE HIM CAPTIVE [E] OR FINISH HIM', 4); }
      };
    },
    tick(r, T, dt) {
      const S = T.s;
      const sec = T.sec();
      if (sec && sec.hos) S.freed = Math.max(S.freed, sec.hos.filter((h) => h.npc.goal).length);
      if (r.ending && !S.card) {
        const end = r.qs('.m-end');
        if (end.classList.contains('on') && end.querySelector('h2').textContent === 'MISSION COMPLETE') {
          S.card = true;
          const k = S.exe === 0 && (S.cap > 0 || S.freed > 0) ? 'MERCIFUL' : S.exe > S.cap ? 'RUTHLESS' : 'PRAGMATIC';
          end.querySelector('p').insertAdjacentHTML('beforeend', '<br>CONDUCT: ' + k + '<br>PRISONERS: ' + S.cap);
        }
      }
    }
  });

  // ===================================================================== 28 DEMOLITION — обрушить платформу на охрану
  // В боевых секторах над площадкой висит платформа на двух группах опор с красными зарядами. Выстрел в заряд роняет свою половину на всех под ней.
  TW.add(28, {
    name: 'collapse',
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name), T3 = window.THREE;
      if (!sec || sec.b !== 'fight') return;
      const cz = sec.cz, def = this;
      r.scene.children.slice().forEach((o) => { const c = o.userData && o.userData.col; if (!c || c.off || ((c.y1 - c.y0) > 3.3 && (c.x1 - c.x0) > 8)) return; if (c.x0 < 6.8 && c.x1 > -6.8 && c.z0 < cz + 4.6 && c.z1 > cz - 4.6) T.gone(o); });
      [-1, 1].forEach((s) => {
        const slab = T.add(new T3.Mesh(r.g.box, r.basic(0x7a7a7a))); slab.scale.set(6, 0.5, 8); slab.position.set(s * 3.1, 3.5, cz);
        const post = T.solid(s * 5.7, 1.7, cz - 3.2, 0.5, 3.4, 0.5, 0x555555), post2 = T.solid(s * 5.7, 1.7, cz + 3.2, 0.5, 3.4, 0.5, 0x555555);
        const mark = T.add(new T3.Mesh(r.g.box, r.basic(0xd2271f))); mark.scale.set(0.6, 0.3, 0.6); mark.position.set(s * 5.35, 1.3, cz - 3.2);
        const tg = r.shootTarget(s * 5.35, 1.3, cz - 3.2, 0.35, { hp: 2, onDeath: () => def.drop(r, T, slab, [post, post2], mark, s, cz) });
        if (tg.m) tg.m.visible = false;
        T.att(() => { if (tg.remove) tg.remove(); });
      });
      if (!S.said) { S.said = true; T.after(4, () => r.hint('RED CHARGES ON THE SUPPORTS — SHOOT ONE TO DROP THE PLATFORM ON THE GUARDS', 5)); }
    },
    drop(r, T, slab, posts, mark, s, cz) {
      mark.visible = false; r.explode(s * 5.35, 1.3, cz - 3.2, 2.2, 10); posts.forEach((p) => T.gone(p));
      let v = 0;
      const off = r.addHook((dt) => {
        if (r.locked) return;
        v += dt * 14; slab.position.y -= v * dt; slab.rotation.z = s * Math.min(0.2, (3.5 - slab.position.y) * 0.1);
        if (slab.position.y <= 0.5) {
          slab.position.y = 0.5; off(); r.shake(0.12, 0.8); r.snd && r.snd.play('boom', { k: 0.8 }); r.sparks(s * 3, 0.5, cz, 0, 1, 0, 14);
          const inside = (x, z) => Math.abs(x - s * 3.1) < 3.3 && Math.abs(z - cz) < 4.3; let n = 0;
          T.foes().forEach((e) => { if (inside(e.x, e.z)) { r.damageEnemy(e, 99999, false); n += 1; } });
          if (n) T.bonus(6 * n, 'COLLAPSE');
          if (inside(r.p.x, r.p.z)) r.hurt(65);
        }
      });
      T.att(off);
    }
  });

  // ===================================================================== 29 GAS LEAK — газ как оружие
  // В боевых секторах три вентиля: открыл — облако газа на 12 с (враги кашляют и гибнут). Противогаз [E] у входа даёт 30 с защиты и от газа сектора.
  TW.add(29, {
    name: 'gas-valves',
    setup(r, T) {
      const S = T.s;
      S.mask = 0; S.clouds = [];
      const h0 = r.hurt;
      r.hurt = function (a, fx, fz) { if (S.mask > 0 && fx === undefined) a *= 0.1; return h0.call(this, a, fx, fz); };
      S.vig = T.panel('', '', true); S.vig.style.cssText = 'inset:0;z-index:4;display:none;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 35%,rgba(0,0,0,.85) 100%)';
      S.hud = T.panel('tw-corner tw-box tw-rows', '<h3>GAS MASK</h3><p><span>TIME LEFT</span><b class="tw-n">0</b></p>', true); S.hud.style.display = 'none'; S.n = S.hud.querySelector('.tw-n');
    },
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name), T3 = window.THREE;
      S.clouds = [];
      T.att(() => { S.clouds.forEach((c) => { c.m.visible = false; if (c.m.parent) c.m.parent.remove(c.m); }); S.clouds = []; });
      if (!sec || sec.b === 'run') return;
      let taken = false;
      const mit = T.interact({ pos: [0, 1.1, sec.zA - 3.4], label: 'TAKE THE GAS MASK', reach: 2.6, enabled: () => !taken && T.ph === name, use: () => { taken = true; mit.done(); S.mask = 30; r.sfx('notification'); r.hint('MASK ON — 30 S OF PROTECTION', 2.4); } });
      const hw = sec.W / 2 - 1.2;
      [[-1, 0.28], [1, 0.5], [-1, 0.72]].forEach((a) => {
        const vx = a[0] * hw, vz = sec.zA - a[1] * sec.D, gx = a[0] * (hw - 5);
        T.solid(vx, 0.6, vz, 0.5, 1.2, 0.5, 0x777777);
        const wheel = T.add(new T3.Mesh(new T3.TorusGeometry(0.28, 0.06, 6, 12), r.basic(0xd2271f))); wheel.position.set(vx - a[0] * 0.4, 1.3, vz); wheel.rotation.y = Math.PI / 2;
        let used = false;
        const it = T.interact({ pos: [vx, 1.2, vz], label: 'OPEN THE VALVE', reach: 2.6, enabled: () => !used && T.ph === name, use: () => {
          used = true; it.done();
          const m = new T3.Mesh(new T3.SphereGeometry(5, 12, 9), new T3.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.22, depthWrite: false }));
          m.position.set(gx, 1.5, vz); r.scene.add(m); S.clouds.push({ m, x: gx, z: vz, t: 12, acc: 0 });
          r.snd && r.snd.play('smoke'); r.hint('GAS RELEASED — KEEP OUT WITHOUT A MASK', 2.4);
        } });
      });
      if (!S.said) { S.said = true; T.after(4, () => r.hint('VALVES ON THE WALLS RELEASE GAS — MASK AT THE ENTRANCE PROTECTS YOU FOR 30 S', 6)); }
    },
    reset(r, T) { T.s.mask = 0; },
    tick(r, T, dt) {
      const S = T.s;
      if (!S.hud) return;
      if (S.mask > 0 && !r.locked) { S.mask = Math.max(0, S.mask - dt); S.n.textContent = Math.ceil(S.mask); }
      S.hud.style.display = S.vig.style.display = S.mask > 0 ? '' : 'none';
      if (r.locked) return;
      for (let i = S.clouds.length - 1; i >= 0; i -= 1) {
        const c = S.clouds[i]; c.t -= dt; c.acc += dt; c.m.scale.setScalar(0.9 + 0.1 * Math.sin(T.t * 3));
        if (c.t <= 0) { c.m.visible = false; if (c.m.parent) c.m.parent.remove(c.m); S.clouds.splice(i, 1); continue; }
        if (c.acc < 0.5) continue;
        c.acc = 0;
        T.foes().forEach((e) => { if (Math.hypot(e.x - c.x, e.z - c.z) < 5.2) { r.damageEnemy(e, 10, false); e.stagger = Math.max(e.stagger, 0.4); } });
        if (S.mask <= 0 && Math.hypot(r.p.x - c.x, r.p.z - c.z) < 5.2) { r.hurt(6); r.toast('COUGHING — GET OUT OF THE GAS', 0.8); }
      }
    }
  });

  // ===================================================================== 30 DIVERSION — пульт шума
  // В скрытном секторе пульт: сирена в левом или правом крыле (по разу). Охрана бежит к динамику — маршруты рисуются стрелками по полу.
  TW.add(30, {
    name: 'noise-console',
    phase(r, T, name) {
      const S = T.s, sec = T.secOf(name), T3 = window.THREE;
      S.lines = []; S.t = 0; S.spk = null;
      T.att(() => { S.lines.forEach((l) => { l.visible = false; if (l.parent) l.parent.remove(l); }); S.lines = []; S.spk = null; });
      if (!sec || sec.b !== 'stealth') return;
      const hw = sec.W / 2 - 3, cz = sec.cz;
      T.solid(0, 0.55, sec.zA - 4, 1.4, 1.1, 0.7, 0x333333); r.strip(0, 1.2, sec.zA - 4.36, 1.0, 0.3, 0.04, 0xffffff);
      let used = false;
      [['LEFT', -hw], ['RIGHT', hw]].forEach((a) => {
        const it = T.interact({ pos: [a[1] * 0.1, 1.2, sec.zA - 4], label: 'SIREN: ' + a[0] + ' WING', reach: 2.8, enabled: () => !used && T.ph === name, use: () => {
          used = true; it.done(); S.spk = [a[1], cz]; S.t = 13; r.snd && r.snd.play('alarm', { k: 0.5 }); r.toast('SIREN ON — GUARDS ARE MOVING', 2);
          const mk = new T3.Mesh(r.g.box, r.basic(0xffffff)); mk.scale.set(0.8, 0.1, 0.8); mk.position.set(a[1], 0.08, cz); T.add(mk); S.mk = mk;
        } });
      });
      if (!S.said) { S.said = true; T.after(3, () => r.hint('NOISE CONSOLE: PICK A WING — THE GUARDS WILL RUN TO THE SIREN', 5)); }
    },
    tick(r, T, dt) {
      const S = T.s, M = r.mm;
      if (!S.spk || r.locked || !M || !M.S) return;
      S.t -= dt;
      const gs = M.S.guards().filter((q) => !q.dead), T3 = window.THREE;
      gs.forEach((q, i) => {
        if (!M.S.alarm && S.t > 0) { q.inv = [S.spk[0], S.spk[1]]; q.invT = 4; q.hold = 0; }
        let l = S.lines[i];
        if (!l) { l = S.lines[i] = new T3.Mesh(r.g.box, new T3.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false })); r.scene.add(l); }
        const g = q.n.g.position, dx = S.spk[0] - g.x, dz = S.spk[1] - g.z, d = Math.hypot(dx, dz) || 1;
        l.visible = S.t > 0; l.position.set(g.x + dx / 2, 0.06, g.z + dz / 2); l.scale.set(0.12, 0.03, d); l.rotation.y = Math.atan2(dx, dz);
      });
      if (S.mk) S.mk.visible = Math.sin(T.t * 10) > 0 && S.t > 0;
      if (S.t <= 0) S.lines.forEach((l) => { l.visible = false; });
    }
  });
}());
