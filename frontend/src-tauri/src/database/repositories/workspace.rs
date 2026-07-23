use std::collections::HashMap;
use sqlx::SqlitePool;

pub const CREATE_TABLES_SQL: &str = "
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
";

pub struct WorkspaceRepository {
    pool: SqlitePool,
}

impl WorkspaceRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn save_note(&self, meeting_id: &str, content: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO meeting_workspace_notes (meeting_id, content, updated_at)
             VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(meeting_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
        )
        .bind(meeting_id)
        .bind(content)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_note(&self, meeting_id: &str) -> Result<Option<String>, sqlx::Error> {
        let row: Option<(String,)> =
            sqlx::query_as("SELECT content FROM meeting_workspace_notes WHERE meeting_id = ?")
                .bind(meeting_id)
                .fetch_optional(&self.pool)
                .await?;
        Ok(row.map(|r| r.0))
    }

    pub async fn set_action_completed(
        &self,
        meeting_id: &str,
        action_id: &str,
        completed: bool,
    ) -> Result<(), sqlx::Error> {
        let val = if completed { 1 } else { 0 };
        sqlx::query(
            "INSERT INTO meeting_action_states (meeting_id, action_id, completed)
             VALUES (?, ?, ?)
             ON CONFLICT(meeting_id, action_id) DO UPDATE SET completed = excluded.completed",
        )
        .bind(meeting_id)
        .bind(action_id)
        .bind(val)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_action_states(
        &self,
        meeting_id: &str,
    ) -> Result<HashMap<String, bool>, sqlx::Error> {
        let rows: Vec<(String, i32)> = sqlx::query_as(
            "SELECT action_id, completed FROM meeting_action_states WHERE meeting_id = ?",
        )
        .bind(meeting_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|(id, completed)| (id, completed != 0))
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_workspace_repository() -> WorkspaceRepository {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query(CREATE_TABLES_SQL).execute(&pool).await.unwrap();
        WorkspaceRepository::new(pool)
    }

    #[tokio::test]
    async fn workspace_note_and_actions_are_scoped_to_a_meeting() {
        let repository = test_workspace_repository().await;
        repository
            .save_note("meeting-a", "# Follow-up")
            .await
            .unwrap();
        repository
            .set_action_completed("meeting-a", "summary:action_items:0", true)
            .await
            .unwrap();

        assert_eq!(
            repository.get_note("meeting-a").await.unwrap().as_deref(),
            Some("# Follow-up")
        );
        assert!(
            repository.get_action_states("meeting-a").await.unwrap()["summary:action_items:0"]
        );
        assert!(repository
            .get_action_states("meeting-b")
            .await
            .unwrap()
            .is_empty());
    }
}
