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
  assert.doesNotMatch(creator, /const decision = this\.world\.decision;[\s\S]*const decision = this\.world\.decision;/);
});
