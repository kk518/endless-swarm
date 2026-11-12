import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARMOR_COSTS, calculateWarData, META_STORAGE_KEY,
  newMetaProgress, nextArmorCost, parseMetaProgress, purchaseArmor, purchaseStoredArmor,
  readMetaProgress, settleMetaProgress, settleStoredRun, type RunPayout,
} from '../src/game/metaProgression.ts';

const storage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    raw: map,
  };
};
const payout: RunPayout = {
  runId: 'run-12345678-abcdefgh', campaignId: 'k09-three-act-draft',
  completedStages: 4, elapsedMs: 390000, kills: 86, victory: false,
};

test('long failed runs grant meaningful war data, instant exits cannot farm it', () => {
  assert.ok(calculateWarData(payout) >= 25);
  assert.equal(calculateWarData({ ...payout, elapsedMs: 5000 }), 0);
  assert.equal(calculateWarData({ ...payout, kills: 2 }), 0);
  const win = calculateWarData({ ...payout, victory: true });
  assert.equal(win - calculateWarData(payout), 20);
});

test('run settlement is idempotent and all balance/ledger fields persist together', () => {
  const mem = storage();
  const first = settleStoredRun(mem, payout)!;
  assert.equal(first.newSettlement, true);
  assert.ok(first.earned > 0);
  assert.equal(first.meta.warData, first.earned);
  assert.ok(mem.raw.get(META_STORAGE_KEY)?.includes(payout.runId));
  const second = settleStoredRun(mem, payout)!;
  assert.equal(second.newSettlement, false);
  assert.equal(second.earned, 0);
  assert.deepEqual(second.meta, first.meta);
  const third = settleStoredRun(mem, { ...payout, runId: 'run-other98765', victory: true })!;
  assert.ok(third.meta.warData > first.meta.warData);
  assert.equal(third.meta.settledRuns.length, 2);
});

test('armor workshop has bounded rank, spends currency and cannot buy without enough', () => {
  assert.deepEqual(ARMOR_COSTS, [25, 55, 100]);
  assert.equal(nextArmorCost(newMetaProgress()), 25);
  assert.equal(purchaseArmor(newMetaProgress()).bought, false);
  const balance = { ...newMetaProgress(), warData: 200 };
  const a = purchaseArmor(balance);
  assert.equal(a.bought, true);
  assert.equal(a.meta.armorRank, 1);
  assert.equal(a.meta.warData, 175);
  const b = purchaseArmor(a.meta);
  assert.equal(b.meta.armorRank, 2);
  const c = purchaseArmor(b.meta);
  assert.equal(c.meta.armorRank, 3);
  assert.equal(nextArmorCost(c.meta), null);
  assert.equal(purchaseArmor(c.meta).bought, false);
  const mem = storage();
  mem.setItem(META_STORAGE_KEY, JSON.stringify(balance));
  const saved = purchaseStoredArmor(mem)!;
  assert.equal(readMetaProgress(mem)?.armorRank, 1);
  assert.equal(saved.cost, 25);
});

test('malformed local progress and denied storage never grant fake success', () => {
  const mem = storage();
  assert.deepEqual(readMetaProgress(mem), newMetaProgress());
  for (const invalid of [
    { schemaVersion: 2 }, { ...newMetaProgress(), warData: -1 },
    { ...newMetaProgress(), armorRank: 500 },
    { ...newMetaProgress(), settledRuns: ['bad'] },
    { ...newMetaProgress(), settledRuns: ['run-12345678', 'run-12345678'] },
  ]) assert.equal(parseMetaProgress(invalid), null);
  mem.setItem(META_STORAGE_KEY, '{not-json');
  assert.equal(readMetaProgress(mem), null);
  const forbidden = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
  assert.equal(settleStoredRun(forbidden, payout), null);
  assert.equal(purchaseStoredArmor(forbidden)?.bought, false);
  assert.throws(() => settleMetaProgress(newMetaProgress(), { ...payout, runId: '../../etc' }), /Invalid/);
});
