# PR-42-iv-a implementation plan

Branch: `feature/llm-postprocess-tests`
Spec: docs/superpowers/specs/2026-07-18-llm-postprocess-tests.md

## Steps

1. Extract `render_user_prompt` helper (2-line refactor of `build_user_prompt`)
   so it can be tested without touching the global `post_processor` state.
   - Input: `system_prompt: &str`, `glossary: Option<&str>`, `source: &str`
   - Output: combined prompt string
   - Caller: `build_user_prompt(text)` reads the hotword list once and
     passes it as `glossary` argument

2. Add `[dev-dependencies] rusqlite = { version = "0.31", features =
   ["bundled"] }` to `frontend/src-tauri/Cargo.toml`. Bundle keeps CI
   hermetic (no system sqlite dependency on Linux runners).

3. Add tests inside `#[cfg(test)] mod tests` in `llm_postprocess.rs`,
   grouped by function:
   - `is_cjk`: 4 tests
   - `should_skip_for_length`: 6 boundary tests
   - `build_glossary_block`: 1 ordering test
   - `render_user_prompt`: 4 tests
   - `correct_segment` (negative paths via `#[tokio::test]` + in-memory
     SQLite): 2 tests

4. Wire `#[tokio::test]` macro. The crate already declares
   `tokio = { ..., features = ["full", "tracing"] }` so the `rt` and
   `macros` features are available; no extra config needed.

5. Run `cargo test -p meetily --lib llm_postprocess::tests` locally to
   confirm green. The crate uses `tauri::async_runtime::spawn` in
   production; we deliberately avoid calling it from tests and exercise
   `correct_segment` directly to keep tests sync.

6. Commit, push (or fall back to manual merge via fork if push 403
   persists), then merge to devtest.

## Risks

- **In-memory SQLite fixture cost**: `rusqlite` bundled adds ~3 MB to the
  dev build. Acceptable; dev dependencies are not shipped.
- **`tokio::test` runtime mismatch**: `tauri::async_runtime` uses a
  single-thread runtime in production. `#[tokio::test]` defaults to a
  current-thread runtime which is what `correct_segment` needs (no
  blocking inside). No compatibility issue expected.
- **Test ordering with global `APP` OnceLock**: tests that touch
  `correct_segment` rely on the SQLite fixture rather than the global
  AppHandle, so the OnceLock state is irrelevant. Documented in a comment.

## Rollback

Single-file revert of `llm_postprocess.rs` plus removal of the
`rusqlite` dev-dependency. No production code change.
