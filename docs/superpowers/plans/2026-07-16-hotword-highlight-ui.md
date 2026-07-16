# Wave 18 / PR-52 Implementation Plan

> **Spec:** docs/superpowers/specs/2026-07-16-hotword-highlight-ui.md
> **Base branch:** devtest

## Steps

### 1. Branch setup
- [x] `git switch -c feature/hotword-highlight-ui` (already on it)

### 2. Implement `useHotwords` hook
File: `frontend/src/hooks/useHotwords.ts` (new)

```ts
'use client';
import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface HotwordRule { value: string; regex: RegExp; }

export function useHotwords(): HotwordRule[] {
  const [raw, setRaw] = useState<string>('');
  useEffect(() => {
    invoke<string | null>('get_transcription_hotwords')
      .then((v) => setRaw(v ?? ''))
      .catch(() => setRaw(''));
  }, []);
  return useMemo(() => parseHotwords(raw), [raw]);
}

function parseHotwords(raw: string): HotwordRule[] {
  return raw
    .split(/[\r\n]+|\s{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((value) => ({ value, regex: new RegExp(escapeRegExp(value), 'gi') }));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

### 3. Wrap helper
File: `frontend/src/components/TranscriptView.tsx` (top of file, after imports)

```ts
function wrapHotwords(text: string, rules: HotwordRule[], onCopy: (v: string) => void): React.ReactNode {
  if (rules.length === 0) return text;
  // Walk rules, find leftmost match in remaining text, advance.
  // Implementation: greedy per-char walker; for each position, find the
  // earliest matching rule. Trivial O(n * rules) because n <= ~200,
  // rules <= ~50.
  ...
}
```

Same helper used in `VirtualizedTranscriptView.tsx`. To avoid duplication,
export from `TranscriptView.tsx` (or new `frontend/src/lib/wrapHotwords.ts`).
**Decision: new `frontend/src/lib/wrapHotwords.ts`** to keep the helper
testable and importable from both views.

### 4. Wire up clicks + toast
Both `TranscriptView` and `VirtualizedTranscriptView` import `useHotwords`
+ `wrapHotwords` + `toast`. On `<mark>` click, `wrapHotwords` invokes
the supplied `onCopy(value)` callback which writes to clipboard and
dispatches the success toast.

### 5. i18n keys
For each of `en-US`, `en-GB`, `zh-CN`, `zh-TW`, `ja-JP`, `ko-KR` in
`frontend/locales/*/transcript.json`:
- `view.hotword_highlight_tooltip` (en: "Hotword from your list")
- `view.hotword_copy_success` (en: "Copied: {value}")
- `settings.hotword_count_label` (en: "{count, plural, one {# hotword} other {# hotwords}}")

Run `pnpm check:i18n && pnpm test:i18n` to confirm parity.

### 6. Doc
File: `docs/hotword_highlight.md` (new) — zh-CN, ~50 lines.

### 7. Verify
- [ ] `pnpm check:i18n` passes
- [ ] `pnpm test:i18n` passes
- [ ] `pnpm build` passes

### 8. Commit + push
- [ ] `git add -A`
- [ ] `git commit -m "feat(ui): highlight hotwords in transcript view (PR-52)"`
- [ ] `git push -u fork feature/hotword-highlight-ui`

### 9. PR
- URL: https://github.com/LSY1105/meetily/compare/devtest...feature/hotword-highlight-ui?expand=1
- Title: `feat(ui): highlight hotwords in transcript view (PR-52)`