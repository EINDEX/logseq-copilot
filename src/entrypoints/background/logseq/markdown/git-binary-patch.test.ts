import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { gitBinaryPatch, gitBlobId } from './git-binary-patch';

const BASE85 =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~';

/** Decode the data lines of a `literal` hunk, as git apply does. */
const decodeLines = (lines: string[]) => {
  const out: number[] = [];
  for (const line of lines) {
    const c = line.charCodeAt(0);
    const length = c <= 90 ? c - 64 : c - 96 + 26;
    const bytes: number[] = [];
    for (let i = 1; i < line.length; i += 5) {
      let acc = 0;
      for (const ch of line.slice(i, i + 5)) acc = acc * 85 + BASE85.indexOf(ch);
      bytes.push((acc >>> 24) & 255, (acc >>> 16) & 255, (acc >>> 8) & 255, acc & 255);
    }
    out.push(...bytes.slice(0, length));
  }
  return Buffer.from(out);
};

describe('gitBlobId', () => {
  it('is the object id git gives the file', async () => {
    expect(await gitBlobId(new Uint8Array())).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    expect(await gitBlobId(new TextEncoder().encode('hello\n'))).toBe(
      'ce013625030ba8dba906f756967f9e9ca394464a',
    );
  });
});

describe('gitBinaryPatch', () => {
  it('creates the file with the bytes, checked by its full object id', async () => {
    const bytes = new Uint8Array(crypto.randomBytes(5000));
    const { id, patch } = await gitBinaryPatch('assets/a_1.png', bytes);
    const lines = patch.split('\n');
    expect(lines.slice(0, 5)).toEqual([
      'diff --git a/assets/a_1.png b/assets/a_1.png',
      'new file mode 100644',
      `index 0000000000000000000000000000000000000000..${id}`,
      'GIT binary patch',
      'literal 5000',
    ]);
    expect(id).toBe(await gitBlobId(bytes));

    const data = lines.slice(5, lines.indexOf(''));
    // Every line is at most 52 bytes: a length letter and 5 chars per 4 bytes.
    expect(data.every((line) => line.length <= 66)).toBe(true);
    expect(zlib.inflateSync(decodeLines(data)).equals(Buffer.from(bytes))).toBe(true);
    expect(patch.endsWith('\nliteral 0\nHcmV?d00001\n\n')).toBe(true);
  });
});
