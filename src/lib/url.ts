// The one place that adds the site's base path (astro.config.mjs `base`: the project Pages site is served at /dexgo/).
// Pages, data and components name a page or a file of public/ by its path relative to the site root, without the
// base; Astro rewrites its own bundled assets (_astro/) but not these strings.

/** The base path with one trailing slash, e.g. '/dexgo/'. */
const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');

/**
 * Root-relative address of a page or a public/ file: url('assets/share.jpg') -> '/dexgo/assets/share.jpg',
 * url('figure/') -> '/dexgo/figure/', url('') -> '/dexgo/', url('#method') -> '/dexgo/#method'.
 */
export const url = (path: string): string => `${base}${path.replace(/^\//, '')}`;
