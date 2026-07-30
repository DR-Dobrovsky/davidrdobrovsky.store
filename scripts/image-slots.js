/**
 * Image slots — the single description of every photo on the page.
 *
 * build-images.mjs generates the files; build-picture.mjs writes the <picture>
 * markup from what was actually generated. Keeping both from one definition is
 * what stops the HTML referring to files that do not exist, or to stale ones.
 */

export const SLOTS = [
  {
    name: 'hero',
    /** Below this the photo will look soft; the build warns but continues. */
    recommendedWidth: 1600,
    sizes: '(min-width: 900px) 46vw, 100vw',
    alt: 'Long dark hair being brushed with the Moev steamer, held at the crown',
    priority: true,
  },
  {
    /**
     * Wide statement band under the hero. Optional: while there is no wide
     * photo, the band renders as a plain tinted panel with the same copy over
     * it, which is a deliberate-looking design rather than an empty frame.
     * Drop a landscape photo in as band.jpg and it appears behind the text.
     */
    name: 'band',
    optional: true,
    recommendedWidth: 2000,
    sizes: '100vw',
    alt: 'Damp hair being steamed, seen from behind',
  },
  {
    name: 'in-use',
    recommendedWidth: 1200,
    sizes: '(min-width: 760px) 30vw, 78vw',
    alt: 'Close-up of the brush head against the scalp',
  },
  {
    name: 'device',
    recommendedWidth: 1200,
    sizes: '(min-width: 760px) 30vw, 78vw',
    alt: 'The Moev Hair Steamer Pro seen at an angle',
  },
  {
    name: 'set',
    recommendedWidth: 1200,
    sizes: '(min-width: 760px) 30vw, 78vw',
    alt: 'The full Rescue Ritual: steamer with the three Growus treatments',
  },
];

/**
 * Widths to generate, in CSS pixels. Sources smaller than a width skip it, so
 * the 2000px step only ever appears for the full-bleed band, which is the one
 * image asked to cover a whole desktop viewport.
 */
export const WIDTHS = [400, 600, 800, 1200, 1600, 2000];

/** Output formats, best first — the browser takes the first it understands. */
export const FORMATS = [
  { ext: 'avif', mime: 'image/avif', options: { quality: 55, effort: 6 } },
  { ext: 'webp', mime: 'image/webp', options: { quality: 74 } },
  { ext: 'jpg', mime: 'image/jpeg', options: { quality: 80, mozjpeg: true, progressive: true } },
];
