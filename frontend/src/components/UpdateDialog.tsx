'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Download, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { AppDialog } from './ui/app-dialog';
import { AppButton } from './ui/app-button';
import { UpdateInfo, UpdateProgress } from '@/services/updateService';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { redactLocalPaths } from '@/lib/ui-state';

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updateInfo: UpdateInfo | null;
}

export function UpdateDialog({ open, onOpenChange, updateInfo }: UpdateDialogProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations('settings');
  const [update, setUpdate] = useState<Update | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open && updateInfo?.available) {
      setIsDownloading(false);
      setProgress(null);
      setError(null);

      check().then((updateResult) => {
        if (updateResult?.available) {
          setUpdate(updateResult);
        } else {
          setError(t('update.no_longer'));
        }
      }).catch((err) => {
        console.error('Failed to get update object:', err);
        setError(redactLocalPaths(t('update.prepare_failed', { message: err.message || 'Unknown error' })));
      });
    } else {
      setIsDownloading(false);
      setProgress(null);
      setError(null);
      setUpdate(null);
    }
  }, [open, updateInfo, t]);

  const handleDownloadAndInstall = async () => {
    let updateToUse: Update | null = update;
    if (!updateToUse) {
      try {
        const updateResult = await check();
        if (updateResult?.available) {
          updateToUse = updateResult;
          setUpdate(updateResult);
        } else {
          setError(t('update.not_available'));
          return;
        }
      } catch (err: any) {
        setError(redactLocalPaths(t('update.get_failed', { message: err.message || 'Unknown error' })));
        return;
      }
    }

    if (!updateToUse) return;

    setIsDownloading(true);
    setError(null);
    setProgress({ downloaded: 0, total: 0, percentage: 0 });

    try {
      let downloaded = 0;
      let contentLength = 0;

      await updateToUse.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            setProgress({ downloaded: 0, total: contentLength, percentage: 0 });
            break;
          case 'Progress':
            downloaded += event.data.chunkLength || 0;
            const percentage = contentLength > 0
              ? Math.round((downloaded / contentLength) * 100)
              : 0;
            setProgress({ downloaded, total: contentLength, percentage });
            break;
          case 'Finished':
            setProgress({ downloaded: contentLength, total: contentLength, percentage: 100 });
            break;
        }
      });

      toast.success(t('update.installed_toast'));
      setIsDownloading(false);
      onOpenChange(false);
      await relaunch();
    } catch (err: any) {
      console.error('Update failed:', err);
      setError(redactLocalPaths(err.message || 'Failed to download or install update'));
      setIsDownloading(false);
      toast.error(t('update.failed_toast', { message: err.message || 'Unknown error' }));
    }
  };

  const handleRetry = () => {
    setError(null);
    handleDownloadAndInstall();
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try { return new Date(dateString).toLocaleDateString(); }
    catch { return dateString; }
  };

  // Prevent closing while downloading
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && isDownloading) return;
    onOpenChange(newOpen);
  };

  // Return focus to trigger when dialog closes
  useEffect(() => {
    if (!open && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [open]);

  if (!updateInfo?.available) return null;

  const dialogTitle = isDownloading
    ? t('update.downloading_title')
    : error
    ? t('update.error_title')
    : t('update.available_title');

  const dialogDescription = isDownloading
    ? t('update.downloading_desc')
    : error
    ? t('update.error_desc')
    : t('update.available_desc', { version: updateInfo.version ?? '' });

  return (
    <AppDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={dialogTitle}
      description={dialogDescription}
      className="sm:max-w-[500px]"
      footer={
        <>
          {error && (
            <>
              <AppButton variant="primary" size="sm" onClick={handleRetry}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Retry
              </AppButton>
              <AppButton variant="quiet" size="sm" onClick={() => onOpenChange(false)}>
                {t('update.close')}
              </AppButton>
            </>
          )}
          {!isDownloading && !error && (
            <>
              <AppButton variant="quiet" size="sm" onClick={() => onOpenChange(false)}>
                {t('update.later')}
              </AppButton>
              <AppButton variant="primary" size="sm" onClick={handleDownloadAndInstall}>
                <Download className="h-3.5 w-3.5 mr-1" />
                {t('update.download_install')}
              </AppButton>
            </>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {!isDownloading && !error && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('update.current_version')}</span>
              <span className="font-medium">{updateInfo.currentVersion}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('update.new_version')}</span>
              <span className="font-medium text-blue-600">{updateInfo.version}</span>
            </div>
            {updateInfo.date && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('update.release_date')}</span>
                <span className="font-medium">{formatDate(updateInfo.date)}</span>
              </div>
            )}
            {updateInfo.body && (
              <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {updateInfo.body}
                </p>
              </div>
            )}
          </div>
        )}

        {isDownloading && progress && (
          <div className="space-y-2">
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.min(progress.percentage, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-600">
              <span>{t('update.percent_complete', { percent: Math.round(progress.percentage) })}</span>
              {progress.total > 0 && (
                <span>{formatBytes(progress.downloaded)} / {formatBytes(progress.total)}</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground text-center">
              {t('update.will_restart')}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}
      </div>
    </AppDialog>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
