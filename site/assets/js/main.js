/**
 * Seoulsilk — front-end logic
 * ---------------------------------------------------------------------------
 * Deliberately dependency-free. Three responsibilities:
 *   1. render the bundle cards from config.js
 *   2. hand the chosen bundle to the Worker, which creates a Stripe Checkout
 *      Session and returns a redirect URL
 *   3. small UI bits: cookie choice, language menu, current year
 *
 * No price is ever trusted from the browser. The Worker looks the price up by
 * Stripe Price ID, so a user editing the DOM cannot change what they pay.
 */

import { SHOP, BUNDLES } from './config.js';
import { bundleCard, makeMoney } from './bundle-markup.js';

/* ------------------------------------------------------------------ utils */

const $ = (sel, root = document) => root.querySelector(sel);
const money = makeMoney(SHOP.currency);

/* --------------------------------------------------------- render bundles */

/**
 * The cards are normally baked into the HTML by `npm run bundles`, so they are
 * visible without JavaScript. This only fills them in if that step was missed,
 * which keeps the page from ever showing an empty bundles section.
 */
function renderBundles() {
  const host = $('#bundles');
  if (!host) return;
  if (host.querySelector('.bundle')) return; // already server-rendered
  host.innerHTML = BUNDLES.map((b) => bundleCard(b, money)).join('');
}

/* ------------------------------------------------------------- checkout */

function showError(message) {
  const box = $('#checkoutError');
  if (!box) return;
  box.textContent = message;
  box.dataset.visible = 'true';
}

function clearError() {
  const box = $('#checkoutError');
  if (box) box.dataset.visible = 'false';
}

async function startCheckout(bundleId, button) {
  const bundle = BUNDLES.find((b) => b.id === bundleId);
  if (!bundle) return;

  // Guard against going live with unconfigured Stripe Price IDs.
  if (bundle.stripePrice.includes('REPLACE_ME')) {
    showError(
      'Checkout is not connected yet. Add your Stripe Price IDs in assets/js/config.js.'
    );
    return;
  }

  clearError();
  button.dataset.loading = 'true';
  button.disabled = true;

  try {
    const res = await fetch(SHOP.checkoutEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceId: bundle.stripePrice,
        bundleId: bundle.id,
      }),
    });

    if (!res.ok) throw new Error(`Checkout responded ${res.status}`);

    const { url } = await res.json();
    if (!url) throw new Error('No redirect URL returned');

    window.location.assign(url);
  } catch (err) {
    console.error('[checkout]', err);
    showError(
      'We could not open the payment page. Please try again, or email us and we will take the order manually.'
    );
    button.dataset.loading = 'false';
    button.disabled = false;
  }
}

function wireCheckout() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-buy]');
    if (!button) return;
    startCheckout(button.dataset.buy, button);
  });
}

/* -------------------------------------------------------------- cookies */

const COOKIE_KEY = 'seoulsilk.consent';

function wireCookieBar() {
  const bar = $('#cookieBar');
  if (!bar) return;

  let stored = null;
  try {
    stored = localStorage.getItem(COOKIE_KEY);
  } catch {
    /* private mode — just show the bar, do not crash */
  }

  if (!stored) bar.dataset.visible = 'true';

  bar.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-cookie]')?.dataset.cookie;
    if (!choice) return;
    try {
      localStorage.setItem(COOKIE_KEY, choice);
    } catch {
      /* ignore */
    }
    bar.dataset.visible = 'false';
    // Only load analytics/ads scripts here, and only when choice === 'all'.
  });
}

/* ------------------------------------------------------------- language */

function wireLanguage() {
  const btn = $('#langBtn');
  const menu = $('#langMenu');
  if (!btn || !menu) return;

  const close = () => {
    menu.dataset.open = 'false';
    btn.setAttribute('aria-expanded', 'false');
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.dataset.open === 'true';
    menu.dataset.open = String(!open);
    btn.setAttribute('aria-expanded', String(!open));
  });

  menu.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-lang]');
    if (!choice) return;
    const lang = choice.dataset.lang;

    // Translations are not built yet. English is served for every locale;
    // when /nl/, /fr/, /de/ exist, redirect there instead of this no-op.
    $('#langCurrent').textContent = lang.toUpperCase();
    menu.querySelectorAll('[data-lang]').forEach((b) => {
      b.setAttribute('aria-current', String(b.dataset.lang === lang));
    });
    document.documentElement.lang = lang;
    close();
  });

  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

/* ---------------------------------------------------------- margin helper */

/**
 * Logs unit economics to the console so pricing decisions stay honest.
 * Ad cost per purchase is the number that usually kills a one-product store,
 * so it is shown explicitly rather than hidden in a spreadsheet.
 */
function logMargins() {
  const ASSUMED_SHIPPING = 6;
  const rows = BUNDLES.map((b) => {
    const stripeFee = b.price * 0.015 + 0.25;
    const gross = b.price - b.costPrice - ASSUMED_SHIPPING - stripeFee;
    return {
      bundle: b.name,
      sell: money(b.price),
      cost: money(b.costPrice),
      'ship+fees': money(ASSUMED_SHIPPING + stripeFee),
      margin: money(gross),
      'margin %': `${Math.round((gross / b.price) * 100)}%`,
      'break-even CPA': money(gross),
    };
  });
  console.groupCollapsed('%cSeoulsilk — unit economics', 'font-weight:bold');
  console.table(rows);
  console.info(
    'Break-even CPA = the most you can pay per purchase in ads before losing money.'
  );
  console.groupEnd();
}

/* ------------------------------------------------------------------ init */

function init() {
  renderBundles();
  wireCheckout();
  wireCookieBar();
  wireLanguage();

  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  logMargins();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
