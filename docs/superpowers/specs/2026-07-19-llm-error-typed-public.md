# PR-43: typed LLMError propagates to processor / failover public API

Status: ready-for-implementation
Wave: 26
Owner: qjl10
Branch: feature/llm-error-typed-public
Base: devtest (596d502)
Depends on: PR-42-iv-c (Wave 24, 4885ce9)

## Goal

PR-42-iv-c introduced `LLMError` as the public error type of
`generate_summary`, but left `processor.rs` and `failover.rs` with
`Result<_, String>` at their public boundaries to minimise the diff
in that PR. This PR closes the gap: every summary-path function
returns `Result<_, LLMError>`, removing the four `.map_err(|e| e.to_string())`
adaptations PR-42-iv-c left behind.

The DB layer (`summary::service.rs`) is the only external caller of
`generate_meeting_summary`. Its single use of `e.contains("cancelled")`
switches to `matches!(e, LLMError::Cancelled)`; the persisted DB
message stays a `String` (one-line `.to_string()` at the boundary).

## Public-API changes

| Function | Old | New |
|---|---|---|
| `summary::processor::generate_meeting_summary` | `Result<(String, String, i64), String>` | `Result<(String, String, i64), LLMError>` |
| `summary::processor::run_markdown_transform` | `Result<String, String>` | `Result<String, LLMError>` |
| `summary::processor::translate_markdown` | `Result<String, String>` | `Result<String, LLMError>` |
| `summary::processor::normalize_markdown_to_english` | `Result<String, String>` | `Result<String, LLMError>` |
| `summary::processor::english_markdown_after_normalization_result` | `Result<String, String>` | `Result<String, LLMError>` (only if it forwards `LLMError`; otherwise stays generic) |
| `summary::failover::generate_with_failover` | `Result<String, String>` | `Result<String, LLMError>` |
| `summary::failover::try_provider` | `Result<String, LLMError>` | unchanged |
| `summary::failover::is_transient_error(&str)` | unchanged | unchanged (legacy `&str` overload stays for the 6 existing tests) |

## Internal-error rewrites

`processor.rs` has 4 `.map_err(|e| e.to_string())` adaptations on
`generate_summary(...)` call sites. All four become plain `.await?`
now that `generate_summary` returns `LLMError`.

`processor.rs` has 6 inline `Err("...".to_string())` sites:
- 2× "Summary generation was cancelled" → `LLMError::Cancelled`
- 1× "Multi-level summarization failed: No chunks were processed successfully" → `LLMError::Other(...)`
- 1× inside `run_markdown_transform` ("Summary generation was cancelled") → `LLMError::Cancelled`
- 2× inside `normalize_markdown_to_english` / `translate_markdown` (same cancellation strings) → `LLMError::Cancelled`

`failover.rs::generate_with_failover`:
- The `last_err` accumulator becomes `Option<LLMError>`.
- The terminal "All N providers in chain failed" error renders via `e.to_string()`.
- The outer `Err(format!(...))` becomes `Err(LLMError::Other(format!(...)))` so the caller
  still sees a typed error.

## Upper-layer adaptation (service.rs)

`service.rs` line ~587 changes:

```rust
// before
if e.contains("cancelled") { ... }
// after
if matches!(e, LLMError::Cancelled) { ... }
```

`Self::update_process_failed(&pool, &meeting_id, &e)` stays a `&str`
call (the DB persists user-facing error messages); add `.to_string()`
at the call site:

```rust
Self::update_process_failed(&pool, &meeting_id, &e.to_string()).await;
```

`service.rs` adds `use crate::summary::llm_client::LLMError;` (no new
external types — `LLMError` is already a public re-export of the
`llm_client` module).

## Tests

`failover.rs::tests`:
- The 6 existing `is_transient_error(&str)` tests stay untouched.
- The two `generate_with_failover` async tests (`empty_chain_returns_error`,
  `cancellation_aborts_before_first_attempt`) currently use `.contains("...")`
  on the error string. Both switch to `matches!(err, LLMError::Other(_))` and
  `matches!(err, LLMError::Cancelled)` respectively. No HTTP wiring changes.

`processor.rs::tests`:
- The `final_report_prompt_*` / `chunk_prompt_*` / `translation_*` / etc.
  tests are pure-function and unaffected.
- No async tests at this layer today; no new ones added.

`processor.rs` requires one additional adjustment: the `update_process_failed`
helper signature in `service.rs` already takes `&str`. No change to its
signature — the typed error is stringified at the single call site.

## Non-goals

- No new variant on `LLMError`.
- No DB schema change; error messages still go through the existing
  `summary_process.error_message` TEXT column.
- No retries / failover logic change.
- No new translation / normalisation behaviour.
- No frontend change.

## Risks

1. **Test coverage gap**: the public API flips, but the existing `processor.rs`
   tests don't exercise the error path. Mitigated by keeping the changes
   mechanical (delete `.map_err`, replace string-construction with typed
   constructors) and reviewing the diff for behavioural drift.
2. **`.to_string()` at the DB boundary** may lose typed classification. By
   design — the DB column is a flat string, and the typed value already
   passed through `Display` so the message remains meaningful. If the
   frontend later wants typed postprocess error codes for the summary path
   too, that's a follow-up (the event channel for summary errors is
   separate from the postprocess one and not part of this PR).
3. **Backwards-compat shim**: none needed — `service.rs` is the only
   external caller and we update it in this same PR.

## Line budget

| File | + / - |
|---|---|
| processor.rs | +20 / -30 |
| failover.rs | +10 / -10 |
| service.rs | +3 / -1 |
| tests in failover.rs | +4 / -4 |
| CHANGELOG.md | +8 |
| spec.md + plan.md | +140 |
| **合计** | **+185 / -45** |
