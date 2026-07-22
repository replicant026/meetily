-- Allow speaker profiles without voice embeddings (name-only enrollment)
-- Embedding will be populated when diarization captures voice data.
ALTER TABLE speaker_profiles RENAME TO speaker_profiles_old;
CREATE TABLE speaker_profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    embedding BLOB,
    slot INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_seen_at TEXT,
    meeting_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(display_name, slot)
);
INSERT INTO speaker_profiles SELECT * FROM speaker_profiles_old;
DROP TABLE speaker_profiles_old;
CREATE INDEX IF NOT EXISTS idx_speaker_profiles_name ON speaker_profiles(display_name);
