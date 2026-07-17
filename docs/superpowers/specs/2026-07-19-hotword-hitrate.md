# Spec — Wave 22 / PR-A: 热词命中率统计

## 目标

让用户看到自己配置的 hotword 列表中哪些真在帮识别率、哪些是死词，驱动后续配置优化。

## 范围

- 新建 SQLite 表 hotword_hit_stats 持久化每个 hotword 的命中计数
- 流式转写路径（recording_saver.add_transcript_segment）落地时累加命中
- 前端 HotwordHitStatsPanel：表格 + 横向条形，按 hit_count 降序；显示 last_hit_at
- 新 Tauri command get_hotword_hit_stats
- 6 locale i18n 键 settings.stats.*
- 30 天滚动清理函数 cleanup_old（不主动调度，留命令位）

## 不在范围

- 一次性 import / retranscription 路径挂钩（场景窄，留作 PR-A2）
- 命中率百分比（需要 segment 总数分母）
- 自动重排序 hotword 列表
- 跨用户 / 跨设备同步
- 旧数据导入

## 设计

数据 schema：

```sql
CREATE TABLE hotword_hit_stats (
  hotword TEXT PRIMARY KEY,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TEXT NOT NULL
);
CREATE INDEX idx_hotword_hit_stats_count ON hotword_hit_stats(hit_count DESC);
```

匹配规则：全字精确 + 大小写不敏感（用户决策 B）。中英文均按字符级 Unicode 处理；扫描 segment text，token 间以非 word character 切分。

数据流：

1. 任何 ASR segment 落地
2. 命中：record_segment(db, segment_text) — 调用 transcription_preferences 模块内 extract_all_hotwords 解析当前 raw，对 segment 做不区分大小写匹配
3. 每个命中 hotword：upsert hit_count += 1, last_hit_at = now()
4. 前端 useHotwordHitStats() 通过 get_hotword_hit_stats 命令拉取

接口签名：

```rust
// hotword_stats.rs
pub fn init(pool: SqlitePool);
pub fn cache_raw(raw: &str);
pub async fn record_segment(text: &str) -> ();
pub async fn record_segments_batch(texts: &[String]) -> ();
pub async fn get_stats() -> Result<Vec<HitStatRow>, String>;
pub async fn cleanup_old(days: u32) -> Result<usize, String>;

pub struct HitStatRow { hotword: String, hit_count: i64, last_hit_at: String }
#[tauri::command]
pub async fn get_hotword_hit_stats() -> Result<Vec<HitStatRow>, String>;
```

一处挂钩：

- audio/recording_saver.rs::RecordingManager::add_transcript_segment 内部 store 之后调用 record_segment（fire and forget）
- 一次性 import / retranscription 路径不在本 PR 范围，留作 PR-A2

前端：

- frontend/src/hooks/useHotwordHitStats.ts
- frontend/src/components/HotwordHitStatsPanel.tsx
- 挂载在 frontend/src/app/settings/page.tsx Transcriptionmodels tab 中，与 HighlightSettings 同区
- 6 locale × 7 keys：title / description / empty / column_hotword / column_hits / column_last_hit / stale_hint

错误处理：record_segment 单次失败 log warn 不传染；调用方不 await 阻塞。

## 单提交约束

- 1 个 commit
- 后端 + 前端 + docs + spec + plan + migration 全部进同一提交
- 标题：feat(stats): hotword hit-rate panel with SQLite counter (PR-A, Wave 22)

## 测试 gates

- 单元测试（hotword_stats.rs 内）：3 个 word-boundary 用例覆盖
- 文档：docs/hotword_hitrate.md 用户使用说明
- 已有 gate：pnpm check:i18n / pnpm test:i18n / pnpm build
- 不需要 cargo test（沙箱无 cargo），让 CI 跑

## 风险

- 流式路径高频 INSERT：单条 upsert 极快（< 0.5ms），会议 1 小时约 300 段 ≈ 1.5s 总开销，可接受
- 多并发转写并发写同一 hotword：SQLite 单写锁串行化，但 INSERT ON CONFLICT DO UPDATE 是原子操作，安全
- 数据写入失败不阻塞业务路径：record_segment 调用 fire and forget

## Wave 23 候补

PR-42-iii（ASR 流自动 postprocess）用户认可有价值，留待用户确认后展开。
