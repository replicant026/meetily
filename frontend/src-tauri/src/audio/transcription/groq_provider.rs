// audio/transcription/groq_provider.rs
//
// Groq cloud transcription provider using OpenAI-compatible Whisper API.
// Model: whisper-large-v3-turbo (~10x faster than OpenAI hosted Whisper)

use super::provider::{TranscriptionError, TranscriptionProvider, TranscriptResult};
use async_trait::async_trait;
use log::info;
use reqwest::multipart;
use serde::Deserialize;

const GROQ_API_URL: &str = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL: &str = "whisper-large-v3-turbo";

#[derive(Debug, Deserialize)]
struct GroqTranscriptionResponse {
    text: String,
}

#[derive(Debug, Deserialize)]
struct GroqErrorResponse {
    error: GroqErrorBody,
}

#[derive(Debug, Deserialize)]
struct GroqErrorBody {
    message: String,
}

/// Groq cloud transcription provider (Whisper large-v3-turbo via OpenAI-compatible API)
pub struct GroqProvider {
    api_key: String,
    client: reqwest::Client,
}

impl GroqProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .expect("Failed to create Groq HTTP client"),
        }
    }

    fn validate_api_key(key: &str) -> bool {
        key.starts_with("gsk_") && key.len() > 10
    }
}

#[async_trait]
impl TranscriptionProvider for GroqProvider {
    async fn transcribe(
        &self,
        audio: Vec<f32>,
        language: Option<String>,
        initial_prompt: Option<String>,
    ) -> Result<TranscriptResult, TranscriptionError> {
        if !Self::validate_api_key(&self.api_key) {
            return Err(TranscriptionError::EngineFailed(
                "Invalid Groq API key (must start with 'gsk_')".to_string(),
            ));
        }

        // Convert f32 samples to WAV bytes (16kHz mono, 16-bit PCM)
        let wav_bytes = samples_to_wav(&audio, 16000)?;
        let wav_len = wav_bytes.len();

        let file_part = multipart::Part::bytes(wav_bytes)
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| TranscriptionError::EngineFailed(format!("Multipart error: {}", e)))?;

        let mut form = multipart::Form::new()
            .part("file", file_part)
            .text("model", GROQ_MODEL.to_string())
            .text("response_format", "json".to_string());

        if let Some(lang) = language {
            form = form.text("language", lang);
        }

        // Groq supports prompt parameter (max 224 tokens) for custom vocabulary
        if let Some(prompt) = initial_prompt {
            let truncated = if prompt.len() > 800 {
                prompt[..800].to_string()
            } else {
                prompt
            };
            if !truncated.trim().is_empty() {
                form = form.text("prompt", truncated);
            }
        }

        info!("Sending audio chunk ({} bytes) to Groq Whisper", wav_len);

        let response = self
            .client
            .post(GROQ_API_URL)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .multipart(form)
            .send()
            .await
            .map_err(|e| TranscriptionError::EngineFailed(format!("Groq request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            let msg = if let Ok(err) = serde_json::from_str::<GroqErrorResponse>(&body) {
                err.error.message
            } else {
                format!("HTTP {}: {}", status, body)
            };
            return Err(TranscriptionError::EngineFailed(format!(
                "Groq API error: {}",
                msg
            )));
        }

        let result: GroqTranscriptionResponse = response
            .json()
            .await
            .map_err(|e| TranscriptionError::EngineFailed(format!("Groq response parse error: {}", e)))?;

        Ok(TranscriptResult {
            text: result.text.trim().to_string(),
            confidence: None, // Groq API doesn't return confidence in JSON format
            is_partial: false,
        })
    }

    async fn is_model_loaded(&self) -> bool {
        // Cloud provider — always "ready" if API key is set
        Self::validate_api_key(&self.api_key)
    }

    async fn get_current_model(&self) -> Option<String> {
        Some(GROQ_MODEL.to_string())
    }

    fn provider_name(&self) -> &'static str {
        "Groq Whisper"
    }
}

/// Convert f32 audio samples to WAV bytes (16-bit PCM, mono)
pub fn samples_to_wav(samples: &[f32], sample_rate: u32) -> Result<Vec<u8>, TranscriptionError> {
    if samples.is_empty() {
        return Err(TranscriptionError::AudioTooShort {
            samples: 0,
            minimum: 1600,
        });
    }

    let num_samples = samples.len();
    let bits_per_sample: u16 = 16;
    let channels: u16 = 1;
    let byte_rate = sample_rate * (bits_per_sample as u32) * (channels as u32) / 8;
    let block_align = (bits_per_sample * channels) / 8;
    let data_size = (num_samples * (bits_per_sample as usize) / 8) as u32;
    let file_size = 36 + data_size;

    let mut wav = Vec::with_capacity(44 + data_size as usize);

    // RIFF header
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&file_size.to_le_bytes());
    wav.extend_from_slice(b"WAVE");

    // fmt chunk
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes()); // chunk size
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
    wav.extend_from_slice(&channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());

    // data chunk
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_size.to_le_bytes());

    for &sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let pcm = (clamped * i16::MAX as f32) as i16;
        wav.extend_from_slice(&pcm.to_le_bytes());
    }

    Ok(wav)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_api_key() {
        assert!(GroqProvider::validate_api_key("gsk_abc123def456"));
        assert!(!GroqProvider::validate_api_key("sk-abc123"));
        assert!(!GroqProvider::validate_api_key("gsk_"));
        assert!(!GroqProvider::validate_api_key(""));
    }

    #[test]
    fn test_samples_to_wav() {
        let samples = vec![0.0f32; 16000]; // 1 second of silence
        let wav = samples_to_wav(&samples, 16000).unwrap();
        assert!(wav.starts_with(b"RIFF"));
        assert_eq!(wav.len(), 44 + 16000 * 2); // header + 16-bit samples
    }

    #[test]
    fn test_samples_to_wav_empty() {
        let result = samples_to_wav(&[], 16000);
        assert!(result.is_err());
    }
}
