import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { saveImagesToLogseqItem } from '@/utils/storage';
import { ClipNoteOptions } from './ClipNote';

describe('ClipNoteOptions: Save images to Logseq', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    (fakeBrowser.commands as any).getAll = async () => [];
  });
  afterEach(() => cleanup());

  const toggle = () => screen.getByRole('switch', { name: /Save images to Logseq/ });

  it('is an experimental switch, off by default', async () => {
    render(<ClipNoteOptions />);
    await waitFor(() => expect(toggle().getAttribute('aria-checked')).toBe('false'));
    expect(screen.getByText('Experimental')).toBeTruthy();
  });

  it('turns the setting on', async () => {
    render(<ClipNoteOptions />);
    await waitFor(() => expect(toggle().getAttribute('aria-checked')).toBe('false'));
    fireEvent.click(toggle());
    await waitFor(async () => expect(await saveImagesToLogseqItem.getValue()).toBe(true));
  });
});
