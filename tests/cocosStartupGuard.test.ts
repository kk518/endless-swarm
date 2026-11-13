import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Script } from 'node:vm';

test('Creator post-build guard injects parseable recovery UI without replacing engine bootstrap', () => {
  const dir=mkdtempSync(join(tmpdir(),'cocos-guard-'));
  try {
    const path=join(dir,'index.html');
    writeFileSync(path,'<!doctype html><html><head><title>Cocos</title></head><body><script src="./application.js"></script></body></html>');
    execFileSync(process.execPath,['scripts/inject-cocos-startup-guard.mjs',path]);
    const result=readFileSync(path,'utf8');
    assert.match(result,/id="swarm-startup-guard"/);
    assert.match(result,/游戏启动超时/);
    assert.match(result,/重新加载游戏/);
    assert.match(result,/WebGL:/);
    assert.match(result,/window\.__swarmCocosDebug/);
    assert.match(result,/setTimeout\(function\(\)/);
    assert.match(result,/45000/);
    assert.match(result,/src="\.\/application\.js"/);
    const match=result.match(/<script id="swarm-startup-guard">([\s\S]*?)<\/script>/);
    assert.ok(match,'guard exists as an isolated inline script');
    assert.doesNotThrow(()=>new Script(match[1]),'generated inline JavaScript parses');
    assert.throws(()=>execFileSync(process.execPath,
      ['scripts/inject-cocos-startup-guard.mjs',path],{stdio:'pipe'}));
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('real Creator build and Safari-family browser smoke include recovery diagnostics',()=>{
  const build=readFileSync('scripts/build-cocos-macos.sh','utf8');
  const workflow=readFileSync('.github/workflows/cocos-creator-web.yml','utf8');
  const smoke=readFileSync('scripts/smoke-cocos-web.mjs','utf8');
  assert.match(build,/inject-cocos-startup-guard\.mjs/);
  assert.match(workflow,/playwright install --with-deps chromium webkit/);
  assert.match(workflow,/COCOS_BROWSER: webkit/);
  assert.match(smoke,/webkit\.launch/);
  assert.match(smoke,/originalMainArt/);
});
