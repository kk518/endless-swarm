import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PocWorld, POC, deploymentReady, nearestEnemy, normalizedMove,
} from '../clients/cocos/assets/scripts/PocWorld.ts';

function tick(world: PocWorld, frames: number, x = 0, y = 0): void {
  for (let n = 0; n < frames; n++) world.advance(POC.fixedStepMs, { x, y });
}

test('Cocos PoC core normalizes diagonal movement and rejects non-finite input', () => {
  assert.ok(Math.abs(Math.hypot(...Object.values(normalizedMove(1, 1))) - 1) < 1e-10);
  assert.deepEqual(normalizedMove(NaN, 1), { x: 0, y: 0 });
});
test('stationary deployment requires 800ms; movement cancels immediately', () => {
  const world = new PocWorld();
  tick(world, 47);
  assert.equal(world.state.player.deployed, false);
  tick(world, 2);
  assert.equal(world.state.player.deployed, true);
  tick(world, 1, 1, 0);
  assert.equal(world.state.player.deployed, false);
  assert.equal(deploymentReady(800, true), false);
});
test('one touch-equivalent movement intent changes position in world coordinates', () => {
  const world = new PocWorld();
  tick(world, 20, 1, 0);
  assert.ok(world.state.player.x > 60);
});
test('auto rifle shoots and can kill enemies without an attack button', () => {
  const world = new PocWorld();
  tick(world, 240);
  assert.ok(world.state.kills >= 1);
});
test('nearest target respects range and ignores dead targets', () => {
  const a = { id: 1, x: 5, y: 0, hp: 0 };
  const b = { id: 2, x: 8, y: 0, hp: 8 };
  assert.equal(nearestEnemy({ x: 0, y: 0 }, [a, b], 10)?.id, 2);
  assert.equal(nearestEnemy({ x: 0, y: 0 }, [a, b], 6), null);
});
test('a huge frame never triggers minutes of catch-up simulation', () => {
  const world = new PocWorld();
  world.advance(60_000, { x: 0, y: 0 });
  assert.ok(world.state.elapsedMs <= 5 * POC.fixedStepMs + 0.0001);
  world.discardFrameDebt();
  world.advance(POC.fixedStepMs, { x: 0, y: 0 });
  assert.ok(world.state.elapsedMs <= 6 * POC.fixedStepMs + 0.0001);
});
test('spawn sequences and combat results are repeatable for a fixed seed', () => {
  const a = new PocWorld(450, 800, 777);
  const b = new PocWorld(450, 800, 777);
  tick(a, 480, 0, -0.3); tick(b, 480, 0, -0.3);
  assert.deepEqual(a.state, b.state);
});
test('reset removes old projectiles, kills, and deployment state', () => {
  const world = new PocWorld();
  tick(world, 160);
  world.reset();
  assert.equal(world.state.kills, 0);
  assert.equal(world.state.bullets.length, 0);
  assert.equal(world.state.enemies.length, 1);
  assert.equal(world.state.player.stationaryMs, 0);
});
test('Cocos PoC world uses no Phaser or cc engine dependency', async () => {
  // Importing this same source through Node is a dependency boundary smoke test.
  const mod = await import('../clients/cocos/assets/scripts/PocWorld.ts');
  assert.equal(typeof mod.PocWorld, 'function');
});
