// NEXA: ПЕСОЧНИЦА — зал для тренировки прицела: режимы мишеней, спавн врагов, счётчики точности.
// Запускается из меню (кнопка SANDBOX): Missions.start('sandbox', ...). Выход — пауза → EXIT SANDBOX.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.WEAPONS || !C.Run) return;
  const { MISSIONS, WEAPONS } = C;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const MODES = ['FREE FIRE', 'STATIC GRID', 'STRAFING TARGETS', 'FLICK TRAINER'];
  const PERS_LIST = ['', 'panic', 'sadist', 'pro', 'lazy', 'zealot', 'stunned', 'sniper', 'officer', 'jugg', 'tech']; // '' = автоподбор личности (personas.js)
  const WANT = [0, 6, 5, 1];          // сколько мишеней одновременно в режиме
  const FLICK_LIFE = 2.4;             // секунд жизни мишени во flick-режиме
  const BOX = { x0: -11, x1: 11, zNear: -4, zFar: -44 };
  const KEYS = 'T MODE  |  J K L P SPAWN  |  G NADE  |  H SWITCH  |  N CLEAR  |  Y RESET  |  I AMMO  |  O GOD  |  ESC MENU';
  const GADS = { frag: 8, flash: 8, c4: 4 };   // запас гранат и C4 (G — бросок, H — смена); INFINITE AMMO держит запас полным

  MISSIONS.sandbox = {
    title: 'SANDBOX',
    build(r) {
      const W = 0xa0a0a0;
      r.room(0, -14, 26, 70, 3.8, W); r.bound(0, -14, 26, 70, 3.8);
      r.mood(0.95, 0.4); r.combat();
      [14, 0, -14, -28, -42].forEach((z) => { r.lamp(-5, 3.7, z, 0.9); r.lamp(5, 3.7, z, 0.9); });
      r.box(0, 0.5, 14, 24, 1.0, 0.6, 0x555555, false);                       // барьер у стрелковой линии (визуальный)
      r.pillar(-7, 0); r.pillar(7, 0); r.pillar(-7, -20); r.pillar(7, -20);    // укрытия
      r.crate(-3, 8, 1.4, 0.8, 1.0); r.crate(3.5, 8, 1.4, 0.8, 1.0);
      // метки дистанции от стрелковой линии: полоса на полу + табличка на левой стене
      for (let k = 1; k <= 6; k += 1) {
        const z = 14 - k * 10;
        r.markFloor(0, z, 24, 0.06, 0x808080); r.markFloor(-12.8, z, 0.3, 0.3);
        const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
        const g = cv.getContext('2d'); g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, 128, 64);
        g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(2, 2, 124, 60);
        g.fillStyle = '#fff'; g.font = 'bold 34px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(k * 10 + ' M', 64, 34);
        const tex = new THREE.CanvasTexture(cv);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
        m.position.set(-12.84, 2.2, z); m.rotation.y = Math.PI / 2; r.scene.add(m);
        const m2 = m.clone(); m2.position.x = 12.84; m2.rotation.y = -Math.PI / 2; r.scene.add(m2);
      }
      r.strip(0, 3, -48.8, 10, 0.4, 0.05);
      r.markFloor(0, 13, 8, 0.1);
      r.spawn(0, 17, 0);
    },

    async play(r) {
      const cb = r.cb;
      const S = { shots: 0, hits: 0, heads: 0, kills: 0, streak: 0, best: 0, react: [], bestReact: 0, expired: 0 };
      const sb = { mode: 0, inf: true, hostile: true, pers: 0, pending: [], shotHit: false, shotHead: false, shown: {} };
      r.god = false;

      // ---- оружие: всё, что есть в игре
      ['glock', 'ak', 'shotgun', 'sniper'].forEach((id) => { if (WEAPONS[id]) r.giveWeapon(id, { equip: id === 'glock' }); });

      // ---- гранаты: осколочные, светошумовые и C4 (без всплывающих подсказок на каждую)
      const giveGads = (quiet) => {
        const g = r.gad;
        const need = Object.keys(GADS).filter((k) => !g || g.n[k] < GADS[k]);
        if (!need.length) return false;
        r.toast = () => {};
        try { need.forEach((k) => r.addGadget(k, GADS[k] - (g ? g.n[k] : 0))); } finally { delete r.toast; }
        if (!quiet) { r.toast('GRENADES REFILLED', 1.4); r.sfx('notification'); }
        return true;
      };
      giveGads(true);

      // ---- статистика: выстрелы и попадания (дробовик — один выстрел, засчитывается если хоть одна дробина попала)
      const shoot0 = r.shoot, hit0 = r.hitmark;
      r.hitmark = function (head) { sb.shotHit = true; if (head) sb.shotHead = true; return hit0.call(this, head); };
      r.shoot = function (w) {
        sb.shotHit = false; sb.shotHead = false;
        const res = shoot0.call(this, w);
        S.shots += 1;
        if (sb.shotHit) { S.hits += 1; S.streak += 1; if (S.streak > S.best) S.best = S.streak; if (sb.shotHead) S.heads += 1; } else S.streak = 0;
        return res;
      };

      // ---- враги и мишени
      const drop = (e) => { // убрать врага из боя сразу (без трупа)
        e.dead = true; e.alive = false; e.n.free = true; e.n.g.visible = false;
        const i = cb.enemies.indexOf(e); if (i >= 0) cb.enemies.splice(i, 1);
        const j = cb.shoot.indexOf(e); if (j >= 0) cb.shoot.splice(j, 1);
      };
      const targets = () => cb.enemies.filter((e) => e.tag === 'sbT' && !e.dead);
      const foes = () => cb.enemies.filter((e) => e.tag === 'sbE' && !e.dead);
      const clearTargets = () => { cb.enemies.filter((e) => e.tag === 'sbT').forEach(drop); sb.pending.length = 0; };
      const clearFoes = () => { cb.enemies.filter((e) => e.tag === 'sbE').forEach(drop); };

      const pickSpot = () => {
        for (let i = 0; i < 12; i += 1) {
          const x = rnd(-9, 9), z = rnd(BOX.zNear, BOX.zFar);
          if (targets().every((q) => Math.hypot(q.x - x, q.z - z) > 3)) return [x, z];
        }
        return [rnd(-9, 9), rnd(BOX.zNear, BOX.zFar)];
      };
      const mkTarget = () => {
        const [x, z] = pickSpot();
        const e = r.enemy('target', x, z, { drop: false, tag: 'sbT', yaw: 0 });
        e.born = r.time;
        if (sb.mode === 2) {
          e.vx = (Math.random() < 0.5 ? -1 : 1) * rnd(1.5, 3.5); e.flip = rnd(0.8, 2.6);
          e.ai = (q, dt) => {
            const g = q.n.g; q.flip -= dt;
            if (q.flip <= 0) { q.vx = -q.vx * rnd(0.8, 1.2); q.flip = rnd(0.8, 2.6); }
            if (Math.abs(g.position.x + q.vx * dt) > 10.5) q.vx = -q.vx;
            g.position.x += q.vx * dt; q.n.yaw = q.vx > 0 ? Math.PI / 2 : -Math.PI / 2; q.n.creeping = true;
            return true;
          };
        }
        return e;
      };

      const spawnFoe = (type) => {
        if (foes().length >= r.q.maxEnemies + 3) { r.toast('ENEMY LIMIT REACHED', 1.4); r.sfx('denied'); return; }
        const p = r.p, ang = p.yaw + rnd(-0.7, 0.7), d = rnd(14, 24);
        let x = clamp(p.x - Math.sin(ang) * d, BOX.x0, BOX.x1), z = clamp(p.z - Math.cos(ang) * d, -46, 11);
        if (Math.hypot(x - p.x, z - p.z) < 9) { x = rnd(-8, 8); z = rnd(-30, -12); }
        const pid = PERS_LIST[sb.pers], e = r.enemy(pid === 'jugg' && type === 'grunt' ? 'heavy' : type, x, z, { drop: false, tag: 'sbE', yaw: Math.atan2(p.x - x, p.z - z), pers: pid || undefined });
        e.ai = () => !sb.hostile; // враги-«манекены»: стоят на месте, пока HOSTILE выключен
        r.sfx('notification');
      };

      cb.killHooks.push((e, head) => {
        S.kills += 1;
        if (e.tag === 'sbT' && sb.mode === 3) {
          const ms = Math.round((r.time - e.born) * 1000);
          S.react.push(ms); if (S.react.length > 10) S.react.shift();
          if (!S.bestReact || ms < S.bestReact) S.bestReact = ms;
        }
      });

      const setMode = (m) => {
        sb.mode = (m + MODES.length) % MODES.length;
        clearTargets();
        r.toast(MODES[sb.mode], 1.6); r.sfx('notification');
        sync();
      };
      const resetStats = () => { Object.assign(S, { shots: 0, hits: 0, heads: 0, kills: 0, streak: 0, best: 0, react: [], bestReact: 0, expired: 0 }); r.sfx('notification'); };

      // ---- панель статистики (HUD)
      const panel = document.createElement('div');
      panel.className = 'm-sbox';
      panel.innerHTML = '<div class="sb-h">SANDBOX</div>' +
        '<div class="sb-r"><span>MODE</span><b class="sb-mode"></b></div>' +
        '<div class="sb-r"><span>HITS</span><b class="sb-hits" translate="no"></b></div>' +
        '<div class="sb-r"><span>ACCURACY</span><b class="sb-acc" translate="no"></b></div>' +
        '<div class="sb-r"><span>HEADSHOTS</span><b class="sb-heads" translate="no"></b></div>' +
        '<div class="sb-r"><span>KILLS</span><b class="sb-kills" translate="no"></b></div>' +
        '<div class="sb-r"><span>STREAK</span><b class="sb-streak" translate="no"></b></div>' +
        '<div class="sb-r sb-fl"><span>REACTION</span><b class="sb-react" translate="no"></b></div>' +
        '<div class="sb-r sb-fl"><span>TARGETS LOST</span><b class="sb-miss" translate="no"></b></div>' +
        (r.touch ? '' : '<div class="sb-keys">' + KEYS + '</div>');
      r.layer.classList.add('sb-clean');   // чистый экран: без плашки цели и панели статистики — статистика и подсказки по клавишам в меню паузы
      const els = {}; ['mode', 'hits', 'acc', 'heads', 'kills', 'streak', 'react', 'miss'].forEach((k) => { els[k] = panel.querySelector('.sb-' + k); });
      const put = (k, v) => { if (sb.shown[k] !== v) { sb.shown[k] = v; els[k].textContent = v; } };
      function sync() {
        const avg = S.react.length ? Math.round(S.react.reduce((a, b) => a + b, 0) / S.react.length) : 0;
        put('mode', MODES[sb.mode]);
        put('hits', S.hits + ' / ' + S.shots);
        put('acc', S.shots ? Math.round(S.hits / S.shots * 100) + '%' : '—');
        put('heads', String(S.heads));
        put('kills', String(S.kills));
        put('streak', S.streak + ' (' + S.best + ')');
        put('react', avg ? avg + ' ms (' + S.bestReact + ')' : '—');
        put('miss', String(S.expired));
        panel.classList.toggle('flick', sb.mode === 3);
        mb.mode.textContent = MODES[sb.mode]; mb.inf.textContent = sb.inf ? 'ON' : 'OFF'; mb.god.textContent = r.god ? 'ON' : 'OFF'; mb.hostile.textContent = sb.hostile ? 'ON' : 'OFF';
        const PS = window.Missions._core.personas, pid = PERS_LIST[sb.pers];
        mb.pers.textContent = !pid ? 'AUTO' : (PS && PS.PERS[pid] ? PS.PERS[pid].name : pid.toUpperCase());
      }

      // ---- кнопки в меню паузы (для тач-экрана и мыши)
      const menu = document.createElement('div'); menu.className = 'sb-menu';
      const mb = {};
      const btn = (label, fn, key) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'action centered secondary';
        b.innerHTML = '<span>' + label + '</span>' + (key ? ' <b class="sb-st"></b>' : '');
        if (key) mb[key] = b.querySelector('.sb-st');
        b.addEventListener('click', () => { fn(); sync(); });
        menu.appendChild(b); return b;
      };
      btn('MODE', () => setMode(sb.mode + 1), 'mode').classList.add('wide');
      btn('SPAWN GRUNT', () => spawnFoe('grunt')); btn('SPAWN RUSHER', () => spawnFoe('rusher'));
      btn('SPAWN HEAVY', () => spawnFoe('heavy')); btn('SPAWN BOSS', () => spawnFoe('boss'));
      btn('CLEAR ENEMIES', () => { clearFoes(); r.sfx('notification'); }); btn('RESET STATS', resetStats);
      btn('REFILL GRENADES', () => { giveGads(false); });
      btn('INFINITE AMMO', () => { sb.inf = !sb.inf; }, 'inf'); btn('GOD MODE', () => { r.god = !r.god; }, 'god');
      btn('ENEMIES HOSTILE', () => { sb.hostile = !sb.hostile; }, 'hostile').classList.add('wide');
      btn('ENEMY PERSONALITY', () => { sb.pers = (sb.pers + 1) % PERS_LIST.length; const PS = window.Missions._core.personas, pid = PERS_LIST[sb.pers]; r.toast(!pid ? 'AUTO' : PS && PS.PERS[pid] ? PS.PERS[pid].name : pid.toUpperCase(), 1.2); }, 'pers').classList.add('wide');
      // штурм комнаты (interiors.js / breach.js): 1-е нажатие строит комнату справа, 2-е — слева, дальше заново расставляет жильцов; подойди к двери и жми [E]
      const BR = [['pc', 1], ['tea', -1]];
      btn('BREACH ROOM', () => {
        const I = window.Interiors; if (!I || I.OFF) { r.toast('ROOMS OFF (?rooms=0)', 1.6); return; }
        sb.brn = (sb.brn || 0) + 1; sb.brs = sb.brs || [];
        let room = sb.brs.length < BR.length ? null : sb.brs[sb.brn % sb.brs.length];
        if (!room) { const c = BR[sb.brs.length]; room = I.test(r, { side: c[1], scene: c[0], seed: sb.brn }); sb.brs.push(room); }
        else { I.reset(r, room); I.spawnOcc(r, room, room.specs); }
        r.toast('BREACH ROOM — [E]', 1.6);
      }).classList.add('wide');

      const box = r.qs('.m-pause > div'), abort = r.qs('.m-abort');
      box.insertBefore(panel, abort); box.insertBefore(menu, abort);
      box.querySelector('.eyebrow').textContent = 'SANDBOX PAUSED';
      abort.textContent = '[EXIT SANDBOX]';

      // ---- клавиши
      r.on(document, 'keydown', (e) => {
        if (e.repeat || r.paused || r.locked || r.dead || r.choice || e.ctrlKey || e.metaKey || e.altKey) return;
        const c = e.code;
        if (c === 'KeyT') setMode(sb.mode + 1);
        else if (c === 'KeyJ') spawnFoe('grunt'); else if (c === 'KeyK') spawnFoe('rusher');
        else if (c === 'KeyL') spawnFoe('heavy'); else if (c === 'KeyP') spawnFoe('boss');
        else if (c === 'KeyN') { clearFoes(); r.sfx('notification'); }
        else if (c === 'KeyY') resetStats();
        else if (c === 'KeyI') { sb.inf = !sb.inf; r.toast('INFINITE AMMO ' + (sb.inf ? 'ON' : 'OFF'), 1.4); }
        else if (c === 'KeyO') { r.god = !r.god; r.toast('GOD MODE ' + (r.god ? 'ON' : 'OFF'), 1.4); }
        sync();
      });

      // ---- тренер: пополнение мишеней, таймер flick, бесконечные патроны
      r.addHook((dt) => {
        if (r.locked || r.dead) return;
        const want = WANT[sb.mode];
        if (want) {
          const live = targets();
          if (sb.mode === 3) {
            live.forEach((q) => { if (r.time - q.born > FLICK_LIFE) { drop(q); S.expired += 1; S.streak = 0; r.sfx('denied'); sb.pending.push(r.time + 0.4); } });
          }
          while (targets().length + sb.pending.length < want) sb.pending.push(r.time + (live.length ? 0.5 : 0.25));
          for (let i = sb.pending.length - 1; i >= 0; i -= 1) {
            if (r.time >= sb.pending[i]) { sb.pending.splice(i, 1); if (targets().length < want) mkTarget(); }
          }
        }
        if (sb.inf && r.inv) {
          let fill = false;
          r.inv.forEach((w) => { if (w.reserve < w.def.reserve) { w.reserve = w.def.maxReserve; fill = true; } });
          if (fill) r.refreshHud();
          if (r.gad && !r.paused) giveGads(true);
        }
        sync();
      });

      await r.fade(0, 0.8);
      r.objective('TRAIN YOUR AIM — ESC: MENU, SPAWN ENEMIES');
      sync();
      // чекпоинт: смерть → экран реконнекта, патроны и позиция восстанавливаются, статистика остаётся
      await r.phase('sandbox', () => new Promise(() => {}));
    }
  };
})();
