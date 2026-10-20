import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  logseqAuthTokenItem,
  logseqHostNameItem,
  logseqPortItem,
} from '@/utils/storage';
import LogseqClientBase from './client';

const okResponse = () =>
  new Response(JSON.stringify({ ok: true }), { status: 200 });

describe('LogseqClientBase.baseFetch', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fakeBrowser.reset();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const requestedUrl = () => String(fetchMock.mock.calls[0][0]);

  it('uses the default address when nothing is configured', async () => {
    await new LogseqClientBase().baseFetch('logseq.App.getAppInfo', []);
    expect(requestedUrl()).toBe('http://localhost:12315/api');
  });

  it('honours the host name and port saved by the options page', async () => {
    await logseqHostNameItem.setValue('192.168.1.20');
    await logseqPortItem.setValue(23456);
    await logseqAuthTokenItem.setValue('secret');

    await new LogseqClientBase().baseFetch('logseq.App.getAppInfo', []);

    expect(requestedUrl()).toBe('http://192.168.1.20:23456/api');
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer secret');
  });
});
