# Source photos go here

Drop **one high-resolution photo per slot** in this folder.

**These files are never served.** The site loads generated variants such as
`hero-800.avif` from `site/assets/img/`. Uploading a new source here does
nothing on its own — the variants have to be rebuilt.

Pushing a change to this folder triggers the **Build images** GitHub Action,
which rebuilds and commits them automatically. To do it locally instead:

```bash
npm install
npm run images
```

One file per slot only: `hero.jpg` and `hero.png` together will be rejected,
since both map to the same output name.

## Shot list

| File | Ratio | Min width | What it shows |
|---|---|---|---|
| `hero.jpg` | 4:5 | 1600 px | A woman using the device on long hair, shot from behind or in profile. This is the single most important image on the page. |
| `in-use.jpg` | 4:5 | 1200 px | Close-up of the brush head against the scalp, steam visible. |
| `device.jpg` | 4:5 | 1200 px | The device alone, floating or angled, soft shadow, warm neutral background. |
| `set.jpg` | 4:5 | 1200 px | The full Rescue Ritual laid out: device plus the three Growus bottles. |
| `band.jpg` | landscape | 2000 px | *Optional.* The full-bleed panel under the hero. Wide and calm — hair, steam, a hand. The headline sits over the left third, so leave that side quiet. |

Keep the ratio consistent at 4:5. The layout reserves that space, so a
different ratio will letterbox or crop.

## Why 4:5 and not square

Portrait wins on mobile, where most of the traffic will come from. A 4:5 frame
fills more of the screen than a square without pushing the price and the
buy button below the fold.

## Getting the photos

**The supplier's media kit is the fastest route.** Korean Skincare Supply and
most K-beauty distributors give resellers official product photography — ask
them for it in the same email as the price list, and confirm in writing that
you may use it. Manufacturer photos are usually well lit and colour-accurate,
which is hard to match at home.

For the lifestyle shot with a person, you have three honest options:

1. Shoot it yourself once the device arrives — daylight near a window, plain
   wall, phone on a tripod. This is what most small brands actually do.
2. Licence a stock photo, but only one that genuinely shows this kind of
   device. A mismatched product in the hero photo reads as fake.
3. Ask the supplier whether the brand's lifestyle images may be used.

Avoid inventing a result you cannot back up. Showing "before and after" hair
you have never treated is misleading advertising, and under EU rules that is
enforceable regardless of how the image was made.

## Copyright

Do not lift photos from other shops' websites. Retailer photography is their
copyright, not the brand's, and beauty retailers do send takedown notices.
