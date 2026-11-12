import assert from 'node:assert/strict';
import test from 'node:test';
import { battlefieldWave, BATTLEFIELDS, calculateBattlefieldMaterials,
  DEFAULT_BATTLEFIELD, getBattlefield, isBattlefieldId } from '../src/game/battlefields.ts';
import { WAVES } from '../src/game/progression.ts';
import { FRAME_COSTS, MAX_EQUIPMENT_RANK, META_STORAGE_KEY, newMetaProgress,
  nextEquipmentCost, parseMetaProgress, purchaseEquipment, purchaseStoredEquipment,
  readMetaProgress, settleMetaProgress, settleStoredRun } from '../src/game/metaProgression.ts';

test('two independent battlegrounds have meaningful material destinations', () => {
  assert.equal(BATTLEFIELDS.length, 2);
  assert.equal(DEFAULT_BATTLEFIELD, 'steel-ruins');
  assert.equal(getBattlefield('steel-ruins').resource, 'alloy');
  assert.equal(getBattlefield('infested-nest').resource, 'samples');
  assert.equal(isBattlefieldId('unknown'), false);
  assert.equal(new Set(BATTLEFIELDS.map(zone => zone.resource)).size, 2);
  const wave = WAVES[3];
  const steel = battlefieldWave('steel-ruins', wave);
  const nest = battlefieldWave('infested-nest', wave);
  const weight = (items: typeof wave.mix, kind: string) => items.find(x => x.kind === kind)?.weight ?? 0;
  assert.ok(weight(steel.mix, 'armored') > weight(nest.mix, 'armored'));
  assert.ok(weight(nest.mix, 'bomber') > weight(steel.mix, 'bomber'));
  assert.equal(steel.durationMs, wave.durationMs);
  assert.equal(nest.maxEnemies, wave.maxEnemies);
  assert.deepEqual(wave, WAVES[3], 'base spawner configuration is immutable');
});

test('regional material payout is bounded and unavailable to instant abort farming', () => {
  const base = { zoneId: DEFAULT_BATTLEFIELD, completedStages: 4,
    kills: 90, elapsedMs: 400000, victory: false };
  assert.ok(calculateBattlefieldMaterials(base) >= 16);
  assert.equal(calculateBattlefieldMaterials({ ...base, elapsedMs: 10000 }), 0);
  assert.equal(calculateBattlefieldMaterials({ ...base, kills: 0 }), 0);
  assert.equal(calculateBattlefieldMaterials({ ...base, completedStages: -1 }), 0);
  assert.equal(calculateBattlefieldMaterials({ ...base, victory: true })
    - calculateBattlefieldMaterials(base), 12);
});

test('legacy v1 meta saves migrate without erasing armor upgrades, war data or settled runs', () => {
  const migrated = parseMetaProgress({ schemaVersion: 1, warData: 76,
    armorRank: 2, settledRuns: ['run-oldsettle123'] })!;
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.armorRank, 2);
  assert.equal(migrated.warData, 76);
  assert.equal(migrated.alloy, 0);
  assert.equal(migrated.samples, 0);
  assert.deepEqual(migrated.settledRuns, ['run-oldsettle123']);
  const fresh = newMetaProgress();
  assert.equal(fresh.weaponFrameRank, 0);
  assert.equal(fresh.repairModuleRank, 0);
  assert.equal(parseMetaProgress({ ...fresh, alloy: -10 }), null);
  assert.equal(parseMetaProgress({ ...fresh, weaponFrameRank: 999 }), null);
  assert.equal(parseMetaProgress({ ...fresh, samples: Infinity }), null);
});

test('war data and exactly one region material settle in the same v2 ledger entry', () => {
  const storage = new Map<string, string>();
  const port = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  };
  const run = { runId: 'run-steel0012026', campaignId: 'k09-three-act-draft',
    zoneId: 'steel-ruins' as const, completedStages: 4,
    kills: 80, elapsedMs: 400000, victory: false };
  const first = settleStoredRun(port, run)!;
  assert.equal(first.materialId, 'alloy');
  assert.ok(first.earned > 0 && first.materialEarned > 0);
  assert.equal(first.meta.alloy, first.materialEarned);
  assert.equal(first.meta.samples, 0);
  assert.equal(first.meta.warData, first.earned);
  const again = settleStoredRun(port, run)!;
  assert.equal(again.newSettlement, false);
  assert.equal(again.materialEarned, 0);
  assert.deepEqual(again.meta, first.meta);
  const second = settleStoredRun(port, { ...run, zoneId: 'infested-nest', runId: 'run-nest00022026' })!;
  assert.equal(second.meta.alloy, first.meta.alloy);
  assert.ok(second.meta.samples > 0);
  assert.equal(readMetaProgress(port)?.schemaVersion, 2);
  assert.ok(storage.get(META_STORAGE_KEY)?.includes('run-nest00022026'));
});

test('two independent upgrade sinks spend their own materials and both hit rank caps', () => {
  assert.equal(FRAME_COSTS.length, MAX_EQUIPMENT_RANK);
  let meta = { ...newMetaProgress(), warData: 500, alloy: 300, samples: 300 };
  assert.deepEqual(nextEquipmentCost(meta, 'weapon-frame'), { warData: 8, material: 'alloy', quantity: 12 });
  const frame1 = purchaseEquipment(meta, 'weapon-frame');
  assert.equal(frame1.bought, true);
  assert.equal(frame1.meta.alloy, meta.alloy - 12);
  assert.equal(frame1.meta.samples, meta.samples);
  meta = frame1.meta;
  meta = purchaseEquipment(meta, 'weapon-frame').meta;
  assert.equal(meta.weaponFrameRank, 2);
  assert.equal(nextEquipmentCost(meta, 'weapon-frame'), null);
  assert.equal(purchaseEquipment(meta, 'weapon-frame').bought, false);
  const repair1 = purchaseEquipment(meta, 'repair-module');
  assert.equal(repair1.bought, true);
  assert.equal(repair1.meta.samples, meta.samples - 12);
  assert.equal(repair1.meta.alloy, meta.alloy);
  assert.equal(repair1.meta.repairModuleRank, 1);
  const denied = purchaseEquipment(newMetaProgress(), 'repair-module');
  assert.equal(denied.bought, false);
  assert.equal(denied.meta.repairModuleRank, 0);
});

test('material purchases refuse storage failures without claiming success', () => {
  const denying = { getItem: () => JSON.stringify({ ...newMetaProgress(), warData: 90,
      alloy: 99, samples: 99 }), setItem: () => { throw new Error('denied'); } };
  assert.equal(purchaseStoredEquipment(denying, 'weapon-frame'), null);
  const before = newMetaProgress();
  const oldId = 'run-migrated0000';
  const after = settleMetaProgress(before, { runId: oldId, campaignId: 'k09-prototype',
    completedStages: 1, kills: 9, elapsedMs: 70000, victory: false });
  assert.equal(after.materialId, 'alloy', 'old callers choose default steel');
});
