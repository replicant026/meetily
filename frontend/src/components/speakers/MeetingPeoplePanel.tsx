'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { User, ChevronRight, Clock } from 'lucide-react';
import type { SpeakerPerson } from '@/lib/speaker-types';
import { listPeople } from '@/lib/speaker-api';

export interface MeetingPeoplePanelProps {
  meetingId: string;
  segments: Array<{ speaker?: string | null; timestamp: number; endTime?: number }>;
  onOpenPerson?: (personId: string) => void;
}

function formatDuration(totalSeconds: number): string {
  if (!isFinite(totalSeconds) || totalSeconds <= 0) return '0:00';
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface SpeakerInfo {
  label: string;
  personId: string | null;
  person: SpeakerPerson | null;
  durationSeconds: number;
  segmentCount: number;
}

export function MeetingPeoplePanel({
  meetingId,
  segments,
  onOpenPerson,
}: MeetingPeoplePanelProps) {
  const t = useTranslations('speakers.meeting_people');
  const [people, setPeople] = useState<SpeakerPerson[]>([]);

  useEffect(() => {
    listPeople().then(setPeople).catch(() => {});
  }, [meetingId]);

  const speakers = useMemo(() => {
    const map = new Map<string, SpeakerInfo>();

    for (const seg of segments) {
      const label = seg.speaker;
      if (!label) continue;

      if (!map.has(label)) {
        map.set(label, {
          label,
          personId: null,
          person: null,
          durationSeconds: 0,
          segmentCount: 0,
        });
      }

      const info = map.get(label)!;
      info.segmentCount++;
      if (seg.endTime != null && seg.timestamp != null) {
        info.durationSeconds += Math.max(0, seg.endTime - seg.timestamp);
      }
    }

    // Try to match speaker labels to known people
    for (const info of map.values()) {
      // Match by exact name or "Speaker N" → person with matching display_name
      const match = people.find(
        (p) => p.display_name === info.label
      );
      if (match) {
        info.personId = match.id;
        info.person = match;
      }
    }

    return Array.from(map.values());
  }, [segments, people]);

  if (speakers.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p className="text-sm">{t('empty')}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {speakers.map((speaker) => (
        <div
          key={speaker.label}
          className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
        >
          {/* Avatar */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: speaker.person?.color ?? '#6b7280' }}
          >
            <User size={14} className="text-white" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {speaker.person?.display_name ?? speaker.label}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock size={10} />
              {speaker.durationSeconds > 0 ? (
                <span>{formatDuration(speaker.durationSeconds)}</span>
              ) : (
                <span>{t('duration_unavailable')}</span>
              )}
              <span>· {t('segments', { count: speaker.segmentCount })}</span>
            </div>
          </div>

          {/* Match state badge */}
          {speaker.personId ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
              {t('state_confirmed')}
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              {t('state_unassigned')}
            </span>
          )}

          {/* Open detail button */}
          {speaker.personId && onOpenPerson && (
            <button
              type="button"
              onClick={() => onOpenPerson(speaker.personId!)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label={t('open_detail')}
            >
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
