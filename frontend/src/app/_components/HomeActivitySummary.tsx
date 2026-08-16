'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart3, FileText, AlertCircle } from 'lucide-react';
import type { MeetingDirectoryItem } from '@/lib/meeting-directory';

interface HomeActivitySummaryProps {
  meetings: MeetingDirectoryItem[];
}

export function HomeActivitySummary({ meetings }: HomeActivitySummaryProps) {
  const t = useTranslations('home');

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisWeek = meetings.filter((m) => new Date(m.createdAt) >= weekAgo).length;
    const summariesReady = meetings.filter((m) => m.hasSummary).length;
    const needsAttention = meetings.filter((m) => m.recordingState === 'failed' || m.recordingState === 'processing').length;
    return { thisWeek, summariesReady, needsAttention };
  }, [meetings]);

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
        <BarChart3 className="h-4 w-4 text-[rgb(var(--app-muted-fg))]" />
        <div>
          <p className="text-lg font-bold text-[rgb(var(--app-fg))]">{stats.thisWeek}</p>
          <p className="text-[10px] text-[rgb(var(--app-muted-fg))]">{t('meetings_this_week')}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
        <FileText className="h-4 w-4 text-[rgb(var(--app-muted-fg))]" />
        <div>
          <p className="text-lg font-bold text-[rgb(var(--app-fg))]">{stats.summariesReady}</p>
          <p className="text-[10px] text-[rgb(var(--app-muted-fg))]">{t('summaries_ready')}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
        <AlertCircle className="h-4 w-4 text-[rgb(var(--app-muted-fg))]" />
        <div>
          <p className="text-lg font-bold text-[rgb(var(--app-fg))]">{stats.needsAttention}</p>
          <p className="text-[10px] text-[rgb(var(--app-muted-fg))]">{t('needs_attention')}</p>
        </div>
      </div>
    </div>
  );
}
