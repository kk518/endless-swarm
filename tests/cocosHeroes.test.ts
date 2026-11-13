import test from 'node:test';
import assert from 'node:assert/strict';
import { PocWorld, POC } from '../clients/cocos/assets/scripts/PocWorld.ts';
import {
  POC_CATALOG, POC_HERO_RUNTIME, POC_WEAPON_RUNTIME, resolvePocHero,
} from '../clients/cocos/assets/scripts/PocRoster.ts';
import { createWeaponRuntimeRegistry, assertWeaponSlots } from '../clients/cocos/assets/scripts/m6/weaponRuntime.ts';

test('M6 catalog has exactly two implemented migration heroes and signature is separate', () => {
  assert.equal(POC_CATALOG.heroes.size, 2);
  assert.equal(POC_HERO_RUNTIME.size, 2);
  const marine = resolvePocHero('marine');
  assert.deepEqual(marine.loadout.standardWeaponIds, ['rifle']);
  assert.equal(marine.loadout.signatureWeaponId, null);
  const kane = resolvePocHero('kane');
  assert.deepEqual(kane.loadout.standardWeaponIds, ['rifle']);
  assert.equal(kane.loadout.signatureWeaponId, 'kane-rail');
  assert.equal(POC_CATALOG.weapons.get('kane-rail')?.slot, 'signature');
  assert.equal(POC_WEAPON_RUNTIME.get('kane-rail')?.driverId, 'rail');
});
test('no hero or weapon becomes playable without a real driver', () => {
  assert.throws(() => resolvePocHero('nonexistent' as 'marine'), /Unregistered/);
  assert.throws(() => assertWeaponSlots(['rifle','rifle'], POC_WEAPON_RUNTIME), /twice/);
  assert.throws(
    () => createWeaponRuntimeRegistry(POC_CATALOG, []),
    /Missing standard attack driver/,
  );
});
test('Kane signature rail fires while MOVING, unlike stationary-only attack shortcuts', () => {
  const marine = new PocWorld(450,800,518,'steel-ruins',{},'marine');
  const kane = new PocWorld(450,800,518,'steel-ruins',{},'kane');
  marine.advance(POC.fixedStepMs, {x:0.35,y:0});
  kane.advance(POC.fixedStepMs, {x:0.35,y:0});
  assert.equal(marine.state.player.deployed, false);
  assert.equal(kane.state.player.deployed, false);
  assert.equal(kane.state.heroId, 'kane');
  assert.equal(marine.state.lightning.some(s=>s.kind==='rail'),false);
  assert.equal(kane.state.lightning.some(s=>s.kind==='rail'),true);
  assert.ok(kane.state.kills>=1, 'rail is an actual damaging driver, not metadata');
});
test('hero and signature runtime reset without leaking old attack state', () => {
  const kane = new PocWorld(450,800,518,'steel-ruins',{},'kane');
  kane.advance(POC.fixedStepMs,{x:0,y:0});
  assert.ok(kane.state.lightning.length>0);
  kane.reset();
  assert.deepEqual(kane.state.lightning,[]);
  assert.equal(kane.state.heroId,'kane');
  assert.equal(kane.state.kills,0);
  assert.equal(kane.state.enemies.length,1);
});
test('Kane determinism is preserved under the shared M6 combat stream', () => {
  const a=new PocWorld(450,800,518,'infested-nest',{},'kane');
  const b=new PocWorld(450,800,518,'infested-nest',{},'kane');
  for(let i=0;i<270;i++){
    a.advance(POC.fixedStepMs,{x:.4,y:0});
    b.advance(POC.fixedStepMs,{x:.4,y:0});
  }
  assert.deepEqual(a.state,b.state);
});

test('all four historical M5 standard weapons have canonical catalog entries and executable drivers', () => {
  for (const id of ['rifle','scatter','arc','flame']) {
    const definition=POC_CATALOG.weapons.get(id);
    const runtime=POC_WEAPON_RUNTIME.get(id);
    assert.ok(definition,'missing historical weapon '+id);
    assert.equal(definition.slot,'standard');
    assert.ok(runtime,'a card must never install a metadata-only weapon');
    assert.equal(runtime.slot,'standard');
    assert.equal(runtime.driverId,definition.driverId);
  }
  assert.equal(POC_CATALOG.weapons.size,5, 'four standard weapons + Kane signature');
  assert.equal(POC_WEAPON_RUNTIME.get('scatter')?.baseIntervalMs,850);
  assert.equal(POC_WEAPON_RUNTIME.get('flame')?.baseIntervalMs,170);
});
