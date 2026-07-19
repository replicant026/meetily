# PR-42-iv-c Plan: typed LLMError enum

## Step 1. llm_client.rs — define LLMError + adapt all internal errors

**Insert near top of file** (after imports, before `pub struct ChatMessage`):

```rust
use std::fmt;

#[derive(Debug, Clone)]
pub enum LLMError {
    Cancelled,
    Auth,
    ClientError { status: u16, body: String },
    ServerError { status: u16, body: String },
    Network(String),
    JsonParse(String),
    Other(String),
}

impl fmt::Display for LLMError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Cancelled => write!(f, "Summary generation was cancelled"),
            Self::Auth => write!(f, "LLM rejected credentials (401/403)"),
            Self::ClientError { status, body } => {
                write!(f, "LLM API request failed ({}): {}", status, body)
            }
            Self::ServerError { status, body } => {
                write!(f, "LLM returned {}: {}", status, body)
            }
            Self::Network(s) => write!(f, "LLM request error: {}", s),
            Self::JsonParse(s) => write!(f, "Failed to parse LLM response: {}", s),
            Self::Other(s) => write!(f, "{}", s),
        }
    }
}
```

**`send_request_with_retry`** signature: `Result<Response, String>` →
`Result<Response, LLMError>`.

Error site replacements inside `send_request_with_retry`:

| Line | Old | New |
|---|---|---|
| 158 | `Err("Summary generation was cancelled".to_string())` | `Err(LLMError::Cancelled)` |
| 164 | `Err("Failed to clone request builder for retry".to_string())?` | `Err(LLMError::Other("Failed to clone request builder for retry".into()))?` |
| 169 | `Err("Summary generation was cancelled".to_string())` | `Err(LLMError::Cancelled)` |
| 183-186 | non-retryable 4xx → `Err(sanitize_error(&format!("LLM API request failed ({}): {}", status, body)))` | match status: 401/403 → `LLMError::Auth`; other 4xx → `LLMError::ClientError { status, body }`; 5xx that isn't actually retryable per `is_retryable_status` is impossible here, but keep `ServerError` for safety |
| 188-195 | retryable 5xx/429 → store as `String` in `last_err` | store as `LLMError::ServerError { status, body }` |
| 199-211 | reqwest `Err(e)` → `Err(sanitize_error(&format!("LLM request error: {}", e)))` | `Err(LLMError::Network(sanitize_error(&e.to_string())))` |
| 213 | cancelled | `LLMError::Cancelled` |
| 222-225 | exhausted | `LLMError::ServerError` from `last_err.unwrap_or(Other("unknown"))` |

`generate_summary` signature: `Result<String, String>` →
`Result<String, LLMError>`.

Internal error sites:

| Line | Old | New |
|---|---|---|
| 265 | cancelled | `LLMError::Cancelled` |
| 272 | `"app_data_dir is required for BuiltInAI provider"` | `LLMError::Other(...)` |
| 282 | `e.to_string()` | pass through `LLMError::Other(e.to_string())` (BuiltInAI uses `String` internally; convert at boundary) |
| 315 | CustomOpenAI endpoint missing | `LLMError::Other(...)` |
| 330, 337 | header parse | `LLMError::Other(...)` |
| 394, 409 | JSON parse | `LLMError::JsonParse(sanitize_error(&e.to_string()))` |

## Step 2. failover.rs — adapt to LLMError

- `try_provider` → `Result<String, LLMError>`.
- `is_transient_llm_error(&LLMError) -> bool` (typed): `Network | ServerError`
  return true; everything else false.
- `generate_with_failover` keeps `Result<String, String>` for the public
  surface; convert with `.map_err(|e| e.to_string())` at the boundary.
- Keep existing `is_transient_error(&str)` for the existing 6 tests.

## Step 3. processor.rs — adapt 4 call sites

Each `generate_summary(...).await?` becomes `generate_summary(...).await.map_err(|e| e.to_string())?`.

The `if e.contains("cancelled")` branch (line 464) becomes
`matches!(e, LLMError::Cancelled)` only if we switch the local variable to
the typed variant — simpler: keep `String` and check `e.contains("cancelled")`,
since the Display impl already produces "Summary generation was cancelled".

## Step 4. llm_postprocess.rs — map_llm_error + extend tests

Replace `fn map_upstream_error(s: String) -> PostprocessError { ... }` with
`fn map_llm_error(e: LLMError) -> PostprocessError { ... }` per the
classification map in spec.

`correct_segment` body becomes:

```rust
match generate_summary(...).await {
    Ok(text) => Ok(text),
    Err(e) => Err(map_llm_error(e)),
}
```

Add 3 new `error_code` constants:

```rust
pub const AUTH_FAILED: &str = "auth_failed";
pub const JSON_PARSE: &str = "json_parse";
pub const UPSTREAM_RATE_LIMITED: &str = "upstream_rate_limited";
```

Tests: rewrite 4 existing `map_upstream_error` tests to construct
`LLMError::*` directly; add 4 new tests for `Auth`, `ClientError`,
`ServerError`, `JsonParse`, `rate_limited`.

## Step 5. i18n — 3 new keys × 6 locales

Per locale, append:

```
"postprocess_error_auth_failed": ...,
"postprocess_error_json_parse": ...,
"postprocess_error_upstream_rate_limited": ...,
```

English:

```
"postprocess_error_auth_failed": "LLM rejected the API key (401/403)",
"postprocess_error_json_parse": "LLM returned an invalid response body",
"postprocess_error_upstream_rate_limited": "LLM rate limit reached (429), retry later"
```

zh-CN:

```
"postprocess_error_auth_failed": "LLM 拒绝凭证（401/403），请检查 API Key",
"postprocess_error_json_parse": "LLM 返回内容无法解析",
"postprocess_error_upstream_rate_limited": "LLM 触发限流（429），请稍后重试"
```

zh-TW: traditional variants. ja-JP / ko-KR: reuse English strings.

## Step 6. CHANGELOG.md entry

Add to `[Unreleased] / ### Added`:

```
- PR-42-iv-c (Wave 24): Typed `LLMError` enum for
  `summary::llm_client::generate_summary`. Replaces the string-prefix
  heuristic in `map_upstream_error` with a typed match, so
  `PostprocessError.code` gains `auth_failed`, `json_parse`, and
  `upstream_rate_limited`. Public API of `generate_summary` flips from
  `Result<String, String>` to `Result<String, LLMError>`; the 4 summary
  callers in `processor.rs` and `try_provider` in `failover.rs`
  adapt with a single `.map_err` to preserve their public
  `Result<String, String>` signatures. Adds 3 error codes × 6 locale
  i18n keys; 4 new unit tests cover the new classification paths.
```

## Step 7. Commit + push

Branch: `feature/llm-postprocess-typed-errors` off `devtest` (b72a811).

Commit message:
`feat(llm_postprocess): typed LLMError enum for generate_summary (PR-42-iv-c, Wave 24)`

## Line budget

| File | + / - |
|---|---|
| llm_client.rs | +50 / -20 |
| failover.rs | +20 / -5 |
| processor.rs | +4 / -0 |
| llm_postprocess.rs | +60 / -40 |
| transcript.json × 6 | +18 / -0 |
| spec.md | +110 |
| plan.md | this file |
| CHANGELOG.md | +10 |
| **合计** | **+260 / -65** |

## Risk mitigation

1. `Display` carefully avoids embedding API keys: `Network` and `JsonParse`
   payloads go through `sanitize_error` before storage.
2. The 4 processor.rs call sites all gain `.map_err(|e| e.to_string())?`
   so their public signatures are unchanged.
3. Pre-merge: `cargo build` warning-free, `cargo test llm_postprocess::`
   green. The 6 existing failover.rs tests stay untouched (they test
   the `&str` overload).
