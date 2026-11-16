import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { storage } from '#imports';
import {
  addTaskTemplate,
  migrateLegacyClipSettingsToTemplates,
} from '@/entrypoints/background/upgrade';
import { BUILT_IN_TEMPLATES } from './default-templates';
import { defaultTemplateIdItem, templates, type TemplateItemV1 } from './storage';
import {
  isPinned,
  pickerCandidates,
  resolveClipTemplate,
  resolveDefaultTemplate,
  skipPicker,
} from './template-choice';

const t = (id: string, extra: Partial<TemplateItemV1> = {}): TemplateItemV1 => ({
  id,
  name: id,
  content: id,
  ...extra,
});

describe('resolveDefaultTemplate', () => {
  const list = [t('a'), t('b'), t('c')];

  it('is the first template until the user chooses', () => {
    expect(resolveDefaultTemplate(list)).toBe(list[0]);
    expect(resolveDefaultTemplate(list, null)).toBe(list[0]);
  });

  it('is the template the id names', () => {
    expect(resolveDefaultTemplate(list, 'c')).toBe(list[2]);
  });

  it('falls back to the first template when the id names a deleted one', () => {
    expect(resolveDefaultTemplate(list, 'gone')).toBe(list[0]);
  });

  it('is nothing without templates', () => {
    expect(resolveDefaultTemplate([], 'a')).toBeUndefined();
  });
});

describe('pickerCandidates and skipPicker', () => {
  it('is the default alone when nothing is pinned: no panel', () => {
    const list = [t('a'), t('b'), t('c')];
    expect(pickerCandidates(list).map((x) => x.id)).toEqual(['a']);
    expect(skipPicker(pickerCandidates(list))).toBe(true);
  });

  it('lists the default first, then the other pinned in list order', () => {
    const list = [t('a', { pinned: true }), t('b'), t('c', { pinned: true }), t('d', { pinned: true })];
    expect(pickerCandidates(list, 'd').map((x) => x.id)).toEqual(['d', 'a', 'c']);
    expect(skipPicker(pickerCandidates(list, 'd'))).toBe(false);
  });

  it('counts the default once, pinned or not', () => {
    const list = [t('a', { pinned: true }), t('b')];
    expect(pickerCandidates(list, 'a').map((x) => x.id)).toEqual(['a']);
  });

  it('ignores a pin that is not `true`', () => {
    const list = [t('a'), t('b', { pinned: false })];
    expect(pickerCandidates(list)).toHaveLength(1);
  });

  it('skips for no candidates, and for the candidates a rule narrowed to one', () => {
    expect(skipPicker([])).toBe(true);
    expect(skipPicker([t('a'), t('b')].slice(0, 1))).toBe(true);
    expect(skipPicker([t('a'), t('b')])).toBe(false);
  });

  it('pins the default when the id names a deleted template: the first one', () => {
    const list = [t('a'), t('b', { pinned: true })];
    expect(pickerCandidates(list, 'gone').map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('page rules in the panel', () => {
  const URL_ = 'https://blog.example.com/posts/1';
  const list = [
    t('a', { pinned: true }),
    t('b', { rules: ['*.example.com'] }),
    t('c', { pinned: true }),
    t('d', { rules: ['blog.example.com'], pinned: true }),
    t('e'),
  ];
  const order = (defaultId?: string | null, url: string | null = URL_) =>
    pickerCandidates(list, defaultId, url).map((x) => x.id);

  it('lists the matches by priority, then the default, then the other pinned', () => {
    expect(order()).toEqual(['d', 'b', 'a', 'c']);
  });

  it('lists a template once, whether it is the default, pinned and matching', () => {
    expect(order('d')).toEqual(['d', 'b', 'a', 'c']);
    expect(order('b')).toEqual(['d', 'b', 'a', 'c']);
  });

  it('offers a match that is not pinned', () => {
    expect(order()).toContain('b');
    expect(list[1].pinned).toBeUndefined();
  });

  it('is the old list on a page no rule matches, or without a url', () => {
    expect(order(undefined, 'https://other.com/')).toEqual(['a', 'c', 'd']);
    expect(order(undefined, null)).toEqual(['a', 'c', 'd']);
    expect(pickerCandidates(list, undefined)).toEqual(pickerCandidates(list, undefined, null));
  });

  it('puts a match before the default when the default is another template', () => {
    expect(order('e')).toEqual(['d', 'b', 'e', 'a', 'c']);
  });

  it('is nothing without templates', () => {
    expect(pickerCandidates([], null, URL_)).toEqual([]);
  });
});

describe('skip rule with rules', () => {
  const url = 'https://example.com/';
  const skips = (list: TemplateItemV1[]) => skipPicker(pickerCandidates(list, null, url));

  it('skips with the default alone and no match', () => {
    const list = [t('a'), t('b', { rules: ['other.com'] })];
    expect(pickerCandidates(list, null, url).map((x) => x.id)).toEqual(['a']);
    expect(skips(list)).toBe(true);
  });

  it('skips when the only match is the default: a one-row panel offers no choice', () => {
    const list = [t('a', { rules: ['example.com'] }), t('b')];
    expect(pickerCandidates(list, null, url).map((x) => x.id)).toEqual(['a']);
    expect(skips(list)).toBe(true);
  });

  it('skips when the only pinned template is also the match', () => {
    const list = [t('a'), t('b', { rules: ['example.com'], pinned: true })];
    expect(pickerCandidates(list, 'b', url).map((x) => x.id)).toEqual(['b']);
    expect(skipPicker(pickerCandidates(list, 'b', url))).toBe(true);
  });

  it('opens the panel for a match that is not the default, though only the default is pinned', () => {
    const list = [t('a'), t('b', { rules: ['example.com'] })];
    expect(pickerCandidates(list, null, url).map((x) => x.id)).toEqual(['b', 'a']);
    expect(skips(list)).toBe(false);
  });

  it('opens the panel with two candidates and no match, as before', () => {
    expect(skips([t('a'), t('b', { pinned: true })])).toBe(false);
  });
});

describe('resolveClipTemplate: the main sidebar button and the float button', () => {
  const list = [t('a'), t('b', { rules: ['example.com/docs/*'] }), t('c', { rules: ['example.com'] })];

  it('is the rule winner, marked as ruled', () => {
    const { template, ruled } = resolveClipTemplate(list, null, 'https://example.com/docs/x');
    expect(template?.id).toBe('b');
    expect(ruled).toBe(true);
  });

  it('is the default when no rule matches', () => {
    expect(resolveClipTemplate(list, 'c', 'https://other.com/')).toEqual({
      template: list[2],
      ruled: false,
    });
    expect(resolveClipTemplate(list, null, null).template?.id).toBe('a');
  });

  it('is nothing without templates', () => {
    expect(resolveClipTemplate([], null, 'https://example.com/')).toEqual({
      template: undefined,
      ruled: false,
    });
  });
});

describe('isPinned', () => {
  const list = [t('a'), t('b', { pinned: true }), t('c')];
  it('is true for the default, whatever its flag', () => {
    expect(isPinned(list[0], list)).toBe(true);
    expect(isPinned(list[2], list, 'c')).toBe(true);
  });
  it('is true for a pinned template, false for the rest', () => {
    expect(isPinned(list[1], list)).toBe(true);
    expect(isPinned(list[2], list)).toBe(false);
  });
});

describe('upgrade: a user who changes no settings gets no panel', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  const candidates = async () =>
    pickerCandidates(await templates.getValue(), await defaultTemplateIdItem.getValue());

  it('never saved templates: the fallback holds Clip and Task, only Clip is offered', async () => {
    const list = await templates.getValue();
    expect(list).toEqual(BUILT_IN_TEMPLATES);
    expect(list.some((template) => 'pinned' in template)).toBe(false);
    expect(list.some((template) => 'rules' in template)).toBe(false);
    expect(await defaultTemplateIdItem.getValue()).toBeNull();
    expect((await candidates()).map((x) => x.id)).toEqual(['default']);
    expect(skipPicker(await candidates())).toBe(true);
  });

  it('templates saved before pinning, with Task added by the upgrade', async () => {
    const clip = {
      id: 'default',
      name: 'Default',
      content: '#[[Clip]] [{{title}}]({{url}})\n{{content}}',
      clipNoteLocation: 'journal',
      clipNoteCustomPage: '',
    };
    await templates.setValue([clip]);

    await addTaskTemplate();

    const saved = await templates.getValue();
    expect(saved.map((x) => x.id)).toEqual(['default', 'task']);
    expect(saved.some((template) => 'pinned' in template)).toBe(false);
    expect(await storage.getItem('local:defaultTemplateId')).toBeNull();
    expect((await candidates()).map((x) => x.id)).toEqual(['default']);
    expect(skipPicker(await candidates())).toBe(true);
  });

  it('the legacy settings migration, then the Task upgrade', async () => {
    await storage.setItem('local:clipNoteTemplate', '- {{title}} {{content}}');
    await migrateLegacyClipSettingsToTemplates();
    await addTaskTemplate();

    expect((await candidates()).map((x) => x.id)).toEqual(['default']);
    expect(skipPicker(await candidates())).toBe(true);
  });

  it('a template the user adds is not pinned', async () => {
    await templates.setValue([...BUILT_IN_TEMPLATES, t('mine')]);
    expect((await candidates()).map((x) => x.id)).toEqual(['default']);
  });
});
