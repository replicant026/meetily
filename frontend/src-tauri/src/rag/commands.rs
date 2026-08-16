use crate::database::repositories::search::SearchRepository;
use crate::database::repositories::setting::SettingsRepository;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::Runtime;

#[derive(Debug, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponse {
    pub answer: String,
    pub sources: Vec<ChatSource>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSource {
    pub meeting_id: String,
    pub meeting_title: String,
    pub snippet: String,
}

#[tauri::command]
pub async fn chat_about_meetings<R: Runtime>(
    _app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    question: String,
    history: Option<Vec<ChatMessage>>,
) -> Result<ChatResponse, String> {
    let pool = state.db_manager.pool();

    // 1. Search for relevant meetings
    let results = SearchRepository::search(pool, &question, 5)
        .await
        .map_err(|e| format!("Search failed: {}", e))?;

    if results.is_empty() {
        return Ok(ChatResponse {
            answer: "No relevant meetings found for your question.".to_string(),
            sources: vec![],
        });
    }

    // 2. Build context from search results
    let context: String = results
        .iter()
        .map(|r| {
            format!(
                "Meeting: {} ({})\n{}\n",
                r.meeting_title, r.timestamp, r.snippet
            )
        })
        .collect::<Vec<_>>()
        .join("\n---\n\n");

    // 3. Build messages for LLM
    let mut messages: Vec<serde_json::Value> = vec![];

    // Add history (last 10 messages)
    if let Some(hist) = history {
        for m in hist.iter().take(10) {
            messages.push(serde_json::json!({
                "role": m.role,
                "content": m.content,
            }));
        }
    }

    let system_prompt = format!(
        "You are a meeting assistant. Answer questions based on the following meeting transcripts:\n\n{}\n\nBe concise and cite specific meetings when possible. If the context doesn't contain enough information, say so.",
        context
    );

    messages.push(serde_json::json!({
        "role": "system",
        "content": system_prompt,
    }));
    messages.push(serde_json::json!({
        "role": "user",
        "content": question,
    }));

    // 4. Get LLM settings
    let settings = SettingsRepository::get_model_config(pool)
        .await
        .map_err(|e| format!("Failed to get settings: {}", e))?
        .ok_or_else(|| "No model settings configured".to_string())?;

    let endpoint = settings
        .ollama_endpoint
        .as_deref()
        .unwrap_or("http://localhost:11434");

    // 5. Call LLM (Ollama chat API)
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/api/chat", endpoint))
        .timeout(std::time::Duration::from_secs(120))
        .json(&serde_json::json!({
            "model": settings.model,
            "messages": messages,
            "stream": false,
        }))
        .send()
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

    let answer = body["message"]["content"]
        .as_str()
        .unwrap_or("No response from LLM")
        .to_string();

    Ok(ChatResponse {
        answer,
        sources: results
            .into_iter()
            .map(|r| ChatSource {
                meeting_id: r.meeting_id,
                meeting_title: r.meeting_title,
                snippet: r.snippet,
            })
            .collect(),
    })
}
