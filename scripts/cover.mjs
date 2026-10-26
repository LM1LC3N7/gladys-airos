// -----------------------------------------------------------------------------
// Generates cover.png (800×534, the store size): a dusk gradient, two
// airMAX dish radios on their masts facing each other over hills, the
// wireless link between them drawn as arcs of waves, and signal bars. Plain
// Node (zlib), no dependency. Run: npm run cover
// -----------------------------------------------------------------------------

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const WIDTH = 800;
const HEIGHT = 534;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, t))));
const smooth = (edge, distance) => Math.min(1, Math.max(0, edge - distance + 0.5));

const NIGHT = [12, 22, 44];
const DUSK = [30, 70, 110];
const HILL = [18, 40, 52];
const HILL2 = [24, 54, 64];
const WHITE = [240, 243, 247];
const STEEL = [168, 178, 192];
const DARK = [40, 48, 60];
const CYAN = [86, 210, 236];
const BLUE = [0, 111, 255];

/** Distance from a point to a rounded rectangle (negative inside). */
function roundedBox(x, y, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(x - cx) - halfW + radius;
  const qy = Math.abs(y - cy) - halfH + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Distance to a segment. */
function segment(x, y, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const t = Math.min(1, Math.max(0, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy));
}

/** A dish radio on a mast at (cx, cy), facing right (side 1) or left (side -1). */
function radio(color, x, y, cx, cy, side) {
  // The mast.
  color = mix(color, DARK, smooth(0, roundedBox(x, y, cx, cy + 120, 5, 130, 2)));
  // The dish: a flattened ellipse seen from the side, its rim lighter.
  const dx = (x - cx) * side;
  const ex = (dx + 6) / 18;
  const ey = (y - cy) / 62;
  const dish = Math.sqrt(ex * ex + ey * ey);
  color = mix(color, STEEL, smooth(0, (dish - 1) * 18));
  color = mix(color, WHITE, smooth(0, (dish - 0.82) * 18) * (dx > -4 ? 1 : 0.4));
  // The feed arm and the radio body.
  color = mix(color, WHITE, smooth(1.5, segment(x, y, cx + 8 * side, cy, cx + 46 * side, cy)));
  color = mix(color, WHITE, smooth(0, roundedBox(x, y, cx + 50 * side, cy, 8, 10, 3)));
  color = mix(color, BLUE, smooth(2.5, Math.hypot(x - (cx + 50 * side), y - cy)));
  return color;
}

function pixel(x, y) {
  let color = mix(NIGHT, DUSK, y / HEIGHT);
  // Two hills.
  const left = 430 + 60 * Math.cos((x - 120) / 160);
  const right = 440 + 50 * Math.cos((x - 690) / 150);
  if (y > Math.min(left, x > 400 ? right : 999)) color = HILL2;
  if (y > left && x < 420) color = HILL;
  if (y > right && x > 400) color = HILL;

  // The link: arcs of waves from each radio, and a dashed line between them.
  for (const [cx, side] of [
    [216, 1],
    [584, -1],
  ]) {
    const r = Math.hypot(x - cx, y - 200);
    const angle = Math.atan2(y - 200, (x - cx) * side);
    if (Math.abs(angle) < 0.5) {
      for (const radius of [60, 92, 124]) {
        color = mix(color, CYAN, smooth(3, Math.abs(r - radius)) * (1 - Math.abs(angle) * 1.6));
      }
    }
  }
  if (Math.floor((x - 300) / 18) % 2 === 0) {
    color = mix(color, CYAN, smooth(1.5, segment(x, y, 300, 200, 500, 200)) * 0.6);
  }

  color = radio(color, x, y, 160, 200, 1);
  color = radio(color, x, y, 640, 200, -1);

  // Signal bars, bottom center.
  for (const [i, h] of [12, 22, 32, 42].entries()) {
    const bx = 370 + i * 20;
    color = mix(
      color,
      i < 3 ? CYAN : STEEL,
      smooth(0, roundedBox(x, y, bx, 480 - h / 2, 6, h / 2, 2)),
    );
  }
  return color;
}

const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
for (let y = 0; y < HEIGHT; y += 1) {
  const row = y * (WIDTH * 3 + 1);
  raw[row] = 0;
  for (let x = 0; x < WIDTH; x += 1) {
    const [r, g, b] = pixel(x, y);
    raw.set([r, g, b], row + 1 + x * 3);
  }
}

const header = Buffer.alloc(13);
header.writeUInt32BE(WIDTH, 0);
header.writeUInt32BE(HEIGHT, 4);
header[8] = 8; // bit depth
header[9] = 2; // RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(new URL('../cover.png', import.meta.url), png);
console.log(`cover.png: ${WIDTH}×${HEIGHT}, ${png.length} bytes`);
