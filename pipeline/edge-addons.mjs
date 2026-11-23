// Client for the Microsoft Edge Add-ons Update REST API v1.1:
// https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference
// https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api
//
// It replaces @plasmohq/edge-addons-api 2.0.0 (the latest release), whose
// publish call sends `{ "notes"="..." }` as application/x-www-form-urlencoded.
// That is neither JSON nor a form, and the API answers 400 "The request body
// could not be parsed", so every release had to be published by hand.

export const API_ROOT = 'https://api.addons.microsoftedge.microsoft.com';

const REQUEST_TIMEOUT_MS = 5 * 60_000;

export class EdgeApiError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'EdgeApiError';
    this.status = status;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** "[errorCode] message (errors: ...)" from an operation status response. */
function describeOperation(operation) {
  const parts = [];
  if (operation?.errorCode) parts.push(`[${operation.errorCode}]`);
  parts.push(operation?.message || `status ${operation?.status ?? 'missing'}`);
  const errors = (operation?.errors ?? [])
    .map((error) => (typeof error === 'string' ? error : error?.message))
    .filter(Boolean);
  if (errors.length > 0) parts.push(`(errors: ${errors.join('; ')})`);
  return parts.join(' ');
}

export function createEdgeAddonsClient({
  productId,
  clientId,
  apiKey,
  fetch = globalThis.fetch,
  wait = sleep,
  now = Date.now,
  pollIntervalMs = 5_000,
  pollTimeoutMs = 10 * 60_000,
  log = console.log,
}) {
  const required = {
    EDGE_PRODUCT_ID: productId,
    EDGE_CLIENT_ID: clientId,
    EDGE_API_KEY: apiKey,
  };
  for (const [name, value] of Object.entries(required)) {
    if (!value) throw new EdgeApiError(`${name} is not set`);
  }

  const productUrl = `${API_ROOT}/v1/products/${encodeURIComponent(productId)}`;
  // Credentials only ever go into these headers; no log line or error
  // message includes headers.
  const authHeaders = {
    Authorization: `ApiKey ${apiKey}`,
    'X-ClientID': clientId,
  };

  async function request(step, url, { method = 'GET', headers, body } = {}) {
    try {
      return await fetch(url, {
        method,
        headers: { ...authHeaders, ...headers },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new EdgeApiError(`${step} request failed: ${error?.message}`, {
        cause: error,
      });
    }
  }

  async function httpError(step, response) {
    const text = (await response.text().catch(() => '')).trim().slice(0, 1000);
    return new EdgeApiError(
      `${step} failed: HTTP ${response.status}${text ? `: ${text}` : ''}`,
      { status: response.status },
    );
  }

  // Upload and publish answer 202 with the operation ID in `Location`.
  async function operationId(step, response) {
    if (response.status !== 202) throw await httpError(step, response);
    const id = response.headers.get('location')?.trim();
    if (!id) {
      throw new EdgeApiError(
        `${step} failed: the API sent no operation ID (Location header)`,
      );
    }
    return id;
  }

  async function waitForOperation(step, url, id) {
    const deadline = now() + pollTimeoutMs;
    for (;;) {
      const response = await request(step, url);
      if (!response.ok) throw await httpError(step, response);
      let operation;
      try {
        operation = await response.json();
      } catch (error) {
        throw new EdgeApiError(`${step} status is not JSON: ${error.message}`, {
          cause: error,
        });
      }
      if (operation?.status === 'Succeeded') return operation;
      // `Failed`, or the "unexpected failure" shape that has no status.
      if (operation?.status !== 'InProgress') {
        throw new EdgeApiError(
          `${step} failed: ${describeOperation(operation)}`,
        );
      }
      if (now() + pollIntervalMs > deadline) {
        throw new EdgeApiError(
          `${step} is still in progress after ${Math.round(
            pollTimeoutMs / 1000,
          )}s (operation ${id}). Check the submission in Partner Center.`,
        );
      }
      await wait(pollIntervalMs);
    }
  }

  async function upload(zip) {
    const response = await request(
      'Upload',
      `${productUrl}/submissions/draft/package`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: zip,
      },
    );
    const id = await operationId('Upload', response);
    return waitForOperation(
      'Upload',
      `${productUrl}/submissions/draft/package/operations/${encodeURIComponent(
        id,
      )}`,
      id,
    );
  }

  async function publish(notes) {
    const url = `${productUrl}/submissions`;
    let response = await request('Publish', url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    // The docs say the notes are JSON, but their own sample body is the same
    // invalid `{ "notes"="..." }`, and other clients (AdGuard go-webext,
    // wdzeng/edge-addon) publish with an empty body. A 400 or 415 means
    // nothing was created, so try once more without notes rather than fail
    // the release.
    if (response.status === 400 || response.status === 415) {
      const rejected = await httpError('Publish', response);
      log(`${rejected.message} (retrying without certification notes)`);
      response = await request('Publish', url, { method: 'POST' });
    }
    const id = await operationId('Publish', response);
    return waitForOperation(
      'Publish',
      `${productUrl}/submissions/operations/${encodeURIComponent(id)}`,
      id,
    );
  }

  /** Uploads the zip to the draft submission, then publishes the draft. */
  async function release({ zip, notes }) {
    log(`Uploading the package (${zip.byteLength} bytes)`);
    const uploaded = await upload(zip);
    log(`Upload succeeded: ${uploaded.message ?? ''}`.trim());
    log('Publishing the draft submission');
    const published = await publish(notes);
    log(`Publish succeeded: ${published.message ?? ''}`.trim());
    return published;
  }

  return { upload, publish, release };
}
