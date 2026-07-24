'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { AudioController } from './types';
import { secondsFromPointer } from './waveform';

export interface MeetingTimelineProps {
  audio: AudioController;
  peaks: Float32Array | null;
  segments?: Array<{ id: string; speaker?: string; start_time: number; end_time: number }>;
}

const BAR_COLOR = '#a8a29e'; // stone-400
const ELAPSED_COLOR = '#c026d3'; // magenta-600 (matches header progress bar)
const DISABLED_COLOR = '#e7e5e4'; // stone-200

export function MeetingTimeline({ audio, peaks }: MeetingTimelineProps) {
  const t = useTranslations('meetingWorkspace');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const baseline = h - 3;

    ctx.clearRect(0, 0, w, h);

    if (!peaks || peaks.length === 0) {
      // Disabled neutral bar
      ctx.fillStyle = DISABLED_COLOR;
      ctx.fillRect(0, baseline, w, 1);
      return;
    }

    const barWidth = Math.max(1, w / peaks.length);
    const progress = audio.duration > 0 ? audio.currentTime / audio.duration : 0;

    for (let i = 0; i < peaks.length; i++) {
      const x = i * barWidth;
      const barH = Math.max(2, peaks[i] * (h - 6));
      const ratio = (i + 0.5) / peaks.length;

      ctx.fillStyle = ratio <= progress ? ELAPSED_COLOR : BAR_COLOR;
      ctx.fillRect(x, baseline - barH, Math.max(1, barWidth - 1), barH);
    }
  }, [peaks, audio.currentTime, audio.duration]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Redraw on animation frame while playing
  useEffect(() => {
    if (!audio.isPlaying) return;
    let raf: number;
    const tick = () => {
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audio.isPlaying, draw]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const rect = canvas.getBoundingClientRect();
    const seconds = secondsFromPointer(e.clientX, rect, audio.duration);
    audio.seek(seconds);
  };

  return (
    <button
      type="button"
      aria-label={t('audioTimeline')}
      onClick={handleClick}
      className="w-full h-16 px-0 py-1 bg-transparent border-0 cursor-pointer block"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </button>
  );
}
