'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { invoke } from '@tauri-apps/api/core';
import { SettingsSection } from './SettingsSection';

interface LlmProvider {
  id: string;
  name: string;
  provider: string;
  model: string;
  endpoint?: string;
  hasApiKey: boolean;
  status: 'connected' | 'disconnected' | 'unknown';
}

export function LlmProviderSettings() {
  const t = useTranslations('settings');
  const [providers, setProviders] = useState<LlmProvider[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const list = await invoke<LlmProvider[]>('list_llm_providers');
        setProviders(list);
      } catch {
        /* backend command not yet available — show empty state */
      }
    };
    load();
  }, []);

  return (
    <SettingsSection title={t('app_settings.sections.llms')}>
      <div className="space-y-3">
        {providers.length === 0 && (
          <p className="text-sm text-[rgb(var(--app-muted-fg))]">
            {t('app_settings.llms.no_providers')}
          </p>
        )}
        {providers.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-lg border border-[rgb(var(--app-border))] p-4"
          >
            <div>
              <p className="font-medium text-[rgb(var(--app-fg))]">{p.name}</p>
              <p className="text-sm text-[rgb(var(--app-muted-fg))]">
                {p.provider} — {p.model}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  p.status === 'connected'
                    ? 'bg-green-500'
                    : p.status === 'disconnected'
                      ? 'bg-red-400'
                      : 'bg-gray-400'
                }`}
              />
              <span className="text-xs text-[rgb(var(--app-muted-fg))]">
                {t(`app_settings.llms.status_${p.status}`)}
              </span>
            </div>
          </div>
        ))}
        <button
          className="w-full rounded-lg border border-dashed border-[rgb(var(--app-border))] p-4 text-center text-sm text-[rgb(var(--app-muted-fg))] transition-colors hover:border-[rgb(var(--app-accent))] hover:text-[rgb(var(--app-accent))]"
          disabled
          title={t('app_settings.llms.add_provider_hint')}
        >
          + {t('app_settings.llms.add_provider')}
        </button>
      </div>
    </SettingsSection>
  );
}
