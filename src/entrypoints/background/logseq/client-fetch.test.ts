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

describe('LogseqClientBase.baseText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const answer = (body: string, contentType: string) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': contentType } })),
    );

  it('resolves with the text Logseq answers', async () => {
    answer('/home/.logseq/storages/x/image.patch\n', 'text/plain; charset=utf-8');
    await expect(new LogseqClientBase().baseText('write_plugin_storage_file', [])).resolves.toBe(
      '/home/.logseq/storages/x/image.patch\n',
    );
  });

  it("throws on Logseq's error reply, with that reply in the message", async () => {
    answer(JSON.stringify({ error: 'fatal: not a git repository: (null)' }), 'application/json');
    await expect(new LogseqClientBase().baseText('exec_git_command', [['apply']])).rejects.toThrow(
      'Logseq refused exec_git_command: {"error":"fatal: not a git repository: (null)"}',
    );
  });
});
