import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ARRIVAL_WARNING_MS, HUD_DESIGN_WIDTH, MOBILE_WORLD_WIDTH, TARGET_INSET,
  insideReadableView, visibleEdgeSpawn,
} from '../src/game/visibility.ts';

const view = { left: 850, top: 700, right: 1450, bottom: 1700 };
const hero = { x: 1150, y: 1150 };

test('portrait expands horizontal world view without shrinking the fixed HUD design', () => {
  assert.equal(HUD_DESIGN_WIDTH, 450);
  assert.equal(MOBILE_WORLD_WIDTH, 600);
  assert.ok(MOBILE_WORLD_WIDTH / HUD_DESIGN_WIDTH > 1.3);
  assert.equal((MOBILE_WORLD_WIDTH / 2) / (HUD_DESIGN_WIDTH / 2), 4 / 3);
});

test('regular weapons only acquire targets inside the readable camera rectangle', () => {
  assert.equal(TARGET_INSET, 24);
  assert.equal(insideReadableView({ x: 1200, y: 1160 }, view), true);
  assert.equal(insideReadableView({ x: view.right - 20, y: 1160 }, view), false);
  assert.equal(insideReadableView({ x: view.left - 50, y: 1160 }, view), false);
  assert.equal(insideReadableView({ x: 1200, y: view.top + 24 }, view), true);
  assert.equal(insideReadableView({ x: 1200, y: view.bottom + 1 }, view), false);
});

test('swarm entrances fall just inside phone screen edges, with room to approach', () => {
  for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI * 1.4]) {
    const position = visibleEdgeSpawn(hero, view, angle, 2300, 440);
    assert.ok(position, `missing spawn at angle ${angle}`);
    assert.ok(insideReadableView(position, view, 16));
    assert.ok(Math.hypot(position.x - hero.x, position.y - hero.y) >= 245 - 1e-6);
    assert.ok(position.x > 42 && position.x < 2300 - 42);
  }
});

test('impossible spawns near a world boundary are refused instead of appearing on player', () => {
  assert.equal(visibleEdgeSpawn({ x: 90, y: 1150 }, { ...view, left: 0, right: 600 }, Math.PI, 2300, 450), null);
  assert.equal(visibleEdgeSpawn(hero, view, Number.NaN, 2300, 430), null);
  assert.equal(visibleEdgeSpawn(hero, view, 0, 2300, Infinity), null);
});

test('spawn arrival gives visible warning before the enemy can be damaged', () => {
  assert.ok(ARRIVAL_WARNING_MS >= 600);
  const scene = readFileSync(new URL('../src/game/GameScene.ts', import.meta.url), 'utf8');
  assert.ok(scene.includes('this.updateArrivals(ms);'));
  assert.ok(scene.includes('this.arrivingEnemies.push('));
  assert.ok(scene.includes('this.materializeEnemy(arrival.kind, arrival.elite, arrival.x, arrival.y)'));
  assert.ok(scene.includes('this.arrivingEnemies.forEach(enemy => enemy.marker.destroy())'));
  assert.ok(scene.includes('this.readableEnemies()'));
  assert.ok(scene.includes('this.hudLayer.add(this.hudGraphics)'));
  assert.ok(scene.includes('pointer.x / this.hudScale'));
});

test('main canvas uses wider portrait canvas and responsive resize in both dimensions', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(main.includes('portrait ? MOBILE_WORLD_WIDTH : HUD_DESIGN_WIDTH'));
  assert.ok(main.includes('game.scale.resize(width, height)'));
});
