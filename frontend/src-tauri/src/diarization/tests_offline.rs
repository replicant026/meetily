use crate::diarization::{update_status, status, DiarizationStatus};
use crate::diarization::offline::commit_speaker_labels;

#[tokio::test]
async fn disabled_short_circuit_returns_zero() {
    update_status(DiarizationStatus {
        enabled: false,
        min_speakers: 2,
        max_speakers: 4,
        model_status: "disabled".to_string(),
    });
    let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
    let res = commit_speaker_labels(
        &pool,
        "meeting-disabled",
        None,
        Vec::new(),
        2,
        4,
    )
    .await;
    assert!(res.is_ok());
    assert_eq!(res.unwrap_or(99), 0);
    // Restore default for other tests.
    update_status(status());
}
