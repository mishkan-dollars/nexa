(function () {
  'use strict';
  const D = {
    en: { ban: 'ACCOUNT BLOCKED', reason: 'Reason', until: 'until', forever: 'permanently', grant: 'Admin gave you {n} KP', locked: 'Admin KP is waiting: close DevTools / fix the game files', dev: 'DEVTOOLS DETECTED: spending, trades and rewards are locked online until you close them.', integ: 'GAME FILES WERE MODIFIED: online economy is locked.', dup: 'THE GAME IS ALREADY OPEN IN ANOTHER TAB: online, KP and rewards work only there.', dupbtn: 'MAKE THIS TAB THE MAIN ONE' },
    ru: { ban: 'АККАУНТ ЗАБЛОКИРОВАН', reason: 'Причина', until: 'до', forever: 'навсегда', grant: 'Админ выдал {n} KP', locked: 'KP от админа ждут: закройте DevTools / восстановите файлы игры', dev: 'ОТКРЫТЫ DEVTOOLS: траты, обмены и награды в онлайне заблокированы, пока вы их не закроете.', integ: 'ФАЙЛЫ ИГРЫ ИЗМЕНЕНЫ: онлайн-экономика заблокирована.', dup: 'ИГРА УЖЕ ОТКРЫТА В ДРУГОЙ ВКЛАДКЕ: онлайн, KP и награды работают только там.', dupbtn: 'СДЕЛАТЬ ЭТУ ВКЛАДКУ ОСНОВНОЙ' },
    de: { ban: 'KONTO GESPERRT', reason: 'Grund', until: 'bis', forever: 'dauerhaft', grant: 'Admin hat dir {n} KP gegeben', locked: 'Admin-KP warten: DevTools schliessen / Spieldateien wiederherstellen', dev: 'DEVTOOLS ERKANNT: Ausgaben, Handel und Belohnungen sind online gesperrt, bis du sie schliesst.', integ: 'SPIELDATEIEN VERAENDERT: Online-Wirtschaft ist gesperrt.', dup: 'DAS SPIEL IST SCHON IN EINEM ANDEREN TAB OFFEN: Online, KP und Belohnungen gehen nur dort.', dupbtn: 'DIESEN TAB ZUM HAUPT-TAB MACHEN' }
  };
  window.NexaAdminText = function (k, v) {
    const l = (window.I18N && I18N.lang) || 'en', t = (D[l] || D.en)[k] || D.en[k] || k;
    return v ? t.replace(/\{(\w+)\}/g, (m, x) => (v[x] == null ? '' : String(v[x]))) : t;
  };
}());
