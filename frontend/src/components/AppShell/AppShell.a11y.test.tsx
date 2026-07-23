import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock tauri invoke
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock useMeetingDirectory to return empty — no Tauri calls
vi.mock('@/hooks/useMeetingDirectory', () => ({
  useMeetingDirectory: () => ({
    meetings: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

import { AppShell } from './AppShell';

describe('AppShell accessibility', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue([]);
  });

  it('opens search with Ctrl+K and closes with Escape', async () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );

    // Search dialog not present initially
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.keyboard('{Control>}k{/Control}');

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeVisible();
    expect(screen.getByRole('searchbox')).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('never calls api_get_meetings when mounting', async () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );

    await waitFor(() => {
      expect(mockInvoke).not.toHaveBeenCalledWith('api_get_meetings');
    });
  });

  it('renders navigation with accessible labels', () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );

    const nav = screen.getByRole('navigation');
    expect(nav).toBeVisible();

    const links = screen.getAllByRole('link');
    for (const link of links) {
      expect(link).toHaveAccessibleName();
    }
  });
});
