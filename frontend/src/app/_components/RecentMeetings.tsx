'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Clock, FileText, Mic } from 'lucide-react';
import type { MeetingDirectoryItem } from '@/lib/meeting-directory';
import { AppSurface } from '@/components/ui/app-surface';

interface RecentMeetingsProps {
  meetings: MeetingDirectoryItem[];
  maxItems?: number;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h${mins % 60 > 0 ? ` ${mins % 60}m` : ''}`;
}

function relativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

export function RecentMeetings({ meetings, maxItems = 6 }: RecentMeetingsProps) {
  const t = useTranslations('home');
  const router = useRouter();
  const items = meetings.slice(0, maxItems);

  if (items.length === 0) {
    return (
      <AppSurface variant="subtle" className="p-6 text-center">
        <Mic className="mx-auto mb-2 h-8 w-8 text-[rgb(var(--app-muted-fg))]" />
        <p className="text-sm text-[rgb(var(--app-muted-fg))]">{t('no_meetings_yet')}</p>
      </AppSurface>
    );
  }

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-[rgb(var(--app-fg))]">{t('recent_meetings')}</h3>
      {items.map((meeting) => (
        <button
          key={meeting.id}
          onClick={() => router.push(`/meeting-details?id=${meeting.id}`)}
          className="w-full border-b border-[rgb(var(--app-border))] px-2 py-4 text-left last:border-b-0 transition-colors hover:bg-[rgb(var(--app-muted))]"
        >
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-[rgb(var(--app-fg))]">{meeting.title}</p>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-[rgb(var(--app-muted-fg))]">
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {relativeDate(meeting.createdAt)}</span>
              {meeting.durationSeconds && <span>{formatDuration(meeting.durationSeconds)}</span>}
            </div>
          </div>
          {meeting.hasSummary && (
            <span title={t('has_summary')}>
              <FileText className="h-4 w-4 text-[rgb(var(--app-accent))]" />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
