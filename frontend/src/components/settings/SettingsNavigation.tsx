'use client';

import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { SETTINGS_SECTIONS } from './settings-sections';

interface SettingsNavigationProps {
  activeId: string;
  onSelect: (id: string) => void;
  collapsed?: boolean;
}

export function SettingsNavigation({ activeId, onSelect, collapsed }: SettingsNavigationProps) {
  const t = useTranslations('settings');

  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-0.5">
      {SETTINGS_SECTIONS.map((section) => {
        const Icon = section.icon;
        const isActive = section.id === activeId;
        return (
          <button
            key={section.id}
            onClick={() => onSelect(section.id)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-[var(--app-radius-sm)] px-3 py-2 text-left text-sm transition-colors',
              'hover:bg-[rgb(var(--app-muted))]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]',
              isActive
                ? 'bg-[rgb(var(--app-muted))] font-medium text-[rgb(var(--app-fg))]'
                : 'text-[rgb(var(--app-muted-fg))]',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{t(section.labelKey)}</span>}
          </button>
        );
      })}
    </nav>
  );
}
