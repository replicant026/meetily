'use client';

import { useTranslations } from 'next-intl';
import { Mic, Settings, Play } from 'lucide-react';
import { AppSurface } from '@/components/ui/app-surface';

interface HomeQuickStartProps {
  hasMicPermission: boolean;
  hasSystemAudio: boolean;
  micDeviceName?: string;
  systemDeviceName?: string;
  onStartRecording: () => void;
  onConfigureAudio: () => void;
}

export function HomeQuickStart({
  hasMicPermission,
  hasSystemAudio,
  micDeviceName,
  systemDeviceName,
  onStartRecording,
  onConfigureAudio,
}: HomeQuickStartProps) {
  const t = useTranslations('home');

  return (
    <AppSurface variant="card" className="p-5">
      <h2 className="mb-3 text-base font-semibold text-[rgb(var(--app-fg))]">
        {t('quick_start_title')}
      </h2>
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Mic className="h-4 w-4 text-[rgb(var(--app-muted-fg))]" />
          <span className={hasMicPermission ? 'text-green-600' : 'text-red-500'}>
            {micDeviceName || t('no_microphone')}
          </span>
        </div>
        {systemDeviceName && (
          <div className="flex items-center gap-2 text-sm">
            <span className="h-4 w-4 rounded-full bg-[rgb(var(--app-border))]" />
            <span className={hasSystemAudio ? 'text-green-600' : 'text-[rgb(var(--app-muted-fg))]'}>{systemDeviceName}</span>
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={onStartRecording}
          className="flex items-center gap-2 rounded-lg bg-[rgb(var(--app-accent))] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          <Play className="h-4 w-4" />
          {t('start_recording')}
        </button>
        <button
          onClick={onConfigureAudio}
          className="flex items-center gap-2 rounded-lg border border-[rgb(var(--app-border))] px-4 py-2 text-sm text-[rgb(var(--app-fg))] hover:bg-[rgb(var(--app-muted))] transition-colors"
        >
          <Settings className="h-4 w-4" />
          {t('configure_audio')}
        </button>
      </div>
    </AppSurface>
  );
}
