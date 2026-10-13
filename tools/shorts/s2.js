// Ролики по идеям 2, 6, 7, 9, 10, 11, 12 (свободная камера). Нужны cap.js, scn.js.
window.Shorts = window.Shorts || {};
(() => {
  const C0 = { size: 100, y: 0.205, bg: 'rgba(0,0,0,0.45)' };
  const cap = (t0, t1, text, size, extra) => Object.assign({}, C0, { t0, t1, text, size: size || 100 }, extra || {});
  const bed = (C2, url, dur, gain, from) => C2.addAudio(url, { at: 0, from: from || 0, dur, gain, fadeIn: 0.2, fadeOut: 1.6, loop: true });
  const hits = (C2, list, url, gain) => Promise.all(list.map((t) => C2.addAudio(url, { at: t, gain: gain === undefined ? 0.5 : gain })));
  const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  // ---- №2: «В этой миссии запрещено говорить по-русски»
  Shorts.s04 = async (o) => {
    o = o || {};
    const DUR = 20.6, END = 16.6;
    return Scn.montage({
      name: o.name || 's04_no_russian', dur: DUR, end: END,
      endOpts: { cta: 'Публично и *бесплатно*\nпроверь сам' },
      shots: [
        { reg: 'wh', t0: 0, t1: 3.2, a: [-6, 1.7, 16], b: [3, 1.7, 9.5], la: [0, 2.5, -14], lb: [0, 2.6, -14], fov: 64 },
        { reg: 'office', t0: 3.2, t1: 7.2, a: [-2.4, 1.6, 4.4], b: [1.4, 1.5, 2.6], la: [0, 1.3, -4], lb: [0, 1.3, -4], fov: 66 },
        { reg: 'plaza', t0: 7.2, t1: 11.6, a: [0, 1.6, 12], b: [0, 1.6, 8], la: [0, 4, -25], lb: [0, 5, -25], fov: 62 },
        { reg: 'dark', t0: 11.6, t1: END, a: [0, 1.55, 250], b: [0, 1.55, 262], la: [0, 1.5, 288], lb: [0, 1.5, 290], fov: 66 }
      ],
      caps: [cap(0.1, 3.0, 'В ЭТОЙ МИССИИ\n*ЗАПРЕЩЕНО*\nГОВОРИТЬ ПО-РУССКИ', 112), cap(3.4, 7.0, 'Вся миссия —\n*только на английском*', 98),
        cap(7.4, 11.4, 'ПОМНИТЕ:\n*НИ ОДНОГО СЛОВА*\nНА РУССКОМ', 104), cap(11.8, 16.4, 'Одна из *48* миссий\nбета-теста', 100)],
      audio: async (C2) => { await bed(C2, '/assets/menu.mp3', DUR, 0.7, 20); await hits(C2, [3.2, 7.2, 11.6, END], '/assets/glitch2.mp3', 0.5); await hits(C2, [7.4], '/assets/alarm.mp3', 0.4); },
      snaps: o.snaps || [1.0, 5.0, 9.0, 14.0]
    });
  };

  // ---- №6: ограбление, у тебя 120 секунд
  Shorts.s08 = async (o) => {
    o = o || {};
    const DUR = 21.0, END = 17.0, r = Scn.r;
    let blown = false;
    const NAMES = { 'EVIDENCE CASE': 'ЧЕМОДАН С УЛИКАМИ', 'BLACK LEDGER': 'ЧЁРНАЯ КНИГА', 'ARCHIVE DRIVES': 'АРХИВНЫЕ ДИСКИ', 'GOLD': 'ЗОЛОТО' };
    return Scn.montage({
      name: o.name || 's08_heist120', dur: DUR, end: END,
      endOpts: { cta: 'Публично и *бесплатно*\nуспеешь за 120 секунд?' },
      shots: [
        { reg: 'vault', t0: 0, t1: 3.0, a: [-3, 1.7, -6], b: [0, 1.7, -10], la: [0, 1.8, -30], lb: [0, 1.8, -30], fov: 62, speed: 0.6,
          setup: (R) => { blown = false; R.shutters.forEach((q) => q.set(1)); }, tick: (t, k, R) => { if (t > 0.5 && !blown) { blown = true; try { R.gate.blow(); } catch (e) { /* без шлюза */ } try { R.vdoor.set(1); } catch (e) { /* без двери */ } r.explode(0, 1.0, -27.6, 7, 120, 'c4'); } } },
        { reg: 'vault', t0: 3.0, t1: 6.4, a: [0, 1.65, -27], b: [0, 1.6, -35], la: [0, 1.4, -46], lb: [0, 1.3, -46], fov: 64, speed: 0.8, cont: true },
        { reg: 'vault', t0: 6.4, t1: 11.5, a: [0, 3.2, -33], b: [0, 3.0, -37], la: [0, 0.8, -45], lb: [0, 0.8, -45], fov: 62, speed: 0.8, cont: true },
        { reg: 'vault', t0: 11.5, t1: END, a: [-7, 2.6, -36], b: [7, 2.6, -36], la: [-9, 0.9, -44], lb: [9, 0.9, -44], fov: 64, speed: 0.8, cont: true }
      ],
      caps: [cap(0.1, 2.8, 'У ТЕБЯ\n*120 СЕКУНД*', 150), cap(3.2, 6.2, 'Взрыв — и хранилище\n*открыто*', 98), cap(6.6, 11.3, 'Золото, улики,\n*чёрная книга*', 100), cap(11.7, 16.8, 'Не успел —\nхранилище *блокируется*', 96)],
      over: (ctx, t) => {
        if (t < 0.6 || t >= END) return;
        const left = 120 - (t - 0.6) * 1.0;
        Cap.text(ctx, '*' + mmss(left) + '*', { x: 0.5, y: 0.42, size: 130, pop: false, bg: 'rgba(0,0,0,0.55)', k: 1 });
        if (t >= 6.4) {
          const R = Scn.W.R.vault;
          const pick = (s) => R.loot.find((l) => String(l.label).indexOf(s) >= 0);
          [['EVIDENCE CASE', 0], ['BLACK LEDGER', 1], ['ARCHIVE DRIVES', 2], ['GOLD', 3]].forEach(([k, i]) => {
            const l = pick(k); if (!l) return;
            const p = Scn.proj(l.x, (l.y || 0) + 1.7, l.z);
            if (p.vis && p.x > 60 && p.x < 1020 && p.y > 720 && p.y < 1700) Cap.tag(ctx, NAMES[k], p.x, p.y, { size: 30, alpha: Cap.clamp((t - 6.4) / 0.4, 0, 1) });
          });
        }
      },
      audio: async (C2) => { await bed(C2, '/assets/heistloud.mp3', DUR, 0.5, 60); await hits(C2, [0.48], '/assets/explosion.mp3', 1.0); await hits(C2, [0.6, 3.0, 6.4, END], '/assets/alarm.mp3', 0.25); await hits(C2, [END], '/assets/glitch2.mp3', 0.5); },
      snaps: o.snaps || [0.9, 4.5, 9.0, 14.0]
    });
  };

  // ---- №7: выбор «пощадить или убить»
  Shorts.s09 = async (o) => {
    o = o || {};
    const DUR = 18.6, END = 14.6;
    return Scn.montage({
      name: o.name || 's09_choice', dur: DUR, end: END,
      endOpts: { cta: 'Публично и *бесплатно*\nпроверь свой выбор' },
      shots: [
        { reg: 'head', t0: 0, t1: END, a: [0, 1.7, 11.5], b: [0, 1.6, 6.0], la: [0, 1.9, -9], lb: [0, 1.7, -9], fov: 62 }
      ],
      caps: [cap(0.1, 2.5, 'ПОСЛЕДНИЙ\n*ВЫБОР*', 160), cap(2.8, 8.8, 'Пощадить\nили *убить*?', 130), cap(9.2, 14.4, 'Голосуй\n*в комментариях*', 120)],
      over: (ctx, t) => {
        if (t < 4.2 || t >= END) return;
        const a = Cap.clamp((t - 4.2) / 0.5, 0, 1), W = 1080, y = 0.58 * 1920;
        ctx.save(); ctx.globalAlpha = a;
        const btn = (cx, label, red) => {
          ctx.fillStyle = red ? 'rgba(160,12,12,0.92)' : 'rgba(235,235,238,0.94)';
          ctx.fillRect(cx - 220, y - 70, 440, 140);
          ctx.strokeStyle = red ? '#ff2a2a' : '#fff'; ctx.lineWidth = 5; ctx.strokeRect(cx - 220, y - 70, 440, 140);
          ctx.fillStyle = red ? '#fff' : '#0a0a0c'; ctx.font = '700 64px ' + Cap.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(label, cx, y + 4);
        };
        btn(W * 0.27, 'ПОЩАДИТЬ', false); btn(W * 0.73, 'УБИТЬ', true);
        ctx.restore();
      },
      audio: async (C2) => { await bed(C2, '/assets/ambbunker.mp3', DUR, 0.7); await hits(C2, [0.3, 1.1, 1.9, 2.7, 3.5, 4.3, 5.1, 5.9], '/assets/heartbeat.mp3', 0.9); await hits(C2, [4.2], '/assets/neon.mp3', 0.5); await hits(C2, [END], '/assets/glitch2.mp3', 0.5); },
      snaps: o.snaps || [1.0, 6.0, 11.0]
    });
  };

  // ---- №9: от ссылки до боя
  Shorts.s11 = async (o) => {
    o = o || {};
    const DUR = 17.2, END = 13.2, r = Scn.r;
    return Scn.montage({
      name: o.name || 's11_browser', dur: DUR, end: END,
      endOpts: { cta: 'Публично и *бесплатно*\nссылка — в описании' },
      shots: [
        { lobby: true, t0: 0, t1: 5.4, a: [0, 0, 0], b: [0, 0, 0], la: [0, 0, 0], lb: [0, 0, 0], fov: 60, zoom: 1.0 },
        { reg: 'plaza', t0: 5.4, t1: 8.8, a: [0, 1.6, 12], b: [0, 1.6, 7.5], la: [0, 3, -25], lb: [0, 4, -25], fov: 62 },
        { reg: 'plaza', t0: 8.8, t1: END, a: [0, 1.5, 9.5], b: [0.1, 1.45, 8.4], la: [0, 1.5, -3.5], lb: [0, 1.5, -3.5], fov: 58, speed: 0.6,
          setup: () => { [[-2.2, -1.5], [2.4, -4], [0.6, -6.5]].forEach((q) => Scn.guard('grunt', q[0], q[1], 0)); r.__s11 = false; },
          tick: (t) => { if (t > 9.6 && !r.__s11) { r.__s11 = true; r.explode(0, 0.9, -3.5, 5, 110, 'c4'); } } }
      ],
      caps: [cap(0.1, 2.5, 'ОТ ССЫЛКИ\nДО БОЯ —\n*ПАРА КЛИКОВ*', 120), cap(2.7, 5.2, '*1.*  Открыл ссылку', 104), cap(5.6, 8.6, '*2.*  Выбрал миссию', 104), cap(9.0, 13.0, '*3.*  Играешь', 120)],
      audio: async (C2) => { await bed(C2, '/assets/menu.mp3', DUR, 0.7, 10); await hits(C2, [2.7, 5.5, 8.9], '/assets/neon.mp3', 0.5); await hits(C2, [9.58], '/assets/explosion.mp3', 0.9); await hits(C2, [END], '/assets/glitch2.mp3', 0.5); },
      snaps: o.snaps || [1.0, 4.0, 7.0, 11.0]
    });
  };
})();
