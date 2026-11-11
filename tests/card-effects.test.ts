import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCard, CARDS, newBuild, rollCards, type CardId,
} from '../src/game/progression.ts';
import {
  GAMEPLAY, buildReadout, buildWeaponDamage, buildWeaponInterval,
} from '../src/game/combat.ts';

test('every eligible card changes meaningful battle state, not only the selected-card list', () => {
  assert.equal(CARDS.length, 22);
  for (const card of CARDS) {
    const build = newBuild();
    build.hp = 3; // Make the healing card eligible, too.
    const before = { ...build, weapons: [...build.weapons], selected: [] };
    assert.equal(applyCard(build, card.id), true, card.id);
    const after = { ...build, weapons: [...build.weapons], selected: [] };
    assert.notDeepEqual(after, before, card.id);
  }
});

test('damage and fire-rate upgrades are consumed by the same formulas as the live weapon system', () => {
  const build = newBuild();
  const base = GAMEPLAY.bulletDamage;
  const interval = GAMEPLAY.fireIntervalMs;
  assert.equal(buildWeaponDamage(base, build, false, false, 0), base);
  assert.equal(buildWeaponInterval(interval, build, false, false, false), interval);
  assert.equal(applyCard(build, 'warhead'), true);
  assert.equal(applyCard(build, 'feed'), true);
  assert.equal(buildWeaponDamage(base, build, false, false, 0), base * 1.25);
  assert.equal(buildWeaponInterval(interval, build, false, false, false), interval / 1.25);
  assert.ok(buildReadout(build).includes('火力+25%'));
  assert.ok(buildReadout(build).includes('射速+25%'));
});

test('conditional combat upgrades affect the actual combat calculations when triggered', () => {
  const build = newBuild();
  assert.equal(applyCard(build, 'afterglow'), true);
  assert.ok(Math.abs(buildWeaponDamage(100, build, false, true, 0) - 115) < 1e-8);
  assert.equal(buildWeaponDamage(100, build, false, false, 0), 100);
  assert.equal(applyCard(build, 'frenzy'), true);
  assert.ok(Math.abs(buildWeaponDamage(100, build, false, false, 20) - 145) < 1e-8);
  assert.equal(applyCard(build, 'overload'), true);
  const nominal = buildWeaponInterval(250, build, true, false, false);
  const overloaded = buildWeaponInterval(250, build, true, true, false);
  assert.ok(overloaded < nominal);
  assert.ok(buildWeaponInterval(250, build, false, true, false) === 250);
  assert.ok(buildWeaponInterval(250, build, true, false, true) < nominal);
});

test('supply-oriented cards now have immediate passive value without waiting for a supply drop', () => {
  const b = newBuild();
  assert.equal(applyCard(b, 'supply-magnet'), true);
  assert.equal(applyCard(b, 'surge-cell'), true);
  assert.equal(applyCard(b, 'emp-array'), true);
  assert.ok(b.speed > 1);
  assert.ok(b.rate > 1);
  assert.ok(b.damage > 1);
  assert.ok(buildWeaponDamage(100, b, false, false, 0) > 100);
  assert.ok(buildWeaponInterval(255, b, false, false, false) < 255);
});

test('early rewards always show a new weapon and an immediately useful upgrade', () => {
  const immediatelyUseful = new Set<CardId>(['feed', 'warhead', 'thrusters', 'plating', 'critical-core']);
  for (const rng of [() => 0, () => 0.29, () => 0.99]) {
    for (const wave of [1, 2]) {
      const options = rollCards(newBuild(), wave, rng);
      assert.equal(options.length, 3);
      assert.ok(options.some(c => c.weapon), 'Missing second weapon');
      assert.ok(options.some(c => immediatelyUseful.has(c.id)), 'Missing immediately useful card');
    }
  }
});
