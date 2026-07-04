// Server-only: composite multiple caricature images into a single labelled
// "cast sheet" reference image. Passing ONE reference image with clearly-
// separated, ordered characters is much more reliable at keeping identity
// consistent in downstream image edits than passing several separate
// references, which the image model tends to blend together.

import sharp, { type OverlayOptions } from "sharp";

/** Read a data:URL or http(s) URL into a raw PNG buffer. */
async function urlToBuffer(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith("data:")) {
      const commaIdx = url.indexOf(",");
      if (commaIdx < 0) return null;
      const meta = url.slice(0, commaIdx);
      const payload = url.slice(commaIdx + 1);
      if (meta.includes(";base64")) {
        return Buffer.from(payload, "base64");
      }
      return Buffer.from(decodeURIComponent(payload));
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

/**
 * Escape XML special characters so names render literally inside SVG text.
 */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type CastEntry = { name: string; imageUrl: string };

/**
 * Build a cast sheet: each character tile is 512×512 with the caricature on
 * top and the character's name printed clearly beneath it. Tiles are laid out
 * left-to-right on a white background. Returns a PNG buffer.
 *
 * The returned image is at most 4 tiles wide (2048px). For 5+ characters we
 * wrap onto a second row.
 */
export async function buildCastSheet(cast: CastEntry[]): Promise<Buffer | null> {
  if (cast.length === 0) return null;

  const TILE = 512;
  const LABEL = 96;
  const columns = Math.min(cast.length, 4);
  const rows = Math.ceil(cast.length / columns);
  const width = TILE * columns;
  const height = (TILE + LABEL) * rows;

  const tiles: OverlayOptions[] = [];
  for (let i = 0; i < cast.length; i++) {
    const buf = await urlToBuffer(cast[i].imageUrl);
    if (!buf) continue;

    let resized: Buffer;
    try {
      resized = await sharp(buf)
        .resize(TILE, TILE, { fit: "cover", position: "attention" })
        .png()
        .toBuffer();
    } catch {
      continue;
    }

    const col = i % columns;
    const row = Math.floor(i / columns);
    const left = col * TILE;
    const top = row * (TILE + LABEL);
    tiles.push({ input: resized, left, top });

    const labelSvg = Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
       <svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${LABEL}">
         <rect width="100%" height="100%" fill="white"/>
         <text
           x="50%" y="60%" text-anchor="middle" dominant-baseline="middle"
           font-family="Impact, 'Arial Black', sans-serif"
           font-size="56" font-weight="900" fill="black"
           stroke="white" stroke-width="6" paint-order="stroke fill"
         >#${i + 1}  ${xmlEscape(cast[i].name.toUpperCase())}</text>
       </svg>`
    );
    tiles.push({ input: labelSvg, left, top: top + TILE });
  }

  if (tiles.length === 0) return null;

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(tiles)
    .png()
    .toBuffer();
}
