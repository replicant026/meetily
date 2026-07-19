use std::collections::VecDeque;
use std::sync::Mutex;

pub mod embedding;

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
}

#[derive(Default)]
pub struct DiarizationState {
    pub buffer: EmbeddingBuffer,
}
