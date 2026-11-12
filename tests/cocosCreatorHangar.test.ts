import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CreatorHangar, CREATOR_STORAGE_PREFIX,
} from '../clients/cocos/assets/scripts/PocHangar.ts';
import { mobileViewport } from '../clients/cocos/assets/scripts/PocViewport.ts';
import {
  META_STORAGE_KEY, readMetaProgress, saveMetaProgress, newMetaProgress,
} from '../clients/cocos/assets/scripts/m6/metaProgression.ts';
import {
  writeRunSafeSave, readRunSafeSave,
} from '../clients/cocos/assets/scripts/m6/runSafeSave.ts';
import type { GameStoragePort } from '../clients/cocos/assets/scripts/m6/platformStorage.ts';
import { PocWorld, POC } from '../clients/cocos/assets/scripts/PocWorld.ts';

function memoryPort() {
  const records = new Map<string, string>();
  const port: GameStoragePort = {
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => { records.set(key, value); },
    removeItem: key => { records.delete(key); },
  };
  return { port, records };
}
function wrapped(port: GameStoragePort): GameStoragePort {
  return {
    getItem: key => port.getItem(CREATOR_STORAGE_PREFIX + key),
    setItem: (key, value) => port.setItem(CREATOR_STORAGE_PREFIX + key, value),
    removeItem: key => port.removeItem(CREATOR_STORAGE_PREFIX + key),
  };
}
function completed(world: PocWorld): void {
  world.state.over = true;
  world.state.won = false;
  world.state.kills = 75;
  world.state.elapsedMs = 135000;
  world.state.wave = 3;
}
const vp = mobileViewport(450, 800);

test('Creator hangar uses its own namespace and restores persisted battlefield choice', () => {
  const {port, records} = memoryPort();
  const hangar = new CreatorHangar(port);
  assert.equal(hangar.zoneId, 'steel-ruins');
  assert.equal(hangar.chooseZone('infested-nest'), true);
  assert.equal(records.get(CREATOR_STORAGE_PREFIX + 'selected-battlefield'), 'infested-nest');
  const fresh = new CreatorHangar(port);
  assert.equal(fresh.zoneId, 'infested-nest');
  assert.equal(fresh.chooseZone('invalid' as 'steel-ruins'), false);
  assert.equal(fresh.zoneId, 'infested-nest');
  assert.equal(records.has(META_STORAGE_KEY), false, 'original H5 meta is untouched');
  assert.equal(records.has('cocos-preview-m6:' + META_STORAGE_KEY), false);
});

test('Creator settlement is idempotent, battlefield-specific and cannot be farmed twice', () => {
  const {port, records} = memoryPort();
  const hangar = new CreatorHangar(port);
  hangar.chooseZone('infested-nest');
  const world = hangar.launch(vp.worldWidth, vp.worldHeight, 'marine', 'expedition', 813);
  completed(world);
  const first = hangar.settle(world);
  assert.ok(first?.newSettlement);
  assert.ok(first!.earned > 0);
  assert.equal(first!.materialId, 'samples');
  assert.ok(first!.materialEarned > 0);
  assert.equal(hangar.settle(world), null);
  const copied = new CreatorHangar(port);
  const sameWorld = copied.launch(vp.worldWidth, vp.worldHeight, 'marine', 'expedition', 813);
  completed(sameWorld);
  const repeat = copied.settle(sameWorld);
  assert.equal(repeat?.newSettlement, false, 'persistent runId ledger stops replay');
  const meta = readMetaProgress(wrapped(port))!;
  assert.equal(meta.warData, first!.earned);
  assert.equal(meta.samples, first!.materialEarned);
  assert.equal(meta.alloy, 0);
  assert.equal(meta.settledRuns.length, 1);
  assert.equal(records.has(META_STORAGE_KEY), false);
});

test('Creator workshop costs subtract both currencies and affect NEXT deployment only', () => {
  const {port} = memoryPort();
  const metaStorage = wrapped(port);
  assert.equal(saveMetaProgress(metaStorage, {
    ...newMetaProgress(), warData: 500, alloy: 100, samples: 100,
  }), true);
  const hangar = new CreatorHangar(port);
  const earlier = hangar.launch(vp.worldWidth, vp.worldHeight, 'marine', 'prototype', 101);
  assert.equal(earlier.state.player.maxHp, 6);
  assert.equal(hangar.purchase('armor'), true);
  assert.equal(hangar.purchase('weapon-frame'), true);
  assert.equal(hangar.purchase('repair-module'), true);
  assert.equal(earlier.state.player.maxHp, 6, 'workshop must not retroactively upgrade current HP');
  const meta = readMetaProgress(metaStorage)!;
  assert.equal(meta.armorRank, 1);
  assert.equal(meta.weaponFrameRank, 1);
  assert.equal(meta.repairModuleRank, 1);
  assert.ok(meta.warData < 500 && meta.alloy < 100 && meta.samples < 100);
  const next = hangar.launch(vp.worldWidth, vp.worldHeight, 'marine', 'prototype', 102);
  assert.equal(next.state.player.maxHp, 7, 'armor added on next launch');
  assert.equal(next.zoneId, 'steel-ruins');
});

test('Creator clears only the completed run checkpoint after successful settlement', () => {
  const {port} = memoryPort();
  const hangar = new CreatorHangar(port);
  const world = hangar.launch(vp.worldWidth, vp.worldHeight, 'marine', 'expedition', 518);
  for (let i=0; i<Math.ceil(world.currentWaveDurationMs / POC.fixedStepMs)+3 && !world.decision; i++) {
    world.heal(1);
    world.advance(POC.fixedStepMs, {x: 0.4, y: 0});
  }
  assert.equal(world.decision?.kind, 'card');
  const save = world.safeSnapshot(1000);
  assert.ok(save);
  assert.equal(writeRunSafeSave(wrapped(port), save!), true);
  const restored = new CreatorHangar(port).restore(vp.worldWidth,vp.worldHeight);
  assert.equal(restored?.runId, world.runId);
  assert.equal(restored?.zoneId,world.zoneId);
  assert.deepEqual(restored?.decision,world.decision);
  completed(world);
  assert.ok(hangar.settle(world)?.newSettlement);
  assert.equal(readRunSafeSave(wrapped(port)),null);
});

test('Creator does not clear another expedition checkpoint or pay out an active run', () => {
  const {port} = memoryPort();
  const hangar = new CreatorHangar(port);
  const first = hangar.launch(vp.worldWidth,vp.worldHeight,'marine','prototype',31);
  const other = hangar.launch(vp.worldWidth,vp.worldHeight,'marine','prototype',32);
  assert.equal(hangar.settle(first),null);
  const before = readMetaProgress(wrapped(port))!;
  assert.equal(before.warData,0);
  completed(other);
  assert.ok(hangar.settle(other)?.newSettlement);
  assert.equal(hangar.settle(other),null);
});

test('Creator never claims settlement when persistent writes fail', () => {
  const {port} = memoryPort();
  const readonlyPort: GameStoragePort = {
    getItem:port.getItem,
    setItem:()=>{throw new Error('disk full')},
    removeItem:port.removeItem,
  };
  const hangar = new CreatorHangar(readonlyPort);
  const run=hangar.launch(vp.worldWidth,vp.worldHeight,'marine','prototype',999);
  completed(run);
  assert.equal(hangar.settle(run),null);
  assert.match(hangar.message,/未保存/);
  assert.equal(hangar.purchase('armor'),false);
  assert.equal(new CreatorHangar(null).settle(run),null);
});
