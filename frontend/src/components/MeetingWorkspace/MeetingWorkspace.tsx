"use client";

import type { AudioController, WorkspaceParticipant } from './types';
import { MeetingHeader } from './MeetingHeader';
import { MeetingTabs } from './MeetingTabs';
import { ParticipantsSidebar } from './ParticipantsSidebar';

export interface MeetingWorkspaceProps {
  meeting: { id: string; title: string; created_at: string };
  audio: AudioController;
  participants: WorkspaceParticipant[];
  /** Passed through to MeetingTabs as transcriptContent */
  transcriptContent?: React.ReactNode;
  /** Passed through to MeetingTabs as summaryContent */
  summaryContent?: React.ReactNode;
  notesContent?: React.ReactNode;
  actionsContent?: React.ReactNode;
}

export function MeetingWorkspace({
  meeting,
  audio,
  participants,
  transcriptContent,
  summaryContent,
  notesContent,
  actionsContent,
}: MeetingWorkspaceProps) {
  return (
    <main className="min-h-screen bg-[#fbfaf7] text-stone-900">
      <MeetingHeader meeting={meeting} audio={audio} />
      <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section
          aria-label="Meeting content"
          className="min-w-0 border-r border-stone-200 bg-white"
        >
          <MeetingTabs
            transcriptContent={transcriptContent}
            summaryContent={summaryContent}
            notesContent={notesContent}
            actionsContent={actionsContent}
          />
        </section>
        <ParticipantsSidebar participants={participants} />
      </div>
    </main>
  );
}
