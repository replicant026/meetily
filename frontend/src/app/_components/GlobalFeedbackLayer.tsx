'use client';

/**
 * GlobalFeedbackLayer
 *
 * Single place that mounts every app-wide feedback surface:
 *   - Toaster (sonner) — the one and only toast viewport
 *   - DownloadProgressToast — background model download feedback
 *   - ImportDropOverlay + drag/drop events
 *   - ImportAudioDialog — gated by beta feature flag
 *   - OrphanCheckpointListener
 *   - RecoveryFailureBanner — fixed top banner for failed recoveries
 *
 * All surfaces use semantic z-index via CSS custom properties:
 *   --z-base: 0, --z-sticky: 10, --z-modal: 50, --z-toast: 60
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Toaster } from 'sonner';
import 'sonner/dist/styles.css';
import { toast } from 'sonner';
import { useConfig } from '@/contexts/ConfigContext';
import { ImportDialogProvider } from '@/contexts/ImportDialogContext';
import { ImportAudioDialog, ImportDropOverlay } from '@/components/ImportAudio';
import { DownloadProgressToastProvider } from '@/components/shared/DownloadProgressToast';
import { OrphanCheckpointListener } from '@/components/OrphanCheckpointListener';
import { RecoveryFailureBanner } from '@/components/RecoveryFailureBanner';
import {
  isAudioExtension,
  getAudioFormatsDisplayList,
} from '@/constants/audioFormats';
import { loadBetaFeatures } from '@/types/betaFeatures';

interface GlobalFeedbackLayerProps {
  children: React.ReactNode;
  /** When true, suppress interactive overlays (drag/drop, import dialog, recovery). */
  suppressOverlays?: boolean;
}

export function GlobalFeedbackLayer({
  children,
  suppressOverlays = false,
}: GlobalFeedbackLayerProps) {
  const [showDropOverlay, setShowDropOverlay] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFilePath, setImportFilePath] = useState<string | null>(null);

  const handleOpenImportDialog = useCallback((filePath?: string | null) => {
    setImportFilePath(filePath ?? null);
    setShowImportDialog(true);
  }, []);

  const handleImportDialogClose = useCallback((open: boolean) => {
    setShowImportDialog(open);
    if (!open) setImportFilePath(null);
  }, []);

  const handleFileDrop = useCallback((paths: string[]) => {
    const audioFile = paths.find((p) => {
      const ext = p.split('.').pop()?.toLowerCase();
      return !!ext && isAudioExtension(ext);
    });
    if (audioFile) {
      setImportFilePath(audioFile);
      setShowImportDialog(true);
    } else if (paths.length > 0) {
      toast.error('Please drop an audio file', {
        description: `Supported formats: ${getAudioFormatsDisplayList()}`,
      });
    }
  }, []);

  // Tauri drag-drop listeners — only active when overlays are not suppressed
  useEffect(() => {
    if (suppressOverlays) return;
    const unlisteners: UnlistenFn[] = [];
    const cleanedUpRef = { current: false };

    const setup = async () => {
      const u1 = await listen('tauri://drag-enter', () => {
        if (loadBetaFeatures().importAndRetranscribe) setShowDropOverlay(true);
      });
      if (cleanedUpRef.current) { u1(); return; }
      unlisteners.push(u1);

      const u2 = await listen('tauri://drag-leave', () => {
        setShowDropOverlay(false);
      });
      if (cleanedUpRef.current) { u2(); unlisteners.forEach((u) => u()); return; }
      unlisteners.push(u2);

      const u3 = await listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
        setShowDropOverlay(false);
        handleFileDrop(event.payload.paths);
      });
      if (cleanedUpRef.current) { u3(); unlisteners.forEach((u) => u()); return; }
      unlisteners.push(u3);
    };
    setup();

    return () => {
      cleanedUpRef.current = true;
      unlisteners.forEach((u) => u());
    };
  }, [suppressOverlays, handleFileDrop]);

  return (
    <ImportDialogProvider onOpen={handleOpenImportDialog}>
      {/* App content */}
      {children}

      {/* Background download progress (silent listener) */}
      <DownloadProgressToastProvider />

      {/* Drag-and-drop overlay — z-[var(--z-modal)] */}
      {!suppressOverlays && (
        <ImportDropOverlay visible={showDropOverlay} />
      )}

      {/* Import dialog — gated by beta feature flag */}
      {!suppressOverlays && (
        <ImportAudioDialogConditional
          open={showImportDialog}
          onOpenChange={handleImportDialogClose}
          preselectedFile={importFilePath}
        />
      )}

      {/* Orphan checkpoint recovery listener */}
      {!suppressOverlays && <OrphanCheckpointListener />}

      {/* Recovery failure banner — z-[var(--z-sticky)] */}
      {!suppressOverlays && <RecoveryFailureBanner />}

      {/* Single Sonner viewport — z-[var(--z-toast)] */}
      <Toaster
        position="bottom-center"
        toastOptions={{ className: 'z-[var(--z-toast)]' }}
      />
    </ImportDialogProvider>
  );
}

/**
 * Renders ImportAudioDialog only when the beta feature flag is enabled.
 */
function ImportAudioDialogConditional({
  open,
  onOpenChange,
  preselectedFile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedFile: string | null;
}) {
  const { betaFeatures } = useConfig();
  if (!betaFeatures.importAndRetranscribe) return null;

  return (
    <ImportAudioDialog
      open={open}
      onOpenChange={onOpenChange}
      preselectedFile={preselectedFile}
    />
  );
}
