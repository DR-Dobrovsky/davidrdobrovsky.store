/**
 * Keeps the footer copyright year current on pages that do not load main.js.
 *
 * This is a file rather than an inline <script> because the CSP uses
 * `script-src 'self'`, which blocks inline scripts. The inline version this
 * replaced never ran in production.
 */
const el = document.getElementById('year');
if (el) el.textContent = String(new Date().getFullYear());
