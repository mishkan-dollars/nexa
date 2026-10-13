// NEXA: миссия 48 «REMEMBER: NOT A WORD OF RUSSIAN» — финал. Весь текст — английский во всех языках (кроме последней надписи).
// Ядро: регистрация миссии, мир (f48world*.js), цепочка этапов F.PH.<имя>(r, ctx), отладка ?m48=<этап|idle>.
// Этапы: wh → fake → office → car → yard → base → hall → vault → gas → deep → flash → head → end (в файлах f48*.js).
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.f48 || !C.f48.World || !C.f48.K || !C.f48.mkCar || !C.Run.prototype.stealth) return;
  const F = C.f48, K = F.K, { Run, MISSIONS, CINEMA, smooth, lerp } = C, P = Run.prototype, PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DIC = 'DICTOR';
  F.PH = F.PH || {};
  F.ORDER = ['wh', 'fake', 'office', 'car', 'yard', 'base', 'hall', 'vault', 'gas', 'deep', 'flash', 'head', 'bombs', 'exit', 'end', 'credits'];
  const Q = new URLSearchParams(location.search);

  // общий помощник: объект сценария, живущий в r.f48 (переживает смерть)
  K.st = (r) => r.f48 || (r.f48 = {});
  K.W = (r) => r.f48.W;
  K.say = (r, text, hold, who) => r.say(who || DIC, text, hold);
  K.pause = (r, s) => r.wait(s);
  // очередь реплик: новая реплика (с озвучкой или без) не обрывает ту, что ещё говорит, — ждёт её конца, но не дольше 3 игровых секунд за раз; если голос молчит, идёт сразу
  const say0 = P.say;
  P.say = async function (who, text, hold) {
    const V = C.voice, inC = !!this.inCinema;
    if (String(this.taskId) === '48' && V) for (let i = 0; i < 3 && V.busy(this) && !this.disposed; i += 1) await V.idle(this, 3);
    if (inC && !this.inCinema) return undefined;   // пока реплика ждала очереди, катсцену пропустили / она кончилась — реплика уже не нужна
    return say0.call(this, who, text, hold);
  };
  // катсцена не начинается поверх голоса: если реплика из игры ещё говорит, ждём её конца (до 3 игровых секунд); вставки (килкам, подрыв) не ждут
  const cin0 = P.cinematic;
  P.cinematic = async function (shots, o) {
    const V = C.voice;
    if (String(this.taskId) === '48' && V && !this.cineInsert && !this.inCinema && V.busy(this)) await V.idle(this, 3);
    return cin0.call(this, shots, o);
  };
  // сквозной хук кадра: сцена добавляет функции в r.f48.tick; снимаем одним махом
  K.hook = function (r, fn) { const st = K.st(r); (st.ticks || (st.ticks = [])).push(fn); return () => { const i = st.ticks.indexOf(fn); if (i >= 0) st.ticks.splice(i, 1); }; };
  K.fadeBlack = (r, a, d) => r.fade(a, d);
  // шот катсцены финала: ручная камера без свайпов вбок и без постоянного смещения кадра (камера не «уезжает» вправо)
  K.shot = (o) => Object.assign({ free: true, hand: 0.8, whip: false, frame: 0 }, o);

  // ------------------------------------------------------------------ миссия
  MISSIONS[48] = {
    title: 'REMEMBER: NOT A WORD OF RUSSIAN',
    theme: 'office',
    build(r) {
      K.css();
      const st = K.st(r);
      const W = st.W = new F.World(r);
      r.duckOnVoice = 0.55;                          // озвучка: пока говорит Диктор, музыка и эмбиент тише (voice.js → r.vDuck)
      r.combat(); r.giveWeapon('glock');
      F.regions(W);
      W.initLights();
      st.ticks = [];
      r.kitUpd = r.kitUpd || [];
      r.kitUpd.push((dt) => {
        W.tick(dt);
        for (let i = 0; i < st.ticks.length; i += 1) st.ticks[i](dt);
      });
      W.enter('wh', 0, 15, 0);
      r.mood && 0;
      r.bounds = null;                               // декор props3d.dress() к финалу не применяется: весь декор свой
      window.__m48 = { r, W, F, K };
    },

    async play(r) {
      const st = K.st(r), W = st.W;
      r.noFight = false;
      const jump = Q.get('m48');
      if (jump === 'idle') { r.f48.idle = true; return; }
      const start = jump ? Math.max(0, F.ORDER.indexOf(jump)) : 0;
      st.ctx = { r, W, start };
      for (let i = start; i < F.ORDER.length; i += 1) {
        const name = F.ORDER[i], fn = F.PH[name];
        if (!fn) continue;
        st.cur = name;
        await fn(r, st.ctx);
        if (r.disposed) return;
      }
    }
  };

  CINEMA[48] = {
    intro: (r) => [
      K.shot({ at: [-15, 5.4, 16.5], to: [-9, 4.6, 15.5], look: [0, 1.2, -4], fov: 62, dur: 5.0, hand: 0.5, caption: 'NEXA LOGISTICS — DEPOT 14\nNEXA INDUSTRIES — 23.11.1992' }),
      K.shot({ at: [0, 1.4, 17.6], to: [0, 1.5, 16.8], look: [0, 1.3, 8], fov: 52, dur: 2.6, cut: 'dip' }),
      C.cin.pov(r, 2.2, { extra: { cut: 'dip', whip: false, frame: 0 } })
    ],
    outro: (r) => [C.cin.pull(r, '')]
  };
}());
