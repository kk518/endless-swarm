import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canSpawnElite, empStats, MAX_SUPPLIES, overclockDurationMs, rollSupplyKind,
  SUPPLY_PERIOD_MS, SUPPLY_REACH, SUPPLY_TTL_MS, withinPickupReach,
} from '../src/game/supplies.ts';

test('M3 supply kinds adapt to missing armor and clamp input randomness', () => {
  assert.equal(rollSupplyKind(true, () => 0), 'repair');
  assert.equal(rollSupplyKind(true, () => 0.29), 'repair');
  assert.equal(rollSupplyKind(true, () => 0.3), 'overclock');
  assert.equal(rollSupplyKind(true, () => 0.66), 'emp');
  assert.equal(rollSupplyKind(false, () => 0), 'overclock');
  assert.equal(rollSupplyKind(false, () => 0.54), 'overclock');
  assert.equal(rollSupplyKind(false, () => 0.55), 'emp');
  assert.notEqual(rollSupplyKind(false, () => 0.999), 'repair');
  assert.equal(rollSupplyKind(false, () => Number.NaN), 'overclock');
});

test('M3 magnetic pickup radius has inclusive boundary, excludes invalid distances', () => {
  assert.equal(withinPickupReach(SUPPLY_REACH ** 2, false), true);
  assert.equal(withinPickupReach(SUPPLY_REACH ** 2 + 1, false), false);
  assert.equal(withinPickupReach((SUPPLY_REACH * 1.8) ** 2, true), true);
  assert.equal(withinPickupReach((SUPPLY_REACH * 1.8) ** 2 + 1, true), false);
  assert.equal(withinPickupReach(-1, true), false);
  assert.equal(withinPickupReach(Number.NaN, true), false);
});

test('M3 supply upgrade effects have finite bounds, pickups expire and are capped', () => {
  assert.equal(overclockDurationMs(false), 8500);
  assert.equal(overclockDurationMs(true), 13000);
  assert.deepEqual(empStats(false), { radius: 240, damage: 100 });
  assert.deepEqual(empStats(true), { radius: 310, damage: 145 });
  assert.ok(SUPPLY_TTL_MS >= SUPPLY_PERIOD_MS);
  assert.ok(MAX_SUPPLIES <= 8);
});

test('M3 elites appear only in waves 2–5 with a maximum of three', () => {
  assert.equal(canSpawnElite(1, 'grunt', 0, () => 0), false);
  assert.equal(canSpawnElite(3, 'boss', 0, () => 0), false);
  assert.equal(canSpawnElite(3, 'bomber', 0, () => 0), false);
  assert.equal(canSpawnElite(3, 'grunt', 3, () => 0), false);
  assert.equal(canSpawnElite(3, 'grunt', 2, () => 0), true);
  assert.equal(canSpawnElite(3, 'grunt', 0, () => 1), false);
  assert.equal(canSpawnElite(5, 'spitter', 0, () => 0.1399), true);
  assert.equal(canSpawnElite(5, 'spitter', 0, () => 0.14), false);
});
