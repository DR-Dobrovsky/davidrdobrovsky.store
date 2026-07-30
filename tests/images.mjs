/**
 * Image integrity test — run with:  node tests/images.mjs
 *
 * Written after a photo swap went half-live. A 600px replacement for a 1600px
 * hero meant the 800/1200/1600 variants were never regenerated, but the markup
 * still asked for them — so phones showed the new photo while desktops kept
 * serving the old one. Every other test passed.
 *
 * These checks make that state impossible to commit.
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { SLOTS, FORMATS } from '../scripts/image-slots.js';

const results = [];
const check = (label, passed, detail = '') => results.push([label, passed, detail]);

const html = await readFile('site/index.html', 'utf8');
const manifest = JSON.parse(await readFile('site/assets/img/manifest.json', 'utf8'));
const files = (await readdir('site/assets/img')).filter((f) => /\.(avif|webp|jpg)$/.test(f));

/* --------------------------- every reference points at a file that exists -- */

const referenced = [...new Set([...html.matchAll(/\/assets\/img\/([a-z0-9\-]+\.(?:avif|webp|jpg))/g)].map((m) => m[1]))];
const missing = referenced.filter((f) => !existsSync(`site/assets/img/${f}`));
check('every image referenced by the page exists', missing.length === 0, missing.join(', '));
check('the page references some images at all', referenced.length > 0, `${referenced.length} files`);

/* ------------------------------------------ no stale files left on disk ---- */

const expected = new Set(['og.jpg']);
for (const [slot, info] of Object.entries(manifest)) {
  for (const w of info.widths) for (const f of FORMATS) expected.add(`${slot}-${w}.${f.ext}`);
}
const orphans = files.filter((f) => !expected.has(f));
check(
  'no orphan variants on disk (stale files would keep being served)',
  orphans.length === 0,
  orphans.join(', ')
);

/* ---------------------------- markup agrees with the manifest, per slot ---- */

for (const slot of SLOTS) {
  const info = manifest[slot.name];
  if (!info) {
    check(`manifest has an entry for "${slot.name}"`, false);
    continue;
  }

  // Widths named in the markup must be exactly the widths that were built.
  const inMarkup = [
    ...new Set(
      [...html.matchAll(new RegExp(`/assets/img/${slot.name}-(\\d+)\\.jpg`, 'g'))].map((m) => Number(m[1]))
    ),
  ].sort((a, b) => a - b);

  check(
    `"${slot.name}" markup lists exactly the built widths`,
    JSON.stringify(inMarkup) === JSON.stringify(info.widths),
    `markup ${inMarkup.join('/')} vs built ${info.widths.join('/')}`
  );

  check(
    `"${slot.name}" never upscales past its source`,
    Math.max(...info.widths) <= info.sourceWidth,
    `largest ${Math.max(...info.widths)} > source ${info.sourceWidth}`
  );
}

/* --------------------------------------------- the hero preload is honest -- */

const preloadSrcset = html.match(/imagesrcset="([^"]*)"/)?.[1] ?? '';
const preloadFiles = [...preloadSrcset.matchAll(/\/assets\/img\/([a-z0-9\-]+\.avif)/g)].map((m) => m[1]);
check('hero preload lists files', preloadFiles.length > 0);
check(
  'every preloaded file exists',
  preloadFiles.every((f) => existsSync(`site/assets/img/${f}`)),
  preloadFiles.filter((f) => !existsSync(`site/assets/img/${f}`)).join(', ')
);

/* ------------------------------------------------------- dimensions given -- */

const imgTags = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
check(
  'every <img> declares width and height (prevents layout shift)',
  imgTags.every((t) => /\swidth="\d+"/.test(t) && /\sheight="\d+"/.test(t)),
  `${imgTags.filter((t) => !/\swidth="\d+"/.test(t)).length} without dimensions`
);
check(
  'every <img> has alt text',
  imgTags.every((t) => /\salt="[^"]/.test(t)),
  `${imgTags.filter((t) => !/\salt="[^"]/.test(t)).length} without alt`
);

/* ------------------------------------------------------------------ report */

let failed = 0;
for (const [label, passed, detail] of results) {
  if (!passed) failed += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail && !passed ? ' — ' + detail : ''}`);
}

// Low-resolution sources are a warning, not a failure: sometimes a small photo
// is all that exists, and blocking the build would not help.
const thin = Object.entries(manifest).filter(([, i]) => i.sourceWidth < 1200);
if (thin.length) {
  console.log('\nWarnings (not failures):');
  for (const [name, i] of thin) {
    console.log(`  ! "${name}" source is only ${i.sourceWidth}px wide — soft on large screens`);
  }
}

console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
