# Wave 18 / PR-56: 转写恢复稳定性兜底

> **For agentic workers:** superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.
> **Base branch:** devtest
> **Parent waves:**
> - PR-33 (orphan detection) — 提供扫描入口
> - PR-54 (orphan recovery) — 提供合并函数，本 PR 兜底其失败路径

## Background

PR-54 实现了 `merge_orphan_checkpoints()` 把崩溃留下的 `audio_chunk_*.mp4` 拼回 `audio.mp4`。但失败路径只 `warn!` log，用户看不到。

实测三个失败场景：
1. **FFmpeg 偶发失败**（编码器临时不可用、文件被锁）：同步重试 1-2 次通常能成功
2. **FFmpeg 永久失败**（磁盘满、文件损坏）：重试无效，需要用户介入
3. **`.checkpoints/` 部分损坏**（chunk 缺中间帧）：FFmpeg concat 报错，`.checkpoints/` 留在原位

PR-56 解决全部三种场景。

### Observed Issues

1. **失败静默**：用户在 PR-33 弹窗点 [恢复] 后看不到结果（成功才 emit，失败只 log warn）
2. **无重试**：FFmpeg 偶发失败立即放弃，丢失可恢复数据
3. **状态不持久化**：失败的 `.checkpoints/` 仍在原位，下次启动再次被 scan，用户重复看到弹窗
4. **错误详情缺失**：`anyhow!("FFmpeg concat failed: exit {:?}", status.code())` 只给退出码，用户不知道为什么失败

## Goals

1. Recovery 失败时持久化错误详情（FFmpeg stderr / 文件缺失 / 磁盘满）
2. 自动后台重试 3 次（指数退避：100ms / 500ms / 2s），非阻塞 UI
3. 顶部红条常驻提示"X 个会议恢复失败"，点击展开详情
4. 用户可手动标记"已解决"或"再试一次"
5. 持久化状态跨重启有效（避免重复扫描已失败的会议）

## Non-Goals

1. 自动恢复 .checkpoints/ 损坏的 chunk（超出 PR-56 范围）
2. 分布式恢复（多设备协同）
3. 自动清理失败超过 30 天的 .checkpoints/（未来 PR）

## Scope

### 1. 数据模型扩展

**新增 JSON 文件**：`<app_data>/recovery-state.json`

```json
{
  "failures": [
    {
      "meeting_folder": "C:/Users/.../meetings/Team Sync 2026-07-15",
      "display_name": "Team Sync 2026-07-15",
      "first_attempt_ms": 1721040000000,
      "last_attempt_ms": 1721040002000,
      "attempt_count": 3,
      "last_error": "FFmpeg concat failed: exit Some(1)",
      "last_error_kind": "ffmpeg_failed",
      "last_stderr_tail": "concat_list.txt: No such file or directory\n...",
      "discarded": false
    }
  ]
}
```

**字段说明**：
- `last_error_kind`: 枚举 `ffmpeg_failed` / `no_checkpoints` / `no_mp4_files` / `io_error` / `unknown`
- `last_stderr_tail`: FFmpeg stderr 最后 500 字节（诊断用）
- `discarded`: 用户标记"放弃"后设为 true，下次启动不再提示

### 2. 新增 Rust 函数

`frontend/src-tauri/src/audio/recovery.rs` 加：

```rust
/// Load all failure records from <app_data>/recovery-state.json.
pub fn load_failures(app_data_dir: &Path) -> Vec<RecoveryFailure>

/// Append a new attempt + error to the failure record for `meeting_folder`.
/// Returns the updated record.
pub fn record_failure(
    app_data_dir: &Path,
    meeting_folder: &Path,
    error: &anyhow::Error,
) -> Result<RecoveryFailure>

/// Mark a failure as discarded (user gave up). Returns true if found.
pub fn mark_discarded(app_data_dir: &Path, meeting_folder: &Path) -> bool

/// Async wrapper around `merge_orphan_checkpoints` with up to 3 retries
/// (exponential backoff: 100ms, 500ms, 2s). Emits `recovery-progress` and
/// `recovery-completed` / `recovery-failed` events to the frontend.
pub async fn merge_orphan_checkpoints_with_retry<R: Runtime>(
    app: &AppHandle<R>,
    meeting_folder: PathBuf,
)
```

### 3. 修改现有 Tauri command

`database::commands::recover_orphan_meeting_cmd`：

- 改成 `pub async fn` + 不返回 Err（即使失败也返回 Ok）
- 内部调用 `merge_orphan_checkpoints_with_retry` 后立刻返回（不等重试完成）
- 重试完成后由 `merge_orphan_checkpoints_with_retry` 内部 emit 事件

### 4. 新增 Tauri commands

`frontend/src-tauri/src/database/commands.rs` 加：

```rust
#[tauri::command]
pub async fn get_failed_recoveries(app: AppHandle) -> Result<Vec<RecoveryFailure>, String>

#[tauri::command]
pub async fn retry_recovery(app: AppHandle, meeting_folder: String) -> Result<(), String>
/// 不返回 Err，失败由 emit 事件通知

#[tauri::command]
pub async fn discard_recovery(app: AppHandle, meeting_folder: String) -> Result<bool, String>
```

### 5. UI 增量

**顶部红条组件**（新文件 `frontend/src/components/RecoveryFailureBanner.tsx`）：

- 监听 `recovery-completed` / `recovery-failed` 事件
- 当 `get_failed_recoveries` 返回非空时显示红色 banner："X 个会议恢复失败"
- 点击展开下拉菜单（复用 PR-33 弹窗样式）
- 每个失败条目显示：会议名 + 失败次数 + 错误类型 + "重试" / "放弃" 按钮 + "查看日志"（展开 stderr tail）
- 用户点击"放弃"调用 `discard_recovery`，banner 立即消失

**事件监听**：

- `recovery-progress`: { meeting_folder, attempt, max_attempts }（显示"恢复中 X/3"）
- `recovery-completed`: { meeting_folder, audio_path }（从 banner 移除，刷新会议列表）
- `recovery-failed`: { meeting_folder, error_kind, error_message, stderr_tail }（加入 banner）

### 6. i18n 增量（精简版）

为避免 30 条 JSON 条目翻译 + 每语言 9 个 key 的开销，banner 文案直接内嵌
`RecoveryFailureBanner.tsx` 顶部双语 map（`MESSAGES_EN` / `MESSAGES_ZH`），
按 `navigator.language` 切换；其余 5 个 locale 自动回退到英文——这是 banner
场景可接受的简化。

唯一新建的 i18n key 是 `recording.orphan_checkpoint_recovering`，**6 个 locale
都添加**（en-US / en-GB / zh-CN / zh-TW / ja-JP / ko-KR）：
- en-US / en-GB: "Recovery started. Watch the banner for progress."
- zh-CN: "已启动恢复，进度请查看顶部提示"
- zh-TW: "已啟動恢復，進度請查看頂部提示"
- ja-JP: "復元を開始しました。上部のバナーで進捗を確認できます"
- ko-KR: "복구를 시작했습니다. 상단 배너에서 진행 상황을 확인하세요"

原因：`OrphanCheckpointDialog.handleRecover()` 在命令 fire-and-forget
之后立即弹 toast，告知用户恢复已启动、详情见顶部 banner。

### 7. Frontend 集成

PR-56 同时把现有前端的两个孤儿恢复调用点切到新的 spawn 命令，删掉旧的
同步 `recover_audio_from_checkpoints` 命令，避免双 API：

| 文件 | 变更 |
|------|------|
| `frontend/src/hooks/useTranscriptRecovery.ts` | `recover_audio_from_checkpoints` → `recover_orphan_meeting_cmd`（fire-and-forget）；删掉 `AudioRecoveryStatus` 处理；保持 `audioRecoveryStatus = null` 让 `page.tsx` toast 走 "transcripts only" 分支 |
| `frontend/src/components/OrphanCheckpointDialog.tsx` | 同样切到 spawn；按钮变 `toast.info(t('orphan_checkpoint_recovering'))` 并触发 `onAction` |
| `frontend/src-tauri/src/audio/incremental_saver.rs` | 删 `recover_audio_from_checkpoints` 函数 + `AudioRecoveryStatus` 结构体 |
| `frontend/src-tauri/src/lib.rs` | 从 `invoke_handler!` 删 `audio::incremental_saver::recover_audio_from_checkpoints`（保留 `cleanup_checkpoints` / `has_audio_checkpoints`） |

旧命令的同步 / 阻塞行为被一条异步、持久化、重试 + banner 兜底的路径完整替代。


## Acceptance

- [ ] `recovery-state.json` 在失败后立即写入
- [ ] `merge_orphan_checkpoints_with_retry` 异步跑 3 次重试，UI 不阻塞
- [ ] `recover_orphan_meeting_cmd` 不再阻塞调用方
- [ ] `get_failed_recoveries` 返回持久化失败列表
- [ ] `retry_recovery` / `discard_recovery` Tauri command 注册
- [ ] RecoveryFailureBanner 组件监听事件 + 显示 banner
- [ ] 6 个 locale 加 5 个新 i18n key
- [ ] 5 个 Rust 单元测试覆盖：retry 成功 / retry 全部失败 / 持久化往返 / mark_discarded / stderr 截断 500 字节
- [ ] 失败状态跨重启保留（模拟一次失败 → 重启 → banner 仍显示）
- [ ] `pnpm check:i18n` + `pnpm test:i18n` + `pnpm build` 三道闸全过

## Risks

1. **FFmpeg stderr 可能很大**：100KB+ 时全写入文件会膨胀 recovery-state.json
   - **缓解**：只截取最后 500 字节 + 用 base64 压缩（如有必要）
2. **并发重试**：用户同时点多个会议的"重试"
   - **缓解**：每个 meeting_folder 用 tokio::Mutex 保护，串行处理
3. **重试风暴**：磁盘满时反复重试浪费 CPU
   - **缓解**：3 次后停止，让用户手动重试
4. **持久化文件 IO 失败**（磁盘满）：recovery-state.json 写不进去
   - **缓解**：写失败仅 warn log，不影响主流程（下次启动重新 scan 即可恢复）

## References

- PR-33: `frontend/src-tauri/src/database/orphan_checkpoints.rs`
- PR-54: `frontend/src-tauri/src/audio/recovery.rs`
- PR-54 spec: `docs/superpowers/specs/2026-07-16-transcribe-resilience.md`
- Tauri events: https://tauri.app/v1/guides/features/events

## Future Work (out of scope)

- 自动清理失败超过 30 天的 .checkpoints/
- 失败模式聚类分析（"90% 失败都是磁盘满"）
- 与 LLM postprocess 联动（恢复后自动转写）