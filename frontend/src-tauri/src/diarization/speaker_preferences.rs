//! Speaker recognition preferences: mode, channel locking, quality thresholds.
//!
//! Pure functions for action resolution and channel compatibility.  Runtime
//! state is stored in a process-global `Lazy<Mutex<…>>` (same pattern as
//! `DiarizationStatus`).  Persistence is handled on the frontend via
//! `tauri-plugin-store`; the Rust side just holds the working copy.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::database::repositories::voice_reference::RecognitionMode;

// ── Types ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerRecognitionPreferences {
    pub recognition_mode: RecognitionMode,
    pub lock_audio_channels: bool,
    pub minimum_reference_quality: f32,
}

impl Default for SpeakerRecognitionPreferences {
    fn default() -> Self {
        Self {
            recognition_mode: RecognitionMode::Suggest,
            lock_audio_channels: true,
            minimum_reference_quality: 0.60,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MatchAction {
    /// Do nothing — either mode is Off or confidence below threshold.
    Ignore,
    /// Create a suggestion row; do NOT update transcript labels.
    Suggest,
    /// Apply label updates immediately AND create a confirmed reference
    /// (subject to quality check at the call site).
    Apply,
}

// ── Pure functions ────────────────────────────────────────────────────────

const AUTOMATIC_APPLY_THRESHOLD: f32 = 0.90;

/// Resolve what action to take based on recognition mode, confidence, and minimum reference quality.
///
/// * `Off` → always `Ignore`
/// * `Suggest` → `Suggest` when confidence ≥ `min_quality`
/// * `Automatic` → `Apply` when ≥ 0.90, else `Suggest` when ≥ `min_quality`
pub fn resolve_match_action(mode: RecognitionMode, confidence: f32, min_quality: f32) -> MatchAction {
    match mode {
        RecognitionMode::Off => MatchAction::Ignore,
        RecognitionMode::Suggest => {
            if confidence >= min_quality {
                MatchAction::Suggest
            } else {
                MatchAction::Ignore
            }
        }
        RecognitionMode::Automatic => {
            if confidence >= AUTOMATIC_APPLY_THRESHOLD {
                MatchAction::Apply
            } else if confidence >= min_quality {
                MatchAction::Suggest
            } else {
                MatchAction::Ignore
            }
        }
    }
}

/// Check if two channels are compatible given the lock setting.
///
/// When `lock_channels` is false, any combination is allowed.
/// When true, channels must match exactly (case-insensitive).
pub fn channel_is_compatible(lock_channels: bool, ref_channel: &str, match_channel: &str) -> bool {
    if !lock_channels {
        return true;
    }
    ref_channel.eq_ignore_ascii_case(match_channel)
}

// ── Runtime state ─────────────────────────────────────────────────────────

static PREFS: once_cell::sync::Lazy<Mutex<SpeakerRecognitionPreferences>> =
    once_cell::sync::Lazy::new(|| Mutex::new(SpeakerRecognitionPreferences::default()));

/// Read the current preferences (snapshot).
pub fn get_preferences() -> SpeakerRecognitionPreferences {
    PREFS.lock().expect("speaker prefs lock").clone()
}

/// Overwrite the current preferences.
pub fn set_preferences(prefs: SpeakerRecognitionPreferences) {
    *PREFS.lock().expect("speaker prefs lock") = prefs;
}

// ── Tests ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn off_never_returns_match_or_suggestion() {
        assert_eq!(
            resolve_match_action(RecognitionMode::Off, 0.99, 0.60),
            MatchAction::Ignore
        );
    }

    #[test]
    fn suggest_creates_review_item_without_changing_labels() {
        assert_eq!(
            resolve_match_action(RecognitionMode::Suggest, 0.91, 0.60),
            MatchAction::Suggest
        );
    }

    #[test]
    fn suggest_below_threshold_is_ignore() {
        assert_eq!(
            resolve_match_action(RecognitionMode::Suggest, 0.30, 0.60),
            MatchAction::Ignore
        );
    }

    #[test]
    fn automatic_requires_stricter_threshold_than_suggest() {
        assert_eq!(
            resolve_match_action(RecognitionMode::Automatic, 0.84, 0.60),
            MatchAction::Suggest
        );
        assert_eq!(
            resolve_match_action(RecognitionMode::Automatic, 0.93, 0.60),
            MatchAction::Apply
        );
    }

    #[test]
    fn automatic_below_suggest_threshold_is_ignore() {
        assert_eq!(
            resolve_match_action(RecognitionMode::Automatic, 0.10, 0.60),
            MatchAction::Ignore
        );
    }

    #[test]
    fn custom_min_quality_threshold() {
        // With min_quality=0.70, confidence=0.65 should be Ignore
        assert_eq!(
            resolve_match_action(RecognitionMode::Suggest, 0.65, 0.70),
            MatchAction::Ignore
        );
        // But with min_quality=0.60, same confidence should be Suggest
        assert_eq!(
            resolve_match_action(RecognitionMode::Suggest, 0.65, 0.60),
            MatchAction::Suggest
        );
    }

    #[test]
    fn channel_lock_blocks_cross_channel_reference_match() {
        assert!(!channel_is_compatible(true, "microphone", "system"));
        assert!(channel_is_compatible(false, "microphone", "system"));
    }

    #[test]
    fn channel_lock_allows_same_channel() {
        assert!(channel_is_compatible(true, "microphone", "microphone"));
    }

    #[test]
    fn channel_lock_is_case_insensitive() {
        assert!(channel_is_compatible(true, "Microphone", "microphone"));
    }

    #[test]
    fn default_preferences_are_suggest_mode() {
        let prefs = SpeakerRecognitionPreferences::default();
        assert_eq!(prefs.recognition_mode, RecognitionMode::Suggest);
        assert!(prefs.lock_audio_channels);
        assert!((prefs.minimum_reference_quality - 0.60).abs() < f32::EPSILON);
    }
}
