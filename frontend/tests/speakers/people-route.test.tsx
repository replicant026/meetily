import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PeoplePage from '@/app/people/page';

// ── Mocks ────────────────────────────────────────────────────────────────

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

const pendingCountFn = vi.fn().mockResolvedValue(0);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string) => {
    switch (cmd) {
      case 'list_speaker_people':
        return Promise.resolve([]);
      case 'get_speaker_recognition_preferences':
        return Promise.resolve({
          recognitionMode: 'off',
          lockAudioChannels: false,
          minimumReferenceQuality: 0.5,
        });
      case 'set_speaker_recognition_preferences':
        return Promise.resolve(undefined);
      case 'count_pending_speaker_suggestions':
        return pendingCountFn();
      default:
        return Promise.reject(new Error(`Unknown command: ${cmd}`));
    }
  },
}));

vi.mock('lucide-react', async () => {
  const actual = await vi.importActual<typeof import('lucide-react')>('lucide-react');
  return { ...actual };
});

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' '),
}));

// ── Tests ────────────────────────────────────────────────────────────────

describe('People route', () => {
  beforeEach(() => {
    pendingCountFn.mockReset();
    pendingCountFn.mockResolvedValue(0);
  });

  it('shows People as a dedicated route with directory', async () => {
    render(<PeoplePage />);

    // Both page heading and SpeakerDirectory heading render the i18n key
    const headings = await screen.findAllByRole('heading');
    expect(headings.length).toBeGreaterThanOrEqual(2);
    expect(headings.some((h) => h.textContent?.includes('directory.title'))).toBe(true);
  });

  it('renders the SpeakerDirectory search UI', async () => {
    render(<PeoplePage />);

    // Search input from SpeakerDirectory
    expect(screen.getByPlaceholderText('directory.search_placeholder')).toBeVisible();
  });

  it('shows review banner when there are pending voice prints', async () => {
    pendingCountFn.mockResolvedValue(3);

    render(<PeoplePage />);

    // Wait for the async count to load — mock returns raw i18n key with replacement
    const banner = await screen.findByText(/review_queue\.pending_count/);
    expect(banner).toBeVisible();
    // The amber-50 background banner container
    expect(banner.closest('.bg-amber-50')).toBeTruthy();
  });

  it('hides review banner when no pending voice prints', async () => {
    pendingCountFn.mockResolvedValue(0);

    render(<PeoplePage />);

    // Give async settle time
    await new Promise((r) => setTimeout(r, 10));

    expect(screen.queryByText(/review_queue\.pending_count/)).toBeNull();
  });
});
