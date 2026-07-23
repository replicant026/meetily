import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ParticipantsSidebar } from '@/components/MeetingWorkspace/ParticipantsSidebar';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

describe('ParticipantsSidebar', () => {
  it('groups speakers and presents time share', () => {
    render(<ParticipantsSidebar participants={[
      { id: 'me', name: 'You', source: 'microphone', spokenSeconds: 30, share: 0.6, color: '#16a34a' },
      { id: 'ana', name: 'Ana', source: 'system', spokenSeconds: 20, share: 0.4, color: '#2563eb' },
    ]} />);
    expect(screen.getByText(/microphone/i)).toBeVisible();
    expect(screen.getByText(/systemAudio/i)).toBeVisible();
    expect(screen.getByText(/30s.*60%/i)).toBeVisible();
  });
});
