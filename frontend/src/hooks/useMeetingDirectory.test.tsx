import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMeetingDirectory } from '@/hooks/useMeetingDirectory';

const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

function makeItem(id: string) {
  return {
    id,
    title: `Meeting ${id}`,
    createdAt: '2026-07-22T12:00:00Z',
    updatedAt: null,
    durationSeconds: null,
    transcriptSegmentCount: 0,
    hasSummary: false,
    recordingState: 'ready',
  };
}

describe('useMeetingDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads meetings from the native Tauri command and exposes refetch', async () => {
    mockInvoke.mockResolvedValue([makeItem('m1')]);
    const { result } = renderHook(() => useMeetingDirectory());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockInvoke).toHaveBeenCalledWith('list_home_meetings', { limit: 50 });
    expect(result.current.meetings[0].id).toBe('m1');
    expect(result.current.error).toBeNull();
  });

  it('exposes error state on failure', async () => {
    mockInvoke.mockRejectedValue(new Error('DB unavailable'));
    const { result } = renderHook(() => useMeetingDirectory());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('DB unavailable');
    expect(result.current.meetings).toEqual([]);
  });
});
