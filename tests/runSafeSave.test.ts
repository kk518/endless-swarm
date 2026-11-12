import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  SAFE_RUN_KEY, clearRunSafeSave, parseRunSafeSave, readRunSafeSave,
  writeRunSafeSave, type RunSafeSave,
} from '../src/game/runSafeSave.ts';
import { beginCampaign, THREE_ACT_BLUEPRINT, tickCampaign, toCheckpoint } from '../src/game/campaignDirector.ts';
import { newBuild } from '../src/game/progression.ts';
import { newGrowth } from '../src/game/arsenal.ts';
import { createRunRandoms, snapshotRandoms } from '../src/game/runRandom.ts';

function snapshot(): RunSafeSave {
  const campaign = beginCampaign(THREE_ACT_BLUEPRINT, 42);
  return {
    schemaVersion: 2, battlefieldId: 'steel-ruins',
    equipment: { weaponFrameRank: 0, repairModuleRank: 0 },
    runId: 'run-abc12345-xy567890', heroId: 'marine', savedAtMs: Date.now(),
    campaign: toCheckpoint(campaign), build: newBuild(), growth: newGrowth(),
    training: { weapon: 'rifle', focus: 'damage' }, hp: 6,
    timeMs: 0, kills: 0, bestStreak: 0, salvageKills: 0, suppliesCollected: 0,
    routePressureMultiplier: 1, randoms: snapshotRandoms(createRunRandoms(42)), cardOfferIds: [],
  };
}
const storage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    raw: map,
  };
};

test('fresh stage-start checkpoint validates and can be stored, read and cleared', () => {
  const saved = snapshot();
  assert.deepEqual(parseRunSafeSave(saved), saved);
  const mem = storage();
  assert.ok(writeRunSafeSave(mem, saved));
  assert.ok(mem.raw.has(SAFE_RUN_KEY));
  assert.deepEqual(readRunSafeSave(mem), saved);
  assert.ok(clearRunSafeSave(mem));
  assert.equal(readRunSafeSave(mem), null);
});

test('reward choices are snapshotted after drawing, never rerolled by restoration', () => {
  const base = snapshot();
  const state = tickCampaign(THREE_ACT_BLUEPRINT,
    beginCampaign(THREE_ACT_BLUEPRINT, 42), 100000);
  assert.equal(state.phase, 'reward');
  const offered: RunSafeSave = {
    ...base, campaign: toCheckpoint(state), cardOfferIds: ['feed', 'thrusters', 'scatter-kit'],
    kills: 72, timeMs: 100000, bestStreak: 12,
  };
  const mem = storage();
  assert.equal(writeRunSafeSave(mem, offered), true);
  assert.deepEqual(readRunSafeSave(mem)?.cardOfferIds, offered.cardOfferIds);
  assert.equal(parseRunSafeSave({ ...offered, cardOfferIds: [] }), null);
  assert.equal(parseRunSafeSave({ ...offered, cardOfferIds: ['feed', 'feed'] }), null);
  assert.equal(parseRunSafeSave({ ...base, cardOfferIds: ['feed'] }), null);
});

test('rejects cross-version, illegal weapons, XP, HP, RNG and tampered phase', () => {
  const base = snapshot();
  for (const corrupted of [
    null, {}, { ...base, schemaVersion: 3 },
    { ...base, battlefieldId: 'unknown-zone' },
    { ...base, equipment: { ...base.equipment, weaponFrameRank: 500 } },
    { ...base, heroId: 'not-yet-developed' },
    { ...base, campaign: { ...base.campaign, campaignId: 'k09-prototype' } },
    { ...base, campaign: { ...base.campaign, phase: 'reward' } },
    { ...base, campaign: { ...base.campaign, elapsedMs: 500 } },
    { ...base, build: { ...base.build, weapons: ['rifle', 'rifle'] } },
    { ...base, build: { ...base.build, weapons: ['unregistered'] } },
    { ...base, build: { ...base.build, maxHp: -1 } },
    { ...base, growth: { ...base.growth, level: 28 } },
    { ...base, training: { ...base.training, weapon: 'arc' } },
    { ...base, hp: 22 },
    { ...base, randoms: { ...base.randoms, rewards: 0 } },
    { ...base, routePressureMultiplier: Number.POSITIVE_INFINITY },
    { ...base, cardOfferIds: ['nonexistent'] },
    { ...base, runId: '../path' },
  ]) {
    assert.equal(parseRunSafeSave(corrupted), null);
  }
});

test('valid M6.0c v1 expedition snapshots migrate into steel ruins without losing the original build', () => {
  const current = snapshot();
  const { battlefieldId: _zone, equipment: _equipment, schemaVersion: _schema, ...legacy } = current;
  const migrated = parseRunSafeSave({ ...legacy, schemaVersion: 1 });
  assert.equal(migrated?.schemaVersion, 2);
  assert.equal(migrated?.battlefieldId, 'steel-ruins');
  assert.deepEqual(migrated?.equipment, { weaponFrameRank: 0, repairModuleRank: 0 });
  assert.deepEqual(migrated?.build, current.build);
  assert.equal(migrated?.runId, current.runId);
});

test('save failures are reported and never misrepresented as persisted checkpoints', () => {
  const failing = {
    getItem: () => null, setItem: () => { throw new Error('Storage denied'); },
    removeItem: () => { throw new Error('Storage denied'); },
  };
  assert.equal(writeRunSafeSave(failing, snapshot()), false);
  assert.equal(clearRunSafeSave(failing), false);
  assert.equal(readRunSafeSave(failing), null);
});

test('actual battle scene includes safe-node persistence, exact pending offers and meta settlement', () => {
  const source = readFileSync(new URL('../src/game/GameScene.ts', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('resumeSavedExpedition(value: unknown): boolean'));
  assert.ok(source.includes('this.saveSafeNode(); // Saved after reward roll'));
  assert.ok(source.includes('cardOfferIds: this.rewardOptions.map(card => card.id)'));
  assert.ok(source.includes('settleStoredRun(storage, {'));
  assert.ok(source.includes('clearRunSafeSave(storage)'));
  assert.ok(ui.includes('refreshArmory('));
  assert.ok(ui.includes('scene.resumeSavedExpedition(saved)'));
  assert.ok(ui.includes('purchaseStoredArmor(storage)'));
});
