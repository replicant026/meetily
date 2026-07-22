-- Migration: Add speaker profiles for cross-meeting speaker recognition
-- Stores voice fingerprints (embedding vectors) linked to display names.
-- When a user renames a speaker, their cluster centroid embedding is enrolled
-- here so future meetings can auto-match known speakers.

CREATE TABLE IF NOT EXISTS speaker_profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    -- Embedding stored as raw f32 bytes (192 × 4 = 768 bytes)
    embedding BLOB NOT NULL,
    -- Optional: store multiple embeddings per person (up to 3, like Talat)
    slot INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_seen_at TEXT,
    -- Number of meetings where this speaker was identified
    meeting_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(id, slot)
);

-- Index for fast cosine-similarity search (not needed for small N, but good for listing)
CREATE INDEX IF NOT EXISTS idx_speaker_profiles_name ON speaker_profiles(display_name);
