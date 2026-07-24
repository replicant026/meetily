"use client";

import { useTranslations } from 'next-intl';
import type { AudioController, WorkspaceParticipant } from './types';
import type { MeetingSummaryTabProps } from './MeetingSummaryTab';
import { MeetingHeader } from './MeetingHeader';
import { MeetingTimeline } from './MeetingTimeline';
import { MeetingTabs } from './MeetingTabs';
import { ParticipantsSidebar } from './ParticipantsSidebar';
import { MeetingSummaryTab } from './MeetingSummaryTab';

export interface MeetingWorkspaceProps {
  meeting: { id: string; title: string; created_at: string };
  audio: AudioController;
  participants: WorkspaceParticipant[];
  peaks?: Float32Array | null;
  /** Passed through to MeetingTabs as transcriptContent */
  transcriptContent?: React.ReactNode;
  /** Summary-related props passed through to MeetingSummaryTab */
  summaryProps?: MeetingSummaryTabProps;
  notesContent?: React.ReactNode;
  actionsContent?: React.ReactNode;
}

export function MeetingWorkspace({
  meeting,
  audio,
  participants,
  peaks = null,
  transcriptContent,
  summaryProps,
  notesContent,
  actionsContent,
}: MeetingWorkspaceProps) {
  const t = useTranslations('meetingWorkspace');
  return (
    <div className="min-h-0 h-full bg-[rgb(var(--app-bg))] text-stone-900">
      <MeetingHeader meeting={meeting} audio={audio} />
      <MeetingTimeline audio={audio} peaks={peaks} />
      <div data-testid="meeting-workspace-grid" className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section
          aria-label={t('meetingContent')}
          className="min-w-0 border-r border-[rgb(var(--app-border))] bg-[rgb(var(--app-bg))]"
        >
          <MeetingTabs
            transcriptContent={transcriptContent}
            summaryContent={summaryProps ? <MeetingSummaryTab {...summaryProps} /> : undefined}
            notesContent={notesContent}
            actionsContent={actionsContent}
          />
        </section>
        <ParticipantsSidebar participants={participants} />
      </div>
    </div>
  );
}
