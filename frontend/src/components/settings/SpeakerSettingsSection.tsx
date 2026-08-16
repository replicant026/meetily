'use client';

import { useTranslations } from 'next-intl';
import { SettingsSection } from './SettingsSection';
import { SpeakerRecognitionSettings } from '@/components/speakers/SpeakerRecognitionSettings';
import { SpeakersSettings } from '@/components/SpeakersSettings';

export function SpeakerSettingsSection() {
  const t = useTranslations('settings');
  const tSpeaker = useTranslations('speakers');

  return (
    <div className="space-y-6">
      <SettingsSection title={t('app_settings.sections.speakers')}>
        <SpeakersSettings />
      </SettingsSection>
      <SettingsSection title={tSpeaker('recognition.title')}>
        <SpeakerRecognitionSettings />
      </SettingsSection>
    </div>
  );
}
