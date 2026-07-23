'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { FileText, MoreVertical, Trash2, Edit3 } from 'lucide-react';
import { groupMeetingsByDate, type MeetingDirectoryItem } from '@/lib/meeting-directory';
import { cn } from '@/lib/utils';

interface SidebarMeetingListProps {
  meetings: MeetingDirectoryItem[];
  currentMeetingId?: string;
  onDelete?: (id: string) => void;
  onRename?: (id: string) => void;
}

function formatRelativeDate(dateStr: string, now: Date): string {
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h${remainMins > 0 ? ` ${remainMins}m` : ''}`;
}

export function SidebarMeetingList({ meetings, currentMeetingId, onDelete, onRename }: SidebarMeetingListProps) {
  const t = useTranslations('sidebar');
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const groups = useMemo(() => groupMeetingsByDate(meetings, now), [meetings, now]);

  const renderGroup = (label: string, items: MeetingDirectoryItem[]) => {
    if (items.length === 0) return null;
    return (
      <div key={label} className="mb-3">
        <h3 className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--app-muted-fg))]">
          {label}
        </h3>
        {items.map((meeting) => (
          <MeetingRow
            key={meeting.id}
            meeting={meeting}
            isActive={meeting.id === currentMeetingId}
            now={now}
            onNavigate={() => router.push(`/meeting-details?id=${meeting.id}`)}
            onDelete={onDelete ? () => onDelete(meeting.id) : undefined}
            onRename={onRename ? () => onRename(meeting.id) : undefined}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto py-2" role="list" aria-label={t('meeting_list.list')}>
      {meetings.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-[rgb(var(--app-muted-fg))]">
          {t('meeting_list.no_meetings')}
        </p>
      ) : (
        <>
          {renderGroup(t('meeting_list.today'), groups.today)}
          {renderGroup(t('meeting_list.last_7_days'), groups.last7Days)}
          {renderGroup(t('meeting_list.older'), groups.older)}
        </>
      )}
    </div>
  );
}

function MeetingRow({ meeting, isActive, now, onNavigate, onDelete, onRename }: {
  meeting: MeetingDirectoryItem;
  isActive: boolean;
  now: Date;
  onNavigate: () => void;
  onDelete?: () => void;
  onRename?: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const duration = formatDuration(meeting.durationSeconds);
  const relativeDate = formatRelativeDate(meeting.createdAt, now);

  return (
    <div
      role="listitem"
      className={cn(
        'group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors cursor-pointer',
        isActive
          ? 'bg-[rgb(var(--app-accent))]/10 text-[rgb(var(--app-accent))]'
          : 'text-[rgb(var(--app-fg))] hover:bg-[rgb(var(--app-muted))]',
      )}
      onClick={onNavigate}
    >
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium">{meeting.title}</p>
        <div className="flex items-center gap-2 text-[10px] text-[rgb(var(--app-muted-fg))]">
          <span>{relativeDate}</span>
          {duration && <span>{duration}</span>}
          {meeting.hasSummary && <FileText className="h-3 w-3" />}
        </div>
      </div>
      {(onDelete || onRename) && (
        <div className="relative opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="rounded p-1 hover:bg-[rgb(var(--app-muted))]"
            aria-label={t('moreActions')}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full z-10 mt-1 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] shadow-md">
              {onRename && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRename(); setShowMenu(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-[rgb(var(--app-muted))]"
                >
                  <Edit3 className="h-3 w-3" /> {t('rename')}
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <Trash2 className="h-3 w-3" /> {t('delete')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
