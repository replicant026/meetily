//! Overlap detection via pyannote segmentation model (powerset encoding).
//!
//! Runs the pyannote segmentation-3.0 ONNX model to detect per-frame
//! speaker activity and overlapping speech. Uses `ort` crate directly
//! for inference (same runtime as the Parakeet engine).
//!
//! Reference: screenpipe segment.rs — powerset classes:
//!   0 = silence, 1..=3 = single speaker, 4+ = overlapping speakers

use anyhow::{anyhow, Result};
use ndarray::{Array1, Array3, IxDyn};
use ort::execution_providers::CPUExecutionProvider;
use ort::inputs;
use ort::session::builder::GraphOptimizationLevel;
use ort::session::Session;
use ort::value::TensorRef;
use std::path::Path;

use super::embedding::segmentation_model_path;

/// Pyannote segmentation frame size in samples (270 at 16kHz).
const FRAME_SIZE: usize = 270;
/// Pyannote segmentation input: 10-second windows.
const WINDOW_SECONDS: usize = 10;
/// First class index that represents overlapping speakers.
const FIRST_OVERLAP_CLASS: usize = 4;

/// Single frame prediction from the segmentation model.
#[derive(Debug, Clone)]
pub struct SegmentationFrame {
    /// Powerset class index (0=silence, 1-3=single, 4+=overlap).
    pub class_index: usize,
    /// Frame start time in seconds (relative to window start).
    pub start_time: f64,
    /// Frame end time in seconds.
    pub end_time: f64,
}

/// Result of overlap detection on a 10-second window.
#[derive(Debug, Clone)]
pub struct OverlapResult {
    /// Whether any overlap was detected.
    pub has_overlap: bool,
    /// Fraction of speech frames that have overlap (0.0 - 1.0).
    pub overlap_ratio: f64,
    /// Per-frame predictions.
    pub frames: Vec<SegmentationFrame>,
}

/// Wrapper around the pyannote segmentation ONNX model.
pub struct OverlapDetector {
    session: Session,
}

impl OverlapDetector {
    /// Load the pyannote segmentation model via ort.
    pub fn new() -> Result<Self> {
        let model_path = segmentation_model_path();
        if !model_path.exists() {
            return Err(anyhow!(
                "pyannote segmentation model not found at {}",
                model_path.display()
            ));
        }

        let providers = vec![CPUExecutionProvider::default().build()];
        let session = Session::builder()?
            .with_optimization_level(GraphOptimizationLevel::Level3)?
            .with_execution_providers(providers)?
            .commit_from_file(&model_path)?;

        log::info!("OverlapDetector loaded from {}", model_path.display());
        Ok(Self { session })
    }

    /// Process a 10-second audio window (16kHz mono f32).
    /// Returns per-frame class predictions.
    pub fn process_window(&mut self, samples: &[f32], sample_rate: u32) -> Result<OverlapResult> {
        if sample_rate != 16_000 {
            return Err(anyhow!("expected 16 kHz, got {}", sample_rate));
        }

        let expected_len = sample_rate as usize * WINDOW_SECONDS;
        let audio: Vec<f32> = if samples.len() >= expected_len {
            samples[..expected_len].to_vec()
        } else {
            // Pad with zeros if shorter
            let mut padded = vec![0.0f32; expected_len];
            padded[..samples.len()].copy_from_slice(samples);
            padded
        };
        let audio_len = audio.len();

        // Input shape: [1, num_samples]
        let input_array = Array3::from_shape_vec(
            (1, 1, audio_len),
            audio,
        )?;
        let input_view = input_array.into_dimensionality::<IxDyn>()?;

        let inputs = inputs!["input" => TensorRef::from_array_view(&input_view)?];

        let outputs = self.session.run(inputs)?;

        // Output shape: [1, num_frames, num_classes]
        let output: ndarray::ArrayD<f32> = outputs
            .get("output")
            .ok_or_else(|| anyhow!("no output tensor named 'output' from segmentation model"))?
            .try_extract_array()?
            .to_owned();

        let output = output.into_dimensionality::<ndarray::Ix3>()?;
        let (_, num_frames, _num_classes) = output.dim();

        let samples_per_frame = audio_len / num_frames.max(1);
        let mut frames = Vec::with_capacity(num_frames);
        let mut speech_frames = 0u32;
        let mut overlap_frames = 0u32;

        for f in 0..num_frames {
            // Argmax over classes
            let frame_data = output.slice(ndarray::s![0, f, ..]);
            let class_index = frame_data
                .iter()
                .enumerate()
                .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))
                .map(|(i, _)| i)
                .unwrap_or(0);

            let start_time = (f * samples_per_frame) as f64 / sample_rate as f64;
            let end_time = ((f + 1) * samples_per_frame) as f64 / sample_rate as f64;

            if class_index > 0 {
                // Non-silence = speech
                speech_frames += 1;
                if class_index >= FIRST_OVERLAP_CLASS {
                    overlap_frames += 1;
                }
            }

            frames.push(SegmentationFrame {
                class_index,
                start_time,
                end_time,
            });
        }

        let overlap_ratio = if speech_frames > 0 {
            overlap_frames as f64 / speech_frames as f64
        } else {
            0.0
        };

        Ok(OverlapResult {
            has_overlap: overlap_frames > 0,
            overlap_ratio,
            frames,
        })
    }

    /// Check if a specific time range (in seconds, relative to window start)
    /// contains overlapping speech.
    pub fn has_overlap_at(&self, start: f64, end: f64, result: &OverlapResult) -> bool {
        result.frames.iter().any(|f| {
            f.class_index >= FIRST_OVERLAP_CLASS && f.start_time < end && f.end_time > start
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlap_constants() {
        assert_eq!(FRAME_SIZE, 270);
        assert_eq!(WINDOW_SECONDS, 10);
        assert_eq!(FIRST_OVERLAP_CLASS, 4);
    }
}
