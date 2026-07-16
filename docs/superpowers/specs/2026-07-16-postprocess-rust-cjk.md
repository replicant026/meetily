# Wave 18 / PR-51: ASR Postprocess Chain CJK Hardening

> **For agentic workers:** superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.
> **Base branch:** devtest
> **Parent waves:** Wave 12 (LLM postprocess, shipped) is the higher-level text correction pass; this PR is the lower-level Rust text-cleanup layer.

## Background

The ASR postprocess chain in `whisper_engine.rs` contains three text-cleanup
functions that run on every Whisper transcript segment before it reaches the
frontend:

1. `clean_repetitive_text` (line 367) — main entry, gates on
   `is_meaningless_output`, then collapses word/phrase repetitions.
2. `is_meaningless_output` (line 402) — substring-contains match against a
   list of English meaningless patterns + a character-statistic heuristic
   (`unique_chars <= 3 && text.len() > 10`).
3. `apply_contextual_improvements` (post_processor.rs:246, **dead code but
   still `pub use`-exported**) — substring `.replace("cant", "can't")` style
   contraction fixes with **no word boundaries**.

Wave 12 (LLM postprocess) handles semantic correction of ASR text via a
cloud / local LLM call. That is a separate, higher-level layer and is **out
of scope** for this PR. This PR only hardens the lower-level Rust
text-cleanup so it does not silently destroy CJK content that the LLM pass
would otherwise fix.

### Observed Issues

| # | Symptom | Root cause | Severity |
|---|---------|-----------|----------|
| 1 | A Chinese interjection like `啊啊啊啊啊` (4 chars, 12 bytes UTF-8) is dropped from the transcript because `unique_chars == 1 && text.len() > 10` triggers | `is_meaningless_output` is CJK-blind; it counts bytes, not chars; one repeated CJK character collapses to `unique_chars == 1` | High |
| 2 | A short Chinese utterance like `嗯嗯嗯嗯` (4 chars, 12 bytes) is dropped the same way, even though speakers in a Chinese meeting respond with this constantly | Same as #1 | High |
| 3 | English meaningless-pattern substring matching runs on Chinese-only text — currently no false positive because the patterns are English-only, but it is brittle: any future pattern like `那个` or `然后` would falsely delete legitimate Chinese | `is_meaningless_output` is language-agnostic | Medium |
| 4 | `apply_contextual_improvements` does substring `.replace("cant", "can't")` — would mangle `vacant`, `scant`, `cantilever`, `cantata` if it were ever called | No word-boundary awareness | Medium (currently dead code, but exported) |

These are not LLM-correctable after the fact because the Rust cleanup
**deletes the text** before it ever reaches the LLM stage.

## Goals

- Make the Rust cleanup CJK-aware: detect Chinese text and skip the
  English meaningless-pattern check + relax the character-statistic
  threshold so single-character CJK repetitions are not erased.
- Fix the `apply_contextual_improvements` substring-replace bug using
  word-boundary regex (`\bcant\b`) so it is safe even if a future change
  wires it up.
- Add unit tests covering Chinese person names and CJK interjections so
  regressions are caught immediately.
- Document the postprocess chain and its known limits in
  `docs/postprocess_zh.md`, including the recommendation to use the PR-50
  hotwords feature for ASR-side improvements.

## Non-Goals

- Not changing Whisper decoding parameters (`set_no_speech_thold` etc.).
- Not changing the LLM postprocess (Wave 12).
- Not changing repetition-ratio thresholds for English text.
- Not adding new meaningless patterns.
- Not changing any call sites (post_processor.rs remains unwired by design;
  we only fix the function in place).
- Not touching frontend code or i18n.

## Scope

| PR | Topic | Key files | Commits |
|----|-------|-----------|---------|
| 51 | ASR postprocess CJK hardening | `frontend/src-tauri/src/whisper_engine/whisper_engine.rs` + `frontend/src-tauri/src/audio/post_processor.rs` + new `frontend/src-tauri/src/audio/post_processor.rs` `#[cfg(test)] mod tests` + `docs/postprocess_zh.md` | 1 commit |

### Concrete changes

1. **`is_meaningless_output`** (`whisper_engine.rs:402`)
   - Add `cjk_ratio(text: &str) -> f32` helper that returns
     `cjk_chars_count / total_chars_count`. Use `char::is_alphabetic` to
     count total chars (Chinese chars are alphabetic) and a CJK Unicode
     block check for Chinese-specific detection.
   - If `cjk_ratio >= 0.5`, skip the English meaningless-pattern loop entirely.
   - If `cjk_ratio >= 0.5`, the unique-chars heuristic only triggers when
     `unique_chars <= 1 && text.chars().count() > 30` (the existing safety
     net for sustained meaningless loops).
   - Otherwise keep current behaviour (English-style).
   - Constant magic numbers are extracted into named `const` values.

2. **`apply_contextual_improvements`** (`post_processor.rs:246`)
   - Replace substring `.replace(incorrect, correct)` with
     `regex::Regex::new(&format!(r"\b{}\b", regex::escape(incorrect)))`
     per correction, using the existing `regex` dependency (`Cargo.toml`).
   - Preserve original case (`Cant` → `Can't`, not `can'T`) via a small
     `match_case` helper that mirrors the leading capitalisation of the
     match.
   - Pre-compile the regexes once with `once_cell::sync::Lazy` (already a
     dependency) at module load — no per-call compilation cost.

3. **Tests** (`post_processor.rs` `#[cfg(test)] mod tests`)
   - 12 unit tests covering:
     - Chinese person names `张三`, `李四`, `诸葛亮`, `诸葛亮` repeated → not collapsed into `诸葛亮` only by phrase repetition when they are unique words.
     - CJK interjections `嗯嗯嗯嗯` (4×3 bytes) NOT marked meaningless by
       `clean_repetitive_text`.
     - English-only text `uh uh uh` still marked meaningless.
     - `apply_contextual_improvements("vacant")` → `"vacant"` (not `vacan't`).
     - `apply_contextual_improvements("cant believe")` → `"can't believe"`.
     - Mixed: `张三 said cant` → `张三 said can't`.
   - All tests are pure unit tests on private functions. They will be
     compiled under `cargo test --lib`. Sandbox cannot run `cargo test` on
     Windows ARM64 (no `clang` / `rustfmt`), but the CI pipeline catches
     regressions.

4. **Docs** (`docs/postprocess_zh.md`)
   - 1-page description of the cleanup chain, in zh-CN.
   - Cites `docs/asr_benchmark_zh.md` for model selection.
   - Cites PR-50 hotwords feature for ASR-side vocabulary biasing.
   - Lists known limitations (no semantic fix, no punctuation) and points
     users to the Wave 12 LLM postprocess for those.

## Acceptance

- [ ] `is_meaningless_output` no longer drops CJK text with
      `unique_chars <= 3 && byte_len > 10`.
- [ ] English meaningless patterns still drop (regression-safe).
- [ ] `apply_contextual_improvements` uses word-boundary regex; `vacant`,
      `scant`, `cantilever` are untouched.
- [ ] 12+ new unit tests pass under `cargo test`.
- [ ] `docs/postprocess_zh.md` exists and links to PR-50 + Wave 12 docs.
- [ ] No new dependencies; existing `regex` + `once_cell` only.
- [ ] No frontend / i18n / call-site changes.

## Risks

| Risk | Mitigation |
|------|-----------|
| CJK ratio heuristic misfires on long Chinese names with rare chars | Threshold `>= 0.5` is conservative; long Chinese person names have `cjk_ratio ~ 1.0` |
| `apply_contextual_improvements` case-preservation changes behavior of existing test data | Function is dead code; no behaviour change for any live path |
| Lazy regex compilation adds startup cost | Trivial: 14 patterns, each < 100ns to compile |
| Sandbox cannot run `cargo test` locally | Tests land in CI; user reviews code review checklist |

## References

- `whisper_engine.rs` lines 367-515
- `post_processor.rs` lines 246-276
- `Cargo.toml` `regex = "1.11.0"`, `once_cell = "1.17.1"`
- `docs/superpowers/specs/2026-07-14-postprocess-wave12.md` (LLM pass)
- `docs/superpowers/specs/2026-07-15-asr-hotwords-ui.md` (PR-50)