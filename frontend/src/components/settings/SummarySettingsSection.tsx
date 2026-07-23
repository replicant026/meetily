'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { invoke } from '@tauri-apps/api/core';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';

interface SummaryPreferences {
  autoGenerate: boolean;
  generateChapters: boolean;
  generateActionItems: boolean;
  defaultLanguage: string;
  defaultTab: 'summary' | 'transcript';
}

const DEFAULTS: SummaryPreferences = {
  autoGenerate: true,
  generateChapters: true,
  generateActionItems: true,
  defaultLanguage: 'auto',
  defaultTab: 'summary',
};

export function SummarySettingsSection() {
  const t = useTranslations('settings');
  const [prefs, setPrefs] = useState<SummaryPreferences>(DEFAULTS);

  useEffect(() => {
    const load = async () => {
      try {
        const stored = await invoke<SummaryPreferences | null>('get_summary_preferences');
        if (stored) setPrefs(stored);
      } catch {
        /* first run — use defaults */
      }
    };
    load();
  }, []);

  const update = useCallback(
    async (patch: Partial<SummaryPreferences>) => {
      const next = { ...prefs, ...patch };
      setPrefs(next);
      try {
        await invoke('set_summary_preferences', { prefs: next });
      } catch {
        setPrefs(prefs);
      }
    },
    [prefs],
  );

  return (
    <SettingsSection title={t('app_settings.sections.summaries')}>
      <SettingsRow
        label={t('app_settings.summaries.auto_generate')}
        description={t('app_settings.summaries.auto_generate_desc')}
      >
        <Switch
          checked={prefs.autoGenerate}
          onCheckedChange={(v) => update({ autoGenerate: v })}
        />
      </SettingsRow>
      <SettingsRow
        label={t('app_settings.summaries.include_chapters')}
        description={t('app_settings.summaries.include_chapters_desc')}
      >
        <Switch
          checked={prefs.generateChapters}
          onCheckedChange={(v) => update({ generateChapters: v })}
        />
      </SettingsRow>
      <SettingsRow
        label={t('app_settings.summaries.include_action_items')}
        description={t('app_settings.summaries.include_action_items_desc')}
      >
        <Switch
          checked={prefs.generateActionItems}
          onCheckedChange={(v) => update({ generateActionItems: v })}
        />
      </SettingsRow>
      <SettingsRow
        label={t('app_settings.summaries.default_language')}
        description={t('app_settings.summaries.default_language_desc')}
      >
        <select
          value={prefs.defaultLanguage}
          onChange={(e) => update({ defaultLanguage: e.target.value })}
          className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-1))] px-3 py-1.5 text-sm"
        >
          <option value="auto">{t('app_settings.summaries.language_auto')}</option>
          <option value="en">English</option>
          <option value="pt">Português</option>
          <option value="zh">中文</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
        </select>
      </SettingsRow>
      <SettingsRow
        label={t('app_settings.summaries.default_tab')}
        description={t('app_settings.summaries.default_tab_desc')}
      >
        <select
          value={prefs.defaultTab}
          onChange={(e) => update({ defaultTab: e.target.value as 'summary' | 'transcript' })}
          className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-1))] px-3 py-1.5 text-sm"
        >
          <option value="summary">{t('app_settings.summaries.default_tab_summary')}</option>
          <option value="transcript">{t('app_settings.summaries.default_tab_transcript')}</option>
        </select>
      </SettingsRow>
    </SettingsSection>
  );
}

function Switch({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-[rgb(var(--app-accent))]' : 'bg-[rgb(var(--app-border))]'
      } cursor-pointer`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
