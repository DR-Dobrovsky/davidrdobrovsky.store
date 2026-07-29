/**
 * CSP consistency test — run with:  node tests/csp.mjs
 *
 * Written after inline styles were silently dropped in production. The CSP in
 * site/_headers uses `style-src 'self'` and `script-src 'self'`, which block
 * inline style attributes, <style> elements and inline <script> blocks. The
 * markup used all three, so 22 style attributes and 6 scripts never ran — and
 * nothing failed loudly. The page just looked subtly wrong.
 *
 * This reads the policy that will actually be served and checks the markup
 * against it, so the two cannot drift apart again.
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const results = [];
const check = (label, passed, detail = '') => results.push([label, passed, detail]);

/* ------------------------------------------------------- read the policy -- */

const headers = await readFile('site/_headers', 'utf8');
const cspLine = headers
  .split('\n')
  .map((l) => l.trim())
  .find((l) => l.toLowerCase().startsWith('content-security-policy:'));

check('CSP is present in site/_headers', Boolean(cspLine));

const csp = cspLine ? cspLine.slice(cspLine.indexOf(':') + 1).trim() : '';
const directive = (name) => {
  const found = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' '));
  return found ? found.slice(name.length).trim().split(/\s+/) : [];
};

const styleSrc = directive('style-src');
const scriptSrc = directive('script-src');
const inlineStylesAllowed = styleSrc.includes("'unsafe-inline'");
const inlineScriptsAllowed = scriptSrc.includes("'unsafe-inline'");

/* --------------------------------------------------------- collect pages -- */

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(path)));
    else if (entry.name.endsWith('.html') && !path.includes('/img/')) out.push(path);
  }
  return out;
}

const pages = await htmlFiles('site');
check('found the HTML pages', pages.length >= 7, `${pages.length} files`);

/* ------------------------------------------------------------- the rules -- */

const offenders = { styleAttr: [], styleTag: [], inlineScript: [] };

for (const page of pages) {
  const html = await readFile(page, 'utf8');

  const attrs = html.match(/\sstyle="[^"]*"/g) ?? [];
  if (attrs.length) offenders.styleAttr.push(`${page} (${attrs.length})`);

  if (/<style[\s>]/.test(html)) offenders.styleTag.push(page);

  // Inline <script> means: no src attribute, and a type the browser executes.
  // Data blocks such as <script type="application/ld+json"> are never executed
  // and so are not covered by script-src — flagging them would be noise.
  const DATA_TYPES = /^(application\/(ld\+json|json)|text\/(template|plain))$/i;
  const scripts = (html.match(/<script\b[^>]*>/g) ?? []).filter((tag) => {
    if (/\ssrc=/.test(tag)) return false;
    const type = tag.match(/\stype="([^"]*)"/i)?.[1]?.trim();
    return !(type && DATA_TYPES.test(type));
  });
  if (scripts.length) offenders.inlineScript.push(`${page} (${scripts.length})`);
}

if (inlineStylesAllowed) {
  check("style-src allows 'unsafe-inline', so inline styles are permitted", true);
} else {
  check(
    'no inline style attributes (blocked by style-src)',
    offenders.styleAttr.length === 0,
    offenders.styleAttr.join(', ')
  );
  check(
    'no <style> elements (blocked by style-src)',
    offenders.styleTag.length === 0,
    offenders.styleTag.join(', ')
  );
}

if (inlineScriptsAllowed) {
  check("script-src allows 'unsafe-inline', so inline scripts are permitted", true);
} else {
  check(
    'no inline <script> blocks (blocked by script-src)',
    offenders.inlineScript.length === 0,
    offenders.inlineScript.join(', ')
  );
}

/* ------------------------------------- every referenced local file exists -- */

const missing = [];
for (const page of pages) {
  const html = await readFile(page, 'utf8');
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) {
    const target = m[1];
    if (target.startsWith('//')) continue;
    const candidates =
      target === '/'
        ? ['site/index.html']
        : [`site${target}`, `site${target}.html`, `site${target}/index.html`];
    if (!candidates.some((c) => existsSync(c))) missing.push(`${page} -> ${target}`);
  }
}
check('every internal reference resolves', missing.length === 0, missing.slice(0, 5).join(', '));

/* --------------------------------- Stripe must stay reachable in the CSP -- */

check(
  'connect-src allows api.stripe.com',
  directive('connect-src').includes('https://api.stripe.com')
);
check(
  'form-action allows checkout.stripe.com',
  directive('form-action').includes('https://checkout.stripe.com')
);

/* ------------------------------------------------- caching sanity check --- */

// Filenames carry no content hash, so `immutable` on CSS or JS would strand
// returning visitors on a stale stylesheet for as long as the max-age.
const cssJsBlocks = headers
  .split(/\n(?=\S)/)
  .filter((block) => /^\/assets\/(css|js)\//.test(block.trim()));

check('CSS and JS have their own cache rules', cssJsBlocks.length >= 2);
check(
  'CSS and JS are not marked immutable (filenames are not hashed)',
  cssJsBlocks.every((block) => !/immutable/i.test(block))
);

/* ------------------------------------------------------------------ report */

let failed = 0;
for (const [label, passed, detail] of results) {
  if (!passed) failed += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail && !passed ? ' — ' + detail : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
