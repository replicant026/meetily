import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock dependencies
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/hooks/useMeetingDirectory', () => ({
  useMeetingDirectory: () => ({
    meetings: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('lucide-react', () => ({
  Home: () => <span data-testid="icon-home" />,
  ListVideo: () => <span data-testid="icon-list" />,
  Users: () => <span data-testid="icon-users" />,
  Settings: () => <span data-testid="icon-settings" />,
  Plus: () => <span data-testid="icon-plus" />,
  Upload: () => <span data-testid="icon-upload" />,
  Download: () => <span data-testid="icon-download" />,
}));

vi.mock('@/components/ui/app-button', () => ({
  AppButton: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/AppShell/SidebarSearchDialog', () => ({
  SidebarSearchDialog: () => null,
}));

vi.mock('@/components/AppShell/SidebarMeetingList', () => ({
  SidebarMeetingList: () => null,
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Import AppShell
import { AppShell } from '@/components/AppShell/AppShell';

describe('Talat layout contract', () => {
  it('renders exactly one global navigation landmark', () => {
    render(
      <AppShell>
        <div>Page content</div>
      </AppShell>,
    );
    const navs = screen.getAllByRole('navigation', { name: /main navigation/i });
    expect(navs).toHaveLength(1);
  });

  it('renders main content region', () => {
    render(
      <AppShell>
        <div>Page content</div>
      </AppShell>,
    );
    expect(screen.getByRole('main')).toBeVisible();
  });
});
