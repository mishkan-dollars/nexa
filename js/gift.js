(function () {
  'use strict';
  const X = window.NexaGiftText, SK = 'nexaGifts';
  const ST = window.NexaStore || { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ok */ } } };
  if (!X) return;
  const clean = (s, n) => Array.from(String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿<>|]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, n).join('');
  const hexc = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#ff3b30');
  let st = 0, all = null, Q = [], cur = null, revealed = false, snooze = false, root = null, fx = null, gl = null, chip = null, chip2 = null, busyOpen = false;
  try { const j = JSON.parse(ST.get(SK) || '[]'); if (Array.isArray(j)) Q = j.filter((g) => g && typeof g.id === 'string' && Number.isInteger(g.a) && g.a >= 1 && g.a <= 2147483647).map((g) => ({ id: g.id.slice(0, 40), k: g.k === 'a' ? 'a' : 'p', n: clean(g.n, 16), c: hexc(g.c), p: /^[0-9a-f]{6,16}$/.test(g.p || '') ? g.p : '', m: clean(g.m, 80), a: g.a })); } catch (e) { Q = []; }
  const save = () => { try { ST.set(SK, JSON.stringify(Q)); } catch (e) { /* ok */ } };
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const inMission = () => { try { return !!(window.Missions && Missions.current); } catch (e) { return false; } };
  const sfx = (n) => { try { const a = window.Toys && Toys.audio(); if (a && a.playSfx) a.playSfx(n); } catch (e) { /* ok */ } };
  const ease = (x) => 1 - Math.pow(1 - x, 3), back = (x) => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

  function add(g) {
    if (!g || typeof g.id !== 'string' || !Number.isInteger(g.a) || g.a < 1 || g.a > 2147483647 || Q.some((x) => x.id === g.id)) return false;
    Q.push({ id: g.id.slice(0, 40), k: g.k === 'a' ? 'a' : 'p', n: clean(g.n, 16), c: hexc(g.c), p: /^[0-9a-f]{6,16}$/.test(g.p || '') ? g.p : '', m: clean(g.m, 80), a: g.a });
    save(); snooze = false; tick(); if (cur) paint(); return true;
  }

  function scene(cv) {
    const T = window.THREE; if (!T) return null;
    let r; try { r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch (e) { return null; }
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); r.setClearColor(0x000000, 0);
    const sc = new T.Scene(), cam = new T.PerspectiveCamera(30, 1, 0.1, 60);
    cam.position.set(0, 2.6, 8.4); cam.lookAt(0, 1.1, 0);
    sc.add(new T.AmbientLight(0x6a6e78, 0.9));
    const key = new T.DirectionalLight(0xffffff, 0.95); key.position.set(3, 6, 5); sc.add(key);
    const rim = new T.PointLight(0xff2a1f, 1.6, 20); rim.position.set(-4, 2.5, -3); sc.add(rim);
    const inner = new T.PointLight(0xff3b30, 0, 9); inner.position.set(0, 1.5, 0); sc.add(inner);
    const mBody = new T.MeshStandardMaterial({ color: 0x15171b, roughness: 0.5, metalness: 0.4 }), mRib = new T.MeshStandardMaterial({ color: 0xe2231a, roughness: 0.38, metalness: 0.25, emissive: 0x3a0603 });
    const box = (w, h, d, m, x, y, z) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
    const g = new T.Group(); sc.add(g);
    g.add(box(2, 1.4, 2, mBody, 0, 0.7, 0), box(2.06, 1.42, 0.36, mRib, 0, 0.7, 0), box(0.36, 1.42, 2.06, mRib, 0, 0.7, 0));
    const hinge = new T.Group(); hinge.position.set(0, 1.4, -1.1); g.add(hinge);
    hinge.add(box(2.2, 0.38, 2.2, mBody, 0, 0.19, 1.1), box(2.26, 0.4, 0.36, mRib, 0, 0.19, 1.1), box(0.36, 0.4, 2.26, mRib, 0, 0.19, 1.1));
    const loop = (s) => { const o = new T.Mesh(new T.TorusGeometry(0.36, 0.11, 10, 28), mRib); o.scale.set(1, 1.35, 0.6); o.position.set(0.38 * s, 0.62, 1.1); o.rotation.z = -0.75 * s; return o; };
    hinge.add(loop(1), loop(-1));
    const knot = new T.Mesh(new T.SphereGeometry(0.2, 14, 10), mRib); knot.position.set(0, 0.5, 1.1); hinge.add(knot);
    const glow = new T.Mesh(new T.PlaneGeometry(1.8, 1.8), new T.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 1.36; g.add(glow);
    const beam = new T.Mesh(new T.CylinderGeometry(1.5, 0.25, 7, 24, 1, true), new T.MeshBasicMaterial({ color: 0xff2a1f, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    beam.position.y = 4.9; g.add(beam);
    const floor = new T.Mesh(new T.CircleGeometry(3.2, 40), new T.MeshBasicMaterial({ color: 0xff2a1f, transparent: true, opacity: 0.1, blending: T.AdditiveBlending, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; sc.add(floor);
    const N = 90, pp = new Float32Array(N * 3), pv = new Float32Array(N * 3);
    const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pp, 3));
    const pm = new T.PointsMaterial({ color: 0xff5a4a, size: 0.09, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
    const pts = new T.Points(pg, pm); pts.frustumCulled = false; sc.add(pts);
    let t0 = performance.now(), op = 0, ry0 = 0, burst = 0, raf = 0, dead = false;
    function size() { const w = cv.clientWidth || 300, h = cv.clientHeight || 300; r.setSize(w, h, false); cam.aspect = w / h; cam.fov = w / h < 0.8 ? 40 : 30; cam.updateProjectionMatrix(); }
    function frame(now) {
      if (dead) return; raf = requestAnimationFrame(frame);
      const t = (now - t0) / 1000;
      const o = op ? Math.min(1, (now - op) / 1100) : 0;
      if (!op) { g.rotation.y = t * 0.45; g.position.y = Math.sin(t * 1.3) * 0.1; g.rotation.z = Math.sin(t * 0.9) * 0.03; rim.intensity = 1.4 + Math.sin(t * 2) * 0.4; }
      else {
        const tgt = Math.round(ry0 / (Math.PI * 2)) * Math.PI * 2; g.rotation.y = ry0 + (tgt - ry0) * ease(Math.min(1, o * 1.6)); g.position.y = Math.sin(o * Math.PI) * 0.25; g.rotation.z *= 0.9;
        hinge.rotation.x = -back(o) * 1.75;
        inner.intensity = Math.sin(Math.min(1, o * 1.4) * Math.PI * 0.5) * 3.2; glow.material.opacity = 0.75 * ease(o); glow.position.y = 1.36 + ease(o) * 0.3;
        beam.material.opacity = 0.1 * ease(o) * (0.85 + Math.sin(t * 9) * 0.15);
        cam.position.x = (1 - o) * Math.sin(t * 60) * 0.08 * (o < 0.25 ? 1 : 0);
        if (burst) { const bt = (now - burst) / 1000; pm.opacity = Math.max(0, 1 - bt * 0.8); for (let i = 0; i < N; i += 1) { pp[i * 3] += pv[i * 3] * 0.016; pp[i * 3 + 1] += pv[i * 3 + 1] * 0.016; pp[i * 3 + 2] += pv[i * 3 + 2] * 0.016; pv[i * 3 + 1] -= 0.05; } pg.attributes.position.needsUpdate = true; }
      }
      r.render(sc, cam);
    }
    size(); raf = requestAnimationFrame(frame);
    return {
      resize: size,
      open() {
        if (op) return; op = performance.now(); ry0 = g.rotation.y; burst = op;
        for (let i = 0; i < N; i += 1) { const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 1.6; pp[i * 3] = 0; pp[i * 3 + 1] = 1.5; pp[i * 3 + 2] = 0; pv[i * 3] = Math.cos(a) * s; pv[i * 3 + 1] = 1.2 + Math.random() * 2.4; pv[i * 3 + 2] = Math.sin(a) * s; }
      },
      dispose() {
        dead = true; cancelAnimationFrame(raf);
        sc.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        try { r.dispose(); r.forceContextLoss(); } catch (e) { /* ok */ }
      }
    };
  }

  function paint() {
    const g = cur; if (!root || !g) return;
    const adm = g.k === 'a';
    root.querySelector('.gf-title').textContent = X(adm ? 'titleA' : 'title');
    const from = root.querySelector('.gf-from'); from.textContent = '';
    const av = el('span', 'gf-av');
    if (adm) { av.classList.add('adm'); av.textContent = 'N'; } else if (window.NexaProfile && NexaProfile.avatar) av.innerHTML = NexaProfile.avatar(g.n, g.c, 44, g.p); else { av.textContent = (Array.from(g.n)[0] || '?'); av.style.background = g.c; }
    from.appendChild(av);
    const nm = el('div', 'gf-nm'); nm.appendChild(el('small', '', adm ? '' : X('from'))); const b = el('b', '', adm ? X('admin') : g.n); b.setAttribute('translate', 'no'); nm.appendChild(b); from.appendChild(nm);
    const msg = root.querySelector('.gf-msg'); msg.textContent = g.m; msg.hidden = !g.m;
    const more = root.querySelector('.gf-more'); more.textContent = Q.length > 1 ? X('more', { n: Q.length - 1 }) : ''; more.hidden = Q.length < 2 || !!all;
    root.querySelector('.gf-all').hidden = revealed || Q.length < 2; root.querySelector('.gf-all').textContent = X('all');
    const sum = all ? Q.filter((x) => all.indexOf(x.id) >= 0).reduce((a, x) => a + x.a, 0) : g.a;
    root.querySelector('.gf-amt b').textContent = '+' + sum; root.querySelector('.gf-amt span').textContent = X('kp'); root.querySelector('.gf-amt small').textContent = all ? X('allsum', { n: all.length }) + ' · ' + X('added') : X('added');
    const go = root.querySelector('.gf-go'); go.textContent = X(revealed ? 'take' : 'open'); root.querySelector('.gf-later').textContent = X('later');
    root.classList.toggle('rev', revealed);
  }
  function mount() {
    if (root) return;
    root = el('div', 'gf'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    root.innerHTML = '<div class="gf-bg"></div><div class="gf-stripes"></div><h2 class="gf-title"></h2><div class="gf-l"><div class="gf-from"></div><blockquote class="gf-msg"></blockquote></div>' +
      '<div class="gf-r"><canvas class="gf-cv"></canvas><div class="gf-amt" aria-live="polite"><b></b><span></span><small></small></div></div><div class="gf-flash"></div>' +
      '<div class="gf-bar"><span class="gf-more"></span><button type="button" class="gf-all"></button><button type="button" class="gf-later"></button><button type="button" class="gf-go"></button></div>';
    root.querySelector('.gf-go').onclick = () => (revealed ? claim() : reveal());
    root.querySelector('.gf-later').onclick = leave;
    root.querySelector('.gf-all').onclick = takeAll;
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); leave(); } else if (e.key === 'Enter' || e.key === ' ') { if (e.target.tagName !== 'BUTTON') { e.preventDefault(); revealed ? claim() : reveal(); } e.stopPropagation(); } else if (e.key === 'Tab') e.stopPropagation();
    }, true);
    document.body.appendChild(root);
  }
  function show() {
    if (!Q.length) return; cur = Q[0]; revealed = false; mount(); paint(); root.hidden = false;
    document.body.classList.add('gf-on');
    if (fx) { fx.dispose(); fx = null; }
    const C = window.Missions && Missions._core, tok = ++st;
    const start = (tries) => {
      if (tok !== st || !root || root.hidden) return;
      if (fx) { fx.dispose(); fx = null; }
      const old = root.querySelector('.gf-cv'), cv = el('canvas', 'gf-cv'); old.replaceWith(cv);
      fx = scene(cv);
      if (fx) {
        cv.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); setTimeout(() => { if (tok === st && fx) { start(0); if (revealed && fx) fx.open(); } }, 200); });
        if (revealed) fx.open();
      } else if (tries < 2) setTimeout(() => start(tries + 1), 250);
      root.classList.toggle('flat', !fx && tries >= 2);
    };
    if (window.THREE) start(0); else if (C && C.loadThree) C.loadThree().then(() => start(0), () => start(2)); else start(2);
    sfx('notification');
    const bt = root.querySelector('.gf-go'); setTimeout(() => { try { bt.focus(); } catch (e) { /* ok */ } }, 50);
  }
  function hide() { st += 1; if (!revealed) all = null; if (root) root.hidden = true; document.body.classList.remove('gf-on'); if (fx) { fx.dispose(); fx = null; } cur = null; }
  function reveal() {
    if (revealed || !cur) return; revealed = true; sfx('succesfully');
    const fl = root.querySelector('.gf-flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
    if (fx) fx.open();
    setTimeout(() => { if (cur && revealed) { root.classList.add('rev'); paint(); } }, fx ? 520 : 0);
    paint(); root.querySelector('.gf-go').disabled = true; setTimeout(() => { const b = root && root.querySelector('.gf-go'); if (b) { b.disabled = false; try { b.focus(); } catch (e) { /* ok */ } } }, fx ? 900 : 100);
  }
  function claim() {
    if (!cur) return; const ids = all || [cur.id]; all = null; Q = Q.filter((g) => ids.indexOf(g.id) < 0); save(); hide();
    if (Q.length) setTimeout(show, 250); else tick();
  }
  function takeAll() {
    if (!cur || revealed || Q.length < 2) return;
    all = Q.map((g) => g.id); reveal();
  }
  function leave() {
    if (!cur) return;
    if (revealed) { claim(); return; }
    snooze = true; hide(); tick();
  }
  function tick() {
    if (!chip2) { chip2 = el('button', 'gf-chip gf-chip2'); chip2.type = 'button'; chip2.hidden = true; chip2.onclick = () => { snooze = false; if (!cur) show(); takeAll(); }; document.body.appendChild(chip2); }
    if (!chip) { chip = el('button', 'gf-chip'); chip.type = 'button'; chip.hidden = true; chip.onclick = () => { snooze = false; if (!cur) show(); }; document.body.appendChild(chip); }
    const open = !!cur && root && !root.hidden;
    if (!open && Q.length && !snooze && !inMission() && !document.hidden && !busyOpen) { busyOpen = true; try { show(); } finally { busyOpen = false; } }
    const showing = !!cur && root && !root.hidden;
    chip2.hidden = showing || Q.length < 2; if (!chip2.hidden) chip2.textContent = X('all');
    chip.hidden = showing || !Q.length; if (!chip.hidden) chip.textContent = X('chip', { n: Q.length });
    const tb = document.querySelector('.ol-tab[data-v="trade"]'); if (tb) { if (Q.length) tb.setAttribute('data-gift', String(Q.length)); else tb.removeAttribute('data-gift'); }
    const mi = document.getElementById('tr-msg'); if (mi && !mi.placeholder) mi.placeholder = X('msgph');
  }
  document.addEventListener('i18nchange', () => { paint(); const mi = document.getElementById('tr-msg'); if (mi) mi.placeholder = X('msgph'); tick(); });
  window.addEventListener('resize', () => { if (fx) fx.resize(); });
  setInterval(tick, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick); else tick();
  window.NexaGift = Object.freeze({ add, clean, pending: () => Q.length, queue: () => Q.map((g) => Object.assign({}, g)), current: () => (cur ? cur.id : ''), snooze: () => { snooze = true; } });
}());
