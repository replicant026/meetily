-- Migration: Hotword hit-rate statistics
-- Adds the hotword_hit_stats table used by PR-A (Wave 22) to surface
-- which configured hotwords actually fire during ASR.

CREATE TABLE IF NOT EXISTS hotword_hit_stats (
    hotword TEXT PRIMARY KEY,
    hit_count INTEGER NOT NULL DEFAULT 0,
    last_hit_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hotword_hit_stats_count
    ON hotword_hit_stats(hit_count DESC);
