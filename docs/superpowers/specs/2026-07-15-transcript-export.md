# Wave 16: Transcript Export (PR-49)

> **Parent:** PR-48 real-time processing progress UI
> **Target branch:** devtest

## Background

Meeting details currently support copying a transcript to the clipboard, but users need files they can archive, share, or continue editing. Pagination also means the visible list may contain only part of a long meeting.

## Goals

- Add a transcript export menu to the meeting-details transcript toolbar.
- Export all transcript segments, not only the currently loaded page.
- Provide Markdown (`.md`) and Word-compatible DOCX (`.docx`) downloads.
- Preserve recording-relative timestamps when available and fall back to the stored timestamp for legacy segments.
- Include optional raw speaker labels when the transcript data supplies them.
- Localize export labels and result messages for all six supported locales.

## Non-Goals

- Changing transcript data or writing exported files into the meeting database.
- Adding a native save-dialog or Rust dependency.
- Exporting AI summaries from this menu.
- Persisting local speaker-name overrides into transcript data.

## Scope (PR-49, 1 commit)

| File | Change |
|---|---|
| `frontend/src/lib/transcript-export.ts` | format Markdown and generate a dependency-free DOCX package |
| `frontend/src/hooks/meeting-details/useCopyOperations.ts` | fetch all segments and trigger downloads |
| `frontend/src/components/MeetingDetails/TranscriptButtonGroup.tsx` | add the Markdown/DOCX export menu |
| `frontend/src/components/MeetingDetails/TranscriptPanel.tsx` | forward the export callback |
| `frontend/src/app/meeting-details/page-content.tsx` | connect page-level export handling |
| `frontend/locales/*/transcript.json` | add export labels and result messages |
| `docs/superpowers/specs/2026-07-15-transcript-export.md` | this spec |

## Design

The export path reuses the existing `fetchAllTranscripts` helper already used by the Copy action. It calls the existing transcript API through the current frontend service boundary; no SQL or new database access logic is introduced.

DOCX generation uses a minimal uncompressed Open Packaging Convention ZIP containing the content-types manifest, package relationships, and a Word document XML part. This keeps the feature self-contained and avoids adding a new runtime dependency.

## Acceptance

- [ ] Export menu offers Markdown and DOCX.
- [ ] Both formats include all fetched transcript segments.
- [ ] Relative timestamps and optional raw speaker labels are preserved.
- [ ] Filenames are sanitized and use the meeting title.
- [ ] Empty and failed exports show localized feedback.
- [ ] All six locales contain the export strings.
- [ ] Markdown formatter smoke test passes.
- [ ] DOCX ZIP smoke test passes.
- [ ] `pnpm check:i18n` passes.
- [ ] `pnpm test:i18n` passes (19/19).
- [ ] `pnpm build` succeeds (11 routes).

## Risks

| Risk | Mitigation |
|---|---|
| Long meeting export loads many rows | Reuse the existing single full-page fetch used by Copy |
| Browser download API is unavailable | Catch the export error and show localized failure feedback |
| DOCX package is malformed | Keep the package minimal and verify the ZIP signature in a smoke test |
| Legacy segments lack relative timestamps | Fall back to the stored timestamp string |

## Follow-up

A future native save-dialog integration can replace browser downloads without changing the formatters or export menu contract.