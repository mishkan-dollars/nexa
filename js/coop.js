// NEXA/OS: кооператив на нескольких игроков, до NexaNet.MAX_PLAYERS (поверх js/net.js, топология «звезда»: Хост ретранслирует). Все клиенты запускают одно и то же задание / песочницу (id и seed от Хоста). Напарник — настоящий стикмен игры
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
  const BEAR = ['draw', 'hold', 'approach', 'shake', 'out', 'toss', 'hug', 'hugHold', 'pocket', 'stow'], GADI = { frag: 2, flash: 3, c4: 4 };
  const q = (v, k) => Math.round(v * k) / k;
  const wrap = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  const GUN = { glock: 'pistol', ak: 'rifle', shotgun: 'shotgun', sniper: 'rifle', lmg: 'lmg' };
  const SND = { glock: 'epistol', ak: 'erifle', shotgun: 'shotgun', sniper: 'sniper', lmg: 'elmg' };
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d || 0);
  let cur = null;                       // активная сессия
  let pendingSpec = null;

  // ------------------------------------------------------------------ детерминированный генератор (mulberry32): общий декор у обоих игроков
  function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function seeded(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ------------------------------------------------------------------ CO-OP SANDBOX: зал песочницы, волны врагов для двоих
  const BOX = { x0: -11, x1: 11, zNear: -4, zFar: -44 };
  const WAVE_TYPES = (w) => { const L = ['grunt', 'grunt', 'grunt']; if (w >= 2) L.push('rusher', 'rusher'); if (w >= 3) L.push('heavy'); if (w >= 5) L.push('heavy', 'rusher'); return L; };
  MISSIONS.coopbox = {
    title: 'CO-OP SANDBOX',
    build(r) {
      MISSIONS.sandbox.build(r);
      const co = r.__co, off = co ? (co.slot - 1) * 1.6 - 1.6 : 0;   // игроки в ряд у входа, слот 1 слева
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
  // Комната из нескольких игроков: у каждого напарника своя запись Remote (слот 1..N): состояние, аватар, эмоция, плашка. Хост — авторитет (враги, волны), ретранслирует остальным.
  const avKey = (slot) => { const q = NN.players.find((x) => x.slot === slot); return q ? q.pid : ''; };
  class Session {
    constructor(run, spec) {
      this.run = run; this.spec = spec; this.mode = spec.mode === 'mission' ? 'mission' : 'sandbox';
      this.host = spec.role !== 'guest'; this.slot = spec.role === 'guest' ? (NN.slot || 2) : 1; this.solo = !!spec.solo;
      if (!this.solo) run.noPause = true;   // в онлайне паузы нет (мир идёт у друзей): Esc/кнопка/потеря фокуса не ставят игру на паузу
      this.story = this.mode === 'mission'; this.shared = true; this.pseq = 0; this.ffAvail = !spec.solo; this.ff = this.ffAvail && spec.ff !== 0; this.ffm = [0.25, 0.5, 1].indexOf(+spec.ffm) >= 0 ? +spec.ffm : 1; this.ffRate = new Map(); this.ffLast = {};
      this.kset = {}; this.mk = new Set(); this.ek = {}; this.cinN = 0; this.act = ''; this.snapFull = 0; this.eReq = 0; this.dropCap = null;
      this.remotes = new Map(); this.readySet = new Set();
      this.xs = { ex: 0, ip: 0 }; this.ready = false; this.offs = []; this.sendT = 0; this.snapT = 0; this.hudT = 0; this.lastSend = 0;
      this.catchTo = spec.late && spec.mode === 'mission' && String(spec.mission) !== '48' ? spec.stage | 0 : 0; this.t0c = performance.now();
      this.stage = this.catchTo ? 0 : spec.stage | 0; this.stages = {}; this.startSlots = new Set(NN.players.map((x) => x.slot));
      this.byId = new Map(); this.nid = 0; this.dmgBy = 1; this.chatOpen = false; this.lastEm = null; this.cap = null;
      this.hitRate = { t: 0, n: 0 }; this.rng0 = null; this.wave = null; this.pq = []; this.gone = false; this.lastSnapRx = 0; this.lastPos = { x: 1e9, z: 1e9, a: 1e9, c: 0, w: '', h: -1, d: 0, q: 0 };
      this.spectator = !!spec.spectator && spec.role === 'guest'; if (this.spectator) { this.ffAvail = false; this.ff = false; }
      this.seedOn();
      this.hook();
      if (this.mode === 'mission' && !this.solo && !this.spectator) this.defSkip();
      if (this.spectator) this.defSpec();
      if (!this.solo && PF) { PF.count('matches'); if (this.host) PF.count('hostMatches'); }
    }
    get peerReady() { return this.readySet.size > 0; }
    seedOn() {
      if (!this.spec.seed) return;
      this.rng0 = Math.random; this.rng = seeded(this.spec.seed); this.proxy = () => this.rng(); Math.random = this.proxy;
    }
    seedOff() { if (this.rng0) { if (Math.random === this.proxy) Math.random = this.rng0; this.rng0 = null; } }
    reseed(key) { if (this.rng0 && this.story) this.rng = seeded(hash32(this.spec.seed + '|' + key)); }
    ekey(type) { const s = this.stage + ':' + this.act + ':' + type; this.ek[s] = (this.ek[s] | 0) + 1; return s + ':' + this.ek[s]; }
    on(type, fn) { this.offs.push(NN.on(type, fn.bind(this))); }
    hook() {
      const r = this.run;
      this.on('pos', this.onPos); this.on('shot', this.onShot); this.on('cev', this.onCev); this.on('boom', this.onBoom);
      this.on('net:close', () => this.partnerGone(NN.text('PEER_LEFT'))); this.on('net:chat', this.onChat);
      this.on('net:left', (p) => this.removeRemote(p.slot, true)); this.on('net:roster', () => this.pruneRemotes());
      this.on('net:state', (s) => { if (s.state === 'lost') this.note('CONNECTION UNSTABLE…'); });
      this.on('hit', this.onHit); this.on('ffh', this.onFfh); this.on('espawn', this.onSpawn); this.on('ekill', this.onKill); this.on('egone', this.onGone); this.on('snap', this.onSnap);
      this.on('bl', this.onBlood); this.on('gr', this.onGrenade); this.on('eshot', this.onEShot); this.on('hurt', this.onHurt); this.on('wave', this.onWave);
      r.hooks.push((dt) => { try { this.tick(dt); } catch (e) { if (!this.errLogged) { this.errLogged = true; console.warn('[coop]', e); } } });
      this.buildUi();
      if (window.NexaAvatar) this.offs.push(NexaAvatar.on(() => this.remotes.forEach((m) => { const k = avKey(m.slot); if (m.tag) m.tag.querySelector('.nx-tav').innerHTML = PF.avatar(m.name || 'P', m.color, 30, k); if (m.who) m.who.querySelector('.nx-av').innerHTML = PF.avatar(m.name || 'P', m.color, 24, k); })));
    }
    // запись о напарнике по слоту (создаётся при первом пакете, если игрок есть в списке комнаты)
    rmFor(slot) {
      slot = slot | 0;
      let m = this.remotes.get(slot);
      if (m || slot < 1 || slot === this.slot || this.gone) return m || null;
      const q = NN.players.find((x) => x.slot === slot); if (!q) return null;
      m = { slot, name: q.name, color: q.color, av: null, emo: null, shotAt: -9, tag: null, who: null,
        rem: { x: 0, z: 0, yaw: 0, hp: 100, dead: false, w: '', crouch: false, aim: 0, got: false, p: { x: 0, z: 0, yaw: 0, pitch: 0, phase: 0, moving: 0 }, lastT: 0 } };
      this.remotes.set(slot, m); this.mkRemoteUi(m);
      return m;
    }
    liveRemotes() { return Array.from(this.remotes.values()).filter((m) => m.rem.got && !m.rem.dead); }
    pruneRemotes() { this.remotes.forEach((m, s) => { if (!NN.players.some((q) => q.slot === s)) this.removeRemote(s, true); }); }
    removeRemote(slot, say) {
      const m = this.remotes.get(slot), alone = !NN.players.some((q) => q.slot !== slot);
      if (!m) { if (say && alone) this.partnerGone('FRIEND LEFT THE MATCH'); return; }
      this.stopRemoteEmote(m);
      if (m.av) { m.av.n.g.visible = false; if (m.av.item) { m.av.n.spine.remove(m.av.item.pv); if (m.av.item.toy) m.av.item.toy.dispose(); m.av.item = null; m.av.itemId = 0; } }
      if (m.tag) m.tag.remove(); if (m.who) m.who.remove();
      this.remotes.delete(slot); this.readySet.delete(slot);
      this.byId.forEach((e) => { if (e.puppet && !e.dead && e.owner === slot) { e.dead = true; e.alive = false; e.n.free = true; e.n.g.visible = false; } });
      if (say) this.note(m.name + ' — ' + NN.text('PEER_LEFT'), 2.6);
      if (!this.remotes.size && alone) this.partnerGone('FRIEND LEFT THE MATCH');
    }

    // -------------------------------------------------------------- интерфейс поверх миссии
    buildUi() {
      const r = this.run, L = r.layer;
      const hud = this.hud = document.createElement('div'); hud.className = 'nx-hud'; hud.setAttribute('data-i18n', 'net');
      hud.innerHTML = '';
      L.appendChild(hud);
      if (this.ffAvail) { const fb = this.ffBadge = document.createElement('div'); fb.className = 'nx-ff'; fb.setAttribute('data-i18n', 'net'); L.appendChild(fb); this.ffUi(); }
      const chat = this.chat = document.createElement('div'); chat.className = 'nx-chat'; chat.setAttribute('data-i18n', 'net');
      chat.innerHTML = '<div class="nx-log" role="log"></div><form class="nx-in" autocomplete="off"><input type="text" maxlength="200" placeholder="Type a message…" aria-label="Chat message" enterkeyhint="send"><button type="submit">SEND</button></form>';
      L.appendChild(chat);
      const btns = this.btns = document.createElement('div'); btns.className = 'nx-btns'; btns.setAttribute('data-i18n', 'net');
      btns.innerHTML = '<button type="button" class="nx-btn" data-k="chat">CHAT</button><button type="button" class="nx-btn" data-k="mic">MIC</button>';
      L.appendChild(btns);
      this.input = chat.querySelector('input'); this.log = chat.querySelector('.nx-log');
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

    mkRemoteUi(m) {
      const L = this.run.layer; if (!L) return;
      const tag = m.tag = document.createElement('div'); tag.className = 'nx-tag'; tag.hidden = true; tag.innerHTML = '<i class="nx-tav"></i><span translate="no"></span><small></small>'; tag.querySelector('.nx-tav').innerHTML = PF ? PF.avatar(m.name || 'P', m.color, 30, avKey(m.slot)) : '';
      tag.querySelector('span').textContent = m.name; tag.querySelector('small').textContent = 'PLAYER ' + m.slot; tag.style.color = m.color; L.appendChild(tag);
      const w = m.who = document.createElement('div'); w.className = 'nx-who'; w.hidden = true;
      w.innerHTML = '<span class="nx-av"></span><b translate="no"></b><span class="hp"><i></i></span><span class="talk"></span><span class="st" translate="no"></span>';
      w.querySelector('.nx-av').innerHTML = PF ? PF.avatar(m.name || 'P', m.color, 24, avKey(m.slot)) : '';
      w.querySelector('b').textContent = m.name || 'PLAYER';
      this.hud.appendChild(w);
    }

    // -------------------------------------------------------------- готовность
    onReady() {
      if (this.ready) return;
      this.ready = true;
      if (this.ffAvail && this.ff) this.note('FRIENDLY FIRE IS ON', 3.6);
      if (!this.story) this.seedOff();
      if (!this.solo) NN.sendAction({ type: 'cev', k: 'ready' });
      this.ffSend();
      if (!this.solo && this.host && this.peerReady) this.resendEnemies();
    }
    onCev(p) {
      const from = p.from | 0;
      switch (p.k) {
        case 'ready': this.readySet.add(from); if (this.host) this.ffSend(); this.rmFor(from); if (this.host && this.ready) this.resendEnemies(); break;
        case 'emote': { const m = this.rmFor(from); if (m) this.startRemoteEmote(m, String(p.id || '').slice(0, 20)); break; }
        case 'emoteoff': { const m = this.remotes.get(from); if (m) this.stopRemoteEmote(m); break; }
        case 'bar': this.stages[from] = Math.max(this.stages[from] | 0, p.s | 0); if (p.r && this.stage > 0) NN.sendAction({ type: 'cev', k: 'bar', s: this.stage }, { to: from }); break;
        case 'barn': { const kn = String(p.kn || '').slice(0, 32); (this.kset[from] || (this.kset[from] = new Set())).add(kn); if (p.r && this.mk.has(kn)) NN.sendAction({ type: 'cev', k: 'barn', kn }, { to: from }); break; }
        case 'ffs': if (!this.host) { this.ff = this.ffAvail && !!p.on; this.ffm = [0.25, 0.5, 1].indexOf(+p.m) >= 0 ? +p.m : 1; this.ffUi(); } break;
        case 'cskip': if (!this.host && this.run.inCinema) this.skipGo = true; break;
        case 'ffk': if (!this.host) this.ffKillMsg(p.a | 0, p.t | 0); break;
        case 'cs': if (!this.host) { const c = p.c | 0, i = p.i | 0; if (!this.cs || c > this.cs.c || (c === this.cs.c && i > this.cs.i)) this.cs = { c, i }; } break;
        case 'sv': if (this.host && this.votes) { if (p.v) this.votes.add(from); else this.votes.delete(from); } break;
        case 'svn': if (!this.host) this.skipTxt(p.a | 0, p.b | 0); break;
        case 'eresync': if (this.host && this.ready) this.resendEnemies(); break;
        case 'leave': this.removeRemote(from, true); break;
        default: break;
      }
    }
    catchUp() { return this.catchTo > 0 && this.stage < this.catchTo && performance.now() - this.t0c < 120000; }   // поздний вход: пройденные этапы пропускаются без исполнения
    netUp() { return NN.connected || NN.state === 'lost'; }
    async barrierKey(key, ms) { try { await this.barrierKey0(key, ms); } finally { this.reseed('k:' + key); } }
    async barrierKey0(key, ms) {
      if (this.solo || this.disposed || this.spectator) return;
      if (key.length > 32) key = 'h' + hash32(key).toString(36) + key.length;
      this.mk.add(key); NN.sendAction({ type: 'cev', k: 'barn', kn: key });
      let t0 = Date.now(), shown = 0, lt = t0;
      while (!this.disposed && !this.gone && !this.solo && this.netUp() && Date.now() - t0 < (ms || 60000)) {
        const tn = Date.now(); if (!NN.connected) t0 += tn - lt; lt = tn;
        const slots = NN.players.map((x) => x.slot).filter((x) => x !== this.slot), waiting = slots.filter((x) => !(this.kset[x] && this.kset[x].has(key)));
        if (!waiting.length) return;
        if (Date.now() - shown > 1500) { shown = Date.now(); this.run.toast('WAITING FOR PLAYERS ' + (slots.length - waiting.length + 1) + '/' + (slots.length + 1), 1.6); NN.sendAction({ type: 'cev', k: 'barn', kn: key, r: 1 }); }
        await new Promise((res) => setTimeout(res, 150));
      }
    }
    // пропуск катсцены голосованием: r.cineSkip — свойство; нажатие (клавиша/кнопка/геймпад) = голос, повтор снимает; пропуск, когда проголосовали все живые и не AFK
    defSkip() {
      const r = this.run; this.votes = new Set(); this.skipGo = false; this.myV = false; this.vAt = 0; this.rep = 0; this.vShown = ''; this.myAct = performance.now(); this.afk = null;
      Object.defineProperty(r, 'cineSkip', { configurable: true, get: () => this.skipGo, set: (v) => this.setSkip(v) });
      const kd = (e) => { if (e.repeat) this.rep = performance.now(); };
      document.addEventListener('keydown', kd, true); this.offs.push(() => document.removeEventListener('keydown', kd, true));
    }
    setSkip(v) {
      const r = this.run;
      if (this.solo || this.gone) { this.skipGo = !!v; return; }
      if (!v) { this.skipGo = false; this.votes.clear(); this.myV = false; this.afk = null; this.skipTxt(0, 0); return; }
      const t = performance.now();
      if (!r.inCinema || t - this.rep < 80 || t - this.vAt < 250) return;
      this.vAt = t; this.myV = !this.myV;
      if (this.host) { if (this.myV) this.votes.add(1); else this.votes.delete(1); } else NN.sendAction({ type: 'cev', k: 'sv', v: this.myV ? 1 : 0 });
    }
    skipTxt(n, m) {
      const el = this.run.qs && this.run.qs('.m-skip'); if (!el) return;
      if (!this.skBase) this.skBase = el.textContent;
      const t = n > 0 ? this.skBase + '  ' + n + '/' + m : this.skBase; if (el.textContent !== t) el.textContent = t;
    }
    cineSync() {
      const r = this.run;
      if (this.solo || this.mode !== 'mission' || !this.votes) return;
      const now = performance.now(), p = r.p;
      if (this.catchUp() && r.inCinema) this.skipGo = true;
      if (!r.inCinema) {
        if (this.skipGo || this.votes.size || this.myV) { this.skipGo = false; this.votes.clear(); this.myV = false; this.skipTxt(0, 0); }
        const mv = (o, x, z, a) => Math.abs(o.lx - x) > 0.05 || Math.abs(o.lz - z) > 0.05 || Math.abs(o.la - a) > 0.02;
        if (this.lp === undefined || mv(this.lp, p.x, p.z, p.yaw || 0)) { this.myAct = now; this.lp = { lx: p.x, lz: p.z, la: p.yaw || 0 }; }
        this.remotes.forEach((m) => { const R = m.rem; if (!m.lp || mv(m.lp, R.x, R.z, R.yaw)) { m.act = now; m.lp = { lx: R.x, lz: R.z, la: R.yaw }; } });
        return;
      }
      if (!this.afk) { this.afk = new Set(); if (now - this.myAct > 30000) this.afk.add(this.slot); this.remotes.forEach((m) => { if (now - (m.act || now) > 30000) this.afk.add(m.slot); }); }
      if (!this.host) return;
      const need = [1].concat(NN.players.map((q) => q.slot)).filter((x, i, a) => a.indexOf(x) === i && !this.afk.has(x) && !(x === 1 ? r.dead : (this.remotes.get(x) || { rem: {} }).rem.dead));
      const have = need.filter((x) => this.votes.has(x)).length, tx = have + '/' + need.length;
      if (tx !== this.vShown) { this.vShown = tx; this.skipTxt(have, need.length); NN.sendAction({ type: 'cev', k: 'svn', a: have, b: need.length }); }
      if (need.length && have === need.length && !this.skipGo) { this.skipGo = true; NN.sendAction({ type: 'cev', k: 'cskip' }); }
    }
    async barrier() { try { await this.barrier0(); } finally { this.reseed('p:' + this.stage); } }
    async barrier0() {
      if (this.spectator) return;
      this.stage += 1; NN.sendAction({ type: 'cev', k: 'bar', s: this.stage });
      let t0 = Date.now(), shown = 0, lt = t0;
      while (!this.disposed && !this.gone && !this.solo && this.netUp() && Date.now() - t0 < 90000) {
        const tn = Date.now(); if (!NN.connected) t0 += tn - lt; lt = tn;
        const slots = NN.players.map((q) => q.slot), waiting = slots.filter((x) => (this.stages[x] | 0) < this.stage);
        if (!waiting.length) return;
        if (Date.now() - shown > 1500) { shown = Date.now(); NN.sendAction({ type: 'cev', k: 'bar', s: this.stage, r: 1 }); this.run.toast('WAITING FOR PLAYERS ' + (slots.length - waiting.length + 1) + '/' + (slots.length + 1), 1.6); }
        await new Promise((res) => setTimeout(res, 250));
      }
    }
    partnerGone(text) {
      if (this.gone) return;
      this.gone = true; this.solo = true; this.seedOff(); this.run.noPause = false;   // все ушли — снова одиночная игра, пауза разрешена
      this.note(text || 'FRIEND LEFT', 3);
      this.remotes.forEach((m) => { this.stopRemoteEmote(m); if (m.av) m.av.n.g.visible = false; if (m.tag) m.tag.hidden = true; if (m.who) m.who.hidden = true; });
      this.byId.forEach((e) => { if (e.puppet && !e.dead) { e.dead = true; e.alive = false; e.n.free = true; e.n.g.visible = false; } });
      this.updBtns();
    }

    // -------------------------------------------------------------- аватары напарников
    buildAvatar(m) {
      const r = this.run, n = r.npc(0, 0, 0), peer = NN.players.find((x) => x.slot === m.slot) || {};
      r.actorReset(n); n.yaw = 0; n.g.visible = false; n.seed = 3.3 + m.slot;
      // без колец и свечения: цвет игрока только в нике над головой и в плашке
      m.av = { n, kind: undefined, muz: 0, dead: false, shown: false, aim: 0 };
      m.name = peer.name || m.name; m.color = peer.color || m.color;
      m.tag.querySelector('.nx-tav').innerHTML = PF ? PF.avatar(m.name || 'P', m.color, 30, avKey(m.slot)) : '';
      m.tag.querySelector('span').textContent = m.name; m.tag.querySelector('small').textContent = 'PLAYER ' + m.slot; m.tag.style.color = m.color;
      m.who.querySelector('.nx-av').innerHTML = PF ? PF.avatar(m.name || 'P', m.color, 24, avKey(m.slot)) : '';
      m.who.querySelector('b').textContent = m.name || 'PLAYER'; m.who.hidden = false;
    }
    gunKind(id) { return GUN[id] || (id ? 'rifle' : null); }
    updateAvatars(dt) { this.remotes.forEach((m) => this.updateAvatar(m, dt)); }
    updateAvatar(m, dt) {
      const r = this.run, A = m.av, R = m.rem; if (!A) return;
      const n = A.n, g = n.g, tg = m.tag;
      if (!R.got || this.gone) { g.visible = false; if (tg) tg.hidden = true; return; }
      const em = m.emo;
      if (!A.shown) { g.position.x = R.x; g.position.z = R.z; n.lx = R.x; n.lz = R.z; A.shown = true; }
      const dtg = R.tgt || 65;
      R.dly = !R.dly || dtg > R.dly ? dtg : Math.max(dtg, R.dly - 5 * Math.min(dt, 0.1));
      const sm = this.sample(R, performance.now() - R.dly) || R;
      g.position.x = sm.x; g.position.z = sm.z;
      if (Math.hypot(R.x - g.position.x, R.z - g.position.z) > 6) { g.position.x = R.x; g.position.z = R.z; n.lx = R.x; n.lz = R.z; }   // телепорт (рестарт у чекпоинта)
      n.yaw = sm.yaw + Math.PI;
      // смерть / воскрешение
      if (R.dead && !A.dead) { A.dead = true; r.actorKill(n, false, null); }
      else if (!R.dead && A.dead) { A.dead = false; r.actorReset(n); A.kind = undefined; g.position.y = 0; }
      if (!A.dead) {
        if (R.w !== A.kind) { A.kind = R.w; if (!r.setRealGun || !r.setRealGun(n, R.w)) r.setGun(n, this.gunKind(R.w)); }
        const recent = r.time - m.shotAt < 1.4 || R.aim > 0.35;
        n.armT = n.gunKind ? (recent ? 1 : 0) : 0;
        if (R.rl && n.gunKind) { A.relT = Math.min(0.98, (A.relT || 0) + dt / 1.4); n.rel = A.relT; } else { A.relT = 0; n.rel = 0; }
        n.cvT = R.crouch ? 1 : 0;
        A.muz = Math.max(0, A.muz - dt);
        if (n.flashM) n.flashM.visible = A.muz > 0;
      }
      this.itemModel(m); this.itemPose(m, dt);
      g.visible = !em && !(R.hide);
      if (em) this.updateEmote(m, dt);
      // ник над головой
      const cam = r.camera;
      if (!cam || !g.visible && !em || A.dead) { tg.hidden = true; return; }
      const v = this.v3 || (this.v3 = new THREE.Vector3());
      v.set(g.position.x, 2.12, g.position.z).project(cam);
      const d = Math.hypot(g.position.x - r.p.x, g.position.z - r.p.z);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || d > 40) { tg.hidden = true; return; }
      tg.hidden = false;
      const tx = Math.round((v.x * 0.5 + 0.5) * r.w), ty = Math.round((-v.y * 0.5 + 0.5) * r.h), fs = Math.round(clamp(22 - d * 0.5, 13, 20));
      if (tg.__x === undefined) { tg.style.left = '0'; tg.style.top = '0'; }
      if (tg.__x === undefined || Math.abs(tx - tg.__x) >= 1 || Math.abs(ty - tg.__y) >= 1) { tg.__x = tx; tg.__y = ty; tg.style.transform = 'translate(' + tx + 'px,' + ty + 'px) translate(-50%,-100%)'; }
      if (tg.__f !== fs) { tg.__f = fs; tg.style.fontSize = fs + 'px'; }
    }

    // -------------------------------------------------------------- эмоции напарников: тот же танцор, что у игрока (EmoteCore.makeFigure)
    startRemoteEmote(m, id) {
      const EC = window.EmoteCore, r = this.run; if (!EC || !r.scene || !m.av) return;
      const tr = EC.track(id); if (!tr) return;
      this.stopRemoteEmote(m);
      const e = m.emo = { id, tr, t: 0, fig: null, pose: new Float32Array(45), tmp: new Float32Array(45), wait: false };
      const go = () => { if (m.emo !== e || r.disposed) return; e.fig = EC.makeFigure(THREE, { cast: false }); r.scene.add(e.fig.group); EC.idlePose(0, e.pose, tr); e.fig.update(e.pose, null); };
      if (tr.ready()) go(); else tr.load().then(go);
      const snd = r.snd;   // музыка танца напарника: тот же трек, что играет у самого танцующего; тише с расстоянием
      if (snd && snd.ctx && snd.ctx.state !== 'closed' && EC.makeMusic) {
        try { const M = e.music = EC.makeMusic(snd.ctx, () => Math.min(1, snd.musVol() * 1.35) * this.emoVol(m), tr); M.target = 1; M.play(0); } catch (er) { e.music = null; }
      }
    }
    emoVol(m) { const R = m.rem, p = this.run.p; if (!R) return 1; return Math.max(0.12, 1 - Math.hypot(R.x - p.x, R.z - p.z) / 45); }
    updateEmote(m, dt) {
      const EC = window.EmoteCore, e = m.emo, R = m.rem; if (!e) return;
      if (e.music) e.music.tick(dt);
      if (!e.fig) return;
      e.t += dt;
      const tr = e.tr;
      EC.sampleDance(e.t, e.pose, tr);
      if (e.t < 0.45) { EC.idlePose(e.t, e.tmp, tr); EC.mixPose(e.tmp, e.pose, EC.smooth(e.t / 0.45), e.pose); }
      e.fig.place(R.x, R.z, R.yaw + Math.PI); e.fig.update(e.pose, null);
      if (!tr.loop && e.t > tr.dur + 0.45) this.stopRemoteEmote(m);
    }
    stopRemoteEmote(m) {
      const e = m.emo; if (!e) return;
      m.emo = null;
      if (e.music) { try { e.music.stop(); } catch (er) { /* уже остановлена */ } e.music = null; }
      if (e.fig) { try { e.fig.dispose(); } catch (er) { /* сцена могла быть уничтожена */ } }
    }

    // -------------------------------------------------------------- отправка своего состояния
    sendState(dt) {
      const r = this.run, p = r.p; if (this.solo || !NN.connected || this.spectator) return;
      this.sendT += dt;
      const L = this.lastPos;
      const x = q(p.x, 50), z = q(p.z, 50), a = q(p.yaw, 50), c = r.pm && r.pm.crouch ? 1 : 0, w = r.wp ? r.wp.id : '', h = r.cb ? Math.round(clamp(r.hp / (r.maxHp || 100), 0, 1) * 100) : 100, d = r.dead ? 1 : 0, aim = q(r.aimK || 0, 4);
      const rl = r.rl ? 1 : 0, pt = Math.round((clamp(p.pitch || 0, -1.25, 1.25) + 1.25) / 2.5 * 31), it = this.itemState(), same = pt === L.pt && rl === L.rl && x === L.x && z === L.z && a === L.a && c === L.c && w === L.w && h === L.h && d === L.d && aim === L.q && it[0] === L.it && it[1] === L.ia && !it[1];
      const gap = document.hidden ? 1 : same ? (L.mv ? 0.03 : 0.5) : this.nearGap();
      if (this.sendT < gap) return;      // рядом до 60 пакетов/с, далеко реже; в покое — 2/с; в скрытой вкладке — 1/с
      this.sendT = 0; L.mv = !same;
      L.x = x; L.z = z; L.a = a; L.c = c; L.w = w; L.h = h; L.d = d; L.q = aim; L.it = it[0]; L.ia = it[1]; L.rl = rl; L.pt = pt;
      NN.sendAction({ type: 'pos', x, z, a, c, w, h, d, q: aim, r: rl, pt: p.pitch || 0, it: it[0], ia: it[1], ip: it[2] });
    }
    itemState() {
      const r = this.run, ty = r.ty;
      if (ty && r.toyId && ty.s !== 'none' && ty.vis) {
        const ia = BEAR.indexOf(ty.s) + 1;
        if (ia > 0) return [1, ia, ty.dur > 0 && isFinite(ty.dur) ? Math.round(clamp(ty.t / ty.dur, 0, 1) * 255) : 0];
      }
      const g = this.gt;
      if (g && r.time - g.t < 0.7 && r.time >= g.t) return [GADI[g.id] || 2, g.id === 'c4' ? 21 : 20, Math.round(clamp((r.time - g.t) / 0.7, 0, 1) * 255)];
      return [0, 0, 0];
    }
    itemModel(m) {
      const R = m.rem, A = m.av, n = A.n, r = this.run, T = THREE;
      if (A.itemId === R.it) return;
      if (A.item) { n.spine.remove(A.item.pv); if (A.item.toy) A.item.toy.dispose(); A.item = null; }
      A.itemId = R.it;
      if (!R.it) return;
      const pv = new T.Group(); pv.visible = false; n.spine.add(pv);
      const it = A.item = { pv, id: R.it, k: 0 };
      if (R.it === 1) {
        const W = window.Toys, id = 'black_bear';
        const build = () => { if (A.item !== it || !W.tpl(id)) return; const t = it.toy = W.make(id); if (!t) return; const sc = 0.34 / (Math.max.apply(null, t.size || [1]) || 1); t.group.scale.setScalar(sc); pv.add(t.group); it.ready = true; };
        if (W.tpl(id)) build(); else W.load(id).then(build, () => {});
      } else {
        const col = R.it === 2 ? 0x2a2a2a : R.it === 3 ? 0xe0e0e0 : 0xb0a060;
        const mesh = it.mesh = new T.Mesh(R.it === 4 ? new T.BoxGeometry(0.16, 0.05, 0.1) : new T.SphereGeometry(0.075, 8, 6), new T.MeshBasicMaterial({ color: col }));
        pv.add(mesh); it.ready = true; it.own = true;
      }
    }
    itemPose(m, dt) {
      const R = m.rem, A = m.av, it = A.item; if (!it) return;
      const pv = it.pv, ph = (R.ip | 0) / 255, ia = R.ia | 0, tt = this.run.time;
      let x = 0.3, y = 0.05, z = 0.38, rx = 0, rz = 0, vis = ia > 0 && it.ready && !A.dead && !m.emo;
      if (R.it === 1) {
        const s = BEAR[ia - 1];
        if (s === 'draw') { y = -0.55 + 0.6 * ph; z = 0.2 + 0.18 * ph; }
        else if (s === 'approach') { x = 0.3 - 0.2 * ph; z = 0.38 + 0.12 * ph; y = 0.05 + 0.1 * ph; }
        else if (s === 'shake') { x = 0.1; z = 0.5; y = 0.15 + Math.sin(tt * 37) * 0.07; rz = Math.sin(tt * 37) * 0.3; }
        else if (s === 'out') { x = 0.1 + 0.2 * ph; z = 0.5 - 0.12 * ph; y = 0.15 - 0.1 * ph; }
        else if (s === 'toss') { x = 0.3 - 0.3 * ph; y = 0.05 + Math.sin(ph * Math.PI) * 0.5; z = 0.38; }
        else if (s === 'hug' || s === 'hugHold') { x = 0; y = 0.15; z = 0.24; }
        else if (s === 'pocket' || s === 'stow') { y = 0.05 - 0.6 * ph; z = 0.38 - 0.18 * ph; }
      } else if (ia === 20) { const a = Math.sin(ph * Math.PI); y = 0.05 + 0.35 * a; z = 0.2 + 0.5 * ph; x = 0.3; vis = vis && ph < 0.85; }
      else if (ia === 21) { y = 0.05 - 0.3 * Math.sin(ph * Math.PI); z = 0.4; }
      const k = 1 - Math.exp(-dt * 20);
      pv.position.x += (x - pv.position.x) * k; pv.position.y += (y - pv.position.y) * k; pv.position.z += (z - pv.position.z) * k;
      pv.rotation.x += (rx - pv.rotation.x) * k; pv.rotation.z += (rz - pv.rotation.z) * k;
      const want = vis ? 1 : 0; it.k += (want - it.k) * (1 - Math.exp(-dt * 14));
      pv.visible = it.k > 0.05; pv.scale.setScalar(Math.max(0.01, it.k));
    }
    nearGap() {
      const p = this.run.p; let d = 1e9;
      this.remotes.forEach((m) => { if (m.rem.got) { const e = Math.hypot(m.rem.x - p.x, m.rem.z - p.z); if (e < d) d = e; } });
      return d < 25 ? 0.0155 : d < 60 || this.remotes.size <= 2 ? 0.033 : 0.066;
    }
    sample(R, rt) {
      const b = R.buf, n = b.length; if (!n) return null;
      if (rt <= b[0].t) return b[0];
      const L = b[n - 1];
      if (rt >= L.t) {
        if (n < 2) return L;
        this.xs.ex += 1;
        const P = b[n - 2], dt = L.t - P.t || 1, e = Math.min(rt - L.t, 100), k = e / dt;
        if (Math.hypot(L.x - P.x, L.z - P.z) > 6) return L;
        return { x: L.x + (L.x - P.x) * k, z: L.z + (L.z - P.z) * k, yaw: L.yaw };
      }
      this.xs.ip += 1;
      let i = n - 2; while (i > 0 && b[i].t > rt) i -= 1;
      const A = b[i], B = b[i + 1], k = (rt - A.t) / ((B.t - A.t) || 1);
      let dy = B.yaw - A.yaw; dy -= Math.round(dy / 6.283185307) * 6.283185307;
      return { x: A.x + (B.x - A.x) * k, z: A.z + (B.z - A.z) * k, yaw: A.yaw + dy * k };
    }
    onPos(p) {
      const m = this.rmFor(p.from); if (!m) return;
      const R = m.rem;
      { const nt = performance.now(), od = (nt - (R.pt0 || 0)) / 1000; if (R.pt0 && od > 0.005 && od < 0.5) { R.vx = (num(p.x) - R.x) / od; R.vz = (num(p.z) - R.z) / od; } R.pt0 = nt; }
      R.x = num(p.x); R.z = num(p.z); R.yaw = num(p.a); R.crouch = !!p.c; R.w = typeof p.w === 'string' ? p.w.slice(0, 12) : ''; R.hp = clamp(num(p.h, 100), 0, 100); R.dead = !!p.d; R.aim = clamp(num(p.q), 0, 1); R.pitch = clamp(num(p.pt), -1.3, 1.3);
      R.rl = !!p.r; R.it = p.it | 0; R.ia = p.ia | 0; R.ip = p.ip | 0;
      R.p.x = R.x; R.p.z = R.z; R.p.yaw = R.yaw; R.p.moving = 0.5; R.got = true;
      const t = R.lastT ? performance.now() : 0, now = performance.now();
      if (t) { const g = now - t; R.gap = R.gap ? R.gap * 0.9 + Math.min(g, 400) * 0.1 : g; (R.iv || (R.iv = [])).push(Math.min(g, 400)); if (R.iv.length > 60) R.iv.shift(); }
      R.lastT = now;
      const at = p.at > 0 && p.at <= now + 5 && now - p.at < 1500 ? p.at : 0;
      if (at) { const lat = now - at; R.mlat = R.mlat === undefined ? lat : R.mlat * 0.95 + lat * 0.05; (R.lt || (R.lt = [])).push(lat); if (R.lt.length > 60) R.lt.shift(); }
      const arr = at ? R.lt : R.iv;
      if (arr && arr.length > 5) { const s = arr.slice().sort((x, y) => x - y); R.tgt = clamp(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] + Math.min(R.gap || 33, 66), 40, 250); }
      const b = R.buf || (R.buf = []), l = b[b.length - 1], bt = at || (R.mlat !== undefined ? now - R.mlat : now);
      if (l && Math.hypot(R.x - l.x, R.z - l.z) > 6) b.length = 0;
      if (l && bt <= l.t) return;
      b.push({ t: bt, x: R.x, z: R.z, yaw: R.yaw }); if (b.length > 12) b.shift();
      if (!m.av && this.ready) this.buildAvatar(m);
    }

    // -------------------------------------------------------------- выстрелы
    onShot(p) {
      const r = this.run, m = this.remotes.get(p.from | 0); if (!m) return;
      const A = m.av, R = m.rem; if (!A || !r.cb || !r.scene) return;
      const n = A.n, id = typeof p.w === 'string' ? p.w : R.w;
      m.shotAt = r.time; A.muz = 0.05; n.kick = 1;
      const d = Math.hypot(R.x - r.p.x, R.z - r.p.z);
      if (r.snd) { try { r.snd.shot(SND[id] || 'erifle', { dist: d, at: [R.x, 1.4, R.z] }); } catch (e) { /* звук не критичен */ } }
      const list = Array.isArray(p.tr) ? p.tr.slice(0, 3) : [];
      const mz = this.muzzle(m);
      list.forEach((t) => {
        if (!Array.isArray(t) || t.length < 8) return;
        const o = { x: num(t[0]), y: num(t[1]), z: num(t[2]) }, dx = num(t[3]) / 1000, dy = num(t[4]) / 1000, dz = num(t[5]) / 1000, len = clamp(num(t[6]) / 10, 0, 120), k = t[7] | 0;
        try { r.tracerFrom(r.rg, null, { t: len }, dx, dy, dz, o, mz); } catch (e) { /* без трассера */ }
        if (k === 1) { const nx = -dx, ny = -dy, nz = -dz, l = Math.hypot(nx, ny, nz) || 1; r.sparks(o.x + dx * len, o.y + dy * len, o.z + dz * len, nx / l, ny / l, nz / l, 4); }
        else if (k === 2) r.sparks(o.x + dx * len, o.y + dy * len, o.z + dz * len, 0, 1, 0, 3);
      });
      if (this.host && this.shared) this.withRemote(m, () => r.noise(30));
    }
    muzzle(m) {
      const T = THREE, n = m.av.n, v = this.mv || (this.mv = new T.Vector3());
      if (n.flashM && n.gunG) { n.g.updateMatrixWorld(true); v.copy(n.flashM.position); n.gunG.localToWorld(v); } else v.set(m.rem.x, 1.35, m.rem.z);
      return v;
    }
    onBlood(p) {
      const m = this.remotes.get(p.from | 0), r = this.run; if (!m || !m.av || !r.bloodSplatNpc || !m.av.n.g.visible) return;
      r.bloodSplatNpc(m.av.n, { x: clamp(num(p.x), -1, 1), z: clamp(num(p.z), -1, 1) }, clamp(num(p.a, 0.5), 0.1, 1.5));
    }
    onGrenade(p) {
      const r = this.run; if (!r.scene || !window.THREE) return;
      const T = THREE, frag = !!p.k, m = new T.Mesh(new T.SphereGeometry(0.075, 8, 6), new T.MeshBasicMaterial({ color: frag ? 0x2a2a2a : 0xe0e0e0 }));
      m.position.set(num(p.x), num(p.y), num(p.z)); r.scene.add(m);
      (this.grs || (this.grs = [])).length < 8 && this.grs.push({ m, vx: clamp(num(p.vx), -30, 30), vy: clamp(num(p.vy), -30, 30), vz: clamp(num(p.vz), -30, 30), t: 0, life: frag ? 2.0 : 1.4 });
    }
    grenades(dt) {
      if (!this.grs || !this.grs.length) return;
      this.grs = this.grs.filter((g) => {
        g.t += dt; g.vy -= 9.8 * dt; const p = g.m.position; p.x += g.vx * dt; p.y += g.vy * dt; p.z += g.vz * dt;
        if (p.y < 0.08) { p.y = 0.08; g.vy = Math.abs(g.vy) * 0.35; g.vx *= 0.6; g.vz *= 0.6; }
        if (g.t >= g.life) { this.run.scene.remove(g.m); g.m.geometry.dispose(); g.m.material.dispose(); return false; }
        return true;
      });
    }
    onBoom(p) {
      const r = this.run; if (!r.blastFx || !r.scene) return;
      try { r.blastFx(num(p.x), num(p.y), num(p.z), clamp(num(p.r, 4), 0.5, 20), p.k); } catch (e) { /* только картинка */ }
    }

    // -------------------------------------------------------------- враги: Хост — авторитет (песочница)
    registerEnemy(e, key) {
      if (key) e.key = key;
      e.nid = ++this.nid; this.byId.set(e.nid, e);
      if (!this.solo && this.peerReady) this.sendSpawn(e);
    }
    sendSpawn(e) { const m = e.t && e.t.hp ? Math.round(e.max / e.t.hp * 100) : 100; NN.sendAction({ type: 'espawn', i: e.nid, t: e.type, x: q(e.x, 50), z: q(e.z, 50), a: q(e.n.yaw, 50), g: e.n.gunKind || '', m: m === 100 ? undefined : m, f: e.friendly ? 1 : undefined, k: e.key }); }
    resendEnemies() { this.byId.forEach((e) => { if (!e.dead && e.alive !== false) this.sendSpawn(e); }); }
    sendKill(e, head) { if (!e.nid || this.solo) return; const d = this.dropCap && this.dropCap.length ? this.dropCap : undefined; NN.sendAction({ type: 'ekill', i: e.nid, h: head ? 1 : 0, by: e.lastBy || 1, d }); this.byId.delete(e.nid); }
    sendGone(e) { if (e.nid && !this.solo) NN.sendAction({ type: 'egone', i: e.nid }); this.byId.delete(e.nid); }
    sendWave(S) { if (!this.solo) NN.sendAction({ type: 'wave', n: S.wave, run: S.running ? 1 : 0, k: S.kills }); }
    waveText(S, left) { this.run.objective('WAVE ' + S.wave + ' — ' + left + ' ENEMIES'); }
    sendSnap(dt) {
      if (!this.host || this.solo || !this.shared || !this.peerReady) return;
      this.snapT += dt; if (this.snapT < (document.hidden ? 0.5 : 0.05)) return; this.snapT = 0;
      this.snapPh = (this.snapPh || 0) ^ 1; if (!this.snapPh) this.snapFull += 1; const full = this.snapFull >= 5; if (full && !this.snapPh) this.snapFull = 0;
      const ps = NN.players.map((q) => ({ slot: q.slot, m: this.remotes.get(q.slot) })).concat(NN.spectatorSlots.map((s) => ({ slot: s, m: null }))), lists = new Map(); this.snapN = (this.snapN || 0) + 1;
      ps.forEach((q) => lists.set(q.slot, []));
      this.byId.forEach((e) => {
        if (e.dead || !e.n || e.nid < 0) return;
        const g = e.n.g.position, x = Math.round(g.x * 50), z = Math.round(g.z * 50), a = Math.round(e.n.yaw * 50), f = (e.n.armT > 0.5 ? 1 : 0) | (e.n.creeping ? 2 : 0) | ((e.muz || 0) > 0 ? 4 : 0), h = Math.max(0, Math.min(255, Math.round(e.hp / e.max * 255))), l = e.ls;
        if (!full && l && l[0] === x && l[1] === z && l[2] === a && l[3] === f && l[4] === h) return;
        e.ls = [x, z, a, f, h];
        for (let i = 0; i < ps.length; i += 1) {
          const m = ps[i].m;
          if (!full && m && m.rem.got) { const dx = m.rem.x - g.x, dz = m.rem.z - g.z; if (dx * dx + dz * dz > 1600 && (this.snapN & 3)) continue; }
          lists.get(ps[i].slot).push(e.nid, x, z, a, f, h);
        }
      });
      lists.forEach((L, slot) => {
        for (let o = 0; o < L.length; o += 240) {
          const n = Math.min(40, (L.length - o) / 6), buf = new ArrayBuffer(2 + n * 10), v = new DataView(buf); v.setUint8(0, 3); v.setUint8(1, n);
          for (let t = 0; t < n; t += 1) { const b = 2 + t * 10, k = o + t * 6; v.setUint16(b, L[k] & 65535, true); v.setInt16(b + 2, clamp(L[k + 1], -32767, 32767), true); v.setInt16(b + 4, clamp(L[k + 2], -32767, 32767), true); v.setInt16(b + 6, clamp(L[k + 3], -32767, 32767), true); v.setUint8(b + 8, L[k + 4]); v.setUint8(b + 9, L[k + 5]); }
          if (!NN.sendRaw(slot, buf)) { const arr = []; for (let t = 0; t < n; t += 1) { const k = o + t * 6; arr.push([L[k], L[k + 1], L[k + 2], L[k + 3], L[k + 4], L[k + 5]]); } NN.sendAction({ type: 'snap', e: arr }, { fast: true, to: slot }); }
        }
      });
    }
    onHit(p) {                                                 // гость попал во врага: Хост применяет урон
      if (!this.host || !this.shared || !this.ready) return;
      const t = performance.now();
      if (t - this.hitRate.t > 1000) { this.hitRate.t = t; this.hitRate.n = 0; }
      if (++this.hitRate.n > 60 * Math.max(1, this.remotes.size)) return;
      const e = this.byId.get(p.i | 0); if (!e || e.dead) return;
      const r = this.run, d = clamp(num(p.d), 0, 400);
      if (!d) return;
      this.dmgBy = p.from | 0 || 2;
      try { r.damageEnemy(e, d, !!p.h, p.x === undefined ? undefined : { x: num(p.x) / 100, y: num(p.y) / 100, z: num(p.z) / 100 }); } finally { this.dmgBy = 1; }
    }
    // выбор цели врагов: ближайший живой игрок. withRemote подменяет «игрока» на аватар напарника, а удары по нему превращает в сетевой урон (адресно этому игроку)
    withRemote(m, fn) {
      const r = this.run, R = m.rem, saved = r.p, savedAim = r.aimK, own = {};
      ['hurt', 'pmHd', 'pmMelee', 'pmAim'].forEach((k) => { own[k] = Object.prototype.hasOwnProperty.call(r, k) ? r[k] : undefined; });
      r.p = R.p; R.p.moving = 0.5; r.aimK = R.aim;
      r.hurt = (amt, fx, fz) => { if (!this.solo) NN.sendAction({ type: 'hurt', a: Math.round(amt * 10) / 10, x: q(fx, 10), z: q(fz, 10) }, { to: m.slot }); };
      r.pmHd = () => [R.x, R.crouch ? 1.1 : 1.6, R.z]; r.pmMelee = () => false; r.pmAim = () => 1;
      try { return fn(); } finally {
        r.p = saved; r.aimK = savedAim;
        ['hurt', 'pmHd', 'pmMelee', 'pmAim'].forEach((k) => { if (own[k] !== undefined) r[k] = own[k]; else delete r[k]; });
      }
    }
    updateEnemies(orig, dt, frozen) {
      const r = this.run, cb = r.cb, live = this.liveRemotes();
      if (!this.host || this.solo || !this.shared || !live.length || !this.peerReady) return orig.call(r, dt, frozen);
      const all = cb.enemies, px = r.p.x, pz = r.p.z, groups = new Map(), local = [];
      const tg = [{ k: 0, x: px, z: pz, dead: r.dead }].concat(live.map((m) => ({ k: m.slot, x: m.rem.x, z: m.rem.z, dead: false, m })));
      for (const e of all) {
        if (e.dead) { local.push(e); continue; }
        const g = e.n.g.position;
        let best = null, bd = 1e9, cur = null, cd = 1e9;
        for (const t of tg) { if (t.dead) continue; const d = Math.hypot(g.x - t.x, g.z - t.z); if (d < bd) { bd = d; best = t; } if (t.k === e.tgt) { cd = d; cur = t; } }
        const pick = !best ? tg[0] : (cur && bd > cd * 0.8 ? cur : best);       // гистерезис: не дёргаться между целями
        e.tgt = pick.k; e.far = !!best && bd > 45;
        if (pick.k === 0) local.push(e); else { let a = groups.get(pick.k); if (!a) groups.set(pick.k, a = []); a.push(e); }
      }
      this.lodAcc = (this.lodAcc || 0) + dt; const doFar = this.lodAcc >= 0.066, fdt = this.lodAcc; if (doFar) this.lodAcc = 0;
      const split = (list) => { const near = [], far = []; for (const e of list) (e.far && !e.dead ? far : near).push(e); return [near, far]; };   // LOD: враги дальше 45 м от всех игроков — ~15 Гц
      let [nl, fl] = split(local);
      cb.enemies = nl; orig.call(r, dt, frozen);
      if (doFar && fl.length) { cb.enemies = fl; orig.call(r, fdt, frozen); }
      const keep = new Set(local);
      groups.forEach((list, k) => {
        const m = this.remotes.get(k); if (!m) { list.forEach((e) => keep.add(e)); return; }
        const [gn, gf] = split(list), fz = r.cineDepth > 0;
        cb.enemies = gn; this.withRemote(m, () => orig.call(r, dt, fz));
        if (doFar && gf.length) { cb.enemies = gf; this.withRemote(m, () => orig.call(r, fdt, fz)); }
        list.forEach((e) => keep.add(e));
      });
      cb.enemies = all.filter((e) => keep.has(e));
    }
    // -------- клиент: куклы врагов
    onSpawn(p) {
      if (this.host || !this.shared) return;
      if (!this.ready) { this.pq.push(['s', p]); return; }
      const r = this.run, id = p.i | 0; if (!id || this.byId.has(id) || !r.cb) return;
      const type = ['grunt', 'rusher', 'heavy', 'boss', 'target'].indexOf(p.t) >= 0 ? p.t : 'grunt';
      const gun = ['pistol', 'rifle', 'lmg', 'shotgun'].indexOf(p.g) >= 0 ? p.g : null;
      const x = num(p.x), z = num(p.z);
      if (this.story) {
        let best = null, bd = 6;
        const ky = typeof p.k === 'string' ? p.k.slice(0, 48) : '';
        this.byId.forEach((e) => { if (e.prov && !e.dead && e.type === type) { const d = Math.hypot(e.x - x, e.z - z); if (ky && e.key === ky && d < 25) { bd = -1; best = e; } else if (bd >= 0 && d < bd) { bd = d; best = e; } } });
        if (best) { this.byId.delete(best.nid); best.nid = id; best.prov = false; best.net.x = x; best.net.z = z; best.net.a = num(p.a); this.byId.set(id, best); return; }
      }
      this.noReg = true;
      let e;
      try { e = r.enemy(type, x, z, { exact: true, drop: false, tag: 'sbN', yaw: num(p.a), gun, hp: p.m ? clamp(num(p.m), 10, 2000) / 100 : 1, friendly: !!p.f }); } finally { this.noReg = false; }
      e.puppet = true; e.nid = id; e.ai = () => true; e.net = { x, z, a: num(p.a), f: 0 }; e.orphan = this.story; if (typeof p.k === 'string') e.key = p.k.slice(0, 48);
      this.byId.set(id, e);
    }
    storyEnemy(e, o, a, key) {
      if (this.host) { this.registerEnemy(e, key); return e; }
      e.key = key; e.puppet = true; e.drop = false; e.ai = () => true; e.prov = true; e.nid = --this.pseq; e.provT = performance.now(); e.net = { x: e.x, z: e.z, a: e.n.yaw, f: 0 };
      this.byId.set(e.nid, e);
      return e;
    }
    claimOrphan(type, x, z, o, key) {
      let best = null, bd = 6;
      this.byId.forEach((e) => { if (e.orphan && !e.dead && e.type === type) { const d = Math.hypot(e.x - x, e.z - z); if (key && e.key === key && d < 25) { bd = -1; best = e; } else if (bd >= 0 && d < bd) { bd = d; best = e; } } });
      if (!best) return null;
      best.orphan = false; best.key = key || best.key; best.onDeath = o.onDeath; if (o.tag) best.tag = o.tag; best.assist = !!o.assist;
      return best;
    }
    expireProv() {
      const t = performance.now();
      this.byId.forEach((e, id) => {
        if (!e.prov || t - e.provT < 6000) return;
        this.byId.delete(id); e.dead = true; e.alive = false; e.n.free = true; e.n.g.visible = false;
        const cb = this.run.cb, i = cb.enemies.indexOf(e); if (i >= 0) cb.enemies.splice(i, 1); const j = cb.shoot.indexOf(e); if (j >= 0) cb.shoot.splice(j, 1);
      });
    }
    onSnap(p) {
      if (this.host || !this.shared || !Array.isArray(p.e)) return;
      const now = this.lastSnapRx = performance.now();
      let miss = false;
      for (const s of p.e.slice(0, 64)) {
        if (!Array.isArray(s)) continue;
        const e = this.byId.get(s[0] | 0); if (!e) { miss = true; continue; } if (e.dead) continue;
        e.net.x = num(s[1]) / 50; e.net.z = num(s[2]) / 50; e.net.a = num(s[3]) / 50; e.net.f = s[4] | 0;
        const nb = e.nb || (e.nb = []), lb = nb[nb.length - 1];
        if (lb && (e.net.x - lb.x) * (e.net.x - lb.x) + (e.net.z - lb.z) * (e.net.z - lb.z) > 36) nb.length = 0;
        nb.push({ t: now, x: e.net.x, z: e.net.z, yaw: e.net.a }); if (nb.length > 8) nb.shift();
        if (s.length > 5) e.hp = clamp(num(s[5]), 0, 255) / 255 * e.max;
      }
      if (miss && now - this.eReq > 2500) { this.eReq = now; NN.sendAction({ type: 'cev', k: 'eresync' }); }
    }
    puppets(dt) {
      if (this.host || !this.shared) return;
      const k = 1 - Math.exp(-dt * 12), pnow = performance.now() - 60;
      this.byId.forEach((e) => {
        if (e.dead || !e.net) return;
        const g = e.n.g.position, N = e.net;
        let sm = null; if (e.nb && e.nb.length) { const sr = this.sr || (this.sr = { buf: null }); sr.buf = e.nb; sm = this.sample(sr, pnow); }
        if (sm) { g.x = sm.x; g.z = sm.z; e.n.yaw = sm.yaw; } else { g.x += (N.x - g.x) * k; g.z += (N.z - g.z) * k; e.n.yaw = N.a; }
         e.n.armT = N.f & 1 ? 1 : 0; e.n.creeping = !!(N.f & 2); e.muz = N.f & 4 ? 0.05 : 0;
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
      if (Array.isArray(p.d)) { const r = this.run, w = r.wp; p.d.slice(0, 4).forEach((k) => { if (!Array.isArray(k)) return; if (k[0] === 'ammo' && w) r.pickup(num(k[1]), num(k[2]), 'ammo', { id: w.id, amount: Math.ceil(w.def.mag * 0.7) }); else if (k[0] === 'health') r.pickup(num(k[1]), num(k[2]), 'health', { amount: 30 }); }); }
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
      NN.sendAction({ type: 'hit', i: e.nid, d: Math.round(amt * 10) / 10, h: head ? 1 : 0, x: pt ? Math.round(pt.x * 100) : undefined, y: pt ? Math.round(pt.y * 100) : undefined, z: pt ? Math.round(pt.z * 100) : undefined });
      r.actorHit(e.n, head, amt); e.flashT = 0.06;
      if (!e.t.passive) {
        const o = r.camera.position, qp = pt || { x: e.x, y: 1.3 * e.t.scale, z: e.z }, dx = qp.x - o.x, dy = qp.y - o.y, dz = qp.z - o.z, l = Math.hypot(dx, dy, dz) || 1;
        r.bloodHit(qp, head, amt, { x: dx / l, y: dy / l, z: dz / l });
        r.snd && r.snd.play(head ? 'bone' : 'flesh', { k: 1.4 });
      }
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
    // ---- огонь по своим: хост-авторитетно (цели — «куклы» напарников в cb.shoot; урон идёт обычным 'hurt' цели)
    ffUi() {
      const b = this.ffBadge; if (!b) return;
      b.innerHTML = '<b>' + (this.ff ? 'FF: ON' : 'FF: OFF') + '</b>' + (this.ff && this.ffm < 1 ? '<i> ' + Math.round(this.ffm * 100) + '%</i>' : ''); b.classList.toggle('off', !this.ff);
    }
    ffSend() { if (this.host && !this.solo && this.ffAvail) NN.sendAction({ type: 'cev', k: 'ffs', on: this.ff ? 1 : 0, m: this.ffm }); }
    setFF(on, m) { if (!this.host || !this.ffAvail) return; this.ff = !!on; if (m) this.ffm = m; this.ffUi(); this.ffSend(); }
    // лаг-компенсация хитскана: история позиций игроков ~300 мс на хосте; цель откатывается на min(150, rtt/2+60) мс
    histPush() {
      const t = performance.now(), H = this.hist || (this.hist = new Map()), put = (s, x, z) => { let a = H.get(s); if (!a) H.set(s, a = []); a.push({ t, x, z }); while (a.length > 2 && t - a[0].t > 300) a.shift(); };
      put(1, this.run.p.x, this.run.p.z); this.remotes.forEach((m) => { if (m.rem.got) put(m.slot, m.rem.x, m.rem.z); });
    }
    posAt(s, back) {
      const a = this.hist && this.hist.get(s); if (!a || !a.length) return null;
      const t = performance.now() - back; let p = a[0];
      for (let i = a.length - 1; i >= 0; i -= 1) { if (a[i].t <= t) { const n = a[i + 1]; if (n && n.t > a[i].t) { const k = (t - a[i].t) / (n.t - a[i].t); return { x: a[i].x + (n.x - a[i].x) * k, z: a[i].z + (n.z - a[i].z) * k }; } return a[i]; } p = a[i]; }
      return p;
    }
    // ---- зритель (не игрок: без слота игрока, урона и барьеров): камера в глазах выбранного игрока, Q/E/←/→ цель, V вид, кнопка выхода
    defSpec() {
      const r = this.run; this.sp = { slot: 0, fp: true, cf: null, t: 0 };
      r.god = true;
      const kd = (e) => {
        if (e.repeat) return;
        if (e.code === 'KeyQ' || e.code === 'ArrowLeft') this.specPick(-1); else if (e.code === 'KeyE' || e.code === 'ArrowRight') this.specPick(1); else if (e.code === 'KeyV') this.sp.fp = !this.sp.fp;
      };
      document.addEventListener('keydown', kd, true); this.offs.push(() => document.removeEventListener('keydown', kd, true));
      this.offs.push(() => { if (this.sp.cf && r.camFree === this.sp.cf) r.camFree = null; });
      const L = r.layer, el = this.spEl = document.createElement('div'); el.className = 'nx-spec'; el.setAttribute('data-i18n', 'net');
      el.innerHTML = '<b>SPECTATING</b> <em translate="no"></em><small>Q/E: NEXT PLAYER · V: VIEW</small><button type="button">LEAVE</button>';
      el.querySelector('button').addEventListener('click', () => { try { r.finish(false); } catch (e) { /* ok */ } });
      ['pointerdown', 'mousedown', 'touchstart'].forEach((n) => el.addEventListener(n, (e) => e.stopPropagation(), { passive: true }));
      L.appendChild(el); this.offs.push(() => el.remove());
      const cb = document.createElement('button'); cb.type = 'button'; cb.className = 'nx-specn'; cb.textContent = '▶'; cb.addEventListener('click', () => this.specPick(1)); el.appendChild(cb);
    }
    specList() { return Array.from(this.remotes.values()).filter((m) => m.rem.got && !m.rem.dead).map((m) => m.slot).sort((a, b) => a - b); }
    specPick(d) { const l = this.specList(); if (!l.length) return; const i = l.indexOf(this.sp.slot); this.sp.slot = l[(i + d + l.length) % l.length]; }
    specTick(dt) {
      const r = this.run, S = this.sp; if (!S || !r.camera) return;
      r.god = true; if (!S.frozen) { S.frozen = true; r.hacking = true; r.syncLock && r.syncLock(); }
      if (!S.cf) S.cf = { pos: r.camera.position.clone(), look: new THREE.Vector3(), fov: r.camera.fov, roll: 0 };
      const l = this.specList(); if (S.slot <= 0 || l.indexOf(S.slot) < 0) { S.slot = l[0] || 0; S.yaw0 = undefined; }
      const m = S.slot ? this.remotes.get(S.slot) : null, cf = S.cf; r.camFree = cf;
      this.spEl.querySelector('em').textContent = m ? this.ffName(S.slot) + '  ' + Math.round(m.rem.hp) + '%  ' + String(m.rem.w || '').toUpperCase() : '';
      if (!m) return;
      const R = m.rem, ex = Math.min(0.1, (performance.now() - (R.pt0 || performance.now())) / 1000), px = R.x + (R.vx || 0) * ex, pz = R.z + (R.vz || 0) * ex, ey = R.crouch ? 1.1 : 1.6, k = 1 - Math.exp(-dt * 16);
      if (S.yaw0 === undefined) { S.yaw0 = R.yaw; S.pit0 = R.pitch || 0; cf.pos.set(px, ey, pz); }
      let dy = R.yaw - S.yaw0; dy -= Math.round(dy / 6.2832) * 6.2832; S.yaw0 += dy * k; S.pit0 += ((R.pitch || 0) - S.pit0) * k;
      if (S.fp) {
        cf.pos.x += (px - Math.sin(S.yaw0) * 0.1 - cf.pos.x) * k; cf.pos.y += (ey - cf.pos.y) * k; cf.pos.z += (pz - Math.cos(S.yaw0) * 0.1 - cf.pos.z) * k;
        const cp = Math.cos(S.pit0); cf.look.set(cf.pos.x - Math.sin(S.yaw0) * cp * 3, cf.pos.y + Math.sin(S.pit0) * 3, cf.pos.z - Math.cos(S.yaw0) * cp * 3); cf.fov = 74;
      } else {
        cf.pos.x += (px + Math.sin(S.yaw0) * 2.8 - cf.pos.x) * k * 0.4; cf.pos.y += (2.0 - cf.pos.y) * k * 0.4; cf.pos.z += (pz + Math.cos(S.yaw0) * 2.8 - cf.pos.z) * k * 0.4;
        cf.look.set(px, 1.2, pz); cf.fov = 64;
      }
      cf.roll = 0;
    }
    ffTick() {
      const r = this.run, cb = r.cb; if (!cb || !this.ffAvail || this.solo) return;
      if (this.host && this.ff) this.histPush();
      this.remotes.forEach((m) => {
        const s = m.ffT || (m.ffT = { alive: false, shape: 'cyl', x: 0, y: 0, z: 0, r: 0.36, h: 1.75, hr: 0.17, hy: 1.62, hp: 100, ally: true, damage: (amt, head, pt) => this.ffHit(m, amt, head, pt) });
        const on = this.ff && !r.dead && m.rem.got && !m.rem.dead && !this.gone;
        s.x = m.rem.x; s.z = m.rem.z; s.h = m.rem.crouch ? 1.2 : 1.75; s.hy = m.rem.crouch ? 1.1 : 1.62; s.alive = on;
        const i = cb.shoot.indexOf(s); if (on && i < 0) cb.shoot.push(s); else if (!on && i >= 0) cb.shoot.splice(i, 1);
      });
      if (!this.host) return;
      const now = performance.now();
      Object.keys(this.ffLast).forEach((k) => {
        const f = this.ffLast[k]; if (f.done) { if (now - f.t > 5000) delete this.ffLast[k]; return; }
        const t = +k, dead = t === 1 ? r.dead : (this.remotes.get(t) || { rem: {} }).rem.dead;
        if (dead && now - f.t < 2500) { f.done = true; NN.sendAction({ type: 'cev', k: 'ffk', a: f.by, t }); this.ffKillMsg(f.by, t); }
        else if (now - f.t > 2500) delete this.ffLast[k];
      });
    }
    ffName(s) { const q = NN.players.find((x) => x.slot === s); return String((q && q.name) || 'PLAYER ' + s).toUpperCase().slice(0, 14); }
    ffKillMsg(a, t) { this.note(a === this.slot ? 'YOU KILLED AN ALLY' : this.ffName(a) + ' KILLED ' + (t === this.slot ? 'YOU' : this.ffName(t)), 3); }
    ffHit(m, amt, head, pt) {
      const r = this.run, w = r.wp; if (!this.ff || this.solo || !(amt > 0)) return;
      if (pt && r.bloodSplatTorso) { try { r.bloodSplatTorso({ x: pt.x, z: pt.z }, 1); } catch (e) { /* только картинка */ } }
      if (this.host) this.ffApply(1, m.slot, amt, w && w.id, head);
      else NN.sendAction({ type: 'ffh', t: m.slot, d: Math.round(amt * 10) / 10, w: w ? w.id : '', h: head ? 1 : 0 });
    }
    onFfh(p) { if (this.host && this.shared) this.ffApply(p.from | 0, p.t | 0, num(p.d), String(p.w || '').slice(0, 12), !!p.h); }
    ffApply(att, tgt, d, wid, head) {
      const r = this.run; if (!this.ff || !this.ffAvail || this.solo || att === tgt || !(d > 0)) return false;
      const pos = (s) => (s === 1 ? { x: r.p.x, z: r.p.z, dead: r.dead, got: true } : (this.remotes.get(s) || {}).rem);
      const A = pos(att), T = pos(tgt); if (!A || !T || !A.got || !T.got || T.dead) return false;
      const boom = wid === 'boom'; if (A.dead && !boom) return false;
      let Tp = T;
      if (!boom) { const ls = NN.linkStats && NN.linkStats().links.find((l) => l.slot === att), back = Math.min(150, ((ls && ls.avg) || NN.rtt || 0) / 2 + 60), h = this.posAt(tgt, back); if (h) Tp = { x: h.x, z: h.z }; }
      const W = C.WEAPONS && C.WEAPONS[wid];
      if (!boom && !W) return false;
      const dist = Math.hypot(A.x - Tp.x, A.z - Tp.z);
      if (dist > (boom ? 40 : W.range + 6)) return false;
      d = Math.min(d, boom ? 200 : W.dmg * (head ? 2.4 : 1) * 1.1 + 1);
      const now = performance.now(), b = this.ffRate.get(att) || { t: now, n: 0 };
      if (now - b.t > 1000) { b.t = now; b.n = 0; } this.ffRate.set(att, b); if (++b.n > (boom ? 30 : 12 * Math.max(1, W.pellets || 1))) return false;
      if (!boom && !r.hasLOS(A.x, 1.5, A.z, Tp.x, 1.2, Tp.z)) return false;
      d *= this.ffm; this.ffLast[tgt] = { by: att, t: now };
      if (tgt === 1) r.hurt(d, A.x, A.z); else NN.sendAction({ type: 'hurt', a: Math.round(d * 10) / 10, x: q(A.x, 10), z: q(A.z, 10) }, { to: tgt });
      return true;
    }
    ffBoom(x, y, z, R, dmg) {
      const r = this.run; if (!this.ff || this.solo || !this.ffAvail) return;
      const oy = clamp(y, 0.45, 1.4);
      this.remotes.forEach((m) => {
        const R0 = m.rem; if (!R0.got || R0.dead) return;
        const d = Math.hypot(R0.x - x, R0.z - z); if (d >= R) return;
        const f = (d < R * 0.22 ? 1.6 : 1 - d / R) * (r.hasLOS(x, oy, z, R0.x, 1.2, R0.z) ? 1 : 0.35), amt = Math.min(60, dmg * 0.6 * f);
        if (this.host) this.ffApply(1, m.slot, amt, 'boom', false); else NN.sendAction({ type: 'ffh', t: m.slot, d: Math.round(amt * 10) / 10, w: 'boom', h: 0 });
      });
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
      if (r.entered && !this.story) this.seedOff();
      if (this.ready && !this.solo) this.remotes.forEach((m) => { if (!m.av && m.rem.got) this.buildAvatar(m); });
      if (this.pq.length && this.ready) { const L = this.pq.splice(0); L.forEach((x) => (x[0] === 's' ? this.onSpawn(x[1]) : this.onKill(x[1]))); }
      if (!this.ready) { if (r.entered && r.scene) this.onReady(); else return; }
      this.sendState(dt);
      this.sendSnap(dt);
      this.puppets(dt);
      if (r.updateNpcBlood) r.updateNpcBlood(dt);
      this.grenades(dt);
      if (this.story && !this.host) this.expireProv();
      this.cineSync();
      this.ffTick(); if (this.spectator) this.specTick(dt);
      this.updateAvatars(dt);
      // свои эмоции: сообщаем остальным о начале и конце танца
      const es = r.em && r.em.ses;
      if (es && (!this.lastEm || this.lastEm !== es)) { this.lastEm = es; if (!this.solo) NN.sendAction({ type: 'cev', k: 'emote', id: es.id }); }
      else if (!es && this.lastEm) { this.lastEm = null; if (!this.solo) NN.sendAction({ type: 'cev', k: 'emoteoff' }); }
      // плашки напарников (4 раза в секунду)
      this.hudT += dt;
      if (this.hudT > 0.25) {
        this.hudT = 0;
        const v = NN.voice.state;
        this.remotes.forEach((m) => {
          const w = m.who, R = m.rem;
          if (w && !w.hidden) {
            { const hw = (R.dead ? 0 : R.hp) + '%', hi = w.querySelector('.hp i'); if (hi.__w !== hw) { hi.__w = hw; hi.style.width = hw; } }
            w.querySelector('.talk').classList.toggle('on', !!v.peerSpeaking);
            w.querySelector('.st').textContent = R.dead ? '✖' : (NN.pingText ? NN.pingText(m.slot) : NN.rtt ? NN.rtt + ' ms' : '');
          }
        });
        this.updBtns();
      }
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.seedOff();
      this.offs.forEach((f) => { try { f(); } catch (e) { /* ok */ } }); this.offs = [];
      this.remotes.forEach((m) => this.stopRemoteEmote(m));
      if (this.chatOpen) { this.run.hacking = false; this.chatOpen = false; }
      if (!this.solo && NN.connected) NN.sendAction({ type: 'cev', k: 'leave' });
      if (cur === this) cur = null;
    }
  }

  // ------------------------------------------------------------------ подмена методов Run (минимальные обёртки, логика боя не тронута)
  const start0 = window.Missions.start;
  let actsWrapped = false;
  const wrapActs = () => {
    const F = C.f48; if (actsWrapped || !F || !F.PH) return; actsWrapped = true;
    (F.ORDER || []).forEach((name) => {
      const o = F.PH[name]; if (typeof o !== 'function') return;
      F.PH[name] = async function (r) {
        await null;
        const co = r && r.__co, on = co && co.mode === 'mission' && !co.solo;
        if (on) { co.cinN = 0; co.act = name; await co.barrierKey('s:' + name, 45000); }
        const v = await o.apply(this, arguments);
        if (on && !r.disposed) await co.barrierKey('a:' + name, 60000);
        return v;
      };
    });
  };
  window.Missions.start = function (taskId, opts) {
    const spec = opts && opts.coop;
    if (spec && !spec.solo && String(taskId) === '48') wrapActs();
    const run = start0.call(this, taskId, opts);
    if (run && spec && !spec.solo) { const co = new Session(run, spec); run.__co = co; cur = co; }
    return run;
  };
  const wrap1 = (name, fn) => { const o = P[name]; if (typeof o !== 'function') return; P[name] = function () { return fn.call(this, o, arguments); }; };
  wrap1('damageEnemy', function (o, a) {
    const co = this.__co, e = a[0];
    if (co && e) {
      if (e.puppet) { co.puppetHit(e, a[1], a[2], a[3]); return undefined; }
      if (e.nid) { e.lastBy = co.dmgBy; e.noCredit = co.dmgBy !== co.slot; }   // убийство засчитывается тому, кто стрелял
    }
    return o.apply(this, a);
  });
  wrap1('frame', function (o, a) {
    const co = this.__co;
    if (!co || !co.rng0 || !co.story || Math.random !== co.proxy) return o.apply(this, a);
    Math.random = co.rng0;
    try { return o.apply(this, a); } finally { if (co.rng0) Math.random = co.proxy; }
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
  wrap1('throwGadget', function (o, a) {
    const co = this.__co; if (co) co.gt = { id: a[0], t: this.time };
    const res = o.apply(this, a);
    const th = this.gad && this.gad.thrown, g = th && th[th.length - 1];
    if (co && !co.solo && NN.connected && g && g.id === a[0]) NN.sendAction({ type: 'gr', k: g.id === 'frag' ? 1 : 0, x: q(g.x, 100), y: q(g.y, 100), z: q(g.z, 100), vx: q(g.vx, 100), vy: q(g.vy, 100), vz: q(g.vz, 100) });
    return res;
  });
  wrap1('plantC4', function (o, a) { const co = this.__co; if (co) co.gt = { id: 'c4', t: this.time }; return o.apply(this, a); });
  wrap1('explode', function (o, a) {
    const co = this.__co, res = o.apply(this, a);
    if (co && co.ff && !co.solo && co.gt && this.time - co.gt.t < (co.gt.id === 'c4' ? 60 : 6)) co.ffBoom(a[0], a[1], a[2], a[3] || 4, a[4] || 0);
    return res;
  });
  wrap1('bloodSplatTorso', function (o, a) {
    const co = this.__co, d = a[0];
    if (co && !co.solo && NN.connected && d) NN.sendAction({ type: 'bl', x: q(d.x, 100), z: q(d.z, 100), a: q(a[1] === undefined ? 1 : a[1], 10) });
    return o.apply(this, a);
  });
  wrap1('explode', function (o, a) {
    const co = this.__co;
    if (co && !co.solo && NN.connected) NN.sendAction({ type: 'boom', x: q(a[0], 10), y: q(a[1], 10), z: q(a[2], 10), r: q(a[3] || 4, 10), k: a[5] });
    return o.apply(this, a);
  });
  // общая песочница: смерть игрока не должна стирать врагов у обоих — clearEnemies в coopbox пропускаем (волны ведёт Хост)
  wrap1('clearEnemies', function (o, a) {
    const co = this.__co;
    if (co && co.story && !co.solo) {
      if (co.host) co.byId.forEach((e) => { if (!e.dead && e.nid > 0) NN.sendAction({ type: 'egone', i: e.nid }); });
      co.byId.clear();
      return o.apply(this, a);
    }
    if (co && co.shared && co.ready && !this.disposed) return undefined;
    return o.apply(this, a);
  });
  wrap1('enemy', function (o, a) {
    const co = this.__co;
    if (!co || !co.story || co.solo || co.noReg) return o.apply(this, a);
    const t = a[0], op = a[3] || {};
    const key = op.noSync ? undefined : co.ekey(t);
    if (!co.host) { const ex = co.claimOrphan(t, a[1], a[2], op, key); if (ex) return ex; }
    const e = o.apply(this, a);
    if (!co.khook && this.cb) { co.khook = true; this.cb.killHooks.push((en, head) => { if (co.host && en.nid > 0) co.sendKill(en, head); }); }
    return e && !op.noSync ? co.storyEnemy(e, op, a, key) : e;
  });
  wrap1('pickup', function (o, a) { const co = this.__co; if (co && co.dropCap && (a[2] === 'ammo' || a[2] === 'health')) co.dropCap.push([a[2], q(a[0], 50), q(a[1], 50)]); return o.apply(this, a); });
  wrap1('killEnemy', function (o, a) {
    const co = this.__co;
    if (co && co.story && co.host && !co.solo && a[0] && a[0].nid > 0) { co.dropCap = []; try { return o.apply(this, a); } finally { co.dropCap = null; } }
    return o.apply(this, a);
  });
  wrap1('phase', function (o, a) { const co = this.__co; if (co && co.catchUp && co.catchUp() && typeof a[1] === 'function') a = [a[0], () => Promise.resolve()].concat(Array.prototype.slice.call(a, 2)); const p = o.apply(this, a); return co && co.mode === 'mission' && !co.solo ? p.then((v) => co.barrier().then(() => v)) : p; });
  wrap1('cinematic', function (o, a) {
    const co = this.__co;
    if (co && co.mode === 'mission' && !co.solo && String(this.taskId) === '48' && !this.inCinema && !this.cineInsert) return co.barrierKey('c:' + co.act + ':' + (++co.cinN), 20000).then(() => o.apply(this, a));
    return o.apply(this, a);
  });
  wrap1('dispose', function (o, a) { const co = this.__co; if (co) { try { co.dispose(); } catch (e) { /* ok */ } } return o.apply(this, a); });

  window.NexaCoop = {
    prepare(spec) { pendingSpec = spec; },
    puppetStats() {
      if (!cur || !cur.xs) return '';
      const t = cur.xs.ex + cur.xs.ip, r = t ? Math.round(100 * cur.xs.ex / t) : 0, d = Array.from(cur.remotes.values()).map((m) => Math.round(m.rem.dly || 0)).join('/');
      cur.xs.ex = cur.xs.ip = 0; return ' puppet-extrap=' + r + '% buf=' + d + 'ms';
    },
    end() { pendingSpec = null; if (cur) { cur.dispose(); cur = null; } },
    get active() { return !!(cur && !cur.solo && NN.connected); },
    get session() { return cur; },
    status() {
      const s = cur; if (!s) return null;
      const ms = Array.from(s.remotes.values()), m0 = ms[0];
      return { mode: s.mode, host: s.host, slot: s.slot, ready: s.ready, peerReady: s.peerReady, solo: s.solo, avatar: !!(m0 && m0.av), shown: !!(m0 && m0.av && m0.av.n.g.visible), remote: m0 ? { x: m0.rem.x, z: m0.rem.z, w: m0.rem.w, hp: m0.rem.hp, dead: m0.rem.dead, got: m0.rem.got } : null,
        remotes: ms.map((m) => ({ slot: m.slot, name: m.name, shown: !!(m.av && m.av.n.g.visible), got: m.rem.got, x: m.rem.x, z: m.rem.z, emote: m.emo ? m.emo.id : null, hp: m.rem.hp })),
        enemies: s.byId.size, puppets: Array.from(s.byId.values()).filter((e) => e.puppet).length, wave: s.wave ? s.wave.wave : (s.waveNo || 0), emote: m0 && m0.emo ? m0.emo.id : null };
    }
  };
}());
