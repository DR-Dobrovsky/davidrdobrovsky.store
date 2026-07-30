#!/usr/bin/env node
/**
 * Looping clip build — run with:  npm run clips
 *
 * Drop one short video per slot into site/assets/video/src/ (anything ffmpeg
 * reads: .mp4, .mov straight off a phone) and this produces:
 *
 *   ritual-480.webm  ritual-480.mp4   for phones
 *   ritual-720.webm  ritual-720.mp4   for everything else
 *   ritual-poster.jpg                 first frame, shown before playback
 *
 * Audio is stripped. The markup is then written from what was actually built,
 * the same rule the photos follow: nothing is referenced unless it exists.
 *
 * If there are no sources the clips section is marked hidden rather than
 * shipping an empty band across the page.
 */

import { readdir, mkdir, writeFile, stat, unlink, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, parse } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import { CLIP_SLOTS, CLIP_WIDTHS, CLIP_FORMATS, MAX_SECONDS } from './clip-slots.js';

const run = promisify(execFile);

const SRC_DIR = 'site/assets/video/src';
const OUT_DIR = 'site/assets/video';
const MANIFEST = join(OUT_DIR, 'manifest.json');
const TARGET = 'site/index.html';

const kb = (b) => `${Math.round(b / 1024)} kB`;
const isVideo = (f) => /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(f);

async function probe(path) {
  // ffprobe is not bundled with ffmpeg-static, so read what ffmpeg reports on
  // stderr. It writes there whether the command succeeds or not, so both paths
  // have to be handled — reading it only on failure returned nothing at all.
  let text = '';
  try {
    const { stderr } = await run(ffmpeg, ['-hide_banner', '-i', path, '-f', 'null', '-']);
    text = String(stderr ?? '');
  } catch (err) {
    text = String(err.stderr ?? '');
  }

  const dur = text.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const dim = text.match(/Stream #\d+:\d+[^\n]*?,\s*(\d{2,5})x(\d{2,5})/);

  return {
    seconds: dur ? +dur[1] * 3600 + +dur[2] * 60 + parseFloat(dur[3]) : null,
    width: dim ? Number(dim[1]) : null,
    height: dim ? Number(dim[2]) : null,
  };
}

async function build() {
  let sources = [];
  if (existsSync(SRC_DIR)) sources = (await readdir(SRC_DIR)).filter(isVideo);

  await mkdir(OUT_DIR, { recursive: true });

  if (sources.length === 0) {
    console.log(`\nNo clips in ${SRC_DIR} — the clips section will stay hidden.`);
    console.log('Add e.g. ritual.mp4 there and run this again.\n');
    await writeFile(MANIFEST, JSON.stringify({}, null, 2) + '\n');
    await writeMarkup({});
    return;
  }

  const bySlot = new Map();
  for (const file of sources) {
    const slot = parse(file).name;
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), file]);
  }

  const clashes = [...bySlot].filter(([, f]) => f.length > 1);
  if (clashes.length) {
    console.error('\nTwo sources map to the same clip slot:\n');
    for (const [slot, f] of clashes) console.error(`  ${slot}:  ${f.join('  ')}`);
    console.error('');
    process.exit(1);
  }

  const known = new Set(CLIP_SLOTS.map((s) => s.name));
  const unknown = [...bySlot.keys()].filter((s) => !known.has(s));
  if (unknown.length) {
    console.error(`\nUnrecognised clip name(s): ${unknown.join(', ')}`);
    console.error(`Expected one of: ${[...known].join(', ')}\n`);
    process.exit(1);
  }

  const manifest = {};
  const warnings = [];
  let totalIn = 0;
  let totalOut = 0;

  for (const slot of CLIP_SLOTS) {
    const file = bySlot.get(slot.name)?.[0];
    if (!file) continue;

    const inPath = join(SRC_DIR, file);
    totalIn += (await stat(inPath)).size;
    const info = await probe(inPath);

    console.log(
      `\n${file}  ${info.width ?? '?'}x${info.height ?? '?'}  ${info.seconds ? info.seconds.toFixed(1) + 's' : ''}`
    );

    if (info.seconds && info.seconds > MAX_SECONDS) {
      warnings.push(
        `"${slot.name}" is ${info.seconds.toFixed(1)}s — over ${MAX_SECONDS}s stops feeling like a loop ` +
          `and costs mobile data`
      );
    }

    // Clear previous outputs so a smaller re-upload cannot leave old files.
    for (const f of await readdir(OUT_DIR)) {
      if (new RegExp(`^${slot.name}-(\\d+\\.(webm|mp4)|poster\\.jpg)$`).test(f)) {
        await unlink(join(OUT_DIR, f));
      }
    }

    const widths = CLIP_WIDTHS.filter((w) => !info.width || w <= info.width);
    if (widths.length === 0) widths.push(CLIP_WIDTHS[0]);

    for (const width of widths) {
      for (const fmt of CLIP_FORMATS) {
        const out = join(OUT_DIR, `${slot.name}-${width}.${fmt.ext}`);
        await run(ffmpeg, [
          '-y', '-loglevel', 'error',
          '-i', inPath,
          // even dimensions, required by H.264
          '-vf', `scale=${width}:-2:flags=lanczos`,
          ...fmt.args,
          out,
        ]);
        const size = (await stat(out)).size;
        totalOut += size;
        console.log(`  ${String(width).padStart(4)}px ${fmt.ext.padEnd(5)} ${kb(size).padStart(8)}`);
      }
    }

    const poster = join(OUT_DIR, `${slot.name}-poster.jpg`);
    await run(ffmpeg, [
      '-y', '-loglevel', 'error',
      '-i', inPath, '-frames:v', '1',
      '-vf', `scale=${Math.max(...widths)}:-2`,
      '-q:v', '4', poster,
    ]);
    totalOut += (await stat(poster)).size;

    const largest = Math.max(...widths);
    manifest[slot.name] = {
      widths,
      width: largest,
      height: info.width && info.height ? Math.round((info.height / info.width) * largest) : null,
      seconds: info.seconds ? Number(info.seconds.toFixed(1)) : null,
    };
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  await writeMarkup(manifest);

  console.log(`\nsources ${kb(totalIn)} -> clips ${kb(totalOut)}`);
  if (warnings.length) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`  ! ${w}`);
  }
  console.log('');
}

/* --------------------------------------------------------------- markup --- */

async function writeMarkup(manifest) {
  const { readFile } = await import('node:fs/promises');
  let html = await readFile(TARGET, 'utf8');

  const start = '<!-- clips:start -->';
  const end = '<!-- clips:end -->';
  const from = html.indexOf(start);
  const to = html.indexOf(end);

  if (from === -1 || to === -1) {
    console.error(`\nMarkers ${start} ... ${end} not found in ${TARGET}.\n`);
    process.exit(1);
  }

  const present = CLIP_SLOTS.filter((s) => manifest[s.name]);

  const blocks = present
    .map((slot) => {
      const info = manifest[slot.name];
      // With one width there must be no media attribute at all: a lone
      // `media="(max-width: 600px)"` would leave desktop with no playable
      // source whatsoever.
      const single = info.widths.length === 1;
      const smallest = Math.min(...info.widths);

      const sources = CLIP_FORMATS.flatMap((fmt) =>
        info.widths
          .slice()
          .reverse()
          .map((w) => {
            const media = single
              ? ''
              : ` media="${w === smallest ? '(max-width: 600px)' : '(min-width: 601px)'}"`;
            return `            <source src="/assets/video/${slot.name}-${w}.${fmt.ext}" type="${fmt.mime}"${media}>`;
          })
      ).join('\n');

      const dims = info.height ? ` width="${info.width}" height="${info.height}"` : '';

      return `        <figure class="clip">
          <video
            class="clip__video"
            poster="/assets/video/${slot.name}-poster.jpg"${dims}
            autoplay muted loop playsinline preload="none"
            aria-label="${slot.label}">
${sources}
          </video>
          <figcaption>${slot.caption}</figcaption>
        </figure>`;
    })
    .join('\n\n');

  const body = present.length
    ? `\n${blocks}\n      `
    : `\n        <!-- No clips yet. Add a video to site/assets/video/src/ and run npm run clips. -->\n      `;

  html = html.slice(0, from + start.length) + body + html.slice(to);

  // Hide the whole section while there is nothing to show.
  html = html.replace(
    /<section class="section clips-section"[^>]*>/,
    present.length
      ? '<section class="section clips-section" id="clips">'
      : '<section class="section clips-section" id="clips" hidden>'
  );

  await writeFile(TARGET, html);
  console.log(
    present.length
      ? `\nWrote ${present.length} clip block(s) into ${TARGET}`
      : `\nClips section hidden in ${TARGET} (no sources)`
  );
}

build().catch(async (err) => {
  console.error('\nClip build failed:', err.message, '\n');
  await rm('.clip-tmp', { recursive: true, force: true }).catch(() => {});
  process.exit(1);
});
