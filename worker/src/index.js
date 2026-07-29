/**
 * Seoulsilk — Stripe Checkout Worker
 * ---------------------------------------------------------------------------
 * Two endpoints:
 *   POST /api/checkout  → creates a Stripe Checkout Session, returns { url }
 *   POST /api/webhook   → receives Stripe events, verifies the signature
 *
 * Why a Worker at all, when Stripe Payment Links exist?
 * Because the browser must never decide what something costs. The client sends
 * only a Price ID; Stripe resolves the amount server-side. Editing the DOM
 * cannot change the charge.
 *
 * Secrets (never in this file, never in git):
 *   wrangler secret put STRIPE_SECRET_KEY
 *   wrangler secret put STRIPE_WEBHOOK_SECRET
 */

const STRIPE_API = 'https://api.stripe.com/v1';

// Countries we are willing to ship to. Keep this in step with what the
// supplier actually delivers — promising Cyprus and then cancelling is worse
// than not listing it.
const SHIP_TO = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR',
  'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
  'SE', 'SI', 'SK',
];

/* ------------------------------------------------------------------- utils */

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });

function corsHeaders(origin, allowed) {
  // Reflect the origin only when it is one we published, so a random site
  // cannot drive our checkout from their own page.
  const ok = allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] ?? '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** Stripe wants application/x-www-form-urlencoded, including for nested keys. */
function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const field = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          formEncode(item, `${field}[${i}]`, out);
        } else {
          out.append(`${field}[${i}]`, String(item));
        }
      });
    } else if (typeof value === 'object') {
      formEncode(value, field, out);
    } else {
      out.append(field, String(value));
    }
  }
  return out;
}

async function stripe(path, body, secretKey) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
    body: formEncode(body),
  });

  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message ?? 'Unknown Stripe error';
    throw new Error(`Stripe ${res.status}: ${message}`);
  }
  return data;
}

/* ---------------------------------------------------------------- checkout */

async function handleCheckout(request, env, cors) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Malformed JSON body' }, 400, cors);
  }

  const { priceId, bundleId } = payload ?? {};

  // Only accept IDs that look like Stripe prices. Anything else is a probe.
  if (typeof priceId !== 'string' || !/^price_[A-Za-z0-9_]+$/.test(priceId)) {
    return json({ error: 'Invalid price identifier' }, 400, cors);
  }

  const site = env.SITE_URL?.replace(/\/$/, '') ?? '';

  const session = {
    mode: 'payment',
    ui_mode: 'hosted',
    locale: 'auto',
    line_items: [
      {
        price: priceId,
        quantity: 1,
        adjustable_quantity: { enabled: true, minimum: 1, maximum: 5 },
      },
    ],
    success_url: `${site}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/#bundles`,
    // Stripe Tax works out the correct VAT rate for the customer's country,
    // which is what keeps OSS reporting straightforward later on.
    automatic_tax: { enabled: true },
    shipping_address_collection: { allowed_countries: SHIP_TO },
    billing_address_collection: 'auto',
    phone_number_collection: { enabled: true },
    allow_promotion_codes: true,
    customer_creation: 'always',
    metadata: { bundle: bundleId ?? 'unknown' },
  };

  // Optional: a Stripe Shipping Rate, created once in the dashboard.
  if (env.SHIPPING_RATE_ID) {
    session.shipping_options = [{ shipping_rate: env.SHIPPING_RATE_ID }];
  }

  try {
    const created = await stripe('/checkout/sessions', session, env.STRIPE_SECRET_KEY);
    return json({ url: created.url, id: created.id }, 200, cors);
  } catch (err) {
    console.error('[checkout]', err.message);
    // Never leak Stripe internals to the browser.
    return json({ error: 'Could not create checkout session' }, 502, cors);
  }
}

/* ----------------------------------------------------------------- webhook */

/** Constant-time-ish comparison to avoid leaking bytes through timing. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyStripeSignature(rawBody, header, secret) {
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(',').map((kv) => kv.split('=').map((s) => s.trim()))
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Reject anything older than five minutes to blunt replay attempts.
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(age) || Math.abs(age) > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`)
  );
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return safeEqual(expected, signature);
}

async function handleWebhook(request, env) {
  const raw = await request.text();
  const valid = await verifyStripeSignature(
    raw,
    request.headers.get('stripe-signature'),
    env.STRIPE_WEBHOOK_SECRET
  );

  if (!valid) return json({ error: 'Invalid signature' }, 400);

  const event = JSON.parse(raw);

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const address = s.shipping_details?.address ?? s.customer_details?.address;

    // Manual fulfilment: this is the order sheet you act on. Visible with
    // `wrangler tail`, and the place to plug in email or a Google Sheet later.
    console.log(
      JSON.stringify({
        event: 'ORDER',
        bundle: s.metadata?.bundle,
        amount: (s.amount_total ?? 0) / 100,
        currency: s.currency?.toUpperCase(),
        email: s.customer_details?.email,
        name: s.shipping_details?.name ?? s.customer_details?.name,
        phone: s.customer_details?.phone,
        address,
        session: s.id,
      })
    );
  }

  // Always 200 quickly, or Stripe will retry.
  return json({ received: true });
}

/* -------------------------------------------------------------- entrypoint */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowed = (env.ALLOWED_ORIGINS ?? env.SITE_URL ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const cors = corsHeaders(request.headers.get('Origin') ?? '', allowed);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/api/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    if (url.pathname === '/api/checkout' && request.method === 'POST') {
      if (!env.STRIPE_SECRET_KEY) {
        return json({ error: 'Stripe key not configured' }, 500, cors);
      }
      return handleCheckout(request, env, cors);
    }

    if (url.pathname === '/api/health') {
      return json({ ok: true, stripe: Boolean(env.STRIPE_SECRET_KEY) }, 200, cors);
    }

    // Anything that is not an API call is a request for the website. When the
    // static assets binding is present (see wrangler.toml at the repo root)
    // one Worker serves both the shop and its API from the same origin, which
    // is why the front-end can POST to a relative /api/checkout with no CORS.
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return json({ error: 'Not found' }, 404, cors);
  },
};
