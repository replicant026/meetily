'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { AppSurface } from '@/components/ui/app-surface';
import type { MeetingDirectoryItem } from '@/lib/meeting-directory';

interface RecoverableMeeting {
  id: string;
  title: string;
}

interface HomeAttentionListProps {
  recoverableMeetings: RecoverableMeeting[];
  processingMeetings: MeetingDirectoryItem[];
  onRecover: (id: string) => void;
}

export function HomeAttentionList({ recoverableMeetings, processingMeetings, onRecover }: HomeAttentionListProps) {
  const t = useTranslations('home');

  if (recoverableMeetings.length === 0 && processingMeetings.length === 0) return null;

  return (
    <AppSurface variant="card" className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-[rgb(var(--app-fg))]">{t('needs_attention')}</h3>
      <div className="space-y-2">
        {recoverableMeetings.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-amber-800 dark:text-amber-300">{m.title}</span>
            </div>
            <button
              onClick={() => onRecover(m.id)}
              className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline"
            >
              {t('recover')}
            </button>
          </div>
        ))}
        {processingMeetings.map((m) => (
          <div key={m.id} className="flex items-center gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 px-3 py-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <span className="text-sm text-blue-800 dark:text-blue-300">{m.title}</span>
            <span className="text-xs text-blue-600">{t('processing')}</span>
          </div>
        ))}
      </div>
    </AppSurface>
  );
}
