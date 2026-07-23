import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeetingTimeline } from '@/components/MeetingWorkspace/MeetingTimeline';

const audioFixture = {
  isPlaying: false,
  currentTime: 0,
  duration: 120,
  toggle: vi.fn(),
  seek: vi.fn(),
};

const segments = [
  { id: 's1', speaker: 'Speaker A', start_time: 0, end_time: 30 },
  { id: 's2', speaker: 'Speaker B', start_time: 30, end_time: 60 },
];

describe('MeetingTimeline', () => {
  it('seeks shared audio when the waveform is clicked', async () => {
    const seek = vi.fn();
    const user = userEvent.setup();
    render(<MeetingTimeline audio={{ ...audioFixture, seek }} peaks={new Float32Array([0.1, 1])} segments={segments} />);
    await user.click(screen.getByLabelText(/audio timeline/i), { clientX: 150 });
    expect(seek).toHaveBeenCalledWith(expect.any(Number));
  });
});
