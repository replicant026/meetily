"use client";

import { useTranslations } from 'next-intl';
import { setMeetingActionCompleted } from '@/lib/meeting-workspace-storage';
import type { WorkspaceAction } from './types';

interface MeetingActionsTabProps {
  meetingId: string;
  actions: WorkspaceAction[];
}

export function MeetingActionsTab({ meetingId, actions }: MeetingActionsTabProps) {
  const t = useTranslations('meetingWorkspace');

  if (actions.length === 0) {
    return (
      <div className="p-6 text-stone-400 text-sm">{t('noActionItems')}</div>
    );
  }

  return (
    <ul className="divide-y divide-stone-100">
      {actions.map((action) => (
        <li key={action.id} className="flex items-start gap-3 px-4 py-3">
          <input
            type="checkbox"
            aria-label={action.text}
            defaultChecked={action.completed}
            onChange={(e) => {
              setMeetingActionCompleted(meetingId, action.id, e.target.checked);
            }}
            className="mt-0.5 h-4 w-4 rounded border-stone-300"
          />
          <span className="text-sm leading-relaxed">{action.text}</span>
        </li>
      ))}
    </ul>
  );
}
