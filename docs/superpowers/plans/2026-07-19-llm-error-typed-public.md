# PR-43 Plan: typed LLMError propagates to public API

## Step 1. processor.rs

**1.1.** Import `LLMError` (already imported from PR-42-iv-c line 1).

**1.2.** Change `generate_meeting_summary` signature:
`Result<(String, String, i64), String>` → `Result<(String, String, i64), LLMError>`.

Inside, replace:
- `return Err("Summary generation was cancelled".to_string())` (chunk loop line 434) → `return Err(LLMError::Cancelled)`
- `return Err("Multi-level summarization failed: ...".to_string())` (line 474) → `return Err(LLMError::Other("Multi-level summarization failed: ...".to_string()))`
- `return Err("Summary generation was cancelled".to_string())` (line 542 from PR-42-iv-c) → `return Err(LLMError::Cancelled)`
- 4× `.await.map_err(|e| e.to_string())` → `.await` (LLMError propagates directly)
- The `e.contains("cancelled")` check (line 465) → `matches!(e, LLMError::Cancelled)`

**1.3.** Change `run_markdown_transform` signature: `Result<String, String>` → `Result<String, LLMError>`. Replace 1 cancelled-string.

**1.4.** Change `translate_markdown` signature: `Result<String, String>` → `Result<String, LLMError>`. Replace the `.map_err(|e: LLMError| format!("{failure_label} failed: {}", e))` (still produces String for the helper's old signature) — but since we're now returning `LLMError`, replace with:

```rust
.await.map_err(|e| LLMError::Other(format!("{failure_label} failed: {}", e)))?
```

**1.5.** Change `normalize_markdown_to_english` signature: `Result<String, String>` → `Result<String, LLMError>`. Replace its single cancelled-string.

**1.6.** Inspect `english_markdown_after_normalization_result` (line 60). It takes a `Result<String, String>` and forwards. Since this helper composes two functions that now return `LLMError`, the parameter and return types both become `Result<String, LLMError>`.

## Step 2. failover.rs

**2.1.** `generate_with_failover` signature: `Result<String, String>` → `Result<String, LLMError>`.

**2.2.** Outer Err block (line ~126):
```rust
Err(LLMError::Other(format!(
    "All {} providers in chain failed: {}",
    chain.len(),
    last_err.map(|e| e.to_string()).unwrap_or_else(|| "unknown error".to_string())
)))
```

**2.3.** The internal `Err(e) => { ... return Err(e.to_string()); }` (line 120) becomes `return Err(e);` (LLMError propagates directly).

**2.4.** Tests: update two async tests that use `.contains("...")`:
- `empty_chain_returns_error`: `matches!(result.unwrap_err(), LLMError::Other(_))`
- `cancellation_aborts_before_first_attempt`: `matches!(result.unwrap_err(), LLMError::Cancelled)`

The 6 `is_transient_error(&str)` tests stay untouched.

## Step 3. service.rs

**3.1.** Import `LLMError`:
```rust
use crate::summary::llm_client::LLMError;
```

**3.2.** Replace `if e.contains("cancelled")` (line ~587) with:
```rust
if matches!(e, LLMError::Cancelled) {
```

**3.3.** Replace `Self::update_process_failed(&pool, &meeting_id, &e)` (line ~593) with:
```rust
Self::update_process_failed(&pool, &meeting_id, &e.to_string()).await;
```

## Step 4. CHANGELOG entry

```
- PR-43 (Wave 26): Typed `LLMError` propagates to the public API of
  `summary::processor` and `summary::failover`. The five `.map_err`
  adaptations PR-42-iv-c left behind are removed; the DB layer
  (`service.rs`) switches its cancellation check from
  `e.contains("cancelled")` to `matches!(e, LLMError::Cancelled)`.
  No frontend change. No DB schema change.
```

## Step 5. Commit + push

Branch: `feature/llm-error-typed-public` off `devtest` (596d502).

Commit message: `feat(summary): typed LLMError propagates to public API (PR-43, Wave 26)`.

## Verification

No new tests added (existing test surface is preserved); the change is
mechanical and reviewable in the diff. Pre-merge `cargo check` and
`cargo test` confirm no behavioural drift.
