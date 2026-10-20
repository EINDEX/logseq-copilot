import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { fakeBrowser } from 'wxt/testing';
import { templates } from '@/utils/storage';

vi.mock('./layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('./pages/connection-page', () => ({
  default: () => <div>connection page</div>,
}));
vi.mock('./pages/search-engine-page', () => ({
  default: () => <div>search engine page</div>,
}));

import App from './App';
import { AppSidebar } from './components/app-sidebar';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

describe('options routes', () => {
  beforeEach(() => {
    cleanup();
    fakeBrowser.reset();
  });

  it('/templates redirects to the first template editor', async () => {
    await templates.setValue([
      { id: 'a', name: 'Alpha', content: 'alpha content' },
      { id: 'b', name: 'Beta', content: 'beta content' },
    ]);
    renderAt('/templates');
    expect(await screen.findByDisplayValue('Alpha')).toBeTruthy();
  });

  it('/templates shows an empty state with a create button when there are no templates', async () => {
    await templates.setValue([]);
    renderAt('/templates');
    const button = await screen.findByText('Create template');
    button.click();
    await waitFor(async () => {
      expect((await templates.getValue()).length).toBe(1);
    });
    // after creation the first template's editor is shown
    expect(await screen.findByDisplayValue('New Template 1')).toBeTruthy();
  });

  it('an unknown template id falls back to /templates and then the first template', async () => {
    await templates.setValue([{ id: 'a', name: 'Alpha', content: 'x' }]);
    renderAt('/template/missing');
    expect(await screen.findByDisplayValue('Alpha')).toBeTruthy();
  });

  it('does not render the hidden AI configuration page', async () => {
    renderAt('/ai-config');
    expect(await screen.findByText('connection page')).toBeTruthy();
    expect(screen.queryByText(/AI Configuration/i)).toBeNull();
  });
});

describe('AppSidebar', () => {
  it('has no AI Configuration entry', () => {
    cleanup();
    vi.stubGlobal(
      'matchMedia',
      () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    );
    const { container } = render(
      <MemoryRouter>
        <AppSidebarWithProvider />
      </MemoryRouter>,
    );
    expect(container.textContent).not.toContain('AI Configuration');
    expect(container.textContent).toContain('Templates');
  });
});

import { SidebarProvider } from '@/components/ui/sidebar';
function AppSidebarWithProvider() {
  return (
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>
  );
}
