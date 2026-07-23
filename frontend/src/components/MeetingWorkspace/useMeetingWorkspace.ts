import { useMemo } from 'react';
import { WorkspaceParticipant } from './types';
import { Transcript } from '@/types';

const SPEAKER_COLORS = ['#16a34a', '#2563eb', '#dc2626', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export function useMeetingWorkspace(transcripts: Transcript[]): WorkspaceParticipant[] {
  return useMemo(() => {
    const speakerMap = new Map<string, { seconds: number; source: 'microphone' | 'system' }>();
    
    for (const seg of transcripts) {
      const id = seg.speaker ?? seg.transient_speaker ?? 'unassigned';
      const duration = Math.max(0, (seg.audio_end_time ?? seg.audio_start_time) - seg.audio_start_time);
      const existing = speakerMap.get(id);
      if (existing) {
        existing.seconds += duration;
      } else {
        speakerMap.set(id, { seconds: duration, source: 'system' }); // default, refined below
      }
    }
    
    const totalSeconds = [...speakerMap.values()].reduce((sum, s) => sum + s.seconds, 0) || 1;
    
    return [...speakerMap.entries()].map(([id, data], i) => ({
      id,
      name: id === 'unassigned' ? 'Unassigned' : id,
      color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
      source: data.source,
      spokenSeconds: Math.round(data.seconds),
      share: data.seconds / totalSeconds,
    }));
  }, [transcripts]);
}
