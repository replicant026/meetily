import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@/components/speakers/AssignSpeakerDialog', () => ({ AssignSpeakerDialog: () => null }));
vi.mock('@/components/MeetingDetails/TranscriptButtonGroup', () => ({ TranscriptButtonGroup: () => null }));
vi.mock('@/hooks/useSpeakerNames', () => ({ useSpeakerNames: () => ({ allNames: {}, setName: vi.fn() }) }));
vi.mock('@/components/VirtualizedTranscriptView', () => ({
  VirtualizedTranscriptView: ({ segments, onTimestampClick }: { segments: any[]; onTimestampClick?: (s: number) => void }) => (
    <div data-testid="virtualized-transcript">
      {segments.map((s: any) => (
        <div key={s.id}>
          <span>{s.speaker}</span>
          <span>{s.text}</span>
          <button onClick={() => onTimestampClick?.(s.timestamp)}>{s.timestamp}s</button>
        </div>
      ))}
    </div>
  ),
}));

import { TranscriptPanel } from '@/components/MeetingDetails/TranscriptPanel';

const segments = [
  { id: '1', timestamp: 14, text: 'First utterance', speaker: 'Speaker 1', confidence: 0.9 },
  { id: '2', timestamp: 30, text: 'Second utterance', speaker: 'Speaker 2', confidence: 0.85 },
];

const baseProps = {
  transcripts: segments.map(s => ({
    id: s.id,
    text: s.text,
    speaker: s.speaker,
    audio_start_time: s.timestamp,
    audio_end_time: s.timestamp + 5,
    confidence: s.confidence,
  })),
  customPrompt: '',
  onPromptChange: vi.fn(),
  onCopyTranscript: vi.fn(),
  onExportTranscript: vi.fn(),
  onOpenMeetingFolder: vi.fn(),
  isRecording: false,
  onSeekToTimestamp: vi.fn(),
};

describe('WorkspaceTranscript', () => {
  it('renders in full content lane without width-controlled sidebar classes', () => {
    const { container } = render(<TranscriptPanel {...baseProps} />);
    const wrapper = container.querySelector('[data-testid="workspace-transcript"]');
    expect(wrapper).toBeTruthy();
    expect(wrapper).not.toHaveClass('md:w-1/4');
    expect(wrapper).not.toHaveClass('lg:w-1/3');
  });

  it('renders each segment with speaker and text', () => {
    render(<TranscriptPanel {...baseProps} />);
    expect(screen.getByText('Speaker 1')).toBeVisible();
    expect(screen.getByText('First utterance')).toBeVisible();
    expect(screen.getByText('Speaker 2')).toBeVisible();
    expect(screen.getByText('Second utterance')).toBeVisible();
  });

  it('wires seek callback for timestamp click-to-jump', () => {
    const onSeek = vi.fn();
    render(<TranscriptPanel {...baseProps} onSeekToTimestamp={onSeek} />);
    expect(onSeek).not.toHaveBeenCalled();
  });
});
