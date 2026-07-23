'use client';

import { useTranslations } from 'next-intl';
import { useMeetingDirectory } from '@/hooks/useMeetingDirectory';
import { groupMeetingsByDate } from '@/lib/meeting-directory';
import { AppSurface } from '@/components/ui/app-surface';
import { AppStatus } from '@/components/ui/app-status';
import { Mic, FileText, Clock } from 'lucide-react';
import Link from 'next/link';

export function HomeDashboard() {
  const t = useTranslations();
  const { meetings, isLoading, error } = useMeetingDirectory();
  const groups = groupMeetingsByDate(meetings);

  const totalMeetings = meetings.length;
  const withSummaries = meetings.filter((m) => m.hasSummary).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <AppStatus
          model={{ kind: 'loading', tone: 'neutral', title: 'Loading meetings...' }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <AppStatus
          model={{
            kind: 'error',
            tone: 'danger',
            title: 'Failed to load meetings',
            description: error,
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--app-fg))]">
          {t('nav.home')}
        </h1>
        <p className="mt-1 text-sm text-[rgb(var(--app-muted-fg))]">
          Your meetings, transcribed locally
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        <AppSurface variant="card" className="p-4">
          <div className="flex items-center gap-2 text-[rgb(var(--app-muted-fg))]">
            <FileText className="h-4 w-4" />
            <span className="text-xs">Meetings</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-[rgb(var(--app-fg))]">
            {totalMeetings}
          </p>
        </AppSurface>
        <AppSurface variant="card" className="p-4">
          <div className="flex items-center gap-2 text-[rgb(var(--app-muted-fg))]">
            <FileText className="h-4 w-4" />
            <span className="text-xs">Summaries</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-[rgb(var(--app-fg))]">
            {withSummaries}
          </p>
        </AppSurface>
        <AppSurface variant="card" className="p-4">
          <div className="flex items-center gap-2 text-[rgb(var(--app-muted-fg))]">
            <Clock className="h-4 w-4" />
            <span className="text-xs">This week</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-[rgb(var(--app-fg))]">
            {groups.today.length + groups.last7Days.length}
          </p>
        </AppSurface>
      </div>

      {/* Recent meetings */}
      {totalMeetings === 0 ? (
        <AppSurface variant="subtle" className="p-8 text-center">
          <Mic className="mx-auto h-8 w-8 text-[rgb(var(--app-muted-fg))]" />
          <p className="mt-2 text-sm text-[rgb(var(--app-muted-fg))]">
            No meetings yet. Start a recording to get started.
          </p>
        </AppSurface>
      ) : (
        <div className="space-y-4">
          {groups.today.length > 0 && (
            <MeetingGroup title="Today" meetings={groups.today} />
          )}
          {groups.last7Days.length > 0 && (
            <MeetingGroup title="Previous 7 days" meetings={groups.last7Days} />
          )}
          {groups.older.length > 0 && (
            <MeetingGroup title="Older" meetings={groups.older} />
          )}
        </div>
      )}
    </div>
  );
}

function MeetingGroup({
  title,
  meetings,
}: {
  title: string;
  meetings: { id: string; title: string; hasSummary: boolean; durationSeconds: number | null }[];
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[rgb(var(--app-muted-fg))]">
        {title}
      </h2>
      <div className="space-y-1">
        {meetings.map((m) => (
          <Link
            key={m.id}
            href={`/meeting-details?id=${m.id}`}
            className="flex items-center justify-between rounded-[var(--app-radius-sm)] px-3 py-2 hover:bg-[rgb(var(--app-muted))] transition-colors"
          >
            <span className="text-sm font-medium text-[rgb(var(--app-fg))] truncate">
              {m.title}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {m.hasSummary && (
                <span className="text-xs text-[rgb(var(--app-success))]">✓ Summary</span>
              )}
              {m.durationSeconds != null && m.durationSeconds > 0 && (
                <span className="text-xs text-[rgb(var(--app-muted-fg))]">
                  {Math.round(m.durationSeconds / 60)}m
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
