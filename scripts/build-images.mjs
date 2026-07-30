#!/usr/bin/env node
/**
 * Responsive image build — run with:  npm run images
 *
 * Drop one high-resolution photo per slot into site/assets/img/src/ and this
 * produces every size and format the page needs, then build-picture.mjs writes
 * markup that matches exactly what was produced.
 *
 * Two things it is careful about, both learned the hard way:
 *
 *   - It deletes a slot's existing variants before regenerating. Without that,
 *     replacing a 1600px photo with a 600px one left the 800/1200/1600 files
 *     behind, and the page kept serving the previous image at large sizes while
 *     showing the new one on phones.
 *
 *   - It never upscales, and records which widths really exist, so the markup
 *     can only reference files that are there.
 */

import { readdir, mkdir, writeFile, stat, unlink } from 'node:fs/promises';
import { join, parse } from 'node:path';
import sharp from 'sharp';
import { SLOTS, WIDTHS, FORMATS } from './image-slots.js';

const SRC_DIR = 'site/assets/img/src';
const OUT_DIR = 'site/assets/img';
const MANIFEST = join(OUT_DIR, 'manifest.json');

const kb = (bytes) => `${Math.round(bytes / 1024)} kB`;
const isImage = (f) => /\.(jpe?g|png|tiff?|webp|avif)$/i.test(f);

async function build() {
  let entries;
  try {
    entries = (await readdir(SRC_DIR)).filter(isImage);
  } catch {
    console.error(`\nNo source folder. Create it and add your photos:\n  ${SRC_DIR}\n`);
    process.exit(1);
  }

  if (entries.length === 0) {
    console.error(`\n${SRC_DIR} holds no images — nothing to build.\n`);
    process.exit(1);
  }

  // One file per slot. Two (hero.jpg and hero.webp) would both build into the
  // same output names, last one winning, with no way to tell which.
  const bySlot = new Map();
  for (const file of entries) {
    const slot = parse(file).name;
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), file]);
  }
  const clashes = [...bySlot].filter(([, files]) => files.length > 1);
  if (clashes.length) {
    console.error('\nTwo source files map to the same slot:\n');
    for (const [slot, files] of clashes) console.error(`  ${slot}:  ${files.join('  ')}`);
    console.error('\nKeep one file per slot and delete the other.\n');
    process.exit(1);
  }

  const known = new Set(SLOTS.map((s) => s.name));
  const unknown = [...bySlot.keys()].filter((s) => !known.has(s));
  if (unknown.length) {
    console.error(`\nUnrecognised slot name(s): ${unknown.join(', ')}`);
    console.error(`Expected one of: ${[...known].join(', ')}`);
    console.error('Rename the file, or add the slot to scripts/image-slots.js\n');
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const existing = await readdir(OUT_DIR);
  const manifest = {};
  const placeholders = {};
  const warnings = [];
  let totalIn = 0;
  let totalOut = 0;

  for (const slot of SLOTS) {
    const file = bySlot.get(slot.name)?.[0];
    if (!file) {
      warnings.push(`no source for "${slot.name}" — the page expects one`);
      continue;
    }

    const inPath = join(SRC_DIR, file);
    const meta = await sharp(inPath).metadata();
    totalIn += (await stat(inPath)).size;

    console.log(`\n${file}  ${meta.width}x${meta.height}`);

    if (meta.width < slot.recommendedWidth) {
      warnings.push(
        `"${slot.name}" is ${meta.width}px wide; ${slot.recommendedWidth}px recommended — ` +
          `it will look soft on large or high-density screens`
      );
    }

    // Clear this slot's old variants so nothing can survive a resolution drop.
    const stale = existing.filter((f) =>
      new RegExp(`^${slot.name}-\\d+\\.(avif|webp|jpg)$`).test(f)
    );
    for (const f of stale) await unlink(join(OUT_DIR, f));
    if (stale.length) console.log(`  cleared ${stale.length} previous file(s)`);

    const widths = WIDTHS.filter((w) => w <= meta.width);
    if (widths.length === 0) widths.push(meta.width); // tiny source: emit it once

    for (const width of widths) {
      for (const { ext, options } of FORMATS) {
        const buffer = await sharp(inPath)
          .resize({ width, withoutEnlargement: true })
          [ext === 'jpg' ? 'jpeg' : ext](options)
          .toBuffer();
        await writeFile(join(OUT_DIR, `${slot.name}-${width}.${ext}`), buffer);
        totalOut += buffer.length;
        process.stdout.write(`  ${String(width).padStart(4)}px ${ext.padEnd(4)} ${kb(buffer.length).padStart(8)}\n`);
      }
    }

    const largest = Math.max(...widths);
    manifest[slot.name] = {
      widths,
      // Intrinsic size of the largest variant, used for width/height in the
      // markup so the browser can reserve the right box before loading.
      width: largest,
      height: Math.round((meta.height / meta.width) * largest),
      sourceWidth: meta.width,
    };

    const lqip = await sharp(inPath).resize({ width: 20 }).blur(1.4).webp({ quality: 30 }).toBuffer();
    placeholders[slot.name] = `data:image/webp;base64,${lqip.toString('base64')}`;
  }

  // Social share card: fixed 1200x630, since a 4:5 portrait is badly cropped in
  // link previews and that preview is often the first thing anyone sees.
  const heroFile = bySlot.get('hero')?.[0];
  if (heroFile) {
    const og = await sharp(join(SRC_DIR, heroFile))
      .resize({ width: 1200, height: 630, fit: 'cover', position: 'top' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    await writeFile(join(OUT_DIR, 'og.jpg'), og);
    totalOut += og.length;
    console.log(`\nog.jpg  1200x630  ${kb(og.length)}`);
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

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
  console.log('wrote manifest.json and placeholders.css');

  if (warnings.length) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  ! ${w}`);
  }
  console.log('\nNext: npm run picture   (writes the markup to match)\n');
}

build().catch((err) => {
  console.error('\nImage build failed:', err.message, '\n');
  process.exit(1);
});
