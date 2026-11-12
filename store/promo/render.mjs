// Rebuild the store promo tiles: node store/promo/render.mjs [overview.png]
// Needs `pnpm install --frozen-lockfile` in docs/ (fonts, sharp) and the root node_modules (playwright).
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(join(here, '../../docs/'))('sharp');

const tiles = [
  ['small-a', 440, 280],
  ['small-b', 440, 280],
  ['marquee-a', 1400, 560],
  ['marquee-b', 1400, 560],
];

// Playwright's expected Chromium may be missing; fall back to any cached headless shell.
function fallbackExecutable() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) return undefined;
  for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()) {
    for (const sub of ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell-mac-x64', '']) {
      const bin = join(cache, dir, sub, 'chrome-headless-shell');
      if (existsSync(bin)) return bin;
    }
  }
}

let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ executablePath: fallbackExecutable() });
}

for (const [name, width, height] of tiles) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(here, `${name}.html`)).href);
  await page.evaluate(() => document.fonts.ready);
  const raw = await page.screenshot({ type: 'png' });
  await page.close();
  // Flatten so the PNG has no alpha channel.
  await sharp(raw).flatten({ background: '#d9edec' }).removeAlpha().png({ compressionLevel: 9 }).toFile(join(here, `${name}.png`));
  console.log(`${name}.png ${width}x${height}`);
}
await browser.close();

const out = process.argv[2];
if (out) {
  const pad = 40;
  const w = 1400 + pad * 2;
  const small = await Promise.all(['small-a', 'small-b'].map((n) => sharp(join(here, `${n}.png`)).toBuffer()));
  const big = await Promise.all(['marquee-a', 'marquee-b'].map((n) => sharp(join(here, `${n}.png`)).toBuffer()));
  const gap = (1400 - 880) ;
  await sharp({ create: { width: w, height: pad + 280 + pad + 560 + pad + 560 + pad, channels: 3, background: '#9aa5a8' } })
    .composite([
      { input: small[0], left: pad, top: pad },
      { input: small[1], left: pad + 440 + gap, top: pad },
      { input: big[0], left: pad, top: pad + 280 + pad },
      { input: big[1], left: pad, top: pad + 280 + pad + 560 + pad },
    ])
    .png()
    .toFile(resolve(out));
  console.log(`overview ${resolve(out)}`);
}
