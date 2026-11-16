import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('original vanguard art bakes seven transparent sprites in both engine asset roots',()=>{
  execFileSync(process.execPath,['scripts/export-vanguard-art.mjs'],{timeout:30000});
  const expected: Record<string,[number,number]>={
    marine:[76,100],crawler:[58,64],leaper:[68,74],armored:[74,76],
    spitter:[70,76],bomber:[68,72],broodlord:[114,120],
  };
  for(const [name,[width,height]] of Object.entries(expected)){
    const paths=[
      join('clients/cocos/assets/resources/vanguard-art',name+'.png'),
      join('clients/cocos-preview/public/vanguard-art',name+'.png'),
    ];
    const images=paths.map(p=>readFileSync(p));
    assert.ok(images[0].equals(images[1]),'Creator and preview must share identical art');
    for(const data of images){
      assert.equal(data.toString('hex',0,8),'89504e470d0a1a0a',name+' PNG signature');
      assert.equal(data.readUInt32BE(16),width*3,name+' image width');
      assert.equal(data.readUInt32BE(20),height*3,name+' image height');
      assert.ok(data.length>1000,name+' should contain drawn detail');
    }
  }
});

test('Creator and Canvas prefer redesigned character sprites and retain safe fallback',()=>{
  const presenter=readFileSync('clients/cocos/assets/scripts/PocArtSprites.ts','utf8');
  const preview=readFileSync('clients/cocos-preview/src/main.ts','utf8');
  assert.match(presenter,/vanguard-art\/.*texture/);
  assert.match(presenter,/main-art\/.*texture/);
  assert.match(preview,/vanguard-art\/.*png/);
  assert.match(preview,/main-art\/.*png/);
  assert.match(presenter,/VANGUARD_KEYS/);
});
