import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  PROTOTYPE_CAMPAIGN, THREE_ACT_BLUEPRINT, advanceCampaignReward,
  beginCampaign, encountersOf, fromCheckpoint, getEncounter, tickCampaign,
  toCheckpoint, validateCampaign,
} from '../src/game/campaignDirector.ts';
import { WAVES } from '../src/game/progression.ts';

test('active campaign uses exactly the old five wave timings and a boss on wave five', () => {
  const stages = encountersOf(PROTOTYPE_CAMPAIGN);
  assert.equal(stages.length, 5);
  assert.deepEqual(stages.map(s => s.encounter.wave.durationMs), WAVES.map(w => w.durationMs));
  assert.deepEqual(stages.map(s => s.encounter.pressureTier), [1, 2, 3, 4, 5]);
  assert.deepEqual(stages.map(s => s.encounter.kind), ['survival', 'survival', 'survival', 'survival', 'boss']);
  assert.deepEqual(stages.map(s => s.actNumber), [1, 1, 2, 2, 3]);
  assert.equal(stages.at(-1)?.encounter.decision, 'none');
});

test('five stages transition through one reward per ordinary wave, boss win or timeout', () => {
  let state = beginCampaign(PROTOTYPE_CAMPAIGN, 42);
  assert.equal(state.phase, 'playing');
  for (let i = 0; i < 4; i++) {
    const stage = getEncounter(PROTOTYPE_CAMPAIGN, i).encounter;
    state = tickCampaign(PROTOTYPE_CAMPAIGN, state, stage.wave.durationMs - 1);
    assert.equal(state.phase, 'playing');
    state = tickCampaign(PROTOTYPE_CAMPAIGN, state, 1);
    assert.equal(state.phase, 'reward');
    assert.equal(tickCampaign(PROTOTYPE_CAMPAIGN, state, 5000), state, 'paused stage remains paused');
    const fresh = advanceCampaignReward(PROTOTYPE_CAMPAIGN, state);
    assert.equal(fresh.stageIndex, i + 1);
    assert.equal(fresh.elapsedMs, 0);
    assert.equal(fresh.phase, 'playing');
    assert.throws(() => advanceCampaignReward(PROTOTYPE_CAMPAIGN, fresh), /No pending/);
    state = fresh;
  }
  assert.equal(getEncounter(PROTOTYPE_CAMPAIGN, state.stageIndex).encounter.kind, 'boss');
  const preKill = tickCampaign(PROTOTYPE_CAMPAIGN, state, 1000);
  assert.equal(preKill.phase, 'playing');
  assert.equal(tickCampaign(PROTOTYPE_CAMPAIGN, preKill, 0, true).phase, 'victory');
  assert.equal(tickCampaign(PROTOTYPE_CAMPAIGN, state, WAVES[4].durationMs, false).phase, 'timeout');
  assert.throws(() => advanceCampaignReward(PROTOTYPE_CAMPAIGN, state), /No pending/);
});

test('three-act draft describes 15–20 minutes and separate route/card milestones but is not active', () => {
  validateCampaign(THREE_ACT_BLUEPRINT);
  const encounters = encountersOf(THREE_ACT_BLUEPRINT);
  assert.equal(encounters.length, 9);
  assert.deepEqual(encounters.map(e => e.actNumber), [1, 1, 1, 2, 2, 2, 3, 3, 3]);
  const duration = encounters.reduce((sum, e) => sum + e.encounter.wave.durationMs, 0);
  assert.ok(duration >= 15 * 60000 && duration <= 20 * 60000);
  assert.equal(encounters.filter(e => e.encounter.decision === 'card').length, 6);
  assert.equal(encounters.filter(e => e.encounter.decision === 'route').length, 2);
  assert.equal(encounters.filter(e => e.encounter.kind === 'boss').length, 1);
  assert.notEqual(PROTOTYPE_CAMPAIGN.id, THREE_ACT_BLUEPRINT.id);
});

test('checkpoint schema restores stage state and rejects invalid/cross-campaign copies', () => {
  const state = tickCampaign(PROTOTYPE_CAMPAIGN, beginCampaign(PROTOTYPE_CAMPAIGN, 23), 1300);
  const snap = toCheckpoint(state);
  assert.deepEqual(fromCheckpoint(PROTOTYPE_CAMPAIGN, snap), state);
  assert.equal(fromCheckpoint(THREE_ACT_BLUEPRINT, snap), null);
  for (const corrupt of [
    null, {}, { ...snap, schemaVersion: 2 }, { ...snap, stageIndex: -1 },
    { ...snap, stageIndex: 5 }, { ...snap, elapsedMs: -100 },
    { ...snap, seed: 1.5 }, { ...snap, phase: 'wrong' },
    { ...snap, phase: 'victory' }, { ...snap, phase: 'reward', stageIndex: 4 },
  ]) {
    assert.equal(fromCheckpoint(PROTOTYPE_CAMPAIGN, corrupt), null);
  }
});

test('invalid stage data, duplicated ids, early bosses and invalid seeds are rejected', () => {
  const clone = structuredClone(PROTOTYPE_CAMPAIGN);
  clone.acts[0].encounters[0].id = 'wave-2';
  assert.throws(() => validateCampaign(clone), /Invalid encounter/);
  const another = structuredClone(PROTOTYPE_CAMPAIGN);
  another.acts[0].encounters[0].kind = 'boss';
  assert.throws(() => validateCampaign(another), /Only the final/);
  assert.throws(() => beginCampaign(PROTOTYPE_CAMPAIGN, -1), /seed/);
  assert.throws(() => beginCampaign(PROTOTYPE_CAMPAIGN, 1.25), /seed/);
  assert.throws(() => tickCampaign(THREE_ACT_BLUEPRINT, beginCampaign(PROTOTYPE_CAMPAIGN, 12), 30), /another campaign/);
});

test('real scene uses director for transitions and seed domains, legacy nextPhase stays available for tests', () => {
  const scene = readFileSync(new URL('../src/game/GameScene.ts', import.meta.url), 'utf8');
  assert.ok(scene.includes('beginCampaign(PROTOTYPE_CAMPAIGN, newRunSeed())'));
  assert.ok(scene.includes('advanceCampaignReward(PROTOTYPE_CAMPAIGN, this.campaignRun)'));
  assert.ok(scene.includes('tickCampaign(PROTOTYPE_CAMPAIGN, this.campaignRun, 0, this.bossKilled)'));
  assert.ok(scene.includes('this.randoms.rewards.next()'));
  assert.ok(scene.includes('this.randoms.combat.next()'));
  assert.ok(!scene.includes('nextPhase(this.waveNumber'));
});
