use crate::state::AppState;
use crate::timesheet::repository::{TimesheetEntry, TimesheetRepository};
use serde::Deserialize;
use tauri::Runtime;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEntryRequest {
    pub meeting_id: Option<String>,
    pub client: String,
    pub project: Option<String>,
    pub description: String,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
    pub is_extra: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEntryRequest {
    pub id: String,
    pub meeting_id: Option<String>,
    pub client: String,
    pub project: Option<String>,
    pub description: String,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
    pub is_extra: Option<bool>,
    pub launched: Option<bool>,
}

#[tauri::command]
pub async fn timesheet_list_entries<R: Runtime>(
    _app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    month: Option<String>,
) -> Result<Vec<TimesheetEntry>, String> {
    TimesheetRepository::list_entries(state.db_manager.pool(), month.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn timesheet_create_entry<R: Runtime>(
    _app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    request: CreateEntryRequest,
) -> Result<TimesheetEntry, String> {
    let pool = state.db_manager.pool();
    let now = chrono::Utc::now().to_rfc3339();

    // Parse times and compute duration
    let start = chrono::NaiveTime::parse_from_str(&request.start_time, "%H:%M")
        .or_else(|_| chrono::NaiveTime::parse_from_str(&request.start_time, "%H:%M:%S"))
        .map_err(|e| format!("Invalid start time: {}", e))?;
    let end = chrono::NaiveTime::parse_from_str(&request.end_time, "%H:%M")
        .or_else(|_| chrono::NaiveTime::parse_from_str(&request.end_time, "%H:%M:%S"))
        .map_err(|e| format!("Invalid end time: {}", e))?;
    let duration = (end - start).num_minutes();
    if duration <= 0 {
        return Err("End time must be after start time".to_string());
    }

    let entry = TimesheetEntry {
        id: uuid::Uuid::new_v4().to_string(),
        meeting_id: request.meeting_id,
        client: request.client,
        project: request.project,
        description: request.description,
        date: request.date,
        start_time: request.start_time,
        end_time: request.end_time,
        duration_minutes: duration,
        is_extra: request.is_extra.unwrap_or(false),
        launched: false,
        created_at: now.clone(),
        updated_at: now,
    };

    TimesheetRepository::create_entry(pool, &entry)
        .await
        .map_err(|e| e.to_string())?;
    Ok(entry)
}

#[tauri::command]
pub async fn timesheet_update_entry<R: Runtime>(
    _app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    request: UpdateEntryRequest,
) -> Result<TimesheetEntry, String> {
    let pool = state.db_manager.pool();
    let now = chrono::Utc::now().to_rfc3339();

    let start = chrono::NaiveTime::parse_from_str(&request.start_time, "%H:%M")
        .or_else(|_| chrono::NaiveTime::parse_from_str(&request.start_time, "%H:%M:%S"))
        .map_err(|e| format!("Invalid start time: {}", e))?;
    let end = chrono::NaiveTime::parse_from_str(&request.end_time, "%H:%M")
        .or_else(|_| chrono::NaiveTime::parse_from_str(&request.end_time, "%H:%M:%S"))
        .map_err(|e| format!("Invalid end time: {}", e))?;
    let duration = (end - start).num_minutes();
    if duration <= 0 {
        return Err("End time must be after start time".to_string());
    }

    // Read existing entry to preserve launched and created_at
    let existing: Option<TimesheetEntry> =
        sqlx::query_as("SELECT * FROM timesheet_entries WHERE id = ?1")
            .bind(&request.id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    let entry = TimesheetEntry {
        id: request.id,
        meeting_id: request.meeting_id,
        client: request.client,
        project: request.project,
        description: request.description,
        date: request.date,
        start_time: request.start_time,
        end_time: request.end_time,
        duration_minutes: duration,
        is_extra: request.is_extra.unwrap_or(false),
        // Preserve launched status from DB unless explicitly provided in request
        launched: request.launched.unwrap_or_else(|| {
            existing.as_ref().map(|e| e.launched).unwrap_or(false)
        }),
        // Preserve original created_at
        created_at: existing
            .as_ref()
            .map(|e| e.created_at.clone())
            .unwrap_or_else(|| now.clone()),
        updated_at: now,
    };

    let updated = TimesheetRepository::update_entry(pool, &entry)
        .await
        .map_err(|e| e.to_string())?;
    if !updated {
        return Err(format!("Timesheet entry '{}' not found", entry.id));
    }
    Ok(entry)
}

#[tauri::command]
pub async fn timesheet_delete_entry<R: Runtime>(
    _app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    entry_id: String,
) -> Result<bool, String> {
    TimesheetRepository::delete_entry(state.db_manager.pool(), &entry_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn timesheet_mark_launched<R: Runtime>(
    _app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    entry_id: String,
    launched: bool,
) -> Result<(), String> {
    TimesheetRepository::mark_launched(state.db_manager.pool(), &entry_id, launched)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn timesheet_list_clients<R: Runtime>(
    _app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    TimesheetRepository::list_clients(state.db_manager.pool())
        .await
        .map_err(|e| e.to_string())
}
