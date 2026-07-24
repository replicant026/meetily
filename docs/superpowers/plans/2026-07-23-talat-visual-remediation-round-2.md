# Talat Visual Remediation Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Meetily's desktop shell, Home/Meetings, People, and meeting workspace match the Talat reference hierarchy without adding non-functional navigation or changing the deferred Rust audio-source model.

**Architecture:** Preserve the existing Tauri-backed meeting directory and the single global `AppShell` rail. Make `/meetings` the real meetings destination, use shared layout primitives and tokens for the warm Talat surface, and change People from an in-page master/detail split to a directory route plus a dedicated profile route. Keep the workspace transcript as the dominant reading pane with a bounded contextual People aside.

**Tech Stack:** Tauri 2, Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, next-intl, Vitest, Testing Library.

---

## Scope and non-goals

- This plan fixes the currently observed desktop visual defects and the Meetings navigation defect that prevents visual verification of its new route.
- It does **not** add a `source` field to persisted Rust transcripts. The microphone/system grouping remains an explicitly documented heuristic until a separate Rust + database migration is approved.
- It does **not** create rail destinations merely to copy Talat icons. Every visible rail link must lead to an implemented route.
- Do not commit this plan file. Commit only implementation and test files after their corresponding gate passes.

## File map

| File | Responsibility |
| --- | --- |
| `frontend/src/app/globals.css` | Shared warm surface, type, spacing, card, and rail tokens. |
| `frontend/src/components/AppShell/AppShell.tsx` | Stable desktop rail/content frame and overflow boundaries. |
| `frontend/src/components/AppShell/SidebarNavigation.tsx` | Route-correct, accessible global rail. |
| `frontend/src/components/AppShell/SidebarActions.tsx` | Bottom actions that remain fully visible at desktop heights. |
| `frontend/src/app/_components/HomeDashboard.tsx` | Wide Home composition and localized header copy. |
| `frontend/src/app/_components/RecentMeetings.tsx` | Talat-like meeting rows shared by Home and `/meetings`. |
| `frontend/src/app/meetings/page.tsx` | Full meeting index using the shared meeting rows. |
| `frontend/src/app/people/page.tsx` | List-first People route. |
| `frontend/src/app/people/[id]/page.tsx` | Dedicated person detail route. |
| `frontend/src/components/speakers/SpeakerDirectory.tsx` | Search/create/list interaction only; no second desktop pane. |
| `frontend/src/components/speakers/SpeakerDetailPanel.tsx` | Reused person profile content inside the detail route. |
| `frontend/src/components/MeetingWorkspace/MeetingWorkspace.tsx` | Desktop transcript/aside proportions. |
| `frontend/src/components/MeetingWorkspace/ParticipantsSidebar.tsx` | Bounded participant cards and tags panel. |
| `frontend/tests/layout/talat-layout-contract.test.tsx` | Rail route and single-navigation contract. |
| `frontend/tests/home/meetings-route.test.tsx` | Home/Meetings shared-list and wide-layout contract. |
| `frontend/tests/speakers/people-route.test.tsx` | List-first People and detail-route contract. |
| `frontend/tests/meeting-workspace/workspace-layout.test.tsx` | One main transcript pane plus one contextual aside contract. |

### Task 1: Correct the route contract before visual work

**Files:**

- Modify: `frontend/src/components/AppShell/SidebarNavigation.tsx:10-15`
- Modify: `frontend/tests/layout/talat-layout-contract.test.tsx`
- Test: `frontend/tests/home/meetings-route.test.tsx`

- [ ] **Step 1: Write the route regression test.**

  Add an assertion that the global link named by `common.nav.meetings` has `href="/meetings"`, while Home remains the only exact `/` link:

  ```ts
  expect(screen.getByRole('link', { name: 'common.nav.home' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'common.nav.meetings' })).toHaveAttribute('href', '/meetings');
  ```

- [ ] **Step 2: Run the focused test and confirm it fails because Meetings still targets `/`.**

  Run: `pnpm exec vitest run tests/layout/talat-layout-contract.test.tsx`

  Expected: FAIL on the Meetings `href` assertion.

- [ ] **Step 3: Change only the nav destination.**

  Replace the Meetings item with the route that already exists:

  ```ts
  { id: 'meetings', href: '/meetings', icon: ListVideo, labelKey: 'common.nav.meetings', exact: true },
  ```

  Keep `exact: true` so the Home item is not active on `/meetings`.

- [ ] **Step 4: Re-run the focused contract.**

  Run: `pnpm exec vitest run tests/layout/talat-layout-contract.test.tsx`

  Expected: PASS.

- [ ] **Step 5: Commit implementation and test files only.**

  ```bash
  git add frontend/src/components/AppShell/SidebarNavigation.tsx frontend/tests/layout/talat-layout-contract.test.tsx
  git commit -m "fix: route the meetings rail item"
  ```

### Task 2: Consolidate Talat visual primitives and the single global rail

**Files:**

- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/components/AppShell/AppShell.tsx:13-55`
- Modify: `frontend/src/components/AppShell/SidebarNavigation.tsx`
- Modify: `frontend/src/components/AppShell/SidebarActions.tsx:13-40`
- Modify: `frontend/tests/layout/visual-token-contract.test.tsx`
- Modify: `frontend/tests/layout/talat-layout-contract.test.tsx`

- [ ] **Step 1: Write failing token and rail assertions.**

  Assert one global navigation landmark, a fixed 64px rail, no horizontal page overflow, and token classes used by the rail/content frame:

  ```ts
  expect(screen.getAllByRole('navigation', { name: 'Main Navigation' })).toHaveLength(1);
  expect(screen.getByRole('navigation', { name: 'Main Navigation' }).parentElement).toHaveClass('w-16');
  expect(readFileSync(globalsPath, 'utf8')).toContain('--app-bg');
  expect(readFileSync(globalsPath, 'utf8')).toContain('.app-display-heading');
  ```

- [ ] **Step 2: Run the layout tests.**

  Run: `pnpm exec vitest run tests/layout/talat-layout-contract.test.tsx tests/layout/visual-token-contract.test.tsx`

  Expected: FAIL for the new shell assertions.

- [ ] **Step 3: Implement the primitive contract.**

  In `globals.css`, retain the existing `--app-*` naming and define the shared classes instead of repeating literal stone/amber values:

  ```css
  .app-page { @apply mx-auto w-full max-w-6xl px-6 py-8; }
  .app-surface { @apply rounded-2xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]; }
  .app-display-heading { font-family: var(--font-display), Georgia, serif; }
  ```

  In `AppShell`, make the frame `h-dvh overflow-hidden`, keep one `w-16 shrink-0` rail, and make the main area `min-w-0 overflow-y-auto`. In `SidebarActions`, group the two bottom controls in a visible `gap-2 pb-2`; do not position the import action below the viewport. Keep only Home, Meetings, People, Settings, New recording, and Import because these are implemented destinations/actions.

- [ ] **Step 4: Re-run the layout tests.**

  Run: `pnpm exec vitest run tests/layout/talat-layout-contract.test.tsx tests/layout/visual-token-contract.test.tsx`

  Expected: PASS.

- [ ] **Step 5: Commit implementation and tests only.**

  ```bash
  git add frontend/src/app/globals.css frontend/src/components/AppShell frontend/tests/layout
  git commit -m "feat: refine the desktop application rail"
  ```

### Task 3: Recompose Home and Meetings as wide reading surfaces

**Files:**

- Modify: `frontend/src/app/_components/HomeDashboard.tsx:24-103`
- Modify: `frontend/src/app/_components/RecentMeetings.tsx:32-71`
- Modify: `frontend/src/app/meetings/page.tsx`
- Create: `frontend/tests/home/meetings-route.test.tsx`
- Modify: locale JSON files only for any new visible copy used by these components

- [ ] **Step 1: Write Home/Meetings contracts.**

  Render both routes with six meetings and assert that they use the same list, contain a display heading, and do not wrap the meeting list in the old narrow `max-w-md`/fixed-width layout:

  ```ts
  expect(screen.getByRole('heading', { name: /recent meetings/i })).toBeVisible();
  expect(screen.getAllByRole('button', { name: /audio/i })).toHaveLength(6);
  expect(container.querySelector('.max-w-md')).toBeNull();
  ```

- [ ] **Step 2: Run the new tests and confirm failure.**

  Run: `pnpm exec vitest run tests/home/meetings-route.test.tsx`

  Expected: FAIL until the reusable wide page surface is in place.

- [ ] **Step 3: Implement the composition without changing recording behavior.**

  Use `app-page space-y-8` on Home and Meetings. Make the Home header use `app-display-heading text-4xl`, a localized subtitle, a full-width quick-start surface, and an activity grid that expands across the available content width. Make `RecentMeetings` render full-width rows with a title, localized relative date/duration metadata, a thin divider, and no card-per-row stack on desktop. Reuse the same component in `/meetings` with `maxItems={100}`.

  Replace literal visible copy such as `Your meetings, transcribed locally` with a `home` locale key in every supported locale before rendering it.

- [ ] **Step 4: Run targeted tests and i18n gate.**

  Run: `pnpm exec vitest run tests/home/meetings-route.test.tsx src/app/_components/HomeFlow.test.tsx && pnpm run check:i18n`

  Expected: PASS; no new baseline-suppressed i18n gap.

- [ ] **Step 5: Commit implementation, locale, and test files only.**

  ```bash
  git add frontend/src/app/_components/HomeDashboard.tsx frontend/src/app/_components/RecentMeetings.tsx frontend/src/app/meetings/page.tsx frontend/src/messages frontend/tests/home
  git commit -m "feat: widen home and meetings reading surfaces"
  ```

### Task 4: Make People list-first and open detail in its own route

**Files:**

- Modify: `frontend/src/components/speakers/SpeakerDirectory.tsx:30-205`
- Modify: `frontend/src/app/people/page.tsx:8-35`
- Create: `frontend/src/app/people/[id]/page.tsx`
- Modify: `frontend/src/components/speakers/SpeakerDetailPanel.tsx`
- Modify: `frontend/tests/speakers/people-route.test.tsx`

- [ ] **Step 1: Write the route-level failing tests.**

  Test that `/people` has a single full-width list, selecting a person navigates to `/people/<id>`, and the directory DOM does not render the no-selection detail panel:

  ```ts
  expect(screen.queryByText('detail.no_selection')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /felipe/i }));
  expect(push).toHaveBeenCalledWith('/people/person-1');
  ```

- [ ] **Step 2: Run the focused test and confirm the current two-pane behavior fails it.**

  Run: `pnpm exec vitest run tests/speakers/people-route.test.tsx`

  Expected: FAIL because `SpeakerDirectory` renders its fixed `w-72` list plus detail pane.

- [ ] **Step 3: Split list interaction from profile presentation.**

  In `SpeakerDirectory`, replace `selectedId` and the right panel with `useRouter()` navigation. Preserve search, create, empty state, and real `listPeople` / `createPerson` calls. Each row must remain a semantic button:

  ```ts
  onClick={() => router.push(`/people/${person.id}`)}
  className="w-full border-b border-[rgb(var(--app-border))] px-2 py-4 text-left last:border-b-0"
  ```

  Create `/people/[id]/page.tsx` to load the selected person through the existing speaker API, render a Back link to `/people`, then render `SpeakerDetailPanel`. Its page surface uses `app-page max-w-5xl`, not an in-place split view. Make `SpeakerDetailPanel` accept the already loaded person and preserve its update callback; do not duplicate voice-reference mutation logic.

- [ ] **Step 4: Re-run focused People tests.**

  Run: `pnpm exec vitest run tests/speakers/people-route.test.tsx src/components/speakers/SpeakerFlow.test.tsx`

  Expected: PASS.

- [ ] **Step 5: Commit implementation and tests only.**

  ```bash
  git add frontend/src/app/people frontend/src/components/speakers/SpeakerDirectory.tsx frontend/src/components/speakers/SpeakerDetailPanel.tsx frontend/tests/speakers/people-route.test.tsx
  git commit -m "feat: make people directory list-first"
  ```

### Task 5: Lock the meeting workspace to one reading pane plus one contextual aside

**Files:**

- Modify: `frontend/src/components/MeetingWorkspace/MeetingWorkspace.tsx:25-56`
- Modify: `frontend/src/components/MeetingWorkspace/ParticipantsSidebar.tsx:15-86`
- Create: `frontend/tests/meeting-workspace/workspace-layout.test.tsx`
- Modify: `frontend/tests/meeting-workspace/meeting-workspace-integration.test.tsx`

- [ ] **Step 1: Write the desktop composition test.**

  Assert one `meetingContent` section, one complementary People aside, and the responsive desktop grid shape:

  ```ts
  expect(screen.getAllByRole('region', { name: 'meetingContent' })).toHaveLength(1);
  expect(screen.getByRole('complementary', { name: 'people' })).toBeVisible();
  expect(screen.getByTestId('meeting-workspace-grid')).toHaveClass('lg:grid-cols-[minmax(0,1fr)_22rem]');
  ```

- [ ] **Step 2: Run the focused test and confirm it fails before adding the explicit test hook.**

  Run: `pnpm exec vitest run tests/meeting-workspace/workspace-layout.test.tsx`

  Expected: FAIL because the grid does not yet expose the verifiable layout marker.

- [ ] **Step 3: Implement the bounded composition.**

  Add `data-testid="meeting-workspace-grid"` to the existing grid, keep `minmax(0,1fr)` for the transcript and `22rem` for the aside, and set the workspace to `min-h-0 h-full` below the header/timeline so the transcript scrolls inside its own reading pane. Keep `ParticipantsSidebar` as `<aside>` only at `lg` and above; its source cards and tags must use `app-surface` with compact padding, never another full-height navigation rail.

- [ ] **Step 4: Run workspace tests.**

  Run: `pnpm exec vitest run tests/meeting-workspace/workspace-layout.test.tsx tests/meeting-workspace/meeting-workspace-integration.test.tsx tests/meeting-workspace/workspace-transcript.test.tsx`

  Expected: PASS.

- [ ] **Step 5: Commit implementation and tests only.**

  ```bash
  git add frontend/src/components/MeetingWorkspace frontend/tests/meeting-workspace
  git commit -m "fix: preserve a single transcript reading pane"
  ```

### Task 6: Validate in the real Tauri desktop shell and close the quality gates

**Files:**

- Modify only test files or locale files if a verified defect is found; otherwise no source changes.

- [ ] **Step 1: Run static gates from `frontend`.**

  ```bash
  pnpm exec vitest run
  pnpm run check:i18n
  pnpm run lint
  pnpm run build
  ```

  Expected: all commands exit 0; `check:i18n` reports no new gaps. Record lint warnings separately from errors.

- [ ] **Step 2: Start the desktop app without running a production build concurrently with `next dev`.**

  ```bash
  pnpm run tauri:dev
  ```

  Expected: a single native Meetily window loads without a Next chunk error.

- [ ] **Step 3: Manually inspect exactly these desktop states at the Talat reference viewport.**

  1. Home: content is wide, quick start and recent meetings are not confined to a narrow column, and the bottom Import action is fully visible.
  2. Meetings: rail click changes the content to `/meetings`; Home is not still shown.
  3. People: directory is a full-width list; selecting a row opens the profile route rather than a right-hand blank panel.
  4. Meeting workspace: transcript is one continuous main reading pane; People is the only right contextual aside; no second global sidebar is present.
  5. Settings and Import: the single rail persists and neither page overflows horizontally.

- [ ] **Step 4: Record any remaining difference as one of three outcomes.**

  - **Fixed:** observed desktop state matches the corresponding Talat hierarchy.
  - **Deferred:** microphone/system audio provenance still relies on the existing heuristic and requires the separate Rust/DB migration.
  - **Defect:** include route, viewport, screenshot, console/terminal evidence, and a focused regression test before changing code.

- [ ] **Step 5: Commit only follow-up implementation that has passed the gates.**

  ```bash
  git add <verified-source-and-test-files>
  git commit -m "fix: resolve desktop visual validation findings"
  ```

## Final acceptance checklist

- [ ] Only one global rail is present; every visible rail item is functional and uses a real route.
- [ ] Home and `/meetings` use the full reading width and share one recent-meeting row model.
- [ ] People is list-first; no desktop blank detail column exists; profiles have their own route.
- [ ] The meeting transcript has exactly one primary reading column and one bounded People aside at desktop widths.
- [ ] New visible copy is localized and `check:i18n` has zero new gaps.
- [ ] `vitest`, `check:i18n`, lint, build, and real Tauri navigation all pass.
- [ ] The deferred microphone/system provenance limitation is still documented rather than visually misrepresented as factual data.
