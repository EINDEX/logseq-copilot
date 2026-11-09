import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { storage } from '#imports';
import { recallRulesConfig, templates, type RecallRuleConfig } from '@/utils/storage';
import {
  LEGACY_GITHUB_PR_RULE,
  migrateGithubRecallRuleToRepoScope,
  migrateLegacyClipSettingsToTemplates,
  migrateRecallRuleDefaultsToEnglish,
} from './upgrade';

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

describe('migrateRecallRuleDefaultsToEnglish', () => {
  const [spaDefault] = recallRulesConfig.fallback;
  const githubDefault = LEGACY_GITHUB_PR_RULE;
  // The built-in rules as older versions saved them.
  const legacyRules = (): RecallRuleConfig[] => [
    {
      ...spaDefault,
      name: '单页应用默认规则',
      description: '针对使用hash路由的单页应用，忽略URL hash片段',
    },
    { ...githubDefault, description: '针对GitHub PR页面，只搜索代码和项目相关内容' },
  ];

  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('replaces the old Chinese defaults with the English ones', async () => {
    await recallRulesConfig.setValue(legacyRules());

    await migrateRecallRuleDefaultsToEnglish();

    expect(await recallRulesConfig.getValue()).toEqual([spaDefault, LEGACY_GITHUB_PR_RULE]);
  });

  it('keeps names and descriptions the user changed', async () => {
    const [spa, github] = legacyRules();
    const custom = { ...github, id: 'rule-1', name: 'Mine', description: '我的规则' };
    await recallRulesConfig.setValue([
      { ...spa, name: 'My SPA rule', enabled: false },
      { ...github, description: 'Only code' },
      custom,
    ]);

    await migrateRecallRuleDefaultsToEnglish();

    const [migratedSpa, migratedGithub, migratedCustom] = await recallRulesConfig.getValue();
    expect(migratedSpa.name).toBe('My SPA rule');
    expect(migratedSpa.description).toBe(spaDefault.description);
    expect(migratedSpa.enabled).toBe(false);
    expect(migratedGithub.description).toBe('Only code');
    expect(migratedCustom).toEqual(custom);
  });

  it('does nothing when no rules are saved', async () => {
    await migrateRecallRuleDefaultsToEnglish();
    expect(await storage.getItem('local:recallRulesConfig')).toBeNull();
  });

  it('is idempotent', async () => {
    await recallRulesConfig.setValue(legacyRules());
    await migrateRecallRuleDefaultsToEnglish();
    const once = await recallRulesConfig.getValue();

    await migrateRecallRuleDefaultsToEnglish();

    expect(await recallRulesConfig.getValue()).toEqual(once);
  });
});

describe('migrateGithubRecallRuleToRepoScope', () => {
  const [spaDefault, githubDefault] = recallRulesConfig.fallback;

  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('replaces the untouched old GitHub rule, keeping whether it is enabled', async () => {
    await recallRulesConfig.setValue([
      spaDefault,
      { ...LEGACY_GITHUB_PR_RULE, enabled: true },
    ]);

    await migrateGithubRecallRuleToRepoScope();

    expect(await recallRulesConfig.getValue()).toEqual([
      spaDefault,
      { ...githubDefault, enabled: true },
    ]);
    expect(githubDefault.queryProcessing.scopeDepth).toBe(2);
  });

  it('ignores key order and keys saved as undefined', async () => {
    const { queryProcessing, ...rest } = LEGACY_GITHUB_PR_RULE;
    const reordered = {
      queryProcessing: { ...queryProcessing },
      ...rest,
      resultFiltering: { ...rest.resultFiltering, minRelevanceScore: undefined },
    };
    await recallRulesConfig.setValue([reordered as RecallRuleConfig]);

    await migrateGithubRecallRuleToRepoScope();

    expect(await recallRulesConfig.getValue()).toEqual([githubDefault]);
  });

  it('leaves a GitHub rule the user edited alone', async () => {
    const edited = {
      ...LEGACY_GITHUB_PR_RULE,
      queryProcessing: { ...LEGACY_GITHUB_PR_RULE.queryProcessing, excludeKeywords: ['comment'] },
    };
    await recallRulesConfig.setValue([edited]);

    await migrateGithubRecallRuleToRepoScope();

    expect(await recallRulesConfig.getValue()).toEqual([edited]);
  });

  it('runs after the English copy migration on the Chinese defaults', async () => {
    await recallRulesConfig.setValue([
      { ...LEGACY_GITHUB_PR_RULE, description: '针对GitHub PR页面，只搜索代码和项目相关内容' },
    ]);

    await migrateRecallRuleDefaultsToEnglish();
    await migrateGithubRecallRuleToRepoScope();

    expect(await recallRulesConfig.getValue()).toEqual([githubDefault]);
  });

  it('does nothing when no rules are saved', async () => {
    await migrateGithubRecallRuleToRepoScope();
    expect(await storage.getItem('local:recallRulesConfig')).toBeNull();
  });

  it('is idempotent', async () => {
    await recallRulesConfig.setValue([LEGACY_GITHUB_PR_RULE]);
    await migrateGithubRecallRuleToRepoScope();
    const once = await recallRulesConfig.getValue();

    await migrateGithubRecallRuleToRepoScope();

    expect(await recallRulesConfig.getValue()).toEqual(once);
    expect(once).toEqual([githubDefault]);
  });
});
