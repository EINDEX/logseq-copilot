/**
 * toLogseqError: what a failed request to the Logseq HTTP API turns into.
 * The message is all the user sees, so it must name the cause.
 */
import { describe, expect, test } from 'vitest';
import {
  CannotConnectWithLogseq,
  LogseqError,
  LogseqVersionIsLower,
  TokenNotCurrect,
  UnknownIssues,
  isLogseqClientError,
  throwIfClientError,
  toLogseqError,
} from './error';

const ADDRESS = 'localhost:12315';
const UNREACHABLE =
  'Cannot connect to Logseq at localhost:12315. Check that Logseq is running and its HTTP API server is started on this address.';

describe('toLogseqError', () => {
  test.each([
    ['Chrome', new TypeError('Failed to fetch')],
    ['Firefox', new TypeError('NetworkError when attempting to fetch resource.')],
    ['Safari', new TypeError('Load failed')],
    ['an invalid host', new TypeError('Invalid URL')],
  ])('a network failure (%s) names the address that was tried', (_name, e) => {
    const err = toLogseqError(e, ADDRESS);
    expect(err).toBeInstanceOf(LogseqError);
    expect(err.message).toBe(UNREACHABLE);
    expect(isLogseqClientError(err.info)).toBe(true);
  });

  test('a network failure without an address still says what to check', () => {
    expect(toLogseqError(new TypeError('Failed to fetch')).message).toBe(
      CannotConnectWithLogseq.msg,
    );
  });

  test('401 says the token is wrong', () => {
    const err = toLogseqError(new Response('', { status: 401 }), ADDRESS);
    expect(err.message).toBe(
      "The authorization token is wrong (Logseq returned HTTP 401). Check it in Logseq's API server settings.",
    );
    expect(err.info).toBe(TokenNotCurrect);
    expect(err.status).toBe(401);
  });

  test('403 says the token is wrong', () => {
    const err = toLogseqError(new Response('', { status: 403 }), ADDRESS);
    expect(err.message).toBe(
      "The authorization token is wrong (Logseq returned HTTP 403). Check it in Logseq's API server settings.",
    );
    expect(err.status).toBe(403);
  });

  test('another HTTP status is named', () => {
    const err = toLogseqError(new Response('boom', { status: 500 }), ADDRESS);
    expect(err.message).toBe('Logseq returned HTTP 500.');
    expect(err.status).toBe(500);
  });

  test('a LogseqError or a known error object passes through', () => {
    const original = new LogseqError(LogseqVersionIsLower);
    expect(toLogseqError(original)).toBe(original);
    expect(toLogseqError(LogseqVersionIsLower).info).toBe(LogseqVersionIsLower);
  });

  test('anything else is an unexpected error', () => {
    const err = toLogseqError(new SyntaxError('Unexpected token < in JSON'));
    expect(err.info).toBe(UnknownIssues);
    expect(err.message).toBe('Unexpected error while talking to Logseq.');
    expect(err.message).not.toMatch(/Unknow /);
  });
});

describe('isLogseqClientError / throwIfClientError', () => {
  test('API data of the same shape is not an error', () => {
    const data = { msg: 'success', status: 200, response: null };
    expect(isLogseqClientError(data)).toBe(false);
    expect(throwIfClientError(data)).toBe(data);
    expect(isLogseqClientError(null)).toBe(false);
    expect(isLogseqClientError('x')).toBe(false);
  });

  test('an error object made for one request is thrown', () => {
    const info = toLogseqError(new TypeError('Failed to fetch'), ADDRESS).info;
    expect(() => throwIfClientError(info)).toThrow(UNREACHABLE);
  });
});
