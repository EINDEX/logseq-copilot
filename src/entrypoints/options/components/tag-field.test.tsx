import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TemplateTag } from '@/utils/storage';

const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('@/types/messaging', () => ({ sendMessage }));

import { TagField } from './tag-field';

beforeAll(() => {
  // cmdk and Radix measure and scroll; happy-dom has neither.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  sendMessage.mockReset();
});

afterEach(() => cleanup());

const GRAPH_TAGS: TemplateTag[] = [
  { name: 'Project', uuid: 'u-project' },
  { name: 'Reading', uuid: 'u-reading' },
];

const mount = (value?: TemplateTag) => {
  const onChange = vi.fn();
  render(<TagField id="tag" value={value} onChange={onChange} />);
  return onChange;
};

const open = () => fireEvent.click(screen.getByRole('combobox'));
const options = () => screen.getAllByRole('option').map((o) => o.textContent);

describe('TagField', () => {
  it('shows no tag, or the tag with its hash', () => {
    mount();
    expect(screen.getByRole('combobox').textContent).toBe('No tag');
    cleanup();
    mount({ name: 'Reading' });
    expect(screen.getByRole('combobox').textContent).toBe('#Reading');
  });

  it('reads the graph tags when it opens, not before', async () => {
    sendMessage.mockResolvedValue(GRAPH_TAGS);
    mount();
    expect(sendMessage).not.toHaveBeenCalled();
    open();
    await waitFor(() => expect(options()).toEqual(['Project', 'Reading']));
    expect(sendMessage).toHaveBeenCalledWith('logseq:listTags');
  });

  it('filters the list as you type, in any case', async () => {
    sendMessage.mockResolvedValue(GRAPH_TAGS);
    mount();
    open();
    await waitFor(() => expect(options()).toHaveLength(2));
    fireEvent.change(screen.getByPlaceholderText('Search or type a tag'), {
      target: { value: 'READ' },
    });
    await waitFor(() => expect(options()).toEqual(['Reading', 'READ']));
  });

  it('chooses a tag of the graph with its uuid', async () => {
    sendMessage.mockResolvedValue(GRAPH_TAGS);
    const onChange = mount();
    open();
    await waitFor(() => expect(options()).toHaveLength(2));
    fireEvent.click(screen.getByRole('option', { name: 'Reading' }));
    expect(onChange).toHaveBeenCalledWith({ name: 'Reading', uuid: 'u-reading' });
  });

  it('offers a typed name that is not in the list as a new tag', async () => {
    sendMessage.mockResolvedValue(GRAPH_TAGS);
    const onChange = mount();
    open();
    await waitFor(() => expect(options()).toHaveLength(2));
    fireEvent.change(screen.getByPlaceholderText('Search or type a tag'), {
      target: { value: ' Fresh ' },
    });
    await waitFor(() => expect(options()).toEqual(['Fresh']));
    fireEvent.click(screen.getByRole('option', { name: 'Fresh' }));
    expect(onChange).toHaveBeenCalledWith({ name: 'Fresh' });
  });

  it('does not offer a new tag for a name the graph has', async () => {
    sendMessage.mockResolvedValue(GRAPH_TAGS);
    mount();
    open();
    await waitFor(() => expect(options()).toHaveLength(2));
    fireEvent.change(screen.getByPlaceholderText('Search or type a tag'), {
      target: { value: 'reading' },
    });
    await waitFor(() => expect(options()).toEqual(['Reading']));
  });

  it('clears the tag with the first item when there is one', async () => {
    sendMessage.mockResolvedValue(GRAPH_TAGS);
    const onChange = mount({ name: 'Reading' });
    open();
    await waitFor(() => expect(options()).toEqual(['No tag', 'Project', 'Reading']));
    fireEvent.click(screen.getByRole('option', { name: 'No tag' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('still takes free text when Logseq cannot be reached', async () => {
    sendMessage.mockRejectedValue(new Error('Cannot connect'));
    const onChange = mount();
    open();
    await waitFor(() => screen.getByText('Logseq is not reachable'));
    fireEvent.change(screen.getByPlaceholderText('Search or type a tag'), {
      target: { value: 'Offline' },
    });
    await waitFor(() => expect(options()).toEqual(['Offline']));
    fireEvent.click(screen.getByRole('option', { name: 'Offline' }));
    expect(onChange).toHaveBeenCalledWith({ name: 'Offline' });
  });
});
