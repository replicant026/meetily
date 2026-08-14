// audio/transcription/worker.rs
//
// Parallel transcription worker pool and chunk processing logic.

use super::engine::TranscriptionEngine;
use super::provider::TranscriptionError;
use crate::audio::AudioChunk;
use crate::audio::RecordingDeviceType as DeviceType;
use log::{error, info, warn};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, Emitter, Runtime};

struct MergedChunk {
    chunk: AudioChunk,
    sub_chunks: usize,
}

fn merge_audio_chunks(buffer: &mut Vec<AudioChunk>, total_samples: &mut usize) -> MergedChunk {
    let sub_chunks = buffer.len();
    let first_ts = buffer.first().map(|c| c.timestamp).unwrap_or(0.0);
    let chunk_id = buffer.first().map(|c| c.chunk_id).unwrap_or(0);

    // Concatenate all audio data
    let mut merged_data = Vec::with_capacity(*total_samples);
    for chunk in buffer.drain(..) {
        merged_data.extend(chunk.data);
    }
    *total_samples = 0;

    MergedChunk {
        chunk: AudioChunk {
            data: merged_data,
            sample_rate: 16000,
            timestamp: first_ts,
            chunk_id,
            device_type: DeviceType::Microphone,
        },
        sub_chunks,
    }
}

// Sequence counter for transcript updates
static SEQUENCE_COUNTER: AtomicU64 = AtomicU64::new(0);

// Speech detection flag - reset per recording session
static SPEECH_DETECTED_EMITTED: AtomicBool = AtomicBool::new(false);

// Auto language detection: pin detected language after first successful transcription
static LANGUAGE_DETECTED: AtomicBool = AtomicBool::new(false);
static DETECTED_LANGUAGE: Lazy<RwLock<Option<String>>> = Lazy::new(|| RwLock::new(None));

/// Reset detected language state for a new recording session
pub fn reset_detected_language() {
    LANGUAGE_DETECTED.store(false, Ordering::SeqCst);
    if let Ok(mut lang) = DETECTED_LANGUAGE.write() {
        *lang = None;
    }
    info!("Auto language detection reset for new session");
}

// Overlap detector singleton (lazy-init, thread-safe via Mutex)
static OVERLAP_DETECTOR: Mutex<Option<crate::diarization::overlap::OverlapDetector>> = Mutex::new(None);

fn ensure_overlap_detector() -> Option<&'static Mutex<Option<crate::diarization::overlap::OverlapDetector>>> {
    // Try to initialize if empty
    {
        let mut guard = OVERLAP_DETECTOR.lock().ok()?;
        if guard.is_none() {
            match crate::diarization::overlap::OverlapDetector::new() {
                Ok(det) => *guard = Some(det),
                Err(e) => {
                    log::debug!("OverlapDetector unavailable: {}", e);
                    return None;
                }
            }
        }
    }
    Some(&OVERLAP_DETECTOR)
}

/// Reset the speech detected flag for a new recording session
pub fn reset_speech_detected_flag() {
    SPEECH_DETECTED_EMITTED.store(false, Ordering::SeqCst);
    info!("🔍 SPEECH_DETECTED_EMITTED reset to: {}", SPEECH_DETECTED_EMITTED.load(Ordering::SeqCst));
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TranscriptUpdate {
    pub text: String,
    pub timestamp: String, // Wall-clock time for reference (e.g., "14:30:05")
    pub source: String,
    pub sequence_id: u64,
    pub chunk_start_time: f64, // Legacy field, kept for compatibility
    pub is_partial: bool,
    pub confidence: f32,
    // NEW: Recording-relative timestamps for playback sync
    pub audio_start_time: f64, // Seconds from recording start (e.g., 125.3)
    pub audio_end_time: f64,   // Seconds from recording start (e.g., 128.6)
    pub duration: f64,          // Segment duration in seconds (e.g., 3.3)
    // PR-44a: realtime speaker hint derived from the VAD segment. Persisted
    // on the segment only after offline re-clustering (PR-44b); until then
    // the value is advisory and the frontend renders it with a badge.
    #[serde(skip_serializing_if = "Option::is_none", rename = "transientSpeaker")]
    pub transient_speaker: Option<String>,
    /// Whether overlapping speech was detected during this segment.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overlap: Option<bool>,
}

// NOTE: get_transcript_history and get_recording_meeting_name functions
// have been moved to recording_commands.rs where they have access to RECORDING_MANAGER

/// Optimized parallel transcription task ensuring ZERO chunk loss
pub fn start_transcription_task<R: Runtime>(
    app: AppHandle<R>,
    transcription_receiver: tokio::sync::mpsc::UnboundedReceiver<AudioChunk>,
    initial_prompt: Option<String>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        info!("🚀 Starting optimized parallel transcription task - guaranteeing zero chunk loss");

        // Initialize transcription engine (Whisper or Parakeet based on config)
        let transcription_engine = match super::engine::get_or_init_transcription_engine(&app).await {
            Ok(engine) => engine,
            Err(e) => {
                error!("Failed to initialize transcription engine: {}", e);
                let _ = app.emit("transcription-error", serde_json::json!({
                    "error": e,
                    "userMessage": "Recording failed: Unable to initialize speech recognition. Please check your model settings.",
                    "actionable": true
                }));
                return;
            }
        };

        // Create parallel workers for faster processing while preserving ALL chunks
        const NUM_WORKERS: usize = 1; // Serial processing ensures transcripts emit in chronological order
        let (work_sender, work_receiver) = tokio::sync::mpsc::unbounded_channel::<AudioChunk>();
        let work_receiver = Arc::new(tokio::sync::Mutex::new(work_receiver));

        // Track completion: AtomicU64 for chunks queued, AtomicU64 for chunks completed
        let chunks_queued = Arc::new(AtomicU64::new(0));
        let chunks_completed = Arc::new(AtomicU64::new(0));
        let input_finished = Arc::new(AtomicBool::new(false));

        info!("📊 Starting {} transcription worker{} (serial mode for ordered emission)", NUM_WORKERS, if NUM_WORKERS == 1 { "" } else { "s" });

        // Spawn worker tasks
        let mut worker_handles = Vec::new();
        for worker_id in 0..NUM_WORKERS {
            let engine_clone = match &transcription_engine {
                TranscriptionEngine::Whisper(e) => TranscriptionEngine::Whisper(e.clone()),
                TranscriptionEngine::Parakeet(e) => TranscriptionEngine::Parakeet(e.clone()),
                TranscriptionEngine::Provider(p) => TranscriptionEngine::Provider(p.clone()),
            };
            let app_clone = app.clone();
            let work_receiver_clone = work_receiver.clone();
            let chunks_completed_clone = chunks_completed.clone();
            let input_finished_clone = input_finished.clone();
            let chunks_queued_clone = chunks_queued.clone();
            let initial_prompt_clone = initial_prompt.clone();

            let worker_handle = tokio::spawn(async move {
                info!("👷 Worker {} started", worker_id);

                // PRE-VALIDATE model state to avoid repeated async calls per chunk
                let initial_model_loaded = engine_clone.is_model_loaded().await;
                let current_model = engine_clone
                    .get_current_model()
                    .await
                    .unwrap_or_else(|| "unknown".to_string());

                let engine_name = engine_clone.provider_name();

                if initial_model_loaded {
                    info!(
                        "✅ Worker {} pre-validation: {} model '{}' is loaded and ready",
                        worker_id, engine_name, current_model
                    );
                } else {
                    warn!("⚠️ Worker {} pre-validation: {} model not loaded - chunks may be skipped", worker_id, engine_name);
                }

                loop {
                    // Try to get a chunk to process
                    let chunk = {
                        let mut receiver = work_receiver_clone.lock().await;
                        receiver.recv().await
                    };

                    match chunk {
                        Some(chunk) => {
                            // PERFORMANCE OPTIMIZATION: Reduce logging in hot path
                            // Only log every 10th chunk per worker to reduce I/O overhead
                            let should_log_this_chunk = chunk.chunk_id % 10 == 0;

                            if should_log_this_chunk {
                                info!(
                                    "👷 Worker {} processing chunk {} with {} samples",
                                    worker_id,
                                    chunk.chunk_id,
                                    chunk.data.len()
                                );
                            }

                            // Check if model is still loaded before processing
                            if !engine_clone.is_model_loaded().await {
                                warn!("⚠️ Worker {}: Model unloaded, but continuing to preserve chunk {}", worker_id, chunk.chunk_id);
                                // Still count as completed even if we can't process
                                chunks_completed_clone.fetch_add(1, Ordering::SeqCst);
                                continue;
                            }

                            let chunk_timestamp = chunk.timestamp;
                            let chunk_duration = chunk.data.len() as f64 / chunk.sample_rate as f64;
                            let diarization_samples = chunk.data.clone();
                            let diarization_sample_rate = chunk.sample_rate;

                            // Transcribe — returns sub-segments for Whisper (one per sentence),
                            // single segment for Parakeet/Provider.
                            const MAX_RETRIES: u32 = 2;
                            const RETRY_DELAY_MS: u64 = 500;

                            let mut retries = 0u32;
                            let result = loop {
                                match transcribe_chunk_segments(
                                    &engine_clone,
                                    chunk.clone(),
                                    &app_clone,
                                    initial_prompt_clone.clone(),
                                )
                                .await
                                {
                                    Ok(segments) => break Ok(segments),
                                    Err(e) => match e {
                                        TranscriptionError::AudioTooShort { .. } => break Err(e),
                                        TranscriptionError::ModelNotLoaded => break Err(e),
                                        _ => {
                                            if retries < MAX_RETRIES {
                                                retries += 1;
                                                warn!(
                                                    "Worker {}: Transcription failed (attempt {}/{}): {} - retrying in {}ms",
                                                    worker_id, retries, MAX_RETRIES + 1, e, RETRY_DELAY_MS
                                                );
                                                tokio::time::sleep(tokio::time::Duration::from_millis(RETRY_DELAY_MS)).await;
                                            } else {
                                                warn!(
                                                    "Worker {}: Transcription failed after {} attempts: {}",
                                                    worker_id, MAX_RETRIES + 1, e
                                                );
                                                let _ = app_clone.emit("transcription-warning", e.to_string());
                                                break Err(e);
                                            }
                                        }
                                    }
                                }
                            };

                            match result {
                                Ok(segments) => {
                                    // Provider-aware confidence threshold
                                    let confidence_threshold = match &engine_clone {
                                        TranscriptionEngine::Whisper(_) | TranscriptionEngine::Provider(_) => 0.3,
                                        TranscriptionEngine::Parakeet(_) => 0.0,
                                    };

                                    if segments.is_empty() {
                                        if should_log_this_chunk {
                                            info!("Worker {}: empty transcription", worker_id);
                                        }
                                    } else {
                                        // Emit speech-detected event once per session
                                        let current_flag = SPEECH_DETECTED_EMITTED.load(Ordering::SeqCst);
                                        if !current_flag {
                                            SPEECH_DETECTED_EMITTED.store(true, Ordering::SeqCst);
                                            let _ = app_clone.emit("speech-detected", serde_json::json!({
                                                "message": "Speech activity detected"
                                            }));
                                        }

                                        // Realtime speaker identification via online cosine matching
                                        let transient_speaker: Option<String> = {
                                            let buf = crate::audio::recording_commands::current_diarization_buffer();
                                            let tracker_arc = crate::audio::recording_commands::current_speaker_tracker();
                                            tracker_arc.lock().ok().and_then(|mut tracker| {
                                                crate::diarization::embedding::push_and_match(
                                                    buf.as_ref(),
                                                    &mut tracker,
                                                    &diarization_samples,
                                                    diarization_sample_rate,
                                                    chunk_timestamp,
                                                    chunk_timestamp + chunk_duration,
                                                    chunk_duration,
                                                ).and_then(|r| {
                                                    use crate::diarization::tracker::MatchResult;
                                                    match r.match_result {
                                                        MatchResult::Skipped => None,
                                                        MatchResult::Matched { label, .. }
                                                        | MatchResult::NewSpeaker { label, .. }
                                                        | MatchResult::ForceMerged { label, .. } => Some(label),
                                                    }
                                                })
                                            })
                                        };

                                        // Overlap detection via pyannote segmentation model.
                                        // NOTE: input is VAD-filtered speech only — the detector
                                        // will miss overlaps within silence regions (acceptable).
                                        // Skip for very short chunks (<0.5s) — model pads to 10s
                                        // of silence and produces garbage on tiny inputs.
                                        let overlap_detected: Option<bool> = if chunk_duration < 0.5 {
                                            None
                                        } else {
                                            ensure_overlap_detector().and_then(|det| {
                                                det.lock().ok().and_then(|mut guard| {
                                                    guard.as_mut().and_then(|d| {
                                                        // Run on 16kHz mono audio; detector pads to 10s automatically
                                                        d.process_window(&diarization_samples, diarization_sample_rate)
                                                            .ok()
                                                            .map(|r| r.has_overlap)
                                                    })
                                                })
                                            })
                                        };

                                        // Emit one TranscriptUpdate per sub-segment.
                                        // Whisper sub-segments carry centisecond timestamps -> map to recording-relative seconds.
                                        for seg in &segments {
                                            let meets_threshold = seg.confidence.map_or(true, |c| c >= confidence_threshold);
                                            if seg.text.trim().is_empty() || !meets_threshold {
                                                continue;
                                            }

                                            let sequence_id = SEQUENCE_COUNTER.fetch_add(1, Ordering::SeqCst);

                                            // Use whisper centisecond timestamps when available,
                                            // fall back to chunk-level timestamps for Parakeet/Provider.
                                            let (audio_start_time, audio_end_time, dur) =
                                                if let (Some(start_cs), Some(end_cs)) = (seg.start_cs, seg.end_cs) {
                                                    let s = chunk_timestamp + (start_cs as f64 * 0.01);
                                                    let e = chunk_timestamp + (end_cs as f64 * 0.01);
                                                    (s, e, e - s)
                                                } else {
                                                    (chunk_timestamp, chunk_timestamp + chunk_duration, chunk_duration)
                                                };

                                            let update = TranscriptUpdate {
                                                transient_speaker: transient_speaker.clone(),
                                                overlap: overlap_detected,
                                                text: seg.text.clone(),
                                                timestamp: format_current_timestamp(),
                                                source: "Audio".to_string(),
                                                sequence_id,
                                                chunk_start_time: chunk_timestamp,
                                                is_partial: seg.is_partial,
                                                confidence: seg.confidence.unwrap_or(0.85),
                                                audio_start_time,
                                                audio_end_time,
                                                duration: dur,
                                            };

                                            if let Err(e) = app_clone.emit("transcript-update", &update) {
                                                error!("Worker {}: Failed to emit transcript update: {}", worker_id, e);
                                            }
                                        }

                                        if should_log_this_chunk {
                                            let total_text: String = segments.iter().map(|s| s.text.as_str()).collect::<Vec<_>>().join(" | ");
                                            let preview = if total_text.len() > 100 { &total_text[..100] } else { &total_text };
                                            info!("Worker {} emitted {} sub-segments: '{}'",
                                                  worker_id, segments.len(), preview);
                                        }
                                    }
                                }
                                Err(e @ TranscriptionError::AudioTooShort { .. }) => {
                                    info!("Worker {}: {}", worker_id, e);
                                    chunks_completed_clone.fetch_add(1, Ordering::SeqCst);
                                    continue;
                                }
                                Err(TranscriptionError::ModelNotLoaded) => {
                                    warn!("Worker {}: Model unloaded during transcription", worker_id);
                                    chunks_completed_clone.fetch_add(1, Ordering::SeqCst);
                                    continue;
                                }
                                Err(_) => {
                                    // Warning already emitted in retry loop; fall through to chunk completion
                                }
                            }

                            // Mark chunk as completed
                            let completed =
                                chunks_completed_clone.fetch_add(1, Ordering::SeqCst) + 1;
                            let queued = chunks_queued_clone.load(Ordering::SeqCst);

                            // PERFORMANCE: Only log progress every 5th chunk to reduce I/O overhead
                            if completed % 5 == 0 || should_log_this_chunk {
                                info!(
                                    "Worker {}: Progress {}/{} chunks ({:.1}%)",
                                    worker_id,
                                    completed,
                                    queued,
                                    (completed as f64 / queued.max(1) as f64 * 100.0)
                                );
                            }

                            // Emit progress event for frontend
                            let progress_percentage = if queued > 0 {
                                (completed as f64 / queued as f64 * 100.0) as u32
                            } else {
                                100
                            };

                            let _ = app_clone.emit("transcription-progress", serde_json::json!({
                                "worker_id": worker_id,
                                "chunks_completed": completed,
                                "chunks_queued": queued,
                                "progress_percentage": progress_percentage,
                                "message": format!("Worker {} processing... ({}/{})", worker_id, completed, queued)
                            }));
                        }
                        None => {
                            // No more chunks available
                            if input_finished_clone.load(Ordering::SeqCst) {
                                // Double-check that all queued chunks are actually completed
                                let final_queued = chunks_queued_clone.load(Ordering::SeqCst);
                                let final_completed = chunks_completed_clone.load(Ordering::SeqCst);

                                if final_completed >= final_queued {
                                    info!(
                                        "👷 Worker {} finishing - all {}/{} chunks processed",
                                        worker_id, final_completed, final_queued
                                    );
                                    break;
                                } else {
                                    warn!("👷 Worker {} detected potential chunk loss: {}/{} completed, waiting...", worker_id, final_completed, final_queued);
                                    // AGGRESSIVE POLLING: Reduced from 50ms to 5ms for faster chunk detection during shutdown
                                    tokio::time::sleep(tokio::time::Duration::from_millis(5)).await;
                                }
                            } else {
                                // AGGRESSIVE POLLING: Reduced from 10ms to 1ms for faster response during shutdown
                                tokio::time::sleep(tokio::time::Duration::from_millis(1)).await;
                            }
                        }
                    }
                }

                info!("👷 Worker {} completed", worker_id);
            });

            worker_handles.push(worker_handle);
        }

        // Main dispatcher: batch short chunks before dispatching to workers
        const MIN_BATCH_SAMPLES: usize = 16000; // 1 second at 16kHz
        const BATCH_TIMEOUT_MS: u64 = 200;

        let mut receiver = transcription_receiver;
        let mut batch_buffer: Vec<AudioChunk> = Vec::new();
        let mut batch_samples: usize = 0;
        let mut batch_start = tokio::time::Instant::now();

        while let Some(chunk) = receiver.recv().await {
            batch_buffer.push(chunk);
            batch_samples += batch_buffer.last().unwrap().data.len();

            let timeout_reached = batch_start.elapsed().as_millis() >= BATCH_TIMEOUT_MS as u128;

            if batch_samples >= MIN_BATCH_SAMPLES || timeout_reached {
                // Merge batch into single chunk and dispatch
                let merged = merge_audio_chunks(&mut batch_buffer, &mut batch_samples);
                let queued = chunks_queued.fetch_add(1, Ordering::SeqCst) + 1;
                info!("📥 Dispatching merged chunk ({} samples, {} sub-chunks) to workers (total queued: {})",
                      merged.chunk.data.len(), merged.sub_chunks, queued);
                if let Err(_) = work_sender.send(merged.chunk) {
                    error!("❌ Failed to send merged chunk to workers");
                    break;
                }
                batch_start = tokio::time::Instant::now();
            }
        }

        // Flush remaining batch
        if !batch_buffer.is_empty() {
            let merged = merge_audio_chunks(&mut batch_buffer, &mut batch_samples);
            let queued = chunks_queued.fetch_add(1, Ordering::SeqCst) + 1;
            info!("📥 Dispatching final merged chunk ({} samples, {} sub-chunks) to workers (total queued: {})",
                  merged.chunk.data.len(), merged.sub_chunks, queued);
            if let Err(_) = work_sender.send(merged.chunk) {
                error!("❌ Failed to send final merged chunk to workers");
            }
        }

        // Signal that input is finished
        input_finished.store(true, Ordering::SeqCst);
        drop(work_sender); // Close the channel to signal workers

        let total_chunks_queued = chunks_queued.load(Ordering::SeqCst);
        info!("📭 Input finished with {} total chunks queued. Waiting for all {} workers to complete...",
              total_chunks_queued, NUM_WORKERS);

        // Emit final chunk count to frontend
        let _ = app.emit("transcription-queue-complete", serde_json::json!({
            "total_chunks": total_chunks_queued,
            "message": format!("{} chunks queued for processing - waiting for completion", total_chunks_queued)
        }));

        // Wait for all workers to complete
        for (worker_id, handle) in worker_handles.into_iter().enumerate() {
            if let Err(e) = handle.await {
                error!("❌ Worker {} panicked: {:?}", worker_id, e);
            } else {
                info!("✅ Worker {} completed successfully", worker_id);
            }
        }

        // Final verification with retry logic to catch any stragglers
        let mut verification_attempts = 0;
        const MAX_VERIFICATION_ATTEMPTS: u32 = 10;

        loop {
            let final_queued = chunks_queued.load(Ordering::SeqCst);
            let final_completed = chunks_completed.load(Ordering::SeqCst);

            if final_queued == final_completed {
                info!(
                    "🎉 ALL {} chunks processed successfully - ZERO chunks lost!",
                    final_completed
                );
                break;
            } else if verification_attempts < MAX_VERIFICATION_ATTEMPTS {
                verification_attempts += 1;
                warn!("⚠️ Chunk count mismatch (attempt {}): {} queued, {} completed - waiting for stragglers...",
                     verification_attempts, final_queued, final_completed);

                // Wait a bit for any remaining chunks to be processed
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            } else {
                error!(
                    "❌ CRITICAL: After {} attempts, chunk loss detected: {} queued, {} completed",
                    MAX_VERIFICATION_ATTEMPTS, final_queued, final_completed
                );

                // Emit critical error event
                let _ = app.emit(
                    "transcript-chunk-loss-detected",
                    serde_json::json!({
                        "chunks_queued": final_queued,
                        "chunks_completed": final_completed,
                        "chunks_lost": final_queued - final_completed,
                        "message": "Some transcript chunks may have been lost during shutdown"
                    }),
                );
                break;
            }
        }

        info!("✅ Parallel transcription task completed - all workers finished, ready for model unload");
    })
}

/// A single transcription segment with its own text and confidence.
/// Used by `transcribe_chunk_segments` to return sub-segments from Whisper.
pub struct TranscriptionSegment {
    pub text: String,
    pub confidence: Option<f32>,
    pub is_partial: bool,
    /// Optional centisecond timestamps from whisper.cpp (start/end).
    /// When present, the worker maps these to recording-relative seconds.
    pub start_cs: Option<i64>,
    pub end_cs: Option<i64>,
}

/// Transcribe audio chunk and return sub-segments (one per Whisper internal segment).
/// For Whisper: splits long chunks into sentence-level sub-segments using timestamps.
/// For Parakeet/Provider: returns a single segment (no sub-segmentation).
async fn transcribe_chunk_segments<R: Runtime>(
    engine: &TranscriptionEngine,
    chunk: AudioChunk,
    app: &AppHandle<R>,
    initial_prompt: Option<String>,
) -> std::result::Result<Vec<TranscriptionSegment>, TranscriptionError> {
    // Compute duration before data is moved by resampling
    let chunk_duration = chunk.data.len() as f64 / chunk.sample_rate as f64;

    // Convert to 16kHz mono
    let speech_samples = if chunk.sample_rate != 16000 {
        crate::audio::audio_processing::resample_audio(&chunk.data, chunk.sample_rate, 16000)
    } else {
        chunk.data
    };

    if speech_samples.is_empty() {
        return Err(TranscriptionError::AudioTooShort { samples: 0, minimum: 1600 });
    }

    // Keep a copy for silence-based splitting (engines take ownership of speech_samples)
    let audio_for_split = speech_samples.clone();

    match engine {
        TranscriptionEngine::Whisper(whisper_engine) => {
            // Auto language detection: use pinned language from first chunk if available
            let language = {
                let detected = DETECTED_LANGUAGE.read().unwrap();
                if detected.is_some() {
                    detected.clone()
                } else {
                    crate::get_language_preference_internal()
                }
            };

            match whisper_engine
                .transcribe_audio_with_segments(speech_samples, language, initial_prompt)
                .await
            {
                Ok((ws_segments, avg_confidence)) => {
                    // After first successful transcription, mark language as detected
                    // to avoid re-detecting on subsequent chunks.
                    // ponytail: whisper-rs exposes full_lang_id_from_state() on WhisperState
                    // but transcribe_audio_with_segments doesn't return it yet. When it does,
                    // store the actual detected language code in DETECTED_LANGUAGE.
                    if !LANGUAGE_DETECTED.load(Ordering::SeqCst)
                        && DETECTED_LANGUAGE.read().unwrap().is_none()
                    {
                        LANGUAGE_DETECTED.store(true, Ordering::SeqCst);
                        info!("Auto language detection: first transcription complete, language pinned");
                    }

                    if ws_segments.is_empty() {
                        return Ok(vec![]);
                    }

                    let segments: Vec<TranscriptionSegment> = ws_segments
                        .into_iter()
                        .map(|ws| {
                            let is_partial = ws.text.len() < 50;
                            TranscriptionSegment {
                                text: ws.text,
                                confidence: Some(avg_confidence),
                                is_partial,
                                start_cs: Some(ws.start_cs),
                                end_cs: Some(ws.end_cs),
                            }
                        })
                        .collect();

                    info!(
                        "Whisper produced {} sub-segments for chunk {}",
                        segments.len(), chunk.chunk_id
                    );

                    Ok(segments)
                }
                Err(e) => {
                    error!("Whisper transcription failed for chunk {}: {}", chunk.chunk_id, e);
                    let transcription_error = TranscriptionError::EngineFailed(e.to_string());
                    let _ = app.emit(
                        "transcription-error",
                        &serde_json::json!({
                            "error": transcription_error.to_string(),
                            "userMessage": format!("Transcription failed: {}", transcription_error),
                            "actionable": false
                        }),
                    );
                    Err(transcription_error)
                }
            }
        }
        TranscriptionEngine::Parakeet(parakeet_engine) => {
            match parakeet_engine.transcribe_audio(speech_samples).await {
                Ok(text) => {
                    let cleaned = text.trim().to_string();
                    if cleaned.is_empty() {
                        return Ok(vec![]);
                    }
                    Ok(split_at_silence(&cleaned, &audio_for_split, 16000))
                }
                Err(e) => {
                    error!("Parakeet transcription failed for chunk {}: {}", chunk.chunk_id, e);
                    let err = TranscriptionError::EngineFailed(e.to_string());
                    let _ = app.emit("transcription-error", &serde_json::json!({
                        "error": err.to_string(),
                        "userMessage": format!("Transcription failed: {}", err),
                        "actionable": false
                    }));
                    Err(err)
                }
            }
        }
        TranscriptionEngine::Provider(provider) => {
            let language = {
                let detected = DETECTED_LANGUAGE.read().unwrap();
                if detected.is_some() {
                    detected.clone()
                } else {
                    crate::get_language_preference_internal()
                }
            };
            match provider.transcribe(speech_samples, language).await {
                Ok(result) => {
                    let cleaned = result.text.trim().to_string();
                    if cleaned.is_empty() {
                        return Ok(vec![]);
                    }
                    let mut segs = split_at_silence(&cleaned, &audio_for_split, 16000);
                    // Preserve confidence/partial from provider on first segment
                    if let Some(first) = segs.first_mut() {
                        first.confidence = result.confidence;
                        first.is_partial = result.is_partial;
                    }
                    Ok(segs)
                }
                Err(e) => {
                    error!("{} transcription failed for chunk {}: {}", provider.provider_name(), chunk.chunk_id, e);
                    let _ = app.emit("transcription-error", &serde_json::json!({
                        "error": e.to_string(),
                        "userMessage": format!("Transcription failed: {}", e),
                        "actionable": false
                    }));
                    Err(e)
                }
            }
        }
    }
}

/// Split long text at actual silence gaps in the audio.
///
/// Scans the raw 16kHz audio for energy dips (silence windows ≥ 150ms) and
/// uses those as split points. This is more accurate than punctuation-based
/// splitting because it reflects real pauses in speech.
///
/// Falls back to punctuation splitting if no audio is provided.
fn split_at_silence(text: &str, audio: &[f32], sample_rate: u32) -> Vec<TranscriptionSegment> {
    if text.len() < 100 || audio.len() < sample_rate as usize / 2 {
        return vec![TranscriptionSegment {
            text: text.to_string(),
            confidence: None,
            is_partial: false,
            start_cs: None,
            end_cs: None,
        }];
    }

    let chunk_duration = audio.len() as f64 / sample_rate as f64;

    // Scan for silence windows: 150ms windows with RMS energy below threshold
    const WINDOW_MS: usize = 150;
    const WINDOW_SAMPLES: usize = (16000 * WINDOW_MS) / 1000; // 2400 samples at 16kHz
    const SILENCE_RMS_THRESHOLD: f32 = 0.015; // empirically tuned for speech
    const MIN_GAP_MS: usize = 200; // ignore gaps shorter than 200ms

    let mut silence_windows: Vec<(usize, usize)> = Vec::new(); // (start_sample, end_sample)
    let mut i = 0;
    while i + WINDOW_SAMPLES <= audio.len() {
        let window = &audio[i..i + WINDOW_SAMPLES];
        let rms = (window.iter().map(|&x| x * x).sum::<f32>() / WINDOW_SAMPLES as f32).sqrt();

        if rms < SILENCE_RMS_THRESHOLD {
            // Extend existing window or start new one
            if let Some(last) = silence_windows.last_mut() {
                if i <= last.1 + WINDOW_SAMPLES {
                    last.1 = i + WINDOW_SAMPLES;
                } else {
                    silence_windows.push((i, i + WINDOW_SAMPLES));
                }
            } else {
                silence_windows.push((i, i + WINDOW_SAMPLES));
            }
        }
        i += WINDOW_SAMPLES / 2; // 50% overlap for smoother detection
    }

    // Filter: keep only gaps ≥ MIN_GAP_MS
    let min_gap_samples = (sample_rate as usize * MIN_GAP_MS) / 1000;
    let split_points: Vec<f64> = silence_windows
        .iter()
        .filter(|(start, end)| end - start >= min_gap_samples)
        .map(|(start, _)| *start as f64 / sample_rate as f64) // convert to seconds
        .collect();

    if split_points.is_empty() {
        // No significant silence found — fall back to punctuation splitting
        return split_by_punctuation(text, chunk_duration);
    }

    // Map split points to character positions proportionally
    let total_chars = text.len() as f64;
    let total_dur = chunk_duration;
    let mut segments: Vec<TranscriptionSegment> = Vec::new();
    let mut prev_time = 0.0f64;

    for (idx, &split_time) in split_points.iter().enumerate() {
        // Estimate character position from time proportion
        let char_pos = ((split_time / total_dur) * total_chars) as usize;
        let char_pos = char_pos.min(text.len());

        // Find nearest sentence boundary near char_pos (±30 chars)
        let search_start = char_pos.saturating_sub(30);
        let search_end = (char_pos + 30).min(text.len());
        let region = &text[search_start..search_end];

        // Look for punctuation boundary in search region
        let mut best_boundary = char_pos;
        let mut found_boundary = false;
        for (j, ch) in region.char_indices() {
            if matches!(ch, '.' | '!' | '?') {
                let abs_pos = search_start + j + 1; // after the punctuation
                if abs_pos > search_start && abs_pos < text.len() {
                    best_boundary = abs_pos;
                    found_boundary = true;
                    break;
                }
            }
        }

        if !found_boundary {
            // No punctuation nearby — split at estimated position (on whitespace)
            let region_bytes = text[search_start..search_end].as_bytes();
            for j in 0..region_bytes.len() {
                if region_bytes[j] == b' ' || region_bytes[j] == b'\n' {
                    best_boundary = search_start + j + 1;
                    break;
                }
            }
        }

        let start_char = (prev_time / total_dur * total_chars) as usize;
        let end_char = best_boundary.min(text.len());

        if end_char > start_char {
            let seg_text = text[start_char..end_char].trim().to_string();
            if !seg_text.is_empty() {
                segments.push(TranscriptionSegment {
                    text: seg_text,
                    confidence: None,
                    is_partial: false,
                    start_cs: None,
                    end_cs: None,
                });
            }
        }
        prev_time = split_time;
    }

    // Remaining text after last split
    let last_start_char = (prev_time / total_dur * total_chars) as usize;
    if last_start_char < text.len() {
        let seg_text = text[last_start_char..].trim().to_string();
        if !seg_text.is_empty() {
            segments.push(TranscriptionSegment {
                text: seg_text,
                confidence: None,
                is_partial: false,
                start_cs: None,
                end_cs: None,
            });
        }
    }

    if segments.len() < 2 {
        // Splitting produced too few segments — fall back to punctuation
        return split_by_punctuation(text, chunk_duration);
    }

    segments
}

/// Fallback: split at sentence punctuation (. ! ? followed by whitespace).
fn split_by_punctuation(text: &str, chunk_duration: f64) -> Vec<TranscriptionSegment> {
    let mut sentences: Vec<String> = Vec::new();
    let mut current = String::new();
    let chars: Vec<char> = text.chars().collect();

    for i in 0..chars.len() {
        current.push(chars[i]);
        let is_sentence_end = matches!(chars[i], '.' | '!' | '?');
        let next_is_space_or_end = i + 1 >= chars.len() || chars[i + 1].is_whitespace();

        if is_sentence_end && next_is_space_or_end && !current.trim().is_empty() {
            sentences.push(current.trim().to_string());
            current = String::new();
        }
    }
    if !current.trim().is_empty() {
        sentences.push(current.trim().to_string());
    }

    if sentences.len() < 2 {
        return vec![TranscriptionSegment {
            text: text.to_string(),
            confidence: None,
            is_partial: false,
            start_cs: None,
            end_cs: None,
        }];
    }

    let total_chars: f64 = sentences.iter().map(|s| s.len() as f64).sum();
    let mut elapsed = 0.0f64;

    sentences
        .into_iter()
        .map(|s| {
            let fraction = s.len() as f64 / total_chars;
            let dur = chunk_duration * fraction;
            let start = elapsed;
            elapsed += dur;
            TranscriptionSegment {
                text: s,
                confidence: None,
                is_partial: false,
                start_cs: None,
                end_cs: None,
            }
        })
        .collect()
}

/// Format current timestamp (wall-clock time)
fn format_current_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();

    let hours = (now.as_secs() / 3600) % 24;
    let minutes = (now.as_secs() / 60) % 60;
    let seconds = now.as_secs() % 60;

    format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
}

