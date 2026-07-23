'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { invoke } from '@tauri-apps/api/core';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { Switch } from '@/components/ui/switch';

interface ExportPreferences {
  namePattern: string;
  dateFormat: 'iso' | 'locale' | 'custom';
  includeYamlMetadata: boolean;
  metadataPosition: 'inline' | 'frontmatter';
  autoExport: boolean;
}

const DEFAULTS: ExportPreferences = {
  namePattern: '{meeting_name}_{date}',
  dateFormat: 'iso',
  includeYamlMetadata: false,
  metadataPosition: 'frontmatter',
  autoExport: false,
};

function previewFileName(pattern: string, dateFormat: string): string {
  const now = new Date();
  const dateStr = dateFormat === 'iso'
    ? now.toISOString().slice(0, 10)
    : now.toLocaleDateString();
  return pattern
    .replace('{meeting_name}', 'Team Standup')
    .replace('{date}', dateStr)
    .replace(/[/\\?%*:|"<>]/g, '_');
}

export function ExportSettings() {
  const t = useTranslations('settings');
  const [prefs, setPrefs] = useState<ExportPreferences>(DEFAULTS);

  useEffect(() => {
    const load = async () => {
      try {
        const stored = await invoke<ExportPreferences | null>('get_export_preferences');
        if (stored) setPrefs(stored);
      } catch { /* first run */ }
    };
    load();
  }, []);

  const update = async (patch: Partial<ExportPreferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      await invoke('set_export_preferences', { prefs: next });
    } catch {
      setPrefs(prefs);
    }
  };

  return (
    <SettingsSection title={t('app_settings.sections.export')}>
      <SettingsRow label={t('export.name_pattern')} description={t('export.name_pattern_desc')}>
        <div className="space-y-1">
          <input
            type="text"
            value={prefs.namePattern}
            onChange={(e) => update({ namePattern: e.target.value })}
            className="w-full rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-1))] px-3 py-1.5 text-sm font-mono"
            placeholder="{meeting_name}_{date}"
          />
          <p className="text-xs text-[rgb(var(--app-muted-fg))]">
            {t('export.preview')}: <span className="font-mono">{previewFileName(prefs.namePattern, prefs.dateFormat)}.md</span>
          </p>
        </div>
      </SettingsRow>
      <SettingsRow label={t('export.date_format')} description={t('export.date_format_desc')}>
        <select
          value={prefs.dateFormat}
          onChange={(e) => update({ dateFormat: e.target.value as ExportPreferences['dateFormat'] })}
          className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-1))] px-3 py-1.5 text-sm"
        >
          <option value="iso">ISO 8601 (2025-01-15)</option>
          <option value="locale">{t('export.locale_format')}</option>
          <option value="custom">{t('export.custom_format')}</option>
        </select>
      </SettingsRow>
      <SettingsRow label={t('export.yaml_metadata')} description={t('export.yaml_metadata_desc')}>
        <Switch checked={prefs.includeYamlMetadata} onCheckedChange={(v) => update({ includeYamlMetadata: v })} />
      </SettingsRow>
      {prefs.includeYamlMetadata && (
        <SettingsRow label={t('export.metadata_position')} description={t('export.metadata_position_desc')}>
          <select
            value={prefs.metadataPosition}
            onChange={(e) => update({ metadataPosition: e.target.value as ExportPreferences['metadataPosition'] })}
            className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-1))] px-3 py-1.5 text-sm"
          >
            <option value="frontmatter">{t('export.frontmatter')}</option>
            <option value="inline">{t('export.inline')}</option>
          </select>
        </SettingsRow>
      )}
      <SettingsRow label={t('export.auto_export')} description={t('export.auto_export_desc')}>
        <Switch checked={prefs.autoExport} onCheckedChange={(v) => update({ autoExport: v })} />
      </SettingsRow>
    </SettingsSection>
  );
}
