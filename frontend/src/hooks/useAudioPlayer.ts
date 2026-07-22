import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

function mimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp3': return 'audio/mpeg';
    case 'mp4': return 'audio/mp4';
    case 'm4a': return 'audio/mp4';
    case 'wav': return 'audio/wav';
    default: return 'application/octet-stream';
  }
}

export const useAudioPlayer = (audioPath: string | null) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const handlersRef = useRef<{ ev: string; fn: EventListener }[]>([]);

  const cleanup = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      // Remove all tracked listeners
      for (const h of handlersRef.current) {
        audio.removeEventListener(h.ev, h.fn);
      }
      audio.removeAttribute('src');
      audio.load();
    }
    audioRef.current = null;
    handlersRef.current = [];
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  // Cleanup on unmount or audioPath change
  useEffect(() => {
    return cleanup;
  }, [audioPath, cleanup]);

  useEffect(() => {
    if (!audioPath) return;

    let cancelled = false;

    cleanup();
    setError(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    invoke<number[]>('read_audio_file', { filePath: audioPath })
      .then((bytes) => {
        if (cancelled) return;

        const mime = mimeFromPath(audioPath);
        const blob = new Blob([new Uint8Array(bytes)], { type: mime });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        const audio = new Audio(url);

        if (cancelled) {
          audio.src = '';
          URL.revokeObjectURL(url);
          return;
        }

        audioRef.current = audio;

        const onLoaded = () => { if (!cancelled) setDuration(audio.duration); };
        const onTime = () => { if (!cancelled) setCurrentTime(audio.currentTime); };
        const onPlay = () => { if (!cancelled) setIsPlaying(true); };
        const onPause = () => { if (!cancelled) setIsPlaying(false); };
        const onEnd = () => { if (!cancelled) { setIsPlaying(false); setCurrentTime(0); } };
        const onError = () => { if (!cancelled) setError('Failed to load audio file'); };

        const pairs: [string, EventListener][] = [
          ['loadedmetadata', onLoaded],
          ['timeupdate', onTime],
          ['play', onPlay],
          ['pause', onPause],
          ['ended', onEnd],
          ['error', onError],
        ];
        for (const [ev, fn] of pairs) {
          audio.addEventListener(ev, fn);
          handlersRef.current.push({ ev, fn });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Error reading audio file:', err);
          setError('Failed to read audio file');
        }
      });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [audioPath, cleanup]);

  const play = useCallback(async () => {
    if (!audioRef.current) return;
    try {
      await audioRef.current.play();
    } catch (err) {
      console.error('Error during playback:', err);
      setError('Failed to play audio');
    }
  }, []);

  const pause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
  }, []);

  const seek = useCallback(
    (time: number) => {
      if (!audioRef.current) return;
      audioRef.current.currentTime = Math.max(0, Math.min(time, duration));
    },
    [duration],
  );

  return { isPlaying, currentTime, duration, error, play, pause, seek };
};
