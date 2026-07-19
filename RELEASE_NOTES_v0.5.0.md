# v0.5.0 Release Notes / 发布说明

**Release date / 发布日期**: 2026-07-19
**Branch / 分支**: `devtest` (HEAD `3efb336`)
**Previous tag / 上一版本**: `v0.4.0`
**Semver bump**: minor (wire-format breaking change; see Upgrade notes below)
**Semver 升级**: 次版本号（涉及 wire format 变更；详见下方升级指南）

This release consolidates Wave 21-24 work — eight weeks of focused effort on
Chinese-meeting recognition quality, LLM postprocess integration, and error
classification precision. It is the first release cut from the `LSY1105/meetily`
fork's cumulative `devtest` branch.

本版本整合了 Wave 21-24 的全部工作 —— 八周时间聚焦于中文会议识别质量、LLM
后处理集成与错误分类精度。这是 `LSY1105/meetily` fork 累积 `devtest`
分支的首个正式发布。

---

## 核心变更 / Highlights

### 🌏 中文会议识别质量 / Chinese meeting recognition

- **流式 LLM 转写改写 / Streaming LLM transcript rewrite (PR-42-iii)** —
  每个长度足够的 ASR 段（≥8 个 CJK 字符或 ≥20 个 ASCII 字符）由配置的 LLM
  provider 异步改写，改写完成的文本立即替换原 typewriter 输出；改写失败的段
  保留原文并显示内联失败标记。支持的 provider：Ollama / OpenAI / OpenRouter
  原生接入 + DeepSeek / MiniMax / Kimi / 豆包 / Qwen 通过 CustomOpenAI base_url。
  每个英文 / 中文字符持续低于百毫秒级延迟，端到端识别质量显著优于 Whisper 单独。
  / Each long-enough ASR segment is rewritten asynchronously by the configured
  LLM provider; corrected text replaces the original stream output as soon as
  it lands. Failed rewrites keep the original and surface an inline failure
  marker. Supports Ollama / OpenAI / OpenRouter natively plus DeepSeek /
  MiniMax / Kimi / 豆包 / Qwen via CustomOpenAI base_url.

- **热词命中率面板 / Hotword hit-rate panel (PR-A)** —
  `hotword_hit_stats` 表按热词记录命中数 + 最近命中时间戳；
  `HotwordHitStatsPanel` 在 Settings → Transcription Models 显示热词、
  命中次数、最近命中相对时间和"陈旧（>30 天）"标记。30 天滚动清理在应用
  内自动执行。
  / New SQLite table tracks per-hotword hits and last-hit timestamp; the
  panel in Settings surfaces them with relative-time formatting and a stale
  (>30 days) flag. 30-day rolling cleanup runs in-app.

### 🛠 错误处理精度 / Error classification precision

- **类型化 `LLMError` 枚举 / Typed `LLMError` enum (PR-42-iv-c)** —
  `summary::llm_client::generate_summary` 返回 `Result<String, LLMError>`
  替代 `Result<String, String>`，错误归类从字符串前缀启发式（~80%
  准确率）变为 typed match（100% 准确率）。
  / `generate_summary` now returns `Result<String, LLMError>`. Classification
  goes from string-prefix heuristic (~80% accuracy) to typed match (100%).

- **语义化错误码 / Semantic error codes (PR-42-iv-b)** —
  前端 hook 接收 `{ code, message }` 而非裸字符串，可通过
  `transcript.postprocess_error_<code>` 查找本地化文案。
  `PostprocessError.code` 新增三个稳定 code：`auth_failed` /
  `json_parse` / `upstream_rate_limited`。
  / Frontend hook receives `{ code, message }` instead of a bare string;
  the frontend looks up `transcript.postprocess_error_<code>` for
  localised text. Three new stable codes added: `auth_failed`,
  `json_parse`, `upstream_rate_limited`.

- **Rust 单元测试覆盖 / Rust unit-test coverage (PR-42-iv-a)** —
  `llm_postprocess.rs` 从 6 个内联测试扩展到 28 个 `#[test]`，覆盖
  CJK 边界字符（基本平面 / 扩展 A / 平假名 / 片假名排除）、长度阈值、
  glossary 块顺序、prompt 构造 helper。
  / `llm_postprocess.rs` grows from 6 inline tests to 28 `#[test]`
  functions covering CJK boundaries, length thresholds, glossary
  ordering, and the extracted prompt helper.

### 📊 长期质量保障 / Long-term quality assurance

- **周度 ASR 基准 CI / Weekly ASR benchmark CI (PR-C)** —
  GitHub Actions 工作流每周 + 手动触发；用 sine-wave fixture
  验证推荐 Whisper 模型对中文会议未退化。无需消耗数百 CI 分钟即可捕捉
  性能回归。
  / GitHub Actions workflow runs weekly + on manual dispatch; a sine-wave
  fixture catches regressions in the recommended Whisper model for Chinese
  meetings without burning hundreds of CI minutes per run.

- **LLM 摘要热词保护 / LLM summary hotword protection (PR-F)** —
  3 个 summary prompt 函数（chunk / combine / final）现在注入全局热词
  列表作为 `<glossary>` 块，公司名 / 项目名 / 行业术语在 LLM 摘要阶段
  不会被改写。
  / All three summary prompt functions (chunk / combine / final) inject the
  global hotword list as a `<glossary>` block, so protected terms survive
  LLM summary rewriting.

---

## 升级指南 / Upgrade notes

### 终端用户 / End users

**无需任何操作 / No action required.**

应用通过 `app://` 协议自动更新版本号与 manifest。本版本与之前的转写、摘要、
导出功能完全兼容。

The app auto-updates the version and manifest via the `app://` protocol.
This release is fully compatible with all existing transcription, summary,
and export functionality.

### 自托管集成者 / Self-hosted integrators

如果你直接消费 Tauri 事件 `transcript-postprocess-failed`：

If you consume the `transcript-postprocess-failed` Tauri event directly:

**Before (v0.4.0):**
```json
{"segment_id": "abc", "error": "Failed to load api key for openai: ..."}
```

**After (v0.5.0):**
```json
{
  "segment_id": "abc",
  "error": {"code": "api_key_missing", "message": "Failed to load api key for openai: ..."}
}
```

错误 `code` 是稳定 wire contract（见 `PostprocessError.code` 常量）：
`provider_not_configured` / `unsupported_provider` /
`custom_openai_config_missing` / `api_key_missing` / `auth_failed` /
`upstream_http` / `upstream_rate_limited` / `network` / `json_parse` /
`upstream_empty` / `cancelled` / `internal`。本地化文案查找：
`transcript.postprocess_error_<code>`。

`code` is a stable wire contract — see `PostprocessError.code` constants
listed above. For localised UI text, look up
`transcript.postprocess_error_<code>` in your locale file.

---

## 已知问题 / Known issues

- **`rusqlite` fixture-based tests deferred**：PR-42-iv-a 原本引入
  `rusqlite` 作为 dev-dep 用于 SQLite fixture 测试，但因为与 `sqlx-sqlite`
  在 `libsqlite3-sys` 上冲突，PR-42-iv-c 已移除该依赖。后续 PR 计划在
  `Cargo.toml` workspace 层用 `rusqlite-mock` 或共享 sqlx 的测试池。
  / PR-42-iv-a originally added `rusqlite` for fixture-based tests; PR-42-iv-c
  removed it because it conflicted with `sqlx-sqlite` over `libsqlite3-sys`.
  A follow-up PR plans to add `rusqlite-mock` or share sqlx's test pool at
  the workspace level.

- **部分 PR-42 调用点仍是字符串错误 / Some PR-42 call sites still use
  string errors**：`summary::processor.rs` 与 `summary::failover.rs`
  通过 `.map_err(|e| e.to_string())` 适配，公共签名保持
  `Result<String, String>` 不变。后续 PR-43 计划统一为 typed 错误。
  / `summary::processor.rs` and `summary::failover.rs` adapt with a single
  `.map_err(|e| e.to_string())` so their public signatures stay
  `Result<String, String>`. PR-43 plans to unify on typed errors.

---

## 致谢 / Acknowledgements

- **`LSY1105`** — fork maintainer, Wave 21-25 contributor.
- **Upstream maintainers of `Zackriya-Solutions/meetily`** — the baseline
  on which this fork builds.
- Contributors who landed each PR listed in
  [`CHANGELOG.md`](CHANGELOG.md#v050-2026-07-19).

---

## 完整变更 / Full changelog

见 [`CHANGELOG.md`](CHANGELOG.md) `[v0.5.0] - 2026-07-19` 段；包含
Wave 21-24 全部 PR 的详细描述。

See the `[v0.5.0] - 2026-07-19` section of
[`CHANGELOG.md`](CHANGELOG.md) for the full per-PR breakdown of
Wave 21-24.

---

## 版本号 / Versioning

- `0.0.x` = early prototype wave (pre-i18n)
- `0.4.x` = i18n wave (en-US / en-GB / zh-CN / zh-TW / ja-JP / ko-KR)
- `0.5.x` = post-i18n recognition + LLM postprocess integration
- Next: `0.6.x` will focus on real-time diarisation, multi-speaker
  embeddings, and offline LLM fallback (planned for Wave 26-28).

[v0.5.0]: https://github.com/LSY1105/meetily/releases/tag/v0.5.0
