import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const presenter=readFileSync('clients/cocos/assets/scripts/PocArtSprites.ts','utf8');
const battle=readFileSync('clients/cocos/assets/scripts/PocBattle.ts','utf8');
const preview=readFileSync('clients/cocos-preview/src/main.ts','utf8');
test('real Creator uses SpriteFrame from exported main source, not Phaser renderer',()=>{
 assert.match(presenter,/resources.load\('main-art\/'\+key\+'\/texture'/);
 assert.match(presenter,/new SpriteFrame\(\)/);
 assert.match(presenter,/frame.texture=texture/);
 assert.match(presenter,/Sprite.Type.TILED/);
 assert.match(presenter,/ENEMY_ART/);
 assert.match(presenter,/visible|buildWeaponRig/);
 assert.match(battle,/PocArtSprites/);
 assert.match(preview,/main-art\/.*png/);
});
test('rendering-only texture migration cannot modify run state or saved gameplay',()=>{
 assert.doesNotMatch(presenter,/registerKill|applyDamage|chooseCard|settleStoredRun/);
 assert.match(presenter,/this.frames.has\(key\)/);
 assert.match(battle,/this.art.ready/);
});

test('Creator sprite layering keeps enemy bodies behind the hero and guns in front',()=>{
 const ordered=['MainEnemyLayer','MainPickupLayer','MainPlayerLayer','MainWeaponLayer','MainProjectileLayer'];
 const offsets=ordered.map(name=>presenter.indexOf("this.layer('"+name+"')"));
 assert.ok(offsets.every(index=>index>=0),'all scene layers must exist');
 assert.deepEqual([...offsets].sort((a,b)=>a-b),offsets,'render layers are created back-to-front');
 assert.match(presenter,/this.create\(this.enemyLayer,'MainBug-'/);
 assert.match(presenter,/this.create\(this.playerLayer,'MainMarineSprite'\)/);
 assert.match(presenter,/this.create\(this.weaponLayer,'MainMount-'/);
 assert.match(presenter,/this.syncTransient\(this.supplies,s.supplies,'supply',30,30,10,this.pickupLayer\)/);
 assert.match(presenter,/this.syncTransient\(this.acid,s.acids,'acid',18,18,8,this.projectileLayer\)/);
 assert.match(presenter,/this.weaponLayer,this.projectileLayer\]\)layer.destroy\(\)/);
});

test('muzzle flashes use combat shot events and fall back to Graphics only while loading',()=>{
 assert.match(presenter,/this.syncMuzzleFlashes\(s.shots\)/);
 assert.match(presenter,/this.create\(this.projectileLayer,'MainMuzzleFlash'\)/);
 assert.match(presenter,/this.assign\(sprite,'muzzle-flash',size,size\*\.8\)/);
 assert.match(presenter,/sprite.node.angle=shot.angle\*180\/Math.PI/);
 assert.match(presenter,/shot.remainingMs\/95/);
 assert.match(presenter,/this.muzzleFlashes.length=0/);
 assert.match(battle,/if \(!this.art.ready\('muzzle-flash'\)\) for \(const shot of s.shots\)/);
 assert.doesNotMatch(presenter,/emitBullet|weaponDamage|registerKill|chooseDecision/);
});
