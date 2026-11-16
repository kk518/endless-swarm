import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path: string): string => readFileSync(path, 'utf8');

test('migration preview shares the Cocos PoC world source', () => {
  const source = read('clients/cocos-preview/src/main.ts');
  assert.match(source, /\.\.\/\.\.\/cocos\/assets\/scripts\/PocWorld\.ts/);
  assert.match(source, /new PreviewOps\(restart\)/);
  assert.match(source, /ops\.createWorld\(\)/);
  assert.match(read('clients/cocos-preview/src/m6Ui.ts'), /new PocWorld\(/);
  assert.doesNotMatch(source, /from ['"]phaser['"]|from ['"]cc['"]/);
});
test('migration preview has independent HTML and Vite build root', () => {
  assert.ok(existsSync('clients/cocos-preview/index.html'));
  const config = read('clients/cocos-preview/vite.config.ts');
  assert.match(config, /base:\s*['"]\.\/['"]/);
  assert.match(config, /dist\/cocos-preview/);
  assert.match(read('clients/cocos-preview/index.html'), /尚不是 Cocos Creator/);
});
test('migration deployment only targets child directory', () => {
  const deploy = read('.github/workflows/cocos-preview.yml');
  assert.match(deploy, /refs\/heads\/feature\/cocos-wechat-migration-poc/);
  assert.match(deploy, /\/var\/www\/endless-swarm\/cocos-preview\//);
});

test('safe encounter decisions have real selectable UI in both preview and Creator', () => {
  const html = read('clients/cocos-preview/index.html');
  const preview = read('clients/cocos-preview/src/main.ts');
  const creator = read('clients/cocos/assets/scripts/PocBattle.ts');
  assert.match(html, /id="decision-overlay"/);
  assert.match(html, /id="decision-options"/);
  assert.match(preview, /world\.chooseDecision\(index\)/);
  assert.match(preview, /decisionOptions\.replaceChildren/);
  assert.match(preview, /decisionOverlay\.hidden = !decision/);
  assert.match(creator, /this\.world\.chooseDecision\(index\)/);
  assert.match(creator, /DecisionCardLabel/);
  // One in touch handling and one in paint: no duplicate binding inside paint.
  assert.equal((creator.match(/const decision = this\.world\.decision;/g) ?? []).length, 2);
});

test('both migration clients expose the genuine 5-wave/9-stage campaign choice', () => {
  const html = read('clients/cocos-preview/index.html');
  const ops = read('clients/cocos-preview/src/m6Ui.ts');
  const creator = read('clients/cocos/assets/scripts/PocBattle.ts');
  assert.match(html, /id="mode-expedition"/);
  assert.match(ops, /this\.selectMode\('expedition'/);
  assert.match(ops, /this\.heroId, this\.mode/);
  assert.match(creator, /private switchMode\(\)/);
  assert.match(creator, /KeyCode\.KEY_M/);
});

test('M2/M3 danger circles, elite auras and supplies are rendered by both clients', () => {
  const browser = read('clients/cocos-preview/src/main.ts');
  const creator = read('clients/cocos/assets/scripts/PocBattle.ts');
  const world = read('clients/cocos/assets/scripts/PocWorld.ts');
  assert.match(world, /canSpawnElite\(/);
  assert.match(world, /SUPPLY_PERIOD_MS/);
  assert.match(world, /withinPickupReach\(/);
  assert.match(browser, /enemy\.windupMs/);
  assert.match(browser, /s\.supplies/);
  assert.match(browser, /s\.pulses/);
  assert.match(creator, /enemy\.windupMs/);
  assert.match(creator, /s\.supplies/);
  assert.match(creator, /s\.pulses/);
});

test('M5.3 arrivals, mobile targeting and spit/leap visuals render in both actual clients', () => {
  const preview = read('clients/cocos-preview/src/main.ts');
  const creator = read('clients/cocos/assets/scripts/PocBattle.ts');
  const world = read('clients/cocos/assets/scripts/PocWorld.ts');
  assert.match(world, /visibleEdgeSpawn\(/);
  assert.match(world, /insideReadableView\(/);
  assert.match(world, /ARRIVAL_WARNING_MS/);
  assert.match(world, /private spitAcid\(/);
  assert.match(preview, /for \(const arrival of s\.arrivals\)/);
  assert.match(preview, /for \(const acid of s\.acids\)/);
  assert.match(creator, /for \(const arrival of s\.arrivals\)/);
  assert.match(creator, /for \(const acid of s\.acids\)/);
});

test('M5.3 viewport keeps 600-unit combat separate from 450-unit touch/HUD UI', () => {
  const viewport = read('clients/cocos/assets/scripts/PocViewport.ts');
  const creator = read('clients/cocos/assets/scripts/PocBattle.ts');
  const preview = read('clients/cocos-preview/src/main.ts');
  const ops = read('clients/cocos-preview/src/m6Ui.ts');
  assert.match(viewport, /MOBILE_WORLD_WIDTH/);
  assert.match(viewport, /HUD_DESIGN_WIDTH/);
  assert.match(creator, /BattleWorldGraphics/);
  assert.match(creator, /BattleUIOverlay/);
  assert.match(creator, /this\.viewport\.worldWidth, this\.viewport\.worldHeight/);
  assert.match(preview, /battleViewport\.worldWidth/);
  assert.match(preview, /battleViewport\.uiWidth/);
  assert.match(ops, /viewport\.worldWidth, viewport\.worldHeight/);
});

test('M5.2 real safe-node training controls exist in both clients', () => {
  const html = read('clients/cocos-preview/index.html');
  const preview = read('clients/cocos-preview/src/main.ts');
  const creator = read('clients/cocos/assets/scripts/PocBattle.ts');
  const world = read('clients/cocos/assets/scripts/PocWorld.ts');
  assert.match(html, /id="training-weapons"/);
  assert.match(html, /id="training-focus"/);
  assert.match(preview, /trainingWeapons\.replaceChildren/);
  assert.match(preview, /trainingFocus\.replaceChildren/);
  assert.match(preview, /world\.setTraining\(/);
  assert.match(creator, /SafeTrainingChoice/);
  assert.match(creator, /this\.world\.setTraining\(/);
  assert.match(world, /get decision\(\)/);
  assert.match(world, /setTraining\(weapon: WeaponId, focus: TrainingFocus\)/);
});

test('M6 safe snapshots are validated, isolated and resumable in both runtime adapters', () => {
  const ops = read('clients/cocos-preview/src/m6Ui.ts');
  const creator = read('clients/cocos/assets/scripts/PocBattle.ts');
  const world = read('clients/cocos/assets/scripts/PocWorld.ts');
  const html = read('clients/cocos-preview/index.html');
  assert.match(html, /id="resume-expedition"/);
  assert.match(ops, /cocos-preview-m6:/);
  assert.match(ops, /writeRunSafeSave\(storage, save\)/);
  assert.match(ops, /PocWorld\.fromSafeSnapshot/);
  assert.match(ops, /clearRunSafeSave\(storage\)/);
  assert.match(creator, /cocos-creator-m6:/);
  assert.match(creator, /writeRunSafeSave\(creatorSafeStorage, save\)/);
  assert.match(creator, /private resumeSafeNode\(\)/);
  assert.match(world, /static fromSafeSnapshot\(/);
});


test('M4.1 actual equipped rig, evolution glow and shot events render in both clients', () => {
  const rig = read('clients/cocos/assets/scripts/PocWeaponRig.ts');
  const world = read('clients/cocos/assets/scripts/PocWorld.ts');
  const browser = read('clients/cocos-preview/src/main.ts');
  const creator = read('clients/cocos/assets/scripts/PocBattle.ts');
  assert.match(rig, /WEAPON_MOUNTS/);
  assert.match(rig, /visibleLoadout/);
  assert.match(world, /visualPowerTier\(run\.build\)/);
  assert.match(world, /this\.emitShotFlash\(id, angle\)/);
  assert.match(world, /weaponMuzzle\(player\.x, player\.y, source, angle\)/);
  assert.match(browser, /buildWeaponRig\(/);
  assert.match(creator, /buildWeaponRig\(/);
  assert.match(browser, /for \(const shot of s\.shots\)/);
  assert.match(creator, /for \(const shot of s\.shots\)/);
});
