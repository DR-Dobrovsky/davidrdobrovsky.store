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

## 1. Still to fill in

The brand is **Seoulsilk** and the domain is **seoulsilk.store** — both are
real, no renaming needed.

What is still placeholder text:

- `[COMPANY_NAME]`, `[KBO/BCE]`, `[BE0123.456.789]` and the address in
  `site/legal/` — required by Belgian and EU e-commerce law before selling
- `hello@seoulsilk.store` — set up the mailbox or change the address
- product photography (the page ships neutral gradient stand-ins — see
  section 2)
- the reviews section, which is clearly marked and must be replaced with
  genuine reviews or removed

Find everything outstanding:

```bash
grep -rn '\[COMPANY_NAME\]\|\[KBO\|REPLACE_ME' . --exclude-dir=.git
```

## 2. Photos

**Important: the files in `site/assets/img/src/` are sources, not the images the
site serves.** The browser loads generated variants — `hero-400.avif`,
`hero-800.jpg` and thirteen more per slot. Replacing a source on its own changes
nothing until those variants are rebuilt.

### From the browser, no tools needed

1. Go to `site/assets/img/src/` on GitHub
2. **Add file → Upload files**, and upload your photo named exactly
   `hero.jpg`, `in-use.jpg`, `device.jpg` or `set.jpg`
3. Commit

The **Build images** workflow then regenerates every size and format, the
`og.jpg` link-preview card and the blurred placeholders, and commits them back.
Watch it under the repository's **Actions** tab; it takes about a minute. The
deploy picks the new files up on its own.

You can also trigger it by hand: **Actions → Build images → Run workflow**.

The workflow also regenerates `index.html`, because the `<picture>` markup is
built from the widths that were actually produced — never from a fixed list.
That is what stops the page asking for a variant that does not exist.

### Locally, if you have Node

```bash
npm install
npm run images        # variants + manifest + placeholders, then the markup
git commit -am "New photos"
```

### Shot list

| File | Ratio | Min width | What it shows |
|---|---|---|---|
| `hero.jpg` | 4:5 | 1600 px | A woman using the device on long hair. The most important image on the page. |
| `in-use.jpg` | 4:5 | 1200 px | Close-up of the brush head against the scalp. |
| `device.jpg` | 4:5 | 1200 px | The device alone, angled, soft shadow. |
| `set.jpg` | 4:5 | 1200 px | The full Rescue Ritual, device plus the three bottles. |

Keep one file per slot — `hero.jpg` **and** `hero.png` together is rejected,
because both would build into the same variants. Keep the 4:5 ratio: the layout
reserves that space, so anything else letterboxes or crops.

**Resolution matters more than it looks.** Only widths up to the source width
are generated, so a 600px photo produces just the 400px and 600px variants and
the page will serve those to a desktop too. The build says so plainly:

```
! "hero" is 600px wide; 1600px recommended — it will look soft on
  large or high-density screens
```

Sourcing advice, including what you may and may not legally use, is in
[`site/assets/img/src/README.md`](site/assets/img/src/README.md).

### How the page uses them

- `<picture>` with AVIF → WebP → JPEG, so each browser gets the smallest file
- `srcset` + `sizes`, so a phone downloads a 400px file instead of a 1600px one
- `width`/`height` and a reserved 4:5 box, so nothing shifts while loading
- hero is preloaded and `fetchpriority="high"`; the gallery is lazy-loaded
- on phones the gallery becomes a swipeable snap carousel

## 3. Prices and bundles

Prices live in **`site/assets/js/config.js`** and nowhere else. After changing
them, bake the cards back into the HTML:

```bash
npm run bundles
```

That regenerates the markup between the `<!-- bundles:start -->` markers in
`index.html`, so **prices are in the served HTML** rather than appearing only
after JavaScript runs. It matters on a shop page: if a script is blocked or
slow on mobile data the visitor would otherwise see nothing to buy, and
crawlers and link previews would see no prices at all. Commit the result.

| Bundle | Sells for | Wholesale cost | Status |
|---|---|---|---|
| The Device | €139 | €76 (confirmed) | ready |
| The Rescue Ritual | €199 | ~€106 (estimate) | needs supplier prices |
| The Refill | €34 | ~€14 (estimate) | needs supplier prices |

Open the site and check the browser console — a table prints your margin and
your **break-even CPA** (the most you can pay per sale in ads before losing
money). Update `costPrice` once Korean Skincare Supply approves the account.

## 4. Stripe

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

## 5. Deploy — one Worker serves everything

The root `wrangler.toml` binds `site/` as static assets to the same Worker that
handles the API. `/api/*` goes to the script, everything else is served as a
file. One deployment, one domain, and no CORS boundary in between.

```bash
npm install -D wrangler

# secrets — never in git
npx wrangler secret put STRIPE_SECRET_KEY      # sk_test_... while testing
npx wrangler secret put STRIPE_WEBHOOK_SECRET  # whsec_...

npx wrangler deploy
npm run check:live                             # verify the deploy
npx wrangler tail --format pretty              # watch orders arrive
```

`npm run check:live` hits the deployed site and checks status and content-type
for every page, that unknown paths return a real 404 page, and that the
homepage contains the shop rather than an error body. Run it after every
deploy: a config change once took the homepage down while all local tests
still passed, because the fault was in Cloudflare's asset routing.

Local development, site and API together:

```bash
cp worker/.dev.vars.example .dev.vars
npx wrangler dev                               # http://127.0.0.1:8787
```

## 6. Attach the domain

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

## 7. Fulfilment (manual, by design)

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
- [ ] Real product photography in `site/assets/img/src/`, then `npm run images`
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
npx wrangler dev        # accurate: extensionless URLs, /api/*, 404 page
npm run preview         # quick: plain static server on :8080
```

Prefer `wrangler dev`. The plain server does not resolve `/legal/terms` to
`terms.html`, so links will 404 there even though production is fine.

`config.js` is an ES module, so use a server — `file://` will not work.
