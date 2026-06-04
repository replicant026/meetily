# Next-release manual test: 4 findings (1 blocker)

Manual testing of the `devtest` branch (`bc55119`) on macOS surfaced four issues. The first is a
release blocker; the rest are worth fixing. File/line references are against `devtest`.

| ID | Severity | Area | Summary |
|----|----------|------|---------|
| S-1 | **High** | Multilingual summary | Summary stays in transcript's source language when a different target is selected |
| R-1 | Medium | Recovery / app lifecycle | Recovery dialog intermittently missed on the first relaunch after a crash/quit during recording (15s freshness filter + run-once scan) |
| M-1 | Medium | Privacy / analytics | User agent still transmitted via `os_version` |
| U-1 | Low | UX | Pinned summary-language default not signposted as new-meeting-only |

**Environment:** `devtest` (`bc55119`), macOS (Metal), local model. Analytics enabled only where noted.

---

## S-1 [High] — Summary stays in the transcript's source language when a different target is selected

**Describe the bug**
When the transcript is non-English, the generated summary comes out in the transcript's **source
language** even when a different summary language is explicitly selected.
Example: **Japanese** transcript + summary language set to **Hindi** → summary generated in
**Japanese**.

**Steps to reproduce**
1. Open a meeting with a non-English transcript (e.g. Japanese).
2. Set the summary language to **Hindi** (or even **English**).
3. Generate the summary.

Observed: summary is in Japanese. Expected: summary in the selected target language.

**Root cause**
The two-pass pipeline assumes pass-1 produces an English base, but the **pass-1 prompts never
instruct the model to write in English** (`frontend/src-tauri/src/summary/processor.rs` — chunk
prompt ~L298, final prompt ~L395–411). For a non-English transcript the model summarizes in the
source language, and that output is labeled `english_markdown` / cached as `cached_english`.
Translation only runs when the target ≠ English (`processor.rs:455`):
- target = **English** on a non-English transcript → no translation → source-language summary returned.
- target = **non-English** (e.g. Hindi) → `translate_markdown` is fed source-language text instead
  of English; a local model may echo the source back (returns `Ok`, so no error surfaces).

This also undermines the "cache English summary" optimization — the cached base isn't actually
English for non-English transcripts.

**Suggested fix**
Force pass-1 output to English (add an explicit "write the report in English regardless of the
transcript's language" instruction to the pass-1 prompts) so pass-2 is reliably English→target —
or summarize directly in the target language. Optionally guard when the translated output's
detected language ≠ target.

---

## R-1 [Medium] — Recovery dialog intermittently missed on the first relaunch after a crash/quit during recording

**Describe the bug**
After fully quitting the app (Cmd+Q / app menu / tray Quit — the process actually terminates) or
crashing **while recording**, relaunching the app **sometimes** does *not* show the recovery
dialog for the interrupted session. Quitting and relaunching a second time *does* show it, with the
lost transcript. So recovery is effectively delayed by one launch. The "sometimes" is the tell:
it's timing-dependent.

> Note: this supersedes an earlier hypothesis that framed R-1 as a tray-hide/no-remount issue.
> Manual testing shows the failing path is a *full quit* (where React **does** remount), so the
> root cause is the recovery filter below, not the window lifecycle.

**Steps to reproduce**
1. Start a recording; let a few transcripts appear.
2. Fully quit the app while still recording (Cmd+Q / force-quit / crash) — the process terminates.
3. Relaunch the app **quickly** (within ~15 s).

Observed: no recovery dialog. Quit again and relaunch (now well past 15 s) → dialog appears with
the interrupted session. Expected: dialog on the first relaunch.

**Root cause**
Two behaviours combine:

1. **15-second freshness filter.** `checkForRecoverableTranscripts()` drops any meeting whose
   `lastUpdated` is newer than 15 s (`frontend/src/hooks/useTranscriptRecovery.ts:50,54` —
   `secondsAgo` / `isOldEnough = m.lastUpdated < secondsAgo`). During recording the meeting is
   seeded with `lastUpdated = now` (`frontend/src/contexts/TranscriptContext.tsx:112-120`) and
   **every transcript write refreshes `lastUpdated` to `now`**
   (`frontend/src/services/indexedDBService.ts:259`). So a crashed session's `lastUpdated` ≈ the
   moment of the crash. If relaunch + Home mount happens within ~15 s of that, the meeting is
   filtered out and the scan returns an empty list → no dialog.
2. **Run-once scan.** The scan runs only on React mount of Home
   (`frontend/src/app/page.tsx:71-107`; sole caller at L100). There is no polling, focus re-check,
   or re-scan. So even waiting past 15 s on the Home screen won't help — only a fresh mount on the
   *next* launch (now > 15 s later) re-runs the scan and surfaces the session.

The 15 s window was added to hide the *current* session during the normal stop→save handoff
(comment at `useTranscriptRecovery.ts:47-48`). But it also suppresses a *crashed prior* session on
a fast relaunch, and the run-once scan turns that transient suppression into a whole-session miss.
The data is never lost (`savedToSQLite === false` keeps it, `indexedDBService.ts:154`) — it just
isn't surfaced until a later launch.

**Is it macOS-specific?** No. The logic lives in shared TypeScript (`useTranscriptRecovery.ts` /
`page.tsx`), so it affects every platform. It only *looks* platform-specific because reproduction
depends on whether the relaunch-to-scan time lands under 15 s, which varies with cold-start and
relaunch speed.

**Suggested fix (implemented)**
Removed the 15 s `isOldEnough` filter in `frontend/src/hooks/useTranscriptRecovery.ts` so the scan
keeps only the 7-day retention window and relies on `savedToSQLite === false` (already applied by
`getAllMeetings`, `frontend/src/services/indexedDBService.ts:154`) to exclude the saved/current
session. This matches **Meetily Pro**, whose recovery path has no such recency filter — its
`getAllMeetings` (`indexedDBService.ts:280-304`) filters on `!savedToSQLite` only, and its hook
(`useTranscriptRecovery.ts:50-63`) does no `lastUpdated` comparison.

It is safe because the just-stopped session is marked saved before the dialog can re-appear:
`markMeetingAsSaved()` → `markMeetingSaved()` (`frontend/src/hooks/useRecordingStop.ts:297`,
`frontend/src/contexts/TranscriptContext.tsx:502`) is awaited *before* the stop flow leaves the
`SAVING` state (`setStatus(COMPLETED)` at `useRecordingStop.ts:323`), and the startup scan is
skipped while recording/processing (`page.tsx:76-82`). So by the time the scan can run again
(status `COMPLETED`/`IDLE`) the meeting is already `savedToSQLite === true` and excluded. A crashed
session — which is never marked saved — now surfaces on the **first** relaunch instead of being
hidden for 15 s.

As belt-and-suspenders, an **id-based insurance guard** was added to the scan: it skips the meeting
whose id equals `sessionStorage['indexeddb_current_meeting_id']` — the live, not-yet-saved current
session (set at recording start, `TranscriptContext.tsx:102`; cleared once persisted,
`TranscriptContext.tsx:506` / `useRecordingStop.ts:303`). This is the precise version of what the
removed 15 s heuristic approximated (it revives the `just_saved_meeting_id`-style guard that commit
`3dc625b` added and commit `24c9bc8` later stripped). Because it lives in `sessionStorage`, it does
**not** survive a crash/quit, so a crashed session has no active id on relaunch and still surfaces —
it only suppresses the in-flight session during the stop→save window, never a recoverable one.

Behavioural note (save failure): if a save *fails* (the `SAVING` path throws,
`useRecordingStop.ts:398-405`), the error path returns *before* the active id is cleared, so the
id guard keeps the unsaved meeting hidden for the rest of that session (it is still the "current"
meeting) — which avoids a jarring recovery prompt right after the save-error toast. The data is
preserved (`savedToSQLite` stays `false`) and the meeting surfaces for recovery on the next launch
(when `sessionStorage` is cleared) or once a different meeting becomes the active session. This
matches the pre-fix outcome (the old 15 s filter likewise hid it for the session), so it is not a
regression.

---

## M-1 [Medium] — User agent still transmitted via `os_version`

**Describe the bug**
Analytics now has a sensitive-key denylist (`frontend/src-tauri/src/analytics/analytics.rs:9-23`,
including `user_agent`, `device_name`, etc.) — good. But the user agent still reaches PostHog
because it is embedded in the **value** of the `os_version` property, whose **key** isn't in the
denylist.

**Details**
`getOSVersion()` returns `` `${platform} (${navigator.userAgent})` `` (`frontend/src/lib/analytics.ts:255-260`),
e.g. `"macOS (Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ...)"`. This is
sent as `os_version` on `session_started`, `meeting_completed`, and other events when analytics is
enabled. The denylist (`sanitize_analytics_properties`) only filters by key name, so `os_version`
passes through with the UA intact. (Note: only sent when analytics is enabled.)

**Suggested fix**
Coarsen `os_version` to a real OS version without `navigator.userAgent`, or value-scrub it in the
sanitizer (the denylist is key-name-only today).

---

## U-1 [Low] — Pinned summary-language default not signposted as new-meeting-only

**Behavior (works as designed, UX gap)**
Pinning a default summary language seeds only **new** meetings (recording stop / import /
recovery, via `applyPinnedSummaryLanguageToMeeting`). Existing meetings keep their own saved
language or fall back to Auto (`resolveSummaryLanguage` precedence: per-meeting → cached-detected →
auto-detect). This is correct, but there is no UI hint that the default applies only to new
meetings, which reads as a bug to users.

**Suggested improvement**
Add a short hint near the default-language setting/picker clarifying it applies to newly created
meetings, not existing ones.
