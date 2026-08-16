use sqlx::{FromRow, SqlitePool};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimesheetEntry {
    pub id: String,
    pub meeting_id: Option<String>,
    pub client: String,
    pub project: Option<String>,
    pub description: String,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
    pub duration_minutes: i64,
    pub is_extra: bool,
    pub launched: bool,
    pub created_at: String,
    pub updated_at: String,
}

pub struct TimesheetRepository;

impl TimesheetRepository {
    /// Create the timesheet_entries table if it doesn't exist.
    pub async fn ensure_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS timesheet_entries (
                id TEXT PRIMARY KEY,
                meeting_id TEXT,
                client TEXT NOT NULL,
                project TEXT,
                description TEXT NOT NULL,
                date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                duration_minutes INTEGER NOT NULL,
                is_extra INTEGER NOT NULL DEFAULT 0,
                launched INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL
            )",
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// List entries, optionally filtered by month (YYYY-MM).
    pub async fn list_entries(
        pool: &SqlitePool,
        month: Option<&str>,
    ) -> Result<Vec<TimesheetEntry>, sqlx::Error> {
        let entries = match month {
            Some(m) => {
                // Validate month format strictly as YYYY-MM
                let valid = m.len() == 7
                    && m.as_bytes()[4] == b'-'
                    && m.as_bytes()[0..4].iter().all(|b| b.is_ascii_digit())
                    && m.as_bytes()[5..7].iter().all(|b| b.is_ascii_digit());
                if !valid {
                    return Ok(vec![]);
                }
                sqlx::query_as::<_, TimesheetEntry>(
                    "SELECT * FROM timesheet_entries WHERE date LIKE ?1 ORDER BY date, start_time",
                )
                .bind(format!("{}%", m))
                .fetch_all(pool)
                .await?
            }
            None => {
                sqlx::query_as::<_, TimesheetEntry>(
                    "SELECT * FROM timesheet_entries ORDER BY date DESC, start_time LIMIT 100",
                )
                .fetch_all(pool)
                .await?
            }
        };
        Ok(entries)
    }

    /// Insert a new timesheet entry.
    pub async fn create_entry(
        pool: &SqlitePool,
        entry: &TimesheetEntry,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO timesheet_entries (id, meeting_id, client, project, description, date, start_time, end_time, duration_minutes, is_extra, launched, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        )
        .bind(&entry.id)
        .bind(&entry.meeting_id)
        .bind(&entry.client)
        .bind(&entry.project)
        .bind(&entry.description)
        .bind(&entry.date)
        .bind(&entry.start_time)
        .bind(&entry.end_time)
        .bind(entry.duration_minutes)
        .bind(entry.is_extra as i64)
        .bind(entry.launched as i64)
        .bind(&entry.created_at)
        .bind(&entry.updated_at)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Update an existing timesheet entry. Returns true if a row was updated.
    pub async fn update_entry(
        pool: &SqlitePool,
        entry: &TimesheetEntry,
    ) -> Result<bool, sqlx::Error> {
        let res = sqlx::query(
            "UPDATE timesheet_entries SET meeting_id=?1, client=?2, project=?3, description=?4, date=?5, start_time=?6, end_time=?7, duration_minutes=?8, is_extra=?9, launched=?10, updated_at=?11 WHERE id=?12",
        )
        .bind(&entry.meeting_id)
        .bind(&entry.client)
        .bind(&entry.project)
        .bind(&entry.description)
        .bind(&entry.date)
        .bind(&entry.start_time)
        .bind(&entry.end_time)
        .bind(entry.duration_minutes)
        .bind(entry.is_extra as i64)
        .bind(entry.launched as i64)
        .bind(&entry.updated_at)
        .bind(&entry.id)
        .execute(pool)
        .await?;
        Ok(res.rows_affected() > 0)
    }

    /// Delete a timesheet entry. Returns true if a row was deleted.
    pub async fn delete_entry(pool: &SqlitePool, id: &str) -> Result<bool, sqlx::Error> {
        let res = sqlx::query("DELETE FROM timesheet_entries WHERE id=?1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(res.rows_affected() > 0)
    }

    /// Mark an entry as launched (exported) or not.
    pub async fn mark_launched(
        pool: &SqlitePool,
        id: &str,
        launched: bool,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE timesheet_entries SET launched=?1, updated_at=datetime('now') WHERE id=?2",
        )
        .bind(launched as i64)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// List distinct client names (for autocomplete).
    pub async fn list_clients(pool: &SqlitePool) -> Result<Vec<String>, sqlx::Error> {
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT DISTINCT client FROM timesheet_entries ORDER BY client",
        )
        .fetch_all(pool)
        .await?;
        Ok(rows.into_iter().map(|(c,)| c).collect())
    }
}
