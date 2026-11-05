import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  render,
  waitFor,
  cleanup,
  fireEvent,
  screen,
} from '@testing-library/react';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing';
import log from '@/utils/logger';

const sendMessage = vi.fn();
vi.mock('@/types/messaging', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
}));

import Popup from './Popup';

describe('Popup', () => {
  beforeEach(() => {
    cleanup();
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({
      status: 200,
      response: { graph: 'g', pages: [], blocks: [], count: 0 },
    });
  });

  it('searches the current tab URL as soon as the popup opens', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([
      { id: 1, url: 'https://example.com/page', title: 'Example' },
    ] as Browser.tabs.Tab[]);

    render(<Popup />);

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith('logseq:urlSearch', {
        url: 'https://example.com/page',
        options: { fuzzy: true },
      }),
    );
  });

  it('does not search for chrome:// pages', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([
      { id: 1, url: 'chrome://extensions', title: 'Extensions' },
    ] as Browser.tabs.Tab[]);

    render(<Popup />);
    await new Promise((r) => setTimeout(r, 50));

    expect(sendMessage).not.toHaveBeenCalledWith(
      'logseq:urlSearch',
      expect.anything(),
    );
  });
  describe('highlights sidebar', () => {
    const sidePanelOpen = vi.fn();
    const sidebarButton = () =>
      screen.getByRole('button', { name: 'Highlights' }) as HTMLButtonElement;

    beforeEach(() => {
      // The side panel API is not in the fake browser.
      (fakeBrowser as any).sidePanel = { open: sidePanelOpen };
      sidePanelOpen.mockReset().mockResolvedValue(undefined);
      vi.spyOn(window, 'close').mockImplementation(() => {});
      vi.spyOn(log, 'error').mockImplementation(() => {});
    });

    const activeTab = (overrides: Partial<Browser.tabs.Tab> = {}) =>
      ({
        id: 1,
        windowId: 7,
        url: 'https://example.com/page',
        title: 'Example',
        ...overrides,
      } as Browser.tabs.Tab);

    it('opens the sidebar of the window of the tab, then closes the popup', async () => {
      vi.spyOn(browser.tabs, 'query').mockResolvedValue([activeTab()]);
      render(<Popup />);
      await waitFor(() => expect(sidebarButton().disabled).toBe(false));

      fireEvent.click(sidebarButton());

      // Right away, not after an await: the browser opens the sidebar only
      // while the click is still a user action.
      expect(sidePanelOpen).toHaveBeenCalledTimes(1);
      expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 7 });
      await waitFor(() => expect(window.close).toHaveBeenCalledTimes(1));
    });

    it('works on pages that cannot be searched, such as the new tab page', async () => {
      vi.spyOn(browser.tabs, 'query').mockResolvedValue([
        activeTab({ url: 'chrome://newtab/' }),
      ]);
      render(<Popup />);
      await waitFor(() => expect(sidebarButton().disabled).toBe(false));

      fireEvent.click(sidebarButton());

      expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 7 });
    });

    it('cannot be used before the window is known', async () => {
      let found!: (tabs: Browser.tabs.Tab[]) => void;
      vi.spyOn(browser.tabs, 'query').mockReturnValue(
        new Promise((resolve) => (found = resolve)),
      );
      render(<Popup />);

      expect(sidebarButton().disabled).toBe(true);
      fireEvent.click(sidebarButton());
      expect(sidePanelOpen).not.toHaveBeenCalled();

      found([activeTab()]);
      await waitFor(() => expect(sidebarButton().disabled).toBe(false));
    });

    it('cannot be used when the tab has no window', async () => {
      vi.spyOn(browser.tabs, 'query').mockResolvedValue([
        activeTab({ windowId: undefined }),
      ]);
      render(<Popup />);
      await new Promise((r) => setTimeout(r, 50));

      expect(sidebarButton().disabled).toBe(true);
      fireEvent.click(sidebarButton());
      expect(sidePanelOpen).not.toHaveBeenCalled();
    });

    it('stays open and logs when the browser does not open the sidebar', async () => {
      const refusal = new Error(
        'may only be called in response to a user gesture',
      );
      sidePanelOpen.mockRejectedValue(refusal);
      vi.spyOn(browser.tabs, 'query').mockResolvedValue([activeTab()]);
      render(<Popup />);
      await waitFor(() => expect(sidebarButton().disabled).toBe(false));

      fireEvent.click(sidebarButton());

      await waitFor(() =>
        expect(log.error).toHaveBeenCalledWith(
          'Failed to open the highlights sidebar:',
          refusal,
        ),
      );
      expect(window.close).not.toHaveBeenCalled();
    });
  });

  describe('clip selection', () => {
    const clipButton = () =>
      screen.getByRole('button', { name: 'Clip selection' }) as HTMLButtonElement;
    const tab = { id: 4, windowId: 7, url: 'https://example.com/page', title: 'Example' };

    /** Answers `content:hasSelection` with `answer`, the rest as a search. */
    const pageAnswers = (answer: () => Promise<unknown>) =>
      sendMessage.mockImplementation((type: string) =>
        type === 'content:hasSelection'
          ? answer()
          : Promise.resolve({
              status: 200,
              response: { graph: 'g', pages: [], blocks: [], count: 0 },
            }),
      );

    beforeEach(() => {
      vi.spyOn(window, 'close').mockImplementation(() => {});
      vi.spyOn(browser.tabs, 'query').mockResolvedValue([tab] as Browser.tabs.Tab[]);
    });

    it('sits next to Clip page, with Refresh as an icon button', async () => {
      pageAnswers(async () => true);
      render(<Popup />);

      const [clipPage, clipSelection, refresh] = [
        // The first one; the empty results have one too.
        screen.getAllByRole('button', { name: 'Clip page' })[0],
        clipButton(),
        screen.getByRole('button', { name: 'Refresh' }),
      ];
      expect(clipPage.parentElement).toBe(clipSelection.parentElement);
      expect(refresh.parentElement).toBe(clipSelection.parentElement);
      expect(refresh.textContent).toBe('');
    });

    it('asks the page of the active tab for its selection', async () => {
      pageAnswers(async () => true);
      render(<Popup />);

      await waitFor(() => expect(clipButton().disabled).toBe(false));
      expect(sendMessage).toHaveBeenCalledWith('content:hasSelection', undefined, {
        tabId: 4,
      });
    });

    it('is disabled when the page has no selection', async () => {
      pageAnswers(async () => false);
      render(<Popup />);
      await waitFor(() =>
        expect(sendMessage).toHaveBeenCalledWith(
          'content:hasSelection',
          undefined,
          { tabId: 4 },
        ),
      );
      await new Promise((r) => setTimeout(r, 0));

      expect(clipButton().disabled).toBe(true);
    });

    it('is disabled where the content script cannot run', async () => {
      pageAnswers(() =>
        Promise.reject(
          new Error('Could not establish connection. Receiving end does not exist.'),
        ),
      );
      render(<Popup />);
      await new Promise((r) => setTimeout(r, 50));

      expect(clipButton().disabled).toBe(true);
    });

    it('sends the clip selection command to the tab, then closes', async () => {
      pageAnswers(async () => true);
      render(<Popup />);
      await waitFor(() => expect(clipButton().disabled).toBe(false));

      fireEvent.click(clipButton());

      await waitFor(() => expect(window.close).toHaveBeenCalledTimes(1));
      expect(sendMessage).toHaveBeenCalledWith(
        'content:quickCaptureWithSelection',
        undefined,
        { tabId: 4 },
      );
    });
  });
});
