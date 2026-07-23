//! Unit tests for `voice_references` pure functions.
//! Integration tests for WAV creation live in this file too (marked with
//! `#[cfg(feature = "integration")]`-gated tokio tests when the DB fixture
//! is available; otherwise they are plain `#[tokio::test]` gated on a temp dir).

use super::*;

// ── select_reference_window ───────────────────────────────────────────────

async fn test_pool() -> sqlx::SqlitePool {
    let pool = sqlx::SqlitePool::connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    pool
}

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

// ── delete_voice_reference (file + DB) ───────────────────────────────────

#[tokio::test]
async fn delete_reference_removes_only_managed_file() {
    let tmp = tempfile::tempdir().unwrap();
    set_references_dir(tmp.path().to_path_buf());

    let pool = test_pool().await;

    let alice = crate::database::repositories::speaker::SpeakerRepository::create_person(
        &pool, "Alice", None, None,
    )
    .await
    .unwrap();
    let bob = crate::database::repositories::speaker::SpeakerRepository::create_person(
        &pool, "Bob", None, None,
    )
    .await
    .unwrap();

    // Create reference with audio for Alice
    let ref_a = crate::database::repositories::voice_reference::VoiceReferenceRepository::create(
        &pool,
        &alice,
        &crate::database::repositories::voice_reference::CreateReferenceParams {
            meeting_id: None,
            embedding: vec![0.5; 192],
            audio_relative_path: Some(format!("{alice}/ref-a.wav")),
            waveform_peaks: None,
            source_start_ms: 0,
            source_end_ms: 1000,
            duration_ms: 1000,
            channel: "unknown".into(),
            quality_score: 0.8,
            status: "confirmed".into(),
            origin: "manual".into(),
        },
    )
    .await
    .unwrap();

    // Create reference with audio for Bob
    let _ref_b = crate::database::repositories::voice_reference::VoiceReferenceRepository::create(
        &pool,
        &bob,
        &crate::database::repositories::voice_reference::CreateReferenceParams {
            meeting_id: None,
            embedding: vec![0.5; 192],
            audio_relative_path: Some(format!("{bob}/ref-b.wav")),
            waveform_peaks: None,
            source_start_ms: 0,
            source_end_ms: 1000,
            duration_ms: 1000,
            channel: "unknown".into(),
            quality_score: 0.8,
            status: "confirmed".into(),
            origin: "manual".into(),
        },
    )
    .await
    .unwrap();

    // Write audio files on disk
    let alice_dir = tmp.path().join(&alice);
    std::fs::create_dir_all(&alice_dir).unwrap();
    std::fs::write(alice_dir.join("ref-a.wav"), b"RIFF fake").unwrap();

    let bob_dir = tmp.path().join(&bob);
    std::fs::create_dir_all(&bob_dir).unwrap();
    std::fs::write(bob_dir.join("ref-b.wav"), b"RIFF fake").unwrap();

    assert!(alice_dir.join("ref-a.wav").is_file());
    assert!(bob_dir.join("ref-b.wav").is_file());

    // Delete Alice's reference
    super::delete_voice_reference(&pool, &ref_a).await.unwrap();

    // Alice's file gone
    assert!(!alice_dir.join("ref-a.wav").is_file());
    // Alice's DB row gone
    let alice_refs =
        crate::database::repositories::voice_reference::VoiceReferenceRepository::list_for_person(
            &pool, &alice,
        )
        .await
        .unwrap();
    assert!(alice_refs.is_empty());

    // Bob's file untouched
    assert!(bob_dir.join("ref-b.wav").is_file());
    let bob_refs =
        crate::database::repositories::voice_reference::VoiceReferenceRepository::list_for_person(
            &pool, &bob,
        )
        .await
        .unwrap();
    assert_eq!(bob_refs.len(), 1);
}

// ── get_voice_reference_audio_path privacy ────────────────────────────────

#[tokio::test]
async fn no_command_returns_path_outside_managed_directory() {
    let tmp = tempfile::tempdir().unwrap();
    set_references_dir(tmp.path().to_path_buf());

    let pool = test_pool().await;

    let person = crate::database::repositories::speaker::SpeakerRepository::create_person(
        &pool, "Escaper", None, None,
    )
    .await
    .unwrap();

    // Insert a reference whose path tries to escape via ".."
    let ref_id = "ref-escape";
    sqlx::query(
        r#"INSERT INTO speaker_voice_references
           (id, speaker_id, embedding, audio_relative_path, status, origin, created_at)
           VALUES (?, ?, ?, ?, 'confirmed', 'manual', ?)"#,
    )
    .bind(ref_id)
    .bind(&person)
    .bind(vec![0u8; 192 * 4]) // dummy embedding
    .bind("../escape.wav")
    .bind(chrono::Utc::now().to_rfc3339())
    .execute(&pool)
    .await
    .unwrap();

    // get_voice_reference_audio_path must return None for suspicious paths
    let result = super::get_voice_reference_audio_path(&pool, ref_id)
        .await
        .unwrap();
    assert!(result.is_none(), "must not return path outside managed dir");
}
