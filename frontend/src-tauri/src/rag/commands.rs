use crate::database::repositories::search::SearchRepository;
use crate::database::repositories::setting::SettingsRepository;
use crate::state::AppState;
use crate::summary::llm_client::{generate_summary, LLMProvider};
use serde::{Deserialize, Serialize};
use tauri::{Manager, Runtime};

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
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    question: String,
    history: Option<Vec<ChatMessage>>,
) -> Result<ChatResponse, String> {
    let pool = state.db_manager.pool();

    // 1. Search for relevant meetings (use OR semantics for natural language questions)
    let results = SearchRepository::search_or(pool, &question, 5)
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

    // 3. Build system prompt with meeting context
    let system_prompt = format!(
        "You are a meeting assistant. Answer questions based on the following meeting transcripts:\n\n{}\n\nBe concise and cite specific meetings when possible. If the context doesn't contain enough information, say so.",
        context
    );

    // 4. Build conversation history — take only the LAST 10 messages
    let history_text = if let Some(hist) = history {
        let last_n: Vec<String> = hist
            .iter()
            .rev()
            .take(10)
            .rev()
            .map(|m| format!("{}: {}", m.role, m.content))
            .collect();
        if last_n.is_empty() {
            String::new()
        } else {
            format!("Conversation so far:\n{}\n\n", last_n.join("\n"))
        }
    } else {
        String::new()
    };

    let user_prompt = if history_text.is_empty() {
        question.clone()
    } else {
        format!("{}User: {}", history_text, question)
    };

    // 5. Get LLM settings and route through configured provider
    let settings = SettingsRepository::get_model_config(pool)
        .await
        .map_err(|e| format!("Failed to get settings: {}", e))?
        .ok_or_else(|| "No model settings configured".to_string())?;

    let provider = LLMProvider::from_str(&settings.provider)
        .map_err(|e| format!("Unsupported provider: {}", e))?;

    // Get API key for the configured provider
    let api_key = if provider == LLMProvider::Ollama
        || provider == LLMProvider::BuiltInAI
        || provider == LLMProvider::CustomOpenAI
    {
        String::new()
    } else {
        SettingsRepository::get_api_key(pool, &settings.provider)
            .await
            .map_err(|e| format!("Failed to get API key: {}", e))?
            .unwrap_or_default()
    };

    // Get Ollama endpoint if applicable
    let ollama_endpoint = if provider == LLMProvider::Ollama {
        settings.ollama_endpoint.clone()
    } else {
        None
    };

    // Get CustomOpenAI config if applicable
    let (custom_openai_endpoint, custom_openai_key, custom_openai_model, custom_max_tokens, custom_temperature, custom_top_p) =
        if provider == LLMProvider::CustomOpenAI {
            match settings.get_custom_openai_config() {
                Some(cfg) => {
                    // Strip trailing slashes first, then /v1, then any remaining slash
                    let endpoint = cfg.endpoint.trim_end_matches('/').trim_end_matches("/v1").trim_end_matches('/').to_string();
                    (
                        Some(endpoint),
                        cfg.api_key.unwrap_or_default(),
                        Some(cfg.model),
                        cfg.max_tokens.map(|v| v as u32),
                        cfg.temperature,
                        cfg.top_p,
                    )
                }
                None => (None, String::new(), None, None, None, None),
            }
        } else {
            (None, String::new(), None, None, None, None)
        };

    let final_api_key = if provider == LLMProvider::CustomOpenAI {
        custom_openai_key
    } else {
        api_key
    };

    let final_model = if let Some(m) = custom_openai_model {
        m
    } else {
        settings.model
    };

    // Get app data dir for BuiltInAI
    let app_data_dir = app
        .path()
        .app_data_dir()
        .ok();

    let client = reqwest::Client::new();

    // 6. Call LLM through the provider-agnostic summary module
    let answer = generate_summary(
        &client,
        &provider,
        &final_model,
        &final_api_key,
        &system_prompt,
        &user_prompt,
        ollama_endpoint.as_deref(),
        custom_openai_endpoint.as_deref(),
        custom_max_tokens,
        custom_temperature,
        custom_top_p,
        app_data_dir.as_ref(),
        None,   // cancellation_token
    )
    .await
    .map_err(|e| format!("LLM request failed: {}", e))?;

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
