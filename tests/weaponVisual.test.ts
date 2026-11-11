import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { applyCard, newBuild, rollCards } from '../src/game/progression.ts';
import {
  bodyOffset, visibleLoadout, visualPowerTier, WEAPON_LIGHT, WEAPON_MOUNTS,
} from '../src/game/weaponVisual.ts';

test('M4.1 keeps a recognizable primary gun and unlocks three distinct visible mounts', () => {
  const build = newBuild();
  assert.deepEqual(visibleLoadout(build.weapons), ['rifle']);
  assert.equal(visualPowerTier(build), 0);
  for (const [card, weapon] of [
    ['scatter-kit', 'scatter'],
    ['arc-kit', 'arc'],
    ['flame-kit', 'flame'],
  ] as const) {
    assert.equal(applyCard(build, card), true);
    assert.ok(visibleLoadout(build.weapons).includes(weapon));
  }
  assert.deepEqual(visibleLoadout(build.weapons), ['rifle', 'scatter', 'arc', 'flame']);
  assert.equal(visualPowerTier(build), 3);
  assert.equal(new Set(Object.values(WEAPON_MOUNTS).map(p => `${p.x}:${p.y}`)).size, 3);
  assert.equal(new Set(Object.values(WEAPON_LIGHT)).size, 4);
});

test('M4.1 visual charge is immediate, accumulates each upgrade, and is bounded', () => {
  const build = newBuild();
  for (const id of ['feed', 'warhead', 'thrusters'] as const) {
    assert.equal(applyCard(build, id), true);
  }
  assert.equal(visualPowerTier(build), 3);
  assert.equal(applyCard(build, 'plating'), true);
  assert.equal(visualPowerTier(build), 3);
  assert.equal(visualPowerTier(newBuild()), 0);
  assert.equal(visualPowerTier({ selected: [] }), 0);
});

test('weapon attachment coordinates follow suit rotation without breaking their offsets', () => {
  assert.deepEqual(bodyOffset(10, -20, 0), { x: 10, y: -20 });
  const turn = bodyOffset(10, -20, Math.PI / 2);
  assert.ok(Math.abs(turn.x - 20) < 1e-9);
  assert.ok(Math.abs(turn.y - 10) < 1e-9);
  for (const meta of Object.values(WEAPON_MOUNTS)) {
    assert.ok(meta.muzzle >= 20);
    assert.ok(Math.hypot(meta.x, meta.y) <= 43);
  }
});

test('all four inter-wave upgrades can offer a new module before all slots are full', () => {
  const build = newBuild();
  for (const wave of [1, 2, 3, 4]) {
    const choices = rollCards(build, wave, () => 0.4);
    assert.ok(choices.some(card => card.weapon), `missing weapon in reward ${wave}`);
    const weaponCard = choices.find(card => card.weapon);
    if (weaponCard) assert.equal(applyCard(build, weaponCard.id), true);
    if (build.weapons.length >= 4) break;
  }
  assert.equal(build.weapons.length, 4);
  assert.ok(rollCards(build, 4).every(card => !card.weapon));
});

test('visual effects are wired to actual weapon attacks, not only the card picker', () => {
  const scene = readFileSync(new URL('../src/game/GameScene.ts', import.meta.url), 'utf8');
  const art = readFileSync(new URL('../src/game/Art.ts', import.meta.url), 'utf8');
  for (const tex of ['mount-scatter', 'mount-arc', 'mount-flame', 'muzzle-flash']) {
    assert.ok(art.includes(`make('${tex}',`), `missing mount texture: ${tex}`);
  }
  for (const marker of [
    'this.updateWeaponRig(ms)', 'this.refreshMountedWeapons()',
    "this.burstMuzzle('scatter'", "this.burstMuzzle('arc'", "this.burstMuzzle('flame'",
    "this.addCombatVisual('beam'",
    'this.updateCombatVisuals(ms)',
  ]) assert.ok(scene.includes(marker), `missing combat wiring: ${marker}`);
  assert.ok(scene.includes("'cone', point.x"), 'flame/scatter cone should be drawn');
});
