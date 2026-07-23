'use client';

import { useTranslations } from 'next-intl';
import { useMeetingDirectory } from '@/hooks/useMeetingDirectory';
import { AppStatus } from '@/components/ui/app-status';
import { HomeQuickStart } from './HomeQuickStart';
import { RecentMeetings } from './RecentMeetings';
import { HomeAttentionList } from './HomeAttentionList';
import { HomeActivitySummary } from './HomeActivitySummary';
import type { MeetingDirectoryItem } from '@/lib/meeting-directory';

interface HomeDashboardProps {
  hasMicPermission?: boolean;
  hasSystemAudio?: boolean;
  micDeviceName?: string;
  systemDeviceName?: string;
  onStartRecording?: () => void;
  onConfigureAudio?: () => void;
  recoverableMeetings?: { id: string; title: string }[];
  processingMeetings?: MeetingDirectoryItem[];
  onRecover?: (id: string) => void;
}

export function HomeDashboard({
  hasMicPermission = false,
  hasSystemAudio = false,
  micDeviceName,
  systemDeviceName,
  onStartRecording,
  onConfigureAudio,
  recoverableMeetings = [],
  processingMeetings = [],
  onRecover,
}: HomeDashboardProps) {
  const t = useTranslations('common');
  const { meetings, isLoading, error } = useMeetingDirectory();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <AppStatus
          model={{ kind: 'loading', tone: 'neutral', title: t('status.loading') }}
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
            title: t('status.failed'),
            description: error,
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--app-fg))]">
          {t('nav.home')}
        </h1>
        <p className="mt-1 text-sm text-[rgb(var(--app-muted-fg))]">
          Your meetings, transcribed locally
        </p>
      </div>

      {/* Quick start */}
      {onStartRecording && onConfigureAudio && (
        <HomeQuickStart
          hasMicPermission={hasMicPermission}
          hasSystemAudio={hasSystemAudio}
          micDeviceName={micDeviceName}
          systemDeviceName={systemDeviceName}
          onStartRecording={onStartRecording}
          onConfigureAudio={onConfigureAudio}
        />
      )}

      {/* Activity summary */}
      <HomeActivitySummary meetings={meetings} />

      {/* Attention list */}
      {onRecover && (
        <HomeAttentionList
          recoverableMeetings={recoverableMeetings}
          processingMeetings={processingMeetings}
          onRecover={onRecover}
        />
      )}

      {/* Recent meetings */}
      <RecentMeetings meetings={meetings} maxItems={6} />
    </div>
  );
}
