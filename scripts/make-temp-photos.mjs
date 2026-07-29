#!/usr/bin/env node
/**
 * Temporary stand-in photos — run with:  node scripts/make-temp-photos.mjs
 *
 * Generates four neutral, on-brand gradient images so the live page has real
 * files in every image slot instead of broken-image icons. They are deliberately
 * abstract: no fake product, no fake person, nothing that could mislead anyone
 * who lands on the site before the real photography exists.
 *
 * Replace them by dropping real photos into site/assets/img/src/ with the same
 * filenames and running `npm run images`. This script is then never needed
 * again and can be deleted.
 */

import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const OUT = 'site/assets/img/src';
const W = 1600;
const H = 2000; // 4:5

// Palette lifted from styles.css so the placeholders match the page.
const SLOTS = [
  { name: 'hero', from: '#f7e7e3', to: '#e8dcce', accent: '#a8423f', label: 'Hero' },
  { name: 'in-use', from: '#f4ece3', to: '#e2d3c2', accent: '#b08d57', label: 'In use' },
  { name: 'device', from: '#fbf8f4', to: '#eee3d6', accent: '#a8423f', label: 'Device' },
  { name: 'set', from: '#f2e4dd', to: '#e4d6c6', accent: '#2a231f', label: 'The set' },
];

const svg = ({ from, to, accent, label }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.55">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="${W / 2}" cy="${H * 0.42}" rx="${W * 0.46}" ry="${H * 0.34}" fill="url(#glow)"/>

  <!-- soft diagonal light, echoing the product photography style -->
  <path d="M0,${H * 0.72} L${W},${H * 0.34} L${W},${H} L0,${H} Z"
        fill="${accent}" opacity="0.07"/>
  <circle cx="${W * 0.5}" cy="${H * 0.44}" r="${W * 0.012}" fill="${accent}" opacity="0.5"/>

  <text x="${W / 2}" y="${H * 0.9}" text-anchor="middle"
        font-family="Georgia, serif" font-size="52" fill="${accent}" opacity="0.5"
        letter-spacing="14">${label.toUpperCase()}</text>
  <text x="${W / 2}" y="${H * 0.9 + 70}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#2a231f" opacity="0.35"
        letter-spacing="4">PHOTO TO COME</text>
</svg>`;

await mkdir(OUT, { recursive: true });

for (const slot of SLOTS) {
  const path = `${OUT}/${slot.name}.jpg`;
  await sharp(Buffer.from(svg(slot))).jpeg({ quality: 90 }).toFile(path);
  console.log(`wrote ${path}`);
}

console.log('\nNow run:  npm run images');
