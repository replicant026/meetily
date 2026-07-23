'use client';

import { type ReactNode, useCallback, useEffect, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SidebarNavigation } from './SidebarNavigation';
import { SidebarActions } from './SidebarActions';
import { SidebarMeetingList } from './SidebarMeetingList';
import { SidebarSearchDialog } from './SidebarSearchDialog';
import { useMeetingDirectory } from '@/hooks/useMeetingDirectory';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const directory = useMeetingDirectory();
  const [searchOpen, setSearchOpen] = useState(false);

  // Ctrl/Cmd+K to open search
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setSearchOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex h-screen bg-[rgb(var(--app-bg))]">
      {/* Left sidebar rail */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]">
        {/* Navigation links */}
        <div className="p-2">
          <SidebarNavigation />
        </div>

        {/* Recent meetings list */}
        <Suspense>
          <SidebarMeetingListSuspense meetings={directory.meetings} />
        </Suspense>

        {/* Actions: new recording, import, etc. */}
        <SidebarActions meetingsCount={directory.meetings.length} />
      </aside>

      {/* Search dialog */}
      <SidebarSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

/**
 * Inner component that uses useSearchParams (must be wrapped in Suspense).
 * Extracted to avoid requiring Suspense around the entire AppShell.
 */
function SidebarMeetingListSuspense({ meetings }: { meetings: ReturnType<typeof useMeetingDirectory>['meetings'] }) {
  const searchParams = useSearchParams();
  const currentMeetingId = searchParams.get('id') ?? undefined;
  return <SidebarMeetingList meetings={meetings} currentMeetingId={currentMeetingId} />;
}
