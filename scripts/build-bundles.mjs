#!/usr/bin/env node
/**
 * Bake the bundle cards into index.html — run with:  npm run bundles
 *
 * Why: the cards used to be built in the browser from config.js, so the served
 * HTML contained no product names, no prices and no buy button. That matters
 * for three separate reasons on a shop page:
 *
 *   - if a script fails, is blocked, or is slow on mobile data, the visitor
 *     sees a page with nothing to buy
 *   - search engines and link-preview crawlers see no prices
 *   - the first paint is missing the single most important element
 *
 * config.js stays the only place prices are edited. This regenerates the
 * markup from it, between the markers in index.html. Run it after any price
 * change, and commit the result.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { SHOP, BUNDLES } from '../site/assets/js/config.js';
import { bundleCard, makeMoney } from '../site/assets/js/bundle-markup.js';

const TARGET = 'site/index.html';
const START = '<!-- bundles:start -->';
const END = '<!-- bundles:end -->';

const money = makeMoney(SHOP.currency);
const cards = BUNDLES.map((b) => bundleCard(b, money)).join('\n\n');

let html = await readFile(TARGET, 'utf8');

const from = html.indexOf(START);
const to = html.indexOf(END);

if (from === -1 || to === -1) {
  console.error(`\nMarkers not found in ${TARGET}.`);
  console.error(`Expected ${START} ... ${END} inside the bundles container.\n`);
  process.exit(1);
}

const before = html.slice(0, from + START.length);
const after = html.slice(to);
html = `${before}\n${cards}\n      ${after}`;

await writeFile(TARGET, html);

console.log(`\nBaked ${BUNDLES.length} bundle cards into ${TARGET}:`);
for (const b of BUNDLES) {
  const flag = b.stripePrice.includes('REPLACE_ME') ? '  (Stripe price not set)' : '';
  console.log(`  ${b.name.padEnd(20)} ${money(b.price)}${flag}`);
}
console.log('');
