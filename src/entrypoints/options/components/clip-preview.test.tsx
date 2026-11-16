import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ClipPreview } from './clip-preview';

afterEach(cleanup);

// Each bullet's text and how many bullets it sits inside.
const bullets = () =>
  [...document.querySelectorAll('[data-clip-block]')].map((li) => {
    let depth = 0;
    for (let el = li.parentElement; el; el = el.parentElement) {
      if (el.hasAttribute('data-clip-block')) depth++;
    }
    return {
      text: li.querySelector(':scope > div > span:last-child')?.textContent,
      depth,
    };
  });

describe('ClipPreview', () => {
  it('shows a nested template as a tree of bullets', () => {
    render(<ClipPreview template={'- [{{title}}]({{url}})\n  - {{content}}'} />);
    expect(bullets()).toEqual([
      { text: '[Sample page](https://example.com/article)', depth: 0 },
      { text: 'The first paragraph of the selected text.', depth: 1 },
      { text: 'The second paragraph, with a [link](https://example.com).', depth: 1 },
      { text: 'First item', depth: 1 },
      { text: 'Nested item', depth: 2 },
      { text: 'Second item', depth: 1 },
    ]);
  });

  it('shows a flat template as one block', () => {
    render(<ClipPreview template={'#[[Clip]] [{{title}}]({{url}})\n{{content}}'} />);
    const [only, ...rest] = bullets();
    expect(rest).toEqual([]);
    expect(only.text).toMatch(
      /^#\[\[Clip\]\] \[Sample page\]\(https:\/\/example.com\/article\)\nThe first/,
    );
  });

  it('drops the content bullet with Page only', () => {
    render(<ClipPreview template={'- [{{title}}]({{url}})\n  - {{content}}'} />);
    fireEvent.click(screen.getByRole('button', { name: 'Page only' }));
    expect(bullets()).toEqual([
      { text: '[Sample page](https://example.com/article)', depth: 0 },
    ]);
    expect(
      screen.getByRole('button', { name: 'Page only' }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'With selection' }));
    expect(bullets()).toHaveLength(6);
  });

  it('renders the date in the Logseq date format', () => {
    render(<ClipPreview template={'- [[{{date}}]]'} />);
    expect(bullets()[0].text).toMatch(
      /^\[\[[A-Z][a-z]{2} \d{1,2}(st|nd|rd|th), \d{4}\]\]$/,
    );
  });

  it('shows a short error for a template Liquid cannot render', () => {
    render(<ClipPreview template={'- {% if %}'} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBeTruthy();
    expect(alert.textContent).not.toContain('\n');
    expect(bullets()).toEqual([]);
  });

  it('says when there is no block', () => {
    render(<ClipPreview template={'- {{content}}'} />);
    fireEvent.click(screen.getByRole('button', { name: 'Page only' }));
    expect(screen.getByText('No blocks')).toBeTruthy();
  });
});
