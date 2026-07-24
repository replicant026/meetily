import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock next-intl — return key as-is since component calls t('nav.home') etc.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, opts?: any) => {
    if (key === 'subtitle') return 'Your meetings, transcribed locally';
    if (key === 'no_meetings_yet') return 'No meetings yet';
    if (key === 'has_summary') return 'Summary available';
    if (key === 'recent_meetings') return 'Recent meetings';
    return key;
  },
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock @/hooks/useMeetingDirectory
const mockMeetings = Array.from({ length: 6 }, (_, i) => ({
  id: `meeting-${i}`,
  title: `Meeting ${i}`,
  createdAt: new Date().toISOString(),
  durationSeconds: 300,
  hasSummary: i % 2 === 0,
}));

vi.mock('@/hooks/useMeetingDirectory', () => ({
  useMeetingDirectory: () => ({ meetings: mockMeetings, isLoading: false, error: null }),
}));

// Mock AppSurface
vi.mock('@/components/ui/app-surface', () => ({
  AppSurface: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

import { HomeDashboard } from '@/app/_components/HomeDashboard';
import { RecentMeetings } from '@/app/_components/RecentMeetings';

describe('Home and Meetings shared layout', () => {
  it('Home renders display heading', () => {
    render(<HomeDashboard />);
    // Mock returns key as-is: t('nav.home') → 'nav.home'
    expect(screen.getByRole('heading', { name: 'nav.home' })).toBeVisible();
  });

  it('Home uses app-page class (no max-w-md)', () => {
    const { container } = render(<HomeDashboard />);
    expect(container.querySelector('.max-w-md')).toBeNull();
    expect(container.querySelector('.app-page')).not.toBeNull();
  });

  it('RecentMeetings renders 6 meeting buttons', () => {
    render(<RecentMeetings meetings={mockMeetings} maxItems={6} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(6);
  });

  it('RecentMeetings uses flat list layout (no card-per-row)', () => {
    const { container } = render(<RecentMeetings meetings={mockMeetings} maxItems={6} />);
    const firstButton = container.querySelector('button');
    expect(firstButton?.className).toContain('border-b');
    expect(firstButton?.className).not.toContain('rounded-lg');
  });

  it('RecentMeetings empty state renders', () => {
    render(<RecentMeetings meetings={[]} maxItems={6} />);
    expect(screen.getByText('No meetings yet')).toBeVisible();
  });
});
