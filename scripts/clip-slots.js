/**
 * Clip slots — the short looping videos that show the product being used.
 *
 * Deliberately not GIFs. A three-second GIF at 720px is several megabytes and
 * limited to 256 colours; the same clip as VP9/H.264 is a few hundred kilobytes
 * and looks like video. Every "GIF" on a modern product page is really a muted
 * looping <video>.
 */

export const CLIP_SLOTS = [
  {
    name: 'ritual',
    caption: 'Four minutes of steam, section by section',
    /** Describes the clip for anyone who cannot see it. */
    label: 'The steamer being drawn slowly through damp hair',
  },
  {
    name: 'scalp',
    caption: 'Bristles reach the scalp, not just the hair',
    label: 'Close-up of the brush head parting hair at the scalp',
  },
  {
    name: 'cartridge',
    caption: 'Cartridges click in and out',
    label: 'An oil cartridge being clicked into the base of the device',
  },
];

/** Output widths in pixels. Portrait clips, so these are the short edge. */
export const CLIP_WIDTHS = [480, 720];

/**
 * Encoder settings. Silent by design — audio is stripped, both because these
 * are decorative and because a page that makes noise gets closed.
 */
export const CLIP_FORMATS = [
  {
    ext: 'webm',
    mime: 'video/webm',
    args: ['-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-row-mt', '1', '-an'],
  },
  {
    ext: 'mp4',
    mime: 'video/mp4',
    args: [
      '-c:v', 'libx264', '-crf', '26', '-preset', 'slow',
      '-profile:v', 'main', '-pix_fmt', 'yuv420p',
      // moves the index to the front so playback can start while downloading
      '-movflags', '+faststart', '-an',
    ],
  },
];

/** Clips longer than this are a download, not a loop — the build warns. */
export const MAX_SECONDS = 10;
