# Talat-Style Sidebar and Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Refactor Meetily’s global sidebar and idle home screen into a calm, meeting-first workspace styled and navigated like Talat, while preserving native recording, recovery, import, search, and meeting-detail flows.

**Architecture:** Make the Tauri core the single source of recent-meeting metadata, then expose it through a focused frontend meeting-directory hook. Replace the current monolithic \`Sidebar/index.tsx\` with a shell, navigation rail, meeting list, search palette, and action area. The root page will render a Talat-like home dashboard while idle, then switch to the existing live transcript workspace once a recording starts; recording state and commands remain unchanged.

**Tech Stack:** Tauri 2, Rust, SQLx/SQLite, Next.js 14, React 18, TypeScript, Tailwind, Radix UI, Framer Motion, \`@tanstack/react-virtual\`, next-intl, Vitest.

## Global Constraints

- Implement only in \`frontend/\` and \`frontend/src-tauri/\`; the Python/FastAPI \`backend/\` remains archived and unsupported.
- The sidebar must obtain meetings through Tauri commands, not \`api_get_meetings\`, \`serverAddress\`, or the archived backend.
- Preserve the current recording start/stop command paths, transcript recovery dialog, import dialog, meeting deletion and rename behavior.
- Keep the user’s prior exclusions out of navigation: no Calendar, Dictation, automatic meeting start, webhooks, or MCP.
- Preserve all keyboard and assistive-technology access: every icon-only control needs an accessible name and visible focus state.
- Persist only sidebar presentation state (expanded/collapsed and active list groups) in the Tauri Store; do not persist meeting content or sensitive search queries.
- A narrow/collapsed sidebar must keep the same routes and actions available by tooltip and keyboard.
- Do not commit this plan. Implementation commits must contain only validated source and test files.

---

## Talat-inspired target behavior

- A slim, stable left rail carries the product mark, Home, Meetings, People, Settings, a primary “New recording” action, Import, and a collapse control.
- The expanded rail includes a local meeting search and a chronological meeting list grouped as Today, Previous 7 days, and Older, with a compact active-recording item at the top when applicable.
- The idle home page is a dashboard: a clear title, a recording quick-start panel with audio readiness, recent meetings, processing/recovery attention, and small local-only activity summaries. It does not show an empty transcript canvas.
- Starting a recording preserves the current live workspace: transcript panel, permission/status overlays, and the existing bottom recording controller.
- The layout is not a clone of Talat’s branding or assets; it matches its information hierarchy, density, visual rhythm, and interaction patterns using Meetily’s logo, colors, labels, and functions.

## File map

| File | Responsibility |
| --- | --- |
| \`frontend/src-tauri/src/database/repositories/meeting.rs\` | Query lightweight meeting-directory rows from SQLite in recency order. |
| \`frontend/src-tauri/src/database/commands.rs\` | Expose native \`list_home_meetings\` and meeting-directory DTOs. |
| \`frontend/src-tauri/src/lib.rs\` | Register the native meeting list command. |
| \`frontend/src/lib/meeting-directory.ts\` | Types, date grouping, local filtering, and command wrapper. |
| \`frontend/src/hooks/useMeetingDirectory.ts\` | Load/refetch meeting rows, react to recording/recovery updates, and expose load state. |
| \`frontend/src/components/AppShell/AppShell.tsx\` | Desktop shell framing sidebar and routed main content. |
| \`frontend/src/components/AppShell/SidebarNavigation.tsx\` | Stable primary nav, active-route logic, tooltips, collapsed layout. |
| \`frontend/src/components/AppShell/SidebarMeetingList.tsx\` | Virtualized, date-grouped recent meetings with inline actions. |
| \`frontend/src/components/AppShell/SidebarSearchDialog.tsx\` | Local transcript/meeting search dialog; owns debounced query only while open. |
| \`frontend/src/components/AppShell/SidebarActions.tsx\` | New recording, import, settings and collapse controls. |
| \`frontend/src/components/Sidebar/SidebarProvider.tsx\` | Reduced presentation/routing state, recording bridge, meeting refresh API and persisted collapse state. |
| \`frontend/src/components/Sidebar/index.tsx\` | Compatibility wrapper that renders the new AppShell sidebar and no longer owns data/modals. |
| \`frontend/src/app/page.tsx\` | Select idle dashboard or live recording workspace without changing recording orchestration. |
| \`frontend/src/app/_components/HomeDashboard.tsx\` | Idle home composition. |
| \`frontend/src/app/_components/HomeQuickStart.tsx\` | Quick recording card, selected devices and permission/readiness state. |
| \`frontend/src/app/_components/RecentMeetings.tsx\` | Recent-meeting cards and empty state. |
| \`frontend/src/app/_components/HomeAttentionList.tsx\` | Recoverable/processing items and entry points into existing recovery actions. |
| \`frontend/src/app/_components/HomeActivitySummary.tsx\` | Counts derived only from local directory rows. |
| \`frontend/messages/*.json\` | Portuguese and existing-language strings for navigation, dashboard and empty states. |

## Shared interfaces

\`\`\`rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingDirectoryItem {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub duration_seconds: Option<i64>,
    pub transcript_segment_count: i64,
    pub has_summary: bool,
    pub recording_state: String,
}

#[tauri::command]
pub async fn list_home_meetings(
    app: tauri::AppHandle,
    limit: Option<u32>,
) -> Result<Vec<MeetingDirectoryItem>, String>;
\`\`\`

\`\`\`ts
export type MeetingGroup = 'today' | 'last7Days' | 'older';

export interface MeetingDirectoryItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string | null;
  durationSeconds: number | null;
  transcriptSegmentCount: number;
  hasSummary: boolean;
  recordingState: 'recording' | 'processing' | 'ready' | 'failed' | 'unknown';
}

export interface MeetingDirectoryState {
  meetings: MeetingDirectoryItem[];
  isLoading: boolean;
  error: string | null;
  refetch(): Promise<void>;
}
\`\`\`

### Task 1: Provide a native, dashboard-ready meeting directory

**Files:**
- Modify: \`frontend/src-tauri/src/database/repositories/meeting.rs\`
- Modify: \`frontend/src-tauri/src/database/commands.rs\`
- Modify: \`frontend/src-tauri/src/lib.rs\`
- Test: \`frontend/src-tauri/src/database/repositories/meeting.rs\`

**Consumes:** existing meetings, transcripts and summary persistence in the SQLite database.

**Produces:** \`MeetingsRepository::list_directory_items\` and the \`list_home_meetings\` Tauri command.

- [ ] **Step 1: Write failing repository tests for ordering, summary state and empty meetings.**

\`\`\`rust
#[tokio::test]
async fn list_directory_items_returns_newest_meetings_with_summary_flags() {
    let pool = test_pool().await;
    insert_meeting(&pool, "old", "Old call", "2026-07-01T09:00:00Z").await;
    insert_meeting(&pool, "new", "New call", "2026-07-22T09:00:00Z").await;
    insert_completed_summary(&pool, "new").await;

    let rows = MeetingsRepository::list_directory_items(&pool, 20).await.unwrap();

    assert_eq!(rows.iter().map(|row| row.id.as_str()).collect::<Vec<_>>(), vec!["new", "old"]);
    assert!(rows[0].has_summary);
    assert_eq!(rows[1].transcript_segment_count, 0);
}

#[tokio::test]
async fn list_directory_items_caps_limit_without_dropping_recording_state() {
    let pool = test_pool().await;
    insert_meeting_with_state(&pool, "active", "Current", "recording").await;

    let rows = MeetingsRepository::list_directory_items(&pool, 1).await.unwrap();

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].recording_state, "recording");
}
\`\`\`

- [ ] **Step 2: Run the tests and confirm the directory API does not exist.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
cargo test --manifest-path src-tauri/Cargo.toml list_directory_items -- --nocapture
\`\`\`

Expected: FAIL because \`list_directory_items\` is undefined.

- [ ] **Step 3: Implement a single bounded query and Tauri command.**

Implement \`list_directory_items(pool, limit)\` using one SQL query with bound limit, ordered by \`COALESCE(updated_at, created_at) DESC\`. It must return only the listed DTO fields, calculate transcript count with a grouped subquery, derive \`has_summary\` from completed summaries, and map null/unrecognized state to \`unknown\`. Clamp \`limit\` to 1–200 and have the command use 50 when the frontend omits it.

Register:

\`\`\`rust
#[tauri::command]
pub async fn list_home_meetings(
    app: AppHandle,
    limit: Option<u32>,
) -> Result<Vec<MeetingDirectoryItem>, String> {
    let limit = limit.unwrap_or(50).clamp(1, 200);
    let pool = app.state::<AppState>().inner().db_manager.pool();
    MeetingsRepository::list_directory_items(&pool, limit)
        .await
        .map_err(|error| format!("Unable to list local meetings: {error}"))
}
\`\`\`

- [ ] **Step 4: Run tests and core compilation.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
cargo test --manifest-path src-tauri/Cargo.toml list_directory_items -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml
\`\`\`

Expected: PASS.

- [ ] **Step 5: Commit only validated implementation files.**

\`\`\`powershell
git add frontend/src-tauri/src/database/repositories/meeting.rs frontend/src-tauri/src/database/commands.rs frontend/src-tauri/src/lib.rs
git commit -m "feat: expose local meeting directory"
\`\`\`

### Task 2: Replace the legacy sidebar state with focused, native state

**Files:**
- Create: \`frontend/src/lib/meeting-directory.ts\`
- Create: \`frontend/src/lib/meeting-directory.test.ts\`
- Create: \`frontend/src/hooks/useMeetingDirectory.ts\`
- Create: \`frontend/src/hooks/useMeetingDirectory.test.tsx\`
- Modify: \`frontend/src/components/Sidebar/SidebarProvider.tsx\`

**Consumes:** \`list_home_meetings\`, current \`RecordingStateContext\`, existing \`useImportDialog\`, and existing Tauri transcript search command.

**Produces:** \`useMeetingDirectory\`, \`groupMeetingsByDate\`, and a reduced \`SidebarContext\` with \`isCollapsed\`, \`toggleCollapse\`, \`setIsMeetingActive\`, \`startRecordingFromNavigation\`, and \`refetchMeetings\`.

- [ ] **Step 1: Write failing pure and hook tests.**

\`\`\`ts
it('groups meetings into today, last seven days and older in local time', () => {
  const groups = groupMeetingsByDate([
    item('today', '2026-07-22T12:00:00-04:00'),
    item('week', '2026-07-18T12:00:00-04:00'),
    item('old', '2026-06-01T12:00:00-04:00'),
  ], new Date('2026-07-22T16:00:00-04:00'));

  expect(groups.today.map(({ id }) => id)).toEqual(['today']);
  expect(groups.last7Days.map(({ id }) => id)).toEqual(['week']);
  expect(groups.older.map(({ id }) => id)).toEqual(['old']);
});

it('loads meetings from the native Tauri command and exposes refetch', async () => {
  mockInvoke.mockResolvedValue([item('m1', '2026-07-22T12:00:00-04:00')]);
  const { result } = renderHook(() => useMeetingDirectory());

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(mockInvoke).toHaveBeenCalledWith('list_home_meetings', { limit: 50 });
  expect(result.current.meetings[0].id).toBe('m1');
});
\`\`\`

- [ ] **Step 2: Run tests and confirm the modules are missing.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/lib/meeting-directory.test.ts src/hooks/useMeetingDirectory.test.tsx
\`\`\`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement the directory wrapper and simplify SidebarProvider.**

1. Implement \`listHomeMeetings(): Promise<MeetingDirectoryItem[]>\` as \`invoke('list_home_meetings', { limit: 50 })\`.
2. Implement \`groupMeetingsByDate(items, now)\` with deterministic local calendar boundaries; do not group by UTC string comparison.
3. \`useMeetingDirectory\` must load once, expose a retryable error state, cancel stale requests on unmount, and refetch after recording completion/recovery success through explicit calls from existing hooks.
4. Delete \`serverAddress\`, \`transcriptServerAddress\`, \`api_get_meetings\` loading and model-config concerns from \`SidebarProvider\`. Keep summary polling only if active callers still use it; otherwise extract it to a dedicated \`useSummaryPolling\` hook before removing it.
5. Persist only \`sidebar_collapsed\` in \`preferences.json\`; default expanded on desktop. Read before first rendered layout and retain the user’s choice across restart.
6. Preserve the existing navigation-start behavior without auto-meeting detection: \`startRecordingFromNavigation\` navigates to \`/\`, sets the existing one-time \`sessionStorage.autoStartRecording = 'true'\`, and the current Home hook performs the actual start.

- [ ] **Step 4: Run test, i18n and lint gates.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/lib/meeting-directory.test.ts src/hooks/useMeetingDirectory.test.tsx
pnpm run test:i18n
pnpm run lint
\`\`\`

Expected: PASS.

- [ ] **Step 5: Commit only validated implementation files.**

\`\`\`powershell
git add frontend/src/lib/meeting-directory.ts frontend/src/hooks/useMeetingDirectory.ts frontend/src/components/Sidebar/SidebarProvider.tsx frontend/src/lib/meeting-directory.test.ts frontend/src/hooks/useMeetingDirectory.test.tsx
git commit -m "refactor: move sidebar to native meeting directory"
\`\`\`

### Task 3: Split the sidebar into Talat-style navigation, meetings and actions

**Files:**
- Create: \`frontend/src/components/AppShell/AppShell.tsx\`
- Create: \`frontend/src/components/AppShell/SidebarNavigation.tsx\`
- Create: \`frontend/src/components/AppShell/SidebarMeetingList.tsx\`
- Create: \`frontend/src/components/AppShell/SidebarSearchDialog.tsx\`
- Create: \`frontend/src/components/AppShell/SidebarActions.tsx\`
- Create: \`frontend/src/components/AppShell/sidebar-navigation.ts\`
- Modify: \`frontend/src/components/Sidebar/index.tsx\`
- Modify: \`frontend/src/app/layout.tsx\` or the current global shell composition
- Test: \`frontend/src/components/AppShell/SidebarNavigation.test.tsx\`
- Test: \`frontend/src/components/AppShell/SidebarMeetingList.test.tsx\`

**Consumes:** \`MeetingDirectoryState\`, \`SidebarProvider\`, \`useImportDialog\`, current meeting rename/delete commands, and routes \`/\`, \`/meeting-details?id=<id>\`, \`/settings#speakers\`, and \`/settings\`.

**Produces:** the responsive AppShell and a sidebar whose components each have one responsibility.

- [ ] **Step 1: Write failing component tests for expanded, collapsed and grouped meeting behavior.**

\`\`\`tsx
it('keeps each primary route reachable in collapsed mode', async () => {
  render(<SidebarNavigation collapsed onToggle={vi.fn()} />);
  await userEvent.tab();

  expect(screen.getByRole('link', { name: /início/i })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: /reuniões/i })).toBeVisible();
  expect(screen.getByRole('link', { name: /pessoas/i })).toHaveAttribute('href', '/settings#speakers');
  expect(screen.getByRole('link', { name: /configurações/i })).toHaveAttribute('href', '/settings');
});

it('renders date groups and opens a selected meeting without nesting a button in a link', async () => {
  render(<SidebarMeetingList directory={directoryWithThreeGroups} />);
  expect(screen.getByRole('heading', { name: /hoje/i })).toBeVisible();
  await userEvent.click(screen.getByRole('link', { name: /reunião de hoje/i }));
  expect(mockPush).toHaveBeenCalledWith('/meeting-details?id=today');
});
\`\`\`

- [ ] **Step 2: Run tests and confirm the new components do not exist.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/AppShell/SidebarNavigation.test.tsx src/components/AppShell/SidebarMeetingList.test.tsx
\`\`\`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement the visual shell and interactions.**

1. Create \`AppShell\` as a full-height flex layout: 240 px expanded rail, 64 px collapsed rail, subtle right border, no floating card around the rail, and a scrollable content region. Use CSS variables/classes so dark mode from settings applies without component-specific theme logic.
2. Define navigation as data:

\`\`\`ts
export const primaryNavigation = [
  { id: 'home', href: '/', icon: Home, labelKey: 'navigation.home' },
  { id: 'meetings', href: '/#meetings', icon: ListVideo, labelKey: 'navigation.meetings' },
  { id: 'people', href: '/settings#speakers', icon: Users, labelKey: 'navigation.people' },
  { id: 'settings', href: '/settings', icon: Settings, labelKey: 'navigation.settings' },
] as const;
\`\`\`

Use the current route/hash to apply a single muted active background, active icon and text, not a large colored tab.
3. Place a high-contrast “New recording” action at the top of \`SidebarActions\`; it calls \`startRecordingFromNavigation\`. Keep Import as an adjacent secondary action calling \`openImportDialog\`.
4. \`SidebarMeetingList\` must render Today, Previous 7 days and Older, show title/date/duration plus summary or processing indicator, virtualize only when more than 30 items are present, and use the existing rename/delete commands from an overflow menu. Destructive delete must keep the existing confirmation dialog.
5. \`SidebarSearchDialog\` opens from the search field and \`Ctrl/Cmd+K\`, searches local transcript results through the existing Tauri command, shows meeting-title matches first, and clears its query/results on close. It must not store queries.
6. In collapsed mode hide text and meeting list but keep navigation/actions as labeled tooltip triggers; pressing Escape closes search and any open overflow menu. At viewport widths below 768 px, render this same navigation in a modal drawer.
7. Make \`Sidebar/index.tsx\` a short compatibility component that only composes the new pieces. Move model settings, transcript settings, compliance notifications and unrelated dialogs out of the sidebar into their owning routes/components.

- [ ] **Step 4: Run component, i18n and lint tests.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/AppShell/SidebarNavigation.test.tsx src/components/AppShell/SidebarMeetingList.test.tsx
pnpm run test:i18n
pnpm run lint
\`\`\`

Expected: PASS.

- [ ] **Step 5: Commit only validated implementation files.**

\`\`\`powershell
git add frontend/src/components/AppShell frontend/src/components/Sidebar/index.tsx frontend/src/app/layout.tsx frontend/messages
git commit -m "feat: add Talat-style meeting sidebar"
\`\`\`

### Task 4: Turn the idle root page into a Talat-style meeting home

**Files:**
- Create: \`frontend/src/app/_components/HomeDashboard.tsx\`
- Create: \`frontend/src/app/_components/HomeQuickStart.tsx\`
- Create: \`frontend/src/app/_components/RecentMeetings.tsx\`
- Create: \`frontend/src/app/_components/HomeAttentionList.tsx\`
- Create: \`frontend/src/app/_components/HomeActivitySummary.tsx\`
- Modify: \`frontend/src/app/page.tsx\`
- Modify: \`frontend/src/app/_components/TranscriptPanel.tsx\` only if a prop is needed to preserve the live mode
- Test: \`frontend/src/app/_components/HomeDashboard.test.tsx\`
- Test: \`frontend/src/app/_components/HomeQuickStart.test.tsx\`

**Consumes:** \`useMeetingDirectory\`, \`usePermissionCheck\`, \`useConfig\`, \`useRecordingState\`, existing \`useRecordingStart\`, existing recovery hook and \`RecordingControls\`.

**Produces:** \`HomeDashboard\` for idle state and unchanged live recording workspace for active state.

- [ ] **Step 1: Write failing tests that define the idle/live switch.**

\`\`\`tsx
it('shows quick start and recent meetings while idle instead of an empty transcript canvas', () => {
  mockRecordingState({ isRecording: false, status: RecordingStatus.IDLE });
  render(<HomeDashboard directory={readyDirectory} attention={[]} />);

  expect(screen.getByRole('heading', { name: /suas reuniões/i })).toBeVisible();
  expect(screen.getByRole('button', { name: /iniciar gravação/i })).toBeEnabled();
  expect(screen.getByRole('link', { name: /reunião de hoje/i })).toHaveAttribute('href', '/meeting-details?id=today');
});

it('keeps the existing transcript panel and recording controller visible during a recording', () => {
  mockRecordingState({ isRecording: true, status: RecordingStatus.RECORDING });
  render(<Home />);

  expect(screen.getByTestId('live-transcript-panel')).toBeVisible();
  expect(screen.getByTestId('recording-controls')).toBeVisible();
  expect(screen.queryByTestId('home-dashboard')).not.toBeInTheDocument();
});
\`\`\`

- [ ] **Step 2: Run the tests and confirm the dashboard does not exist.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/app/_components/HomeDashboard.test.tsx src/app/_components/HomeQuickStart.test.tsx
\`\`\`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement dashboard and state transition.**

1. Extract the idle markup from \`page.tsx\` into \`HomeDashboard\` and make it max-width 1120 px, with a compact header (“Suas reuniões”), primary recording quick-start card, recent list and attention/activity rail. Avoid decorative charts with invented data.
2. \`HomeQuickStart\` must show microphone/system device names from \`selectedDevices\`, a readable permission state, selected transcription model, and “Iniciar gravação” / “Configurar áudio” actions. It calls the existing \`handleRecordingStart\`; it does not invoke a second recording command.
3. \`RecentMeetings\` shows up to six directory items with title, relative/local date, duration when known, transcript/summary status and keyboard-accessible row links. “Ver todas” scrolls/focuses the sidebar Meetings group or navigates to its future full list route if introduced.
4. \`HomeAttentionList\` must display only actual recovery items from \`useTranscriptRecovery\` and actual processing states from directory data. Its recovery action calls the existing \`handleRecovery\`, preserving its toast, refresh and navigation behavior.
5. \`HomeActivitySummary\` may show local counts: meetings this week, summaries ready and recordings needing attention. Derive all values from loaded directory rows and label zero states plainly.
6. In \`page.tsx\`, preserve startup cleanup, recovery dialog, recording-state sync, permission handling, stop processing overlay and the exact \`RecordingControls\` props. Render:
   - \`HomeDashboard\` when not recording and status is neither STOPPING, PROCESSING_TRANSCRIPTS nor SAVING;
   - current \`TranscriptPanel\` plus fixed \`RecordingControls\` while recording or processing.
7. Ensure the transition is not hidden behind a 300 ms random-bar animation; use the actual audio/recording state for visual status.

- [ ] **Step 4: Run dashboard tests, i18n, lint and build.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/app/_components/HomeDashboard.test.tsx src/app/_components/HomeQuickStart.test.tsx
pnpm run test:i18n
pnpm run lint
pnpm run build
\`\`\`

Expected: PASS.

- [ ] **Step 5: Commit only validated implementation files.**

\`\`\`powershell
git add frontend/src/app/page.tsx frontend/src/app/_components frontend/messages
git commit -m "feat: add Talat-style meeting home"
\`\`\`

### Task 5: Route polish, accessibility and regression verification

**Files:**
- Modify: \`frontend/src/components/AppShell/SidebarNavigation.tsx\`
- Modify: \`frontend/src/components/AppShell/SidebarSearchDialog.tsx\`
- Modify: \`frontend/src/app/_components/HomeDashboard.tsx\`
- Create: \`frontend/src/components/AppShell/AppShell.a11y.test.tsx\`
- Create: \`frontend/src/app/_components/HomeFlow.test.tsx\`
- Modify: \`frontend/messages/*.json\`

**Consumes:** all components and state from Tasks 1–4.

**Produces:** an accessible, responsive navigation/home flow with no dependency on the archived backend.

- [ ] **Step 1: Write end-to-end component tests for keyboard navigation and native data isolation.**

\`\`\`tsx
it('opens search with Ctrl+K, focuses its input, and closes with Escape', async () => {
  render(<AppShell><div>content</div></AppShell>);
  await userEvent.keyboard('{Control>}k{/Control}');

  expect(screen.getByRole('dialog', { name: /buscar reuniões/i })).toBeVisible();
  expect(screen.getByRole('searchbox')).toHaveFocus();

  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: /buscar reuniões/i })).not.toBeInTheDocument();
});

it('never calls an api_get_meetings endpoint when mounting the app shell', async () => {
  render(<AppShell><div>content</div></AppShell>);
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('list_home_meetings', { limit: 50 }));
  expect(mockInvoke).not.toHaveBeenCalledWith('api_get_meetings');
});
\`\`\`

- [ ] **Step 2: Run tests and confirm they fail until shell wiring is complete.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/AppShell/AppShell.a11y.test.tsx src/app/_components/HomeFlow.test.tsx
\`\`\`

Expected: FAIL before the complete shell is integrated.

- [ ] **Step 3: Complete accessibility and responsive behavior.**

1. Use semantic \`nav\`, \`main\`, headings in chronological order, native links for route navigation, and \`aria-current="page"\` for active primary navigation.
2. Give collapsed controls tooltip text and \`aria-label\`; provide a visible focus ring that does not depend on color alone.
3. On narrow windows, trap focus inside the open navigation drawer, return focus to the menu trigger on close, and preserve current route/highlight.
4. Ensure the meeting list has an accessible loading state, empty state and error/retry state. Keep rename/delete actions reachable without requiring hover.
5. Search result rows must announce title, match context and timestamp and navigate to the correct meeting detail/transcript location without losing the query to persistent storage.
6. Remove remaining imports/calls tied to \`serverAddress\`, \`api_get_meetings\` or legacy backend URLs from sidebar and home surfaces.
7. Verify Portuguese copy and every existing supported locale with the project i18n script.

- [ ] **Step 4: Run full automated validation.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/AppShell src/app/_components
pnpm run test:i18n
pnpm run lint
pnpm run build
cargo test --manifest-path src-tauri/Cargo.toml list_directory_items -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
\`\`\`

Expected: every command exits 0.

- [ ] **Step 5: Perform Tauri acceptance checks and commit.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm run tauri:dev
\`\`\`

Verify manually:

1. Expanded and collapsed sidebar persist after restart.
2. Home, Meetings, People and Settings all remain reachable in both sidebar sizes.
3. Sidebar and home show existing local meetings even with the archived backend unavailable.
4. Import, meeting search, meeting rename/delete confirmation, recovery, recording start/stop and navigation to details continue working.
5. Idle home has the dashboard; beginning a recording switches to the live transcript workspace without losing the selected devices or meeting title.
6. Light/dark themes, 80% and 120% UI scales, keyboard-only navigation and a viewport below 768 px remain usable.
7. No Calendar, Dictation, automatic meeting start, webhook or MCP link has been introduced.

Then commit:

\`\`\`powershell
git add frontend
git commit -m "feat: complete Talat-style sidebar and home"
\`\`\`

## Acceptance criteria

- The application has a Talat-like, meeting-centered navigation rail and idle home dashboard, expressed with Meetily’s own visual identity.
- Sidebar code is decomposed by responsibility and no longer relies on the archived backend for listing meetings.
- Recording and recovery behavior remains intact; the dashboard is an idle presentation, not a replacement for the live recording workspace.
- The meeting list is grouped, searchable, responsive, keyboard-accessible and informative without fabricated data.
- Previous exclusions remain absent from the sidebar and home.

