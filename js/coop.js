// NEXA/OS: кооператив на двоих (поверх js/net.js). Оба клиента запускают одно и то же задание / песочницу (id и seed от Хоста). Напарник — настоящий стикмен игры
// (Run.prototype.npc из actors.js) с ником над головой: позиция, поворот, присед, оружие, выстрелы (трассеры, вспышка, звуки игры), эмоции (танцы EmoteCore),
// смерть, взрывы, жизни, реплики чата. Хост = Игрок 1, друг = Игрок 2; позиции — ~15 Гц по каналу 'act', события — по 'rel'.
// ВРАГИ: в «CO-OP SANDBOX» (MISSIONS.coopbox) Хост — авторитет: волны врагов, ИИ, снапшоты ~10 Гц; у друга враги — «куклы» (puppet), попадания друг шлёт Хосту,
// Хост выбирает цель (ближайший игрок) и присылает урон. В сюжетных заданиях враги считаются на каждом устройстве отдельно (общий seed лишь выравнивает декор):
// синхронны напарник, выстрелы, эмоции, чат и голос, но не сами враги и не ход сюжета.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  const NN = window.NexaNet;
  if (!C || !C.Run || !NN) return;
  const Run = C.Run, P = Run.prototype, MISSIONS = C.MISSIONS, PF = window.NexaProfile;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const q = (v, k) => Math.round(v * k) / k;
  const wrap = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  const GUN = { glock: 'pistol', ak: 'rifle', shotgun: 'shotgun', sniper: 'rifle', lmg: 'lmg' };
  const SND = { glock: 'epistol', ak: 'erifle', shotgun: 'shotgun', sniper: 'sniper', lmg: 'elmg' };
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d || 0);
  let cur = null;                       // активная сессия
  let pendingSpec = null;

  // ------------------------------------------------------------------ детерминированный генератор (mulberry32): общий декор у обоих игроков
  function seeded(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ------------------------------------------------------------------ CO-OP SANDBOX: зал песочницы, волны врагов для двоих
  const BOX = { x0: -11, x1: 11, zNear: -4, zFar: -44 };
  const WAVE_TYPES = (w) => { const L = ['grunt', 'grunt', 'grunt']; if (w >= 2) L.push('rusher', 'rusher'); if (w >= 3) L.push('heavy'); if (w >= 5) L.push('heavy', 'rusher'); return L; };
  MISSIONS.coopbox = {
    title: 'CO-OP SANDBOX',
    build(r) {
      MISSIONS.sandbox.build(r);
      const co = r.__co, off = co && co.slot === 2 ? 1.4 : -1.4;
      r.spawn(co ? off : 0, 17, 0);
    },
    async play(r) {
      const co = r.__co, cb = r.cb, W = C.WEAPONS;
      r.god = false;
      ['glock', 'ak', 'shotgun', 'sniper'].forEach((id) => { if (W[id]) r.giveWeapon(id, { equip: id === 'glock' }); });
      const GADS = { frag: 8, flash: 8, c4: 4 };
      const giveGads = () => { const g = r.gad; const need = Object.keys(GADS).filter((k) => !g || g.n[k] < GADS[k]); if (!need.length) return; r.toast = () => {}; try { need.forEach((k) => r.addGadget(k, GADS[k] - (g ? g.n[k] : 0))); } finally { delete r.toast; } };
      try { giveGads(); } catch (e) { /* гаджеты не критичны */ }
      r.layer.classList.add('sb-clean');
      if (co) co.onReady();
      // враги и волны ведёт Хост (в соло — тоже мы)
      const auth = !co || co.host;
      const S = { wave: 0, queue: [], cd: 3, kills: 0, running: false, hostile: true, t: 0 };
      if (co) co.wave = S;
      const foes = () => cb.enemies.filter((e) => e.tag === 'sbE' && !e.dead);
      const spawn = (type) => {
        const g = r.p, x = clamp((Math.random() * 2 - 1) * 9, BOX.x0 + 1, BOX.x1 - 1), z = -14 - Math.random() * 28;
        const e = r.enemy(type, x, z, { drop: false, tag: 'sbE', yaw: Math.atan2(g.x - x, g.z - z) });
        e.ai = () => !S.hostile;
        if (co) co.registerEnemy(e);
        return e;
      };
      const cap = () => clamp((r.q.maxEnemies || 8) + 1, 5, 10);
      if (auth) {
        cb.killHooks.push((e, head) => { if (e.tag === 'sbE') { S.kills += 1; if (co) co.sendKill(e, head); } });
        r.addHook((dt) => {
          if (r.locked || r.dead || r.paused) { /* на паузе/в смерти волны не спавнят */ }
          if (r.paused || r.disposed) return;
          if (co && !co.peerReady && !co.solo && S.t < 25) { S.t += dt; return; }   // ждём, пока друг загрузится
          S.t += dt;
          const alive = foes().length;
          if (!S.running) {
            S.cd -= dt;
            if (S.cd <= 0) {
              S.wave += 1; S.running = true;
              const n = 3 + S.wave * 2, types = WAVE_TYPES(S.wave);
              S.queue = []; for (let i = 0; i < n; i += 1) S.queue.push(types[Math.floor(Math.random() * types.length)]);
              if (S.wave % 6 === 0) S.queue.push('boss');
              S.sp = 0; if (co) co.sendWave(S);
              r.toast('WAVE ' + S.wave, 1.8); r.sfx('notification');
            }
          } else {
            S.sp -= dt;
            if (S.queue.length && alive < cap() && S.sp <= 0) { spawn(S.queue.shift()); S.sp = 0.6; }
            if (!S.queue.length && alive === 0) { S.running = false; S.cd = 5; if (co) co.sendWave(S); r.toast('WAVE CLEARED', 1.8); r.sfx('succesfully'); }
          }
          if (co && ((S.t * 2 | 0) !== S.lt)) { S.lt = S.t * 2 | 0; co.waveText(S, alive + S.queue.length); }
          else if (!co && ((S.t * 2 | 0) !== S.lt)) { S.lt = S.t * 2 | 0; r.objective('WAVE ' + S.wave + ' — ' + (alive + S.queue.length) + ' ENEMIES'); }
          r.inv && r.inv.forEach((w) => { if (w.reserve < w.def.reserve) { w.reserve = w.def.maxReserve; r.refreshHud(); } });
        });
        // Хост: клавиши J K L P — добавить врага, N — убрать (как в песочнице)
        r.on(document, 'keydown', (e) => {
          if (e.repeat || r.paused || r.locked || r.dead || co && co.chatOpen) return;
          const c = e.code, t = c === 'KeyJ' ? 'grunt' : c === 'KeyK' ? 'rusher' : c === 'KeyL' ? 'heavy' : c === 'KeyP' ? 'boss' : null;
          if (t && foes().length < cap() + 4) spawn(t);
          else if (c === 'KeyN') foes().forEach((x) => { x.dead = true; x.alive = false; x.n.free = true; x.n.g.visible = false; const i = cb.enemies.indexOf(x); if (i >= 0) cb.enemies.splice(i, 1); const j = cb.shoot.indexOf(x); if (j >= 0) cb.shoot.splice(j, 1); if (co) co.sendGone(x); });
        });
      } else {
        r.addHook((dt) => { r.inv && r.inv.forEach((w) => { if (w.reserve < w.def.reserve) { w.reserve = w.def.maxReserve; r.refreshHud(); } }); });
      }
      const box = r.qs('.m-pause > div'), abort = r.qs('.m-abort');
      if (box) { const h = box.querySelector('.eyebrow'); if (h) h.textContent = 'CO-OP SANDBOX PAUSED'; }
      if (abort) abort.textContent = '[LEAVE CO-OP SANDBOX]';
      await r.fade(0, 0.8);
      r.objective('CO-OP SANDBOX — SURVIVE THE WAVES');
      await r.phase('coopbox', () => new Promise(() => {}));
    }
  };

  // ------------------------------------------------------------------ сессия
  class Session {
    constructor(run, spec) {
      this.run = run; this.spec = spec; this.mode = spec.mode === 'mission' ? 'mission' : 'sandbox';
      this.host = spec.role !== 'guest'; this.slot = spec.role === 'guest' ? 2 : 1; this.solo = !!spec.solo;
      if (!this.solo) run.noPause = true;   // в онлайне паузы нет (мир идёт у друга): Esc/кнопка/потеря фокуса не ставят игру на паузу
      this.shared = this.mode === 'sandbox';
      this.rem = { x: 0, z: 0, yaw: 0, hp: 100, dead: false, w: '', crouch: false, aim: 0, got: false, p: { x: 0, z: 0, yaw: 0, pitch: 0, phase: 0, moving: 0 }, lastT: 0 };
      this.av = null; this.ready = false; this.peerReady = false; this.offs = []; this.sendT = 0; this.snapT = 0; this.hudT = 0; this.lastSend = 0;
      this.byId = new Map(); this.nid = 0; this.dmgBy = 1; this.chatOpen = false; this.emo = null; this.lastEm = null; this.shotAt = -9; this.cap = null;
      this.hitRate = { t: 0, n: 0 }; this.rng0 = null; this.wave = null; this.pq = []; this.gone = false; this.lastSnapRx = 0; this.lastPos = { x: 1e9, z: 1e9, a: 1e9, c: 0, w: '', h: -1, d: 0, q: 0 };
      this.seedOn();
      this.hook();
      if (!this.solo && PF) { PF.count('matches'); if (this.host) PF.count('hostMatches'); }
    }
    seedOn() {
      if (!this.spec.seed) return;
      this.rng0 = Math.random; this.rng = seeded(this.spec.seed); Math.random = this.rng;
    }
    seedOff() { if (this.rng0) { if (Math.random === this.rng) Math.random = this.rng0; this.rng0 = null; } }
    on(type, fn) { this.offs.push(NN.on(type, fn.bind(this))); }
    hook() {
      const r = this.run;
      this.on('pos', this.onPos); this.on('shot', this.onShot); this.on('cev', this.onCev); this.on('boom', this.onBoom);
      this.on('net:close', () => this.partnerGone(NN.text('PEER_LEFT'))); this.on('net:chat', this.onChat);
      this.on('net:state', (s) => { if (s.state === 'lost') this.note('CONNECTION UNSTABLE…'); });
      this.on('hit', this.onHit); this.on('espawn', this.onSpawn); this.on('ekill', this.onKill); this.on('egone', this.onGone); this.on('snap', this.onSnap);
      this.on('eshot', this.onEShot); this.on('hurt', this.onHurt); this.on('wave', this.onWave);
      r.hooks.push((dt) => { try { this.tick(dt); } catch (e) { if (!this.errLogged) { this.errLogged = true; console.warn('[coop]', e); } } });
      this.buildUi();
    }

    // -------------------------------------------------------------- интерфейс поверх миссии
    buildUi() {
      const r = this.run, L = r.layer;
      const hud = this.hud = document.createElement('div'); hud.className = 'nx-hud'; hud.setAttribute('data-i18n', 'net');
      hud.innerHTML = '<div class="nx-who" hidden><span class="nx-av"></span><b translate="no"></b><span class="hp"><i></i></span><span class="talk"></span><span class="st" translate="no"></span></div>';
      L.appendChild(hud);
      const chat = this.chat = document.createElement('div'); chat.className = 'nx-chat'; chat.setAttribute('data-i18n', 'net');
      chat.innerHTML = '<div class="nx-log" role="log"></div><form class="nx-in" autocomplete="off"><input type="text" maxlength="200" placeholder="Type a message…" aria-label="Chat message" enterkeyhint="send"><button type="submit">SEND</button></form>';
      L.appendChild(chat);
      const btns = this.btns = document.createElement('div'); btns.className = 'nx-btns'; btns.setAttribute('data-i18n', 'net');
      btns.innerHTML = '<button type="button" class="nx-btn" data-k="chat">CHAT</button><button type="button" class="nx-btn" data-k="mic">MIC</button>';
      L.appendChild(btns);
      const tag = this.tag = document.createElement('div'); tag.className = 'nx-tag'; tag.hidden = true; tag.innerHTML = '<span translate="no"></span><small></small>'; L.appendChild(tag);
      this.input = chat.querySelector('input'); this.log = chat.querySelector('.nx-log');
      this.who = hud.querySelector('.nx-who');
      chat.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); this.sendChat(); });
      ['pointerdown', 'mousedown', 'touchstart'].forEach((n) => chat.addEventListener(n, (e) => e.stopPropagation(), { passive: true }));
      ['pointerdown', 'mousedown', 'touchstart'].forEach((n) => btns.addEventListener(n, (e) => e.stopPropagation(), { passive: true }));
      btns.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.k === 'chat') this.toggleChat(); else this.toggleMic(); });
      r.on(window, 'keydown', (e) => this.onKey(e), true);
      r.on(window, 'keyup', (e) => { if (this.chatOpen && e.target === this.input) e.stopImmediatePropagation(); }, true);
      r.on(window, 'keypress', (e) => { if (this.chatOpen && e.target === this.input) e.stopImmediatePropagation(); }, true);
      NN.chat.history.slice(-4).forEach((m) => this.addLine(m, true));
      this.updBtns();
    }
    note(text, sec) {
      const r = this.run; if (!r.layer) return;
      const n = document.createElement('div'); n.className = 'nx-note'; n.setAttribute('data-i18n', 'net'); n.textContent = text; r.layer.appendChild(n);
      setTimeout(() => { n.style.opacity = '0'; setTimeout(() => n.remove(), 600); }, (sec || 2.6) * 1000);
    }
    onKey(e) {
      const r = this.run;
      if (this.chatOpen) {
        if (e.target !== this.input) return;
        e.stopImmediatePropagation();
        if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); if (this.input.value.trim()) this.sendChat(); else this.closeChat(); } else if (e.code === 'Escape') { e.preventDefault(); this.closeChat(); }
        return;
      }
      if (e.repeat || this.solo || !NN.connected) return;
      if (e.code === 'Enter' && this.canChat()) { e.preventDefault(); e.stopImmediatePropagation(); this.openChat(); }
      else if (e.code === 'KeyM' && r.entered && !r.paused && !r.locked) { this.toggleMic(); }
    }
    canChat() { const r = this.run; return !!(r.entered && !r.paused && !r.ending && !r.disposed && !r.choice && !r.hacking && !r.dead && r.cineDepth <= 0); }
    toggleChat() { if (this.chatOpen) this.closeChat(); else if (this.canChat()) this.openChat(); }
    openChat() {
      const r = this.run; if (this.chatOpen || !this.canChat()) return;
      this.chatOpen = true; r.hacking = true; r.syncLock && r.syncLock();   // как у взлома: движение стоит, пауза от потери pointer lock не включается
      this.chat.classList.add('open');
      try { document.exitPointerLock && document.pointerLockElement && document.exitPointerLock(); } catch (e) { /* ok */ }
      this.log.querySelectorAll('.nx-line.old').forEach((l) => l.classList.remove('old'));
      setTimeout(() => { try { this.input.focus({ preventScroll: true }); } catch (e) { /* ok */ } }, 0);
    }
    closeChat() {
      const r = this.run; if (!this.chatOpen) return;
      this.chatOpen = false; this.chat.classList.remove('open'); this.input.blur(); this.input.value = '';
      r.hacking = false; r.syncLock && r.syncLock();
      if (!r.touch && !r.disposed) { try { r.requestLock(); } catch (e) { /* ok */ } }
    }
    sendChat() {
      const res = NN.chat.send(this.input.value);
      if (res.ok) { this.input.value = ''; this.closeChat(); } else this.note(NN.text(res.err), 1.8);
    }
    addLine(m, quiet) {
      const L = this.log; if (!L) return;
      const d = document.createElement('div'); d.className = 'nx-line' + (m.from === 'sys' ? ' sys' : '');
      if (m.from === 'sys') d.textContent = ({ FRIEND_JOINED: '{0} joined the party', HOST_READY: 'Connected to host {0}', FRIEND_LEFT: '{0} left the party' }[m.key] || m.key).replace('{0}', m.name);
      else { const b = document.createElement('b'); b.setAttribute('translate', 'no'); b.textContent = m.name; if (m.color) b.style.color = m.color; const s = document.createElement('span'); s.setAttribute('translate', 'no'); s.textContent = m.text; d.appendChild(b); d.appendChild(s); }
      L.appendChild(d);
      while (L.children.length > 8) L.removeChild(L.firstChild);
      const fade = () => { if (!this.chatOpen) d.classList.add('old'); else setTimeout(fade, 3000); };
      setTimeout(fade, quiet ? 3500 : 9000);
    }
    onChat(m) { this.addLine(m); if (m.from === 'peer') { try { this.run.snd && this.run.snd.play('beep', { k: 0.6 }); } catch (e) { /* ok */ } } }
    toggleMic() {
      const v = NN.voice.state;
      if (!NN.connected) { this.note(NN.text('NOT_CONNECTED'), 1.8); return; }
      if (!v.mic) NN.voice.enable().then((res) => { if (!res.ok) this.note(NN.text(res.err), 3.4); else this.note('MICROPHONE ON', 1.4); this.updBtns(); });
      else { NN.voice.setMuted(!v.muted); this.note(v.muted ? 'MICROPHONE ON' : 'MICROPHONE MUTED', 1.4); }
      this.updBtns();
    }
    updBtns() {
      const v = NN.voice.state, b = this.btns && this.btns.querySelector('[data-k="mic"]'); if (!b) return;
      b.classList.toggle('on', v.mic && !v.muted); b.classList.toggle('muted', v.mic && v.muted);
      this.btns.hidden = this.solo || this.gone;
    }

    // -------------------------------------------------------------- готовность
    onReady() {
      if (this.ready) return;
      this.ready = true;
      this.seedOff();
      if (!this.solo) NN.sendAction({ type: 'cev', k: 'ready' });
      if (!this.solo && this.host && this.peerReady) this.resendEnemies();
    }
    onCev(p) {
      switch (p.k) {
        case 'ready': this.peerReady = true; if (this.host && this.ready) this.resendEnemies(); break;
        case 'emote': this.startRemoteEmote(String(p.id || '').slice(0, 20)); break;
        case 'emoteoff': this.stopRemoteEmote(); break;
        case 'leave': this.partnerGone('FRIEND LEFT THE MATCH'); break;
        default: break;
      }
    }
    partnerGone(text) {
      if (this.gone) return;
      this.gone = true; this.solo = true; this.run.noPause = false;   // друг ушёл — снова одиночная игра, пауза разрешена
      this.note(text || 'FRIEND LEFT', 3);
      if (this.av) { this.av.n.g.visible = false; }
      this.stopRemoteEmote();
      if (this.tag) this.tag.hidden = true; if (this.who) this.who.hidden = true;
      this.byId.forEach((e) => { if (e.puppet && !e.dead) { e.dead = true; e.alive = false; e.n.free = true; e.n.g.visible = false; } });
      this.updBtns();
    }

    // -------------------------------------------------------------- аватар напарника
    buildAvatar() {
      const r = this.run, T = THREE, n = r.npc(0, 0, 0), peer = NN.peer || {};
      r.actorReset(n); n.yaw = 0; n.g.visible = false; n.seed = 3.3;
      const col = peer.color || '#ffd60a';
      this.av = { n, kind: undefined, muz: 0, dead: false, shown: false, aim: 0 };
      this.tag.querySelector('span').textContent = peer.name || 'PLAYER ' + (this.slot === 1 ? 2 : 1);
      this.tag.querySelector('small').textContent = this.slot === 1 ? 'PLAYER 2' : 'PLAYER 1';
      this.tag.style.color = col;
      const w = this.who; w.querySelector('.nx-av').innerHTML = PF ? PF.avatar(peer.name || 'P', col, 24) : '';
      w.querySelector('b').textContent = peer.name || 'PLAYER'; w.hidden = false;
    }
    gunKind(id) { return GUN[id] || (id ? 'rifle' : null); }
    updateAvatar(dt) {
      const r = this.run, A = this.av, R = this.rem; if (!A) return;
      const n = A.n, g = n.g;
      if (!R.got || this.gone) { g.visible = false; return; }
      const em = this.emo;
      if (!A.shown) { g.position.x = R.x; g.position.z = R.z; n.lx = R.x; n.lz = R.z; A.shown = true; }
      const k = 1 - Math.exp(-dt * 13);
      g.position.x += (R.x - g.position.x) * k; g.position.z += (R.z - g.position.z) * k;
      if (Math.hypot(R.x - g.position.x, R.z - g.position.z) > 6) { g.position.x = R.x; g.position.z = R.z; n.lx = R.x; n.lz = R.z; }   // телепорт (рестарт у чекпоинта)
      n.yaw = R.yaw + Math.PI;
      // смерть / воскрешение
      if (R.dead && !A.dead) { A.dead = true; r.actorKill(n, false, null); }
      else if (!R.dead && A.dead) { A.dead = false; r.actorReset(n); A.kind = undefined; g.position.y = 0; }
      if (!A.dead) {
        if (R.w !== A.kind) { A.kind = R.w; r.setGun(n, this.gunKind(R.w)); }
        const recent = r.time - this.shotAt < 1.4 || R.aim > 0.35;
        n.armT = n.gunKind ? (recent ? 1 : 0) : 0;
        n.cvT = R.crouch ? 1 : 0;
        A.muz = Math.max(0, A.muz - dt);
        if (n.flashM) n.flashM.visible = A.muz > 0;
      }
      g.visible = !em && !(R.hide);
      if (em) this.updateEmote(dt);
      // ник над головой
      const cam = r.camera, tg = this.tag;
      if (!cam || !g.visible && !em || A.dead) { tg.hidden = true; return; }
      const v = this.v3 || (this.v3 = new THREE.Vector3());
      v.set(g.position.x, 2.12, g.position.z).project(cam);
      const d = Math.hypot(g.position.x - r.p.x, g.position.z - r.p.z);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || d > 40) { tg.hidden = true; return; }
      tg.hidden = false;
      tg.style.left = ((v.x * 0.5 + 0.5) * r.w).toFixed(0) + 'px'; tg.style.top = ((-v.y * 0.5 + 0.5) * r.h).toFixed(0) + 'px';
      tg.style.fontSize = clamp(22 - d * 0.5, 13, 20).toFixed(0) + 'px';
    }

    // -------------------------------------------------------------- эмоции напарника: тот же танцор, что у игрока (EmoteCore.makeFigure)
    startRemoteEmote(id) {
      const EC = window.EmoteCore, r = this.run; if (!EC || !r.scene || !this.av) return;
      const tr = EC.track(id); if (!tr) return;
      this.stopRemoteEmote();
      const e = this.emo = { id, tr, t: 0, fig: null, pose: new Float32Array(45), tmp: new Float32Array(45), wait: false };
      const go = () => { if (this.emo !== e || r.disposed) return; e.fig = EC.makeFigure(THREE, { cast: false }); r.scene.add(e.fig.group); EC.idlePose(0, e.pose, tr); e.fig.update(e.pose, null); };
      if (tr.ready()) go(); else tr.load().then(go);
      const snd = r.snd;   // музыка танца напарника: тот же трек, что играет у самого танцующего; тише с расстоянием
      if (snd && snd.ctx && snd.ctx.state !== 'closed' && EC.makeMusic) {
        try { const M = e.music = EC.makeMusic(snd.ctx, () => Math.min(1, snd.musVol() * 1.35) * this.emoVol(), tr); M.target = 1; M.play(0); } catch (er) { e.music = null; }
      }
    }
    emoVol() { const R = this.rem, p = this.run.p; if (!R) return 1; return Math.max(0.12, 1 - Math.hypot(R.x - p.x, R.z - p.z) / 45); }
    updateEmote(dt) {
      const EC = window.EmoteCore, e = this.emo, R = this.rem; if (!e) return;
      if (e.music) e.music.tick(dt);
      if (!e.fig) return;
      e.t += dt;
      const tr = e.tr;
      EC.sampleDance(e.t, e.pose, tr);
      if (e.t < 0.45) { EC.idlePose(e.t, e.tmp, tr); EC.mixPose(e.tmp, e.pose, EC.smooth(e.t / 0.45), e.pose); }
      e.fig.place(R.x, R.z, R.yaw + Math.PI); e.fig.update(e.pose, null);
      if (!tr.loop && e.t > tr.dur + 0.45) this.stopRemoteEmote();
    }
    stopRemoteEmote() {
      const e = this.emo; if (!e) return;
      this.emo = null;
      if (e.music) { try { e.music.stop(); } catch (er) { /* уже остановлена */ } e.music = null; }
      if (e.fig) { try { e.fig.dispose(); } catch (er) { /* сцена могла быть уничтожена */ } }
    }

    // -------------------------------------------------------------- отправка своего состояния
    sendState(dt) {
      const r = this.run, p = r.p; if (this.solo || !NN.connected) return;
      this.sendT += dt;
      const L = this.lastPos;
      const x = q(p.x, 50), z = q(p.z, 50), a = q(p.yaw, 50), c = r.pm && r.pm.crouch ? 1 : 0, w = r.wp ? r.wp.id : '', h = r.cb ? Math.round(clamp(r.hp / (r.maxHp || 100), 0, 1) * 100) : 100, d = r.dead ? 1 : 0, aim = q(r.aimK || 0, 4);
      const same = x === L.x && z === L.z && a === L.a && c === L.c && w === L.w && h === L.h && d === L.d && aim === L.q;
      if (this.sendT < (same ? 0.5 : 0.066)) return;      // ≤ 15 пакетов/с; в покое — 2 раза в секунду
      this.sendT = 0;
      Object.assign(L, { x, z, a, c, w, h, d, q: aim });
      NN.sendAction({ type: 'pos', x, z, a, c, w, h, d, q: aim });
    }
    onPos(p) {
      const R = this.rem;
      R.x = num(p.x); R.z = num(p.z); R.yaw = num(p.a); R.crouch = !!p.c; R.w = typeof p.w === 'string' ? p.w.slice(0, 12) : ''; R.hp = clamp(num(p.h, 100), 0, 100); R.dead = !!p.d; R.aim = clamp(num(p.q), 0, 1);
      R.p.x = R.x; R.p.z = R.z; R.p.yaw = R.yaw; R.p.moving = 0.5; R.got = true; R.lastT = performance.now();
      if (!this.av && this.ready) this.buildAvatar();
    }

    // -------------------------------------------------------------- выстрелы
    onShot(p) {
      const r = this.run, A = this.av, R = this.rem; if (!A || !r.cb || !r.scene) return;
      const n = A.n, id = typeof p.w === 'string' ? p.w : R.w;
      this.shotAt = r.time; A.muz = 0.05; n.kick = 1;
      const d = Math.hypot(R.x - r.p.x, R.z - r.p.z);
      if (r.snd) { try { r.snd.shot(SND[id] || 'erifle', { dist: d, at: [R.x, 1.4, R.z] }); } catch (e) { /* звук не критичен */ } }
      const list = Array.isArray(p.tr) ? p.tr.slice(0, 3) : [];
      const mz = this.muzzle(A);
      list.forEach((t) => {
        if (!Array.isArray(t) || t.length < 8) return;
        const o = { x: num(t[0]), y: num(t[1]), z: num(t[2]) }, dx = num(t[3]) / 1000, dy = num(t[4]) / 1000, dz = num(t[5]) / 1000, len = clamp(num(t[6]) / 10, 0, 120), k = t[7] | 0;
        try { r.tracerFrom(r.rg, null, { t: len }, dx, dy, dz, o, mz); } catch (e) { /* без трассера */ }
        if (k === 1) { const nx = -dx, ny = -dy, nz = -dz, l = Math.hypot(nx, ny, nz) || 1; r.sparks(o.x + dx * len, o.y + dy * len, o.z + dz * len, nx / l, ny / l, nz / l, 4); }
        else if (k === 2) r.sparks(o.x + dx * len, o.y + dy * len, o.z + dz * len, 0, 1, 0, 3);
      });
      if (this.host && this.shared) this.withRemote(() => r.noise(30));
    }
    muzzle(A) {
      const T = THREE, n = A.n, v = this.mv || (this.mv = new T.Vector3());
      if (n.flashM && n.gunG) { n.g.updateMatrixWorld(true); v.copy(n.flashM.position); n.gunG.localToWorld(v); } else v.set(this.rem.x, 1.35, this.rem.z);
      return v;
    }
    onBoom(p) {
      const r = this.run; if (!r.blastFx || !r.scene) return;
      try { r.blastFx(num(p.x), num(p.y), num(p.z), clamp(num(p.r, 4), 0.5, 20), p.k); } catch (e) { /* только картинка */ }
    }

    // -------------------------------------------------------------- враги: Хост — авторитет (песочница)
    registerEnemy(e) {
      e.nid = ++this.nid; this.byId.set(e.nid, e);
      if (!this.solo && this.peerReady) this.sendSpawn(e);
    }
    sendSpawn(e) { NN.sendAction({ type: 'espawn', i: e.nid, t: e.type, x: q(e.x, 50), z: q(e.z, 50), a: q(e.n.yaw, 50), g: e.n.gunKind || '' }); }
    resendEnemies() { this.byId.forEach((e) => { if (!e.dead && e.alive !== false) this.sendSpawn(e); }); }
    sendKill(e, head) { if (!e.nid || this.solo) return; NN.sendAction({ type: 'ekill', i: e.nid, h: head ? 1 : 0, by: e.lastBy || 1 }); this.byId.delete(e.nid); }
    sendGone(e) { if (e.nid && !this.solo) NN.sendAction({ type: 'egone', i: e.nid }); this.byId.delete(e.nid); }
    sendWave(S) { if (!this.solo) NN.sendAction({ type: 'wave', n: S.wave, run: S.running ? 1 : 0, k: S.kills }); }
    waveText(S, left) { this.run.objective('WAVE ' + S.wave + ' — ' + left + ' ENEMIES'); }
    sendSnap(dt) {
      if (!this.host || this.solo || !this.shared || !this.peerReady) return;
      this.snapT += dt; if (this.snapT < 0.1) return; this.snapT = 0;
      const list = [];
      this.byId.forEach((e) => {
        if (e.dead || !e.n) return;
        const g = e.n.g.position;
        list.push([e.nid, Math.round(g.x * 50), Math.round(g.z * 50), Math.round(e.n.yaw * 50), (e.n.armT > 0.5 ? 1 : 0) | (e.n.creeping ? 2 : 0) | ((e.muz || 0) > 0 ? 4 : 0)]);
      });
      NN.sendAction({ type: 'snap', e: list }, { fast: true });
    }
    onHit(p) {                                                 // друг попал во врага: Хост применяет урон
      if (!this.host || !this.shared || !this.ready) return;
      const t = performance.now();
      if (t - this.hitRate.t > 1000) { this.hitRate.t = t; this.hitRate.n = 0; }
      if (++this.hitRate.n > 60) return;
      const e = this.byId.get(p.i | 0); if (!e || e.dead) return;
      const r = this.run, d = clamp(num(p.d), 0, 400);
      if (!d) return;
      this.dmgBy = 2;
      try { r.damageEnemy(e, d, !!p.h, p.x === undefined ? undefined : { x: num(p.x) / 100, y: num(p.y) / 100, z: num(p.z) / 100 }); } finally { this.dmgBy = 1; }
    }
    // выбор цели врагов: ближайший живой игрок. withRemote подменяет «игрока» на аватар друга, а удары по нему превращает в сетевой урон
    withRemote(fn) {
      const r = this.run, R = this.rem, saved = r.p, savedAim = r.aimK, own = {};
      ['hurt', 'pmHd', 'pmMelee', 'pmAim'].forEach((k) => { own[k] = Object.prototype.hasOwnProperty.call(r, k) ? r[k] : undefined; });
      r.p = R.p; R.p.moving = 0.5; r.aimK = R.aim;
      r.hurt = (amt, fx, fz) => { if (!this.solo) NN.sendAction({ type: 'hurt', a: Math.round(amt * 10) / 10, x: q(fx, 10), z: q(fz, 10) }); };
      r.pmHd = () => [R.x, R.crouch ? 1.1 : 1.6, R.z]; r.pmMelee = () => false; r.pmAim = () => 1;
      try { return fn(); } finally {
        r.p = saved; r.aimK = savedAim;
        ['hurt', 'pmHd', 'pmMelee', 'pmAim'].forEach((k) => { if (own[k] !== undefined) r[k] = own[k]; else delete r[k]; });
      }
    }
    updateEnemies(orig, dt, frozen) {
      const r = this.run, cb = r.cb, R = this.rem;
      if (!this.host || this.solo || !this.shared || !R.got || R.dead || !this.peerReady) return orig.call(r, dt, frozen);
      const all = cb.enemies, Lg = [], Rg = [], px = r.p.x, pz = r.p.z;
      for (const e of all) {
        if (e.dead) { Lg.push(e); continue; }
        const g = e.n.g.position, dl = Math.hypot(g.x - px, g.z - pz), dr = Math.hypot(g.x - R.x, g.z - R.z);
        let t = e.tgt || 'l';
        if (r.dead) t = 'r'; else if (t === 'l' && dr < dl * 0.8) t = 'r'; else if (t === 'r' && dl < dr * 0.8) t = 'l';
        e.tgt = t; (t === 'r' ? Rg : Lg).push(e);
      }
      cb.enemies = Lg; orig.call(r, dt, frozen);
      if (Rg.length) { cb.enemies = Rg; this.withRemote(() => orig.call(r, dt, frozen)); }
      const keep = new Set(Lg); Rg.forEach((e) => keep.add(e));
      cb.enemies = all.filter((e) => keep.has(e));
    }
    // -------- клиент: куклы врагов
    onSpawn(p) {
      if (this.host || !this.shared) return;
      if (!this.ready) { this.pq.push(['s', p]); return; }
      const r = this.run, id = p.i | 0; if (!id || this.byId.has(id) || !r.cb) return;
      const type = ['grunt', 'rusher', 'heavy', 'boss', 'target'].indexOf(p.t) >= 0 ? p.t : 'grunt';
      const gun = ['pistol', 'rifle', 'lmg', 'shotgun'].indexOf(p.g) >= 0 ? p.g : null;
      const x = num(p.x), z = num(p.z), e = r.enemy(type, x, z, { exact: true, drop: false, tag: 'sbN', yaw: num(p.a), gun });
      e.puppet = true; e.nid = id; e.ai = () => true; e.net = { x, z, a: num(p.a), f: 0 };
      this.byId.set(id, e);
    }
    onSnap(p) {
      if (this.host || !this.shared || !Array.isArray(p.e)) return;
      this.lastSnapRx = performance.now();
      for (const s of p.e.slice(0, 40)) {
        if (!Array.isArray(s)) continue;
        const e = this.byId.get(s[0] | 0); if (!e || e.dead) continue;
        e.net.x = num(s[1]) / 50; e.net.z = num(s[2]) / 50; e.net.a = num(s[3]) / 50; e.net.f = s[4] | 0;
      }
    }
    puppets(dt) {
      if (this.host || !this.shared) return;
      const k = 1 - Math.exp(-dt * 12);
      this.byId.forEach((e) => {
        if (e.dead || !e.net) return;
        const g = e.n.g.position, N = e.net;
        g.x += (N.x - g.x) * k; g.z += (N.z - g.z) * k;
        e.n.yaw = N.a; e.n.armT = N.f & 1 ? 1 : 0; e.n.creeping = !!(N.f & 2); e.muz = N.f & 4 ? 0.05 : 0;
      });
    }
    onKill(p) {
      if (this.host || !this.shared) return;
      if (!this.ready) { this.pq.push(['k', p]); return; }
      const e = this.byId.get(p.i | 0); if (!e) return;
      this.byId.delete(e.nid);
      if (e.dead) return;
      e.noCredit = (p.by | 0) !== this.slot; e.puppet = false;
      this.run.killEnemy(e, !!p.h);
    }
    onGone(p) {
      if (this.host || !this.shared) return;
      const e = this.byId.get(p.i | 0); if (!e) return;
      this.byId.delete(e.nid);
      e.dead = true; e.alive = false; e.n.free = true; e.n.g.visible = false;
      const r = this.run, cb = r.cb, i = cb.enemies.indexOf(e); if (i >= 0) cb.enemies.splice(i, 1); const j = cb.shoot.indexOf(e); if (j >= 0) cb.shoot.splice(j, 1);
    }
    // удар по кукле: урон считает Хост, у нас — только эффекты
    puppetHit(e, amt, head, pt) {
      const r = this.run; if (e.dead || this.solo) return;
      const t = performance.now();
      NN.sendAction({ type: 'hit', i: e.nid, d: Math.round(amt * 10) / 10, h: head ? 1 : 0, x: pt ? Math.round(pt.x * 100) : undefined, y: pt ? Math.round(pt.y * 100) : undefined, z: pt ? Math.round(pt.z * 100) : undefined });
      r.actorHit(e.n, head, amt); e.flashT = 0.06;
      if (!e.t.passive) {
        const o = r.camera.position, qp = pt || { x: e.x, y: 1.3 * e.t.scale, z: e.z }, dx = qp.x - o.x, dy = qp.y - o.y, dz = qp.z - o.z, l = Math.hypot(dx, dy, dz) || 1;
        r.bloodHit(qp, head, amt, { x: dx / l, y: dy / l, z: dz / l });
        r.snd && r.snd.play(head ? 'bone' : 'flesh', { k: 1.4 });
      }
      void t;
    }
    onEShot(p) {
      const r = this.run, e = this.byId.get(p.i | 0); if (this.host || !e || e.dead || !r.cb) return;
      e.muz = 0.05; e.n.kick = 1;
      const g = e.n.g.position, tx = num(p.tx), tz = num(p.tz), hit = Math.random() < 0.5;
      const from = this.mv2 || (this.mv2 = new THREE.Vector3());
      if (e.n.flashM && e.n.gunG) { e.n.g.updateMatrixWorld(true); from.copy(e.n.flashM.position); e.n.gunG.localToWorld(from); } else from.set(g.x, 1.35 * e.t.scale, g.z);
      const jx = hit ? 0 : (Math.random() - 0.5) * 2.5, jy = hit ? 0 : (Math.random() - 0.3), jz = hit ? 0 : (Math.random() - 0.5) * 2.5;
      const tgt = { x: tx + jx, y: 1.3 + jy, z: tz + jz }, dx = tgt.x - from.x, dy = tgt.y - from.y, dz = tgt.z - from.z, l = Math.hypot(dx, dy, dz) || 1;
      try { r.tracerFrom(r.rg, null, { t: l + (hit ? 0 : 5) }, dx / l, dy / l, dz / l, { x: from.x, y: from.y, z: from.z }, from); } catch (er) { /* без трассера */ }
      const kind = e.n.gunKind === 'pistol' ? 'epistol' : e.n.gunKind === 'shotgun' ? 'shotgun' : e.n.gunKind === 'lmg' ? 'elmg' : 'erifle';
      if (r.snd) { try { r.snd.shot(kind, { dist: Math.hypot(g.x - r.p.x, g.z - r.p.z), at: [g.x, 1.4, g.z] }); } catch (er) { /* звук не критичен */ } }
    }
    onHurt(p) {                                                // Хост: «в тебя попали» — применяем как обычный урон
      const r = this.run; if (this.host || !r.cb || this.solo) return;
      r.hurt(clamp(num(p.a), 0, 60), num(p.x), num(p.z));
    }
    onWave(p) {
      if (this.host || !this.shared) return;
      if (p.run) { this.run.toast('WAVE ' + (p.n | 0), 1.8); try { this.run.sfx('notification'); } catch (e) { /* ok */ } } else { this.run.toast('WAVE CLEARED', 1.8); try { this.run.sfx('succesfully'); } catch (e) { /* ok */ } }
      this.waveNo = p.n | 0;
      this.run.objective('WAVE ' + this.waveNo + (p.run ? '' : ' — CLEARED'));
    }

    // -------------------------------------------------------------- такт
    tick(dt) {
      const r = this.run;
      if (r.entered) this.seedOff();
      if (!this.av && this.ready && this.rem.got && !this.solo) this.buildAvatar();
      if (this.pq.length && this.ready) { const L = this.pq.splice(0); L.forEach((x) => (x[0] === 's' ? this.onSpawn(x[1]) : this.onKill(x[1]))); }
      if (!this.ready) { if (r.entered && r.scene) this.onReady(); else return; }
      this.sendState(dt);
      this.sendSnap(dt);
      this.puppets(dt);
      this.updateAvatar(dt);
      // свои эмоции: сообщаем напарнику о начале и конце танца
      const es = r.em && r.em.ses;
      if (es && (!this.lastEm || this.lastEm !== es)) { this.lastEm = es; if (!this.solo) NN.sendAction({ type: 'cev', k: 'emote', id: es.id }); }
      else if (!es && this.lastEm) { this.lastEm = null; if (!this.solo) NN.sendAction({ type: 'cev', k: 'emoteoff' }); }
      // плашка напарника (4 раза в секунду)
      this.hudT += dt;
      if (this.hudT > 0.25) {
        this.hudT = 0;
        const w = this.who, R = this.rem, v = NN.voice.state;
        if (w && !w.hidden) {
          w.querySelector('.hp i').style.width = (R.dead ? 0 : R.hp) + '%';
          w.querySelector('.talk').classList.toggle('on', !!v.peerSpeaking);
          w.querySelector('.st').textContent = R.dead ? '✖' : (NN.rtt ? NN.rtt + ' ms' : '');
        }
        this.updBtns();
      }
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.seedOff();
      this.offs.forEach((f) => { try { f(); } catch (e) { /* ok */ } }); this.offs = [];
      this.stopRemoteEmote();
      if (this.chatOpen) { this.run.hacking = false; this.chatOpen = false; }
      if (!this.solo && NN.connected) NN.sendAction({ type: 'cev', k: 'leave' });
      if (cur === this) cur = null;
    }
  }

  // ------------------------------------------------------------------ подмена методов Run (минимальные обёртки, логика боя не тронута)
  const start0 = window.Missions.start;
  window.Missions.start = function (taskId, opts) {
    const spec = opts && opts.coop;
    const run = start0.call(this, taskId, opts);
    if (run && spec && !spec.solo) { const co = new Session(run, spec); run.__co = co; cur = co; }
    return run;
  };
  const wrap1 = (name, fn) => { const o = P[name]; if (typeof o !== 'function') return; P[name] = function () { return fn.call(this, o, arguments); }; };
  wrap1('damageEnemy', function (o, a) {
    const co = this.__co, e = a[0];
    if (co && e) {
      if (e.puppet) { co.puppetHit(e, a[1], a[2], a[3]); return undefined; }
      if (e.nid) { e.lastBy = co.dmgBy; e.noCredit = co.dmgBy === 2; }   // убийство засчитывается тому, кто стрелял
    }
    return o.apply(this, a);
  });
  wrap1('updateEnemies', function (o, a) { const co = this.__co; return co ? co.updateEnemies(o, a[0], a[1]) : o.apply(this, a); });
  wrap1('enemyShoot', function (o, a) {
    const co = this.__co, e = a[0];
    if (co && co.host && co.shared && !co.solo && e && e.nid) { const t = this.p; NN.sendAction({ type: 'eshot', i: e.nid, tx: q(t.x, 10), tz: q(t.z, 10) }); }
    return o.apply(this, a);
  });
  // свои выстрелы -> напарнику: событие + до трёх трассеров
  wrap1('tracerFrom', function (o, a) { const co = this.__co; if (co && co.cap && !a[7]) { const h = a[2]; co.cap.tr.push([q(a[6].x, 100), q(a[6].y, 100), q(a[6].z, 100), Math.round(a[3] * 1000), Math.round(a[4] * 1000), Math.round(a[5] * 1000), Math.round(Math.min(h.t, 70) * 10), h.kind === 'wall' || h.kind === 'floor' ? 1 : h.kind === 'obj' ? 2 : 0]); } return o.apply(this, a); });
  wrap1('shoot', function (o, a) {
    const co = this.__co;
    if (!co || co.solo || !NN.connected) return o.apply(this, a);
    co.cap = { tr: [] };
    let res;
    try { res = o.apply(this, a); } finally {
      const c = co.cap; co.cap = null;
      const w = a[0] && a[0].id;
      NN.sendAction(c.tr.length ? { type: 'shot', w, tr: c.tr } : { type: 'shot', w });
      co.shotAt = this.time;
    }
    return res;
  });
  wrap1('explode', function (o, a) {
    const co = this.__co;
    if (co && !co.solo && NN.connected) NN.sendAction({ type: 'boom', x: q(a[0], 10), y: q(a[1], 10), z: q(a[2], 10), r: q(a[3] || 4, 10), k: a[5] });
    return o.apply(this, a);
  });
  // общая песочница: смерть игрока не должна стирать врагов у обоих — clearEnemies в coopbox пропускаем (волны ведёт Хост)
  wrap1('clearEnemies', function (o, a) { const co = this.__co; if (co && co.shared && co.ready && !this.disposed) return undefined; return o.apply(this, a); });
  wrap1('dispose', function (o, a) { const co = this.__co; if (co) { try { co.dispose(); } catch (e) { /* ok */ } } return o.apply(this, a); });

  window.NexaCoop = {
    prepare(spec) { pendingSpec = spec; },
    end() { pendingSpec = null; if (cur) { cur.dispose(); cur = null; } },
    get active() { return !!(cur && !cur.solo && NN.connected); },
    get session() { return cur; },
    status() {
      const s = cur; if (!s) return null;
      return { mode: s.mode, host: s.host, slot: s.slot, ready: s.ready, peerReady: s.peerReady, solo: s.solo, avatar: !!s.av, shown: !!(s.av && s.av.n.g.visible), remote: { x: s.rem.x, z: s.rem.z, w: s.rem.w, hp: s.rem.hp, dead: s.rem.dead, got: s.rem.got }, enemies: s.byId.size, puppets: Array.from(s.byId.values()).filter((e) => e.puppet).length, wave: s.wave ? s.wave.wave : (s.waveNo || 0), emote: s.emo ? s.emo.id : null };
    }
  };
}());
