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
 * @param {boolean} opts.preRendered whether #bundles already holds cards,
 *   i.e. whether `npm run bundles` has been run — the production case.
 */
async function loadApp({ preRendered = false, cacheKey = '1' } = {}) {
  const listeners = {};
  const store = {};

  const makeEl = (id) => ({
    id,
    innerHTML: '',
    textContent: '',
    dataset: {},
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
    'bundles',
    'checkoutError',
    'cookieBar',
    'langBtn',
    'langMenu',
    'year',
    'langCurrent',
  ]) {
    els[`#${id}`] = makeEl(id);
  }

  if (preRendered) els['#bundles'].innerHTML = '<article class="bundle">baked</article>';

  globalThis.document = {
    readyState: 'complete',
    documentElement: { lang: 'en' },
    querySelector: (sel) => els[sel] ?? null,
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
  globalThis.window = {
    location: {
      assign(url) {
        globalThis.__redirect = url;
      },
    },
  };
  globalThis.fetch = async () => {
    throw new Error('network disabled in test');
  };

  const consoleErrors = [];
  const realError = console.error;
  console.error = (...args) => consoleErrors.push(args.join(' '));

  // Cache-busting query so the module re-runs its init for each scenario.
  await import(`../site/assets/js/main.js?v=${cacheKey}`);

  console.error = realError;
  return { els, listeners, consoleErrors };
}

/* ------------------------------- scenario: cards not baked in (fallback) -- */

const fallback = await loadApp({ preRendered: false, cacheKey: 'fallback' });
const html = fallback.els['#bundles'].innerHTML;
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
  baked.els['#bundles'].innerHTML === '<article class="bundle">baked</article>'
);
check(
  'checkout is still wired when cards were baked in',
  (baked.listeners['doc:click'] ?? []).length > 0
);

/* ----------------------------------------------------------------- report */

let failed = 0;
for (const [label, passed] of results) {
  if (!passed) failed += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
}

console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
