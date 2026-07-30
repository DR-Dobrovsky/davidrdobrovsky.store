#!/usr/bin/env node
/**
 * Writes the <picture> markup — run with:  npm run picture
 *
 * The srcset used to be hand-written with a fixed set of widths. When a photo
 * was replaced by a smaller one, the large variants were no longer generated
 * but the markup still asked for them, so the browser kept serving the previous
 * image on desktop while phones showed the new one. Nothing errored.
 *
 * So the markup is generated from manifest.json, which records the widths that
 * were actually produced. If a file is not there, nothing references it.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { SLOTS, FORMATS } from './image-slots.js';

const TARGET = 'site/index.html';
const MANIFEST = 'site/assets/img/manifest.json';

const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
let html = await readFile(TARGET, 'utf8');

const srcset = (slot, ext, widths) =>
  widths.map((w) => `/assets/img/${slot}-${w}.${ext} ${w}w`).join(',\n                    ');

function pictureFor(slot) {
  const info = manifest[slot.name];
  if (!info) return null;

  const { widths, width, height } = info;
  // Fallback <img src> for anything that ignores srcset: mid-size if we have
  // one, otherwise the largest available.
  const fallbackWidth = widths.find((w) => w >= 600) ?? widths[widths.length - 1];
  const loading = slot.priority
    ? 'fetchpriority="high"'
    : 'loading="lazy"';

  const sources = FORMATS.filter((f) => f.ext !== 'jpg')
    .map(
      (f) => `          <source
            type="${f.mime}"
            sizes="${slot.sizes}"
            srcset="${srcset(slot.name, f.ext, widths)}">`
    )
    .join('\n');

  return `        <picture>
${sources}
          <img
            src="/assets/img/${slot.name}-${fallbackWidth}.jpg"
            sizes="${slot.sizes}"
            srcset="${srcset(slot.name, 'jpg', widths)}"
            width="${width}" height="${height}"
            alt="${slot.alt}"
            ${loading} decoding="async">
        </picture>`;
}

let replaced = 0;
const report = [];

for (const slot of SLOTS) {
  const start = `<!-- picture:${slot.name} -->`;
  const end = `<!-- /picture:${slot.name} -->`;
  const from = html.indexOf(start);
  const to = html.indexOf(end);

  if (from === -1 || to === -1) {
    console.error(`\nMarkers missing for "${slot.name}" in ${TARGET}.`);
    console.error(`Expected ${start} ... ${end}\n`);
    process.exit(1);
  }

  let markup = pictureFor(slot);
  if (!markup) {
    if (!slot.optional) {
      console.error(`\nNo manifest entry for "${slot.name}" — run npm run images first.\n`);
      process.exit(1);
    }
    // Leave a note where the <picture> would go, so the slot is discoverable
    // from the markup instead of only from image-slots.js.
    markup =
      `        <!-- No ${slot.name} photo yet. Add site/assets/img/src/${slot.name}.jpg\n` +
      `             (landscape, ${slot.recommendedWidth}px wide) and run npm run images. -->`;
    html = html.slice(0, from + start.length) + '\n' + markup + '\n      ' + html.slice(to);
    report.push(`  ${slot.name.padEnd(8)} no source — plain panel`);
    continue;
  }

  html = html.slice(0, from + start.length) + '\n' + markup + '\n      ' + html.slice(to);
  replaced += 1;

  const info = manifest[slot.name];
  report.push(
    `  ${slot.name.padEnd(8)} ${info.widths.length} widths ` +
      `(${info.widths.join(', ')})  from a ${info.sourceWidth}px source`
  );
}

/* ------------------------------------------------- hero preload in <head> -- */

// Preloading one fixed file was wrong for the same reason: it might not exist.
// imagesrcset/imagesizes let the browser preload exactly what it will use.
const hero = SLOTS.find((s) => s.priority);
const heroInfo = hero && manifest[hero.name];
if (heroInfo) {
  const preloadStart = '<!-- preload:hero -->';
  const preloadEnd = '<!-- /preload:hero -->';
  const from = html.indexOf(preloadStart);
  const to = html.indexOf(preloadEnd);
  if (from === -1 || to === -1) {
    console.error(`\nPreload markers missing in ${TARGET}.\n`);
    process.exit(1);
  }
  const link = `<link rel="preload" as="image" type="image/avif" fetchpriority="high"
  imagesizes="${hero.sizes}"
  imagesrcset="${srcset(hero.name, 'avif', heroInfo.widths)}">`;
  html = html.slice(0, from + preloadStart.length) + '\n' + link + '\n' + html.slice(to);
}

await writeFile(TARGET, html);

console.log(`\nWrote ${replaced} <picture> blocks into ${TARGET}:`);
console.log(report.join('\n'));

const thin = Object.entries(manifest).filter(([, i]) => i.sourceWidth < 1200);
if (thin.length) {
  console.log('\nLow-resolution sources (will look soft on big screens):');
  for (const [name, i] of thin) console.log(`  ! ${name}: ${i.sourceWidth}px wide`);
}
console.log('');
