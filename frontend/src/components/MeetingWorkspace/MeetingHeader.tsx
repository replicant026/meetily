"use client";

import { Play, Pause } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AudioController } from './types';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

interface MeetingHeaderProps {
  meeting: { id: string; title: string; created_at: string };
  audio: AudioController;
}

export function MeetingHeader({ meeting, audio }: MeetingHeaderProps) {
  const t = useTranslations('meetingWorkspace');
  const date = new Date(meeting.created_at);
  const dateStr = date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <header className="border-b border-[rgb(var(--app-border))] px-8 py-5 bg-[rgb(var(--app-bg))]">
      <p className="text-[11px] font-medium tracking-widest uppercase text-stone-400 mb-1">
        {dateStr}
      </p>
      <h1 className="text-4xl font-medium text-stone-900 leading-tight app-display-heading">
        {meeting.title}
      </h1>

      {/* Audio transport */}
      <div className="mt-3 flex items-center gap-3 text-sm text-stone-600">
        <button
          type="button"
          onClick={audio.toggle}
          disabled={audio.duration === 0}
          aria-label={audio.isPlaying ? t('pause') : t('play')}
          className="flex items-center justify-center w-8 h-8 rounded-full border border-stone-300 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {audio.isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <span className="font-mono tabular-nums text-xs">
          {formatTime(audio.currentTime)}
        </span>
        <div className="flex-1 h-1 bg-stone-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-[rgb(var(--app-accent))] rounded-full transition-[width] duration-100"
            style={{
              width: audio.duration > 0
                ? `${(audio.currentTime / audio.duration) * 100}%`
                : '0%',
            }}
          />
        </div>
        <span className="font-mono tabular-nums text-xs">
          {formatTime(audio.duration)}
        </span>
      </div>
    </header>
  );
}
