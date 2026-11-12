import assert from 'node:assert/strict';
import test from 'node:test';
import { createContentCatalog } from '../src/game/contentCatalog.ts';
import { createHeroRuntimeRegistry } from '../src/game/heroRuntime.ts';

const catalog = createContentCatalog([
  { id: 'marine', name: '星际战士', starterWeaponId: 'rifle', passiveId: null, signatureWeaponId: null },
  { id: 'ash', name: '灰烬', starterWeaponId: 'flame', passiveId: 'ember-spread', signatureWeaponId: 'furnace' },
], [
  { id: 'rifle', name: '步枪', slot: 'standard', tags: ['kinetic'], driverId: 'rifle' },
  { id: 'flame', name: '喷火器', slot: 'standard', tags: ['burning'], driverId: 'flame' },
  { id: 'furnace', name: '地狱熔炉', slot: 'signature', tags: ['burning'], driverId: 'furnace' },
]);

test('hero passive lifecycle accepts new hero runtime without hardcoding hero union', () => {
  const log: string[] = [];
  const table = createHeroRuntimeRegistry(catalog, [
    { heroId: 'marine', passiveId: null },
    { heroId: 'ash', passiveId: 'ember-spread',
      onRunStart: () => log.push('start'),
      onCombatTick: dt => log.push(`tick:${dt}`),
      onEnemyKilled: e => log.push(`kill:${e.enemyKind}:${e.elite}`),
    },
  ]);
  table.get('ash')?.onRunStart?.();
  table.get('ash')?.onCombatTick?.(16);
  table.get('ash')?.onEnemyKilled?.({ enemyKind: 'grunt', elite: false, timeMs: 800 });
  assert.deepEqual(log, ['start', 'tick:16', 'kill:grunt:false']);
  assert.equal(table.get('marine')?.passiveId, null);
});

test('cannot silently ship missing, duplicate or incorrectly wired passive drivers', () => {
  assert.throws(() => createHeroRuntimeRegistry(catalog, [{ heroId: 'marine', passiveId: null }]), /Missing hero/);
  assert.throws(() => createHeroRuntimeRegistry(catalog, [
    { heroId: 'marine', passiveId: null }, { heroId: 'marine', passiveId: null },
    { heroId: 'ash', passiveId: 'ember-spread' },
  ]), /Duplicate hero/);
  assert.throws(() => createHeroRuntimeRegistry(catalog, [
    { heroId: 'marine', passiveId: null }, { heroId: 'ash', passiveId: null },
  ]), /passive mismatch/);
  assert.throws(() => createHeroRuntimeRegistry(catalog, [
    { heroId: 'marine', passiveId: null }, { heroId: 'ash', passiveId: 'ember-spread' },
    { heroId: 'unknown', passiveId: null },
  ]), /passive mismatch/);
});


