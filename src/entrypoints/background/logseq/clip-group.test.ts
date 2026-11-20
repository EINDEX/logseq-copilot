import { describe, expect, it, vi } from 'vitest';
import type { ClipBlock } from '@/utils/clip-template';
import { writeClipBlocks, type BlockWriter } from './clip-blocks';
import { findGroupTarget } from './clip-group';

const block = (uuid: string, content: string, extra: object = {}) => ({
  uuid,
  content,
  children: [],
  ...extra,
});
const URL_A = 'https://a.com/x';
const isTask = (b: any) => Boolean(b.marker);
const find = (blocks: unknown, rootContent = '#[[Clip]] [t](https://a.com/x)') =>
  findGroupTarget(blocks, { url: URL_A }, rootContent, isTask);

describe('findGroupTarget', () => {
  it('takes the last top-level block that links to the page', () => {
    const blocks = [
      block('1', '[t](https://a.com/x)'),
      block('2', '[other](https://a.com/y)'),
      block('3', 'again http://A.com/x/?utm_source=z#h'),
    ];
    expect(find(blocks)?.uuid).toBe('3');
  });

  it('never looks below the top level', () => {
    const nested = block('1', 'Notes', { children: [block('2', '[t](https://a.com/x)')] });
    expect(find([nested])).toBeUndefined();
  });

  it('does not mix a task with a clip', () => {
    const blocks = [
      block('1', 'TODO [t](https://a.com/x)', { marker: 'TODO' }),
      block('2', '[t](https://a.com/x)'),
    ];
    expect(find(blocks)?.uuid).toBe('2');
    expect(find(blocks, 'TODO [t](https://a.com/x)')?.uuid).toBe('1');
    expect(find([blocks[0]])).toBeUndefined();
    expect(find([blocks[1]], 'DONE [t](https://a.com/x)')).toBeUndefined();
  });

  it('answers nothing for a missing page', () => {
    expect(find(null)).toBeUndefined();
    expect(find({ error: 'no page' })).toBeUndefined();
  });

  it('reads the title of a DB block', () => {
    expect(find([{ uuid: '1', title: '[t](https://a.com/x)' }])?.uuid).toBe('1');
  });

  it('answers nothing without a URL to match', () => {
    expect(
      findGroupTarget([block('1', 'x')], { url: '' }, 'root', isTask),
    ).toBeUndefined();
  });
});

describe('writeClipBlocks into an existing block', () => {
  const leaf = (content: string, ...children: ClipBlock[]): ClipBlock => ({ content, children });
  const target = { uuid: 'T' };
  const make = () => {
    const calls: string[] = [];
    let next = 0;
    const writer: BlockWriter = {
      append: vi.fn(async (page, content) => {
        calls.push(`append ${page} | ${content}`);
        return { uuid: `n${++next}` };
      }),
      insertChild: vi.fn(async (parent, content) => {
        calls.push(`child ${parent} | ${content}`);
        return { uuid: `n${++next}` };
      }),
    };
    return { calls, writer };
  };

  it('appends the one child, with its subtree, and writes no root', async () => {
    const { calls, writer } = make();
    const result = await writeClipBlocks(
      'P',
      leaf('root', leaf('c', leaf('d'))),
      writer,
      target,
    );
    expect(calls).toEqual(['child T | c', 'child n1 | d']);
    expect(result).toMatchObject({ rootUuid: 'n1', children: 1, added: true, groupedUnder: 'T' });
  });

  it('makes the first child the node and the others its children, after its own', async () => {
    const { calls, writer } = make();
    const result = await writeClipBlocks(
      'P',
      leaf('root', leaf('a', leaf('a1')), leaf('b'), leaf('c', leaf('c1'))),
      writer,
      target,
    );
    expect(calls).toEqual([
      'child T | a',
      'child n1 | a1',
      'child n1 | b',
      'child n1 | c',
      'child n4 | c1',
    ]);
    expect(result).toMatchObject({ rootUuid: 'n1', children: 3, added: true });
  });

  it('puts the note child last under the node this clip added, not under the target', async () => {
    const { calls, writer } = make();
    const note: ClipBlock = { content: 'my note', children: [], note: true };
    const result = await writeClipBlocks(
      'P',
      leaf('root', leaf('a'), leaf('b'), note),
      writer,
      target,
    );
    expect(calls).toEqual(['child T | a', 'child n1 | b', 'child n1 | my note']);
    expect(result).toMatchObject({ rootUuid: 'n1', noteUuid: 'n3', groupedUnder: 'T' });
  });

  it('names the node itself as the note block when the note is the only child', async () => {
    const { calls, writer } = make();
    const note: ClipBlock = { content: 'my note', children: [], note: true };
    const result = await writeClipBlocks('P', leaf('root', note), writer, target);
    expect(calls).toEqual(['child T | my note']);
    expect(result).toMatchObject({ rootUuid: 'n1', noteUuid: 'n1' });
  });

  it('writes nothing for a root without children, and names the existing block', async () => {
    const { calls, writer } = make();
    const result = await writeClipBlocks('P', leaf('root'), writer, target);
    expect(calls).toEqual([]);
    expect(result).toMatchObject({ rootUuid: 'T', added: false });
  });

  it('writes a new root when nothing matched', async () => {
    const { calls, writer } = make();
    const result = await writeClipBlocks('P', leaf('root', leaf('c')), writer);
    expect(calls).toEqual(['append P | root', 'child n1 | c']);
    expect(result).toMatchObject({ rootUuid: 'n1', added: true, children: 1 });
    expect(result.groupedUnder).toBeUndefined();
  });
});
