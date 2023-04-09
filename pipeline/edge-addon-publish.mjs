import { EdgeAddonsAPI } from '@plasmohq/edge-addons-api';
import process from 'node:process';

const client = new EdgeAddonsAPI({
  productId: process.env.EDGE_PRODUCT_ID,
  clientId: process.env.EDGE_CLIENT_ID,
  clientSecret: process.env.EDGE_CLIENT_SECRET,
  accessTokenUrl: process.env.EDGE_ACCESS_TOKEN_URL,
});

const operationID = await client.submit({
  filePath: `./build/edge-${process.env.VERSION}.zip`,
  notes: 'Developer notes',
});


console.log(await client.getPublishStatus(operationID))