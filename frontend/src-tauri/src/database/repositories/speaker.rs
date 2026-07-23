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

/// A stored speaker profile: display name + voice embedding.
#[derive(Debug, Clone, Serialize)]
pub struct SpeakerProfile {
    pub id: String,
    pub display_name: String,
    pub embedding: Option<Vec<f32>>,
    pub slot: i32,
    pub created_at: String,
    pub last_seen_at: Option<String>,
    pub meeting_count: i32,
}

/// Maximum enrollment slots per speaker (voice prints).
pub const MAX_SPEAKER_SLOTS: usize = 3;

/// Cosine similarity threshold for matching.
/// Above this → automatic match. Below but above 0.3 → suggest mode.
pub const AUTO_MATCH_THRESHOLD: f32 = 0.65;
pub const SUGGEST_MATCH_THRESHOLD: f32 = 0.45;

pub struct SpeakerRepository;

impl SpeakerRepository {
    // ── CRUD ──────────────────────────────────────────────────────────────

    /// Save or update a speaker profile. Creates a new slot if under limit,
    /// otherwise replaces the oldest slot.
    pub async fn upsert_profile(
        pool: &SqlitePool,
        display_name: &str,
        embedding: &[f32],
    ) -> Result<String, sqlx::Error> {
        let embedding_bytes = if embedding.is_empty() {
            None
        } else {
            Some(embedding_to_bytes(embedding))
        };
        let now = chrono::Utc::now().to_rfc3339();

        // Check existing slots for this name
        let existing = sqlx::query_scalar::<_, i32>(
            "SELECT slot FROM speaker_profiles WHERE display_name = ? ORDER BY slot DESC LIMIT 1",
        )
        .bind(display_name)
        .fetch_all(pool)
        .await?;

        let slot = if existing.len() >= MAX_SPEAKER_SLOTS {
            // Replace the oldest slot (highest slot number)
            *existing.last().unwrap_or(&0)
        } else {
            // New slot: 0, 1, or 2
            existing.last().map_or(0, |s| s + 1)
        };

        let id = format!("speaker-{}", Uuid::new_v4());

        sqlx::query(
            r#"INSERT INTO speaker_profiles (id, display_name, embedding, slot, created_at, meeting_count)
               VALUES (?, ?, ?, ?, ?, 1)
               ON CONFLICT(display_name, slot) DO UPDATE SET
                   embedding = excluded.embedding,
                   last_seen_at = NULL,
                   meeting_count = meeting_count + 1"#,
        )
        .bind(&id)
        .bind(display_name)
        .bind(&embedding_bytes)
        .bind(slot)
        .bind(&now)
        .execute(pool)
        .await?;

        Ok(id)
    }

    /// List all unique speaker names with their latest embedding.
    pub async fn list_profiles(
        pool: &SqlitePool,
    ) -> Result<Vec<SpeakerProfile>, sqlx::Error> {
        let rows = sqlx::query_as::<_, RawProfile>(
            r#"SELECT id, display_name, embedding, slot, created_at, last_seen_at, meeting_count
               FROM speaker_profiles
               ORDER BY display_name, slot"#,
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().filter_map(|r| r.try_into().ok()).collect())
    }

    /// Delete all profiles for a given display name.
    pub async fn delete_by_name(
        pool: &SqlitePool,
        display_name: &str,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM speaker_profiles WHERE display_name = ?")
            .bind(display_name)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Rename a speaker across all profiles.
    pub async fn rename(
        pool: &SqlitePool,
        old_name: &str,
        new_name: &str,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE speaker_profiles SET display_name = ? WHERE display_name = ?",
        )
        .bind(new_name)
        .bind(old_name)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    // ── Matching ──────────────────────────────────────────────────────────

    /// Find the best matching speaker profile for an embedding.
    /// Returns (display_name, similarity) or None if below threshold.
    pub async fn find_match(
        pool: &SqlitePool,
        embedding: &[f32],
        min_threshold: f32,
    ) -> Result<Option<(String, f32)>, sqlx::Error> {
        let profiles = Self::list_profiles(pool).await?;

        let mut best_name: Option<String> = None;
        let mut best_sim: f32 = 0.0;

        // Group by display name, use latest slot's embedding for comparison
        let mut by_name: std::collections::HashMap<String, Vec<&SpeakerProfile>> =
            std::collections::HashMap::new();
        for p in &profiles {
            by_name.entry(p.display_name.clone()).or_default().push(p);
        }

        for (_name, slots) in &by_name {
            // Use the latest slot (highest slot number)
            if let Some(latest) = slots.iter().filter(|s| s.embedding.is_some()).max_by_key(|s| s.slot) {
                let sim = cosine_similarity(embedding, latest.embedding.as_ref().unwrap());
                if sim > best_sim {
                    best_sim = sim;
                    best_name = Some(latest.display_name.clone());
                }
            }
        }

        match best_name {
            Some(name) if best_sim >= min_threshold => Ok(Some((name, best_sim))),
            _ => Ok(None),
        }
    }

    /// Bulk-match: match multiple cluster embeddings against known profiles.
    /// Returns Vec<(cluster_index, display_name, similarity)> for matches above threshold.
    pub async fn match_clusters(
        pool: &SqlitePool,
        cluster_embeddings: &[(usize, Vec<f32>)], // (cluster_index, centroid_embedding)
        min_threshold: f32,
    ) -> Result<Vec<(usize, String, f32)>, sqlx::Error> {
        let profiles = Self::list_profiles(pool).await?;
        if profiles.is_empty() {
            return Ok(Vec::new());
        }

        // Group by display name, use latest slot
        let mut by_name: std::collections::HashMap<String, &SpeakerProfile> =
            std::collections::HashMap::new();
        for p in &profiles {
            by_name.entry(p.display_name.clone())
                .and_modify(|existing| {
                    if p.slot > existing.slot { *existing = p; }
                })
                .or_insert(p);
        }

        let profiles_vec: Vec<(&str, &Vec<f32>)> = by_name.iter()
            .filter_map(|(name, p)| p.embedding.as_ref().map(|e| (name.as_str(), e)))
            .collect();

        let mut matches = Vec::new();

        for (cluster_idx, centroid) in cluster_embeddings {
            let mut best_name: Option<String> = None;
            let mut best_sim: f32 = 0.0;

            for (name, emb) in &profiles_vec {
                let sim = cosine_similarity(centroid, emb);
                if sim > best_sim {
                    best_sim = sim;
                    best_name = Some(name.to_string());
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

    /// Get all unique speaker names across all profiles.
    pub async fn get_all_names(
        pool: &SqlitePool,
    ) -> Result<Vec<String>, sqlx::Error> {
        let names = sqlx::query_scalar::<_, String>(
            "SELECT DISTINCT display_name FROM speaker_profiles ORDER BY display_name",
        )
        .fetch_all(pool)
        .await?;
        Ok(names)
    }

    // ── Normalized Person CRUD ──────────────────────────────────────────

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
                SELECT sp.speaker_id,
                       COUNT(DISTINCT vr.meeting_id) AS meeting_count
                FROM speaker_voice_references vr
                JOIN speaker_people sp ON sp.id = vr.speaker_id
                WHERE vr.meeting_id IS NOT NULL
                GROUP BY sp.speaker_id
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
                SELECT sp.speaker_id,
                       COUNT(DISTINCT vr.meeting_id) AS meeting_count
                FROM speaker_voice_references vr
                JOIN speaker_people sp ON sp.id = vr.speaker_id
                WHERE vr.meeting_id IS NOT NULL
                GROUP BY sp.speaker_id
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

/// Raw DB row before embedding deserialization.
#[derive(sqlx::FromRow)]
struct RawProfile {
    id: String,
    display_name: String,
    embedding: Option<Vec<u8>>,
    slot: i32,
    created_at: String,
    last_seen_at: Option<String>,
    meeting_count: i32,
}

impl TryInto<SpeakerProfile> for RawProfile {
    type Error = anyhow::Error;

    fn try_into(self) -> Result<SpeakerProfile, Self::Error> {
        Ok(SpeakerProfile {
            id: self.id,
            display_name: self.display_name,
            embedding: self.embedding.as_deref().and_then(bytes_to_embedding),
            slot: self.slot,
            created_at: self.created_at,
            last_seen_at: self.last_seen_at,
            meeting_count: self.meeting_count,
        })
    }
}

/// Convert f32 slice to little-endian bytes for SQLite BLOB storage.
fn embedding_to_bytes(embedding: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(embedding.len() * 4);
    for &v in embedding {
        bytes.extend_from_slice(&v.to_le_bytes());
    }
    bytes
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

    #[test]
    fn embedding_roundtrip() {
        let original = vec![1.0f32, -0.5, 0.25, 3.14];
        let bytes = embedding_to_bytes(&original);
        let recovered = bytes_to_embedding(&bytes).unwrap();
        for (a, b) in original.iter().zip(recovered.iter()) {
            assert!((a - b).abs() < 1e-6);
        }
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
}
