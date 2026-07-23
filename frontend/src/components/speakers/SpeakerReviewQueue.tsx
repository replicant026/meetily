'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, X, ChevronDown } from 'lucide-react';
import { listSuggestions, acceptSuggestion, rejectSuggestion, listPeople } from '@/lib/speaker-api';
import type { SpeakerSuggestion, SpeakerPerson } from '@/lib/speaker-types';
import { toast } from 'sonner';

interface SpeakerReviewQueueProps {
  meetingId: string;
  onResolved?: () => void;
}

export function SpeakerReviewQueue({ meetingId, onResolved }: SpeakerReviewQueueProps) {
  const t = useTranslations('speakers.review_queue');
  const [suggestions, setSuggestions] = useState<SpeakerSuggestion[]>([]);
  const [people, setPeople] = useState<SpeakerPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([listSuggestions(meetingId), listPeople()]);
      setSuggestions(s);
      setPeople(p);
    } catch (e) {
      console.warn('Failed to load suggestions:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [meetingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAccept = async (sug: SpeakerSuggestion) => {
    setActing(sug.id);
    try {
      await acceptSuggestion(sug.id);
      toast.success(t('accepted'));
      setSuggestions((prev) => prev.filter((s) => s.id !== sug.id));
      onResolved?.();
    } catch {
      toast.error(t('accept_failed'));
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (sug: SpeakerSuggestion) => {
    setActing(sug.id);
    try {
      await rejectSuggestion(sug.id);
      toast.success(t('rejected'));
      setSuggestions((prev) => prev.filter((s) => s.id !== sug.id));
      onResolved?.();
    } catch {
      toast.error(t('reject_failed'));
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground py-4">Loading...</div>;
  }

  if (suggestions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
        <p className="text-xs text-muted-foreground/70 mt-1">{t('empty_hint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {suggestions.map((sug) => {
        const confidencePct = Math.round(sug.confidence * 100);
        const speaker = people.find((p) => p.id === sug.speaker_id);
        const isActing = acting === sug.id;

        return (
          <div
            key={sug.id}
            className="rounded-lg border border-border bg-card p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  {t('source_label', { label: sug.source_label })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {speaker?.display_name ?? sug.speaker_id} · {t('confidence', { score: confidencePct })}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAccept(sug)}
                  disabled={isActing}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <Check size={12} />
                  {t('accept')}
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(sug)}
                  disabled={isActing}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-border text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                >
                  <X size={12} />
                  {t('reject')}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('from_meeting', { id: sug.meeting_id })}
            </p>
          </div>
        );
      })}
    </div>
  );
}
