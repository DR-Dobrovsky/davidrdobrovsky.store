/**
 * Static-assets routing tests — run with:  node tests/assets.mjs
 *
 * Proves the single-Worker setup: /api/* is handled by the script, everything
 * else falls through to the site/ assets binding. Without this, a
 * misconfiguration would silently serve the API for page requests, or serve
 * index.html for checkout calls.
 */

import worker from '../worker/src/index.js';

const assetHits = [];

const env = {
  STRIPE_SECRET_KEY: 'sk_test_dummy',
  STRIPE_WEBHOOK_SECRET: 'whsec_testsecret',
  SITE_URL: 'https://seoulsilk.store',
  ALLOWED_ORIGINS: 'https://seoulsilk.store',
  ASSETS: {
    fetch(request) {
      assetHits.push(new URL(request.url).pathname);
      return new Response('<!DOCTYPE html><title>site</title>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    },
  },
};

const results = [];
const check = (label, passed) => results.push([label, passed]);

const get = (path) => new Request(`https://seoulsilk.store${path}`);

/* pages are served from the assets binding */
for (const path of ['/', '/thanks.html', '/legal/terms.html', '/assets/css/styles.css']) {
  const res = await worker.fetch(get(path), env);
  check(`${path} served from assets`, res.status === 200 && assetHits.includes(path));
}

/* API stays with the Worker, never the assets binding */
const before = assetHits.length;
let res = await worker.fetch(get('/api/health'), env);
const health = await res.json();
check('/api/health handled by worker', res.status === 200 && health.ok === true);
check('/api/health did not hit assets', assetHits.length === before);

res = await worker.fetch(
  new Request('https://seoulsilk.store/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://seoulsilk.store' },
    body: JSON.stringify({ priceId: 'bogus' }),
  }),
  env
);
check('/api/checkout validated by worker, not passed to assets', res.status === 400);

/* without the binding, unknown routes must still 404 rather than crash */
const { ASSETS, ...noAssets } = env;
res = await worker.fetch(get('/'), noAssets);
check('no assets binding falls back to 404', res.status === 404);

let failed = 0;
for (const [label, passed] of results) {
  if (!passed) failed += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
