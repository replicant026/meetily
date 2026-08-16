# Frontend Utility Services

## Overview

Service layer providing TypeScript helpers consumed by React components — model management, analytics, meeting storage, speaker types, and AI integration utilities bridging UI → Tauri IPC.

## Key Components

### Edge Connectors (public API surface)

- **`whisper.ts`** — Whisper model types (`ModelInfo`, `ModelStatus`, `WhisperEngineState`) & `WhisperAPI` class wrapping Tauri invoke commands. Model configs for f16/q5_0/q5_1 quantized variants. Helpers: `getModelIcon`, `getStatusColor`, `groupModelsByBase`, `getRecommendedModel`.

- **`parakeet.ts`** — Parakeet (NVIDIA NeMo) model types (`ParakeetModelInfo`, `QuantizationType`) & `ParakeetAPI` class. Int8/FP32 model configs. `MODEL_DISPLAY_CONFIG` for friendly names (Lightning/Compact/Precise). Same Tauri command pattern as whisper.ts.

### Entry Points (leaf modules, no internal imports)

- **`analytics.ts`** — `Analytics` static class. Session tracking, event dispatch, device detection, feature usage, meeting metrics. Persistent user ID via `@tauri-apps/plugin-store` (`analytics.json`). Methods: `init`, `track`, `identify`, `startSession`, `trackMeetingCompleted`, `trackSummaryGenerationStarted/Completed`.

- **`builtin-ai.ts`** — `BuiltInAIAPI` class + `BuiltInModelInfo` types. Summary model lifecycle (list/download/delete). Status helpers: `isModelAvailable`, `getStatusColor`, `getStatusLabel`.

- **`date-locale.ts`** — Maps `next-intl` locale → `date-fns` locale. Supports `en-US`, `zh-CN`. Exports `getDateFnsLocale` & `useDateFnsLocale` hook.

- **`meeting-directory.ts`** — `MeetingDirectoryItem` type + `listHomeMeetings` Tauri call. `groupMeetingsByDate` partitions into `today`/`last7Days`/`older`.

- **`meeting-workspace-storage.ts`** — Thin Tauri wrappers: `getMeetingNote`, `saveMeetingNote`, `getMeetingActionStates`, `setMeetingActionCompleted`.

- **`onboarding-summary-model.ts`** — `resolveOnboardingSummaryModelStatus` resolves selected vs recommended model. Size helpers for Qwen3.5/Gemma3 models. `getSummaryModelSizeLabel` formats MiB/GiB.

### Type Definitions

- **`speaker-types.ts`** — `VoiceReference`, `SpeakerPerson`, `SpeakerSuggestion` interfaces. `RecognitionMode` type (`off`/`suggest`/`automatic`).

### Utilities

- **`blocknote-markdown.ts`** — `blocksToMarkdownSafely` wraps BlockNote `blocksToMarkdownLossy` w/ error fallback. 4 public symbols, 5 internal dependencies.

## Data Flow

```
React Components
    ↓ invoke() calls
┌─────────────────────────────────────────────────┐
│  lib/whisper.ts         → Tauri whisper_* cmds  │
│  lib/parakeet.ts        → Tauri parakeet_* cmds │
│  lib/builtin-ai.ts      → Tauri builtin_ai_*    │
│  lib/analytics.ts       → Tauri analytics cmds   │
│  lib/meeting-directory.ts → list_home_meetings   │
│  lib/meeting-workspace-storage.ts → get/save_*  │
└─────────────────────────────────────────────────┘
    ↓
Tauri IPC → Rust Backend (audio, transcription, storage)
```

- UI → `WhisperAPI`/`ParakeetAPI` → `invoke('whisper_*')` → Rust whisper engine
- UI → `Analytics.track()` → `invoke('track_event')` → Rust analytics sink
- UI → `listHomeMeetings()` → Rust SQLite → `MeetingDirectoryItem[]`
- UI → `BuiltInAIAPI.downloadModel()` → `invoke('builtin_ai_download_model')` → Rust file downloader
- Types (`speaker-types.ts`, `whisper.ts` ModelInfo) flow inward: Components ← lib/types ← Rust events

## Architecture Notes

- **Thin wrappers**: most modules = TypeScript types + `invoke()` calls. Business logic lives in Rust.
- **Parallel transcription APIs**: `WhisperAPI` (whisper.cpp) & `ParakeetAPI` (NVIDIA NeMo) share identical patterns but independent command namespaces.
- **Analytics isolation**: `Analytics` class owns its own init lifecycle, persistent storage (`analytics.json`), and device detection — no dependency on other lib/ modules.
- **Entry points are leaves**: 6 entry-point files import nothing from sibling lib/ modules (only external deps: `@tauri-apps/*`, `date-fns`, `next-intl`, `@blocknote/core`).
- **Edge connectors are bridges**: `whisper.ts` & `parakeet.ts` define types consumed by Rust event handlers + UI components — the cross-boundary contract.
- **No shared state**: each module is stateless or self-contained (Analytics singleton is the sole exception).
