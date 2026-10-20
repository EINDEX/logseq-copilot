import { readFileSync } from 'node:fs';
import { EdgeAddonsAPI } from '@plasmohq/edge-addons-api';

// WXT names zips after the package.json version; Edge uses the Chrome (MV3) build.
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

// Edge Add-ons API v1.1: an API key plus the client id, created under
// Partner Center > Microsoft Edge > Publish API. The old OAuth client secret
// flow (EDGE_CLIENT_SECRET / EDGE_ACCESS_TOKEN_URL) is no longer used.
const client = new EdgeAddonsAPI({
  productId: process.env.EDGE_PRODUCT_ID,
  clientId: process.env.EDGE_CLIENT_ID,
  apiKey: process.env.EDGE_API_KEY,
});

try {
  const operationID = await client.submit({
    filePath: `.output/logseq-copliot-${version}-chrome.zip`,
    notes: 'release note is here https://github.com/EINDEX/logseq-copilot/releases',
  });

  console.log(await client.getPublishStatus(operationID));
} catch (error) {
  // got only prints timings for HTTP errors; surface what the server said.
  const response = error?.response;
  if (response) {
    console.error(`Edge API responded ${response.statusCode}: ${response.body}`);
  }
  throw error;
}
