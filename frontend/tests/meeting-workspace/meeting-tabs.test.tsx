import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MeetingWorkspace } from '@/components/MeetingWorkspace/MeetingWorkspace';

// Mock dependencies
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const audioFixture = {
  isPlaying: false,
  currentTime: 0,
  duration: 120,
  toggle: vi.fn(),
  seek: vi.fn(),
};

const fixture = {
  meeting: { id: 'm-1', title: 'Test Meeting', created_at: '2025-01-01T10:00:00Z' },
  audio: audioFixture,
  participants: [],
  segments: [],
  summary: null,
  transcripts: [],
  // Add other required props
};

describe('MeetingWorkspace', () => {
  it('starts on Transcript and shows all workspace regions', () => {
    render(<MeetingWorkspace {...fixture} />);
    expect(screen.getByRole('tab', { name: /transcript/i })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: /notes/i })).toBeVisible();
    expect(screen.getByRole('tab', { name: /actions/i })).toBeVisible();
    expect(screen.getByRole('tab', { name: /summary/i })).toBeVisible();
    expect(screen.getByRole('complementary', { name: /participants/i })).toBeVisible();
  });
});
