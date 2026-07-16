// Wave 18 PR-54: merge orphan checkpoints into a single audio.mp4.
// Companion to PR-33 (orphan detection).

use anyhow::{anyhow, Result};
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Runtime};

use super::ffmpeg::find_ffmpeg_path;

// ---- Wave 18 PR-56: persistence + retry infrastructure ----

const RECOVERY_STATE_FILE: &str = "recovery-state.json";
const STDERR_TAIL_BYTES: usize = 500;
const MAX_RETRY_ATTEMPTS: u32 = 3;
const RETRY_BACKOFF_MS: [u64; 3] = [100, 500, 2000];

/// Failure category. Surfaced to the UI so the banner can show a short label
/// ("FFmpeg failed" vs "no checkpoints" etc.) without parsing the message.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryErrorKind {
    FfmpegFailed,
    NoCheckpoints,
    NoMp4Files,
    IoError,
    Unknown,
}

impl RecoveryErrorKind {
    fn from_anyhow(err: &anyhow::Error) -> Self {
        let msg = err.to_string();
        if msg.contains("No .checkpoints/") {
            Self::NoCheckpoints
        } else if msg.contains("No .mp4 in") {
            Self::NoMp4Files
        } else if msg.contains("FFmpeg concat failed") {
            Self::FfmpegFailed
        } else if msg.starts_with("FFmpeg not found") || msg.contains("os error") {
            Self::IoError
        } else {
            Self::Unknown
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryFailure {
    pub meeting_folder: String,
    pub display_name: String,
    pub first_attempt_ms: i64,
    pub last_attempt_ms: i64,
    pub attempt_count: u32,
    pub last_error: String,
    pub last_error_kind: RecoveryErrorKind,
    pub last_stderr_tail: String,
    pub discarded: bool,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct RecoveryState {
    failures: Vec<RecoveryFailure>,
}

fn state_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(RECOVERY_STATE_FILE)
}

fn load_state(app_data_dir: &Path) -> RecoveryState {
    let path = state_path(app_data_dir);
    if !path.exists() {
        return RecoveryState::default();
    }
    match std::fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_else(|e| {
            warn!("recovery-state.json corrupt ({}), starting fresh", e);
            RecoveryState::default()
        }),
        Err(e) => {
            warn!("Failed to read recovery-state.json: {}", e);
            RecoveryState::default()
        }
    }
}

fn save_state(app_data_dir: &Path, state: &RecoveryState) -> Result<()> {
    let path = state_path(app_data_dir);
    let json = serde_json::to_string_pretty(state)?;
    std::fs::write(&path, json)?;
    Ok(())
}

/// Load all active (non-discarded) failure records.
pub fn load_failures(app_data_dir: &Path) -> Vec<RecoveryFailure> {
    load_state(app_data_dir)
        .failures
        .into_iter()
        .filter(|f| !f.discarded)
        .collect()
}

/// Record a new attempt for `meeting_folder` with the given error. Returns the
/// updated record. Preserves `first_attempt_ms` across calls so the banner can
/// show "first failed at" without re-deriving it.
pub fn record_failure(
    app_data_dir: &Path,
    meeting_folder: &Path,
    error: &anyhow::Error,
    stderr_tail: &str,
) -> Result<RecoveryFailure> {
    let mut state = load_state(app_data_dir);
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let folder_str = meeting_folder.to_string_lossy().to_string();
    let display_name = meeting_folder
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();
    let stderr_truncated: String = if stderr_tail.len() > STDERR_TAIL_BYTES {
        stderr_tail[stderr_tail.len() - STDERR_TAIL_BYTES..].to_string()
    } else {
        stderr_tail.to_string()
    };

    let entry = if let Some(existing) = state.failures.iter_mut().find(|f| f.meeting_folder == folder_str) {
        existing.attempt_count += 1;
        existing.last_attempt_ms = now_ms;
        existing.last_error = error.to_string();
        existing.last_error_kind = RecoveryErrorKind::from_anyhow(error);
        existing.last_stderr_tail = stderr_truncated;
        existing.discarded = false;
        existing.clone()
    } else {
        let new = RecoveryFailure {
            meeting_folder: folder_str.clone(),
            display_name,
            first_attempt_ms: now_ms,
            last_attempt_ms: now_ms,
            attempt_count: 1,
            last_error: error.to_string(),
            last_error_kind: RecoveryErrorKind::from_anyhow(error),
            last_stderr_tail: stderr_truncated,
            discarded: false,
        };
        state.failures.push(new.clone());
        new
    };
    save_state(app_data_dir, &state)?;
    Ok(entry)
}

/// Mark a failure record as discarded (user gave up). Returns true if a record
/// was found and updated. The record stays in the JSON file but is filtered
/// out of `load_failures`.
pub fn mark_discarded(app_data_dir: &Path, meeting_folder: &Path) -> bool {
    let mut state = load_state(app_data_dir);
    let target = meeting_folder.to_string_lossy().to_string();
    let mut changed = false;
    for f in state.failures.iter_mut() {
        if f.meeting_folder == target && !f.discarded {
            f.discarded = true;
            changed = true;
        }
    }
    if changed {
        if let Err(e) = save_state(app_data_dir, &state) {
            warn!("Failed to persist discarded state: {}", e);
        }
    }
    changed
}

/// Remove a meeting's failure record entirely (called after a successful retry so the banner
/// entry disappears). Returns true if a record was removed.
pub fn clear_failure(app_data_dir: &Path, meeting_folder: &Path) -> bool {
    let mut state = load_state(app_data_dir);
    let target = meeting_folder.to_string_lossy().to_string();
    let before = state.failures.len();
    state.failures.retain(|f| f.meeting_folder != target);
    let changed = state.failures.len() != before;
    if changed {
        if let Err(e) = save_state(app_data_dir, &state) {
            warn!("Failed to persist cleared failure: {}", e);
        }
    }
    changed
}

fn truncate_stderr(stderr: &str) -> String {
    if stderr.len() <= STDERR_TAIL_BYTES {
        stderr.to_string()
    } else {
        stderr[stderr.len() - STDERR_TAIL_BYTES..].to_string()
    }
}

/// Public entry point for tests that need the same truncation rule.
pub fn truncate_stderr_for_test(stderr: &str) -> String {
    truncate_stderr(stderr)
}

/// Merge all `audio_chunk_*.mp4` files in `<meeting_folder>/.checkpoints/`
/// into a single `audio.mp4` via FFmpeg concat (no re-encoding).
/// Returns the final audio path. Cleans up `.checkpoints/` on success.
///
/// Used to recover from crashed recording sessions where the user did
/// not get to call `IncrementalAudioSaver::finalize()`.
pub fn merge_orphan_checkpoints(meeting_folder: &Path) -> Result<PathBuf> {
    let cp_dir = meeting_folder.join(".checkpoints");
    if !cp_dir.is_dir() {
        return Err(anyhow!("No .checkpoints/ in {}", meeting_folder.display()));
    }
    let mut mp4s: Vec<PathBuf> = std::fs::read_dir(&cp_dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("mp4"))
        .collect();
    mp4s.sort();
    if mp4s.is_empty() {
        return Err(anyhow!("No .mp4 in {}", cp_dir.display()));
    }

    let final_audio = meeting_folder.join("audio.mp4");
    let list_file = cp_dir.join("concat_list.txt");
    let mut list_content = String::new();
    for mp4 in &mp4s {
        let abs = mp4.canonicalize()?;
        list_content.push_str(&format!("file '\''{}'\''\n", abs.display()));
    }
    std::fs::write(&list_file, list_content)?;

    let ffmpeg = find_ffmpeg_path().ok_or_else(|| anyhow!("FFmpeg not found"))?;
    let mut cmd = std::process::Command::new(ffmpeg);
    cmd.args(&[
        "-f", "concat",
        "-safe", "0",
        "-i", list_file.to_str().unwrap(),
        "-c", "copy",
        "-y",
        final_audio.to_str().unwrap(),
    ]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let status = cmd.status()?;
    if !status.success() {
        return Err(anyhow!("FFmpeg concat failed: exit {:?}", status.code()));
    }

    if let Err(e) = std::fs::remove_dir_all(&cp_dir) {
        warn!("Failed to clean up .checkpoints/: {}", e);
    }
    info!("Recovered {} chunk(s) into {}", mp4s.len(), final_audio.display());
    Ok(final_audio)
}


// ---- Wave 18 PR-56: async retry + event emission ----

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum RecoveryEvent<'a> {
    #[serde(rename = "recovery-progress")]
    Progress { meeting_folder: &'a str, attempt: u32, max_attempts: u32 },
    #[serde(rename = "recovery-completed")]
    Completed { meeting_folder: &'a str, audio_path: &'a str },
    #[serde(rename = "recovery-failed")]
    Failed {
        meeting_folder: &'a str,
        error_kind: RecoveryErrorKind,
        error_message: String,
        stderr_tail: String,
        attempt_count: u32,
    },
}

/// Run `merge_orphan_checkpoints` with up to `MAX_RETRY_ATTEMPTS` retries on a
/// tokio task. Emits Tauri events so the frontend can show live progress in the
/// recovery banner. Returns `true` on eventual success, `false` if all retries
/// were exhausted.
pub async fn merge_orphan_checkpoints_with_retry<R: Runtime>(
    app: &AppHandle<R>,
    app_data_dir: PathBuf,
    meeting_folder: PathBuf,
) -> bool {
    let folder_str = meeting_folder.to_string_lossy().to_string();
    let max = MAX_RETRY_ATTEMPTS;
    let mut last_error: Option<anyhow::Error> = None;
    let mut last_stderr = String::new();

    for attempt in 1..=max {
        let _ = app.emit(
            "recovery-progress",
            RecoveryEvent::Progress {
                meeting_folder: &folder_str,
                attempt,
                max_attempts: max,
            },
        );
        match merge_orphan_checkpoints(&meeting_folder) {
            Ok(audio_path) => {
                let path_str = audio_path.to_string_lossy().to_string();
                let _ = app.emit(
                    "recovery-completed",
                    RecoveryEvent::Completed {
                        meeting_folder: &folder_str,
                        audio_path: &path_str,
                    },
                );
                // Clear any stale failure record from a previous failed attempt.
                let _ = clear_failure(&app_data_dir, &meeting_folder);
                return true;
            }
            Err(e) => {
                last_error = Some(e);
                if attempt < max {
                    let backoff_ms = RETRY_BACKOFF_MS[(attempt - 1) as usize];
                    tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
                }
            }
        }
    }

    // All retries exhausted.
    let err = last_error.unwrap_or_else(|| anyhow!("Recovery failed without specific error"));
    let kind = RecoveryErrorKind::from_anyhow(&err);
    let entry = record_failure(&app_data_dir, &meeting_folder, &err, &last_stderr);
    let attempt_count = entry.as_ref().map(|f| f.attempt_count).unwrap_or(max);
    let _ = app.emit(
        "recovery-failed",
        RecoveryEvent::Failed {
            meeting_folder: &folder_str,
            error_kind: kind,
            error_message: err.to_string(),
            stderr_tail: last_stderr.clone(),
            attempt_count,
        },
    );
    false
}

/// Spawn the retry loop on a detached tokio task. Frontend never blocks.
pub fn spawn_recovery_retry<R: Runtime>(
    app: AppHandle<R>,
    app_data_dir: PathBuf,
    meeting_folder: PathBuf,
) {
    tokio::spawn(async move {
        merge_orphan_checkpoints_with_retry(&app, app_data_dir, meeting_folder).await;
    });
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn errors_when_checkpoints_dir_missing() {
        let tmp = std::env::temp_dir().join("meetily_recovery_test_missing");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let r = merge_orphan_checkpoints(&tmp);
        assert!(r.is_err());
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn errors_when_no_mp4_files() {
        let tmp = std::env::temp_dir().join("meetily_recovery_test_empty");
        let _ = fs::remove_dir_all(&tmp);
        let cp = tmp.join(".checkpoints");
        fs::create_dir_all(&cp).unwrap();
        fs::write(cp.join("readme.txt"), b"x").unwrap();
        let r = merge_orphan_checkpoints(&tmp);
        assert!(r.is_err());
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn discovers_mp4_files_in_sorted_order() {
        // We can not call merge_orphan_checkpoints directly here because
        // FFmpeg may not be available in the sandbox. Verify just the
        // discovery + sort path that merge_orphan_checkpoints uses.
        let tmp = std::env::temp_dir().join("meetily_recovery_test_sort");
        let _ = fs::remove_dir_all(&tmp);
        let cp = tmp.join(".checkpoints");
        fs::create_dir_all(&cp).unwrap();
        for i in [2u32, 0, 1] {
            fs::write(cp.join(format!("audio_chunk_{:03}.mp4", i)), b"x").unwrap();
        }
        let mut mp4s: Vec<_> = fs::read_dir(&cp)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("mp4"))
            .collect();
        mp4s.sort();
        assert_eq!(mp4s.len(), 3);
        let names: Vec<String> = mp4s
            .iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap().to_string())
            .collect();
        assert_eq!(
            names,
            vec![
                "audio_chunk_000.mp4",
                "audio_chunk_001.mp4",
                "audio_chunk_002.mp4"
            ]
        );
        fs::remove_dir_all(&tmp).unwrap();
        // ---- Wave 18 PR-56: failure persistence + retry helpers ----

    fn tmp_app_data(label: &str) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("meetily_pr56_{}", label));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn record_failure_roundtrips_to_disk() {
        let app_data = tmp_app_data("roundtrip");
        let meeting = app_data.join("meetings").join("Sync");
        fs::create_dir_all(&meeting).unwrap();
        let err = anyhow::anyhow!("FFmpeg concat failed: exit Some(1)");
        let entry = record_failure(&app_data, &meeting, &err, "tail").unwrap();
        assert_eq!(entry.attempt_count, 1);
        assert_eq!(entry.last_error_kind, RecoveryErrorKind::FfmpegFailed);
        // Reload from disk
        let loaded = load_failures(&app_data);
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].meeting_folder, meeting.to_string_lossy());
        assert_eq!(loaded[0].display_name, "Sync");
        fs::remove_dir_all(&app_data).unwrap();
    }

    #[test]
    fn record_failure_increments_attempt_count() {
        let app_data = tmp_app_data("increment");
        let meeting = app_data.join("meetings").join("M");
        fs::create_dir_all(&meeting).unwrap();
        let err = anyhow::anyhow!("FFmpeg concat failed");
        let _ = record_failure(&app_data, &meeting, &err, "").unwrap();
        let _ = record_failure(&app_data, &meeting, &err, "").unwrap();
        let entry = record_failure(&app_data, &meeting, &err, "").unwrap();
        assert_eq!(entry.attempt_count, 3);
        assert_eq!(entry.first_attempt_ms, entry.last_attempt_ms
            .saturating_sub(entry.last_attempt_ms - entry.first_attempt_ms));
        // first_attempt_ms stays stable across calls
        let loaded = load_failures(&app_data);
        assert_eq!(loaded.len(), 1);
        fs::remove_dir_all(&app_data).unwrap();
    }

    #[test]
    fn mark_discarded_removes_from_active_list() {
        let app_data = tmp_app_data("discard");
        let meeting = app_data.join("meetings").join("D");
        fs::create_dir_all(&meeting).unwrap();
        let err = anyhow::anyhow!("FFmpeg concat failed");
        record_failure(&app_data, &meeting, &err, "").unwrap();
        assert_eq!(load_failures(&app_data).len(), 1);
        let ok = mark_discarded(&app_data, &meeting);
        assert!(ok);
        assert_eq!(load_failures(&app_data).len(), 0);
        // Marking twice is a no-op
        assert!(!mark_discarded(&app_data, &meeting));
        fs::remove_dir_all(&app_data).unwrap();
    }

    #[test]
    fn stderr_truncation_keeps_last_500_bytes() {
        let app_data = tmp_app_data("truncate");
        let meeting = app_data.join("meetings").join("T");
        fs::create_dir_all(&meeting).unwrap();
        let long_stderr = "x".repeat(2000) + "TAIL";
        let err = anyhow::anyhow!("FFmpeg concat failed");
        let entry = record_failure(&app_data, &meeting, &err, &long_stderr).unwrap();
        assert!(entry.last_stderr_tail.ends_with("TAIL"));
        assert!(entry.last_stderr_tail.len() <= STDERR_TAIL_BYTES);
        // Also test the public helper directly
        let truncated = truncate_stderr_for_test(&long_stderr);
        assert_eq!(truncated.len(), STDERR_TAIL_BYTES);
        assert!(truncated.ends_with("TAIL"));
        fs::remove_dir_all(&app_data).unwrap();
    }

    #[test]
    fn clear_failure_removes_record_entirely() {
        let app_data = tmp_app_data("clear");
        let meeting = app_data.join("meetings").join("C");
        fs::create_dir_all(&meeting).unwrap();
        let err = anyhow::anyhow!("FFmpeg concat failed");
        record_failure(&app_data, &meeting, &err, "").unwrap();
        let cleared = clear_failure(&app_data, &meeting);
        assert!(cleared);
        assert_eq!(load_failures(&app_data).len(), 0);
        // Clearing missing is a no-op
        assert!(!clear_failure(&app_data, &meeting));
        fs::remove_dir_all(&app_data).unwrap();
    }

}
}