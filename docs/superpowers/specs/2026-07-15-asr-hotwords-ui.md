# Wave 17: Chinese Meeting Hotwords (PR-50)

> **Target branch:** `devtest`
> **Feature branch:** `feature/asr-hotwords-ui`
> **Engine prerequisite:** PR-45c (`initial_prompt` support)

## Background

PR-45c added `initial_prompt` support to the Whisper engine, but every current
call site still passes `None`. Users therefore cannot supply company names,
project names, participant names, or mixed Chinese/English technical terms that
would improve recognition in Chinese meetings.

## Goals

- Add one global hotword editor under Settings -> Transcript.
- Persist the value with the existing Tauri Store plugin.
- Snapshot the saved value when a transcription task starts.
- Apply the snapshot to local Whisper live recording, audio import, and
  retranscription.
- Keep the snapshot unchanged for the lifetime of the task.
- Localize the editor and its feedback for all six supported UI locales.

## Non-Goals

- Database or schema changes.
- Per-meeting hotwords.
- Updating a recording that is already in progress.
- Prompt support for Parakeet or cloud providers.
- Refactoring the currently unused TranscriptionProvider prompt contract.
- Automatic extraction from titles, participants, or historical transcripts.
- Tag editors, categories, suggestions, or prompt analytics.

## Persistence

Add a focused `transcription_preferences` Rust module that stores one optional
string in a dedicated Tauri Store file. It exposes:

- `get_transcription_hotwords`
- `set_transcription_hotwords`

Saving trims leading and trailing whitespace. Empty content removes the active
prompt and reads back as `None`. Both the frontend and Rust command reject
values longer than 500 Unicode characters.

Hotword text is private meeting vocabulary. Logs may record only whether the
feature is enabled and the character count; they must never include the value.

## Task Snapshot

Each transcription entry point reads the preference once before processing:

```text
Tauri Store
    -> task start snapshot: Option<String>
        -> live recording transcription worker
        -> audio import segment loop
        -> retranscription segment loop
            -> WhisperEngine::transcribe_audio_with_confidence(..., initial_prompt)
```

The snapshot is passed only through the local Whisper branch. Parakeet and
other provider behavior remains unchanged. Saving settings during an active
task affects only the next task.

If the preference cannot be read, the command returns an explicit error before
recording or batch processing begins. It must not silently use stale content.

## User Interface

Extend `TranscriptSettings.tsx` directly rather than adding a one-use wrapper
component. The editor appears below the transcription model controls and stays
available regardless of the currently selected provider.

- Multiline textarea, one term per line.
- 500-character counter and hard limit.
- Save button disabled while loading, saving, unchanged, or over the limit.
- Clearing and saving disables the prompt.
- Localized load, save-success, save-failure, and over-limit feedback.
- Explicit notice that the setting applies only to local Whisper and to the
  next recording, import, or retranscription task.

Example Chinese-first content:

```text
Meetily
星河项目
K8s
陈经理
```

## Scope

| File | Change |
|---|---|
| `frontend/src-tauri/src/transcription_preferences.rs` | Tauri Store read/write, validation, commands, unit tests |
| `frontend/src-tauri/src/lib.rs` | register the module and commands |
| `frontend/src-tauri/src/audio/transcription/worker.rs` | accept and reuse the live-recording snapshot |
| `frontend/src-tauri/src/audio/recording_commands.rs` | read the snapshot before starting the worker |
| `frontend/src-tauri/src/audio/import.rs` | read once and pass through the Whisper import loop |
| `frontend/src-tauri/src/audio/retranscription.rs` | read once and pass through the Whisper retranscription loop |
| `frontend/src/components/TranscriptSettings.tsx` | add the editor and save/load feedback |
| `frontend/locales/*/settings.json` | add six-locale hotword UI strings |
| `docs/superpowers/specs/2026-07-15-asr-hotwords-ui.md` | this specification |
| `docs/superpowers/plans/2026-07-15-asr-hotwords-ui.md` | implementation and verification plan |

No dependency changes are required.

## Failure Behaviour

| Condition | Behaviour |
|---|---|
| More than 500 characters | Frontend blocks save; Rust rejects direct command invocation |
| Empty value saved | Stored prompt is cleared; future tasks use `None` |
| Store load fails in Settings | Keep editor disabled and show a localized error |
| Store save fails | Preserve the edited text and show a localized error |
| Store load fails at task start | Return an explicit error before the task starts |
| Non-Whisper provider selected | Keep existing provider behavior; do not pass the prompt |

## Acceptance

- [ ] Saved hotwords survive an application restart.
- [ ] Whitespace-only content reads as no prompt.
- [ ] Values over 500 Unicode characters are rejected in Rust.
- [ ] Live recording uses one immutable prompt snapshot.
- [ ] Audio import uses one immutable prompt snapshot.
- [ ] Retranscription uses one immutable prompt snapshot.
- [ ] Parakeet and other provider paths remain unchanged.
- [ ] Hotword contents never appear in logs.
- [ ] All six locale files contain the new keys.
- [ ] Rust unit tests cover trimming, empty content, the 500-character boundary,
      and over-limit rejection.
- [ ] `pnpm check:i18n` passes.
- [ ] `pnpm test:i18n` passes (19/19).
- [ ] `pnpm build` succeeds (11 routes).

## Validation Constraints

The current Windows ARM64 environment lacks `clang` and `rustfmt`. `cargo test`
stops while building `ring` before project tests execute, so Rust verification is
limited to unit-test addition, call-site inspection, and the frontend build. A
maintainer should run the Rust test suite and one real local-Whisper recording
before upstream merge.

## Risks

| Risk | Mitigation |
|---|---|
| Prompt exceeds Whisper's practical token window | 500-character hard limit and concise one-term-per-line guidance |
| User expects cloud-provider support | UI explicitly states local Whisper only |
| Mid-task changes create inconsistent output | Snapshot once at task start |
| Sensitive vocabulary leaks through diagnostics | Never log or emit the hotword value |