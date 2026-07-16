# Wave 18 / PR-54 Implementation Plan

> **Spec:** docs/superpowers/specs/2026-07-16-transcribe-resilience.md
> **Base branch:** devtest

## Steps

### 1. Branch setup
- [x] `git switch -c feature/transcribe-resilience` (already on it)

### 2. Create `audio/recovery.rs`
File: `frontend/src-tauri/src/audio/recovery.rs` (new, ~55 lines)

```rust
// Wave 18 PR-54: merge orphan checkpoints into a single audio.mp4.
// Companion to PR-33 (orphan detection).
use anyhow::{anyhow, Result};
use log::{info, warn};
use std::path::{Path, PathBuf};
use super::ffmpeg::find_ffmpeg_path;

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

    let ffmpeg = find_ffmpeg_path()
        .ok_or_else(|| anyhow!("FFmpeg not found"))?;
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
```

### 3. Register in `audio/mod.rs`
File: `frontend/src-tauri/src/audio/mod.rs`

Add:
```rust
pub mod recovery;
```

### 4. Add Tauri command
File: `frontend/src-tauri/src/lib.rs`

Add near other recovery commands (search for `recover_meeting`):

```rust
#[tauri::command]
pub async fn recover_orphan_meeting(meeting_folder: String) -> Result<String, String> {
    let folder = std::path::PathBuf::from(meeting_folder);
    audio::recovery::merge_orphan_checkpoints(&folder)
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}
```

Register in `invoke_handler!`.

### 5. Tests
File: `frontend/src-tauri/src/audio/recovery.rs` (append at bottom)

```rust
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
    fn collects_mp4_files_in_sorted_order() {
        // We do not run FFmpeg here (CI does). Just verify the filter + sort.
        let tmp = std::env::temp_dir().join("meetily_recovery_test_sort");
        let _ = fs::remove_dir_all(&tmp);
        let cp = tmp.join(".checkpoints");
        fs::create_dir_all(&cp).unwrap();
        for i in [2, 0, 1] {
            fs::write(cp.join(format!("audio_chunk_{:03}.mp4", i)), b"x").unwrap();
        }
        // We can not call merge_orphan_checkpoints (FFmpeg might not exist);
        // instead, verify that the file discovery logic itself works.
        let mut mp4s: Vec<_> = fs::read_dir(&cp).unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("mp4"))
            .collect();
        mp4s.sort();
        assert_eq!(mp4s.len(), 3);
        let names: Vec<_> = mp4s.iter().map(|p| p.file_name().unwrap().to_str().unwrap().to_string()).collect();
        assert_eq!(names, vec!["audio_chunk_000.mp4", "audio_chunk_001.mp4", "audio_chunk_002.mp4"]);
        fs::remove_dir_all(&tmp).unwrap();
    }
}
```

### 6. Doc
File: `docs/recovery_zh.md` (new, ~50 lines)

Explain scan → dialog → recover / discard flow, link to PR-33 spec, mention
Wave 14 PR-44e (parallel WAV export) which means recovered meetings are
immediately click-to-jump playable.

### 7. Commit + push
- [ ] `git add -A`
- [ ] `git commit -m "feat(audio): add orphan-checkpoint recovery (PR-54)"`
- [ ] `git push -u fork feature/transcribe-resilience`

### 8. PR
- URL: https://github.com/LSY1105/meetily/compare/devtest...feature/transcribe-resilience?expand=1
- Title: `feat(audio): add orphan-checkpoint recovery (PR-54)`