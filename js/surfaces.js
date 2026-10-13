// NEXA: текстуры пола и стен (assets/floor.png, assets/wall.png). Работают по мировым координатам, поэтому
// любая коробка (комната, коридор, потолок) получает правильный масштаб плитки без правки UV. Если картинки нет — миссии остаются с цветом, как раньше.
(function () {
  'use strict';
  const C = window.Missions && window.Missions._core;
  if (!C) return;
  const { Run } = C;
  // база (floor.png / wall.png) — для миссий без темы; тематические наборы лежат в assets/tex/*.jpg (CC0, ambientCG, серые)
  const BASE = { floor: ['assets/floor.png', 0.2], wall: ['assets/wall.png', 0.25] }; // [файл, 1 / метров на повторение]
  const TX = {
    brick: 0.8, carpet: 1.0, concrete: 0.35, concrete_dark: 0.35, rough: 0.7, metal: 0.6, plaster: 0.3, paving: 0.5, planks: 0.5, checker: 0.45, tile: 0.5, asphalt: 0.5, concrete_wet: 0.3, steel: 0.6
  };
  const tx = (n) => ['assets/tex/' + n + '.jpg', TX[n]];
  const SETS = {
    office: ['carpet', 'plaster', 'plaster'], lab: ['tile', 'tile', 'steel'], vault: ['concrete_dark', 'concrete', 'steel'],
    bunker: ['concrete_dark', 'concrete', 'concrete'], industrial: ['concrete_dark', 'metal', 'metal'], yard: ['asphalt', 'brick', 'metal'],
    dock: ['concrete_wet', 'metal', 'metal'], alley: ['paving', 'brick', 'brick'], day: ['paving', 'concrete', 'concrete'], roof: ['asphalt', 'brick', 'concrete'],
    bridge: ['asphalt', 'concrete', 'concrete'], garage: ['concrete_dark', 'concrete', 'concrete'], metro: ['concrete', 'tile', 'concrete'],
    sewer: ['concrete_dark', 'brick', 'brick'], mansion: ['planks', 'plaster', 'planks']
  };
  const cache = {}; // url+size -> { canvas, avg }
  const rawP = {};  // url -> Promise<Image|null>

  function loadImg(url) {
    return rawP[url] || (rawP[url] = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; }));
  }
  // картинки качаются один раз за сессию; обесцвечивание и уменьшение для слабых устройств делает prepare()
  C.loadSurfaces = function (taskId) {
    const th = C.props && C.props.themeOf ? C.props.themeOf(taskId) : null, set = SETS[th];
    const pick = set ? { floor: tx(set[0]), wall: tx(set[1]), block: tx(set[2]) } : { floor: BASE.floor, wall: BASE.wall };
    const keys = Object.keys(pick);
    return Promise.race([Promise.all(keys.map((k) => loadImg(pick[k][0]))), new Promise((r) => setTimeout(() => r(keys.map(() => null)), 8000))]).then((a) => {
      const o = {};
      keys.forEach((k, i) => { o[k] = a[i] ? { img: a[i], url: pick[k][0], tile: pick[k][1] } : null; });
      if (set && (!o.floor || !o.wall)) return C.loadSurfaces(null); // нет тематических файлов — обычные
      return o;
    });
  };

  // серый холст нужного размера + средняя яркость (чтобы цвет миссии оставался «тоном» поверхности)
  function prepare(img, size) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, size, size);
    const d = g.getImageData(0, 0, size, size), p = d.data;
    let sum = 0;
    for (let i = 0; i < p.length; i += 4) { const y = (p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11); p[i] = p[i + 1] = p[i + 2] = y; sum += y; }
    g.putImageData(d, 0, 0);
    return { canvas: c, avg: sum / (p.length / 4) / 255 };
  }

  Run.prototype.initSurfaces = function (imgs) {
    const T = THREE;
    this.surf = null;
    if (!imgs || !imgs.floor || !imgs.wall) return;
    const size = this.qName === 'LOW' ? 512 : 1024;
    const aniso = Math.min(this.qName === 'LOW' ? 1 : 4, this.renderer.capabilities.getMaxAnisotropy ? this.renderer.capabilities.getMaxAnisotropy() : 1);
    const mk = (e) => {
      const key = e.url + size;
      if (!cache[key]) cache[key] = prepare(e.img, size);
      const t = new T.CanvasTexture(cache[key].canvas);
      t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = aniso; t.needsUpdate = true;
      return { tex: t, avg: cache[key].avg, tile: e.tile };
    };
    this.surf = { floor: mk(imgs.floor), wall: mk(imgs.wall), block: imgs.block ? mk(imgs.block) : null, mats: {} };
  };

  // тип поверхности по размерам коробки: пол / потолок / стена (или null — обычный цветной материал)
  Run.prototype.surfKind = function (x, y, z, w, h, d, solid, color) {
    if (!this.surf || color < 0x101010) return null;
    const thin = Math.min(w, d) <= 0.5, big = Math.max(w, d);
    if (!solid && h <= 0.16 && w >= 2.5 && d >= 2.5) return y < 0.5 ? 'floor' : (y > 2.2 ? 'ceil' : null);
    if (thin && h >= 0.4 && big >= 1 && (solid || h >= 0.5)) return 'wall';
    if (this.surf.block && solid && h >= 0.45 && Math.min(w, d) >= 0.55 && Math.max(w, d) < 6.5) return 'block'; // укрытия, колонны, ящики
    return null;
  };

  Run.prototype.surfMat = function (kind, color) {
    const S = this.surf, k = kind + color;
    if (S.mats[k]) return S.mats[k];
    const T = THREE, src = S[kind === 'floor' ? 'floor' : kind === 'block' ? 'block' : 'wall'];
    const col = new T.Color(color), tint = 1 / Math.max(0.2, src.avg);
    const m = new T.MeshLambertMaterial({ color: new T.Color(col.r * tint, col.g * tint, col.b * tint), map: src.tex });
    const tile = src.tile;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTile = { value: tile };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform float uTile;')
        .replace('#include <map_fragment>', 'vec3 an_ = abs(vWN); vec2 wuv_ = an_.y > 0.5 ? vWP.xz : (an_.x > 0.5 ? vWP.zy : vWP.xy); diffuseColor *= texture2D(map, wuv_ * uTile);');
    };
    m.customProgramCacheKey = () => 'nexa-surf';
    S.mats[k] = m;
    return m;
  };
}());
