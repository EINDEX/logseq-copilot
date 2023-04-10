import { EdgeAddonsAPI } from '@plasmohq/edge-addons-api';

const client = new EdgeAddonsAPI({
  productId: process.env.EDGE_PRODUCT_ID,
  clientId: process.env.EDGE_CLIENT_ID,
  clientSecret: process.env.EDGE_CLIENT_SECRET,
  accessTokenUrl: process.env.EDGE_ACCESS_TOKEN_URL,
});

const operationID = await client.submit({
  filePath: `build/edge-${process.env.VERSION}.zip`,
  notes: 'release note is here https://github.com/EINDEX/logseq-copilot/releases',
});


console.log(await client.getPublishStatus(operationID))