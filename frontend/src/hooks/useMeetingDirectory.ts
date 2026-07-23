'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { listHomeMeetings, type MeetingDirectoryItem, type MeetingDirectoryState } from '@/lib/meeting-directory';

/**
 * Hook to load and manage the meeting directory from the Tauri core.
 * Loads once on mount, exposes refetch, and handles errors.
 */
export function useMeetingDirectory(): MeetingDirectoryState {
  const [meetings, setMeetings] = useState<MeetingDirectoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listHomeMeetings(50);
      if (mountedRef.current) {
        setMeetings(data);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load meetings');
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  return { meetings, isLoading, error, refetch: load };
}
