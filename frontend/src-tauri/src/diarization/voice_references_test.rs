//! Unit tests for `voice_references` pure functions.
//! Integration tests for WAV creation live in this file too (marked with
//! `#[cfg(feature = "integration")]`-gated tokio tests when the DB fixture
//! is available; otherwise they are plain `#[tokio::test]` gated on a temp dir).

use super::*;

// ── select_reference_window ───────────────────────────────────────────────

#[test]
fn select_reference_window_caps_to_eight_seconds_around_speech() {
    let window = select_reference_window(&[(1_000, 5_000), (6_000, 12_000)]).unwrap();
    assert_eq!(window.duration_ms(), 8_000);
    assert!(window.start_ms >= 1_000);
    assert!(window.end_ms <= 12_000);
}

#[test]
fn select_reference_window_none_for_empty_segments() {
    assert!(select_reference_window(&[]).is_none());
}

#[test]
fn select_reference_window_expands_short_segments() {
    // Single 500 ms segment → must expand to at least 1500 ms
    let window = select_reference_window(&[(5_000, 5_500)]).unwrap();
    assert!(window.duration_ms() >= MIN_WINDOW_MS);
    assert!(window.duration_ms() <= MAX_WINDOW_MS);
}

#[test]
fn select_reference_window_single_short_segment_stays_under_max() {
    let window = select_reference_window(&[(10_000, 10_400)]).unwrap();
    assert!(window.duration_ms() <= MAX_WINDOW_MS);
    assert!(window.duration_ms() >= MIN_WINDOW_MS);
}

#[test]
fn select_reference_window_long_span_clamps_to_8s() {
    // 20-second span → must clamp to exactly 8000 ms
    let window = select_reference_window(&[(0, 20_000)]).unwrap();
    assert_eq!(window.duration_ms(), 8_000);
}

// ── build_waveform_peaks ──────────────────────────────────────────────────

#[test]
fn waveform_has_fixed_peak_count_and_bounded_values() {
    let peaks = build_waveform_peaks(&vec![0.5, -1.0, 0.25, 0.0], 32);
    assert_eq!(peaks.len(), 32);
    assert!(peaks.iter().all(|p| *p <= 255));
}

#[test]
fn waveform_empty_samples_returns_zero_peaks() {
    let peaks = build_waveform_peaks(&[], 96);
    assert_eq!(peaks.len(), 96);
    assert!(peaks.iter().all(|p| *p == 0));
}

#[test]
fn waveform_zero_peaks_returns_empty() {
    let peaks = build_waveform_peaks(&vec![1.0; 1000], 0);
    assert!(peaks.is_empty());
}

#[test]
fn waveform_peak_at_1_0_is_255() {
    let peaks = build_waveform_peaks(&vec![1.0], 1);
    assert_eq!(peaks[0], 255);
}

#[test]
fn waveform_peak_at_neg_1_0_is_255() {
    let peaks = build_waveform_peaks(&vec![-1.0], 1);
    assert_eq!(peaks[0], 255);
}

// ── managed_reference_path ────────────────────────────────────────────────

#[test]
fn managed_reference_path_cannot_escape_references_directory() {
    let tmp = tempfile::tempdir().unwrap();
    set_references_dir(tmp.path().to_path_buf());

    assert!(managed_reference_path("../outside.wav").is_err());
    assert!(managed_reference_path("speaker/a.wav").is_ok());
}

#[test]
fn managed_reference_path_rejects_absolute_paths() {
    let tmp = tempfile::tempdir().unwrap();
    set_references_dir(tmp.path().to_path_buf());

    #[cfg(target_os = "windows")]
    assert!(managed_reference_path("C:\\temp\\x.wav").is_err());
    #[cfg(not(target_os = "windows"))]
    assert!(managed_reference_path("/tmp/x.wav").is_err());
}

#[test]
fn managed_reference_path_rejects_dotdot_in_middle() {
    let tmp = tempfile::tempdir().unwrap();
    set_references_dir(tmp.path().to_path_buf());

    assert!(managed_reference_path("speaker/../../outside.wav").is_err());
}

#[test]
fn managed_reference_path_ok_for_valid_relative() {
    let tmp = tempfile::tempdir().unwrap();
    set_references_dir(tmp.path().to_path_buf());

    let p = managed_reference_path("person-1/ref-abc.wav").unwrap();
    assert_eq!(p, tmp.path().join("person-1/ref-abc.wav"));
}

// ── ReferenceWindow helper ────────────────────────────────────────────────

#[test]
fn reference_window_duration_ms_is_correct() {
    let w = ReferenceWindow {
        start_ms: 1000,
        end_ms: 4500,
    };
    assert_eq!(w.duration_ms(), 3500);
}
