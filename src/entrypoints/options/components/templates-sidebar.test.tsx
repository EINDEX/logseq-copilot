import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { fakeBrowser } from 'wxt/testing';
import { SidebarProvider } from '@/components/ui/sidebar';
import { templates } from '@/utils/storage';
import { TemplatesSidebar } from './templates-sidebar';

const renderSidebar = () =>
  render(
    <MemoryRouter>
      <SidebarProvider>
        <TemplatesSidebar />
      </SidebarProvider>
    </MemoryRouter>,
  );

describe('TemplatesSidebar', () => {
  beforeEach(() => {
    cleanup();
    fakeBrowser.reset();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    (fakeBrowser as any).commands = {
      getAll: vi.fn(async () => [
        { name: 'clip', shortcut: 'Ctrl+Shift+U' },
        { name: 'clip-task', shortcut: '' },
        { name: 'open-sidebar' },
      ]),
    };
  });

  it('lists the built-in templates, Clip first, each with a delete action', async () => {
    renderSidebar();
    expect(await screen.findByText('Clip')).toBeTruthy();
    expect(screen.getByText('Task')).toBeTruthy();
    expect(screen.getAllByText('Delete Template')).toHaveLength(2);
  });

  it('has no delete action for the last template', async () => {
    await templates.setValue([{ id: 'only', name: 'Only', content: 'x' }]);
    renderSidebar();
    expect(await screen.findByText('Only')).toBeTruthy();
    expect(screen.queryByText('Delete Template')).toBeNull();
  });

  it('shows the shortcut of the clip command beside the first template, and nothing for Task without one', async () => {
    renderSidebar();
    expect(await screen.findByText('Ctrl+Shift+U')).toBeTruthy();
    expect(document.querySelectorAll('kbd')).toHaveLength(1);
  });

  it('shows the shortcut of the clip-task command beside Task', async () => {
    (fakeBrowser as any).commands.getAll.mockResolvedValue([
      { name: 'clip-task', shortcut: 'Alt+T' },
    ]);
    renderSidebar();
    const key = await screen.findByText('Alt+T');
    await waitFor(() =>
      expect(key.closest('a')?.textContent).toContain('Task'),
    );
  });
});
