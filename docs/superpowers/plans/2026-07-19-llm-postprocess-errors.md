# PR-42-iv-b Plan: llm_postprocess 错误码语义化

## 步骤

### 1. Rust: 引入 PostprocessError + 常量 + helper

文件：`frontend/src-tauri/src/llm_postprocess.rs`

位置：line 1-19 (imports) 之后、line 36 (`PostprocessedSegment`)
之前插入：

- `pub mod error_code { ... }` 块，9 个 `pub const &str`
- `pub struct PostprocessError { code, message }` 加 `#[derive(Debug, Clone, Serialize)]`
- `fn map_upstream_error(s: String) -> PostprocessError` 私有 helper

### 2. Rust: 改 `correct_segment` 返回类型

签名：`Result<String, String>` → `Result<String, PostprocessError>`

4 处错误返回替换：

| Line | 旧 | 新 |
|---|---|---|
| 133 | `format!("Failed to load provider config: {}", e)` | `PostprocessError { code: PROVIDER_NOT_CONFIGURED, message: format!(...) }` |
| 134 | `"Provider not configured".to_string()` | `PostprocessError { code: PROVIDER_NOT_CONFIGURED, message: "LLM provider not configured".into() }` |
| 137 | `format!("Unsupported provider: {}", provider_str)` | `PostprocessError { code: UNSUPPORTED_PROVIDER, message: format!(...) }` |
| ~147 | 暂无，待看 custom-openai config check | 按 spec 加 CUSTOM_OPENAI_CONFIG_MISSING |
| ~158 | `"API key missing"` | `PostprocessError { code: API_KEY_MISSING, message: format!("{} API key missing", provider_str) }` |
| ~190 (generate_summary call) | `generate_summary(...).await?` 整段 | 用 `match` 包：`Err(s) => return Err(map_upstream_error(s))`，Ok 透传 |

### 3. Rust: 改 payload struct

```rust
struct PostprocessFailedSegment {
    segment_id: String,
    error: PostprocessError,  // 原 String
}
```

spawn_segment_postprocess 内部 `payload.error` 字段直接用
`PostprocessError`，无需再 format。

### 4. Rust: 5 个测试

在已有 `#[cfg(test)] mod tests { ... }` 末尾追加。

### 5. TS: useTranscriptPostprocessEvents.ts

- 类型 `PostprocessFailedPayload.error: string` → `error: { code: string; message: string }`
- listener 内部：
  - 解构 `code, message`
  - `errorMessage = t(\`transcript.postprocess_error_${code}\`, { defaultValue: code, ... })`
  - 不再直接存 `event.payload.error` 字符串
- import 加 `useTranslation` 来自 `react-i18next` 或项目既有 hook

需要先查 hook 当前是否已经 import t()。如果没有，加 import。

### 6. i18n: 6 locale × transcript.json

新增 9 个 keys。中文版（zh-CN / zh-TW）：

```json
"postprocess_error_provider_not_configured": "未配置 LLM 提供方",
"postprocess_error_unsupported_provider": "不支持的 LLM 提供方：{provider}",
"postprocess_error_custom_openai_config_missing": "Custom OpenAI 缺少 endpoint 或 api_key 配置",
"postprocess_error_api_key_missing": "{provider} API Key 未配置",
"postprocess_error_upstream_http": "LLM 服务返回 HTTP {status}",
"postprocess_error_network": "无法连接 LLM 服务",
"postprocess_error_upstream_empty": "LLM 返回为空或格式异常",
"postprocess_error_cancelled": "已取消",
"postprocess_error_internal": "内部错误：{message}"
```

英文（en-US / en-GB）：

```json
"postprocess_error_provider_not_configured": "No LLM provider configured",
"postprocess_error_unsupported_provider": "Unsupported LLM provider: {provider}",
"postprocess_error_custom_openai_config_missing": "Custom OpenAI config is missing endpoint or api_key",
"postprocess_error_api_key_missing": "{provider} API key is not configured",
"postprocess_error_upstream_http": "LLM service returned HTTP {status}",
"postprocess_error_network": "Cannot connect to LLM service",
"postprocess_error_upstream_empty": "LLM returned empty or malformed response",
"postprocess_error_cancelled": "Cancelled",
"postprocess_error_internal": "Internal error: {message}"
```

ja-JP / ko-KR 复用英文版（与既有 fallback 模式一致）。

### 7. CHANGELOG.md

在已有 PR-42-iv-a 条目之后加 PR-42-iv-b 条目。

### 8. 验证

```bash
cd frontend/src-tauri && cargo build
cd frontend/src-tauri && cargo test llm_postprocess::tests::
cd frontend && pnpm tsc --noEmit
cd frontend && pnpm check:i18n
```

### 9. Commit + Push

- Commit message: `feat(llm_postprocess): semantic error codes (PR-42-iv-b, Wave 24)`
- 用户 push + 网页合并

## 行数预算

| 文件 | + |
|---|---|
| llm_postprocess.rs | +80 |
| useTranscriptPostprocessEvents.ts | +6 / -2 |
| transcript.json × 6 | +54 |
| spec.md | +107 |
| plan.md | +70 |
| CHANGELOG.md | +5 |
| **合计** | **+320** |

## 风险与缓解

1. **wire format 兼容性**：后端和前端必须同 PR 合并。 → spec 标注；
   pre-merge checklist 含 "前端 hook 已更新"。
2. **map_upstream_error 启发式**：当前依赖字符串前缀。后续
   PR-42-iv-c 把 generate_summary 改成 LLMError enum 时重写。
3. **i18n fallback**：t() 用 defaultValue = code 兜底，新 locale
   不会崩溃。
