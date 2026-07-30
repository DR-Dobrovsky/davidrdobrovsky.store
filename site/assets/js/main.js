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

import { SHOP, BUNDLES, LOCALES } from './config.js';
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
  // Selected by class, not by id: the surrounding <section> also carries
  // id="bundles" as the nav anchor, and querySelector('#bundles') matched the
  // section first — so a fallback render would have replaced the whole
  // section, heading and all.
  const host = $('.bundles');
  if (!host) return;
  if (host.querySelector('.bundle')) return; // already baked in by npm run bundles
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

/**
 * Language picker.
 *
 * The previous version listed four languages and, when one was chosen, set
 * html[lang] and the button label and nothing else — the page stayed English.
 * So it claimed a language the text was not in, which also made screen readers
 * read English with the wrong phonetics.
 *
 * Now the list comes from LOCALES in config.js, entries are real links, and the
 * control is only revealed when there is somewhere to go. Adding a translation
 * means creating the pages and uncommenting a line, with no change here.
 */
function wireLanguage() {
  const picker = $('#langPicker');
  const btn = $('#langBtn');
  const menu = $('#langMenu');
  if (!picker || !btn || !menu) return;

  const current =
    LOCALES.find((l) => l.code === document.documentElement.lang) ?? LOCALES[0];

  // One language is not a choice. Leave the control hidden rather than show a
  // dropdown whose only entry is the page you are already on.
  if (LOCALES.length < 2 || !current) return;

  menu.innerHTML = '';
  for (const locale of LOCALES) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = locale.path;
    link.hreflang = locale.code;
    link.textContent = locale.label;
    if (locale.code === current.code) link.setAttribute('aria-current', 'true');
    item.append(link);
    menu.append(item);
  }

  $('#langCurrent').textContent = current.code.toUpperCase();
  picker.hidden = false;

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

/* ------------------------------------------------------------- carousel --- */

const ICON = {
  pause: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
  play: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  prev: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
};

/**
 * Hero carousel.
 *
 * Position is read from and written to the track's scrollLeft rather than kept
 * in a variable: the strip is scroll-snapped, so a swipe moves it without this
 * code being involved, and any state we kept alongside would drift out of sync
 * with what the visitor can see.
 *
 * Autoplay walks to the end and then back rather than wrapping around. Wrapping
 * means a smooth-scroll all the way from the last slide to the first, which
 * reads as the page rewinding itself every few seconds.
 *
 * Nothing autoplays if the visitor asked for reduced motion, and the pause
 * button exists so that an animation which starts on its own can always be
 * stopped — that is a requirement, not a nicety.
 */
function wireCarousel() {
  const root = $('.carousel');
  if (!root) return;

  const track = $('.carousel__track', root);
  const ui = $('.carousel__ui', root);
  const slides = root.querySelectorAll('.carousel__slide');

  // One photo is not a carousel: no controls, no timer, nothing to announce.
  if (!track || !ui || slides.length < 2) return;

  const count = slides.length;
  const interval = Number(root.dataset.interval) || 3000;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let index = 0;
  let step = 1; // direction of travel, flipped at either end
  let timer = null;
  let resume = null;
  let stopped = reduceMotion; // the visitor's standing choice

  const at = () =>
    track.clientWidth ? Math.round(track.scrollLeft / track.clientWidth) : 0;

  const dots = [];
  for (let i = 0; i < count; i += 1) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel__dot';
    dot.setAttribute('aria-label', `Photo ${i + 1} of ${count}`);
    dot.addEventListener('click', () => {
      hold();
      go(i);
    });
    dots.push(dot);
    ui.append(dot);
  }

  const arrow = (kind, label, delta) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `carousel__arrow carousel__arrow--${kind}`;
    button.innerHTML = ICON[kind];
    button.setAttribute('aria-label', label);
    button.addEventListener('click', () => {
      hold();
      go(at() + delta);
    });
    root.append(button);
    return button;
  };
  const prev = arrow('prev', 'Previous photo', -1);
  const next = arrow('next', 'Next photo', 1);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'carousel__toggle';
  root.append(toggle);

  function paintToggle() {
    toggle.innerHTML = stopped ? ICON.play : ICON.pause;
    toggle.setAttribute('aria-label', stopped ? 'Play the photos' : 'Pause the photos');
    toggle.setAttribute('aria-pressed', String(stopped));
  }

  function sync() {
    index = at();
    dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
    prev.disabled = index === 0;
    next.disabled = index === count - 1;
  }

  function go(to) {
    const target = Math.max(0, Math.min(count - 1, to));
    track.scrollTo({
      left: track.clientWidth * target,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }

  function tick() {
    const here = at();
    if (here >= count - 1) step = -1;
    if (here <= 0) step = 1;
    go(here + step);
  }

  function play() {
    stop();
    if (stopped || document.hidden) return;
    timer = setInterval(tick, interval);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  /**
   * Step back for a while after the visitor moves the carousel themselves.
   * Killing autoplay outright on any scroll would let one stray swipe disable
   * it for the rest of the visit; carrying on immediately would fight them for
   * control of the thing they are looking at.
   */
  function hold(ms = 7000) {
    stop();
    clearTimeout(resume);
    resume = setTimeout(play, ms);
  }

  toggle.addEventListener('click', () => {
    stopped = !stopped;
    clearTimeout(resume);
    paintToggle();
    if (stopped) stop();
    else play();
  });

  track.addEventListener('scroll', sync, { passive: true });
  track.addEventListener('pointerdown', () => hold(), { passive: true });

  root.addEventListener('pointerenter', stop);
  root.addEventListener('pointerleave', play);
  root.addEventListener('focusin', stop);
  root.addEventListener('focusout', play);

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    hold();
    go(at() + (event.key === 'ArrowRight' ? 1 : -1));
  });

  // A timer that keeps firing in a background tab wastes battery and, worse,
  // the visitor comes back to a photo they never chose.
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : play()));

  paintToggle();
  sync();
  play();
}

/* --------------------------------------------------------------- clips --- */

/**
 * Looping clips are marked preload="none" so they cost nothing until they are
 * on screen. This starts them when they scroll into view and pauses them when
 * they leave, which on a phone is the difference between a few hundred
 * kilobytes and several megabytes of video nobody watched.
 *
 * If the visitor has asked for reduced motion, nothing plays by itself and the
 * native controls appear instead.
 */
function wireClips() {
  const clips = document.querySelectorAll('.clip__video');
  if (clips.length === 0) return;

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion) {
    for (const video of clips) {
      video.removeAttribute('autoplay');
      video.controls = true;
      video.preload = 'metadata';
    }
    return;
  }

  if (!('IntersectionObserver' in window)) {
    for (const video of clips) video.preload = 'auto';
    return;
  }

  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const video = entry.target;
        if (entry.isIntersecting) {
          if (video.preload !== 'auto') video.preload = 'auto';
          // play() rejects if the browser declines autoplay; that is fine.
          video.play?.().catch(() => {});
        } else {
          video.pause?.();
        }
      }
    },
    { rootMargin: '200px 0px', threshold: 0.25 }
  );

  for (const video of clips) seen.observe(video);
}

/* ------------------------------------------------------------------ init */

function init() {
  renderBundles();
  wireCheckout();
  wireCookieBar();
  wireLanguage();
  wireCarousel();
  wireClips();

  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  logMargins();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
