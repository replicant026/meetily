"use client";

import type { WorkspaceParticipant } from './types';
import { Mic, Monitor } from 'lucide-react';

interface ParticipantsSidebarProps {
  participants: WorkspaceParticipant[];
  className?: string;
}

export function ParticipantsSidebar({ participants, className }: ParticipantsSidebarProps) {
  const micParticipants = participants.filter(p => p.source === 'microphone');
  const sysParticipants = participants.filter(p => p.source === 'system');

  return (
    <aside aria-label="Participants" className={className}>
      {/* Microphone section */}
      <div>
        <h3 className="text-xs uppercase text-stone-500 font-medium tracking-wider">
          <Mic className="inline w-3 h-3 mr-1" />
          Microphone
        </h3>
        {micParticipants.map(p => (
          <ParticipantRow key={p.id} participant={p} />
        ))}
      </div>
      {/* System audio section */}
      <div>
        <h3 className="text-xs uppercase text-stone-500 font-medium tracking-wider">
          <Monitor className="inline w-3 h-3 mr-1" />
          System Audio
        </h3>
        {sysParticipants.map(p => (
          <ParticipantRow key={p.id} participant={p} />
        ))}
      </div>
    </aside>
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
