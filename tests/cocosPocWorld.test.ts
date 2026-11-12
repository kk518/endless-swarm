import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PocWorld, POC, deploymentReady, nearestEnemy, normalizedMove, enemyStats, xpRequired,
} from '../clients/cocos/assets/scripts/PocWorld.ts';

function tick(world: PocWorld, frames: number, x = 0, y = 0): void {
  for (let n = 0; n < frames; n++) world.advance(POC.fixedStepMs, { x, y });
}
function tickDuration(world: PocWorld, durationMs: number, x = 0, y = 0, keepAlive = false): void {
  // PocWorld deliberately caps expensive catch-up to five 60Hz steps per frame.
  // Tests must advance by the canonical fixed step, not submit 250ms frames
  // and incorrectly assume all 250ms were simulated.
  const count = Math.ceil(durationMs / POC.fixedStepMs) + 2;
  for (let frame = 0; frame < count && !world.decision && !world.state.over; frame++) {
    if (keepAlive) world.heal(1);
    world.advance(POC.fixedStepMs, { x, y });
  }
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

test('new enemy classes have differentiated health, speed, and rewards', () => {
  assert.ok(enemyStats('leaper').speed > enemyStats('grunt').speed);
  assert.ok(enemyStats('armored').hp > enemyStats('grunt').hp);
  assert.ok(enemyStats('boss').xp > enemyStats('armored').xp);
});
test('kill XP auto-levels without a modal; a weapon is unlocked by a legal encounter card', () => {
  const world = new PocWorld();
  world.state.enemies[0].hp = 0;
  tick(world, 1);
  for (let i = 0; i < 28; i++) {
    world.spawnEnemyAt(135, 50);
    world.state.enemies[world.state.enemies.length - 1].hp = 0;
    tick(world, 1);
  }
  assert.ok(world.state.level >= 2);
  assert.equal(world.state.arcUnlocked, false);
  assert.equal(world.decision, null);
  assert.equal(world.state.xpToNext, xpRequired(world.state.level));
  tickDuration(world, world.currentWaveDurationMs, 0, 0, true);
  const decision = world.decision;
  assert.equal(decision?.kind, 'card');
  if (decision?.kind !== 'card') throw new Error('expected a card offer');
  const weaponIndex = decision.options.findIndex(option => option.weapon && option.weapon !== 'rifle');
  assert.ok(weaponIndex >= 0, 'early reward must offer a real installed weapon driver');
  const weapon = decision.options[weaponIndex].weapon!;
  assert.equal(world.chooseDecision(weaponIndex), true);
  assert.ok(world.state.weapons.includes(weapon), 'the installed weapon is now playable');
  assert.equal(world.state.weaponLevels[weapon], 2, 'new weapon starts with main-M5 calibration');
  assert.equal(world.state.arcUnlocked, weapon === 'arc');
});
test('prototype encounter pauses for a three-card decision and advances only after selection', () => {
  const world = new PocWorld();
  tickDuration(world, world.currentWaveDurationMs, 1, 0, true);
  assert.equal(world.state.wave, 1);
  const decision = world.decision;
  assert.equal(decision?.kind, 'card');
  if (decision?.kind !== 'card') throw new Error('expected a card offer');
  assert.equal(decision.options.length, 3);
  assert.equal(world.chooseDecision(0), true);
  assert.equal(world.state.wave, 2);
  assert.equal(world.decision, null);
});
test('canonical five-stage campaign reaches the boss finale and completes on boss kill', () => {
  const world = new PocWorld();
  for (let stage = 0; stage < 4; stage++) {
    tickDuration(world, world.currentWaveDurationMs, 1, 0, true);
    const decision = world.decision;
    assert.equal(decision?.kind, 'card');
    assert.equal(world.chooseDecision(0), true);
  }
  assert.equal(world.state.wave, 5);
  tickDuration(world, 2600, 0, 0, true);
  assert.equal(world.state.bossSpawned, true);
  const boss = world.state.enemies.find(e => e.kind === 'boss');
  if (boss) {
    boss.hp = 0;
    tickDuration(world, POC.fixedStepMs, 0, 0, true);
  } else {
    assert.equal(world.state.won, true,
      'a missing boss is valid only when real equipped weapons already defeated it');
  }
  assert.equal(world.state.won, true);
  assert.equal(world.state.over, true);
});
test('reset clears modern wave/XP/lightning/boss state without losing starting rifle', () => {
  const world = new PocWorld();
  world.state.player.hp = 1000;
  tick(world, 1600);
  world.reset();
  assert.equal(world.state.wave, 1);
  assert.equal(world.state.level, 1);
  assert.equal(world.state.arcUnlocked, false);
  assert.equal(world.state.bossSpawned, false);
  assert.deepEqual(world.state.lightning, []);
  assert.equal(world.state.won, false);
  assert.equal(world.state.enemies.length, 1);
});

test('expedition PoC is selectable and really reaches a route decision in Cocos core', () => {
  const world = new PocWorld(450, 800, 518, 'steel-ruins', {}, 'marine', 'expedition');
  assert.equal(world.state.mode, 'expedition');
  assert.equal(world.state.totalStages, 9);
  tickDuration(world, world.currentWaveDurationMs, 1, 0, true);
  assert.equal(world.decision?.kind, 'card');
  assert.equal(world.chooseDecision(0), true);
  tickDuration(world, world.currentWaveDurationMs, 1, 0, true);
  const fork = world.decision;
  assert.equal(fork?.kind, 'route');
  if (fork?.kind !== 'route') throw new Error('expected the genuine M6 fork');
  assert.equal(fork.options.length, 2);
  assert.equal(world.chooseDecision(0), true);
  assert.equal(world.state.wave, 3);
  assert.equal(world.state.campaignId, 'k09-three-act-draft');
});

test('main M5 four-weapon core supports real buckshot and continuous flame drivers', async () => {
  const { CocosRunController } = await import('../clients/cocos/assets/scripts/m6/runController.ts');
  for (const weapon of ['scatter','flame'] as const) {
    // Reward RNG is isolated from combat RNG; find a seed which legally offers
    // this historical weapon instead of mutating private build state.
    let seed = -1;
    for (let candidate = 1; candidate <= 300; candidate++) {
      const run = new CocosRunController({
        seed: candidate, runId: 'weapon-seed-' + String(candidate).padStart(4, '0'),
        playableWeapons: ['rifle','scatter','arc','flame'],
      });
      run.tick(run.currentWave.durationMs);
      if (run.snapshot().decision?.kind === 'card'
        && run.snapshot().decision?.options.some(c => c.weapon === weapon)) {
        seed = candidate;
        break;
      }
    }
    assert.ok(seed > 0, 'expected early legal card for ' + weapon);
    const world = new PocWorld(450,800,seed);
    tickDuration(world,world.currentWaveDurationMs,1,0,true);
    const decision = world.decision;
    assert.equal(decision?.kind,'card');
    if (decision?.kind !== 'card') throw new Error('expected card picker');
    const index = decision.options.findIndex(c => c.weapon === weapon);
    assert.ok(index >= 0, 'reward stream preserved after combat kills for ' + weapon);
    assert.equal(world.chooseDecision(index),true);
    assert.ok(world.state.weapons.includes(weapon));
    assert.equal(world.state.weaponLevels[weapon],2);
    world.state.enemies.length=0;
    world.state.bullets.length=0;
    world.state.lightning.length=0;
    world.spawnEnemyAt(world.state.player.x+90,world.state.player.y,'armored');
    const enemy = world.state.enemies[0];
    const startHp=enemy.hp;
    world.advance(POC.fixedStepMs,{x:0,y:0});
    if(weapon==='scatter'){
      assert.ok(world.state.bullets.filter(b=>b.source==='scatter').length>=5,
        'scatter attack emitted the actual five-pellet salvo');
    }else{
      assert.ok(world.state.lightning.some(line=>line.kind==='flame'),
        'flame emitted real area attack feedback');
      assert.ok(enemy.hp<startHp,'flame cone applied damage directly to a target');
    }
  }
});

test('kill XP upgrades actual rifle projectiles while no mid-wave modal interrupts combat', () => {
  const world=new PocWorld(450,800,111);
  for(let i=0;i<85;i++){
    world.state.enemies.length=0;
    world.spawnEnemyAt(125,40,'grunt');
    world.state.enemies[0].hp=0;
    world.advance(POC.fixedStepMs,{x:0,y:0});
  }
  assert.equal(world.state.weaponLevels.rifle,5);
  assert.equal(world.decision,null);
  world.state.enemies.length=0;
  world.state.bullets.length=0;
  world.spawnEnemyAt(145,0,'armored');
  for(let i=0;i<30&&!world.state.bullets.some(b=>b.source==='rifle');i++)
    world.advance(POC.fixedStepMs,{x:0,y:0});
  const bullet=world.state.bullets.find(b=>b.source==='rifle');
  assert.ok(bullet,'rifle must remain firing while auto-leveled');
  assert.ok(bullet.damage>28,'M5 weapon rank modifies actual bullet damage');
});
