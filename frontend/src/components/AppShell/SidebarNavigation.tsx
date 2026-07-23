'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ListVideo, Users, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

const NAV_ITEMS = [
  { id: 'home', href: '/', icon: Home, labelKey: 'nav.home' },
  { id: 'meetings', href: '/#meetings', icon: ListVideo, labelKey: 'nav.meetings' },
  { id: 'people', href: '/settings#speakers', icon: Users, labelKey: 'app_settings.sections.speakers' },
  { id: 'settings', href: '/settings', icon: Settings, labelKey: 'nav.settings' },
] as const;

export function SidebarNavigation() {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.id === 'home'
            ? pathname === '/'
            : item.id === 'settings'
              ? pathname === '/settings'
              : pathname.startsWith(item.href.split('?')[0].split('#')[0]);

        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-[var(--app-radius-sm)] px-3 py-2 text-sm transition-colors',
              'hover:bg-[rgb(var(--app-muted))]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]',
              isActive
                ? 'bg-[rgb(var(--app-muted))] font-medium text-[rgb(var(--app-fg))]'
                : 'text-[rgb(var(--app-muted-fg))]',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
