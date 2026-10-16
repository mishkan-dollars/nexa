'use strict';
const { build } = require('./release-lib');
const dev = process.argv.includes('--dev');
const noMin = process.argv.includes('--no-min');
build({ out: dev ? 'nexa-itch-dev.zip' : 'nexa-itch.zip', dev, noMin, gateExtra: 'w.__ONLINE=1;', skip: /^js\/yagames\.js$/ });
