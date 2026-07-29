/**
 * Smoke test — run with:  node tests/smoke.mjs
 *
 * Stubs just enough of the DOM to prove, without a browser, that:
 *   - all three bundle cards render with the right prices and badges
 *   - checkout refuses to run while Stripe Price IDs are placeholders
 *   - the cookie bar appears on a first visit
 *
 * Kept dependency-free on purpose: no jsdom, no test runner to install.
 */

const listeners = {};
const store = {};

function makeEl(id) {
  return {
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
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
  };
}

const els = {
  '#bundles': makeEl('bundles'),
  '#checkoutError': makeEl('checkoutError'),
  '#cookieBar': makeEl('cookieBar'),
  '#langBtn': makeEl('langBtn'),
  '#langMenu': makeEl('langMenu'),
  '#year': makeEl('year'),
  '#langCurrent': makeEl('langCurrent'),
};

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

await import('../site/assets/js/main.js');

console.error = realError;

const html = els['#bundles'].innerHTML;
const euro = '\u20AC';

const checks = [
  ['three bundle cards render', (html.match(/class="bundle"/g) || []).length === 3],
  ['featured card is flagged', html.includes('data-featured="true"')],
  ['badge text present', html.includes('Most complete')],
  [`device price ${euro}139`, html.includes(`${euro}139`)],
  [`ritual price ${euro}199`, html.includes(`${euro}199`)],
  [`refill price ${euro}34`, html.includes(`${euro}34`)],
  [`compare-at price ${euro}246`, html.includes(`${euro}246`)],
  ['saving percentage computed', /Save 1[89]%/.test(html)],
  ['three buy buttons', (html.match(/data-buy="/g) || []).length === 3],
  ['includes lists populated', (html.match(/<li>/g) || []).length >= 10],
  ['cookie bar visible on first visit', els['#cookieBar'].dataset.visible === 'true'],
  ['current year injected', String(els['#year'].textContent).length === 4],
  ['no console errors during init', consoleErrors.length === 0],
];

// The important guard: with placeholder Price IDs, clicking must not reach Stripe.
const docClick = (listeners['doc:click'] ?? [])[0];
if (docClick) {
  const fakeButton = { dataset: { buy: 'device', loading: 'false' }, disabled: false };
  docClick({
    target: { closest: (sel) => (sel === '[data-buy]' ? fakeButton : null) },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));

  checks.push([
    'checkout blocked while Stripe unconfigured',
    els['#checkoutError'].dataset.visible === 'true' &&
      /Stripe Price IDs/.test(els['#checkoutError'].textContent),
  ]);
  checks.push(['no redirect attempted', globalThis.__redirect === undefined]);
} else {
  checks.push(['click handler registered', false]);
}

let failed = 0;
for (const [label, passed] of checks) {
  if (!passed) failed += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
}

console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
