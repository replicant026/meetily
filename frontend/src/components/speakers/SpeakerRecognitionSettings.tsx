'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Shield } from 'lucide-react';
import { getRecognitionPreferences, setRecognitionPreferences } from '@/lib/speaker-api';
import type { RecognitionMode } from '@/lib/speaker-types';
import { toast } from 'sonner';

const MODES: RecognitionMode[] = ['off', 'suggest', 'automatic'];

export function SpeakerRecognitionSettings() {
  const t = useTranslations('speakers.recognition');
  const [mode, setMode] = useState<RecognitionMode>('off');
  const [lockChannels, setLockChannels] = useState(false);
  const [minQuality, setMinQuality] = useState(0.5);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getRecognitionPreferences()
      .then((prefs) => {
        if (cancelled) return;
        setMode(prefs.recognitionMode);
        setLockChannels(prefs.lockAudioChannels);
        setMinQuality(prefs.minimumReferenceQuality);
      })
      .catch((e) => console.warn('Failed to load recognition prefs:', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const save = async (next: Partial<{ recognitionMode: RecognitionMode; lockAudioChannels: boolean; minimumReferenceQuality: number }>) => {
    const prefs = {
      recognitionMode: next.recognitionMode ?? mode,
      lockAudioChannels: next.lockAudioChannels ?? lockChannels,
      minimumReferenceQuality: next.minimumReferenceQuality ?? minQuality,
    };
    if (next.recognitionMode !== undefined) setMode(prefs.recognitionMode);
    if (next.lockAudioChannels !== undefined) setLockChannels(prefs.lockAudioChannels);
    if (next.minimumReferenceQuality !== undefined) setMinQuality(prefs.minimumReferenceQuality);
    try {
      await setRecognitionPreferences(prefs);
      toast.success(t('saved'));
    } catch {
      toast.error(t('save_failed'));
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground py-4">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Mode selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">{t('mode_label')}</label>
        <div className="flex gap-2">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => save({ recognitionMode: m })}
              className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                mode === m
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:bg-muted'
              }`}
            >
              {t(`mode_${m}`)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t(`mode_${mode}_desc`)}
        </p>
      </div>

      {/* Lock audio channels */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{t('lock_channels')}</p>
          <p className="text-xs text-muted-foreground">{t('lock_channels_desc')}</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={lockChannels}
            onChange={(e) => save({ lockAudioChannels: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-input rounded-full peer peer-checked:bg-primary peer-focus:ring-2 peer-focus:ring-ring transition-colors after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
        </label>
      </div>

      {/* Minimum quality */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          {t('min_quality')} ({Math.round(minQuality * 100)}%)
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={minQuality}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            setMinQuality(val);
            // Debounced save: save on mouse up instead
          }}
          onMouseUp={() => save({ minimumReferenceQuality: minQuality })}
          className="w-full accent-primary"
        />
      </div>

      {/* Privacy */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Shield size={16} />
          {t('privacy_title')}
        </div>
        <p className="text-xs text-muted-foreground">{t('privacy_desc')}</p>
      </div>
    </div>
  );
}
