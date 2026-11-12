/**
 * Browser smoke for ACTUAL Cocos Creator Web Mobile output, not the Vite canvas harness.
 * Run in GitHub Actions after the real Creator artifact is deployed.
 * Fails if the scene did not initialize or if real input does not move the player.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const url = process.env.COCOS_SMOKE_URL ?? 'https://kk518.top/swarm/cocos-preview/creator/';
const expectedCommit = process.env.PREVIEW_REVISION ?? '';
const output = path.resolve('dist/cocos-browser-smoke');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
});
let failed = false;
const messages = [];
const page = await browser.newPage({
  viewport: { width: 450, height: 850 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
page.on('console', (message) => {
  if (message.type() === 'error') messages.push('CONSOLE ' + message.text());
});
page.on('pageerror', error => messages.push('PAGE ERROR ' + error.message));
page.on('requestfailed', request => messages.push('REQUEST ' + request.url() + ' ' + request.failure()?.errorText));
try {
  const markerResponse = await page.request.get(url + 'preview-version.json', { timeout: 30000 });
  if (!markerResponse.ok()) throw new Error('Version marker HTTP ' + markerResponse.status());
  const marker = await markerResponse.json();
  if (marker.kind !== 'cocos-creator-3.8.8-web-mobile' || marker.commit !== expectedCommit) {
    throw new Error('Expected actual Cocos Creator build at commit ' + expectedCommit + ', got ' + JSON.stringify(marker));
  }
  const navigation = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (!navigation?.ok()) throw new Error('Game page HTTP ' + navigation?.status());
  // The scene's staging-only debug contract confirms actual component execution.
  await page.waitForFunction(
    () => typeof window.__swarmCocosDebug?.state === 'function',
    null, { timeout: 55000 },
  );
  const before = await page.evaluate(() => window.__swarmCocosDebug.state());
  if (!before.initialized || before.enemies < 1 || before.hp <= 0) {
    throw new Error('Cocos scene initialized but Core state invalid: ' + JSON.stringify(before));
  }
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: 15000 });
  const bounds = await canvas.boundingBox();
  if (!bounds || bounds.width < 150 || bounds.height < 200) {
    throw new Error('Cocos canvas is absent or unexpectedly small: ' + JSON.stringify(bounds));
  }
  await page.screenshot({ path: path.join(output, 'creator-before.png'), fullPage: true });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1050);
  await page.keyboard.up('ArrowRight');
  const after = await page.evaluate(() => window.__swarmCocosDebug.state());
  await page.screenshot({ path: path.join(output, 'creator-after.png'), fullPage: true });
  if (after.x <= before.x + 10) {
    throw new Error('Cocos keyboard input did not move the player: ' + JSON.stringify({before,after}));
  }
  if (messages.some(x => x.startsWith('PAGE ERROR '))) {
    throw new Error('Uncaught runtime errors: ' + messages.join('\n'));
  }
  console.log('SUCCESS: actual Cocos web scene rendered and player moved', {url, commit:expectedCommit, before, after});
} catch (error) {
  failed = true;
  console.error('COCOS BROWSER SMOKE FAILURE:', error);
  await page.screenshot({ path: path.join(output, 'creator-failure.png'), fullPage: true }).catch(() => {});
} finally {
  await fs.writeFile(path.join(output, 'browser-log.txt'), [
    'URL: ' + url,
    'REVISION: ' + expectedCommit,
    'PASS: ' + (!failed),
    ...messages,
  ].join('\n') + '\n');
  await browser.close();
}
if (failed) process.exitCode = 1;
