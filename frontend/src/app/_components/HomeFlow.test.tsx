import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock useMeetingDirectory to control returned meetings
const mockUseMeetingDirectory = vi.fn();
vi.mock('@/hooks/useMeetingDirectory', () => ({
  useMeetingDirectory: () => mockUseMeetingDirectory(),
}));

import { HomeDashboard } from './HomeDashboard';

const defaultProps = {
  hasMicPermission: true,
  hasSystemAudio: false,
  onStartRecording: vi.fn(),
  onConfigureAudio: vi.fn(),
  recoverableMeetings: [] as { id: string; title: string }[],
  onRecover: vi.fn(),
};

describe('HomeFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMeetingDirectory.mockReturnValue({
      meetings: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('shows quick start when callbacks provided', () => {
    render(<HomeDashboard {...defaultProps} />);

    // HomeQuickStart renders quick_start_title and start_recording (translation keys)
    expect(screen.getByText('quick_start_title')).toBeVisible();
    expect(screen.getByText('start_recording')).toBeVisible();
  });

  it('shows empty state when no meetings exist', () => {
    render(<HomeDashboard {...defaultProps} />);

    // RecentMeetings empty state shows no_meetings_yet
    expect(screen.getByText('no_meetings_yet')).toBeVisible();
  });

  it('shows recent meetings when they exist', () => {
    mockUseMeetingDirectory.mockReturnValue({
      meetings: [
        {
          id: 'm1',
          title: 'Team Standup',
          createdAt: new Date().toISOString(),
          updatedAt: null,
          durationSeconds: 1200,
          transcriptSegmentCount: 45,
          hasSummary: true,
          recordingState: 'ready',
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<HomeDashboard {...defaultProps} />);

    expect(screen.getByText('Team Standup')).toBeVisible();
  });
});
