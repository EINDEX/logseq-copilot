import { describe, expect, it } from 'vitest';
import {
  backspace,
  deleteForward,
  enter,
  indent,
  isCanonical,
  isLossless,
  lineStart,
  normalize,
  outdent,
  outlineToCanonical,
  paste,
  scan,
  shiftEnter,
  toCanonical,
  toStored,
  type DocState,
} from './outline-doc';
import {
  DEFAULT_TEMPLATE_CONTENT,
  TASK_TEMPLATE_CONTENT,
  TEMPLATE_PRESETS,
} from './default-templates';
import { parseOutline } from './clip-template';

/** A state from text with `|` for the caret, or `[` and `]` for a selection. */
const at = (marked: string): DocState => {
  const caret = marked.indexOf('|');
  if (caret !== -1) {
    const text = marked.replace('|', '');
    return { text, from: caret, to: caret };
  }
  const from = marked.indexOf('[');
  const to = marked.indexOf(']') - 1;
  return { text: marked.replace('[', '').replace(']', ''), from, to };
};

/** How many blocks of `text` are at depth 0. */
const roots = (text: string) =>
  scan(text).blocks.filter((block) => block.depth === 0).length;

/** The inverse of `at`. */
const show = (state: DocState | null): string => {
  if (!state) return 'null';
  const { text, from, to } = state;
  if (from === to) return text.slice(0, from) + '|' + text.slice(from);
  return `${text.slice(0, from)}[${text.slice(from, to)}]${text.slice(to)}`;
};

describe('canonical form', () => {
  it('shows a flat template as one block', () => {
    expect(toCanonical(DEFAULT_TEMPLATE_CONTENT)).toBe(
      '- #[[Clip]] [{{title}}]({{url}})\n  {{content}}',
    );
    expect(toCanonical('')).toBe('- ');
    expect(toCanonical('a\n\nb')).toBe('- a\n\n  b');
  });

  it('uses a canonical tree template as it is', () => {
    expect(toCanonical(TASK_TEMPLATE_CONTENT)).toBe(TASK_TEMPLATE_CONTENT);
  });

  it('stores one block without children as the flat template', () => {
    expect(toStored('- a\n  b')).toBe('a\nb');
    expect(toStored('- ')).toBe('');
    expect(toStored('- a\n  - b')).toBe('- a\n  - b');
    expect(toStored('- a\n- b')).toBe('- a\n- b');
  });

  it('keeps a single block as an outline when flat form would read as a tree', () => {
    expect(toStored('- - a')).toBe('- - a');
  });

  it('is canonical only when every line is', () => {
    expect(isCanonical('- a\n  b\n  - c\n    d\n\n    e')).toBe(true);
    expect(isCanonical('- a\n  ')).toBe(true); // a new line, not typed in yet
    expect(isCanonical('- a\n    ')).toBe(false);
    expect(isCanonical('- a\n\t- b')).toBe(false);
    expect(isCanonical('- a\n   - b')).toBe(false);
    expect(isCanonical('- a\n    - b')).toBe(false); // depth jumps by 2
    expect(isCanonical('- a\nb')).toBe(false);
    expect(isCanonical('a')).toBe(false);
    expect(isCanonical('')).toBe(false);
    expect(isCanonical('-')).toBe(false);
  });

  it('normalizes tabs, odd indentation, depth jumps and a missing first bullet', () => {
    expect(normalize('- a\n\t- b')).toBe('- a\n  - b');
    expect(normalize('- a\n      - b')).toBe('- a\n  - b');
    expect(normalize('- a\n b')).toBe('- a\n  b');
    expect(normalize('')).toBe('- ');
    expect(normalize('abc')).toBe('- abc');
    expect(normalize('- a\n-')).toBe('- a\n  - ');
  });

  it('reads only the first block at depth 0', () => {
    expect(normalize('- a\n- b')).toBe('- a\n  - b');
    expect(normalize('- a\n  - b\n- c\n  - d')).toBe('- a\n  - b\n  - c\n    - d');
    expect(isCanonical('- a\n- b')).toBe(false);
  });

  it('is idempotent', () => {
    for (const text of [
      '- a\n    - b\n  c',
      '',
      'x\n- y\n\t- z',
      '- a\n\n\n- b',
    ]) {
      const once = normalize(text);
      expect(normalize(once)).toBe(once);
    }
  });

  it('keeps code fences whole', () => {
    const text = '- a\n  ```\n  - not a block\n  ```\n  - b';
    expect(isCanonical(text)).toBe(true);
    expect(isLossless(text)).toBe(true);
  });
});

describe('round trips', () => {
  const nestedClip = '- [{{title}}]({{url}})\n  - {{content}}';
  const presets = TEMPLATE_PRESETS.map((p): [string, string] => [
    p.name,
    p.content,
  ]);

  const cases: [string, string][] = [
    ['the built-in Clip', DEFAULT_TEMPLATE_CONTENT],
    ['the nested Task', TASK_TEMPLATE_CONTENT],
    ['a nested clip', nestedClip],
    ...presets,
  ];
  it.each(cases)('%s round-trips byte for byte', (_, content) => {
    expect(isLossless(content)).toBe(true);
    expect(toStored(toCanonical(content))).toBe(content);
  });

  it('round-trips flat templates with blank lines, indentation and trailing newline', () => {
    for (const flat of [
      'a\n\nb',
      'a\n  indented\n    more',
      'text\n',
      '',
      '  leading',
      'a {{title}}\n```\ncode\n```',
      'a\n\\- escaped',
    ]) {
      expect(isLossless(flat), JSON.stringify(flat)).toBe(true);
      expect(toStored(toCanonical(flat))).toBe(flat);
    }
  });

  it('every preset stays a template that renders the same blocks', () => {
    for (const preset of TEMPLATE_PRESETS) {
      expect(isLossless(preset.content), preset.name).toBe(true);
    }
  });

  it('opens a tree with a continuation line and properties in Outline', () => {
    const reading = TEMPLATE_PRESETS.find((p) => p.id === 'reading-note')!;
    expect(isLossless(reading.content)).toBe(true);
  });

  it.each([
    ['a flat template with a later bullet', 'intro\n- a\n- b'],
    ['Liquid tags around blocks', '{% if title %}\n- {{title}}\n{% endif %}'],
    ['Liquid tags before a flat bullet', '{% if x %}\n- a'],
    ['tabs', '- a\n\t- b'],
    ['odd indentation', '- a\n   - b'],
    ['a depth jump', '- a\n    - b'],
    ['a continuation indented less than its block', '- a\n  - b\n c'],
    ['a bare dash', '-\n  - a'],
    ['a tree that is one block', '- {{title}}'],
  ])('falls back to Text for %s', (_, stored) => {
    expect(isLossless(stored)).toBe(false);
  });

  it('opens a tree with a blank line between blocks', () => {
    expect(isLossless('- a\n\n  - b')).toBe(true);
  });

  it('opens a stored template with more than one root as Text', () => {
    expect(isLossless('- a\n- b')).toBe(false);
    expect(isLossless('- a\n  - b\n- c')).toBe(false);
  });

  it('reads the same block structure as the renderer', () => {
    const stored = '- a\n  b\n  - c\n    ```\n    - d\n    ```\n  - e';
    expect(isLossless(stored)).toBe(true);
    expect(parseOutline(stored)).toHaveLength(1);
  });
});

describe('enter', () => {
  it('splits at the end into a sibling behind the subtree', () => {
    expect(show(enter(at('- a\n  - b|\n    - c')))).toBe(
      '- a\n  - b\n    - c\n  - |',
    );
    expect(show(enter(at('- a\n  - b|')))).toBe('- a\n  - b\n  - |');
  });

  it('adds a child to the root, before its children, never a second root', () => {
    expect(show(enter(at('- a|\n  - b')))).toBe('- a\n  - |\n  - b');
    expect(show(enter(at('- a|')))).toBe('- a\n  - |');
    expect(show(enter(at('- |')))).toBe('- \n  - |');
    expect(show(enter(at('- a|\n  more\n  - b')))).toBe('- a\n  - |\n    more\n  - b');
    expect(show(enter(at('- a\n  more|\n  - b')))).toBe('- a\n  more\n  - |\n  - b');
    for (const marked of ['- a|', '- a|\n  - b', '- a|b', '- |a', '- [a]b']) {
      expect(roots(enter(at(marked)).text), marked).toBe(1);
    }
  });

  it('splits in the middle, the text after the caret moving into the new block', () => {
    expect(show(enter(at('- ab|cd')))).toBe('- ab\n  - |cd');
    expect(show(enter(at('- a\n  - b|c\n    d')))).toBe(
      '- a\n  - b\n  - |c\n    d',
    );
  });

  it('keeps children with the second half of a split block', () => {
    expect(show(enter(at('- x\n  - ab|cd\n    - child')))).toBe(
      '- x\n  - ab\n  - |cd\n    - child',
    );
  });

  it('adds an empty block above when the caret is at the start of the text', () => {
    expect(show(enter(at('- x\n  - |abc')))).toBe('- x\n  - \n  - |abc');
  });

  it('adds a sibling after an empty block at depth 1', () => {
    expect(show(enter(at('- a\n  - |')))).toBe('- a\n  - |');
  });

  it('outdents an empty block below depth 1', () => {
    expect(show(enter(at('- a\n  - b\n    - |')))).toBe('- a\n  - b\n  - |');
  });

  it('replaces a selection', () => {
    expect(show(enter(at('- a[bc]d')))).toBe('- a\n  - |d');
  });

  it('splits inside a continuation line', () => {
    expect(show(enter(at('- a\n  b|c')))).toBe('- a\n  b\n  - |c');
  });

  it('splits at the end of the first line of a two-line block', () => {
    expect(show(enter(at('- a|\n  b')))).toBe('- a\n  - |\n    b');
  });
});

describe('shiftEnter', () => {
  it('adds a line inside the block', () => {
    expect(show(shiftEnter(at('- a|')))).toBe('- a\n  |');
    expect(show(shiftEnter(at('- x\n  - a|b')))).toBe('- x\n  - a\n    |b');
    expect(show(shiftEnter(at('- a\n  b|')))).toBe('- a\n  b\n  |');
  });
});

describe('indent', () => {
  it('indents a block with its subtree', () => {
    expect(show(indent(at('- r\n  - a\n  - b|\n    - c')))).toBe(
      '- r\n  - a\n    - b|\n      - c',
    );
  });

  it('keeps the continuation lines with their block', () => {
    expect(show(indent(at('- r\n  - a\n  - b|\n    more\n\n    end')))).toBe(
      '- r\n  - a\n    - b|\n      more\n\n      end',
    );
  });

  it('does nothing at the deepest level or on the first block', () => {
    const deepest = at('- a\n  - b|');
    expect(indent(deepest)).toBe(deepest);
    const first = at('- a|\n  - b');
    expect(indent(first)).toBe(first);
  });

  it('stops at one level below the block before', () => {
    expect(show(indent(at('- r\n  - a\n    - b\n  - c|')))).toBe(
      '- r\n  - a\n    - b\n    - c|',
    );
    expect(show(indent(at('- a\n  - b\n  - c|')))).toBe('- a\n  - b\n    - c|');
  });

  it('applies to every selected block', () => {
    expect(show(indent(at('- r\n  - a\n  - [b\n  - c\n  - d]')))).toBe(
      '- r\n  - a\n    - [b\n    - c\n    - d]',
    );
  });

  it('moves a selected parent once, its child with it', () => {
    expect(show(indent(at('- r\n  - a\n  - [b\n    - c]')))).toBe(
      '- r\n  - a\n    - [b\n      - c]',
    );
  });

  it('does nothing for a selection that starts at a block that cannot move', () => {
    const state = at('- [a\n  - b]');
    expect(indent(state)).toBe(state);
  });
});

describe('outdent', () => {
  it('outdents a block with its subtree', () => {
    expect(show(outdent(at('- r\n  - a\n    - b|\n      - c')))).toBe(
      '- r\n  - a\n  - b|\n    - c',
    );
  });

  it('turns the next siblings into children, like Logseq', () => {
    expect(show(outdent(at('- r\n  - a\n    - b|\n    - c')))).toBe(
      '- r\n  - a\n  - b|\n    - c',
    );
  });

  it('does not go below the top level', () => {
    const state = at('- a|');
    expect(outdent(state)).toBe(state);
  });

  it('never makes a block a second root', () => {
    for (const marked of ['- a\n  - b|', '- a\n  - [b\n  - c]', '- a|\n  - b\n    - c']) {
      const state = at(marked);
      expect(outdent(state), marked).toBe(state);
    }
    expect(roots(outdent(at('- a\n  - b\n    - [c]'))!.text)).toBe(1);
  });

  it('applies to every selected block', () => {
    expect(show(outdent(at('- r\n  - a\n    - [b\n    - c]')))).toBe(
      '- r\n  - a\n  - [b\n  - c]',
    );
  });

  it('keeps blank continuation lines empty', () => {
    expect(show(outdent(at('- r\n  - a\n    - b|\n\n      c')))).toBe(
      '- r\n  - a\n  - b|\n\n    c',
    );
  });

  it('keeps a caret in the marker out of the removed indent', () => {
    expect(outdent({ text: '- r\n  - a\n    - b', from: 11, to: 11 }).from).toBe(10);
  });
});

describe('backspace', () => {
  it('returns null away from the start of a block text', () => {
    expect(backspace(at('- a|b'))).toBeNull();
    expect(backspace(at('- [a]b'))).toBeNull();
  });

  it('deletes an empty block, the caret at the end of the block before', () => {
    expect(show(backspace(at('- a\n  - |')))).toBe('- a|');
    expect(show(backspace(at('- a\n  - b\n  - |')))).toBe('- a\n  - b|');
  });

  it('merges into the end of the block before', () => {
    expect(show(backspace(at('- ab\n  - |cd')))).toBe('- ab|cd');
    expect(show(backspace(at('- a\n  - |b')))).toBe('- a|b');
  });

  it('keeps the continuation lines of the merged block', () => {
    expect(show(backspace(at('- a\n  - |b\n    c')))).toBe('- a|b\n  c');
  });

  it('makes the children of the merged block children of the previous one', () => {
    expect(show(backspace(at('- a\n  - |b\n    - c\n      - d')))).toBe(
      '- a|b\n  - c\n    - d',
    );
    expect(show(backspace(at('- a\n  - |b\n    - c')))).toBe('- a|b\n  - c');
    expect(show(backspace(at('- a\n  - x\n  - |b\n    - c')))).toBe(
      '- a\n  - x|b\n    - c',
    );
  });

  it('keeps one root when merging into the root', () => {
    expect(show(backspace(at('- a\n  - |b\n    - c\n  - d')))).toBe(
      '- a|b\n  - c\n  - d',
    );
    expect(show(backspace(at('- a\n  - |')))).toBe('- a|');
  });

  it('leaves the blocks after the merged subtree alone', () => {
    expect(show(backspace(at('- a\n  - |b\n  - c')))).toBe('- a|b\n  - c');
  });

  it('does nothing at the start of the first block', () => {
    const state = at('- |a');
    expect(backspace(state)).toBe(state);
  });

  it('joins a continuation line with the line above', () => {
    expect(show(backspace(at('- a\n  |b')))).toBe('- a|b');
    expect(show(backspace(at('- a\n  - b\n    |c')))).toBe('- a\n  - b|c');
  });

  it('yields canonical text', () => {
    for (const marked of [
      '- a\n  - |b\n    - c',
      '- a\n  - |b\n    - c\n  - d',
      '- a\n  - x\n    - y\n  - |b\n    - c',
    ]) {
      const { text } = backspace(at(marked))!;
      expect(isCanonical(text), marked).toBe(true);
      expect(roots(text), marked).toBe(1);
    }
  });
});

describe('deleteForward', () => {
  it('merges the next block into this one at the end of a line', () => {
    expect(show(deleteForward(at('- a|\n  - b')))).toBe('- a|b');
    expect(show(deleteForward(at('- a|\n  - b\n    - c')))).toBe(
      '- a|b\n  - c',
    );
  });

  it('joins the next continuation line', () => {
    expect(show(deleteForward(at('- a|\n  b')))).toBe('- a|b');
  });

  it('returns null elsewhere', () => {
    expect(deleteForward(at('- a|b'))).toBeNull();
    expect(deleteForward(at('- a|'))).toBeNull();
  });
});

describe('lineStart', () => {
  it('is the start of the text behind the marker', () => {
    expect(lineStart({ text: '- ab\n  - cd', from: 10, to: 10 })).toBe(9);
    expect(lineStart({ text: '- ab\n  cd', from: 8, to: 8 })).toBe(7);
  });
});

describe('paste', () => {
  it('leaves single-line text to the editor', () => {
    expect(paste(at('- a|'), 'hello')).toBeNull();
    expect(show(paste(at('- a|'), 'hello\n'))).toBe('- ahello|');
  });

  it('turns an outline into blocks below the current one', () => {
    expect(show(paste(at('- r\n  - a|\n  - z'), '- x\n  - y'))).toBe(
      '- r\n  - a\n  - x\n    - y|\n  - z',
    );
    expect(show(paste(at('- a\n  - b|'), '- x\n- y'))).toBe(
      '- a\n  - b\n  - x\n  - y|',
    );
  });

  it('puts the blocks behind the subtree of the current one', () => {
    expect(show(paste(at('- r\n  - a|\n    - b'), '- x\n- y'))).toBe(
      '- r\n  - a\n    - b\n  - x\n  - y|',
    );
  });

  it('puts the blocks under the root, before its children', () => {
    expect(show(paste(at('- a|\n  - b'), '- x\n- y'))).toBe(
      '- a\n  - x\n  - y|\n  - b',
    );
    expect(show(paste(at('- a|'), '- x\n  - y'))).toBe('- a\n  - x\n    - y|');
  });

  it('replaces an empty root with the first pasted root, the others become its children', () => {
    expect(show(paste(at('- |'), '- x\n  - y\n- z\n  - w'))).toBe(
      '- x\n  - y\n  - z\n    - w|',
    );
    expect(show(paste(at('- |'), '- x\n  - y'))).toBe('- x\n  - y|');
  });

  it('replaces an empty block', () => {
    expect(show(paste(at('- a\n  - |'), '- x\n  - y'))).toBe(
      '- a\n  - x\n    - y|',
    );
  });

  it('reads `*` bullets, tabs and four-space indentation', () => {
    expect(outlineToCanonical('* a\n\t* b\n\t\t* c\n* d')).toEqual([
      '- a',
      '  - b',
      '    - c',
      '- d',
    ]);
    expect(outlineToCanonical('- a\n    - b\n        - c\n    - d')).toEqual([
      '- a',
      '  - b',
      '    - c',
      '  - d',
    ]);
  });

  it('starts an indented first bullet at depth 0', () => {
    expect(outlineToCanonical('  - a\n    - b\n  - c')).toEqual([
      '- a',
      '  - b',
      '- c',
    ]);
  });

  it('keeps the continuation lines of a pasted block, and fences whole', () => {
    expect(
      outlineToCanonical('- a\n  more\n  - b\n    ```\n    - x\n    ```'),
    ).toEqual(['- a', '  more', '  - b', '    ```', '    - x', '    ```']);
  });

  it('reads empty bullets', () => {
    expect(outlineToCanonical('- a\n-\n  - b')).toEqual(['- a', '- ', '  - b']);
  });

  it('adds a pasted outline at the depth of the current block', () => {
    const result = paste(at('- a\n  - b|'), '- x\n  - y')!;
    expect(isCanonical(result.text)).toBe(true);
  });

  it('puts other multi-line text into the block as continuation lines', () => {
    expect(show(paste(at('- a|'), 'one\ntwo\n\nthree'))).toBe(
      '- aone\n  two\n\n  three|',
    );
    expect(show(paste(at('- x\n  - a|'), 'one\ntwo'))).toBe(
      '- x\n  - aone\n    two|',
    );
  });

  it('escapes a pasted line that would start a bullet', () => {
    expect(show(paste(at('- |'), 'intro\n- not a block'))).toBe(
      '- intro\n  \\- not a block|',
    );
  });

  it('replaces the selection', () => {
    expect(show(paste(at('- [abc]d'), 'x\ny'))).toBe('- x\n  y|d');
  });

  it('yields canonical text', () => {
    const outline = '* a\n\t* b\n\t  more\n* c';
    for (const marked of ['- |', '- x|\n  - y', '- x\n  - |y', '- x\n  - y|\n  - z']) {
      const { text } = paste(at(marked), outline)!;
      expect(isCanonical(text), marked).toBe(true);
      expect(roots(text), marked).toBe(1);
    }
  });
});
