# Changelog

All notable changes to meetily (LSY1105 fork) are documented here. The format
follows [Keep a Changelog 1.0.0](https://keepachangelog.com/en/1.0.0/), and
this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Fork baseline: `Zackriya-Solutions/meetily`. Each wave is a single PR that
lands cleanly into `devtest`. PR-N and short hashes link back to GitHub.

---

## [Unreleased]

### Added
- PR-44d (Wave 27): Speaker diarization for import / retranscribe
  paths. Both flows now spawn the offline re-clustering pass after their
  segment rows are persisted, reusing `diarization::offline::commit_speaker_labels`
  from PR-44b with an empty realtime buffer (forces the wav re-embed
  path). The `diarization::status().enabled` flag short-circuits the
  pass when the user disables diarization in settings; min/max speakers
  come from the same settings source. New unit test asserts the
  enabled=false short-circuit returns 0 without touching the DB.
- PR-44c (Wave 27): Speaker-diarization settings + UI/i18n. New
  `useDiarizationConfig` hook + `DiarizationSettingsBlock` panel
  (enable toggle, min/max speakers, model status). Frontend type adds
  `DiarizationConfig` + `transient_speaker`. `VirtualizedTranscriptView`
  renders a dashed `transient_tooltip` chip when only a realtime hint
  is available; the solid chip + rename UI takes over once the offline
  pass lands. Two new Tauri commands (`get_diarization_status`,
  `set_diarization_config`) back the settings page; status is in-memory
  with sane defaults (min=2, max=6, model_status=loading until the
  sherpa-onnx model is detected). All 6 locales ship 11 new keys
  (`diarization.*` + `transcript.transient_tooltip`).
- PR-44b (Wave 27): Offline diarization re-clustering. Pure-Rust
  NME-SC lite spectral clustering over windowed speaker embeddings
  (1.5 s window, 0.75 s hop). After `RecordingSaver::finalize()` writes
  `audio.wav`, a tokio task re-embeds the wav (or reuses the realtime
  buffer) and writes stable `Speaker N` labels to `transcripts.speaker`
  in a single transaction. A `transcripts-updated` Tauri event tells the
  frontend to refetch. New deps: `hound`, `nalgebra`. New docs:
  `docs/diarization_zh.md`. Failures degrade to `speaker = NULL`.
- PR-44a (Wave 27): Realtime speaker-diarization hint. New
  `diarization` module ships `EmbeddingBuffer` plus a sherpa-onnx
  embedding helper scaffolded behind a deterministic stub. `TranscriptUpdate`
  gains an optional `transientSpeaker` field; the value is advisory and
  the frontend renders a `transient_tooltip` (PR-44c adds the UI). The
  recording saver owns a per-session buffer that drains on stop. No DB
  change; offline re-clustering lands in PR-44b.
- PR-43 (Wave 26): Typed `LLMError` propagates to the public API of
  `summary::processor` and `summary::failover`. `generate_meeting_summary`,
  `run_markdown_transform`, `translate_markdown`,
  `normalize_markdown_to_english`, and `generate_with_failover` now
  return `Result<_, LLMError>` instead of `Result<_, String>`. The five
  `.map_err(|e| e.to_string())` adaptations PR-42-iv-c left behind are
  removed. The DB layer (`service.rs`) switches its cancellation check
  from `e.contains("cancelled")` to `matches!(e, LLMError::Cancelled)`
  and stringifies the typed error at the single persistence boundary.
  No frontend change; no DB schema change; no new variant on `LLMError`.

### Changed
- (none yet)

### Fixed
- (none yet)

---

## [v0.5.0] - 2026-07-19

### Added
- PR-C: Weekly + manual ASR benchmark CI.
  - Adds .github/workflows/asr-benchmark.yml (manual dispatch + weekly schedule).
  - Adds scripts/asr_benchmark/run_ci_eval.{sh,ps1} wrappers.
  - Ships a hermetic sine-wave fixture set under scripts/asr_benchmark/fixtures/.
  - Catches regressions in the recommended Whisper model for Chinese meetings
    without burning hundreds of CI minutes per run.

- PR-F (Wave 21): LLM summary prompts now inject the global hotword list as a glossary block, so company names / brand names / jargon survive the LLM summary path without rewriting.

- PR-42-iii (Wave 23): Streaming LLM auto postprocess. Each transcript
  segment that is long enough (>= 8 CJK chars or >= 20 ASCII chars) is
  rewritten by the configured LLM provider via
  summary::llm_client::generate_summary. The corrected text replaces
  the streaming typewriter output as soon as it arrives; failed
  rewrites keep the original text and surface an inline failure marker.
  Providers supported: Ollama / OpenAI / OpenRouter (native) plus
  DeepSeek / MiniMax / Kimi / 豆包 / Qwen via CustomOpenAI base_url.
  A new toggle in Settings -> Transcript controls whether the rewrite
  runs (default on). Hotword glossary is forwarded so protected terms
  survive the rewrite.

- PR-42-iv-a (Wave 24): Rust unit tests for llm_postprocess. Adds 14
  new #[test] functions covering is_cjk boundary characters (Basic,
  Extension A, Hiragana/Katakana exclusion), should_skip_for_length
  exact-boundary cases for both CJK and ASCII thresholds, mixed-CJK
  dominance, pure-punctuation skip, glossary block ordering, and the
  extracted render_user_prompt helper (no-glossary, with-glossary,
  empty-glossary, term-line preservation). Extracts render_user_prompt
  as a pure helper so prompt construction is testable without the
  global post_processor state. Adds rusqlite (bundled) as a
  dev-dependency reserved for a follow-up fixture-based test pass.
  No production behaviour change.

- PR-42-iv-b (Wave 24): Semantic postprocess error codes. The
  `transcript-postprocess-failed` payload's `error` field changes
  from a flat `String` to `{code, message}` so the frontend can look
  up localised text in `transcript.postprocess_error_<code>`. Rust
  defines `PostprocessError { code, message }` plus 9 stable
  constants in the `error_code` module; `correct_segment` and
  `load_provider_inputs` now return `Result<_, PostprocessError>`.
  `map_upstream_error` heuristically maps the opaque strings from
  `generate_summary` to `UPSTREAM_HTTP` / `NETWORK` /
  `UPSTREAM_EMPTY` / `CANCELLED`; replaced with a typed enum when
  `generate_summary` returns `Result<String, LLMError>` (PR-42-iv-c).
  Adds 7 unit tests covering all classification branches. 6 locales
  (en-US, en-GB, ja-JP, ko-KR, zh-CN, zh-TW) gain matching
  `postprocess_error_*` keys. Wire-format breaking: the frontend
  hook must update in the same PR.

- PR-42-iv-c (Wave 24): Typed `LLMError` enum for
  `summary::llm_client::generate_summary` and `send_request_with_retry`.
  Replaces the string-prefix heuristic in `map_upstream_error` with a
  typed match in `map_llm_error`. `PostprocessError.code` gains three
  new values: `auth_failed`, `json_parse`, `upstream_rate_limited`.
  The four summary callers in `processor.rs` and `try_provider` in
  `failover.rs` adapt with a single `.map_err(|e| e.to_string())` at
  the boundary so their public `Result<String, String>` signatures
  remain unchanged. `is_transient_llm_error(&LLMError)` replaces the
  `&str` overload at the only typed call site (failover chain logic);
  the existing `is_transient_error(&str)` tests stay untouched. Eight
  new unit tests in `llm_postprocess` cover all classification branches.
  Six locales (en-US, en-GB, ja-JP, ko-KR, zh-CN, zh-TW) gain the
  three new keys. Removes the unused `rusqlite` dev-dependency that
  PR-42-iv-a left behind (it conflicted with `sqlx-sqlite` over
  `libsqlite3-sys`); fixture-based test work defers to a follow-up.
- PR-A (Wave 22): Hotword hit-rate panel. A new `hotword_hit_stats` table records whole-word case-insensitive hits per hotword during ASR, and a new `HotwordHitStatsPanel` in Settings -> Transcriptionmodels shows hotword + hits + last_hit_at with a relative-time column and stale (>30 days) flag. Entries older than 30 days are cleared by the in-app 30-day rolling cleanup. Streaming recording path is wired; one-shot import / retranscription paths defer to PR-A2.

### Changed
- (none yet)

### Fixed
- (none yet)

---

## [v0.19.0] - 2026-07-17

### Added
- PR-56: Persistent recovery retry. Failed orphan-checkpoint recoveries are
  now persisted to `<app_data>/recovery-state.json`, retried asynchronously up
  to 3 times with exponential backoff (100ms / 500ms / 2s), and surfaced via a
  new top-of-app red banner (`RecoveryFailureBanner.tsx`). Per-row retry /
  discard / show-log (FFmpeg stderr tail, last 500 bytes). Adds 4 Tauri
  commands (`recover_orphan_meeting_cmd`, `get_failed_recoveries_cmd`,
  `retry_recovery_cmd`, `discard_recovery_cmd`).

### Changed
- PR-56: `OrphanCheckpointDialog` + `useTranscriptRecovery` switched to the
  new fire-and-forget API. The legacy synchronous `recover_audio_from_checkpoints`
  command + `AudioRecoveryStatus` struct are removed to avoid double-API drift.

### Fixed
- PR-55 follow-up: `TranscriptSegment` destructure now includes `protectedSet`
  (TS2503).
- PR-55 follow-up: remove duplicate `protectedSet` JSX prop in
  `SegmentCell` (TS17005).

---

## [v0.18.0] - 2026-07-16

### Added
- PR-55: Protected-terms restoration. LLM/heuristic postprocessors must
  preserve a user-defined set of protected terms; they are reapplied after
  rewriting so company names, project names, and proper nouns survive.
- PR-54: Orphan-checkpoint recovery. After a crash, scan the meetily data
  folder for `.checkpoints/` chunks left behind by `incremental_saver`, then
  merge them back into `audio.mp4` via FFmpeg concat. Surfaced as a one-time
  dialog on next launch.
- PR-53: Whisper model evaluation tool (`scripts/asr_benchmark/`) plus a
  curated AISHELL-1 CER reference table (`docs/asr_benchmark_zh.md`).
  Confirms `large-v3-turbo` as the default for Chinese meetings.
- PR-52: Highlight hotwords in the transcript view via `wrapHotwords`; matches
  are rendered as `<mark class="hotword-mark">` with click-to-copy.
- PR-51: Harden the postprocess chain for CJK. Sentence segmentation, smart
  punctuation, and self-testing improved for 中文会议 transcripts.
- PR-50: Global Whisper hotword settings UI. New `TranscriptSettings.tsx`
  panel accepts business / technical / proper-noun lists and wires them into
  `initial_prompt` at the engine level.
- PR-49: Export transcript as Markdown / DOCX from the meeting list.
- PR-48: Real-time processing progress in the sidebar during postprocessing.
- PR-46: Rename speaker labels from the meeting detail page.
- PR-45: Three ASR-model ergonomics improvements (PR-45a, PR-45c).
- PR-44: Clickable timestamp jumps audio playback. Four follow-ups (PR-44c,
  PR-44d, PR-44e) wire audio path discovery, Ja/Ko i18n parity, and parallel
  WAV export for browser decoding.
- PR-42: LLM transcript correction module + Wave 12 spec.
- PR-38: Plan + spec groundwork for Wave 12-18.

### Changed
- PR-37: Korean (`ko-KR`) full conversion. All 7 settings pages localized.
- PR-36: Japanese (`ja-JP`) full conversion.
- PR-35: Locale matrix extended to 6 languages (en-US / en-GB / zh-CN /
  zh-TW / ja-JP / ko-KR). All UI strings covered.
- PR-34: Whisper engine fallback chain. If the primary model fails to load,
  gracefully fall back to the next-best variant instead of crashing the app.

---

## [v0.9.0-i18n] - 2026-07-10

### Added
- Initial zh-CN / zh-TW localization baseline (Wave 9 across multiple PRs).

---

## Acknowledgments

- Upstream maintainers of `Zackriya-Solutions/meetily`.
- Contributors who landed each PR listed above.

## Versioning

- 0.0.x = early prototype wave (pre-i18n)
- 0.9.0 = i18n wave complete
- 0.18.0+ = post-i18n stability + recognition improvement waves

[v0.5.0]: https://github.com/LSY1105/meetily/releases/tag/v0.5.0
