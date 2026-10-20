import { readFileSync } from 'node:fs';
import { EdgeAddonsAPI } from '@plasmohq/edge-addons-api';

// WXT names zips after the package.json version; Edge uses the Chrome (MV3) build.
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

const client = new EdgeAddonsAPI({
  productId: process.env.EDGE_PRODUCT_ID,
  clientId: process.env.EDGE_CLIENT_ID,
  clientSecret: process.env.EDGE_CLIENT_SECRET,
  accessTokenUrl: process.env.EDGE_ACCESS_TOKEN_URL,
});

const operationID = await client.submit({
  filePath: `.output/logseq-copliot-${version}-chrome.zip`,
  notes: 'release note is here https://github.com/EINDEX/logseq-copilot/releases',
});


console.log(await client.getPublishStatus(operationID))