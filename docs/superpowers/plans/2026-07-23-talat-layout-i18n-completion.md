# Talat Layout and i18n Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Meetily’s desktop UI match the Talat layout model: one global icon rail, a contextual meeting-people panel, a continuous transcript, complete visible translations, and consistent Settings and People screens.

**Architecture:** Preserve the existing Tauri commands, meeting directory, audio player, transcript virtualizer, diarization, and local persistence. Replace competing layout ownership with `AppShell` as the only application navigation shell; meeting-specific people remain an `aside` owned by `MeetingWorkspace`. Move transcript transport controls into the workspace header/timeline and render segment content in the full content lane.

**Tech Stack:** Tauri 2, Next.js 14, React 18, TypeScript, Tailwind CSS, next-intl, Vitest, React Testing Library, Rust, SQLite.

---

## Non-negotiable constraints

- Do not modify `backend/`; it is archived and unsupported.
- Do not copy Talat assets, copy, or branding. Use it only as layout and interaction reference.
- Keep the application rail as the sole global navigation. Settings may have an in-page section menu; the meeting People panel is contextual information, not navigation.
- Every string presented to the user must come from `next-intl`; no raw translation keys may reach the DOM.
- Never commit this plan. Each implementation commit contains only the validated source and tests changed by its task.
- Preserve existing user changes and do not reset the worktree.

## Target layout contract

| Region | Required behavior | Primary owner |
| --- | --- | --- |
| Global rail | One compact, icon-first rail for Home, meetings, record, import, people, settings and utility actions. | `AppShell` |
| Meeting header | Date, editable title, compact audio controls and one waveform/timeline. | `MeetingHeader` + `MeetingTimeline` |
| Meeting content | One fluid reading lane with tabs and transcript/notes/actions/summary. | `MeetingWorkspace` |
| Transcript | Each segment is speaker, text and timestamp in one row; no independently sized transcript side pane. | transcript content adapter + `VirtualizedTranscriptView` |
| Meeting People | Fixed desktop contextual panel; accessible sheet below `lg`; source groups, people and tags. | `ParticipantsSidebar` |
| Settings | In-page category menu only within Settings; settings controls have real effects. | `SettingsShell` |
| People | Dedicated top-level directory, review queue, profile, voice references, notes and recent meetings. | People route/components |

## File map

- Modify: `frontend/src/app/ClientRootLayout.tsx` — remove the legacy visual sidebar from the root composition while retaining providers and global feedback.
- Modify: `frontend/src/components/AppShell/AppShell.tsx`, `SidebarNavigation.tsx`, `SidebarActions.tsx`, `SidebarMeetingList.tsx` — make the sole global rail and directory behavior accessible.
- Modify: `frontend/src/app/meeting-details/page-content.tsx` — pass real audio, peaks, participants and shared seek callbacks to the workspace; delete legacy split-layout wiring.
- Modify: `frontend/src/components/MeetingWorkspace/{MeetingWorkspace,MeetingHeader,MeetingTimeline,MeetingTabs,ParticipantsSidebar,useMeetingWorkspace,types}.tsx` — meeting shell and contextual panel.
- Modify or create: `frontend/src/components/MeetingDetails/{TranscriptPanel,TranscriptButtonGroup}.tsx` and a workspace transcript adapter — continuous transcript content, not a width-controlled pane.
- Modify: `frontend/src/components/settings/{SettingsShell,SettingsNavigation,SettingsRow,SettingsSection}.tsx` and the section files — Talat-style in-page settings hierarchy.
- Modify/create: the People route and `frontend/src/components/speakers/*` — directory, profile and voice-reference UI.
- Modify: `frontend/locales/*/{common,sidebar,home,meetingWorkspace,transcript,settings,speakers,recording,errors,summary}.json` — translation keys in every supported locale.
- Modify/create: `frontend/tests/{meeting-workspace,i18n}/**/*` and component tests adjacent to AppShell/Settings/People — behavior, accessibility and no-raw-key regression coverage.

## Task 1: Establish the visual and i18n baseline

**Files:** Modify `frontend/tests/i18n/check-i18n.test.ts`, `frontend/package.json`; create `frontend/tests/i18n/no-raw-translation-key.test.tsx` and `frontend/tests/layout/talat-layout-contract.test.tsx`.

- [ ] **Step 1: Capture the current desktop evidence before changing layout.**

  Start `pnpm run tauri:dev` from `frontend`, open a meeting with audio/transcript, the import route, Settings, People and Home. Capture one screenshot per route at desktop width and record any console/terminal errors. The baseline must explicitly include the visible raw keys `MEETINGWORKSPACE.MICROPHONE`, `MEETINGWORKSPACE.SYSTEMAUDIO`, and `MEETINGWORKSPACE.SPEAKERS` if they remain.

- [ ] **Step 2: Add a failing DOM regression test for raw locale keys.**

  ```tsx
  it('never renders a raw locale key in the meeting people panel', () => {
    render(<ParticipantsSidebar participants={fixtureParticipants} />);
    expect(screen.queryByText(/^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)+$/)).not.toBeInTheDocument();
  });
  ```

- [ ] **Step 3: Add a failing layout contract test.**

  ```tsx
  it('renders exactly one global navigation landmark', () => {
    render(<AppShell><div>Page</div></AppShell>);
    expect(screen.getAllByRole('navigation', { name: /main navigation/i })).toHaveLength(1);
  });
  ```

- [ ] **Step 4: Run the focused tests and confirm they fail for the current defects.**

  Run: `pnpm exec vitest run tests/i18n/no-raw-translation-key.test.tsx tests/layout/talat-layout-contract.test.tsx`

  Expected: failure until locale lookup and single-shell composition are implemented.

- [ ] **Step 5: Record the baseline commands in the implementation PR/notes, not in this plan.**

  Run: `pnpm run check:i18n && pnpm run lint`

  Expected: a recorded inventory of pre-existing lint violations, separate from violations introduced by this work.

## Task 2: Make AppShell the only global navigation shell

**Files:** Modify `frontend/src/app/ClientRootLayout.tsx`, `frontend/src/components/AppShell/{AppShell,SidebarNavigation,SidebarActions,SidebarMeetingList}.tsx`, `frontend/src/components/Sidebar/{index,SidebarProvider}.tsx`; test `frontend/src/components/AppShell/AppShell.a11y.test.tsx`.

- [ ] **Step 1: Write the failing root-composition test.**

  ```tsx
  it('does not mount the legacy Sidebar when AppShell owns navigation', () => {
    render(<ClientRootLayout><div>content</div></ClientRootLayout>);
    expect(screen.queryByTestId('legacy-sidebar')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeVisible();
  });
  ```

- [ ] **Step 2: Make provider state independent from legacy sidebar rendering.**

  Keep `SidebarProvider` only while its recording, meeting-directory or event state still has consumers. Export those state hooks explicitly; do not render `<Sidebar />` in `ClientRootLayout`. Render `AppShell` once around routed content at the root, and remove any page-level nested `AppShell` wrappers.

- [ ] **Step 3: Implement the rail semantics.**

  The rail must be approximately 60–76px wide, visually quiet, with grouped primary and utility actions. Each icon button needs a visible tooltip, `aria-label`, selected state through `aria-current="page"`, keyboard focus ring, and a minimum 40px target. Keep current routes; do not create duplicate navigation destinations.

- [ ] **Step 4: Preserve the meeting directory without making it a second sidebar.**

  Keep recent meetings in the Home view or in an explicit overlay/search command. It must not render as a permanent second rail beside the global rail.

- [ ] **Step 5: Run focused verification and commit implementation only.**

  Run: `pnpm exec vitest run src/components/AppShell/AppShell.a11y.test.tsx tests/layout/talat-layout-contract.test.tsx`

  Expected: one navigation landmark, keyboard-reachable rail controls, and no legacy visual sidebar.

  Commit: `git commit -m "refactor: make AppShell the sole global navigation"`

## Task 3: Localize visible UI and prevent raw translation-key regressions

**Files:** Modify all matching files under `frontend/locales/*/*.json`, `frontend/src/components/MeetingWorkspace/ParticipantsSidebar.tsx`, and every component found by `pnpm run check:i18n`; test `frontend/tests/i18n/{check-i18n,no-raw-translation-key}.test.tsx`.

- [ ] **Step 1: Create canonical English keys before translating other locales.**

  Add these entries under the existing `meetingWorkspace` namespace:

  ```json
  {
    "microphone": "Microphone",
    "systemAudio": "System audio",
    "people": "Who’s here",
    "tags": "Tags",
    "addPerson": "Add someone…",
    "unassigned": "Unassigned",
    "listening": "Listening…"
  }
  ```

  Use the repository’s existing locale merge/loading convention; do not introduce a new message loader.

- [ ] **Step 2: Add the equivalent keys to every supported locale.**

  Update `en-US`, `en-GB`, `pt-BR`, `ja-JP`, `ko-KR`, `zh-CN`, and `zh-TW`. Preserve valid UTF-8 without a BOM. A translation is acceptable only when its JSON parses and it has exactly the canonical key set.

- [ ] **Step 3: Replace direct raw strings and key text with `useTranslations`.**

  ```tsx
  const t = useTranslations('meetingWorkspace');
  <h2>{t('people')}</h2>
  <p>{t('microphone')}</p>
  ```

  Do not call `t()` with a string produced from API data. API-derived speaker names remain text; UI labels are fixed keys.

- [ ] **Step 4: Expand the automated catalog check.**

  Test both missing keys and unrendered key patterns. Keep the existing BOM check and add a fixture that fails when a component contains an uppercase dotted locale key.

- [ ] **Step 5: Verify and commit.**

  Run: `pnpm run check:i18n && pnpm exec vitest run tests/i18n`

  Expected: PASS with no BOMs, no missing locale keys, and no visible raw keys.

  Commit: `git commit -m "fix: localize workspace and settings labels"`

## Task 4: Rebuild the meeting composition around one content lane

**Files:** Modify `frontend/src/app/meeting-details/page-content.tsx`, `frontend/src/components/MeetingWorkspace/{MeetingWorkspace,MeetingHeader,MeetingTimeline,MeetingTabs,types,useMeetingWorkspace}.tsx`; test `frontend/tests/meeting-workspace/{meeting-workspace-integration,meeting-tabs,meeting-timeline}.test.tsx`.

- [ ] **Step 1: Write an integration test that fails when the workspace receives inert data.**

  ```tsx
  it('wires real audio and transcript-derived participants into the workspace', () => {
    render(<PageContent meeting={meetingWithAudioAndSegments} summaryData={null} />);
    expect(screen.getByLabelText(/audio timeline/i)).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/speaker 1/i)).toBeVisible();
  });
  ```

- [ ] **Step 2: Remove the legacy resize/split composition from `page-content.tsx`.**

  Mount only `MeetingWorkspace` for meeting details. Pass the actual audio path/player, decoded peaks, paginated transcript segments, diarization-derived participants, summary props and shared `seek(seconds)` callback. Do not pass `participants={[]}` or no-op audio callbacks.

- [ ] **Step 3: Keep a single header audio surface.**

  `MeetingHeader` shows date, title, play/pause, elapsed/duration and utility actions. `MeetingTimeline` draws the waveform and uses the same seek callback as transcript timestamps. Remove duplicate transport UI from nested content panes.

- [ ] **Step 4: Set the desktop grid explicitly.**

  ```tsx
  <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <section className="min-w-0" aria-label={t('meetingContent')}>...</section>
    <ParticipantsSidebar participants={participants} />
  </div>
  ```

  The `22rem` column is contextual information, not a `navigation` landmark. Below `lg`, expose it through an accessible sheet triggered from the meeting header.

- [ ] **Step 5: Verify and commit.**

  Run: `pnpm exec vitest run tests/meeting-workspace/meeting-workspace-integration.test.tsx tests/meeting-workspace/meeting-tabs.test.tsx tests/meeting-workspace/meeting-timeline.test.tsx`

  Expected: shared seek, non-empty participants, all four tabs and responsive panel behavior pass.

  Commit: `git commit -m "refactor: compose meeting details as one workspace"`

## Task 5: Replace the split transcript pane with continuous reading rows

**Files:** Modify `frontend/src/components/MeetingDetails/{TranscriptPanel,TranscriptButtonGroup}.tsx`, `frontend/src/components/MeetingWorkspace/MeetingWorkspace.tsx`; create `frontend/src/components/MeetingWorkspace/WorkspaceTranscript.tsx` if separation makes the old component unsafe to reuse; test `frontend/tests/meeting-workspace/workspace-transcript.test.tsx`.

- [ ] **Step 1: Write the failing full-width transcript test.**

  ```tsx
  it('renders each utterance in the meeting content lane instead of a width-controlled sidebar', () => {
    render(<WorkspaceTranscript segments={segments} onSeek={vi.fn()} />);
    expect(screen.getByTestId('workspace-transcript')).not.toHaveClass('md:w-1/4');
    expect(screen.getByText('Speaker 1')).toBeVisible();
    expect(screen.getByText('00:14')).toBeVisible();
    expect(screen.getByText(/first utterance/i)).toBeVisible();
  });
  ```

- [ ] **Step 2: Build the row contract.**

  Render each segment in a three-part grid: a compact speaker identity column, flexible text column and timestamp action. Do not create a standalone player, toolbar, scroll container or `width` property inside `TranscriptPanel`. Preserve virtualized rendering and timestamp seek.

  ```tsx
  <article className="grid grid-cols-[10rem_minmax(0,1fr)_auto] gap-4 py-5">
    <SpeakerIdentity segment={segment} />
    <p>{segment.text}</p>
    <button onClick={() => onSeek(segment.timestamp)}>{formatTime(segment.timestamp)}</button>
  </article>
  ```

- [ ] **Step 3: Keep transcript actions with the tab/header.**

  Move copy/export/open-recording actions to a compact toolbar aligned with `MeetingTabs`. The toolbar is rendered once per tab, not per virtualized viewport.

- [ ] **Step 4: Validate keyboard and long-content behavior.**

  Test that a timestamp is focusable, invokes the shared seek, and that long speaker names/text wrap without horizontal clipping. Test unassigned segments explicitly.

- [ ] **Step 5: Verify and commit.**

  Run: `pnpm exec vitest run tests/meeting-workspace/workspace-transcript.test.tsx tests/meeting-workspace/meeting-workspace-integration.test.tsx`

  Expected: PASS; no `md:w-1/4`, `lg:w-1/3`, or legacy resize divider remains in the workspace transcript path.

  Commit: `git commit -m "refactor: render meeting transcript as continuous content"`

## Task 6: Turn the right panel into Talat-style contextual People information

**Files:** Modify `frontend/src/components/MeetingWorkspace/ParticipantsSidebar.tsx` and `useMeetingWorkspace.ts`; test `frontend/tests/meeting-workspace/participants-sidebar.test.tsx`.

- [ ] **Step 1: Add failing group and landmark tests.**

  ```tsx
  it('is contextual content rather than a second navigation sidebar', () => {
    render(<ParticipantsSidebar participants={fixtureParticipants} />);
    expect(screen.queryByRole('navigation', { name: /people|participants/i })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /who.?s here/i })).toBeVisible();
  });
  ```

- [ ] **Step 2: Render source cards and tags.**

  Group microphone and system audio with labels, participant count, avatar/name, duration/share and assignment affordance. Include a compact Tags card and empty state. Preserve the actual diarization identities; show `Unassigned` instead of fabricating a person.

- [ ] **Step 3: Match visual hierarchy without duplicating Talat visuals.**

  Use `bg-[#fbfaf7]`, fine stone borders, 12px rounded cards and quiet section headers. Avoid the current large blue badges and full-height independent navigation treatment.

- [ ] **Step 4: Add responsive sheet coverage.**

  At widths below `lg`, the desktop `aside` is hidden, a “People” control opens a labeled dialog/sheet, and Escape restores focus to the trigger.

- [ ] **Step 5: Verify and commit.**

  Run: `pnpm exec vitest run tests/meeting-workspace/participants-sidebar.test.tsx && pnpm run check:i18n`

  Expected: PASS.

  Commit: `git commit -m "feat: refine contextual meeting people panel"`

## Task 7: Complete Settings without adding a global second sidebar

**Files:** Modify `frontend/src/components/settings/{SettingsShell,SettingsNavigation,SettingsRow,SettingsSection,GeneralSettings,AudioSettings,RecordingSettingsSection,TranscriptionSettingsSection,SpeakerSettingsSection}.tsx`; test `frontend/src/components/settings/SettingsShell.test.tsx`.

- [ ] **Step 1: Write failing Settings landmark tests.**

  ```tsx
  it('keeps the settings category list scoped to the settings page', () => {
    render(<SettingsShell />);
    expect(screen.getByRole('navigation', { name: /settings sections/i })).toBeVisible();
    expect(screen.queryAllByRole('navigation', { name: /main navigation/i })).toHaveLength(0);
  });
  ```

- [ ] **Step 2: Implement the in-page menu and content cards.**

  The Settings route uses a fixed-width category list inside page content, with General selected by default and hash/deep-link navigation. The global AppShell rail stays visible but does not duplicate settings categories.

- [ ] **Step 3: Verify every control has an actual effect.**

  Theme/UI scale/sidebar preference update the single preference source; audio and recording controls call supported Tauri commands; speaker controls link into People rather than duplicating People CRUD. Remove or visibly disable any control with no supported behavior, with an explanatory localized description.

- [ ] **Step 4: Verify and commit.**

  Run: `pnpm exec vitest run src/components/settings/SettingsShell.test.tsx && pnpm run check:i18n`

  Expected: PASS with keyboard navigation and stable deep links.

  Commit: `git commit -m "feat: align settings shell with app navigation"`

## Task 8: Finish People and voice-reference surfaces as top-level product flow

**Files:** Modify/create People route files under `frontend/src/app`, `frontend/src/components/speakers/*`, and supported Tauri speaker commands only where missing; add corresponding tests under `frontend/tests/speakers`.

- [ ] **Step 1: Write directory and profile tests.**

  ```tsx
  it('shows people as a dedicated route with review queue and speaker stats', () => {
    render(<PeoplePage people={fixturePeople} pendingReviews={2} />);
    expect(screen.getByRole('heading', { name: /speakers|people/i })).toBeVisible();
    expect(screen.getByText(/voice prints to review/i)).toBeVisible();
  });
  ```

- [ ] **Step 2: Implement the directory.**

  Add top-level People navigation, review banner, searchable/sortable people list and compact meeting/speech/last-seen metadata. Reuse the normalized people and voice-reference model; do not add a parallel `speaker_profiles` workflow.

- [ ] **Step 3: Implement the profile flow.**

  The profile provides editable emails/groups, playable voice-reference cards, notes and recent meetings. Deletion uses a confirmation dialog and calls the existing local Tauri persistence path.

- [ ] **Step 4: Integrate only entry points in Settings and workspace.**

  Settings Speaker section links to People and exposes recognition preferences. The workspace can assign an unassigned transcript speaker to an existing person; it does not duplicate enrollment/review screens.

- [ ] **Step 5: Verify and commit.**

  Run: `pnpm exec vitest run tests/speakers && cargo check --manifest-path frontend/src-tauri/Cargo.toml`

  Expected: PASS and Rust check exits 0.

  Commit: `git commit -m "feat: complete people and voice reference flow"`

## Task 9: Align Home and Import with the unified shell

**Files:** Modify `frontend/src/app/page.tsx`, Home components, import dialog/page, and relevant `frontend/locales/*/{home,sidebar,recording}.json`; add focused route tests.

- [ ] **Step 1: Write the failing empty-import-state test.**

  ```tsx
  it('centers the import empty state in the main content region', () => {
    render(<ImportPage />);
    expect(screen.getByRole('heading', { name: /import a recording/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /import file/i })).toBeVisible();
  });
  ```

- [ ] **Step 2: Keep Home and Import inside the single AppShell content region.**

  Remove route-local duplicate rails. Import uses a centered title, concise explanation and one primary file action. Home uses the shared meeting directory and empty/recording states without recreating player or directory state.

- [ ] **Step 3: Verify and commit.**

  Run: `pnpm exec vitest run tests --testNamePattern="import|home" && pnpm run check:i18n`

  Expected: PASS.

  Commit: `git commit -m "refactor: align home and import with app shell"`

## Task 10: Final visual, accessibility and desktop validation

**Files:** Test updates only when failures expose a missing contract; no speculative visual-only source churn.

- [ ] **Step 1: Run all automated gates.**

  Run: `pnpm exec vitest run`

  Run: `pnpm run check:i18n`

  Run: `pnpm run lint`

  Run: `pnpm run build`

  Run: `cargo test --manifest-path frontend/src-tauri/Cargo.toml`

  Expected: all pass. Any pre-existing lint issue must be either fixed in this change or reported separately with file/line evidence; do not call the task complete with new lint failures.

- [ ] **Step 2: Exercise the desktop app through computer control.**

  Start: `pnpm run tauri:dev` from `frontend`.

  Verify Home, Import, a populated meeting, a no-audio meeting, a no-transcript meeting, Settings, People and a narrow window. Confirm exactly one global rail, one meeting contextual panel on desktop, the mobile People sheet, active keyboard focus, Escape behavior, waveform/timestamp shared seek and no raw translation keys.

- [ ] **Step 3: Compare screenshots against the supplied Talat references.**

  Check information hierarchy, spacing, rail density, header compactness, transcript continuity, right-panel role, Settings internal menu, People list/profile and centered Import empty state. Preserve Meetily name, assets and terminology.

- [ ] **Step 4: Run diff hygiene and make only validated implementation commits.**

  Run: `git diff --check`

  Expected: exit code 0. Do not stage or commit `docs/superpowers/plans/*.md`.

## Coverage self-review

- One global sidebar: Tasks 1–2 and final desktop validation.
- Contextual meeting People panel: Tasks 4 and 6.
- Split transcript removal: Task 5.
- Audio/header duplication: Task 4.
- Settings internal navigation: Task 7.
- People directory/profile/voice references: Task 8.
- Import and Home visual parity: Task 9.
- Visible translations, BOMs, catalog completeness and raw-key prevention: Tasks 1 and 3.
- Accessibility, responsive behavior and real Tauri desktop validation: Tasks 2, 4–7 and 10.
