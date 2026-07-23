import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock next-intl so translations return the key as-is (worst case)
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Import the component that currently shows raw keys
import { ParticipantsSidebar } from '@/components/MeetingWorkspace/ParticipantsSidebar';

const fixtureParticipants = [
  { id: '1', name: 'Speaker 1', source: 'microphone', spokenSeconds: 30, share: 0.6, color: '#16a34a' },
  { id: '2', name: 'Speaker 2', source: 'system', spokenSeconds: 20, share: 0.4, color: '#2563eb' },
];

describe('raw translation key prevention', () => {
  it('never renders a raw locale key in the meeting people panel', () => {
    render(
      <ParticipantsSidebar
        participants={fixtureParticipants}
      />,
    );
    // Raw keys match pattern: UPPERCASE.UPPERCASE (dotted, all caps)
    // e.g. MEETINGWORKSPACE.MICROPHONE
    expect(
      screen.queryByText(/^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)+$/),
    ).not.toBeInTheDocument();
  });
});
