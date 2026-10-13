// NEXA: рабочий стол NEXA/OS за компьютером в комнате («FPP Focus»). Клавиша из assets/fpp-config.json (computer_interaction_key, по умолчанию E) у ПК:
// камера плавно подлетает к монитору, управление блокируется (режим r.hacking — как у взлома: бой идёт в реальном времени, попадание «обрывает связь»),
// поверх экрана раскрывается DOM-рабочий стол в теме desktop_theme_id (dark_nexus): браузер с НАСТОЯЩИМ Google (iframe https://www.google.com/webhp?igu=1 —
// без параметра igu=1 Google присылает X-Frame-Options: SAMEORIGIN и во фрейме не открывается), история поиска жильца (зависит от его характера;
// клик по записи ищет её в настоящем Google), приложение «Камера» (живая картинка с вебки монитора) и блокнот.
// Страница Google грузится только после открытия окна «Браузер»; кнопка ↗ открывает search_engine_default_url в новой вкладке.
// Esc — отойти от компьютера (внутри фрейма клавиши принадлежит Google: тогда — кнопка «ESC — step away» на панели задач). Подключается после webcam.js (PCSys).
// Строки — в js/i18n-pc.js.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  const PCSys = window.PCSys;
  if (!C || !C.Run || !PCSys) return;
  const P = C.Run.prototype, PI = Math.PI;
  const cfg = () => (window.FPP && window.FPP.cfg) || {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => k * k * (3 - 2 * k);
  const wrap = (a) => ((a + PI) % (PI * 2) + PI * 2) % (PI * 2) - PI;
  const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const FOCUS_FOV = 42, FLY_T = 0.75, FILL = 0.84, STAGE_W = 960, STAGE_H = 760;
  let ACTIVE = null;                                                    // run с открытым рабочим столом (для перехвата Esc)
  const MIN_T0 = 3 * 60 + 41;                                           // «время в игре» на часах рабочего стола в начале миссии

  // ------------------------------------------------------------------ данные: «пред-история» браузера жильца
  // Что искал тот, кто сидел за этим ПК (общие + по характеру жильца: lazy / pro / sadist). Запросы английские — i18n-pc.js переводит их на RU/DE
  const HIST_COMMON = ['how to block a door against a raid', 'tea recipe', 'is today friday', 'how to barricade a door'];
  const HIST_BY = {
    lazy: ['how to look busy at work', 'pizza delivery near me', 'why does my monitor flicker', 'weather tomorrow', 'guest wifi password'],
    pro: ['emergency exits floor plan', 'tactical breach procedure', 'can I call the police during a lockdown', 'what to do when the team enters', 'sector access levels'],
    sadist: ['tactical breach procedure', 'what to do when the team enters', 'rm -rf /', 'plush bear sighting', 'hello world']
  };
  // блокнот: общий список + строки по характеру
  const NOTE_BY = {
    lazy: ['☐ Nap after lunch', '☐ Pretend the monitor is broken'],
    pro: ['☐ Check the door sensors', '☐ Re-read the evacuation protocol'],
    sadist: ['☐ Sharpen the pocket knife', '☐ Let them come']
  };

  // ------------------------------------------------------------------ оформление
  const THEMES = {
    dark_nexus: {
      '--bg': '#0b0d11', '--bg2': '#0f1318', '--panel': '#161b23', '--panel2': '#1e2530', '--line': '#2a323e', '--text': '#e6e9ee', '--dim': '#8c97a6',
      '--acc': '#9ad0ff', '--onacc': '#06101a', '--hot': '#ff6b5e', '--ok': '#7ddc9a',
      '--wall': 'radial-gradient(ellipse at 30% 20%, #1a2230 0%, #0b0d11 70%), #0b0d11', '--ghost': 'rgba(255,255,255,.05)'
    },
    nexus_light: {
      '--bg': '#dfe3e8', '--bg2': '#f3f5f7', '--panel': '#e9edf1', '--panel2': '#d6dce3', '--line': '#b9c2cc', '--text': '#141a22', '--dim': '#56626f',
      '--acc': '#1d6fb8', '--onacc': '#ffffff', '--hot': '#c93b2e', '--ok': '#23804a',
      '--wall': 'linear-gradient(135deg, #c9d3de, #e9eef3)', '--ghost': 'rgba(0,0,0,.06)'
    }
  };
  const CSS = [
    '.pcd{position:absolute;inset:0;z-index:8;pointer-events:auto;opacity:0;transition:opacity .4s}',
    '.pcd.on{opacity:1}',
    '.pcd-stage{position:absolute;left:0;top:0;width:' + STAGE_W + 'px;height:' + STAGE_H + 'px;transform-origin:0 0;overflow:hidden;background:var(--bg);color:var(--text);font:14px/1.4 "Segoe UI","Helvetica Neue",Roboto,Arial,sans-serif;letter-spacing:0;text-transform:none;text-align:left;user-select:none;-webkit-user-select:none;border-radius:3px}',
    '.pcd-stage *{box-sizing:border-box;font-family:inherit;letter-spacing:inherit;text-transform:none}',
    '.pcd-stage button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0;text-align:left}',
    '.pcd-stage input[type=text]{user-select:text;-webkit-user-select:text;font:inherit}',
    '.pcd-wall{position:absolute;inset:0 0 40px 0;background:var(--wall)}',
    '.pcd-wall::before{content:"NEXA/OS";position:absolute;right:34px;bottom:26px;font:700 66px/1 "Segoe UI",sans-serif;letter-spacing:.14em;color:var(--ghost)}',
    '.pcd-wall::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.025) 0 1px,transparent 1px 48px),repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 1px,transparent 1px 48px)}',
    '.pcd-icons{position:absolute;left:14px;top:14px;display:grid;gap:8px;z-index:2}',
    '.pcd-ico{width:96px;height:92px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border-radius:6px;font-size:13px;text-align:center!important}',
    '.pcd-ico:hover{background:rgba(255,255,255,.09)}',
    '.pcd-ico svg{width:38px;height:38px;color:var(--acc)}',
    '.pcd-wins{position:absolute;inset:0 0 40px 0;z-index:3;pointer-events:none}',
    '.pcd-win{position:absolute;display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line);border-radius:6px;box-shadow:0 14px 40px rgba(0,0,0,.55);overflow:hidden;pointer-events:auto}',
    '.pcd-bar{height:32px;display:flex;align-items:center;gap:8px;padding:0 5px 0 11px;background:var(--panel2);cursor:grab;flex:none}',
    '.pcd-bar svg{width:16px;height:16px;color:var(--acc);flex:none}',
    '.pcd-bar b{font-weight:600;font-size:13px;flex:1;white-space:nowrap;overflow:hidden}',
    '.pcd-x{width:30px;height:24px;border-radius:4px;color:var(--dim);text-align:center!important}',
    '.pcd-x:hover{background:var(--hot);color:#fff}',
    '.pcd-body{flex:1;min-height:0;display:flex;flex-direction:column;position:relative}',
    '.pcd-tool{display:flex;gap:6px;padding:7px 8px;background:var(--panel);border-bottom:1px solid var(--line);flex:none}',
    '.pcd-nav{width:32px;height:28px;border-radius:4px;background:var(--panel2);display:grid;place-items:center}',
    '.pcd-nav svg{width:16px;height:16px}',
    '.pcd-nav[hidden]{display:none}',
    '.pcd-nav:hover:not(:disabled){background:var(--line)} .pcd-nav:disabled{opacity:.3;cursor:default}',
    '.pcd-addr{flex:1;min-width:0;height:28px;display:flex;align-items:center;margin:0;padding:0 12px;border-radius:14px;background:var(--bg2);color:var(--dim);font-size:13px;white-space:nowrap;overflow:hidden;border:1px solid transparent}',
    '.pcd-addr input{flex:1;min-width:0;height:100%;padding:0;margin:0;background:none;border:0;outline:0;color:inherit;font:inherit;cursor:text}',
    '.pcd-addr:focus-within{border-color:var(--acc);color:var(--fg,#e8e8e8)}',
    '.pcd-frame{flex:1;min-height:0;position:relative;background:var(--bg2)}',
    '.pcd-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}',
    '.pcd-stage.drag iframe{pointer-events:none}',
    '.pcd-load{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--dim);font-size:14px;text-align:center!important;padding:0 44px}',
    '.pcd-load i{width:26px;height:26px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--acc);animation:pcdspin .8s linear infinite}',
    '.pcd-load.fail i{display:none}',
    '@keyframes pcdspin{to{transform:rotate(360deg)}}',
    '.pcd-hp{position:absolute;right:8px;top:6px;width:390px;max-height:88%;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px 10px 6px;box-shadow:0 12px 32px rgba(0,0,0,.6);z-index:5;scrollbar-width:thin}',
    '.pcd-hp[hidden]{display:none}',
    '.pcd-h2{font-size:18px;font-weight:600;display:flex;justify-content:space-between;align-items:center;padding:0 6px}',
    '.pcd-h2 button{font-size:13px;color:var(--acc)}',
    '.pcd-hl{margin:8px 0 0}',
    '.pcd-hi{display:flex;gap:14px;width:100%;padding:9px 6px;border-bottom:1px solid var(--line);border-radius:4px}',
    '.pcd-hi:hover{background:var(--panel2)} .pcd-hi i{font-style:normal;color:var(--dim);width:46px;flex:none;font-variant-numeric:tabular-nums}',
    '.pcd-empty{color:var(--dim);margin:26px 0;text-align:center!important}',
    '.pcd-camw{background:#000;position:relative;flex:1;min-height:0;display:grid;place-items:center}',
    '.pcd-camw canvas{width:100%;height:100%;object-fit:contain;filter:grayscale(.5) contrast(1.1) sepia(.18) brightness(.95)}',
    '.pcd-camw::after{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px)}',
    '.pcd-cov{position:absolute;left:12px;right:12px;top:10px;display:flex;justify-content:space-between;font:700 15px Consolas,"Courier New",monospace;color:#fff;text-shadow:0 0 4px #000;z-index:2;pointer-events:none}',
    '.pcd-cov i{display:inline-block;width:10px;height:10px;border-radius:50%;background:#e8261c;margin-right:6px;animation:pcdrec 1s steps(1) infinite}',
    '@keyframes pcdrec{50%{opacity:0}}',
    '.pcd-cst{padding:8px 12px;display:flex;justify-content:space-between;font:700 13px Consolas,"Courier New",monospace;background:var(--panel);flex:none}',
    '.pcd-note{padding:18px 22px;overflow:auto;font:15px/1.7 Consolas,"Courier New",monospace;background:#f2e9a8;color:#2b2610;flex:1}',
    '.pcd-note h5{margin:14px 0 2px;font:700 12px/1.2 "Segoe UI",sans-serif;letter-spacing:.14em;color:#6b5f1a}',
    '.pcd-note h5:first-child{margin-top:0}',
    '.pcd-note div{white-space:pre-wrap}',
    '.pcd-task{position:absolute;left:0;right:0;bottom:0;height:40px;display:flex;align-items:center;gap:6px;padding:0 8px;background:var(--panel);border-top:1px solid var(--line);z-index:40}',
    '.pcd-start{height:30px;padding:0 14px!important;border-radius:4px;background:var(--acc)!important;color:var(--onacc)!important;font-weight:700;letter-spacing:.1em!important;font-size:12px}',
    '.pcd-tbs{display:flex;gap:6px}',
    '.pcd-tb{height:30px;padding:0 14px!important;border-radius:4px;background:var(--panel2)!important;font-size:13px;display:flex;align-items:center}',
    '.pcd-tb.act{box-shadow:inset 0 -2px 0 var(--acc)}',
    '.pcd-hint{margin-left:auto;color:var(--dim);font-size:12px;padding:6px 9px!important;border-radius:4px}',
    '.pcd-hint:hover{background:var(--panel2);color:var(--text)}',
    '.pcd-clock{font-variant-numeric:tabular-nums;min-width:48px;text-align:right!important;padding-right:6px}',
    '.pcd-menu{position:absolute;left:8px;bottom:44px;width:210px;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:6px;z-index:60;box-shadow:0 10px 30px rgba(0,0,0,.5)}',
    '.pcd-menu[hidden]{display:none}',
    '.pcd-menu button{display:block;width:100%;padding:9px 12px!important;border-radius:4px}',
    '.pcd-menu button:hover{background:var(--panel2)}',
    '.pcd-crt{position:absolute;inset:0;pointer-events:none;z-index:50;background:repeating-linear-gradient(0deg,rgba(0,0,0,.12) 0 1px,transparent 1px 3px),radial-gradient(ellipse at center,transparent 64%,rgba(0,0,0,.4) 100%)}',
    '.pcd-boot{position:absolute;inset:0;z-index:70;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#fff;transition:opacity .45s}',
    '.pcd-boot b{font:700 40px/1 "Segoe UI",sans-serif;letter-spacing:.3em}',
    '.pcd-boot small{color:#8c97a6;letter-spacing:.14em}',
    '.pcd-boot i{display:block;width:220px;height:3px;background:#222;border-radius:2px;overflow:hidden;position:relative}',
    '.pcd-boot i::after{content:"";position:absolute;inset:0;background:#9ad0ff;transform-origin:0 0;animation:pcdboot .8s ease-out forwards}',
    '@keyframes pcdboot{from{transform:scaleX(0)}to{transform:scaleX(1)}}',
    '.pcd-boot.off{opacity:0;pointer-events:none}'
  ].join('\n');
  function ensureCss() {
    if (document.getElementById('pcd-css')) return;
    const s = document.createElement('style'); s.id = 'pcd-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  const SV = (p) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  const ICON = {
    globe: SV('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>'),
    cam: SV('<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3"/>'),
    note: SV('<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>'),
    reload: SV('<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v5h-5"/>'), ext: SV('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    home: SV('<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>'), clock: SV('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    back: SV('<path d="M19 12H5M11 6l-6 6 6 6"/>'), fwd: SV('<path d="M5 12h14M13 6l6 6-6 6"/>')
  };

  // ------------------------------------------------------------------ вспомогательное
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  const hhmm = (m) => { m = ((Math.floor(m) % 1440) + 1440) % 1440; return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); };
  const clockTxt = (s) => { s = Math.max(0, Math.floor(s)); return pad2(Math.floor(s / 3600) % 100) + ':' + pad2(Math.floor(s / 60) % 60) + ':' + pad2(s % 60); };
  function persOf(room) {
    const o = room.occ && room.occ[0];
    return (o && o.occ && o.occ.spec && o.occ.spec.pers) || ['lazy', 'pro', 'sadist'][room.num % 3];
  }
  function makeHistory(room) {
    const rnd = mulberry(room.num * 977 + 13), pers = persOf(room), by = HIST_BY[pers] || HIST_BY.lazy;
    const shuf = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
    const list = shuf(HIST_COMMON).slice(0, 3).concat(shuf(by).slice(0, 4));
    const seen = {}, out = [];
    shuf(list).forEach((q) => { if (!seen[q]) { seen[q] = 1; out.push({ q }); } });
    let m = MIN_T0 - 1 - Math.floor(rnd() * 5);
    out.forEach((h) => { h.t = hhmm(m); m -= 3 + Math.floor(rnd() * 22); });
    return out;
  }

  // ------------------------------------------------------------------ рабочий стол
  function mount(r, D) {
    ensureCss();
    const th = THEMES[cfg().desktop_theme_id] || THEMES.dark_nexus;
    const root = document.createElement('div'); root.className = 'pcd';
    root.innerHTML = '<div class="pcd-stage">' +
      '<div class="pcd-wall"></div>' +
      '<div class="pcd-icons">' +
        '<button class="pcd-ico" data-a="app" data-app="browser">' + ICON.globe + '<span>Browser</span></button>' +
        '<button class="pcd-ico" data-a="app" data-app="camera">' + ICON.cam + '<span>Camera</span></button>' +
        '<button class="pcd-ico" data-a="app" data-app="notes">' + ICON.note + '<span>Notes</span></button>' +
      '</div>' +
      '<div class="pcd-wins"></div>' +
      '<div class="pcd-menu" hidden>' +
        '<button data-a="app" data-app="browser"><span>Browser</span></button><button data-a="app" data-app="camera"><span>Camera</span></button><button data-a="app" data-app="notes"><span>Notes</span></button><button data-a="quit"><span>Shut down</span></button>' +
      '</div>' +
      '<div class="pcd-task"><button class="pcd-start" data-a="start"><span>NEXA/OS</span></button><div class="pcd-tbs"></div><button class="pcd-hint" data-a="quit"><span>ESC — step away</span></button><span class="pcd-clock">00:00</span></div>' +
      '<div class="pcd-crt"></div>' +
      '<div class="pcd-boot"><b>NEXA/OS</b><small>4.2 · dark_nexus</small><i></i></div>' +
      '</div>';
    const stage = root.firstChild;
    Object.keys(th).forEach((k) => stage.style.setProperty(k, th[k]));
    D.root = root; D.stage = stage; D.wins = {}; D.z = 10;
    r.layer.appendChild(root);
    layout(r, D);
    bind(r, D);
  }
  // подлёт закончен: экран монитора превращается в рабочий стол
  function reveal(r, D) {
    if (D.shown || !D.root) return;
    D.shown = true;
    D.root.classList.add('on');
    sfx(r, 'notification', 0.35);
    setTimeout(() => { const b = D.stage && D.stage.querySelector('.pcd-boot'); if (b) { b.classList.add('off'); setTimeout(() => b.remove(), 520); } D.ready = true; }, 900);
  }

  function layout(r, D) {
    if (!D.stage) return;
    const vw = r.w || r.layer.clientWidth, vh = r.h || r.layer.clientHeight, th = Math.tan(FOCUS_FOV * PI / 360), asp = vw / vh;
    const sh = 0.19 / (2 * th * D.d) * vh, sw = 0.24 / (2 * th * D.d * asp) * vw;
    const s = Math.max(0.2, Math.min(sw / STAGE_W, sh / STAGE_H));
    D.s = s; D.vw = vw; D.vh = vh;
    D.stage.style.transform = 'translate(' + ((vw - STAGE_W * s) / 2) + 'px,' + ((vh - STAGE_H * s) / 2) + 'px) scale(' + s + ')';
  }

  function sfx(r, name, k) { try { r.snd && r.snd.play(name, { k: k || 0.5 }); } catch (e) { /* звук необязателен */ } }
  function keyClick(r) {
    try {
      const sn = r.snd; if (!sn || !sn.ctx) return;
      sn.noise({ t: sn.ctx.currentTime + 0.005, type: 'bandpass', f0: 2300 + Math.random() * 900, q: 1.5, dur: 0.02, g: 0.09 });
    } catch (e) { /* ignore */ }
  }

  // --- окна
  const APPS = {
    browser: { title: 'Browser', icon: 'globe', x: 116, y: 14, w: 820, h: 690 },
    camera: { title: 'Camera', icon: 'cam', x: 150, y: 84, w: 560, h: 410 },
    notes: { title: 'Notes', icon: 'note', x: 250, y: 150, w: 440, h: 440 }
  };
  function focusWin(D, id) {
    Object.keys(D.wins).forEach((k) => { D.wins[k].el.style.zIndex = ''; });
    const w = D.wins[id]; if (!w) return;
    w.el.style.zIndex = String(++D.z); w.min = false; w.el.style.display = '';
    D.stage.querySelectorAll('.pcd-tb').forEach((b) => b.classList.toggle('act', b.dataset.app === id));
  }
  function openApp(r, D, id) {
    D.stage.querySelector('.pcd-menu').hidden = true;
    if (D.wins[id]) { focusWin(D, id); return; }
    const A = APPS[id]; if (!A) return;
    const el = document.createElement('div'); el.className = 'pcd-win';
    el.style.cssText = 'left:' + A.x + 'px;top:' + A.y + 'px;width:' + A.w + 'px;height:' + A.h + 'px';
    el.innerHTML = '<div class="pcd-bar">' + ICON[A.icon] + '<b>' + A.title + '</b><button class="pcd-x" data-a="min" data-app="' + id + '">–</button><button class="pcd-x" data-a="close" data-app="' + id + '">✕</button></div><div class="pcd-body"></div>';
    D.stage.querySelector('.pcd-wins').appendChild(el);
    const w = D.wins[id] = { el, body: el.querySelector('.pcd-body'), min: false };
    const tb = document.createElement('button'); tb.className = 'pcd-tb'; tb.dataset.a = 'tb'; tb.dataset.app = id; tb.innerHTML = '<span>' + A.title + '</span>';
    D.stage.querySelector('.pcd-tbs').appendChild(tb); w.tb = tb;
    if (id === 'browser') initBrowser(r, D, w);
    else if (id === 'camera') initCamera(r, D, w);
    else initNotes(r, D, w);
    focusWin(D, id);
    sfx(r, 'tick', 0.4);
  }
  function closeApp(D, id) {
    const w = D.wins[id]; if (!w) return;
    clearTimeout(w.to); if (id === 'browser') nxCursor(false);
    w.el.remove(); w.tb.remove(); delete D.wins[id];
  }

  // --- браузер: настоящий Google и любые сайты во фрейме
  // Два режима. С локальным сервером игры (tools/serve.js, start-game.bat) работает прокси: сайт открывается как http://сайт.px.localhost:порт/…, сервер снимает запрет на показ во фрейме
  // (X-Frame-Options, CSP), подменяет ссылки на адреса прокси — клик по любой ссылке, форма, редирект остаются в игре, а страница сообщает адрес и заголовок (postMessage → адресная строка, «назад/вперёд»).
  // Без сервера (itch.io, файл, python -m http.server) — прямой фрейм: Google с igu=1 и сайты, которые сами разрешают показ во фрейме; остальные браузер блокирует, и обойти это без сервера нельзя.
  // allow-modals обязателен: без него клик по результату поиска Google во фрейме молча ничего не делает (проверено в панели). Попапов (allow-popups) и top-навигации нет —
  // ссылки открываются во фрейме, в игре, и ничто не уводит игру на другую страницу или во внешнюю вкладку. Origin сайта в прокси отличается от origin игры.
  const FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals';
  const FRAME_ALLOW = 'autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write';
  const PX = { on: false, probe: null };
  function pxProbe() {   // есть ли рядом сервер с прокси (один запрос за сессию)
    if (PX.probe) return PX.probe;
    PX.on = false;
    PX.probe = (/^https?:$/.test(location.protocol) && window.fetch ? fetch('/__px/ping', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => '') : Promise.resolve(''))
      .then((t) => { PX.on = /^nexa-px /.test(t); return PX.on; });
    return PX.probe;
  }
  const PX_SKIP = /^(?:(?:www\.)?w3\.org|localhost|(?:\d{1,3}\.){3}\d{1,3}|.*\.px\.localhost|.*\.pxh\.localhost|[^.]+)$/i;
  function pxUrl(u) {   // настоящий адрес → адрес в прокси (тот же формат, что в tools/serve.js)
    try {
      const o = new URL(u); if (o.protocol !== 'https:' && o.protocol !== 'http:' || PX_SKIP.test(o.hostname)) return u;
      const s = o.protocol === 'https:', pt = o.port && o.port !== (s ? '443' : '80') ? '.p' + o.port : '';
      return 'http://' + o.hostname.toLowerCase() + pt + (s ? '.px' : '.pxh') + '.localhost:' + (location.port || '80') + o.pathname + o.search + o.hash;
    } catch (e) { return u; }
  }
  const langHl = () => { const l = window.I18N && window.I18N.lang; return l === 'ru' || l === 'de' ? l : 'en'; };
  const withHl = (u) => u + (u.indexOf('?') >= 0 ? '&' : '?') + 'hl=' + langHl();
  const igu = () => (PX.on ? '' : 'igu=1');   // igu=1 нужен только прямому фрейму: через прокси Google открывается и так
  const homeUrl = () => { const u = String(cfg().browser_home_url || '').trim(); return withHl(/^https:\/\//i.test(u) ? u : 'https://www.google.com/webhp' + (PX.on ? '' : '?igu=1')); };
  function searchUrl(q) {
    let b = String(cfg().browser_search_url || '').trim();
    if (!/^https:\/\//i.test(b) || b.indexOf('{q}') < 0) b = 'https://www.google.com/search?' + (PX.on ? '' : igu() + '&') + 'q={q}';
    return withHl(b.replace('{q}', encodeURIComponent(q)));
  }
  const extUrl = (w) => { const c = w && w.cur; if (c && /^https?:\/\//i.test(c)) return c; const b = String(cfg().search_engine_default_url || 'https://google.com').trim(); return /^https?:\/\//i.test(b) ? b : null; };
  // адресная строка: «слова» — поиск в Google, адрес вида host.tld — открыть сайт; остальное во фрейме открывают сами страницы (клик по ссылке — там же, в игре)
  function resolveAddr(s) {
    s = String(s || '').trim(); if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    if (!/\s/.test(s) && /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([\/?#].*)?$/i.test(s)) return 'https://' + s;
    return searchUrl(s);
  }
  function shownUrl(u) {
    try {
      const o = new URL(u);
      if (/(^|\.)google\.[a-z.]+$/i.test(o.hostname)) { const q = o.searchParams.get('q'); return o.hostname + (q ? '/search?q=' + q : ''); }
      return o.hostname + (o.pathname === '/' ? '' : o.pathname) + o.search;
    } catch (e) { return u; }
  }
  const nxCursor = (hide) => { const c = document.getElementById('nx-cursor'); if (c) c.style.opacity = hide ? '0' : ''; };   // над фреймом курсор рисует сама страница

  function initBrowser(r, D, w) {
    w.body.innerHTML = '<div class="pcd-tool">' +
      '<button class="pcd-nav pcd-px" data-a="back" title="Back" hidden>' + ICON.back + '</button><button class="pcd-nav pcd-px" data-a="fwd" title="Forward" hidden>' + ICON.fwd + '</button>' +
      '<button class="pcd-nav" data-a="home" title="Home">' + ICON.home + '</button><button class="pcd-nav" data-a="reload" title="Reload">' + ICON.reload + '</button>' +
      '<form class="pcd-addr" autocomplete="off"><input type="text" spellcheck="false" autocapitalize="off" placeholder="Search Google or type a URL" value="www.google.com"></form>' +
      '<button class="pcd-nav" data-a="hist" title="History">' + ICON.clock + '</button><button class="pcd-nav" data-a="ext" title="Open in a new tab">' + ICON.ext + '</button></div>' +
      '<div class="pcd-frame"><div class="pcd-load"><i></i><span>Loading…</span></div><div class="pcd-hp" hidden></div></div>';
    const box = w.body.querySelector('.pcd-frame');
    w.ld = box.querySelector('.pcd-load'); w.hp = box.querySelector('.pcd-hp'); w.ad = w.body.querySelector('.pcd-addr input');
    w.body.querySelector('.pcd-addr').addEventListener('submit', (e) => { e.preventDefault(); const u = resolveAddr(w.ad.value); if (u) { brGo(w, u); w.ad.blur(); } });
    w.ad.addEventListener('focus', () => { try { w.ad.select(); } catch (er) { /* нет выделения */ } });
    const fr = document.createElement('iframe');
    fr.setAttribute('sandbox', FRAME_SANDBOX); fr.setAttribute('referrerpolicy', 'no-referrer'); fr.setAttribute('title', 'Browser'); fr.setAttribute('allow', FRAME_ALLOW); fr.setAttribute('allowfullscreen', '');
    fr.addEventListener('load', () => { w.loaded = true; clearTimeout(w.to); w.ld.hidden = true; });
    fr.addEventListener('mouseenter', () => nxCursor(true)); fr.addEventListener('mouseleave', () => nxCursor(false));
    w.fr = fr; box.insertBefore(fr, w.hp);
    pxProbe().then(() => {      // сначала выясняем, есть ли прокси: от этого зависят адреса Google и кнопки «назад/вперёд»
      if (!D.wins.browser || D.wins.browser !== w) return;
      w.body.querySelectorAll('.pcd-px').forEach((b) => { b.hidden = !PX.on; });
      brGo(w, homeUrl());
    });
  }
  function brGo(w, url) {
    w.cur = url; w.loaded = false; w.ld.hidden = false; w.ld.classList.remove('fail');
    w.ld.lastChild.textContent = 'Loading…'; if (w.ad) w.ad.value = shownUrl(url);
    clearTimeout(w.to);
    w.to = setTimeout(() => { if (w.loaded || !w.ld) return; w.ld.classList.add('fail'); w.ld.lastChild.textContent = 'Could not load the page. Check your connection, or use ↗ to open it in a new tab.'; }, 20000);
    w.fr.src = PX.on ? pxUrl(url) : url;
    if (w.hp) w.hp.hidden = true;
  }
  // страница в прокси (скрипт из tools/serve.js) сообщает настоящий адрес и заголовок: обновляем адресную строку
  function brMsg(D, e) {
    const w = D.wins.browser, d = e.data;
    if (!w || !w.fr || e.source !== w.fr.contentWindow || !d || d.nxpx !== 1 || typeof d.url !== 'string' || !/^https?:\/\//i.test(d.url)) return;
    w.cur = d.url; w.title = String(d.title || '').slice(0, 120);
    if (w.ad && document.activeElement !== w.ad) w.ad.value = shownUrl(d.url);
    w.loaded = true; clearTimeout(w.to);
  }
  function brCmd(w, cmd) { try { w.fr.contentWindow.postMessage({ nxpx: cmd }, '*'); } catch (e) { /* фрейм ещё не готов */ } }
  function renderHist(D, w) {
    w.hp.innerHTML = '<div class="pcd-h2"><span>History</span><button data-a="clear"><span>Clear history</span></button></div><div class="pcd-hl">' +
      (D.hist.length ? D.hist.map((x) => '<button class="pcd-hi" data-a="q" data-q="' + esc(x.q) + '"><i>' + x.t + '</i><span>' + esc(x.q) + '</span></button>').join('') : '<div class="pcd-empty">Nothing here. Somebody was here before you.</div>') + '</div>';
  }

  // --- камера
  function initCamera(r, D, w) {
    w.body.innerHTML = '<div class="pcd-camw"><canvas width="448" height="252"></canvas><div class="pcd-cov"><span><i></i>REC</span><time>00:00:00</time></div></div><div class="pcd-cst"><span class="cs1"></span><span class="cs2"></span></div>';
    w.cv = w.body.querySelector('canvas'); w.tm = w.body.querySelector('time'); w.s1 = w.body.querySelector('.cs1'); w.s2 = w.body.querySelector('.cs2');
    w.s2.textContent = 'CAM ' + pad2(D.W.num) + ' · ROOM ' + D.W.room.num; w.ct = 0; w.last = '';
  }
  function tickCamera(r, D, dt) {
    const w = D.wins.camera; if (!w || w.min) return;
    w.ct -= dt;
    if (w.ct > 0) return;
    w.ct = 0.11;
    try { PCSys.grab(r, D.W, w.cv); } catch (e) { w.ct = 5; }
    w.tm.textContent = clockTxt(r.time);
    const st = PCSys.subject(D.W.room);
    if (w.last !== st[0]) { w.last = st[0]; w.s1.textContent = st[0]; w.s1.style.color = st[1]; }
  }

  // --- блокнот
  function initNotes(r, D, w) {
    const ln = (a) => a.map((s) => '<div>' + esc(s) + '</div>').join('');
    w.body.innerHTML = '<div class="pcd-note"><h5>TO DO</h5>' + ln(['☐ Change the admin password', '☐ Buy tea', '☐ Lock the door (again)', '☑ Back up the cameras'].concat(NOTE_BY[persOf(D.W.room)] || [])) +
      '<h5>CODES</h5>' + ln(['Server room: 4815', 'Office safe: 4815 (yes, the same)', 'Guest WiFi: welcome2nexa']) + '<h5>REMINDER</h5>' + ln(['Do not tell Mike.']) + '</div>';
  }

  // --- события
  function bind(r, D) {
    const root = D.root;
    D.onMsg = (e) => brMsg(D, e); window.addEventListener('message', D.onMsg);
    const stop = (e) => e.stopPropagation();
    ['keydown', 'keyup', 'keypress'].forEach((t) => root.addEventListener(t, stop));
    ['pointerdown', 'mousedown', 'mouseup', 'wheel', 'contextmenu', 'touchstart', 'touchend'].forEach((t) => root.addEventListener(t, stop, { passive: true }));
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = e.target.closest ? e.target.closest('[data-a]') : null;
      const menu = D.stage.querySelector('.pcd-menu');
      if (!t) { menu.hidden = true; return; }
      const a = t.dataset.a, app = t.dataset.app;
      if (a !== 'start' && !t.closest('.pcd-menu')) menu.hidden = true;
      if (a === 'app') openApp(r, D, app);
      else if (a === 'tb') { const w = D.wins[app]; if (w && !w.min && w.el.style.zIndex == D.z) { w.min = true; w.el.style.display = 'none'; t.classList.remove('act'); } else focusWin(D, app); }
      else if (a === 'close') closeApp(D, app);
      else if (a === 'min') { const w = D.wins[app]; if (w) { w.min = true; w.el.style.display = 'none'; w.tb.classList.remove('act'); } }
      else if (a === 'start') menu.hidden = !menu.hidden;
      else if (a === 'quit') closeDesktop(r, false);
      else if (a === 'back') { if (D.wins.browser) brCmd(D.wins.browser, 'back'); }
      else if (a === 'fwd') { if (D.wins.browser) brCmd(D.wins.browser, 'fwd'); }
      else if (a === 'home') { if (D.wins.browser) brGo(D.wins.browser, homeUrl()); }
      else if (a === 'reload') { const bw = D.wins.browser; if (bw) brGo(bw, bw.cur || homeUrl()); }
      else if (a === 'hist') { const bw = D.wins.browser; if (bw) { bw.hp.hidden = !bw.hp.hidden; if (!bw.hp.hidden) renderHist(D, bw); } }
      else if (a === 'q') { const bw = D.wins.browser; if (bw) brGo(bw, searchUrl(window.I18N ? window.I18N.t(t.dataset.q) : t.dataset.q)); }
      else if (a === 'clear') { D.hist.length = 0; if (D.wins.browser) renderHist(D, D.wins.browser); }
      else if (a === 'ext') { const u = extUrl(D.wins.browser); if (u) { try { window.open(u, '_blank', 'noopener,noreferrer'); } catch (er) { /* заблокировано */ } } }
      if (a !== 'start') sfx(r, 'mouse', 0.3);
    });
    // перетаскивание окон за заголовок
    root.addEventListener('pointerdown', (e) => {
      const bar = e.target.closest && e.target.closest('.pcd-bar');
      const win = bar && bar.parentNode;
      if (win && !e.target.closest('button')) {
        const id = Object.keys(D.wins).find((k) => D.wins[k].el === win);
        if (id) focusWin(D, id);
        const sx = e.clientX, sy = e.clientY, l0 = win.offsetLeft, t0 = win.offsetTop, s = D.s || 1;
        const mv = (ev) => { win.style.left = clamp(l0 + (ev.clientX - sx) / s, -win.offsetWidth + 80, STAGE_W - 80) + 'px'; win.style.top = clamp(t0 + (ev.clientY - sy) / s, 0, STAGE_H - 40 - 32) + 'px'; };
        D.stage.classList.add('drag');
        const up = () => { D.stage.classList.remove('drag'); document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
        document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
      } else {
        const w2 = e.target.closest && e.target.closest('.pcd-win');
        if (w2) { const id = Object.keys(D.wins).find((k) => D.wins[k].el === w2); if (id) focusWin(D, id); }
      }
    });
  }

  // ------------------------------------------------------------------ вход / выход
  function poseOf(r, D) {
    const W = D.W, th = Math.tan(FOCUS_FOV * PI / 360), asp = (r.w || 16) / Math.max(1, r.h || 9);
    const d = Math.max(0.24 / (FILL * asp * 2 * th), 0.19 / (FILL * 2 * th));
    D.d = d; D.px = W.x + Math.sin(W.yaw) * d; D.py = W.y; D.pz = W.z + Math.cos(W.yaw) * d; D.yaw = W.yaw;
  }
  function openDesktop(r, W) {
    if (r.pcd || r.hacking || r.dead || r.disposed) return false;
    const S = r.pcs; if (S) S.focus = W;
    const D = r.pcd = { W, k: 0, tgt: 1, root: null, stage: null, open: false, ready: false, wins: {}, hist: makeHistory(W.room), s: 1, d: 0.31, ct: 0, clk: 0 };
    r.hacking = true; r.syncLock();
    r.fireHeld = false; r.padFire = false; r.aimWant = false; r.keys = {};
    if (!r.touch && document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { /* ignore */ } }
    r.hackAbort = (quiet) => closeDesktop(r, true, quiet === true);     // попадание, смерть, выход из миссии
    poseOf(r, D);
    mount(r, D);                                                          // невидим, но уже ловит мышь (иначе клик по холсту захватил бы курсор посреди подлёта)
    ACTIVE = r;
    sfx(r, 'tick', 0.5);
    return true;
  }
  function closeDesktop(r, instant, quiet) {
    const D = r.pcd; if (!D || D.closing) return;
    D.closing = true; D.tgt = 0; r.hackAbort = null; D.quiet = !!quiet;
    if (D.root) D.root.classList.remove('on');
    if (instant || D.k <= 0) finish(r);
  }
  function finish(r) {
    const D = r.pcd; if (!D) return;
    try { D.root && D.root.remove(); } catch (e) { /* ignore */ }
    if (D.onMsg) window.removeEventListener('message', D.onMsg);
    nxCursor(false);
    const quiet = D.quiet;
    r.pcd = null; if (r.pcs) r.pcs.focus = null; if (ACTIVE === r) ACTIVE = null;
    r.hacking = false; r.hackAbort = null;
    if (!r.disposed) {
      r.keys = {}; r.fireHeld = false; r.padFire = false;
      r.syncLock();
      if (!r.touch && !quiet) { try { r.requestLock(); } catch (e) { /* ignore */ } }
    }
  }
  function tick(r, dt) {
    const D = r.pcd; if (!D) return;
    poseOf(r, D);
    D.k = clamp(D.k + (D.tgt ? 1 : -1) * dt / FLY_T, 0, 1);
    if (D.tgt && D.k >= 1) reveal(r, D);
    if (D.closing && D.k <= 0) { finish(r); return; }
    if (D.root) {
      if (D.vw !== (r.w || r.layer.clientWidth) || D.vh !== (r.h || r.layer.clientHeight) || D.dd !== D.d) { D.dd = D.d; layout(r, D); }
      D.clk -= dt;
      if (D.clk <= 0) { D.clk = 1; D.stage.querySelector('.pcd-clock').textContent = hhmm(MIN_T0 + r.time / 60); }
      tickCamera(r, D, dt);
    }
  }

  // ------------------------------------------------------------------ подключение к камере, крючкам и клавишам
  function keyLabel() {
    const c = window.FPP ? window.FPP.keyCode() : 'KeyE';
    return c.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '');
  }
  PCSys.onAttach.push((room, W) => {
    const r = room.r;
    if (!r.pcdInit) {
      r.pcdInit = true;
      r.hooks.push((dt) => {
        tick(r, dt);
        // подсказка у курсора показывает настроенную клавишу (базовая игра пишет [E])
        const t = r.target;
        if (t && t.pcDesk && r.prompt && !r.touch && keyLabel() !== 'E') { const s = '[' + keyLabel() + '] ' + t.label; if (r.prompt.textContent !== s) r.prompt.textContent = s; }
      });
      // не-E клавиша: базовый обработчик знает только KeyE
      r.on(document, 'keydown', (e) => {
        if (e.repeat || e.code === 'KeyE' || r.pcd || !window.FPP || e.code !== window.FPP.keyCode()) return;
        if (r.target && r.target.pcDesk) r.useTarget();
      });
    }
    const it = r.interact({
      pos: [W.x, W.y - 0.05, W.z], reach: 2.5, label: 'USE COMPUTER', pcDesk: true,
      enabled: () => {
        if (r.pcd || r.hacking || r.dead || r.ending || r.cineDepth > 0 || r.disposed) return false;
        if (room.active && !room.active()) return false;
        const x = (r.p.x - room.x0) * room.side;
        if (x < 0.05 || x > room.RD || Math.abs(r.p.z - room.z) > 3.5) return false;     // только изнутри комнаты (стены не в счёт)
        return !room.occ.some((e) => e.occ && !e.dead && (e.occ.st === 'fight' || e.occ.st === 'grab' || Math.hypot(e.x - W.x, e.z - W.z) < 1.25));   // стул занят / идёт бой
      },
      use: () => openDesktop(r, W)
    });
    W.it = it;
  });

  // камера игрока: плавный подлёт к монитору поверх обычного положения (после присяда, качания и пр.)
  const pc0 = P.pmCam;
  P.pmCam = function (cam, dt) {
    if (pc0) pc0.call(this, cam, dt);
    const D = this.pcd; if (!D || D.k <= 0) return;
    const e = smooth(D.k);
    cam.position.x = lerp(cam.position.x, D.px, e); cam.position.y = lerp(cam.position.y, D.py, e); cam.position.z = lerp(cam.position.z, D.pz, e);
    cam.rotation.x = lerp(cam.rotation.x, 0, e); cam.rotation.z = lerp(cam.rotation.z, 0, e);
    cam.rotation.y += wrap(D.yaw - cam.rotation.y) * e;
  };
  const fov0 = P.fovNow;
  P.fovNow = function () {
    const f = fov0 ? fov0.call(this) : this.baseFov, D = this.pcd;
    return D && D.k > 0 ? lerp(f, FOCUS_FOV, smooth(D.k)) : f;
  };
  // оружие и руки не лезут в кадр
  const render0 = P.render;
  P.render = function () {
    const D = this.pcd;
    if (!D || D.k < 0.25 || !PCSys.rig) return render0.apply(this, arguments);
    const hid = PCSys.rig(this), was = hid.map((o) => o.visible);
    hid.forEach((o) => { o.visible = false; });
    try { return render0.apply(this, arguments); } finally { hid.forEach((o, i) => { o.visible = was[i]; }); }
  };

  // Esc — отойти (захватываем раньше игровых обработчиков; остальные клавиши вне окна рабочего стола игре не отдаём)
  const guard = (e) => {
    const r = ACTIVE, D = r && r.pcd; if (!D) return;
    if (e.type === 'keydown' && e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDesktop(r, false); return; }
    if (D.root && !D.root.contains(e.target)) e.stopPropagation();
  };
  window.addEventListener('keydown', guard, true);
  window.addEventListener('keyup', guard, true);

  PCSys.openDesktop = openDesktop;
  PCSys.closeDesktop = closeDesktop;
  PCSys.data = { HIST_COMMON, HIST_BY, NOTE_BY };
}());
