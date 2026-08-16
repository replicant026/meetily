import { invoke } from '@tauri-apps/api/core';

export type MeetingGroup = 'today' | 'last7Days' | 'older';

export interface MeetingDirectoryItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string | null;
  durationSeconds: number | null;
  transcriptSegmentCount: number;
  hasSummary: boolean;
  recordingState: 'recording' | 'processing' | 'ready' | 'failed' | 'unknown';
}

export interface MeetingDirectoryState {
  meetings: MeetingDirectoryItem[];
  isLoading: boolean;
  error: string | null;
  refetch(): Promise<void>;
}

/**
 * Fetch meeting directory from the Tauri core.
 */
export async function listHomeMeetings(limit = 50): Promise<MeetingDirectoryItem[]> {
  return invoke<MeetingDirectoryItem[]>('list_home_meetings', { limit });
}

/**
 * Group meetings into Today, Last 7 Days, and Older using local calendar boundaries.
 */
export function groupMeetingsByDate(
  items: MeetingDirectoryItem[],
  now: Date = new Date(),
): Record<MeetingGroup, MeetingDirectoryItem[]> {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const groups: Record<MeetingGroup, MeetingDirectoryItem[]> = {
    today: [],
    last7Days: [],
    older: [],
  };

  for (const item of items) {
    const date = new Date(item.updatedAt ?? item.createdAt);
    if (date >= todayStart) {
      groups.today.push(item);
    } else if (date >= sevenDaysAgo) {
      groups.last7Days.push(item);
    } else {
      groups.older.push(item);
    }
  }

  return groups;
}
