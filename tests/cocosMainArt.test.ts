import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const script=readFileSync('scripts/export-main-art.mjs','utf8');
const art=readFileSync('src/game/Art.ts','utf8');
test('all M4 main art definitions are exported without invented assets',()=>{
 const keys=[...art.matchAll(/make\('([^']+)',\s*(\d+),\s*(\d+)/g)].map(x=>x[1]);
 const block=script.match(/const expected=\[([\s\S]+?)\];/);
 assert.ok(block);
 const expected=[...block[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
 assert.deepEqual(expected,keys);
 assert.equal(new Set(keys).size,16);
});
test('exact source shapes are exported to PNG for both rendering engines',()=>{
 for(const op of ['fillRect','fillRoundedRect','fillTriangle','fillCircle',
  'fillEllipse','strokeCircle','strokeEllipse','lineBetween'])
  assert.ok(script.includes(op+'('));
 assert.match(script,/sharp\(Buffer\.from\(g\.svg\(\)\)/);
 assert.match(script,/clients\/cocos\/assets\/resources\/main-art/);
 assert.match(script,/clients\/cocos-preview\/public\/main-art/);
});
