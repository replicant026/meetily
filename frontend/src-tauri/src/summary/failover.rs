use super::llm_client::{generate_summary, LLMError, LLMProvider};
use log::{info, warn};
use reqwest::Client;
use tokio_util::sync::CancellationToken;

/// Configuration for a single provider in the failover chain.
#[derive(Debug, Clone)]
pub struct ChainEntry {
    pub provider: LLMProvider,
    pub model_name: String,
    /// Pre-fetched API key for this provider; empty for providers that do not need one (Ollama, BuiltInAI).
    pub api_key: String,
    /// Optional Ollama endpoint URL (only used when provider is Ollama).
    pub ollama_endpoint: Option<String>,
    /// Optional custom OpenAI endpoint (only used when provider is CustomOpenAI).
    pub custom_openai_endpoint: Option<String>,
}

/// Typed counterpart of `is_transient_error` for `LLMError`. Used after
/// `generate_summary` is upgraded to return the typed enum (PR-42-iv-c).
fn is_transient_llm_error(e: &LLMError) -> bool {
    matches!(e, LLMError::Network(_) | LLMError::ServerError { .. })
}
/// Try a single LLM call with the given chain entry.
async fn try_provider(
    client: &Client,
    entry: &ChainEntry,
    system_prompt: &str,
    user_prompt: &str,
    cancellation_token: Option<&CancellationToken>,
) -> Result<String, LLMError> {
    generate_summary(
        client,
        &entry.provider,
        &entry.model_name,
        &entry.api_key,
        system_prompt,
        user_prompt,
        entry.ollama_endpoint.as_deref(),
        entry.custom_openai_endpoint.as_deref(),
        None, // max_tokens
        None, // temperature
        None, // top_p
        None, // app_data_dir
        cancellation_token,
    )
    .await
}

/// Run a prompt through a provider chain, falling over on transient errors.
///
/// Each chain entry is tried in order. Transient failures (timeouts, connect errors, 5xx, 429)
/// trigger the next entry. Non-transient failures (4xx, auth errors, parse errors, cancellation)
/// abort immediately. If the chain is exhausted, the last transient error is returned.
pub async fn generate_with_failover(
    client: &Client,
    chain: &[ChainEntry],
    system_prompt: &str,
    user_prompt: &str,
    cancellation_token: Option<&CancellationToken>,
) -> Result<String, LLMError> {
    if chain.is_empty() {
        return Err(LLMError::Other("Provider chain is empty".to_string()));
    }

    let mut last_err: Option<LLMError> = None;
    for (i, entry) in chain.iter().enumerate() {
        if let Some(token) = cancellation_token {
            if token.is_cancelled() {
                return Err(LLMError::Cancelled);
            }
        }

        info!(
            "Failover attempt {}/{}: provider={:?} model={}",
            i + 1,
            chain.len(),
            entry.provider,
            entry.model_name
        );

        match try_provider(client, entry, system_prompt, user_prompt, cancellation_token).await {
            Ok(text) => {
                if i > 0 {
                    info!(
                        "Failover succeeded on attempt {}/{} ({:?})",
                        i + 1,
                        chain.len(),
                        entry.provider
                    );
                }
                return Ok(text);
            }
            Err(e) => {
                let transient = is_transient_llm_error(&e);
                let is_last = i + 1 == chain.len();
                if transient && !is_last {
                    warn!(
                        "Provider {:?} failed transiently, trying next in chain: {}",
                        entry.provider,
                        e
                    );
                    last_err = Some(e);
                } else {
                    return Err(e);
                }
            }
        }
    }

    Err(LLMError::Other(format!(
        "All {} providers in chain failed: {}",
        chain.len(),
        last_err.map(|e| e.to_string()).unwrap_or_else(|| "unknown error".to_string())
    )))
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_transient_matches_5xx_and_timeouts() {
        assert!(is_transient_llm_error(&LLMError::ServerError { status: 500, body: "LLM returned 500 (attempt 1/4)".to_string() }));
        assert!(is_transient_llm_error(&LLMError::ServerError { status: 502, body: "LLM returned 502".to_string() }));
        assert!(is_transient_llm_error(&LLMError::ServerError { status: 503, body: "LLM returned 503 Service Unavailable".to_string() }));
        assert!(is_transient_llm_error(&LLMError::ServerError { status: 504, body: "LLM API request failed (504): gateway timeout".to_string() }));
        assert!(is_transient_llm_error(&LLMError::ServerError { status: 429, body: "LLM API request failed (429): rate limit".to_string() }));
        assert!(is_transient_llm_error(&LLMError::Network("operation timed out".to_string())));
        assert!(is_transient_llm_error(&LLMError::Network("connection refused".to_string())));
    }

    #[test]
    fn is_transient_rejects_4xx() {
        assert!(!is_transient_llm_error(&LLMError::ClientError { status: 401, body: "invalid api key".to_string() }));
        assert!(!is_transient_llm_error(&LLMError::ClientError { status: 403, body: "forbidden".to_string() }));
        assert!(!is_transient_llm_error(&LLMError::ClientError { status: 400, body: "bad request".to_string() }));
        assert!(!is_transient_llm_error(&LLMError::ClientError { status: 404, body: "not found".to_string() }));
    }

    #[test]
    fn is_transient_defaults_to_terminal_for_unknown() {
        assert!(!is_transient_llm_error(&LLMError::JsonParse("unexpected token".to_string())));
        assert!(!is_transient_llm_error(&LLMError::Cancelled));
        assert!(!is_transient_llm_error(&LLMError::Other("foo".to_string())));
    }

    #[tokio::test]
    async fn empty_chain_returns_error() {
        let result = generate_with_failover(
            &Client::new(),
            &[],
            "sys",
            "user",
            None,
        ).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), LLMError::Other(ref s) if s.contains("empty")));
    }

    #[tokio::test]
    async fn cancellation_aborts_before_first_attempt() {
        let chain = vec![ChainEntry {
            provider: LLMProvider::OpenAI,
            model_name: "gpt-4".to_string(),
            api_key: "sk-test".to_string(),
            ollama_endpoint: None,
            custom_openai_endpoint: None,
        }];
        let token = CancellationToken::new();
        token.cancel();
        let result = generate_with_failover(
            &Client::new(),
            &chain,
            "sys",
            "user",
            Some(&token),
        ).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), LLMError::Cancelled));
    }

    #[test]
    fn chain_entry_clone_preserves_all_fields() {
        let entry = ChainEntry {
            provider: LLMProvider::Ollama,
            model_name: "llama3.2:latest".to_string(),
            api_key: String::new(),
            ollama_endpoint: Some("http://localhost:11434".to_string()),
            custom_openai_endpoint: None,
        };
        let cloned = entry.clone();
        assert_eq!(cloned.provider, LLMProvider::Ollama);
        assert_eq!(cloned.model_name, "llama3.2:latest");
        assert_eq!(cloned.ollama_endpoint, Some("http://localhost:11434".to_string()));
    }
}
