import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeaponRig, weaponMuzzle } from '../clients/cocos/assets/scripts/PocWeaponRig.ts';
import { WEAPON_MOUNTS, WEAPON_LIGHT, visibleLoadout, visualPowerTier } from
  '../clients/cocos/assets/scripts/m6/weaponVisual.ts';
import { PocWorld, POC } from '../clients/cocos/assets/scripts/PocWorld.ts';
import type { WeaponId } from '../clients/cocos/assets/scripts/m6/progression.ts';

const angles: Record<WeaponId,number>={rifle:0,scatter:0,arc:0,flame:0};
const levels: Record<WeaponId,number>={rifle:3,scatter:4,arc:2,flame:5};
const evolution: Record<WeaponId,boolean>={rifle:false,scatter:true,arc:false,flame:true};

test('M4.1 rig only renders physically installed ordinary weapons, never metadata-only gear', () => {
  const input={player:{x:10,y:20},weapons:['rifle','scatter','flame'] as WeaponId[],
    deployed:false,weaponAim:angles,weaponLevels:levels,evolved:evolution,
    visualTier:2,timeMs:1000};
  const mounts=buildWeaponRig(input);
  assert.deepEqual(mounts.map(v=>v.id),['rifle','scatter','flame']);
  assert.deepEqual(mounts.map(v=>v.level),[3,4,5]);
  assert.equal(mounts[1].evolved,true);
  assert.equal(mounts[2].tint,WEAPON_LIGHT.flame);
  assert.equal(mounts.length,visibleLoadout(input.weapons).length);
  assert.equal(visualPowerTier({selected:['pierce','radius']}),2);
});

test('M4.1 gun muzzles use original main hardpoint offsets and world Y-up conversion', () => {
  for(const id of ['scatter','arc','flame'] as const) {
    const offset=WEAPON_MOUNTS[id];
    const muzzle=weaponMuzzle(0,0,id,0);
    assert.ok(Math.abs(muzzle.x-(offset.x+offset.muzzle))<1e-9);
    assert.equal(muzzle.y,-offset.y);
  }
  assert.deepEqual(weaponMuzzle(0,0,'rifle',0),{x:48,y:18});
  assert.deepEqual(weaponMuzzle(0,0,'rifle',Math.PI/2).x,5+43*Math.cos(Math.PI/2));
});

test('M4.1 no ghost mounts after reset, only authentic firing events', () => {
  const world=new PocWorld(600,1000,518);
  assert.deepEqual(world.state.weapons,['rifle']);
  const rig=()=>buildWeaponRig({player:world.state.player,deployed:world.state.player.deployed,
    weapons:world.state.weapons,weaponAim:world.state.weaponAim,
    weaponLevels:world.state.weaponLevels,evolved:world.state.evolved,
    visualTier:world.state.visualTier,timeMs:world.state.elapsedMs});
  assert.deepEqual(rig().map(v=>v.id),['rifle']);
  world.advance(POC.fixedStepMs,{x:0,y:0});
  assert.ok(world.state.shots.some(v=>v.source==='rifle'));
  const shot=world.state.shots.find(v=>v.source==='rifle')!;
  assert.ok(Math.abs(shot.x-weaponMuzzle(0,0,'rifle',world.state.weaponAim.rifle).x)<1e-6);
  for(let i=0;i<20;i++)world.advance(POC.fixedStepMs,{x:0,y:0});
  assert.equal(world.state.shots.includes(shot),false,
    'the original 95ms flash expires even when auto-fire produces newer flashes');
  world.reset();
  assert.equal(world.state.visualTier,0);
  assert.deepEqual(world.state.shots,[]);
  assert.deepEqual(rig().map(v=>v.id),['rifle']);
});

test('M4.1 identical seeds produce identical physical shot events and rig levels', () => {
  const a=new PocWorld(600,1000,819),b=new PocWorld(600,1000,819);
  for(let i=0;i<35;i++){
    a.advance(POC.fixedStepMs,{x:.3,y:.1});
    b.advance(POC.fixedStepMs,{x:.3,y:.1});
  }
  assert.deepEqual(a.state.shots,b.state.shots);
  assert.deepEqual(a.state.weaponAim,b.state.weaponAim);
});
