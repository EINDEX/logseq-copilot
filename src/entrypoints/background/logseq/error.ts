import type { LogseqResponseType } from './client';

export type LogseqClientError = LogseqResponseType<null>;

export const TokenNotCurrect: LogseqClientError = {
  msg: 'Token not correct, Please checking your Logseq Authorization Setting.',
  status: 401,
  response: null,
};

export const LogseqVersionIsLower: LogseqClientError = {
  msg: 'Logseq version is lower, Please upgrade your Logseq version.\nhttps://logseq.com/downloads',
  status: 500,
  response: null,
};

export const CannotConnectWithLogseq: LogseqClientError = {
  msg: 'Cannot connect to Logseq, Please open your Logseq and config well.',
  status: 500,
  response: null,
};

export const NoSearchingResult: LogseqClientError = {
  msg: 'Not found.',
  status: 404,
  response: null,
};

export const UnknownIssues: LogseqClientError = {
  msg: 'Unknow issues, may you can connect with author.',
  status: 500,
  response: null,
};

const KNOWN_CLIENT_ERRORS: readonly LogseqClientError[] = [
  TokenNotCurrect,
  LogseqVersionIsLower,
  CannotConnectWithLogseq,
  NoSearchingResult,
  UnknownIssues,
];

export const isLogseqClientError = (value: unknown): value is LogseqClientError =>
  KNOWN_CLIENT_ERRORS.includes(value as LogseqClientError);

/**
 * The one error type thrown by the Logseq clients and services.
 *
 * webext-core serializes a thrown value with serialize-error, so only a real
 * Error keeps a readable `message` on the receiving side (content script,
 * popup). A plain `{ msg, status }` object would turn `err.message` into a JSON
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

/** Maps anything thrown while talking to Logseq onto a LogseqError. */
export const toLogseqError = (e: unknown): LogseqError => {
  if (e instanceof LogseqError) {
    return e;
  }
  if (isLogseqClientError(e)) {
    return new LogseqError(e);
  }
  if ((e as { status?: unknown } | null)?.status === 401) {
    return new LogseqError(TokenNotCurrect);
  }
  if (
    e instanceof TypeError &&
    /failed to fetch|networkerror|network request failed|invalid url|load failed/i.test(
      e.message,
    )
  ) {
    return new LogseqError(CannotConnectWithLogseq);
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
