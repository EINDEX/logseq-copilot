import { describe, expect, it, vi } from 'vitest';
import type { TemplateProperty } from '@/utils/block-meta';
import { coerceValue, createPropertyPlanner, userProperties } from './properties';

const property = (
  key: string,
  value: string,
  extra: Partial<TemplateProperty> = {},
): TemplateProperty => ({ key, value, line: 1, kind: 'default', ...extra });

const DATE = 'Nov 19th, 2026';

/** A graph with `props`; `createProperty` adds a user property of that title. */
const makeClient = (props: any[] = []) => {
  const all = [...props];
  let n = 0;
  return {
    all,
    getAllProperties: vi.fn(async () => all.map((p) => ({ ...p }))),
    createProperty: vi.fn(async (title: string, type: string) => {
      all.push({ ident: `:user.property/${title}-new${++n}`, title, ':logseq.property/type': type });
      return 'Added: {:property 1}.';
    }),
    getPage: vi.fn(async (p: any): Promise<any> => (p.name === DATE ? { id: 193 } : null)),
    createJournalPage: vi.fn(async (_date: string): Promise<any> => ({ id: 500 })),
  };
};

const USER_URL = { ident: ':user.property/source-x1', title: 'Source', ':logseq.property/type': 'url' };
const USER_NUM = { ident: ':user.property/rating-x2', title: 'rating', ':logseq.property/type': 'number' };

describe('userProperties', () => {
  it('lists only the properties of the user, with their type', async () => {
    const client = makeClient([
      USER_URL,
      { ident: ':plugin.property._test_plugin/url', title: 'url' },
      { ident: 'alias', title: 'Alias', ':logseq.property/built-in?': true },
      { ident: ':logseq.property/status', title: 'Status' },
      { ident: ':user.property/plain-x3', title: 'plain' },
    ]);
    expect(await userProperties(client)).toEqual([
      { ident: ':user.property/source-x1', title: 'Source', type: 'url' },
      { ident: ':user.property/plain-x3', title: 'plain', type: 'default' },
    ]);
  });

  it('throws on an error answer', async () => {
    await expect(
      userProperties({ getAllProperties: async () => ({ error: 'nope' }) } as any),
    ).rejects.toThrow('nope');
  });
});

describe('coerceValue', () => {
  const journal = vi.fn(async () => 193);
  it.each([
    ['default', 'text', 'text'],
    ['default', '42', '42'],
    ['url', 'https://a.b/c?d#e', 'https://a.b/c?d#e'],
    ['url', 'not a url', undefined],
    ['number', '42', 42],
    ['number', '-1.5', -1.5],
    ['number', 'abc', undefined],
    ['checkbox', 'true', true],
    ['checkbox', 'False', false],
    ['checkbox', 'yes', undefined],
    ['datetime', '2026-11-19', undefined],
    ['node', 'Page', undefined],
  ])('%s takes %j as %j', async (type, value, expected) => {
    expect(await coerceValue(type, property('k', value), journal)).toBe(expected);
  });

  it('takes the id of the journal page for the clip date, nothing else', async () => {
    expect(await coerceValue('date', property('k', DATE, { kind: 'date', date: DATE }), journal)).toBe(193);
    expect(await coerceValue('date', property('k', 'someday'), journal)).toBeUndefined();
  });
});

describe('createPropertyPlanner', () => {
  it('uses the user property of that title, any case, by ident', async () => {
    const client = makeClient([USER_URL]);
    const planner = createPropertyPlanner(client);
    expect(await planner.resolve(property('source', 'https://a.b/'))).toEqual({
      ident: ':user.property/source-x1',
      value: 'https://a.b/',
    });
    expect(client.createProperty).not.toHaveBeenCalled();
  });

  it('makes a missing property of the user with the inferred type, once', async () => {
    const client = makeClient();
    const planner = createPropertyPlanner(client);
    const first = await planner.resolve(property('link', 'https://a.b/', { kind: 'url' }));
    const second = await planner.resolve(property('Link', 'https://c.d/', { kind: 'url' }));
    expect(client.createProperty).toHaveBeenCalledTimes(1);
    expect(client.createProperty).toHaveBeenCalledWith('link', 'url');
    expect(first).toEqual({ ident: ':user.property/link-new1', value: 'https://a.b/' });
    expect(second).toEqual({ ident: ':user.property/link-new1', value: 'https://c.d/' });
  });

  it('reads the graph once per clip', async () => {
    const client = makeClient([USER_URL, USER_NUM]);
    const planner = createPropertyPlanner(client);
    await planner.resolve(property('source', 'https://a.b/'));
    await planner.resolve(property('rating', '5'));
    expect(client.getAllProperties).toHaveBeenCalledTimes(1);
  });

  it('keeps the line when the value does not fit the type of the user property', async () => {
    const client = makeClient([USER_NUM]);
    const planner = createPropertyPlanner(client);
    expect(await planner.resolve(property('rating', 'great'))).toBeUndefined();
  });

  it('points a date property to the journal page of the date, made when missing', async () => {
    const client = makeClient();
    const planner = createPropertyPlanner(client);
    expect(
      await planner.resolve(property('read-on', DATE, { kind: 'date', date: DATE })),
    ).toEqual({ ident: ':user.property/read-on-new1', value: 193 });
    expect(client.createProperty).toHaveBeenCalledWith('read-on', 'date');
    const other = 'Nov 20th, 2026';
    expect(
      await planner.resolve(property('due', other, { kind: 'date', date: other })),
    ).toMatchObject({ value: 500 });
    expect(client.createJournalPage).toHaveBeenCalledWith(other);
  });

  it('never throws: a failing graph keeps the line', async () => {
    const client = makeClient();
    client.getAllProperties.mockRejectedValue(new Error('down'));
    const planner = createPropertyPlanner(client);
    expect(await planner.resolve(property('x', 'y'))).toBeUndefined();
  });
});
