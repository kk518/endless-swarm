import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path: string): string => readFileSync(path, 'utf8');

test('migration preview shares the Cocos PoC world source', () => {
  const source = read('clients/cocos-preview/src/main.ts');
  assert.match(source, /\.\.\/\.\.\/cocos\/assets\/scripts\/PocWorld\.ts/);
  assert.match(source, /new PocWorld\(/);
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
