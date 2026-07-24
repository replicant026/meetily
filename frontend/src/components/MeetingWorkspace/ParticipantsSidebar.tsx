"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Users, Mic, Monitor, Tag } from 'lucide-react';
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
  const unknownParticipants = participants.filter(p => p.source === 'unknown');
  const onlyUnknownSources = unknownParticipants.length > 0 && micParticipants.length === 0 && sysParticipants.length === 0;

  const peopleContent = (
    <>
      <h2 className="text-base font-semibold text-stone-800 px-1 app-display-heading">{t('people')}</h2>
      {onlyUnknownSources ? (
        <SourceCard
          icon={<Users className="w-3.5 h-3.5" />}
          label={t('participants')}
          participants={unknownParticipants}
          emptyLabel={t('unassigned')}
        />
      ) : (
        <>
          <SourceCard
            icon={<Mic className="w-3.5 h-3.5" />}
            label={t('microphone')}
            participants={micParticipants}
            emptyLabel={t('unassigned')}
          />
          <SourceCard
            icon={<Monitor className="w-3.5 h-3.5" />}
            label={t('systemAudio')}
            participants={sysParticipants}
            emptyLabel={t('unassigned')}
          />
        </>
      )}

      {/* Tags section */}
      <div className="app-surface px-3 py-2">
        <h3 className="text-[11px] uppercase tracking-wide text-stone-400 font-medium flex items-center gap-1.5 mb-1">
          <Tag className="w-3 h-3" />
          {t('tags')}
          <button
            type="button"
            className="ml-auto text-stone-400 hover:text-stone-600 transition-colors"
            aria-label={t('addTag', { default: 'Add tag' })}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </h3>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: contextual complementary aside */}
      <aside aria-label={t('people')} className={`hidden lg:flex lg:flex-col gap-3 p-3 overflow-y-auto ${className ?? ''}`}>
        {peopleContent}
      </aside>

      {/* Mobile: floating sheet trigger */}
      <div className="lg:hidden fixed bottom-4 right-4 z-50">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 bg-white border border-stone-200 rounded-full shadow-lg hover:bg-stone-50 transition-colors"
              aria-label={t('people')}
            >
              <Users size={16} />
              <span className="text-sm">{participants.length}</span>
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <VisuallyHidden>
              <SheetTitle>{t('people')}</SheetTitle>
            </VisuallyHidden>
            <div className="flex flex-col gap-3 mt-6">
              {peopleContent}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

function SourceCard({
  icon,
  label,
  participants,
  emptyLabel,
}: {
  icon: React.ReactNode;
  label: string;
  participants: WorkspaceParticipant[];
  emptyLabel: string;
}) {
  return (
    <div className="app-surface px-3 py-2">
      <h3 className="text-[11px] uppercase tracking-wide text-stone-400 font-medium flex items-center gap-1.5 mb-1">
        {icon}
        {label}
        <span className="ml-auto text-stone-300">{participants.length}</span>
      </h3>
      {participants.length === 0 ? (
        <p className="text-xs text-stone-300 italic">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {participants.map(p => (
            <li key={p.id} className="flex items-center gap-2 py-1 text-sm">
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-full shrink-0 text-[10px] font-semibold text-white"
                style={{ backgroundColor: p.color }}
              >
                {p.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="truncate font-medium text-stone-800">{p.name}</span>
              <span className="ml-auto text-xs text-stone-400 tabular-nums shrink-0">
                {p.spokenSeconds}s · {Math.round(p.share * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
