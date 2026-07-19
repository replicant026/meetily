# PR-42-iv-b: llm_postprocess 错误码语义化

Status: ready-for-implementation
Wave: 24
Owner: qjl10
Branch: feature/llm-postprocess-errors
Base: devtest (fe07790)
Depends on: PR-42-iii (Wave 23, fe07790)^ PR-42-iv-a (Wave 24, ae5574a)

## Goal

把 `frontend/src-tauri/src/llm_postprocess.rs` 的字符串错误升级为
稳定的 `PostprocessError { code, message }` 结构，让前端能用 i18n
key 翻译用户可见的错误文案，开发者日志能拿到原始 message。

`generate_summary` 仍返回 `Result<String, String>`，不在本 PR 范围
内拆解其内部错误分类。`correct_segment` 在调用点按字符串前缀把
`generate_summary` 的错误归到 `UPSTREAM_HTTP` / `NETWORK` /
`UPSTREAM_EMPTY` / `CANCELLED` 四个 code 中最匹配的一个。

## Scope

- Rust: 新增 `PostprocessError` + `error_code` 常量模块；改
  `correct_segment` 返回类型；改 4 处错误返回；改
  `PostprocessFailedSegment.error` 字段类型；加 5 个 `#[test]`。
- TS: `useTranscriptPostprocessEvents.ts` 的 payload 类型 + i18n
  lookup。
- i18n: 6 locale × `transcript.json` 新增 9 个
  `postprocess_error_*` keys。
- Docs: spec + plan + CHANGELOG。

## Non-goals

- 不拆解 `generate_summary` 内部错误（PR-42-iv-c）
- 不改 `correct_segment` 的公开 Tauri command 签名
- 不改任何 retry / fallback 行为
- 不动 settings UI

## Design

### Rust error struct

```rust
#[derive(Debug, Clone, Serialize)]
pub struct PostprocessError {
    pub code: &'static str,
    pub message: String,
}
```

`Serialize` 默认产出 `{"code": "...", "message": "..."}` JSON object，
Tauri 自动把它带到前端 payload。

### Code constants

```rust
pub mod error_code {
    pub const PROVIDER_NOT_CONFIGURED: &str = "provider_not_configured";
    pub const UNSUPPORTED_PROVIDER: &str = "unsupported_provider";
    pub const CUSTOM_OPENAI_CONFIG_MISSING: &str = "custom_openai_config_missing";
    pub const API_KEY_MISSING: &str = "api_key_missing";
    pub const UPSTREAM_HTTP: &str = "upstream_http";
    pub const NETWORK: &str = "network";
    pub const UPSTREAM_EMPTY: &str = "upstream_empty";
    pub const CANCELLED: &str = "cancelled";
    pub const INTERNAL: &str = "internal";
}
```

### Error mapping (correct_segment → PostprocessError)

| Source | code | message 模板 |
|---|---|---|
| SettingsRepository::get_provider not configured | `PROVIDER_NOT_CONFIGURED` | "LLM provider not configured" |
| `LLMProvider::from_str` parse fail | `UNSUPPORTED_PROVIDER` | "Unsupported LLM provider: {name}" |
| `provider == custom-openai && cfg.api_key.is_none()` | `CUSTOM_OPENAI_CONFIG_MISSING` | "Custom OpenAI config missing endpoint or api_key" |
| `SettingsRepository::get_api_key` returns None | `API_KEY_MISSING` | "{provider} API key missing" |
| `generate_summary` Err(s) starts with "HTTP " | `UPSTREAM_HTTP` | s 本身（保留 provider 状态码） |
| `generate_summary` Err(s) starts with "Failed to " / "reqwest" / "error sending" | `NETWORK` | s 本身 |
| `generate_summary` Err(s) contains "cancelled" | `CANCELLED` | s 本身 |
| `generate_summary` Err(s) empty / 不匹配上述 | `UPSTREAM_EMPTY` | s 本身 |
| 其他未捕获路径 | `INTERNAL` | s 本身 |

### Helper

```rust
fn map_upstream_error(s: String) -> PostprocessError {
    if s.to_lowercase().contains("cancel") {
        PostprocessError { code: error_code::CANCELLED, message: s }
    } else if s.starts_with("HTTP ") || s.starts_with("http ") {
        PostprocessError { code: error_code::UPSTREAM_HTTP, message: s }
    } else if s.starts_with("Failed to ") || s.starts_with("reqwest")
        || s.contains("error sending request") || s.contains("connection")
    {
        PostprocessError { code: error_code::NETWORK, message: s }
    } else {
        PostprocessError { code: error_code::UPSTREAM_EMPTY, message: s }
    }
}
```

### Wire format

Before:
```json
{"segment_id": "...", "error": "Failed to load provider config: ..."}
```

After:
```json
{
  "segment_id": "...",
  "error": {"code": "provider_not_configured", "message": "..."}
}
```

### Frontend lookup

`useTranscriptPostprocessEvents.ts` 在收到 `transcript-postprocess-failed`
时：

1. 把 `event.payload.error` 当作 `{code, message}` 解构
2. 用 `t(\`transcript.postprocess_error_${code}\`, { message })` 翻译；
   `t()` fallback 到 code 字符串本身
3. tooltip 显示翻译结果；console 保留原始 `message` 给开发

### i18n keys (per locale)

每个 locale 在 `transcript.json` 顶部加：

```json
"postprocess_error_provider_not_configured": "...",
"postprocess_error_unsupported_provider": "...",
"postprocess_error_custom_openai_config_missing": "...",
"postprocess_error_api_key_missing": "...",
"postprocess_error_upstream_http": "...",
"postprocess_error_network": "...",
"postprocess_error_upstream_empty": "...",
"postprocess_error_cancelled": "...",
"postprocess_error_internal": "..."
```

占位符：`{provider}`, `{message}`, `{status}`（HTTP code 占位）。

## Tests

5 个新 `#[test]` 在 `llm_postprocess.rs` 末尾：

1. `error_provider_not_configured_carries_code`
2. `error_unsupported_provider_includes_name`
3. `error_api_key_missing_includes_provider`
4. `error_upstream_http_classified_by_prefix`
5. `error_cancelled_classified_by_keyword`

不引入 HTTP mock，纯单元测试 helper + 4 处 build 点。

## Risks

1. **Wire format breaking**: 后端改 payload 类型必须同 PR 改前端 hook。
   → spec 顶部标注 "must land together"；pre-merge 检查 6 locale 文件
     都加了 keys。
2. **错误码字符串稳定性**: 用 `pub const` 集中，便于 grep；任何后续
   改名必须进 CHANGELOG。
3. **错误归类不完美**: `map_upstream_error` 是字符串前缀启发式，
   未来 `generate_summary` 返回 `LLMError` enum 时（PR-42-iv-c）
   会重写为精确分类。
