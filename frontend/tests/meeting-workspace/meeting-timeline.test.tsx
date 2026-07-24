import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeetingTimeline } from '@/components/MeetingWorkspace/MeetingTimeline';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

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
  it('draws waveform bars upward from a bottom baseline', () => {
    const fillRect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      scale: vi.fn(),
      clearRect: vi.fn(),
      fillRect,
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 64,
    } as DOMRect);

    render(<MeetingTimeline audio={audioFixture} peaks={new Float32Array([0.5])} />);

    const [, y, , height] = fillRect.mock.calls[0];
    expect(y + height).toBe(61);
  });

  it('seeks shared audio when the waveform is clicked', async () => {
    const seek = vi.fn();
    const user = userEvent.setup();
    render(<MeetingTimeline audio={{ ...audioFixture, seek }} peaks={new Float32Array([0.1, 1])} segments={segments} />);
    await user.click(screen.getByLabelText(/audioTimeline/i), { clientX: 150 });
    expect(seek).toHaveBeenCalledWith(expect.any(Number));
  });
});
