import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface SearchResult {
  meetingId: string;
  meetingTitle: string;
  snippet: string;
  timestamp: string;
  rank: number;
}

export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const requestIdRef = useRef(0);

  const search = useCallback(async (query: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Increment request ID before the early-return so empty queries
    // invalidate any in-flight request instead of letting it overwrite.
    const currentRequestId = ++requestIdRef.current;

    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await invoke<SearchResult[]>('search_meetings', {
          query: query.trim(),
          limit: 20,
        });
        // Only update results if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          setResults(res);
        }
      } catch (e) {
        console.error('Search failed:', e);
        if (currentRequestId === requestIdRef.current) {
          setResults([]);
        }
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setIsSearching(false);
        }
      }
    }, 300);
  }, []);

  const reindex = useCallback(async () => {
    return await invoke<number>('reindex_meetings');
  }, []);

  return { results, isSearching, search, reindex };
}
