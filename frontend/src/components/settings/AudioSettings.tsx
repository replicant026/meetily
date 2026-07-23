'use client';

import { useTranslations } from 'next-intl';
import { useConfig } from '@/contexts/ConfigContext';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { DeviceSelection } from '@/components/DeviceSelection';

export function AudioSettings() {
  const t = useTranslations('settings');
  const { selectedDevices, setSelectedDevices } = useConfig();

  return (
    <SettingsSection title={t('app_settings.sections.audio')}>
      <SettingsRow label={t('preference.storage.recordings')} description="Select your preferred microphone and system audio devices">
        <DeviceSelection
          selectedDevices={selectedDevices}
          onDeviceChange={setSelectedDevices}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
