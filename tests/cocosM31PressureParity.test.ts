import test from 'node:test';
import assert from 'node:assert/strict';
import { PocWorld, POC } from '../clients/cocos/assets/scripts/PocWorld.ts';
import {
  pressurePlan, SURGE_PERIOD_MS, SURGE_WARNING_MS, spawnOffset,
} from '../clients/cocos/assets/scripts/m6/pressure.ts';
import { mobileViewport } from '../clients/cocos/assets/scripts/PocViewport.ts';

function world(seed=518): PocWorld {
  const viewport = mobileViewport(450,800);
  return new PocWorld(viewport.worldWidth,viewport.worldHeight,seed);
}

test('M3.1 main pressure plan is used for actual Cocos encounter interval and group size', () => {
  const game=world();
  const opening=pressurePlan(1,0,game.currentWaveDurationMs);
  assert.equal(opening.intervalMs,690);
  assert.equal(opening.groupSize,1);
  assert.equal(game.state.surgesTriggered,0);
  game.state.enemies.length=0;
  for(let frame=0;frame<110;frame++){
    game.state.enemies.length=0;
    game.advance(POC.fixedStepMs,{x:0,y:0});
  }
  assert.equal(game.state.spawnGroupSize,opening.groupSize);
  assert.ok(game.state.spawnIntervalMs < opening.intervalMs,
    'canonical within-wave interval falls as elapsed time increases');
  assert.ok(game.state.arrivals.length > 0 || game.state.enemies.length > 0);
  assert.equal(spawnOffset(1),.7);
  assert.equal(spawnOffset(2),-.7);
});

test('M3.1 surge telegraphs for 1.25s every 14.5s, without a forced modal', () => {
  const game=world();
  let warned=false,triggered=false;
  let earliest=0;
  for(let frame=0;frame<1040;frame++){
    // Isolate timed pacing from combat difficulty; pressure must advance
    // even when there are no enemies to kill and no XP choices.
    game.state.enemies.length=0;
    game.state.arrivals.length=0;
    game.heal(2);
    game.advance(POC.fixedStepMs,{x:0,y:0});
    if(!warned && game.state.surgeWarningMs>0){
      warned=true; earliest=game.state.elapsedMs;
      assert.ok(game.state.surgeWarningMs<=SURGE_WARNING_MS);
      assert.equal(game.state.surgesTriggered,0);
    }
    if(game.state.surgesTriggered>0){triggered=true;break;}
  }
  assert.ok(warned,'14.5s main surge warning should appear');
  assert.ok(earliest >= SURGE_PERIOD_MS - 100 && earliest < SURGE_PERIOD_MS + 100);
  assert.ok(triggered,'surge pack fires after main 1250ms warning window');
  assert.equal(game.state.surgeWarningMs,0);
  assert.equal(game.state.surgesTriggered,1);
  assert.equal(game.decision,null,'surge may not pause the battle for a modal');
});

test('M3.1 new campaign run clears an armed surge and reproduces fixed-seed pacing', () => {
  const a=world(37),b=world(37);
  for(let i=0;i<140;i++){
    a.advance(POC.fixedStepMs,{x:0.4,y:0.1});
    b.advance(POC.fixedStepMs,{x:0.4,y:0.1});
  }
  assert.deepEqual(a.state,b.state);
  const before=a.state.spawnIntervalMs;
  a.reset();
  assert.equal(a.state.surgeWarningMs,0);
  assert.equal(a.state.surgesTriggered,0);
  for(let i=0;i<140;i++)a.advance(POC.fixedStepMs,{x:0.4,y:0.1});
  assert.equal(a.state.spawnIntervalMs,before);
  assert.deepEqual(a.state.enemies,b.state.enemies);
  assert.deepEqual(a.state.arrivals,b.state.arrivals);
});

test('M3.1 at 60% of a wave creates larger groups and faster movement multipliers', () => {
  const duration=60000;
  for(const tier of [1,2,3,4,5]){
    const early=pressurePlan(tier,0,duration);
    const late=pressurePlan(tier,duration*.75,duration);
    assert.ok(late.intervalMs < early.intervalMs);
    assert.ok(late.groupSize >= early.groupSize);
    assert.ok(late.speedMultiplier > early.speedMultiplier);
    assert.ok(late.spawnRadius>=325);
  }
});
