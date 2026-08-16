// audio/transcription/deepgram_provider.rs
//
// Deepgram Nova-3 cloud transcription provider.
// Strong on conversational English with native diarization support.

use super::provider::{TranscriptionError, TranscriptionProvider, TranscriptResult};
use async_trait::async_trait;
use log::info;
use serde::Deserialize;

const DEEPGRAM_API_URL: &str = "https://api.deepgram.com/v1/listen";
const DEEPGRAM_DEFAULT_MODEL: &str = "nova-3";

#[derive(Debug, Deserialize)]
struct DeepgramResponse {
    results: DeepgramResults,
}

#[derive(Debug, Deserialize)]
struct DeepgramResults {
    channels: Vec<DeepgramChannel>,
}

#[derive(Debug, Deserialize)]
struct DeepgramChannel {
    alternatives: Vec<DeepgramAlternative>,
}

#[derive(Debug, Deserialize)]
struct DeepgramAlternative {
    transcript: String,
    #[serde(default)]
    confidence: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct DeepgramErrorResponse {
    #[serde(default)]
    reason: Option<String>,
    #[serde(default)]
    description: Option<String>,
}

/// Deepgram cloud transcription provider (Nova-3 / Nova-2)
pub struct DeepgramProvider {
    api_key: String,
    model: String,
    client: reqwest::Client,
}

impl DeepgramProvider {
    pub fn new(api_key: String, model: Option<String>) -> Self {
        Self {
            api_key,
            model: model.unwrap_or_else(|| DEEPGRAM_DEFAULT_MODEL.to_string()),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .expect("Failed to create Deepgram HTTP client"),
        }
    }
}

#[async_trait]
impl TranscriptionProvider for DeepgramProvider {
    async fn transcribe(
        &self,
        audio: Vec<f32>,
        language: Option<String>,
        initial_prompt: Option<String>,
    ) -> Result<TranscriptResult, TranscriptionError> {
        if self.api_key.is_empty() {
            return Err(TranscriptionError::EngineFailed(
                "Deepgram API key is not set".to_string(),
            ));
        }

        // Convert f32 samples to WAV bytes
        let wav_bytes = super::groq_provider::samples_to_wav(&audio, 16000)?;
        let wav_len = wav_bytes.len();

        // Build query parameters
        let mut params = vec![
            ("model", self.model.clone()),
            ("punctuate", "true".to_string()),
        ];

        if let Some(lang) = language {
            params.push(("language", lang));
        }

        // Deepgram keywords: boost custom vocabulary terms
        // Format: keywords=term1:2,term2:2 (boost weight 1-5, default 2)
        if let Some(prompt) = initial_prompt {
            let keywords: Vec<String> = prompt
                .lines()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .map(|s| s.strip_prefix('!').unwrap_or(s).trim().to_string())
                .filter(|s| !s.is_empty())
                .take(50) // Deepgram max 500 keywords, we cap at 50
                .collect();

            if !keywords.is_empty() {
                let kw_str = keywords
                    .iter()
                    .map(|kw| format!("{}:2", kw.replace(',', "\\,")))
                    .collect::<Vec<_>>()
                    .join(",");
                params.push(("keywords", kw_str));
            }
        }

        info!(
            "Sending audio chunk ({} bytes) to Deepgram ({})",
            wav_len,
            self.model
        );

        let response = self
            .client
            .post(DEEPGRAM_API_URL)
            .header("Authorization", format!("Token {}", self.api_key))
            .header("Content-Type", "audio/wav")
            .query(&params)
            .body(wav_bytes)
            .send()
            .await
            .map_err(|e| TranscriptionError::EngineFailed(format!("Deepgram request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            let msg = if let Ok(err) = serde_json::from_str::<DeepgramErrorResponse>(&body) {
                err.reason.unwrap_or(err.description.unwrap_or(body))
            } else {
                format!("HTTP {}: {}", status, body)
            };
            return Err(TranscriptionError::EngineFailed(format!(
                "Deepgram API error: {}",
                msg
            )));
        }

        let result: DeepgramResponse = response
            .json()
            .await
            .map_err(|e| {
                TranscriptionError::EngineFailed(format!("Deepgram response parse error: {}", e))
            })?;

        let alternative = result
            .results
            .channels
            .first()
            .and_then(|ch| ch.alternatives.first());

        match alternative {
            Some(alt) => Ok(TranscriptResult {
                text: alt.transcript.trim().to_string(),
                confidence: alt.confidence.map(|c| c as f32),
                is_partial: false,
            }),
            None => Ok(TranscriptResult {
                text: String::new(),
                confidence: None,
                is_partial: false,
            }),
        }
    }

    async fn is_model_loaded(&self) -> bool {
        !self.api_key.is_empty()
    }

    async fn get_current_model(&self) -> Option<String> {
        Some(self.model.clone())
    }

    fn provider_name(&self) -> &'static str {
        "Deepgram"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_name() {
        let provider = DeepgramProvider::new("test_key".to_string(), None);
        assert_eq!(provider.provider_name(), "Deepgram");
    }

    #[test]
    fn test_default_model() {
        let provider = DeepgramProvider::new("test_key".to_string(), None);
        assert_eq!(provider.model, "nova-3");
    }

    #[test]
    fn test_custom_model() {
        let provider =
            DeepgramProvider::new("test_key".to_string(), Some("nova-2".to_string()));
        assert_eq!(provider.model, "nova-2");
    }
}
