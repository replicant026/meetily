use anyhow::Result;
use sqlx::SqlitePool;
use uuid::Uuid;

use serde::{Deserialize, Serialize};

/// Normalized person DTO.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeakerPersonDto {
    pub id: String,
    pub display_name: String,
    pub email: Option<String>,
    pub color: Option<String>,
    pub reference_count: i64,
    pub playable_reference_count: i64,
    pub meeting_count: i64,
    pub last_seen_at: Option<String>,
}

/// Cosine similarity threshold for matching.
/// Above this → automatic match. Below but above 0.3 → suggest mode.
pub const AUTO_MATCH_THRESHOLD: f32 = 0.65;
pub const SUGGEST_MATCH_THRESHOLD: f32 = 0.45;

pub struct SpeakerRepository;

impl SpeakerRepository {
    // ── Matching ──────────────────────────────────────────────────────────

    /// Find the best matching speaker for an embedding.
    /// Queries confirmed/legacy references from the normalized schema,
    /// groups by speaker display name, and returns the best cosine match.
    /// Returns (display_name, similarity, reference_id).
    pub async fn find_match(
        pool: &SqlitePool,
        embedding: &[f32],
        min_threshold: f32,
    ) -> Result<Option<(String, f32, String)>, sqlx::Error> {
        let rows = sqlx::query_as::<_, RawEmbeddingRef>(
            r#"SELECT r.id, r.embedding, p.display_name
               FROM speaker_voice_references r
               JOIN speaker_people p ON p.id = r.speaker_id
               WHERE r.status IN ('confirmed', 'legacy') AND r.embedding IS NOT NULL"#,
        )
        .fetch_all(pool)
        .await?;

        let mut best_name: Option<String> = None;
        let mut best_ref_id: Option<String> = None;
        let mut best_sim: f32 = 0.0;

        for row in &rows {
            if let Some(ref_emb) = bytes_to_embedding(&row.embedding) {
                let sim = cosine_similarity(embedding, &ref_emb);
                if sim > best_sim {
                    best_sim = sim;
                    best_name = Some(row.display_name.clone());
                    best_ref_id = Some(row.id.clone());
                }
            }
        }

        match (best_name, best_ref_id) {
            (Some(name), Some(ref_id)) if best_sim >= min_threshold => Ok(Some((name, best_sim, ref_id))),
            _ => Ok(None),
        }
    }

    /// Bulk-match: match multiple cluster embeddings against known speakers.
    /// Returns Vec<(cluster_index, display_name, similarity)> for matches above threshold.
    pub async fn match_clusters(
        pool: &SqlitePool,
        cluster_embeddings: &[(usize, Vec<f32>)],
        min_threshold: f32,
    ) -> Result<Vec<(usize, String, f32)>, sqlx::Error> {
        let rows = sqlx::query_as::<_, RawEmbeddingRef>(
            r#"SELECT r.id, r.embedding, p.display_name
               FROM speaker_voice_references r
               JOIN speaker_people p ON p.id = r.speaker_id
               WHERE r.status IN ('confirmed', 'legacy') AND r.embedding IS NOT NULL"#,
        )
        .fetch_all(pool)
        .await?;

        let references: Vec<(String, Vec<f32>)> = rows
            .into_iter()
            .filter_map(|r| bytes_to_embedding(&r.embedding).map(|emb| (r.display_name, emb)))
            .collect();

        if references.is_empty() {
            return Ok(Vec::new());
        }

        let mut matches = Vec::new();

        for (cluster_idx, centroid) in cluster_embeddings {
            let mut best_name: Option<String> = None;
            let mut best_sim: f32 = 0.0;

            for (name, emb) in &references {
                let sim = cosine_similarity(centroid, emb);
                if sim > best_sim {
                    best_sim = sim;
                    best_name = Some(name.clone());
                }
            }

            if let Some(name) = best_name {
                if best_sim >= min_threshold {
                    matches.push((*cluster_idx, name, best_sim));
                }
            }
        }

        Ok(matches)
    }

    // ── Normalized Person CRUD ──────────────────────────────────────────

    /// Find a person by display name. Returns (id, display_name).
    pub async fn find_person_by_name(
        pool: &SqlitePool,
        display_name: &str,
    ) -> Result<Option<(String, String)>, sqlx::Error> {
        let row = sqlx::query_as::<_, (String, String)>(
            "SELECT id, display_name FROM speaker_people WHERE display_name = ?",
        )
        .bind(display_name)
        .fetch_optional(pool)
        .await?;
        Ok(row)
    }

    /// Get or create a person by display name. Returns the person id.
    pub async fn get_or_create_person(
        pool: &SqlitePool,
        display_name: &str,
    ) -> Result<String, sqlx::Error> {
        if let Some((id, _)) = Self::find_person_by_name(pool, display_name).await? {
            return Ok(id);
        }
        Self::create_person(pool, display_name, None, None).await
    }

    /// Delete a person by id.
    pub async fn delete_person(
        pool: &SqlitePool,
        id: &str,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM speaker_people WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// List all people with reference and meeting counts.
    pub async fn list_people(
        pool: &SqlitePool,
    ) -> Result<Vec<SpeakerPersonDto>, sqlx::Error> {
        let rows = sqlx::query_as::<_, RawPersonRow>(
            r#"SELECT
                p.id, p.display_name, p.email, p.color,
                p.last_seen_at,
                COALESCE(rc.ref_count, 0) AS reference_count,
                COALESCE(rc.playable_count, 0) AS playable_reference_count,
                COALESCE(mc.meeting_count, 0) AS meeting_count
            FROM speaker_people p
            LEFT JOIN (
                SELECT speaker_id,
                       COUNT(*) AS ref_count,
                       SUM(CASE WHEN audio_relative_path IS NOT NULL THEN 1 ELSE 0 END) AS playable_count
                FROM speaker_voice_references
                GROUP BY speaker_id
            ) rc ON rc.speaker_id = p.id
            LEFT JOIN (
                SELECT speaker_id, COUNT(DISTINCT meeting_id) AS meeting_count
                FROM speaker_voice_references
                WHERE meeting_id IS NOT NULL
                GROUP BY speaker_id
            ) mc ON mc.speaker_id = p.id
            ORDER BY p.display_name"#,
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into_dto()).collect())
    }

    /// Get a single person by id.
    pub async fn get_person(
        pool: &SqlitePool,
        id: &str,
    ) -> Result<Option<SpeakerPersonDto>, sqlx::Error> {
        let row = sqlx::query_as::<_, RawPersonRow>(
            r#"SELECT
                p.id, p.display_name, p.email, p.color,
                p.last_seen_at,
                COALESCE(rc.ref_count, 0) AS reference_count,
                COALESCE(rc.playable_count, 0) AS playable_reference_count,
                COALESCE(mc.meeting_count, 0) AS meeting_count
            FROM speaker_people p
            LEFT JOIN (
                SELECT speaker_id,
                       COUNT(*) AS ref_count,
                       SUM(CASE WHEN audio_relative_path IS NOT NULL THEN 1 ELSE 0 END) AS playable_count
                FROM speaker_voice_references
                GROUP BY speaker_id
            ) rc ON rc.speaker_id = p.id
            LEFT JOIN (
                SELECT speaker_id, COUNT(DISTINCT meeting_id) AS meeting_count
                FROM speaker_voice_references
                WHERE meeting_id IS NOT NULL
                GROUP BY speaker_id
            ) mc ON mc.speaker_id = p.id
            WHERE p.id = ?"#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into_dto()))
    }

    /// Create a new person. Returns the new id.
    pub async fn create_person(
        pool: &SqlitePool,
        display_name: &str,
        email: Option<&str>,
        color: Option<&str>,
    ) -> Result<String, sqlx::Error> {
        let id = format!("person-{}", Uuid::new_v4());
        let now = chrono::Utc::now().to_rfc3339();

        sqlx::query(
            r#"INSERT INTO speaker_people (id, display_name, email, color, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)"#,
        )
        .bind(&id)
        .bind(display_name)
        .bind(email)
        .bind(color)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await?;

        Ok(id)
    }

    /// Rename a person by id.
    pub async fn rename_person(
        pool: &SqlitePool,
        id: &str,
        new_name: &str,
    ) -> Result<bool, sqlx::Error> {
        let now = chrono::Utc::now().to_rfc3339();
        let result = sqlx::query(
            "UPDATE speaker_people SET display_name = ?, updated_at = ? WHERE id = ?",
        )
        .bind(new_name)
        .bind(&now)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Merge source person into target: move all references, then delete source.
    /// Runs in a single transaction.
    pub async fn merge_people(
        pool: &SqlitePool,
        source_id: &str,
        target_id: &str,
    ) -> Result<(), sqlx::Error> {
        let mut tx = pool.begin().await?;

        // Move voice references
        sqlx::query(
            "UPDATE OR IGNORE speaker_voice_references SET speaker_id = ? WHERE speaker_id = ?",
        )
        .bind(target_id)
        .bind(source_id)
        .execute(&mut *tx)
        .await?;

        // Move suggestions
        sqlx::query(
            "UPDATE OR IGNORE speaker_match_suggestions SET speaker_id = ? WHERE speaker_id = ?",
        )
        .bind(target_id)
        .bind(source_id)
        .execute(&mut *tx)
        .await?;

        // Delete source person (cascade deletes orphaned references/suggestions)
        sqlx::query("DELETE FROM speaker_people WHERE id = ?")
            .bind(source_id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }
}

// ── Raw person row ───────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct RawPersonRow {
    id: String,
    display_name: String,
    email: Option<String>,
    color: Option<String>,
    last_seen_at: Option<String>,
    reference_count: i64,
    playable_reference_count: i64,
    meeting_count: i64,
}

impl RawPersonRow {
    fn into_dto(self) -> SpeakerPersonDto {
        SpeakerPersonDto {
            id: self.id,
            display_name: self.display_name,
            email: self.email,
            color: self.color,
            reference_count: self.reference_count,
            playable_reference_count: self.playable_reference_count,
            meeting_count: self.meeting_count,
            last_seen_at: self.last_seen_at,
        }
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/// Raw row for embedding matching queries.
#[derive(sqlx::FromRow)]
struct RawEmbeddingRef {
    id: String,
    embedding: Vec<u8>,
    display_name: String,
}

/// Convert SQLite BLOB bytes back to f32 slice.
fn bytes_to_embedding(bytes: &[u8]) -> Option<Vec<f32>> {
    if bytes.len() % 4 != 0 || bytes.is_empty() {
        return None;
    }
    let chunks = bytes.chunks_exact(4);
    Some(chunks.map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect())
}

/// Cosine similarity between two vectors.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cosine_identical_vectors() {
        let a = vec![1.0, 0.0, 0.0];
        assert!((cosine_similarity(&a, &a) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn cosine_orthogonal_vectors() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        assert!(cosine_similarity(&a, &b).abs() < 1e-6);
    }

    // ── Integration tests (require tokio) ──────────────────────────────

    use crate::database::repositories::voice_reference::{
        CreateReferenceParams, VoiceReferenceRepository,
    };

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .unwrap();
        pool
    }

    fn fixture_reference() -> CreateReferenceParams {
        CreateReferenceParams {
            meeting_id: None,
            embedding: vec![0.25; 256],
            audio_relative_path: None,
            waveform_peaks: None,
            source_start_ms: 0,
            source_end_ms: 1000,
            duration_ms: 1000,
            channel: "unknown".into(),
            quality_score: 0.8,
            status: "confirmed".into(),
            origin: "manual".into(),
        }
    }

    #[tokio::test]
    async fn merge_moves_references_to_target_and_deletes_source() {
        let pool = test_pool().await;
        let ana =
            SpeakerRepository::create_person(&pool, "Ana", None, None)
                .await
                .unwrap();
        let anna =
            SpeakerRepository::create_person(&pool, "Anna", None, None)
                .await
                .unwrap();
        VoiceReferenceRepository::create(&pool, &anna, &fixture_reference())
            .await
            .unwrap();
        SpeakerRepository::merge_people(&pool, &anna, &ana)
            .await
            .unwrap();
        assert_eq!(
            VoiceReferenceRepository::list_for_person(&pool, &ana)
                .await
                .unwrap()
                .len(),
            1
        );
        assert!(
            SpeakerRepository::get_person(&pool, &anna)
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn create_and_list_person() {
        let pool = test_pool().await;
        let id = SpeakerRepository::create_person(&pool, "Bob", Some("b@x.com"), Some("#ff0000"))
            .await
            .unwrap();
        let person = SpeakerRepository::get_person(&pool, &id).await.unwrap().unwrap();
        assert_eq!(person.display_name, "Bob");
        assert_eq!(person.email.as_deref(), Some("b@x.com"));
        assert_eq!(person.color.as_deref(), Some("#ff0000"));
        assert_eq!(person.reference_count, 0);
    }

    #[tokio::test]
    async fn rename_person() {
        let pool = test_pool().await;
        let id = SpeakerRepository::create_person(&pool, "Old", None, None)
            .await
            .unwrap();
        assert!(SpeakerRepository::rename_person(&pool, &id, "New").await.unwrap());
        let person = SpeakerRepository::get_person(&pool, &id).await.unwrap().unwrap();
        assert_eq!(person.display_name, "New");
    }

    #[tokio::test]
    async fn list_people_shows_reference_counts() {
        let pool = test_pool().await;
        let p = SpeakerRepository::create_person(&pool, "X", None, None)
            .await
            .unwrap();
        VoiceReferenceRepository::create(&pool, &p, &fixture_reference())
            .await
            .unwrap();
        VoiceReferenceRepository::create(&pool, &p, &fixture_reference())
            .await
            .unwrap();
        let people = SpeakerRepository::list_people(&pool).await.unwrap();
        assert_eq!(people.len(), 1);
        assert_eq!(people[0].reference_count, 2);
    }

    #[tokio::test]
    async fn find_match_matches_confirmed_references() {
        let pool = test_pool().await;
        let p = SpeakerRepository::create_person(&pool, "Alice", None, None)
            .await
            .unwrap();
        let mut params = fixture_reference();
        params.embedding = vec![1.0; 256];
        VoiceReferenceRepository::create(&pool, &p, &params)
            .await
            .unwrap();

        let result = SpeakerRepository::find_match(&pool, &vec![1.0; 256], 0.5)
            .await
            .unwrap();
        assert!(result.is_some());
        let (name, sim, _ref_id) = result.unwrap();
        assert_eq!(name, "Alice");
        assert!(sim > 0.99);
    }

    #[tokio::test]
    async fn find_match_returns_none_below_threshold() {
        let pool = test_pool().await;
        let p = SpeakerRepository::create_person(&pool, "Bob", None, None)
            .await
            .unwrap();
        let mut params = fixture_reference();
        params.embedding = [vec![1.0; 256]].concat();
        VoiceReferenceRepository::create(&pool, &p, &params)
            .await
            .unwrap();

        let query: Vec<f32> = [vec![0.0, 1.0, 0.0], vec![0.0; 253]].concat();
        let result = SpeakerRepository::find_match(&pool, &query, 0.5)
            .await
            .unwrap();
        assert!(result.is_none());
    }
}
