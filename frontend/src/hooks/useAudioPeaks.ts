import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { bucketPeaks } from '@/components/MeetingWorkspace/waveform';

const MAX_COLUMNS = 800;

export function useAudioPeaks(audioPath: string | null): Float32Array | null {
  const [peaks, setPeaks] = useState<Float32Array | null>(null);

  useEffect(() => {
    if (!audioPath) {
      setPeaks(null);
      return;
    }

    let cancelled = false;
    let ctx: AudioContext | null = null;

    (async () => {
      try {
        const bytes = await invoke<number[]>('read_audio_file', { filePath: audioPath });
        if (cancelled) return;

        ctx = new AudioContext();
        const arrayBuf = new Uint8Array(bytes).buffer;
        const decoded = await ctx.decodeAudioData(arrayBuf);
        if (cancelled) return;

        // Mix to mono
        const raw = decoded.getChannelData(0);
        const width = Math.min(MAX_COLUMNS, raw.length);
        const mono = new Float32Array(raw.length);
        for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
          const chData = decoded.getChannelData(ch);
          for (let i = 0; i < mono.length; i++) {
            mono[i] += chData[i] / decoded.numberOfChannels;
          }
        }

        setPeaks(bucketPeaks(mono, width));
      } catch (err) {
        console.error('useAudioPeaks error:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (ctx) {
        ctx.close().catch(() => {});
      }
    };
  }, [audioPath]);

  return peaks;
}
