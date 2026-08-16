'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { SidebarNavigation } from './SidebarNavigation';
import { SidebarActions } from './SidebarActions';
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
    <div className="flex h-dvh overflow-hidden bg-[rgb(var(--app-bg))]">
      {/* Left sidebar rail — compact 64px icon rail */}
      <aside className="flex w-16 shrink-0 flex-col items-center border-r border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]">
        {/* Navigation links */}
        <nav aria-label="Main Navigation" className="w-full p-2">
          <SidebarNavigation />
        </nav>

        {/* Spacer pushes actions to bottom */}
        <div className="flex-1" />

        {/* Actions: new recording, import, etc. */}
        <div className="w-full p-2">
          <SidebarActions meetingsCount={directory.meetings.length} />
        </div>
      </aside>

      {/* Search dialog */}
      <SidebarSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Main content area */}
      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
    </div>
  );
}


