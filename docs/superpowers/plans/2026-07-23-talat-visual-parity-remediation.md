# Talat Visual Parity Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop Meetily experience visually and functionally comparable to the supplied Talat references, while preserving local-first Tauri behavior and the already-working meeting workspace.

**Architecture:** Treat the existing `AppShell` as the only application shell, keep `MeetingWorkspace` as a contextual composition, and build visual parity through shared tokens before changing individual screens. Correct the translation verifier before styling screens so raw keys cannot reappear, then implement each route from the same primitives and verify it in the Tauri desktop window.

**Tech Stack:** Tauri 2, Next.js 14, React 18, TypeScript, Tailwind CSS, next-intl, Vitest, React Testing Library, Rust, SQLite.

---

## Evidence and scope

Desktop inspection on 2026-07-23 established the following current facts:

- `http://localhost:3118/` must be served by `pnpm run dev`; a stale `next start` process returned a 404 in the Tauri window.
- The application has one global icon rail, which is correct structurally, but it exposes only Home, Meetings, People and Settings plus a blue New recording button.
- `People` visibly renders `speakers.recognition.mode_Suggest_desc`; `pnpm run check:i18n` currently passes because it validates locale catalog shape, not rendered lookups.
- `Meetings` returns to the Home surface instead of providing an explicit meeting directory; Import has a route but no discoverable rail action.
- The current workspace has a continuous main transcript and a contextual right panel, but its type scale, control placement, source provenance and panel richness remain below the Talat reference.
- The first distinct transcript speaker is still heuristically labeled microphone. A true microphone/system-audio division requires provenance in the Rust-to-TypeScript transcript contract.

Do not modify `backend/`; it is archived. Do not copy Talat assets, text or branding. Use the supplied Talat screenshots only for layout, hierarchy and interaction reference. Do not commit this plan.

## Visual acceptance contract

| Surface | Acceptance criteria |
| --- | --- |
| Application frame | Warm ivory background, quiet stone borders, restrained shadows, display-serif page headings, no horizontal document overflow at 1100px desktop width. |
| Global rail | Single 60-76px icon-first rail with grouped actions, tooltips, correct active route, visible Import route and accessible targets. |
| Home / meetings | Content uses the available desktop width; Home is not a narrow dashboard column; Meeting list is an explicit destination and meeting rows open with one activation. |
| Import | Centered empty state with display heading, short description and outlined file action; reachable from the rail. |
| Workspace | Date/title/header, waveform, four tabs and transcript are one reading composition; right panel is contextual People/Tags, not navigation; transcript segments have identity, readable text and right-aligned timestamp. |
| People | One page title, review banner, list-first directory, profile entry point and no raw i18n key. Recognition preferences are reachable without displacing the directory. |
| Settings | Settings-only section menu, serif content heading, fixed card width, no document-level horizontal scrollbar, and every enabled control changes persisted state. |

## File map

- Modify: `frontend/src/app/globals.css` — Talat-aligned semantic colors, type families, radii, shadows and overflow rules.
- Modify: `frontend/src/components/AppShell/{AppShell,SidebarNavigation,SidebarActions}.tsx` — complete the compact grouped rail and route semantics.
- Modify: `frontend/src/app/_components/{HomeDashboard,HomeQuickStart,HomeActivitySummary,RecentMeetings}.tsx` — full-width Home composition and direct meeting entry.
- Modify: `frontend/src/app/{page.tsx,import/page.tsx,people/page.tsx,settings/page.tsx}` — route-level visual composition only.
- Modify: `frontend/src/components/MeetingWorkspace/{MeetingWorkspace,MeetingHeader,MeetingTimeline,MeetingTabs,ParticipantsSidebar,useMeetingWorkspace,types}.tsx` and `frontend/src/components/VirtualizedTranscriptView.tsx` — workspace hierarchy, transcript reading rows and contextual panel.
- Modify: `frontend/src/components/speakers/{SpeakerDirectory,SpeakerRecognitionSettings,SpeakerDetailPanel}.tsx` — list-first People and profile flow.
- Modify: `frontend/src/components/settings/{SettingsShell,SettingsNavigation,SettingsSection,SettingsRow}.tsx` — internal Settings hierarchy and overflow-safe layout.
- Modify: `frontend/scripts/check-i18n.ts`, locale files under `frontend/locales/*/`, and `frontend/tests/i18n/*` — rendered lookup verification.
- Modify only if Task 5 proves it necessary: `frontend/src-tauri/src/api/api.rs`, `frontend/src-tauri/src/audio/recording_commands.rs`, `frontend/src-tauri/src/database/repositories/transcript.rs`, and `frontend/src/types/index.ts` — transcript source provenance.

### Task 1: Make the translation gate catch the visible People defect

**Files:** Modify `frontend/src/components/speakers/SpeakerRecognitionSettings.tsx`, `frontend/scripts/check-i18n.ts`, locale files containing the `speakers.recognition` namespace; modify/create `frontend/tests/i18n/no-raw-translation-key.test.tsx` and `frontend/tests/i18n/rendered-translation-coverage.test.tsx`.

- [ ] **Step 1: Write a failing rendered-lookup test for the selected recognition mode.**

  ```tsx
  it('renders the selected recognition description instead of its locale key', async () => {
    render(<SpeakerRecognitionSettings />);
    expect(await screen.findByText(/review suggestions before assigning/i)).toBeVisible();
    expect(screen.queryByText('speakers.recognition.mode_Suggest_desc')).not.toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Correct the locale key casing and catalog entries.**

  Use one canonical lower-case key in every locale:

  ```tsx
  <p className="text-xs text-[rgb(var(--app-muted-fg))]">
    {t(`mode_${mode.toLowerCase()}_desc`)}
  </p>
  ```

  The locale catalog must provide `mode_off_desc`, `mode_suggest_desc` and `mode_automatic_desc` in each supported locale. Do not expose enum spelling directly to `t()`.

- [ ] **Step 3: Extend `check-i18n` with static lookup validation.**

  Parse TypeScript/TSX source with the existing project tooling, collect literal `t('a.b')` calls and template literals whose substitutions are constrained enum values, and compare them with the flattened default locale keys. Fail with `ERROR: missing message key "speakers.recognition.mode_suggest_desc"` when absent. Do not scan API-derived strings.

- [ ] **Step 4: Verify the gate and commit only source/test changes.**

  Run: `pnpm exec vitest run tests/i18n/no-raw-translation-key.test.tsx tests/i18n/rendered-translation-coverage.test.tsx && pnpm run check:i18n`

  Expected: PASS; the literal key never appears in the rendered People page.

  Commit: `git commit -m "fix: verify rendered i18n lookups"`

### Task 2: Establish shared Talat-aligned visual primitives

**Files:** Modify `frontend/src/app/globals.css`; create `frontend/tests/layout/visual-token-contract.test.tsx`.

- [ ] **Step 1: Write a token contract test.**

  ```tsx
  it('uses the warm desktop surface and display heading utility', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toContain('--app-bg: 250 248 243');
    expect(css).toContain('--app-display-font:');
    expect(css).toContain('.app-display-heading');
  });
  ```

- [ ] **Step 2: Replace the cold default tokens with one warm semantic set.**

  Define a single source of truth such as:

  ```css
  :root {
    --app-bg: 250 248 243;
    --app-surface: 255 254 251;
    --app-muted: 242 239 233;
    --app-border: 226 221 212;
    --app-fg: 35 29 24;
    --app-muted-fg: 119 109 98;
    --app-accent: 187 90 35;
    --app-radius-sm: 8px;
    --app-radius-md: 14px;
    --app-shadow-panel: none;
    --app-display-font: Georgia, "Times New Roman", serif;
  }

  .app-display-heading { font-family: var(--app-display-font); font-weight: 400; }
  ```

  Retain a coherent dark theme and do not add page-specific color literals when an existing semantic token serves the purpose.

- [ ] **Step 3: Remove document-level horizontal overflow.**

  Keep vertical scrolling owned by the current page/main region, but ensure `html`, `body`, root app containers and Settings content have `min-width: 0`, `max-width: 100%` and no horizontal scrollbar at 1100px.

- [ ] **Step 4: Verify.**

  Run: `pnpm exec vitest run tests/layout/visual-token-contract.test.tsx && pnpm run build`

  Expected: PASS with no new hydration, CSS or overflow warnings.

  Commit: `git commit -m "feat: add warm desktop visual primitives"`

### Task 3: Complete the global rail, Home, Meetings and Import routes

**Files:** Modify `frontend/src/components/AppShell/{SidebarNavigation,SidebarActions,AppShell}.tsx`, `frontend/src/app/_components/{HomeDashboard,HomeQuickStart,HomeActivitySummary,RecentMeetings}.tsx`, `frontend/src/app/page.tsx`, `frontend/src/app/import/page.tsx`; create/modify focused tests under `frontend/tests/home` and `frontend/tests/layout`.

- [ ] **Step 1: Write route-contract tests.**

  ```tsx
  it('exposes Home, Meetings, Import, People and Settings from one main rail', () => {
    render(<AppShell><div>content</div></AppShell>);
    expect(screen.getByRole('link', { name: /import/i })).toHaveAttribute('href', '/import');
    expect(screen.getByRole('link', { name: /meetings/i })).not.toHaveAttribute('href', '/');
  });

  it('opens a recent meeting with one activation', async () => {
    render(<RecentMeetings meetings={[fixtureMeeting]} />);
    await user.click(screen.getByRole('button', { name: /audio/i }));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('meeting-details'));
  });
  ```

- [ ] **Step 2: Define real route ownership.**

  Keep `/` for Home, `/import` for Import, `/people` for People and `/settings` for Settings. Add a dedicated `/meetings` page that reuses `useMeetingDirectory` and `RecentMeetings` row data; do not implement Meetings as a hash that renders Home. Update `NAV_ITEMS` so `exact: true` applies only to Home.

- [ ] **Step 3: Recompose Home as a wide meeting-focused surface.**

  Replace `max-w-4xl` with a responsive content width such as `max-w-6xl`, use a two-column desktop grid for quick start and recent activity, remove metric-card emphasis when it leaves unused space, and render meeting rows as low-chrome bordered rows. Localize the hardcoded Home loading/error/subtitle strings before changing layout.

- [ ] **Step 4: Make Import match the reference contract.**

  Use `app-display-heading`, centered content, an outlined button and a visible Import rail action:

  ```tsx
  <button className="inline-flex items-center gap-2 rounded-[var(--app-radius-sm)] border border-[rgb(var(--app-border))] bg-transparent px-4 py-2 text-sm text-[rgb(var(--app-fg))] hover:bg-[rgb(var(--app-muted))]">
    <Upload className="h-4 w-4" />
    {t('importFile')}
  </button>
  ```

- [ ] **Step 5: Verify desktop behavior.**

  Run: `pnpm exec vitest run tests/home tests/layout && pnpm run check:i18n`

  Expected: all routes are reachable with one rail, Import opens its dialog only after the explicit file action, and a recent meeting opens with one click.

  Commit: `git commit -m "feat: complete desktop navigation and meeting directory"`

### Task 4: Refine the Meeting Workspace reading composition

**Files:** Modify `frontend/src/components/MeetingWorkspace/{MeetingWorkspace,MeetingHeader,MeetingTimeline,MeetingTabs,ParticipantsSidebar}.tsx`, `frontend/src/components/VirtualizedTranscriptView.tsx`; modify tests under `frontend/tests/meeting-workspace`.

- [ ] **Step 1: Write visual-semantic workspace tests.**

  ```tsx
  it('renders a reading row with speaker, text and a right-side timestamp action', () => {
    render(<VirtualizedTranscriptView {...fixtureProps} />);
    expect(screen.getByRole('button', { name: /jump to 00:14/i })).toBeVisible();
    expect(screen.getByText('Speaker 1')).toBeVisible();
    expect(screen.getByText(/Serviços. Eu ajustei/i)).toBeVisible();
  });

  it('keeps People contextual rather than a navigation landmark', () => {
    render(<ParticipantsSidebar participants={fixtureParticipants} />);
    expect(screen.getByRole('complementary', { name: /who.?s here/i })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: /people/i })).not.toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Apply the shared visual hierarchy.**

  `MeetingHeader` uses the display heading for the title, retains compact metadata, and removes hard-coded magenta progress styling. `MeetingTabs` places compact utility actions at the tab/header level. `MeetingWorkspace` retains the desktop `minmax(0, 1fr) 22rem` grid but uses warm surface colors consistently.

- [ ] **Step 3: Reformat transcript rows without changing virtualization or seek behavior.**

  Use a responsive row grid with identity left, readable text center and time action right. At desktop width apply `font-family: var(--app-display-font)` only to transcript body text; retain sans-serif metadata. Keep text wrapping and long speaker-name handling with `min-w-0`.

- [ ] **Step 4: Complete contextual People and Tags.**

  Add counts, avatar/name, duration/share, assignment affordance and intentional empty states to `SourceCard`. Keep the existing responsive sheet below `lg`. Do not fabricate a person when diarization is unassigned.

- [ ] **Step 5: Verify.**

  Run: `pnpm exec vitest run tests/meeting-workspace && pnpm run check:i18n`

  Expected: transcript seeks still work, tabs remain accessible, desktop has one contextual panel, and mobile sheet behavior remains covered.

  Commit: `git commit -m "feat: refine workspace reading and people hierarchy"`

### Task 5: Replace heuristic audio-source classification with provenance

**Files:** Modify only after a failing contract test: `frontend/src-tauri/src/api/api.rs`, `frontend/src-tauri/src/audio/recording_commands.rs`, `frontend/src-tauri/src/database/repositories/transcript.rs`, `frontend/src/types/index.ts`, `frontend/src/components/MeetingWorkspace/useMeetingWorkspace.ts`; add targeted Rust and TypeScript tests.

- [ ] **Step 1: Write the contract at both boundaries.**

  ```rust
  #[test]
  fn persisted_transcript_segment_retains_audio_source() {
      let segment = TranscriptSegment { source: Some(AudioSource::Microphone), ..fixture_segment() };
      assert_eq!(round_trip(segment).source, Some(AudioSource::Microphone));
  }
  ```

  ```tsx
  it('groups people from segment source rather than speaker order', () => {
    expect(toParticipants([systemSegment, microphoneSegment])).toEqual([
      expect.objectContaining({ source: 'system' }),
      expect.objectContaining({ source: 'microphone' }),
    ]);
  });
  ```

- [ ] **Step 2: Add an explicit optional source field to the persisted/event transcript contract.**

  Use a Rust enum serialized as `"microphone" | "system"`; populate it where microphone and system chunks enter transcription. Add a backward-compatible database migration/default of `NULL` for historic rows.

- [ ] **Step 3: Preserve unknown rather than guessing.**

  Map `null` historic data to `unknown` in TypeScript. Render an `Unassigned / unknown source` state in the sidebar. Delete the “first distinct speaker is microphone” rule only after all live events and persisted reads provide source or intentionally map to unknown.

- [ ] **Step 4: Verify.**

  Run: `cargo test --manifest-path frontend/src-tauri/Cargo.toml transcript && cargo check --manifest-path frontend/src-tauri/Cargo.toml && pnpm exec vitest run tests/meeting-workspace`

  Expected: source survives recording event, persistence and page reload; speaker ordering has no effect on grouping.

  Commit: `git commit -m "feat: persist transcript audio source"`

### Task 6: Make People list-first and profile-oriented

**Files:** Modify `frontend/src/app/people/page.tsx`, `frontend/src/components/speakers/{SpeakerDirectory,SpeakerRecognitionSettings,SpeakerDetailPanel}.tsx`; modify tests under `frontend/tests/speakers`.

- [ ] **Step 1: Write page-composition tests.**

  ```tsx
  it('renders one People heading, a review queue and a searchable directory', async () => {
    render(<PeoplePage />);
    expect(screen.getAllByRole('heading', { name: /^people$/i })).toHaveLength(1);
    expect(await screen.findByPlaceholderText(/search people/i)).toBeVisible();
  });
  ```

- [ ] **Step 2: Separate directory from recognition preferences.**

  `PeoplePage` owns the page heading, review banner and list-first directory. Move `SpeakerRecognitionSettings` behind a Settings Speakers section or a compact secondary disclosure; it must not occupy the primary People viewport before the directory.

- [ ] **Step 3: Add profile hierarchy using existing speaker data.**

  The selected profile shows avatar, title, meeting/speech/last-seen metadata, voice-reference playback cards, notes and recent meetings. Reuse existing speaker APIs and Tauri commands; do not create a parallel speaker data model.

- [ ] **Step 4: Verify.**

  Run: `pnpm exec vitest run tests/speakers tests/i18n && pnpm run check:i18n`

  Expected: no duplicated heading, no raw key, empty and populated directory states are both intentional.

  Commit: `git commit -m "feat: prioritize people directory and profiles"`

### Task 7: Finish the Settings desktop surface

**Files:** Modify `frontend/src/components/settings/{SettingsShell,SettingsNavigation,SettingsSection,SettingsRow}.tsx`, specific section components referenced by `frontend/src/app/settings/page.tsx`; modify `frontend/src/components/settings/SettingsShell.test.tsx`.

- [ ] **Step 1: Add an overflow and hierarchy test.**

  ```tsx
  it('keeps settings content within the desktop viewport', () => {
    render(<SettingsShell>{() => <GeneralSettings />}</SettingsShell>);
    expect(screen.getByRole('main')).toHaveClass('min-w-0');
    expect(screen.getByRole('heading', { name: /general settings/i })).toHaveClass('app-display-heading');
  });
  ```

- [ ] **Step 2: Remove the route header duplication and constrain the internal grid.**

  Keep the global rail outside Settings. Within Settings, render a narrow section menu and a `min-w-0 max-w-3xl` content column; eliminate the global horizontal scrollbar. Use the display heading only for the content title, then quiet bordered rows/cards for controls.

- [ ] **Step 3: Keep behavior honest.**

  For each control, verify a persisted preference or a supported Tauri command. Hide or disable unsupported controls with a localized reason; do not render a functional-looking switch that only changes local component state.

- [ ] **Step 4: Verify.**

  Run: `pnpm exec vitest run src/components/settings/SettingsShell.test.tsx && pnpm run build`

  Expected: keyboard section selection, deep-link hash, persisted setting behavior and no horizontal overflow regression.

  Commit: `git commit -m "feat: complete settings desktop hierarchy"`

### Task 8: Validate the completed desktop experience

**Files:** Add tests only where a failure reveals a missing contract. Do not commit this plan.

- [ ] **Step 1: Run the full automated gates.**

  Run: `pnpm exec vitest run && pnpm run check:i18n && pnpm run lint && pnpm run build`

  Expected: zero test failures, no lint errors, no missing keys and successful production build. Capture warnings separately; do not classify a raw key or runtime 404 as a passing gate.

- [ ] **Step 2: Run desktop validation with the correct server mode.**

  Run: `pnpm run tauri:dev`

  Verify that `http://localhost:3118/` returns 200 before interpreting any Tauri 404 as a UI defect. Navigate Home, Meetings, Import, People, Settings and a populated meeting with one activation each. Do not start a real recording unless a microphone is available and the user explicitly requests it.

- [ ] **Step 3: Capture comparison evidence at 1100px desktop width.**

  Capture Home, Import, People, Settings and Transcript. Check the visual acceptance contract above, keyboard focus, rail tooltips, transcript timestamp seek, responsive People sheet, absence of raw keys and absence of horizontal scrollbar.

- [ ] **Step 4: Run diff hygiene and make validated implementation commits only.**

  Run: `git diff --check`

  Expected: exit code 0. Leave `docs/superpowers/plans/2026-07-23-talat-visual-parity-remediation.md` uncommitted.

## Coverage self-review

- Visible raw translations and insufficient i18n gate: Task 1.
- Warm visual system, serif hierarchy and overflow: Task 2.
- Missing/ambiguous Meetings and Import navigation plus narrow Home: Task 3.
- Workspace/header/transcript/right-panel visual parity: Task 4.
- Correct microphone/system-audio semantics: Task 5.
- People directory and profiles: Task 6.
- Settings hierarchy and overflow: Task 7.
- Real desktop behavior and final evidence: Task 8.
