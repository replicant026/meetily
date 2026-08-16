// audio/transcription/mistral_provider.rs
//
// Mistral Voxtral cloud transcription provider.
// Uses OpenAI-compatible API format for speech-to-text.

use super::provider::{TranscriptionError, TranscriptionProvider, TranscriptResult};
use async_trait::async_trait;
use log::info;
use reqwest::multipart;
use serde::Deserialize;

const MISTRAL_API_URL: &str = "https://api.mistral.ai/v1/audio/transcriptions";
const MISTRAL_DEFAULT_MODEL: &str = "voxtral-large-latest";

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct MistralTranscriptionResponse {
    text: String,
    #[serde(default)]
    language: Option<String>,
    #[serde(default)]
    duration: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct MistralErrorResponse {
    #[serde(default)]
    error: Option<MistralErrorBody>,
    #[serde(default)]
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct MistralErrorBody {
    message: String,
    #[serde(default)]
    r#type: Option<String>,
}

/// Mistral Voxtral cloud transcription provider
pub struct MistralProvider {
    api_key: String,
    model: String,
    client: reqwest::Client,
}

impl MistralProvider {
    pub fn new(api_key: String, model: Option<String>) -> Self {
        Self {
            api_key,
            model: model.unwrap_or_else(|| MISTRAL_DEFAULT_MODEL.to_string()),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .expect("Failed to create Mistral HTTP client"),
        }
    }
}

#[async_trait]
impl TranscriptionProvider for MistralProvider {
    async fn transcribe(
        &self,
        audio: Vec<f32>,
        language: Option<String>,
        initial_prompt: Option<String>,
    ) -> Result<TranscriptResult, TranscriptionError> {
        if self.api_key.is_empty() {
            return Err(TranscriptionError::EngineFailed(
                "Mistral API key is not set".to_string(),
            ));
        }

        // Convert f32 samples to WAV bytes
        let wav_bytes = super::groq_provider::samples_to_wav(&audio, 16000)?;
        let wav_len = wav_bytes.len();

        // Build multipart form data
        let file_part = multipart::Part::bytes(wav_bytes)
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| TranscriptionError::EngineFailed(format!("Failed to create file part: {}", e)))?;

        let mut form = multipart::Form::new()
            .part("file", file_part)
            .text("model", self.model.clone())
            .text("response_format", "json");

        if let Some(lang) = language {
            form = form.text("language", lang);
        }

        if let Some(prompt) = initial_prompt {
            form = form.text("prompt", prompt);
        }

        info!(
            "Sending audio chunk ({} bytes) to Mistral Voxtral ({})",
            wav_len,
            self.model
        );

        let response = self
            .client
            .post(MISTRAL_API_URL)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .multipart(form)
            .send()
            .await
            .map_err(|e| TranscriptionError::EngineFailed(format!("Mistral request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            let msg = if let Ok(err) = serde_json::from_str::<MistralErrorResponse>(&body) {
                err.error
                    .map(|e| e.message)
                    .or(err.message)
                    .unwrap_or(body)
            } else {
                format!("HTTP {}: {}", status, body)
            };
            return Err(TranscriptionError::EngineFailed(format!(
                "Mistral API error: {}",
                msg
            )));
        }

        let result: MistralTranscriptionResponse = response
            .json()
            .await
            .map_err(|e| {
                TranscriptionError::EngineFailed(format!("Mistral response parse error: {}", e))
            })?;

        Ok(TranscriptResult {
            text: result.text.trim().to_string(),
            confidence: None, // Mistral API doesn't return confidence scores
            is_partial: false,
        })
    }

    async fn is_model_loaded(&self) -> bool {
        !self.api_key.is_empty()
    }

    async fn get_current_model(&self) -> Option<String> {
        Some(self.model.clone())
    }

    fn provider_name(&self) -> &'static str {
        "Mistral Voxtral"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_name() {
        let provider = MistralProvider::new("test_key".to_string(), None);
        assert_eq!(provider.provider_name(), "Mistral Voxtral");
    }

    #[test]
    fn test_default_model() {
        let provider = MistralProvider::new("test_key".to_string(), None);
        assert_eq!(provider.model, "voxtral-large-latest");
    }

    #[test]
    fn test_custom_model() {
        let provider =
            MistralProvider::new("test_key".to_string(), Some("voxtral-small-latest".to_string()));
        assert_eq!(provider.model, "voxtral-small-latest");
    }

    #[tokio::test]
    async fn test_empty_api_key() {
        let provider = MistralProvider::new("".to_string(), None);
        assert!(!provider.is_model_loaded().await);
    }
}
