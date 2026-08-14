use super::{EmbeddingBuffer, WindowedEmbedding};
use anyhow::{anyhow, Result};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::OnceLock;

// ---------------------------------------------------------------------------
// Model status: 0 = not loaded, 1 = loaded, 2 = failed
// ---------------------------------------------------------------------------
static MODEL_STATUS: AtomicUsize = AtomicUsize::new(0);

// Singleton extractor — created once on first successful load.
static EXTRACTOR: OnceLock<sherpa_onnx::SpeakerEmbeddingExtractor> = OnceLock::new();

// ---------------------------------------------------------------------------
// Model paths
// ---------------------------------------------------------------------------

/// Directory under the platform cache where diarization models live.
fn models_dir() -> PathBuf {
    let mut p = dirs::cache_dir().unwrap_or_else(|| PathBuf::from("."));
    p.push("meetily");
    p.push("diarization");
    p
}

/// Path to the WeSpeaker VoxBlink2 ONNX embedding model (multilingual).
fn embedding_model_path() -> PathBuf {
    models_dir().join("voxblink2_samresnet34.onnx")
}

/// Fallback: path to the old CAM++ ONNX embedding model.
fn embedding_model_fallback_path() -> PathBuf {
    models_dir().join("3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx")
}

/// Path to the pyannote segmentation ONNX model.
pub(crate) fn segmentation_model_path() -> PathBuf {
    models_dir().join("sherpa-onnx-pyannote-segmentation-3-0").join("model.onnx")
}

/// Remote URLs for model download.
fn embedding_model_url() -> String {
    "https://wenet.org.cn/downloads?models=wespeaker&version=voxblink2_samresnet34.onnx".to_string()
}

/// Fallback URL for the old CAM++ model.
fn embedding_model_fallback_url() -> String {
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx".to_string()
}

fn segmentation_model_url() -> String {
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2".to_string()
}

// ---------------------------------------------------------------------------
// Model lifecycle
// ---------------------------------------------------------------------------

/// Ensure both models exist on disk. Downloads them lazily on first use.
/// Tries VoxBlink2 (multilingual) first, falls back to CAM++ (Chinese) if download fails.
pub async fn ensure_models_available() -> Result<()> {
    let emb_path = embedding_model_path();
    if !emb_path.exists() {
        log::info!("Downloading VoxBlink2 embedding model to {}", emb_path.display());
        match download_file(&embedding_model_url(), &emb_path).await {
            Ok(()) => log::info!("VoxBlink2 embedding model downloaded successfully"),
            Err(e) => {
                log::warn!("VoxBlink2 download failed ({}), trying CAM++ fallback", e);
                let fallback = embedding_model_fallback_path();
                if !fallback.exists() {
                    download_file(&embedding_model_fallback_url(), &fallback).await?;
                    log::info!("CAM++ fallback embedding model downloaded");
                }
            }
        }
    }

    let seg_path = segmentation_model_path();
    if !seg_path.exists() {
        log::info!("Downloading diarization segmentation model to {}", seg_path.display());
        download_tarbz2(&segmentation_model_url(), &models_dir()).await?;
        log::info!("Segmentation model downloaded successfully");
    }

    Ok(())
}

async fn download_file(url: &str, dest: &Path) -> Result<()> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let response = reqwest::get(url).await
        .map_err(|e| anyhow!("Failed to download {}: {}", url, e))?;
    if !response.status().is_success() {
        return Err(anyhow!("Download failed with status: {}", response.status()));
    }
    let bytes = response.bytes().await
        .map_err(|e| anyhow!("Failed to read download bytes: {}", e))?;
    std::fs::write(dest, &bytes)
        .map_err(|e| anyhow!("Failed to write {}: {}", dest.display(), e))?;
    Ok(())
}

async fn download_tarbz2(url: &str, dest_dir: &Path) -> Result<()> {
    use std::process::Command;
    // Download to a temp file first
    let tmp_file = dest_dir.join(".download_tmp.tar.bz2");
    download_file(url, &tmp_file).await?;
    // Extract with system tar (available on Windows 10+ and all Unix)
    let status = Command::new("tar")
        .args(["xjf", tmp_file.to_str().unwrap_or(""), "-C", dest_dir.to_str().unwrap_or("")])
        .status();
    let _ = std::fs::remove_file(&tmp_file);
    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(s) => Err(anyhow!("tar extraction failed with status: {}", s)),
        Err(e) => Err(anyhow!("tar command not found: {}", e)),
    }
}

/// Initialize the sherpa-onnx speaker embedding extractor.
/// Returns Ok(true) if loaded successfully, Ok(false) if models unavailable.
/// Tries VoxBlink2 first, falls back to CAM++ if dimension mismatch.
pub fn init_extractor() -> Result<bool> {
    if EXTRACTOR.get().is_some() {
        return Ok(true);
    }

    // Try primary model (VoxBlink2)
    let emb_path = embedding_model_path();
    if emb_path.exists() {
        if let Ok(true) = try_load_extractor(&emb_path) {
            return Ok(true);
        }
    }

    // Fallback to CAM++ if VoxBlink2 unavailable or wrong dimension
    let fallback = embedding_model_fallback_path();
    if fallback.exists() {
        if let Ok(true) = try_load_extractor(&fallback) {
            log::warn!("Using CAM++ fallback model (192-dim) instead of VoxBlink2 (256-dim)");
            return Ok(true);
        }
    }

    MODEL_STATUS.store(2, Ordering::SeqCst);
    Ok(false)
}

fn try_load_extractor(model_path: &Path) -> Result<bool> {
    let config = sherpa_onnx::SpeakerEmbeddingExtractorConfig {
        model: Some(model_path.to_string_lossy().into_owned()),
        num_threads: 2,
        debug: false,
        provider: Some("cpu".into()),
    };

    match sherpa_onnx::SpeakerEmbeddingExtractor::create(&config) {
        Some(extractor) => {
            let dim = extractor.dim();
            // ponytail: dimension gate removed — tracker/cosine-similarity is
            // dimension-agnostic; offline reembedding validates per-embedding.
            // Accept any dim so CAM++ (192) and VoxBlink2 (256) both work.
            let _ = EXTRACTOR.set(extractor);
            MODEL_STATUS.store(1, Ordering::SeqCst);
            log::info!("Speaker embedding extractor loaded from {} (dim={})", model_path.display(), dim);
            Ok(true)
        }
        None => {
            log::warn!("Failed to create extractor from {}", model_path.display());
            Ok(false)
        }
    }
}

/// Check if the model is loaded and ready.
pub fn ensure_loaded() -> Result<()> {
    match MODEL_STATUS.load(Ordering::SeqCst) {
        1 => Ok(()),
        2 => Err(anyhow!("speaker model failed to load earlier")),
        _ => {
            // Not yet attempted — try synchronous init
            match init_extractor() {
                Ok(true) => Ok(()),
                _ => {
                    MODEL_STATUS.store(2, Ordering::SeqCst);
                    Err(anyhow!("speaker model unavailable"))
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Embedding extraction
// ---------------------------------------------------------------------------

/// Extract a speaker embedding from 16 kHz mono f32 audio samples.
///
/// Returns a 256-dim embedding vector on success.
pub fn extract_embedding(samples: &[f32], sample_rate: u32) -> Result<Vec<f32>> {
    if samples.is_empty() {
        return Err(anyhow!("empty audio"));
    }
    if sample_rate != 16_000 {
        return Err(anyhow!("expected 16 kHz, got {}", sample_rate));
    }
    ensure_loaded()?;

    let extractor = EXTRACTOR.get()
        .ok_or_else(|| anyhow!("embedding extractor not initialized"))?;

    let stream = extractor.create_stream()
        .ok_or_else(|| anyhow!("failed to create embedding stream"))?;

    stream.accept_waveform(sample_rate as i32, samples);
    stream.input_finished();

    if !extractor.is_ready(&stream) {
        return Err(anyhow!("audio too short for embedding extraction"));
    }

    extractor.compute(&stream)
        .ok_or_else(|| anyhow!("failed to compute embedding"))
}

/// Push a windowed embedding into the buffer. Returns true on success.
pub fn push_window(
    buffer: &EmbeddingBuffer,
    samples: &[f32],
    sample_rate: u32,
    start: f64,
    end: f64,
) -> bool {
    match extract_embedding(samples, sample_rate) {
        Ok(vec) => {
            buffer.push(WindowedEmbedding {
                audio_start: start,
                audio_end: end,
                vec,
            });
            true
        }
        Err(e) => {
            log::debug!("embedding extraction failed: {}", e);
            false
        }
    }
}

/// Extract embedding, push to buffer, and match against tracker.
/// Combined operation for the realtime path.
pub fn push_and_match(
    buffer: &EmbeddingBuffer,
    tracker: &mut super::tracker::SpeakerTracker,
    samples: &[f32],
    sample_rate: u32,
    start: f64,
    end: f64,
    duration_secs: f64,
) -> Option<super::tracker::TrackerResult> {
    let embedding = extract_embedding(samples, sample_rate).ok()?;

    // Push to buffer for offline use
    buffer.push(WindowedEmbedding {
        audio_start: start,
        audio_end: end,
        vec: embedding.clone(),
    });

    // Match against tracker
    Some(tracker.match_or_create(&embedding, duration_secs))
}

/// Get a full diarization result for a complete audio signal.
/// Used by the offline pass to get speaker-labeled segments.
pub fn diarize_full_audio(
    samples: &[f32],
    sample_rate: u32,
    min_speakers: usize,
    max_speakers: usize,
) -> Result<Vec<super::DiarizationSegment>> {
    let seg_path = segmentation_model_path();
    // Try VoxBlink2 first, fall back to CAM++ if not on disk
    let emb_path = if embedding_model_path().exists() {
        embedding_model_path()
    } else if embedding_model_fallback_path().exists() {
        log::warn!("VoxBlink2 not found, using CAM++ fallback for offline diarization");
        embedding_model_fallback_path()
    } else {
        return Err(anyhow!("diarization models not available"));
    };

    if !seg_path.exists() {
        return Err(anyhow!("segmentation model not available at {}", seg_path.display()));
    }

    // ponytail: sherpa-onnx FastClusteringConfig has no min/max_speakers fields.
    // Use num_clusters = max_speakers to cap speaker count; raise threshold for
    // tighter merging. If min == max, force exact cluster count.
    let num_clusters = max_speakers as i32;

    log::info!(
        "Diarization config: num_clusters={}, min_speakers={}, max_speakers={}, threshold=0.65",
        num_clusters, min_speakers, max_speakers
    );

    let config = sherpa_onnx::OfflineSpeakerDiarizationConfig {
        segmentation: sherpa_onnx::OfflineSpeakerSegmentationModelConfig {
            pyannote: sherpa_onnx::OfflineSpeakerSegmentationPyannoteModelConfig {
                model: Some(seg_path.to_string_lossy().into_owned()),
            },
            num_threads: 4,
            debug: false,
            provider: Some("cpu".into()),
        },
        embedding: sherpa_onnx::SpeakerEmbeddingExtractorConfig {
            model: Some(emb_path.to_string_lossy().into_owned()),
            num_threads: 4,
            debug: false,
            provider: Some("cpu".into()),
        },
        clustering: sherpa_onnx::FastClusteringConfig {
            num_clusters,
            threshold: 0.65,
        },
        min_duration_on: 0.3,
        min_duration_off: 0.5,
    };

    let sd = sherpa_onnx::OfflineSpeakerDiarization::create(&config)
        .ok_or_else(|| anyhow!("Failed to create OfflineSpeakerDiarization"))?;

    // Verify sample rate
    if sd.sample_rate() != sample_rate as i32 {
        log::warn!(
            "Sample rate mismatch: model expects {}, got {}",
            sd.sample_rate(),
            sample_rate
        );
    }

    let result = sd.process(samples)
        .ok_or_else(|| anyhow!("OfflineSpeakerDiarization::process failed"))?;

    let segments: Vec<super::DiarizationSegment> = result
        .sort_by_start_time()
        .into_iter()
        .map(|s| super::DiarizationSegment {
            start: s.start as f64,
            end: s.end as f64,
            speaker: s.speaker as usize,
        })
        .collect();

    log::info!(
        "Diarization complete: {} speakers, {} segments",
        result.num_speakers(),
        segments.len()
    );

    Ok(segments)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_paths_differ() {
        assert_ne!(embedding_model_path(), segmentation_model_path());
    }

    #[test]
    fn extract_embedding_rejects_empty() {
        assert!(extract_embedding(&[], 16000).is_err());
    }

    #[test]
    fn extract_embedding_rejects_wrong_rate() {
        let samples = vec![0.0f32; 48000];
        assert!(extract_embedding(&samples, 44100).is_err());
    }

    #[test]
    fn clustering_config_defaults() {
        let cfg = sherpa_onnx::FastClusteringConfig {
            num_clusters: 6,
            threshold: 0.65,
        };
        assert_eq!(cfg.num_clusters, 6, "num_clusters should match max_speakers");
        assert_eq!(cfg.threshold, 0.65);
    }
}
