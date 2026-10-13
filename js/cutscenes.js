// NEXA: катсцены миссий 7–16 (стиль GTA): интро и эпилог для каждой. Формат шотов — см. шапку cinema.js.
// Все камеры стоят внутри геометрии уровня (координаты сверены с build() миссий), вставки короткие — «монтаж».
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C || !C.cin || !C.M2) return;
  const { CINEMA, EYE } = C;
  const { pov, pull, clearBack, back, crane } = C.cin;
  const { CAP, DONE } = C.M2;
  const SYS = 'SYSTEM';

  const dip = { cut: 'dip' }, flash = { cut: 'flash' }, glitch = { cut: 'glitch' };
  const mix = (a, b) => Object.assign({}, a, b);
  const last = (r, relight) => pov(r, 2.2, { extra: relight ? mix(dip, { end: (q) => q.lightsLevel(q.baseLight || 1) }) : dip });
  // тёмные уровни: на время интро камера видит сцену светлее, перед стартом возвращается базовый свет
  const lit = (level) => ({ run: (q) => q.lightsLevel(level) });

  const outro = (n) => (r) => [back(r), crane(r, DONE(n))];

  // ------------------------------------------------------------ 07 BREAKOUT — камера, x ±8, z 40…30; дверь в (0,30)
  CINEMA[7] = {
    intro: (r) => [
      { at: [7.4, 3.1, 39.2], to: [7.4, 3.1, 32.6], look: [-1, 0.6, 35.5], lookTo: [0, 1.2, 30], fov: 68, roll: 0.05, rollTo: -0.02, dur: 4.2, caption: CAP('DETENTION BLOCK C — CELL 14') },
      mix(dip, { at: [-2.2, 0.25, 38.8], to: [-1, 0.3, 35.8], look: [0, 1.3, 30], fov: 50, dur: 2.4, say: [SYS, 'ВСЕ ТЕСТЫ ПРОЙДЕНЫ. СУБЪЕКТ 083 ПЕРЕВОДИТСЯ НА СОДЕРЖАНИЕ.'] }),
      mix(flash, { at: [1.3, 1.4, 32.6], to: [1.1, 1.45, 32.2], look: [0, 1.4, 30], fov: 34, dur: 1.2, hand: 0.6 }),
      mix(flash, { orbit: { c: [0, 30], r: 3, a0: -1.2, a1: 1.2, h: 1.5, ly: 1.4 }, fov: 46, dur: 2.8, roll: 0.04, rollTo: -0.04 }),
      last(r)
    ],
    outro: outro(7)
  };

  // ------------------------------------------------------------ 08 PROFICIENCY TEST — полигон x ±12, z 21…-49, барьер z=12
  CINEMA[8] = {
    intro: (r) => [
      { at: [-10.5, 3.4, 19.5], to: [10.5, 3.4, 19.5], look: [0, 1.2, -20], fov: 74, dur: 4.4, caption: CAP('SHOOTING RANGE — LEVEL 08') },
      mix(dip, { at: [-4, 0.3, -5.5], to: [-4, 0.35, -6.4], look: [-5, 3.4, -8.5], fov: 62, dur: 1.4, hand: 0.5 }),
      mix(flash, { at: [0, 1.25, 10.5], to: [0, 1.4, 6.5], look: [0, 1.2, -32], fov: 36, fovTo: 30, dur: 3, say: ['INSTRUCTOR', 'СУБЪЕКТ 083. ПОЛИГОН. ВАША ЗАДАЧА — ТОЧНОСТЬ.'] }),
      mix(flash, { orbit: { c: [0, 12], r: 4, a0: 2.2, a1: 3.9, h: 1.8, ly: 1.0 }, fov: 48, dur: 2.4, roll: -0.04, rollTo: 0.03 }),
      last(r)
    ],
    outro: outro(8)
  };

  // ------------------------------------------------------------ 09 POWER SURGE — реакторное крыло x ±15, z 26…-58, реактор (0,-18)
  CINEMA[9] = {
    intro: (r) => [
      mix(lit(0.95), { at: [-13, 3.9, 25], to: [13, 3.9, -4], look: [0, 1.5, -18], fov: 70, dur: 5, caption: CAP('REACTOR WING 09 — POWER FAILURE') }),
      mix(dip, mix(lit(0.8), { at: [-8.5, 1.5, 13.5], to: [-9.4, 1.7, 12.6], look: [-12, 2.0, 8], fov: 46, dur: 2.6, say: [SYS, 'РЕАКТОР НЕСТАБИЛЕН. ВОЗМОЖНЫ ПЕРЕГРУЗКИ.'] })),
      mix(flash, mix(lit(0.65), { at: [8.5, 0.35, -9], to: [8.5, 0.4, -11], look: [3, 2.6, -18], fov: 58, dur: 1.3, hand: 0.5 })),
      mix(glitch, mix(lit(0.8), { orbit: { c: [0, -18], r: 7, a0: 0.5, a1: 2.5, h: 3.2, ly: 1.8 }, fov: 52, dur: 3, roll: 0.05, rollTo: -0.03 })),
      last(r, true)
    ],
    outro: outro(9)
  };

  // ------------------------------------------------------------ 10 LIFT SHAFT — платформа x,z ±8, колонны (±3.5,±3)
  CINEMA[10] = {
    intro: (r) => [
      { at: [-7.2, 3.5, 7.2], to: [7.2, 3.5, 7.2], look: [0, 0.5, -2], fov: 72, dur: 4, caption: CAP('LIFT SHAFT 10 — SECTOR 7') },
      mix(dip, { at: [-5, 0.5, 0], to: [-6.6, 0.9, 0.2], look: [-15, 1.2, 0], fov: 40, dur: 2.6, say: [SYS, 'ПОДЪЁМ НА ПОВЕРХНОСТЬ. НЕ ДАЙТЕ ИМ ПОДОБРАТЬСЯ.'] }),
      mix(flash, { at: [0.2, 3.5, -6.8], to: [0.2, 3.5, -3.5], look: [0, 0, 2], fov: 82, dur: 1.4, hand: 0.4 }),
      mix(glitch, { orbit: { c: [0, 0], r: 5.6, a0: 0, a1: 3.4, h: 2.4, ly: 1.0 }, fov: 50, dur: 3, roll: 0.06, rollTo: -0.04 }),
      last(r)
    ],
    outro: outro(10)
  };

  // ------------------------------------------------------------ 11 BLACKOUT — зал x ±11, z 14…-62, предохранитель (-10.4,-1)
  CINEMA[11] = {
    intro: (r) => [
      mix(lit(0.75), { at: [0, 3.0, 12.5], to: [0, 3.0, -6.5], look: [0, 1.0, -30], fov: 66, dur: 4.2, caption: CAP('SUBLEVEL 11 — EMERGENCY POWER') }),
      mix(glitch, mix(lit(0.55), { at: [-6.5, 1.3, 3], to: [-7.5, 1.3, 1.2], look: [-10.4, 1.3, -1], fov: 42, dur: 2.8, say: [SYS, 'ПИТАНИЕ ОТКЛЮЧЕНО. ВОССТАНОВИТЕ ТРИ ПРЕДОХРАНИТЕЛЯ.'] })),
      mix(flash, mix(lit(0.4), { at: [0, 0.3, 6], to: [0, 0.3, 0], look: [0, 1.0, -8], fov: 55, dur: 2, roll: 0.07, rollTo: 0.02 })),
      last(r, true)
    ],
    outro: outro(11)
  };

  // ------------------------------------------------------------ 12 NIGHT TRAIN — вагон x ±2.8, z 13…-73; проход |x| < 1.7
  CINEMA[12] = {
    intro: (r) => [
      { at: [0, 2.85, 12.4], to: [0, 2.85, -1.5], look: [0, 1.2, -22], fov: 68, roll: 0.05, rollTo: -0.04, dur: 4.2, caption: CAP('NEXA EXPRESS — NIGHT TRAIN 12') },
      mix(dip, { at: [-1.3, 0.95, 7], to: [-1.3, 0.95, 2.6], look: [2.8, 1.7, 3], lookTo: [2.8, 1.6, -2], fov: 46, dur: 2.6, say: [SYS, 'СОСТАВ 12. ПЕРЕВОЗКА СУБЪЕКТА 083. ПОСТОРОННИХ НЕТ.'] }),
      mix(flash, { at: [0.6, 0.35, 5], to: [0.6, 0.35, -1], look: [0, 1.1, -20], fov: 58, dur: 2.2, roll: -0.05, rollTo: 0.03 }),
      last(r)
    ],
    outro: (r) => [back(r, 1.4), crane(r, DONE(12), { roll: 0.05, rollTo: -0.02 })]
  };

  // ------------------------------------------------------------ 13 OPEN FIRE — арена x ±17, z 8…-28, потолок 5.2
  CINEMA[13] = {
    intro: (r) => [
      { at: [-15, 4.8, 6.5], to: [15, 4.8, 6.5], look: [0, 1, -12], fov: 74, dur: 4.5, caption: CAP('ARENA 13 — OPEN FIRE') },
      mix(dip, { orbit: { c: [0, -10], r: 6.5, a0: 0, a1: 1.8, h: 2.6, ly: 1.2 }, fov: 48, dur: 3, say: ['ANNOUNCER', 'ВНИМАНИЕ. АРЕНА ОТКРЫТА. СУБЪЕКТ 083 ВЫХОДИТ НА ПЛОЩАДКУ.'] }),
      mix(flash, { at: [0, 5.0, 6], to: [0, 5.0, -4], look: [0, 0, -10], fov: 80, dur: 2.2, hand: 0.5 }),
      last(r)
    ],
    outro: (r) => [back(r), crane(r, DONE(13), { fov: 66, fovTo: 50 })]
  };

  // ------------------------------------------------------------ 14 CLOSE QUARTERS — коридор x ±2, z 18…-72; двери по бокам
  CINEMA[14] = {
    intro: (r) => [
      { at: [0, 2.6, 16.8], to: [0, 2.6, -8], look: [0, 1.2, -40], fov: 70, dur: 4.6, caption: CAP('BLOCK D — HOSTAGE RESCUE') },
      mix(dip, { at: [1.5, 1.45, 11.2], to: [1.5, 1.45, 9.4], look: [-2, 1.3, 6], fov: 44, dur: 2.4, say: [SYS, 'ПЯТЬ КОМНАТ. ЗАЧИСТИТЬ БЫСТРО. ЗАЛОЖНИКОВ НЕ ТРОГАТЬ.'] }),
      mix(flash, { orbit: { c: [-2, 6], r: 1.6, a0: 0.3, a1: 2.8, h: 1.4, ly: 1.3 }, fov: 44, dur: 2.4, roll: 0.05, rollTo: -0.05 }),
      last(r)
    ],
    outro: outro(14)
  };

  // ------------------------------------------------------------ 15 CONTROL ROOM — x ±14, z 18…-66; перегородки z -6, -28, -52
  CINEMA[15] = {
    intro: (r) => [
      { at: [-12.8, 3.5, 17], to: [12.8, 3.5, 17], look: [0, 0.5, -8], fov: 74, dur: 4.5, caption: CAP('CONTROL BLOCK 15 — SECURITY LEVEL 4') },
      mix(dip, { at: [-7.5, 1.7, 4], to: [-7.5, 1.7, -7], look: [-3, 1.3, -20], fov: 62, fovTo: 40, dur: 3.2, say: [SYS, 'ТЕРМИНАЛ ДОСТУПА — В ГЛУБИНЕ БЛОКА. ОХРАНА НА ОБХОДЕ.'] }),
      mix(flash, { at: [0, 2.6, -38], to: [0, 2.2, -42.5], look: [0, 0.9, -47], fov: 50, dur: 2.4 }),
      last(r)
    ],
    outro: outro(15)
  };

  // ------------------------------------------------------------ 16 NEXA PROTOCOL — зал x ±20, z 12…-32, потолок 5.4, табличка на z=-31.85
  CINEMA[16] = {
    intro: (r) => [
      { at: [-18.5, 5.0, 10.5], to: [18.5, 5.0, -22], look: [0, 2.4, -30], fov: 72, dur: 5, caption: CAP('PROTOCOL CHAMBER — NEXA CORE') },
      mix(dip, { at: [0, 0.5, 2], to: [0, 0.8, -3], look: [0, 3.2, -31], fov: 48, dur: 3, say: [SYS, 'ВСЕ ПОДСИСТЕМЫ ОТКЛЮЧЕНЫ. ПРОТОКОЛ NEXA АКТИВЕН.'] }),
      mix(glitch, { orbit: { c: [0, -10], r: 12, a0: 2.7, a1: 3.6, h: 3.2, ly: 1.5 }, fov: 50, dur: 2.8, roll: 0.05, rollTo: -0.03 }),
      last(r)
    ],
    // финал зависит от выбора игрока: выстрелить в безоружного (shoot) или опустить оружие (spare)
    outro: (r) => {
      const shot = r.choice === 'shoot';
      const cap = 'TASK 16 COMPLETE\n' + (shot ? 'PROTOCOL EXECUTED — SUBJECT 084 ELIMINATED' : 'PROTOCOL REJECTED — NEW RESULT RECORDED');
      return [
        mix(back(r, shot ? 1 : -1), { slow: 0.45, dur: 3 }),
        crane(r, cap, shot ? { cut: 'glitch', roll: 0.08, rollTo: 0.02, fov: 54, fovTo: 40 } : { cut: 'flash', fov: 64, fovTo: 52, dur: 3.8 })
      ];
    }
  };
}());
