// The project's 404 page in a real browser, against the running preview of dist/ (npm run preview), which serves
// dist/404.html for unknown paths under /dexgo/ as GitHub Pages does.
// Run: npm run test:e2e   (BASE_URL defaults to http://127.0.0.1:4322, CHROME_PATH to /usr/bin/google-chrome).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const base = (process.env.BASE_URL ?? 'http://127.0.0.1:4322').replace(/\/$/, '');
const desktop = { viewport: { width: 1440, height: 1000 } };

let browser;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome' });
});
after(() => browser?.close());

const inContext = async (run) => {
  const context = await browser.newContext(desktop);
  try {
    await run(await context.newPage(), context);
  } finally {
    await context.close();
  }
};
const historyLength = (page) => page.evaluate(() => history.length);

test('a missing URL under /dexgo/ shows the standalone 404 from the first frame: no personal header, footer or icon', async () => {
  await inContext(async (page, context) => {
    await context.addInitScript(() => {
      requestAnimationFrame(() => {
        window.__firstFrame = {
          notFound: document.documentElement.getAttribute('data-not-found'),
          header: document.querySelector('header, nav') !== null,
          background: getComputedStyle(document.body).backgroundColor
        };
      });
    });
    for (const path of ['/dexgo/no-such-page/', '/dexgo/video/', '/dexgo/assets/missing.mp4']) {
      const response = await page.goto(`${base}${path}`);
      assert.equal(response?.status(), 404, `${path} answers 404`);
      await page.waitForFunction(() => window.__firstFrame !== undefined);
      assert.deepEqual(await page.evaluate(() => window.__firstFrame), { notFound: 'dexgo', header: false, background: 'rgb(255, 255, 255)' }, `${path} in its first frame`);
      assert.equal(await page.locator('footer').count(), 0, `${path}: no footer`);
      const links = await page.locator('main a').evaluateAll((anchors) => anchors.filter((a) => a.checkVisibility()).map((a) => a.getAttribute('href')));
      assert.deepEqual(links, ['/dexgo/'], `${path}: the one link leads to the project page`);
      const icons = await page.evaluate(() => [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((link) => link.getAttribute('href')));
      assert.deepEqual(icons, ['/dexgo/favicon.ico', '/dexgo/favicon.svg', '/dexgo/apple-touch-icon.png'], `${path}: the DexGO icons only`);
      assert.equal(await page.title(), 'Page not found | DexGO', `${path}: no personal site name in the title`);
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily.split(',')[0].trim()), '"Source Sans 3"');
      // Centred like the project page's column: heading, sentence and link share the viewport's axis.
      const centres = await page.evaluate(() =>
        ['h1', '.not-found > p.muted', '.not-found-links a'].map((selector) => {
          const range = document.createRange();
          range.selectNodeContents(document.querySelector(selector));
          const box = range.getBoundingClientRect();
          return box.left + box.width / 2 - innerWidth / 2;
        })
      );
      assert.ok(centres.every((offset) => Math.abs(offset) <= 1), `${path}: centred (offsets ${centres.map((c) => c.toFixed(1)).join(', ')})`);
      const underline = await page.locator('.not-found-links a').evaluate((link) => getComputedStyle(link).textDecorationColor);
      assert.equal(underline, 'rgba(0, 0, 0, 0)', `${path}: the link is not underlined at rest`);
    }
  });
});

test('a case variant of a DexGO page is replaced by the lower-case page, so Back skips the 404', async () => {
  await inContext(async (page, context) => {
    for (const [path, target] of [
      ['/dexgo/DEMO/', '/dexgo/demo/'],
      ['/dexgo/Figure/', '/dexgo/figure/'],
      ['/dexgo/Demo', '/dexgo/demo/'],
      ['/dexgo/INDEX.html#live-demo', '/dexgo/#live-demo'],
      ['/dexgo/Figure/index.html?from=test#top', '/dexgo/figure/?from=test#top']
    ]) {
      // A fresh tab per path: Chrome turns a same-URL navigation into a replacement, which would blur the count.
      const tab = await context.newPage();
      await tab.goto(`${base}/dexgo/figure/`);
      const entries = await historyLength(tab);
      await tab.goto(`${base}${path}`, { waitUntil: 'commit' });
      await tab.waitForURL((url) => url.pathname === new URL(target, base).pathname, { waitUntil: 'load' });
      const url = new URL(tab.url());
      assert.equal(url.pathname + url.search + url.hash, target, `${path} ends on ${target}`);
      assert.equal(await historyLength(tab), entries + 1, `${path}: the 404 entry was replaced, not added`);
      await tab.goBack();
      assert.equal(new URL(tab.url()).pathname, '/dexgo/figure/', `${path}: Back returns to the page before`);
      await tab.close();
    }
    // A path that is not one of the project's pages keeps the 404.
    const response = await page.goto(`${base}/dexgo/Video/`);
    assert.equal(response?.status(), 404);
    assert.equal(new URL(page.url()).pathname, '/dexgo/Video/');
  });
});
