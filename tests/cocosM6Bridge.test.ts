import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PocWorld, POC } from '../clients/cocos/assets/scripts/PocWorld.ts';
import {
  BATTLEFIELDS, battlefieldWave, calculateBattlefieldMaterials,
} from '../clients/cocos/assets/scripts/m6/battlefields.ts';
import { WAVES } from '../clients/cocos/assets/scripts/m6/progression.ts';
import {
  newMetaProgress, settleMetaProgress, purchaseEquipment, purchaseArmor,
} from '../clients/cocos/assets/scripts/m6/metaProgression.ts';
import {
  createRunRandoms, snapshotRandoms, restoreRandoms,
} from '../clients/cocos/assets/scripts/m6/runRandom.ts';

test('Cocos M6 mirrored rules remain byte-identical to canonical TS modules', () => {
  for (const path of ["progression.ts","runRandom.ts","battlefields.ts","metaProgression.ts","contentCatalog.ts","heroRuntime.ts","weaponRuntime.ts","combat.ts","pressure.ts","visibility.ts","streak.ts","supplies.ts","arsenal.ts","autoGrowth.ts","campaignDirector.ts","routeDecisions.ts","runSafeSave.ts","platformStorage.ts","weaponVisual.ts"]) {
    const canonical = readFileSync('src/game/' + path, 'utf8');
    const mirror = readFileSync('clients/cocos/assets/scripts/m6/' + path, 'utf8');
    assert.equal(mirror, canonical, 'drift in ' + path);
  }
});
test('M6 combat RNG is separated from cosmetic and reward streams', () => {
  const a = createRunRandoms(518);
  const b = createRunRandoms(518);
  const expected = a.combat.next();
  b.visuals.next(); b.rewards.next(); b.events.next();
  assert.equal(b.combat.next(), expected);
  const checkpoint = snapshotRandoms(a);
  const n = a.combat.next();
  restoreRandoms(a, checkpoint);
  assert.equal(a.combat.next(), n);
});
test('M6 battlefield profiles differ in weighted enemy families', () => {
  assert.equal(BATTLEFIELDS.length, 2);
  const steel = battlefieldWave('steel-ruins', WAVES[2]);
  const nest = battlefieldWave('infested-nest', WAVES[2]);
  const weight = (wave: typeof steel, kind: string) =>
    wave.mix.find(e => e.kind === kind)?.weight ?? 0;
  assert.ok(weight(steel, 'armored') > weight(nest, 'armored'));
  assert.ok(weight(nest, 'leaper') > weight(steel, 'leaper'));
  assert.ok(calculateBattlefieldMaterials({
    zoneId: 'steel-ruins', kills: 50, elapsedMs: 120000, completedStages: 2, victory: false,
  }) > 0);
});
test('M6 settlement is idempotent and battlefield resource is atomic', () => {
  const first = settleMetaProgress(newMetaProgress(), {
    runId: 'cocos-test-0001', campaignId: 'cocos-migration-poc',
    completedStages: 3, kills: 50, elapsedMs: 180000, victory: false,
    zoneId: 'infested-nest',
  });
  assert.equal(first.newSettlement, true);
  assert.equal(first.materialId, 'samples');
  assert.ok(first.materialEarned > 0);
  assert.ok(first.earned > 0);
  const repeat = settleMetaProgress(first.meta, {
    runId: 'cocos-test-0001', campaignId: 'cocos-migration-poc',
    completedStages: 3, kills: 50, elapsedMs: 180000, victory: false,
    zoneId: 'infested-nest',
  });
  assert.equal(repeat.newSettlement, false);
  assert.equal(repeat.meta.warData, first.meta.warData);
  assert.equal(repeat.meta.samples, first.meta.samples);
});
test('M6 workshop purchase costs and ranks are unchanged in the migration', () => {
  const wealthy = {...newMetaProgress(), warData: 1000, alloy: 1000, samples: 1000};
  const armor = purchaseArmor(wealthy);
  assert.equal(armor.bought, true);
  assert.equal(armor.meta.armorRank, 1);
  const frame = purchaseEquipment(wealthy, 'weapon-frame');
  const repair = purchaseEquipment(wealthy, 'repair-module');
  assert.equal(frame.bought, true);
  assert.equal(repair.bought, true);
  assert.equal(frame.meta.weaponFrameRank, 1);
  assert.equal(repair.meta.repairModuleRank, 1);
});
test('PoC simulator accepts M6 battlefield and permanent equipment rank inputs', () => {
  const standard = new PocWorld(450, 800, 518);
  const upgraded = new PocWorld(450, 800, 518, 'infested-nest', {
    armorRank: 2, weaponFrameRank: 1, repairModuleRank: 2,
  });
  assert.equal(standard.state.player.hp, 6);
  assert.equal(upgraded.state.player.hp, 8);
  assert.equal(upgraded.state.player.maxHp, 8);
  upgraded.reset();
  assert.equal(upgraded.state.player.hp, 8);
  assert.equal(upgraded.zoneId, 'infested-nest');
});
test('zone choice influences live spawned enemy distribution via real M6 mix', () => {
  const steel = new PocWorld(450, 800, 518, 'steel-ruins');
  const nest = new PocWorld(450, 800, 518, 'infested-nest');
  const histories: string[][] = [];
  for (const world of [steel, nest]) {
    // Reach stage 3 through REAL encounter decisions. Mutating the public
    // rendering snapshot can no longer move the canonical Campaign Director.
    for (let stage = 0; stage < 2; stage++) {
      const frames = Math.ceil(world.currentWaveDurationMs / POC.fixedStepMs) + 2;
      for (let i = 0; i < frames && !world.decision && !world.state.over; i++) {
        world.heal(1);
        world.advance(POC.fixedStepMs, { x: 1, y: 0 });
      }
      assert.equal(world.decision?.kind, 'card');
      assert.equal(world.chooseDecision(0), true);
    }
    assert.equal(world.state.wave, 3);
    const seen: string[] = [];
    for (let i = 0; i < 700 && !world.state.over; i++) {
      world.heal(1);
      world.advance(POC.fixedStepMs, { x: 1, y: 0 });
      if (i % 50 === 0) seen.push(...world.state.enemies.map(e => e.kind ?? 'grunt'));
    }
    histories.push(seen);
  }
  assert.ok(histories.every(history => history.length > 0));
  assert.notDeepEqual(histories[0], histories[1]);
});
test('preview has a private meta storage namespace separate from production H5', () => {
  const source = readFileSync('clients/cocos-preview/src/m6Ui.ts','utf8');
  assert.match(source, /const STORAGE_PREFIX = 'cocos-preview-m6:'/);
  assert.match(source, /settleStoredRun\(/);
  assert.match(source, /purchaseStoredEquipment\(/);
});
