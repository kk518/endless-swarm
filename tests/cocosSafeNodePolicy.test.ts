import test from 'node:test';
import assert from 'node:assert/strict';
import { CocosRunController } from '../clients/cocos/assets/scripts/m6/runController.ts';
import { createRunRandoms } from '../clients/cocos/assets/scripts/m6/runRandom.ts';
import { preservePreviousCheckpoint } from
  '../clients/cocos/assets/scripts/m6/safeNodePolicy.ts';

function newSaved(seed:number, id:string) {
  const run=new CocosRunController({seed,runId:id,mode:'expedition'});
  const save=run.safeSnapshot('marine',0,createRunRandoms(seed).combat.snapshot(),1000);
  assert.ok(save);
  return {run,save:save!};
}
test('M6 page refresh cannot silently erase an existing safe-node checkpoint',()=>{
  const saved=newSaved(42,'previous-saved-001');
  saved.run.tick(saved.run.currentWave.durationMs);
  const old=saved.run.safeSnapshot('marine',5,
    createRunRandoms(42).combat.snapshot(),2000);
  assert.ok(old);
  const fresh=newSaved(71,'new-on-boot-001');
  assert.equal(preservePreviousCheckpoint(old!,fresh.save),true,
    'auto-created fresh run should not overwrite a resumable expedition');
  assert.equal(preservePreviousCheckpoint(old!,old!),false,
    'resuming the original run must still update its own save');
  assert.equal(preservePreviousCheckpoint(null,fresh.save),false);
  fresh.run.tick(fresh.run.currentWave.durationMs);
  const progressed=fresh.run.safeSnapshot('marine',3,
    createRunRandoms(71).combat.snapshot(),3000);
  assert.ok(progressed);
  assert.equal(preservePreviousCheckpoint(old!,progressed!),false,
    'a distinct run may replace the previous one after a meaningful encounter');
});
