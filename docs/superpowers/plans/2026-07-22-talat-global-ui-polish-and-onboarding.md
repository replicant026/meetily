# Talat-Style Global UI Polish and Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Establish a unified Talat-inspired visual system and apply it to onboarding, permissions, model downloads, dialogs, feedback states, import/recovery/update flows, responsiveness, and the desktop tray experience.

**Architecture:** Define semantic UI tokens once in the root stylesheet and make reusable primitive components consume those tokens instead of page-specific Tailwind color stacks. Introduce a presentation layer for system states (empty, loading, error, processing, permission), then migrate existing onboarding, import, recovery, update and desktop-tray surfaces to it without changing their Tauri command contracts. The settings refactor remains the owner of persisted theme and UI-scale preference; this plan supplies the application-wide rendering contract it applies.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Radix UI, Framer Motion, next-intl, Sonner, Tauri 2, Rust tray APIs, Vitest.

## Global Constraints

- Preserve Meetily branding, logo, copy and local-first behavior; match Talat’s hierarchy, density and interaction quality rather than copying its assets.
- The existing settings plan owns stored values for theme and UI scale; consume \`data-theme\` and \`--ui-scale\` without creating another settings store.
- Do not change the archived FastAPI backend or make new HTTP dependencies.
- Keep existing onboarding completion, permission requests, model-download commands, import, transcript recovery, updater and tray commands intact unless a narrow UI event is required.
- Do not add Calendar, Dictation, automatic meeting start, webhooks or MCP.
- Do not log, toast, render or transmit meeting transcript content, voice references, file paths, API keys or model credentials.
- Respect \`prefers-reduced-motion\`; motion is supplemental and must not delay navigation or state changes.
- Do not commit this plan. Implementation commits must contain only validated source and test files.

---

## Target visual language

- Quiet neutral canvas, compact surfaces, 8 px spacing rhythm, restrained borders, 10–12 px radii, strong but limited primary accent, and clear typography hierarchy.
- One visual vocabulary for inline status: dot/icon, label, concise explanation and a direct next action.
- One visual vocabulary for dialogs: short title, context, one primary action, an explicit cancel/destructive distinction, and no nested modals.
- Onboarding feels like a guided local setup rather than a long form: progress is visible, optional choices are secondary, model downloads expose real progress, and permission issues explain the exact action available on the current platform.
- Desktop tray reports actual recording state with a concise label and entry points back to the live workspace; it does not duplicate settings or create a second recording workflow.

## File map

| File | Responsibility |
| --- | --- |
| \`frontend/src/app/globals.css\` | Semantic color, type, elevation, radius, scale and reduced-motion tokens. |
| \`frontend/src/components/ui/app-surface.tsx\` | Shared shell/card/panel primitives. |
| \`frontend/src/components/ui/app-status.tsx\` | Semantic loading, empty, error, permission and processing states. |
| \`frontend/src/components/ui/app-dialog.tsx\` | Consistent dialog header/footer/action layout around existing Radix dialog primitives. |
| \`frontend/src/components/ui/app-button.tsx\` | Standard primary, secondary, quiet and destructive button variants. |
| \`frontend/src/components/ui/app-toast.tsx\` | Typed wrapper around Sonner for non-sensitive success/error/progress feedback. |
| \`frontend/src/lib/ui-state.ts\` | Pure status mapping and safe message helpers. |
| \`frontend/src/app/ClientRootLayout.tsx\` | Provider ordering and centralized global import/recovery/update presentation. |
| \`frontend/src/components/onboarding/OnboardingContainer.tsx\` | Talat-style setup shell and progress indicator. |
| \`frontend/src/components/onboarding/OnboardingFlow.tsx\` | Guided flow composition without changing onboarding state machine. |
| \`frontend/src/components/onboarding/shared/PermissionRow.tsx\` | Standard permission readiness/action row. |
| \`frontend/src/components/onboarding/steps/DownloadProgressStep.tsx\` | Model cards and download states with actual progress. |
| \`frontend/src/components/ImportDialog.tsx\` or the current import dialog component located from \`ImportDialogProvider\` | Migrate import to shared dialog/status primitives. |
| \`frontend/src/components/TranscriptRecovery.tsx\` | Migrate recovery states and actions to shared dialog/status primitives. |
| \`frontend/src/components/RecoveryFailureBanner.tsx\` | Use the shared inline status vocabulary. |
| \`frontend/src/components/UpdateDialog.tsx\` | Apply consistent update dialog/progress presentation. |
| \`frontend/src/components/shared/DownloadProgressToast.tsx\` | Align long-running download feedback with shared toast/status primitives. |
| \`frontend/src-tauri/src/tray.rs\` | Align visible tray labels/menu state with actual recording status. |
| \`frontend/messages/*.json\` | Localized shared UI, onboarding, status and tray copy. |

## Shared interfaces

\`\`\`ts
export type AppStatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type AppStatusKind =
  | 'empty'
  | 'loading'
  | 'processing'
  | 'permission'
  | 'error'
  | 'offline';

export interface AppStatusModel {
  kind: AppStatusKind;
  tone: AppStatusTone;
  title: string;
  description?: string;
  action?: {
    label: string;
    onAction(): void | Promise<void>;
  };
}

export interface AppToastInput {
  tone: Exclude<AppStatusTone, 'neutral'>;
  title: string;
  description?: string;
  action?: { label: string; onClick(): void };
}
\`\`\`

\`\`\`css
:root {
  --ui-scale: 1;
  --app-bg: 248 250 252;
  --app-surface: 255 255 255;
  --app-muted: 241 245 249;
  --app-border: 226 232 240;
  --app-fg: 15 23 42;
  --app-muted-fg: 100 116 139;
  --app-accent: 37 99 235;
  --app-danger: 220 38 38;
  --app-radius-sm: 8px;
  --app-radius-md: 12px;
  --app-shadow-panel: 0 1px 2px rgb(15 23 42 / 0.06);
}
[data-theme='dark'] { /* same semantic variables with dark values */ }
html { font-size: calc(16px * var(--ui-scale)); }
\`\`\`

### Task 1: Build semantic tokens and shared UI primitives

**Files:**
- Modify: \`frontend/src/app/globals.css\`
- Create: \`frontend/src/components/ui/app-surface.tsx\`
- Create: \`frontend/src/components/ui/app-status.tsx\`
- Create: \`frontend/src/components/ui/app-dialog.tsx\`
- Create: \`frontend/src/components/ui/app-button.tsx\`
- Create: \`frontend/src/components/ui/app-toast.tsx\`
- Create: \`frontend/src/lib/ui-state.ts\`
- Test: \`frontend/src/components/ui/app-status.test.tsx\`
- Test: \`frontend/src/lib/ui-state.test.ts\`

**Consumes:** existing Tailwind setup, Radix dialog/button primitives, Sonner and the settings plan’s \`data-theme\` / \`--ui-scale\` contract.

**Produces:** \`AppSurface\`, \`AppStatus\`, \`AppDialog\`, \`AppButton\`, \`showAppToast\`, and \`toAppStatusModel\`.

- [ ] **Step 1: Write failing tests for semantic status and non-sensitive messages.**

\`\`\`tsx
it('renders a permission state with the supplied action and accessible description', async () => {
  const action = vi.fn();
  render(
    <AppStatus
      model={{
        kind: 'permission',
        tone: 'warning',
        title: 'Microphone access required',
        description: 'Allow Meetily to access your microphone.',
        action: { label: 'Open settings', onAction: action },
      }}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent('Microphone access required');
  await userEvent.click(screen.getByRole('button', { name: 'Open settings' }));
  expect(action).toHaveBeenCalledOnce();
});

it('redacts a local absolute path before creating a toast model', () => {
  expect(toAppStatusModel(new Error('Could not read C:\\\\Users\\\\Felip\\\\meeting.wav'))).toEqual(
    expect.objectContaining({ kind: 'error', description: 'Could not read the selected audio file.' }),
  );
});
\`\`\`

- [ ] **Step 2: Run tests and confirm shared modules are missing.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/ui/app-status.test.tsx src/lib/ui-state.test.ts
\`\`\`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Add tokens and primitives.**

1. Define the documented semantic CSS variables for light and dark themes in \`globals.css\`; replace only global page background/text defaults at this stage, leaving feature-specific colors for migration tasks.
2. Add \`@media (prefers-reduced-motion: reduce)\` to disable nonessential transitions and animation durations.
3. Implement \`AppSurface\` with \`variant: 'panel' | 'card' | 'subtle'\`, \`AppButton\` with \`variant: 'primary' | 'secondary' | 'quiet' | 'destructive'\`, and \`AppDialog\` with semantic title/description/footer slots. Use \`cn\` and existing Radix primitives rather than duplicating their behavior.
4. Implement \`AppStatus\` as a \`role="status"\` region for non-error states and \`role="alert"\` for danger; only render an action when \`model.action\` is present.
5. Implement \`toAppStatusModel(error)\` with safe, user-facing categories: permission, offline/unavailable, model download failure, selected-file failure and generic error. It must replace absolute Windows/Unix paths and raw error objects with generic localized copy.
6. Implement \`showAppToast(input)\` as the only new wrapper around Sonner; it accepts title, description and optional action, never serializes arbitrary error values.

- [ ] **Step 4: Run primitive, i18n and lint tests.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/ui/app-status.test.tsx src/lib/ui-state.test.ts
pnpm run test:i18n
pnpm run lint
\`\`\`

Expected: PASS.

- [ ] **Step 5: Commit only validated implementation files.**

\`\`\`powershell
git add frontend/src/app/globals.css frontend/src/components/ui frontend/src/lib/ui-state.ts frontend/src/components/ui/app-status.test.tsx frontend/src/lib/ui-state.test.ts frontend/messages
git commit -m "feat: add global Meetily UI primitives"
\`\`\`

### Task 2: Centralize providers, dialogs and feedback states

**Files:**
- Modify: \`frontend/src/app/ClientRootLayout.tsx\`
- Modify: \`frontend/src/components/MessageToast.tsx\`
- Modify: \`frontend/src/components/shared/DownloadProgressToast.tsx\`
- Modify: \`frontend/src/contexts/ImportDialogContext.tsx\`
- Create: \`frontend/src/app/_components/GlobalFeedbackLayer.tsx\`
- Test: \`frontend/src/app/_components/GlobalFeedbackLayer.test.tsx\`

**Consumes:** Task 1 primitives, existing ImportDialogProvider, DownloadProgressToastProvider, updater notification and onboarding state.

**Produces:** one ordered global feedback layer and a single Toaster root.

- [ ] **Step 1: Write a failing test for global dialog/feedback composition.**

\`\`\`tsx
it('renders one toast viewport and keeps import above the current route content', () => {
  render(
    <GlobalFeedbackLayer>
      <main data-testid="route-content">Page</main>
    </GlobalFeedbackLayer>,
  );

  expect(screen.getAllByTestId('sonner-toaster')).toHaveLength(1);
  expect(screen.getByTestId('route-content')).toBeVisible();
});
\`\`\`

- [ ] **Step 2: Run the test and confirm the global layer does not exist.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/app/_components/GlobalFeedbackLayer.test.tsx
\`\`\`

Expected: FAIL with module-not-found error.

- [ ] **Step 3: Compose global UI in one deliberate order.**

1. Create \`GlobalFeedbackLayer\` with this order: app children, import dialog, update dialog/notification callback, model download progress feedback, recovery failure banner, and one Sonner viewport.
2. Retire \`MessageToast\` only after tracing all callers; convert each caller to \`showAppToast\` or keep \`MessageToast\` as a temporary adapter that delegates to it. Do not mount a second toast viewport.
3. Keep \`ClientRootLayout\` responsible for drag/drop interception and onboarding visibility, but render all overlays through \`GlobalFeedbackLayer\` instead of scattered conditional fragments.
4. Make z-index semantic: base content 0, sticky controls 10, modal/drawer 50, toast 60. Define these in global utility classes or variables, not arbitrary values per component.
5. Convert the download progress UI to show actual bytes, total, speed, cancel/error state and retry action already provided by the current download hooks; use \`AppSurface\` and \`AppStatus\` for styling only.

- [ ] **Step 4: Run test, i18n and lint gates.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/app/_components/GlobalFeedbackLayer.test.tsx
pnpm run test:i18n
pnpm run lint
\`\`\`

Expected: PASS.

- [ ] **Step 5: Commit only validated implementation files.**

\`\`\`powershell
git add frontend/src/app/ClientRootLayout.tsx frontend/src/app/_components/GlobalFeedbackLayer.tsx frontend/src/components/MessageToast.tsx frontend/src/components/shared/DownloadProgressToast.tsx frontend/src/contexts/ImportDialogContext.tsx frontend/messages
git commit -m "refactor: unify global feedback presentation"
\`\`\`

### Task 3: Refine onboarding into a concise local-first setup flow

**Files:**
- Modify: \`frontend/src/components/onboarding/OnboardingContainer.tsx\`
- Modify: \`frontend/src/components/onboarding/OnboardingFlow.tsx\`
- Modify: \`frontend/src/components/onboarding/shared/PermissionRow.tsx\`
- Modify: \`frontend/src/components/onboarding/steps/DownloadProgressStep.tsx\`
- Modify: \`frontend/src/contexts/OnboardingContext.tsx\`
- Create: \`frontend/src/components/onboarding/OnboardingFlow.test.tsx\`
- Create: \`frontend/src/components/onboarding/shared/PermissionRow.test.tsx\`

**Consumes:** existing onboarding status, model selection/download commands and platform permission commands.

**Produces:** clear setup stages that display actual state and never imply that a declined permission is fixed when it is not.

- [ ] **Step 1: Write failing tests for accurate setup progress and permission retry.**

\`\`\`tsx
it('shows only unresolved setup items and permits completion when optional summary model is skipped', () => {
  mockOnboarding({
    permissions: { microphone: true, systemAudio: true },
    parakeetDownloaded: true,
    summaryModelDownloaded: false,
  });

  render(<OnboardingFlow onComplete={vi.fn()} />);

  expect(screen.queryByText(/microphone access/i)).not.toBeInTheDocument();
  expect(screen.getByText(/summary model is optional/i)).toBeVisible();
  expect(screen.getByRole('button', { name: /finish setup/i })).toBeEnabled();
});

it('retries only the permission row requested by the user', async () => {
  const request = vi.fn();
  render(<PermissionRow title="Microphone" status="missing" onRequest={request} />);

  await userEvent.click(screen.getByRole('button', { name: /allow microphone/i }));
  expect(request).toHaveBeenCalledOnce();
});
\`\`\`

- [ ] **Step 2: Run tests and confirm current components do not meet the new contract.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/onboarding/OnboardingFlow.test.tsx src/components/onboarding/shared/PermissionRow.test.tsx
\`\`\`

Expected: FAIL until the simplified status-driven flow is implemented.

- [ ] **Step 3: Implement the Talat-style onboarding presentation.**

1. Use \`OnboardingContainer\` as a centered, max-width 640 px surface with a small step indicator, plain-language title, optional back control and no decorative full-screen gradient.
2. Keep the existing state machine in \`OnboardingContext\`; extract only presentational selectors such as \`getUnresolvedSetupItems(status)\` to avoid another source of truth.
3. Display stages in this order: Welcome/local-first statement, Audio readiness, Speech model download, optional summary model, permissions, Ready. Do not add Calendar, automatic start, dictation, webhooks or MCP stages.
4. \`PermissionRow\` must show \`ready\`, \`needs action\`, \`unsupported\` or \`unavailable\`; show the platform-specific request/open-settings action only when the existing permission command exposes one.
5. \`DownloadProgressStep\` must retain existing real progress listeners and retry/cancel logic while presenting a compact model card with size, disk requirement, progress, speed, error and retry controls.
6. Completion must call the existing completion persistence once and transition to the home dashboard without a duplicate success dialog.

- [ ] **Step 4: Run tests, i18n and build.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/onboarding/OnboardingFlow.test.tsx src/components/onboarding/shared/PermissionRow.test.tsx
pnpm run test:i18n
pnpm run lint
pnpm run build
\`\`\`

Expected: PASS.

- [ ] **Step 5: Commit only validated implementation files.**

\`\`\`powershell
git add frontend/src/components/onboarding frontend/src/contexts/OnboardingContext.tsx frontend/messages
git commit -m "feat: refine local-first onboarding"
\`\`\`

### Task 4: Standardize import, recovery and updater surfaces

**Files:**
- Modify: the current import dialog component found from \`ImportDialogProvider\`
- Modify: \`frontend/src/components/TranscriptRecovery.tsx\`
- Modify: \`frontend/src/components/RecoveryFailureBanner.tsx\`
- Modify: \`frontend/src/components/UpdateDialog.tsx\`
- Modify: \`frontend/src/components/UpdateNotification.tsx\`
- Create: \`frontend/src/components/system-flows/SystemFlowDialogs.test.tsx\`

**Consumes:** Task 1 primitives, current import/recovery/update callbacks and status payloads.

**Produces:** consistent dialogs that preserve existing state transitions and user choices.

- [ ] **Step 1: Write failing dialog behavior tests.**

\`\`\`tsx
it('keeps recovery choices explicit and does not navigate before the user chooses recover', async () => {
  const recover = vi.fn();
  render(<TranscriptRecovery isOpen recoverableMeetings={[fixtureMeeting]} onRecover={recover} onClose={vi.fn()} onDelete={vi.fn()} onLoadPreview={vi.fn()} />);

  expect(screen.getByRole('dialog', { name: /recover meeting/i })).toBeVisible();
  expect(recover).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: /recover transcript/i }));
  expect(recover).toHaveBeenCalledWith(fixtureMeeting.id);
});

it('shows updater download progress from real event data and keeps relaunch disabled before completion', () => {
  render(<UpdateDialog open onOpenChange={vi.fn()} updateInfo={fixtureUpdate} />);
  expect(screen.getByRole('button', { name: /relaunch/i })).toBeDisabled();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
});
\`\`\`

- [ ] **Step 2: Run tests and confirm presentation assertions fail.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/system-flows/SystemFlowDialogs.test.tsx
\`\`\`

Expected: FAIL until shared dialog/status primitives are adopted.

- [ ] **Step 3: Migrate system flows without changing their commands.**

1. Wrap import, recovery and update content in \`AppDialog\`; use a single title, description and footer action layout.
2. In import, show selected file name and validated file type; replace raw absolute paths with basename only. Keep the current import callback and error/retry logic.
3. In recovery, distinguish “transcript recoverable”, “audio also recoverable” and “unavailable”; preserve existing preview, recover and delete actions. The delete action remains destructive-styled and requires the existing confirmation behavior.
4. In recovery failure banner, map backend failure categories through \`toAppStatusModel\` and provide the current retry/open-folder action only when it is available.
5. In updater UI, retain the existing download/install/relaunch implementation. Present available version/date, actual progress and error/retry with the shared primitives; never label an update installed before the completion event.
6. Ensure each dialog returns focus to its trigger and does not trap focus after an asynchronous close/error.

- [ ] **Step 4: Run tests, i18n and lint.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/system-flows/SystemFlowDialogs.test.tsx
pnpm run test:i18n
pnpm run lint
\`\`\`

Expected: PASS.

- [ ] **Step 5: Commit only validated implementation files.**

\`\`\`powershell
git add frontend/src/components/TranscriptRecovery.tsx frontend/src/components/RecoveryFailureBanner.tsx frontend/src/components/UpdateDialog.tsx frontend/src/components/UpdateNotification.tsx frontend/src/components/system-flows frontend/messages
git commit -m "refactor: unify import recovery and update UI"
\`\`\`

### Task 5: Align tray and recording presence with the desktop interface

**Files:**
- Modify: \`frontend/src-tauri/src/tray.rs\`
- Modify: \`frontend/src-tauri/src/lib.rs\` only if a narrow tray-state event registration is missing
- Create: \`frontend/src-tauri/src/tray_test.rs\`
- Modify: \`frontend/src/components/AppShell/SidebarActions.tsx\` from the sidebar/home plan
- Modify: \`frontend/src/app/_components/HomeQuickStart.tsx\` from the sidebar/home plan

**Consumes:** existing \`get_current_recording_state\`, \`set_tray_state\`, \`update_tray_menu\`, recording events and the navigation recording action.

**Produces:** a tray/menu that reports actual current state and opens the correct Meetily surface without creating alternative business logic.

- [ ] **Step 1: Write failing tray state tests.**

\`\`\`rust
#[test]
fn tray_label_reflects_actual_recording_state() {
    assert_eq!(tray_label_for_state("recording"), "Meetily — Recording");
    assert_eq!(tray_label_for_state("processing"), "Meetily — Processing meeting");
    assert_eq!(tray_label_for_state("idle"), "Meetily");
}

#[test]
fn tray_actions_never_offer_start_when_recording_is_already_active() {
    let actions = tray_actions_for_state("recording");
    assert!(!actions.iter().any(|action| action.id == "start_recording"));
    assert!(actions.iter().any(|action| action.id == "show_meetily"));
}
\`\`\`

- [ ] **Step 2: Run tests and confirm the pure state helpers are absent.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
cargo test --manifest-path src-tauri/Cargo.toml tray_label_for_state -- --nocapture
\`\`\`

Expected: FAIL because the helpers do not exist.

- [ ] **Step 3: Implement tray presentation helpers and event wiring.**

1. Extract \`tray_label_for_state(state)\` and \`tray_actions_for_state(state)\` as pure functions used by the existing tray menu creation/update code.
2. Map current states exactly: idle → “Meetily”; recording → “Meetily — Recording”; stopping/processing/saving → “Meetily — Processing meeting”; error → “Meetily — Attention needed”.
3. Retain existing show/hide/quit safety behavior. “Show Meetily” must focus the window; “Stop recording” must call the same native recording stop path already used by the UI; do not add automatic recording.
4. Emit/update tray state only from existing authoritative recording events. Home quick-start and sidebar actions show the same labels/status but remain consumers; neither writes tray state directly.
5. Ensure the tray does not expose settings or model credentials in labels/menu text.

- [ ] **Step 4: Run tray tests and core checks.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
cargo test --manifest-path src-tauri/Cargo.toml tray -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml
pnpm run lint
\`\`\`

Expected: PASS.

- [ ] **Step 5: Commit only validated implementation files.**

\`\`\`powershell
git add frontend/src-tauri/src/tray.rs frontend/src-tauri/src/tray_test.rs frontend/src-tauri/src/lib.rs frontend/src/components/AppShell/SidebarActions.tsx frontend/src/app/_components/HomeQuickStart.tsx
git commit -m "feat: align tray with recording presence"
\`\`\`

### Task 6: Migrate remaining secondary states and perform visual/accessibility gate

**Files:**
- Modify: \`frontend/src/components/EmptyStateSummary.tsx\`
- Modify: \`frontend/src/components/PermissionWarning.tsx\`
- Modify: \`frontend/src/components/ModelSettingsModal.tsx\`
- Modify: \`frontend/src/components/DeviceSelection.tsx\`
- Modify: \`frontend/src/components/ConfirmationModel/confirmation-modal.tsx\`
- Create: \`frontend/src/components/ui/GlobalUiAccessibility.test.tsx\`
- Create: \`frontend/src/app/VisualStateMatrix.test.tsx\`
- Modify: \`frontend/messages/*.json\`

**Consumes:** Tasks 1–5 and the earlier settings/sidebar/home/speaker plans.

**Produces:** consistent secondary UI coverage and an explicit visual-state regression matrix.

- [ ] **Step 1: Write failing accessibility and state-matrix tests.**

\`\`\`tsx
it('gives every icon-only action an accessible name and visible status semantics', () => {
  render(<VisualStateMatrix />);
  for (const button of screen.getAllByRole('button')) {
    expect(button).toHaveAccessibleName();
  }
  expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
});

it('renders all critical shell states without raw paths or duplicate toast regions', () => {
  render(<VisualStateMatrix states={['empty', 'loading', 'permission', 'error', 'processing']} />);
  expect(screen.queryByText(/C:\\\\Users\\\\/i)).not.toBeInTheDocument();
  expect(screen.getAllByTestId('sonner-toaster')).toHaveLength(1);
});
\`\`\`

- [ ] **Step 2: Run tests and confirm the state matrix is absent.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/ui/GlobalUiAccessibility.test.tsx src/app/VisualStateMatrix.test.tsx
\`\`\`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Apply primitives to remaining secondary components.**

1. Migrate empty summary, permission warning, model configuration, device selection and confirmation modal one component at a time to \`AppSurface\`, \`AppStatus\`, \`AppDialog\` and \`AppButton\`.
2. Preserve every current action/command and use specific status copy: no model selected, model downloading, device unavailable, permission missing, no summary, destructive confirmation.
3. Replace hard-coded gray/blue/red surface stacks only when an equivalent semantic primitive exists; leave data visualization colors (speaker colors, waveform channels, progress values) intact.
4. Build \`VisualStateMatrix\` as a test-only composition of empty/loading/permission/error/processing states used by home, settings, speakers, import, recovery and update. It must not be included in production routes.
5. Confirm all styles work under light/dark semantic variables and \`--ui-scale\` values 0.8, 1 and 1.2.

- [ ] **Step 4: Run complete automated validation.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/ui src/components/onboarding src/components/system-flows src/app/VisualStateMatrix.test.tsx
pnpm run test:i18n
pnpm run lint
pnpm run build
cargo test --manifest-path src-tauri/Cargo.toml tray -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
\`\`\`

Expected: every command exits 0.

- [ ] **Step 5: Perform desktop visual acceptance checks and commit.**

Run:

\`\`\`powershell
cd D:\meetily\frontend
pnpm run tauri:dev
\`\`\`

Verify manually:

1. Onboarding: first launch, one denied permission, one failed model download and an optional model skip.
2. Idle home, live recording, processing, recovery, import, update available and no-meetings states.
3. Expanded/collapsed sidebar, settings, speakers and a meeting detail all share semantic surfaces and spacing.
4. Light/dark themes and UI scales 80%, 100% and 120% remain readable; reduced motion removes ornamental transitions.
5. Keyboard-only flow: tab order, dialogs, drawer, Escape, focus return and visible focus rings.
6. Tray labels and actions match idle, recording, processing and error state.
7. No absolute local path, meeting content, voice reference, API key or credential appears in user-facing feedback.

Then commit:

\`\`\`powershell
git add frontend
git commit -m "feat: complete Talat-style global UI polish"
\`\`\`

## Acceptance criteria

- All core and secondary Meetily surfaces share one calm, compact, Talat-inspired UI language.
- Onboarding, import, recovery, download and update flows present actual local state and clear next actions.
- The system preserves existing native behavior, commands and local-first privacy boundaries.
- Theme, scale, responsive layout and reduced-motion preferences apply consistently across the app.
- The desktop tray and in-app controls always describe the same recording state.
- The previously excluded Talat features remain absent.

