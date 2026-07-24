import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpeakerDirectory } from './SpeakerDirectory';

let user: ReturnType<typeof userEvent.setup>;

// ── Browser API mocks ────────────────────────────────────────────────────
Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });

// ── Mocks ────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

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

// ── Tests ────────────────────────────────────────────────────────────────

describe('Speaker flow: create, list, navigate', () => {
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

  it('creates a person and shows them in the directory list', async () => {
    // Start empty, then after create return the new person
    mockListPeople
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([PERSON_ALICE]);
    mockCreatePerson.mockResolvedValue('person-1');

    render(<SpeakerDirectory />);

    // Empty state visible
    expect(await screen.findByText('directory.empty')).toBeVisible();

    // The "+" button has only an SVG icon; find it as the unnamed button
    const allButtons = screen.getAllByRole('button');
    const plusButton = allButtons.find(
      (b) => !b.textContent?.trim() && b.querySelector('.lucide-plus'),
    );
    expect(plusButton).toBeDefined();
    await user.click(plusButton!);

    // Type name and submit
    const input = screen.getByPlaceholderText('directory.create_placeholder');
    await user.type(input, 'Alice');

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

    // Person appears in directory list (single occurrence now — no inline detail)
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeVisible();
    });
  });

  it('navigates to /people/<id> when a person is clicked', async () => {
    mockListPeople.mockResolvedValue([PERSON_ALICE]);

    render(<SpeakerDirectory />);

    // Wait for people to load
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeVisible();
    });

    // Click the person button
    const aliceButton = screen.getByText('Alice').closest('button');
    expect(aliceButton).toBeDefined();
    await user.click(aliceButton!);

    // Should navigate to the person's detail route
    expect(mockPush).toHaveBeenCalledWith('/people/person-1');
  });

  it('renders empty state when no people exist', async () => {
    mockListPeople.mockResolvedValue([]);

    render(<SpeakerDirectory />);

    expect(await screen.findByText('directory.empty')).toBeVisible();
    expect(screen.getByText('directory.empty_hint')).toBeVisible();
  });
});
