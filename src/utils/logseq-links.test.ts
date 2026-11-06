/**
 * The `logseq:` links of content script UIs are opened by the background, so
 * the browser asks once for the extension instead of once per site. Clicks
 * are delegated on the UI's shadow root; other links keep their default.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('@/types/messaging', () => ({ sendMessage }));

import log from '@/utils/logger';
import { openLogseqLinksFromBackground } from './logseq-links';

const LOGSEQ = 'logseq://graph/My%20Notes?block-id=6650a1b2-0000-4000-8000-000000000001';

/** A UI like the content script's: a closed shadow root with links in it. */
const makeUi = () => {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <a id="logseq" href="${LOGSEQ}"><span id="inside">Block</span></a>
    <a id="web" href="https://example.com/">Web</a>
    <a id="nohref">No href</a>
    <span id="plain">Text</span>
  `;
  openLogseqLinksFromBackground(shadow);
  return shadow;
};

/**
 * A user's mouse event (happy-dom has no isTrusted; in browsers only the
 * browser's own events have it). Returns whether the default was prevented.
 */
const press = (
  target: Element,
  type: 'click' | 'auxclick',
  init: MouseEventInit = {},
  trusted = true,
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: type === 'click' ? 0 : 1,
    ...init,
  });
  Object.defineProperty(event, 'isTrusted', { value: trusted });
  target.dispatchEvent(event);
  return event.defaultPrevented;
};

beforeEach(() => {
  sendMessage.mockReset().mockResolvedValue(undefined);
});

describe('logseq: links', () => {
  test('a left click is opened by the background, not by the page', () => {
    const ui = makeUi();

    expect(press(ui.getElementById('logseq')!, 'click')).toBe(true);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('logseq:openLink', { url: LOGSEQ });
  });

  test('a click on an element inside the link opens the link', () => {
    const ui = makeUi();

    expect(press(ui.getElementById('inside')!, 'click')).toBe(true);

    expect(sendMessage).toHaveBeenCalledWith('logseq:openLink', { url: LOGSEQ });
  });

  test.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Shift', { shiftKey: true }],
  ])('%s + click is opened by the background too', (_key, init) => {
    const ui = makeUi();

    expect(press(ui.getElementById('logseq')!, 'click', init)).toBe(true);

    expect(sendMessage).toHaveBeenCalledWith('logseq:openLink', { url: LOGSEQ });
  });

  test('a middle click is opened by the background', () => {
    const ui = makeUi();

    expect(press(ui.getElementById('logseq')!, 'auxclick', { button: 1 })).toBe(true);

    expect(sendMessage).toHaveBeenCalledWith('logseq:openLink', { url: LOGSEQ });
  });

  test('a right click keeps the context menu ("Copy link address")', () => {
    const ui = makeUi();

    expect(press(ui.getElementById('logseq')!, 'auxclick', { button: 2 })).toBe(false);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('the link keeps its href', () => {
    const ui = makeUi();
    press(ui.getElementById('logseq')!, 'click');

    expect(ui.getElementById('logseq')!.getAttribute('href')).toBe(LOGSEQ);
  });

  test('adding the listeners twice still sends one message per click', () => {
    const ui = makeUi();
    openLogseqLinksFromBackground(ui);

    press(ui.getElementById('logseq')!, 'click');

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  test('a failed message is logged, not thrown', async () => {
    const error = new Error('Extension context invalidated.');
    sendMessage.mockRejectedValue(error);
    const logged = vi.spyOn(log, 'error').mockImplementation(() => {});
    const ui = makeUi();

    expect(press(ui.getElementById('logseq')!, 'click')).toBe(true);

    await vi.waitFor(() => expect(logged).toHaveBeenCalledWith(expect.any(String), error));
    logged.mockRestore();
  });
});

describe('everything else keeps its default', () => {
  test('a web link', () => {
    const ui = makeUi();

    expect(press(ui.getElementById('web')!, 'click')).toBe(false);
    expect(press(ui.getElementById('web')!, 'auxclick')).toBe(false);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('an <a> without href, and text outside links', () => {
    const ui = makeUi();

    expect(press(ui.getElementById('nohref')!, 'click')).toBe(false);
    expect(press(ui.getElementById('plain')!, 'click')).toBe(false);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('a click a page script made (not trusted)', () => {
    const ui = makeUi();

    expect(press(ui.getElementById('logseq')!, 'click', {}, false)).toBe(false);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('a click the UI already handled (default prevented)', () => {
    const ui = makeUi();
    const link = ui.getElementById('logseq')!;
    link.addEventListener('click', (event) => event.preventDefault());

    press(link, 'click');

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
