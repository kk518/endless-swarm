import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GAMEPLAY, bulletDamage, fireIntervalMs, formatTime, isDeployed,
  normalizedMove, selectTarget, spawnIntervalMs,
} from '../src/game/combat.ts';

test('selects nearest living target in range', () => {
  const close = { x: 3, y: 4, alive: true };
  const far = { x: 7, y: 1, alive: true };
  const dead = { x: 1, y: 1, alive: false };
  assert.equal(selectTarget({ x: 0, y: 0 }, [far, dead, close], 8), close);
  assert.equal(selectTarget({ x: 0, y: 0 }, [far], 4), null);
});

test('target stickiness avoids erratic retargeting', () => {
  const current = { x: 11, y: 0, alive: true };
  const slightlyCloser = { x: 10, y: 0, alive: true };
  assert.equal(selectTarget({ x: 0, y: 0 }, [current, slightlyCloser], 100, current), current);
});

test('standing still deploys after delay; moving cancels instantly', () => {
  assert.equal(isDeployed(GAMEPLAY.deployDelayMs - 1, false), false);
  assert.equal(isDeployed(GAMEPLAY.deployDelayMs, false), true);
  assert.equal(isDeployed(4000, true), false);
});

test('deployment increases damage and firing frequency', () => {
  assert.ok(bulletDamage(true) > bulletDamage(false));
  assert.ok(fireIntervalMs(true) < fireIntervalMs(false));
});

test('diagonal movement cannot be faster', () => {
  const move = normalizedMove(1, 1);
  assert.ok(Math.abs(Math.hypot(move.x, move.y) - 1) < 1e-8);
  assert.deepEqual(normalizedMove(0, 0), { x: 0, y: 0 });
});

test('spawn interval scales down but respects cap', () => {
  assert.ok(spawnIntervalMs(60) < spawnIntervalMs(0));
  assert.equal(spawnIntervalMs(1000), 240);
});

test('timer formats minutes and seconds', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(75.3), '01:15');
});
