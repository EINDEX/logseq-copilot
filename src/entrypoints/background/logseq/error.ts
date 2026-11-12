import type { LogseqResponseType } from './client';

export type LogseqClientError = LogseqResponseType<null>;

// Every error object made below, so isLogseqClientError can tell them apart
// from real API data of the same shape.
const clientErrors = new WeakSet<object>();

const clientError = (msg: string, status: number): LogseqClientError => {
  const info: LogseqClientError = { msg, status, response: null };
  clientErrors.add(info);
  return info;
};

/** Logseq answered 401 or 403: the token was rejected. */
export const tokenRejected = (status: number): LogseqClientError =>
  clientError(
    `The authorization token is wrong (Logseq returned HTTP ${status}). Check it in Logseq's API server settings.`,
    status,
  );

export const TokenNotCurrect: LogseqClientError = tokenRejected(401);

export const LogseqVersionIsLower: LogseqClientError = clientError(
  'Logseq version is lower, Please upgrade your Logseq version.\nhttps://logseq.com/downloads',
  500,
);

/**
 * The request never got an HTTP answer. The browser cannot tell "API server
 * not started" from "wrong host or port", so name the address that was tried.
 */
export const cannotConnectWithLogseq = (address: string): LogseqClientError =>
  clientError(
    `Cannot connect to Logseq at ${address}. Check that Logseq is running and its HTTP API server is started on this address.`,
    500,
  );

/** Same as cannotConnectWithLogseq, for when the address is not known. */
export const CannotConnectWithLogseq: LogseqClientError = clientError(
  'Cannot connect to Logseq. Check that Logseq is running and its HTTP API server is started.',
  500,
);

export const NoSearchingResult: LogseqClientError = clientError('Not found.', 404);

/** Any other non-200 answer. */
export const httpStatusError = (status: number): LogseqClientError =>
  clientError(`Logseq returned HTTP ${status}.`, status);

export const UnknownIssues: LogseqClientError = clientError(
  'Unexpected error while talking to Logseq.',
  500,
);

export const isLogseqClientError = (value: unknown): value is LogseqClientError =>
  typeof value === 'object' && value !== null && clientErrors.has(value);

/**
 * The one error type thrown by the Logseq clients and services.
 *
 * webext-core serializes a thrown value with serialize-error, so only a real
 * Error keeps a readable `message` on the receiving side (content script,
 * sidebar). A plain `{ msg, status }` object would turn `err.message` into a JSON
 * dump. `msg` and `status` are kept as own properties for callers that want the
 * HTTP-like status.
 */
export class LogseqError extends Error {
  readonly status: number;
  readonly msg: string;
  readonly info: LogseqClientError;

  constructor(info: LogseqClientError) {
    super(info.msg);
    this.name = 'LogseqError';
    this.status = info.status;
    this.msg = info.msg;
    this.info = info;
  }
}

/**
 * Maps anything thrown while talking to Logseq onto a LogseqError: a thrown
 * fetch error or an HTTP Response with a non-200 status. `address` is the
 * host:port that was tried, for the "cannot connect" message.
 */
export const toLogseqError = (e: unknown, address?: string): LogseqError => {
  if (e instanceof LogseqError) {
    return e;
  }
  if (isLogseqClientError(e)) {
    return new LogseqError(e);
  }
  const status = (e as { status?: unknown } | null)?.status;
  if (status === 401) {
    return new LogseqError(TokenNotCurrect);
  }
  if (status === 403) {
    return new LogseqError(tokenRejected(403));
  }
  if (typeof status === 'number') {
    return new LogseqError(httpStatusError(status));
  }
  // Chrome: "Failed to fetch", Firefox: "NetworkError when attempting to
  // fetch resource.", Safari: "Load failed"; "Invalid URL" from a bad host.
  if (
    e instanceof TypeError &&
    /failed to fetch|networkerror|network request failed|invalid url|load failed/i.test(
      e.message,
    )
  ) {
    return new LogseqError(
      address ? cannotConnectWithLogseq(address) : CannotConnectWithLogseq,
    );
  }
  return new LogseqError(UnknownIssues);
};

/**
 * Client helpers swallow failures into one of the error objects above (see
 * catchIssues). Call this on their result to get a throw instead of treating
 * the error object as real data.
 */
export const throwIfClientError = <T>(value: T): T => {
  if (isLogseqClientError(value)) {
    throw new LogseqError(value);
  }
  return value;
};
