"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { setMeetingActionCompleted } from '@/lib/meeting-workspace-storage';
import type { WorkspaceAction } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';

interface MeetingActionsTabProps {
  meetingId: string;
  actions: WorkspaceAction[];
  onCreateAction?: (text: string) => void;
  onDeleteAction?: (id: string) => void;
}

export function MeetingActionsTab({ meetingId, actions, onCreateAction, onDeleteAction }: MeetingActionsTabProps) {
  const t = useTranslations('meetingWorkspace');
  const [draft, setDraft] = useState('');

  const createAction = () => {
    const text = draft.trim();
    if (!text) return;
    onCreateAction?.(text);
    setDraft('');
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-2 shadow-sm">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && createAction()}
          placeholder="Add an action item"
          className="border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <Button size="sm" onClick={createAction} disabled={!draft.trim()} className="gap-1.5"><Plus size={15} />Add action</Button>
      </div>
      {actions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-5 py-10 text-center text-sm text-[rgb(var(--app-muted-fg))]">{t('noActionItems')}</div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] shadow-sm">
          {actions.map((action) => (
            <li key={action.id} className="group/action flex items-start gap-3 border-b border-[rgb(var(--app-border))] px-4 py-3 last:border-b-0">
              <input
                type="checkbox"
                aria-label={action.text}
                defaultChecked={action.completed}
                onChange={(event) => {
                  void setMeetingActionCompleted(meetingId, action.id, event.target.checked);
                }}
                className="mt-0.5 h-4 w-4 rounded border-stone-300"
              />
              <span className="min-w-0 flex-1 text-sm leading-relaxed text-[rgb(var(--app-fg))]">{action.text}</span>
              {action.id.startsWith('manual:') && onDeleteAction && (
                <button type="button" onClick={() => onDeleteAction(action.id)} className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[rgb(var(--app-muted-fg))] opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 focus:opacity-100" aria-label={`Delete ${action.text}`} title="Delete action">
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
