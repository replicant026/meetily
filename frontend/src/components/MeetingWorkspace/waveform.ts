export function bucketPeaks(samples: Float32Array, width: number): Float32Array {
  const peaks = new Float32Array(Math.max(1, width));
  const bucketSize = Math.ceil(samples.length / peaks.length);
  for (let bucket = 0; bucket < peaks.length; bucket += 1) {
    for (let sample = bucket * bucketSize; sample < Math.min(samples.length, (bucket + 1) * bucketSize); sample += 1) {
      peaks[bucket] = Math.max(peaks[bucket], Math.abs(samples[sample]));
    }
  }
  return peaks;
}

export function secondsFromPointer(clientX: number, rect: DOMRect, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0 || rect.width <= 0) return 0;
  return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
}
