(function () {
  'use strict';
  if (!window.__YA) return;
  const CFG = { ads: !!window.__YAADS, cloud: !!window.__YACLOUD };
  const LANG = { ru: 'ru', be: 'ru', kk: 'ru', uk: 'ru', uz: 'ru', ky: 'ru', tg: 'ru', hy: 'ru', az: 'ru', ka: 'ru', ro: 'ru', tk: 'ru', de: 'de', en: 'en', tr: 'en', es: 'en', fr: 'en', pt: 'en', it: 'en', pl: 'en', ja: 'en', ko: 'en', zh: 'en' };
  const ls = (() => { try { const t = '__t'; localStorage.setItem(t, '1'); localStorage.removeItem(t); return true; } catch (e) { return false; } })();
  const mem = new Map();
  let ysdk = null, player = null, saveT = 0, playing = false, readyDone = false;

  const noop = () => {};
  window.alert = noop; window.confirm = () => true; window.prompt = () => null;

  const swallow = (e) => { e.preventDefault(); };
  document.addEventListener('contextmenu', swallow);
  document.addEventListener('keydown', (e) => {
    const t = e.target, typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && /^[spfgujwa]$/i.test(e.key)) e.preventDefault();
    else if (e.altKey && /^(Arrow|Home|End)/.test(e.key)) e.preventDefault();
    else if ((e.key === ' ' || /^Arrow/.test(e.key) || e.key === 'Backspace') && (t === document.body || (t && t.tagName === 'CANVAS'))) e.preventDefault();
  }, true);
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  document.addEventListener('dragstart', swallow);

  const state = {
    ready: false,
    lang: '',
    ad: {
      interstitial() {
        if (!CFG.ads || !ysdk) return Promise.resolve(false);
        return new Promise((res) => { try { ysdk.adv.showFullscreenAdv({ callbacks: { onOpen: () => hold(true), onClose: (w) => { hold(false); res(!!w); }, onError: () => { hold(false); res(false); } } }); } catch (e) { res(false); } });
      },
      rewarded() {
        if (!CFG.ads || !ysdk) return Promise.resolve(false);
        return new Promise((res) => { let ok = false; try { ysdk.adv.showRewardedVideo({ callbacks: { onOpen: () => hold(true), onRewarded: () => { ok = true; }, onClose: () => { hold(false); res(ok); }, onError: () => { hold(false); res(false); } } }); } catch (e) { res(false); } });
      }
    }
  };
  window.NexaYa = state;

  function hold(on) {
    try { window.dispatchEvent(new Event(on ? 'blur' : 'focus')); } catch (e) { /* ok */ }
    gp(!on && active());
  }
  const active = () => !!document.querySelector('.m-hint') && !document.hidden;
  function gp(on) {
    if (on === playing || !ysdk || !ysdk.features || !ysdk.features.GameplayAPI) return;
    playing = on;
    try { on ? ysdk.features.GameplayAPI.start() : ysdk.features.GameplayAPI.stop(); } catch (e) { /* ok */ }
  }
  function loadingReady() {
    if (readyDone || !ysdk || !ysdk.features || !ysdk.features.LoadingAPI) return;
    readyDone = true;
    try { ysdk.features.LoadingAPI.ready(); } catch (e) { /* ok */ }
  }

  function setLang(code) {
    const l = LANG[String(code || '').toLowerCase().slice(0, 2)] || 'en';
    state.lang = l;
    let own = '';
    try { own = localStorage.getItem('nexaLang') || ''; } catch (e) { /* ok */ }
    if (!own && window.I18N && I18N.setLang && I18N.lang !== l) { try { I18N.setLang(l); } catch (e) { /* ok */ } }
  }

  if (CFG.cloud && !window.NEXA_STORAGE) {
    const pull = (k) => { try { return ls ? localStorage.getItem(k) : null; } catch (e) { return null; } };
    const flush = () => {
      saveT = 0;
      if (!player) return;
      const o = {}; mem.forEach((v, k) => { o[k] = v; });
      try { player.setData(o, false).catch(noop); } catch (e) { /* ok */ }
    };
    window.NEXA_STORAGE = {
      get: (k) => (mem.has(k) ? mem.get(k) : pull(k)),
      set: (k, v) => { mem.set(k, String(v)); try { if (ls) localStorage.setItem(k, String(v)); } catch (e) { /* ok */ } if (!saveT) saveT = setTimeout(flush, 2500); return true; },
      remove: (k) => { mem.delete(k); try { if (ls) localStorage.removeItem(k); } catch (e) { /* ok */ } if (!saveT) saveT = setTimeout(flush, 2500); }
    };
  }

  function boot() {
    if (!window.YaGames || !YaGames.init) { state.ready = true; return; }
    YaGames.init().then((sdk) => {
      ysdk = sdk; state.ready = true; state.sdk = sdk;
      try { setLang(sdk.environment && sdk.environment.i18n && sdk.environment.i18n.lang); } catch (e) { /* ok */ }
      if (CFG.cloud && sdk.getPlayer) {
        sdk.getPlayer({ scopes: false }).then((p) => { player = p; return p.getData(); }).then((d) => { if (d) Object.keys(d).forEach((k) => { if (!mem.has(k)) mem.set(k, String(d[k])); }); }).catch(noop);
      }
      if (document.readyState === 'complete') setTimeout(loadingReady, 800); else window.addEventListener('load', () => setTimeout(loadingReady, 800));
    }).catch(() => { state.ready = true; });
  }
  boot();

  setInterval(() => { gp(active()); }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) gp(false); });
}());
