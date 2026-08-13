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
  chapters?: Array<{ segmentId: string; title: string; startTime: number }>;
  /** Passed through to MeetingTabs as transcriptContent */
  transcriptContent?: React.ReactNode;
  /** Summary-related props passed through to MeetingSummaryTab */
  summaryProps?: MeetingSummaryTabProps;
  notesContent?: React.ReactNode;
  actionsContent?: React.ReactNode;
  transcriptToolbar?: React.ReactNode;
  summaryToolbar?: React.ReactNode;
}

export function MeetingWorkspace({
  meeting,
  audio,
  participants,
  peaks = null,
  chapters,
  transcriptContent,
  summaryProps,
  notesContent,
  actionsContent,
  transcriptToolbar,
  summaryToolbar,
}: MeetingWorkspaceProps) {
  const t = useTranslations('meetingWorkspace');
  return (
    <div className="min-h-0 h-full bg-[rgb(var(--app-bg))] text-stone-900">
      <MeetingHeader meeting={meeting} audio={audio} />
      <MeetingTimeline audio={audio} peaks={peaks} chapters={chapters} />
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
            transcriptToolbar={transcriptToolbar}
            summaryToolbar={summaryToolbar}
          />
        </section>
        <ParticipantsSidebar participants={participants} />
      </div>
    </div>
  );
}
