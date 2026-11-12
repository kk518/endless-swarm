import test from 'node:test';
import assert from 'node:assert/strict';
import { PocWorld, POC } from '../clients/cocos/assets/scripts/PocWorld.ts';
import { CocosRunController } from '../clients/cocos/assets/scripts/m6/runController.ts';
import { chooseAutomaticUpgrade } from '../clients/cocos/assets/scripts/m6/autoGrowth.ts';

function reachReward(world: PocWorld): void {
  const frames = Math.ceil(world.currentWaveDurationMs / POC.fixedStepMs) + 4;
  for (let i=0; i<frames && !world.decision && !world.state.over; i++) {
    world.heal(1);
    world.advance(POC.fixedStepMs,{x:0.5,y:0});
  }
  assert.equal(world.decision?.kind,'card');
}
test('M5.2 safe node changes focus and equipped weapon only; no XP modal', () => {
  const world = new PocWorld(600, 1000, 518);
  assert.deepEqual(world.state.training,{weapon:'rifle',focus:'damage'});
  assert.equal(world.setTraining('rifle','speed'),false,'combat must not open a training dialog');
  reachReward(world);
  const offered = world.decision;
  assert.equal(offered?.kind,'card');
  assert.equal(world.setTraining('flame','rate'),false,'unowned weapon not selectable');
  assert.deepEqual(world.state.training,{weapon:'rifle',focus:'damage'});
  assert.equal(world.setTraining('rifle','rate'),true);
  assert.deepEqual(world.state.training,{weapon:'rifle',focus:'rate'});
  assert.equal(world.chooseDecision(0),true);
  assert.equal(world.state.training.focus,'rate');
  assert.equal(world.decision,null);
  assert.equal(world.setTraining('rifle','damage'),false,'no forced XP window');
});
test('M5.2 main automatic upgrade logic uses selected owned specialization', () => {
  const run = new CocosRunController({seed:81,runId:'training-m5-001'});
  const base=run.snapshot();
  assert.equal(chooseAutomaticUpgrade(base.build,base.growth,base.training),'weapon:rifle');
  run.tick(run.currentWave.durationMs);
  assert.equal(run.snapshot().phase,'reward');
  run.setTraining('rifle','speed');
  const changed=run.snapshot();
  assert.equal(changed.training.weapon,'rifle');
  assert.equal(changed.training.focus,'speed');
  const option=changed.decision;
  assert.equal(option?.kind,'card');
  if(option?.kind!=='card')throw Error('missing reward options');
  run.chooseCard(option.options[0].id);
  for(let i=0;i<150;i++)run.registerKill('grunt');
  assert.ok(run.snapshot().growth.level>1);
  assert.equal(run.snapshot().decision,null,'kills must never open XP chooser');
  assert.equal(run.snapshot().training.focus,'speed');
});
