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
