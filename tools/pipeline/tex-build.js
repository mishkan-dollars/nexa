// dev-only: серые текстуры поверхностей из CC0-набора ambientCG (color-карты) → assets/tex/<имя>.jpg (1024², 8 бит, jpeg q80).
'use strict';
const sharp = require('sharp'), fs = require('fs'), path = require('path');
const SRC = process.env.NEXA_TEX || 'C:/Users/nezna/AppData/Local/Temp/claude/C--Users-nezna-Desktop-game/28917271-1492-49e2-a491-02b09fbeee71/scratchpad/tex/col';
const OUT = path.join(__dirname, '..', '..', 'assets', 'tex');
const LIST = { // имя: [исходник, гамма/контраст]
  brick: 'Bricks059', carpet: 'Carpet015', concrete: 'Concrete034', concrete_dark: 'Concrete042A', rough: 'Gravel023', metal: 'Metal038',
  plaster: 'PaintedPlaster017', paving: 'PavingStones070', planks: 'Planks021', checker: 'Tiles074', tile: 'Tiles107', asphalt: 'Asphalt031', concrete_wet: 'Concrete019', steel: 'Metal032'
};
const FLAT = new Set(['plaster', 'carpet', 'asphalt']);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let tot = 0;
  for (const [n, f] of Object.entries(LIST)) {
    const o = path.join(OUT, n + '.jpg');
    let im = sharp(path.join(SRC, f + '.jpg')).greyscale();
    if (FLAT.has(n)) im = im.normalise({ lower: 2, upper: 98 }).linear(0.5, 60); // вялые текстуры — растянуть контраст, чтобы читались в кадре
    await im.resize(1024, 1024).jpeg({ quality: 78, mozjpeg: true }).toFile(o);
    const sz = fs.statSync(o).size; tot += sz; console.log(n.padEnd(14), (sz / 1024).toFixed(0), 'KB');
  }
  console.log('итого', (tot / 1048576).toFixed(2), 'MB');
})();
