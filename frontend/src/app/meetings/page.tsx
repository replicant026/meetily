'use client';

import { useTranslations } from 'next-intl';
import { useMeetingDirectory } from '@/hooks/useMeetingDirectory';
import { RecentMeetings } from '@/app/_components/RecentMeetings';
import { AppStatus } from '@/components/ui/app-status';

export default function MeetingsPage() {
  const t = useTranslations('common');
  const tHome = useTranslations('home');
  const { meetings, isLoading, error } = useMeetingDirectory();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <AppStatus model={{ kind: 'loading', tone: 'neutral', title: t('status.loading') }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <AppStatus model={{ kind: 'error', tone: 'danger', title: t('status.failed'), description: error }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <h1 className="app-display-heading text-2xl text-[rgb(var(--app-fg))]">
        {tHome('recent_meetings')}
      </h1>
      <RecentMeetings meetings={meetings} maxItems={100} />
    </div>
  );
}
