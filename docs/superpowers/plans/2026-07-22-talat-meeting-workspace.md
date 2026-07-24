# Talat-inspired Meeting Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Replace the Meeting Details UI with a Talat-inspired, local-first workspace with waveform playback, four tabs, and a participant sidebar.

**Architecture:** Keep Meetily's existing Tauri audio, diarization, transcript, and summary pipeline. Compose the current \`VirtualizedTranscriptView\`, \`useAudioPlayer\`, summary editor, and meeting-detail hooks in a new workspace; add only local SQLite persistence required for per-meeting notes and action completion. Render waveform peaks in Canvas 2D from the already-local audio bytes—no cloud service and no additional waveform package.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind, Radix Tabs, lucide-react, Tauri 2, Rust, SQLite, Vitest, React Testing Library.

## Global Constraints

- Recreate the structure and visual direction observed in Talat; do not copy Talat code, assets, logo, or wording.
- Keep audio capture, Whisper/Parakeet, diarization, profiles, and summary generation intact.
- Exclude dictation, calendar, automatic recording, webhooks, and MCP.
- Add no frontend-facing behavior to the archived \`backend/\` FastAPI service.
- Use the current \`next-intl\` messages for every new visible string.
- Desktop: fixed right panel; below \`lg\`, show it through an accessible participants sheet.
- Never commit this plan; commits during execution include only validated implementation files.

## File structure

- Create \`frontend/src/components/MeetingWorkspace/types.ts\`: \`MeetingWorkspaceTab\`, \`WorkspaceParticipant\`, \`WorkspaceAction\`, and \`AudioController\`.
- Create \`frontend/src/components/MeetingWorkspace/MeetingWorkspace.tsx\`: shell and tab state.
- Create \`frontend/src/components/MeetingWorkspace/MeetingHeader.tsx\`: date, editable title, playback and duration.
- Create \`frontend/src/components/MeetingWorkspace/MeetingTimeline.tsx\`: Canvas waveform, segment lanes, seek.
- Create \`frontend/src/components/MeetingWorkspace/MeetingTabs.tsx\`: accessible tab list.
- Create \`frontend/src/components/MeetingWorkspace/ParticipantsSidebar.tsx\`: microphone/system speaker groups.
- Create \`frontend/src/components/MeetingWorkspace/MeetingNotesTab.tsx\`: debounced local Markdown notes.
- Create \`frontend/src/components/MeetingWorkspace/MeetingActionsTab.tsx\`: summary-derived checklist and completion state.
- Create \`frontend/src/components/MeetingWorkspace/MeetingSummaryTab.tsx\`: adapter around existing \`SummaryPanel\`.
- Create \`frontend/src/components/MeetingWorkspace/useMeetingWorkspace.ts\`: derives participants/actions from transcript and summary.
- Create \`frontend/src/components/MeetingWorkspace/waveform.ts\`: deterministic peak and seek helpers.
- Create \`frontend/src/hooks/useAudioPeaks.ts\`: decode local audio and return bounded Canvas peaks.
- Create \`frontend/src/lib/meeting-workspace-storage.ts\`: typed Tauri wrappers.
- Create \`frontend/src-tauri/src/database/repositories/workspace.rs\`: local note/action SQLite CRUD.
- Modify \`frontend/src-tauri/src/database/repositories/mod.rs\`, \`database/mod.rs\`, \`database/commands.rs\`, and \`lib.rs\`: schema, commands, exports, registration.
- Modify \`frontend/src/app/meeting-details/page-content.tsx\`: replace the old split layout with \`MeetingWorkspace\`.
- Modify \`frontend/src/hooks/useAudioPlayer.ts\`: expose one shared \`seek(seconds)\` control if not already exposed.
- Modify \`frontend/messages/*.json\`: translations.
- Create \`frontend/tests/meeting-workspace/*.test.ts(x)\` and configure Vitest only if the current frontend test setup does not expose a unit-test command.

## Shared interfaces

\`\`\`ts
export type MeetingWorkspaceTab = 'transcript' | 'notes' | 'actions' | 'summary';

export interface WorkspaceParticipant {
  id: string;
  name: string;
  color: string;
  source: 'microphone' | 'system';
  spokenSeconds: number;
  share: number;
}

export interface WorkspaceAction {
  id: string;
  text: string;
  assigneeId: string | null;
  completed: boolean;
}

export interface AudioController {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  toggle: () => void;
  seek: (seconds: number) => void;
}
\`\`\`

## Task 1: Establish test coverage and waveform helpers

**Files:** create \`types.ts\`, \`waveform.ts\`, \`frontend/tests/meeting-workspace/waveform.test.ts\`; add frontend Vitest config/setup only if absent.

- [ ] **Step 1: Write the failing helper tests.**

\`\`\`ts
import { describe, expect, it } from 'vitest';
import { bucketPeaks, secondsFromPointer } from '@/components/MeetingWorkspace/waveform';

describe('bucketPeaks', () => {
  it('returns one normalized peak per display column', () => {
    expect([...bucketPeaks(new Float32Array([0, -0.5, 1, 0.25]), 2)]).toEqual([0.5, 1]);
  });
});

it('clamps seeking to duration', () => {
  expect(secondsFromPointer(250, { left: 100, width: 100 } as DOMRect, 60)).toBe(60);
});
\`\`\`

- [ ] **Step 2: Run it to prove the new helpers are missing.**

Run: \`pnpm exec vitest run frontend/tests/meeting-workspace/waveform.test.ts\`

Expected: module-resolution failure for \`waveform\`.

- [ ] **Step 3: Implement the pure helpers.**

\`\`\`ts
export function bucketPeaks(samples: Float32Array, width: number): Float32Array {
  const peaks = new Float32Array(Math.max(1, width));
  const bucketSize = Math.ceil(samples.length / peaks.length);
  for (let bucket = 0; bucket < peaks.length; bucket += 1) {
    for (let sample = bucket * bucketSize; sample < Math.min(samples.length, (bucket + 1) * bucketSize); sample += 1) {
      peaks[bucket] = Math.max(peaks[bucket], Math.abs(samples[sample]));
    }
  }
  return peaks;
}

export function secondsFromPointer(clientX: number, rect: DOMRect, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0 || rect.width <= 0) return 0;
  return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
}
\`\`\`

- [ ] **Step 4: Verify and commit.**

Run: \`pnpm exec vitest run frontend/tests/meeting-workspace/waveform.test.ts && pnpm exec tsc --noEmit\`

Expected: PASS and exit code 0.

Commit: \`git commit -m "test: add meeting workspace waveform coverage"\`.

## Task 2: Persist Notes and Actions locally

**Files:** create \`workspace.rs\` and \`meeting-workspace-storage.ts\`; modify Tauri database schema, command registration, repository exports, and \`lib.rs\`.

- [ ] **Step 1: Write the failing Rust repository test.**

\`\`\`rust
#[test]
fn workspace_note_and_actions_are_scoped_to_a_meeting() {
    let repository = test_workspace_repository();
    repository.save_note("meeting-a", "# Follow-up").unwrap();
    repository.set_action_completed("meeting-a", "summary:action_items:0", true).unwrap();

    assert_eq!(repository.get_note("meeting-a").unwrap().as_deref(), Some("# Follow-up"));
    assert!(repository.get_action_states("meeting-a").unwrap()["summary:action_items:0"]);
    assert!(repository.get_action_states("meeting-b").unwrap().is_empty());
}
\`\`\`

- [ ] **Step 2: Run the focused test.**

Run: \`cargo test workspace_note_and_actions_are_scoped_to_a_meeting --manifest-path frontend/src-tauri/Cargo.toml\`

Expected: FAIL because \`WorkspaceRepository\` is unavailable.

- [ ] **Step 3: Add idempotent local tables at the same startup schema point used by the active Tauri database.**

\`\`\`sql
CREATE TABLE IF NOT EXISTS meeting_workspace_notes (
  meeting_id TEXT PRIMARY KEY NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS meeting_action_states (
  meeting_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (meeting_id, action_id)
);
\`\`\`

- [ ] **Step 4: Register these commands and typed wrappers.**

\`\`\`ts
export const getMeetingNote = (meetingId: string) => invoke<string>('get_meeting_note', { meetingId });
export const saveMeetingNote = (meetingId: string, content: string) => invoke<void>('save_meeting_note', { meetingId, content });
export const getMeetingActionStates = (meetingId: string) => invoke<Record<string, boolean>>('get_meeting_action_states', { meetingId });
export const setMeetingActionCompleted = (meetingId: string, actionId: string, completed: boolean) =>
  invoke<void>('set_meeting_action_completed', { meetingId, actionId, completed });
\`\`\`

- [ ] **Step 5: Verify and commit.**

Run: \`cargo test workspace_note_and_actions_are_scoped_to_a_meeting --manifest-path frontend/src-tauri/Cargo.toml && cargo check --manifest-path frontend/src-tauri/Cargo.toml\`

Expected: PASS and exit code 0.

Commit: \`git commit -m "feat: persist meeting workspace notes and actions"\`.

## Task 3: Build the Talat-inspired meeting shell

**Files:** create \`MeetingWorkspace.tsx\`, \`MeetingHeader.tsx\`, \`MeetingTabs.tsx\`, and \`meeting-tabs.test.tsx\`; modify \`page-content.tsx\`.

- [ ] **Step 1: Write the failing structure test.**

\`\`\`tsx
it('starts on Transcript and shows all workspace regions', () => {
  render(<MeetingWorkspace {...fixture} />);
  expect(screen.getByRole('tab', { name: /transcript/i })).toHaveAttribute('data-state', 'active');
  expect(screen.getByRole('tab', { name: /notes/i })).toBeVisible();
  expect(screen.getByRole('tab', { name: /actions/i })).toBeVisible();
  expect(screen.getByRole('tab', { name: /summary/i })).toBeVisible();
  expect(screen.getByRole('complementary', { name: /participants/i })).toBeVisible();
});
\`\`\`

- [ ] **Step 2: Run it.**

Run: \`pnpm exec vitest run frontend/tests/meeting-workspace/meeting-tabs.test.tsx\`

Expected: FAIL because \`MeetingWorkspace\` does not exist.

- [ ] **Step 3: Implement the visual frame.**

\`\`\`tsx
<main className="min-h-screen bg-[#fbfaf7] text-stone-900">
  <MeetingHeader meeting={meeting} audio={audio} />
  <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <section aria-label="Meeting content" className="min-w-0 border-r border-stone-200">...</section>
    <ParticipantsSidebar aria-label="Participants" participants={participants} />
  </div>
</main>
\`\`\`

Use a large title, small uppercase date line, fine stone dividers, restrained magenta only for active progress, and a fixed right panel on desktop. Replace the old resize divider intentionally. Pass existing summary, pagination, copy, save, and meeting-operation callbacks down unchanged; do not modify the summary hooks or backend calls.

- [ ] **Step 4: Verify and commit.**

Run: \`pnpm exec vitest run frontend/tests/meeting-workspace/meeting-tabs.test.tsx && pnpm run lint && pnpm run build\`

Expected: PASS and both commands exit 0.

Commit: \`git commit -m "feat: add Talat-inspired meeting workspace"\`.

## Task 4: Add a synchronized waveform timeline

**Files:** create \`MeetingTimeline.tsx\`, \`useAudioPeaks.ts\`, \`meeting-timeline.test.tsx\`; modify \`useAudioPlayer.ts\`, header and workspace.

- [ ] **Step 1: Write the failing seek interaction test.**

\`\`\`tsx
it('seeks shared audio when the waveform is clicked', async () => {
  const seek = vi.fn();
  render(<MeetingTimeline audio={{ ...audioFixture, seek }} peaks={new Float32Array([0.1, 1])} segments={segments} />);
  await user.click(screen.getByLabelText(/audio timeline/i), { clientX: 150 });
  expect(seek).toHaveBeenCalledWith(expect.any(Number));
});
\`\`\`

- [ ] **Step 2: Run it.**

Run: \`pnpm exec vitest run frontend/tests/meeting-workspace/meeting-timeline.test.tsx\`

Expected: FAIL because the timeline component does not exist.

- [ ] **Step 3: Extend the existing player hook with one seek function.**

\`\`\`ts
const seek = useCallback((seconds: number) => {
  const audio = audioRef.current;
  if (audio && Number.isFinite(seconds)) audio.currentTime = Math.max(0, Math.min(seconds, duration || seconds));
}, [duration]);
\`\`\`

Keep one audio element. Both the existing \`VirtualizedTranscriptView.onTimestampClick\` and timeline click must call this same function. \`useAudioPeaks\` reads the local bytes through the same Tauri path already used by the player, decodes with \`AudioContext.decodeAudioData\`, mixes to mono, bounds sampling, and closes its audio context.

- [ ] **Step 4: Draw an accessible Canvas button.**

Paint gray peaks, a magenta elapsed overlay, speaker-color activity lanes based on transcript start/end times, and optional numbered markers only where summary sections provide actual timestamps. Use \`aria-label="Audio timeline"\`. When no audio exists, show a disabled neutral timeline; tabs still work.

- [ ] **Step 5: Verify and commit.**

Run: \`pnpm exec vitest run frontend/tests/meeting-workspace/meeting-timeline.test.tsx\`

Expected: PASS.

Run: \`pnpm run tauri:dev\`

Expected: play/pause, timestamp click, and waveform click control the same audio playback.

Commit: \`git commit -m "feat: add seekable meeting waveform timeline"\`.

## Task 5: Add the speaker sidebar from diarization data

**Files:** create \`ParticipantsSidebar.tsx\`, \`useMeetingWorkspace.ts\`, and \`participants-sidebar.test.tsx\`.

- [ ] **Step 1: Write the failing aggregation test.**

\`\`\`tsx
it('groups speakers and presents time share', () => {
  render(<ParticipantsSidebar participants={[
    { id: 'me', name: 'You', source: 'microphone', spokenSeconds: 30, share: 0.6, color: '#16a34a' },
    { id: 'ana', name: 'Ana', source: 'system', spokenSeconds: 20, share: 0.4, color: '#2563eb' },
  ]} />);
  expect(screen.getByText(/microphone/i)).toBeVisible();
  expect(screen.getByText(/system audio/i)).toBeVisible();
  expect(screen.getByText(/30s.*60%/i)).toBeVisible();
});
\`\`\`

- [ ] **Step 2: Run it.**

Run: \`pnpm exec vitest run frontend/tests/meeting-workspace/participants-sidebar.test.tsx\`

Expected: FAIL because the sidebar does not exist.

- [ ] **Step 3: Derive speakers deterministically.**

\`\`\`ts
const duration = Math.max(0, (segment.audio_end_time ?? segment.audio_start_time) - segment.audio_start_time);
const participantId = segment.speaker ?? segment.transient_speaker ?? 'unassigned';
\`\`\`

Use existing \`buildSpeakerColorMap\`/speaker-color helpers to match transcript colors. Group the known local speaker as microphone and others as system; show \`Unassigned\` rather than inventing identities. This task displays current diarization results only—no new voice enrollment/review workflow.

- [ ] **Step 4: Verify and commit.**

Run: \`pnpm exec vitest run frontend/tests/meeting-workspace/participants-sidebar.test.tsx\`

Expected: PASS.

Manual check: below \`lg\`, open the participants sheet by keyboard and close it with Escape.

Commit: \`git commit -m "feat: show participants in meeting workspace sidebar"\`.

## Task 6: Make Notes and Actions tabs functional

**Files:** create \`MeetingNotesTab.tsx\`, \`MeetingActionsTab.tsx\`; modify workspace, derived-data hook, and translations.

- [ ] **Step 1: Add failing behavior tests.**

\`\`\`tsx
it('debounces note persistence', async () => {
  render(<MeetingNotesTab meetingId="m-1" />);
  await user.type(screen.getByRole('textbox', { name: /meeting notes/i }), 'Decision: ship Friday');
  await waitFor(() => expect(saveMeetingNote).toHaveBeenCalledWith('m-1', 'Decision: ship Friday'));
});

it('stores action completion without editing summary content', async () => {
  render(<MeetingActionsTab meetingId="m-1" actions={[{ id: 'summary:action_items:0', text: 'Send proposal', assigneeId: null, completed: false }]} />);
  await user.click(screen.getByRole('checkbox', { name: /send proposal/i }));
  expect(setMeetingActionCompleted).toHaveBeenCalledWith('m-1', 'summary:action_items:0', true);
});
\`\`\`

- [ ] **Step 2: Run tests.**

Run: \`pnpm exec vitest run frontend/tests/meeting-workspace/meeting-tabs.test.tsx\`

Expected: FAIL because the Notes/Actions components are absent.

- [ ] **Step 3: Implement Notes.**

Use a Markdown textarea with a 500 ms debounce, immediate save on blur, quiet \`Saving…\`/ \`Saved\` state, and cancellation of a pending timer when meeting ID changes. Do not reuse \`frontend/src/app/notes/[id]/page.tsx\`: it is static sample data, not persistent meeting notes.

- [ ] **Step 4: Implement Actions.**

Read the current structured summary's \`action_items\` blocks. Use stable IDs such as \`summary:action_items:0\`, a native accessible checkbox, optional matched participant avatar, and the local completion storage from Task 2. When summary contains no action items, show a clear empty state. Regeneration must not erase stored completion states.

- [ ] **Step 5: Verify and commit.**

Run: \`pnpm exec vitest run frontend/tests/meeting-workspace/meeting-tabs.test.tsx && pnpm run check:i18n && pnpm run lint && pnpm run build\`

Expected: all commands exit 0.

Commit: \`git commit -m "feat: add meeting notes and actions tabs"\`.

## Task 7: Embed the existing Summary workflow in the final tab

**Files:** create \`MeetingSummaryTab.tsx\`; modify workspace; modify \`SummaryPanel.tsx\` only if an outer layout wrapper prevents embedding.

- [ ] **Step 1: Write the failing regression test.**

\`\`\`tsx
it('keeps summary generation reachable in the Summary tab', async () => {
  render(<MeetingWorkspace {...fixture} />);
  await user.click(screen.getByRole('tab', { name: /summary/i }));
  expect(screen.getByRole('button', { name: /generate summary/i })).toBeVisible();
});
\`\`\`

- [ ] **Step 2: Run it.**

Run: \`pnpm exec vitest run frontend/tests/meeting-workspace/meeting-tabs.test.tsx\`

Expected: FAIL because the tab has no summary content.

- [ ] **Step 3: Use a thin adapter.**

\`\`\`tsx
export function MeetingSummaryTab(props: SummaryPanelProps) {
  return <SummaryPanel {...props} />;
}
\`\`\`

Remove only visual wrappers that duplicate the new shared header. Preserve current model selection, templates, summary-language storage, generation, cancellation, save, copy, and BlockNote editing behavior.

- [ ] **Step 4: Verify and commit.**

Run: \`pnpm exec vitest run frontend/tests/meeting-workspace/meeting-tabs.test.tsx && pnpm run build\`

Expected: PASS and exit code 0.

Commit: \`git commit -m "refactor: render summary in meeting workspace tabs"\`.

## Task 8: Visual parity review and full verification

- [ ] **Step 1: Compare against the Talat reference.**

Confirm: title/date hierarchy, play button, waveform/progress, active tab treatment, quiet dividers, speaker sidebar, Transcript/Notes/Actions/Summary tabs, and task list. Preserve Meetily branding.

- [ ] **Step 2: Manually exercise six states.**

1. Audio plus diarized speakers.
2. No audio file.
3. No transcript.
4. No summary/action items.
5. Narrow desktop/mobile window.
6. Keyboard-only tab, waveform, checkbox, and participants-sheet navigation.

- [ ] **Step 3: Run final gates.**

Run: \`pnpm exec vitest run frontend/tests/meeting-workspace\`

Expected: PASS.

Run: \`pnpm run check:i18n && pnpm run lint && pnpm run build\`

Expected: all commands exit 0.

Run: \`cargo test --manifest-path frontend/src-tauri/Cargo.toml\`

Expected: PASS.

- [ ] **Step 4: Commit only validated implementation.**

\`\`\`bash
git add frontend/src frontend/src-tauri/src frontend/tests frontend/messages frontend/package.json
git commit -m "feat: deliver Talat-inspired meeting workspace"
\`\`\`

## Scope verification

- Header, waveform, tabs, and participant sidebar are explicitly implemented.
- Notes/action persistence is local SQLite and scoped by \`meeting_id\`.
- Existing summary and audio paths are reused; no duplicate player or audio upload is introduced.
- Dictation, calendar, automatic recording, webhook, and MCP have no task and remain deferred.
- The archived Python backend is untouched.

