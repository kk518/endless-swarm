import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  applyLevelChoice, evolutionEligible, evolutionRecipeTargets, grantExperience, installWeaponCalibration, killExperience,
  legalLevelChoices, MAX_RUN_LEVEL, MAX_WEAPON_LEVEL, newGrowth, rollLevelChoices,
  weaponTuning, xpToNext,
} from '../src/game/arsenal.ts';
import { applyCard, newBuild, rollCards } from '../src/game/progression.ts';

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

test('unowned weapons have level zero and never appear in combat upgrade choices', () => {
  const build = newBuild(), growth = newGrowth();
  for (const weapon of ['scatter', 'arc', 'flame'] as const) {
    assert.equal(growth.weaponLevels[weapon], 0);
    assert.ok(!legalLevelChoices(build, growth).some(choice => choice.id === `weapon:${weapon}`));
  }
  assert.equal(applyCard(build, 'scatter-kit'), true);
  installWeaponCalibration(growth, 'scatter');
  assert.equal(growth.weaponLevels.scatter, 2);
  assert.ok(legalLevelChoices(build, growth).some(choice => choice.id === 'weapon:scatter'));
});

test('evolution recipes require the exact tactical card, not generic passive growth', () => {
  const build = newBuild(), growth = newGrowth();
  growth.weaponLevels.rifle = 5;
  assert.equal(applyLevelChoice(build, growth, 'core:damage'), true);
  assert.equal(applyLevelChoice(build, growth, 'core:rate'), true);
  assert.equal(applyCard(build, 'emp-array'), true);
  assert.equal(evolutionEligible(build, growth, 'rifle'), false);
  assert.equal(applyCard(build, 'critical-core'), true);
  assert.equal(evolutionEligible(build, growth, 'rifle'), true);

  assert.equal(applyCard(build, 'scatter-kit'), true);
  installWeaponCalibration(growth, 'scatter');
  growth.weaponLevels.scatter = 5;
  assert.equal(evolutionEligible(build, growth, 'scatter'), false);
  assert.equal(applyCard(build, 'warhead'), true);
  assert.equal(evolutionEligible(build, growth, 'scatter'), true);
});

test('fresh run clears XP, weapon rank and evolution flags', () => {
  const a = newGrowth(); a.level = 12; a.weaponLevels.rifle = 5; a.evolved.rifle = true;
  const b = newGrowth();
  assert.equal(b.level, 1); assert.equal(b.xp, 0);
  assert.equal(b.weaponLevels.rifle, 1); assert.equal(b.weaponLevels.scatter, 0);
  assert.equal(b.evolved.rifle, false);
});

test('M5 unowned weapons have no run level and are only calibrated when equipped', () => {
  const build = newBuild(), growth = newGrowth();
  assert.deepEqual(growth.weaponLevels, { rifle: 1, scatter: 0, arc: 0, flame: 0 });
  assert.ok(!legalLevelChoices(build, growth).some(x => x.id === 'weapon:arc'));
  assert.equal(applyCard(build, 'arc-kit'), true);
  installWeaponCalibration(growth, 'arc');
  assert.equal(growth.weaponLevels.arc, 2);
  assert.ok(legalLevelChoices(build, growth).some(x => x.id === 'weapon:arc'));
});

test('M5 evolution recipes require explicit tactical cards, not generic XP damage bonuses', () => {
  const build = newBuild(), growth = newGrowth();
  growth.weaponLevels.rifle = 5;
  assert.equal(applyLevelChoice(build, growth, 'core:damage'), true);
  assert.equal(evolutionEligible(build, growth, 'rifle'), false);
  assert.equal(applyCard(build, 'critical-core'), true);
  assert.equal(evolutionEligible(build, growth, 'rifle'), true);
  assert.equal(applyCard(build, 'scatter-kit'), true);
  growth.weaponLevels.scatter = 5;
  assert.equal(evolutionEligible(build, growth, 'scatter'), false);
  assert.equal(applyLevelChoice(build, growth, 'core:damage'), true);
  assert.equal(evolutionEligible(build, growth, 'scatter'), false);
  assert.equal(applyCard(build, 'warhead'), true);
  assert.equal(evolutionEligible(build, growth, 'scatter'), true);
});

test('M5.1 arc evolution needs exact prerequisite card and applies actual chain/shock tuning', () => {
  const build = newBuild(), growth = newGrowth();
  assert.equal(applyCard(build, 'arc-kit'), true);
  installWeaponCalibration(growth, 'arc');
  growth.weaponLevels.arc = 5;
  assert.equal(evolutionEligible(build, growth, 'arc'), false);
  assert.equal(applyLevelChoice(build, growth, 'core:damage'), true);
  assert.equal(evolutionEligible(build, growth, 'arc'), false);
  assert.equal(applyCard(build, 'chain-blast'), true);
  assert.equal(evolutionEligible(build, growth, 'arc'), true);
  assert.ok(rollLevelChoices(build, growth, () => 0.9).some(choice => choice.id === 'evolve:arc'));
  assert.equal(applyLevelChoice(build, growth, 'evolve:arc'), true);
  const tuning = weaponTuning(growth, 'arc');
  assert.equal(tuning.chains, 8);
  assert.equal(tuning.chainRange, 218);
  assert.equal(tuning.shockMs, 1600);
  assert.ok(tuning.damage > 1.9);
  assert.equal(applyLevelChoice(build, growth, 'evolve:arc'), false);
});

test('M5.1 flame evolution needs blueprint card and adds bounded burn with wider cone', () => {
  const build = newBuild(), growth = newGrowth();
  assert.equal(applyCard(build, 'flame-kit'), true);
  installWeaponCalibration(growth, 'flame');
  growth.weaponLevels.flame = 5;
  assert.equal(evolutionEligible(build, growth, 'flame'), false);
  assert.equal(applyCard(build, 'surge-cell'), true);
  assert.equal(evolutionEligible(build, growth, 'flame'), false);
  assert.equal(applyCard(build, 'overload'), true);
  assert.equal(evolutionEligible(build, growth, 'flame'), true);
  assert.equal(applyLevelChoice(build, growth, 'evolve:flame'), true);
  const tuning = weaponTuning(growth, 'flame');
  assert.ok(tuning.range > 1.5);
  assert.equal(tuning.burnDurationMs, 1750);
  assert.equal(tuning.burnTickDamage, 6);
  assert.equal(tuning.coneHalfAngle, 0.58);
  assert.equal(applyLevelChoice(build, growth, 'evolve:flame'), false);
  const fresh = weaponTuning(newGrowth(), 'flame');
  assert.equal(fresh.burnDurationMs, 0);
  assert.equal(fresh.burnTickDamage, 0);
  assert.equal(fresh.shockMs, 0);
});

test('M5.1 two ready evolutions appear reliably rather than competing in one random pool', () => {
  const build = newBuild(), growth = newGrowth();
  assert.equal(applyCard(build, 'scatter-kit'), true);
  assert.equal(applyCard(build, 'arc-kit'), true);
  growth.weaponLevels.scatter = 5;
  growth.weaponLevels.arc = 5;
  assert.equal(applyCard(build, 'radius'), true);
  assert.equal(applyCard(build, 'cryogenic'), true);
  for (const rng of [() => 0, () => 0.3, () => 0.99, () => 1]) {
    const options = rollLevelChoices(build, growth, rng);
    assert.ok(options.some(x => x.id === 'evolve:scatter'));
    assert.ok(options.some(x => x.id === 'evolve:arc'));
    assert.equal(options.length, 3);
    assert.equal(new Set(options.map(x => x.id)).size, 3);
  }
  const newlyStarted = newGrowth();
  assert.deepEqual(newlyStarted.evolved, { rifle: false, scatter: false, arc: false, flame: false });
});

test('M5.1 combat consumes shock range, cone width and burn ticks without a timer per enemy', () => {
  const source = readFileSync(new URL('../src/game/GameScene.ts', import.meta.url), 'utf8');
  for (const marker of [
    'tuning.chainRange * this.build.range',
    'tuning.shockMs',
    'tuning.coneHalfAngle',
    'tuning.burnDurationMs',
    'tuning.burnTickDamage',
    'enemy.burnTickMs += 250',
    "this.damageEnemy(enemy, enemy.burnDamage)",
  ]) assert.ok(source.includes(marker), `missing live combat integration: ${marker}`);
});

test('M5.1 wave end offers a missing recipe for an invested weapon', () => {
  const build = newBuild(), growth = newGrowth();
  growth.weaponLevels.rifle = 4;
  const suggested = evolutionRecipeTargets(build, growth);
  assert.deepEqual(suggested, ['pierce', 'critical-core']);
  for (const rng of [() => 0, () => 0.5, () => 0.99999]) {
    const options = rollCards(build, 2, rng, suggested);
    assert.equal(options.length, 3);
    assert.ok(options.some(c => suggested.includes(c.id)), 'Missing evolution blueprint choice');
    assert.equal(new Set(options.map(x => x.id)).size, 3);
  }
  assert.equal(applyCard(build, 'pierce'), true);
  assert.deepEqual(evolutionRecipeTargets(build, growth), []);
});

test('M5.1 multiple weapons prefer highest-level missing recipe and never offer invalid repeats', () => {
  const build = newBuild(), growth = newGrowth();
  for (const card of ['scatter-kit', 'arc-kit', 'flame-kit'] as const) {
    assert.equal(applyCard(build, card), true);
  }
  growth.weaponLevels = { rifle: 2, scatter: 3, arc: 5, flame: 4 };
  assert.deepEqual(evolutionRecipeTargets(build, growth), ['cryogenic', 'chain-blast']);
  assert.equal(applyCard(build, 'cryogenic'), true);
  assert.deepEqual(evolutionRecipeTargets(build, growth), ['radius', 'overload']);
  const choice = rollCards(build, 3, () => 0.8, evolutionRecipeTargets(build, growth));
  assert.ok(choice.some(c => c.id === 'radius' || c.id === 'overload'));
  assert.ok(!choice.some(c => c.id === 'cryogenic'));
});

test('M5.1 level-up descriptions reveal evolution ingredients in Chinese when nearly ready', () => {
  const build = newBuild(), growth = newGrowth();
  growth.weaponLevels.rifle = 4;
  const rifle = legalLevelChoices(build, growth).find(c => c.id === 'weapon:rifle');
  assert.ok(rifle?.description.includes('Lv.5'));
  assert.ok(rifle?.description.includes('穿甲弹'));
  assert.ok(rifle?.description.includes('弱点扫描'));
});
