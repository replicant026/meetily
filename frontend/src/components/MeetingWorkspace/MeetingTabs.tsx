"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { MeetingWorkspaceTab } from './types';

interface MeetingTabsProps {
  transcriptContent?: React.ReactNode;
  summaryContent?: React.ReactNode;
  notesContent?: React.ReactNode;
  actionsContent?: React.ReactNode;
}

export function MeetingTabs({
  transcriptContent,
  summaryContent,
  notesContent,
  actionsContent,
}: MeetingTabsProps) {
  const [activeTab, setActiveTab] = useState<MeetingWorkspaceTab>('transcript');
  const t = useTranslations('meetingWorkspace');

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as MeetingWorkspaceTab)}
      className="flex flex-col h-full"
    >
      <TabsList className="mx-6 mt-4 h-10 w-fit rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-1">
        <TabsTrigger className="px-4 text-sm font-medium text-stone-600 data-[state=active]:bg-[rgb(var(--app-bg))] data-[state=active]:text-stone-900 data-[state=active]:shadow-sm" value="transcript">{t('transcript')}</TabsTrigger>
        <TabsTrigger className="px-4 text-sm font-medium text-stone-600 data-[state=active]:bg-[rgb(var(--app-bg))] data-[state=active]:text-stone-900 data-[state=active]:shadow-sm" value="notes">{t('notes')}</TabsTrigger>
        <TabsTrigger className="px-4 text-sm font-medium text-stone-600 data-[state=active]:bg-[rgb(var(--app-bg))] data-[state=active]:text-stone-900 data-[state=active]:shadow-sm" value="actions">{t('actions')}</TabsTrigger>
        <TabsTrigger className="px-4 text-sm font-medium text-stone-600 data-[state=active]:bg-[rgb(var(--app-bg))] data-[state=active]:text-stone-900 data-[state=active]:shadow-sm" value="summary">{t('summary')}</TabsTrigger>
      </TabsList>

      <div className="flex-1 min-h-0 overflow-auto">
        <TabsContent value="transcript" className="h-full mt-0">
          {transcriptContent}
        </TabsContent>
        <TabsContent value="notes" className="h-full mt-0">
          {notesContent ?? (
            <div className="p-6 text-stone-400 text-sm">{t('notesPlaceholder')}</div>
          )}
        </TabsContent>
        <TabsContent value="actions" className="h-full mt-0">
          {actionsContent ?? (
            <div className="p-6 text-stone-400 text-sm">{t('noActionItems')}</div>
          )}
        </TabsContent>
        <TabsContent value="summary" className="h-full mt-0">
          {summaryContent}
        </TabsContent>
      </div>
    </Tabs>
  );
}
