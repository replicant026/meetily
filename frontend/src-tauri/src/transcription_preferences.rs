use anyhow::{anyhow, Result};
use log::info;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "transcription-preferences.json";
const STORE_KEY: &str = "hotwords";
pub const MAX_HOTWORD_CHARS: usize = 500;

fn normalize_hotwords(value: String) -> Result<Option<String>> {
    let trimmed = value.trim();
    if trimmed.chars().count() > MAX_HOTWORD_CHARS {
        return Err(anyhow!(
            "Hotwords must not exceed {} characters",
            MAX_HOTWORD_CHARS
        ));
    }
    Ok((!trimmed.is_empty()).then(|| trimmed.to_string()))
}

pub async fn load_transcription_hotwords<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<String>> {
    let store = app
        .store(STORE_FILE)
        .map_err(|error| anyhow!("Failed to access transcription preferences: {}", error))?;

    match store.get(STORE_KEY) {
        Some(value) => {
            let hotwords = value
                .as_str()
                .ok_or_else(|| anyhow!("Stored transcription hotwords are invalid"))?;
            normalize_hotwords(hotwords.to_string())
        }
        None => Ok(None),
    }
}

pub async fn save_transcription_hotwords<R: Runtime>(
    app: &AppHandle<R>,
    hotwords: String,
) -> Result<Option<String>> {
    let normalized = normalize_hotwords(hotwords)?;
    let store = app
        .store(STORE_FILE)
        .map_err(|error| anyhow!("Failed to access transcription preferences: {}", error))?;

    match &normalized {
        Some(value) => store.set(STORE_KEY, serde_json::json!(value)),
        None => {
            store.delete(STORE_KEY);
        }
    }
    store
        .save()
        .map_err(|error| anyhow!("Failed to persist transcription preferences: {}", error))?;

    info!(
        "Saved transcription hotwords: enabled={}, chars={}",
        normalized.is_some(),
        normalized
            .as_ref()
            .map(|value| value.chars().count())
            .unwrap_or(0)
    );
    Ok(normalized)
}

#[tauri::command]
pub async fn get_transcription_hotwords<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<String>, String> {
    load_transcription_hotwords(&app)
        .await
        .map_err(|error| format!("Failed to load transcription hotwords: {}", error))
}

#[tauri::command]
pub async fn set_transcription_hotwords<R: Runtime>(
    app: AppHandle<R>,
    hotwords: String,
) -> Result<Option<String>, String> {
    save_transcription_hotwords(&app, hotwords)
        .await
        .map_err(|error| format!("Failed to save transcription hotwords: {}", error))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whitespace_disables_hotwords() {
        assert_eq!(normalize_hotwords(" \n ".to_string()).unwrap(), None);
    }

    #[test]
    fn trims_hotwords_without_changing_lines() {
        assert_eq!(
            normalize_hotwords("  Meetily\n星河项目  ".to_string()).unwrap(),
            Some("Meetily\n星河项目".to_string())
        );
    }

    #[test]
    fn accepts_500_unicode_characters() {
        let value = "术".repeat(MAX_HOTWORD_CHARS);
        assert_eq!(normalize_hotwords(value.clone()).unwrap(), Some(value));
    }

    #[test]
    fn rejects_more_than_500_unicode_characters() {
        let error = normalize_hotwords("术".repeat(MAX_HOTWORD_CHARS + 1)).unwrap_err();
        assert!(error.to_string().contains("500"));
    }
}