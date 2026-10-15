(function () {
  'use strict';
  const D = {
    en: { title: 'YOU RECEIVED A GIFT!', titleA: 'GIFT FROM THE ADMINISTRATION', from: 'FROM', admin: 'NEXA / ADMIN', open: 'OPEN', take: 'CLAIM', later: 'LATER', more: '{n} MORE', msgph: 'Message (optional, up to 80)', chip: 'GIFT WAITING: {n}', added: 'KP ARE ALREADY IN YOUR BALANCE', kp: 'KP', tab: 'GIFTS' },
    ru: { title: 'ВЫ ПОЛУЧИЛИ ПОДАРОК!', titleA: 'ПОДАРОК ОТ АДМИНИСТРАЦИИ', from: 'ОТ', admin: 'NEXA / ADMIN', open: 'ОТКРЫТЬ', take: 'ЗАБРАТЬ', later: 'ПОЗЖЕ', more: 'ЕЩЁ {n}', msgph: 'Сообщение (необязательно, до 80)', chip: 'ПОДАРОК ЖДЁТ: {n}', added: 'KP УЖЕ НА ВАШЕМ БАЛАНСЕ', kp: 'KP', tab: 'ПОДАРКИ' },
    de: { title: 'DU HAST EIN GESCHENK ERHALTEN!', titleA: 'GESCHENK VON DER VERWALTUNG', from: 'VON', admin: 'NEXA / ADMIN', open: 'OEFFNEN', take: 'ABHOLEN', later: 'SPAETER', more: 'NOCH {n}', msgph: 'Nachricht (optional, bis 80)', chip: 'GESCHENK WARTET: {n}', added: 'KP SIND SCHON AUF DEINEM KONTO', kp: 'KP', tab: 'GESCHENKE' }
  };
  window.NexaGiftText = function (k, v) {
    const l = (window.I18N && I18N.lang) || 'en', t = (D[l] || D.en)[k] || D.en[k] || k;
    return v ? t.replace(/\{(\w+)\}/g, (m, x) => (v[x] == null ? '' : String(v[x]))) : t;
  };
}());
