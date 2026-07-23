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

/// Maximum number of embedding windows fed to spectral_cluster.
/// Eigendecomposition is O(N³); 192 keeps worst-case under a few seconds.
const MAX_CLUSTER_WINDOWS: usize = 192;

/// After diarization labels are written, try to match each unique speaker
/// against known profiles. Returns the number of profiles that were matched.
///
/// For each speaker label, extracts audio embeddings from their segments,
/// computes a centroid, and matches against saved speaker profiles.
/// If a match is found, updates transcript labels from "Speaker N" to the matched name.
async fn apply_speaker_recognition(
    pool: &SqlitePool,
    meeting_id: &str,
    audio_wav: Option<&Path>,
) -> Result<Vec<(String, String)>> {
    use crate::database::repositories::transcript::TranscriptsRepository;

    // Fetch all segments with speaker labels and audio timestamps
    let rows = sqlx::query_as::<_, (String, String, Option<f64>, Option<f64>)>(
        "SELECT id, speaker, audio_start_time, audio_end_time FROM transcripts WHERE meeting_id = ? AND speaker IS NOT NULL",
    )
    .bind(meeting_id)
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        return Ok(Vec::new());
    }

    // Group segments by speaker label
    let mut by_speaker: std::collections::HashMap<String, Vec<(String, Option<f64>, Option<f64>)>> =
        std::collections::HashMap::new();
    for (id, speaker, start, end) in &rows {
        by_speaker.entry(speaker.clone()).or_default().push((id.clone(), *start, *end));
    }

    log::info!("speaker recognition: checking {} unique speakers in meeting {}", by_speaker.len(), meeting_id);

    // Load audio for embedding extraction from the provided path
    let (samples, sr) = match audio_wav {
        Some(path) if path.exists() => {
            match hound::WavReader::open(path) {
                Ok(mut reader) => {
                    let spec = reader.spec();
                    if spec.sample_rate == 16_000 && spec.channels == 1 {
                        let samples: Vec<f32> = reader
                            .samples::<i16>()
                            .filter_map(|s| s.ok())
                            .map(|s| s as f32 / 32768.0)
                            .collect();
                        if samples.is_empty() {
                            log::info!("speaker recognition: audio.wav is empty; skipping");
                            return Ok(Vec::new());
                        }
                        (samples, spec.sample_rate)
                    } else {
                        log::warn!("speaker recognition: audio.wav is not 16kHz mono ({}Hz, {}ch)", spec.sample_rate, spec.channels);
                        return Ok(Vec::new());
                    }
                }
                Err(e) => {
                    log::warn!("speaker recognition: failed to open audio.wav: {}", e);
                    return Ok(Vec::new());
                }
            }
        }
        _ => {
            log::info!("speaker recognition: no audio.wav available; skipping embedding extraction");
            return Ok(Vec::new());
        }
    };

    let mut matched: Vec<(String, String)> = Vec::new();
    let mut mapping: Vec<(String, String)> = Vec::new();

    for (speaker_label, segments) in &by_speaker {
        // Extract audio slices for this speaker's segments and compute embeddings
        let mut speaker_embeddings: Vec<Vec<f32>> = Vec::new();

        for (_seg_id, start, end) in segments {
            let (s, e) = match (start, end) {
                (Some(s), Some(e)) => (*s, *e),
                _ => continue,
            };

            // Convert time to sample indices
            let start_sample = ((s * sr as f64) as usize).min(samples.len());
            let end_sample = ((e * sr as f64) as usize).min(samples.len());

            if end_sample <= start_sample || end_sample - start_sample < sr as usize / 2 {
                continue; // Skip segments shorter than 0.5s
            }

            // Use up to 10 seconds of audio for embedding (take middle portion)
            let seg_len = end_sample - start_sample;
            let max_samples = (sr as usize) * 10; // 10 seconds
            let (slice_start, slice_end) = if seg_len > max_samples {
                let mid = start_sample + seg_len / 2;
                (mid - max_samples / 2, mid + max_samples / 2)
            } else {
                (start_sample, end_sample)
            };

            let slice = &samples[slice_start..slice_end];
            match super::embedding::extract_embedding(slice, sr) {
                Ok(embedding) => speaker_embeddings.push(embedding),
                Err(e) => log::debug!("speaker recognition: embedding extraction failed for {}: {}", speaker_label, e),
            }
        }

        if speaker_embeddings.is_empty() {
            log::debug!("speaker recognition: no embeddings extracted for {}", speaker_label);
            continue;
        }

        // Compute centroid (average embedding)
        let dim = speaker_embeddings[0].len();
        let mut centroid = vec![0.0f32; dim];
        for emb in &speaker_embeddings {
            for (i, v) in emb.iter().enumerate() {
                centroid[i] += v;
            }
        }
        for v in centroid.iter_mut() {
            *v /= speaker_embeddings.len() as f32;
        }

        // Match against saved profiles
        match SpeakerRepository::find_match(pool, &centroid, SUGGEST_MATCH_THRESHOLD).await {
            Ok(Some((name, sim))) => {
                log::info!(
                    "speaker recognition: {} matched '{}' (sim={:.3}, {} embeddings averaged)",
                    speaker_label, name, sim, speaker_embeddings.len()
                );
                // Update transcript labels from "Speaker N" to matched name
                for (seg_id, _, _) in segments {
                    mapping.push((seg_id.clone(), name.clone()));
                }
                matched.push((speaker_label.clone(), name.clone()));
            }
            Ok(None) => {
                log::debug!("speaker recognition: {} no match above threshold", speaker_label);
            }
            Err(e) => {
                log::warn!("speaker recognition: match lookup failed for {}: {}", speaker_label, e);
            }
        }
    }

    // Apply matched names to transcripts
    if !mapping.is_empty() {
        TranscriptsRepository::update_segment_speakers(pool, &mapping).await?;
        log::info!("speaker recognition: updated {} transcript labels with matched names", mapping.len());
    }

    Ok(matched)
}

pub async fn commit_speaker_labels(
    pool: &SqlitePool,
    meeting_id: &str,
    audio_wav: Option<&Path>,
    realtime_windows: Vec<WindowedEmbedding>,
    min_speakers: usize,
    max_speakers: usize,
) -> Result<usize> {
    commit_speaker_labels_inner(pool, meeting_id, audio_wav, realtime_windows, min_speakers, max_speakers, None).await
}

/// Like [`commit_speaker_labels`], but calls `progress(percentage, message)` at
/// each major pipeline stage so callers can drive a UI progress bar.
///
/// Progress milestones (within 91..=99 range by convention):
///   91 – speaker analysis
///   94 – voice embedding extraction and clustering
///   97 – speaker profile matching
///   99 – speaker label persistence
pub async fn commit_speaker_labels_with_progress<F>(
    pool: &SqlitePool,
    meeting_id: &str,
    audio_wav: Option<&Path>,
    realtime_windows: Vec<WindowedEmbedding>,
    min_speakers: usize,
    max_speakers: usize,
    progress: F,
) -> Result<usize>
where
    F: Fn(u32, &str) + Send + Sync,
{
    commit_speaker_labels_inner(pool, meeting_id, audio_wav, realtime_windows, min_speakers, max_speakers, Some(&progress)).await
}

async fn commit_speaker_labels_inner(
    pool: &SqlitePool,
    meeting_id: &str,
    audio_wav: Option<&Path>,
    realtime_windows: Vec<WindowedEmbedding>,
    _min_speakers: usize,
    _max_speakers: usize,
    progress: Option<&(dyn Fn(u32, &str) + Send + Sync)>,
) -> Result<usize> {
    let emit = |pct: u32, msg: &str| {
        if let Some(cb) = progress {
            cb(pct, msg);
        }
    };

    let status = super::status();
    if !status.enabled {
        log::info!("diarization offline: disabled in settings; skipping");
        return Ok(0);
    }
    let min_speakers = status.min_speakers.max(2);
    let max_speakers = status.max_speakers.max(min_speakers);

    emit(91, "Separando os falantes…");

    // -----------------------------------------------------------------------
    // Primary path: sherpa-onnx full pipeline on audio.wav
    // -----------------------------------------------------------------------
    if let Some(path) = audio_wav {
        if path.exists() {
            match run_sherpa_diarization(path, min_speakers, max_speakers) {
                Ok(segments) if !segments.is_empty() => {
                    let count = commit_segments(pool, meeting_id, &segments).await?;
                    // After committing labels, try to match against known profiles
                    let matched = apply_speaker_recognition(pool, meeting_id, audio_wav).await.unwrap_or_default();
                    if !matched.is_empty() {
                        log::info!("speaker recognition: {} speakers matched in meeting {}", matched.len(), meeting_id);
                    }
                    emit(99, "Saving speaker labels…");
                    return Ok(count);
                }
                Ok(_) => {
                    log::warn!("diarization offline: pyannote returned no turns; using CAM++ fallback");
                }
                Err(e) => {
                    log::warn!("diarization offline: sherpa error ({}); using CAM++ fallback", e);
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Fallback: try re-embedding from wav, then realtime buffer
    // -----------------------------------------------------------------------
    let fallback_start = std::time::Instant::now();

    emit(94, "Extraindo características das vozes…");

    let effective_windows = if !realtime_windows.is_empty() {
        realtime_windows
    } else if let Some(path) = audio_wav {
        match reembed_wav(path) {
            Ok(w) if !w.is_empty() => {
                log::info!("diarization offline: re-embedded {} windows from wav file", w.len());
                w
            }
            Ok(_) => {
                log::warn!("diarization offline: reembed_wav produced 0 windows");
                Vec::new()
            }
            Err(e) => {
                log::warn!("diarization offline: reembed_wav failed ({}); continuing with empty fallback", e);
                Vec::new()
            }
        }
    } else {
        realtime_windows
    };

    if effective_windows.is_empty() {
        log::warn!("diarization offline: no embedding windows available (sherpa empty, reembed empty, realtime empty); leaving speaker labels NULL");
        return Ok(0);
    }

    log::info!("diarization offline: clustering {} windows", effective_windows.len());

    let windows = &effective_windows;
    let (clustered_windows, original_to_block) = aggregate_temporal_windows(windows, MAX_CLUSTER_WINDOWS);
    let group_size = if clustered_windows.is_empty() { 0 } else { (windows.len() + clustered_windows.len() - 1) / clustered_windows.len() };
    let k = choose_k(clustered_windows.len(), min_speakers, max_speakers);

    emit(96, "Agrupando falantes…");

    log::info!(
        "diarization offline: spectral_cluster raw={} aggregated={} group_size={} k={}",
        windows.len(),
        clustered_windows.len(),
        group_size,
        k,
    );
    let cluster_start = std::time::Instant::now();
    let embeds: Vec<Vec<f32>> = clustered_windows.iter().map(|w| w.vec.clone()).collect();
    let raw = spectral_cluster(&embeds, k);
    let cluster_ms = cluster_start.elapsed().as_millis();
    log::info!(
        "diarization offline: spectral_cluster returned {} labels in {}ms",
        raw.len(),
        cluster_ms,
    );
    let labels = remap_by_first_appearance(&raw);

    // Compute per-cluster centroid embeddings for speaker recognition
    let cluster_embeddings = compute_cluster_centroids(&clustered_windows, &labels, k);

    emit(97, "Matching speaker profiles…");

    // Try to match clusters against known speaker profiles
    let recognition_mode = super::status();
    let _known_names: Vec<String> = if recognition_mode.model_status == "ready" {
        SpeakerRepository::list_people(pool).await
            .map(|ps| ps.into_iter().map(|p| p.display_name).collect())
            .unwrap_or_default()
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
        // Map original window index → aggregated block index → cluster label
        let block_idx = original_to_block[best_idx];
        let cluster_id = labels[block_idx];

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

    emit(99, "Saving speaker labels…");

    crate::database::repositories::transcript::TranscriptsRepository::update_segment_speakers(
        pool, &mapping,
    )
    .await?;
    log::info!(
        "diarization offline: committed {} CAM++ fallback speaker labels in {}ms",
        mapping.len(),
        fallback_start.elapsed().as_millis(),
    );
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

/// Aggregate consecutive embedding windows into fewer, wider blocks so that
/// spectral clustering never receives more than `max_windows` inputs.
///
/// Returns `(aggregated_windows, original_to_block)` where
/// `original_to_block[i]` is the index into `aggregated_windows` that the
/// i-th original window was folded into.
pub(crate) fn aggregate_temporal_windows(
    raw_windows: &[WindowedEmbedding],
    max_windows: usize,
) -> (Vec<WindowedEmbedding>, Vec<usize>) {
    let n = raw_windows.len();
    if n == 0 {
        return (Vec::new(), Vec::new());
    }
    let max = max_windows.max(1);
    let group_size = ((n + max - 1) / max).max(1); // ceil(n / max)
    let num_groups = (n + group_size - 1) / group_size;

    let mut aggregated: Vec<WindowedEmbedding> = Vec::with_capacity(num_groups);
    let mut original_to_block: Vec<usize> = Vec::with_capacity(n);

    for g in 0..num_groups {
        let start = g * group_size;
        let end = (start + group_size).min(n);
        let count = (end - start) as f32;

        let dim = raw_windows[start].vec.len();
        let mut mean = vec![0.0f32; dim];
        for w in &raw_windows[start..end] {
            for (i, &v) in w.vec.iter().enumerate() {
                mean[i] += v;
            }
        }
        for v in &mut mean {
            *v /= count;
        }

        // L2-normalize
        let norm: f32 = mean.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            let inv = 1.0 / norm;
            for v in &mut mean {
                *v *= inv;
            }
        }

        aggregated.push(WindowedEmbedding {
            audio_start: raw_windows[start].audio_start,
            audio_end: raw_windows[end - 1].audio_end,
            vec: mean,
        });

        for _ in start..end {
            original_to_block.push(g);
        }
    }

    (aggregated, original_to_block)
}

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
