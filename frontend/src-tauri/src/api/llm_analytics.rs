use crate::database::llm_analytics::{LLMUsageMetrics, LLMSession, LLMUsageStats};
use crate::error::AppError;
use crate::state::AppState;
use serde::Deserialize;
use tauri::command;

/// Record an LLM usage event from the frontend.
#[command]
pub async fn record_llm_usage(
    app: AppState,
    model: String,
    provider: String,
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    latency_ms: Option<i64>,
    was_fallback: Option<bool>,
    error_message: Option<String>,
) -> Result<(), AppError> {
    let db = app.db_pool.as_ref().ok_or(AppError::DatabaseError("No database pool".into()))?;

    let metrics = LLMUsageMetrics {
        model,
        provider,
        input_tokens,
        output_tokens,
        latency_ms,
        was_fallback: was_fallback.unwrap_or(false),
        error_message,
    };

    llm_analytics::record_llm_usage(db, &metrics).await?;
    Ok(())
}

/// Query LLM usage statistics for a date range.
#[command]
pub async fn get_llm_usage_stats(
    app: AppState,
    days: Option<i32>,
) -> Result<Vec<LLMUsageStats>, AppError> {
    let db = app.db_pool.as_ref().ok_or(AppError::DatabaseError("No database pool".into()))?;
    let days = days.unwrap_or(30);
    let stats = llm_analytics::get_llm_usage_stats(db, days).await?;
    Ok(stats)
}

/// Query LLM usage history for a specific meeting.
#[command]
pub async fn get_llm_usage_for_meeting(
    app: AppState,
    meeting_id: i64,
) -> Result<Vec<LLMSession>, AppError> {
    let db = app.db_pool.as_ref().ok_or(AppError::DatabaseError("No database pool".into()))?;
    let sessions = llm_analytics::get_llm_usage_for_meeting(db, meeting_id).await?;
    Ok(sessions)
}

/// Query per-model LLM usage stats for a specific meeting.
#[command]
pub async fn get_llm_model_usage_for_meeting(
    app: AppState,
    meeting_id: i64,
) -> Result<Vec<LLMUsageStats>, AppError> {
    let db = app.db_pool.as_ref().ok_or(AppError::DatabaseError("No database pool".into()))?;
    let stats = llm_analytics::get_llm_model_usage_for_meeting(db, meeting_id).await?;
    Ok(stats)
}
