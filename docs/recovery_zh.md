# 转写中崩溃的会议: 孤儿分片自动恢复

> Wave 18 / PR-54。本页描述 PR-33 (孤儿检测) 之后, 配对的恢复动作。

## 问题背景

`IncrementalAudioSaver` 在录音过程中每 60 秒落盘一个 `audio_chunk_NNN.mp4`
分片到 `<meeting_folder>/.checkpoints/`, 录音正常结束时由 `finalize()`
调用 `merge_checkpoints()` 拼成单个 `audio.mp4`。

如果会议进行中应用崩溃 / 系统断电 / 用户强杀进程, `finalize()` 没机会
跑, 就会留下一堆孤儿分片: 文件在, 但没有任何会议元数据引用, 用户也
看不到播放按钮, 数据相当于"沉默丢失"。

PR-54 让用户能**主动找回**这些分片, 而不是悄悄删除。

## 三步流程

```
启动时 (PR-33)
    |
    v
scan_orphan_checkpoints(app_data_dir)
    |
    | Vec<OrphanCheckpoint> { meeting_folder, chunk_count, total_bytes }
    v
emit("orphan-checkpoints-detected", orphans)
    |
    v
前端弹窗 (PR-33 已实现 UI): 列出每个孤儿会议
    |
    +-- 用户点 [恢复] --> invoke("recover_orphan_meeting", { meeting_folder })
    |                       |
    |                       v
    |                   audio::recovery::merge_orphan_checkpoints()
    |                       |
    |                       v
    |                   拼出 audio.mp4 + 清理 .checkpoints/
    |                       |
    |                       v
    |                   返回最终路径, 前端刷新会议列表
    |
    +-- 用户点 [丢弃] --> invoke("discard_orphan_checkpoint", { meeting_folder })
                            直接 rm -rf .checkpoints/
```

## 实现要点

### 1. 核心函数

```rust
// frontend/src-tauri/src/audio/recovery.rs
pub fn merge_orphan_checkpoints(meeting_folder: &Path) -> Result<PathBuf>
```

- 读 `<folder>/.checkpoints/`, 收集所有 `*.mp4`, 按文件名排序
- 写 `concat_list.txt`, 用 FFmpeg `-f concat -c copy` 无重编码拼接
- 成功后 `rm -rf .checkpoints/`, 返回 `audio.mp4` 绝对路径
- 失败时保留 `.checkpoints/` 方便再次尝试
- Windows 下用 `creation_flags(0x08000000)` 抑制控制台窗口弹出
  (与 PR-44e `merge_checkpoints` 完全一致的模式)

### 2. Tauri command

```rust
// frontend/src-tauri/src/database/commands.rs
#[tauri::command]
pub async fn recover_orphan_meeting_cmd(
    meeting_folder: String,
) -> Result<String, String>
```

返回最终 `audio.mp4` 的绝对路径, 前端用此路径触发转写或刷新播放。

### 3. 测试覆盖

`recovery.rs` 含 3 个单元测试 (沙箱内可跑, 不依赖 FFmpeg):

| 测试 | 验证 |
|------|------|
| `errors_when_checkpoints_dir_missing` | `.checkpoints/` 不存在时报错 |
| `errors_when_no_mp4_files` | 空 `.checkpoints/` (只有非 mp4 文件) 报错 |
| `discovers_mp4_files_in_sorted_order` | `audio_chunk_002/000/001.mp4` 被正确按 `000/001/002` 排序 |

FFmpeg 路径通过代码审计 + CI 验证, 不在沙箱内执行。

## 与其他 PR 的衔接

| PR | 关系 |
|----|------|
| **PR-33** | 提供孤儿检测; PR-54 配对的恢复动作 |
| **PR-44e** | 并行 WAV 转码; 恢复出的 `audio.mp4` 在下一次录音时自动产生 `audio.wav` |
| **PR-44d** | `get_meeting_audio_path` 命令; 恢复后的会议若元数据被手动补全, 也能触发点击跳转播放 |

## 用户操作

1. 启动 Meetily 时如检测到孤儿分片, 主界面顶部弹出一次性提示
2. 用户在弹窗里看到 `<文件夹名> (3 个分片, 12 MB)` 这样的条目
3. 点 [恢复] -> 后台拼接 -> 成功后提示"已恢复, 现在可以在会议列表里看到了"
4. 点 [丢弃] -> 永久删除 `.checkpoints/`, 不可恢复

## 已知限制

- 仅恢复**音频分片**, 不会重建数据库里的会议元数据 (标题 / 参与者 / 标签)
- 恢复后用户需手动新建一条会议记录并指向该 `audio.mp4`, 或联系开发者
  写一个元数据重建工具 (PR-55 候选)
- `.checkpoints/` 中的非 `*.mp4` 文件会被忽略 (FFmpeg concat 只吃 mp4)