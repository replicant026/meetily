# Wave 18 / PR-54: Orphan Checkpoint Auto-Recovery

> **For agentic workers:** superpowers:executing-plans
> **Base branch:** devtest
> **Parent PRs:** PR-33 (orphan detection) shipped the `scan_orphan_checkpoints`
>                function. This PR adds the **recovery** half: a one-call
>                function that merges the leftover `.mp4` files into a
>                single `audio.mp4` so the user gets their recording back.

## Background

PR-33 (2026-07-15, `feature/orphan-checkpoints`) shipped:

- `database/orphan_checkpoints::scan_orphan_checkpoints()` — at app
  startup, walks `app_data/meetings/*/.checkpoints/`, returns a list of
  `OrphanCheckpoint { meeting_folder, display_name, chunk_count, ... }`.
- The frontend listens for the `orphan-checkpoints-detected` event and
  shows a recovery dialog (recover or discard).

What's missing:

- **The recovery action itself.** The dialog can call
  `discard_orphan_checkpoint` (delete the directory) but **there is no
  function that turns leftover `.mp4` files back into a usable
  `audio.mp4`**. The user can only throw away their work.

This PR adds that recovery. It is purely additive and does not change
PR-33's existing scan / discard flow.

## Goals

- New function `audio::recovery::merge_orphan_checkpoints(meeting_folder) -> Result<PathBuf>`
  that walks the `.checkpoints/` directory, sorts the `audio_chunk_*.mp4`
  files numerically, runs FFmpeg concat (`-c copy`, no re-encoding), and
  deletes the checkpoints directory on success.
- A Tauri command `recover_orphan_meeting(meeting_folder)` that the
  frontend can call from the recovery dialog. Returns the final
  `audio.mp4` path or an error.
- 4 unit tests covering: missing dir, empty dir, success path with 2
  mock `.mp4` files, FFmpeg-not-found error.
- 1-page zh-CN doc `docs/recovery_zh.md` describing the full recovery
  flow (scan → dialog → recover / discard).

## Non-Goals

- Not changing PR-33's scan logic.
- Not changing the recovery dialog UX.
- Not adding automatic "merge on startup" (recovery stays user-driven
  via the dialog — silent recovery is risky if the user no longer wants
  the recording).
- Not changing the `IncrementalAudioSaver::finalize()` path (still
  used during a normal in-progress recording).
- Not touching frontend, i18n, or LLM / Parakeet paths.

## Scope

| File | Change | Lines |
|------|--------|-------|
| `frontend/src-tauri/src/audio/recovery.rs` (new) | `merge_orphan_checkpoints()` | ~55 |
| `frontend/src-tauri/src/audio/mod.rs` | `pub mod recovery;` | +1 |
| `frontend/src-tauri/src/lib.rs` | `recover_orphan_meeting` Tauri command | +25 |
| `docs/recovery_zh.md` (new) | Recovery flow doc | +50 |
| `docs/superpowers/specs/2026-07-16-transcribe-resilience.md` (new) | This file | +130 |
| `docs/superpowers/plans/2026-07-16-transcribe-resilience.md` (new) | Plan | +60 |

**Total estimated diff: ~320 insertions, 0 deletions** (all additive).

## Algorithm

```
merge_orphan_checkpoints(meeting_folder):
    cp_dir = meeting_folder/.checkpoints
    if not exists: error
    mp4s = sorted list of audio_chunk_*.mp4 in cp_dir
    if empty: error

    # Build FFmpeg concat list
    list_file = cp_dir/concat_list.txt
    for each mp4 in mp4s:
        write "file '<abs path>'\n" to list_file

    # Run FFmpeg concat
    ffmpeg -f concat -safe 0 -i list_file -c copy -y <meeting>/audio.mp4
    if exit != 0: error

    # Cleanup
    rm -rf cp_dir

    return meeting_folder/audio.mp4
```

## Acceptance

- [ ] `merge_orphan_checkpoints` compiles and passes unit tests
      (sandbox cannot run `cargo test`; CI runs it).
- [ ] `recover_orphan_meeting` registered in `invoke_handler!`.
- [ ] 4 new unit tests.
- [ ] `docs/recovery_zh.md` exists and links to PR-33 + PR-54.
- [ ] No new dependencies (uses existing `ffmpeg_sidecar`).
- [ ] No frontend / i18n changes.

## Risks

| Risk | Mitigation |
|------|-----------|
| `ffmpeg.exe` not found on user system | Same `find_ffmpeg_path` lookup PR-33 already uses; explicit error message if missing |
| Corrupt `.mp4` chunk | FFmpeg concat with `-c copy` is stream-level; corrupt chunks will cause FFmpeg to fail loudly (better than silent data loss) |
| User accidentally recovers a meeting they no longer want | Recovery is **explicitly** user-driven via dialog; not automatic |
| Numeric sort vs lexicographic | We sort `audio_chunk_NNN.mp4` via Path ordering + filter on extension. Since filenames are zero-padded, lexicographic == numeric. Documented. |