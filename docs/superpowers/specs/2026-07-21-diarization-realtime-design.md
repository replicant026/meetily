# Wave 27: Realtime Speaker Diarization (PR-44 a/b/c)

> **Base branch:** devtest
> **Parent waves:** Wave 10 (recognition), Wave 11 (PR-41a skeleton), Wave 16 (PR-46 rename UI).
> **Goal:** Provide stable per-speaker labels for Chinese meetings by combining a lightweight realtime hint with an offline re-clustering pass after recording stops.

## Background

Wave 11 (PR-41a/41b) shipped the frontend `TranscriptSegmentData.speaker?` field plus a Python `Resemblyzer` prototype. The prototype never landed in production (model DER ~25% on 2–4 speaker Chinese meetings, Python dependency adds Windows installer risk) and the Rust realtime transcription pipeline still emits zero speaker info, so existing meetings show no speaker labels at all.

This wave replaces the Python prototype with a fully Rust ONNX inference stack and adds an explicit two-phase design:

1. **Realtime hint** — every VAD segment emits a transient `Speaker N` label as soon as the segment is transcribed. UI shows a "临时" badge. Labels are *not* persisted.
2. **Offline re-clustering** — after `stop_recording.finalize()` writes `audio.wav`, the backend re-runs embeddings over the whole file with the same model, runs a Rust spectral clustering, and writes stable `speaker` labels to SQLite. UI badges drop and inline rename becomes available.

This gives Chinese meetings accurate labels (down to ~10–15% DER with CAM++ ONNX) without blocking realtime UX.

## Non-Goals

- No replacement of Whisper/Parakeet ASR. Diarization is a post-VAD, pre-storage enrichment.
- No speaker *identity* (e.g., "陈总") assignment; labels are only "Speaker 1/2/3". Identity comes from the existing Wave 16 rename hook.
- No diarization on imported audio or retranscribed audio (PR-44d).
- No live re-clustering (clustering only runs at recording stop).
- No new dependency on `pyannote.audio` or `torch`. The whole stack stays in Rust.

## Decisions

| Question | Choice | Why |
|---|---|---|
| Realtime vs delayed | Realtime hint + offline cluster | User chose B. |
| Stack | sherpa-onnx + CAM++ ONNX in Rust | User chose A. Zero Python. |
| Clustering algorithm | NME-SC lite (Rust port, no sklearn) | No new heavy deps. Works for 2–6 speakers. |
| Realtime label persistence | None — DB stays `speaker=NULL` until finalize | Avoids UI mismatches when labels change. |
| Failure mode | Silent degradation to "no speaker" UI | Matches existing Wave 11 fallback. |
| New dependencies | `ort` 2.x (already used by Parakeet) + `nalgebra` (small) | No torch, no sklearn, no Python. |

## Architecture

### PR-44a — Realtime hint

```
[mic + system audio] -> pipeline.rs (VAD) -> AudioChunk (16 kHz samples + start/end)
                                          -> worker.rs (transcribe)
                                          -> diarization::extract_embedding(chunk)
                                                -> EmbeddingBuffer.push(start, end, vec)
                                          -> TranscriptUpdate { text, ..., transientSpeaker }
                                          -> emit "transcript-update"
                                          -> frontend shows chip + "临时" badge
```

Storage: realtime pass never touches `transcripts.speaker`.

### PR-44b — Offline re-clustering at finalize

```
stop_recording -> finalize() writes audio.wav + audio.mp4
              -> spawn commit_speaker_labels(meeting_id)
                    1. Re-encode sliding windows over audio.wav
                    2. Embed via same sherpa-onnx model
                    3. Rust spectral clustering (NME-SC lite, k in [min,max])
                    4. For each transcript segment whose audio_start_time/audio_end_time
                       matches a clustered window -> UPDATE speaker = "Speaker N"
                    5. emit "transcripts-updated" -> frontend reloads
```

The realtime `EmbeddingBuffer` is reused as a fallback when the wav is corrupt (cluster from realtime embeddings only). NME-SC lite produces stable labels independent of recording order.

### PR-44c — UI / i18n / settings

- `TranscriptSegment.transientSpeaker?: string | null` in addition to existing `speaker?: string | null`.
- Chip shows transientSpeaker with a dashed border + "临时" tooltip until `transcripts-updated` arrives.
- Settings page gains `enable_diarization`, `min_speakers` (default 2), `max_speakers` (default 6).
- New Tauri commands `set_diarization_config`, `get_diarization_status`.
- 6 locale keys (en-US, en-GB, zh-CN, zh-TW, ja-JP, ko-KR).

## Scope (3 commits, 1 design split into 3 PRs)

### PR-44a — backend realtime hint

| File | Change |
|---|---|
| `frontend/src-tauri/src/lib.rs` | add `pub mod diarization;` |
| `frontend/src-tauri/src/diarization/mod.rs` | module root + `EmbeddingBuffer` |
| `frontend/src-tauri/src/diarization/embedding.rs` | sherpa-onnx loader + `extract_embedding(samples, sr)` |
| `frontend/src-tauri/src/audio/transcription/worker.rs` | call `extract_embedding` per chunk, pass result through `TranscriptUpdate` |
| `frontend/src-tauri/src/audio/recording_saver.rs` | own `EmbeddingBuffer`; release on stop |
| `frontend/src-tauri/Cargo.toml` | add `ort` (already present for Parakeet) confirm feature |
| `frontend/src/types/index.ts` | `TranscriptUpdate.transientSpeaker?: string \| null` |
| `frontend/src/hooks/useTranscriptStreaming.ts` | forward transientSpeaker to segments |

### PR-44b — backend offline clustering

| File | Change |
|---|---|
| `frontend/src-tauri/src/diarization/clustering.rs` | NME-SC lite (Rust, `nalgebra`) |
| `frontend/src-tauri/src/diarization/offline.rs` | `commit_speaker_labels(meeting_id)` orchestrator |
| `frontend/src-tauri/src/audio/recording_saver.rs` | call `commit_speaker_labels` after `finalize()` |
| `frontend/src-tauri/src/database/repositories/transcript.rs` | `update_segment_speakers(meeting_id, mapping)` |
| `frontend/src-tauri/src/lib.rs` | register `set_diarization_config`, `get_diarization_status` commands |
| `frontend/src-tauri/migrations/20260721000000_diarization_settings.sql` | new `diarization_settings` table (or piggyback on existing settings) |

### PR-44c — frontend UI + i18n

| File | Change |
|---|---|
| `frontend/src/components/VirtualizedTranscriptView.tsx` | render transientSpeaker chip with "临时" badge |
| `frontend/src/components/TranscriptSettings.tsx` | enable toggle + min/max sliders + model status row |
| `frontend/src/components/MeetingDetails/TranscriptPanel.tsx` | listen `transcripts-updated`, refetch |
| `frontend/src/hooks/useTranscriptStreaming.ts` | drop transientSpeaker when real `speaker` arrives |
| `frontend/src/hooks/useDiarizationConfig.ts` | new hook (load/save settings) |
| `frontend/locales/{6 locale}/settings.json` | new keys (see Acceptance) |
| `frontend/locales/{6 locale}/transcript.json` | `transcript.speaker.transient_tooltip` |

## Acceptance

### PR-44a

- [ ] sherpa-onnx CAM++ model loaded lazily (model file ~30 MB), download path uses existing model cache
- [ ] Every realtime `TranscriptUpdate` includes `transientSpeaker` or `null`
- [ ] `EmbeddingBuffer` releases all segments on `stop_recording`
- [ ] Any embedding failure leaves `transientSpeaker = null` and logs a single warn line
- [ ] `cargo check` passes locally; no new heavyweight deps beyond `ort`/`nalgebra`

### PR-44b

- [ ] `commit_speaker_labels` runs after `finalize()` and writes stable `speaker` values to `transcripts`
- [ ] Labels are stable across long meetings (>30 min, ≥3 speakers) — same speaker keeps the same `Speaker N`
- [ ] `transcripts-updated` event emitted; frontend reloads and drops transient badges
- [ ] On failure: speakers stay `NULL`, single warn log, no UI breakage
- [ ] `cargo test` for clustering helper passes (≥3 cases: 2 spk, 3 spk, 5 spk synth)

### PR-44c

- [ ] Settings page exposes enable + min + max + model status
- [ ] 6 locales include all required keys; `pnpm check:i18n` + `pnpm test:i18n` pass
- [ ] `pnpm build` succeeds
- [ ] Existing Wave 16 rename UI works against re-clustered labels (no regressions)

## Risks

| Risk | Mitigation |
|---|---|
| sherpa-onnx download blocked in mainland China | Document mirror in `docs/diarization_zh.md`; fall back to realtime-only mode if download fails |
| NME-SC lite mis-clusters overlapping speakers (2 ppl talking) | Conservative default `max_speakers=6`; settings page lets user shrink to 2 |
| Embedding drift between realtime + offline (different windows) | Use identical `window_sec=1.5`, `hop_sec=0.75` and same model for both phases |
| Long meetings → EmbeddingBuffer OOM | Cap per-meeting windows to 2000 (~50 min at 1.5 s); older windows coalesce |

## Compatibility

- Existing meetings (no realtime embedding recorded) keep `speaker = NULL`; UI hides rename control.
- Disabling diarization via settings immediately returns the pipeline to "no speaker" behavior; no regression.
- Import / retranscribe paths are explicitly out of scope (PR-44d follow-up).

## References

- Wave 11 spec: `docs/superpowers/specs/2026-07-13-diarization-wave11.md`
- Wave 16 spec: `docs/superpowers/specs/2026-07-14-diarization-rename.md`
- sherpa-onnx: https://github.com/k2-fsa/sherpa-onnx (Apache-2.0)
- 3D-Speaker CAM++: https://github.com/modelscope/3D-Speaker (Apache-2.0, ONNX export supported)
- VBx / NME-SC: Landini et al., "Bayesian HMM clustering of x-vector sequences"
