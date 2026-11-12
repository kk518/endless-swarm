import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRandomStream, createRunRandoms, deriveStreamSeed,
  restoreRandoms, snapshotRandoms,
} from '../src/game/runRandom.ts';

test('seeded draws replay exactly after restoring stream state', () => {
  const source = createRandomStream(123);
  const first = Array.from({ length: 10 }, () => source.next());
  assert.ok(first.every(x => x >= 0 && x < 1));
  const snap = source.snapshot();
  const second = Array.from({ length: 8 }, () => source.next());
  const replay = createRandomStream(123);
  assert.deepEqual(Array.from({ length: 10 }, () => replay.next()), first);
  replay.restore(snap);
  assert.deepEqual(Array.from({ length: 8 }, () => replay.next()), second);
  assert.throws(() => replay.restore(0), /Invalid/);
  assert.throws(() => replay.restore(-10), /Invalid/);
});

test('combat/reward/event/visual random domains cannot consume each other', () => {
  const noisy = createRunRandoms(420);
  const clean = createRunRandoms(420);
  for (let i = 0; i < 1000; i++) {
    noisy.visuals.next();
    noisy.events.next();
  }
  assert.deepEqual(Array.from({ length: 10 }, () => noisy.combat.next()),
    Array.from({ length: 10 }, () => clean.combat.next()));
  assert.deepEqual(Array.from({ length: 10 }, () => noisy.rewards.next()),
    Array.from({ length: 10 }, () => clean.rewards.next()));
  assert.notEqual(deriveStreamSeed(420, 'events'), deriveStreamSeed(420, 'combat'));
});

test('all stream cursors can be checkpointed and restored atomically', () => {
  const streams = createRunRandoms(0);
  streams.combat.next();
  streams.rewards.next(); streams.rewards.next();
  const checkpoint = snapshotRandoms(streams);
  const next = [streams.combat.next(), streams.rewards.next(), streams.events.next(), streams.visuals.next()];
  restoreRandoms(streams, checkpoint);
  assert.deepEqual([streams.combat.next(), streams.rewards.next(), streams.events.next(), streams.visuals.next()], next);
  assert.throws(() => restoreRandoms(streams, { ...checkpoint, rewards: 0 }), /Invalid/);
  assert.throws(() => createRandomStream(Number.NaN), /Invalid/);
});
