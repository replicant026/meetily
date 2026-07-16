# Wave 18 / PR-52: Hotword Highlight + Click-to-Copy in Transcript View

> **For agentic workers:** superpowers:subagent-driven-development or superpowers:executing-plans.
> **Base branch:** devtest
> **Parent PR:** PR-50 (hotword settings) shipped 2026-07-15. This PR is the **UI closure** of that work.

## Background

PR-50 added a settings UI where users can type up to 500 chars of
project / company / person names as a free-form hotword list, stored via
Tauri Store (`frontend/src-tauri/src/transcription_preferences.rs`). The
list is plumbed into `whisper_engine::transcribe_audio_with_confidence`
via `params.set_initial_prompt` (PR-50 wiring).

PR-50 ships the **engine** side but no **frontend affordance** to verify
which words in the live transcript were actually matched. Users have no
visual signal that their hotword investment is being used, and have no
quick way to copy a hotword (e.g. to send it to a colleague) without
manually retyping from settings.

## Goals

- Surface hotword matches inline in the live / historical transcript view.
- One click on a highlighted hotword copies it to the clipboard, with a
  toast confirmation.
- All 6 locales (en-US, en-GB, zh-CN, zh-TW, ja-JP, ko-KR) get the new
  keys, kept consistent by `check:i18n` + `test:i18n`.
- No backend / Rust / Tauri changes. No new dependencies.

## Non-Goals

- Not changing how hotwords are stored or transmitted to whisper.cpp
  (PR-50 covers that).
- Not adding hover tooltips, right-click menus, or per-word editing.
- Not adding a "highlight colour" preference (single CSS class).
- Not making hotword list editable from the transcript view (settings
  page is still the single source of truth).
- Not changing `VirtualizedTranscriptView` internal logic beyond
  wrapping the `displayText` string with `<mark>` highlights.

## Scope

| File | Change | Lines |
|------|--------|-------|
| `frontend/src/hooks/useHotwords.ts` (new) | Reads `get_transcription_hotwords`; returns a memoised list of `{value, regex}[]` | ~40 |
| `frontend/src/components/TranscriptView.tsx` | Render `displayText` via `wrapHotwords(text, list)` helper | ~10 |
| `frontend/src/components/VirtualizedTranscriptView.tsx` | Same wrapping (single line wrap call) | ~5 |
| `frontend/locales/*/transcript.json` (× 6) | Add `view.hotword_highlight_tooltip` and `view.hotword_copy_success` | ~6 each |
| `frontend/locales/*/transcript.json` (× 6) | Add `settings.hotword_count_label` | ~6 each |
| `docs/hotword_highlight.md` (new) | 1-page zh-CN doc explaining the feature | ~50 |

**Total estimated diff: ~120 insertions, ~20 deletions** (well under the
"50 lines" rule per logical change).

## Algorithm

```ts
// 1. Parse hotword string (from settings) into an array of {value, regex}.
//    - Split by newline OR by 1+ whitespace runs.
//    - Trim each entry, drop empties.
//    - Build a *case-insensitive* `RegExp` per entry with Unicode escapes
//      so Chinese chars work without `\b` (which is ASCII-only).
//    - Memoised by content hash so identical settings produce the same list.
//
// 2. Render text with highlights.
//    `wrapHotwords(text, list)` walks the text, finds the leftmost match
//    from any rule, and returns an array of React nodes alternating
//    plain text and `<mark data-hotword="<value>">` clicks.
//    `<mark>` carries `onClick` -> `navigator.clipboard.writeText(value)`.
//
// 3. Toast.
//    On successful copy, dispatch `toast.success(transcript.view.hotword_copy_success)`.
```

### Why not just regex over the whole string?

Building a single global regex (e.g. `/(foo|bar|张三|...)/gi`) and using
`String.prototype.split` works for *display*, but loses the original
matched value (case info, original hotword string), which we need to
copy. Walking entries one by one is simpler and bounds memory: the
hotword list is at most 500 chars, so at most ~50 entries.

### Why memoisation?

The hotword list changes rarely (only when the user saves in settings).
Without memoisation, every transcript re-render would re-parse the
string and re-build the regex list. Cheap, but pointless.

## UX Notes

- Highlight style: yellow background, no border. Defined inline in the
  `wrapHotwords` helper so both `TranscriptView` and
  `VirtualizedTranscriptView` pick it up automatically.
- Cursor: `cursor-pointer` on `<mark>` so it looks clickable.
- Title attribute (`data-hotword`) is the original hotword value (e.g.
  `张三`), giving users a hover affordance without a tooltip widget.
- Toast: `hotword_copy_success` keys via i18n. Falls back to zh-CN if
  a locale misses the key (existing `useTranslations` behaviour).

## Acceptance

- [ ] `useHotwords` hook loads + memoises the list on first render.
- [ ] Live transcripts (`TranscriptView`) and historical list
      (`VirtualizedTranscriptView`) both render `<mark>` for matches.
- [ ] Click on a `<mark>` writes the original hotword to clipboard and
      shows the success toast.
- [ ] All 6 locales have `view.hotword_highlight_tooltip`,
      `view.hotword_copy_success`, `settings.hotword_count_label` keys.
- [ ] `pnpm check:i18n` and `pnpm test:i18n` pass.
- [ ] `pnpm build` succeeds.
- [ ] `docs/hotword_highlight.md` exists.
- [ ] No new dependencies.
- [ ] No backend / Rust / Tauri changes.

## Risks

| Risk | Mitigation |
|------|-----------|
| Chinese regex `\b` doesn't work | Use plain `RegExp(value, 'gi')` — no `\b`; matches the user-typed substring verbatim |
| Hotword list very large (500 chars) | Walk entries one at a time; `O(n × m)` is fine for n=50, m=200 |
| User clicks during streaming, text mid-edit | Clipboard write is independent of transcript state; safe |
| Two hotwords overlap (e.g. `张` and `张三`) | Greedy leftmost-wins: `张三` declared first wins; document in `docs/hotword_highlight.md` |