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
    /// On first creation (existing DB with data), runs a one-time reindex.
    pub async fn ensure_fts(pool: &SqlitePool) -> Result<(), sqlx::Error> {
        // Check if table already exists
        let table_exists: Option<(String,)> =
            sqlx::query_as("SELECT name FROM sqlite_master WHERE type='table' AND name='meetings_fts'")
                .fetch_optional(pool)
                .await?;

        sqlx::query(
            "CREATE VIRTUAL TABLE IF NOT EXISTS meetings_fts USING fts5(
                meeting_id UNINDEXED,
                meeting_title,
                transcript_text
            )",
        )
        .execute(pool)
        .await?;

        // If table was just created (didn't exist before), do a one-time reindex
        if table_exists.is_none() {
            let count: Option<(i64,)> =
                sqlx::query_as("SELECT COUNT(*) FROM transcripts")
                    .fetch_optional(pool)
                    .await?;
            if let Some((n,)) = count {
                if n > 0 {
                    log::info!("FTS5 table created on existing DB with {} transcripts, running initial reindex", n);
                    if let Err(e) = Self::reindex(pool).await {
                        log::warn!("FTS5 initial reindex failed: {}", e);
                    }
                }
            }
        }

        Ok(())
    }

    /// Filter out non-alphanumeric tokens that would cause FTS5 syntax errors.
    fn filter_tokens(words: Vec<&str>) -> Vec<String> {
        words
            .into_iter()
            .filter(|w| w.chars().any(|c| c.is_alphanumeric()))
            .map(|w| w.replace('"', "\"\""))
            .collect()
    }

    /// Sanitize a user query string for FTS5 MATCH with AND semantics.
    fn sanitize_fts_query(query: &str) -> String {
        let words = Self::filter_tokens(query.split_whitespace().collect());
        if words.is_empty() {
            return String::new();
        }
        let last = words.len() - 1;
        words
            .iter()
            .enumerate()
            .map(|(i, word)| {
                if i == last {
                    format!("\"{}\"*", word) // prefix match on last token
                } else {
                    format!("\"{}\"", word)
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    }

    /// Sanitize a user query string for FTS5 MATCH with OR semantics.
    /// Used by chat/RAG where any word matching is acceptable.
    /// Keeps all alphanumeric tokens (including short/CJK) — no minimum length filter
    /// to avoid dropping meaningful terms like "AI", "会议", "SLA".
    fn sanitize_fts_query_or(query: &str) -> String {
        let words: Vec<&str> = query
            .split_whitespace()
            .filter(|w| w.chars().any(|c| c.is_alphanumeric()))
            .collect();
        if words.is_empty() {
            return String::new();
        }
        words
            .iter()
            .map(|word| {
                let escaped = word.replace('"', "\"\"");
                format!("\"{}\"*", escaped)
            })
            .collect::<Vec<_>>()
            .join(" OR ")
    }

    /// Execute an FTS5 search with the given sanitized query.
    /// Shared by search() and search_or() to avoid duplication.
    async fn execute_search(
        pool: &SqlitePool,
        safe_query: &str,
        limit: i64,
    ) -> Result<Vec<MeetingSearchResult>, sqlx::Error> {
        if safe_query.is_empty() {
            return Ok(vec![]);
        }

        let rows = sqlx::query_as::<_, (String, String, String, String, f64)>(
            "SELECT f.meeting_id,
                    f.meeting_title,
                    snippet(meetings_fts, 2, '«', '»', '…', 40),
                    COALESCE(
                        (SELECT COALESCE(t.timestamp, '') FROM transcripts t WHERE t.meeting_id = f.meeting_id LIMIT 1),
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

    /// Full-text search across all meetings with AND semantics.
    /// Returns ranked snippets with «» delimiters for matched terms.
    pub async fn search(
        pool: &SqlitePool,
        query: &str,
        limit: u32,
    ) -> Result<Vec<MeetingSearchResult>, sqlx::Error> {
        let safe_query = Self::sanitize_fts_query(query);
        Self::execute_search(pool, &safe_query, limit.clamp(1, 100) as i64).await
    }

    /// Full-text search across all meetings with OR semantics.
    /// Used by chat/RAG where any matching word is relevant.
    pub async fn search_or(
        pool: &SqlitePool,
        query: &str,
        limit: u32,
    ) -> Result<Vec<MeetingSearchResult>, sqlx::Error> {
        let safe_query = Self::sanitize_fts_query_or(query);
        Self::execute_search(pool, &safe_query, limit.clamp(1, 100) as i64).await
    }

    /// Rebuild the FTS index from scratch by copying all transcripts into it.
    /// Aggregates all transcript segments per meeting into a single FTS row.
    /// Returns the number of rows inserted.
    pub async fn reindex(pool: &SqlitePool) -> Result<u64, sqlx::Error> {
        // Clear existing index
        sqlx::query("DELETE FROM meetings_fts")
            .execute(pool)
            .await?;

        // Fetch aggregated transcripts per meeting
        let rows = sqlx::query_as::<_, (String, String, Option<String>)>(
            "SELECT m.id, COALESCE(m.title, ''),
                    GROUP_CONCAT(t.transcript, ' ')
             FROM meetings m
             LEFT JOIN transcripts t ON t.meeting_id = m.id
             GROUP BY m.id",
        )
        .fetch_all(pool)
        .await?;

        let mut count: u64 = 0;
        for (meeting_id, title, transcript) in &rows {
            let rowid = Self::meeting_rowid(meeting_id);
            sqlx::query(
                "INSERT INTO meetings_fts(rowid, meeting_id, meeting_title, transcript_text)
                 VALUES (?1, ?2, ?3, ?4)",
            )
            .bind(rowid)
            .bind(meeting_id)
            .bind(title)
            .bind(transcript.as_deref().unwrap_or(""))
            .execute(pool)
            .await?;
            count += 1;
        }

        Ok(count)
    }

    /// Derive a deterministic rowid from a meeting_id string.
    /// Uses FNV-1a (stable across Rust versions, unlike DefaultHasher).
    pub fn meeting_rowid(meeting_id: &str) -> i64 {
        // FNV-1a 64-bit — deterministic and stable across Rust versions
        let mut hash: u64 = 0xcbf29ce484222325; // FNV offset basis
        for byte in meeting_id.as_bytes() {
            hash ^= *byte as u64;
            hash = hash.wrapping_mul(0x100000001b3); // FNV prime
        }
        // FTS5 rowids must be positive; clear sign bit and prevent i64::MAX overflow
        ((hash & 0x7FFFFFFFFFFFFFFF) % 0x7FFFFFFFFFFFFFFF) as i64 + 1
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

    /// Update only the meeting_title in the FTS index (call after rename).
    pub async fn update_title(
        pool: &SqlitePool,
        meeting_id: &str,
        new_title: &str,
    ) -> Result<(), sqlx::Error> {
        let rowid = Self::meeting_rowid(meeting_id);
        sqlx::query("UPDATE meetings_fts SET meeting_title = ?1 WHERE rowid = ?2")
            .bind(new_title)
            .bind(rowid)
            .execute(pool)
            .await?;
        Ok(())
    }
}
