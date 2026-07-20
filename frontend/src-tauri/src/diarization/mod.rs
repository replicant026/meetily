use std::collections::VecDeque;
use std::sync::Mutex;

pub mod clustering;
pub mod embedding;
use embedding::ensure_loaded;
pub mod offline;

pub const EMBEDDING_DIM: usize = 192;
pub const MAX_BUFFER_WINDOWS: usize = 2000;

#[derive(Debug, Clone)]
pub struct WindowedEmbedding {
    pub audio_start: f64,
    pub audio_end: f64,
    pub vec: Vec<f32>,
}

#[derive(Default)]
pub struct EmbeddingBuffer {
    inner: Mutex<VecDeque<WindowedEmbedding>>,
}

impl EmbeddingBuffer {
    pub fn push(&self, item: WindowedEmbedding) {
        let mut g = self.inner.lock().expect("embedding buffer lock");
        if g.len() >= MAX_BUFFER_WINDOWS {
            g.pop_front();
        }
        g.push_back(item);
    }

    pub fn drain(&self) -> Vec<WindowedEmbedding> {
        let mut g = self.inner.lock().expect("embedding buffer lock");
        std::mem::take(&mut *g).into()
    }

    pub fn len(&self) -> usize {
        self.inner.lock().expect("embedding buffer lock").len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn snapshot(&self) -> Vec<WindowedEmbedding> {
        self.inner
            .lock()
            .expect("embedding buffer lock")
            .iter()
            .cloned()
            .collect()
    }
}


#[cfg(test)]
mod tests;
mod tests_cluster;
#[derive(Default)]
pub struct DiarizationState {
    pub buffer: EmbeddingBuffer,
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiarizationStatus {
    pub enabled: bool,
    pub min_speakers: usize,
    pub max_speakers: usize,
    pub model_status: String,
}

static STATUS: once_cell::sync::Lazy<std::sync::Mutex<DiarizationStatus>> =
    once_cell::sync::Lazy::new(|| {
        std::sync::Mutex::new(DiarizationStatus {
            enabled: true,
            min_speakers: 2,
            max_speakers: 6,
            model_status: if ensure_loaded().is_ok() { "ready".to_string() } else { "loading".to_string() },
        })
    });

pub fn status() -> DiarizationStatus {
    STATUS.lock().expect("diarization status lock").clone()
}

pub fn update_status(next: DiarizationStatus) {
    let mut g = STATUS.lock().expect("diarization status lock");
    g.enabled = next.enabled;
    g.min_speakers = next.min_speakers.max(2);
    g.max_speakers = next.max_speakers.max(g.min_speakers);
    g.model_status = next.model_status;
}
