import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { SidebarOptions } from './SidebarOptions';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const stored = async () =>
  (await fakeBrowser.storage.local.get('inPageSidebar')).inPageSidebar;

const inPageSwitch = () =>
  screen.findByRole('switch', { name: 'In-page sidebar' });

const expectChecked = async (checked: boolean) => {
  const toggle = await inPageSwitch();
  await vi.waitFor(() => {
    expect(toggle.getAttribute('aria-checked')).toBe(String(checked));
    expect((toggle as HTMLButtonElement).disabled).toBe(false);
  });
};

describe('SidebarOptions', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    delete (fakeBrowser as any).sidePanel;
    delete (fakeBrowser as any).sidebarAction;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  describe('with the side panel (Chrome, Edge, Arc)', () => {
    beforeEach(() => {
      (fakeBrowser as any).sidePanel = { open: vi.fn() };
    });

    it('is off by default', async () => {
      render(<SidebarOptions />);

      await expectChecked(false);
    });

    it('is on in Arc', async () => {
      await fakeBrowser.storage.local.set({ arcDetected: true });

      render(<SidebarOptions />);

      await expectChecked(true);
    });

    it('stores the choice of the user, also against Arc detection', async () => {
      await fakeBrowser.storage.local.set({ arcDetected: true });
      render(<SidebarOptions />);
      await expectChecked(true);

      await act(async () => {
        fireEvent.click(await inPageSwitch());
      });

      await vi.waitFor(async () => expect(await stored()).toBe(false));
      await expectChecked(false);

      await act(async () => {
        fireEvent.click(await inPageSwitch());
      });
      await vi.waitFor(async () => expect(await stored()).toBe(true));
    });

    it('follows Arc detection while open', async () => {
      render(<SidebarOptions />);
      await expectChecked(false);

      await act(async () => {
        await fakeBrowser.storage.local.set({ arcDetected: true });
      });

      await expectChecked(true);
    });
  });

  it('is offered in Firefox', async () => {
    vi.stubEnv('FIREFOX', 'true');
    (fakeBrowser as any).sidebarAction = { open: vi.fn() };

    render(<SidebarOptions />);

    await expectChecked(false);
  });

  it('is not offered where the browser has no sidebar: it is always on the page there', async () => {
    const { container } = render(<SidebarOptions />);
    await act(async () => {});

    expect(screen.queryByRole('switch')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
