# DexGO project page

The project page of **DexGO: Dexterous Grasp Transition with Object Relocation**, served at
<https://egoista0326.github.io/dexgo/>. It is an [Astro](https://astro.build) static site deployed to GitHub Pages as a
project site of this repository (`egoista0326/dexgo`); the personal site at `https://egoista0326.github.io/` lives in
its own repository and links here.

## Layout

- `astro.config.mjs`: `site` is `https://egoista0326.github.io`, `base` is `/dexgo`, so every page and every file of
  `public/` is served under `/dexgo/`. Pages, data and components name a public file by its path from the site root
  and add the base with `url()` from `src/lib/url.ts` (CSS `url(/fonts/...)` is rewritten by Vite).
- `src/pages/index.astro` is the page (`/dexgo/`), `src/pages/figure.astro` the full-size method figure
  (`/dexgo/figure/`), `src/pages/404.astro` the standalone not-found page for unknown paths under `/dexgo/`.
- `src/data/dexgo.ts` holds the page's text, clips and figure data; `src/components/` its sections;
  `src/styles/global.css` its styles; `src/scripts/clipPlayback.ts` the viewport-driven clip playback.
- `public/assets/` holds clips, posters and figures (`/dexgo/assets/...`), `public/fonts/` the self-hosted Source Sans 3,
  `public/demo/` the live demo (`/dexgo/demo/`), plus the page's icons.

## Build, test, preview

```bash
npm install
npm run build          # dist/
npm run preview        # http://127.0.0.1:4322/dexgo/
npm test               # unit tests (tests/unit)
npm run test:dist      # checks of the built dist/ (tests/dist)
npm run test:e2e       # browser tests against the running preview (tests/e2e; BASE_URL, CHROME_PATH)
```

The browser tests use the system Chrome (`CHROME_PATH`, default `/usr/bin/google-chrome`) through Playwright.

## Live demo

`public/demo/` is generated, not edited here. Its source is the web demo in
`/mnt/data/jiaxli/uniassemble/runs/demo/20261120_web_mujoco/web`; `scripts/stage_demo_for_site.sh` of that run folder
stages exactly the files the demo loads, checks them (no MANO skin data, no host paths, no absolute local paths) and
syncs them into `public/demo/`. The licensed MANO skin data (`mano_local`) and the rejected smooth-hull code
(`app/hull_surface.js`) are never published; `.gitignore` guards both.

`scripts/build_problem_definition.py` builds the problem-definition figure's assets (`public/assets/problem/`).

## Deployment

`.github/workflows/deploy.yml` builds the site with GitHub Actions on every push to `main` and deploys it with GitHub
Pages (Settings, Pages, Source: GitHub Actions).
