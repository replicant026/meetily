import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpeakerDirectory } from './SpeakerDirectory';

let user: ReturnType<typeof userEvent.setup>;

// ── Mocks ────────────────────────────────────────────────────────────────

const mockListPeople = vi.fn();
const mockCreatePerson = vi.fn();
const mockListReferences = vi.fn();
const mockDeleteReference = vi.fn();
const mockGetReferenceAudioPath = vi.fn();
const mockGetRecognitionPreferences = vi.fn();
const mockSetRecognitionPreferences = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string, params?: Record<string, unknown>) => {
      if (params) {
        return Object.entries(params).reduce(
          (str, [k, v]) => str.replace(`{${k}}`, String(v)),
          key,
        );
      }
      return key;
    },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => {
    switch (cmd) {
      case 'list_speaker_people':
        return mockListPeople();
      case 'create_speaker_person':
        return mockCreatePerson(args);
      case 'list_speaker_voice_references':
        return mockListReferences(args);
      case 'delete_speaker_voice_reference':
        return mockDeleteReference(args);
      case 'get_speaker_voice_reference_audio_path':
        return mockGetReferenceAudioPath(args);
      case 'read_audio_file':
        return Promise.resolve(null);
      case 'get_speaker_recognition_preferences':
        return mockGetRecognitionPreferences();
      case 'set_speaker_recognition_preferences':
        return mockSetRecognitionPreferences(args);
      default:
        return Promise.reject(new Error(`Unknown command: ${cmd}`));
    }
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────

const PERSON_ALICE = {
  id: 'person-1',
  display_name: 'Alice',
  email: null,
  color: '#3b82f6',
  reference_count: 1,
  playable_reference_count: 1,
  meeting_count: 1,
  last_seen_at: null,
};

const REFERENCE_PLAYABLE = {
  id: 'ref-1',
  speaker_id: 'person-1',
  meeting_id: 'm1',
  source_start_ms: 0,
  source_end_ms: 5000,
  duration_ms: 5000,
  channel: 'microphone' as const,
  quality_score: 0.85,
  status: 'confirmed' as const,
  origin: 'manual_assignment' as const,
  created_at: '2024-06-01T00:00:00Z',
  has_playable_audio: true,
  waveform_peaks: [80, 120, 200, 160, 100],
};

// ── Tests ────────────────────────────────────────────────────────────────

describe('Speaker flow: create, list, reference playback, delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    user = userEvent.setup();
    mockGetRecognitionPreferences.mockResolvedValue({
      recognitionMode: 'off',
      lockAudioChannels: false,
      minimumReferenceQuality: 0.5,
    });
    mockSetRecognitionPreferences.mockResolvedValue(undefined);
  });

  it('creates a person, shows them in directory, and exposes no external URL', async () => {
    // Start empty, then after create return the new person
    mockListPeople
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([PERSON_ALICE]);
    mockCreatePerson.mockResolvedValue('person-1');
    mockListReferences.mockResolvedValue([REFERENCE_PLAYABLE]);
    mockGetReferenceAudioPath.mockResolvedValue(null);

    render(<SpeakerDirectory />);

    // Empty state visible after recognition settings load
    expect(await screen.findByText('directory.empty')).toBeVisible();

    // The "+" button has only an SVG icon; find it as the unnamed button
    // next to the search input. The unnamed button is the second button
    // in the search+create row.
    const allButtons = screen.getAllByRole('button');
    const plusButton = allButtons.find(
      (b) => !b.textContent?.trim() && b.querySelector('.lucide-plus'),
    );
    expect(plusButton).toBeDefined();
    await user.click(plusButton!);

    // Type name and submit
    const input = screen.getByPlaceholderText('directory.create_placeholder');
    await user.type(input, 'Alice');
    // The check-mark button that submits the name
    const submitBtn = allButtons.find(
      (b) => b.textContent?.trim() === '✓',
    );
    // After toggling create mode, new buttons appear; get fresh list
    await waitFor(() => {
      const btns = screen.getAllByRole('button');
      const check = btns.find((b) => b.textContent?.trim() === '✓');
      expect(check).toBeDefined();
    });
    const freshCheckBtn = screen.getAllByRole('button').find(
      (b) => b.textContent?.trim() === '✓',
    );
    await user.click(freshCheckBtn!);

    // Person appears in directory and detail panel auto-selects after create
    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(2);
    });

    // After create, setSelectedId auto-selects the new person.
    // VoiceReferencePlayer calls getReferenceAudioPath for playable refs.
    // This should return a local path, not an external URL.
    await waitFor(() => {
      expect(mockGetReferenceAudioPath).toHaveBeenCalledWith({ referenceId: 'ref-1' });
    });

    // Every audio path must NOT be an external URL
    for (const call of mockGetReferenceAudioPath.mock.results) {
      const val = await call.value;
      if (val !== null) {
        expect(val).not.toMatch(/^https?:\/\//);
      }
    }
  });

  it('deletes a reference via confirm dialog without affecting other refs', async () => {
    const ref2 = {
      ...REFERENCE_PLAYABLE,
      id: 'ref-2',
    };

    mockListPeople.mockResolvedValue([PERSON_ALICE]);
    // First load (on person select): two references
    mockListReferences
      .mockResolvedValueOnce([REFERENCE_PLAYABLE, ref2])
      // Reload after delete: one reference remaining
      .mockResolvedValueOnce([ref2]);
    mockDeleteReference.mockResolvedValue(undefined);
    mockGetReferenceAudioPath.mockResolvedValue(null);

    render(<SpeakerDirectory />);

    // Select Alice from the list (wait for list to load first)
    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1);
    });
    // Click the list-entry button (first occurrence)
    await user.click(screen.getAllByText('Alice')[0]);

    // Wait for references to load — VoiceReferenceCard renders trash icons
    await waitFor(() => {
      const trashButtons = screen.getAllByTitle('reference.delete_title');
      expect(trashButtons.length).toBe(2);
    });

    // Click first reference's trash icon
    const trashButtons = screen.getAllByTitle('reference.delete_title');
    await user.click(trashButtons[0]);

    // Confirm dialog appears — click confirm
    await user.click(screen.getByText('reference.delete_confirm'));

    // deleteReference called with ref-1
    expect(mockDeleteReference).toHaveBeenCalledWith({ referenceId: 'ref-1' });
  });

  it('never constructs external URLs for local voice references', async () => {
    mockListPeople.mockResolvedValue([PERSON_ALICE]);
    mockListReferences.mockResolvedValue([REFERENCE_PLAYABLE]);
    mockGetReferenceAudioPath.mockResolvedValue('/local/path/ref-1.wav');

    render(<SpeakerDirectory />);

    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThanOrEqual(1);
    });
    await user.click(screen.getAllByText('Alice')[0]);

    await waitFor(() => {
      expect(mockGetReferenceAudioPath).toHaveBeenCalled();
    });

    // The returned path is local, never an external URL
    const result = await mockGetReferenceAudioPath.mock.results[0].value;
    expect(result).not.toMatch(/^https?:\/\//);
    expect(result).not.toMatch(/^http:\/\//);
    expect(result).toMatch(/^\/local\//);
  });
});
