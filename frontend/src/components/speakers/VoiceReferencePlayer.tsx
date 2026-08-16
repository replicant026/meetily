'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { getReferenceAudioPath } from '@/lib/speaker-api';
import type { VoiceReference } from '@/lib/speaker-types';
import { useTranslations } from 'next-intl';

interface VoiceReferencePlayerProps {
  reference: VoiceReference;
  isCompact?: boolean;
}

export function VoiceReferencePlayer({ reference, isCompact }: VoiceReferencePlayerProps) {
  const t = useTranslations('speakers');
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const { isPlaying, currentTime, duration, play, pause, seek } = useAudioPlayer(
    reference.has_playable_audio ? audioPath : null,
  );

  useEffect(() => {
    if (!reference.has_playable_audio) return;
    let cancelled = false;
    getReferenceAudioPath(reference.id).then((p) => {
      if (!cancelled) setAudioPath(p);
    });
    return () => { cancelled = true; };
  }, [reference.id, reference.has_playable_audio]);

  if (!reference.has_playable_audio) {
    return (
      <span className="text-xs text-muted-foreground italic">
        {t('reference.no_audio')}
      </span>
    );
  }

  const durationSec = duration > 0 ? duration : reference.duration_ms / 1000;
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className={isCompact ? 'flex items-center gap-2' : 'space-y-1'}>
      <button
        type="button"
        onClick={() => (isPlaying ? pause() : play())}
        className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="2" y="1" width="3" height="10" rx="1" />
            <rect x="7" y="1" width="3" height="10" rx="1" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M3 1.5v9l7.5-4.5L3 1.5z" />
          </svg>
        )}
      </button>
      {!isCompact && (
        <>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatTime(currentTime)} / {formatTime(durationSec)}
          </span>
          <input
            type="range"
            min={0}
            max={durationSec || reference.duration_ms / 1000}
            step={0.1}
            value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="w-full h-1 accent-primary cursor-pointer"
          />
        </>
      )}
    </div>
  );
}
