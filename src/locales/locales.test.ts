// The translation files against the English one (src/locales/README.md).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = path.resolve(__dirname);
const TRANSLATIONS = ['zh-CN', 'zh-TW'];
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const PLURAL = new RegExp(`_(${PLURAL_SUFFIXES.join('|')})$`);

type Messages = { [key: string]: string | Messages };

const read = (language: string) =>
  readFileSync(path.join(DIR, `${language}.json`), 'utf8');

/** Every string of a file, by its dotted key. */
const flatten = (messages: Messages, prefix = ''): Map<string, string> => {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(messages)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') flat.set(full, value);
    else for (const entry of flatten(value, full)) flat.set(...entry);
  }
  return flat;
};

/** The key without its plural suffix: `a.count_one` → `a.count`. */
const baseKey = (key: string) => key.replace(PLURAL, '');

/** The `{{placeholder}}` names of a string. */
const placeholders = (text: string) =>
  [...text.matchAll(/{{\s*([^}\s,]+)[^}]*}}/g)].map((match) => match[1]).sort();

/** The canonical text of a file: keys sorted at every level, 2-space indent, final newline. */
const canonical = (messages: Messages): string => {
  const sort = (value: string | Messages): string | Messages =>
    typeof value === 'string'
      ? value
      : Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, sort(value[key])]),
        );
  return `${JSON.stringify(sort(messages), null, 2)}\n`;
};

/** What is wrong with a translation against English, as readable lines. */
const problems = (
  english: Map<string, string>,
  translation: Map<string, string>,
) => {
  const found: string[] = [];
  const englishBases = new Map<string, Set<string>>();
  // Base keys English has plural forms of.
  const englishPlurals = new Set(
    [...english.keys()].filter((key) => key !== baseKey(key)).map(baseKey),
  );
  for (const [key, text] of english) {
    const names = englishBases.get(baseKey(key)) ?? new Set();
    placeholders(text).forEach((name) => names.add(name));
    englishBases.set(baseKey(key), names);
  }
  for (const [key, text] of translation) {
    const base = baseKey(key);
    // A plural form English does not have (Chinese: _other only) is fine
    // when English has the base key in plural forms.
    if (!english.has(key) && !(key !== base && englishPlurals.has(base))) {
      found.push(`${key}: not in en.json`);
      continue;
    }
    const expected = [...(englishBases.get(base) ?? [])].sort();
    const actual = placeholders(text);
    const missing = expected.filter((name) => !actual.includes(name));
    const extra = actual.filter((name) => !expected.includes(name));
    // A plural form may leave out {{count}} ("one item"), never add a name.
    const allowedMissing =
      key !== base ? missing.filter((name) => name !== 'count') : missing;
    if (allowedMissing.length || extra.length) {
      found.push(
        `${key}: placeholders ${JSON.stringify(
          actual,
        )}, en has ${JSON.stringify(expected)}`,
      );
    }
  }
  return found;
};

/**
 * Keys with an `_` that is no plural suffix: `_` only starts one
 * (`_zero/_one/_two/_few/_many/_other`), names are camelCase.
 */
const badPluralKeys = (messages: Map<string, string>) =>
  [...messages.keys()].filter(
    (key) => key.split('.').pop()!.includes('_') && !PLURAL.test(key),
  );

const english = flatten(JSON.parse(read('en')));

describe('locale files', () => {
  it.each(['en', ...TRANSLATIONS])(
    '%s.json is in canonical form',
    (language) => {
      const text = read(language);
      expect(text).toBe(canonical(JSON.parse(text)));
    },
  );

  it.each(['en', ...TRANSLATIONS])(
    '%s.json has only strings, none empty',
    (language) => {
      for (const [key, text] of flatten(JSON.parse(read(language)))) {
        expect(text.trim(), key).not.toBe('');
      }
    },
  );

  it.each(['en', ...TRANSLATIONS])(
    '%s.json uses only CLDR plural suffixes',
    (language) => {
      expect(badPluralKeys(flatten(JSON.parse(read(language))))).toEqual([]);
    },
  );

  it.each(TRANSLATIONS)(
    '%s.json has only keys of en.json, with its placeholders',
    (language) => {
      expect(problems(english, flatten(JSON.parse(read(language))))).toEqual(
        [],
      );
    },
  );

  it('puts every key under a known top-level section', () => {
    const sections = ['common', 'options', 'sidebar', 'content', 'background'];
    for (const key of english.keys())
      expect(sections, key).toContain(key.split('.')[0]);
  });
});

describe('the checks', () => {
  const en = new Map([
    ['a.title', 'Title'],
    ['a.count_one', '{{count}} page'],
    ['a.count_other', '{{count}} pages'],
    ['a.named', 'Hello {{name}}'],
  ]);

  it('accept a matching translation, Chinese plurals with _other only', () => {
    const zh = new Map([
      ['a.title', '标题'],
      ['a.count_other', '{{count}} 个页面'],
      ['a.named', '你好，{{ name }}'],
    ]);
    expect(problems(en, zh)).toEqual([]);
  });

  it('find a key English does not have', () => {
    expect(problems(en, new Map([['a.other', 'x']]))).toEqual([
      'a.other: not in en.json',
    ]);
    // Plural form of a key that is not plural in English.
    expect(problems(en, new Map([['a.title_other', 'x']]))).toEqual([
      'a.title_other: not in en.json',
    ]);
  });

  it('find a missing, renamed or extra placeholder', () => {
    expect(problems(en, new Map([['a.named', '你好']]))).toHaveLength(1);
    expect(problems(en, new Map([['a.named', '你好，{{user}}']]))).toHaveLength(
      1,
    );
    expect(problems(en, new Map([['a.title', '{{x}} 标题']]))).toHaveLength(1);
  });

  it('find a plural suffix no language has', () => {
    expect(
      badPluralKeys(
        new Map([
          ['a.count_plural', 'x'],
          ['a.count_other', 'y'],
          ['a.open_sidebar', 'z'],
        ]),
      ),
    ).toEqual(['a.count_plural', 'a.open_sidebar']);
  });

  it('find a file out of canonical form', () => {
    const text = '{"b": "B", "a": {"d": "D", "c": "C"}}';
    expect(canonical(JSON.parse(text))).toBe(
      '{\n  "a": {\n    "c": "C",\n    "d": "D"\n  },\n  "b": "B"\n}\n',
    );
  });
});
