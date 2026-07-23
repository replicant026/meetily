"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Users, Mic, Monitor } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import type { WorkspaceParticipant } from './types';

interface ParticipantsSidebarProps {
  participants: WorkspaceParticipant[];
  className?: string;
}

export function ParticipantsSidebar({ participants, className }: ParticipantsSidebarProps) {
  const t = useTranslations('meetingWorkspace');
  const [open, setOpen] = useState(false);

  const micParticipants = participants.filter(p => p.source === 'microphone');
  const sysParticipants = participants.filter(p => p.source === 'system');

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

  return (
    <>
      {/* Desktop: fixed aside in grid */}
      <aside aria-label={t('participants')} className={`hidden lg:block ${className ?? ''}`}>
        {participantList}
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
