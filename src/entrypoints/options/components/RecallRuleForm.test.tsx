/**
 * The keyword list inputs of the recall rule form keep separate drafts: typing
 * into "Exclude keywords" must not fill "Prefer keywords" and vice versa.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RecallRuleForm from './RecallRuleForm';

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
