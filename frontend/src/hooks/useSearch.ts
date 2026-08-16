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

  const search = useCallback(async (query: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await invoke<SearchResult[]>('search_meetings', {
          query: query.trim(),
          limit: 20,
        });
        setResults(res);
      } catch (e) {
        console.error('Search failed:', e);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const reindex = useCallback(async () => {
    try {
      const count = await invoke<number>('reindex_meetings');
      return count;
    } catch (e) {
      console.error('Reindex failed:', e);
      return 0;
    }
  }, []);

  return { results, isSearching, search, reindex };
}
