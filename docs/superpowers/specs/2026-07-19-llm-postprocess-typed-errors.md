# PR-42-iv-c: typed `LLMError` enum for generate_summary

Status: ready-for-implementation
Wave: 24
Owner: qjl10
Branch: feature/llm-postprocess-typed-errors
Base: devtest (b72a811)
Depends on: PR-42-iv-b (Wave 24, 54f9e32)

## Goal

Replace the opaque `Result<String, String>` of `summary::llm_client::generate_summary`
with a typed `LLMError` enum so the postprocess path can do a typed match instead
of the current string-prefix heuristic in `map_upstream_error` (PR-42-iv-b).

Scope is intentionally narrow: only the postprocess error classification gains
precision. Summary, failover, and BuiltInAI callers keep their public
`Result<String, String>` signatures via a single `.map_err(|e| e.to_string())`
adaptation at each call site — no upstream propagation of the new type.

## Error taxonomy

```rust
#[derive(Debug, Clone)]
pub enum LLMError {
    /// Cancellation token tripped before / during the call.
    Cancelled,
    /// 401 / 403 from upstream.
    Auth,
    /// 4xx other than 401/403 — terminal, do not retry.
    ClientError { status: u16, body: String },
    /// 5xx or 429 — retryable; surface only when retries are exhausted.
    ServerError { status: u16, body: String },
    /// reqwest connect / timeout / request error.
    Network(String),
    /// serde_json parse failure on upstream body.
    JsonParse(String),
    /// Catch-all for unexpected internal failures (header parse, missing config,
    /// retry clone failure, etc.).
    Other(String),
}
```

`LLMError: Display` produces a sanitized human-readable message suitable for
logs and the `message` field on the postprocess `PostprocessError`.

## Classification map (PostprocessError.code from LLMError)

```rust
fn map_llm_error(e: LLMError) -> PostprocessError {
    use LLMError::*;
    let code = match &e {
        Cancelled => error_code::CANCELLED,
        Auth => error_code::AUTH_FAILED,
        ClientError { status, .. } if *status == 429 => error_code::UPSTREAM_RATE_LIMITED,
        ClientError { .. } => error_code::UPSTREAM_HTTP,  // 4xx (non-auth, non-429)
        ServerError { status, .. } if (500..600).contains(status) => error_code::UPSTREAM_HTTP,
        ServerError { .. } => error_code::UPSTREAM_HTTP,  // 429 / unknown 5xx-class
        Network(_) => error_code::NETWORK,
        JsonParse(_) => error_code::JSON_PARSE,
        Other(_) => error_code::INTERNAL,
    };
    PostprocessError { code, message: e.to_string() }
}
```

New `error_code` constants (additive, wire-stable):

| Constant | Value |
|---|---|
| `AUTH_FAILED` | `auth_failed` |
| `JSON_PARSE` | `json_parse` |
| `UPSTREAM_RATE_LIMITED` | `upstream_rate_limited` |

`UPSTREAM_HTTP` remains the catch-all for non-429 / non-auth 4xx and 5xx.
A separate `upstream_rate_limited` lets the UI show a "slow down" hint.

## Files

| File | Change |
|---|---|
| `frontend/src-tauri/src/summary/llm_client.rs` | Add `LLMError` enum + `Display` + `From<reqwest::Error>`; change `generate_summary` and `send_request_with_retry` to return `Result<_, LLMError>`; preserve all existing sanitization (no API keys in `Display`). |
| `frontend/src-tauri/src/summary/failover.rs` | `try_provider` returns `Result<_, LLMError>`; new `is_transient_llm_error(&LLMError) -> bool`; outer `generate_with_failover` keeps `Result<String, String>` via `.map_err`. Existing `is_transient_error(&str)` stays untouched (still used in tests). |
| `frontend/src-tauri/src/summary/processor.rs` | 4 call sites add `.map_err(|e| e.to_string())?`; the `e.contains("cancelled")` branch becomes `matches!(e, LLMError::Cancelled)` after switching to the typed error. |
| `frontend/src-tauri/src/llm_postprocess.rs` | `map_upstream_error(s: String)` → `map_llm_error(e: LLMError)`; `correct_segment` no longer needs the String fallback. 4 existing `error_*` unit tests rewritten to construct `LLMError` directly; 4 new tests for `Auth`, `ClientError`, `ServerError`, `JsonParse` classification. |
| `frontend/locales/*/transcript.json` | 3 new keys × 6 locales. |
| `docs/superpowers/specs/2026-07-19-llm-postprocess-typed-errors.md` | this spec |
| `docs/superpowers/plans/2026-07-19-llm-postprocess-typed-errors.md` | plan |
| `CHANGELOG.md` | entry |

## Non-goals

- No new retry policy; existing `RetryPolicy` and backoff untouched.
- No new provider handling.
- No public API change for `processor.rs::process_chunk_summaries`,
  `processor.rs::process_summary`, `failover.rs::generate_with_failover`,
  or `summary_engine::generate_with_builtin` — they stay `Result<String, String>`
  via a single one-line `.map_err` at the boundary.
- No new error code for "upstream timeout" (covered by `NETWORK`); UI can
  translate later if needed.

## Tests

`llm_postprocess.rs::tests`:
- Rewrite existing 4 classification tests to use `LLMError::*` directly.
- Add 4 new tests: `error_auth_failed_carries_code`,
  `error_rate_limited_carries_code`, `error_json_parse_carries_code`,
  `error_server_error_carries_status`.

`failover.rs::tests` (existing, unchanged behaviour):
- `is_transient_matches_5xx_and_timeouts` continues to pass (covers
  `LLMError::ServerError`, `LLMError::Network`).
- `is_transient_rejects_4xx` continues to pass (covers
  `LLMError::ClientError`, `LLMError::Auth`).

## Risks

1. **Public API of `generate_summary` flips**: `Result<String, String>` →
   `Result<String, LLMError>`. Mitigated by adapting every caller with
   `.map_err(|e| e.to_string())?`. The pre-merge check verifies
   `cargo build` is warning-free.
2. **`Display` accidentally leaks API keys**: `LLMError::Display` only
   formats status, body (already sanitized by `sanitize_error`), and the
   `Other(String)` payload. Network/JsonParse messages go through
   `sanitize_error` to scrub auth headers before display.
3. **Wire compatibility**: `PostprocessError.code` gains 3 new values
   (`auth_failed`, `json_parse`, `upstream_rate_limited`). Frontend i18n
   keys must land in the same PR; the 3 missing keys default to
   `code` string at the lookup site (already in `useTranscriptPostprocessEvents.ts`).
