import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTENT_CATALOG, CURRENT_HERO_ID, createContentCatalog, resolveHeroLoadout,
  type HeroDefinition, type WeaponDefinition,
} from '../src/game/contentCatalog.ts';

const weapons: WeaponDefinition[] = [
  { id: 'rifle', name: '步枪', slot: 'standard', tags: ['kinetic'], driverId: 'rifle' },
  { id: 'freeze', name: '低温投射器', slot: 'standard', tags: ['frost', 'control'], driverId: 'freeze' },
  { id: 'tesla-tower', name: '风暴塔', slot: 'signature', tags: ['electric', 'deploy'], driverId: 'tesla-tower' },
];
const heroes: HeroDefinition[] = [
  { id: 'eve', name: '伊芙', starterWeaponId: 'freeze',
    passiveId: 'overcharge', signatureWeaponId: 'tesla-tower' },
];

test('production content catalogs exactly the legacy playable weapons, not unfinished heroes', () => {
  assert.deepEqual([...CONTENT_CATALOG.weapons.keys()], ['rifle', 'scatter', 'arc', 'flame']);
  assert.deepEqual([...CONTENT_CATALOG.heroes.keys()], [CURRENT_HERO_ID]);
  assert.deepEqual(resolveHeroLoadout(CONTENT_CATALOG, CURRENT_HERO_ID),
    { heroId: 'marine', standardWeaponIds: ['rifle'], signatureWeaponId: null });
});

test('new heroes and ordinary/signature weapon IDs can extend without editing legacy union', () => {
  const catalog = createContentCatalog(heroes, weapons);
  const loadout = resolveHeroLoadout(catalog, 'eve');
  assert.deepEqual(loadout, { heroId: 'eve', standardWeaponIds: ['freeze'], signatureWeaponId: 'tesla-tower' });
  assert.equal(catalog.weapons.get('freeze')?.driverId, 'freeze');
  assert.equal(catalog.weapons.get('tesla-tower')?.slot, 'signature');
  assert.equal(catalog.heroes.get('eve')?.passiveId, 'overcharge');
  assert.throws(() => resolveHeroLoadout(catalog, 'ash'), /Unknown hero/);
  assert.ok(Object.isFrozen(catalog.weapons.get('freeze')?.tags));
});

test('rejects duplicate content and invalid hero starting/signature weapon slots', () => {
  assert.throws(() => createContentCatalog(heroes, [...weapons, weapons[0]]), /duplicate weapon/);
  assert.throws(() => createContentCatalog([...heroes, heroes[0]], weapons), /duplicate hero/);
  assert.throws(() => createContentCatalog([{ ...heroes[0], starterWeaponId: 'tesla-tower' }], weapons), /standard starter/);
  assert.throws(() => createContentCatalog([{ ...heroes[0], signatureWeaponId: 'rifle' }], weapons), /signature weapon/);
  assert.throws(() => createContentCatalog([{ ...heroes[0], passiveId: 'INVALID ID' }], weapons), /Invalid passive/);
  assert.throws(() => createContentCatalog([], weapons), /at least one playable hero/);
});
