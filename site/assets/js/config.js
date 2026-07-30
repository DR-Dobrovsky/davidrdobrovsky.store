/**
 * SHOP CONFIGURATION
 * ------------------------------------------------------------------
 * This is the ONLY file you need to edit to change prices, products
 * or the Stripe connection. No other file contains pricing logic.
 *
 * Cost basis (wholesale, Korean Skincare Supply, NL):
 *   Moev Hair Steamer Pro ......... EUR 76.00  (confirmed at checkout)
 *   Growus Treatment EX ........... EUR  ?     (awaiting account approval)
 *   Growus No-Wash Treatment EX ... EUR  ?
 *   Growus Scalp Scaling Ampoule .. EUR  ?
 *
 * Update `costPrice` below once the supplier prices are confirmed —
 * the margin helper in main.js will then log real numbers to the
 * console so you can sanity-check profitability per order.
 */

export const SHOP = {
  brand: 'Seoulsilk',
  currency: 'EUR',
  currencySymbol: '\u20AC',

  // Cloudflare Worker endpoint that creates the Stripe Checkout Session.
  // Local dev: http://127.0.0.1:8787/api/checkout
  checkoutEndpoint: '/api/checkout',

  // Free shipping threshold, in whole euros. Set to null to disable.
  freeShippingFrom: 100,
};

/**
 * LANGUAGES
 * ------------------------------------------------------------------
 * Only list a language once its pages actually exist at that path.
 *
 * The picker in the header is built from this list and stays hidden
 * while there is only one entry, so it can never offer a language
 * that the shop does not have. Adding a translation is then two
 * steps: create the pages, add the line here.
 *
 * Belgium first when the time comes: nl, then fr.
 */
export const LOCALES = [
  { code: 'en', label: 'English', path: '/' },
  // { code: 'nl', label: 'Nederlands', path: '/nl/' },
  // { code: 'fr', label: 'Fran\u00e7ais',  path: '/fr/' },
  // { code: 'de', label: 'Deutsch',    path: '/de/' },
];

/**
 * Bundles shown on the page.
 *
 * id          — internal, also sent to Stripe as metadata
 * stripePrice — Stripe Price ID (price_...). Create these in the Stripe
 *               dashboard, then paste them here. REQUIRED before go-live.
 * price       — display price in EUR (must match the Stripe Price!)
 * compareAt   — optional "was" price for the discount badge
 * costPrice   — your wholesale cost, used only for the margin helper
 */
export const BUNDLES = [
  {
    id: 'device',
    name: 'The Device',
    tagline: 'Start the ritual',
    stripePrice: 'price_REPLACE_ME_DEVICE',
    price: 139,
    compareAt: null,
    costPrice: 76,
    includes: [
      'Moev Hair Steamer Pro',
      '2 argan &amp; caffeine oil cartridges',
      'USB-C charging cable',
      'Illustrated ritual guide',
    ],
    badge: null,
  },
  {
    id: 'ritual',
    name: 'The Rescue Ritual',
    tagline: 'Device + full Growus repair set',
    stripePrice: 'price_REPLACE_ME_RITUAL',
    price: 199,
    compareAt: 246,
    costPrice: 106,
    includes: [
      'Moev Hair Steamer Pro',
      '2 argan &amp; caffeine oil cartridges',
      'Growus Damage Therapy Treatment EX &mdash; 220 ml',
      'Growus Damage Therapy No-Wash Treatment EX &mdash; 250 ml',
      'Growus Damage Therapy Scalp Scaling Ampoule &mdash; 50 ml',
    ],
    badge: 'Most complete',
  },
  {
    id: 'refill',
    name: 'The Refill',
    tagline: 'For the ritual you already own',
    stripePrice: 'price_REPLACE_ME_REFILL',
    price: 34,
    compareAt: null,
    costPrice: 14,
    includes: [
      '4 argan &amp; caffeine oil cartridges',
      'Approx. 3 months of weekly use',
    ],
    badge: null,
  },
];
