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
  /** Transcript segments for speaker panel (meeting details only) */
  transcriptSegments?: Array<{ speaker?: string | null; timestamp: number; endTime?: number }>;
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
  transcriptSegments,
}: MeetingWorkspaceProps) {
  const t = useTranslations('meetingWorkspace');
  return (
    <main className="min-h-screen bg-[#fbfaf7] text-stone-900">
      <MeetingHeader meeting={meeting} audio={audio} />
      <MeetingTimeline audio={audio} peaks={peaks} />
      <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section
          aria-label={t('meetingContent')}
          className="min-w-0 border-r border-stone-200 bg-white"
        >
          <MeetingTabs
            transcriptContent={transcriptContent}
            summaryContent={summaryProps ? <MeetingSummaryTab {...summaryProps} /> : undefined}
            notesContent={notesContent}
            actionsContent={actionsContent}
          />
        </section>
        <ParticipantsSidebar
          participants={participants}
          meetingId={meeting.id}
          transcriptSegments={transcriptSegments}
        />
      </div>
    </main>
  );
}
