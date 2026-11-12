// Renders the PNG icons from the Thread logo (public/brand/thread.svg).
// Run from the repository root: node scripts/build-brand-icons.mjs
// sharp is resolved from docs/node_modules.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sharp = createRequire(resolve(root, 'docs/package.json'))('sharp');
const svg = readFileSync(resolve(root, 'public/brand/thread.svg'));

// density scales the SVG's 128 px viewBox so each size is rasterised, not resampled.
const render = (size) =>
  sharp(svg, { density: (72 * size) / 128 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

const out = (rel, buf) => {
  const file = resolve(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  console.log(rel);
};

for (const size of [16, 32, 48, 128, 192]) out(`public/icon-${size}.png`, await render(size));
out('src/assets/img/logo.png', await render(192));
out('docs/src/assets/logo.png', await render(192));

// favicon.ico: PNG-compressed entries at 16, 32 and 48 px.
const ico = async () => {
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(sizes.map(render));
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((size, i) => {
    const at = 6 + 16 * i;
    head.writeUInt8(size, at);
    head.writeUInt8(size, at + 1);
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(pngs[i].length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += pngs[i].length;
  });
  return Buffer.concat([head, ...pngs]);
};
out('docs/public/favicon.ico', await ico());
out('docs/public/apple-touch-icon.png', await render(180));

// Chrome Web Store: 128x128, artwork 96x96 inside 16 px of transparent padding.
out(
  'store/icon-128.png',
  await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await render(96), left: 16, top: 16 }])
    .png({ compressionLevel: 9 })
    .toBuffer(),
);
