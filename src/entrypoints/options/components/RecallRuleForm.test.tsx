/**
 * The keyword list inputs of the recall rule form keep separate drafts: typing
 * into "Exclude keywords" must not fill "Prefer keywords" and vice versa.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/i18n/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RecallRuleForm from './RecallRuleForm';
import { recallRulesConfig } from '@/utils/storage';
import { BUILTIN_RECALL_RULES } from '@/utils/recall-builtin-rules';

const input = (placeholder: string) => screen.getByPlaceholderText(placeholder) as HTMLInputElement;
const type = (placeholder: string, value: string) =>
  fireEvent.change(input(placeholder), { target: { value } });
/** The "+" button next to the input. */
const add = (placeholder: string) =>
  fireEvent.click(input(placeholder).parentElement!.querySelector('button')!);

describe('RecallRuleForm keyword inputs', () => {
  afterEach(cleanup);

  it('keeps the exclude and prefer drafts apart and saves them separately', () => {
    const onSave = vi.fn();
    render(<RecallRuleForm onSave={onSave} onCancel={() => {}} />);

    type('Keyword to exclude', 'comment');
    expect(input('Keyword to exclude').value).toBe('comment');
    expect(input('Keyword to prefer').value).toBe('');

    type('Keyword to prefer', 'code');
    expect(input('Keyword to prefer').value).toBe('code');
    expect(input('Keyword to exclude').value).toBe('comment');

    add('Keyword to exclude');
    expect(input('Keyword to exclude').value).toBe('');
    expect(input('Keyword to prefer').value).toBe('code');
    add('Keyword to prefer');

    fireEvent.change(document.getElementById('name')!, { target: { value: 'Rule' } });
    fireEvent.change(document.getElementById('urlPattern')!, { target: { value: 'example\\.com' } });
    fireEvent.submit(document.querySelector('form')!);

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.queryProcessing.excludeKeywords).toEqual(['comment']);
    expect(saved.queryProcessing.includeKeywords).toEqual(['code']);
  });
});

describe('RecallRuleForm recall scope', () => {
  afterEach(cleanup);

  const github = recallRulesConfig.fallback.find((rule) => rule.id === 'github-pr')!;

  it('previews the broadest prefix on the test URL and saves the chosen depth', () => {
    const onSave = vi.fn();
    render(<RecallRuleForm initialRule={github} onSave={onSave} onCancel={() => {}} />);

    type('Enter a URL to test...', 'https://github.com/foo/bar/pull/123/files?w=1#diff');
    expect(screen.getByText('✓ Matches · github.com/foo/bar')).toBeTruthy();
    expect((screen.getByRole('radio', { name: '2 levels' }) as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: '1 level' }));
    expect(screen.getByText('✓ Matches · github.com/foo')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'This page' }));
    expect(screen.getByText('✓ Matches · github.com/foo/bar/pull/123')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: '3 levels' }));
    fireEvent.submit(document.querySelector('form')!);
    expect(onSave.mock.calls[0][0].queryProcessing.scopeDepth).toBe(3);
  });

  it('saves no depth for "This page"', () => {
    const onSave = vi.fn();
    render(<RecallRuleForm initialRule={github} onSave={onSave} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole('radio', { name: 'This page' }));
    fireEvent.submit(document.querySelector('form')!);
    expect(onSave.mock.calls[0][0].queryProcessing.scopeDepth).toBeUndefined();
  });
});

describe('RecallRuleForm query parameter allowlist', () => {
  afterEach(cleanup);

  const youtube = BUILTIN_RECALL_RULES.find((rule) => rule.id === 'builtin:youtube-video')!;
  const github = recallRulesConfig.fallback.find((rule) => rule.id === 'github-pr')!;
  const submit = () => fireEvent.submit(document.querySelector('form')!);

  it('shows the allowlist and the URL forms of a built-in rule and saves them back', () => {
    const onSave = vi.fn();
    render(<RecallRuleForm initialRule={youtube} onSave={onSave} onCancel={() => {}} />);

    expect(screen.getByRole('button', { name: 'Remove v' })).toBeTruthy();
    expect(screen.getByText('youtu.be/{id}')).toBeTruthy();

    type('Parameter name', 'list');
    add('Parameter name');
    submit();
    const saved = onSave.mock.calls[0][0];
    expect(saved.queryProcessing.keepQueryParams).toEqual(['v', 'list']);
    expect(saved.queryProcessing.urlForms).toEqual(youtube.queryProcessing.urlForms);
  });

  it('turns the allowlist off by emptying it', () => {
    const onSave = vi.fn();
    render(<RecallRuleForm initialRule={youtube} onSave={onSave} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove v' }));
    submit();
    expect('keepQueryParams' in onSave.mock.calls[0][0].queryProcessing).toBe(false);
  });

  it('disables the field while query parameters are ignored', () => {
    render(<RecallRuleForm initialRule={youtube} onSave={() => {}} onCancel={() => {}} />);
    expect(input('Parameter name').disabled).toBe(false);

    fireEvent.click(screen.getByRole('switch', { name: /Ignore query parameters/ }));
    expect(input('Parameter name').disabled).toBe(true);
  });

  it('saves an old rule without the field without gaining new fields', () => {
    const onSave = vi.fn();
    render(<RecallRuleForm initialRule={github} onSave={onSave} onCancel={() => {}} />);

    expect(input('Parameter name').value).toBe('');
    expect(screen.queryByText('Same page under')).toBeNull();
    submit();
    const { queryProcessing } = onSave.mock.calls[0][0];
    expect('keepQueryParams' in queryProcessing).toBe(false);
    expect('urlForms' in queryProcessing).toBe(false);
  });
});

describe('RecallRuleForm copy', () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  const youtube = BUILTIN_RECALL_RULES.find((rule) => rule.id === 'builtin:youtube-video')!;
  const github = recallRulesConfig.fallback.find((rule) => rule.id === 'github-pr')!;

  it('labels every section and field in English', () => {
    render(<RecallRuleForm initialRule={youtube} onSave={() => {}} onCancel={() => {}} />);

    for (const text of [
      'Basics',
      'Rule name *',
      'Enabled',
      'Description',
      'URL pattern *',
      'Test the URL pattern',
      'Query processing',
      'How the page URL is turned into a search.',
      'Ignore hash fragment',
      'Ignore query parameters',
      'Keep only these query parameters',
      'Exclude keywords',
      'Prefer keywords',
      'Ignore path segments',
      'Same page under',
      'Search scope',
      'Where in your graph to search.',
      'Limit journal dates',
      'Only search these pages',
      'Exclude these pages',
      'Result filtering',
      'Max results',
      'Minimum relevance score',
      'Show recent results first',
      'Cancel',
      'Save rule',
    ]) {
      expect(screen.getAllByText(text, { exact: false }).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole('radiogroup', { name: 'Recall scope' })).toBeTruthy();
    for (const name of ['This page', '1 level', '2 levels', '3 levels']) {
      expect(screen.getByRole('radio', { name })).toBeTruthy();
    }
    for (const placeholder of [
      'e.g. GitHub project pages',
      'What this rule is for',
      'e.g. github.com',
      'Enter a URL to test...',
      'Parameter name',
      'Keyword to exclude',
      'Keyword to prefer',
      'Path segment to ignore',
      'No limit',
      '0.0 - 1.0',
    ]) {
      expect(screen.getByPlaceholderText(placeholder)).toBeTruthy();
    }
    expect(screen.getAllByPlaceholderText('Page name')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Help' }).length).toBeGreaterThan(5);
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(6);
  });

  it('reports no match, a match with the recalled prefix, and a plain match', () => {
    render(<RecallRuleForm initialRule={github} onSave={() => {}} onCancel={() => {}} />);

    type('Enter a URL to test...', 'https://example.org/');
    expect(screen.getByText('✗ No match')).toBeTruthy();

    type('Enter a URL to test...', 'https://github.com/foo/bar/pull/1');
    expect(screen.getByText(/^✓ Matches · github\.com/)).toBeTruthy();
  });

  it('shows a plain match when the test text is not a URL', () => {
    render(<RecallRuleForm onSave={() => {}} onCancel={() => {}} />);
    fireEvent.change(document.getElementById('urlPattern')!, { target: { value: 'example' } });
    type('Enter a URL to test...', 'not a url but example');
    expect(screen.getByText('✓ Matches')).toBeTruthy();
  });

  it('names the chip remove button after the keyword and shows the journal days field', () => {
    render(<RecallRuleForm onSave={() => {}} onCancel={() => {}} />);
    type('Keyword to exclude', 'spam');
    add('Keyword to exclude');
    expect(screen.getByRole('button', { name: 'Remove spam' })).toBeTruthy();

    fireEvent.click(screen.getByRole('switch', { name: /Limit journal dates/ }));
    expect(screen.getByLabelText('Days to search')).toBeTruthy();
  });

  it('renders in Simplified Chinese', async () => {
    await i18n.changeLanguage('zh-CN');
    render(<RecallRuleForm initialRule={youtube} onSave={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('基本信息')).toBeTruthy();
    expect(screen.getByText('规则名称 *')).toBeTruthy();
    expect(screen.getByText('网址模式 *')).toBeTruthy();
    expect(screen.getByText('查询处理')).toBeTruthy();
    expect(screen.getByText('同一页面的网址形式：')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '此页面' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '2 级' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '移除 v' })).toBeTruthy();
    expect(screen.getByPlaceholderText('例如 github.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: '保存规则' })).toBeTruthy();
  });

  it('renders in Traditional Chinese', async () => {
    await i18n.changeLanguage('zh-TW');
    render(<RecallRuleForm initialRule={youtube} onSave={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('基本資料')).toBeTruthy();
    expect(screen.getByText('網址模式 *')).toBeTruthy();
    expect(screen.getByText('搜尋範圍')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '3 層' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '移除 v' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '儲存規則' })).toBeTruthy();
  });
});
