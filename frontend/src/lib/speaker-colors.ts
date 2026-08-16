/**
 * Fixed palette of 10 distinct speaker colors.
 * Assigned by order of appearance: Speaker 1 = blue, Speaker 2 = green, etc.
 * Each color has bg (light), text (dark), and border variants for the label badge.
 */

export interface SpeakerColor {
  bg: string;
  text: string;
  border: string;
  backgroundColor: string;
  foregroundColor: string;
  /** For the accent dot / waveform */
  accent: string;
}

const PALETTE: SpeakerColor[] = [
  { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', backgroundColor: '#eff6ff', foregroundColor: '#1d4ed8', accent: '#3b82f6' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', backgroundColor: '#ecfdf5', foregroundColor: '#047857', accent: '#10b981' },
  { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', backgroundColor: '#f5f3ff', foregroundColor: '#6d28d9', accent: '#8b5cf6' },
  { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', backgroundColor: '#fffbeb', foregroundColor: '#b45309', accent: '#f59e0b' },
  { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', backgroundColor: '#fff1f2', foregroundColor: '#be123c', accent: '#f43f5e' },
  { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', backgroundColor: '#ecfeff', foregroundColor: '#0e7490', accent: '#06b6d4' },
  { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', backgroundColor: '#fff7ed', foregroundColor: '#c2410c', accent: '#f97316' },
  { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', backgroundColor: '#eef2ff', foregroundColor: '#4338ca', accent: '#6366f1' },
  { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200', backgroundColor: '#fdf2f8', foregroundColor: '#be185d', accent: '#ec4899' },
  { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', backgroundColor: '#f0fdfa', foregroundColor: '#0f766e', accent: '#14b8a6' },
];

/**
 * Get color for a speaker by their label (e.g., "Speaker 1", "Speaker 2").
 * Falls back to index-based assignment. Wraps around if > 10 speakers.
 */
export function getSpeakerColor(speakerLabel: string): SpeakerColor {
  // Try to extract the number from "Speaker N"
  const match = speakerLabel.match(/(\d+)/);
  const index = match ? (parseInt(match[1], 10) - 1) : 0;
  return PALETTE[Math.abs(index) % PALETTE.length];
}

/**
 * Get color by a 0-based index (for ordered lists).
 */
export function getSpeakerColorByIndex(index: number): SpeakerColor {
  return PALETTE[Math.abs(index) % PALETTE.length];
}

/**
 * Build a stable speaker→color map from segment order.
 * Assigns colors by first-appearance order, so renamed speakers keep their color.
 * Pass `customSpeakerNames` to use display names as keys.
 */
export function buildSpeakerColorMap(
  segments: Array<{ speaker?: string | null }>,
  customSpeakerNames?: Record<string, string>,
): Map<string, SpeakerColor> {
  const map = new Map<string, SpeakerColor>();
  let colorIndex = 0;
  for (const seg of segments) {
    const key = seg.speaker ?? '';
    if (!key || map.has(key)) continue;
    map.set(key, PALETTE[colorIndex % PALETTE.length]);
    colorIndex++;
  }
  return map;
}

/**
 * All available colors for reference.
 */
export const SPEAKER_PALETTE = PALETTE;
