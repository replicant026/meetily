'use client';

import { useTranslations } from 'next-intl';
import { useConfig } from '@/contexts/ConfigContext';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UiLanguagePicker } from '@/components/UiLanguagePicker';
import AnalyticsConsentSwitch from '@/components/AnalyticsConsentSwitch';
import { FolderOpen } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export function GeneralSettings() {
  const t = useTranslations('settings');
  const { appSettings, updateAppSettings, storageLocations } = useConfig();
  const { interface: iface } = appSettings;

  return (
    <SettingsSection title={t('app_settings.sections.general')}>
      {/* Theme */}
      <SettingsRow label={t('app_settings.general.theme_label')}>
        <Select
          value={iface.theme}
          onValueChange={(v) =>
            updateAppSettings({ interface: { ...iface, theme: v as 'system' | 'light' | 'dark' } })
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">{t('app_settings.general.theme_system')}</SelectItem>
            <SelectItem value="light">{t('app_settings.general.theme_light')}</SelectItem>
            <SelectItem value="dark">{t('app_settings.general.theme_dark')}</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>

      {/* UI Scale */}
      <SettingsRow label={t('app_settings.general.scale_label')}>
        <Select
          value={iface.uiScale}
          onValueChange={(v) =>
            updateAppSettings({ interface: { ...iface, uiScale: v as '80' | '90' | '100' | '110' | '120' } })
          }
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['80', '90', '100', '110', '120'].map((s) => (
              <SelectItem key={s} value={s}>{s}%</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>

      {/* Sidebar */}
      <SettingsRow label={t('app_settings.general.sidebar_label')}>
        <Select
          value={iface.sidebarPreference}
          onValueChange={(v) =>
            updateAppSettings({
              interface: { ...iface, sidebarPreference: v as 'fixed' | 'auto_hide' },
            })
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">{t('app_settings.general.sidebar_fixed')}</SelectItem>
            <SelectItem value="auto_hide">{t('app_settings.general.sidebar_auto_hide')}</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>

      {/* Start with system */}
      <SettingsRow
        label={t('app_settings.general.start_with_system')}
        description={t('app_settings.general.start_with_system_desc')}
      >
        <Switch
          checked={iface.startWithSystem}
          onCheckedChange={(checked) =>
            updateAppSettings({ interface: { ...iface, startWithSystem: checked } })
          }
        />
      </SettingsRow>

      {/* Start hidden */}
      <SettingsRow
        label={t('app_settings.general.start_hidden')}
        description={t('app_settings.general.start_hidden_desc')}
        disabled={!iface.startWithSystem}
        disabledReason="Requires 'Start with system' to be enabled"
      >
        <Switch
          checked={iface.startHidden}
          onCheckedChange={(checked) =>
            updateAppSettings({ interface: { ...iface, startHidden: checked } })
          }
        />
      </SettingsRow>

      {/* Language */}
      <SettingsRow label={t('app_settings.general.language_label')}>
        <UiLanguagePicker />
      </SettingsRow>

      {/* Analytics */}
      <SettingsRow label={t('app_settings.general.analytics_consent')}>
        <AnalyticsConsentSwitch />
      </SettingsRow>

      {/* Storage locations */}
      {storageLocations && (
        <SettingsRow label={t('preference.storage.title')} description={t('preference.storage.description')}>
          <div className="flex flex-col gap-1 text-xs text-[rgb(var(--app-muted-fg))]">
            <div className="flex items-center gap-2">
              <span>{t('preference.storage.database')}: {storageLocations.database}</span>
              <button
                onClick={() => invoke('open_path', { pathStr: storageLocations.database })}
                className="text-[rgb(var(--app-accent))] hover:underline"
                aria-label={t('preference.storage.open_folder')}
              >
                <FolderOpen className="h-3 w-3" />
              </button>
            </div>
          </div>
        </SettingsRow>
      )}
    </SettingsSection>
  );
}
