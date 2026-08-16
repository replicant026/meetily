import { logger } from "@/lib/logger";
import { useState, useEffect } from 'react';
import { recordingService } from '@/services/recordingService';

interface UseRecordingStateSyncReturn {
  isBackendRecording: boolean;
  isRecordingDisabled: boolean;
  setIsRecordingDisabled: (value: boolean) => void;
}

/**
 * Custom hook for synchronizing frontend recording state with backend.
 * Polls backend every 1 second to detect recording state changes.
 *
 * Features:
 * - Backend state synchronization (1-second polling)
 * - Recording disabled flag management (prevents re-recording during processing)
 */
export function useRecordingStateSync(
  isRecording: boolean,
  setIsRecording: (value: boolean) => void,
  setIsMeetingActive: (value: boolean) => void
): UseRecordingStateSyncReturn {
  const [isRecordingDisabled, setIsRecordingDisabled] = useState(false);

  useEffect(() => {
    logger.log('Setting up recording state check effect, current isRecording:', isRecording);

    const checkRecordingState = async () => {
      try {
        logger.log('checkRecordingState called');
        logger.log('About to call is_recording command');
        const isCurrentlyRecording = await recordingService.isRecording();
        logger.log('checkRecordingState: backend recording =', isCurrentlyRecording, 'UI recording =', isRecording);

        if (isCurrentlyRecording && !isRecording) {
          logger.log('Recording is active in backend but not in UI, synchronizing state...');
          setIsRecording(true);
          setIsMeetingActive(true);
        } else if (!isCurrentlyRecording && isRecording) {
          logger.log('Recording is inactive in backend but active in UI, synchronizing state...');
          setIsRecording(false);
        }
      } catch (error) {
        logger.error('Failed to check recording state:', error);
      }
    };

    // Test if Tauri is available
    logger.log('Testing Tauri availability...');
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      logger.log('Tauri is available, starting state check');
      checkRecordingState();

      // Set up a polling interval to periodically check recording state
      const interval = setInterval(checkRecordingState, 1000); // Check every 1 second

      return () => {
        logger.log('Cleaning up recording state check interval');
        clearInterval(interval);
      };
    } else {
      logger.log('Tauri is not available, skipping state check');
    }
  }, [isRecording, setIsRecording, setIsMeetingActive]);

  return {
    isBackendRecording: isRecording,
    isRecordingDisabled,
    setIsRecordingDisabled,
  };
}
