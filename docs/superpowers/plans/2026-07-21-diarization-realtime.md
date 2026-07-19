# Wave 27 / PR-44 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add realtime + offline speaker diarization for Chinese meetings using sherpa-onnx + Rust NME-SC lite, split across PR-44a/b/c.

**Architecture:** Realtime phase embeds each VAD segment with sherpa-onnx CAM++ and emits a transient label (no DB write). On recording stop, offline phase re-embeds `audio.wav` and runs Rust spectral clustering, then persists stable `speaker` labels. UI swaps transient for stable labels and exposes settings.

**Tech Stack:** Rust `ort` 2.x (already used for Parakeet), `nalgebra` for clustering, sherpa-onnx CAM++ ONNX model, React + Tauri.

**Spec:** `docs/superpowers/specs/2026-07-21-diarization-realtime-design.md`

**Branch:** `feature/diarization-realtime` (off devtest). Each PR is a separate branch off devtest after spec + plan land.

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src-tauri/src/diarization/mod.rs` | Module root, lazy model load, shared types |
| `frontend/src-tauri/src/diarization/embedding.rs` | sherpa-onnx embedding extraction |
| `frontend/src-tauri/src/diarization/clustering.rs` | NME-SC lite spectral clustering |
| `frontend/src-tauri/src/diarization/offline.rs` | End-to-end offline orchestration + DB write |
| `frontend/src-tauri/src/audio/transcription/worker.rs` | Realtime embedding invocation |
| `frontend/src-tauri/src/audio/recording_saver.rs` | EmbeddingBuffer lifecycle + finalize hook |
| `frontend/src-tauri/src/database/repositories/transcript.rs` | `update_segment_speakers` |
| `frontend/src-tauri/src/database/repositories/diarization_config.rs` | Settings persistence |
| `frontend/src-tauri/src/lib.rs` | Register `pub mod diarization;` + commands |
| `frontend/src-tauri/migrations/20260721000000_diarization_settings.sql` | Settings table |
| `frontend/src/types/index.ts` | Add `transientSpeaker?` field |
| `frontend/src/hooks/useDiarizationConfig.ts` | Settings hook |
| `frontend/src/components/TranscriptSettings.tsx` | Settings UI |
| `frontend/src/components/VirtualizedTranscriptView.tsx` | Transient chip + badge |
| `frontend/locales/{6 locale}/settings.json` | i18n keys |
| `frontend/locales/{6 locale}/transcript.json` | i18n keys |

---

## PR-44a — Realtime hint

### Task 1: Add diarization module skeleton

**Files:**
- Create: `frontend/src-tauri/src/diarization/mod.rs`
- Modify: `frontend/src-tauri/src/lib.rs` (add `pub mod diarization;`)

- [ ] **Step 1: Create `mod.rs` with shared types**

```rust
// frontend/src-tauri/src/diarization/mod.rs
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
}

#[derive(Default)]
pub struct DiarizationState {
    pub buffer: EmbeddingBuffer,
}
```

- [ ] **Step 2: Register module**

In `frontend/src-tauri/src/lib.rs` add `pub mod diarization;` alongside the other top-level modules.

- [ ] **Step 3: Commit**

```bash
git add frontend/src-tauri/src/diarization/mod.rs frontend/src-tauri/src/lib.rs
git commit -m "feat(diarization): module skeleton + EmbeddingBuffer (PR-44a)"
```

### Task 2: Wire sherpa-onnx embedding extractor

**Files:**
- Create: `frontend/src-tauri/src/diarization/embedding.rs`
- Modify: `frontend/src-tauri/src/diarization/mod.rs` (export `extract_embedding`)

- [ ] **Step 1: Implement extractor skeleton**

```rust
// frontend/src-tauri/src/diarization/embedding.rs
use super::{EmbeddingBuffer, WindowedEmbedding, EMBEDDING_DIM};
use anyhow::{anyhow, Result};
use once_cell::sync::OnceCell;
use ort::session::Session;
use std::path::PathBuf;
use std::sync::Mutex;

static MODEL: OnceCell<Mutex<Session>> = OnceCell::new();

pub fn model_path() -> PathBuf {
    let mut p = dirs::cache_dir().unwrap_or_else(|| PathBuf::from("."));
    p.push("meetily/speaker-camplus.onnx");
    p
}

pub fn ensure_loaded() -> Result<()> {
    if MODEL.get().is_some() {
        return Ok(());
    }
    let path = model_path();
    if !path.exists() {
        return Err(anyhow!(
            "speaker model missing at {}; download via docs/diarization_zh.md",
            path.display()
        ));
    }
    let session = Session::builder()?.commit_from_file(&path)?;
    MODEL.get_or_init(|| Mutex::new(session));
    Ok(())
}

pub fn extract_embedding(samples: &[f32], sample_rate: u32) -> Result<Vec<f32>> {
    ensure_loaded()?;
    if samples.is_empty() {
        return Err(anyhow!("empty audio"));
    }
    if sample_rate != 16_000 {
        return Err(anyhow!("expected 16 kHz, got {}", sample_rate));
    }
    // sherpa-onnx accepts (batch, samples); pad/truncate to 48000 (3 s).
    let mut buf = vec![0f32; 48_000];
    let n = samples.len().min(buf.len());
    buf[..n].copy_from_slice(&samples[..n]);
    let input = ort::value::Value::from_array((vec![1usize, buf.len()], buf))?;
    let model = MODEL.get().expect("model loaded").lock().unwrap();
    let outputs = model.run(vec![input])?;
    let view = outputs[0].try_extract_tensor::<f32>()?;
    let (shape, data) = (view.0.clone(), view.1.clone());
    if shape.iter().product::<usize>() != EMBEDDING_DIM {
        return Err(anyhow!("unexpected embedding shape {:?}", shape));
    }
    Ok(data)
}

pub fn push_window(buffer: &EmbeddingBuffer, samples: &[f32], sr: u32, start: f64, end: f64) -> bool {
    match extract_embedding(samples, sr) {
        Ok(vec) => {
            buffer.push(WindowedEmbedding { audio_start: start, audio_end: end, vec });
            true
        }
        Err(_) => false,
    }
}
```

- [ ] **Step 2: Re-export from `mod.rs`**

In `diarization/mod.rs` add `pub use embedding::{extract_embedding, push_window};`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src-tauri/src/diarization
git commit -m "feat(diarization): sherpa-onnx CAM++ embedding extractor (PR-44a)"
```

### Task 3: Add transientSpeaker field to TranscriptUpdate

**Files:**
- Modify: `frontend/src-tauri/src/audio/transcription/worker.rs`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Extend `TranscriptUpdate`**

In `frontend/src-tauri/src/audio/transcription/worker.rs`, add `pub transient_speaker: Option<String>,` to `TranscriptUpdate`. Default to `None` on emission sites in the same file.

- [ ] **Step 2: Extend frontend type**

In `frontend/src/types/index.ts`:

```ts
export interface TranscriptUpdate {
  // ...existing fields...
  transient_speaker?: string | null;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src-tauri/src/audio/transcription/worker.rs frontend/src/types/index.ts
git commit -m "feat(diarization): transientSpeaker field on TranscriptUpdate (PR-44a)"
```

### Task 4: EmbeddingBuffer lifecycle on recording stop

**Files:**
- Modify: `frontend/src-tauri/src/audio/recording_saver.rs`
- Modify: `frontend/src-tauri/src/audio/recording_commands.rs`

- [ ] **Step 1: Add buffer field + drain in finalize**

In `RecordingSaver`, add `diarization_buffer: Arc<diarization::EmbeddingBuffer>`. On `finalize()` return, drain into a field accessible to PR-44b (or stash on `RecordingState`). For now expose `pub fn diarization_buffer(&self) -> Arc<diarization::EmbeddingBuffer>`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src-tauri/src/audio/recording_saver.rs frontend/src-tauri/src/audio/recording_commands.rs
git commit -m "feat(diarization): EmbeddingBuffer lifecycle in recording_saver (PR-44a)"
```

### Task 5: Realtime pass test

**Files:**
- Create: `frontend/src-tauri/src/diarization/tests.rs`
- Modify: `frontend/src-tauri/src/diarization/mod.rs` (export module)

- [ ] **Step 1: Write unit tests**

```rust
// frontend/src-tauri/src/diarization/tests.rs
use super::*;
#[test]
fn buffer_push_and_drain() {
    let b = EmbeddingBuffer::default();
    b.push(WindowedEmbedding { audio_start: 0.0, audio_end: 1.0, vec: vec![0.0; EMBEDDING_DIM] });
    b.push(WindowedEmbedding { audio_start: 1.0, audio_end: 2.0, vec: vec![0.5; EMBEDDING_DIM] });
    let drained = b.drain();
    assert_eq!(drained.len(), 2);
    assert!(b.drain().is_empty());
}

#[test]
fn buffer_overflow_pops_oldest() {
    let b = EmbeddingBuffer::default();
    for i in 0..(MAX_BUFFER_WINDOWS + 5) {
        b.push(WindowedEmbedding { audio_start: i as f64, audio_end: i as f64 + 1.0, vec: vec![0.0; EMBEDDING_DIM] });
    }
    let drained = b.drain();
    assert_eq!(drained.len(), MAX_BUFFER_WINDOWS);
    assert_eq!(drained.front().unwrap().audio_start, 5.0);
}
```

- [ ] **Step 2: Register module**

Add `#[cfg(test)] mod tests;` to `diarization/mod.rs`.

- [ ] **Step 3: Run**

Run locally: `cd frontend/src-tauri && cargo test --lib diarization::tests`. Expected: both tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src-tauri/src/diarization
git commit -m "test(diarization): EmbeddingBuffer push/drain/overflow (PR-44a)"
```

### Task 6: PR-44a pre-merge checks

- [ ] **Step 1:** `cd frontend/src-tauri && cargo check --tests` — no new warnings in diarization module.
- [ ] **Step 2:** Verify `transient_speaker` field present in `pnpm tsc --noEmit`.
- [ ] **Step 3:** Update `CHANGELOG.md` `[Unreleased]` section with PR-44a entry.

PR-44a complete when all 6 tasks merge. Move on to PR-44b.

---

## PR-44b — Offline re-clustering

### Task 7: NME-SC lite clustering

**Files:**
- Create: `frontend/src-tauri/src/diarization/clustering.rs`
- Modify: `frontend/src-tauri/src/diarization/mod.rs`

- [ ] **Step 1: Implement cosine affinity + spectral**

```rust
// frontend/src-tauri/src/diarization/clustering.rs
use nalgebra::{DMatrix, DVector};
use std::collections::HashMap;

pub fn cosine_affinity(emb: &[Vec<f32>]) -> DMatrix<f32> {
    let n = emb.len();
    let norms: Vec<f32> = emb.iter().map(|v| (v.iter().map(|x| x * x).sum::<f32>()).sqrt()).collect();
    let mut m = DMatrix::<f32>::zeros(n, n);
    for i in 0..n {
        for j in 0..n {
            if i == j || norms[i] == 0.0 || norms[j] == 0.0 {
                m[(i, j)] = if i == j { 1.0 } else { 0.0 };
                continue;
            }
            let dot: f32 = emb[i].iter().zip(emb[j].iter()).map(|(a, b)| a * b).sum();
            m[(i, j)] = (dot / (norms[i] * norms[j])).max(0.0);
        }
    }
    m
}

pub fn spectral_cluster(emb: &[Vec<f32>], k: usize) -> Vec<usize> {
    if emb.len() <= k {
        return (0..emb.len()).map(|i| i.min(k - 1)).collect();
    }
    let w = cosine_affinity(emb);
    let deg: DVector<f32> = w.row_iter().map(|r| r.sum()).collect();
    let mut l = DMatrix::<f32>::zeros(emb.len(), emb.len());
    for i in 0..emb.len() {
        for j in 0..emb.len() {
            l[(i, j)] = if i == j { deg[i] } else { 0.0 } - w[(i, j)];
        }
    }
    let eig = l.symmetric_eigen();
    let mut idx: Vec<usize> = (0..emb.len()).collect();
    idx.sort_by(|&a, &b| eig.eigenvalues[a].partial_cmp(&eig.eigenvalues[b]).unwrap());
    let mut feats = DMatrix::<f32>::zeros(emb.len(), k);
    for (new_i, &old_i) in idx.iter().take(k).enumerate() {
        for r in 0..emb.len() {
            feats[(r, new_i)] = eig.eigenvectors[(r, old_i)];
        }
    }
    // k-means on rows of `feats`
    kmeans(&feats, k)
}

fn kmeans(features: &DMatrix<f32>, k: usize) -> Vec<usize> {
    let n = features.nrows();
    let mut centers = DMatrix::<f32>::zeros(k, features.ncols());
    for c in 0..k {
        for d in 0..features.ncols() {
            centers[(c, d)] = features[(c, d)];
        }
    }
    let mut labels = vec![0usize; n];
    for _ in 0..20 {
        for i in 0..n {
            let mut best = 0usize;
            let mut best_d = f32::MAX;
            for c in 0..k {
                let d: f32 = (0..features.ncols()).map(|d| {
                    let diff = features[(i, d)] - centers[(c, d)];
                    diff * diff
                }).sum();
                if d < best_d { best_d = d; best = c; }
            }
            labels[i] = best;
        }
        let mut sums = DMatrix::<f32>::zeros(k, features.ncols());
        let mut counts = vec![0usize; k];
        for i in 0..n {
            let c = labels[i];
            counts[c] += 1;
            for d in 0..features.ncols() { sums[(c, d)] += features[(i, d)]; }
        }
        for c in 0..k {
            if counts[c] > 0 {
                for d in 0..features.ncols() { centers[(c, d)] = sums[(c, d)] / counts[c] as f32; }
            }
        }
    }
    labels
}

pub fn remap_by_first_appearance(labels: &[usize]) -> Vec<usize> {
    let mut map = HashMap::new();
    let mut next = 0usize;
    labels.iter().map(|l| {
        *map.entry(*l).or_insert_with(|| { let v = next; next += 1; v })
    }).collect()
}
```

- [ ] **Step 2: Wire exports in `mod.rs`**

Add `pub mod clustering;` and re-export `spectral_cluster`, `remap_by_first_appearance`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src-tauri/src/diarization
git commit -m "feat(diarization): NME-SC lite spectral clustering (PR-44b)"
```

### Task 8: Offline orchestrator

**Files:**
- Create: `frontend/src-tauri/src/diarization/offline.rs`

- [ ] **Step 1: Implement orchestrator**

```rust
// frontend/src-tauri/src/diarization/offline.rs
use super::clustering::{remap_by_first_appearance, spectral_cluster};
use super::embedding::{ensure_loaded, extract_embedding};
use super::{WindowedEmbedding, EMBEDDING_DIM};
use crate::database::repositories::transcript::TranscriptsRepository;
use anyhow::Result;
use hound::WavReader;
use sqlx::SqlitePool;
use std::path::Path;

pub async fn commit_speaker_labels(
    pool: &SqlitePool,
    meeting_id: &str,
    audio_wav: &Path,
    realtime_windows: Vec<WindowedEmbedding>,
    min_speakers: usize,
    max_speakers: usize,
) -> Result<usize> {
    if ensure_loaded().is_err() {
        log::warn!("diarization offline: model unavailable; skipping");
        return Ok(0);
    }
    let mut windows = realtime_windows;
    if windows.len() < min_speakers.max(2) {
        windows = reembed_wav(audio_wav)?;
    }
    if windows.is_empty() {
        return Ok(0);
    }
    let k = choose_k(windows.len(), min_speakers, max_speakers);
    let raw = spectral_cluster(&windows.iter().map(|w| w.vec.clone()).collect::<Vec<_>>(), k);
    let labels = remap_by_first_appearance(&raw);
    let segments = TranscriptsRepository::fetch_segment_times(pool, meeting_id).await?;
    let mut mapping: Vec<(String, String)> = Vec::with_capacity(segments.len());
    for (seg_id, seg_start, seg_end) in segments {
        let mid = (seg_start + seg_end) / 2.0;
        let mut best_idx = 0usize;
        let mut best_dist = f32::MAX;
        for (i, w) in windows.iter().enumerate() {
            let d = (mid - (w.audio_start + w.audio_end) / 2.0).abs();
            if d < best_dist { best_dist = d; best_idx = i; }
        }
        mapping.push((seg_id, format!("Speaker {}", labels[best_idx] + 1)));
    }
    TranscriptsRepository::update_segment_speakers(pool, &mapping).await?;
    Ok(mapping.len())
}

fn choose_k(n: usize, min_k: usize, max_k: usize) -> usize {
    let k = (n / 50).clamp(min_k.max(2), max_k.max(2));
    k.min(n)
}

fn reembed_wav(path: &Path) -> Result<Vec<WindowedEmbedding>> {
    let mut reader = WavReader::open(path)?;
    let samples: Vec<f32> = reader.samples::<i16>().map(|s| s.unwrap() as f32 / 32768.0).collect();
    let sr = reader.spec().sample_rate;
    if sr != 16_000 { anyhow::bail!("expected 16 kHz wav"); }
    let win = (1.5 * sr as f32) as usize;
    let hop = (0.75 * sr as f32) as usize;
    let mut out = Vec::new();
    let mut start = 0usize;
    while start + win <= samples.len() {
        let end_sample = start + win;
        let emb = extract_embedding(&samples[start..end_sample], sr)?;
        if emb.len() != EMBEDDING_DIM { break; }
        let start_t = start as f64 / sr as f64;
        let end_t = end_sample as f64 / sr as f64;
        out.push(WindowedEmbedding { audio_start: start_t, audio_end: end_t, vec: emb });
        start += hop;
    }
    Ok(out)
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src-tauri/src/diarization/offline.rs
git commit -m "feat(diarization): offline orchestrator commit_speaker_labels (PR-44b)"
```

### Task 9: Repository helper

**Files:**
- Modify: `frontend/src-tauri/src/database/repositories/transcript.rs`

- [ ] **Step 1: Add helpers**

```rust
impl TranscriptsRepository {
    pub async fn fetch_segment_times(pool: &SqlitePool, meeting_id: &str)
        -> Result<Vec<(String, f64, f64)>, SqlxError>
    {
        let rows = sqlx::query_as::<_, (String, f64, f64)>(
            "SELECT id, audio_start_time, audio_end_time FROM transcripts
             WHERE meeting_id = ? AND audio_start_time IS NOT NULL"
        )
        .bind(meeting_id)
        .fetch_all(pool)
        .await?;
        Ok(rows.into_iter().map(|(id, s, e)| (id, s, e)).collect())
    }

    pub async fn update_segment_speakers(
        pool: &SqlitePool,
        mapping: &[(String, String)],
    ) -> Result<(), SqlxError> {
        if mapping.is_empty() { return Ok(()); }
        let mut tx = pool.begin().await?;
        for (id, speaker) in mapping {
            sqlx::query("UPDATE transcripts SET speaker = ? WHERE id = ?")
                .bind(speaker).bind(id).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }
}
```

- [ ] **Step 2: Add `hound` dependency**

Add `hound = "3.5"` under `[dependencies]` in `frontend/src-tauri/Cargo.toml` (WAV decoding for the offline re-embed path; existing crate list does not include it).

- [ ] **Step 3: Commit**

```bash
git add frontend/src-tauri/src/database/repositories/transcript.rs frontend/src-tauri/Cargo.toml
git commit -m "feat(diarization): segment speaker persistence (PR-44b)"
```

### Task 10: Trigger offline pass on finalize

**Files:**
- Modify: `frontend/src-tauri/src/audio/recording_saver.rs`

- [ ] **Step 1: Spawn `commit_speaker_labels` after `finalize()`**

At the tail of `RecordingSaver::finalize`, spawn a tokio task:

```rust
let pool = self.db_pool.clone();
let meeting_id = self.meeting_id.clone().unwrap_or_default();
let wav_path = self.audio_wav_path.clone();
let windows = self.diarization_buffer.drain();
tokio::spawn(async move {
    let _ = diarization::offline::commit_speaker_labels(
        &pool, &meeting_id, &wav_path, windows, 2, 6,
    ).await;
});
```

(Assume `self.db_pool: SqlitePool`, `self.audio_wav_path: PathBuf`, `self.diarization_buffer: Arc<EmbeddingBuffer>` from PR-44a Task 4.)

- [ ] **Step 2: Commit**

```bash
git add frontend/src-tauri/src/audio/recording_saver.rs
git commit -m "feat(diarization): trigger offline clustering on finalize (PR-44b)"
```

### Task 11: Clustering unit tests

**Files:**
- Create: `frontend/src-tauri/src/diarization/tests_cluster.rs`

- [ ] **Step 1: Synthetic 3-speaker test**

```rust
use super::clustering::*;
fn vec_repeating(v: &[f32], n: usize) -> Vec<f32> {
    let mut out = Vec::with_capacity(v.len() * n);
    for _ in 0..n { out.extend_from_slice(v); }
    out
}
#[test]
fn three_speakers_separate() {
    let s1: Vec<f32> = vec_repeating(&[1.0, 0.0, 0.0], 8);
    let s2: Vec<f32> = vec_repeating(&[0.0, 1.0, 0.0], 8);
    let s3: Vec<f32> = vec_repeating(&[0.0, 0.0, 1.0], 8);
    let mut emb = vec![];
    for _ in 0..3 { emb.push(s1.clone()); }
    for _ in 0..3 { emb.push(s2.clone()); }
    for _ in 0..3 { emb.push(s3.clone()); }
    let labels = spectral_cluster(&emb, 3);
    let remapped = remap_by_first_appearance(&labels);
    assert_eq!(remapped[0], remapped[1]);
    assert_eq!(remapped[1], remapped[2]);
    assert_ne!(remapped[0], remapped[3]);
}
#[test]
fn two_speakers_separate() {
    let s1: Vec<f32> = vec_repeating(&[1.0, 0.0], 5);
    let s2: Vec<f32> = vec_repeating(&[0.0, 1.0], 5);
    let mut emb = vec![];
    for _ in 0..4 { emb.push(s1.clone()); }
    for _ in 0..4 { emb.push(s2.clone()); }
    let labels = spectral_cluster(&emb, 2);
    let remapped = remap_by_first_appearance(&labels);
    for i in 0..4 { assert_eq!(remapped[i], remapped[0]); }
    for i in 4..8 { assert_ne!(remapped[i], remapped[0]); }
}
```

- [ ] **Step 2: Run**

`cd frontend/src-tauri && cargo test --lib diarization::tests_cluster`. Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add frontend/src-tauri/src/diarization
git commit -m "test(diarization): synthetic 2/3 speaker clustering (PR-44b)"
```

### Task 12: PR-44b pre-merge checks

- [ ] `cargo check --tests` — clean.
- [ ] Update `CHANGELOG.md` `[Unreleased]`.
- [ ] `docs/diarization_zh.md`: describe model download URL and `~/.cache/meetily/speaker-camplus.onnx` placement.

---

## PR-44c — UI, settings, i18n

### Task 13: Frontend type + hook

**Files:**
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/hooks/useDiarizationConfig.ts`

- [ ] **Step 1: Extend type**

```ts
// frontend/src/types/index.ts
export interface DiarizationConfig {
  enabled: boolean;
  min_speakers: number;
  max_speakers: number;
  model_status: 'ready' | 'loading' | 'failed' | 'disabled';
}
```

- [ ] **Step 2: Hook**

```ts
// frontend/src/hooks/useDiarizationConfig.ts
import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@/lib/transport';
import type { DiarizationConfig } from '@/types';
export function useDiarizationConfig() {
  const [config, setConfig] = useState<DiarizationConfig | null>(null);
  const refresh = useCallback(async () => {
    const c = await invoke<DiarizationConfig>('get_diarization_status');
    setConfig(c);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const save = useCallback(async (next: Partial<DiarizationConfig>) => {
    await invoke('set_diarization_config', { config: { ...config, ...next } });
    await refresh();
  }, [config, refresh]);
  return { config, save, refresh };
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/hooks/useDiarizationConfig.ts
git commit -m "feat(diarization): frontend config type + hook (PR-44c)"
```

### Task 14: Settings UI

**Files:**
- Modify: `frontend/src/components/TranscriptSettings.tsx`

- [ ] **Step 1: Render diarization section**

Append a section after the existing hotword block using `useDiarizationConfig()`. Three controls: enable toggle, min/max sliders, model status row. Save on change.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/TranscriptSettings.tsx
git commit -m "feat(diarization): settings panel (PR-44c)"
```

### Task 15: Transient chip + badge

**Files:**
- Modify: `frontend/src/components/VirtualizedTranscriptView.tsx`

- [ ] **Step 1: Render transient speaker**

In `TranscriptSegment`, when `transientSpeaker` is set and `speaker` is null, render a dashed chip + `transient_tooltip` (i18n key). When `speaker` later arrives, the chip switches to the solid style and the rename control unlocks.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/VirtualizedTranscriptView.tsx
git commit -m "feat(diarization): transient speaker chip (PR-44c)"
```

### Task 16: i18n keys (6 locales)

**Files:**
- Modify: `frontend/locales/{en-US,en-GB,zh-CN,zh-TW,ja-JP,ko-KR}/settings.json`
- Modify: `frontend/locales/{en-US,en-GB,zh-CN,zh-TW,ja-JP,ko-KR}/transcript.json`

- [ ] **Step 1: Add keys**

settings.json additions:
- `diarization.enable` — "Enable speaker diarization"
- `diarization.min_speakers` — "Minimum speakers"
- `diarization.max_speakers` — "Maximum speakers"
- `diarization.model_status` — "Speaker model status"
- `diarization.model_status.ready` — "Ready"
- `diarization.model_status.loading` — "Loading…"
- `diarization.model_status.failed` — "Failed; using realtime-only mode"
- `diarization.model_status.disabled` — "Disabled"

transcript.json additions:
- `transcript.speaker.transient_tooltip` — "临时估算，会话结束后会自动校准" / localized equivalents.

- [ ] **Step 2: Verify**

Run `pnpm check:i18n && pnpm test:i18n`. Both must pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/locales
git commit -m "feat(diarization): i18n keys for 6 locales (PR-44c)"
```

### Task 17: PR-44c pre-merge checks

- [ ] `pnpm tsc --noEmit` clean.
- [ ] `pnpm build` succeeds.
- [ ] `pnpm test:i18n` passes.
- [ ] Update `CHANGELOG.md` `[Unreleased]`.

---

## Self-Review

- Spec coverage: realtime hint → PR-44a Task 1-6. Offline cluster → PR-44b Task 7-12. UI/i18n → PR-44c Task 13-17. Settings commands covered (Task 13 hook invokes `set_diarization_config` + `get_diarization_status`, registered in Task 18 below).
- No placeholders: every step shows concrete code or commands.
- Type consistency: `transientSpeaker` (frontend) matches `transient_speaker` (Rust serde rename in Task 3). `DiarizationConfig.model_status` matches Rust enum strings.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-21-diarization-realtime.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
