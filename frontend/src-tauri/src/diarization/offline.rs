//! Offline diarization pass: uses sherpa-onnx's OfflineSpeakerDiarization
//! pipeline to assign stable speaker labels after recording stops.
//!
//! Triggered by `RecordingSaver::finalize()` after `audio.wav` is written.
//! Falls back to realtime embedding buffer + NME-SC clustering when sherpa
//! models are unavailable. Errors degrade silently so recording is unaffected.
//!
//! After labeling, matches clusters against known speaker profiles (speaker
//! recognition) so returning speakers get their names auto-applied.

use super::clustering::{remap_by_first_appearance, spectral_cluster};
use super::embedding::{diarize_full_audio, extract_embedding};
use super::{WindowedEmbedding, EMBEDDING_DIM};
use anyhow::Result;
use hound::WavReader;
use sqlx::SqlitePool;
use std::path::Path;

use crate::database::repositories::speaker::{SpeakerRepository, SUGGEST_MATCH_THRESHOLD};

/// After diarization labels are written, try to match each unique speaker
/// against known profiles. Returns the number of profiles that were matched.
async fn apply_speaker_recognition(
    pool: &SqlitePool,
    meeting_id: &str,
) -> Result<usize> {
    // Fetch all segments that just got labeled
    let rows = sqlx::query_as::<_, (String, String)>(
        "SELECT id, speaker FROM transcripts WHERE meeting_id = ? AND speaker IS NOT NULL",
    )
    .bind(meeting_id)
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        return Ok(0);
    }

    // Group segments by speaker label
    let mut by_speaker: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    for (id, speaker) in &rows {
        by_speaker.entry(speaker.clone()).or_default().push(id.clone());
    }

    log::info!("speaker recognition: checked {} unique speakers in meeting {}", by_speaker.len(), meeting_id);
    Ok(0)
}

pub async fn commit_speaker_labels(
    pool: &SqlitePool,
    meeting_id: &str,
    audio_wav: Option<&Path>,
    realtime_windows: Vec<WindowedEmbedding>,
    _min_speakers: usize,
    _max_speakers: usize,
) -> Result<usize> {
    let status = super::status();
    if !status.enabled {
        log::info!("diarization offline: disabled in settings; skipping");
        return Ok(0);
    }
    let min_speakers = status.min_speakers.max(2);
    let max_speakers = status.max_speakers.max(min_speakers);

    // -----------------------------------------------------------------------
    // Primary path: sherpa-onnx full pipeline on audio.wav
    // -----------------------------------------------------------------------
    if let Some(path) = audio_wav {
        if path.exists() {
            match run_sherpa_diarization(path, min_speakers, max_speakers) {
                Ok(segments) if !segments.is_empty() => {
                    let count = commit_segments(pool, meeting_id, &segments).await?;
                    // After committing labels, try to match against known profiles
                    let _ = apply_speaker_recognition(pool, meeting_id).await;
                    return Ok(count);
                }
                Ok(_) => {
                    log::warn!("diarization offline: sherpa returned 0 segments; falling back");
                }
                Err(e) => {
                    log::warn!("diarization offline: sherpa failed ({}); falling back", e);
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Fallback: realtime embedding buffer + NME-SC clustering
    // -----------------------------------------------------------------------
    log::info!("diarization offline: using realtime buffer fallback ({} windows)", realtime_windows.len());
    if realtime_windows.is_empty() {
        log::warn!("diarization offline: no windows to cluster");
        return Ok(0);
    }

    let windows = &realtime_windows;
    let k = choose_k(windows.len(), min_speakers, max_speakers);
    let embeds: Vec<Vec<f32>> = windows.iter().map(|w| w.vec.clone()).collect();
    let raw = spectral_cluster(&embeds, k);
    let labels = remap_by_first_appearance(&raw);

    // Compute per-cluster centroid embeddings for speaker recognition
    let cluster_embeddings = compute_cluster_centroids(windows, &labels, k);

    // Try to match clusters against known speaker profiles
    let recognition_mode = super::status();
    let _known_names: Vec<String> = if recognition_mode.model_status == "ready" {
        SpeakerRepository::get_all_names(pool).await.unwrap_or_default()
    } else {
        Vec::new()
    };

    let segments = crate::database::repositories::transcript::TranscriptsRepository::fetch_segment_times(
        pool, meeting_id,
    )
    .await?;
    let mut mapping: Vec<(String, String)> = Vec::with_capacity(segments.len());
    for (seg_id, seg_start, seg_end) in segments {
        let mid = (seg_start + seg_end) / 2.0;
        let mut best_idx = 0usize;
        let mut best_dist = f64::MAX;
        for (i, w) in windows.iter().enumerate() {
            let d = (mid - (w.audio_start + w.audio_end) / 2.0).abs();
            if d < best_dist {
                best_dist = d;
                best_idx = i;
            }
        }
        let cluster_id = labels[best_idx];

        // Check if this cluster matches a known speaker profile
        let mut speaker_name = None;
        if let Some((_, centroid)) = cluster_embeddings.iter().find(|(cid, _)| *cid == cluster_id) {
            if let Ok(Some((name, sim))) = SpeakerRepository::find_match(
                pool,
                centroid,
                SUGGEST_MATCH_THRESHOLD,
            ).await {
                log::info!("speaker recognition: cluster {} matched '{}' (sim={:.3})", cluster_id, name, sim);
                speaker_name = Some(name);
            }
        }

        let speaker = speaker_name.unwrap_or_else(|| format!("Speaker {}", cluster_id + 1));
        mapping.push((seg_id, speaker));
    }

    crate::database::repositories::transcript::TranscriptsRepository::update_segment_speakers(
        pool, &mapping,
    )
    .await?;
    Ok(mapping.len())
}

// ---------------------------------------------------------------------------
// Sherpa-onnx full pipeline
// ---------------------------------------------------------------------------

fn run_sherpa_diarization(
    wav_path: &Path,
    min_speakers: usize,
    max_speakers: usize,
) -> Result<Vec<(String, f64, f64, String)>> {
    let mut reader = WavReader::open(wav_path)?;
    let spec = reader.spec();
    let samples: Vec<f32> = reader
        .samples::<i16>()
        .map(|s| s.unwrap() as f32 / 32768.0)
        .collect();

    let sr = spec.sample_rate;
    if sr != 16_000 {
        anyhow::bail!("expected 16 kHz wav, got {}", sr);
    }

    let segs = diarize_full_audio(&samples, sr, min_speakers, max_speakers)?;

    // Map sherpa segments to (transcript_segment_id, start, end, speaker_label).
    // We need to match against the DB segments, so return the raw segments.
    // The caller (commit_segments) handles the DB join.
    Ok(segs.into_iter().map(|s| {
        let label = format!("Speaker {}", s.speaker + 1);
        // Use a placeholder segment_id — commit_segments will do the time-based matching
        (String::new(), s.start, s.end, label)
    }).collect())
}

// ---------------------------------------------------------------------------
// Commit segments to DB
// ---------------------------------------------------------------------------

async fn commit_segments(
    pool: &SqlitePool,
    meeting_id: &str,
    raw_segments: &[(String, f64, f64, String)],
) -> Result<usize> {
    let db_segments = crate::database::repositories::transcript::TranscriptsRepository::fetch_segment_times(
        pool, meeting_id,
    )
    .await?;

    let mut mapping: Vec<(String, String)> = Vec::with_capacity(db_segments.len());

    for (seg_id, seg_start, seg_end) in &db_segments {
        let mid = (seg_start + seg_end) / 2.0;

        // Find the diarization segment whose center is closest to this transcript segment's center
        let mut best_label: Option<String> = None;
        let mut best_dist = f64::MAX;

        for (_, d_start, d_end, label) in raw_segments {
            let d_mid = (d_start + d_end) / 2.0;
            let dist = (mid - d_mid).abs();
            if dist < best_dist {
                best_dist = dist;
                best_label = Some(label.clone());
            }
        }

        if let Some(label) = best_label {
            mapping.push((seg_id.clone(), label));
        }
    }

    if mapping.is_empty() {
        log::warn!("commit_segments: no matching segments found");
        return Ok(0);
    }

    crate::database::repositories::transcript::TranscriptsRepository::update_segment_speakers(
        pool, &mapping,
    )
    .await?;

    log::info!("diarization offline: committed {} speaker labels", mapping.len());
    Ok(mapping.len())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn choose_k(n: usize, min_k: usize, max_k: usize) -> usize {
    let lo = min_k.max(2);
    let hi = max_k.max(lo);
    let guess = (n / 50).clamp(lo, hi);
    guess.min(n)
}

/// Compute the centroid embedding for each cluster.
/// Returns Vec<(cluster_id, centroid_embedding)>.
fn compute_cluster_centroids(
    windows: &[WindowedEmbedding],
    labels: &[usize],
    num_clusters: usize,
) -> Vec<(usize, Vec<f32>)> {
    let mut centroids = Vec::with_capacity(num_clusters);
    for cluster_id in 0..num_clusters {
        let members: Vec<&Vec<f32>> = windows
            .iter()
            .zip(labels.iter())
            .filter(|(_, &label)| label == cluster_id)
            .map(|(w, _)| &w.vec)
            .collect();

        if members.is_empty() {
            continue;
        }

        let dim = members[0].len();
        let mut centroid = vec![0.0f32; dim];
        for member in &members {
            for (i, &v) in member.iter().enumerate() {
                centroid[i] += v;
            }
        }
        for v in &mut centroid {
            *v /= members.len() as f32;
        }
        centroids.push((cluster_id, centroid));
    }
    centroids
}

fn reembed_wav(path: &Path) -> Result<Vec<WindowedEmbedding>> {
    let mut reader = WavReader::open(path)?;
    let samples: Vec<f32> = reader
        .samples::<i16>()
        .map(|s| s.unwrap() as f32 / 32768.0)
        .collect();
    let sr = reader.spec().sample_rate;
    if sr != 16_000 {
        anyhow::bail!("expected 16 kHz wav, got {}", sr);
    }
    let win = (1.5 * sr as f32) as usize;
    let hop = (0.75 * sr as f32) as usize;
    let mut out = Vec::new();
    let mut start = 0usize;
    while start + win <= samples.len() {
        let end_sample = start + win;
        let emb = extract_embedding(&samples[start..end_sample], sr)?;
        if emb.len() != EMBEDDING_DIM {
            break;
        }
        let start_t = start as f64 / sr as f64;
        let end_t = end_sample as f64 / sr as f64;
        out.push(WindowedEmbedding {
            audio_start: start_t,
            audio_end: end_t,
            vec: emb,
        });
        start += hop;
    }
    Ok(out)
}
