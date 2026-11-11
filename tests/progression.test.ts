import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCard, CARDS, eligibleCards, newBuild, nextPhase,
  pickEnemyKind, rollCards, WAVES,
} from '../src/game/progression.ts';

test('M3 retains five waves, expands to 22 cards, and keeps the boss finale', () => {
  assert.equal(WAVES.length, 5);
  assert.equal(CARDS.length, 22);
  assert.equal(new Set(CARDS.map(card => card.id)).size, CARDS.length);
  for (const wave of WAVES) {
    assert.ok(wave.durationMs > 0);
    assert.ok(wave.maxEnemies >= 35 && wave.maxEnemies <= 95);
    assert.ok(wave.mix.length > 0);
  }
  assert.equal(nextPhase(4, false, WAVES[3].durationMs), 'reward');
  assert.equal(nextPhase(5, false, 10000), 'playing');
  assert.equal(nextPhase(5, true, 10000), 'victory');
  assert.equal(nextPhase(5, false, WAVES[4].durationMs), 'timeout');
});

test('early reward always offers an available new weapon, and offers exactly three distinct choices', () => {
  const build = newBuild();
  for (const random of [() => 0, () => 0.5, () => 0.9999]) {
    for (const reward of [1, 2, 3, 4]) {
      const choices = rollCards(build, reward, random);
      assert.equal(choices.length, 3);
      assert.equal(new Set(choices.map(card => card.id)).size, 3);
      if (reward <= 2) assert.ok(choices.some(card => card.weapon));
    }
  }
});

test('a reward cannot add duplicate weapons or exceed the four-weapon limit', () => {
  const build = newBuild();
  assert.equal(applyCard(build, 'scatter-kit'), true);
  assert.equal(applyCard(build, 'scatter-kit'), false);
  assert.equal(applyCard(build, 'arc-kit'), true);
  assert.equal(applyCard(build, 'flame-kit'), true);
  assert.deepEqual(build.weapons, ['rifle', 'scatter', 'arc', 'flame']);
  assert.equal(build.weapons.length, 4);
  assert.ok(rollCards(build, 4, () => 0.4).every(card => !card.weapon));
});

test('card effects actually change the current run and reset on new run', () => {
  const build = newBuild();
  assert.equal(applyCard(build, 'warhead'), true);
  assert.ok(build.damage > 1);
  assert.equal(applyCard(build, 'feed'), true);
  assert.ok(build.rate > 1);
  assert.equal(applyCard(build, 'fast-braces'), true);
  assert.ok(build.deployDelay < 1);
  assert.equal(applyCard(build, 'overload'), true);
  assert.equal(build.overload, true);
  assert.equal(applyCard(build, 'overload'), false);
  assert.equal(newBuild().damage, 1);
  assert.deepEqual(newBuild().weapons, ['rifle']);
});

test('healing is not offered at full health, and never exceeds the health cap', () => {
  const build = newBuild();
  assert.ok(!eligibleCards(build).some(card => card.id === 'repair'));
  build.hp = 2;
  assert.ok(eligibleCards(build).some(card => card.id === 'repair'));
  assert.equal(applyCard(build, 'repair'), true);
  assert.equal(build.hp, 5);
  assert.equal(applyCard(build, 'repair'), true);
  assert.equal(build.hp, 6);
  assert.equal(applyCard(build, 'repair'), false);
  assert.equal(applyCard(build, 'plating'), true);
  assert.equal(build.maxHp, 8);
  assert.equal(build.hp, 8);
});

test('weighted enemy selection only chooses enemies available in the wave', () => {
  assert.equal(pickEnemyKind(WAVES[0], () => 0.99), 'grunt');
  for (const wave of WAVES) {
    for (let i = 0; i < 30; i++) {
      const kind = pickEnemyKind(wave, () => i / 30);
      assert.ok(wave.mix.some(item => item.kind === kind));
      assert.notEqual(kind, 'boss');
    }
  }
});

test('reward options always filter out one-off cards that were already taken', () => {
  const build = newBuild();
  for (const id of ['cryogenic', 'afterglow', 'bulwark'] as const) assert.equal(applyCard(build, id), true);
  const pool = eligibleCards(build);
  for (const id of ['cryogenic', 'afterglow', 'bulwark'] as const) assert.ok(!pool.some(card => card.id === id));
});

test('bombers join the enemy mix from wave three, never the tutorial wave', () => {
  assert.ok(!WAVES[0].mix.some(entry => entry.kind === 'bomber'));
  assert.ok(!WAVES[1].mix.some(entry => entry.kind === 'bomber'));
  for (const wave of WAVES.slice(2)) assert.ok(wave.mix.some(entry => entry.kind === 'bomber'));
});

test('M2 frenzy, salvage and critical cards honor eligibility and cap', () => {
  const build = newBuild();
  assert.equal(applyCard(build, 'frenzy'), true);
  assert.equal(build.frenzy, true);
  assert.equal(applyCard(build, 'frenzy'), false);
  assert.equal(applyCard(build, 'salvage'), true);
  assert.equal(build.salvage, true);
  assert.equal(applyCard(build, 'salvage'), false);
  for (let i = 0; i < 3; i++) assert.equal(applyCard(build, 'critical-core'), true);
  assert.ok(Math.abs(build.criticalChance - 0.42) < 1e-6);
  assert.equal(applyCard(build, 'critical-core'), false);
  assert.ok(!eligibleCards(build).some(card =>
    card.id === 'frenzy' || card.id === 'salvage' || card.id === 'critical-core'
  ));
  assert.equal(newBuild().criticalChance, 0);
  assert.equal(newBuild().salvage, false);
});

test('M3 supply synergies unlock once and reset with a fresh run', () => {
  const build = newBuild();
  for (const [id, flag] of [
    ['supply-magnet', 'supplyMagnet'], ['surge-cell', 'surgeCell'], ['emp-array', 'empArray'],
  ] as const) {
    assert.equal(applyCard(build, id), true);
    assert.equal(build[flag], true);
    assert.equal(applyCard(build, id), false);
    assert.ok(!eligibleCards(build).some(card => card.id === id));
  }
  const clean = newBuild();
  assert.equal(clean.supplyMagnet, false);
  assert.equal(clean.surgeCell, false);
  assert.equal(clean.empArray, false);
  assert.ok(rollCards(clean, 1, () => 0.5).some(card => card.weapon));
});
