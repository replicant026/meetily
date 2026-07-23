import { useMemo } from 'react';
import { WorkspaceParticipant } from './types';
import { Transcript } from '@/types';

const SPEAKER_COLORS = ['#16a34a', '#2563eb', '#dc2626', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

/**
 * Derive workspace participants from transcript segments.
 *
 * Source derivation heuristic:
 * - The first distinct speaker encountered is treated as the local microphone.
 * - All other speakers are treated as system/remote audio.
 * - 'unassigned' segments (no speaker label) are grouped separately.
 *
 * This is a best-effort heuristic since the Transcript model does not carry
 * an explicit audio-source field. Refine when diarization metadata is available.
 */
export function useMeetingWorkspace(transcripts: Transcript[]): WorkspaceParticipant[] {
  return useMemo(() => {
    const speakerMap = new Map<string, { seconds: number; source: 'microphone' | 'system' }>();
    let firstSpeakerId: string | null = null;

    for (const seg of transcripts) {
      const id = seg.speaker ?? seg.transient_speaker ?? 'unassigned';
      const start = seg.audio_start_time ?? 0;
      const end = seg.audio_end_time ?? start;
      const duration = Math.max(0, end - start);

      if (firstSpeakerId === null && id !== 'unassigned') {
        firstSpeakerId = id;
      }

      const existing = speakerMap.get(id);
      if (existing) {
        existing.seconds += duration;
      } else {
        speakerMap.set(id, { seconds: duration, source: 'system' });
      }
    }

    // Refine: first speaker is the local microphone
    if (firstSpeakerId) {
      const first = speakerMap.get(firstSpeakerId);
      if (first) first.source = 'microphone';
    }

    const totalSeconds = [...speakerMap.values()].reduce((sum, s) => sum + s.seconds, 0) || 1;

    return [...speakerMap.entries()].map(([id, data], i) => ({
      id,
      name: id === 'unassigned' ? 'unassigned' : id,
      color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
      source: data.source,
      spokenSeconds: Math.round(data.seconds),
      share: data.seconds / totalSeconds,
    }));
  }, [transcripts]);
}
