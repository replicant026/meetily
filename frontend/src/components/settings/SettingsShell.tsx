'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SettingsNavigation } from './SettingsNavigation';
import { SETTINGS_SECTIONS } from './settings-sections';

interface SettingsShellProps {
  children: (activeSection: string) => ReactNode;
}

export function SettingsShell({ children }: SettingsShellProps) {
  const router = useRouter();
  const t = useTranslations('settings');
  const [activeSection, setActiveSection] = useState('general');

  // Sync hash from URL on mount
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && SETTINGS_SECTIONS.some((s) => s.id === hash)) {
      setActiveSection(hash);
    }
  }, []);

  // Update hash when section changes
  const handleSelect = useCallback((id: string) => {
    setActiveSection(id);
    window.history.replaceState(null, '', `#${id}`);
    // Focus the content area for accessibility
    document.getElementById(`settings-section-${id}`)?.focus();
  }, []);

  return (
    <div className="flex h-screen flex-col bg-[rgb(var(--app-bg))]">
      {/* Header */}
      <div className="sticky top-0 z-[var(--z-sticky)] border-b border-[rgb(var(--app-border))] bg-[rgb(var(--app-bg))]">
        <div className="flex items-center gap-3 px-6 py-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-[rgb(var(--app-muted-fg))] hover:text-[rgb(var(--app-fg))] transition-colors"
            aria-label={t('shell.back')}
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{t('shell.back')}</span>
          </button>
          <h1 className="text-xl font-bold text-[rgb(var(--app-fg))]">{t('title')}</h1>
        </div>
      </div>

      {/* Body: nav + content */}
      <div className="flex flex-1 min-h-0 overflow-x-hidden">
        {/* Navigation sidebar */}
        <aside className="w-56 shrink-0 border-r border-[rgb(var(--app-border))] overflow-y-auto p-3">
          <SettingsNavigation activeId={activeSection} onSelect={handleSelect} />
        </aside>

        {/* Content panel */}
        <main role="main" className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto p-6">
          <div
            id={`settings-section-${activeSection}`}
            tabIndex={-1}
            className="outline-none min-w-0 max-w-3xl mx-auto"
          >
            {children(activeSection)}
          </div>
        </main>
      </div>
    </div>
  );
}
