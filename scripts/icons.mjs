// Renders the PWA icons, favicon and apple-touch-icon from src/web/public/art/icon.svg.
// Run: npm run icons
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "src/web/public/art/icon.svg";
const OUT = "src/web/public";
const INK = { r: 0x16, g: 0x15, b: 0x13, alpha: 1 };

mkdirSync(`${OUT}/icons`, { recursive: true });

async function png(size, file, { bleed = false } = {}) {
  let image = sharp(SRC, { density: 300 }).resize(size, size);
  if (bleed) {
    // maskable / apple: no transparent corners; the tile's ink fills them
    image = sharp({ create: { width: size, height: size, channels: 4, background: INK } }).composite([
      { input: await sharp(SRC, { density: 300 }).resize(size, size).png().toBuffer() },
    ]);
  }
  await image.png().toFile(file);
  console.log(`${file} (${size}px)`);
}

await png(192, `${OUT}/icons/icon-192.png`);
await png(512, `${OUT}/icons/icon-512.png`);
await png(512, `${OUT}/icons/icon-maskable-512.png`, { bleed: true });
await png(180, `${OUT}/apple-touch-icon.png`, { bleed: true });
await png(64, `${OUT}/favicon.png`);
