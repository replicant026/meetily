'use client';

import { type ReactNode } from 'react';
import { SidebarNavigation } from './SidebarNavigation';
import { SidebarActions } from './SidebarActions';
import { useMeetingDirectory } from '@/hooks/useMeetingDirectory';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const directory = useMeetingDirectory();

  return (
    <div className="flex h-screen bg-[rgb(var(--app-bg))]">
      {/* Left sidebar rail */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]">
        {/* Navigation links */}
        <div className="flex-1 overflow-y-auto p-2">
          <SidebarNavigation />
        </div>

        {/* Actions: new recording, import, etc. */}
        <SidebarActions meetingsCount={directory.meetings.length} />
      </aside>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
