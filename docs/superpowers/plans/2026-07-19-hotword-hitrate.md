# Plan — Wave 22 / PR-A: 热词命中率统计

## 工作分支

- 来源：devtest (HEAD = ec207f1)
- 目标：feature/hotword-hitrate
- 单提交约束（与之前 Wave 12+ 一致）

## 步骤

### 1. 数据库 schema

新增 frontend/src-tauri/migrations/20260719000000_add_hotword_hit_stats.sql：

- CREATE TABLE
- CREATE INDEX（按 hit_count DESC 用于 UI 降序读）

### 2. 后端模块

新建 frontend/src-tauri/src/hotword_stats.rs：

- record_segment 单段命中 + upsert
- record_segments_batch 多段批量（PR-A2 用）
- get_stats 全量读
- cleanup_old 滚动清理
- 配套 3 个单元测试

修改：

- frontend/src-tauri/src/lib.rs：加 pub mod hotword_stats; 并注册 get_hotword_hit_stats Tauri 命令；在 setup 钩子里 hotword_stats::init(pool) 注入 DB 连接
- frontend/src-tauri/src/transcription_preferences.rs：在 save_transcription_hotwords 和 get_transcription_hotwords 两个入口末尾调 hotword_stats::cache_raw，确保流式缓存与 LLM 缓存同步
- frontend/src-tauri/src/audio/recording_saver.rs：add_transcript_segment 存储后调 record_segment（fire and forget）

### 3. 前端

- 新建 frontend/src/hooks/useHotwordHitStats.ts
- 新建 frontend/src/components/HotwordHitStatsPanel.tsx
- 6 locale × 7 keys：en-US / en-GB / zh-CN / zh-TW / ja-JP / ko-KR frontend/locales/{locale}/settings.json
- frontend/src/app/settings/page.tsx Transcriptionmodels tab 挂载

### 4. 文档

- docs/hotword_hitrate.md：用户视角说明 + 30 天清理说明

### 5. CHANGELOG

- CHANGELOG.md Unreleased / Added 一行

## 测试 gates

- pnpm check:i18n (i18n 键完整)
- pnpm test:i18n (17/17)
- pnpm build (build 11/11)
- Rust 单元测试由 CI 跑（沙箱无 cargo）

## Commit

```
feat(stats): hotword hit-rate panel with SQLite counter (PR-A, Wave 22)

Adds a per-hotword hit-rate counter so users can see which configured
hotwords actually fire during ASR vs which are dead weight.

Backend (Rust):
- migrations/20260719000000_add_hotword_hit_stats.sql: new table + index
- src/hotword_stats.rs: record_segment / record_segments_batch /
  get_stats / cleanup_old + 3 unit tests
- src/lib.rs: declare hotword_stats module + register
  get_hotword_hit_stats Tauri command; init pool in setup hook
- src/transcription_preferences.rs: cache_raw on save and load paths
- src/audio/recording_saver.rs: hook record_segment into
  add_transcript_segment fire-and-forget path

Frontend:
- hooks/useHotwordHitStats.ts: invoke wrapper
- components/HotwordHitStatsPanel.tsx: table + bar chart
- 6 locales settings.stats.* (7 keys each)
- app/settings/page.tsx: mount in Transcriptionmodels tab

Docs:
- docs/hotword_hitrate.md
- docs/superpowers/specs/2026-07-19-hotword-hitrate.md
- docs/superpowers/plans/2026-07-19-hotword-hitrate.md
- CHANGELOG.md Unreleased / Added

Decision points (user approved B + B + B):
- matching: full-word case-insensitive
- retention: 30-day rolling cleanup
- UI elements: hotword + hit_count + last_hit_at

Scope note: covers the streaming recording path only. One-shot
import / retranscription paths are deferred to PR-A2.
```

## PR 标题

feat(stats): hotword hit-rate panel with SQLite counter (PR-A, Wave 22)
