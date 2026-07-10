# Meetily i18n Contributor Guide

> For translators, PR contributors, and code reviewers.

## Translation Workflow

1. **Check the glossary first** — before translating, look up `glossary.md` for `approved` terms
2. **Propose new terms** — if a term is missing, first open a PR adding it to `glossary.md` with status `proposed`
3. **Modify JSON** — update the corresponding JSON file by namespace
4. **Add tests** — unit tests live in `frontend/tests/i18n/`
5. **Run check:i18n** — verify with `pnpm run check:i18n` for missing keys
6. **Open a PR** — label with `i18n` + `translation`

## Key Naming Convention

Format: `{namespace}.{action}.{object}`, all lowercase with underscores.

**Good examples:**
- `recording.start_button`
- `transcript.view_empty_state`
- `summary.regenerate_action`
- `errors.permission_microphone_denied`

**Bad examples:**
- `start` (lacks namespace)
- `recordingStart` (camelCase, not underscore)
- `transcript.view.empty` (overly nested)

## Adding a New Namespace

1. Create `frontend/locales/en-US/<name>.json` and `frontend/locales/zh-CN/<name>.json`
2. Update `loadMessages` in `frontend/src/i18n/request.ts` to add an import
3. Run `pnpm run check:i18n` to verify

## Handling Missing Keys

- **Dev environment:** Console warns but does not block
- **CI:** `pnpm run check:i18n` fails; PR merge is blocked
- **Runtime fallback:** Falls back to English (see spec §4.4)

## Reviewer Requirements

- At least 1 Chinese native-speaker reviewer approval (for translation content)
- At least 1 maintainer approval (for the PR as a whole)
- Glossary changes must be linked in the JSON update PR