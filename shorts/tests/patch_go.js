const fs = require('fs');
let s = fs.readFileSync('js/app.js', 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('nf: ' + a.slice(0, 60)); s = s.replace(a, b); };
rep("function startMission(replayId) {", "function startMission(replayId, force) {");
rep("if (id > taskProgress && completedTasks.indexOf(id) === -1) return;", "if (!force && id > taskProgress && completedTasks.indexOf(id) === -1) return;");
rep("      bootComplete = true;\r\n      audio.playMusic('menu');\r\n      render();\r\n    }, 2800);".replace(/\r\n/g, s.includes('\r\n') ? '\r\n' : '\n'),
    "      bootComplete = true;\n      audio.playMusic('menu');\n      render();\n      // отладка: ?go=48 — сразу запустить миссию в обход замков списка; с ?m48=<этап> финал начнётся с этого этапа (flash, head, bombs…)\n      var go = /[?&]go=(\d+)/.exec(location.search);\n      if (go) startMission(Number(go[1]), true);\n    }, 2800);".replace(/\n/g, s.includes('\r\n') ? '\r\n' : '\n'));
fs.writeFileSync('js/app.js', s);
console.log('ok', s.includes('\r\n') ? 'CRLF' : 'LF');
