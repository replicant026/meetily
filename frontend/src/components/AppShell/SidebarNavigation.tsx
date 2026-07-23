'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ListVideo, Users, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const NAV_ITEMS = [
  { id: 'home', href: '/', icon: Home, labelKey: 'common.nav.home', exact: true },
  { id: 'meetings', href: '/', icon: ListVideo, labelKey: 'common.nav.meetings', exact: true },
  { id: 'people', href: '/people', icon: Users, labelKey: 'speakers.directory.title', exact: false },
  { id: 'settings', href: '/settings', icon: Settings, labelKey: 'common.nav.settings', exact: false },
] as const;

export function SidebarNavigation() {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        const label = t(item.labelKey);

        return (
          <Tooltip key={item.id} delayDuration={300}>
            <TooltipTrigger asChild>
              <Link
                href={item.href}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex min-h-[40px] items-center justify-center rounded-[var(--app-radius-sm)] px-2 py-2.5 text-sm transition-colors',
                  'hover:bg-[rgb(var(--app-muted))]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]',
                  isActive
                    ? 'bg-[rgb(var(--app-muted))] font-medium text-[rgb(var(--app-fg))]'
                    : 'text-[rgb(var(--app-muted-fg))]',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
