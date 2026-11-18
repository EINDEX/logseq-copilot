import { describe, expect, it } from 'vitest';
import { isPrivateHost } from './private-host';

describe('isPrivateHost', () => {
  it.each([
    '127.0.0.1',
    '127.1.2.3',
    '0.0.0.0',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '224.0.0.1',
    'localhost',
    'logseq.localhost',
    'printer.local',
    'metadata.google.internal',
    'nas.lan',
    'box.home.arpa',
    'router',
    'localhost.',
    '[::1]',
    '[::]',
    '[fd00::1]',
    '[fe80::1]',
    '[ff02::1]',
    '[::ffff:7f00:1]',
    '[::ffff:c0a8:101]',
    '[::ffff:0:7f00:1]',
    '[64:ff9b::7f00:1]',
    '[64:ff9b::a00:1]',
    '[64:ff9b:1::808:808]',
    '[2002:7f00:1::]',
    '[2002:c0a8:101::1]',
  ])('%s is a host of this machine or the local network', (host) => {
    expect(isPrivateHost(host)).toBe(true);
  });

  it.each(['e.com', 'cdn.example.org', '8.8.8.8', '172.32.0.1', '[2606:4700::1111]', '[::ffff:808:808]', '[64:ff9b::808:808]', '[2002:808:808::1]'])(
    '%s is not',
    (host) => {
      expect(isPrivateHost(host)).toBe(false);
    },
  );
});
