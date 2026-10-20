import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { getLogseqCopliotConfig } from '@/config';
import { changeOptionsHostToHostNameAndPort } from './upgrade';

const setRaw = (items: Record<string, unknown>) =>
  fakeBrowser.storage.local.set(items);
const getRaw = async () => fakeBrowser.storage.local.get();

describe('changeOptionsHostToHostNameAndPort', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('migrates a legacy full-URL host into host name and port', async () => {
    await setRaw({ logseqHost: 'http://192.168.1.20:23456' });

    await changeOptionsHostToHostNameAndPort();

    const config = await getLogseqCopliotConfig();
    expect(config.logseqHostName).toBe('192.168.1.20');
    expect(config.logseqPort).toBe(23456);
    expect(await getRaw()).not.toHaveProperty('logseqHost');
  });

  it('falls back to the scheme default port when the URL has none', async () => {
    await setRaw({ logseqHost: 'http://nas.local' });

    await changeOptionsHostToHostNameAndPort();

    const config = await getLogseqCopliotConfig();
    expect(config.logseqHostName).toBe('nas.local');
    expect(config.logseqPort).toBe(80);
  });

  it('accepts a legacy host without a scheme', async () => {
    await setRaw({ logseqHost: 'localhost:9999' });

    await changeOptionsHostToHostNameAndPort();

    const config = await getLogseqCopliotConfig();
    expect(config.logseqHostName).toBe('localhost');
    expect(config.logseqPort).toBe(9999);
  });

  it('is idempotent', async () => {
    await setRaw({ logseqHost: 'http://192.168.1.20:23456' });

    await changeOptionsHostToHostNameAndPort();
    const afterFirst = await getRaw();
    await changeOptionsHostToHostNameAndPort();

    expect(await getRaw()).toEqual(afterFirst);
  });

  it('does nothing when there is no legacy host', async () => {
    await setRaw({ logseqHostName: 'myhost', logseqPort: 4242 });

    await changeOptionsHostToHostNameAndPort();

    expect(await getRaw()).toEqual({
      logseqHostName: 'myhost',
      logseqPort: 4242,
    });
  });

  it('does not write defaults over an untouched config', async () => {
    await changeOptionsHostToHostNameAndPort();
    expect(await getRaw()).toEqual({});
  });

  it('keeps host name and port the user already saved and drops the stale key', async () => {
    await setRaw({
      logseqHost: 'http://old-host:1111',
      logseqHostName: 'new-host',
      logseqPort: 2222,
    });

    await changeOptionsHostToHostNameAndPort();

    const config = await getLogseqCopliotConfig();
    expect(config.logseqHostName).toBe('new-host');
    expect(config.logseqPort).toBe(2222);
    expect(await getRaw()).not.toHaveProperty('logseqHost');
  });

  it('drops an unparseable legacy value without touching host name/port', async () => {
    await setRaw({ logseqHost: 'http://' });

    await changeOptionsHostToHostNameAndPort();

    expect(await getRaw()).toEqual({});
  });
});
