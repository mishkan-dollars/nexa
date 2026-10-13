// dev-only: FBX/OBJ → GLB через assimpjs.  node convert.js <in> <out.glb>
'use strict';
const fs = require('fs');
const path = require('path');
const assimpjs = require('assimpjs');

async function convert(inFile, outFile) {
  const ajs = await assimpjs();
  const list = new ajs.FileList();
  list.AddFile(path.basename(inFile), fs.readFileSync(inFile));
  const res = ajs.ConvertFileList(list, 'glb2');
  if (!res.IsSuccess() || res.FileCount() < 1) throw new Error('assimp: ' + res.GetErrorCode());
  fs.writeFileSync(outFile, Buffer.from(res.GetFile(0).GetContent()));
}
module.exports = convert;
if (require.main === module) convert(process.argv[2], process.argv[3]).then(() => console.log('ok'), (e) => { console.error(e.message); process.exit(1); });
