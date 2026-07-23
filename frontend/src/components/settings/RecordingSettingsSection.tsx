'use client';

import { useTranslations } from 'next-intl';
import { useConfig } from '@/contexts/ConfigContext';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RecordingSettings } from '@/components/RecordingSettings';

export function RecordingSettingsSection() {
  const t = useTranslations('settings');
  const { appSettings, updateAppSettings } = useConfig();
  const { recording } = appSettings;

  return (
    <SettingsSection title={t('app_settings.sections.recordings')}>
      {/* Existing recording settings (save toggle, location, format) */}
      <RecordingSettings />

      {/* Retention policy */}
      <SettingsRow
        label={t('app_settings.recordings.retention_label')}
        description={t('app_settings.recordings.retention_desc')}
        disabled={!recording.saveAudio}
        disabledReason={t('recording.recording_disabled_note')}
      >
        <Select
          value={recording.retention}
          onValueChange={(v) =>
            updateAppSettings({
              recording: { ...recording, retention: v as 'never' | '7d' | '30d' | '90d' },
            })
          }
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="never">{t('app_settings.recordings.retention_never')}</SelectItem>
            <SelectItem value="7d">{t('app_settings.recordings.retention_7d')}</SelectItem>
            <SelectItem value="30d">{t('app_settings.recordings.retention_30d')}</SelectItem>
            <SelectItem value="90d">{t('app_settings.recordings.retention_90d')}</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>

      {/* Name pattern */}
      <SettingsRow
        label={t('app_settings.recordings.name_pattern_label')}
        description={t('app_settings.recordings.name_pattern_desc')}
      >
        <input
          type="text"
          value={recording.namePattern}
          onChange={(e) =>
            updateAppSettings({ recording: { ...recording, namePattern: e.target.value } })
          }
          className="w-56 rounded-[var(--app-radius-sm)] border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-sm text-[rgb(var(--app-fg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]"
        />
      </SettingsRow>
    </SettingsSection>
  );
}
