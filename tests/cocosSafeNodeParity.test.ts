import test from 'node:test';
import assert from 'node:assert/strict';
import { CocosRunController } from '../clients/cocos/assets/scripts/m6/runController.ts';
import { PocWorld, POC } from '../clients/cocos/assets/scripts/PocWorld.ts';
import { createRunRandoms } from '../clients/cocos/assets/scripts/m6/runRandom.ts';
import {
  parseRunSafeSave, writeRunSafeSave, readRunSafeSave,
} from '../clients/cocos/assets/scripts/m6/runSafeSave.ts';

test('M6 reward snapshot retains all offered cards, training and RNG across restore', () => {
  const run = new CocosRunController({seed:518, runId:'m6-recoverable-001',
    mode:'expedition', battlefieldId:'infested-nest',
    weaponFrameRank:2, repairModuleRank:1});
  assert.equal(run.safeSnapshot('marine',0,42,1000)?.campaign.phase,'playing');
  run.registerKill('grunt');
  run.tick(run.currentWave.durationMs);
  assert.equal(run.snapshot().phase,'reward');
  run.setTraining('rifle','speed');
  const save = run.safeSnapshot('marine',4,createRunRandoms(518).combat.snapshot(),2000);
  assert.ok(save,'valid safe-node snapshot');
  assert.deepEqual(parseRunSafeSave(save),save);
  assert.equal(save!.equipment.weaponFrameRank,2);
  assert.equal(save!.equipment.repairModuleRank,1);
  assert.equal(save!.battlefieldId,'infested-nest');
  assert.equal(save!.cardOfferIds.length,3);
  const reloaded = CocosRunController.fromSafeSnapshot(JSON.parse(JSON.stringify(save)));
  assert.ok(reloaded);
  assert.deepEqual(reloaded!.snapshot().decision,run.snapshot().decision,
    'restoring reward MUST NOT re-roll the offered cards');
  assert.deepEqual(reloaded!.snapshot().training,{weapon:'rifle',focus:'speed'});
  assert.equal(reloaded!.runId,'m6-recoverable-001');
  const originalOffer=run.snapshot().decision;
  assert.equal(originalOffer?.kind,'card');
  if(originalOffer?.kind!=='card')throw Error('missing cards');
  const choice=originalOffer.options[0].id;
  assert.equal(run.chooseCard(choice),true);
  assert.equal(reloaded!.chooseCard(choice),true);
  assert.deepEqual(reloaded!.snapshot().campaign,run.snapshot().campaign);
  assert.deepEqual(reloaded!.snapshot().build,run.snapshot().build);
  const next=run.safeSnapshot('marine',4,createRunRandoms(518).combat.snapshot(),2001);
  assert.equal(next?.campaign.phase,'playing');
  assert.equal(next?.campaign.elapsedMs,0);
});

test('M6 refuses saving during combat, prototype, incomplete hero or invalid state', () => {
  const run=new CocosRunController({seed:17,runId:'m6-save-guard-001',
    mode:'expedition'});
  run.tick(POC.fixedStepMs);
  assert.equal(run.safeSnapshot('marine',0,123,1000),null);
  const prototype=new CocosRunController({seed:17,runId:'m6-prototype-001'});
  assert.equal(prototype.safeSnapshot('marine',0,123,1000),null);
  const fresh=new CocosRunController({seed:17,runId:'m6-hero-guard-001',
    mode:'expedition'});
  assert.equal(fresh.safeSnapshot('kane',0,123,1000),null,
    'schema v2 does not yet support Kane resume');
  assert.equal(fresh.safeSnapshot('marine',0,0,1000),null);
  assert.equal(CocosRunController.fromSafeSnapshot({schemaVersion:2}),null);
});

test('M6 world restores a reward without resurrecting enemies and reuses runId', () => {
  const world=new PocWorld(600,1000,518,'steel-ruins',{},'marine','expedition');
  for(let i=0;i<Math.ceil(world.currentWaveDurationMs/POC.fixedStepMs)+4
    && !world.decision && !world.state.over;i++){
    world.heal(1);
    world.advance(POC.fixedStepMs,{x:0.5,y:0});
  }
  assert.equal(world.decision?.kind,'card');
  assert.equal(world.setTraining('rifle','rate'),true);
  const save=world.safeSnapshot(3000);
  assert.ok(save);
  const restored=PocWorld.fromSafeSnapshot(save,600,1000);
  assert.ok(restored);
  assert.equal(restored!.runId,world.runId);
  assert.deepEqual(restored!.decision,world.decision);
  assert.deepEqual(restored!.state.training,world.state.training);
  assert.equal(restored!.state.enemies.length,0);
  assert.equal(restored!.state.bullets.length,0);
  assert.equal(restored!.state.arrivals.length,0);
  const original=world.decision;
  assert.equal(original?.kind,'card');
  if(original?.kind!=='card')throw Error('missing options');
  assert.equal(restored!.chooseDecision(0),true);
  assert.equal(world.chooseDecision(0),true);
  assert.deepEqual(restored!.state.weaponLevels,world.state.weaponLevels);
  assert.equal(restored!.state.wave,world.state.wave);
});

test('M6 save storage persists only valid snapshots; rejects corruption', () => {
  const run=new CocosRunController({seed:21,runId:'m6-storage-0001',mode:'expedition'});
  const save=run.safeSnapshot('marine',0,createRunRandoms(21).combat.snapshot(),5000);
  assert.ok(save);
  const m=new Map<string,string>();
  const port={getItem:(key:string)=>m.get(key)??null,
    setItem:(key:string,value:string)=>{m.set(key,value);},
    removeItem:(key:string)=>{m.delete(key);}};
  assert.equal(writeRunSafeSave(port,save!),true);
  assert.deepEqual(readRunSafeSave(port),save);
  assert.equal(parseRunSafeSave({...save!,randoms:{...save!.randoms,combat:0}}),null);
  assert.equal(parseRunSafeSave({...save!,cardOfferIds:['feed']}),null);
});
