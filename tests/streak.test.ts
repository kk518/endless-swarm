import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceStreak, STREAK_WINDOW_MS, streakActive, streakDamageMultiplier, streakTier,
} from '../src/game/streak.ts';

test('M2 combo grows only within its 4.5 second window', () => {
  assert.equal(advanceStreak(0, -10000, 100), 1);
  assert.equal(advanceStreak(4, 100, 100 + STREAK_WINDOW_MS), 5);
  assert.equal(advanceStreak(4, 100, 100 + STREAK_WINDOW_MS + 1), 1);
  assert.equal(advanceStreak(4, 5000, 100), 1);
  assert.equal(advanceStreak(999, 200, 300), 999);
  assert.equal(streakActive(3, 100, 100 + STREAK_WINDOW_MS), true);
  assert.equal(streakActive(3, 100, 100 + STREAK_WINDOW_MS + 1), false);
  assert.equal(streakActive(0, 100, 200), false);
});

test('combo bonus tiers and Frenzy reward cap at 20 kills', () => {
  assert.equal(streakTier(0), 0);
  assert.equal(streakTier(4), 0);
  assert.equal(streakTier(5), 1);
  assert.equal(streakTier(9), 1);
  assert.equal(streakTier(10), 2);
  assert.equal(streakTier(19), 2);
  assert.equal(streakTier(20), 3);
  assert.equal(streakTier(100), 3);
  assert.equal(streakDamageMultiplier(4, true), 1);
  assert.equal(streakDamageMultiplier(10, false), 1.2);
  assert.ok(Math.abs(streakDamageMultiplier(20, true) - 1.45) < 1e-8);
});
