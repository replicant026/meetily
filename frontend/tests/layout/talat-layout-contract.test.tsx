import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TooltipProvider } from '@radix-ui/react-tooltip';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock @/hooks/useMeetingDirectory
vi.mock('@/hooks/useMeetingDirectory', () => ({
  useMeetingDirectory: () => ({ meetings: [], isLoading: false, error: null }),
}));

// Mock SidebarSearchDialog
vi.mock('@/components/AppShell/SidebarSearchDialog', () => ({
  SidebarSearchDialog: () => null,
}));

import { AppShell } from '@/components/AppShell/AppShell';
import { SidebarNavigation } from '@/components/AppShell/SidebarNavigation';

const globalsPath = path.resolve(__dirname, '../../src/app/globals.css');

function renderWithTooltip(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('Talat layout contract', () => {
  it('Meetings rail item targets /meetings', () => {
    renderWithTooltip(<SidebarNavigation />);
    const meetingsLink = screen.getByRole('link', { name: 'common.nav.meetings' });
    expect(meetingsLink).toHaveAttribute('href', '/meetings');
  });

  it('Home rail item targets /', () => {
    renderWithTooltip(<SidebarNavigation />);
    const homeLink = screen.getByRole('link', { name: 'common.nav.home' });
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('has exactly one global navigation landmark', () => {
    renderWithTooltip(<AppShell><div /></AppShell>);
    expect(screen.getAllByRole('navigation', { name: 'Main Navigation' })).toHaveLength(1);
  });

  it('rail uses w-16 width', () => {
    renderWithTooltip(<AppShell><div /></AppShell>);
    const nav = screen.getByRole('navigation', { name: 'Main Navigation' });
    expect(nav.parentElement).toHaveClass('w-16');
  });

  it('globals.css defines --app-bg token', () => {
    const css = readFileSync(globalsPath, 'utf8');
    expect(css).toContain('--app-bg');
  });

  it('globals.css defines .app-display-heading class', () => {
    const css = readFileSync(globalsPath, 'utf8');
    expect(css).toContain('.app-display-heading');
  });

  it('globals.css defines .app-page utility', () => {
    const css = readFileSync(globalsPath, 'utf8');
    expect(css).toContain('.app-page');
  });

  it('globals.css defines .app-surface utility', () => {
    const css = readFileSync(globalsPath, 'utf8');
    expect(css).toContain('.app-surface');
  });
});
