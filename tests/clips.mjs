/**
 * Clip integrity test — run with:  node tests/clips.mjs
 *
 * Same rule as the photos: the page may only reference files that exist, and no
 * stale output may survive a re-upload. Video adds two failure modes of its
 * own, both of which this catches:
 *
 *   - a lone <source> carrying a media query, which leaves some viewports with
 *     nothing playable at all
 *   - a clip that autoplays with sound, which is both hostile and blocked
 *
 * Passes cleanly when there are no clips yet, since the section is hidden then.
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { CLIP_SLOTS, CLIP_FORMATS } from '../scripts/clip-slots.js';

const results = [];
const check = (label, passed, detail = '') => results.push([label, passed, detail]);

const raw = await readFile('site/index.html', 'utf8');
// Comments mention these paths in prose, and a comment is not a reference.
const html = raw.replace(/<!--[\s\S]*?-->/g, '');

let manifest = {};
if (existsSync('site/assets/video/manifest.json')) {
  manifest = JSON.parse(await readFile('site/assets/video/manifest.json', 'utf8'));
}
const slots = Object.keys(manifest);

/* ------------------------------------------------- the empty case is valid -- */

const sectionTag = raw.match(/<section class="section clips-section"[^>]*>/)?.[0] ?? '';
check('the clips section exists', sectionTag.length > 0);

if (slots.length === 0) {
  check('with no clips the section is hidden', /\shidden/.test(sectionTag));
  check('with no clips nothing references /assets/video/', !/\/assets\/video\/[a-z]/.test(html));
} else {
  check('with clips present the section is visible', !/\shidden/.test(sectionTag));
}

/* ----------------------------------------------- referenced files exist ----- */

const referenced = [
  ...new Set([...html.matchAll(/\/assets\/video\/([a-z0-9\-]+\.(?:webm|mp4|jpg))/g)].map((m) => m[1])),
];
const missing = referenced.filter((f) => !existsSync(`site/assets/video/${f}`));
check('every clip file referenced by the page exists', missing.length === 0, missing.join(', '));

/* ------------------------------------------------- no stale output on disk -- */

if (existsSync('site/assets/video')) {
  const files = (await readdir('site/assets/video')).filter((f) => /\.(webm|mp4|jpg)$/.test(f));
  const expected = new Set();
  for (const [slot, info] of Object.entries(manifest)) {
    expected.add(`${slot}-poster.jpg`);
    for (const w of info.widths) for (const f of CLIP_FORMATS) expected.add(`${slot}-${w}.${f.ext}`);
  }
  const orphans = files.filter((f) => !expected.has(f));
  check('no orphan clip files on disk', orphans.length === 0, orphans.join(', '));
}

/* --------------------------------------------------- per-slot correctness -- */

for (const slot of slots) {
  const info = manifest[slot];
  const meta = CLIP_SLOTS.find((s) => s.name === slot);

  check(`"${slot}" is a known slot`, Boolean(meta));

  const block = html.match(new RegExp(`<figure class="clip">[\\s\\S]*?${slot}[\\s\\S]*?</figure>`))?.[0] ?? '';
  check(`"${slot}" has a block in the page`, block.length > 0);

  if (!block) continue;

  const sources = [...block.matchAll(/<source\b[^>]*>/g)].map((m) => m[0]);
  const withMedia = sources.filter((s) => /\smedia="/.test(s));

  check(
    `"${slot}" has a source for every width and format`,
    sources.length === info.widths.length * CLIP_FORMATS.length,
    `${sources.length} sources for ${info.widths.length} widths`
  );

  // The trap: one width plus a media query means some viewports match nothing.
  check(
    `"${slot}" media queries cannot exclude every viewport`,
    info.widths.length > 1 ? withMedia.length === sources.length : withMedia.length === 0,
    info.widths.length === 1 ? 'single width must carry no media attribute' : ''
  );

  check(`"${slot}" has a poster frame`, /poster="\/assets\/video\//.test(block));
  check(`"${slot}" declares width and height`, /\swidth="\d+"/.test(block) && /\sheight="\d+"/.test(block));
  check(`"${slot}" is described for screen readers`, /aria-label="[^"]{10}/.test(block));
}

/* ----------------------------------------------------- behaviour of video -- */

const videos = [...html.matchAll(/<video\b[^>]*>/g)].map((m) => m[0]);
if (videos.length) {
  check('every clip is muted (autoplay with sound is blocked anyway)', videos.every((v) => /\smuted/.test(v)));
  check('every clip loops', videos.every((v) => /\sloop/.test(v)));
  check('every clip has playsinline (iOS would otherwise go fullscreen)', videos.every((v) => /\splaysinline/.test(v)));
  check(
    'no clip preloads eagerly (they are decorative)',
    videos.every((v) => /preload="none"/.test(v))
  );
}

/* ------------------------------------------------------- CSP permits media -- */

const headers = await readFile('site/_headers', 'utf8');
const csp = headers.split('\n').find((l) => l.trim().toLowerCase().startsWith('content-security-policy:')) ?? '';
check(
  'CSP allows media from our own origin',
  /media-src[^;]*'self'/.test(csp) || /default-src[^;]*'self'/.test(csp)
);

/* ------------------------------------------------------------------ report */

let failed = 0;
for (const [label, passed, detail] of results) {
  if (!passed) failed += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail && !passed ? ' — ' + detail : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
