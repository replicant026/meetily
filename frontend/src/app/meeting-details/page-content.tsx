"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Summary, SummaryResponse } from '@/types';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import Analytics from '@/lib/analytics';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { TranscriptPanel } from '@/components/MeetingDetails/TranscriptPanel';
import { MeetingWorkspace } from '@/components/MeetingWorkspace/MeetingWorkspace';
import { MeetingNotesTab } from '@/components/MeetingWorkspace/MeetingNotesTab';
import { MeetingActionsTab } from '@/components/MeetingWorkspace/MeetingActionsTab';
import type { AudioController, WorkspaceAction } from '@/components/MeetingWorkspace/types';
import { ModelConfig } from '@/components/ModelSettingsModal';

// Custom hooks
import { useMeetingData } from '@/hooks/meeting-details/useMeetingData';
import { useSummaryGeneration } from '@/hooks/meeting-details/useSummaryGeneration';
import { useTemplates } from '@/hooks/meeting-details/useTemplates';
import { useCopyOperations } from '@/hooks/meeting-details/useCopyOperations';
import { useMeetingOperations } from '@/hooks/meeting-details/useMeetingOperations';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslations } from 'next-intl';
import { useMeetingAudioPath } from '@/hooks/useMeetingAudioPath';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useAudioPeaks } from '@/hooks/useAudioPeaks';
import { useMeetingWorkspace } from '@/components/MeetingWorkspace/useMeetingWorkspace';
import { getMeetingActionStates } from '@/lib/meeting-workspace-storage';

export default function PageContent({
  meeting,
  summaryData,
  shouldAutoGenerate = false,
  onAutoGenerateComplete,
  onMeetingUpdated,
  onRefetchTranscripts,
  // Pagination props for efficient transcript loading
  segments,
  hasMore,
  isLoadingMore,
  totalCount,
  loadedCount,
  onLoadMore,
}: {
  meeting: any;
  summaryData: Summary | null;
  shouldAutoGenerate?: boolean;
  onAutoGenerateComplete?: () => void;
  onMeetingUpdated?: () => Promise<void>;
  onRefetchTranscripts?: () => Promise<void>;
  // Pagination props
  segments?: any[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  totalCount?: number;
  loadedCount?: number;
  onLoadMore?: () => void;
}) {
  console.log('📄 PAGE CONTENT: Initializing with data:', {
    meetingId: meeting.id,
    summaryDataKeys: summaryData ? Object.keys(summaryData) : null,
    transcriptsCount: meeting.transcripts?.length
  });

  // State
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isRecording] = useState(false);
  const [summaryResponse] = useState<SummaryResponse | null>(null);

  // Ref to store the modal open function from SummaryGeneratorButtonGroup
  const openModelSettingsRef = useRef<(() => void) | null>(null);

  // Sidebar context
  const { serverAddress } = useSidebar();

  // Get model config from ConfigContext
  const t = useTranslations('settings');
  const { modelConfig, setModelConfig } = useConfig();

  // Custom hooks
  const meetingData = useMeetingData({ meeting, summaryData, onMeetingUpdated });
  const templates = useTemplates();

  // Callback to register the modal open function
  const handleRegisterModalOpen = (openFn: () => void) => {
    console.log('📝 Registering modal open function in PageContent');
    openModelSettingsRef.current = openFn;
  };

  // Callback to trigger modal open (called from error handler)
  const handleOpenModelSettings = () => {
    console.log('🔔 Opening model settings from PageContent');
    if (openModelSettingsRef.current) {
      openModelSettingsRef.current();
    } else {
      console.warn('⚠️ Modal open function not yet registered');
    }
  };

  // Save model config to backend database and sync via event
  const handleSaveModelConfig = async (config?: ModelConfig) => {
    if (!config) return;
    try {
      await invoke('api_save_model_config', {
        provider: config.provider,
        model: config.model,
        whisperModel: config.whisperModel,
        apiKey: config.apiKey ?? null,
        ollamaEndpoint: config.ollamaEndpoint ?? null,
      });

      // Emit event so ConfigContext and other listeners stay in sync
      const { emit } = await import('@tauri-apps/api/event');
      await emit('model-config-updated', config);

      toast.success(t('summary.save_success'));
    } catch (error) {
      console.error('Failed to save model config:', error);
      toast.error(t('summary.save_failed'));
    }
  };

  // Resolve browser-decodable audio path for click-to-jump (Wave 14 PR-44d)
  const { audioPath } = useMeetingAudioPath(meeting?.id);

  const summaryGeneration = useSummaryGeneration({
    meeting,
    transcripts: meetingData.transcripts,
    modelConfig: modelConfig,
    isModelConfigLoading: false, // ConfigContext loads on mount
    selectedTemplate: templates.selectedTemplate,
    onMeetingUpdated,
    updateMeetingTitle: meetingData.updateMeetingTitle,
    setAiSummary: meetingData.setAiSummary,
    onOpenModelSettings: handleOpenModelSettings,
  });

  const copyOperations = useCopyOperations({
    meeting,
    transcripts: meetingData.transcripts,
    meetingTitle: meetingData.meetingTitle,
    aiSummary: meetingData.aiSummary,
    blockNoteSummaryRef: meetingData.blockNoteSummaryRef,
  });

  const meetingOperations = useMeetingOperations({
    meeting,
  });

  // Track page view
  useEffect(() => {
    Analytics.trackPageView('meeting_details');
  }, []);

  // Auto-generate summary when flag is set
  useEffect(() => {
    let cancelled = false;

    const autoGenerate = async () => {
      if (shouldAutoGenerate && meetingData.transcripts.length > 0 && !cancelled) {
        console.log(`🤖 Auto-generating summary with ${modelConfig.provider}/${modelConfig.model}...`);
        await summaryGeneration.handleGenerateSummary('');

        // Notify parent that auto-generation is complete (only if not cancelled)
        if (onAutoGenerateComplete && !cancelled) {
          onAutoGenerateComplete();
        }
      }
    };

    autoGenerate();

    // Cleanup: cancel if component unmounts or meeting changes
    return () => {
      cancelled = true;
    };
  }, [shouldAutoGenerate, meeting.id]); // Re-run if meeting changes

  // Audio player and waveform peaks (Wave 14 PR-44d)
  const audioPlayer = useAudioPlayer(audioPath);
  const peaks = useAudioPeaks(audioPath);

  const audioController: AudioController = {
    isPlaying: audioPlayer.isPlaying,
    currentTime: audioPlayer.currentTime,
    duration: audioPlayer.duration,
    toggle: audioPlayer.isPlaying ? audioPlayer.pause : audioPlayer.play,
    seek: audioPlayer.seek,
  };

  // Derive participants from transcript speaker data
  const participants = useMeetingWorkspace(meetingData.transcripts);

  // Persisted action completion states
  const [completedActionIds, setCompletedActionIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!meeting.id) return;
    getMeetingActionStates(meeting.id).then((states) => {
      setCompletedActionIds(new Set(
        Object.entries(states)
          .filter(([, completed]) => completed)
          .map(([id]) => id)
      ));
    }).catch(() => {});
  }, [meeting.id, summaryData]);

  const transcriptPanel = (
    <TranscriptPanel
      width={undefined}
      transcripts={meetingData.transcripts}
      customPrompt={customPrompt}
      onPromptChange={setCustomPrompt}
      onCopyTranscript={copyOperations.handleCopyTranscript}
      onExportTranscript={copyOperations.handleExportTranscript}
      onOpenMeetingFolder={meetingOperations.handleOpenMeetingFolder}
      isRecording={isRecording}
      disableAutoScroll={true}
      // Pagination props for efficient loading
      usePagination={true}
      segments={segments}
      hasMore={hasMore}
      isLoadingMore={isLoadingMore}
      totalCount={totalCount}
      loadedCount={loadedCount}
      onLoadMore={onLoadMore}
      // Retranscription props
      meetingId={meeting.id}
      meetingFolderPath={meeting.folder_path}
      onRefetchTranscripts={onRefetchTranscripts}
      // Audio jump props (Wave 14 PR-44d): null disables the player gracefully
      audioPath={audioPath}
    />
  );

  const actionItems: WorkspaceAction[] =
    summaryData?.action_items?.blocks?.map((block, i) => ({
      id: `summary:action_items:${i}`,
      text: block.content,
      assigneeId: null,
      completed: completedActionIds.has(`summary:action_items:${i}`),
    })) ?? [];

  const notesPanel = <MeetingNotesTab meetingId={meeting.id} />;
  const actionsPanel = <MeetingActionsTab meetingId={meeting.id} actions={actionItems} />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex flex-col h-screen bg-gray-50"
    >
      <MeetingWorkspace
        meeting={{ id: meeting.id, title: meeting.title, created_at: meeting.created_at }}
        audio={audioController}
        participants={participants}
        peaks={peaks}
        transcriptContent={transcriptPanel}
        summaryProps={{
          meeting,
          meetingTitle: meetingData.meetingTitle,
          onTitleChange: meetingData.handleTitleChange,
          isEditingTitle: meetingData.isEditingTitle,
          onStartEditTitle: () => meetingData.setIsEditingTitle(true),
          onFinishEditTitle: () => meetingData.setIsEditingTitle(false),
          isTitleDirty: meetingData.isTitleDirty,
          summaryRef: meetingData.blockNoteSummaryRef,
          isSaving: meetingData.isSaving,
          onSaveAll: meetingData.saveAllChanges,
          onCopySummary: copyOperations.handleCopySummary,
          onOpenFolder: meetingOperations.handleOpenMeetingFolder,
          aiSummary: meetingData.aiSummary,
          summaryStatus: summaryGeneration.summaryStatus,
          transcripts: meetingData.transcripts,
          modelConfig,
          setModelConfig,
          onSaveModelConfig: handleSaveModelConfig,
          onGenerateSummary: summaryGeneration.handleGenerateSummary,
          onStopGeneration: summaryGeneration.handleStopGeneration,
          customPrompt,
          summaryResponse,
          onSaveSummary: meetingData.handleSaveSummary,
          onSummaryChange: meetingData.handleSummaryChange,
          onDirtyChange: meetingData.setIsSummaryDirty,
          summaryError: summaryGeneration.summaryError,
          onRegenerateSummary: summaryGeneration.handleRegenerateSummary,
          getSummaryStatusMessage: summaryGeneration.getSummaryStatusMessage,
          availableTemplates: templates.availableTemplates,
          selectedTemplate: templates.selectedTemplate,
          onTemplateSelect: templates.handleTemplateSelection,
          isModelConfigLoading: false,
          onOpenModelSettings: handleRegisterModalOpen,
        }}
        notesContent={notesPanel}
        actionsContent={actionsPanel}
        transcriptSegments={
          segments?.map((s: any) => ({
            speaker: s.speaker,
            timestamp: s.timestamp,
            endTime: s.endTime,
          })) ?? meetingData.transcripts.map((tr: any) => ({
            speaker: tr.speaker,
            timestamp: tr.audio_start_time ?? 0,
            endTime: tr.audio_end_time,
          }))
        }
      />
    </motion.div>
  );
}
