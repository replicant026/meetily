'use client';

import { Plus, Download } from 'lucide-react';
import { AppButton } from '@/components/ui/app-button';
import { useTranslations } from 'next-intl';

interface SidebarActionsProps {
  meetingsCount: number;
}

export function SidebarActions({ meetingsCount }: SidebarActionsProps) {
  const t = useTranslations();

  return (
    <div className="border-t border-[rgb(var(--app-border))] p-3 space-y-2">
      <AppButton
        variant="primary"
        size="md"
        className="w-full"
        onClick={() => {
          // Navigate to home and trigger recording start
          window.location.href = '/';
          sessionStorage.setItem('autoStartRecording', 'true');
        }}
      >
        <Plus className="h-4 w-4" />
        <span>New recording</span>
      </AppButton>
    </div>
  );
}
