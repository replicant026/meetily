# Wave 18 / PR-55: ASR Postprocess 命名实体保护 — 实施计划

> **For agentic workers:** superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.
> **Branch name:** feature/postprocess-ner-protection
> **Spec:** docs/superpowers/specs/2026-07-16-postprocess-ner-protection.md
> **Estimated size:** ~350 行 (Rust ~150 + 前端 ~80 + i18n ~30 + 测试 ~50 + 文档 ~40)

## Phase 0 — 预检（已完成）

- [x] GITHUB 访问验证（git ls-remote fork HEAD, 2.6s）
- [x] 探索 PR-50 / PR-51 / PR-52 代码确认数据基础
- [x] 用户确认 B+B+B 设计方案（保护范围=人名+公司+项目复用热词 / 机制=链末还原 / UI=复用 PR-50 加开关）

## Phase 1 — Rust 数据层

### Step 1.1: 加 `get_protected_terms` 命令（方案 B：行内前缀）

文件：`frontend/src-tauri/src/transcription_preferences.rs`

任务：
- 复用现有 `load_transcription_hotwords` 函数读取字符串
- 按 `[\r\n]+|\s{2,}` 拆分行（同前端 `parseHotwords` 规则）
- 提取 `^\s*!\s*` 前缀的条目，去掉前缀和空白
- 去重 + 按字节长度倒序返回

### Step 1.2: 注册到 `invoke_handler!`

文件：`frontend/src-tauri/src/lib.rs`

任务：
- 在 `get_transcription_hotwords` command 后插入 `transcription_preferences::get_protected_terms`

### Step 1.3: 前端 hook 剥 `!` 前缀

文件：`frontend/src/hooks/useHotwords.ts`

任务：
- `parseHotwords` 函数加一行 `.replace(/^!\s*/, '')` 剥 protected 标记
- 不破坏 PR-52 高亮逻辑（`!` 已被 escape，去前缀无副作用）

## Phase 2 — Rust postprocess 改造

### Step 2.1: sentinel hash 生成

文件：`frontend/src-tauri/src/transcription_postprocess.rs`（新文件，如不存在）

任务：
- 实现 `fn sentinel_hash() -> &'static str` 用 `OnceLock<u64>` 缓存 8 hex 字符
- 实现 `fn make_sentinel(n: usize) -> String` 拼接 `__MP_PROTECTED_v1_<hash>_<n>__`

### Step 2.2: pre-pass + post-pass 实现

任务：
- 实现 `pub fn apply_with_protected(text: &str, protected_terms: &[String]) -> String`
- pre-pass：贪心从左到右扫描，按 protected_terms 顺序找最长匹配，记录 (start, end, original)
- 中间用 sentinel 占位
- 调用现有 postprocess 链
- post-pass：扫描输出字符串，找 sentinel，按 pre-pass 记录的 (sentinel → original) 映射还原

### Step 2.3: 单元测试

任务：5 个测试
1. `protected_term_restored_after_postprocess` — "张三" → 经过数字格式 → 仍为 "张三"
2. `longest_match_wins_for_overlap` — "张三" + "张三丰" 都 protected，扫描 "张三丰" 时长词优先
3. `zero_protected_terms_behaves_like_apply` — protected_terms=[] 时等同 `apply()`
4. `protected_term_in_middle_and_end` — 词在中间和末尾都被还原
5. `sentinel_no_collision_in_normal_text` — 普通文本不含 sentinel 模式

验证：sandbox `cargo test --lib transcription_postprocess` 通过（沙箱无 cargo → CI 跑）

## Phase 3 — 前端 UI 增量

### Step 3.1: 设置页加 checkbox

文件：`frontend/src/components/TranscriptSettings.tsx`

任务：
- 在每个热词行加 checkbox
- 勾选时调用 `setTranscriptionHotwords` 更新（PR-50 已有 API）
- 列表顶部加统计 + 批量按钮

### Step 3.2: 转写页加 `<u>` 下划线

文件：`frontend/src/components/TranscriptView.tsx` 或 `HotwordHighlight.tsx`

任务：
- protected 词的 `<mark>` 改为 `<mark><u>`
- hover 显示 tooltip（用浏览器原生 `title`）

### Step 3.3: i18n 6 locale × 5 key

文件：`frontend/locales/{en-US,en-GB,zh-CN,zh-TW,ja-JP,ko-KR}/transcript.json`

任务：
- 加 `transcript.hotwords.protect` / `protected_count` / `protect_all` / `unprotect_all` / `locked_tooltip`

验证：`pnpm check:i18n` + `pnpm test:i18n` + `pnpm build` 三道闸全过

## Phase 4 — 文档 + 收尾

### Step 4.1: 写 docs/postprocess_ner_protection.md

内容：
- pre-pass / post-pass 流程图（ASCII art）
- sentinel 设计说明（hash + 版本号）
- 与 PR-50 / 51 / 52 的衔接
- 已知限制（LLM postprocess 不在本次范围）

### Step 4.2: commit + push + PR

```bash
git checkout -b feature/postprocess-ner-protection
git add -A
git commit -m "feat(postprocess): add protected-terms restoration (PR-55)"
git push -u fork feature/postprocess-ner-protection
```

PR 标题：`feat(postprocess): add protected-terms restoration (PR-55)`
PR 链接：`https://github.com/LSY1105/meetily/compare/devtest...feature/postprocess-ner-protection?expand=1`

## 收尾待办（PR 合并后）

1. `git fetch fork`（用户跑）
2. `git switch devtest && git pull --ff-only fork devtest`
3. `git branch -d feature/postprocess-ner-protection`
4. `git push fork --delete feature/postprocess-ner-protection`