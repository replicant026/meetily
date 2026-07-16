# Wave 18 / PR-51 Implementation Plan

> **For agentic workers:** superpowers:executing-plans or superpowers:test-driven-development
> **Spec:** docs/superpowers/specs/2026-07-16-postprocess-rust-cjk.md

## Steps

### Step 1 — Branch setup
- [ ] `git fetch fork`
- [ ] `git switch devtest`
- [ ] `git pull --ff-only fork devtest`
- [ ] `git switch -c feature/postprocess-cjk`
- [ ] Push branch: `git push -u fork feature/postprocess-cjk`

### Step 2 — Hardening `is_meaningless_output`
File: `frontend/src-tauri/src/whisper_engine/whisper_engine.rs`

- [ ] Add a `fn is_cjk_char(c: char) -> bool` private helper that returns
      `true` for U+4E00–U+9FFF, U+3400–U+4DBF, U+F900–U+FAFF ranges.
- [ ] Add a `fn cjk_ratio(text: &str) -> f32` private helper.
- [ ] Refactor `is_meaningless_output` to:
      - Compute `cjk_ratio` once.
      - If `cjk_ratio >= 0.5`: skip English pattern loop; only trigger the
        `unique_chars` heuristic when `unique_chars <= 1 && chars_count > 30`.
      - Otherwise keep existing behaviour.
- [ ] Verify the file still parses by reviewing diff carefully (sandbox
      cannot run `cargo check`).

### Step 3 — Fix `apply_contextual_improvements`
File: `frontend/src-tauri/src/audio/post_processor.rs`

- [ ] Add `use once_cell::sync::Lazy;` and `use regex::Regex;` at top.
- [ ] Add a `Lazy<Vec<(Regex, &str)>>` static for compiled contraction
      regexes + their canonical forms.
- [ ] Replace substring-`.replace` loop with regex-based replacement using
      `Regex::replace_all`.
- [ ] Add a `fn match_case(template: &str, original: &str) -> String` helper
      that mirrors the original capitalisation onto the template.
- [ ] Verify the file still parses by reviewing diff carefully.

### Step 4 — Add unit tests
File: `frontend/src-tauri/src/audio/post_processor.rs`

- [ ] Add `#[cfg(test)] mod tests { ... }` block at the bottom of the file.
- [ ] 12 tests:
      1. `clean_repetitive_text("嗯嗯嗯嗯")` → `"嗯嗯嗯嗯"` (NOT empty)
      2. `clean_repetitive_text("啊啊啊啊啊啊啊啊啊啊")` → preserves (10×啊, 30 bytes)
      3. `clean_repetitive_text("uh uh uh")` → `""` (still meaningless)
      4. `clean_repetitive_text("thank you for watching")` → `""` (still meaningless)
      5. `clean_repetitive_text("张三")` → `"张三"` (Chinese name preserved)
      6. `clean_repetitive_text("诸葛亮 诸葛亮 诸葛亮")` → single collapse OK
      7. `apply_contextual_improvements("vacant")` → `"vacant"` (no substitution)
      8. `apply_contextual_improvements("scant")` → `"scant"`
      9. `apply_contextual_improvements("cantilever")` → `"cantilever"`
      10. `apply_contextual_improvements("cant believe")` → `"can't believe"`
      11. `apply_contextual_improvements("张三 said cant")` → `"张三 said can't"`
      12. `apply_contextual_improvements("Cant believe")` → `"Can't believe"` (case preserved)

### Step 5 — Docs
File: `docs/postprocess_zh.md`

- [ ] Add 1-page zh-CN description of the cleanup chain.
- [ ] Link to PR-50 hotwords spec.
- [ ] Link to Wave 12 LLM postprocess spec.
- [ ] List known limits: no semantic fix, no punctuation, no speaker rewrite.

### Step 6 — Verify
- [ ] `git diff --stat` shows ~4 files modified.
- [ ] `git diff` manually reviewed.
- [ ] No new dependencies added.
- [ ] No call-site changes.
- [ ] `git status` clean.

### Step 7 — Commit & push
- [ ] `git add -A`
- [ ] `git commit -m "feat(asr): harden postprocess chain for CJK (PR-51)"`
- [ ] `git push -u fork feature/postprocess-cjk`

### Step 8 — Open PR
- [ ] URL:
      https://github.com/LSY1105/meetily/compare/devtest...feature/postprocess-cjk?expand=1
- [ ] Title: `feat(asr): harden postprocess chain for CJK (PR-51)`
- [ ] Body: Summary / Description / Type of Change / Testing / Documentation / Checklist
- [ ] Mark as draft; user merges manually.