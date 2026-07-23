-- Normalize speaker storage: people + voice references + suggestions.
-- Migrates data from legacy speaker_profiles, then drops that table.

-- 1. New tables
CREATE TABLE speaker_people (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email TEXT,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE speaker_voice_references (
  id TEXT PRIMARY KEY NOT NULL,
  speaker_id TEXT NOT NULL REFERENCES speaker_people(id) ON DELETE CASCADE,
  embedding BLOB NOT NULL,
  audio_relative_path TEXT,
  waveform_peaks BLOB,
  meeting_id TEXT,
  source_start_ms INTEGER NOT NULL DEFAULT 0,
  source_end_ms INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT 'unknown',
  quality_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('pending','confirmed','rejected','legacy')),
  origin TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(audio_relative_path IS NULL OR audio_relative_path NOT LIKE '/%')
);
CREATE INDEX idx_voice_references_speaker ON speaker_voice_references(speaker_id, status);
CREATE INDEX idx_voice_references_meeting ON speaker_voice_references(meeting_id);

CREATE TABLE speaker_match_suggestions (
  id TEXT PRIMARY KEY NOT NULL,
  meeting_id TEXT NOT NULL,
  source_label TEXT NOT NULL,
  speaker_id TEXT NOT NULL REFERENCES speaker_people(id) ON DELETE CASCADE,
  reference_id TEXT REFERENCES speaker_voice_references(id) ON DELETE SET NULL,
  confidence REAL NOT NULL,
  segment_ids_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX idx_speaker_suggestions_pending
  ON speaker_match_suggestions(meeting_id, status);

-- 2. Migrate data from legacy speaker_profiles
--    Insert distinct display_name rows as people
INSERT OR IGNORE INTO speaker_people (id, display_name, created_at, updated_at)
SELECT
  'person-' || id,
  display_name,
  created_at,
  created_at
FROM speaker_profiles
GROUP BY display_name;

--    Copy every embedding row as a legacy voice reference
INSERT INTO speaker_voice_references
  (id, speaker_id, embedding, status, origin, created_at)
SELECT
  'ref-' || sp.id,
  'person-' || p.id,
  sp.embedding,
  'legacy',
  'legacy',
  sp.created_at
FROM speaker_profiles sp
JOIN (
  SELECT id, display_name FROM speaker_profiles GROUP BY display_name
) p ON p.display_name = sp.display_name
WHERE sp.embedding IS NOT NULL;

-- 3. Drop legacy table
DROP TABLE IF EXISTS speaker_profiles;
