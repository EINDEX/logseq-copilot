/**
 * The recall rule list: built-in rules are marked, cannot be deleted, can be
 * toggled, and an edited one says so and can be reset.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { recallRulesConfig, type RecallRuleConfig } from '@/utils/storage';
import { i18n } from '@/i18n/core';
import RecallRulesPage from './recall-rules-page';


const mount = async () => {
  render(<RecallRulesPage />);
  await act(async () => {});
};

describe('RecallRulesPage built-in rules', () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('marks built-ins, offers no Delete and no Reset until one is changed', async () => {
    await mount();
    expect(screen.getAllByText('Built-in').length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByRole('button', { name: 'Delete YouTube videos' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset YouTube videos' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit YouTube videos' })).toBeTruthy();
    expect(screen.getByText('Keep: v')).toBeTruthy();
    // A user's own rule keeps its Delete.
    expect(screen.getAllByRole('button', { name: /^Delete / }).length).toBeGreaterThan(0);
  });

  it('toggling a built-in marks it modified; Reset brings it back', async () => {
    vi.stubGlobal('confirm', () => true);
    await mount();

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Enable YouTube videos' }));
    });
    expect(screen.getByText('Modified')).toBeTruthy();
    expect((await recallRulesConfig.getValue()).some((r) => r.id === 'builtin:youtube-video')).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset YouTube videos' }));
    });
    expect(screen.queryByText('Modified')).toBeNull();
    expect((await recallRulesConfig.getValue()).some((r) => r.id === 'builtin:youtube-video')).toBe(false);
  });
});

const rule = (over: Partial<RecallRuleConfig> = {}): RecallRuleConfig => ({
  id: 'custom-1',
  name: 'My rule',
  enabled: true,
  description: 'Mine',
  urlPattern: 'example\\.com',
  queryProcessing: {
    ignoreHashFragments: true,
    ignoreQueryParams: false,
    excludeKeywords: ['spam'],
    includeKeywords: ['docs'],
    ignorePathSegments: [],
    keepQueryParams: ['id'],
    scopeDepth: 1,
  },
  searchScope: { journalDateRange: { enabled: true, days: 7 } },
  resultFiltering: { prioritizeRecent: true },
  ...over,
});

describe('RecallRulesPage copy', () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await i18n.changeLanguage('en');
  });

  it('describes a rule with its flags, keywords and the page summary', async () => {
    await recallRulesConfig.setValue([
      rule(),
      rule({
        id: 'custom-2',
        name: 'Other',
        enabled: false,
        description: undefined,
        queryProcessing: {
          ignoreHashFragments: false,
          ignoreQueryParams: true,
          excludeKeywords: [],
          includeKeywords: [],
          ignorePathSegments: [],
          scopeDepth: 2,
        },
        searchScope: {},
        resultFiltering: { prioritizeRecent: false },
      }),
    ]);
    await mount();

    expect(screen.getByRole('heading', { name: 'Recall Rules' })).toBeTruthy();
    expect(screen.getByText(/\d+ enabled · 1 disabled/)).toBeTruthy();
    expect(screen.getByText('Enabled rules')).toBeTruthy();
    expect(screen.getByText('Disabled rules')).toBeTruthy();
    for (const flag of [
      'Ignore hash',
      'Keep: id',
      'Scope: 1 level',
      'Journals: last 7 days',
      'Recent first',
      'Ignore query',
      'Scope: 2 levels',
    ]) {
      expect(screen.getAllByText(flag).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText('Exclude').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Prefer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Test URL pattern').length).toBeGreaterThan(0);
    expect(screen.getAllByPlaceholderText('Enter a URL to test...').length).toBeGreaterThan(0);
    expect(screen.getByText('How recall rules work')).toBeTruthy();
    expect(screen.getByText('URL pattern:').textContent).toBe('URL pattern:');
    expect(screen.getByText('github\\.com')).toBeTruthy();
    expect(screen.getByText('.*reddit\\.com.*')).toBeTruthy();
  });

  it('shows the empty state and opens the add form', async () => {
    await recallRulesConfig.setValue([]);
    await mount();
    for (const button of screen.getAllByRole('switch')) {
      await act(async () => {
        fireEvent.click(button);
      });
    }
    expect(screen.getByText('No recall rule is enabled.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create a rule' }));
    expect(screen.getByRole('heading', { name: 'Add recall rule' })).toBeTruthy();
    expect(screen.getByText('Create a rule for the pages it should match.')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(screen.getByRole('heading', { name: 'Recall Rules' })).toBeTruthy();
  });

  it('opens the edit form, and Add rule opens an empty one', async () => {
    await recallRulesConfig.setValue([rule()]);
    await mount();

    fireEvent.click(screen.getByRole('button', { name: 'Edit My rule' }));
    expect(screen.getByRole('heading', { name: 'Edit recall rule' })).toBeTruthy();
    expect(
      screen.getByText('Change how this rule matches pages and searches your graph.'),
    ).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    expect(screen.getByRole('heading', { name: 'Add recall rule' })).toBeTruthy();
  });

  it('asks before deleting and names the rule', async () => {
    await recallRulesConfig.setValue([rule()]);
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    await mount();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete My rule' }));
    });
    expect(confirm).toHaveBeenCalledWith('Delete the recall rule "My rule"?');
    expect(screen.queryByText('My rule')).toBeNull();
  });

  it('asks before resetting a built-in rule', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Enable YouTube videos' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset YouTube videos' }));
    });
    expect(confirm).toHaveBeenCalledWith('Reset "YouTube videos" to its built-in version?');
    expect(screen.getByText('Modified')).toBeTruthy();
  });

  it('shows the error when the rules cannot be loaded', async () => {
    await mount();
    vi.spyOn(recallRulesConfig, 'getValue').mockRejectedValue('boom');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    });
    expect(screen.getByText('Failed to load recall rules')).toBeTruthy();
  });

  it('renders in Simplified Chinese', async () => {
    await recallRulesConfig.setValue([rule()]);
    await i18n.changeLanguage('zh-CN');
    await mount();
    expect(screen.getByRole('heading', { name: '相关笔记规则' })).toBeTruthy();
    expect(screen.getByText('范围：1 级')).toBeTruthy();
    expect(screen.getByText('日志：最近 7 天')).toBeTruthy();
    expect(screen.getAllByText('保留：id').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '编辑 My rule' })).toBeTruthy();
    expect(screen.getAllByText('内置').length).toBeGreaterThan(0);
    expect(screen.getByText('网址模式：')).toBeTruthy();
    expect(screen.getByText('github\\.com')).toBeTruthy();
  });

  it('renders in Traditional Chinese', async () => {
    await recallRulesConfig.setValue([rule()]);
    await i18n.changeLanguage('zh-TW');
    await mount();
    expect(screen.getByRole('heading', { name: '相關筆記規則' })).toBeTruthy();
    expect(screen.getByText('範圍：1 層')).toBeTruthy();
    expect(screen.getByRole('button', { name: '刪除 My rule' })).toBeTruthy();
    expect(screen.getAllByText('內建').length).toBeGreaterThan(0);
    expect(screen.getByText('網址模式：')).toBeTruthy();
  });
});
