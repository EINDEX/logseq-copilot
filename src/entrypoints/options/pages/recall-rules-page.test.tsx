/**
 * The recall rule list: built-in rules are marked, cannot be deleted, can be
 * toggled, and an edited one says so and can be reset.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { recallRulesConfig } from '@/utils/storage';
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
