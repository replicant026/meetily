import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock child components
vi.mock('@/components/MeetingWorkspace/MeetingHeader', () => ({
  MeetingHeader: () => <div data-testid="meeting-header" />,
}));

vi.mock('@/components/MeetingWorkspace/MeetingTimeline', () => ({
  MeetingTimeline: () => <div data-testid="meeting-timeline" />,
}));

vi.mock('@/components/MeetingWorkspace/MeetingTabs', () => ({
  MeetingTabs: () => <div data-testid="meeting-tabs" />,
}));

vi.mock('@/components/MeetingWorkspace/MeetingSummaryTab', () => ({
  MeetingSummaryTab: () => <div />,
}));

import { MeetingWorkspace } from '@/components/MeetingWorkspace/MeetingWorkspace';

const defaultProps = {
  meeting: { id: 'm1', title: 'Test Meeting', created_at: new Date().toISOString() },
  audio: {
    isPlaying: false,
    currentTime: 0,
    duration: 100,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
  } as any,
  participants: [
    { id: 'p1', name: 'Felipe', source: 'microphone' as const, color: '#3b82f6', spokenSeconds: 120, share: 0.6 },
    { id: 'p2', name: 'Ana', source: 'system' as const, color: '#10b981', spokenSeconds: 80, share: 0.4 },
  ],
};

describe('MeetingWorkspace layout', () => {
  it('has exactly one meetingContent section', () => {
    render(<MeetingWorkspace {...defaultProps} />);
    expect(screen.getAllByRole('region', { name: 'meetingContent' })).toHaveLength(1);
  });

  it('has a complementary people aside', () => {
    render(<MeetingWorkspace {...defaultProps} />);
    expect(screen.getByRole('complementary', { name: 'people' })).toBeVisible();
  });

  it('grid has the desktop layout testid', () => {
    render(<MeetingWorkspace {...defaultProps} />);
    const grid = screen.getByTestId('meeting-workspace-grid');
    expect(grid).toHaveClass('lg:grid-cols-[minmax(0,1fr)_22rem]');
  });

  it('uses h-full containment instead of min-h-screen', () => {
    const { container } = render(<MeetingWorkspace {...defaultProps} />);
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain('h-full');
    expect(outer.className).not.toContain('min-h-screen');
  });

  it('keeps the workspace content on the shared warm application background', () => {
    const { container } = render(<MeetingWorkspace {...defaultProps} />);
    const content = container.querySelector('[aria-label="meetingContent"]');
    expect(content).toHaveClass('bg-[rgb(var(--app-bg))]');
    expect(content).not.toHaveClass('bg-white');
  });
});
