import { readFileSync } from 'node:fs';
import { createEdgeAddonsClient } from './edge-addons.mjs';

// WXT names zips after the package.json version. The Edge zip (`pnpm zip:edge`)
// is the Chrome build without the `key` field, which Edge Add-ons rejects.
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const zipPath = `.output/logseq-copilot-${version}-edge.zip`;

try {
  // Edge Add-ons API v1.1: an API key plus the client id, created under
  // Partner Center > Microsoft Edge > Publish API.
  const client = createEdgeAddonsClient({
    productId: process.env.EDGE_PRODUCT_ID,
    clientId: process.env.EDGE_CLIENT_ID,
    apiKey: process.env.EDGE_API_KEY,
  });

  await client.release({
    zip: readFileSync(zipPath),
    notes: `Release notes: https://github.com/EINDEX/logseq-copilot/releases/tag/v${version}`,
  });
} catch (error) {
  // Only the message: the error never carries request headers.
  console.error(`::error::Edge ${error.message}`);
  process.exitCode = 1;
}
