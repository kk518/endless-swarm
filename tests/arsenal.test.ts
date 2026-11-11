import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyLevelChoice, evolutionEligible, grantExperience, installWeaponCalibration, killExperience,
  legalLevelChoices, MAX_RUN_LEVEL, MAX_WEAPON_LEVEL, newGrowth, rollLevelChoices,
  weaponTuning, xpToNext,
} from '../src/game/arsenal.ts';
import { applyCard, newBuild } from '../src/game/progression.ts';

test('M5 XP starts at Lv1, grows with the run and correctly carries overflow', () => {
  const first = newGrowth();
  assert.equal(first.level, 1); assert.equal(first.xp, 0);
  assert.equal(xpToNext(1), 8); assert.equal(xpToNext(2), 11); assert.equal(xpToNext(3), 14);
  assert.equal(grantExperience(first, 7).gainedLevels, 0);
  const a = grantExperience(first, 25);
  assert.equal(a.gainedLevels, 2); assert.equal(a.state.level, 3);
  assert.equal(a.state.xp, 6); assert.equal(first.xp, 0);
  assert.equal(grantExperience(first, NaN).state.level, 1);
  assert.equal(grantExperience(first, -50).state.xp, 0);
});

test('M5 huge XP grants are bounded and never create overflow levels past 25', () => {
  const a = grantExperience(newGrowth(), 100000);
  assert.equal(a.state.level, MAX_RUN_LEVEL);
  assert.equal(a.gainedLevels, MAX_RUN_LEVEL - 1);
  assert.equal(a.state.xp, 0);
  assert.equal(grantExperience(a.state, 2000).gainedLevels, 0);
});

test('normal kills, bombers and elites have distinct XP awards', () => {
  assert.equal(killExperience('grunt', false), 1);
  assert.equal(killExperience('bomber', false), 2);
  assert.equal(killExperience('leaper', true), 5);
  assert.equal(killExperience('boss', false), 12);
});

test('M5 offers three distinct legal upgrades, including weapon growth', () => {
  const build = newBuild(), growth = newGrowth();
  for (const random of [() => 0, () => 0.9, () => 1, () => NaN]) {
    const options = rollLevelChoices(build, growth, random);
    assert.equal(options.length, 3);
    assert.equal(new Set(options.map(x => x.id)).size, 3);
    assert.ok(options.some(x => x.id === 'weapon:rifle'));
  }
  assert.ok(!legalLevelChoices(build, growth).some(x => x.id === 'weapon:scatter'));
  assert.ok(!legalLevelChoices(build, growth).some(x => x.id === 'core:repair'));
});

test('weapons gain real levels one through five, never six; new mounts calibrate to Lv2', () => {
  const build = newBuild(), growth = newGrowth();
  assert.equal(applyLevelChoice(build, growth, 'weapon:scatter'), false);
  for (let n = 1; n < 5; n++) assert.equal(applyLevelChoice(build, growth, 'weapon:rifle'), true);
  assert.equal(growth.weaponLevels.rifle, MAX_WEAPON_LEVEL);
  assert.equal(applyLevelChoice(build, growth, 'weapon:rifle'), false);
  assert.equal(applyCard(build, 'scatter-kit'), true);
  installWeaponCalibration(growth, 'scatter');
  assert.equal(growth.weaponLevels.scatter, 2);
  assert.equal(applyLevelChoice(build, growth, 'weapon:scatter'), true);
  assert.equal(growth.weaponLevels.scatter, 3);
});

test('ranks affect actual damage, interval, buckshot pellets and arc chains', () => {
  const growth = newGrowth();
  assert.equal(weaponTuning(growth, 'scatter').pellets, 5);
  assert.equal(weaponTuning(growth, 'arc').chains, 4);
  growth.weaponLevels = { rifle: 5, scatter: 5, arc: 5, flame: 5 };
  assert.ok(weaponTuning(growth, 'rifle').damage > 1.5);
  assert.ok(weaponTuning(growth, 'rifle').interval < 0.8);
  assert.equal(weaponTuning(growth, 'scatter').pellets, 9);
  assert.equal(weaponTuning(growth, 'arc').chains, 6);
  assert.ok(weaponTuning(growth, 'flame').range > 1.3);
});

test('railgun requires rifle Lv5 and pierce or critical prerequisite, evolves only once', () => {
  const build = newBuild(), growth = newGrowth();
  assert.equal(applyLevelChoice(build, growth, 'evolve:rifle'), false);
  growth.weaponLevels.rifle = 5;
  assert.equal(evolutionEligible(build, growth, 'rifle'), false);
  assert.equal(applyCard(build, 'pierce'), true);
  assert.ok(rollLevelChoices(build, growth, () => 0.99).some(x => x.id === 'evolve:rifle'));
  assert.equal(applyLevelChoice(build, growth, 'evolve:rifle'), true);
  assert.equal(weaponTuning(growth, 'rifle').pierce, 2);
  assert.ok(weaponTuning(growth, 'rifle').damage > 2);
  assert.equal(applyLevelChoice(build, growth, 'evolve:rifle'), false);
});

test('annihilator requires shotgun Lv5 + radius/warhead and grants pellets/knockback', () => {
  const build = newBuild(), growth = newGrowth();
  assert.equal(applyCard(build, 'scatter-kit'), true);
  growth.weaponLevels.scatter = 5;
  assert.equal(evolutionEligible(build, growth, 'scatter'), false);
  assert.equal(applyCard(build, 'radius'), true);
  assert.ok(rollLevelChoices(build, growth, () => 0).some(x => x.id === 'evolve:scatter'));
  assert.equal(applyLevelChoice(build, growth, 'evolve:scatter'), true);
  assert.equal(weaponTuning(growth, 'scatter').pellets, 12);
  assert.equal(weaponTuning(growth, 'scatter').knockback, 32);
  assert.equal(applyLevelChoice(build, growth, 'evolve:scatter'), false);
});

test('core upgrade rewards are small and healing is strictly capped', () => {
  const build = newBuild(), growth = newGrowth();
  assert.equal(applyLevelChoice(build, growth, 'core:damage'), true);
  assert.ok(Math.abs(build.damage - 1.08) < 1e-8);
  assert.equal(applyLevelChoice(build, growth, 'core:rate'), true);
  assert.equal(applyLevelChoice(build, growth, 'core:speed'), true);
  assert.equal(applyLevelChoice(build, growth, 'core:repair'), false);
  build.hp = build.maxHp - 1;
  assert.equal(applyLevelChoice(build, growth, 'core:repair'), true);
  assert.equal(build.hp, build.maxHp);
  assert.equal(applyCard(build, 'warhead'), true);
  assert.ok(build.damage > 1.3);
});

test('fresh run clears XP, weapon rank and evolution flags', () => {
  const a = newGrowth(); a.level = 12; a.weaponLevels.rifle = 5; a.evolved.rifle = true;
  const b = newGrowth();
  assert.equal(b.level, 1); assert.equal(b.xp, 0);
  assert.equal(b.weaponLevels.rifle, 1); assert.equal(b.evolved.rifle, false);
});
