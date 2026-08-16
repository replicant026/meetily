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
    /// Initialize FTS5 virtual table and sync triggers.
    /// Safe to call repeatedly (IF NOT EXISTS / IF NOT triggers).
    pub async fn ensure_fts(pool: &SqlitePool) -> Result<(), sqlx::Error> {
        // FTS5 content table backed by transcripts + meetings
        sqlx::query(
            "CREATE VIRTUAL TABLE IF NOT EXISTS meetings_fts USING fts5(
                meeting_id,
                meeting_title,
                transcript_text,
                content='',
                content_rowid=rowid
            )",
        )
        .execute(pool)
        .await?;

        // Triggers removed: FTS content is now external (content='').
        // We populate manually via reindex() and keep it in sync at write
        // time in the application layer.  Triggers on contentless FTS5
        // tables cause "content表 is not a table" errors anyway.

        Ok(())
    }

    /// Full-text search across all meetings.
    /// Returns ranked snippets with <mark> highlighting.
    pub async fn search(
        pool: &SqlitePool,
        query: &str,
        limit: u32,
    ) -> Result<Vec<MeetingSearchResult>, sqlx::Error> {
        let limit = limit.clamp(1, 100) as i64;

        let rows = sqlx::query_as::<_, (String, String, String, String, f64)>(
            "SELECT f.meeting_id,
                    m.title,
                    snippet(meetings_fts, 2, '<mark>', '</mark>', '...', 40),
                    t.timestamp,
                    rank
             FROM meetings_fts f
             JOIN meetings m ON m.id = f.meeting_id
             JOIN transcripts t ON t.meeting_id = f.meeting_id
             WHERE meetings_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2",
        )
        .bind(query)
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
        // Wipe existing index
        sqlx::query("DELETE FROM meetings_fts")
            .execute(pool)
            .await?;

        let res = sqlx::query(
            "INSERT INTO meetings_fts(rowid, meeting_id, meeting_title, transcript_text)
             SELECT t.rowid, t.meeting_id, COALESCE(m.title, ''), t.transcript
             FROM transcripts t
             JOIN meetings m ON m.id = t.meeting_id",
        )
        .execute(pool)
        .await?;

        Ok(res.rows_affected())
    }

    /// Add a single transcript to the FTS index (call after insert).
    pub async fn index_transcript(
        pool: &SqlitePool,
        meeting_id: &str,
        meeting_title: &str,
        transcript: &str,
    ) -> Result<(), sqlx::Error> {
        // Get the rowid of the transcript we just inserted
        let row: Option<(i64,)> =
            sqlx::query_as("SELECT rowid FROM transcripts WHERE meeting_id = ?1 LIMIT 1")
                .bind(meeting_id)
                .fetch_optional(pool)
                .await?;

        if let Some((rowid,)) = row {
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
        }
        Ok(())
    }

    /// Remove a meeting from the FTS index (call before delete).
    pub async fn remove_meeting(pool: &SqlitePool, meeting_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM meetings_fts WHERE meeting_id = ?1")
            .bind(meeting_id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
