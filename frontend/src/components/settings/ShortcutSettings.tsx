'use client';

import { useTranslations } from 'next-intl';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';

interface ShortcutConfig {
  toggleRecording: string;
  captureScreen: string;
}

const DEFAULT_SHORTCUTS: ShortcutConfig = {
  toggleRecording: 'Ctrl+Shift+R',
  captureScreen: 'Ctrl+Shift+S',
};

export function ShortcutSettings() {
  const t = useTranslations('settings');

  // TODO: Register global shortcuts via tauri-plugin-global-shortcut
  // Display-only for now
  const shortcuts = DEFAULT_SHORTCUTS;

  return (
    <SettingsSection title={t('app_settings.sections.shortcuts')}>
      <SettingsRow
        label={t('app_settings.shortcuts.toggle_recording')}
      >
        <kbd className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-1))] px-2 py-1 text-xs font-mono">
          {shortcuts.toggleRecording}
        </kbd>
      </SettingsRow>
      <SettingsRow
        label={t('app_settings.shortcuts.capture_screen')}
      >
        <kbd className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-1))] px-2 py-1 text-xs font-mono">
          {shortcuts.captureScreen}
        </kbd>
      </SettingsRow>
    </SettingsSection>
  );
}
