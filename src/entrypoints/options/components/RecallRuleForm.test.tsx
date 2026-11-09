/**
 * The keyword list inputs of the recall rule form keep separate drafts: typing
 * into "Exclude keywords" must not fill "Prefer keywords" and vice versa.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RecallRuleForm from './RecallRuleForm';
import { recallRulesConfig } from '@/utils/storage';

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
