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
import {
  CannotConnectWithLogseq,
  LogseqError,
} from '@/entrypoints/background/logseq/error';

const sendMessage = vi.fn();
vi.mock('@/types/messaging', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
}));

import Popup from './Popup';

describe('Popup', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({
      status: 200,
      response: { graph: 'g', pages: [], blocks: [], count: 0 },
    });
  });

  it('searches the current tab URL as soon as the popup opens', async () => {
    vi.spyOn(browser.tabs, 'query').mockImplementation(
      async () =>
        [
          { id: 1, url: 'https://example.com/page', title: 'Example' },
        ] as Browser.tabs.Tab[],
    );

    render(<Popup />);

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith('logseq:urlSearch', {
        url: 'https://example.com/page',
      }),
    );
  });

  it('does not search for chrome:// pages', async () => {
    vi.spyOn(browser.tabs, 'query').mockImplementation(
      async () =>
        [
          { id: 1, url: 'chrome://extensions', title: 'Extensions' },
        ] as Browser.tabs.Tab[],
    );

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
      vi.spyOn(browser.tabs, 'query').mockImplementation(
        async () => [activeTab()],
      );
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
      vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [
        activeTab({ url: 'chrome://newtab/' }),
      ]);
      render(<Popup />);
      await waitFor(() => expect(sidebarButton().disabled).toBe(false));

      fireEvent.click(sidebarButton());

      expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 7 });
    });

    it('cannot be used before the window is known', async () => {
      let found!: (tabs: Browser.tabs.Tab[]) => void;
      vi.spyOn(browser.tabs, 'query').mockImplementation(
        () => new Promise<Browser.tabs.Tab[]>((resolve) => (found = resolve)),
      );
      render(<Popup />);

      expect(sidebarButton().disabled).toBe(true);
      fireEvent.click(sidebarButton());
      expect(sidePanelOpen).not.toHaveBeenCalled();

      found([activeTab()]);
      await waitFor(() => expect(sidebarButton().disabled).toBe(false));
    });

    it('cannot be used when the tab has no window', async () => {
      vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [
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
      vi.spyOn(browser.tabs, 'query').mockImplementation(
        async () => [activeTab()],
      );
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

    describe('where the browser has no sidebar (Safari)', () => {
      beforeEach(() => {
        delete (fakeBrowser as any).sidePanel;
      });

      it('opens the sidebar drawn on pages, then closes the popup', async () => {
        vi.spyOn(browser.tabs, 'query').mockImplementation(async () => [
          activeTab(),
        ]);
        render(<Popup />);

        fireEvent.click(sidebarButton());

        await waitFor(() => expect(window.close).toHaveBeenCalledTimes(1));
        expect(
          (await fakeBrowser.storage.local.get('inPageSidebarOpen'))
            .inPageSidebarOpen,
        ).toBe(true);
      });

      it('can be used before the window is known, and without one', async () => {
        vi.spyOn(browser.tabs, 'query').mockImplementation(
          () => new Promise(() => {}),
        );
        render(<Popup />);

        expect(sidebarButton().disabled).toBe(false);
        fireEvent.click(sidebarButton());

        await waitFor(() => expect(window.close).toHaveBeenCalledTimes(1));
      });
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
      vi.spyOn(browser.tabs, 'query').mockImplementation(
        async () => [tab] as Browser.tabs.Tab[],
      );
    });

    it('shares the action row with Clip page, and nothing else', async () => {
      pageAnswers(async () => true);
      render(<Popup />);

      // The first one; the empty results have one too.
      const clipPage = screen.getAllByRole('button', { name: 'Clip page' })[0];
      expect(clipPage.parentElement).toBe(clipButton().parentElement);
      expect(clipButton().parentElement!.children).toHaveLength(2);
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
      // The popup shows a failure itself (see below), not the page.
      expect(sendMessage).toHaveBeenCalledWith(
        'content:quickCaptureWithSelection',
        { feedback: 'sender' },
        { tabId: 4 },
      );
    });
  });

  describe('a failed clip (#48)', () => {
    const tab = { id: 4, windowId: 7, url: 'https://example.com/page', title: 'Example' };
    const button = (name: string) =>
      screen.getAllByRole('button', { name })[0] as HTMLButtonElement;

    /** `failing` rejects with a LogseqError, everything else succeeds. */
    const failOn = (failing: string) =>
      sendMessage.mockImplementation((type: string) => {
        if (type === failing) {
          return Promise.reject(new LogseqError(CannotConnectWithLogseq));
        }
        if (type === 'content:hasSelection') return Promise.resolve(true);
        return Promise.resolve({
          status: 200,
          response: { graph: 'g', pages: [], blocks: [], count: 0 },
        });
      });

    beforeEach(() => {
      vi.spyOn(window, 'close').mockImplementation(() => {});
      vi.spyOn(log, 'error').mockImplementation(() => {});
      vi.spyOn(browser.tabs, 'query').mockImplementation(
        async () => [tab] as Browser.tabs.Tab[],
      );
    });

    it('of Clip page is shown on the action, and the popup stays open', async () => {
      failOn('logseq:clipPage');
      render(<Popup />);
      await waitFor(() => expect(button('Clip page').disabled).toBe(false));

      fireEvent.click(button('Clip page'));

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toBe(CannotConnectWithLogseq.msg);
      expect(button('Clip page').getAttribute('aria-invalid')).toBe('true');
      expect(button('Clip page').getAttribute('aria-describedby')).toBe(alert.id);
      expect(button('Clip selection').getAttribute('aria-invalid')).toBeNull();
      expect(window.close).not.toHaveBeenCalled();
    });

    it('of Clip selection is shown on the action, and the popup stays open', async () => {
      failOn('content:quickCaptureWithSelection');
      render(<Popup />);
      await waitFor(() => expect(button('Clip selection').disabled).toBe(false));

      fireEvent.click(button('Clip selection'));

      expect((await screen.findByRole('alert')).textContent).toBe(
        CannotConnectWithLogseq.msg,
      );
      expect(button('Clip selection').getAttribute('aria-invalid')).toBe('true');
      expect(button('Clip page').getAttribute('aria-invalid')).toBeNull();
      expect(window.close).not.toHaveBeenCalled();
    });

    it('only marks the action when the search error already shows the same text', async () => {
      failOn('logseq:clipPage');
      const answer = sendMessage.getMockImplementation()!;
      sendMessage.mockImplementation((type: string, ...rest: unknown[]) =>
        type === 'logseq:urlSearch'
          ? Promise.reject(new LogseqError(CannotConnectWithLogseq))
          : answer(type, ...rest),
      );
      render(<Popup />);
      await screen.findByText(CannotConnectWithLogseq.msg);

      fireEvent.click(button('Clip page'));

      await waitFor(() =>
        expect(button('Clip page').getAttribute('aria-invalid')).toBe('true'),
      );
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getAllByText(CannotConnectWithLogseq.msg)).toHaveLength(1);
      const describedBy = button('Clip page').getAttribute('aria-describedby')!;
      expect(document.getElementById(describedBy)?.textContent).toBe(
        CannotConnectWithLogseq.msg,
      );
    });

    it('shows the text when the search error says something else', async () => {
      failOn('logseq:clipPage');
      const answer = sendMessage.getMockImplementation()!;
      sendMessage.mockImplementation((type: string, ...rest: unknown[]) =>
        type === 'logseq:urlSearch'
          ? Promise.reject(new Error('Search failed'))
          : answer(type, ...rest),
      );
      render(<Popup />);
      await screen.findByText('Search failed');

      fireEvent.click(button('Clip page'));

      expect((await screen.findByRole('alert')).textContent).toBe(
        CannotConnectWithLogseq.msg,
      );
    });

    it('is cleared by the next clip, which closes the popup', async () => {
      failOn('logseq:clipPage');
      render(<Popup />);
      await waitFor(() => expect(button('Clip page').disabled).toBe(false));
      fireEvent.click(button('Clip page'));
      await screen.findByRole('alert');

      failOn('none');
      fireEvent.click(button('Clip page'));

      await waitFor(() => expect(window.close).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('cannot be sent twice while a clip is on its way', async () => {
      let done!: () => void;
      failOn('none');
      const answer = sendMessage.getMockImplementation()!;
      sendMessage.mockImplementation((type: string, ...rest: unknown[]) =>
        type === 'logseq:clipPage'
          ? new Promise<void>((resolve) => (done = resolve))
          : answer(type, ...rest),
      );
      render(<Popup />);
      await waitFor(() => expect(button('Clip selection').disabled).toBe(false));

      fireEvent.click(button('Clip page'));

      await waitFor(() => expect(button('Clip page').disabled).toBe(true));
      expect(button('Clip selection').disabled).toBe(true);
      done();
      await waitFor(() => expect(window.close).toHaveBeenCalledTimes(1));
    });
  });

  describe('header', () => {
    const tab = { id: 4, windowId: 7, url: 'https://example.com/page', title: 'Example' };

    beforeEach(() => {
      vi.spyOn(window, 'close').mockImplementation(() => {});
      vi.spyOn(window, 'open').mockImplementation(() => null);
      vi.spyOn(browser.tabs, 'query').mockImplementation(
        async () => [tab] as Browser.tabs.Tab[],
      );
      sendMessage.mockImplementation((type: string) =>
        Promise.resolve(
          type === 'content:hasSelection'
            ? false
            : {
                status: 200,
                response: { graph: 'my graph/2', pages: [], blocks: [], count: 0 },
              },
        ),
      );
    });

    it('opens the graph in Logseq from its badge', async () => {
      render(<Popup />);
      const badge = await screen.findByRole('button', {
        name: 'Open my graph/2 in Logseq',
      });
      expect(badge.textContent).toBe('my graph/2');
      expect(badge.title).toBe('Open my graph/2 in Logseq');

      fireEvent.click(badge);

      expect(window.open).toHaveBeenCalledWith('logseq://graph/my%20graph%2F2', '_blank');
      expect(window.close).toHaveBeenCalledTimes(1);
    });

    it('has one way to the settings, the gear, and no Open Graph or Refresh', async () => {
      render(<Popup />);
      await screen.findByRole('button', { name: /in Logseq$/ });

      expect(screen.getAllByRole('button', { name: 'Settings' })).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Settings' }).title).toBe('Settings');
      expect(screen.queryByRole('button', { name: /Open Graph/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Refresh/ })).toBeNull();
    });

    it('opens the options from the gear', async () => {
      render(<Popup />);

      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

      expect(sendMessage).toHaveBeenCalledWith('app:openOptions');
    });
  });

  describe('clearing the search box', () => {
    const tab = { id: 4, windowId: 7, url: 'https://example.com/page', title: 'Example' };
    const input = () => screen.getByPlaceholderText(/Search in your Logseq graph/);
    const urlSearches = () =>
      sendMessage.mock.calls.filter(([type]) => type === 'logseq:urlSearch').length;

    const typedSearch = async () => {
      render(<Popup />);
      await waitFor(() => expect(urlSearches()).toBe(1));
      fireEvent.change(input(), { target: { value: 'notes' } });
      fireEvent.submit(input().closest('form')!);
      await waitFor(() => expect(sendMessage).toHaveBeenCalledWith('logseq:search', 'notes'));
    };

    beforeEach(() => {
      vi.spyOn(browser.tabs, 'query').mockImplementation(
        async () => [tab] as Browser.tabs.Tab[],
      );
    });

    it('does not search while typing', async () => {
      render(<Popup />);
      await waitFor(() => expect(urlSearches()).toBe(1));

      fireEvent.change(input(), { target: { value: 'n' } });
      fireEvent.change(input(), { target: { value: 'no' } });

      expect(urlSearches()).toBe(1);
      expect(sendMessage).not.toHaveBeenCalledWith('logseq:search', expect.anything());
    });

    it('shows the results for the current page again (typed empty, or its clear button)', async () => {
      await typedSearch();

      fireEvent.change(input(), { target: { value: '' } });

      await waitFor(() => expect(urlSearches()).toBe(2));
      expect(sendMessage).toHaveBeenLastCalledWith('logseq:urlSearch', {
        url: 'https://example.com/page',
      });
    });

    it('with Escape, which then does not close the popup', async () => {
      await typedSearch();

      // fireEvent returns false when the default was prevented.
      const escapeKept = fireEvent.keyDown(input(), { key: 'Escape' });

      expect(escapeKept).toBe(false);
      expect((input() as HTMLInputElement).value).toBe('');
      await waitFor(() => expect(urlSearches()).toBe(2));
    });

    it('leaves Escape alone when the box is empty', async () => {
      render(<Popup />);
      await waitFor(() => expect(urlSearches()).toBe(1));

      // fireEvent returns false when the default was prevented.
      const escapeKept = fireEvent.keyDown(input(), { key: 'Escape' });

      expect(escapeKept).toBe(true);
      expect(urlSearches()).toBe(1);
    });

    it('does not search browser pages', async () => {
      vi.mocked(browser.tabs.query).mockImplementation(async () => [
        { ...tab, url: 'chrome://newtab/' },
      ] as Browser.tabs.Tab[]);
      render(<Popup />);
      await waitFor(() => expect(sendMessage).toHaveBeenCalled());

      fireEvent.change(input(), { target: { value: 'notes' } });
      fireEvent.change(input(), { target: { value: '' } });
      await new Promise((r) => setTimeout(r, 20));

      expect(urlSearches()).toBe(0);
    });
  });
});
