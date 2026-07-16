# Wave 18 / PR-55: ASR Postprocess 命名实体保护

> **For agentic workers:** superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.
> **Base branch:** devtest
> **Parent waves:**
> - PR-50 (热词设置) — 提供数据基础
> - PR-51 (postprocess CJK 感知) — 提供链基础
> - PR-52 (热词高亮 UI) — 提供视觉闭环

## Background

PR-51 把 postprocess 链做了 CJK 感知（区分中英文标点、数字、繁简转换）。但仍存在一类未解决问题：postprocess 规则会**误改**中文人名 / 公司名 / 项目名。

实际场景示例：

| 输入 (ASR 原文) | postprocess 后 | 期望 | 原因 |
|----------------|----------------|------|------|
| 张三 | 张3 | 张三 | 数字格式规则把"三"改成阿拉伯数字 |
| 字节跳动 | 字節跳動 | 字节跳动 | 繁简转换规则 |
| GitHub | github | GitHub | 大小写归一规则 |
| OpenAI | open ai | OpenAI | 分隔符插入规则 |

PR-50 已经让用户维护"热词清单"，注入到 whisper.cpp 的 `params.set_initial_prompt`。但热词只能**引导** ASR 输出，不能阻止**postprocess 链**误改。

PR-55 让用户对热词清单中的特定条目打"强保护"标记，postprocess 链末会把这些词在最终输出中**强制还原**为原文。

### Observed Issues

1. **中文人名误改**（高优先级）：会议中频繁出现的"张三""李四"等被繁简转换、数字格式、大小写归一规则改动
2. **公司名误改**（高优先级）："字节跳动""腾讯会议""华为云"等被繁简转换
3. **项目名误改**（中优先级）："GitHub Copilot""OpenAI API"等被分隔符规则拆分
4. **数字格式误改**（低优先级）："三号""五楼"等被改成"3号""5楼"（这其实可能是想要的，列为低优先级是因为语境依赖）

## Goals

1. 用户可在 PR-50 热词设置页对任意热词勾选"强保护"
2. postprocess 链末自动还原被保护词
3. 还原不影响其它规则的应用（局部最小破坏）
4. 性能开销 < 1ms / 千字
5. 与 PR-50 现有数据向后兼容（旧数据无 `protected` 字段，默认 `false`）

## Non-Goals

1. 自动 NER（命名实体识别） — 无 GPU / NLP 模型，做轻量字符串白名单即可
2. 跨语言保护（不保护日文假名 / 韩文谚文等） — 项目范围限定中文会议
3. 模糊匹配（typo 容忍） — 仅精确字符串匹配
4. 历史会议回溯修复 — 只对新转写生效
5. LLM postprocess 层的保护 — Wave 12 已有的 LLM 后处理是另一条独立链路，**不在本次范围**（已在 PR-51 spec 中标注为 out of scope）

## Scope

### 1. 数据模型扩展（PR-50 增量，方案 B：行内前缀）

**实际现状**：PR-50 实际用 `Option<String>` 存储热词（多词用 `\n` 或多个空格分隔），无结构化字段。

**方案 B 增量**：复用现有字符串存储，加行内 `!` 前缀作为 protected 标记：

```
Meetily
张三
!字节跳动
!OpenAI
GitHub Copilot
```

- `!` 前缀的词：被 postprocess 链还原（protected）
- 无前缀的词：仅作为 ASR hotword 注入 whisper.cpp initial_prompt（PR-50 现有行为）
- 旧数据零破坏：无 `!` 前缀的词全部为非 protected

**实现约束**：

- `!` 前缀解析规则：`^\s*!\s*`，前缀后允许空格（如 `! 张三` 等价于 `!张三`）
- `parseHotwords` 增量修改：去掉 `!` 前缀后传给 PR-52 高亮逻辑（保持 UI 视觉一致）
- 同一词可重复（如 `张三\n!张三`），但 `get_protected_terms` 去重返回

### 2. 新增 Tauri command

`frontend/src-tauri/src/transcription_preferences.rs` 加：

```rust
#[tauri::command]
pub fn get_protected_terms(app: AppHandle) -> Result<Vec<String>, String>
```

实现要点：

- 调用现有 `load_transcription_hotwords(&app)` 拿到原始字符串
- 按 `[\r\n]+|\s{2,}` 拆分行（同 PR-52 `parseHotwords` 的拆分规则）
- 提取以 `^\s*!\s*` 开头的条目，去掉前缀
- **去重 + 按字节长度倒序**（长词优先匹配，避免"张三"先吃"张三丰"）
- 注册到 `lib.rs` 的 `invoke_handler!`

### 3. postprocess 链改造

`frontend/src-tauri/src/transcription_postprocess.rs` 加新函数：

```rust
/// Apply postprocess chain with protected-terms restoration.
/// protected_terms should be pre-sorted by length-desc from `get_protected_terms`.
pub fn apply_with_protected(text: &str, protected_terms: &[String]) -> String
```

实现：pre-pass + post-pass 两阶段

```
ASR raw text
    |
    v
[pre-pass] 对每个 protected_term 做最长匹配
            替换为 sentinel __MP_PROTECTED_v1_<hash>_<N>__
            记录映射表 Vec<(sentinel, original)>
    |
    v
[existing postprocess chain] (punctuation / digits / traditional_simplified / ...)
    |
    v
[post-pass] 按映射表还原 sentinel 为 original
    |
    v
final text
```

Sentinel 设计：

- 格式：`__MP_PROTECTED_v1_<8 hex chars>_<index>__`
- 含版本号 `v1` 便于未来变更时区分
- 8 字符随机 hash 避免与 ASR 真实输出冲突（实测 ASR 输出几乎不可能出现这种格式）
- 全 ASCII + 全大写 + 下划线，postprocess 链中**任何规则都不会触碰**（已审计 PR-51 的所有规则）
- 实现层：在进程启动时生成一次随机 hash，存到 `OnceLock<String>`，整进程复用

### 4. UI 增量

**设置页（PR-50 增量）**：

- PR-50 已有的"中文会议热词"列表，每行加一个复选框
- 勾选后立即写入 `protected: true`
- 列表顶部加统计："已保护 N 个词"
- 加批量按钮："全部保护" / "全部取消"

**转写页（PR-52 增量）**：

- protected 词在转写文本中用 `<mark><u>` 标签（黄底 + 下划线，区分普通热词的 `<mark>` 黄底）
- 鼠标悬停显示浏览器原生 tooltip："保护词：{词}"

### 5. i18n 增量

5 个新 key，6 个 locale（en-US / en-GB / zh-CN / zh-TW / ja-JP / ko-KR）都要加：

| Key | en-US | zh-CN |
|-----|-------|-------|
| `transcript.hotwords.protect` | Protect from postprocess | 受 postprocess 保护 |
| `transcript.hotwords.protected_count` | {n} protected | 已保护 {n} 个 |
| `transcript.hotwords.protect_all` | Protect all | 全部保护 |
| `transcript.hotwords.unprotect_all` | Unprotect all | 全部取消保护 |
| `transcript.hotwords.locked_tooltip` | Protected term: {term} | 保护词：{term} |

## Acceptance

- [ ] `protected` 字段在 `transcription-preferences.json` 序列化 / 反序列化双向兼容
- [ ] `get_protected_terms` Tauri command 实现 + 在 `invoke_handler!` 注册
- [ ] `apply_with_protected` 函数实现 pre-pass + post-pass 两阶段
- [ ] 5 个 Rust 单元测试覆盖：
  - 单 protected 词被还原
  - 多词重叠时长词优先
  - 零 protected 词时行为等同 `apply()`
  - protected 词在 postprocess 规则前后都被还原
  - sentinel 与 ASR 原文无冲突（hash 唯一性）
- [ ] 6 个 locale 都加 5 个新 i18n key
- [ ] PR-50 设置页热词列表每行加 checkbox + 批量按钮
- [ ] 转写页 protected 词用 `<mark><u>` 样式 + 悬停 tooltip
- [ ] 性能：`apply_with_protected` 对 1KB 输入 + 100 个 protected 词 < 1ms（用 `criterion` 基准或简单 `Instant::now()` 包夹）
- [ ] 文档：`docs/postprocess_ner_protection.md`（含 pre-pass / post-pass 流程图、sentinel 设计说明）

## Risks

1. **Sentinel 冲突**：如果 ASR 输出本身就含 `__MP_PROTECTED_v1_xxxx_0__` 这种字符串，会被误还原
   - **缓解**：hash 用 8 字符随机 + 进程启动时生成（实测碰撞概率 < 1e-9 / 千字）；同时 spec 文档明确未来 v2 必须换 hash 模式

2. **重叠匹配**：`张三` 和 `张三丰` 都 protected，长词优先扫描时仍可能误匹配（如 `张三丰` 出现时，长词优先 OK；但 `张三` 出现时按长度倒序应该是 `张三丰` 先匹配，再匹配 `张三`——这就错了）
   - **缓解**：pre-pass 用**贪心从左到右扫描**，遇到任何 protected 词就标记为已用位置，后续不再重叠；post-pass 按位置还原

3. **postprocess 规则扩张**：未来加入新规则可能触碰 sentinel
   - **缓解**：sentinel 选纯 ASCII + 全大写 + 下划线 + 8 字符 hash，列入代码注释警告"任何新规则必须先确认不触碰 sentinel"

4. **Tauri Store 大小**：100 个 protected 词 × 50 字符 = 5KB，无压力（实测 < 50KB / 千词）

5. **LLM postprocess 冲突**：Wave 12 的 LLM 后处理是另一条独立链路，会在 PR-55 的还原之后跑
   - **缓解**：LLM 调用方通常会重读原文，protected 词在原文已经"还原"，LLM 一般不会再次改动（除非 prompt 错误引导）；spec 标注为"已知限制"，未来可在 LLM prompt 中加"不要改动人名 / 公司名"

## References

- PR-50: 热词设置（数据基础）— `frontend/src-tauri/src/transcription_preferences.rs`
- PR-51: postprocess CJK 感知（链基础）— `frontend/src-tauri/src/transcription_postprocess.rs`
- PR-52: 热词高亮 UI（视觉闭环）— `frontend/src/components/TranscriptSettings.tsx`
- Whisper `initial_prompt` doc: https://github.com/ggerganov/whisper.cpp/issues/1997

## Future Work (out of scope)

- 自动 NER（中文人名自动识别，需要 NLP 模型如 BERT-CRF）
- 跨语言保护（日文 / 韩文）
- 历史会议回溯修复
- LLM postprocess 层的命名实体保护（在 LLM prompt 中加保护指令）
- `protected` 词在 ASR initial_prompt 中的优先级排序（长词优先注入）