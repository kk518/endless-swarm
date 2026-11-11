import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  applyAutomaticEvolutions, applyAutomaticLevels, chooseAutomaticUpgrade,
  DEFAULT_TRAINING, summarizeGrowth,
} from '../src/game/autoGrowth.ts';
import { grantExperience, installWeaponCalibration, newGrowth, weaponTuning } from '../src/game/arsenal.ts';
import { applyCard, newBuild } from '../src/game/progression.ts';

test('default training ranks up equipped rifle while preserving battle clock', () => {
  const build = newBuild(), growth = newGrowth();
  const xp = grantExperience(growth, 50);
  const result = applyAutomaticLevels(build, xp.state, xp.gainedLevels, { ...DEFAULT_TRAINING });
  assert.equal(xp.gainedLevels, 4);
  assert.deepEqual(result.upgrades, ['weapon:rifle', 'weapon:rifle', 'weapon:rifle', 'weapon:rifle']);
  assert.equal(xp.state.weaponLevels.rifle, 5);
  assert.equal(xp.state.level, 5);
  assert.equal(xp.state.xp, 0);
  assert.equal(result.evolutions.length, 0);
});

test('XP overflow never loses choices and upgrades equipped weapons in declared order', () => {
  const build = newBuild(), growth = newGrowth();
  assert.equal(applyCard(build, 'scatter-kit'), true);
  installWeaponCalibration(growth, 'scatter');
  assert.equal(applyCard(build, 'arc-kit'), true);
  installWeaponCalibration(growth, 'arc');
  const result = applyAutomaticLevels(build, growth, 12, { weapon: 'arc', focus: 'rate' });
  assert.equal(result.upgrades.length, 12);
  assert.equal(growth.weaponLevels.arc, 5);
  assert.equal(growth.weaponLevels.rifle, 5);
  assert.equal(growth.weaponLevels.scatter, 5);
  assert.deepEqual(result.upgrades.slice(0, 3), ['weapon:arc', 'weapon:arc', 'weapon:arc']);
  assert.equal(result.upgrades.at(-1), 'core:rate');
  assert.ok(build.rate > 1);
  assert.equal(build.damage, 1);
});

test('unowned preferred weapon falls back to equipped first weapon', () => {
  const build = newBuild(), growth = newGrowth();
  assert.equal(chooseAutomaticUpgrade(build, growth, { weapon: 'flame', focus: 'speed' }), 'weapon:rifle');
  assert.equal(growth.weaponLevels.flame, 0);
  assert.equal(applyAutomaticLevels(build, growth, 1, { weapon: 'flame', focus: 'speed' }).upgrades[0], 'weapon:rifle');
  assert.equal(growth.weaponLevels.flame, 0);
});

test('fire rate, damage, speed cores differ when every installed weapon is maxed', () => {
  for (const focus of ['damage', 'rate', 'speed'] as const) {
    const build = newBuild(), growth = newGrowth();
    growth.weaponLevels.rifle = 5;
    const r = applyAutomaticLevels(build, growth, 2, { weapon: 'rifle', focus });
    assert.deepEqual(r.upgrades, [`core:${focus}`, `core:${focus}`]);
    const value = focus === 'damage' ? build.damage : focus === 'rate' ? build.rate : build.speed;
    assert.ok(value > 1.14, focus);
  }
});

test('evolution auto-unlocks when XP reaches Lv5 after acquiring the blueprint', () => {
  const build = newBuild(), growth = newGrowth();
  assert.equal(applyCard(build, 'pierce'), true);
  const result = applyAutomaticLevels(build, growth, 4, { ...DEFAULT_TRAINING });
  assert.deepEqual(result.evolutions, ['rifle']);
  assert.equal(growth.evolved.rifle, true);
  assert.equal(weaponTuning(growth, 'rifle').pierce, 2);
  assert.ok(summarizeGrowth(result, growth).includes('轨道歼灭炮'));
  assert.equal(applyAutomaticEvolutions(build, growth).length, 0);
});

test('evolution auto-unlocks when wave-end blueprint arrives after weapon Lv5', () => {
  const build = newBuild(), growth = newGrowth();
  growth.weaponLevels.rifle = 5;
  assert.deepEqual(applyAutomaticEvolutions(build, growth), []);
  assert.equal(applyCard(build, 'critical-core'), true);
  assert.deepEqual(applyAutomaticEvolutions(build, growth), ['rifle']);
  assert.deepEqual(applyAutomaticEvolutions(build, growth), []);
});

test('four recipes still work and each evolves once without consuming an XP level', () => {
  const blueprints = [
    { kit: null, recipe: 'pierce', weapon: 'rifle' },
    { kit: 'scatter-kit', recipe: 'warhead', weapon: 'scatter' },
    { kit: 'arc-kit', recipe: 'chain-blast', weapon: 'arc' },
    { kit: 'flame-kit', recipe: 'overload', weapon: 'flame' },
  ] as const;
  for (const item of blueprints) {
    const build = newBuild(), growth = newGrowth();
    if (item.kit) {
      assert.equal(applyCard(build, item.kit), true);
      installWeaponCalibration(growth, item.weapon);
    }
    growth.weaponLevels[item.weapon] = 5;
    assert.equal(applyCard(build, item.recipe), true);
    const previousRank = growth.level;
    assert.deepEqual(applyAutomaticEvolutions(build, growth), [item.weapon]);
    assert.equal(growth.level, previousRank);
    assert.deepEqual(applyAutomaticEvolutions(build, growth), []);
  }
});

test('multi-level XP grants are bounded and never allocate upgrades after max level', () => {
  const build = newBuild(), growth = newGrowth();
  const xp = grantExperience(growth, 100000);
  assert.equal(xp.gainedLevels, 24);
  assert.equal(applyAutomaticLevels(build, xp.state, xp.gainedLevels, { ...DEFAULT_TRAINING }).upgrades.length, 24);
  assert.equal(applyAutomaticLevels(build, xp.state, 10000, { ...DEFAULT_TRAINING }).upgrades.length, 24);
  assert.equal(applyAutomaticLevels(build, xp.state, NaN, { ...DEFAULT_TRAINING }).upgrades.length, 0);
  assert.equal(newGrowth().weaponLevels.rifle, 1);
});

test('battle no longer dispatches level-up modal and wave-end still dispatches rewards', () => {
  const scene = readFileSync(new URL('../src/game/GameScene.ts', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(scene.includes('applyAutomaticLevels(this.build, this.growth, reward.gainedLevels, this.training)'));
  assert.ok(scene.includes('applyAutomaticEvolutions(this.build, this.growth)'));
  assert.ok(scene.includes("window.dispatchEvent(new CustomEvent<RewardOffer>('swarm:reward'"));
  assert.ok(!scene.includes('presentLevelChoice('));
  assert.ok(!main.includes("window.addEventListener('swarm:levelup'"));
  assert.ok(!html.includes('id="level-overlay"'));
  assert.ok(html.includes('id="reward-training-focus"'));
  assert.ok(html.includes('id="start-training-focus"'));
});
