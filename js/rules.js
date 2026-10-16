// Правила онлайна и отказ от ответственности: окно при первом входе (с версией текста), вкладка в лобби, учёт принятия. Тексты: js/i18n-rules.js (RU/EN/DE).
(function () {
  'use strict';
  const KEY = 'nexaRulesOk', D = window.NexaRulesText;
  if (!D) return;
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* без хранилища */ } } };
  const lang = () => { const l = (window.I18N && I18N.lang) || 'en'; return D.text[l] ? l : 'en'; };
  const accepted = () => { try { const j = JSON.parse(ls.get(KEY) || 'null'); return !!j && j.v === D.version; } catch (e) { return false; } };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const body = (part, anchor) => {
    const box = el('div', 'rl-text');
    box.appendChild(el('h2', 'rl-h1', part.t));
    part.s.forEach((s, i) => {
      const h = el('h3', 'rl-h', s.h); if (anchor) h.id = anchor + i; box.appendChild(h);
      s.p.forEach((p) => box.appendChild(el('p', '', p)));
    });
    return box;
  };

  function ask(done) {
    if (accepted()) { done && done(true); return; }
    if (document.getElementById('rl-modal')) return;
    const wrap = el('div', 'rl-modal'); wrap.id = 'rl-modal'; wrap.setAttribute('data-i18n', 'net'); wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    const box = el('div', 'rl-box'); wrap.appendChild(box);
    const step = el('small', 'rl-step'), scroll = el('div', 'rl-scroll'), note = el('p', 'v-note rl-note'), bt = el('div', 'pf-btns');
    const ok = el('button', 'ol-btn big', 'I AGREE'), no = el('button', 'ol-btn danger', 'I DISAGREE'); ok.type = no.type = 'button';
    bt.appendChild(ok); bt.appendChild(no);
    box.appendChild(step); box.appendChild(scroll); box.appendChild(note); box.appendChild(bt);
    let n = 0, tm = 0, t0 = 0;
    const parts = D.text[lang()];
    const arm = () => {
      ok.disabled = true; t0 = Date.now(); clearInterval(tm);
      const chk = () => { const end = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 8, left = 5 - Math.floor((Date.now() - t0) / 1000); if (end || left <= 0) { ok.disabled = false; note.textContent = ''; clearInterval(tm); } else note.textContent = 'READ TO THE END OR WAIT ' + left + ' s'; };
      scroll.onscroll = chk; tm = setInterval(chk, 400); chk();
    };
    const show = (i) => {
      n = i; step.textContent = 'STEP ' + (i + 1) + ' / 2'; scroll.textContent = ''; scroll.appendChild(body(parts[i])); scroll.scrollTop = 0;
      ok.textContent = i === 0 ? 'I AGREE' : 'I AGREE AND ENTER'; arm();
    };
    const close = (v) => { clearInterval(tm); wrap.remove(); done && done(v); };
    ok.onclick = () => { if (ok.disabled) return; if (n === 0) show(1); else { ls.set(KEY, JSON.stringify({ v: D.version, t: Date.now() })); try { window.NexaSocial && NexaSocial.boot && NexaSocial.boot(); } catch (e) { /* ok */ } close(true); } };
    no.onclick = () => close(false);
    document.body.appendChild(wrap); show(0); ok.focus();
  }

  function mountTab(box) {
    if (!box) return;
    box.textContent = '';
    const parts = D.text[lang()];
    box.appendChild(el('h2', 'rl-title', 'ONLINE TERMS OF USE'));
    const toc = el('nav', 'rl-toc'); toc.setAttribute('aria-label', 'Contents');
    parts.forEach((p, pi) => {
      toc.appendChild(el('b', '', p.t));
      p.s.forEach((s, i) => { const a = el('button', 'rl-a', s.h); a.type = 'button'; a.onclick = () => { const t = box.querySelector('#rl' + pi + '-' + i); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); }; toc.appendChild(a); });
    });
    box.appendChild(toc);
    parts.forEach((p, pi) => { const b = body(p, 'rl' + pi + '-'); box.appendChild(b); });
    box.appendChild(el('p', 'v-note', accepted() ? 'ACCEPTED' : 'NOT ACCEPTED YET'));
  }

  const RM = window.NexaRoom;
  if (RM) ['hostRoom', 'joinRoom', 'quickPlay'].forEach((k) => { const f = RM[k]; if (typeof f === 'function') RM[k] = function () { return accepted() ? f.apply(this, arguments) : null; }; });

  window.NexaRules = { version: D.version, accepted, ask, mountTab, revoke() { ls.set(KEY, ''); } };
}());
