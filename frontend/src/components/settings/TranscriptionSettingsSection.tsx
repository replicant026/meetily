'use client';

import { useTranslations } from 'next-intl';
import { useConfig } from '@/contexts/ConfigContext';
import { SettingsSection } from './SettingsSection';
import { TranscriptSettings } from '@/components/TranscriptSettings';

export function TranscriptionSettingsSection() {
  const t = useTranslations('settings');
  const { transcriptModelConfig, setTranscriptModelConfig } = useConfig();

  return (
    <SettingsSection title={t('app_settings.sections.transcription')}>
      <TranscriptSettings
        transcriptModelConfig={transcriptModelConfig}
        setTranscriptModelConfig={setTranscriptModelConfig}
      />
    </SettingsSection>
  );
}
