"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Users, Mic, Monitor, UserCircle } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { MeetingPeoplePanel } from '@/components/speakers/MeetingPeoplePanel';
import type { WorkspaceParticipant } from './types';

interface ParticipantsSidebarProps {
  participants: WorkspaceParticipant[];
  meetingId?: string;
  transcriptSegments?: Array<{ speaker?: string | null; timestamp: number; endTime?: number }>;
  className?: string;
}

export function ParticipantsSidebar({ participants, meetingId, transcriptSegments, className }: ParticipantsSidebarProps) {
  const t = useTranslations('meetingWorkspace');
  const [open, setOpen] = useState(false);

  const micParticipants = participants.filter(p => p.source === 'microphone');
  const sysParticipants = participants.filter(p => p.source === 'system');

  const hasPeoplePanel = !!meetingId && transcriptSegments != null && transcriptSegments.length > 0;

  const participantList = (
    <>
      <div>
        <h3 className="text-xs uppercase text-stone-500 font-medium tracking-wider">
          <Mic className="inline w-3 h-3 mr-1" />
          {t('microphone')}
        </h3>
        {micParticipants.map(p => (
          <ParticipantRow key={p.id} participant={p} />
        ))}
      </div>
      <div>
        <h3 className="text-xs uppercase text-stone-500 font-medium tracking-wider">
          <Monitor className="inline w-3 h-3 mr-1" />
          {t('systemAudio')}
        </h3>
        {sysParticipants.map(p => (
          <ParticipantRow key={p.id} participant={p} />
        ))}
      </div>
    </>
  );

  const peopleSection = hasPeoplePanel ? (
    <div className="border-t border-stone-200 mt-4 pt-4">
      <h3 className="text-xs uppercase text-stone-500 font-medium tracking-wider mb-2 px-4">
        <UserCircle className="inline w-3 h-3 mr-1" />
        {t('speakers')}
      </h3>
      <MeetingPeoplePanel
        meetingId={meetingId}
        segments={transcriptSegments}
      />
    </div>
  ) : null;

  return (
    <>
      {/* Desktop: fixed aside in grid */}
      <aside aria-label={t('participants')} className={`hidden lg:flex lg:flex-col ${className ?? ''}`}>
        <div className="flex flex-col gap-4">
          {participantList}
        </div>
        {peopleSection}
      </aside>

      {/* Mobile: floating sheet trigger */}
      <div className="lg:hidden fixed bottom-4 right-4 z-50">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 bg-white border border-stone-200 rounded-full shadow-lg hover:bg-stone-50 transition-colors"
              aria-label={t('participants')}
            >
              <Users size={16} />
              <span className="text-sm">{participants.length}</span>
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <VisuallyHidden>
              <SheetTitle>{t('participants')}</SheetTitle>
            </VisuallyHidden>
            <div className="flex flex-col gap-4 mt-6">
              {participantList}
              {peopleSection}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

function ParticipantRow({ participant }: { participant: WorkspaceParticipant }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: participant.color }} />
      <span className="text-sm text-stone-700">{participant.name}</span>
      <span className="text-xs text-stone-400 ml-auto">
        {participant.spokenSeconds}s · {Math.round(participant.share * 100)}%
      </span>
    </div>
  );
}
