'use strict';
const fs = require('fs');
const path = require('path');
const { build } = require('./release-lib');

const arg = (n) => process.argv.includes('--' + n);
const online = process.env.YANDEX_ONLINE === '1' || arg('online');
const ads = process.env.YANDEX_ADS === '1' || arg('ads');
const cloud = process.env.YANDEX_CLOUD === '1' || arg('cloud');
const dev = arg('dev'), noMin = arg('no-min');

const gateExtra = 'w.__YA=1;w.__ONLINE=' + (online ? 1 : 0) + ';' + (ads ? 'w.__YAADS=1;' : '') + (cloud ? 'w.__YACLOUD=1;' : '');

const transformJs = (name, s) => {
  if (name === 'js/net.js') s = s.replace("'https://t.me/nexaindustries'", "''");
  if (name === 'js/onlinelobby.js') {
    s = s.replace(/'<a class="ol-tab ol-tg"[^\n]*?<\/a><\/nav>'/, "'</nav>'");
    s = s.replace(/'<a class="ol-tglink"[^\n]*?<\/a><\/div><\/aside>'/, "'</div></aside>'");
  }
  if (name === 'js/desktop.js') s = s.replace("window.open(u, '_blank', 'noopener,noreferrer')", 'void 0');
  if (name === 'js/servers.js' && !online) s = s.replace(/'wss?:\/\/[^']+'/g, '').replace(/\[\s*(,\s*)*\]/g, '[]').replace(/\[(\s*,)+/g, '[').replace(/,(\s*,)+/g, ',');
  return s;
};

const transformHtml = (h) => {
  h = h.replace(/\s*<link rel="preconnect"[^>]*>/g, '').replace(/\s*<link rel="stylesheet" href="https:\/\/fonts[^>]*>/g, '');
  h = h.replace(/\s*<link rel="manifest"[^>]*>/, '').replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '');
  h = h.replace('<script defer src="js/nosel.js', '<script src="/sdk.js"></script>\n  <script defer src="js/yagames.js?v=1"></script>\n  <script defer src="js/nosel.js');
  return h;
};

build({
  out: dev ? 'nexa-yandex-dev.zip' : 'nexa-yandex.zip', dev, noMin, gateExtra, transformJs, transformHtml,
  transformCss: (c) => c.replace(/@import url\('https:\/\/fonts[^)]*\);?/g, ''),
  skip: /^(sw\.js|manifest\.webmanifest)$/
});
