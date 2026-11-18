/*
 * A file graph's API writes text files only (`write_plugin_storage_file`), but
 * it runs git in the graph folder (`exec_git_command`). So a binary file is
 * written as a text patch that creates it, `git apply` makes the file, and
 * `git hash-object` checks it. Probed on Logseq 0.10.15: git runs with the
 * graph folder as its work tree, so the paths of the patch are relative to it.
 */

/** git's base85 alphabet (base85.c). */
const BASE85 =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~';

/** One line of a binary patch: its length as a letter, then 5 chars per 4 bytes. */
const base85Line = (bytes: Uint8Array) => {
  let out =
    bytes.length <= 26
      ? String.fromCharCode(64 + bytes.length)
      : String.fromCharCode(96 + bytes.length - 26);
  for (let i = 0; i < bytes.length; i += 4) {
    let acc = 0;
    for (let j = 0; j < 4; j++) acc = acc * 256 + (bytes[i + j] ?? 0);
    let group = '';
    for (let k = 0; k < 5; k++) {
      group = BASE85[acc % 85] + group;
      acc = Math.floor(acc / 85);
    }
    out += group;
  }
  return out;
};

/** The bytes compressed with zlib, as git writes the data of a binary patch. */
const deflate = async (bytes: Uint8Array) => {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The object id git gives a file with these bytes (SHA-1 of the blob). */
export const gitBlobId = async (bytes: Uint8Array) => {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const blob = new Uint8Array(header.length + bytes.length);
  blob.set(header);
  blob.set(bytes, header.length);
  return hex(await crypto.subtle.digest('SHA-1', blob));
};

/**
 * A patch that creates the file `path` (relative to the work tree, no spaces
 * or quotes) with `bytes`. `git apply` checks the result against the full
 * object id on the index line, and refuses the patch when the file exists.
 */
export const gitBinaryPatch = async (path: string, bytes: Uint8Array) => {
  const id = await gitBlobId(bytes);
  const data = await deflate(bytes);
  const lines: string[] = [];
  for (let i = 0; i < data.length; i += 52) {
    lines.push(base85Line(data.subarray(i, i + 52)));
  }
  return {
    id,
    patch: [
      `diff --git a/${path} b/${path}`,
      'new file mode 100644',
      `index 0000000000000000000000000000000000000000..${id}`,
      'GIT binary patch',
      `literal ${bytes.length}`,
      ...lines,
      '',
      // The reverse: the file did not exist.
      'literal 0',
      'HcmV?d00001',
      '',
      '',
    ].join('\n'),
  };
};
