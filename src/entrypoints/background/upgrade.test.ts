import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { storage } from '#imports';
import { templates } from '@/utils/storage';
import { migrateLegacyClipSettingsToTemplates } from './upgrade';

const DEFAULT_CONTENT = `#[[Clip]] [{{title}}]({{url}})
{{content}}`;

describe('migrateLegacyClipSettingsToTemplates', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('turns legacy clip settings into the first template', async () => {
    await storage.setItem('local:clipNoteTemplate', '- {{title}} {{content}}');
    await storage.setItem('local:clipNoteLocation', 'customPage');
    await storage.setItem('local:clipNoteCustomPage', 'Clips');

    await migrateLegacyClipSettingsToTemplates();

    const [first] = await templates.getValue();
    expect(first).toMatchObject({
      content: '- {{title}} {{content}}',
      clipNoteLocation: 'customPage',
      clipNoteCustomPage: 'Clips',
    });
  });

  it('fills missing legacy keys with defaults', async () => {
    await storage.setItem('local:clipNoteLocation', 'currentPage');

    await migrateLegacyClipSettingsToTemplates();

    const [first] = await templates.getValue();
    expect(first.content).toBe(DEFAULT_CONTENT);
    expect(first.clipNoteLocation).toBe('currentPage');
  });

  it('does nothing when there are no legacy keys', async () => {
    await migrateLegacyClipSettingsToTemplates();
    expect(await storage.getItem('local:templates')).toBeNull();
  });

  it('does not overwrite templates the user already customised', async () => {
    const custom = [
      { id: 't1', name: 'Mine', content: 'mine', clipNoteLocation: 'journal' },
    ];
    await templates.setValue(custom);
    await storage.setItem('local:clipNoteTemplate', 'legacy');

    await migrateLegacyClipSettingsToTemplates();

    expect(await templates.getValue()).toEqual(custom);
  });

  it('is idempotent and does not clobber later edits', async () => {
    await storage.setItem('local:clipNoteTemplate', 'legacy');
    await migrateLegacyClipSettingsToTemplates();

    // user later resets the template to the built-in default
    await templates.setValue([
      {
        id: 'default',
        name: 'Default',
        content: DEFAULT_CONTENT,
        clipNoteLocation: 'journal',
        clipNoteCustomPage: '',
      },
    ]);
    await migrateLegacyClipSettingsToTemplates();

    expect((await templates.getValue())[0].content).toBe(DEFAULT_CONTENT);
  });
});
