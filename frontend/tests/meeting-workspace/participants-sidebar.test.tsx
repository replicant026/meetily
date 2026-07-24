import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ParticipantsSidebar } from '@/components/MeetingWorkspace/ParticipantsSidebar';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

describe('ParticipantsSidebar', () => {
  const participants = [
    { id: 'me', name: 'You', source: 'microphone' as const, spokenSeconds: 30, share: 0.6, color: '#16a34a' },
    { id: 'ana', name: 'Ana', source: 'system' as const, spokenSeconds: 20, share: 0.4, color: '#2563eb' },
  ];

  it('uses complementary role with people label, not navigation', () => {
    render(<ParticipantsSidebar participants={participants} />);
    const aside = screen.getByRole('complementary', { name: /people/i });
    expect(aside).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('shows source groups with participant counts', () => {
    render(<ParticipantsSidebar participants={participants} />);
    expect(screen.getByText(/microphone/i)).toBeVisible();
    expect(screen.getByText(/systemAudio/i)).toBeVisible();
    expect(screen.getByText(/30s.*60%/i)).toBeVisible();
    expect(screen.getByText(/20s.*40%/i)).toBeVisible();
  });

  it('shows tags section', () => {
    render(<ParticipantsSidebar participants={participants} />);
    expect(screen.getByText(/tags/i)).toBeVisible();
  });

  it('always shows source cards even with no participants', () => {
    render(<ParticipantsSidebar participants={[]} />);
    expect(screen.getByText(/microphone/i)).toBeVisible();
    expect(screen.getByText(/systemAudio/i)).toBeVisible();
    expect(screen.getAllByText(/unassigned/i).length).toBe(2);
  });

  it('keeps imported or otherwise unprovenanced audio in one participants group', () => {
    render(<ParticipantsSidebar participants={[
      { id: 'paulo', name: 'Paulo', source: 'unknown', spokenSeconds: 110, share: 0.89, color: '#16a34a' },
      { id: 'felipe', name: 'Felipe', source: 'unknown', spokenSeconds: 14, share: 0.11, color: '#2563eb' },
    ]} />);

    expect(screen.getByText(/^participants$/i)).toBeVisible();
    expect(screen.queryByText(/^microphone$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^systemAudio$/i)).not.toBeInTheDocument();
  });
});
