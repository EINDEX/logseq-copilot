import { afterEach, describe, expect, test, vi } from 'vitest';
import { keepOnPage, type KeepOnPageOptions } from './keep-on-page';

/** MutationObserver callbacks run in a microtask; a timer runs after them. */
const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** The parts of WXT's ContentScriptContext keepOnPage uses. */
const fakeContext = () => {
  const listeners = new Set<() => void>();
  return {
    setTimeout: (handler: () => void, timeout?: number) => window.setTimeout(handler, timeout),
    onInvalidated: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    invalidate: () => listeners.forEach((cb) => cb()),
  };
};

/**
 * A result page with a right column, and the card as the content script
 * mounts it: a container first in the column, the host in it. `place` puts
 * a new container first in whatever column is on the page.
 */
const mountCard = () => {
  document.body.innerHTML = '<div id="main"><aside id="side"><div class="infobox"></div></aside></div>';
  const host = document.createElement('logseq-copilot-search-engine');
  const container = document.createElement('div');
  container.className = 'card-container';
  container.append(host);
  document.getElementById('side')!.prepend(container);
  const place = vi.fn(() => {
    const side = document.getElementById('side');
    if (!side) return null;
    const next = document.createElement('div');
    next.className = 'card-container';
    side.prepend(next);
    return next;
  });
  return { host, container, place };
};

/** What the page does: renders #main again, as new nodes. */
const rerender = () => {
  const fresh = document.createElement('div');
  fresh.id = 'main';
  fresh.innerHTML = '<aside id="side"><div class="infobox"></div></aside>';
  document.getElementById('main')!.replaceWith(fresh);
};

const cards = () => document.querySelectorAll('logseq-copilot-search-engine');

describe('keepOnPage', () => {
  let stop: (() => void) | undefined;

  const follow = (host: Element, options: Partial<KeepOnPageOptions> & Pick<KeepOnPageOptions, 'place'>) => {
    const ctx = fakeContext();
    const onLost = vi.fn();
    stop = keepOnPage(ctx, host, { wanted: () => true, onLost, ...options });
    return { ctx, onLost };
  };

  afterEach(() => {
    stop?.();
    stop = undefined;
    document.body.innerHTML = '';
  });

  test('puts the same card back when the page renders its column again', async () => {
    const { host, place } = mountCard();
    const { onLost } = follow(host, { place });

    rerender();
    await settle();

    expect(host.isConnected).toBe(true);
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toBe(host);
    expect(document.getElementById('side')?.firstElementChild?.firstElementChild).toBe(host);
    expect(place).toHaveBeenCalledTimes(1);
    expect(onLost).not.toHaveBeenCalled();
  });

  test('puts back a card whose container was gone before it was mounted', () => {
    const { host, container, place } = mountCard();
    container.remove();

    follow(host, { place });

    // At once, not on the next change of the page.
    expect(host.isConnected).toBe(true);
    expect(cards()).toHaveLength(1);
  });

  test('leaves a card alone while it is on the page', async () => {
    const { host, place } = mountCard();
    follow(host, { place });

    document.getElementById('side')!.append(document.createElement('div'));
    await settle();

    expect(place).not.toHaveBeenCalled();
  });

  test('waits for the column when the page has none yet', async () => {
    const { host, place } = mountCard();
    follow(host, { place });

    document.getElementById('main')!.remove();
    await settle();
    expect(host.isConnected).toBe(false);
    expect(place).toHaveLastReturnedWith(null);

    const fresh = document.createElement('div');
    fresh.id = 'main';
    fresh.innerHTML = '<aside id="side"></aside>';
    document.body.append(fresh);
    await settle();
    expect(host.isConnected).toBe(true);
    expect(cards()).toHaveLength(1);
  });

  test('removes a container the page emptied and left in place', async () => {
    const { host, container, place } = mountCard();
    follow(host, { place });

    host.remove();
    await settle();

    expect(container.isConnected).toBe(false);
    expect(document.querySelectorAll('.card-container')).toHaveLength(1);
    expect(host.isConnected).toBe(true);
  });

  test('gives up after maxRemounts and unmounts the card', async () => {
    const { host, place } = mountCard();
    const { onLost } = follow(host, { place, maxRemounts: 2 });

    for (let i = 0; i < 2; i++) {
      rerender();
      await settle();
      expect(host.isConnected).toBe(true);
    }
    rerender();
    await settle();

    expect(host.isConnected).toBe(false);
    expect(place).toHaveBeenCalledTimes(2);
    expect(onLost).toHaveBeenCalledTimes(1);
    // And stops watching the page.
    rerender();
    await settle();
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  test('stops following after followMs', async () => {
    const { host, place } = mountCard();
    const { onLost } = follow(host, { place, followMs: 20 });

    await settle(40);
    rerender();
    await settle();

    expect(host.isConnected).toBe(false);
    expect(place).not.toHaveBeenCalled();
    // It was on the page when the time was up.
    expect(onLost).not.toHaveBeenCalled();
  });

  test('unmounts a card that is out of the page when the time is up', async () => {
    const { host, place } = mountCard();
    place.mockReturnValue(null);
    const { onLost } = follow(host, { place, followMs: 20 });

    rerender();
    await settle(40);

    expect(onLost).toHaveBeenCalledTimes(1);
  });

  test('does not put back the card of another query', async () => {
    const { host, place } = mountCard();
    let query = 'logseq';
    const { onLost } = follow(host, { place, wanted: () => query === 'logseq' });

    query = 'obsidian';
    rerender();
    await settle();

    expect(host.isConnected).toBe(false);
    expect(place).not.toHaveBeenCalled();
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  test('stops when the content script context is invalidated', async () => {
    const { host, place } = mountCard();
    const { ctx, onLost } = follow(host, { place });

    ctx.invalidate();
    rerender();
    await settle();

    expect(place).not.toHaveBeenCalled();
    expect(onLost).not.toHaveBeenCalled();
  });

  test('stops when asked to', async () => {
    const { host, place } = mountCard();
    follow(host, { place });

    stop!();
    rerender();
    await settle();

    expect(place).not.toHaveBeenCalled();
  });
});
