#!/usr/bin/env node
/**
 * Post-deploy smoke test — run with:  npm run check:live
 *
 * Written after a config change ("html_handling = none") took the homepage
 * down: `/` returned an empty 404, which phones rendered as a file download
 * prompt. Every local test still passed, because the break lived in
 * Cloudflare's asset routing rather than in our code.
 *
 * So this checks the deployed site over the network. Run it after every deploy.
 */

const BASE = process.env.SITE_URL ?? 'https://seoulsilk.store';

/** [path, expected status, expected content-type fragment] */
const EXPECTED = [
  ['/', 200, 'text/html'],
  ['/legal/terms', 200, 'text/html'],
  ['/legal/privacy', 200, 'text/html'],
  ['/legal/shipping-returns', 200, 'text/html'],
  ['/legal/legal-notice', 200, 'text/html'],
  ['/thanks', 200, 'text/html'],
  ['/assets/css/styles.css', 200, 'text/css'],
  ['/assets/css/placeholders.css', 200, 'text/css'],
  ['/assets/js/main.js', 200, 'javascript'],
  ['/assets/js/config.js', 200, 'javascript'],
  ['/assets/img/hero-800.avif', 200, 'image/avif'],
  ['/assets/img/og.jpg', 200, 'image/jpeg'],
  ['/robots.txt', 200, 'text/plain'],
  ['/sitemap.xml', 200, 'xml'],
  ['/api/health', 200, 'application/json'],
];

/** Markers that prove the homepage is the real page and not an error body. */
const HOMEPAGE_MUST_CONTAIN = ['Seoulsilk', 'Rescue Ritual', 'data-buy', '</html>'];

let failed = 0;
const fail = (msg) => {
  failed += 1;
  console.log(`FAIL  ${msg}`);
};

console.log(`Checking ${BASE}\n`);

for (const [path, status, type] of EXPECTED) {
  try {
    // redirect: manual — a 301/302 here means we are linking to the wrong URL
    const res = await fetch(BASE + path, { redirect: 'manual' });
    const ct = res.headers.get('content-type') ?? '';

    if (res.status !== status) {
      fail(`${path} -> ${res.status}, expected ${status}`);
      continue;
    }
    if (!ct.includes(type)) {
      fail(`${path} -> content-type "${ct || 'none'}", expected "${type}"`);
      continue;
    }
    console.log(`PASS  ${path}`);
  } catch (err) {
    fail(`${path} -> request failed: ${err.message}`);
  }
}

// A 404 must still be a real page, not an empty body that browsers offer to
// download. That empty response was the actual symptom users reported.
try {
  const res = await fetch(`${BASE}/definitely-not-a-page`);
  const body = await res.text();
  if (res.status !== 404) fail(`unknown path -> ${res.status}, expected 404`);
  else if (body.trim().length === 0) fail('404 body is empty — browsers will offer it as a download');
  else console.log('PASS  unknown path returns a non-empty 404');
} catch (err) {
  fail(`404 check failed: ${err.message}`);
}

try {
  const html = await (await fetch(BASE + '/')).text();
  const missing = HOMEPAGE_MUST_CONTAIN.filter((m) => !html.includes(m));
  if (missing.length) fail(`homepage is missing: ${missing.join(', ')}`);
  else console.log('PASS  homepage contains the shop, not an error page');
} catch (err) {
  fail(`homepage content check failed: ${err.message}`);
}

console.log(`\n${failed === 0 ? 'All live checks passed' : `${failed} live check(s) failed`}`);
process.exit(failed ? 1 : 0);
