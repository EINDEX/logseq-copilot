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
