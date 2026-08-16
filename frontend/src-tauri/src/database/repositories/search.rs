use sqlx::SqlitePool;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingSearchResult {
    pub meeting_id: String,
    pub meeting_title: String,
    pub snippet: String,
    pub timestamp: String,
    pub rank: f64,
}

pub struct SearchRepository;

impl SearchRepository {
    /// Initialize FTS5 virtual table for full-text search.
    /// Content-backed (not contentless) so snippet(), DELETE, and column reads work.
    /// Safe to call repeatedly (IF NOT EXISTS).
    pub async fn ensure_fts(pool: &SqlitePool) -> Result<(), sqlx::Error> {
        sqlx::query(
            "CREATE VIRTUAL TABLE IF NOT EXISTS meetings_fts USING fts5(
                meeting_id,
                meeting_title,
                transcript_text
            )",
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Sanitize a user query string for FTS5 MATCH.
    /// Wraps the entire query in double-quotes so special FTS5 characters
    /// (", *, :, ^, AND/OR, parentheses) are treated as literals.
    fn sanitize_fts_query(query: &str) -> String {
        // Escape any double-quotes inside the query by doubling them
        let escaped = query.replace('"', "\"\"");
        format!("\"{}\"", escaped)
    }

    /// Full-text search across all meetings.
    /// Returns ranked snippets with <mark> highlighting.
    pub async fn search(
        pool: &SqlitePool,
        query: &str,
        limit: u32,
    ) -> Result<Vec<MeetingSearchResult>, sqlx::Error> {
        let limit = limit.clamp(1, 100) as i64;
        let safe_query = Self::sanitize_fts_query(query);

        let rows = sqlx::query_as::<_, (String, String, String, String, f64)>(
            "SELECT f.meeting_id,
                    f.meeting_title,
                    snippet(meetings_fts, 2, '<mark>', '</mark>', '...', 40),
                    COALESCE(
                        (SELECT t.timestamp FROM transcripts t WHERE t.meeting_id = f.meeting_id LIMIT 1),
                        ''
                    ),
                    rank
             FROM meetings_fts f
             WHERE meetings_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2",
        )
        .bind(safe_query)
        .bind(limit)
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(
                |(meeting_id, meeting_title, snippet, timestamp, rank)| {
                    MeetingSearchResult {
                        meeting_id,
                        meeting_title,
                        snippet,
                        timestamp,
                        rank,
                    }
                },
            )
            .collect())
    }

    /// Rebuild the FTS index from scratch by copying all transcripts into it.
    /// Returns the number of rows inserted.
    pub async fn reindex(pool: &SqlitePool) -> Result<u64, sqlx::Error> {
        // Clear existing index
        sqlx::query("DELETE FROM meetings_fts")
            .execute(pool)
            .await?;

        let res = sqlx::query(
            "INSERT INTO meetings_fts(rowid, meeting_id, meeting_title, transcript_text)
             SELECT abs(random()) % 9223372036854775807, m.id, COALESCE(m.title, ''), t.transcript
             FROM transcripts t
             JOIN meetings m ON m.id = t.meeting_id",
        )
        .execute(pool)
        .await?;

        Ok(res.rows_affected())
    }

    /// Derive a deterministic rowid from a meeting_id string.
    /// Uses a simple hash so re-indexing the same meeting replaces the old row.
    fn meeting_rowid(meeting_id: &str) -> i64 {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        meeting_id.hash(&mut hasher);
        // FTS5 rowids must be positive; mask off sign bit
        (hasher.finish() as i64).abs() % 9223372036854775807 + 1
    }

    /// Add a single transcript to the FTS index (call after insert).
    /// Uses a deterministic rowid so re-indexing replaces the old entry.
    pub async fn index_transcript(
        pool: &SqlitePool,
        meeting_id: &str,
        meeting_title: &str,
        transcript: &str,
    ) -> Result<(), sqlx::Error> {
        let rowid = Self::meeting_rowid(meeting_id);

        // Delete old entry for this meeting (idempotent re-index)
        sqlx::query("DELETE FROM meetings_fts WHERE rowid = ?1")
            .bind(rowid)
            .execute(pool)
            .await?;

        sqlx::query(
            "INSERT INTO meetings_fts(rowid, meeting_id, meeting_title, transcript_text)
             VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(rowid)
        .bind(meeting_id)
        .bind(meeting_title)
        .bind(transcript)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Remove a meeting from the FTS index (call before delete).
    pub async fn remove_meeting(pool: &SqlitePool, meeting_id: &str) -> Result<(), sqlx::Error> {
        let rowid = Self::meeting_rowid(meeting_id);
        sqlx::query("DELETE FROM meetings_fts WHERE rowid = ?1")
            .bind(rowid)
            .execute(pool)
            .await?;
        Ok(())
    }
}
