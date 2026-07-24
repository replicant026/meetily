# Talat-Style Speaker Profiles and Voice References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Replace the current flat Speakers settings list with Talat-equivalent people, speaker recognition, saved voice-reference snippets, review, and reliable local playback.

**Architecture:** Separate a person’s identity from their many voice references. Each reference holds an embedding plus a short, self-contained 16 kHz mono WAV snippet in Meetily’s app-data directory, so recognition and playback continue to work even if the original meeting recording is later removed. The Rust/Tauri core owns extraction, persistence, matching and authorization of local paths; the React UI owns directory, review queue, reference management and playback through the existing \`useAudioPlayer\` hook.

**Tech Stack:** Tauri 2, Rust, SQLx/SQLite migrations, sherpa-onnx speaker embeddings, hound WAV I/O, Next.js 14, React 18, TypeScript, Tailwind, Radix UI, Vitest.

## Global Constraints

- Implement only in the supported Tauri app under \`frontend/\`; do not modify the archived \`backend/\`.
- Keep all speaker data and voice snippets local; do not upload snippets, embeddings or names.
- Persist playable samples under the Meetily app-data directory, never as a reference to a meeting folder.
- Use 16 kHz mono PCM WAV for references; cap a saved reference at 8 seconds and reject inputs shorter than 1.5 seconds.
- Preserve all existing \`speaker_profiles\` embeddings and names during migration; a legacy embedding without a clip must remain usable for matching and be labeled “no playable sample”.
- Recognition modes must be \`off\`, \`suggest\`, and \`automatic\`; default to \`suggest\`.
- A suggestion must not rename transcript segments or create a confirmed reference until the user accepts it.
- Deleting a person must delete their database rows and only their files inside the managed speaker-reference directory.
- Do not implement calendar, webhooks, MCP, dictation or automatic meeting start as part of this work.
- Do not commit this plan. Implementation commits must contain only validated source, migration and test files.

---

## File map

| File | Responsibility |
| --- | --- |
| \`frontend/src-tauri/migrations/20260723000000_speaker_people_and_voice_references.sql\` | Normalized people/reference tables and lossless migration of the current slot-based profile rows. |
| \`frontend/src-tauri/src/database/repositories/speaker.rs\` | Person CRUD, reference queries, merge, matching and backward-compatible profile adapters. |
| \`frontend/src-tauri/src/database/repositories/voice_reference.rs\` | One focused repository for reference rows, pending matches and secure deletion metadata. |
| \`frontend/src-tauri/src/diarization/voice_references.rs\` | Audio selection, resampling, WAV extraction, waveform peaks, embedding and managed-file cleanup. |
| \`frontend/src-tauri/src/diarization/offline.rs\` | Honour recognition mode and produce reviewable suggestions instead of unconditional relabeling. |
| \`frontend/src-tauri/src/speaker_commands.rs\` | Typed Tauri command DTOs and orchestration for people, snippets, review and preferences. |
| \`frontend/src-tauri/src/lib.rs\` | Export/register the new speaker commands and retire old command implementations only after callers migrate. |
| \`frontend/src/lib/speaker-api.ts\` | Typed frontend wrapper around every speaker Tauri command. |
| \`frontend/src/lib/speaker-types.ts\` | Shared UI DTO types and pure helpers for reference status, labels and duration. |
| \`frontend/src/components/SpeakersSettings.tsx\` | Thin compatibility entry point delegating to the new speaker directory. |
| \`frontend/src/components/speakers/SpeakerDirectory.tsx\` | Searchable people list, empty state, counts and selection. |
| \`frontend/src/components/speakers/SpeakerDetailPanel.tsx\` | Person metadata, color, references, meeting stats, merge and delete actions. |
| \`frontend/src/components/speakers/VoiceReferenceCard.tsx\` | One saved snippet with waveform, source, quality, playback, delete and accessibility labels. |
| \`frontend/src/components/speakers/VoiceReferencePlayer.tsx\` | Playback UI that reuses \`useAudioPlayer\` and cleans up correctly. |
| \`frontend/src/components/speakers/SpeakerReviewQueue.tsx\` | Accept/reject suggestions and choose an alternate person without accidental enrollment. |
| \`frontend/src/components/speakers/SpeakerRecognitionSettings.tsx\` | Off/suggest/automatic and microphone/system channel-lock controls. |
| \`frontend/src/components/VirtualizedTranscriptView.tsx\` and the transcript speaker-label surface located from \`rename_speaker_in_meeting\` | In-context “assign speaker” and “save voice reference” actions. |
| \`frontend/messages/*.json\` | All localized speaker, reference, review and playback copy. |

## Domain contract

The implementation must use these Rust and TypeScript shapes; later tasks rely on them.

\`\`\`rust
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq, Eq)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum RecognitionMode { Off, Suggest, Automatic }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeakerPersonDto {
    pub id: String,
    pub display_name: String,
    pub email: Option<String>,
    pub color: Option<String>,
    pub reference_count: i64,
    pub playable_reference_count: i64,
    pub meeting_count: i64,
    pub last_seen_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceReferenceDto {
    pub id: String,
    pub speaker_id: String,
    pub meeting_id: Option<String>,
    pub source_start_ms: i64,
    pub source_end_ms: i64,
    pub duration_ms: i64,
    pub channel: String,
    pub quality_score: f32,
    pub status: String,
    pub origin: String,
    pub created_at: String,
    pub has_playable_audio: bool,
    pub waveform_peaks: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeakerSuggestionDto {
    pub id: String,
    pub meeting_id: String,
    pub source_label: String,
    pub speaker_id: String,
    pub confidence: f32,
    pub reference_id: Option<String>,
    pub segment_ids: Vec<String>,
}
\`\`\`

\`\`\`ts
export type RecognitionMode = 'off' | 'suggest' | 'automatic';

export interface VoiceReference {
  id: string;
  speaker_id: string;
  meeting_id: string | null;
  source_start_ms: number;
  source_end_ms: number;
  duration_ms: number;
  channel: 'microphone' | 'system' | 'mixed' | 'unknown';
  quality_score: number;
  status: 'pending' | 'confirmed' | 'rejected' | 'legacy';
  origin: 'manual_assignment' | 'accepted_suggestion' | 'automatic_match' | 'legacy';
  created_at: string;
  has_playable_audio: boolean;
  waveform_peaks: number[];
}
\`\`\`

### Task 1: Normalize speaker storage without losing existing profiles

**Files:**
- Create: \`frontend/src-tauri/migrations/20260723000000_speaker_people_and_voice_references.sql\`
- Create: \`frontend/src-tauri/src/database/repositories/voice_reference.rs\`
- Modify: \`frontend/src-tauri/src/database/repositories/mod.rs\`
- Modify: \`frontend/src-tauri/src/database/repositories/speaker.rs\`
- Test: \`frontend/src-tauri/src/database/repositories/voice_reference.rs\`

**Consumes:** the existing \`speaker_profiles\` table with \`display_name\`, \`embedding\`, \`slot\`, \`created_at\`, \`last_seen_at\`, and \`meeting_count\`.

**Produces:** \`SpeakerRepository::list_people\`, \`get_person\`, \`create_person\`, \`rename_person\`, \`merge_people\`, and \`VoiceReferenceRepository::{create,list_for_person,get,delete,create_suggestion,list_suggestions,resolve_suggestion}\`.

- [ ] **Step 1: Write failing repository tests for a person with multiple references, merge, and legacy migration.**

\`\`\`rust
#[tokio::test]
async fn merge_moves_references_to_target_and_deletes_source() {
    let pool = test_pool().await;
    let ana = SpeakerRepository::create_person(&pool, "Ana", None, None).await.unwrap();
    let anna = SpeakerRepository::create_person(&pool, "Anna", None, None).await.unwrap();
    VoiceReferenceRepository::create(&pool, &anna, fixture_reference()).await.unwrap();

    SpeakerRepository::merge_people(&pool, &ana, &anna).await.unwrap();

    assert_eq!(VoiceReferenceRepository::list_for_person(&pool, &ana).await.unwrap().len(), 1);
    assert!(SpeakerRepository::get_person(&pool, &anna).await.unwrap().is_none());
}

#[tokio::test]
async fn legacy_reference_is_matchable_but_not_playable() {
    let reference = VoiceReferenceRepository::from_legacy_embedding(
        "legacy-id", "ana-id", vec![0.25; 256],
    );
    assert_eq!(reference.status, "legacy");
    assert!(!reference.has_playable_audio);
}
\`\`\`

- [ ] **Step 2: Run the tests and confirm they fail because the normalized tables and repository APIs do not exist.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
cargo test --manifest-path src-tauri/Cargo.toml voice_reference -- --nocapture
\`\`\`

Expected: compilation failure mentioning \`VoiceReferenceRepository\` or \`merge_people\`.

- [ ] **Step 3: Add the migration and repositories.**

The migration must create these tables and indexes:

\`\`\`sql
CREATE TABLE speaker_people (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email TEXT,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE speaker_voice_references (
  id TEXT PRIMARY KEY NOT NULL,
  speaker_id TEXT NOT NULL REFERENCES speaker_people(id) ON DELETE CASCADE,
  embedding BLOB NOT NULL,
  audio_relative_path TEXT,
  waveform_peaks BLOB,
  meeting_id TEXT,
  source_start_ms INTEGER NOT NULL DEFAULT 0,
  source_end_ms INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT 'unknown',
  quality_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('pending','confirmed','rejected','legacy')),
  origin TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(audio_relative_path IS NULL OR audio_relative_path NOT LIKE '/%')
);
CREATE INDEX idx_voice_references_speaker ON speaker_voice_references(speaker_id, status);
CREATE INDEX idx_voice_references_meeting ON speaker_voice_references(meeting_id);

CREATE TABLE speaker_match_suggestions (
  id TEXT PRIMARY KEY NOT NULL,
  meeting_id TEXT NOT NULL,
  source_label TEXT NOT NULL,
  speaker_id TEXT NOT NULL REFERENCES speaker_people(id) ON DELETE CASCADE,
  reference_id TEXT REFERENCES speaker_voice_references(id) ON DELETE SET NULL,
  confidence REAL NOT NULL,
  segment_ids_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX idx_speaker_suggestions_pending
  ON speaker_match_suggestions(meeting_id, status);
\`\`\`

Then copy every distinct legacy name to \`speaker_people\`, copy every old row with an embedding to \`speaker_voice_references\` using \`status = 'legacy'\`, \`origin = 'legacy'\`, and no \`audio_relative_path\`, and only then drop \`speaker_profiles\`. Build all queries with bound parameters; \`merge_people\` must run in one SQLx transaction and move references/suggestions before deleting the source person.

- [ ] **Step 4: Run the repository tests and schema migration tests.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
cargo test --manifest-path src-tauri/Cargo.toml voice_reference -- --nocapture
cargo test --manifest-path src-tauri/Cargo.toml speaker -- --nocapture
\`\`\`

Expected: PASS; the migration leaves old names and embeddings visible as legacy references.

- [ ] **Step 5: Commit only validated implementation files.**

\`\`\`powershell
git add frontend/src-tauri/migrations/20260723000000_speaker_people_and_voice_references.sql frontend/src-tauri/src/database/repositories
git commit -m "feat: normalize speaker people and voice references"
\`\`\`

### Task 2: Create and persist playable local voice snippets

**Files:**
- Create: \`frontend/src-tauri/src/diarization/voice_references.rs\`
- Modify: \`frontend/src-tauri/src/diarization/mod.rs\`
- Modify: \`frontend/src-tauri/src/audio/decoder.rs\`
- Modify: \`frontend/src-tauri/src/database/repositories/voice_reference.rs\`
- Create: \`frontend/src-tauri/src/diarization/voice_references_test.rs\`
- Modify: \`frontend/src-tauri/src/lib.rs\`

**Consumes:** \`VoiceReferenceRepository::create\`, the existing decoder, \`extract_embedding(samples, 16_000)\`, and meeting audio resolved by \`get_meeting_audio_path\`.

**Produces:** \`create_voice_reference_from_segments\`, \`get_voice_reference_audio_path\`, \`delete_voice_reference\`, and commands \`create_speaker_voice_reference\`, \`get_speaker_voice_reference_audio_path\`, \`delete_speaker_voice_reference\`.

- [ ] **Step 1: Write failing tests for segment selection, waveform peaks, managed paths, and safe deletion.**

\`\`\`rust
#[test]
fn select_reference_window_caps_to_eight_seconds_around_speech() {
    let window = select_reference_window(&[(1_000, 5_000), (6_000, 12_000)]).unwrap();
    assert_eq!(window.duration_ms(), 8_000);
    assert!(window.start_ms >= 1_000);
    assert!(window.end_ms <= 12_000);
}

#[test]
fn waveform_has_fixed_peak_count_and_bounded_values() {
    let peaks = build_waveform_peaks(&vec![0.5, -1.0, 0.25, 0.0], 32);
    assert_eq!(peaks.len(), 32);
    assert!(peaks.iter().all(|peak| *peak <= 255));
}

#[test]
fn managed_reference_path_cannot_escape_references_directory() {
    assert!(managed_reference_path("../outside.wav").is_err());
    assert!(managed_reference_path("speaker/a.wav").is_ok());
}
\`\`\`

- [ ] **Step 2: Run the tests and confirm they fail.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
cargo test --manifest-path src-tauri/Cargo.toml voice_references -- --nocapture
\`\`\`

Expected: failure because \`voice_references\` and the tested helpers do not exist.

- [ ] **Step 3: Implement deterministic extraction and local storage.**

Implement these exact rules:

1. Collect the selected transcript segments belonging to the speaker. Sort by timestamp and concatenate the highest-quality speech windows until the source coverage reaches 8 seconds; a single saved clip must be 1.5–8 seconds.
2. Decode the original meeting audio through the existing decoder, downmix/resample to 16 kHz mono, apply a 50 ms fade-in/out, and write PCM WAV to \`app_data_dir()/speaker-references/<person-id>/<reference-id>.wav\`.
3. Compute the embedding from the same resampled samples and reject the operation if \`extract_embedding\` fails. Do not create a database row or file on failure.
4. Compute exactly 96 peak bytes by taking the maximum absolute amplitude per bucket. Store them in \`waveform_peaks\`.
5. Write to a temp file, flush it, then rename atomically. If database insertion fails, remove the new file. If deletion is requested, first delete the DB row in a transaction and then remove only the resolved file beneath \`speaker-references\`; log a warning and leave no path traversal opportunity.
6. Return only an application-validated absolute file path from \`get_voice_reference_audio_path(reference_id)\`; return \`None\` for legacy or missing samples.

The command DTO for manual creation must be:

\`\`\`rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVoiceReferenceRequest {
    pub speaker_id: String,
    pub meeting_id: String,
    pub segment_ids: Vec<String>,
    pub channel: Option<String>,
}
\`\`\`

- [ ] **Step 4: Register typed commands and add an integration test with a generated WAV fixture.**

The integration test must create a 16 kHz fixture, create a reference, assert that the returned path exists under the app-data test directory, read it with \`hound::WavReader\`, and assert \`sample_rate == 16_000\`, \`channels == 1\`, \`duration_ms >= 1500\`, and 96 waveform peaks.

Run:

\`\`\`powershell
cd D:\meetily\frontend
cargo test --manifest-path src-tauri/Cargo.toml voice_references -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml
\`\`\`

Expected: PASS.

- [ ] **Step 5: Commit only validated implementation files.**

\`\`\`powershell
git add frontend/src-tauri/src/diarization frontend/src-tauri/src/audio/decoder.rs frontend/src-tauri/src/database/repositories/voice_reference.rs frontend/src-tauri/src/lib.rs
git commit -m "feat: persist and serve speaker voice snippets"
\`\`\`

### Task 3: Make recognition explainable, reviewable, and channel-aware

**Files:**
- Create: \`frontend/src-tauri/src/diarization/speaker_preferences.rs\`
- Modify: \`frontend/src-tauri/src/diarization/offline.rs\`
- Modify: \`frontend/src-tauri/src/database/repositories/voice_reference.rs\`
- Create: \`frontend/src-tauri/src/speaker_commands.rs\`
- Modify: \`frontend/src-tauri/src/lib.rs\`
- Test: \`frontend/src-tauri/src/diarization/offline.rs\`
- Test: \`frontend/src-tauri/src/diarization/speaker_preferences.rs\`

**Consumes:** \`RecognitionMode\`, suggestion repository APIs, managed reference creation, and the existing offline diarization commit flow.

**Produces:** persisted \`SpeakerRecognitionPreferences\`, commands \`get_speaker_recognition_preferences\`, \`set_speaker_recognition_preferences\`, \`list_speaker_suggestions\`, \`accept_speaker_suggestion\`, \`reject_speaker_suggestion\`, \`assign_meeting_speaker\`.

- [ ] **Step 1: Write failing tests defining the recognition policy.**

\`\`\`rust
#[test]
fn off_never_returns_match_or_suggestion() {
    assert_eq!(resolve_match_action(RecognitionMode::Off, 0.99), MatchAction::Ignore);
}

#[test]
fn suggest_creates_review_item_without_changing_labels() {
    assert_eq!(resolve_match_action(RecognitionMode::Suggest, 0.91), MatchAction::Suggest);
}

#[test]
fn automatic_requires_stricter_threshold_than_suggest() {
    assert_eq!(resolve_match_action(RecognitionMode::Automatic, 0.84), MatchAction::Suggest);
    assert_eq!(resolve_match_action(RecognitionMode::Automatic, 0.93), MatchAction::Apply);
}

#[test]
fn channel_lock_blocks_cross_channel_reference_match() {
    assert!(!channel_is_compatible(true, "microphone", "system"));
    assert!(channel_is_compatible(false, "microphone", "system"));
}
\`\`\`

- [ ] **Step 2: Run the tests and confirm the current unconditional matching behavior fails the contract.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
cargo test --manifest-path src-tauri/Cargo.toml diarization::offline -- --nocapture
\`\`\`

Expected: failure or absence of \`resolve_match_action\`; current \`apply_speaker_recognition\` directly relabels matches above the suggestion threshold.

- [ ] **Step 3: Implement preferences and policy enforcement.**

Persist this exact structure locally through the Tauri Store or the existing preference service:

\`\`\`rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerRecognitionPreferences {
    pub recognition_mode: RecognitionMode,
    pub lock_audio_channels: bool,
    pub minimum_reference_quality: f32,
}
impl Default for SpeakerRecognitionPreferences {
    fn default() -> Self {
        Self {
            recognition_mode: RecognitionMode::Suggest,
            lock_audio_channels: true,
            minimum_reference_quality: 0.60,
        }
    }
}
\`\`\`

Update \`apply_speaker_recognition\` as follows:

- \`off\`: return no matched labels and create no suggestion.
- \`suggest\`: persist \`speaker_match_suggestions\` with segment IDs, best person, confidence and optional pending reference; do not update \`transcripts.speaker\`.
- \`automatic\`: only update labels at confidence \`>= 0.90\` and when channel-compatible. Create a confirmed reference only when the speech quality score meets the configured minimum.
- a manual \`assign_meeting_speaker\` updates only that meeting’s transcript segments, creates a confirmed voice reference from those segments, and never renames old meetings.
- accepting a suggestion applies its stored segment IDs to the current meeting, marks its reference confirmed, and records \`accepted_suggestion\`; rejecting marks it rejected and deletes its pending audio file.
- matching must compare a cluster against all confirmed and legacy references for a person, select the best cosine similarity, and report the specific reference ID used.

- [ ] **Step 4: Run tests and exercise all three modes.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
cargo test --manifest-path src-tauri/Cargo.toml diarization::offline -- --nocapture
cargo test --manifest-path src-tauri/Cargo.toml speaker_preferences -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml
\`\`\`

Expected: PASS; a suggest-mode fixture produces a review row while retaining its original \`Speaker N\` transcript label.

- [ ] **Step 5: Commit only validated implementation files.**

\`\`\`powershell
git add frontend/src-tauri/src/diarization frontend/src-tauri/src/speaker_commands.rs frontend/src-tauri/src/lib.rs frontend/src-tauri/src/database/repositories
git commit -m "feat: add reviewable speaker recognition"
\`\`\`

### Task 4: Build the Talat-style People and voice-reference screen

**Files:**
- Create: \`frontend/src/lib/speaker-types.ts\`
- Create: \`frontend/src/lib/speaker-api.ts\`
- Create: \`frontend/src/components/speakers/SpeakerDirectory.tsx\`
- Create: \`frontend/src/components/speakers/SpeakerDetailPanel.tsx\`
- Create: \`frontend/src/components/speakers/VoiceReferenceCard.tsx\`
- Create: \`frontend/src/components/speakers/VoiceReferencePlayer.tsx\`
- Create: \`frontend/src/components/speakers/SpeakerReviewQueue.tsx\`
- Create: \`frontend/src/components/speakers/SpeakerRecognitionSettings.tsx\`
- Modify: \`frontend/src/components/SpeakersSettings.tsx\`
- Modify: \`frontend/src/components/settings/SpeakerSettingsSection.tsx\` if created by the settings refactor plan
- Test: \`frontend/src/components/speakers/VoiceReferencePlayer.test.tsx\`
- Test: \`frontend/src/components/speakers/SpeakerDirectory.test.tsx\`

**Consumes:** the command DTOs from Tasks 1–3 and \`useAudioPlayer(audioPath)\`.

**Produces:** searchable people directory, profile detail, actual snippet playback, review queue, color controls, merge/delete actions and recognition controls.

- [ ] **Step 1: Write failing component tests for playback and profile operations.**

\`\`\`tsx
it('plays a stored reference and renders its waveform peaks', async () => {
  mockGetReferencePath.mockResolvedValue('C:\\\\Meetily\\\\speaker-references\\\\ana\\\\ref.wav');
  render(<VoiceReferenceCard reference={referenceWithPeaks} onDeleted={vi.fn()} />);

  await userEvent.click(screen.getByRole('button', { name: /ouvir referência de voz/i }));

  expect(mockUseAudioPlayer).toHaveBeenCalledWith('C:\\\\Meetily\\\\speaker-references\\\\ana\\\\ref.wav');
  expect(screen.getByLabelText(/forma de onda da referência/i)).toBeVisible();
});

it('does not show a play control for a migrated legacy reference', () => {
  render(<VoiceReferenceCard reference={{ ...referenceWithPeaks, has_playable_audio: false, status: 'legacy' }} onDeleted={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /ouvir referência de voz/i })).not.toBeInTheDocument();
  expect(screen.getByText(/sem trecho de voz salvo/i)).toBeVisible();
});
\`\`\`

- [ ] **Step 2: Run frontend tests and confirm they fail because the screen and API do not exist.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/speakers/VoiceReferencePlayer.test.tsx src/components/speakers/SpeakerDirectory.test.tsx
\`\`\`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement the UI with these interactions.**

1. Replace the current one-row-per-name list with a two-pane “Pessoas” directory: searchable left list (name/email), selected person detail on the right, responsive drawer/select fallback on narrow windows.
2. The list must show avatar/color, name, number of voice references, number playable, meeting count, last seen, and a visible “needs reference” state when the person has no confirmed embedding.
3. The detail panel must support rename, email, color override, merge into another person (explicit confirmation naming source and target), delete person (explicit confirmation including reference count), and a references list sorted newest first.
4. A \`VoiceReferenceCard\` must show waveform peaks, duration, source meeting/date, channel, origin, quality indicator, play/pause, seek slider, and delete. It obtains the path with \`get_speaker_voice_reference_audio_path\` and reuses \`useAudioPlayer\`; never construct a file URL directly.
5. On playback error, show a localized error and retain the card; on deleting a currently playing reference, pause playback, clear the local path, wait for the command, and remove the card only after success.
6. Show legacy references with their creation date and “recognition only; no playable clip” rather than a fake Play action.
7. Include a review queue with confidence, source label, person, short snippet player and actions: Accept, Reject, Choose another person. “Choose another” calls the manual assignment command and creates a reference for the selected person only after confirmation.
8. Include recognition mode and channel-lock controls at the top of the screen, with a concise privacy statement that voice references stay on the device.
9. Keep all new text in \`frontend/messages/*.json\`; preserve localized labels and accessible names for every icon-only action.

- [ ] **Step 4: Run unit and i18n tests.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/speakers/VoiceReferencePlayer.test.tsx src/components/speakers/SpeakerDirectory.test.tsx
pnpm run test:i18n
pnpm run lint
\`\`\`

Expected: PASS.

- [ ] **Step 5: Commit only validated implementation files.**

\`\`\`powershell
git add frontend/src/lib/speaker-api.ts frontend/src/lib/speaker-types.ts frontend/src/components/speakers frontend/src/components/SpeakersSettings.tsx frontend/messages
git commit -m "feat: add speaker directory and voice reference playback"
\`\`\`

### Task 5: Teach Meetily from transcript corrections and expose per-meeting people

**Files:**
- Modify: \`frontend/src/components/VirtualizedTranscriptView.tsx\`
- Modify: the transcript speaker-label component found by tracing \`rename_speaker_in_meeting\`
- Modify: \`frontend/src/lib/speaker-api.ts\`
- Modify: \`frontend/src-tauri/src/speaker_commands.rs\`
- Modify: \`frontend/src-tauri/src/database/repositories/transcript.rs\`
- Create: \`frontend/src/components/speakers/AssignSpeakerDialog.tsx\`
- Create: \`frontend/src/components/speakers/MeetingPeoplePanel.tsx\`
- Test: \`frontend/src/components/speakers/AssignSpeakerDialog.test.tsx\`

**Consumes:** \`assign_meeting_speaker\`, directory search, snippet creation, matching preferences and color helpers.

**Produces:** in-context speaker correction that creates voice references, and a meeting-scoped people panel with speaking time and reference state.

- [ ] **Step 1: Write failing tests for confirmation and meeting scoping.**

\`\`\`tsx
it('requires confirmation before teaching a voice from transcript segments', async () => {
  render(<AssignSpeakerDialog meetingId="m1" sourceLabel="Speaker 2" segmentIds={['s1', 's2']} />);
  await userEvent.click(screen.getByRole('option', { name: 'Ana' }));
  await userEvent.click(screen.getByRole('button', { name: /salvar referência de voz/i }));

  expect(mockAssignMeetingSpeaker).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: /confirmar e ensinar/i }));
  expect(mockAssignMeetingSpeaker).toHaveBeenCalledWith({
    meetingId: 'm1', speakerId: 'ana', segmentIds: ['s1', 's2'],
  });
});
\`\`\`

- [ ] **Step 2: Run the test and confirm it fails.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/speakers/AssignSpeakerDialog.test.tsx
\`\`\`

Expected: FAIL because the dialog is absent.

- [ ] **Step 3: Implement transcript teaching and participant visibility.**

1. Make each transcript speaker label actionable. Clicking it opens \`AssignSpeakerDialog\` with the current meeting ID, all segments belonging to that temporary label, searchable people list and “create new person”.
2. Require an explicit confirmation that says the current meeting will be relabeled and a local voice reference will be saved. The confirmation must not imply changes to prior meetings.
3. After success, update the virtualized transcript source optimistically only after the command returns the affected segment IDs; refresh the speaker color map and show a toast containing reference count.
4. Add \`MeetingPeoplePanel\` to the meeting detail people side panel from the preceding Talat-like workspace plan. It must list detected people, speaking duration, assigned color, channel, match state (listening/suggested/confirmed after events are available), and a button to open their person detail.
5. Aggregate speaking time in Rust from transcript segment audio timestamps. When timestamps are unavailable, display “duration unavailable”; do not invent a duration.
6. Preserve existing \`rename_speaker_in_meeting\` callers as a compatibility path until all use \`assign_meeting_speaker\`; then remove the old UI route but keep a migration-safe backend wrapper if external app code still calls it.

- [ ] **Step 4: Run tests and manual validation.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/speakers/AssignSpeakerDialog.test.tsx
pnpm run lint
cargo test --manifest-path src-tauri/Cargo.toml transcript -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml
\`\`\`

Manual check: import/record a two-speaker meeting, assign “Speaker 2” to a person, verify the current meeting changes, open People, play the generated snippet, then open another meeting and verify the reference is available for recognition.

- [ ] **Step 5: Commit only validated implementation files.**

\`\`\`powershell
git add frontend/src/components/VirtualizedTranscriptView.tsx frontend/src/components/speakers frontend/src/lib/speaker-api.ts frontend/src-tauri/src/speaker_commands.rs frontend/src-tauri/src/database/repositories/transcript.rs
git commit -m "feat: learn speaker voices from transcript corrections"
\`\`\`

### Task 6: End-to-end migration, privacy and regression gate

**Files:**
- Modify: \`frontend/src-tauri/src/database/repositories/speaker.rs\` tests as needed
- Modify: \`frontend/src-tauri/src/diarization/voice_references_test.rs\` as needed
- Modify: \`frontend/messages/*.json\`
- Create: \`frontend/src/components/speakers/SpeakerFlow.test.tsx\`

**Consumes:** all prior tasks.

**Produces:** verified migration, reliable playback cleanup and documented local-only behavior.

- [ ] **Step 1: Write the full user-flow test.**

\`\`\`tsx
it('creates, plays, reviews, and deletes a local voice reference without exposing an external URL', async () => {
  render(<SpeakerDirectory />);
  await userEvent.click(screen.getByRole('button', { name: /criar pessoa/i }));
  await userEvent.type(screen.getByLabelText(/nome/i), 'Ana');
  await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

  await createReferenceThroughTranscript('m1', 'ana', ['s1', 's2']);
  await userEvent.click(screen.getByRole('button', { name: /ouvir referência de voz/i }));
  expect(screen.getByLabelText(/progresso da reprodução/i)).toBeVisible();

  await userEvent.click(screen.getByRole('button', { name: /excluir referência/i }));
  await userEvent.click(screen.getByRole('button', { name: /confirmar exclusão/i }));
  expect(mockDeleteReference).toHaveBeenCalled();
  expect(mockTelemetry).not.toHaveBeenCalledWith(expect.objectContaining({ audioPath: expect.any(String) }));
});
\`\`\`

- [ ] **Step 2: Run it and confirm it initially fails until integration wiring is complete.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/speakers/SpeakerFlow.test.tsx
\`\`\`

Expected: FAIL before all flow components and mocks are integrated.

- [ ] **Step 3: Validate migration and cleanup behavior.**

Add Rust tests covering:

- migration from three legacy \`speaker_profiles\` slots for the same display name creates one person plus three \`legacy\` references;
- a legacy profile still participates in \`find_match\`;
- a confirmed snippet plays after deleting its source meeting folder;
- deleting a reference removes only \`app_data_dir/speaker-references/<person>/<reference>.wav\`;
- deleting a person removes all of that person’s snippets but not another person’s;
- rejecting a suggestion removes its pending snippet;
- no command returns a path outside the managed directory.

- [ ] **Step 4: Run the complete validation suite.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/speakers
pnpm run test:i18n
pnpm run lint
pnpm run build
cargo test --manifest-path src-tauri/Cargo.toml speaker -- --nocapture
cargo test --manifest-path src-tauri/Cargo.toml voice_reference -- --nocapture
cargo test --manifest-path src-tauri/Cargo.toml diarization -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
\`\`\`

Expected: all commands exit 0.

- [ ] **Step 5: Perform Windows Tauri acceptance checks and commit.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm run tauri:dev
\`\`\`

Verify manually:

1. Existing speakers survive migration and are explicitly marked as legacy references.
2. Assigning a transcript label creates a WAV snippet and it plays after Meetily restart.
3. The snippet still plays after the original meeting audio is removed.
4. Suggest mode never changes labels before approval; automatic mode only updates high-confidence, same-channel matches; off mode does neither.
5. Merge preserves all snippets; deleting a person removes only that person’s snippets.
6. Dark/light appearance, keyboard navigation and screen-reader labels work on directory, review and playback controls.

Then commit:

\`\`\`powershell
git add frontend
git commit -m "feat: complete Talat-style speaker voice references"
\`\`\`

## Acceptance criteria

- The screen feels like Talat’s people/voice-reference workflow: searchable people directory, a rich person detail, reference indicators, review queue, matching policy and channel locking.
- A user can identify or correct a speaker in one meeting and Meetily stores a local, playable snippet plus an embedding for future meetings.
- The Play control plays an actual stored audio clip, has waveform/progress/seek behavior, and never appears for a non-playable legacy embedding.
- Snippets remain playable after original meeting retention deletes the source recording.
- All recognition is local and explainable; suggestions require user confirmation unless automatic mode is deliberately selected.
- Legacy profiles are migrated losslessly, existing matching remains functional, and no archived backend code is used.

