import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PocWorld, POC, readableNearestEnemy, type PocEnemy,
} from '../clients/cocos/assets/scripts/PocWorld.ts';
import { ARRIVAL_WARNING_MS, TARGET_INSET, insideReadableView } from
  '../clients/cocos/assets/scripts/m6/visibility.ts';

function step(world: PocWorld, count: number, x = 0, y = 0): void {
  for (let i = 0; i < count && !world.decision && !world.state.over; i++) {
    world.advance(POC.fixedStepMs, { x, y });
  }
}
function isolated(): PocWorld {
  const world = new PocWorld(450, 800, 518);
  world.state.enemies.length = 0;
  return world;
}

test('M5.3 normal auto-lock ignores edge bugs until they enter the readable viewport', () => {
  const view = { left: -225, top: -400, right: 225, bottom: 400 };
  const origin = { x: 0, y: 0 };
  const edge: PocEnemy = { id: 1, x: 200, y: 0, hp: 1, kind: 'grunt' };
  const near: PocEnemy = { id: 2, x: 130, y: 0, hp: 1, kind: 'grunt' };
  assert.equal(TARGET_INSET, 64);
  assert.equal(insideReadableView(edge, view), false);
  assert.equal(insideReadableView(near, view), true);
  assert.equal(readableNearestEnemy(origin, [edge, near], 340, view)?.id, 2);
  assert.equal(readableNearestEnemy(origin, [edge], 340, view), null);
  edge.x = 140;
  assert.equal(readableNearestEnemy(origin, [edge], 340, view)?.id, 1);
});

test('M5.3 stage spawns first show a 700ms warning, then materialize outside auto-lock', () => {
  const world = isolated();
  step(world, 53);
  assert.equal(ARRIVAL_WARNING_MS, 700);
  assert.equal(world.state.enemies.length, 0);
  assert.ok(world.state.arrivals.length > 0, 'real stage created an arrival marker');
  const marker = world.state.arrivals[0];
  const view = { left: -225, right: 225, top: -400, bottom: 400 };
  assert.equal(insideReadableView(marker, view), false);
  assert.ok(Math.hypot(marker.x - world.state.player.x, marker.y - world.state.player.y) >= 140);
  assert.equal(world.state.bullets.length, 0, 'unmaterialized bug cannot be shot');
  step(world, 43);
  // A faster M3.1 grouped spawner may already have scheduled the next warning.
  // Verify the first exact marker materialized, not that no future warning exists.
  assert.ok(world.state.enemies.some(enemy =>
    enemy.kind === marker.kind
    && Math.abs(enemy.x - marker.x) < 1e-9
    && Math.abs(enemy.y - marker.y) < 1e-9),
    'the first warned arrival must become a real enemy after 700ms');
  assert.equal(world.state.kills, 0);
});

test('M1 spitter waits through 700ms telegraph before emitting its genuine acid projectile', () => {
  const world = isolated();
  world.spawnEnemyAt(150, 0, 'spitter');
  const spitter = world.state.enemies[0];
  spitter.hp = 100000; // Isolate ranged AI from automatic rifle damage.
  spitter.attackCooldownMs = 0;
  step(world, 1);
  assert.equal(spitter.windupMs, 700);
  step(world, 20);
  assert.ok((spitter.windupMs ?? 0) > 300);
  assert.equal(world.state.acids.length, 0);
  step(world, 23);
  assert.equal(spitter.windupMs, 0);
  assert.equal(world.state.acids.length, 1);
  assert.ok(world.state.acids[0].vx < 0);
  assert.equal(world.state.acids[0].remainingMs < 2200, true);
  step(world, 42);
  assert.equal(world.state.player.hp, 5, 'acid hit applies one HP after reaching the player');
  assert.equal(world.state.acids.length, 0, 'acid is consumed when it hits');
});

test('M1 leaper telegraphs for 530ms then dashes 102 units instead of teleporting', () => {
  const world = isolated();
  world.spawnEnemyAt(145, 0, 'leaper');
  const leaper = world.state.enemies[0];
  leaper.hp = 100000;
  leaper.attackCooldownMs = 0;
  step(world, 1);
  assert.equal(leaper.windupMs, 530);
  const from = leaper.x;
  step(world, 20);
  assert.equal(leaper.x, from, 'leaper remains visible during its warning');
  step(world, 12);
  assert.ok(leaper.x < from - 95, 'post-warning leap moves about 102 units towards hero');
  assert.equal(leaper.windupMs, 0);
  assert.ok((leaper.attackCooldownMs ?? 0) > 3000, 'dash respects 3600ms cooldown');
});

test('M1 spitter acid expires and does not carry across reset', () => {
  const world = isolated();
  world.state.acids.push({ x: 0, y: 280, vx: 0, vy: 0, remainingMs: 10 });
  step(world, 1);
  assert.equal(world.state.acids.length, 0);
  world.state.acids.push({ x: 0, y: 280, vx: 0, vy: 0, remainingMs: 1000 });
  world.state.arrivals.push({
    x: 200, y: 0, kind: 'spitter', elite: false,
    remainingMs: ARRIVAL_WARNING_MS, durationMs: ARRIVAL_WARNING_MS,
  });
  world.reset();
  assert.deepEqual(world.state.acids, []);
  assert.deepEqual(world.state.arrivals, []);
});

test('M5.3 staged arrivals and specialist AI remain deterministic for the same seed', () => {
  const a = isolated(), b = isolated();
  step(a, 120, 0.3, -0.1);
  step(b, 120, 0.3, -0.1);
  assert.deepEqual(a.state, b.state);
});
