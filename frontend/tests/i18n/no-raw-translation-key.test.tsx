import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock next-intl so translations return the key as-is (worst case)
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock sonner
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Mock speaker-api
vi.mock('@/lib/speaker-api', () => ({
  getRecognitionPreferences: vi.fn().mockResolvedValue({
    recognitionMode: 'off',
    lockAudioChannels: false,
    minimumReferenceQuality: 0.5,
  }),
  setRecognitionPreferences: vi.fn().mockResolvedValue(undefined),
}));

// Import components that may show raw keys
import { ParticipantsSidebar } from '@/components/MeetingWorkspace/ParticipantsSidebar';
import { SpeakerRecognitionSettings } from '@/components/speakers/SpeakerRecognitionSettings';

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
    // Raw keys match pattern: word.dotted.key.segments (common i18n key shape)
    // e.g. MEETINGWORKSPACE.MICROPHONE or speakers.recognition.mode_Suggest_desc
    expect(
      screen.queryByText(/^[a-z]+\.[a-z]+(\.[a-z0-9_]+)+$/i),
    ).not.toBeInTheDocument();
  });

  it('never renders a raw locale key in speaker recognition settings', async () => {
    render(<SpeakerRecognitionSettings />);
    expect(
      screen.queryByText(/^[a-z]+\.[a-z]+(\.[a-z0-9_]+)+$/i),
    ).not.toBeInTheDocument();
  });
});
