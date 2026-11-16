import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileViewport, worldToScreen, screenToWorld } from
  '../clients/cocos/assets/scripts/PocViewport.ts';
import { PocWorld, POC } from '../clients/cocos/assets/scripts/PocWorld.ts';

test('M5.3 450x800 UI shows 600-unit-wide battle, not a stretched 450-unit map', () => {
  const v = mobileViewport(450, 800);
  assert.equal(v.worldWidth, 600);
  assert.ok(Math.abs(v.worldHeight - 1066.6666667) < 0.001);
  assert.equal(v.worldScale, 0.75);
  assert.equal(v.hudScale, 1);
  assert.deepEqual(worldToScreen({ x: 0, y: 0 }, v), { x: 225, y: 400 });
  assert.deepEqual(worldToScreen({ x: 300, y: 0 }, v), { x: 450, y: 400 });
  assert.deepEqual(worldToScreen({ x: -300, y: 0 }, v), { x: 0, y: 400 });
  const world = new PocWorld(v.worldWidth, v.worldHeight, 518);
  assert.equal(world.width, 600);
  assert.equal(world.height, v.worldHeight);
});

test('M5.3 touch and safe-node UI coordinates are independent of the battle zoom', () => {
  for (const [w, h] of [[375, 812], [450, 800], [600, 900]] as const) {
    const v = mobileViewport(w, h);
    assert.equal(v.worldWidth, 600);
    assert.equal(v.worldScale, w / 600);
    assert.equal(v.hudScale, w / 450);
    assert.equal(v.worldHeight * v.worldScale, h);
    for (const point of [{x: -180,y: -230}, {x: 0,y: 0}, {x: 220,y: 300}]) {
      const screen = worldToScreen(point,v);
      const roundtrip = screenToWorld(screen,v);
      assert.ok(Math.abs(roundtrip.x - point.x) < 1e-10);
      assert.ok(Math.abs(roundtrip.y - point.y) < 1e-10);
    }
    // Bottom 20% touch capture stays an on-screen UI affordance.
    assert.ok(h * 0.8 < h);
    assert.equal(worldToScreen({x:0,y:0},v).y,h/2);
  }
});

test('M5.3 600-unit scene still spawns predictable visible-entry warnings', () => {
  const v=mobileViewport(450,800);
  const a=new PocWorld(v.worldWidth,v.worldHeight,518);
  const b=new PocWorld(v.worldWidth,v.worldHeight,518);
  for(let i=0;i<55;i++){
    a.advance(POC.fixedStepMs,{x:0,y:0});
    b.advance(POC.fixedStepMs,{x:0,y:0});
  }
  assert.deepEqual(a.state,b.state);
  assert.ok(a.state.arrivals.length>0);
  for(const entrance of a.state.arrivals){
    assert.ok(Math.abs(entrance.x)<=300);
    assert.ok(Math.abs(entrance.y)<=v.worldHeight/2);
  }
});

test('viewport rejects zero, negative and invalid inputs', () => {
  for(const args of [[0,800],[-100,800],[450,0],[NaN,800],[450,Infinity]]){
    assert.throws(()=>mobileViewport(args[0],args[1]),/Invalid mobile viewport/);
  }
});
