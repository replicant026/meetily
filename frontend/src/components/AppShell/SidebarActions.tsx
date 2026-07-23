'use client';

import Link from 'next/link';
import { Plus, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SidebarActionsProps {
  meetingsCount: number;
}

export function SidebarActions({ meetingsCount }: SidebarActionsProps) {
  const t = useTranslations('sidebar');

  return (
    <div className="flex flex-col gap-0.5">
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            onClick={() => {
              window.location.href = '/';
              sessionStorage.setItem('autoStartRecording', 'true');
            }}
            aria-label={t('newRecording')}
            className={cn(
              'flex min-h-[40px] w-full items-center justify-center rounded-[var(--app-radius-sm)] px-2 py-2.5 text-sm transition-colors',
              'bg-[rgb(var(--app-accent))] text-[rgb(var(--app-accent-fg))]',
              'hover:opacity-90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]',
            )}
          >
            <Plus className="h-5 w-5 shrink-0" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {t('newRecording')}
        </TooltipContent>
      </Tooltip>

      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Link
            href="/import"
            aria-label={t('nav.import_audio')}
            className={cn(
              'flex min-h-[40px] w-full items-center justify-center rounded-[var(--app-radius-sm)] px-2 py-2.5 text-sm transition-colors',
              'text-[rgb(var(--app-muted-fg))]',
              'hover:bg-[rgb(var(--app-muted))]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]',
            )}
          >
            <Upload className="h-5 w-5 shrink-0" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {t('nav.import_audio')}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
