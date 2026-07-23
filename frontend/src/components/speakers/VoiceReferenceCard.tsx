'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import type { VoiceReference } from '@/lib/speaker-types';
import { deleteReference } from '@/lib/speaker-api';
import { VoiceReferencePlayer } from './VoiceReferencePlayer';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const CHANNEL_LABELS: Record<string, string> = {
  microphone: 'reference.channel_mic',
  system: 'reference.channel_system',
  mixed: 'reference.channel_mixed',
  unknown: 'reference.channel_unknown',
};

const ORIGIN_LABELS: Record<string, string> = {
  manual_assignment: 'reference.origin_manual',
  accepted_suggestion: 'reference.origin_suggestion',
  automatic_match: 'reference.origin_automatic',
  legacy: 'reference.origin_legacy',
};

interface VoiceReferenceCardProps {
  reference: VoiceReference;
  meetingName?: string;
  onDeleted?: () => void;
}

export function VoiceReferenceCard({ reference, meetingName, onDeleted }: VoiceReferenceCardProps) {
  const t = useTranslations('speakers');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteReference(reference.id);
      toast.success(t('reference.deleted'));
      onDeleted?.();
      setConfirmDelete(false);
    } catch (err) {
      toast.error(t('reference.delete_failed'));
    } finally {
      setDeleting(false);
    }
  };

  const durationSec = (reference.duration_ms / 1000).toFixed(1);
  const qualityPct = Math.round(reference.quality_score * 100);
  const createdDate = new Date(reference.created_at).toLocaleDateString();

  // Mini waveform from stored peaks
  const peaks = reference.waveform_peaks;
  const peakBars = peaks.length > 0
    ? peaks.slice(0, 60).map((p, i) => (
        <div
          key={i}
          className="bg-primary/40 rounded-full w-[1.5px]"
          style={{ height: `${Math.max(2, p * 24)}px` }}
        />
      ))
    : null;

  return (
    <>
      <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 space-y-2">
        {/* Waveform + player row */}
        <div className="flex items-start gap-3">
          {peakBars && (
            <div className="flex items-end gap-[1px] h-6 flex-shrink-0 mt-1">
              {peakBars}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <VoiceReferencePlayer reference={reference} />
          </div>
        </div>

        {/* Metadata row */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <span>{t('reference.duration', { seconds: durationSec })}</span>
          <span>·</span>
          <span>{t(CHANNEL_LABELS[reference.channel] ?? 'reference.channel_unknown')}</span>
          <span>·</span>
          <span>{t(ORIGIN_LABELS[reference.origin] ?? 'reference.origin_manual')}</span>
          <span>·</span>
          <span>{t('reference.quality', { score: qualityPct })}</span>
          {meetingName && (
            <>
              <span>·</span>
              <span>{t('reference.from_meeting')} {meetingName}</span>
            </>
          )}
          <span>·</span>
          <span>{createdDate}</span>
        </div>

        {/* Delete */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
            title={t('reference.delete_title')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <AppDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('reference.delete_title')}
        description={t('reference.delete_description')}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              {t('reference.delete_cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {t('reference.delete_confirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{t('reference.delete_description')}</p>
      </AppDialog>
    </>
  );
}
