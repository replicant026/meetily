import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeetingWorkspace } from '@/components/MeetingWorkspace/MeetingWorkspace';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const audioFixture = {
  isPlaying: false,
  currentTime: 30,
  duration: 120,
  toggle: vi.fn(),
  seek: vi.fn(),
};

const participants = [
  { id: 'p1', name: 'Alice', source: 'microphone' as const, spokenSeconds: 60, share: 0.6, color: '#16a34a' },
  { id: 'p2', name: 'Bob', source: 'system' as const, spokenSeconds: 40, share: 0.4, color: '#2563eb' },
];

const fixture = {
  meeting: { id: 'm-1', title: 'Test Meeting', created_at: '2025-01-01T10:00:00Z' },
  audio: audioFixture,
  participants,
  peaks: new Float32Array([0.1, 0.5, 1.0]),
  transcriptContent: <div>Transcript content</div>,
  notesContent: <div>Notes content</div>,
  actionsContent: <div>Actions content</div>,
};

describe('MeetingWorkspace integration', () => {
  it('renders all four tabs and participants sidebar', () => {
    render(<MeetingWorkspace {...fixture} />);

    expect(screen.getByRole('tab', { name: /transcript/i })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: /notes/i })).toBeVisible();
    expect(screen.getByRole('tab', { name: /actions/i })).toBeVisible();
    expect(screen.getByRole('tab', { name: /summary/i })).toBeVisible();
    expect(screen.getByRole('complementary', { name: /participants/i })).toBeVisible();
  });

  it('displays participant names', () => {
    render(<MeetingWorkspace {...fixture} />);
    expect(screen.getByText('Alice')).toBeVisible();
    expect(screen.getByText('Bob')).toBeVisible();
  });

  it('shows audio duration in header', () => {
    render(<MeetingWorkspace {...fixture} />);
    // formatTime(120) = "02:00"
    expect(screen.getByText('02:00')).toBeVisible();
  });

  it('switches tabs on click', async () => {
    const user = userEvent.setup();
    render(<MeetingWorkspace {...fixture} />);

    await user.click(screen.getByRole('tab', { name: /notes/i }));
    expect(screen.getByRole('tab', { name: /notes/i })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Notes content')).toBeVisible();
  });
});
