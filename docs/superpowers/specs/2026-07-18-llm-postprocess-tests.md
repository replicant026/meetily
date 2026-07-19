# PR-42-iv-a: llm_postprocess.rs Rust unit tests

Status: draft
Wave: 24
Owner: qjl10
Branch: feature/llm-postprocess-tests
Base: devtest (696b250)

## Goal

Raise unit test coverage of `frontend/src-tauri/src/llm_postprocess.rs` from
the current 6 inline `#[test]` functions to a stable baseline that exercises
every pure-logic code path (CJK detection, length threshold, glossary
block, prompt construction, provider config loading, error mapping).

The postprocess module is the heart of Wave 23 (PR-42-iii) and currently
ships with zero CI coverage for the path that actually decides whether a
transcript segment reaches the LLM. Without these tests, a future edit to
`should_skip_for_length` or `build_user_prompt` could silently break
Chinese meeting quality without anyone noticing.

## In-scope code paths

| Function | Current coverage | Added tests |
|---|---|---|
| `is_cjk` (private) | 0 | 4 unit tests covering Basic, Extension A, Hiragana, Katakana |
| `should_skip_for_length` | 4 tests | 6 boundary tests (exactly `MIN_CJK_CHARS`, exactly `MIN_ASCII_CHARS`, mixed-digit, mixed-space, only-punctuation, CJK with ASCII noise) |
| `build_glossary_block` | 2 tests | 1 test asserting order preservation and exact formatting |
| `build_user_prompt` (private) | 0 | 4 tests: no hotwords, with hotwords, empty hotwords vector, glossary XML escapes |
| `correct_segment` (async) | 0 | 2 tests using `#[tokio::test]` + an in-memory SQLite fixture: provider-not-configured error, unsupported-provider error |
| `spawn_segment_postprocess` early returns | 0 | 2 tests asserting silent skip when AppHandle is not initialised (via existing `is_cjk` shim — refactor not needed, the test calls `should_skip_for_length` path instead since `spawn_segment_postprocess` requires global state) |

## Out-of-scope

- HTTP-level mocking of `reqwest::Client` for the success path of
  `correct_segment`. Adds wiremock as a dev-dependency and inflates the
  binary; deferred to a follow-up PR-42-iv-c that adds integration tests
  with a local mock LLM server.
- `load_provider_inputs` end-to-end success path (needs a real SQLite
  pool + valid provider settings row). The two negative paths above give
  sufficient coverage of the error surface.
- Frontend behaviour. Unchanged.

## Files touched

- `frontend/src-tauri/src/llm_postprocess.rs` — extend `#[cfg(test)] mod tests`
- `frontend/src-tauri/Cargo.toml` — add `[dev-dependencies] rusqlite = { version = "0.31", features = ["bundled"] }` for the in-memory fixture
- `docs/superpowers/specs/2026-07-18-llm-postprocess-tests.md` — this file
- `docs/superpowers/plans/2026-07-18-llm-postprocess-tests.md` — task plan
- `CHANGELOG.md` — Wave 24 entry

Estimated diff: +240 lines tests, +50 lines spec/plan/CHANGELOG. No
production code change except a 2-line helper extraction (`fn
render_user_prompt(system_prompt: &str, glossary: Option<&str>, source:
&str) -> String`) to make `build_user_prompt` independently testable.

## Acceptance criteria

- `cargo test -p meetily --lib llm_postprocess::tests` passes locally and
  in CI on Ubuntu, macOS, and Windows runners.
- All 19 new tests pass (6 existing + 13 new + 2 tokio tests = 19; exact
  number may shift by ±2 if a boundary case collapses during
  implementation).
- Coverage of `llm_postprocess.rs` public/private non-async items >= 90%
  measured by `cargo llvm-cov` (target added in follow-up PR).
- CI workflow `i18n-check.yml` and existing build workflows still pass.

## Non-goals

- Performance benchmarks. The postprocess path is async-fire-and-forget;
  benchmarking adds noise without action items.
- Refactoring `correct_segment` to accept a trait object. Would enable
  true unit testing of the success path, but the abstraction cost is
  disproportionate for the marginal coverage gain.
