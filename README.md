# Seoulsilk — one-product store

A single-product shop for the **Moev Hair Steamer Pro** (Korean cordless hair
steamer) plus **Growus Damage Therapy** bundles. Static HTML with Stripe
Checkout — no Shopify, no monthly fee, no build step.

```
wrangler.toml         root deployment: site + API in one Worker
site/                 the website, bound as static assets
  index.html          the whole sales page
  thanks.html         post-payment page
  assets/css|js|img
  legal/              terms, privacy, shipping & returns, legal notice
  _headers            security + caching headers
worker/src/index.js   Stripe Checkout Sessions + webhook
tests/                38 checks, no install and no browser needed
```

Running costs: **€0/month** hosting, Stripe ~1.5% + €0.25 per card payment,
plus 0.5% if you enable Stripe Tax.

---

## 1. Rename the brand

`Seoulsilk` is a placeholder. Find and replace across the repo, then change
`brand` in `site/assets/js/config.js`:

```bash
grep -rl 'Seoulsilk' . --exclude-dir=.git | xargs sed -i 's/Seoulsilk/YourBrand/g'
grep -rl 'seoulsilk.store' . --exclude-dir=.git | xargs sed -i 's/seoulsilk.store/yourdomain.com/g'
```

Then search for `[COMPANY_NAME]`, `hello@seoulsilk.store` and every other
`[bracketed]` placeholder in `site/legal/` and fill them in.

## 2. Prices and bundles

Everything lives in **`site/assets/js/config.js`** — the only file with pricing
logic. Current placeholders:

| Bundle | Sells for | Wholesale cost | Status |
|---|---|---|---|
| The Device | €139 | €76 (confirmed) | ready |
| The Rescue Ritual | €199 | ~€106 (estimate) | needs supplier prices |
| The Refill | €34 | ~€14 (estimate) | needs supplier prices |

Open the site and check the browser console — a table prints your margin and
your **break-even CPA** (the most you can pay per sale in ads before losing
money). Update `costPrice` as soon as Korean Skincare Supply approves the
account and shows real prices.

## 3. Stripe

1. Create a Stripe account (Belgium) and **activate Bancontact** — it is the
   dominant method locally.
2. Create one **Product + Price** per bundle. Copy each `price_...` ID into
   `config.js` → `stripePrice`. Checkout refuses to run while the
   `REPLACE_ME` placeholders are there.
3. Turn on **Stripe Tax** so EU VAT is calculated per country. This is what
   makes OSS reporting manageable later.
4. Optional: create a **Shipping Rate** and put its ID in `wrangler.toml`
   as `SHIPPING_RATE_ID`.
5. Add your terms URL in Stripe → Settings → Checkout, so customers accept
   them during payment.

## 4. Deploy — one Worker serves everything

The root `wrangler.toml` binds `site/` as static assets to the same Worker that
handles the API. `/api/*` goes to the script, everything else is served as a
file. One deployment, one domain, and no CORS boundary in between.

```bash
npm install -D wrangler

# secrets — never in git
npx wrangler secret put STRIPE_SECRET_KEY      # sk_test_... while testing
npx wrangler secret put STRIPE_WEBHOOK_SECRET  # whsec_...

npx wrangler deploy
npx wrangler tail --format pretty              # watch orders arrive
```

Local development, site and API together:

```bash
cp worker/.dev.vars.example .dev.vars
npx wrangler dev                               # http://127.0.0.1:8787
```

## 5. Attach the domain

Dashboard → **Workers & Pages → seoulsilk → Domains → Custom Domains**, then add
**both** `seoulsilk.store` and `www.seoulsilk.store`.

Two traps worth knowing:

- A wildcard route such as `*.seoulsilk.store/*` does **not** match the apex
  domain. Add Custom Domains rather than relying on a route.
- When a zone is imported from another registrar, Cloudflare copies the old
  parking `A` record. Delete it in **DNS**, or the domain keeps resolving to the
  previous host. The Custom Domain creates the right record itself.

Then in Stripe → Developers → Webhooks add
`https://seoulsilk.store/api/webhook` for **`checkout.session.completed`**.

## 6. Fulfilment (manual, by design)

There is no supplier API, so orders are placed by hand. That is fine at test
volume and it means you see every order.

```bash
npx wrangler tail --format pretty
```

Every paid order prints a single `ORDER` line with the bundle, customer name,
email, phone and full delivery address. Copy that into the supplier's checkout.

Watch the box the supplier ships in: ask them explicitly for **blind shipping**
(no supplier invoice, no supplier branding), otherwise your customer learns
where you buy.

---

## Before the first real sale

- [ ] Supplier account approved, real wholesale prices in `config.js`
- [ ] **CE Declaration of Conformity** for the steamer, on file — it is an
      electrical device and you are placing it on the EU market
- [ ] Blind shipping confirmed in writing
- [ ] Company registered (KBO/BCE), VAT sorted, OSS if selling across the EU
- [ ] Every `[placeholder]` in `site/legal/` replaced
- [ ] Terms reviewed by someone who knows Belgian consumer law
- [ ] Real product photography in `site/assets/img/`
- [ ] Test payment end to end with a Stripe test card
- [ ] Reviews section replaced with genuine reviews, or removed —
      never invent them

## Claims: what you may and may not say

The product is a **cosmetic device**, not a medicine. Safe: *repair,
condition, moisture, shine, smoothness, scalp comfort, helps absorption.*
Not allowed: *treats hair loss, regrows hair, cures dandruff, stimulates
follicles.* Medical claims turn the product into a medical device under EU
law, which is a far heavier regime than cosmetics.

## Local preview

```bash
cd site && python3 -m http.server 8080
```

`config.js` is an ES module, so open it over `http://localhost:8080` —
`file://` will not work.
