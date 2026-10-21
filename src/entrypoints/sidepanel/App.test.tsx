import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing';

const sendMessage = vi.fn();
vi.mock('@/types/messaging', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
}));

import App from './App';
import log from '@/utils/logger';
import type { HighlightData } from '@/types/highlight';

const WINDOW_ID = 10;

const makeTab = (overrides: Partial<Browser.tabs.Tab> = {}): Browser.tabs.Tab =>
  ({
    id: 1,
    windowId: WINDOW_ID,
    active: true,
    index: 0,
    title: 'Page one',
    url: 'https://one.example/page',
    ...overrides,
  } as Browser.tabs.Tab);

const highlight = (
  id: string,
  overrides: Partial<HighlightData> = {},
): HighlightData => ({
  id,
  url: 'https://one.example/page',
  title: 'Page one',
  hostname: 'one.example',
  range: {
    startContainerXPath: '/html/body[1]/p[1]',
    endContainerXPath: '/html/body[1]/p[1]',
    startOffset: 0,
    endOffset: 5,
    textContent: `text of ${id}`,
  },
  createdAt: Date.now(),
  lastAccessedAt: Date.now(),
  ...overrides,
});

const seed = (items: HighlightData[]) =>
  fakeBrowser.storage.local.set({ highlights: items });

const stored = async (): Promise<HighlightData[]> =>
  (await fakeBrowser.storage.local.get('highlights')).highlights ?? [];

const changeStorage = (items: HighlightData[]) =>
  act(async () => {
    await seed(items);
  });

const switchTo = (tabId: number) =>
  act(async () => {
    await fakeBrowser.tabs.onActivated.trigger({ tabId, windowId: WINDOW_ID });
  });

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const text = (value: string) => screen.queryByText(`"${value}"`);
const notice = () => screen.queryByRole('status')?.textContent ?? null;

describe('sidepanel App', () => {
  let tabs: Record<number, Browser.tabs.Tab>;
  let query: MockInstance<typeof browser.tabs.query>;

  beforeEach(() => {
    cleanup();
    fakeBrowser.reset();
    sendMessage.mockReset();
    sendMessage.mockResolvedValue(true);
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    vi.spyOn(log, 'error').mockImplementation(() => {});

    tabs = {
      1: makeTab(),
      2: makeTab({
        id: 2,
        title: 'Page two',
        url: 'https://two.example/article',
      }),
    };
    vi.spyOn(browser.windows, 'getCurrent').mockResolvedValue({
      id: WINDOW_ID,
    } as Browser.windows.Window);
    query = vi.spyOn(browser.tabs, 'query').mockResolvedValue([tabs[1]]);
    vi.spyOn(browser.tabs, 'get').mockImplementation(
      async (tabId: number) => tabs[tabId],
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('the list', () => {
    it('lists the highlights of the page in the active tab, and only those', async () => {
      await seed([
        highlight('a'),
        highlight('b'),
        highlight('elsewhere', {
          url: 'https://two.example/article',
          hostname: 'two.example',
        }),
        // The same page by another address is another page.
        highlight('other-hash', { url: 'https://one.example/page#intro' }),
        highlight('other-scheme', { url: 'http://one.example/page' }),
      ]);

      render(<App />);

      expect(await screen.findByText('"text of a"')).not.toBeNull();
      expect(text('text of b')).not.toBeNull();
      expect(text('text of elsewhere')).toBeNull();
      expect(text('text of other-hash')).toBeNull();
      expect(text('text of other-scheme')).toBeNull();
    });

    it('shows the title of the tab and how many highlights it has', async () => {
      await seed([highlight('a'), highlight('b')]);

      render(<App />);

      await screen.findByText('"text of a"');
      expect(screen.getByText('Page one')).not.toBeNull();
      expect(screen.getByText('2')).not.toBeNull();
    });

    it('shows the domain when the tab has no title', async () => {
      tabs[1] = makeTab({ title: '' });
      query.mockResolvedValue([tabs[1]]);

      render(<App />);

      expect(await screen.findByText('one.example')).not.toBeNull();
    });

    it('says so while the tab and its highlights are being read', async () => {
      const reading = deferred<Browser.tabs.Tab[]>();
      query.mockReturnValue(reading.promise);
      await seed([highlight('a')]);

      render(<App />);
      expect(screen.getByText('Loading highlights...')).not.toBeNull();

      reading.resolve([tabs[1]]);
      expect(await screen.findByText('"text of a"')).not.toBeNull();
      expect(screen.queryByText('Loading highlights...')).toBeNull();
    });

    it('says so when the page has no highlights', async () => {
      await seed([
        highlight('elsewhere', { url: 'https://two.example/article' }),
      ]);

      render(<App />);

      expect(
        await screen.findByText('No highlights on this page'),
      ).not.toBeNull();
      expect(screen.queryByText('Loading highlights...')).toBeNull();
    });

    it('says highlights are not available on a page that cannot have them', async () => {
      tabs[1] = makeTab({ url: 'chrome://extensions', title: 'Extensions' });
      query.mockResolvedValue([tabs[1]]);
      await seed([highlight('a', { url: 'chrome://extensions' })]);

      render(<App />);

      expect(
        await screen.findByText("Highlights aren't available on this page"),
      ).not.toBeNull();
      expect(text('text of a')).toBeNull();
      // The tab is still named.
      expect(screen.getByText('Extensions')).not.toBeNull();
    });

    it('says highlights are not available when there is no tab', async () => {
      query.mockResolvedValue([]);

      render(<App />);

      expect(
        await screen.findByText("Highlights aren't available on this page"),
      ).not.toBeNull();
    });
  });

  describe('following changes', () => {
    it('shows highlights added and deleted elsewhere while it is open', async () => {
      await seed([highlight('a')]);
      render(<App />);
      await screen.findByText('"text of a"');

      await changeStorage([highlight('a'), highlight('b')]);
      expect(await screen.findByText('"text of b"')).not.toBeNull();
      expect(screen.getByText('2')).not.toBeNull();

      await changeStorage([highlight('b')]);
      await waitFor(() => expect(text('text of a')).toBeNull());
      expect(text('text of b')).not.toBeNull();
    });

    it('shows a note changed elsewhere', async () => {
      await seed([highlight('a')]);
      render(<App />);
      await screen.findByText('"text of a"');

      await changeStorage([highlight('a', { note: 'written elsewhere' })]);

      expect(await screen.findByText('written elsewhere')).not.toBeNull();
    });

    it('is not moved by highlights of other pages', async () => {
      await seed([highlight('a')]);
      render(<App />);
      await screen.findByText('"text of a"');

      await changeStorage([
        highlight('a'),
        highlight('elsewhere', { url: 'https://two.example/article' }),
      ]);

      expect(text('text of elsewhere')).toBeNull();
      expect(screen.getByText('1')).not.toBeNull();
    });

    it('keeps the latest read when an older one finishes last', async () => {
      await seed([highlight('a')]);
      render(<App />);
      await screen.findByText('"text of a"');

      const slow = deferred<Record<string, unknown>>();
      vi.spyOn(fakeBrowser.storage.local, 'get').mockImplementationOnce(
        () => slow.promise as never,
      );
      await changeStorage([highlight('a'), highlight('b')]);
      await changeStorage([highlight('a'), highlight('b'), highlight('c')]);
      await screen.findByText('"text of c"');

      // What the slow read saw is out of date by now.
      await act(async () => slow.resolve({ highlights: [highlight('a')] }));

      expect(text('text of c')).not.toBeNull();
      expect(text('text of b')).not.toBeNull();
    });

    it('ignores a slow read for the tab it was switched away from', async () => {
      await seed([
        highlight('a'),
        highlight('b', { url: 'https://two.example/article' }),
      ]);
      render(<App />);
      await screen.findByText('"text of a"');

      const slow = deferred<Record<string, unknown>>();
      vi.spyOn(fakeBrowser.storage.local, 'get').mockImplementationOnce(
        () => slow.promise as never,
      );
      await changeStorage([
        highlight('a'),
        highlight('a2'),
        highlight('b', { url: 'https://two.example/article' }),
      ]);
      await switchTo(2);
      await screen.findByText('"text of b"');

      await act(async () =>
        slow.resolve({ highlights: [highlight('a'), highlight('a2')] }),
      );

      expect(text('text of b')).not.toBeNull();
      expect(text('text of a')).toBeNull();
      expect(text('text of a2')).toBeNull();
    });

    it('lists the highlights of the tab the user switches to', async () => {
      await seed([
        highlight('a'),
        highlight('b', { url: 'https://two.example/article' }),
      ]);
      render(<App />);
      await screen.findByText('"text of a"');

      await switchTo(2);

      expect(await screen.findByText('"text of b"')).not.toBeNull();
      expect(text('text of a')).toBeNull();
      expect(screen.getByText('Page two')).not.toBeNull();
    });

    it('follows the tab to a page that cannot have highlights and back', async () => {
      tabs[2] = makeTab({ id: 2, url: 'about:blank', title: 'Blank' });
      await seed([highlight('a')]);
      render(<App />);
      await screen.findByText('"text of a"');

      await switchTo(2);
      expect(
        await screen.findByText("Highlights aren't available on this page"),
      ).not.toBeNull();
      expect(text('text of a')).toBeNull();

      await switchTo(1);
      expect(await screen.findByText('"text of a"')).not.toBeNull();
    });

    it('lists the highlights of the page the tab navigates to', async () => {
      await seed([
        highlight('a'),
        highlight('next', { url: 'https://one.example/next' }),
      ]);
      render(<App />);
      await screen.findByText('"text of a"');

      await act(async () => {
        await fakeBrowser.tabs.onUpdated.trigger(
          1,
          { url: 'https://one.example/next' },
          makeTab({ url: 'https://one.example/next' }),
        );
      });

      expect(await screen.findByText('"text of next"')).not.toBeNull();
      expect(text('text of a')).toBeNull();
    });
  });

  describe('deleting', () => {
    it('deletes a highlight from storage, and from the list', async () => {
      await seed([highlight('a'), highlight('b')]);
      render(<App />);
      await screen.findByText('"text of a"');

      fireEvent.click(
        screen.getAllByRole('button', { name: 'Delete highlight' })[0],
      );

      await waitFor(() => expect(text('text of a')).toBeNull());
      expect(text('text of b')).not.toBeNull();
      expect((await stored()).map((h) => h.id)).toEqual(['b']);
      // Deleting is not selecting.
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('does not touch the highlights of other pages', async () => {
      await seed([
        highlight('a'),
        highlight('elsewhere', { url: 'https://two.example/article' }),
      ]);
      render(<App />);
      await screen.findByText('"text of a"');

      fireEvent.click(screen.getByRole('button', { name: 'Delete highlight' }));

      await waitFor(async () =>
        expect((await stored()).map((h) => h.id)).toEqual(['elsewhere']),
      );
    });

    it('tells the user when the highlight could not be deleted', async () => {
      await seed([highlight('a')]);
      render(<App />);
      await screen.findByText('"text of a"');
      vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(
        new Error('storage is full'),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Delete highlight' }));

      await waitFor(() =>
        expect(notice()).toBe("Couldn't delete the highlight"),
      );
      expect(text('text of a')).not.toBeNull();
    });
  });

  describe('editing a note', () => {
    it('saves a note to storage and shows it', async () => {
      await seed([highlight('a'), highlight('b', { note: 'keep me' })]);
      render(<App />);
      await screen.findByText('"text of a"');

      fireEvent.click(screen.getAllByRole('button', { name: 'Edit note' })[0]);
      fireEvent.change(screen.getByLabelText('Note'), {
        target: { value: 'my thoughts' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(screen.queryByLabelText('Note')).toBeNull());
      expect(screen.getByText('my thoughts')).not.toBeNull();
      const saved = await stored();
      expect(saved.find((h) => h.id === 'a')!.note).toBe('my thoughts');
      expect(saved.find((h) => h.id === 'b')!.note).toBe('keep me');
      expect(notice()).toBeNull();
      // Editing is not selecting.
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('keeps the editor open and tells the user when the note could not be saved', async () => {
      await seed([highlight('a')]);
      render(<App />);
      await screen.findByText('"text of a"');
      vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(
        new Error('storage is full'),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Edit note' }));
      fireEvent.change(screen.getByLabelText('Note'), {
        target: { value: 'my thoughts' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(notice()).toBe("Couldn't save the note"));
      expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value).toBe(
        'my thoughts',
      );
      expect((await stored())[0].note).toBeUndefined();
    });
  });

  describe('jumping to a highlight', () => {
    it('asks the page of the active tab to scroll to it', async () => {
      await seed([highlight('a'), highlight('b')]);
      render(<App />);
      await screen.findByText('"text of a"');

      fireEvent.click(screen.getByText('"text of b"'));

      await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
      expect(sendMessage).toHaveBeenCalledWith(
        'content:scrollToHighlight',
        { id: 'b' },
        1,
      );
      expect(notice()).toBeNull();
    });

    it('asks the page of the tab it was switched to', async () => {
      await seed([highlight('b', { url: 'https://two.example/article' })]);
      render(<App />);
      await screen.findByText('No highlights on this page');
      await switchTo(2);
      fireEvent.click(await screen.findByText('"text of b"'));

      await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
      expect(sendMessage).toHaveBeenCalledWith(
        'content:scrollToHighlight',
        { id: 'b' },
        2,
      );
    });

    it('tells the user to reload the page when it cannot be reached', async () => {
      sendMessage.mockRejectedValue(
        new Error(
          'Could not establish connection. Receiving end does not exist.',
        ),
      );
      await seed([highlight('a')]);
      render(<App />);
      fireEvent.click(await screen.findByText('"text of a"'));

      await waitFor(() =>
        expect(notice()).toBe('Reload the page to jump to highlights'),
      );
      // Nothing else is lost.
      expect(text('text of a')).not.toBeNull();
    });

    it('tells the user when the page does not have the highlight', async () => {
      sendMessage.mockResolvedValue(false);
      await seed([highlight('a')]);
      render(<App />);
      fireEvent.click(await screen.findByText('"text of a"'));

      await waitFor(() =>
        expect(notice()).toBe("Couldn't find this highlight on the page"),
      );
    });

    it('takes the notice away at the next try, and when the tab changes', async () => {
      sendMessage.mockRejectedValueOnce(new Error('no receiver'));
      await seed([
        highlight('a'),
        highlight('b', { url: 'https://two.example/article' }),
      ]);
      render(<App />);
      fireEvent.click(await screen.findByText('"text of a"'));
      await waitFor(() => expect(notice()).not.toBeNull());

      fireEvent.click(screen.getByText('"text of a"'));
      await waitFor(() => expect(notice()).toBeNull());

      sendMessage.mockResolvedValueOnce(false);
      fireEvent.click(screen.getByText('"text of a"'));
      await waitFor(() => expect(notice()).not.toBeNull());

      await switchTo(2);
      await screen.findByText('"text of b"');
      expect(notice()).toBeNull();
    });
  });
});
