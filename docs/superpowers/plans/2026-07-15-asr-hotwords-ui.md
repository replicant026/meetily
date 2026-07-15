# Chinese Meeting Hotwords Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist one global Chinese-meeting hotword list and apply an immutable snapshot to every current local Whisper transcription entry point.

**Architecture:** A focused Rust module owns Tauri Store validation and commands. Live recording, audio import, and retranscription load the optional prompt once before work begins and pass it only to direct local Whisper calls. The existing transcript settings component provides a multiline editor without adding a new dependency or database field.

**Tech Stack:** Rust, Tauri 2, `tauri-plugin-store`, Next.js 14, React 18, TypeScript, `next-intl`, Vitest.

**Commit constraint:** The user requires one PR and one commit. Do not create intermediate commits; Task 6 creates the only implementation commit.

---

## File Map

**Create**

- `frontend/src-tauri/src/transcription_preferences.rs` — validation, Tauri Store persistence, commands, and Rust unit tests.

**Modify**

- `frontend/src-tauri/src/lib.rs` — module declaration and command registration.
- `frontend/src-tauri/src/audio/recording_commands.rs` — load a prompt snapshot before each recording start and pass it to the worker.
- `frontend/src-tauri/src/audio/transcription/worker.rs` — retain the recording snapshot and forward it to direct Whisper calls.
- `frontend/src-tauri/src/audio/import.rs` — load before background spawn and reuse in the import segment loop.
- `frontend/src-tauri/src/audio/retranscription.rs` — load before background spawn and reuse in the retranscription segment loop.
- `frontend/src/components/TranscriptSettings.tsx` — load, edit, validate, and save hotwords.
- `frontend/locales/en-US/settings.json`
- `frontend/locales/en-GB/settings.json`
- `frontend/locales/zh-CN/settings.json`
- `frontend/locales/zh-TW/settings.json`
- `frontend/locales/ja-JP/settings.json`
- `frontend/locales/ko-KR/settings.json`
- `docs/superpowers/specs/2026-07-15-asr-hotwords-ui.md`
- `docs/superpowers/plans/2026-07-15-asr-hotwords-ui.md`

The current runtime initializes `TranscriptionEngine::Whisper` directly for `localWhisper`. Do not change the unused `TranscriptionProvider` prompt contract in this PR.

---

### Task 1: Add Validated Tauri Store Preference

**Files:**
- Create: `frontend/src-tauri/src/transcription_preferences.rs`

- [ ] **Step 1: Add failing validation tests**

Add tests for whitespace, trimming, the 500-character boundary, and rejection at 501 characters:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whitespace_disables_hotwords() {
        assert_eq!(normalize_hotwords(" \n ".to_string()).unwrap(), None);
    }

    #[test]
    fn trims_hotwords_without_changing_lines() {
        assert_eq!(
            normalize_hotwords("  Meetily\n星河项目  ".to_string()).unwrap(),
            Some("Meetily\n星河项目".to_string())
        );
    }

    #[test]
    fn accepts_500_unicode_characters() {
        let value = "术".repeat(MAX_HOTWORD_CHARS);
        assert_eq!(normalize_hotwords(value.clone()).unwrap(), Some(value));
    }

    #[test]
    fn rejects_more_than_500_unicode_characters() {
        let error = normalize_hotwords("术".repeat(MAX_HOTWORD_CHARS + 1)).unwrap_err();
        assert!(error.to_string().contains("500"));
    }
}
```

- [ ] **Step 2: Run the focused Rust test and confirm it initially fails**

Run:

```powershell
cargo test --manifest-path frontend/src-tauri/Cargo.toml transcription_preferences
```

Expected before implementation: compile failure because the module and helper do not exist. If the local environment cannot build Rust dependencies, record that constraint and continue with source-level verification; do not claim the Rust tests passed.

- [ ] **Step 3: Implement the minimal preference module**

Use these contracts:

```rust
use anyhow::{anyhow, Result};
use log::info;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "transcription-preferences.json";
const STORE_KEY: &str = "hotwords";
pub const MAX_HOTWORD_CHARS: usize = 500;

fn normalize_hotwords(value: String) -> Result<Option<String>> {
    let trimmed = value.trim();
    if trimmed.chars().count() > MAX_HOTWORD_CHARS {
        return Err(anyhow!("Hotwords must not exceed {} characters", MAX_HOTWORD_CHARS));
    }
    Ok((!trimmed.is_empty()).then(|| trimmed.to_string()))
}

pub async fn load_transcription_hotwords<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<String>>;

pub async fn save_transcription_hotwords<R: Runtime>(
    app: &AppHandle<R>,
    hotwords: String,
) -> Result<Option<String>>;

#[tauri::command]
pub async fn get_transcription_hotwords<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<String>, String>;

#[tauri::command]
pub async fn set_transcription_hotwords<R: Runtime>(
    app: AppHandle<R>,
    hotwords: String,
) -> Result<Option<String>, String>;
```

Implementation rules:

- `load_transcription_hotwords` obtains `app.store(STORE_FILE)`, reads `STORE_KEY`, requires a JSON string, and calls `normalize_hotwords`.
- `save_transcription_hotwords` calls `normalize_hotwords`; `Some` uses `store.set`, `None` uses `store.delete`, then calls `store.save()`.
- Log only `enabled` and `chars`; never interpolate the hotword value.
- Both commands map errors to stable prefixes: `Failed to load transcription hotwords:` and `Failed to save transcription hotwords:`.

- [ ] **Step 4: Run the focused Rust test**

Run the same `cargo test` command. Expected: four tests pass when Rust compilation is available.

---

### Task 2: Register Commands and Wire Live Recording Snapshot

**Files:**
- Modify: `frontend/src-tauri/src/lib.rs`
- Modify: `frontend/src-tauri/src/audio/recording_commands.rs`
- Modify: `frontend/src-tauri/src/audio/transcription/worker.rs`

- [ ] **Step 1: Register the module and two commands**

Add `pub mod transcription_preferences;` beside the other root modules. Add these commands to `invoke_handler`:

```rust
transcription_preferences::get_transcription_hotwords,
transcription_preferences::set_transcription_hotwords,
```

- [ ] **Step 2: Load the recording snapshot before audio capture starts**

In both `start_recording_with_meeting_name` and `start_recording_with_devices_and_meeting`, load once after model validation and before `manager.start_recording(...)`:

```rust
let initial_prompt = crate::transcription_preferences::load_transcription_hotwords(&app)
    .await
    .map_err(|error| format!("Failed to load transcription hotwords: {}", error))?;
```

Change both worker calls to:

```rust
let task_handle = transcription::start_transcription_task(
    app.clone(),
    transcription_receiver,
    initial_prompt,
);
```

- [ ] **Step 3: Carry the immutable snapshot through the worker**

Change the public worker signature to:

```rust
pub fn start_transcription_task<R: Runtime>(
    app: AppHandle<R>,
    transcription_receiver: tokio::sync::mpsc::UnboundedReceiver<AudioChunk>,
    initial_prompt: Option<String>,
) -> tokio::task::JoinHandle<()>;
```

Clone the `Option<String>` into the single worker task. Extend `transcribe_chunk_with_provider` with `initial_prompt: Option<String>` and pass `initial_prompt.clone()` for each chunk. Replace the direct Whisper `None` with `initial_prompt`.

Do not change the Parakeet or `TranscriptionEngine::Provider` branches.

- [ ] **Step 4: Verify the two recording call sites**

Run:

```powershell
rg -n "start_transcription_task\(" frontend/src-tauri/src/audio/recording_commands.rs
rg -n "transcribe_audio_with_confidence\(" frontend/src-tauri/src/audio/transcription/worker.rs
```

Expected: two recording task calls include `initial_prompt`; the direct Whisper call no longer ends in `None`.

---

### Task 3: Wire Audio Import and Retranscription Snapshots

**Files:**
- Modify: `frontend/src-tauri/src/audio/import.rs`
- Modify: `frontend/src-tauri/src/audio/retranscription.rs`

- [ ] **Step 1: Load import hotwords before spawning background work**

In `start_import_audio_command`, load the snapshot before `tauri::async_runtime::spawn`:

```rust
let initial_prompt = crate::transcription_preferences::load_transcription_hotwords(&app)
    .await
    .map_err(|error| format!("Failed to load transcription hotwords: {}", error))?;
```

Add `initial_prompt: Option<String>` to `start_import` and `run_import`, pass it through both calls, and replace the import Whisper `None` with `initial_prompt.clone()` inside the segment loop.

- [ ] **Step 2: Load retranscription hotwords before spawning background work**

In `start_retranscription_command`, use the same load pattern before the spawned task. Add `initial_prompt: Option<String>` to `start_retranscription` and pass it into its Whisper segment loop with `initial_prompt.clone()`.

- [ ] **Step 3: Verify all current direct Whisper task paths**

Run:

```powershell
rg -n "transcribe_audio_with_confidence\(" frontend/src-tauri/src/audio | Select-String -NotMatch "\.backup"
```

Expected:

- `import.rs`, `retranscription.rs`, and `worker.rs` pass a prompt variable.
- `whisper_provider.rs` still passes `None` intentionally because the current runtime does not instantiate it for local Whisper.

---

### Task 4: Add the Settings Editor

**Files:**
- Modify: `frontend/src/components/TranscriptSettings.tsx`

- [ ] **Step 1: Add imports and local state**

Add existing project components and feedback:

```tsx
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';

const MAX_HOTWORD_CHARS = 500;
```

Inside `TranscriptSettings`, add `hotwords`, `savedHotwords`, `isLoadingHotwords`, and `isSavingHotwords` state. Calculate the Unicode character count with `Array.from(hotwords).length`.

- [ ] **Step 2: Load persisted hotwords once**

Add an effect that calls:

```tsx
invoke<string | null>('get_transcription_hotwords')
```

On success, set both current and saved values. On failure, leave the editor disabled and show `t('transcript.hotwords_load_failed')`. Use an `active` boolean in the effect cleanup to avoid state updates after unmount.

- [ ] **Step 3: Save through the validated Rust command**

Add `handleSaveHotwords`:

```tsx
const saved = await invoke<string | null>('set_transcription_hotwords', { hotwords });
const normalized = saved ?? '';
setHotwords(normalized);
setSavedHotwords(normalized);
toast.success(t('transcript.hotwords_save_success'));
```

On failure, preserve the edit and use `toast.error(t('transcript.hotwords_save_failed'))`.

- [ ] **Step 4: Render the compact editor below model controls**

Use the existing `Textarea`, `Label`, and `Button`. Required behavior:

- `maxLength={MAX_HOTWORD_CHARS}`.
- Placeholder from `transcript.hotwords_placeholder`.
- Counter rendered as `{count}/{MAX_HOTWORD_CHARS}`.
- Save disabled while loading, saving, unchanged, or over the limit.
- Helper text explicitly says local Whisper only and next task only.
- Button text switches between save and saving keys.

Do not create another component or add tags, parsing, deduplication, or automatic prompt text.

---

### Task 5: Add Six-Locale Strings

**Files:**
- Modify: `frontend/locales/en-US/settings.json`
- Modify: `frontend/locales/en-GB/settings.json`
- Modify: `frontend/locales/zh-CN/settings.json`
- Modify: `frontend/locales/zh-TW/settings.json`
- Modify: `frontend/locales/ja-JP/settings.json`
- Modify: `frontend/locales/ko-KR/settings.json`

- [ ] **Step 1: Add identical keys under `settings.transcript`**

Add these keys to every locale:

```json
"hotwords_title": "...",
"hotwords_description": "...",
"hotwords_placeholder": "...",
"hotwords_local_whisper_only": "...",
"hotwords_save": "...",
"hotwords_saving": "...",
"hotwords_save_success": "...",
"hotwords_save_failed": "...",
"hotwords_load_failed": "..."
```

Use Simplified Chinese as the primary wording reference:

```json
"hotwords_title": "中文会议热词",
"hotwords_description": "每行输入一个公司名、项目名、人名或中英混合术语。",
"hotwords_placeholder": "Meetily\n星河项目\nK8s\n陈经理",
"hotwords_local_whisper_only": "仅对本地 Whisper 生效；修改将在下一次录音、音频导入或重新转写时使用。",
"hotwords_save": "保存热词",
"hotwords_saving": "正在保存…",
"hotwords_save_success": "热词已保存",
"hotwords_save_failed": "热词保存失败",
"hotwords_load_failed": "无法读取已保存的热词"
```

- [ ] **Step 2: Run locale parity checks**

Run from `frontend`:

```powershell
pnpm check:i18n
pnpm test:i18n
```

Expected: parity passes and 19/19 i18n tests pass.

---

### Task 6: Verify and Create the Single PR Commit

**Files:**
- Verify all files listed in the File Map.

- [ ] **Step 1: Run focused Rust verification when available**

```powershell
cargo test --manifest-path frontend/src-tauri/Cargo.toml transcription_preferences
```

Expected: four preference tests pass. If unavailable, report the exact environment limitation without claiming Rust success.

- [ ] **Step 2: Run all required frontend gates**

From `frontend`:

```powershell
pnpm check:i18n
pnpm test:i18n
pnpm build
```

Expected: i18n parity passes, 19/19 tests pass, and 11 routes build successfully.

- [ ] **Step 3: Inspect scope and privacy**

```powershell
git diff --check
git diff --stat
rg -n "transcribe_audio_with_confidence\(" frontend/src-tauri/src/audio | Select-String -NotMatch "\.backup"
rg -n "hotwords" frontend/src-tauri/src/transcription_preferences.rs
```

Confirm no log statement interpolates the hotword value and no database, SQL, dependency, or unrelated file changed.

- [ ] **Step 4: Create the only commit**

Stage exactly the files in the File Map and commit:

```powershell
git commit -m "feat(asr): add global Whisper hotword settings (PR-50)"
```
