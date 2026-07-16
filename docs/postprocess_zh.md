# ASR 后处理链（zh-CN）

> Wave 18 / PR-51 文档。本页描述 Rust 端的 ASR 转写后处理清理链。
> 与 Wave 12（LLM 后处理，调用 Claude / GPT / Groq / Ollama）属于不同层。

## 1. 概述

每一次 Whisper 解码完成后，`frontend/src-tauri/src/whisper_engine/whisper_engine.rs`
里的清理链会按以下顺序作用在转写文本上：

1. **`is_meaningless_output`**（`whisper_engine.rs:402`）
   - 检测英文会议转写中的"谢谢观看""um um um"等固定套话
   - 检测单字符 / 极少字符的重复长串（如 `uhhhhhhhhhh`）
   - **Wave 18 新增**：CJK 比例感知
     - 中文为主（cjk_ratio ≥ 0.5）时跳过英文 meaningless 模式匹配
     - 中文为主时，单字符重复阈值放宽到 30 字符（之前是 3 字符 / 10 字节）
2. **`remove_word_repetitions`**（`whisper_engine.rs:434`）
   - 合并连续相同 token
3. **`remove_phrase_repetitions`**（`whisper_engine.rs:461`）
   - 合并连续相同短语（2-5 词）
4. **`calculate_repetition_ratio`**（`whisper_engine.rs:498`）
   - 整段重复率 > 0.7 时整段丢弃

## 2. 中文会议中常见误杀

旧实现会把以下合法中文转写误判为"无意义"并整段丢弃：

| 输入 | 字节数 | 旧行为 | 新行为 |
|------|--------|--------|--------|
| `嗯嗯嗯嗯` | 12 | 丢弃 | 保留 |
| `啊啊啊啊啊啊啊啊啊啊啊啊` | 30 | 丢弃 | 保留 |
| `呃呃呃呃呃呃呃呃呃呃呃呃呃呃呃呃呃呃呃呃呃呃呃呃呃呃呃` | > 60 | 丢弃 | 保留 |
| 30+ 个相同汉字 | > 90 | 丢弃 | 丢弃（保留原有安全网） |

## 3. 英文缩写修正（防御性修复）

`frontend/src-tauri/src/audio/post_processor.rs` 中的
`apply_contextual_improvements` 函数当前**没有被任何调用点使用**（死代码），
但仍 `pub use` 导出。Wave 18 用 `\b...\b` 词边界正则 + `regex::escape` 替换
子串 `.replace`，避免破坏真实英文单词：

| 输入 | 旧行为 | 新行为 |
|------|--------|--------|
| `vacant` | `vacan't` | `vacant` |
| `scant` | `scan't` | `scant` |
| `cantilever` | `can'tilever` | `cantilever` |
| `cant believe` | `can't believe` | `can't believe` |
| `Cant believe` | `Can'T believe` | `Can't believe`（大小写保留） |
| `张三 said cant` | `张三 said can't` | `张三 said can't` |

## 4. 已知限制 / 不做什么

本层**不**做：
- 语义纠错（同音字、错字）→ 由 Wave 12 LLM 后处理负责
- 标点补全 → 由 Wave 12 LLM 后处理负责
- 段落重排 → 由 Wave 12 LLM 后处理负责
- 命名实体识别 / 修正 → 推荐使用 PR-50 热词（见下）

## 5. 改进中文识别率的推荐路径

ASR 端最有效的三个手段（按优先级）：

1. **PR-50 热词（已发布）**
   - 路径：设置 → 会议转写 → 热词列表
   - 最多 500 字符，自动注入 `params.set_initial_prompt`
   - 适合：公司名 / 产品名 / 项目代号 / 部门名 / 客户名
   - 文档：`docs/superpowers/specs/2026-07-15-asr-hotwords-ui.md`

2. **模型选择**
   - 默认 `large-v3-turbo`（中文 CER ~4.8%，速度 / 精度平衡）
   - 高精度用户用 `large-v3`（CER ~4.4%，但慢 2x）
   - 老硬件用 `large-v3-turbo-q5_0`（CPU 友好）
   - 文档：`docs/asr_benchmark_zh.md`

3. **Wave 12 LLM 后处理（可选）**
   - 适合对转写文本质量要求高的场景
   - 需要 API key（Claude / OpenAI / Groq）或本地 Ollama
   - 文档：`docs/superpowers/specs/2026-07-14-postprocess-wave12.md`

## 6. 验证

```bash
# Wave 18 PR-51 新增的 12 个单元测试位于：
frontend/src-tauri/src/audio/post_processor.rs
# 末尾的 #[cfg(test)] mod tests

# 沙箱（Windows ARM64）无法运行 cargo test，但 CI 会在 PR 上跑。
# 本地代码审查通过即可合入。
```