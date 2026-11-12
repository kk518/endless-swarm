import test from 'node:test';
import assert from 'node:assert/strict';
import { CocosRunController } from '../clients/cocos/assets/scripts/m6/runController.ts';

function finishCurrentEncounter(controller: CocosRunController, bossKilled = false) {
  const current = controller.currentStage;
  controller.tick(current.encounter.wave.durationMs, bossKilled);
}

test('prototype mode retains five encounters and four card decisions', () => {
  const run = new CocosRunController({ seed: 518, runId: 'cocos-prototype-001' });
  assert.equal(run.snapshot().stage.total, 5);
  let cards = 0;
  for (let i = 0; i < 4; i++) {
    finishCurrentEncounter(run);
    const decision = run.snapshot().decision;
    assert.equal(decision?.kind, 'card');
    if (decision?.kind !== 'card') throw new Error('expected card decision');
    assert.equal(decision.options.length, 3);
    assert.equal(new Set(decision.options.map(card => card.id)).size, 3);
    assert.equal(run.chooseCard(decision.options[0].id), true);
    cards++;
  }
  assert.equal(cards, 4);
  finishCurrentEncounter(run, true);
  assert.equal(run.snapshot().phase, 'victory');
});

test('expedition mode runs nine encounters with six cards and two route forks', () => {
  const run = new CocosRunController({
    seed: 518, runId: 'cocos-expedition-001', mode: 'expedition',
    battlefieldId: 'infested-nest', playableWeapons: ['rifle', 'scatter', 'arc', 'flame'],
  });
  assert.equal(run.snapshot().stage.total, 9);
  let cards = 0, routes = 0;
  for (let index = 0; index < 8; index++) {
    finishCurrentEncounter(run);
    const decision = run.snapshot().decision;
    if (decision?.kind === 'card') {
      assert.equal(decision.options.length, 3);
      assert.equal(run.chooseCard(decision.options[0].id), true);
      cards++;
    } else if (decision?.kind === 'route') {
      assert.equal(decision.options.length, 2);
      const safe = decision.options.find(option => option.risk === 'safe');
      assert.ok(safe);
      assert.equal(run.chooseRoute(safe!.id), true);
      routes++;
    } else {
      assert.fail('expected a card or route decision');
    }
  }
  assert.equal(cards, 6);
  assert.equal(routes, 2);
  assert.equal(run.snapshot().campaign.stageIndex, 8);
  run.tick(1000, true);
  assert.equal(run.snapshot().phase, 'victory');
});

test('kill XP is allocated automatically and never creates an XP decision', () => {
  const run = new CocosRunController({ seed: 17, runId: 'cocos-growth-001' });
  for (let i = 0; i < 35; i++) run.registerKill('grunt');
  const state = run.snapshot();
  assert.ok(state.growth.level > 1);
  assert.ok(state.growth.weaponLevels.rifle > 1);
  assert.equal(state.decision, null);
  assert.equal(state.phase, 'playing');
});

test('route fork removes a lethal high-risk option at one HP', () => {
  const run = new CocosRunController({
    seed: 99, runId: 'cocos-route-001', mode: 'expedition',
  });
  finishCurrentEncounter(run);
  const first = run.snapshot().decision;
  assert.equal(first?.kind, 'card');
  if (first?.kind !== 'card') throw new Error('expected first card');
  run.chooseCard(first.options[0].id);
  run.applyDamage(run.snapshot().hp - 1);
  finishCurrentEncounter(run);
  const fork = run.snapshot().decision;
  assert.equal(fork?.kind, 'route');
  if (fork?.kind !== 'route') throw new Error('expected route fork');
  assert.ok(fork.options.every(option => option.risk === 'safe'));
  assert.equal(run.chooseRoute('landing-assault'), false);
});
