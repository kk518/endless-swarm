import assert from 'node:assert/strict';
import test from 'node:test';
import { createContentCatalog } from '../src/game/contentCatalog.ts';
import {
  assertWeaponSlots, createWeaponRuntimeRegistry, type AttackDriver,
} from '../src/game/weaponRuntime.ts';

const catalog = createContentCatalog(
  [{ id: 'eve', name: '伊芙', starterWeaponId: 'arc', passiveId: 'overcharge', signatureWeaponId: 'tesla' }],
  [
    { id: 'arc', name: '电弧', slot: 'standard', tags: ['electric'], driverId: 'arc-beam' },
    { id: 'tesla', name: '特斯拉', slot: 'signature', tags: ['electric', 'deploy'], driverId: 'tower' },
  ],
);
type Target = { hp: number };
const attacks: AttackDriver<Target, { damage: number }>[] = [
  { driverId: 'arc-beam', slot: 'standard', baseRange: 320, baseIntervalMs: 980,
    attack: (target, _angle, tuning) => { target.hp -= tuning.damage; } },
  { driverId: 'tower', slot: 'signature', baseRange: 230, baseIntervalMs: 14000,
    attack: (target, _angle, tuning) => { target.hp -= tuning.damage * 2; } },
];

test('ordinary and exclusive weapon drivers are registered independently of IDs', () => {
  const drivers = createWeaponRuntimeRegistry(catalog, attacks);
  assertWeaponSlots(['arc', 'tesla'], drivers);
  assert.equal(drivers.get('arc')?.driverId, 'arc-beam');
  assert.equal(drivers.get('tesla')?.slot, 'signature');
  const target: Target = { hp: 10 };
  drivers.get('arc')?.attack(target, 0, { damage: 2 });
  drivers.get('tesla')?.attack(target, 0, { damage: 1 });
  assert.equal(target.hp, 6);
});

test('drivers must match actual catalog slots, ranges, cooldowns and unique ids', () => {
  assert.throws(() => createWeaponRuntimeRegistry(catalog, attacks.slice(0, 1)), /Missing signature/);
  assert.throws(() => createWeaponRuntimeRegistry(catalog, [...attacks, attacks[0]]), /duplicate attack driver/);
  assert.throws(() => createWeaponRuntimeRegistry(catalog, [{ ...attacks[0], baseRange: 0 }, attacks[1]]), /Invalid/);
  assert.throws(() => createWeaponRuntimeRegistry(catalog, [{ ...attacks[0], slot: 'signature' }, attacks[1]]), /Missing standard/);
});

test('four standard weapon hardpoints plus one signature are allowed, six guns are not', () => {
  const extra = createContentCatalog(
    [{ id: 'hero', name: '守军', starterWeaponId: 'gun-1', passiveId: null, signatureWeaponId: 'special' }],
    [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `gun-${i + 1}`, name: '机炮', slot: 'standard' as const, tags: ['kinetic' as const], driverId: `gun-${i + 1}`,
      })),
      { id: 'special', name: '专武', slot: 'signature', tags: ['deploy'], driverId: 'special' },
    ],
  );
  const drivers = createWeaponRuntimeRegistry(extra, [
    ...Array.from({ length: 5 }, (_, i) => ({
      driverId: `gun-${i + 1}`, slot: 'standard' as const, baseRange: 100, baseIntervalMs: 500,
      attack: () => {},
    })),
    { driverId: 'special', slot: 'signature', baseRange: 1, baseIntervalMs: 1000, attack: () => {} },
  ]);
  assertWeaponSlots(['gun-1', 'gun-2', 'gun-3', 'gun-4', 'special'], drivers);
  assert.throws(() => assertWeaponSlots(['gun-1', 'gun-2', 'gun-3', 'gun-4', 'gun-5'], drivers), /slot limit/);
  assert.throws(() => assertWeaponSlots(['gun-1', 'gun-1'], drivers), /equipped twice/);
  assert.throws(() => assertWeaponSlots(['gun-1', 'missing'], drivers), /no runtime/);
});
