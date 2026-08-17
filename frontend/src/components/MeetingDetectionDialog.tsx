'use client';

import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { useRecordingStart } from '@/hooks/useRecordingStart';

interface DetectionEvent {
  eventType: string;
  appName: string | null;
  timestamp: string;
  confidence: number;
}

interface MeetingDetectionDialogProps {
  onDismiss?: () => void;
}

export function MeetingDetectionDialog({ onDismiss }: MeetingDetectionDialogProps) {
  const [event, setEvent] = useState<DetectionEvent | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const { isRecording } = useRecordingState();
  const { handleRecordingStart } = useRecordingStart();
  const t = useTranslations('detection');

  useEffect(() => {
    const unlisten = listen<DetectionEvent>('meeting-detected', (e) => {
      if (e.payload.eventType === 'meeting_detected' && !isRecording) {
        setEvent(e.payload);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [isRecording]);

  const handleStartRecording = async () => {
    setIsStarting(true);
    try {
      await handleRecordingStart();
      toast.success(t('recording_started'));
    } catch (e) {
      toast.error(t('recording_failed', { error: String(e) }));
    } finally {
      setIsStarting(false);
      setEvent(null);
      onDismiss?.();
    }
  };

  const handleDismiss = () => {
    setEvent(null);
    onDismiss?.();
  };

  if (!event) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="flex items-start gap-3 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4 shadow-xl max-w-sm">
        <div className="flex-shrink-0 mt-0.5">
          <Radio className="h-5 w-5 text-blue-500 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[rgb(var(--app-fg))]">
            {t('title')}
          </p>
          <p className="text-xs text-[rgb(var(--app-muted-fg))] mt-1">
            {t('description')}
          </p>
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              onClick={handleStartRecording}
              disabled={isStarting}
              className="h-7 text-xs"
            >
              {isStarting ? t('starting') : t('start_recording')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDismiss}
              className="h-7 text-xs"
            >
              {t('dismiss')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
