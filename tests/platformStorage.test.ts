import assert from 'node:assert/strict';
import test from 'node:test';
import { configureStoragePort, getStoragePort } from '../src/game/platformStorage.ts';
import { readMetaProgress, settleStoredRun } from '../src/game/metaProgression.ts';
import { readRunSafeSave, writeRunSafeSave } from '../src/game/runSafeSave.ts';
import { beginCampaign, THREE_ACT_BLUEPRINT, toCheckpoint } from '../src/game/campaignDirector.ts';
import { newBuild } from '../src/game/progression.ts';
import { newGrowth } from '../src/game/arsenal.ts';
import { createRunRandoms, snapshotRandoms } from '../src/game/runRandom.ts';

test('portable storage port allows game systems to work without browser localStorage', () => {
  const map = new Map<string, string>();
  const fake = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
  configureStoragePort(fake);
  try {
    assert.equal(getStoragePort(), fake);
    const state = beginCampaign(THREE_ACT_BLUEPRINT, 99);
    const saved = {
      schemaVersion: 1 as const, runId: 'run-123456-abcdef', heroId: 'marine', savedAtMs: Date.now(),
      campaign: toCheckpoint(state), build: newBuild(), growth: newGrowth(),
      training: { weapon: 'rifle' as const, focus: 'damage' as const }, hp: 6,
      timeMs: 0, kills: 0, bestStreak: 0, salvageKills: 0, suppliesCollected: 0,
      routePressureMultiplier: 1, randoms: snapshotRandoms(createRunRandoms(99)), cardOfferIds: [],
    };
    assert.equal(writeRunSafeSave(getStoragePort()!, saved), true);
    assert.equal(readRunSafeSave(getStoragePort()!)?.runId, saved.runId);
    const settled = settleStoredRun(getStoragePort()!, {
      runId: saved.runId, campaignId: state.campaignId, completedStages: 2,
      kills: 70, elapsedMs: 160000, victory: false,
    });
    assert.equal(settled?.newSettlement, true);
    assert.ok((readMetaProgress(getStoragePort()!)?.warData ?? 0) > 0);
  } finally { configureStoragePort(null); }
});
