'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface SearchResult {
  meetingId: string;
  meetingTitle: string;
  snippet: string;
  timestamp: number | null;
}

interface SidebarSearchDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SidebarSearchDialog({ open, onClose }: SidebarSearchDialogProps) {
  const t = useTranslations('sidebar.meeting_list');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Focus input on open, clear on close
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const found = await invoke<SearchResult[]>('api_search_transcripts', { query: query.trim() });
        setResults(found);
      } catch {
        setResults([]);
      }
      setIsLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = useCallback((meetingId: string) => {
    router.push(`/meeting-details?id=${meetingId}`);
    onClose();
  }, [router, onClose]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center pt-[20vh]"
      role="dialog"
      aria-label={t('search_meetings')}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-[rgb(var(--app-border))] px-4 py-3">
          <Search className="h-4 w-4 text-[rgb(var(--app-muted-fg))]" />
          <input
            ref={inputRef}
            type="search"
            role="searchbox"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search_placeholder')}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[rgb(var(--app-muted-fg))]"
          />
          <button onClick={onClose} className="rounded p-1 hover:bg-[rgb(var(--app-muted))]">
            <X className="h-4 w-4 text-[rgb(var(--app-muted-fg))]" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {isLoading && (
            <p className="px-4 py-6 text-center text-sm text-[rgb(var(--app-muted-fg))]">
              {t('searching')}
            </p>
          )}
          {!isLoading && query && results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-[rgb(var(--app-muted-fg))]">
              {t('no_results')}
            </p>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.meetingId}-${i}`}
              onClick={() => handleSelect(r.meetingId)}
              className="flex w-full flex-col gap-1 px-4 py-2.5 text-left text-sm hover:bg-[rgb(var(--app-muted))]"
            >
              <span className="font-medium text-[rgb(var(--app-fg))]">{r.meetingTitle}</span>
              <span className="line-clamp-1 text-xs text-[rgb(var(--app-muted-fg))]">{r.snippet}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
