"use client";

import type { WorkspaceParticipant } from './types';

interface ParticipantsSidebarProps {
  participants: WorkspaceParticipant[];
}

/** Placeholder sidebar – Task 5 will flesh this out. */
export function ParticipantsSidebar({ participants }: ParticipantsSidebarProps) {
  return (
    <aside
      role="complementary"
      aria-label="Participants"
      className="hidden lg:block w-[22rem] border-l border-stone-200 bg-white overflow-y-auto"
    >
      <div className="px-4 pt-4 pb-2 text-xs font-medium tracking-widest uppercase text-stone-400">
        Participants
      </div>
      {participants.length === 0 ? (
        <div className="px-4 py-6 text-sm text-stone-400">
          No participants yet.
        </div>
      ) : (
        <ul className="divide-y divide-stone-100">
          {participants.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: p.color }}
              />
              <span className="text-sm text-stone-700 truncate">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
