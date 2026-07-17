# Documentation Index

User-facing and developer docs for the LSY1105 fork of meetily. If you're new
to the codebase, start with the project root `README.md`, then this index.

## User-facing docs (Chinese / English)

| Doc | Audience | Summary |
|-----|----------|---------|
| [architecture.md](architecture.md) | All | High-level architecture diagram + module overview |
| [BUILDING.md](BUILDING.md) | Devs / contributors | Build instructions, prerequisites |
| [building_in_linux.md](building_in_linux.md) | Linux devs | Linux-specific build notes |
| [GPU_ACCELERATION.md](GPU_ACCELERATION.md) | Performance-conscious users | GPU tuning for Whisper.cpp |
| [asr_postprocess.md](asr_postprocess.md) | Power users | What is the postprocessor; how to extend it |
| [hotword_highlight.md](hotword_highlight.md) | Users | Hotword matching in transcripts (PR-52) |
| [recovery_zh.md](recovery_zh.md) | Users | Orphan-checkpoint recovery (PR-54) |
| [recovery_retry_zh.md](recovery_retry_zh.md) | Users | Persistent retry + failure banner (PR-56) |
| [ui_timestamp_jump.md](ui_timestamp_jump.md) | Users | Clickable timestamp audio seek (PR-44c) |
| [asr_benchmark_zh.md](asr_benchmark_zh.md) | Model choosers | Whisper model selection for Chinese |

## i18n (translation work)

| Path | Summary |
|------|---------|
| [i18n/README.md](i18n/README.md) | How to add / update a locale |
| [i18n/glossary.md](i18n/glossary.md) | Canonical translation glossary |

## Process docs (superpowers / PR workflow)

| Path | Summary |
|------|---------|
| [superpowers/specs/](superpowers/specs/) | Per-PR design specs (incremental, one per wave) |
| [superpowers/plans/](superpowers/plans/) | Per-PR implementation plans |

## Where to start contributing

1. Read `README.md` at the repo root.
2. Pick a wave from `../CHANGELOG.md` whose area matches your skill (frontend
   i18n / Rust audio engine / Whisper ASR / UI polish).
3. Open the matching spec under `superpowers/specs/` to understand the
   acceptance criteria.
4. Branch from `devtest`: `git checkout -b feature/<topic> devtest`.
