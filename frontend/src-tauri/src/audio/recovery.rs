// Wave 18 PR-54: merge orphan checkpoints into a single audio.mp4.
// Companion to PR-33 (orphan detection).

use anyhow::{anyhow, Result};
use log::{info, warn};
use std::path::{Path, PathBuf};

use super::ffmpeg::find_ffmpeg_path;

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
    }
}