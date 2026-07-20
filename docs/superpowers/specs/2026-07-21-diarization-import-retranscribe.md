# Wave 27 / PR-44d: Speaker Diarization for Import & Retranscribe

> **Base branch:** devtest
> **Parent waves:** PR-44a (realtime hint), PR-44b (offline clustering), PR-44c (settings/UI).
> **Goal:** Extend the offline re-clustering pass to import-audio and retranscribe flows so historical meetings gain stable `Speaker N` labels without forcing users to re-record.

## Background

PR-44b only triggers the offline re-clustering pass from `RecordingSaver::finalize()`. That covers live recordings but leaves two equally important paths stuck on `speaker = NULL`:

- **Import**: external audio files (mp4, wav, m4a) brought in via `import_audio`.
- **Retranscribe**: existing recordings that are re-processed with a different ASR model/language via `retranscribe_meeting`.

Both flows produce full audio that already lives on disk before the segment loop runs, so they are ideal candidates for the same offline re-clustering step the live recording already uses.

## Non-Goals

- No realtime hint during import/retranscribe (no `transientSpeaker` events). The audio is processed in batch and the UI does not need a per-segment hint.
- No changes to the realtime pipeline (`transcription::worker`).
- No new UI controls; the existing `DiarizationSettingsBlock` already exposes enable / min / max.
- No new dependency. Reuses `diarization::offline::commit_speaker_labels` from PR-44b.

## Decisions

| Question | Choice | Why |
|---|---|---|
| Realtime hint in import/retranscribe? | No | Audio is processed in batch; user has no visible transcript UI for these flows |
| Cluster source | Reuse `commit_speaker_labels` with empty realtime windows | Forces wav re-embed path; identical to PR-44b fallback |
| When to call | After `transcripts` rows are written | Avoids clobbering old `speaker` value during retranscribe delete-then-insert |
| Failure mode | Silent warn + skip | Matches PR-44b; UI keeps the existing "no speaker" behavior |
| Settings gate | Honor `diarization::status().enabled`; skip entirely when off | Same gate as the realtime pass |
| Concurrency | `tokio::spawn` after segment writes return | Keeps import / retranscribe return times unchanged |

## Architecture

```
import_audio / retranscribe_meeting
  ├── decode audio -> audio.wav (existing)
  ├── VAD + ASR loop (existing, no change)
  ├── write transcripts rows (existing)
  └── spawn commit_speaker_labels(pool, meeting_id, audio.wav, [], min, max)
        ├── ensure_loaded() ?  no -> warn + return 0
        ├── status().enabled ?  no -> return 0 (new gate)
        ├── reembed_wav(audio.wav) -> windows
        ├── spectral_cluster(windows, k)
        ├── remap_by_first_appearance(labels)
        └── TranscriptsRepository::update_segment_speakers(...)
```

No new module. PR-44b's `commit_speaker_labels` already accepts `audio_wav: Option<&Path>` and an empty `realtime_windows: Vec<WindowedEmbedding>` — the function will fall back to the wav re-embed path naturally.

## Scope (1 commit)

| File | Change |
|---|---|
| `frontend/src-tauri/src/audio/import.rs` | After segment rows are saved, `tokio::spawn` the offline pass; mirror the same pattern used in `recording_saver::stop_and_save` |
| `frontend/src-tauri/src/audio/retranscription.rs` | Same hook after the new segments replace the old ones |
| `frontend/src-tauri/src/diarization/offline.rs` | Read `diarization::status()` to honor the `enabled` flag and surface `min_speakers` / `max_speakers` to callers (avoids hard-coded `2 / 6`) |
| `frontend/src-tauri/src/diarization/offline.rs` | One unit test asserting the enabled=false short-circuit returns 0 |
| `CHANGELOG.md` | `[Unreleased]` entry for PR-44d |

## Acceptance

- [ ] `import_audio` followed by a manual DB query shows non-`NULL` `speaker` values for meetings whose `audio.wav` is decodable.
- [ ] `retranscribe_meeting` writes new `speaker` values without deleting-or-overwriting anything else.
- [ ] `diarization::status().enabled = false` skips the import/retranscribe pass entirely (verified by a unit test).
- [ ] Failures (model missing, wav corrupt, clustering empty) keep `speaker = NULL` and emit a single warn line.
- [ ] No regression to existing import/retranscribe timing (the spawn is fire-and-forget).

## Risks

| Risk | Mitigation |
|---|---|
| `commit_speaker_labels` reads `diarization::status()` inside a hot path | Lock guard is uncontended; one-shot clone |
| Spawn is unbounded — many simultaneous imports | Cheap (CPU only); user controls via settings |
| Retranscribe delete-then-insert race | We spawn **after** `update_*` returns; the new segments already exist when `commit_speaker_labels` queries them |
| Wav path differs between import/retranscribe | `find_audio_file` in retranscription returns the same path the ASR used; we feed the same value |

## References

- PR-44a spec: `docs/superpowers/specs/2026-07-21-diarization-realtime-design.md`
- PR-44b offline orchestrator: `frontend/src-tauri/src/diarization/offline.rs`
- Import: `frontend/src-tauri/src/audio/import.rs`
- Retranscribe: `frontend/src-tauri/src/audio/retranscription.rs`
