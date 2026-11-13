import test from 'node:test';
import assert from 'node:assert/strict';
import { PocWorld, POC } from '../clients/cocos/assets/scripts/PocWorld.ts';
import {
  MAX_SUPPLIES, SUPPLY_TTL_MS, canSpawnElite, empStats, overclockDurationMs,
} from '../clients/cocos/assets/scripts/m6/supplies.ts';

function frames(world: PocWorld, n: number, x = 0, y = 0): void {
  for (let i = 0; i < n && !world.state.over && !world.decision; i++)
    world.advance(POC.fixedStepMs, { x, y });
}
function solo(): PocWorld {
  const world = new PocWorld(450, 800, 518);
  world.state.enemies.length = 0;
  return world;
}

test('M2 bomber telegraphs a 105px explosion for 850ms then deals exactly two HP', () => {
  const world = solo();
  world.spawnEnemyAt(75, 0, 'bomber');
  world.state.enemies[0].hp = 100000;
  const startHp = world.state.player.hp;
  frames(world, 1);
  assert.equal(world.state.enemies[0]?.windupMs, 850);
  frames(world, 30);
  assert.equal(world.state.player.hp, startHp, 'warning must not deal premature contact damage');
  frames(world, 25);
  assert.equal(world.state.player.hp, startHp - 2);
  assert.ok(world.state.pulses.some(p => p.kind === 'bomber' && p.radius === 105));
  assert.equal(world.state.kills, 0, 'detonation is not an earned player kill');
});
test('M2 bomber explosion is avoidable after telegraph and cancellable by killing it', () => {
  const escaped = solo();
  escaped.spawnEnemyAt(75, 0, 'bomber');
  escaped.state.enemies[0].hp = 100000;
  frames(escaped, 1);
  for (let i = 0; i < 58; i++) {
    // Isolation: the bomber is the only enemy being tested here; ordinary
    // wave spawns could inflict unrelated one-point contact damage.
    for (let j = escaped.state.enemies.length - 1; j >= 0; j--)
      if (escaped.state.enemies[j].kind !== 'bomber') escaped.state.enemies.splice(j, 1);
    escaped.advance(POC.fixedStepMs, { x: -1, y: 0 });
  }
  assert.equal(escaped.state.player.hp, 6, 'moving outside ring avoids blast damage');
  assert.equal(escaped.state.kills, 0);
  const killed = solo();
  killed.spawnEnemyAt(75, 0, 'bomber');
  frames(killed, 1);
  killed.state.enemies[0].hp = 0;
  frames(killed, 1);
  frames(killed, 60);
  assert.equal(killed.state.player.hp, 6, 'killing before the fuse prevents explosion');
  assert.equal(killed.state.kills, 1, 'player kill awards XP once');
  assert.equal(killed.state.pulses.filter(p => p.kind === 'bomber').length, 0);
});
test('M2 4.5-second combo window and tier reset use main streak rules', () => {
  const world = solo();
  for (let i = 0; i < 5; i++) {
    world.spawnEnemyAt(135, 50);
    world.state.enemies[world.state.enemies.length - 1].hp = 0;
    frames(world, 1);
  }
  assert.equal(world.state.streak, 5);
  assert.equal(world.state.bestStreak, 5);
  assert.ok(world.state.streakRemainingMs > 0);
  for (let i = 0; i < 300; i++) {
    // Unrelated auto-rifle kills must not extend the combo being timed out.
    world.state.enemies.length = 0;
    world.state.bullets.length = 0;
    world.heal(1);
    frames(world, 1, 1);
  }
  assert.equal(world.state.streak, 0);
  assert.equal(world.state.bestStreak, 5);
});
test('M3 elite enemies have 2.3x HP, award bonus XP, and drop supplies on death', () => {
  const world = solo();
  world.spawnEnemyAt(125, 0, 'grunt', true);
  const elite = world.state.enemies[0];
  assert.equal(elite.elite, true);
  assert.equal(elite.hp, Math.round(64 * 2.3));
  elite.hp = 0;
  frames(world, 1);
  assert.equal(world.state.kills, 1);
  assert.equal(world.state.supplies.length, 1);
  assert.equal(world.state.supplies[0].x, 125);
  assert.equal(world.state.supplies[0].remainingMs, SUPPLY_TTL_MS);
  assert.equal(canSpawnElite(1, 'grunt', 0, () => 0), false);
  assert.equal(canSpawnElite(4, 'bomber', 0, () => 0), false);
  assert.equal(canSpawnElite(4, 'grunt', 3, () => 0), false);
});
test('M3 repair and overclock pickups use canonical eligibility and timing', () => {
  const world = solo();
  const hp = world.state.player.hp;
  world.spawnSupplyAt(0, 0, 'overclock');
  frames(world, 1);
  assert.equal(world.state.suppliesCollected, 1);
  assert.ok(world.state.overclockMs > overclockDurationMs(false) - 100);
  world.spawnSupplyAt(0, 0, 'repair');
  frames(world, 1);
  assert.equal(world.state.player.hp, hp, 'repair never overheals');
  assert.equal(world.state.suppliesCollected, 2);
  for (let i = 0; i < MAX_SUPPLIES + 3; i++)
    world.spawnSupplyAt(180, 180, 'overclock');
  assert.equal(world.state.supplies.length, MAX_SUPPLIES);
});
test('M3 EMP pickup damages enemies in radius and emits a visible pulse', () => {
  const world = solo();
  world.spawnEnemyAt(105, 0, 'armored');
  world.spawnEnemyAt(200, 0, 'boss'); // boss is inside standard 240px radius
  const armored = world.state.enemies[0], boss = world.state.enemies[1];
  const hp1 = armored.hp, hp2 = boss.hp;
  world.spawnSupplyAt(0, 0, 'emp');
  frames(world, 1);
  const stats = empStats(false);
  assert.equal(armored.hp, hp1 - stats.damage);
  assert.equal(boss.hp, hp2 - stats.damage);
  assert.equal(world.state.suppliesCollected, 1);
  assert.ok(world.state.pulses.some(p => p.kind === 'emp' && p.radius === stats.radius));
});

test('M5.3 arena-edge spawns always enter beyond immediate contact/telegraph distance', () => {
  for (let seed = 1; seed <= 32; seed++) {
    const world = new PocWorld(450, 800, seed);
    world.state.enemies.length = 0;
    world.state.player.x = -world.width / 2 + 26;
    world.state.player.y = -world.height / 2 + 56;
    frames(world, 53);
    assert.ok(world.state.arrivals.length > 0, 'a real edge arrival warning occurred');
    assert.equal(world.state.enemies.length, 0, 'warn before materializing a live enemy');
    for (const arrival of world.state.arrivals) {
      const distance = Math.hypot(arrival.x - world.state.player.x,
        arrival.y - world.state.player.y);
      assert.ok(distance >= 140,
        'arrival marker was clipped too close to a cornered player: ' + distance);
    }
  }
});
