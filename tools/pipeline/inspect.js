// dev-only: сводка по GLB (треугольники, габариты, материалы, текстуры, анимации).  node inspect.js a.glb b.glb …
'use strict';
const fs = require('fs');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { getBounds } = require('@gltf-transform/functions');

(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  for (const f of process.argv.slice(2)) {
    try {
      const doc = await io.read(f);
      const root = doc.getRoot();
      let tris = 0, verts = 0;
      root.listMeshes().forEach((m) => m.listPrimitives().forEach((p) => { const idx = p.getIndices(); const pos = p.getAttribute('POSITION'); verts += pos ? pos.getCount() : 0; tris += (idx ? idx.getCount() : (pos ? pos.getCount() : 0)) / 3; }));
      const scene = root.getDefaultScene() || root.listScenes()[0];
      const b = getBounds(scene);
      const sz = [0, 1, 2].map((i) => +(b.max[i] - b.min[i]).toFixed(3));
      const mats = root.listMaterials().map((m) => { const t = m.getBaseColorTexture(); return (m.getName() || '?') + (t ? '[tex ' + (t.getSize() || []).join('x') + ']' : '[no-tex ' + m.getBaseColorFactor().map((v) => +v.toFixed(2)).join(',') + ']'); });
      console.log(f.split(/[\\/]/).pop(), '| MB', (fs.statSync(f).size / 1048576).toFixed(1), '| tris', Math.round(tris), '| meshes', root.listMeshes().length, '| size', sz.join('x'), '| skins', root.listSkins().length, '| anims', root.listAnimations().map((a) => a.getName() + ':' + a.listChannels().length).join(','), '| tex', root.listTextures().length, '| mats', mats.slice(0, 5).join(' ; '));
    } catch (e) { console.log(f, 'ERR', e.message); }
  }
})();
