// The live demo under the project's base, in a real browser against the running preview of dist/ (npm run preview):
// inside the page (Start on the stage; the iframe loads /dexgo/demo/index.html?seed=47) and opened alone at
// /dexgo/demo/. The demo reports its state on its <body> (app/main.js: data-state 'playing', data-hand, data-goals =
// goals completed). Every request must succeed (no HTTP >= 400, no failed request), except a page clip (.mp4) whose
// load Chrome aborts while the demo runs (the page pauses its clips then); no console or page errors.
// WebGL runs in software in headless Chrome; a goal takes a few seconds, so the waits are generous.
// Run: npm run test:e2e   (BASE_URL defaults to http://127.0.0.1:4322, CHROME_PATH to /usr/bin/google-chrome).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const base = (process.env.BASE_URL ?? 'http://127.0.0.1:4322').replace(/\/$/, '');

let browser;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome' });
});
after(() => browser?.close());

/** Records every problem of `page` (and its frames) into the returned list. */
const watch = (page) => {
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 200)}`));
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url()}`));
  page.on('requestfailed', (r) => {
    const error = r.failure()?.errorText;
    if (!(error === 'net::ERR_ABORTED' && /\.mp4(\?|$)/.test(r.url()))) problems.push(`failed ${r.url()} (${error})`);
  });
  return problems;
};

const goals = (frame) => frame.evaluate(() => Number(document.body.dataset.goals ?? 0));
/** Waits until the demo plays `hand` and has completed `count` more goals than now. */
const reachGoals = async (frame, hand, count) => {
  await frame.waitForFunction((h) => document.body.dataset.state === 'playing' && document.body.dataset.hand === h, hand, { timeout: 180000 });
  const from = await goals(frame);
  await frame.waitForFunction(([n]) => Number(document.body.dataset.goals ?? 0) >= n, [from + count], { timeout: 240000, polling: 500 });
};
/** Switches the hand in the demo's setup menu. */
const chooseHand = async (frame, hand) => {
  await frame.click('#setup');
  await frame.click(`[data-hand="${hand}"]`);
  await frame.waitForFunction((h) => document.body.dataset.hand === h, hand, { timeout: 180000 });
};

test('in the page: Start runs the demo; MANO and Sharpa each complete goals; nothing fails to load', { timeout: 900000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const problems = watch(page);
  try {
    await page.goto(`${base}/dexgo/#live-demo`, { waitUntil: 'load' });
    await page.locator('[data-demo-start]').click();
    const iframe = await page.waitForSelector('#live-demo iframe', { timeout: 30000 });
    assert.equal(new URL(await iframe.getAttribute('src'), base).pathname, '/dexgo/demo/index.html');
    const frame = await iframe.contentFrame();
    await reachGoals(frame, 'mano', 2);
    await chooseHand(frame, 'sharpa');
    await reachGoals(frame, 'sharpa', 1);
    // The demo's font is the page's file under the base (one download, shared with the page).
    const fonts = await frame.evaluate(() => performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname).filter((p) => p.endsWith('.woff2')));
    assert.ok(fonts.every((p) => p === '/dexgo/fonts/source-sans-3/source-sans-3-latin-var.woff2'), fonts.join(', '));
    // "Open in a new tab" names the demo's own address, with the hand now shown.
    assert.equal(await page.getAttribute('[data-demo-newtab]', 'href'), '/dexgo/demo/?hand=sharpa');
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});

test('alone at /dexgo/demo/: the demo starts and completes goals; nothing fails to load', { timeout: 600000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const problems = watch(page);
  try {
    await page.goto(`${base}/dexgo/demo/`, { waitUntil: 'load' });
    await reachGoals(page.mainFrame(), 'mano', 1);
    const icons = await page.evaluate(() => [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((l) => new URL(l.href).pathname));
    assert.deepEqual(icons, ['/dexgo/favicon.ico', '/dexgo/favicon.svg', '/dexgo/apple-touch-icon.png']);
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});
