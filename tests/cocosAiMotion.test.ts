import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { MechMotionSampler } from '../clients/cocos/assets/scripts/PocMotion.ts';
import sharp from 'sharp';

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
  assert.match(presenter,/this.marineMotion.frame\(s.player,s.elapsedMs,!s.over&&animating\)/);
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

test('AI motion cells are visibly distinct, transparent and nonempty',async()=>{
  const bytes=Buffer.from(readFileSync('art/ai/mech-motion.png.base64','utf8').trim(),'base64');
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,192);
  assert.equal(info.height,96);
  assert.equal(info.channels,4);
  const frames=[];
  for(let i=0;i<8;i++){
    const ox=(i%4)*48,oy=Math.floor(i/4)*48;
    let visible=0;
    const frame=Buffer.alloc(48*48*4);
    for(let y=0;y<48;y++){
      const from=((oy+y)*192+ox)*4;
      data.copy(frame,y*48*4,from,from+48*4);
    }
    for(let p=3;p<frame.length;p+=4)if(frame[p]>8)visible++;
    assert.ok(visible>400&&visible<1900,'frame '+i+' must show a character with clear transparency');
    frames.push(frame);
  }
  for(let i=1;i<8;i++){
    let different=0;
    const a=frames[i-1],b=frames[i];
    for(let p=0;p<a.length;p+=4){
      if(a[p]!==b[p]||a[p+1]!==b[p+1]||a[p+2]!==b[p+2]
        ||a[p+3]!==b[p+3])different++;
    }
    assert.ok(different>150,'successive AI frames '+(i-1)+'/'+i+' must be visually distinct');
  }
});

test('AI mech faces its direction of travel without rotating weapon aim',()=>{
  const motion=new MechMotionSampler();
  assert.equal(motion.facing(),1);
  assert.equal(motion.running(),false);
  motion.frame({x:0,y:0},10);
  assert.ok(motion.frame({x:-2,y:0},120)>=4);
  assert.equal(motion.facing(),-1);
  assert.equal(motion.running(),true);
  motion.frame({x:-2,y:2},240);
  assert.equal(motion.facing(),-1,'vertical travel preserves horizontal heading');
  motion.frame({x:-2,y:2},400);
  assert.equal(motion.running(),false,'rest should not retain motion');
  assert.equal(motion.facing(),-1,'rest keeps last heading');
  motion.frame({x:2,y:2},500);
  assert.equal(motion.facing(),1,'moving right restores default facing');
  motion.frame({x:2,y:2},510,false);
  assert.equal(motion.running(),false,'pause disables run');
  assert.ok(motion.frame({x:2,y:2},510,false)<4);
  motion.reset();
  assert.equal(motion.facing(),1,'new runs reset facing');
});

test('both renderers mirror mech only, never attached weapons',()=>{
  const presenter=readFileSync('clients/cocos/assets/scripts/PocArtSprites.ts','utf8');
  const battle=readFileSync('clients/cocos/assets/scripts/PocBattle.ts','utf8');
  const preview=readFileSync('clients/cocos-preview/src/main.ts','utf8');
  assert.match(presenter,/this.player.node.setScale\(this.marineMotion.facing\(\),1,1\)/);
  assert.match(preview,/g.scale\(mechMotionState.facing\(\),1\)/);
  assert.match(preview,/g.restore\(\)/);
  assert.match(battle,/this.art.sync\(s, this.world.heroId, w, h, !s.over && !this.world.decision\)/);
  assert.match(presenter,/this.marineMotion.frame\(s.player,s.elapsedMs,!s.over&&animating\)/);
  assert.match(presenter,/sprite.node.angle=mount.angle\*180\/Math.PI/);
});
