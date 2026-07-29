/**
 * Worker tests — run with:  node tests/worker.mjs
 *
 * Covers the security-sensitive behaviour:
 *   - price IDs are validated before anything is sent to Stripe
 *   - webhook signatures are actually verified (valid, tampered, replayed)
 *   - unknown routes 404 instead of falling through
 *   - Stripe errors never leak to the client
 *
 * Uses Node's built-in fetch/Request/Response and Web Crypto — no installs.
 */

import worker from '../worker/src/index.js';

const env = {
  STRIPE_SECRET_KEY: 'sk_test_dummy',
  STRIPE_WEBHOOK_SECRET: 'whsec_testsecret',
  SITE_URL: 'https://davidrdobrovsky.store',
  ALLOWED_ORIGINS: 'https://davidrdobrovsky.store',
};

const results = [];
const check = (label, passed, detail = '') => {
  results.push([label, passed, detail]);
};

const post = (path, body, headers = {}) =>
  new Request(`https://davidrdobrovsky.store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://davidrdobrovsky.store', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/* -------------------------------------------------- routing & validation */

let res = await worker.fetch(new Request('https://davidrdobrovsky.store/nope'), env);
check('unknown route returns 404', res.status === 404);

res = await worker.fetch(new Request('https://davidrdobrovsky.store/api/health'), env);
const health = await res.json();
check('health endpoint reports stripe configured', res.status === 200 && health.stripe === true);

res = await worker.fetch(
  new Request('https://davidrdobrovsky.store/api/checkout', {
    method: 'OPTIONS',
    headers: { Origin: 'https://davidrdobrovsky.store' },
  }),
  env
);
check(
  'CORS preflight allows the published origin',
  res.status === 204 &&
    res.headers.get('Access-Control-Allow-Origin') === 'https://davidrdobrovsky.store'
);

res = await worker.fetch(
  new Request('https://davidrdobrovsky.store/api/checkout', {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example' },
  }),
  env
);
check(
  'CORS preflight refuses an unlisted origin',
  res.headers.get('Access-Control-Allow-Origin') !== 'https://evil.example'
);

res = await worker.fetch(post('/api/checkout', { priceId: 'not-a-price' }), env);
check('malicious price id rejected with 400', res.status === 400);

res = await worker.fetch(post('/api/checkout', { priceId: 'price_x"; DROP' }), env);
check('injection attempt in price id rejected', res.status === 400);

res = await worker.fetch(post('/api/checkout', 'not json at all'), env);
check('malformed JSON rejected with 400', res.status === 400);

res = await worker.fetch(post('/api/checkout', { priceId: 'price_abc123' }), {
  ...env,
  STRIPE_SECRET_KEY: undefined,
});
check('missing Stripe key returns 500, not a crash', res.status === 500);

/* --------------------------------------------------------------- webhook */

async function sign(payload, secret, timestamp) {
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
    new TextEncoder().encode(`${timestamp}.${payload}`)
  );
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const orderEvent = JSON.stringify({
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_123',
      amount_total: 19900,
      currency: 'eur',
      metadata: { bundle: 'ritual' },
      customer_details: { email: 'buyer@davidrdobrovsky.store', name: 'Test Buyer', phone: '+32...' },
      shipping_details: {
        name: 'Test Buyer',
        address: { line1: 'Teststraat 1', postal_code: '1000', city: 'Brussels', country: 'BE' },
      },
    },
  },
});

const now = Math.floor(Date.now() / 1000);

// Silence the ORDER log line so the test output stays readable.
const realLog = console.log;
const logged = [];
console.log = (...a) => logged.push(a.join(' '));

let sig = await sign(orderEvent, env.STRIPE_WEBHOOK_SECRET, now);
res = await worker.fetch(
  post('/api/webhook', orderEvent, { 'stripe-signature': `t=${now},v1=${sig}` }),
  env
);
const validAccepted = res.status === 200;

console.log = realLog;

check('valid webhook signature accepted', validAccepted);
check(
  'paid order is logged for manual fulfilment',
  logged.some((l) => l.includes('"event":"ORDER"') && l.includes('buyer@davidrdobrovsky.store'))
);

res = await worker.fetch(
  post('/api/webhook', orderEvent, { 'stripe-signature': `t=${now},v1=${'0'.repeat(64)}` }),
  env
);
check('forged signature rejected', res.status === 400);

const tampered = orderEvent.replace('19900', '100');
res = await worker.fetch(
  post('/api/webhook', tampered, { 'stripe-signature': `t=${now},v1=${sig}` }),
  env
);
check('tampered payload rejected (amount changed)', res.status === 400);

const old = now - 4000;
sig = await sign(orderEvent, env.STRIPE_WEBHOOK_SECRET, old);
res = await worker.fetch(
  post('/api/webhook', orderEvent, { 'stripe-signature': `t=${old},v1=${sig}` }),
  env
);
check('replayed old event rejected', res.status === 400);

res = await worker.fetch(post('/api/webhook', orderEvent), env);
check('webhook without signature rejected', res.status === 400);

sig = await sign(orderEvent, 'wrong_secret', now);
res = await worker.fetch(
  post('/api/webhook', orderEvent, { 'stripe-signature': `t=${now},v1=${sig}` }),
  env
);
check('signature from wrong secret rejected', res.status === 400);

/* ----------------------------------------------------------------- report */

let failed = 0;
for (const [label, passed, detail] of results) {
  if (!passed) failed += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
