import { describe, expect, it } from 'vitest';
import {
  buildLogseqOrigin,
  isValidLogseqHostName,
  isValidLogseqPort,
} from './connection';

describe('isValidLogseqHostName', () => {
  it.each([
    'localhost',
    '127.0.0.1',
    'my-nas.local',
    'LOCALHOST',
    '[::1]',
    '::1',
  ])('accepts %s', (name) => expect(isValidLogseqHostName(name)).toBe(true));

  it.each([
    '',
    '   ',
    'http://localhost',
    'localhost:12315',
    'localhost/path',
    'user@localhost',
    'local host',
  ])('rejects %j', (name) => expect(isValidLogseqHostName(name)).toBe(false));
});

describe('isValidLogseqPort', () => {
  it('accepts 1..65535 integers only', () => {
    expect(isValidLogseqPort(12315)).toBe(true);
    expect(isValidLogseqPort(1)).toBe(true);
    expect(isValidLogseqPort(65535)).toBe(true);
    expect(isValidLogseqPort(0)).toBe(false);
    expect(isValidLogseqPort(65536)).toBe(false);
    expect(isValidLogseqPort(NaN)).toBe(false);
    expect(isValidLogseqPort(1.5)).toBe(false);
  });
});

describe('buildLogseqOrigin', () => {
  it('combines host name and port', () => {
    expect(buildLogseqOrigin('localhost', 12315)).toBe(
      'http://localhost:12315',
    );
    expect(buildLogseqOrigin('192.168.1.5', 8080)).toBe(
      'http://192.168.1.5:8080',
    );
  });

  it('brackets IPv6 hosts', () => {
    expect(buildLogseqOrigin('::1', 12315)).toBe('http://[::1]:12315');
    expect(buildLogseqOrigin('[::1]', 12315)).toBe('http://[::1]:12315');
  });

  it('omits the default http port like URL does', () => {
    expect(buildLogseqOrigin('nas.local', 80)).toBe('http://nas.local');
  });
});
