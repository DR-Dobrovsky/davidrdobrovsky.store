#!/usr/bin/env node
/**
 * Responsive image build — run with:  npm run images
 *
 * Drop a single high-resolution photo per slot into site/assets/img/src/
 * and this produces every size and format the page needs:
 *
 *   src/hero.jpg  ->  hero-400.avif  hero-400.webp  hero-400.jpg
 *                     hero-600.avif  hero-600.webp  hero-600.jpg
 *                     ...
 *
 * Why bother instead of uploading one big JPEG? A 3 MB hero photo is the
 * difference between a page that loads on mobile data and one that does not.
 * AVIF typically lands 50-70% smaller than JPEG at the same quality, and the
 * browser picks the smallest format it understands.
 *
 * Also emits a tiny blurred placeholder (LQIP) as base64 so the layout has
 * something to show instead of a grey hole while the photo downloads.
 */

import { readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { join, parse } from 'node:path';
import sharp from 'sharp';

const SRC_DIR = 'site/assets/img/src';
const OUT_DIR = 'site/assets/img';

/** Widths in CSS pixels. Covers 1x and 2x for a ~600px display width. */
const WIDTHS = [400, 600, 800, 1200, 1600];

const FORMATS = [
  { ext: 'avif', options: { quality: 55, effort: 6 } },
  { ext: 'webp', options: { quality: 74 } },
  { ext: 'jpg', options: { quality: 80, mozjpeg: true, progressive: true } },
];

const kb = (bytes) => `${Math.round(bytes / 1024)} kB`;

async function build() {
  let sources;
  try {
    sources = (await readdir(SRC_DIR)).filter((f) => /\.(jpe?g|png|tiff?|webp)$/i.test(f));
  } catch {
    console.error(`\nNo source folder yet. Create it and add your photos:\n  ${SRC_DIR}\n`);
    console.error('Expected files (see README for the shot list):');
    console.error('  hero.jpg  in-use.jpg  device.jpg  set.jpg\n');
    process.exit(1);
  }

  if (sources.length === 0) {
    console.error(`\n${SRC_DIR} is empty — nothing to build.\n`);
    process.exit(1);
  }

  // Two files for the same slot (hero.jpg and hero.png) would both be
  // processed, and whichever ran last would win non-deterministically while
  // the other's variants lingered. Better to stop and say so.
  const bySlot = new Map();
  for (const file of sources) {
    const slot = parse(file).name;
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(file);
  }
  const clashes = [...bySlot].filter(([, files]) => files.length > 1);
  if (clashes.length) {
    console.error('\nTwo source files map to the same slot:\n');
    for (const [slot, files] of clashes) {
      console.error(`  ${slot}:  ${files.join('  ')}`);
    }
    console.error('\nKeep one file per slot and delete the other.\n');
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const placeholders = {};
  let totalIn = 0;
  let totalOut = 0;

  for (const file of sources) {
    const { name } = parse(file);
    const inPath = join(SRC_DIR, file);
    const input = sharp(inPath, { failOn: 'error' });
    const meta = await input.metadata();
    totalIn += (await stat(inPath)).size;

    console.log(`\n${file}  ${meta.width}x${meta.height}`);

    if (meta.width < 1200) {
      console.log(`  ! only ${meta.width}px wide — will look soft on retina screens`);
    }

    for (const width of WIDTHS) {
      // Never upscale: a 800px source blown up to 1600px is just a bigger blur.
      if (meta.width < width) continue;

      for (const { ext, options } of FORMATS) {
        const outPath = join(OUT_DIR, `${name}-${width}.${ext}`);
        const pipeline = sharp(inPath).resize({ width, withoutEnlargement: true });
        const buffer = await pipeline[ext === 'jpg' ? 'jpeg' : ext](options).toBuffer();
        await writeFile(outPath, buffer);
        totalOut += buffer.length;
        process.stdout.write(`  ${width}px ${ext.padEnd(4)} ${kb(buffer.length).padStart(8)}\n`);
      }
    }

    // 20px wide, heavily blurred — a few hundred bytes, inlined as a data URI.
    const lqip = await sharp(inPath).resize({ width: 20 }).blur(1.4).webp({ quality: 30 }).toBuffer();
    placeholders[name] = `data:image/webp;base64,${lqip.toString('base64')}`;
  }

  // Emitted as CSS rather than JS so the blur shows even before scripts run,
  // and with no JavaScript at all. data: URIs are already allowed by the
  // img-src directive in site/_headers.
  // Social share card. Fixed 1200x630 because that is what Facebook, WhatsApp
  // and X expect — a 4:5 portrait gets badly cropped in link previews, and the
  // preview is often the first thing anyone sees of the shop.
  const heroSrc = sources.find((f) => /^hero\./i.test(f));
  if (heroSrc) {
    const og = await sharp(join(SRC_DIR, heroSrc))
      .resize({ width: 1200, height: 630, fit: 'cover', position: 'top' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    await writeFile(join(OUT_DIR, 'og.jpg'), og);
    totalOut += og.length;
    console.log(`\nog.jpg  1200x630  ${kb(og.length)}`);
  } else {
    console.log('\n! no hero.* source, so og.jpg (link preview) was not built');
  }

  const css = `/* Generated by scripts/build-images.mjs — do not edit by hand.
   Low-quality image placeholders: a 20px blur behind each photo so the
   layout is never an empty box while the real file downloads. */

${Object.entries(placeholders)
  .map(
    ([name, uri]) =>
      `.shot--${name} {\n  background-image: url('${uri}');\n  background-size: cover;\n  background-position: center;\n}`
  )
  .join('\n\n')}
`;
  await writeFile('site/assets/css/placeholders.css', css);

  console.log(`\nsources ${kb(totalIn)} -> variants ${kb(totalOut)}`);
  console.log(`blur placeholders: ${Object.keys(placeholders).join(', ')}`);
  console.log('wrote site/assets/css/placeholders.css\n');
}

build().catch((err) => {
  console.error('\nImage build failed:', err.message, '\n');
  process.exit(1);
});
