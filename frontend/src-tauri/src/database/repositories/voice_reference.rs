use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

// ── DTOs ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq, Eq)]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum RecognitionMode {
    Off,
    Suggest,
    Automatic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceReferenceDto {
    pub id: String,
    pub speaker_id: String,
    pub meeting_id: Option<String>,
    pub source_start_ms: i64,
    pub source_end_ms: i64,
    pub duration_ms: i64,
    pub channel: String,
    pub quality_score: f32,
    pub status: String,
    pub origin: String,
    pub created_at: String,
    pub has_playable_audio: bool,
    pub waveform_peaks: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeakerSuggestionDto {
    pub id: String,
    pub meeting_id: String,
    pub source_label: String,
    pub speaker_id: String,
    pub confidence: f32,
    pub reference_id: Option<String>,
    pub segment_ids: Vec<String>,
}

pub struct CreateReferenceParams {
    pub meeting_id: Option<String>,
    pub embedding: Vec<f32>,
    pub audio_relative_path: Option<String>,
    pub waveform_peaks: Option<Vec<u8>>,
    pub source_start_ms: i64,
    pub source_end_ms: i64,
    pub duration_ms: i64,
    pub channel: String,
    pub quality_score: f32,
    pub status: String,
    pub origin: String,
}

// ── Helpers ──────────────────────────────────────────────────────────────

fn embedding_to_bytes(embedding: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(embedding.len() * 4);
    for &v in embedding {
        bytes.extend_from_slice(&v.to_le_bytes());
    }
    bytes
}

// ── Repository ───────────────────────────────────────────────────────────

pub struct VoiceReferenceRepository;

impl VoiceReferenceRepository {
    /// Create a new voice reference for a person.
    pub async fn create(
        pool: &SqlitePool,
        speaker_id: &str,
        params: &CreateReferenceParams,
    ) -> Result<String, sqlx::Error> {
        let id = format!("ref-{}", Uuid::new_v4());
        let embedding_bytes = embedding_to_bytes(&params.embedding);
        let now = chrono::Utc::now().to_rfc3339();

        sqlx::query(
            r#"INSERT INTO speaker_voice_references
               (id, speaker_id, embedding, audio_relative_path, waveform_peaks,
                meeting_id, source_start_ms, source_end_ms, duration_ms,
                channel, quality_score, status, origin, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(&id)
        .bind(speaker_id)
        .bind(&embedding_bytes)
        .bind(&params.audio_relative_path)
        .bind(&params.waveform_peaks)
        .bind(&params.meeting_id)
        .bind(params.source_start_ms)
        .bind(params.source_end_ms)
        .bind(params.duration_ms)
        .bind(&params.channel)
        .bind(params.quality_score)
        .bind(&params.status)
        .bind(&params.origin)
        .bind(&now)
        .execute(pool)
        .await?;

        Ok(id)
    }

    /// List all voice references for a person.
    pub async fn list_for_person(
        pool: &SqlitePool,
        speaker_id: &str,
    ) -> Result<Vec<VoiceReferenceDto>, sqlx::Error> {
        let rows = sqlx::query_as::<_, RawReference>(
            r#"SELECT id, speaker_id, meeting_id, source_start_ms, source_end_ms,
                      duration_ms, channel, quality_score, status, origin, created_at,
                      audio_relative_path, waveform_peaks
               FROM speaker_voice_references
               WHERE speaker_id = ?
               ORDER BY created_at"#,
        )
        .bind(speaker_id)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into_dto()).collect())
    }

    /// Get a single voice reference by id.
    pub async fn get(
        pool: &SqlitePool,
        id: &str,
    ) -> Result<Option<VoiceReferenceDto>, sqlx::Error> {
        let row = sqlx::query_as::<_, RawReference>(
            r#"SELECT id, speaker_id, meeting_id, source_start_ms, source_end_ms,
                      duration_ms, channel, quality_score, status, origin, created_at,
                      audio_relative_path, waveform_peaks
               FROM speaker_voice_references
               WHERE id = ?"#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into_dto()))
    }

    /// Delete a voice reference by id.
    pub async fn delete(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM speaker_voice_references WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Delete a voice reference by id within an existing transaction.
    pub async fn delete_with_tx(
        conn: &mut sqlx::SqliteConnection,
        id: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM speaker_voice_references WHERE id = ?")
            .bind(id)
            .execute(&mut *conn)
            .await?;
        Ok(())
    }

    /// Create a speaker match suggestion.
    pub async fn create_suggestion(
        pool: &SqlitePool,
        meeting_id: &str,
        source_label: &str,
        speaker_id: &str,
        confidence: f32,
        segment_ids: &[String],
    ) -> Result<String, sqlx::Error> {
        let id = format!("sug-{}", Uuid::new_v4());
        let now = chrono::Utc::now().to_rfc3339();
        let segment_ids_json = serde_json::to_string(segment_ids).unwrap_or_else(|_| "[]".into());

        sqlx::query(
            r#"INSERT INTO speaker_match_suggestions
               (id, meeting_id, source_label, speaker_id, confidence,
                segment_ids_json, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)"#,
        )
        .bind(&id)
        .bind(meeting_id)
        .bind(source_label)
        .bind(speaker_id)
        .bind(confidence)
        .bind(&segment_ids_json)
        .bind(&now)
        .execute(pool)
        .await?;

        Ok(id)
    }

    /// List suggestions for a meeting.
    pub async fn list_suggestions(
        pool: &SqlitePool,
        meeting_id: &str,
    ) -> Result<Vec<SpeakerSuggestionDto>, sqlx::Error> {
        let rows = sqlx::query_as::<_, RawSuggestion>(
            r#"SELECT id, meeting_id, source_label, speaker_id, confidence,
                      reference_id, segment_ids_json, status, created_at, resolved_at
               FROM speaker_match_suggestions
               WHERE meeting_id = ?
               ORDER BY created_at"#,
        )
        .bind(meeting_id)
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(|r| r.try_into_dto().map_err(|e| sqlx::Error::Decode(Box::new(e)))).collect()
    }

    /// Resolve a suggestion (accept/reject).
    pub async fn resolve_suggestion(
        pool: &SqlitePool,
        id: &str,
        status: &str,
        reference_id: Option<&str>,
    ) -> Result<bool, sqlx::Error> {
        let now = chrono::Utc::now().to_rfc3339();
        let result = sqlx::query(
            r#"UPDATE speaker_match_suggestions
               SET status = ?, reference_id = ?, resolved_at = ?
               WHERE id = ?"#,
        )
        .bind(status)
        .bind(reference_id)
        .bind(&now)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Pure function: convert a legacy embedding into a VoiceReferenceDto
    /// without any database interaction.
    pub fn from_legacy_embedding(
        id: &str,
        speaker_id: &str,
        embedding: Vec<f32>,
    ) -> VoiceReferenceDto {
        let _ = embedding; // kept for signature; embedding stored separately if needed
        VoiceReferenceDto {
            id: id.to_string(),
            speaker_id: speaker_id.to_string(),
            meeting_id: None,
            source_start_ms: 0,
            source_end_ms: 0,
            duration_ms: 0,
            channel: "unknown".into(),
            quality_score: 0.0,
            status: "legacy".into(),
            origin: "legacy".into(),
            created_at: "1970-01-01T00:00:00Z".into(),
            has_playable_audio: false,
            waveform_peaks: Vec::new(),
        }
    }
}

// ── Raw row types ────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct RawReference {
    id: String,
    speaker_id: String,
    meeting_id: Option<String>,
    source_start_ms: i64,
    source_end_ms: i64,
    duration_ms: i64,
    channel: String,
    quality_score: f32,
    status: String,
    origin: String,
    created_at: String,
    audio_relative_path: Option<String>,
    waveform_peaks: Option<Vec<u8>>,
}

impl RawReference {
    fn into_dto(self) -> VoiceReferenceDto {
        VoiceReferenceDto {
            id: self.id,
            speaker_id: self.speaker_id,
            meeting_id: self.meeting_id,
            source_start_ms: self.source_start_ms,
            source_end_ms: self.source_end_ms,
            duration_ms: self.duration_ms,
            channel: self.channel,
            quality_score: self.quality_score,
            status: self.status,
            origin: self.origin,
            created_at: self.created_at,
            has_playable_audio: self.audio_relative_path.is_some(),
            waveform_peaks: self.waveform_peaks.unwrap_or_default(),
        }
    }
}

#[derive(sqlx::FromRow)]
struct RawSuggestion {
    id: String,
    meeting_id: String,
    source_label: String,
    speaker_id: String,
    confidence: f32,
    reference_id: Option<String>,
    segment_ids_json: String,
    status: String,
    created_at: String,
    resolved_at: Option<String>,
}

impl RawSuggestion {
    fn try_into_dto(self) -> Result<SpeakerSuggestionDto, serde_json::Error> {
        let segment_ids: Vec<String> = serde_json::from_str(&self.segment_ids_json)?;
        Ok(SpeakerSuggestionDto {
            id: self.id,
            meeting_id: self.meeting_id,
            source_label: self.source_label,
            speaker_id: self.speaker_id,
            confidence: self.confidence,
            reference_id: self.reference_id,
            segment_ids,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_reference_is_matchable_but_not_playable() {
        let reference =
            VoiceReferenceRepository::from_legacy_embedding("legacy-id", "ana-id", vec![0.25; 256]);
        assert_eq!(reference.status, "legacy");
        assert!(!reference.has_playable_audio);
    }

    #[test]
    fn from_legacy_embedding_has_no_meeting() {
        let reference =
            VoiceReferenceRepository::from_legacy_embedding("x", "y", vec![]);
        assert!(reference.meeting_id.is_none());
        assert_eq!(reference.origin, "legacy");
    }
}
