// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  API_ROOT,
  createEdgeAddonsClient,
} from '../../pipeline/edge-addons.mjs';

const productId = 'product-guid';
const clientId = 'client-id-secret-value';
const apiKey = 'api-key-secret-value';
const product = `${API_ROOT}/v1/products/${productId}`;
const zip = Buffer.from('PK fake zip');
const notes = 'Release notes: https://example.test/v1.2.3';

const accepted = (operationId) => ({ status: 202, location: operationId });
const operation = (status, extra = {}) => ({
  status: 200,
  json: {
    id: 'op',
    status,
    message: null,
    errorCode: null,
    errors: null,
    ...extra,
  },
});
const succeeded = (message) =>
  operation('Succeeded', { message, errorCode: '' });

/** A fetch that answers from a script and records every request. */
function mockFetch(script) {
  const requests = [];
  const fetch = async (url, init = {}) => {
    requests.push({
      url,
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: init.body,
    });
    const next = script.shift();
    if (!next) throw new Error(`unexpected request ${init.method} ${url}`);
    const headers = new Headers();
    if (next.location) headers.set('Location', next.location);
    const body =
      next.json !== undefined ? JSON.stringify(next.json) : next.text ?? '';
    return new Response(next.status === 202 ? '' : body, {
      status: next.status,
      headers,
    });
  };
  return { fetch, requests };
}

function setup(script, options = {}) {
  const { fetch, requests } = mockFetch(script);
  const logs = [];
  const waits = [];
  let clock = 0;
  const client = createEdgeAddonsClient({
    productId,
    clientId,
    apiKey,
    fetch,
    wait: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    now: () => clock,
    pollIntervalMs: 1000,
    pollTimeoutMs: 5000,
    log: (line) => logs.push(line),
    ...options,
  });
  return { client, requests, logs, waits };
}

function expectNoCredentials(...texts) {
  for (const text of texts) {
    expect(text).not.toContain(apiKey);
    expect(text).not.toContain(clientId);
  }
}

function expectAuth(request) {
  expect(request.headers.get('authorization')).toBe(`ApiKey ${apiKey}`);
  expect(request.headers.get('x-clientid')).toBe(clientId);
}

const happyPath = () => [
  accepted('upload-op'),
  operation('InProgress'),
  succeeded('Successfully updated package to logseq-copilot.zip'),
  accepted('publish-op'),
  operation('InProgress'),
  succeeded('Successfully created submission with ID 1'),
];

describe('Edge Add-ons release', () => {
  it('uploads the zip, then publishes with a JSON body', async () => {
    const { client, requests, logs, waits } = setup(happyPath());

    const result = await client.release({ zip, notes });

    expect(result.message).toBe('Successfully created submission with ID 1');
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      `POST ${product}/submissions/draft/package`,
      `GET ${product}/submissions/draft/package/operations/upload-op`,
      `GET ${product}/submissions/draft/package/operations/upload-op`,
      `POST ${product}/submissions`,
      `GET ${product}/submissions/operations/publish-op`,
      `GET ${product}/submissions/operations/publish-op`,
    ]);
    requests.forEach(expectAuth);

    const [upload, , , publish] = requests;
    expect(upload.headers.get('content-type')).toBe('application/zip');
    expect(upload.body).toBe(zip);

    expect(publish.headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(publish.body)).toEqual({ notes });

    expect(waits).toEqual([1000, 1000]);
    expectNoCredentials(...logs);
  });

  it('fails on an upload HTTP error and does not publish', async () => {
    const { client, requests, logs } = setup([
      { status: 401, text: 'Unauthorized' },
    ]);

    const error = await client.release({ zip, notes }).catch((e) => e);

    expect(error.message).toBe('Upload failed: HTTP 401: Unauthorized');
    expect(error.status).toBe(401);
    expect(requests).toHaveLength(1);
    expectNoCredentials(error.message, ...logs);
  });

  it('fails when the upload operation fails and does not publish', async () => {
    const { client, requests } = setup([
      accepted('upload-op'),
      operation('Failed', {
        message: 'Package is invalid.',
        errorCode: 'InvalidPackage',
        errors: ['manifest.json: missing name'],
      }),
    ]);

    const error = await client.release({ zip, notes }).catch((e) => e);

    expect(error.message).toBe(
      'Upload failed: [InvalidPackage] Package is invalid. (errors: manifest.json: missing name)',
    );
    expect(requests.some((r) => r.url === `${product}/submissions`)).toBe(
      false,
    );
  });

  it('fails when the upload is accepted without an operation ID', async () => {
    const { client } = setup([{ status: 202 }]);

    await expect(client.release({ zip, notes })).rejects.toThrow(
      'Upload failed: the API sent no operation ID (Location header)',
    );
  });

  it('fails on a publish HTTP error', async () => {
    const { client, logs } = setup([
      accepted('upload-op'),
      succeeded('ok'),
      { status: 500, text: 'Internal Server Error' },
    ]);

    const error = await client.release({ zip, notes }).catch((e) => e);

    expect(error.message).toBe(
      'Publish failed: HTTP 500: Internal Server Error',
    );
    expectNoCredentials(error.message, ...logs);
  });

  it('fails when the publish operation fails', async () => {
    const { client, logs } = setup([
      accepted('upload-op'),
      succeeded('ok'),
      accepted('publish-op'),
      operation('Failed', {
        message: "Can't publish extension since there are no updates.",
        errorCode: 'NoModulesUpdated',
      }),
    ]);

    const error = await client.release({ zip, notes }).catch((e) => e);

    expect(error.message).toBe(
      "Publish failed: [NoModulesUpdated] Can't publish extension since there are no updates.",
    );
    expectNoCredentials(error.message, ...logs);
  });

  it('fails on the status shape without a status field', async () => {
    const { client } = setup([
      accepted('upload-op'),
      succeeded('ok'),
      accepted('publish-op'),
      { status: 200, json: { id: 'publish-op', message: 'Contact support' } },
    ]);

    await expect(client.release({ zip, notes })).rejects.toThrow(
      'Publish failed: Contact support',
    );
  });

  it.each([
    [400, 'The request body could not be parsed.'],
    [415, 'Unsupported Media Type'],
  ])(
    'retries the publish once without notes on HTTP %i',
    async (status, text) => {
      const { client, requests, logs } = setup([
        accepted('upload-op'),
        succeeded('ok'),
        { status, text },
        accepted('publish-op'),
        succeeded('Successfully created submission with ID 1'),
      ]);

      await client.release({ zip, notes });

      const [withNotes, withoutNotes] = requests.filter(
        (r) => r.url === `${product}/submissions`,
      );
      expect(JSON.parse(withNotes.body)).toEqual({ notes });
      expect(withoutNotes.method).toBe('POST');
      expect(withoutNotes.body).toBeUndefined();
      expect(withoutNotes.headers.get('content-type')).toBeNull();
      expectAuth(withoutNotes);
      expect(logs).toContain(
        `Publish failed: HTTP ${status}: ${text} (retrying without certification notes)`,
      );
      expectNoCredentials(...logs);
    },
  );

  it('fails when the publish without notes is rejected too', async () => {
    const { client, requests } = setup([
      accepted('upload-op'),
      succeeded('ok'),
      { status: 400, text: 'The request body could not be parsed.' },
      { status: 400, text: 'Bad Request' },
    ]);

    await expect(client.release({ zip, notes })).rejects.toThrow(
      'Publish failed: HTTP 400: Bad Request',
    );
    expect(requests).toHaveLength(4);
  });

  it('stops polling when the operation stays in progress', async () => {
    const { client, requests, waits } = setup([
      accepted('upload-op'),
      ...Array.from({ length: 20 }, () => operation('InProgress')),
    ]);

    await expect(client.release({ zip, notes })).rejects.toThrow(
      'Upload is still in progress after 5s (operation upload-op)',
    );
    expect(waits.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(5000);
    expect(requests.length).toBeLessThan(10);
  });

  it('reports a network error without the request headers', async () => {
    const { client } = setup([], {
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });

    const error = await client.release({ zip, notes }).catch((e) => e);

    expect(error.message).toBe('Upload request failed: fetch failed');
    expectNoCredentials(error.message);
  });

  it('names a missing setting without printing the others', () => {
    expect(() =>
      createEdgeAddonsClient({ productId, clientId, apiKey: '' }),
    ).toThrow(/^EDGE_API_KEY is not set$/);
    expect(() =>
      createEdgeAddonsClient({ productId: undefined, clientId, apiKey }),
    ).toThrow(/^EDGE_PRODUCT_ID is not set$/);
  });
});
