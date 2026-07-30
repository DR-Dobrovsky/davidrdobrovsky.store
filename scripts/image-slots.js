/**
 * Image slots — the single description of every photo on the page.
 *
 * build-images.mjs generates the files; build-picture.mjs writes the <picture>
 * markup from what was actually generated. Keeping both from one definition is
 * what stops the HTML referring to files that do not exist, or to stale ones.
 */

/**
 * The hero is a carousel. `hero` is the first slide and the only required one;
 * the rest are optional, so the same markup works with one photo or four.
 *
 * They share their geometry with `hero` because they sit in the same frame —
 * build-picture.mjs copies `sizes` from the slide it is filling, so a slide
 * with a different `sizes` would make the browser pick the wrong width.
 */
const heroSlide = (n) => ({
  name: `hero-${n}`,
  optional: true,
  recommendedWidth: 1600,
  sizes: '(min-width: 900px) 46vw, 100vw',
  alt: `Moev Hair Steamer Pro, product photo ${n + 1}`,
});

export const SLOTS = [
  {
    name: 'hero',
    /** Below this the photo will look soft; the build warns but continues. */
    recommendedWidth: 1600,
    sizes: '(min-width: 900px) 46vw, 100vw',
    alt: 'Long dark hair being brushed with the Moev steamer, held at the crown',
    priority: true,
  },
  heroSlide(1),
  heroSlide(2),
  heroSlide(3),
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
 * Slides of the hero carousel, in order. The first is required; the others
 * appear as soon as a source file for them exists. One entry means the hero
 * renders as a plain photo with no carousel controls at all.
 */
export const HERO_SLIDES = ['hero', 'hero-1', 'hero-2', 'hero-3'];

/** Widths to generate, in CSS pixels. Sources smaller than a width skip it. */
export const WIDTHS = [400, 600, 800, 1200, 1600];

/** Output formats, best first — the browser takes the first it understands. */
export const FORMATS = [
  { ext: 'avif', mime: 'image/avif', options: { quality: 55, effort: 6 } },
  { ext: 'webp', mime: 'image/webp', options: { quality: 74 } },
  { ext: 'jpg', mime: 'image/jpeg', options: { quality: 80, mozjpeg: true, progressive: true } },
];
