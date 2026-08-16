import { describe, expect, it } from 'vitest';
import { groupMeetingsByDate, type MeetingDirectoryItem } from '@/lib/meeting-directory';

function item(id: string, date: string): MeetingDirectoryItem {
  return {
    id,
    title: `Meeting ${id}`,
    createdAt: date,
    updatedAt: date,
    durationSeconds: null,
    transcriptSegmentCount: 0,
    hasSummary: false,
    recordingState: 'ready',
  };
}

describe('groupMeetingsByDate', () => {
  it('groups meetings into today, last seven days and older in local time', () => {
    const now = new Date('2026-07-22T16:00:00-04:00');
    const groups = groupMeetingsByDate(
      [
        item('today', '2026-07-22T12:00:00-04:00'),
        item('week', '2026-07-18T12:00:00-04:00'),
        item('old', '2026-06-01T12:00:00-04:00'),
      ],
      now,
    );

    expect(groups.today.map(({ id }) => id)).toEqual(['today']);
    expect(groups.last7Days.map(({ id }) => id)).toEqual(['week']);
    expect(groups.older.map(({ id }) => id)).toEqual(['old']);
  });

  it('handles empty input', () => {
    const groups = groupMeetingsByDate([]);
    expect(groups.today).toEqual([]);
    expect(groups.last7Days).toEqual([]);
    expect(groups.older).toEqual([]);
  });
});
