'use client';

import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useConfig } from '@/contexts/ConfigContext';
import { SettingsShell } from '@/components/settings/SettingsShell';
import { GeneralSettings } from '@/components/settings/GeneralSettings';
import { AudioSettings } from '@/components/settings/AudioSettings';
import { RecordingSettingsSection } from '@/components/settings/RecordingSettingsSection';
import { TranscriptSettings } from '@/components/TranscriptSettings';
import { SpeakersSettings } from '@/components/SpeakersSettings';
import { SummaryModelSettings } from '@/components/SummaryModelSettings';
import { BetaSettings } from '@/components/BetaSettings';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useTranslations } from 'next-intl';

// Placeholder sections for not-yet-migrated panels
function PlaceholderSection({ sectionId }: { sectionId: string }) {
  const t = useTranslations('settings');
  return (
    <SettingsSection title={t(`app_settings.sections.${sectionId}`)}>
      <p className="text-sm text-[rgb(var(--app-muted-fg))]">Coming soon</p>
    </SettingsSection>
  );
}

export default function SettingsPage() {
  const { transcriptModelConfig, setTranscriptModelConfig } = useConfig();

  // Load saved transcript configuration on mount
  useEffect(() => {
    const loadTranscriptConfig = async () => {
      try {
        const config = await invoke('api_get_transcript_config') as Record<string, unknown>;
        if (config) {
          setTranscriptModelConfig({
            provider: (config.provider as 'parakeet' | 'localWhisper' | 'deepgram' | 'elevenLabs' | 'groq' | 'openai') || 'localWhisper',
            model: (config.model as string) || 'large-v3',
            apiKey: (config.apiKey as string) || null,
          });
        }
      } catch (error) {
        console.error('Failed to load transcript config:', error);
      }
    };
    loadTranscriptConfig();
  }, [setTranscriptModelConfig]);

  return (
    <SettingsShell>
      {(activeSection) => {
        switch (activeSection) {
          case 'general':
            return <GeneralSettings />;
          case 'audio':
            return <AudioSettings />;
          case 'recordings':
            return <RecordingSettingsSection />;
          case 'transcription':
            return (
              <TranscriptSettings
                transcriptModelConfig={transcriptModelConfig}
                setTranscriptModelConfig={setTranscriptModelConfig}
              />
            );
          case 'speakers':
            return <SpeakersSettings />;
          case 'summaries':
            return <SummaryModelSettings />;
          case 'advanced':
            return <BetaSettings />;
          default:
            return <PlaceholderSection sectionId={activeSection} />;
        }
      }}
    </SettingsShell>
  );
}
