'use client';

import { useTranslations } from 'next-intl';
import { SettingsSection } from './SettingsSection';
import { SpeakersSettings } from '@/components/SpeakersSettings';

export function SpeakerSettingsSection() {
  const t = useTranslations('settings');

  return (
    <SettingsSection title={t('app_settings.sections.speakers')}>
      <SpeakersSettings />
    </SettingsSection>
  );
}
