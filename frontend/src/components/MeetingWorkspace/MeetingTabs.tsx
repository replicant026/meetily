"use client";

import { useState } from 'react';
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

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as MeetingWorkspaceTab)}
      className="flex flex-col h-full"
    >
      <TabsList className="mx-4 mt-3">
        <TabsTrigger value="transcript">Transcript</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
        <TabsTrigger value="actions">Actions</TabsTrigger>
        <TabsTrigger value="summary">Summary</TabsTrigger>
      </TabsList>

      <div className="flex-1 min-h-0 overflow-auto">
        <TabsContent value="transcript" className="h-full mt-0">
          {transcriptContent}
        </TabsContent>
        <TabsContent value="notes" className="h-full mt-0">
          {notesContent ?? (
            <div className="p-6 text-stone-400 text-sm">No notes yet.</div>
          )}
        </TabsContent>
        <TabsContent value="actions" className="h-full mt-0">
          {actionsContent ?? (
            <div className="p-6 text-stone-400 text-sm">No action items.</div>
          )}
        </TabsContent>
        <TabsContent value="summary" className="h-full mt-0">
          {summaryContent}
        </TabsContent>
      </div>
    </Tabs>
  );
}
