//! Create, serve, and delete playable local voice snippets for speaker
//! diarization references.

use anyhow::{anyhow, bail, Result};
use sqlx::SqlitePool;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use crate::database::repositories::voice_reference::{CreateReferenceParams, VoiceReferenceRepository};

// ── Constants ─────────────────────────────────────────────────────────────

const MIN_WINDOW_MS: i64 = 1_500;
const MAX_WINDOW_MS: i64 = 8_000;
const SAMPLE_RATE: u32 = 16_000;
pub const WAVEFORM_PEAKS_COUNT: usize = 96;

// ── Globals ───────────────────────────────────────────────────────────────

/// Base directory for speaker reference audio files.
/// Set during app init to `app_data_dir/speaker-references/`.
static REFERENCES_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Initialize the references directory. Called once during app setup.
pub fn set_references_dir(path: PathBuf) {
    let _ = REFERENCES_DIR.set(path);
}

/// Get the current references directory (for testing / inspection).
pub fn references_dir() -> Option<&'static PathBuf> {
    REFERENCES_DIR.get()
}

// ── Types ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ReferenceWindow {
    pub start_ms: i64,
    pub end_ms: i64,
}

impl ReferenceWindow {
    pub fn duration_ms(&self) -> i64 {
        self.end_ms - self.start_ms
    }
}

// ── Pure functions ────────────────────────────────────────────────────────

/// Select a reference window of 1.5–8 seconds around speech segments.
/// The window is centred on the union of the given segments and clamped
/// to [`MAX_WINDOW_MS`].  Returns `None` when `segments` is empty.
pub fn select_reference_window(segments: &[(i64, i64)]) -> Option<ReferenceWindow> {
    if segments.is_empty() {
        return None;
    }

    let first_start = segments.iter().map(|(s, _)| *s).min()?;
    let last_end = segments.iter().map(|(_, e)| *e).max()?;
    let span = last_end - first_start;

    if span >= MIN_WINDOW_MS {
        // Span already meets the minimum.  Cap to MAX_WINDOW_MS, centred.
        let window_ms = span.min(MAX_WINDOW_MS);
        let center = (first_start + last_end) / 2;
        let mut start_ms = center - window_ms / 2;
        let mut end_ms = start_ms + window_ms;

        // Slide window inside [first_start, last_end] when possible.
        if start_ms < first_start {
            start_ms = first_start;
            end_ms = first_start + window_ms;
        }
        if end_ms > last_end {
            end_ms = last_end;
            start_ms = last_end - window_ms;
        }

        Some(ReferenceWindow { start_ms, end_ms })
    } else {
        // Need to expand around the union to meet the minimum.
        let needed = MIN_WINDOW_MS - span;
        let pad_before = needed / 2;
        let pad_after = needed - pad_before;
        let start_ms = first_start - pad_before;
        let end_ms = last_end + pad_after;

        if (end_ms - start_ms) > MAX_WINDOW_MS {
            // Can't meet MIN while staying under MAX – take MAX centred.
            let center = (first_start + last_end) / 2;
            let start_ms = center - MAX_WINDOW_MS / 2;
            let end_ms = start_ms + MAX_WINDOW_MS;
            Some(ReferenceWindow { start_ms, end_ms })
        } else {
            Some(ReferenceWindow { start_ms, end_ms })
        }
    }
}

/// Build exactly `num_peaks` waveform peaks from f32 samples.
/// Each peak is the max absolute amplitude per bucket, stored as u8 (0–255).
pub fn build_waveform_peaks(samples: &[f32], num_peaks: usize) -> Vec<u8> {
    if num_peaks == 0 {
        return Vec::new();
    }
    if samples.is_empty() {
        return vec![0u8; num_peaks];
    }

    let mut peaks = Vec::with_capacity(num_peaks);
    let bucket_size = (samples.len() as f64 / num_peaks as f64).ceil() as usize;
    
    for i in 0..num_peaks {
        let start = i * bucket_size;
        let end = (start + bucket_size).min(samples.len());
        if start >= samples.len() {
            peaks.push(0);
        } else {
            let peak = samples[start..end].iter().map(|s| s.abs()).fold(0.0f32, f32::max);
            peaks.push((peak * 255.0).round().clamp(0.0, 255.0) as u8);
        }
    }
    peaks
}

/// Validate and resolve a relative path under the managed references dir.
/// Rejects paths containing `..` or that are absolute.
pub fn managed_reference_path(relative_path: &str) -> Result<PathBuf> {
    if relative_path.contains("..") {
        bail!("path contains '..': {relative_path}");
    }
    let p = Path::new(relative_path);
    if p.is_absolute() {
        bail!("absolute path not allowed: {relative_path}");
    }

    let base = REFERENCES_DIR
        .get()
        .ok_or_else(|| anyhow!("references directory not initialized"))?;
    Ok(base.join(relative_path))
}

// ── Audio helpers ─────────────────────────────────────────────────────────

/// Apply fade-in / fade-out of the given duration (in ms).
fn apply_fade(samples: &mut [f32], sample_rate: u32, fade_ms: u32) {
    let fade_samples = ((sample_rate as u64 * fade_ms as u64) / 1000) as usize;
    let fade_samples = fade_samples.min(samples.len() / 2);
    if fade_samples == 0 {
        return;
    }
    // Fade-in
    for i in 0..fade_samples {
        let t = i as f32 / fade_samples as f32;
        samples[i] *= t;
    }
    // Fade-out
    let len = samples.len();
    for i in 0..fade_samples {
        let t = i as f32 / fade_samples as f32;
        samples[len - 1 - i] *= t;
    }
}

/// Write a 16-bit mono WAV file.
fn write_wav(path: &Path, samples: &[f32], sample_rate: u32) -> Result<()> {
    let i16_samples: Vec<i16> = samples
        .iter()
        .map(|&s| (s.clamp(-1.0, 1.0) * 32_767.0) as i16)
        .collect();

    let num_channels: u16 = 1;
    let bits_per_sample: u16 = 16;
    let byte_rate = sample_rate * num_channels as u32 * bits_per_sample as u32 / 8;
    let block_align = num_channels * bits_per_sample / 8;
    let data_size = (i16_samples.len() * 2) as u32;

    let mut file = std::fs::File::create(path)?;

    // RIFF header
    file.write_all(b"RIFF")?;
    file.write_all(&(36 + data_size).to_le_bytes())?;
    file.write_all(b"WAVE")?;

    // fmt chunk
    file.write_all(b"fmt ")?;
    file.write_all(&16u32.to_le_bytes())?; // chunk size
    file.write_all(&1u16.to_le_bytes())?; // PCM format
    file.write_all(&num_channels.to_le_bytes())?;
    file.write_all(&sample_rate.to_le_bytes())?;
    file.write_all(&byte_rate.to_le_bytes())?;
    file.write_all(&block_align.to_le_bytes())?;
    file.write_all(&bits_per_sample.to_le_bytes())?;

    // data chunk
    file.write_all(b"data")?;
    file.write_all(&data_size.to_le_bytes())?;
    for &s in &i16_samples {
        file.write_all(&s.to_le_bytes())?;
    }

    file.sync_data()?;

    Ok(())
}

/// Find the first audio file in a meeting folder.
fn find_audio_file(folder: &Path) -> Result<PathBuf> {
    for name in &[
        "audio.mp4",
        "audio.mp3",
        "audio.m4a",
        "audio.wav",
        "audio.webm",
        "audio.mkv",
    ] {
        let candidate = folder.join(name);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    bail!("no audio file found in {}", folder.display())
}

// ── DB helpers ────────────────────────────────────────────────────────────

/// Fetch transcript segment IDs and their audio times (in ms) for the given
/// segment IDs.
async fn fetch_segment_times(
    pool: &SqlitePool,
    segment_ids: &[String],
) -> Result<Vec<(String, i64, i64)>> {
    if segment_ids.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders = segment_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT id, audio_start_time, audio_end_time FROM transcripts \
         WHERE id IN ({}) AND audio_start_time IS NOT NULL AND audio_end_time IS NOT NULL",
        placeholders
    );

    let mut query = sqlx::query_as::<_, (String, f64, f64)>(&sql);
    for id in segment_ids {
        query = query.bind(id);
    }

    let rows = query.fetch_all(pool).await?;
    Ok(rows.into_iter().map(|(id, start, end)| (id, (start * 1000.0) as i64, (end * 1000.0) as i64)).collect())
}

/// Fetch the folder path for a meeting.
async fn fetch_meeting_folder(pool: &SqlitePool, meeting_id: &str) -> Result<PathBuf> {
    let row: Option<(Option<String>,)> =
        sqlx::query_as("SELECT folder_path FROM meetings WHERE id = ?")
            .bind(meeting_id)
            .fetch_optional(pool)
            .await?;
    match row {
        Some((Some(fp),)) if !fp.is_empty() => Ok(PathBuf::from(fp)),
        _ => bail!("meeting {meeting_id} not found or has no folder_path"),
    }
}

/// Get the relative path stored for a voice reference.
async fn fetch_relative_path(pool: &SqlitePool, reference_id: &str) -> Result<Option<String>> {
    let row: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT audio_relative_path FROM speaker_voice_references WHERE id = ?",
    )
    .bind(reference_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.and_then(|(rp,)| rp))
}

// ── Public async functions ────────────────────────────────────────────────

/// Create a voice reference from transcript segments.
///
/// 1. Select a 1.5–8 s window around the segments.
/// 2. Decode meeting audio, downmix/resample to 16 kHz mono.
/// 3. Apply 50 ms fade-in/out.
/// 4. Write WAV atomically (temp + rename).
/// 5. Compute speaker embedding (non-fatal if model unavailable).
/// 6. Compute 96 waveform peaks.
/// 7. Create a DB row.
pub async fn create_voice_reference_from_segments(
    pool: &SqlitePool,
    speaker_id: &str,
    meeting_id: &str,
    segment_ids: &[String],
    channel: Option<String>,
) -> Result<String> {
    // 1. Fetch segment times and select window
    let segment_times = fetch_segment_times(pool, segment_ids).await?;
    if segment_times.is_empty() {
        bail!("no valid segments found for the given IDs");
    }

    let seg_pairs: Vec<(i64, i64)> = segment_times.iter().map(|(_, s, e)| (*s, *e)).collect();
    let window = select_reference_window(&seg_pairs)
        .ok_or_else(|| anyhow!("failed to select reference window"))?;

    // 2. Find and decode meeting audio
    let meeting_folder = fetch_meeting_folder(pool, meeting_id).await?;
    let audio_path = find_audio_file(&meeting_folder)?;

    let decoded = crate::audio::decoder::decode_audio_file(&audio_path)?;
    let mono_16k = decoded.to_whisper_format();

    // 3. Extract the clip for the selected window
    let start_sample = ((window.start_ms as u64 * SAMPLE_RATE as u64) / 1000) as usize;
    let end_sample = ((window.end_ms as u64 * SAMPLE_RATE as u64) / 1000) as usize;
    let end_sample = end_sample.min(mono_16k.len());
    let start_sample = start_sample.min(end_sample);
    if start_sample >= end_sample {
        bail!("invalid audio window: no samples in range");
    }
    let mut clip = mono_16k[start_sample..end_sample].to_vec();

    // 4. Fade-in / fade-out
    apply_fade(&mut clip, SAMPLE_RATE, 50);

    // 5. Waveform peaks
    let waveform_peaks = build_waveform_peaks(&clip, WAVEFORM_PEAKS_COUNT);

    // 6. Write WAV atomically
    let ref_id = format!("ref-{}", uuid::Uuid::new_v4());
    let speaker_dir = REFERENCES_DIR
        .get()
        .ok_or_else(|| anyhow!("references directory not initialized"))?
        .join(speaker_id);
    std::fs::create_dir_all(&speaker_dir)?;

    let final_path = speaker_dir.join(format!("{ref_id}.wav"));
    let tmp_path = speaker_dir.join(format!(".{ref_id}.tmp"));

    if let Err(e) = write_wav(&tmp_path, &clip, SAMPLE_RATE) {
        let _ = std::fs::remove_file(&tmp_path);
        bail!("failed to write WAV: {e}");
    }
    if let Err(e) = std::fs::rename(&tmp_path, &final_path) {
        let _ = std::fs::remove_file(&tmp_path);
        bail!("failed to rename temp file: {e}");
    }

    // 7. Embedding (non-fatal if model unavailable)
    let embedding = crate::diarization::embedding::extract_embedding(&clip, SAMPLE_RATE)
        .unwrap_or_default();

    // 8. DB row
    let relative_path = format!("{speaker_id}/{ref_id}.wav");
    let ch = channel.unwrap_or_else(|| "unknown".into());

    let id = VoiceReferenceRepository::create(
        pool,
        speaker_id,
        &CreateReferenceParams {
            meeting_id: Some(meeting_id.to_string()),
            embedding,
            audio_relative_path: Some(relative_path),
            waveform_peaks: Some(waveform_peaks),
            source_start_ms: window.start_ms,
            source_end_ms: window.end_ms,
            duration_ms: window.duration_ms(),
            channel: ch,
            quality_score: 0.8,
            status: "confirmed".into(),
            origin: "segment".into(),
        },
    )
    .await?;

    Ok(id)
}

/// Get the absolute path for a voice reference audio file.
/// Returns `None` for legacy references or missing files.
pub async fn get_voice_reference_audio_path(
    pool: &SqlitePool,
    reference_id: &str,
) -> Result<Option<PathBuf>> {
    let relative_path = match fetch_relative_path(pool, reference_id).await? {
        Some(rp) => rp,
        None => return Ok(None),
    };

    if relative_path.contains("..") {
        log::warn!(
            "voice reference {reference_id} has suspicious path: {relative_path}"
        );
        return Ok(None);
    }

    let path = managed_reference_path(&relative_path)?;
    Ok(if path.is_file() { Some(path) } else { None })
}

/// Delete a voice reference: remove the DB row first, then the file.
/// Only deletes files under the managed speaker-references directory.
/// Logs a warning if the file is missing; does not error.
pub async fn delete_voice_reference(pool: &SqlitePool, reference_id: &str) -> Result<()> {
    let relative_path = fetch_relative_path(pool, reference_id).await?;

    // DB row first (in transaction)
    let mut tx = pool.begin().await?;
    VoiceReferenceRepository::delete_with_tx(&mut *tx, reference_id).await?;
    tx.commit().await?;

    // Then file (only if under managed dir)
    if let Some(rp) = relative_path {
        if !rp.contains("..") {
            if let Ok(path) = managed_reference_path(&rp) {
                if path.is_file() {
                    if let Err(e) = std::fs::remove_file(&path) {
                        log::warn!("failed to delete reference file {}: {e}", path.display());
                    }
                }
            }
        }
    }

    Ok(())
}

#[cfg(test)]
#[path = "voice_references_test.rs"]
mod voice_references_test;
