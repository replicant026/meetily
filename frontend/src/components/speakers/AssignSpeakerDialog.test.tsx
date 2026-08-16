import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssignSpeakerDialog } from '@/components/speakers/AssignSpeakerDialog';

const user = userEvent.setup();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    // Return the key itself so we can assert on button labels by regex
    if (params) {
      return Object.entries(params).reduce(
        (str, [k, v]) => str.replace(`{${k}}`, String(v)),
        key,
      );
    }
    return key;
  },
}));

// Mock the Tauri invoke
const mockListPeople = vi.fn();
const mockCreatePerson = vi.fn();
const mockAssignMeetingSpeaker = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === 'list_speaker_people') return mockListPeople();
    if (cmd === 'create_speaker_person') return mockCreatePerson(args);
    if (cmd === 'assign_meeting_speaker') return mockAssignMeetingSpeaker(args);
    return Promise.reject(new Error(`Unknown command: ${cmd}`));
  },
}));

// Stub sonner toast
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('AssignSpeakerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPeople.mockResolvedValue([
      {
        id: 'ana',
        display_name: 'Ana',
        email: null,
        color: '#3b82f6',
        reference_count: 3,
        playable_reference_count: 2,
        meeting_count: 5,
        last_seen_at: null,
      },
      {
        id: 'bob',
        display_name: 'Bob',
        email: null,
        color: '#10b981',
        reference_count: 0,
        playable_reference_count: 0,
        meeting_count: 2,
        last_seen_at: null,
      },
    ]);
    mockAssignMeetingSpeaker.mockResolvedValue({
      speakerId: 'ana',
      segmentIds: ['s1', 's2'],
      referenceCreated: true,
    });
    mockCreatePerson.mockResolvedValue('new-id');
  });

  it('renders people list when open', async () => {
    render(
      <AssignSpeakerDialog
        meetingId="m1"
        sourceLabel="Speaker 2"
        segmentIds={['s1', 's2']}
        open={true}
        onClose={vi.fn()}
        onAssigned={vi.fn()}
      />,
    );

    expect(await screen.findByRole('option', { name: /Ana/ })).toBeVisible();
    expect(screen.getByRole('option', { name: /Bob/ })).toBeVisible();
  });

  it('requires confirmation before teaching a voice from transcript segments', async () => {
    render(
      <AssignSpeakerDialog
        meetingId="m1"
        sourceLabel="Speaker 2"
        segmentIds={['s1', 's2']}
        open={true}
        onClose={vi.fn()}
        onAssigned={vi.fn()}
      />,
    );

    // Select Ana
    await user.click(await screen.findByRole('option', { name: /Ana/ }));

    // Confirm button should be disabled until checkbox is checked
    const confirmBtn = screen.getByRole('button', { name: /confirm_button/i });
    expect(confirmBtn).toBeDisabled();

    // Check the confirmation checkbox
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    // Now click confirm
    await user.click(confirmBtn);

    expect(mockAssignMeetingSpeaker).toHaveBeenCalledWith({
      meetingId: 'm1',
      speakerId: 'ana',
      segmentIds: ['s1', 's2'],
    });
  });

  it('does not call assign when checkbox is not checked', async () => {
    render(
      <AssignSpeakerDialog
        meetingId="m1"
        sourceLabel="Speaker 2"
        segmentIds={['s1', 's2']}
        open={true}
        onClose={vi.fn()}
        onAssigned={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole('option', { name: /Ana/ }));

    const confirmBtn = screen.getByRole('button', { name: /confirm_button/i });
    expect(confirmBtn).toBeDisabled();
    expect(mockAssignMeetingSpeaker).not.toHaveBeenCalled();
  });

  it('calls onAssigned after successful assignment', async () => {
    const onAssigned = vi.fn();
    const onClose = vi.fn();

    render(
      <AssignSpeakerDialog
        meetingId="m1"
        sourceLabel="Speaker 2"
        segmentIds={['s1', 's2']}
        open={true}
        onClose={onClose}
        onAssigned={onAssigned}
      />,
    );

    await user.click(await screen.findByRole('option', { name: /Ana/ }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /confirm_button/i }));

    expect(onAssigned).toHaveBeenCalledWith('ana', ['s1', 's2']);
    expect(onClose).toHaveBeenCalled();
  });
});
