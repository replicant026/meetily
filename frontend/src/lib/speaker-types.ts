export type RecognitionMode = 'off' | 'suggest' | 'automatic';

export interface VoiceReference {
  id: string;
  speaker_id: string;
  meeting_id: string | null;
  source_start_ms: number;
  source_end_ms: number;
  duration_ms: number;
  channel: 'microphone' | 'system' | 'mixed' | 'unknown';
  quality_score: number;
  status: 'pending' | 'confirmed' | 'rejected' | 'legacy';
  origin: 'manual_assignment' | 'accepted_suggestion' | 'automatic_match' | 'legacy';
  created_at: string;
  has_playable_audio: boolean;
  waveform_peaks: number[];
}

export interface SpeakerPerson {
  id: string;
  display_name: string;
  email: string | null;
  color: string | null;
  reference_count: number;
  playable_reference_count: number;
  meeting_count: number;
  last_seen_at: string | null;
}

export interface SpeakerSuggestion {
  id: string;
  meeting_id: string;
  source_label: string;
  speaker_id: string;
  confidence: number;
  reference_id: string | null;
  segment_ids: string[];
}
