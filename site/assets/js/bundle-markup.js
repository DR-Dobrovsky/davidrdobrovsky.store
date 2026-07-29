/**
 * Bundle card markup — shared by the browser and the build script.
 *
 * scripts/build-bundles.mjs uses this to bake the cards into index.html, so
 * prices are in the served HTML rather than appearing only once JavaScript has
 * run. main.js uses the same function as a fallback. One definition, so the
 * static and dynamic versions cannot drift apart.
 */

const CHECK_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

export function makeMoney(currency) {
  const format = new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return (amount) => format.format(amount);
}

export function bundleCard(bundle, money) {
  const featured = bundle.badge ? 'true' : 'false';
  const saving =
    bundle.compareAt && bundle.compareAt > bundle.price
      ? Math.round(100 - (bundle.price / bundle.compareAt) * 100)
      : null;

  return `    <article class="bundle" data-featured="${featured}">
      ${bundle.badge ? `<span class="bundle__badge">${bundle.badge}</span>` : ''}
      <h3 class="bundle__name">${bundle.name}</h3>
      <p class="bundle__tagline">${bundle.tagline}</p>

      <p class="bundle__price">
        <span class="bundle__amount">${money(bundle.price)}</span>
        ${bundle.compareAt ? `<span class="bundle__compare">${money(bundle.compareAt)}</span>` : ''}
        ${saving ? `<span class="bundle__save">Save ${saving}%</span>` : ''}
      </p>

      <ul class="bundle__includes">
${bundle.includes.map((item) => `        <li>${CHECK_ICON}<span>${item}</span></li>`).join('\n')}
      </ul>

      <button class="btn btn--block${bundle.badge ? '' : ' btn--ghost'}" data-buy="${bundle.id}">
        <span class="btn__label">Order &mdash; ${money(bundle.price)}</span>
        <span class="btn__spinner" aria-hidden="true"></span>
      </button>

      <p class="bundle__foot">Incl. VAT &middot; 14-day returns</p>
    </article>`;
}
