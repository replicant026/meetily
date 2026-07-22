'use client';

import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';

type SpeakerNames = Record<string, string>;

export function useSpeakerNames(meetingId: string | null | undefined) {
  const [allNames, setAllNames] = useState<SpeakerNames>({});
  const [loading, setLoading] = useState(false);

  // Load speaker names from backend on mount / meeting change
  useEffect(() => {
    if (!meetingId) {
      setAllNames({});
      return;
    }

    let cancelled = false;
    setLoading(true);

    invoke<string[]>('list_speaker_names')
      .then((names) => {
        if (cancelled) return;
        // Convert array of names to Record<string, string>
        // The backend stores display_name globally; we map meeting-specific speaker labels
        // For now, we load all known names and let the transcript view match by label
        const map: SpeakerNames = {};
        names.forEach((name) => {
          map[name] = name;
        });
        setAllNames(map);
      })
      .catch((e) => {
        console.warn('Failed to load speaker names from backend:', e);
        // Fallback to empty — transcript view will show "Speaker N"
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  const setName = useCallback((speakerId: string, friendlyName: string) => {
    if (!meetingId) return;

    const trimmedName = friendlyName.trim();
    if (!trimmedName) {
      // Remove name — delete from backend
      invoke<number>('delete_speaker_profile', { displayName: speakerId })
        .catch((e) => console.warn('Failed to delete speaker profile:', e));

      setAllNames((current) => {
        const next = { ...current };
        delete next[speakerId];
        return next;
      });
      return;
    }

    // Save to backend — this enrolls the speaker profile globally
    invoke<string>('enroll_speaker', {
      displayName: trimmedName,
      embedding: [], // Empty embedding for now; will be populated by diarization
    }).catch((e) => console.warn('Failed to enroll speaker:', e));

    setAllNames((current) => ({
      ...current,
      [speakerId]: trimmedName,
    }));
  }, [meetingId]);

  return { allNames, setName, loading };
}
