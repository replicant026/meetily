"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { getMeetingNote, saveMeetingNote } from '@/lib/meeting-workspace-storage';

interface MeetingNotesTabProps {
  meetingId: string;
}

export function MeetingNotesTab({ meetingId }: MeetingNotesTabProps) {
  const t = useTranslations('meetingWorkspace');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meetingIdRef = useRef(meetingId);

  // Load existing note on mount
  useEffect(() => {
    let cancelled = false;
    getMeetingNote(meetingId).then((existing) => {
      if (!cancelled && existing) setNote(existing);
    });
    return () => { cancelled = true; };
  }, [meetingId]);

  // Cancel pending timer when meetingId changes
  useEffect(() => {
    meetingIdRef.current = meetingId;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [meetingId]);

  const persist = useCallback(async (content: string) => {
    setStatus('saving');
    await saveMeetingNote(meetingIdRef.current, content);
    setStatus('saved');
  }, []);

  const debouncedSave = useCallback(
    (content: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setStatus('idle');
      timerRef.current = setTimeout(() => {
        persist(content);
      }, 500);
    },
    [persist],
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNote(value);
    debouncedSave(value);
  };

  const handleBlur = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    persist(note);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-stone-100">
        <span className="text-xs text-stone-400">
          {status === 'saving' ? t('saving') : status === 'saved' ? t('saved') : '\u00A0'}
        </span>
      </div>
      <textarea
        aria-label="Meeting notes"
        value={note}
        onChange={handleChange}
        onBlur={handleBlur}
        className="flex-1 resize-none p-4 text-sm leading-relaxed focus:outline-none bg-transparent"
        placeholder={t('notesPlaceholder')}
      />
    </div>
  );
}
