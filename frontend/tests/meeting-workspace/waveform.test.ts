import { describe, expect, it } from 'vitest';
import { bucketPeaks, secondsFromPointer } from '@/components/MeetingWorkspace/waveform';

describe('bucketPeaks', () => {
  it('returns one normalized peak per display column', () => {
    expect([...bucketPeaks(new Float32Array([0, -0.5, 1, 0.25]), 2)]).toEqual([0.5, 1]);
  });
});

describe('secondsFromPointer', () => {
  it('clamps seeking to duration', () => {
    expect(secondsFromPointer(250, { left: 100, width: 100 } as DOMRect, 60)).toBe(60);
  });
});
