# Source clips go here

Drop **one short video per slot**, then the build turns it into web-ready
looping video. Upload it on GitHub and the **Build media** workflow does the
rest; or locally:

```bash
npm run clips
```

## Slots

| File | Shows | Ideal length |
|---|---|---|
| `ritual.mp4` | The steamer drawn slowly through damp hair | 3–6 s |
| `scalp.mp4` | Close-up of the bristles parting hair at the scalp | 3–5 s |
| `cartridge.mp4` | A cartridge clicking into the base | 2–4 s |

Any of them can be missing. Whatever exists is shown; if none exist the whole
section stays hidden rather than leaving a gap.

Portrait, roughly 4:5, and **straight off a phone is fine** — the build rescales
and re-encodes. Keep clips under ten seconds; longer stops reading as a loop and
costs mobile data.

## What the build produces

```
ritual.mp4  ->  ritual-480.webm   ritual-480.mp4    phones
                ritual-720.webm   ritual-720.mp4    everything else
                ritual-poster.jpg                   first frame
```

Audio is stripped. These play automatically, and a page that makes noise gets
closed — browsers block sound on autoplay anyway.

## Why not GIF

Measured on a real four-second clip from this project:

| Format | Size | Frame rate |
|---|---|---|
| GIF, 480px | **1997 kB** | 12 fps |
| WebM, 480px | **9 kB** | 25 fps |

The GIF is over two hundred times larger and looks worse, because GIF is capped
at 256 colours. Every "GIF" on a modern product page is really a muted looping
`<video>`, which is exactly what this builds.

## Filming, practically

- Daylight near a window beats any lamp you own
- Brace the phone against something; handheld wobble reads as amateur
- Film longer than you need and trim to the few seconds that loop cleanly
- Shoot the action in the middle of the frame so the crop cannot spoil it
- One clear action per clip

Do not stage a result you cannot back up. Showing hair you have not treated is
misleading advertising under EU rules, regardless of how the footage was made.
