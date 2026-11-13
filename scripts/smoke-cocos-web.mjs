/**
 * Browser smoke for ACTUAL Cocos Creator Web Mobile output, not the Vite canvas harness.
 * Run in GitHub Actions after the real Creator artifact is deployed.
 * Fails if the scene did not initialize or if real input does not move the player.
 */
import { chromium, webkit } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const url = process.env.COCOS_SMOKE_URL ?? 'https://kk518.top/swarm/cocos-preview/creator/';
const expectedCommit = process.env.PREVIEW_REVISION ?? '';
const output = path.resolve('dist/cocos-browser-smoke');
await fs.mkdir(output, { recursive: true });
const engine = process.env.COCOS_BROWSER ?? 'chromium';
if (!['chromium', 'webkit'].includes(engine)) throw Error('Unsupported browser ' + engine);
const browser = engine === 'webkit'
  ? await webkit.launch({ headless: true })
  : await chromium.launch({ headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
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
  // Do not accept a green smoke test if Creator silently falls back to
  // primitive Graphics because it never imported the generated main PNGs.
  try {
    await page.waitForFunction(() => {
      const art = window.__swarmCocosDebug?.state?.().originalMainArt;
      return art?.marine && art?.rifle && art?.crawler && art?.dust;
    }, null, { timeout: 20000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => window.__swarmCocosDebug?.state?.());
    throw new Error('Original main art did not load: ' + JSON.stringify({
      diagnostic, messages, originalError: String(error),
    }));
  }
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
  await page.screenshot({ path: path.join(output, engine + '-creator-before.png'), fullPage: true });
  if (engine === 'webkit') {
    // Linux WebKit provides a Safari-family JS/WebGL startup check. CDP touch
    // injection is Chromium-specific, so mobile movement remains tested there.
    await page.waitForTimeout(1200);
    if (messages.some(x => x.startsWith('PAGE ERROR ')))
      throw new Error('WebKit runtime errors: ' + messages.join('\\n'));
    console.log('SUCCESS: WebKit Cocos scene and original art initialized', { url, expectedCommit });
  } else {
  // Mini-game controls are primarily touch, NOT keyboard. Use raw Chrome
  // touch events on the actual rendered canvas in a mobile viewport.
  const session = await page.context().newCDPSession(page);
  const x = bounds.x + bounds.width * .30;
  const y = bounds.y + bounds.height * .80;
  const point = (tx, ty) => [{ x: tx, y: ty, id: 1, radiusX: 5, radiusY: 5, force: 1 }];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(x,y) });
  await page.waitForTimeout(100);
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x+105,y) });
  await page.waitForTimeout(1080);
  const during = await page.evaluate(() => window.__swarmCocosDebug.state());
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => window.__swarmCocosDebug.state());
  await page.screenshot({ path: path.join(output, 'creator-after.png'), fullPage: true });
  if (during.x <= before.x + 10) {
    throw new Error('Cocos mobile-touch movement failed: ' + JSON.stringify({before,during,after,bounds}));
  }
  if (after.input?.touchActive) {
    throw new Error('Cocos touch stayed stuck after release: ' + JSON.stringify(after));
  }
  if (messages.some(x => x.startsWith('PAGE ERROR '))) {
    throw new Error('Uncaught runtime errors: ' + messages.join('\n'));
  }
  console.log('SUCCESS: actual Cocos web scene rendered and responded to mobile touch', {url, commit:expectedCommit, before, during, after});
  }
} catch (error) {
  failed = true;
  console.error('COCOS BROWSER SMOKE FAILURE:', error);
  await page.screenshot({ path: path.join(output, engine + '-creator-failure.png'), fullPage: true }).catch(() => {});
} finally {
  await fs.writeFile(path.join(output, 'browser-log.txt'), [
    'URL: ' + url,
    'REVISION: ' + expectedCommit,
    'BROWSER: ' + engine,
    'PASS: ' + (!failed),
    ...messages,
  ].join('\n') + '\n');
  await browser.close();
}
if (failed) process.exitCode = 1;
