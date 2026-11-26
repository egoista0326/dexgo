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
/** Switches the hand with the demo's Hand control (always shown, no menu to open). */
const chooseHand = async (frame, hand) => {
  await frame.click(`#hands [data-hand="${hand}"]`);
  await frame.waitForFunction((h) => document.body.dataset.hand === h, hand, { timeout: 180000 });
};

test('in the page: the demo starts on its own with Sharpa; Sharpa and MANO each complete goals; nothing fails to load', { timeout: 900000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const problems = watch(page);
  try {
    await page.goto(`${base}/dexgo/#live-demo`, { waitUntil: 'load' });
    const iframe = await page.waitForSelector('#live-demo iframe', { timeout: 30000 });
    assert.equal(new URL(await iframe.getAttribute('src'), base).pathname, '/dexgo/demo/index.html');
    const frame = await iframe.contentFrame();
    await reachGoals(frame, 'sharpa', 2);
    await chooseHand(frame, 'mano');
    await reachGoals(frame, 'mano', 1);
    // The demo's font is the page's file under the base (one download, shared with the page).
    const fonts = await frame.evaluate(() => performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname).filter((p) => p.endsWith('.woff2')));
    assert.ok(fonts.every((p) => p === '/dexgo/fonts/source-sans-3/source-sans-3-latin-var.woff2'), fonts.join(', '));
    // "Open in a new tab" names the demo's own address, with the hand now shown.
    assert.equal(await page.getAttribute('[data-demo-newtab]', 'href'), '/dexgo/demo/?hand=mano');
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
    await reachGoals(page.mainFrame(), 'sharpa', 1);
    const icons = await page.evaluate(() => [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((l) => new URL(l.href).pathname));
    assert.deepEqual(icons, ['/dexgo/favicon.ico', '/dexgo/favicon.svg', '/dexgo/apple-touch-icon.png']);
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});

// Owner 2026-11-26 (phones, Manual goal): while a goal set with Go runs, the demo asks for a taller stage
// ('dexgo-demo-grow'); its view then fills most of the screen under the sticky nav (>= 72 %), its status (Pause /
// Reset) stays on screen and the Manual goal panel waits below the screen's edge but for a peek strip (follow-up: its
// top, 30-70 px, with the whole Grasp type heading and no control cut by the edge); at the goal's end the stage is its
// 9:16 frame again, placed so Go is on screen. A short goal keeps the grown stage 2 s from its growth (follow-up),
// then the compact frame. Turned to landscape (667 x 375), it does not grow.
test('phone 390 x 844, Manual goal: the stage grows while a goal runs (a peek strip of the panel, at least 2 s) and is the compact frame again at its end', { timeout: 900000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const problems = watch(page);
  try {
    await page.goto(`${base}/dexgo/#live-demo`, { waitUntil: 'load' });
    const iframe = await page.waitForSelector('#live-demo iframe', { timeout: 30000 });
    // the frame placed 8 px under the nav (the reader's scroll; an off-screen demo pauses itself)
    const navBottom = () => page.evaluate(() => document.querySelector('.dx-localnav').getBoundingClientRect().bottom);
    await page.evaluate(() => {
      const top = document.querySelector('#live-demo iframe').getBoundingClientRect().top;
      window.scrollBy(0, top - (document.querySelector('.dx-localnav').getBoundingClientRect().bottom + 8));
    });
    const frame = await iframe.contentFrame();
    await frame.waitForFunction(() => document.querySelector('[data-mode="editor"]')?.disabled === false && document.body.dataset.state === 'playing', null, { timeout: 240000 });
    await frame.click('[data-mode="editor"]');
    await frame.waitForFunction(() => !document.getElementById('ed-roll').disabled && document.getElementById('ed-roll-out').textContent !== '', null, { timeout: 240000 });
    const compact = (await iframe.boundingBox()).height;
    await frame.evaluate(() => {
      const el = document.getElementById('ed-x');
      el.value = '150';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await frame.waitForFunction(() => !document.getElementById('ed-go').disabled, null, { timeout: 60000 });
    await frame.click('#ed-go');
    await frame.waitForFunction(() => document.body.dataset.run !== undefined, null, { timeout: 60000 });
    // Pause at once: the goal still runs (the view stays grown) however slow the runner is; then the height's ease
    // (280 ms) and the camera settle. A click in the frame's script, so nothing scrolls the page.
    await frame.evaluate(() => document.getElementById('play').click());
    await page.waitForTimeout(1000);
    assert.ok(await frame.evaluate(() => document.body.dataset.run !== undefined), 'the goal ended before it was measured');
    const grown = await iframe.boundingBox();
    const visible = 844 - (await navBottom());
    const inFrame = await frame.evaluate(() => ({ view: document.getElementById('view').getBoundingClientRect().height,
      status: document.querySelector('.status').getBoundingClientRect().bottom, panel: document.getElementById('editor').getBoundingClientRect().top,
      head: document.querySelector('#editor .ed-head').getBoundingClientRect().bottom,
      rows: [...document.querySelectorAll('#editor .ed-type, #editor .ed-row:not(.ed-grasp)')].map((el) => [el.getBoundingClientRect().top, el.getBoundingClientRect().bottom]) }));
    assert.ok(grown.height > compact + 300, `stage ${compact} -> ${grown.height} px`);
    assert.ok(inFrame.view >= 0.72 * visible, `view ${inFrame.view} px of ${visible} px under the nav`);
    assert.ok(grown.y + inFrame.status <= 844 + 0.5, `status bottom at ${grown.y + inFrame.status} px`);
    // the peek strip: the panel's top on screen, its first heading whole, no grasp row or slider row cut by the edge
    const strip = 844 - (grown.y + inFrame.panel);
    assert.ok(strip >= 30 && strip <= 70, `peek strip ${strip} px`);
    assert.ok(grown.y + inFrame.head <= 844, `Grasp type heading bottom at ${grown.y + inFrame.head} px`);
    const cut = inFrame.rows.filter(([t, b]) => grown.y + t < 844 - 0.5 && grown.y + b > 844 + 0.5);
    assert.deepEqual(cut, [], 'a panel row is cut by the screen edge');
    // play on to the goal's end (reached, not reached or dropped): the compact frame again, Go on screen
    await frame.evaluate(() => document.getElementById('play').click());
    await frame.waitForFunction(() => document.body.dataset.run === undefined, null, { timeout: 300000, polling: 250 });
    await page.waitForTimeout(800);
    const back = await iframe.boundingBox();
    const go = await frame.evaluate(() => document.getElementById('ed-go').getBoundingClientRect().bottom);
    assert.ok(Math.abs(back.height - compact) < 1, `stage ${back.height} px, compact ${compact} px`);
    assert.ok(back.y + go <= 844 && back.y >= (await navBottom()), `Go bottom at ${back.y + go} px, frame top ${back.y} px`);
    // a short goal (Right +20 mm, reached in about 0.5 s in software WebGL): the stage stays grown until 2 s after its
    // growth (the panel's controls unlock at the goal's end meanwhile), then the compact frame with Go on screen
    await frame.waitForFunction(() => !document.getElementById('ed-roll').disabled && document.getElementById('ed-roll-out').textContent !== '', null, { timeout: 240000 });
    await frame.evaluate(() => {
      const el = document.getElementById('ed-x');
      el.value = '20';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await frame.waitForFunction(() => !document.getElementById('ed-go').disabled, null, { timeout: 60000 });
    await frame.evaluate(() => {
      const roll = document.getElementById('ed-roll');
      window.__runAt = [];
      new MutationObserver(() => window.__runAt.push([document.body.dataset.run !== undefined, performance.now()]))
        .observe(document.body, { attributes: true, attributeFilter: ['data-run'] });
      // the goal's end as the reader sees it: the controls unlocked again after Go
      new MutationObserver(() => {
        if (!roll.disabled && window.__runAt.length && window.__endAt === undefined) window.__endAt = performance.now();
      }).observe(roll, { attributes: true, attributeFilter: ['disabled'] });
      document.getElementById('ed-go').click();
    });
    await frame.waitForFunction(() => window.__endAt !== undefined, null, { timeout: 60000, polling: 50 });
    const ended = await frame.evaluate(() => ({ ms: window.__endAt - window.__runAt[0][1], run: document.body.dataset.run !== undefined }));
    assert.ok(ended.ms < 1700, `the short goal took ${Math.round(ended.ms)} ms from the growth (the hold is not tested)`);
    assert.ok(ended.run, 'the stage shrank at the short goal\'s end');
    await page.waitForTimeout(Math.max(0, 1500 - ended.ms));
    const held = await iframe.boundingBox();
    assert.ok(held.height > compact + 300, `stage ${held.height} px 1.5 s after the growth (compact ${compact} px)`);
    await frame.waitForFunction(() => document.body.dataset.run === undefined, null, { timeout: 10000, polling: 20 });
    const hold = await frame.evaluate(() => window.__runAt.find(([on]) => !on)[1] - window.__runAt[0][1]);
    assert.ok(hold >= 1990 && hold <= 2400, `grown for ${Math.round(hold)} ms`);
    await page.waitForTimeout(800);
    const shortBack = await iframe.boundingBox();
    const shortGo = await frame.evaluate(() => document.getElementById('ed-go').getBoundingClientRect().bottom);
    assert.ok(Math.abs(shortBack.height - compact) < 1, `stage ${shortBack.height} px, compact ${compact} px`);
    assert.ok(shortBack.y + shortGo <= 844 && shortBack.y >= (await navBottom()), `Go bottom at ${shortBack.y + shortGo} px`);
    // a Go during that hold: the reader scrolls down to Go (below the screen's edge while grown) and taps it; the stage
    // stays grown and is placed again (top 8 px under the nav), so the new goal's view is on screen
    const setX = (v) => frame.evaluate((x) => {
      const el = document.getElementById('ed-x');
      el.value = String(x);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, v);
    await frame.waitForFunction(() => !document.getElementById('ed-roll').disabled && document.getElementById('ed-roll-out').textContent !== '', null, { timeout: 240000 });
    await setX(-20);
    await frame.waitForFunction(() => !document.getElementById('ed-go').disabled, null, { timeout: 60000 });
    await frame.evaluate(() => {
      window.__runAt = [];
      window.__endAt = undefined;
      document.getElementById('ed-go').click();
    });
    // its end and the fresh start's preview (a slider moved before that preview arrives is set back by it)
    await frame.waitForFunction(() => window.__endAt !== undefined && document.getElementById('ed-roll-out').textContent !== '', null, { timeout: 60000, polling: 50 });
    await setX(20);
    await frame.waitForFunction(() => !document.getElementById('ed-go').disabled, null, { timeout: 60000 });
    const goBox = async () => {
      const f = await iframe.boundingBox();
      const b = await frame.evaluate(() => { const r = document.getElementById('ed-go').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.bottom]; });
      return { x: f.x + b[0], y: f.y + b[1], bottom: f.y + b[2] };
    };
    await page.evaluate((dy) => window.scrollBy(0, dy), Math.round((await goBox()).bottom - (844 - 40)));
    await page.waitForTimeout(150);
    const tapAt = await goBox();
    const heldAtTap = await frame.evaluate(() => {
      const roll = document.getElementById('ed-roll');
      window.__lockedAt = undefined; // the new goal's start: the controls locked
      new MutationObserver(() => { if (roll.disabled && window.__lockedAt === undefined) window.__lockedAt = performance.now(); })
        .observe(roll, { attributes: true, attributeFilter: ['disabled'] });
      return [document.body.dataset.run !== undefined, performance.now() - window.__runAt[0][1]];
    });
    assert.ok(heldAtTap[0], `the hold was over at the tap (${Math.round(heldAtTap[1])} ms after the growth)`);
    // per painted frame until the shrink: the stage's top and height, and whether the demo is grown
    await page.evaluate(() => {
      const f = document.querySelector('#live-demo iframe');
      window.__placed = [];
      const loop = () => {
        const r = f.getBoundingClientRect(), run = f.contentDocument.body.dataset.run !== undefined;
        window.__placed.push([r.top, r.height, run]);
        if (run) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.touchscreen.tap(tapAt.x, tapAt.y);
    await frame.waitForFunction(() => window.__lockedAt !== undefined, null, { timeout: 10000, polling: 20 });
    await frame.waitForFunction(() => document.body.dataset.run === undefined, null, { timeout: 60000, polling: 50 });
    const top = (await navBottom()) + 8;
    const placed = await page.evaluate(() => window.__placed);
    assert.ok(placed.some(([y, h, run]) => run && h > 600 && Math.abs(y - top) < 1.5),
      `the grown stage was not placed after a Go during the hold (top ${Math.round(placed[0][0])} -> ${Math.round(placed[placed.length - 1][0])} px)`);
    await page.waitForTimeout(800);
    assert.ok(Math.abs((await iframe.boundingBox()).height - compact) < 1, 'not the compact frame after the goal started in the hold');
    // turned to a small landscape phone (667 x 375: the page's 9:16 stage, taller than the screen): a goal runs in the
    // compact frame, the stage does not grow (the demo still asks)
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const top = document.querySelector('#live-demo iframe').getBoundingClientRect().top;
      window.scrollBy(0, top - (document.querySelector('.dx-localnav').getBoundingClientRect().bottom + 8));
    });
    await frame.waitForFunction(() => !document.getElementById('ed-roll').disabled && document.getElementById('ed-roll-out').textContent !== '', null, { timeout: 240000 });
    const flat = (await iframe.boundingBox()).height;
    await frame.evaluate(() => {
      const el = document.getElementById('ed-x');
      el.value = '-170'; // back to where the first goal started (the sliders are relative to the current pose)
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await frame.waitForFunction(() => !document.getElementById('ed-go').disabled, null, { timeout: 60000 });
    await frame.evaluate(() => document.getElementById('ed-go').click());
    await frame.waitForFunction(() => document.body.dataset.run !== undefined, null, { timeout: 60000 });
    await frame.evaluate(() => document.getElementById('play').click());
    await page.waitForTimeout(800);
    const landscape = await page.evaluate(() => ({ height: document.querySelector('#live-demo iframe').getBoundingClientRect().height,
      style: document.querySelector('[data-demo-frame]').style.height }));
    assert.ok(Math.abs(landscape.height - flat) < 1 && landscape.style === '', `landscape stage ${flat} -> ${landscape.height} px (${landscape.style})`);
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});
