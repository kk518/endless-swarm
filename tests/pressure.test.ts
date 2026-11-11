import assert from 'node:assert/strict';
import test from 'node:test';
import { pressurePlan, spawnOffset, SURGE_PERIOD_MS, SURGE_WARNING_MS } from '../src/game/pressure.ts';

test('all waves escalate pacing and enemy speed while respecting phone budgets', () => {
  let previousSpeed = 0;
  for (let wave = 1; wave <= 5; wave++) {
    const early = pressurePlan(wave, 0, 45000);
    const late = pressurePlan(wave, 45000, 45000);
    assert.ok(early.intervalMs >= 260 && early.intervalMs <= 720);
    assert.ok(late.intervalMs < early.intervalMs);
    assert.ok(late.groupSize >= early.groupSize);
    assert.ok(late.groupSize <= 4);
    assert.ok(early.speedMultiplier > previousSpeed);
    assert.ok(late.speedMultiplier > early.speedMultiplier);
    assert.ok(early.spawnRadius >= 325);
    assert.ok(early.surgeSize >= 4 && early.surgeSize <= 8);
    previousSpeed = early.speedMultiplier;
  }
  assert.ok(SURGE_WARNING_MS >= 1000);
  assert.ok(SURGE_PERIOD_MS >= SURGE_WARNING_MS * 6);
});

test('first wave starts approachable and fifth wave surrounds from multiple angles', () => {
  const intro = pressurePlan(1, 0, 35000);
  const finale = pressurePlan(5, 85000, 90000);
  assert.equal(intro.groupSize, 1);
  assert.ok(finale.groupSize >= 4);
  assert.ok(finale.intervalMs < intro.intervalMs);
  const offsets = Array.from({length: 8}, (_, i) => spawnOffset(i));
  assert.equal(new Set(offsets).size, 8);
  assert.ok(offsets.some(x => x < 0));
  assert.ok(offsets.some(x => x > 0));
});

test('pressure functions are bounded for missing, negative and out-of-range progress', () => {
  const early = pressurePlan(0, -10000, 45000);
  assert.equal(early.groupSize, 1);
  const late = pressurePlan(99, 999999, 100);
  assert.equal(late.groupSize, 4);
  assert.ok(Number.isFinite(pressurePlan(3, NaN, 45000).intervalMs));
});
