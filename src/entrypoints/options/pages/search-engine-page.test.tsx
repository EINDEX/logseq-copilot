/**
 * The search engine page: its loading state, and removing a custom engine,
 * which asks first.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SearchEngineConfig } from '@/utils/storage';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const hook = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  removeSearchEngine: vi.fn(),
}));

vi.mock('@/hooks/use-search-engines', () => ({
  useSearchEngines: () => hook.state,
}));

import SearchEnginePage from './search-engine-page';

const builtIn: SearchEngineConfig = { id: 'google', name: 'Google', enabled: true };
const custom: SearchEngineConfig = {
  id: 'mine',
  name: 'My Engine',
  enabled: false,
  isCustom: true,
  urlPattern: 'example.com',
};

const setHook = (overrides: Record<string, unknown> = {}) => {
  const engines = [builtIn, custom];
  hook.state = {
    searchEngines: engines,
    loading: false,
    error: null,
    toggleSearchEngine: vi.fn(),
    refreshConfig: vi.fn(),
    getEnabledSearchEngines: () => engines.filter((e) => e.enabled),
    addCustomSearchEngine: vi.fn(),
    removeSearchEngine: hook.removeSearchEngine,
    updateSearchEngine: vi.fn(),
    getCustomSearchEngines: () => engines.filter((e) => e.isCustom),
    getBuiltInSearchEngines: () => engines.filter((e) => !e.isCustom),
    ...overrides,
  };
};

describe('SearchEnginePage', () => {
  beforeEach(() => {
    hook.removeSearchEngine.mockReset();
    setHook();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('says it is loading the configuration', () => {
    setHook({ loading: true });
    render(<SearchEnginePage />);
    expect(screen.getByText('Loading search engine configuration...')).toBeTruthy();
  });

  it('lists the engines, marks a disabled one and shows the pattern of a custom one', () => {
    render(<SearchEnginePage />);
    expect(screen.getByText('Search Engine Configuration')).toBeTruthy();
    expect(screen.getByText('1 of 2 enabled')).toBeTruthy();
    expect(screen.getByText('Disabled')).toBeTruthy();
    expect(screen.getByText('Pattern: example.com')).toBeTruthy();
  });

  it('keeps the engine when the user declines to remove it', async () => {
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmSpy);
    render(<SearchEnginePage />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove My Engine' }));
    });
    expect(confirmSpy).toHaveBeenCalledWith(
      'Are you sure you want to remove this custom search engine?',
    );
    expect(hook.removeSearchEngine).not.toHaveBeenCalled();
  });

  it('removes the engine when the user agrees', async () => {
    vi.stubGlobal('confirm', () => true);
    render(<SearchEnginePage />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove My Engine' }));
    });
    expect(hook.removeSearchEngine).toHaveBeenCalledWith('mine');
  });
});
