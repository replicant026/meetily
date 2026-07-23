"use client";

import { Transcript, TranscriptSegmentData } from '@/types';
import { VirtualizedTranscriptView } from '@/components/VirtualizedTranscriptView';
import { TranscriptButtonGroup } from './TranscriptButtonGroup';
import { AssignSpeakerDialog } from '@/components/speakers/AssignSpeakerDialog';
import { useMemo, useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSpeakerNames } from '@/hooks/useSpeakerNames';
import { TranscriptExportFormat } from '@/lib/transcript-export';
import { toast } from 'sonner';

interface TranscriptPanelProps {
  transcripts: Transcript[];
  customPrompt: string;
  onPromptChange: (value: string) => void;
  onCopyTranscript: () => void;
  onExportTranscript: (format: TranscriptExportFormat) => Promise<void>;
  onOpenMeetingFolder: () => Promise<void>;
  isRecording: boolean;
  disableAutoScroll?: boolean;
  width?: number;

  // Optional pagination props (when using virtualization)
  usePagination?: boolean;
  segments?: TranscriptSegmentData[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  totalCount?: number;
  loadedCount?: number;
  onLoadMore?: () => void;

  // Retranscription props
  meetingId?: string;
  meetingFolderPath?: string | null;
  onRefetchTranscripts?: () => Promise<void>;

  // Audio seek callback: enables transcript timestamp click-to-jump
  // without duplicating the header transport (single audio surface).
  onSeekToTimestamp?: (seconds: number) => void;

  // Speaker assignment callback (optimistic update in parent)
  onSpeakerAssigned?: (speakerId: string, segmentIds: string[]) => void;
}

export function TranscriptPanel({
  transcripts,
  customPrompt,
  onPromptChange,
  onCopyTranscript,
  onExportTranscript,
  onOpenMeetingFolder,
  isRecording,
  disableAutoScroll = false,
  usePagination = false,
  segments,
  hasMore,
  isLoadingMore,
  totalCount,
  loadedCount,
  onLoadMore,
  meetingId,
  meetingFolderPath,
  onRefetchTranscripts,
  onSeekToTimestamp,
  width,
  onSpeakerAssigned,
}: TranscriptPanelProps) {
  const tSummary = useTranslations('summary');

  // Assign speaker dialog state
  const [assignDialog, setAssignDialog] = useState<{
    open: boolean;
    sourceLabel: string;
    segmentIds: string[];
  }>({ open: false, sourceLabel: '', segmentIds: [] });

  const handleSpeakerClick = useCallback((sourceLabel: string, segmentIds: string[]) => {
    setAssignDialog({ open: true, sourceLabel, segmentIds });
  }, []);

  const handleAssigned = useCallback((speakerId: string, segmentIds: string[]) => {
    setAssignDialog({ open: false, sourceLabel: '', segmentIds: [] });
    onSpeakerAssigned?.(speakerId, segmentIds);
    // Refresh transcript data to reflect new speaker labels
    onRefetchTranscripts?.();
  }, [onSpeakerAssigned, onRefetchTranscripts]);

  const convertedSegments = useMemo(() => {
    if (usePagination && segments) {
      return segments;
    }
    return transcripts.map(t => ({
      id: t.id,
      timestamp: t.audio_start_time ?? 0,
      endTime: t.audio_end_time,
      text: t.text,
      confidence: t.confidence,
      speaker: t.speaker,
        transient_speaker: t.transient_speaker ?? null,
    }));
  }, [transcripts, usePagination, segments]);

  const speakerNames = useSpeakerNames(meetingId ?? null);

  const handleTimestampClick = useCallback((sec: number) => {
    onSeekToTimestamp?.(sec);
  }, [onSeekToTimestamp]);

  const hasSeek = !!onSeekToTimestamp;

  return (
    <div className="flex min-w-0 flex-col relative" data-testid="workspace-transcript">
      <div className="p-4 border-b border-gray-200">
        <TranscriptButtonGroup
          transcriptCount={usePagination ? (totalCount ?? convertedSegments.length) : (transcripts?.length || 0)}
          onCopyTranscript={onCopyTranscript}
          onExportTranscript={onExportTranscript}
          onOpenMeetingFolder={onOpenMeetingFolder}
          meetingId={meetingId}
          meetingFolderPath={meetingFolderPath}
          onRefetchTranscripts={onRefetchTranscripts}
        />
      </div>

      <div className="flex-1 overflow-hidden pb-4">
        <VirtualizedTranscriptView
          segments={convertedSegments}
          onTimestampClick={hasSeek ? handleTimestampClick : undefined}
          isRecording={isRecording}
          isPaused={false}
          isProcessing={false}
          isStopping={false}
          enableStreaming={false}
          showConfidence={true}
          disableAutoScroll={disableAutoScroll}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          totalCount={totalCount}
          loadedCount={loadedCount}
          onLoadMore={onLoadMore}
          customSpeakerNames={speakerNames.allNames}
          onSpeakerRename={speakerNames.setName}
          onSpeakerClick={handleSpeakerClick}
          onEnrollSpeaker={(speakerId) => {
            toast.success(`Enrolling voice for ${speakerId}...`);
          }}
        />
      </div>

      {!isRecording && convertedSegments.length > 0 && (
        <div className="p-1 border-t border-gray-200">
          <textarea
            placeholder={tSummary("meeting.custom_prompt_placeholder")}
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm min-h-[80px] resize-y"
            value={customPrompt}
            onChange={(e) => onPromptChange(e.target.value)}
          />
        </div>
      )}

      {assignDialog.open && meetingId && (
        <AssignSpeakerDialog
          meetingId={meetingId}
          sourceLabel={assignDialog.sourceLabel}
          segmentIds={assignDialog.segmentIds}
          open={assignDialog.open}
          onClose={() => setAssignDialog(prev => ({ ...prev, open: false }))}
          onAssigned={handleAssigned}
        />
      )}
    </div>
  );
}
