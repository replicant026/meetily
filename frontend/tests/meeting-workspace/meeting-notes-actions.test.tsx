import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeetingNotesTab } from '@/components/MeetingWorkspace/MeetingNotesTab';
import { MeetingActionsTab } from '@/components/MeetingWorkspace/MeetingActionsTab';

// Mock the storage module
vi.mock('@/lib/meeting-workspace-storage', () => ({
  getMeetingNote: vi.fn().mockResolvedValue(''),
  saveMeetingNote: vi.fn().mockResolvedValue(undefined),
  getMeetingActionStates: vi.fn().mockResolvedValue({}),
  setMeetingActionCompleted: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { saveMeetingNote, setMeetingActionCompleted } from '@/lib/meeting-workspace-storage';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MeetingNotesTab', () => {
  it('debounces note persistence', async () => {
    const user = userEvent.setup();
    render(<MeetingNotesTab meetingId="m-1" />);
    await user.type(screen.getByRole('textbox', { name: /meeting notes/i }), 'Decision: ship Friday');
    await waitFor(() => expect(saveMeetingNote).toHaveBeenCalledWith('m-1', expect.stringContaining('Decision: ship Friday')), { timeout: 2000 });
  });
});

describe('MeetingActionsTab', () => {
  it('stores action completion without editing summary content', async () => {
    const user = userEvent.setup();
    render(<MeetingActionsTab meetingId="m-1" actions={[{ id: 'summary:action_items:0', text: 'Send proposal', assigneeId: null, completed: false }]} />);
    await user.click(screen.getByRole('checkbox', { name: /send proposal/i }));
    expect(setMeetingActionCompleted).toHaveBeenCalledWith('m-1', 'summary:action_items:0', true);
  });
});
