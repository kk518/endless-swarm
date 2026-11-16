import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { MechMotionSampler } from '../clients/cocos/assets/scripts/PocMotion.ts';

test('AI-generated mech animation atlas is reproducible and shared by Creator and Canvas',()=>{
  const source=readFileSync('art/ai/mech-motion.png.base64','utf8').trim();
  const bytes=Buffer.from(source,'base64');
  assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16),192);
  assert.equal(bytes.readUInt32BE(20),96);
  assert.ok(bytes.length>=3000 && bytes.length<300000);
  execFileSync(process.execPath,['scripts/export-ai-motion.mjs'],{timeout:30000});
  for(const path of [
    'clients/cocos/assets/resources/ai-motion/mech-motion.png',
    'clients/cocos-preview/public/ai-motion/mech-motion.png',
  ])assert.deepEqual(readFileSync(path),bytes,path+' must preserve exact source art');
});

test('AI idle/run sprites are sampled from fixed atlas cells without changing combat',()=>{
  const presenter=readFileSync('clients/cocos/assets/scripts/PocArtSprites.ts','utf8');
  const battle=readFileSync('clients/cocos/assets/scripts/PocBattle.ts','utf8');
  const preview=readFileSync('clients/cocos-preview/src/main.ts','utf8');
  const smoke=readFileSync('scripts/smoke-cocos-web.mjs','utf8');
  assert.match(presenter,/ai-motion\/mech-motion\/texture/);
  assert.match(presenter,/frame.rect=new Rect\(/);
  assert.match(presenter,/this.marineMotionFrames.length===8/);
  assert.match(presenter,/this.marineMotion.frame\(s.player,s.elapsedMs,!s.over\)/);
  assert.match(presenter,/this.player.spriteFrame=this.marineMotionFrames\[marineFrame\]/);
  assert.match(presenter,/for\(const frame of this.marineMotionFrames\)frame.destroy\(\)/);
  assert.match(battle,/aiMotionReady: this.art.motionReady\(\)/);
  assert.match(preview,/mechMotion.src = '\.\/ai-motion\/mech-motion.png'/);
  assert.match(preview,/mechMotionState.frame\(/);
  assert.match(preview,/g.drawImage\(mechMotion, \(index % 4\) \* 48/);
  assert.match(smoke,/originalMainArt/);
  assert.doesNotMatch(presenter,/applyDamage|registerKill|chooseDecision|Math.random/);
});

test('mech motion sampling follows movement, coast, pause and run restart',()=>{
  const motion = new MechMotionSampler();
  const p={x:0,y:0};
  assert.equal(motion.frame(p,0),0);
  assert.equal(motion.frame(p,400),1);
  p.x=1;
  assert.equal(motion.frame(p,440),4,'moving uses the second atlas row');
  assert.equal(motion.frame(p,550),5,'brief input gaps retain locomotion');
  assert.equal(motion.frame(p,566),1,'stopping returns to idle row');
  p.y=1;
  assert.ok(motion.frame(p,620)>=4);
  assert.ok(motion.frame(p,650,false)<4,'death or pause prevents running');
  assert.equal(motion.frame(p,0),0,'new run clock resets phase');
  motion.reset();
  assert.equal(motion.frame(p,10),0);
  assert.equal(motion.frame({x:Number.NaN,y:0},30),0,'bad render input resets safely');
});
