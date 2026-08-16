-- Persist workspace notes and action-item completion states per meeting
CREATE TABLE IF NOT EXISTS meeting_workspace_notes (
  meeting_id TEXT PRIMARY KEY NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meeting_action_states (
  meeting_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (meeting_id, action_id)
);
