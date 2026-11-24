// Checks of the built site in dist/ (no browser). The site is GitHub project Pages under the base /dexgo/
// (astro.config.mjs): dist/<path> is served at /dexgo/<path>; the domain's other paths (/, /photography/, ...) belong to
// the personal site (repository egoista0326.github.io), so links to them are not checked here.
// Run after `npm run build`: npm run test:dist   (node --test tests/dist/*.test.mjs)
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = join(root, 'dist');
const read = (path) => readFileSync(join(root, path), 'utf8');
const config = read('astro.config.mjs');
const siteUrl = (/site:\s*['"]([^'"]+)['"]/.exec(config)?.[1] ?? '').replace(/\/$/, '');
/** The base path with its trailing slash, e.g. '/dexgo/'. */
const basePath = `${(/base:\s*['"]([^'"]+)['"]/.exec(config)?.[1] ?? '').replace(/\/$/, '')}/`;

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
  );

// .fuse_hidden* files are open files a FUSE mount keeps after their deletion (not build output).
const distFiles = walk(dist).filter((file) => !/(^|[\\/])\.fuse_hidden/.test(file));
const htmlFiles = distFiles.filter((file) => file.endsWith('.html'));
const html = new Map(htmlFiles.map((file) => [file, readFileSync(file, 'utf8')]));
/** `dist/a/b/index.html` -> `/dexgo/a/b/`, `dist/404.html` -> `/dexgo/404.html`. */
const urlPathOf = (file) => `${basePath}${relative(dist, file).split(sep).join('/')}`.replace(/(^|\/)index\.html$/, '$1');
/** The dist file of a root-relative address under the base ('/dexgo/assets/share.jpg' -> dist/assets/share.jpg). */
const distFile = (address) => {
  assert.ok(address.startsWith(basePath), `${address} is under ${basePath}`);
  return join(dist, address.slice(basePath.length));
};

/** Markup without the bodies of <script> and <style> (JSON data, CSS), so only real attributes are scanned. */
const markupOf = (file) =>
  html.get(file).replace(/(<(script|style)\b[^>]*>)[\s\S]*?(<\/\2>)/gi, '$1$3');

const decodeEntities = (value) =>
  value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** Values of attribute `name` on every tag of `markup`. */
const attributeValues = (markup, name) =>
  Array.from(markup.matchAll(new RegExp(`<[a-z][^>]*?\\s${name}=(?:"([^"]*)"|'([^']*)')`, 'gi')), (match) =>
    decodeEntities(match[1] ?? match[2])
  );

/** Every tag `<tagName ...>` of `markup`, as its opening-tag text. */
const tagsNamed = (markup, tagName) => Array.from(markup.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')), (m) => m[0]);
const attributeOf = (tag, name) => {
  const match = new RegExp(`\\s${name}(?:=(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?(?=[\\s>/])`, 'i').exec(tag);
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? '') : undefined;
};
const srcsetUrls = (srcset) =>
  srcset
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);

/** Link chips (LinkChips.astro) in `markup`: element name, opening tag and inner markup. */
function chipsOf(markup) {
  return Array.from(markup.matchAll(/<(a|span) (class="project-chip[^"]*"[^>]*)>([\s\S]*?)<\/\1>(?=\s*<\/li>)/g), ([, element, attrs, body]) => ({
    element,
    tag: `<${element} ${attrs}>`,
    body
  }));
}

/** Pixel size [w, h] of a WebP or JPEG file (header only). */
function imageSize(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (chunk === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
    }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length; ) {
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  throw new Error(`unknown image format: ${file}`);
}

/**
 * The dist file an internal URL reaches (query and hash stripped), or null for external and non-file URLs and for
 * addresses on the site's origin outside the base (the personal site's pages). URLs on the site's own origin count as
 * internal.
 */
const resolveInternal = (url, fromFile) => {
  if (url === '' || url.startsWith('#') || /^(mailto|tel|javascript|data|blob):/i.test(url)) return null;
  let parsed;
  try {
    parsed = new URL(url, `${siteUrl}${urlPathOf(fromFile)}`);
  } catch {
    return { path: url, file: null };
  }
  if (parsed.origin !== new URL(siteUrl).origin) return null;
  if (!`${parsed.pathname}/`.startsWith(basePath)) return null;
  const absolute = /^[a-z][a-z0-9+.-]*:|^\/\//i.test(url);
  let path;
  try {
    path = decodeURIComponent(parsed.pathname).slice(basePath.length - 1);
  } catch {
    return { path: parsed.pathname, file: null };
  }
  const candidates = path.endsWith('/') ? [`${path}index.html`] : [path, `${path}/index.html`, `${path}.html`];
  const file = candidates.map((candidate) => join(dist, candidate)).find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  return { path: parsed.pathname, hash: parsed.hash, file: file ?? null, absolute };
};

/** Unresolved URLs of every page: root-relative/relative ones, or absolute ones on the site's origin. */
const brokenUrls = ({ absolute }) => {
  const broken = [];
  for (const file of htmlFiles) {
    const markup = markupOf(file);
    const urls = absolute
      ? [...attributeValues(markup, 'href'), ...attributeValues(markup, 'content')]
      : [
          ...attributeValues(markup, 'href'),
          ...attributeValues(markup, 'src'),
          ...attributeValues(markup, 'poster'),
          ...attributeValues(markup, 'data-poster'),
          ...attributeValues(markup, 'data-src'),
          ...attributeValues(markup, 'srcset').flatMap(srcsetUrls)
        ];
    for (const url of new Set(urls)) {
      if (absolute && !url.startsWith(`${siteUrl}/`)) continue;
      const target = resolveInternal(url, file);
      if (target && target.absolute === absolute && !target.file) broken.push(`${urlPathOf(file)}: ${url}`);
    }
  }
  return broken;
};

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

test('dist/ is built: the project page, the figure page and 404.html', () => {
  for (const page of ['index.html', join('figure', 'index.html'), '404.html', join('demo', 'index.html')]) {
    assert.ok(existsSync(join(dist, page)), `dist/${page} exists (run npm run build first)`);
  }
});

test('every internal href, src, poster and srcset URL resolves to a file in dist/', () => {
  assert.deepEqual(brokenUrls({ absolute: false }), []);
});

test('absolute URLs on the site origin under the base (canonical, og:url, og:image) resolve to a file in dist/', () => {
  assert.deepEqual(brokenUrls({ absolute: true }), []);
});

test('no root-relative address outside the base in the built pages, styles and the demo page', () => {
  // A path such as "/assets/..." or url(/fonts/...) would reach the personal site, not this one.
  const found = [];
  const pages = [...htmlFiles, ...distFiles.filter((file) => file.endsWith('.css'))];
  for (const file of pages) {
    const text = file.endsWith('.css') ? readFileSync(file, 'utf8') : markupOf(file);
    const urls = file.endsWith('.css')
      ? Array.from(text.matchAll(/url\(\s*["']?(\/[^"')]*)/g), (m) => m[1])
      : ['href', 'src', 'poster', 'data-poster', 'data-src', 'data-demo-src', 'content'].flatMap((name) => attributeValues(text, name)).filter((url) => url.startsWith('/'));
    for (const url of urls) if (!url.startsWith('//') && !`${url}/`.startsWith(basePath)) found.push(`${relative(dist, file)}: ${url}`);
  }
  assert.deepEqual(found, []);
});

test('exactly one <h1> on every page', () => {
  const wrong = htmlFiles
    .map((file) => [urlPathOf(file), (markupOf(file).match(/<h1[\s>]/gi) ?? []).length])
    .filter(([, count]) => count !== 1);
  assert.deepEqual(wrong, []);
});

test('share image: og:image and twitter:image name the share file under the base, with its size and alt', () => {
  const metas = tagsNamed(markupOf(join(dist, 'index.html')), 'meta');
  const meta = (key) => attributeOf(metas.find((tag) => (attributeOf(tag, 'property') ?? attributeOf(tag, 'name')) === key) ?? '', 'content');
  assert.equal(meta('og:url'), `${siteUrl}${basePath}`);
  assert.equal(meta('og:image'), `${siteUrl}${basePath}assets/share.jpg`);
  assert.equal(meta('twitter:image'), meta('og:image'));
  const [width, height] = imageSize(join(dist, 'assets', 'share.jpg'));
  assert.deepEqual([meta('og:image:width'), meta('og:image:height')], [String(width), String(height)]);
  assert.ok(meta('og:image:alt'));
  // The demo page names the same image.
  const demo = tagsNamed(read('public/demo/index.html'), 'meta').find((tag) => attributeOf(tag, 'property') === 'og:image');
  assert.equal(attributeOf(demo, 'content'), meta('og:image'));
});

test('the 404 page: standalone (no header, nav or footer), the DexGO icons, one link to the project page, not indexed', () => {
  const markup = markupOf(join(dist, '404.html'));
  assert.deepEqual([/<header\b/i, /<nav\b/i, /<footer\b/i].filter((pattern) => pattern.test(markup)).map(String), []);
  assert.match(markup, /<html lang="en" data-not-found="dexgo"[\s>]/);
  assert.equal(/<title>([^<]*)<\/title>/.exec(markup)?.[1], 'Page not found | DexGO');
  const icons = tagsNamed(markup, 'link').filter((tag) => /\bicon\b/.test(attributeOf(tag, 'rel') ?? '')).map((tag) => attributeOf(tag, 'href'));
  assert.deepEqual(icons, ['/dexgo/favicon.ico', '/dexgo/favicon.svg', '/dexgo/apple-touch-icon.png']);
  assert.deepEqual(tagsNamed(markup, 'a').map((tag) => attributeOf(tag, 'href')), ['#main', '/dexgo/']);
  assert.ok(tagsNamed(markup, 'meta').some((tag) => attributeOf(tag, 'name') === 'robots' && attributeOf(tag, 'content') === 'noindex'));
});

test('published files: no MANO skin data, no smooth-hull code, nothing over the 100 MB GitHub file limit', () => {
  const bad = distFiles.filter((file) => /mano_local|hull_surface|mano_skin|skin_surface/.test(relative(dist, file)));
  assert.deepEqual(bad, []);
  const large = distFiles.filter((file) => statSync(file).size > 100 * 1024 * 1024).map((file) => relative(dist, file));
  assert.deepEqual(large, []);
});

test('/dexgo/ title block: the link chips of dexgo.ts, a link without a target marked soon or left out', () => {
  const markup = markupOf(join(dist, 'index.html'));
  const title = /<header class="dx-title">([\s\S]*?)<\/header>/.exec(markup)?.[1];
  assert.ok(title, 'dist/index.html has a title block');
  const shown = chipsOf(title).map(({ element, body }) => `${element}:${decodeEntities(body.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()}`);
  const links = Array.from(
    read('src/data/dexgo.ts').matchAll(/\{\s*label:\s*'([^']+)',\s*icon:\s*'[^']+',\s*href:\s*'([^']*)',\s*soon:\s*(true|false)\s*\}/g),
    ([, label, href, soon]) => ({ label, href, soon: soon === 'true' })
  );
  assert.ok(links.length > 0, 'links found in src/data/dexgo.ts');
  const expected = links.flatMap(({ label, href, soon }) => (href ? [`a:${label}`] : soon ? [`span:${label} · soon`] : []));
  assert.deepEqual(shown, expected);
});


test('/dexgo/ hero: the teaser (2:1, and 4:3 on phones) as muted looping clips with posters; no project video', () => {
  const markup = markupOf(join(dist, 'index.html'));
  const hero = /<div class="dx-media dx-hero">([\s\S]*?)<\/div>\s*<section/.exec(markup)?.[1] ?? '';
  const videos = tagsNamed(hero, 'video');
  assert.equal(videos.length, 2, 'the wide and the phone cut');
  const sources = tagsNamed(hero, 'source').map((tag) => attributeOf(tag, 'src'));
  assert.deepEqual(sources, ['/dexgo/assets/clips/teaser_1080p_crop.mp4', '/dexgo/assets/clips/teaser_phone.mp4']);
  for (const video of videos) {
    assert.notEqual(attributeOf(video, 'muted'), undefined);
    assert.notEqual(attributeOf(video, 'loop'), undefined);
    assert.notEqual(attributeOf(video, 'playsinline'), undefined);
    assert.equal(attributeOf(video, 'controls'), undefined);
    assert.ok(existsSync(distFile(attributeOf(video, 'data-poster'))), attributeOf(video, 'data-poster'));
  }
  assert.doesNotMatch(markup, /data-player|data-sound-on|dexgo_video|assets\/video/);
  assert.equal(existsSync(join(dist, 'assets', 'video')), false, 'no project video files');
});


test('/dexgo/ structure: sticky nav with the three parts and one pause button; Method, Live demo, Results as parts with an eyebrow and an h2', () => {
  const markup = markupOf(join(dist, 'index.html'));
  const nav = /<nav class="dx-localnav"[\s\S]*?<\/nav>/.exec(markup)?.[0] ?? '';
  assert.deepEqual(tagsNamed(nav, 'a').map((tag) => attributeOf(tag, 'href')), ['#main', '#method', '#live-demo', '#results']);
  assert.equal(tagsNamed(markup, 'button').filter((tag) => attributeOf(tag, 'data-video-toggle') !== undefined).length, 1);
  const parts = [...markup.matchAll(/<section id="(method|live-demo|results)" class="dx-part[^"]*"[^>]*>\s*<header class="dx-part-head"[^>]*>\s*<p class="dx-eyebrow">([^<]+)<\/p>\s*<h2\b/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(parts, [['method', 'Method'], ['live-demo', 'Live demo'], ['results', 'Results']]);
  const demo = /<section id="live-demo"[\s\S]*?<\/section>/.exec(markup)?.[0] ?? '';
  // The demo starts on its own; the recorded chain is a Results example, not in the stage.
  assert.deepEqual(tagsNamed(demo, 'source'), []);
  assert.match(demo, /data-demo-start[^>]*>[\s\S]*?Start the live demo/);
  const chain = /<section class="dx-screen" aria-labelledby="results-chain">[\s\S]*?<\/section>/.exec(markup)?.[0] ?? '';
  assert.deepEqual(tagsNamed(chain, 'source').map((tag) => attributeOf(tag, 'src')), ['/dexgo/assets/clips/chain_ticker.mp4', '/dexgo/assets/clips/chain_ticker_phone.mp4']);
  assert.match(markup, /<a slot="lead"|class="dx-pill dx-pill-primary" href="#live-demo" data-demo-jump/);
});


test('/dexgo/figure/: the overview figure at 1000 px on a standalone page (phones use the figure in place)', () => {
  const dexgo = markupOf(join(dist, 'index.html'));
  assert.deepEqual(tagsNamed(dexgo, 'a').filter((tag) => attributeOf(tag, 'href') === '/dexgo/figure/'), [], 'no link to the figure page');

  const file = join(dist, 'figure', 'index.html');
  assert.ok(existsSync(file), 'dist/figure/index.html exists');
  const markup = markupOf(file);
  assert.ok(tagsNamed(markup, 'meta').some((tag) => attributeOf(tag, 'name') === 'viewport' && /width=device-width/.test(attributeOf(tag, 'content') ?? '')));
  assert.ok(tagsNamed(markup, 'meta').some((tag) => attributeOf(tag, 'name') === 'robots' && attributeOf(tag, 'content') === 'noindex'));
  // Standalone like /dexgo/: no personal header, nav or footer; only the project's own icon.
  assert.deepEqual([/<header\b/i, /<nav\b/i, /<footer\b/i].filter((pattern) => pattern.test(markup)).map(String), []);
  const icons = tagsNamed(markup, 'link').filter((tag) => /\bicon\b/.test(attributeOf(tag, 'rel') ?? ''));
  assert.ok(icons.length > 0 && icons.every((tag) => (attributeOf(tag, 'href') ?? '').startsWith('/dexgo/')), 'DexGO icons only');
  const image = tagsNamed(markup, 'img').find((tag) => attributeOf(tag, 'src') === '/dexgo/assets/method_overview_web.svg');
  assert.ok(image, 'the figure image');
  assert.equal(attributeOf(image, 'width'), '1000');
  assert.ok(tagsNamed(markup, 'a').some((tag) => attributeOf(tag, 'href') === '/dexgo/#method'), 'a link back to the Method part (with the figure) on /dexgo/');
  // One name for the figure: the tab title is the figure's accessible name. The scroll buttons start hidden (the page
  // script shows the one on a side with more figure) and are labelled.
  const label = /<figure class="dx-method-figure" aria-label="([^"]+)"/.exec(dexgo)?.[1];
  assert.equal(/<title>([^<]*)<\/title>/.exec(markup)?.[1], label);
  const buttons = tagsNamed(markup, 'button').filter((tag) => attributeOf(tag, 'data-figure-more') !== undefined);
  assert.deepEqual(buttons.map((tag) => [attributeOf(tag, 'aria-label'), attributeOf(tag, 'hidden') !== undefined]), [
    ['Scroll the figure left', true],
    ['Scroll the figure right', true]
  ]);
});


test('/dexgo/ prerequisite graph: one Tab stop, on the selected task', () => {
  const nodes = tagsNamed(markupOf(join(dist, 'index.html')), 'button').filter((tag) => /class="dx-node"/.test(tag));
  assert.equal(nodes.length, 15);
  const stops = nodes.filter((tag) => attributeOf(tag, 'tabindex') === '0');
  assert.equal(stops.length, 1);
  assert.equal(attributeOf(stops[0], 'aria-pressed'), 'true');
  assert.ok(nodes.every((tag) => tag === stops[0] || attributeOf(tag, 'tabindex') === '-1'));
});


test('/dexgo/ prerequisite graph: every node is described by the arrow-key sentence', () => {
  const markup = markupOf(join(dist, 'index.html'));
  const nodes = tagsNamed(markup, 'button').filter((tag) => /class="dx-node"/.test(tag));
  const ids = new Set(nodes.map((tag) => attributeOf(tag, 'aria-describedby')));
  assert.equal(ids.size, 1);
  const [id] = ids;
  assert.match(markup, new RegExp(`<span id="${id}" class="visually-hidden">Arrow keys move between tasks\\.</span>`));
});


test('/dexgo/ fonts: self-hosted, no third-party font host, preloaded files that exist', () => {
  for (const page of [['index.html'], ['figure', 'index.html']]) {
    assert.doesNotMatch(html.get(join(dist, ...page)), /fonts\.(googleapis|gstatic)\.com/, page.join('/'));
  }
  const markup = markupOf(join(dist, 'index.html'));
  const preloads = tagsNamed(markup, 'link').filter((tag) => attributeOf(tag, 'rel') === 'preload' && attributeOf(tag, 'as') === 'font');
  // One family for all text (owner 2026-11-23): Source Sans 3 only.
  assert.deepEqual(preloads.map((tag) => attributeOf(tag, 'href')).sort(), ['/dexgo/fonts/source-sans-3/source-sans-3-latin-var.woff2']);
  for (const tag of preloads) {
    assert.equal(attributeOf(tag, 'type'), 'font/woff2');
    assert.notEqual(attributeOf(tag, 'crossorigin'), undefined, 'a font preload needs crossorigin to be used');
    assert.ok(existsSync(distFile(attributeOf(tag, 'href'))), attributeOf(tag, 'href'));
  }
  const css = readdirSync(join(dist, '_astro')).filter((file) => file.endsWith('.css')).map((file) => readFileSync(join(dist, '_astro', file), 'utf8')).join('');
  const declared = css + html.get(join(dist, 'index.html'));
  for (const tag of preloads) assert.ok(declared.includes(`url("${attributeOf(tag, 'href')}")`) || declared.includes(`url(${attributeOf(tag, 'href')})`), `a @font-face uses ${attributeOf(tag, 'href')}`);
});


test('/dexgo/ fonts: one family, no serif face declared or loaded, the <em> phrase set in it', () => {
  const page = html.get(join(dist, 'index.html'));
  const css = readdirSync(join(dist, '_astro')).filter((file) => file.endsWith('.css')).map((file) => readFileSync(join(dist, '_astro', file), 'utf8')).join('');
  assert.doesNotMatch(page + css, /Source Serif|source-serif/);
  assert.ok(/<em>[^<]+<\/em>/.test(markupOf(join(dist, 'index.html'))), 'the abstract keeps its emphasis');
});


test('/dexgo/ problem definition: between the abstract and Method, three goal parts as buttons, no capability letters', () => {
  const markup = markupOf(join(dist, 'index.html'));
  const at = (re) => markup.search(re);
  assert.ok(at(/class="dx-section dx-abstract"/) < at(/<section id="problem"/), 'after the abstract');
  assert.ok(at(/<section id="problem"/) < at(/<section id="method"/), 'before the Method part');
  const section = /<section id="problem"[\s\S]*?<\/section>/.exec(markup)?.[0] ?? '';
  assert.match(section, /<p class="dx-eyebrow">Problem definition<\/p>\s*<h2\b/);
  const buttons = tagsNamed(section, 'button').filter((tag) => attributeOf(tag, 'data-part-key') !== undefined);
  assert.deepEqual(buttons.map((tag) => attributeOf(tag, 'data-part-key')), ['rel', 'fingers', 'world']);
  for (const tag of buttons) {
    assert.equal(attributeOf(tag, 'aria-pressed'), 'false');
    assert.match(section, new RegExp(`id="${attributeOf(tag, 'aria-describedby')}"`));
  }
  const text = section.replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(text, /\b(R|T|G|L|RT|RG|RL|TG|TL|GL|RTG|RTL|RGL|TGL|RTGL)\b/, 'no capability letters');
  for (const name of ['pd_start', 'pd_rel', 'pd_fingers', 'pd_world', 'ov_rel', 'ov_fingers', 'ov_world']) {
    assert.ok(existsSync(join(dist, 'assets', 'problem', `${name}.webp`)), `${name}.webp`);
  }
  assert.ok(existsSync(join(dist, 'assets', 'problem', 'pd_motion.mp4')));
});


test('/dexgo/ abstract: the problem name emphasised as in the paper', () => {
  const abstract = /<section class="dx-section dx-abstract"[\s\S]*?<\/section>/.exec(markupOf(join(dist, 'index.html')))?.[0] ?? '';
  assert.match(abstract, /<em>grasp transition with object relocation<\/em>/);
  assert.doesNotMatch(abstract, /\\emph/);
});


test('no page of a production build shows placeholder text (TODO, lorem, TBD)', () => {
  const found = [];
  for (const file of htmlFiles) {
    const visible = decodeEntities(markupOf(file).replace(/<[^>]+>/g, ' '));
    const match = /\bTODO\b|lorem ipsum|\bTBD\b/i.exec(visible);
    if (match) found.push(`${urlPathOf(file)}: ${visible.slice(Math.max(0, match.index - 30), match.index + 40).replace(/\s+/g, ' ')}`);
  }
  assert.deepEqual(found, []);
});
