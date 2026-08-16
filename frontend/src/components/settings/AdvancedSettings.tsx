'use client';

import { useTranslations } from 'next-intl';
import { SettingsSection } from './SettingsSection';
import { BetaSettings } from '@/components/BetaSettings';

export function AdvancedSettings() {
  const t = useTranslations('settings');

  return (
    <SettingsSection title={t('app_settings.sections.advanced')}>
      <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
        <p className="text-sm text-yellow-700 dark:text-yellow-300">
          {t('advanced.experimental_warning')}
        </p>
      </div>
      <BetaSettings />
    </SettingsSection>
  );
}
