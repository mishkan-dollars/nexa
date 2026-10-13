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
  const freeRect = (r, x0, x1, z0, z1, m) => !r.colliders.some((c) => !c.off && (c.y0 === undefined || c.y0 < 1.5) && x0 - m < c.x1 && x1 + m > c.x0 && z0 - m < c.z1 && z1 + m > c.z0);

  // ===================================================================== 19 CLEANERS — личное досье в архиве
  // Взломал терминал архива — на экране ваше досье: задания, убийства, смерти, любимое оружие (статистика копится локально, см. Twists.stats).
  TW.add(19, {
    name: 'dossier',
    setup(r, T) {
      const S = T.s, def = this;
      S.shown = false;
      const h0 = r.hack;
      r.hack = function (o) {
        return Promise.resolve(h0.call(this, o)).then((ok) => { if (ok && !S.shown && !r.disposed && T.ph === 's1') { S.shown = true; try { def.show(r, T); } catch (e) { console.warn('[twist 19 dossier]', e); } } return ok; });
      };
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
      const notes = st.deaths > 0 ? [{ html: '<em>NOTE: THE SUBJECT DIED ' + st.deaths + ' TIMES AND CAME BACK EVERY TIME.</em>', cls: '' }] : [{ html: '<em>NOTE: NO DEATHS ON FILE. NEXA FINDS THIS SUSPICIOUS.</em>' }];
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
        const door = r.door(x1 - 0.06, cz, LEN - 1.0, H - 0.1, true);
        door.material = r.mat(hot ? 0x3b3b3b : 0x4a4a4a);
        T.label(String(num), x1 + 0.03, H - 0.45, cz, { w: 1.4, size: 96, yaw: PI / 2, bg: 'rgba(0,0,0,.35)', keep: true });
        T.label('CONTAINER ' + num, x1 + 0.03, 0.55, cz, { w: 2.2, size: 44, yaw: PI / 2, bg: false, keep: true, color: '#d8d8d8' });
        const c = { num, door, cz, x0, x1, hot, opened: false };
        if (hot) {
          // приоткрыта: щель внизу и свет из неё
          door.position.y += 0.3; door.userData.h = H - 0.1;
          r.strip(x1 + 0.02, 0.12, cz, 0.05, 0.24, LEN - 1.1, 0xffffff);
          r.strip((x0 + x1) / 2, H - 0.16, cz, 1.6, 0.05, 1.6, 0xffffff);
          // мишка на ящике у задней стены
          const bear = this.bear(r), bx = x0 + 0.9;
          bear.position.set(bx, 0.62, cz); bear.rotation.y = PI / 2;
          r.scene.add(bear); r.crate(bx, cz, 0.7, 0.7, 0.42, 0x3a3a3a);
          S.bear = bear; S.bpos = [bx, cz];
          c.it1 = r.interact({ pos: [x1 + 0.2, 1.1, cz], label: 'OPEN CONTAINER 14', reach: 2.8, enabled: () => !c.opened, use: () => { c.opened = true; r.openDoor(door, 1.0); r.sfx('notification'); } });
          c.it2 = r.interact({ pos: [bx + 0.4, 1.0, cz], label: 'TAKE THE PLUSH BEAR', reach: 2.4, enabled: () => c.opened && !S.taken, use: () => this.take(r, T) });
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
        const it = r.interact({
          pos: [g.x, 1.1, g.z + 2.4], label: 'SET THE CHARGES', reach: 2.6, enabled: () => T.ph === 's' + sec.k && !used && !(sec.brk && sec.brk.broken),
          use: () => {
            used = true; S.wrong += 1;
            r.snd && r.snd.play('alarm'); r.flash(0.3); r.shake(0.05, 0.6);
            r.hint('WRONG TRUCK — EMPTY CARGO BAY. THE ALARM IS ON', 3.4);
            const list = r.around(['grunt', 'grunt', 'rusher'], 9, 16);
            r.spawnWave(list, { gap: 0.4 });
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
}());
