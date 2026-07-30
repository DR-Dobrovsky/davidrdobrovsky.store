/**
 * Smoke test — run with:  node tests/smoke.mjs
 *
 * Stubs just enough of the DOM to prove, without a browser, that:
 *   - the bundle cards render with the right prices and badges
 *   - the pre-rendered cards from `npm run bundles` are never overwritten
 *   - checkout refuses to run while Stripe Price IDs are placeholders
 *   - the cookie bar appears on a first visit
 *
 * Kept dependency-free on purpose: no jsdom, no test runner to install.
 */

const results = [];
const check = (label, passed) => results.push([label, passed]);

/**
 * @param {object} opts
 * @param {boolean} opts.preRendered whether the grid already holds cards,
 *   i.e. whether `npm run bundles` has been run — the production case.
 * @param {number}  opts.clips how many looping clips are on the page.
 * @param {boolean} opts.reduceMotion whether the visitor asked for less motion.
 * @param {number}  opts.slides how many hero photos exist (0 = no carousel).
 */
async function loadApp({
  preRendered = false,
  cacheKey = '1',
  clips = 0,
  reduceMotion = false,
  slides = 0,
} = {}) {
  const listeners = {};
  const store = {};

  const makeEl = (id) => ({
    id,
    innerHTML: '',
    textContent: '',
    hidden: true,
    dataset: {},
    append() {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    addEventListener(type, fn) {
      (listeners[`${id}:${type}`] ??= []).push(fn);
    },
    // Only #bundles needs to answer this meaningfully.
    querySelector(sel) {
      if (id === 'bundles' && sel === '.bundle' && preRendered) {
        return { tagName: 'ARTICLE' };
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
  });

  const els = {};
  for (const id of [
    'checkoutError',
    'cookieBar',
    'langBtn',
    'langMenu',
    'langPicker',
    'year',
    'langCurrent',
  ]) {
    els[`#${id}`] = makeEl(id);
  }
  // The grid is selected by class, since the section owns id="bundles".
  els['.bundles'] = makeEl('bundles');

  if (preRendered) els['.bundles'].innerHTML = '<article class="bundle">baked</article>';

  /** Clips found in the document, if the scenario asks for any. */
  const clipVideos = clips
    ? Array.from({ length: clips }, () => ({
        removeAttribute() {},
        play: () => Promise.resolve(),
        pause() {},
        preload: 'none',
        controls: false,
      }))
    : [];

  /* ------------------------------------------------------ hero carousel -- */

  /** Elements the code under test creates, so we can count and click them. */
  const built = [];

  const makeCreated = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      innerHTML: '',
      textContent: '',
      href: '',
      hreflang: '',
      type: '',
      disabled: false,
      attrs: {},
      children: [],
      setAttribute(name, value) {
        this.attrs[name] = String(value);
      },
      getAttribute(name) {
        return this.attrs[name] ?? null;
      },
      addEventListener(type, fn) {
        (this.handlers ??= {})[type] = fn;
      },
      append(child) {
        this.children.push(child);
      },
      click() {
        this.handlers?.click?.();
      },
    };
    built.push(el);
    return el;
  };

  let scrollLeft = 0;
  /** Every slide the carousel has been sent to, in order. */
  const trail = [];
  const SLIDE_WIDTH = 100;
  const track = {
    clientWidth: SLIDE_WIDTH,
    get scrollLeft() {
      return scrollLeft;
    },
    addEventListener(type, fn) {
      (listeners[`track:${type}`] ??= []).push(fn);
    },
    // The real element scrolls; here we jump, then fire scroll like a browser
    // would once the smooth scroll settles.
    scrollTo({ left }) {
      scrollLeft = left;
      trail.push(Math.round(left / SLIDE_WIDTH));
      for (const fn of listeners['track:scroll'] ?? []) fn();
    },
  };

  const carousel = slides
    ? {
        dataset: { interval: '20' }, // 20ms so the test does not wait 3s
        querySelector: (sel) =>
          sel === '.carousel__track' ? track : sel === '.carousel__ui' ? { append() {} } : null,
        querySelectorAll: () => Array.from({ length: slides }, () => ({})),
        append() {},
        addEventListener(type, fn) {
          (listeners[`carousel:${type}`] ??= []).push(fn);
        },
      }
    : null;

  if (carousel) els['.carousel'] = carousel;

  globalThis.document = {
    readyState: 'complete',
    hidden: false,
    documentElement: { lang: 'en' },
    createElement: makeCreated,
    querySelector: (sel) => els[sel] ?? null,
    querySelectorAll: (sel) => (sel === '.clip__video' ? clipVideos : []),
    addEventListener(type, fn) {
      (listeners[`doc:${type}`] ??= []).push(fn);
    },
  };
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => {
      store[k] = v;
    },
  };
  const observed = [];
  globalThis.window = {
    location: {
      assign(url) {
        globalThis.__redirect = url;
      },
    },
    matchMedia: (q) => ({ matches: reduceMotion && q.includes('reduced-motion') }),
    IntersectionObserver: class {
      constructor(cb) { this.cb = cb; }
      observe(el) { observed.push(el); }
    },
  };
  globalThis.IntersectionObserver = globalThis.window.IntersectionObserver;
  globalThis.fetch = async () => {
    throw new Error('network disabled in test');
  };

  const consoleErrors = [];
  const realError = console.error;
  console.error = (...args) => consoleErrors.push(args.join(' '));

  // Cache-busting query so the module re-runs its init for each scenario.
  await import(`../site/assets/js/main.js?v=${cacheKey}`);

  console.error = realError;
  return {
    els,
    listeners,
    consoleErrors,
    clipVideos,
    observed,
    built,
    trail,
    slideAt: () => Math.round(scrollLeft / SLIDE_WIDTH),
  };
}

/** Lets a few of the carousel's 20ms ticks run. */
const ticks = (n = 3) => new Promise((resolve) => setTimeout(resolve, 20 * n + 25));

/**
 * Waits for a condition instead of for a number of ticks. Asserting on an exact
 * tick count made the first version of these checks fail on a slow machine for
 * no reason other than one extra interval having fired.
 */
async function until(predicate, timeout = 900) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}

/* ------------------------------- scenario: cards not baked in (fallback) -- */

const fallback = await loadApp({ preRendered: false, cacheKey: 'fallback' });
const html = fallback.els['.bundles'].innerHTML;
const euro = '\u20AC';

check('fallback renders three cards', (html.match(/class="bundle"/g) || []).length === 3);
check('featured card is flagged', html.includes('data-featured="true"'));
check('badge text present', html.includes('Most complete'));
check(`device price ${euro}139`, html.includes(`${euro}139`));
check(`ritual price ${euro}199`, html.includes(`${euro}199`));
check(`refill price ${euro}34`, html.includes(`${euro}34`));
check(`compare-at price ${euro}246`, html.includes(`${euro}246`));
check('saving percentage computed', /Save 1[89]%/.test(html));
check('three buy buttons', (html.match(/data-buy="/g) || []).length === 3);
check('includes lists populated', (html.match(/<li>/g) || []).length >= 10);
check('cookie bar visible on first visit', fallback.els['#cookieBar'].dataset.visible === 'true');
check('current year injected', String(fallback.els['#year'].textContent).length === 4);
check('no console errors during init', fallback.consoleErrors.length === 0);

/* -- the important guard: placeholder Stripe IDs must not reach the network - */

const docClick = (fallback.listeners['doc:click'] ?? [])[0];
if (docClick) {
  const fakeButton = { dataset: { buy: 'device', loading: 'false' }, disabled: false };
  docClick({ target: { closest: (sel) => (sel === '[data-buy]' ? fakeButton : null) } });
  await new Promise((resolve) => setTimeout(resolve, 20));

  check(
    'checkout blocked while Stripe unconfigured',
    fallback.els['#checkoutError'].dataset.visible === 'true' &&
      /Stripe Price IDs/.test(fallback.els['#checkoutError'].textContent)
  );
  check('no redirect attempted', globalThis.__redirect === undefined);
} else {
  check('click handler registered', false);
}

/* --------------- scenario: cards already baked in by npm run bundles ------ */

const baked = await loadApp({ preRendered: true, cacheKey: 'baked' });
check(
  'pre-rendered cards are left untouched',
  baked.els['.bundles'].innerHTML === '<article class="bundle">baked</article>'
);
check(
  'checkout is still wired when cards were baked in',
  (baked.listeners['doc:click'] ?? []).length > 0
);


/* ------------------------------------------------- scenario: looping clips -- */

const withClips = await loadApp({ preRendered: true, cacheKey: 'clips', clips: 2 });
check(
  'clips are observed so they only load once on screen',
  withClips.observed.length === 2
);
check(
  'clips are not forced to preload eagerly',
  withClips.clipVideos.every((v) => v.preload === 'none')
);

const reduced = await loadApp({
  preRendered: true, cacheKey: 'reduced', clips: 2, reduceMotion: true,
});
check(
  'reduced motion: nothing is observed for autoplay',
  reduced.observed.length === 0
);
check(
  'reduced motion: controls are offered instead',
  reduced.clipVideos.every((v) => v.controls === true)
);

/* ------------------------------------------------ scenario: hero carousel -- */

/* One photo is not a carousel. Nothing should be built and nothing should move,
   because the site ships today with exactly one hero photo. */
const single = await loadApp({ preRendered: true, cacheKey: 'one-slide', slides: 1 });
check('one hero photo builds no controls', single.built.length === 0);
await ticks(2);
check('one hero photo never advances', single.slideAt() === 0);

/* Four photos: dots per slide, two arrows, one pause button. */
const many = await loadApp({ preRendered: true, cacheKey: 'four-slides', slides: 4 });
const dots = many.built.filter((el) => el.className === 'carousel__dot');
const arrows = many.built.filter((el) => el.className.includes('carousel__arrow'));
const toggle = many.built.find((el) => el.className === 'carousel__toggle');

check('one dot per hero photo', dots.length === 4);
check('two arrows built', arrows.length === 2);
check('a pause button is offered for the autoplay', Boolean(toggle));
check(
  'dots are labelled with their position',
  dots[1]?.getAttribute('aria-label') === 'Photo 2 of 4'
);
check('the first dot is marked as current', dots[0]?.getAttribute('aria-current') === 'true');
check('the back arrow is disabled on the first photo', arrows[0]?.disabled === true);

/* It advances by itself, and turns round at the end rather than wrapping — a
   smooth scroll from the last photo back to the first reads as the page
   rewinding itself every few seconds. The trail is checked rather than the
   final position, because "never jumps more than one slide" is the actual
   requirement and a snapshot of where it ended up cannot show that. */
check('autoplay advances on its own', await until(() => many.slideAt() > 0));
check('autoplay reaches the last photo', await until(() => many.slideAt() === 3));
check('autoplay turns round at the end', await until(() => many.slideAt() === 2));
check(
  'autoplay never skips: no rewind from the last photo to the first',
  many.trail.every((pos, i) => i === 0 || Math.abs(pos - many.trail[i - 1]) === 1),
  );

/* The pause button has to actually stop it — an animation that starts on its
   own and cannot be stopped is an accessibility failure, not a preference. */
toggle.click();
check('pause is announced as pressed', toggle.getAttribute('aria-pressed') === 'true');
const parked = many.slideAt();
await ticks(3);
check('paused means paused', many.slideAt() === parked);

toggle.click();
check('pressing again resumes', toggle.getAttribute('aria-pressed') === 'false');
await ticks(1);
check('and it moves again after resuming', many.slideAt() !== parked);

/* Reduced motion: the photos are all still reachable, they just never move on
   their own. */
const still = await loadApp({
  preRendered: true, cacheKey: 'no-motion', slides: 4, reduceMotion: true,
});
check(
  'reduced motion: controls are still built',
  still.built.filter((el) => el.className === 'carousel__dot').length === 4
);
await ticks(3);
check('reduced motion: nothing autoplays', still.slideAt() === 0);

/* ------------------------------------------- scenario: language picker ----- */

/* config.js lists one locale, so the control must stay hidden. It used to offer
   four languages and change nothing but html[lang]. */
const lang = await loadApp({ preRendered: true, cacheKey: 'lang' });
check(
  'language picker stays hidden while only one locale exists',
  lang.els['#langPicker'].hidden !== false
);
check(
  'no language links are built for a single locale',
  lang.built.filter((el) => el.tagName === 'A').length === 0
);

/* ----------------------------------------------------------------- report */

let failed = 0;
for (const [label, passed] of results) {
  if (!passed) failed += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
}

console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
