'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { invoke } from '@tauri-apps/api/core';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { Switch } from '@/components/ui/switch';

interface NotificationPreferences {
  enabled: boolean;
  recordingStarted: boolean;
  recordingStopped: boolean;
  updateAvailable: boolean;
  suppressDuringRecording: boolean;
}

const DEFAULTS: NotificationPreferences = {
  enabled: true,
  recordingStarted: true,
  recordingStopped: true,
  updateAvailable: true,
  suppressDuringRecording: true,
};

export function NotificationSettings() {
  const t = useTranslations('settings');
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULTS);

  useEffect(() => {
    const load = async () => {
      try {
        const stored = await invoke<NotificationPreferences | null>('get_notification_preferences');
        if (stored) setPrefs(stored);
      } catch { /* first run */ }
    };
    load();
  }, []);

  const update = async (patch: Partial<NotificationPreferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      await invoke('set_notification_preferences', { prefs: next });
    } catch {
      setPrefs(prefs); // rollback
    }
  };

  return (
    <SettingsSection title={t('app_settings.sections.notifications')}>
      <SettingsRow
        label={t('app_settings.notifications.enabled_label')}
      >
        <Switch
          checked={prefs.enabled}
          onCheckedChange={(v) => update({ enabled: v })}
        />
      </SettingsRow>
      <SettingsRow
        label={t('app_settings.notifications.recording_started')}
        disabled={!prefs.enabled}
      >
        <Switch
          checked={prefs.recordingStarted}
          disabled={!prefs.enabled}
          onCheckedChange={(v) => update({ recordingStarted: v })}
        />
      </SettingsRow>
      <SettingsRow
        label={t('app_settings.notifications.recording_stopped')}
        disabled={!prefs.enabled}
      >
        <Switch
          checked={prefs.recordingStopped}
          disabled={!prefs.enabled}
          onCheckedChange={(v) => update({ recordingStopped: v })}
        />
      </SettingsRow>
      <SettingsRow
        label={t('app_settings.notifications.update_available')}
        disabled={!prefs.enabled}
      >
        <Switch
          checked={prefs.updateAvailable}
          disabled={!prefs.enabled}
          onCheckedChange={(v) => update({ updateAvailable: v })}
        />
      </SettingsRow>
      <SettingsRow
        label={t('app_settings.notifications.suppress_during_recording')}
        disabled={!prefs.enabled}
      >
        <Switch
          checked={prefs.suppressDuringRecording}
          disabled={!prefs.enabled}
          onCheckedChange={(v) => update({ suppressDuringRecording: v })}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
