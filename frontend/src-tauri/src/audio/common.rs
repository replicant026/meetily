use crate::api::TranscriptSegment;
use anyhow::Result;
use log::{debug, info};
use once_cell::sync::Lazy;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};
use uuid::Uuid;

static ENGINE_LIFECYCLE_LOCK: Lazy<Arc<AsyncMutex<()>>> =
    Lazy::new(|| Arc::new(AsyncMutex::new(())));

pub(crate) async fn acquire_engine_lifecycle_lock() -> OwnedMutexGuard<()> {
    ENGINE_LIFECYCLE_LOCK.clone().lock_owned().await
}

/// Unload the transcription engine after a batch job (import or retranscription).
/// Skips unloading if a live recording is currently in progress, since recording
/// uses the same global engine instances.
pub(crate) async fn unload_engine_after_batch(use_parakeet: bool) {
    let _engine_lifecycle_guard = acquire_engine_lifecycle_lock().await;

    if crate::audio::recording_commands::is_recording().await {
        log::info!("Skipping model unload after batch: recording in progress");
        return;
    }

    if use_parakeet {
        use crate::parakeet_engine::commands::PARAKEET_ENGINE;
        let engine = {
            let guard = PARAKEET_ENGINE.lock().unwrap_or_else(|e| e.into_inner());
            guard.as_ref().cloned()
        };
        if let Some(e) = engine {
            e.unload_model().await;
        }
    } else {
        use crate::whisper_engine::commands::WHISPER_ENGINE;
        let engine = {
            let guard = WHISPER_ENGINE.lock().unwrap_or_else(|e| e.into_inner());
            guard.as_ref().cloned()
        };
        if let Some(e) = engine {
            e.unload_model().await;
        }
    }
}

/// Create transcript segments from transcription results.
/// Each tuple is (text, start_ms, end_ms) from VAD timestamps.
pub(crate) fn create_transcript_segments(transcripts: &[(String, f64, f64)]) -> Vec<TranscriptSegment> {
    transcripts
        .iter()
        .map(|(text, start_ms, end_ms)| {
            let start_seconds = start_ms / 1000.0;
            let end_seconds = end_ms / 1000.0;
            let duration = end_seconds - start_seconds;

            TranscriptSegment {
                id: format!("transcript-{}", Uuid::new_v4()),
                text: text.trim().to_string(),
                timestamp: chrono::Utc::now().to_rfc3339(),
                audio_start_time: Some(start_seconds),
                audio_end_time: Some(end_seconds),
                duration: Some(duration),
            }
        })
        .collect()
}

/// Write transcripts.json to a meeting folder (atomic write with temp file)
pub(crate) fn write_transcripts_json(folder: &Path, segments: &[TranscriptSegment]) -> Result<()> {
    let transcript_path = folder.join("transcripts.json");
    let temp_path = folder.join(".transcripts.json.tmp");

    let json = serde_json::json!({
        "version": "1.0",
        "last_updated": chrono::Utc::now().to_rfc3339(),
        "total_segments": segments.len(),
        "segments": segments.iter().enumerate().map(|(i, s)| {
            serde_json::json!({
                "id": s.id,
                "text": s.text,
                "timestamp": s.timestamp,
                "audio_start_time": s.audio_start_time,
                "audio_end_time": s.audio_end_time,
                "duration": s.duration,
                "sequence_id": i
            })
        }).collect::<Vec<_>>()
    });

    let json_string = serde_json::to_string_pretty(&json)?;
    std::fs::write(&temp_path, &json_string)?;
    std::fs::rename(&temp_path, &transcript_path)?;

    info!(
        "Wrote transcripts.json with {} segments to {}",
        segments.len(),
        transcript_path.display()
    );
    Ok(())
}

/// Split a long speech segment at the lowest-energy (silence) point near the target size.
///
/// Scans for 100ms windows with minimal RMS energy within +/-3 seconds of each target
/// split point. If no clear silence is found, falls back to a 1-second overlap split
/// to avoid cutting words at boundaries.
pub(crate) fn split_segment_at_silence(
    segment: &crate::audio::vad::SpeechSegment,
    max_samples: usize,
) -> Vec<crate::audio::vad::SpeechSegment> {
    const SAMPLE_RATE: usize = 16000;
    // 100ms window for energy measurement (1600 samples at 16kHz)
    const ENERGY_WINDOW: usize = SAMPLE_RATE / 10;
    // Search +/-3 seconds around the target split point
    const SEARCH_RADIUS: usize = SAMPLE_RATE * 3;
    // RMS threshold below which we consider a window "silent"
    const SILENCE_RMS_THRESHOLD: f32 = 0.02;
    // Overlap to use when no silence boundary is found (1 second)
    const FALLBACK_OVERLAP: usize = SAMPLE_RATE;

    let total = segment.samples.len();
    if total <= max_samples {
        return vec![segment.clone()];
    }

    let ms_per_sample = (segment.end_timestamp_ms - segment.start_timestamp_ms)
        / segment.samples.len() as f64;
    let mut result = Vec::new();
    let mut pos = 0usize;

    while pos < total {
        let remaining = total - pos;
        if remaining <= max_samples {
            // Last chunk - take everything remaining
            let chunk_samples = segment.samples[pos..].to_vec();
            let chunk_start_ms = segment.start_timestamp_ms + (pos as f64 * ms_per_sample);
            let chunk_end_ms = segment.end_timestamp_ms;
            result.push(crate::audio::vad::SpeechSegment {
                samples: chunk_samples,
                start_timestamp_ms: chunk_start_ms,
                end_timestamp_ms: chunk_end_ms,
                confidence: segment.confidence,
            });
            break;
        }

        // Target split point
        let target = pos + max_samples;

        // Search window: [target - SEARCH_RADIUS, target + SEARCH_RADIUS]
        let search_start = target.saturating_sub(SEARCH_RADIUS).max(pos + SAMPLE_RATE);
        let search_end = (target + SEARCH_RADIUS).min(total.saturating_sub(ENERGY_WINDOW));

        // Find the lowest-energy 100ms window in the search range
        let mut best_split = target.min(total); // fallback: exact target
        let mut best_rms = f32::MAX;

        if search_start + ENERGY_WINDOW <= search_end {
            let mut idx = search_start;
            while idx + ENERGY_WINDOW <= search_end {
                let window = &segment.samples[idx..idx + ENERGY_WINDOW];
                let rms = (window.iter().map(|s| s * s).sum::<f32>() / ENERGY_WINDOW as f32).sqrt();
                if rms < best_rms {
                    best_rms = rms;
                    best_split = idx + ENERGY_WINDOW / 2; // split at center of quiet window
                }
                // Step by 10ms (160 samples) for efficiency
                idx += SAMPLE_RATE / 100;
            }
        }

        let split_at = best_split;
        if best_rms <= SILENCE_RMS_THRESHOLD {
            debug!(
                "Splitting at silence boundary: sample {} (RMS={:.4})",
                split_at, best_rms
            );
        } else {
            debug!(
                "No silence found near target (best RMS={:.4}), splitting with overlap at sample {}",
                best_rms, split_at
            );
        }

        // Determine the actual end of this chunk (with overlap if no silence)
        let chunk_end = if best_rms > SILENCE_RMS_THRESHOLD {
            (split_at + FALLBACK_OVERLAP).min(total)
        } else {
            split_at
        };

        let chunk_samples = segment.samples[pos..chunk_end].to_vec();
        let chunk_start_ms = segment.start_timestamp_ms + (pos as f64 * ms_per_sample);
        let chunk_end_ms = segment.start_timestamp_ms + (chunk_end as f64 * ms_per_sample);

        result.push(crate::audio::vad::SpeechSegment {
            samples: chunk_samples,
            start_timestamp_ms: chunk_start_ms,
            end_timestamp_ms: chunk_end_ms,
            confidence: segment.confidence,
        });

        // Advance position to where the current chunk actually ends
        // to avoid transcribing the overlap region twice
        pos = chunk_end;
    }

    result
}

/// Remove overlapping text between consecutive transcript segments.
///
/// When Whisper (or other engines) process overlapping audio windows, the same
/// words may appear at the end of one segment and the start of the next.
/// This function detects and trims such overlaps using longest-common-word-substring.
///
/// Inspired by screenpipe's overlap detection approach.
pub(crate) fn remove_overlapping_text(segments: &mut Vec<(String, f64, f64)>) {
    if segments.len() < 2 {
        return;
    }

    for i in 0..segments.len() - 1 {
        let (prev_words, prev_end) = {
            let (text, _, end) = &segments[i];
            (split_into_words(text), *end)
        };
        let (next_words, next_start) = {
            let (text, start, _) = &segments[i + 1];
            (split_into_words(text), *start)
        };

        // Only check overlap if segments are temporally close (< 2s gap or overlapping)
        if next_start - prev_end > 2.0 {
            continue;
        }

        // Find longest common word subsequence between tail of prev and head of next
        let max_check = prev_words.len().min(next_words.len()).min(30); // check up to 30 words
        if max_check < 2 {
            continue;
        }

        let mut best_overlap = 0usize;
        // Try overlap lengths from max down to 2
        for overlap_len in (2..=max_check).rev() {
            let prev_tail = &prev_words[prev_words.len() - overlap_len..];
            let next_head = &next_words[..overlap_len];

            // Compare normalized (lowercase, no punctuation)
            let matches = prev_tail.iter().zip(next_head.iter()).filter(|(a, b)| {
                normalize_word(a) == normalize_word(b)
            }).count();

            // Require > 60% of words to match for overlap detection
            if matches * 100 > overlap_len * 60 {
                best_overlap = overlap_len;
                break;
            }
        }

        if best_overlap > 0 {
            // Trim overlapping words from start of next segment
            let trimmed: String = next_words[best_overlap..].join(" ");
            if !trimmed.is_empty() {
                segments[i + 1].0 = trimmed;
            } else {
                // Entire next segment was overlap — mark for removal
                segments[i + 1].0 = String::new();
            }
        }
    }

    // Remove empty segments
    segments.retain(|(text, _, _)| !text.trim().is_empty());
}

/// Split text into words, preserving punctuation attached to words.
fn split_into_words(text: &str) -> Vec<&str> {
    text.split_whitespace().collect()
}

/// Normalize a word for comparison: lowercase, strip punctuation.
fn normalize_word(word: &str) -> String {
    word.chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>()
        .to_lowercase()
}

/// Find silence split points in 16kHz mono audio for transcript segmentation.
/// Simple punctuation restoration for Whisper output.
///
/// Whisper often drops sentence-ending punctuation in the middle of output.
/// This function adds periods to segments that don't end with punctuation,
/// which improves downstream sentence splitting and display formatting.
///
/// This is a lightweight heuristic — for full punctuation restoration,
/// a dedicated model (like deepmultilingualpunctuation) would be needed.
pub(crate) fn restore_punctuation(text: &str) -> String {
    if text.is_empty() {
        return text.to_string();
    }

    let trimmed = text.trim();

    // Already has sentence-ending punctuation
    if trimmed.ends_with('.') || trimmed.ends_with('!') || trimmed.ends_with('?')
        || trimmed.ends_with('。') || trimmed.ends_with('！') || trimmed.ends_with('？')
        || trimmed.ends_with(':') || trimmed.ends_with(';')
    {
        return trimmed.to_string();
    }

    // Check if it looks like a complete sentence (starts with capital, has verb-like structure)
    // If so, add a period
    let last_char = trimmed.chars().last().unwrap_or(' ');
    if last_char.is_alphabetic() || last_char == '"' || last_char == '\'' || last_char == ')' {
        // Looks like a sentence that's missing its period
        format!("{}.", trimmed)
    } else {
        trimmed.to_string()
    }
}

/// Restore punctuation on a list of transcript segments.
pub(crate) fn restore_punctuation_batch(segments: &mut [(String, f64, f64)]) {
    for (text, _, _) in segments.iter_mut() {
        *text = restore_punctuation(text);
    }
}

///
/// Scans for windows of low energy (silence) that indicate natural pauses in speech.
/// Returns a list of split points in seconds, sorted ascending.
///
/// Parameters:
/// - `audio`: 16kHz mono f32 samples
/// - `min_gap_ms`: minimum silence duration to count as a split point (default 200ms)
/// - `rms_threshold`: RMS energy below which a window is "silent" (default 0.015)
pub(crate) fn find_silence_splits(
    audio: &[f32],
    sample_rate: u32,
    min_gap_ms: usize,
    rms_threshold: f32,
) -> Vec<f64> {
    if audio.is_empty() {
        return Vec::new();
    }

    const WINDOW_MS: usize = 150;
    let window_samples = (sample_rate as usize * WINDOW_MS) / 1000;
    let min_gap_samples = (sample_rate as usize * min_gap_ms) / 1000;

    // Find contiguous silence windows
    let mut silence_ranges: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;
    while i + window_samples <= audio.len() {
        let window = &audio[i..i + window_samples];
        let rms = (window.iter().map(|&x| x * x).sum::<f32>() / window_samples as f32).sqrt();

        if rms < rms_threshold {
            if let Some(last) = silence_ranges.last_mut() {
                if i <= last.1 + window_samples / 2 {
                    last.1 = i + window_samples;
                } else {
                    silence_ranges.push((i, i + window_samples));
                }
            } else {
                silence_ranges.push((i, i + window_samples));
            }
        }
        i += window_samples / 2; // 50% overlap
    }

    // Filter: keep only gaps ≥ min_gap_samples, return midpoint in seconds
    silence_ranges
        .iter()
        .filter(|(start, end)| end - start >= min_gap_samples)
        .map(|(start, end)| (*start + (*end - start) / 2) as f64 / sample_rate as f64)
        .collect()
}

/// Split text at silence split points, distributing text proportionally by time.
///
/// `split_times` are in seconds (from `find_silence_splits`).
/// `total_duration` is the total audio duration in seconds.
pub(crate) fn split_text_at_silence(
    text: &str,
    split_times: &[f64],
    total_duration: f64,
) -> Vec<(String, f64, f64)> {
    if text.len() < 50 || split_times.is_empty() {
        return vec![(text.to_string(), 0.0, total_duration)];
    }

    let total_chars = text.len() as f64;
    let mut result = Vec::new();
    let mut prev_time = 0.0f64;

    for &split_time in split_times {
        let char_pos = ((split_time / total_duration) * total_chars) as usize;
        let char_pos = char_pos.min(text.len());

        // Find nearest whitespace near char_pos (±30 chars) for clean break
        let search_start = char_pos.saturating_sub(30);
        let search_end = (char_pos + 30).min(text.len());
        let region = &text[search_start..search_end];

        let mut best_pos = char_pos;
        // Prefer punctuation boundary, then whitespace
        for (j, ch) in region.char_indices() {
            if matches!(ch, '.' | '!' | '?') {
                let abs = search_start + j + 1;
                if abs > search_start && abs < text.len() {
                    best_pos = abs;
                    break;
                }
            }
        }
        // If no punctuation found, try whitespace
        if best_pos == char_pos {
            for (j, b) in region.bytes().enumerate() {
                if b == b' ' || b == b'\n' {
                    best_pos = search_start + j + 1;
                    break;
                }
            }
        }

        let start_char = (prev_time / total_duration * total_chars) as usize;
        let end_char = best_pos.min(text.len());

        if end_char > start_char {
            let seg = text[start_char..end_char].trim().to_string();
            if !seg.is_empty() {
                result.push((seg, prev_time, split_time));
            }
        }
        prev_time = split_time;
    }

    // Remaining text
    let last_start = (prev_time / total_duration * total_chars) as usize;
    if last_start < text.len() {
        let seg = text[last_start..].trim().to_string();
        if !seg.is_empty() {
            result.push((seg, prev_time, total_duration));
        }
    }

    if result.len() < 2 {
        return vec![(text.to_string(), 0.0, total_duration)];
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_engine_lifecycle_lock_serializes_acquirers() {
        let guard = acquire_engine_lifecycle_lock().await;
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (acquired_tx, mut acquired_rx) = tokio::sync::oneshot::channel();
        let waiter = tokio::spawn(async {
            started_tx.send(()).unwrap();
            let _guard = acquire_engine_lifecycle_lock().await;
            acquired_tx.send(()).unwrap();
        });

        started_rx.await.unwrap();
        assert!(acquired_rx.try_recv().is_err());
        drop(guard);

        acquired_rx.await.unwrap();
        waiter.await.unwrap();
    }
}
