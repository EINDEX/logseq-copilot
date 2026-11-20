import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { saveImagesToLogseqItem } from '@/utils/storage';
import { ExperimentalOptions } from './ExperimentalOptions';
import { ClipNoteOptions } from './ClipNote';

describe('ExperimentalOptions', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    (fakeBrowser.commands as any).getAll = async () => [];
  });
  afterEach(() => cleanup());

  const header = () => screen.getByRole('button', { name: 'Experimental' });
  const toggle = () => screen.getByRole('switch', { name: /Save images to Logseq/ });

  it('is collapsed until opened, and says what to expect', async () => {
    render(<ExperimentalOptions />);
    expect(header().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('switch')).toBeNull();

    fireEvent.click(header());
    expect(header().getAttribute('aria-expanded')).toBe('true');
    expect(
      screen.getByText('These features may be unstable and may change in later versions.'),
    ).toBeTruthy();
    await waitFor(() => expect(toggle().getAttribute('aria-checked')).toBe('false'));
  });

  it('turns Save images to Logseq on', async () => {
    render(<ExperimentalOptions />);
    fireEvent.click(header());
    await waitFor(() => expect(toggle().getAttribute('aria-checked')).toBe('false'));
    fireEvent.click(toggle());
    await waitFor(async () => expect(await saveImagesToLogseqItem.getValue()).toBe(true));
  });

  it('is no longer in the Clip Note section', () => {
    render(<ClipNoteOptions />);
    expect(screen.queryByText('Save images to Logseq')).toBeNull();
    expect(screen.queryByText('Experimental')).toBeNull();
  });
});
