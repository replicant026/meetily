# Wave 18 / PR-56: 转写恢复稳定性兜底 — 实施计划

> **For agentic workers:** superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.
> **Branch name:** feature/recovery-retry
> **Spec:** docs/superpowers/specs/2026-07-16-transcribe-resilience-retry.md
> **Estimated size:** ~450 行 (Rust ~200 + 前端 ~150 + i18n ~30 + 测试 ~50 + 文档 ~20)

## Phase 0 — 预检

- [x] devtest HEAD = 0aef5a9
- [x] PR-54 实际代码审计完成
- [x] 用户确认 B+B+C 设计方案

## Phase 1 — Rust 数据层

### Step 1.1: 新增 RecoveryFailure 数据结构

文件：`frontend/src-tauri/src/audio/recovery.rs`

任务：
- 加 `RecoveryFailure` struct + `RecoveryErrorKind` enum + serde
- 全部字段如 spec 中描述

### Step 1.2: 持久化 IO

任务：
- 实现 `load_failures`, `record_failure`, `mark_discarded` 三个函数
- 写 `recovery-state.json` 用 serde_json
- stderr 截断最后 500 字节

### Step 1.3: 5 个 Rust 单元测试

任务：5 个测试
1. `retry_succeeds_on_second_attempt` — mock FFmpeg 第一次失败第二次成功
2. `retry_gives_up_after_three_attempts` — 3 次都失败后 emit failed 事件
3. `record_failure_roundtrips_to_disk` — 持久化后 load 能读到
4. `mark_discarded_removes_from_active_list` — mark 后下次 scan 不显示
5. `stderr_truncation_to_500_bytes` — 长 stderr 只留最后 500 字节

验证：sandbox `cargo test --lib audio::recovery` 通过（沙箱无 cargo → CI 跑）

## Phase 2 — Rust 重试集成

### Step 2.1: merge_orphan_checkpoints_with_retry

任务：
- async fn 接收 `&AppHandle<R>` 和 `meeting_folder: PathBuf`
- 用 tokio::time::sleep 实现指数退避（100ms / 500ms / 2s）
- 每次尝试 emit `recovery-progress`
- 成功 emit `recovery-completed`，最终失败 emit `recovery-failed` 并 record_failure

### Step 2.2: 修改 recover_orphan_meeting_cmd

文件：`frontend/src-tauri/src/database/commands.rs`

任务：
- 改成 spawn 一个 tokio task 调 `merge_orphan_checkpoints_with_retry`
- 命令立即返回 Ok（不阻塞）

### Step 2.3: 新增 3 个 Tauri commands

任务：
- `get_failed_recoveries` - 读 recovery-state.json
- `retry_recovery` - spawn 重试任务（如果之前已失败）
- `discard_recovery` - mark_discarded

注册到 `lib.rs` 的 `invoke_handler!`

## Phase 3 — 前端 UI 增量

### Step 3.1: RecoveryFailureBanner 组件

新文件：`frontend/src/components/RecoveryFailureBanner.tsx`

任务：
- mount 时 `invoke('get_failed_recoveries')` 拿初始列表
- `listen('recovery-progress')` / `recovery-completed` / `recovery-failed`
- 渲染红条 + 下拉详情（复用 PR-33 弹窗样式）

### Step 3.2: 接入主应用

文件：`frontend/src/app/layout.tsx` 或 `frontend/src/app/page.tsx`

任务：
- 在主布局加 `<RecoveryFailureBanner />`

### Step 3.3: i18n 6 locale × 5 key

文件：`frontend/locales/{en-US,en-GB,zh-CN,zh-TW,ja-JP,ko-KR}/recovery.json`

验证：`pnpm check:i18n` + `pnpm test:i18n` + `pnpm build` 三道闸全过

## Phase 4 — 文档 + 收尾

### Step 4.1: 写 docs/recovery_retry_zh.md

内容：retry 流程图 + RecoveryFailure 字段说明 + 用户操作

### Step 4.2: commit + push + PR

```bash
git add -A
git commit -m "feat(audio): add recovery retry with failure persistence (PR-56)"
git push -u fork feature/recovery-retry
```

PR 标题：`feat(audio): add recovery retry with failure persistence (PR-56)`
PR 链接：`https://github.com/LSY1105/meetily/compare/devtest...feature/recovery-retry?expand=1`

## 收尾待办（PR 合并后）

1. `git fetch fork`（用户跑）
2. `git switch devtest && git pull --ff-only fork devtest`
3. `git branch -d feature/recovery-retry`
4. `git push fork --delete feature/recovery-retry`