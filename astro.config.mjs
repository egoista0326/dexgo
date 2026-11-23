import { defineConfig } from 'astro/config';

// GitHub project Pages of egoista0326/dexgo: the site is served at https://egoista0326.github.io/dexgo/, so every
// page and every file of public/ lives under the base /dexgo/ (src/lib/url.ts adds it to the paths in the data).
export default defineConfig({
  site: 'https://egoista0326.github.io',
  base: '/dexgo'
});
