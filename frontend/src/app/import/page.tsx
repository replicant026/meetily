'use client';

import { useTranslations } from 'next-intl';
import { Upload } from 'lucide-react';
import { useImportDialog } from '@/contexts/ImportDialogContext';

export default function ImportPage() {
  const t = useTranslations('home');
  const { openImportDialog } = useImportDialog();

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="max-w-md space-y-4">
        <div className="flex justify-center">
          <div className="rounded-full bg-[rgb(var(--app-surface))] p-4">
            <Upload className="h-8 w-8 text-[rgb(var(--app-muted-fg))]" />
          </div>
        </div>

        <h1 className="text-xl font-semibold text-[rgb(var(--app-fg))]">
          {t('importRecording')}
        </h1>

        <p className="text-sm text-[rgb(var(--app-muted-fg))]">
          {t('importDescription')}
        </p>

        <button
          onClick={() => openImportDialog()}
          className="inline-flex items-center gap-2 rounded-md bg-[rgb(var(--app-primary))] px-4 py-2 text-sm font-medium text-[rgb(var(--app-primary-fg))] hover:opacity-90 transition-opacity"
        >
          <Upload className="h-4 w-4" />
          {t('importFile')}
        </button>
      </div>
    </div>
  );
}
