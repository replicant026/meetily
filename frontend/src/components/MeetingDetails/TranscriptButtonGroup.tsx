"use client";

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Copy, Download, FolderOpen, RefreshCw, ExternalLink } from 'lucide-react';
import Analytics from '@/lib/analytics';
import { RetranscribeDialog } from './RetranscribeDialog';
import { useConfig } from '@/contexts/ConfigContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TranscriptExportFormat } from '@/lib/transcript-export';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';


interface TranscriptButtonGroupProps {
  transcriptCount: number;
  onCopyTranscript: () => void;
  onExportTranscript: (format: TranscriptExportFormat) => Promise<void>;
  onOpenMeetingFolder: () => Promise<void>;
  meetingId?: string;
  meetingFolderPath?: string | null;
  onRefetchTranscripts?: () => Promise<void>;
  meetingTitle?: string;
  transcriptMarkdown?: string;
}


export function TranscriptButtonGroup({
  transcriptCount,
  onCopyTranscript,
  onExportTranscript,
  onOpenMeetingFolder,
  meetingId,
  meetingFolderPath,
  onRefetchTranscripts,
  meetingTitle,
  transcriptMarkdown,
}: TranscriptButtonGroupProps) {
  const { betaFeatures } = useConfig();
  const t = useTranslations('transcript.view');
  const [showRetranscribeDialog, setShowRetranscribeDialog] = useState(false);
  const [showJotBirdDialog, setShowJotBirdDialog] = useState(false);
  const [jotbirdApiKey, setJotbirdApiKey] = useState('');
  const [jotbirdPublishing, setJotbirdPublishing] = useState(false);

  const handlePublishToJotBird = useCallback(async () => {
    if (!transcriptMarkdown || !jotbirdApiKey) return;
    setJotbirdPublishing(true);
    try {
      const url = await invoke<string>('export_to_jotbird', {
        markdown: transcriptMarkdown,
        title: meetingTitle || undefined,
        apiKey: jotbirdApiKey,
      });
      toast.success('Published to JotBird!', {
        description: url,
        action: { label: 'Open', onClick: () => window.open(url, '_blank') },
      });
      // Persist API key for next time
      localStorage.setItem('jotbird_api_key', jotbirdApiKey);
      setShowJotBirdDialog(false);
    } catch (err) {
      toast.error(`JotBird export failed: ${err}`);
    } finally {
      setJotbirdPublishing(false);
    }
  }, [transcriptMarkdown, meetingTitle, jotbirdApiKey]);

  const handleRetranscribeComplete = useCallback(async () => {
    // Refetch transcripts to show the updated data
    if (onRefetchTranscripts) {
      await onRefetchTranscripts();
    }
  }, [onRefetchTranscripts]);

  return (
    <div className="flex items-center justify-center w-full gap-2">
      <ButtonGroup>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            Analytics.trackButtonClick('copy_transcript', 'meeting_details');
            onCopyTranscript();
          }}
          disabled={transcriptCount === 0}
          title={transcriptCount === 0 ? 'No transcript available' : 'Copy Transcript'}
        >
          <Copy />
          <span className="hidden lg:inline">Copy</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              disabled={transcriptCount === 0}
              title={transcriptCount === 0 ? t('export_no_transcript') : t('export')}
            >
              <Download size={18} />
              <span className="hidden lg:inline">{t('export')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => void onExportTranscript('markdown')}>
              {t('export_markdown')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void onExportTranscript('docx')}>
              {t('export_docx')}
            </DropdownMenuItem>
            {transcriptMarkdown && (
              <DropdownMenuItem onSelect={() => {
                setJotbirdApiKey(localStorage.getItem('jotbird_api_key') || '');
                setShowJotBirdDialog(true);
              }}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Publish to JotBird
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          variant="outline"
          className="xl:px-4"
          onClick={() => {
            Analytics.trackButtonClick('open_recording_folder', 'meeting_details');
            onOpenMeetingFolder();
          }}
          title="Open Recording Folder"
        >
          <FolderOpen className="xl:mr-2" size={18} />
          <span className="hidden lg:inline">Recording</span>
        </Button>

        {betaFeatures.importAndRetranscribe && meetingId && meetingFolderPath && (
          <Button
            size="sm"
            variant="outline"
            className="bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 border-blue-200 xl:px-4"
            onClick={() => {
              Analytics.trackButtonClick('enhance_transcript', 'meeting_details');
              setShowRetranscribeDialog(true);
            }}
            title="Retranslate your recorded audio"
          >
            <RefreshCw className="xl:mr-2" size={18} />
            <span className="hidden lg:inline">Retranslate</span>
          </Button>
        )}
      </ButtonGroup>

      {betaFeatures.importAndRetranscribe && meetingId && meetingFolderPath && (
        <RetranscribeDialog
          open={showRetranscribeDialog}
          onOpenChange={setShowRetranscribeDialog}
          meetingId={meetingId}
          meetingFolderPath={meetingFolderPath}
          onComplete={handleRetranscribeComplete}
        />
      )}

      <Dialog open={showJotBirdDialog} onOpenChange={setShowJotBirdDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publish to JotBird</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Publish your transcript as a shareable web page. Get your API key from{' '}
              <a href="https://www.jotbird.com/account" target="_blank" rel="noopener noreferrer"
                 className="text-blue-500 hover:underline">
                jotbird.com/account
              </a>.
            </p>
            <Input
              type="password"
              placeholder="jb_your_api_key_here"
              value={jotbirdApiKey}
              onChange={(e) => setJotbirdApiKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !jotbirdPublishing) handlePublishToJotBird(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowJotBirdDialog(false)}>Cancel</Button>
            <Button
              onClick={() => void handlePublishToJotBird()}
              disabled={!jotbirdApiKey || jotbirdPublishing}
            >
              {jotbirdPublishing ? 'Publishing...' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
